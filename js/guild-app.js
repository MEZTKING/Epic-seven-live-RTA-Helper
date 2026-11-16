/* Guild War page. Uses RTARoster, RTAGear (your speeds), RTAGuildWar, RTASync. */
(function () {
  'use strict';
  const R = window.RTARoster;
  const GW = window.RTAGuildWar;
  const Sync = window.RTASync;
  const HEROES = window.RTASources.allHeroes || window.RTASources.officialSnapshot.heroes; // official + newest heroes (fribbels-data)
  const CONN_KEY = 'e7-guild-conn'; // { guildCode, guildName, myName, config }
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const byCode = new Map(HEROES.map((h) => [h.code, h]));
  const idx = R.nameIndex(HEROES);
  const nameOf = (c) => (byCode.get(c) || {}).name || c;
  const codeOf = (text) => {
    const h = R.findHero(text, HEROES, idx);
    return h ? h.code : null;
  };
  const pt = (c) => (byCode.get(c) ? `<img class="pt sm" alt="" src="${esc(R.PORTRAIT_URL(c))}" onerror="this.classList.add('broken')" />` : '');
  const chip = (c) => `<span class="hchip clickable" data-hero="${esc(c)}" title="Tap for skills and tags">${pt(c)}${esc(nameOf(c))}</span>`;
  const chipT = (c) => chip(c) + (window.HeroInfo ? window.HeroInfo.tagChips(c, 2) : '');
  const team = (codes) => (codes || []).map(chip).join('') || '<span class="hint">—</span>';
  const today = () => new Date().toISOString().slice(0, 10);
  const DOT_TEXT = {
    grey: 'No information',
    red: 'No chance right now',
    yellow: 'Not enough information / a catch',
    proven: 'Proven counter you own (gear not checked)',
    green: 'Proven counter + your gear checks out',
  };
  /** The coloured marker. `v` = a verdict from RTAGuildWar.teamVerdict / targetVerdict. */
  const dot = (v, attrs = '') => {
    const tip = [v.label, ...(v.lines || []), ...((v.others || []).length ? [`Also owned by: ${v.others.join(', ')}`] : [])].join('\n');
    return `<span class="gwdot ${v.level}" title="${esc(tip)}" aria-label="${esc(v.label)}" role="img" ${attrs}></span>`;
  };
  const pct = (w, g) => (g ? Math.round((w / g) * 100) + '%' : '—');

  let conn = loadConn();
  let backend = null;
  let records = [];
  let state = GW.buildState([]);
  let activeTab = 'war';
  // three fortresses on each side of a war, named per side and war (owner, DEVLOG #38/#39): read from the game's overview
  // into war.forts = { enemy: [left, middle, right], ours: [...] }; until then generic names
  const DEFAULT_FORTS = (window.E7GWMap && window.E7GWMap.DEFAULT_FORTS) || ['Left fortress', 'Middle fortress', 'Right fortress'];
  const fortsOf = (war, side = 'enemy') => DEFAULT_FORTS.map((d, i) => (war && war.forts && war.forts[side] && war.forts[side][i]) || d);
  let warId = null;

  function loadConn() {
    try {
      return JSON.parse(localStorage.getItem(CONN_KEY)) || {};
    } catch (_) {
      return {};
    }
  }
  function saveConn() {
    localStorage.setItem(CONN_KEY, JSON.stringify(conn));
  }
  const rules = () => ({ ...GW.DEFAULT_RULES, ...((state.settings && state.settings.rules) || {}) });

  /**
   * My own heroes and speeds, from the RTA helper's data on THIS device
   * (Fribbels gear.txt import). Used for the dots; speeds are only shared when
   * you log an attack and have "attach my speeds" on.
   */
  let mySpeedsCache = null;
  function mySpeeds() {
    if (mySpeedsCache) return mySpeedsCache;
    const out = new Map();
    try {
      const s = JSON.parse(localStorage.getItem('rta-helper-v2') || 'null');
      const builds = s && s.fribbels && s.fribbels.builds;
      const stats = ((s && s.fribbelsData) || window.RTASources.fribbelsSnapshot || {}).stats || {};
      if (builds && window.RTAGear) for (const [code, b] of Object.entries(builds)) {
        const r = window.RTAGear.computeBuild(code, b, stats);
        if (r.speed && r.itemCount) out.set(code, r.speed);
      }
      // speeds typed in the RTA hero editor (source 'my speeds') win, same as on the RTA page
      for (const [code, v] of Object.entries((s && s.mySpeeds) || {})) if (Number(v) > 0) out.set(code, Number(v));
    } catch (_) { /* no RTA data on this device */ }
    return (mySpeedsCache = out);
  }
  function meProfile() {
    const mm = state.members.find((m) => GW.playerKey(m.name) === GW.playerKey(me()));
    const local = localRoster();
    const roster = (mm && (mm.roster || []).length ? mm.roster : local) || [];
    const speeds = mySpeeds();
    return { name: me(), roster: roster.length ? new Set(roster) : null, speeds: speeds.size ? speeds : null };
  }
  const me = () => (conn.myName || '').trim();

  // ------------------------------------------------------------- connecting
  async function connect() {
    if (backend) backend.close();
    backend = null;
    records = [];
    if (!conn.guildCode) return status('No guild yet. Go to Setup to create or join one.', 'warn');
    try {
      backend = conn.config ? await Sync.firebase(conn.guildCode, conn.config) : await Sync.local(conn.guildCode);
    } catch (e) {
      status(`Could not connect to Firebase (${e.message}). Using this device only for now.`, 'warn');
      backend = await Sync.local(conn.guildCode);
    }
    backend.subscribe((list) => {
      loaded = true;
      records = list;
      state = GW.buildState(records);
      // names the fortress-map reader may match what it reads to (js/vision/readers/guild-fortress.js)
      try {
        localStorage.setItem('e7-gw-known-names', JSON.stringify([...new Set([...state.targets.map((t) => t.player), ...state.members.map((m) => m.name)].filter(Boolean))].slice(-1000)));
      } catch (_) { /* only a help */ }
      render();
    });
    status();
  }
  function status(msg, kind) {
    const el = $('#conn-status');
    const shared = backend && backend.kind === 'firebase';
    $('#sync-dot').classList.toggle('on', !!shared);
    el.className = 'status' + (kind === 'warn' ? ' opp' : shared ? ' me' : '');
    el.textContent =
      msg ||
      `${conn.guildName || 'Guild'} · ${shared ? `shared live (Firebase: ${backend.projectId})` : 'this device only — connect Firebase in Setup to share'} · you are ${me() || '(set your name in Setup)'}`;
  }
  async function put(type, data) {
    if (!backend) return alert('Create or join a guild first (Setup).');
    const r = { ...data, type, id: data.id || `${type[0]}-${GW.newId(10)}`, updatedBy: me() };
    await backend.put(r);
    return r;
  }
  async function ensureMember() {
    if (!me() || !backend) return;
    const id = 'm-' + GW.playerKey(me()).replace(/[^a-z0-9]+/g, '-');
    if (!state.members.some((m) => m.id === id)) await put('member', { id, name: me() });
  }

  // ------------------------------------------------------------------- tabs
  $$('.tab[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      activeTab = b.dataset.tab;
      $$('.tab[data-tab]').forEach((x) => x.classList.toggle('active', x === b));
      $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + activeTab));
      render();
    }),
  );

  function render() {
    $('#gw-heroes').innerHTML = HEROES.map((h) => `<option value="${esc(h.name)}"></option>`).join('');
    $('#gw-enemies').innerHTML = [...new Set(state.targets.map((t) => t.player).filter(Boolean))].map((n) => `<option value="${esc(n)}"></option>`).join('');
    $('#gw-members').innerHTML = state.members.map((m) => `<option value="${esc(m.name)}"></option>`).join('');
    if (!warId || !state.wars.some((w) => w.id === warId)) warId = (state.wars.find((w) => w.status !== 'done') || state.wars[0] || {}).id || null;
    ({ war: renderWar, counters: renderCounters, members: renderMembers, enemies: renderEnemies, setup: renderSetup })[activeTab]();
    for (const fn of listeners) fn();
    cacheGuildHeroes();
  }
  const listeners = [];
  /** Guild hero notes (records type 'hero') cached on this device so other pages can show them (read-only there). */
  function cacheGuildHeroes() {
    const out = {};
    for (const r of state.heroNotes || []) out[r.code] = { tags: r.tags || [], skills: r.skills || {}, updatedBy: r.updatedBy || '' };
    try {
      localStorage.setItem('e7-guild-heroes', JSON.stringify(out));
    } catch (_) { /* ignore */ }
  }
  if (window.HeroInfo) {
    window.HeroInfo.onTagsReady(() => render());
    window.HeroInfo.configure({
      getGuildNote: (code) => (state.heroNotes || []).find((r) => r.code === code) || null,
      async saveGuildNote(code, note) {
        if (!backend) return alert('Create or join a guild first (Setup).');
        await put('hero', { id: 'hero-' + code, code, ...note });
      },
    });
  }

  // -------------------------------------------------------------------- war
  function renderWar() {
    renderStandby();
    renderPending();
    renderNote();
    $('#war-select').innerHTML = state.wars.length
      ? state.wars.map((w) => `<option value="${esc(w.id)}" ${w.id === warId ? 'selected' : ''}>vs ${esc(w.enemyGuild)}${w.season ? ' · ' + esc(w.season) : ''} · ${esc(String(w.startedAt || '').slice(0, 10))}${w.status === 'done' ? ' (finished)' : ''}</option>`).join('')
      : '<option value="">No wars yet</option>';
    const box = $('#targets');
    if (!warId) {
      $('#war-summary').innerHTML = '';
      $('#war-ideas').classList.add('hidden');
      box.innerHTML = '<p class="hint">Press <b>New war</b> when a Guild War starts, then add the enemy defenses you see.</p>';
      return;
    }
    const R0 = rules();
    const sum = GW.warSummary(state, warId, R0);
    const myLeft = (sum.members.find((m) => GW.playerKey(m.name) === GW.playerKey(me())) || {}).left;
    const war = state.wars.find((w) => w.id === warId);
    const FORTS = fortsOf(war);
    // fortress filter: this war's enemy fortresses (+ any other tower text used)
    const fsel = $('#target-fort');
    if (fsel) {
      const keep = fsel.value;
      const opts = [...new Set([...FORTS, ...sum.targets.map((s) => s.target.tower).filter(Boolean)])];
      fsel.innerHTML = '<option value="">All fortresses</option>' + opts.map((o) => `<option ${o === keep ? 'selected' : ''}>${esc(o)}</option>`).join('');
    }
    if ($('#gw-forts')) $('#gw-forts').innerHTML = FORTS.map((f) => `<option value="${esc(f)}"></option>`).join('');
    // our side, as read from the game (Save as our … on a fortress map)
    const ours = (war && war.ourForts) || {};
    const ob = $('#war-ours');
    if (ob) {
      const rows = fortsOf(war, 'ours').filter((f) => ours[f]).map((f) => `<div><b>${esc(f)}</b>: ${ours[f].map((p) => `${esc(p.name)}${p.keep ? ' <span class="hint">(keep)</span>' : ''}${p.state === 'beaten' ? ' <span class="hint">✗</span>' : ''}`).join(', ')}</div>`);
      ob.innerHTML = rows.length ? `<h4 style="margin:0 0 4px">Our side <span class="src game">read from the game</span></h4>${rows.join('')}<div class="hint">✗ = beaten (grey ring) when it was read</div>` : '';
      ob.classList.toggle('hidden', !rows.length);
    }
    const ends = war && war.status !== 'done' && war.endsAt && Date.parse(war.endsAt) > Date.now() ? new Date(war.endsAt) : null;
    $('#war-summary').innerHTML = `${ends ? `<div class="card"><div class="hint">War ends <span class="src game">read from the game</span></div><div class="stat">in about ${span(ends - Date.now())}</div><div class="hint">around ${esc(ends.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }))}${war.enemyServer ? ` · enemy server: ${esc(war.enemyServer[0].toUpperCase() + war.enemyServer.slice(1))}` : ''}</div></div>` : ''}
      <div class="card"><div class="hint">Defenses cleared</div><div class="stat">${sum.cleared}/${sum.targets.length}</div><div class="hint">${sum.teamsCleared}/${sum.teamsTotal} teams</div></div>
      <div class="card"><div class="hint">Attacks</div><div class="stat">${sum.wins}-${sum.attacks - sum.wins}</div><div class="hint">win rate ${pct(sum.wins, sum.attacks)}</div></div>
      <div class="card"><div class="hint">Attacks left this war (guild)</div><div class="stat">${sum.attacksLeft}</div><div class="hint">${me() ? `You: ${myLeft ?? R0.attacksPerMember}` : ''}</div></div>
      <div class="card"><div class="hint">Members who still have attacks this war</div><div class="small">${sum.members.filter((m) => m.left > 0).map((m) => `${esc(m.name)} (${m.left})`).join(', ') || '—'}</div></div>`;
    const ideas = GW.assignmentIdeas(state, warId, R0).filter((i) => i.members.length);
    const ib = $('#war-ideas');
    ib.classList.toggle('hidden', !ideas.length);
    ib.innerHTML = `<h3>Who can take what <span class="src game">guild history</span></h3>${ideas
      .slice(0, 12)
      .map((i) => `<div class="pair"><b>${esc(i.target.player)}</b> team ${i.team}: ${esc(i.members.join(', '))} <span class="hint">(owns ${team(i.counters[0].attack)} · ${i.counters[0].wins}-${i.counters[0].games - i.counters[0].wins})</span></div>`)
      .join('')}`;

    const q = R.normName($('#target-search').value);
    const f = $('#target-filter').value;
    const fort = $('#target-fort') ? $('#target-fort').value : '';
    const book = GW.counterBook(state);
    const meP = meProfile();
    const verdicts = new Map(
      sum.targets.map((s) => {
        const v = GW.targetVerdict(state, s.target, meP, R0, book, nameOf);
        // the player's dot only looks at teams that are still standing
        const open = v.teams.filter((_, i) => !(s.teams[i] && s.teams[i].cleared));
        const worst = open.length ? open.reduce((w, t) => (GW.LEVELS.indexOf(t.level) < GW.LEVELS.indexOf(w.level) ? t : w), open[0]) : v;
        return [s.target.id, { ...v, level: worst.level, label: worst.label, lines: worst.lines, others: worst.others }];
      }),
    );
    const vf = $('#target-dot').value;
    const list = sum.targets.filter((s) => {
      if (vf && verdicts.get(s.target.id).level !== vf) return false;
      const t = s.target;
      if (fort && t.tower !== fort) return false;
      if (f === 'open' && s.cleared) return false;
      if (f === 'cleared' && !s.cleared) return false;
      if (f === 'mine' && GW.playerKey(t.assignedTo) !== GW.playerKey(me())) return false;
      if (!q) return true;
      const hay = [t.player, t.tower, ...(t.teams || []).flatMap((x) => (x.heroes || []).map(nameOf))].map(R.normName).join(' ');
      return hay.includes(q);
    });
    // fortresses in the game's order (Stinger, Darkwood, Vortex), then any other tower text; the keep last in each
    const fortRank = (t) => {
      const i = FORTS.indexOf(t.tower);
      return i < 0 ? FORTS.length : i;
    };
    list.sort((a, b) => Number(a.cleared) - Number(b.cleared) || fortRank(a.target) - fortRank(b.target) || String(a.target.tower || '').localeCompare(String(b.target.tower || ''), undefined, { numeric: true }) || Number(!!a.target.keep) - Number(!!b.target.keep));
    box.innerHTML =
      list
        .map((s) => {
          const t = s.target;
          const teams = (t.teams || []).slice(0, R0.teamsPerDefense).map((tm, i) => {
            const st = s.teams[i] || {};
            const tv = verdicts.get(t.id).teams[i] || { level: 'grey', label: DOT_TEXT.grey, lines: [] };
            const counters = GW.suggestCounters(tm.heroes || [], book, { members: state.members, limit: 2 });
            const speeds = Object.entries(tm.speeds || {}).filter(([, v]) => v);
            return `<div class="gw-team ${st.cleared ? 'cleared' : ''}">
              <div class="gw-team-head">${st.cleared ? '' : dot(tv)} Team ${i + 1} ${st.cleared ? `<span class="vd keep">${st.fromGame ? 'beaten (seen in the game)' : `cleared by ${esc(st.by)}`}</span>` : st.attempts ? `<span class="vd sell">${st.losses} failed</span>` : ''}</div>
              <div>${(tm.heroes || []).map(chipT).join('') || '<span class="hint">—</span>'}</div>
              ${speeds.length ? `<div class="hint">Speed: ${speeds.map(([c, v]) => `${esc(nameOf(c))} ${esc(v)}`).join(' · ')}</div>` : ''}
              ${tm.build ? `<div class="hint">${esc(tm.build)}</div>` : ''}
              ${!st.cleared && counters.length ? `<div class="hint">Beaten before by: ${counters.map((c) => `${c.attack.map(nameOf).map(esc).join(' + ')} (${c.wins}-${c.games - c.wins}${c.exact ? '' : ', similar'})`).join(' · ')}</div>` : ''}
              ${!st.cleared ? mechLine(tm.heroes) : ''}
              ${!st.cleared && tv.level !== 'grey' ? `<div class="hint verdict-line">${esc(tv.label)}${tv.lines.length ? ' · ' + esc(tv.lines[tv.lines.length - 1]) : ''}</div>` : ''}
              ${!st.cleared ? `<button class="btn" data-attack="${esc(t.id)}" data-team="${i + 1}">Log attack</button>` : ''}
            </div>`;
          });
          return `<div class="card gw-card ${s.cleared ? 'done' : ''}">
            <div class="gw-head">${s.cleared ? '<span class="gwdot done" title="Cleared"></span>' : dot(verdicts.get(t.id))}<button class="link" data-history="${esc(t.player)}" title="Show everything known about ${esc(t.player)}">${esc(t.player)}</button>${t.tower ? ` <span class="hint">· ${esc(t.tower)}${t.keep ? ' · keep' : ''}</span>` : ''}
              <span class="spacer"></span>
              <select data-assign="${esc(t.id)}" title="Assigned to"><option value="">Unassigned</option>${state.members.map((m) => `<option ${GW.playerKey(m.name) === GW.playerKey(t.assignedTo) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
              ${window.E7RecordsApp && window.E7RecordsApp.available() ? `<button class="btn desktop-only" data-record="${esc(t.id)}" title="This player's arena habits and builds from the official record site">Arena record</button>` : ''}
              <button class="btn" data-pin="${esc(t.player)}" title="Show in the pop-out window">⧉</button>
              <button class="btn" data-edit="${esc(t.id)}">Edit</button></div>
            ${teams.join('') || '<div class="hint">Defense not scouted yet: open this player in the game while watching, then "Save as … defense".</div>'}
            ${t.notes ? `<div class="hint">${esc(t.notes)}</div>` : ''}
            ${t.beaten ? `<div class="hint gw-beaten"><span class="src game">read from the game</span> Beaten: the fortress map showed a grey ring${t.beatenAt ? ` (${esc(new Date(t.beatenAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }))}${t.beatenBy ? `, ${esc(t.beatenBy)}` : ''})` : ''}. <button class="btn" data-unbeaten="${esc(t.id)}">Not beaten</button></div>` : ''}
            <div class="hint gw-record" data-record-out="${esc(t.id)}">${recordLine(t)}</div>
            <div class="hint">Last edit: ${esc(t.updatedBy || '?')}</div>
          </div>`;
        })
        .join('') || '<p class="hint">No enemy defenses added for this war yet.</p>';
  }
  $('#war-select').addEventListener('change', (e) => {
    warId = e.target.value;
    renderWar();
  });
  ['#target-search', '#target-filter', '#target-dot', '#target-fort'].forEach((s) => $(s) && $(s).addEventListener('input', renderWar));
  /** Start a war (button or automatically from the game). Other wars still marked active are finished: one at a time. */
  async function startWar(enemyGuild, season = '') {
    for (const w of state.wars.filter((x) => x.status !== 'done')) await put('war', { ...w, status: 'done' });
    return put('war', { enemyGuild, season, startedAt: new Date().toISOString(), status: 'active' });
  }
  const sameGuild = (a, b) => {
    const A = String(a || '').trim().toLowerCase();
    const B = String(b || '').trim().toLowerCase();
    if (!A || !B) return false;
    if (A === B) return true;
    const G = window.E7GWMap;
    return !!(G && G.matchName(A, [B])); // OCR can be a letter off
  };
  let autoUndo = null;
  let warBusy = null; // one warFromGame at a time (two at once could start the same war twice)
  const DISMISS = 'e7-gw-dismissed'; // { guild: at } wars you undid: not started again by themselves for 5 days
  const dismissed = () => {
    try {
      return JSON.parse(localStorage.getItem(DISMISS) || '{}') || {};
    } catch (_) {
      return {};
    }
  };
  const RECENT = 5 * 24 * 3600 * 1000;
  let loaded = false; // the guild's records have arrived at least once (before that, "no war yet" isn't known)
  /**
   * The enemy guild read from the game's Guild War overview (DEVLOG #40): pick that war, or start it.
   * Returns 'selected' | 'started' | 'same' | 'no-guild'.
   */
  function warFromGame(enemyGuild) {
    if (warBusy) return warBusy.then(() => warFromGame(enemyGuild));
    warBusy = warFromGameNow(enemyGuild).finally(() => (warBusy = null));
    return warBusy;
  }
  async function warFromGameNow(enemyGuild) {
    if (!enemyGuild || String(enemyGuild).trim().length < 3) return 'same';
    if (!backend || !loaded) {
      if (conn.guildCode) {
        // still connecting: wait for the guild's records (up to 30 s)
        for (let i = 0; i < 60 && !(backend && loaded); i++) await new Promise((r) => setTimeout(r, 500));
        if (!(backend && loaded)) return 'waiting';
        return warFromGameNow(enemyGuild);
      }
      status(`The game shows a war vs ${enemyGuild}. Set up your guild first (Setup), then it's tracked by itself.`);
      return 'no-guild';
    }
    const active = state.wars.find((w) => w.status !== 'done' && sameGuild(w.enemyGuild, enemyGuild));
    if (active) {
      if (warId === active.id) return 'same';
      warId = active.id;
      renderWar();
      return 'selected';
    }
    // a recent war vs this guild that was finished (by you) or undone is NOT started again by itself
    const recent = state.wars.find((w) => sameGuild(w.enemyGuild, enemyGuild) && Date.now() - Date.parse(w.startedAt || 0) < RECENT);
    if (recent) return 'same';
    const d = dismissed();
    if (Object.entries(d).some(([g, at]) => sameGuild(g, enemyGuild) && Date.now() - at < RECENT)) return 'same';
    const before = state.wars.filter((w) => w.status !== 'done');
    const season = (state.wars[0] && state.wars[0].season) || '';
    const w = await startWar(enemyGuild, season);
    warId = w.id;
    autoUndo = { war: w, finished: before };
    renderWar();
    showAutoWar(w);
    if (window.E7Diag) window.E7Diag.log('guild', `war vs ${enemyGuild} started from the game`);
    return 'started';
  }
  // ---- the Offense Team screen, the fight, a note (js/vision/readers/guild-offense.js; DEVLOG #58) ----------------
  /**
   * A defender's teams as the game shows them right now -> this war's target: new, filled, or (when a team is not the
   * saved one) updated with the earlier line-up kept. lineups: [codes ×3 | null, codes ×3 | null].
   * -> { target, what: 'new' (nothing was saved before) | 'updated' (they changed it) | 'same' }
   */
  async function lineupsFromGame(enemy, lineups) {
    let target = state.targets.find((t) => t.warId === warId && GW.playerKey(t.player) === GW.playerKey(enemy)) || null;
    if (!target) return { target: await put('target', { warId, player: enemy, tower: '', teams: lineups.map((hs) => ({ heroes: hs || [] })), notes: '' }), what: 'new' };
    const at = new Date().toISOString();
    const teams = Array.from({ length: Math.max(2, (target.teams || []).length) }, (_, i) => ({ ...((target.teams || [])[i] || {}) }));
    let touched = false;
    let changed = false; // a full team that was saved is another one now (not just an empty place filled)
    lineups.forEach((hs, i) => {
      if (!hs || hs.length !== 3) return;
      const was = (teams[i].heroes || []).filter(Boolean);
      if (was.length === 3 && GW.teamKey(was) === GW.teamKey(hs)) return;
      if (was.length === 3) {
        teams[i].earlier = [{ heroes: was, speeds: teams[i].speeds || {}, build: teams[i].build || '', until: at }, ...(teams[i].earlier || [])].slice(0, 5);
        changed = true;
      }
      teams[i] = { ...teams[i], heroes: hs, speeds: Object.fromEntries(Object.entries(teams[i].speeds || {}).filter(([c]) => hs.includes(c))) };
      touched = true;
    });
    if (!touched) return { target, what: 'same' };
    return { target: await put('target', { ...target, teams }), what: changed ? 'updated' : 'new' };
  }
  // The attack being prepared / fought: { warId, enemy, mine: [[codes], [codes]], theirs: [[codes], [codes]], at, started }
  const PENDING = 'e7-gw-pending-attack';
  const pendingAttack = () => {
    try {
      const p = JSON.parse(localStorage.getItem(PENDING) || 'null');
      return p && p.warId === warId && Date.now() - Date.parse(p.at || 0) < 3 * 3600 * 1000 ? p : null;
    } catch (_) {
      return null;
    }
  };
  const setPending = (p) => {
    try {
      if (p) localStorage.setItem(PENDING, JSON.stringify(p));
      else localStorage.removeItem(PENDING);
    } catch (_) { /* only a help */ }
    renderPending();
  };
  /** The Offense Team screen: their defense is saved as it stands now, and what I am about to attack with is kept. */
  async function offenseFromGame(d) {
    if (!d || d.away) return 'away';
    if (!backend || !loaded) return 'no-guild';
    if (!warId) return 'no-war';
    if (!d.enemy || !d.enemy.name) return 'no-name';
    const enemies = [...new Set(state.targets.filter((t) => t.warId === warId).map((t) => t.player).filter(Boolean))];
    let known = GW.matchPlayer(d.enemy.name, enemies);
    for (const o of d.enemy.options || []) known = known || GW.matchPlayer(o, enemies);
    const enemy = known || d.enemy.name;
    const sure = (t) => (t || []).filter((x) => x && x.sure).map((x) => x.code);
    const theirs = (d.theirs || []).map(sure);
    const r = theirs.some((hs) => hs.length === 3) ? await lineupsFromGame(enemy, theirs.map((hs) => (hs.length === 3 ? hs : null))) : { what: 'same' };
    const was = pendingAttack();
    setPending({ warId, enemy, mine: (d.mine || []).map(sure), theirs, at: new Date().toISOString(), started: !!(was && was.started && GW.playerKey(was.enemy) === GW.playerKey(enemy)) });
    current = enemy;
    for (const fn of listeners) fn();
    if (r.what !== 'same') status(`${enemy}'s defense was ${r.what === 'new' ? 'saved' : 'updated (they changed it)'} from the game's Offense Team screen.`);
    return r.what;
  }
  /** The fight is on screen: the attack prepared on the Offense Team screen really started. */
  function battleFromGame(d) {
    const p = pendingAttack();
    if (!p || !d) return 'nothing';
    if (!p.started && Date.now() - Date.parse(p.at) > 20 * 60 * 1000) return 'old';
    setPending({ ...p, started: true, round: Math.max(p.round || 0, d.round || 1) });
    return 'started';
  }
  function renderPending() {
    const el = $('#war-pending');
    if (!el) return;
    const p = pendingAttack();
    if (!p || !p.started) return el.classList.add('hidden');
    const team = (hs) => (hs && hs.length ? hs.map(nameOf).join(', ') : '?');
    el.innerHTML = `Your attack on <b>${esc(p.enemy)}</b> (seen in the game). How did it go? ${[0, 1]
      .map((i) => `<label>Round ${i + 1} <span class="hint">(${esc(team(p.mine[i]))} against ${esc(team(p.theirs[i]))})</span> <select data-pend="${i}"><option value="">not fought yet</option><option value="win">Won</option><option value="loss">Lost</option></select></label>`)
      .join(' ')} <button class="btn primary" id="war-pending-log">Log</button> <button class="btn" id="war-pending-no">Forget it</button>`;
    el.classList.remove('hidden');
    $('#war-pending-no').onclick = () => setPending(null);
    $('#war-pending-log').onclick = async () => {
      if (!me()) return alert('Set your name in Setup first.');
      const results = $$('[data-pend]', el).map((s) => s.value);
      if (!results.some(Boolean)) return alert('Choose Won or Lost for the rounds you fought.');
      const { target } = await lineupsFromGame(p.enemy, p.theirs.map((hs) => (hs.length === 3 ? hs : null)));
      const RS = window.E7GWResult;
      // the same battle read later from its result window is then known already (same key)
      const token = RS && results.every(Boolean) ? RS.key({ kind: 'attack', ours: me(), enemy: p.enemy, rounds: results.map((x) => ({ result: x, draw: false })) }) : `hand-${GW.newId(8)}`;
      const at = new Date().toISOString();
      for (let i = 0; i < 2; i++) {
        if (!results[i]) continue;
        const speeds = {};
        if (conn.shareSpeeds !== false) for (const h of p.mine[i] || []) if (mySpeeds().get(h)) speeds[h] = mySpeeds().get(h);
        await put('attack', { warId, targetId: target.id, team: i + 1, defense: p.theirs[i] || [], by: me(), heroes: p.mine[i] || [], speeds, result: results[i], notes: 'teams read from the Offense Team screen', token, at });
      }
      setPending(null);
    };
  }
  // A note a guildmate left on a defender in the game: which defender it is about is not on the note window, so it is
  // asked (the player the game showed just before is offered first).
  let noteWaiting = null; // { author, text, suggest }
  async function noteFromGame(d, suggest) {
    if (!d || !d.text || !backend || !loaded || !warId) return 'nothing';
    if (state.targets.some((t) => t.warId === warId && String(t.notes || '').includes(d.text))) return 'known';
    noteWaiting = { author: d.author || '', text: d.text, suggest: suggest || '' };
    renderNote();
    return 'ask';
  }
  function renderNote() {
    const el = $('#war-note');
    if (!el) return;
    if (!noteWaiting) return el.classList.add('hidden');
    const n = noteWaiting;
    const targets = state.targets.filter((t) => t.warId === warId && t.player);
    el.innerHTML = `A note read from the game, by <b>${esc(n.author)}</b>: “${esc(n.text)}”. Which enemy is it about? <select id="war-note-for"><option value="">choose…</option>${targets
      .map((t) => `<option value="${esc(t.id)}" ${n.suggest && GW.playerKey(t.player) === GW.playerKey(n.suggest) ? 'selected' : ''}>${esc(t.player)}${t.tower ? ' · ' + esc(t.tower) : ''}</option>`)
      .join('')}</select> <button class="btn primary" id="war-note-save">Save on that player</button> <button class="btn" id="war-note-no">Dismiss</button>`;
    el.classList.remove('hidden');
    $('#war-note-no').onclick = () => {
      noteWaiting = null;
      renderNote();
    };
    $('#war-note-save').onclick = async () => {
      const t = state.targets.find((x) => x.id === $('#war-note-for').value);
      if (!t) return alert('Choose the enemy player this note is about.');
      await put('target', { ...t, notes: [t.notes, `Note in the game by ${n.author}: ${n.text}`].filter(Boolean).join('\n') });
      noteWaiting = null;
      renderNote();
    };
  }

  // ---- a battle-result window read from the game (js/vision/readers/guild-result.js; DEVLOG #57) -----------------
  // "Successful Attack" / "Failed Defense" …: both players, both sides' two teams, the result of each round. It becomes
  // two attack records (one of ours attacked) or two defense records (one of ours was attacked), once, with Undo.
  let resultUndo = null; // { records: [what was written], restore: [records as they were before], base }
  const RESULT_UNDONE = 'e7-gw-result-undone'; // { "<war id>|<battle key>": time }: a result you undid is not logged again
  const undoneResults = () => {
    try {
      return JSON.parse(localStorage.getItem(RESULT_UNDONE) || '{}') || {};
    } catch (_) {
      return {};
    }
  };
  async function resultFromGame(d) {
    const RS = window.E7GWResult;
    if (!RS || !d || !Array.isArray(d.rounds)) return 'nothing';
    if (!backend || !loaded) return 'no-guild';
    if (!warId) {
      status('The game shows a battle result, but no war is running in the app. Open the Guild War overview in the game (the war starts by itself), or press New war.', 'warn');
      return 'no-war';
    }
    const members = state.members.map((m) => m.name);
    const enemies = [...new Set(state.targets.filter((t) => t.warId === warId).map((t) => t.player).filter(Boolean))];
    const match = (p, list) => {
      let n = GW.matchPlayer(p.name, list);
      for (const o of p.options || []) n = n || GW.matchPlayer(o, list);
      return n;
    };
    const L = { m: match(d.left, members), e: match(d.left, enemies) };
    const Rr = { m: match(d.right, members), e: match(d.right, enemies) };
    // whose page is open (the left player): a name we know decides; else the window's colour (red = enemy, green = ours)
    let side = d.side;
    const oursVotes = (L.m ? 1 : 0) + (Rr.e ? 1 : 0);
    const enemyVotes = (L.e ? 1 : 0) + (Rr.m ? 1 : 0);
    if (oursVotes > enemyVotes) side = 'ours';
    else if (enemyVotes > oursVotes) side = 'enemy';
    if (!d.left.name || !d.right.name) {
      status('The game shows a battle result, but a player name could not be read. Nothing was logged.', 'warn');
      return 'no-names';
    }
    const p = RS.plan({ type: d.type, side, left: d.left.name, right: d.right.name, rounds: d.rounds });
    if (!p) return 'nothing';
    const oursLeft = side === 'ours';
    const ours = (oursLeft ? L.m : Rr.m) || p.ours;
    const enemy = (oursLeft ? Rr.e : L.e) || p.enemy;
    // heroes: the icons the app is sure of; a team saved before for that player fills the rest when it clearly is that team
    const complete = (icons, savedTeams) => {
      const sure = (icons || []).filter((x) => x && x.sure).map((x) => x.code);
      const seen = (icons || []).filter(Boolean).map((x) => x.code);
      for (const t of savedTeams || []) {
        const hs = ((t && t.heroes) || []).filter(Boolean);
        if (hs.length === 3 && sure.every((c) => hs.includes(c)) && seen.filter((c) => hs.includes(c)).length >= 2) return [...hs];
      }
      return sure;
    };
    let target = state.targets.find((t) => t.warId === warId && GW.playerKey(t.player) === GW.playerKey(enemy)) || null;
    const member = state.members.find((m) => GW.playerKey(m.name) === GW.playerKey(ours)) || null;
    const rounds = p.rounds.map((r) => {
      if (p.kind === 'attack') return { ...r, heroes: complete(r.heroes, []), defense: complete(r.defense, target ? target.teams : []) };
      return { ...r, heroes: complete(r.heroes, member ? member.defense : []), attack: complete(r.attack, []) };
    });
    // the same battle is logged once: same two players, same results, and the attacking team of round 1 not a different one
    const base = RS.key({ kind: p.kind, ours, enemy, rounds: rounds.map((r) => ({ result: r.result, draw: r.draw })) });
    if (undoneResults()[`${warId}|${base}`]) return 'undone';
    const attackers = (r) => (p.kind === 'attack' ? r.heroes : r.attack) || [];
    const existing = (p.kind === 'attack' ? state.attacks : state.defenses).filter((x) => x.warId === warId && x.token && String(x.token).split('#')[0] === base && Number(x.team) === 1);
    for (const x of existing) {
      const was = (p.kind === 'attack' ? x.heroes : x.attackerHeroes) || [];
      const now = attackers(rounds[0]);
      if (was.length < 2 || now.length < 2 || was.some((c) => now.includes(c))) return 'known';
    }
    const token = existing.length ? `${base}#${existing.length + 1}` : base;
    const at = new Date().toISOString();
    const written = [];
    const restore = [];
    if (p.kind === 'attack') {
      // the enemy's defense as it stood in that battle: a new target, an empty one filled, a changed one updated
      const lineups = rounds.map((r) => (r.defense.length === 3 ? r.defense : null));
      if (!target) {
        target = await put('target', { warId, player: enemy, tower: '', teams: rounds.map((r) => ({ heroes: r.defense })), notes: '' });
        written.push(target);
      } else {
        const teams = Array.from({ length: Math.max(2, (target.teams || []).length) }, (_, i) => ({ ...((target.teams || [])[i] || {}) }));
        let touched = false;
        lineups.forEach((hs, i) => {
          if (!hs) return;
          const was = (teams[i].heroes || []).filter(Boolean);
          if (was.length === 3 && GW.teamKey(was) === GW.teamKey(hs)) return;
          if (was.length === 3) teams[i].earlier = [{ heroes: was, speeds: teams[i].speeds || {}, build: teams[i].build || '', until: at }, ...(teams[i].earlier || [])].slice(0, 5);
          teams[i] = { ...teams[i], heroes: hs, speeds: Object.fromEntries(Object.entries(teams[i].speeds || {}).filter(([c]) => hs.includes(c))) };
          touched = true;
        });
        if (touched) {
          restore.push(target);
          target = await put('target', { ...target, teams });
        }
      }
      for (const r of rounds) written.push(await put('attack', { warId, targetId: target.id, team: r.team, defense: r.defense, by: ours, heroes: r.heroes, speeds: {}, result: r.result, ...(r.draw ? { draw: true } : {}), notes: 'read from the game', fromGame: true, token, at }));
    } else {
      for (const r of rounds) written.push(await put('defense', { warId, member: ours, team: r.team, attacker: enemy, attackerHeroes: r.attack, heroes: r.heroes, result: r.result, ...(r.draw ? { draw: true } : {}), fromGame: true, token, at }));
    }
    resultUndo = { records: written, restore, base: `${warId}|${base}` };
    // my own attack, now logged from its result window: the question "how did it go?" is answered
    const pend = pendingAttack();
    if (p.kind === 'attack' && pend && GW.playerKey(pend.enemy) === GW.playerKey(enemy) && GW.playerKey(ours) === GW.playerKey(me())) setPending(null);
    const word = (r) => (r.draw ? 'draw' : p.kind === 'attack' ? (r.result === 'win' ? 'won' : 'lost') : r.result === 'held' ? 'held' : 'lost');
    const team = (hs) => (hs && hs.length ? hs.map(nameOf).join(', ') : 'heroes not recognised');
    const text =
      p.kind === 'attack'
        ? `<b>${esc(ours)}</b> attacked <b>${esc(enemy)}</b>: ${rounds.map((r) => `round ${r.team} ${word(r)} (${esc(team(r.heroes))} against ${esc(team(r.defense))})`).join(' · ')}`
        : `<b>${esc(enemy)}</b> attacked <b>${esc(ours)}</b>: ${rounds.map((r) => `round ${r.team} ${word(r)} (${esc(team(r.heroes))} against ${esc(team(r.attack))})`).join(' · ')}`;
    showResultLogged(text);
    if (window.E7Diag) window.E7Diag.log('guild', `battle result logged from the game (${p.kind})`);
    return 'logged';
  }
  function showResultLogged(html) {
    const el = $('#war-result');
    if (!el) return;
    el.innerHTML = `Logged from the game: ${html}. <button class="btn" id="war-result-undo">Undo</button> <button class="btn" id="war-result-ok">OK</button>`;
    el.classList.remove('hidden');
    $('#war-result-ok').onclick = () => el.classList.add('hidden');
    $('#war-result-undo').onclick = async () => {
      if (!resultUndo) return;
      const u = resultUndo;
      resultUndo = null;
      for (const r of u.records) await put(r.type, { ...r, deleted: true });
      for (const r of u.restore) await put(r.type, r);
      try {
        const all = Object.entries({ ...undoneResults(), [u.base]: Date.now() }).sort((a, b) => b[1] - a[1]).slice(0, 100);
        localStorage.setItem(RESULT_UNDONE, JSON.stringify(Object.fromEntries(all)));
      } catch (_) { /* only a help */ }
      el.classList.add('hidden');
    };
  }

  // ---- the game's standby page: no war is running (js/vision/readers/guild-standby.js; DEVLOG #46) ----------------
  const STANDBY = 'e7-gw-standby'; // { at, minutes, beginsAt, season } written by the reader (this device)
  const STANDBY_UNDONE = 'e7-gw-standby-undone'; // time you undid "marked finished": not done again for 12 hours
  /** The newest standby reading that still holds (mine, or a guildmate's shared in the settings), or null. */
  function standby() {
    let mine = null;
    try {
      mine = JSON.parse(localStorage.getItem(STANDBY) || 'null');
    } catch (_) { /* none */ }
    const shared = state.settings && state.settings.nextWar;
    let s = mine && mine.at ? mine : null;
    if (shared && shared.at && (!s || shared.at > s.at)) s = shared;
    if (!s) return null;
    // holds until the war it announces begins (3 days when the countdown could not be read) …
    const until = s.beginsAt ? Date.parse(s.beginsAt) : Date.parse(s.at) + 3 * 86400000;
    if (!(Date.now() < until)) return null;
    // … or until a war is started after it
    if (state.wars.some((w) => w.status !== 'done' && Date.parse(w.startedAt || 0) > Date.parse(s.at))) return null;
    return s;
  }
  const span = (ms) => {
    const m = Math.max(0, Math.round(ms / 60000));
    return m >= 120 ? `${Math.round(m / 60)} hours` : m >= 60 ? `1 hour${m % 60 >= 10 ? ` ${m % 60} min` : ''}` : `${m} min`;
  };
  let remindedFor = '';
  function renderStandby() {
    const el = $('#war-standby');
    if (!el) return;
    const s = standby();
    if (!s) return el.classList.add('hidden');
    const begins = s.beginsAt ? new Date(s.beginsAt) : null;
    if (begins && window.E7Desktop && window.E7Desktop.guildStandby && remindedFor !== s.beginsAt) {
      remindedFor = s.beginsAt; // (also a guildmate's shared reading: this PC reminds too)
      window.E7Desktop.guildStandby({ beginsAt: s.beginsAt });
    }
    el.innerHTML = `<b>No Guild War right now.</b> <span class="src game">read from the game</span> The game shows the standby page${s.season ? ` (season ${esc(s.season)})` : ''}.
      ${begins ? `The next war begins in about <b>${span(begins - Date.now())}</b> (around ${esc(begins.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}).` : ''}
      <span class="hint">Read ${span(Date.now() - Date.parse(s.at))} ago${s.by ? ` by ${esc(s.by)}` : ''}${begins ? '; the game only shows whole hours, so the time is rough' : ''}.${begins && window.E7Desktop && window.E7Desktop.guildStandby ? ' The desktop app reminds you about 30 minutes before.' : ''}</span>`;
    el.classList.remove('hidden');
  }
  setInterval(renderStandby, 60000);
  let standbyUndo = null;
  /**
   * The watcher saw the standby page at `at` (default: now): say so, share the next war's time with the guild, and
   * mark a war that is still open as finished (with Undo). Returns 'finished' | 'shown' | 'waiting'.
   */
  async function standbyFromGame(d, at) {
    const seenAt = at || new Date().toISOString();
    if (warBusy) await warBusy.catch(() => {});
    renderStandby();
    if (!backend || !loaded) {
      if (!conn.guildCode) return 'shown';
      for (let i = 0; i < 60 && !(backend && loaded); i++) await new Promise((r) => setTimeout(r, 500));
      if (!(backend && loaded)) return 'waiting';
    }
    // share "next war at" with the guild (the web page of guildmates shows it too), when it is news
    try {
      const cur = state.settings && state.settings.nextWar;
      const news = d && d.beginsAt && (!cur || !cur.beginsAt || Math.abs(Date.parse(cur.beginsAt) - Date.parse(d.beginsAt)) > 90 * 60000);
      if (news && me()) await put('settings', { ...(state.settings || {}), id: 'settings', nextWar: { at: seenAt, beginsAt: d.beginsAt, season: d.season || '', by: me() } });
    } catch (_) { /* only a help */ }
    let undone = 0;
    try {
      undone = Number(localStorage.getItem(STANDBY_UNDONE)) || 0;
    } catch (_) { /* none */ }
    const open = state.wars.filter((w) => w.status !== 'done' && Date.parse(w.startedAt || 0) < Date.parse(seenAt));
    if (!open.length || Date.now() - undone < 12 * 3600 * 1000) {
      renderStandby();
      return 'shown';
    }
    for (const w of open) await put('war', { ...w, status: 'done', finishedBy: 'standby page' });
    standbyUndo = open;
    if (window.E7Diag) window.E7Diag.log('guild', `standby page seen: ${open.map((w) => 'war vs ' + w.enemyGuild).join(', ')} marked finished`);
    const el = $('#war-auto');
    if (el) {
      el.innerHTML = `The game shows no war running, so the war vs <b>${open.map((w) => esc(w.enemyGuild)).join(', ')}</b> was marked finished. <button class="btn" id="war-auto-undo">Undo</button> <button class="btn" id="war-auto-ok">OK</button>`;
      el.classList.remove('hidden');
      $('#war-auto-ok').onclick = () => el.classList.add('hidden');
      $('#war-auto-undo').onclick = async () => {
        try {
          localStorage.setItem(STANDBY_UNDONE, String(Date.now()));
        } catch (_) { /* only a help */ }
        for (const w of standbyUndo || []) await put('war', { ...w, status: 'active' });
        standbyUndo = null;
        el.classList.add('hidden');
        renderWar();
      };
    }
    renderWar();
    return 'finished';
  }
  /**
   * "War Ends in 17h" read on the overview (DEVLOG #55): kept on that war (shared), shown on the War tab. The game
   * shows whole hours, so a new reading only replaces the stored time when it differs by more than 90 minutes.
   */
  async function warEndsFromGame(enemyGuild, endsAt, server) {
    const w = state.wars.find((x) => x.status !== 'done' && sameGuild(x.enemyGuild, enemyGuild));
    if (!w || !backend || !(Date.parse(endsAt) > Date.now())) return false;
    const same = w.endsAt && Math.abs(Date.parse(w.endsAt) - Date.parse(endsAt)) < 90 * 60000;
    if (same && (w.enemyServer || '') === (server || w.enemyServer || '')) return false;
    await put('war', { ...w, endsAt: same ? w.endsAt : endsAt, enemyServer: server || w.enemyServer || '' });
    return true;
  }
  function showAutoWar(w) {
    const el = $('#war-auto');
    if (!el) return;
    el.innerHTML = `New war vs <b>${esc(w.enemyGuild)}</b> started by itself (read from the game's Guild War screen). <button class="btn" id="war-auto-undo">Undo</button> <button class="btn" id="war-auto-ok">OK</button>`;
    el.classList.remove('hidden');
    $('#war-auto-ok').onclick = () => el.classList.add('hidden');
    $('#war-auto-undo').onclick = async () => {
      if (!autoUndo) return;
      try {
        localStorage.setItem(DISMISS, JSON.stringify({ ...dismissed(), [autoUndo.war.enemyGuild]: Date.now() }));
      } catch (_) { /* only a help */ }
      await put('war', { ...autoUndo.war, deleted: true });
      for (const old of autoUndo.finished) await put('war', { ...old, status: old.status || 'active' });
      warId = (autoUndo.finished[0] || {}).id || null;
      autoUndo = null;
      el.classList.add('hidden');
      renderWar();
    };
  }

  $('#war-new').addEventListener('click', async () => {
    if (!backend) return alert('Create or join a guild first (Setup).');
    const lastSeason = (state.wars[0] && state.wars[0].season) || '';
    const r = await window.E7Ask.form('New war', [
      { name: 'guild', label: 'Enemy guild name', placeholder: 'as shown in the game', required: true },
      { name: 'season', label: 'Season (optional)', value: lastSeason, placeholder: 'e.g. Season 12' },
    ], { hint: 'Watching the game does this by itself: open the Guild War overview and the enemy guild is read from the screen.', ok: 'Start war' });
    if (!r) return;
    const w = await startWar(r.guild.trim(), (r.season || '').trim());
    warId = w.id;
    renderWar();
  });
  $('#war-done').addEventListener('click', async () => {
    const w = state.wars.find((x) => x.id === warId);
    if (w && confirm(`Mark the war vs ${w.enemyGuild} as finished?`)) await put('war', { ...w, status: 'done' });
  });
  $('#targets').addEventListener('click', (e) => {
    const b = e.target.closest('[data-record]');
    if (b) showRecord(b.dataset.record);
    const u = e.target.closest('[data-unbeaten]');
    if (u) {
      const t = state.targets.find((x) => x.id === u.dataset.unbeaten);
      // (the map keeps showing grey if it really is beaten; a correction by hand is not overwritten by the next reading)
      if (t) put('target', { ...t, beaten: false, beatenByHand: true });
    }
  });
  $('#targets').addEventListener('change', async (e) => {
    const id = e.target.dataset.assign;
    if (!id) return;
    const t = state.targets.find((x) => x.id === id);
    await put('target', { ...t, assignedTo: e.target.value });
  });
  $('#targets').addEventListener('click', (e) => {
    const pin = e.target.closest('[data-pin]');
    if (pin) {
      current = pin.dataset.pin;
      if (window.GuildPip) window.GuildPip.open();
      for (const fn of listeners) fn();
      return;
    }
    const hi = e.target.closest('[data-history]');
    if (hi) return openHistory(hi.dataset.history);
    // tapping a dot (phones have no hover) opens the same history + explanation
    if (e.target.closest('.gwdot')) {
      const card = e.target.closest('.gw-card');
      const nameBtn = card && card.querySelector('[data-history]');
      if (nameBtn) return openHistory(nameBtn.dataset.history);
    }
    const ed = e.target.closest('[data-edit]');
    if (ed) return openTarget(ed.dataset.edit);
    const at = e.target.closest('[data-attack]');
    if (at) openAttack(at.dataset.attack, Number(at.dataset.team));
  });

  // ------------------------------------------------------------ target form
  let editingTarget = null;
  /**
   * seen (optional, from the game watcher): { player, teams: [[{ code, sure, q }|null ×3] ×2] }. Opens the editor for that
   * player's defense (existing or new) with the heroes the app recognised filled into empty places (DEVLOG #34).
   */
  function openTarget(id, seen = null) {
    if (!warId) return alert('Start a war first (New war).');
    let t = id ? state.targets.find((x) => x.id === id) : null;
    if (!t && seen && seen.player) t = state.targets.find((x) => x.warId === warId && GW.playerKey(x.player) === GW.playerKey(seen.player)) || null;
    editingTarget = t ? { ...t } : { warId, teams: [], player: seen ? seen.player || '' : '' };
    if (seen) {
      editingTarget.teams = Array.from({ length: Math.max(2, (editingTarget.teams || []).length) }, (_, i) => {
        const tm = { ...((editingTarget.teams || [])[i] || {}) };
        const hs = [...(tm.heroes || [])];
        (seen.teams[i] || []).forEach((x, k) => {
          if (!hs[k] && x && x.sure) hs[k] = x.code;
        });
        return { ...tm, heroes: hs };
      });
      editingTarget._seen = seen; // what the app saw: names you type for unsure icons teach it (on save)
      // the player changed their defense since it was saved (they can at any time): the line-up seen now goes in,
      // the earlier one is kept on the team ("earlier"), speeds stay for the heroes that stayed (DEVLOG #56)
      const changes = t ? GW.defenseChange(t, seen.teams) : [];
      for (const c of changes) {
        const tm = editingTarget.teams[c.team - 1] || {};
        const speeds = {};
        for (const h of c.now) if (tm.speeds && tm.speeds[h]) speeds[h] = tm.speeds[h];
        editingTarget.teams[c.team - 1] = { ...tm, heroes: c.now, speeds, build: '', earlier: [{ heroes: c.was, speeds: tm.speeds || {}, build: tm.build || '', until: new Date().toISOString() }, ...(tm.earlier || [])].slice(0, 5) };
      }
      editingTarget._changes = changes;
    }
    const ch = $('#target-changed');
    if (ch) {
      const list = editingTarget._changes || [];
      ch.classList.toggle('hidden', !list.length);
      ch.innerHTML = list.length ? `<b>This player changed their defense.</b> ${list.map((c) => `Round ${c.team} was ${esc(c.was.map(nameOf).join(', '))}`).join(' · ')}. The line-up seen now is filled in; the earlier one is kept in their history. Attacks already logged stay with the line-up they were made against.` : '';
    }
    const f = $('#target-form');
    $('#target-title').textContent = t ? `Edit ${t.player}` : 'Add enemy defense';
    f.player.value = t ? t.player : editingTarget.player || '';
    f.tower.value = t ? t.tower || '' : '';
    f.notes.value = t ? t.notes || '' : '';
    $('#target-delete').classList.toggle('hidden', !t);
    $('#team-editors').innerHTML = Array.from({ length: rules().teamsPerDefense }, (_, i) => {
      const tm = (editingTarget.teams || [])[i] || {};
      const hs = tm.heroes || [];
      return `<fieldset class="gw-fs" data-team="${i}"><legend>Team ${i + 1}</legend>
        ${[0, 1, 2]
          .map((k) => `<div class="hrow"><input class="h3" list="gw-heroes" placeholder="Hero ${k + 1}" value="${esc(hs[k] ? nameOf(hs[k]) : '')}" /><input class="spd" type="number" min="1" max="400" placeholder="speed" value="${esc(hs[k] && tm.speeds ? tm.speeds[hs[k]] || '' : '')}" /></div>`)
          .join('')}
        <input class="build full" placeholder="Sets / artifacts / notes (e.g. AV: Speed+Crit, Alexa)" value="${esc(tm.build || '')}" /></fieldset>`;
    }).join('');
    $('#target-dialog').showModal();
  }
  $('#target-add').addEventListener('click', () => openTarget(null));
  $('#target-cancel').addEventListener('click', () => $('#target-dialog').close());
  $('#target-delete').addEventListener('click', async () => {
    if (!editingTarget.id || !confirm('Delete this enemy defense?')) return;
    await backend.remove(editingTarget.id, me());
    $('#target-dialog').close();
  });
  $('#target-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const teams = $$('.gw-fs', f).map((fs) => {
      const heroes = [];
      const speeds = {};
      $$('.hrow', fs).forEach((row) => {
        const c = codeOf($('.h3', row).value);
        if (!c) return;
        heroes.push(c);
        const s = Number($('.spd', row).value);
        if (s) speeds[c] = s;
      });
      // the earlier line-ups of this team (kept when the player changed their defense) stay with it
      const earlier = ((editingTarget.teams || [])[Number(fs.dataset.team)] || {}).earlier;
      return { heroes, speeds, build: $('.build', fs).value.trim(), ...(earlier && earlier.length ? { earlier } : {}) };
    });
    const unknown = $$('.h3', f).filter((i) => i.value.trim() && !codeOf(i.value)).map((i) => i.value);
    if (unknown.length && !confirm(`Unknown hero name(s): ${unknown.join(', ')}. Save without them?`)) return;
    const seen = editingTarget._seen;
    delete editingTarget._seen;
    delete editingTarget._changes;
    await put('target', { ...editingTarget, player: f.player.value.trim(), tower: f.tower.value.trim(), notes: f.notes.value.trim(), teams });
    // learn from your names: an icon the app wasn't sure of (or got wrong) + the hero you typed = a correction (this device)
    if (seen) {
      let list = [];
      try {
        list = JSON.parse(localStorage.getItem('e7-gw-face-corrections') || '[]') || [];
      } catch (_) { /* start fresh */ }
      let added = 0;
      teams.forEach((tm, i) =>
        (tm.heroes || []).forEach((code, k) => {
          const x = (seen.teams[i] || [])[k];
          if (x && x.q && code && (!x.sure || x.code !== code)) {
            list.push({ code, q: x.q, at: new Date().toISOString() });
            added++;
          }
        }),
      );
      if (added) {
        localStorage.setItem('e7-gw-face-corrections', JSON.stringify(list.slice(-300)));
        if (window.E7Diag) window.E7Diag.log('guild', `learned ${added} hero icon(s) from your names`);
      }
    }
    $('#target-dialog').close();
  });

  // ------------------------------------------------------------ attack form
  /** The heroes of a target's team right now: stored with every attack, because the player may change them later. */
  const lineupOf = (target, teamNo) => [...((((target || {}).teams || [])[teamNo - 1] || {}).heroes || [])];
  let attackTarget = null;
  function openAttack(targetId, teamNo) {
    attackTarget = state.targets.find((t) => t.id === targetId);
    const f = $('#attack-form');
    $('#attack-title').textContent = `Attack ${attackTarget.player}${attackTarget.tower ? ' · ' + attackTarget.tower : ''}`;
    f.team.innerHTML = Array.from({ length: rules().teamsPerDefense }, (_, i) => `<option value="${i + 1}" ${i + 1 === teamNo ? 'selected' : ''}>Team ${i + 1}: ${esc(((attackTarget.teams || [])[i] || {}).heroes ? attackTarget.teams[i].heroes.map(nameOf).join(', ') : '?')}</option>`).join('');
    f.by.value = me();
    f.notes.value = '';
    $$('#atk-heroes .h3').forEach((i) => (i.value = ''));
    showAttackCounters();
    $('#attack-dialog').showModal();
  }
  // The official record site (js/records-app.js): an enemy's arena habits, and how the heroes of their defense are built
  // in their arena games (artifact + sets, start CR). Their Guild War build can differ; it is labelled as arena data.
  function recordLine(t) {
    const RA = window.E7RecordsApp;
    const e = RA && RA.cached(t.player);
    if (!e) return '';
    if (e.missing) return '<span class="src record">official record</span> no player with exactly this name was found';
    const focus = (t.teams || []).flatMap((tm) => tm.heroes || []).filter(Boolean);
    return RA.playerHTML(e, focus);
  }
  async function showRecord(id) {
    const RA = window.E7RecordsApp;
    const t = state.targets.find((x) => x.id === id);
    const out = document.querySelector(`[data-record-out="${CSS.escape(id)}"]`);
    if (!RA || !t || !out) return;
    out.innerHTML = '<span class="src record">official record</span> looking up…';
    try {
      await RA.lookup(t.player, { force: true, pages: 5, onStep: (s) => (out.innerHTML = `<span class="src record">official record</span> ${esc(s)}`) });
    } catch (e) {
      out.innerHTML = `<span class="src record">official record</span> ${esc(e.message)}`;
      return;
    }
    out.innerHTML = recordLine(t);
  }
  // Hero mechanics (js/knowledge.js, source 'E7DaT knowledge'): what a defense brings, and what it does to my team
  const KNOW = () => window.E7Knowledge || null;
  const knowBadge = '<span class="src know">E7DaT knowledge</span>';
  /** "Watch for: front-line guard (Boss Arunka) · blocks revive (Lethe)" for one defense team. */
  function mechLine(codes) {
    const K = KNOW();
    if (!K) return '';
    const th = K.threats((codes || []).filter(Boolean));
    if (!th.length) return '';
    const by = new Map();
    for (const t of th) by.set(t.label, [...(by.get(t.label) || []), nameOf(t.code)]);
    return `<div class="hint">${knowBadge} Watch for: ${[...by.entries()].map(([label, names]) => `${esc(label)} (${names.map(esc).join(', ')})`).join(' · ')}</div>`;
  }
  /** In the attack window: what the defense shuts down on the heroes typed in, and what they shut down on it. */
  function showAttackMech() {
    const el = $('#atk-mech');
    const K = KNOW();
    if (!el || !K || !attackTarget) return;
    const tm = (attackTarget.teams || [])[Number($('#attack-form').team.value) - 1] || {};
    const foes = (tm.heroes || []).filter(Boolean).map((c) => ({ code: c, name: nameOf(c) }));
    const mine = $$('#atk-heroes .h3').map((i) => codeOf(i.value)).filter(Boolean);
    const lines = [];
    for (const c of mine) {
      const n = K.notesFor(c, [], foes);
      for (const b of n.bad) lines.push(`<span class="warn-text">⚠ ${esc(nameOf(c))}</span>: ${esc(b.text)}`);
      for (const g of n.good) lines.push(`<span class="ok-text">✓ ${esc(nameOf(c))}</span>: ${esc(g.text)}`);
    }
    el.innerHTML = lines.length ? `${knowBadge} ${lines.join('<br>')}` : mine.length && foes.length ? `${knowBadge} nothing on record between these heroes` : '';
  }
  function showAttackCounters() {
    showAttackMech();
    const tm = (attackTarget.teams || [])[Number($('#attack-form').team.value) - 1] || {};
    const c = GW.suggestCounters(tm.heroes || [], GW.counterBook(state), { members: state.members, limit: 3 });
    $('#atk-counters').innerHTML = c.length ? `Worked before: ${c.map((x) => `<button type="button" class="link" data-fill="${esc(x.attack.join(','))}">${esc(x.attack.map(nameOf).join(' + '))}</button> (${x.wins}-${x.games - x.wins})`).join(' · ')}` : '';
  }
  $('#attack-form').team.addEventListener('change', showAttackCounters);
  $('#atk-heroes').addEventListener('input', showAttackMech);
  $('#atk-counters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fill]');
    if (!b) return;
    const codes = b.dataset.fill.split(',');
    $$('#atk-heroes .h3').forEach((i, k) => (i.value = codes[k] ? nameOf(codes[k]) : ''));
    showAttackMech();
  });
  $('#attack-cancel').addEventListener('click', () => $('#attack-dialog').close());
  $('#attack-form').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-res]');
    if (!b) return;
    const f = $('#attack-form');
    const heroes = $$('#atk-heroes .h3').map((i) => codeOf(i.value)).filter(Boolean);
    const by = f.by.value.trim() || me();
    if (!by) return alert('Who attacked? Set your name in Setup.');
    // my own speeds (from my gear.txt) for the heroes I used, if I attack as myself and allow it
    const speeds = {};
    if (conn.shareSpeeds !== false && GW.playerKey(by) === GW.playerKey(me())) for (const h of heroes) if (mySpeeds().get(h)) speeds[h] = mySpeeds().get(h);
    await put('attack', { warId: attackTarget.warId, targetId: attackTarget.id, team: Number(f.team.value), defense: lineupOf(attackTarget, Number(f.team.value)), by, heroes, speeds, result: b.dataset.res, notes: f.notes.value.trim(), at: new Date().toISOString() });
    $('#attack-dialog').close();
  });

  // --------------------------------------------------------------- counters
  function renderCounters() {
    const codes = $$('#tab-counters .h3').map((i) => codeOf(i.value)).filter(Boolean);
    const book = GW.counterBook(state);
    const out = $('#counter-out');
    if (codes.length < 2) out.innerHTML = '<p class="hint">Enter at least 2 heroes.</p>';
    else {
      const c = GW.suggestCounters(codes, book, { members: state.members, limit: 8 });
      out.innerHTML = c.length
        ? `<table class="mini"><thead><tr><th>Attack team</th><th>Record</th><th>Match</th><th>Used by</th><th>Owned by</th></tr></thead><tbody>${c
            .map((x) => `<tr><td>${team(x.attack)}</td><td>${x.wins}-${x.games - x.wins}</td><td>${x.exact ? 'same team' : 'similar'}</td><td class="small">${esc(x.by.join(', '))}</td><td class="small">${esc(x.owners.join(', ') || '—')}</td></tr>`)
            .join('')}</tbody></table>`
        : '<p class="hint">No logged wins against this team or similar ones yet.</p>';
    }
    $('#threats').innerHTML =
      GW.threatHeroes(state)
        .map((t) => `<tr><td>${chip(t.code)}</td><td>${t.games}</td><td>${pct(t.losses, t.games)}</td></tr>`)
        .join('') || '<tr><td colspan="3" class="hint">Needs a few logged attacks.</td></tr>';
    const all = [];
    for (const list of book.values()) for (const r of list) all.push(r);
    const agg = new Map();
    for (const r of all) {
      const k = GW.teamKey(r.attack);
      const a = agg.get(k) || { attack: r.attack, wins: 0, games: 0 };
      a.wins += r.wins;
      a.games += r.games;
      agg.set(k, a);
    }
    $('#best-attacks').innerHTML =
      [...agg.values()]
        .filter((a) => a.games >= 2)
        .sort((a, b) => b.wins / b.games - a.wins / a.games || b.games - a.games)
        .slice(0, 10)
        .map((a) => `<li>${team(a.attack)} <small class="hint">${a.wins}-${a.games - a.wins}</small></li>`)
        .join('') || '<li class="hint">Needs a few logged attacks.</li>';
  }
  $$('#tab-counters .h3').forEach((i) => i.addEventListener('input', renderCounters));

  // ---------------------------------------------------------------- members
  function myMember() {
    return state.members.find((m) => GW.playerKey(m.name) === GW.playerKey(me()));
  }
  function renderMembers() {
    const R0 = rules();
    const used = warId ? GW.attacksUsed(state.attacks, warId) : new Map();
    const stats = new Map(GW.memberStats(state).map((s) => [GW.playerKey(s.name), s]));
    $('#member-rows').innerHTML =
      state.members
        .map((m) => {
          const s = stats.get(GW.playerKey(m.name)) || { attacks: 0, wins: 0, held: 0, lost: 0 };
          const left = Math.max(0, R0.attacksPerMember - (used.get(GW.playerKey(m.name)) || 0));
          const def = (m.defense || []).map((d, i) => `<div class="hint">D${i + 1}: ${esc((d.heroes || []).map(nameOf).join(', ') || '—')}</div>`).join('');
          return `<tr><td><b>${esc(m.name)}</b>${def}</td><td>${warId ? left : '—'}</td><td>${s.attacks}</td><td>${pct(s.wins, s.attacks)}</td><td>${s.held} / ${s.lost}</td><td>${(m.roster || []).length ? `${m.roster.length} heroes` : '—'}</td></tr>`;
        })
        .join('') || '<tr><td colspan="6" class="hint">No members yet. Each guildmate appears after setting their name.</td></tr>';
    const mm = myMember();
    [1, 2].forEach((n) => {
      const hs = (mm && mm.defense && mm.defense[n - 1] && mm.defense[n - 1].heroes) || [];
      $$(`#mydef-${n} .h3`).forEach((i, k) => {
        if (document.activeElement !== i) i.value = hs[k] ? nameOf(hs[k]) : '';
      });
    });
    const owned = localRoster();
    $('#roster-info').textContent = `${owned.length} owned heroes found in your RTA helper data on this device. Shared: ${mm && mm.roster ? mm.roster.length : 0}.`;
  }
  /** Owned heroes from the RTA helper's own store on this device (Fribbels import + owned ticks). */
  function localRoster() {
    try {
      const s = JSON.parse(localStorage.getItem('rta-helper-v2') || 'null');
      if (!s) return [];
      const set = new Set([...((s.fribbels && s.fribbels.heroes) || []).map((h) => h.code), ...(s.manualOwned || [])]);
      return [...set];
    } catch (_) {
      return [];
    }
  }
  $('#mydef-save').addEventListener('click', async () => {
    if (!me()) return alert('Set your name in Setup first.');
    await ensureMember();
    const mm = myMember() || { id: 'm-' + GW.playerKey(me()).replace(/[^a-z0-9]+/g, '-'), name: me() };
    const defense = [1, 2].map((n) => ({ heroes: $$(`#mydef-${n} .h3`).map((i) => codeOf(i.value)).filter(Boolean) }));
    await put('member', { ...mm, defense });
  });
  $('#tab-members').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-dl]');
    if (!b) return;
    if (!me()) return alert('Set your name in Setup first.');
    await put('defense', {
      warId,
      member: me(),
      team: Number($('#dl-team').value),
      attacker: $('#dl-attacker').value.trim(),
      attackerHeroes: $$('#dl-heroes .h3').map((i) => codeOf(i.value)).filter(Boolean),
      result: b.dataset.dl,
      at: new Date().toISOString(),
    });
    $('#dl-attacker').value = '';
    $$('#dl-heroes .h3').forEach((i) => (i.value = ''));
  });
  $('#roster-share').addEventListener('click', async () => {
    if (!me()) return alert('Set your name in Setup first.');
    const roster = localRoster();
    if (!roster.length) return alert('No roster found. Import your gear.txt in the RTA helper (Data tab) first.');
    await ensureMember();
    await put('member', { ...(myMember() || { name: me() }), roster });
  });
  $('#roster-unshare').addEventListener('click', async () => {
    const mm = myMember();
    if (mm) await put('member', { ...mm, roster: [] });
  });

  // ---------------------------------------------------------------- enemies
  function renderEnemies() {
    const q = $('#enemy-search').value.trim();
    const out = $('#enemy-out');
    if (!q) {
      const players = new Map();
      for (const t of state.targets) {
        const k = GW.playerKey(t.player);
        const p = players.get(k) || { name: t.player, wars: new Set() };
        p.wars.add(t.warId);
        players.set(k, p);
      }
      out.innerHTML =
        [...players.values()]
          .sort((a, b) => b.wars.size - a.wars.size)
          .map((p) => {
            const latest = state.targets.filter((t) => GW.playerKey(t.player) === GW.playerKey(p.name)).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
            const v = GW.targetVerdict(state, latest, meProfile(), rules(), undefined, nameOf);
            return `<button class="btn" data-enemy="${esc(p.name)}">${dot(v)} ${esc(p.name)} <small class="hint">${p.wars.size} war${p.wars.size > 1 ? 's' : ''}</small></button>`;
          })
          .join(' ') || '<p class="hint">Enemy players appear here once you add their defenses.</p>';
      return;
    }
    const h = GW.enemyHistory(state, q);
    out.innerHTML =
      h
        .map((x) => `<div class="card gw-card"><b>vs ${esc(x.war ? x.war.enemyGuild : '?')}</b> <span class="hint">${esc(x.war ? String(x.war.startedAt).slice(0, 10) : '')}${x.target.tower ? ' · ' + esc(x.target.tower) : ''}</span>
          ${(x.target.teams || []).map((tm, i) => `<div class="gw-team"><div class="gw-team-head">Team ${i + 1} ${x.status.teams[i] && x.status.teams[i].cleared ? '<span class="vd keep">cleared</span>' : ''}</div>${team(tm.heroes)}${Object.keys(tm.speeds || {}).length ? `<div class="hint">Speed: ${Object.entries(tm.speeds).map(([c, v]) => `${esc(nameOf(c))} ${v}`).join(' · ')}</div>` : ''}${tm.build ? `<div class="hint">${esc(tm.build)}</div>` : ''}</div>`).join('')}
          <div class="hint">${x.attacks.map((a) => `${esc(a.by)}: ${esc(a.heroes.map(nameOf).join(' + ') || '?')} vs team ${a.team} — ${a.result}`).join('<br>')}</div></div>`)
        .join('') || '<p class="hint">Not seen yet.</p>';
  }
  $('#enemy-search').addEventListener('input', renderEnemies);
  $('#enemy-out').addEventListener('click', (e) => {
    const b = e.target.closest('[data-enemy]');
    if (!b) return;
    openHistory(b.dataset.enemy);
  });

  // --------------------------------------------------------- player history
  /** Everything anyone in the guild ever recorded about an enemy player, every war and season. */
  function openHistory(name) {
    const p = GW.playerProfile(state, name);
    const meP = meProfile();
    const latest = p.appearances[0] && p.appearances[0].target;
    const v = latest ? GW.targetVerdict(state, latest, meP, rules(), undefined, nameOf) : { level: 'grey', label: DOT_TEXT.grey, lines: [], teams: [] };
    const rta = rtaProfile(name);
    $('#hist-title').innerHTML = `${dot(v)} ${esc(p.name)}`;
    $('#hist-body').innerHTML = `
      <p class="hint">Seen in ${p.appearances.length} war${p.appearances.length === 1 ? '' : 's'}${p.seasons.length ? ` · seasons: ${esc(p.seasons.join(', '))}` : ''} · guild record vs them: <b>${p.wins}-${p.losses}</b></p>
      <div class="ins ${v.level === 'green' || v.level === 'proven' ? 'good' : 'warn'}"><b>${esc(v.label)}</b> (for you, latest defense)
        ${(v.teams || []).map((t, i) => `<div>${dot(t)} Team ${i + 1}: ${esc(t.label)}${t.lines.length ? `<div class="hint">${t.lines.map(esc).join('<br>')}</div>` : ''}${(t.others || []).length ? `<div class="hint">Also owned by: ${esc(t.others.join(', '))}</div>` : ''}</div>`).join('')}</div>
      <h4>Their heroes over time</h4>
      <table class="mini"><thead><tr><th>Hero</th><th>Seen</th><th>Latest speed</th><th>Highest</th><th>Last seen</th></tr></thead><tbody>${p.heroes
        .map((h) => `<tr><td>${chip(h.code)}</td><td>${h.seen}×</td><td>${h.latest || '—'}</td><td>${h.max || '—'}</td><td class="small">${esc(String(h.lastSeen || '').slice(0, 10))}</td></tr>`)
        .join('')}</tbody></table>
      ${p.builds.length ? `<h4>Builds noted</h4><ul class="plain-list">${p.builds.map((b) => `<li class="small">${esc(b.text)} <span class="hint">· ${esc(String(b.when).slice(0, 10))}${b.war ? ' · ' + esc(b.war) : ''}</span></li>`).join('')}</ul>` : ''}
      <h4>Every time the guild met them</h4>
      ${p.appearances
        .map((x) => `<div class="gw-team"><div class="gw-team-head">vs ${esc(x.war ? x.war.enemyGuild : '?')}${x.war && x.war.season ? ' · ' + esc(x.war.season) : ''} · ${esc(x.war ? String(x.war.startedAt).slice(0, 10) : '')}${x.target.tower ? ' · ' + esc(x.target.tower) : ''} · recorded by ${esc(x.target.updatedBy || '?')}</div>
          ${(x.target.teams || []).map((tm, i) => `<div>Team ${i + 1}: ${team(tm.heroes)} ${x.status.teams[i] && x.status.teams[i].cleared ? '<span class="vd keep">cleared</span>' : ''}${Object.keys(tm.speeds || {}).length ? `<div class="hint">Speed: ${Object.entries(tm.speeds).map(([c, s2]) => `${esc(nameOf(c))} ${s2}`).join(' · ')}</div>` : ''}${tm.build ? `<div class="hint">${esc(tm.build)}</div>` : ''}</div>`).join('')}
          ${x.attacks.length ? `<div class="hint">${x.attacks.map((a) => `${esc(a.by)}: ${esc((a.heroes || []).map(nameOf).join(' + ') || '?')} vs team ${a.team} → <b>${a.result}</b>${Object.keys(a.speeds || {}).length ? ` (speeds ${Object.entries(a.speeds).map(([c, s2]) => `${esc(nameOf(c))} ${s2}`).join(', ')})` : ''}${a.notes ? ` — ${esc(a.notes)}` : ''}`).join('<br>')}</div>` : ''}</div>`)
        .join('')}
      ${rta ? `<h4>Your own RTA games vs ${esc(name)} <span class="src player">my RTA</span></h4><p class="hint">From this device only (not shared): ${rta}</p>` : ''}`;
    $('#hist-dialog').showModal();
  }
  $('#hist-close').addEventListener('click', () => $('#hist-dialog').close());
  /** If you've met this player in RTA, a one-line summary from your own RTA data (kept separate, not shared). */
  function rtaProfile(name) {
    try {
      const s = JSON.parse(localStorage.getItem('rta-helper-v2') || 'null');
      const ms = ((s && s.matches) || []).filter((m) => GW.playerKey(m.opponent) === GW.playerKey(name));
      if (!ms.length) return '';
      const wins = ms.filter((m) => m.result === 'win').length;
      const picks = new Map();
      for (const m of ms) for (const c of m.oppPicks || []) picks.set(c, (picks.get(c) || 0) + 1);
      const top = [...picks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, n]) => `${esc(nameOf(c))} ${n}×`);
      return `${ms.length} RTA games, you won ${wins}. Their picks: ${top.join(', ')}`;
    } catch (_) {
      return '';
    }
  }

  // ------------------------------------------------------------------ setup
  function renderSetup() {
    $('#my-name').value = conn.myName || '';
    $('#share-speeds').checked = conn.shareSpeeds !== false;
    const sp = mySpeeds();
    $('#my-gear-info').textContent = sp.size ? `Your gear: speeds for ${sp.size} heroes found on this device (from gear.txt).` : 'No speeds on this device yet: dots can show "proven counter" but not check your gear. Import gear.txt (RTA → Data or Gear) or type your heroes\' speeds in RTA → Heroes → Edit (needed for the Steam version).';
    $('#guild-name').value = conn.guildName || '';
    $('#guild-info').innerHTML = conn.guildCode ? `Guild code: <code>${esc(conn.guildCode)}</code> (keep it within your guild: anyone with it can read and edit).` : 'Not in a guild yet.';
    if (conn.config && document.activeElement !== $('#fb-config')) $('#fb-config').value = JSON.stringify(conn.config, null, 1);
    const R0 = rules();
    $('#rule-attacks').value = R0.attacksPerMember;
    $('#rule-teams').value = R0.teamsPerDefense;
  }
  $('#share-speeds').addEventListener('change', (e) => {
    conn.shareSpeeds = e.target.checked;
    saveConn();
  });
  $('#my-name').addEventListener('change', async (e) => {
    conn.myName = e.target.value.trim();
    saveConn();
    status();
    await ensureMember();
  });
  $('#guild-name').addEventListener('change', (e) => {
    conn.guildName = e.target.value.trim();
    saveConn();
    status();
  });
  $('#guild-create').addEventListener('click', async () => {
    if (conn.guildCode && !confirm('You are already in a guild. Create a new one?')) return;
    conn.guildCode = GW.newId(16);
    conn.guildName = $('#guild-name').value.trim() || 'My guild';
    saveConn();
    await connect();
    await ensureMember();
    render();
  });
  $('#guild-join').addEventListener('click', async () => {
    const code = $('#guild-code').value.trim();
    if (!code) return;
    conn.guildCode = code;
    saveConn();
    await connect();
    await ensureMember();
    render();
  });
  $('#guild-invite').addEventListener('click', async () => {
    if (!conn.guildCode) return alert('Create or join a guild first.');
    const base = location.href.split('#')[0];
    const link = Sync.inviteLink(base, conn.guildCode, conn.config || null);
    try {
      await navigator.clipboard.writeText(link);
      alert('Invite link copied. Share it in your guild chat.' + (conn.config ? '' : '\n\nNote: Firebase is not connected yet, so guildmates would only get an empty local copy.'));
    } catch (_) {
      window.E7Ask.show('Copy this invite link:', link);
    }
  });
  $('#fb-connect').addEventListener('click', async () => {
    try {
      conn.config = Sync.parseConfig($('#fb-config').value);
    } catch (e) {
      return alert('That does not look like a Firebase web config: ' + e.message);
    }
    saveConn();
    await connect();
    render();
  });
  $('#fb-disconnect').addEventListener('click', async () => {
    if (!confirm('Stop sharing and use this device only? (Shared data stays in Firebase.)')) return;
    delete conn.config;
    saveConn();
    await connect();
    render();
  });
  const ruleInput = (sel, key) =>
    $(sel).addEventListener('change', async (e) => {
      const s = state.settings || { id: 'settings' };
      await put('settings', { ...s, id: 'settings', rules: { ...(s.rules || {}), [key]: Math.max(1, Number(e.target.value) || 1) } });
    });
  ruleInput('#rule-attacks', 'attacksPerMember');
  ruleInput('#rule-teams', 'teamsPerDefense');
  $('#gw-export').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ app: 'epic7-engine-guild', guildName: conn.guildName, records }, null, 1)], { type: 'application/json' }));
    a.download = `guild-${(conn.guildName || 'war').replace(/\W+/g, '-')}-${today()}.json`;
    a.click();
  });
  $('#gw-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !backend) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.records)) throw new Error('Not a guild export.');
      // merge: keep the newest copy of each record
      const merged = GW.buildState([...records, ...data.records]);
      const keep = new Map(records.map((r) => [r.id, r]));
      for (const r of data.records) if (!keep.has(r.id) || String(r.updatedAt) > String(keep.get(r.id).updatedAt)) keep.set(r.id, r);
      await backend.replaceAll([...keep.values()]);
      alert(`Imported. ${merged.targets.length} defenses, ${merged.attacks.length} attacks.`);
    } catch (err) {
      alert('Could not import: ' + err.message);
    }
  });

  // ------------------------------------------------------- API (pop-out, screen watch)
  let current = null; // enemy player shown in the pop-out
  /** Latest target for a player: this war first, else the most recent anywhere. */
  function targetFor(name) {
    const k = GW.playerKey(name);
    const all = state.targets.filter((t) => GW.playerKey(t.player) === k);
    return all.find((t) => t.warId === warId) || all.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] || null;
  }
  /**
   * A fortress read from the game (js/vision/readers/guild-fortress.js): every name becomes a target of this war in that
   * fortress (existing ones only get their fortress set). Names you corrected are remembered for next time.
   * players: [{ name, raw, keep }]. Returns { added, moved, same }.
   */
  /**
   * A fortress map of the ENEMY was seen (js/vision/readers/guild-fortress.js): defenders whose name is one of this
   * war's targets get "beaten" from their badge (grey ring = beaten, red = still standing). No button needed; names
   * the app does not know yet are left for "Save as this war's …". Returns { beaten, standing } = how many changed.
   */
  let beatenBusy = Promise.resolve();
  function markBeaten(players) {
    beatenBusy = beatenBusy.catch(() => {}).then(() => markBeatenNow(players));
    return beatenBusy;
  }
  async function markBeatenNow(players) {
    const out = { beaten: 0, standing: 0 };
    if (!warId || !backend) return out;
    for (const p of players || []) {
      const name = String(p.name || '').trim();
      if (!name || (p.state !== 'beaten' && p.state !== 'enemy')) continue;
      const t = state.targets.find((x) => x.warId === warId && GW.playerKey(x.player) === GW.playerKey(name));
      if (!t) continue;
      if (p.state === 'beaten' && !t.beaten && !t.beatenByHand) { // ("Not beaten" pressed by hand stays for this war)
        await put('target', { ...t, beaten: true, beatenAt: new Date().toISOString(), beatenBy: me() });
        out.beaten++;
      } else if (p.state === 'enemy' && t.beaten && !t.beatenByHand) {
        await put('target', { ...t, beaten: false }); // an earlier reading was wrong: the game shows it standing
        out.standing++;
      }
    }
    if ((out.beaten || out.standing) && window.E7Diag) window.E7Diag.log('guild', 'beaten state from the fortress map', out);
    return out;
  }
  async function saveFortress(fort, players, side = 'enemy') {
    if (!warId) throw new Error('Start a war first (New war).');
    const out = { added: 0, moved: 0, same: 0 };
    if (side === 'ours') {
      // our side: who defends where, kept on the war (shared with the guild); members added if new
      const war = state.wars.find((w) => w.id === warId);
      const list = players.filter((p) => String(p.name || '').trim()).map((p) => ({ name: p.name.trim(), keep: !!p.keep, state: p.state || '' }));
      await put('war', { ...war, ourForts: { ...((war && war.ourForts) || {}), [fort]: list } });
      for (const p of list) {
        const id = 'm-' + GW.playerKey(p.name).replace(/[^a-z0-9]+/g, '-');
        if (!state.members.some((m) => m.id === id || GW.playerKey(m.name) === GW.playerKey(p.name))) {
          await put('member', { id, name: p.name });
          out.added++;
        } else out.same++;
      }
      if (window.E7Diag) window.E7Diag.log('guild', `saved our ${fort} from the game`, out);
      return out;
    }
    const fixes = (() => {
      try {
        return JSON.parse(localStorage.getItem('e7-gw-name-fixes') || '{}') || {};
      } catch (_) {
        return {};
      }
    })();
    for (const p of players) {
      const name = String(p.name || '').trim();
      if (!name) continue;
      if (p.raw && p.raw.toLowerCase() !== name.toLowerCase()) fixes[p.raw.toLowerCase()] = name;
      const t = state.targets.find((x) => x.warId === warId && GW.playerKey(x.player) === GW.playerKey(name));
      if (!t) {
        await put('target', { warId, player: name, tower: fort, keep: !!p.keep, teams: [], notes: '', ...(p.state === 'beaten' ? { beaten: true, beatenAt: new Date().toISOString(), beatenBy: me() } : {}) });
        out.added++;
      } else if (t.tower !== fort || !!t.keep !== !!p.keep) {
        await put('target', { ...t, tower: fort, keep: !!p.keep });
        out.moved++;
      } else out.same++;
    }
    try {
      localStorage.setItem('e7-gw-name-fixes', JSON.stringify(fixes));
    } catch (_) { /* only a help */ }
    if (window.E7Diag) window.E7Diag.log('guild', `saved ${fort} from the game`, out);
    return out;
  }
  window.GuildApp = {
    openTargetWith: (seen) => openTarget(null, seen),
    saveFortress,
    markBeaten,
    warEndsFromGame,
    resultFromGame,
    offenseFromGame,
    battleFromGame,
    noteFromGame,
    pendingAttack,
    warFromGame,
    standbyFromGame,
    standby,
    /** Fortress names read on the overview: kept on the current war (shared), only when they changed. */
    async saveFortNames(side, names, enemyGuild) {
      const war = state.wars.find((w) => w.id === warId);
      if (!war || !Array.isArray(names)) return false;
      if (!enemyGuild || !sameGuild(war.enemyGuild, enemyGuild)) return false; // only onto the war these names belong to
      const cur = (war.forts && war.forts[side]) || [];
      const next = DEFAULT_FORTS.map((_, i) => names[i] || cur[i] || null);
      if (JSON.stringify(next) === JSON.stringify(cur)) return false;
      await put('war', { ...war, forts: { ...(war.forts || {}), [side]: next } });
      return true;
    },
    fortsOf: (side) => fortsOf(state.wars.find((w) => w.id === warId), side),
    get state() {
      return state;
    },
    get warId() {
      return warId;
    },
    me,
    meProfile,
    rules,
    nameOf,
    esc,
    pt,
    dot,
    chip,
    targetFor,
    current: () => current,
    setCurrent(name) {
      if (name === current) return;
      current = name;
      for (const fn of listeners) fn();
    },
    onChange: (fn) => listeners.push(fn),
    openHistory,
    verdict(target) {
      const st = GW.targetStatus(target, state.attacks.filter((a) => a.targetId === target.id), rules());
      const v = GW.targetVerdict(state, target, meProfile(), rules(), undefined, nameOf);
      return { ...v, status: st };
    },
    attacksLeft() {
      if (!warId || !me()) return null;
      const used = GW.attacksUsed(state.attacks, warId).get(GW.playerKey(me())) || 0;
      return Math.max(0, rules().attacksPerMember - used);
    },
    /** One-tap result from the pop-out. heroes = the counter you used (may be empty). */
    async logQuick(target, team, result, heroes) {
      if (!me()) return alert('Set your name in Setup first.');
      const speeds = {};
      if (conn.shareSpeeds !== false) for (const h of heroes || []) if (mySpeeds().get(h)) speeds[h] = mySpeeds().get(h);
      await put('attack', { warId: target.warId, targetId: target.id, team, defense: lineupOf(target, team), by: me(), heroes: heroes || [], speeds, result, notes: 'logged from pop-out', at: new Date().toISOString() });
    },
    get conn() {
      return conn;
    },
    saveConn,
  };

  // ------------------------------------------------------------------ start
  (async () => {
    const inv = Sync.parseInvite(location.hash);
    if (inv) {
      if (!conn.guildCode || conn.guildCode === inv.guildCode || confirm('Join the guild from this invite link?')) {
        conn.guildCode = inv.guildCode;
        if (inv.config) conn.config = inv.config;
        saveConn();
      }
      history.replaceState(null, '', location.pathname);
      if (!conn.myName) {
        activeTab = 'setup';
        $$('.tab[data-tab]').forEach((x) => x.classList.toggle('active', x.dataset.tab === 'setup'));
        $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-setup'));
      }
    }
    await connect();
    render();
  })();
})();
