// js/arena.js: the game's arena (opponents, fights, record per defense), DEVLOG #71
const test = require('node:test');
const assert = require('node:assert');
const A = require('../js/arena.js');

test('arena: points, change and result words as the reader gets them', () => {
  assert.equal(A.points('5,036 pts.'), 5036);
  assert.equal(A.points('5.O17'), 5017);
  assert.equal(A.points('pts'), null);
  assert.equal(A.delta('10', true), 10);
  assert.equal(A.delta('▼ 7', false), -7);
  assert.equal(A.resultWord('VICTORY'), 'win');
  assert.equal(A.resultWord('V I C T 0 R Y'), 'win');
  assert.equal(A.resultWord('DEFEAT'), 'loss');
  assert.equal(A.resultWord('Battle'), null);
  assert.equal(A.defenseKey(['c3', 'c1', null, 'c2']), A.defenseKey(['c1', 'c2', 'c3']));
});

test('arena: fights logged once; record against a defense, by your team; advice', () => {
  const def = ['k', 'r', 'm', 'l'];
  let f = [];
  f = A.addFight(f, { opponent: 'RivalOne', defense: def, mine: ['a', 'b', 'c', 'd'], result: 'win', points: 5017, delta: 10 }, 1000);
  f = A.addFight(f, { opponent: 'RivalOne', defense: def, mine: ['a', 'b', 'c', 'd'], result: 'win', points: 5017, delta: 10 }, 30000);
  assert.equal(f.length, 1, 'the same result screen twice is one fight');
  f = A.addFight(f, { opponent: 'RivalOne', defense: ['l', 'm', 'r', 'k'], mine: ['a', 'b', 'x', 'y'], result: 'loss', points: 5009, delta: -8 }, 500000);
  f = A.addFight(f, { opponent: 'Other', defense: ['k', 'z', 'q', 'w'], mine: ['a'], result: 'win', points: 5019, delta: 10 }, 900000);
  const r = A.record(f, def);
  assert.deepEqual([r.wins, r.losses], [1, 1]);
  assert.deepEqual(r.teams.map((t) => [t.team.join(''), t.wins, t.losses]), [['abcd', 1, 0], ['abxy', 0, 1]]);
  const exact = A.advise({ heroes: ['m', 'l', 'k', 'r'] }, f);
  assert.equal(exact.text, '1–1 against this defense');
  const near = A.advise({ heroes: ['k', 'nope', 'z', 'n2'] }, f);
  assert.equal(near.known, 2);
  assert.ok(near.score > 0.5 && /2 of these heroes/.test(near.text), near.text);
  assert.equal(A.advise({ heroes: ['n1', 'n2', 'n3', 'n4'] }, f).score, null);
  assert.equal(A.heroRecord(f).get('k').wins, 2);
});
