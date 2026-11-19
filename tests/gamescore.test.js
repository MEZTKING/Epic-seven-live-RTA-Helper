// Epic Seven's Equipment Score (js/gearsort.js gameScore), DEVLOG #83: the owner's nine item panels, score as the game showed it
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/gearsort.js');
const it = (main, level, subs) => ({ main: { type: main[0], value: main[1] }, level, subs: subs.map(([type, value]) => ({ type, value })) });
const PANELS = [
  [it(['Attack', 220], 85, [['AttackPercent', 6], ['Speed', 4], ['EffectResistancePercent', 16], ['CriticalHitDamagePercent', 13]]), 55],
  [it(['Health', 540], 85, [['EffectivenessPercent', 8], ['CriticalHitDamagePercent', 4], ['HealthPercent', 8]]), 25],
  [it(['Health', 2765], 88, [['HealthPercent', 8], ['DefensePercent', 7], ['Speed', 17], ['EffectivenessPercent', 17]]), 91],
  [it(['Defense', 60], 85, [['EffectResistancePercent', 5], ['HealthPercent', 8], ['Speed', 3], ['CriticalHitChancePercent', 3]]), 28],
  [it(['DefensePercent', 29], 85, [['AttackPercent', 14], ['CriticalHitChancePercent', 10], ['Speed', 2], ['CriticalHitDamagePercent', 7]]), 53],
  [it(['CriticalHitChancePercent', 11], 85, [['EffectResistancePercent', 6], ['HealthPercent', 8], ['Speed', 2], ['EffectivenessPercent', 5]]), 27],
  [it(['DefensePercent', 12], 85, [['HealthPercent', 8], ['EffectivenessPercent', 4], ['Attack', 43], ['CriticalHitChancePercent', 5]]), 28],
  [it(['Speed', 45], 88, [['HealthPercent', 24], ['AttackPercent', 8], ['CriticalHitChancePercent', 14], ['CriticalHitDamagePercent', 12]]), 94],
  [it(['Attack', 525], 90, [['Speed', 13], ['CriticalHitChancePercent', 17], ['CriticalHitDamagePercent', 16], ['EffectResistancePercent', 9]]), 106],
];

test('the estimate is within 1 of the game\'s number on all nine panels', () => {
  for (const [item, game] of PANELS) assert.ok(Math.abs(S.gameScore(item) - game) <= 1, `${item.main.type} ${item.main.value}: ${S.gameScore(item)} vs ${game}`);
});
test('a score read from the screen wins; +15 conversion; main share capped', () => {
  assert.equal(S.gameScore({ ...PANELS[0][0], gameScore: 57 }), 57);
  assert.equal(S.gameAt15(60), 85);
  assert.equal(S.mainShare({ main: { type: 'Attack', value: 525 }, level: 90 }), 1);
  assert.equal(S.mainShare({ main: { type: 'Attack', value: 100 }, level: 85 }), 0.2);
  assert.equal(S.DEFAULT_RULES.scoreMode, 'game');
});
