import starterVocabularyData from '../data/englishVocabulary.json';
import { EdoEntry, EntryCategory } from '../types/edo';

const VOCAB_CACHE_KEY = 'edo_online_vocabulary_v1';
const LAST_FETCH_KEY = 'edo_online_vocab_last_fetch_ts';
const FETCH_COOLDOWN_MS = 30000; // 30-second cooldown between background fetches

export interface RawVocabularyItem {
  id: string;
  english: string;
  category: string;
  icon?: string;
  emoji?: string;
  pronunciation?: string;
  source?: string;
}

/**
 * Normalizes English text for exact duplicate prevention across starter, online, and community records.
 */
export function normalizeEnglish(text: string): string {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Maps starter catalog JSON items into standard EdoEntry prompts.
 */
function mapRawToEdoEntry(item: RawVocabularyItem): EdoEntry {
  const words = item.english.trim().split(/\s+/);
  let category: EntryCategory = 'word';
  if (words.length > 2 || item.english.includes('?') || item.english.includes('!')) {
    category = item.english.includes('?') || item.english.includes('!') ? 'sentence' : 'phrase';
  }

  return {
    id: item.id,
    english: item.english,
    category: category,
    topic: item.category,
    illustrationKey: item.id.replace(/^(word|phrase|sentence)-/, ''),
    icon: item.icon || 'BookOpen',
    emoji: item.emoji || '🗣️',
    hasAudio: false,
    audioDurationSec: 0,
    status: 'unanswered',
    isSampleData: false,
    updatedAt: '2026-10-29T12:00:00Z',
    notes: item.pronunciation ? `Pronunciation: /${item.pronunciation}/` : undefined
  };
}

/**
 * Returns all built-in starter vocabulary prompts (130+ entries).
 */
export function getStarterVocabulary(): EdoEntry[] {
  return (starterVocabularyData as RawVocabularyItem[]).map(mapRawToEdoEntry);
}

/**
 * Reads dynamically discovered online vocabulary cached on this device.
 */
export function getCachedOnlineVocabulary(): EdoEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(VOCAB_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (err) {
    console.warn('Failed to parse cached online vocabulary:', err);
    return [];
  }
}

/**
 * Saves discovered online vocabulary entries to local device storage.
 */
function saveCachedOnlineVocabulary(entries: EdoEntry[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(VOCAB_CACHE_KEY, JSON.stringify(entries));
  } catch (err) {
    console.warn('Failed to cache online vocabulary:', err);
  }
}

/**
 * Topic clusters for Datamuse API discovery.
 */
const ONLINE_TOPICS = [
  'movement',
  'transport',
  'family',
  'kitchen',
  'village',
  'nature',
  'animals',
  'weather',
  'market',
  'tools',
  'clothes',
  'body',
  'music',
  'food',
  'health'
];

const TOPIC_ICON_MAP: Record<string, { icon: string; emoji: string }> = {
  movement: { icon: 'Footprints', emoji: '🚶🏽' },
  transport: { icon: 'Bus', emoji: '🚌' },
  family: { icon: 'Users', emoji: '👨‍👩‍👧' },
  kitchen: { icon: 'Utensils', emoji: '🍳' },
  village: { icon: 'Home', emoji: '🏡' },
  nature: { icon: 'Trees', emoji: '🌿' },
  animals: { icon: 'Activity', emoji: '🐾' },
  weather: { icon: 'CloudRain', emoji: '🌦️' },
  market: { icon: 'ShoppingBag', emoji: '🛍️' },
  tools: { icon: 'Briefcase', emoji: '🔧' },
  clothes: { icon: 'Layers', emoji: '👕' },
  body: { icon: 'Heart', emoji: '❤️' },
  music: { icon: 'Music', emoji: '🎵' },
  food: { icon: 'Apple', emoji: '🍲' },
  health: { icon: 'Activity', emoji: '🏥' }
};

// Profanity / non-everyday filter
const BLOCKED_WORDS = new Set([
  'hell', 'damn', 'crap', 'bitch', 'cock', 'piss', 'nigger', 'fag', 'slut', 'whore',
  'sex', 'porn', 'penis', 'vagina', 'erotic', 'naked', 'drug', 'weed', 'kill', 'murder'
]);

/**
 * Fetches additional common everyday English words from Datamuse in the background.
 * - Free, no API key required, generous 100k requests/day quota, CORS-supported.
 * - Filters for high-frequency everyday words.
 * - Deduplicates against all existing starter and community words.
 * - Resilient: Fails silently if offline without interrupting the user.
 */
export async function fetchMoreOnlineVocabulary(
  existingEnglishTexts: Set<string>
): Promise<EdoEntry[]> {
  try {
    if (typeof localStorage !== 'undefined') {
      const lastFetch = Number(localStorage.getItem(LAST_FETCH_KEY) || 0);
      if (Date.now() - lastFetch < FETCH_COOLDOWN_MS) {
        return [];
      }
      localStorage.setItem(LAST_FETCH_KEY, String(Date.now()));
    }

    // Pick a random topic to discover fresh everyday words
    const topic = ONLINE_TOPICS[Math.floor(Math.random() * ONLINE_TOPICS.length)];
    const url = `https://api.datamuse.com/words?topics=${encodeURIComponent(topic)}&md=f&max=40`;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 6000);

    const response = await fetch(url, {
      signal: controller.signal,
      mode: 'cors'
    });
    window.clearTimeout(timeoutId);

    if (!response.ok) return [];

    const data: Array<{ word: string; score?: number; tags?: string[] }> = await response.json();
    if (!Array.isArray(data)) return [];

    const cached = getCachedOnlineVocabulary();
    const existingNormalized = new Set<string>();

    for (const text of existingEnglishTexts) {
      existingNormalized.add(normalizeEnglish(text));
    }
    for (const entry of cached) {
      existingNormalized.add(normalizeEnglish(entry.english));
    }

    const newEntries: EdoEntry[] = [];
    const iconMeta = TOPIC_ICON_MAP[topic] || { icon: 'BookOpen', emoji: '🗣️' };

    for (const item of data) {
      const rawWord = String(item.word || '').trim();
      if (!rawWord || rawWord.length < 3 || rawWord.length > 25) continue;
      if (!/^[a-zA-Z\s-]+$/.test(rawWord)) continue;

      const norm = normalizeEnglish(rawWord);
      if (existingNormalized.has(norm)) continue;
      if (BLOCKED_WORDS.has(norm)) continue;

      // Check frequency score: "f:12.34"
      // Words with higher f: score are true everyday English vocabulary
      let freqScore = 0;
      if (Array.isArray(item.tags)) {
        for (const tag of item.tags) {
          if (tag.startsWith('f:')) {
            freqScore = parseFloat(tag.slice(2)) || 0;
            break;
          }
        }
      }

      // Keep words with healthy everyday frequency (> 4.0 in Datamuse index)
      if (freqScore > 0 && freqScore < 4.0) continue;

      // Capitalize first letter
      const capitalized = rawWord.charAt(0).toUpperCase() + rawWord.slice(1);
      const slug = norm.replace(/\s+/g, '-');
      const id = `online-${slug}`;

      const entry: EdoEntry = {
        id: id,
        english: capitalized,
        category: 'word',
        topic: topic.charAt(0).toUpperCase() + topic.slice(1),
        illustrationKey: slug,
        icon: iconMeta.icon,
        emoji: iconMeta.emoji,
        hasAudio: false,
        audioDurationSec: 0,
        status: 'unanswered',
        isSampleData: false,
        updatedAt: new Date().toISOString()
      };

      newEntries.push(entry);
      existingNormalized.add(norm);

      if (newEntries.length >= 15) break; // Batch of 15 new words at a time
    }

    if (newEntries.length > 0) {
      const updatedCache = [...cached, ...newEntries];
      saveCachedOnlineVocabulary(updatedCache);
    }

    return newEntries;
  } catch (err) {
    // Offline or network error: fail silently, return empty list
    return [];
  }
}

/**
 * Returns complete combined catalog:
 * Starter vocabulary (130+ items) + Cached online vocabulary
 */
export function getAllVocabularyPrompts(): EdoEntry[] {
  const starter = getStarterVocabulary();
  const cachedOnline = getCachedOnlineVocabulary();

  const seenNormalized = new Set<string>();
  const combined: EdoEntry[] = [];

  for (const entry of starter) {
    const norm = normalizeEnglish(entry.english);
    if (!seenNormalized.has(norm)) {
      seenNormalized.add(norm);
      combined.push(entry);
    }
  }

  for (const entry of cachedOnline) {
    const norm = normalizeEnglish(entry.english);
    if (!seenNormalized.has(norm)) {
      seenNormalized.add(norm);
      combined.push(entry);
    }
  }

  return combined;
}
