const test = require('node:test');
const assert = require('node:assert/strict');
const SC = require('../js/screens.js');
const SP = require('../js/statparse.js');

function frame(seed, { noise = 0, bright = 0 } = {}) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const px = new Uint8ClampedArray(SC.W * SC.H * 4);
  for (let i = 0; i < px.length; i += 4) {
    for (let c = 0; c < 3; c++) px[i + c] = rnd() * 200 + bright + (noise ? (Math.random() - 0.5) * noise : 0);
    px[i + 3] = 255;
  }
  return px;
}

test('screen detector: taught screens recognised through noise and brightness; unknown screens rejected', () => {
  const refs = [
    { screen: 'rta-draft', fp: SC.fingerprint(frame(1)) },
    { screen: 'rta-draft', fp: SC.fingerprint(frame(2)) }, // a second sample of the same screen
    { screen: 'gw-enemy', fp: SC.fingerprint(frame(3)) },
  ];
  assert.equal(SC.detect(SC.fingerprint(frame(2, { noise: 40, bright: 30 })), refs).screen, 'rta-draft');
  assert.equal(SC.detect(SC.fingerprint(frame(3, { noise: 40 })), refs).screen, 'gw-enemy');
  assert.equal(SC.detect(SC.fingerprint(frame(99)), refs).screen, null);
  assert.equal(SC.detect(SC.fingerprint(frame(1)), []).screen, null);
});

test('stabilizer and gating', () => {
  const st = SC.stabilizer(2);
  assert.equal(st('a'), null);
  assert.equal(st('a'), 'a');
  assert.equal(st('b'), 'a');
  assert.equal(st('b'), 'b');
  const refs = [{ screen: 'rta-battle', fp: [] }];
  assert.equal(SC.allowed('rta-battle', 'rta-draft', refs), false);
  assert.equal(SC.allowed('rta-battle', 'rta-battle', refs), true);
  assert.equal(SC.allowed('rta-result', 'rta-draft', refs), true); // never taught -> no gating
});

test('stat lines: names, percent vs flat, OCR slips, ranges', () => {
  assert.deepEqual(SP.parseStatLine('Speed 18'), { type: 'Speed', value: 18 });
  assert.deepEqual(SP.parseStatLine('Spead +4'), { type: 'Speed', value: 4 });
  assert.deepEqual(SP.parseStatLine('Attack 12%'), { type: 'AttackPercent', value: 12 });
  assert.deepEqual(SP.parseStatLine('Attack 525'), { type: 'Attack', value: 525 });
  assert.deepEqual(SP.parseStatLine('Crit1cal Hit Chance 12 %'), { type: 'CriticalHitChancePercent', value: 12 });
  assert.deepEqual(SP.parseStatLine('Critical Hit Damage 21%'), { type: 'CriticalHitDamagePercent', value: 21 });
  assert.deepEqual(SP.parseStatLine('Effect Resistance 8%'), { type: 'EffectResistancePercent', value: 8 });
  assert.deepEqual(SP.parseStatLine('Effectiveness 15%'), { type: 'EffectivenessPercent', value: 15 });
  assert.deepEqual(SP.parseStatLine('Health 2,700'), { type: 'Health', value: 2700 });
  assert.deepEqual(SP.parseStatLine('Defense 6%'), { type: 'DefensePercent', value: 6 });
  assert.equal(SP.parseStatLine('Speed 180'), null); // impossible value
  assert.equal(SP.parseStatLine('Enhance +15'), null);
  assert.equal(SP.parseStatLine(''), null);
});

test('set / slot / enhance / level / rank', () => {
  assert.equal(SP.parseSet('Speed Set'), 'SpeedSet');
  assert.equal(SP.parseSet('Destructi0n Set'), 'DestructionSet');
  assert.equal(SP.parseGear('Epic Boots'), 'Boots');
  assert.equal(SP.parseEnhance('Cursed Ring +15'), 15);
  assert.equal(SP.parseEnhance('+99'), null);
  assert.equal(SP.parseLevel('Lv. 85'), 85);
  assert.equal(SP.parseRank('Heroic Necklace'), 'Heroic');
});

test('a whole item from the panel readings, with problems reported', () => {
  const r = SP.itemFromReadings({ gear: 'Epic Boots', set: 'Speed Set', level: 'Lv 85', enhance: '+15', main: 'Speed 45', subs: ['Attack 14%', 'Crit Chance 9%', 'Health 6%', 'Effectiveness 5%'] });
  assert.deepEqual(r.problems, []);
  assert.equal(r.item.gear, 'Boots');
  assert.equal(r.item.set, 'SpeedSet');
  assert.equal(r.item.enhance, 15);
  assert.deepEqual(r.item.main, { type: 'Speed', value: 45 });
  assert.equal(r.item.substats.length, 4);
  assert.equal(r.item.source, 'screen');
  assert.equal(SP.itemKey(r.item), SP.itemKey(SP.itemFromReadings({ gear: 'Epic Boots', set: 'Speed Set', level: 'Lv 85', enhance: '+15', main: 'Speed 45', subs: ['Attack 14%', 'Crit Chance 9%', 'Health 6%', 'Effectiveness 5%'] }).item));
  const bad = SP.itemFromReadings({ gear: '???', set: '', main: 'blur', subs: ['Speed 4'] });
  assert.equal(bad.item, null);
  assert.ok(bad.problems.length >= 3);
});
