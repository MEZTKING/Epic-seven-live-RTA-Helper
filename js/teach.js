/*
 * Teach heroes (DEVLOG #35): hero faces YOU taught, by drawing a box around a hero icon on any picture and typing
 * the name. Browser: window.E7Teach. Node: require() (tests).
 *
 * It's example-based learning, not neural-network training: each example is a 32×32 face (js/faces.js) the face
 * matcher compares against, next to the official portraits. A taught face beats the official portrait for skins,
 * other art and odd crops. More examples of the same hero (from different screens) = recognised in more places.
 *
 * Stored on this device: localStorage 'e7-face-examples' = { on, examples: [{ id, code, q, thumb, from, at }] }
 *   q     = quantized face (RTAFaces.quantize), thumb = 48 px JPEG to show in the library, from = where it came from.
 * Source label in every reason: 'taught by you'. Kept apart from the RTA reader's corrections (RTA → Auto) and the
 * Guild War page's corrections ('e7-gw-face-corrections'); each can be switched off / forgotten on its own.
 *
 *   E7Teach.list() / add({code, q, thumb, from}) / remove(id) / clear() / enabled() / setEnabled(on)
 *   E7Teach.templates(F)       -> [{ code, vec, source: 'taught by you' }] (empty when switched off)
 *   E7Teach.byHero()           -> Map code -> examples (newest first)
 *   E7Teach.exportJSON() / importJSON(text) -> back up / share (import keeps ids, skips ones already here)
 *   E7Teach.onChange(cb)       -> this tab and other tabs/windows
 */
(function (root) {
  'use strict';
  const KEY = 'e7-face-examples';
  const SOURCE = 'taught by you';
  const MAX_PER_HERO = 12;
  const MAX_TOTAL = 500;

  function make(storage) {
    const listeners = new Set();
    const read = () => {
      try {
        const v = JSON.parse(storage.getItem(KEY) || 'null');
        return v && typeof v === 'object' ? { on: v.on !== false, examples: Array.isArray(v.examples) ? v.examples : [] } : { on: true, examples: [] };
      } catch (_) {
        return { on: true, examples: [] };
      }
    };
    const fire = () => {
      for (const cb of listeners) {
        try {
          cb();
        } catch (_) { /* a listener's problem */ }
      }
    };
    const write = (st) => {
      storage.setItem(KEY, JSON.stringify(st));
      fire();
    };
    const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

    function add({ code, q, thumb, from }) {
      if (!code || !q || !q.s) throw new Error('an example needs a hero and a face');
      const st = read();
      const ex = { id: newId(), code, q, thumb: thumb || '', from: String(from || '').slice(0, 80), at: new Date().toISOString() };
      st.examples.push(ex);
      // keep the newest MAX_PER_HERO of this hero and MAX_TOTAL overall
      const mine = st.examples.filter((x) => x.code === code);
      while (mine.length > MAX_PER_HERO) st.examples.splice(st.examples.indexOf(mine.shift()), 1);
      while (st.examples.length > MAX_TOTAL) st.examples.shift();
      write(st);
      return ex;
    }
    function remove(id) {
      const st = read();
      st.examples = st.examples.filter((x) => x.id !== id);
      write(st);
    }
    function clear() {
      const st = read();
      st.examples = [];
      write(st);
    }
    function setEnabled(on) {
      const st = read();
      st.on = !!on;
      write(st);
    }
    function templates(F) {
      const st = read();
      if (!st.on || !F) return [];
      return st.examples.filter((x) => x.q).map((x) => ({ code: x.code, vec: F.dequantize(x.q), source: SOURCE }));
    }
    function byHero() {
      const m = new Map();
      for (const x of [...read().examples].reverse()) {
        if (!m.has(x.code)) m.set(x.code, []);
        m.get(x.code).push(x);
      }
      return m;
    }
    function exportJSON() {
      return JSON.stringify({ kind: 'epic7-engine-face-examples', version: 1, examples: read().examples }, null, 1);
    }
    function importJSON(text) {
      const v = JSON.parse(text);
      const list = Array.isArray(v) ? v : v && Array.isArray(v.examples) ? v.examples : null;
      if (!list) throw new Error('not a face examples file');
      const st = read();
      const have = new Set(st.examples.map((x) => x.id));
      let added = 0;
      for (const x of list) {
        if (!x || !x.code || !x.q || !x.q.s || have.has(x.id)) continue;
        st.examples.push({ id: x.id || newId(), code: String(x.code), q: { s: String(x.q.s), m: +x.q.m || 0 }, thumb: typeof x.thumb === 'string' && x.thumb.startsWith('data:image/') ? x.thumb : '', from: String(x.from || 'imported').slice(0, 80), at: x.at || new Date().toISOString() });
        added++;
      }
      while (st.examples.length > MAX_TOTAL) st.examples.shift();
      write(st);
      return added;
    }
    function onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    }
    return {
      KEY, SOURCE, MAX_PER_HERO, MAX_TOTAL,
      list: () => read().examples, enabled: () => read().on,
      add, remove, clear, setEnabled, templates, byHero, exportJSON, importJSON, onChange,
      _fire: fire, // another tab/window changed it
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { make, KEY };
  else if (root.localStorage) {
    const api = make(root.localStorage);
    // other tabs / windows (game watcher, RTA page) see changes through the storage event
    root.addEventListener('storage', (e) => e.key === KEY && api._fire());
    root.E7Teach = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
