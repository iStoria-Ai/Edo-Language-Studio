/**
 * Audio & Speech Service for Edo Language Studio
 * Compatible with Android Chrome, iPhone Safari (iOS WKWebView / Mobile Safari), and desktop browsers.
 */

let activeAudioElement: HTMLAudioElement | null = null;
let activeEnglishAudioElement: HTMLAudioElement | null = null;

export type EnglishSpeechSpeed = 'normal' | 'slow';

/**
 * Registry of pre-generated Kokoro-82M TTS British English recordings (bf_emma).
 * All 16 prompts have dedicated natural-speed (1.0x) and slow deliberate (0.8x) MP3 files.
 */
export const KOKORO_PROMPT_AUDIO: Record<string, { normal: string; slow: string }> = {
  'word-hand': { normal: 'audio/english/word-hand.mp3', slow: 'audio/english/word-hand_slow.mp3' },
  'word-eye': { normal: 'audio/english/word-eye.mp3', slow: 'audio/english/word-eye_slow.mp3' },
  'word-water': { normal: 'audio/english/word-water.mp3', slow: 'audio/english/word-water_slow.mp3' },
  'word-food': { normal: 'audio/english/word-food.mp3', slow: 'audio/english/word-food_slow.mp3' },
  'word-house': { normal: 'audio/english/word-house.mp3', slow: 'audio/english/word-house_slow.mp3' },
  'phrase-good-morning': { normal: 'audio/english/phrase-good-morning.mp3', slow: 'audio/english/phrase-good-morning_slow.mp3' },
  'phrase-welcome': { normal: 'audio/english/phrase-welcome.mp3', slow: 'audio/english/phrase-welcome_slow.mp3' },
  'phrase-thank-you': { normal: 'audio/english/phrase-thank-you.mp3', slow: 'audio/english/phrase-thank-you_slow.mp3' },
  'word-child': { normal: 'audio/english/word-child.mp3', slow: 'audio/english/word-child_slow.mp3' },
  'word-sun': { normal: 'audio/english/word-sun.mp3', slow: 'audio/english/word-sun_slow.mp3' },
  'word-tree': { normal: 'audio/english/word-tree.mp3', slow: 'audio/english/word-tree_slow.mp3' },
  'word-book': { normal: 'audio/english/word-book.mp3', slow: 'audio/english/word-book_slow.mp3' },
  'phrase-how-are-you': { normal: 'audio/english/phrase-how-are-you.mp3', slow: 'audio/english/phrase-how-are-you_slow.mp3' },
  'sentence-your-name': { normal: 'audio/english/sentence-your-name.mp3', slow: 'audio/english/sentence-your-name_slow.mp3' },
  'sentence-going': { normal: 'audio/english/sentence-going.mp3', slow: 'audio/english/sentence-going_slow.mp3' },
  'sentence-coming': { normal: 'audio/english/sentence-coming.mp3', slow: 'audio/english/sentence-coming_slow.mp3' }
};

const KOKORO_TEXT_LOOKUP: Record<string, string> = {
  'hand': 'word-hand',
  'eye': 'word-eye',
  'water': 'word-water',
  'food': 'word-food',
  'house': 'word-house',
  'good morning': 'phrase-good-morning',
  'welcome / come in': 'phrase-welcome',
  'welcome': 'phrase-welcome',
  'come in': 'phrase-welcome',
  'thank you': 'phrase-thank-you',
  'child': 'word-child',
  'sun': 'word-sun',
  'tree': 'word-tree',
  'book': 'word-book',
  'how are you?': 'phrase-how-are-you',
  'how are you': 'phrase-how-are-you',
  'what is your name?': 'sentence-your-name',
  'what is your name': 'sentence-your-name',
  'where are you going?': 'sentence-going',
  'where are you going': 'sentence-going',
  'i am coming': 'sentence-coming'
};

function getBaseUrl(): string {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.BASE_URL === 'string') {
      return import.meta.env.BASE_URL;
    }
  } catch {
    // Node.js or mock environment fallback
  }
  return '/';
}

/**
 * Resolves a Kokoro audio asset URL for a given prompt ID or English text.
 */
export function getKokoroAudioUrl(promptIdOrText: string, speed: EnglishSpeechSpeed = 'normal'): string | null {
  const normalizedKey = promptIdOrText.trim().toLowerCase();
  const promptId = KOKORO_PROMPT_AUDIO[promptIdOrText]
    ? promptIdOrText
    : KOKORO_TEXT_LOOKUP[normalizedKey];

  if (!promptId || !KOKORO_PROMPT_AUDIO[promptId]) {
    return null;
  }

  const relativePath = speed === 'slow'
    ? KOKORO_PROMPT_AUDIO[promptId].slow
    : KOKORO_PROMPT_AUDIO[promptId].normal;

  const base = getBaseUrl();
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return `${cleanBase}${relativePath}`;
}

/**
 * Immediately stops any active English pronunciation audio or Text-to-Speech (TTS)
 * so it never bleeds into microphone recording or overlaps with recorded voice playback.
 */
export function stopEnglishPrompt(): void {
  if (activeEnglishAudioElement) {
    try {
      activeEnglishAudioElement.pause();
      activeEnglishAudioElement.currentTime = 0;
    } catch {
      // Ignore pause error
    }
    activeEnglishAudioElement = null;
  }
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }
  try {
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
    }
  } catch (err) {
    console.warn('Unable to cancel speechSynthesis:', err);
  }
}

/**
 * Finds a natural British English voice across mobile and desktop browsers
 * (iOS Safari, Android Chrome, macOS Safari, Windows, Linux).
 */
export function getBritishEnglishVoice(): SpeechSynthesisVoice | undefined {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return undefined;
  }
  const voices = window.speechSynthesis.getVoices?.() || [];
  if (!voices.length) {
    return undefined;
  }

  const isEnGbLang = (lang: string) => {
    const l = lang.toLowerCase().replace('_', '-');
    return l === 'en-gb' || l.startsWith('en-gb-');
  };

  const isEnLang = (lang: string) => {
    const l = lang.toLowerCase().replace('_', '-');
    return l === 'en' || l.startsWith('en-');
  };

  const gbVoices = voices.filter((v) => isEnGbLang(v.lang));

  if (gbVoices.length > 0) {
    // 1. Natural / Enhanced / Neural / Premium British voices (e.g. iOS Enhanced voices, Edge Natural)
    const naturalGb = gbVoices.find((v) =>
      /natural|enhanced|premium|neural/i.test(v.name)
    );
    if (naturalGb) return naturalGb;

    // 2. High-quality known British voices by name
    const knownGoodGb = gbVoices.find((v) =>
      /\b(daniel|oliver|serena|kate|martha|arthur|george|hazel|libby|ryan)\b/i.test(v.name)
    );
    if (knownGoodGb) return knownGoodGb;

    // 3. Local service British voice (fast, responsive on iOS / macOS)
    const localGb = gbVoices.find((v) => v.localService);
    if (localGb) return localGb;

    // 4. Any en-GB voice
    return gbVoices[0];
  }

  // Fallback: voice with "UK", "British", or "United Kingdom" in name
  const ukNamed = voices.find(
    (v) =>
      isEnLang(v.lang) &&
      /\b(uk|british|united kingdom)\b/i.test(v.name)
  );
  if (ukNamed) return ukNamed;

  // Fallback: any available English voice
  const anyEnglish =
    voices.find((v) => isEnLang(v.lang) && v.localService) ||
    voices.find((v) => isEnLang(v.lang));
  return anyEnglish || voices[0];
}

/**
 * Speaks the English text using the browser's built-in Text-to-Speech (TTS)
 * in a natural British English voice, used as fallback for custom lessons.
 */
function speakEnglishTtsFallback(
  text: string,
  speed: EnglishSpeechSpeed = 'normal',
  onEnd?: () => void
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onEnd?.();
    return;
  }
  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-GB';
    utterance.rate = speed === 'slow' ? 0.70 : 0.90;
    utterance.pitch = 1.0;

    const preferredVoice = getBritishEnglishVoice();
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('TTS playback error:', err);
    onEnd?.();
  }
}

/**
 * Plays English pronunciation using the high-quality Kokoro TTS British English model (bf_emma).
 * Uses pre-rendered Kokoro audio files for instant zero-latency playback on mobile/web without paid APIs.
 * Supports both normal and slow pronunciation speeds.
 * For open-ended custom contributions, falls back cleanly to natural British English browser synthesis.
 */
export function playEnglishPronunciation(
  promptIdOrText: string,
  speed: EnglishSpeechSpeed = 'normal',
  onProgress?: (isPlaying: boolean) => void
): () => void {
  // Stop any active Edo audio and previous English playback
  stopActivePlayback();
  stopEnglishPrompt();

  const kokoroUrl = getKokoroAudioUrl(promptIdOrText, speed);
  const cleanText = promptIdOrText.trim();

  if (kokoroUrl && typeof Audio !== 'undefined') {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = kokoroUrl;
    activeEnglishAudioElement = audio;
    onProgress?.(true);

    audio.onended = () => {
      if (activeEnglishAudioElement === audio) {
        activeEnglishAudioElement = null;
      }
      onProgress?.(false);
    };

    audio.onerror = () => {
      if (activeEnglishAudioElement === audio) {
        activeEnglishAudioElement = null;
      }
      console.warn(`Could not load Kokoro audio at ${kokoroUrl}, using British TTS fallback.`);
      speakEnglishTtsFallback(cleanText, speed, () => onProgress?.(false));
    };

    audio.play().catch((err) => {
      console.warn('Kokoro audio autoplay blocked or failed, using British TTS fallback:', err);
      if (activeEnglishAudioElement === audio) {
        activeEnglishAudioElement = null;
      }
      speakEnglishTtsFallback(cleanText, speed, () => onProgress?.(false));
    });

    return () => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // Ignore
      }
      if (activeEnglishAudioElement === audio) {
        activeEnglishAudioElement = null;
      }
      onProgress?.(false);
    };
  }

  // Fallback for custom entries or non-DOM test environments
  onProgress?.(true);
  speakEnglishTtsFallback(cleanText, speed, () => onProgress?.(false));

  return () => {
    stopEnglishPrompt();
    onProgress?.(false);
  };
}

/**
 * Backwards-compatible convenience function for English pronunciation playback.
 */
export function speakEnglishPrompt(
  englishWord: string,
  includeQuestion = false,
  speed: EnglishSpeechSpeed = 'normal'
): void {
  const cleanWord = englishWord.trim();
  if (!cleanWord) return;

  if (includeQuestion) {
    stopActivePlayback();
    stopEnglishPrompt();
    speakEnglishTtsFallback(`${cleanWord}. How do you say this in Edo?`, speed);
    return;
  }

  playEnglishPronunciation(cleanWord, speed);
}

/**
 * Isolated demo utility ONLY for pre-seeded sample library entries (`isSampleData: true`)
 * that do not have a user-recorded file yet.
 * NEVER used inside MicrophoneRecorder or the Teach Edo recording workflow.
 */
export function generatePlayableDemoWavDataUrl(durationSec = 3): string {
  const sampleRate = 22050;
  const numSamples = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const syllable1 = Math.exp(-Math.pow((t - 0.55) / 0.25, 2));
    const syllable2 = Math.exp(-Math.pow((t - 1.35) / 0.32, 2));
    const envelope = Math.min(1, syllable1 + syllable2 * 0.9);
    const freq = t < 0.95 ? 240 : 285;
    const harmonic =
      Math.sin(2 * Math.PI * freq * t) * 0.65 +
      Math.sin(2 * Math.PI * (freq * 2) * t) * 0.25 +
      Math.sin(2 * Math.PI * (freq * 3) * t) * 0.1;
    const sample = Math.max(-1, Math.min(1, harmonic * envelope * 0.35));
    view.setInt16(44 + i * 2, sample * 32767, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export type RecordingErrorCode =
  | 'permission_denied'
  | 'no_microphone'
  | 'unsupported_browser'
  | 'too_short'
  | 'no_voice_detected'
  | 'empty_recording'
  | 'recording_failed';

export interface RecordingStartResult {
  ok: boolean;
  errorCode?: RecordingErrorCode;
  errorMessage?: string;
}

export interface RecordingResult {
  ok: boolean;
  audioDataUrl: string;
  objectUrl: string;
  audioBlob?: Blob;
  mimeType: string;
  durationSec: number;
  elapsedMs: number;
  peakRms: number;
  errorCode?: RecordingErrorCode;
  errorMessage?: string;
}

/**
 * Selects the best supported MediaRecorder MIME type for the current browser
 * (Android Chrome prefers audio/webm;codecs=opus, iPhone Safari requires audio/mp4).
 */
export function getSupportedRecordingMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }

  const isAppleMobile =
    typeof navigator !== 'undefined' &&
    (/iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

  const candidates = isAppleMobile
    ? [
        'audio/mp4',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/aac',
        'audio/webm;codecs=opus',
        'audio/webm'
      ]
    : [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/mp4;codecs=mp4a.40.2',
        'audio/ogg;codecs=opus',
        'audio/aac'
      ];

  for (const candidate of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    } catch {
      // Ignore unsupported candidate check error
    }
  }
  return '';
}

// Minimum recording duration in ms to prevent accidental double-taps
const MIN_RECORDING_DURATION_MS = 650;
// Minimum audio blob size in bytes
const MIN_AUDIO_BLOB_BYTES = 250;
// Reasonable speech activity thresholds that allow quiet speech while rejecting muted/silent mics
const MIN_VOICE_PEAK_RMS = 0.0035;
const MIN_VOICE_PEAK_AMPLITUDE = 0.012;

/**
 * Encodes audio channel Float32Array PCM buffers into a standard 16-bit uncompressed WAV ArrayBuffer.
 */
export function encodeWavPcm16(channelData: Float32Array[], sampleRate: number): Uint8Array {
  const numChannels = channelData.length;
  const numSamples = channelData[0].length;
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // Linear PCM subchunk size
  view.setUint16(20, 1, true); // Linear PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16 bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i]));
      const int16 = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Uint8Array(buffer);
}

export interface TrimResult {
  channels: Float32Array[];
  trimmedStartSample: number;
  trimmedEndSample: number;
  durationSec: number;
  originalDurationSec: number;
  wasTrimmed: boolean;
}

/**
 * Pure sample-level silence trimming algorithm with adaptive noise-floor estimation.
 * Computes the energy profile across the recording, determines ambient noise vs speech levels,
 * and preserves generous safety padding at both start (150ms) and end (200ms) so no spoken
 * consonant, syllable, decay, or natural pause within phrases is cut off.
 */
export function trimPcmChannelData(
  channels: Float32Array[],
  sampleRate: number,
  options: {
    leadPaddingMs?: number;
    trailPaddingMs?: number;
  } = {}
): TrimResult {
  const numChannels = channels.length;
  if (numChannels === 0 || channels[0].length === 0) {
    return {
      channels,
      trimmedStartSample: 0,
      trimmedEndSample: 0,
      durationSec: 0,
      originalDurationSec: 0,
      wasTrimmed: false
    };
  }

  const totalSamples = channels[0].length;
  const originalDurationSec = Math.max(1, Math.round(totalSamples / sampleRate));
  const leadPaddingMs = options.leadPaddingMs ?? 150; // 150ms lead padding ensures initial consonants (s, f, kh, vb) are kept
  const trailPaddingMs = options.trailPaddingMs ?? 200; // 200ms trail padding preserves trailing decay

  // Use 20ms windows to calculate energy profile across the recording
  const windowSize = Math.max(1, Math.floor(sampleRate * 0.02));
  const numWindows = Math.floor(totalSamples / windowSize);

  if (numWindows < 5) {
    return {
      channels,
      trimmedStartSample: 0,
      trimmedEndSample: totalSamples,
      durationSec: originalDurationSec,
      originalDurationSec,
      wasTrimmed: false
    };
  }

  const windowRms = new Float32Array(numWindows);
  const windowPeak = new Float32Array(numWindows);

  for (let w = 0; w < numWindows; w++) {
    const start = w * windowSize;
    const end = Math.min(totalSamples, start + windowSize);
    let sumSq = 0;
    let maxA = 0;
    for (let i = start; i < end; i++) {
      for (let c = 0; c < numChannels; c++) {
        const a = Math.abs(channels[c][i]);
        if (a > maxA) maxA = a;
        sumSq += a * a;
      }
    }
    const count = (end - start) * numChannels;
    windowRms[w] = Math.sqrt(sumSq / count);
    windowPeak[w] = maxA;
  }

  // Determine ambient noise floor and speech level adaptively
  const sortedRms = Float32Array.from(windowRms).sort();
  const sortedPeak = Float32Array.from(windowPeak).sort();

  // Noise floor is 15th percentile of window energy
  const noiseIndex = Math.floor(numWindows * 0.15);
  const noiseRms = sortedRms[noiseIndex];
  const noisePeak = sortedPeak[noiseIndex];

  // Speech peak is 95th percentile
  const peakIndex = Math.floor(numWindows * 0.95);
  const speechPeakRms = sortedRms[peakIndex];
  const speechPeakMax = sortedPeak[peakIndex];

  // If the recording has no discernible speech contrast (e.g. completely silent or continuous steady noise), do not trim
  if (speechPeakRms < 0.008 && speechPeakMax < 0.025) {
    return {
      channels,
      trimmedStartSample: 0,
      trimmedEndSample: totalSamples,
      durationSec: originalDurationSec,
      originalDurationSec,
      wasTrimmed: false
    };
  }

  // Dynamic speech detection threshold calibrated adaptively above the ambient noise floor:
  // Must exceed noise floor by at least 1.8x, but also scaled to speech peak
  const speechRmsThreshold = Math.max(0.007, noiseRms * 1.8 + 0.003, speechPeakRms * 0.10);
  const speechPeakThreshold = Math.max(0.022, noisePeak * 1.8 + 0.010, speechPeakMax * 0.12);

  // Scan for speech start: Require 2 consecutive windows (40ms) exceeding threshold to reject clicks/pops
  let firstSpeechWindow = -1;
  for (let w = 0; w < numWindows - 1; w++) {
    const isSpeech =
      (windowRms[w] >= speechRmsThreshold || windowPeak[w] >= speechPeakThreshold) &&
      (windowRms[w + 1] >= speechRmsThreshold || windowPeak[w + 1] >= speechPeakThreshold);
    if (isSpeech) {
      firstSpeechWindow = w;
      break;
    }
  }

  // Scan for speech end backwards: Require 2 consecutive windows exceeding threshold
  let lastSpeechWindow = -1;
  for (let w = numWindows - 1; w >= 1; w--) {
    const isSpeech =
      (windowRms[w] >= speechRmsThreshold || windowPeak[w] >= speechPeakThreshold) &&
      (windowRms[w - 1] >= speechRmsThreshold || windowPeak[w - 1] >= speechPeakThreshold);
    if (isSpeech) {
      lastSpeechWindow = w;
      break;
    }
  }

  if (firstSpeechWindow === -1 || lastSpeechWindow === -1 || lastSpeechWindow < firstSpeechWindow) {
    return {
      channels,
      trimmedStartSample: 0,
      trimmedEndSample: totalSamples,
      durationSec: originalDurationSec,
      originalDurationSec,
      wasTrimmed: false
    };
  }

  const leadPaddingSamples = Math.floor(sampleRate * (leadPaddingMs / 1000));
  const trailPaddingSamples = Math.floor(sampleRate * (trailPaddingMs / 1000));

  const startTrim = Math.max(0, firstSpeechWindow * windowSize - leadPaddingSamples);
  const endTrim = Math.min(totalSamples, (lastSpeechWindow + 1) * windowSize + trailPaddingSamples);

  // Only trim if at least 250ms of silence was actually removed overall
  const trimmedSamplesCount = totalSamples - (endTrim - startTrim);
  if (trimmedSamplesCount < Math.floor(sampleRate * 0.25)) {
    return {
      channels,
      trimmedStartSample: 0,
      trimmedEndSample: totalSamples,
      durationSec: originalDurationSec,
      originalDurationSec,
      wasTrimmed: false
    };
  }

  const trimmedChannels = channels.map((c) => c.slice(startTrim, endTrim));
  const durationSec = Math.max(1, Math.round((endTrim - startTrim) / sampleRate));

  return {
    channels: trimmedChannels,
    trimmedStartSample: startTrim,
    trimmedEndSample: endTrim,
    durationSec,
    originalDurationSec,
    wasTrimmed: true
  };
}

/**
 * Automatically decodes and trims lead/trail silence from recorded audio using adaptive VAD,
 * returning a clean, trimmed 16-bit PCM WAV Blob with full pronunciation preserved.
 * Falls back safely to the original blob if AudioContext decoding is unavailable.
 */
export async function trimAudioSilence(
  blob: Blob,
  fallbackMimeType: string
): Promise<{
  blob: Blob;
  mimeType: string;
  durationSec: number;
  originalDurationSec: number;
  trimmedDurationSec: number;
  wasTrimmed: boolean;
  trimError?: string;
}> {
  if (
    typeof window === 'undefined' ||
    (!window.AudioContext && !(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
  ) {
    return {
      blob,
      mimeType: fallbackMimeType,
      durationSec: 0,
      originalDurationSec: 0,
      trimmedDurationSec: 0,
      wasTrimmed: false
    };
  }

  let audioCtx: AudioContext | null = null;
  try {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) {
      return {
        blob,
        mimeType: fallbackMimeType,
        durationSec: 0,
        originalDurationSec: 0,
        trimmedDurationSec: 0,
        wasTrimmed: false
      };
    }
    audioCtx = new AudioCtxClass();
    const arrayBuffer = await blob.arrayBuffer();
    const bufferCopy = arrayBuffer.slice(0);

    const audioBuffer: AudioBuffer = await new Promise((resolve, reject) => {
      let settled = false;
      try {
        const p = audioCtx!.decodeAudioData(
          bufferCopy,
          (buf) => {
            if (!settled) {
              settled = true;
              resolve(buf);
            }
          },
          (err) => {
            if (!settled) {
              settled = true;
              reject(err);
            }
          }
        );
        if (p && typeof p.then === 'function') {
          p.then((buf) => {
            if (!settled) {
              settled = true;
              resolve(buf);
            }
          }).catch((err) => {
            if (!settled) {
              settled = true;
              reject(err);
            }
          });
        }
      } catch (err) {
        reject(err);
      }
    });

    const numChannels = audioBuffer.numberOfChannels;
    const channels: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) {
      channels.push(audioBuffer.getChannelData(c));
    }

    const trimmed = trimPcmChannelData(channels, audioBuffer.sampleRate);
    const originalDur = Math.max(1, Math.round(audioBuffer.duration));

    if (!trimmed.wasTrimmed || trimmed.channels[0].length === 0) {
      return {
        blob,
        mimeType: fallbackMimeType,
        durationSec: originalDur,
        originalDurationSec: originalDur,
        trimmedDurationSec: originalDur,
        wasTrimmed: false
      };
    }

    const wavBytes = encodeWavPcm16(trimmed.channels, audioBuffer.sampleRate);
    const trimmedBlob = new Blob([wavBytes], { type: 'audio/wav' });

    console.log(
      `[AudioService] Automatically trimmed recording: original ${originalDur}s -> trimmed ${trimmed.durationSec}s (${(trimmed.channels[0].length / audioBuffer.sampleRate).toFixed(2)}s)`
    );

    return {
      blob: trimmedBlob,
      mimeType: 'audio/wav',
      durationSec: trimmed.durationSec,
      originalDurationSec: originalDur,
      trimmedDurationSec: trimmed.durationSec,
      wasTrimmed: true
    };
  } catch (err) {
    const errorMsg = String(err && (err as Error).message ? (err as Error).message : err);
    console.warn('[AudioService] Automatic silence trimming encountered an issue, preserving raw recording:', errorMsg);
    return {
      blob,
      mimeType: fallbackMimeType,
      durationSec: 0,
      originalDurationSec: 0,
      trimmedDurationSec: 0,
      wasTrimmed: false,
      trimError: errorMsg
    };
  } finally {
    if (audioCtx) {
      try {
        await audioCtx.close();
      } catch (_) {}
    }
  }
}

let recordingStartHandler: (() => void) | null = null;
let recordingStopHandler: (() => void) | null = null;
let audioInvalidationHandler: ((key: string) => void) | null = null;

export function setRecordingLifecycleHandlers(onStart: () => void, onStop: () => void): void {
  recordingStartHandler = onStart;
  recordingStopHandler = onStop;
}

export function setAudioInvalidationHandler(handler: (key: string) => void): void {
  audioInvalidationHandler = handler;
}

export class MicrophoneRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private startTime = 0;
  private chosenMimeType = '';

  // Web Audio API level analysis to detect genuine microphone voice activity
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelIntervalId: number | null = null;
  private peakRms = 0;
  private peakAmplitude = 0;
  private analyserSamplesCount = 0;

  async start(): Promise<RecordingStartResult> {
    this.chunks = [];
    this.peakRms = 0;
    this.peakAmplitude = 0;
    this.analyserSamplesCount = 0;

    // 1. Always stop English TTS and any audio playback before opening the microphone
    const wasSpeaking =
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      window.speechSynthesis.speaking;
    stopEnglishPrompt();
    stopActivePlayback();

    if (wasSpeaking) {
      // Brief pause so TTS audio output finishes flushing before mic opens
      await new Promise((r) => window.setTimeout(r, 100));
    }

    // 2. Check browser support for getUserMedia and MediaRecorder
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function' ||
      typeof MediaRecorder === 'undefined'
    ) {
      return {
        ok: false,
        errorCode: 'unsupported_browser',
        errorMessage:
          'Voice recording is not supported in this browser. Please open Edo Language Studio in iPhone Safari or Android Chrome.'
      };
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    } catch (err: unknown) {
      this.cleanupResources();
      const domErr = err as { name?: string; message?: string };
      const errName = domErr?.name || '';

      if (
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        errName === 'SecurityError'
      ) {
        return {
          ok: false,
          errorCode: 'permission_denied',
          errorMessage:
            'Microphone access was denied. Please allow microphone permission in your browser settings and tap the microphone to try again.'
        };
      }

      if (
        errName === 'NotFoundError' ||
        errName === 'DevicesNotFoundError' ||
        errName === 'NotReadableError' ||
        errName === 'TrackStartError'
      ) {
        return {
          ok: false,
          errorCode: 'no_microphone',
          errorMessage:
            'No working microphone was detected, or it is in use by another app. Please check your microphone and try again.'
        };
      }

      return {
        ok: false,
        errorCode: 'recording_failed',
        errorMessage:
          'Could not start microphone recording. Please check your microphone permissions and try again.'
      };
    }

    try {
      this.chosenMimeType = getSupportedRecordingMimeType();
      this.mediaRecorder = this.chosenMimeType
        ? new MediaRecorder(this.stream, { mimeType: this.chosenMimeType })
        : new MediaRecorder(this.stream);

      this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) {
          this.chunks.push(e.data);
        }
      };

      // Attach Web Audio API AnalyserNode to monitor microphone input levels
      this.startAudioLevelMonitor(this.stream);

      this.startTime = Date.now();
      // Start recording (250ms timeslice ensures periodic chunk collection across Chrome & iOS Safari)
      this.mediaRecorder.start(250);
      recordingStartHandler?.();

      return { ok: true };
    } catch (err) {
      console.error('Failed to initialize MediaRecorder:', err);
      this.cleanupResources();
      return {
        ok: false,
        errorCode: 'recording_failed',
        errorMessage:
          'Unable to start audio recorder on this device. Please try again.'
      };
    }
  }

  private startAudioLevelMonitor(stream: MediaStream): void {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      this.audioContext = ctx;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      this.analyser = analyser;

      const dataArray = new Uint8Array(analyser.fftSize);
      this.levelIntervalId = window.setInterval(() => {
        if (!this.analyser) return;
        this.analyser.getByteTimeDomainData(dataArray);
        let sumSquares = 0;
        let maxDev = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i] - 128) / 128;
          const absVal = Math.abs(normalized);
          sumSquares += normalized * normalized;
          if (absVal > maxDev) {
            maxDev = absVal;
          }
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        this.analyserSamplesCount += 1;
        if (rms > this.peakRms) {
          this.peakRms = rms;
        }
        if (maxDev > this.peakAmplitude) {
          this.peakAmplitude = maxDev;
        }
      }, 50);
    } catch (err) {
      // If AudioContext monitoring fails on an older WebView, do not block MediaRecorder
      console.warn('Audio level monitor unavailable:', err);
    }
  }

  async stop(): Promise<RecordingResult> {
    const elapsedMs = Math.max(0, Date.now() - this.startTime);
    const actualDurationSec = Math.max(1, Math.round(elapsedMs / 1000));
    const capturedPeakRms = this.peakRms;
    const capturedPeakAmplitude = this.peakAmplitude;
    const capturedSamplesCount = this.analyserSamplesCount;

    if (!this.mediaRecorder) {
      this.cleanupResources();
      return {
        ok: false,
        audioDataUrl: '',
        objectUrl: '',
        mimeType: '',
        durationSec: 0,
        elapsedMs,
        peakRms: 0,
        errorCode: 'recording_failed',
        errorMessage: 'No active recording was found. Please tap the microphone to record.'
      };
    }

    return new Promise<RecordingResult>((resolve) => {
      const recorder = this.mediaRecorder!;

      recorder.onstop = async () => {
        const effectiveMimeType =
          recorder.mimeType || this.chosenMimeType || this.chunks[0]?.type || 'audio/mp4';
        const blob = new Blob(this.chunks, { type: effectiveMimeType });

        // Immediately release microphone tracks and AudioContext
        this.cleanupResources();

        // 1. Reject extremely short accidental taps (< 0.65s)
        if (elapsedMs < MIN_RECORDING_DURATION_MS) {
          resolve({
            ok: false,
            audioDataUrl: '',
            objectUrl: '',
            mimeType: effectiveMimeType,
            durationSec: 0,
            elapsedMs,
            peakRms: capturedPeakRms,
            errorCode: 'too_short',
            errorMessage:
              'That recording was too short. Please tap the microphone, speak the Edo word clearly, and tap again to stop.'
          });
          return;
        }

        // 2. Reject empty or corrupted audio blobs
        if (!blob || blob.size < MIN_AUDIO_BLOB_BYTES) {
          resolve({
            ok: false,
            audioDataUrl: '',
            objectUrl: '',
            mimeType: effectiveMimeType,
            durationSec: 0,
            elapsedMs,
            peakRms: capturedPeakRms,
            errorCode: 'empty_recording',
            errorMessage:
              'No audio data was captured. Please tap the microphone and try recording again.'
          });
          return;
        }

        // 3. Reject silent recordings when the analyser collected samples and detected no voice
        if (
          capturedSamplesCount >= 4 &&
          capturedPeakRms < MIN_VOICE_PEAK_RMS &&
          capturedPeakAmplitude < MIN_VOICE_PEAK_AMPLITUDE
        ) {
          resolve({
            ok: false,
            audioDataUrl: '',
            objectUrl: '',
            mimeType: effectiveMimeType,
            durationSec: 0,
            elapsedMs,
            peakRms: capturedPeakRms,
            errorCode: 'no_voice_detected',
            errorMessage:
              'We could not hear your voice. Please speak clearly into your microphone and record again.'
          });
          return;
        }

        // 4. Automatically trim lead and trail silence while preserving full spoken pronunciation
        let finalBlob = blob;
        let finalMimeType = effectiveMimeType;
        let finalDurationSec = actualDurationSec;

        try {
          const trimmed = await trimAudioSilence(blob, effectiveMimeType);
          if (trimmed.durationSec > 0 && trimmed.blob) {
            finalBlob = trimmed.blob;
            finalMimeType = trimmed.mimeType;
            finalDurationSec = trimmed.durationSec;
          }
        } catch (_) {
          // Gracefully preserve original blob if decoding/trimming fails
        }

        const objectUrl = URL.createObjectURL(finalBlob);
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Url = typeof reader.result === 'string' ? reader.result : '';
          if (!base64Url) {
            URL.revokeObjectURL(objectUrl);
            resolve({
              ok: false,
              audioDataUrl: '',
              objectUrl: '',
              mimeType: finalMimeType,
              durationSec: 0,
              elapsedMs,
              peakRms: capturedPeakRms,
              errorCode: 'recording_failed',
              errorMessage: 'Could not process the recorded audio. Please record again.'
            });
            return;
          }

          resolve({
            ok: true,
            audioDataUrl: base64Url,
            objectUrl,
            audioBlob: finalBlob,
            mimeType: finalMimeType,
            durationSec: finalDurationSec,
            elapsedMs,
            peakRms: capturedPeakRms
          });
        };

        reader.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          resolve({
            ok: false,
            audioDataUrl: '',
            objectUrl: '',
            mimeType: finalMimeType,
            durationSec: 0,
            elapsedMs,
            peakRms: capturedPeakRms,
            errorCode: 'recording_failed',
            errorMessage: 'Error reading recorded audio data. Please try again.'
          });
        };

        reader.readAsDataURL(finalBlob);
      };

      try {
        if (recorder.state === 'recording') {
          try {
            recorder.requestData();
          } catch {
            // Some browsers do not require requestData before stop
          }
          recorder.stop();
        } else if (recorder.state !== 'inactive') {
          recorder.stop();
        } else {
          this.cleanupResources();
          resolve({
            ok: false,
            audioDataUrl: '',
            objectUrl: '',
            mimeType: '',
            durationSec: 0,
            elapsedMs,
            peakRms: capturedPeakRms,
            errorCode: 'recording_failed',
            errorMessage: 'Recording stopped unexpectedly. Please try again.'
          });
        }
      } catch {
        this.cleanupResources();
        resolve({
          ok: false,
          audioDataUrl: '',
          objectUrl: '',
          mimeType: '',
          durationSec: 0,
          elapsedMs,
          peakRms: capturedPeakRms,
          errorCode: 'recording_failed',
          errorMessage: 'Could not stop recording cleanly. Please try again.'
        });
      }
    });
  }

  cancel(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.onstop = null;
        this.mediaRecorder.stop();
      } catch {
        // Ignore stop errors during cancel
      }
    }
    this.cleanupResources();
  }

  private cleanupResources(): void {
    if (this.levelIntervalId !== null) {
      window.clearInterval(this.levelIntervalId);
      this.levelIntervalId = null;
    }
    this.analyser = null;
    if (this.audioContext) {
      try {
        this.audioContext.close().catch(() => {});
      } catch {
        // Ignore AudioContext close error
      }
      this.audioContext = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // Ignore track stop error
        }
      });
      this.stream = null;
    }
    this.mediaRecorder = null;
    recordingStopHandler?.();
  }
}

export function revokeAudioObjectUrl(objectUrl: string | undefined): void {
  if (objectUrl && objectUrl.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Ignore revoke errors
    }
  }
}

export function stopActivePlayback(): void {
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
    } catch {
      // Ignore pause error
    }
    activeAudioElement = null;
  }
}

export interface PlayAudioOptions {
  allowDemoFallback?: boolean;
  onError?: (message: string) => void;
  primedAudio?: HTMLAudioElement | null;
}

// Silent 1-sample WAV data URI to prime Mobile Safari audio playback within a user interaction
export const SILENT_AUDIO_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

export function isSafariOrIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/Chromium/.test(ua) && !/Android/.test(ua);
  return isIOS || isSafari;
}

/**
 * Creates and unlocks an HTMLAudioElement synchronously within a user touch/click gesture.
 * Mobile Safari expires user activation during asynchronous network downloads (e.g. from Google Drive),
 * causing audio.play() to be blocked with NotAllowedError.
 * Primes the media pipeline on iOS Safari so playback continues seamlessly once loaded.
 */
export function createPrimedAudioElement(): HTMLAudioElement | null {
  try {
    if (typeof Audio === 'undefined') return null;
    if (!isSafariOrIOS()) return null;
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = SILENT_AUDIO_WAV;
    if (typeof audio.load === 'function') {
      audio.load();
    }
    return audio;
  } catch {
    return null;
  }
}

/**
 * Plays a real Edo human voice recording from an Object URL or Data URL.
 * Never silently substitutes synthetic speech, electronic tones, or unrelated audio
 * when a recording is missing.
 */
export function playAudioRecording(
  audioSourceUrl: string | undefined,
  durationSec = 3,
  onProgress?: (currentSec: number, isPlaying: boolean) => void,
  options: PlayAudioOptions = { allowDemoFallback: false }
): () => void {
  stopActivePlayback();
  stopEnglishPrompt();

  let playableUrl = (audioSourceUrl && typeof audioSourceUrl === 'string' && audioSourceUrl.trim()) || '';

  if (!playableUrl) {
    onProgress?.(0, false);
    options.onError?.('No recorded voice is available to play.');
    return () => {};
  }

  // Normalize generic or missing MIME data URLs for iOS Safari and mobile browsers
  if (playableUrl.startsWith('data:application/octet-stream')) {
    playableUrl = playableUrl.replace('data:application/octet-stream', 'data:audio/webm');
  } else if (playableUrl.startsWith('data:;base64,')) {
    playableUrl = playableUrl.replace('data:;base64,', 'data:audio/webm;base64,');
  }

  const audio = options.primedAudio || new Audio();
  try {
    audio.pause();
    audio.currentTime = 0;
  } catch (_) {}
  audio.preload = 'auto';
  audio.src = playableUrl;
  activeAudioElement = audio;

  const interval = window.setInterval(() => {
    if (!audio.paused) {
      const effectiveDuration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? Math.ceil(audio.duration)
          : durationSec;
      onProgress?.(Math.min(effectiveDuration, Math.floor(audio.currentTime)), true);
    }
  }, 150);

  audio.onended = () => {
    window.clearInterval(interval);
    onProgress?.(durationSec, false);
    if (activeAudioElement === audio) {
      activeAudioElement = null;
    }
  };

  audio.onerror = () => {
    window.clearInterval(interval);
    onProgress?.(0, false);
    if (activeAudioElement === audio) {
      activeAudioElement = null;
    }
    options.onError?.('Unable to play this audio recording on your device.');
  };

  onProgress?.(0, true);
  audio.play().catch((err) => {
    console.warn('Playback blocked or failed:', err);
    window.clearInterval(interval);
    onProgress?.(0, false);
    if (activeAudioElement === audio) {
      activeAudioElement = null;
    }
    options.onError?.('Tap Play to listen to your recording.');
  });

  return () => {
    window.clearInterval(interval);
    try {
      audio.pause();
    } catch {
      // Ignore pause error
    }
    onProgress?.(0, false);
  };
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
}

// ============================================================================
// Session-Based Shared Audio Cache for Fast Playback
// ============================================================================

const MAX_SESSION_CACHE_SIZE = 80;
const sessionAudioCache = new Map<string, string>();
const inFlightAudioRequests = new Map<string, Promise<string>>();

/**
 * Returns cached audio data URL from session memory if available.
 * Refreshes LRU position on access.
 */
export function getCachedSessionAudio(key: string): string | null {
  if (!key) return null;
  const audio = sessionAudioCache.get(key);
  if (audio) {
    sessionAudioCache.delete(key);
    sessionAudioCache.set(key, audio);
    return audio;
  }
  return null;
}

/**
 * Stores audio data URL in session memory with bounded LRU eviction.
 */
export function setCachedSessionAudio(key: string, audioDataUrl: string): void {
  if (!key || !audioDataUrl) return;
  if (sessionAudioCache.has(key)) {
    sessionAudioCache.delete(key);
  } else if (sessionAudioCache.size >= MAX_SESSION_CACHE_SIZE) {
    // Evict oldest entry (first item in Map iterator)
    const oldestKey = sessionAudioCache.keys().next().value;
    if (oldestKey) sessionAudioCache.delete(oldestKey);
  }
  sessionAudioCache.set(key, audioDataUrl);
}

/**
 * Invalidates cached audio for a specific key (e.g. on voice replacement or deletion).
 */
export function invalidateSessionAudio(key: string): void {
  if (!key) return;
  sessionAudioCache.delete(key);
  inFlightAudioRequests.delete(key);
  audioInvalidationHandler?.(key);
}

/**
 * Clears the entire session audio cache.
 */
export function clearSessionAudioCache(): void {
  sessionAudioCache.clear();
  inFlightAudioRequests.clear();
}

/**
 * Returns current size of session audio cache (for telemetry/testing).
 */
export function getSessionAudioCacheSize(): number {
  return sessionAudioCache.size;
}

/**
 * Loads audio from session cache or executes fetcher once with in-flight deduplication.
 * Prevents duplicate network downloads if two Play requests occur while downloading.
 */
export async function loadOrFetchAudio(key: string, fetcher: () => Promise<string>): Promise<string> {
  if (!key) return fetcher();
  const cached = getCachedSessionAudio(key);
  if (cached) return cached;

  let inFlight = inFlightAudioRequests.get(key);
  if (!inFlight) {
    inFlight = (async () => {
      try {
        const audio = await fetcher();
        setCachedSessionAudio(key, audio);
        return audio;
      } finally {
        inFlightAudioRequests.delete(key);
      }
    })();
    inFlightAudioRequests.set(key, inFlight);
  }
  return inFlight;
}
