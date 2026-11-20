// js/gearbuild.js (hero stats with items, moves, presets) and js/geararts.js (gear designs), DEVLOG #79
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/gearbuild.js');
const A = require('../js/geararts.js');

const base = { atk: 1000, hp: 6000, def: 600, spd: 100, chc: 0.15, chd: 1.5, eff: 0, efr: 0 };
const it = (gear, set, main, subs = []) => ({ id: gear + set, gear, set, main, subs });

test('stats: base + gear + set bonuses (RexQian StatCalculator)', () => {
  assert.deepEqual(B.heroStats(base, []), { atk: 1000, hp: 6000, def: 600, spd: 100, chc: 15, chd: 150, eff: 0, efr: 0, sets: [] });
  const speed4 = ['Weapon', 'Helmet', 'Armor', 'Boots'].map((g) => it(g, 'SpeedSet', { type: 'Speed', value: 0 }, [{ type: 'Speed', value: 5 }]));
  const s = B.heroStats(base, [...speed4, it('Necklace', 'CriticalSet', { type: 'CriticalHitChancePercent', value: 60 }), it('Ring', 'CriticalSet', { type: 'AttackPercent', value: 65 }, [{ type: 'Attack', value: 40 }])]);
  assert.equal(s.spd, 145); // 100 × 1.25 + 20
  assert.equal(s.chc, 87); // 15 + 60 + 12
  assert.equal(s.atk, 1690); // 1000 × 1.65 + 40
  assert.deepEqual(s.sets.map((x) => x.set).sort(), ['CriticalSet', 'SpeedSet']);
  // caps and the other sets
  const d = ['Weapon', 'Helmet', 'Armor', 'Boots'].map((g) => it(g, 'DestructionSet', { type: 'CriticalHitDamagePercent', value: 50 }));
  assert.equal(B.heroStats(base, d).chd, 350);
  const w = ['Weapon', 'Helmet', 'Armor', 'Boots'].map((g) => it(g, 'WeakeningSet', { type: 'Health', value: 0 }));
  assert.equal(B.heroStats(base, w).spd, 115);
  assert.equal(B.heroStats(null, []), null);
});

test('try on, moves and shared items', () => {
  const now = [it('Weapon', 'SpeedSet', { type: 'Attack', value: 500 }), it('Boots', 'SpeedSet', { type: 'Speed', value: 45 })];
  const nw = it('Weapon', 'HitSet', { type: 'Attack', value: 525 });
  const after = B.withItem(now, nw);
  assert.equal(after.length, 2);
  assert.ok(after.includes(nw));
  assert.equal(B.diff(B.heroStats(base, now), B.heroStats(base, after)).atk, 25);
  const wearer = (x) => ({ WeaponHitSet: 'c2', BootsSpeedSet: 'c1' }[x.id] || null);
  const m = B.movesFor('c1', { Weapon: nw, Boots: now[1] }, wearer);
  assert.deepEqual(m.map((x) => [x.item.id, x.from, x.to]), [['WeaponHitSet', 'c2', 'c1']]);
  const p1 = { id: 'p1', hero: 'c1', items: { Weapon: 'a', Ring: 'r' } };
  const p2 = { id: 'p2', hero: 'c2', items: { Weapon: 'a', Ring: 'x' } };
  assert.deepEqual(B.conflicts([p1, p2], p1).map((c) => [c.item, c.preset.id]), [['a', 'p2']]);
});

test('designs: learned once, found again, a typed name is kept', () => {
  const pic = (r, g, b) => { const d = new Uint8ClampedArray(A.FP * A.FP * 4); for (let i = 0; i < d.length; i += 4) { const k = (i / 4) % A.FP < 5 ? 1 : 0.3; d[i] = r * k; d[i + 1] = g * k; d[i + 2] = b * k; d[i + 3] = 255; } return d; };
  const bow = A.fingerprint(pic(200, 40, 40));
  const axe = A.fingerprint(pic(40, 40, 200).map((v, i) => (i % 4 === 3 ? 255 : 255 - v)));
  let r = A.learn([], bow, { name: 'Bow of Agony', gear: 'Weapon' }, 1);
  assert.ok(r.isNew);
  r = A.learn(r.list, bow, {}, 2);
  assert.equal(r.isNew, false);
  assert.equal(r.entry.n, 2);
  assert.equal(A.lookup(r.list, bow).entry.name, 'Bow of Agony');
  assert.equal(A.lookup(r.list, axe), null);
  r.list[0].named = true;
  r.list[0].name = 'My bow';
  assert.equal(A.learn(r.list, bow, { name: 'Bow of Agony' }, 3).entry.name, 'My bow');
  assert.equal(A.cleanName('Palace Maid\nHeaddress'), 'Palace Maid Headdress');
  assert.equal(A.cleanName('Boots of Agony'), 'Boots of Agony');
  assert.equal(A.cleanName('~ ,'), '');
});

test('one design = one name (DEVLOG #85): variants, merging, the name read most often', () => {
  const pic = (f) => { const d = new Uint8ClampedArray(A.FP * A.FP * 4); for (let i = 0; i < d.length; i += 4) { const p = i / 4; d[i] = f(p) * 200; d[i + 1] = 40; d[i + 2] = (1 - f(p)) * 200; d[i + 3] = 255; } return d; };
  const red = A.fingerprint(pic((p) => (p % A.FP < 5 ? 1 : 0)));
  const other = A.fingerprint(pic((p) => (Math.floor(p / A.FP) < 5 ? 1 : 0))); // the same design drawn another way
  assert.ok(A.similarity(red, other) < A.SAME);
  let r = A.learn([], red, { name: 'Bow of Agony', gear: 'Weapon' }, 1);
  // not recognised by the picture, but the same name and slot: one design with two pictures
  r = A.learn(r.list, other, { name: 'Bow of Agony', gear: 'Weapon' }, 2);
  assert.equal(r.isNew, false);
  assert.equal(r.list.length, 1);
  assert.equal(A.lookup(r.list, other).entry.name, 'Bow of Agony');
  // two designs saved apart with one name and slot: joined, items told where to go
  const twin = [{ id: 'a', fp: red, name: 'Ring of Agony', gear: 'Ring', n: 2 }, { id: 'b', fp: other, name: 'ring of agony', gear: 'Ring', n: 3 }];
  const m = A.mergeByName(twin);
  assert.equal(m.list.length, 1);
  assert.deepEqual(m.into, { b: 'a' });
  assert.equal(m.list[0].n, 5);
  // a misread name doesn't win; a typed name always stays
  let v = A.learn([], red, { name: 'Bow of Agony', gear: 'Weapon' }, 1);
  v = A.learn(v.list, red, { name: 'Bow of Agony', gear: 'Weapon' }, 2);
  v = A.learn(v.list, red, { name: 'Bow ot Agony', gear: 'Weapon' }, 3);
  assert.equal(v.entry.name, 'Bow of Agony');
  v.list[0].named = true;
  v.list[0].name = 'My bow';
  assert.equal(A.learn(v.list, red, { name: 'Bow of Agony', gear: 'Weapon' }, 4).entry.name, 'My bow');
});

test('the heroes you are gearing: suggestions only think of them (DEVLOG #86)', () => {
  const S = require('../js/gearsort.js');
  const items = [
    { id: 'a', gear: 'Weapon', rank: 'Epic', level: 85, enhance: 15, main: { type: 'Attack', value: 500 }, subs: [{ type: 'Speed', value: 10 }], equipped: 'c1' },
    { id: 'b', gear: 'Weapon', rank: 'Epic', level: 85, enhance: 15, main: { type: 'Attack', value: 500 }, subs: [{ type: 'Speed', value: 12 }], equipped: 'c2' },
    { id: 'c', gear: 'Weapon', rank: 'Epic', level: 85, enhance: 15, main: { type: 'Attack', value: 500 }, subs: [{ type: 'Speed', value: 18 }] },
  ];
  const heroes = [{ code: 'c1', role: 'warrior' }, { code: 'c2', role: 'thief' }, { code: 'c3', role: 'mage' }];
  assert.deepEqual(S.evaluateAll(items, heroes).profiles.map((p) => p.code).sort(), ['c1', 'c2']);
  const only = S.evaluateAll(items, heroes, {}, S.DEFAULT_RULES, { only: ['c2'] });
  assert.deepEqual(only.profiles.map((p) => p.code), ['c2']);
  for (const r of only.results) assert.ok(r.best.every((x) => x.code === 'c2'));
  // a hero without gear can be on the list too
  assert.deepEqual(S.evaluateAll(items, heroes, {}, S.DEFAULT_RULES, { only: ['c3'] }).profiles.map((p) => p.code), ['c3']);
});
