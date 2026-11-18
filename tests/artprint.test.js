// js/artprint.js: the opponent's profile art on the RTA versus screen, remembered with their name (DEVLOG #70)
const test = require('node:test');
const assert = require('node:assert');
const A = require('../js/artprint.js');

const picture = (f) => {
  const n = A.FP_W * A.FP_H;
  const a = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const [r, g, b] = f(i % A.FP_W, Math.floor(i / A.FP_W));
    a.set([r, g, b, 255], i * 4);
  }
  return a;
};
const art1 = picture((x, y) => [x * 20, y * 12, 100]);
const art1b = picture((x, y) => [x * 20 + 3, y * 12 - 2, 104]); // the same art, a little different (scaling, JPEG)
const art2 = picture((x, y) => [200 - y * 10, 50, x * 18]);

test('artprint: the same art matches, another does not; card boxes sit on the centred versus screen', () => {
  const a = A.fingerprint(art1);
  assert.ok(A.similarity(a, A.fingerprint(art1b)) > 0.99);
  assert.ok(A.similarity(a, A.fingerprint(art2)) < 0.5);
  const b = A.cardBox('opp', 2000, 1070);
  assert.deepEqual([Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)], [1297, 285, 450, 675]);
  const m = A.cardBox('me', 2000, 1070);
  assert.equal(Math.round(m.x + m.w / 2), 478);
});

test('artprint: remembered with names, counted; looked up again; popular art lists every name', () => {
  const t = 1000;
  let list = A.remember([], A.fingerprint(art1), 'Rival_77', { server: 'Global' }, t);
  list = A.remember(list, A.fingerprint(art1b), 'Rival_77', {}, t + 1);
  list = A.remember(list, A.fingerprint(art1), 'OtherPlayer', {}, t + 2);
  list = A.remember(list, A.fingerprint(art2), 'Third', {}, t + 3);
  assert.equal(list.length, 2, 'one entry per art');
  const hit = A.lookup(list, A.fingerprint(art1b));
  assert.deepEqual(hit.names.map((x) => [x.name, x.n]), [['Rival_77', 2], ['OtherPlayer', 1]]);
  assert.equal(hit.names[0].server, 'Global');
  assert.equal(A.lookup(list, A.fingerprint(picture((x, y) => [y * 20, 100, 255 - x * 20]))), null, 'an art not seen before');
  assert.deepEqual(A.remember(list, null, 'x').length, 2, 'nothing to remember without a picture');
});
