/*
 * Reader: the Steel Workshop's result after crafting (DEVLOG #96): "Success" with up to 10 new items (4 + 4 + 2), also
 * while "Arrange" is open (the items you tick to sell / extract). Publishes, once per still screen:
 *   'gear:craft' { tiles: [{ item, rect }] }   item = { gear, rank, level, enhance: 0, set, main, substats, gameScore }
 *   'gear:craft-gone' {}                       the screen left
 * The consumer (js/vision/consumers/gear.js) judges each item (worth enhancing or extract) and marks it on the game.
 * Positions measured on the owner's pictures (2000 × 1070): tile pictures 125 px at x 242 / 630 / 1017 / 1405, rows
 * y 312 / 485 / 657 (the last row: the middle two); in a tile, the main stat's icon at (148, 22) from the picture's
 * corner, the substats in two columns (148, 258) and two rows (68, 102), values 37 px right of their icons, the game's
 * yellow Equipment Score at the right of the main stat, the level (yellow) in the picture's top left, the set badge
 * at its bottom right. The stat icons are the inventory's (js/geargrid.js), grey here: recognised a little less
 * surely (crosshair = effectiveness ~0.38), so a lower bar than the inventory's, with a lead over the second.
 * Only looks at the screen.
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const G = window.E7GearGrid;
  if (!V || !G) return;
  const TILES = [[242, 312], [630, 312], [1017, 312], [1405, 312], [242, 485], [630, 485], [1017, 485], [1405, 485], [630, 657], [1017, 657]];
  const ICON_AT = [[148, 22], [148, 68], [258, 68], [148, 102], [258, 102]];
  const SIZE = 125;
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d', { willReadFrequently: true });
  function frame(ctx) {
    const W = ctx.w();
    const H = ctx.h();
    const k = H / 1070;
    const off = (W - (H * 16) / 9) / 2;
    return { W, H, k, X: (x) => off + (x - 49) * k, Y: (y) => y * k };
  }
  const grab = (src, x, y, w, h, ow, oh) => {
    cv.width = ow;
    cv.height = oh;
    cx.drawImage(src, x, y, w, h, 0, 0, ow, oh);
    return cx.getImageData(0, 0, ow, oh).data;
  };
  function iconAt(src, f, x, y) {
    const d = grab(src, f.X(x), f.Y(y - 14), 32 * f.k, 28 * f.k, G.ICON_W, G.ICON_H);
    const g = new Float32Array(G.ICON_W * G.ICON_H);
    for (let i = 0; i < g.length; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    return G.classifyIcon(G.iconVector(g));
  }
  const okIcon = (r) => !!r && r.score >= 0.3 && r.lead >= 0.05;
  // a white or grey-on-dark number, black on white for the text reader
  // keep(r, g, b, max): max = the brightest value in the box (ticked tiles in "Arrange" are dimmed)
  function numCanvas(src, f, x, y, w, h, keep) {
    const scale = 2.4 / f.k;
    const pad = 10;
    const c = document.createElement('canvas');
    c.width = Math.round(w * f.k * scale) + 2 * pad;
    c.height = Math.round(h * f.k * scale) + 2 * pad;
    const t = c.getContext('2d', { willReadFrequently: true });
    t.fillStyle = '#fff';
    t.fillRect(0, 0, c.width, c.height);
    t.drawImage(src, f.X(x), f.Y(y), w * f.k, h * f.k, pad, pad, c.width - 2 * pad, c.height - 2 * pad);
    const im = t.getImageData(0, 0, c.width, c.height);
    let max = 0;
    for (let i = 0; i < im.data.length; i += 4) {
      const px = (i / 4) % c.width;
      const py = Math.floor(i / 4 / c.width);
      if (px >= pad && py >= pad && px < c.width - pad && py < c.height - pad) max = Math.max(max, Math.max(im.data[i], im.data[i + 1], im.data[i + 2]));
    }
    for (let i = 0; i < im.data.length; i += 4) {
      const px = (i / 4) % c.width;
      const py = Math.floor(i / 4 / c.width);
      const inside = px >= pad && py >= pad && px < c.width - pad && py < c.height - pad; // the white margin stays white
      const v = inside && keep(im.data[i], im.data[i + 1], im.data[i + 2], max) ? 0 : 255;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
    }
    t.putImageData(im, 0, 0);
    return c;
  }
  const light = (r, g, b, max) => Math.min(r, g, b) > Math.max(70, max * 0.62) && Math.max(r, g, b) - Math.min(r, g, b) < 50;
  const yellow = (r, g, b, max) => r > Math.max(90, max * 0.6) && g > r * 0.7 && b < r * 0.65;
  // a fresh (+0) item's substat values: anything else was misread (the "%" read as a 9: "4%" -> "49")
  const FRESH = { pct: [2, 9], Speed: [1, 5], Health: [140, 210], Attack: [30, 50], Defense: [25, 40] };
  const PCT_ONLY = { CriticalHitChance: 'CriticalHitChancePercent', CriticalHitDamage: 'CriticalHitDamagePercent', Effectiveness: 'EffectivenessPercent', EffectResistance: 'EffectResistancePercent' };
  function subFrom(icon, text, main = false) {
    const t = String(text || '');
    let digits = t.replace(/[oO]/g, '0').replace(/[^\d]/g, '');
    let pct = /%/.test(t);
    if (!digits) return null;
    const inRange = (v, r) => v >= r[0] && v <= r[1];
    if (main) return G.statFrom(icon, t);
    if (PCT_ONLY[icon]) {
      let v = +digits;
      if (!inRange(v, FRESH.pct) && digits.length > 1 && inRange(+digits.slice(0, -1), FRESH.pct)) v = +digits.slice(0, -1);
      return inRange(v, FRESH.pct) ? { type: PCT_ONLY[icon], value: v } : null;
    }
    if (icon === 'Speed') return inRange(+digits, FRESH.Speed) ? { type: 'Speed', value: +digits } : null;
    if (!FRESH[icon]) return null;
    // Attack / Health / Defense: flat in its range, else a percentage (with or without the "%" read)
    if (!pct && inRange(+digits, FRESH[icon])) return { type: icon, value: +digits };
    let v = +digits;
    if (!inRange(v, FRESH.pct) && digits.length > 1 && inRange(+digits.slice(0, -1), FRESH.pct)) v = +digits.slice(0, -1);
    return inRange(v, FRESH.pct) ? { type: icon + 'Percent', value: v } : null;
  }
  // rarity from the picture's background: red Epic, purple Heroic, blue Rare
  // measured: Epic (99, 60, 51), Heroic (116, 59, 84), Rare (65, 82, 97); ticked in "Arrange": the same, darker
  function rankOf(src, f, ox, oy) {
    const d = grab(src, f.X(ox + 4), f.Y(oy + 20), 12 * f.k, 90 * f.k, 4, 18);
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
    }
    if (b > r) return 'Rare';
    if (r > b * 1.6) return 'Epic';
    if (r > g * 1.4) return 'Heroic';
    return null;
  }
  const SLOT_OF = { Attack: 'Weapon', Health: 'Helmet', Defense: 'Armor', Speed: 'Boots', CriticalHitChancePercent: 'Necklace', CriticalHitDamagePercent: 'Necklace', EffectivenessPercent: 'Ring', EffectResistancePercent: 'Ring' };

  async function readTile(ctx, f, ox, oy) {
    const src = ctx.source;
    const icons = ICON_AT.map(([a, b]) => iconAt(src, f, ox + a, oy + b));
    if (!G.sureIcon(icons[0]) && !(icons[0].score >= 0.6)) return null; // no item here
    const val = (i, keep = light) => {
      const [a, b] = ICON_AT[i];
      return ctx.ocr(numCanvas(src, f, ox + a + 36, oy + b - 15, i === 0 ? 75 : 68, 30, keep), { line: true, chars: '0123456789%' });
    };
    const mt = String((await val(0)) || '');
    const main = G.statFrom(icons[0].stat, mt);
    if (!main) return { problem: `main stat not read (${icons[0].stat} "${mt}")` };
    const subs = [];
    for (let i = 1; i < 5; i++) {
      if (!okIcon(icons[i])) continue;
      const s = subFrom(icons[i].stat, String((await val(i)) || ''));
      if (s) subs.push(s);
    }
    const score = String((await ctx.ocr(numCanvas(src, f, ox + 300, oy + 6, 60, 32, yellow), { line: true, chars: '0123456789' })) || '').replace(/\D/g, '');
    const lv = String((await ctx.ocr(numCanvas(src, f, ox + 2, oy + 2, 44, 30, yellow), { line: true, chars: '0123456789' })) || '').replace(/\D/g, '');
    const level = [85, 88, 90].includes(+lv) ? +lv : 85;
    // the set badge (smaller than the inventory's): matched against this screen's own badges (js/gear-setseed.js
    // E7GearSetSeedCraft); a set only when clearly ahead (else unknown: a wrong set is worse than none)
    const fp = G.badgePrint(grab(src, f.X(ox + 92), f.Y(oy + 78), 48 * f.k, 46 * f.k, G.BADGE, G.BADGE));
    const bySet = {};
    for (const e of window.E7GearSetSeedCraft || []) {
      if (!e.fp || e.fp.length !== fp.length) continue;
      let v = 0;
      for (let j = 0; j < fp.length; j++) v += fp[j] * e.fp[j];
      bySet[e.set] = Math.max(bySet[e.set] || -1, v);
    }
    const ranked = Object.entries(bySet).sort((a, b) => b[1] - a[1]);
    const set = ranked[0] && ranked[0][1] >= 0.75 && (!ranked[1] || ranked[0][1] - ranked[1][1] >= 0.08) ? ranked[0][0] : '';
    dbgBadges.push(ranked[0] ? `${ranked[0][0]}:${ranked[0][1].toFixed(2)}` : '-');
    const item = { gear: SLOT_OF[main.type] || 'Ring', rank: rankOf(src, f, ox, oy) || G.rankFrom(subs.length), level, enhance: 0, set, main, substats: subs, source: 'screen', ...(+score > 0 && +score < 200 ? { gameScore: +score } : {}) };
    return { item, rect: { x: f.X(ox) / ctx.w(), y: f.Y(oy + SIZE + 4) / ctx.h(), w: 0, h: 0 } };
  }

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
  let seen = { pic: null, read: false };
  let shown = false;
  let last = null;
  let prev = null; // the last full reading { at, done }
  let dbg = {};
  const dbgBadges = [];

  V.register({
    id: 'craft-result',
    label: 'Gear: the Steel Workshop after crafting (what to enhance, what to extract)',
    module: 'gear',
    every: 1500,
    ready: () => true,
    async read(ctx) {
      const f = frame(ctx);
      const gone = (why) => {
        if (shown) ctx.publish('gear:craft-gone', {});
        shown = false;
        seen = { pic: null, read: false };
        return ctx.note(why);
      };
      if (f.W / f.H < 1.7 || f.W / f.H > 2.6) return gone('');
      // cheap first: the first tile's white main-stat icon must be there
      const first = iconAt(ctx.source, f, TILES[0][0] + ICON_AT[0][0], TILES[0][1] + ICON_AT[0][1]);
      dbg = { first };
      if (!(first.score >= 0.6)) return gone('Not the Steel Workshop result');
      const pic = thumb(ctx);
      if (diff(pic, seen.pic) > 3) {
        seen = { pic, read: false };
        if (ctx.soon) ctx.soon();
        return ctx.note('Steel Workshop result: waiting for it to stand still…');
      }
      if (seen.read) return ctx.note(last ? `Steel Workshop result read: ${last} items` : 'Not the Steel Workshop result');
      seen.read = true;
      // the title says "Success"
      const title = String((await ctx.ocr(numCanvas(ctx.source, f, 850, 135, 300, 70, light), { line: true })) || '');
      dbg.title = title;
      if (!/succ?ess|uccess/i.test(title)) {
        last = null;
        return gone(`Not the Steel Workshop result (title "${title.trim()}")`);
      }
      ctx.busy && ctx.busy('Reading the crafted items…');
      const done = await Promise.all(TILES.map(([ox, oy]) => readTile(ctx, f, ox, oy)));
      let tiles = done.filter((t) => t && t.item);
      // "Arrange" dims the ticked items: the reading of the same items just before (same places, same main stat and
      // rarity, what is read now a part of what was read then) is used instead (DEVLOG #96)
      const same = (a, b) => a && b && a.item.main.value === b.item.main.value && a.item.rank === b.item.rank && a.item.substats.every((x) => b.item.substats.some((y) => y.type === x.type && y.value === x.value));
      if (prev && Date.now() - prev.at < 300000 && prev.done.length === done.length && done.every((t, i) => (!t || !t.item) === !prev.done[i] || same(t, prev.done[i]))) {
        tiles = prev.done.filter(Boolean);
      } else prev = { at: Date.now(), done: done.map((t) => (t && t.item ? t : null)) };
      last = tiles.length;
      if (!tiles.length) return ctx.note(`Steel Workshop result: nothing read (${done.map((t) => (t ? t.problem || 'ok' : '-')).join(' | ')})`);
      shown = true;
      ctx.publish('gear:craft', { tiles });
      if (ctx.done) ctx.done(`Steel Workshop: ${tiles.length} crafted items read`);
      ctx.note(`Steel Workshop result: ${tiles.length} items`);
    },
  });
  window.E7CraftResult = { TILES, ICON_AT, _debug: () => dbg, _badges: () => dbgBadges.splice(0) };
})();
