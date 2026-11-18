/*
 * Profile art on the RTA versus screen (DEVLOG #70): a small fingerprint of the opponent's card, remembered with the
 * name the battle bar shows afterwards, so the next time the same art shows up the app can say who it probably is
 * before the draft (the game hides the name until the battle). Pure (Node + browser). Browser: window.E7ArtPrint.
 *
 * Measured on the owner's versus screens: the same art in three matches (also an older, smaller screenshot) 0.99-1.00,
 * different players' art at most 0.26. Popular art can belong to several players, so it is a hint, and every name
 * seen with that art is listed with how often.
 *
 *   CARD.me / CARD.opp           the art inside each player's card: centre x from the middle and box, units of the
 *                                picture's height (the versus screen is centred)
 *   cardBox(side, W, H)          -> { x, y, w, h } pixels
 *   fingerprint(rgba)            -> number[] (rgba of a FP_W×FP_H picture of the card) zero-mean, unit length
 *   similarity(a, b)             -> cosine
 *   remember(list, fp, name, extra, now) -> new list (one entry per art; names counted)
 *   lookup(list, fp)             -> null | { id, names: [{ name, n, server, last }], sim }
 *   entryFor(list, fp)           -> the remembered entry of this art (with its `id`), or null
 */
(function (root) {
  'use strict';
  const FP_W = 12;
  const FP_H = 18;
  const SAME = 0.93;
  const MAX = 400;
  // measured on 2000×1070 pictures: card art x = centre ± 225, y 285..960
  const CARD = { me: { cx: -522 / 1070, half: 225 / 1070 }, opp: { cx: 522 / 1070, half: 225 / 1070 }, y0: 285 / 1070, y1: 960 / 1070 };

  function cardBox(side, W, H) {
    const c = CARD[side === 'me' ? 'me' : 'opp'];
    const cx = W / 2 + c.cx * H;
    return { x: cx - c.half * H, y: CARD.y0 * H, w: 2 * c.half * H, h: (CARD.y1 - CARD.y0) * H };
  }
  function fingerprint(rgba) {
    const n = FP_W * FP_H;
    const v = new Array(n * 3);
    const mean = [0, 0, 0];
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) mean[c] += rgba[i * 4 + c] / n;
    let ss = 0;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 3; c++) {
        const x = rgba[i * 4 + c] - mean[c];
        v[i * 3 + c] = x;
        ss += x * x;
      }
    }
    const norm = Math.sqrt(ss) || 1;
    return v.map((x) => Math.round((x / norm) * 10000) / 10000);
  }
  function similarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }
  function closest(list, fp) {
    let best = null;
    for (const e of list || []) {
      const s = similarity(e.fp, fp);
      if (!best || s > best.sim) best = { e, sim: s };
    }
    return best;
  }
  function remember(list, fp, name, extra = {}, now = Date.now()) {
    const out = (list || []).map((e) => ({ ...e, names: (e.names || []).map((x) => ({ ...x })) }));
    if (!fp || !name) return out;
    const c = closest(out, fp);
    let e = c && c.sim >= SAME ? c.e : null;
    if (!e) {
      e = { id: `a${now.toString(36)}${out.length.toString(36)}`, fp, names: [], first: now };
      out.push(e);
    }
    if (!e.id) e.id = `a${(e.first || now).toString(36)}${out.indexOf(e).toString(36)}`;
    e.last = now;
    const key = String(name).toLowerCase();
    const x = e.names.find((y) => y.name.toLowerCase() === key);
    if (x) Object.assign(x, { n: x.n + 1, last: now, ...(extra.server ? { server: extra.server } : {}) });
    else e.names.push({ name, n: 1, last: now, ...(extra.server ? { server: extra.server } : {}) });
    e.names.sort((a, b) => b.n - a.n || b.last - a.last);
    return out.sort((a, b) => b.last - a.last).slice(0, MAX);
  }
  function lookup(list, fp) {
    const c = closest(list, fp);
    if (!c || c.sim < SAME || !c.e.names.length) return null;
    return { id: c.e.id, names: c.e.names.map((x) => ({ ...x })), sim: Math.round(c.sim * 100) / 100 };
  }
  function entryFor(list, fp) {
    const c = closest(list, fp);
    return c && c.sim >= SAME ? c.e : null;
  }

  const api = { FP_W, FP_H, SAME, CARD, cardBox, fingerprint, similarity, remember, lookup, entryFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7ArtPrint = api;
})(typeof self !== 'undefined' ? self : this);
