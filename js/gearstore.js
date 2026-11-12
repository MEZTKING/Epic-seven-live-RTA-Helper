/*
 * Gear store (no DOM): the Gear Sorter's saved data, shared by the Gear page (js/gear-app.js) and the
 * game watcher's gear consumer (js/vision/consumers/gear.js), so items read from the screen are saved
 * even when the Gear page isn't open. localStorage 'rta-gear-v1':
 *   { fileName, importedAt, items (source 'fribbels', gear.txt), scanned (source 'screen'), useScanned, rules, overrides }
 * Sources stay separate: screen items are never merged into the gear.txt list.
 */
(function () {
  'use strict';
  const KEY = 'rta-gear-v1';
  const S = window.RTAGearSort;

  function load() {
    let g = null;
    try {
      g = JSON.parse(localStorage.getItem(KEY));
    } catch (_) { /* ignore */ }
    g = g && typeof g === 'object' ? g : {};
    return {
      fileName: g.fileName || '',
      importedAt: g.importedAt || null,
      items: Array.isArray(g.items) ? g.items : [],
      scanned: Array.isArray(g.scanned) ? g.scanned : [],
      useScanned: g.useScanned !== false,
      rules: { ...S.DEFAULT_RULES, ...(g.rules || {}) },
      overrides: g.overrides || {},
    };
  }
  /** Throws if the browser storage is full. */
  function save(gs) {
    localStorage.setItem(KEY, JSON.stringify(gs));
  }
  const allItems = (gs) => (gs.useScanned ? [...gs.items, ...gs.scanned] : gs.items);

  /** Add an item read from the screen to gs.scanned. Returns the stored item, or null if it's already there. */
  function addScanned(gs, item, key) {
    if (gs.scanned.some((x) => x.key === key)) return null;
    const slim = {
      id: 'scan-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      key,
      source: 'screen',
      gear: item.gear,
      set: item.set,
      rank: item.rank,
      level: item.level,
      enhance: item.enhance,
      name: '',
      locked: false,
      main: item.main,
      subs: item.substats.map((x) => ({ type: x.type, value: x.value })),
      equipped: null,
      at: new Date().toISOString(),
    };
    gs.scanned.push(slim);
    return slim;
  }

  window.GearStore = { KEY, load, save, allItems, addScanned };
})();
