/*
 * My devices sync: your own data on PC and phone (DEVLOG #27). Browser: window.MySync. Node: require() (tests).
 *
 * What syncs, in SECTIONS that stay separate (sources are never merged into each other):
 *   RTA store 'rta-helper-v2': notes, custom heroes, Fribbels import, presets, matches (+ match sources), my speeds,
 *   meta imports, scouting, game help, settings.   Gear store 'rta-gear-v1': gear.txt items, screen-read items, rules.
 * What does NOT sync (belongs to one device/screen): the current draft, calibration boxes, corrections, game area,
 * saved pictures, taught screens. Guild War has its own shared sync (js/sync.js).
 *
 * Where: YOUR Firebase project (the same one as Guild War, or another), Firestore
 *   personal/{key}/sections/{sectionId}  { hash, updatedAt, device, n }
 *   personal/{key}/chunks/{sectionId}~{i} { hash, data }   (≤ 700 kB each; Firestore documents max out at 1 MiB)
 * The long random key is the only secret: anyone with your link can read/write your synced data. Anonymous sign-in.
 *
 * Rules per section: changed here only → upload; changed there only → download; both → lists with ids are merged
 * three-way (adds and deletes from both sides kept), everything else: the newer change wins.
 * The first time a device joins, the cloud copy wins (except for mergeable lists, which are merged).
 */
(function (root) {
  'use strict';
  const RTA = 'rta-helper-v2';
  const GEAR = 'rta-gear-v1';
  const STATE_KEY = 'e7-mysync';
  const CHUNK = 700000;

  const SECTIONS = [
    { id: 'rta-notes', key: RTA, fields: ['notes'], label: 'RTA: your notes, tags, counters' },
    { id: 'rta-custom', key: RTA, fields: ['custom', 'manualOwned', 'mySpeeds'], label: 'RTA: custom heroes, owned list, typed speeds' },
    { id: 'rta-fribbels', key: RTA, fields: ['fribbels', 'fribbelsData'], label: 'RTA: Fribbels import' },
    { id: 'rta-presets', key: RTA, fields: ['presets'], byId: 'presets', label: 'RTA: team presets' },
    { id: 'rta-matches', key: RTA, fields: ['matches', 'matchSources'], byId: 'matches', label: 'RTA: match history' },
    { id: 'rta-scouting', key: RTA, fields: ['scouting'], byId: 'scouting', label: 'RTA: opponent scouting' },
    { id: 'rta-gamehelp', key: RTA, fields: ['gameHelp'], byId: 'gameHelp', label: "RTA: game's drafting help" },
    { id: 'rta-meta', key: RTA, fields: ['meta'], label: 'RTA: imported meta stats' },
    { id: 'rta-settings', key: RTA, fields: ['settings'], label: 'RTA: settings' },
    { id: 'gear-items', key: GEAR, fields: ['items', 'fileName', 'importedAt'], label: 'Gear: gear.txt items' },
    { id: 'gear-scanned', key: GEAR, fields: ['scanned', 'useScanned'], label: 'Gear: items read from the screen' },
    { id: 'gear-prefs', key: GEAR, fields: ['rules', 'overrides'], label: 'Gear: rules and hero weights' },
  ];

  /** FNV-1a 32-bit over a string → 8 hex chars. */
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }
  const readJSON = (storage, key) => {
    try {
      return JSON.parse(storage.getItem(key) || 'null') || {};
    } catch (_) {
      return {};
    }
  };
  /** { [sectionId]: { value, json, hash, empty } } for this device. */
  function readLocal(storage) {
    const stores = {};
    const out = {};
    for (const s of SECTIONS) {
      const st = stores[s.key] || (stores[s.key] = readJSON(storage, s.key));
      const value = {};
      for (const f of s.fields) value[f] = st[f] === undefined ? null : st[f];
      const json = JSON.stringify(value);
      const empty = s.fields.every((f) => {
        const v = value[f];
        return v === null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
      });
      out[s.id] = { value, json, hash: hash(json), empty };
    }
    return out;
  }
  /** Write one section's fields into its store (other fields untouched). */
  function applyLocal(storage, sectionId, value) {
    const s = SECTIONS.find((x) => x.id === sectionId);
    const st = readJSON(storage, s.key);
    for (const f of s.fields) if (value && f in value) st[f] = value[f];
    storage.setItem(s.key, JSON.stringify(st));
  }

  /**
   * Three-way merge of lists with ids. base = ids at the last sync (null on first sync: keep everything from both).
   * Same id on both sides: this device's version is kept.
   */
  function mergeList(local, remote, base) {
    const L = Array.isArray(local) ? local : [];
    const R = Array.isArray(remote) ? remote : [];
    const B = base ? new Set(base) : null;
    const lIds = new Set(L.map((x) => x && x.id));
    const rIds = new Set(R.map((x) => x && x.id));
    const out = [];
    for (const x of L) {
      if (!x || x.id === undefined) out.push(x);
      else if (rIds.has(x.id) || !B || !B.has(x.id)) out.push(x); // on both, or new here
      // else: it was deleted on the other device
    }
    for (const x of R) {
      if (!x || x.id === undefined || lIds.has(x.id)) continue;
      if (!B || !B.has(x.id)) out.push(x); // new there (if it was in base, it was deleted here)
    }
    if (out.some((x) => x && (x.date || x.at))) out.sort((a, b) => String((b && (b.date || b.at)) || '').localeCompare(String((a && (a.date || a.at)) || '')));
    return out;
  }
  function mergeSection(sec, localVal, remoteVal, baseIds) {
    const v = { ...remoteVal, ...localVal };
    v[sec.byId] = mergeList(localVal && localVal[sec.byId], remoteVal && remoteVal[sec.byId], baseIds);
    if (sec.id === 'rta-matches') v.matchSources = { ...((remoteVal && remoteVal.matchSources) || {}), ...((localVal && localVal.matchSources) || {}) };
    return v;
  }
  const idsOf = (sec, value) => (sec.byId && value && Array.isArray(value[sec.byId]) ? value[sec.byId].map((x) => x && x.id).filter((x) => x !== undefined) : null);

  /**
   * What to do with one section. local: {hash, empty}; remote: {hash, updatedAt}|null; last: {hash}|null (last sync);
   * changedAt: when this device's change was first noticed (ISO) — used when both sides changed.
   */
  function decide(sec, local, remote, last, changedAt) {
    if (!remote) return local.empty && !last ? 'none' : 'push';
    if (remote.hash === local.hash) return 'none';
    if (!last) return local.empty ? 'pull' : sec.byId ? 'merge' : 'pull'; // first time on this device: the cloud copy wins
    const localChanged = local.hash !== last.hash;
    const remoteChanged = remote.hash !== last.hash;
    if (localChanged && !remoteChanged) return 'push';
    if (!localChanged && remoteChanged) return 'pull';
    if (sec.byId) return 'merge';
    return String(remote.updatedAt || '') > String(changedAt || '') ? 'pull' : 'push';
  }

  /**
   * One sync pass. remote: { list(), get(id, meta), put(id, value, meta) }. state: persisted object (mutated).
   * Returns { pushed, pulled, merged } (section ids).
   */
  async function syncOnce({ storage, remote, state, device, now = () => new Date().toISOString() }) {
    state.sections = state.sections || {};
    state.changedAt = state.changedAt || {};
    const local = readLocal(storage);
    const metas = await remote.list();
    const done = { pushed: [], pulled: [], merged: [] };
    for (const sec of SECTIONS) {
      const L = local[sec.id];
      const last = state.sections[sec.id] || null;
      if (last && L.hash !== last.hash && !state.changedAt[sec.id]) state.changedAt[sec.id] = now();
      const action = decide(sec, L, metas[sec.id] || null, last, state.changedAt[sec.id]);
      if (action === 'none') {
        if (metas[sec.id] && metas[sec.id].hash === L.hash) state.sections[sec.id] = { hash: L.hash, at: now(), ids: idsOf(sec, L.value) };
        continue;
      }
      let value = L.value;
      if (action === 'pull' || action === 'merge') {
        const rv = await remote.get(sec.id, metas[sec.id]);
        if (rv === null) continue; // half-written upload from another device: try again next time
        value = action === 'pull' ? rv : mergeSection(sec, L.value, rv, last && last.ids);
        applyLocal(storage, sec.id, value);
        done[action === 'pull' ? 'pulled' : 'merged'].push(sec.id);
      }
      const json = JSON.stringify(value);
      const h = hash(json);
      if (action === 'push' || action === 'merge') {
        if (!metas[sec.id] || metas[sec.id].hash !== h) await remote.put(sec.id, value, { hash: h, json, updatedAt: now(), device });
        if (action === 'push') done.pushed.push(sec.id);
      }
      state.sections[sec.id] = { hash: h, at: now(), ids: idsOf(sec, value) };
      delete state.changedAt[sec.id];
    }
    return done;
  }

  // ---------------------------------------------------------------- remotes
  function chunks(json) {
    const out = [];
    for (let i = 0; i < json.length; i += CHUNK) out.push(json.slice(i, i + CHUNK));
    return out.length ? out : [''];
  }
  /** In-memory remote (tests; also shows the contract). */
  function memoryRemote(store = { sections: {}, chunks: {} }) {
    return {
      store,
      async list() {
        return JSON.parse(JSON.stringify(store.sections));
      },
      async get(id, meta) {
        const parts = [];
        for (let i = 0; i < meta.n; i++) {
          const c = store.chunks[`${id}~${i}`];
          if (!c || c.hash !== meta.hash) return null;
          parts.push(c.data);
        }
        return JSON.parse(parts.join(''));
      },
      async put(id, value, meta) {
        const cs = chunks(meta.json);
        cs.forEach((data, i) => (store.chunks[`${id}~${i}`] = { hash: meta.hash, data }));
        store.sections[id] = { hash: meta.hash, updatedAt: meta.updatedAt, device: meta.device, n: cs.length };
      },
    };
  }
  /** Firestore remote in YOUR Firebase project (loads the SDK like js/sync.js; tests pass a fake `fb`). */
  async function firestoreRemote(key, config, { fb = null } = {}) {
    const S = root.RTASync || (typeof require !== 'undefined' ? require('./sync.js') : null);
    const cfg = S.parseConfig(config);
    if (!fb) {
      const v = S.FIREBASE_VERSION;
      for (const n of ['app', 'auth', 'firestore']) await loadScript(`https://www.gstatic.com/firebasejs/${v}/firebase-${n}-compat.js`);
      fb = root.firebase;
    }
    const name = `rta-${cfg.projectId}`;
    const app = (fb.apps || []).find((a) => a.name === name) || fb.initializeApp(cfg, name);
    const auth = app.auth();
    if (!auth.currentUser) await auth.signInAnonymously();
    const base = app.firestore().collection('personal').doc(key);
    const sections = base.collection('sections');
    const chunkCol = base.collection('chunks');
    return {
      async list() {
        const snap = await sections.get();
        const out = {};
        snap.docs.forEach((d) => (out[d.id] = d.data()));
        return out;
      },
      async get(id, meta) {
        const parts = [];
        for (let i = 0; i < meta.n; i++) {
          const d = await chunkCol.doc(`${id}~${i}`).get();
          const c = d.exists ? d.data() : null;
          if (!c || c.hash !== meta.hash) return null;
          parts.push(c.data);
        }
        return JSON.parse(parts.join(''));
      },
      async put(id, value, meta) {
        const cs = chunks(meta.json);
        for (let i = 0; i < cs.length; i++) await chunkCol.doc(`${id}~${i}`).set({ hash: meta.hash, data: cs[i] });
        await sections.doc(id).set({ hash: meta.hash, updatedAt: meta.updatedAt, device: meta.device, n: cs.length });
      },
    };
  }
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }

  // ---------------------------------------------------------------- links
  /** index.html#sync=<key>&c=<base64 config>: open it on the other device (the part after # never reaches a server). */
  function link(base, key, config) {
    const c = btoa(unescape(encodeURIComponent(JSON.stringify(config))));
    return `${base}#sync=${encodeURIComponent(key)}&c=${encodeURIComponent(c)}`;
  }
  function parseLink(h) {
    const p = new URLSearchParams(String(h || '').replace(/^#/, ''));
    const key = p.get('sync');
    if (!key) return null;
    try {
      return { key, config: JSON.parse(decodeURIComponent(escape(atob(p.get('c') || '')))) };
    } catch (_) {
      return { key, config: null };
    }
  }
  function newKey() {
    const a = new Uint8Array(18);
    (root.crypto || require('crypto').webcrypto).getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  const api = { SECTIONS, STATE_KEY, hash, readLocal, applyLocal, mergeList, decide, syncOnce, memoryRemote, firestoreRemote, link, parseLink, newKey, CHUNK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MySync = api;
})(typeof window !== 'undefined' ? window : globalThis);
