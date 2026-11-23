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

test('every team has a damage dealer (DEVLOG #105: a knight and two soul weavers was suggested)', () => {
  // the three best matchups are all supports; the damage dealers do less against this defense
  const m = {
    hero: () => 0,
    ctrOf: (a, b) => ({ 'k1>d1': 0.3, 's1>d2': 0.3, 's2>d3': 0.3, 'x1>d1': 0.05, 'x2>d2': 0.02 })[`${a}>${b}`] || 0,
    synOf: () => 0,
  };
  const roles = { k1: 'knight', s1: 'manauser', s2: 'manauser', x1: 'assassin', x2: 'mage' };
  const pool = Object.keys(roles);
  // without classes: the three supports
  assert.deepEqual(S.suggest(['d1', 'd2', 'd3'], pool, { model: m, top: 1 })[0].team.slice().sort(), ['k1', 's1', 's2']);
  // with classes: always one who deals the damage
  const r = S.suggest(['d1', 'd2', 'd3'], pool, { model: m, top: 3, roleOf: (c) => roles[c] });
  assert.ok(r.length && r.every((t) => t.team.some((c) => S.DAMAGE.has(roles[c]))));
  assert.ok(r[0].team.includes('x1'));
  // a damage dealer far down the list is still among the candidates
  const many = Object.fromEntries([...Array(14)].map((_, i) => [`s${i + 10}`, 'manauser']));
  const m2 = { ...m, ctrOf: (a, b) => (a.startsWith('s') && b === 'd1' ? 0.2 : a === 'x9' && b === 'd2' ? 0.01 : 0) };
  const r2 = S.suggest(['d1', 'd2', 'd3'], [...Object.keys(many), 'x9'], { model: m2, top: 1, roleOf: (c) => many[c] || 'ranger' });
  assert.ok(r2[0].team.includes('x9'));
});

test('Guild War itself counts (DEVLOG #106): the guild\'s own attacks and my 👍 / 👎 move heroes up or down', () => {
  const m = { hero: () => 0, ctrOf: (a, b) => ({ 'x1>d1': 0.05, 'x2>d2': 0.05, 'x3>d3': 0.05, 'x4>d1': 0.04 })[`${a}>${b}`] || 0, synOf: () => 0 };
  const pool = ['x1', 'x2', 'x3', 'x4'];
  const base = S.suggest(['d1', 'd2', 'd3'], pool, { model: m, top: 1 })[0].team;
  assert.ok(!base.includes('x4'));
  // x4 wins its Guild War attacks, x1 keeps losing: x4 in, x1 out
  const gwRecord = new Map([['x4', { wins: 9, games: 10 }], ['x1', { wins: 1, games: 8 }]]);
  const r = S.suggest(['d1', 'd2', 'd3'], pool, { model: m, top: 1, gwRecord })[0];
  assert.ok(r.team.includes('x4') && !r.team.includes('x1'));
  assert.ok(r.reasons.some((x) => x.source === 'guild records' && /won 9 of 10/.test(x.text)));
  // my 👎 on x2 for Guild War: out; 👍 on x1: in, named as my notes
  const mine = { x2: -1, x1: 1 };
  const r2 = S.suggest(['d1', 'd2', 'd3'], pool, { model: m, top: 1, mine })[0];
  assert.ok(!r2.team.includes('x2') && r2.team.includes('x1'));
  assert.ok(r2.reasons.some((x) => x.source === 'my notes' && /good in Guild War/.test(x.text)));
  // from the guild's attacks: wins and games per hero
  const G = require('../js/guildwar.js');
  const rec = G.heroAttackRecord({ attacks: [{ heroes: ['a', 'b'], result: 'win' }, { heroes: ['a'], result: 'loss' }] });
  assert.deepEqual(rec.get('a'), { wins: 1, games: 2 });
  assert.deepEqual(rec.get('b'), { wins: 1, games: 1 });
});
