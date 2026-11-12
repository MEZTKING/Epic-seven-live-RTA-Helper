/*
 * Hero FACE matcher for the game's round hero icons (pre-ban row and picker, CR bar, result screen…).
 * DEVLOG #23. Replaces the 16×16 colour summary (js/vision.js) where icons are round.
 *
 * Found on real Steam screenshots (tests/fixtures/screens/steam-rta-preban-select.png):
 *   - The official portrait ({code}_s.png, 112×112, round) is the SAME artwork as the in-game round icon.
 *   - In game it sits in a gold ring with the class icon top-left, element top-right and stars along the bottom.
 *   - Mapping: the portrait window centred at (+2, +4) px (of 112) with half-size 56 lines up with the in-game
 *     ring box (centre of the ring, half-size ≈ ring radius ×0.92–1.16).
 * Method: sample both at 32×32, keep only the face pixels (inside the circle, not under the icons or stars),
 * zero-mean each colour channel, L2-normalise → cosine = normalised cross-correlation.
 * Confidence: score ≥ 0.80 AND ≥ 0.10 ahead of the next hero. On the real grid this gave 15 right and 0 wrong
 * confident answers (the old matcher: 20 confident, ≥2 of them wrong). Unknown faces stay "unsure"
 * (e.g. heroes whose art differs or isn't in the official list), so corrections ('my corrections') fill the gaps.
 *
 * Pure part (Node + browser): mask, vector, classify, isConfident, quantize. Browser part: fromImage / fromRect.
 */
(function (root) {
  'use strict';
  const N = 32;
  const MIN_SCORE = 0.8;
  const MIN_LEAD = 0.1;
  // portrait side: window inside the 112 px portrait, as fractions of the portrait
  const PORTRAIT_WINDOW = { cx: 58 / 112, cy: 60 / 112, half: 0.5 };
  // game side: variants around the box drawn/known for an icon (box = the gold ring)
  const GAME_VARIANTS = [];
  for (const k of [0.92, 1.0, 1.08, 1.16]) for (const dx of [-0.07, 0, 0.07]) for (const dy of [-0.07, 0, 0.07]) GAME_VARIANTS.push({ k, dx, dy });
  // wider search for boxes that may be a few pixels off (built-in positions measured by eye): ±21% of the icon size
  const WIDE_VARIANTS = [];
  for (const k of [0.92, 1.04, 1.16]) for (const dx of [-0.21, -0.14, -0.07, 0, 0.07, 0.14, 0.21]) for (const dy of [-0.21, -0.14, -0.07, 0, 0.07, 0.14, 0.21]) WIDE_VARIANTS.push({ k, dx, dy });

  /** 1 = face pixel used for matching. */
  const MASK = (() => {
    const m = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const u = ((x + 0.5) / N) * 2 - 1;
        const v = ((y + 0.5) / N) * 2 - 1;
        const inCircle = u * u + v * v < 0.81;
        const underIcons = v < -0.3 && Math.abs(u) > 0.3; // class (top-left) and element (top-right)
        const underStars = v >= 0.45;
        m[y * N + x] = inCircle && !underIcons && !underStars ? 1 : 0;
      }
    }
    return m;
  })();
  const COUNT = MASK.reduce((a, b) => a + b, 0);

  /** RGBA (N×N×4) → { vec: Float32Array(COUNT*3), energy } ; energy ~0 = flat / empty slot. */
  function vector(rgba) {
    const vec = new Float32Array(COUNT * 3);
    const mean = [0, 0, 0];
    let j = 0;
    for (let i = 0; i < N * N; i++) {
      if (!MASK[i]) continue;
      for (let c = 0; c < 3; c++) {
        vec[j * 3 + c] = rgba[i * 4 + c];
        mean[c] += rgba[i * 4 + c];
      }
      j++;
    }
    for (let c = 0; c < 3; c++) mean[c] /= COUNT;
    let ss = 0;
    for (let i = 0; i < vec.length; i++) {
      vec[i] -= mean[i % 3];
      ss += vec[i] * vec[i];
    }
    const norm = Math.sqrt(ss);
    if (norm > 0) for (let i = 0; i < vec.length; i++) vec[i] /= norm;
    return { vec, energy: norm / Math.sqrt(vec.length) }; // ≈ standard deviation of the face pixels (0–255)
  }

  function dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  /**
   * Best hero for one face (or several variants of it: pass an array, the best score per hero counts).
   * templates: [{ code, vec, source }] (several per hero allowed). opts.allow: Set of codes; opts.preferSource:
   * that source wins ties within 0.02 (your own corrections).
   * Returns { empty, best: {code, score, source}, second: {code, score}|null, lead }.
   */
  function classify(faces, templates, opts = {}) {
    const list = [].concat(faces);
    if (list.every((f) => f.energy < 6)) return { empty: true, best: null, second: null, lead: 0 };
    const byCode = new Map();
    for (const t of templates) {
      if (opts.allow && !opts.allow.has(t.code)) continue;
      let s = -1;
      for (const f of list) if (f.energy >= 6) s = Math.max(s, dot(f.vec, t.vec));
      if (opts.preferSource && t.source === opts.preferSource) s += 0.02;
      const cur = byCode.get(t.code);
      if (!cur || s > cur.score) byCode.set(t.code, { code: t.code, score: s, source: t.source });
    }
    const ranked = [...byCode.values()].sort((a, b) => b.score - a.score);
    const best = ranked[0] || null;
    const second = ranked[1] || null;
    return { empty: false, best, second, lead: best && second ? best.score - second.score : best ? best.score : 0 };
  }
  const isConfident = (r, minScore = MIN_SCORE, minLead = MIN_LEAD) => !!r && !r.empty && !!r.best && r.best.score >= minScore && r.lead >= minLead;

  /** Store a face compactly (corrections): int8 base64. */
  function quantize(vec) {
    let max = 0;
    for (const v of vec) max = Math.max(max, Math.abs(v));
    const q = new Int8Array(vec.length);
    for (let i = 0; i < vec.length; i++) q[i] = Math.round((vec[i] / (max || 1)) * 127);
    let s = '';
    for (const b of new Uint8Array(q.buffer)) s += String.fromCharCode(b);
    return { s: (typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(s, 'binary').toString('base64')), m: max };
  }
  function dequantize(qz) {
    const bin = typeof atob !== 'undefined' ? atob(qz.s) : Buffer.from(qz.s, 'base64').toString('binary');
    const q = new Int8Array(bin.length);
    for (let i = 0; i < bin.length; i++) q[i] = (bin.charCodeAt(i) << 24) >> 24;
    const v = new Float32Array(q.length);
    let ss = 0;
    for (let i = 0; i < q.length; i++) {
      v[i] = (q[i] / 127) * qz.m;
      ss += v[i] * v[i];
    }
    const n = Math.sqrt(ss) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= n;
    return v;
  }

  // ------------------------------------------------------------- browser: sampling from images / the game picture
  let cv = null;
  let cx = null;
  let mid = null;
  let mx = null;
  const M = N * 2; // shrink in two steps (source → 64 → 32): a one-step canvas shrink is too blocky to compare
  function sample(img, sx, sy, sw, sh, background) {
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = cv.height = N;
      cx = cv.getContext('2d', { willReadFrequently: true });
      mid = document.createElement('canvas');
      mid.width = mid.height = M;
      mx = mid.getContext('2d');
      cx.imageSmoothingQuality = mx.imageSmoothingQuality = 'high';
    }
    mx.fillStyle = background || '#000';
    mx.fillRect(0, 0, M, M);
    mx.drawImage(img, sx, sy, sw, sh, 0, 0, M, M);
    cx.drawImage(mid, 0, 0, M, M, 0, 0, N, N);
    return vector(cx.getImageData(0, 0, N, N).data);
  }
  /** Template from an official portrait image (any size; transparent corners become black). */
  function fromPortrait(img) {
    const W = img.naturalWidth || img.width;
    const H = img.naturalHeight || img.height;
    const w = PORTRAIT_WINDOW;
    return sample(img, (w.cx - w.half) * W, (w.cy - w.half) * H, 2 * w.half * W, 2 * w.half * H).vec;
  }
  /** All variants of the face inside `rect` (pixels of `src`; the box around the round icon's gold ring). */
  function fromRect(src, rect, variants = GAME_VARIANTS) {
    const c = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    const half = Math.min(rect.w, rect.h) / 2;
    return variants.map((v) => {
      const h = half * v.k;
      return sample(src, c.x + v.dx * half - h, c.y + v.dy * half - h, 2 * h, 2 * h);
    });
  }

  const api = { N, MASK, COUNT, MIN_SCORE, MIN_LEAD, PORTRAIT_WINDOW, GAME_VARIANTS, WIDE_VARIANTS, vector, classify, isConfident, quantize, dequantize, fromPortrait, fromRect };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RTAFaces = api;
})(typeof self !== 'undefined' ? self : this);
