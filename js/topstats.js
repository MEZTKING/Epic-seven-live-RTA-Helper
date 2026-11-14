/*
 * Tables for the "Top players" statistics page (DEVLOG #47). Pure functions, no DOM: browser global `E7TopStats`
 * and Node (tests). Everything is derived from the stored top-player model (js/topmodel.js `build()` output) and, for
 * builds, from the stored games (E7Records.parseBattle() rows). Source label on the page: 'top players'.
 *
 *   overview(stats)                    -> headline numbers
 *   heroes(stats, model)               -> one row per hero (pick, win, strength, pre-bans by role, bans, speed)
 *   sortRows(rows, key, dir)           -> sorted copy (nulls last)
 *   partners(stats, model, code, opt)  -> { best: [{ code, pp, n }], worst: [...] }   same team
 *   matchups(stats, model, code, opt)  -> { good: [...], bad: [...] }                 against
 *   topPairs / topCounters(stats, model, opt) -> the strongest pair / counter effects overall
 *   prebans(stats, role, k)            -> most pre-banned as 'first' | 'second' | 'any'
 *   openers(stats, k)                  -> what first-pick players open with
 *   builds(rows, opt)                  -> Map code -> { games, list: [{ artifact, sets[], n, wins, share }] }
 *   trends(rows, opt)                  -> { from, mid, to, gamesNow, gamesBefore, heroes: Map code -> { now, before, delta } } | null
 *   sameBuild(mine, top)               -> { sets, artifact } do my sets / artifact match a top-player build (names)
 *   turnLists(stats, opt)              -> { fastest: [{ code, fast, cr }], needs: [{ code, wr1, wr0, dep, n1, n0 }] }
 */
(function (root) {
  'use strict';

  function overview(stats) {
    const m = (stats && stats.meta) || {};
    const bt = m.backtest && m.backtest.n ? m.backtest : null;
    return {
      games: m.games || 0,
      weightedGames: m.weightedGames || 0,
      heroes: Object.values((stats && stats.heroes) || {}).filter((h) => h.n > 0).length,
      latestDay: m.latestDay || '',
      firstPickWr: m.firstPickWr === undefined ? null : m.firstPickWr,
      firstTurnWr: m.ftWin === undefined ? null : m.ftWin, // how often the side with the first turn wins
      turnCheck: bt && bt.ftAccuracy ? { accuracy: bt.ftAccuracy, n: bt.ftGames } : null, // first turn called from the draft alone
      useTurn: !!m.useTurn,
      season: m.season ? m.season.code : '',
      check: bt ? { n: bt.n, accuracy: bt.accuracy, logloss: bt.logloss, coin: bt.coinLogloss, bins: bt.bins || [] } : null,
    };
  }

  /**
   * One row per hero that was picked. pp = the model's hero effect in percentage points of win rate near 50%, with the
   * players' skill taken out; ppFirst / ppSecond = the same on the first-pick / second-pick side.
   */
  function heroes(stats, model) {
    const out = [];
    for (const [code, h] of Object.entries((stats && stats.heroes) || {})) {
      if (!(h.pick > 0) && !(h.preban > 0)) continue;
      out.push({
        code,
        games: h.n || 0,
        pick: h.pick || 0,
        wr: h.wr === undefined ? null : h.wr,
        pp: h.n > 0 ? model.pp(h.b || 0) : null,
        ppFirst: h.n > 0 ? model.pp((h.b || 0) + (h.bf || 0)) : null,
        ppSecond: h.n > 0 ? model.pp((h.b || 0) + (h.bs || 0)) : null,
        prebanAny: h.preban || 0,
        prebanFirst: h.prebanPf === undefined ? null : h.prebanPf,
        prebanSecond: h.prebanPs === undefined ? null : h.prebanPs,
        first: h.first || 0,
        banned: h.pick > 0 ? h.banned || 0 : null,
        slot: h.slot || [0, 0, 0, 0, 0],
        cr: h.cr === undefined ? null : h.cr,
        fast: h.fast === undefined ? null : h.fast,
        tf: h.tf === undefined ? null : h.tf,
        wr1: (h.n1 || 0) >= 15 && (h.n0 || 0) >= 15 ? h.wr1 : null,
        wr0: (h.n1 || 0) >= 15 && (h.n0 || 0) >= 15 ? h.wr0 : null,
      });
    }
    return out;
  }

  function sortRows(rows, key, dir = -1) {
    const nul = (v) => v === null || v === undefined || Number.isNaN(v);
    return [...rows].sort((a, b) => {
      const x = a[key];
      const y = b[key];
      if (nul(x) && nul(y)) return 0;
      if (nul(x)) return 1;
      if (nul(y)) return -1;
      if (typeof x === 'string') return dir * x.localeCompare(y);
      return dir * (x - y) || b.games - a.games;
    });
  }

  const pairList = (table, sep, code, model, minN) => {
    const out = [];
    for (const [k, v] of Object.entries(table || {})) {
      const [a, b] = k.split(sep);
      if (a !== code && b !== code) continue;
      if (v[0] < minN) continue;
      // counters are stored as "a>b" = a's side gains; seen from `code` the sign flips when it is b
      const d = sep === '>' && b === code ? -v[1] : v[1];
      out.push({ code: a === code ? b : a, pp: model.pp(d), n: Math.round(v[0]) });
    }
    return out;
  };
  const split = (list, k) => {
    const s = [...list].sort((x, y) => y.pp - x.pp);
    return [s.filter((x) => x.pp > 0).slice(0, k), s.filter((x) => x.pp < 0).reverse().slice(0, k)];
  };
  /** Team-mates it does better / worse with than the two heroes' own strengths explain. n = weighted games together. */
  function partners(stats, model, code, opt = {}) {
    const [best, worst] = split(pairList(stats.syn, '|', code, model, opt.minGames || 15), opt.k || 6);
    return { best, worst };
  }
  /** Enemies it does better / worse against. */
  function matchups(stats, model, code, opt = {}) {
    const [good, bad] = split(pairList(stats.ctr, '>', code, model, opt.minGames || 15), opt.k || 6);
    return { good, bad };
  }
  function topPairs(stats, model, opt = {}) {
    const min = opt.minGames || 30;
    return Object.entries((stats && stats.syn) || {}).filter(([, v]) => v[0] >= min).map(([k, v]) => ({ a: k.split('|')[0], b: k.split('|')[1], pp: model.pp(v[1]), n: Math.round(v[0]) })).sort((x, y) => y.pp - x.pp).slice(0, opt.k || 12);
  }
  /** a beats b: sorted by size, always written from the winner's side. */
  function topCounters(stats, model, opt = {}) {
    const min = opt.minGames || 30;
    return Object.entries((stats && stats.ctr) || {}).filter(([, v]) => v[0] >= min).map(([k, v]) => {
      const [a, b] = k.split('>');
      return v[1] >= 0 ? { a, b, pp: model.pp(v[1]), n: Math.round(v[0]) } : { a: b, b: a, pp: model.pp(-v[1]), n: Math.round(v[0]) };
    }).sort((x, y) => y.pp - x.pp).slice(0, opt.k || 12);
  }
  /** role: 'first' (players with the first pick), 'second', or 'any' (pre-banned by either player). */
  function prebans(stats, role = 'any', k = 8) {
    const key = role === 'first' ? 'prebanPf' : role === 'second' ? 'prebanPs' : 'preban';
    return Object.entries((stats && stats.heroes) || {}).map(([code, h]) => ({ code, rate: h[key] || 0 })).filter((x) => x.rate >= 0.01).sort((x, y) => y.rate - x.rate).slice(0, k);
  }
  function openers(stats, k = 8) {
    return Object.entries((stats && stats.heroes) || {}).map(([code, h]) => ({ code, rate: h.first || 0 })).filter((x) => x.rate >= 0.01).sort((x, y) => y.rate - x.rate).slice(0, k);
  }

  /**
   * How top players build each hero: artifact + gear sets, from games where the hero actually played (not banned).
   * rows: parseBattle rows; opt.grades (default legend / emperor), opt.since (ISO day, optional), opt.top (default 3).
   */
  function builds(rows, opt = {}) {
    const grades = opt.grades || ['legend', 'emperor'];
    const acc = new Map();
    for (const r of rows || []) {
      if (!r || !r.a || !r.b) continue;
      if (opt.since && r.day < opt.since) continue;
      for (const [side, grade, won] of [[r.a, r.aGrade, !!r.aWin], [r.b, r.bGrade, !r.aWin]]) {
        if (!grades.includes(grade)) continue;
        for (const code of side.picks || []) {
          if (!code || code === side.ban) continue;
          const b = side.builds && side.builds[code];
          if (!b || (!b.artifact && !(b.sets || []).length)) continue;
          const sets = [...(b.sets || [])].filter(Boolean).sort();
          const key = `${b.artifact || ''}#${sets.join('+')}`;
          if (!acc.has(code)) acc.set(code, { games: 0, map: new Map() });
          const h = acc.get(code);
          h.games++;
          if (!h.map.has(key)) h.map.set(key, { artifact: b.artifact || '', sets, n: 0, wins: 0 });
          const e = h.map.get(key);
          e.n++;
          if (won) e.wins++;
        }
      }
    }
    const out = new Map();
    for (const [code, h] of acc) {
      const list = [...h.map.values()].sort((x, y) => y.n - x.n).slice(0, opt.top || 3).map((e) => ({ ...e, share: e.n / h.games }));
      out.set(code, { games: h.games, list });
    }
    return out;
  }

  /**
   * What changed lately: each hero's pick rate in the newest `days` days against the `days` before them (games between
   * Legend / Emperor players, plain counts). null when either window has fewer than opt.minGames (default 150) games.
   * delta is in share of games (0.03 = three points more).
   */
  function trends(rows, opt = {}) {
    const days = opt.days || 7;
    const grades = opt.grades || ['legend', 'emperor'];
    const list = (rows || []).filter((r) => r && r.day && r.a && r.b && grades.includes(r.aGrade) && grades.includes(r.bGrade));
    let to = '';
    for (const r of list) if (r.day > to) to = r.day;
    if (!to) return null;
    const back = (n) => new Date(Date.parse(to + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);
    const mid = back(days - 1); // first day of the newer window
    const from = back(2 * days - 1);
    const cnt = [new Map(), new Map()];
    const games = [0, 0];
    for (const r of list) {
      if (r.day < from) continue;
      const k = r.day >= mid ? 0 : 1;
      games[k]++;
      for (const side of [r.a, r.b]) for (const c of side.picks || []) if (c) cnt[k].set(c, (cnt[k].get(c) || 0) + 1);
    }
    if (games[0] < (opt.minGames || 150) || games[1] < (opt.minGames || 150)) return null;
    const heroesMap = new Map();
    for (const c of new Set([...cnt[0].keys(), ...cnt[1].keys()])) {
      const now = (cnt[0].get(c) || 0) / games[0];
      const before = (cnt[1].get(c) || 0) / games[1];
      heroesMap.set(c, { now, before, delta: now - before });
    }
    return { from, mid, to, days, gamesNow: games[0], gamesBefore: games[1], heroes: heroesMap };
  }

  /** Does my build (set names, artifact name) match one top-player build (set names, artifact name)? */
  function sameBuild(mine, top) {
    const norm = (list) => [...(list || [])].map((x) => String(x).trim().toLowerCase()).filter(Boolean).sort().join('+');
    const art = (x) => String(x || '').trim().toLowerCase();
    return { sets: !!norm(mine.sets) && norm(mine.sets) === norm(top.sets), artifact: !!art(mine.artifact) && art(mine.artifact) === art(top.artifact) };
  }

  /**
   * Turn order (DEVLOG #51): who is the fastest of all ten most often, and who depends most on its side having the
   * first turn (win rate with it minus without it; both from at least opt.minGames = 30 games).
   */
  function turnLists(stats, opt = {}) {
    const k = opt.k || 8;
    const min = opt.minGames || 30;
    const H = Object.entries((stats && stats.heroes) || {}).filter(([, h]) => h.cr !== undefined);
    const fastest = H.filter(([, h]) => (h.n1 || 0) + (h.n0 || 0) >= min && h.fast >= 0.05).map(([code, h]) => ({ code, fast: h.fast, cr: h.cr })).sort((x, y) => y.fast - x.fast).slice(0, k);
    const needs = H.filter(([, h]) => (h.n1 || 0) >= min && (h.n0 || 0) >= min).map(([code, h]) => ({ code, wr1: h.wr1, wr0: h.wr0, dep: h.wr1 - h.wr0, n1: Math.round(h.n1), n0: Math.round(h.n0) })).filter((x) => x.dep > 0.03).sort((x, y) => y.dep - x.dep).slice(0, k);
    return { fastest, needs };
  }

  const api = { overview, heroes, sortRows, turnLists, partners, matchups, topPairs, topCounters, prebans, openers, builds, trends, sameBuild };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7TopStats = api;
})(typeof self !== 'undefined' ? self : this);
