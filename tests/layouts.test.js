// Built-in screen layouts (js/layouts.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/layouts.js');
const V = require('../js/vision.js');

test('built-in layout at any window shape: scales with the height, anchored left / middle / right (DEVLOG #38)', () => {
  const base = L.LAYOUTS[0].regions;
  // 16:9: exactly the measured fractions
  const a = L.layoutFor(1920, 1080);
  assert.equal(a.id, 'steam-16x9');
  assert.ok(a.exact);
  assert.deepEqual(a.regions.gwDef1, { x: base.gwDef1.x, y: base.gwDef1.y, w: base.gwDef1.w, h: base.gwDef1.h });
  // the owner's maximized window, game picture 2000×1070 (1.87): the 16:9 design is 1902 px wide at that height
  const W = 2000, H = 1070, refW = (16 / 9) * H;
  const b = L.layoutFor(W, H);
  assert.ok(b && !b.exact);
  const px = (r) => ({ x: r.x * W, y: r.y * H, w: r.w * W, h: r.h * H });
  // left-anchored (pick slots of my side): same distance from the left edge, scaled by height
  assert.ok(Math.abs(px(b.regions.mePickFirst).x - base.mePickFirst.x * refW) < 0.5);
  // right-anchored (the fortress pager): same distance from the RIGHT edge
  const pg = px(b.regions.gwFortPager);
  assert.ok(Math.abs(W - (pg.x + pg.w) - (1 - base.gwFortPager.x - base.gwFortPager.w) * refW) < 0.5);
  // middle-anchored (pre-bans): same distance from the middle
  const pb = px(b.regions.mePreban1);
  assert.ok(Math.abs(pb.x - W / 2 - (base.mePreban1.x - 0.5) * refW) < 0.5);
  // sizes follow the height, not the width: a round icon stays round
  const ic = px(b.regions.gwDef1);
  assert.ok(Math.abs(ic.w - ic.h) < 0.5);
  // the Guild War defense panel's anchor isn't verified yet: both placements are offered
  const alts = L.alternatives(W, H, 'gwDef1');
  assert.deepEqual(alts.map((x) => x.anchor), ['l', 'c']);
  assert.equal(L.alternatives(1920, 1080, 'gwDef1').length, 1, 'at 16:9 all anchors are the same place');
  // narrower than 16:9: scales with the width, centred vertically; round stays round
  const n = L.layoutFor(1600, 1200).regions.gwDef1;
  assert.ok(Math.abs(n.w * 1600 - n.h * 1200) < 0.5);
  assert.equal(L.layoutFor(3000, 500), null, 'odd shapes: no layout');
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
