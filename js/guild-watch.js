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
  const C = window.VisionClient;
  const bus = window.E7Bus;
  let last = { name: null, n: 0 };
  let lastRect = null;

  const box = () => A.conn.watchBox || null;
  const watching = () => {
    const s = C.status();
    return C.alive() && !!(s && s.watching);
  };
  function update() {
    $('#gw-watch').textContent = watching() ? 'Stop watching' : 'Watch game';
    renderScreen();
    postOverlay();
    if (window.GuildPip) window.GuildPip.render();
  }
  C.onStatus(() => {
    $('#gw-watch').textContent = watching() ? 'Stop watching' : 'Watch game';
    renderScreen();
  });

  // --- one box: where the enemy's name is shown in game
  async function calibrate() {
    let snap;
    try {
      snap = await C.snapshot();
    } catch (e) {
      return alert(`Start "Watch game" first, with an enemy profile or defense showing. (${e.message})`);
    }
    const cv = $('#gw-calib-canvas');
    cv.width = snap.w;
    cv.height = snap.h;
    const ctx = cv.getContext('2d');
    const frame = snap.img;
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
      if (window.GameArea) window.GameArea.markCalibrated('guild', snap.frameKey);
      A.saveConn();
      $('#gw-calib').close();
    };
    $('#gw-calib-cancel').onclick = () => $('#gw-calib').close();
    draw();
    $('#gw-calib').showModal();
  }

  /** The game watcher read text in the name box (js/vision/readers/guild-name.js). */
  let lastRaw = '';
  function onNameRead(d) {
    if (d.text) lastRaw = d.text.replace(/[^\p{L}\p{N}_#.\- ]/gu, '').trim();
    if (d.away) {
      last = { name: null, n: 0 };
      lastRect = null;
      if (window.E7Overlay) window.E7Overlay.clear('guild');
      $('#gw-watch-read').textContent = '';
      return;
    }
    lastRect = d.rect || box();
    const known = [...new Set(A.state.targets.map((t) => t.player).filter(Boolean))];
    const name = GW.matchPlayer(d.text, known);
    // same name twice in a row before switching (avoids flicker while screens change)
    if (name && name === last.name) last.n++;
    else last = { name, n: 1 };
    if (name && last.n >= 2) A.setCurrent(name);
    $('#gw-watch-read').textContent = name ? `Seeing: ${name}` : d.text ? `Read "${d.text.slice(0, 24)}" (not a known player)` : 'No name visible';
    postOverlay();
  }
  bus.on('guild:name-read', onNameRead);
  // the enemy's defense teams seen on screen (js/vision/readers/guild-defense.js)
  let seenDefense = null;
  bus.on('guild:defense', (d) => {
    seenDefense = d;
    renderSeen();
  });
  function renderSeen() {
    const el = $('#gw-seen');
    if (!el) return;
    if (!seenDefense) return el.classList.add('hidden');
    const player = (A.current && A.current()) || last.name || lastRaw || '';
    const team = (t) => t.map((x) => (x && x.sure ? A.esc(A.nameOf(x.code)) : '<span class="hint">?</span>')).join(', ');
    el.innerHTML = `<b>Seen in game${player ? ` · ${A.esc(player)}` : ''}:</b> Round 1: ${team(seenDefense.teams[0])} · Round 2: ${team(seenDefense.teams[1])}
      <button class="btn primary" id="gw-seen-save">Save as ${player ? A.esc(player) + "'s" : 'this enemy\'s'} defense</button>
      <span class="hint">“?” = not sure: type those heroes in; the app remembers them for next time.</span>`;
    el.classList.remove('hidden');
    $('#gw-seen-save').onclick = () => A.openTargetWith({ player, teams: seenDefense.teams });
  }
  // a fortress map seen in game (js/vision/readers/guild-fortress.js): its defenders, editable, saved into this war
  let seenFort = null;
  bus.on('guild:fortress', (d) => {
    seenFort = d;
    renderFort();
  });
  function renderFort() {
    const el = $('#gw-fort-seen');
    if (!el) return;
    if (!seenFort) return el.classList.add('hidden');
    const list = [...seenFort.players, ...(seenFort.keep ? [seenFort.keep] : [])];
    el.innerHTML = `<b>Seen in game: ${A.esc(seenFort.fort)}</b> <span class="hint">${list.length} defenders · check the names (✓ = a name you already have), then save</span>
      <div class="gw-fort-names">${list
        .map((p, i) => `<label class="gw-fort-name"><input data-fort-i="${i}" value="${A.esc(p.name || '')}" placeholder="(not read)" />${p.known ? ' ✓' : ''}${p.keep ? ' <span class="hint">keep</span>' : ''}</label>`)
        .join('')}</div>
      <button class="btn primary" id="gw-fort-save">Save as this war's ${A.esc(seenFort.fort)}</button> <span id="gw-fort-msg" class="hint"></span>`;
    el.classList.remove('hidden');
    $('#gw-fort-save').onclick = async () => {
      const players = list.map((p, i) => ({ ...p, name: el.querySelector(`[data-fort-i="${i}"]`).value.trim() }));
      try {
        const r = await A.saveFortress(seenFort.fort, players);
        $('#gw-fort-msg').textContent = `Saved: ${r.added} new, ${r.moved} moved here, ${r.same} already there.`;
      } catch (e) {
        $('#gw-fort-msg').textContent = e.message;
      }
    };
  }
  bus.on('vision:warning', (d) => d.module === 'guild' && ($('#gw-watch-read').textContent = '⚠ ' + d.text));

  // ----------------------------------------------------- overlay layer 'guild'
  /** Card next to the enemy's name in game: their dot, each team's verdict and your counter. */
  function postOverlay() {
    const O = window.E7Overlay;
    const r = lastRect || box();
    if (!O || !r) return;
    const t = A.current() ? A.targetFor(A.current()) : null;
    if (!t || !watching() || !lastRect) return O.clear('guild');
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
    el.textContent = `${C.line()} · ${box() ? 'name box set' : 'name box not set'} · ${n ? `enemy screen taught (${n})` : 'tip: teach the enemy screen so names are only read there'}`;
  }
  $('#gw-teach').addEventListener('click', () =>
    C.teach('gw-enemy')
      .then(renderScreen)
      .catch((e) => alert('Could not teach: ' + e.message)),
  );

  $('#gw-watch').addEventListener('click', () => {
    if (watching()) C.stop().catch(() => {});
    else
      C.ensure()
        .then(() => {})
        .catch((e) => ($('#gw-watch-read').textContent = e.message));
  });
  $('#gw-watch-box').addEventListener('click', calibrate);
  update();
  window.GuildWatch = { calibrate, isWatching: watching, onNameRead };
})();
