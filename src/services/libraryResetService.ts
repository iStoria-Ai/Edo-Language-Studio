import { Preferences } from '@capacitor/preferences';
import { CommunitySnapshot } from './communityLibrary';
import { deleteLibrarySnapshot, listLibrarySnapshotKeys, writeLibrarySnapshot } from './localLibraryStore';
import { EdoEntry } from '../types/edo';
import { LocalLibrary } from './libraryProtection';
import { LIBRARY_STORAGE_KEY, loadLibrary, saveEntries } from './storageService';
import { getPersistentUploadQueue, savePersistentUploadQueue } from './cloudSyncService';
import { getAllVocabularyPrompts } from './vocabularyService';

export const ONE_TIME_RESET_KEY = 'edo_library_reset_v2';
const CACHE_KEY = 'edo_community_library_v1';
const LEGACY_STORAGE_KEY = 'edo_language_studio_entries_v1';

export async function isLibraryResetCompleted(): Promise<boolean> {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(ONE_TIME_RESET_KEY) === 'completed') {
      return true;
    }
    const pref = await Preferences.get({ key: ONE_TIME_RESET_KEY });
    return pref.value === 'completed';
  } catch {
    return false;
  }
}

/**
 * Reconciles local device storage with authoritative Google Drive state.
 * Guaranteed:
 * 1. Cloud deleted items are purged from local storage, caches, and upload queues.
 * 2. Words deleted from Drive return to their unrecorded prompt state for Teach Edo.
 * 3. Verified cloud entries have temporary local audio bytes safely removed.
 * 4. Genuine unfinished local recordings (pending upload) are protected and preserved.
 */
export async function reconcileLocalLibraryWithCloud(snapshot: CommunitySnapshot): Promise<void> {
  if (!snapshot || !Array.isArray(snapshot.entries)) return;

  const activeCloudMetaIds = new Set(snapshot.entries.map((e) => e.cloudMetadataFileId).filter(Boolean));
  const activeCloudAudioIds = new Set(snapshot.entries.map((e) => e.cloudAudioFileId).filter(Boolean));
  const activeRecordingIds = new Set(snapshot.entries.map((e) => e.recordingId).filter(Boolean));
  const tombstones = new Set(snapshot.tombstones || []);

  const catalogPrompts = getAllVocabularyPrompts();
  const catalogMap = new Map(catalogPrompts.map((p) => [p.id, p]));

  const currentLib = await loadLibrary();
  let changed = false;

  const queue = getPersistentUploadQueue();
  let queueChanged = false;

  const cleanedEntries: EdoEntry[] = [];
  const validRemainingRecIds = new Set<string>();

  for (const entry of currentLib.entries) {
    const isSynthetic =
      entry.id.toLowerCase().includes('test-') ||
      Boolean(entry.recordingId && entry.recordingId.toLowerCase().includes('test-')) ||
      entry.english.toUpperCase().includes('SYNC VERIFICATION') ||
      entry.english.toUpperCase().includes('SYNC TEST');

    if (isSynthetic) {
      changed = true;
      continue;
    }

    const wasCloudSynced =
      Boolean(entry.cloudMetadataFileId) ||
      Boolean(entry.cloudAudioFileId) ||
      entry.syncStatus === 'synced_to_drive';

    const isDeletedFromCloud =
      wasCloudSynced &&
      (!entry.cloudMetadataFileId || !activeCloudMetaIds.has(entry.cloudMetadataFileId)) &&
      (!entry.recordingId || !activeRecordingIds.has(entry.recordingId));

    const isTombstoned =
      Boolean(entry.recordingId && tombstones.has(entry.recordingId)) ||
      Boolean(entry.cloudMetadataFileId && tombstones.has(entry.cloudMetadataFileId));

    if (isDeletedFromCloud || isTombstoned) {
      changed = true;
      // Stale entry was deleted in Google Drive!
      // If it was an English catalog prompt, revert it to fresh unrecorded prompt so it returns to Teach Edo
      if (catalogMap.has(entry.id) || !entry.id.startsWith('custom-')) {
        const base = catalogMap.get(entry.id) || entry;
        cleanedEntries.push({
          ...base,
          hasAudio: false,
          audioDataUrl: undefined,
          cloudAudioFileId: undefined,
          cloudMetadataFileId: undefined,
          syncStatus: 'local_only',
          status: 'needs_audio',
          updatedAt: new Date().toISOString()
        });
      }
      // If queue had this deleted item, dequeue it
      continue;
    }

    // If entry is actively verified in Google Drive, safely remove temporary local audio bytes
    if (wasCloudSynced && activeCloudMetaIds.has(entry.cloudMetadataFileId!)) {
      if (entry.audioDataUrl) {
        changed = true;
      }
      cleanedEntries.push({
        ...entry,
        audioDataUrl: undefined, // Temporary audio removed after verified cloud sync
        syncStatus: 'synced_to_drive'
      });
      continue;
    }

    // Genuine pending local recording (never uploaded to cloud)
    if (entry.syncStatus === 'pending_upload' && entry.audioDataUrl && !entry.cloudMetadataFileId) {
      cleanedEntries.push(entry);
      if (entry.recordingId) validRemainingRecIds.add(entry.recordingId);
      continue;
    }

    // Default: keep prompt/entry
    cleanedEntries.push(entry);
  }

  // Prune recordings: keep only genuine pending upload audio
  const cleanedRecordings = currentLib.recordings.filter(
    (r) => validRemainingRecIds.has(r.id) && cleanedEntries.some((e) => e.recordingId === r.id && e.audioDataUrl)
  );

  if (cleanedRecordings.length !== currentLib.recordings.length) {
    changed = true;
  }

  // Prune upload queue: dequeue deleted lessons
  const validLessonIds = new Set(cleanedEntries.filter((e) => e.syncStatus === 'pending_upload').map((e) => e.id));
  const cleanedQueue = queue.filter((item) => validLessonIds.has(item.lessonId));
  if (cleanedQueue.length !== queue.length) {
    queueChanged = true;
  }

  if (changed) {
    await saveEntries(cleanedEntries, currentLib.entries);
  }
  if (queueChanged) {
    savePersistentUploadQueue(cleanedQueue);
  }

  // Clean stale audio snapshots from IndexedDB and Preferences
  try {
    const allKeys = await listLibrarySnapshotKeys();
    for (const k of allKeys) {
      if (k.startsWith('edo_community_audio_')) {
        const fileId = k.replace('edo_community_audio_', '');
        if (!activeCloudAudioIds.has(fileId)) {
          await deleteLibrarySnapshot(k);
        }
      }
    }
  } catch (_) {}
}

/**
 * Executes the one-time authoritative library reset across all devices.
 * Automatically clears old completed lessons, stale caches, and obsoleted audio
 * from phones and browsers, and rebuilds the library exclusively from Google Drive.
 */
export async function executeOneTimeLibraryReset(snapshot: CommunitySnapshot): Promise<void> {
  if (!snapshot || !Array.isArray(snapshot.entries)) {
    throw new Error('Authoritative gateway snapshot required for library reset.');
  }

  // 1. Clear legacy localStorage keys and any stale gateway overrides
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.removeItem('edo_gateway_url_v1');
    } catch (_) {}
  }

  // 2. Clear browser Cache Storage for Edo
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const keys = await window.caches.keys();
      for (const k of keys) {
        if (k.toLowerCase().includes('edo')) {
          await window.caches.delete(k);
        }
      }
    } catch (_) {}
  }

  // 3. Authoritatively reconcile local storage with Google Drive state
  await reconcileLocalLibraryWithCloud(snapshot);

  // 4. Overwrite community snapshot cache with the clean authoritative snapshot
  await writeLibrarySnapshot(CACHE_KEY, JSON.stringify(snapshot));

  // 5. Mark reset completed so it does not repeat
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(ONE_TIME_RESET_KEY, 'completed');
    } catch (_) {}
  }
  try {
    await Preferences.set({ key: ONE_TIME_RESET_KEY, value: 'completed' });
  } catch (_) {}
}
