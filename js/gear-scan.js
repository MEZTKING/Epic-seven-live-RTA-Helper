/*
 * Read gear straight from the game screen: no Fribbels, no Python, nothing
 * sent anywhere. Box the item-details panel once (main stat, substats, and
 * optionally set / slot / enhance / level); then browse your inventory. Each
 * item shown is read with OCR, checked, and added once (source 'screen').
 * Only reads the screen; never touches the game.
 */
(function () {
  'use strict';
  const A = window.GearApp;
  const P = window.RTAStatParse;
  const $ = (s) => document.querySelector(s);
  const esc = A.esc;
  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const KEY = 'e7-gearscan-boxes';
  const STEPS = [
    { key: 'main', label: 'the MAIN stat line (e.g. "Speed 45")' },
    { key: 'sub0', label: 'substat line 1' },
    { key: 'sub1', label: 'substat line 2' },
    { key: 'sub2', label: 'substat line 3', optional: true },
    { key: 'sub3', label: 'substat line 4', optional: true },
    { key: 'set', label: 'the SET name (e.g. "Speed Set")', optional: true },
    { key: 'gear', label: 'the item name / slot (e.g. "Epic Boots")', optional: true },
    { key: 'enhance', label: 'the enhance level (e.g. "+15")', optional: true },
    { key: 'level', label: 'the item level (e.g. "85")', optional: true },
  ];
  let stream = null;
  let source = null;
  let timer = null;
  let worker = null;
  let busy = false;
  let last = { key: null, n: 0 };
  const log = [];

  const boxes = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || 'null') || {};
    } catch (_) {
      return {};
    }
  };
  const calibrated = () => ['main', 'sub0', 'sub1'].every((k) => boxes()[k]);
  const w = () => source.videoWidth || source.naturalWidth || source.width;
  const h = () => source.videoHeight || source.naturalHeight || source.height;

  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) return alert('This browser cannot capture the screen. Use Chrome or Edge on PC (or the desktop app).');
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
    } catch (_) {
      return;
    }
    const v = document.createElement('video');
    v.muted = true;
    v.srcObject = stream;
    await v.play();
    const s0 = stream;
    s0.getVideoTracks()[0].addEventListener('ended', stop);
    const src = window.GameArea ? await window.GameArea.wrap(v) : v; // only the game window
    if (stream !== s0 || !src) {
      if (stream === s0) stop();
      return;
    }
    source = src;
    if (window.GameArea) window.GameArea.warnIfStale('gear', source, calibrated(), 'press "Set boxes" and draw them again');
    if (!calibrated()) calibrate();
    timer = setInterval(tick, 1500);
    update();
  }
  function stop() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (source && source.stopGameArea) source.stopGameArea();
    clearInterval(timer);
    timer = null;
    if (window.E7Overlay) window.E7Overlay.clear('gear');
    update();
  }

  // ---------------------------------------------------------------- calibration
  function calibrate() {
    if (!source || !w()) return alert('Start reading first, with an item\'s details showing in the game.');
    const cv = $('#gs-calib-canvas');
    cv.width = w();
    cv.height = h();
    const ctx = cv.getContext('2d');
    const frame = document.createElement('canvas');
    frame.width = cv.width;
    frame.height = cv.height;
    frame.getContext('2d').drawImage(source, 0, 0);
    const regions = { ...boxes() };
    let step = 0;
    let drag = null;
    const draw = () => {
      ctx.drawImage(frame, 0, 0);
      ctx.lineWidth = Math.max(2, cv.width / 600);
      ctx.font = `${Math.round(cv.width / 90)}px sans-serif`;
      for (const s of STEPS) {
        const r = regions[s.key];
        if (!r) continue;
        ctx.strokeStyle = ctx.fillStyle = s.key === 'main' ? '#3ecf8e' : s.key.startsWith('sub') ? '#58b8ff' : '#c9a24a';
        ctx.strokeRect(r.x * cv.width, r.y * cv.height, r.w * cv.width, r.h * cv.height);
        ctx.fillText(s.key, r.x * cv.width, r.y * cv.height - 3);
      }
      if (drag) {
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(drag.x * cv.width, drag.y * cv.height, drag.w * cv.width, drag.h * cv.height);
      }
      const st = STEPS[step];
      $('#gs-calib-step').textContent = st ? `Step ${step + 1}/${STEPS.length}: drag a box over ${st.label}` : 'All set. Press Save.';
      $('#gs-calib-skip').classList.toggle('hidden', !(st && st.optional));
    };
    const pt = (e) => {
      const b = cv.getBoundingClientRect();
      return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
    };
    cv.onpointerdown = (e) => {
      if (step >= STEPS.length) return;
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
      if (drag && drag.w > 0.003 && drag.h > 0.003) {
        regions[STEPS[step].key] = { x: drag.x, y: drag.y, w: drag.w, h: drag.h };
        step++;
      }
      drag = null;
      draw();
    };
    $('#gs-calib-skip').onclick = () => {
      delete regions[STEPS[step].key];
      step++;
      draw();
    };
    $('#gs-calib-back').onclick = () => {
      step = Math.max(0, step - 1);
      draw();
    };
    $('#gs-calib-save').onclick = () => {
      if (!['main', 'sub0', 'sub1'].every((k) => regions[k])) return alert('The main stat and at least 2 substat boxes are needed.');
      localStorage.setItem(KEY, JSON.stringify(regions));
      if (window.GameArea) window.GameArea.markCalibrated('gear', source);
      $('#gs-calib').close();
      update();
      tick();
    };
    $('#gs-calib-cancel').onclick = () => $('#gs-calib').close();
    draw();
    $('#gs-calib').showModal();
  }

  // ----------------------------------------------------------------- reading
  async function readBox(r) {
    if (!r) return '';
    const bw = r.w * w();
    const bh = r.h * h();
    const scale = Math.max(1, 48 / bh);
    const cv = document.createElement('canvas');
    cv.width = Math.round(bw * scale);
    cv.height = Math.round(bh * scale);
    const cx = cv.getContext('2d');
    cx.filter = 'grayscale(1) contrast(1.6)';
    cx.drawImage(source, r.x * w(), r.y * h(), bw, bh, 0, 0, cv.width, cv.height);
    const { data } = await worker.recognize(cv);
    return ((data && data.text) || '').replace(/\n+/g, ' ').trim();
  }

  async function tick() {
    if (!source || busy || !calibrated()) return;
    const SW = window.E7Screens;
    if (SW) {
      SW.update(source);
      if (!SW.allowed('gear-item')) {
        status('Waiting for an item\'s details screen…');
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
      const b = boxes();
      const raw = { main: await readBox(b.main), subs: [], set: await readBox(b.set), gear: await readBox(b.gear), enhance: await readBox(b.enhance), level: await readBox(b.level), rank: '' };
      for (const k of ['sub0', 'sub1', 'sub2', 'sub3']) if (b[k]) raw.subs.push(await readBox(b[k]));
      raw.rank = raw.gear;
      const { item, problems } = P.itemFromReadings(raw);
      if (!item) {
        last = { key: null, n: 0 };
        status(`Can't read this item yet (${problems.join(', ')}).`);
      } else {
        const key = P.itemKey(item);
        if (key === last.key) last.n++;
        else last = { key, n: 1 };
        if (last.n === 2) {
          const res = A.addScanned(item, key);
          const desc = `${item.gear} · ${item.set.replace(/Set$/, '') || '?'} · +${item.enhance} · ${item.main.type} ${item.main.value}`;
          if (res) {
            log.unshift({ desc, verdict: res.verdict, reason: res.reason, best: res.best[0], problems });
            status(`Added: ${desc} → ${res.verdict.toUpperCase()}`);
            postOverlay(res, b.main);
          } else status(`Already have: ${desc}`);
          renderLog();
        }
      }
    } catch (e) {
      status('Text reader unavailable: ' + e.message);
    }
    busy = false;
  }

  function postOverlay(res, rect) {
    const O = window.E7Overlay;
    if (!O || !rect) return;
    const best = res.best.filter((x) => x.delta > A.gs.rules.upgradeMargin)[0]; // only a real upgrade counts
    O.post('gear', [{ ...rect, kind: 'card', side: 'right', title: `${res.verdict.toUpperCase()} · gear score ${res.wss}${res.reforgedWss !== res.wss ? ` → ${res.reforgedWss}` : ''}`, lines: [res.reason, best ? `Best for ${A.nameOf(best.code)} (+${best.delta})` : 'Not an upgrade for anyone'] }]);
  }

  // ------------------------------------------------------------------- UI
  function status(t) {
    $('#gs-scan-status').textContent = t;
  }
  function renderLog() {
    $('#gs-scan-log').innerHTML = log
      .slice(0, 12)
      .map((x) => `<li><span class="vd ${x.verdict}">${esc(x.verdict)}</span> ${esc(x.desc)} <span class="hint">${esc(x.reason)}${x.best && x.best.delta > 0 ? ` · best for ${esc(A.nameOf(x.best.code))}` : ''}${x.problems.length ? ` · check: ${esc(x.problems.join(', '))}` : ''}</span></li>`)
      .join('');
  }
  function update() {
    $('#gs-scan').textContent = timer ? 'Stop reading' : 'Read gear from the game';
    for (const id of ['#gs-scan-boxes', '#gs-scan-teach']) $(id).classList.toggle('hidden', !timer);
    $('#gs-scan-use').checked = A.gs.useScanned;
    const n = window.E7Screens ? window.E7Screens.refs().filter((r) => r.screen === 'gear-item').length : 0;
    $('#gs-scan-info').textContent = `${A.gs.scanned.length} items read from the screen so far · boxes ${calibrated() ? 'set' : 'not set'} · item screen ${n ? `taught (${n})` : 'not taught'}`;
  }
  $('#gs-scan').addEventListener('click', () => (timer ? stop() : start()));
  $('#gs-scan-boxes').addEventListener('click', calibrate);
  $('#gs-scan-teach').addEventListener('click', () => {
    if (!source) return;
    window.E7Screens.teach(source, 'gear-item');
    update();
  });
  $('#gs-scan-use').addEventListener('change', (e) => A.setUseScanned(e.target.checked));
  $('#gs-scan-clear').addEventListener('click', () => {
    if (A.gs.scanned.length && confirm('Delete all items read from the screen?')) A.clearScanned();
    update();
  });
  update();
  window.GearScan = { start, stop, tick, calibrate, _useSource: (s) => (source = s), isReading: () => !!timer };
})();
