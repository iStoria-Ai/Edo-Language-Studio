import { Preferences } from '@capacitor/preferences';
import { CommunitySnapshot } from './communityLibrary';
import { deleteLibrarySnapshot, listLibrarySnapshotKeys, writeLibrarySnapshot } from './localLibraryStore';
import { loadLibrary } from './storageService';
import { getPersistentUploadQueue, savePersistentUploadQueue } from './cloudSyncService';

export const ONE_TIME_RESET_KEY = 'edo_library_reset_v3';
const CACHE_KEY = 'edo_community_library_v1';
export async function isLibraryResetCompleted(): Promise<boolean> {
  try { return (typeof localStorage !== 'undefined' && localStorage.getItem(ONE_TIME_RESET_KEY) === 'completed') || (await Preferences.get({ key: ONE_TIME_RESET_KEY })).value === 'completed'; }
  catch { return false; }
}
/** Reconcile only disposable cloud caches. Never rewrite recordings, consent, pending work, or answered history. */
export async function reconcileLocalLibraryWithCloud(snapshot: CommunitySnapshot): Promise<void> {
  if (!snapshot || !Array.isArray(snapshot.entries) || !Array.isArray(snapshot.answeredQuestionIds) || !Number.isFinite(Date.parse(snapshot.checkedAt))) throw new Error('A successful authoritative cloud response is required.');
  const activeAudio = new Set(snapshot.entries.map(entry => entry.cloudAudioFileId).filter(Boolean));
  const activeRecordings = new Set(snapshot.entries.map(entry => entry.recordingId).filter(Boolean));
  const local = await loadLibrary();
  const tombstones = new Set(snapshot.tombstones || []);
  const queue = getPersistentUploadQueue();
  const reconciled = queue.filter(item => {
    const entry = local.entries.find(record => record.id === item.lessonId);
    // Only confirmed uploads or explicitly tombstoned previously uploaded records leave the queue.
    if (entry?.recordingId && activeRecordings.has(entry.recordingId)) return false;
    if (entry?.cloudMetadataFileId && (tombstones.has(entry.cloudMetadataFileId) || Boolean(entry.recordingId && tombstones.has(entry.recordingId)))) return false;
    return true;
  });
  if (reconciled.length !== queue.length) savePersistentUploadQueue(reconciled);
  for (const key of await listLibrarySnapshotKeys()) {
    if (key.startsWith('edo_community_audio_') && !activeAudio.has(key.slice('edo_community_audio_'.length))) await deleteLibrarySnapshot(key);
  }
}
export async function executeOneTimeLibraryReset(snapshot: CommunitySnapshot): Promise<void> {
  await reconcileLocalLibraryWithCloud(snapshot);
  await writeLibrarySnapshot(CACHE_KEY, JSON.stringify(snapshot));
  // Keep the legacy protected snapshot as recovery. Only obsolete public cache keys are removed.
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('edo_public_library_cache_v0');
    localStorage.setItem(ONE_TIME_RESET_KEY, 'completed');
  }
  await Preferences.set({ key: ONE_TIME_RESET_KEY, value: 'completed' });
}
