/*
 * Auto-detection: watches the emulator window (screen capture), recognises the
 * heroes in each draft slot and fills the draft by itself.
 *
 *  1. Capture   getDisplayMedia() -> <video>, or a screenshot file -> <img>
 *  2. Calibrate the user draws the slot boxes once (saved as fractions of the frame)
 *  3. Recognise each slot is shrunk to 16x16 and compared with templates:
 *                 'official'        official portraits
 *                 'my corrections'  slots the user labelled (preferred)
 *                 'auto-learned'    confident matches saved automatically (opt-in)
 *  4. Apply     confirmed slots -> board -> RTALogic.boardToDraft()
 *
 * It only reads pixels. It never sends input to the game.
 */
(function () {
  'use strict';
  const App = window.RTAApp;
  const V = window.RTAVision;
  const L = window.RTALogic;
  const R = window.RTARoster;
  const $ = (s) => document.querySelector(s);
  const esc = App.esc;

  const SLOT_INSET = 0.08; // ignore slot borders
  // Each slot is also read at slightly different crops, so a box drawn a bit
  // off still lines up with the portrait. The best-scoring crop wins.
  const SLOT_VARIANTS = [
    { inset: SLOT_INSET },
    { inset: 0.03 },
    { inset: 0.14 },
    { inset: SLOT_INSET, dx: 0.04 },
    { inset: SLOT_INSET, dx: -0.04 },
    { inset: SLOT_INSET, dy: 0.04 },
    { inset: SLOT_INSET, dy: -0.04 },
  ];
  const TEMPLATE_INSETS = [0, 0.1, 0.2]; // portraits are compared at 3 crops
  const CONFIRM_FRAMES = 2; // same answer this many times in a row before it counts
  const EMPTY_FRAMES = 3;
  const MAX_CORRECTIONS_PER_HERO = 12;
  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

  const cfg = () => App.store.auto;

  let source = null; // HTMLVideoElement | HTMLImageElement
  let stream = null;
  let timer = null;
  let slots = []; // from calibration
  const track = new Map(); // slot id -> tracker
  let templates = { official: [], learned: [] };
  let officialLoad = { started: false, done: 0, total: 0, failed: 0 };
  let fps = { t: 0, n: 0, value: 0 };
  let lastFirstPick = null;

  const small = document.createElement('canvas');
  small.width = small.height = V.SIZE;
  const sctx = small.getContext('2d', { willReadFrequently: true });

  // ================================================================ sources
  function frameSize() {
    if (!source) return null;
    const w = source.videoWidth || source.naturalWidth;
    const h = source.videoHeight || source.naturalHeight;
    return w && h ? { w, h } : null;
  }

  async function startCapture() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      alert('This browser cannot capture the screen. Use Chrome or Edge on PC.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 10 }, audio: false });
    } catch (e) {
      setStatus('Capture was cancelled.');
      return;
    }
    const video = $('#auto-video');
    video.srcObject = stream;
    await video.play();
    source = video;
    stream.getVideoTracks()[0].addEventListener('ended', stopCapture);
    begin();
  }

  function stopCapture() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (source && source.tagName === 'VIDEO') source = null;
    if (timer) clearInterval(timer);
    timer = null;
    setStatus('Not watching.');
    render();
  }

  function useScreenshot(file) {
    const img = new Image();
    img.onload = () => {
      if (stream) stopCapture();
      source = img;
      begin();
    };
    img.src = URL.createObjectURL(file);
  }

  function begin() {
    loadOfficialTemplates();
    rebuildLearned();
    rebuildSlots();
    if (timer) clearInterval(timer);
    timer = null;
    if (source.tagName === 'VIDEO') timer = setInterval(tick, cfg().intervalMs);
    if (!V.isCalibrated(cfg().regions)) {
      setStatus('Capturing. Now calibrate: press "Calibrate slots" while the draft screen is showing.');
      startCalibration();
    } else tick();
    render();
  }

  // ============================================================== templates
  function featureFromSource(img, rect, inset, shiftX = 0, shiftY = 0) {
    // rect in pixels of the source
    const dx = rect.w * inset;
    const dy = rect.h * inset;
    const ox = rect.w * shiftX;
    const oy = rect.h * shiftY;
    sctx.clearRect(0, 0, V.SIZE, V.SIZE);
    sctx.drawImage(img, rect.x + dx + ox, rect.y + dy + oy, Math.max(1, rect.w - 2 * dx), Math.max(1, rect.h - 2 * dy), 0, 0, V.SIZE, V.SIZE);
    return V.featureFromRGBA(sctx.getImageData(0, 0, V.SIZE, V.SIZE).data);
  }

  function loadOfficialTemplates() {
    if (officialLoad.started) return;
    officialLoad.started = true;
    const heroes = App.cache.heroes.filter((h) => h.source === 'official');
    officialLoad.total = heroes.length;
    let i = 0;
    const next = () => {
      if (i >= heroes.length) return;
      const h = heroes[i++];
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const r = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
          for (const inset of TEMPLATE_INSETS) templates.official.push({ code: h.code, vec: featureFromSource(img, r, inset).vec, source: 'official' });
        } catch (_) {
          officialLoad.failed++;
        }
        officialLoad.done++;
        renderTemplateInfo();
        next();
      };
      img.onerror = () => {
        officialLoad.failed++;
        officialLoad.done++;
        next();
      };
      img.src = R.PORTRAIT_URL(h.code);
    };
    for (let k = 0; k < 12; k++) next();
  }

  function rebuildLearned() {
    templates.learned = cfg().corrections.map((c) => ({ code: c.code, vec: V.dequantize(c.q), source: c.source }));
  }

  function activeTemplates() {
    const c = cfg();
    const out = [];
    if (c.useOfficial) out.push(...templates.official);
    for (const t of templates.learned) {
      if (t.source === 'my corrections' && c.useCorrections) out.push(t);
      if (t.source === 'auto-learned' && c.useAutoLearned) out.push(t);
    }
    return out;
  }

  function addLearned(code, feature, src) {
    const c = cfg();
    c.corrections.push({ code, source: src, q: V.quantize(feature.vec), at: new Date().toISOString() });
    const mine = c.corrections.filter((x) => x.code === code && x.source === src);
    if (mine.length > MAX_CORRECTIONS_PER_HERO) c.corrections.splice(c.corrections.indexOf(mine[0]), 1);
    rebuildLearned();
    App.save();
  }

  // =================================================================== loop
  function rebuildSlots() {
    slots = V.slotLayout(cfg().regions);
    for (const s of slots) if (!track.has(s.id)) track.set(s.id, { candidate: null, count: 0, empties: 0, confirmed: null, result: null, lastVec: null, feature: null });
  }

  function pxRect(rect) {
    const f = frameSize();
    return { x: rect.x * f.w, y: rect.y * f.h, w: rect.w * f.w, h: rect.h * f.h };
  }

  function tick() {
    if (!source || !frameSize() || !slots.length) return;
    const c = cfg();
    if (c.useOfficial && officialLoad.done < officialLoad.total) {
      // Matching against a half-loaded list could lock in a look-alike hero.
      setStatus(`Loading hero portraits ${officialLoad.done}/${officialLoad.total}…`);
      if (App.activeTab() === 'auto') renderSlots();
      return;
    }
    const tpl = activeTemplates();
    const owned = App.cache.owned.size >= 20 ? App.cache.owned : null;
    for (const s of slots) {
      const t = track.get(s.id);
      const rect = pxRect(s.rect);
      const feature = featureFromSource(source, rect, SLOT_INSET);
      t.feature = feature;
      const unchanged = t.lastVec && t.result && V.similarity(feature.vec, t.lastVec) > 0.995;
      t.lastVec = feature.vec;
      if (!unchanged) {
        const opts = { preferSource: 'my corrections', allow: s.side === 'me' && s.kind === 'pick' ? owned : null };
        let best = null;
        for (const v of SLOT_VARIANTS) {
          const f = v === SLOT_VARIANTS[0] ? feature : featureFromSource(source, rect, v.inset, v.dx || 0, v.dy || 0);
          const r = V.classify(f, tpl, opts);
          if (r.empty) {
            if (v === SLOT_VARIANTS[0]) {
              best = r;
              break;
            }
            continue;
          }
          if (!best || best.best.sim < r.best.sim) best = r;
        }
        t.result = best;
      }
      const r = t.result;
      if (r.empty) {
        t.candidate = null;
        t.count = 0;
        if (++t.empties >= EMPTY_FRAMES) t.confirmed = null;
        continue;
      }
      t.empties = 0;
      if (!V.isConfident(r, c.threshold)) continue; // unsure: keep what we had
      if (t.candidate === r.best.code) t.count++;
      else {
        t.candidate = r.best.code;
        t.count = 1;
      }
      if (t.count >= CONFIRM_FRAMES && (!t.confirmed || t.confirmed.code !== r.best.code)) {
        t.confirmed = { ...r.best };
        if (c.autoLearn && r.best.source === 'official' && r.best.sim >= Math.max(0.8, c.threshold)) addLearned(r.best.code, feature, 'auto-learned');
      }
    }
    if (c.apply) applyBoard();
    maybeReadName();
    fps.n++;
    const now = performance.now();
    if (now - fps.t > 2000) {
      fps.value = (fps.n * 1000) / (now - fps.t || 1);
      fps.t = now;
      fps.n = 0;
    }
    if (App.activeTab() === 'auto') renderSlots();
    setStatus(source.tagName === 'VIDEO' ? `Watching · ${fps.value ? fps.value.toFixed(1) : '…'} checks/s · ${boardSummary()}` : `Screenshot · ${boardSummary()}`);
  }

  /** Confirmed heroes per slot list, cut at the first gap (slots fill in order). */
  function board() {
    const list = (side, kind, n) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const t = track.get(`${side}-${kind}-${i}`);
        if (!t || !t.confirmed) break;
        out.push(t.confirmed.code);
      }
      return out;
    };
    return {
      prebans: { me: list('me', 'preban', 2), opp: list('opp', 'preban', 2) },
      picks: { me: list('me', 'pick', 5), opp: list('opp', 'pick', 5) },
    };
  }
  function boardSummary() {
    const b = board();
    return `prebans ${b.prebans.me.length}+${b.prebans.opp.length}, picks ${b.picks.me.length}+${b.picks.opp.length}`;
  }

  function applyBoard() {
    const b = board();
    const cur = App.store.draft;
    const curView = L.draftView(cur);
    const nonPost = cur.actions.filter((a) => a.phase !== 'postban').length;
    const seen = b.prebans.me.length + b.prebans.opp.length + b.picks.me.length + b.picks.opp.length;
    if (!seen) return;

    // New match? Prebans on screen differ from the prebans in the current draft.
    const curPre = [...curView.prebans.me, ...curView.prebans.opp];
    const scrPre = [...b.prebans.me, ...b.prebans.opp];
    const newMatch = curPre.length > 0 && scrPre.length > 0 && scrPre.some((c) => !curPre.includes(c)) && b.picks.me.length + b.picks.opp.length <= 1;
    if (newMatch) lastFirstPick = null;

    const inferred = L.inferFirstPick(b);
    if (inferred) lastFirstPick = inferred;
    const firstPick = lastFirstPick || cur.firstPick;

    let next = L.boardToDraft({ ...b, postbans: {} }, firstPick);
    // keep postbans already entered (by click) if still valid
    if (!newMatch) for (const a of cur.actions.filter((x) => x.phase === 'postban')) if (!L.canSelect(next, a.heroId)) next = L.select(next, a.heroId);

    if (newMatch) return App.replaceDraft(next, { newMatch: true });
    // Never shrink the draft (a slot flickering or an animation must not undo picks);
    // apply when the screen shows more, or the same amount but different heroes (a correction).
    const nextNonPost = next.actions.filter((a) => a.phase !== 'postban').length;
    const changed = next.firstPick !== cur.firstPick || JSON.stringify(next.actions) !== JSON.stringify(cur.actions);
    if (changed && nextNonPost >= nonPost) App.replaceDraft(next);
  }

  // ==================================================================== OCR
  let ocr = { worker: null, loading: false, busy: false, last: '', lastAt: 0, failed: false };
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }
  async function maybeReadName() {
    const c = cfg();
    const reg = c.regions.oppName;
    if (!c.ocr || !reg || ocr.failed || ocr.busy || App.store.draft.opponent) return;
    if (performance.now() - ocr.lastAt < 2500) return;
    ocr.lastAt = performance.now();
    ocr.busy = true;
    try {
      if (!ocr.worker) {
        if (!window.Tesseract) await loadScript(TESSERACT_URL);
        ocr.worker = await window.Tesseract.createWorker('eng');
      }
      const r = pxRect(reg);
      const cv = document.createElement('canvas');
      const scale = Math.max(1, 64 / r.h);
      cv.width = Math.round(r.w * scale);
      cv.height = Math.round(r.h * scale);
      const cx = cv.getContext('2d');
      cx.filter = 'grayscale(1) contrast(1.6)';
      cx.drawImage(source, r.x, r.y, r.w, r.h, 0, 0, cv.width, cv.height);
      const { data } = await ocr.worker.recognize(cv);
      const name = V.cleanName(data && data.text);
      if (name && name === ocr.last) App.setOpponent(name);
      ocr.last = name;
    } catch (e) {
      console.warn('OCR unavailable:', e);
      ocr.failed = true;
    }
    ocr.busy = false;
  }

  // ============================================================ calibration
  let calib = null; // { step, regions, frame: canvas, drag }

  function startCalibration() {
    if (!source || !frameSize()) {
      alert('Start watching the emulator (or load a screenshot) first, with the draft screen visible.');
      return;
    }
    const f = frameSize();
    const cv = $('#calib-canvas');
    cv.width = f.w;
    cv.height = f.h;
    const frame = document.createElement('canvas');
    frame.width = f.w;
    frame.height = f.h;
    frame.getContext('2d').drawImage(source, 0, 0);
    calib = { step: 0, regions: { ...cfg().regions }, frame, drag: null, preview: false };
    $('#calib').classList.remove('hidden');
    drawCalib();
  }

  function showOverlay() {
    if (!source || !frameSize()) return alert('Start watching or load a screenshot first.');
    startCalibration();
    calib.step = V.REGION_STEPS.length;
    calib.preview = true;
    drawCalib();
  }

  function drawCalib() {
    const cv = $('#calib-canvas');
    const ctx = cv.getContext('2d');
    ctx.drawImage(calib.frame, 0, 0);
    const W = cv.width;
    const H = cv.height;
    const lw = Math.max(2, W / 600);
    const box = (r, color, label) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.strokeRect(r.x * W, r.y * H, r.w * W, r.h * H);
      if (label) {
        ctx.fillStyle = color;
        ctx.font = `${Math.round(lw * 7)}px sans-serif`;
        ctx.fillText(label, r.x * W + lw, r.y * H - lw * 2);
      }
    };
    for (const s of V.slotLayout(calib.regions)) box(s.rect, s.side === 'me' ? '#4aa3ff' : '#ff5d6c', `${s.kind === 'pick' ? 'P' : 'B'}${s.index + 1}`);
    if (calib.regions.oppName) box(calib.regions.oppName, '#ff8f6b', 'name');
    for (const k of ['mePickFirst', 'mePickLast', 'oppPickFirst', 'oppPickLast']) if (calib.regions[k] && !V.slotLayout(calib.regions).length) box(calib.regions[k], '#c9a24a');
    if (calib.drag) box(calib.drag.rect, '#c9a24a');
    const step = V.REGION_STEPS[calib.step];
    $('#calib-title').textContent = calib.preview ? 'Alignment check' : 'Calibration';
    $('#calib-step').textContent = calib.preview
      ? 'Blue = your slots, red = opponent. Boxes should sit on the hero pictures. Press Done, or Back to redraw.'
      : step
        ? `Step ${calib.step + 1}/${V.REGION_STEPS.length}: drag a box over ${step.label}`
        : 'All set. Press Done to save.';
    $('#calib-skip').classList.toggle('hidden', !(step && step.optional) || calib.preview);
  }

  function canvasPoint(e) {
    const cv = $('#calib-canvas');
    const b = cv.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
  }
  $('#calib-canvas').addEventListener('pointerdown', (e) => {
    if (!calib || calib.preview || calib.step >= V.REGION_STEPS.length) return;
    const p = canvasPoint(e);
    calib.drag = { start: p, rect: { x: p.x, y: p.y, w: 0, h: 0 } };
    e.target.setPointerCapture(e.pointerId);
  });
  $('#calib-canvas').addEventListener('pointermove', (e) => {
    if (!calib || !calib.drag) return;
    const p = canvasPoint(e);
    const s = calib.drag.start;
    calib.drag.rect = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) };
    drawCalib();
  });
  $('#calib-canvas').addEventListener('pointerup', () => {
    if (!calib || !calib.drag) return;
    const r = calib.drag.rect;
    calib.drag = null;
    if (r.w > 0.004 && r.h > 0.004) {
      calib.regions[V.REGION_STEPS[calib.step].key] = r;
      calib.step++;
    }
    drawCalib();
  });
  $('#calib-back').addEventListener('click', () => {
    if (!calib) return;
    if (calib.preview) {
      calib.preview = false;
      calib.step = 0;
    } else if (calib.step > 0) calib.step--;
    drawCalib();
  });
  $('#calib-skip').addEventListener('click', () => {
    if (!calib) return;
    delete calib.regions[V.REGION_STEPS[calib.step].key];
    calib.step++;
    drawCalib();
  });
  $('#calib-done').addEventListener('click', () => {
    if (!calib) return;
    if (!V.isCalibrated(calib.regions)) {
      if (!confirm('Some required boxes are missing. Close anyway?')) return;
    } else {
      cfg().regions = calib.regions;
      track.clear();
      rebuildSlots();
      App.save();
    }
    calib = null;
    $('#calib').classList.add('hidden');
    tick();
    render();
  });

  // ============================================================ corrections
  let fixing = null; // slot id
  $('#auto-slots').addEventListener('click', (e) => {
    const b = e.target.closest('[data-slot]');
    if (!b) return;
    fixing = b.dataset.slot;
    const s = slots.find((x) => x.id === fixing);
    $('#auto-fix-label').textContent = `${s.side === 'me' ? 'My' : 'Opponent'} ${s.kind} #${s.index + 1}:`;
    $('#auto-fix-input').value = '';
    $('#auto-fix').classList.remove('hidden');
    $('#auto-fix-input').focus();
  });
  function saveFix() {
    const h = App.bestMatch($('#auto-fix-input').value, App.cache.heroes);
    if (!h) return alert('No hero with that name.');
    const t = track.get(fixing);
    if (!t || !t.feature) return;
    addLearned(h.code, t.feature, 'my corrections');
    t.confirmed = { code: h.code, sim: 1, source: 'my corrections' };
    t.candidate = h.code;
    t.count = CONFIRM_FRAMES;
    t.result = null;
    closeFix();
    if (cfg().apply) applyBoard();
    renderSlots();
  }
  function closeFix() {
    fixing = null;
    $('#auto-fix').classList.add('hidden');
  }
  $('#auto-fix-save').addEventListener('click', saveFix);
  $('#auto-fix-input').addEventListener('keydown', (e) => e.key === 'Enter' && saveFix());
  $('#auto-fix-cancel').addEventListener('click', closeFix);
  $('#auto-fix-clear').addEventListener('click', () => {
    const t = track.get(fixing);
    if (t) Object.assign(t, { confirmed: null, candidate: null, count: 0 });
    closeFix();
    renderSlots();
  });

  // ================================================================= render
  function setStatus(text) {
    const el = $('#auto-status');
    el.textContent = text;
    el.className = 'status' + (timer ? ' me' : '');
    $('#auto-dot').classList.toggle('on', !!timer);
  }

  function renderTemplateInfo() {
    const c = cfg();
    const counts = { 'my corrections': 0, 'auto-learned': 0 };
    for (const x of c.corrections) counts[x.source] = (counts[x.source] || 0) + 1;
    const off = officialLoad.started ? `${officialLoad.done - officialLoad.failed}/${officialLoad.total} portraits loaded${officialLoad.failed ? ` (${officialLoad.failed} failed)` : ''}` : 'portraits load when you start';
    const el = $('#auto-tpl');
    if (el) el.textContent = `Official: ${off} · My corrections: ${counts['my corrections']} · Auto-learned: ${counts['auto-learned']}`;
  }

  function renderSlots() {
    const box = $('#auto-slots');
    if (!slots.length) {
      box.innerHTML = '<p class="hint">Not calibrated yet.</p>';
      return;
    }
    if (box.children.length !== slots.length) {
      box.innerHTML = slots
        .map((s) => `<button class="aslot ${s.side}" data-slot="${s.id}"><canvas width="44" height="44"></canvas><div><div class="t">${s.side === 'me' ? 'Me' : 'Opp'} ${s.kind} ${s.index + 1}</div><div class="h">—</div><div class="t sc"></div></div></button>`)
        .join('');
    }
    slots.forEach((s, i) => {
      const el = box.children[i];
      const t = track.get(s.id);
      if (source && frameSize()) {
        const r = pxRect(s.rect);
        el.querySelector('canvas').getContext('2d').drawImage(source, r.x, r.y, r.w, r.h, 0, 0, 44, 44);
      }
      const r = t.result;
      const conf = t.confirmed;
      el.classList.toggle('ok', !!conf);
      el.classList.toggle('unsure', !conf && r && !r.empty);
      el.querySelector('.h').textContent = conf ? App.nameOf(conf.code) : r && r.empty ? 'empty' : r && r.best ? `${App.nameOf(r.best.code)}?` : '—';
      el.querySelector('.sc').textContent = r && r.best ? `${Math.min(100, Math.round(r.best.sim * 100))}% · ${r.best.source}` : '';
    });
  }

  function render() {
    const c = cfg();
    $('#auto-start').classList.toggle('hidden', !!stream);
    $('#auto-stop').classList.toggle('hidden', !stream);
    $('#auto-thr').value = c.threshold;
    $('#auto-thr-val').textContent = Math.round(c.threshold * 100) + '%';
    $('#auto-interval').value = String(c.intervalMs);
    $('#auto-apply').checked = c.apply;
    $('#auto-ocr').checked = c.ocr;
    $('#auto-use-official').checked = c.useOfficial;
    $('#auto-use-corr').checked = c.useCorrections;
    $('#auto-use-learned').checked = c.useAutoLearned;
    $('#auto-learn').checked = c.autoLearn;
    if (!slots.length) rebuildSlots();
    renderTemplateInfo();
    renderSlots();
  }

  // ================================================================ wiring
  $('#auto-start').addEventListener('click', startCapture);
  $('#auto-stop').addEventListener('click', stopCapture);
  $('#auto-calibrate').addEventListener('click', startCalibration);
  $('#auto-overlay').addEventListener('click', showOverlay);
  $('#auto-shot').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) useScreenshot(f);
  });
  const bind = (sel, key, parse) =>
    $(sel).addEventListener('input', (e) => {
      cfg()[key] = parse(e.target);
      App.save();
      if (key === 'intervalMs' && timer) {
        clearInterval(timer);
        timer = setInterval(tick, cfg().intervalMs);
      }
      track.forEach((t) => (t.result = null));
      render();
    });
  bind('#auto-thr', 'threshold', (el) => Number(el.value));
  bind('#auto-interval', 'intervalMs', (el) => Number(el.value));
  bind('#auto-apply', 'apply', (el) => el.checked);
  bind('#auto-ocr', 'ocr', (el) => el.checked);
  bind('#auto-use-official', 'useOfficial', (el) => el.checked);
  bind('#auto-use-corr', 'useCorrections', (el) => el.checked);
  bind('#auto-use-learned', 'useAutoLearned', (el) => el.checked);
  bind('#auto-learn', 'autoLearn', (el) => el.checked);
  const clearSrc = (src, label) => () => {
    if (!confirm(`Delete all ${label}?`)) return;
    cfg().corrections = cfg().corrections.filter((c) => c.source !== src);
    rebuildLearned();
    App.save();
    render();
  };
  $('#auto-clear-learned').addEventListener('click', clearSrc('auto-learned', 'auto-learned examples'));
  $('#auto-clear-corr').addEventListener('click', clearSrc('my corrections', 'of your corrections'));

  window.RTAAuto = { render, tick, board, isWatching: () => !!timer, _track: track, _templates: templates, _officialLoad: officialLoad };
  rebuildSlots();
})();
