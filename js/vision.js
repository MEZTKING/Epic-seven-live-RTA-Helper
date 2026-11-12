/*
 * Image recognition math for auto-detection. Pure (no DOM).
 * Browser: window.RTAVision. Node: require().
 *
 * The browser shrinks every image (a hero portrait, or a slot cut out of the
 * game screen) to SIZE x SIZE pixels. This module turns those pixels into a
 * normalised feature vector and compares vectors. Comparison is a Pearson
 * correlation (-1..1), so overall brightness/contrast changes matter little.
 *
 * Templates come from separate sources and keep their source label:
 *   'official'        official hero portraits
 *   'my corrections'  screen crops you labelled yourself (preferred)
 */
(function (root) {
  const SIZE = 16;
  const DIM = SIZE * SIZE * 3;

  /**
   * RGBA pixels (SIZE*SIZE*4) -> { vec: Float32Array(DIM) unit length, zero mean, std }.
   * `std` is the raw pixel standard deviation (0-255): a flat, empty slot has a low std.
   */
  function featureFromRGBA(rgba) {
    if (!rgba || rgba.length < SIZE * SIZE * 4) throw new Error('Expected SIZE*SIZE RGBA pixels.');
    const v = new Float32Array(DIM);
    let sum = 0;
    for (let p = 0, i = 0; p < SIZE * SIZE; p++) {
      v[i++] = rgba[p * 4];
      v[i++] = rgba[p * 4 + 1];
      v[i++] = rgba[p * 4 + 2];
    }
    for (let i = 0; i < DIM; i++) sum += v[i];
    const mean = sum / DIM;
    let sq = 0;
    for (let i = 0; i < DIM; i++) {
      v[i] -= mean;
      sq += v[i] * v[i];
    }
    const std = Math.sqrt(sq / DIM);
    const norm = Math.sqrt(sq) || 1;
    for (let i = 0; i < DIM; i++) v[i] /= norm;
    return { vec: v, std };
  }

  function similarity(a, b) {
    let s = 0;
    for (let i = 0; i < DIM; i++) s += a[i] * b[i];
    return s;
  }

  /**
   * Compare one slot feature with all templates.
   * templates: [{ code, vec, source }]
   * opts: { minStd, preferSource, preferBonus, allow (Set of codes or null) }
   * Returns { empty, best: {code, sim, source} | null, second: {...} | null }
   * Only the best template per hero counts, so "second" is a different hero.
   */
  function classify(feature, templates, opts = {}) {
    const minStd = opts.minStd ?? 10;
    if (feature.std < minStd) return { empty: true, best: null, second: null };
    const bonus = opts.preferBonus ?? 0.03;
    const perHero = new Map();
    for (const t of templates) {
      if (opts.allow && !opts.allow.has(t.code)) continue;
      let s = similarity(feature.vec, t.vec);
      if (opts.preferSource && t.source === opts.preferSource) s += bonus;
      const cur = perHero.get(t.code);
      if (!cur || s > cur.sim) perHero.set(t.code, { code: t.code, sim: s, source: t.source });
    }
    let best = null;
    let second = null;
    for (const r of perHero.values()) {
      if (!best || r.sim > best.sim) {
        second = best;
        best = r;
      } else if (!second || r.sim > second.sim) second = r;
    }
    return { empty: false, best, second };
  }

  /**
   * Is a classification confident enough to act on?
   * Either a high score with a small lead over the runner-up, or a somewhat
   * lower score (down to threshold - 0.15) with a big lead (>= 0.12).
   */
  function isConfident(result, threshold = 0.72, margin = 0.04) {
    if (!result || result.empty || !result.best) return false;
    const lead = result.second ? result.best.sim - result.second.sim : 1;
    if (result.best.sim >= threshold && lead >= margin) return true;
    return result.best.sim >= threshold - 0.15 && lead >= 0.12;
  }

  // ---- compact storage for learned templates (Float32 -> Int8 -> base64)
  function quantize(vec) {
    let max = 0;
    for (let i = 0; i < vec.length; i++) max = Math.max(max, Math.abs(vec[i]));
    const scale = max || 1;
    const out = new Int8Array(vec.length);
    for (let i = 0; i < vec.length; i++) out[i] = Math.round((vec[i] / scale) * 127);
    return { scale, data: bytesToB64(new Uint8Array(out.buffer)) };
  }
  function dequantize(q) {
    const bytes = b64ToBytes(q.data);
    const i8 = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length);
    const v = new Float32Array(i8.length);
    let sq = 0;
    for (let i = 0; i < i8.length; i++) {
      v[i] = (i8[i] / 127) * q.scale;
      sq += v[i] * v[i];
    }
    const norm = Math.sqrt(sq) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= norm;
    return v;
  }
  function bytesToB64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function b64ToBytes(b64) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  // ---- calibration layout
  /*
   * Regions are stored as fractions of the frame (0..1) so they survive window
   * resizing. For a column of slots you draw the first and the last box and
   * the ones in between are spaced evenly.
   */
  const REGION_STEPS = [
    { key: 'mePreban1', label: 'MY preban #1' },
    { key: 'mePreban2', label: 'MY preban #2' },
    { key: 'oppPreban1', label: "OPPONENT's preban #1" },
    { key: 'oppPreban2', label: "OPPONENT's preban #2" },
    { key: 'mePickFirst', label: 'MY pick slot #1 (top/first)' },
    { key: 'mePickLast', label: 'MY pick slot #5 (bottom/last)' },
    { key: 'oppPickFirst', label: "OPPONENT's pick slot #1" },
    { key: 'oppPickLast', label: "OPPONENT's pick slot #5" },
    { key: 'oppName', label: "OPPONENT's name (optional — Skip if not shown)", optional: true },
  ];

  function interpolate(a, b, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t });
    }
    return out;
  }

  /** regions -> [{ id, side, kind: 'preban'|'pick', index, rect }] */
  function slotLayout(regions) {
    const r = regions || {};
    const slots = [];
    const add = (side, kind, index, rect) => rect && slots.push({ id: `${side}-${kind}-${index}`, side, kind, index, rect });
    add('me', 'preban', 0, r.mePreban1);
    add('me', 'preban', 1, r.mePreban2);
    add('opp', 'preban', 0, r.oppPreban1);
    add('opp', 'preban', 1, r.oppPreban2);
    if (r.mePickFirst && r.mePickLast) interpolate(r.mePickFirst, r.mePickLast, 5).forEach((rect, i) => add('me', 'pick', i, rect));
    if (r.oppPickFirst && r.oppPickLast) interpolate(r.oppPickFirst, r.oppPickLast, 5).forEach((rect, i) => add('opp', 'pick', i, rect));
    return slots;
  }

  function isCalibrated(regions) {
    return REGION_STEPS.filter((s) => !s.optional).every((s) => regions && regions[s.key]);
  }

  /** Clean OCR output into a plausible player name ('' if nothing usable). */
  function cleanName(text) {
    const s = String(text || '')
      .replace(/[\r\n]+/g, ' ')
      .replace(/[^\p{L}\p{N} _.\-]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
    return s.length >= 2 && s.length <= 24 ? s : '';
  }

  const api = { SIZE, DIM, featureFromRGBA, similarity, classify, isConfident, quantize, dequantize, REGION_STEPS, interpolate, slotLayout, isCalibrated, cleanName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RTAVision = api;
})(typeof window !== 'undefined' ? window : globalThis);
