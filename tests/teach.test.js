// js/teach.js: hero faces taught by the owner (DEVLOG #35)
const test = require('node:test');
const assert = require('node:assert');
const { make, KEY } = require('../js/teach.js');
const F = require('../js/faces.js');

function mem() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const face = (seed) => {
  const v = new Float32Array(F.N ? F.N * F.N * 3 : 1024).map((_, i) => Math.sin(i * seed));
  return F.quantize(v);
};

test('teach: add, list per hero, templates with their own source label, switch off', () => {
  const T = make(mem());
  assert.strictEqual(T.list().length, 0);
  T.add({ code: 'c1071', q: face(1), from: 'a picture' });
  T.add({ code: 'c1071', q: face(2) });
  T.add({ code: 'c1172', q: face(3) });
  assert.strictEqual(T.byHero().get('c1071').length, 2);
  const tp = T.templates(F);
  assert.strictEqual(tp.length, 3);
  assert.ok(tp.every((t) => t.source === 'taught by you' && t.vec.length > 0));
  T.setEnabled(false);
  assert.deepStrictEqual(T.templates(F), []);
  assert.strictEqual(T.list().length, 3, 'switching off keeps the examples');
  T.setEnabled(true);
  T.remove(T.list()[0].id);
  assert.strictEqual(T.list().length, 2);
  assert.throws(() => T.add({ code: 'c1', q: null }));
});

test('teach: keeps the newest examples per hero', () => {
  const T = make(mem());
  for (let i = 0; i < T.MAX_PER_HERO + 3; i++) T.add({ code: 'c1', q: face(i + 1), from: `#${i}` });
  const list = T.list();
  assert.strictEqual(list.length, T.MAX_PER_HERO);
  assert.strictEqual(list[0].from, '#3');
});

test('teach: export / import (backup or share), no duplicates, bad files refused', () => {
  const A = make(mem());
  A.add({ code: 'c1', q: face(1), thumb: 'data:image/jpeg;base64,xx' });
  A.add({ code: 'c2', q: face(2), thumb: 'javascript:alert(1)' });
  const B = make(mem());
  assert.strictEqual(B.importJSON(A.exportJSON()), 2);
  assert.strictEqual(B.importJSON(A.exportJSON()), 0, 'same ids are skipped');
  assert.strictEqual(B.list()[0].thumb, 'data:image/jpeg;base64,xx');
  assert.ok(!B.list().some((x) => /javascript/.test(x.thumb)));
  assert.throws(() => B.importJSON('{"hello":1}'));
  assert.strictEqual(KEY, 'e7-face-examples');
});

test('teach: change listeners', () => {
  const T = make(mem());
  let n = 0;
  const off = T.onChange(() => n++);
  T.add({ code: 'c1', q: face(1) });
  off();
  T.clear();
  assert.strictEqual(n, 1);
});
