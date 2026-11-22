/*
 * Screen items ↔ your gear.txt (DEVLOG #88). Pure (Node + browser). Browser: window.E7GearMatch.
 *
 * The RexQian fork's auto importer writes every item's design code (`code`, e.g. "ecw6w_u"), its set and exact numbers,
 * and the hero wearing it; it has no picture and (on the owner's file) no name. Measured on the owner's file: 2 768 of
 * 2 773 items have a set of numbers (slot, main stat, substats) no other item has, and the items read from the owner's
 * pictures (Rhianna's weapon and necklace) were each found exactly once, on the right hero. So:
 *   - an item read from the screen with all its numbers is that gear.txt item (its set, design code, wearer);
 *   - on a hero's equipment screen, each slot is the one item gear.txt has on that hero in that slot (when enhance and
 *     level agree: gear moved after the export doesn't count).
 * The two sources stay apart: a screen item only points to its gear.txt item (`fileId`).
 *
 *   statKey(item)                    -> 'Weapon|Attack|525|AttackPercent:8,…' (substats in any order; item.subs or
 *                                       item.substats)
 *   index(items)                     -> Map statKey -> [items]
 *   byStats(idx, item)               -> the one gear.txt item with these numbers, or null (none / several)
 *   onHero(items, code, slot, seen)  -> the one gear.txt item on that hero in that slot, or null; seen { enhance, level,
 *                                       set, unit } must agree where given
 *   unitOf(items, code, slots)       -> which copy of a hero (two copies, one code) the screen shows, or null
 */
(function (root) {
  'use strict';
  const num = (v) => Math.round((Number(v) || 0) * 10) / 10;
  function statKey(it) {
    if (!it || !it.main || !it.gear) return '';
    const subs = (it.subs || it.substats || []).filter((s) => s && s.type).map((s) => `${s.type}:${num(s.value)}`).sort();
    return [it.gear, it.main.type, num(it.main.value), subs.join(',')].join('|');
  }
  function index(items) {
    const m = new Map();
    for (const it of items || []) {
      const k = statKey(it);
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(it);
    }
    return m;
  }
  function byStats(idx, it) {
    const l = idx && idx.get(statKey(it));
    return l && l.length === 1 ? l[0] : null;
  }
  function onHero(items, code, slot, seen = {}) {
    if (!code || !slot) return null;
    // two copies of one hero (45 hero + slot pairs on the owner's file): what the screen shows tells them apart
    const l = (items || []).filter(
      (it) =>
        it.equipped === code &&
        it.gear === slot &&
        (!seen.unit || it.unit === seen.unit) &&
        (seen.enhance === undefined || seen.enhance === null || Number(seen.enhance) === Number(it.enhance)) &&
        (!seen.level || Number(seen.level) === Number(it.level)) &&
        (!seen.set || !it.set || seen.set === it.set),
    );
    return l.length === 1 ? l[0] : null;
  }

  /**
   * Two copies of one hero: the copy whose gear.txt items agree with the most slots on screen (enhance, level, set
   * where read), or null when two copies agree as well (or there is only one copy: no need). slots: [{ gear, enhance,
   * level, set }]
   */
  function unitOf(items, code, slots) {
    const units = new Map();
    for (const it of items || []) if (it.equipped === code && it.unit) units.set(it.unit, (units.get(it.unit) || 0) + 0);
    if (units.size < 2) return null;
    for (const u of units.keys()) {
      let n = 0;
      for (const sl of slots || []) if (sl && onHero(items, code, sl.gear, { enhance: sl.enhance, level: sl.level, set: sl.set, unit: u })) n++;
      units.set(u, n);
    }
    const r = [...units.entries()].sort((a, b) => b[1] - a[1]);
    return r[0][1] > r[1][1] ? r[0][0] : null;
  }
  /**
   * Browser: the gear.txt items in the gear store and their index, read again only when the store changed.
   * -> { items, idx }
   */
  let cache = { sig: null, items: [], idx: new Map() };
  function file() {
    let raw = '';
    try {
      raw = (root.localStorage && root.localStorage.getItem('rta-gear-v1')) || '';
    } catch (_) { /* none */ }
    const sig = raw.length + ':' + raw.slice(0, 120) + raw.slice(-200);
    if (sig === cache.sig) return cache;
    let items = [];
    try {
      items = (root.GearStore ? root.GearStore.load().items : (JSON.parse(raw || '{}').items || [])) || [];
    } catch (_) { /* none */ }
    cache = { sig, items, idx: index(items) };
    return cache;
  }
  /** Browser: an item read from the screen with all its numbers -> its gear.txt item (or null). */
  const fromFile = (item) => byStats(file().idx, item);

  const api = { statKey, index, byStats, onHero, unitOf, file, fromFile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7GearMatch = api;
})(typeof self !== 'undefined' ? self : this);
