/*
 * Reader: an item's details panel (inventory, shop, drops). Reads the boxed lines with the shared text reader,
 * checks them (js/statparse.js) and publishes 'gear:item' once the same item was read twice in a row.
 *   gear:item { item, key, problems, rect }   (rect = main-stat box, fractions of the game picture, for the overlay)
 * Boxes: localStorage 'e7-gearscan-boxes', drawn on the Gear page ("Set boxes").
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const P = window.RTAStatParse;
  const KEY = 'e7-gearscan-boxes';
  const boxes = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || 'null') || {};
    } catch (_) {
      return {};
    }
  };
  const calibrated = () => ['main', 'sub0', 'sub1'].every((k) => boxes()[k]);
  const gate = window.E7VisionCore.repeatGate(2);

  V.register({
    id: 'gear-item',
    label: 'Gear item details',
    module: 'gear',
    screen: 'gear-item',
    every: 1500,
    ready: calibrated,
    hasBoxes: calibrated,
    idle(ctx) {
      gate.reset();
      ctx.note('Waiting for an item\'s details screen…');
    },
    async read(ctx) {
      const b = boxes();
      const read = (r) => (r ? ctx.ocr(ctx.crop(r, { minH: 48 })) : Promise.resolve(''));
      const raw = { main: await read(b.main), subs: [], set: await read(b.set), gear: await read(b.gear), enhance: await read(b.enhance), level: await read(b.level), rank: '' };
      for (const k of ['sub0', 'sub1', 'sub2', 'sub3']) if (b[k]) raw.subs.push(await read(b[k]));
      raw.rank = raw.gear;
      const { item, problems } = P.itemFromReadings(raw);
      if (!item) {
        gate.reset();
        ctx.note(`Can't read this item yet (${problems.join(', ')}).`);
        return;
      }
      const key = P.itemKey(item);
      if (gate.push(key)) ctx.publish('gear:item', { item, key, problems, rect: b.main });
      ctx.note(`Reading: ${item.gear} · ${item.main.type} ${item.main.value}`);
    },
  });
})();
