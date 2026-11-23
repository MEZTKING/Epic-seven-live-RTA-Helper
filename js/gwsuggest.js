/*
 * Guild War: what to attack a defense with, from YOUR heroes (DEVLOG #104). Pure (Node + browser). Browser:
 * window.E7GWSuggest. Used when the guild's own records (js/guildwar.js suggestCounters: what worked before) have
 * nothing for a team, and next to them when they do.
 *
 * Two sources, each named on every reason:
 *   'top players'      the top-player model (js/topmodel.js Model, fitted on World Arena games on this PC): each hero's
 *                      own strength, pairs on one team, each hero against each enemy hero. World Arena is 5 v 5 with
 *                      bans, Guild War 3 v 3: the same heroes and matchups, so a guide, not a promise.
 *   'E7DaT knowledge'  hero mechanics (js/knowledge.js): who shuts down whom (immunity vs debuffs, …).
 *
 *   'guild records'    (DEVLOG #106) how the hero did in the guild's own Guild War attacks (gwRecord: Map code -> { wins, games })
 *   'battle records'   (DEVLOG #107) the same from every Guild War battle read on this PC (js/gwbattles.js), any guild's
 *   'my notes'         (DEVLOG #106) the owner's 👍 / 👎 on the hero for Guild War (mine: { code: 1 | -1 })
 *   heroScore(code, defense, { model, know, gwRecord, mine })  -> { score, reasons: [{ text, source, v }] }
 *   suggest(defense, pool, { model, know, top, exclude, nameOf, roleOf })
 *        -> [{ team: [3 codes], score, reasons }]  the best teams of 3 from `pool` (not using `exclude`); with roleOf
 *           (hero code -> class) every team has a damage dealer (warrior / thief / ranger / mage), DEVLOG #105
 *   suggestBoth(defenses: [team1, team2], pool, opts)
 *        -> { teams: [{ team, score, reasons } | null, …], basis }  one team per defense team, no hero twice (the game
 *           doesn't let one hero attack in both)
 */
(function (root) {
  'use strict';
  const W_KNOW = 0.12; // a knowledge note (0.6-1.0) worth about as much as a clear matchup in the model (0.07-0.12)
  const W_BASE = 0.5; // the hero's own strength counts, but less than the matchups against THIS defense
  const CANDIDATES = 12; // heroes combined into teams (12 → 220 teams)

  // Guild War is 3 heroes, no bans, two teams: some heroes are much better or worse there than in World Arena (the
  // owner, DEVLOG #106). So, from Guild War itself: the guild's own attacks with the hero ('guild records'), and the
  // owner's own word on the hero for Guild War ('my notes'), which weighs most.
  const W_GW = 0.8; // (smoothed win rate − 0.5) × this: a hero that wins 9 of 10 ≈ +0.27
  const W_MINE = 0.35; // 👍 / 👎 for Guild War
  function heroScore(code, defense, { model = null, know = null, nameOf = (c) => c, gwRecord = null, battleRecord = null, mine = null } = {}) {
    const reasons = [];
    let score = 0;
    const foes = (defense || []).filter(Boolean);
    // the guild's own attacks, and every other Guild War battle read on this PC (DEVLOG #107)
    for (const [recs, source, what] of [[gwRecord, 'guild records', 'Guild War attacks'], [battleRecord, 'battle records', 'attacks in battles read']]) {
      const rec = recs && recs.get(code);
      if (!rec || rec.games < 2) continue;
      const v = W_GW * ((rec.wins + 1) / (rec.games + 2) - 0.5);
      score += v;
      reasons.push({ text: `won ${rec.wins} of ${rec.games} ${what}`, source, v });
    }
    const my = mine && mine[code];
    if (my) {
      const v = my > 0 ? W_MINE : -W_MINE * 1.5;
      score += v;
      reasons.push({ text: my > 0 ? 'good in Guild War' : 'not good in Guild War', source: 'my notes', v });
    }
    if (model) {
      const base = (model.hero ? model.hero(code) : 0) || 0;
      score += W_BASE * base;
      for (const e of foes) {
        const v = model.ctrOf(code, e) || 0;
        score += v;
        if (Math.abs(v) >= 0.04) {
          const pp = model.pp ? model.pp(v) : Math.round(v * 250) / 10;
          reasons.push({ text: `${v > 0 ? 'good' : 'weak'} vs ${nameOf(e)} (${v > 0 ? '+' : ''}${pp} pp)`, source: 'top players', v });
        }
      }
    }
    if (know) {
      const n = know.notesFor(code, [], foes.map((c) => ({ code: c, name: nameOf(c) })));
      score += W_KNOW * n.score;
      for (const g of n.good) reasons.push({ text: g.text, source: 'E7DaT knowledge', v: W_KNOW * g.value });
      for (const b of n.bad) reasons.push({ text: b.text, source: 'E7DaT knowledge', v: W_KNOW * b.value });
    }
    reasons.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
    return { score, reasons };
  }

  // a team has to be able to kill (DEVLOG #105: "the second team has no dps": a knight and two soul weavers): at least
  // one damage dealer by class; the candidates always include the best few of them
  const DAMAGE = new Set(['warrior', 'assassin', 'ranger', 'mage']);
  function suggest(defense, pool, { model = null, know = null, top = 3, exclude = new Set(), nameOf = (c) => c, roleOf = null, gwRecord = null, battleRecord = null, mine = null } = {}) {
    const foes = (defense || []).filter(Boolean);
    if (foes.length < 2 || (!model && !know && !(gwRecord && gwRecord.size) && !(battleRecord && battleRecord.size) && !(mine && Object.keys(mine).length))) return [];
    const all = [...new Set(pool || [])]
      .filter((c) => !exclude.has(c) && !foes.includes(c))
      .map((c) => ({ c, ...heroScore(c, foes, { model, know, nameOf, gwRecord, battleRecord, mine }) }))
      .sort((a, b) => b.score - a.score);
    const isDps = (c) => !roleOf || !roleOf(c) || DAMAGE.has(roleOf(c));
    const scored = all.slice(0, CANDIDATES);
    for (const x of all.filter((y) => isDps(y.c) && !scored.includes(y)).slice(0, 4)) scored.push(x);
    if (scored.length < 3) return [];
    const out = [];
    for (let i = 0; i < scored.length; i++)
      for (let j = i + 1; j < scored.length; j++)
        for (let k = j + 1; k < scored.length; k++) {
          const t = [scored[i], scored[j], scored[k]];
          if (roleOf && !t.some((x) => isDps(x.c))) continue; // nobody to deal the damage
          let syn = 0;
          const pairs = [];
          if (model && model.synOf)
            for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) {
              const v = model.synOf(t[a].c, t[b].c) || 0;
              syn += v;
              if (v >= 0.04) pairs.push({ text: `${nameOf(t[a].c)} + ${nameOf(t[b].c)} work well together`, source: 'top players', v });
            }
          out.push({ team: t.map((x) => x.c), score: t.reduce((s, x) => s + x.score, 0) + syn, reasons: [...pairs, ...t.flatMap((x) => x.reasons.slice(0, 2).map((r) => ({ ...r, hero: x.c })))] });
        }
    out.sort((a, b) => b.score - a.score);
    // different teams, not the same two heroes with a third swapped each time
    const picked = [];
    for (const t of out) {
      if (picked.length >= top) break;
      if (picked.some((p) => p.team.filter((c) => t.team.includes(c)).length >= 2)) continue;
      picked.push(t);
    }
    return picked;
  }

  function suggestBoth(defenses, pool, opts = {}) {
    const [d1, d2] = defenses || [];
    const a = d1 ? suggest(d1, pool, { ...opts, top: 6 }) : [];
    const b = d2 ? suggest(d2, pool, { ...opts, top: 6 }) : [];
    let best = null;
    // the best pair with no hero twice (when one defense team is unknown: the other alone)
    for (const x of a.length ? a : [null])
      for (const y of b.length ? b : [null]) {
        if (x && y && x.team.some((c) => y.team.includes(c))) continue;
        const s = (x ? x.score : 0) + (y ? y.score : 0);
        if (!best || s > best.s) best = { s, teams: [x, y] };
      }
    // nothing disjoint among the top: the second team from what the first leaves
    if (best && a.length && b.length && (!best.teams[0] || !best.teams[1])) {
      const first = a[0];
      const second = suggest(d2, pool, { ...opts, top: 1, exclude: new Set([...(opts.exclude || []), ...first.team]) })[0] || null;
      best = { s: 0, teams: [first, second] };
    }
    const basis = [opts.gwRecord && opts.gwRecord.size && 'guild records', opts.battleRecord && opts.battleRecord.size && 'battle records', opts.mine && Object.keys(opts.mine).length && 'my notes', opts.model && 'top players', opts.know && 'E7DaT knowledge'].filter(Boolean);
    return { teams: best ? best.teams : [null, null], basis };
  }

  const api = { heroScore, suggest, suggestBoth, W_KNOW, W_BASE, W_GW, W_MINE, DAMAGE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7GWSuggest = api;
})(typeof self !== 'undefined' ? self : this);
