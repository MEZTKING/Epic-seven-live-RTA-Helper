/*
 * Per-match record of what the app saw (DEVLOG #33): a timeline for each RTA match (draft id) with the screens it
 * recognised, what each slot looked like (best guess + score), and links to the pictures saved during that match.
 * localStorage 'e7-match-trace' = { [draftId]: { startedAt, events: [{ t, text }], slots: { slotId: snapshot } } },
 * newest MAX matches. Browser: window.E7Trace. Pure enough to test with a fake storage.
 */
(function (root) {
  'use strict';
  const KEY = 'e7-match-trace';
  const MAX = 15;
  const MAX_EVENTS = 200;
  function create(storage) {
    const read = () => {
      try {
        return JSON.parse(storage.getItem(KEY) || '{}') || {};
      } catch (_) {
        return {};
      }
    };
    const write = (all) => {
      const ids = Object.keys(all).sort((a, b) => String(all[b].startedAt).localeCompare(String(all[a].startedAt)));
      for (const id of ids.slice(MAX)) delete all[id];
      try {
        storage.setItem(KEY, JSON.stringify(all));
      } catch (_) { /* full: the trace is only a help */ }
    };
    const entry = (all, id) => all[id] || (all[id] = { startedAt: new Date().toISOString(), events: [], slots: {} });
    return {
      KEY,
      /** Add a line to this match's timeline (repeats of the same text are collapsed). */
      event(draftId, text) {
        if (!draftId) return;
        const all = read();
        const e = entry(all, draftId);
        const last = e.events[e.events.length - 1];
        if (last && last.text === text) last.n = (last.n || 1) + 1;
        else e.events.push({ t: new Date().toISOString(), text: String(text).slice(0, 240) });
        while (e.events.length > MAX_EVENTS) e.events.shift();
        write(all);
      },
      /** Latest view of each slot: { slotId: { guess, score, source, sure, confirmed } }. */
      slots(draftId, snapshot) {
        if (!draftId) return;
        const all = read();
        entry(all, draftId).slots = snapshot;
        write(all);
      },
      get: (draftId) => read()[draftId] || null,
      /** Matches newest first: [{ id, startedAt, events, slots }]. */
      list() {
        const all = read();
        return Object.keys(all)
          .map((id) => ({ id, ...all[id] }))
          .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
      },
      clear: () => storage.removeItem(KEY),
    };
  }
  const api = { create, KEY, MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    let st = null;
    try {
      st = root.localStorage;
    } catch (_) { /* blocked */ }
    root.E7Trace = st ? create(st) : null;
    if (root.E7Trace) root.E7Trace.create = create;
  }
})(typeof window !== 'undefined' ? window : globalThis);
