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
 *   ctx: { source, w, h, crop(rect, {minH, filter}), ocr(canvas), publish(type, data), note(text) }
 *
 * Commands it answers (E7Bus.request): start, stop, status, snapshot, teach, save-picture.
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
  let worker = null;
  let ocrChain = Promise.resolve();
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
  async function loadOcr() {
    if (worker) return worker;
    if (!window.Tesseract) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = TESSERACT_URL;
        s.onload = res;
        s.onerror = () => rej(new Error('Could not load the text reader.'));
        document.head.appendChild(s);
      });
    }
    worker = await window.Tesseract.createWorker('eng');
    return worker;
  }
  /** One text reader for every reader, one job at a time. */
  function ocr(canvas) {
    const job = ocrChain.then(async () => {
      const wk = await loadOcr();
      const { data } = await wk.recognize(canvas);
      return ((data && data.text) || '').replace(/\n+/g, ' ').trim();
    });
    ocrChain = job.catch(() => {});
    return job;
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
      throw new Error('Capture was cancelled.');
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
    if (window.E7Overlay) ['gear', 'guild'].forEach((l) => window.E7Overlay.clear(l));
    if (was) bus.publish('vision:stopped', {});
    return status();
  }

  // ------------------------------------------------------------- the loop
  const ctxFor = (r) => ({
    get source() {
      return source;
    },
    w,
    h,
    crop,
    ocr,
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
    c.drawImage(source, 0, 0, S.W, S.H);
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
    for (const r of readers) {
      if (r.busy || (!force && now - r.last < r.every) || !r.ready()) continue;
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
          .finally(() => (r.busy = false)),
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

  window.E7Vision = { isHost, register, start, restart, stop, tick, status, isWatching: () => !!source, _useSource: (s) => ((source = s), (captureName = captureName || 'test'), status()), _readers: readers };
})();
