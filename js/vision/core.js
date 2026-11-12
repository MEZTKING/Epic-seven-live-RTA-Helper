/*
 * Vision core (pure, no DOM): the event bus that connects the game watcher to the modules,
 * and small helpers the readers share. Browser: window.E7VisionCore. Node: require().
 *
 * Architecture (DEVLOG #21, docs/DESIGN_REVIEW.md):
 *   one GAME WATCHER (js/vision/hub.js, hosted by vision.html in the desktop app, or the Live page in a browser)
 *   captures the game once, works out which screen is showing and runs READERS (js/vision/readers/*).
 *   Readers turn pixels into FACTS and publish them as events ("gear:item", "guild:name-read", "screen:changed").
 *   Modules (pages, or consumers next to the watcher) only listen to events; they never touch pixels.
 *
 * Event: { id, type, at, from, data, req? }
 *   - Delivered to every window of the app (BroadcastChannel 'e7-vision') and to listeners in the same window.
 *   - Facts are also appended to a short log (localStorage 'e7-vision-log', last LOG_MAX) so a page that opens
 *     later can show what happened. Status/commands/replies are not logged.
 *   - request(cmd) sends 'cmd:<cmd>' and resolves with the watcher's 'reply'.
 */
(function (root) {
  'use strict';
  const CHANNEL = 'e7-vision';
  const LOG_KEY = 'e7-vision-log';
  const LOG_MAX = 200;
  const VOLATILE = /^(vision:status|cmd:|reply$)/;

  function createBus({ channel = null, storage = null, now = () => Date.now(), from = Math.random().toString(36).slice(2, 9) } = {}) {
    const listeners = [];
    let seq = 0;
    const pending = new Map();

    function readLog() {
      if (!storage) return [];
      try {
        const l = JSON.parse(storage.getItem(LOG_KEY) || '[]');
        return Array.isArray(l) ? l : [];
      } catch (_) {
        return [];
      }
    }
    function append(evt) {
      if (!storage || VOLATILE.test(evt.type)) return;
      const l = readLog();
      l.push(evt);
      while (l.length > LOG_MAX) l.shift();
      try {
        storage.setItem(LOG_KEY, JSON.stringify(l));
      } catch (_) { /* storage full: the log is only a convenience */ }
    }
    function deliver(evt) {
      if (evt.type === 'reply' && evt.data && pending.has(evt.data.req)) {
        const p = pending.get(evt.data.req);
        pending.delete(evt.data.req);
        clearTimeout(p.t);
        if (evt.data.error) p.reject(new Error(evt.data.error));
        else p.resolve(evt.data.result);
      }
      for (const l of listeners.slice()) {
        if (l.match(evt.type)) {
          try {
            l.fn(evt.data, evt);
          } catch (e) {
            if (typeof console !== 'undefined') console.error('vision listener failed', e);
          }
        }
      }
    }
    if (channel) channel.onmessage = (e) => e.data && e.data.type && deliver(e.data);

    /** Publish an event to all windows (and this one). Returns the event. */
    function publish(type, data, extra) {
      const evt = { id: `${from}-${++seq}`, type, at: now(), from, data: data === undefined ? null : data, ...(extra || {}) };
      append(evt);
      if (channel) channel.postMessage(evt);
      deliver(evt);
      return evt;
    }
    /** Listen to one type, a list, a prefix ('gear:*') or everything ('*'). Returns an unsubscribe function. */
    function on(types, fn) {
      const list = [].concat(types);
      const match = (t) => list.some((x) => x === '*' || x === t || (x.endsWith('*') && t.startsWith(x.slice(0, -1))));
      const l = { match, fn };
      listeners.push(l);
      return () => listeners.splice(listeners.indexOf(l), 1);
    }
    /** Ask the watcher to do something; resolves with its reply (rejects on error or timeout). */
    function request(cmd, data, timeout = 5000) {
      const req = `${from}-r${++seq}`;
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          pending.delete(req);
          reject(new Error('timeout'));
        }, timeout);
        pending.set(req, { resolve, reject, t });
        publish('cmd:' + cmd, data, { req });
      });
    }
    /** Answer a command (watcher side). */
    function handle(cmd, fn) {
      return on('cmd:' + cmd, async (data, evt) => {
        if (!evt.req) {
          try {
            await fn(data, evt);
          } catch (_) { /* fire-and-forget command */ }
          return;
        }
        try {
          publish('reply', { req: evt.req, result: await fn(data, evt) });
        } catch (e) {
          publish('reply', { req: evt.req, error: String((e && e.message) || e) });
        }
      });
    }
    return { publish, on, request, handle, log: readLog, clearLog: () => storage && storage.removeItem(LOG_KEY), from };
  }

  /** Only let a value through after it was seen `n` times in a row (avoids reading half-drawn screens). */
  function repeatGate(n = 2) {
    let last;
    let count = 0;
    return {
      /** Returns true exactly once: on the n-th identical value in a row. */
      push(v) {
        if (v !== null && v !== undefined && v === last) count++;
        else {
          last = v;
          count = v === null || v === undefined ? 0 : 1;
        }
        return count === n;
      },
      reset() {
        last = undefined;
        count = 0;
      },
      get count() {
        return count;
      },
    };
  }

  const api = { createBus, repeatGate, CHANNEL, LOG_KEY, LOG_MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7VisionCore = api;
})(typeof self !== 'undefined' ? self : this);
