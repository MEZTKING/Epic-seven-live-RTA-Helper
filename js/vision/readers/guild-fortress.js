/*
 * Guild War fortress map reader (DEVLOG #38, #39): which fortress is open and the names of its defenders, on either
 * side. Publishes 'guild:fortress' { side: 'enemy' | 'ours', index, fort, players: [{ name, raw, known, state, x, y }],
 * keep: {...} | null }. state = 'enemy' | 'ours' (ring colour = health left) | 'beaten' (grey ring).
 * Side: the ring colours (red enemy, green ours); when every defender is beaten, the side last shown on the overview.
 * Fortress names: read on the overview (js/vision/readers/guild-overview.js, 'e7-gw-forts'); until then "Left fortress"…
 * Picture work is in js/gwmap.js (badges, name boxes, pager); text via the watcher's OCR, one line per name.
 * Names are matched to names you already have (enemy players saved before, and fixes you typed:
 * localStorage 'e7-gw-known-names' and 'e7-gw-name-fixes', written by the Guild War page).
 * Any window size: the picture is scaled to E7GWMap.NORM_H first.
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const G = window.E7GWMap;
  const L = window.E7Layouts;
  if (!V || !G || !L) return;
  const OTHER = /^(gw-enemy|gw-overview|gw-battle|rta-)/;
  const norm = document.createElement('canvas');
  const nctx = norm.getContext('2d', { willReadFrequently: true });
  const readJSON = (k, d) => {
    try {
      return JSON.parse(localStorage.getItem(k) || 'null') || d;
    } catch (_) {
      return d;
    }
  };
  let lastKey = '';
  let pendingKey = '';
  let published = '';

  /** One name: crop → white-letter mask → only the letters around the middle → black on white for OCR. */
  async function readName(ctx, box) {
    const H = 64;
    const sc = H / box.h;
    const W = Math.max(8, Math.round(box.w * sc));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(norm, box.x, box.y, box.w, box.h, 0, 0, W, H);
    const px = x.getImageData(0, 0, W, H);
    const mask = G.letterMask(px.data, W, H);
    const span = G.letterSpan(mask, W, H);
    if (!span) return '';
    const pad = 12;
    const out = document.createElement('canvas');
    out.width = span[1] - span[0] + 1 + 2 * pad;
    out.height = H;
    const o = out.getContext('2d');
    const img = o.createImageData(out.width, H);
    for (let y = 0; y < H; y++) {
      for (let X = 0; X < out.width; X++) {
        const sx = X - pad + span[0];
        const v = sx >= span[0] && sx <= span[1] && mask[y * W + sx] ? 0 : 255;
        const p = (y * out.width + X) * 4;
        img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
        img.data[p + 3] = 255;
      }
    }
    o.putImageData(img, 0, 0);
    return ctx.ocr(out, { line: true });
  }
  function nameFrom(raw) {
    const clean = G.cleanName(raw);
    if (!clean) return null;
    const fixes = readJSON('e7-gw-name-fixes', {});
    if (fixes[clean.toLowerCase()]) return { name: fixes[clean.toLowerCase()], raw: clean, known: true };
    const known = G.matchName(clean, readJSON('e7-gw-known-names', []));
    return { name: known || clean, raw: clean, known: !!known };
  }

  V.register({
    id: 'guild-fortress',
    label: 'Guild War fortress map (which fortress, its players)',
    module: 'guild',
    screen: 'gw-map',
    every: 2500,
    ready: () => true,
    idle() {
      lastKey = pendingKey = published = '';
    },
    async read(ctx) {
      const cur = window.E7Screens && window.E7Screens.current();
      if (cur && OTHER.test(cur)) return ctx.note(`Not a fortress map (${cur})`);
      const sc = G.NORM_H / ctx.h();
      norm.width = Math.round(ctx.w() * sc);
      norm.height = G.NORM_H;
      nctx.drawImage(ctx.source, 0, 0, norm.width, norm.height);
      const W = norm.width;
      const H = norm.height;
      const rgba = nctx.getImageData(0, 0, W, H).data;
      const lay = L.layoutFor(W, H);
      if (!lay) return ctx.note('This window shape is too unusual for the built-in positions');
      const pr = lay.regions.gwFortPager;
      const pager = G.pagerIndex(rgba, W, H, { x: pr.x * W, y: pr.y * H, w: pr.w * W, h: pr.h * H });
      if (pager.contrast < 100) return ctx.note('Not a fortress map (no fortress indicator)');
      const badges = G.findBadges(rgba, W, H);
      const forts = readJSON('e7-gw-forts', {});
      const side = G.sideOf(badges) || forts.side || 'enemy';
      const fort = (forts[side] && forts[side][pager.index]) || G.DEFAULT_FORTS[pager.index];
      if (badges.length < 2) return ctx.note(`${fort}: no defenders found`);
      // the same map twice in a row before reading names (OCR is slow; the map may still be scrolling in)
      const key = `${side}|${pager.index}|${badges.map((b) => `${Math.round(b.x / 20)},${Math.round(b.y / 20)}${b.state[0]}`).join(';')}`;
      if (key === published) return ctx.note(`${fort} (${side === 'ours' ? 'our side' : 'enemy'}): ${badges.length + 1} defenders (read)`);
      if (key !== pendingKey) {
        pendingKey = key;
        return ctx.note(`${fort}: ${badges.length} defenders found, reading names…`);
      }
      const players = [];
      for (const b of badges) {
        const n = nameFrom(await readName(ctx, G.nameBox(b, H)));
        players.push({ ...(n || { name: '', raw: '', known: false }), state: b.state, x: b.x / W, y: b.y / H });
      }
      const kr = lay.regions.gwKeepName;
      const kn = nameFrom(await readName(ctx, { x: kr.x * W, y: kr.y * H, w: kr.w * W, h: kr.h * H }));
      lastKey = published = key;
      ctx.note(`${fort} (${side === 'ours' ? 'our side' : 'enemy'}): ${players.length} defenders + keep (${players.filter((p) => p.name).length + (kn ? 1 : 0)} names read, ${players.filter((p) => p.state === 'beaten').length} beaten)`);
      ctx.publish('guild:fortress', { side, index: pager.index, fort, players, keep: kn ? { ...kn, keep: true } : null });
    },
  });
})();
