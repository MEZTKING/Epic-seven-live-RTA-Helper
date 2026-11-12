/*
 * Learning engine: turns logged matches into stats. Pure (no DOM).
 * Browser: window.RTALearn. Node: require().
 *
 * A match looks like:
 *   { source, result: 'win'|'loss', opponent, firstPick: 'me'|'opp',
 *     myPrebans, oppPrebans, myPicks, oppPicks, iBanned, theyBanned }
 * `iBanned` is the enemy hero I postbanned, `theyBanned` is my hero they postbanned.
 * Postbanned heroes did not fight, so they are left out of win/matchup stats.
 *
 * Matches carry a `source` ('manual', 'auto', 'import:<name>', ...) and every
 * function here only sees the matches it is given, so the caller decides which
 * sources to trust.
 */
(function (root) {
  const PRIOR = 4; // pseudo-games at 50% used to smooth small samples

  /** Win rate pulled toward 50% when there are few games. */
  function smoothed(wins, games, prior = PRIOR) {
    return (wins + prior * 0.5) / (games + prior);
  }

  function bump(map, key, won) {
    let r = map.get(key);
    if (!r) map.set(key, (r = { games: 0, wins: 0 }));
    r.games++;
    if (won) r.wins++;
    return r;
  }
  const count = (map, key, n = 1) => map.set(key, (map.get(key) || 0) + n);
  const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  /** Heroes that actually fought for each side. */
  function lineups(m) {
    const mine = (m.myPicks || []).filter((c) => c !== m.theyBanned);
    const theirs = (m.oppPicks || []).filter((c) => c !== m.iBanned);
    return { mine, theirs };
  }

  /**
   * Build all stats from a list of matches.
   *   hero:     code -> { team: {games,wins}  (on either team; wins = that team won)
   *                       mine: {games,wins}  (fought for me)
   *                       vsMe: {games,wins}  (fought against me; wins = MY wins)
   *                       picked, pickedByMe, pickedByOpp, prebanned, postbanned, appearances }
   *   matchup:  'a>b' -> {games, wins}   a fought against b; wins = a's team won
   *   pair:     'a|b' -> {games, wins}   a and b fought together; wins = their team won
   *   players:  name -> profile (see buildProfile)
   */
  function buildStats(matches) {
    const hero = new Map();
    const matchup = new Map();
    const pair = new Map();
    const H = (c) => {
      let h = hero.get(c);
      if (!h) {
        h = {
          team: { games: 0, wins: 0 },
          mine: { games: 0, wins: 0 },
          vsMe: { games: 0, wins: 0 },
          pickedByMe: 0,
          pickedByOpp: 0,
          prebanned: 0,
          postbanned: 0,
          appearances: 0,
        };
        hero.set(c, h);
      }
      return h;
    };
    const add = (r, won) => {
      r.games++;
      if (won) r.wins++;
    };

    for (const m of matches) {
      const iWon = m.result === 'win';
      const { mine, theirs } = lineups(m);
      const seenInMatch = new Set();
      const seen = (c) => {
        if (!seenInMatch.has(c)) {
          seenInMatch.add(c);
          H(c).appearances++;
        }
      };
      for (const c of m.myPicks || []) (H(c).pickedByMe++, seen(c));
      for (const c of m.oppPicks || []) (H(c).pickedByOpp++, seen(c));
      for (const c of [...(m.myPrebans || []), ...(m.oppPrebans || [])]) (H(c).prebanned++, seen(c));
      for (const c of [m.iBanned, m.theyBanned]) if (c) H(c).postbanned++;

      for (const c of mine) {
        add(H(c).team, iWon);
        add(H(c).mine, iWon);
      }
      for (const c of theirs) {
        add(H(c).team, !iWon);
        add(H(c).vsMe, iWon);
      }
      for (const a of mine)
        for (const b of theirs) {
          bump(matchup, `${a}>${b}`, iWon);
          bump(matchup, `${b}>${a}`, !iWon);
        }
      const pairs = (team, won) => {
        for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) bump(pair, pairKey(team[i], team[j]), won);
      };
      pairs(mine, iWon);
      pairs(theirs, !iWon);
    }

    const players = new Map();
    const byPlayer = new Map();
    for (const m of matches) {
      const name = (m.opponent || '').trim();
      if (!name) continue;
      const k = name.toLowerCase();
      if (!byPlayer.has(k)) byPlayer.set(k, { name, list: [] });
      byPlayer.get(k).list.push(m);
    }
    for (const [k, { name, list }] of byPlayer) players.set(k, buildProfile(name, list));

    return { games: matches.length, hero, matchup, pair, players };
  }

  /** Everything we know about one opponent from the matches against them. */
  function buildProfile(name, matches) {
    const picks = new Map();
    const prebans = new Map();
    const firstPicks = new Map();
    const postbans = new Map(); // which of MY heroes they ban
    let myWins = 0;
    let theyFirst = 0;
    let lastSeen = null;
    for (const m of matches) {
      if (m.result === 'win') myWins++;
      for (const c of m.oppPicks || []) count(picks, c);
      for (const c of m.oppPrebans || []) count(prebans, c);
      if (m.theyBanned) count(postbans, m.theyBanned);
      if (m.firstPick === 'opp') {
        theyFirst++;
        if (m.oppPicks && m.oppPicks[0]) count(firstPicks, m.oppPicks[0]);
      }
      if (m.date && (!lastSeen || m.date > lastSeen)) lastSeen = m.date;
    }
    const top = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([code, n]) => ({ code, n, rate: n / matches.length }));
    return {
      name,
      games: matches.length,
      myWins,
      theyPickedFirst: theyFirst,
      lastSeen,
      picks: top(picks),
      prebans: top(prebans),
      firstPicks: top(firstPicks),
      postbans: top(postbans),
    };
  }

  function getProfile(stats, name) {
    return (name && stats.players.get(String(name).trim().toLowerCase())) || null;
  }

  /** Learned matchup of hero a against hero b: {games, wr} (wr = a's team win rate, smoothed). */
  function matchupOf(stats, a, b) {
    const r = stats.matchup.get(`${a}>${b}`);
    return r ? { games: r.games, wr: smoothed(r.wins, r.games), raw: r.wins / r.games } : null;
  }
  function pairOf(stats, a, b) {
    const r = stats.pair.get(pairKey(a, b));
    return r ? { games: r.games, wr: smoothed(r.wins, r.games), raw: r.wins / r.games } : null;
  }

  /** Best-performing pairs and trios from MY teams. */
  function topCombos(matches, { size = 2, minGames = 3, limit = 10 } = {}) {
    const combos = new Map();
    for (const m of matches) {
      const team = [...lineups(m).mine].sort();
      for (const combo of choose(team, size)) bump(combos, combo.join('|'), m.result === 'win');
    }
    return [...combos.entries()]
      .filter(([, r]) => r.games >= minGames)
      .map(([k, r]) => ({ heroes: k.split('|'), games: r.games, wins: r.wins, wr: smoothed(r.wins, r.games) }))
      .sort((a, b) => b.wr - a.wr || b.games - a.games)
      .slice(0, limit);
  }

  function choose(arr, k, start = 0, acc = [], out = []) {
    if (acc.length === k) {
      out.push(acc.slice());
      return out;
    }
    for (let i = start; i < arr.length; i++) {
      acc.push(arr[i]);
      choose(arr, k, i + 1, acc, out);
      acc.pop();
    }
    return out;
  }

  /** Record of a preset core: matches where ALL its heroes were in my picks. */
  function presetRecord(matches, heroes) {
    const r = { games: 0, wins: 0 };
    if (!heroes.length) return r;
    for (const m of matches) {
      const mine = new Set(m.myPicks || []);
      if (heroes.every((c) => mine.has(c))) {
        r.games++;
        if (m.result === 'win') r.wins++;
      }
    }
    return r;
  }


  // ------------------------------------------------------------ scouting
  /*
   * Scouting = what you observed about OPPONENTS' heroes during matches
   * (source 'scouting'): speed (read from the CR bar or typed), sets, artifact.
   * entry: { player, code, speed?, min?, max?, sets?: [], artifact?, method, at }
   */
  function median(xs) {
    const a = xs.slice().sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function summarize(list) {
    const speeds = list.map((e) => Number(e.speed)).filter((x) => x > 0);
    const sets = new Map();
    const arts = new Map();
    for (const e of list) {
      if (e.sets && e.sets.length) count(sets, e.sets.slice().sort().join(' + '));
      if (e.artifact) count(arts, e.artifact);
    }
    const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
    const latest = list.slice().sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
    return {
      n: list.length,
      speed: speeds.length ? Math.round(median(speeds)) : null,
      low: speeds.length ? Math.min(...speeds) : null,
      high: speeds.length ? Math.max(...speeds) : null,
      speeds: speeds.length,
      sets: top(sets),
      artifacts: top(arts),
      latest,
    };
  }
  /** -> { all: Map code -> summary, byPlayer: Map playerLower -> Map code -> summary } */
  function scoutSummary(entries) {
    const byCode = new Map();
    const byPlayer = new Map();
    for (const e of entries || []) {
      if (!e || !e.code) continue;
      if (!byCode.has(e.code)) byCode.set(e.code, []);
      byCode.get(e.code).push(e);
      const p = String(e.player || '').trim().toLowerCase();
      if (!p) continue;
      if (!byPlayer.has(p)) byPlayer.set(p, new Map());
      const m = byPlayer.get(p);
      if (!m.has(e.code)) m.set(e.code, []);
      m.get(e.code).push(e);
    }
    const all = new Map([...byCode].map(([c, l]) => [c, summarize(l)]));
    const players = new Map([...byPlayer].map(([p, m]) => [p, new Map([...m].map(([c, l]) => [c, summarize(l)]))]));
    return { all, byPlayer: players };
  }

  // ------------------------------------------------------------ sessions
  /** Today's record, current streak and the points history. */
  function sessionStats(matches, now = new Date()) {
    const sorted = matches.filter((m) => m.date).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const day = (d) => new Date(d).toDateString();
    const today = sorted.filter((m) => day(m.date) === now.toDateString());
    let streak = { result: null, n: 0 };
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (!streak.result) streak = { result: sorted[i].result, n: 1 };
      else if (sorted[i].result === streak.result) streak.n++;
      else break;
    }
    return {
      today: { games: today.length, wins: today.filter((m) => m.result === 'win').length },
      streak,
      points: sorted.filter((m) => typeof m.points === 'number' && !Number.isNaN(m.points)).map((m) => ({ date: m.date, points: m.points, result: m.result })),
    };
  }

  // ------------------------------------------------ did the suggestions help?
  /*
   * match.suggestLog = [{ chosen, top: [codes] }] for each of MY picks.
   * Compares win rates of drafts where you mostly followed the suggestions
   * (3+ of your picks were in the top 3) against drafts where you didn't.
   */
  function suggestionFollow(matches) {
    let picks = 0;
    let followed = 0;
    const mostly = { games: 0, wins: 0 };
    const rarely = { games: 0, wins: 0 };
    for (const m of matches) {
      const log = m.suggestLog || [];
      if (!log.length) continue;
      const f = log.filter((x) => (x.top || []).includes(x.chosen)).length;
      picks += log.length;
      followed += f;
      const bucket = f >= 3 ? mostly : rarely;
      bucket.games++;
      if (m.result === 'win') bucket.wins++;
    }
    return { picks, followed, mostly, rarely };
  }

  const api = { scoutSummary, sessionStats, suggestionFollow, median, PRIOR, smoothed, buildStats, buildProfile, getProfile, matchupOf, pairOf, topCombos, presetRecord, lineups };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RTALearn = api;
})(typeof window !== 'undefined' ? window : globalThis);
