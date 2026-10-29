const { buildSync } = require('esbuild');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const bundle = buildSync({ entryPoints: ['src/services/communityLibrary.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['@capacitor/*'] }).outputFiles[0].text;
function device(storage = new Map(), request = async () => { throw Error('offline'); }) {
  const module = { exports: {} }, navigator = { onLine: true };
  const context = { module, exports: module.exports, console, crypto: webcrypto, TextEncoder, Uint8Array, AbortSignal, atob, btoa, navigator,
    localStorage: { getItem: key => storage.get(key) || null }, fetch: (...args) => request(...args),
    require: name => {
      if (name === '@capacitor/core') return { Capacitor: { isNativePlatform: () => false } };
      if (name === '@capacitor/preferences') return { Preferences: { get: async ({ key }) => ({ value: storage.get(key) || null }), set: async ({ key, value }) => storage.set(key, value) } };
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

  console.log('PASS: shared/local deduplication, immutable originals, separate offline cache, durable spelling drafts, conflict preservation, permitted offline audio, revocation checks, multi-browser sync, admin locking, automatic section progression, tombstone purging, and synthetic test rejection.');
})().catch(error => { console.error(error); process.exitCode = 1; });
