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

  // ------------------------------------------------------------- element badge (owner's idea, DEVLOG #29)
  // Every hero icon shows its element as a coloured badge (top right on round icons): fire = orange flame, ice = blue
  // drop, earth ('wind' in the official data) = green tree, light = gold star, dark = purple moon. Reading that colour
  // first leaves ~1/5 of the heroes to compare. Hue ranges in degrees; checked on the real pre-ban grid: 15/15 right.
  const ELEMENT_HUES = [['fire', 0, 38], ['light', 38, 70], ['wind', 75, 165], ['ice', 175, 235], ['dark', 245, 320], ['fire', 330, 360]];
  // where the badge sits on a round icon, relative to the ring box (centre + fractions of its half size)
  const BADGE = { dx: 0.79, dy: -0.62, half: 0.26 };
  /** Element from the badge's pixels (RGBA). { element|null, share, count }; null when no clear badge colour. */
  function elementFromRGBA(rgba) {
    const counts = {};
    let n = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      const r = rgba[i] / 255;
      const g = rgba[i + 1] / 255;
      const b = rgba[i + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const s = max ? (max - min) / max : 0;
      if (s < 0.5 || max < 0.4) continue;
      let h = 0;
      if (max === r) h = ((g - b) / (max - min)) % 6;
      else if (max === g) h = (b - r) / (max - min) + 2;
      else h = (r - g) / (max - min) + 4;
      const deg = (h * 60 + 360) % 360;
      const bin = ELEMENT_HUES.find(([, lo, hi]) => deg >= lo && deg < hi);
      if (!bin) continue;
      counts[bin[0]] = (counts[bin[0]] || 0) + 1;
      n++;
    }
    const total = rgba.length / 4;
    const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const share = best ? counts[best] / n : 0;
    // a real badge fills a good part of the box with one colour
    return best && share >= 0.75 && n >= total * 0.12 ? { element: best, share, count: n } : { element: null, share, count: n };
  }
  /** Only the heroes of that element (for classify's `allow`), or null when no badge was read. */
  function elementAllow(element, heroes) {
    if (!element) return null;
    return new Set(heroes.filter((h) => h.element === element).map((h) => h.code));
  }

  // ------------------------------------------------------------- class symbol (owner's idea, DEVLOG #29)
  // The other badge (top left on round icons) is the class: hood = thief ('assassin'), bow = ranger, sword = warrior,
  // hat = mage, shield = knight, swirl = soul weaver ('manauser'). White symbol, compared as a 16×16 grey picture
  // against examples learned from real icons (js/sources/class-templates.js, made by tools/make-class-templates.js).
  const CLASS_BADGE = { dx: -0.81, dy: -0.62, half: 0.29 };
  const CN = 16;
  /** Grey 16×16 (RGBA in) → zero-mean, unit-length vector. */
  function classVector(rgba) {
    const v = new Float32Array(CN * CN);
    let m = 0;
    for (let i = 0; i < CN * CN; i++) {
      v[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
      m += v[i];
    }
    m /= CN * CN;
    let ss = 0;
    for (let i = 0; i < v.length; i++) {
      v[i] -= m;
      ss += v[i] * v[i];
    }
    const n = Math.sqrt(ss) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= n;
    return v;
  }
  /** Best class for some badge vectors (several shifts) against templates [{role, vec}]. { role|null, score, lead } */
  function classFromVectors(vecs, templates, minScore = 0.75, minLead = 0.1) {
    const best = {};
    for (const t of templates || []) for (const v of vecs) best[t.role] = Math.max(best[t.role] === undefined ? -1 : best[t.role], dot(v, t.vec));
    const rk = Object.entries(best).sort((a, b) => b[1] - a[1]);
    if (!rk.length) return { role: null, score: 0, lead: 0 };
    const lead = rk[1] ? rk[0][1] - rk[1][1] : rk[0][1];
    return { role: rk[0][1] >= minScore && lead >= minLead ? rk[0][0] : null, best: rk[0][0], score: rk[0][1], lead };
  }
  /** Heroes allowed by the badges: element and/or class (null = no filter). Falls back to element only if empty. */
  function badgeAllow(element, role, heroes) {
    if (!element && !role) return null;
    const both = heroes.filter((h) => (!element || h.element === element) && (!role || h.role === role));
    if (both.length) return new Set(both.map((h) => h.code));
    return element ? elementAllow(element, heroes) : null;
  }

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

  /** Read the element badge of the round icon in `rect` (browser). */
  let bcv = null;
  function elementAt(src, rect, badge = BADGE) {
    const half = Math.min(rect.w, rect.h) / 2;
    const cx = rect.x + rect.w / 2 + badge.dx * half;
    const cy = rect.y + rect.h / 2 + badge.dy * half;
    const h = badge.half * half;
    if (!bcv) {
      bcv = document.createElement('canvas');
      bcv.width = bcv.height = 22;
    }
    const c = bcv.getContext('2d', { willReadFrequently: true });
    c.clearRect(0, 0, 22, 22);
    c.drawImage(src, cx - h, cy - h, 2 * h, 2 * h, 0, 0, 22, 22);
    return elementFromRGBA(c.getImageData(0, 0, 22, 22).data);
  }

  /** Class badge vectors of the round icon in `rect` (9 small shifts; browser). */
  let ccv = null;
  function classVectorsAt(src, rect, badge = CLASS_BADGE) {
    const half = Math.min(rect.w, rect.h) / 2;
    const h = badge.half * half;
    if (!ccv) {
      ccv = document.createElement('canvas');
      ccv.width = ccv.height = CN;
    }
    const c = ccv.getContext('2d', { willReadFrequently: true });
    const out = [];
    for (const ox of [-0.07, 0, 0.07]) {
      for (const oy of [-0.07, 0, 0.07]) {
        const cx = rect.x + rect.w / 2 + (badge.dx + ox) * half;
        const cy = rect.y + rect.h / 2 + (badge.dy + oy) * half;
        c.clearRect(0, 0, CN, CN);
        c.drawImage(src, cx - h, cy - h, 2 * h, 2 * h, 0, 0, CN, CN);
        out.push(classVector(c.getImageData(0, 0, CN, CN).data));
      }
    }
    return out;
  }
  /** Element + class of a round icon (browser): { element, role } (null where unclear). */
  function badgesAt(src, rect, classTemplates) {
    const e = elementAt(src, rect);
    const c = classTemplates && classTemplates.length ? classFromVectors(classVectorsAt(src, rect), classTemplates) : { role: null };
    return { element: e.element, role: c.role, classScore: c.score, classLead: c.lead };
  }

  const api = { CLASS_BADGE, classVector, classFromVectors, badgeAllow, classVectorsAt, badgesAt, ELEMENT_HUES, BADGE, elementFromRGBA, elementAllow, elementAt, N, MASK, COUNT, MIN_SCORE, MIN_LEAD, PORTRAIT_WINDOW, GAME_VARIANTS, WIDE_VARIANTS, vector, classify, isConfident, quantize, dequantize, fromPortrait, fromRect };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RTAFaces = api;
})(typeof self !== 'undefined' ? self : this);
