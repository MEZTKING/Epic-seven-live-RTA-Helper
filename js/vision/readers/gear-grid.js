/*
 * Reader: the inventory in the "Full" display format (DEVLOG #77). Reads EVERY item on the screen at once (main stat
 * and substats from their icons + numbers, enhance, level, set badge, worn / locked), no clicking needed; scroll to
 * read more. Positions and icons: js/geargrid.js. Publishes, once per still screen:
 *   'gear:grid' { slot, tiles: [{ item, key, rect, worn, locked, selected, pics }] }   (rect: the tile's picture, fractions;
 *               pics: { icon, shot } JPEGs of the item and of the whole tile)
 *   'gear:grid-gone' {}   the Full grid is no longer on screen (the overlay takes its labels off)
 * Set badges: the game shows a set only as a small badge. The reader learns each badge from the item details panel:
 * when you click an item, the panel names its set (gear-item.js) and the selected tile (gold frame) shows the badge;
 * they are remembered in localStorage['e7-gear-setbadges'] (on this PC). Badges seen on the owner's pictures with the
 * panel's set name (js/gear-setseed.js) are known from the start. An unknown badge: the item is kept without a set.
 * Only looks at the screen.
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const G = window.E7GearGrid;
  const P = window.RTAStatParse;
  if (!V || !G || !P) return;
  const KEY = 'e7-gear-setbadges';
  const SLOTS = [null, 'Weapon', 'Helmet', 'Armor', 'Necklace', 'Ring', 'Boots'];
  const TAB_X = [270, 388, 505, 623, 740, 857, 970];
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d', { willReadFrequently: true });

  const learned = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]') || [];
    } catch (_) {
      return [];
    }
  };
  const badges = () => [...learned(), ...(window.E7GearSetSeed || [])];

  /** Pixels of a 1070-high picture → this picture, for the anchor tried ('l' pinned left, 'c' centred 16:9). */
  function frame(ctx, a) {
    const W = ctx.w();
    const H = ctx.h();
    const k = H / 1070;
    const off = a === 'c' && W / H > 16 / 9 ? (W - (H * 16) / 9) / 2 : 0;
    return { W, H, k, X: (x) => off + x * k, Y: (y) => y * k };
  }
  const grab = (src, x, y, w, h, ow, oh) => {
    cv.width = ow;
    cv.height = oh;
    cx.drawImage(src, x, y, w, h, 0, 0, ow, oh);
    return cx.getImageData(0, 0, ow, oh).data;
  };
  const share = (d, test) => {
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i + 1], d[i + 2])) n++;
    return n / (d.length / 4);
  };

  /** Centres (px) of the white main-stat lines in the first two columns. */
  function rowsOf(src, f) {
    const x0 = f.X(G.GEO.valueX);
    const w = Math.max(8, Math.round(60 * f.k));
    const counts = new Array(Math.round(f.H)).fill(0);
    for (let c = 0; c < 2; c++) {
      const d = grab(src, x0 + c * f.k * G.GEO.colStep, 0, w, f.H, w, Math.round(f.H));
      for (let y = 0; y < counts.length; y++) {
        let n = 0;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const mn = Math.min(d[i], d[i + 1], d[i + 2]);
          if (mn > 185 && Math.max(d[i], d[i + 1], d[i + 2]) - mn < 40) n++;
        }
        counts[y] += n;
      }
    }
    // the same white line in both columns: halve the bar
    return G.mainRows(counts.map((n) => n / 2), f.k);
  }
  function iconAt(src, f, col, y) {
    const d = grab(src, f.X(G.GEO.colX + col * G.GEO.colStep), y - 14 * f.k, G.GEO.iconW * f.k, 28 * f.k, G.ICON_W, G.ICON_H);
    const g = new Float32Array(G.ICON_W * G.ICON_H);
    for (let i = 0; i < g.length; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    return G.classifyIcon(G.iconVector(g));
  }
  /** A tile part ([x, dy, w, h] in GEO units) → pixel box. */
  const part = (f, col, y, p) => ({ x: f.X(p[0] + col * G.GEO.colStep), y: y + p[1] * f.k, w: p[2] * f.k, h: p[3] * f.k });
  function badgeFp(src, f, col, y) {
    const b = part(f, col, y, G.GEO.set);
    return G.badgePrint(grab(src, b.x, b.y, b.w, b.h, G.BADGE, G.BADGE));
  }
  function maskCanvas(src, b, keep, scale) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(b.w * scale));
    c.height = Math.max(1, Math.round(b.h * scale));
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(src, b.x, b.y, b.w, b.h, 0, 0, c.width, c.height);
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
  // numbers: dark on white with a white border (digits touching the edge were misread: "500" -> "2100")
  const plainCanvas = (src, b, scale) => {
    const pad = 12;
    const c = document.createElement('canvas');
    c.width = Math.round(b.w * scale) + 2 * pad;
    c.height = Math.round(b.h * scale) + 2 * pad;
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, c.width, c.height);
    x.filter = 'grayscale(1) invert(1) contrast(1.4)';
    x.drawImage(src, b.x, b.y, b.w, b.h, pad, pad, c.width - 2 * pad, c.height - 2 * pad);
    return c;
  };
  /** Which slot tab is selected (bright blue behind it): 'Weapon' … or null for "all". */
  function slotOf(src, f) {
    let best = null;
    TAB_X.forEach((x, i) => {
      const d = grab(src, f.X(x - 45), f.Y(150), 90 * f.k, 50 * f.k, 18, 10);
      const s = share(d, (r, g, b) => b > 170 && b > r + 60);
      if (!best || s > best.s) best = { i, s };
    });
    // measured: the selected tab 0.18, the others 0
    return best && best.s > 0.06 ? SLOTS[best.i] : null;
  }
  function slotFromMain(main) {
    return { Attack: 'Weapon', Health: 'Helmet', Defense: 'Armor' }[main.type] || null;
  }

  /** Is this the Full grid (and anchored how)? The main-stat icon of the first row is sure in 3 of 4 columns. */
  function findGrid(src, ctx) {
    for (const a of ['l', 'c']) {
      const f = frame(ctx, a);
      if (f.W / f.H < 1.7 || f.W / f.H > 2.6) return null;
      const rows = rowsOf(src, f).filter((y) => y - 32 * f.k >= f.Y(205) && y + 142 * f.k <= f.H);
      if (!rows.length) continue;
      const sure = [0, 1, 2, 3].filter((c) => G.sureIcon(iconAt(src, f, c, rows[0]))).length;
      if (sure >= 3) return { a, f, rows };
    }
    return null;
  }

  async function readTile(ctx, f, col, y, slotTab) {
    const src = ctx.source;
    const icons = G.LINE_OFF.map((o) => iconAt(src, f, col, y + o * f.k));
    if (!G.sureIcon(icons[0])) return null;
    const lines = icons.map((r, i) => (i === 0 || G.sureIcon(r) ? r.stat : null));
    const n = lines.filter(Boolean).length;
    // the numbers: the main stat's line alone (big white digits read wrongly in a block: 500 -> 100), the substats as
    // one block, line by line again when the block does not give one number per icon (a lone "4" can be dropped)
    const colX = f.X(G.GEO.valueX + col * G.GEO.colStep);
    const lineBox = (i) => ({ x: colX, y: y + (G.LINE_OFF[i] - 14) * f.k, w: G.GEO.valueW * f.k, h: G.GEO.lineH * f.k });
    const one = async (i) => String((await ctx.ocr(plainCanvas(src, lineBox(i), 2.2 / f.k), { line: true, chars: '0123456789%,' })) || '');
    const subsBox = { x: colX, y: y + 21 * f.k, w: G.GEO.valueW * f.k, h: 121 * f.k };
    let subTexts = String((await ctx.ocr(plainCanvas(src, subsBox, 2.2 / f.k), { psm: '6', chars: '0123456789%,', lines: true })) || '').split('\n');
    const nSub = lines.slice(1).filter(Boolean).length;
    const subOk = subTexts.length === nSub && subTexts.every((t, j) => G.statFrom(lines.slice(1).filter(Boolean)[j], t));
    debug.push({ col, y: Math.round(y), lines, block: subTexts.slice(), redo: !subOk });
    if (!subOk) {
      subTexts = [];
      for (let i = 1; i < 5; i++) if (lines[i]) subTexts.push(await one(i));
    }
    const texts = [await one(0), ...subTexts];
    const stats = [];
    let t = 0;
    for (let i = 0; i < 5; i++) if (lines[i]) stats.push(G.statFrom(lines[i], texts[t++]));
    const [main, ...subs] = stats;
    if (!main || subs.some((s) => !s) || subs.length < 2) return { problem: `numbers not read (${texts.join(' | ')})` };
    // enhance badge (orange / red pill, white digits) — none = +0. White above 170 (190 lost the "6" of "+6")
    const bb = part(f, col, y, G.GEO.badge);
    let enhance = 0;
    if (share(grab(src, bb.x, bb.y, bb.w, bb.h, 20, 10), (r, g, b) => r > 170 && r - b > 90) > 0.25) {
      const tx = String((await ctx.ocr(maskCanvas(src, bb, (r, g, b) => r > 170 && g > 170 && b > 170, 96 / bb.h), { line: true, chars: '+0123456789' })) || '');
      const m = tx.match(/\d+/);
      // the "+" can be read as a digit ("+9" -> "49", "+15" -> "415"): above 15, the first digit was the "+"
      let n = m ? +m[0] : NaN;
      if (n > 15) n = +String(n).slice(1);
      enhance = n >= 0 && n <= 15 ? n : null;
      if (enhance === null) return { problem: `enhance not read (${tx})` };
    }
    const lb = part(f, col, y, G.GEO.level2);
    const lv = String((await ctx.ocr(maskCanvas(src, lb, (r, g, b) => r > 180 && g > 160 && r - b > 40, 80 / lb.h), { psm: '10', chars: '0123456789' })) || '');
    const pic = part(f, col, y, G.GEO.picture);
    const rank = G.rankFrom(subs.length);
    // worn: the hero's round portrait has a pale beige ring (measured: worn 0.19-0.94 of the ring's points, not worn 0-0.06)
    const [pcx, pcy, pr] = G.GEO.portrait;
    let ring = 0;
    for (let a = 0; a < 32; a++) {
      const px = f.X(pcx + col * G.GEO.colStep) + Math.cos((a / 32) * 2 * Math.PI) * (pr - 1) * f.k;
      const py = y + pcy * f.k + Math.sin((a / 32) * 2 * Math.PI) * (pr - 1) * f.k;
      const d = grab(src, px - 0.5, py - 0.5, 1, 1, 1, 1);
      if (d[0] > 100 && d[0] - d[2] > 15 && d[0] - d[2] < 90 && d[1] > d[0] * 0.75) ring++;
    }
    const lk = part(f, col, y, G.GEO.lock);
    const locked = share(grab(src, lk.x, lk.y, lk.w, lk.h, 10, 10), (r, g, b) => Math.min(r, g, b) > 180 && Math.max(r, g, b) - Math.min(r, g, b) < 30) > 0.15;
    const fr = part(f, col, y, G.GEO.frame);
    // the gold frame is one pixel high: look at each row of the strip at full size
    const fw = Math.max(1, Math.round(fr.w));
    const fh = Math.max(1, Math.round(fr.h));
    const fd = grab(src, fr.x, fr.y, fw, fh, fw, fh);
    let selected = false;
    for (let yy = 0; yy < fh && !selected; yy++) {
      let n = 0;
      for (let x = 0; x < fw; x++) {
        const i = (yy * fw + x) * 4;
        if (fd[i] > 180 && fd[i + 1] > 150 && fd[i] - fd[i + 2] > 40) n++;
      }
      selected = n / fw > 0.6;
    }
    const fp = badgeFp(src, f, col, y);
    const hit = G.badgeSet(badges(), fp);
    const gear = slotTab || slotFromMain(main);
    if (!gear) return { problem: 'slot unknown (choose a slot tab)' };
    const item = { gear, set: hit ? hit.set : '', rank, level: G.levelFrom(lv, main, enhance), enhance, main, substats: subs, source: 'screen' };
    const W = ctx.w();
    const H = ctx.h();
    const shot = (pp, width) => {
      try {
        const b2 = part(f, col, y, pp);
        const c = document.createElement('canvas');
        c.width = width;
        c.height = Math.round((width * b2.h) / b2.w);
        c.getContext('2d').drawImage(src, b2.x, b2.y, b2.w, b2.h, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.85);
      } catch (_) {
        return null;
      }
    };
    const pics = { icon: shot(G.GEO.icon, 120), shot: shot(G.GEO.tile, 300), from: 'grid' };
    return { item, key: P.itemKey(item), rect: { x: pic.x / W, y: (y + 20 * f.k) / H, w: 0, h: 0 }, worn: ring / 32 > 0.15, locked, selected, fp, pics };
  }

  // the screen must stand still (the list scrolls): the same small picture twice, then read once
  let seen = { pic: null, read: false };
  let lastKeys = '';
  let debug = []; // test hook: the raw readings of the last screen
  let shown = false;
  const thumb = (ctx) => {
    const d = grab(ctx.source, 0, 0, ctx.w(), ctx.h(), 64, 36);
    const g = new Float32Array(64 * 36);
    for (let i = 0; i < g.length; i++) g[i] = d[i * 4 + 1];
    return g;
  };
  const diff = (a, b) => {
    if (!a || !b) return 255;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
    return s / a.length;
  };
  function gone(ctx, why) {
    seen = { pic: null, read: false };
    lastKeys = '';
    if (shown) ctx.publish('gear:grid-gone', {});
    shown = false;
    return ctx.note(why);
  }

  V.register({
    id: 'gear-grid',
    label: 'Gear: every item of the inventory screen (Full display format)',
    module: 'gear',
    every: 1200,
    ready: () => true,
    async read(ctx) {
      const grid = findGrid(ctx.source, ctx);
      if (!grid) return gone(ctx, 'Not the inventory in the Full format');
      const pic = thumb(ctx);
      if (diff(pic, seen.pic) > 3) {
        seen = { pic, read: false };
        return ctx.note('Inventory (Full): waiting for the list to stand still…');
      }
      if (seen.read) return ctx.note('Inventory (Full) read');
      seen.read = true;
      debug = [];
      const slot = slotOf(ctx.source, grid.f);
      ctx.busy('Reading your inventory…');
      const tiles = [];
      const problems = [];
      for (const y of grid.rows)
        for (let c = 0; c < 4; c++) {
          const t = await readTile(ctx, grid.f, c, y, slot);
          if (t && t.item) tiles.push(t);
          else if (t && t.problem) problems.push(t.problem);
          if (debug.length) debug[debug.length - 1].out = t ? t.problem || 'ok' : 'no main icon';
        }
      // set badges: the clicked item's set (details panel) goes with the selected tile's badge
      const last = window.E7GearItem && window.E7GearItem._last && window.E7GearItem._last();
      const sel = tiles.find((t) => t.selected);
      if (last && sel && last.item.set && Date.now() - last.at < 60000 && last.item.main.type === sel.item.main.type && last.item.main.value === sel.item.main.value && last.item.substats.map((s) => s.type + s.value).join() === sel.item.substats.map((s) => s.type + s.value).join()) {
        try {
          localStorage.setItem(KEY, JSON.stringify(G.learnBadge(learned(), last.item.set, sel.fp)));
        } catch (_) { /* full: only a hint */ }
        if (!sel.item.set) {
          sel.item.set = last.item.set;
          sel.key = P.itemKey(sel.item);
        }
      }
      for (const t of tiles) delete t.fp;
      const keys = tiles.map((t) => t.key).join('#');
      if (!tiles.length) return ctx.done(`Inventory (Full): nothing read${problems.length ? ` (${problems[0]})` : ''}`);
      if (keys !== lastKeys) {
        lastKeys = keys;
        shown = true;
        ctx.publish('gear:grid', { slot, tiles });
      }
      const noSet = tiles.filter((t) => !t.item.set).length;
      ctx.done(`Inventory: ${tiles.length} items read${noSet ? ` (${noSet} with a set badge not learned yet: click one of them once)` : ''}`);
      ctx.note(`Inventory (Full): ${tiles.length} items${problems.length ? `, ${problems.length} not read` : ''}`);
    },
  });
  window.E7GearGridReader = { _key: KEY, _find: (ctx) => findGrid(ctx.source, ctx), _debug: () => debug, _badgeAt: (src, W, H, col, y) => badgeFp(src, frame({ w: () => W, h: () => H }, 'l'), col, y) };
})();
