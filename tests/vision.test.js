const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../js/vision.js');
const L = require('../js/logic.js');

// Deterministic pseudo-random "portrait" pixels.
function img(seed, { brightness = 0, noise = 0, flat = false } = {}) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const px = new Uint8ClampedArray(V.SIZE * V.SIZE * 4);
  for (let i = 0; i < px.length; i += 4) {
    for (let c = 0; c < 3; c++) px[i + c] = flat ? 40 : rnd() * 200 + brightness + (noise ? (Math.random() - 0.5) * noise : 0);
    px[i + 3] = 255;
  }
  return px;
}

test('feature vectors are unit length and brightness-invariant', () => {
  const a = V.featureFromRGBA(img(1));
  const b = V.featureFromRGBA(img(1, { brightness: 40 }));
  assert.ok(Math.abs(V.similarity(a.vec, a.vec) - 1) < 1e-5);
  assert.ok(V.similarity(a.vec, b.vec) > 0.98);
});

test('classify finds the right hero through noise, reports empty slots', () => {
  const templates = [1, 2, 3, 4, 5].map((n) => ({ code: 'c' + n, vec: V.featureFromRGBA(img(n)).vec, source: 'official' }));
  const r = V.classify(V.featureFromRGBA(img(3, { noise: 60 })), templates);
  assert.equal(r.best.code, 'c3');
  assert.ok(V.isConfident(r));
  assert.equal(V.classify(V.featureFromRGBA(img(9, { flat: true })), templates).empty, true);
  // unrelated image is not confident
  assert.equal(V.isConfident(V.classify(V.featureFromRGBA(img(77)), templates)), false);
  // allow-list restricts candidates
  assert.notEqual(V.classify(V.featureFromRGBA(img(3)), templates, { allow: new Set(['c1', 'c2']) }).best.code, 'c3');
});

test('learned corrections are preferred and survive quantization', () => {
  const official = { code: 'wrong', vec: V.featureFromRGBA(img(5)).vec, source: 'official' };
  const shot = V.featureFromRGBA(img(5, { noise: 30 }));
  const learned = { code: 'right', vec: V.dequantize(V.quantize(shot.vec)), source: 'my corrections' };
  const r = V.classify(shot, [official, learned], { preferSource: 'my corrections' });
  assert.equal(r.best.code, 'right');
  assert.equal(r.best.source, 'my corrections');
});

test('slot layout interpolates 5 pick slots between first and last box', () => {
  const regions = {
    mePreban1: { x: 0, y: 0, w: 0.1, h: 0.1 }, mePreban2: { x: 0.1, y: 0, w: 0.1, h: 0.1 },
    oppPreban1: { x: 0.8, y: 0, w: 0.1, h: 0.1 }, oppPreban2: { x: 0.9, y: 0, w: 0.1, h: 0.1 },
    mePickFirst: { x: 0, y: 0.2, w: 0.1, h: 0.1 }, mePickLast: { x: 0, y: 0.6, w: 0.1, h: 0.1 },
    oppPickFirst: { x: 0.9, y: 0.2, w: 0.1, h: 0.1 }, oppPickLast: { x: 0.9, y: 0.6, w: 0.1, h: 0.1 },
  };
  assert.ok(V.isCalibrated(regions));
  const slots = V.slotLayout(regions);
  assert.equal(slots.length, 14);
  const p = slots.filter((s) => s.side === 'me' && s.kind === 'pick');
  assert.deepEqual(p.map((s) => +s.rect.y.toFixed(2)), [0.2, 0.3, 0.4, 0.5, 0.6]);
  assert.equal(V.isCalibrated({ ...regions, oppPickLast: undefined }), false);
});

test('OCR name cleaning', () => {
  assert.equal(V.cleanName('  Rival|One \n'), 'RivalOne');
  assert.equal(V.cleanName('라이벌'), '라이벌');
  assert.equal(V.cleanName('x'), '');
});

test('boardToDraft replays in official order and never skips ahead', () => {
  const board = { prebans: { me: ['a', 'b'], opp: ['c', 'd'] }, picks: { me: ['e', 'h', 'i'], opp: ['f', 'g'] }, postbans: {} };
  const d = L.boardToDraft(board, 'me');
  assert.deepEqual(L.draftView(d).picks, { me: ['e', 'h', 'i'], opp: ['f', 'g'] });
  // a misread 4th slot for opp with no 2nd... e.g. opp has 1 pick only -> stops after it
  const d2 = L.boardToDraft({ ...board, picks: { me: ['e', 'h', 'i'], opp: ['f'] } }, 'me');
  assert.deepEqual(L.draftView(d2).picks, { me: ['e'], opp: ['f'] });
  // duplicate hero (misread) stops replay
  const d3 = L.boardToDraft({ ...board, picks: { me: ['e'], opp: ['e', 'g'] } }, 'me');
  assert.deepEqual(L.draftView(d3).picks, { me: ['e'], opp: [] });
  // only opp prebans visible -> nothing applied yet (prebans reveal together)
  assert.equal(L.boardToDraft({ prebans: { me: [], opp: ['c', 'd'] }, picks: {} }, 'me').actions.length, 0);
  assert.equal(L.inferFirstPick({ picks: { me: [], opp: ['x'] } }), 'opp');
  assert.equal(L.inferFirstPick({ picks: { me: ['y'], opp: ['x'] } }), null);
});

test('confidence: high score + small lead, or lower score + big lead', () => {
  const r = (a, b) => ({ empty: false, best: { sim: a }, second: b == null ? null : { sim: b } });
  assert.equal(V.isConfident(r(0.9, 0.89)), false); // look-alikes (e.g. two versions of a hero)
  assert.equal(V.isConfident(r(0.9, 0.8)), true);
  assert.equal(V.isConfident(r(0.68, 0.51)), true); // clear winner, lower score
  assert.equal(V.isConfident(r(0.68, 0.6)), false);
  assert.equal(V.isConfident(r(0.5, 0.1)), false); // too low whatever the lead
});

test('game drafting-help strip: N evenly spaced icons between first and last', () => {
  const regions = { helpFirst: { x: 0.3, y: 0.8, w: 0.05, h: 0.08 }, helpLast: { x: 0.5, y: 0.8, w: 0.05, h: 0.08 } };
  const s = V.helpSlots(regions, 5);
  assert.equal(s.length, 5);
  assert.deepEqual(s.map((x) => +x.rect.x.toFixed(2)), [0.3, 0.35, 0.4, 0.45, 0.5]);
  assert.equal(s[0].side, 'help');
  assert.deepEqual(V.helpSlots({}, 5), []);
});
