/*
 * Pick cards of the World Arena draft, recognised from the heroes' WIDE portraits (DEVLOG #41). Pure (Node + browser).
 * Browser: window.E7Wide.
 *
 * Idea and layout from E7DaT (github.com/ohrgon-game/E7DaT, MIT): every pick card shows the hero's wide portrait
 * ({code}_l.png, 89 px high; skins {code}_sNN_l.png; community repository CeciliaBot/E7Assets-Temp), mirrored on my side.
 * E7DaT matches SIFT features; measuring with SIFT on the owner's real BAN screen showed the portrait is always drawn at
 * the same place and size, so here it is compared directly (masked, brightness-independent correlation), like js/faces.js:
 *   - size: 1:1 on a screen 754 px high (portrait height = 89/754 of the screen height)
 *   - place: 2.5 px below the card's top, its OUTER edge 6 px inside the card's outer edge (left for mine, right for the
 *     enemy's), measured on a 1340×754 picture
 * Compared: the PW = 150 px next to the outer edge, at half size (75×44), with ±4 px of search.
 * Measured on the owner's BAN screen: all 10 cards right, scores 0.79–0.95 (a greyed-out card 0.64), next-best hero
 * 0.08–0.45 lower; on three screens without cards nothing passed isConfident().
 *
 *   SLOT                         card boxes as fractions of the 16:9 game picture (E7DaT layout.py)
 *   slotBox(side, i)             -> { x, y, w, h } fractions ('own' | 'enemy', i = 0..4)
 *   patchRect(slotPx, side, H)   -> the source rectangle (pixels) to draw into a BIG_W×BIG_H canvas
 *   patchFromRGBA(rgba)          -> four Float32Array GW×GH grey pictures, half size (from that BIG_W×BIG_H canvas)
 *   template(rgba, w, h)         -> { idx, val, n } from a wide portrait's pixels (enemy orientation), or null
 *   mirror(t)                    -> the same template for my side
 *   match(patches, templates)    -> { best, second, lead } (templates: [{ code, name, t }]; best = { code, name, score })
 *   isConfident(r)
 */
(function (root) {
  'use strict';
  const CAN_H = 754; // the screen height the measurements were made at
  const PH = 88; // portrait rows used (of 89)
  const PW = 150; // portrait columns used, from the outer edge
  const M = 4; // search margin, canonical pixels
  const BIG_W = PW + 2 * M + 2; // 160: two spare pixels so the half-size picture can also start one pixel later
  const BIG_H = PH + 2 * M + 2; // 98
  const NW = PW / 2; // 75
  const NH = PH / 2; // 44
  const GW = (PW + 2 * M) / 2; // 79
  const GH = (PH + 2 * M) / 2; // 48
  const INSET_X = 6;
  const INSET_Y = 2.5;
  const MIN_PIXELS = 600; // a portrait with fewer visible pixels in the compared part isn't used
  const SLOT = { top: 0.164, pitch: 0.1389, height: 0.124, own: [0.01, 0.245], enemy: [0.53, 0.765] };

  function slotBox(side, i) {
    const [x0, x1] = side === 'own' ? SLOT.own : SLOT.enemy;
    return { x: x0, y: SLOT.top + SLOT.pitch * i, w: x1 - x0, h: SLOT.height };
  }
  /** slotPx = the card's box in pixels of a game picture H pixels high. */
  function patchRect(slotPx, side, H) {
    const k = H / CAN_H;
    const x = side === 'own' ? slotPx.x + (INSET_X - M) * k : slotPx.x + slotPx.w - (INSET_X + PW + M) * k;
    return { x, y: slotPx.y + (INSET_Y - M) * k, w: BIG_W * k, h: BIG_H * k };
  }
  const lum = (d, p) => 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
  /**
   * BIG_W×BIG_H RGBA -> four GW×GH grey pictures (2×2 averages), starting at pixel (0,0), (1,0), (0,1), (1,1): together
   * with whole-sample shifts they give every 1-pixel alignment within ±M. [0] is the centred one.
   */
  function patchFromRGBA(rgba) {
    const out = [];
    for (const [px, py] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const g = new Float32Array(GW * GH);
      for (let y = 0; y < GH; y++) {
        for (let x = 0; x < GW; x++) {
          let s = 0;
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) s += lum(rgba, ((y * 2 + dy + py) * BIG_W + x * 2 + dx + px) * 4);
          g[y * GW + x] = s / 4;
        }
      }
      out.push(g);
    }
    return out;
  }
  /**
   * A wide portrait (RGBA, w×h, h = 89; other heights are scaled by the caller) -> template in ENEMY orientation:
   * its right-most PW columns, half size; only fully opaque samples count. idx = sample positions (in NW×NH),
   * val = their grey values, zero-mean and unit length (so a dot product with a patch gives the correlation).
   */
  function template(rgba, w, h) {
    if (!rgba || h < PH || w < 8) return null;
    const idx = [];
    const g = [];
    for (let y = 0; y < NH; y++) {
      for (let x = 0; x < NW; x++) {
        let s = 0;
        let ok = true;
        for (let dy = 0; dy < 2 && ok; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const sx = w - PW + x * 2 + dx; // right-aligned
            if (sx < 0) {
              ok = false;
              break;
            }
            const p = ((y * 2 + dy) * w + sx) * 4;
            if (rgba[p + 3] <= 128) {
              ok = false;
              break;
            }
            s += lum(rgba, p);
          }
        }
        if (ok) {
          idx.push(y * NW + x);
          g.push(s / 4);
        }
      }
    }
    return finish(idx, g);
  }
  function finish(idx, g) {
    const n = idx.length;
    if (n < MIN_PIXELS) return null;
    let mean = 0;
    for (const v of g) mean += v;
    mean /= n;
    let ss = 0;
    for (const v of g) ss += (v - mean) * (v - mean);
    const norm = Math.sqrt(ss);
    if (norm < 1e-3) return null;
    const val = new Float32Array(n);
    for (let i = 0; i < n; i++) val[i] = (g[i] - mean) / norm;
    return { idx: Uint16Array.from(idx), val, n };
  }
  /** The same portrait as drawn on MY side (flipped left-right; outer edge = left). */
  function mirror(t) {
    if (!t) return null;
    const order = Array.from({ length: t.n }, (_, i) => i);
    const idx = new Uint16Array(t.n);
    const val = new Float32Array(t.n);
    order.forEach((i, k) => {
      const y = Math.floor(t.idx[i] / NW);
      const x = t.idx[i] % NW;
      idx[k] = y * NW + (NW - 1 - x);
      val[k] = t.val[i];
    });
    return { idx, val, n: t.n };
  }
  /** Correlation of one template with the patch window at sample offset (ox, oy) (0..2M/2). */
  function score(patch, t, ox, oy) {
    let dot = 0;
    let s = 0;
    let s2 = 0;
    const idx = t.idx;
    const val = t.val;
    for (let i = 0; i < t.n; i++) {
      const id = idx[i];
      const y = (id / NW) | 0;
      const v = patch[(y + oy) * GW + (id - y * NW) + ox];
      dot += val[i] * v;
      s += v;
      s2 += v * v;
    }
    const varp = s2 - (s * s) / t.n;
    return varp > 1e-3 ? dot / Math.sqrt(varp) : -1;
  }
  const OFF = M / 2; // centre offset in samples (2)
  /**
   * patches: the four grey pictures from patchFromRGBA. templates: [{ code, name, t }] for that side (several per hero
   * = skins). First every template at the centre, then the best `refine` again at every 1-pixel shift within ±M;
   * best score per hero.
   */
  function match(patches, templates, refine = 14) {
    const first = [];
    for (let i = 0; i < templates.length; i++) first.push([score(patches[0], templates[i].t, OFF, OFF), i]);
    first.sort((a, b) => b[0] - a[0]);
    const byCode = new Map();
    const put = (i, s) => {
      const T = templates[i];
      const cur = byCode.get(T.code);
      if (!cur || s > cur.score) byCode.set(T.code, { code: T.code, name: T.name, score: s });
    };
    first.forEach(([s, i], rank) => {
      let best = s;
      if (rank < refine) {
        for (const patch of patches) for (let oy = 0; oy <= 2 * OFF; oy++) for (let ox = 0; ox <= 2 * OFF; ox++) best = Math.max(best, score(patch, templates[i].t, ox, oy));
      }
      put(i, best);
    });
    const ranked = [...byCode.values()].sort((a, b) => b.score - a.score);
    const best = ranked[0] || null;
    const second = ranked[1] || null;
    return { best, second, lead: best ? best.score - (second ? second.score : 0) : 0 };
  }
  /** Sure enough to name the hero (see the measurements at the top). */
  function isConfident(r) {
    if (!r || !r.best) return false;
    return (r.best.score >= 0.75 && r.lead >= 0.06) || (r.best.score >= 0.58 && r.lead >= 0.085);
  }

  const api = { CAN_H, PH, PW, M, BIG_W, BIG_H, NW, NH, GW, GH, SLOT, slotBox, patchRect, patchFromRGBA, template, mirror, score, match, isConfident };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7Wide = api;
})(typeof self !== 'undefined' ? self : this);
