// DEVLOG #88: screen items <-> gear.txt from the auto importer (design codes, which copy of a hero)
const test = require('node:test');
const assert = require('node:assert');
const M = require('../js/gearmatch.js');
const S = require('../js/gearsort.js');
const A = require('../js/geararts.js');

const sub = (type, value) => ({ type, value });
const file = {
  heroes: [
    { id: 'u1', code: 'c2007', name: 'Arbiter Vildred' },
    { id: 'u2', code: 'c2007', name: 'Arbiter Vildred' },
    { id: 'u3', code: 'c2185', name: 'Some other name' }, // by code, not by name
  ],
  items: [
    { id: 'a', code: 'ecw6a_u', name: 'Unknown', gear: 'Armor', rank: 'Epic', set: 'SpeedSet', level: 90, enhance: 15, main: sub('Defense', 310), substats: [sub('Speed', 20), sub('HealthPercent', 12)], ingameEquippedId: 'u1' },
    { id: 'b', code: 'eal85a_u', name: 'Unknown', gear: 'Armor', rank: 'Epic', set: 'ImmunitySet', level: 90, enhance: 15, main: sub('Defense', 310), substats: [sub('Speed', 8), sub('HealthPercent', 30)], ingameEquippedId: 'u2' },
    { id: 'c', code: 'eorbis1w', name: 'Unknown', gear: 'Weapon', rank: 'Epic', set: 'SpeedSet', level: 88, enhance: 15, main: sub('Attack', 515), substats: [sub('CriticalHitChancePercent', 12)], ingameEquippedId: 'u1' },
    { id: 'd', code: 'ecb6w_u', name: 'Unknown', gear: 'Weapon', rank: 'Epic', set: 'CounterSet', level: 90, enhance: 15, main: sub('Attack', 525), substats: [sub('Speed', 4)], ingameEquippedId: 'u2' },
    { id: 'e', code: 'ecw6w_u', name: 'Unknown', gear: 'Weapon', rank: 'Epic', set: 'SpeedSet', level: 90, enhance: 15, main: sub('Attack', 525), substats: [sub('AttackPercent', 8), sub('Speed', 19)], ingameEquippedId: 'u3' },
    { id: 'f', code: 'ecw6w_u', name: 'Unknown', gear: 'Weapon', rank: 'Heroic', set: 'HitSet', level: 90, enhance: 6, main: sub('Attack', 300), substats: [sub('Speed', 4)], ingameEquippedId: 'undefined' },
  ],
};
const HEROES = [{ code: 'c2007', name: 'Arbiter Vildred' }, { code: 'c2185', name: 'Rhianna and Luciella' }];

test('gear.txt from the auto importer: design codes kept, heroes by code, which copy of a hero', () => {
  const items = S.slimInventory(file, HEROES);
  assert.deepEqual(items.map((x) => [x.id, x.design, x.equipped, x.unit || '-', x.name]), [
    ['a', 'ecw6a_u', 'c2007', 'u1', ''],
    ['b', 'eal85a_u', 'c2007', 'u2', ''],
    ['c', 'eorbis1w', 'c2007', 'u1', ''],
    ['d', 'ecb6w_u', 'c2007', 'u2', ''],
    ['e', 'ecw6w_u', 'c2185', 'u3', ''],
    ['f', 'ecw6w_u', null, '-', ''],
  ]);
});

test('an item read from the screen is found by its numbers (substats in any order)', () => {
  const items = S.slimInventory(file, HEROES);
  const idx = M.index(items);
  const seen = { gear: 'Weapon', main: sub('Attack', 525), substats: [sub('Speed', 19), sub('AttackPercent', 8)] };
  assert.equal(M.byStats(idx, seen).id, 'e');
  assert.equal(M.byStats(idx, { ...seen, substats: [sub('Speed', 18), sub('AttackPercent', 8)] }), null);
  assert.equal(M.byStats(idx, { ...seen, gear: 'Helmet' }), null);
  // two items with the same numbers: neither
  assert.equal(M.byStats(M.index([...items, { ...items[4], id: 'e2' }]), seen), null);
});

test('the hero screen: the one item gear.txt has on that hero in that slot; two copies told apart', () => {
  const items = S.slimInventory(file, HEROES);
  assert.equal(M.onHero(items, 'c2185', 'Weapon', { enhance: 15, level: 90 }).id, 'e');
  assert.equal(M.onHero(items, 'c2185', 'Weapon', { enhance: 12 }), null); // enhanced since the export
  // two copies of Arbiter Vildred: both armors +15 level 90 -> not by the armor alone
  assert.equal(M.onHero(items, 'c2007', 'Armor', { enhance: 15, level: 90 }), null);
  // the screen shows a level-88 weapon: that is copy u1, whose armor is item a
  const slots = [{ gear: 'Weapon', enhance: 15, level: 88, set: 'SpeedSet' }, { gear: 'Armor', enhance: 15, level: 90, set: '' }];
  const unit = M.unitOf(items, 'c2007', slots);
  assert.equal(unit, 'u1');
  assert.equal(M.onHero(items, 'c2007', 'Armor', { enhance: 15, level: 90, unit }).id, 'a');
  assert.equal(M.unitOf(items, 'c2185', slots), null); // one copy: nothing to tell apart
});

test('designs learn the design code; a code finds its design', () => {
  const pic = (seed) => { const d = new Uint8ClampedArray(A.FP * A.FP * 4); let s = seed; for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) >>> 0; d[i] = i % 4 === 3 ? 255 : s % 256; } return d; };
  const one = A.fingerprint(pic(1));
  const other = A.fingerprint(pic(2)); // the same design seen on another screen (not recognised by the picture)
  let r = A.learn([], one, { gear: 'Weapon', code: 'ecw6w_u' }, 1);
  assert.deepEqual(r.list[0].codes, { ecw6w_u: 1 });
  r = A.learn(r.list, other, { code: 'ecw6w_u' }, 2);
  assert.equal(r.isNew, false);
  assert.equal(r.list.length, 1);
  assert.equal(A.byCode(r.list, 'ecw6w_u').id, r.list[0].id);
  assert.equal(A.byCode(r.list, 'nope'), null);
  // joined by name: codes added up
  const m = A.mergeByName([{ id: 'x', fp: one, name: 'Bow', gear: 'Weapon', codes: { a: 1 } }, { id: 'y', fp: other, name: 'Bow', gear: 'Weapon', codes: { a: 2, b: 1 } }]);
  assert.deepEqual(m.list[0].codes, { a: 3, b: 1 });
});
