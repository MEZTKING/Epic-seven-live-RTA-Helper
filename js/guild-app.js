/* Guild War page. Uses RTARoster, RTAGear (your speeds), RTAGuildWar, RTASync. */
(function () {
  'use strict';
  const R = window.RTARoster;
  const GW = window.RTAGuildWar;
  const Sync = window.RTASync;
  const HEROES = window.RTASources.officialSnapshot.heroes;
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
  const pt = (c) => (byCode.get(c) ? `<img class="pt sm" alt="" crossorigin="anonymous" src="${esc(R.PORTRAIT_URL(c))}" onerror="this.classList.add('broken')" />` : '');
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
      records = list;
      state = GW.buildState(records);
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
    const sum = GW.warSummary(state, warId, R0, today());
    const myLeft = (sum.members.find((m) => GW.playerKey(m.name) === GW.playerKey(me())) || {}).left;
    $('#war-summary').innerHTML = `
      <div class="card"><div class="hint">Defenses cleared</div><div class="stat">${sum.cleared}/${sum.targets.length}</div><div class="hint">${sum.teamsCleared}/${sum.teamsTotal} teams</div></div>
      <div class="card"><div class="hint">Attacks</div><div class="stat">${sum.wins}-${sum.attacks - sum.wins}</div><div class="hint">win rate ${pct(sum.wins, sum.attacks)}</div></div>
      <div class="card"><div class="hint">Attacks left today (guild)</div><div class="stat">${sum.attacksLeft}</div><div class="hint">${me() ? `You: ${myLeft ?? R0.attacksPerMember}` : ''}</div></div>
      <div class="card"><div class="hint">Members who still have attacks today</div><div class="small">${sum.members.filter((m) => m.left > 0).map((m) => `${esc(m.name)} (${m.left})`).join(', ') || '—'}</div></div>`;
    const ideas = GW.assignmentIdeas(state, warId, R0, today()).filter((i) => i.members.length);
    const ib = $('#war-ideas');
    ib.classList.toggle('hidden', !ideas.length);
    ib.innerHTML = `<h3>Who can take what <span class="src game">guild history</span></h3>${ideas
      .slice(0, 12)
      .map((i) => `<div class="pair"><b>${esc(i.target.player)}</b> team ${i.team}: ${esc(i.members.join(', '))} <span class="hint">(owns ${team(i.counters[0].attack)} · ${i.counters[0].wins}-${i.counters[0].games - i.counters[0].wins})</span></div>`)
      .join('')}`;

    const q = R.normName($('#target-search').value);
    const f = $('#target-filter').value;
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
      if (f === 'open' && s.cleared) return false;
      if (f === 'cleared' && !s.cleared) return false;
      if (f === 'mine' && GW.playerKey(t.assignedTo) !== GW.playerKey(me())) return false;
      if (!q) return true;
      const hay = [t.player, t.tower, ...(t.teams || []).flatMap((x) => (x.heroes || []).map(nameOf))].map(R.normName).join(' ');
      return hay.includes(q);
    });
    list.sort((a, b) => Number(a.cleared) - Number(b.cleared) || String(a.target.tower || '').localeCompare(String(b.target.tower || ''), undefined, { numeric: true }));
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
              <div class="gw-team-head">${st.cleared ? '' : dot(tv)} Team ${i + 1} ${st.cleared ? `<span class="vd keep">cleared by ${esc(st.by)}</span>` : st.attempts ? `<span class="vd sell">${st.losses} failed</span>` : ''}</div>
              <div>${(tm.heroes || []).map(chipT).join('') || '<span class="hint">—</span>'}</div>
              ${speeds.length ? `<div class="hint">Speed: ${speeds.map(([c, v]) => `${esc(nameOf(c))} ${esc(v)}`).join(' · ')}</div>` : ''}
              ${tm.build ? `<div class="hint">${esc(tm.build)}</div>` : ''}
              ${!st.cleared && counters.length ? `<div class="hint">Beaten before by: ${counters.map((c) => `${c.attack.map(nameOf).map(esc).join(' + ')} (${c.wins}-${c.games - c.wins}${c.exact ? '' : ', similar'})`).join(' · ')}</div>` : ''}
              ${!st.cleared && tv.level !== 'grey' ? `<div class="hint verdict-line">${esc(tv.label)}${tv.lines.length ? ' · ' + esc(tv.lines[tv.lines.length - 1]) : ''}</div>` : ''}
              ${!st.cleared ? `<button class="btn" data-attack="${esc(t.id)}" data-team="${i + 1}">Log attack</button>` : ''}
            </div>`;
          });
          return `<div class="card gw-card ${s.cleared ? 'done' : ''}">
            <div class="gw-head">${s.cleared ? '<span class="gwdot done" title="Cleared"></span>' : dot(verdicts.get(t.id))}<button class="link" data-history="${esc(t.player)}" title="Show everything known about ${esc(t.player)}">${esc(t.player)}</button>${t.tower ? ` <span class="hint">· ${esc(t.tower)}</span>` : ''}
              <span class="spacer"></span>
              <select data-assign="${esc(t.id)}" title="Assigned to"><option value="">Unassigned</option>${state.members.map((m) => `<option ${GW.playerKey(m.name) === GW.playerKey(t.assignedTo) ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
              <button class="btn" data-pin="${esc(t.player)}" title="Show in the pop-out window">⧉</button>
              <button class="btn" data-edit="${esc(t.id)}">Edit</button></div>
            ${teams.join('')}
            ${t.notes ? `<div class="hint">${esc(t.notes)}</div>` : ''}
            <div class="hint">Last edit: ${esc(t.updatedBy || '?')}</div>
          </div>`;
        })
        .join('') || '<p class="hint">No enemy defenses added for this war yet.</p>';
  }
  $('#war-select').addEventListener('change', (e) => {
    warId = e.target.value;
    renderWar();
  });
  ['#target-search', '#target-filter', '#target-dot'].forEach((s) => $(s).addEventListener('input', renderWar));
  $('#war-new').addEventListener('click', async () => {
    const g = prompt('Enemy guild name?');
    if (!g) return;
    const lastSeason = (state.wars[0] && state.wars[0].season) || '';
    const season = prompt('Season (optional, e.g. "Season 12"). Kept so you can look back at players across seasons.', lastSeason);
    const w = await put('war', { enemyGuild: g.trim(), season: (season || '').trim(), startedAt: new Date().toISOString(), status: 'active' });
    warId = w.id;
  });
  $('#war-done').addEventListener('click', async () => {
    const w = state.wars.find((x) => x.id === warId);
    if (w && confirm(`Mark the war vs ${w.enemyGuild} as finished?`)) await put('war', { ...w, status: 'done' });
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
      return { heroes, speeds, build: $('.build', fs).value.trim() };
    });
    const unknown = $$('.h3', f).filter((i) => i.value.trim() && !codeOf(i.value)).map((i) => i.value);
    if (unknown.length && !confirm(`Unknown hero name(s): ${unknown.join(', ')}. Save without them?`)) return;
    const seen = editingTarget._seen;
    delete editingTarget._seen;
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
  function showAttackCounters() {
    const tm = (attackTarget.teams || [])[Number($('#attack-form').team.value) - 1] || {};
    const c = GW.suggestCounters(tm.heroes || [], GW.counterBook(state), { members: state.members, limit: 3 });
    $('#atk-counters').innerHTML = c.length ? `Worked before: ${c.map((x) => `<button type="button" class="link" data-fill="${esc(x.attack.join(','))}">${esc(x.attack.map(nameOf).join(' + '))}</button> (${x.wins}-${x.games - x.wins})`).join(' · ')}` : '';
  }
  $('#attack-form').team.addEventListener('change', showAttackCounters);
  $('#atk-counters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fill]');
    if (!b) return;
    const codes = b.dataset.fill.split(',');
    $$('#atk-heroes .h3').forEach((i, k) => (i.value = codes[k] ? nameOf(codes[k]) : ''));
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
    await put('attack', { warId: attackTarget.warId, targetId: attackTarget.id, team: Number(f.team.value), by, heroes, speeds, result: b.dataset.res, notes: f.notes.value.trim(), at: new Date().toISOString() });
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
    const used = warId ? GW.attacksUsed(state.attacks, warId, today()) : new Map();
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
      prompt('Copy this invite link:', link);
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
  window.GuildApp = {
    openTargetWith: (seen) => openTarget(null, seen),
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
      const used = GW.attacksUsed(state.attacks, warId, today()).get(GW.playerKey(me())) || 0;
      return Math.max(0, rules().attacksPerMember - used);
    },
    /** One-tap result from the pop-out. heroes = the counter you used (may be empty). */
    async logQuick(target, team, result, heroes) {
      if (!me()) return alert('Set your name in Setup first.');
      const speeds = {};
      if (conn.shareSpeeds !== false) for (const h of heroes || []) if (mySpeeds().get(h)) speeds[h] = mySpeeds().get(h);
      await put('attack', { warId: target.warId, targetId: target.id, team, by: me(), heroes: heroes || [], speeds, result, notes: 'logged from pop-out', at: new Date().toISOString() });
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
