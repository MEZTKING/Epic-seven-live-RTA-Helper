/*
 * The opponents' profile art pictures (DEVLOG #70), kept on this PC in IndexedDB 'e7-rta-arts' (store 'pics', key =
 * the art's id from localStorage['e7-rta-arts'], value { id, jpg: dataURL, w, h, at }). Shared by the game watcher
 * (writes, js/vision/readers/rta-art.js) and the RTA page's gallery (reads). Browser: window.E7ArtStore.
 *   put(id, rec) · get(id) · all() · remove(id)
 */
(function () {
  'use strict';
  const open = () =>
    new Promise((res) => {
      try {
        const r = indexedDB.open('e7-rta-arts', 1);
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
  window.E7ArtStore = {
    put: (id, rec) => run('readwrite', (st) => st.put({ ...rec, id })),
    get: (id) => run('readonly', (st) => st.get(id)),
    all: async () => (await run('readonly', (st) => st.getAll())) || [],
    remove: (id) => run('readwrite', (st) => st.delete(id)),
  };
})();
