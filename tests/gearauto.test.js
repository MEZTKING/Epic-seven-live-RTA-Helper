// DEVLOG #92 / #93: auto-gear a hero, free up inventory space
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../js/gearauto.js');
const B = require('../js/gearbuild.js');
const C = require('../js/gearclean.js');
const S = require('../js/gearsort.js');

const sub = (type, value) => ({ type, value });
const base = { atk: 1000, hp: 6000, def: 600, spd: 100, chc: 0.15, chd: 1.5, eff: 0, efr: 0 };
let n = 0;
const item = (gear, set, main, subs, extra = {}) => ({ id: 'i' + ++n, gear, set, rank: 'Epic', level: 90, enhance: 15, main, subs, ...extra });
const MAIN = { Weapon: sub('Attack', 525), Helmet: sub('Health', 2835), Armor: sub('Defense', 315), Necklace: sub('CriticalHitDamagePercent', 65), Ring: sub('AttackPercent', 65), Boots: sub('Speed', 45) };

function pool() {
  const out = [];
  for (const g of B.SLOTS) {
    out.push(item(g, 'SpeedSet', MAIN[g], [sub('Speed', 10), sub('CriticalHitChancePercent', 8)]));
    out.push(item(g, 'CriticalSet', MAIN[g], [sub('CriticalHitChancePercent', 15), sub('AttackPercent', 10)]));
    out.push(item(g, 'AttackSet', MAIN[g], [sub('AttackPercent', 20), sub('CriticalHitDamagePercent', 15)]));
  }
  return out;
}

test('auto-gear: its stat sum is exactly the app\'s (E7GearBuild.heroStats)', () => {
  const items = pool();
  const res = A.optimize(base, items, { goal: 'damage' });
  const b = res.builds[0];
  const hs = B.heroStats(base, Object.values(b.items));
  for (const k of B.KEYS) assert.equal(b.stats[k], hs[k], k);
  assert.equal(Object.keys(b.items).length, 6);
});

test('auto-gear: goals, minimums and sets are kept', () => {
  const items = pool();
  // speed: all speed items (4-piece Speed set + speed subs)
  const fast = A.optimize(base, items, { goal: 'speed' }).builds[0];
  assert.ok(Object.values(fast.items).filter((it) => it.set === 'SpeedSet').length >= 4);
  // damage with a speed floor: at least 4 Speed pieces are needed to reach 170
  const r = A.optimize(base, items, { goal: 'damage', min: { spd: 170 } });
  assert.ok(r.exact);
  assert.ok(r.builds.every((b) => b.stats.spd >= 170));
  // sets asked for
  const s = A.optimize(base, items, { goal: 'damage', set4: 'AttackSet', set2: ['CriticalSet'] });
  const counts = {};
  for (const it of Object.values(s.builds[0].items)) counts[it.set] = (counts[it.set] || 0) + 1;
  assert.ok(counts.AttackSet >= 4 && counts.CriticalSet >= 2);
  // impossible minimum: the closest builds, marked
  const no = A.optimize(base, items, { goal: 'damage', min: { spd: 999 } });
  assert.equal(no.exact, false);
  assert.ok(no.builds.length && no.builds.every((b) => b.meets === false));
  // the best build is at least as good as any other found
  const d = A.optimize(base, items, { goal: 'damage', top: 5 });
  assert.ok(d.builds.every((b, i) => i === 0 || b.score <= d.builds[0].score));
});

test('clean-up: duplicates, extract / sell, locked apart, never worn or preset items; parking on heroes you skip', () => {
  const good = item('Ring', 'SpeedSet', sub('AttackPercent', 65), [sub('Speed', 20), sub('CriticalHitChancePercent', 12)]);
  const worse = item('Ring', 'SpeedSet', sub('AttackPercent', 65), [sub('Speed', 15), sub('CriticalHitChancePercent', 12)]);
  const other = item('Ring', 'SpeedSet', sub('AttackPercent', 65), [sub('Speed', 25), sub('CriticalHitChancePercent', 4)]);
  assert.ok(C.dominates(good, worse));
  assert.ok(!C.dominates(good, other) && !C.dominates(other, good));
  const r = (it, verdict, reason = '', wss = 50) => ({ item: it, verdict, reason, wss, reforgedWss: wss });
  const junk = item('Boots', 'HitSet', sub('Health', 2700), [sub('Defense', 20)], { level: 85, enhance: 0 });
  const lockedJunk = item('Boots', 'HitSet', sub('Health', 2700), [sub('Defense', 21)], { level: 85, enhance: 0, locked: true });
  const worn = item('Weapon', 'HitSet', MAIN.Weapon, [sub('Defense', 5)], { equipped: 'c1' });
  const inPreset = item('Helmet', 'HitSet', MAIN.Helmet, [sub('Defense', 5)]);
  const results = [r(good, 'keep', 'Good gear score', 70), r(worse, 'keep', 'Good gear score', 65), r(other, 'keep', 'Speed piece', 66), r(junk, 'extract', 'Low', 20), r(lockedJunk, 'extract', 'Low', 21), r(worn, 'extract', 'x', 5), r(inPreset, 'extract', 'x', 5)];
  const p = C.plan(results, { presets: [{ id: 'p', hero: 'c1', items: { Helmet: inPreset.id } }], skip: ['c9'], equippedOf: () => [] });
  assert.equal(p.spare, 6);
  assert.deepEqual(p.remove.map((x) => x.r.item.id).sort(), [junk.id, worse.id].sort());
  assert.deepEqual(p.locked.map((x) => x.r.item.id), [lockedJunk.id]);
  assert.equal(p.park.length, 1); // one ring slot on the skipped hero: the best ring goes there
  assert.equal(p.park[0].r.item.id, good.id);
  assert.equal(p.after, 6 - 2 - 1);
});

test('gear.txt from the auto importer: its lock field (l) is read (DEVLOG #93)', () => {
  const items = S.slimInventory({ items: [{ id: 'a', gear: 'Ring', main: sub('Speed', 4), substats: [], l: true }, { id: 'b', gear: 'Ring', main: sub('Speed', 4), substats: [] }] }, []);
  assert.deepEqual(items.map((x) => x.locked), [true, false]);
});

test('gear a whole list (DEVLOG #95): most important first, no item used twice, the next hero gears from what is left', () => {
  const items = pool();
  const first = A.planAll([{ code: 'a', base, opts: { goal: 'damage' } }, { code: 'b', base, opts: { goal: 'damage' } }], items, { wornBy: () => null });
  const ids = (r) => Object.values(r.build.items).map((it) => it.id);
  assert.equal(first.length, 2);
  assert.equal(ids(first[0]).length, 6);
  assert.equal(ids(first[1]).length, 6);
  assert.ok(!ids(first[1]).some((id) => ids(first[0]).includes(id)));
  // the first hero gets what a lone optimisation gives it
  assert.deepEqual(ids(first[0]), Object.values(A.optimize(base, items, { goal: 'damage' }).builds[0].items).map((it) => it.id));
  assert.ok(first[1].build.score <= first[0].build.score);
  // items it may not take are left alone; taken items name their wearer
  const worn = items.find((it) => it.gear === 'Weapon' && it.set === 'AttackSet');
  const r = A.planAll([{ code: 'a', base, opts: { goal: 'damage' } }], items, { wornBy: (it) => (it === worn ? 'x' : null), allowed: (it) => it !== worn });
  assert.ok(!ids(r[0]).includes(worn.id));
  const r2 = A.planAll([{ code: 'a', base, opts: { goal: 'damage' } }], items, { wornBy: (it) => (it === worn ? 'x' : null) });
  assert.deepEqual(r2[0].taken.map((t) => t.from), ids(r2[0]).includes(worn.id) ? ['x'] : []);
  assert.equal(A.goalForRole('knight'), 'tank');
  assert.equal(A.goalForRole('assassin'), 'damage');
});
