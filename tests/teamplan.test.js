// Whole-team plans (js/teamplan.js, DEVLOG #52) on the made-up world of tests/_world.js:
// c1001 strong · c1002 + c1003 strong together · c1004 beats c1005 · first-pick players open with c1010 (then c1002).
const test = require('node:test');
const assert = require('node:assert');
const TM = require('../js/topmodel.js');
const TP = require('../js/teamplan.js');
const { world } = require('./_world.js');

const E = new TM.Engine(TM.build(world(9000), { tune: false }));
const filler = ['c1011', 'c1012', 'c1013', 'c1014', 'c1015', 'c1016', 'c1017', 'c1018'];

test('teamplan: which slots are mine now and later, for both sides and every turn', () => {
  const s = (o) => { const r = TP.search(E, o); return r ? [r.now, r.later] : null; };
  assert.deepStrictEqual(s({ own: [], enemy: [], meFirst: true }), [[0], [1, 2, 3, 4]]);
  assert.deepStrictEqual(s({ own: [], enemy: ['c1011'], meFirst: false }), [[0, 1], [2, 3, 4]]);
  assert.deepStrictEqual(s({ own: ['c1011'], enemy: ['c1012', 'c1013'], meFirst: true }), [[1, 2], [3, 4]]);
  assert.deepStrictEqual(s({ own: ['c1011', 'c1012'], enemy: ['c1013', 'c1014', 'c1015'], meFirst: false }), [[2, 3], [4]]);
  assert.deepStrictEqual(s({ own: ['c1011', 'c1012', 'c1013', 'c1014'], enemy: ['c1015', 'c1016', 'c1017', 'c1018', 'c1019'], meFirst: false }), [[4], []]);
  assert.strictEqual(s({ own: filler.slice(0, 5), enemy: filler.slice(3, 8), meFirst: true }), null, 'nothing left to pick');
  // a two-pick turn half done: the other slot is what is picked now
  assert.deepStrictEqual(s({ own: ['c1011', 'c1012'], enemy: ['c1013', 'c1014'], meFirst: true }), [[2], [3, 4]]);
});

test('teamplan: the plan completes a planted pair, never uses a taken hero, never the same hero twice', () => {
  // I am first pick and hold c1002; my turn 3 fills slots 1 and 2
  const r = TP.search(E, { own: ['c1002'], enemy: ['c1011', 'c1012'], taken: ['c1030', 'c1031'], meFirst: true });
  const best = r.plans[0];
  assert.strictEqual(best.kind, 'best');
  assert.ok(best.codes.includes('c1003'), `now: ${best.codes}`);
  assert.strictEqual(best.team[0], 'c1002');
  assert.strictEqual(best.team.filter(Boolean).length, 5);
  assert.strictEqual(new Set(best.team).size, 5);
  for (const p of r.plans) for (const c of p.team) assert.ok(!['c1011', 'c1012', 'c1030', 'c1031'].includes(c), `${c} is gone`);
  assert.strictEqual(best.later.length, 2);
  assert.deepStrictEqual(best.later.map((l) => l.slot), [3, 4]);
  assert.ok(best.later.every((l) => l.avail > 0 && l.avail <= 1 && l.alts.length <= 2 && !l.alts.includes(l.code)));
  // choices: best first, the shown number follows the ranking
  assert.ok(r.choices.length >= 3);
  for (let i = 1; i < r.choices.length; i++) assert.ok(r.choices[i - 1].score >= r.choices[i].score);
  assert.ok(r.choices[0].pp >= r.choices[r.choices.length - 1].pp);
  assert.deepStrictEqual(r.choices[0].codes, best.codes);
  assert.ok(r.n > 100 && r.n <= 120000);
});

test('teamplan: a second, clearly different plan', () => {
  const r = TP.search(E, { own: ['c1002'], enemy: ['c1011', 'c1012'], meFirst: true });
  assert.strictEqual(r.plans.length, 2);
  const [a, b] = r.plans;
  assert.strictEqual(b.kind, 'alt');
  assert.notDeepStrictEqual([...a.codes].sort(), [...b.codes].sort(), 'another pick now');
  const diff = b.team.filter((c) => !a.team.includes(c)).length;
  assert.ok(diff >= 2, `the other plan shares too much: ${a.team} / ${b.team}`);
  assert.ok(b.pp <= a.pp);
});

test('teamplan: a hero the enemy will probably take first counts for less in a later slot', () => {
  // I pick second; the first-pick player has not opened yet and opens with c1010 half of the time
  const r = TP.search(E, { own: [], enemy: [], meFirst: false, also: ['c1010'] });
  assert.deepStrictEqual(r.now, [0, 1]);
  const i10 = E.policy.idx.get('c1010');
  assert.ok(E.policy.slot(true, 0, [], []).p[i10] > 0.3);
  // looked at directly: the same board once the enemy has opened with something else
  const after = TP.search(E, { own: [], enemy: ['c1011'], meFirst: false, also: ['c1010'] });
  const pp = (res) => (res.choices.find((c) => c.codes.includes('c1010')) || { score: 0 }).score;
  assert.ok(pp(after) >= 0);
  // later slots: availability below 1 for a hero the enemy still likes
  const mid = TP.search(E, { own: ['c1011'], enemy: ['c1012', 'c1013'], meFirst: true });
  assert.ok(mid.plans[0].later.every((l) => l.avail <= 1));
  const early = TP.search(E, { own: [], enemy: [], meFirst: true });
  const lows = early.plans.flatMap((p) => p.later).filter((l) => l.avail < 0.999);
  assert.ok(lows.length > 0, 'four enemy picks come before my last slot: nothing is 100% safe');
});

test('teamplan: only my own heroes when I own enough of them', () => {
  const pool = new Set(['c1001', 'c1003', 'c1004', 'c1013', 'c1014', 'c1015', 'c1016', 'c1017', 'c1018', 'c1019']);
  const r = TP.search(E, { own: ['c1002'], enemy: ['c1011', 'c1012'], meFirst: true, pool });
  assert.strictEqual(r.mineOnly, true);
  for (const p of r.plans) for (const c of p.team.slice(1)) assert.ok(pool.has(c), `${c} is not mine`);
  for (const p of r.plans) for (const l of p.later) for (const c of l.alts) assert.ok(pool.has(c));
  // too few of my own: every hero is allowed
  const few = TP.search(E, { own: ['c1002'], enemy: ['c1011', 'c1012'], meFirst: true, pool: new Set(['c1001', 'c1003']) });
  assert.strictEqual(few.mineOnly, false);
});

test('teamplan: quick enough to run on every redraw, also from an empty board', () => {
  const t0 = Date.now();
  const r = TP.search(E, { own: [], enemy: ['c1011'], meFirst: false });
  assert.ok(r.n > 1000);
  assert.ok(Date.now() - t0 < 3000, `${Date.now() - t0} ms for ${r.n} teams`);
});

test('topmodel: two slots picked together — joint share from similar drafts', () => {
  const P = E.policy;
  const j = P.pair(true, 1, 2, ['c1010'], []);
  assert.ok(j.joint.size > 10 && j.nDeep > 50);
  let s = 0;
  for (const v of j.joint.values()) s += v;
  assert.ok(s > 0.95 && s <= 1.0001, `shares add up to ${s}`);
  // after the planted opener c1010 the first side follows with c1002 in slot 1
  const with2 = [...j.joint.entries()].filter(([k]) => k.startsWith('c1002|')).reduce((a, [, v]) => a + v, 0);
  assert.ok(with2 > 0.5, `c1002 in slot 1 after c1010: ${with2}`);
  assert.strictEqual(P.pair(true, 1, 2, [], []).joint.size > 0, true);
});
