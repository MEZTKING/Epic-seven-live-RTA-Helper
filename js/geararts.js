/*
 * Gear designs ("arts", DEVLOG #79): many items share one design (every Bow of Agony looks the same, only the badges
 * and numbers on top differ). The app keeps each design once, learns its name and slot from the item details panel
 * the first time, and then recognises it on every inventory tile. Pure (Node + browser). Browser: window.E7GearArts.
 *
 * The fingerprint looks only at the middle of the item picture (x 30-70 %, y 20-60 %), clear of the level, the
 * enhance badge, the lock, the set badge and a hero's portrait in the corners. Measured on the owner's pictures
 * (10×10 colour, zero mean): the same design 0.82-1.00 (also between the details panel and a grid tile, and on items
 * with another background), different designs at most 0.56. SAME = 0.8.
 *
 *   BOX                               the middle of the item picture (fractions)
 *   fingerprint(rgba)                 -> number[] (rgba of an FP×FP picture of BOX)
 *   similarity(a, b)                  -> cosine
 *   lookup(list, fp)                  -> { entry, sim } | null
 *   learn(list, fp, info, now)        -> { list, entry, isNew }   info: { name, gear, rank } (only what is known)
 *   cleanName(text)                   -> the item's name from the panel's white text ("Bow of Agony"), or ''
 */
(function (root) {
  'use strict';
  const BOX = { x0: 0.3, y0: 0.2, x1: 0.7, y1: 0.6 };
  const FP = 10;
  const SAME = 0.8;
  const MAX = 600;

  function fingerprint(rgba) {
    const n = FP * FP;
    const v = new Array(n * 3);
    let m = 0;
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) m += rgba[i * 4 + c];
    m /= n * 3;
    let ss = 0;
    for (let i = 0; i < n; i++)
      for (let c = 0; c < 3; c++) {
        const x = rgba[i * 4 + c] - m;
        v[i * 3 + c] = x;
        ss += x * x;
      }
    const k = 1 / (Math.sqrt(ss) || 1);
    return v.map((x) => Math.round(x * k * 1000) / 1000);
  }
  function similarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }
  function lookup(list, fp) {
    let best = null;
    for (const e of list || []) {
      const s = similarity(e.fp, fp);
      if (!best || s > best.sim) best = { entry: e, sim: s };
    }
    return best && best.sim >= SAME ? { entry: best.entry, sim: Math.round(best.sim * 100) / 100 } : null;
  }
  function learn(list, fp, info = {}, now = Date.now()) {
    const out = (list || []).map((e) => ({ ...e }));
    if (!fp) return { list: out, entry: null, isNew: false };
    const hit = lookup(out, fp);
    let entry = hit && out.find((e) => e.id === hit.entry.id);
    const isNew = !entry;
    if (!entry) {
      entry = { id: `d${now.toString(36)}${out.length.toString(36)}`, fp, name: '', gear: '', rank: '', n: 0, first: now };
      out.push(entry);
    }
    entry.n = (entry.n || 0) + 1;
    entry.last = now;
    // a name / slot read from the details panel wins over nothing; a name you typed (named: true) is never replaced
    if (info.name && !entry.named) entry.name = info.name;
    if (info.gear && !entry.gear) entry.gear = info.gear;
    if (info.rank && !entry.rank) entry.rank = info.rank;
    const sorted = out.sort((a, b) => (b.last || 0) - (a.last || 0)).slice(0, MAX);
    return { list: sorted, entry, isNew };
  }
  // the rarity line is red (left out by the white mask); a stray rarity word is still dropped, slot words are kept
  // ("Boots of Agony")
  const RARITY = /^(epic|heroic|rare|good|normal|otherworldly)$/i;
  function cleanName(text) {
    const words = String(text || '')
      .replace(/[^\p{L}\p{N}'\- \n]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w && !RARITY.test(w) && (/\p{L}{2,}/u.test(w) || /^(of|the|a)$/i.test(w)));
    const s = words.join(' ').trim();
    return s.length >= 3 ? s : '';
  }

  const api = { BOX, FP, SAME, MAX, fingerprint, similarity, lookup, learn, cleanName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7GearArts = api;
})(typeof self !== 'undefined' ? self : this);
