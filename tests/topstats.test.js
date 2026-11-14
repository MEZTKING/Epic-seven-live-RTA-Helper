// Tables of the "Top players" statistics page (js/topstats.js, DEVLOG #47), on a small hand-made model.
const test = require('node:test');
const assert = require('node:assert/strict');
const TS = require('../js/topstats.js');
const TM = require('../js/topmodel.js');

const STATS = {
  meta: { format: TM.FORMAT, games: 1000, weightedGames: 800, latestDay: '2026-11-13', firstPickWr: 0.52, calib: 1, fpBias: 0, season: { code: 'ss21' }, backtest: { n: 200, accuracy: 0.57, logloss: 0.68, coinLogloss: 0.6931, bins: [] } },
  heroes: {
    A: { n: 400, wr: 0.56, b: 0.2, bf: 0.1, bs: -0.1, pick: 0.5, preban: 0.1, prebanPf: 0.02, prebanPs: 0.4, first: 0.3, banned: 0.2, qban: 0.2, slot: [0.5, 0.2, 0.1, 0.1, 0.1], cr: 80, fast: 0.4 },
    B: { n: 100, wr: 0.48, b: -0.1, bf: 0, bs: 0, pick: 0.15, preban: 0.3, prebanPf: 0.25, prebanPs: 0.05, first: 0.05, banned: 0.5, qban: 0.45, slot: [0, 0.2, 0.3, 0.3, 0.2] },
    C: { n: 0, wr: null, b: 0, bf: 0, bs: 0, pick: 0, preban: 0.6, prebanPf: 0.3, prebanPs: 0.3, first: 0, banned: 0, qban: 0.25, slot: [0, 0, 0, 0, 0] },
    D: { n: 50, wr: 0.5, b: 0, bf: 0, bs: 0, pick: 0.06, preban: 0, prebanPf: 0, prebanPs: 0, first: 0, banned: 0.1, qban: 0.2, slot: [0.2, 0.2, 0.2, 0.2, 0.2] },
  },
  syn: { 'A|B': [60, 0.3], 'A|D': [40, -0.2], 'B|D': [5, 0.9] },
  ctr: { 'A>B': [80, 0.25], 'B>D': [50, -0.4], 'A>D': [8, 0.9] },
  rule: {},
  drafts: { codes: ['A', 'B', 'C', 'D'], F: [], S: [], wf: [], w: [] },
};
const MODEL = new TM.Model(STATS);

test('topstats: overview and one row per hero', () => {
  const o = TS.overview(STATS);
  assert.equal(o.games, 1000);
  assert.equal(o.heroes, 3, 'C was only pre-banned, never played');
  assert.equal(o.check.accuracy, 0.57);
  assert.equal(TS.overview({ meta: { games: 5 } }).check, null);
  const rows = TS.heroes(STATS, MODEL);
  assert.equal(rows.length, 4);
  const a = rows.find((r) => r.code === 'A');
  assert.ok(a.pp > 4 && a.ppFirst > a.pp && a.ppSecond < a.pp, JSON.stringify(a));
  assert.equal(a.prebanSecond, 0.4);
  assert.equal(a.fast, 0.4);
  const c = rows.find((r) => r.code === 'C');
  assert.equal(c.pp, null);
  assert.equal(c.banned, null);
  assert.equal(rows.find((r) => r.code === 'B').fast, null, 'no start readiness recorded -> no value, not 0');
});

test('topstats: sorting puts missing values last, both directions', () => {
  const rows = TS.heroes(STATS, MODEL);
  assert.deepEqual(TS.sortRows(rows, 'pp', -1).map((r) => r.code), ['A', 'D', 'B', 'C']);
  assert.deepEqual(TS.sortRows(rows, 'pp', 1).map((r) => r.code), ['B', 'D', 'A', 'C']);
  assert.deepEqual(TS.sortRows(rows, 'prebanSecond', -1)[0].code, 'A');
  assert.deepEqual(TS.sortRows(rows.map((r) => ({ ...r, name: r.code })), 'name', 1).map((r) => r.code), ['A', 'B', 'C', 'D']);
});

test('topstats: partners and match-ups from the hero\'s own side; small samples left out', () => {
  const p = TS.partners(STATS, MODEL, 'A');
  assert.deepEqual(p.best.map((x) => x.code), ['B']);
  assert.deepEqual(p.worst.map((x) => x.code), ['D']);
  assert.equal(TS.partners(STATS, MODEL, 'B').best.length, 1, 'B + D has only 5 games: left out');
  const mA = TS.matchups(STATS, MODEL, 'A');
  assert.deepEqual(mA.good.map((x) => x.code), ['B']);
  assert.equal(mA.bad.length, 0);
  // "A>B" is A's gain: seen from B it is a loss; "B>D" −0.4 is B's loss against D, and D's gain against B
  const mB = TS.matchups(STATS, MODEL, 'B');
  assert.deepEqual(mB.bad.map((x) => x.code), ['D', 'A']);
  assert.deepEqual(TS.matchups(STATS, MODEL, 'D').good.map((x) => x.code), ['B']);
  assert.ok(mB.bad[0].pp < mB.bad[1].pp && mB.bad[1].pp < 0);
});

test('topstats: overall lists', () => {
  assert.deepEqual(TS.topPairs(STATS, MODEL).map((x) => `${x.a}+${x.b}`), ['A+B', 'A+D']);
  const c = TS.topCounters(STATS, MODEL);
  assert.deepEqual(c.map((x) => `${x.a}>${x.b}`), ['D>B', 'A>B'], 'always written from the winner\'s side');
  assert.ok(c.every((x) => x.pp > 0));
  assert.deepEqual(TS.prebans(STATS, 'first').map((x) => x.code), ['C', 'B', 'A']);
  assert.deepEqual(TS.prebans(STATS, 'second').map((x) => x.code), ['A', 'C', 'B']);
  assert.deepEqual(TS.prebans(STATS, 'any', 1).map((x) => x.code), ['C']);
  assert.deepEqual(TS.openers(STATS).map((x) => x.code), ['A', 'B']);
});

test('topstats: builds from games the hero played in (Legend / Emperor only, banned heroes left out)', () => {
  const side = (picks, ban, builds) => ({ picks, ban, prebans: [], builds, energy: {} });
  const b1 = { artifact: 'art1', sets: ['set_speed', 'set_immune'] };
  const b1r = { artifact: 'art1', sets: ['set_immune', 'set_speed'] }; // same build, other order
  const b2 = { artifact: 'art2', sets: ['set_max_hp'] };
  const rows = [
    { day: '2026-11-10', aGrade: 'legend', bGrade: 'emperor', aWin: true, a: side(['A', 'B'], 'B', { A: b1, B: b2 }), b: side(['A2'], null, { A2: b2 }) },
    { day: '2026-11-11', aGrade: 'legend', bGrade: 'legend', aWin: false, a: side(['A'], null, { A: b1r }), b: side(['A2'], null, {}) },
    { day: '2026-11-12', aGrade: 'legend', bGrade: 'legend', aWin: true, a: side(['A'], null, { A: b2 }), b: side(['X'], null, {}) },
    { day: '2026-11-12', aGrade: 'champion', bGrade: 'legend', aWin: true, a: side(['A'], null, { A: b2 }), b: side(['X'], null, {}) },
    { day: '2026-08-01', aGrade: 'legend', bGrade: 'legend', aWin: true, a: side(['A'], null, { A: b2 }), b: side(['X'], null, {}) },
  ];
  const B = TS.builds(rows, { since: '2026-09-15' });
  const a = B.get('A');
  assert.equal(a.games, 3, 'the champion game and the old game are left out');
  assert.deepEqual(a.list.map((x) => [x.artifact, x.sets.join('+'), x.n, x.wins]), [['art1', 'set_immune+set_speed', 2, 1], ['art2', 'set_max_hp', 1, 1]]);
  assert.ok(Math.abs(a.list[0].share - 2 / 3) < 1e-9);
  assert.equal(B.has('B'), false, 'B was banned: it did not play');
  assert.equal(B.get('A2').list[0].wins, 0, 'the other side lost that game');
});

test('topstats: trends — pick rate of the newest week against the week before (DEVLOG #49)', () => {
  const side = (picks) => ({ picks, ban: null, prebans: [], builds: {}, energy: {} });
  const rows = [];
  const add = (day, n, picksA, grade = 'legend') => {
    for (let i = 0; i < n; i++) rows.push({ day, aGrade: grade, bGrade: 'legend', aWin: true, a: side(picksA), b: side(['Z']) });
  };
  add('2026-11-13', 100, ['A', 'B']); // newest week: A in every game, B in every game
  add('2026-11-08', 100, ['A']);
  add('2026-11-06', 100, ['B']); // the week before (Oct 31 – Nov 6): A in none, B in half
  add('2026-11-01', 100, ['C']);
  add('2026-10-20', 500, ['A']); // older: ignored
  add('2026-11-12', 300, ['C'], 'champion'); // not a top game: ignored
  const T = TS.trends(rows);
  assert.deepEqual([T.from, T.mid, T.to, T.gamesNow, T.gamesBefore], ['2026-10-31', '2026-11-07', '2026-11-13', 200, 200]);
  assert.deepEqual(T.heroes.get('A'), { now: 1, before: 0, delta: 1 });
  assert.deepEqual(T.heroes.get('B'), { now: 0.5, before: 0.5, delta: 0 });
  assert.deepEqual(T.heroes.get('C'), { now: 0, before: 0.5, delta: -0.5 });
  assert.equal(T.heroes.get('Z').delta, 0);
  assert.equal(TS.trends(rows.slice(0, 250)), null, 'too few games in the week before');
  assert.equal(TS.trends([]), null);
});

test('topstats: my build against a top-player build (names; order and case do not matter)', () => {
  assert.deepEqual(TS.sameBuild({ sets: ['Speed', 'Immunity'], artifact: 'Veritas' }, { sets: ['immunity', 'Speed'], artifact: 'veritas ' }), { sets: true, artifact: true });
  assert.deepEqual(TS.sameBuild({ sets: ['Speed', 'Immunity'], artifact: 'Veritas' }, { sets: ['Speed', 'Hit'], artifact: 'Veritas' }), { sets: false, artifact: true });
  assert.deepEqual(TS.sameBuild({ sets: [], artifact: '' }, { sets: [], artifact: '' }), { sets: false, artifact: false }, 'nothing known is not "the same"');
});
