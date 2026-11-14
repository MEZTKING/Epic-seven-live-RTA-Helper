// js/knowledge.js: hero mechanics as their own suggestion source ('E7DaT knowledge'), DEVLOG #42.
const test = require('node:test');
const assert = require('node:assert/strict');
const { create, SOURCE } = require('../js/knowledge.js');
const L = require('../js/logic.js');
const REAL = require('../js/sources/e7dat-knowledge.js');

// a tiny knowledge set: A blocks revive, B revives; S is a strict (artifact) rule
const DATA = {
  date: '2026-01-01',
  labels: { ANTIREV: 'blocks revive', REVIVE: 'revive', CATCH: 'turn catch', FIRST: 'first-turn hero', CLEANSE: 'cleanse', CC: 'crowd control' },
  rules: [
    { by: 'ANTIREV', on: 'REVIVE', text: 'prevents revive', hurt: 'revive is blocked', warn: true, strict: false },
    { by: 'CATCH', on: 'FIRST', text: 'moves right after the first turn', hurt: 'the enemy catches up', warn: true, strict: true },
    { by: 'CLEANSE', on: 'CC', text: 'removes the debuffs', hurt: '', warn: false, strict: false },
  ],
  tags: { a: ['ANTIREV'], b: ['REVIVE'], b2: ['REVIVE'], b3: ['REVIVE'], c: ['CATCH'], f: ['FIRST'], f2: ['FIRST'], h: ['CLEANSE'], x: ['CC'] },
  tagFromArtifact: { c: { CATCH: 'Some Artifact' } },
  hurt: { b2: { 0: [2.0, 1.1] }, b: { 0: [-3.1, -2.5] } }, // b2 still does well against anti-revive; b suffers
  lift: { a: { 0: [1.6, 500, null] }, h: { 2: [0.5, 300, null] } }, // top players pick a more vs revivers; h LESS vs CC
  pairLift: { c: { 1: { f: [4.2, 80] } } }, // the strict rule is only on record for c vs f
  pairAvoid: { b3: { 0: { a: [0.95, -0.2] } } }, // top players don't avoid a with b3
  variants: { a: [['Artifact One', ['Speed', 'Immunity'], 60, 55, 10]] },
  openers: [['f', 90, 80, 30]],
};
const H = (c) => ({ code: c, name: c.toUpperCase() });

test('knowledge: who blocks whom, with the record-based filters', () => {
  const K = create(DATA);
  assert.deepEqual(K.mechanics('c'), [{ tag: 'CATCH', label: 'turn catch', artifact: 'Some Artifact' }]);
  // picking the blocker against a reviver: a reason, stronger because top players pick it more there
  let n = K.notesFor('a', [], [H('b')]);
  assert.equal(n.good.length, 1);
  assert.match(n.good[0].text, /Prevents revive \(vs B\).*1\.6× more/);
  assert.equal(n.score, 1);
  // picking the reviver into the blocker: a caution, stronger because the records show it hurts
  n = K.notesFor('b', [], [H('a')]);
  assert.match(n.bad[0].text, /^A: revive is blocked \(-3\.1 pp/);
  assert.equal(n.score, -1.2);
  // ...but not when that hero still does well against it, or when top players don't avoid it
  assert.equal(K.notesFor('b2', [], [H('a')]).bad.length, 0);
  assert.equal(K.notesFor('b3', [], [H('a')]).bad.length, 0);
  // a strict rule only counts for the pair on record
  assert.equal(K.notesFor('c', [], [H('f')]).good.length, 1);
  assert.equal(K.notesFor('c', [], [H('f2')]).good.length, 0);
  // a reason the records contradict (picked half as often there) is dropped; a non-warning rule never cautions
  assert.equal(K.notesFor('h', [], [H('x')]).good.length, 0);
  assert.equal(K.notesFor('x', [], [H('h')]).bad.length, 0);
  // what a defense brings; builds; opener
  assert.deepEqual(K.threats(['a', 'b', 'c']).map((t) => t.code + ':' + t.label), ['a:blocks revive', 'c:turn catch']);
  assert.deepEqual(K.builds('a'), [{ artifact: 'Artifact One', sets: ['Speed', 'Immunity'], share: 60, startCR: 55, guard: 10 }]);
  assert.deepEqual(K.opener('f'), { fastest: 90, available: 80, top3: 30 });
  assert.equal(K.opener('a'), null);
});

test('knowledge: the suggestion engine adds labelled reasons and cautions, and the source can be switched off', () => {
  const K = create(DATA);
  const heroes = ['a', 'b'].map((c) => ({ code: c, name: c.toUpperCase(), element: 'fire', role: 'warrior' }));
  const pick = (code, enemy, ctx) => L.scoreCandidate(heroes.find((h) => h.code === code), [], [heroes.find((h) => h.code === enemy)], { useElement: false, ...ctx }, { side: 'me' });
  const withK = pick('b', 'a', { knowledge: K });
  assert.equal(withK.score, -1.2);
  assert.deepEqual(withK.reasons.map((r) => r.source), [SOURCE]);
  assert.equal(pick('b', 'a', {}).score, 0, 'no knowledge given: nothing added');
  assert.equal(pick('b', 'a', { knowledge: K, sourceWeights: { [SOURCE]: 0 } }).score, 0, 'weight 0 = off');
  assert.ok(L.SOURCE_GROUPS.includes(SOURCE));
});

test('knowledge: the real file loads and reads sensibly', () => {
  const K = create(REAL);
  assert.ok(K.heroes > 250 && REAL.rules.length === 23);
  // Boss Arunka (c2124) guards the front line; Kawerik (c1073) relies on a single-target key skill
  assert.ok(K.mechanics('c2124').some((m) => m.tag === 'FRONT'));
  const n = K.notesFor('c1073', [], [{ code: 'c2124', name: 'Boss Arunka' }]);
  assert.ok(n.bad.some((b) => /Boss Arunka: single-target key skill/.test(b.text)));
  // builds are translated (no Korean left)
  for (const list of Object.values(REAL.variants)) for (const v of list) assert.ok(!/[ㄱ-힝]/.test(v[0] + v[1].join('')), JSON.stringify(v));
  assert.ok(K.builds('c2124')[0].artifact.length > 2);
});
