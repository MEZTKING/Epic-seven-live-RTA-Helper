/*
 * Guild War overview reader (DEVLOG #39): the three fortress names and which side is shown (our defense = shield,
 * the enemy = swords). Fortress names are per side and per war (owner: ours Domino / Crown / Log, enemy Stinger /
 * Darkwood / Vortex), so they're read here and used by the fortress-map reader (js/vision/readers/guild-fortress.js).
 * Also the two guild names in the left panel (ours by the green bar, the enemy by the red one): the Guild War page uses
 * the enemy guild to pick or start the war by itself (DEVLOG #40).
 * Stores localStorage 'e7-gw-forts' = { ours: [3 names], enemy: [3 names], side, ourGuild, enemyGuild, at } and
 * publishes 'guild:forts' { side, names, ourGuild, enemyGuild }.
 * The label band is read four ways (grey 2× and 3×, white letters only at two thresholds) and combined: on the owner's
 * overviews each pass missed a different name, together they read all six. The band is read again only when a name is
 * missing, the side changed, or after a minute.
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const G = window.E7GWMap;
  const L = window.E7Layouts;
  if (!V || !G || !L) return;
  const OTHER = /^(gw-enemy|gw-map|gw-battle|rta-)/;
  const KEY = 'e7-gw-forts';
  const norm = document.createElement('canvas');
  const nctx = norm.getContext('2d', { willReadFrequently: true });
  let lastKey = '';
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || 'null') || {};
    } catch (_) {
      return {};
    }
  };

  const PASSES = [
    { mode: 'grey', sc: 2 },
    { mode: 'white', sc: 2, min: 200, sat: 40 },
    { mode: 'white', sc: 2, min: 170, sat: 60 },
    { mode: 'grey', sc: 3 },
  ];
  let lastRead = { side: null, at: 0 };
  /** The name band as a canvas (sc× bigger), grey or white-letters-only. */
  function band(rect, pass) {
    const { mode, sc } = pass;
    const c = document.createElement('canvas');
    c.width = Math.round(rect.w * sc);
    c.height = Math.round(rect.h * sc);
    const x = c.getContext('2d', { willReadFrequently: true });
    if (mode === 'grey') x.filter = 'grayscale(1) contrast(1.4)';
    x.drawImage(norm, rect.x, rect.y, rect.w, rect.h, 0, 0, c.width, c.height);
    if (mode === 'white') {
      const d = x.getImageData(0, 0, c.width, c.height);
      const s = d.data;
      for (let i = 0; i < s.length; i += 4) {
        const mn = Math.min(s[i], s[i + 1], s[i + 2]);
        const mx = Math.max(s[i], s[i + 1], s[i + 2]);
        const v = mn > pass.min && mx - mn < pass.sat ? 0 : 255;
        s[i] = s[i + 1] = s[i + 2] = v;
      }
      x.putImageData(d, 0, 0);
    }
    return { c, sc };
  }

  V.register({
    id: 'guild-overview',
    label: 'Guild War overview (fortress names, which side)',
    module: 'guild',
    screen: 'gw-overview',
    every: 4000,
    ready: () => true,
    idle() {
      lastKey = '';
      lastRead = { side: null, at: 0 };
    },
    async read(ctx) {
      const cur = window.E7Screens && window.E7Screens.current();
      if (cur && OTHER.test(cur)) return ctx.note(`Not the overview (${cur})`);
      norm.width = Math.round((ctx.w() * G.NORM_H) / ctx.h());
      norm.height = G.NORM_H;
      nctx.drawImage(ctx.source, 0, 0, norm.width, norm.height);
      const W = norm.width;
      const H = norm.height;
      const lay = L.layoutFor(W, H);
      if (!lay) return ctx.note('This window shape is too unusual for the built-in positions');
      const rgba = nctx.getImageData(0, 0, W, H).data;
      const pr = lay.regions.gwFortPager;
      const side = G.toggleSide(rgba, W, H, { x: pr.x * W, y: pr.y * H, w: pr.w * W, h: pr.h * H });
      if (!side) return ctx.note('Not the overview (no shield / swords switch)');
      const st0 = read();
      const have = st0[side] && st0[side].filter(Boolean).length === 3 && st0.enemyGuild;
      if (have && lastRead.side === side && Date.now() - lastRead.at < 60000) {
        return ctx.note(`${side === 'ours' ? 'Our' : 'Enemy'} side: ${st0[side].join(' · ')}`);
      }
      const br = lay.regions.gwFortNames;
      const rect = { x: br.x * W, y: br.y * H, w: br.w * W, h: br.h * H };
      const words = [];
      for (const pass of PASSES) {
        const { c, sc } = band(rect, pass);
        for (const w of await ctx.ocrWords(c)) words.push({ ...w, x: rect.x + w.x / sc, y: rect.y + w.y / sc });
      }
      lastRead = { side, at: Date.now() };
      const names = G.fortNamesFromWords(words, W, H);
      // a fortress still missing: read just its part of the band as one line (more reliable for a single label)
      const refW = Math.min(W, (H * 16) / 9);
      const off = (W - refW) / 2;
      const SLOT = [[0.2, 0.46], [0.45, 0.71], [0.68, 0.96]];
      for (let i = 0; i < 3; i++) {
        if (names[i]) continue;
        const sx = off + SLOT[i][0] * refW;
        const sw = (SLOT[i][1] - SLOT[i][0]) * refW;
        for (const pass of [PASSES[1], PASSES[0], PASSES[2]]) {
          const { c } = band({ x: sx, y: rect.y, w: sw, h: rect.h }, pass);
          const one = G.fortNamesFromWords(
            String(await ctx.ocr(c, { line: true }))
              .split(/\s+/)
              .map((t) => ({ text: t, conf: 90, x: off + ((SLOT[i][0] + SLOT[i][1]) / 2) * refW })),
            W,
            H,
          )[i];
          if (one && !/^[^\p{Lu}]/u.test(one)) {
            names[i] = one;
            break;
          }
        }
      }
      // the two guild names: read two ways (grey + contrast, grey + more contrast at 1.5× size); only a name both
      // readings agree on (a letter of OCR noise allowed) and of at least 3 characters counts. One wrong reading
      // must never start a war for the whole guild.
      const guild = async (key) => {
        const r = lay.regions[key];
        const box = { x: r.x * W, y: r.y * H, w: r.w * W, h: r.h * H };
        const read1 = async (h, filter) => {
          const c = document.createElement('canvas');
          c.width = Math.round(box.w * (h / box.h));
          c.height = h;
          const x = c.getContext('2d');
          x.filter = filter;
          x.drawImage(norm, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height);
          return G.cleanGuild(await ctx.ocr(c, { line: true }));
        };
        const a = await read1(64, 'grayscale(1) contrast(1.6)');
        const b = await read1(96, 'grayscale(1) contrast(2.2)');
        if (a.length < 3) return '';
        return a === b || G.matchName(a, [b]) ? a : '';
      };
      const enemyGuild = await guild('gwEnemyGuild');
      const ourGuild = await guild('gwOurGuild');
      const found = names.filter(Boolean).length;
      if (!found && !enemyGuild) return ctx.note(`${side === 'ours' ? 'Our' : 'Enemy'} side: fortress names not readable`);
      const st = read();
      // names missing in this reading may come from the last one only if it was the same war (same enemy guild)
      const prev = !enemyGuild || !st.enemyGuild || st.enemyGuild === enemyGuild ? st[side] || [] : [];
      const merged = names.map((n, i) => n || prev[i] || null);
      const key = `${side}|${merged.join('|')}|${enemyGuild}`;
      ctx.note(`${enemyGuild ? `vs ${enemyGuild} · ` : ''}${side === 'ours' ? 'Our' : 'Enemy'} side: ${merged.map((n, i) => n || G.DEFAULT_FORTS[i]).join(' · ')}`);
      if (key === lastKey) return;
      lastKey = key;
      try {
        // enemyGuild is ONLY what this pass read (never carried over: a stale name could pick or start the wrong war)
        localStorage.setItem(KEY, JSON.stringify({ ...st, [side]: merged, side, ourGuild: ourGuild || st.ourGuild || '', enemyGuild, at: new Date().toISOString() }));
      } catch (_) { /* only a help */ }
      ctx.publish('guild:forts', { side, names: merged, ourGuild, enemyGuild });
    },
  });
})();
