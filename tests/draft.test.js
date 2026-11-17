// js/wide.js (pick cards from wide portraits) and js/draftscreen.js (stage texts, confirmed cards, the draft tracker),
// DEVLOG #41. Synthetic pictures here; the owner's real BAN screen is read in tests/e2e/rta-draft.e2e.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../js/wide.js');
const D = require('../js/draftscreen.js');
const L = require('../js/logic.js');

// a fake wide portrait: w×89 RGBA with a seeded pattern, transparent in a corner
function portrait(seed, w = 190) {
  const a = new Uint8ClampedArray(w * 89 * 4);
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  // smooth blobs so a 1-pixel shift doesn't destroy the picture
  const blobs = Array.from({ length: 14 }, () => [rnd() * w, rnd() * 89, 6 + rnd() * 18, rnd() * 255]);
  for (let y = 0; y < 89; y++) for (let x = 0; x < w; x++) {
    let v = 40;
    for (const [bx, by, r, c] of blobs) if (Math.hypot(x - bx, y - by) < r) v = c;
    const p = (y * w + x) * 4;
    a[p] = a[p + 1] = a[p + 2] = v;
    a[p + 3] = x < 20 && y < 20 ? 0 : 255;
  }
  return { a, w };
}
// draw a portrait into a BIG_W×BIG_H card patch the way the game does (enemy: right-aligned; mine: mirrored), shifted
function card(P, side, dx = 0, dy = 0, fade = 1) {
  const out = new Uint8ClampedArray(W.BIG_W * W.BIG_H * 4).fill(30);
  for (let y = 0; y < W.PH; y++) for (let x = 0; x < W.PW; x++) {
    const sx = side === 'enemy' ? P.w - W.PW + x : P.w - 1 - x; // mirrored for my side
    const sp = (y * P.w + sx) * 4;
    if (P.a[sp + 3] === 0) continue;
    const tx = x + W.M + dx, ty = y + W.M + dy;
    const tp = (ty * W.BIG_W + tx) * 4;
    out[tp] = out[tp + 1] = out[tp + 2] = 30 + (P.a[sp] - 30) * fade;
    out[tp + 3] = 255;
  }
  return out;
}

test('wide: a card is matched to its hero on both sides, shifted by a few pixels and greyed out', () => {
  const heroes = [11, 22, 33, 44, 55, 66].map((seed, i) => ({ code: 'c' + (1001 + i), P: portrait(seed, 170 + i * 9) }));
  const enemy = heroes.map((h) => ({ code: h.code, name: h.code, t: W.template(h.P.a, h.P.w, 89) }));
  const own = enemy.map((e) => ({ ...e, t: W.mirror(e.t) }));
  assert.ok(enemy.every((e) => e.t && e.t.n > 2000));
  for (const [side, tpls] of [['enemy', enemy], ['own', own]]) {
    for (const [dx, dy, fade] of [[0, 0, 1], [3, -2, 1], [-4, 4, 1], [1, 1, 0.35]]) {
      const r = W.match(W.patchFromRGBA(card(heroes[2].P, side, dx, dy, fade)), tpls);
      assert.equal(r.best.code, 'c1003', `${side} ${dx},${dy}`);
      assert.ok(r.best.score > 0.9 && W.isConfident(r), `${side} ${dx},${dy}: ${r.best.score.toFixed(2)} lead ${r.lead.toFixed(2)}`);
    }
  }
  // an empty card (flat) and a hero nobody has a portrait of: not confident
  assert.equal(W.isConfident(W.match(W.patchFromRGBA(new Uint8ClampedArray(W.BIG_W * W.BIG_H * 4).fill(40)), enemy)), false);
  assert.equal(W.isConfident(W.match(W.patchFromRGBA(card(portrait(999), 'enemy')), enemy)), false);
  // the card boxes are E7DaT's
  assert.deepEqual(W.slotBox('enemy', 4), { x: 0.53, y: 0.164 + 0.1389 * 4, w: 0.765 - 0.53, h: 0.124 });
});

test('draftscreen: a stage text is found inside its search area; red / blue tells whose turn', () => {
  const tw = 60, th = 16;
  const px = new Uint8Array(tw * th);
  for (let i = 0; i < px.length; i++) px[i] = (i * 37) % 11 < 4 ? 220 : 10; // "letters"
  const T = D.decode({ w: tw, h: th, px: Buffer.from(px).toString('base64') });
  const rw = 90, rh = 40, ox = 17, oy = 9;
  const g = new Float32Array(rw * rh).fill(12);
  const rgba = new Uint8ClampedArray(rw * rh * 4).fill(12);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const on = px[y * tw + x] > 100;
    g[(y + oy) * rw + x + ox] = on ? 150 : 12;
    const p = ((y + oy) * rw + x + ox) * 4;
    rgba[p] = on ? 230 : 12; rgba[p + 1] = on ? 40 : 12; rgba[p + 2] = on ? 40 : 12; // red text
  }
  const m = D.matchTemplate(g, rw, rh, T);
  assert.deepEqual([m.x, m.y], [ox, oy]);
  assert.ok(m.score > 0.99);
  const t = D.tint(rgba, rw, m.x, m.y, tw, th);
  assert.ok(t.rmb > 15 && t.tint > 0.25, 'red = the opponent\'s turn');
  assert.equal(D.acceptLabel({ labelMin: 0.8, labelColor: true }, m.score, t), true);
  assert.equal(D.acceptLabel({ labelMin: 0.8, labelColor: true }, m.score, { top: 200, tint: 0.02 }), false, 'white text is not a stage text');
  assert.equal(D.matchTemplate(new Float32Array(rw * rh).fill(50), rw, rh, T).score, 0, 'a flat area matches nothing');
});

test('draftscreen: a confirmed card has the solid blue band, a clicked one does not', () => {
  const w = 160, h = 64;
  const mk = (r, g, b) => { const a = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { a[i * 4] = r; a[i * 4 + 1] = g; a[i * 4 + 2] = b; a[i * 4 + 3] = 255; } return a; };
  assert.ok(D.lockScore(mk(20, 70, 200), w, h, 0) > 0.9);
  assert.ok(D.lockScore(mk(40, 45, 60), w, h, 0) < 0.05, 'dark, barely blue');
  assert.ok(D.lockScore(mk(200, 30, 30), w, h, 0) < 0.05, 'the enemy\'s red');
});

test('draftscreen: the tracker follows a draft (hover vs confirm, turn order, first pick, never loses a pick)', () => {
  const T = new D.Tracker();
  const no = [null, null, null, null, null];
  const sl = (own, enemy) => ({ own: own.map((c) => c && { code: c[0], sure: true, lock: c[1] }), enemy: enemy.map((c) => c && { code: c, sure: true }) });
  let t = 0;
  const look = (obs) => T.update((t += 700), { label: null, prebanPopup: false, firstPickMarker: null, slots: null, prebans: null, ...obs });
  // versus screen: the opponent picks first (needs two looks)
  look({ firstPickMarker: 'enemy' });
  assert.equal(look({ firstPickMarker: 'enemy' }).stage, 'versus');
  // pre-ban window
  assert.equal(look({ label: 'ready', prebanPopup: true }).stage, 'preban');
  // pre-ban icons: taken on the second identical read
  look({ label: 'ready', prebans: ['a', 'b', null, null] });
  assert.deepEqual(look({ label: 'ready', prebans: ['a', 'b', 'x', null] }).prebans, ['a', 'b', null, null]);
  // opponent's first turn
  let st = look({ label: 'turn_enemy', slots: sl(no, ['e1', null, null, null, null]) });
  assert.deepEqual([st.stage, st.turn, st.turnIndex, st.firstPick], ['pick', 'enemy', 1, 'enemy']);
  st = look({ label: 'turn_enemy', slots: sl(no, ['e1', null, null, null, null]) });
  assert.equal(st.enemy[0], 'e1');
  // my turn: I click m1 (not confirmed) -> held, not a pick
  look({ label: 'turn_me', slots: sl([['m1', false], null, null, null, null], ['e1', null, null, null, null]) });
  st = look({ label: 'turn_me', slots: sl([['m1', false], null, null, null, null], ['e1', null, null, null, null]) });
  assert.deepEqual([st.own[0], st.held[0], st.turnIndex], [null, 'm1', 2]);
  // I change my mind to m2 and confirm it (blue band on two looks)
  look({ label: 'turn_me', slots: sl([['m2', true], null, null, null, null], ['e1', null, null, null, null]) });
  st = look({ label: 'turn_me', slots: sl([['m2', true], null, null, null, null], ['e1', null, null, null, null]) });
  assert.equal(st.own[0], 'm2');
  // second card only clicked when my turn ends: it was my pick
  look({ label: 'turn_me', slots: sl([null, ['m3', false], null, null, null], no) });
  look({ label: 'turn_me', slots: sl([null, ['m3', false], null, null, null], no) });
  st = look({ label: 'turn_enemy', slots: null });
  assert.deepEqual([st.own[1], st.turnIndex, st.turn], ['m3', 3, 'enemy']);
  // a bad look (nothing recognised) never removes picks; a hero already on another card is ignored
  st = look({ label: 'turn_enemy', slots: sl(no, [null, 'm2', null, null, null]) });
  st = look({ label: 'turn_enemy', slots: sl(no, [null, 'm2', null, null, null]) });
  assert.deepEqual([st.own.slice(0, 2), st.enemy.slice(0, 2)], [['m2', 'm3'], ['e1', null]]);
  // ban stage, then the texts disappear for 10 s: the draft ends and is handed over
  assert.equal(look({ label: 'ban' }).stage, 'ban');
  t += 11000;
  st = look({});
  assert.ok(st.ended && st.stage === 'idle');
  assert.deepEqual(st.last.own.slice(0, 2), ['m2', 'm3']);
  // the app's board: picks in order, pre-bans split, first pick in the app's words
  const b = D.toBoard(st.last);
  assert.deepEqual(b, { prebans: { me: ['a', 'b'], opp: [] }, picks: { me: ['m2', 'm3'], opp: ['e1'] }, postbans: { me: [], opp: [] }, firstPick: 'opp' });
  // a card not read BEFORE cards that were read: an unknown hero, the later picks still count (DEVLOG #66)
  const gap = D.toBoard({ ...st.last, own: [null, 'k1', null, 'k3', 'k4'], enemy: [null, null, null, null, 'z4'], prebans: [null, null, null, null], bans: { own: null, enemy: null } });
  assert.deepEqual(gap.picks.me.map((c) => (L.isUnseen(c) ? '?' : c)), ['?', 'k1', '?', 'k3', 'k4']);
  assert.deepEqual(gap.picks.opp.map((c) => (L.isUnseen(c) ? '?' : c)), ['?', '?', '?', '?', 'z4']);
  const gd = L.boardToDraft(gap, 'me');
  assert.deepEqual(L.draftView(gd).picks, { me: ['k1', 'k3', 'k4'], opp: ['z4'] }, 'the heroes that were read reach the draft');
  assert.equal(L.currentStep(gd).phase, 'postban', 'all ten picks taken, the draft is at the bans');
  // ...and the draft model accepts it even though two pre-bans were never seen
  const d = L.boardToDraft(b, b.firstPick);
  assert.deepEqual(L.draftView(d).picks, { me: ['m2', 'm3'], opp: ['e1'] });
  assert.deepEqual(L.draftView(d).prebans, { me: ['a', 'b'], opp: [] });
});

test('draftscreen: my pre-bans from the pre-ban window, both bans from the darkened cards (DEVLOG #63)', () => {
  const T = new D.Tracker();
  let t = 0;
  const look = (obs) => T.update((t += 700), { label: null, prebanPopup: false, firstPickMarker: null, slots: null, prebans: null, ...obs });
  const sl = (own, enemy) => ({ own: own.map((c) => c && { code: c, sure: true, lock: true }), enemy: enemy.map((c) => c && { code: c, sure: true }) });
  // the pre-ban window: one hero selected, then changed, then two (each needs two looks; not final)
  look({ label: 'ready', prebanPopup: true, prebanPicks: ['a', null] });
  assert.deepEqual(look({ label: 'ready', prebanPopup: true, prebanPicks: ['a', null] }).prebans, ['a', null, null, null]);
  look({ label: 'ready', prebanPopup: true, prebanPicks: ['c', 'b'] });
  assert.deepEqual(look({ label: 'ready', prebanPopup: true, prebanPicks: ['c', 'b'] }).prebans, ['c', 'b', null, null], 'the selection replaced the earlier one');
  // the draft's own row shows them in another order, plus the opponent's: the row wins, nothing is doubled
  look({ label: 'turn_me', prebans: ['b', null, 'x', 'y'] });
  assert.deepEqual(look({ label: 'turn_me', prebans: ['b', null, 'x', 'y'] }).prebans, ['b', 'c', 'x', 'y']);
  assert.deepEqual(look({ label: 'turn_me', prebans: ['b', 'c', 'x', 'y'] }).prebans, ['b', 'c', 'x', 'y']);
  // ten picks
  const own = ['m1', 'm2', 'm3', 'm4', 'm5'];
  const enemy = ['e1', 'e2', 'e3', 'e4', 'e5'];
  look({ label: 'ban', slots: sl(own, enemy) });
  let st = look({ label: 'ban', slots: sl(own, enemy) });
  assert.deepEqual([st.own, st.enemy], [own, enemy]);
  // BAN stage: a dark card is only what I clicked -> no ban yet
  const dark = (o, e) => ({ own: [0, 1, 2, 3, 4].map((i) => i === o), enemy: [0, 1, 2, 3, 4].map((i) => i === e) });
  look({ label: 'ban', banned: dark(-1, 3) });
  assert.deepEqual(look({ label: 'ban', banned: dark(-1, 3) }).bans, { own: null, enemy: null });
  // formation: one darkened card on each side, twice
  look({ label: 'ready', banned: dark(4, 0) });
  st = look({ label: 'ready', banned: dark(4, 0) });
  assert.deepEqual(st.bans, { own: 'm5', enemy: 'e1' });
  assert.deepEqual(D.toBoard(st).postbans, { me: ['e1'], opp: ['m5'] }, 'postbans.me = their hero I banned');
  // the third pick cannot be banned, and two dark cards on a side are no answer
  const T2 = new D.Tracker();
  const look2 = (obs) => T2.update((t += 700), { label: null, prebanPopup: false, firstPickMarker: null, slots: null, prebans: null, ...obs });
  look2({ label: 'ban', slots: sl(own, enemy) });
  look2({ label: 'ban', slots: sl(own, enemy) });
  look2({ label: 'ready', banned: { own: [false, false, true, false, false], enemy: [true, true, false, false, false] } });
  assert.deepEqual(look2({ label: 'ready', banned: { own: [false, false, true, false, false], enemy: [true, true, false, false, false] } }).bans, { own: null, enemy: null });
});

test('draftscreen: a banned card is dark with nothing bright in it (numbers from the real formation screen)', () => {
  const w = 160, h = 48;
  const mk = (f) => {
    const a = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = f(x, y); const p = (y * w + x) * 4; a[p] = a[p + 1] = a[p + 2] = v; a[p + 3] = 255; }
    return a;
  };
  const banned = D.cardLook(mk((x) => (x % 5 < 3 ? 35 : 70)), w, h, 'enemy'); // dark, some mid-grey, nothing bright
  assert.ok(D.isBannedLook(banned), JSON.stringify(banned));
  const normal = D.cardLook(mk((x) => (x % 5 < 1 ? 40 : x % 5 < 3 ? 110 : 200)), w, h, 'own');
  assert.ok(!D.isBannedLook(normal) && normal.bright > 0.3);
  const faded = D.cardLook(mk(() => 100), w, h, 'own'); // a card that cannot be banned: faded, not dark
  assert.ok(!D.isBannedLook(faded));
  assert.ok(!D.isBannedLook(null));
  // empty cards (DEVLOG #64): flat and colourless; a banned card is not empty
  assert.ok(D.isEmptyLook(D.cardLook(mk((x) => (x % 4 ? 30 : 45)), w, h, 'enemy')), 'an empty card');
  assert.ok(!D.isEmptyLook(normal));
  assert.ok(D.isEmptyLook({ spread: 23, sat: 7 }), 'an empty card seen a little off its place');
  assert.ok(D.isEmptyLook({ spread: 26, sat: 9 }), 'the empty "Ban Protection" placeholder');
  assert.ok(!D.isEmptyLook({ spread: 31, sat: 13 }), 'a faded hovered card has a hero');
  assert.ok(!D.isEmptyLook({ spread: 19, sat: 30 }), 'a banned card has a hero');
  assert.ok(!D.isEmptyLook(null));
});

test('draftscreen: the battle bar (names, servers, the same guild on both sides)', () => {
  assert.deepEqual(D.battleLine('Global @ Tester', 'l'), { name: 'Tester', server: 'Global' });
  assert.deepEqual(D.battleLine('Rival_77 ® Global', 'r'), { name: 'Rival_77', server: 'Global' });
  assert.deepEqual(D.battleLine('Asia (@) Tester |', 'l'), { name: 'Tester', server: 'Asia' });
  assert.deepEqual(D.battleLine('Tester', 'l'), { name: 'Tester', server: '' }, 'the server faded out: the name alone');
  assert.deepEqual(D.battleLine('', 'r'), { name: '', server: '' });
  assert.equal(D.guildKey('Moon Fall @'), 'moonfall');
  assert.ok(D.sameGuild('Moonfall', 'moonfall'));
  assert.ok(D.sameGuild('Rh Moonfall', 'Moonfall'), 'something read along on the outer side of mine');
  assert.ok(D.sameGuild('Moonfall', 'Moonfall ..x'), '...or of theirs');
  assert.ok(!D.sameGuild('Moonfall', 'Sunrise'));
  assert.ok(!D.sameGuild('Moonfall', 'fall'), 'a piece on the wrong side is not the same guild');
  assert.ok(!D.sameGuild('', ''), 'no guild on either side');
  assert.ok(!D.sameGuild('AB', 'AB'), 'too short to be sure');
  // the "VS" sign: flame-coloured
  const px = (r, g, b, n) => { const a = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) a.set([r, g, b, 255], i * 4); return a; };
  assert.ok(D.vsFlame(px(240, 120, 30, 100)) > 0.9);
  assert.ok(D.vsFlame(px(200, 30, 30, 100)) < 0.01, 'plain red (an enemy card) is not the flame');
  assert.ok(D.vsFlame(px(20, 20, 20, 100)) < 0.01);
});

test('draftscreen: turn order and pre-ban icon boxes (E7DaT layout)', () => {
  assert.deepEqual(D.TURN_SLOTS[3], ['first', [1, 2]]);
  assert.equal(D.BAN_GUARD_SLOT, 2);
  const b = D.prebanBox(0);
  assert.ok(Math.abs(b.x + b.w / 2 - 0.3146) < 1e-9 && Math.abs(b.y + b.h / 2 - 0.9438) < 1e-9);
});
