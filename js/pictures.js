/*
 * Saved game pictures (this device only, IndexedDB 'e7-pictures'), so boxes can be drawn AFTER a match
 * instead of during it. Pictures are fractions-independent: boxes drawn on one picture work in every
 * later game as long as the game window keeps the same shape.
 *   - Ctrl+Shift+S in the desktop app (or "Save a game picture") saves the current game picture.
 *   - The RTA reader also saves one every 15 s on its own while it isn't calibrated yet.
 * Keeps the newest MAX pictures. Window.E7Pictures = { add, list, get, remove, clear }
 */
(function () {
  'use strict';
  const DB = 'e7-pictures';
  const STORE = 'pictures';
  const MAX = 60; // ~8 per match (match start, draft screen, board): the last several matches
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('This browser has no IndexedDB.'));
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const tx = async (mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => res(out && 'result' in out ? out.result : out);
      t.onerror = () => rej(t.error);
    });
  };

  /** pic: { url (data URL), w, h, frameKey?, note? } */
  async function add(pic) {
    const item = { id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, at: new Date().toISOString(), note: '', ...pic };
    await tx('readwrite', (s) => s.put(item));
    const all = await list();
    for (const old of all.slice(MAX)) await remove(old.id);
    return item;
  }
  /** Newest first (without loading every picture's pixels twice). */
  async function list() {
    const all = await tx('readonly', (s) => s.getAll());
    return (all || []).sort((a, b) => (a.at < b.at ? 1 : -1));
  }
  const get = (id) => tx('readonly', (s) => s.get(id));
  const remove = (id) => tx('readwrite', (s) => s.delete(id));
  const clear = () => tx('readwrite', (s) => s.clear());

  /** A picture of anything drawable (video, canvas, image), as JPEG. */
  function capture(src, note, extra) {
    const w = src.videoWidth || src.naturalWidth || src.width;
    const h = src.videoHeight || src.naturalHeight || src.height;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    cv.getContext('2d').drawImage(src, 0, 0);
    return add({ url: cv.toDataURL('image/jpeg', 0.9), w, h, frameKey: window.GameArea ? window.GameArea.frameKey(src) : 'full', note: note || '', ...(extra || {}) });
  }

  window.E7Pictures = { add, list, get, remove, clear, capture, MAX };
})();
