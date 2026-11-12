/* UI layer. Depends on RTASources, RTARoster, RTAGear, RTALearn, RTALogic, RTATune (loaded before this file). */
(function () {
  'use strict';
  const L = window.RTALogic;
  const R = window.RTARoster;
  const Learn = window.RTALearn;
  const G = window.RTAGear;
  const Tune = window.RTATune;
  const SNAPSHOT = window.RTASources.officialSnapshot;
  const FRIB_SNAPSHOT = window.RTASources.fribbelsSnapshot;

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
   *   fribbelsData  hero base stats + artifact list (null = bundled snapshot)
   *   scouting      what you saw of opponents' heroes: speed, sets, artifact
   *   meta          imported meta datasets (pick/ban/win rates), one per name
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
    useMeta: true,
    useSpeed: true,
    useDeny: true,
    sound: true,
    autoRecord: true, // record results detected on screen (as source 'auto')
    useGameHelp: true,
    sourceWeights: null, // { group: multiplier } from "Tune from my matches" or sliders
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
      draft: freshDraft('me'),
      pending: null, // a finished draft that was replaced before its result was recorded
      sim: defaultSim(),
      auto: defaultAuto(),
      fribbelsData: null,
      scouting: [],
      meta: {},
      gameHelp: [], // what the game's RTA drafting help recommended (source 'game help')
    };
  }
  function freshDraft(firstPick, opponent = '') {
    return { ...L.newDraft(firstPick), opponent, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), suggestLog: [] };
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
      helpCount: 5, // heroes shown by the game's drafting help
      detectPostban: true,
      detectResult: true,
      autoReadCR: true,
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
    if (raw.draft && Array.isArray(raw.draft.actions)) s.draft = { ...freshDraft(raw.draft.firstPick), ...raw.draft };
    if (!Array.isArray(s.draft.suggestLog)) s.draft.suggestLog = [];
    s.fribbelsData = raw.fribbelsData && raw.fribbelsData.stats ? raw.fribbelsData : null;
    s.scouting = arr(raw.scouting);
    s.gameHelp = arr(raw.gameHelp);
    s.meta = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
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
    const fdata = store.fribbelsData || FRIB_SNAPSHOT;
    const builds = new Map();
    const mySpeeds = new Map();
    if (store.settings.useFribbels && store.fribbels && store.fribbels.builds) {
      for (const [code, b] of Object.entries(store.fribbels.builds)) {
        const r = G.computeBuild(code, b, fdata.stats);
        builds.set(code, r);
        if (r.speed) mySpeeds.set(code, r.speed);
      }
    }
    const scout = Learn.scoutSummary(store.scouting);
    const meta = store.settings.useMeta
      ? Object.entries(store.meta)
          .filter(([, m]) => m.enabled !== false)
          .map(([name, m]) => ({ name, rows: m.rows }))
      : [];
    const gameHelp = Learn.gameHelpStats(store.gameHelp, enabledMatches);
    cache = { heroes, byCode, owned, stars, enabledMatches, stats, fdata, builds, mySpeeds, scout, meta, gameHelp };
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
  const SRC_CLASS = { 'my notes': 'notes', learned: 'learned', 'game rule': 'rule', presets: 'presets', player: 'player', speed: 'speed', deny: 'deny', scouting: 'player', gear: 'fribbels', 'game help': 'game' };
  const srcBadge = (src) => `<span class="src ${SRC_CLASS[src] || (src.startsWith('meta') ? 'meta' : 'other')}">${esc(src)}</span>`;

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
      meta: cache.meta,
      speed: s.useSpeed
        ? { mine: cache.mySpeeds, player: s.usePlayer ? cache.scout.byPlayer.get(String(store.draft.opponent || '').trim().toLowerCase()) || null : null, all: cache.scout.all }
        : null,
      deny: s.useDeny,
      sourceWeights: s.sourceWeights,
      gameHelp: s.useGameHelp ? { live: liveGameHelp(), stats: cache.gameHelp } : null,
    };
  }

  /** The game's drafting-help list for the CURRENT draft step, if one was read. */
  let liveHelp = null;
  function liveGameHelp() {
    const d = store.draft;
    return liveHelp && liveHelp.draftId === d.id && liveHelp.step === d.actions.length ? liveHelp : null;
  }

  /** Typical speed seen for an enemy hero: { speed, low, high, n, who } or null. */
  function scoutedSpeed(code, opponent) {
    const p = cache.scout.byPlayer.get(String(opponent || '').trim().toLowerCase());
    const mine = p && p.get(code);
    if (mine && mine.speed) return { ...mine, who: 'this player' };
    const all = cache.scout.all.get(code);
    return all && all.speed ? { ...all, who: 'all players' } : null;
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
    $('#set-names').innerHTML = G.SET_NAMES.map((n) => `<option value="${esc(n)}"></option>`).join('');
    $('#artifact-names').innerHTML = cache.fdata.artifacts.map((x) => `<option value="${esc(x.name)}"></option>`).join('');
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
    renderTilt();

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
        if (c) {
          const spd = cache.mySpeeds.get(c);
          html += `<div class="slot filled${banned && banned.includes(c) ? ' banned' : ''}">${portrait(c, 'pt sm')}<span>${esc(nameOf(c))}</span>${spd && codes === v.picks.me ? `<small class="spd" title="Your speed (gear.txt)">${spd}</small>` : ''}</div>`;
        }
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
    renderInsights(step);
    renderScout();
    $('#result-box').classList.toggle('hidden', !!step);
    if (!step && document.activeElement !== $('#result-points')) {
      const last = Learn.sessionStats(cache.enabledMatches).points.slice(-1)[0];
      $('#result-points').placeholder = last ? `Points after match (last: ${last.points})` : 'Points after match (optional)';
    }
    cueTurn(step);
    for (const fn of draftListeners) fn();
  }
  const draftListeners = [];

  // ------------------------------------------------------------ turn sound
  let lastCueKey = null;
  let audioCtx = null;
  function cueTurn(step) {
    const key = step ? `${store.draft.id}:${store.draft.actions.length}` : null;
    const myTurnStarts = step && step.player === 'me' && (store.draft.actions.length === 0 || L.draftSteps(store.draft.firstPick)[store.draft.actions.length - 1].player !== 'me');
    if (!store.settings.sound || !myTurnStarts || key === lastCueKey) {
      lastCueKey = key;
      return;
    }
    lastCueKey = key;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.15, audioCtx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
      o.connect(g).connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + 0.4);
    } catch (_) { /* audio not available */ }
  }

  // ------------------------------------------------------- tilt / session
  function renderTilt() {
    const s = Learn.sessionStats(cache.enabledMatches);
    const box = $('#tilt-box');
    const tilt = s.streak.result === 'loss' && s.streak.n >= 3;
    box.classList.toggle('hidden', !tilt);
    if (tilt) box.innerHTML = `<b>${s.streak.n} losses in a row.</b> Today: ${s.today.wins}-${s.today.games - s.today.wins}. A short break often helps.`;
  }

  // ------------------------------------------------- pairs, risks, warnings
  function renderInsights(step) {
    const d = store.draft;
    const ctx = suggestionContext();
    const v = L.draftView(d);
    const out = [];
    if (step && step.phase === 'pick' && step.player === 'me') {
      const pairs = L.suggestPairs(d, cache.heroes, ctx);
      if (pairs.length) {
        out.push(`<div class="ins"><h4>Best pairs for this turn</h4>${pairs
          .map((p) => `<div class="pair"><button class="link" data-code="${esc(p.heroes[0].code)}">${heroChip(p.heroes[0].code)}</button>+<button class="link" data-code="${esc(p.heroes[1].code)}">${heroChip(p.heroes[1].code)}</button> <span class="score">+${p.score}</span>${p.together.length ? `<span class="why">${p.together.map((r) => `${srcBadge(r.source)} ${esc(r.text)}`).join(' ')}</span>` : ''}</div>`)
          .join('')}</div>`);
      }
      const risk = L.postbanRisk(d, cache.heroes, ctx);
      if (risk && risk.score > 0) {
        out.push(`<div class="ins warn"><h4>Postban risk</h4>${heroChip(risk.hero.code)} is their most likely ban (${Math.round(risk.share * 100)}% of your team's threat). Keep a plan without it.
          <span class="why">${risk.reasons.slice(0, 3).map((r) => `${srcBadge(r.source)} ${esc(r.text)}`).join(' ')}</span></div>`);
      }
    }
    if (v.picks.me.length >= 3) {
      const warns = L.compositionWarnings(v.picks.me, v.picks.opp, store.settings.useNotes ? store.notes : null);
      if (warns.length) out.push(`<div class="ins warn"><h4>Team check</h4>${warns.map((w) => `<div>${srcBadge(w.source)} ${esc(w.text)}</div>`).join('')}</div>`);
    }
    $('#insights').innerHTML = out.join('');
  }
  $('#insights').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-code]');
    if (b) selectHero(b.dataset.code);
  });

  // ------------------------------------------------------------- scouting
  /*
   * Scouting entries are ONE source ('scouting'): what you saw of the
   * opponent's heroes in this match. Speed can come from the CR-bar reader
   * (method 'cr-read') or be typed (method 'manual').
   */
  function scoutEntry(code) {
    return store.scouting.find((e) => e.draftId === store.draft.id && e.code === code);
  }
  function upsertScout(code, patch) {
    let e = scoutEntry(code);
    if (!e) {
      e = { id: newId(), draftId: store.draft.id, code, player: (store.draft.opponent || '').trim(), method: 'manual', at: new Date().toISOString(), sets: [], artifact: '' };
      store.scouting.push(e);
    }
    Object.assign(e, patch, { player: (store.draft.opponent || '').trim() });
    if (!e.speed && !(e.sets || []).length && !e.artifact && !e.notes) store.scouting = store.scouting.filter((x) => x !== e);
    save();
  }

  function renderScout() {
    const v = L.draftView(store.draft);
    const box = $('#scout');
    const enemies = v.picks.opp.filter((c) => !v.postbans.me.includes(c));
    box.classList.toggle('hidden', !enemies.length);
    if (!enemies.length) return;
    if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return; // don't rebuild while typing
    const opp = store.draft.opponent;
    const myFighters = v.picks.me.filter((c) => !v.postbans.opp.includes(c));
    const myFast = myFighters.map((c) => [c, cache.mySpeeds.get(c)]).filter(([, s]) => s).sort((a, b) => b[1] - a[1])[0];
    let theirFast = null;
    const rows = enemies
      .map((c) => {
        const e = scoutEntry(c) || {};
        const seen = scoutedSpeed(c, opp);
        const sp = Number(e.speed) || (seen && seen.speed) || null;
        if (sp && (!theirFast || sp > theirFast[1])) theirFast = [c, sp];
        const base = cache.fdata.stats[c] && cache.fdata.stats[c].spd;
        const hist = (() => {
          const all = cache.scout.all.get(c);
          const p = opp && cache.scout.byPlayer.get(opp.trim().toLowerCase());
          const ph = p && p.get(c);
          const bits = [];
          if (ph && ph.n) bits.push(`${esc(opp)}: ${ph.speed ? '~' + ph.speed : '?'} (${ph.n}×)${ph.sets[0] ? ' · ' + esc(ph.sets[0].name) : ''}${ph.artifacts[0] ? ' · ' + esc(ph.artifacts[0].name) : ''}`);
          if (all && all.speeds) bits.push(`all: ${all.low === all.high ? '~' + all.low : `${all.low}–${all.high}`} (${all.speeds})`);
          return bits.join('<br>') || '<span class="hint">not seen yet</span>';
        })();
        return `<tr data-code="${esc(c)}">
          <td>${heroChip(c)}${base ? `<div class="hint">base ${base}</div>` : ''}</td>
          <td><input type="number" min="1" max="400" data-f="speed" value="${esc(e.speed || '')}" placeholder="${seen && seen.speed ? '~' + seen.speed : 'speed'}" />${e.method === 'cr-read' ? '<div class="hint">from CR bar</div>' : ''}</td>
          <td><input data-f="sets" list="set-names" value="${esc((e.sets || []).join(', '))}" placeholder="e.g. Speed, Critical" /></td>
          <td><input data-f="artifact" list="artifact-names" value="${esc(e.artifact || '')}" placeholder="artifact" /></td>
          <td class="small">${hist}</td></tr>`;
      })
      .join('');
    let check = '';
    if (myFast && theirFast) {
      const os = L.speedToOutspeed(theirFast[1], store.settings.variance);
      const ok = myFast[1] >= os.guaranteed;
      const maybe = !ok && myFast[1] > theirFast[1];
      check = `<div class="ins ${ok ? 'good' : 'warn'}">${srcBadge('speed')} Your fastest ${esc(nameOf(myFast[0]))} <b>${myFast[1]}</b> vs their fastest known ${esc(nameOf(theirFast[0]))} <b>~${Math.round(theirFast[1])}</b>: ${ok ? 'you should move first.' : maybe ? 'close — random starting CR can flip it.' : 'they likely move first.'}</div>`;
    }
    box.innerHTML = `<h3>Scouting ${srcBadge('scouting')}</h3>
      <p class="hint">Note what you see of their heroes. It's saved per player and per hero, and used for speed checks next time. Speeds fill in automatically when the CR bar is read.</p>
      ${check}
      <div class="table-wrap"><table class="mini scout-table"><thead><tr><th>Enemy</th><th>Speed</th><th>Sets</th><th>Artifact</th><th>Seen before</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  $('#scout').addEventListener('change', (e) => {
    const f = e.target.dataset.f;
    const tr = e.target.closest('tr[data-code]');
    if (!f || !tr) return;
    let val = e.target.value.trim();
    if (f === 'speed') val = Number(val) || null;
    if (f === 'sets') val = val.split(/[,+]/).map((x) => x.trim()).filter(Boolean);
    upsertScout(tr.dataset.code, { [f]: val, ...(f === 'speed' ? { method: 'manual' } : {}) });
    renderScout();
  });

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
    if (b.dataset.pending !== 'discard') {
      const m = matchFromDraft(store.pending, b.dataset.pending, '');
      store.matches.unshift(m);
      linkScouting(store.pending, m.id);
    }
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
    logSuggestion(code);
    store.draft = { ...L.select(store.draft, code), opponent: store.draft.opponent };
    save();
    renderDraft();
    return true;
  }

  /** Remember what was suggested when I made each pick (to measure if suggestions help). */
  function logSuggestion(code) {
    const step = L.currentStep(store.draft);
    if (!step || step.phase !== 'pick' || step.player !== 'me') return;
    const top = L.suggestPicks(store.draft, cache.heroes, suggestionContext(), 3).map((s) => s.hero.code);
    store.draft.suggestLog = [...(store.draft.suggestLog || []), { chosen: code, top }];
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
    store.draft = hasPicks ? freshDraft(e.target.value, store.draft.opponent) : { ...store.draft, firstPick: e.target.value };
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
    store.draft = freshDraft(store.draft.firstPick);
    save();
    renderDraft();
  });

  function matchFromDraft(draft, result, notes, source = 'manual', points = null) {
    const v = L.draftView(draft);
    return {
      id: newId(),
      source,
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
      points: typeof points === 'number' && !Number.isNaN(points) ? points : undefined,
      draftId: draft.id,
      suggestLog: draft.suggestLog || [],
    };
  }
  /** Link this draft's scouting entries to the recorded match and opponent. */
  function linkScouting(draft, matchId) {
    for (const e of store.scouting) if (e.draftId === draft.id) Object.assign(e, { matchId, player: (draft.opponent || '').trim() });
    for (const e of store.gameHelp) if (e.draftId === draft.id) Object.assign(e, { matchId, opponent: (draft.opponent || '').trim() });
  }
  function recordResult(result, source = 'manual') {
    const pts = $('#result-points').value.trim();
    const m = matchFromDraft(store.draft, result, $('#result-notes').value.trim(), source, pts === '' ? null : Number(pts));
    if (!store.matchSources[source]) store.matchSources[source] = { enabled: true, addedAt: new Date().toISOString() };
    store.matches.unshift(m);
    linkScouting(store.draft, m.id);
    $('#result-notes').value = '';
    $('#result-points').value = '';
    store.draft = freshDraft(store.draft.firstPick);
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
        const scouted = side === 'opp' ? (scoutEntry(c) && Number(scoutEntry(c).speed)) || (scoutedSpeed(c, store.draft.opponent) || {}).speed : null;
        const speed = side === 'me' ? cache.mySpeeds.get(c) : scouted;
        units.push({ ...(old || { name: nameOf(c), side, speed: 200, startCR: 0, pushAllies: 0, pushOnce: false }), ...(speed ? { speed: Math.round(speed) } : {}) });
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
        const b = cache.builds.get(h.code);
        const build = b
          ? `<b>${b.speed ?? '?'}</b> spd${b.eeSpeedPossible ? '<span title="Exclusive equipment can add speed; not included">*</span>' : ''}<br>${esc(b.sets.join(' + ') || 'no sets')}${b.artifact ? '<br>' + esc(b.artifact) : ''}${b.note ? `<br><span class="hint">${esc(b.note)}</span>` : ''}`
          : '';
        const tags = (n.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');
        return `<tr data-code="${esc(h.code)}">
          <td><input type="checkbox" data-owned ${store.manualOwned.includes(h.code) ? 'checked' : ''} title="Owned (set by hand)" /> ${fr}</td>
          <td class="hcell">${portrait(h.code, 'pt', true)}<span>${esc(h.name)}${h.source === 'custom' ? ' <span class="src other">custom</span>' : ''}</span></td>
          <td>${dot(h.element)} ${esc(R.ROLE_LABEL[h.role] || h.role)}</td>
          <td>${esc(n.tier || '—')}${tags ? '<br>' + tags : ''}</td>
          <td class="small">${build}</td>
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
    $('#tag-boxes').innerHTML = L.TAGS.map((t) => `<label class="inline tagbox"><input type="checkbox" value="${esc(t)}" ${(n.tags || []).includes(t) ? 'checked' : ''}/> ${esc(t)}</label>`).join('');
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
    const tags = [...document.querySelectorAll('#tag-boxes input:checked')].map((i) => i.value);
    const note = { tier: form.tier.value, counters: editing.counters, synergies: editing.synergies, notes: form.notes.value.trim(), tags };
    if (note.tier || note.counters.length || note.synergies.length || note.notes || tags.length) store.notes[code] = note;
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
    renderGameHelpDb();
  }
  function renderGameHelpDb() {
    const gh = cache.gameHelp;
    const top = (m, n = 8) =>
      [...(m || new Map()).entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([c, k]) => `<li>${heroChip(c)} <small class="hint">${k}×</small></li>`)
        .join('') || '<li class="hint">—</li>';
    const q = $('#gh-hero').value;
    const h = q ? bestMatch(q, cache.heroes) : null;
    $('#gh-out').innerHTML = !gh.entries
      ? '<p class="hint">Nothing yet. Calibrate the drafting help in the Auto tab; every recommendation the game shows during your drafts is saved here.</p>'
      : h
        ? `<div class="cards"><div><h4>Recommended against ${esc(h.name)}</h4><ul class="plain-list">${top(gh.against.get(h.code))}</ul></div>
            <div><h4>Recommended with ${esc(h.name)}</h4><ul class="plain-list">${top(gh.with.get(h.code))}</ul></div></div>`
        : `<div class="cards"><div><h4>Most recommended picks</h4><ul class="plain-list">${top(gh.picks)}</ul></div>
            <div><h4>Most recommended bans</h4><ul class="plain-list">${top(gh.bans)}</ul></div></div>`;
  }
  $('#gh-hero').addEventListener('input', renderGameHelpDb);

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
      </div>${scoutTable(cache.scout.byPlayer.get(selectedPlayer))}`;
  }
  function scoutTable(map) {
    if (!map || !map.size) return '';
    const rows = [...map.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .map(([c, x]) => `<tr><td>${heroChip(c)}</td><td>${x.speed ? `~${x.speed}${x.speeds > 1 ? ` <small>(${x.low}–${x.high})</small>` : ''}` : '—'}</td><td class="small">${esc((x.sets[0] || {}).name || '—')}</td><td class="small">${esc((x.artifacts[0] || {}).name || '—')}</td><td>${x.n}</td></tr>`)
      .join('');
    return `<h3 style="margin-top:12px">Their builds ${srcBadge('scouting')}</h3><div class="table-wrap"><table class="mini"><thead><tr><th>Hero</th><th>Speed</th><th>Sets</th><th>Artifact</th><th>Seen</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
    const ses = Learn.sessionStats(ms);
    const fol = Learn.suggestionFollow(ms);
    $('#hist-session').innerHTML = `
      <div class="card"><div class="hint">Today</div><div class="stat">${ses.today.wins}-${ses.today.games - ses.today.wins}</div>
        <div class="hint">Streak: ${ses.streak.n ? `${ses.streak.n} ${ses.streak.result === 'win' ? 'win' : 'loss'}${ses.streak.n > 1 ? (ses.streak.result === 'win' ? 's' : 'es') : ''}` : '—'}</div></div>
      <div class="card"><div class="hint">Following suggestions ${srcBadge('learned')}</div>
        ${fol.picks ? `<div class="stat">${pct(fol.followed, fol.picks)}</div><div class="hint">of your picks were in the top 3.<br>Mostly followed (3+ picks): ${pct(fol.mostly.wins, fol.mostly.games)} win (${gm(fol.mostly.games)}) · Otherwise: ${pct(fol.rarely.wins, fol.rarely.games)} (${gm(fol.rarely.games)})</div>` : '<div class="hint">Recorded once you log matches drafted with this version.</div>'}</div>
      <div class="card"><div class="hint">Following the game's drafting help ${srcBadge('game help')}</div>
        ${cache.gameHelp.followed.games + cache.gameHelp.ignored.games ? `<div class="hint">Picked 2+ of its suggestions: <b>${pct(cache.gameHelp.followed.wins, cache.gameHelp.followed.games)}</b> win (${gm(cache.gameHelp.followed.games)})<br>Otherwise: <b>${pct(cache.gameHelp.ignored.wins, cache.gameHelp.ignored.games)}</b> (${gm(cache.gameHelp.ignored.games)})</div>` : '<div class="hint">Shown once the app has read the game\'s drafting help in recorded matches.</div>'}</div>
      <div class="card wide2"><div class="hint">Rank points</div>${pointsChart(ses.points)}</div>`;

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
          <div class="meta"><span class="src other">${esc(m.source)}</span>${typeof m.points === 'number' ? ` ${m.points} pts ·` : ''} ${m.date ? new Date(m.date).toLocaleString() : ''} · ${m.firstPick === 'me' ? 'I picked first' : 'They picked first'}${m.notes ? ' · ' + esc(m.notes) : ''}</div></div>
          <button class="btn" data-del="${esc(m.id)}" title="Delete">✕</button></li>`;
        })
        .join('') || '<li class="hint">Finish a draft and press Win or Loss to log a match.</li>';
  }
  function pointsChart(points) {
    if (points.length < 2) return '<div class="hint">Enter your points when you record results to see them here.</div>';
    const W = 320;
    const H = 90;
    const ys = points.map((p) => p.points);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const x = (i) => 6 + (i * (W - 12)) / (points.length - 1);
    const y = (v) => H - 8 - ((v - lo) / (hi - lo || 1)) * (H - 20);
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.points).toFixed(1)}`).join(' ');
    const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.points).toFixed(1)}" r="2.5" class="${p.result}"><title>${p.points}</title></circle>`).join('');
    return `<svg class="pts" viewBox="0 0 ${W} ${H}" role="img" aria-label="Rank points over time"><path d="${path}" /> ${dots}<text x="4" y="12">${hi}</text><text x="4" y="${H - 1}">${lo}</text></svg><div class="hint">Now: <b>${ys[ys.length - 1]}</b> (${ys[ys.length - 1] - ys[0] >= 0 ? '+' : ''}${ys[ys.length - 1] - ys[0]} over ${points.length} entries)</div>`;
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
    '#use-meta': 'useMeta',
    '#use-speed': 'useSpeed',
    '#use-deny': 'useDeny',
    '#use-sound': 'sound',
    '#use-auto-record': 'autoRecord',
    '#use-game-help': 'useGameHelp',
  };

  function renderData() {
    const off = store.official || SNAPSHOT;
    $('#src-official').innerHTML = `${off.heroes.length} heroes · ${store.official ? 'updated' : 'built-in copy from'} ${new Date(off.fetchedAt).toLocaleDateString()}<br><small>${esc(R.OFFICIAL_HERO_URL)}</small>`;
    const fr = store.fribbels;
    $('#src-fribbels').innerHTML = fr
      ? `${fr.heroes.length} heroes from <b>${esc(fr.fileName)}</b> (${new Date(fr.importedAt).toLocaleDateString()})${fr.unmatched.length ? `<br>Not recognised (${fr.unmatched.length}): ${esc(fr.unmatched.slice(0, 15).join(', '))}${fr.unmatched.length > 15 ? '…' : ''}` : ''}`
      : 'Nothing imported yet.';
    for (const [sel, k] of Object.entries(SETTING_BOXES)) $(sel).checked = !!store.settings[k];
    const fd = cache.fdata;
    $('#src-fdata').innerHTML = `${Object.keys(fd.stats).length} heroes' base stats · ${fd.artifacts.length} artifacts · ${store.fribbelsData ? 'updated' : 'built-in copy from'} ${new Date(fd.fetchedAt).toLocaleDateString()}`;
    $('#src-builds').textContent = cache.builds.size ? `${cache.builds.size} builds from your gear.txt · ${[...cache.builds.values()].filter((b) => b.itemCount >= 6).length} fully geared` : 'No gear yet: import gear.txt (it includes your equipped items).';
    $('#src-scouting').textContent = `${store.scouting.length} observations of ${new Set(store.scouting.map((e) => e.player).filter(Boolean)).size} players`;
    const gh = cache.gameHelp;
    $('#src-game-help').textContent = `${store.gameHelp.length} recommendation lists read · ${gh.picks.size} heroes recommended as picks, ${gh.bans.size} as bans`;
    $('#meta-sources').innerHTML =
      Object.entries(store.meta)
        .map(([k, m]) => `<tr data-meta="${esc(k)}"><td><input type="checkbox" data-toggle ${m.enabled !== false ? 'checked' : ''} /></td><td><span class="src meta">meta: ${esc(k)}</span></td><td>${Object.keys(m.rows).length}</td><td class="small">${m.addedAt ? new Date(m.addedAt).toLocaleDateString() : ''}</td><td><button class="btn danger" data-del-meta>Delete</button></td></tr>`)
        .join('') || '<tr><td colspan="5" class="hint">No meta datasets yet.</td></tr>';
    renderWeights();
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
      const text = await file.text();
      const r = R.parseFribbels(text, cache.heroes);
      const builds = G.extractBuilds(JSON.parse(text), cache.heroes);
      store.fribbels = { source: 'fribbels', fileName: file.name, importedAt: new Date().toISOString(), ...r, builds };
      // share the full inventory with the Gear Sorter page (gear.html)
      try {
        const g = JSON.parse(localStorage.getItem('rta-gear-v1') || '{}') || {};
        localStorage.setItem('rta-gear-v1', JSON.stringify({ ...g, fileName: file.name, importedAt: store.fribbels.importedAt, items: window.RTAGearSort ? window.RTAGearSort.slimInventory(JSON.parse(text), cache.heroes) : [] }));
      } catch (_) { /* storage full: the Gear page can import on its own */ }
      store.settings.useFribbels = true;
      save();
      const geared = Object.values(builds).filter((b) => b.items.length).length;
      alert(`Imported ${r.heroes.length} owned heroes and gear for ${geared} of them${r.unmatched.length ? `. ${r.unmatched.length} names were not recognised (listed in the Data tab).` : '.'}`);
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

  $('#fdata-refresh').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    try {
      // RexQian fork's data: S3 bucket first, then the fork's GitHub copy
      const get = async (url, fallback) => {
        try {
          const r = await fetch(url, { cache: 'no-cache' });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return await r.json();
        } catch (_) {
          return (await fetch(fallback, { cache: 'no-cache' })).json();
        }
      };
      const [h, a] = await Promise.all([get(G.HERO_STATS_URL, G.HERO_STATS_FALLBACK), get(G.ARTIFACT_URL, G.ARTIFACT_FALLBACK)]);
      const stats = G.normalizeHeroStats(h);
      const artifacts = G.normalizeArtifacts(a);
      if (Object.keys(stats).length < 100) throw new Error('Data looks incomplete; keeping the current copy.');
      store.fribbelsData = { source: 'fribbels-data', fetchedAt: new Date().toISOString(), stats, artifacts };
      save();
      alert(`Updated: ${Object.keys(stats).length} heroes, ${artifacts.length} artifacts.`);
    } catch (err) {
      alert('Could not update: ' + err.message);
    }
    btn.disabled = false;
    render();
  });
  $('#game-help-clear').addEventListener('click', () => {
    if (!store.gameHelp.length || !confirm("Delete everything read from the game's drafting help?")) return;
    store.gameHelp = [];
    liveHelp = null;
    save();
    render();
  });
  $('#game-help-export').addEventListener('click', () => {
    const n = (c) => `"${nameOf(c).replace(/"/g, '""')}"`;
    const rows = ['date,phase,whose_turn,opponent,recommended,my_picks,opp_picks'];
    for (const e of store.gameHelp) {
      const b = e.board || {};
      rows.push([e.at, e.phase, e.player, `"${(e.opponent || '').replace(/"/g, '""')}"`, (e.recs || []).map(n).join('|'), (b.myPicks || []).map(n).join('|'), (b.oppPicks || []).map(n).join('|')].join(','));
    }
    download('game-drafting-help.csv', rows.join('\n') + '\n', 'text/csv');
  });
  $('#scouting-clear').addEventListener('click', () => {
    if (!store.scouting.length || !confirm('Delete all scouting observations?')) return;
    store.scouting = [];
    save();
    render();
  });

  // ------------------------------------------------------------ meta data
  $('#meta-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const rows = parseMetaCsv(await file.text());
      const name = prompt('Name this meta dataset (e.g. "Spring 2026 Champion+"):', file.name.replace(/\.[^.]+$/, ''));
      if (!name) return;
      store.meta[name.trim()] = { enabled: true, addedAt: new Date().toISOString(), rows: rows.rows };
      save();
      alert(`Imported ${Object.keys(rows.rows).length} heroes into "meta: ${name.trim()}".${rows.unknown.length ? `\nUnknown names skipped: ${rows.unknown.join(', ')}` : ''}`);
    } catch (err) {
      alert('Could not import: ' + err.message);
    }
    render();
  });
  /** hero,pick_rate,ban_rate,preban_rate,win_rate  (rates as 12.5 or 0.125 or 12.5%) */
  function parseMetaCsv(text) {
    const rows = R.parseCsv(text).filter((r) => r.some((c) => String(c).trim()));
    if (rows.length < 2) throw new Error('Needs a header row and at least one hero.');
    const head = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const col = (n) => head.findIndex((h) => h === n || h === n.replace('_rate', ''));
    if (col('hero') < 0) throw new Error('Needs a "hero" column.');
    const rate = (v) => {
      const x = parseFloat(String(v || '').replace('%', ''));
      if (Number.isNaN(x)) return undefined;
      return x > 1 ? x / 100 : x;
    };
    const idx = R.nameIndex(cache.heroes);
    const out = {};
    const unknown = [];
    for (const r of rows.slice(1)) {
      const h = R.findHero(r[col('hero')], cache.heroes, idx);
      if (!h) {
        unknown.push(r[col('hero')]);
        continue;
      }
      const get = (n) => (col(n) >= 0 ? rate(r[col(n)]) : undefined);
      out[h.code] = { pick: get('pick_rate'), ban: get('ban_rate'), preban: get('preban_rate'), win: get('win_rate') };
    }
    return { rows: out, unknown };
  }
  $('#meta-template').addEventListener('click', () => download('rta-meta-template.csv', 'hero,pick_rate,ban_rate,preban_rate,win_rate\nArbiter Vildred,35%,10%,8%,52%\n', 'text/csv'));
  $('#meta-sources').addEventListener('change', (e) => {
    if (!e.target.matches('[data-toggle]')) return;
    store.meta[e.target.closest('tr').dataset.meta].enabled = e.target.checked;
    save();
  });
  $('#meta-sources').addEventListener('click', (e) => {
    if (!e.target.matches('[data-del-meta]')) return;
    const k = e.target.closest('tr').dataset.meta;
    if (!confirm(`Delete meta dataset "${k}"?`)) return;
    delete store.meta[k];
    save();
    renderData();
  });

  // --------------------------------------------------------------- weights
  const WEIGHT_GROUPS = ['my notes', 'learned', 'game rule', 'presets', 'player', 'meta', 'speed', 'deny', 'game help'];
  function renderWeights() {
    const w = store.settings.sourceWeights || {};
    $('#weights').innerHTML = WEIGHT_GROUPS.map(
      (g) => `<label class="wrow">${srcBadge(g)} <input type="range" min="0" max="3" step="0.1" data-w="${esc(g)}" value="${w[g] ?? 1}" /> <span>${(w[g] ?? 1).toFixed(1)}×</span></label>`,
    ).join('');
  }
  $('#weights').addEventListener('input', (e) => {
    const g = e.target.dataset.w;
    if (!g) return;
    store.settings.sourceWeights = { ...(store.settings.sourceWeights || {}), [g]: Number(e.target.value) };
    e.target.nextElementSibling.textContent = Number(e.target.value).toFixed(1) + '×';
    save();
  });
  $('#weights-reset').addEventListener('click', () => {
    store.settings.sourceWeights = null;
    $('#tune-out').textContent = '';
    save();
    renderWeights();
  });
  $('#weights-tune').addEventListener('click', () => {
    const s = store.settings;
    const base = {
      notes: s.useNotes ? store.notes : null,
      presets: s.usePresets ? store.presets : null,
      useElement: s.useElement,
      meta: cache.meta,
      speed: s.useSpeed ? { mine: cache.mySpeeds, all: cache.scout.all } : null,
    };
    $('#tune-out').textContent = 'Working…';
    setTimeout(() => {
      const r = Tune.tuneWeights(cache.enabledMatches, cache.byCode, base, Learn, L);
      if (!r.ok) {
        $('#tune-out').textContent = r.reason;
        return;
      }
      store.settings.sourceWeights = { ...(store.settings.sourceWeights || {}), ...r.weights };
      save();
      renderWeights();
      $('#tune-out').innerHTML = `Tuned on ${r.n} matches. Correctly called ${Math.round(r.accuracyBefore * 100)}% of results before, ${Math.round(r.accuracyAfter * 100)}% after (measured on the same matches, so treat it as a rough guide).`;
    }, 30);
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
    if (!confirm('Erase all data in this browser (notes, roster, matches, presets, scouting)? Export a backup first if unsure.')) return;
    store = emptyStore();
    $('#sim-units').innerHTML = '';
    save();
    render();
  });

  // ========================================================= keyboard shortcuts
  /*
   * Work anywhere except while typing in a box:
   *   1/2/3  pick the 1st/2nd/3rd suggestion     U  undo        N  new draft
   *   W / L  record win / loss                    P  pop-out mini window
   *   R      read the CR bar now (auto tab)       ?  show this list
   */
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const k = e.key.toLowerCase();
    const step = L.currentStep(store.draft);
    if (['1', '2', '3'].includes(k)) {
      const b = document.querySelectorAll('#suggest-list button[data-code]')[Number(k) - 1];
      if (b) selectHero(b.dataset.code);
    } else if (k === 'u') $('#draft-undo').click();
    else if (k === 'n') $('#draft-reset').click();
    else if (k === 'w' && !step) recordResult('win');
    else if (k === 'l' && !step) recordResult('loss');
    else if (k === 'p' && window.RTAPip) window.RTAPip.toggle();
    else if (k === 'r' && window.RTAAuto) window.RTAAuto.readCR();
    else if (k === '?') alert('Shortcuts:\n1 / 2 / 3  pick suggestion\nU  undo\nN  new draft\nW / L  record win / loss\nP  pop-out mini window\nR  read CR bar now\n?  this list');
    else return;
    e.preventDefault();
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
    selectHero,
    recordResult,
    suggestionContext,
    scoutedSpeed,
    onDraftRender: (fn) => draftListeners.push(fn),
    /** Speeds read from the CR bar -> scouting entries for this draft (source 'scouting', method 'cr-read'). */
    addScoutSpeeds(list) {
      for (const r of list) if (r.side === 'opp' && r.speed) upsertScout(r.code, { speed: Math.round(r.speed), min: r.min, max: r.max, method: 'cr-read' });
      if (activeTab === 'draft') renderDraft();
    },
    /** A list read from the game's drafting help for the current step (source 'game help'). */
    addGameHelp({ phase, player, recs }) {
      const d = store.draft;
      const v = L.draftView(d);
      liveHelp = { draftId: d.id, step: d.actions.length, phase, player, recs };
      store.gameHelp.push({
        id: newId(),
        draftId: d.id,
        step: d.actions.length,
        phase,
        player,
        recs,
        board: { myPicks: v.picks.me, oppPicks: v.picks.opp, myPrebans: v.prebans.me, oppPrebans: v.prebans.opp },
        opponent: (d.opponent || '').trim(),
        at: new Date().toISOString(),
      });
      save();
      if (activeTab === 'draft') renderDraft();
      else for (const fn of draftListeners) fn();
    },
    replaceDraft(next, { newMatch = false } = {}) {
      if (newMatch && L.isComplete(store.draft)) store.pending = { ...store.draft };
      const keep = newMatch ? { id: newId(), suggestLog: [], opponent: '' } : { id: store.draft.id, suggestLog: store.draft.suggestLog || [], opponent: store.draft.opponent || '' };
      store.draft = { ...keep, ...next };
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
