/*
 * Reader: the enemy player's name in Guild War (enemy defense / profile screen).
 *   guild:name-read { text, rect, options?, pic?, lang? }  the name in the box (the Guild War page matches it to known
 *                                         players); options = other readings and close official spellings
 *   guild:name-read { text: '', away: true }  once, when that screen is left
 * Box: Guild War page "Set name box" (localStorage 'e7-guild-conn'.watchBox).
 * Since DEVLOG #56 the name is read by js/vision/names.js: any script (the enemy guild's server language, Chinese
 * characters, Latin), and the server's player list offers close spellings. Whose screen it is (ours or theirs) is
 * not known here, so an official spelling is only OFFERED, never put in place of what was read. The same picture is
 * not read twice.
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const own = () => {
    try {
      return (JSON.parse(localStorage.getItem('e7-guild-conn') || 'null') || {}).watchBox || null;
    } catch (_) {
      return null;
    }
  };
  // your own box wins; otherwise the built-in one (js/layouts.js, measured on a real enemy-defense screen; 16:9 only)
  let size = null;
  const builtIn = () => {
    const L = window.E7Layouts;
    const lay = L && size ? L.layoutFor(size.w, size.h) : L && L.LAYOUTS[0];
    return lay && lay.regions.gwName ? lay.regions.gwName : null;
  };
  const box = () => own() || builtIn();
  // screens that are certainly NOT the enemy screen (recognised from real screenshots): don't read names there
  const OTHER = /^(gw-map|gw-overview|gw-battle|rta-)/;
  let shown = false;
  /** Is a player's page open? The flat slate colour of its name panel (js/gwresult.js pageAt), pixels only. */
  const pc = document.createElement('canvas');
  pc.width = 24;
  pc.height = 15;
  const pcx = pc.getContext('2d', { willReadFrequently: true });
  function pageShown(ctx) {
    const R = window.E7GWResult;
    const L = window.E7Layouts;
    const lay = R && L ? L.layoutFor(ctx.w(), ctx.h()) : null;
    const reg = lay && lay.regions.gwPageBar;
    if (!reg) return true; // cannot tell: behave as before
    try {
      pcx.drawImage(ctx.source, reg.x * ctx.w(), reg.y * ctx.h(), reg.w * ctx.w(), reg.h * ctx.h(), 0, 0, 24, 15);
      return R.pageAt(pcx.getImageData(0, 0, 24, 15).data, 24, 15, { bar: { x: 0, y: 0, w: 24, h: 15 } });
    } catch (_) {
      return true;
    }
  }
  window.E7GWPage = { shown: pageShown };
  // the name box as last read (small grey picture) and what came out: the text reader is not asked again for the same picture
  let lastPic = null;
  let lastOut = null;
  const tiny = document.createElement('canvas');
  tiny.width = 48;
  tiny.height = 12;
  const tctx = tiny.getContext('2d', { willReadFrequently: true });
  function samePicture(src, b) {
    tctx.drawImage(src, b.x, b.y, b.w, b.h, 0, 0, 48, 12);
    const d = tctx.getImageData(0, 0, 48, 12).data;
    const g = new Uint8Array(48 * 12);
    for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
    let diff = 255;
    if (lastPic) {
      diff = 0;
      for (let i = 0; i < g.length; i++) diff += Math.abs(g[i] - lastPic[i]);
      diff /= g.length;
    }
    lastPic = g;
    return diff < 5;
  }
  const forts = () => {
    try {
      return JSON.parse(localStorage.getItem('e7-gw-forts') || 'null') || {};
    } catch (_) {
      return {};
    }
  };

  V.register({
    id: 'guild-name',
    label: 'Guild War enemy name',
    module: 'guild',
    // (no `screen`: a screen taught long ago at another window size kept this reader from ever running on the
    // owner's PC; the page is recognised by its own pixels now, pageShown() below. DEVLOG #62)
    every: 2000,
    ready: () => !!box(),
    hasBoxes: () => !!own(),
    idle(ctx) {
      if (shown) ctx.publish('guild:name-read', { text: '', away: true });
      shown = false;
      lastPic = lastOut = null;
      ctx.note('Waiting for an enemy defense / profile screen…');
    },
    async read(ctx) {
      size = { w: ctx.w(), h: ctx.h() };
      if (!pageShown(ctx)) {
        if (shown) ctx.publish('guild:name-read', { text: '', away: true });
        shown = false;
        lastPic = lastOut = null;
        return ctx.note('Waiting for a player\'s page (their defense / profile)…');
      }
      const r = box();
      const N = window.E7Names;
      const G = window.E7GWMap;
      const b = { x: r.x * ctx.w(), y: r.y * ctx.h(), w: r.w * ctx.w(), h: r.h * ctx.h() };
      if (samePicture(ctx.source, b) && lastOut) {
        shown = true;
        ctx.publish('guild:name-read', lastOut);
        return ctx.note(lastOut.text ? `Read "${lastOut.text.slice(0, 24)}"` : 'No name visible');
      }
      let out = null;
      if (N && G) {
        const server = forts().enemyServer || '';
        const n = await N.read(ctx, ctx.source, b, { lang: G.langFor(server), world: G.worldFor(server), offerOnly: true, clean: true });
        if (n && n.name) out = { text: n.name, rect: r, options: n.options || [], pic: n.pic || '', lang: n.lang || '' };
        else if (n) out = { text: '', rect: r };
      }
      // no letters found that way (an own box drawn loosely, an unusual window): the plain reading of the box
      if (!out) out = { text: await ctx.ocr(ctx.crop(r, { minH: 64 })), rect: r };
      lastOut = out;
      shown = true;
      ctx.publish('guild:name-read', out);
      ctx.note(out.text ? `Read "${out.text.slice(0, 24)}"` : 'No name visible');
    },
  });
})();
