/*
 * Guild War fortress map (DEVLOG #38): which fortress is open and where its players are. Pure (Node + browser).
 * Browser: window.E7GWMap. Used by js/vision/readers/guild-fortress.js and the Guild War page.
 *
 * Each side has three fortresses (Stinger, Darkwood, Vortex; owner, 2026-11-13). All three use the same castle picture;
 * which one is open is shown by the page indicator at the bottom right (a white pill: left / middle / right).
 * Every defender has a round portrait with a dark round BADGE next to it (house or tower symbol, red ring for the enemy);
 * the player's name is written under them. The keep (locked badge, middle of the castle) is at the same spot in all three.
 *
 * Measured on the owner's maps (Stinger, 2000×1070 and 1228×691, all 9 badges found, none elsewhere):
 *   badge: dark disc (r ≈ 0.030 × picture height): dark at 0.8 r and 0.9 r (≥ 90%), mean brightness at 0.9 r ≤ 65,
 *          ≥ 15% red pixels on its rim (0.97–1.1 r), and NOT dark just outside (≤ 70% at 1.3 r)
 *   name:  centred 0.045 h left of and 0.051 h below the badge centre; white letters with a dark outline
 * Work on a copy scaled to NORM_H (1070) pixels high: the thresholds hold at any window size.
 *
 *   findBadges(rgba, W, H)          -> [{ x, y, r }] (pixels of that picture)
 *   nameBox({x, y}, H)              -> { x, y, w, h } pixels around where the name is
 *   letterMask(rgba, W, H)          -> Uint8Array 1 = white letter pixel
 *   letterSpan(mask, W, H)          -> [left, right] columns of the letters around the middle (or null)
 *   cleanName(ocrText)              -> best name-like word ('' if none)
 *   matchName(raw, known)           -> a known name within a small edit distance, else null
 *   pagerIndex(rgba, W, H, rect)    -> { index: 0|1|2, contrast } (rect in pixels: the indicator bar)
 *   FORTS                           -> ['Stinger Fortress', 'Darkwood Fortress', 'Vortex Fortress']
 */
(function (root) {
  'use strict';
  const NORM_H = 1070;
  const FORTS = ['Stinger Fortress', 'Darkwood Fortress', 'Vortex Fortress'];
  const R_FRAC = 0.03;
  const N = 48;
  const COS = Array.from({ length: N }, (_, i) => Math.cos((2 * Math.PI * i) / N));
  const SIN = Array.from({ length: N }, (_, i) => Math.sin((2 * Math.PI * i) / N));

  function findBadges(rgba, W, H) {
    const R = R_FRAC * H;
    const lum = new Float32Array(W * H);
    const red = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < W * H; i++, p += 4) {
      const r = rgba[p];
      const g = rgba[p + 1];
      const b = rgba[p + 2];
      lum[i] = (r + g + b) / 3;
      red[i] = r > 110 && r - g > 55 ? 1 : 0;
    }
    const at = (cx, cy, f, k) => {
      const x = Math.min(W - 1, Math.max(0, Math.round(cx + R * f * COS[k])));
      const y = Math.min(H - 1, Math.max(0, Math.round(cy + R * f * SIN[k])));
      return y * W + x;
    };
    const darkFrac = (cx, cy, f) => {
      let n = 0;
      for (let k = 0; k < N; k++) if (lum[at(cx, cy, f, k)] < 95) n++;
      return n / N;
    };
    const meanAt = (cx, cy, f) => {
      let v = 0;
      for (let k = 0; k < N; k++) v += lum[at(cx, cy, f, k)];
      return v / N;
    };
    const rimAt = (cx, cy) => {
      let rim = 0;
      for (const f of [0.97, 1.04, 1.1]) {
        let n = 0;
        for (let k = 0; k < N; k++) n += red[at(cx, cy, f, k)];
        rim = Math.max(rim, n / N);
      }
      return rim;
    };
    // score at one point; strict = the measured rule, loose = worth refining around
    const score = (cx, cy, strict) => {
      const lim = strict ? { d: 0.9, mean: 65, out: 0.7, rim: 0.15 } : { d: 0.75, mean: 80, out: 0.8, rim: 0.08 };
      const d9 = darkFrac(cx, cy, 0.9);
      if (d9 < lim.d) return null;
      const d8 = darkFrac(cx, cy, 0.8);
      if (d8 < lim.d || meanAt(cx, cy, 0.9) > lim.mean) return null;
      const out = darkFrac(cx, cy, 1.3);
      if (out > lim.out) return null;
      const rim = rimAt(cx, cy);
      if (rim < lim.rim) return null;
      return d8 + d9 + rim - out;
    };
    const step = Math.max(2, Math.round(R / 10));
    const m = Math.ceil(R * 1.4);
    // the interface around the map (left Havoc bar, top bar, bottom bar) is never a defender
    const x0 = Math.max(m, Math.round(0.16 * H));
    const y0 = Math.max(m, Math.round(0.1 * H));
    const y1 = Math.min(H - m, Math.round(0.97 * H));
    const cands = [];
    for (let cy = y0; cy < y1; cy += step) {
      for (let cx = x0; cx < W - m; cx += step) {
        if (score(cx, cy, false) === null) continue;
        // refine: the best point nearby that passes the strict rule
        let best = null;
        for (let dy = -step; dy <= step; dy++) {
          for (let dx = -step; dx <= step; dx++) {
            const s = score(cx + dx, cy + dy, true);
            if (s !== null && (!best || s > best.s)) best = { s, x: cx + dx, y: cy + dy };
          }
        }
        if (best) cands.push(best);
      }
    }
    cands.sort((a, b) => b.s - a.s);
    const picked = [];
    for (const c of cands) if (picked.every((p) => (p.x - c.x) ** 2 + (p.y - c.y) ** 2 > (2.2 * R) ** 2)) picked.push(c);
    return picked.map((p) => ({ x: p.x, y: p.y, r: R })).sort((a, b) => a.y - b.y || a.x - b.x);
  }

  function nameBox(b, H) {
    const w = 0.26 * H;
    const h = 0.046 * H;
    return { x: b.x - 0.045 * H - w / 2, y: b.y + 0.051 * H - h / 2, w, h };
  }

  function letterMask(rgba, W, H) {
    const m = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < W * H; i++, p += 4) {
      const mn = Math.min(rgba[p], rgba[p + 1], rgba[p + 2]);
      const mx = Math.max(rgba[p], rgba[p + 1], rgba[p + 2]);
      m[i] = mn > 190 && mx - mn < 50 ? 1 : 0;
    }
    return m;
  }
  /** The letters of ONE name: the run of letter columns around the middle (gaps up to 0.35 × height). */
  function letterSpan(mask, W, H) {
    const col = new Array(W).fill(0);
    for (let y = Math.round(H * 0.22); y < Math.round(H * 0.84); y++) for (let x = 0; x < W; x++) col[x] += mask[y * W + x];
    const on = col.map((v) => v >= 2);
    const mid = Math.floor(W / 2);
    let start = -1;
    for (let d = 0; d <= mid && start < 0; d++) {
      if (on[mid - d]) start = mid - d;
      else if (mid + d < W && on[mid + d]) start = mid + d;
    }
    if (start < 0) return null;
    const gap = Math.round(0.35 * H);
    let L = start;
    let R = start;
    for (let x = start, g = 0; x >= 0; x--) {
      if (on[x]) (L = x), (g = 0);
      else if (++g > gap) break;
    }
    for (let x = start, g = 0; x < W; x++) {
      if (on[x]) (R = x), (g = 0);
      else if (++g > gap) break;
    }
    return [L, R];
  }

  function cleanName(text) {
    const words = String(text || '')
      .split(/\s+/)
      .map((t) => t.replace(/^[^\p{L}\p{N}#]+|[^\p{L}\p{N}#]+$/gu, '').replace(/\.[a-z]{0,2}$/i, ''))
      .filter((t) => t.length >= 2 && /[\p{L}]/u.test(t));
    return words.sort((a, b) => b.length - a.length)[0] || '';
  }
  function dist(a, b) {
    const m = a.length;
    const n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function matchName(raw, known) {
    const r = String(raw || '').toLowerCase();
    if (r.length < 2) return null;
    let best = null;
    for (const k of known || []) {
      const kk = String(k).toLowerCase();
      const dd = kk === r ? 0 : dist(r, kk);
      const allow = Math.max(1, Math.floor(kk.length / 4));
      if (dd <= allow && (!best || dd < best.d)) best = { name: k, d: dd };
    }
    return best ? best.name : null;
  }

  /** Which third of the indicator bar holds the bright pill. */
  function pagerIndex(rgba, W, H, rect) {
    const y0 = Math.max(0, Math.round(rect.y + rect.h * 0.3));
    const y1 = Math.min(H, Math.round(rect.y + rect.h * 0.7));
    const thirds = [0, 0, 0];
    const counts = [0, 0, 0];
    for (let y = y0; y < y1; y++) {
      for (let x = Math.max(0, Math.round(rect.x)); x < Math.min(W, Math.round(rect.x + rect.w)); x++) {
        const k = Math.min(2, Math.floor(((x - rect.x) / rect.w) * 3));
        const p = (y * W + x) * 4;
        thirds[k] += (rgba[p] + rgba[p + 1] + rgba[p + 2]) / 3;
        counts[k]++;
      }
    }
    const mean = thirds.map((t, i) => (counts[i] ? t / counts[i] : 0));
    const order = [0, 1, 2].sort((a, b) => mean[b] - mean[a]);
    return { index: order[0], contrast: mean[order[0]] - mean[order[1]], mean };
  }

  const api = { NORM_H, FORTS, findBadges, nameBox, letterMask, letterSpan, cleanName, matchName, pagerIndex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7GWMap = api;
})(typeof self !== 'undefined' ? self : this);
