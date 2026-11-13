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
  const LAY = window.E7Layouts; // built-in screen layouts (js/layouts.js)
  /** The built-in layout for the current game picture (or a picture of this size). */
  const layoutFor = (w, h) => (LAY ? LAY.layoutFor(w, h) : null);
  const layout = () => {
    const f = frameSize();
    return f ? layoutFor(f.w, f.h) : null;
  };
  /** Boxes the readers use: built-in ones with your own on top. */
  const regions = () => (LAY ? LAY.effective(cfg().regions, layout()) : cfg().regions || {});

  let source = null; // HTMLVideoElement | game-area canvas (live) | HTMLImageElement (screenshot)
  let live = false; // true while capturing the screen (vs a screenshot file)
  let stream = null;
  let timer = null;
  let slots = []; // from calibration
  const track = new Map(); // slot id -> tracker
  let templates = { official: [], learned: [], faces: [], faceLearned: [] }; // faces: js/faces.js (round icons)
  const F = window.RTAFaces;
  const ROUND = (s) => s.kind === 'preban'; // round hero icons: matched with the face matcher (picks are banners: old matcher)
  const faceBase = (faces) => (faces.length === F.GAME_VARIANTS.length ? F.GAME_VARIANTS : F.WIDE_VARIANTS).findIndex((v) => Math.abs(v.k - 1) < 0.05 && v.dx === 0 && v.dy === 0);
  let officialLoad = { started: false, done: 0, total: 0, failed: 0 };
  let fps = { t: 0, n: 0, value: 0 };
  let lastFirstPick = null;

  const small = document.createElement('canvas');
  small.width = small.height = V.SIZE;
  const sctx = small.getContext('2d', { willReadFrequently: true });

  // ================================================================ sources
  function frameSize() {
    if (!source) return null;
    const w = source.videoWidth || source.naturalWidth || source.width;
    const h = source.videoHeight || source.naturalHeight || source.height;
    return w && h ? { w, h } : null;
  }

  let capturing = false; // a start is in progress (no second picker / capture)
  async function startCapture() {
    if (capturing || stream) return;
    capturing = true;
    try {
      await doStartCapture();
    } finally {
      capturing = false;
    }
  }
  async function doStartCapture() {
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
    const s0 = stream;
    s0.getVideoTracks()[0].addEventListener('ended', stopCapture);
    // only the game window, if the capture is the whole screen (the box is drawn once)
    const src = window.GameArea ? await window.GameArea.wrap(video) : video;
    if (stream !== s0 || !src) {
      if (stream === s0) stopCapture();
      if (!src) setStatus('Not watching: no game area chosen.');
      return;
    }
    source = src;
    live = true;
    if (window.GameArea && cfg().regions) window.GameArea.warnIfStale('rta', source, Object.keys(cfg().regions).length > 0, 'press Calibrate and draw them again');
    begin();
  }

  function stopCapture() {
    clearInterval(autoSave);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (source && source.stopGameArea) source.stopGameArea();
    if (live) source = null;
    live = false;
    if (timer) clearInterval(timer);
    timer = null;
    setStatus('Not watching.');
    render();
  }

  function useScreenshot(file) {
    const img = new Image();
    img.onload = () => {
      if (stream) stopCapture();
      live = false;
      source = img;
      track.clear(); // a new picture: forget what the slots saw on the previous one
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
    if (live) timer = setInterval(tick, cfg().intervalMs);
    if (!V.isCalibrated(regions())) {
      if (live) {
        // never interrupt a match: keep pictures, calibrate afterwards
        const f = frameSize();
        setStatus(`The draft screen isn't set up for this game picture (${f ? f.w + '×' + f.h : '?'}: built-in positions only cover 16:9 Steam). Just play: a picture is saved every 15 s (or Ctrl+Shift+S in the desktop app). After the match, "Calibrate on a saved picture" → Draft screen.`);
        startAutoSave();
      } else startCalibration();
    } else tick();
    render();
  }

  // ============================================================ saved pictures (calibrate after the match)
  let autoSave = null;
  function startAutoSave() {
    clearInterval(autoSave);
    autoSave = setInterval(() => {
      if (!live || !source || V.isCalibrated(regions())) return clearInterval(autoSave);
      if (window.E7Pictures) window.E7Pictures.capture(source, 'auto (RTA not calibrated)').catch(() => {});
    }, 15000);
  }
  async function savePicture() {
    if (!live || !source) return alert('Start watching the game first.');
    await window.E7Pictures.capture(source, 'saved by hand');
    setStatus('Picture saved. Use "Calibrate on a saved picture" whenever you have time.');
  }
  async function pickPicture() {
    const list = window.E7Pictures ? await window.E7Pictures.list() : [];
    if (!list.length) return alert('No saved pictures yet. While watching, press Ctrl+Shift+S (desktop app) or "Save a game picture" on the draft screen. While the RTA reader isn\'t calibrated, it also saves one every 15 s.');
    const d = $('#pics');
    $('#pics-what').classList.add('hidden');
    $('#pics-list').classList.remove('hidden');
    $('#pics-list').innerHTML = list.map((p) => `<button class="pic" data-pic="${p.id}" title="${esc(new Date(p.at).toLocaleString())}"><img alt="" src="${p.url}" /><span>${esc(new Date(p.at).toLocaleTimeString())} ${esc(p.note || '')}</span></button>`).join('');
    d.showModal();
  }
  // 1) pick a picture, 2) say what's on it, 3) draw only those boxes
  let chosenPic = null;
  const PARTS = () => {
    const r = LAY ? LAY.effective(cfg().regions, chosenPic ? layoutFor(chosenPic.w, chosenPic.h) : null) : cfg().regions || {};
    const has = (keys) => keys.every((k) => r[k]);
    return [
      { id: 'draft', label: 'Draft screen: all slots (prebans, picks, opponent name)', steps: V.REGION_STEPS, done: V.isCalibrated(r) },
      ...V.REGION_STEPS.map((st) => ({ id: 'one:' + st.key, label: `Draft screen, just one box: ${st.label}`, steps: [st], done: has([st.key]), small: true })),
      { id: 'cr', label: 'Battle: CR (turn order) bar', steps: CR_STEPS, done: has(['crBar']) },
      { id: 'crx', label: 'Battle: EXPANDED CR bar', steps: CR_EXP_STEPS, done: has(['crBarExpanded']) },
      { id: 'result', label: 'Victory / Defeat screen', steps: RESULT_STEPS, done: has(['result']) },
      { id: 'help', label: "The game's drafting help (suggested heroes)", help: true, done: has(['helpFirst', 'helpLast']) },
    ];
  };
  function showParts(p) {
    chosenPic = p;
    $('#pics-list').classList.add('hidden');
    $('#pics-what').classList.remove('hidden');
    $('#pics-preview').src = p.url;
    if (window.E7Screens) $('#pics-teach').innerHTML = '<option value="">this picture shows…</option>' + window.E7Screens.SCREENS.map((x) => `<option value="${x.id}">${esc(x.label)}</option>`).join('');
    const parts = PARTS();
    const big = parts.filter((x) => !x.small);
    const one = parts.filter((x) => x.small);
    $('#pics-parts').innerHTML =
      big.map((x) => `<button class="btn${x.id === 'draft' ? ' primary' : ''}" data-part="${x.id}">${x.done ? '✓ ' : ''}${esc(x.label)}</button>`).join('') +
      `<label class="hint">Redo one draft box: <select id="pics-one"><option value="">choose…</option>${one.map((x) => `<option value="${x.id}">${x.done ? '✓ ' : ''}${esc(x.label.replace('Draft screen, just one box: ', ''))}</option>`).join('')}</select></label>`;
  }
  function startPart(id) {
    const part = PARTS().find((x) => x.id === id);
    if (!part || !chosenPic) return;
    const p = chosenPic;
    $('#pics').close();
    const img = new Image();
    img.onload = () => {
      const pic = { img, w: p.w, h: p.h, frameKey: p.frameKey };
      if (part.help) calibrateHelp(pic);
      else startCalibration(part.steps, pic);
    };
    img.src = p.url;
  }
  $('#pics-list').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pic]');
    if (!b) return;
    showParts(await window.E7Pictures.get(b.dataset.pic));
  });
  $('#pics-parts').addEventListener('click', (e) => {
    const b = e.target.closest('[data-part]');
    if (b) startPart(b.dataset.part);
  });
  $('#pics-parts').addEventListener('change', (e) => e.target.id === 'pics-one' && e.target.value && startPart(e.target.value));
  $('#pics-teach').addEventListener('change', async (e) => {
    const screen = e.target.value;
    if (!screen || !chosenPic || !window.E7Screens) return;
    const img = new Image();
    await new Promise((res) => {
      img.onload = res;
      img.src = chosenPic.url;
    });
    window.E7Screens.teach(img, screen);
    const n = window.E7Screens.refs().filter((r) => r.screen === screen).length;
    e.target.value = '';
    alert(`Taught: "${window.E7Screens.label(screen)}" (${n} example${n === 1 ? '' : 's'}). It's recognised from now on, on every page.`);
    if (window.E7Diag) window.E7Diag.log('screens', `taught ${screen} from a saved picture`, { examples: n });
  });
  // ---- name the heroes on a saved picture (DEVLOG #32): every name teaches that slot's picture ('my corrections')
  let labelling = null; // { img, pic, slots: [{ slot, rect, guess }] }
  async function openLabel(p) {
    const img = new Image();
    await new Promise((res) => {
      img.onload = res;
      img.src = p.url;
    });
    const regs = LAY ? LAY.effective(cfg().regions, layoutFor(p.w, p.h)) : cfg().regions || {};
    const px = (r) => ({ x: r.x * p.w, y: r.y * p.h, w: r.w * p.w, h: r.h * p.h });
    const ct = (window.RTASources && window.RTASources.classTemplates) || [];
    const list = V.slotLayout(regs).map((sl) => {
      const rect = px(sl.rect);
      let guess = null;
      if (F && ROUND(sl) && templates.faces.length > 50) {
        const b = F.badgesAt(img, rect, ct);
        const r = F.classify(F.fromRect(img, rect, F.WIDE_VARIANTS), activeFaceTemplates(), { preferSource: 'my corrections', allow: F.badgeAllow(b.element, b.role, App.cache.heroes) });
        if (r.best) guess = { code: r.best.code, sure: F.isConfident(r) };
      } else if (templates.official.length) {
        const r = V.classify(featureFromSource(img, rect, SLOT_INSET), activeTemplates(), { preferSource: 'my corrections' });
        if (!r.empty && r.best) guess = { code: r.best.code, sure: r.best.sim >= cfg().threshold && (r.second ? r.best.sim - r.second.sim : 1) >= 0.04 };
      }
      return { slot: sl, rect, guess };
    });
    labelling = { img, pic: p, slots: list };
    $('#label-grid').innerHTML = list
      .map((x, i) => `<div class="label-cell"><canvas data-i="${i}" width="120" height="70"></canvas><div class="hint">${x.slot.side === 'me' ? 'My' : 'Opponent'} ${x.slot.kind} #${x.slot.index + 1}</div>
        <input list="hero-names" data-i="${i}" value="${x.guess && x.guess.sure ? esc(App.nameOf(x.guess.code)) : ''}" placeholder="${x.guess ? 'maybe ' + esc(App.nameOf(x.guess.code)) : 'hero name'}" /></div>`)
      .join('');
    for (const c of $('#label-grid').querySelectorAll('canvas')) {
      const x = list[+c.dataset.i];
      c.getContext('2d').drawImage(img, x.rect.x, x.rect.y, x.rect.w, x.rect.h, 0, 0, c.width, c.height);
    }
    $('#pics').close();
    $('#label-dlg').showModal();
  }
  function saveLabels() {
    if (!labelling) return;
    const named = [];
    for (const inp of $('#label-grid').querySelectorAll('input')) {
      const txt = inp.value.trim();
      if (!txt) continue;
      const h = App.bestMatch(txt, App.cache.heroes);
      if (!h) return alert(`No hero called "${txt}".`);
      named.push({ ...labelling.slots[+inp.dataset.i], code: h.code });
    }
    for (const n of named) {
      addLearned(n.code, featureFromSource(labelling.img, n.rect, SLOT_INSET), 'my corrections');
      if (F && ROUND(n.slot)) {
        const faces = F.fromRect(labelling.img, n.rect, F.GAME_VARIANTS);
        const c = cfg();
        c.faceCorrections = c.faceCorrections || [];
        c.faceCorrections.push({ code: n.code, q: F.quantize(faces[faceBase(faces)].vec), at: new Date().toISOString() });
      }
    }
    rebuildLearned();
    App.save();
    if ($('#label-apply').checked && named.length) {
      const board = { prebans: { me: [], opp: [] }, picks: { me: [], opp: [] }, postbans: {} };
      for (const n of [...named].sort((a, b) => a.slot.index - b.slot.index)) (n.slot.kind === 'preban' ? board.prebans : board.picks)[n.slot.side].push(n.code);
      App.replaceDraft(L.boardToDraft(board, App.store.draft.firstPick || 'me'));
    }
    if (window.E7Diag) window.E7Diag.log('rta', `named ${named.length} heroes on a saved picture`, named.map((n) => `${n.slot.id}=${App.nameOf(n.code)}`));
    $('#label-dlg').close();
    labelling = null;
    setStatus(`Saved ${named.length} names. Those heroes' pictures are recognised from now on.`);
    render();
  }
  $('#pics-label').addEventListener('click', () => chosenPic && openLabel(chosenPic));
  $('#label-save').addEventListener('click', saveLabels);
  $('#label-cancel').addEventListener('click', () => $('#label-dlg').close());
  $('#pics-back').addEventListener('click', () => {
    $('#pics-what').classList.add('hidden');
    $('#pics-list').classList.remove('hidden');
  });
  $('#pics-close').addEventListener('click', () => $('#pics').close());
  $('#pics-clear').addEventListener('click', async () => {
    if (!confirm('Delete all saved game pictures?')) return;
    await window.E7Pictures.clear();
    $('#pics').close();
  });
  $('#auto-pics').addEventListener('click', pickPicture);
  $('#auto-save-pic').addEventListener('click', savePicture);

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
          if (F) templates.faces.push({ code: h.code, vec: F.fromPortrait(img), source: 'official' });
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
    templates.faceLearned = F ? (cfg().faceCorrections || []).map((c) => ({ code: c.code, vec: F.dequantize(c.q), source: 'my corrections' })) : [];
  }
  function activeFaceTemplates() {
    const c = cfg();
    return [...(c.useOfficial ? templates.faces : []), ...(c.useCorrections ? templates.faceLearned : [])];
  }
  /** Face-matcher result in the shape the slot code uses ({empty, best:{code, sim, source}, second, sure}). */
  function faceResult(fr) {
    if (fr.empty) return { empty: true, best: null, second: null, sure: false };
    const src = (x) => (x.source === 'official' ? 'official (face match)' : x.source);
    return { empty: false, best: { code: fr.best.code, sim: fr.best.score, source: src(fr.best) }, second: fr.second && { code: fr.second.code, sim: fr.second.score }, sure: F.isConfident(fr) };
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
    const R = regions();
    slots = [...V.slotLayout(R), ...V.helpSlots(R, cfg().helpCount)];
    for (const s of slots) if (!track.has(s.id)) track.set(s.id, { candidate: null, count: 0, empties: 0, confirmed: null, result: null, lastVec: null, feature: null });
  }

  function pxRect(rect) {
    const f = frameSize();
    return { x: rect.x * f.w, y: rect.y * f.h, w: rect.w * f.w, h: rect.h * f.h };
  }

  const DRAFT_HOLD_MS = 90000;
  const INTRO_HOLD_MS = 300000; // after the match-start screen, the next few minutes are this match's draft
  let introSeenAt = -Infinity;
  let boardPicFor = null; // draft id whose board picture was saved
  let lastScreen = null;
  let draftSeenAt = -Infinity; // performance.now() starts at 0 when the page opens: 0 would mean "draft just seen"
  const draftTaught = () => !!window.E7Screens && window.E7Screens.refs().some((r) => r.screen === 'rta-draft');
  function tick() {
    if (!source || !frameSize() || !slots.length) return;
    const c = cfg();
    if (c.useOfficial && officialLoad.done < officialLoad.total) {
      // Matching against a half-loaded list could lock in a look-alike hero.
      setStatus(`Loading hero portraits ${officialLoad.done}/${officialLoad.total}…`);
      if (App.activeTab() === 'auto') renderSlots();
      return;
    }
    // which screen is showing? (readers below only run on their own taught screen)
    const SW = window.E7Screens;
    if (SW) SW.update(source);
    const on = (screen) => !SW || SW.allowed(screen);
    renderScreenInfo();
    const tpl = activeTemplates();
    const owned = App.cache.owned.size >= 20 ? App.cache.owned : null;
    // DRAFT GATE (DEVLOG #29): with built-in positions the reader would otherwise read the lobby and every other screen
    // and turn their graphics into heroes. Unless you taught the draft screen, it's "the draft" only when at least
    // 2 of the 4 pre-ban faces at the bottom are recognised confidently (face matcher), and for 90 s after that
    // (postban / Ready screens don't show the pre-ban row). Screenshots you load yourself aren't gated.
    const gate = live && !draftTaught();
    if (gate && SW && SW.current() === 'rta-draft') draftSeenAt = performance.now(); // built-in draft-board signature
    // once per match, keep a picture of the draft board (all 10 picks show at the BAN step) to name heroes after the match
    if (live && SW && SW.current() === 'rta-draft' && boardPicFor !== App.store.draft.id && window.E7Pictures) {
      boardPicFor = App.store.draft.id;
      window.E7Pictures.capture(source, 'draft board · name the heroes after the match').catch(() => {});
      if (window.E7Diag) window.E7Diag.log('rta', 'saved a picture of the draft board');
    }
    const isDraft = () => (gate ? performance.now() - draftSeenAt < DRAFT_HOLD_MS || performance.now() - introSeenAt < INTRO_HOLD_MS : on('rta-draft'));
    // the match-start screen (versus / profile art, once taught) = a new match begins (owner's idea, DEVLOG #30)
    const cur = SW ? SW.current() : null;
    if (cur !== lastScreen) {
      if (cur === 'rta-found' && live) onMatchStart({ picture: false, firstPick: false }); // "Here comes a new challenger!"
      if (cur === 'rta-intro' && live) onMatchStart({ fresh: performance.now() - introSeenAt > 20000 });
      // the RTA menu (World Arena) means the draft is over: stop reading picks right away (owner's screenshot, DEVLOG #30)
      if (cur === 'rta-lobby' && (performance.now() - draftSeenAt < DRAFT_HOLD_MS || performance.now() - introSeenAt < INTRO_HOLD_MS)) {
        draftSeenAt = introSeenAt = -Infinity;
        if (window.E7Diag) window.E7Diag.log('rta', 'RTA menu seen: draft over, reading paused');
      }
      lastScreen = cur;
    }
    let prebansSure = 0;
    const ordered = [...slots].sort((a, b) => (b.kind === 'preban') - (a.kind === 'preban')); // pre-bans first
    // the pre-ban picker covers the draft board with a grid of faces: never read draft slots there (DEVLOG #30)
    const onPicker = SW && SW.current() === 'rta-preban-pick';
    if (onPicker) readPickerPrebans();
    for (const s of ordered) {
      const t = track.get(s.id);
      if (onPicker) continue;
      const needsDraft = !(gate && s.kind === 'preban');
      if (needsDraft && !isDraft() && (gate || s.side !== 'help')) {
        if (!t.confirmed) Object.assign(t, { candidate: null, count: 0 }); // never half-confirm on another screen
        continue;
      }
      const rect = pxRect(s.rect);
      const feature = featureFromSource(source, rect, SLOT_INSET);
      t.feature = feature;
      const unchanged = t.lastVec && t.result && V.similarity(feature.vec, t.lastVec) > 0.995;
      t.lastVec = feature.vec;
      if (!unchanged && F && ROUND(s) && templates.faces.length > 50) {
        // built-in boxes (measured by eye) get a wider search; boxes you drew are close enough for the normal one
        const own = (cfg().regions || {})[s.id] || (cfg().regions || {})[s.kind === 'preban' ? `${s.side}Preban${s.index + 1}` : ''];
        t.faces = F.fromRect(source, rect, own ? F.GAME_VARIANTS : F.WIDE_VARIANTS);
        // element colour + class symbol on the icon (when it shows them): only compare heroes with both (DEVLOG #29)
        const ct = (window.RTASources && window.RTASources.classTemplates) || [];
        t.badges = F.badgesAt(source, rect, ct);
        const allow = F.badgeAllow(t.badges.element, t.badges.role, App.cache.heroes);
        t.result = faceResult(F.classify(t.faces, activeFaceTemplates(), { preferSource: 'my corrections', allow }));
      } else if (!unchanged) {
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
      if (gate && s.kind === 'preban' && r.sure && ++prebansSure >= 2) {
        if (window.E7Diag && performance.now() - draftSeenAt > DRAFT_HOLD_MS) window.E7Diag.log('rta', 'draft screen found (pre-bans recognised)');
        draftSeenAt = performance.now();
      }
      // picks (old matcher): a real score is needed, not just a lead over other bad guesses (lobby text scored 34–60%)
      const strict = (x) => x.best.sim >= c.threshold && (x.second ? x.best.sim - x.second.sim : 1) >= 0.04;
      if (!('sure' in r ? r.sure : strict(r))) continue; // unsure: keep what we had
      if (t.candidate === r.best.code) t.count++;
      else {
        t.candidate = r.best.code;
        t.count = 1;
      }
      if (t.count >= CONFIRM_FRAMES && (!t.confirmed || t.confirmed.code !== r.best.code)) {
        t.confirmed = { ...r.best };
        if (window.E7Diag) window.E7Diag.log('rta', `slot ${s.id} = ${App.nameOf(r.best.code)}`, { sim: +r.best.sim.toFixed(3), source: r.best.source, second: r.second ? `${App.nameOf(r.second.code)} ${(+r.second.sim).toFixed(3)}` : null });
        t.ref = { code: r.best.code, vec: feature.vec }; // what the slot looked like when confirmed (postban detection)
        if (c.autoLearn && r.best.source === 'official' && r.best.sim >= Math.max(0.8, c.threshold)) addLearned(r.best.code, feature, 'auto-learned');
      }
    }
    if (isDraft()) {
      if (c.apply) applyBoard();
      if (c.apply && c.detectPostban) detectPostbans();
      recordGameHelp();
      maybeReadName();
    }
    if (on('rta-result')) maybeReadResult();
    if (on('rta-battle') || (SW && SW.current() === 'rta-cr-expanded')) maybeAutoReadCR();
    postOverlay();
    fps.n++;
    const now = performance.now();
    if (now - fps.t > 2000) {
      fps.value = (fps.n * 1000) / (now - fps.t || 1);
      fps.t = now;
      fps.n = 0;
    }
    if (App.activeTab() === 'auto') renderSlots();
    if (gate && !isDraft()) setStatus(`Watching · waiting for the RTA draft screen (looking for the pre-ban heroes at the bottom; ${prebansSure} of 4 recognised)…`);
    else setStatus(live ? `Watching · ${fps.value ? fps.value.toFixed(1) : '…'} checks/s · ${boardSummary()}` : `Screenshot · ${boardSummary()}`);
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

  // ================================================================ match start (versus / profile art)
  /** "Match found" or the match-start screen: a new match. Only the match-start screen has the profile art + First Pick. */
  function onMatchStart({ picture = true, firstPick = true, fresh = true } = {}) {
    const wasRecent = performance.now() - introSeenAt < 20000; // "match found" came just before: same match
    introSeenAt = performance.now();
    if (fresh && !wasRecent) {
      const d = App.store.draft;
      if (d.actions.length) App.replaceDraft(L.newDraft(d.firstPick), { newMatch: true }); // a finished draft is kept as pending
      lastFirstPick = null;
      track.clear();
      rebuildSlots();
      if (window.E7Diag) window.E7Diag.log('rta', picture ? 'match start screen (profile art): new match' : 'match found ("Here comes a new challenger!"): new match');
      setStatus('New match starting · reading the draft…');
    }
    // keep the profile art (both players) with this match, for later
    if (picture && window.E7Pictures && source) window.E7Pictures.capture(source, `match start (profile art) · draft ${App.store.draft.id}`).catch(() => {});
    if (firstPick) readFirstPick();
  }
  /** Match-start screen: "First Pick" is written under the profile art of whoever picks first (owner's screenshot). */
  async function readFirstPick() {
    if (!App.store.settings || ocr.failed) return;
    try {
      const strip = { x: 0.03, y: 0.9, w: 0.94, h: 0.075 };
      const words = await ocrWords(strip);
      const hit = words.find((w) => /first/i.test(w.text)) || words.find((w) => /pick/i.test(w.text));
      if (!hit) return;
      const side = hit.cx < 0.5 ? 'me' : 'opp'; // your art is on the left, the opponent's on the right
      lastFirstPick = side;
      const d = App.store.draft;
      if (!d.actions.length && d.firstPick !== side) App.replaceDraft(L.newDraft(side));
      if (window.E7Diag) window.E7Diag.log('rta', `first pick read on the match-start screen: ${side}`, { word: hit.text, x: +hit.cx.toFixed(2) });
    } catch (_) { /* OCR not available: first pick is still worked out from the picks */ }
  }

  // ================================================================ pre-ban picker: your two selected pre-bans
  let pickerPrebans = { codes: [], at: 0 };
  function readPickerPrebans() {
    const R = regions();
    if (!F || templates.faces.length < 50 || !R.myPrebanPick1) return;
    const ct = (window.RTASources && window.RTASources.classTemplates) || [];
    const codes = [];
    for (const k of ['myPrebanPick1', 'myPrebanPick2']) {
      const rect = pxRect(R[k]);
      const b = F.badgesAt(source, rect, ct);
      const r = F.classify(F.fromRect(source, rect, F.WIDE_VARIANTS), activeFaceTemplates(), { preferSource: 'my corrections', allow: F.badgeAllow(b.element, b.role, App.cache.heroes) });
      if (F.isConfident(r)) codes.push(r.best.code);
    }
    const key = codes.join(',');
    if (codes.length && key !== pickerPrebans.codes.join(',')) {
      pickerPrebans = { codes, at: Date.now() };
      if (window.E7Diag) window.E7Diag.log('rta', `pre-ban picker: you selected ${codes.map(App.nameOf).join(' + ')}`);
      setStatus(`Your pre-bans (picker): ${codes.map(App.nameOf).join(' + ')}`);
    }
  }

  // ================================================================ postbans
  /*
   * Experimental. When all 10 picks are in, a postbanned hero's slot changes
   * look (greyed out / marked). For each side we watch how much every pick
   * slot differs from how it looked when its hero was confirmed; one slot
   * clearly changing more than the others, for 3 checks in a row, is the ban.
   * A banned slot on MY side = the opponent's postban, and vice versa.
   */
  const ban = { draftId: null, me: { slot: null, n: 0, code: null }, opp: { slot: null, n: 0, code: null } };
  function detectPostbans() {
    const d = App.store.draft;
    const v = L.draftView(d);
    if (ban.draftId !== d.id) Object.assign(ban, { draftId: d.id, me: { slot: null, n: 0, code: null }, opp: { slot: null, n: 0, code: null } });
    if (v.picks.me.length < 5 || v.picks.opp.length < 5) return;
    for (const side of ['me', 'opp']) {
      const st = ban[side];
      if (st.code) continue;
      const sims = [];
      for (let i = 0; i < 5; i++) {
        const t = track.get(`${side}-pick-${i}`);
        if (!t || !t.ref || !t.feature) return;
        sims.push({ i, code: t.ref.code, sim: V.similarity(t.feature.vec, t.ref.vec) });
      }
      sims.sort((a, b) => a.sim - b.sim);
      const [lo, next] = sims;
      if (lo.sim < 0.85 && next.sim - lo.sim >= 0.08) {
        if (st.slot === lo.i) st.n++;
        else Object.assign(st, { slot: lo.i, n: 1 });
        if (st.n >= 3) st.code = lo.code;
      } else Object.assign(st, { slot: null, n: 0 });
    }
    // banned slot on the opponent's side = MY postban; apply in draft order
    for (let k = 0; k < 2; k++) {
      const step = L.currentStep(App.store.draft);
      if (!step || step.phase !== 'postban') break;
      const code = step.player === 'me' ? ban.opp.code : ban.me.code;
      if (!code || L.canSelect(App.store.draft, code)) break;
      App.selectHero(code);
    }
  }

  // ===================================================== game's drafting help
  /*
   * Reads the heroes the game's own RTA drafting help recommends at each draft
   * step and saves them (source 'game help'). The same list twice in a row
   * counts; each new list for a draft step is stored once.
   */
  const help = { key: null, n: 0, saved: new Set() };
  function recordGameHelp() {
    const hs = slots.filter((s) => s.side === 'help');
    if (!hs.length) return;
    const recs = [];
    for (const s of hs) {
      const t = track.get(s.id);
      const r = t && t.result;
      if (r && !r.empty && V.isConfident(r, cfg().threshold) && !recs.includes(r.best.code)) recs.push(r.best.code);
    }
    const d = App.store.draft;
    const step = L.currentStep(d);
    if (!recs.length || !step) {
      help.key = null;
      return;
    }
    const key = `${d.id}|${d.actions.length}|${recs.join(',')}`;
    if (key === help.key) help.n++;
    else Object.assign(help, { key, n: 1 });
    if (help.n >= 2 && !help.saved.has(key)) {
      help.saved.add(key);
      App.addGameHelp({ phase: step.phase, player: step.player, recs });
    }
  }

  // ================================================================== result
  const res = { draftId: null, last: null, done: false, at: 0 };
  async function maybeReadResult() {
    const c = cfg();
    const reg = regions().result;
    const d = App.store.draft;
    if (!c.detectResult || !reg || !L.isComplete(d) || ocr.failed || ocr.busy) return;
    if (res.draftId !== d.id) Object.assign(res, { draftId: d.id, last: null, done: false });
    if (res.done || performance.now() - res.at < 2000) return;
    res.at = performance.now();
    const text = (await ocrRegion(reg)).toUpperCase();
    const r = V.resultWord(text); // tolerant: the sword crosses the T of VICTORY on the Steam screen
    if (r && r === res.last && !res.done && App.store.draft.id === res.draftId) {
      res.done = true;
      if (window.E7Diag) window.E7Diag.log('rta', `result read from screen: ${r}`, { text: text.slice(0, 40) });
      if (App.store.settings.autoRecord) App.recordResult(r, 'auto');
      setStatus(`Result read from screen: ${r.toUpperCase()}${App.store.settings.autoRecord ? ' (recorded)' : ' — press Win/Loss to record'}`);
    }
    res.last = r;
  }

  // ================================================================ CR bar
  /*
   * Reads where each hero's portrait sits on the CR (turn order) bar at the
   * start of a battle, then turns positions into speeds using YOUR heroes'
   * real speeds from gear.txt as the reference (RTALogic.speedsFromCR).
   */
  const crState = { draftId: null, done: false, at: 0 };
  function crEnd(rect) {
    const e = cfg().crEnd || 'auto';
    if (e !== 'auto') return e;
    return rect.h > rect.w ? 'top' : 'right';
  }
  function readCR({ quiet = false } = {}) {
    const c = cfg();
    // the EXPANDED CR bar (bigger portraits) is used when it's on screen, else the normal bar
    const SW = window.E7Screens;
    const expandedNow = SW && SW.current() === 'rta-cr-expanded';
    const R = regions();
    const reg = (expandedNow && R.crBarExpanded) || R.crBar || R.crBarExpanded;
    const which = reg === R.crBarExpanded ? 'expanded CR bar' : 'CR bar';
    const out = $('#auto-cr-out');
    const say = (t) => {
      if (out) out.innerHTML = t;
    };
    if (!reg) return !quiet && say('Calibrate the CR bar (or the expanded CR bar) first, on a battle screen.');
    if (!source || !frameSize()) return !quiet && say('Start watching or load a screenshot first.');
    const v = L.draftView(App.store.draft);
    const fighters = [
      ...v.picks.me.filter((x) => !v.postbans.opp.includes(x)).map((code) => ({ code, side: 'me' })),
      ...v.picks.opp.filter((x) => !v.postbans.me.includes(x)).map((code) => ({ code, side: 'opp' })),
    ];
    if (!fighters.length) return !quiet && say('No heroes in the draft yet.');
    const r = pxRect(reg);
    const vertical = r.h > r.w;
    const size = vertical ? r.w : r.h;
    const span = (vertical ? r.h : r.w) - size;
    const steps = Math.max(8, Math.min(120, Math.round(span / 3)));
    const feats = [];
    for (let k = 0; k <= steps; k++) {
      const off = (span * k) / steps;
      const box = vertical ? { x: r.x, y: r.y + off, w: size, h: size } : { x: r.x + off, y: r.y, w: size, h: size };
      feats.push({ off, f: featureFromSource(source, box, 0.1) });
    }
    const tplFor = (code) => activeTemplates().filter((t) => t.code === code);
    const end = crEnd(r);
    const readings = [];
    for (const fgt of fighters) {
      const tpls = tplFor(fgt.code);
      if (!tpls.length) continue;
      let best = null;
      for (const p of feats) {
        if (p.f.std < 8) continue;
        for (const t of tpls) {
          const sim = V.similarity(p.f.vec, t.vec);
          if (!best || sim > best.sim) best = { sim, off: p.off };
        }
      }
      if (!best || best.sim < 0.55) continue;
      const frac = span ? best.off / span : 0;
      const cr = Math.round((end === 'right' || end === 'bottom' ? frac : 1 - frac) * 1000) / 10;
      readings.push({ ...fgt, cr, sim: best.sim });
    }
    const speeds = L.speedsFromCR(readings, App.cache.mySpeeds, App.store.settings.variance);
    if (!speeds.length) {
      if (!quiet) say(readings.length ? `Found ${readings.length} heroes on the bar, but none of your heroes there has a known speed. Import gear.txt (Data tab).` : 'Could not find the heroes on the CR bar. Check the CR bar box.');
      return false;
    }
    App.addScoutSpeeds(speeds);
    say(
      `${speeds.length} heroes read from the ${which} · ` +
        speeds
          .map((x) => `<span class="${x.side}">${App.esc(App.nameOf(x.code))}</span> ${x.cr}% → ${x.known ? `<b>${x.known}</b> (yours)` : `~<b>${Math.round(x.speed)}</b> (${Math.round(x.min)}–${Math.round(x.max)})`}`)
          .join(' · '),
    );
    return speeds.filter((x) => x.side === 'opp').length >= 2;
  }
  /**
   * Teams from the CR bar (DEVLOG #32): every hero on the bar is a ROUND icon, which the face matcher reads well.
   * Slides along the bar, keeps confident faces, and tells the side by the ring colour (red = opponent).
   * Not tested on a real battle file yet. Saved on the draft as `crTeams`; a recorded match uses them for missing picks.
   */
  function scanCRTeams({ quiet = false } = {}) {
    const R = regions();
    const SW = window.E7Screens;
    const reg = (SW && SW.current() === 'rta-cr-expanded' && R.crBarExpanded) || R.crBar || R.crBarExpanded;
    const say = (t) => !quiet && $('#auto-cr-out') && ($('#auto-cr-out').innerHTML = t);
    if (!reg) return say('Set the CR bar first: RTA → Auto → "What the reader knows" → Battle: CR bar → Set (on a saved battle picture).'), null;
    if (!source || !frameSize() || !F || templates.faces.length < 50) return say('Start watching (or load a screenshot) and wait for the hero portraits to load.'), null;
    const r = pxRect(reg);
    const vertical = r.h > r.w;
    const size = vertical ? r.w : r.h;
    const span = (vertical ? r.h : r.w) - size;
    const step = Math.max(3, size / 6); // fine enough that every icon is within a few px of a window
    const found = new Map();
    const tpls = activeFaceTemplates();
    const one = [F.GAME_VARIANTS.find((v) => v.k === 1 && v.dx === 0 && v.dy === 0)];
    for (let off = 0; off <= span + 0.5; off += step) {
      const box = vertical ? { x: r.x, y: r.y + off, w: size, h: size } : { x: r.x + off, y: r.y, w: size, h: size };
      const quick = F.classify(F.fromRect(source, box, one), tpls);
      if (!quick.best || quick.best.score < 0.55) continue;
      const res = F.classify(F.fromRect(source, box, F.WIDE_VARIANTS), tpls, { preferSource: 'my corrections' });
      if (!F.isConfident(res)) continue;
      const prev = found.get(res.best.code);
      if (!prev || prev.score < res.best.score) found.set(res.best.code, { code: res.best.code, score: res.best.score, side: ringSide(box) });
    }
    const teams = { me: [], opp: [] };
    for (const f of found.values()) teams[f.side].push(f.code);
    App.store.draft.crTeams = teams;
    App.save();
    if (window.E7Diag) window.E7Diag.log('rta', 'teams read from the CR bar', { me: teams.me.map(App.nameOf), opp: teams.opp.map(App.nameOf) });
    say(`Teams on the CR bar: <b>you</b> ${teams.me.map((c) => App.esc(App.nameOf(c))).join(', ') || '—'} · <b>opponent</b> ${teams.opp.map((c) => App.esc(App.nameOf(c))).join(', ') || '—'}`);
    return teams;
  }
  /** Ring colour around a round icon: mostly red = opponent, else you. */
  function ringSide(box) {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(source, box.x, box.y, box.w, box.h, 0, 0, 32, 32);
    const d = x.getImageData(0, 0, 32, 32).data;
    let red = 0;
    let n = 0;
    for (let yy = 0; yy < 32; yy++) {
      for (let xx = 0; xx < 32; xx++) {
        const rr = Math.hypot(xx - 15.5, yy - 15.5) / 16;
        if (rr < 0.86 || rr > 1) continue; // the ring only
        const i = (yy * 32 + xx) * 4;
        n++;
        if (d[i] > 140 && d[i] > d[i + 1] * 1.6 && d[i] > d[i + 2] * 1.6) red++;
      }
    }
    return n && red / n > 0.25 ? 'opp' : 'me';
  }
  function maybeAutoReadCR() {
    const c = cfg();
    const d = App.store.draft;
    if (!c.autoReadCR || !(regions().crBar || regions().crBarExpanded) || !L.isComplete(d)) return;
    if (crState.draftId !== d.id) Object.assign(crState, { draftId: d.id, done: false, at: 0 });
    if (crState.done || performance.now() - crState.at < 2000) return;
    crState.at = performance.now();
    if (readCR({ quiet: true })) crState.done = true;
  }

  // ==================================================================== OCR
  let ocr = { worker: null, loading: false, busy: false, last: '', lastAt: 0, failed: false };
  /** Read the text inside a calibrated region ('' if OCR is unavailable). */
  /** Words in a region with their centre x as a fraction of the whole game picture: [{ text, cx }]. */
  async function ocrWords(reg) {
    for (let i = 0; i < 15 && ocr.busy; i++) await new Promise((r) => setTimeout(r, 300)); // wait for another read
    if (ocr.failed || ocr.busy) return [];
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
      return ((data && data.words) || []).map((w) => ({ text: w.text, cx: reg.x + (((w.bbox.x0 + w.bbox.x1) / 2) / cv.width) * reg.w }));
    } catch (e) {
      return [];
    } finally {
      ocr.busy = false;
    }
  }
  async function ocrRegion(reg) {
    if (ocr.failed || ocr.busy) return '';
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
      return (data && data.text) || '';
    } catch (e) {
      console.warn('OCR unavailable:', e);
      ocr.failed = true;
      return '';
    } finally {
      ocr.busy = false;
    }
  }
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
    const reg = regions().oppName;
    if (!c.ocr || !reg || ocr.failed || ocr.busy || App.store.draft.opponent) return;
    if (performance.now() - ocr.lastAt < 2500) return;
    ocr.lastAt = performance.now();
    const name = V.cleanName(await ocrRegion(reg));
    if (name && name === ocr.last) App.setOpponent(name);
    ocr.last = name;
  }

  // ============================================================ calibration
  let calib = null; // { steps, step, regions, frame: canvas, drag }
  const CR_STEPS = [{ key: 'crBar', label: 'the CR (turn order) bar, from its 0% end to its 100% end, as tall/wide as the portraits on it' }];
  const CR_EXP_STEPS = [{ key: 'crBarExpanded', label: 'the EXPANDED CR bar (open it in battle first), from its 0% end to its 100% end, as tall/wide as the portraits' }];
  const RESULT_STEPS = [{ key: 'result', label: 'where VICTORY / DEFEAT is written on the result screen' }];
  function calibrateHelp(pic = null) {
    const n = prompt("How many heroes does the game's drafting help show at once?", String(cfg().helpCount || 5));
    if (!n || !(Number(n) >= 1)) return;
    cfg().helpCount = Math.min(10, Math.round(Number(n)));
    App.save();
    startCalibration(V.GAME_HELP_STEPS, pic && pic.img ? pic : null);
  }

  /** pic (optional): { img, w, h, frameKey } from a saved game picture: calibrate on it instead of the live picture. */
  function startCalibration(steps = V.REGION_STEPS, pic = null) {
    if (!pic && (!source || !frameSize())) {
      alert('Start watching the game (or load a screenshot / saved picture) first, with the draft screen visible.');
      return;
    }
    const f = pic ? { w: pic.w, h: pic.h } : frameSize();
    const cv = $('#calib-canvas');
    cv.width = f.w;
    cv.height = f.h;
    const frame = document.createElement('canvas');
    frame.width = f.w;
    frame.height = f.h;
    frame.getContext('2d').drawImage(pic ? pic.img : source, 0, 0);
    calib = { steps: Array.isArray(steps) ? steps : V.REGION_STEPS, step: 0, regions: LAY ? LAY.effective(cfg().regions, layoutFor(f.w, f.h)) : { ...cfg().regions }, frame, drag: null, preview: false, frameKey: pic ? pic.frameKey : null, layout: layoutFor(f.w, f.h) };
    $('#calib').classList.remove('hidden');
    drawCalib();
    // bring the whole picture into view: a drag that ends off-screen would draw the wrong box
    $('#calib').scrollIntoView({ block: 'start' });
    window.scrollBy(0, -($('.topbar') ? $('.topbar').offsetHeight + 8 : 0));
  }

  function showOverlay() {
    if (!source || !frameSize()) return alert('Start watching or load a screenshot first.');
    startCalibration();
    calib.step = calib.steps.length;
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
    if (calib.regions.crBar) box(calib.regions.crBar, '#3ecf8e', 'CR bar');
    if (calib.regions.crBarExpanded) box(calib.regions.crBarExpanded, '#2fc7c0', 'CR bar (expanded)');
    if (calib.regions.result) box(calib.regions.result, '#f3d36b', 'result');
    for (const h of V.helpSlots(calib.regions, cfg().helpCount)) box(h.rect, '#b07cff', `G${h.index + 1}`);
    for (const k of ['mePickFirst', 'mePickLast', 'oppPickFirst', 'oppPickLast']) if (calib.regions[k] && !V.slotLayout(calib.regions).length) box(calib.regions[k], '#c9a24a');
    if (calib.drag) box(calib.drag.rect, '#c9a24a');
    const step = calib.steps[calib.step];
    $('#calib-title').textContent = calib.preview ? 'Alignment check' : 'Calibration';
    $('#calib-step').textContent = calib.preview
      ? 'Blue = your slots, red = opponent. Boxes should sit on the hero pictures. Press Done, or Back to redraw.'
      : step
        ? `Step ${calib.step + 1}/${calib.steps.length}: drag a box over ${step.label}`
        : 'All set. Press Done to save.';
    $('#calib-skip').classList.toggle('hidden', !(step && step.optional) || calib.preview);
  }

  function canvasPoint(e) {
    const cv = $('#calib-canvas');
    const b = cv.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
  }
  $('#calib-canvas').addEventListener('pointerdown', (e) => {
    if (!calib || calib.preview || calib.step >= calib.steps.length) return;
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
      calib.regions[calib.steps[calib.step].key] = r;
      calib.step++;
    }
    drawCalib();
  });
  /** Close calibration without saving anything. */
  function cancelCalibration() {
    calib = null;
    $('#calib').classList.add('hidden');
    render();
  }
  $('#calib-back').addEventListener('click', () => {
    if (!calib) return;
    if (calib.preview) {
      calib.preview = false;
      calib.step = 0;
    } else if (calib.step > 0) calib.step--;
    else return cancelCalibration(); // Back on the first step closes it
    drawCalib();
  });
  $('#calib-cancel').addEventListener('click', () => calib && cancelCalibration());
  $('#calib-skip').addEventListener('click', () => {
    if (!calib) return;
    delete calib.regions[calib.steps[calib.step].key];
    calib.step++;
    drawCalib();
  });
  $('#calib-done').addEventListener('click', () => {
    if (!calib) return;
    if (calib.steps !== V.REGION_STEPS) {
      cfg().regions = LAY ? LAY.ownOnly(calib.regions, calib.layout) : calib.regions; // CR bar / result / drafting help: just save (only boxes that differ from built-in)
      if (window.GameArea && (calib.frameKey || live)) window.GameArea.markCalibrated('rta', calib.frameKey || source);
      track.clear();
      rebuildSlots();
      App.save();
    } else if (!V.isCalibrated(calib.regions)) {
      if (!confirm('Some required boxes are missing. Close anyway?')) return;
    } else {
      cfg().regions = LAY ? LAY.ownOnly(calib.regions, calib.layout) : calib.regions;
      if (window.GameArea && (calib.frameKey || live)) window.GameArea.markCalibrated('rta', calib.frameKey || source);
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
    if (F && t.faces && faceBase(t.faces) >= 0) {
      // round icon: also remember the face itself, so the face matcher knows this hero's in-game picture
      const c = cfg();
      c.faceCorrections = c.faceCorrections || [];
      c.faceCorrections.push({ code: h.code, q: F.quantize(t.faces[faceBase(t.faces)].vec), at: new Date().toISOString() });
      const mine = c.faceCorrections.filter((x) => x.code === h.code);
      if (mine.length > MAX_CORRECTIONS_PER_HERO) c.faceCorrections.splice(c.faceCorrections.indexOf(mine[0]), 1);
      rebuildLearned();
      App.save();
    }
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

  // ================================================================ overlay
  /*
   * Layer 'rta' for the overlay: the top suggestions right next to the slot
   * that is being filled, and scouted speeds under the enemy's heroes.
   */
  function postOverlay() {
    const O = window.E7Overlay;
    if (!O || !slots.length) return;
    const d = App.store.draft;
    const step = L.currentStep(d);
    const v = L.draftView(d);
    const items = [];
    if (step) {
      const ctx = App.suggestionContext();
      let list = [];
      if (step.phase === 'preban' && step.player === 'me') list = L.suggestPrebans(d, App.cache.heroes, ctx, 3);
      else if (step.phase === 'pick') list = L.suggestPicks(d, App.cache.heroes, ctx, 3);
      else if (step.phase === 'postban') list = L.suggestPostban(d, App.cache.heroes, ctx, step.player).slice(0, 3);
      const kind = step.phase === 'postban' ? 'pick' : step.phase;
      const side = step.phase === 'postban' ? (step.player === 'me' ? 'opp' : 'me') : step.player;
      const idx = step.phase === 'preban' ? v.prebans[side].length : step.phase === 'pick' ? v.picks[side].length : 0;
      const slot = slots.find((s) => s.side === side && s.kind === kind && s.index === Math.min(idx, kind === 'pick' ? 4 : 1)) || slots.find((s) => s.side === side);
      if (slot && list.length) {
        const who = step.player === 'me' ? 'Your' : 'Their likely';
        items.push({
          ...slot.rect,
          kind: 'card',
          side: side === 'me' ? 'right' : 'left',
          title: `${who} ${step.phase}: ${list.map((x) => x.hero.name).join(' · ')}`,
          lines: (list[0].reasons || []).slice(0, 2).map((r) => `${list[0].hero.name}: ${r.text}`),
        });
      }
    }
    // scouted speeds under each enemy pick
    v.picks.opp.forEach((code, i) => {
      const slot = slots.find((s) => s.side === 'opp' && s.kind === 'pick' && s.index === i);
      const seen = App.scoutedSpeed(code, d.opponent);
      const e = App.store.scouting.find((x) => x.draftId === d.id && x.code === code);
      const sp = (e && e.speed) || (seen && seen.speed);
      if (slot && sp) items.push({ ...slot.rect, kind: 'label', side: 'left', title: `~${Math.round(sp)} spd` });
    });
    O.post('rta', items);
  }
  App.onDraftRender(postOverlay);

  // ======================================================== screen teaching
  function renderScreenInfo() {
    const SW = window.E7Screens;
    const el = $('#auto-screen');
    if (!SW || !el) return;
    const cur = SW.current();
    const counts = {};
    for (const r of SW.refs()) counts[r.screen] = (counts[r.screen] || 0) + 1;
    el.innerHTML = `Screen now: <b>${cur ? App.esc(SW.label(cur)) : 'not recognised'}</b> · taught: ${
      SW.SCREENS.filter((x) => x.module === 'rta')
        .map((x) => `${App.esc(x.label)} ${counts[x.id] ? `✓${counts[x.id]}` : '—'}`)
        .join(' · ')
    }`;
  }
  $('#auto-teach').addEventListener('click', () => {
    if (!source || !frameSize()) return alert('Start watching (or load a screenshot) first, with that screen showing.');
    const id = $('#auto-teach-screen').value;
    window.E7Screens.teach(source, id);
    renderScreenInfo();
  });
  $('#auto-forget').addEventListener('click', () => {
    const id = $('#auto-teach-screen').value;
    if (confirm(`Forget what "${window.E7Screens.label(id)}" looks like?`)) window.E7Screens.forget(id);
    renderScreenInfo();
  });

  // ================================================================= render
  let lastLogged = '';
  function setStatus(text) {
    // the diagnostic log keeps status changes (not the many "Watching · n checks/s" updates)
    const key = String(text).replace(/\d+(\.\d+)? checks\/s/, '').replace(/\d+\/\d+…/, '');
    if (window.E7Diag && key !== lastLogged) {
      lastLogged = key;
      if (!/^Loading hero portraits/.test(text)) window.E7Diag.log('rta', 'status: ' + text);
    }
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
        .map((s) => `<button class="aslot ${s.side}" data-slot="${s.id}"><canvas width="44" height="44"></canvas><div><div class="t">${s.side === 'me' ? 'Me' : s.side === 'opp' ? 'Opp' : 'Game help'} ${s.kind === 'rec' ? '#' : s.kind + ' '}${s.index + 1}</div><div class="h">—</div><div class="t sc"></div></div></button>`)
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

  // ============================================================ what the reader knows (status table)
  const STATE_LABEL = { mine: 'Yours', 'built-in': 'Built-in', mixed: 'Built-in + yours', missing: 'Not set' };
  const PART_STEPS = () => ({ draft: V.REGION_STEPS.filter((x) => x.key !== 'oppName'), oppName: V.REGION_STEPS.filter((x) => x.key === 'oppName'), cr: CR_STEPS, crx: CR_EXP_STEPS, result: RESULT_STEPS });
  function renderLayout() {
    if (!LAY || !$('#auto-layout')) return;
    const f = frameSize();
    const lay = f ? layout() : LAY.LAYOUTS[0];
    $('#auto-layout-head').innerHTML = !f
      ? 'Steam client in a 16:9 window: the draft screen and Victory/Defeat work <b>without drawing anything</b> (built-in positions). Other shapes (e.g. an emulator with a side toolbar): draw the boxes once on a saved picture.'
      : lay
        ? `Game picture ${f.w}×${f.h} (16:9): <b>built-in positions in use</b>. Nothing to set up unless a box is off (press <b>Check</b>).`
        : `Game picture ${f.w}×${f.h} is not 16:9, so the built-in positions don't fit. Draw the draft boxes once ("Redo" below or "Calibrate on a saved picture"); they're kept for every later game.`;
    const own = cfg().regions || {};
    $('#auto-layout').innerHTML = LAY.status(own, lay)
      .map((p) => {
        const builtAll = lay && p.keys.every((k) => lay.regions[k]);
        const state = p.state === 'missing' && p.optional ? 'Not set (optional)' : STATE_LABEL[p.state];
        return `<tr><td>${esc(p.label)}</td><td><span class="lay-${p.state}">${esc(state)}</span></td><td class="btn-row">
          <button class="btn" data-lay-check="${p.id}">Check</button>
          <button class="btn" data-lay-redo="${p.id}">${p.state === 'missing' ? 'Set' : 'Redo'}</button>
          ${builtAll && (p.state === 'mine' || p.state === 'mixed') ? `<button class="btn" data-lay-reset="${p.id}">Use built-in</button>` : ''}</td></tr>`;
      })
      .join('');
  }
  async function newestPicture() {
    const list = window.E7Pictures ? await window.E7Pictures.list() : [];
    if (!list.length) return null;
    const p = list[0];
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = p.url;
    });
    return { img, w: p.w, h: p.h, frameKey: p.frameKey };
  }
  async function checkAlignment() {
    const pic = source && frameSize() ? null : await newestPicture();
    if (!pic && !(source && frameSize())) return alert('Nothing to show the boxes on yet: start watching, load a screenshot, or save a game picture first.');
    startCalibration(V.REGION_STEPS, pic);
    if (!calib) return;
    calib.step = calib.steps.length;
    calib.preview = true;
    drawCalib();
  }
  $('#auto-layout').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.layCheck) return checkAlignment();
    if (b.dataset.layRedo) {
      const id = b.dataset.layRedo;
      if (!(source && frameSize())) return pickPicture(); // no live picture: choose a saved one, then the part
      if (id === 'help') return calibrateHelp();
      return startCalibration(PART_STEPS()[id]);
    }
    if (b.dataset.layReset) {
      const part = LAY.PARTS.find((x) => x.id === b.dataset.layReset);
      if (!confirm(`Forget your boxes for "${part.label}" and use the built-in positions?`)) return;
      const own = { ...cfg().regions };
      for (const k of part.keys) delete own[k];
      cfg().regions = own;
      track.clear();
      rebuildSlots();
      App.save();
      render();
    }
  });

  function render() {
    renderLayout();
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
    $('#auto-postban').checked = c.detectPostban;
    $('#auto-result').checked = c.detectResult;
    $('#auto-cr').checked = c.autoReadCR;
    $('#auto-cr-end').value = c.crEnd || 'auto';
    if (!slots.length) rebuildSlots();
    renderScreenInfo();
    renderTemplateInfo();
    renderSlots();
  }

  // ================================================================ wiring
  $('#auto-start').addEventListener('click', startCapture);
  $('#auto-stop').addEventListener('click', stopCapture);
  $('#auto-calibrate').addEventListener('click', () => startCalibration());
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
  bind('#auto-postban', 'detectPostban', (el) => el.checked);
  bind('#auto-result', 'detectResult', (el) => el.checked);
  bind('#auto-cr', 'autoReadCR', (el) => el.checked);
  bind('#auto-cr-end', 'crEnd', (el) => el.value);
  $('#auto-calib-cr').addEventListener('click', () => startCalibration(CR_STEPS));
  $('#auto-calib-cr-exp').addEventListener('click', () => startCalibration(CR_EXP_STEPS));
  $('#auto-calib-result').addEventListener('click', () => startCalibration(RESULT_STEPS));
  $('#auto-read-teams').addEventListener('click', () => scanCRTeams());
  $('#auto-read-cr').addEventListener('click', () => readCR());
  $('#auto-calib-help').addEventListener('click', () => calibrateHelp());
  const clearSrc = (src, label) => () => {
    if (!confirm(`Delete all ${label}?`)) return;
    cfg().corrections = cfg().corrections.filter((c) => c.source !== src);
    if (src === 'my corrections') cfg().faceCorrections = []; // face-matcher copies of your corrections
    rebuildLearned();
    App.save();
    render();
  };
  $('#auto-clear-learned').addEventListener('click', clearSrc('auto-learned', 'auto-learned examples'));
  $('#auto-clear-corr').addEventListener('click', clearSrc('my corrections', 'of your corrections'));

  // ============================================================ follow the game watcher (DEVLOG #28, step 1b part 1)
  // Desktop app: the game watcher (hidden window) decides what's watched. The RTA reader starts by itself whenever the
  // watcher is watching (same game window, same title-bar cut, no picker) and stops when it stops. Pressing Stop here
  // keeps it stopped until Start. Browser: a page can't start a capture without a click, so it stays one click.
  const VC = window.VisionClient;
  let followed = false;
  let userStopped = false;
  function followWatcher(s) {
    if (!VC || !VC.desktop) return;
    const watching = VC.alive() && s && s.watching;
    const screenshotMode = source && !live;
    if (watching && !stream && !capturing && !userStopped && !screenshotMode) {
      followed = true;
      setStatus(`Following the game watcher ("${s.name}")…`);
      startCapture();
    } else if (!watching && followed && stream) {
      followed = false;
      stopCapture();
      setStatus('The game watcher stopped, so the RTA reader stopped too.');
    }
  }
  if (VC) VC.onStatus(followWatcher);
  $('#auto-start').addEventListener('click', () => (userStopped = false));
  $('#auto-stop').addEventListener('click', () => {
    userStopped = true;
    followed = false;
  });
  if (VC && VC.desktop) $('#auto-start').title = 'Starts by itself while the game watcher is watching (Game window menu)';

  if (window.E7Diag) {
    window.E7Diag.provider('RTA reader (this page)', () => {
      const f = frameSize();
      const rr = (x) => (x ? [x.x, x.y, x.w, x.h].map((v) => Math.round(v)) : null);
      const nm = (x) => (x ? `${App.nameOf(x.code)} ${(+x.sim).toFixed(3)} [${x.source}]` : '-');
      const lines = [
        `source: ${source ? (live ? 'live' : 'screenshot') : 'none'} ${f ? `${f.w}×${f.h}` : ''} · built-in layout: ${layout() ? layout().id : 'none (not 16:9)'} · draft taught: ${draftTaught()} · draft last seen: ${draftSeenAt > 0 ? Math.round((performance.now() - draftSeenAt) / 1000) + ' s ago' : 'never'}`,
        `portraits loaded: ${officialLoad.done}/${officialLoad.total} (failed ${officialLoad.failed}) · face templates: ${templates.faces.length} (+${templates.faceLearned.length} yours)`,
        `board: ${boardSummary()}`,
      ];
      for (const sl of slots) {
        const t = track.get(sl.id) || {};
        const r = t.result;
        lines.push(`${sl.id}: ${t.badges ? `[badges: ${t.badges.element || '-'} / ${t.badges.role || '-'}] ` : ''}${t.confirmed ? 'CONFIRMED ' + nm(t.confirmed) : 'not confirmed'} · now ${r ? (r.empty ? 'empty' : `${nm(r.best)} / 2nd ${nm(r.second)}${'sure' in r ? (r.sure ? ' (sure)' : ' (unsure)') : ''}`) : '-'} · box px ${JSON.stringify(f ? rr(pxRect(sl.rect)) : null)}`);
      }
      return lines;
    });
  }

  window.RTAAuto = { _scanCRTeams: scanCRTeams, _openLabel: openLabel, _onMatchStart: onMatchStart, _readFirstPick: readFirstPick, _pickerPrebans: () => pickerPrebans, render, tick, board, readCR, isWatching: () => !!timer, _track: track, _templates: templates, _officialLoad: officialLoad };
  rebuildSlots();
})();
