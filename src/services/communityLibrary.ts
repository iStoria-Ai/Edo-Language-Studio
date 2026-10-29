import { EdoEntry } from '../types/edo';
import { recordingOwnerKey } from './recordingOwnership';
import { digest } from './libraryProtection';
import { getGatewayUrl, getStoredContributorToken, streamAudioFromGateway, submitSpellingToGateway, recordPlaybackToGateway, parseAudioDataUrl } from './cloudSyncService';
import { readLibrarySnapshot, writeLibrarySnapshot } from './localLibraryStore';

const CACHE_KEY = 'edo_community_library_v1';
const DRAFT_KEY = 'edo_community_spelling_drafts_v1';
interface SpellingDraft { metadataFileId: string; text: string; error?: string }
export interface CommunitySnapshot {
  entries: EdoEntry[];
  answeredQuestionIds: string[];
  checkedAt: string;
  tombstones?: string[];
  answeredEnglish?: string[];
}

function isSyntheticTest(entry: { id?: string; recordingId?: string; english?: string; edoText?: string }): boolean {
  return Boolean(
    (entry.id && entry.id.toLowerCase().includes('test-')) ||
    (entry.recordingId && entry.recordingId.toLowerCase().includes('test-')) ||
    (entry.english && entry.english.toUpperCase().includes('SYNC VERIFICATION')) ||
    (entry.english && entry.english.toUpperCase().includes('SYNC TEST')) ||
    (entry.edoText && entry.edoText.toUpperCase().includes('SYNC TEST'))
  );
}

function createTimeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function communityRequest(payload: Record<string, unknown>) {
  const response = await fetch(getGatewayUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, authToken: getStoredContributorToken() }),
    redirect: 'follow',
    mode: 'cors',
    cache: 'no-store',
    signal: createTimeoutSignal(30000)
  });
  if (!response.ok) throw new Error(`Google Drive returned HTTP ${response.status}`);
  const data = await response.json();
  if (data.status !== 'success') throw Object.assign(new Error(data.message || data.code || 'Google Drive request failed'), { code: data.code, status: data.status });
  return data;
}
export async function readCommunityCache(): Promise<CommunitySnapshot | null> {
  const raw = await readLibrarySnapshot(CACHE_KEY);
  if (!raw) return null;
  const snapshot = JSON.parse(raw);
  if (!Array.isArray(snapshot.entries) || !Array.isArray(snapshot.answeredQuestionIds)) throw new Error('Community cache is unreadable; original device recordings are unchanged.');
  const filtered = snapshot.entries.filter((entry: EdoEntry) => !isSyntheticTest(entry));
  return { ...snapshot, entries: filtered };
}
export async function fetchCommunityLibrary(): Promise<CommunitySnapshot> {
  const data = await communityRequest({ action: 'get_library' });
  if (!Array.isArray(data.items) || !Array.isArray(data.answeredQuestionIds) || !data.items.every((entry: EdoEntry) =>
    typeof entry.id === 'string' && entry.id.startsWith('cloud-') && typeof entry.recordingId === 'string' &&
    typeof entry.cloudMetadataFileId === 'string' && typeof entry.english === 'string' &&
    ['word', 'phrase', 'sentence'].includes(entry.category) && typeof entry.hasAudio === 'boolean' &&
    (!entry.hasAudio || typeof entry.cloudAudioFileId === 'string') && !entry.audioDataUrl)) throw new Error('The gateway returned an invalid shared Library. Cached content is preserved.');
  const tombstones = Array.isArray(data.tombstones) ? data.tombstones.filter((t: unknown) => typeof t === 'string') : [];
  const cleanItems = (data.items as EdoEntry[]).filter(entry => !isSyntheticTest(entry));
  const snapshot: CommunitySnapshot = {
    entries: cleanItems,
    answeredQuestionIds: data.answeredQuestionIds as string[],
    checkedAt: String(data.checkedAt),
    tombstones,
    answeredEnglish: Array.isArray(data.answeredEnglish) ? data.answeredEnglish : []
  };
  await writeLibrarySnapshot(CACHE_KEY, JSON.stringify(snapshot));
  return snapshot;
}
export async function fetchAnsweredQuestions(): Promise<string[]> {
  const data = await communityRequest({ action: 'get_question_state' });
  if (!Array.isArray(data.answeredQuestionIds) || !data.answeredQuestionIds.every((id: unknown) => typeof id === 'string')) throw new Error('Shared question list is unavailable.');
  return [...data.answeredQuestionIds, ...(Array.isArray(data.answeredEnglish) ? data.answeredEnglish.map((text: string) => 'english:' + normalizeQuestion(text)) : [])];
}
export function mergeCommunityEntries(
  local: EdoEntry[],
  remote: EdoEntry[],
  drafts: SpellingDraft[] = [],
  tombstones: string[] = []
): EdoEntry[] {
  const tombSet = new Set(tombstones);
  const activeRemote = remote
    .filter(entry => !isSyntheticTest(entry))
    .filter(entry => !tombSet.has(entry.recordingId || '') && !tombSet.has(entry.cloudMetadataFileId || ''));
  const remaining = new Map(activeRemote.map(entry => [entry.recordingId, entry]));
  const merged = local
    .filter(entry => !isSyntheticTest(entry))
    .filter(entry => {
      if (entry.id && tombSet.has(entry.id)) return false;
      if (entry.recordingId && tombSet.has(entry.recordingId)) return false;
      if (entry.cloudMetadataFileId && tombSet.has(entry.cloudMetadataFileId)) return false;
      if (!entry.isSampleData || !activeRemote.some(shared => shared.sourceLessonId === entry.id)) return true;
      return false;
    })
    .map(entry => {
      const shared = activeRemote.find(
        item =>
          Boolean(entry.recordingId && item.recordingId === entry.recordingId) ||
          Boolean(entry.cloudMetadataFileId && item.cloudMetadataFileId === entry.cloudMetadataFileId) ||
          Boolean(entry.cloudAudioFileId && item.cloudAudioFileId === entry.cloudAudioFileId)
      );
      if (!shared) return { ...entry };
      remaining.delete(shared.recordingId);
      // Merge for display only. Authoritative cloud metadata takes precedence.
      return {
        ...entry,
        cloudAudioFileId: shared.cloudAudioFileId,
        cloudMetadataFileId: shared.cloudMetadataFileId,
        sourceLessonId: shared.sourceLessonId || entry.id,
        syncStatus: 'synced_to_drive' as const,
        isCommunity: true,
        hasAudio: true,
        playbackPermission: shared.playbackPermission,
        edoText: shared.edoText || entry.edoText,
        status: shared.edoText ? ('awaiting_review' as const) : entry.status,
        reviewStatus: shared.reviewStatus || entry.reviewStatus,
        approvedBy: shared.approvedBy || entry.approvedBy,
        distinctListenersCount: shared.distinctListenersCount ?? entry.distinctListenersCount,
        autoLocked: shared.autoLocked ?? entry.autoLocked
      };
    });

  return [...merged, ...remaining.values()].map(entry => {
    const draft = drafts.find(item => item.metadataFileId === entry.cloudMetadataFileId);
    return draft
      ? {
          ...entry,
          edoText: draft.text,
          spellingSyncStatus: draft.error ? ('conflict' as const) : ('pending' as const),
          spellingSyncError: draft.error
        }
      : entry;
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
  if (!entry.isCommunity && entry.audioDataUrl?.startsWith('data:audio/')) return entry.audioDataUrl;
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
  if (entry.cloudMetadataFileId) {
    void recordPlaybackToGateway(entry.cloudMetadataFileId).catch(() => {});
  }
  return result.audioDataUrl;
}
function normalizeQuestion(text: string): string { return text.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' '); }
export function nextUnansweredQuestion(questions: EdoEntry[], answeredIds: ReadonlySet<string>, start = 0): number {
  for (let offset = 0; offset < questions.length; offset++) {
    const index = (start + offset) % questions.length;
    if (!answeredIds.has(questions[index].id) && !answeredIds.has('english:' + normalizeQuestion(questions[index].english)) && !(questions[index].hasAudio && !questions[index].isSampleData)) return index;
  }
  return -1;
}

export async function updateOwnedRecordingPermissions(recordingId: string, metadataFileId: string, permissions: { playback: string; aiVoiceTraining: string }): Promise<void> {
  await communityRequest({ action: 'update_recording_permissions', metadataFileId, ownerKey: await recordingOwnerKey(recordingId), permissions });
}

export interface CommunityEdit { english?: string; edoText?: string; audioDataUrl?: string; durationSec?: number }
interface CloudEditDraft { id: string; metadataFileId: string; expectedVersion: number; updates: CommunityEdit; error?: string }
const EDIT_KEY = 'edo_pending_cloud_edits_v1';
let editTail: Promise<unknown> = Promise.resolve();
async function editCloudDrafts(action: (items: CloudEditDraft[]) => CloudEditDraft[]): Promise<void> {
  const write = async () => {
    const raw = await readLibrarySnapshot(EDIT_KEY);
    await writeLibrarySnapshot(EDIT_KEY, JSON.stringify(action(raw ? JSON.parse(raw) : [])));
  };
  const run = () => typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request(EDIT_KEY, write) : write();
  const next = editTail.then(run, run); editTail = next.catch(() => undefined); await next;
}
export async function queueCommunityEdit(entry: EdoEntry, updates: CommunityEdit): Promise<void> {
  if (!entry.cloudMetadataFileId || entry.reviewStatus === 'approved_locked') throw new Error('This lesson is read-only.');
  await editCloudDrafts(items => [...items.filter(item => item.metadataFileId !== entry.cloudMetadataFileId), {
    id: 'edit-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2), metadataFileId: entry.cloudMetadataFileId!, expectedVersion: entry.version || 0, updates
  }]);
}
export async function syncCommunityEdits(): Promise<void> {
  const raw = await readLibrarySnapshot(EDIT_KEY);
  const items: CloudEditDraft[] = raw ? JSON.parse(raw) : [];
  for (const draft of items) {
    if (draft.error) continue;
    try {
      const audio = draft.updates.audioDataUrl ? parseAudioDataUrl(draft.updates.audioDataUrl) : undefined;
      const result = await communityRequest({ action: 'update_contribution', metadataFileId: draft.metadataFileId, expectedVersion: draft.expectedVersion,
        mutationId: draft.id, english: draft.updates.english, edoText: draft.updates.edoText, durationSec: draft.updates.durationSec,
        audioBase64: audio?.base64, mimeType: audio?.mimeType, permissions: audio ? { playback: 'granted', aiVoiceTraining: 'denied' } : undefined });
      if (result.verified !== true) throw new Error('The update has not yet been verified online. Your draft is preserved.');
      if (audio) {
        const stream = await streamAudioFromGateway(result.audioFileId);
        if (!stream.ok || !stream.audioDataUrl || parseAudioDataUrl(stream.audioDataUrl).base64 !== audio.base64) throw new Error('Voice verification is pending. Your original recording is preserved.');
      }
      await editCloudDrafts(current => current.filter(item => item.id !== draft.id));
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code && ['REVISION_CONFLICT', 'ENTRY_LOCKED', 'ACCESS_DENIED', 'RECORD_DELETED', 'NOT_FOUND'].includes(code)) {
        await editCloudDrafts(current => current.map(item => item.id === draft.id ? { ...item, error: String(error) } : item));
      } else throw error;
    }
  }
}

export async function ensureCommunityEditSynced(metadataFileId: string): Promise<void> {
  const raw = await readLibrarySnapshot(EDIT_KEY);
  const pending = (raw ? JSON.parse(raw) as CloudEditDraft[] : []).find(item => item.metadataFileId === metadataFileId);
  if (pending) throw new Error(pending.error || 'Your contribution is saved on this device and waiting for Google Drive verification. The app retries automatically.');
}
