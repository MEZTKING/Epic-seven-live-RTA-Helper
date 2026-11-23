/*
 * Gear store (no DOM): the Gear Sorter's saved data, shared by the Gear page (js/gear-app.js) and the
 * game watcher's gear consumer (js/vision/consumers/gear.js), so items read from the screen are saved
 * even when the Gear page isn't open. localStorage 'rta-gear-v1':
 *   { fileName, importedAt, items (source 'fribbels', gear.txt), scanned (source 'screen'), useScanned, rules, overrides,
 *     presets (source 'my presets'), moves (planned moves, a to-do list) }
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
      fileMtime: g.fileMtime || null, // the re-imported file's version and place (DEVLOG #94)
      filePath: g.filePath || null,
      items: Array.isArray(g.items) ? g.items : [],
      scanned: Array.isArray(g.scanned) ? g.scanned : [],
      useScanned: g.useScanned !== false,
      rules: { ...S.DEFAULT_RULES, ...(g.rules || {}) },
      overrides: g.overrides || {},
      // DEVLOG #79: your gear presets [{ id, hero, name, items: { slot: item id } }] and planned moves
      // [{ id, item, from, to, done, at }] (kept here so every window that saves the store keeps them)
      presets: Array.isArray(g.presets) ? g.presets : [],
      moves: Array.isArray(g.moves) ? g.moves : [],
      // DEVLOG #84: what the game's hero equipment screen showed, per hero code: { name, at, stats, slots: [{ gear, enhance,
      // level, set, art, itemId|null, candidates }] } (source 'screen')
      heroSeen: g.heroSeen && typeof g.heroSeen === 'object' ? g.heroSeen : {},
      // DEVLOG #86: the heroes you are gearing (hero codes); empty = every hero with gear
      priority: Array.isArray(g.priority) ? g.priority : [],
      skip: Array.isArray(g.skip) ? g.skip : [], // heroes you don't gear (DEVLOG #90)
      // DEVLOG #95: what each hero should be geared for { code: { goal, min, set4, set2 } } (auto-gear, the whole list)
      targets: g.targets && typeof g.targets === 'object' ? g.targets : {},
    };
  }
  /** Throws if the browser storage is full. */
  function save(gs) {
    localStorage.setItem(KEY, JSON.stringify(gs));
  }
  // a screen item that IS a gear.txt item (`fileId`, DEVLOG #88) is counted once: as the gear.txt item (its hero)
  function allItems(gs) {
    if (!gs.useScanned) return gs.items;
    const inFile = new Set(gs.items.map((x) => x.id));
    return [...gs.items, ...gs.scanned.filter((x) => !(x.fileId && inFile.has(x.fileId)))];
  }

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
      ...(item.gameScore ? { gameScore: item.gameScore } : {}), // the game's Equipment Score as read (DEVLOG #83)
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
