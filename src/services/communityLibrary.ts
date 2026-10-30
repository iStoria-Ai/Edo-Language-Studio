import { EdoEntry } from '../types/edo';
import { recordingOwnerKey } from './recordingOwnership';
import { digest } from './libraryProtection';
import { getGatewayUrl, getStoredContributorToken, streamAudioFromGateway, submitSpellingToGateway, recordPlaybackToGateway, parseAudioDataUrl } from './cloudSyncService';
import { readLibrarySnapshot, writeLibrarySnapshot, deleteLibrarySnapshot } from './localLibraryStore';
import {
  getCachedSessionAudio,
  setCachedSessionAudio,
  invalidateSessionAudio,
  loadOrFetchAudio
} from './audioService';

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

export interface HelpOthersEligibilityResult {
  needsWritingList: EdoEntry[];
  needsAudioList: EdoEntry[];
  allEligible: EdoEntry[];
  totalCount: number;
}

/**
 * Single authoritative source of truth for Help Others eligibility.
 * Ensures the dashboard badge and Help Others screen match identically.
 * Excludes sample data, synthetic tests, completed lessons (has both audio and spelling),
 * approved/locked items, tombstoned/deleted items, duplicates, and locally pending edits.
 */
export function getHelpOthersEligibleEntries(
  entries: EdoEntry[],
  tombstones: string[] = [],
  pendingMetadataIds?: ReadonlySet<string>
): HelpOthersEligibilityResult {
  const tombSet = new Set(tombstones || []);
  const seenIds = new Set<string>();

  const needsWritingList: EdoEntry[] = [];
  const needsAudioList: EdoEntry[] = [];
  const allEligible: EdoEntry[] = [];

  for (const entry of entries) {
    if (!entry) continue;
    // Exclude sample placeholder data
    if (entry.isSampleData) continue;
    // Exclude synthetic test entries
    if (isSyntheticTest(entry)) continue;
    // Help Others shows only genuinely cloud-backed incomplete lessons from Google Drive
    if (!entry.cloudMetadataFileId) continue;
    // Exclude tombstoned / deleted entries
    if (
      tombSet.has(entry.id) ||
      tombSet.has(entry.cloudMetadataFileId) ||
      (entry.recordingId && tombSet.has(entry.recordingId))
    ) {
      continue;
    }
    // Exclude approved or locked entries
    if (entry.reviewStatus === 'approved_locked' || entry.autoLocked) {
      continue;
    }
    // Exclude entries that already have a pending local edit queued for upload
    if (pendingMetadataIds && pendingMetadataIds.has(entry.cloudMetadataFileId)) {
      continue;
    }
    // Deduplicate by cloudMetadataFileId
    if (seenIds.has(entry.cloudMetadataFileId)) {
      continue;
    }

    const hasVoice = Boolean(entry.cloudAudioFileId || entry.hasAudio || entry.audioDataUrl);
    const hasSpelling = Boolean(entry.edoText && entry.edoText.trim().length > 0);

    // Completed lessons (both voice and spelling) belong in the Library, not Help Others
    if (hasVoice && hasSpelling) {
      continue;
    }

    // Lessons with neither voice nor spelling are unstarted stubs, not Help Others
    if (!hasVoice && !hasSpelling) {
      continue;
    }

    seenIds.add(entry.cloudMetadataFileId);

    if (hasVoice && !hasSpelling) {
      needsWritingList.push(entry);
      allEligible.push(entry);
    } else if (hasSpelling && !hasVoice) {
      needsAudioList.push(entry);
      allEligible.push(entry);
    }
  }

  return {
    needsWritingList,
    needsAudioList,
    allEligible,
    totalCount: allEligible.length
  };
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

  const cacheKey = entry.cloudAudioFileId;
  const storageKey = 'edo_community_audio_' + entry.cloudAudioFileId;

  // 1. Session memory cache (instant zero-latency playback)
  const cachedMemory = getCachedSessionAudio(cacheKey);
  if (cachedMemory) return cachedMemory;

  // 2. Offline check: persistent device storage
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const cached = await readLibrarySnapshot(storageKey);
    if (!cached) throw new Error('Connect once to listen and cache this recording for offline playback.');
    setCachedSessionAudio(cacheKey, cached);
    return cached;
  }

  // 3. Online stream with in-flight deduplication and session caching
  return loadOrFetchAudio(cacheKey, async () => {
    // Check persistent storage first before making network call
    const stored = await readLibrarySnapshot(storageKey);
    if (stored) {
      if (entry.cloudMetadataFileId) {
        void recordPlaybackToGateway(entry.cloudMetadataFileId).catch(() => {});
      }
      return stored;
    }

    const result = await streamAudioFromGateway(entry.cloudAudioFileId!);
    if (!result.ok || !result.audioDataUrl) throw new Error(result.error || 'Unable to play shared recording.');
    void writeLibrarySnapshot(storageKey, result.audioDataUrl).catch(() => {});
    if (entry.cloudMetadataFileId) {
      void recordPlaybackToGateway(entry.cloudMetadataFileId).catch(() => {});
    }
    return result.audioDataUrl;
  });
}

export function normalizeQuestion(text: string): string {
  return text.trim().toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
}

export function isQuestionAnswered(q: EdoEntry, answeredIds: ReadonlySet<string>): boolean {
  if (answeredIds.has(q.id)) return true;
  if (answeredIds.has('english:' + normalizeQuestion(q.english))) return true;
  if (q.hasAudio && !q.isSampleData) return true;
  return false;
}

export function shuffleQuestions<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

export function buildCuratedSessionQueue(questions: EdoEntry[], answeredIds: ReadonlySet<string>): EdoEntry[] {
  const eligible = questions.filter(q => !isQuestionAnswered(q, answeredIds));
  if (eligible.length === 0) return [];

  const isAlpha = (q: EdoEntry) => (q.topic === 'Alphabet' || (q as unknown as { category: string }).category === 'Alphabet' || q.id.startsWith('letter-'));
  const isNum = (q: EdoEntry) => (q.topic === 'Numbers' || (q as unknown as { category: string }).category === 'Numbers' || q.id.startsWith('number-'));

  // Alphabet letters sorted naturally A-Z
  const alphaItems = eligible.filter(isAlpha).sort((a, b) => a.english.localeCompare(b.english));

  // Number items sorted naturally 1-30
  const numberItems = eligible.filter(isNum).sort((a, b) => {
    const na = parseInt(a.english, 10) || 0;
    const nb = parseInt(b.english, 10) || 0;
    return na - nb;
  });

  // General vocabulary items shuffled randomly
  const generalItems = shuffleQuestions(eligible.filter(q => !isAlpha(q) && !isNum(q)));

  // Slice alphabet into chunks of ~10 consecutive letters (A-J, K-T, U-Z)
  const alphaChunks: EdoEntry[][] = [];
  const alphaSlices = [[0, 10], [10, 20], [20, 26]];
  for (const [start, end] of alphaSlices) {
    const chunk = alphaItems.filter(q => {
      const idx = q.english.trim().toUpperCase().charCodeAt(0) - 65;
      return idx >= start && idx < end;
    });
    if (chunk.length > 0) alphaChunks.push(chunk);
  }

  // Slice numbers into chunks of ~10 consecutive numbers (1-10, 11-20, 21-30)
  const numChunks: EdoEntry[][] = [];
  const numSlices = [[1, 10], [11, 20], [21, 30]];
  for (const [start, end] of numSlices) {
    const chunk = numberItems.filter(q => {
      const n = parseInt(q.english, 10);
      return n >= start && n <= end;
    });
    if (chunk.length > 0) numChunks.push(chunk);
  }

  // Slice general vocabulary into chunks of 8 to 12 words
  const generalChunks: EdoEntry[][] = [];
  for (let i = 0; i < generalItems.length; i += 10) {
    generalChunks.push(generalItems.slice(i, i + 10));
  }

  const queue: EdoEntry[] = [];
  let aIdx = 0, nIdx = 0, gIdx = 0;
  const leadRand = Math.random();

  while (aIdx < alphaChunks.length || nIdx < numChunks.length || gIdx < generalChunks.length) {
    if (leadRand < 0.33) {
      if (aIdx < alphaChunks.length) queue.push(...alphaChunks[aIdx++]);
      if (gIdx < generalChunks.length) queue.push(...generalChunks[gIdx++]);
      if (nIdx < numChunks.length) queue.push(...numChunks[nIdx++]);
      if (gIdx < generalChunks.length) queue.push(...generalChunks[gIdx++]);
    } else if (leadRand < 0.66) {
      if (nIdx < numChunks.length) queue.push(...numChunks[nIdx++]);
      if (gIdx < generalChunks.length) queue.push(...generalChunks[gIdx++]);
      if (aIdx < alphaChunks.length) queue.push(...alphaChunks[aIdx++]);
      if (gIdx < generalChunks.length) queue.push(...generalChunks[gIdx++]);
    } else {
      if (gIdx < generalChunks.length) queue.push(...generalChunks[gIdx++]);
      if (aIdx < alphaChunks.length) queue.push(...alphaChunks[aIdx++]);
      if (gIdx < generalChunks.length) queue.push(...generalChunks[gIdx++]);
      if (nIdx < numChunks.length) queue.push(...numChunks[nIdx++]);
    }
  }

  return queue;
}

export function nextUnansweredQuestion(questions: EdoEntry[], answeredIds: ReadonlySet<string>, start = 0): number {
  for (let offset = 0; offset < questions.length; offset++) {
    const index = (start + offset) % questions.length;
    if (!isQuestionAnswered(questions[index], answeredIds)) return index;
  }
  return -1;
}

export async function updateOwnedRecordingPermissions(recordingId: string, metadataFileId: string, permissions: { playback: string; aiVoiceTraining: string }): Promise<void> {
  await communityRequest({ action: 'update_recording_permissions', metadataFileId, ownerKey: await recordingOwnerKey(recordingId), permissions });
}

export interface CommunityEdit { english?: string; edoText?: string; audioDataUrl?: string; durationSec?: number }
export interface CloudEditDraft {
  id: string;
  metadataFileId: string;
  expectedVersion: number;
  updates: CommunityEdit;
  error?: string;
  lastAttemptFailed?: boolean;
  lastErrorMessage?: string;
}
export const EDIT_KEY = 'edo_pending_cloud_edits_v1';
let editTail: Promise<unknown> = Promise.resolve();

function notifyPendingEditsChanged(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('edo_pending_edits_changed'));
    } catch {
      // Ignore
    }
  }
}

async function editCloudDrafts(action: (items: CloudEditDraft[]) => CloudEditDraft[]): Promise<void> {
  const write = async (): Promise<void> => {
    const raw = await readLibrarySnapshot(EDIT_KEY);
    await writeLibrarySnapshot(EDIT_KEY, JSON.stringify(action(raw ? JSON.parse(raw) : [])));
    notifyPendingEditsChanged();
  };
  const run = async (): Promise<void> => {
    if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks) {
      await navigator.locks.request(EDIT_KEY, write);
    } else {
      await write();
    }
  };
  const next = editTail.then(run, run);
  editTail = next.catch(() => undefined);
  await next;
}

export async function readPendingCloudEdits(): Promise<CloudEditDraft[]> {
  const raw = await readLibrarySnapshot(EDIT_KEY);
  if (!raw) return [];
  try {
    const items = JSON.parse(raw);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

export async function retryPendingCloudEdit(metadataFileId: string): Promise<void> {
  await editCloudDrafts(items =>
    items.map(item =>
      item.metadataFileId === metadataFileId
        ? { ...item, error: undefined, lastAttemptFailed: false, lastErrorMessage: undefined }
        : item
    )
  );
  notifyPendingEditsChanged();
  await syncCommunityEdits();
}

export async function queueCommunityEdit(entry: EdoEntry, updates: CommunityEdit): Promise<void> {
  if (!entry.cloudMetadataFileId || entry.reviewStatus === 'approved_locked') throw new Error('This lesson is read-only.');
  await editCloudDrafts(items => [...items.filter(item => item.metadataFileId !== entry.cloudMetadataFileId), {
    id: 'edit-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2), metadataFileId: entry.cloudMetadataFileId!, expectedVersion: entry.version || 0, updates
  }]);
  notifyPendingEditsChanged();
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
        if (!stream.ok || !stream.audioDataUrl || parseAudioDataUrl(stream.audioDataUrl).base64 !== audio.base64) {
          throw new Error('Voice verification is pending. Your original recording is preserved.');
        }
        if (result.previousAudioFileId) {
          invalidateSessionAudio(result.previousAudioFileId);
          await deleteLibrarySnapshot('edo_community_audio_' + result.previousAudioFileId);
        }
        setCachedSessionAudio(result.audioFileId, stream.audioDataUrl);
        await writeLibrarySnapshot('edo_community_audio_' + result.audioFileId, stream.audioDataUrl);
      }
      await editCloudDrafts(current => current.filter(item => item.id !== draft.id));
      notifyPendingEditsChanged();
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code && ['REVISION_CONFLICT', 'ENTRY_LOCKED', 'ACCESS_DENIED', 'RECORD_DELETED', 'NOT_FOUND'].includes(code)) {
        await editCloudDrafts(current => current.map(item => item.id === draft.id ? { ...item, error: String(error) } : item));
        notifyPendingEditsChanged();
      } else {
        await editCloudDrafts(current => current.map(item => item.id === draft.id ? { ...item, lastAttemptFailed: true, lastErrorMessage: String((error as any)?.message || error) } : item));
        notifyPendingEditsChanged();
        throw error;
      }
    }
  }
}

export async function ensureCommunityEditSynced(metadataFileId: string): Promise<void> {
  const raw = await readLibrarySnapshot(EDIT_KEY);
  const pending = (raw ? JSON.parse(raw) as CloudEditDraft[] : []).find(item => item.metadataFileId === metadataFileId);
  if (pending) throw new Error(pending.error || 'Your contribution is saved on this device and waiting for Google Drive verification. The app retries automatically.');
}
