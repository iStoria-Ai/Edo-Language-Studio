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
  'eye': 'word-eye.jpg',
  'head': 'body-head.jpg',
  'ear': 'body-ear.jpg',
  'nose': 'body-nose.jpg',
  'mouth': 'body-mouth.jpg',
  'foot': 'body-foot.jpg',
  'leg': 'body-leg.jpg',
  'arm': 'body-arm.jpg',
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

  // Home
  'house': 'word-house.jpg',
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

  // Family
  'mother': 'family-mother.jpg',
  'father': 'family-father.jpg',
  'child': 'word-child.jpg',
  'baby': 'family-baby.jpg',
  'brother': 'family-brother.jpg',
  'sister': 'family-sister.jpg',
  'grandmother': 'family-grandmother.jpg',
  'grandfather': 'family-grandfather.jpg',
  'friend': 'family-friend.jpg',
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
  'vegetables': 'food-vegetables.jpg',
  'yam': 'food-yam.jpg',
  'salt': 'food-salt.jpg',
  'oil': 'food-oil.jpg',
  'pepper': 'food-pepper.jpg',
  'egg': 'food-egg.jpg',
  'banana': 'food-banana.jpg',

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

  // Nature
  'tree': 'word-tree.jpg',
  'sun': 'word-sun.jpg',
  'rain': 'nature-rain.jpg',
  'river': 'nature-river.jpg',
  'sky': 'nature-sky.jpg',
  'earth': 'nature-earth.jpg',
  'fire': 'nature-fire.jpg',
  'wind': 'nature-wind.jpg',
  'moon': 'nature-moon.jpg',
  'star': 'nature-star.jpg',
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
  'money': 'tool-money.jpg',
  'dog': 'animal-dog.jpg',
  'cat': 'animal-cat.jpg',
  'bird': 'animal-bird.jpg',
  'goat': 'animal-goat.jpg',
  'shirt': 'clothes-shirt.jpg',
  'shoes': 'clothes-shoes.jpg',
  'today': 'time-today.jpg',
  'tomorrow': 'time-tomorrow.jpg',
  'night': 'time-night.jpg'
};

const ONLINE_IMAGES_CACHE_KEY = 'edo_online_vocabulary_images_v1';

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
 * Resolves the picture URL for an English word, id, or illustrationKey.
 */
export function getVocabularyImageUrl(params: {
  id?: string;
  english?: string;
  illustrationKey?: string;
  imageUrl?: string;
}): string {
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
    const filename = CURATED_IMAGE_FILENAMES[norm];
    if (filename) {
      return `${cleanBase}assets/vocabulary/${filename}`;
    }

    // Check online image cache for dynamic vocabulary
    try {
      if (typeof localStorage !== 'undefined') {
        const cached = localStorage.getItem(ONLINE_IMAGES_CACHE_KEY);
        if (cached) {
          const map = JSON.parse(cached);
          if (map[norm]) return map[norm];
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

  // 5. Fallback to curated high-quality default studio illustration
  return `${cleanBase}assets/edo-welcome-hero.jpg`;
}

/**
 * Discovers and caches a licensed picture for dynamically discovered online vocabulary.
 * Uses Wikimedia Commons API (CC0 / CC-BY, free, CORS-enabled, no API key).
 */
export async function discoverOnlineVocabularyImage(englishWord: string): Promise<string | null> {
  const norm = normalizeEnglish(englishWord);
  if (!norm) return null;

  // Check if we already have a curated static picture
  if (CURATED_IMAGE_FILENAMES[norm]) {
    const baseUrl = getBaseUrl();
    const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    return `${cleanBase}assets/vocabulary/${CURATED_IMAGE_FILENAMES[norm]}`;
  }

  // Check cached dynamic images
  try {
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem(ONLINE_IMAGES_CACHE_KEY);
      if (cached) {
        const map = JSON.parse(cached);
        if (map[norm]) return map[norm];
      }
    }
  } catch (_) {}

  // Fetch from Wikimedia Commons PageImages API
  try {
    const endpoint = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      englishWord
    )}&prop=pageimages&format=json&pithumbsize=400&origin=*`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;

    const firstPageKey = Object.keys(pages)[0];
    const thumbnail = pages[firstPageKey]?.thumbnail?.source;

    if (thumbnail && typeof thumbnail === 'string') {
      // Cache the result
      try {
        if (typeof localStorage !== 'undefined') {
          const cached = localStorage.getItem(ONLINE_IMAGES_CACHE_KEY);
          const map = cached ? JSON.parse(cached) : {};
          map[norm] = thumbnail;
          localStorage.setItem(ONLINE_IMAGES_CACHE_KEY, JSON.stringify(map));
        }
      } catch (_) {}
      return thumbnail;
    }
  } catch (err) {
    // Fail silently without disrupting user
  }

  return null;
}
