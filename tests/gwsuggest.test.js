// DEVLOG #104: what to attack a Guild War defense with, from your own heroes
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/gwsuggest.js');

// a tiny stand-in for the top-player model: hero strength, pairs, matchups
const model = {
  b: { a1: 0.1, a2: 0.05, a3: 0, a4: 0.2, a5: 0, a6: 0, a7: 0 },
  ctr: { 'a1>d1': 0.15, 'a2>d2': 0.12, 'a3>d3': 0.1, 'a4>d1': -0.3, 'a5>e1': 0.2, 'a6>e2': 0.18, 'a7>e3': 0.1 },
  syn: { 'a1|a2': 0.05 },
  hero(c) { return this.b[c] || 0; },
  ctrOf(a, b) { return this.ctr[`${a}>${b}`] || (this.ctr[`${b}>${a}`] ? -this.ctr[`${b}>${a}`] : 0); },
  synOf(a, b) { return this.syn[`${a}|${b}`] || this.syn[`${b}|${a}`] || 0; },
  pp(v) { return Math.round(v * 250) / 10; },
};
const pool = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'];

test('the best team for one defense: matchups first, a hero that is weak against it left out; reasons named', () => {
  const r = S.suggest(['d1', 'd2', 'd3'], pool, { model, top: 3 });
  assert.deepEqual(r[0].team.slice().sort(), ['a1', 'a2', 'a3']);
  assert.ok(!r[0].team.includes('a4')); // strong on its own, but countered by d1
  assert.ok(r[0].reasons.some((x) => x.source === 'top players' && /good vs d1/.test(x.text)));
  assert.ok(r[0].reasons.some((x) => /work well together/.test(x.text)));
  // the next suggestions are other teams, not the same two heroes again
  assert.ok(r.slice(1).every((t) => t.team.filter((c) => r[0].team.includes(c)).length < 2));
});

test('both defense teams: no hero used twice', () => {
  const r = S.suggestBoth([['d1', 'd2', 'd3'], ['e1', 'e2', 'e3']], pool, { model });
  const [t1, t2] = r.teams;
  assert.ok(t1 && t2);
  assert.ok(!t1.team.some((c) => t2.team.includes(c)));
  assert.ok(t2.team.includes('a5') && t2.team.includes('a6')); // the two that beat e1 and e2
  assert.deepEqual(r.basis, ['top players']);
});

test('with hero knowledge only (no top-player model on this PC): its notes decide, named as such', () => {
  const know = { notesFor: (c) => ({ good: c === 'a5' ? [{ text: 'removes buffs (vs d1)', value: 1 }] : [], bad: c === 'a1' ? [{ text: 'd1: blocks debuffs', value: -1.2 }] : [], score: c === 'a5' ? 1 : c === 'a1' ? -1.2 : 0 }) };
  const r = S.suggest(['d1', 'd2', 'd3'], pool, { know, top: 1 });
  assert.ok(r[0].team.includes('a5'));
  assert.ok(!r[0].team.includes('a1'));
  assert.equal(r[0].reasons.find((x) => /removes buffs/.test(x.text)).source, 'E7DaT knowledge');
  // nothing to go on: nothing suggested
  assert.deepEqual(S.suggest(['d1', 'd2', 'd3'], pool, {}), []);
  assert.deepEqual(S.suggest(['d1'], pool, { model }), []);
});
