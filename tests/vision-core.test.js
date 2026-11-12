// Vision core: event bus (delivery, log, request/reply) and the repeat gate.
const test = require('node:test');
const assert = require('node:assert');
const { createBus, repeatGate, LOG_KEY, LOG_MAX } = require('../js/vision/core.js');

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
/** Fake BroadcastChannel network: messages go to every other channel. */
function network() {
  const chans = [];
  return () => {
    const c = { onmessage: null, postMessage: (msg) => chans.filter((x) => x !== c).forEach((x) => x.onmessage && x.onmessage({ data: JSON.parse(JSON.stringify(msg)) })) };
    chans.push(c);
    return c;
  };
}

test('publish reaches listeners in this window and other windows', () => {
  const net = network();
  const a = createBus({ channel: net() });
  const b = createBus({ channel: net() });
  const gotA = [];
  const gotB = [];
  a.on('gear:*', (d) => gotA.push(d.n));
  b.on(['gear:item', 'screen:changed'], (d) => gotB.push(d.n));
  a.publish('gear:item', { n: 1 });
  b.publish('screen:changed', { n: 2 });
  a.publish('guild:name-read', { n: 3 });
  assert.deepStrictEqual(gotA, [1]);
  assert.deepStrictEqual(gotB, [1, 2]);
});

test('facts are logged (capped), status/commands/replies are not', () => {
  const storage = memStorage();
  const bus = createBus({ storage });
  bus.publish('vision:status', { watching: true });
  bus.publish('cmd:start', null);
  for (let i = 0; i < LOG_MAX + 5; i++) bus.publish('gear:item', { i });
  const log = bus.log();
  assert.strictEqual(log.length, LOG_MAX);
  assert.ok(log.every((e) => e.type === 'gear:item'));
  assert.strictEqual(log[log.length - 1].data.i, LOG_MAX + 4);
  assert.ok(storage.getItem(LOG_KEY));
});

test('request/reply across windows, errors and timeouts', async () => {
  const net = network();
  const watcher = createBus({ channel: net() });
  const page = createBus({ channel: net() });
  watcher.handle('snapshot', (d) => ({ w: 1280, h: 720, asked: d.why }));
  watcher.handle('teach', () => {
    throw new Error('not watching');
  });
  assert.deepStrictEqual(await page.request('snapshot', { why: 'calibrate' }), { w: 1280, h: 720, asked: 'calibrate' });
  await assert.rejects(page.request('teach', {}), /not watching/);
  await assert.rejects(page.request('nobody-answers', {}, 50), /timeout/);
});

test('request works inside the watcher window itself', async () => {
  const bus = createBus();
  bus.handle('status', () => 'ok');
  assert.strictEqual(await bus.request('status'), 'ok');
});

test('repeat gate lets a value through once, on the n-th repeat', () => {
  const g = repeatGate(2);
  assert.deepStrictEqual(['a', 'a', 'a', 'b', 'b', null, 'b', 'b'].map((v) => g.push(v)), [false, true, false, false, true, false, false, true]);
  g.reset();
  assert.strictEqual(g.push('a'), false);
});
