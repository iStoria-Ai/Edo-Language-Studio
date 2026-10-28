import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { EdoEntry, StudioStats } from '../types/edo';
import { canonical, digest, LocalLibrary, ProtectedRecording, protectEntries, makeBackup, parseBackup, mergeBackup, originalAudio, validatePermissions } from './libraryProtection';

import { readLibrarySnapshot, writeLibrarySnapshot } from './localLibraryStore';

const STORAGE_KEY = 'edo_language_studio_entries_v1';

/**
 * Initial prototype dataset.
 * NOTE: Pre-filled Edo words are explicitly marked with `isSampleData: true`
 * as unverified sample placeholders until real community verification is connected.
 */
export const INITIAL_EDO_ENTRIES: EdoEntry[] = [
  // Primary Teach Edo prompt #1 (matches Screen 3, 4, 5, 8 in reference)
  {
    id: 'word-hand',
    english: 'Hand',
    edoText: 'Obo',
    category: 'word',
    illustrationKey: 'hand',
    emoji: '🖐🏽',
    hasAudio: true,
    audioDurationSec: 3,
    status: 'sample_entry',
    isSampleData: true,
    updatedAt: '2026-10-26T09:00:00Z',
    notes: 'Sample prototype entry — can also be recorded fresh in Teach Edo'
  },
  {
    id: 'word-eye',
    english: 'Eye',
    edoText: 'Ogho',
    category: 'word',
    illustrationKey: 'eye',
    emoji: '👁️',
    hasAudio: true,
    audioDurationSec: 2,
    status: 'sample_entry',
    isSampleData: true,
    updatedAt: '2026-10-26T09:05:00Z',
    notes: 'Sample prototype entry (awaiting community verification)'
  },
  {
    id: 'word-water',
    english: 'Water',
    edoText: 'Omi',
    category: 'word',
    illustrationKey: 'water',
    emoji: '💧',
    hasAudio: true,
    audioDurationSec: 2,
    status: 'sample_entry',
    isSampleData: true,
    updatedAt: '2026-10-26T09:10:00Z',
    notes: 'Sample prototype entry (awaiting community verification)'
  },
  {
    id: 'word-food',
    english: 'Food',
    edoText: 'Imue',
    category: 'word',
    illustrationKey: 'food',
    emoji: '🍲',
    hasAudio: true,
    audioDurationSec: 3,
    status: 'sample_entry',
    isSampleData: true,
    updatedAt: '2026-10-26T09:15:00Z',
    notes: 'Sample prototype entry (awaiting community verification)'
  },
  {
    id: 'word-house',
    english: 'House',
    edoText: 'Uhunmwen',
    category: 'word',
    illustrationKey: 'house',
    emoji: '🏠',
    hasAudio: true,
    audioDurationSec: 3,
    status: 'sample_entry',
    isSampleData: true,
    updatedAt: '2026-10-26T09:20:00Z',
    notes: 'Sample prototype entry (awaiting community verification)'
  },
  // Help Others primary example (matches Screen 7 in reference: "Good morning" with audio needing writing)
  {
    id: 'phrase-good-morning',
    english: 'Good morning',
    edoText: undefined,
    category: 'phrase',
    illustrationKey: 'sun',
    emoji: '🌅',
    hasAudio: true,
    audioDurationSec: 4,
    status: 'needs_writing',
    isSampleData: true,
    updatedAt: '2026-10-26T09:25:00Z',
    notes: 'Voice recorded by community speaker — needs written Edo spelling'
  },
  // Help Others opposite case: Written contribution needing voice recording
  {
    id: 'phrase-welcome',
    english: 'Welcome / Come in',
    edoText: 'Koyo',
    category: 'phrase',
    illustrationKey: 'welcome',
    emoji: '🤝🏽',
    hasAudio: false,
    audioDurationSec: 0,
    status: 'needs_audio',
    isSampleData: true,
    updatedAt: '2026-10-26T09:30:00Z',
    notes: 'Written by contributor — needs voice pronunciation recording'
  },
  {
    id: 'phrase-thank-you',
    english: 'Thank you',
    edoText: undefined,
    category: 'phrase',
    illustrationKey: 'heart',
    emoji: '🙏🏽',
    hasAudio: true,
    audioDurationSec: 3,
    status: 'needs_writing',
    isSampleData: true,
    updatedAt: '2026-10-26T09:35:00Z',
    notes: 'Voice recorded — needs written Edo spelling'
  },
  {
    id: 'word-child',
    english: 'Child',
    edoText: 'Ovbi',
    category: 'word',
    illustrationKey: 'child',
    emoji: '🧒🏾',
    hasAudio: false,
    audioDurationSec: 0,
    status: 'needs_audio',
    isSampleData: true,
    updatedAt: '2026-10-26T09:40:00Z',
    notes: 'Sample written word — needs voice pronunciation recording'
  },
  {
    id: 'word-sun',
    english: 'Sun',
    edoText: undefined,
    category: 'word',
    illustrationKey: 'sun',
    emoji: '☀️',
    hasAudio: false,
    audioDurationSec: 0,
    status: 'unanswered',
    isSampleData: false,
    updatedAt: '2026-10-26T09:45:00Z'
  },
  {
    id: 'word-tree',
    english: 'Tree',
    edoText: undefined,
    category: 'word',
    illustrationKey: 'tree',
    emoji: '🌳',
    hasAudio: false,
    audioDurationSec: 0,
    status: 'unanswered',
    isSampleData: false,
    updatedAt: '2026-10-26T09:50:00Z'
  },
  {
    id: 'word-book',
    english: 'Book',
    edoText: undefined,
    category: 'word',
    illustrationKey: 'book',
    emoji: '📖',
    hasAudio: false,
    audioDurationSec: 0,
    status: 'unanswered',
    isSampleData: false,
    updatedAt: '2026-10-26T09:55:00Z'
  },
  {
    id: 'phrase-how-are-you',
    english: 'How are you?',
    edoText: undefined,
    category: 'sentence',
    illustrationKey: 'chat',
    emoji: '💬',
    hasAudio: false,
    audioDurationSec: 0,
    status: 'unanswered',
    isSampleData: false,
    updatedAt: '2026-10-26T10:00:00Z'
  }
];

// Extend the existing prompt collection without replacing saved contributions.
const additionalQuestions = [
  ['sentence-your-name', 'What is your name?'],
  ['sentence-going', 'Where are you going?'],
  ['sentence-coming', 'I am coming']
];
additionalQuestions.forEach(([id, english]) => INITIAL_EDO_ENTRIES.push({
  id, english, category: 'sentence', illustrationKey: 'chat', emoji: '💬',
  hasAudio: false, status: 'unanswered', isSampleData: false,
  updatedAt: '2026-10-28T00:00:00Z'
}));

/**
 * Questions ordered for the 10-question "Teach Edo" flow, starting with "Hand"
 */
export const TEACH_QUESTION_IDS: string[] = [
  'word-hand',
  'word-eye',
  'word-water',
  'word-food',
  'word-house',
  'word-sun',
  'word-tree',
  'word-book',
  'word-child',
  'phrase-how-are-you',
  'phrase-good-morning',
  'phrase-thank-you',
  ...additionalQuestions.map(([id]) => id)
];

// Version 1 is retained untouched as a migration safety copy. Version 2 commits
// entries, immutable audio records, and pending operations together in one atomic snapshot.
export const LIBRARY_STORAGE_KEY = 'edo_language_studio_library_v2';
let transactionTail: Promise<unknown> = Promise.resolve();
async function transaction<T>(action: () => Promise<T>): Promise<T> {
  const run = async () => {
    if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request('edo-library-v2', action);
    return action();
  };
  const result = transactionTail.then(run, run);
  transactionTail = result.catch(() => undefined);
  return result;
}
async function commitLibrary(library: LocalLibrary): Promise<void> {
  const withoutAudio = (entry: EdoEntry) => {
    if (!entry.recordingId) return entry;
    const { audioDataUrl: _audio, ...metadata } = entry;
    return metadata;
  };
  const compact = { ...library, entries: library.entries.map(withoutAudio), recordings: library.recordings.map(recording => ({ ...recording, originalLesson: withoutAudio(recording.originalLesson) })) };
  const value = JSON.stringify({ library: compact, sha256: await digest(canonical(compact)) });
  try { await writeLibrarySnapshot(LIBRARY_STORAGE_KEY, value); }
  catch { throw new Error('Unable to save on this device. Storage may be full. Existing recordings and the previous library are unchanged. Export a backup before freeing space.'); }
}
async function readLibrary(): Promise<LocalLibrary> {
  const value = await readLibrarySnapshot(LIBRARY_STORAGE_KEY);
  if (value !== null) {
    const stored = JSON.parse(value);
    if (!stored.library || stored.library.version !== 2 || !Array.isArray(stored.library.entries) || !Array.isArray(stored.library.recordings) || !Array.isArray(stored.library.syncQueue) || await digest(canonical(stored.library)) !== stored.sha256) throw new Error('Saved library integrity check failed. Existing data has not been overwritten.');
    const library = stored.library as LocalLibrary;
    const hydrate = (entry: EdoEntry): EdoEntry => entry.recordingId ? { ...entry, audioDataUrl: library.recordings.find(recording => recording.id === entry.recordingId)?.audioDataUrl } : entry;
    return { ...library, entries: library.entries.map(hydrate), recordings: library.recordings.map(recording => ({ ...recording, originalLesson: hydrate(recording.originalLesson) })) };
  }
  let legacy: string | null = null;
  try { legacy = (await Preferences.get({ key: STORAGE_KEY })).value; } catch { /* Original web fallback */ }
  legacy ??= localStorage.getItem(STORAGE_KEY);
  const parsed = legacy === null ? INITIAL_EDO_ENTRIES : JSON.parse(legacy) as EdoEntry[];
  const library = await protectEntries(parsed);
  await commitLibrary(library);
  return library;
}
export async function loadLibrary(): Promise<LocalLibrary> {
  return transaction(async () => {
    const library = await readLibrary();
    const ids = new Set(library.entries.map(entry => entry.id));
    const missing = INITIAL_EDO_ENTRIES.filter(entry => !ids.has(entry.id));
    if (!missing.length) return library;
    const extended = await protectEntries([...library.entries, ...missing], library);
    await commitLibrary(extended);
    return extended;
  });
}
export async function loadEntries(): Promise<EdoEntry[]> { return (await loadLibrary()).entries; }
export async function saveEntries(entries: EdoEntry[], expectedEntries?: EdoEntry[]): Promise<EdoEntry[]> {
  return transaction(async () => {
    const previous = await readLibrary();
    if (expectedEntries && canonical(previous.entries) !== canonical(expectedEntries)) throw new Error('The library changed while you were editing. The latest data has been preserved; review it and try again.');
    const library = await protectEntries(entries, previous);
    await commitLibrary(library);
    return library.entries;
  });
}
export async function exportLibrary(): Promise<string> {
  return transaction(async () => makeBackup(await readLibrary()));
}
export async function importLibrary(text: string) {
  // Entire file is validated before acquiring storage or changing any data.
  const backup = await parseBackup(text);
  return transaction(async () => {
    const result = await mergeBackup(await readLibrary(), backup);
    await commitLibrary(result.library);
    return result;
  });
}
export async function saveRecordingInformation(id: string, speaker: ProtectedRecording['speaker'], permissions: ProtectedRecording['permissions']): Promise<LocalLibrary> {
  validatePermissions(permissions);
  if (!speaker.id || typeof speaker.name !== 'string' || typeof speaker.dialect !== 'string') throw new Error('Invalid speaker information.');
  return transaction(async () => {
    const library = await readLibrary();
    const index = library.recordings.findIndex(recording => recording.id === id);
    if (index < 0) throw new Error('Recording was not found.');
    if (speaker.id !== library.recordings[index].speaker.id) throw new Error('Speaker identifiers cannot be changed.');
    const metadata = { speaker, permissions: { ...permissions, updatedAt: new Date().toISOString() } };
    const revision = await digest(canonical(metadata));
    const recording = { ...library.recordings[index], ...metadata };
    const updated = { ...library, recordings: library.recordings.map((item, i) => i === index ? recording : item), syncQueue: library.syncQueue.filter(item => !(item.recordingId === id && item.operation === 'update_recording_metadata')) };
    updated.syncQueue.push({ id: `metadata-${id}-${revision}`, lessonId: recording.originalLesson.id, recordingId: id, operation: 'update_recording_metadata', revision, status: 'pending', attempts: 0, createdAt: new Date().toISOString() });
    await commitLibrary(updated);
    return updated;
  });
}

export function lessonProgress(entries: EdoEntry[]) {
  const completed = entries.filter(entry => !entry.isSampleData && Boolean(entry.audioDataUrl)).length;
  const waiting = TEACH_QUESTION_IDS.filter(id => !entries.some(entry => entry.id === id && !entry.isSampleData && entry.audioDataUrl)).length;
  return { completed, waiting };
}

/**
 * Saves an audio recording locally using Capacitor Filesystem on native iOS/Android,
 * and returns a playable URI / Data URL.
 */
export async function saveAudioFileLocally(entryId: string, audioDataUrl: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { mimeType } = originalAudio(audioDataUrl);
      const extension = ({ 'audio/mp4': 'mp4', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3' } as Record<string, string>)[mimeType.split(';')[0].toLowerCase()] || 'audio';
      const fileName = `edo_voice_${crypto.randomUUID()}.${extension}`;
      const base64Data = audioDataUrl.includes(',')
        ? audioDataUrl.split(',')[1]
        : audioDataUrl;

      await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Data,
      });
    } catch (err) {
      console.warn('Native filesystem write skipped, keeping data URL in Preferences:', err);
    }
  }
  return audioDataUrl;
}

export async function resetToDefaultData(): Promise<EdoEntry[]> {
  await saveEntries(INITIAL_EDO_ENTRIES);
  return INITIAL_EDO_ENTRIES;
}

export function computeStudioStats(entries: EdoEntry[]): StudioStats {
  // Only real contributions (!isSampleData) that have actual recorded audio or submitted spelling
  const realEntries = entries.filter(
    (e) => !e.isSampleData && (e.hasAudio || Boolean(e.edoText && e.edoText.trim()) || e.status === 'awaiting_review')
  );

  // Count each unique English word only once under Words Collected
  const uniqueWords = new Set(
    realEntries
      .filter((e) => e.category === 'word' && (e.hasAudio || Boolean(e.edoText && e.edoText.trim())) && e.english.trim())
      .map((e) => e.english.trim().toLowerCase())
  );
  const wordsCollected = uniqueWords.size;

  // Count each valid Edo audio recording under Voice Recordings, without counting duplicates
  const voiceRecordings = realEntries.filter(
    (e) => e.hasAudio && (Boolean(e.audioDataUrl) || Boolean(e.cloudAudioFileId) || Boolean(e.recordingId))
  ).length;

  // Count each word with a submitted Edo spelling under Written Words
  const writtenWords = realEntries.filter(
    (e) => e.category === 'word' && Boolean(e.edoText && e.edoText.trim())
  ).length;

  // Count actual contributed phrases and sentences under Phrases & Sentences
  const phrasesAndSentences = realEntries.filter(
    (e) => (e.category === 'phrase' || e.category === 'sentence') && (e.hasAudio || Boolean(e.edoText && e.edoText.trim()))
  ).length;

  // Recalculate Review Queue and Needs Help numbers from actual contribution statuses
  const reviewQueueCount = realEntries.filter((e) => e.status === 'awaiting_review').length;
  const needsHelpCount = entries.filter(
    (e) => !e.isSampleData && (e.status === 'needs_writing' || e.status === 'needs_audio')
  ).length;

  return {
    wordsCollected,
    voiceRecordings,
    writtenWords,
    phrasesAndSentences,
    totalContributions: realEntries.length,
    reviewQueueCount,
    needsHelpCount,

    // Aliases ensuring any legacy callers stay consistent
    demoWordsCollected: wordsCollected,
    demoVoiceRecordings: voiceRecordings,
    demoWrittenWords: writtenWords,
    demoPhrasesAndSentences: phrasesAndSentences,
    localContributionsCount: realEntries.length,
    localVoiceCount: voiceRecordings,
    localWrittenCount: writtenWords,
    localNeedsHelpCount: needsHelpCount,
    localAwaitingReviewCount: reviewQueueCount
  };
}
