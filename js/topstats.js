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

  const api = { overview, heroes, sortRows, partners, matchups, topPairs, topCounters, prebans, openers, builds };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7TopStats = api;
})(typeof self !== 'undefined' ? self : this);
