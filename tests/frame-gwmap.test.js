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

test('frame: a title bar right above the game\'s black band is still cut (RTA screens; review, DEVLOG #40)', () => {
  const W = 400, H = 250;
  const a = picture(W, H, (x, y, r) => (y < 14 ? [200, 200, 205] : y < 40 ? [0, 0, 0] : [r() * 255, r() * 255, r() * 255]));
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

test('gwmap: finds defender badges (dark disc, symbol, ring) on a wide and a 16:9 map; ring colour = side / beaten', () => {
  // the reader always scales the map to NORM_H (1070) pixels high first, so that is the size tested
  const H = G.NORM_H;
  for (const W of [2000, 1902]) {
    const R = 0.03 * H;
    const at = [[0.4 * W, 0.4 * H, [200, 40, 50]], [0.7 * W, 0.7 * H, [60, 200, 90]], [0.55 * W, 0.25 * H, [70, 70, 75]]];
    const a = picture(W, H, (x, y, r) => {
      for (const [cx, cy, ring] of at) {
        const d = Math.hypot(x - cx, y - cy);
        if (Math.abs(x - cx) < 0.32 * R && Math.abs(y - cy) < 0.4 * R) return [220, 220, 225]; // the house / tower symbol
        if (d < 0.93 * R) return [45, 50, 60];
        if (d < 1.12 * R) return ring;
      }
      // a dark blob without a symbol somewhere else
      if (Math.hypot(x - 0.2 * W, y - 0.6 * H) < R * 1.1) return [40, 40, 40];
      const v = 120 + r() * 120; // snow / stone: grey noise
      return [v, v, v + 8];
    });
    const found = G.findBadges(a, W, H);
    if (process.env.DEBUG_GW) console.log(W, JSON.stringify(found.map((f) => [Math.round(f.x), Math.round(f.y), f.state])), JSON.stringify(at.map((q) => [Math.round(q[0]), Math.round(q[1])])));
    assert.equal(found.length, 3, `W=${W}: ${JSON.stringify(found)}`);
    // within a quarter of the radius (a grey ring blends into the dark disc, so its centre can be a few px off)
    const near = (cx, cy) => found.find((f) => Math.hypot(f.x - cx, f.y - cy) <= R / 4);
    assert.equal(near(at[0][0], at[0][1]).state, 'enemy');
    assert.equal(near(at[1][0], at[1][1]).state, 'ours');
    assert.equal(near(at[2][0], at[2][1]).state, 'beaten');
  }
  assert.equal(G.sideOf([{ state: 'ours' }, { state: 'ours' }, { state: 'beaten' }, { state: 'enemy' }]), 'ours');
  assert.equal(G.sideOf([{ state: 'beaten' }]), null, 'all beaten: the side comes from the overview');
});

test('gwmap: overview — which side the switch shows, and the three fortress names from OCR words', () => {
  const W = 400, H = 40;
  const lit = (k) => picture(W, H, (x) => (Math.floor(x / 200) === k ? [230, 230, 230] : [30, 30, 35]));
  assert.equal(G.toggleSide(lit(0), W, H, { x: 0, y: 0, w: W, h: H }), 'ours');
  assert.equal(G.toggleSide(lit(1), W, H, { x: 0, y: 0, w: W, h: H }), 'enemy');
  // real OCR words from the owner's overviews (2000×1070), several passes mixed
  const enemy = [{ text: 'Stinger', conf: 93, x: 640 }, { text: 'Fortre', conf: 91, x: 718 }, { text: 'Singer', conf: 0, x: 639 }, { text: 'Darkwood', conf: 92, x: 1189 }, { text: 'Darkwood', conf: 90, x: 1188 }, { text: 'Fo', conf: 97, x: 1264 }, { text: 'Vortex', conf: 96, x: 1594 }, { text: 'Fortress', conf: 96, x: 1682 }, { text: 'NC', conf: 24, x: 1520 }];
  assert.deepEqual(G.fortNamesFromWords(enemy, 2000, 1070), ['Stinger Fortress', 'Darkwood Fortress', 'Vortex Fortress']);
  const ours = [{ text: 'Domino', conf: 96, x: 700 }, { text: 'Crown', conf: 95, x: 1114 }, { text: '“Crown', conf: 42, x: 1081 }, { text: 'Log', conf: 96, x: 1561 }];
  assert.deepEqual(G.fortNamesFromWords(ours, 2000, 1070), ['Domino Fortress', 'Crown Fortress', 'Log Fortress']);
  // the same overview at 16:9 (1228×691): Stinger 381, Darkwood 736, Vortex 998
  assert.deepEqual(G.fortNamesFromWords([{ text: 'Vortex', conf: 96, x: 998 }, { text: 'Darkwood', conf: 93, x: 736 }], 1228, 691), [null, 'Darkwood Fortress', 'Vortex Fortress']);
});

test('gwmap: which fortress the pager shows; name box under a badge', () => {
  const W = 300, H = 40;
  for (const k of [0, 1, 2]) {
    const a = picture(W, H, (x) => (Math.floor(x / 100) === k ? [230, 230, 230] : [30, 30, 35]));
    const r = G.pagerIndex(a, W, H, { x: 0, y: 0, w: W, h: H });
    assert.equal(r.index, k);
    assert.ok(r.contrast > 150);
  }
  assert.deepEqual(G.DEFAULT_FORTS, ['Left fortress', 'Middle fortress', 'Right fortress'], 'until the overview has been read');
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

test('gwmap: standby page (DEVLOG #46) — title, countdown, green button, places for any window size', () => {
  assert.equal(G.isStandbyTitle('Guild War Standby'), true);
  assert.equal(G.isStandbyTitle('Guild War Stand by'), true);
  assert.equal(G.isStandbyTitle('Guild War'), false);
  assert.equal(G.isStandbyTitle('Standby'), false);
  assert.equal(G.standbyMinutes('in 29h'), 29 * 60);
  assert.equal(G.standbyMinutes('War Begins in 29h'), 29 * 60);
  assert.equal(G.standbyMinutes('In 1d 5h'), 29 * 60);
  assert.equal(G.standbyMinutes('in 5h 30m'), 330);
  assert.equal(G.standbyMinutes('in 45m'), 45);
  assert.equal(G.standbyMinutes('ln 2Sh'), 25 * 60, 'OCR slips in "in" and in the digits are mended');
  assert.equal(G.standbyMinutes('in'), null);
  assert.equal(G.standbyMinutes('in 0h'), null);
  assert.equal(G.standbyMinutes('in 900h'), null);
  assert.equal(G.standbyMinutes(''), null);
  // places: centred, sized by the picture height, so a wider window only moves them sideways
  const a = G.standbyRect('title', 2000, 1070);
  const b = G.standbyRect('title', 1162, 654);
  assert.ok(Math.abs(a.x + a.w / 2 - 1000) < 1e-6 && Math.abs(b.x + b.w / 2 - 581) < 1e-6);
  assert.ok(Math.abs(a.y / 1070 - b.y / 654) < 1e-9 && Math.abs(a.w / 1070 - b.w / 654) < 1e-9);
  // the green button
  const W = 40;
  const H = 10;
  const px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) px.set(i % W < 30 ? [40, 110, 45, 255] : [30, 34, 48, 255], i * 4);
  assert.ok(Math.abs(G.greenShare(px, W, H, { x: 0, y: 0, w: W, h: H }) - 0.75) < 1e-9);
  assert.equal(G.greenShare(px, W, H, { x: 30, y: 0, w: 10, h: H }), 0);
});

test('gwmap: page indicator of a map against the side switch of the overview (DEVLOG #55)', () => {
  // a bar 300 × 20; lit = white
  const bar = (lit) => {
    const W = 300;
    const H = 20;
    const a = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a.set(lit(x / W) ? [240, 240, 240, 255] : [30, 32, 44, 255], (y * W + x) * 4);
    return G.barKind(a, W, H, { x: 0, y: 0, w: W, h: H });
  };
  // map: one third is a solid pill
  assert.deepEqual([bar((f) => f < 1 / 3).kind, bar((f) => f < 1 / 3).index], ['map', 0]);
  assert.deepEqual([bar((f) => f >= 1 / 3 && f < 2 / 3).kind, bar((f) => f >= 1 / 3 && f < 2 / 3).index], ['map', 1]);
  assert.deepEqual([bar((f) => f >= 2 / 3).kind, bar((f) => f >= 2 / 3).index], ['map', 2]);
  // overview: one half lit, with a dark icon in its middle
  const ours = bar((f) => f < 0.5 && !(f > 0.2 && f < 0.3));
  const enemy = bar((f) => f >= 0.5 && !(f > 0.7 && f < 0.8));
  assert.deepEqual([ours.kind, ours.side], ['overview', 'ours']);
  assert.deepEqual([enemy.kind, enemy.side], ['overview', 'enemy']);
  // neither: nothing lit, everything lit, a small bright spot (a banner in the lobby)
  assert.equal(bar(() => false).kind, null);
  assert.equal(bar(() => true).kind, null);
  assert.equal(bar((f) => f > 0.4 && f < 0.58).kind, null);
});

test('gwmap: servers, scripts and which reading of a name to believe (DEVLOG #55)', () => {
  assert.equal(G.serverOf('NightOwls @ Japan'), 'japan');
  assert.equal(G.serverOf('TestHome Global'), 'global');
  assert.equal(G.serverOf('Globalists'), '');
  assert.deepEqual(['japan', 'korea', 'asia', 'global', 'europe', ''].map(G.langFor), ['jpn', 'kor', 'chi_tra', '', '', '']);
  assert.deepEqual(['japan', 'global', 'europe', 'nowhere'].map(G.worldFor), ['world_jpn', 'world_global', 'world_eu', '']);
  // the reader puts spaces between the characters and adds stray Latin letters at the ends
  assert.equal(G.cleanCjk('ユキ ダル マ'), 'ユキダルマ');
  assert.equal(G.cleanCjk('ハナ コ サク ロ a'), 'ハナコサクロ');
  assert.equal(G.cleanCjk('山田 太郎'), '山田太郎');
  assert.equal(G.cleanCjk('김 철수'), '김철수');
  assert.equal(G.cleanCjk('starry 26'), '', 'no name in that script');
  assert.equal(G.cleanCjk('コ'), '', 'one character is not a name');
  const pick = (list) => G.pickRead(list).name;
  // a Japanese name: English data makes nonsense of it
  assert.equal(pick([{ lang: 'eng', text: 'FEEEE', conf: 45 }, { lang: 'jpn', text: 'ユキ ダル マ', conf: 93 }]), 'ユキダルマ');
  // a Latin name: the other script's stray characters do not win
  assert.equal(pick([{ lang: 'eng', text: 'starry26', conf: 85 }, { lang: 'jpn', text: 'Starry26', conf: 89 }]), 'starry26');
  assert.equal(pick([{ lang: 'eng', text: 'starry z6 ~', conf: 60 }, { lang: 'jpn', text: 'StarryZ6 人 .', conf: 33 }]), 'starry');
  // a Latin name the English data read badly and the other data read surely
  assert.equal(pick([{ lang: 'eng', text: 'Keep)jP1', conf: 21 }, { lang: 'jpn', text: 'KeepJP1', conf: 64 }]), 'KeepJP1');
  assert.equal(pick([{ lang: 'eng', text: 'OKameko', conf: 88 }, { lang: 'jpn', text: '0Kameko', conf: 92 }]), 'OKameko');
  assert.equal(pick([]), '');
  assert.equal(pick([{ lang: 'eng', text: '~', conf: 90 }]), '');
});

test('gwmap: name mask — letters kept, white scenery next to them dropped (DEVLOG #55)', () => {
  const W = 300;
  const H = 96;
  const a = new Uint8ClampedArray(W * H * 4);
  const fill = (x0, y0, x1, y1, v) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a.set([v, v, v, 255], (y * W + x) * 4); };
  fill(0, 0, W, H, 60); // dark scenery
  // three "letters": strokes 8 px thick, 50 px tall
  for (const x of [100, 130, 160]) { fill(x, 25, x + 8, 75, 250); fill(x, 25, x + 20, 33, 250); }
  fill(200, 20, 290, 90, 245); // a snow patch: big and thick
  fill(20, 0, 40, 30, 250); // a roof edge touching the top
  fill(60, 40, 64, 44, 200); // a light speck: kept (small), it is the span that leaves it out
  const m = G.nameMask(a, W, H);
  const on = (x, y) => m[y * W + x];
  assert.equal(on(104, 50), 1, 'letter stroke kept');
  assert.equal(on(165, 28), 1);
  assert.equal(on(245, 55), 0, 'snow patch dropped');
  assert.equal(on(30, 10), 0, 'patch touching the edge dropped');
  const span = G.letterSpan(m, W, H);
  assert.ok(span[0] <= 100 && span[1] >= 175 && span[1] < 200, `span ${span}`);
  // grey (thin strokes of a small window are not pure white): kept from 170 up, not below
  fill(100, 25, 108, 75, 180);
  assert.equal(G.nameMask(a, W, H)[50 * W + 104], 1);
  fill(100, 25, 108, 75, 150);
  assert.equal(G.nameMask(a, W, H)[50 * W + 104], 0);
});
