/**
 * Step 2A Cloud Sync & Upload Verification Tests
 * Verifies uploadRecordingToGateway, data parsing, token gating,
 * cloud file ID verification, duplicate idempotency, and local audio preservation.
 */

const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

// Bundle cloudSyncService and libraryProtection for test execution
const cloudBundle = buildSync({
  entryPoints: ['src/services/cloudSyncService.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs'
}).outputFiles[0].text;

const storageBundle = buildSync({
  entryPoints: ['src/services/storageService.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  external: ['@capacitor/*']
}).outputFiles[0].text;

function loadCloudService(mockFetch, mockLocalStorage = new Map()) {
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    console,
    crypto: webcrypto,
    TextEncoder,
    Uint8Array,
    atob,
    btoa,
    fetch: mockFetch,
    AbortSignal,
    localStorage: {
      getItem: (key) => mockLocalStorage.get(key) ?? null,
      setItem: (key, val) => mockLocalStorage.set(key, String(val)),
      removeItem: (key) => mockLocalStorage.delete(key)
    }
  };
  vm.runInNewContext(cloudBundle, context);
  return module.exports;
}

function generateSampleWav() {
  const bytes = Buffer.alloc(44 + 1600);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(1600, 40);
  return 'data:audio/wav;base64,' + bytes.toString('base64');
}

(async () => {
  const sampleAudio = generateSampleWav();
  const sampleBase64 = sampleAudio.split(',')[1];

  // Test 1: parseAudioDataUrl extracts clean MIME and base64
  {
    const service = loadCloudService(() => {});
    const parsed = service.parseAudioDataUrl(sampleAudio);
    assert.equal(parsed.mimeType, 'audio/wav');
    assert.equal(parsed.base64, sampleBase64);

    const parsedWebm = service.parseAudioDataUrl('data:audio/webm;codecs=opus;base64,GkXfo59ChoEBQveBAULygQ8=');
    assert.equal(parsedWebm.mimeType, 'audio/webm');
    assert.equal(parsedWebm.base64, 'GkXfo59ChoEBQveBAULygQ8=');
  }

  // Test 2: uploadRecordingToGateway supports automatic token-free upload
  {
    const storage = new Map(); // Empty token storage
    let capturedPayload = null;
    const mockFetch = async (url, options) => {
      capturedPayload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        url,
        json: async () => ({
          status: 'success',
          duplicate: false,
          action: 'upload_recording',
          lessonId: capturedPayload.lessonId,
          recordingId: capturedPayload.recordingId,
          audioFileId: 'drive_auto_audio_123',
          metadataFileId: 'drive_auto_meta_456',
          recordingStatus: 'needs_spelling',
          verified: true,
          message: 'Saved automatically to Google Drive'
        })
      };
    };

    const service = loadCloudService(mockFetch, storage);
    const result = await service.uploadRecordingToGateway({
      lessonId: 'word-hand',
      english: 'Hand',
      audioDataUrl: sampleAudio,
      durationSec: 2
    });

    assert.equal(result.ok, true);
    assert.equal(result.audioFileId, 'drive_auto_audio_123');
    assert.equal(capturedPayload.authToken, '', 'Empty string sent when no contributor token configured');
    assert.equal(capturedPayload.action, 'upload_recording');
  }

  // Test 3: uploadRecordingToGateway verifies both audioFileId and metadataFileId
  {
    const storage = new Map([['edo_contributor_auth_token_v1', 'valid_test_speaker_token']]);
    let sentPayload = null;

    const mockFetch = async (url, options) => {
      sentPayload = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        url: url,
        json: async () => ({
          status: 'success',
          duplicate: false,
          action: 'upload_recording',
          lessonId: sentPayload.lessonId,
          recordingId: sentPayload.recordingId,
          audioFileId: 'drive_audio_file_id_123',
          metadataFileId: 'drive_metadata_file_id_456',
          recordingStatus: 'needs_spelling',
          verified: true,
          message: 'Recording and metadata verified and stored securely in Google Drive.'
        })
      };
    };

    const service = loadCloudService(mockFetch, storage);
    const result = await service.uploadRecordingToGateway({
      lessonId: 'word-hand',
      english: 'Hand',
      audioDataUrl: sampleAudio,
      durationSec: 2.5
    });

    assert.equal(result.ok, true);
    assert.equal(result.duplicate, false);
    assert.equal(result.verified, true);
    assert.equal(result.audioFileId, 'drive_audio_file_id_123');
    assert.equal(result.metadataFileId, 'drive_metadata_file_id_456');
    assert.equal(result.recordingStatus, 'needs_spelling');
    assert.equal(sentPayload.action, 'upload_recording');
    assert.equal(sentPayload.authToken, 'valid_test_speaker_token');
    assert.equal(sentPayload.english, 'Hand');
    assert.equal(sentPayload.edoText, '');
    assert.equal(sentPayload.audioBase64, sampleBase64);
  }

  // Test 4: Idempotent duplicate uploads return verified file references
  {
    const storage = new Map([['edo_contributor_auth_token_v1', 'valid_test_speaker_token']]);

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      url: 'https://script.google.com/test',
      json: async () => ({
        status: 'success',
        duplicate: true,
        verified: true,
        action: 'upload_recording',
        lessonId: 'word-hand',
        recordingId: 'rec-test-id',
        audioFileId: 'existing_drive_audio_123',
        metadataFileId: 'existing_drive_meta_456',
        message: 'Both audio and metadata already verified in Google Drive. Existing record preserved.'
      })
    });

    const service = loadCloudService(mockFetch, storage);
    const result = await service.uploadRecordingToGateway({
      lessonId: 'word-hand',
      recordingId: 'rec-test-id',
      english: 'Hand',
      audioDataUrl: sampleAudio,
      durationSec: 2
    });

    assert.equal(result.ok, true);
    assert.equal(result.duplicate, true);
    assert.equal(result.verified, true);
    assert.equal(result.audioFileId, 'existing_drive_audio_123');
    assert.equal(result.metadataFileId, 'existing_drive_meta_456');
  }

  // Test 5: Network / Offline failure preserves local data and returns clear error
  {
    const storage = new Map([['edo_contributor_auth_token_v1', 'valid_test_speaker_token']]);
    const mockFetch = async () => {
      throw new Error('Failed to fetch (offline)');
    };

    const service = loadCloudService(mockFetch, storage);
    const result = await service.uploadRecordingToGateway({
      lessonId: 'word-hand',
      english: 'Hand',
      audioDataUrl: sampleAudio,
      durationSec: 2
    });

    assert.equal(result.ok, false);
    assert.match(result.message, /preserved/i);
  }

  // Test 6: Incomplete server response (missing metadata ID) triggers verification failure
  {
    const storage = new Map([['edo_contributor_auth_token_v1', 'valid_test_speaker_token']]);
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      url: 'https://script.google.com/test',
      json: async () => ({
        status: 'success',
        audioFileId: 'drive_audio_123'
        // Missing metadataFileId!
      })
    });

    const service = loadCloudService(mockFetch, storage);
    const result = await service.uploadRecordingToGateway({
      lessonId: 'word-hand',
      english: 'Hand',
      audioDataUrl: sampleAudio,
      durationSec: 2
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'VERIFICATION_FAILED');
  }

  // Test 7: Persistent queue operations
  {
    const storage = new Map();
    const service = loadCloudService(() => {}, storage);

    assert.equal(service.getPersistentUploadQueue().length, 0);

    service.enqueueForBackgroundUpload('entry-1');
    service.enqueueForBackgroundUpload('entry-2');
    service.enqueueForBackgroundUpload('entry-1'); // Duplicate should not create duplicate queue entry

    let queue = service.getPersistentUploadQueue();
    assert.equal(queue.length, 2);
    assert.equal(queue[0].lessonId, 'entry-1');
    assert.equal(queue[1].lessonId, 'entry-2');

    service.dequeueFromBackgroundUpload('entry-1');
    queue = service.getPersistentUploadQueue();
    assert.equal(queue.length, 1);
    assert.equal(queue[0].lessonId, 'entry-2');
  }

  // Test 8: streamAudioFromGateway retrieval and memory caching
  {
    const storage = new Map([['edo_contributor_auth_token_v1', 'valid_test_speaker_token']]);
    let fetchCount = 0;
    const mockFetch = async (url, options) => {
      fetchCount++;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        url,
        json: async () => ({
          status: 'success',
          action: 'stream_audio',
          audioDataUrl: sampleAudio,
          fileId: 'cloud_file_123'
        })
      };
    };

    const service = loadCloudService(mockFetch, storage);
    const res1 = await service.streamAudioFromGateway('cloud_file_123');
    assert.equal(res1.ok, true);
    assert.equal(res1.audioDataUrl, sampleAudio);
    assert.equal(fetchCount, 1);

    // Second call should hit the cache without re-fetching
    const res2 = await service.streamAudioFromGateway('cloud_file_123');
    assert.equal(res2.ok, true);
    assert.equal(res2.audioDataUrl, sampleAudio);
    assert.equal(fetchCount, 1, 'streamAudioFromGateway should cache streamed audio in memory');
  }

  // Test 9: Background worker executes upload -> verifies stream -> safely frees local audio bytes
  {
    const storage = new Map([['edo_contributor_auth_token_v1', 'valid_test_speaker_token']]);
    const mockFetch = async (url, options) => {
      const payload = JSON.parse(options.body);
      if (payload.action === 'upload_recording') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          url,
          json: async () => ({
            status: 'success',
            duplicate: false,
            action: 'upload_recording',
            lessonId: payload.lessonId,
            recordingId: payload.recordingId,
            audioFileId: 'drive_audio_abc',
            metadataFileId: 'drive_meta_def',
            verified: true,
            message: 'Uploaded'
          })
        };
      }
      if (payload.action === 'stream_audio') {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          url,
          json: async () => ({
            status: 'success',
            action: 'stream_audio',
            audioDataUrl: sampleAudio,
            fileId: payload.fileId
          })
        };
      }
      throw new Error(`Unexpected action: ${payload.action}`);
    };

    const service = loadCloudService(mockFetch, storage);

    let testEntries = [
      {
        id: 'entry-test-1',
        english: 'Water',
        edoText: 'Ame',
        category: 'word',
        hasAudio: true,
        audioDataUrl: sampleAudio,
        audioDurationSec: 2,
        syncStatus: 'pending_upload',
        createdAt: 1000,
        updatedAt: 1000
      }
    ];

    service.enqueueForBackgroundUpload('entry-test-1');

    await service.processBackgroundUploadQueue(
      () => testEntries,
      async (entryId, audioId, metaId) => {
        // Safe verified cleanup callback
        const idx = testEntries.findIndex((e) => e.id === entryId);
        if (idx !== -1) {
          testEntries[idx] = {
            ...testEntries[idx],
            audioDataUrl: undefined, // Safely freed
            syncStatus: 'synced_to_drive',
            cloudAudioFileId: audioId,
            cloudMetadataFileId: metaId
          };
        }
      },
      async (entryId, errorMsg) => {
        const idx = testEntries.findIndex((e) => e.id === entryId);
        if (idx !== -1) {
          testEntries[idx] = { ...testEntries[idx], syncStatus: 'upload_failed', syncError: errorMsg };
        }
      },
      (entryId, status) => {
        const idx = testEntries.findIndex((e) => e.id === entryId);
        if (idx !== -1) {
          testEntries[idx] = { ...testEntries[idx], syncStatus: status };
        }
      }
    );

    // Verify queue is empty
    assert.equal(service.getPersistentUploadQueue().length, 0);

    // Verify entry was safely updated: cloud IDs attached, local bytes freed
    assert.equal(testEntries[0].syncStatus, 'synced_to_drive');
    assert.equal(testEntries[0].cloudAudioFileId, 'drive_audio_abc');
    assert.equal(testEntries[0].cloudMetadataFileId, 'drive_meta_def');
    assert.equal(testEntries[0].audioDataUrl, undefined);
    assert.equal(testEntries[0].hasAudio, true);
    assert.equal(testEntries[0].english, 'Water');
  }

  // Test 10: Failed upload or unverified stream NEVER deletes local audio
  {
    const storage = new Map([['edo_contributor_auth_token_v1', 'valid_test_speaker_token']]);
    const mockFetch = async () => {
      throw new Error('Connection refused (offline)');
    };

    const service = loadCloudService(mockFetch, storage);

    let testEntries = [
      {
        id: 'entry-test-fail',
        english: 'House',
        hasAudio: true,
        audioDataUrl: sampleAudio,
        audioDurationSec: 2,
        syncStatus: 'pending_upload',
        createdAt: 1000,
        updatedAt: 1000
      }
    ];

    service.enqueueForBackgroundUpload('entry-test-fail');

    await service.processBackgroundUploadQueue(
      () => testEntries,
      async (_entryId) => {
        assert.fail('Verified cleanup must NEVER be called when upload or verification fails');
      },
      async (entryId, errorMsg) => {
        const idx = testEntries.findIndex((e) => e.id === entryId);
        if (idx !== -1) {
          testEntries[idx] = { ...testEntries[idx], syncStatus: 'upload_failed', syncError: errorMsg };
        }
      },
      (entryId, status) => {
        const idx = testEntries.findIndex((e) => e.id === entryId);
        if (idx !== -1) {
          testEntries[idx] = { ...testEntries[idx], syncStatus: status };
        }
      }
    );

    // Entry must retain local audio bytes untouched!
    assert.equal(testEntries[0].audioDataUrl, sampleAudio);
    assert.equal(testEntries[0].syncStatus, 'upload_failed');
    assert.match(testEntries[0].syncError, /preserved/i);

    // Item must remain in queue for future retry
    const remainingQueue = service.getPersistentUploadQueue();
    assert.equal(remainingQueue.length, 1);
    assert.equal(remainingQueue[0].lessonId, 'entry-test-fail');
    assert.equal(remainingQueue[0].attempts, 1);
  }

  // Test 10B: fetchNeedsSpellingQueue and submitSpellingToGateway
  {
    let capturedAction = null;
    let capturedPayload = null;
    const mockFetch = async (_url, options) => {
      capturedPayload = JSON.parse(options.body);
      capturedAction = capturedPayload.action;
      if (capturedAction === 'get_needs_spelling') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            action: 'get_needs_spelling',
            count: 1,
            items: [{ recordingId: 'rec-1', lessonId: 'lesson-1', englishWord: 'Hand', audioFileId: 'aud-1', metadataFileId: 'meta-1' }]
          })
        };
      }
      if (capturedAction === 'submit_spelling') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            status: 'success',
            action: 'submit_spelling',
            status: 'spelling_submitted',
            message: 'Edo spelling attached successfully.'
          })
        };
      }
      return { ok: false, status: 400, json: async () => ({ status: 'error' }) };
    };

    const service = loadCloudService(mockFetch);
    const queueRes = await service.fetchNeedsSpellingQueue('test-token');
    assert.equal(queueRes.ok, true);
    assert.equal(queueRes.items.length, 1);
    assert.equal(queueRes.items[0].englishWord, 'Hand');
    assert.equal(capturedPayload.action, 'get_needs_spelling');

    const submitRes = await service.submitSpellingToGateway({
      metadataFileId: 'meta-1',
      edoSpelling: 'Ọbọ',
      authToken: 'test-token'
    });
    assert.equal(submitRes.ok, true);
    assert.equal(capturedPayload.action, 'submit_spelling');
    assert.equal(capturedPayload.edoSpelling, 'Ọbọ');
  }

  // A verified private upload is synced even when public playback is withheld.
  {
    const entry = { id: 'private-sync', hasAudio: true, audioDataUrl: sampleAudio, english: 'Test' };
    let synced = false;
    const service = loadCloudService(async (url, options) => {
      const payload = JSON.parse(options.body);
      assert.equal(payload.authToken, '', 'Community sync must not require a token');
      return { ok: true, status: 200, url, json: async () => payload.action === 'upload_recording'
        ? { status: 'success', audioFileId: 'private-audio', metadataFileId: 'private-meta', verified: true }
        : { status: 'error', code: 'PLAYBACK_PERMISSION_DENIED', message: 'Playback denied' } };
    });
    service.enqueueForBackgroundUpload(entry.id);
    await service.processBackgroundUploadQueue(() => [entry], async () => { synced = true; }, async () => {
      assert.fail('A verified upload with restricted playback must not be marked failed');
    });
    assert.equal(synced, true);
    assert.equal(service.getPersistentUploadQueue().length, 0);
    assert.equal(entry.audioDataUrl, sampleAudio, 'Original audio must be retained');
  }

  {
    const expected = { fileCount: 0, audioFileCount: 0, metadataFileCount: 0, wordsCollected: 0, voiceRecordings: 0, writtenWords: 0, phrasesAndSentences: 0, totalContributions: 0, reviewQueueCount: 0, needsHelpCount: 0 };
    const service = loadCloudService(async (url, options) => {
      assert.equal(JSON.parse(options.body).action, 'get_collection_stats');
      assert.equal(options.cache, 'no-store');
      return { ok: true, json: async () => ({ status: 'success', stats: expected, checkedAt: '2026-10-29T00:00:00Z' }) };
    });
    const result = await service.fetchDriveCollectionStats();
    assert.equal(result.stats.totalContributions, 0, 'Cloud zero must not fall back to device totals');
    const broken = loadCloudService(async () => ({ ok: true, json: async () => ({ status: 'success', stats: { ...expected, voiceRecordings: -1 } }) }));
    await assert.rejects(broken.fetchDriveCollectionStats(), /valid collection totals/);
  }

  // Explicit deployment gate: failures must propagate rather than pass as offline skips.
  // Run with EDO_VERIFY_LIVE=1 npm test before deploying the token-free app.
  if (process.env.EDO_VERIFY_LIVE === '1') {
    const service = loadCloudService(globalThis.fetch);
    const health = await service.checkGatewayHealth();
    assert.equal(health.ok, true, health.error || 'Live gateway health check failed');
    assert.equal(health.data?.folderConnected, true);
    const postPing = await service.pingGatewayPost('');
    assert.equal(postPing.ok, true, postPing.error || 'Live gateway rejects token-free requests');
    assert.equal(postPing.data?.verifiedUser?.isCommunity, true);
    console.log('PASS: Live gateway accepts token-free community requests.');
  }

  console.log('PASS: All Cloud Gateway & Instant Save Background Upload Tests passed.');
})();
