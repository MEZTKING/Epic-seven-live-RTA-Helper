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
  let lastSide = 'right'; // where the overlay card goes next to the name it belongs to
  let seenPlayer = { name: '', at: 0 }; // the enemy the game showed last (offered when a note window is read right after)
  let lastPicOfName = ''; // the name as the game shows it (for names in a script the user cannot type)
  function onNameRead(d) {
    if (d.text) lastRaw = d.text.replace(/[^\p{L}\p{N}_#.\- ]/gu, '').trim();
    fillFromPage(d); // a marked name on the last map is waiting for this player's page
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
    if (name) seenPlayer = { name, at: Date.now() };
    lastSide = 'right';
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
  // a battle-result window (js/vision/readers/guild-result.js): logged as attacks / defenses, once, with Undo (DEVLOG #57)
  // the Offense Team screen, the fight and a note window (js/vision/readers/guild-offense.js; DEVLOG #58)
  bus.on('guild:offense', async (d) => {
    if (!A.offenseFromGame) return;
    if (d.away) {
      lastRect = null;
      lastSide = 'right';
      if (window.E7Overlay) window.E7Overlay.clear('guild');
      return;
    }
    try {
      await A.offenseFromGame(d);
    } catch (_) { /* shown by the page's own status line */ }
    // the card with what is known about this defender goes above their name on that screen
    lastRect = d.rect || null;
    lastSide = 'above';
    seenPlayer = { name: (A.current && A.current()) || '', at: Date.now() };
    postOverlay();
  });
  bus.on('guild:battle', (d) => A.battleFromGame && A.battleFromGame(d));
  bus.on('guild:note', (d) => A.noteFromGame && A.noteFromGame(d, Date.now() - seenPlayer.at < 20000 ? seenPlayer.name : '').catch(() => {}));
  // The reader keeps every result in localStorage 'e7-gw-results' (this page may be closed when the window is on
  // screen); they are taken from there: on the event, and when this page has loaded the guild's records.
  const RESULTS = 'e7-gw-results';
  const waiting = () => {
    try {
      return (JSON.parse(localStorage.getItem(RESULTS) || '[]') || []).filter((x) => x && x.d && Date.now() - Date.parse(x.at || 0) < 12 * 3600 * 1000);
    } catch (_) {
      return [];
    }
  };
  const keep = (list) => {
    try {
      localStorage.setItem(RESULTS, JSON.stringify(list.slice(-12)));
    } catch (_) { /* storage not available: the event alone still works */ }
  };
  let taking = false;
  /** Log what is waiting (and `now`, a result that just arrived on the bus). One at a time. */
  async function takeResults(now) {
    if (!A.resultFromGame) return;
    if (taking) {
      // busy with an earlier one: what just arrived is in the waiting list (or is put there) and is taken next time
      if (now && !now.qid) keep([...waiting(), { id: `event-${Date.now()}`, at: new Date().toISOString(), d: now }]);
      return;
    }
    // a result from the reader is in the waiting list; when it is gone, another Guild War window has taken it
    if (now && now.qid && !waiting().some((x) => x.id === now.qid)) now = null;
    taking = true;
    try {
      const todo = waiting().filter((x) => !now || x.id !== now.qid);
      if (now) todo.unshift({ id: now.qid || `event-${Date.now()}`, at: new Date().toISOString(), d: now });
      for (const x of todo) {
        // taken out first (another Guild War window must not log it too), put back when it cannot be logged yet
        keep(waiting().filter((y) => y.id !== x.id));
        let r = 'error';
        try {
          r = await A.resultFromGame(x.d);
        } catch (_) { /* dropped */ }
        if (r === 'no-guild' || r === 'no-war') {
          const slim = (p) => ({ name: (p || {}).name || '', options: (p || {}).options || [] });
          keep([...waiting(), { ...x, d: { ...x.d, left: slim(x.d.left), right: slim(x.d.right) } }]);
          break;
        }
      }
    } catch (_) { /* never let this break the page */ }
    taking = false;
  }
  bus.on('guild:result', (d) => takeResults(d));
  A.onChange(() => waiting().length && takeResults());
  // this page may have finished loading before the lines above ran, and a war may start later: look again now and then
  setTimeout(() => waiting().length && takeResults(), 1500);
  setInterval(() => waiting().length && takeResults(), 5000);
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
  // "Seen in game" (DEVLOG #61, #62). A fortress map read by the game watcher is SAVED BY ITSELF: every defender
  // becomes a target on its place. A name the app is not sure of is marked ⚠ here and with a "?" on the game; when
  // that player's page is opened in the game, the name read there is put on the right defender by itself (the one
  // whose map reading it resembles; else the only marked one; else the one chosen with its ⚠) and saved again.
  let askFort = -1;
  const fortList = () => (seenFort ? [...seenFort.players, ...(seenFort.keep ? [seenFort.keep] : [])] : []);
  const unsure = (p) => window.E7GWMap.unsureName(p);
  function fortMarks() {
    const O = window.E7Overlay;
    if (!O) return;
    const items = seenFort && !seenFort.left ? fortList().filter((p) => unsure(p) && typeof p.x === 'number').map((p) => ({ x: p.x, y: p.y, w: 0, h: 0, kind: 'label', level: 'yellow', title: '? tap: name not read' })) : [];
    O.post('guild-fort', items);
  }
  let fortSaving = Promise.resolve();
  /** Save what the card shows (one after the other; called by itself after every reading and every change). */
  function saveFort(note) {
    if (!seenFort || !A.saveFortress) return fortSaving;
    const f = seenFort;
    const players = fortList().map((p) => ({ ...p }));
    fortSaving = fortSaving
      .then(() => A.saveFortress(f.fort, players, f.side, { index: f.index }))
      .then((r) => {
        f.saved = true;
        if ($('#gw-fort-msg') && seenFort === f) $('#gw-fort-msg').textContent = note || (f.side === 'ours' ? `Saved by itself: ${r.added} new members.` : `Saved by itself${r.added ? `: ${r.added} new` : ''}${r.renamed ? `${r.added ? ',' : ':'} ${r.renamed} name${r.renamed > 1 ? 's' : ''} corrected` : ''}.`);
      })
      .catch((e) => {
        if ($('#gw-fort-msg') && seenFort === f) $('#gw-fort-msg').textContent = e.message;
      });
    return fortSaving;
  }
  bus.on('guild:fortress', (d) => {
    if (d && d.away) {
      // the map was left: the marks go, the card stays (it is filled from the player's page next)
      if (seenFort) seenFort.left = true;
      return fortMarks();
    }
    seenFort = d;
    askFort = -1;
    renderFort();
    fortMarks();
    saveFort();
    // enemy defenders the app already has: beaten / still standing straight from their badges (no button)
    if (d && d.side !== 'ours' && A.markBeaten) {
      fortSaving = fortSaving.then(() => A.markBeaten([...(d.players || []), ...(d.keep ? [d.keep] : [])])).catch(() => {});
    }
  });
  /** How alike two names are: 0 = the same, 1 = nothing in common (edits over the longer length). */
  function unlike(a, b) {
    const n = (x) => [...String(x || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')];
    const x = n(a);
    const y = n(b);
    if (!x.length || !y.length) return 1;
    return GW.editDistance(x.join(''), y.join('')) / Math.max(x.length, y.length);
  }
  /** A name read on a player's page: which defender of the last map is it? -> index or -1. */
  function whoIs(d) {
    const list = fortList();
    const score = (p) => Math.min(...[p.name, p.raw, ...(p.options || [])].filter(Boolean).map((x) => Math.min(unlike(d.text, x), ...(d.options || []).map((o) => unlike(o, x)))), 1);
    const ranked = list.map((p, i) => ({ i, s: score(p), p })).sort((a, b) => a.s - b.s);
    const [best, next] = ranked;
    // it resembles ONE reading on the map clearly more than any other
    if (best && best.s <= 0.5 && (!next || next.s - best.s >= 0.15)) return best.i;
    if (askFort >= 0 && list[askFort]) return askFort; // the box that was told to wait
    const open = list.map((p, i) => (unsure(p) ? i : -1)).filter((i) => i >= 0);
    return open.length === 1 ? open[0] : -1; // the only marked one
  }
  /** A name read on a player's page: put on its defender of the last map, and saved. */
  function fillFromPage(d) {
    if (!seenFort || !d || d.away || !d.text) return false;
    const i = whoIs(d);
    const p = i >= 0 ? fortList()[i] : null;
    if (!p) return false;
    if (p.fromPage && p.name === d.text) return true; // the same page, read again
    keepBoxes();
    const old = p.name;
    Object.assign(p, { name: d.text, fromPage: true, options: [...new Set([...(d.options || []), ...(old ? [old] : []), ...(p.options || [])])].filter((o) => o !== d.text).slice(0, 3), pic: d.pic || p.pic });
    askFort = -1;
    renderFort();
    fortMarks();
    saveFort(old && old !== d.text ? `"${old}" corrected to "${d.text}" from that player's page, and saved.` : `"${d.text}" confirmed on that player's page.`);
    return true;
  }
  /** What was typed into the boxes survives a redraw of the card (and counts as a sure name). */
  function keepBoxes() {
    const el = $('#gw-fort-seen');
    if (!el || !seenFort) return false;
    let changed = false;
    fortList().forEach((p, i) => {
      const box = el.querySelector(`[data-fort-i="${i}"]`);
      if (!box) return;
      const v = box.value.trim();
      if (v !== (p.name || '')) {
        Object.assign(p, { name: v, typed: !!v });
        changed = true;
      }
    });
    return changed;
  }
  function renderFort() {
    const el = $('#gw-fort-seen');
    if (!el) return;
    if (!seenFort) return el.classList.add('hidden');
    const list = fortList();
    const ours = seenFort.side === 'ours';
    const beaten = list.filter((p) => p.state === 'beaten').length;
    const open = list.filter(unsure).length;
    const chip = (p, i) => {
      if (unsure(p)) return `<button type="button" class="chip ask" data-fort-ask="${i}" title="The app is not sure of this name. Tap this player in the game: their page shows the name clearly and it is corrected here by itself. (Press this only when several names are marked and the app does not find the right one.)">${askFort === i ? '⏳ waiting for their page' : '⚠ not sure · tap them in the game'}</button>`;
      const why = p.fromPage ? 'read on their page' : p.typed ? 'typed by you' : p.fromGuild ? 'in the war plan' : p.known ? 'known' : p.official ? 'official spelling' : 'read clearly';
      return `<span class="chip ok">✓ ${why}</span>`;
    };
    el.innerHTML = `<b>${ours ? 'Our' : 'Enemy'} ${A.esc(seenFort.fort)}</b> <span class="hint">${list.length} defenders${beaten ? ` · ${beaten} beaten` : ''} · read from the game and saved by itself${open ? ` · <b>${open} name${open > 1 ? 's' : ''} not sure</b>: tap ${open > 1 ? 'those players' : 'that player'} in the game` : ''}</span> <span id="gw-fort-msg" class="hint"></span>
      <div class="gw-fort-rows">${list
        .map((p, i) => `${p.pic ? `<img class="gw-fort-pic" src="${A.esc(p.pic)}" alt="" title="The name as the game shows it" />` : '<span></span>'}
          <input data-fort-i="${i}" value="${A.esc(p.name || '')}" placeholder="(not read)" title="You can type the name; it is saved when you leave the box" />
          <span>${chip(p, i)}${p.keep ? ' <span class="chip">keep</span>' : ''}${p.state === 'beaten' ? ' <span class="chip beaten">beaten</span>' : ''}${p.busy ? ' <span class="chip">being fought</span>' : ''}</span>
          <span class="alts">${(p.options || []).slice(0, 2).map((o) => `<button type="button" class="btn" data-fort-opt="${i}" data-v="${A.esc(o)}" title="Another reading or a close official spelling: click to use it">${A.esc(o)}</button>`).join('')}</span>`)
        .join('')}</div>`;
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
      if (keepBoxes()) saveFort();
    }));
    el.querySelectorAll('[data-fort-i]').forEach((box) => (box.onchange = () => {
      if (keepBoxes()) {
        renderFort();
        fortMarks();
        saveFort();
      }
    }));
    el.querySelectorAll('[data-fort-ask]').forEach((b) => (b.onclick = () => {
      keepBoxes();
      askFort = askFort === Number(b.dataset.fortAsk) ? -1 : Number(b.dataset.fortAsk);
      renderFort();
    }));
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
    O.post('guild', [{ ...r, kind: 'card', side: lastSide, level: v.level, title: t.player, lines }]);
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
