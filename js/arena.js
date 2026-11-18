/*
 * Arena (the game's regular arena: fights against other players' DEFENSE teams), DEVLOG #71. Pure (Node + browser).
 * Browser: window.E7Arena. The game watcher reads the opponents list, the team set-up screen and the result
 * (js/vision/readers/arena.js); the Arena page (js/arena-app.js) logs fights and shows your record per defense.
 *
 *   points(text)                      -> number | null   ("5,036 pts." -> 5036)
 *   delta(text, up)                   -> number | null   ("10" with the green up arrow -> +10)
 *   resultWord(text)                  -> 'win' | 'loss' | null (VICTORY / DEFEAT, tolerant)
 *   defenseKey(codes)                 -> the same key for the same four heroes in any order
 *   addFight(fights, f, now)          -> new list (newest first; the same result twice within 2 minutes is one fight)
 *   record(fights, defense)           -> { wins, losses, teams: [{ team, wins, losses }] } vs these four heroes
 *   heroRecord(fights)                -> Map(code -> { wins, losses }) against defenses with that hero
 *   advise(opponent, fights)          -> { exact, known, score, text } how you did against this defense / its heroes
 */
(function (root) {
  'use strict';
  function points(text) {
    const m = String(text || '').replace(/[oO]/g, '0').match(/(\d[\d,.\s]{0,7}\d|\d)/);
    if (!m) return null;
    const n = parseInt(m[1].replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  }
  function delta(text, up) {
    const n = points(text);
    if (n === null) return null;
    return up === false ? -n : n;
  }
  function resultWord(text) {
    const t = String(text || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (/VIC|TORY|ICTO/.test(t)) return 'win';
    if (/DEF|FEAT|EFEA/.test(t)) return 'loss';
    return null;
  }
  const defenseKey = (codes) => (codes || []).filter(Boolean).slice().sort().join('+');

  function addFight(fights, f, now = Date.now()) {
    const list = (fights || []).slice();
    const at = f.at || now;
    const dup = list.find((x) => x.opponent === f.opponent && x.result === f.result && x.points === f.points && Math.abs((x.at || 0) - at) < 120000);
    if (dup) return list;
    list.unshift({ ...f, at });
    return list.slice(0, 2000);
  }
  function record(fights, defense) {
    const key = defenseKey(defense);
    const out = { wins: 0, losses: 0, teams: [] };
    if (!key) return out;
    const teams = new Map();
    for (const f of fights || []) {
      if (f.fun || defenseKey(f.defense) !== key) continue;
      const win = f.result === 'win';
      if (win) out.wins++;
      else out.losses++;
      const tk = defenseKey(f.mine);
      if (!tk) continue;
      const t = teams.get(tk) || { team: (f.mine || []).filter(Boolean), wins: 0, losses: 0 };
      if (win) t.wins++;
      else t.losses++;
      teams.set(tk, t);
    }
    out.teams = [...teams.values()].sort((a, b) => b.wins - b.losses - (a.wins - a.losses) || b.wins - a.wins);
    return out;
  }
  function heroRecord(fights) {
    const m = new Map();
    for (const f of fights || []) {
      if (f.fun) continue;
      for (const c of new Set((f.defense || []).filter(Boolean))) {
        const r = m.get(c) || { wins: 0, losses: 0 };
        if (f.result === 'win') r.wins++;
        else r.losses++;
        m.set(c, r);
      }
    }
    return m;
  }
  /**
   * How you did against this opponent's defense: the very same four heroes ("exact"), else the average of your win
   * rate against defenses with each of its heroes ("known" = how many of its heroes you have fought). score 0..1 or
   * null when nothing is known.
   */
  function advise(opponent, fights) {
    const def = (opponent && opponent.heroes) || [];
    const exact = record(fights, def);
    if (exact.wins + exact.losses > 0) {
      const score = exact.wins / (exact.wins + exact.losses);
      return { exact, known: def.filter(Boolean).length, score, text: `${exact.wins}–${exact.losses} against this defense` };
    }
    const hr = heroRecord(fights);
    const rates = def.filter(Boolean).map((c) => hr.get(c)).filter((r) => r && r.wins + r.losses > 0);
    if (!rates.length) return { exact, known: 0, score: null, text: 'not fought yet' };
    const score = rates.reduce((s, r) => s + r.wins / (r.wins + r.losses), 0) / rates.length;
    return { exact, known: rates.length, score, text: `${Math.round(score * 100)}% against defenses with ${rates.length} of these heroes` };
  }

  const api = { points, delta, resultWord, defenseKey, addFight, record, heroRecord, advise };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7Arena = api;
})(typeof self !== 'undefined' ? self : this);
