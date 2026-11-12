/* UI layer. Depends on RTASources, RTARoster, RTALearn, RTALogic (loaded before this file). */
(function () {
  'use strict';
  const L = window.RTALogic;
  const R = window.RTARoster;
  const Learn = window.RTALearn;
  const SNAPSHOT = window.RTASources.officialSnapshot;

  // =================================================================== storage
  /*
   * Data is kept per source and never merged:
   *   official      hero list from Smilegate (null = use bundled snapshot)
   *   custom        heroes you added yourself
   *   fribbels      roster imported from Fribbels gear.txt
   *   notes         your tiers / counters / synergies / notes, by hero code
   *   manualOwned   heroes you ticked as owned by hand
   *   matches       every match, tagged with `source`
   *   matchSources  per-source on/off switch
   */
  const KEY = 'rta-helper-v2';
  const OLD_KEY = 'rta-helper-v1';
  const DEFAULT_SETTINGS = {
    useNotes: true,
    useLearned: true,
    useElement: true,
    usePresets: true,
    usePlayer: true,
    useFribbels: true,
    useManualOwned: true,
    variance: 5,
  };

  let store = load();
  let cache = {}; // derived data, rebuilt by derive()
  save(); // persists a first-version upgrade right away; also builds `cache`

  function emptyStore() {
    return {
      version: 2,
      official: null,
      custom: [],
      fribbels: null,
      notes: {},
      manualOwned: [],
      presets: [],
      matches: [],
      matchSources: { manual: { enabled: true, addedAt: new Date().toISOString() } },
      settings: { ...DEFAULT_SETTINGS },
      draft: { ...L.newDraft('me'), opponent: '' },
      pending: null, // a finished draft that was replaced before its result was recorded
      sim: defaultSim(),
      auto: defaultAuto(),
    };
  }
  function defaultAuto() {
    return {
      regions: {},
      threshold: 0.72,
      intervalMs: 500,
      apply: true,
      ocr: true,
      useOfficial: true,
      useCorrections: true,
      useAutoLearned: false,
      autoLearn: false,
      corrections: [], // [{ code, source: 'my corrections'|'auto-learned', q, at }]
    };
  }

  function load() {
    let raw = null;
    try {
      raw = JSON.parse(localStorage.getItem(KEY));
      if (!raw) {
        const old = JSON.parse(localStorage.getItem(OLD_KEY));
        if (old) raw = migrateV1(old);
      }
    } catch (_) { /* storage blocked or corrupt */ }
    return sanitize(raw);
  }

  function sanitize(raw) {
    const s = emptyStore();
    if (!raw || typeof raw !== 'object') return s;
    const arr = (x) => (Array.isArray(x) ? x : []);
    s.official = raw.official && Array.isArray(raw.official.heroes) ? raw.official : null;
    s.custom = arr(raw.custom);
    s.fribbels = raw.fribbels && Array.isArray(raw.fribbels.heroes) ? raw.fribbels : null;
    s.notes = raw.notes && typeof raw.notes === 'object' ? raw.notes : {};
    s.manualOwned = arr(raw.manualOwned);
    s.presets = arr(raw.presets);
    s.matches = arr(raw.matches);
    s.matchSources = { ...s.matchSources, ...(raw.matchSources || {}) };
    for (const m of s.matches) if (!s.matchSources[m.source]) s.matchSources[m.source] = { enabled: true, addedAt: m.date || null };
    s.settings = { ...DEFAULT_SETTINGS, ...(raw.settings || {}) };
    if (raw.draft && Array.isArray(raw.draft.actions)) s.draft = { opponent: '', ...raw.draft };
    if (Array.isArray(raw.sim)) s.sim = raw.sim;
    if (raw.pending && Array.isArray(raw.pending.actions)) s.pending = raw.pending;
    if (raw.auto && typeof raw.auto === 'object') {
      s.auto = { ...defaultAuto(), ...raw.auto };
      if (!Array.isArray(s.auto.corrections)) s.auto.corrections = [];
      if (!s.auto.regions || typeof s.auto.regions !== 'object') s.auto.regions = {};
    }
    return s;
  }

  /** Convert data saved by the first version (slug ids, notes inside hero list). */
  function migrateV1(old) {
    const s = emptyStore();
    const heroes = SNAPSHOT.heroes;
    const idx = R.nameIndex(heroes);
    const idToCode = new Map();
    for (const h of old.heroes || []) {
      const hit = R.findHero(h.name, heroes, idx);
      let code = hit && hit.code;
      if (!code) {
        code = 'custom-' + h.id;
        s.custom.push({ code, name: h.name, element: h.element === 'earth' ? 'wind' : h.element, role: h.role === 'thief' ? 'assassin' : h.role === 'soul-weaver' ? 'manauser' : h.role, source: 'custom' });
      }
      idToCode.set(h.id, code);
    }
    const map = (id) => idToCode.get(id) || null;
    const maps = (ids) => (ids || []).map(map).filter(Boolean);
    for (const h of old.heroes || []) {
      const code = map(h.id);
      if (h.owned) s.manualOwned.push(code);
      if (h.tier || (h.counters || []).length || (h.synergies || []).length || h.notes) {
        s.notes[code] = { tier: h.tier || '', counters: maps(h.counters), synergies: maps(h.synergies), notes: h.notes || '' };
      }
    }
    s.matches = (old.matches || []).map((m) => ({
      ...m,
      source: 'manual',
      opponent: '',
      myPrebans: maps(m.myPrebans),
      oppPrebans: maps(m.oppPrebans),
      myPicks: maps(m.myPicks),
      oppPicks: maps(m.oppPicks),
      iBanned: map(m.iBanned),
      theyBanned: map(m.theyBanned),
    }));
    if (old.draft && Array.isArray(old.draft.actions)) {
      s.draft = { firstPick: old.draft.firstPick, opponent: '', actions: old.draft.actions.map((a) => ({ ...a, heroId: map(a.heroId) })).filter((a) => a.heroId) };
    }
    if (Array.isArray(old.sim)) s.sim = old.sim;
    if (typeof old.variance === 'number') s.settings.variance = old.variance;
    return s;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch (e) {
      console.warn('Could not save', e);
    }
    derive();
  }

  /** Rebuild everything computed from the stored sources. */
  function derive() {
    const official = (store.official || SNAPSHOT).heroes;
    const heroes = [...official, ...store.custom].sort((a, b) => a.name.localeCompare(b.name));
    const byCode = new Map(heroes.map((h) => [h.code, h]));
    const owned = new Set();
    if (store.settings.useFribbels && store.fribbels) for (const h of store.fribbels.heroes) owned.add(h.code);
    if (store.settings.useManualOwned) for (const c of store.manualOwned) owned.add(c);
    const stars = new Map((store.fribbels ? store.fribbels.heroes : []).map((h) => [h.code, h.stars]));
    const enabledMatches = store.matches.filter((m) => (store.matchSources[m.source] || {}).enabled !== false);
    const stats = Learn.buildStats(enabledMatches);
    cache = { heroes, byCode, owned, stars, enabledMatches, stats };
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

  // =================================================================== helpers
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hero = (code) => cache.byCode.get(code);
  const nameOf = (code) => (hero(code) ? hero(code).name : code || '?');
  const gm = (n) => `${n} ${n === 1 ? 'game' : 'games'}`;
  const pct = (w, g) => (g ? Math.round((w / g) * 100) + '%' : '—');
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const SRC_CLASS = { 'my notes': 'notes', learned: 'learned', 'game rule': 'rule', presets: 'presets', player: 'player' };
  const srcBadge = (src) => `<span class="src ${SRC_CLASS[src] || 'other'}">${esc(src)}</span>`;

  function portrait(code, cls = 'pt', lazy = false) {
    const h = hero(code);
    if (h && h.source === 'official') {
      return `<img class="${cls}"${lazy ? ' loading="lazy"' : ''} crossorigin="anonymous" alt="" src="${esc(R.PORTRAIT_URL(code))}" onerror="this.classList.add('broken')" />`;
    }
    return `<span class="${cls} dot-pt ${esc(h ? h.element : '')}"></span>`;
  }
  const dot = (el) => `<span class="dot ${esc(el)}"></span>`;
  const heroChip = (code) => `<span class="hchip">${portrait(code, 'pt sm')}${esc(nameOf(code))}</span>`;
  const heroList = (codes) => (codes || []).map((c) => esc(nameOf(c))).join(', ');

  function fillSelect(sel, labels, allText) {
    sel.innerHTML = `<option value="">${allText}</option>` + Object.entries(labels).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  }
  fillSelect($('#filter-element'), R.ELEMENT_LABEL, 'All elements');
  fillSelect($('#filter-role'), R.ROLE_LABEL, 'All classes');
  fillSelect($('#db-element'), R.ELEMENT_LABEL, 'All elements');
  fillSelect($('#db-role'), R.ROLE_LABEL, 'All classes');
  $('#hero-form').element.innerHTML = Object.entries(R.ELEMENT_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('#hero-form').role.innerHTML = Object.entries(R.ROLE_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

  function filterHeroes(q, el, role, ownedOnly) {
    q = R.normName(q);
    return cache.heroes.filter(
      (h) => (!q || R.normName(h.name).includes(q)) && (!el || h.element === el) && (!role || h.role === role) && (!ownedOnly || cache.owned.has(h.code)),
    );
  }

  /** Find the best hero for typed text: exact name, then starts-with, then contains. */
  function bestMatch(text, candidates) {
    const q = R.normName(text);
    if (!q) return null;
    return (
      candidates.find((h) => R.normName(h.name) === q) ||
      candidates.find((h) => R.normName(h.name).startsWith(q)) ||
      candidates.find((h) => R.normName(h.name).includes(q)) ||
      null
    );
  }

  function suggestionContext() {
    const s = store.settings;
    return {
      notes: s.useNotes ? store.notes : null,
      stats: s.useLearned ? cache.stats : null,
      learn: Learn,
      presets: s.usePresets ? store.presets : null,
      profile: s.usePlayer ? Learn.getProfile(cache.stats, store.draft.opponent) : null,
      owned: cache.owned.size ? cache.owned : null,
      useElement: s.useElement,
    };
  }

  // ====================================================================== tabs
  let activeTab = 'draft';
  document.querySelectorAll('.tab').forEach((btn) =>
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + activeTab));
      render();
    }),
  );
  const RENDER = {
    draft: () => renderDraft(),
    speed: () => renderSpeed(),
    heroes: () => renderHeroes(),
    teams: () => renderTeams(),
    players: () => renderPlayers(),
    history: () => renderHistory(),
    data: () => renderData(),
    auto: () => window.RTAAuto && window.RTAAuto.render(),
  };
  function render() {
    $('#hero-names').innerHTML = cache.heroes.map((h) => `<option value="${esc(h.name)}"></option>`).join('');
    $('#player-names').innerHTML = [...cache.stats.players.values()].map((p) => `<option value="${esc(p.name)}"></option>`).join('');
    RENDER[activeTab]();
  }

  // ===================================================================== draft
  const PHASE_LABEL = { preban: 'preban', pick: 'pick', postban: 'postban' };

  function renderDraft() {
    const d = store.draft;
    const v = L.draftView(d);
    const step = L.currentStep(d);
    $('#first-pick').value = d.firstPick;
    if (document.activeElement !== $('#opp-name')) $('#opp-name').value = d.opponent || '';
    renderProfileStrip();
    renderPending();

    const st = $('#draft-status');
    st.className = 'status' + (step ? ' ' + step.player : '');
    if (!step) {
      st.textContent = 'Draft complete. Record the result when the match ends.';
    } else {
      const steps = L.draftSteps(d.firstPick);
      let left = 0;
      for (let i = d.actions.length; i < steps.length && steps[i].phase === step.phase && steps[i].player === step.player; i++) left++;
      const who = step.player === 'me' ? 'Your' : "Opponent's";
      let extra = '';
      if (step.phase === 'postban') extra = step.player === 'me' ? ': ban one of their heroes' : ': they ban one of yours';
      st.textContent = `${who} ${PHASE_LABEL[step.phase]} (${left} left)${extra}`;
    }

    const slots = (codes, total, banned, isNextHere) => {
      let html = '';
      for (let i = 0; i < total; i++) {
        const c = codes[i];
        if (c) html += `<div class="slot filled${banned && banned.includes(c) ? ' banned' : ''}">${portrait(c, 'pt sm')}<span>${esc(nameOf(c))}</span></div>`;
        else html += `<div class="slot${isNextHere && i === codes.length ? ' next' : ''}">—</div>`;
      }
      return html;
    };
    const nextIs = (phase, player) => !!step && step.phase === phase && step.player === player;
    $('#me-prebans').innerHTML = slots(v.prebans.me, 2, null, nextIs('preban', 'me'));
    $('#opp-prebans').innerHTML = slots(v.prebans.opp, 2, null, nextIs('preban', 'opp'));
    $('#me-picks').innerHTML = slots(v.picks.me, 5, v.postbans.opp, nextIs('pick', 'me'));
    $('#opp-picks').innerHTML = slots(v.picks.opp, 5, v.postbans.me, nextIs('pick', 'opp'));
    $('#me-postban').innerHTML = slots(v.postbans.me, 1, null, nextIs('postban', 'me'));
    $('#opp-postban').innerHTML = slots(v.postbans.opp, 1, null, nextIs('postban', 'opp'));

    renderHeroGrid();
    renderSuggestions(step);
    $('#result-box').classList.toggle('hidden', !!step);
  }

  function gridCandidates() {
    const d = store.draft;
    const step = L.currentStep(d);
    let list = filterHeroes($('#hero-search').value, $('#filter-element').value, $('#filter-role').value, $('#filter-owned').checked);
    if (step && step.phase === 'postban') {
      const v = L.draftView(d);
      const other = step.player === 'me' ? 'opp' : 'me';
      list = list.filter((h) => v.picks[other].includes(h.code));
    }
    return list;
  }

  function renderHeroGrid() {
    const d = store.draft;
    const list = gridCandidates();
    $('#hero-grid').innerHTML =
      list
        .map((h) => {
          const reason = L.canSelect(d, h.code);
          const own = cache.owned.has(h.code);
          return `<button class="hero-btn${own ? ' owned' : ''}" data-code="${esc(h.code)}" ${reason ? `disabled title="${esc(reason)}"` : `title="${esc(R.ELEMENT_LABEL[h.element])} ${esc(R.ROLE_LABEL[h.role])}"`}>
            ${portrait(h.code, 'pt', true)}<span class="nm">${esc(h.name)}</span>${dot(h.element)}</button>`;
        })
        .join('') || '<p class="hint">No heroes match.</p>';
  }

  function renderPending() {
    const box = $('#pending-box');
    const p = store.pending;
    box.classList.toggle('hidden', !p);
    if (!p) return;
    const v = L.draftView(p);
    box.innerHTML = `<b>Previous draft not recorded</b>${p.opponent ? ` vs ${esc(p.opponent)}` : ''}: ${heroList(v.picks.me)} <i>vs</i> ${heroList(v.picks.opp)}
      <div class="btn-row"><button class="btn win" data-pending="win">Win</button><button class="btn loss" data-pending="loss">Loss</button><button class="btn" data-pending="discard">Discard</button></div>`;
  }
  $('#pending-box').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pending]');
    if (!b || !store.pending) return;
    if (b.dataset.pending !== 'discard') store.matches.unshift(matchFromDraft(store.pending, b.dataset.pending, ''));
    store.pending = null;
    save();
    renderDraft();
  });

  function renderProfileStrip() {
    const box = $('#opp-profile');
    const p = store.settings.usePlayer ? Learn.getProfile(cache.stats, store.draft.opponent) : null;
    if (!p) {
      box.classList.add('hidden');
      return;
    }
    const top = (arr, n = 3) => arr.slice(0, n).map((x) => `${esc(nameOf(x.code))} <small>${Math.round(x.rate * 100)}%</small>`).join(', ') || '—';
    box.innerHTML = `${srcBadge('player')} <b>${esc(p.name)}</b>: ${gm(p.games)}, you win ${pct(p.myWins, p.games)}
      · Picks: ${top(p.picks)} · Prebans: ${top(p.prebans, 2)}${p.firstPicks.length ? ` · First pick: ${top(p.firstPicks, 2)}` : ''}`;
    box.classList.remove('hidden');
  }

  function renderSuggestions(step) {
    const d = store.draft;
    const ctx = suggestionContext();
    let items = [];
    let title = 'Draft complete';
    if (step && step.phase === 'preban') {
      title = step.player === 'me' ? 'Preban ideas' : 'What they may preban';
      items = step.player === 'me' ? L.suggestPrebans(d, cache.heroes, ctx) : [];
    } else if (step && step.phase === 'pick') {
      title = step.player === 'me' ? 'Suggested picks for you' : 'What the opponent may pick';
      items = L.suggestPicks(d, cache.heroes, ctx);
    } else if (step) {
      title = step.player === 'me' ? 'Most dangerous enemy heroes' : 'Which of yours they may ban';
      items = L.suggestPostban(d, cache.heroes, ctx, step.player);
    }
    $('#suggest-title').textContent = title;
    $('#suggest-list').innerHTML = items.length
      ? items
          .map(
            (s) => `<li><button data-code="${esc(s.hero.code)}">${portrait(s.hero.code, 'pt sm')} ${esc(s.hero.name)}</button>
              <span class="score">${s.score > 0 ? '+' : ''}${s.score}</span>
              <span class="why">${s.reasons.map((r) => `${srcBadge(r.source)} ${esc(r.text)}`).join('<br>') || 'No data yet'}</span></li>`,
          )
          .join('')
      : step
        ? `<li class="hint">Nothing to suggest yet. Suggestions improve as you log matches, set tiers, counters and synergies, and import your roster.</li>`
        : '';
  }

  function selectHero(code) {
    if (L.canSelect(store.draft, code)) return false;
    store.draft = { ...L.select(store.draft, code), opponent: store.draft.opponent };
    save();
    renderDraft();
    return true;
  }

  $('#hero-grid').addEventListener('click', (e) => {
    const b = e.target.closest('.hero-btn');
    if (b && !b.disabled) selectHero(b.dataset.code);
  });
  $('#suggest-list').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-code]');
    if (b) selectHero(b.dataset.code);
  });
  ['#filter-element', '#filter-role', '#filter-owned'].forEach((s) => $(s).addEventListener('input', renderHeroGrid));
  $('#hero-search').addEventListener('input', renderHeroGrid);
  $('#hero-search').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const usable = gridCandidates().filter((h) => !L.canSelect(store.draft, h.code));
    const h = bestMatch(e.target.value, usable);
    if (h && selectHero(h.code)) {
      e.target.value = '';
      renderHeroGrid();
    }
  });
  $('#opp-name').addEventListener('input', (e) => {
    store.draft.opponent = e.target.value;
    save();
    renderProfileStrip();
    renderSuggestions(L.currentStep(store.draft));
  });
  $('#first-pick').addEventListener('change', (e) => {
    const hasPicks = store.draft.actions.some((a) => a.phase !== 'preban');
    if (hasPicks && !confirm('Picks already started. Changing first pick will start a new draft. Continue?')) {
      e.target.value = store.draft.firstPick;
      return;
    }
    store.draft = hasPicks ? { ...L.newDraft(e.target.value), opponent: store.draft.opponent } : { ...store.draft, firstPick: e.target.value };
    save();
    renderDraft();
  });
  $('#draft-undo').addEventListener('click', () => {
    store.draft = { ...L.undo(store.draft), opponent: store.draft.opponent };
    save();
    renderDraft();
  });
  $('#draft-reset').addEventListener('click', () => {
    if (store.draft.actions.length && !confirm('Clear the current draft?')) return;
    store.draft = { ...L.newDraft(store.draft.firstPick), opponent: '' };
    save();
    renderDraft();
  });

  function matchFromDraft(draft, result, notes) {
    const v = L.draftView(draft);
    return {
      id: newId(),
      source: 'manual',
      date: new Date().toISOString(),
      result,
      opponent: (draft.opponent || '').trim(),
      firstPick: draft.firstPick,
      myPrebans: v.prebans.me,
      oppPrebans: v.prebans.opp,
      myPicks: v.picks.me,
      oppPicks: v.picks.opp,
      iBanned: v.postbans.me[0] || null,
      theyBanned: v.postbans.opp[0] || null,
      notes,
    };
  }
  function recordResult(result) {
    store.matches.unshift(matchFromDraft(store.draft, result, $('#result-notes').value.trim()));
    $('#result-notes').value = '';
    store.draft = { ...L.newDraft(store.draft.firstPick), opponent: '' };
    save();
    renderDraft();
  }
  $('#record-win').addEventListener('click', () => recordResult('win'));
  $('#record-loss').addEventListener('click', () => recordResult('loss'));
  $('#save-team-preset').addEventListener('click', () => {
    const picks = L.draftView(store.draft).picks.me;
    const name = prompt('Preset name?', picks.slice(0, 2).map(nameOf).join(' + '));
    if (!name) return;
    store.presets.push({ id: newId(), name: name.trim(), heroes: picks, notes: '' });
    save();
    alert('Preset saved. See the Teams tab.');
  });

  // ===================================================================== speed
  function renderSpeed() {
    $('#cr-variance').value = store.settings.variance;
    const est = L.estimateEnemySpeed($('#cr-myspeed').value, $('#cr-enemy').value, store.settings.variance);
    $('#cr-out').innerHTML = est
      ? `<div class="big">≈ ${est.estimate}</div>Likely between <b>${est.min}</b> and <b>${est.max}</b>`
      : 'Enter your speed and their CR %.';
    const os = L.speedToOutspeed($('#os-enemy').value, store.settings.variance);
    $('#os-out').innerHTML = os
      ? `<div class="big">${os.guaranteed}+</div>to always go first.<br><span class="hint">${os.noVariance}+ beats them only if neither side gets random starting CR.</span>`
      : 'Enter enemy speed.';
    renderSim();
  }

  function renderSim() {
    const body = $('#sim-units');
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
    $('#sim-out').innerHTML = L.simulateTurns(store.sim, turns)
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
      store.settings.variance = n;
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
    const banned = new Set([...v.postbans.me, ...v.postbans.opp]);
    const units = [];
    for (const side of ['me', 'opp']) {
      for (const c of v.picks[side]) {
        if (banned.has(c)) continue;
        const old = store.sim.find((u) => u.name === nameOf(c));
        units.push(old || { name: nameOf(c), side, speed: 200, startCR: 0, pushAllies: 0, pushOnce: false });
      }
    }
    if (!units.length) return alert('Pick some heroes in the Draft tab first.');
    store.sim = units;
    $('#sim-units').innerHTML = '';
    save();
    renderSim();
  });

  // ==================================================================== heroes
  function renderHeroes() {
    const ownedOnly = $('#db-owned-only').checked;
    const notedOnly = $('#db-noted-only').checked;
    const list = filterHeroes($('#db-search').value, $('#db-element').value, $('#db-role').value, ownedOnly).filter((h) => !notedOnly || store.notes[h.code]);
    $('#db-count').textContent = `${list.length} of ${cache.heroes.length} heroes · ${cache.owned.size} owned`;
    const shown = list.slice(0, 400);
    $('#db-rows').innerHTML = shown
      .map((h) => {
        const n = store.notes[h.code] || {};
        const st = cache.stats.hero.get(h.code);
        const fr = cache.stars.has(h.code) ? `<span class="src fribbels" title="From Fribbels import">${cache.stars.get(h.code) || ''}★</span>` : '';
        const learned = st && st.team.games ? `${pct(st.team.wins, st.team.games)} <small>(${st.team.games})</small>` : '—';
        return `<tr data-code="${esc(h.code)}">
          <td><input type="checkbox" data-owned ${store.manualOwned.includes(h.code) ? 'checked' : ''} title="Owned (set by hand)" /> ${fr}</td>
          <td class="hcell">${portrait(h.code, 'pt', true)}<span>${esc(h.name)}${h.source === 'custom' ? ' <span class="src other">custom</span>' : ''}</span></td>
          <td>${dot(h.element)} ${esc(R.ROLE_LABEL[h.role] || h.role)}</td>
          <td>${esc(n.tier || '—')}</td>
          <td class="small">${heroList(n.counters)}</td>
          <td class="small">${heroList(n.synergies)}</td>
          <td class="small">${learned}</td>
          <td><button class="btn" data-edit>Edit</button></td></tr>`;
      })
      .join('');
  }
  ['#db-search', '#db-element', '#db-role', '#db-owned-only', '#db-noted-only'].forEach((s) => $(s).addEventListener('input', renderHeroes));
  $('#db-rows').addEventListener('change', (e) => {
    if (!e.target.matches('[data-owned]')) return;
    const code = e.target.closest('tr').dataset.code;
    store.manualOwned = store.manualOwned.filter((c) => c !== code);
    if (e.target.checked) store.manualOwned.push(code);
    save();
    $('#db-count').textContent = `${cache.owned.size} owned`;
  });
  $('#db-rows').addEventListener('click', (e) => {
    if (e.target.matches('[data-edit]')) openEditor(e.target.closest('tr').dataset.code);
  });
  $('#db-add').addEventListener('click', () => openEditor(null));

  // hero editor
  const dlg = $('#hero-dialog');
  const form = $('#hero-form');
  let editing = null;

  function openEditor(code) {
    const h = code ? hero(code) : null;
    const n = (code && store.notes[code]) || {};
    editing = {
      code,
      isCustom: !h || h.source === 'custom',
      counters: [...(n.counters || [])],
      synergies: [...(n.synergies || [])],
    };
    $('#hero-dialog-title').textContent = h ? h.name : 'Add custom hero';
    $('#hero-source').textContent = h
      ? h.source === 'official'
        ? `Name, element and class come from the official hero list (${h.code}) and can't be edited here. Your notes are stored separately.`
        : 'Custom hero you added.'
      : 'For heroes missing from the official list. Stored separately as "custom".';
    $('#hero-delete').classList.toggle('hidden', !(h && h.source === 'custom'));
    form.heroName.value = h ? h.name : '';
    form.element.value = h ? h.element : 'fire';
    form.role.value = h ? h.role : 'warrior';
    for (const f of [form.heroName, form.element, form.role]) f.disabled = !editing.isCustom;
    form.tier.value = n.tier || '';
    form.owned.checked = !!code && store.manualOwned.includes(code);
    form.notes.value = n.notes || '';
    form.querySelectorAll('.chip-input').forEach((i) => (i.value = ''));
    renderChips();
    dlg.showModal();
  }
  function renderChips() {
    form.querySelectorAll('.chips').forEach((box) => {
      const f = box.dataset.field;
      box.innerHTML = editing[f].map((c) => `<span class="chip">${esc(nameOf(c))}<button type="button" data-rm="${esc(c)}">✕</button></span>`).join('');
    });
  }
  form.addEventListener('keydown', (e) => {
    if (!e.target.matches('.chip-input') || e.key !== 'Enter') return;
    e.preventDefault();
    const h = bestMatch(e.target.value, cache.heroes);
    if (!h) return alert('No hero with that name.');
    const f = e.target.dataset.field;
    if (!editing[f].includes(h.code) && h.code !== editing.code) editing[f].push(h.code);
    e.target.value = '';
    renderChips();
  });
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    const f = b.closest('.chips').dataset.field;
    editing[f] = editing[f].filter((c) => c !== b.dataset.rm);
    renderChips();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let code = editing.code;
    if (editing.isCustom) {
      const name = form.heroName.value.trim();
      if (!name) return;
      if (!code) {
        code = 'custom-' + (R.normName(name) || 'hero');
        while (cache.byCode.has(code)) code += 'x';
        store.custom.push({ code, name, element: form.element.value, role: form.role.value, source: 'custom' });
      } else {
        Object.assign(store.custom.find((h) => h.code === code), { name, element: form.element.value, role: form.role.value });
      }
    }
    const note = { tier: form.tier.value, counters: editing.counters, synergies: editing.synergies, notes: form.notes.value.trim() };
    if (note.tier || note.counters.length || note.synergies.length || note.notes) store.notes[code] = note;
    else delete store.notes[code];
    store.manualOwned = store.manualOwned.filter((c) => c !== code);
    if (form.owned.checked) store.manualOwned.push(code);
    save();
    dlg.close();
    render();
  });
  $('#hero-cancel').addEventListener('click', () => dlg.close());
  $('#hero-delete').addEventListener('click', () => {
    const code = editing.code;
    if (!code || !confirm(`Delete custom hero ${nameOf(code)}?`)) return;
    store.custom = store.custom.filter((h) => h.code !== code);
    delete store.notes[code];
    for (const n of Object.values(store.notes)) {
      n.counters = (n.counters || []).filter((c) => c !== code);
      n.synergies = (n.synergies || []).filter((c) => c !== code);
    }
    store.manualOwned = store.manualOwned.filter((c) => c !== code);
    save();
    dlg.close();
    render();
  });

  // ===================================================================== teams
  let presetEdit = { id: null, heroes: [] };

  function renderTeams() {
    $('#preset-chips').innerHTML = presetEdit.heroes.map((c) => `<span class="chip">${esc(nameOf(c))}<button type="button" data-rm="${esc(c)}">✕</button></span>`).join('');
    $('#preset-form-title').textContent = presetEdit.id ? 'Edit preset' : 'New preset';
    $('#preset-cancel').classList.toggle('hidden', !presetEdit.id);
    $('#preset-list').innerHTML =
      store.presets
        .map((p) => {
          const r = Learn.presetRecord(cache.enabledMatches, p.heroes);
          return `<li data-id="${esc(p.id)}"><div><b>${esc(p.name)}</b> <small class="hint">${r.games ? `${pct(r.wins, r.games)} in ${gm(r.games)}` : 'not played yet'}</small></div>
            <div class="chips">${p.heroes.map(heroChip).join('')}</div>
            ${p.notes ? `<div class="hint">${esc(p.notes)}</div>` : ''}
            <div class="btn-row"><button class="btn" data-edit-preset>Edit</button><button class="btn danger" data-del-preset>Delete</button></div></li>`;
        })
        .join('') || '<li class="hint">No presets yet.</li>';
    const combos = (size) =>
      Learn.topCombos(cache.enabledMatches, { size, minGames: 3, limit: 8 })
        .map((c) => `<li><div class="chips">${c.heroes.map(heroChip).join('')}</div><small class="hint">${pct(c.wins, c.games)} in ${gm(c.games)}</small></li>`)
        .join('') || '<li class="hint">Needs at least 3 games with the same heroes.</li>';
    $('#combo-pairs').innerHTML = combos(2);
    $('#combo-trios').innerHTML = combos(3);
  }
  $('#preset-hero-input').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const h = bestMatch(e.target.value, cache.heroes);
    if (!h) return alert('No hero with that name.');
    if (!presetEdit.heroes.includes(h.code) && presetEdit.heroes.length < 5) presetEdit.heroes.push(h.code);
    e.target.value = '';
    renderTeams();
  });
  $('#preset-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    presetEdit.heroes = presetEdit.heroes.filter((c) => c !== b.dataset.rm);
    renderTeams();
  });
  $('#preset-save').addEventListener('click', () => {
    const name = $('#preset-name').value.trim();
    if (!name || presetEdit.heroes.length < 2) return alert('Give the preset a name and at least 2 heroes.');
    const p = { id: presetEdit.id || newId(), name, heroes: presetEdit.heroes, notes: $('#preset-notes').value.trim() };
    const i = store.presets.findIndex((x) => x.id === p.id);
    if (i >= 0) store.presets[i] = p;
    else store.presets.push(p);
    resetPresetForm();
    save();
    renderTeams();
  });
  function resetPresetForm() {
    presetEdit = { id: null, heroes: [] };
    $('#preset-name').value = '';
    $('#preset-notes').value = '';
  }
  $('#preset-cancel').addEventListener('click', () => {
    resetPresetForm();
    renderTeams();
  });
  $('#preset-list').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const p = store.presets.find((x) => x.id === li.dataset.id);
    if (e.target.matches('[data-edit-preset]')) {
      presetEdit = { id: p.id, heroes: [...p.heroes] };
      $('#preset-name').value = p.name;
      $('#preset-notes').value = p.notes || '';
      renderTeams();
    } else if (e.target.matches('[data-del-preset]') && confirm(`Delete preset ${p.name}?`)) {
      store.presets = store.presets.filter((x) => x.id !== p.id);
      save();
      renderTeams();
    }
  });

  // =================================================================== players
  let selectedPlayer = null;
  function renderPlayers() {
    const q = $('#pl-search').value.trim().toLowerCase();
    const players = [...cache.stats.players.values()].filter((p) => !q || p.name.toLowerCase().includes(q)).sort((a, b) => b.games - a.games);
    const top = (arr, n) => arr.slice(0, n).map((x) => esc(nameOf(x.code))).join(', ') || '—';
    $('#pl-rows').innerHTML =
      players
        .map(
          (p) => `<tr data-name="${esc(p.name.toLowerCase())}" class="clickable"><td><b>${esc(p.name)}</b></td><td>${p.games}</td><td>${pct(p.myWins, p.games)}</td>
          <td class="small">${top(p.picks, 4)}</td><td class="small">${top(p.prebans, 3)}</td><td class="small">${p.lastSeen ? new Date(p.lastSeen).toLocaleDateString() : '—'}</td></tr>`,
        )
        .join('') || '<tr><td colspan="6" class="hint">No player data yet. Enter the opponent\'s name in the Draft tab before recording a result.</td></tr>';
    const det = $('#pl-detail');
    const p = selectedPlayer && cache.stats.players.get(selectedPlayer);
    det.classList.toggle('hidden', !p);
    if (!p) return;
    const list = (arr) => arr.map((x) => `<li>${heroChip(x.code)} <small>${x.n}× (${Math.round(x.rate * 100)}%)</small></li>`).join('') || '<li class="hint">—</li>';
    det.innerHTML = `<h3>${esc(p.name)} ${srcBadge('player')}</h3>
      <p class="hint">${gm(p.games)} · you win ${pct(p.myWins, p.games)} · they had first pick ${p.theyPickedFirst} times</p>
      <div class="cards">
        <div><h3>Picks</h3><ul class="plain-list">${list(p.picks.slice(0, 10))}</ul></div>
        <div><h3>Prebans</h3><ul class="plain-list">${list(p.prebans.slice(0, 6))}</ul></div>
        <div><h3>First picks</h3><ul class="plain-list">${list(p.firstPicks.slice(0, 6))}</ul></div>
        <div><h3>Postbans your…</h3><ul class="plain-list">${list(p.postbans.slice(0, 6))}</ul></div>
      </div>`;
  }
  $('#pl-search').addEventListener('input', renderPlayers);
  $('#pl-rows').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-name]');
    if (!tr) return;
    selectedPlayer = tr.dataset.name;
    renderPlayers();
  });

  // =================================================================== history
  function renderHistory() {
    const ms = cache.enabledMatches;
    const wins = ms.filter((m) => m.result === 'win').length;
    const fp = ms.filter((m) => m.firstPick === 'me');
    const sp = ms.filter((m) => m.firstPick === 'opp');
    const wr = (arr) => pct(arr.filter((m) => m.result === 'win').length, arr.length);
    $('#hist-summary').innerHTML = `
      <div class="card"><div class="hint">Matches (enabled sources)</div><div class="stat">${ms.length}</div></div>
      <div class="card"><div class="hint">Win rate</div><div class="stat">${pct(wins, ms.length)}</div></div>
      <div class="card"><div class="hint">When I pick first</div><div class="stat">${wr(fp)}</div><div class="hint">${gm(fp.length)}</div></div>
      <div class="card"><div class="hint">When they pick first</div><div class="stat">${wr(sp)}</div><div class="hint">${gm(sp.length)}</div></div>`;

    const H = [...cache.stats.hero.entries()];
    const rows = (key) =>
      H.filter(([, s]) => s[key].games)
        .sort((a, b) => b[1][key].games - a[1][key].games)
        .slice(0, 15)
        .map(([c, s]) => `<tr><td>${heroChip(c)}</td><td>${s[key].games}</td><td>${pct(s[key].wins, s[key].games)}</td></tr>`)
        .join('') || '<tr><td colspan="3" class="hint">No matches yet.</td></tr>';
    $('#hist-mine').innerHTML = rows('mine');
    $('#hist-vs').innerHTML = rows('vsMe');
    $('#hist-bans').innerHTML =
      H.filter(([, s]) => s.prebanned + s.postbanned)
        .sort((a, b) => b[1].prebanned + b[1].postbanned - (a[1].prebanned + a[1].postbanned))
        .slice(0, 15)
        .map(([c, s]) => `<tr><td>${heroChip(c)}</td><td>${s.prebanned}</td><td>${s.postbanned}</td></tr>`)
        .join('') || '<tr><td colspan="3" class="hint">No matches yet.</td></tr>';

    $('#hist-list').innerHTML =
      store.matches
        .slice(0, 300)
        .map((m) => {
          const off = (store.matchSources[m.source] || {}).enabled === false;
          return `<li class="${off ? 'off' : ''}"><span class="res ${m.result}">${m.result === 'win' ? 'WIN' : 'LOSS'}</span>
          <div><div><b>Me:</b> ${heroList(m.myPicks)}${m.theyBanned ? ` <span class="meta">(lost ${esc(nameOf(m.theyBanned))})</span>` : ''}</div>
          <div><b>${esc(m.opponent || 'Opp')}:</b> ${heroList(m.oppPicks)}${m.iBanned ? ` <span class="meta">(banned ${esc(nameOf(m.iBanned))})</span>` : ''}</div>
          <div class="meta"><span class="src other">${esc(m.source)}</span> ${m.date ? new Date(m.date).toLocaleString() : ''} · ${m.firstPick === 'me' ? 'I picked first' : 'They picked first'}${m.notes ? ' · ' + esc(m.notes) : ''}</div></div>
          <button class="btn" data-del="${esc(m.id)}" title="Delete">✕</button></li>`;
        })
        .join('') || '<li class="hint">Finish a draft and press Win or Loss to log a match.</li>';
  }
  $('#hist-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b || !confirm('Delete this match?')) return;
    store.matches = store.matches.filter((m) => m.id !== b.dataset.del);
    save();
    renderHistory();
  });

  // ====================================================================== data
  const SETTING_BOXES = {
    '#use-notes': 'useNotes',
    '#use-learned': 'useLearned',
    '#use-element': 'useElement',
    '#use-presets': 'usePresets',
    '#use-player': 'usePlayer',
    '#use-fribbels': 'useFribbels',
    '#use-manual-owned': 'useManualOwned',
  };

  function renderData() {
    const off = store.official || SNAPSHOT;
    $('#src-official').innerHTML = `${off.heroes.length} heroes · ${store.official ? 'updated' : 'built-in copy from'} ${new Date(off.fetchedAt).toLocaleDateString()}<br><small>${esc(R.OFFICIAL_HERO_URL)}</small>`;
    const fr = store.fribbels;
    $('#src-fribbels').innerHTML = fr
      ? `${fr.heroes.length} heroes from <b>${esc(fr.fileName)}</b> (${new Date(fr.importedAt).toLocaleDateString()})${fr.unmatched.length ? `<br>Not recognised (${fr.unmatched.length}): ${esc(fr.unmatched.slice(0, 15).join(', '))}${fr.unmatched.length > 15 ? '…' : ''}` : ''}`
      : 'Nothing imported yet.';
    for (const [sel, k] of Object.entries(SETTING_BOXES)) $(sel).checked = !!store.settings[k];
    $('#src-notes').textContent = `${Object.keys(store.notes).length} heroes have notes · ${store.manualOwned.length} owned ticked by hand · ${store.custom.length} custom heroes`;

    const counts = {};
    for (const m of store.matches) counts[m.source] = (counts[m.source] || 0) + 1;
    $('#match-sources').innerHTML = Object.entries(store.matchSources)
      .map(
        ([k, s]) => `<tr data-src="${esc(k)}"><td><input type="checkbox" data-toggle ${s.enabled !== false ? 'checked' : ''} /></td>
        <td><span class="src other">${esc(k)}</span></td><td>${counts[k] || 0}</td><td class="small">${s.addedAt ? new Date(s.addedAt).toLocaleDateString() : '—'}</td>
        <td>${k === 'manual' ? '' : '<button class="btn danger" data-del-src>Delete</button>'}</td></tr>`,
      )
      .join('');
  }
  for (const [sel, k] of Object.entries(SETTING_BOXES)) {
    $(sel).addEventListener('change', (e) => {
      store.settings[k] = e.target.checked;
      save();
      renderData();
    });
  }
  $('#match-sources').addEventListener('change', (e) => {
    if (!e.target.matches('[data-toggle]')) return;
    store.matchSources[e.target.closest('tr').dataset.src].enabled = e.target.checked;
    save();
  });
  $('#match-sources').addEventListener('click', (e) => {
    if (!e.target.matches('[data-del-src]')) return;
    const k = e.target.closest('tr').dataset.src;
    if (!confirm(`Delete source "${k}" and all its matches?`)) return;
    store.matches = store.matches.filter((m) => m.source !== k);
    delete store.matchSources[k];
    save();
    renderData();
  });

  $('#official-refresh').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = 'Updating…';
    try {
      const res = await fetch(R.OFFICIAL_HERO_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const heroes = R.normalizeOfficial(await res.json(), 'en');
      if (heroes.length < 100) throw new Error('List looks incomplete; keeping the current one.');
      store.official = { source: 'official', url: R.OFFICIAL_HERO_URL, fetchedAt: new Date().toISOString(), heroes };
      save();
      alert(`Updated: ${heroes.length} heroes.`);
    } catch (err) {
      alert('Could not update the hero list: ' + err.message);
    }
    btn.disabled = false;
    btn.textContent = 'Update from official site';
    render();
  });

  $('#fribbels-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const r = R.parseFribbels(await file.text(), cache.heroes);
      store.fribbels = { source: 'fribbels', fileName: file.name, importedAt: new Date().toISOString(), ...r };
      store.settings.useFribbels = true;
      save();
      alert(`Imported ${r.heroes.length} owned heroes${r.unmatched.length ? `. ${r.unmatched.length} names were not recognised (listed in the Data tab).` : '.'}`);
    } catch (err) {
      alert('Could not import: ' + err.message);
    }
    render();
  });
  $('#fribbels-clear').addEventListener('click', () => {
    if (!store.fribbels || !confirm('Remove the Fribbels roster import?')) return;
    store.fribbels = null;
    save();
    render();
  });

  $('#csv-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const r = R.parseMatchCsv(await file.text(), cache.heroes);
      const name = prompt('Name this data source (so you can switch it off later):', file.name.replace(/\.[^.]+$/, ''));
      if (!name) return;
      const key = 'import:' + name.trim();
      if (store.matchSources[key] && !confirm(`Source "${key}" exists. Add these matches to it?`)) return;
      const now = new Date().toISOString();
      store.matchSources[key] = store.matchSources[key] || { enabled: true, addedAt: now };
      for (const m of r.matches) store.matches.push({ id: newId(), source: key, ...m, date: m.date || now });
      save();
      alert(`Imported ${r.matches.length} matches into "${key}".${r.unknown.length ? `\nUnknown hero names skipped: ${r.unknown.join(', ')}` : ''}`);
    } catch (err) {
      alert('Could not import: ' + err.message);
    }
    render();
  });
  $('#csv-template').addEventListener('click', () => {
    download(
      'rta-matches-template.csv',
      'result,opponent,first_pick,date,my_prebans,opp_prebans,my_picks,opp_picks,i_banned,they_banned,notes\n' +
        'win,PlayerName,me,2026-01-31,Hero A|Hero B,Hero C|Hero D,Hero 1|Hero 2|Hero 3|Hero 4|Hero 5,Hero 6|Hero 7|Hero 8|Hero 9|Hero 10,Hero 6,Hero 1,optional notes\n',
      'text/csv',
    );
  });

  function download(filename, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  $('#export').addEventListener('click', () => {
    download(`rta-helper-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'rta-helper', ...store }, null, 2), 'application/json');
  });
  $('#import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const next = data.version === 2 ? sanitize(data) : Array.isArray(data.heroes) ? migrateV1(data) : null;
      if (!next) throw new Error('Not a backup from this app.');
      if (!confirm('Replace ALL current data with this backup?')) return;
      store = next;
      $('#sim-units').innerHTML = '';
      save();
      render();
    } catch (err) {
      alert('Could not import: ' + err.message);
    }
  });
  $('#reset-all').addEventListener('click', () => {
    if (!confirm('Erase all data in this browser (notes, roster, matches, presets)? Export a backup first if unsure.')) return;
    store = emptyStore();
    $('#sim-units').innerHTML = '';
    save();
    render();
  });

  // ============================================== API for auto-detection (auto.js)
  window.RTAApp = {
    get store() {
      return store;
    },
    get cache() {
      return cache;
    },
    save,
    render,
    renderDraft,
    nameOf,
    portrait,
    bestMatch,
    esc,
    activeTab: () => activeTab,
    /** Replace the draft (auto-detection). A finished, unrecorded draft is kept as pending. */
    replaceDraft(next, { newMatch = false } = {}) {
      if (newMatch && L.isComplete(store.draft)) store.pending = { ...store.draft };
      store.draft = { opponent: newMatch ? '' : store.draft.opponent || '', ...next };
      save();
      if (activeTab === 'draft') renderDraft();
    },
    setOpponent(name) {
      if (store.draft.opponent) return;
      store.draft.opponent = name;
      save();
      if (activeTab === 'draft') renderDraft();
    },
  };

  // ======================================================================== go
  render();
})();
