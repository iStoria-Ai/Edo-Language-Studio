import { readLibrarySnapshot, writeLibrarySnapshot } from './localLibraryStore';
export async function recordingOwnerKey(recordingId: string): Promise<string> {
  const create = async () => {
  const key = 'edo_recording_owner_' + recordingId;
  const existing = await readLibrarySnapshot(key);
  if (existing) return existing;
  const secret = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
  await writeLibrarySnapshot(key, secret);
  return secret;
  };
  return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request('edo-owner-' + recordingId, create) : create();
}
