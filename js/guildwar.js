/*
 * Guild War logic (Epic Seven). Pure (no DOM, no network).
 * Browser: window.RTAGuildWar. Node: require().
 *
 * All guild data is a flat list of RECORDS shared between guildmates (see
 * js/sync.js). Every record has { id, type, updatedAt, updatedBy } plus:
 *
 *   member   { name, roster?: [codes], defense?: [{ heroes: [codes] }, { heroes }] }
 *   war      { enemyGuild, season?, startedAt, status: 'active'|'done', notes }
 *   target   { warId, player, tower, teams: [{ heroes: [3 codes], speeds: {code: n}, sets: {code: 'Speed+Crit'},
 *              artifacts: {code: name}, notes }, {...}], assignedTo?: memberName, notes }
 *   attack   { warId, targetId, by: memberName, team: 1|2, heroes: [my 3 codes], speeds?: {code: n} (attacker's
 *              own speeds from their gear.txt, if they chose to share), result: 'win'|'loss', notes, at }
 *   defense  { warId?, member: memberName, team: 1|2, attacker?: enemyName, attackerHeroes?: [codes], result: 'held'|'lost', at }
 *   hero     { code, tags: [], skills: { S1, S2, S3, other } }   guild-shared hero notes (id 'hero-<code>')
 *
 * The guild is its own data source ('guild'). Nothing here is mixed into the
 * RTA helper's own data.
 */
(function (root) {
  const DEFAULT_RULES = { attacksPerMember: 2, teamsPerDefense: 2, heroesPerTeam: 3 };

  const teamKey = (heroes) => (heroes || []).filter(Boolean).slice().sort().join('+');
  const playerKey = (name) => String(name || '').trim().toLowerCase();

  /** Records -> organised state. Later updatedAt wins if an id appears twice. */
  function buildState(records) {
    const byId = new Map();
    for (const r of records || []) {
      if (!r || !r.id || !r.type) continue;
      const prev = byId.get(r.id);
      if (!prev || String(r.updatedAt || '') >= String(prev.updatedAt || '')) byId.set(r.id, r);
    }
    const all = [...byId.values()].filter((r) => !r.deleted);
    const of = (t) => all.filter((r) => r.type === t);
    const wars = of('war').sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
    return {
      members: of('member').sort((a, b) => String(a.name).localeCompare(String(b.name))),
      wars,
      targets: of('target'),
      attacks: of('attack').sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))),
      defenses: of('defense'),
      settings: of('settings')[0] || null,
      heroNotes: of('hero'), // guild-shared hero tags / skill notes
    };
  }

  /** Status of one enemy target: which teams are cleared, by whom, attempts. */
  function targetStatus(target, attacks, rules = DEFAULT_RULES) {
    const mine = attacks.filter((a) => a.targetId === target.id);
    const teams = [];
    for (let t = 1; t <= rules.teamsPerDefense; t++) {
      const on = mine.filter((a) => Number(a.team) === t);
      const win = on.find((a) => a.result === 'win');
      teams.push({ team: t, cleared: !!win, by: win ? win.by : null, attempts: on.length, losses: on.filter((a) => a.result === 'loss').length });
    }
    return { cleared: teams.every((x) => x.cleared), teams, attempts: mine.length };
  }

  /** Attacks used per member in a war (or one day of it, if `day` is given as YYYY-MM-DD). */
  function attacksUsed(attacks, warId, day = null) {
    const m = new Map();
    for (const a of attacks) {
      if (a.warId !== warId) continue;
      if (day && String(a.at || '').slice(0, 10) !== day) continue;
      const k = playerKey(a.by);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }

  function warSummary(state, warId, rules = DEFAULT_RULES, day = null) {
    const targets = state.targets.filter((t) => t.warId === warId);
    const attacks = state.attacks.filter((a) => a.warId === warId);
    const statuses = targets.map((t) => ({ target: t, ...targetStatus(t, attacks, rules) }));
    const used = attacksUsed(state.attacks, warId, day);
    const members = state.members.map((m) => {
      const n = used.get(playerKey(m.name)) || 0;
      return { name: m.name, used: n, left: Math.max(0, rules.attacksPerMember - n) };
    });
    return {
      targets: statuses,
      cleared: statuses.filter((s) => s.cleared).length,
      teamsCleared: statuses.reduce((n, s) => n + s.teams.filter((t) => t.cleared).length, 0),
      teamsTotal: statuses.length * rules.teamsPerDefense,
      attacks: attacks.length,
      wins: attacks.filter((a) => a.result === 'win').length,
      members,
      attacksLeft: members.reduce((n, m) => n + m.left, 0),
    };
  }

  /** The defense team an attack was made against. */
  function defenseOf(attack, targetsById) {
    const t = targetsById.get(attack.targetId);
    const team = t && t.teams && t.teams[Number(attack.team) - 1];
    return team && team.heroes && team.heroes.length ? team.heroes : null;
  }

  /**
   * Guild history: for every enemy defense team seen, which of our attack teams
   * won or lost against it. defKey -> [{ attack: [codes], wins, games, by: Set }]
   */
  function counterBook(state) {
    const targetsById = new Map(state.targets.map((t) => [t.id, t]));
    const book = new Map();
    for (const a of state.attacks) {
      const def = defenseOf(a, targetsById);
      if (!def || !(a.heroes || []).length) continue;
      const dk = teamKey(def);
      if (!book.has(dk)) book.set(dk, new Map());
      const ak = teamKey(a.heroes);
      const row = book.get(dk).get(ak) || { attack: ak.split('+'), defense: dk.split('+'), wins: 0, games: 0, by: new Set(), winSpeeds: {} };
      row.games++;
      if (a.result === 'win') {
        row.wins++;
        // slowest speed each hero has won with: "you need at least this"
        for (const [c, v] of Object.entries(a.speeds || {})) if (Number(v) > 0) row.winSpeeds[c] = Math.min(row.winSpeeds[c] || Infinity, Number(v));
      }
      row.by.add(a.by);
      book.get(dk).set(ak, row);
    }
    const out = new Map();
    for (const [dk, m] of book) out.set(dk, [...m.values()].sort((x, y) => y.wins - x.wins || x.games - y.games));
    return out;
  }

  /**
   * Counter ideas for a defense team, from guild history. Exact matches first,
   * then defenses sharing 2 of 3 heroes. Optionally only teams a member owns.
   * Returns [{ attack: [codes], wins, games, exact, by: [names], owners?: [names] }]
   */
  function suggestCounters(defenseHeroes, book, { members = [], limit = 5 } = {}) {
    const dk = teamKey(defenseHeroes);
    const want = new Set(defenseHeroes || []);
    const rows = [];
    for (const [k, list] of book) {
      const overlap = k.split('+').filter((c) => want.has(c)).length;
      const exact = k === dk;
      if (!exact && overlap < 2) continue;
      for (const r of list) if (r.wins > 0) rows.push({ attack: r.attack, wins: r.wins, games: r.games, exact, by: [...r.by], winSpeeds: { ...r.winSpeeds } });
    }
    const merged = new Map();
    for (const r of rows) {
      const k = teamKey(r.attack) + (r.exact ? '|x' : '|s');
      const m = merged.get(k);
      if (m) {
        m.wins += r.wins;
        m.games += r.games;
        for (const b of r.by) if (!m.by.includes(b)) m.by.push(b);
        for (const [c, v] of Object.entries(r.winSpeeds || {})) m.winSpeeds[c] = Math.min(m.winSpeeds[c] || Infinity, v);
      } else merged.set(k, { ...r, by: [...r.by], winSpeeds: { ...(r.winSpeeds || {}) } });
    }
    const list = [...merged.values()].sort((a, b) => Number(b.exact) - Number(a.exact) || b.wins / b.games - a.wins / a.games || b.wins - a.wins);
    for (const r of list) {
      r.owners = members.filter((m) => (m.roster || []).length && r.attack.every((c) => m.roster.includes(c))).map((m) => m.name);
    }
    return list.slice(0, limit);
  }

  /**
   * Who should attack what: for each uncleared target team, the members with
   * attacks left who own a known counter (best first).
   */
  function assignmentIdeas(state, warId, rules = DEFAULT_RULES, day = null) {
    const sum = warSummary(state, warId, rules, day);
    const book = counterBook(state);
    const left = new Map(sum.members.map((m) => [playerKey(m.name), m.left]));
    const ideas = [];
    for (const s of sum.targets) {
      s.teams.forEach((st, i) => {
        if (st.cleared) return;
        const team = s.target.teams && s.target.teams[i];
        if (!team || !(team.heroes || []).length) return;
        const counters = suggestCounters(team.heroes, book, { members: state.members });
        const who = [];
        for (const c of counters) for (const o of c.owners || []) if ((left.get(playerKey(o)) || 0) > 0 && !who.includes(o)) who.push(o);
        ideas.push({ target: s.target, team: st.team, counters, members: who });
      });
    }
    return ideas;
  }

  /** Everything seen of one enemy player across all wars. */
  function enemyHistory(state, name) {
    const k = playerKey(name);
    const wars = new Map(state.wars.map((w) => [w.id, w]));
    const targets = state.targets.filter((t) => playerKey(t.player) === k);
    return targets
      .map((t) => {
        const st = targetStatus(t, state.attacks.filter((a) => a.targetId === t.id));
        const w = wars.get(t.warId);
        return { target: t, war: w || null, status: st, attacks: state.attacks.filter((a) => a.targetId === t.id) };
      })
      .sort((a, b) => String((b.war && b.war.startedAt) || '').localeCompare(String((a.war && a.war.startedAt) || '')));
  }

  /** Per-member record: attacks, wins, defenses held/lost. */
  function memberStats(state) {
    const out = new Map();
    const get = (n) => {
      const k = playerKey(n);
      if (!out.has(k)) out.set(k, { name: n, attacks: 0, wins: 0, held: 0, lost: 0 });
      return out.get(k);
    };
    for (const m of state.members) get(m.name);
    for (const a of state.attacks) {
      const s = get(a.by);
      s.attacks++;
      if (a.result === 'win') s.wins++;
    }
    for (const d of state.defenses) {
      const s = get(d.member);
      if (d.result === 'held') s.held++;
      else s.lost++;
    }
    return [...out.values()].sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
  }

  /** Enemy heroes that cause us the most losses (attacks against teams containing them). */
  function threatHeroes(state, limit = 10) {
    const targetsById = new Map(state.targets.map((t) => [t.id, t]));
    const m = new Map();
    for (const a of state.attacks) {
      const def = defenseOf(a, targetsById);
      if (!def) continue;
      for (const c of def) {
        const r = m.get(c) || { code: c, games: 0, losses: 0 };
        r.games++;
        if (a.result === 'loss') r.losses++;
        m.set(c, r);
      }
    }
    return [...m.values()].filter((r) => r.games >= 2).sort((a, b) => b.losses / b.games - a.losses / a.games || b.games - a.games).slice(0, limit);
  }


  // ------------------------------------------------------------ verdicts
  /*
   * A dot for each enemy team, from ONE member's point of view (their heroes and gear):
   *   grey    no information: nobody fought this team or a similar one
   *   red     no chance right now: lost to it repeatedly, never won
   *   yellow  not enough information, or a catch (only similar teams, one win, mixed record,
   *           you don't own the counter, or your heroes are slower than the ones that won)
   *   proven  proven counter you own, gear not checked (you haven't imported gear.txt)   [green ring]
   *   green   proven counter you own AND your gear checks out                             [green dot]
   * "Proven" = beaten this exact team 2+ times with no losses (or 3+ wins at 80%+).
   * Nothing is guaranteed in a game with crits and random turn meter; green means "reliable".
   */
  const LEVELS = ['red', 'grey', 'yellow', 'proven', 'green']; // worst -> best
  const PROVEN = { minWins: 2, altWins: 3, altRate: 0.8 };
  const SPEED_MARGIN = 0.03; // within 3% of the enemy counts as "too close to call"

  const isProven = (c) => c.exact && ((c.wins >= PROVEN.minWins && c.wins === c.games) || (c.wins >= PROVEN.altWins && c.wins / c.games >= PROVEN.altRate));

  /** Results of ALL our attacks against this exact defense (any attack team). */
  function recordVs(book, heroes) {
    const list = book.get(teamKey(heroes)) || [];
    const wins = list.reduce((n, r) => n + r.wins, 0);
    const games = list.reduce((n, r) => n + r.games, 0);
    let simLosses = 0;
    let simWins = 0;
    const want = new Set(heroes);
    for (const [k, l] of book) {
      if (k === teamKey(heroes)) continue;
      if (k.split('+').filter((c) => want.has(c)).length < 2) continue;
      for (const r of l) {
        simWins += r.wins;
        simLosses += r.games - r.wins;
      }
    }
    return { wins, losses: games - wins, games, simWins, simLosses };
  }

  /**
   * Latest known speed of each enemy hero for this player: from this target and
   * from every earlier time anyone in the guild recorded them.
   */
  function enemySpeeds(state, player, heroes, current) {
    const out = {};
    const k = playerKey(player);
    const wars = new Map(state.wars.map((w) => [w.id, w]));
    const seen = state.targets
      .filter((t) => playerKey(t.player) === k)
      .sort((a, b) => String(((wars.get(a.warId) || {}).startedAt) || a.updatedAt || '').localeCompare(String(((wars.get(b.warId) || {}).startedAt) || b.updatedAt || '')));
    for (const t of seen) for (const tm of t.teams || []) for (const [c, v] of Object.entries(tm.speeds || {})) if (heroes.includes(c) && Number(v) > 0) out[c] = Number(v);
    for (const [c, v] of Object.entries((current && current.speeds) || {})) if (Number(v) > 0) out[c] = Number(v); // this war's entry wins
    return out;
  }

  /**
   * me = { name, roster: Set|null (heroes I own; null = unknown), speeds: Map|null (from my gear.txt) }
   * Returns { level, label, lines: [why], counter?, others: [names who own a proven counter] }
   */
  function teamVerdict(state, target, teamIndex, me, book = counterBook(state), nm = (c) => c) {
    const team = (target.teams || [])[teamIndex] || {};
    const heroes = team.heroes || [];
    if (!heroes.length) return { level: 'grey', label: 'No information', lines: ['This team has not been recorded yet.'], others: [] };
    const rec = recordVs(book, heroes);
    const counters = suggestCounters(heroes, book, { members: state.members, limit: 10 });
    const proven = counters.filter(isProven);
    const others = [...new Set(proven.flatMap((c) => c.owners || []))].filter((n) => playerKey(n) !== playerKey(me && me.name));
    const lines = [];
    if (rec.games) lines.push(`Guild record vs this exact team: ${rec.wins}-${rec.losses}`);
    if (rec.simWins + rec.simLosses) lines.push(`Vs similar teams (2 of 3 heroes): ${rec.simWins}-${rec.simLosses}`);

    if (!rec.games && !(rec.simWins + rec.simLosses)) return { level: 'grey', label: 'No information', lines: ['Nobody in the guild has fought this team or a similar one yet.'], others };
    if (rec.wins === 0 && (rec.losses >= 2 || (rec.games === 0 && rec.simLosses >= 3 && rec.simWins === 0))) {
      return { level: 'red', label: 'No chance right now', lines: [...lines, 'Lost to it repeatedly and never won. Needs a new plan.'], others };
    }

    const owned = (c) => me && me.roster && c.attack.every((h) => me.roster.has(h));
    const mine = proven.filter(owned);
    if (mine.length) {
      // best proven counter I own: check my gear if I have it
      let best = null;
      for (const c of mine) {
        const check = gearCheck(c, me, enemySpeeds(state, target.player, heroes, team), nm);
        if (!best || LEVELS.indexOf(check.level) > LEVELS.indexOf(best.check.level)) best = { c, check };
      }
      const name = best.c.attack.map(nm).join(' + ');
      const head = `Proven counter you own: ${name} (${best.c.wins}-${best.c.games - best.c.wins}${best.c.by.length ? `, by ${best.c.by.join(', ')}` : ''})`;
      return { level: best.check.level, label: best.check.label, lines: [...lines, head, ...best.check.lines], counter: best.c, others };
    }
    if (proven.length) {
      const c = proven[0];
      const why = !me || !me.roster ? 'Share your roster (Members tab) so the app knows if you own it.' : "You don't own all of these heroes.";
      return { level: 'yellow', label: 'Proven counter, not yours', lines: [...lines, `Proven counter: ${c.attack.map(nm).join(' + ')} (${c.wins}-${c.games - c.wins})`, why], counter: c, others };
    }
    const c = counters[0];
    return {
      level: 'yellow',
      label: 'Not enough information',
      lines: [...lines, c ? `Best lead: ${c.attack.map(nm).join(' + ')} (${c.wins}-${c.games - c.wins}${c.exact ? '' : ', vs a similar team'})` : 'No win against it yet.'],
      counter: c || null,
      others,
    };
  }

  /** Is MY gear good enough for this counter? Compares my speeds with the slowest winning speeds and the enemy's speeds. */
  function gearCheck(counter, me, enemy, nm = (c) => c) {
    if (!me || !me.speeds || !counter.attack.some((h) => me.speeds.get(h))) {
      return { level: 'proven', label: 'Proven counter (gear not checked)', lines: ['Import your gear.txt (RTA → Data or Gear) to check your speeds too.'] };
    }
    const lines = [];
    let ok = true;
    for (const h of counter.attack) {
      const mine = me.speeds.get(h);
      const need = counter.winSpeeds && Number.isFinite(counter.winSpeeds[h]) ? counter.winSpeeds[h] : null;
      if (mine && need && mine < need - 2) {
        ok = false;
        lines.push(`Your ${nm(h)} is ${mine} speed; the slowest one that won had ${need}.`);
      }
    }
    const myFast = Math.max(0, ...counter.attack.map((h) => me.speeds.get(h) || 0));
    const theirFast = Math.max(0, ...Object.values(enemy || {}));
    if (myFast && theirFast) {
      if (myFast >= theirFast * (1 + SPEED_MARGIN)) lines.push(`You outspeed them: ${myFast} vs their fastest ~${theirFast}.`);
      else if (myFast > theirFast * (1 - SPEED_MARGIN)) {
        ok = false;
        lines.push(`Speed is too close to call: ${myFast} vs their fastest ~${theirFast}.`);
      } else {
        ok = false;
        lines.push(`They are faster: ${myFast} vs their fastest ~${theirFast}.`);
      }
    }
    if (ok) return { level: 'green', label: 'Proven counter + your gear checks out', lines: lines.length ? lines : ['Your speeds match the teams that won.'] };
    return { level: 'yellow', label: 'Proven counter, but your gear may fall short', lines };
  }

  /** A player's dot = their weakest team (you need to beat all of them). */
  function targetVerdict(state, target, me, rules = DEFAULT_RULES, book = counterBook(state), nm = (c) => c) {
    const n = Math.max(1, Math.min(rules.teamsPerDefense, (target.teams || []).length || rules.teamsPerDefense));
    const teams = [];
    for (let i = 0; i < n; i++) teams.push(teamVerdict(state, target, i, me, book, nm));
    const worst = teams.reduce((w, t) => (LEVELS.indexOf(t.level) < LEVELS.indexOf(w.level) ? t : w), teams[0]);
    return { level: worst.level, label: worst.label, teams };
  }

  /**
   * Everything known about an enemy player, across every war and season:
   * appearances (newest first), latest/max speed per hero, builds noted,
   * and our record against them.
   */
  function playerProfile(state, name) {
    const hist = enemyHistory(state, name);
    const heroes = new Map();
    const builds = [];
    let wins = 0;
    let losses = 0;
    for (const h of hist.slice().reverse()) {
      const when = (h.war && h.war.startedAt) || h.target.updatedAt || '';
      (h.target.teams || []).forEach((tm) => {
        for (const c of tm.heroes || []) {
          const r = heroes.get(c) || { code: c, seen: 0, latest: null, max: null, lastSeen: null };
          r.seen++;
          r.lastSeen = when;
          const v = Number((tm.speeds || {})[c]);
          if (v > 0) {
            r.latest = v;
            r.max = Math.max(r.max || 0, v);
          }
          heroes.set(c, r);
        }
        if (tm.build) builds.push({ text: tm.build, when, war: h.war ? h.war.enemyGuild : '' });
      });
      for (const a of h.attacks) a.result === 'win' ? wins++ : losses++;
    }
    const seasons = [...new Set(hist.map((h) => h.war && h.war.season).filter(Boolean))];
    return { name, appearances: hist, heroes: [...heroes.values()].sort((a, b) => b.seen - a.seen), builds: builds.reverse(), wins, losses, seasons };
  }

  /**
   * Match a name read from the screen (OCR, may have small mistakes) to a known
   * player. Returns the best name or null. Allows ~1 mistake per 4 letters.
   */
  function matchPlayer(text, names) {
    const norm = (x) => String(x || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const q = norm(text);
    if (q.length < 2) return null;
    let best = null;
    for (const n of new Set(names)) {
      const k = norm(n);
      if (!k) continue;
      if (k === q) return n;
      const d = editDistance(q, k);
      const allowed = Math.max(1, Math.floor(k.length / 4));
      const contains = k.length >= 4 && (q.includes(k) || k.includes(q)) && Math.min(q.length, k.length) / Math.max(q.length, k.length) >= 0.6;
      if ((d <= allowed || contains) && (!best || d < best.d)) best = { n, d };
    }
    return best ? best.n : null;
  }
  function editDistance(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[a.length][b.length];
  }

  /** A fresh random id / guild code. */
  function newId(len = 12) {
    const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    let s = '';
    const rnd = typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(len)) : Array.from({ length: len }, () => Math.floor(Math.random() * 2 ** 32));
    for (let i = 0; i < len; i++) s += abc[rnd[i] % abc.length];
    return s;
  }

  const api = { matchPlayer, editDistance, LEVELS, PROVEN, isProven, recordVs, enemySpeeds, teamVerdict, gearCheck, targetVerdict, playerProfile, DEFAULT_RULES, teamKey, playerKey, buildState, targetStatus, attacksUsed, warSummary, counterBook, suggestCounters, assignmentIdeas, enemyHistory, memberStats, threatHeroes, newId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RTAGuildWar = api;
})(typeof window !== 'undefined' ? window : globalThis);
