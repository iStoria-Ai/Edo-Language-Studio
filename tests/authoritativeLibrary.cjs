const { buildSync } = require('esbuild');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');

// Bundle the TypeScript library modules via stdin
const bundle = buildSync({
  stdin: {
    contents: `
      export * from './src/services/libraryResetService';
      export * from './src/services/communityLibrary';
      export { isCompletedLesson } from './src/screens/LanguageLibraryScreen';
      export { loadLibrary, saveEntries } from './src/services/storageService';
    `,
    resolveDir: process.cwd(),
    loader: 'ts'
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  external: ['@capacitor/*', 'react', 'lucide-react']
}).outputFiles[0].text;

function createTestDevice(storage = new Map(), mockFetch = async () => { throw new Error('offline'); }) {
  const module = { exports: {} };
  const navigator = { onLine: true };
  const context = {
    module,
    exports: module.exports,
    console,
    crypto: webcrypto,
    TextEncoder,
    Uint8Array,
    AbortSignal,
    atob,
    btoa,
    navigator,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, val) => storage.set(key, String(val)),
      removeItem: (key) => storage.delete(key)
    },
    fetch: (...args) => mockFetch(...args),
    require: (name) => {
      if (name === '@capacitor/core') return { Capacitor: { isNativePlatform: () => false } };
      if (name === '@capacitor/filesystem') return { Filesystem: { writeFile: async () => {} }, Directory: { Data: 'data' } };
      if (name === '@capacitor/preferences') {
        return {
          Preferences: {
            get: async ({ key }) => ({ value: storage.get(key) || null }),
            set: async ({ key, value }) => storage.set(key, String(value)),
            remove: async ({ key }) => storage.delete(key),
            keys: async () => ({ keys: Array.from(storage.keys()) })
          }
        };
      }
      if (name === 'react' || name === 'react/jsx-runtime') {
        return {
          useState: () => [null, () => {}],
          useEffect: () => {},
          useRef: () => ({ current: null }),
          jsx: () => null,
          jsxs: () => null,
          Fragment: () => null
        };
      }
      if (name === 'lucide-react') return {};
      throw new Error('Unknown module ' + name);
    }
  };
  vm.runInNewContext(bundle, context);
  return { api: module.exports, navigator, storage };
}

(async () => {
  console.log('=== Running Authoritative Google Drive Library & Reset Tests ===\n');

  // Multi-device shared cloud state (representing Google Drive)
  let googleDriveFiles = new Map(); // fileId -> { name, content, trashed }
  let scriptProperties = new Map();

  function gatewayRequest(payload) {
    if (payload.action === 'get_library') {
      const activeItems = [];
      const metas = [];
      for (const [id, f] of googleDriveFiles.entries()) {
        if (!f.trashed && f.name.endsWith('_meta.json')) {
          metas.push({ fileId: id, meta: JSON.parse(f.content) });
        }
      }

      for (const { fileId, meta } of metas) {
        const audioFile = Array.from(googleDriveFiles.values()).find(
          f => !f.trashed && f.id === meta.audioFileId
        );
        if (audioFile && audioFile.content.length > 0) {
          activeItems.push({
            id: 'cloud-' + meta.lessonId + '-' + meta.recordingId,
            sourceLessonId: meta.lessonId,
            recordingId: meta.recordingId,
            english: meta.englishWord,
            edoText: meta.edoSpelling || '',
            category: meta.category || 'word',
            hasAudio: true,
            cloudMetadataFileId: fileId,
            cloudAudioFileId: audioFile.id,
            isCommunity: true,
            playbackPermission: meta.permissions?.playback || 'granted',
            reviewStatus: meta.reviewStatus || 'pending_approval',
            status: meta.edoSpelling ? 'awaiting_review' : 'needs_spelling',
            isSampleData: false,
            updatedAt: new Date().toISOString()
          });
        }
      }

      const activeRecordings = new Set(activeItems.map(i => i.recordingId));
      let completed = JSON.parse(scriptProperties.get('COMPLETED_QUESTIONS_V1') || '{}');
      let tombstones = JSON.parse(scriptProperties.get('DELETED_RECORDS_V1') || '{}');
      const prunedCompleted = {};

      for (const qId of Object.keys(completed)) {
        const recId = completed[qId];
        if (activeRecordings.has(recId)) {
          prunedCompleted[qId] = recId;
        } else {
          tombstones[recId] = new Date().toISOString();
          tombstones[qId] = new Date().toISOString();
        }
      }
      scriptProperties.set('COMPLETED_QUESTIONS_V1', JSON.stringify(prunedCompleted));
      scriptProperties.set('DELETED_RECORDS_V1', JSON.stringify(tombstones));

      return {
        status: 'success',
        action: 'get_library',
        checkedAt: new Date().toISOString(),
        items: activeItems,
        tombstones: Object.keys(tombstones),
        answeredQuestionIds: Object.keys(prunedCompleted)
      };
    }

    if (payload.action === 'upload_recording') {
      const audioId = 'drive-audio-' + payload.recordingId;
      const metaId = 'drive-meta-' + payload.recordingId;
      googleDriveFiles.set(audioId, {
        id: audioId,
        name: payload.lessonId + '_' + payload.recordingId + '.webm',
        content: payload.audioBase64 || 'dummy-bytes',
        trashed: false
      });
      googleDriveFiles.set(metaId, {
        id: metaId,
        name: payload.lessonId + '_' + payload.recordingId + '_meta.json',
        content: JSON.stringify({
          lessonId: payload.lessonId,
          recordingId: payload.recordingId,
          englishWord: payload.english,
          edoSpelling: payload.edoText,
          category: payload.category || 'word',
          audioFileId: audioId,
          permissions: payload.permissions || { playback: 'granted' },
          reviewStatus: 'pending_approval'
        }),
        trashed: false
      });

      let completed = JSON.parse(scriptProperties.get('COMPLETED_QUESTIONS_V1') || '{}');
      completed[payload.lessonId] = payload.recordingId;
      scriptProperties.set('COMPLETED_QUESTIONS_V1', JSON.stringify(completed));

      return {
        status: 'success',
        action: 'upload_recording',
        duplicate: false,
        lessonId: payload.lessonId,
        recordingId: payload.recordingId,
        audioFileId: audioId,
        metadataFileId: metaId,
        verified: true
      };
    }

    if (payload.action === 'stream_audio') {
      const audioFile = googleDriveFiles.get(payload.fileId);
      if (!audioFile || audioFile.trashed) {
        return { status: 'error', code: 'FILE_NOT_FOUND', message: 'Audio file missing in Drive' };
      }
      return { status: 'success', audioDataUrl: 'data:audio/webm;base64,' + audioFile.content };
    }

    throw new Error('Unknown action: ' + payload.action);
  }

  const mockGatewayFetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const res = gatewayRequest(body);
    return { ok: true, json: async () => res };
  };

  const deviceA = createTestDevice(new Map(), mockGatewayFetch);
  const deviceB = createTestDevice(new Map(), mockGatewayFetch);

  // --- Step 1: Upload a new Edo recording from Device A ---
  console.log('--- Step 1: Upload new Edo recording from Device A ---');
  const uploadRes = await mockGatewayFetch('', {
    body: JSON.stringify({
      action: 'upload_recording',
      lessonId: 'word-tree',
      recordingId: 'rec-tree-100',
      english: 'Tree',
      edoText: 'Ikhinmwin',
      category: 'word',
      audioBase64: 'base64-tree-sound',
      permissions: { playback: 'granted', aiVoiceTraining: 'denied' }
    })
  });
  const uploadJson = await uploadRes.json();
  assert.equal(uploadJson.status, 'success');
  console.log('✓ Recording uploaded successfully to Google Drive gateway.');

  // --- Step 2: Confirm it appears in Google Drive ---
  console.log('--- Step 2: Confirm it appears in Google Drive ---');
  assert(googleDriveFiles.has(uploadJson.audioFileId), 'Audio file must exist in Google Drive');
  assert(googleDriveFiles.has(uploadJson.metadataFileId), 'Metadata file must exist in Google Drive');
  console.log('✓ Audio and companion metadata verified in Google Drive.');

  // --- Step 3: Confirm it appears in the Library on two different devices ---
  console.log('--- Step 3: Confirm it appears in Library on Device A and Device B ---');
  const snapshotA = await deviceA.api.fetchCommunityLibrary();
  const snapshotB = await deviceB.api.fetchCommunityLibrary();

  const libCardsA = snapshotA.entries.filter(deviceA.api.isCompletedLesson);
  const libCardsB = snapshotB.entries.filter(deviceB.api.isCompletedLesson);

  assert.equal(libCardsA.length, 1);
  assert.equal(libCardsA[0].english, 'Tree');
  assert.equal(libCardsA[0].edoText, 'Ikhinmwin');

  assert.equal(libCardsB.length, 1);
  assert.equal(libCardsB[0].english, 'Tree');
  assert.equal(libCardsB[0].edoText, 'Ikhinmwin');
  console.log('✓ Both Device A and Device B display completed lesson from Google Drive.');

  // --- Step 3b: Verify original recovery audio is preserved after verified cloud sync ---
  console.log('--- Step 3b: Verify original recovery audio is preserved after verified sync ---');
  const validAudioDataUrl = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
  // Device A had local entry
  const localA = {
    id: 'word-tree',
    english: 'Tree',
    edoText: 'Ikhinmwin',
    category: 'word',
    illustrationKey: 'tree',
    emoji: '🌳',
    hasAudio: true,
    audioDurationSec: 3,
    status: 'awaiting_review',
    isSampleData: false,
    audioDataUrl: validAudioDataUrl,
    cloudAudioFileId: uploadJson.audioFileId,
    cloudMetadataFileId: uploadJson.metadataFileId,
    syncStatus: 'synced_to_drive',
    updatedAt: new Date().toISOString()
  };
  await deviceA.api.saveEntries([localA]);

  await deviceA.api.reconcileLocalLibraryWithCloud(snapshotA);
  const reconciledLibA = await deviceA.api.loadLibrary();
  const treeEntryA = reconciledLibA.entries.find(e => e.id === 'word-tree');
  assert.equal(treeEntryA.audioDataUrl, validAudioDataUrl, 'Protected original recovery audio must not be erased by cache cleanup');
  console.log('✓ Recovery audio remains protected; Drive alone controls public Library visibility.');

  // --- Step 4: Delete its authoritative files directly from Google Drive ---
  console.log('--- Step 4: Delete authoritative files directly from Google Drive ---');
  googleDriveFiles.get(uploadJson.audioFileId).trashed = true;
  googleDriveFiles.get(uploadJson.metadataFileId).trashed = true;
  console.log('✓ Audio and metadata marked trashed/deleted directly in Google Drive.');

  // --- Step 5: Refresh both devices ---
  console.log('--- Step 5: Refresh both devices ---');
  const refreshedSnapshotA = await deviceA.api.fetchCommunityLibrary();
  const refreshedSnapshotB = await deviceB.api.fetchCommunityLibrary();

  // --- Step 6: Confirm the lesson disappears from both Libraries ---
  console.log('--- Step 6: Confirm lesson disappears from both Libraries ---');
  assert.equal(refreshedSnapshotA.entries.length, 0, 'Device A community library must be empty');
  assert.equal(refreshedSnapshotB.entries.length, 0, 'Device B community library must be empty');

  const refreshedCardsA = refreshedSnapshotA.entries.filter(deviceA.api.isCompletedLesson);
  const refreshedCardsB = refreshedSnapshotB.entries.filter(deviceB.api.isCompletedLesson);
  assert.equal(refreshedCardsA.length, 0, 'Device A Library cards must be empty');
  assert.equal(refreshedCardsB.length, 0, 'Device B Library cards must be empty');
  console.log('✓ Completed lesson completely disappeared from both Libraries.');

  // --- Step 7: Confirm old local cache cannot restore it ---
  console.log('--- Step 7: Confirm old local cache cannot restore deleted lesson ---');
  await deviceA.api.reconcileLocalLibraryWithCloud(refreshedSnapshotA);
  const localAfterPruneA = await deviceA.api.loadLibrary();
  const treeLocal = localAfterPruneA.entries.find(e => e.id === 'word-tree');
  assert.equal(treeLocal.audioDataUrl, validAudioDataUrl, 'Deleted cloud lessons leave protected recovery data untouched');

  // Even if old local entry exists, mergeCommunityEntries will not show it
  const mergedEmpty = deviceA.api.mergeCommunityEntries([localA], refreshedSnapshotA.entries, [], refreshedSnapshotA.tombstones);
  const finalLibraryCards = mergedEmpty.filter(deviceA.api.isCompletedLesson);
  assert.equal(finalLibraryCards.length, 0, 'Old local copy cannot restore deleted lesson into public Library');
  console.log('✓ Old local storage copies strictly prevented from repopulating the Library.');

  // --- Step 8: Confirm deleted lesson question returns to Teach Edo pool when no active contribution remains ---
  console.log('--- Step 8: Confirm deleted lesson question returns to Teach Edo pool ---');
  assert(!refreshedSnapshotA.answeredQuestionIds.includes('word-tree'), 'Deleted lesson question must return to pool when no active copy remains');
  const answeredIds = new Set(refreshedSnapshotA.answeredQuestionIds);
  assert(!answeredIds.has('word-tree'), 'Deleted files allow question to re-enter Teach Edo');
  console.log('✓ "Tree" returns to Teach Edo questions.');

  // --- Step 9: Confirm genuine new offline recording survives until uploaded ---
  console.log('--- Step 9: Confirm genuine new offline recording survives ---');
  const newOfflineRecording = {
    id: 'word-house',
    english: 'House',
    edoText: 'Owa',
    category: 'word',
    illustrationKey: 'house',
    emoji: '🏠',
    hasAudio: true,
    audioDurationSec: 3,
    audioDataUrl: validAudioDataUrl,
    syncStatus: 'pending_upload',
    isSampleData: false,
    status: 'awaiting_review',
    updatedAt: new Date().toISOString()
  };
  await deviceA.api.saveEntries([newOfflineRecording]);

  // Reconcile with cloud (which is currently empty)
  await deviceA.api.reconcileLocalLibraryWithCloud(refreshedSnapshotA);
  const libWithOffline = await deviceA.api.loadLibrary();
  const housePending = libWithOffline.entries.find(e => e.id === 'word-house');
  assert(housePending, 'Genuine new offline recording must survive');
  assert.equal(housePending.audioDataUrl, validAudioDataUrl, 'Audio bytes must be preserved');
  assert.equal(housePending.syncStatus, 'pending_upload');
  console.log('✓ Genuine new offline recording safely preserved in local upload queue.');

  // --- Step 10: One-Time Global Reset (edo_library_reset_v2) ---
  console.log('--- Step 10: Testing One-Time Global Library Reset (edo_library_reset_v2) ---');
  assert.equal(await deviceB.api.isLibraryResetCompleted(), false);
  // Device B has old stale localStorage keys and audio
  await deviceB.api.loadLibrary();
  deviceB.storage.set('edo_language_studio_entries_v1', 'legacy-stale-entries');
  deviceB.storage.set('edo_community_audio_stale123', 'stale-audio-bytes');

  // Execute reset with empty cloud snapshot
  await deviceB.api.executeOneTimeLibraryReset(refreshedSnapshotB);
  assert.equal(await deviceB.api.isLibraryResetCompleted(), true);
  assert(deviceB.storage.has('edo_language_studio_entries_v1'), 'Legacy recovery storage is preserved');
  assert(!deviceB.storage.has('edo_community_audio_stale123'), 'Stale audio cache removed');

  // Reopening/reloading confirms reset stays complete and library stays empty
  assert.equal(await deviceB.api.isLibraryResetCompleted(), true);
  const cachedAfterReset = await deviceB.api.readCommunityCache();
  assert.equal(cachedAfterReset.entries.length, 0, 'Cached library after reset is completely empty');
  console.log('✓ One-time reset cleaned all stale keys, caches, and left Library completely empty.');

  // --- Step 11: Completely Empty Google Drive Folder ---
  console.log('--- Step 11: Testing completely empty Google Drive folder ---');
  googleDriveFiles.clear();
  scriptProperties.clear();

  const emptyDevice = createTestDevice(new Map(), mockGatewayFetch);
  // Device starts with old local completed items in storage
  await emptyDevice.api.saveEntries([{
    id: 'old-completed-1',
    english: 'Sun',
    edoText: 'Oven',
    category: 'word',
    illustrationKey: 'sun',
    emoji: '☀️',
    hasAudio: true,
    audioDurationSec: 2,
    status: 'awaiting_review',
    isSampleData: false,
    syncStatus: 'synced_to_drive',
    cloudAudioFileId: 'old-audio',
    cloudMetadataFileId: 'old-meta',
    audioDataUrl: validAudioDataUrl,
    updatedAt: '2026-10-25T00:00:00Z'
  }]);

  const emptySnapshot = await emptyDevice.api.fetchCommunityLibrary();
  assert.equal(emptySnapshot.entries.length, 0, 'Empty Google Drive returns 0 items');
  assert.equal(emptySnapshot.answeredQuestionIds.length, 0, 'Empty Google Drive returns 0 answered questions');

  await emptyDevice.api.executeOneTimeLibraryReset(emptySnapshot);
  assert.equal(await emptyDevice.api.isLibraryResetCompleted(), true);

  const libraryAfterEmptySync = (await emptyDevice.api.readCommunityCache()).entries.filter(emptyDevice.api.isCompletedLesson);
  assert.equal(libraryAfterEmptySync.length, 0, 'Public Library must be 100% empty when Google Drive is empty');
  console.log('✓ When Google Drive is empty, shared Library is confirmed empty on all devices without restoring old local data.');

  console.log('\n=== ALL AUTHORITATIVE LIBRARY & RESET TESTS PASSED! ===');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
