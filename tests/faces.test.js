// Face matcher (js/faces.js): masking, normalisation, confidence rule, compact storage.
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/faces.js');

function face(seed, { shift = 0, gain = 1, noise = 0, icons = false } = {}) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const px = new Uint8ClampedArray(F.N * F.N * 4);
  for (let i = 0; i < F.N * F.N; i++) {
    const y = Math.floor(i / F.N);
    const x = i % F.N;
    for (let c = 0; c < 3; c++) px[i * 4 + c] = (rnd() * 180 + shift) * gain + (noise ? (Math.random() - 0.5) * noise : 0);
    // class/element icons and stars drawn on top: must not matter (they're outside the mask)
    if (icons && !F.MASK[y * F.N + x]) for (let c = 0; c < 3; c++) px[i * 4 + c] = 255;
    px[i * 4 + 3] = 255;
  }
  return px;
}

test('mask keeps the face and drops corners, icon corners and the star band', () => {
  const at = (x, y) => F.MASK[y * F.N + x];
  assert.equal(at(16, 14), 1); // centre
  assert.equal(at(0, 0), 0); // outside the circle
  assert.equal(at(4, 6), 0); // top-left class icon
  assert.equal(at(27, 6), 0); // top-right element icon
  assert.equal(at(16, 28), 0); // stars
  assert.ok(F.COUNT > 400 && F.COUNT < 700);
});

test('vectors ignore brightness/contrast changes and overlays outside the mask', () => {
  const a = F.vector(face(1));
  const b = F.vector(face(1, { shift: 30, gain: 0.8, icons: true }));
  let d = 0;
  for (let i = 0; i < a.vec.length; i++) d += a.vec[i] * b.vec[i];
  assert.ok(d > 0.9, `similarity ${d}`);
});

test('classify: right hero confidently through noise; unknown face is not confident; flat slot is empty', () => {
  const templates = [1, 2, 3, 4, 5, 6].map((n) => ({ code: 'c' + n, vec: F.vector(face(n)).vec, source: 'official' }));
  const r = F.classify([F.vector(face(4, { noise: 50 }))], templates);
  assert.equal(r.best.code, 'c4');
  assert.ok(F.isConfident(r), JSON.stringify({ s: r.best.score, l: r.lead }));
  assert.equal(F.isConfident(F.classify([F.vector(face(99))], templates)), false);
  const flat = new Uint8ClampedArray(F.N * F.N * 4).fill(40);
  assert.equal(F.classify([F.vector(flat)], templates).empty, true);
  // several variants of the same face: the best counts
  const r2 = F.classify([F.vector(face(77)), F.vector(face(2, { noise: 30 }))], templates);
  assert.equal(r2.best.code, 'c2');
  // allow-list
  assert.notEqual(F.classify([F.vector(face(4))], templates, { allow: new Set(['c1', 'c2']) }).best.code, 'c4');
});

test('confidence needs both a high score and a lead over the next hero', () => {
  const r = (score, second) => ({ empty: false, best: { score }, second: { score: second }, lead: score - second });
  assert.equal(F.isConfident(r(0.95, 0.7)), true);
  assert.equal(F.isConfident(r(0.95, 0.9)), false); // look-alikes
  assert.equal(F.isConfident(r(0.75, 0.3)), false); // too low
});

test('quantized corrections survive the round trip', () => {
  const v = F.vector(face(8)).vec;
  const back = F.dequantize(JSON.parse(JSON.stringify(F.quantize(v))));
  let d = 0;
  for (let i = 0; i < v.length; i++) d += v[i] * back[i];
  assert.ok(d > 0.999);
});

test('element badge colour: flame, drop, tree, star, moon; nothing clear = no filter', () => {
  const box = (rgb, frac = 0.5) => {
    const px = new Uint8ClampedArray(22 * 22 * 4);
    for (let i = 0; i < 22 * 22; i++) {
      const on = i % 22 < 22 * frac;
      px.set(on ? [...rgb, 255] : [10, 12, 20, 255], i * 4); // badge colour on a dark background
    }
    return px;
  };
  assert.equal(F.elementFromRGBA(box([240, 110, 30])).element, 'fire');
  assert.equal(F.elementFromRGBA(box([40, 150, 240])).element, 'ice');
  assert.equal(F.elementFromRGBA(box([70, 190, 60])).element, 'wind');
  assert.equal(F.elementFromRGBA(box([235, 200, 40])).element, 'light');
  assert.equal(F.elementFromRGBA(box([150, 70, 220])).element, 'dark');
  assert.equal(F.elementFromRGBA(box([240, 110, 30], 0.03)).element, null); // a few pixels isn't a badge
  const grey = new Uint8ClampedArray(22 * 22 * 4).fill(128);
  assert.equal(F.elementFromRGBA(grey).element, null);
  const heroes = [{ code: 'a', element: 'fire' }, { code: 'b', element: 'ice' }, { code: 'c', element: 'fire' }];
  assert.deepEqual([...F.elementAllow('fire', heroes)], ['a', 'c']);
  assert.equal(F.elementAllow(null, heroes), null);
});

test('class symbol: best learned example wins only with a clear lead; element + class narrow the heroes', () => {
  const v = (seed) => { const px = new Uint8ClampedArray(16 * 16 * 4); let s = seed; for (let i = 0; i < px.length; i += 4) { s = (s * 1103515245 + 12345) & 0x7fffffff; px[i] = px[i + 1] = px[i + 2] = (s % 255); px[i + 3] = 255; } return F.classVector(px); };
  const tpl = [{ role: 'ranger', vec: v(1) }, { role: 'mage', vec: v(2) }, { role: 'knight', vec: v(3) }];
  assert.equal(F.classFromVectors([v(9), v(2)], tpl).role, 'mage');
  assert.equal(F.classFromVectors([v(9)], tpl).role, null); // nothing like any symbol
  const heroes = [{ code: 'a', element: 'fire', role: 'mage' }, { code: 'b', element: 'fire', role: 'ranger' }, { code: 'c', element: 'ice', role: 'mage' }];
  assert.deepEqual([...F.badgeAllow('fire', 'mage', heroes)], ['a']);
  assert.deepEqual([...F.badgeAllow(null, 'mage', heroes)], ['a', 'c']);
  assert.deepEqual([...F.badgeAllow('fire', 'knight', heroes)], ['a', 'b']); // no fire knight known: element only
  assert.equal(F.badgeAllow(null, null, heroes), null);
});
