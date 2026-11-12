// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');


test('draft order is 2+2 prebans, picks 1-2-2-2-2-1, then 1 postban each', () => {
  const steps = L.draftSteps('me');
  assert.equal(steps.length, 4 + 10 + 2);
  const picks = steps.filter((s) => s.phase === 'pick').map((s) => s.player).join(',');
  assert.equal(picks, 'me,opp,opp,me,me,opp,opp,me,me,opp');
  const oppFirst = L.draftSteps('opp').filter((s) => s.phase === 'pick').map((s) => s.player).join(',');
  assert.equal(oppFirst, 'opp,me,me,opp,opp,me,me,opp,opp,me');
});

test('cannot pick prebanned or already-picked heroes; postban must hit opponent', () => {
  let d = L.newDraft('me');
  for (const id of ['a', 'b', 'c', 'd']) d = L.select(d, id); // prebans
  assert.match(L.canSelect(d, 'a'), /prebanned/);
  d = L.select(d, 'e');
  assert.match(L.canSelect(d, 'e'), /already picked/);
  for (const id of ['f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n']) d = L.select(d, id);
  assert.equal(L.currentStep(d).phase, 'postban');
  assert.match(L.canSelect(d, 'e'), /opponent/); // e is mine
  d = L.select(d, 'f'); // opp's
  d = L.select(d, 'e');
  assert.ok(L.isComplete(d));
  const v = L.draftView(d);
  assert.deepEqual(v.picks.me, ['e', 'h', 'i', 'l', 'm']);
  assert.deepEqual(v.postbans.me, ['f']);
  assert.equal(L.undo(d).actions.length, 15);
});

test('element advantage triangle and light/dark', () => {
  assert.equal(L.elementAdvantage('fire', 'earth'), 1);
  assert.equal(L.elementAdvantage('earth', 'ice'), 1);
  assert.equal(L.elementAdvantage('ice', 'fire'), 1);
  assert.equal(L.elementAdvantage('fire', 'ice'), -1);
  assert.equal(L.elementAdvantage('light', 'dark'), 1);
  assert.equal(L.elementAdvantage('dark', 'light'), 1);
  assert.equal(L.elementAdvantage('fire', 'light'), 0);
});

test('enemy speed estimate from CR bar', () => {
  const r = L.estimateEnemySpeed(300, 90, 5);
  assert.equal(r.estimate, 270);
  assert.equal(r.min, 255);
  assert.equal(r.max, 284.2);
  assert.equal(L.estimateEnemySpeed(0, 50), null);
});

test('speed needed to outspeed', () => {
  assert.deepEqual(L.speedToOutspeed(285, 5), { noVariance: 286, guaranteed: 301 });
  assert.deepEqual(L.speedToOutspeed(200, 0), { noVariance: 201, guaranteed: 201 });
});

test('turn simulation: faster unit first, CR push lets ally jump ahead', () => {
  const t = L.simulateTurns([
    { name: 'Fast', side: 'me', speed: 300, pushAllies: 50, pushOnce: true },
    { name: 'Slow', side: 'me', speed: 150 },
    { name: 'Enemy', side: 'opp', speed: 250 },
  ], 3);
  // Fast acts at t=1/3; Slow then has 50+50=100 => acts before Enemy (83%).
  assert.deepEqual(t.map((x) => x.name), ['Fast', 'Slow', 'Enemy']);
});

test('element advantage treats the game code "wind" as Earth', () => {
  assert.equal(L.elementAdvantage('fire', 'wind'), 1);
  assert.equal(L.elementAdvantage('wind', 'ice'), 1);
});
