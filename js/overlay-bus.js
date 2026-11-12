/*
 * Overlay channel. Module pages post what should be drawn over the game; the
 * overlay page (overlay.html) draws it. In the desktop app that page is a
 * transparent, click-through window on top of the game. In a browser it can be
 * opened as a preview.
 *
 *   E7Overlay.post(layer, items)   layer: 'rta' | 'guild' | 'gear' | ...
 *   E7Overlay.clear(layer)
 * item: { x, y, w, h } as fractions (0..1) of the captured game frame, plus
 *       kind: 'card' | 'dot' | 'label', level?: 'green'|'proven'|'yellow'|'red'|'grey',
 *       title?, lines?: [text], side?: 'right'|'left'|'below'|'above'
 */
(function () {
  'use strict';
  const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('e7-overlay') : null;
  const last = {};
  function post(layer, items) {
    const msg = { layer, items: items || [], at: Date.now() };
    const key = JSON.stringify(msg.items);
    if (last[layer] === key) return; // unchanged: don't spam
    last[layer] = key;
    if (chan) chan.postMessage(msg);
  }
  const clear = (layer) => post(layer, []);
  // a newly opened overlay asks everyone to repeat their layers
  if (chan) chan.addEventListener('message', (e) => {
    if (e.data && e.data.hello) for (const k of Object.keys(last)) last[k] = null;
  });
  window.E7Overlay = { post, clear, available: !!chan };
})();
