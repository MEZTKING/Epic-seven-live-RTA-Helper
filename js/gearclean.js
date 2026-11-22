/*
 * Free up inventory space (DEVLOG #93). Pure (Node + browser). Browser: window.E7GearClean.
 * The game's inventory count is your SPARE items only (worn items don't count: the owner's gear.txt has 2 773 items,
 * the game showed 1 199 / 1 200). So space comes from:
 *   remove: spare items the sorter says to extract / sell, and spare "duplicates": an item beaten on every number by
 *           another spare item of the same slot, set and main stat (at least as high a main stat, every substat at
 *           least as high, enhanced as far, level as high), so the better copy stays;
 *   park:   spare items worth keeping put on heroes you don't gear (worn items don't take space); only the empty slots
 *           the app knows of on those heroes.
 * Never in a list: worn items, items in a preset, items the sorter says to keep as an upgrade or to enhance. Locked
 * items are listed apart (the game wants them unlocked first).
 *
 *   dominates(a, b)                          -> true when a is at least as good as b in every number (and not the same)
 *   plan(results, { presets, skip, worn })   -> { spare, remove: [{ r, why }], locked: [{ r, why }], park: [{ r, hero, slot }],
 *                                               keep, after }
 *     results = RTAGearSort.evaluateAll(...).results; worn(item) -> true when the item is on a hero (screen items)
 */
(function (root) {
  'use strict';
  const num = (x) => Number(x) || 0;
  const SLOTS = ['Weapon', 'Helmet', 'Armor', 'Necklace', 'Ring', 'Boots'];

  function dominates(a, b) {
    if (!a || !b || a === b || a.gear !== b.gear || a.set !== b.set || !a.main || !b.main || a.main.type !== b.main.type) return false;
    if (num(a.main.value) < num(b.main.value) || num(a.enhance) < num(b.enhance) || num(a.level) < num(b.level)) return false;
    const of = (it) => {
      const m = {};
      for (const s of it.subs || it.substats || []) m[s.type] = (m[s.type] || 0) + num(s.value);
      return m;
    };
    const sa = of(a);
    const sb = of(b);
    for (const [t, v] of Object.entries(sb)) if ((sa[t] || 0) < v) return false;
    return true;
  }

  function plan(results, { presets = [], skip = [], worn = () => false, equippedOf = null } = {}) {
    const inPreset = new Set();
    for (const p of presets || []) for (const id of Object.values(p.items || {})) inPreset.add(id);
    const isWorn = (it) => !!it.equipped || worn(it);
    const spareR = (results || []).filter((r) => !isWorn(r.item));
    const out = { spare: spareR.length, remove: [], locked: [], park: [], keep: 0 };
    const guarded = (r) => inPreset.has(r.item.id) || r.verdict === 'enhance' || /^Upgrade for a hero/.test(r.reason || '');
    // duplicates: beaten by another spare item that stays (ties: the first one stays)
    const bySlot = new Map();
    for (const r of spareR) {
      const k = `${r.item.gear}|${r.item.set}|${r.item.main && r.item.main.type}`;
      if (!bySlot.has(k)) bySlot.set(k, []);
      bySlot.get(k).push(r);
    }
    const beaten = new Map();
    for (const list of bySlot.values())
      list.forEach((r, i) => {
        const by = list.find((o, j) => o !== r && dominates(o.item, r.item) && (!dominates(r.item, o.item) || j < i));
        if (by) beaten.set(r, by);
      });
    for (const r of spareR) {
      if (guarded(r)) {
        out.keep++;
        continue;
      }
      let why = null;
      if (r.verdict === 'extract' || r.verdict === 'sell') why = `${r.verdict === 'extract' ? 'Extract' : 'Sell'}: ${r.reason}`;
      else if (beaten.has(r)) why = `Duplicate: another spare item is at least as good in every number`;
      if (!why) {
        out.keep++;
        continue;
      }
      (r.item.locked ? out.locked : out.remove).push({ r, why, ...(beaten.has(r) ? { better: beaten.get(r).item.id } : {}) });
    }
    // least valuable first
    const val = (x) => (x.r.reforgedWss || x.r.wss || 0);
    out.remove.sort((a, b) => val(a) - val(b));
    out.locked.sort((a, b) => val(a) - val(b));
    // parking: the empty slots of heroes you don't gear (known from what they wear)
    if (skip.length && equippedOf) {
      const free = [];
      for (const code of skip) {
        const has = new Set((equippedOf(code) || []).map((it) => it.gear));
        for (const slot of SLOTS) if (!has.has(slot)) free.push({ hero: code, slot });
      }
      const keepers = spareR.filter((r) => !out.remove.some((x) => x.r === r) && !out.locked.some((x) => x.r === r) && !inPreset.has(r.item.id));
      keepers.sort((a, b) => val({ r: b }) - val({ r: a }));
      for (const r of keepers) {
        const i = free.findIndex((f) => f.slot === r.item.gear);
        if (i < 0) continue;
        out.park.push({ r, hero: free[i].hero, slot: free[i].slot });
        free.splice(i, 1);
      }
    }
    out.after = out.spare - out.remove.length - out.park.length;
    return out;
  }

  const api = { dominates, plan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7GearClean = api;
})(typeof self !== 'undefined' ? self : this);
