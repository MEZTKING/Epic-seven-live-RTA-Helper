/*
 * The GAME WATCHER (vision hub). One per app: captures the game once, keeps track of which screen is
 * showing, runs the registered readers on their own screen, and publishes what they find on E7Bus.
 * Modules never touch pixels; they listen to events (see js/vision/core.js, js/vision/client.js).
 *
 * Host page: vision.html (desktop app: a hidden window that starts with the app and keeps watching
 * whatever page you're on) or live.html in a browser (<body data-vision-host="browser">). Anywhere
 * else this file does nothing, so pages can't start a second watcher by accident.
 *
 *   E7Vision.register({ id, label, screen, every, module, ready(), hasBoxes(), read(ctx), idle(ctx) })
 *   ctx: { source, w, h, crop(rect, {minH, filter}), ocr(canvas, {line}), publish(type, data), note(text) }
 *   ocr(canvas, { line: true }) reads ONE line of text (Tesseract page mode 7: names under icons); { psm, chars }: another
 *   page mode, only these characters (digits of a gear value)
 *   ocrWords(canvas) -> [{ text, conf, x, y }] scattered words with their centres (page mode 11: labels on a picture)
 *
 * Commands it answers (E7Bus.request): start, stop, status, snapshot, teach, save-picture, snap (a quick snap, #109).
 * Events it publishes: vision:status (every 3 s + on change), vision:started / vision:stopped,
 * vision:warning, screen:changed, plus whatever readers publish.
 * Only READS the screen; never sends anything to the game.
 */
(function () {
  'use strict';
  const mode = document.body && document.body.dataset.visionHost;
  const isHost = mode === 'always' || (mode === 'browser' && !window.E7Desktop);
  const bus = window.E7Bus;
  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const readers = [];
  let stream = null;
  let video = null;
  let source = null;
  let timer = null;
  let beat = null;
  let since = null;
  let captureName = '';
  let lastScreen = null;

  const w = () => (source ? source.videoWidth || source.width : 0);
  const h = () => (source ? source.videoHeight || source.height : 0);

  function register(r) {
    if (!isHost) return;
    readers.push({ every: 1500, last: 0, busy: false, note: '', ready: () => true, hasBoxes: () => false, ...r });
    status();
  }

  // ------------------------------------------------------------- shared tools for readers
  function crop(rect, { minH = 48, filter = 'grayscale(1) contrast(1.6)' } = {}) {
    const bw = rect.w * w();
    const bh = rect.h * h();
    const scale = Math.max(1, minH / Math.max(1, bh));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(bw * scale));
    cv.height = Math.max(1, Math.round(bh * scale));
    const cx = cv.getContext('2d');
    if (filter) cx.filter = filter;
    cx.drawImage(source, rect.x * w(), rect.y * h(), bw, bh, 0, 0, cv.width, cv.height);
    return cv;
  }
  // Text readers by language. English is the default; names of players on the Japanese / Korean / Asian servers need
  // that script's data ('jpn', 'kor', 'chi_tra'; loaded from the same CDN the first time, a few MB each; DEVLOG #55).
  // English has a small pool (DEVLOG #91): up to 4 readers working at once (one fewer than the PC's cores), so the
  // inventory's 16 items (about 80 readings) are read side by side instead of one after another.
  const POOL = Math.max(1, Math.min(4, ((typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2) - 1));
  const pools = {}; // lang -> [{ wk: Promise<worker>, chain: Promise, pending: number }]
  async function loadLib() {
    if (window.Tesseract) return;
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = TESSERACT_URL;
      s.onload = res;
      s.onerror = () => rej(new Error('Could not load the text reader.'));
      document.head.appendChild(s);
    });
  }
  /** The least busy reader for a language (a new one while the pool isn't full and all are busy). */
  function slotFor(lang) {
    const list = pools[lang] || (pools[lang] = []);
    const size = lang === 'eng' ? POOL : 1;
    const free = list.slice().sort((a, b) => a.pending - b.pending)[0];
    if (free && (free.pending === 0 || list.length >= size)) return free;
    const slot = { wk: loadLib().then(() => window.Tesseract.createWorker(lang)), chain: Promise.resolve(), pending: 0 };
    slot.wk.catch(() => {
      // failed to start: forget it, the next job tries again
      const i = list.indexOf(slot);
      if (i >= 0) list.splice(i, 1);
    });
    list.push(slot);
    return slot;
  }
  function onSlot(lang, fn) {
    const slot = slotFor(lang);
    slot.pending++;
    const job = slot.chain.then(async () => fn(await slot.wk));
    slot.chain = job.catch(() => {}).finally(() => slot.pending--);
    return job;
  }
  function ocr(canvas, opts = {}) {
    return onSlot(opts.lang || 'eng', async (wk) => {
      // opts.psm: another page mode (e.g. '8' one word); opts.chars: only these characters (reset for every other job)
      await wk.setParameters({ tessedit_pageseg_mode: opts.psm || (opts.line ? '7' : '3'), tessedit_char_whitelist: opts.chars || '' });
      const { data } = await wk.recognize(canvas);
      // opts.lines: keep one line per row of text (a column of numbers)
      const text = opts.lines ? ((data && data.text) || '').split(/\n/).map((l) => l.trim()).filter(Boolean).join('\n') : ((data && data.text) || '').replace(/\n+/g, ' ').trim();
      // opts.full: also how sure the reader is (0–100) and which language data was used
      return opts.full ? { text, conf: Math.round((data && data.confidence) || 0), lang: opts.lang || 'eng' } : text;
    });
  }

  function ocrWords(canvas) {
    return onSlot('eng', async (wk) => {
      await wk.setParameters({ tessedit_pageseg_mode: '11', tessedit_char_whitelist: '' });
      const { data } = await wk.recognize(canvas);
      return ((data && data.words) || []).map((w) => ({ text: w.text, conf: w.confidence, x: (w.bbox.x0 + w.bbox.x1) / 2, y: (w.bbox.y0 + w.bbox.y1) / 2 }));
    });
  }

  // ------------------------------------------------------------- status
  function status() {
    if (!isHost) return null;
    const SW = window.E7Screens;
    const s = {
      watching: !!source,
      name: captureName,
      since,
      screen: SW ? SW.current() : null,
      screenLabel: SW && SW.current() ? SW.label(SW.current()) : '',
      readers: readers.map((r) => ({ id: r.id, label: r.label || r.id, ready: !!r.ready(), note: r.note || '' })),
      desktop: !!window.E7Desktop,
    };
    bus.publish('vision:status', s);
    return s;
  }
  function warnStaleBoxes() {
    const GA = window.GameArea;
    if (!GA || !GA.isStale) return;
    for (const r of readers) {
      if (r.module && r.hasBoxes() && GA.isStale(r.module, source)) bus.publish('vision:warning', { reader: r.id, module: r.module, text: `${r.label || r.id}: the boxes were drawn on a different picture (before the game window / game area changed). Draw them again.` });
    }
  }

  // ------------------------------------------------------------- capture
  let starting = null;
  /** Start watching (one capture; a second call while starting waits for the first). */
  function start() {
    if (source) return Promise.resolve(status());
    if (!starting) starting = doStart().finally(() => (starting = null));
    return starting;
  }
  /** The game window / screen choice changed: watch the new one. */
  async function restart() {
    if (starting) return starting;
    stop();
    return start();
  }
  async function doStart() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) throw new Error('This browser cannot capture the screen. Use Chrome or Edge on PC, or the desktop app.');
    let s;
    try {
      s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 10 }, audio: false });
    } catch (_) {
      throw new Error(window.E7Desktop ? 'No game window to watch (not chosen, or not found). Choose it in the menu: Game window → Pick the game window…' : 'Capture was cancelled.');
    }
    stream = s;
    const v = document.createElement('video');
    v.muted = true;
    v.srcObject = s;
    await v.play();
    s.getVideoTracks()[0].addEventListener('ended', stop);
    const src = window.GameArea ? await window.GameArea.wrap(v) : v;
    if (stream !== s) return status(); // stopped meanwhile
    if (!src) {
      stop();
      throw new Error('No game area chosen.');
    }
    video = v;
    source = src;
    const dc = window.E7Desktop && window.E7Desktop.capture();
    captureName = (dc && dc.name) || s.getVideoTracks()[0].label || 'screen';
    since = new Date().toISOString();
    timer = setInterval(tick, 500);
    bus.publish('vision:started', { name: captureName });
    if (window.E7Diag) window.E7Diag.log('watcher', `started watching "${captureName}"`, { size: [w(), h()], frameKey: window.GameArea ? window.GameArea.frameKey(source) : 'full' });
    warnStaleBoxes();
    return status();
  }
  function stop() {
    const was = !!source;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    if (source && source.stopGameArea) source.stopGameArea();
    stream = video = source = null;
    clearInterval(timer);
    timer = null;
    since = null;
    for (const k of Object.keys(working)) {
      if (working[k].timer) clearTimeout(working[k].timer);
      delete working[k];
    }
    if (window.E7Overlay) ['gear', 'guild', 'busy'].forEach((l) => window.E7Overlay.clear(l));
    if (was) bus.publish('vision:stopped', {});
    return status();
  }

  // ------------------------------------------------------------- "working…" on the game (DEVLOG #56)
  // A reader that needs a while (reading names in several languages) or needs the user says so: ctx.busy(text) shows a
  // small card with a spinner at the top of the game, ctx.done(text) turns it into a result line that leaves after 8 s
  // (ctx.done(text, { ask: true }): the app needs the user, e.g. names to check; stays 15 s). A reader that ends
  // without saying done just takes its card away. Also on the bus: vision:busy { reader, text, done, ask }.
  const working = {}; // reader id -> { text, done, ask, timer }
  function showWorking() {
    if (!window.E7Overlay) return;
    window.E7Overlay.post('busy', Object.values(working).map((w) => ({ kind: 'busy', x: 0.5, y: 0.085, title: w.text, done: !!w.done, ask: !!w.ask })));
  }
  function setWorking(r, text, opts) {
    const was = working[r.id];
    if (was && was.timer) clearTimeout(was.timer);
    if (!text) {
      if (!was) return;
      delete working[r.id];
    } else {
      const o = opts || {};
      working[r.id] = { text: String(text), done: !!o.done, ask: !!o.ask, timer: o.done ? setTimeout(() => setWorking(r, ''), o.ask ? 15000 : 8000) : null };
      if (was && was.text === working[r.id].text && was.done === working[r.id].done) return;
    }
    bus.publish('vision:busy', { reader: r.id, text: text ? String(text) : '', done: !!(opts && opts.done), ask: !!(opts && opts.ask) });
    showWorking();
  }

  // ------------------------------------------------------------- the loop
  const ctxFor = (r) => ({
    // look again soon (0.4 s), not after the reader's whole interval: the picture just changed (a list scrolling),
    // DEVLOG #91
    soon: () => (r.soon = true),
    busy: (text) => setWorking(r, text),
    done: (text, opts) => setWorking(r, text, { done: true, ask: !!(opts && opts.ask) }),
    get source() {
      return source;
    },
    w,
    h,
    crop,
    ocr,
    ocrWords,
    publish: (type, data) => bus.publish(type, data),
    note: (t) => {
      if (r.note !== t) {
        r.note = t;
        status();
      }
    },
  });
  // ------------------------------------------------------------- developer tool: collect screenshots
  // Desktop menu Developer → Collect screenshots automatically. Saves the game picture (PNG) whenever the scene
  // changes and stays changed for 2 passes (not mid-animation), at most every 2 s, and once a minute otherwise.
  // Next to it: what the watcher thought (screen, reader notes), so readers can be checked against the picture.
  const devOn = () => !!(window.E7Desktop && window.E7Desktop.dev && window.E7Desktop.dev().on);
  let dev = { on: false, fp: null, cand: null, candN: 0, at: 0 };
  const fpCanvas = document.createElement('canvas');
  function fingerprint() {
    const S = window.RTAScreens;
    fpCanvas.width = S.W;
    fpCanvas.height = S.H;
    const c = fpCanvas.getContext('2d', { willReadFrequently: true });
    c.drawImage(source, ...S.refCrop(w(), h()), 0, 0, S.W, S.H); // middle 16:9 part (any window shape)
    return S.fingerprint(c.getImageData(0, 0, S.W, S.H).data);
  }
  function devShot(reason) {
    const cv = document.createElement('canvas');
    cv.width = w();
    cv.height = h();
    cv.getContext('2d').drawImage(source, 0, 0);
    const SW = window.E7Screens;
    const meta = { at: new Date().toISOString(), reason, capture: captureName, size: [cv.width, cv.height], screen: SW && SW.current(), screenLabel: SW && SW.current() ? SW.label(SW.current()) : '', readers: readers.map((r) => ({ id: r.id, ready: !!r.ready(), note: r.note || '' })), frameKey: window.GameArea ? window.GameArea.frameKey(source) : 'full' };
    window.E7Desktop.saveDevShot(cv.toDataURL('image/png'), meta);
    dev.at = Date.now();
  }
  function devTick() {
    if (!devOn() || !window.RTAScreens) return;
    const fp = fingerprint();
    const S = window.RTAScreens;
    const now = Date.now();
    if (!dev.fp) {
      dev.fp = fp;
      return devShot('first picture');
    }
    if (S.similarity(fp, dev.fp) < 0.93) {
      // the scene changed: wait until it holds still for a moment
      if (dev.cand && S.similarity(fp, dev.cand) > 0.98) dev.candN++;
      else {
        dev.cand = fp;
        dev.candN = 1;
      }
      if (dev.candN >= 2 && now - dev.at > 2000) {
        dev.fp = fp;
        dev.cand = null;
        devShot('scene changed');
      }
    } else if (now - dev.at > 60000) devShot('once a minute');
  }

  /** One pass: screen detection, then each due reader. `force` ignores reader intervals (tests). */
  async function tick(force) {
    if (!source) return;
    try {
      devTick();
    } catch (_) { /* never let the dev tool break reading */ }
    const SW = window.E7Screens;
    if (SW) {
      SW.update(source);
      if (SW.current() !== lastScreen) {
        lastScreen = SW.current();
        bus.publish('screen:changed', { screen: lastScreen, label: lastScreen ? SW.label(lastScreen) : '' });
        status();
      }
    }
    const now = Date.now();
    const jobs = [];
    // reading speed (DEVLOG #83): fastest ×0.25 (#91), fast ×0.5, normal ×1, slow ×2 of each reader's own interval
    const pace = window.E7VisionSpeed ? window.E7VisionSpeed.factor() : 1;
    for (const r of readers) {
      if (r.busy || (!force && now - r.last < (r.soon ? Math.min(400, r.every * pace) : r.every * pace)) || !r.ready()) continue;
      r.soon = false;
      const ctx = ctxFor(r);
      if (r.screen && SW && !SW.allowed(r.screen)) {
        if (r.idle) r.idle(ctx);
        continue;
      }
      r.busy = true;
      r.last = now;
      jobs.push(
        Promise.resolve()
          .then(() => r.read(ctx))
          .catch((e) => ctx.note('Error: ' + ((e && e.message) || e)))
          .finally(() => {
            r.busy = false;
            if (working[r.id] && !working[r.id].done) setWorking(r, ''); // ended without a result: no card left behind
          }),
      );
    }
    await Promise.all(jobs);
  }

  // ------------------------------------------------------------- commands
  if (isHost) {
    bus.handle('start', () => start());
    bus.handle('stop', () => stop());
    bus.handle('status', () => status());
    bus.handle('snapshot', () => {
      if (!source) throw new Error('The game watcher is not watching. Start it first.');
      const cv = document.createElement('canvas');
      cv.width = w();
      cv.height = h();
      cv.getContext('2d').drawImage(source, 0, 0);
      return { url: cv.toDataURL('image/jpeg', 0.92), w: cv.width, h: cv.height, frameKey: window.GameArea ? window.GameArea.frameKey(source) : 'full' };
    });
    bus.handle('snap', () => ({ ok: snap(), left: snaps.length + (snapping ? 1 : 0) }));
    bus.handle('save-picture', async (d) => {
      if (!source) throw new Error('The game watcher is not watching, so there is no game picture to save.');
      const pic = await window.E7Pictures.capture(source, (d && d.note) || 'saved by hand');
      bus.publish('picture:saved', { id: pic.id, at: pic.at, note: pic.note });
      return { id: pic.id };
    });
    bus.handle('teach', (d) => {
      if (!source) throw new Error('The game watcher is not watching. Start it first.');
      window.E7Screens.teach(source, d.screen);
      return { screen: d.screen, examples: window.E7Screens.refs().filter((x) => x.screen === d.screen).length };
    });
    beat = setInterval(status, 3000);
    setTimeout(status, 0);
  }

  // ------------------------------------------------------------- quick snaps (DEVLOG #109)
  // A hotkey (desktop: Ctrl+Shift+D) keeps the game picture as it is right now; the snaps are read one after another
  // (every reader, as if that picture stood still on the screen), then live reading goes on. So the owner can flick
  // through defenses and battle windows without waiting for each reading.
  const snaps = [];
  let snapping = false;
  const SNAP_CARD = { id: 'snaps', label: 'Quick snaps' };
  const showSnaps = (n) => setWorking(SNAP_CARD, n ? `📸 Reading snaps: ${n} left` : '');
  function snap(pic) {
    // (pic: a given picture instead of the screen now; tests)
    const from = pic || source;
    if (!source || !from) return false;
    const c = document.createElement('canvas');
    c.width = from.videoWidth || from.width;
    c.height = from.videoHeight || from.height;
    if (!c.width || !c.height) return false;
    c.getContext('2d').drawImage(from, 0, 0, c.width, c.height);
    snaps.push(c);
    showSnaps(snaps.length + (snapping ? 1 : 0));
    runSnaps();
    return true;
  }
  async function runSnaps() {
    if (snapping) return;
    snapping = true;
    const live = source;
    let cur = null;
    try {
      while (snaps.length && source) {
        const c = snaps.shift();
        showSnaps(snaps.length + 1);
        source = cur = c;
        // the same picture a few times: the readers' "stood still" checks pass, then each reads it once
        for (let i = 0; i < 6 && source === c; i++) {
          await tick(true);
          await new Promise((r) => setTimeout(r, 120));
        }
      }
    } finally {
      // back to the live picture (unless watching stopped or restarted meanwhile)
      if (source && source === cur) source = live;
      snapping = false;
      showSnaps(0);
      bus.publish('vision:snaps-done', {});
    }
  }
  window.E7Vision = { isHost, register, start, restart, stop, tick, status, snap, snapsLeft: () => snaps.length + (snapping ? 1 : 0), isWatching: () => !!source, _useSource: (s) => ((source = s), (captureName = captureName || 'test'), status()), _readers: readers };
})();
