/**
 * Background Audio Preloader Service for Edo Language Studio
 *
 * Automatically downloads, validates, and caches permitted recordings quietly in the background
 * across Studio App and Children's Library with bounded concurrency.
 *
 * Ensures:
 * - Green dot is displayed ONLY when an audio recording is fully cached and ready to play.
 * - Prioritizes on-screen visible items.
 * - Uses shared session memory for 0ms immediate playback.
 * - Uses persistent storage so audio survives app restarts.
 * - Pauses during user microphone recording so recording remains 100% glitch-free.
 * - Removes old audio on replacement or deletion.
 */

import { EdoEntry } from '../types/edo';
import {
  getCachedSessionAudio,
  setCachedSessionAudio,
  invalidateSessionAudio,
  setRecordingLifecycleHandlers,
  setAudioInvalidationHandler
} from './audioService';
import {
  readLibrarySnapshot,
  writeLibrarySnapshot,
  deleteLibrarySnapshot
} from './localLibraryStore';
import { streamAudioFromGateway } from './cloudSyncService';

export type AudioStatus = 'ready' | 'downloading' | 'failed' | 'pending' | 'none';

export type AudioStreamDownloader = (fileId: string) => Promise<{ ok: boolean; audioDataUrl?: string; error?: string }>;

export interface PreloadOptions {
  downloader?: AudioStreamDownloader;
  persistToStorage?: boolean;
}

// State registries
const readyAudioKeys = new Set<string>();
const downloadingAudioKeys = new Set<string>();
const failedAudioKeys = new Set<string>();
const listeners = new Set<() => void>();

// Queue management
const preloadQueue: string[] = [];
const queuedSet = new Set<string>();
const fileOptionsMap = new Map<string, { persistToStorage: boolean; downloader?: AudioStreamDownloader }>();
let activeDownloads = 0;
const MAX_CONCURRENT_DOWNLOADS = 2;
let isPaused = false;
let throttleTimer: number | null = null;
let isInvalidatingInternally = false;

let defaultDownloader: AudioStreamDownloader = async (fileId: string) => {
  return streamAudioFromGateway(fileId);
};

export function setCustomAudioDownloader(downloader: AudioStreamDownloader): void {
  defaultDownloader = downloader;
}

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      console.warn('Error in audio readiness listener:', err);
    }
  }
}

/**
 * Returns whether a recording is fully downloaded, validated, and ready to play.
 */
export function isAudioReady(fileId: string): boolean {
  if (!fileId) return false;
  return readyAudioKeys.has(fileId) || Boolean(getCachedSessionAudio(fileId));
}

/**
 * Returns whether a recording is actively downloading.
 */
export function isAudioDownloading(fileId: string): boolean {
  if (!fileId) return false;
  return downloadingAudioKeys.has(fileId);
}

/**
 * Returns whether a download previously failed.
 */
export function isAudioFailed(fileId: string): boolean {
  if (!fileId) return false;
  return failedAudioKeys.has(fileId);
}

/**
 * Returns detailed audio status for an entry.
 */
export function getAudioReadinessStatus(fileId: string): AudioStatus {
  if (!fileId) return 'none';
  if (isAudioReady(fileId)) return 'ready';
  if (isAudioDownloading(fileId)) return 'downloading';
  if (isAudioFailed(fileId)) return 'failed';
  if (queuedSet.has(fileId)) return 'pending';
  return 'none';
}

/**
 * Subscribes to readiness changes. Returns an unsubscribe function.
 */
export function subscribeAudioReadiness(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Manually marks an audio recording as ready and caches it.
 */
export function markAudioReady(fileId: string, audioDataUrl?: string): void {
  if (!fileId) return;
  readyAudioKeys.add(fileId);
  downloadingAudioKeys.delete(fileId);
  failedAudioKeys.delete(fileId);
  queuedSet.delete(fileId);
  if (audioDataUrl) {
    setCachedSessionAudio(fileId, audioDataUrl);
  }
  notifyListeners();
}

/**
 * Invalidates cached audio and resets readiness state on replacement or deletion.
 */
export function invalidateAudioPreload(fileId: string): void {
  if (!fileId) return;
  readyAudioKeys.delete(fileId);
  downloadingAudioKeys.delete(fileId);
  failedAudioKeys.delete(fileId);
  queuedSet.delete(fileId);
  fileOptionsMap.delete(fileId);
  const qIdx = preloadQueue.indexOf(fileId);
  if (qIdx !== -1) preloadQueue.splice(qIdx, 1);

  if (!isInvalidatingInternally) {
    isInvalidatingInternally = true;
    try {
      invalidateSessionAudio(fileId);
    } finally {
      isInvalidatingInternally = false;
    }
  }

  void deleteLibrarySnapshot('edo_community_audio_' + fileId).catch(() => {});
  notifyListeners();
}

/**
 * Clears all preloader state (for tests and resets).
 */
export function clearAudioPreloadState(): void {
  readyAudioKeys.clear();
  downloadingAudioKeys.clear();
  failedAudioKeys.clear();
  preloadQueue.length = 0;
  queuedSet.clear();
  fileOptionsMap.clear();
  activeDownloads = 0;
  if (throttleTimer) {
    clearTimeout(throttleTimer);
    throttleTimer = null;
  }
  notifyListeners();
}

/**
 * Pauses background audio downloads (e.g. while microphone is active).
 */
export function pauseBackgroundAudioLoading(): void {
  isPaused = true;
}

/**
 * Resumes background audio downloads.
 */
export function resumeBackgroundAudioLoading(): void {
  if (isPaused) {
    isPaused = false;
    processPreloadQueue();
  }
}

/**
 * Moves on-screen or user-selected audio file IDs to the head of the download queue.
 */
export function prioritizeAudioPreload(fileIds: string[]): void {
  if (!fileIds || fileIds.length === 0) return;
  const toPrioritize: string[] = [];

  for (const id of fileIds) {
    if (!id || isAudioReady(id) || downloadingAudioKeys.has(id)) continue;
    toPrioritize.push(id);
    queuedSet.add(id);
  }

  if (toPrioritize.length === 0) return;

  // Remove existing occurrences from the queue, then prepend
  for (const id of toPrioritize) {
    const idx = preloadQueue.indexOf(id);
    if (idx !== -1) preloadQueue.splice(idx, 1);
  }

  preloadQueue.unshift(...toPrioritize);
  processPreloadQueue();
}

/**
 * Enqueues permitted lesson entries for quiet background downloading.
 */
export function startBackgroundAudioLoading(
  entries: EdoEntry[],
  downloaderOrOptions?: AudioStreamDownloader | PreloadOptions,
  maybeOptions?: PreloadOptions
): void {
  if (!entries || entries.length === 0) return;

  let downloader: AudioStreamDownloader | undefined;
  let options: PreloadOptions | undefined;

  if (typeof downloaderOrOptions === 'function') {
    downloader = downloaderOrOptions;
    options = maybeOptions;
  } else if (downloaderOrOptions && typeof downloaderOrOptions === 'object') {
    options = downloaderOrOptions;
    downloader = options.downloader;
  }

  const persistToStorage = options?.persistToStorage ?? true;
  const eligibleFileIds: string[] = [];

  for (const entry of entries) {
    if (!entry || !entry.hasAudio || !entry.cloudAudioFileId) continue;
    if (entry.playbackPermission === 'denied') continue;
    const fileId = entry.cloudAudioFileId;

    fileOptionsMap.set(fileId, { persistToStorage, downloader });

    // Check if already ready in session cache
    if (getCachedSessionAudio(fileId)) {
      readyAudioKeys.add(fileId);
      continue;
    }

    if (!readyAudioKeys.has(fileId) && !queuedSet.has(fileId) && !downloadingAudioKeys.has(fileId)) {
      eligibleFileIds.push(fileId);
      queuedSet.add(fileId);
    }
  }

  if (eligibleFileIds.length > 0) {
    preloadQueue.push(...eligibleFileIds);
    // Fast-path: Check persistent storage asynchronously for items that allow persistent storage
    if (persistToStorage) {
      void checkPersistentStorageBatch(eligibleFileIds);
    }
  }

  processPreloadQueue();
}

/**
 * Rapidly checks persistent device storage (IndexedDB) for previously downloaded audio.
 */
async function checkPersistentStorageBatch(fileIds: string[]): Promise<void> {
  let changed = false;
  for (const id of fileIds) {
    const opts = fileOptionsMap.get(id);
    if (opts && opts.persistToStorage === false) continue;
    try {
      const stored = await readLibrarySnapshot('edo_community_audio_' + id);
      if (stored && typeof stored === 'string' && stored.startsWith('data:audio/')) {
        setCachedSessionAudio(id, stored);
        readyAudioKeys.add(id);
        queuedSet.delete(id);
        const qIdx = preloadQueue.indexOf(id);
        if (qIdx !== -1) preloadQueue.splice(qIdx, 1);
        changed = true;
      }
    } catch {
      // Ignore individual persistent storage errors
    }
  }
  if (changed) {
    notifyListeners();
    processPreloadQueue();
  }
}

/**
 * Main queue worker: processes queue with limited concurrency and gentle throttling.
 */
function processPreloadQueue(): void {
  if (isPaused) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  while (activeDownloads < MAX_CONCURRENT_DOWNLOADS && preloadQueue.length > 0) {
    const fileId = preloadQueue.shift();
    if (!fileId) break;
    queuedSet.delete(fileId);

    // If already ready, continue
    if (isAudioReady(fileId)) continue;

    const opts = fileOptionsMap.get(fileId);
    const persistToStorage = opts?.persistToStorage ?? true;
    const downloader = opts?.downloader || defaultDownloader;

    activeDownloads++;
    downloadingAudioKeys.add(fileId);
    failedAudioKeys.delete(fileId);
    notifyListeners();

    void (async () => {
      try {
        // Step 1: Check persistent storage before making network call (if allowed)
        if (persistToStorage) {
          const stored = await readLibrarySnapshot('edo_community_audio_' + fileId);
          if (stored && typeof stored === 'string' && stored.startsWith('data:audio/')) {
            setCachedSessionAudio(fileId, stored);
            readyAudioKeys.add(fileId);
            downloadingAudioKeys.delete(fileId);
            notifyListeners();
            return;
          }
        }

        // Step 2: Download audio stream from gateway
        const result = await downloader(fileId);
        if (result.ok && result.audioDataUrl && result.audioDataUrl.startsWith('data:audio/')) {
          setCachedSessionAudio(fileId, result.audioDataUrl);
          // Persist to storage in background if enabled
          if (persistToStorage) {
            void writeLibrarySnapshot('edo_community_audio_' + fileId, result.audioDataUrl).catch(() => {});
          }
          readyAudioKeys.add(fileId);
          failedAudioKeys.delete(fileId);
        } else {
          failedAudioKeys.add(fileId);
        }
      } catch {
        failedAudioKeys.add(fileId);
      } finally {
        downloadingAudioKeys.delete(fileId);
        activeDownloads--;
        notifyListeners();

        // Gentle 150ms delay between download completions to keep mobile UI completely responsive
        if (!throttleTimer) {
          throttleTimer = window.setTimeout(() => {
            throttleTimer = null;
            processPreloadQueue();
          }, 150);
        }
      }
    })();
  }
}

// Hook into MicrophoneRecorder lifecycle to pause downloads while recording
setRecordingLifecycleHandlers(pauseBackgroundAudioLoading, resumeBackgroundAudioLoading);

// Hook into session audio cache invalidation to keep preloader state and UI synchronized
setAudioInvalidationHandler((fileId: string) => {
  if (!isInvalidatingInternally) {
    invalidateAudioPreload(fileId);
  }
});
