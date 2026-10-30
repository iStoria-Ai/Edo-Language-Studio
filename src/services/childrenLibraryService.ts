import { DEFAULT_GATEWAY_URL } from './cloudSyncService';
import { EdoEntry } from '../types/edo';
import { getCachedSessionAudio, setCachedSessionAudio, loadOrFetchAudio } from './audioService';

// Intentionally stateless: never consult Studio credentials, caches, or upload queues.
async function readGateway(payload: { action: 'get_library' } | { action: 'stream_audio'; fileId: string }, signal?: AbortSignal) {
  const response = await fetch(DEFAULT_GATEWAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    credentials: 'omit',
    redirect: 'follow',
    mode: 'cors',
    cache: 'no-store',
    signal
  });
  if (!response.ok) throw new Error('Unable to connect to the Library.');
  const data = await response.json();
  if (data.status !== 'success') throw new Error('Unable to load permitted lessons.');
  return data;
}

export async function fetchChildrenLibrary(signal?: AbortSignal): Promise<{ entries: EdoEntry[]; checkedAt: string }> {
  const data = await readGateway({ action: 'get_library' }, signal);
  if (!Array.isArray(data.items)) throw new Error('Invalid Library response.');
  const tombstones = new Set(Array.isArray(data.tombstones) ? data.tombstones : []);
  const entries = data.items.filter((entry: EdoEntry) =>
    entry && typeof entry.id === 'string' && entry.id.startsWith('cloud-') &&
    typeof entry.recordingId === 'string' &&
    typeof entry.english === 'string' && typeof entry.edoText === 'string' &&
    typeof entry.cloudMetadataFileId === 'string' && typeof entry.cloudAudioFileId === 'string' &&
    ['word', 'phrase', 'sentence'].includes(entry.category) &&
    entry.isCommunity === true && entry.hasAudio === true && !entry.audioDataUrl &&
    entry.playbackPermission === 'granted' &&
    !tombstones.has(entry.recordingId) && !tombstones.has(entry.cloudMetadataFileId)
  );
  return { entries, checkedAt: String(data.checkedAt || new Date().toISOString()) };
}

export async function streamChildrenAudio(fileId: string): Promise<{ ok: boolean; audioDataUrl?: string; error?: string }> {
  try {
    const data = await readGateway({ action: 'stream_audio', fileId });
    if (typeof data.audioDataUrl === 'string' && data.audioDataUrl.startsWith('data:audio/')) {
      return { ok: true, audioDataUrl: data.audioDataUrl };
    }
    return { ok: false, error: 'Audio unavailable.' };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Download failed.' };
  }
}

export async function getChildrenAudio(entry: EdoEntry): Promise<string> {
  if (entry.playbackPermission !== 'granted' || !entry.cloudAudioFileId) throw new Error('Playback is not permitted.');

  // 1. Check shared session audio cache first for instant repeat playback
  const cached = getCachedSessionAudio(entry.cloudAudioFileId);
  if (cached) return cached;

  // 2. Fetch with in-flight deduplication so concurrent taps share a single download
  return loadOrFetchAudio(entry.cloudAudioFileId, async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const data = await readGateway({ action: 'stream_audio', fileId: entry.cloudAudioFileId! }, controller.signal);
      if (typeof data.audioDataUrl !== 'string' || !data.audioDataUrl.startsWith('data:audio/')) throw new Error('Audio unavailable.');
      setCachedSessionAudio(entry.cloudAudioFileId!, data.audioDataUrl);
      return data.audioDataUrl;
    } finally { clearTimeout(timeout); }
  });
}
