/*
 * Gear page ↔ game watcher. Reading items from the screen happens in the game watcher
 * (js/vision/readers/gear-item.js); saving them in js/vision/consumers/gear.js. This page only:
 *   - shows the watcher's status and the items it added ('gear:added' / 'gear:dup' events),
 *   - lets you draw the item-panel boxes on a snapshot of the game (localStorage 'e7-gearscan-boxes'),
 *   - teaches "this is the item screen".
 * Only reads the screen; never touches the game.
 */
(function () {
  'use strict';
  const A = window.GearApp;
  const C = window.VisionClient;
  const bus = window.E7Bus;
  const $ = (s) => document.querySelector(s);
  const esc = A.esc;
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
  const boxes = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || 'null') || {};
    } catch (_) {
      return {};
    }
  };
  const calibrated = () => ['main', 'sub0', 'sub1'].every((k) => boxes()[k]);
  const status = (t) => ($('#gs-scan-status').textContent = t);

  // ---------------------------------------------------------------- calibration (on a snapshot of the game)
  async function calibrate() {
    let snap;
    try {
      snap = await C.snapshot();
    } catch (e) {
      return alert(`Start the game watcher first, with an item's details showing in the game. (${e.message})`);
    }
    const cv = $('#gs-calib-canvas');
    cv.width = snap.w;
    cv.height = snap.h;
    const ctx = cv.getContext('2d');
    const regions = { ...boxes() };
    let step = 0;
    let drag = null;
    const draw = () => {
      ctx.drawImage(snap.img, 0, 0);
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
      if (window.GameArea) window.GameArea.markCalibrated('gear', snap.frameKey);
      $('#gs-calib').close();
      update();
    };
    $('#gs-calib-cancel').onclick = () => $('#gs-calib').close();
    draw();
    $('#gs-calib').showModal();
  }

  // ---------------------------------------------------------------- events from the watcher
  const log = [];
  function addLog(d, dup) {
    log.unshift({ ...d, dup });
    if (log.length > 12) log.pop();
    renderLog();
  }
  function renderLog() {
    $('#gs-scan-log').innerHTML = log
      .map((x) =>
        x.dup
          ? `<li class="hint">Already have: ${esc(x.desc)}</li>`
          : `<li><span class="vd ${esc(x.verdict)}">${esc(x.verdict)}</span> ${esc(x.desc)} <span class="hint">${esc(x.reason)}${x.best ? ` · best for ${esc(x.best.name)} (+${x.best.delta})` : ''}${x.problems && x.problems.length ? ` · check: ${esc(x.problems.join(', '))}` : ''}</span></li>`,
      )
      .join('');
  }
  // what happened before this page was opened
  for (const e of bus.log().filter((e) => e.type === 'gear:added' || e.type === 'gear:dup').slice(-12)) addLog(e.data, e.type === 'gear:dup');
  bus.on('gear:added', (d) => {
    addLog(d, false);
    status(`Added: ${d.desc} → ${String(d.verdict).toUpperCase()}`);
    A.reload(); // the watcher saved it (storage events don't fire in the window that wrote it, so reload here too)
  });
  bus.on('gear:dup', (d) => {
    addLog(d, true);
    status(`Already have: ${d.desc}`);
  });
  bus.on('vision:warning', (d) => d.module === 'gear' && status('⚠ ' + d.text));

  // ---------------------------------------------------------------- UI
  function update() {
    const s = C.status();
    const watching = C.alive() && s && s.watching;
    $('#gs-scan').textContent = watching ? 'Stop watching' : 'Start the game watcher';
    $('#gs-scan-use').checked = A.gs.useScanned;
    const reader = s && s.readers && s.readers.find((r) => r.id === 'gear-item');
    const n = window.E7Screens ? window.E7Screens.refs().filter((r) => r.screen === 'gear-item').length : 0;
    $('#gs-scan-info').textContent = `${C.line()} · ${A.gs.scanned.length} items read from the screen · boxes ${calibrated() ? 'set' : 'not set'} · item screen ${n ? `taught (${n})` : 'not taught'}${reader && reader.note ? ` · ${reader.note}` : ''}`;
  }
  C.onStatus(update);
  $('#gs-scan').addEventListener('click', () => {
    const s = C.status();
    if (C.alive() && s && s.watching) C.stop().catch(() => {});
    else
      C.ensure()
        .then(() => !calibrated() && calibrate())
        .catch((e) => status(e.message));
  });
  $('#gs-scan-boxes').addEventListener('click', calibrate);
  $('#gs-scan-teach').addEventListener('click', () =>
    C.teach('gear-item')
      .then((r) => {
        status(`Item screen taught (${r.examples} example${r.examples === 1 ? '' : 's'}).`);
        update();
      })
      .catch((e) => status('Could not teach: ' + e.message)),
  );
  $('#gs-scan-use').addEventListener('change', (e) => A.setUseScanned(e.target.checked));
  $('#gs-scan-clear').addEventListener('click', () => {
    if (A.gs.scanned.length && confirm('Delete all items read from the screen?')) A.clearScanned();
    update();
  });
  update();
  window.GearScan = { calibrate, update };
})();
