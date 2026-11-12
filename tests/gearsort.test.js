const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/gearsort.js');
const official = require('../js/sources/official-heroes.js').heroes;

const sub = (type, value, rolls) => ({ type, value, rolls });
const item = (o) => ({ id: o.id || 'x', gear: 'Helmet', set: 'SpeedSet', rank: 'Epic', level: 85, enhance: 15, main: { type: 'Health', value: 2700 }, subs: [], equipped: null, ...o });

test('gear score follows the RexQian-fork formula (substats only)', () => {
  // 10 atk% + 10 speed (x2) + 14 cd (x8/7) + 10 cc (x8/5) + 78 flat atk (x3.46/39)
  const it = item({ subs: [sub('AttackPercent', 10, 2), sub('Speed', 10, 3), sub('CriticalHitDamagePercent', 14, 2), sub('CriticalHitChancePercent', 10, 2)] });
  assert.equal(S.wss(it.subs), Math.round(10 + 20 + 16 + 16));
  assert.equal(S.wss([sub('Attack', 78, 2)]), Math.round(78 * (3.46 / 39)));
});

test('reforge adds per-roll amounts (level 85 only, not Gaveleets)', () => {
  const it = item({ subs: [sub('AttackPercent', 20, 4), sub('Speed', 12, 4), sub('CriticalHitChancePercent', 9, 2), sub('Health', 174, 1)] });
  const r = S.reforgedSubs(it);
  assert.deepEqual(r.map((s) => s.value), [25, 15, 11, 230]); // +5, +3, +2, +56
  assert.equal(S.reforgedSubs({ ...it, level: 88 })[0].value, 20);
  assert.equal(S.isReforgeable({ ...it, name: "Gaveleet's Helm" }), false);
});

test('rolls left before +15 and missing roll counts are estimated', () => {
  assert.equal(S.rollsLeft(item({ enhance: 0, subs: [sub('Speed', 4), sub('AttackPercent', 7), sub('HealthPercent', 6), sub('CriticalHitChancePercent', 4)] })), 5);
  assert.equal(S.rollsLeft(item({ enhance: 9, subs: [sub('Speed', 4, 1), sub('AttackPercent', 14, 2), sub('HealthPercent', 6, 1), sub('CriticalHitChancePercent', 8, 3)] })), 2);
  assert.equal(S.rollsOf({ type: 'AttackPercent', value: 18 }), 3);
});

test('inventory: items linked to heroes; hero profile from build; best hero and verdicts', () => {
  const data = {
    heroes: [{ id: 1, name: 'Arbiter Vildred' }, { id: 2, name: 'Belian' }],
    items: [
      { id: 'a1', gear: 'Necklace', set: 'CriticalSet', rank: 'Epic', level: 85, enhance: 15, main: { type: 'CriticalHitDamagePercent', value: 65 }, substats: [sub('CriticalHitChancePercent', 12, 3), sub('Speed', 8, 2), sub('AttackPercent', 8, 1), sub('Health', 180, 1)], ingameEquippedId: '1' },
      { id: 'b1', gear: 'Necklace', set: 'HealthSet', rank: 'Epic', level: 85, enhance: 15, main: { type: 'HealthPercent', value: 65 }, substats: [sub('HealthPercent', 14, 2), sub('Speed', 6, 2), sub('DefensePercent', 8, 1), sub('EffectResistancePercent', 9, 2)], ingameEquippedId: '2' },
      // spare crit necklace: better for AV
      { id: 'n1', gear: 'Necklace', set: 'CriticalSet', rank: 'Epic', level: 85, enhance: 15, main: { type: 'CriticalHitDamagePercent', value: 65 }, substats: [sub('CriticalHitChancePercent', 16, 4), sub('Speed', 12, 3), sub('AttackPercent', 9, 1), sub('CriticalHitDamagePercent', 6, 1)], ingameEquippedId: '0' },
      // junk necklace
      { id: 'j1', gear: 'Necklace', set: 'DefenseSet', rank: 'Heroic', level: 72, enhance: 15, main: { type: 'Defense', value: 40 }, substats: [sub('Attack', 40, 1), sub('Defense', 30, 2), sub('Health', 170, 2), sub('DefensePercent', 5, 1)], ingameEquippedId: '0' },
      // unenhanced epic with speed: enhance
      { id: 'e1', gear: 'Boots', set: 'SpeedSet', rank: 'Epic', level: 85, enhance: 0, main: { type: 'Speed', value: 9 }, substats: [sub('Speed', 4, 1), sub('CriticalHitChancePercent', 4, 1), sub('AttackPercent', 6, 1), sub('HealthPercent', 5, 1)], ingameEquippedId: '0' },
    ],
  };
  const inv = S.slimInventory(data, official);
  assert.equal(inv.find((i) => i.id === 'a1').equipped, 'c2007');
  const { profiles, results } = S.evaluateAll(inv, official);
  const av = profiles.find((p) => p.code === 'c2007');
  assert.equal(av.mains.Necklace, 'CriticalHitDamagePercent');
  assert.ok(av.weights.CriticalHitChancePercent > av.weights.DefensePercent);
  const R = (id) => results.find((r) => r.item.id === id);
  assert.equal(R('n1').verdict, 'keep');
  assert.equal(R('n1').best[0].code, 'c2007');
  assert.ok(R('n1').best[0].delta > 3);
  assert.equal(R('j1').verdict, 'sell'); // level 72 -> sell, not extract
  assert.equal(R('e1').verdict, 'enhance');
  assert.equal(R('a1').verdict, 'keep');
  assert.match(R('a1').reason, /Equipped/);
});

test('user override wins over build/class profile', () => {
  const p = S.heroProfile('c1', 'knight', [], { AttackPercent: 1 });
  assert.equal(p.weights.AttackPercent, 1);
  assert.equal(p.sources.AttackPercent, 'your setting');
  assert.equal(p.sources.HealthPercent, 'class default');
});
