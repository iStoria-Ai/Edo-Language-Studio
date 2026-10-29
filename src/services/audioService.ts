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

      recorder.onstop = () => {
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

        const objectUrl = URL.createObjectURL(blob);
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Url = typeof reader.result === 'string' ? reader.result : '';
          if (!base64Url) {
            URL.revokeObjectURL(objectUrl);
            resolve({
              ok: false,
              audioDataUrl: '',
              objectUrl: '',
              mimeType: effectiveMimeType,
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
            audioBlob: blob,
            mimeType: effectiveMimeType,
            durationSec: actualDurationSec,
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
            mimeType: effectiveMimeType,
            durationSec: 0,
            elapsedMs,
            peakRms: capturedPeakRms,
            errorCode: 'recording_failed',
            errorMessage: 'Error reading recorded audio data. Please try again.'
          });
        };

        reader.readAsDataURL(blob);
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

  const playableUrl = (audioSourceUrl && typeof audioSourceUrl === 'string' && audioSourceUrl.trim()) || '';

  if (!playableUrl) {
    onProgress?.(0, false);
    options.onError?.('No recorded voice is available to play.');
    return () => {};
  }

  const audio = new Audio();
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
