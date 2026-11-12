/*
 * Screen detector: which game screen is showing right now?
 * Pure (no DOM). Browser: window.RTAScreens. Node: require().
 *
 * You "teach" each screen once (or a few times) by pressing a button while it's
 * showing; the whole frame is shrunk to 32x18 and kept as a fingerprint (saved
 * on this device, localStorage 'e7-screens'). Later frames are compared to the
 * fingerprints. Readers only run on their own screen, so e.g. the CR-bar reader
 * never misreads the draft screen.
 */
(function (root) {
  const W = 32;
  const H = 18;
  const SCREENS = [
    { id: 'rta-draft', label: 'RTA draft (picks and bans)', module: 'rta' },
    { id: 'rta-battle', label: 'RTA battle start (CR bar visible)', module: 'rta' },
    { id: 'rta-cr-expanded', label: 'RTA expanded CR bar', module: 'rta' },
    { id: 'rta-result', label: 'RTA Victory / Defeat', module: 'rta' },
    { id: 'gw-enemy', label: "Guild War enemy's defense / profile", module: 'guild' },
    { id: 'gear-item', label: 'Item details (inventory)', module: 'gear' },
  ];
  const STORAGE_KEY = 'e7-screens';

  /** RGBA pixels of a W x H frame -> unit-length, zero-mean vector (brightness-independent). */
  function fingerprint(rgba) {
    const n = W * H;
    if (!rgba || rgba.length < n * 4) throw new Error('Expected 32x18 RGBA pixels.');
    const v = new Float32Array(n * 3);
    let sum = 0;
    for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) sum += v[p * 3 + c] = rgba[p * 4 + c];
    const mean = sum / v.length;
    let sq = 0;
    for (let i = 0; i < v.length; i++) {
      v[i] -= mean;
      sq += v[i] * v[i];
    }
    const norm = Math.sqrt(sq) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= norm;
    return Array.from(v, (x) => Math.round(x * 10000) / 10000); // plain array: easy to store as JSON
  }

  function similarity(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  /**
   * refs: [{ screen, fp }] (several per screen allowed).
   * Returns { screen: id|null, sim, second } — null when nothing is close enough
   * (an untaught screen, a menu, a loading screen...).
   */
  function detect(fp, refs, { threshold = 0.82, margin = 0.04 } = {}) {
    const best = new Map();
    for (const r of refs || []) {
      const s = similarity(fp, r.fp);
      if (!best.has(r.screen) || s > best.get(r.screen)) best.set(r.screen, s);
    }
    const ranked = [...best.entries()].sort((a, b) => b[1] - a[1]);
    const [top, next] = ranked;
    if (!top || top[1] < threshold || (next && top[1] - next[1] < margin)) return { screen: null, sim: top ? top[1] : 0, second: next ? next[0] : null };
    return { screen: top[0], sim: top[1], second: next ? next[0] : null };
  }

  /** Same answer twice in a row before it counts (avoids flicker during transitions). */
  function stabilizer(frames = 2) {
    let last = null;
    let n = 0;
    let current = null;
    return (screen) => {
      if (screen === last) n++;
      else {
        last = screen;
        n = 1;
      }
      if (n >= frames) current = screen;
      return current;
    };
  }

  /** Is a reader for `screen` allowed to run? If that screen was never taught, yes (no gating). */
  function allowed(screen, current, refs) {
    const taught = (refs || []).some((r) => r.screen === screen);
    return !taught || current === screen;
  }

  const api = { W, H, SCREENS, STORAGE_KEY, fingerprint, similarity, detect, stabilizer, allowed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RTAScreens = api;
})(typeof window !== 'undefined' ? window : globalThis);
