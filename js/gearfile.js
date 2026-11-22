/*
 * Importing your gear file (DEVLOG #94). Browser: window.E7GearFile.
 *   importText(text, name, { heroes, mtime, path })  -> { count, kept }   the gear store's gear.txt items replaced (source
 *        'fribbels', kept apart from the screen items as always) and the RTA Helper's Fribbels roster updated. A file
 *        without design codes (the optimizer's own autosave.json drops them) keeps the codes of the last import, by
 *        the game's item id (`kept`).
 *   follow({ heroes, onImported, onError })  desktop: re-import the chosen file (E7Desktop.gearFile) whenever it is newer
 *        than the last import: at start and on every change. Runs in the game watcher's window (always open).
 * The file is only read, never changed; nothing is sent anywhere.
 */
(function (root) {
  'use strict';
  const MAIN_KEY = 'rta-helper-v2'; // the RTA Helper's store (only its `fribbels` roster is updated)

  function importText(text, name, { heroes = [], mtime = null, path = null } = {}) {
    const S = root.RTAGearSort;
    const GS = root.GearStore;
    const data = JSON.parse(text);
    const items = S.slimInventory(data, heroes);
    if (!items.length) throw new Error('No items found in this file.');
    const gs = GS.load();
    const old = new Map(gs.items.filter((x) => x.design).map((x) => [x.id, x.design]));
    let kept = 0;
    for (const it of items)
      if (!it.design && old.has(it.id)) {
        it.design = old.get(it.id);
        kept++;
      }
    const next = { ...gs, fileName: name, importedAt: new Date().toISOString(), fileMtime: mtime, filePath: path, items };
    GS.save(next);
    // keep the RTA Helper's roster + speeds in step (its own 'fribbels' source)
    try {
      const R = root.RTARoster;
      const G = root.RTAGear;
      const main = JSON.parse(localStorage.getItem(MAIN_KEY) || 'null');
      if (R && G && main && typeof main === 'object') {
        const r = R.parseFribbels(text, heroes);
        main.fribbels = { source: 'fribbels', fileName: name, importedAt: next.importedAt, ...r, builds: G.extractBuilds(data, heroes) };
        localStorage.setItem(MAIN_KEY, JSON.stringify(main));
      }
    } catch (_) { /* the helper picks it up on its own import */ }
    return { count: items.length, kept, gs: next };
  }

  let following = false;
  async function follow({ heroes = [], onImported = null, onError = null } = {}) {
    const D = root.E7Desktop;
    if (following || !D || !D.gearFile) return;
    following = true;
    let busy = false;
    const check = async (info) => {
      if (busy || !info || !info.path || info.missing) return;
      const gs = root.GearStore.load();
      if (gs.filePath === info.path && gs.fileMtime && gs.fileMtime >= info.mtime) return; // already this version
      busy = true;
      try {
        const r = await D.gearFile.read();
        if (r && r.text) {
          const res = importText(r.text, r.name, { heroes, mtime: r.mtime, path: r.path });
          if (onImported) onImported(res, r);
        }
      } catch (e) {
        if (onError) onError(e);
      } finally {
        busy = false;
      }
    };
    D.gearFile.onChanged(check);
    check(await D.gearFile.info());
  }

  root.E7GearFile = { importText, follow, MAIN_KEY };
})(typeof self !== 'undefined' ? self : this);
