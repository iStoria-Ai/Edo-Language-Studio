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
  console.log('PASS: shared/local deduplication, immutable originals, separate offline cache, durable spelling drafts, conflict preservation, permitted offline audio, revocation checks, and exhausted global questions.');
})().catch(error => { console.error(error); process.exitCode = 1; });
