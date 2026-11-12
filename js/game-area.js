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

  async function wrap(video) {
    if (windowMode()) return video; // the capture is just the game window
    let a = read();
    if (!a || !matches(a, video)) a = await choose(video);
    if (!a) return null; // cancelled: the reader stops instead of reading the whole screen
    if (a.full) return video;
    const s = size(video);
    const cv = document.createElement('canvas');
    cv.width = Math.round(a.w * s.w);
    cv.height = Math.round(a.h * s.h);
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const copy = () => {
      if (video.readyState === undefined || video.readyState >= 2) ctx.drawImage(video, a.x * s.w, a.y * s.h, cv.width, cv.height, 0, 0, cv.width, cv.height);
    };
    copy();
    const t = setInterval(copy, 100);
    cv.isGameArea = true;
    cv.stopGameArea = () => clearInterval(t);
    cv.sourceVideo = video;
    return cv;
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
    if (windowMode()) return 'window';
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

  window.GameArea = { wrap, choose, get: read, clear: () => localStorage.removeItem(KEY), windowMode, frameKey, markCalibrated, warnIfStale, isStale };
})();
