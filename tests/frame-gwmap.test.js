// js/frame.js (where the game is inside a window/screenshot) and js/gwmap.js (Guild War fortress map), DEVLOG #38.
// Synthetic pictures here; the real screenshots are checked in tests/e2e/gw-fortress.e2e.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/frame.js');
const G = require('../js/gwmap.js');

function picture(W, H, fill) {
  const a = new Uint8ClampedArray(W * H * 4);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 4;
    const c = fill ? fill(x, y, rnd) : [rnd() * 255, rnd() * 255, rnd() * 255];
    a[p] = c[0]; a[p + 1] = c[1]; a[p + 2] = c[2]; a[p + 3] = 255;
  }
  return a;
}

test('frame: a window title bar (one colour, not black) is cut off, the game is kept', () => {
  const W = 400, H = 250;
  const a = picture(W, H, (x, y, r) => (y < 14 ? (x > 380 && x < 390 ? [0, 0, 0] : [92, 48, 24]) : [r() * 255, r() * 255, r() * 255]));
  assert.deepEqual(F.detect(a, W, H), { x: 0, y: 14, w: 400, h: 236 });
});

test("frame: the game's own black band at the top is NOT cut; a snip of just the game is left whole", () => {
  const W = 400, H = 250;
  const black = picture(W, H, (x, y, r) => (y < 30 ? [0, 0, 0] : [r() * 255, r() * 255, r() * 255]));
  assert.deepEqual(F.detect(black, W, H), { x: 0, y: 0, w: 400, h: 250 });
  assert.deepEqual(F.detect(picture(W, H), W, H), { x: 0, y: 0, w: 400, h: 250 });
  // a big plain area is not a title bar either (too tall)
  const plain = picture(W, H, (x, y, r) => (y < 60 ? [180, 180, 180] : [r() * 255, r() * 255, r() * 255]));
  assert.equal(F.detect(plain, W, H).y, 0);
});

test('gwmap: finds defender badges (dark disc, red rim) on a wide and a 16:9 map, not a plain dark blob', () => {
  // the reader always scales the map to NORM_H (1070) pixels high first, so that is the size tested
  const H = G.NORM_H;
  for (const W of [2000, 1902]) {
    const R = 0.03 * H;
    const at = [[0.4 * W, 0.4 * H], [0.7 * W, 0.7 * H]];
    const a = picture(W, H, (x, y, r) => {
      for (const [cx, cy] of at) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < 0.93 * R) return [45, 50, 60];
        if (d < 1.12 * R) return [200, 40, 50];
      }
      // a dark blob without a red rim somewhere else
      if (Math.hypot(x - 0.2 * W, y - 0.6 * H) < R * 1.1) return [40, 40, 40];
      const v = 120 + r() * 120; // snow / stone: grey noise
      return [v, v, v + 8];
    });
    const found = G.findBadges(a, W, H);
    assert.equal(found.length, 2, `W=${W}: ${JSON.stringify(found)}`);
    for (const [i, [cx, cy]] of at.entries()) assert.ok(Math.hypot(found[i].x - cx, found[i].y - cy) <= 3, `W=${W} badge ${i}`);
  }
});

test('gwmap: which fortress the pager shows; name box under a badge', () => {
  const W = 300, H = 40;
  for (const k of [0, 1, 2]) {
    const a = picture(W, H, (x) => (Math.floor(x / 100) === k ? [230, 230, 230] : [30, 30, 35]));
    const r = G.pagerIndex(a, W, H, { x: 0, y: 0, w: W, h: H });
    assert.equal(r.index, k);
    assert.ok(r.contrast > 150);
  }
  assert.deepEqual(G.FORTS, ['Stinger Fortress', 'Darkwood Fortress', 'Vortex Fortress']);
  const nb = G.nameBox({ x: 1000, y: 500 }, 1070);
  assert.ok(Math.abs(nb.x + nb.w / 2 - (1000 - 0.045 * 1070)) < 0.01 && Math.abs(nb.y + nb.h / 2 - (500 + 0.051 * 1070)) < 0.01);
});

test('gwmap: names from OCR text, matched to names you already have', () => {
  // real OCR outputs from the owner's Stinger map (DEVLOG #38)
  assert.equal(G.cleanName('= AkariRen -'), 'AkariRen');
  assert.equal(G.cleanName('RyanVo76.x °|'), 'RyanVo76');
  assert.equal(G.cleanName('wy Fri13Kayle NA'), 'Fri13Kayle');
  assert.equal(G.cleanName('epic7#rx71p7'), 'epic7#rx71p7');
  assert.equal(G.cleanName('| 4 ~'), '');
  assert.equal(G.matchName('TubuZ', ['TuDuZ', 'Miidou']), 'TuDuZ');
  assert.equal(G.matchName('Shviingv', ['Shuijingv2']), null, 'too far: not guessed');
  assert.equal(G.matchName('miidou', ['Miidou']), 'Miidou');
});

test('gwmap: the letters of one name, not the snow next to it', () => {
  const W = 200, H = 64;
  const m = new Uint8Array(W * H);
  const put = (x0, x1) => { for (let y = 20; y < 44; y++) for (let x = x0; x <= x1; x++) m[y * W + x] = 1; };
  put(80, 90); put(96, 110); put(116, 125); // a name around the middle
  put(2, 8); // bright snow at the far left, more than 0.35 × height away
  assert.deepEqual(G.letterSpan(m, W, H), [80, 125]);
});
