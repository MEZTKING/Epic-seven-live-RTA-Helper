/*
 * The official record site's World Arena data (DEVLOG #44; the owner said yes on 2026-11-14). Pure (Node + browser).
 * Browser: window.E7Records. Source labels: 'official record' (your own games, one opponent's games) and
 * 'top players' (statistics from top-ranked players' games).
 *
 * The site (epic7.onstove.com/gg) shows every player's last 100 arena games. Its own lookups are used the way its page
 * uses them (undocumented; one request at a time with a pause; transport in desktop/records.js). Field mapping follows
 * E7DaT's api.py (github.com/ohrgon-game/E7DaT, MIT) and was checked against a live answer on 2026-11-14.
 *
 *   WORLDS                         servers: [{ code, label }]
 *   parseBattle(b)                 one game of getBattleList -> row (see below), or null when incomplete
 *   toMatch(row, myName)           row -> a match of the RTA app (source 'official record')
 *   summary(rows)                  how player A drafts: picks, pre-bans, first picks, builds, speed order
 *   latestSeason(list, now) / earlierSeasons(list, code)
 *   crawl(api, store, opts)        collect top players' games (resumable; opts.onProgress, opts.stop())
 *   toStatsMatches(rows, opts)     rows -> match objects (both sides) for RTALearn.buildStats
 *   setName(token) / SETS          gear-set tokens -> names
 *
 * row = { seq, date (ISO, UTC), day, season, rule, aGrade, bGrade, aFirst (true | false | null), aWin (bool),
 *         a: side, b: side, aNick, aWorld, bNick, bWorld, bName }
 * side = { picks: [5 codes in pick order], ban: code of THIS side's hero that was banned | null, prebans: [codes],
 *          builds: { code: { artifact, sets: [tokens] } }, energy: { code: 0–100 start CR (100 = fastest, 0 = banned) } }
 */
(function (root) {
  'use strict';
  const WORLDS = [
    { code: 'world_global', label: 'Global' },
    { code: 'world_eu', label: 'Europe' },
    { code: 'world_asia', label: 'Asia' },
    { code: 'world_kor', label: 'Korea' },
    { code: 'world_jpn', label: 'Japan' },
  ];
  const SETS = {
    set_speed: 'Speed', set_immune: 'Immunity', set_cri: 'Critical', set_cri_dmg: 'Destruction', set_acc: 'Hit', set_res: 'Resist',
    set_att: 'Attack', set_def: 'Defense', set_max_hp: 'Health', set_vampire: 'Lifesteal', set_counter: 'Counter', set_coop: 'Unity',
    set_rage: 'Rage', set_revenge: 'Revenge', set_scar: 'Injury', set_shield: 'Protection', set_penetrate: 'Penetration',
    set_torrent: 'Torrent', set_chase: 'Pursuit', set_riposte: 'Riposte', set_opener: 'Opener', set_might: 'Might', set_weak: 'Weakness',
  };
  const setName = (t) => SETS[t] || String(t || '').replace(/^set_/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const GRADES_TOP = ['legend', 'emperor'];
  const PRESEASON = 'f'; // games after a season's end carry its code + 'f'
  const seasonOf = (code) => (code && code.endsWith(PRESEASON) && /\d/.test(code.slice(-2, -1)) ? code.slice(0, -1) : code || '');

  /** The site sends some lists as text fragments like '"my_team":[…]'. */
  function frag(s, key) {
    if (!s) return null;
    if (typeof s === 'object') return s[key] || null;
    try {
      return JSON.parse('{' + s + '}')[key] || null;
    } catch (_) {
      return null;
    }
  }
  const iso = (s) => {
    // "2026-07-23 04:48:01.0" (UTC) -> ISO
    const m = /^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d:\d\d)/.exec(String(s || ''));
    return m ? `${m[1]}T${m[2]}Z` : '';
  };

  function side(deck, teamInfo, prebanFrag, energy, team) {
    const list = (deck && deck.hero_list) || [];
    const picks = list.map((h) => h && h.hero_code);
    const builds = {};
    for (const t of frag(teamInfo, 'my_team') || []) {
      if (t && t.hero_code) builds[t.hero_code] = { artifact: t.artifact || '', sets: Array.isArray(t.equip) ? t.equip : [] };
    }
    const en = {};
    for (const e of energy || []) if (String(e.team) === team && e.hero_code) en[e.hero_code] = Number(e.energy) || 0;
    const pre = (deck && Array.isArray(deck.preban_list) && deck.preban_list) || frag(prebanFrag, 'preban_list') || [];
    const banned = list.find((h) => h && h.ban === 1);
    return { picks, ban: banned ? banned.hero_code : null, prebans: pre.filter(Boolean), builds, energy: en, firstPick: list.some((h) => h && h.first_pick === 1) };
  }

  /** One game as the looked-up player (A) saw it. null = incomplete (not 5 v 5, no result, no time). */
  function parseBattle(b) {
    try {
      const seq = String(b.battle_seq || '');
      const energy = frag(b.energyGauge, 'energy_gauge') || [];
      const a = side(b.my_deck, b.teamBettleInfo, b.prebanList, energy, '1');
      const o = side(b.enemy_deck, b.teamBettleInfoenemy, b.prebanListEnemy, energy, '2');
      if (!seq || a.picks.length !== 5 || o.picks.length !== 5 || !a.picks.every(Boolean) || !o.picks.every(Boolean)) return null;
      if (b.iswin !== 1 && b.iswin !== 2) return null; // 1 = win, 2 = loss
      const date = iso(b.battle_day) || iso(b.battleCompletedate);
      if (!date) return null;
      const aFirst = a.firstPick === o.firstPick ? null : a.firstPick;
      delete a.firstPick;
      delete o.firstPick;
      return {
        seq, date, day: date.slice(0, 10), season: b.season_code || '', rule: b.opening_rule_desc_tid || '',
        aGrade: b.grade_code || '', bGrade: b.enemy_grade_code || '', aFirst, aWin: b.iswin === 1, a, b: o,
        aNick: Number(b.nicknameno) || 0, aWorld: b.worldCode || '',
        bNick: Number(b.matchPlayerNicknameno) || 0, bWorld: b.enemy_world_code || '', bName: typeof b.enemy_nick_no === 'string' ? b.enemy_nick_no : '',
      };
    } catch (_) {
      return null;
    }
  }

  /** A row of MY games as a match of the RTA app. iBanned = their hero I banned; theyBanned = my hero they banned. */
  function toMatch(row) {
    return {
      id: 'or-' + row.seq,
      source: 'official record',
      date: row.date,
      result: row.aWin ? 'win' : 'loss',
      opponent: row.bName || '',
      firstPick: row.aFirst === null ? 'me' : row.aFirst ? 'me' : 'opp',
      firstPickKnown: row.aFirst !== null,
      myPrebans: row.a.prebans,
      oppPrebans: row.b.prebans,
      myPicks: row.a.picks,
      oppPicks: row.b.picks,
      teamsFrom: 'official record',
      iBanned: row.b.ban,
      theyBanned: row.a.ban,
      notes: '',
      recordSeq: row.seq,
      grade: row.aGrade,
      oppGrade: row.bGrade,
      rule: row.rule,
    };
  }

  const top = (map, total, extra) =>
    [...map.entries()]
      .map(([code, n]) => ({ code, n, rate: total ? n / total : 0, ...(extra ? extra(code) : {}) }))
      .sort((x, y) => y.n - x.n);
  /**
   * How player A drafts and builds, from their rows (newest first or any order):
   * { games, wins, firstPickRate, picks: [{ code, n, rate, wins, banned }], prebans: [{ code, n, rate }],
   *   firstPicks: [{ code, n, rate }], builds: { code: [{ artifact, sets, n, rate }] }, speed: { code: avg start CR },
   *   fastest: [{ code, n, rate }], from, to }
   */
  function summary(rows) {
    const picks = new Map();
    const wins = new Map();
    const banned = new Map();
    const pre = new Map();
    const first = new Map();
    const fastest = new Map();
    const builds = {};
    const cr = {};
    let games = 0;
    let won = 0;
    let fp = 0;
    let fpKnown = 0;
    let from = '';
    let to = '';
    for (const r of rows || []) {
      games++;
      if (r.aWin) won++;
      if (r.aFirst !== null) {
        fpKnown++;
        if (r.aFirst) {
          fp++;
          first.set(r.a.picks[0], (first.get(r.a.picks[0]) || 0) + 1);
        }
      }
      if (!from || r.date < from) from = r.date;
      if (!to || r.date > to) to = r.date;
      for (const c of r.a.picks) {
        picks.set(c, (picks.get(c) || 0) + 1);
        if (r.aWin) wins.set(c, (wins.get(c) || 0) + 1);
        const bd = r.a.builds[c];
        if (bd && (bd.artifact || bd.sets.length)) {
          const key = `${bd.artifact}|${[...bd.sets].sort().join('+')}`;
          builds[c] = builds[c] || new Map();
          builds[c].set(key, (builds[c].get(key) || 0) + 1);
        }
        const e = r.a.energy[c];
        if (typeof e === 'number' && e > 0) (cr[c] = cr[c] || []).push(e);
      }
      if (r.a.ban) banned.set(r.a.ban, (banned.get(r.a.ban) || 0) + 1);
      for (const c of r.a.prebans) pre.set(c, (pre.get(c) || 0) + 1);
      // the fastest hero of A's team in this game
      const fastestCode = Object.entries(r.a.energy).sort((x, y) => y[1] - x[1])[0];
      if (fastestCode && fastestCode[1] > 0) fastest.set(fastestCode[0], (fastest.get(fastestCode[0]) || 0) + 1);
    }
    const outBuilds = {};
    for (const [c, m] of Object.entries(builds)) {
      const total = [...m.values()].reduce((x, y) => x + y, 0);
      outBuilds[c] = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([key, n]) => {
        const [artifact, sets] = key.split('|');
        return { artifact, sets: sets ? sets.split('+') : [], n, rate: n / total };
      });
    }
    const speed = {};
    for (const [c, l] of Object.entries(cr)) speed[c] = Math.round(l.reduce((x, y) => x + y, 0) / l.length);
    return {
      games, wins: won, firstPickRate: fpKnown ? fp / fpKnown : null,
      picks: top(picks, games, (c) => ({ wins: wins.get(c) || 0, banned: banned.get(c) || 0 })),
      prebans: top(pre, games), firstPicks: top(first, fp), builds: outBuilds, speed, fastest: top(fastest, games), from, to,
    };
  }

  // ---- seasons ------------------------------------------------------------------------------------------------------
  const begin = (s) => String(s.startDate || '').slice(0, 19);
  /** The season that has started most recently (a pre-season keeps the season that just ended). */
  function latestSeason(seasons, now) {
    const rows = (seasons || []).filter((s) => s && s.season_code);
    if (!rows.length) return null;
    const t = (now || new Date()).toISOString().slice(0, 19).replace('T', ' ');
    const started = rows.filter((s) => begin(s) <= t);
    const pick = started.length ? started.reduce((x, y) => (begin(y) > begin(x) ? y : x)) : rows[0];
    return { code: pick.season_code, name: pick.name || '', start: begin(pick), end: String(pick.endDate || '').slice(0, 19) };
  }
  function earlierSeasons(seasons, code) {
    const rows = (seasons || []).filter((s) => s && s.season_code);
    const cur = rows.find((s) => s.season_code === code);
    if (!cur) return [];
    return rows.filter((s) => begin(s) && begin(s) < begin(cur)).sort((x, y) => (begin(y) > begin(x) ? 1 : -1)).map((s) => ({ code: s.season_code, name: s.name || '' }));
  }

  // ---- collecting top players' games --------------------------------------------------------------------------------
  /**
   * api:   { seasons(), ranking(season, page) -> rows, battles(nickNo, world, page) -> { battle_list, total_count } }
   * store: { addBattles(rows) -> how many were new, getPlayer(key), setPlayer(key, obj), players() -> [obj] }  (may be async)
   * opts:  { trackPlayers = 400, maxPages = 10, rankPages = 10, onProgress(info), stop() -> true to stop }
   * Players: the ranking first (if it is empty in a pre-season: the rankings of up to 3 earlier seasons), then the
   * Legend / Emperor opponents met in their games. Per player, pages are read until one holds nothing newer than what
   * was stored last time. Returns { season, players, pages, games, added, stopped }.
   */
  async function crawl(api, store, opts = {}) {
    const track = opts.trackPlayers || 400;
    const maxPages = opts.maxPages || 10;
    const say = opts.onProgress || (() => {});
    const stop = opts.stop || (() => false);
    const out = { season: null, players: 0, pages: 0, games: 0, added: 0, stopped: false };
    const seasons = await api.seasons();
    const cur = latestSeason(seasons, opts.now);
    out.season = cur;
    const key = (nick, world) => `${world}:${nick}`;
    const queue = [];
    const seen = new Set();
    const push = (nick, world, extra) => {
      const k = key(nick, world);
      if (!nick || !world || seen.has(k)) return;
      seen.add(k);
      queue.push({ nick, world, ...extra });
    };
    const readRanking = async (season) => {
      let n = 0;
      for (let page = 1; page <= (opts.rankPages || 10); page++) {
        if (stop()) return n;
        const rows = (await api.ranking(season, page)) || [];
        if (!rows.length) break;
        for (const r of rows) push(Number(r.nick_no), r.world_code, { rank: r.season_rank, grade: r.season_tiercode });
        n += rows.length;
        say({ step: 'ranking', season, page, players: queue.length });
      }
      return n;
    };
    let ranked = cur ? await readRanking(cur.code) : 0;
    if (!ranked && cur) {
      for (const s of earlierSeasons(seasons, cur.code).slice(0, 3)) {
        ranked = await readRanking(s.code);
        if (ranked) break;
      }
    }
    // players known from earlier runs (ranked ones first)
    for (const p of ((await store.players()) || []).sort((x, y) => (x.rank || 1e9) - (y.rank || 1e9))) push(p.nick, p.world, { grade: p.grade });
    for (let i = 0; i < queue.length && out.players < track; i++) {
      if (stop()) {
        out.stopped = true;
        break;
      }
      const p = queue[i];
      const k = key(p.nick, p.world);
      const known = (await store.getPlayer(k)) || {};
      let newest = known.lastDate || '';
      for (let page = 1; page <= maxPages; page++) {
        if (stop()) {
          out.stopped = true;
          break;
        }
        const body = (await api.battles(p.nick, p.world, page)) || {};
        const list = body.battle_list || [];
        out.pages++;
        if (!list.length) break;
        const rows = list.map(parseBattle).filter(Boolean);
        out.games += rows.length;
        out.added += await store.addBattles(rows);
        let oldest = '';
        for (const r of rows) {
          if (r.date > newest) newest = r.date;
          if (!oldest || r.date < oldest) oldest = r.date;
          if (GRADES_TOP.includes(r.bGrade)) push(r.bNick, r.bWorld, { grade: r.bGrade }); // strong opponents join the list
        }
        if (known.lastDate && oldest && oldest <= known.lastDate) break; // the rest is already stored
        if (page * 10 >= (Number(body.total_count) || 0)) break;
      }
      await store.setPlayer(k, { nick: p.nick, world: p.world, rank: p.rank || known.rank || null, grade: p.grade || known.grade || '', lastDate: newest, checkedAt: (opts.now || new Date()).toISOString() });
      out.players++;
      say({ step: 'players', done: out.players, of: Math.min(track, queue.length), pages: out.pages, games: out.games, added: out.added });
    }
    return out;
  }

  /**
   * Rows of top players' games -> matches for RTALearn.buildStats (one per game; it counts both teams itself). Only games where both players are Legend / Emperor (as E7DaT),
   * of the newest season among the rows (its pre-season included), not older than maxAgeDays before the newest game.
   */
  function toStatsMatches(rows, opts = {}) {
    const maxAge = (opts.maxAgeDays || 60) * 86400000;
    const list = (rows || []).filter((r) => GRADES_TOP.includes(r.aGrade) && GRADES_TOP.includes(r.bGrade));
    let newest = '';
    for (const r of list) if (r.date > newest) newest = r.date;
    const cut = newest ? new Date(Date.parse(newest) - maxAge).toISOString() : '';
    const out = [];
    for (const r of list) {
      if (r.date < cut) continue;
      // (RTALearn.buildStats leaves the banned heroes out of the teams itself: theyBanned / iBanned)
      const A = r.a.picks;
      const B = r.b.picks;
      // one match per game: RTALearn.buildStats counts both teams of a match (hero win rates, match-ups both ways, pairs)
      out.push({ id: r.seq, date: r.date, source: 'top players', opponent: '', result: r.aWin ? 'win' : 'loss', firstPick: r.aFirst === false ? 'opp' : 'me', myPicks: A, oppPicks: B, myPrebans: r.a.prebans, oppPrebans: r.b.prebans, iBanned: r.b.ban, theyBanned: r.a.ban });
    }
    return out;
  }

  const api = { WORLDS, SETS, setName, GRADES_TOP, seasonOf, frag, parseBattle, toMatch, summary, latestSeason, earlierSeasons, crawl, toStatsMatches };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7Records = api;
})(typeof self !== 'undefined' ? self : this);
