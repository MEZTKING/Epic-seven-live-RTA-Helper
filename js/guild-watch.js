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
  let lastPicOfName = ''; // the name as the game shows it (for names in a script the user cannot type)
  function onNameRead(d) {
    if (d.text) lastRaw = d.text.replace(/[^\p{L}\p{N}_#.\- ]/gu, '').trim();
    lastPicOfName = d.pic || '';
    if (d.away) {
      last = { name: null, n: 0 };
      lastRect = null;
      if (window.E7Overlay) window.E7Overlay.clear('guild');
      $('#gw-watch-read').textContent = '';
      return;
    }
    lastRect = d.rect || box();
    const known = [...new Set(A.state.targets.map((t) => t.player).filter(Boolean))];
    // what was read, then the other readings / close official spellings of it (js/vision/names.js)
    let name = GW.matchPlayer(d.text, known);
    for (const o of d.options || []) name = name || GW.matchPlayer(o, known);
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
    // saved for this player in this war, and not what the game shows now: they changed their defense (DEVLOG #56)
    const saved = player && A.targetFor ? A.targetFor(player) : null;
    const changes = saved && saved.warId === A.warId ? GW.defenseChange(saved, seenDefense.teams) : [];
    const changed = changes.length ? `<div class="ins warn"><b>Changed since it was saved:</b> ${changes.map((c) => `Round ${c.team} was ${A.esc(c.was.map(A.nameOf).join(', '))}`).join(' · ')}</div>` : '';
    const pic = lastPicOfName && !last.name ? `<img class="gw-fort-pic" style="vertical-align:middle" src="${lastPicOfName}" alt="the name as the game shows it" /> ` : '';
    el.innerHTML = `${changed}<b>Seen in game${player ? ` · ${pic}${A.esc(player)}` : ''}:</b> Round 1: ${team(seenDefense.teams[0])} · Round 2: ${team(seenDefense.teams[1])}
      <button class="btn primary" id="gw-seen-save">${changes.length ? 'Update' : 'Save as'} ${player ? A.esc(player) + "'s" : 'this enemy\'s'} defense</button>
      <span class="hint">“?” = not sure: type those heroes in; the app remembers them for next time.</span>`;
    el.classList.remove('hidden');
    $('#gw-seen-save').onclick = () => A.openTargetWith({ player, teams: seenDefense.teams });
  }
  // fortress names read on the overview (js/vision/readers/guild-overview.js): kept on the current war, shared
  // ...and the enemy guild's name: pick that war or start it (DEVLOG #40), then keep the fortress names on it
  async function applyForts(d) {
    if (!d) return;
    try {
      // (both guild names must have been read: one name alone is not proof of a real overview; DEVLOG #55)
      if (d.enemyGuild && d.ourGuild !== '' && A.warFromGame) await A.warFromGame(d.enemyGuild);
      if (d.side && Array.isArray(d.names) && A.saveFortNames) await A.saveFortNames(d.side, d.names, d.enemyGuild);
      if (d.enemyGuild && d.endsAt && A.warEndsFromGame) await A.warEndsFromGame(d.enemyGuild, d.endsAt, d.enemyServer || '');
    } catch (_) { /* shown by the page's own status line */ }
  }
  bus.on('guild:forts', applyForts);
  // the overview may have been read before this page opened (or in another window): use the stored reading
  const stored = () => {
    try {
      const v = JSON.parse(localStorage.getItem('e7-gw-forts') || 'null');
      // only a recent reading (a war lasts days; an old reading may be last war's)
      return v && v.at && v.enemyGuild && Date.now() - Date.parse(v.at) < 12 * 3600 * 1000 ? { side: v.side, names: v[v.side], enemyGuild: v.enemyGuild, ourGuild: v.ourGuild || '' } : null;
    } catch (_) {
      return null;
    }
  };
  // the standby page (js/vision/readers/guild-standby.js): no war running. Said on the War tab; an open war is
  // marked finished (with Undo). A stored reading counts when it is newer than the last overview reading.
  bus.on('guild:standby', (d) => A.standbyFromGame && A.standbyFromGame(d).catch(() => {}));
  const storedStandby = () => {
    try {
      const v = JSON.parse(localStorage.getItem('e7-gw-standby') || 'null');
      return v && v.at && Date.now() - Date.parse(v.at) < 12 * 3600 * 1000 ? v : null;
    } catch (_) {
      return null;
    }
  };
  // (the page waits for the guild's records itself; live readings arrive on the bus, so no storage listener: that
  // delivered every reading twice and could start the same war twice)
  const sb = storedStandby();
  let fortsAt = '';
  try {
    fortsAt = (JSON.parse(localStorage.getItem('e7-gw-forts') || 'null') || {}).at || '';
  } catch (_) { /* none */ }
  // whichever the game showed last wins: the standby page (the war is over) or an overview (a war is on)
  if (sb && sb.at > fortsAt) {
    if (A.standbyFromGame) A.standbyFromGame(sb, sb.at).catch(() => {});
  } else applyForts(stored());
  // a fortress map seen in game (js/vision/readers/guild-fortress.js): its defenders, editable, saved into this war
  let seenFort = null;
  bus.on('guild:fortress', (d) => {
    seenFort = d;
    renderFort();
    // enemy defenders the app already has: beaten / still standing straight from their badges (no button)
    if (d && d.side !== 'ours' && A.markBeaten) {
      A.markBeaten([...(d.players || []), ...(d.keep ? [d.keep] : [])])
        .then((r) => {
          if ((r.beaten || r.standing) && $('#gw-fort-msg')) $('#gw-fort-msg').textContent = `${r.beaten ? `${r.beaten} marked beaten` : ''}${r.beaten && r.standing ? ', ' : ''}${r.standing ? `${r.standing} back to standing` : ''} from this map.`;
        })
        .catch(() => {});
    }
  });
  function renderFort() {
    const el = $('#gw-fort-seen');
    if (!el) return;
    if (!seenFort) return el.classList.add('hidden');
    const list = [...seenFort.players, ...(seenFort.keep ? [seenFort.keep] : [])];
    const ours = seenFort.side === 'ours';
    const beaten = list.filter((p) => p.state === 'beaten').length;
    el.innerHTML = `<b>Seen in game: ${ours ? 'our' : 'enemy'} ${A.esc(seenFort.fort)}</b> <span class="hint">${list.length} defenders${beaten ? `, ${beaten} beaten` : ''} · check the names (✓ = a name you already have), then save</span>
      <div class="gw-fort-names">${list
        .map((p, i) => `<label class="gw-fort-name ${p.state === 'beaten' ? 'beaten' : ''}" title="${p.state === 'beaten' ? 'Beaten (grey ring)' : ''}">
          ${p.pic ? `<img class="gw-fort-pic" src="${A.esc(p.pic)}" alt="" title="The name as the game shows it" />` : ''}
          <input data-fort-i="${i}" value="${A.esc(p.name || '')}" placeholder="(not read)" />${p.known ? ' ✓' : ''}${p.official ? ' <span class="hint" title="Spelled as on the official record site">✓ official</span>' : ''}${p.keep ? ' <span class="hint">keep</span>' : ''}${p.state === 'beaten' ? ' <span class="hint">✗</span>' : ''}
          ${(p.options || []).length ? `<span class="gw-fort-opts">${p.options.slice(0, 3).map((o) => `<button type="button" class="btn" data-fort-opt="${i}" data-v="${A.esc(o)}" title="A player of that server with a name close to what was read: click to use this spelling">${A.esc(o)}</button>`).join('')}</span>` : ''}</label>`)
        .join('')}</div>
      <button class="btn primary" id="gw-fort-save">${ours ? `Save as our ${A.esc(seenFort.fort)}` : `Save as this war's ${A.esc(seenFort.fort)}`}</button> <span id="gw-fort-msg" class="hint"></span>
      <div class="hint">Each box has the name's picture from the game above it. A name in a script you can't type: compare the picture with the box (and with the buttons under it, the closest names on that server's official list) and click the one that looks the same. If none does, leave it: the app recognises the same player again by the same reading, so the war plan still works.</div>`;
    el.classList.remove('hidden');
    el.querySelectorAll('[data-fort-opt]').forEach((b) => (b.onclick = () => {
      // swap: the spelling that was in the box goes onto the button, so a wrong click can be taken back
      const box = el.querySelector(`[data-fort-i="${b.dataset.fortOpt}"]`);
      const old = box.value;
      box.value = b.dataset.v;
      if (old) {
        b.dataset.v = old;
        b.textContent = old;
      }
    }));
    $('#gw-fort-save').onclick = async () => {
      const players = list.map((p, i) => ({ ...p, name: el.querySelector(`[data-fort-i="${i}"]`).value.trim() }));
      try {
        const r = await A.saveFortress(seenFort.fort, players, seenFort.side);
        $('#gw-fort-msg').textContent = ours ? `Saved our ${seenFort.fort}: ${r.added} new members, ${r.same} known.` : `Saved: ${r.added} new, ${r.moved} moved here, ${r.same} already there.`;
      } catch (e) {
        $('#gw-fort-msg').textContent = e.message;
      }
    };
  }
  bus.on('vision:warning', (d) => d.module === 'guild' && ($('#gw-watch-read').textContent = '⚠ ' + d.text));
  // the watcher is busy with something slow (names in several languages) or needs a look: say so here too (DEVLOG #56)
  bus.on('vision:busy', (d) => {
    if (!d || !/^guild/.test(d.reader || '') || !d.text) return;
    $('#gw-watch-read').textContent = (d.done ? (d.ask ? '! ' : '✓ ') : '⏳ ') + d.text;
  });

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
    // a defense saved in an earlier war: the player may have changed it since (they can at any time)
    if (t.warId !== A.warId) lines.push('From an earlier war: may have changed');
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
