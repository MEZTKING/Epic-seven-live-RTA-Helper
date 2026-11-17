/*
 * The heroes' ROUND ICONS as face templates, loaded once and shared by every reader next to the game watcher
 * (DEVLOG #63): the RTA draft's pre-ban icons, Guild War defense / result / offense icons.
 *
 *   E7Icons.load()      start (once); a promise that resolves when every picture was loaded or tried
 *   E7Icons.ready()     all of them are in
 *   E7Icons.base()      [{ code, vec, source }]            one per hero (what the pre-ban row shows)
 *   E7Icons.all()       base + skins ({ …, skin: true })   (Guild War shows the skin a player wears)
 *   E7Icons.count() / .total / .fromCache
 *   E7Icons.store       the template cache (IndexedDB 'e7-templates'), also used for the wide portraits
 *
 * Which picture (measured on the owner's real screens, 51 icons): the game's own icon file from the community asset
 * repository (CeciliaBot/E7Assets-Temp, `{code}_s.png`) where it exists, source label 'game icon'; the official
 * site's icon only for a hero the repository has none for ('official'). The official site shows OLDER artwork for
 * about half of the heroes (195 of 367 compared), which is why round icons were read unevenly before.
 * Templates are kept between app starts (valid for the same picture list and month).
 */
(function () {
  'use strict';
  const F = window.RTAFaces;
  const R = window.RTARoster;
  const S = window.RTASources || {};
  if (!F || !R) return;
  const HEROES = S.allHeroes || (S.officialSnapshot && S.officialSnapshot.heroes) || [];
  const LIST = S.widePortraits || {};
  const GAME = new Set(LIST.icons || []);
  const SKINS = LIST.iconSkins || {};
  const MONTH = new Date().toISOString().slice(0, 7);

  const store = (() => {
    const open = () =>
      new Promise((res) => {
        try {
          const r = indexedDB.open('e7-templates', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('t');
          r.onsuccess = () => res(r.result);
          r.onerror = () => res(null);
        } catch (_) {
          res(null);
        }
      });
    return {
      async get(key) {
        const db = await open();
        if (!db) return null;
        return new Promise((res) => {
          try {
            const q = db.transaction('t').objectStore('t').get(key);
            q.onsuccess = () => res(q.result || null);
            q.onerror = () => res(null);
          } catch (_) {
            res(null);
          }
        });
      },
      async set(key, val) {
        const db = await open();
        if (!db) return;
        try {
          db.transaction('t', 'readwrite').objectStore('t').put(val, key);
        } catch (_) { /* no room: it is only a cache */ }
      },
    };
  })();

  // what to load: per hero the game's icon (else the official one), then its skins
  const jobs = [];
  for (const h of HEROES) {
    if (GAME.has(h.code)) jobs.push({ code: h.code, url: R.GAME_ICON_URL(h.code), source: 'game icon', fallback: h.source === 'official' || !h.source ? R.PORTRAIT_URL_CORS(h.code) : null });
    else jobs.push({ code: h.code, url: R.PORTRAIT_URL_CORS(h.code), source: 'official' });
    for (const nn of SKINS[h.code] || []) jobs.push({ code: h.code, url: R.GAME_ICON_URL(`${h.code}_s${nn}`), source: 'game icon', skin: true });
  }
  const sig = `${LIST.listedAt || ''}|${jobs.length}|${MONTH}|v1`;
  const tpl = [];
  const state = { done: 0, started: 0, fromCache: false, promise: null };

  function load() {
    if (state.promise) return state.promise;
    state.started = Date.now();
    state.promise = new Promise((finish) => {
      let i = 0;
      const end = () => {
        if (state.done < jobs.length) return;
        if (!state.fromCache && tpl.length >= jobs.length * 0.9) store.set('icons', { sig, items: tpl.map((x) => ({ code: x.code, vec: x.vec, source: x.source, skin: !!x.skin })) });
        finish();
      };
      const next = () => {
        if (i >= jobs.length) return end();
        const j = jobs[i++];
        const get = (url, source, fallback) => {
          const im = new Image();
          im.crossOrigin = 'anonymous';
          im.onload = () => {
            try {
              tpl.push({ code: j.code, vec: F.fromPortrait(im), source, ...(j.skin ? { skin: true } : {}) });
            } catch (_) { /* unreadable: skipped */ }
            state.done++;
            next();
          };
          im.onerror = () => {
            if (fallback) return get(fallback, 'official', null); // the repository has lost it: the official icon
            state.done++;
            next();
          };
          im.src = url;
        };
        get(j.url, j.source, j.fallback);
      };
      store.get('icons').then((c) => {
        if (c && c.sig === sig && Array.isArray(c.items) && c.items.length) {
          for (const x of c.items) tpl.push({ code: x.code, vec: x.vec, source: x.source, ...(x.skin ? { skin: true } : {}) });
          state.fromCache = true;
          state.done = jobs.length;
          return finish();
        }
        if (!jobs.length) return finish();
        for (let k = 0; k < 12; k++) next();
      });
    });
    return state.promise;
  }
  const ready = () => state.started > 0 && state.done >= jobs.length;
  let baseList = null;
  let baseN = -1;
  const base = () => {
    if (baseN !== tpl.length) {
      baseList = tpl.filter((t) => !t.skin);
      baseN = tpl.length;
    }
    return baseList;
  };

  window.E7Icons = {
    load, ready, base, all: () => tpl, count: () => tpl.length, total: jobs.length, store,
    get fromCache() {
      return state.fromCache;
    },
    get started() {
      return state.started;
    },
  };
})();
