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

// A fake PowerShell process for the tracker (DEVLOG #35): states, failures with their error text, and stop().
function fakeSpawn() {
  const { EventEmitter } = require('events');
  const calls = [];
  const fn = (cmd, args) => {
    const ps = new EventEmitter();
    ps.stdout = new EventEmitter();
    ps.stderr = new EventEmitter();
    ps.killed = false;
    ps.kill = () => (ps.killed = true);
    calls.push({ cmd, args, ps });
    return ps;
  };
  fn.calls = calls;
  return fn;
}

test('wintrack runs the script from a file and reports positions', () => {
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e7wt-'));
  const sp = fakeSpawn();
  const got = [];
  wintrack.track('1234', 99, (s) => got.push(s), { spawn: sp, dir });
  const { args, ps } = sp.calls[0];
  assert.ok(args.includes('-File'), 'uses -File, not an encoded command');
  const file = args[args.indexOf('-File') + 1];
  assert.strictEqual(fs.readFileSync(file, 'utf8'), wintrack.SCRIPT);
  assert.deepStrictEqual(args.slice(-2), ['1234', '99']);
  ps.stdout.emit('data', Buffer.from('10 20 1280 7'));
  ps.stdout.emit('data', Buffer.from('20 1\r\nmin\r\n'));
  assert.deepStrictEqual(got, [{ x: 10, y: 20, w: 1280, h: 720, front: true }, { min: true }]);
  // no dir: falls back to an encoded command
  assert.ok(wintrack.psArgs('1', 2, null).includes('-EncodedCommand'));
});

test('wintrack reports a failure with PowerShell\'s error text, once', async () => {
  const sp = fakeSpawn();
  const got = [];
  wintrack.track('1234', 99, (s) => got.push(s), { spawn: sp });
  const { ps } = sp.calls[0];
  ps.stderr.emit('data', Buffer.from('Add-Type : This script contains malicious content\r\n  and has been blocked'));
  ps.emit('exit', 1);
  ps.emit('error', new Error('again'));
  assert.strictEqual(got.length, 1);
  assert.match(got[0].failed, /exit 1.*malicious content and has been blocked/);
  // a failure to start at all
  const got2 = [];
  wintrack.track('1', 2, (s) => got2.push(s), { spawn: () => { throw new Error('ENOENT powershell.exe'); } });
  await new Promise((r) => setImmediate(r));
  assert.match(got2[0].failed, /could not start: ENOENT/);
});

test('wintrack: no failure is reported after stop()', () => {
  const sp = fakeSpawn();
  const got = [];
  const t = wintrack.track('1234', 99, (s) => got.push(s), { spawn: sp });
  t.stop();
  sp.calls[0].ps.emit('exit', null);
  assert.strictEqual(sp.calls[0].ps.killed, true);
  assert.deepStrictEqual(got, []);
});
