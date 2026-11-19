/*
 * Pictures of gear items as the game showed them (DEVLOG #78), kept on this PC in IndexedDB 'e7-gear-pics' (store 'pics', key =
 * the item's id in the gear store, value { id, icon: dataURL (the item's picture), shot: dataURL (its stats as shown),
 * from: 'panel' | 'grid', at }). Written by the game watcher's gear consumer (js/vision/consumers/gear.js), read by the
 * Gear page (js/gear-app.js). Browser: window.E7GearPics.
 *   put(id, rec) · get(id) · all() · remove(id)
 */
(function () {
  'use strict';
  const open = () =>
    new Promise((res) => {
      try {
        const r = indexedDB.open('e7-gear-pics', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('pics', { keyPath: 'id' });
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(null);
      } catch (_) {
        res(null);
      }
    });
  const run = async (mode, fn) => {
    const db = await open();
    if (!db) return null;
    return new Promise((res) => {
      try {
        const st = db.transaction('pics', mode).objectStore('pics');
        const q = fn(st);
        if (!q) return res(null);
        q.onsuccess = () => res(q.result === undefined ? null : q.result);
        q.onerror = () => res(null);
      } catch (_) {
        res(null);
      }
    });
  };
  window.E7GearPics = {
    put: (id, rec) => run('readwrite', (st) => st.put({ ...rec, id })),
    get: (id) => run('readonly', (st) => st.get(id)),
    all: async () => (await run('readonly', (st) => st.getAll())) || [],
    remove: (id) => run('readwrite', (st) => st.delete(id)),
  };
})();
