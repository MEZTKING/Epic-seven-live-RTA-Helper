/*
 * Fits the top-player model (js/topmodel.js) off the page's thread, so the app stays usable while it runs
 * (a few seconds for tens of thousands of games). DEVLOG #45.
 *   in:  { rows: E7Records.parseBattle() rows, opts }
 *   out: { ok: true, stats } | { ok: false, error }
 */
/* global importScripts, E7TopModel */
importScripts('topmodel.js');
self.onmessage = (e) => {
  try {
    const d = e.data || {};
    self.postMessage({ ok: true, stats: E7TopModel.build(d.rows || [], d.opts || {}) });
  } catch (err) {
    self.postMessage({ ok: false, error: String((err && err.message) || err) });
  }
};
