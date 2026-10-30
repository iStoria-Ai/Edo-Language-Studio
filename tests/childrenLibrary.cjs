const { buildSync } = require('esbuild');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const bundle = buildSync({
  stdin: { contents: `export * from './src/services/childrenLibraryService'; export { LanguageLibraryScreen } from './src/screens/LanguageLibraryScreen';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  define: { 'import.meta.env.BASE_URL': '"/Edo-Language-Studio/"' },
  external: ['react', 'react/jsx-runtime', '@capacitor/*']
}).outputFiles[0].text;
const calls = [];
let response;
const moduleObject = { exports: {} };
let storageAccesses = 0;
const storage = new Proxy({}, { get() { storageAccesses++; throw new Error('Children must never access adult storage'); } });
vm.runInNewContext(bundle, {
  module: moduleObject, exports: moduleObject.exports, console, setTimeout, clearTimeout,
  AbortController, localStorage: storage,
  require: name => name.startsWith('@capacitor/') ? {} : require(name),
  fetch: async (url, options) => {
    calls.push({ url, ...options, payload: JSON.parse(options.body) });
    return { ok: true, json: async () => response };
  }
});
const api = moduleObject.exports;
const lesson = { id: 'cloud-real', recordingId: 'real', english: 'Water', edoText: 'Ame', category: 'word', status: 'awaiting_review', isCommunity: true, hasAudio: true, cloudMetadataFileId: 'meta', cloudAudioFileId: 'audio', playbackPermission: 'granted' };
(async () => {
  response = { status: 'success', items: [lesson, { ...lesson, id: 'cloud-denied', playbackPermission: 'denied' }, null, { ...lesson, id: 'cloud-deleted', recordingId: 'deleted' }, { ...lesson, id: 'cloud-local', audioDataUrl: 'data:audio/wav;base64,AAAA' }], tombstones: ['deleted'], checkedAt: 'now' };
  const snapshot = await api.fetchChildrenLibrary();
  assert.equal(snapshot.entries.length, 1);
  assert.equal(calls[0].payload.action, 'get_library');
  assert.equal(calls[0].payload.authToken, undefined);
  assert.equal(calls[0].credentials, 'omit');
  response = { status: 'success', audioDataUrl: 'data:audio/wav;base64,AAAA' };
  assert.equal(await api.getChildrenAudio(lesson), response.audioDataUrl);
  assert.equal(calls[1].payload.action, 'stream_audio');
  assert.equal(calls[1].payload.authToken, undefined);
  await assert.rejects(api.getChildrenAudio({ ...lesson, playbackPermission: 'denied' }));
  assert.equal(calls.length, 2);
  response = { status: 'error' };
  await assert.rejects(api.fetchChildrenLibrary());
  const entries = [lesson, { ...lesson, id: 'cloud-denied', playbackPermission: 'denied' }, { ...lesson, id: 'cloud-incomplete', edoText: '' }, { ...lesson, id: 'cloud-test-fixture' }];
  const child = renderToStaticMarkup(React.createElement(api.LanguageLibraryScreen, { entries, readOnly: true, onBackToDashboard() {} }));
  assert.match(child, /1 completed lesson/);
  assert.match(child, /Play recorded Edo pronunciation for Water/);
  assert.match(child, /verified\/water.svg|word-water.jpg/);
  assert.doesNotMatch(child, /aria-label="Edit|Protected lesson:|aria-label="close"|Administrator|<textarea|type="file"/);
  assert.match(child, /Search words or phrases/);
  assert.equal(storageAccesses, 0);
  const adult = renderToStaticMarkup(React.createElement(api.LanguageLibraryScreen, { entries: [lesson], onBackToDashboard() {} }));
  assert.match(adult, /aria-label="Edit Water"/);
  assert.match(adult, /aria-label="close"/);
  // Unknown pictures must also bypass the shared image cache.
  renderToStaticMarkup(React.createElement(api.LanguageLibraryScreen, { entries: [{ ...lesson, english: 'An unknown picture subject' }], readOnly: true, onBackToDashboard() {} }));
  assert.equal(storageAccesses, 0);
  console.log('PASS: credential-free cloud reads/audio; no adult storage; denied/deleted/local lessons excluded; completed-only read-only UI; adult controls preserved by default.');
})().catch(error => { console.error(error); process.exitCode = 1; });

// Exercise the actual container effect with browser lifecycle events and a read-only gateway.
const lifecycleBundle = buildSync({
  stdin: { contents: `export { ChildrenLibraryScreen } from './src/screens/ChildrenLibraryScreen';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  define: { 'import.meta.env.BASE_URL': '"/Edo-Language-Studio/"' },
  external: ['react', 'react/jsx-runtime', '@capacitor/*']
}).outputFiles[0].text;
(async () => {
  const events = new Map();
  const effects = [];
  const updates = [];
  let periodic;
  let requests = 0;
  const windowMock = {
    innerWidth: 375,
    setTimeout, clearTimeout,
    setInterval(fn, ms) { assert.equal(ms, 30000); periodic = fn; return 1; },
    clearInterval() { periodic = undefined; },
    addEventListener(name, fn) { events.set(name, fn); },
    removeEventListener(name) { events.delete(name); }
  };
  const documentMock = {
    visibilityState: 'visible',
    addEventListener(name, fn) { events.set(name, fn); },
    removeEventListener(name) { events.delete(name); }
  };
  const navigatorMock = { onLine: true };
  const hooks = {
    ...React,
    createElement() { return null; },
    useState(initial) { return [typeof initial === 'function' ? initial() : initial, value => updates.push(value)]; },
    useEffect(fn) { effects.push(fn); }
  };
  const mod = { exports: {} };
  vm.runInNewContext(lifecycleBundle, {
    module: mod, exports: mod.exports, console, setTimeout, clearTimeout, AbortController,
    window: windowMock, document: documentMock, navigator: navigatorMock, localStorage: storage,
    require: name => name === 'react' ? hooks : name.startsWith('@capacitor/') ? {} : require(name),
    fetch: async (url, options) => {
      requests++;
      assert.equal(JSON.parse(options.body).action, 'get_library');
      return { ok: true, json: async () => ({ status: 'success', items: requests === 1 ? [lesson] : [], checkedAt: 'now' }) };
    }
  });
  mod.exports.ChildrenLibraryScreen();
  const cleanup = effects[0]();
  const flush = () => new Promise(resolve => setImmediate(resolve));
  await flush();
  assert.equal(requests, 1);
  await periodic();
  assert.equal(requests, 2);
  assert(updates.some(value => Array.isArray(value) && value.length === 0), 'Cloud deletion replaces the displayed snapshot');
  documentMock.visibilityState = 'hidden';
  await periodic();
  assert.equal(requests, 2);
  documentMock.visibilityState = 'visible';
  await events.get('visibilitychange')();
  assert.equal(requests, 3);
  navigatorMock.onLine = false;
  await periodic();
  assert.equal(requests, 3);
  navigatorMock.onLine = true;
  await events.get('online')();
  assert.equal(requests, 4);
  await events.get('focus')();
  assert.equal(requests, 5);
  cleanup();
  assert.equal(events.size, 0);
  assert.equal(periodic, undefined);
  console.log('PASS: opening, reconnect, visibility/focus and 30-second active refresh; hidden/offline suppression; snapshot replacement; listener cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
