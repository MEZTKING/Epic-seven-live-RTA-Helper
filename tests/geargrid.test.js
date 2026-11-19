// js/geargrid.js: the inventory's Full display format (DEVLOG #77)
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/geargrid.js');

test('the eight stat icons: each template is its own best match, clearly', () => {
  assert.deepEqual(Object.keys(G.ICONS).sort(), ['Attack', 'CriticalHitChance', 'CriticalHitDamage', 'Defense', 'EffectResistance', 'Effectiveness', 'Health', 'Speed']);
  for (const [stat, t] of Object.entries(G.ICONS)) {
    const r = G.classifyIcon(t);
    assert.equal(r.stat, stat);
    assert.ok(G.sureIcon(r), `${stat} ${JSON.stringify(r)}`);
    assert.equal(t.length, G.ICON_W * G.ICON_H);
  }
  // a flat picture is no icon
  assert.equal(G.sureIcon(G.classifyIcon(G.iconVector(new Float32Array(G.ICON_W * G.ICON_H).map((_, i) => i % 3)))), false);
});

test('icon + number -> stat (flat or %)', () => {
  assert.deepEqual(G.statFrom('Attack', '525'), { type: 'Attack', value: 525 });
  assert.deepEqual(G.statFrom('Attack', '6%'), { type: 'AttackPercent', value: 6 });
  assert.deepEqual(G.statFrom('Attack', '6'), { type: 'AttackPercent', value: 6 }); // "%" lost: too small for flat attack
  assert.deepEqual(G.statFrom('Health', '184'), { type: 'Health', value: 184 });
  assert.deepEqual(G.statFrom('Health', '2,765'), { type: 'Health', value: 2765 });
  assert.deepEqual(G.statFrom('Speed', '13'), { type: 'Speed', value: 13 });
  assert.deepEqual(G.statFrom('EffectResistance', '16'), { type: 'EffectResistancePercent', value: 16 });
  assert.equal(G.statFrom('Speed', '130'), null);
  assert.equal(G.statFrom('Attack', ''), null);
  assert.equal(G.statFrom(null, '5'), null);
});

test('level from the +15 main stat, else the 2nd digit', () => {
  assert.equal(G.levelFrom('', { type: 'Attack', value: 525 }, 15), 90);
  assert.equal(G.levelFrom('', { type: 'Attack', value: 515 }, 15), 88);
  assert.equal(G.levelFrom('', { type: 'Health', value: 2765 }, 15), 88);
  assert.equal(G.levelFrom('8', { type: 'Attack', value: 220 }, 6), 88);
  assert.equal(G.levelFrom('', { type: 'Attack', value: 220 }, 6), 85);
  assert.equal(G.levelFromMain({ type: 'Defense', value: 60 }, 0), null);
  assert.equal(G.rankFrom(4), 'Epic');
  assert.equal(G.rankFrom(3), 'Heroic');
});

test('main-stat lines from a column of white-pixel counts', () => {
  const c = new Array(1070).fill(0);
  for (const y0 of [240, 432, 623]) for (let y = y0; y < y0 + 20; y++) c[y] = 10;
  for (let y = 700; y < 702; y++) c[y] = 10; // a speck, not a line
  assert.deepEqual(G.mainRows(c), [249.5, 441.5, 632.5]);
});

test('set badges: a learned badge is found again, others are not', () => {
  const rgba = (r, g, b) => { const d = new Uint8ClampedArray(G.BADGE * G.BADGE * 4); for (let i = 0; i < d.length; i += 4) { const k = (i / 4) % G.BADGE < 6 ? 1 : 0.4; d[i] = r * k; d[i + 1] = g * k; d[i + 2] = b * k; d[i + 3] = 255; } return d; };
  const red = G.badgePrint(rgba(200, 40, 40));
  const blue = G.badgePrint(rgba(40, 60, 200));
  let list = G.learnBadge([], 'FervorSet', red);
  list = G.learnBadge(list, 'FervorSet', red); // the same again: not stored twice
  assert.equal(list.length, 1);
  assert.deepEqual(G.badgeSet(list, red), { set: 'FervorSet', sim: 1 });
  assert.equal(G.badgeSet(list, blue), null);
  list = G.learnBadge(list, 'ImmunitySet', blue);
  assert.equal(G.badgeSet(list, blue).set, 'ImmunitySet');
});

test('a main-stat line broken in two is one row (owner\'s PC, DEVLOG #82)', () => {
  const c = new Array(1070).fill(0);
  for (let y = 544; y < 550; y++) c[y] = 10;
  for (let y = 552; y < 564; y++) c[y] = 10;
  for (let y = 735; y < 755; y++) c[y] = 10;
  assert.deepEqual(G.mainRows(c), [553.5, 744.5]);
});
