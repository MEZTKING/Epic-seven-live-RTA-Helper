/*
 * Browser helper around RTAScreens: fingerprints the current frame, says which
 * taught screen is showing, and lets you teach screens. Shared by every module
 * (RTA, Guild War, Gear). Fingerprints live in localStorage 'e7-screens' on
 * this device, so teaching a screen in one module helps all of them.
 */
(function () {
  'use strict';
  const S = window.RTAScreens;
  const cv = document.createElement('canvas');
  cv.width = S.W;
  cv.height = S.H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const stable = S.stabilizer(2);
  let current = null;
  let lastRaw = { screen: null, sim: 0 };
  const listeners = [];

  /** Built-in screen signatures (js/sources/screen-refs.js): recognised without teaching. Not used for gating. */
  const builtIn = () => (window.RTASources && window.RTASources.screenRefs) || [];
  function refs() {
    try {
      const r = JSON.parse(localStorage.getItem(S.STORAGE_KEY) || '[]');
      return Array.isArray(r) ? r : [];
    } catch (_) {
      return [];
    }
  }
  function saveRefs(list) {
    localStorage.setItem(S.STORAGE_KEY, JSON.stringify(list));
    for (const fn of listeners) fn();
  }
  const dims = (s) => ({ w: s.videoWidth || s.naturalWidth || s.width, h: s.videoHeight || s.naturalHeight || s.height });
  function fpOf(source) {
    const d = dims(source);
    ctx.drawImage(source, ...S.refCrop(d.w, d.h), 0, 0, S.W, S.H); // middle 16:9 part (any window shape)
    return S.fingerprint(ctx.getImageData(0, 0, S.W, S.H).data);
  }
  /** Call once per frame/tick. Returns the stable screen id (or null). */
  function update(source) {
    if (!source) return current;
    lastRaw = S.detect(fpOf(source), [...builtIn(), ...refs()]); // built-in signatures (from real screenshots) + taught ones
    const prev = current;
    current = stable(lastRaw.screen);
    if (prev !== current) for (const fn of listeners) fn();
    return current;
  }
  /** Save the current frame as an example of `screen` (keeps up to 5 per screen). */
  function teach(source, screen) {
    const list = refs();
    list.push({ screen, fp: fpOf(source), at: new Date().toISOString() });
    const mine = list.filter((r) => r.screen === screen);
    while (mine.length > 5) list.splice(list.indexOf(mine.shift()), 1);
    saveRefs(list);
  }
  function forget(screen) {
    saveRefs(refs().filter((r) => r.screen !== screen));
  }
  const allowed = (screen) => S.allowed(screen, current, refs());
  const label = (id) => (S.SCREENS.find((s) => s.id === id) || {}).label || 'unknown screen';

  window.E7Screens = { builtIn, update, teach, forget, refs, allowed, label, current: () => current, raw: () => lastRaw, onChange: (fn) => listeners.push(fn), SCREENS: S.SCREENS };
})();
