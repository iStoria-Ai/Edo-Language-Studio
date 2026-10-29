import { EdoEntry } from '../types/edo';
import { recordingOwnerKey } from './recordingOwnership';
import { digest } from './libraryProtection';
import { getGatewayUrl, getStoredContributorToken, streamAudioFromGateway, submitSpellingToGateway } from './cloudSyncService';
import { readLibrarySnapshot, writeLibrarySnapshot } from './localLibraryStore';

const CACHE_KEY = 'edo_community_library_v1';
const DRAFT_KEY = 'edo_community_spelling_drafts_v1';
interface SpellingDraft { metadataFileId: string; text: string; error?: string }
export interface CommunitySnapshot { entries: EdoEntry[]; answeredQuestionIds: string[]; checkedAt: string }
export async function communityRequest(payload: Record<string, unknown>) {
  const response = await fetch(getGatewayUrl(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, authToken: getStoredContributorToken() }), redirect: 'follow', mode: 'cors', cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Google Drive returned HTTP ${response.status}`);
  const data = await response.json();
  if (data.status !== 'success') throw new Error(data.message || data.code || 'Google Drive request failed');
  return data;
}
export async function readCommunityCache(): Promise<CommunitySnapshot | null> {
  const raw = await readLibrarySnapshot(CACHE_KEY);
  if (!raw) return null;
  const snapshot = JSON.parse(raw);
  if (!Array.isArray(snapshot.entries) || !Array.isArray(snapshot.answeredQuestionIds)) throw new Error('Community cache is unreadable; original device recordings are unchanged.');
  return snapshot;
}
export async function fetchCommunityLibrary(): Promise<CommunitySnapshot> {
  const data = await communityRequest({ action: 'get_library' });
  if (!Array.isArray(data.items) || !Array.isArray(data.answeredQuestionIds) || !data.items.every((entry: EdoEntry) =>
    typeof entry.id === 'string' && entry.id.startsWith('cloud-') && typeof entry.recordingId === 'string' &&
    typeof entry.cloudMetadataFileId === 'string' && typeof entry.english === 'string' &&
    ['word', 'phrase', 'sentence'].includes(entry.category) && typeof entry.hasAudio === 'boolean' &&
    (!entry.hasAudio || typeof entry.cloudAudioFileId === 'string') && !entry.audioDataUrl)) throw new Error('The gateway returned an invalid shared Library. Cached content is preserved.');
  const snapshot = { entries: data.items as EdoEntry[], answeredQuestionIds: data.answeredQuestionIds as string[], checkedAt: String(data.checkedAt) };
  await writeLibrarySnapshot(CACHE_KEY, JSON.stringify(snapshot));
  return snapshot;
}
export async function fetchAnsweredQuestions(): Promise<string[]> {
  const data = await communityRequest({ action: 'get_question_state' });
  if (!Array.isArray(data.answeredQuestionIds) || !data.answeredQuestionIds.every((id: unknown) => typeof id === 'string')) throw new Error('Shared question list is unavailable.');
  return data.answeredQuestionIds;
}
export function mergeCommunityEntries(local: EdoEntry[], remote: EdoEntry[], drafts: SpellingDraft[] = []): EdoEntry[] {
  const remaining = new Map(remote.map(entry => [entry.recordingId, entry]));
  const merged = local.filter(entry => !entry.isSampleData || !remote.some(shared => shared.sourceLessonId === entry.id)).map(entry => {
    const shared = remote.find(item => Boolean(entry.recordingId && item.recordingId === entry.recordingId) || Boolean(entry.cloudMetadataFileId && item.cloudMetadataFileId === entry.cloudMetadataFileId) || Boolean(entry.cloudAudioFileId && item.cloudAudioFileId === entry.cloudAudioFileId));
    if (!shared) return { ...entry };
    remaining.delete(shared.recordingId);
    // Merge for display only. Never write remote metadata over the original protected library.
    return { ...entry, cloudAudioFileId: shared.cloudAudioFileId, cloudMetadataFileId: shared.cloudMetadataFileId,
      sourceLessonId: shared.sourceLessonId, syncStatus: 'synced_to_drive' as const, playbackPermission: shared.playbackPermission,
      edoText: shared.edoText || entry.edoText, status: shared.edoText ? 'awaiting_review' as const : entry.status,
      reviewStatus: shared.reviewStatus || entry.reviewStatus,
      approvedBy: shared.approvedBy || entry.approvedBy };
  });
  return [...merged, ...remaining.values()].map(entry => {
    const draft = drafts.find(item => item.metadataFileId === entry.cloudMetadataFileId);
    return draft ? { ...entry, edoText: draft.text, spellingSyncStatus: draft.error ? 'conflict' as const : 'pending' as const, spellingSyncError: draft.error } : entry;
  });
}
export async function readSpellingDrafts(): Promise<SpellingDraft[]> {
  const raw = await readLibrarySnapshot(DRAFT_KEY);
  if (!raw) return [];
  const drafts = JSON.parse(raw);
  if (!Array.isArray(drafts)) throw new Error('Saved spelling drafts are unreadable.');
  return drafts;
}
let draftTail: Promise<unknown> = Promise.resolve();
async function editDrafts(action: (drafts: SpellingDraft[]) => SpellingDraft[]): Promise<void> {
  const operation = async () => writeLibrarySnapshot(DRAFT_KEY, JSON.stringify(action(await readSpellingDrafts())));
  const task = draftTail.then(operation, operation);
  draftTail = task.catch(() => undefined);
  await task;
}
export async function queueCommunitySpelling(metadataFileId: string, text: string): Promise<void> {
  if (!metadataFileId || !text.trim()) throw new Error('Enter the Edo spelling before saving.');
  await editDrafts(drafts => [...drafts.filter(draft => draft.metadataFileId !== metadataFileId), { metadataFileId, text: text.trim() }]);
}
export async function syncSpellingDrafts(): Promise<void> {
  for (const draft of await readSpellingDrafts()) {
    if (draft.error) continue;
    const result = await submitSpellingToGateway({ metadataFileId: draft.metadataFileId, edoSpelling: draft.text });
    if (result.ok) await editDrafts(drafts => drafts.filter(item => item.metadataFileId !== draft.metadataFileId || item.text !== draft.text));
    else if (result.status === 'conflict') await editDrafts(drafts => drafts.map(item => item.metadataFileId === draft.metadataFileId && item.text === draft.text ? { ...item, error: result.message } : item));
    else throw new Error(result.message);
  }
}
export async function uploadWrittenContribution(entry: EdoEntry): Promise<string> {
  const data = await communityRequest({ action: 'upsert_text_contribution', lessonId: entry.id,
    recordingId: `text-${await digest(entry.id)}`, english: entry.english, edoText: entry.edoText, category: entry.category });
  if (data.verified !== true || !data.metadataFileId) throw new Error('Written contribution was not verified in Drive.');
  return data.metadataFileId;
}
export async function getCommunityAudio(entry: EdoEntry): Promise<string> {
  if (!entry.isCommunity && entry.audioDataUrl) return entry.audioDataUrl;
  if (entry.playbackPermission !== 'granted') throw new Error('The speaker has not granted shared playback permission.');
  if (!entry.cloudAudioFileId) throw new Error('This contribution has no shared audio.');
  const key = 'edo_community_audio_' + entry.cloudAudioFileId;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const cached = await readLibrarySnapshot(key);
    if (!cached) throw new Error('Connect once to listen and cache this recording for offline playback.');
    return cached;
  }
  // Re-check permission on the server when online, even if bytes have previously been cached.
  const result = await streamAudioFromGateway(entry.cloudAudioFileId);
  if (!result.ok || !result.audioDataUrl) throw new Error(result.error || 'Unable to play shared recording.');
  await writeLibrarySnapshot(key, result.audioDataUrl);
  return result.audioDataUrl;
}
export function nextUnansweredQuestion(questions: EdoEntry[], answeredIds: ReadonlySet<string>, start = 0): number {
  for (let offset = 0; offset < questions.length; offset++) {
    const index = (start + offset) % questions.length;
    if (!answeredIds.has(questions[index].id) && !(questions[index].hasAudio && !questions[index].isSampleData)) return index;
  }
  return -1;
}

export async function updateOwnedRecordingPermissions(recordingId: string, metadataFileId: string, permissions: { playback: string; aiVoiceTraining: string }): Promise<void> {
  await communityRequest({ action: 'update_recording_permissions', metadataFileId, ownerKey: await recordingOwnerKey(recordingId), permissions });
}
