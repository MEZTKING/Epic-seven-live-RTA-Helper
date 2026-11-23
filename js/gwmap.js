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
 *   cleanGuild(ocrText)             -> a guild name from the overview's name line ("SomeGuild “Global" -> "SomeGuild")
 *   DEFAULT_FORTS                   -> names used until the overview has been seen
 *   barKind(rgba, W, H, rect)       -> { kind: 'map' (+ index) | 'overview' (+ side) | null }: page indicator or side switch
 *   serverOf(text) / langFor(server) / worldFor(server)  server tag -> text-reader language / record-site code
 *   nameMask(rgba, W, H, opts)      -> letters of a name crop without white scenery (patches that cannot be letters dropped)
 *   nameLetters(rgba, W, H, opts)   -> { mask, span, band } the letters of ONE name: the line around the middle, specks cleared
 *   cleanCjk(text) / pickRead(readings)  names in Japanese / Korean / Chinese script; which reading to believe
 *   FORT_PLACES / placesToCheck(rgba, W, H, fortIndex, badges)  the fixed places of each fortress; places with a badge the finder missed
 *   darkerOfTwo(rgbaA, rgbaB)       -> two looks at one map with the falling snow taken out (null: not the same view)
 *   isStandbyTitle(ocrText)         -> true for the standby page's title ("Guild War Standby")
 *   standbyMinutes(ocrText)         -> minutes until the next war from "War Begins in 29h" ("in 1d 5h", "in 45m"), or null
 *   greenShare(rgba, W, H, rect)    -> share of clearly green pixels in a rect (the standby page's Team Formation button)
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
    // Two more looks of a badge (the owner's maps of a running war, DEVLOG #59):
    // "Battle in Progress": crossed swords, and an orange "1/3" tag lies over part of the ring, so the ring is not
    // dark all round (measured 0.85 / 0.88 dark, spread 39). Accepted only with a strong glyph AND a coloured ring.
    const tagScore = (cx, cy) => {
      const d9 = darkFrac(cx, cy, 0.9);
      const d8 = darkFrac(cx, cy, 0.8);
      if (d9 < 0.8 || d8 < 0.8 || meanAt(cx, cy, 0.9) > 70 || stdAt(cx, cy, 0.8) > 46) return null;
      const glyph = maxFrac(light, cx, cy, [0.15, 0.3]);
      if (glyph < 0.5) return null;
      const out = darkFrac(cx, cy, 1.3);
      if (out > 0.7) return null;
      if (Math.max(maxFrac(red, cx, cy, [0.97, 1.04, 1.1]), maxFrac(green, cx, cy, [0.97, 1.04, 1.1])) < 0.25) return null;
      return d8 + d9 + glyph - out - 0.2;
    };
    // A BEATEN defender on the enemy's side: the whole badge is dark, glyph included (measured: ring all dark, spread
    // 13, glyph 84 against 40 on the ring, no colour). Only a dim grey glyph in an even dark disc tells it from
    // scenery, so these are marked `dim` and the reader keeps one only when a name stands under it.
    const dimScore = (cx, cy) => {
      const c = lum[Math.round(cy) * W + Math.round(cx)];
      if (c < 55 || c > 150) return null;
      const d9 = darkFrac(cx, cy, 0.9);
      if (d9 < 0.95) return null;
      const d8 = darkFrac(cx, cy, 0.8);
      if (d8 < 0.95 || darkFrac(cx, cy, 0.6) < 0.9 || meanAt(cx, cy, 0.9) > 60 || stdAt(cx, cy, 0.8) > 20) return null;
      const lift = meanAt(cx, cy, 0.15) - meanAt(cx, cy, 0.8);
      if (lift < 22 || meanAt(cx, cy, 0.15) > 140) return null;
      const out = darkFrac(cx, cy, 1.3);
      if (out > 0.7) return null;
      if (Math.max(maxFrac(red, cx, cy, [0.97, 1.04, 1.1]), maxFrac(green, cx, cy, [0.97, 1.04, 1.1])) >= 0.04) return null;
      return d8 + d9 - out - 0.5;
    };
    const step = Math.max(2, Math.round(R / 10));
    const m = Math.ceil(R * 1.4);
    // the interface around the map (left Havoc bar, top bar, bottom bar) is never a defender
    const x0 = Math.max(m, Math.round(0.16 * H));
    const y0 = Math.max(m, Math.round(0.1 * H));
    const y1 = Math.min(H - m, Math.round(0.97 * H));
    // …nor is the page indicator bottom right: its white pill in the dark bar looks like a beaten badge (seen on the
    // right fortress, where the pill is at the bar's end; DEVLOG #62)
    const pagerX = W - 0.5 * H;
    const pagerY = 0.89 * H;
    const cands = [];
    for (let cy = y0; cy < y1; cy += step) {
      for (let cx = x0; cx < W - m; cx += step) {
        if (cy > pagerY && cx > pagerX) continue;
        const usual = score(cx, cy, false) !== null;
        if (!usual && dimScore(cx, cy) === null) continue;
        // refine: the best point nearby that passes the strict rule (or one of the two other looks)
        let best = null;
        for (let dy = -step; dy <= step; dy++) {
          for (let dx = -step; dx <= step; dx++) {
            let s = usual ? score(cx + dx, cy + dy, true) : null;
            let kind = '';
            if (s === null && usual) {
              s = tagScore(cx + dx, cy + dy);
              kind = 'busy';
            }
            if (s === null) {
              s = dimScore(cx + dx, cy + dy);
              kind = 'dim';
            }
            if (s !== null && (!best || s > best.s)) best = { s, x: cx + dx, y: cy + dy, kind };
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
        // busy: "Battle in Progress" (someone is fighting this defender); dim: a dark beaten badge (kept by the reader
        // only on a known place of that fortress and with a name: dark scenery can look like one)
        return { x: p.x, y: p.y, r: R, state, ...(p.kind === 'busy' ? { busy: true } : {}), ...(p.kind === 'dim' ? { dim: true } : {}) };
      })
      .sort((a, b) => a.y - b.y || a.x - b.x);
  }
  /**
   * Where defenders can stand on each fortress map (the owner's tip: the places never move, a guild just leaves some
   * empty; DEVLOG #59). Collected from every map seen so far (9 maps, two window shapes): [x, y] with x from the
   * middle of the picture and both in units of its height, so they hold for any window size. Fortress 0 = left,
   * 1 = middle, 2 = right. Not complete: a place nobody stood on yet is not in the list.
   */
  const FORT_PLACES = [
    [[0.302, 0.222], [-0.359, 0.282], [0.547, 0.579], [-0.584, 0.748], [0.7, 0.781], [0.045, 0.863], [0.421, 0.396], [-0.514, 0.521], [-0.372, 0.793], [0.25, 0.664], [-0.172, 0.679], [0.367, 0.851]],
    [[-0.173, 0.255], [0.27, 0.269], [0.702, 0.751], [-0.592, 0.789], [0.602, 0.267], [0.547, 0.521], [-0.626, 0.54], [-0.111, 0.712], [-0.347, 0.788], [0.367, 0.852], [0.1, 0.852]],
    [[-0.205, 0.278], [-0.571, 0.279], [0.413, 0.305], [0.723, 0.463], [-0.614, 0.54], [0.442, 0.631], [-0.346, 0.792], [-0.607, 0.793], [0.406, 0.871]],
  ];
  /**
   * Known places of this fortress where findBadges found nothing but a dark round badge seems to be (a look of the
   * badge the finder does not know yet). -> [{ x, y, r, state: null, byPlace: true }]. The reader keeps one only when
   * a name stands under it.
   */
  /**
   * Is the app unsure of this name? Not when the guild has it, the official list confirms it, it was read on the
   * player's page or typed. Otherwise the reading must stand on its own: two readings agree, the reader was fairly
   * sure, at least three characters, no odd signs (DEVLOG #62; before, every name missing from the official list
   * was marked, also perfectly read ones).
   */
  function unsureName(p) {
    if (!p) return false;
    if (p.known || p.official || p.fromPage || p.fromGuild || p.typed) return false;
    if (!p.name) return true;
    return !(p.agree && (p.conf || 0) >= 70 && [...p.name].length >= 3 && !/[^\p{L}\p{N}_#.\-]/u.test(p.name));
  }
  /** Is this point one of the known places of that fortress (within 3% of the picture's height)? */
  function onPlace(index, x, y, W, H) {
    return (FORT_PLACES[index] || []).some(([fx, fy]) => Math.hypot((x - W / 2) / H - fx, y / H - fy) < 0.03);
  }
  function placesToCheck(rgba, W, H, index, badges) {
    const R = R_FRAC * H;
    const out = [];
    const dark = (cx, cy, f) => {
      let n = 0;
      for (let k = 0; k < N; k++) {
        const x = Math.min(W - 1, Math.max(0, Math.round(cx + R * f * COS[k])));
        const y = Math.min(H - 1, Math.max(0, Math.round(cy + R * f * SIN[k])));
        const p = (y * W + x) * 4;
        if ((rgba[p] + rgba[p + 1] + rgba[p + 2]) / 3 < 95) n++;
      }
      return n / N;
    };
    for (const [fx, fy] of FORT_PLACES[index] || []) {
      const px = W / 2 + fx * H;
      const py = fy * H;
      if (px < R || py < R || px > W - R || py > H - R) continue;
      if ((badges || []).some((b) => (b.x - px) ** 2 + (b.y - py) ** 2 < (1.5 * R) ** 2)) continue;
      let best = null;
      for (let dy = -8; dy <= 8; dy += 2) {
        for (let dx = -8; dx <= 8; dx += 2) {
          const d = Math.min(dark(px + dx, py + dy, 0.9), dark(px + dx, py + dy, 0.8));
          if (!best || d > best.d) best = { d, x: px + dx, y: py + dy };
        }
      }
      if (best && best.d >= 0.75) out.push({ x: best.x, y: best.y, r: R, state: null, byPlace: true });
    }
    return out;
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

  // ---- overview or fortress map? (DEVLOG #55) ------------------------------------------------------------------
  // Both have a bar at the bottom right, in the same place. On a MAP it is the page indicator: one THIRD is a solid
  // white pill, the rest is dark. On the OVERVIEW it is the side switch: one HALF is white (with a dark icon in it).
  // Measured on 12 real screens: map = one third ≥ 0.69 lit, the other two ≤ 0.03; overview = one half 0.55–0.86 lit,
  // the other ≤ 0.09, and the middle third 0.36–0.64 lit. Before this rule the overview reader took a map's indicator
  // for the switch, read scenery as fortress and guild names, and a war against a made-up guild was started.
  function barKind(rgba, W, H, rect) {
    const y0 = Math.max(0, Math.round(rect.y + rect.h * 0.3));
    const y1 = Math.min(H, Math.round(rect.y + rect.h * 0.7));
    const x0 = Math.max(0, Math.round(rect.x));
    const x1 = Math.min(W, Math.round(rect.x + rect.w));
    const n = x1 - x0;
    if (n < 12 || y1 <= y0) return { kind: null };
    const lit = new Uint8Array(n);
    for (let x = x0; x < x1; x++) {
      let s = 0;
      for (let y = y0; y < y1; y++) {
        const p = (y * W + x) * 4;
        s += (rgba[p] + rgba[p + 1] + rgba[p + 2]) / 3;
      }
      lit[x - x0] = s / (y1 - y0) > 170 ? 1 : 0;
    }
    const share = (a, b) => {
      let c = 0;
      for (let i = Math.floor(a * n); i < Math.floor(b * n); i++) c += lit[i];
      return c / Math.max(1, Math.floor(b * n) - Math.floor(a * n));
    };
    const t = [share(0, 1 / 3), share(1 / 3, 2 / 3), share(2 / 3, 1)];
    const h = [share(0, 0.5), share(0.5, 1)];
    const top = t.indexOf(Math.max(...t));
    if (t[top] >= 0.65 && t.every((v, i) => i === top || v <= 0.15)) return { kind: 'map', index: top, thirds: t, halves: h };
    const side = h[0] > h[1] ? 0 : 1;
    if (h[side] >= 0.5 && h[1 - side] <= 0.2 && t[1] >= 0.25) return { kind: 'overview', side: side === 0 ? 'ours' : 'enemy', thirds: t, halves: h };
    return { kind: null, thirds: t, halves: h };
  }

  // ---- servers and scripts (DEVLOG #55) -------------------------------------------------------------------------
  /** The server tag next to a guild name on the overview ("TestHome [Global]") -> 'global' | 'japan' | 'korea' | 'asia' | 'europe' | ''. */
  function serverOf(text) {
    const m = /\b(global|japan|korea|asia|europe)\b/i.exec(String(text || ''));
    return m ? m[1].toLowerCase() : '';
  }
  /** The text reader's language data for names of a server (besides English, which is always tried). */
  const langFor = (server) => ({ japan: 'jpn', korea: 'kor', asia: 'chi_tra' }[server] || '');
  /** The record site's code of a server. */
  const worldFor = (server) => ({ global: 'world_global', japan: 'world_jpn', korea: 'world_kor', asia: 'world_asia', europe: 'world_eu' }[server] || '');
  const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯ᄀ-ᇿ]/u;
  const cjkCount = (text) => [...String(text || '')].filter((ch) => CJK.test(ch)).length;
  /**
   * A name read with Japanese / Korean / Chinese data: the reader puts spaces between the characters and sometimes
   * adds stray Latin letters or symbols at the ends. -> the characters joined ('' when fewer than two of them).
   */
  // Kanji the reader gives for katakana that look the same. Only applied inside a name that is mostly katakana.
  const KATA_LOOK = { 口: 'ロ', 回: 'ロ', 囗: 'ロ', 力: 'カ', 夕: 'タ', 工: 'エ', 二: 'ニ', 八: 'ハ', 卜: 'ト', 一: 'ー', 千: 'チ', 才: 'オ', 又: 'ヌ', 匕: 'ヒ' };
  const isKata = (ch) => /[゠-ヿ]/u.test(ch);
  function cleanCjk(text, opts = {}) {
    let t = String(text || '').replace(/\s+/g, '');
    t = t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}ー～〜]+$/gu, '');
    const chars = [...t];
    const kata = chars.filter(isKata).length;
    if (kata >= 2 && kata >= chars.length * 0.5) t = chars.map((ch) => KATA_LOOK[ch] || ch).join('');
    // stray Latin / digits glued to the ends of a name that is otherwise in that script
    if (opts.keepLatin) {
      // …but on a clean panel (a player's page, a window) nothing is stray: a name like kana + "x" is kept
      // (DEVLOG #61). The reader sometimes gives a lone letter two or three times, in both cases ("xX", "xXx"): once
      // is meant.
      t = t.replace(/([A-Za-z])\1+$/i, '$1');
    } else if (cjkCount(t) >= 2 && cjkCount(t) >= t.length * 0.6) t = t.replace(/^[A-Za-z0-9]{1,2}(?=[^A-Za-z0-9])/, '').replace(/(?<=[^A-Za-z0-9])[A-Za-z0-9]{1,2}$/, '');
    return cjkCount(t) >= 2 ? t : '';
  }
  /**
   * Which reading of one name to believe. readings: [{ lang: 'eng' | 'jpn' | …, text, conf }].
   * A reading in the other script wins when it holds at least two of its characters, they make up most of it, and the
   * reader is not clearly less sure than the English one. -> { name, lang, conf } ('' when nothing usable).
   */
  /**
   * Snow on a fortress map falls across the names; the letters stand still (the owner's tip, DEVLOG #58). Two looks
   * at the same map a moment apart -> for every pixel the DARKER of the two: a white speck that moved is gone, a
   * white letter is still there. a, b: RGBA of the same size. Returns the cleaned RGBA, or null when the two pictures
   * are not the same view (more than `maxMoved` of the pixels differ strongly: the map was moved in between).
   */
  function darkerOfTwo(a, b, maxMoved = 0.12) {
    if (!a || !b || a.length !== b.length) return null;
    const out = new Uint8ClampedArray(a.length);
    let moved = 0;
    for (let p = 0; p < a.length; p += 4) {
      const la = a[p] + a[p + 1] + a[p + 2];
      const lb = b[p] + b[p + 1] + b[p + 2];
      if (Math.abs(la - lb) > 180) moved++;
      const src = la <= lb ? a : b;
      out[p] = src[p];
      out[p + 1] = src[p + 1];
      out[p + 2] = src[p + 2];
      out[p + 3] = 255;
    }
    return moved / (a.length / 4) > maxMoved ? null : out;
  }

  function pickRead(readings, opts = {}) {
    const list = (readings || []).filter((r) => r && r.text);
    const engs = list.filter((r) => r.lang === 'eng').map((r) => ({ ...r, name: cleanName(r.text) })).filter((r) => r.name);
    // two cuts of the same name (r.cut: 'loose' | 'tight', js/vision/names.js): a loose reading that is the tight one
    // plus one or two characters at an end (a speck of scenery next to the name read as a letter) loses to it (DEVLOG #57)
    const stray = new Set();
    for (const t of engs) {
      if (t.cut !== 'tight' || t.name.length < 4) continue;
      for (const l of engs) {
        if (l.cut === 'loose' && l.name !== t.name && l.name.length - t.name.length <= 2 && (l.name.endsWith(t.name) || l.name.startsWith(t.name)) && t.conf >= l.conf - 15) stray.add(l);
      }
    }
    // …and the other way round: a tight reading that is only a PIECE of the loose one (the tight cut keeps the
    // letter-sized patches that stand close together; a name with many small letters between its tall ones falls
    // apart) loses, however sure the reader was of the piece
    for (const t of engs) {
      if (t.cut !== 'tight') continue;
      for (const l of engs) {
        if (l.cut === 'loose' && !stray.has(l) && l.name !== t.name && l.name.includes(t.name) && l.conf >= 40) stray.add(t);
      }
    }
    let eng = engs.filter((r) => !stray.has(r)).sort((a, b) => b.conf - a.conf)[0] || null;
    // a Latin name is sometimes read better with the other script's data (it knows Latin letters too): only when the
    // English reading is poor and the other one is clearly surer
    const lat = list.filter((r) => r.lang !== 'eng' && cjkCount(r.text) === 0).map((r) => ({ ...r, name: cleanName(r.text) })).filter((r) => r.name).sort((a, b) => b.conf - a.conf)[0] || null;
    if (lat && (!eng || (eng.conf < 40 && lat.conf >= eng.conf + 20))) eng = { ...lat, lang: 'eng' };
    // the same for the other scripts, when the tight cut came out centred (r.sym): a loose reading that holds the
    // tight one plus more (roof edges next to the name read as characters) is not believed
    const cjkRaw = list.filter((r) => r.lang !== 'eng').map((r) => ({ ...r, name: cleanCjk(r.text, { keepLatin: !!opts.keepLatin }) })).filter((r) => r.name);
    const extra = new Set();
    for (const t of cjkRaw) {
      if (t.cut !== 'tight' || !t.sym || [...t.name].length < 2 || t.conf < 40) continue;
      // (also when it is just clearly longer: the centred cut cannot have lost two characters, the loose one can
      // have gained them)
      for (const l of cjkRaw) if (l.cut === 'loose' && l.name !== t.name && (l.name.includes(t.name) || (t.conf >= 50 && [...t.name].length >= 3 && [...l.name].length >= [...t.name].length + 2))) extra.add(l);
    }
    // (a centred tight cut also beats a loose Latin reading with any number of extra characters at an end)
    for (const t of engs) {
      if (t.cut !== 'tight' || !t.sym || t.name.length < 4) continue;
      for (const l of engs) if (l.cut === 'loose' && l.name !== t.name && (l.name.endsWith(t.name) || l.name.startsWith(t.name)) && t.conf >= l.conf - 15) stray.add(l);
    }
    if (eng && stray.has(eng)) eng = engs.filter((r) => !stray.has(r)).sort((a, b) => b.conf - a.conf)[0] || null;
    const cjk = cjkRaw.filter((r) => !extra.has(r)).sort((a, b) => b.conf - a.conf)[0] || null;
    // every other usable reading, best first: offered as other spellings and tried against the server's player list
    const seen = new Set();
    const all = [];
    const push = (r) => {
      if (r && r.name && !seen.has(r.name)) {
        seen.add(r.name);
        all.push({ name: r.name, lang: r.lang, conf: r.conf });
      }
    };
    const cjkWins = cjk && (!eng || cjk.conf >= 45 || cjk.conf >= eng.conf - 5);
    const cjkAll = cjkRaw.filter((r) => !extra.has(r)).sort((a, b) => b.conf - a.conf);
    let first = cjkWins ? cjk : eng;
    if (cjkWins) {
      // a clearly longer reading that the reader was still fairly sure of: the short one probably lost its end
      const longer = cjkAll.find((r) => r.conf >= 60 && [...r.name].length >= [...cjk.name].length + 2);
      if (longer) first = longer;
    }
    push(first);
    if (cjkWins) for (const r of cjkAll) push(r);
    push(eng);
    if (!cjkWins) for (const r of cjkAll) push(r);
    for (const r of stray) push(r);
    for (const r of extra) push(r);
    return first ? { name: first.name, lang: cjkWins ? first.lang : 'eng', conf: first.conf, all } : { name: '', lang: '', conf: 0, all: [] };
  }

  /**
   * The letters of a name crop without the scenery (DEVLOG #55). Names are white with a dark outline; snow and roofs
   * are white too. From the plain white mask, whole connected patches are dropped when they cannot be letters:
   * touching the top or bottom edge, taller than 0.8 of the crop, more than 0.3 × H² pixels, or thicker than a
   * stroke (some point farther than 0.12 × H from the patch's edge; bold fonts are thick where strokes cross).
   * opts.min = how light a letter pixel must be (default 170; thin strokes of a small window need less than 190).
   */
  function nameMask(rgba, W, H, opts = {}) {
    const min = opts.min || 170;
    const m = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < W * H; i++, p += 4) {
      const mn = Math.min(rgba[p], rgba[p + 1], rgba[p + 2]);
      const mx = Math.max(rgba[p], rgba[p + 1], rgba[p + 2]);
      m[i] = mn > min && mx - mn < 50 ? 1 : 0;
    }
    // distance to the nearest non-letter pixel (two-pass chamfer, city-block)
    const d = new Uint16Array(W * H);
    const BIG = 65535;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!m[i]) continue;
        const up = y ? d[i - W] : 0;
        const left = x ? d[i - 1] : 0;
        d[i] = Math.min(BIG, Math.min(up, left) + 1);
      }
    }
    for (let y = H - 1; y >= 0; y--) {
      for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x;
        if (!m[i]) continue;
        const dn = y < H - 1 ? d[i + W] : 0;
        const right = x < W - 1 ? d[i + 1] : 0;
        d[i] = Math.min(d[i], Math.min(dn, right) + 1);
      }
    }
    const maxStroke = Math.max(3, 0.12 * H);
    const label = new Int32Array(W * H);
    const stack = [];
    let next = 0;
    for (let s0 = 0; s0 < W * H; s0++) {
      if (!m[s0] || label[s0]) continue;
      next++;
      label[s0] = next;
      stack.push(s0);
      const px = [];
      let top = H, bottom = 0, thick = 0;
      while (stack.length) {
        const i = stack.pop();
        px.push(i);
        const y = (i / W) | 0;
        const x = i - y * W;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (d[i] > thick) thick = d[i];
        if (x && m[i - 1] && !label[i - 1]) (label[i - 1] = next), stack.push(i - 1);
        if (x < W - 1 && m[i + 1] && !label[i + 1]) (label[i + 1] = next), stack.push(i + 1);
        if (y && m[i - W] && !label[i - W]) (label[i - W] = next), stack.push(i - W);
        if (y < H - 1 && m[i + W] && !label[i + W]) (label[i + W] = next), stack.push(i + W);
      }
      const drop = top <= 1 || bottom >= H - 2 || bottom - top + 1 > 0.8 * H || px.length > 0.3 * H * H || thick > maxStroke;
      if (drop) for (const i of px) m[i] = 0;
    }
    return m;
  }

  /**
   * The letters of ONE name and nothing else (DEVLOG #56). After nameMask, small specks of scenery are still left
   * next to and above a name, and the text reader turns them into extra characters. So:
   *   1. patches at least 0.28 × H tall are "letters"; starting from the one nearest the middle, neighbours join while
   *      the gap is at most 0.6 × H and they sit on the same line (their rows overlap);
   *   2. that group gives the line (top .. bottom) and the name's left .. right;
   *   3. smaller patches on that line (small kana, a kana's short stroke, dots, the long-vowel dash) join while they
   *      are within 0.25 × H of the name so far; with opts.tight only those inside it. Everything else is cleared.
   * -> { mask, span: [left, right], band: [top, bottom], letters } or null when there is no letter-sized patch.
   */
  function nameLetters(rgba, W, H, opts = {}) {
    const m = nameMask(rgba, W, H, opts);
    const label = new Int32Array(W * H);
    const comps = [];
    const stack = [];
    for (let s0 = 0; s0 < W * H; s0++) {
      if (!m[s0] || label[s0]) continue;
      const id = comps.length + 1;
      const c = { id, x0: W, x1: 0, y0: H, y1: 0, n: 0 };
      label[s0] = id;
      stack.push(s0);
      while (stack.length) {
        const i = stack.pop();
        const y = (i / W) | 0;
        const x = i - y * W;
        c.n++;
        if (x < c.x0) c.x0 = x;
        if (x > c.x1) c.x1 = x;
        if (y < c.y0) c.y0 = y;
        if (y > c.y1) c.y1 = y;
        // 8-connected: a thin diagonal stroke is one patch
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const yy = y + dy;
            const xx = x + dx;
            if ((dx || dy) && yy >= 0 && yy < H && xx >= 0 && xx < W && m[yy * W + xx] && !label[yy * W + xx]) {
              label[yy * W + xx] = id;
              stack.push(yy * W + xx);
            }
          }
        }
      }
      comps.push(c);
    }
    // letter-sized: 28% of the crop's height, or, where the letters are small in their box (a keep's name), 62% of the
    // tallest patch (small letters are about 70% of capitals), never under 20%
    const maxH = comps.reduce((v, c) => Math.max(v, c.y1 - c.y0 + 1), 0);
    const tallMin = Math.max(0.2 * H, Math.min(0.28 * H, 0.62 * maxH));
    const tall = comps.filter((c) => c.y1 - c.y0 + 1 >= tallMin).sort((a, b) => a.x0 - b.x0);
    if (!tall.length) return null;
    const mid = W / 2;
    let k = 0;
    for (let i = 1; i < tall.length; i++) {
      const d = (c) => (mid < c.x0 ? c.x0 - mid : mid > c.x1 ? mid - c.x1 : 0);
      if (d(tall[i]) < d(tall[k])) k = i;
    }
    const group = [tall[k]];
    let top = tall[k].y0;
    let bottom = tall[k].y1;
    const sameLine = (c) => Math.min(c.y1, bottom) - Math.max(c.y0, top) >= 0.4 * Math.min(c.y1 - c.y0, bottom - top);
    const gap = 0.6 * H;
    for (let i = k - 1, edge = tall[k].x0; i >= 0; i--) {
      if (edge - tall[i].x1 > gap || !sameLine(tall[i])) break;
      group.push(tall[i]);
      edge = Math.min(edge, tall[i].x0);
      top = Math.min(top, tall[i].y0);
      bottom = Math.max(bottom, tall[i].y1);
    }
    for (let i = k + 1, edge = tall[k].x1; i < tall.length; i++) {
      if (tall[i].x0 - edge > gap || !sameLine(tall[i])) break;
      group.push(tall[i]);
      edge = Math.max(edge, tall[i].x1);
      top = Math.min(top, tall[i].y0);
      bottom = Math.max(bottom, tall[i].y1);
    }
    let left = Math.min(...group.map((c) => c.x0));
    let right = Math.max(...group.map((c) => c.x1));
    const keep = new Set(group.map((c) => c.id));
    // Smaller patches on the line: the short second stroke of a kana, a small kana, the long-vowel dash. They join
    // when they are at most `reach` from the name so far (and then the name grows: more letters may follow them).
    // opts.tight: only what lies inside the letter-sized group (no growing): fewer stray specks, but a name whose
    // last stroke is a short one loses it. The reader tries both.
    const reach = (opts.tight ? 0.06 : 0.25) * H;
    const minSize = opts.tight ? 0 : 0.003 * H * H;
    const onLine = (c) => {
      const cy = (c.y0 + c.y1) / 2;
      return cy >= top - 0.12 * H && cy <= bottom + 0.08 * H;
    };
    for (let grown = true; grown; ) {
      grown = false;
      for (const c of comps) {
        if (keep.has(c.id) || !onLine(c)) continue;
        const gapTo = c.x1 < left ? left - c.x1 : c.x0 > right ? c.x0 - right : 0;
        if (gapTo > 0 && c.n < minSize) continue; // (inside the name every dot counts: the dot of an i)
        const isTall = c.y1 - c.y0 + 1 >= tallMin;
        if (gapTo <= (isTall ? gap : reach)) {
          keep.add(c.id);
          if (c.x0 < left || c.x1 > right) grown = !opts.tight;
          left = Math.min(left, c.x0);
          right = Math.max(right, c.x1);
        }
      }
    }
    // A name on a fortress map is CENTRED under its badge (measured: the middle of the name is within 8 px of the
    // middle of a 96 px high crop). opts.centred + opts.tight: the letter-sized group gives how far the name reaches on
    // its longer side; everything on the line inside the same reach on the other side belongs to it (a dash, a small
    // kana, the parts of a kanji), and nothing beyond it does (roof edges next to the name). sym: it came out centred.
    let sym = false;
    if (opts.centred && opts.tight) {
      const slack = 0.2 * H;
      // the reach is set once, by the letter-sized group (letting admitted patches widen it lets scenery creep in)
      const half = Math.max(mid - left, right - mid);
      const inside = comps.filter((c) => !keep.has(c.id) && onLine(c) && c.x0 >= mid - half - slack && c.x1 <= mid + half + slack);
      // first the letter-sized ones: they say where the letters are
      for (const c of inside) {
        if (c.y1 - c.y0 + 1 < tallMin) continue;
        keep.add(c.id);
        left = Math.min(left, c.x0);
        right = Math.max(right, c.x1);
      }
      // then the small ones: between the letters anything (a dot, a mark); past the last letter only what can be a
      // character itself: a small kana (60% of a letter's height) or a long-vowel dash (flat, wide, mid-height).
      // A thin stroke of roof edge at the foot of the last letter is neither.
      // (tallest first, and what is admitted widens "between": the flat strokes of a kanji whose parts are not joined
      // lie over and under its bigger part)
      for (const c of [...inside].sort((p, q) => q.y1 - q.y0 - (p.y1 - p.y0))) {
        if (keep.has(c.id)) continue;
        const h = c.y1 - c.y0 + 1;
        const w = c.x1 - c.x0 + 1;
        const between = c.x0 >= left - 2 && c.x1 <= right + 2;
        const dash = w >= 0.2 * H && h <= 0.5 * w && Math.abs((c.y0 + c.y1) / 2 - (top + bottom) / 2) <= 0.2 * (bottom - top);
        if (!between && h < 0.6 * tallMin && !dash) continue;
        keep.add(c.id);
        left = Math.min(left, c.x0);
        right = Math.max(right, c.x1);
      }
      sym = Math.abs((left + right) / 2 - mid) <= 0.15 * H;
    }
    for (let i = 0; i < W * H; i++) if (m[i] && !keep.has(label[i])) m[i] = 0;
    return { mask: m, span: [left, right], band: [top, bottom], letters: group.length, sym };
  }

  // ---- the standby page (no war running; DEVLOG #46). Middle of the screen, top to bottom: "2026-3 Season",
  // "Guild War Standby", a dark band with a sentence, "War Begins" / "in 29h", then three buttons (the first one green).
  // Fractions of the picture height, x measured from the middle (owner's 2000×1070 screen).
  const STANDBY = {
    season: { cx: 0, y: 0.222, w: 0.34, h: 0.05 },
    title: { cx: 0, y: 0.262, w: 0.5, h: 0.066 },
    label: { cx: 0, y: 0.59, w: 0.3, h: 0.045 },
    time: { cx: 0, y: 0.628, w: 0.3, h: 0.055 },
    button: { cx: 0, y: 0.714, w: 0.36, h: 0.056 },
  };
  /** A STANDBY part as a pixel rect of a W × H picture. */
  const standbyRect = (key, W, H) => {
    const r = STANDBY[key];
    return { x: W / 2 + (r.cx - r.w / 2) * H, y: r.y * H, w: r.w * H, h: r.h * H };
  };
  const isStandbyTitle = (text) => /stand\s*-?\s*by/i.test(String(text || '')) && /guild|war/i.test(String(text || ''));
  /** "in 29h", "War Begins in 1d 5h", "in 45m" -> minutes; null when no time is found. OCR slips in the digits are mended. */
  function standbyMinutes(text) {
    const t = String(text || '').replace(/\s+/g, ' ');
    const at = t.search(/\b[il1|]n\b/i);
    const tail = at >= 0 ? t.slice(at + 2) : t;
    let total = 0;
    let found = false;
    for (const m of tail.matchAll(/([\dOoIlSsB]{1,3})\s*([dhm])(?![a-z])/gi)) {
      const n = Number(m[1].replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/[Ss]/g, '5').replace(/B/g, '8'));
      if (!Number.isFinite(n)) continue;
      const u = m[2].toLowerCase();
      if ((u === 'd' && n > 14) || (u === 'h' && n > 400) || (u === 'm' && n > 59)) continue;
      total += u === 'd' ? n * 1440 : u === 'h' ? n * 60 : n;
      found = true;
    }
    return found && total > 0 && total <= 14 * 1440 ? total : null;
  }
  /** Share of clearly green pixels in a rect (the standby page's first button is green; the two below are dark). */
  function greenShare(rgba, W, H, rect) {
    let n = 0;
    let g = 0;
    const x0 = Math.max(0, Math.round(rect.x));
    const x1 = Math.min(W, Math.round(rect.x + rect.w));
    for (let y = Math.max(0, Math.round(rect.y)); y < Math.min(H, Math.round(rect.y + rect.h)); y++) {
      for (let x = x0; x < x1; x++) {
        const p = (y * W + x) * 4;
        n++;
        if (rgba[p + 1] > rgba[p] + 18 && rgba[p + 1] > rgba[p + 2] + 18) g++;
      }
    }
    return n ? g / n : 0;
  }

  const api = { NORM_H, DEFAULT_FORTS, barKind, serverOf, langFor, worldFor, cjkCount, cleanCjk, pickRead, nameMask, nameLetters, darkerOfTwo, FORT_PLACES, placesToCheck, onPlace, unsureName, cleanGuild, findBadges, sideOf, toggleSide, fortNamesFromWords, nameBox, letterMask, letterSpan, cleanName, matchName, pagerIndex, STANDBY, standbyRect, isStandbyTitle, standbyMinutes, greenShare };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7GWMap = api;
})(typeof self !== 'undefined' ? self : this);
