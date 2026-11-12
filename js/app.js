/* UI layer. Depends on window.RTAData and window.RTALogic. */
(function () {
  'use strict';
  const L = window.RTALogic;
  const { DEFAULT_HEROES, slug } = window.RTAData;

  // ------------------------------------------------------------ storage
  const KEY = 'rta-helper-v1';
  const store = load();

  function load() {
    let s = null;
    try {
      s = JSON.parse(localStorage.getItem(KEY));
    } catch (_) { /* storage blocked or corrupt */ }
    s = s && typeof s === 'object' ? s : {};
    return {
      heroes: Array.isArray(s.heroes) ? s.heroes : clone(DEFAULT_HEROES),
      draft: s.draft && Array.isArray(s.draft.actions) ? s.draft : L.newDraft('me'),
      matches: Array.isArray(s.matches) ? s.matches : [],
      sim: Array.isArray(s.sim) ? s.sim : defaultSim(),
      variance: typeof s.variance === 'number' ? s.variance : 5,
    };
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch (_) { /* ignore */ }
  }
  function clone(x) {
    return JSON.parse(JSON.stringify(x));
  }
  function defaultSim() {
    return [
      { name: 'My unit 1', side: 'me', speed: 300, startCR: 0, pushAllies: 0, pushOnce: false },
      { name: 'My unit 2', side: 'me', speed: 220, startCR: 0, pushAllies: 0, pushOnce: false },
      { name: 'Enemy 1', side: 'opp', speed: 280, startCR: 0, pushAllies: 0, pushOnce: false },
    ];
  }

  // ------------------------------------------------------------ helpers
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const heroById = () => new Map(store.heroes.map((h) => [h.id, h]));
  const nameOf = (id, map = heroById()) => (map.get(id) ? map.get(id).name : id);
  const dot = (el) => `<span class="dot ${esc(el)}"></span>`;
  const sortedHeroes = () => [...store.heroes].sort((a, b) => a.name.localeCompare(b.name));
  const pct = (w, g) => (g ? Math.round((w / g) * 100) + '%' : '—');

  // --------------------------------------------------------------- tabs
  document.querySelectorAll('.tab').forEach((btn) =>
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + btn.dataset.tab));
      renderAll();
    }),
  );

  // -------------------------------------------------------------- draft
  const PHASE_LABEL = { preban: 'Preban', pick: 'Pick', postban: 'Postban' };

  function renderDraft() {
    const d = store.draft;
    const map = heroById();
    const v = L.draftView(d);
    const step = L.currentStep(d);
    $('#first-pick').value = d.firstPick;

    // status line
    const st = $('#draft-status');
    st.className = 'status' + (step ? ' ' + step.player : '');
    if (!step) {
      st.textContent = 'Draft complete — record the result when the match ends.';
    } else {
      const who = step.player === 'me' ? 'Your' : "Opponent's";
      const steps = L.draftSteps(d.firstPick);
      let left = 0;
      for (let i = d.actions.length; i < steps.length && steps[i].phase === step.phase && steps[i].player === step.player; i++) left++;
      let extra = '';
      if (step.phase === 'postban') extra = step.player === 'me' ? ' — ban one of their heroes' : ' — they ban one of yours';
      st.textContent = `${who} ${PHASE_LABEL[step.phase].toLowerCase()} (${left} left)${extra}`;
    }

    // board slots
    const slots = (ids, total, banned, nextFor) => {
      let html = '';
      for (let i = 0; i < total; i++) {
        const id = ids[i];
        if (id) {
          const h = map.get(id);
          const bannedNow = banned && banned.includes(id);
          html += `<div class="slot filled${bannedNow ? ' banned' : ''}">${h ? dot(h.element) + '&nbsp;' : ''}${esc(nameOf(id, map))}</div>`;
        } else {
          const isNext = nextFor && i === ids.length;
          html += `<div class="slot${isNext ? ' next' : ''}">—</div>`;
        }
      }
      return html;
    };
    const nextIs = (phase, player) => step && step.phase === phase && step.player === player;
    $('#me-prebans').innerHTML = slots(v.prebans.me, 2, null, nextIs('preban', 'me'));
    $('#opp-prebans').innerHTML = slots(v.prebans.opp, 2, null, nextIs('preban', 'opp'));
    $('#me-picks').innerHTML = slots(v.picks.me, 5, v.postbans.opp, nextIs('pick', 'me'));
    $('#opp-picks').innerHTML = slots(v.picks.opp, 5, v.postbans.me, nextIs('pick', 'opp'));
    $('#me-postban').innerHTML = slots(v.postbans.me, 1, null, nextIs('postban', 'me'));
    $('#opp-postban').innerHTML = slots(v.postbans.opp, 1, null, nextIs('postban', 'opp'));

    // hero grid
    const q = $('#hero-search').value.trim().toLowerCase();
    const fe = $('#filter-element').value;
    const fr = $('#filter-role').value;
    let list = sortedHeroes().filter((h) => (!q || h.name.toLowerCase().includes(q)) && (!fe || h.element === fe) && (!fr || h.role === fr));
    if (step && step.phase === 'postban') {
      const other = step.player === 'me' ? 'opp' : 'me';
      list = list.filter((h) => v.picks[other].includes(h.id));
    }
    $('#hero-grid').innerHTML =
      list
        .map((h) => {
          const reason = L.canSelect(d, h.id);
          return `<button class="hero-btn" data-id="${esc(h.id)}" ${reason ? `disabled title="${esc(reason)}"` : ''}>
            ${dot(h.element)}<span>${esc(h.name)}</span>${h.tier ? `<span class="tier">${esc(h.tier)}</span>` : ''}</button>`;
        })
        .join('') || '<p class="hint">No heroes match. Add more in the Heroes tab.</p>';

    renderSuggestions(step);
    $('#result-box').classList.toggle('hidden', !!step);
  }

  function renderSuggestions(step) {
    const d = store.draft;
    const title = $('#suggest-title');
    const list = $('#suggest-list');
    let items = [];
    if (!step) {
      title.textContent = 'Draft complete';
    } else if (step.phase === 'preban') {
      title.textContent = 'Preban ideas';
      items = L.suggestPrebans(store.heroes);
    } else if (step.phase === 'pick') {
      title.textContent = step.player === 'me' ? 'Suggested picks for you' : 'What the opponent may pick';
      items = L.suggestPicks(d, store.heroes);
    } else {
      title.textContent = step.player === 'me' ? 'Most dangerous enemy heroes' : 'Which of yours they may ban';
      items = L.suggestPostban(d, store.heroes, step.player);
    }
    list.innerHTML = items.length
      ? items
          .map(
            (s) => `<li><button data-id="${esc(s.hero.id)}">${dot(s.hero.element)} ${esc(s.hero.name)}</button>
              <span class="score">${s.score}</span>
              <span class="why">${esc(s.reasons.join(' · ') || 'No notes yet')}</span></li>`,
          )
          .join('')
      : step
        ? '<li class="hint">Nothing to suggest yet. Set tiers, counters and synergies in the Heroes tab.</li>'
        : '';
  }

  function selectHero(id) {
    if (L.canSelect(store.draft, id)) return;
    store.draft = L.select(store.draft, id);
    save();
    renderDraft();
  }

  $('#hero-grid').addEventListener('click', (e) => {
    const b = e.target.closest('.hero-btn');
    if (b && !b.disabled) selectHero(b.dataset.id);
  });
  $('#suggest-list').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (b) selectHero(b.dataset.id);
  });
  ['#hero-search', '#filter-element', '#filter-role'].forEach((s) => $(s).addEventListener('input', renderDraft));
  $('#hero-search').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = $('#hero-search').value.trim().toLowerCase();
    const btns = [...document.querySelectorAll('#hero-grid .hero-btn:not(:disabled)')];
    const label = (b) => b.textContent.trim().toLowerCase();
    const first =
      btns.find((b) => label(b).replace(/\s+[sabc]$/, '') === q || label(b) === q) ||
      btns.find((b) => label(b).startsWith(q)) ||
      btns[0];
    if (first) {
      selectHero(first.dataset.id);
      $('#hero-search').value = '';
      renderDraft();
    }
  });
  $('#first-pick').addEventListener('change', (e) => {
    // changing first pick re-labels who picks when; only safe before picks start
    const hasPicks = store.draft.actions.some((a) => a.phase !== 'preban');
    if (hasPicks && !confirm('Picks already started. Changing first pick will start a new draft. Continue?')) {
      e.target.value = store.draft.firstPick;
      return;
    }
    store.draft = hasPicks ? L.newDraft(e.target.value) : { ...store.draft, firstPick: e.target.value };
    save();
    renderDraft();
  });
  $('#draft-undo').addEventListener('click', () => {
    store.draft = L.undo(store.draft);
    save();
    renderDraft();
  });
  $('#draft-reset').addEventListener('click', () => {
    if (store.draft.actions.length && !confirm('Clear the current draft?')) return;
    store.draft = L.newDraft(store.draft.firstPick);
    save();
    renderDraft();
  });

  function recordResult(result) {
    const v = L.draftView(store.draft);
    store.matches.unshift({
      id: Date.now().toString(36),
      date: new Date().toISOString(),
      result,
      firstPick: store.draft.firstPick,
      myPrebans: v.prebans.me,
      oppPrebans: v.prebans.opp,
      myPicks: v.picks.me,
      oppPicks: v.picks.opp,
      iBanned: v.postbans.me[0] || null,
      theyBanned: v.postbans.opp[0] || null,
      notes: $('#result-notes').value.trim(),
    });
    $('#result-notes').value = '';
    store.draft = L.newDraft(store.draft.firstPick);
    save();
    renderDraft();
  }
  $('#record-win').addEventListener('click', () => recordResult('win'));
  $('#record-loss').addEventListener('click', () => recordResult('loss'));

  // -------------------------------------------------------------- speed
  function renderSpeed() {
    $('#cr-variance').value = store.variance;
    const est = L.estimateEnemySpeed($('#cr-myspeed').value, $('#cr-enemy').value, store.variance);
    $('#cr-out').innerHTML = est
      ? `<div class="big">≈ ${est.estimate}</div>Likely between <b>${est.min}</b> and <b>${est.max}</b>`
      : 'Enter your speed and their CR %.';
    const os = L.speedToOutspeed($('#os-enemy').value, store.variance);
    $('#os-out').innerHTML = os
      ? `<div class="big">${os.guaranteed}+</div>to always go first.<br><span class="hint">${os.noVariance}+ beats them only if neither side gets random starting CR.</span>`
      : 'Enter enemy speed.';
    renderSim();
  }

  function renderSim() {
    const body = $('#sim-units');
    // Only rebuild rows when the count changes, so typing keeps focus.
    if (body.children.length !== store.sim.length) {
      body.innerHTML = store.sim
        .map(
          (u, i) => `<tr data-i="${i}">
          <td><input data-k="name" value="${esc(u.name)}" /></td>
          <td><select data-k="side"><option value="me"${u.side === 'me' ? ' selected' : ''}>Me</option><option value="opp"${u.side === 'opp' ? ' selected' : ''}>Opp</option></select></td>
          <td><input data-k="speed" type="number" min="1" value="${esc(u.speed)}" /></td>
          <td><input data-k="startCR" type="number" min="0" max="100" value="${esc(u.startCR)}" /></td>
          <td><input data-k="pushAllies" type="number" min="0" max="100" value="${esc(u.pushAllies)}" /></td>
          <td><input data-k="pushOnce" type="checkbox"${u.pushOnce ? ' checked' : ''} /></td>
          <td><button class="btn" data-del="${i}" title="Remove">✕</button></td></tr>`,
        )
        .join('');
    }
    const turns = Math.min(40, Math.max(1, Number($('#sim-turns').value) || 10));
    const res = L.simulateTurns(store.sim, turns);
    $('#sim-out').innerHTML = res
      .map((r) => {
        const others = Object.entries(r.crSnapshot)
          .filter(([n]) => n !== r.name)
          .map(([n, cr]) => `${esc(n)} ${cr}%`)
          .join(', ');
        return `<li><span class="${r.side}">${esc(r.name)}</span> <small>(${others})</small></li>`;
      })
      .join('');
  }

  ['#cr-myspeed', '#cr-enemy', '#os-enemy', '#sim-turns'].forEach((s) => $(s).addEventListener('input', renderSpeed));
  $('#cr-variance').addEventListener('input', (e) => {
    const n = Number(e.target.value);
    if (n >= 0 && n < 100) {
      store.variance = n;
      save();
    }
    renderSpeed();
  });
  $('#sim-units').addEventListener('input', (e) => {
    const tr = e.target.closest('tr');
    const k = e.target.dataset.k;
    if (!tr || !k) return;
    const u = store.sim[Number(tr.dataset.i)];
    u[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    save();
    renderSim();
  });
  $('#sim-units').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-del]');
    if (!b) return;
    store.sim.splice(Number(b.dataset.del), 1);
    save();
    renderSim();
  });
  $('#sim-add').addEventListener('click', () => {
    store.sim.push({ name: `Unit ${store.sim.length + 1}`, side: 'opp', speed: 200, startCR: 0, pushAllies: 0, pushOnce: false });
    save();
    renderSim();
  });
  $('#sim-from-draft').addEventListener('click', () => {
    const v = L.draftView(store.draft);
    const map = heroById();
    const banned = new Set([...v.postbans.me, ...v.postbans.opp]);
    const units = [];
    for (const side of ['me', 'opp']) {
      for (const id of v.picks[side]) {
        if (banned.has(id)) continue;
        const old = store.sim.find((u) => u.name === nameOf(id, map));
        units.push(old || { name: nameOf(id, map), side, speed: side === 'me' ? 200 : 200, startCR: 0, pushAllies: 0, pushOnce: false });
      }
    }
    if (!units.length) return alert('Pick some heroes in the Draft tab first.');
    store.sim = units;
    $('#sim-units').innerHTML = '';
    save();
    renderSim();
  });

  // ------------------------------------------------------------- heroes
  function renderHeroes() {
    const q = $('#db-search').value.trim().toLowerCase();
    const ownedOnly = $('#db-owned-only').checked;
    const map = heroById();
    const names = (ids) => (ids || []).map((id) => esc(nameOf(id, map))).join(', ');
    $('#db-rows').innerHTML = sortedHeroes()
      .filter((h) => (!q || h.name.toLowerCase().includes(q)) && (!ownedOnly || h.owned))
      .map(
        (h) => `<tr data-id="${esc(h.id)}">
          <td><input type="checkbox" data-owned ${h.owned ? 'checked' : ''} /></td>
          <td>${dot(h.element)} ${esc(h.name)}</td>
          <td>${esc(h.element)}</td>
          <td>${esc(h.role)}</td>
          <td>${esc(h.tier || '—')}</td>
          <td class="small">${names(h.counters)}</td>
          <td class="small">${names(h.synergies)}</td>
          <td><button class="btn" data-edit>Edit</button></td></tr>`,
      )
      .join('');
    $('#hero-names').innerHTML = sortedHeroes().map((h) => `<option value="${esc(h.name)}"></option>`).join('');
  }
  $('#db-search').addEventListener('input', renderHeroes);
  $('#db-owned-only').addEventListener('change', renderHeroes);
  $('#db-rows').addEventListener('change', (e) => {
    if (!e.target.matches('[data-owned]')) return;
    const h = store.heroes.find((x) => x.id === e.target.closest('tr').dataset.id);
    if (h) h.owned = e.target.checked;
    save();
  });
  $('#db-rows').addEventListener('click', (e) => {
    if (e.target.matches('[data-edit]')) openEditor(e.target.closest('tr').dataset.id);
  });
  $('#db-add').addEventListener('click', () => openEditor(null));

  // hero editor dialog
  const dlg = $('#hero-dialog');
  const form = $('#hero-form');
  let editing = null; // working copy

  function openEditor(id) {
    const h = id ? store.heroes.find((x) => x.id === id) : null;
    editing = h ? clone(h) : { id: null, name: '', element: 'fire', role: 'warrior', tier: '', owned: false, counters: [], synergies: [], notes: '' };
    $('#hero-dialog-title').textContent = h ? 'Edit hero' : 'Add hero';
    $('#hero-delete').classList.toggle('hidden', !h);
    form.heroName.value = editing.name;
    form.element.value = editing.element;
    form.role.value = editing.role;
    form.tier.value = editing.tier || '';
    form.owned.checked = !!editing.owned;
    form.notes.value = editing.notes || '';
    form.querySelectorAll('.chip-input').forEach((i) => (i.value = ''));
    renderChips();
    dlg.showModal();
  }
  function renderChips() {
    const map = heroById();
    form.querySelectorAll('.chips').forEach((box) => {
      const f = box.dataset.field;
      box.innerHTML = editing[f].map((id) => `<span class="chip">${esc(nameOf(id, map))}<button type="button" data-rm="${esc(id)}">✕</button></span>`).join('');
    });
  }
  form.addEventListener('keydown', (e) => {
    if (!e.target.matches('.chip-input') || e.key !== 'Enter') return;
    e.preventDefault();
    const name = e.target.value.trim().toLowerCase();
    const h = store.heroes.find((x) => x.name.toLowerCase() === name);
    if (!h) return alert('No hero with that name. Add it first.');
    const f = e.target.dataset.field;
    if (!editing[f].includes(h.id) && h.id !== editing.id) editing[f].push(h.id);
    e.target.value = '';
    renderChips();
  });
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    const f = b.closest('.chips').dataset.field;
    editing[f] = editing[f].filter((id) => id !== b.dataset.rm);
    renderChips();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.heroName.value.trim();
    if (!name) return;
    Object.assign(editing, {
      name,
      element: form.element.value,
      role: form.role.value,
      tier: form.tier.value,
      owned: form.owned.checked,
      notes: form.notes.value,
    });
    if (!editing.id) {
      let id = slug(name) || 'hero';
      let n = 2;
      while (store.heroes.some((h) => h.id === id)) id = `${slug(name)}-${n++}`;
      editing.id = id;
      store.heroes.push(editing);
    } else {
      const i = store.heroes.findIndex((h) => h.id === editing.id);
      store.heroes[i] = editing;
    }
    save();
    dlg.close();
    renderAll();
  });
  $('#hero-cancel').addEventListener('click', () => dlg.close());
  $('#hero-delete').addEventListener('click', () => {
    if (!editing.id || !confirm(`Delete ${editing.name}?`)) return;
    store.heroes = store.heroes.filter((h) => h.id !== editing.id);
    for (const h of store.heroes) {
      h.counters = h.counters.filter((id) => id !== editing.id);
      h.synergies = h.synergies.filter((id) => id !== editing.id);
    }
    save();
    dlg.close();
    renderAll();
  });

  // backup
  $('#export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ app: 'rta-helper', version: 1, ...store }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `rta-helper-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.heroes)) throw new Error('No hero list in file.');
      if (!confirm('Replace your heroes and match history with this backup?')) return;
      store.heroes = data.heroes;
      store.matches = Array.isArray(data.matches) ? data.matches : [];
      if (Array.isArray(data.sim)) store.sim = data.sim;
      if (typeof data.variance === 'number') store.variance = data.variance;
      store.draft = L.newDraft('me');
      $('#sim-units').innerHTML = '';
      save();
      renderAll();
    } catch (err) {
      alert('Could not import: ' + err.message);
    }
  });
  $('#reset-heroes').addEventListener('click', () => {
    if (!confirm('Replace your hero list (tiers, counters, roster) with the default list? Match history is kept.')) return;
    store.heroes = clone(DEFAULT_HEROES);
    save();
    renderAll();
  });

  // ------------------------------------------------------------ history
  function renderHistory() {
    const map = heroById();
    const ms = store.matches;
    const wins = ms.filter((m) => m.result === 'win').length;
    const fp = ms.filter((m) => m.firstPick === 'me');
    const sp = ms.filter((m) => m.firstPick === 'opp');
    const wr = (arr) => pct(arr.filter((m) => m.result === 'win').length, arr.length);
    $('#hist-summary').innerHTML = `
      <div class="card"><div class="hint">Matches</div><div class="stat">${ms.length}</div></div>
      <div class="card"><div class="hint">Win rate</div><div class="stat">${pct(wins, ms.length)}</div></div>
      <div class="card"><div class="hint">When I pick first</div><div class="stat">${wr(fp)}</div><div class="hint">${fp.length} games</div></div>
      <div class="card"><div class="hint">When they pick first</div><div class="stat">${wr(sp)}</div><div class="hint">${sp.length} games</div></div>`;

    const { mine, vs } = L.heroStats(ms);
    const rows = (m) =>
      [...m.entries()]
        .sort((a, b) => b[1].games - a[1].games || b[1].wins - a[1].wins)
        .slice(0, 15)
        .map(([id, r]) => `<tr><td>${esc(nameOf(id, map))}</td><td>${r.games}</td><td>${pct(r.wins, r.games)}</td></tr>`)
        .join('') || '<tr><td colspan="3" class="hint">No matches yet.</td></tr>';
    $('#hist-mine').innerHTML = rows(mine);
    $('#hist-vs').innerHTML = rows(vs);

    const names = (ids) => (ids || []).map((id) => esc(nameOf(id, map))).join(', ');
    $('#hist-list').innerHTML =
      ms
        .map(
          (m) => `<li><span class="res ${m.result}">${m.result === 'win' ? 'WIN' : 'LOSS'}</span>
          <div><div><b>Me:</b> ${names(m.myPicks)}${m.theyBanned ? ` <span class="meta">(lost ${esc(nameOf(m.theyBanned, map))})</span>` : ''}</div>
          <div><b>Opp:</b> ${names(m.oppPicks)}${m.iBanned ? ` <span class="meta">(banned ${esc(nameOf(m.iBanned, map))})</span>` : ''}</div>
          <div class="meta">${new Date(m.date).toLocaleString()} · ${m.firstPick === 'me' ? 'I picked first' : 'They picked first'}${m.notes ? ' · ' + esc(m.notes) : ''}</div></div>
          <button class="btn" data-del="${esc(m.id)}" title="Delete">✕</button></li>`,
        )
        .join('') || '<li class="hint">Finish a draft and press Win or Loss to log a match.</li>';
  }
  $('#hist-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b || !confirm('Delete this match?')) return;
    store.matches = store.matches.filter((m) => m.id !== b.dataset.del);
    save();
    renderHistory();
  });

  // ---------------------------------------------------------------- go
  function renderAll() {
    renderDraft();
    renderSpeed();
    renderHeroes();
    renderHistory();
  }
  renderAll();
})();
