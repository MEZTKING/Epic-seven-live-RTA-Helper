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
 *   pack(fp) / unpack(s)              a fingerprint stored small ('q' + base64 of bytes) and back (DEVLOG #87)
 *   learn(list, fp, info, now)        -> { list, entry, isNew, into }   info: { name, gear, rank, code } (only what is
 *                                        known; code = the game's design code from gear.txt, kept in entry.codes, #88);
 *                                        one design = one name: a known name joins its design (another picture variant)
 *   byCode(list, code)                -> the design seen with that gear.txt design code, or null
 *   mergeByName(list)                 -> { list, into }   designs with the same name + slot joined (DEVLOG #85)
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
  // one design = one name (the owner, DEVLOG #85): a design keeps every picture variant it was seen with (another
  // background, the hero screen's crop) in `fps`, and the name read most often (`names` counts the readings)
  // stored small (DEVLOG #87): a fingerprint as 300 bytes in base64 (~400 characters) instead of a list of numbers
  // (~1900): with every picture variant the designs had filled the browser storage, and then items could not be saved
  const b64e = (u8) => (typeof btoa === 'function' ? btoa(String.fromCharCode(...u8)) : Buffer.from(u8).toString('base64'));
  const b64d = (s) => (typeof atob === 'function' ? Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) : new Uint8Array(Buffer.from(s, 'base64')));
  // each value as one signed byte, the largest one = 127 (the scale doesn't need storing: the vector is renormalised)
  function pack(fp) {
    if (!fp || typeof fp === 'string') return fp || null;
    const m = Math.max(1e-9, ...fp.map(Math.abs));
    const u = new Uint8Array(fp.length);
    for (let i = 0; i < fp.length; i++) u[i] = Math.round((fp[i] / m) * 127) & 255;
    return 'q' + b64e(u);
  }
  const unpacked = new Map();
  function unpack(fp) {
    if (!fp || typeof fp !== 'string') return fp || null;
    let v = unpacked.get(fp);
    if (!v) {
      v = Array.from(b64d(fp.slice(1)), (b) => (b > 127 ? b - 256 : b));
      const k = 1 / (Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1);
      v = v.map((x) => x * k);
      if (unpacked.size > 5000) unpacked.clear();
      unpacked.set(fp, v);
    }
    return v;
  }
  const variants = (e) => [e.fp, ...(e.fps || [])].filter(Boolean).map(unpack);
  const nameKey = (name, gear) => `${String(name || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}|${gear || ''}`;
  function lookup(list, fp) {
    let best = null;
    for (const e of list || []) {
      for (const v of variants(e)) {
        const s = similarity(v, fp);
        if (!best || s > best.sim) best = { entry: e, sim: s };
      }
    }
    return best && best.sim >= SAME ? { entry: best.entry, sim: Math.round(best.sim * 100) / 100 } : null;
  }
  const MAX_VARIANTS = 6;
  function addVariant(e, fp) {
    if (variants(e).some((v) => similarity(v, fp) >= 0.97)) return;
    e.fps = [...(e.fps || []), pack(fp)].slice(-MAX_VARIANTS);
  }
  function voteName(e, name) {
    if (!name) return;
    e.names = { ...(e.names || {}) };
    e.names[name] = (e.names[name] || 0) + 1;
    // a name you typed is never replaced; else the name read most often
    if (!e.named) e.name = Object.entries(e.names).sort((a, b) => b[1] - a[1])[0][0];
  }
  function learn(list, fp, info = {}, now = Date.now()) {
    const out = (list || []).map((e) => ({ ...e, fp: pack(e.fp), ...(e.fps ? { fps: e.fps.map(pack) } : {}) }));
    if (!fp) return { list: out, entry: null, isNew: false };
    const hit = lookup(out, fp);
    let entry = hit && out.find((e) => e.id === hit.entry.id);
    // not recognised by its picture, but the panel gives a name an existing design has (same slot): the same design,
    // seen another way: its picture becomes a variant
    if (!entry && info.name) {
      const k = nameKey(info.name, info.gear);
      entry = out.find((e) => e.name && nameKey(e.name, e.gear || info.gear) === k) || null;
      if (entry) addVariant(entry, fp);
    }
    // the same with the game's design code from gear.txt (DEVLOG #88)
    if (!entry && info.code) {
      entry = out.find((e) => e.codes && e.codes[info.code]) || null;
      if (entry) addVariant(entry, fp);
    }
    const isNew = !entry;
    if (!entry) {
      entry = { id: `d${now.toString(36)}${out.length.toString(36)}`, fp: pack(fp), name: '', gear: '', rank: '', n: 0, first: now };
      out.push(entry);
    }
    entry.n = (entry.n || 0) + 1;
    entry.last = now;
    voteName(entry, info.name);
    if (info.code) entry.codes = { ...(entry.codes || {}), [info.code]: ((entry.codes || {})[info.code] || 0) + 1 };
    if (info.gear && !entry.gear) entry.gear = info.gear;
    if (info.rank && !entry.rank) entry.rank = info.rank;
    const merged = mergeByName(out);
    const sorted = merged.list.sort((a, b) => (b.last || 0) - (a.last || 0)).slice(0, MAX);
    const id = merged.into[entry.id] || entry.id;
    return { list: sorted, entry: sorted.find((e) => e.id === id) || entry, isNew, into: merged.into };
  }
  /**
   * Designs with the same name and slot are one design: joined (pictures as variants, counts and name readings added).
   * Returns { list, into: { removedId: keptId } } so items pointing to a removed design can follow.
   */
  function mergeByName(list) {
    const out = [];
    const into = {};
    const byKey = new Map();
    for (const e of list || []) {
      const k = e.name && e.gear ? nameKey(e.name, e.gear) : null;
      const keep = k && byKey.get(k);
      if (!keep) {
        const c = { ...e };
        out.push(c);
        if (k) byKey.set(k, c);
        continue;
      }
      for (const v of variants(e)) addVariant(keep, v);
      keep.n = (keep.n || 0) + (e.n || 0);
      keep.first = Math.min(keep.first || Infinity, e.first || Infinity);
      keep.last = Math.max(keep.last || 0, e.last || 0);
      for (const [cd, c] of Object.entries(e.codes || {})) keep.codes = { ...(keep.codes || {}), [cd]: ((keep.codes || {})[cd] || 0) + c };
      for (const [nm, c] of Object.entries(e.names || {})) keep.names = { ...(keep.names || {}), [nm]: ((keep.names || {})[nm] || 0) + c };
      if (e.named && !keep.named) Object.assign(keep, { name: e.name, named: true });
      into[e.id] = keep.id;
    }
    return { list: out, into };
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

  /** The design seen with this gear.txt design code (DEVLOG #88), or null. */
  const byCode = (list, code) => (code && (list || []).find((e) => e.codes && e.codes[code])) || null;
  const api = { BOX, FP, SAME, MAX, pack, unpack, byCode, fingerprint, similarity, lookup, learn, mergeByName, cleanName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7GearArts = api;
})(typeof self !== 'undefined' ? self : this);
