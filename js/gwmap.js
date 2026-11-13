/*
 * Guild War fortress map (DEVLOG #38): which fortress is open and where its players are. Pure (Node + browser).
 * Browser: window.E7GWMap. Used by js/vision/readers/guild-fortress.js and the Guild War page.
 *
 * Each side has three fortresses, named per side and war (enemy: Stinger, Darkwood, Vortex; ours: Domino, Crown, Log;
 * owner, 2026-11-13); the overview shows their names (fortNamesFromWords) and which side is shown (toggleSide: the
 * shield / swords switch at the bottom right). All fortress maps use the same castle picture; which one is open is shown
 * by the page indicator at the bottom right (a white pill: left / middle / right). Players can be moved between
 * fortresses and places by the guild leader, so nothing here relies on fixed places.
 * Every defender has a round portrait with a dark round BADGE next to it (house or tower symbol). Its ring is the
 * defender's health: RED = enemy, GREEN = our side, all grey = beaten. The player's name is written under them. The keep
 * (locked badge for the enemy, gold one for us; middle of the castle) is at the same spot in all three.
 *
 * Measured on the owner's maps (2 enemy, 3 own; 2000×1070 and 1228×691; all 9 badges on each, beaten ones included):
 *   badge: dark disc (r ≈ 0.030 × picture height): dark at 0.8 r and 0.9 r (≥ 90%), mean brightness at 0.9 r ≤ 65,
 *          an even ring (brightness spread at 0.8 r ≤ 35; name labels are 49–64),
 *          a bright symbol in the middle (≥ 40% light pixels at 0.15 r or 0.3 r), NOT dark just outside (≤ 70% at 1.3 r).
 *          Ring colour (0.97–1.1 r, ≥ 4%: a short arc = little health left): red → 'enemy', green → 'ours', neither → 'beaten'
 *   name:  centred 0.045 h left of and 0.051 h below the badge centre; white letters with a dark outline
 * Work on a copy scaled to NORM_H (1070) pixels high: the thresholds hold at any window size.
 *
 *   findBadges(rgba, W, H)          -> [{ x, y, r, state: 'enemy' | 'ours' | 'beaten' }] (pixels of that picture)
 *   sideOf(badges)                  -> 'enemy' | 'ours' | null (most coloured rings)
 *   toggleSide(rgba, W, H, rect)    -> 'ours' | 'enemy' | null (overview: which half of the switch is lit)
 *   fortNamesFromWords(words, W, H) -> [left, middle, right] fortress names from OCR words on the overview
 *   nameBox({x, y}, H)              -> { x, y, w, h } pixels around where the name is
 *   letterMask(rgba, W, H)          -> Uint8Array 1 = white letter pixel
 *   letterSpan(mask, W, H)          -> [left, right] columns of the letters around the middle (or null)
 *   cleanName(ocrText)              -> best name-like word ('' if none)
 *   matchName(raw, known)           -> a known name within a small edit distance, else null
 *   pagerIndex(rgba, W, H, rect)    -> { index: 0|1|2, contrast } (rect in pixels: the indicator bar)
 *   cleanGuild(ocrText)             -> a guild name from the overview's name line ("OldMemory “Global" -> "OldMemory")
 *   DEFAULT_FORTS                   -> names used until the overview has been seen
 */
(function (root) {
  'use strict';
  const NORM_H = 1070;
  const DEFAULT_FORTS = ['Left fortress', 'Middle fortress', 'Right fortress'];
  const R_FRAC = 0.03;
  const N = 48;
  const COS = Array.from({ length: N }, (_, i) => Math.cos((2 * Math.PI * i) / N));
  const SIN = Array.from({ length: N }, (_, i) => Math.sin((2 * Math.PI * i) / N));

  function findBadges(rgba, W, H) {
    const R = R_FRAC * H;
    const lum = new Float32Array(W * H);
    const red = new Uint8Array(W * H);
    const green = new Uint8Array(W * H);
    const light = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < W * H; i++, p += 4) {
      const r = rgba[p];
      const g = rgba[p + 1];
      const b = rgba[p + 2];
      lum[i] = (r + g + b) / 3;
      red[i] = r > 110 && r - g > 55 ? 1 : 0;
      green[i] = g > 110 && g - r > 45 && g - b > 20 ? 1 : 0;
      light[i] = lum[i] > 140 && Math.max(r, g, b) - Math.min(r, g, b) < 40 ? 1 : 0;
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
    const stdAt = (cx, cy, f) => {
      let a = 0;
      let b = 0;
      for (let k = 0; k < N; k++) {
        const v = lum[at(cx, cy, f, k)];
        a += v;
        b += v * v;
      }
      return Math.sqrt(Math.max(0, b / N - (a / N) ** 2));
    };
    const maxFrac = (m, cx, cy, fs) => {
      let best = 0;
      for (const f of fs) {
        let n = 0;
        for (let k = 0; k < N; k++) n += m[at(cx, cy, f, k)];
        best = Math.max(best, n / N);
      }
      return best;
    };
    // score at one point; strict = the measured rule, loose = worth refining around
    const score = (cx, cy, strict) => {
      const lim = strict ? { d: 0.9, mean: 65, out: 0.7, glyph: 0.4, std: 35 } : { d: 0.75, mean: 80, out: 0.8, glyph: 0.25, std: 50 };
      const d9 = darkFrac(cx, cy, 0.9);
      if (d9 < lim.d) return null;
      const d8 = darkFrac(cx, cy, 0.8);
      if (d8 < lim.d || meanAt(cx, cy, 0.9) > lim.mean) return null;
      // an even dark ring (real badges ≤ 24), not white letters with dark outlines (a name label: 49–64)
      if (stdAt(cx, cy, 0.8) > lim.std) return null;
      const glyph = maxFrac(light, cx, cy, [0.15, 0.3]);
      if (glyph < lim.glyph) return null;
      const out = darkFrac(cx, cy, 1.3);
      if (out > lim.out) return null;
      return d8 + d9 + glyph - out;
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
    return picked
      .map((p) => {
        const rr = maxFrac(red, p.x, p.y, [0.97, 1.04, 1.1]);
        const gg = maxFrac(green, p.x, p.y, [0.97, 1.04, 1.1]);
        // any coloured arc = still standing (a nearly beaten defender keeps a short arc; beaten ones measured 0.00)
        const state = rr >= 0.04 && rr >= gg ? 'enemy' : gg >= 0.04 ? 'ours' : 'beaten';
        return { x: p.x, y: p.y, r: R, state };
      })
      .sort((a, b) => a.y - b.y || a.x - b.x);
  }
  function sideOf(badges) {
    const e = badges.filter((b) => b.state === 'enemy').length;
    const o = badges.filter((b) => b.state === 'ours').length;
    return e > o ? 'enemy' : o > e ? 'ours' : null;
  }
  /** Overview: the shield / swords switch, same place as the map's page indicator. Left half lit = our side. */
  function toggleSide(rgba, W, H, rect) {
    const half = (k) => {
      let s = 0;
      let n = 0;
      for (let y = Math.round(rect.y + rect.h * 0.3); y < Math.round(rect.y + rect.h * 0.7); y++) {
        for (let x = Math.round(rect.x + (k * rect.w) / 2); x < Math.round(rect.x + ((k + 1) * rect.w) / 2); x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const p = (y * W + x) * 4;
          s += (rgba[p] + rgba[p + 1] + rgba[p + 2]) / 3;
          n++;
        }
      }
      return n ? s / n : 0;
    };
    const l = half(0);
    const r = half(1);
    if (Math.abs(l - r) < 40) return null;
    return l > r ? 'ours' : 'enemy';
  }
  /**
   * Overview: the three fortress names from OCR words ({ text, conf, x } with x in pixels of a W×H picture; e.g. both a
   * grey and a white-letter reading of the label band). A name is a confident word that isn't "Fortress"; which
   * fortress it belongs to follows from where it is (measured: left 0.31–0.34, middle 0.56–0.60, right 0.79–0.81 of the
   * middle 16:9 part, on both sides' overviews).
   */
  function fortNamesFromWords(words, W, H) {
    const refW = Math.min(W, (H * 16) / 9);
    const off = (W - refW) / 2;
    const slots = [[], [], []];
    // a name read by several passes counts once; "Singer" (conf 0) etc. are dropped by the confidence rule
    for (const w of words || []) {
      const t = String(w.text || '').replace(/[^\p{L}\p{N}'-]/gu, '');
      if (t.length < 3 || /^fo/i.test(t) || (w.conf || 0) < 85 || !/^\p{Lu}/u.test(t)) continue;
      const fx = (w.x - off) / refW;
      const k = fx < 0.45 ? 0 : fx < 0.7 ? 1 : 2;
      if (!slots[k].some((s) => s.t.toLowerCase() === t.toLowerCase())) slots[k].push({ t, x: w.x });
    }
    return slots.map((s) => (s.length ? `${s.sort((a, b) => a.x - b.x).map((q) => q.t).join(' ')} Fortress` : null));
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

  /** Guild name from OCR of the overview's name line: everything before the server tag, symbols dropped. */
  function cleanGuild(text) {
    const out = [];
    for (const raw of String(text || '').split(/\s+/)) {
      const t = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      if (/^(global|asia|europe|korea|japan|kr|jp|eu|na|sea)$/i.test(t)) break;
      if (t && /[\p{L}\p{N}]/u.test(t)) out.push(t);
    }
    return out.join(' ').trim();
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

  const api = { NORM_H, DEFAULT_FORTS, cleanGuild, findBadges, sideOf, toggleSide, fortNamesFromWords, nameBox, letterMask, letterSpan, cleanName, matchName, pagerIndex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7GWMap = api;
})(typeof self !== 'undefined' ? self : this);
