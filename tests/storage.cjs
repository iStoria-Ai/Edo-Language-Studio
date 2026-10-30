const { readFileSync } = require('node:fs');
const { buildSync } = require('esbuild');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const bundle = buildSync({ entryPoints: ['src/services/storageService.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['@capacitor/*'] }).outputFiles[0].text;
const protectionBundle = buildSync({ entryPoints: ['src/services/libraryProtection.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const audioBundle = buildSync({ entryPoints: ['src/services/audioService.ts'], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const values = new Map();
let fail = false, native = false, playedSource, nativeFile, spokenUtterance = null, speechCancelled = false;
const legacyKey = 'edo_language_studio_entries_v1';
class MockSpeechUtterance {
  constructor(text) { this.text = text; this.lang = ''; this.rate = 1; this.pitch = 1; this.voice = null; }
}
function load(code = bundle) {
  const module = { exports: {} };
  const mockSpeech = {
    paused: false,
    speaking: false,
    pending: false,
    cancel() { speechCancelled = true; spokenUtterance = null; },
    resume() { this.paused = false; },
    getVoices() {
      return [
        { name: 'Alex', lang: 'en-US', localService: true },
        { name: 'Daniel (Enhanced)', lang: 'en-GB', localService: true },
        { name: 'Google UK English Female', lang: 'en-GB', localService: false }
      ];
    },
    speak(utt) { spokenUtterance = utt; }
  };
  const context = { module, exports: module.exports, console, crypto: webcrypto, TextEncoder, Uint8Array, atob, btoa,
    SpeechSynthesisUtterance: MockSpeechUtterance,
    window: { setInterval: () => 1, clearInterval() {}, speechSynthesis: mockSpeech, SpeechSynthesisUtterance: MockSpeechUtterance },
    Audio: class { paused = true; set src(value) { playedSource = value; } play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } },
    localStorage: { getItem: key => values.get(key) ?? null },
    require: name => {
      if (name === '@capacitor/preferences') return { Preferences: { get: async ({key}) => ({ value: values.get(key) ?? null }), set: async ({key, value}) => { if (fail) throw Error('quota'); values.set(key, value); } } };
      if (name === '@capacitor/core') return { Capacitor: { isNativePlatform: () => native } };
      if (name === '@capacitor/filesystem') return { Directory: { Data: 'DATA' }, Filesystem: { writeFile: async file => { nativeFile = file; } } };
      throw Error(name);
    }
  };
  vm.runInNewContext(code, context);
  return module.exports;
}
function wav() {
  const bytes = Buffer.alloc(44 + 16000);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(16000, 40);
  for (let i = 0; i < 8000; i++) bytes.writeInt16LE(Math.round(Math.sin(i / 8000 * 440 * Math.PI * 2) * 3000), 44 + i * 2);
  return 'data:audio/wav;base64,' + bytes.toString('base64');
}
(async () => {
  const api = load(), pure = load(protectionBundle);
  const originalAudio = wav();
  const legacy = api.INITIAL_EDO_ENTRIES.map(entry => entry.id === 'word-hand' ? { ...entry, audioDataUrl: originalAudio, hasAudio: true, edoText: 'Ẹ̀dó ọ', isSampleData: false, status: 'awaiting_review', createdAt: '2026-10-28T10:00:00Z' } : entry);
  const legacyRaw = JSON.stringify(legacy);
  values.set(legacyKey, legacyRaw);
  let library = await api.loadLibrary();
  assert.equal(api.TEACH_QUESTION_IDS.length, 15);
  assert.equal(values.get(legacyKey), legacyRaw, 'migration never alters legacy storage');
  assert.equal(library.recordings.length, 1);
  const recordingId = library.recordings[0].id;
  assert.equal(library.recordings[0].audioDataUrl, originalAudio);
  assert.equal(library.recordings[0].mimeType, 'audio/wav');
  assert.equal(library.recordings[0].permissions.aiVoiceTraining, 'unknown');
  assert.equal(library.recordings[0].permissions.playback, 'unknown');
  assert.equal((await load().loadLibrary()).recordings[0].id, recordingId, 'stable across module/browser reload');
  assert.equal(JSON.parse(values.get(api.LIBRARY_STORAGE_KEY)).library.entries.find(entry => entry.id === 'word-hand').audioDataUrl, undefined, 'persist audio once in the registry, hydrate on read');
  const initialQueue = JSON.stringify(library.syncQueue);
  await api.saveEntries(library.entries);
  library = await api.loadLibrary();
  assert.equal(JSON.stringify(library.syncQueue), initialQueue, 'no duplicate pending operations on unchanged save');
  assert.equal(api.lessonProgress(library.entries).completed, 1);
  assert.equal(api.lessonProgress(library.entries).waiting, 14);
  const backup = await api.exportLibrary();
  const validated = await pure.parseBackup(backup);
  assert.equal(validated.payload.recordings[0].audioDataUrl, originalAudio);
  let result = await api.importLibrary(backup);
  assert.equal(result.added, 0, 'repeat import does not duplicate lessons');
  const invalidPermissions = JSON.parse(backup); invalidPermissions.payload.recordings[0].permissions.aiVoiceTraining = true;
  invalidPermissions.sha256 = await pure.digest(pure.canonical(invalidPermissions.payload));
  await assert.rejects(api.importLibrary(JSON.stringify(invalidPermissions)), /permissions/);
  const missingRecording = JSON.parse(backup); missingRecording.payload.recordings = [];
  missingRecording.sha256 = await pure.digest(pure.canonical(missingRecording.payload));
  await assert.rejects(api.importLibrary(JSON.stringify(missingRecording)), /missing or mismatched/);
  const beforeBadImport = values.get(api.LIBRARY_STORAGE_KEY);
  const corrupt = JSON.parse(backup); corrupt.payload.recordings[0].audioDataUrl = 'data:audio/wav;base64,YmFk';
  await assert.rejects(api.importLibrary(JSON.stringify(corrupt)), /integrity/);
  assert.equal(values.get(api.LIBRARY_STORAGE_KEY), beforeBadImport);
  corrupt.sha256 = await pure.digest(pure.canonical(corrupt.payload));
  await assert.rejects(api.importLibrary(JSON.stringify(corrupt)), /integrity/);
  await assert.rejects(api.importLibrary('{bad'), /valid JSON/);
  const unsupported = JSON.parse(backup); unsupported.version = 99;
  await assert.rejects(api.importLibrary(JSON.stringify(unsupported)), /Unsupported/);
  const remoteAudio = JSON.parse(backup); remoteAudio.payload.entries[0].audioDataUrl = 'https://example.com/private.wav';
  remoteAudio.sha256 = await pure.digest(pure.canonical(remoteAudio.payload));
  await assert.rejects(api.importLibrary(JSON.stringify(remoteAudio)), /original base64/);
  const speaker = { ...library.recordings[0].speaker, name: 'Test speaker', dialect: 'Test variety' };
  library = await api.saveRecordingInformation(recordingId, speaker, { ...library.recordings[0].permissions, playback: 'granted', aiVoiceTraining: 'denied' });
  await api.importLibrary(backup);
  library = await api.loadLibrary();
  assert.equal(library.recordings[0].speaker.name, 'Test speaker');
  assert.equal(library.recordings[0].permissions.aiVoiceTraining, 'denied', 'import cannot escalate or reset consent');
  assert.equal(library.recordings[0].audioDataUrl, originalAudio);
  const edited = library.entries.map(entry => entry.id === 'word-hand' ? {...entry, edoText: 'Edited Ẹ̀dó'} : entry);
  await api.saveEntries(edited);
  assert.equal((await load().loadEntries()).find(entry => entry.id === 'word-hand').edoText, 'Edited Ẹ̀dó');
  await assert.rejects(api.saveEntries(library.entries, legacy), /changed while you were editing/);
  const quoted = 'data:audio/mp4;codecs="mp4a.40.2";base64,' + Buffer.from('quoted-codec-original').toString('base64');
  assert.equal(pure.originalAudio(quoted).mimeType, 'audio/mp4;codecs="mp4a.40.2"');
  const differentAudio = 'data:audio/mp4;base64,' + Buffer.from('different-original-format').toString('base64');
  await assert.rejects(api.saveEntries(edited.map(entry => entry.id === 'word-hand' ? {...entry, audioDataUrl: differentAudio} : entry)), /cannot be overwritten/);
  const incoming = await pure.protectEntries(legacy.map(entry => entry.id === 'word-hand' ? {...entry, audioDataUrl: differentAudio} : entry));
  const incomingBackup = await pure.makeBackup(incoming);
  result = await api.importLibrary(incomingBackup);
  assert.equal(result.added, 1);
  assert.equal(result.conflicts, 1);
  library = await api.loadLibrary();
  assert.equal(library.recordings.length, 2);
  assert.equal(library.entries.find(entry => entry.id === 'word-hand').audioDataUrl, originalAudio);
  assert.equal((await api.importLibrary(incomingBackup)).added, 0);
  const completeBackup = await api.exportLibrary();
  values.clear();
  await load().loadLibrary();
  result = await load().importLibrary(completeBackup);
  library = await load().loadLibrary();
  assert.equal(library.recordings.length, 2, 'restore into a fresh library');
  assert.equal(library.entries.find(entry => entry.id === 'word-hand').edoText, 'Edited Ẹ̀dó');
  assert.equal(library.recordings.find(recording => recording.id === recordingId).permissions.aiVoiceTraining, 'denied');
  assert.equal(library.recordings.find(recording => recording.id === recordingId).sha256, validated.payload.recordings[0].sha256);
  const player = load(audioBundle);
  player.playAudioRecording(library.entries.find(entry => entry.id === 'word-hand').audioDataUrl, 1, undefined, { allowDemoFallback: false });
  assert.equal(playedSource, originalAudio, 'offline player receives the restored original, without network or demo fallback');
  const britishVoice = player.getBritishEnglishVoice();
  assert.equal(britishVoice.lang, 'en-GB', 'selects British English voice');
  assert.match(britishVoice.name, /Daniel/i, 'prioritizes enhanced British voice');
  const fs = require('fs');
  const path = require('path');
  assert.equal(Object.keys(player.KOKORO_PROMPT_AUDIO).length, 16, 'has all 16 prompt recordings');
  for (const [id, files] of Object.entries(player.KOKORO_PROMPT_AUDIO)) {
    assert.ok(fs.existsSync(path.join('public', files.normal)), `Kokoro normal audio exists for ${id}`);
    assert.ok(fs.existsSync(path.join('public', files.slow)), `Kokoro slow audio exists for ${id}`);
  }
  player.playEnglishPronunciation('word-hand', 'normal');
  assert.equal(playedSource, '/audio/english/word-hand.mp3', 'plays pre-rendered Kokoro normal audio');
  player.playEnglishPronunciation('word-hand', 'slow');
  assert.equal(playedSource, '/audio/english/word-hand_slow.mp3', 'plays pre-rendered Kokoro slow audio');
  player.stopEnglishPrompt();
  player.speakEnglishPrompt('Custom phrase with question', true);
  assert.equal(spokenUtterance.text, 'Custom phrase with question. How do you say this in Edo?');
  assert.equal(spokenUtterance.lang, 'en-GB', 'uses en-GB language tag for fallback');
  assert.equal(spokenUtterance.voice.lang, 'en-GB', 'applies British voice to fallback utterance');
  player.stopEnglishPrompt();
  assert.ok(speechCancelled, 'cancels speech synthesis on stop');
  const translationConflict = await pure.protectEntries(legacy.map(entry => entry.id === 'word-hand' ? {...entry, edoText: 'Alternative validated text'} : entry));
  const conflictResult = await pure.mergeBackup(library, await pure.parseBackup(await pure.makeBackup(translationConflict)));
  assert.equal(conflictResult.added, 1, 'different translation metadata with the same audio is kept separately');
  assert.equal(conflictResult.library.entries.find(entry => entry.id === 'word-hand').edoText, 'Edited Ẹ̀dó');
  assert.equal((await pure.mergeBackup(conflictResult.library, await pure.parseBackup(await pure.makeBackup(translationConflict)))).added, 0);
  const beforeQuota = values.get(api.LIBRARY_STORAGE_KEY);
  fail = true;
  await assert.rejects(api.importLibrary(completeBackup), /Unable to save/);
  assert.equal(values.get(api.LIBRARY_STORAGE_KEY), beforeQuota);
  fail = false;
  native = true;
  assert.equal(await api.saveAudioFileLocally('fixture', differentAudio), differentAudio);
  assert.match(nativeFile.path, /\.mp4$/);
  assert.equal(nativeFile.data, differentAudio.split(',')[1]);
  native = false;
  await api.saveEntries(library.entries.filter(entry => entry.id !== 'word-hand'));
  assert.equal((await api.loadLibrary()).recordings.length, 2, 'removing a lesson never deletes protected audio');
  assert.equal((await pure.parseBackup(await api.exportLibrary())).payload.recordings.length, 2);
  await api.resetToDefaultData();
  const reset = await api.loadLibrary();
  assert.equal(reset.recordings.length, 2);
  assert.ok(reset.syncQueue.some(item => item.lessonId === 'word-hand' && item.operation === 'archive_lesson'));
  values.set(api.LIBRARY_STORAGE_KEY, '{invalid');
  await assert.rejects(api.loadLibrary());
  assert.equal(values.get(api.LIBRARY_STORAGE_KEY), '{invalid', 'corrupt storage is not overwritten');
  values.delete(api.LIBRARY_STORAGE_KEY); values.delete(legacyKey);
  const emptyBackup = await pure.makeBackup(await pure.protectEntries([]));
  await api.importLibrary(emptyBackup);
  assert.equal((await api.loadLibrary()).recordings.length, 0);
  // AI Progress real stats recalculation tests
  {
    // Test: Sample-only entries return exactly 0 for all contribution stats
    const sampleStats = api.computeStudioStats(api.INITIAL_EDO_ENTRIES);
    assert.equal(sampleStats.wordsCollected, 0, 'No words counted when only sample entries exist');
    assert.equal(sampleStats.voiceRecordings, 0, 'No voice recordings counted when only sample entries exist');
    assert.equal(sampleStats.writtenWords, 0, 'No written words counted when only sample entries exist');
    assert.equal(sampleStats.phrasesAndSentences, 0, 'No phrases counted when only sample entries exist');
    assert.equal(sampleStats.totalContributions, 0);

    // Test: Real contributions counted accurately and deduplicated
    const testRealEntries = [
      {
        id: 'real-1',
        english: 'Water',
        edoText: 'Ame',
        category: 'word',
        hasAudio: true,
        audioDataUrl: 'data:audio/wav;base64,AAAA',
        isSampleData: false,
        status: 'awaiting_review',
        updatedAt: '2026-10-28T12:00:00Z'
      },
      {
        id: 'real-2',
        english: 'Water', // Duplicate English word
        edoText: 'Ame',
        category: 'word',
        hasAudio: true,
        audioDataUrl: 'data:audio/wav;base64,BBBB',
        isSampleData: false,
        status: 'awaiting_review',
        updatedAt: '2026-10-28T12:05:00Z'
      },
      {
        id: 'real-3',
        english: 'Food',
        edoText: '', // No written spelling
        category: 'word',
        hasAudio: true,
        cloudAudioFileId: 'drive_food_audio_123',
        isSampleData: false,
        status: 'needs_writing',
        updatedAt: '2026-10-28T12:10:00Z'
      },
      {
        id: 'real-4',
        english: 'Good morning',
        edoText: 'Koyo',
        category: 'phrase',
        hasAudio: false,
        isSampleData: false,
        status: 'needs_audio',
        updatedAt: '2026-10-28T12:15:00Z'
      }
    ];

    const realStats = api.computeStudioStats(testRealEntries);
    assert.equal(realStats.wordsCollected, 2, 'Unique words: Water, Food (deduplicated)');
    assert.equal(realStats.voiceRecordings, 3, 'Entries with valid local or cloud audio: real-1, real-2, real-3');
    assert.equal(realStats.writtenWords, 2, 'Words with submitted non-empty spelling: real-1 and real-2');
    assert.equal(realStats.phrasesAndSentences, 1, 'Phrases or sentences: real-4');
    assert.equal(realStats.totalContributions, 4);
    assert.equal(realStats.reviewQueueCount, 2, 'real-1 and real-2 awaiting review (no arbitrary +18)');
    assert.equal(realStats.needsHelpCount, 2, 'real-3 needs_writing and real-4 needs_audio');
  }

  const englishAudio = load(audioBundle);
  for (const word of ['Head', 'Nose', 'Leg', 'Body']) {
    englishAudio.playEnglishPronunciation(word);
    assert.equal(spokenUtterance.text, word, 'Speech must contain only the displayed English, without category prefixes');
  }

  // Automatic Silence Trimming & Full Spoken Pronunciation Preservation
  assert.equal(typeof englishAudio.trimPcmChannelData, 'function');
  assert.equal(typeof englishAudio.encodeWavPcm16, 'function');

  // Test: 1 second of silence, 0.5s of audio tone, 1 second of silence
  const sampleRate = 16000;
  const silenceStart = new Float32Array(sampleRate); // 1.0s silence
  const tone = new Float32Array(Math.floor(sampleRate * 0.5)); // 0.5s tone
  for (let i = 0; i < tone.length; i++) {
    tone[i] = Math.sin(2 * Math.PI * 440 * (i / sampleRate)) * 0.5;
  }
  const silenceEnd = new Float32Array(sampleRate); // 1.0s silence
  const combined = new Float32Array(silenceStart.length + tone.length + silenceEnd.length);
  combined.set(silenceStart, 0);
  combined.set(tone, silenceStart.length);
  combined.set(silenceEnd, silenceStart.length + tone.length);

  const trimmedRes = englishAudio.trimPcmChannelData([combined], sampleRate, { leadPaddingMs: 120, trailPaddingMs: 180 });
  assert.equal(trimmedRes.wasTrimmed, true, 'Silence at start and end must be trimmed');
  // Expected start: 1.0s - 120ms = ~0.88s (14080 samples)
  assert(trimmedRes.trimmedStartSample >= Math.floor(sampleRate * 0.85), 'Leading silence trimmed');
  assert(trimmedRes.trimmedStartSample <= Math.floor(sampleRate * 0.95), 'Safety padding preserved before spoken tone');
  // Expected end: 1.5s + 180ms = ~1.68s (26880 samples)
  assert(trimmedRes.trimmedEndSample <= Math.floor(sampleRate * 1.75), 'Trailing silence trimmed');
  assert(trimmedRes.trimmedEndSample >= Math.floor(sampleRate * 1.60), 'Safety padding preserved after spoken tone');

  // Verify full pronunciation preserved: tone samples inside are intact
  const trimmedSamples = trimmedRes.channels[0];
  let maxTrimmedAmp = 0;
  for (let i = 0; i < trimmedSamples.length; i++) {
    const a = Math.abs(trimmedSamples[i]);
    if (a > maxTrimmedAmp) maxTrimmedAmp = a;
  }
  assert(maxTrimmedAmp >= 0.45, 'Full spoken audio tone must be preserved');

  // Test encodeWavPcm16 produces valid RIFF WAVE
  const wavBytes = englishAudio.encodeWavPcm16([trimmedSamples], sampleRate);
  assert(wavBytes.length > 44, 'WAV has header and data');
  const wavHeader = Buffer.from(wavBytes.buffer).subarray(0, 12).toString('ascii');
  assert.equal(wavHeader.slice(0, 4), 'RIFF');
  assert.equal(wavHeader.slice(8, 12), 'WAVE');

  // Test Real Microphone Recording Scenario: 2s silence/noise -> 1s speech (quiet consonant + vowel) -> 3s silence/noise
  {
    const micRate = 16000;
    const preSilenceSec = 2.0;
    const speechSec = 1.0;
    const postSilenceSec = 3.0;
    const totalSec = preSilenceSec + speechSec + postSilenceSec; // 6.0s
    const totalSamples = Math.floor(micRate * totalSec);
    const micData = new Float32Array(totalSamples);

    // Populate with real ambient room noise floor (~0.006 - 0.008 RMS)
    let seed = 12345;
    for (let i = 0; i < totalSamples; i++) {
      seed = (seed * 16807) % 2147483647;
      const noise = ((seed / 2147483647) - 0.5) * 0.015;
      micData[i] = noise;
    }

    // Insert 1.0s speech starting at t=2.0s
    const speechStartSample = Math.floor(micRate * preSilenceSec); // index 32000
    const speechEndSample = speechStartSample + Math.floor(micRate * speechSec); // index 48000
    for (let i = speechStartSample; i < speechEndSample; i++) {
      const t = (i - speechStartSample) / micRate;
      let speechVal = 0;
      if (t < 0.15) {
        // Initial quiet fricative consonant ('s', 'kh', 'vb'): lower amplitude ~0.035
        speechVal = Math.sin(2 * Math.PI * 1800 * t) * 0.035;
      } else {
        // Spoken vowel / syllable
        speechVal = Math.sin(2 * Math.PI * 250 * t) * 0.40;
      }
      micData[i] += speechVal;
    }

    const micTrimRes = englishAudio.trimPcmChannelData([micData], micRate, { leadPaddingMs: 150, trailPaddingMs: 200 });
    assert.equal(micTrimRes.wasTrimmed, true, 'Real 6-second recording with 2s start and 3s end silence must be trimmed');
    assert.equal(micTrimRes.originalDurationSec, 6, 'Original duration must report 6 seconds');

    // Expected trimmed start: ~1.85s (saving the quiet consonant with 150ms lead padding)
    const expectedStartSec = micTrimRes.trimmedStartSample / micRate;
    assert(expectedStartSec >= 1.70 && expectedStartSec <= 2.00, `Trimmed start (${expectedStartSec.toFixed(2)}s) must preserve lead padding before speech`);

    // Expected trimmed end: ~3.20s (with 200ms trail padding)
    const expectedEndSec = micTrimRes.trimmedEndSample / micRate;
    assert(expectedEndSec >= 3.05 && expectedEndSec <= 3.35, `Trimmed end (${expectedEndSec.toFixed(2)}s) must preserve trailing decay`);

    // Trimmed duration should be ~1.35s (rounded to 1s)
    assert(micTrimRes.durationSec >= 1 && micTrimRes.durationSec <= 2, `Trimmed duration (${micTrimRes.durationSec}s) is significantly shorter than 6s`);

    // Confirm initial quiet consonant was NOT cut off
    const trimmedPcm = micTrimRes.channels[0];
    const consonantSampleIndex = Math.floor(micRate * (preSilenceSec + 0.05)) - micTrimRes.trimmedStartSample;
    assert(consonantSampleIndex > 0 && consonantSampleIndex < trimmedPcm.length, 'Initial consonant region must be inside trimmed audio');
  }

  console.log('PASS: legacy preservation; stable IDs; original formats/bytes; independent permissions; persistent/idempotent queue; backup verification; additive import; duplicate/conflict protection; fresh restore; offline playback source; storage failure atomicity; retained audio; corruption rejection; real studio statistics recalculation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
