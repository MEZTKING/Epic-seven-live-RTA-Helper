/*
 * Reader: a hero's EQUIPMENT screen (Heroes → a hero), DEVLOG #84. Measured on the owner's 2000×1070 pictures (Arbiter
 * Vildred, Eligos, Rhianna and Luciella). The screen shows the hero's name, the hero's real stats (with artifact,
 * exclusive equipment, imprint …) and the six items as pictures (no item stats). Publishes, once per still screen:
 *   'gear:hero' { hero: { code, name }, stats: { atk, def, hp, spd, chc, chd, eff, efr, dac },
 *                 slots: [{ gear, enhance, level, set, art: { fp, id, name, gear }, rect }] }
 *   'gear:hero-gone' {}   the hero screen closed (the overlay takes its marks off)
 * The consumer links each slot to an item the app knows (same slot, design, set, enhance, level), so "who wears what"
 * follows the game without importing gear.txt again.
 * How the screen is recognised: the three round blue buttons at the bottom (Manage Equipment, Equip All, Unequip All:
 * 0.15-0.19 of their pixels bright blue, 0 on every other screen seen) and at least 3 item pictures (the filter menu
 * covers them). Positions are centred on the window (the hero screen is laid out around the middle).
 * Only looks at the screen.
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const G = window.E7GearGrid;
  if (!V || !G) return;
  const SLOTS = ['Weapon', 'Helmet', 'Armor', 'Necklace', 'Ring', 'Boots'];
  // the item pictures (box of 136, like an inventory tile's) and, from the box's corner, the "+15" badge, the level's 2nd
  // digit and the set badge (measured on Eligos' weapon at 3× zoom)
  const PIC = { x: [625, 1357], y: [408, 565, 720], size: 136 };
  const PART = { badge: [85, -8, 57, 26], level2: [25, 12, 16, 22], set: [92, 83, 48, 48] };
  const BUTTONS = [905, 1055, 1215];
  const STAT_KEYS = ['atk', 'def', 'hp', 'spd', 'chc', 'chd', 'eff', 'efr', 'dac'];
  const STAT_Y = [627, 660, 694, 730, 762, 797, 829, 862, 898]; // the middle of each stat's line
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d', { willReadFrequently: true });

  // measured on 2000 × 1070 (a 16:9 frame of 1902 in the middle): x from the left of that picture
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
  const share = (d, test) => {
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i + 1], d[i + 2])) n++;
    return n / (d.length / 4);
  };
  function isHeroScreen(ctx, f) {
    return BUTTONS.every((bx) => {
      const d = grab(ctx.source, f.X(bx - 30), f.Y(905), 60 * f.k, 60 * f.k, 20, 20);
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
      return share(d, (r, g, b) => b > r + 60 && b > 150) > 0.08 && sum / (d.length / 4) > 100;
    });
  }
  const part = (f, px, py, p) => ({ x: f.X(px + p[0]), y: f.Y(py + p[1]), w: p[2] * f.k, h: p[3] * f.k });
  function masked(src, b, keep, scale) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(b.w * scale));
    c.height = Math.max(1, Math.round(b.h * scale));
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(src, b.x, b.y, b.w, b.h, 0, 0, c.width, c.height);
    const im = x.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = keep(im.data[i], im.data[i + 1], im.data[i + 2]) ? 0 : 255;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
      im.data[i + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    return c;
  }
  const textCanvas = (src, b, scale, invert = true) => {
    const pad = 12;
    const c = document.createElement('canvas');
    c.width = Math.round(b.w * scale) + 2 * pad;
    c.height = Math.round(b.h * scale) + 2 * pad;
    const x = c.getContext('2d');
    x.fillStyle = invert ? '#fff' : '#000';
    x.fillRect(0, 0, c.width, c.height);
    x.filter = invert ? 'grayscale(1) invert(1) contrast(1.4)' : 'grayscale(1) contrast(1.4)';
    x.drawImage(src, b.x, b.y, b.w, b.h, pad, pad, c.width - 2 * pad, c.height - 2 * pad);
    return c;
  };
  const badges = () => {
    let learned = [];
    try {
      learned = JSON.parse(localStorage.getItem('e7-gear-setbadges') || '[]') || [];
    } catch (_) { /* none */ }
    return [...learned, ...(window.E7GearSetSeed || [])];
  };
  const arts = () => {
    try {
      return JSON.parse(localStorage.getItem('e7-gear-arts') || '[]') || [];
    } catch (_) {
      return [];
    }
  };
  /** The hero from the title: the app's hero list, exact or nearly (one or two letters off). */
  function heroOf(text) {
    const R = window.RTARoster;
    const list = (window.RTASources && (window.RTASources.allHeroes || (window.RTASources.officialSnapshot || {}).heroes)) || [];
    const norm = (s) => (R && R.normName ? R.normName(s) : String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''));
    const t = norm(text);
    if (t.length < 3) return null;
    let best = null;
    for (const h of list) {
      const n = norm(h.name);
      if (n === t) return { code: h.code, name: h.name };
      const d = lev(n, t);
      if (d <= Math.max(1, Math.floor(n.length / 8)) && (!best || d < best.d)) best = { code: h.code, name: h.name, d };
    }
    return best ? { code: best.code, name: best.name } : null;
  }
  function lev(a, b) {
    const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) m[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return m[a.length][b.length];
  }

  async function readSlot(ctx, f, i) {
    const src = ctx.source;
    const px = PIC.x[Math.floor(i / 3)];
    const py = PIC.y[i % 3];
    const pic = { x: f.X(px), y: f.Y(py), w: PIC.size * f.k, h: PIC.size * f.k };
    // an item is there: its red / purple / blue picture frame (the filter menu and empty slots are dark)
    const d = grab(src, pic.x, pic.y, pic.w, pic.h, 24, 24);
    if (share(d, (r, g, b) => Math.max(r, g, b) > 90 && Math.max(r, g, b) - Math.min(r, g, b) > 50) < 0.12) return null; // (items 0.23-0.55, the filter menu over them 0.02)
    const bb = part(f, px, py, PART.badge);
    let enhance = 0;
    if (share(grab(src, bb.x, bb.y, bb.w, bb.h, 20, 10), (r, g, b) => r > 170 && r - b > 90) > 0.25) {
      const tx = String((await ctx.ocr(masked(src, bb, (r, g, b) => r > 170 && g > 170 && b > 170, 96 / bb.h), { line: true, chars: '+0123456789' })) || '');
      const m = tx.match(/\d+/);
      let n = m ? +m[0] : NaN;
      if (n > 15) n = +String(n).slice(1);
      enhance = n >= 0 && n <= 15 ? n : null;
    }
    const lb = part(f, px, py, PART.level2);
    const lv = String((await ctx.ocr(masked(src, lb, (r, g, b) => r > 180 && g > 160 && r - b > 40, 80 / lb.h), { psm: '10', chars: '0123456789' })) || '');
    const sb = part(f, px, py, PART.set);
    // badges vary a little more on this screen (the art behind them): 0.87-0.97 for the same set (Rhianna's speed badges),
    // so 0.85 here, when no other set comes within 0.1
    const bfp = G.badgePrint(grab(src, sb.x, sb.y, sb.w, sb.h, G.BADGE, G.BADGE));
    const bySet = {};
    for (const e of badges()) {
      let v = 0;
      for (let j = 0; j < bfp.length; j++) v += bfp[j] * e.fp[j];
      bySet[e.set] = Math.max(bySet[e.set] || -1, v);
    }
    const ranked = Object.entries(bySet).sort((a, b) => b[1] - a[1]);
    const hit = ranked[0] && ranked[0][1] >= 0.85 && (!ranked[1] || ranked[0][1] - ranked[1][1] >= 0.1) ? { set: ranked[0][0] } : null;
    let art = null;
    const A = window.E7GearArts;
    if (A) {
      const ad = grab(src, pic.x + pic.w * A.BOX.x0, pic.y + pic.h * A.BOX.y0, pic.w * (A.BOX.x1 - A.BOX.x0), pic.h * (A.BOX.y1 - A.BOX.y0), A.FP, A.FP);
      const fp = A.fingerprint(ad);
      const known = A.lookup(arts(), fp);
      art = { fp, id: known ? known.entry.id : null, name: known ? known.entry.name : '', gear: SLOTS[i] };
    }
    dbg.push(`${SLOTS[i]} lv:'${lv}'`);
    return { gear: SLOTS[i], enhance, level: G.levelFrom(lv, null, enhance), set: hit ? hit.set : '', art, rect: { x: pic.x / ctx.w(), y: pic.y / ctx.h(), w: pic.w / ctx.w(), h: pic.h / ctx.h() } };
  }

  let dbg = [];
  let seen = { pic: null, read: false };
  let last = null; // what was read on this screen: { hero, stats, slots }
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

  V.register({
    id: 'hero-gear',
    label: "Gear: a hero's equipment screen (who wears what, the hero's real stats)",
    module: 'gear',
    every: 1500,
    ready: () => true,
    async read(ctx) {
      const f = frame(ctx);
      if (f.W / f.H < 1.7 || f.W / f.H > 2.6 || !isHeroScreen(ctx, f)) {
        if (seen.read && last) ctx.publish('gear:hero-gone', {});
        seen = { pic: null, read: false };
        return ctx.note("Not a hero's equipment screen");
      }
      const pic = thumb(ctx);
      if (diff(pic, seen.pic) > 3) {
        seen = { pic, read: false };
        return ctx.note('Hero screen: waiting for it to stand still…');
      }
      if (seen.read) return ctx.note(last ? `Hero screen read: ${last.hero.name}` : 'Hero screen: nothing read');
      seen.read = true;
      dbg = [];
      const slots = [];
      for (let i = 0; i < 6; i++) slots.push(await readSlot(ctx, f, i));
      if (slots.filter(Boolean).length < 3) return ctx.note('Hero screen: the items are covered (a menu is open?)');
      const title = String((await ctx.ocr(textCanvas(ctx.source, { x: f.X(95), y: f.Y(25), w: 620 * f.k, h: 55 * f.k }, 1.4 / f.k), { line: true })) || '');
      const hero = heroOf(title.replace(/[<>|]/g, ' '));
      if (!hero) return ctx.done(`Hero screen: the hero's name was not recognised ("${title.trim()}")`);
      // the stats: the column of numbers at once, line by line when that doesn't give nine (a bright background, red
      // capped numbers "100.0%")
      let col = String((await ctx.ocr(textCanvas(ctx.source, { x: f.X(380), y: f.Y(610), w: 100 * f.k, h: 305 * f.k }, 2 / f.k), { psm: '6', chars: '0123456789.,%', lines: true })) || '').split('\n');
      if (col.length !== STAT_KEYS.length || col.some((t) => !/\d/.test(t))) {
        col = [];
        for (const y of STAT_Y) col.push(String((await ctx.ocr(textCanvas(ctx.source, { x: f.X(380), y: f.Y(y - 17), w: 100 * f.k, h: 34 * f.k }, 2 / f.k), { line: true, chars: '0123456789.,%' })) || ''));
      }
      const stats = {};
      STAT_KEYS.forEach((k, i) => {
        const v = parseFloat(String(col[i] || '').replace(/,/g, ''));
        if (v >= 0) stats[k] = v;
      });
      if (Object.keys(stats).length < 7) for (const k of Object.keys(stats)) delete stats[k];
      last = { hero, stats, slots };
      ctx.publish('gear:hero', { hero, stats: Object.keys(stats).length ? stats : null, slots: slots.filter(Boolean) });
      ctx.done(`Hero screen: ${hero.name} · ${slots.filter(Boolean).length} items${Object.keys(stats).length ? ` · speed ${stats.spd}` : ''}`);
    },
  });
  window.E7HeroGear = { _last: () => last, _heroOf: heroOf, _debug: () => dbg };
})();
