// Win-rate model, pick policy, ban / pre-ban advice from top players' games (js/topmodel.js, DEVLOG #45).
// A made-up world with planted effects (the idea of E7DaT's tests/fake_world.py): the model must find them.
const test = require('node:test');
const assert = require('node:assert');
const TM = require('../js/topmodel.js');

const { world } = require('./_world.js');

const ROWS = world(9000);
// fixed pull strengths for the effect tests (in this world only two of ~200 pairs are real, so the self-check may
// rightly choose to pull pairs very hard); the self-check itself is tested on its own
const STATS = TM.build(ROWS, { tune: false });
const TUNED = TM.build(ROWS, { quick: true });

test('topmodel: only Legend / Emperor games count, weighted; too few games -> no model', () => {
  assert.strictEqual(TM.build(ROWS.slice(0, 200)), null);
  assert.ok(STATS.meta.games > 6000 && STATS.meta.games < ROWS.length, `games ${STATS.meta.games}`);
  assert.ok(STATS.meta.skippedGrade > 0);
  assert.strictEqual(STATS.meta.format, TM.FORMAT);
  const sel = TM.select(ROWS, TM.DEFAULTS, null).rows;
  const mixed = sel.find(({ r }) => r.aGrade !== r.bGrade);
  assert.ok(Math.abs(mixed.w - 0.6) < 1e-9 || Math.abs(mixed.w - 0.3) < 1e-9, 'legend × emperor weighs 0.6 (0.3 when older)');
});

test('topmodel: finds the planted effects, and does not mistake good players\' favourite for a strong hero', () => {
  const H = STATS.heroes;
  const byB = Object.keys(H).filter((c) => H[c].n >= 100).sort((x, y) => H[y].b - H[x].b);
  assert.strictEqual(byB[0], 'c1001', `strongest hero: ${byB.slice(0, 3)}`);
  assert.ok(H.c1001.b > 0.3, `c1001 b ${H.c1001.b}`);
  // c1006: raw win rate is high (its fans are the best players), the model's value is not
  assert.ok(H.c1006.wr > 0.56, `c1006 raw win rate ${H.c1006.wr}`);
  assert.ok(H.c1006.b < 0.5 * H.c1001.b, `c1006 b ${H.c1006.b} vs c1001 ${H.c1001.b}`);
  const m = new TM.Model(STATS);
  assert.ok(m.synOf('c1002', 'c1003') > 0.25, `pair ${m.synOf('c1002', 'c1003')}`);
  assert.ok(m.ctrOf('c1004', 'c1005') > 0.25, `counter ${m.ctrOf('c1004', 'c1005')}`);
  assert.ok(Math.abs(m.ctrOf('c1004', 'c1005') + m.ctrOf('c1005', 'c1004')) < 1e-12, 'a counter is the mirror of being countered');
  assert.ok(STATS.meta.fpBias > 0.03, `first-pick bias ${STATS.meta.fpBias}`);
});

test('topmodel: the self-check on held-out games beats a coin and the scale stays sane', () => {
  const bt = TUNED.meta.backtest;
  assert.ok(bt && bt.n >= 100, JSON.stringify(bt));
  assert.ok(bt.logloss < bt.coinLogloss - 0.02, `logloss ${bt.logloss}`);
  assert.ok(bt.accuracy > 0.58, `accuracy ${bt.accuracy}`);
  assert.ok(TUNED.meta.calib >= 0.2 && TUNED.meta.calib <= 1.2);
  assert.ok(bt.trainGames + bt.n <= TUNED.meta.games + 1);
  assert.strictEqual(STATS.meta.backtest, null);
  assert.strictEqual(STATS.meta.calib, 0.7, 'no self-check -> the cautious default scale');
});

test('topmodel: win rate of a position; gain explains itself', () => {
  const m = new TM.Model(STATS);
  const base = m.winrate([], []);
  assert.ok(Math.abs(base - 0.5) < 1e-9);
  assert.ok(m.winrate(['c1001'], []) > 0.52);
  assert.ok(m.winrate(['c1004'], ['c1005']) > m.winrate(['c1004'], ['c1012']));
  const g = m.gain('c1003', ['c1002'], ['c1005']);
  assert.ok(g.pairs.some((p) => p.kind === 'syn' && p.code === 'c1002' && p.v > 0.2));
  assert.ok(Math.abs(g.total - (g.base + g.syn + g.ctr)) < 1e-12);
  assert.ok(m.winrate(['c1001'], [], true) > m.winrate(['c1001'], [], false), 'first pick is worth something');
});

test('topmodel: pick policy backs off from all drafts to similar ones', () => {
  const E = new TM.Engine(STATS);
  const P = E.policy;
  const i2 = P.idx.get('c1002');
  const i10 = P.idx.get('c1010');
  const open = P.slot(true, 0, [], []);
  assert.ok(open.p[i10] > 0.3, `first side opens with c1010 in ${open.p[i10]}`);
  const plain = P.slot(true, 1, [], []);
  const after = P.slot(true, 1, ['c1010'], []);
  assert.ok(after.p[i2] > plain.p[i2] + 0.2, `c1002 after c1010: ${after.p[i2]} vs ${plain.p[i2]}`);
  assert.ok(after.depth === 1 && after.nDeep > 100);
  let s = 0;
  for (const v of after.p) s += v;
  assert.ok(Math.abs(s - 1) < 1e-6, 'shares add up to 1');
  assert.strictEqual(P.slot(true, 1, ['unknown-hero'], []).depth, 0);
});

test('topmodel: candidate rows, risk from open counters, ban-guard slot', () => {
  const E = new TM.Engine(STATS);
  const r = E.rows(['c1002'], ['c1012'], ['c1030'], true, 1, 4);
  assert.ok(!r.rows.has('c1002') && !r.rows.has('c1012') && !r.rows.has('c1030'), 'taken heroes are no candidates');
  const c3 = r.rows.get('c1003');
  assert.ok(c3.pp > 3, `c1003 with c1002: +${c3.pp} pp`);
  assert.ok(c3.rank <= 3, `c1003 rank ${c3.rank}`);
  // c1005 is countered by c1004, which is still open -> risk; with c1004 gone -> none from it
  const open = E.rows([], [], [], false, 0, 5).rows.get('c1005');
  assert.ok(open.risk > 0 && open.counters.some((c) => c.code === 'c1004'), JSON.stringify(open.counters));
  const closed = E.rows([], [], ['c1004'], false, 0, 5).rows.get('c1005');
  assert.ok(!closed.counters.some((c) => c.code === 'c1004'));
  // outside the guard slot a positive gain is discounted by how often the hero gets banned
  const guard = E.rows([], [], [], true, 2, 0).rows.get('c1001');
  const plain = E.rows([], [], [], true, 1, 0).rows.get('c1001');
  assert.ok(guard.key > plain.key);
  assert.strictEqual(E.rows(['c1002'], ['c1012'], ['c1030'], true, 1, 4), r, 'same position -> cached');
});

test('topmodel: pre-bans by role, first picks, final ban', () => {
  const E = new TM.Engine(STATS);
  const second = E.prebans([], {}, false);
  const firstSide = E.prebans([], {}, true);
  assert.strictEqual(second[0].code, 'c1009', `second-pick players pre-ban ${second.slice(0, 3).map((x) => x.code)}`);
  assert.ok(second[0].byRole && second[0].rate > 0.4);
  assert.ok(firstSide.find((x) => x.code === 'c1009').rate < 0.15);
  // a hero I play a lot myself ranks lower
  const mine = E.prebans([], { c1009: 0.3 }, null);
  const plain9 = E.prebans([], {}, null).find((x) => x.code === 'c1009');
  assert.ok(mine.find((x) => x.code === 'c1009').score < 0.5 * plain9.score);
  assert.strictEqual(E.firstPicks()[0].code, 'c1010');
  const b = E.bans(['c1011', 'c1012', 'c1013', 'c1014', 'c1005'], ['c1004', 'c1015', 'c1001', 'c1016', 'c1017'], true);
  assert.strictEqual(b.guardEnemy, 'c1001', 'the third pick cannot be banned');
  assert.ok(!b.rows.some((r) => r.code === 'c1001'));
  assert.strictEqual(b.rows[0].code, 'c1004', `ban ${b.rows.map((r) => r.code + ' ' + r.pp)}`);
  assert.ok(b.rows[0].pp > 2);
  assert.ok(b.theirBan && b.theirBan !== 'c1013');
});

test('topmodel: stored statistics survive JSON and an old format is refused', () => {
  const copy = JSON.parse(JSON.stringify(STATS));
  const E = TM.engine(copy);
  assert.ok(E && E.ready);
  assert.ok(Math.abs(E.winrate(['c1001'], []) - new TM.Engine(STATS).winrate(['c1001'], [])) < 1e-12);
  assert.strictEqual(TM.engine({ ...copy, meta: { ...copy.meta, format: 0 } }), null);
  assert.strictEqual(TM.engine(null), null);
});

test('topmodel: seasons — the season before is mixed in while the new one is small; onlySeason uses one season alone (DEVLOG #48)', () => {
  // the oldest third of the games belongs to the season before
  const rows = ROWS.map((r) => (r.day <= '2026-11-04' ? { ...r, season: 'pvp_rta_ss20' } : r));
  const mixed = TM.build(rows, { tune: false });
  assert.strictEqual(mixed.meta.season.code, 'pvp_rta_ss21');
  assert.ok(mixed.meta.season.blend > 0 && mixed.meta.season.blend < 1, `blend ${mixed.meta.season.blend}`);
  assert.ok(mixed.meta.season.otherGames > 1000, `other ${mixed.meta.season.otherGames}`);
  assert.strictEqual(mixed.meta.season.games + mixed.meta.season.otherGames, mixed.meta.games);
  assert.strictEqual(mixed.meta.season.only, false);
  // a big new season: nothing of the old one is used
  const big = TM.build(rows, { tune: false, seasonMinGames: 1000 });
  assert.strictEqual(big.meta.season.otherGames, 0);
  assert.strictEqual(big.meta.games, mixed.meta.season.games);
  // one season alone
  const old = TM.build(rows, { tune: false, onlySeason: 'pvp_rta_ss20' });
  assert.deepStrictEqual([old.meta.season.code, old.meta.season.only, old.meta.season.otherGames], ['pvp_rta_ss20', true, 0]);
  assert.strictEqual(old.meta.games, mixed.meta.season.otherGames);
  assert.ok(old.meta.latestDay <= '2026-11-04');
  assert.strictEqual(TM.build(rows, { onlySeason: 'pvp_rta_ss99' }), null, 'a season without games: no model');
  // a pre-season code counts to its season
  const pre = ROWS.map((r) => (r.day >= '2026-11-11' ? { ...r, season: 'pvp_rta_ss21f' } : r));
  assert.strictEqual(TM.build(pre, { tune: false }).meta.season.otherGames, 0);
});

test('topmodel: turn order — who moves first, heroes that depend on it, opener threats (DEVLOG #51)', () => {
  assert.strictEqual(TM.turnOf({ a: { energy: { x: 100, y: 80 } }, b: { energy: { z: 95 } } }), 1);
  assert.strictEqual(TM.turnOf({ a: { energy: { x: 90 } }, b: { energy: { z: 100 } } }), -1);
  assert.strictEqual(TM.turnOf({ a: { energy: {} }, b: { energy: { z: 100 } } }), 0);
  assert.strictEqual(TM.turnOf({ a: { energy: { x: 100 } }, b: { energy: { z: 100 } } }), 0);
  // counted and fitted from the games (also without the self-check)
  const H = STATS.heroes;
  const bySp = Object.keys(H).filter((c) => H[c].n >= 100).sort((x, y) => H[y].sp - H[x].sp);
  assert.deepStrictEqual(bySp.slice(0, 2), ['c1008', 'c1010'], `fastest: ${bySp.slice(0, 4)}`);
  assert.ok(H.c1008.fast > 0.8, `c1008 fastest in ${H.c1008.fast}`);
  assert.ok(H.c1007.wr1 - H.c1007.wr0 > 0.15, `c1007 with / without the first turn: ${H.c1007.wr1} / ${H.c1007.wr0}`);
  assert.ok(STATS.meta.ftWin > 0.52, `the first turn wins ${STATS.meta.ftWin}`);
  const E = new TM.Engine(STATS);
  assert.ok(E.model.hasTurn);
  assert.ok(E.model.pFirst(['c1008'], ['c1011']) > 0.85);
  assert.ok(E.model.pFirst(['c1011'], ['c1008']) < 0.15);
  assert.ok(Math.abs(E.model.pFirst(['c1011'], ['c1011']) - 0.5) < 1e-9);
  const ti = E.turnInfo('c1007');
  assert.ok(ti.dep > 0.15 && ti.n1 >= 15 && ti.n0 >= 15);
  assert.strictEqual(E.turnInfo('nobody'), null);
  // rows carry the chance of the first turn before and after the pick
  const r = E.rows(['c1011'], ['c1012'], [], true, 1, 4);
  assert.ok(Math.abs(r.pf0 - E.model.pFirst(['c1011'], ['c1012'])) < 1e-12);
  assert.ok(r.rows.get('c1008').pf > r.pf0 + 0.3);
  // without the self-check the win rate does not use turn order …
  assert.strictEqual(STATS.meta.useTurn, false);
  assert.strictEqual(E.model.turnZ(['c1007', 'c1008'], ['c1011']), 0);
  // … the self-check measures how well the first turn is called from the draft, and decides
  const bt = TUNED.meta.backtest;
  assert.ok(bt.ftAccuracy > 0.7 && bt.ftGames >= 100, JSON.stringify([bt.ftAccuracy, bt.ftGames]));
  assert.strictEqual(typeof TUNED.meta.useTurn, 'boolean');
  if (TUNED.meta.useTurn) {
    const T = new TM.Engine(TUNED);
    // c1007 is worth more next to the fastest hero than against it
    const withFast = T.model.gain('c1007', ['c1008'], ['c1011']);
    const againstFast = T.model.gain('c1007', ['c1011'], ['c1008']);
    assert.ok(withFast.turn > againstFast.turn, `${withFast.turn} vs ${againstFast.turn}`);
    assert.ok(Math.abs(withFast.total - (withFast.base + withFast.syn + withFast.ctr + withFast.turn)) < 1e-12);
    // … and the fastest open hero is listed as a threat to it (the model may book it as a counter, as turn order, or both)
    assert.ok(T.speedThreats(new Set()).includes('c1008'));
    const th = T.threats('c1007', new Set(), ['c1011'], [], T.speedThreats(new Set()));
    assert.ok(th.some((t) => t.code === 'c1008'), JSON.stringify(th.slice(0, 3)));
    assert.ok(th.every((t) => typeof t.byTurn === 'boolean'));
  }
});

test('topmodel: turn order in the suggestion reasons (source "top players")', () => {
  const L = require('../js/logic.js');
  const E = new TM.Engine(STATS);
  const hero = (c) => ({ code: c, name: c.toUpperCase(), element: 'fire', role: 'knight' });
  const ctx = { topModel: E, nameOf: (c) => c.toUpperCase() };
  const opts = { side: 'me', first: true, slot: 1, taken: [], rEnemy: 4 };
  const fast = L.scoreCandidate(hero('c1008'), [hero('c1011')], [hero('c1012')], ctx, opts);
  const move = fast.reasons.find((r) => /^Your chance to move first: \d+% → \d+%$/.test(r.text));
  assert.ok(move && move.value > 0 && move.source === 'top players', JSON.stringify(fast.reasons));
  // c1007 needs the first turn: against the fastest hero it is warned about, next to it it is praised
  const bad = L.scoreCandidate(hero('c1007'), [hero('c1011')], [hero('c1008')], ctx, opts);
  const warn = bad.reasons.find((r) => /^Needs the first turn/.test(r.text));
  assert.ok(warn && warn.value < 0, JSON.stringify(bad.reasons));
  const good = L.scoreCandidate(hero('c1007'), [hero('c1008')], [hero('c1012')], ctx, opts);
  assert.ok(good.reasons.some((r) => /^Gets the first turn it needs/.test(r.text) && r.value > 0), JSON.stringify(good.reasons));
  // predicting the opponent's pick: worded for their side
  const opp = L.scoreCandidate(hero('c1008'), [hero('c1011')], [hero('c1012')], ctx, { ...opts, side: 'opp' });
  assert.ok(opp.reasons.some((r) => /^Their chance to move first/.test(r.text)));
});
