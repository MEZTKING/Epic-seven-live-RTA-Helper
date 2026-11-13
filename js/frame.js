/*
 * Where the game is inside a captured window or a screenshot (DEVLOG #38). Pure (Node + browser). Browser: window.E7Frame.
 *
 * The game fills its window except for what Windows adds around it: the title bar (rows of one colour, with a little
 * text and the – □ × buttons) and a thin border. Measured on the owner's screenshots:
 *   - title-bar rows are ≥ 0.96 uniform and take the window's colour (an accent colour or grey, never black), ending
 *     abruptly where the game starts (next rows ≤ 0.4 uniform);
 *   - the game itself can start with PURE BLACK uniform rows (RTA screens' top band), which must be kept.
 * So: cut a short (≤ 7% of the height) run of uniform, non-black rows from the top, and ≤ 1% of uniform non-black
 * rows/columns from the other sides. A loose Snipping Tool box can't be told apart from the game this way; readers
 * search around every position instead (js/layouts.js, js/faces.js WIDE_VARIANTS).
 *   E7Frame.detect(rgba, W, H) -> { x, y, w, h } in pixels (the whole picture when nothing should be cut)
 *   E7Frame.uniformity(rgba, W, H, i, vertical) -> share of pixels close to that row/column's median colour
 * Works at any size and shape; the result's shape is whatever the game's is (16:9, wider, taller).
 */
(function (root) {
  'use strict';
  const UNIFORM = 0.9; // a row/column this uniform is not game
  const TOL = 24; // |dr|+|dg|+|db| counted as "the same colour"

  function median(vals) {
    const s = vals.slice().sort((a, b) => a - b);
    return s[s.length >> 1];
  }
  function uniformity(rgba, W, H, i, vertical) {
    const n = vertical ? H : W;
    const step = Math.max(1, Math.floor(n / 400)); // ~400 samples per line is plenty
    const r = [];
    const g = [];
    const b = [];
    for (let k = 0; k < n; k += step) {
      const p = vertical ? (k * W + i) * 4 : (i * W + k) * 4;
      r.push(rgba[p]);
      g.push(rgba[p + 1]);
      b.push(rgba[p + 2]);
    }
    const mr = median(r);
    const mg = median(g);
    const mb = median(b);
    let same = 0;
    for (let k = 0; k < r.length; k++) if (Math.abs(r[k] - mr) + Math.abs(g[k] - mg) + Math.abs(b[k] - mb) < TOL) same++;
    return same / r.length;
  }
  function lineInfo(rgba, W, H, i, vertical) {
    const n = vertical ? H : W;
    const step = Math.max(1, Math.floor(n / 400));
    let sum = 0;
    let c = 0;
    for (let k = 0; k < n; k += step) {
      const p = vertical ? (k * W + i) * 4 : (i * W + k) * 4;
      sum += rgba[p] + rgba[p + 1] + rgba[p + 2];
      c++;
    }
    return { u: uniformity(rgba, W, H, i, vertical), bright: sum / c };
  }
  const BLACK = 45; // r+g+b below this = black (the game's own bands)
  /** How many lines to cut from one side: uniform, not black, at most `limit`; `abrupt` = the game must start right after. */
  function cutSide(rgba, W, H, from, dir, vertical, limit, abrupt) {
    let k = 0;
    while (k < limit) {
      const L = lineInfo(rgba, W, H, from + dir * k, vertical);
      if (L.u < UNIFORM || L.bright < BLACK) break;
      k++;
    }
    if (!k || k >= limit) return 0; // nothing, or too much to be a title bar / border
    if (abrupt) {
      // the next few lines must be clearly game (not just a slightly less even part of a big uniform area). The game's
      // own PURE BLACK band (RTA screens) is game too, even though it is perfectly even (review, DEVLOG #40)
      let u = 0;
      for (let j = 0; j < 3; j++) {
        const L = lineInfo(rgba, W, H, from + dir * (k + j), vertical);
        u += L.bright < BLACK ? 0 : L.u;
      }
      if (u / 3 > 0.75) return 0;
    }
    return k;
  }
  function detect(rgba, W, H) {
    const full = { x: 0, y: 0, w: W, h: H };
    if (!rgba || !W || !H) return full;
    const top = cutSide(rgba, W, H, 0, 1, false, Math.ceil(H * 0.07), true);
    const thinH = Math.max(2, Math.ceil(H * 0.01));
    const thinW = Math.max(2, Math.ceil(W * 0.01));
    const bottom = cutSide(rgba, W, H, H - 1, -1, false, thinH, false);
    const left = cutSide(rgba, W, H, 0, 1, true, thinW, false);
    const right = cutSide(rgba, W, H, W - 1, -1, true, thinW, false);
    return { x: left, y: top, w: W - left - right, h: H - top - bottom };
  }
  /** Same as detect(), as fractions of the picture. */
  function detectFractions(rgba, W, H) {
    const r = detect(rgba, W, H);
    return { x: r.x / W, y: r.y / H, w: r.w / W, h: r.h / H };
  }
  const api = { detect, detectFractions, uniformity, UNIFORM };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7Frame = api;
})(typeof self !== 'undefined' ? self : this);
