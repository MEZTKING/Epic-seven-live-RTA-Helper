/*
 * Shared storage for Guild War records.
 * Browser: window.RTASync. Node: require() (for tests with a fake Firebase).
 *
 * Both backends offer the same interface:
 *   const b = await RTASync.local(guildCode)            // this browser only (+ other tabs, live)
 *   const b = await RTASync.firebase(guildCode, config)  // shared with guildmates, live
 *   b.subscribe((records) => ...)   // called now and on every change, with ALL records
 *   await b.put(record)             // create/update (adds updatedAt)
 *   await b.remove(id)              // soft delete (record kept with deleted: true, so others see it)
 *   b.close()
 *
 * Firebase: Firestore collection  guilds/{guildCode}/records/{id}
 * Sign-in is ANONYMOUS (no email or personal details). The guild code is the
 * shared secret: anyone with it can read and write that guild's records.
 */
(function (root) {
  const FIREBASE_VERSION = '10.12.2';
  const SDK = (name) => `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-${name}-compat.js`;

  const now = () => new Date().toISOString();

  // ------------------------------------------------------------------ local
  function local(guildCode, { storage = typeof localStorage !== 'undefined' ? localStorage : null } = {}) {
    const key = `rta-guild-${guildCode}`;
    const listeners = new Set();
    const read = () => {
      try {
        return JSON.parse(storage.getItem(key) || '[]');
      } catch (_) {
        return [];
      }
    };
    const write = (list) => storage.setItem(key, JSON.stringify(list));
    const emit = () => {
      const list = read();
      for (const fn of listeners) fn(list);
    };
    const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(key) : null;
    if (chan) chan.onmessage = emit;
    const onStorage = (e) => e.key === key && emit();
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
    return Promise.resolve({
      kind: 'local',
      subscribe(fn) {
        listeners.add(fn);
        fn(read());
        return () => listeners.delete(fn);
      },
      async put(record) {
        const list = read().filter((r) => r.id !== record.id);
        list.push({ ...record, updatedAt: now() });
        write(list);
        emit();
        if (chan) chan.postMessage('changed');
      },
      async remove(id, by) {
        const list = read();
        const r = list.find((x) => x.id === id);
        if (r) Object.assign(r, { deleted: true, updatedAt: now(), updatedBy: by || r.updatedBy });
        write(list);
        emit();
        if (chan) chan.postMessage('changed');
      },
      /** Replace everything (import from a file). */
      async replaceAll(records) {
        write(records);
        emit();
        if (chan) chan.postMessage('changed');
      },
      close() {
        listeners.clear();
        if (chan) chan.close();
        if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
      },
    });
  }

  // --------------------------------------------------------------- firebase
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

  /** Check a pasted Firebase web config. Returns the config object or throws. */
  function parseConfig(text) {
    if (text && typeof text === 'object') return text;
    let s = String(text || '').trim();
    // accept the snippet Firebase shows: "const firebaseConfig = { apiKey: "...", ... };"
    const m = s.match(/\{[\s\S]*\}/);
    if (m) s = m[0];
    let cfg;
    try {
      cfg = JSON.parse(s);
    } catch (_) {
      // keys without quotes -> quote them
      cfg = JSON.parse(s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":').replace(/,\s*}/g, '}'));
    }
    for (const k of ['apiKey', 'projectId', 'appId']) if (!cfg[k]) throw new Error(`Firebase config is missing "${k}".`);
    return cfg;
  }

  /**
   * fb: an already-loaded firebase namespace (tests pass a fake). In the
   * browser it's loaded from Google's CDN on first use.
   */
  async function firebase(guildCode, config, { fb = null } = {}) {
    const cfg = parseConfig(config);
    if (!fb) {
      await loadScript(SDK('app'));
      await loadScript(SDK('auth'));
      await loadScript(SDK('firestore'));
      fb = window.firebase;
    }
    const name = `rta-${cfg.projectId}`;
    const app = (fb.apps || []).find((a) => a.name === name) || fb.initializeApp(cfg, name);
    const auth = app.auth();
    if (!auth.currentUser) await auth.signInAnonymously();
    const db = app.firestore();
    const col = db.collection('guilds').doc(guildCode).collection('records');
    const unsubs = [];
    return {
      kind: 'firebase',
      projectId: cfg.projectId,
      subscribe(fn) {
        const un = col.onSnapshot(
          (snap) => fn(snap.docs.map((d) => ({ ...d.data(), id: d.id }))),
          (err) => console.warn('Guild sync error:', err),
        );
        unsubs.push(un);
        return un;
      },
      async put(record) {
        await col.doc(record.id).set({ ...record, updatedAt: now() });
      },
      async remove(id, by) {
        await col.doc(id).set({ deleted: true, updatedAt: now(), updatedBy: by || '' }, { merge: true });
      },
      async replaceAll(records) {
        for (const r of records) await col.doc(r.id).set(r);
      },
      close() {
        for (const u of unsubs) u();
      },
    };
  }

  // ------------------------------------------------------------ invite links
  /** guild.html#g=<code>&c=<base64 config>  (the hash never reaches any server) */
  function inviteLink(base, guildCode, config) {
    const c = config ? btoa(unescape(encodeURIComponent(JSON.stringify(config)))) : '';
    return `${base}#g=${encodeURIComponent(guildCode)}${c ? `&c=${encodeURIComponent(c)}` : ''}`;
  }
  function parseInvite(hash) {
    const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    const g = p.get('g');
    if (!g) return null;
    let config = null;
    const c = p.get('c');
    if (c) {
      try {
        config = JSON.parse(decodeURIComponent(escape(atob(c))));
      } catch (_) {
        config = null;
      }
    }
    return { guildCode: g, config };
  }

  const api = { FIREBASE_VERSION, local, firebase, parseConfig, inviteLink, parseInvite };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RTASync = api;
})(typeof window !== 'undefined' ? window : globalThis);
