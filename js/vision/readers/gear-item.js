/*
 * Reader: an item's details panel (Inventory, a hero's gear, the shop). Reads the lines with the shared text reader,
 * checks them (js/statparse.js) and publishes 'gear:item' once the same item was read twice in a row.
 *   gear:item { item, key, problems, rect, pics }   (rect = main-stat box, fractions of the game picture, for the overlay;
 *                                                    pics = { icon, shot } JPEGs of the item and its stats, built-in positions only;
 *                                                    art = { fp, name } the design's fingerprint and the item's name, #79)
 *   gear:gone {}                              the panel closed after an item was read (the overlay takes its verdict off)
 * Positions are built in (js/layouts.js gear*, DEVLOG #74): nothing to draw or teach. Boxes you drew earlier on the Gear
 * page (localStorage 'e7-gearscan-boxes') still win.
 * How the panel is recognised: the yellow words "Equipment Score" under the substats (the same on every item), then
 * the text reader must find "Equipment" / "Score" there. The panel is pinned to the right edge of the window; the
 * centred placement is tried as well for window shapes not seen yet. Only looks at the screen.
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const P = window.RTAStatParse;
  const L = window.E7Layouts;
  if (!V || !P || !L) return;
  const KEY = 'e7-gearscan-boxes';
  const own = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || 'null') || {};
    } catch (_) {
      return {};
    }
  };
  const drawn = () => ['main', 'sub0', 'sub1'].every((k) => own()[k]);
  const gate = window.E7VisionCore.repeatGate(2);
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d', { willReadFrequently: true });

  /** Share of yellow text pixels in a box (the "Equipment Score" words: about a quarter). */
  function yellowShare(ctx, r) {
    const W = ctx.w();
    const H = ctx.h();
    cv.width = 60;
    cv.height = 8;
    cx.drawImage(ctx.source, r.x * W, r.y * H, r.w * W, r.h * H, 0, 0, 60, 8);
    const d = cx.getImageData(0, 0, 60, 8).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 160 && d[i + 1] > 130 && d[i] - d[i + 2] > 50 && d[i + 1] - d[i + 2] > 30) n++;
    return n / (d.length / 4);
  }
  /**
   * The box as black text on white, keeping only pixels of one colour (the slot line is red / purple on dark red, the badge
   * digits white on orange): the plain grey crop loses them in the background.
   */
  function masked(ctx, r, keep, minH = 64) {
    const W = ctx.w();
    const H = ctx.h();
    const bw = r.w * W;
    const bh = r.h * H;
    const k = Math.max(1, minH / Math.max(1, bh));
    const c = document.createElement('canvas');
    c.width = Math.round(bw * k);
    c.height = Math.round(bh * k);
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(ctx.source, r.x * W, r.y * H, bw, bh, 0, 0, c.width, c.height);
    const im = x.getImageData(0, 0, c.width, c.height);
    const d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = keep(d[i], d[i + 1], d[i + 2]) ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    return c;
  }
  // the slot line is in the rarity's colour (Epic red, Heroic purple, Rare blue, Good green): bright AND coloured
  const RARITY_TEXT = (r, g, b) => Math.max(r, g, b) > 140 && Math.max(r, g, b) - Math.min(r, g, b) > 60;
  const WHITE_TEXT = (r, g, b) => r > 190 && g > 190 && b > 190;
  const CREAM_TEXT = (r, g, b) => r > 180 && g > 160 && r - b > 40; // the item level on the picture
  /** Is there an enhance badge (an orange / red pill)? No badge = +0. */
  function hasBadge(ctx, r) {
    const W = ctx.w();
    const H = ctx.h();
    cv.width = 20;
    cv.height = 10;
    cx.drawImage(ctx.source, r.x * W, r.y * H, r.w * W, r.h * H, 0, 0, 20, 10);
    const d = cx.getImageData(0, 0, 20, 10).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 170 && d[i] - d[i + 2] > 90) n++;
    return n / 200 > 0.25;
  }
  /** A box cut in two: the stat's name (left) and its value (right, where the numbers stand). */
  const part = (r, from, to) => ({ x: r.x + r.w * from, y: r.y, w: r.w * (to - from), h: r.h });
  // the built-in boxes, for the anchor where the panel was last found
  let anchor = null;
  let lastRaw = null; // the newest raw readings (test hook)
  let lastPub = null; // the newest item published { item, at } (the Full-grid reader learns set badges from it)
  function builtIn(ctx) {
    const W = ctx.w();
    const H = ctx.h();
    if (!L.layoutFor(W, H)) return null;
    const order = anchor ? [anchor, ...['r', 'c'].filter((a) => a !== anchor)] : ['r', 'c'];
    for (const a of order) {
      const lab = L.alternatives(W, H, 'gearScoreLabel').find((x) => x.anchor === a) || (a === 'r' ? L.alternatives(W, H, 'gearScoreLabel')[0] : null);
      if (!lab) continue;
      const y = yellowShare(ctx, lab.rect);
      if (y < 0.1 || y > 0.6) continue;
      anchor = lab.anchor;
      const at = (k) => (L.alternatives(W, H, k).find((x) => x.anchor === lab.anchor) || L.alternatives(W, H, k)[0]).rect;
      return {
        label: at('gearScoreLabel'),
        main: at('gearMain'),
        sub0: at('gearSub0'),
        sub1: at('gearSub1'),
        sub2: at('gearSub2'),
        sub3: at('gearSub3'),
        set: at('gearSet'),
        gear: at('gearType'),
        enhance: at('gearEnhance'),
        level: at('gearLevel'),
        pic: at('gearPic'),
        name: at('gearName'),
        shot: at('gearShot'),
      };
    }
    return null;
  }

  /** The design's fingerprint: the middle of the item picture (js/geararts.js BOX). */
  function artFp(ctx, r) {
    const A = window.E7GearArts;
    const W = ctx.w();
    const H = ctx.h();
    const c = document.createElement('canvas');
    c.width = A.FP;
    c.height = A.FP;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(ctx.source, (r.x + r.w * A.BOX.x0) * W, (r.y + r.h * A.BOX.y0) * H, r.w * (A.BOX.x1 - A.BOX.x0) * W, r.h * (A.BOX.y1 - A.BOX.y0) * H, 0, 0, A.FP, A.FP);
    return A.fingerprint(x.getImageData(0, 0, A.FP, A.FP).data);
  }
  /** A box of the game picture as a small JPEG (for the Gear page: the item as the game showed it). */
  function jpg(ctx, r, width) {
    try {
      const W = ctx.w();
      const H = ctx.h();
      const c = document.createElement('canvas');
      c.width = width;
      c.height = Math.max(1, Math.round((width * r.h * H) / (r.w * W)));
      c.getContext('2d').drawImage(ctx.source, r.x * W, r.y * H, r.w * W, r.h * H, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.85);
    } catch (_) {
      return null;
    }
  }
  let shown = false; // an item was published and its panel is still open
  function away(ctx) {
    gate.reset();
    if (shown) ctx.publish('gear:gone', {});
    shown = false;
    return ctx.note("Not an item's details panel");
  }

  V.register({
    id: 'gear-item',
    label: 'Gear: the item details panel (inventory)',
    module: 'gear',
    every: 1500,
    ready: () => true,
    async read(ctx) {
      const read = (r, minH = 48) => (r ? ctx.ocr(ctx.crop(r, { minH }), { line: true }).then((t) => String(t || '')) : Promise.resolve(''));
      let b;
      if (drawn()) b = own();
      else {
        b = builtIn(ctx);
        if (!b) return away(ctx);
        const label = await read(b.label, 40);
        if (!/equip|score|ment/i.test(label)) return away(ctx);
      }
      const main = await read(b.main);
      // your own boxes have no "Equipment Score" check: one line first, the rest only when it is a stat
      if (!b.label && !P.parseStatLine(main)) return away(ctx);
      const raw = { main, subs: [], set: await read(b.set), gear: '', enhance: '', level: '', rank: '' };
      for (const k of ['sub0', 'sub1', 'sub2', 'sub3']) if (b[k]) raw.subs.push(await read(b[k]));
      if (b.label) {
        // built-in panel: the slot line in colour (two lines: "Otherworldly / Epic Armor"), the badge in white
        raw.gear = String((await ctx.ocr(masked(ctx, b.gear, RARITY_TEXT, 90))) || '');
        if (hasBadge(ctx, b.enhance)) {
          const t = String((await ctx.ocr(masked(ctx, b.enhance, WHITE_TEXT, 96), { line: true, chars: '+0123456789' })) || '');
          raw.enhance = /\+/.test(t) ? t : `+${t.replace(/\D/g, '')}`;
        } else raw.enhance = '+0';
        raw.level = String((await ctx.ocr(masked(ctx, b.level, CREAM_TEXT, 80), { line: true, chars: '0123456789' })) || '');
        // a short value ("Speed 3") can be lost in the whole line: read the name and the digits apart
        for (const [i, k] of ['main', 'sub0', 'sub1', 'sub2', 'sub3'].entries()) {
          const cur = i ? raw.subs[i - 1] : raw.main;
          if (P.parseStatLine(cur) || (i && !/[a-z]{3}/i.test(cur))) continue;
          const name = await read(part(b[k], 0, 0.62));
          const val = String((await ctx.ocr(ctx.crop(part(b[k], 0.62, 1), { minH: 64 }), { line: true, chars: '0123456789,%' })) || '');
          if (i) raw.subs[i - 1] = `${name} ${val}`;
          else raw.main = `${name} ${val}`;
        }
      } else {
        raw.gear = await read(b.gear);
        raw.enhance = await read(b.enhance);
        raw.level = await read(b.level);
      }
      raw.rank = raw.gear;
      lastRaw = raw;
      const { item, problems } = P.itemFromReadings(raw);
      if (!item) {
        gate.reset();
        return ctx.note(`Can't read this item yet (${problems.join(', ')}).`);
      }
      // the level is often under the lock icon: a +15 weapon / helmet's main stat tells it (js/geargrid.js)
      const byMain = window.E7GearGrid && window.E7GearGrid.levelFromMain(item.main, item.enhance);
      if (byMain) item.level = byMain;
      const key = P.itemKey(item);
      if (gate.push(key)) {
        shown = true;
        lastPub = { item, at: Date.now() };
        const pics = b.pic ? { icon: jpg(ctx, b.pic, 120), shot: jpg(ctx, b.shot, 440), from: 'panel' } : null;
        // the design (js/geararts.js) and the item's name, so the design is known on every tile from now on (#79)
        let art = null;
        if (b.pic && window.E7GearArts) {
          const nameText = b.name ? String((await ctx.ocr(masked(ctx, b.name, (r, g, bl) => r > 200 && g > 200 && bl > 200, 160), { lines: true })) || '') : '';
          art = { fp: artFp(ctx, b.pic), name: window.E7GearArts.cleanName(nameText) };
          if (art.name) item.name = art.name;
        }
        ctx.publish('gear:item', { item, key, problems, rect: b.main, pics, art });
      }
      ctx.note(`Item: ${item.rank} ${item.gear} +${item.enhance} · ${item.main.type} ${item.main.value} · ${item.substats.length} substats`);
    },
  });
  window.E7GearItem = { _raw: () => lastRaw, _last: () => lastPub };
})();
