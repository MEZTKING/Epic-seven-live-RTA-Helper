/*
 * The official record site in the app (DEVLOG #44): window.E7RecordsApp. Desktop app only (the lookups run in the main
 * process: desktop/records.js); in a browser everything here stays switched off.
 *
 *   1. MY MATCHES   Data -> Official match records: server + in-game name -> your last 100 arena games become matches
 *                   of source 'official record' (exact picks, bans, pre-bans, first pick, result, opponent's name).
 *                   Again by itself after a draft ends and when the app starts.
 *   2. OPPONENT     the name in the draft's "opponent" box is looked up: how they draft, what they pre-ban, how their
 *                   heroes on the board are built and who of them is fastest. Source 'official record'.
 *   3. TOP PLAYERS  collects the games of the top-ranked players (and the Legend / Emperor players they met) and builds
 *                   hero win rates, match-ups and pairs from them. Source 'top players'.
 *   4. GUILD WAR    E7RecordsApp.lookup(name) is used by the Guild War page for an enemy's arena habits and builds.
 *
 * Kept on this PC: localStorage 'e7-records' (settings, last runs), 'e7-records-players' (looked-up players, newest 30),
 * IndexedDB 'e7-records' (top players' games, the player list). Sent to the site: season code, page number, a player's
 * NUMBER and server. Names are matched against the site's downloaded player list on this PC.
 */
(function () {
  'use strict';
  const R = window.E7Records;
  if (!R) return;
  const D = window.E7Desktop;
  const API = D && D.records ? D.records : window.__e7RecordsTest || null; // tests can supply a stand-in
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const App = () => window.RTAApp || null;
  const S = window.RTASources || {};
  const HEROES = S.allHeroes || (S.officialSnapshot && S.officialSnapshot.heroes) || [];
  const HNAME = new Map(HEROES.map((h) => [h.code, h.name]));
  const hero = (c) => HNAME.get(c) || c;
  const ART = new Map(((S.fribbelsSnapshot && S.fribbelsSnapshot.artifacts) || []).map((a) => [a.code, a.name]));
  const artifact = (c) => ART.get(c) || c || '—';
  const KEY = 'e7-records';
  const PKEY = 'e7-records-players';
  const FRESH_MS = 12 * 3600 * 1000;
  const log = (m, d) => window.E7Diag && window.E7Diag.log('records', m, d);

  // ---- settings ------------------------------------------------------------------------------------------------------
  const DEFAULTS = { me: null, autoImport: true, autoScout: true, lastImportAt: '', lastImport: null, top: { players: 200, at: '', season: '', games: 0, rows: 0 } };
  function cfg() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
      return { ...DEFAULTS, ...v, top: { ...DEFAULTS.top, ...(v.top || {}) } };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }
  function saveCfg(patch) {
    const c = { ...cfg(), ...patch };
    localStorage.setItem(KEY, JSON.stringify(c));
    return c;
  }
  const players = () => {
    try {
      return JSON.parse(localStorage.getItem(PKEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  };
  function savePlayer(key, entry) {
    const all = players();
    all[key] = entry;
    const keep = Object.entries(all).sort((a, b) => (b[1].at > a[1].at ? 1 : -1)).slice(0, 30);
    try {
      localStorage.setItem(PKEY, JSON.stringify(Object.fromEntries(keep)));
    } catch (_) { /* full: only a cache */ }
  }
  const worldLabel = (code) => (R.WORLDS.find((w) => w.code === code) || { label: code }).label;

  // ---- the site ------------------------------------------------------------------------------------------------------
  const site = {
    seasons: async () => ((await API.game('getSeasonList', {})) || {}).result_body || [],
    ranking: async (season, page) => {
      const v = (await API.game('getWorldUserRankingDetail', { season_code: season, world_code: 'all', current_page: page })) || {};
      return Array.isArray(v.result_body) ? v.result_body : [];
    },
    battles: async (nick, world, page) => {
      const v = (await API.game('getBattleList', { nick_no: nick, world_code: world, current_page: page })) || {};
      return v.result_body && typeof v.result_body === 'object' ? v.result_body : {};
    },
  };
  /** A player's recent games, newest first: up to `pages` × 10. */
  async function gamesOf(nick, world, pages = 2, stopAtSeq = null) {
    const rows = [];
    for (let page = 1; page <= pages; page++) {
      const body = await site.battles(nick, world, page);
      const list = body.battle_list || [];
      if (!list.length) break;
      let hitKnown = false;
      for (const b of list) {
        const r = R.parseBattle(b);
        if (!r) continue;
        if (stopAtSeq && stopAtSeq.has(r.seq)) hitKnown = true;
        rows.push(r);
      }
      if (hitKnown || page * 10 >= (Number(body.total_count) || 0)) break;
    }
    return rows;
  }

  // ---- 1. my matches -------------------------------------------------------------------------------------------------
  async function findMe(world, name) {
    const hits = await API.find(world, name);
    if (!hits.length) throw new Error(`No player called "${name}" on ${worldLabel(world)}. Check the spelling and the server.`);
    const me = { world, name: hits[0].name, nickNo: hits[0].nickNo };
    saveCfg({ me });
    log('account set', { world });
    return me;
  }
  const sameTeam = (a, b) => (a || []).filter((c) => (b || []).includes(c)).length >= 4;
  /** Import my recorded games into the RTA store (source 'official record'). Returns { read, added, already }. */
  async function importMine(pages = 10) {
    const c = cfg();
    const A = App();
    if (!c.me || !A) throw new Error('Set your server and in-game name first.');
    const have = new Set(A.store.matches.map((m) => m.recordSeq).filter(Boolean));
    const rows = await gamesOf(c.me.nickNo, c.me.world, pages, have);
    let added = 0;
    let already = 0;
    for (const r of rows) {
      if (have.has(r.seq)) continue;
      const m = R.toMatch(r);
      // the same game recorded by the app itself (from the screen / by hand): keep that one, don't count it twice
      const twin = A.store.matches.find((x) => x.source !== 'official record' && Math.abs(Date.parse(x.date) - Date.parse(m.date)) < 3 * 3600 * 1000 && sameTeam(x.myPicks, m.myPicks) && sameTeam(x.oppPicks, m.oppPicks));
      if (twin) {
        twin.recordSeq = r.seq; // remember, so it isn't checked again
        if (!twin.opponent && m.opponent) twin.opponent = m.opponent;
        already++;
        continue;
      }
      A.store.matches.push(m);
      added++;
    }
    if (added || already) {
      if (!A.store.matchSources['official record']) A.store.matchSources['official record'] = { enabled: true, addedAt: new Date().toISOString() };
      A.store.matches.sort((a, b) => (a.date < b.date ? 1 : -1));
      A.save();
      A.render();
    }
    const res = { read: rows.length, added, already };
    saveCfg({ lastImportAt: new Date().toISOString(), lastImport: res });
    log('my matches imported', res);
    return res;
  }

  // ---- 2. a player's habits (opponent scouting, Guild War) --------------------------------------------------------------
  const pkey = (name) => String(name || '').trim().toLowerCase();
  function cached(name) {
    const e = players()[pkey(name)];
    return e || null;
  }
  const inflight = new Map();
  /** Look a player up by name: my server first, then the others. Resolves { name, world, nickNo, summary, grade, at } or null. */
  function lookup(name, opts = {}) {
    const k = pkey(name);
    if (!k || !API) return Promise.resolve(null);
    const c = cached(name);
    if (c && !opts.force && Date.now() - Date.parse(c.at) < FRESH_MS) return Promise.resolve(c);
    if (inflight.has(k)) return inflight.get(k);
    const job = (async () => {
      const mine = (cfg().me || {}).world;
      const worlds = [...new Set([opts.world, mine, ...R.WORLDS.map((w) => w.code)].filter(Boolean))];
      let hit = null;
      for (const w of worlds) {
        if (opts.onStep) opts.onStep(`looking on ${worldLabel(w)}…`);
        const found = await API.find(w, name).catch(() => []);
        if (found.length) {
          hit = found[0];
          break;
        }
      }
      if (!hit) {
        savePlayer(k, { name: String(name).trim(), missing: true, at: new Date().toISOString() });
        return null;
      }
      if (opts.onStep) opts.onStep('reading their games…');
      const rows = await gamesOf(hit.nickNo, hit.world, opts.pages || 3);
      const entry = { name: hit.name, world: hit.world, nickNo: hit.nickNo, grade: rows[0] ? rows[0].aGrade : '', summary: R.summary(rows), at: new Date().toISOString() };
      savePlayer(k, entry);
      log('player looked up', { games: rows.length });
      return entry;
    })().finally(() => inflight.delete(k));
    inflight.set(k, job);
    return job;
  }
  /** For the suggestion engine: this opponent's pick habits (from the cache only; never waits). */
  function profileFor(name) {
    const e = cached(name);
    if (!e || e.missing || !e.summary || e.summary.games < 5) return null;
    return { name: e.name, games: e.summary.games, picks: e.summary.picks.map((p) => ({ code: p.code, rate: p.rate })) };
  }
  const pct = (x) => Math.round(x * 100) + '%';
  const buildText = (b) => `${esc(artifact(b.artifact))}${b.sets.length ? ' + ' + b.sets.map(R.setName).map(esc).join(' / ') : ''}`;
  /** HTML summary of a looked-up player; `focus` = hero codes to show builds for (their picks on the board / their defense). */
  function playerHTML(e, focus = []) {
    const s = e.summary;
    const top = (arr, n) => arr.slice(0, n).map((x) => `${esc(hero(x.code))} <small>${pct(x.rate)}</small>`).join(', ') || '—';
    const badge = '<span class="src record">official record</span>';
    if (!s || !s.games) return `${badge} <b>${esc(e.name)}</b> (${esc(worldLabel(e.world))}): no arena games on record.`;
    const lines = [
      `${badge} <b>${esc(e.name)}</b> <span class="hint">${esc(worldLabel(e.world))}${e.grade ? ' · ' + esc(e.grade) : ''} · last ${s.games} arena games, ${pct(s.wins / s.games)} won${s.firstPickRate !== null ? `, first pick in ${pct(s.firstPickRate)}` : ''}</span>`,
      `Picks: ${top(s.picks, 6)}`,
      `Pre-bans: ${top(s.prebans, 3)}${s.firstPicks.length ? ` · First picks: ${top(s.firstPicks, 2)}` : ''}${s.fastest.length ? ` · Usually fastest: ${top(s.fastest, 2)}` : ''}`,
    ];
    const shown = (focus || []).filter((c) => s.builds[c] || s.speed[c] !== undefined);
    if (shown.length) {
      lines.push(shown.map((c) => {
        const b = (s.builds[c] || [])[0];
        const p = s.picks.find((x) => x.code === c);
        return `<b>${esc(hero(c))}</b>: ${b ? `${buildText(b)} <small>(${b.n} of ${p ? p.n : b.n} games)</small>` : 'build unknown'}${s.speed[c] !== undefined ? ` · starts at ~${s.speed[c]}% CR` : ''}`;
      }).join('<br>'));
    }
    return lines.join('<br>');
  }

  // ---- 3. top players ------------------------------------------------------------------------------------------------
  let dbp = null;
  const db = () =>
    dbp ||
    (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('e7-records', 2);
      r.onupgradeneeded = () => {
        const have = r.result.objectStoreNames;
        if (!have.contains('battles')) r.result.createObjectStore('battles', { keyPath: 'seq' });
        if (!have.contains('players')) r.result.createObjectStore('players', { keyPath: 'k' });
        if (!have.contains('kv')) r.result.createObjectStore('kv', { keyPath: 'k' }); // version 2: the fitted model
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  const req = (q) => new Promise((res, rej) => ((q.onsuccess = () => res(q.result)), (q.onerror = () => rej(q.error))));
  const store = {
    async addBattles(rows) {
      const d = await db();
      return new Promise((res) => {
        const t = d.transaction('battles', 'readwrite');
        let n = 0;
        for (const r of rows) {
          const q = t.objectStore('battles').add(r);
          q.onsuccess = () => n++;
          q.onerror = (e) => {
            e.preventDefault(); // already stored
            e.stopPropagation();
          };
        }
        t.oncomplete = () => res(n);
        t.onabort = () => res(n);
      });
    },
    async getPlayer(k) {
      return req((await db()).transaction('players').objectStore('players').get(k));
    },
    async setPlayer(k, obj) {
      return req((await db()).transaction('players', 'readwrite').objectStore('players').put({ k, ...obj }));
    },
    async players() {
      return req((await db()).transaction('players').objectStore('players').getAll());
    },
    async battles() {
      return req((await db()).transaction('battles').objectStore('battles').getAll());
    },
    async count() {
      return req((await db()).transaction('battles').objectStore('battles').count());
    },
    async kvGet(k) {
      const v = await req((await db()).transaction('kv').objectStore('kv').get(k));
      return v ? v.v : null;
    },
    async kvSet(k, v) {
      return req((await db()).transaction('kv', 'readwrite').objectStore('kv').put({ k, v }));
    },
  };
  const top = { stats: null, model: null, modelInfo: null, building: null, running: false, stop: false, progress: null };
  const TM = window.E7TopModel;
  /** Fit the model in a worker (the page stays usable); on this thread when a worker cannot start. */
  function fitModel(rows) {
    const here = () => {
      top.modelVia = 'page';
      return TM.build(rows, {});
    };
    return new Promise((res) => {
      let w = null;
      try {
        w = new Worker('js/topmodel-worker.js');
      } catch (_) {
        return res(here());
      }
      const done = (v) => {
        w.terminate();
        res(v);
      };
      w.onmessage = (e) => {
        if (e.data && e.data.ok) top.modelVia = 'worker';
        done(e.data && e.data.ok ? e.data.stats : here());
      };
      w.onerror = () => done(here());
      w.postMessage({ rows, opts: {} });
    });
  }
  /** The model for the stored games: from the copy kept in the database when the games did not change. */
  async function loadModel(rows) {
    if (!TM) return null;
    let newest = '';
    for (const r of rows) if (r.date > newest) newest = r.date;
    const sig = `${rows.length}|${newest}|${TM.FORMAT}`;
    let saved = null;
    try {
      saved = await store.kvGet('model');
    } catch (_) { /* older database: fit again */ }
    let stats = saved && saved.sig === sig ? saved.stats : null;
    if (stats) top.modelVia = 'stored';
    if (!stats && rows.length >= TM.DEFAULTS.minGames) {
      const t0 = Date.now();
      stats = await fitModel(rows);
      log('top-player model fitted', { rows: rows.length, ms: Date.now() - t0, games: stats ? stats.meta.games : 0, via: top.modelVia });
      try {
        await store.kvSet('model', { sig, stats, at: new Date().toISOString() });
      } catch (_) { /* only a cache */ }
    }
    return stats ? TM.engine(stats) : null;
  }
  async function rebuildTop() {
    if (top.building) return top.building;
    top.building = (async () => {
      const Learn = window.RTALearn;
      const rows = await store.battles();
      if (!Learn || !rows.length) {
        top.stats = null;
        top.model = null;
        top.modelInfo = null;
        return null;
      }
      const matches = R.toStatsMatches(rows);
      const st = Learn.buildStats(matches);
      top.stats = st;
      saveCfg({ top: { ...cfg().top, games: matches.length, rows: rows.length } });
      if (App()) App().renderDraft(); // plain win rates right away; the model follows
      try {
        top.model = await loadModel(rows);
      } catch (e) {
        top.model = null;
        log('top-player model failed', { error: String(e && e.message) });
      }
      top.modelInfo = top.model ? top.model.meta : null;
      if (App()) App().renderDraft();
      if ($('#rec-model')) $('#rec-model').innerHTML = modelLine();
      return st;
    })().finally(() => (top.building = null));
    return top.building;
  }
  /** Collect top players' games (resumable; press Stop any time). */
  async function updateTop(onProgress) {
    if (top.running || !API) return null;
    top.running = true;
    top.stop = false;
    try {
      const c = cfg();
      const res = await R.crawl(site, store, {
        trackPlayers: c.top.players,
        stop: () => top.stop,
        onProgress: (p) => {
          top.progress = p;
          if (onProgress) onProgress(p);
        },
      });
      saveCfg({ top: { ...cfg().top, at: new Date().toISOString(), season: res.season ? res.season.name || res.season.code : '' } });
      log('top players updated', { players: res.players, pages: res.pages, added: res.added, stopped: res.stopped });
      await rebuildTop();
      return res;
    } finally {
      top.running = false;
      top.progress = null;
    }
  }

  // ---- pages ---------------------------------------------------------------------------------------------------------
  /** What the model is built on and how well it called games it had not seen. */
  function modelLine() {
    const m = top.modelInfo;
    if (!TM) return '';
    if (!m) return `Win-rate model: needs at least ${TM.DEFAULTS.minGames} games between Legend / Emperor players from the last ${TM.DEFAULTS.maxAgeDays} days; until then plain win rates are used.`;
    const bt = m.backtest && m.backtest.n ? m.backtest : null;
    return `<b>Win-rate model</b> fitted on ${m.games.toLocaleString()} games (newest ${esc(m.latestDay || '')}; hero strength with player skill taken out, pairs, counters, first pick). ${bt ? `Check on the ${bt.n.toLocaleString()} newest games it was not shown: it named the winner in <b>${Math.round(bt.accuracy * 100)}%</b> (a coin: 50%). Drafts decide only part of a match, so this number stays modest.` : 'Too few games for its self-check yet, so its numbers are kept cautious.'}`;
  }
  function renderCard(msg) {
    const el = $('#records-card-body');
    if (!el) return;
    if (!API) {
      el.innerHTML = '<p class="hint">Available in the desktop app.</p>';
      return;
    }
    const c = cfg();
    const t = c.top;
    el.innerHTML = `
      <p class="hint">Uses the official record site (epic7.onstove.com/gg) the way its own page does: one lookup at a time, with a pause. Sent: a season, a page number, a player number and server. Your name is matched on this PC against the site's player list.</p>
      <div class="two">
        <label>Server <select id="rec-world">${R.WORLDS.map((w) => `<option value="${w.code}" ${c.me && c.me.world === w.code ? 'selected' : ''}>${esc(w.label)}</option>`).join('')}</select></label>
        <label>Your in-game name <input id="rec-name" value="${esc(c.me ? c.me.name : '')}" placeholder="exactly as in the game" autocomplete="off" /></label>
      </div>
      <div class="btn-row"><button id="rec-find" class="btn">${c.me ? 'Change' : 'Find me'}</button><button id="rec-import" class="btn primary" ${c.me ? '' : 'disabled'}>Import my matches now</button>
        <label class="inline"><input id="rec-auto" type="checkbox" ${c.autoImport ? 'checked' : ''} /> import after each match</label>
        <label class="inline"><input id="rec-scout" type="checkbox" ${c.autoScout ? 'checked' : ''} /> look up my opponent during a draft</label></div>
      <p class="hint">${c.me ? `Account: <b>${esc(c.me.name)}</b> on ${esc(worldLabel(c.me.world))}.` : 'No account set yet.'}${c.lastImportAt ? ` Last import ${new Date(c.lastImportAt).toLocaleString()}: ${c.lastImport ? `${c.lastImport.added} new, ${c.lastImport.already} already recorded by the app` : ''}.` : ''}</p>
      <h4 style="margin:12px 0 4px"><span class="src top">top players</span> Statistics from top players' games</h4>
      <div class="btn-row"><label>Players to follow <select id="rec-top-n">${[100, 200, 400].map((n) => `<option ${t.players === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <button id="rec-top" class="btn">${top.running ? 'Stop' : 'Update now'}</button></div>
      <p class="hint">${t.rows ? `${t.rows.toLocaleString()} games stored, ${t.games.toLocaleString()} between Legend / Emperor players in use${t.season ? ` · ${esc(t.season)}` : ''}${t.at ? ` · updated ${new Date(t.at).toLocaleString()}` : ''}.` : 'Nothing collected yet. The first update reads up to 10 pages per player (about 5 seconds each): 100 players ≈ 8 minutes, 400 ≈ 35 minutes. Later updates only read what is new. You can keep using the app meanwhile.'}</p>
      <p id="rec-model" class="hint">${modelLine()}</p>
      <p id="rec-msg" class="hint">${esc(msg || '')}</p>`;
    const say = (m) => ($('#rec-msg').textContent = m);
    $('#rec-find').onclick = async () => {
      const name = $('#rec-name').value.trim();
      if (!name) return say('Type your in-game name first.');
      say(`Reading the player list of ${worldLabel($('#rec-world').value)} (a few MB, the first time)…`);
      try {
        const me = await findMe($('#rec-world').value, name);
        renderCard(`Found ${me.name}.`);
      } catch (e) {
        say(e.message);
      }
    };
    $('#rec-import').onclick = async () => {
      say('Reading your recorded games…');
      try {
        const r = await importMine();
        renderCard(`Read ${r.read} games: ${r.added} new, ${r.already} already recorded by the app.`);
      } catch (e) {
        say(e.message);
      }
    };
    $('#rec-auto').onchange = (e) => saveCfg({ autoImport: e.target.checked });
    $('#rec-scout').onchange = (e) => saveCfg({ autoScout: e.target.checked });
    $('#rec-top-n').onchange = (e) => saveCfg({ top: { ...cfg().top, players: Number(e.target.value) } });
    $('#rec-top').onclick = async () => {
      if (top.running) {
        top.stop = true;
        return say('Stopping after the current player…');
      }
      $('#rec-top').textContent = 'Stop';
      try {
        const r = await updateTop((p) => say(p.step === 'ranking' ? `Reading the ranking… ${p.players} players` : `Player ${p.done} of ${p.of} · ${p.games.toLocaleString()} games read, ${p.added.toLocaleString()} new`));
        renderCard(r ? `${r.stopped ? 'Stopped' : 'Done'}: ${r.players} players, ${r.added.toLocaleString()} new games.` : '');
      } catch (e) {
        renderCard(e.message);
      }
    };
  }

  // the opponent panel on the draft tab
  let oppTimer = null;
  let oppShown = '';
  function renderOpp(state) {
    const el = $('#records-opp');
    const A = App();
    if (!el || !A) return;
    const name = (A.store.draft.opponent || '').trim();
    if (!API || !name) return el.classList.add('hidden');
    const e = cached(name);
    const focus = window.RTALogic.draftView(A.store.draft).picks.opp;
    if (e && !e.missing) el.innerHTML = `${playerHTML(e, focus)} <button class="btn" id="rec-opp-again" title="Read their games again">↻</button>`;
    else if (state) el.innerHTML = `<span class="src record">official record</span> ${esc(name)}: ${esc(state)}`;
    else if (e && e.missing) el.innerHTML = `<span class="src record">official record</span> ${esc(name)}: no player with exactly this name was found. <button class="btn" id="rec-opp-again">Try again</button>`;
    else el.innerHTML = `<span class="src record">official record</span> <button class="btn" id="rec-opp-go">Look up ${esc(name)} on the record site</button>`;
    el.classList.remove('hidden');
    const go = (force) => scout(name, force);
    if ($('#rec-opp-go')) $('#rec-opp-go').onclick = () => go(false);
    if ($('#rec-opp-again')) $('#rec-opp-again').onclick = () => go(true);
  }
  /** Draft tab: the model's expected win rate for the board as it stands (equal skill assumed). */
  function renderModelLine() {
    const el = $('#top-model-line');
    const A = App();
    if (!el || !A) return;
    const M = top.model && A.store.settings.useTopPlayers !== false ? top.model : null;
    const d = A.store.draft;
    const v = window.RTALogic.draftView(d);
    if (!M || !M.ready || (!v.picks.me.length && !v.picks.opp.length)) return el.classList.add('hidden');
    const meFirst = d.firstPick === 'me';
    const mine = v.picks.me.filter((c) => !v.postbans.opp.includes(c));
    const theirs = v.picks.opp.filter((c) => !v.postbans.me.includes(c));
    const wr = M.winrate(mine, theirs, meFirst);
    let extra = '';
    if (v.picks.me.length === 5 && v.picks.opp.length === 5 && !v.postbans.me.length && !v.postbans.opp.length) {
      const b = M.bans(v.picks.me, v.picks.opp, meFirst);
      if (b.rows.length) extra = ` · best ban <b>${esc(hero(b.rows[0].code))}</b> (${b.rows[0].pp > 0 ? '+' : '−'}${Math.abs(b.rows[0].pp).toFixed(1)} pp)${b.theirBan ? `, they will likely ban your <b>${esc(hero(b.theirBan))}</b>` : ''}`;
    }
    el.innerHTML = `<span class="src top">top players</span> Model: <b>${Math.round(wr * 100)}%</b> win chance for you with the board as it stands${extra} <small>(${M.meta.games.toLocaleString()} top-player games, equal skill and gear assumed)</small>`;
    el.classList.remove('hidden');
  }
  async function scout(name, force) {
    renderOpp('looking up…');
    try {
      await lookup(name, { force, onStep: (s) => renderOpp(s) });
    } catch (e) {
      renderOpp(e.message);
      return;
    }
    renderOpp();
    if (App()) App().renderDraft(); // suggestions can use their habits now
  }
  function watchOpponent() {
    const A = App();
    if (!A) return;
    const check = () => {
      const name = (A.store.draft.opponent || '').trim();
      renderOpp();
      renderModelLine();
      if (!API || !cfg().autoScout || name.length < 2 || name === oppShown) return;
      clearTimeout(oppTimer);
      oppTimer = setTimeout(() => {
        const now = (A.store.draft.opponent || '').trim();
        if (now !== name || cached(name)) return; // still typing, or already known
        oppShown = name;
        scout(name, false);
      }, 1500);
    };
    A.onDraftRender(check);
    const box = $('#opp-name'); // typing the name doesn't redraw the whole draft
    if (box) box.addEventListener('input', () => setTimeout(check, 0));
  }
  // import my matches by itself: at start (if the last one is older than 30 minutes) and a while after a draft ends
  function autoImport() {
    const A = App();
    if (!A || !API) return;
    const due = () => cfg().me && cfg().autoImport;
    const run = () => due() && importMine(2).then(() => renderCard()).catch(() => {});
    if (due() && (!cfg().lastImportAt || Date.now() - Date.parse(cfg().lastImportAt) > 30 * 60000)) setTimeout(() => importMine().then(() => renderCard()).catch(() => {}), 4000);
    if (window.E7Bus) {
      window.E7Bus.on('rta:draft-end', () => {
        setTimeout(run, 4 * 60000); // a match takes a few minutes; the site lists it shortly after it ends
        setTimeout(run, 12 * 60000);
      });
    }
  }

  window.E7RecordsApp = {
    available: () => !!API, cfg, saveCfg, findMe, importMine, lookup, cached, profileFor, playerHTML, updateTop, rebuildTop,
    stopTop: () => (top.stop = true), topStats: () => top.stats, topModel: () => top.model, topState: () => ({ running: top.running, progress: top.progress, modelVia: top.modelVia || '' }), _store: store,
  };
  renderCard();
  watchOpponent();
  autoImport();
  if (API && cfg().top.rows) setTimeout(() => rebuildTop().catch(() => {}), 1500); // statistics from what was collected before
})();
