// Built-in screen layouts (js/layouts.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/layouts.js');
const V = require('../js/vision.js');

test('the Steam 16:9 layout is picked for 16:9 game pictures only', () => {
  assert.equal(L.layoutFor(1342, 755).id, 'steam-16x9');
  assert.equal(L.layoutFor(1920, 1080).id, 'steam-16x9');
  assert.equal(L.layoutFor(1348, 794), null); // a window with its title bar: cut it off first
  assert.equal(L.layoutFor(1600, 1200), null);
});

test('built-in boxes make the draft reader ready with no drawing at all; your boxes win', () => {
  const lay = L.layoutFor(1920, 1080);
  const eff = L.effective({}, lay);
  assert.ok(V.isCalibrated(eff), 'built-in draft boxes are enough');
  assert.equal(V.slotLayout(eff).length, 14);
  const mine = { mePickFirst: { x: 0.01, y: 0.2, w: 0.1, h: 0.1 } };
  assert.deepEqual(L.effective(mine, lay).mePickFirst, mine.mePickFirst);
  for (const r of Object.values(lay.regions)) for (const k of ['x', 'y', 'w', 'h']) assert.ok(r[k] > 0 && r[k] < 1, k);
});

test('status says, per part, whether boxes are yours, built-in, mixed or missing', () => {
  const lay = L.layoutFor(1920, 1080);
  const st = (own) => Object.fromEntries(L.status(own, lay).map((p) => [p.id, p.state]));
  assert.deepEqual(st({}), { draft: 'built-in', oppName: 'missing', cr: 'missing', crx: 'missing', result: 'built-in', help: 'missing' });
  assert.equal(st({ mePreban1: { x: 0.3, y: 0.86, w: 0.04, h: 0.07 } }).draft, 'mixed');
  assert.equal(st({ crBar: { x: 0, y: 0, w: 0.1, h: 0.5 } }).cr, 'mine');
  assert.equal(L.status({}, null)[0].state, 'missing');
});

test('saving keeps only boxes that differ from the built-in ones', () => {
  const lay = L.layoutFor(1920, 1080);
  const moved = { ...lay.regions.mePickFirst, x: lay.regions.mePickFirst.x + 0.02 };
  const own = L.ownOnly({ ...lay.regions, mePickFirst: moved, crBar: { x: 0, y: 0.1, w: 0.05, h: 0.6 } }, lay);
  assert.deepEqual(Object.keys(own).sort(), ['crBar', 'mePickFirst']);
});
