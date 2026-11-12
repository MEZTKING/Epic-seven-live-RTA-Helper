// Pure helpers of the desktop app (window tracker parsing, updater version compare).
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

const wintrack = require('../desktop/wintrack.js');

test('wintrack parses tracker lines', () => {
  assert.deepStrictEqual(wintrack.parseLine('100 50 1280 720 1\r'), { x: 100, y: 50, w: 1280, h: 720, front: true });
  assert.deepStrictEqual(wintrack.parseLine('-8 -8 1936 1056 0'), { x: -8, y: -8, w: 1936, h: 1056, front: false });
  assert.deepStrictEqual(wintrack.parseLine('min'), { min: true });
  assert.deepStrictEqual(wintrack.parseLine('gone'), { gone: true });
  assert.strictEqual(wintrack.parseLine('garbage here'), null);
});

test('wintrack reads the window handle from a capture source id', () => {
  assert.strictEqual(wintrack.hwndOf('window:132456:0'), '132456');
  assert.strictEqual(wintrack.hwndOf('screen:0:0'), null);
  assert.strictEqual(wintrack.hwndOf(undefined), null);
});

test('wintrack does nothing off Windows or without a handle', () => {
  const t = wintrack.track(null, 1, () => assert.fail('no state expected'));
  t.stop();
});

test('updater compares versions', () => {
  const load = Module._load;
  Module._load = function (req, ...a) {
    return req === 'electron' ? {} : load.call(this, req, ...a);
  };
  try {
    const { newer } = require('../desktop/updater.js');
    assert.ok(newer('0.1.12', '0.1.9') > 0);
    assert.strictEqual(newer('v0.1.3', '0.1.3'), 0);
    assert.ok(newer('0.1.0', '0.1.5') < 0);
    assert.ok(newer('0.2', '0.1.99') > 0);
  } finally {
    Module._load = load;
  }
});
