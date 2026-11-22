/*
 * How often the game watcher reads (DEVLOG #83): 'fastest' (4× as often, #91), 'fast' (twice as often: quicker, uses more of the PC), 'normal',
 * 'slow' (half as often: lighter). localStorage['e7-vision-speed']; the watcher (js/vision/hub.js) reads it on every
 * pass, so a change works at once, also in the desktop app's hidden watcher window. Every <select data-vision-speed>
 * on a page is kept in step. Browser: window.E7VisionSpeed { KEY, get(), set(v), factor() }.
 */
(function () {
  'use strict';
  const KEY = 'e7-vision-speed';
  const FACTOR = { fastest: 0.25, fast: 0.5, normal: 1, slow: 2 };
  const get = () => {
    try {
      const v = localStorage.getItem(KEY);
      return FACTOR[v] ? v : 'normal';
    } catch (_) {
      return 'normal';
    }
  };
  const set = (v) => {
    try {
      localStorage.setItem(KEY, FACTOR[v] ? v : 'normal');
    } catch (_) { /* fine */ }
    sync();
  };
  const factor = () => FACTOR[get()];
  function sync() {
    for (const el of document.querySelectorAll('select[data-vision-speed]')) el.value = get();
  }
  function bind() {
    for (const el of document.querySelectorAll('select[data-vision-speed]')) {
      if (el.dataset.bound) continue;
      el.dataset.bound = '1';
      el.innerHTML = '<option value="fastest">Fastest (4× as often: for reading the whole inventory)</option><option value="fast">Fast (reads twice as often)</option><option value="normal">Normal</option><option value="slow">Slow (lighter on the PC)</option>';
      el.addEventListener('change', () => set(el.value));
    }
    sync();
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
    addEventListener('storage', (e) => e.key === KEY && sync());
  }
  window.E7VisionSpeed = { KEY, get, set, factor };
})();
