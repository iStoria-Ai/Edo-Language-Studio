import verifiedSubjects from '../data/vocabularyPictureSubjects.json';
import starterVocabularyData from '../data/englishVocabulary.json';
import { readLibrarySnapshot, writeLibrarySnapshot } from './localLibraryStore';
/**
 * Curated Vocabulary Image Service
 * Provides authentic, high-quality, properly licensed photographs and illustrations
 * for Edo Language Studio vocabulary.
 *
 * All static starter images are stored locally with the app in public/assets/vocabulary/
 * and work 100% offline without live Google Search or Drive dependencies.
 */

import { normalizeEnglish } from './vocabularyService';

export interface ImageAttribution {
  provider: 'unsplash' | 'wikimedia' | 'curated_studio';
  license: string;
  photographer?: string;
  sourceUrl?: string;
}

// Map from normalized English text or ID to the curated asset filename
const CURATED_IMAGE_FILENAMES: Record<string, string> = {
  // Body
  'hand': 'word-hand.jpg',
  'hands': 'word-hand.jpg',
  'eye': 'word-eye.jpg',
  'eyes': 'word-eye.jpg',
  'head': 'body-head.jpg',
  'ear': 'body-ear.jpg',
  'ears': 'body-ear.jpg',
  'nose': 'body-nose.jpg',
  'mouth': 'body-mouth.jpg',
  'foot': 'body-foot.jpg',
  'feet': 'body-foot.jpg',
  'leg': 'body-leg.jpg',
  'legs': 'body-leg.jpg',
  'arm': 'body-arm.jpg',
  'arms': 'body-arm.jpg',
  'heart': 'body-heart.jpg',

  // Movement
  'go': 'move-go.jpg',
  'come': 'move-come.jpg',
  'where are you going': 'sentence-going.jpg',
  'i am coming': 'sentence-coming.jpg',
  'walk': 'move-walk.jpg',
  'run': 'move-run.jpg',
  'stop': 'move-stop.jpg',
  'enter': 'move-enter.jpg',
  'leave': 'move-leave.jpg',
  'return': 'move-return.jpg',
  'sit': 'move-sit.jpg',
  'stand': 'move-stand.jpg',
  'climb': 'move-climb.jpg',
  'fall': 'move-fall.jpg',

  // Transport
  'bus': 'transport-bus.jpg',
  'car': 'transport-car.jpg',
  'bicycle': 'transport-bicycle.jpg',
  'train': 'transport-train.jpg',
  'airplane': 'transport-airplane.jpg',
  'boat': 'transport-boat.jpg',
  'road': 'transport-road.jpg',
  'driver': 'transport-driver.jpg',
  'truck': 'transport-truck.jpg',
  'journey': 'transport-journey.jpg',

  // Home & Household
  'house': 'word-house.jpg',
  'home': 'word-house.jpg',
  'door': 'home-door.jpg',
  'window': 'home-window.jpg',
  'room': 'home-room.jpg',
  'bed': 'home-bed.jpg',
  'chair': 'home-chair.jpg',
  'table': 'home-table.jpg',
  'kitchen': 'home-kitchen.jpg',
  'roof': 'home-roof.jpg',
  'floor': 'home-floor.jpg',
  'key': 'home-key.jpg',
  'lamp': 'home-lamp.jpg',
  'cup': 'home-cup.jpg',
  'cups': 'home-cup.jpg',

  // Family & People
  'mother': 'family-mother.jpg',
  'nursing mother': 'family-nursing-mother.jpg',
  'father': 'family-father.jpg',
  'child': 'word-child.jpg',
  'children': 'word-child.jpg',
  'baby': 'family-baby.jpg',
  'brother': 'family-brother.jpg',
  'sister': 'family-sister.jpg',
  'grandmother': 'family-grandmother.jpg',
  'grandfather': 'family-grandfather.jpg',
  'friend': 'family-friend.jpg',
  'friends': 'family-friend.jpg',
  'family': 'family-family.jpg',

  // Food
  'food': 'word-food.jpg',
  'water': 'word-water.jpg',
  'rice': 'food-rice.jpg',
  'bread': 'food-bread.jpg',
  'meat': 'food-meat.jpg',
  'fish': 'food-fish.jpg',
  'soup': 'food-soup.jpg',
  'fruit': 'food-fruit.jpg',
  'fruits': 'food-fruit.jpg',
  'vegetables': 'food-vegetables.jpg',
  'yam': 'food-yam.jpg',
  'salt': 'food-salt.jpg',
  'oil': 'food-oil.jpg',
  'pepper': 'food-pepper.jpg',
  'egg': 'food-egg.jpg',
  'eggs': 'food-egg.jpg',
  'banana': 'food-banana.jpg',
  'bananas': 'food-banana.jpg',

  // Actions
  'eat': 'action-eat.jpg',
  'drink': 'action-drink.jpg',
  'sleep': 'action-sleep.jpg',
  'talk': 'action-talk.jpg',
  'listen': 'action-listen.jpg',
  'speak': 'action-speak.jpg',
  'read': 'action-read.jpg',
  'write': 'action-write.jpg',
  'work': 'action-work.jpg',
  'sing': 'action-sing.jpg',
  'dance': 'action-dance.jpg',
  'laugh': 'action-laugh.jpg',
  'buy': 'action-buy.jpg',
  'sell': 'action-sell.jpg',
  'cook': 'action-cook.jpg',
  'wash': 'action-wash.jpg',

  // Places
  'school': 'place-school.jpg',
  'church': 'place-church.jpg',
  'hospital': 'place-hospital.jpg',
  'market': 'place-market.jpg',
  'shop': 'place-shop.jpg',
  'office': 'place-office.jpg',
  'farm': 'place-farm.jpg',
  'town': 'place-town.jpg',
  'village': 'place-village.jpg',

  // Nature & Spiritual
  'god': 'spiritual-god.jpg',
  'tree': 'word-tree.jpg',
  'trees': 'word-tree.jpg',
  'sun': 'word-sun.jpg',
  'rain': 'nature-rain.jpg',
  'river': 'nature-river.jpg',
  'sky': 'nature-sky.jpg',
  'earth': 'nature-earth.jpg',
  'fire': 'nature-fire.jpg',
  'wind': 'nature-wind.jpg',
  'moon': 'nature-moon.jpg',
  'star': 'nature-star.jpg',
  'stars': 'nature-star.jpg',
  'stone': 'nature-stone.jpg',
  'mountain': 'nature-mountain.jpg',

  // Daily expressions & Animals & Objects
  'good morning': 'phrase-good-morning.jpg',
  'good afternoon': 'phrase-good-afternoon.jpg',
  'good evening': 'phrase-good-evening.jpg',
  'thank you': 'phrase-thank-you.jpg',
  'please': 'phrase-please.jpg',
  'welcome': 'phrase-welcome.jpg',
  'come here': 'phrase-come-here.jpg',
  'what is your name': 'sentence-your-name.jpg',
  'how are you': 'phrase-how-are-you.jpg',
  'yes': 'phrase-yes.jpg',
  'no': 'phrase-no.jpg',
  'goodbye': 'phrase-goodbye.jpg',
  'book': 'word-book.jpg',
  'books': 'word-book.jpg',
  'money': 'tool-money.jpg',
  'dog': 'animal-dog.jpg',
  'dogs': 'animal-dog.jpg',
  'cat': 'animal-cat.jpg',
  'cats': 'animal-cat.jpg',
  'bird': 'animal-bird.jpg',
  'birds': 'animal-bird.jpg',
  'goat': 'animal-goat.jpg',
  'goats': 'animal-goat.jpg',
  'shirt': 'clothes-shirt.jpg',
  'shoes': 'clothes-shoes.jpg',
  'today': 'time-today.jpg',
  'tomorrow': 'time-tomorrow.jpg',
  'night': 'time-night.jpg'
};

// Ensure all starter vocabulary items map to their curated image asset
for (const item of (starterVocabularyData as Array<{ id: string; english: string }>)) {
  const norm = normalizeEnglish(item.english);
  if (norm && !CURATED_IMAGE_FILENAMES[norm]) {
    CURATED_IMAGE_FILENAMES[norm] = `${item.id}.jpg`;
  }
}

const ONLINE_IMAGES_CACHE_KEY = 'edo_online_vocabulary_images_v1';

// In-memory image registry and state
const inMemoryCache = new Map<string, string>();
const failedSearches = new Set<string>();
const discoveryQueue: { english: string; category?: string; id?: string }[] = [];
const queuedWords = new Set<string>();
const activeSearches = new Set<string>();
const imageListeners = new Set<(wordNorm: string, url: string) => void>();
let activeFetchCount = 0;
const MAX_CONCURRENT_SEARCHES = 2;
let throttleTimer: number | null = null;

/**
 * Returns the base URL for static assets respecting Vite's base path.
 */
function getBaseUrl(): string {
  try {
    return import.meta.env?.BASE_URL || '/';
  } catch (_) {
    return '/';
  }
}

/**
 * Subscribes to real-time background image updates.
 */
export function subscribeImageUpdates(callback: (wordNorm: string, url: string) => void): () => void {
  imageListeners.add(callback);
  return () => {
    imageListeners.delete(callback);
  };
}

function notifyImageListeners(wordNorm: string, url: string): void {
  for (const listener of imageListeners) {
    try {
      listener(wordNorm, url);
    } catch {
      // Ignore listener error
    }
  }
}

/**
 * Resolves the picture URL for an English word, id, or illustrationKey.
 */
export function getVocabularyImageUrl(params: {
  id?: string;
  english?: string;
  illustrationKey?: string;
  imageUrl?: string;
  skipLocalCache?: boolean;
}): string {
  const verifiedSubject = normalizeEnglish(params.english || '');
  const subjectAsset = (verifiedSubjects as Record<string, string>)[verifiedSubject];
  if (subjectAsset) {
    const base = getBaseUrl();
    return `${base.endsWith('/') ? base : base + '/'}assets/vocabulary/verified/${subjectAsset}.svg`;
  }
  if (verifiedSubject === 'yam') return '';

  // 1. Explicit image URL already provided
  if (params.imageUrl && params.imageUrl.trim()) {
    return params.imageUrl;
  }

  const baseUrl = getBaseUrl();
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

  // 2. Exact match by ID in curated set
  if (params.id) {
    const filenameById = `${params.id}.jpg`;
    if (Object.values(CURATED_IMAGE_FILENAMES).includes(filenameById)) {
      return `${cleanBase}assets/vocabulary/${filenameById}`;
    }
  }

  // 3. Match by normalized English text
  if (params.english) {
    const norm = normalizeEnglish(params.english);

    // In-memory cache check (0ms immediate return)
    if (inMemoryCache.has(norm)) {
      return inMemoryCache.get(norm)!;
    }

    // Direct curated dictionary lookup
    const filename = CURATED_IMAGE_FILENAMES[norm];
    if (filename) {
      return `${cleanBase}assets/vocabulary/${filename}`;
    }

    // Singular form heuristics (e.g. "birds" -> "bird", "dogs" -> "dog", "cups" -> "cup")
    if (norm.endsWith('ies') && norm.length > 3) {
      const sing = norm.slice(0, -3) + 'y';
      if (CURATED_IMAGE_FILENAMES[sing]) return `${cleanBase}assets/vocabulary/${CURATED_IMAGE_FILENAMES[sing]}`;
    } else if (norm.endsWith('es') && norm.length > 2) {
      const sing = norm.slice(0, -2);
      if (CURATED_IMAGE_FILENAMES[sing]) return `${cleanBase}assets/vocabulary/${CURATED_IMAGE_FILENAMES[sing]}`;
    } else if (norm.endsWith('s') && norm.length > 1) {
      const sing = norm.slice(0, -1);
      if (CURATED_IMAGE_FILENAMES[sing]) return `${cleanBase}assets/vocabulary/${CURATED_IMAGE_FILENAMES[sing]}`;
    }

    // Check persistent storage for dynamically discovered images
    try {
      if (!params.skipLocalCache && typeof localStorage !== 'undefined') {
        const cached = localStorage.getItem(ONLINE_IMAGES_CACHE_KEY);
        if (cached) {
          const map = JSON.parse(cached);
          if (map[norm]) {
            inMemoryCache.set(norm, map[norm]);
            return map[norm];
          }
        }
      }
    } catch (_) {}
  }

  // 4. Match by illustrationKey
  if (params.illustrationKey) {
    const normKey = normalizeEnglish(params.illustrationKey);
    const filename = CURATED_IMAGE_FILENAMES[normKey];
    if (filename) {
      return `${cleanBase}assets/vocabulary/${filename}`;
    }
  }

  return '';
}

/**
 * Moves on-screen visible words to the front of the image discovery queue.
 */
export function prioritizeImageDiscovery(englishWords: string[]): void {
  if (!englishWords || englishWords.length === 0) return;
  const toMove: { english: string; category?: string; id?: string }[] = [];

  for (const word of englishWords) {
    const norm = normalizeEnglish(word);
    if (!norm || getVocabularyImageUrl({ english: word }) || failedSearches.has(norm)) continue;
    const idx = discoveryQueue.findIndex(item => normalizeEnglish(item.english) === norm);
    if (idx !== -1) {
      toMove.push(discoveryQueue.splice(idx, 1)[0]);
    } else if (!queuedWords.has(norm)) {
      queuedWords.add(norm);
      toMove.push({ english: word });
    }
  }

  if (toMove.length > 0) {
    discoveryQueue.unshift(...toMove);
    processImageDiscoveryQueue();
  }
}

/**
 * Enqueues an English vocabulary word for quiet background image discovery.
 */
export function enqueueImageDiscovery(english: string, category?: string, id?: string): void {
  const norm = normalizeEnglish(english);
  if (!norm) return;
  if (getVocabularyImageUrl({ english, id })) return;
  if (failedSearches.has(norm) || queuedWords.has(norm) || activeSearches.has(norm)) return;

  queuedWords.add(norm);
  discoveryQueue.push({ english, category, id });
  processImageDiscoveryQueue();
}

/**
 * Background worker to fetch missing images quietly with limited concurrency (max 2 parallel).
 */
function processImageDiscoveryQueue(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  while (activeFetchCount < MAX_CONCURRENT_SEARCHES && discoveryQueue.length > 0) {
    const item = discoveryQueue.shift();
    if (!item) break;
    const norm = normalizeEnglish(item.english);
    queuedWords.delete(norm);

    // If already resolved or failed, skip
    if (getVocabularyImageUrl({ english: item.english, id: item.id }) || failedSearches.has(norm)) {
      continue;
    }

    activeFetchCount++;
    activeSearches.add(norm);

    void (async () => {
      try {
        const url = await discoverOnlineVocabularyImage(item.english, item.category);
        if (url) {
          inMemoryCache.set(norm, url);
          notifyImageListeners(norm, url);
        } else {
          failedSearches.add(norm);
        }
      } catch {
        failedSearches.add(norm);
      } finally {
        activeSearches.delete(norm);
        activeFetchCount--;

        if (!throttleTimer) {
          throttleTimer = window.setTimeout(() => {
            throttleTimer = null;
            processImageDiscoveryQueue();
          }, 200);
        }
      }
    })();
  }
}

/**
 * Discovers and caches a licensed picture for dynamically discovered online vocabulary.
 * Uses Wikimedia Commons API (CC0 / CC-BY, free, CORS-enabled, no API key).
 */
export async function discoverOnlineVocabularyImage(englishWord: string, category?: string): Promise<string | null> {
  const norm = normalizeEnglish(englishWord);
  if (!norm || norm === 'yam') return null;

  // Check if we already have a curated static picture
  const staticUrl = getVocabularyImageUrl({ english: englishWord });
  if (staticUrl) return staticUrl;

  // Check in-memory cache
  if (inMemoryCache.has(norm)) return inMemoryCache.get(norm)!;

  // Check cached dynamic images in localStorage
  try {
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem(ONLINE_IMAGES_CACHE_KEY);
      if (cached) {
        const map = JSON.parse(cached);
        if (map[norm]) {
          inMemoryCache.set(norm, map[norm]);
          return map[norm];
        }
      }
    }
  } catch (_) {}

  // Check persistent storage snapshot
  try {
    const stored = await readLibrarySnapshot('edo_vocabulary_image_' + norm);
    if (stored && typeof stored === 'string' && stored.startsWith('http')) {
      inMemoryCache.set(norm, stored);
      return stored;
    }
  } catch (_) {}

  // Context-aware search term for ambiguous words
  let searchTerm = englishWord.trim();
  if (category && category !== 'Other' && category !== 'Words' && category !== 'Phrases') {
    if (norm === 'head' && category === 'Body') searchTerm = 'Human head';
    else if (norm === 'cup') searchTerm = 'Coffee cup';
    else if (norm === 'god') searchTerm = 'Sunrise sunlight';
    else if (norm === 'nursing mother') searchTerm = 'Breastfeeding infant';
  }

  // Fetch from Wikimedia Commons PageImages API (properly licensed CC0 / CC-BY, CORS enabled)
  try {
    const endpoint = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      searchTerm
    )}&prop=pageimages&format=json&pithumbsize=500&origin=*`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      const pages = data?.query?.pages;
      if (pages) {
        const firstPageKey = Object.keys(pages)[0];
        const thumbnail = pages[firstPageKey]?.thumbnail?.source;
        if (thumbnail && typeof thumbnail === 'string' && thumbnail.startsWith('http')) {
          saveDiscoveredImage(norm, thumbnail);
          return thumbnail;
        }
      }
    }

    // Fallback search with generator query if exact title did not match
    const searchEndpoint = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
      englishWord
    )}&gsrlimit=1&prop=pageimages&pithumbsize=500&format=json&origin=*`;

    const searchController = new AbortController();
    const searchTimer = setTimeout(() => searchController.abort(), 6000);
    const searchRes = await fetch(searchEndpoint, { signal: searchController.signal });
    clearTimeout(searchTimer);

    if (searchRes.ok) {
      const sData = await searchRes.json();
      const sPages = sData?.query?.pages;
      if (sPages) {
        const first = Object.values(sPages)[0] as { thumbnail?: { source?: string } } | undefined;
        const sThumbnail = first?.thumbnail?.source;
        if (sThumbnail && typeof sThumbnail === 'string' && sThumbnail.startsWith('http')) {
          saveDiscoveredImage(norm, sThumbnail);
          return sThumbnail;
        }
      }
    }
  } catch {
    // Fail silently without disrupting user
  }

  return null;
}

function saveDiscoveredImage(norm: string, url: string): void {
  inMemoryCache.set(norm, url);
  try {
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem(ONLINE_IMAGES_CACHE_KEY);
      const map = cached ? JSON.parse(cached) : {};
      map[norm] = url;
      localStorage.setItem(ONLINE_IMAGES_CACHE_KEY, JSON.stringify(map));
    }
  } catch (_) {}
  void writeLibrarySnapshot('edo_vocabulary_image_' + norm, url).catch(() => {});
}
