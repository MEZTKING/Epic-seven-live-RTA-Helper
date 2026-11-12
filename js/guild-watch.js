/*
 * "Watch game" for Guild War: reads the enemy player's name from the emulator
 * window and shows that player in the pop-out. Only reads the screen; it
 * never touches the game. You box where the name appears once (saved on this device).
 */
(function () {
  'use strict';
  const A = window.GuildApp;
  const GW = window.RTAGuildWar;
  const $ = (s) => document.querySelector(s);
  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  let stream = null;
  let video = null;
  let timer = null;
  let worker = null;
  let busy = false;
  let last = { name: null, n: 0 };

  const box = () => A.conn.watchBox || null;

  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return alert('This browser cannot capture the screen. Use Chrome or Edge on PC.');
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
    } catch (_) {
      return;
    }
    video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    stream.getVideoTracks()[0].addEventListener('ended', stop);
    if (!box()) calibrate();
    timer = setInterval(tick, 2000);
    update();
  }
  function stop() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    clearInterval(timer);
    timer = null;
    update();
  }
  function update() {
    $('#gw-watch').textContent = timer ? 'Stop watching' : 'Watch game';
    $('#gw-watch-box').classList.toggle('hidden', !timer);
    $('#gw-teach').classList.toggle('hidden', !timer);
    renderScreen();
    postOverlay();
    if (window.GuildPip) window.GuildPip.render();
  }

  // --- one box: where the enemy's name is shown in game
  function calibrate() {
    if (!video || !video.videoWidth) return alert('Start "Watch game" first, with an enemy profile or defense showing.');
    const cv = $('#gw-calib-canvas');
    cv.width = video.videoWidth;
    cv.height = video.videoHeight;
    const ctx = cv.getContext('2d');
    const frame = document.createElement('canvas');
    frame.width = cv.width;
    frame.height = cv.height;
    frame.getContext('2d').drawImage(video, 0, 0);
    let drag = null;
    let rect = box();
    const draw = () => {
      ctx.drawImage(frame, 0, 0);
      const r = drag || rect;
      if (r) {
        ctx.strokeStyle = '#c9a24a';
        ctx.lineWidth = Math.max(2, cv.width / 500);
        ctx.strokeRect(r.x * cv.width, r.y * cv.height, r.w * cv.width, r.h * cv.height);
      }
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
      if (drag && drag.w > 0.004 && drag.h > 0.004) rect = { x: drag.x, y: drag.y, w: drag.w, h: drag.h };
      drag = null;
      draw();
    };
    $('#gw-calib-save').onclick = () => {
      if (!rect) return alert('Drag a box over the enemy player name first.');
      A.conn.watchBox = rect;
      A.saveConn();
      $('#gw-calib').close();
      tick();
    };
    $('#gw-calib-cancel').onclick = () => $('#gw-calib').close();
    draw();
    $('#gw-calib').showModal();
  }

  const vw = () => video.videoWidth || video.width;
  const vh = () => video.videoHeight || video.height;
  async function tick() {
    const r = box();
    if (!video || !r || busy) return;
    // only read names on the enemy screen (if that screen was taught)
    const SW = window.E7Screens;
    if (SW) {
      SW.update(video);
      renderScreen();
      if (!SW.allowed('gw-enemy')) {
        if (window.E7Overlay) window.E7Overlay.clear('guild');
        return;
      }
    }
    busy = true;
    try {
      if (!worker) {
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
      }
      const w = r.w * vw();
      const h = r.h * vh();
      const scale = Math.max(1, 64 / h);
      const cv = document.createElement('canvas');
      cv.width = Math.round(w * scale);
      cv.height = Math.round(h * scale);
      const cx = cv.getContext('2d');
      cx.filter = 'grayscale(1) contrast(1.6)';
      cx.drawImage(video, r.x * vw(), r.y * vh(), w, h, 0, 0, cv.width, cv.height);
      const { data } = await worker.recognize(cv);
      const known = [...new Set(A.state.targets.map((t) => t.player).filter(Boolean))];
      const name = GW.matchPlayer(data && data.text, known);
      // same name twice in a row before switching (avoids flicker while screens change)
      if (name && name === last.name) last.n++;
      else last = { name, n: 1 };
      if (name && last.n >= 2) A.setCurrent(name);
      $('#gw-watch-read').textContent = name ? `Seeing: ${name}` : data && data.text.trim() ? `Read "${data.text.trim().slice(0, 24)}" (not a known player)` : 'No name visible';
    } catch (e) {
      $('#gw-watch-read').textContent = 'Text reader unavailable: ' + e.message;
    }
    busy = false;
  }

  // ----------------------------------------------------- overlay layer 'guild'
  /** Card next to the enemy's name in game: their dot, each team's verdict and your counter. */
  function postOverlay() {
    const O = window.E7Overlay;
    const r = box();
    if (!O || !r) return;
    const t = A.current() ? A.targetFor(A.current()) : null;
    if (!t || !timer) return O.clear('guild');
    const v = A.verdict(t);
    const lines = (t.teams || []).slice(0, A.rules().teamsPerDefense).map((tm, i) => {
      const tv = v.teams[i] || {};
      const st = v.status.teams[i] || {};
      if (st.cleared) return `Team ${i + 1}: cleared`;
      const c = tv.counter && tv.level !== 'red' ? ` — ${tv.counter.attack.map(A.nameOf).join(' + ')}` : '';
      return `Team ${i + 1}: ${tv.label || '?'}${c}`;
    });
    O.post('guild', [{ ...r, kind: 'card', side: 'right', level: v.level, title: t.player, lines }]);
  }
  A.onChange(postOverlay);

  function renderScreen() {
    const SW = window.E7Screens;
    const el = $('#gw-screen');
    if (!SW || !el) return;
    const n = SW.refs().filter((x) => x.screen === 'gw-enemy').length;
    el.textContent = n ? `Enemy screen taught (${n}) · now: ${SW.current() ? SW.label(SW.current()) : 'other screen'}` : 'Tip: teach the enemy screen so names are only read there.';
  }
  $('#gw-teach').addEventListener('click', () => {
    if (!video) return alert('Start "Watch game" first, with an enemy defense or profile showing.');
    window.E7Screens.teach(video, 'gw-enemy');
    renderScreen();
  });

  $('#gw-watch').addEventListener('click', () => (timer ? stop() : start()));
  $('#gw-watch-box').addEventListener('click', calibrate);
  window.GuildWatch = { start, stop, calibrate, tick, isWatching: () => !!timer, _useVideo: (v) => (video = v) };
})();
