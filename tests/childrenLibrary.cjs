const { buildSync } = require('esbuild');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const bundle = buildSync({
  stdin: { contents: `export * from './src/services/childrenLibraryService'; export { LanguageLibraryScreen } from './src/screens/LanguageLibraryScreen'; export { HelpOthersScreen } from './src/screens/HelpOthersScreen';`, resolveDir: process.cwd(), loader: 'ts' },
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

// Run the real click/key handlers and existing audio player with controlled cloud replies.
(async () => {
  const slots = [];
  let cursor = 0;
  const effects = [];
  const pending = [];
  const audio = [];
  const hooks = {
    ...React,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(effect) { effects.push(effect); }
  };
  class TestAudio {
    constructor() { this.paused = true; audio.push(this); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  }
  const mod = { exports: {} };
  vm.runInNewContext(bundle, {
    module: mod, exports: mod.exports, console, setTimeout, clearTimeout, AbortController,
    Audio: TestAudio, localStorage: storage,
    window: { setInterval: () => 1, clearInterval() {}, speechSynthesis: { cancel() {} } },
    require: name => name === 'react' ? hooks : name.startsWith('@capacitor/') ? {} : require(name),
    fetch: (url, options) => new Promise(resolve => {
      assert.equal(JSON.parse(options.body).action, 'stream_audio');
      pending.push({ resolve, options });
    })
  });
  const entries = [lesson, { ...lesson, id: 'cloud-second', english: 'Eye', cloudAudioFileId: 'second' }];
  const walk = node => !node || typeof node !== 'object' ? [] : [node, ...React.Children.toArray(node.props?.children).flatMap(walk)];
  function render(readOnly = true) {
    cursor = 0;
    return walk(mod.exports.LanguageLibraryScreen({ entries, readOnly, onBackToDashboard() {} }));
  }
  const cards = () => render().filter(node => node.props.role === 'button');
  const event = (extra = {}) => ({ stopped: false, stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; }, ...extra });
  async function reply(index, success = true) {
    pending[index].resolve({ ok: true, json: async () => success ? { status: 'success', audioDataUrl: 'data:audio/wav;base64,AAAA' } : { status: 'error' } });
    await new Promise(resolve => setImmediate(resolve));
  }
  // A click from any descendant (picture, English, Edo) bubbles to exactly one card handler.
  for (const target of ['picture', 'English', 'Edo', 'empty card area']) {
    const before = pending.length;
    cards()[0].props.onClick(event({ target }));
    assert.equal(pending.length, before + 1);
    await reply(before);
    assert.equal(audio.filter(item => !item.paused).length, 1);
    cards()[0].props.onClick(event()); // Same card toggles Stop.
    assert.equal(audio.filter(item => !item.paused).length, 0);
  }
  // The speaker stops propagation, so its parent does not also trigger playback.
  const card = cards()[0];
  const speaker = walk(card).find(node => node.type === 'span' && node.props.onClick);
  const click = event();
  const beforeSpeaker = pending.length;
  const speakerResult = speaker.props.onClick(click);
  if (!click.stopped) card.props.onClick(click);
  assert.equal(pending.length, beforeSpeaker + 1);
  await reply(beforeSpeaker);
  await speakerResult;
  assert.equal(audio.filter(item => !item.paused).length, 1);
  // Switching cards stops immediately, and the new recording owns the feedback.
  cards()[1].props.onClick(event());
  assert.equal(audio.filter(item => !item.paused).length, 0);
  await reply(pending.length - 1);
  assert.equal(audio.filter(item => !item.paused).length, 1);
  assert.equal(cards()[1].props['aria-pressed'], true);
  cards()[1].props.onClick(event());
  // Reverse the cloud response order; the superseded request must never play.
  cards()[0].props.onClick(event());
  const first = pending.length - 1;
  cards()[1].props.onClick(event());
  const second = pending.length - 1;
  await reply(second);
  const plays = audio.length;
  await reply(first);
  assert.equal(audio.length, plays);
  assert.equal(audio.filter(item => !item.paused).length, 1);
  cards()[1].props.onClick(event());
  // Enter and Space each activate once, held keys do not retrigger, arrows retain scrolling.
  for (const key of ['Enter', ' ']) {
    const current = cards()[0];
    const keyEvent = event({ key, target: current, currentTarget: current, repeat: false });
    const before = pending.length;
    current.props.onKeyDown(keyEvent);
    assert(keyEvent.prevented);
    assert.equal(pending.length, before + 1);
    current.props.onKeyDown(event({ key, target: current, currentTarget: current, repeat: true }));
    assert.equal(pending.length, before + 1);
    await reply(before);
    cards()[0].props.onClick(event());
  }
  const current = cards()[0];
  const arrow = event({ key: 'ArrowDown', target: current, currentTarget: current });
  current.props.onKeyDown(arrow);
  assert.equal(arrow.prevented, undefined);
  // Denial/unavailable responses never start the player.
  const beforeDenied = audio.length;
  current.props.onClick(event());
  await reply(pending.length - 1, false);
  assert.equal(audio.length, beforeDenied);
  assert.equal(cards()[0].props['aria-pressed'], false);
  // Leaving the screen invalidates a pending response.
  cards()[0].props.onClick(event());
  const beforeUnmount = audio.length;
  effects[0]()();
  await reply(pending.length - 1);
  assert.equal(audio.length, beforeUnmount);
  // The adult card retains its edit action and no new keyboard/audio-card attributes.
  const adultNodes = render(false);
  const adultCard = adultNodes.find(node => node.type === 'div' && node.props.className?.includes('h-[96px]'));
  assert.equal(adultCard.props.role, undefined);
  assert.equal(adultCard.props.tabIndex, undefined);
  assert.equal(adultCard.props.onKeyDown, undefined);
  assert(adultNodes.some(node => node.type === 'button' && node.props['aria-label'] === 'Edit Water'));

  // Test Language Library Card Pending State
  cursor = 0;
  const testEntries = [lesson, { ...lesson, id: 'cloud-second', english: 'Eye', cloudMetadataFileId: 'meta-second', cloudAudioFileId: 'second' }];
  const pendingEdits = [
    {
      id: 'edit-1',
      metadataFileId: lesson.cloudMetadataFileId,
      expectedVersion: 1,
      updates: { edoText: 'Ame New' }
    }
  ];
  const pendingNodes = walk(mod.exports.LanguageLibraryScreen({ entries: testEntries, readOnly: false, pendingEdits, onBackToDashboard() {} }));
  const pendingCard = pendingNodes.find(node => node.type === 'div' && node.props.className?.includes('opacity-60'));
  assert(pendingCard, 'Pending card has reduced opacity (opacity-60)');
  assert(pendingCard.props.className.includes('bg-[#F9FAFB]'), 'Pending card has grey background');
  assert(walk(pendingCard).some(n => typeof n.props?.children === 'string' && n.props.children.includes('Saving…') || Array.isArray(n.props?.children) && n.props.children.includes('Saving…')), 'Card displays Saving… indicator');

  // Speaker and Pencil buttons are disabled on saving card
  const pendingButtons = walk(pendingCard).filter(n => n.type === 'button');
  const disabledButtons = pendingButtons.filter(b => b.props.disabled === true);
  assert(disabledButtons.length >= 1, 'Actions disabled on saving card');

  // Unrelated card (cloud-second) does not have opacity-60
  const secondCard = pendingNodes.find(node => node.type === 'div' && node.props.className?.includes('h-[96px]') && !node.props.className?.includes('opacity-60'));
  assert(secondCard, 'Unrelated card is not greyed out');

  // Test Failed sync card state
  cursor = 0;
  const failedEdits = [
    {
      id: 'edit-2',
      metadataFileId: lesson.cloudMetadataFileId,
      expectedVersion: 1,
      updates: { edoText: 'Ame Error' },
      lastAttemptFailed: true
    }
  ];
  const failedNodes = walk(mod.exports.LanguageLibraryScreen({ entries: testEntries, readOnly: false, pendingEdits: failedEdits, onBackToDashboard() {} }));
  assert(failedNodes.some(n => typeof n.props?.children === 'string' && n.props.children.includes('Failed to sync') || Array.isArray(n.props?.children) && n.props.children.includes('Failed to sync')), 'Shows Failed to sync badge');
  assert(failedNodes.some(n => n.type === 'button' && (typeof n.props?.children === 'string' && n.props.children.includes('Retry') || Array.isArray(n.props?.children) && n.props.children.includes('Retry'))), 'Shows Retry button on sync failure');

  // Test Help Others Play Button immediate visual states
  slots.length = 0;
  cursor = 0;
  const helpEntries = [
    {
      id: 'cloud-help-1',
      recordingId: 'rec-1',
      english: 'Water',
      cloudMetadataFileId: 'meta-help-1',
      cloudAudioFileId: 'audio-help-1',
      hasAudio: true,
      isCommunity: true
    }
  ];
  const helpNodes = walk(mod.exports.HelpOthersScreen({
    entries: helpEntries,
    onAttachWritingToEntry: async () => {},
    onAttachAudioToEntry: async () => {},
    onBackToDashboard: () => {}
  }));
  const playBtn = helpNodes.find(n => n.type === 'button' && n.props['aria-label'] === 'Play existing Edo recording');
  assert(playBtn, 'Help Others displays Play button for existing audio');

  console.log('PASS: whole-card and speaker activation once; keyboard Enter/Space; immediate stop/switch; stale cloud replies ignored; denied audio blocked; adult card unchanged; card pending and retry states verified; help others play button verified.');
})().catch(error => { console.error(error); process.exitCode = 1; });
