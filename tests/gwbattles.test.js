// DEVLOG #107: Guild War battle records from every battle window read (also fights between other guilds)
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/gwbattles.js');
const ic = (code, sure = true) => ({ code, sure, score: 0.9 });
const team = (...cs) => cs.map((c) => ic(c));

test('a battle window becomes attack / defense rounds, from the attacker\'s side', () => {
  // the owner's "Defense Draw" window: the left player DEFENDED; round 1 their victory, round 2 their defeat
  const d = { type: 'defense', left: { name: 'Def1' }, right: { name: 'Att1' }, rounds: [
    { result: 'victory', left: team('d1', 'd2', 'd3'), right: team('a1', 'a2', 'a3') },
    { result: 'defeat', left: team('d4', 'd5', 'd6'), right: team('a4', 'a5', 'a6') },
  ] };
  const b = B.fromResult(d, 't');
  assert.equal(b.attacker, 'Att1');
  assert.equal(b.defender, 'Def1');
  assert.deepEqual(b.rounds.map((r) => [r.attack.join(), r.defense.join(), r.win]), [['a1,a2,a3', 'd1,d2,d3', false], ['a4,a5,a6', 'd4,d5,d6', true]]);
  // the left player attacking: their victory is the attack's
  const a = B.fromResult({ ...d, type: 'attack' });
  assert.deepEqual(a.rounds.map((r) => [r.attack.join(), r.win]), [['d1,d2,d3', true], ['d4,d5,d6', false]]);
  // a draw is not a win for the attacker; a round with fewer than 2 heroes sure is left out
  const x = B.fromResult({ type: 'attack', left: { name: 'A' }, right: { name: 'D' }, rounds: [{ result: 'draw', left: team('a1', 'a2', 'a3'), right: team('d1', 'd2', 'd3') }, { result: 'victory', left: [ic('a4'), ic('a5', false), null], right: team('d4', 'd5', 'd6') }] });
  assert.deepEqual(x.rounds.map((r) => r.win), [false]);
  assert.equal(B.fromResult({ type: 'attack', left: {}, right: {}, rounds: [] }), null);
});

test('records: the same battle once; what beat a defense (also a similar one); heroes as attackers', () => {
  const w = (att, def, win) => ({ type: 'attack', left: { name: 'A' + att.join('') }, right: { name: 'D' }, rounds: [{ result: win ? 'victory' : 'defeat', left: team(...att), right: team(...def) }] });
  let list = [];
  for (const d of [w(['a1', 'a2', 'a3'], ['d1', 'd2', 'd3'], true), w(['a1', 'a2', 'a3'], ['d1', 'd2', 'd3'], true), w(['b1', 'b2', 'b3'], ['d1', 'd2', 'x9'], true), w(['c1', 'c2', 'c3'], ['d1', 'd2', 'd3'], false)]) list = B.add(list, B.fromResult(d, 't'));
  assert.equal(list.length, 3); // the same battle read twice: once
  const s = B.suggest(['d3', 'd2', 'd1'], list);
  assert.deepEqual(s.map((x) => [x.attack.join(), x.wins, x.games, x.exact]), [['a1,a2,a3', 1, 1, true], ['b1,b2,b3', 1, 1, false]]);
  const h = B.heroRecord(list);
  assert.deepEqual(h.get('a1'), { wins: 1, games: 1 });
  assert.deepEqual(h.get('c1'), { wins: 0, games: 1 });
  assert.equal(B.book(list).get('d1+d2+d3').length, 2);
});
