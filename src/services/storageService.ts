import { Preferences } from '@capacitor/preferences';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { EdoEntry, StudioStats } from '../types/edo';

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
  'phrase-how-are-you'
];

export async function loadEntries(): Promise<EdoEntry[]> {
  try {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    if (value) {
      const parsed = JSON.parse(value) as EdoEntry[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Preferences load fallback to localStorage:', err);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as EdoEntry[];
    }
  }
  await saveEntries(INITIAL_EDO_ENTRIES);
  return INITIAL_EDO_ENTRIES;
}

export async function saveEntries(entries: EdoEntry[]): Promise<void> {
  const serialized = JSON.stringify(entries);
  try {
    await Preferences.set({ key: STORAGE_KEY, value: serialized });
  } catch {
    // Fallback for web environments
  }
  try {
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Ignore storage quota errors in private browsing
  }
}

/**
 * Saves an audio recording locally using Capacitor Filesystem on native iOS/Android,
 * and returns a playable URI / Data URL.
 */
export async function saveAudioFileLocally(entryId: string, audioDataUrl: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    try {
      const fileName = `edo_voice_${entryId}_${Date.now()}.webm`;
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
  const localEntries = entries.filter((e) => !e.isSampleData);
  const localVoiceCount = entries.filter((e) => !e.isSampleData && e.hasAudio).length;
  const localWrittenCount = entries.filter((e) => !e.isSampleData && Boolean(e.edoText?.trim())).length;
  const localNeedsHelpCount = entries.filter(
    (e) => e.status === 'needs_writing' || e.status === 'needs_audio'
  ).length;
  const localAwaitingReviewCount = entries.filter((e) => e.status === 'awaiting_review').length;

  return {
    // Clearly labeled demonstration numbers from reference UI + live local delta
    demoWordsCollected: 2530 + localEntries.length,
    demoVoiceRecordings: 1840 + localVoiceCount,
    demoWrittenWords: 1200 + localWrittenCount,
    demoPhrasesAndSentences: 320 + entries.filter((e) => e.category !== 'word' && !e.isSampleData).length,
    localContributionsCount: localEntries.length,
    localVoiceCount,
    localWrittenCount,
    localNeedsHelpCount,
    localAwaitingReviewCount
  };
}
