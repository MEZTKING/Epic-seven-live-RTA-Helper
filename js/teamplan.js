/*
 * Whole-team plans (DEVLOG #52): instead of "what does this one pick add", look ahead over ALL of my remaining slots,
 * build every team the candidates allow, and say what to pick now and what to follow it with.
 * Pure, no DOM: browser global `E7TeamPlan` and Node (tests). Needs an E7TopModel.Engine (js/topmodel.js).
 *
 * A port of the core of E7DaT's plan.py (ohrgon-game, MIT; docs/E7DAT_NOTES.md):
 *   1. candidates per remaining slot (the engine's ranking for that slot: pick share of top players × model gain)
 *   2. every team from them (at most N_MAX; far slots are trimmed first)
 *   3. a hero planned for a LATER slot counts only by the chance it is still free then (the enemy's picks in between,
 *      from the pick policy); a hero picked early pays for the counters the enemy can still bring
 *   4. the value of a pick now = the mean of the best few teams that start with it − the value of leaving it open;
 *      rank = top players' pick share × e^(weight × scale × value)   (same formula as for single picks)
 *   5. two plans: the best one, and the best one that is clearly different (another pick now, other heroes after it)
 * Shown number ("show", log-odds): how much better than the usual pick of top players, deliberately damped
 * (RHO_SHOW): the best-looking option always contains some luck. E7DaT measured that about a third of the model's
 * difference holds up.
 * Not ported: the ban forecast inside the plan (E7DaT has it switched off: it made plans worse), similar-team
 * records, heroes that need a specific ally, following a plan the user picked, deny.
 *
 *   search(engine, { own: [5], enemy: [5], taken: [], meFirst, pool: Set | null }) -> null | {
 *     now: [slots], later: [slots], n (teams looked at), mineOnly,
 *     choices: [{ codes: [now heroes], pol, pp, show, score }],
 *     plans:   [{ kind: 'best' | 'alt', codes, team: [5 codes by slot], later: [{ slot, code, avail, alts: [codes] }], pp, wr }] }
 */
(function (root) {
  'use strict';
  // who picks which slots in which turn (first-pick side: 1, 2, 2; second: 2, 2, 1)
  const TURN_SLOTS = [null, ['first', [0]], ['second', [0, 1]], ['first', [1, 2]], ['second', [2, 3]], ['first', [3, 4]], ['second', [4]]];
  const K_NOW = 10; // candidates per slot picked now
  const K_SWAP = 4; // in a two-pick turn each slot also tries the other slot's best (who goes into the unbannable slot)
  const K_LATER = 8; // candidates per later slot
  const MIN_SUPPORT = 0.004; // heroes top players pick in less than this share of drafts in that slot are left out
  const TOP_MEAN = 3; // a pick's value = the mean of this many best teams after it (one alone chases luck)
  const N_MAX = 120000;
  const RHO_SHOW = 0.035;

  const topMean = (sorted) => (sorted.length ? sorted.slice(0, TOP_MEAN).reduce((s, v) => s + v, 0) / Math.min(TOP_MEAN, sorted.length) : null);

  function search(engine, opts) {
    const m = engine.model;
    const own = [0, 1, 2, 3, 4].map((i) => (opts.own || [])[i] || null);
    const enemy = [0, 1, 2, 3, 4].map((i) => (opts.enemy || [])[i] || null);
    const meFirst = !!opts.meFirst;
    const role = meFirst ? 'first' : 'second';
    const mineG = [];
    const enG = [];
    for (let t = 1; t <= 6; t++) {
      const [r, ss] = TURN_SLOTS[t];
      const picks = r === role ? own : enemy;
      const free = ss.filter((i) => !picks[i]);
      if (free.length) (r === role ? mineG : enG).push([t, free]);
    }
    if (!mineG.length) return null;
    const [tNow, now] = mineG[0];
    const slots = mineG.flatMap(([, ss]) => ss);
    const k = slots.length;
    const kNow = now.length;
    const turnOf = {};
    for (const [t, ss] of mineG) for (const s of ss) turnOf[s] = t;
    const mineC = own.filter(Boolean);
    const enC = enemy.filter(Boolean);
    const taken = [...(opts.taken || [])];
    const gone = new Set([...taken, ...mineC, ...enC]);
    const enBefore = {};
    const enAfter = {};
    for (const s of slots) {
      enBefore[s] = enG.filter(([t]) => t < turnOf[s]).flatMap(([, ss]) => ss);
      enAfter[s] = enG.filter(([t]) => t > turnOf[s]).reduce((n, [, ss]) => n + ss.length, 0);
    }
    // the engine's numbers per slot (policy and risk depend on the slot)
    const rowsOf = {};
    for (const s of slots) rowsOf[s] = engine.rows(mineC, enC, taken, meFirst, s, enAfter[s]).rows;
    const any = rowsOf[slots[0]];
    if (!any.size) return null;
    const pool = opts.pool && opts.pool.size ? opts.pool : null;
    const mineOnly = !!pool && [...any.keys()].filter((c) => pool.has(c)).length >= k;
    const owned = (c) => !mineOnly || pool.has(c);
    const best = (s, n) => {
      const src = [...rowsOf[s].values()].filter((r) => owned(r.code));
      let good = src.filter((r) => r.pol === null || r.pol >= MIN_SUPPORT);
      if (good.length < Math.min(n, 3)) good = src;
      return good.sort((x, y) => y.score - x.score).slice(0, n).map((r) => r.code);
    };
    const lists = {};
    for (const s of slots) lists[s] = best(s, now.includes(s) ? K_NOW : K_LATER);
    if (kNow === 2) {
      const [a, b] = now;
      const la = [...lists[a]];
      const lb = [...lists[b]];
      lists[a] = [...la, ...lb.slice(0, K_SWAP).filter((c) => !la.includes(c))];
      lists[b] = [...lb, ...la.slice(0, K_SWAP).filter((c) => !lb.includes(c))];
    }
    for (const c of opts.also || []) for (const s of now) if (any.has(c) && !lists[s].includes(c)) lists[s].push(c);
    const size = () => slots.reduce((p, s) => p * (lists[s].length + (now.includes(s) ? 1 : 0)), 1);
    while (size() > N_MAX) {
      const far = slots.slice(kNow).filter((s) => lists[s].length > 3).sort((x, y) => lists[y].length - lists[x].length || turnOf[y] - turnOf[x])[0];
      if (far === undefined) break;
      lists[far].pop();
    }
    // all candidates (index 0 = "left open") and their numbers
    const U = [null];
    const pos = new Map();
    for (const s of slots) for (const c of lists[s]) if (!pos.has(c)) (pos.set(c, U.length), U.push(c));
    const n = U.length;
    const base = new Float64Array(n);
    const fixed = new Float64Array(n); // pairs with my heroes already picked + counters against the enemy's
    const S = new Float64Array(n * n);
    for (const [c, i] of pos) {
      base[i] = any.get(c).gain.base;
      for (const x of mineC) fixed[i] += m.synOf(c, x);
      for (const e of enC) fixed[i] += m.ctrOf(c, e);
      for (const [c2, i2] of pos) if (i2 > i) S[i * n + i2] = S[i2 * n + i] = m.synOf(c, c2);
    }
    // the chance a hero is still free when my later slot comes up
    const pe = {};
    for (const [, ss] of enG) {
      for (const x of ss) {
        const r = engine.policy.ok ? engine.policy.slot(!meFirst, x, enC, mineC) : null;
        pe[x] = r ? r.p : null;
      }
    }
    const av = [];
    const lin = []; // per slot and candidate: chance × (hero + fixed pairs − risk)
    slots.forEach((s, a) => {
      av.push(new Float64Array(n).fill(1));
      lin.push(new Float64Array(n));
      for (const [c, i] of pos) {
        let p = 1;
        const pi = engine.policy.idx.get(c);
        for (const x of enBefore[s]) if (pe[x] && pi !== undefined) p *= 1 - pe[x][pi];
        av[a][i] = p;
        const row = rowsOf[s].get(c);
        lin[a][i] = p * (base[i] + fixed[i] - (row && enAfter[s] ? row.risk : 0));
      }
    });
    // every team
    const idx = slots.map((s, a) => [...(a < kNow || !lists[s].length ? [0] : []), ...lists[s].map((c) => pos.get(c))]);
    const z0 = m.logit(mineC, enC, meFirst) - m.turnZ(mineC, enC);
    const grid = [];
    const V = [];
    const cur = new Int32Array(k);
    const walk = (a, z) => {
      if (a === k) {
        grid.push(Int32Array.from(cur));
        V.push(z);
        return;
      }
      for (const i of idx[a]) {
        if (i) {
          let dup = false;
          for (let b = 0; b < a; b++) if (cur[b] === i) dup = true;
          if (dup) continue;
        }
        cur[a] = i;
        let add = i ? lin[a][i] : 0;
        if (i) for (let b = 0; b < a; b++) if (cur[b]) add += av[a][i] * av[b][cur[b]] * S[i * n + cur[b]];
        walk(a + 1, z + add);
      }
    };
    walk(0, z0);
    const N = grid.length;
    if (!N) return null;
    // what to pick now: per choice the teams that start with it, best first
    const groups = new Map();
    const open = [];
    for (let r = 0; r < N; r++) {
      const g = grid[r];
      let empty = 0;
      for (let a = 0; a < kNow; a++) if (!g[a]) empty++;
      if (empty === kNow) open.push(V[r]);
      if (empty) continue;
      const key = kNow === 2 ? g[0] * n + g[1] : g[0];
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    open.sort((x, y) => y - x);
    const v0 = topMean(open) === null ? z0 : topMean(open);
    const gw = root.E7TopModel ? root.E7TopModel.GAIN_WEIGHT * m.tau : 10 * m.tau;
    const FLOOR = root.E7TopModel ? root.E7TopModel.POL_FLOOR : 1e-4;
    const polOf = (s, c) => {
      const r = rowsOf[s].get(c);
      return r ? r.pol : null;
    };
    const joint = kNow === 2 && engine.policy.ok ? engine.policy.pair(meFirst, now[0], now[1], mineC, enC).joint : null;
    const choices = [];
    for (const rowsIdx of groups.values()) {
      rowsIdx.sort((x, y) => V[y] - V[x]);
      const codes = [...grid[rowsIdx[0]].slice(0, kNow)].map((i) => U[i]);
      const vs = topMean(rowsIdx.slice(0, TOP_MEAN).map((r) => V[r]));
      let pol;
      let pRank;
      if (kNow === 2) {
        const pj = joint && joint.size ? joint.get(`${codes[0]}|${codes[1]}`) || 0 : null;
        const indep = (polOf(now[0], codes[0]) || 0) * (polOf(now[1], codes[1]) || 0);
        pol = pj;
        pRank = pj === null ? 1 : 0.7 * pj + 0.3 * indep + FLOOR * FLOOR;
      } else {
        pol = polOf(now[0], codes[0]);
        pRank = pol === null ? 1 : pol + FLOOR;
      }
      choices.push({ codes, v: vs, d: vs - v0, pol, score: pRank * Math.exp(gw * (vs - v0)), row: rowsIdx[0], seg: rowsIdx });
    }
    if (!choices.length) return null;
    choices.sort((x, y) => y.score - x.score);
    // the number to show: against the usual pick of top players (their pick shares as weights), damped
    const lg = choices.map((c) => Math.log(Math.max(c.score, 1e-300)));
    const wt = choices.map((c) => (c.pol === null ? 1 : c.pol) + FLOOR);
    const ref = lg.reduce((s, v, i) => s + v * wt[i], 0) / wt.reduce((s, v) => s + v, 0);
    choices.forEach((c, i) => {
      c.show = RHO_SHOW * (lg[i] - ref);
      c.pp = m.pp(c.show / (m.tau || 1)); // show is already in "real" log-odds: undo the display scale inside pp()
    });

    /** A choice's team `row` as a plan: the five heroes by slot, and for each later slot how safe it is + stand-ins. */
    const plan = (ch, row, kind, show) => {
      const g = grid[row];
      const team = [...own];
      slots.forEach((s, a) => (team[s] = U[g[a]] || null));
      const later = [];
      for (let a = kNow; a < k; a++) {
        const alts = [];
        for (const r of ch.seg) {
          const q = grid[r];
          if (q[a] === g[a]) continue;
          let same = true;
          for (let b = kNow; b < k; b++) if (b !== a && q[b] !== g[b]) same = false;
          if (same && !alts.includes(U[q[a]])) alts.push(U[q[a]]);
          if (alts.length >= 2) break;
        }
        later.push({ slot: slots[a], code: U[g[a]], avail: av[a][g[a]], alts });
      }
      return { kind, codes: ch.codes, team, later, show, pp: m.pp(show / (m.tau || 1)), wr: m.wr(V[row]), pol: ch.pol };
    };
    const plans = [plan(choices[0], choices[0].row, 'best', choices[0].show)];
    // a clearly different plan: first another pick now with more than half of the open slots different, then looser
    const a0 = choices[0];
    const baseSet = new Set([...grid[a0.row]].filter(Boolean));
    const nowKey = (c) => [...c.codes].sort().join('|');
    const need = k >= 3 ? Math.floor((k + 1) / 2) : 1;
    let alt = null;
    for (const sameNow of [false, true]) {
      for (const nd of [...new Set([need, 1])]) {
        let bestAlt = null;
        for (const ch of choices) {
          if ((nowKey(ch) === nowKey(a0)) !== sameNow) continue;
          const r = ch.seg.find((x) => [...grid[x]].filter((i) => i && !baseSet.has(i)).length >= nd);
          if (r === undefined) continue;
          const drop = Math.min(0, V[r] - ch.v);
          const sc = Math.log(Math.max(ch.score, 1e-300)) + gw * drop;
          if (!bestAlt || sc > bestAlt.sc) bestAlt = { sc, ch, r, drop };
        }
        if (bestAlt) {
          alt = plan(bestAlt.ch, bestAlt.r, 'alt', bestAlt.ch.show + RHO_SHOW * gw * bestAlt.drop);
          break;
        }
      }
      if (alt) break;
    }
    if (alt) plans.push(alt);
    return {
      now: [...now], later: slots.slice(kNow), turn: tNow, n: N, mineOnly, v0,
      choices: choices.slice(0, 12).map((c) => ({ codes: c.codes, pol: c.pol, show: c.show, pp: c.pp, score: c.score })),
      plans,
    };
  }

  const api = { search, TURN_SLOTS, RHO_SHOW };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7TeamPlan = api;
})(typeof self !== 'undefined' ? self : this);
