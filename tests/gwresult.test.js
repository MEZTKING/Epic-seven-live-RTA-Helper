const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/gwresult.js');

/** A W×H picture filled with one colour; paint(x0, y0, x1, y1, [r, g, b]) draws boxes. */
function picture(W, H, base) {
  const a = new Uint8ClampedArray(W * H * 4);
  const paint = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a.set([c[0], c[1], c[2], 255], (y * W + x) * 4); };
  paint(0, 0, W, H, base);
  return { a, paint };
}
const HEADER = { x: 10, y: 10, w: 60, h: 20 };
const BAND = { x: 90, y: 40, w: 20, h: 10 };
const ICON = { x: 90, y: 60, w: 20, h: 20 };

test('gwresult: is a result window open, and whose page (colours measured on real screenshots)', () => {
  const W = 200, H = 100;
  const enemy = picture(W, H, [15, 21, 27]);
  enemy.paint(10, 10, 70, 30, [10, 17, 24]);
  enemy.paint(90, 40, 110, 50, [43, 19, 26]);
  assert.deepEqual(R.windowAt(enemy.a, W, H, { header: HEADER, band: BAND }), { side: 'enemy' });
  const ours = picture(W, H, [15, 21, 27]);
  ours.paint(10, 10, 70, 30, [9, 16, 24]);
  ours.paint(90, 40, 110, 50, [30, 47, 30]);
  assert.deepEqual(R.windowAt(ours.a, W, H, { header: HEADER, band: BAND }), { side: 'ours' });
  // a fortress map or a player's page: bright scenery where the title strip would be
  const map = picture(W, H, [91, 111, 133]);
  assert.equal(R.windowAt(map.a, W, H, { header: HEADER, band: BAND }), null);
  // dark everywhere but no red or green band (a loading screen)
  const dark = picture(W, H, [12, 16, 22]);
  assert.equal(R.windowAt(dark.a, W, H, { header: HEADER, band: BAND }), null);
});

test('gwresult: the round icon — blue swords, red-and-white shield, gold badge', () => {
  const W = 200, H = 100;
  const mk = (bg, parts) => {
    const p = picture(W, H, bg);
    let x = 90;
    for (const [share, c] of parts) { const w = Math.round(20 * share); p.paint(x, 60, x + w, 80, c); x += w; }
    return p.a;
  };
  assert.equal(R.roundResult(mk([60, 25, 35], [[0.3, [90, 150, 240]], [0.25, [240, 245, 255]]]), W, H, ICON), 'victory');
  assert.equal(R.roundResult(mk([35, 60, 35], [[0.15, [220, 50, 60]], [0.22, [245, 245, 245]]]), W, H, ICON), 'defeat');
  assert.equal(R.roundResult(mk([60, 25, 35], [[0.3, [220, 160, 60]]]), W, H, ICON), 'draw');
  assert.equal(R.roundResult(mk([60, 25, 35], []), W, H, ICON), null, 'nothing there');
  assert.equal(R.roundResult(mk([78, 178, 250], []), W, H, ICON), null, 'plain blue sky is not an icon (no white)');
});

test('gwresult: the title, also with misread letters', () => {
  assert.deepEqual(R.titleKind('Successful Attack'), { type: 'attack', ok: true });
  assert.deepEqual(R.titleKind('Failed Defense'), { type: 'defense', ok: false });
  assert.deepEqual(R.titleKind('Failed Attack'), { type: 'attack', ok: false });
  assert.deepEqual(R.titleKind('Successful Defence'), { type: 'defense', ok: true });
  assert.deepEqual(R.titleKind('| Succesful Atack .'), { type: 'attack', ok: true });
  assert.equal(R.titleKind('Season Log'), null);
  assert.equal(R.titleKind('Guild Check-In Reward'), null);
  assert.equal(R.titleKind('Attack'), null, 'no success / fail word: not this window');
});

test('gwresult: what a window means for our guild (four cases) and the same battle gives the same key', () => {
  const rounds = [
    { result: 'victory', left: ['a', 'b', 'c'], right: ['x', 'y', 'z'] },
    { result: 'defeat', left: ['d', 'e', 'f'], right: ['u', 'v', 'w'] },
  ];
  // our member's page, their attack
  let p = R.plan({ type: 'attack', side: 'ours', left: 'Ann', right: 'Rival', rounds });
  assert.deepEqual(p, { kind: 'attack', ours: 'Ann', enemy: 'Rival', rounds: [
    { team: 1, result: 'win', draw: false, heroes: ['a', 'b', 'c'], defense: ['x', 'y', 'z'] },
    { team: 2, result: 'loss', draw: false, heroes: ['d', 'e', 'f'], defense: ['u', 'v', 'w'] },
  ] });
  // our member's page, their defense: the enemy on the right attacked
  p = R.plan({ type: 'defense', side: 'ours', left: 'Ann', right: 'Rival', rounds });
  assert.equal(p.kind, 'defense');
  assert.deepEqual(p.rounds.map((r) => [r.result, r.heroes, r.attack]), [['held', ['a', 'b', 'c'], ['x', 'y', 'z']], ['lost', ['d', 'e', 'f'], ['u', 'v', 'w']]]);
  // an enemy's page, THEIR attack on our member (right): their victory is our lost defense
  p = R.plan({ type: 'attack', side: 'enemy', left: 'Rival', right: 'Ann', rounds });
  assert.deepEqual([p.kind, p.ours, p.enemy], ['defense', 'Ann', 'Rival']);
  assert.deepEqual(p.rounds.map((r) => [r.result, r.heroes, r.attack]), [['lost', ['x', 'y', 'z'], ['a', 'b', 'c']], ['held', ['u', 'v', 'w'], ['d', 'e', 'f']]]);
  // an enemy's page, their defense: our member (right) attacked; their defeat is our win
  p = R.plan({ type: 'defense', side: 'enemy', left: 'Rival', right: 'Ann', rounds });
  assert.deepEqual([p.kind, p.ours, p.enemy], ['attack', 'Ann', 'Rival']);
  assert.deepEqual(p.rounds.map((r) => [r.result, r.heroes, r.defense]), [['loss', ['x', 'y', 'z'], ['a', 'b', 'c']], ['win', ['u', 'v', 'w'], ['d', 'e', 'f']]]);
  // a draw: no win for the attacker, the defense held
  const drawn = [{ result: 'draw', left: [], right: [] }];
  assert.deepEqual(R.plan({ type: 'attack', side: 'ours', left: 'Ann', right: 'Rival', rounds: drawn }).rounds[0], { team: 1, result: 'loss', draw: true, heroes: [], defense: [] });
  assert.equal(R.plan({ type: 'defense', side: 'enemy', left: 'Rival', right: 'Ann', rounds: drawn }).rounds[0].result, 'loss');
  assert.equal(R.plan({ type: 'defense', side: 'ours', left: 'Ann', right: 'Rival', rounds: drawn }).rounds[0].result, 'held');
  assert.equal(R.plan(null), null);
  // key: hero order and name spelling details do not matter; a different result does
  const k1 = R.key(R.plan({ type: 'attack', side: 'ours', left: 'Ann', right: 'Rival', rounds }));
  const k2 = R.key(R.plan({ type: 'attack', side: 'ours', left: 'ann ', right: 'RIVAL', rounds: rounds.map((r) => ({ ...r, left: [...r.left].reverse() })) }));
  assert.equal(k1, k2);
  assert.notEqual(k1, R.key(R.plan({ type: 'attack', side: 'ours', left: 'Ann', right: 'Rival', rounds: [rounds[0], { ...rounds[1], result: 'victory' }] })));
});
