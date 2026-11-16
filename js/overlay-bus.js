/*
 * Overlay channel. Module pages post what should be drawn over the game; the
 * overlay page (overlay.html) draws it. In the desktop app that page is a
 * transparent, click-through window on top of the game. In a browser it can be
 * opened as a preview.
 *
 *   E7Overlay.post(layer, items)   layer: 'rta' | 'guild' | 'gear' | ...
 *   E7Overlay.clear(layer)
 * A layer lives only as long as the page that posted it (DEVLOG #54): what is shown is repeated every 5 s, the overlay
 * drops a layer it has not heard from for 15 s, and a page that is left clears its layers at once. (Before, a card
 * stayed on the game forever after its page was closed or changed.)
 * item: { x, y, w, h } as fractions (0..1) of the captured game frame, plus
 *       kind: 'card' | 'dot' | 'label', level?: 'green'|'proven'|'yellow'|'red'|'grey',
 *       title?, lines?: [text], side?: 'right'|'left'|'below'|'above'
 */
(function () {
  'use strict';
  const chan = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('e7-overlay') : null;
  const last = {};
  const shown = {}; // layer -> items now on the game (non-empty only)
  function post(layer, items) {
    const msg = { layer, items: items || [], at: Date.now() };
    const key = JSON.stringify(msg.items);
    if (msg.items.length) shown[layer] = msg.items;
    else delete shown[layer];
    if (last[layer] === key) return; // unchanged: don't spam
    last[layer] = key;
    if (chan) chan.postMessage(msg);
  }
  if (chan) {
    setInterval(() => {
      for (const [layer, items] of Object.entries(shown)) chan.postMessage({ layer, items, at: Date.now(), keep: true });
    }, 5000);
    window.addEventListener('pagehide', () => {
      for (const layer of Object.keys(shown)) chan.postMessage({ layer, items: [], at: Date.now() });
    });
  }
  const clear = (layer) => post(layer, []);
  // a newly opened overlay asks everyone to repeat their layers
  if (chan) chan.addEventListener('message', (e) => {
    if (e.data && e.data.hello) for (const k of Object.keys(last)) last[k] = null;
  });
  window.E7Overlay = { post, clear, available: !!chan };
})();
