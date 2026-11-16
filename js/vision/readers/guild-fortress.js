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

  /**
   * One name (DEVLOG #55): crop → letters without the white scenery (G.nameMask) → only the letters around the middle
   * → black on white, 96 px high → the text reader, in English and, when the names of that server are usually written
   * in another script, with that script's data too. Returns the readings [{ lang, text, conf }].
   */
  function nameCanvas(box) {
    const H = 96;
    const sc = H / box.h;
    const W = Math.max(8, Math.round(box.w * sc));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingQuality = 'high';
    x.drawImage(norm, box.x, box.y, box.w, box.h, 0, 0, W, H);
    const px = x.getImageData(0, 0, W, H);
    const mask = G.nameMask(px.data, W, H);
    const span = G.letterSpan(mask, W, H);
    if (!span) return null;
    const pad = 16;
    const out = document.createElement('canvas');
    out.width = span[1] - span[0] + 1 + 2 * pad;
    out.height = H + 2 * pad;
    const o = out.getContext('2d');
    const img = o.createImageData(out.width, out.height);
    for (let y = 0; y < out.height; y++) {
      for (let X = 0; X < out.width; X++) {
        const sx = X - pad + span[0];
        const sy = y - pad;
        const v = sy >= 0 && sy < H && sx >= span[0] && sx <= span[1] && mask[sy * W + sx] ? 0 : 255;
        const p = (y * out.width + X) * 4;
        img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
        img.data[p + 3] = 255;
      }
    }
    o.putImageData(img, 0, 0);
    return out;
  }
  const OTHER_LANGS = ['jpn', 'kor', 'chi_tra'];
  async function readName(ctx, box, lang) {
    const c = nameCanvas(box);
    if (!c) return [];
    const reads = [await ctx.ocr(c, { line: true, full: true })];
    const eng = G.cleanName(reads[0].text);
    if (lang) reads.push(await ctx.ocr(c, { line: true, full: true, lang }));
    // the server's usual script was not it (or there is none) and English made nothing of it: try the other scripts
    else if (!eng || reads[0].conf < 35) for (const l of OTHER_LANGS) reads.push(await ctx.ocr(c, { line: true, full: true, lang: l }));
    return reads;
  }
  /**
   * The spelling the official record site has for a name close to what was read (desktop app; the server's player
   * list is searched on this PC, nothing is sent). Only when ONE player is clearly the closest.
   */
  /** -> { best: the one clearly closest player or null, options: [names] close to the text (to choose from) } */
  async function official(world, text) {
    const R = window.__e7RecordsTest || (window.E7Desktop && window.E7Desktop.records);
    if (!R || !R.near || !world || !text) return { best: null, options: [] };
    try {
      const list = await Promise.race([R.near(world, text), new Promise((res) => setTimeout(() => res(null), 12000))]);
      if (!list || !list.length) return { best: null, options: [] };
      const [a, b] = list;
      const tie = b && b.d === a.d && b.name.toLowerCase() !== a.name.toLowerCase(); // two equally close players: do not guess
      return { best: tie ? null : a, options: [...new Set(list.map((x) => x.name))] };
    } catch (_) {
      return { best: null, options: [] };
    }
  }
  /**
   * The picture of a name as the game shows it (small JPEG), so it can be compared by eye with what was read and with
   * the spellings on offer, also by someone who cannot read or type that script (owner, DEVLOG #55).
   */
  function namePic(box) {
    try {
      const c = document.createElement('canvas');
      c.height = 40;
      c.width = Math.round((box.w * 40) / box.h);
      c.getContext('2d').drawImage(norm, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.7);
    } catch (_) {
      return '';
    }
  }
  async function nameFrom(reads, world, box) {
    const pic = box ? namePic(box) : '';
    const pick = G.pickRead(reads);
    const clean = pick.name;
    if (!clean) return reads.length ? { name: '', raw: '', known: false, pic } : null;
    const fixes = readJSON('e7-gw-name-fixes', {});
    if (fixes[clean.toLowerCase()]) return { name: fixes[clean.toLowerCase()], raw: clean, known: true, pic };
    const known = G.matchName(clean, readJSON('e7-gw-known-names', []));
    if (known) return { name: known, raw: clean, known: true, pic };
    const off = await official(world, clean);
    const name = off.best ? off.best.name : clean;
    return { name, raw: clean, known: false, official: !!off.best, options: off.options.filter((o) => o !== name), lang: pick.lang, pic };
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
      const bar = { x: pr.x * W, y: pr.y * H, w: pr.w * W, h: pr.h * H };
      const pager = G.pagerIndex(rgba, W, H, bar);
      if (pager.contrast < 100) return ctx.note('Not a fortress map (no fortress indicator)');
      // the overview has its side switch in the same place: one HALF lit, not one third (DEVLOG #55)
      if (G.barKind(rgba, W, H, bar).kind === 'overview') return ctx.note('Not a fortress map (the overview)');
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
      // which script the names are usually in, and whose player list knows the spelling: that side's server
      const server = side === 'ours' ? forts.ourServer || '' : forts.enemyServer || '';
      const lang = G.langFor(server);
      const world = G.worldFor(server);
      const players = [];
      for (const b of badges) {
        const nb = G.nameBox(b, H);
        const n = await nameFrom(await readName(ctx, nb, lang), world, nb);
        players.push({ ...(n || { name: '', raw: '', known: false }), state: b.state, x: b.x / W, y: b.y / H });
      }
      const kr = lay.regions.gwKeepName;
      const kb = { x: kr.x * W, y: kr.y * H, w: kr.w * W, h: kr.h * H };
      const kn0 = await nameFrom(await readName(ctx, kb, lang), world, kb);
      const kn = kn0 && kn0.name ? kn0 : null;
      lastKey = published = key;
      ctx.note(`${fort} (${side === 'ours' ? 'our side' : 'enemy'}): ${players.length} defenders + keep (${players.filter((p) => p.name).length + (kn ? 1 : 0)} names read, ${players.filter((p) => p.state === 'beaten').length} beaten)`);
      ctx.publish('guild:fortress', { side, index: pager.index, fort, players, keep: kn ? { ...kn, keep: true } : null });
    },
  });
})();
