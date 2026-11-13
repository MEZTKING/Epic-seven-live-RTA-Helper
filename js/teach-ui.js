/*
 * Live → Teach heroes (DEVLOG #35): open any picture, drag a square around a round hero icon, type the name, Add.
 * Examples are stored by js/teach.js ('e7-face-examples', source 'taught by you') and used by the RTA reader and the
 * Guild War defense reader. The guess shown for a box uses the official portraits + every example you have, so you
 * can see whether the app already knows that face (and, after Add, that it does now).
 * Test hooks: window.E7TeachUI = { open(img, from), box(rect), add(name), ready() }.
 */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const T = window.E7Teach;
  const F = window.RTAFaces;
  const R = window.RTARoster;
  if (!T || !F || !R || !$('#teach')) return;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const HEROES = (window.RTASources && window.RTASources.officialSnapshot && window.RTASources.officialSnapshot.heroes) || [];
  const NAME = new Map(HEROES.map((h) => [h.code, h.name]));
  const nameOf = (code) => NAME.get(code) || code;
  const byName = new Map(HEROES.map((h) => [h.name.toLowerCase(), h.code]));

  // ---- official portraits (once, in the background; the same CORS-safe URLs as the readers)
  const official = new Map(); // code -> vec
  let loading = null;
  function loadOfficial() {
    if (loading) return loading;
    loading = new Promise((done) => {
      let i = 0;
      let active = 0;
      const next = () => {
        if (i >= HEROES.length) {
          if (!active) done();
          return;
        }
        const h = HEROES[i++];
        active++;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            official.set(h.code, F.fromPortrait(img));
          } catch (_) { /* unreadable: skipped */ }
          active--;
          showGuess();
          next();
        };
        img.onerror = () => {
          active--;
          next();
        };
        img.src = R.PORTRAIT_URL_CORS(h.code);
      };
      for (let k = 0; k < 12; k++) next();
    });
    return loading;
  }
  const allTemplates = () => {
    const out = [...official.entries()].map(([code, vec]) => ({ code, vec, source: 'official' }));
    try {
      for (const c of JSON.parse(localStorage.getItem('e7-gw-face-corrections') || '[]') || []) out.push({ code: c.code, vec: F.dequantize(c.q), source: 'Guild War corrections' });
    } catch (_) { /* none */ }
    const rta = readRTA();
    for (const c of rta.faceCorrections || []) out.push({ code: c.code, vec: F.dequantize(c.q), source: 'RTA corrections' });
    out.push(...T.templates(F));
    return out;
  };
  function readRTA() {
    try {
      return (JSON.parse(localStorage.getItem('rta-helper-v2') || '{}') || {}).auto || {};
    } catch (_) {
      return {};
    }
  }

  // ---- the picture and the box
  const cv = $('#teach-canvas');
  const cx = cv.getContext('2d');
  let img = null;
  let from = '';
  let box = null; // in picture pixels
  let faces = null;
  function open(source, label) {
    img = source;
    from = label || 'a picture';
    box = null;
    faces = null;
    cv.width = source.naturalWidth || source.width;
    cv.height = source.naturalHeight || source.height;
    $('#teach-work').classList.remove('hidden');
    $('#teach-msg').textContent = '';
    draw();
    showGuess();
    loadOfficial();
  }
  function draw() {
    if (!img) return;
    cx.drawImage(img, 0, 0, cv.width, cv.height);
    if (box) {
      cx.lineWidth = Math.max(2, cv.width / 400);
      cx.strokeStyle = '#ffd34d';
      cx.strokeRect(box.x, box.y, box.w, box.h);
    }
    const cc = $('#teach-crop').getContext('2d');
    cc.clearRect(0, 0, 96, 96);
    if (box) cc.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, 96, 96);
  }
  function setBox(r) {
    if (!img || !r || r.w < 8 || r.h < 8) return;
    box = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
    faces = F.fromRect(img, box, F.WIDE_VARIANTS); // wide search: the box can be a little off
    $('#teach-add').disabled = false;
    draw();
    showGuess();
    $('#teach-name').focus();
  }
  function showGuess() {
    const el = $('#teach-guess');
    if (!faces) {
      el.textContent = img ? 'No box yet.' : '';
      return;
    }
    if (official.size < HEROES.length * 0.8) {
      el.textContent = `Loading hero portraits ${official.size}/${HEROES.length}…`;
      return;
    }
    const r = F.classify(faces, allTemplates(), { preferSource: ['my corrections', 'taught by you'] });
    if (r.empty || !r.best) {
      el.textContent = 'This box looks empty.';
      return;
    }
    const sure = F.isConfident(r);
    el.innerHTML = `${sure ? 'The app recognises this as' : 'Best guess (not sure)'}: <b>${esc(nameOf(r.best.code))}</b> ` + // (scores shown capped at 1.00: your own examples get a small bonus)
      `<span class="small">${Math.min(1, r.best.score).toFixed(2)}, ${esc(r.best.source)}${r.second ? ` · next: ${esc(nameOf(r.second.code))} ${r.second.score.toFixed(2)}` : ''}</span>` +
      (sure ? '' : '<br><span class="small">Type the right name and press Add to teach it.</span>');
    if (!$('#teach-name').value && sure) $('#teach-name').placeholder = nameOf(r.best.code);
  }

  // drag a square (mouse, pen or touch)
  let start = null;
  const toPic = (e) => {
    const b = cv.getBoundingClientRect();
    return { x: ((e.clientX - b.left) / b.width) * cv.width, y: ((e.clientY - b.top) / b.height) * cv.height };
  };
  const square = (a, b) => {
    const s = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    return { x: b.x < a.x ? a.x - s : a.x, y: b.y < a.y ? a.y - s : a.y, w: s, h: s };
  };
  cv.addEventListener('pointerdown', (e) => {
    if (!img) return;
    start = toPic(e);
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!start) return;
    const r = square(start, toPic(e));
    draw();
    cx.lineWidth = Math.max(2, cv.width / 400);
    cx.strokeStyle = '#7fd0ff';
    cx.strokeRect(r.x, r.y, r.w, r.h);
  });
  cv.addEventListener('pointerup', (e) => {
    if (!start) return;
    const r = square(start, toPic(e));
    start = null;
    if (r.w >= 8) setBox(r);
    else draw();
  });

  // ---- Add: align the face to that hero's portrait (best of the small shifts), keep a thumbnail
  const codeFor = (text) => {
    const t = String(text || '').trim().toLowerCase();
    if (!t) return null;
    if (byName.has(t)) return byName.get(t);
    const hits = HEROES.filter((h) => h.name.toLowerCase().includes(t));
    return hits.length === 1 ? hits[0].code : null;
  };
  function add(nameText) {
    const msg = $('#teach-msg');
    if (!faces || !box) return (msg.textContent = 'Drag a square around a hero icon first.'), null;
    const typed = nameText !== undefined ? nameText : $('#teach-name').value || $('#teach-name').placeholder;
    const code = codeFor(typed);
    if (!code) return (msg.textContent = `"${typed}" isn't a hero name I know. Pick one from the list.`), null;
    const ref = official.get(code);
    let best = F.WIDE_VARIANTS.findIndex((v) => Math.abs(v.k - 1.04) < 0.01 && v.dx === 0 && v.dy === 0);
    if (ref) {
      let s = -2;
      faces.forEach((f, i) => {
        if (f.energy < 6) return;
        let d = 0;
        for (let k = 0; k < ref.length; k++) d += f.vec[k] * ref[k];
        if (d > s) (s = d), (best = i);
      });
    }
    const th = document.createElement('canvas');
    th.width = th.height = 48;
    th.getContext('2d').drawImage(img, box.x, box.y, box.w, box.h, 0, 0, 48, 48);
    const ex = T.add({ code, q: F.quantize(faces[best].vec), thumb: th.toDataURL('image/jpeg', 0.7), from });
    msg.textContent = `Learned: ${nameOf(code)}. Box the next hero, or close the picture.`;
    $('#teach-name').value = '';
    $('#teach-name').placeholder = 'Hero name';
    showGuess();
    if (window.E7Diag) window.E7Diag.log('teach', `taught ${nameOf(code)}`, { from });
    return ex;
  }
  $('#teach-add').addEventListener('click', () => add());
  $('#teach-name').addEventListener('keydown', (e) => e.key === 'Enter' && add());
  $('#teach-close').addEventListener('click', () => {
    img = null;
    box = null;
    faces = null;
    $('#teach-work').classList.add('hidden');
  });
  $('#teach-heroes').innerHTML = HEROES.map((h) => `<option value="${esc(h.name)}"></option>`).join('');

  // ---- open pictures: file, saved game pictures, paste
  const fromURL = (url, label) => {
    const im = new Image();
    im.onload = () => open(im, label);
    im.src = url;
  };
  $('#teach-file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) fromURL(URL.createObjectURL(f), f.name);
    e.target.value = '';
  });
  async function fillPictures() {
    const sel = $('#teach-pics');
    if (!window.E7Pictures) return sel.classList.add('hidden');
    const list = await window.E7Pictures.list().catch(() => []);
    sel.innerHTML = `<option value="">Saved game pictures (${list.length})…</option>` + list.map((p) => `<option value="${esc(p.id)}">${esc(new Date(p.at || Date.now()).toLocaleString())}${p.note ? ` · ${esc(p.note)}` : ''}</option>`).join('');
  }
  $('#teach-pics').addEventListener('focus', fillPictures);
  $('#teach-pics').addEventListener('change', async (e) => {
    const id = e.target.value;
    if (!id) return;
    const list = await window.E7Pictures.list();
    const p = list.find((x) => String(x.id) === id);
    if (p) fromURL(p.url, `saved picture ${new Date(p.at || Date.now()).toLocaleString()}`);
    e.target.value = '';
  });
  document.addEventListener('paste', (e) => {
    const it = [...((e.clipboardData && e.clipboardData.items) || [])].find((x) => x.type.startsWith('image/'));
    if (!it || /input|textarea/i.test((document.activeElement || {}).tagName || '')) return;
    fromURL(URL.createObjectURL(it.getAsFile()), 'pasted picture');
    $('#teach').scrollIntoView({ behavior: 'smooth' });
  });

  // ---- switch, export / import
  $('#teach-on').checked = T.enabled();
  $('#teach-on').addEventListener('change', (e) => T.setEnabled(e.target.checked));
  $('#teach-export').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([T.exportJSON()], { type: 'application/json' }));
    a.download = `epic7-engine-taught-faces-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });
  $('#teach-import').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      alert(`Added ${T.importJSON(await f.text())} example(s).`);
    } catch (err) {
      alert(`Couldn't import: ${err.message}`);
    }
  });

  // ---- library
  function render() {
    const groups = [...T.byHero().entries()].sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0])));
    const n = T.list().length;
    $('#teach-count').textContent = n ? `(${n} example${n === 1 ? '' : 's'} of ${groups.length} hero${groups.length === 1 ? '' : 'es'}${T.enabled() ? '' : ', switched off'})` : '';
    $('#teach-lib').innerHTML = groups.length
      ? groups.map(([code, list]) => `<div class="teach-hero"><b>${esc(nameOf(code))}</b>${list.map((x) => `<span class="teach-ex" title="${esc(x.from)} · ${esc(new Date(x.at).toLocaleString())}">${x.thumb ? `<img src="${esc(x.thumb)}" alt="" />` : '<img alt="" />'}<button class="btn" data-forget="${esc(x.id)}" title="Forget this example">×</button></span>`).join('')}</div>`).join('')
      : '<p class="hint">Nothing yet.</p>';
    $('#teach-on').checked = T.enabled();
    const rta = readRTA();
    let gw = [];
    try {
      gw = JSON.parse(localStorage.getItem('e7-gw-face-corrections') || '[]') || [];
    } catch (_) { /* none */ }
    $('#teach-other').innerHTML =
      `<li>RTA reader, names you gave on draft pictures: ${(rta.faceCorrections || []).length} face(s), ${(rta.corrections || []).filter((c) => c.source === 'my corrections').length} banner(s) · manage on RTA → Auto</li>` +
      `<li>Guild War page, names you gave for defense icons: ${gw.length} ${gw.length ? '<button class="btn" id="teach-gw-forget">Forget them</button>' : ''}</li>`;
  }
  $('#teach-lib').addEventListener('click', (e) => {
    const b = e.target.closest('[data-forget]');
    if (b) T.remove(b.dataset.forget);
  });
  $('#teach-other').addEventListener('click', (e) => {
    if (e.target.id === 'teach-gw-forget' && confirm('Forget the Guild War icon names you gave?')) {
      localStorage.removeItem('e7-gw-face-corrections');
      render();
    }
  });
  T.onChange(() => {
    render();
    showGuess();
  });
  addEventListener('storage', (e) => (e.key === 'e7-gw-face-corrections' || e.key === 'rta-helper-v2') && render());
  render();

  window.E7TeachUI = { open, box: setBox, add, ready: () => official.size >= HEROES.length * 0.8, load: loadOfficial };
})();
