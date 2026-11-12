/*
 * Guild War logic (Epic Seven). Pure (no DOM, no network).
 * Browser: window.RTAGuildWar. Node: require().
 *
 * All guild data is a flat list of RECORDS shared between guildmates (see
 * js/sync.js). Every record has { id, type, updatedAt, updatedBy } plus:
 *
 *   member   { name, roster?: [codes], defense?: [{ heroes: [codes] }, { heroes }] }
 *   war      { enemyGuild, startedAt, status: 'active'|'done', notes }
 *   target   { warId, player, tower, teams: [{ heroes: [3 codes], speeds: {code: n}, sets: {code: 'Speed+Crit'},
 *              artifacts: {code: name}, notes }, {...}], assignedTo?: memberName, notes }
 *   attack   { warId, targetId, by: memberName, team: 1|2, heroes: [my 3 codes], result: 'win'|'loss', notes, at }
 *   defense  { warId?, member: memberName, team: 1|2, attacker?: enemyName, attackerHeroes?: [codes], result: 'held'|'lost', at }
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
      const row = book.get(dk).get(ak) || { attack: ak.split('+'), defense: dk.split('+'), wins: 0, games: 0, by: new Set() };
      row.games++;
      if (a.result === 'win') row.wins++;
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
      for (const r of list) if (r.wins > 0) rows.push({ attack: r.attack, wins: r.wins, games: r.games, exact, by: [...r.by] });
    }
    const merged = new Map();
    for (const r of rows) {
      const k = teamKey(r.attack) + (r.exact ? '|x' : '|s');
      const m = merged.get(k);
      if (m) {
        m.wins += r.wins;
        m.games += r.games;
        for (const b of r.by) if (!m.by.includes(b)) m.by.push(b);
      } else merged.set(k, { ...r, by: [...r.by] });
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

  /** A fresh random id / guild code. */
  function newId(len = 12) {
    const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    let s = '';
    const rnd = typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(len)) : Array.from({ length: len }, () => Math.floor(Math.random() * 2 ** 32));
    for (let i = 0; i < len; i++) s += abc[rnd[i] % abc.length];
    return s;
  }

  const api = { DEFAULT_RULES, teamKey, playerKey, buildState, targetStatus, attacksUsed, warSummary, counterBook, suggestCounters, assignmentIdeas, enemyHistory, memberStats, threatHeroes, newId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RTAGuildWar = api;
})(typeof window !== 'undefined' ? window : globalThis);
