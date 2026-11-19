// js/gearsim.js: the enhance simulator and "what to do" (DEVLOG #78)
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/gearsim.js');
const S = require('../js/gearsort.js');

const bow = { gear: 'Weapon', rank: 'Epic', level: 85, enhance: 6, main: { type: 'Attack', value: 220 }, subs: [{ type: 'AttackPercent', value: 6 }, { type: 'Speed', value: 4 }, { type: 'EffectResistancePercent', value: 16 }, { type: 'CriticalHitDamagePercent', value: 13 }] };
const helm = { gear: 'Helmet', rank: 'Heroic', level: 85, enhance: 0, main: { type: 'Health', value: 540 }, subs: [{ type: 'EffectivenessPercent', value: 8 }, { type: 'CriticalHitDamagePercent', value: 4 }, { type: 'HealthPercent', value: 8 }] };

test('a +6 item gets three rolls (+9, +12, +15), each within the roll sizes', () => {
  for (let seed = 1; seed < 50; seed++) {
    const r = M.simulate(bow, M.rngFrom(seed));
    assert.deepEqual(r.steps.map((x) => x.at), [9, 12, 15]);
    for (const x of r.steps) {
      assert.equal(x.kind, 'roll');
      assert.ok(x.add >= M.ROLL[x.type][0] && x.add <= M.ROLL[x.type][1]);
    }
    assert.equal(r.item.enhance, 15);
    assert.equal(r.wss, S.wss(r.item.subs));
    assert.ok(r.reforgedWss >= r.wss);
  }
  // the item itself is not changed
  assert.equal(bow.subs[0].value, 6);
});

test('a Heroic item gets its 4th substat at +12: new, not the main stat, not one it has', () => {
  for (let seed = 1; seed < 50; seed++) {
    const r = M.simulate(helm, M.rngFrom(seed));
    const nw = r.steps.filter((x) => x.kind === 'new');
    assert.equal(nw.length, 1);
    assert.equal(nw[0].at, 12);
    assert.ok(!['Health', 'EffectivenessPercent', 'CriticalHitDamagePercent', 'HealthPercent'].includes(nw[0].type));
    assert.equal(r.item.subs.length, 4);
  }
  // a weapon never gets defense
  const w3 = { ...bow, enhance: 0, subs: bow.subs.slice(0, 2) };
  for (let seed = 1; seed < 80; seed++) for (const x of M.simulate(w3, M.rngFrom(seed)).steps) assert.ok(!/Defense/.test(x.type));
});

test('outcomes: a range around the expected score, repeatable with a seed', () => {
  const a = M.outcomes(bow, { runs: 500, rng: M.rngFrom(9) });
  const b = M.outcomes(bow, { runs: 500, rng: M.rngFrom(9) });
  assert.deepEqual(a, b);
  assert.ok(a.worst <= a.low && a.low <= a.mid && a.mid <= a.high && a.high <= a.best);
  assert.ok(a.mid > S.wss(bow.subs));
  assert.ok(a.chanceKeep >= 0 && a.chanceKeep <= 1);
  // already +15: no rolls, the score as it is
  const done = M.outcomes({ ...bow, enhance: 15 });
  assert.equal(done.runs, 0);
  assert.equal(done.mid, S.wss(bow.subs));
});

test('what to do: one plain sentence per verdict', () => {
  const r = (verdict, extra = {}) => ({ item: { ...bow, ...(extra.item || {}) }, verdict, reason: 'Good gear score (70)', wss: 55, reforgedWss: 65, best: extra.best || [] });
  assert.equal(M.advice(r('reforge')).action, 'Reforge');
  assert.match(M.advice(r('reforge')).text, /55 → 65/);
  assert.match(M.advice(r('keep', { best: [{ code: 'c1', delta: 20 }] }), { nameOf: () => 'Lilias' }).text, /put it on Lilias/);
  assert.match(M.advice(r('enhance')).text, /Enhance to \+9/);
  assert.match(M.advice(r('extract')).text, /Extract/);
  assert.match(M.advice(r('sell')).text, /Sell/);
  assert.match(M.advice(r('extract'), { worn: true }).text, /wears it/);
  assert.equal(M.advice(r('extract'), { worn: true }).action, 'Keep');
});

test('item upgrades: enhance, reforge and modify lists (DEVLOG #80)', () => {
  const mk = (id, enhance, subs, extra = {}) => ({ id, gear: 'Weapon', rank: 'Epic', level: 85, enhance, main: { type: 'Attack', value: 500 }, subs, ...extra });
  const good = mk('g', 6, [{ type: 'AttackPercent', value: 6 }, { type: 'Speed', value: 4 }, { type: 'EffectResistancePercent', value: 16 }, { type: 'CriticalHitDamagePercent', value: 13 }]);
  const plus15 = mk('p', 15, [{ type: 'Speed', value: 17 }, { type: 'CriticalHitChancePercent', value: 15 }, { type: 'CriticalHitDamagePercent', value: 20 }, { type: 'Health', value: 340 }]);
  const ev = S.evaluateAll([good, plus15], [], {}, S.DEFAULT_RULES);
  const p = M.upgradePlan(ev.results, { runs: 200 });
  assert.deepEqual(p.enhance.map((x) => x.r.item.id), ['g']);
  assert.ok(p.enhance[0].gain > 0);
  assert.deepEqual(p.reforge.map((x) => x.r.item.id), ['p']);
  assert.ok(p.reforge[0].gain > 0);
  // the weakest substat of the +15 item is flat health 340 (two rolls, worth 6); a weapon never gets defense
  assert.equal(p.modify[0].sub.type, 'Health');
  assert.ok(!/Defense/.test(p.modify[0].to.type));
  assert.ok(p.modify[0].gain >= 4);
});
