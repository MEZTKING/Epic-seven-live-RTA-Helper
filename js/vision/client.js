/*
 * Talk to the game watcher from any page (js/vision/hub.js does the watching). window.VisionClient
 *   VisionClient.status()        last status (or null), .alive() true if the watcher answered recently
 *   VisionClient.onStatus(fn)    called on every status
 *   VisionClient.start() / stop()
 *   VisionClient.ensure()        desktop: start the watcher; browser: open the Live page where it runs
 *   VisionClient.teach(screen)   "this is the X screen"
 *   VisionClient.snapshot()      -> { img, w, h, frameKey } current game picture, for drawing boxes
 *   VisionClient.line()          one-line human status
 */
(function () {
  'use strict';
  const bus = window.E7Bus;
  let last = null;
  let seen = 0;
  const fns = [];
  bus.on('vision:status', (s) => {
    last = s;
    seen = Date.now();
    for (const f of fns.slice()) f(s);
  });
  const alive = () => !!last && Date.now() - seen < 8000;
  const desktop = !!window.E7Desktop;

  async function start() {
    return bus.request('start', null, 120000); // may wait for the window picker
  }
  async function stop() {
    return bus.request('stop', null, 5000);
  }
  /** Make sure something is watching the game. */
  async function ensure() {
    if (alive() && last.watching) return last;
    if (desktop || (window.E7Vision && window.E7Vision.isHost)) return start();
    window.open('live.html#watch', 'e7-live');
    throw new Error('In a browser the game watcher runs on the Live page: press "Start watching" there (keep that tab open).');
  }
  async function teach(screen) {
    return bus.request('teach', { screen }, 5000);
  }
  async function snapshot() {
    const s = await bus.request('snapshot', null, 8000);
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('Could not load the game picture.'));
      img.src = s.url;
    });
    return { img, w: s.w, h: s.h, frameKey: s.frameKey };
  }
  function line() {
    if (!alive()) return desktop ? 'Game watcher: starting…' : 'Game watcher: not running (it runs on the Live page in a browser).';
    if (!last.watching) return 'Game watcher: not watching.';
    return `Game watcher: watching "${last.name}"${last.screenLabel ? ` · now: ${last.screenLabel}` : ' · screen: other / not taught'}`;
  }
  // ask for a status right away (the watcher also sends one every 3 s)
  setTimeout(() => bus.publish('cmd:status', null), 0);

  window.VisionClient = { status: () => last, alive, onStatus: (fn) => fns.push(fn), start, stop, ensure, teach, snapshot, line, desktop };
})();
