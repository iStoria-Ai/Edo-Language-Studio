/**
 * Comprehensive Test Harness for Edo Language Studio Google Apps Script (gas/Code.gs)
 *
 * Mocks the Google Apps Script environment:
 * - DriveApp (Folders, Files, FileIterator, Parent relationships)
 * - PropertiesService (ScriptProperties for CONTRIBUTOR_DIRECTORY)
 * - CacheService (ScriptCache with TTL simulation for rate limiting)
 * - LockService (ScriptLock)
 * - Utilities (base64Encode, base64Decode, newBlob, getUuid)
 * - ContentService (createTextOutput, JSON MimeType)
 * - Logger (log output tracking)
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const TARGET_FOLDER_ID = '1eOYgm0ZyyPiw92NqsWFTYsv_9fZ8Jf2D';

function createMockDrive() {
  const folders = new Map();
  const files = new Map();

  // Root Target Folder
  folders.set(TARGET_FOLDER_ID, {
    id: TARGET_FOLDER_ID,
    name: 'Edo Language Studio',
    files: []
  });

  function makeBlob(bytes, mimeType, name) {
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || '', 'utf8');
    return {
      getBytes: () => buffer,
      getDataAsString: () => buffer.toString('utf8'),
      getContentType: () => mimeType || 'application/octet-stream',
      getName: () => name || 'blob'
    };
  }

  function createFile(blob, parentFolderId) {
    const fileId = 'file_' + Math.random().toString(36).substring(2, 10);
    const file = {
      id: fileId,
      name: blob.getName(),
      mimeType: blob.getContentType(),
      blob: blob,
      parentFolderId: parentFolderId || TARGET_FOLDER_ID,
      trashed: false,
      getId: () => fileId,
      isTrashed: () => file.trashed,
      getName: () => file.name,
      getSize: () => file.blob.getBytes().length,
      getBlob: () => file.blob,
      setContent: (text) => {
        file.blob = makeBlob(text, file.mimeType, file.name);
      },
      setTrashed: (t) => {
        file.trashed = Boolean(t);
      },
      getParents: () => {
        let done = false;
        return {
          hasNext: () => !done && !file.trashed,
          next: () => {
            done = true;
            return {
              getId: () => file.parentFolderId,
              getName: () => 'Edo Language Studio'
            };
          }
        };
      }
    };
    files.set(fileId, file);
    return file;
  }

  const driveApp = {
    getFolderById: (id) => {
      if (id !== TARGET_FOLDER_ID) throw new Error('Folder not found: ' + id);
      return {
        getId: () => TARGET_FOLDER_ID,
        getName: () => 'Edo Language Studio',
        createFile: (blob) => createFile(blob, TARGET_FOLDER_ID),
        getFilesByName: (fileName) => {
          const matching = Array.from(files.values()).filter(f => !f.trashed && f.parentFolderId === TARGET_FOLDER_ID && f.name === fileName);
          let idx = 0;
          return {
            hasNext: () => idx < matching.length,
            next: () => matching[idx++]
          };
        },
        getFiles: () => {
          const all = Array.from(files.values()).filter(f => !f.trashed && f.parentFolderId === TARGET_FOLDER_ID);
          let idx = 0;
          return {
            hasNext: () => idx < all.length,
            next: () => all[idx++]
          };
        }
      };
    },
    getFileById: (id) => {
      const file = files.get(id);
      if (!file || file.trashed) throw new Error('File not found: ' + id);
      return file;
    }
  };

  return { driveApp, files, makeBlob };
}

function runTests() {
  console.log('=== Running Automated Tests on gas/Code.gs ===\n');

  const { driveApp, files, makeBlob } = createMockDrive();

  // Mock CacheService with TTL map
  const cacheStore = new Map();
  const cacheService = {
    getScriptCache: () => ({
      get: (key) => cacheStore.get(key) || null,
      put: (key, val, ttl) => cacheStore.set(key, String(val)),
      remove: (key) => cacheStore.delete(key)
    })
  };

  // Mock PropertiesService
  const scriptPropertiesStore = new Map();
  const propertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => scriptPropertiesStore.get(k) || null,
      setProperty: (k, v) => scriptPropertiesStore.set(k, String(v)),
      deleteProperty: (k) => scriptPropertiesStore.delete(k)
    })
  };

  // Configure admin token and registered directory
  const adminToken = 'ADMIN-SUPER-SECRET-2026';
  const speakerToken = 'SPEAKER-SECRET-2026';
  scriptPropertiesStore.set('CONTRIBUTOR_DIRECTORY', JSON.stringify({
    [adminToken]: { id: 'admin-01', name: 'Project Lead', role: 'admin' },
    [speakerToken]: { id: 'speaker-01', name: 'Registered Speaker', role: 'speaker' }
  }));

  // Mock Utilities
  const utilities = {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (algorithm, text) => Array.from(require('node:crypto').createHash('sha256').update(text).digest()),
    base64Decode: (b64) => {
      if (!/^[A-Za-z0-9+/=]+$/.test(b64.trim())) {
        throw new Error('Invalid base64 string');
      }
      return Buffer.from(b64, 'base64');
    },
    base64Encode: (bytes) => {
      const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      return buf.toString('base64');
    },
    newBlob: (bytes, mime, name) => makeBlob(bytes, mime, name),
    getUuid: () => 'uuid-' + Math.random().toString(36).substring(2, 10)
  };

  // Mock LockService
  const lockService = {
    getScriptLock: () => ({
      hasLock: () => false,
      waitLock: () => true,
      releaseLock: () => true
    })
  };

  // Mock ContentService
  const contentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (content) => ({
      mimeType: null,
      setMimeType: function(m) { this.mimeType = m; return this; },
      getContent: () => content
    })
  };

  // Mock Logger
  const logs = [];
  const logger = {
    log: (msg) => {
      logs.push(msg);
      // console.log('  [GAS Logger]', msg);
    }
  };

  // Setup VM sandbox with Code.gs code
  const codeGsSource = fs.readFileSync(path.join(__dirname, '../gas/Code.gs'), 'utf8');
  const sandbox = {
    DriveApp: driveApp,
    PropertiesService: propertiesService,
    CacheService: cacheService,
    LockService: lockService,
    Utilities: utilities,
    ContentService: contentService,
    HtmlService: {
      createHtmlOutput: (html) => ({
        getContent: () => html,
        setTitle: function() { return this; }
      })
    },
    Logger: logger,
    console: console
  };

  vm.createContext(sandbox);
  vm.runInContext(codeGsSource, sandbox);

  // 1. Run the built-in 12-step self-test suite (runFullGatewaySelfTest)
  console.log('--- Step 1: Running in-script self-test suite (runFullGatewaySelfTest) ---');
  sandbox.runFullGatewaySelfTest();
  assert(logs.some(l => l.includes('ALL TESTS PASSED SUCCESSFULLY')), 'In-script self-test failed');
  console.log('✓ All 12 in-script gateway verification tests passed successfully.\n');

  // 2. Token-Free Automatic Upload Tests (Community Contributor)
  console.log('--- Step 2: Testing Token-Free Automatic Upload (Community Mode) ---');
  const dummyWav = Buffer.from('RIFF....WAVEfmt ....data....');
  const dummyWavB64 = dummyWav.toString('base64');

  const communityPayload = {
    action: 'upload_recording',
    authToken: '', // No token provided!
    lessonId: 'word-water',
    recordingId: 'rec-water-001',
    english: 'Water',
    edoText: 'Ame',
    audioBase64: dummyWavB64,
    mimeType: 'audio/wav',
    durationSec: 2,
    permissions: { playback: 'granted', aiVoiceTraining: 'denied' }
  };

  const uploadRes = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify(communityPayload) }
  }).getContent());

  assert.equal(uploadRes.status, 'success', 'Token-free upload must succeed');
  assert.equal(uploadRes.duplicate, false);
  assert.equal(uploadRes.recordingStatus, 'spelling_submitted');
  assert(uploadRes.audioFileId, 'Audio file ID must be returned');
  assert(uploadRes.metadataFileId, 'Metadata file ID must be returned');
  console.log('✓ Token-free voice recording upload with spelling succeeded.');

  // Verify companion metadata stored in Drive
  const metaFile = driveApp.getFileById(uploadRes.metadataFileId);
  const metadata = JSON.parse(metaFile.getBlob().getDataAsString());
  assert.equal(metadata.englishWord, 'Water');
  assert.equal(metadata.edoSpelling, 'Ame');
  assert.equal(metadata.audioFileId, uploadRes.audioFileId);
  assert.equal(metadata.permissions.playback, 'granted');
  assert.equal(metadata.permissions.aiVoiceTraining, 'denied', 'AI training must strictly be denied');
  assert.equal(metadata.voiceContributor.role, 'community_contributor');
  console.log('✓ Companion metadata correctly structured with community_contributor attribution and explicit AI training consent denial.');

  // 3. Duplicate Idempotency Check for Community Uploads
  console.log('--- Step 3: Testing Idempotency & Duplicate Prevention ---');
  const duplicateRes = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify(communityPayload) }
  }).getContent());
  assert.equal(duplicateRes.status, 'success');
  assert.equal(duplicateRes.duplicate, true, 'Submitting identical recording must be flagged duplicate');
  assert.equal(duplicateRes.audioFileId, uploadRes.audioFileId, 'Must return existing audio ID without re-creating');
  console.log('✓ Duplicate upload handled idempotently without file duplication.');

  // 4. Token-Free Voice Upload Needing Spelling (Person A alone)
  console.log('--- Step 4: Testing Person A Upload Needing Spelling ---');
  const needsSpellingPayload = {
    action: 'upload_recording',
    authToken: '',
    lessonId: 'word-food',
    recordingId: 'rec-food-001',
    english: 'Food',
    edoText: '', // Empty spelling
    audioBase64: dummyWavB64,
    mimeType: 'audio/wav',
    durationSec: 1.5,
    permissions: { playback: 'granted', aiVoiceTraining: 'denied' }
  };
  const needsSpellingRes = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify(needsSpellingPayload) }
  }).getContent());
  assert.equal(needsSpellingRes.status, 'success');
  assert.equal(needsSpellingRes.recordingStatus, 'needs_spelling');
  console.log('✓ Recording with blank spelling set to "needs_spelling".');

  // 5. Shared Queue Retrieval (Person B)
  console.log('--- Step 5: Testing Person B Queue Retrieval ---');
  const queueRes = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify({ action: 'get_needs_spelling' }) }
  }).getContent());
  assert.equal(queueRes.status, 'success');
  assert(queueRes.items.some(i => i.recordingId === 'rec-food-001'), 'Food recording must appear in queue');
  console.log(`✓ Person B queue retrieved ${queueRes.count} pending item(s).`);

  // 6. Community Audio Playback Stream (Person B listens)
  console.log('--- Step 6: Testing Audio Playback Streaming ---');
  const streamRes = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify({ action: 'stream_audio', fileId: needsSpellingRes.audioFileId }) }
  }).getContent());
  assert.equal(streamRes.status, 'success');
  assert(streamRes.audioDataUrl.startsWith('data:audio/wav;base64,'), 'Data URL returned for playback');
  console.log('✓ Audio playback stream verified for Person B.');

  // 7. Community Spelling Submission (Person B writes Edo text)
  console.log('--- Step 7: Testing Person B Spelling Submission ---');
  const submitSpellingRes = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify({
      action: 'submit_spelling',
      metadataFileId: needsSpellingRes.metadataFileId,
      edoSpelling: 'Evbare'
    }) }
  }).getContent());
  assert.equal(submitSpellingRes.status, 'spelling_submitted');
  assert.equal(submitSpellingRes.edoSpelling, 'Evbare');

  // Verify updated metadata
  const updatedMeta = JSON.parse(driveApp.getFileById(needsSpellingRes.metadataFileId).getBlob().getDataAsString());
  assert.equal(updatedMeta.edoSpelling, 'Evbare');
  assert.equal(updatedMeta.status, 'spelling_submitted');
  assert(updatedMeta.spellingContributor, 'Spelling contributor stamped');
  console.log('✓ Person B spelling submission succeeded and updated status to "spelling_submitted".');

  // 8. Concurrency Protection (Prevent double submission)
  console.log('--- Step 8: Testing Concurrency Protection ---');
  const conflictRes = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify({
      action: 'submit_spelling',
      metadataFileId: needsSpellingRes.metadataFileId,
      edoSpelling: 'Evbare Duplicate'
    }) }
  }).getContent());
  assert.equal(conflictRes.code, 'SPELLING_ALREADY_SUBMITTED');
  console.log('✓ Second spelling submission safely rejected with SPELLING_ALREADY_SUBMITTED.');

  const libraryRequest = () => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify({ action: 'get_library' }) } }).getContent());
  const shared = libraryRequest();
  assert.equal(shared.status, 'success');
  assert.equal(shared.items.length, 2);
  assert(shared.items.some(entry => entry.recordingId === 'rec-food-001' && entry.edoText === 'Evbare'));
  assert(shared.answeredQuestionIds.includes('word-water'));
  assert(shared.items.every(entry => !('ownerKeyHash' in entry) && !('authToken' in entry) && !('voiceContributor' in entry)));
  const ownerKey = 'a'.repeat(64);
  const ownedPayload = { ...communityPayload, lessonId: 'custom-owner-test', recordingId: 'rec-owned-test', ownerKey };
  const owned = JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify(ownedPayload) } }).getContent());
  const changePermissions = key => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify({ action: 'update_recording_permissions', metadataFileId: owned.metadataFileId, ownerKey: key, permissions: { playback: 'denied', aiVoiceTraining: 'denied' } }) } }).getContent());
  assert.equal(changePermissions('b'.repeat(64)).code, 'OWNER_REQUIRED');
  assert.equal(changePermissions(ownerKey).status, 'success');
  assert.equal(libraryRequest().items.find(entry => entry.recordingId === 'rec-owned-test').playbackPermission, 'denied');
  driveApp.getFileById(owned.audioFileId).setTrashed(true);
  driveApp.getFileById(owned.metadataFileId).setTrashed(true);
  const repeatedSpelling = JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify({ action: 'submit_spelling', metadataFileId: needsSpellingRes.metadataFileId, edoSpelling: 'Evbare' }) } }).getContent());
  assert.equal(repeatedSpelling.status, 'success', 'Offline spelling retry must be idempotent');

  // Live collection totals must fall when files are deleted outside the app.
  const readStats = () => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify({ action: 'get_collection_stats' }) } }).getContent());
  const beforeDelete = readStats();
  assert.equal(beforeDelete.status, 'success');
  assert.equal(beforeDelete.stats.voiceRecordings, 2);
  assert.equal(beforeDelete.stats.wordsCollected, 2);
  const audioFile = driveApp.getFileById(uploadRes.audioFileId);
  audioFile.setTrashed(true);
  const afterDelete = readStats();
  assert.equal(afterDelete.stats.voiceRecordings, 1, 'An orphaned metadata file must not count as a recording');
  assert.equal(afterDelete.stats.wordsCollected, 1);
  assert.equal(afterDelete.stats.fileCount, beforeDelete.stats.fileCount - 1);
  driveApp.getFileById(needsSpellingRes.metadataFileId).setTrashed(true);
  assert.equal(readStats().stats.totalContributions, 0, 'Missing metadata must not count');
  for (const file of files.values()) file.setTrashed(true);
  const ledgerAfterDelete = libraryRequest();
  assert.equal(ledgerAfterDelete.items.length, 0);
  assert(!ledgerAfterDelete.answeredQuestionIds.includes('word-water'), 'Deleting audio must reopen curriculum question for new recording in Teach Edo');
  const emptyStats = readStats().stats;
  for (const key of Object.keys(emptyStats)) assert.equal(emptyStats[key], 0, `An emptied Drive must reset ${key}`);
  const folder = driveApp.getFolderById(TARGET_FOLDER_ID);
  folder.createFile(makeBlob('report', 'application/json', 'live-token-free-sync.json'));
  folder.createFile(makeBlob('{broken', 'application/json', 'broken_meta.json'));
  const ignoredStats = readStats().stats;
  assert.equal(ignoredStats.fileCount, 2, 'Report and corrupt files still count as files');
  assert.equal(ignoredStats.totalContributions, 0, 'Report and corrupt files are not learning contributions');
  console.log('✓ Live folder totals reflect audio/metadata deletion and an empty fresh start.');

  // 9. Community Rate Limit Protection
  console.log('--- Step 9: Testing Rate Limit Enforcement ---');
  // Fill window quota
  const currentWindow = Math.floor(Date.now() / (600 * 1000));
  cacheStore.set('rate_community_uploads_' + currentWindow, '30'); // Quota reached

  const rateLimitedRes = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify({
      action: 'upload_recording',
      authToken: '',
      lessonId: 'word-spam',
      recordingId: 'rec-spam-001',
      english: 'Spam',
      audioBase64: dummyWavB64,
      mimeType: 'audio/wav'
    }) }
  }).getContent());
  assert.equal(rateLimitedRes.code, 'RATE_LIMIT_EXCEEDED');
  console.log('✓ Abuse protection triggered: 31st upload rejected with RATE_LIMIT_EXCEEDED.');

  // 10. Privileged/Registered token bypasses community rate limit
  console.log('--- Step 10: Testing Registered Token Rate Limit Immunity ---');
  const registeredRes = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify({
      action: 'upload_recording',
      authToken: speakerToken, // Registered speaker token
      lessonId: 'word-privileged',
      recordingId: 'rec-priv-001',
      english: 'Privileged',
      audioBase64: dummyWavB64,
      mimeType: 'audio/wav'
    }) }
  }).getContent());
  assert.equal(registeredRes.status, 'success', 'Registered token is not blocked by community rate limit');
  console.log('✓ Registered speaker token successfully bypasses community rate limiter.');

  // 11. Administrator Approval & Locking System
  console.log('--- Step 11: Testing Administrator Approval & Locking System ---');
  // Reset rate limit key so community test can upload
  cacheStore.delete('rate_community_uploads_' + currentWindow);
  const uploadForLock = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify({
      action: 'upload_recording',
      authToken: '',
      lessonId: 'word-locktest',
      recordingId: 'rec-lock-001',
      english: 'Lock Test',
      edoText: 'Igho',
      audioBase64: dummyWavB64,
      mimeType: 'audio/wav'
    }) }
  }).getContent());
  assert.equal(uploadForLock.status, 'success');
  const targetMetaFileId = uploadForLock.metadataFileId;

  // Non-admin attempting to lock must be rejected
  const nonAdminLock = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify({
      action: 'admin_lock_entry',
      authToken: speakerToken, // speaker, not admin
      metadataFileId: targetMetaFileId
    }) }
  }).getContent());
  assert.equal(nonAdminLock.code, 'UNAUTHORIZED_ADMIN');

  // Admin locking the entry succeeds
  const adminLock = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify({
      action: 'admin_lock_entry',
      authToken: adminToken, // verified admin
      metadataFileId: targetMetaFileId
    }) }
  }).getContent());
  assert.equal(adminLock.status, 'success');
  assert.equal(adminLock.reviewStatus, 'approved_locked');
  assert.equal(adminLock.approvedBy.name, 'Project Lead');
  console.log('✓ Admin successfully locked and approved entry (status: approved_locked).');

  // Verify that subsequent community attempt to modify or overwrite locked entry is rejected with ENTRY_LOCKED
  const lockedUploadAttempt = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify({
      action: 'upload_recording',
      authToken: '',
      lessonId: 'word-locktest',
      recordingId: 'rec-lock-001',
      english: 'Lock Test Tampered',
      audioBase64: dummyWavB64,
      mimeType: 'audio/wav'
    }) }
  }).getContent());
  assert.equal(lockedUploadAttempt.code, 'ENTRY_LOCKED');
  console.log('✓ Modification of locked entry correctly blocked with ENTRY_LOCKED.');

  // Admin unlocking the entry succeeds
  const adminUnlock = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify({
      action: 'admin_unlock_entry',
      authToken: adminToken,
      metadataFileId: targetMetaFileId
    }) }
  }).getContent());
  assert.equal(adminUnlock.status, 'success');
  assert.equal(adminUnlock.reviewStatus, 'pending_approval');
  console.log('✓ Admin successfully unlocked entry.');

  // 12. Auto-Lock After 5 Distinct Verified Listens & Anonymous Deduplication
  console.log('--- Step 12: Testing 5-Listener Auto-Lock & Listener Deduplication ---');
  const autoLockUpload = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify({
      action: 'upload_recording',
      authToken: '',
      lessonId: 'word-autolock-01',
      recordingId: 'rec-autolock-01',
      english: 'Auto Lock Test',
      edoSpelling: 'Ebe',
      audioBase64: dummyWavB64,
      mimeType: 'audio/wav'
    }) }
  }).getContent());
  assert.equal(autoLockUpload.status, 'success');
  const autoLockMetaId = autoLockUpload.metadataFileId;

  // Listener 1 plays twice
  const play1 = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify({
      action: 'record_playback',
      metadataFileId: autoLockMetaId,
      listenerToken: 'listener-token-uuid-1111'
    }) }
  }).getContent());
  assert.equal(play1.status, 'success');
  assert.equal(play1.playCount, 1);
  assert.equal(play1.distinctListenersCount, 1);
  assert.equal(play1.autoLocked, false);

  const play1Repeat = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify({
      action: 'record_playback',
      metadataFileId: autoLockMetaId,
      listenerToken: 'listener-token-uuid-1111'
    }) }
  }).getContent());
  assert.equal(play1Repeat.playCount, 2);
  assert.equal(play1Repeat.distinctListenersCount, 1, 'Duplicate listens from same token must not increment distinct count');
  assert.equal(play1Repeat.autoLocked, false);

  // Listeners 2, 3, 4 play
  for (let i = 2; i <= 4; i++) {
    const playN = JSON.parse(sandbox.doPost({
      postData: { contents: JSON.stringify({
        action: 'record_playback',
        metadataFileId: autoLockMetaId,
        listenerToken: `listener-token-uuid-${i}${i}${i}${i}`
      }) }
    }).getContent());
    assert.equal(playN.distinctListenersCount, i);
    assert.equal(playN.autoLocked, false);
  }

  // Listener 5 plays -> triggers automatic lock!
  const play5 = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify({
      action: 'record_playback',
      metadataFileId: autoLockMetaId,
      listenerToken: 'listener-token-uuid-5555'
    }) }
  }).getContent());
  assert.equal(play5.distinctListenersCount, 5);
  assert.equal(play5.autoLocked, true, 'Reaching 5 verified distinct listeners must auto-lock');
  assert.equal(play5.reviewStatus, 'approved_locked');
  console.log('✓ 5 distinct listeners verified: entry automatically locked to approved_locked.');

  // 13. Admin Authoritative Deletion, Tombstone Broadcasting & Curriculum Reopening
  console.log('--- Step 13: Testing Admin Authoritative Deletion & Tombstones ---');
  // Unauthorized deletion attempt with non-admin speaker token
  const unauthDel = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify({
      action: 'admin_delete_entry',
      authToken: speakerToken,
      metadataFileId: autoLockMetaId
    }) }
  }).getContent());
  assert.equal(unauthDel.code, 'UNAUTHORIZED_ADMIN');

  // Authorized admin deletion
  const authDel = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify({
      action: 'admin_delete_entry',
      authToken: adminToken,
      metadataFileId: autoLockMetaId
    }) }
  }).getContent());
  assert.equal(authDel.status, 'success');
  assert.equal(authDel.tombstoneRecorded, true);

  // Library request confirms deletion and tombstone presence
  const libAfterDel = JSON.parse(sandbox.doPost({
    postData: { contents: JSON.stringify({ action: 'get_library' }) }
  }).getContent());
  assert(!libAfterDel.items.some(it => it.recordingId === 'rec-autolock-01'), 'Deleted item must be removed from cloud library');
  assert(libAfterDel.tombstones.includes('rec-autolock-01'), 'Tombstone must be broadcast to client devices');
  assert(!libAfterDel.answeredQuestionIds.includes('word-autolock-01'), 'Curriculum question must reopen for Teach Edo');
  console.log('✓ Admin authoritative deletion, tombstones, and prompt reopening verified.');

  // Test doGet health check (tokens are never accepted in GET URLs)
  const healthGet = JSON.parse(sandbox.doGet({}).getContent());
  assert.equal(healthGet.status, 'ok');
  assert.equal(healthGet.folderConnected, true);
  console.log('✓ Health check GET verified (tokens strictly confined to secure POST bodies).');

  console.log('\n=== ALL AUTOMATED TESTS ON gas/Code.gs PASSED! ===');
}

runTests();
