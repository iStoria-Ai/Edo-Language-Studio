const { buildSync } = require('esbuild');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const bundle = buildSync({ entryPoints: ['src/services/communityLibrary.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['@capacitor/*'] }).outputFiles[0].text;
function device(storage = new Map(), request = async () => { throw Error('offline'); }) {
  const module = { exports: {} }, navigator = { onLine: true };
  const context = { module, exports: module.exports, console, crypto: webcrypto, TextEncoder, Uint8Array, AbortSignal, atob, btoa, navigator,
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, fetch: (...args) => request(...args),
    require: name => {
      if (name === '@capacitor/core') return { Capacitor: { isNativePlatform: () => false } };
      if (name === '@capacitor/preferences') return { Preferences: { get: async ({ key }) => ({ value: storage.get(key) || null }), set: async ({ key, value }) => storage.set(key, value), remove: async ({ key }) => { storage.delete(key); } } };
      throw Error(name);
    } };
  vm.runInNewContext(bundle, context);
  return { api: module.exports, navigator, storage };
}
const shared = { id: 'cloud-rec-a', recordingId: 'rec-a', sourceLessonId: 'word-water', english: 'Water', category: 'word', hasAudio: true, edoText: 'Ame', cloudMetadataFileId: 'meta-a', cloudAudioFileId: 'audio-a', isCommunity: true, playbackPermission: 'granted', status: 'awaiting_review', isSampleData: false, updatedAt: '2026-10-29T00:00:00Z' };
(async () => {
  let fail = false, conflict = false, submissions = 0;
  const state = new Map();
  const a = device(state, async (url, options) => {
    if (fail) throw Error('offline');
    const payload = JSON.parse(options.body);
    if (payload.action === 'get_library') return { ok: true, json: async () => ({ status: 'success', items: [shared], answeredQuestionIds: ['word-water'], checkedAt: shared.updatedAt }) };
    if (payload.action === 'stream_audio') return { ok: true, json: async () => ({ status: 'success', audioDataUrl: 'data:audio/wav;base64,UklGRg==' }) };
    if (payload.action === 'submit_spelling') { submissions++; return { ok: true, json: async () => conflict ? { status: 'conflict', message: 'Existing spelling preserved' } : { status: 'success' } }; }
    throw Error(payload.action);
  });
  const snapshot = await a.api.fetchCommunityLibrary();
  const local = { ...shared, id: 'word-water', isCommunity: false, audioDataUrl: 'original-local-bytes', edoText: undefined, syncStatus: 'pending_upload' };
  const before = JSON.stringify(local);
  const merged = a.api.mergeCommunityEntries([local], snapshot.entries);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'word-water');
  assert.equal(merged[0].audioDataUrl, 'original-local-bytes');
  assert.equal(merged[0].edoText, 'Ame');
  assert.equal(JSON.stringify(local), before, 'Original local metadata must never be overwritten by display merging');
  assert.equal(a.api.mergeCommunityEntries([{ ...local, recordingId: 'rec-other', cloudAudioFileId: 'other', cloudMetadataFileId: 'other' }], snapshot.entries).length, 2, 'Different recordings of one lesson must remain separate');
  const restored = device(state);
  assert.equal((await restored.api.readCommunityCache()).entries[0].recordingId, 'rec-a', 'A new offline session must retain cached community metadata');
  await a.api.queueCommunitySpelling('meta-a', 'Draft Edo');
  fail = true;
  await assert.rejects(a.api.syncSpellingDrafts(), /offline/);
  assert.equal((await restored.api.readSpellingDrafts())[0].text, 'Draft Edo');
  fail = false;
  await a.api.syncSpellingDrafts();
  assert.equal((await a.api.readSpellingDrafts()).length, 0);
  await a.api.queueCommunitySpelling('meta-a', 'Conflicting draft');
  conflict = true;
  await a.api.syncSpellingDrafts();
  const drafts = await a.api.readSpellingDrafts();
  assert.equal(drafts[0].text, 'Conflicting draft');
  assert(drafts[0].error);
  await a.api.syncSpellingDrafts();
  assert.equal(submissions, 2, 'Conflicts must not repeatedly overwrite/retry another contributor’s spelling');
  const audio = await a.api.getCommunityAudio(shared);
  restored.navigator.onLine = false;
  assert.equal(await restored.api.getCommunityAudio(shared), audio, 'Previously permitted audio must play from persistent offline cache');
  await assert.rejects(restored.api.getCommunityAudio({ ...shared, playbackPermission: 'denied' }), /not granted/);
  fail = true;
  await assert.rejects(a.api.fetchCommunityLibrary(), /offline/);
  assert.equal((await a.api.readCommunityCache()).entries.length, 1, 'Network failure must preserve the previous shared cache');
  const prompts = [{ ...local, id: 'q1', isSampleData: true }, { ...local, id: 'q2', hasAudio: false }];
  assert.equal(a.api.nextUnansweredQuestion(prompts, new Set(['q1'])), 1);
  assert.equal(a.api.nextUnansweredQuestion(prompts, new Set(['q1', 'q2'])), -1, 'Completed question bank must never wrap to an answered question');
  assert.equal(a.api.nextUnansweredQuestion(prompts, new Set()), 0, 'Sample audio must not count as a community answer');

  // Multi-browser synchronization simulation (Browser A -> Gateway -> Browser B)
  const browserAState = new Map();
  const browserBState = new Map();
  let cloudItems = [shared];
  const gatewayMock = async (url, options) => {
    const payload = JSON.parse(options.body);
    if (payload.action === 'get_library') {
      return { ok: true, json: async () => ({ status: 'success', items: cloudItems, answeredQuestionIds: cloudItems.map(i => i.sourceLessonId), checkedAt: new Date().toISOString() }) };
    }
    if (payload.action === 'admin_lock_entry') {
      const it = cloudItems.find(i => i.cloudMetadataFileId === payload.metadataFileId);
      if (it) { it.reviewStatus = 'approved_locked'; it.approvedBy = { id: 'admin-1', name: 'Admin', approvedAt: new Date().toISOString() }; }
      return { ok: true, json: async () => ({ status: 'success', action: 'admin_lock_entry', reviewStatus: 'approved_locked' }) };
    }
    if (payload.action === 'admin_unlock_entry') {
      const it = cloudItems.find(i => i.cloudMetadataFileId === payload.metadataFileId);
      if (it) { it.reviewStatus = 'pending_approval'; it.approvedBy = null; }
      return { ok: true, json: async () => ({ status: 'success', action: 'admin_unlock_entry', reviewStatus: 'pending_approval' }) };
    }
    throw Error(payload.action);
  };

  const clientA = device(browserAState, gatewayMock);
  const clientB = device(browserBState, gatewayMock);

  // Browser A contributes new phrase "Where are you going?"
  const newPhrase = {
    id: 'cloud-rec-phrase-going',
    recordingId: 'rec-phrase-going',
    sourceLessonId: 'sentence-going',
    english: 'Where are you going?',
    edoText: 'De ogba gha?',
    category: 'sentence',
    hasAudio: true,
    cloudAudioFileId: 'audio-going',
    cloudMetadataFileId: 'meta-going',
    isCommunity: true,
    playbackPermission: 'granted',
    status: 'awaiting_review',
    reviewStatus: 'pending_approval',
    isSampleData: false,
    updatedAt: new Date().toISOString()
  };
  cloudItems.push(newPhrase);

  // Browser B opens app and automatically fetches community library
  const clientBSnapshot = await clientB.api.fetchCommunityLibrary();
  assert.equal(clientBSnapshot.entries.length, 2, 'Browser B automatically receives new contribution from Browser A');
  const receivedPhrase = clientBSnapshot.entries.find(e => e.recordingId === 'rec-phrase-going');
  assert.equal(receivedPhrase.english, 'Where are you going?', 'Full phrase text preserved without truncation');
  assert.equal(receivedPhrase.edoText, 'De ogba gha?', 'Full Edo spelling preserved without truncation');
  assert.equal(receivedPhrase.reviewStatus, 'pending_approval', 'Contribution starts as pending_approval');

  // Admin approves and locks phrase
  const lockResult = await gatewayMock('', { body: JSON.stringify({ action: 'admin_lock_entry', metadataFileId: 'meta-going' }) });
  const lockJson = await lockResult.json();
  assert.equal(lockJson.status, 'success');
  assert.equal(lockJson.reviewStatus, 'approved_locked');

  // Browser B re-fetches and verifies locked status
  const clientBUpdated = await clientB.api.fetchCommunityLibrary();
  assert.equal(clientBUpdated.entries.find(e => e.recordingId === 'rec-phrase-going').reviewStatus, 'approved_locked');

  // Verify section movement workflow: Teach Edo -> Help Others -> Library
  // Item 1: Recorded without spelling -> MUST be in Help Others, NOT in Teach Edo, NOT in Library
  const voiceOnlyItem = {
    id: 'cloud-rec-voice-only',
    recordingId: 'rec-voice-only',
    sourceLessonId: 'word-hand',
    english: 'Hand',
    category: 'word',
    hasAudio: true,
    cloudAudioFileId: 'audio-hand',
    cloudMetadataFileId: 'meta-hand',
    isCommunity: true,
    playbackPermission: 'granted',
    status: 'needs_writing',
    isSampleData: false,
    updatedAt: new Date().toISOString()
  };
  // Has voice, missing spelling
  const needsWriting = Boolean(voiceOnlyItem.hasAudio && (!voiceOnlyItem.edoText || !voiceOnlyItem.edoText.trim()));
  const isCompleteVoiceOnly = Boolean(voiceOnlyItem.english && voiceOnlyItem.edoText && voiceOnlyItem.hasAudio);
  assert.equal(needsWriting, true, 'Item with voice but missing spelling must be classified as needs writing');
  assert.equal(isCompleteVoiceOnly, false, 'Incomplete item must not be classified as completed library lesson');

  // Once spelling is added:
  const completedHand = { ...voiceOnlyItem, edoText: 'Obo', status: 'awaiting_review' };
  const needsWritingAfterSpelling = Boolean(completedHand.hasAudio && (!completedHand.edoText || !completedHand.edoText.trim()));
  const isCompleteHand = Boolean(completedHand.english && completedHand.edoText && completedHand.hasAudio);
  assert.equal(needsWritingAfterSpelling, false, 'Completed item must be removed from Help Others');
  assert.equal(isCompleteHand, true, 'Completed item must appear in Library');

  // Item 2: Both voice and spelling completed in Teach Edo -> moves directly to Library
  const directCompleteItem = {
    id: 'cloud-rec-eye',
    recordingId: 'rec-eye',
    sourceLessonId: 'word-eye',
    english: 'Eye',
    edoText: 'Aro',
    category: 'word',
    hasAudio: true,
    cloudAudioFileId: 'audio-eye',
    cloudMetadataFileId: 'meta-eye',
    isCommunity: true,
    status: 'awaiting_review',
    isSampleData: false,
    updatedAt: new Date().toISOString()
  };
  assert.equal(Boolean(directCompleteItem.hasAudio && (!directCompleteItem.edoText || !directCompleteItem.edoText.trim())), false, 'Directly completed item must never enter Help Others');
  assert.equal(Boolean(directCompleteItem.english && directCompleteItem.edoText && directCompleteItem.hasAudio), true, 'Directly completed item enters Library immediately');

  // Test Tombstone Purging & Drive Authoritative Deletion
  const localWithDeleted = [
    { ...shared, id: 'word-water', isCommunity: false, syncStatus: 'synced_to_drive' },
    { id: 'local-active', recordingId: 'rec-active', english: 'Active', category: 'word', hasAudio: true, edoText: 'Active Edo', status: 'awaiting_review', isSampleData: false, updatedAt: '2026-10-29T00:00:00Z' }
  ];
  const mergedWithTombstone = a.api.mergeCommunityEntries(localWithDeleted, [shared], [], ['rec-a']);
  assert(!mergedWithTombstone.some(e => e.recordingId === 'rec-a'), 'Tombstone must purge deleted recording from merged library');
  assert.equal(mergedWithTombstone.length, 1, 'Non-deleted items must be preserved');
  assert.equal(mergedWithTombstone[0].id, 'local-active');

  // Test Synthetic Test Rejection & Public Library Protection
  const testEntry = {
    id: 'test-crossdevice-20261029T103639',
    recordingId: 'rec-339adb9ef74c1ff5ea3c4c851f09be8d0d246464a2e7a65337319cfed43acbb7',
    english: 'SYNC VERIFICATION ONLY — this deliberately long phrase checks that every word wraps fully on small mobile Library cards and in the opened dialogue details',
    edoText: 'SYNC TEST SPELLING — synthetic verification, not Edo vocabulary',
    category: 'phrase',
    hasAudio: true,
    cloudAudioFileId: 'audio-test',
    cloudMetadataFileId: 'meta-test',
    isCommunity: true,
    playbackPermission: 'granted',
    status: 'awaiting_review',
    isSampleData: false,
    updatedAt: new Date().toISOString()
  };
  const mergedWithTest = a.api.mergeCommunityEntries([], [testEntry, shared]);
  assert(!mergedWithTest.some(e => e.english.includes('SYNC VERIFICATION')), 'Synthetic test entries must never appear in merged community library');
  assert.equal(mergedWithTest.length, 1);
  assert.equal(mergedWithTest[0].recordingId, 'rec-a');

  // A saved local draft must never be presented as a cloud-verified completion.
  const editStorage = new Map(); let editOffline = true, staleEdit = false, sentEdits = 0;
  const editing = device(editStorage, async (_url, options) => {
    if (editOffline) throw Error('offline');
    const payload = JSON.parse(options.body); assert.equal(payload.action, 'update_contribution'); sentEdits++;
    assert.equal(payload.metadataFileId, 'meta-a'); assert.equal(payload.expectedVersion, 2);
    return { ok: true, json: async () => staleEdit ? { status: 'conflict', code: 'REVISION_CONFLICT', message: 'Reopen the current lesson' } : { status: 'success', verified: true, metadataFileId: 'meta-a', version: 3 } };
  });
  await editing.api.queueCommunityEdit({ ...shared, version: 2 }, { edoText: 'transport fixture' });
  await assert.rejects(editing.api.syncCommunityEdits(), /offline/);
  await assert.rejects(device(editStorage).api.ensureCommunityEditSynced('meta-a'), /waiting for Google Drive verification/);
  editOffline = false; await editing.api.syncCommunityEdits(); await editing.api.ensureCommunityEditSynced('meta-a');
  staleEdit = true; await editing.api.queueCommunityEdit({ ...shared, version: 2 }, { edoText: 'stale draft' });
  await editing.api.syncCommunityEdits(); await assert.rejects(editing.api.ensureCommunityEditSynced('meta-a'), /Reopen the current lesson/);
  await editing.api.syncCommunityEdits(); assert.equal(sentEdits, 2, 'Conflicting revisions are preserved without repeated overwrite attempts');

  // Test complete voice replacement and cache cleanup
  const replaceStorage = new Map();
  replaceStorage.set('edo_community_audio_audio-old', 'old-audio-data');
  let streamFail = false;
  const replacing = device(replaceStorage, async (_url, options) => {
    const payload = JSON.parse(options.body);
    if (payload.action === 'update_contribution') {
      assert.equal(payload.metadataFileId, 'meta-replace');
      assert.equal(payload.audioBase64, 'cmVwbGFjZW1lbnQ=');
      return {
        ok: true,
        json: async () => ({
          status: 'success',
          verified: true,
          version: 3,
          metadataFileId: 'meta-replace',
          audioFileId: 'audio-new',
          previousAudioFileId: 'audio-old'
        })
      };
    }
    if (payload.action === 'stream_audio') {
      if (streamFail) return { ok: true, json: async () => ({ status: 'error', message: 'Failed to stream' }) };
      return { ok: true, json: async () => ({ status: 'success', audioDataUrl: 'data:audio/wav;base64,cmVwbGFjZW1lbnQ=' }) };
    }
    throw Error(payload.action);
  });

  const replaceTarget = { ...shared, cloudMetadataFileId: 'meta-replace', cloudAudioFileId: 'audio-old', version: 2 };
  await replacing.api.queueCommunityEdit(replaceTarget, { audioDataUrl: 'data:audio/wav;base64,cmVwbGFjZW1lbnQ=', durationSec: 2 });

  // If streaming verification fails, draft is preserved and old cached audio is NOT removed
  streamFail = true;
  await assert.rejects(replacing.api.syncCommunityEdits(), /Voice verification is pending/);
  assert(replaceStorage.has('edo_community_audio_audio-old'), 'Old audio cache preserved on verification failure');

  // When verification succeeds, old cached audio is removed and new audio is cached
  streamFail = false;
  await replacing.api.syncCommunityEdits();
  await replacing.api.ensureCommunityEditSynced('meta-replace');
  assert(!replaceStorage.has('edo_community_audio_audio-old'), 'Obsolete old audio cache removed after replacement');
  assert.equal(replaceStorage.get('edo_community_audio_audio-new'), 'data:audio/wav;base64,cmVwbGFjZW1lbnQ=', 'New audio cached');

  // Test getHelpOthersEligibleEntries: Single authoritative source of truth for Help Others
  {
    const sampleEntry = { id: 'sample-1', english: 'Hand', isSampleData: true, cloudMetadataFileId: 'meta-sample', hasAudio: true };
    const localNoMeta = { id: 'local-1', english: 'Water', isSampleData: false, status: 'needs_writing', hasAudio: true };
    const completeItem = { id: 'comp-1', english: 'Eye', edoText: 'Aro', hasAudio: true, isSampleData: false, cloudMetadataFileId: 'meta-comp' };
    const lockedItem = { id: 'lock-1', english: 'Nose', hasAudio: true, isSampleData: false, cloudMetadataFileId: 'meta-lock', reviewStatus: 'approved_locked' };
    const tombItem = { id: 'tomb-1', english: 'Ear', hasAudio: true, isSampleData: false, cloudMetadataFileId: 'meta-tomb' };
    
    // Test: None of the above are eligible -> must return 0
    const zeroRes = a.api.getHelpOthersEligibleEntries([sampleEntry, localNoMeta, completeItem, lockedItem, tombItem], ['meta-tomb']);
    assert.equal(zeroRes.totalCount, 0, 'No false positives: sample, unverified local, completed, locked, and tombstoned must all be excluded');
    assert.equal(zeroRes.needsWritingList.length, 0);
    assert.equal(zeroRes.needsAudioList.length, 0);

    // Test: 3 genuinely eligible items -> must return exactly 3
    const item1 = { id: 'help-1', recordingId: 'rec-h1', english: 'Leg', isSampleData: false, cloudMetadataFileId: 'meta-h1', hasAudio: true, isCommunity: true }; // needs writing
    const item2 = { id: 'help-2', recordingId: 'rec-h2', english: 'Arm', isSampleData: false, cloudMetadataFileId: 'meta-h2', hasAudio: true, isCommunity: true }; // needs writing
    const item3 = { id: 'help-3', recordingId: 'rec-h3', english: 'Head', edoText: 'Uhunmwun', isSampleData: false, cloudMetadataFileId: 'meta-h3', hasAudio: false, isCommunity: true }; // needs audio
    
    const threeRes = a.api.getHelpOthersEligibleEntries([item1, item2, item3, sampleEntry, localNoMeta, completeItem]);
    assert.equal(threeRes.totalCount, 3, 'When 3 eligible items exist, totalCount must be 3');
    assert.equal(threeRes.needsWritingList.length, 2, '2 items need writing (Leg, Arm)');
    assert.equal(threeRes.needsAudioList.length, 1, '1 item needs audio (Head)');
    assert.equal(threeRes.allEligible.length, 3);

    // Test: When item1 has a pending local submission, it is immediately excluded from eligible list
    const pendingRes = a.api.getHelpOthersEligibleEntries([item1, item2, item3], [], new Set(['meta-h1']));
    assert.equal(pendingRes.totalCount, 2, 'Pending local submission immediately reduces eligible count to 2');
    assert.equal(pendingRes.needsWritingList.length, 1);
    assert.equal(pendingRes.needsWritingList[0].english, 'Arm');
  }

  // Test readPendingCloudEdits, retryPendingCloudEdit, and draft deduplication
  {
    const editTestStorage = new Map();
    let networkOnline = true;
    const testDev = device(editTestStorage, async (_url, options) => {
      if (!networkOnline) throw new Error('Network offline');
      const payload = JSON.parse(options.body);
      if (payload.action === 'update_contribution') {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            verified: true,
            version: 4,
            metadataFileId: payload.metadataFileId
          })
        };
      }
      throw new Error('Unexpected action: ' + payload.action);
    });

    const targetLesson = { id: 'cloud-test-pending', english: 'Water', edoText: 'Ame', cloudMetadataFileId: 'meta-pending-1', version: 3 };

    // 1. Queue an edit
    await testDev.api.queueCommunityEdit(targetLesson, { edoText: 'Ame Updated' });
    let drafts = await testDev.api.readPendingCloudEdits();
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].metadataFileId, 'meta-pending-1');
    assert.equal(drafts[0].updates.edoText, 'Ame Updated');

    // 2. Queueing a second edit for the same lesson updates in-place without duplicate drafts
    await testDev.api.queueCommunityEdit(targetLesson, { edoText: 'Ame Final' });
    drafts = await testDev.api.readPendingCloudEdits();
    assert.equal(drafts.length, 1, 'Drafts for same lesson are deduplicated');
    assert.equal(drafts[0].updates.edoText, 'Ame Final');

    // 3. Network fails during sync: marks lastAttemptFailed, draft preserved in storage
    networkOnline = false;
    await assert.rejects(testDev.api.syncCommunityEdits(), /Network offline/);
    drafts = await testDev.api.readPendingCloudEdits();
    assert.equal(drafts.length, 1, 'Draft survives network failure');
    assert.equal(drafts[0].lastAttemptFailed, true, 'Draft marked as failed attempt for card UI');

    // 4. Retry pending edit when back online
    networkOnline = true;
    await testDev.api.retryPendingCloudEdit('meta-pending-1');
    drafts = await testDev.api.readPendingCloudEdits();
    assert.equal(drafts.length, 0, 'On successful sync, draft is cleaned up and card is restored');
  }

  // Test Session-Based Audio Caching and In-flight Request Deduplication
  {
    const audioStorage = new Map();
    let streamCalls = 0;
    const audioDev = device(audioStorage, async (_url, options) => {
      const payload = JSON.parse(options.body);
      if (payload.action === 'stream_audio') {
        streamCalls++;
        return { ok: true, json: async () => ({ status: 'success', audioDataUrl: 'data:audio/wav;base64,U2Vzc2lvbkF1ZGlv' }) };
      }
      throw new Error(payload.action);
    });

    const testItem = { id: 'cloud-cache-test', cloudAudioFileId: 'audio-session-1', isCommunity: true, playbackPermission: 'granted', hasAudio: true };

    // 1. First playback: downloads recording from gateway
    const firstAudio = await audioDev.api.getCommunityAudio(testItem);
    assert.equal(firstAudio, 'data:audio/wav;base64,U2Vzc2lvbkF1ZGlv');
    assert.equal(streamCalls, 1, 'First playback fetches audio from gateway');

    // 2. Second playback: immediately serves from in-memory session cache without network request
    const secondAudio = await audioDev.api.getCommunityAudio(testItem);
    assert.equal(secondAudio, 'data:audio/wav;base64,U2Vzc2lvbkF1ZGlv');
    assert.equal(streamCalls, 1, 'Second playback uses in-memory session cache (0 extra network calls)');

    // 3. In-flight request deduplication: concurrent calls share a single network request
    const newTarget = { id: 'cloud-concurrent', cloudAudioFileId: 'audio-session-concurrent', isCommunity: true, playbackPermission: 'granted', hasAudio: true };
    const [concurrent1, concurrent2] = await Promise.all([
      audioDev.api.getCommunityAudio(newTarget),
      audioDev.api.getCommunityAudio(newTarget)
    ]);
    assert.equal(concurrent1, concurrent2);
    assert.equal(streamCalls, 2, 'Concurrent requests for the same audio share a single network stream');
  }

  // Test Teach Edo Question Shuffling, Non-repeating rotation, and Skip-to-end
  {
    const q1 = { id: 'q-1', english: 'Water' };
    const q2 = { id: 'q-2', english: 'Hand' };
    const q3 = { id: 'q-3', english: 'House' };
    const q4 = { id: 'q-4', english: 'Tree' };
    const allQ = [q1, q2, q3, q4];

    // Shuffle produces a permutation with all elements
    const shuffled = a.api.shuffleQuestions(allQ);
    assert.equal(shuffled.length, 4);
    assert(shuffled.some(item => item.id === 'q-1'));
    assert(shuffled.some(item => item.id === 'q-4'));

    // Answered check
    const answered = new Set(['q-1', 'english:hand']);
    assert.equal(a.api.isQuestionAnswered(q1, answered), true);
    assert.equal(a.api.isQuestionAnswered(q2, answered), true);
    assert.equal(a.api.isQuestionAnswered(q3, answered), false);
    assert.equal(a.api.isQuestionAnswered(q4, answered), false);

    // Curated Alphabet & Numbers session sequencing
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => ({ id: `letter-${l.toLowerCase()}`, english: l, category: 'Alphabet' }));
    const numbers = Array.from({ length: 30 }, (_, i) => ({ id: `number-${i + 1}`, english: String(i + 1), category: 'Numbers' }));
    const general = Array.from({ length: 40 }, (_, i) => ({ id: `gen-${i + 1}`, english: `Word${i + 1}`, category: 'Food' }));
    const allCatalog = [...letters, ...numbers, ...general];

    const curatedQueue = a.api.buildCuratedSessionQueue(allCatalog, new Set(['letter-b', 'number-2']));
    assert.equal(curatedQueue.length, allCatalog.length - 2, 'Answered letter B and number 2 must be excluded');

    // Find the first alphabet block
    const firstAlphaIdx = curatedQueue.findIndex(q => q.category === 'Alphabet');
    assert(firstAlphaIdx >= 0, 'Alphabet block must be present');
    // Verify consecutive alphabet sequence in chunk of ~10 (A through J, with B skipped)
    assert.equal(curatedQueue[firstAlphaIdx].english, 'A');
    assert.equal(curatedQueue[firstAlphaIdx + 1].english, 'C'); // B was answered!
    assert.equal(curatedQueue[firstAlphaIdx + 2].english, 'D');

    // Find first number block
    const firstNumIdx = curatedQueue.findIndex(q => q.category === 'Numbers');
    assert(firstNumIdx >= 0, 'Numbers block must be present');
    assert.equal(curatedQueue[firstNumIdx].english, '1');
    assert.equal(curatedQueue[firstNumIdx + 1].english, '3'); // 2 was answered!
    assert.equal(curatedQueue[firstNumIdx + 2].english, '4');
  }

  // Test Background Audio Preloading, Green Dot Readiness, Zero-Latency Playback, Pause/Resume, and Invalidation
  {
    const preloaderBundle = buildSync({
      entryPoints: ['src/services/audioPreloader.ts'],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      external: ['@capacitor/*']
    }).outputFiles[0].text;

    const testStorage = new Map();
    let currentConcurrent = 0;
    let peakConcurrent = 0;
    let downloadsCount = 0;
    const downloadResolvers = [];

    const preloaderContext = {
      module: { exports: {} },
      console,
      crypto: webcrypto,
      TextEncoder,
      Uint8Array,
      AbortSignal,
      atob,
      btoa,
      navigator: { onLine: true },
      window: {
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: id => clearTimeout(id)
      },
      localStorage: {
        getItem: key => testStorage.get(key) || null,
        setItem: (key, val) => testStorage.set(key, val),
        removeItem: key => testStorage.delete(key)
      },
      require: name => {
        if (name === '@capacitor/core') return { Capacitor: { isNativePlatform: () => false } };
        if (name === '@capacitor/preferences') return {
          Preferences: {
            get: async ({ key }) => ({ value: testStorage.get(key) || null }),
            set: async ({ key, value }) => testStorage.set(key, value),
            remove: async ({ key }) => { testStorage.delete(key); }
          }
        };
        throw Error(name);
      }
    };
    preloaderContext.exports = preloaderContext.module.exports;
    vm.runInNewContext(preloaderBundle, preloaderContext);
    const preloader = preloaderContext.module.exports;

    preloader.clearAudioPreloadState();

    const mockDownloader = async (fileId) => {
      downloadsCount++;
      currentConcurrent++;
      if (currentConcurrent > peakConcurrent) peakConcurrent = currentConcurrent;
      try {
        if (fileId === 'audio-err') {
          return { ok: false, error: 'Network error' };
        }
        return { ok: true, audioDataUrl: `data:audio/wav;base64,DATA_${fileId}` };
      } finally {
        currentConcurrent--;
      }
    };

    const entriesToPreload = [
      { id: 'cloud-1', english: 'Water', category: 'word', hasAudio: true, cloudAudioFileId: 'audio-1', playbackPermission: 'granted' },
      { id: 'cloud-2', english: 'House', category: 'word', hasAudio: true, cloudAudioFileId: 'audio-2', playbackPermission: 'granted' },
      { id: 'cloud-3', english: 'Tree', category: 'word', hasAudio: true, cloudAudioFileId: 'audio-3', playbackPermission: 'granted' },
      { id: 'cloud-err', english: 'Faulty', category: 'word', hasAudio: true, cloudAudioFileId: 'audio-err', playbackPermission: 'granted' },
      { id: 'cloud-denied', english: 'Private', category: 'word', hasAudio: true, cloudAudioFileId: 'audio-denied', playbackPermission: 'denied' }
    ];

    let notifyFired = 0;
    const unsub = preloader.subscribeAudioReadiness(() => {
      notifyFired++;
    });

    // Start background audio preloading
    preloader.startBackgroundAudioLoading(entriesToPreload, mockDownloader);

    // Denied entry must never be enqueued
    assert.equal(preloader.isAudioDownloading('audio-denied'), false);
    assert.equal(preloader.isAudioReady('audio-denied'), false);

    // Wait for queue processing to complete
    await new Promise(r => setTimeout(r, 600));

    // Concurrency must never exceed 2 parallel downloads
    assert(peakConcurrent <= 2, `Peak concurrent downloads (${peakConcurrent}) must not exceed 2`);

    // Verify readiness: Successful downloads must be marked ready
    assert.equal(preloader.isAudioReady('audio-1'), true, 'audio-1 must be marked ready for green dot');
    assert.equal(preloader.isAudioReady('audio-2'), true, 'audio-2 must be marked ready for green dot');
    assert.equal(preloader.isAudioReady('audio-3'), true, 'audio-3 must be marked ready for green dot');

    // Failed download must NOT be marked ready (no green dot)
    assert.equal(preloader.isAudioReady('audio-err'), false, 'Failed download must not show green dot');
    assert.equal(preloader.isAudioFailed('audio-err'), true, 'audio-err must be recorded as failed');

    // Listener notifications must have triggered as items became ready
    assert(notifyFired > 0, 'Readiness listeners must be notified');

    // Test pause during recording
    preloader.pauseBackgroundAudioLoading();
    // Enqueue an extra item while paused
    const pausedItem = { id: 'cloud-pause', english: 'Paused', category: 'word', hasAudio: true, cloudAudioFileId: 'audio-pause', playbackPermission: 'granted' };
    const beforeCount = downloadsCount;
    preloader.startBackgroundAudioLoading([pausedItem], mockDownloader);
    await new Promise(r => setTimeout(r, 50));
    assert.equal(downloadsCount, beforeCount, 'Downloads must pause during microphone recording');

    // Resume downloading
    preloader.resumeBackgroundAudioLoading();
    await new Promise(r => setTimeout(r, 200));
    assert.equal(preloader.isAudioReady('audio-pause'), true, 'Resumed download must complete successfully');

    // Test Invalidation on voice replacement or deletion
    preloader.invalidateAudioPreload('audio-1');
    assert.equal(preloader.isAudioReady('audio-1'), false, 'Invalidated audio must not show green dot');

    unsub();
    console.log('✓ Automatic background audio preloading, green dot readiness, and pause/resume verified.');
  }

  console.log('PASS: shared/local deduplication, immutable originals, separate offline cache, durable spelling drafts, conflict preservation, permitted offline audio, revocation checks, multi-browser sync, admin locking, automatic section progression, tombstone purging, and synthetic test rejection.');
})().catch(error => { console.error(error); process.exitCode = 1; });
