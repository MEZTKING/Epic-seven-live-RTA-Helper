/*
 * Arena fight log (DEVLOG #71), kept next to the game watcher (vision.html / live.html) so fights are logged even when
 * the Arena page is closed. Listens to the arena readers (js/vision/readers/arena.js) and writes
 *   localStorage['e7-arena'] = { now: { at, list }, defs: { <name lower>: { name, heroes, pts, at } },
 *                                 pending: { name, pts, defense, at } | null, fights: [ … ] }
 * A fight: { at, opponent, theirPts, defense: [codes ×4], mine: [code|null ×4], result: 'win'|'loss', points, delta }.
 * The Arena page (js/arena-app.js) reads it. On this PC only.
 */
(function () {
  'use strict';
  const A = window.E7Arena;
  const B = window.E7Bus;
  if (!A || !B) return;
  const KEY = 'e7-arena';
  const load = () => {
    try {
      return { now: null, defs: {}, pending: null, fights: [], ...(JSON.parse(localStorage.getItem(KEY) || '{}') || {}) };
    } catch (_) {
      return { now: null, defs: {}, pending: null, fights: [] };
    }
  };
  const save = (s) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch (_) { /* storage full */ }
  };
  // names read twice can differ in a letter or in capitals ("RivalTwo" / "Rivaltwo")
  const close = (a, b) => {
    a = String(a || '').toLowerCase();
    b = String(b || '').toLowerCase();
    if (!a || !b) return false;
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    let d = 0;
    for (let i = 0, j = 0; i < a.length || j < b.length; ) {
      if (a[i] === b[j]) {
        i++;
        j++;
        continue;
      }
      if (++d > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else {
        i++;
        j++;
      }
    }
    return true;
  };
  const defenseOf = (s, name) => {
    const fromNow = s.now && (s.now.list || []).find((o) => close(o.name, name));
    if (fromNow) return fromNow;
    const k = Object.keys(s.defs || {}).find((n) => close(n, name));
    return k ? s.defs[k] : null;
  };
  B.on('arena:opponents', (d) => {
    if (!d || !Array.isArray(d.list)) return;
    const s = load();
    s.now = { at: Date.now(), list: d.list };
    for (const o of d.list) s.defs[o.name.toLowerCase()] = { name: o.name, heroes: o.heroes, pts: o.pts, at: Date.now() };
    // the newest 300 opponents
    const names = Object.keys(s.defs).sort((a, b) => s.defs[b].at - s.defs[a].at);
    for (const n of names.slice(300)) delete s.defs[n];
    save(s);
  });
  B.on('arena:prep', (d) => {
    if (!d || !d.name) return;
    const s = load();
    const o = defenseOf(s, d.name);
    s.pending = { name: (o && o.name) || d.name, pts: d.pts, defense: (o && o.heroes) || [], at: Date.now() };
    save(s);
  });
  B.on('arena:result', (d) => {
    if (!d || !d.result) return;
    const s = load();
    const p = s.pending && Date.now() - s.pending.at < 15 * 60000 ? s.pending : null;
    s.fights = A.addFight(s.fights, { opponent: p ? p.name : '?', theirPts: p ? p.pts : null, defense: p ? p.defense : [], mine: d.mine || [], result: d.result, points: d.points, delta: d.delta });
    s.pending = null;
    save(s);
  });
  window.E7ArenaLog = { KEY, load, close };
})();
