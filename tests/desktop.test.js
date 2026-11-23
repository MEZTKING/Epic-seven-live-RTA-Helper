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
  assert.deepStrictEqual(args.slice(-3), ['1234', '99', '0']);
  ps.stdout.emit('data', Buffer.from('10 20 1280 7'));
  ps.stdout.emit('data', Buffer.from('20 1\r\nmin\r\n'));
  assert.deepStrictEqual(got, [{ x: 10, y: 20, w: 1280, h: 720, front: true }, { min: true }]);
  // right-click snaps (DEVLOG #110): asked for with a third argument, reported as { rclick }
  ps.stdout.emit('data', Buffer.from('rclick\r\n'));
  assert.deepStrictEqual(got[2], { rclick: true });
  const sp2 = fakeSpawn();
  wintrack.track('1234', 99, () => {}, { spawn: sp2, dir, rclick: true });
  assert.deepStrictEqual(sp2.calls[0].args.slice(-3), ['1234', '99', '1']);
  assert.match(wintrack.SCRIPT, /GetAsyncKeyState\(2\)/);
  assert.ok(Buffer.from(wintrack.psArgs('1', 2, null, true).slice(-1)[0], 'base64').toString('utf16le').endsWith(' 1 2 1'));
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

test('desktop build: every local file main.js / preload.js loads is in the package list (DEVLOG #44)', () => {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', 'desktop');
  const files = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).build.files;
  const need = new Set();
  for (const f of ['main.js', 'preload.js', 'updater.js', 'wintrack.js', 'records.js', 'reminder.js']) {
    need.add(f);
    for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/require\('\.\/([\w-]+)'\)/g)) need.add(m[1] + '.js');
  }
  assert.deepStrictEqual([...need].filter((f) => !files.includes(f)), [], 'missing from desktop/package.json build.files: the packaged app would not start');
});

test('desktop: Guild War reminder — once per war, about 30 minutes before, also after a restart (DEVLOG #50)', () => {
  const { create } = require('../desktop/reminder.js');
  const T0 = Date.parse('2026-11-14T22:00:00Z');
  const world = (saved = {}) => {
    const w = { t: T0, timers: [], notes: [], saved };
    w.r = create({
      now: () => w.t,
      setTimer: (fn, ms) => { const h = { fn, at: w.t + ms, off: false }; w.timers.push(h); return h; },
      clearTimer: (h) => (h.off = true),
      notify: (n) => w.notes.push(n),
      load: () => w.saved,
      save: (v) => (w.saved = v),
    });
    w.go = (to) => { // run the timers that are due until `to`
      for (;;) {
        const due = w.timers.filter((h) => !h.off && h.at <= to).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        due.off = true;
        w.t = due.at;
        due.fn();
      }
      w.t = to;
    };
    return w;
  };
  const iso = (ms) => new Date(ms).toISOString();
  const H = 3600000;
  // "War Begins in 29h": nothing for 28 hours, one notification 30 minutes before
  const w = world();
  assert.strictEqual(w.r.set(iso(T0 + 29 * H)), true);
  w.go(T0 + 28 * H);
  assert.strictEqual(w.notes.length, 0);
  w.go(T0 + 28.6 * H);
  assert.strictEqual(w.notes.length, 1);
  assert.strictEqual(w.notes[0].minutes, 30);
  assert.match(w.notes[0].body, /about 30 minutes/);
  // the same war read again (the game shows whole hours: the estimate moves a little): no second notification
  assert.strictEqual(w.r.set(iso(T0 + 29.4 * H)), false);
  w.r.set(iso(T0 + 28.9 * H));
  w.go(T0 + 30 * H);
  assert.strictEqual(w.notes.length, 1);
  // the next war, two days later: again
  w.r.set(iso(T0 + 77 * H));
  w.go(T0 + 78 * H);
  assert.strictEqual(w.notes.length, 2);
  // an earlier reading of the same war wins; a later one does not push the reminder back
  const e = world();
  e.r.set(iso(T0 + 10 * H));
  assert.strictEqual(e.r.set(iso(T0 + 10.8 * H)), false);
  assert.strictEqual(e.r.set(iso(T0 + 9.5 * H)), true);
  e.go(T0 + 9.1 * H);
  assert.strictEqual(e.notes.length, 1);
  // restart in between: scheduled again from what was saved; a war already announced stays quiet
  const a = world();
  a.r.set(iso(T0 + 5 * H));
  const b = world(a.saved);
  b.r.restore();
  b.go(T0 + 4.6 * H);
  assert.strictEqual(b.notes.length, 1);
  const c = world(b.saved);
  c.r.restore();
  c.go(T0 + 6 * H);
  assert.strictEqual(c.notes.length, 0);
  // read when the war is less than 30 minutes away: said right away, with the real number of minutes
  const d = world();
  d.r.set(iso(T0 + 12 * 60000));
  d.go(T0 + 2000);
  assert.strictEqual(d.notes.length, 1);
  assert.strictEqual(d.notes[0].minutes, 12);
  // nonsense and the past are ignored
  assert.strictEqual(d.r.set('soon'), false);
  assert.strictEqual(d.r.set(iso(T0 - H)), false);
});
