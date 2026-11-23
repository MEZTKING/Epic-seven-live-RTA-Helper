/*
 * Guild War battle records (DEVLOG #107). Pure (Node + browser). Browser: window.E7GWBattles.
 * Every battle window the game watcher reads (a row of anybody's Season Log: js/vision/readers/guild-result.js) is a
 * real Guild War fight, also between two players of other guilds: whose attack teams beat whose defense teams. Until
 * now only fights of our own guild were used; these records keep all of them (source 'battle records', on this PC).
 *
 *   fromResult(d, at)      -> { key, at, attacker, defender, rounds: [{ attack: [codes], defense: [codes], win }] } | null
 *                             d = guild:result { type: 'attack' | 'defense', left, right, rounds: [{ result, left, right }] };
 *                             a round counts when both teams have at least 2 heroes recognised for sure; a draw is not a
 *                             win for the attacker (the tower stands)
 *   add(list, battle, max) -> the list with it (the same battle read again: once), newest first, at most `max`
 *   book(list)             -> Map defenseKey -> [{ attack, defense, wins, games }] (the shape of js/guildwar.js counterBook)
 *   heroRecord(list)       -> Map code -> { wins, games } as an attacker
 *   suggest(defense, list, { limit }) -> [{ attack, wins, games, exact }] attack teams that beat this defense (or one
 *                             sharing 2 of its 3 heroes), best first
 */
(function (root) {
  'use strict';
  const MAX = 3000;
  const sureCodes = (icons) => (icons || []).filter((x) => x && x.sure && x.code).map((x) => x.code);
  const teamKey = (codes) => [...codes].sort().join('+');

  function fromResult(d, at = new Date().toISOString()) {
    if (!d || !Array.isArray(d.rounds) || !d.left || !d.right) return null;
    const leftAttacks = d.type === 'attack';
    const rounds = [];
    for (const r of d.rounds) {
      const L = sureCodes(r.left);
      const Rr = sureCodes(r.right);
      if (L.length < 2 || Rr.length < 2 || !r.result) continue;
      const attack = leftAttacks ? L : Rr;
      const defense = leftAttacks ? Rr : L;
      // the result is the left player's: their victory is the attacker's when they attack
      const leftWon = r.result === 'victory';
      const win = r.result === 'draw' ? false : leftAttacks ? leftWon : !leftWon;
      rounds.push({ attack, defense, win });
    }
    if (!rounds.length) return null;
    const attacker = (leftAttacks ? d.left : d.right).name || '';
    const defender = (leftAttacks ? d.right : d.left).name || '';
    const key = `${attacker}|${defender}|${rounds.map((r) => `${teamKey(r.attack)}>${teamKey(r.defense)}:${r.win ? 1 : 0}`).join('|')}`;
    return { key, at, attacker, defender, rounds };
  }

  function add(list, battle, max = MAX) {
    if (!battle) return list || [];
    const out = (list || []).filter((b) => b.key !== battle.key);
    out.unshift(battle);
    return out.slice(0, max);
  }

  function book(list) {
    const m = new Map();
    for (const b of list || [])
      for (const r of b.rounds) {
        const dk = teamKey(r.defense);
        const ak = teamKey(r.attack);
        if (!m.has(dk)) m.set(dk, new Map());
        const row = m.get(dk).get(ak) || { attack: ak.split('+'), defense: dk.split('+'), wins: 0, games: 0 };
        row.games++;
        if (r.win) row.wins++;
        m.get(dk).set(ak, row);
      }
    const out = new Map();
    for (const [dk, rows] of m) out.set(dk, [...rows.values()].sort((a, b) => b.wins - a.wins || a.games - b.games));
    return out;
  }

  function heroRecord(list) {
    const m = new Map();
    for (const b of list || [])
      for (const r of b.rounds)
        for (const c of new Set(r.attack)) {
          const x = m.get(c) || { wins: 0, games: 0 };
          x.games++;
          if (r.win) x.wins++;
          m.set(c, x);
        }
    return m;
  }

  function suggest(defense, list, { limit = 3 } = {}) {
    const d = (defense || []).filter(Boolean);
    if (d.length < 2) return [];
    const bk = book(list);
    const rows = [];
    for (const [dk, rs] of bk) {
      const def = dk.split('+');
      const shared = def.filter((c) => d.includes(c)).length;
      const exact = shared === d.length && def.length === d.length;
      if (!exact && shared < 2) continue;
      for (const r of rs) if (r.wins > 0) rows.push({ attack: r.attack, wins: r.wins, games: r.games, exact });
    }
    // the same attack against similar defenses: added up
    const byAttack = new Map();
    for (const r of rows) {
      const k = teamKey(r.attack);
      const x = byAttack.get(k) || { attack: r.attack, wins: 0, games: 0, exact: false };
      x.wins += r.wins;
      x.games += r.games;
      x.exact = x.exact || r.exact;
      byAttack.set(k, x);
    }
    return [...byAttack.values()].sort((a, b) => Number(b.exact) - Number(a.exact) || b.wins / b.games - a.wins / a.games || b.wins - a.wins).slice(0, limit);
  }

  const api = { MAX, fromResult, add, book, heroRecord, suggest, teamKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7GWBattles = api;
})(typeof self !== 'undefined' ? self : this);
