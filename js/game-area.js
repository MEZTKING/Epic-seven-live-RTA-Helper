/*
 * Game area: when the capture is the whole screen (the desktop app always captures
 * the display; in a browser you may pick "Entire screen"), you box the game window
 * once. Every reader then works on just that part, calibration shows the game large,
 * and the overlay still lines up on the real screen (overlay.html maps positions
 * back using the same box).
 *
 * Saved on this device: localStorage 'e7-game-area' =
 *   { x, y, w, h (fractions of the full capture), fw, fh (capture size when set) }  or  { full: true, fw, fh }
 * If the capture size changes (other monitor / resolution), you're asked again.
 * Desktop app in WINDOW mode (only the game window is captured): no box needed, the
 * capture already is the game; "Reset game area" opens the window picker instead.
 *
 *   const src = await GameArea.wrap(video)  // canvas (cropped, refreshed 10x/s) or the video itself
 *   GameArea.choose(video)                  // (re)draw the box
 */
(function () {
  'use strict';
  const KEY = 'e7-game-area';
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch (_) {
      return null;
    }
  };
  const size = (v) => ({ w: v.videoWidth || v.naturalWidth || v.width, h: v.videoHeight || v.naturalHeight || v.height });
  const matches = (a, v) => {
    const s = size(v);
    return a && Math.abs(a.fw - s.w) <= 4 && Math.abs(a.fh - s.h) <= 4;
  };

  let dlg = null;
  function dialog() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.className = 'wide-dialog';
    dlg.innerHTML = `<h3>Where is the game?</h3>
      <p class="hint">Drag a box around the game window (emulator or Steam), just the game picture. Everything the app reads
      will come from inside this box. Keep the game window in the same place afterwards; if you move or resize it, press
      <b>Set game area</b> again.</p>
      <div class="btn-row"><button class="btn" data-ga="full">Use the whole picture</button><span class="spacer"></span><button class="btn" data-ga="cancel">Cancel</button><button class="btn primary" data-ga="save">Save</button></div>
      <canvas class="calib-canvas"></canvas>`;
    document.body.appendChild(dlg);
    return dlg;
  }

  /** Ask the user to box the game. Resolves with the saved area (or null if cancelled). */
  function choose(video) {
    return new Promise((resolve) => {
      const d = dialog();
      const cv = d.querySelector('canvas');
      const s = size(video);
      cv.width = s.w;
      cv.height = s.h;
      const ctx = cv.getContext('2d');
      const frame = document.createElement('canvas');
      frame.width = s.w;
      frame.height = s.h;
      frame.getContext('2d').drawImage(video, 0, 0);
      const old = read();
      let rect = old && !old.full && matches(old, video) ? { x: old.x, y: old.y, w: old.w, h: old.h } : null;
      let drag = null;
      const draw = () => {
        ctx.drawImage(frame, 0, 0);
        const r = drag || rect;
        if (!r) return;
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillRect(0, 0, s.w, r.y * s.h);
        ctx.fillRect(0, (r.y + r.h) * s.h, s.w, s.h);
        ctx.fillRect(0, r.y * s.h, r.x * s.w, r.h * s.h);
        ctx.fillRect((r.x + r.w) * s.w, r.y * s.h, s.w, r.h * s.h);
        ctx.strokeStyle = '#c9a24a';
        ctx.lineWidth = Math.max(3, s.w / 400);
        ctx.strokeRect(r.x * s.w, r.y * s.h, r.w * s.w, r.h * s.h);
      };
      const pt = (e) => {
        const b = cv.getBoundingClientRect();
        return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
      };
      cv.onpointerdown = (e) => {
        const p = pt(e);
        drag = { x: p.x, y: p.y, w: 0, h: 0, sx: p.x, sy: p.y };
        cv.setPointerCapture(e.pointerId);
      };
      cv.onpointermove = (e) => {
        if (!drag) return;
        const p = pt(e);
        drag = { ...drag, x: Math.min(drag.sx, p.x), y: Math.min(drag.sy, p.y), w: Math.abs(p.x - drag.sx), h: Math.abs(p.y - drag.sy) };
        draw();
      };
      cv.onpointerup = () => {
        if (drag && drag.w > 0.05 && drag.h > 0.05) rect = { x: drag.x, y: drag.y, w: drag.w, h: drag.h };
        drag = null;
        draw();
      };
      const done = (val) => {
        d.onclick = null;
        d.close();
        if (window.E7Desktop && window.E7Desktop.showSelf && document.body.dataset.visionHost === 'always') window.E7Desktop.showSelf(false);
        resolve(val);
      };
      d.onclick = (e) => {
        const a = e.target.dataset && e.target.dataset.ga;
        if (a === 'cancel') done(null);
        else if (a === 'full') {
          const v = { full: true, fw: s.w, fh: s.h };
          localStorage.setItem(KEY, JSON.stringify(v));
          done(v);
        } else if (a === 'save') {
          if (!rect) return alert('Drag a box around the game first (or press "Use the whole picture").');
          const v = { ...rect, fw: s.w, fh: s.h };
          localStorage.setItem(KEY, JSON.stringify(v));
          done(v);
        }
      };
      draw();
      if (window.E7Desktop && window.E7Desktop.showSelf) window.E7Desktop.showSelf(true); // the game watcher window is hidden
      d.showModal();
      d.scrollTop = 0;
    });
  }

  /**
   * Give readers a source that contains only the game. Asks for the box the first
   * time (or when the capture size changed). Returns a canvas kept up to date, or
   * the video itself when "whole picture" was chosen.
   */
  const windowMode = () => {
    try {
      return !!(window.E7Desktop && window.E7Desktop.capture().mode === 'window');
    } catch (_) {
      return false;
    }
  };

  /**
   * A captured game WINDOW includes the Windows title bar (and a thin border), e.g. 1348×794 for a 1342×755 game.
   * The game itself is 16:9 and sits at the bottom, full width. Returns that part as fractions of the window,
   * or null when the window is already 16:9 or wider (borderless / full screen, emulators with side toolbars).
   * Same rule in overlay.html. Since DEVLOG #38 only a fallback: windowFrame() finds the title bar from the pixels.
   */
  function window16x9(W, H) {
    if (!W || !H) return null;
    const b = Math.round(W / 450); // border ≈ 3 px at 1348 wide
    const cw = W - 2 * b;
    const ch = Math.round((cw * 9) / 16);
    if (H - ch < 8) return null; // no title bar to remove
    return { x: b / W, y: Math.max(0, H - ch - b) / H, w: cw / W, h: ch / H };
  }
  /** A canvas that keeps showing part of `video` (fractions from area()), refreshed 10×/s. */
  function cropCanvas(video, area, key) {
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const copy = () => {
      const s = size(video);
      const a = area(s);
      if (!a || !s.w) return;
      const w = Math.round(a.w * s.w);
      const h = Math.round(a.h * s.h);
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      if (video.readyState === undefined || video.readyState >= 2) ctx.drawImage(video, a.x * s.w, a.y * s.h, w, h, 0, 0, w, h);
    };
    copy();
    const t = setInterval(copy, 100);
    cv.isGameArea = true;
    cv.areaKey = key;
    cv.stopGameArea = () => clearInterval(t);
    cv.sourceVideo = video;
    return cv;
  }

  /**
   * The game inside a captured window, at ANY window size (DEVLOG #38): the title bar and border are found from the pixels
   * (js/frame.js) on a reduced copy, again when the size changes and every 3 s. Falls back to the old 16:9 rule for
   * windows whose top isn't a plain title bar (some emulators). Fractions of the window.
   */
  function windowFrame(video) {
    let last = null;
    let at = 0;
    let key = '';
    const probe = document.createElement('canvas');
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    return (s) => {
      const k = `${s.w}x${s.h}`;
      if (last && k === key && performance.now() - at < 3000) return last;
      key = k;
      at = performance.now();
      const F = window.E7Frame;
      let f = null;
      if (F && s.w && (video.readyState === undefined || video.readyState >= 2)) {
        const sc = Math.min(1, 1000 / s.w);
        probe.width = Math.round(s.w * sc);
        probe.height = Math.round(s.h * sc);
        try {
          pctx.drawImage(video, 0, 0, probe.width, probe.height);
          f = F.detectFractions(pctx.getImageData(0, 0, probe.width, probe.height).data, probe.width, probe.height);
        } catch (_) { /* not ready */ }
      }
      if (!f || (f.y === 0 && f.x === 0 && f.w === 1 && f.h === 1)) f = window16x9(s.w, s.h) || { x: 0, y: 0, w: 1, h: 1 };
      // the overlay (overlay.html) sits on the whole window: tell it where the game is
      const j = JSON.stringify([f.x, f.y, f.w, f.h].map((v) => +v.toFixed(4)));
      if (!last || j !== JSON.stringify([last.x, last.y, last.w, last.h].map((v) => +v.toFixed(4)))) {
        try {
          localStorage.setItem('e7-window-frame', JSON.stringify({ x: f.x, y: f.y, w: f.w, h: f.h, size: k }));
        } catch (_) { /* storage full: the overlay keeps its own rule */ }
      }
      last = f;
      return f;
    };
  }

  async function wrap(video) {
    if (windowMode()) {
      // the capture is just the game window: cut off its title bar and border (any window size)
      return cropCanvas(video, windowFrame(video), 'window-16x9');
    }
    let a = read();
    if (!a || !matches(a, video)) a = await choose(video);
    if (!a) return null; // cancelled: the reader stops instead of reading the whole screen
    if (a.full) return video;
    return cropCanvas(video, () => a, 'area');
  }

  // Calibration boxes are fractions of what the reader sees. Remember which picture each module's boxes were drawn on
  // (whole screen / a boxed area / just the game window) and warn when that changed, e.g. boxes from before #16/#17.
  const FKEY = 'e7-frame-of';
  const frames = () => {
    try {
      return JSON.parse(localStorage.getItem(FKEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  };
  function frameKey(src) {
    if (windowMode()) return src && src.areaKey === 'window-16x9' ? 'window-16x9' : 'window';
    const a = read();
    if (src && src.isGameArea && a && !a.full) return 'area:' + [a.x, a.y, a.w, a.h].map((v) => v.toFixed(3)).join(',');
    return 'full';
  }
  /** src = the reader's source, or a frame key string (from the watcher's snapshot). */
  function markCalibrated(module, src) {
    const f = frames();
    f[module] = typeof src === 'string' ? src : frameKey(src);
    localStorage.setItem(FKEY, JSON.stringify(f));
  }
  /** True when this module's boxes were drawn on another picture (no alert; the watcher uses this). */
  function isStale(module, src) {
    const was = frames()[module];
    if (was === frameKey(src)) return false;
    return !(was === undefined && frameKey(src) === 'full');
  }
  const warned = {};
  /** Call when a reader starts with existing boxes. Alerts once per page load if they were drawn on another picture. */
  function warnIfStale(module, src, hasBoxes, how) {
    if (!hasBoxes || warned[module]) return false;
    const was = frames()[module];
    if (was === frameKey(src)) return false;
    if (was === undefined) {
      // boxes from before this check existed: assume they're fine if nothing was cropped, else ask once
      if (frameKey(src) === 'full') return false;
    }
    warned[module] = true;
    alert(`Your boxes for this reader were drawn on a different picture (${was === undefined ? 'probably the whole screen' : 'before the game area / game window changed'}). They will be in the wrong place: ${how}.`);
    return true;
  }

  // any button with data-reset-game-area forgets the box; the next capture asks again
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-reset-game-area]')) return;
    localStorage.removeItem(KEY);
    if (window.E7Desktop) {
      // desktop app: pick the game window (or a whole screen) again
      window.E7Desktop.pickWindow().then((c) => c && alert(`Now reading ${c.mode === 'window' ? 'the window' : 'the screen'} "${c.name}". Stop and start reading again to use it.`));
      return;
    }
    alert('Game area cleared. Stop and start reading again, then drag a box around the game.');
  });

  window.GameArea = { wrap, choose, get: read, clear: () => localStorage.removeItem(KEY), windowMode, frameKey, markCalibrated, warnIfStale, isStale, window16x9 };
})();
