/*
 * Win-rate model, pick policy and ban / pre-ban advice from top players' games (DEVLOG #45).
 * Pure functions, no DOM, no network: browser global `E7TopModel` and Node (tests).
 *
 * A port of the statistical core of E7DaT (ohrgon-game, MIT; study notes in docs/E7DAT_NOTES.md):
 *   stats.py     -> build()   which games count and how much, the fit, pair / counter / side tables, a self-check
 *   model.py     -> Model     a draft position -> log-odds -> expected win rate
 *   policy.py    -> Policy    "what did top players pick at this spot in a similar draft"
 *   recommend.py -> Engine    candidate numbers, pre-bans, final ban
 * Not ported (see docs/ROADMAP.md): the turn-order model, the ban-forecast model, similar-team bundles, heroes that
 * need a specific ally, the team planner. Changed on purpose: recency weighting (see DEFAULTS).
 *
 * Input rows are E7Records.parseBattle() rows:
 *   { seq, day, season, rule, aGrade, bGrade, aFirst (true / false / null), aWin, aNick, aWorld, bNick, bWorld,
 *     a: { picks[5] in pick order, ban, prebans, energy {code: start CR} }, b: { … } }
 *
 * The model, in log-odds (A = the player whose list the game came from):
 *   z = const + first-pick bias + skill[A] − skill[B] + Σ hero[A's 4 played] − Σ hero[B's 4]
 *       + pairs on the same team + counters across teams + hero-as-first-pick / second-pick effects (+ opening rule)
 * The skill terms keep "good players use it a lot" from looking like "the hero is strong". Pair / counter / side
 * effects are estimated from what the base model gets wrong (residuals) and pulled towards 0 when games are few.
 */
(function (root) {
  'use strict';

  const DEFAULTS = {
    gradeWeights: { legend: 1.0, emperor: 0.6 }, // a game weighs the product of both players' values; others dropped
    // E7DaT (updated daily) weighs the newest day 1.0 and everything older 0.2. This app is updated when the owner
    // presses a button, so the newest day is often a handful of games: two weeks at full weight, older at half.
    recentDays: 14,
    oldWeight: 0.5,
    maxAgeDays: 60,
    seasonMinGames: 10000, // until the newest season has this many games, the season before is blended in
    minGames: 400, // below this no model is fitted (build() returns null)
  };
  const L2_HERO = 5.0;
  const L2_PLAYER = 5.0;
  const L2_GRADE = 0.5;
  const L2_BIAS = 0.05;
  const K_PAIR = 40.0;
  const K_SIDE = 20.0;
  const K_RULE = 20.0;
  const K_BAN = 10.0;
  const MIN_PAIR_N = 6.0;
  const MIN_PLAYER_GAMES = 12;
  const ROUNDS = 2;
  const DEFAULT_CALIB = 0.7;
  const TUNE_TEST = 1000;
  const L2_GRID = [2.5, 5.0, 10.0, 20.0, 40.0];
  const K_GRID = [5.0, 10.0, 20.0, 40.0, 80.0, 160.0, null]; // null = no pair / counter terms
  const FORMAT = 1;

  const sigmoid = (z) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
  const log1pexp = (z) => (z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z)));
  const round = (x, d) => {
    const m = 10 ** d;
    return Math.round(x * m) / m;
  };
  const seasonOf = (code) => (code && code.endsWith('f') && /\d/.test(code.slice(-2, -1)) ? code.slice(0, -1) : code || '');
  const dayMinus = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);
  const played = (side) => side.picks.filter((h) => h && h !== side.ban);

  // ---------------------------------------------------------------- which games, how much

  function seasonPlan(rows, cfg) {
    let last = null;
    for (const r of rows) if (r.season && (!last || r.day > last.day)) last = r;
    if (!last) return null;
    const code = seasonOf(last.season);
    const gw = cfg.gradeWeights;
    let n = 0;
    for (const r of rows) if (seasonOf(r.season) === code && (gw[r.aGrade] || 0) * (gw[r.bGrade] || 0) > 0) n++;
    const need = Math.max(0, cfg.seasonMinGames);
    return { code, games: n, need, blend: n >= need ? 0 : round(1 - n / need, 3) };
  }

  /** -> { rows: [{ r, w, recent }], info } */
  function select(rows, cfg, sp) {
    const gw = cfg.gradeWeights;
    const elig = [];
    let skippedGrade = 0;
    let skippedSeason = 0;
    for (const r of rows) {
      if (!r || !r.a || !r.b || r.a.picks.length !== 5 || r.b.picks.length !== 5) continue;
      let g = (gw[r.aGrade] || 0) * (gw[r.bGrade] || 0);
      if (g <= 0) {
        skippedGrade++;
        continue;
      }
      if (sp && seasonOf(r.season) !== sp.code) {
        g *= sp.blend;
        if (g <= 0) {
          skippedSeason++;
          continue;
        }
      }
      elig.push([r, g]);
    }
    if (!elig.length) return { rows: [], info: { latestDay: null, skippedGrade, skippedSeason } };
    let latest = '';
    for (const [r] of elig) if (r.day > latest) latest = r.day;
    const recentFrom = dayMinus(latest, Math.max(1, cfg.recentDays) - 1);
    const oldest = dayMinus(latest, cfg.maxAgeDays);
    const out = [];
    for (const [r, g] of elig) {
      if (r.day < oldest) continue;
      const recent = r.day >= recentFrom;
      const w = g * (recent ? 1 : cfg.oldWeight);
      if (w > 0) out.push({ r, w, recent });
    }
    return { rows: out, info: { latestDay: latest, recentFrom, skippedGrade, skippedSeason } };
  }

  // ---------------------------------------------------------------- the fit

  /** L-BFGS (two-loop recursion + backtracking line search) for a smooth convex f(x) -> { f, g }. */
  function lbfgs(f, x0, memory = 12, iters = 400, gtol = 1e-7) {
    const n = x0.length;
    let x = Float64Array.from(x0);
    let cur = f(x);
    let fx = cur.f;
    let g = cur.g;
    const S = [];
    const Y = [];
    const dot = (a, b) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += a[i] * b[i];
      return s;
    };
    const maxAbs = (a) => {
      let m = 0;
      for (let i = 0; i < n; i++) if (Math.abs(a[i]) > m) m = Math.abs(a[i]);
      return m;
    };
    for (let it = 0; it < iters; it++) {
      if (maxAbs(g) < gtol) break;
      const q = Float64Array.from(g);
      const alphas = [];
      for (let k = S.length - 1; k >= 0; k--) {
        const a = dot(S[k], q) / dot(Y[k], S[k]);
        alphas.push(a);
        for (let i = 0; i < n; i++) q[i] -= a * Y[k][i];
      }
      if (S.length) {
        const sc = dot(S[S.length - 1], Y[Y.length - 1]) / dot(Y[Y.length - 1], Y[Y.length - 1]);
        for (let i = 0; i < n; i++) q[i] *= sc;
      } else {
        const sc = Math.max(1, maxAbs(g));
        for (let i = 0; i < n; i++) q[i] /= sc;
      }
      for (let k = 0; k < S.length; k++) {
        const a = alphas[S.length - 1 - k];
        const b = dot(Y[k], q) / dot(Y[k], S[k]);
        for (let i = 0; i < n; i++) q[i] += (a - b) * S[k][i];
      }
      const d = new Float64Array(n);
      for (let i = 0; i < n; i++) d[i] = -q[i];
      let gd = dot(g, d);
      if (gd > -1e-14) {
        for (let i = 0; i < n; i++) d[i] = -g[i];
        gd = -dot(g, g);
      }
      let t = 1;
      let moved = false;
      let xn = null;
      let nx = null;
      while (t > 1e-10) {
        xn = new Float64Array(n);
        for (let i = 0; i < n; i++) xn[i] = x[i] + t * d[i];
        nx = f(xn);
        if (nx.f <= fx + 1e-4 * t * gd) {
          moved = true;
          break;
        }
        t *= 0.5;
      }
      if (!moved) break;
      const s = new Float64Array(n);
      const yv = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        s[i] = xn[i] - x[i];
        yv[i] = nx.g[i] - g[i];
      }
      if (dot(s, yv) > 1e-12) {
        S.push(s);
        Y.push(yv);
        if (S.length > memory) {
          S.shift();
          Y.shift();
        }
      }
      const done = Math.abs(fx - nx.f) <= 1e-10 * Math.max(1, Math.abs(fx));
      x = xn;
      fx = nx.f;
      g = nx.g;
      if (done) break;
    }
    return x;
  }

  const pkey = (nick, world) => `${world}:${nick}`;

  /**
   * Hero base effects + player skill + first-pick bias + constant (+ a popularity trend: "what top players pick a lot
   * is on average stronger", learned as ONE coefficient, so a rarely picked hero does not top the list on a few lucky
   * games). offset = the sum of the pair / counter / side terms already fixed.
   */
  function fit(rows, teams, l2Hero, offset, usePop) {
    const N = rows.length;
    const heroSet = new Set();
    for (const [ta, tb] of teams) {
      for (const h of ta) heroSet.add(h);
      for (const h of tb) heroSet.add(h);
    }
    const heroes = [...heroSet].sort();
    const hid = new Map(heroes.map((h, i) => [h, i]));
    const cnt = new Map();
    const gradeSet = new Set();
    for (const { r } of rows) {
      const ka = pkey(r.aNick, r.aWorld);
      const kb = pkey(r.bNick, r.bWorld);
      cnt.set(ka, (cnt.get(ka) || 0) + 1);
      cnt.set(kb, (cnt.get(kb) || 0) + 1);
      gradeSet.add(r.aGrade);
      gradeSet.add(r.bGrade);
    }
    const pid = new Map([...cnt.entries()].filter(([, n]) => n >= MIN_PLAYER_GAMES).map(([k]) => k).sort().map((k, i) => [k, i]));
    const gid = new Map([...gradeSet].sort().map((g, i) => [g, i]));
    const nH = heroes.length;
    const nP = pid.size;
    const nG = gid.size;
    const iF = nH + nP + nG;
    const iC = iF + 1;
    const iA = iF + 2;
    const pad = iF + 3;
    const M = pad + 1;
    const HA = new Int32Array(N * 5).fill(pad);
    const HB = new Int32Array(N * 5).fill(pad);
    const PA = new Int32Array(N);
    const PB = new Int32Array(N);
    const fp = new Float64Array(N);
    const y = new Float64Array(N);
    const w = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const { r, w: wt } = rows[i];
      const [ta, tb] = teams[i];
      for (let k = 0; k < ta.length && k < 5; k++) HA[i * 5 + k] = hid.get(ta[k]);
      for (let k = 0; k < tb.length && k < 5; k++) HB[i * 5 + k] = hid.get(tb[k]);
      const ka = pkey(r.aNick, r.aWorld);
      const kb = pkey(r.bNick, r.bWorld);
      PA[i] = pid.has(ka) ? nH + pid.get(ka) : nH + nP + gid.get(r.aGrade);
      PB[i] = pid.has(kb) ? nH + pid.get(kb) : nH + nP + gid.get(r.bGrade);
      if (r.aFirst !== null && r.aFirst !== undefined) fp[i] = r.aFirst ? 1 : -1;
      y[i] = r.aWin ? 1 : 0;
      w[i] = wt;
    }
    const off = offset || new Float64Array(N);
    const lam = new Float64Array(M);
    for (let i = 0; i < nH; i++) lam[i] = l2Hero;
    for (let i = nH; i < nH + nP; i++) lam[i] = L2_PLAYER;
    for (let i = nH + nP; i < iF; i++) lam[i] = L2_GRADE;
    lam[iF] = lam[iC] = lam[iA] = L2_BIAS;
    // log(share of appearances) per hero, centred on the appearance-weighted mean
    const cntH = new Float64Array(M);
    let wsum = 0;
    for (let i = 0; i < N; i++) {
      wsum += w[i];
      for (let k = 0; k < 5; k++) {
        cntH[HA[i * 5 + k]] += w[i];
        cntH[HB[i * 5 + k]] += w[i];
      }
    }
    const lp = new Float64Array(M);
    if (usePop && nH) {
      let num = 0;
      let den = 0;
      for (let h = 0; h < nH; h++) {
        lp[h] = Math.log(Math.max(cntH[h] / Math.max(wsum, 1e-9), 1e-4));
        num += lp[h] * cntH[h];
        den += cntH[h];
      }
      const mu = num / Math.max(den, 1e-9);
      for (let h = 0; h < nH; h++) lp[h] -= mu;
    }
    const pop = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = 0; k < 5; k++) s += lp[HA[i * 5 + k]] - lp[HB[i * 5 + k]];
      pop[i] = s;
    }
    const zOf = (th, i) => {
      let z = off[i] + th[PA[i]] - th[PB[i]] + fp[i] * th[iF] + th[iC] + pop[i] * th[iA];
      const o = i * 5;
      for (let k = 0; k < 5; k++) z += th[HA[o + k]] - th[HB[o + k]];
      return z;
    };
    const f = (th) => {
      const g = new Float64Array(M);
      let loss = 0;
      for (let i = 0; i < N; i++) {
        const z = Math.max(-30, Math.min(30, zOf(th, i)));
        const p = 1 / (1 + Math.exp(-z));
        loss += w[i] * (log1pexp(z) - y[i] * z);
        const res = w[i] * (p - y[i]);
        const o = i * 5;
        for (let k = 0; k < 5; k++) {
          g[HA[o + k]] += res;
          g[HB[o + k]] -= res;
        }
        g[PA[i]] += res;
        g[PB[i]] -= res;
        g[iF] += fp[i] * res;
        g[iC] += res;
        g[iA] += pop[i] * res;
      }
      for (let j = 0; j < M; j++) {
        loss += 0.5 * lam[j] * th[j] * th[j];
        g[j] += lam[j] * th[j];
      }
      g[pad] = 0;
      return { f: loss, g };
    };
    const th = lbfgs(f, new Float64Array(M));
    const p = new Float64Array(N);
    for (let i = 0; i < N; i++) p[i] = sigmoid(zOf(th, i));
    return { heroes, theta: th, nH, nP, iF, iC, p, y, popCoef: th[iA], lp };
  }

  const acc3 = (map, key) => {
    let a = map.get(key);
    if (!a) map.set(key, (a = [0, 0, 0]));
    return a;
  };
  const synKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  /** Per detail term: [weighted games, residual sum, information]. */
  function residualPass(rows, teams, p, y) {
    const syn = new Map();
    const ctr = new Map();
    const side = new Map();
    const rule = new Map();
    for (let i = 0; i < rows.length; i++) {
      const { r, w: wt } = rows[i];
      const [ta, tb] = teams[i];
      const res = wt * (y[i] - p[i]);
      const inf = wt * p[i] * (1 - p[i]);
      for (const [team, sg] of [[ta, 1], [tb, -1]]) {
        for (let x = 0; x < team.length; x++) {
          for (let z = x + 1; z < team.length; z++) {
            const a = acc3(syn, synKey(team[x], team[z]));
            a[0] += wt;
            a[1] += sg * res;
            a[2] += inf;
          }
        }
        if (r.rule) {
          for (const h of team) {
            const a = acc3(rule, `${r.rule}/${h}`);
            a[0] += wt;
            a[1] += sg * res;
            a[2] += inf;
          }
        }
      }
      for (const h of ta) {
        for (const g of tb) {
          if (h === g) continue;
          if (h < g) {
            const a = acc3(ctr, `${h}>${g}`);
            a[0] += wt;
            a[1] += res;
            a[2] += inf;
          } else {
            const a = acc3(ctr, `${g}>${h}`);
            a[0] += wt;
            a[1] -= res;
            a[2] += inf;
          }
        }
      }
      if (r.aFirst !== null && r.aFirst !== undefined) {
        const [fTeam, sTeam, sg] = r.aFirst ? [ta, tb, 1] : [tb, ta, -1];
        for (const h of fTeam) {
          const a = acc3(side, `${h}/f`);
          a[0] += wt;
          a[1] += sg * res;
          a[2] += inf;
        }
        for (const h of sTeam) {
          const a = acc3(side, `${h}/s`);
          a[0] += wt;
          a[1] -= sg * res;
          a[2] += inf;
        }
      }
    }
    return { syn, ctr, side, rule };
  }

  /** One update of the detail terms, each pulled towards 0. tables = { syn, ctr, side, rule } of Map(key -> value). */
  function step(tables, acc, kPair, damp = 1) {
    const kp = kPair === null ? 1e12 : kPair;
    const out = {};
    for (const [name, k, minN] of [['syn', kp, MIN_PAIR_N], ['ctr', kp, MIN_PAIR_N], ['side', K_SIDE, MIN_PAIR_N], ['rule', K_RULE, 2 * MIN_PAIR_N]]) {
      const old = tables[name] || new Map();
      const neu = new Map();
      for (const [key, [n, num, den]] of acc[name]) {
        if (n >= minN) {
          const d0 = old.get(key) || 0;
          neu.set(key, d0 + (damp * (num - k * d0)) / (den + k));
        }
      }
      out[name] = neu;
    }
    return out;
  }

  function offsets(rows, teams, t) {
    const off = new Float64Array(rows.length);
    for (let i = 0; i < rows.length; i++) {
      const { r } = rows[i];
      const [ta, tb] = teams[i];
      let z = 0;
      for (const [team, sg] of [[ta, 1], [tb, -1]]) {
        let s = 0;
        for (let x = 0; x < team.length; x++) for (let k = x + 1; k < team.length; k++) s += t.syn.get(synKey(team[x], team[k])) || 0;
        if (r.rule) for (const h of team) s += t.rule.get(`${r.rule}/${h}`) || 0;
        z += sg * s;
      }
      for (const h of ta) for (const g of tb) z += h < g ? t.ctr.get(`${h}>${g}`) || 0 : -(t.ctr.get(`${g}>${h}`) || 0);
      if (r.aFirst !== null && r.aFirst !== undefined) {
        const [fa, fb] = r.aFirst ? ['f', 's'] : ['s', 'f'];
        for (const h of ta) z += t.side.get(`${h}/${fa}`) || 0;
        for (const h of tb) z -= t.side.get(`${h}/${fb}`) || 0;
      }
      off[i] = z;
    }
    return off;
  }

  function estimate(rows, l2Hero, kPair, usePop) {
    const teams = rows.map(({ r }) => [played(r.a), played(r.b)]);
    let ft = fit(rows, teams, l2Hero, null, usePop);
    let acc = residualPass(rows, teams, ft.p, ft.y);
    let tables = step({}, acc, kPair);
    for (let k = 1; k < ROUNDS; k++) {
      ft = fit(rows, teams, l2Hero, offsets(rows, teams, tables), usePop);
      acc = residualPass(rows, teams, ft.p, ft.y);
      tables = step(tables, acc, kPair, 0.7);
    }
    return { teams, fit: ft, tables, acc };
  }

  /** The model part in its stored shape (hero base effects moved so that "an average, often picked hero" = 0). */
  function modelPart(rows, teams, ft, tables, acc) {
    const n = new Map();
    for (let i = 0; i < rows.length; i++) for (const h of [...teams[i][0], ...teams[i][1]]) n.set(h, (n.get(h) || 0) + rows[i].w);
    const beta = new Map(ft.heroes.map((h, i) => [h, ft.theta[i] + ft.popCoef * ft.lp[i]]));
    let tot = 0;
    let num = 0;
    for (const [h, b] of beta) {
      tot += n.get(h) || 0;
      num += b * (n.get(h) || 0);
    }
    const mu = tot ? num / tot : 0;
    const heroes = {};
    for (const [h, b] of beta) heroes[h] = { b: round(b - mu, 4), bf: round(tables.side.get(`${h}/f`) || 0, 4), bs: round(tables.side.get(`${h}/s`) || 0, 4) };
    const syn = {};
    for (const [k, d] of tables.syn) syn[k] = [round(acc.syn.get(k)[0], 2), round(d, 4)];
    const ctr = {};
    for (const [k, d] of tables.ctr) ctr[k] = [round(acc.ctr.get(k)[0], 2), round(d, 4)];
    const rule = {};
    for (const [k, d] of tables.rule) {
      const cut = k.lastIndexOf('/');
      (rule[k.slice(0, cut)] = rule[k.slice(0, cut)] || {})[k.slice(cut + 1)] = [round(acc.rule.get(k)[0], 2), round(d, 4)];
    }
    return { meta: { fpBias: round(ft.theta[ft.iF], 4), aBias: round(ft.theta[ft.iC], 4), skillPlayers: ft.nP, popCoef: round(ft.popCoef, 4) }, heroes, syn, ctr, rule };
  }

  /** P(A wins) = sigmoid(c + t·z): the (constant, scale) that fit the real results. -> { c, t, ll } */
  function calib(z, y) {
    let c = 0;
    let t = 0;
    const n = z.length;
    for (let it = 0; it < 30; it++) {
      let g0 = 0;
      let g1 = 0;
      let h00 = 1e-6;
      let h01 = 0;
      let h11 = 1e-6;
      for (let i = 0; i < n; i++) {
        const p = sigmoid(c + t * z[i]);
        const d = p - y[i];
        const v = p * (1 - p);
        g0 += d;
        g1 += d * z[i];
        h00 += v;
        h01 += v * z[i];
        h11 += v * z[i] * z[i];
      }
      const det = h00 * h11 - h01 * h01;
      if (!(Math.abs(det) > 1e-12)) break;
      const s0 = (h11 * g0 - h01 * g1) / det;
      const s1 = (h00 * g1 - h01 * g0) / det;
      c -= s0;
      t -= s1;
      if (Math.max(Math.abs(s0), Math.abs(s1)) < 1e-8) break;
    }
    let ll = 0;
    for (let i = 0; i < n; i++) {
      const p = Math.min(1 - 1e-9, Math.max(1e-9, sigmoid(c + t * z[i])));
      ll -= y[i] * Math.log(p) + (1 - y[i]) * Math.log(1 - p);
    }
    return { c, t, ll: n ? ll / n : 0 };
  }

  /**
   * Self-check: a model built WITHOUT the newest games predicts them. Picks how hard to pull hero and pair effects
   * towards 0 and the scale that makes predicted win rates match real ones. null when there are too few games.
   */
  function tune(all, cfg, rows, sp, opts = {}) {
    const days = new Map();
    for (const { r } of rows) days.set(r.day, (days.get(r.day) || 0) + 1);
    if (!days.size) return null;
    const want = rows.length >= TUNE_TEST + 300 ? TUNE_TEST : 100;
    const sorted = [...days.keys()].sort().reverse();
    let latest = sorted[0];
    let cut = null;
    let n = 0;
    for (const d of sorted) {
      n += days.get(d);
      cut = d;
      if (n >= want) break;
    }
    const testRows = select(all.filter((r) => r.day >= cut), cfg, sp).rows;
    const trainRows = select(all.filter((r) => r.day < cut), cfg, sp).rows;
    if (trainRows.length < 300 || testRows.length < 100) return null;
    if (cut !== latest) latest = `${cut}~${latest}`;
    const tests = testRows.map(({ r }) => [played(r.a), played(r.b), r.aFirst === null || r.aFirst === undefined ? null : !!r.aFirst, r.rule]);
    const yt = Float64Array.from(testRows, ({ r }) => (r.aWin ? 1 : 0));
    const zs = (part) => {
      const m = new Model(part);
      return Float64Array.from(tests, ([ta, tb, f, rule]) => m.logit(ta, tb, f, rule));
    };
    const teams = trainRows.map(({ r }) => [played(r.a), played(r.b)]);
    let best = null;
    const grid = opts.quick ? [L2_HERO] : L2_GRID;
    const kGrid = opts.quick ? [K_PAIR, null] : K_GRID;
    for (const usePop of opts.quick ? [true] : [true, false]) {
      for (const l2 of grid) {
        const ft = fit(trainRows, teams, l2, null, usePop);
        const acc = residualPass(trainRows, teams, ft.p, ft.y);
        for (const k of kGrid) {
          const ll = calib(zs(modelPart(trainRows, teams, ft, step({}, acc, k), acc)), yt).ll;
          if (!best || ll < best.ll - 1e-6) best = { ll, l2, k, usePop };
        }
      }
    }
    const e = estimate(trainRows, best.l2, best.k, best.usePop);
    const z = zs(modelPart(trainRows, e.teams, e.fit, e.tables, e.acc));
    const cal = calib(z, yt);
    const tau = Math.min(1.2, Math.max(0.2, cal.t));
    // what the app shows (equal skill assumed), folded onto the side it favours
    const edges = [0.5, 0.52, 0.54, 0.57, 0.6, 0.65, 1.01];
    const bins = edges.slice(0, -1).map((lo, i) => ({ from: lo, to: Math.min(edges[i + 1], 1), n: 0, predicted: 0, actual: 0 }));
    let right = 0;
    for (let i = 0; i < z.length; i++) {
      const pa = sigmoid(tau * z[i]);
      const pf = pa >= 0.5 ? pa : 1 - pa;
      const yf = pa >= 0.5 ? yt[i] : 1 - yt[i];
      right += yf;
      const b = bins.find((x) => pf >= x.from && pf < (x.to === 1 ? 1.01 : x.to));
      if (b) {
        b.n++;
        b.predicted += pf;
        b.actual += yf;
      }
    }
    for (const b of bins) {
      if (b.n) {
        b.predicted = round(b.predicted / b.n, 4);
        b.actual = round(b.actual / b.n, 4);
      }
    }
    return {
      l2Hero: best.l2, kPair: best.k, usePop: best.usePop, calib: round(tau, 3),
      backtest: { day: latest, n: testRows.length, trainGames: trainRows.length, accuracy: round(right / z.length, 4), logloss: round(cal.ll, 4), coinLogloss: 0.6931, trackedSideBias: round(cal.c, 3), bins: bins.filter((b) => b.n) },
    };
  }

  // ---------------------------------------------------------------- build

  /**
   * rows -> the stored statistics ("stats"), or null when there are fewer than cfg.minGames usable games.
   * opts: { ...DEFAULTS overrides, tune: false to skip the self-check, quick: true for a small search (tests) }
   */
  function build(allRows, opts = {}) {
    const cfg = { ...DEFAULTS, ...opts };
    const all = (allRows || []).filter(Boolean);
    const sp = seasonPlan(all, cfg);
    const sel = select(all, cfg, sp);
    const rows = sel.rows;
    if (rows.length < cfg.minGames) return null;
    let tuned = null;
    if (opts.tune !== false) {
      try {
        tuned = tune(all, cfg, rows, sp, opts);
      } catch (e) {
        tuned = { error: String((e && e.message) || e) };
      }
    }
    const ok = !!tuned && !tuned.error;
    const l2 = ok ? tuned.l2Hero : L2_HERO;
    const kPair = ok ? tuned.kPair : K_PAIR;
    const usePop = ok ? tuned.usePop : true;
    const { teams, fit: ft, tables, acc } = estimate(rows, l2, kPair, usePop);
    const part = modelPart(rows, teams, ft, tables, acc);

    const mk = () => new Map();
    const add = (m, k, v) => m.set(k, (m.get(k) || 0) + v);
    const n = mk(), win = mk(), picked = mk(), banned = mk(), pickedNg = mk(), bannedNg = mk();
    const preban = mk(), prebanFp = mk(), preP = mk(), preF = mk(), preS = mk(), first = mk(), cntF = mk(), cntS = mk();
    const crSum = mk(), crN = mk(), fast = mk();
    const slot = new Map();
    const drafts = [];
    let total = 0, fpN = 0, fpW = 0, recentGames = 0;
    for (let i = 0; i < rows.length; i++) {
      const { r, w: wt, recent } = rows[i];
      const [ta, tb] = teams[i];
      total += wt;
      if (recent) recentGames++;
      // start combat readiness (100 = moved first)
      const ea = r.a.energy || {};
      const eb = r.b.energy || {};
      const vals = [...Object.values(ea), ...Object.values(eb)].filter((e) => e > 0);
      if (vals.length >= 6) {
        const topE = Math.max(...vals);
        for (const en of [ea, eb]) {
          for (const [h, e] of Object.entries(en)) {
            if (!(e > 0)) continue;
            add(crSum, h, wt * e);
            add(crN, h, wt);
            if (e === topE) add(fast, h, wt);
          }
        }
      }
      const aWon = !!r.aWin;
      for (const [sd, team, won] of [[r.a, ta, aWon], [r.b, tb, !aWon]]) {
        sd.picks.forEach((h, j) => {
          add(picked, h, wt);
          if (!slot.has(h)) slot.set(h, [0, 0, 0, 0, 0]);
          slot.get(h)[j] += wt;
          if (j !== 2) add(pickedNg, h, wt);
          if (h === sd.ban) {
            add(banned, h, wt);
            if (j !== 2) add(bannedNg, h, wt);
          }
        });
        for (const h of team) {
          add(n, h, wt);
          if (won) add(win, h, wt);
        }
      }
      const pre = new Set([...(r.a.prebans || []), ...(r.b.prebans || [])]);
      for (const h of pre) add(preban, h, wt);
      for (const h of [...(r.a.prebans || []), ...(r.b.prebans || [])]) add(preP, h, wt);
      if (r.aFirst !== null && r.aFirst !== undefined) {
        fpN += wt;
        const aFirst = !!r.aFirst;
        if (aWon === aFirst) fpW += wt;
        for (const h of pre) add(prebanFp, h, wt);
        const [fPre, sPre] = aFirst ? [r.a.prebans || [], r.b.prebans || []] : [r.b.prebans || [], r.a.prebans || []];
        for (const h of fPre) add(preF, h, wt);
        for (const h of sPre) add(preS, h, wt);
        const [fPicks, sPicks] = aFirst ? [r.a.picks, r.b.picks] : [r.b.picks, r.a.picks];
        drafts.push([fPicks, sPicks, aWon === aFirst ? 1 : 0, wt]);
        add(first, fPicks[0], wt);
        for (const h of fPicks) add(cntF, h, wt);
        for (const h of sPicks) add(cntS, h, wt);
      }
    }
    const g = (m, k) => m.get(k) || 0;
    const heroes = {};
    for (const h of picked.keys()) {
      const mp = part.heroes[h] || { b: 0, bf: 0, bs: 0 };
      heroes[h] = {
        n: round(g(n, h), 2),
        wr: g(n, h) ? round(g(win, h) / g(n, h), 4) : null,
        b: mp.b, bf: mp.bf, bs: mp.bs,
        pick: round(g(picked, h) / total, 4),
        pickF: fpN ? round(g(cntF, h) / Math.max(fpN - g(prebanFp, h), 1e-9), 4) : 0,
        pickS: fpN ? round(g(cntS, h) / Math.max(fpN - g(prebanFp, h), 1e-9), 4) : 0,
        preban: round(g(preban, h) / total, 4),
        prebanP: round(g(preP, h) / (2 * total), 4), // share of players who put it in their two pre-bans
        prebanPf: fpN ? round(g(preF, h) / fpN, 4) : null, // … when they have the first pick
        prebanPs: fpN ? round(g(preS, h) / fpN, 4) : null, // … when they pick second
        first: fpN ? round(g(first, h) / fpN, 4) : 0,
        banned: round(g(banned, h) / g(picked, h), 4),
        qban: round((g(bannedNg, h) + K_BAN * 0.25) / (g(pickedNg, h) + K_BAN), 4),
        slot: slot.get(h).map((x) => round(x / g(picked, h), 3)),
      };
      if (g(crN, h) > 0) {
        heroes[h].cr = round(g(crSum, h) / g(crN, h), 1);
        heroes[h].fast = round(g(fast, h) / g(crN, h), 4);
      }
    }
    for (const h of preban.keys()) {
      if (heroes[h]) continue;
      heroes[h] = { n: 0, wr: null, b: 0, bf: 0, bs: 0, pick: 0, pickF: 0, pickS: 0, preban: round(g(preban, h) / total, 4), prebanP: round(g(preP, h) / (2 * total), 4), prebanPf: fpN ? round(g(preF, h) / fpN, 4) : null, prebanPs: fpN ? round(g(preS, h) / fpN, 4) : null, first: 0, banned: 0, qban: 0.25, slot: [0, 0, 0, 0, 0] };
    }
    const codes = Object.keys(heroes).sort();
    const ci = new Map(codes.map((c, i) => [c, i]));
    const meta = {
      ...sel.info, ...part.meta, format: FORMAT, games: rows.length, recentGames, weightedGames: round(total, 1),
      season: sp ? { code: sp.code, games: sp.games, blend: sp.blend } : null,
      firstPickWr: fpN ? round(fpW / fpN, 4) : null,
      l2Hero: l2, kPair, usePop, calib: ok ? tuned.calib : DEFAULT_CALIB,
      backtest: ok ? tuned.backtest : tuned || null,
    };
    return {
      meta, heroes, syn: part.syn, ctr: part.ctr, rule: part.rule,
      drafts: { codes, F: drafts.map((d) => d[0].map((h) => ci.get(h))), S: drafts.map((d) => d[1].map((h) => ci.get(h))), wf: drafts.map((d) => d[2]), w: drafts.map((d) => Math.round(d[3] * 1000)) },
    };
  }

  // ---------------------------------------------------------------- model

  /** A draft position -> log-odds. Empty slots count as "an average hero"; both players as equally skilled. */
  class Model {
    constructor(stats) {
      stats = stats || {};
      const H = stats.heroes || {};
      this.b = new Map();
      this.bf = new Map();
      this.bs = new Map();
      for (const [h, v] of Object.entries(H)) {
        this.b.set(h, v.b || 0);
        this.bf.set(h, v.bf || 0);
        this.bs.set(h, v.bs || 0);
      }
      const meta = stats.meta || {};
      this.fp = Number(meta.fpBias) || 0;
      this.tau = Number(meta.calib) || 1; // scale found by the self-check, against overconfidence
      this.syn = new Map();
      this.ctr = new Map();
      for (const [k, v] of Object.entries(stats.syn || {})) {
        const [a, b] = k.split('|');
        this.syn.set(`${a}|${b}`, v[1]);
        this.syn.set(`${b}|${a}`, v[1]);
      }
      for (const [k, v] of Object.entries(stats.ctr || {})) {
        const [a, b] = k.split('>'); // "a>b": a's side gains when a faces b
        this.ctr.set(`${a}>${b}`, v[1]);
        this.ctr.set(`${b}>${a}`, -v[1]);
      }
      this.rule = stats.rule || {};
    }
    synOf(a, b) {
      return this.syn.get(`${a}|${b}`) || 0;
    }
    ctrOf(a, b) {
      return this.ctr.get(`${a}>${b}`) || 0;
    }
    /** One hero's value. first = is that hero's side the first-pick side (true / false / null = unknown). */
    hero(h, first, rule) {
      let v = this.b.get(h) || 0;
      if (first === true) v += this.bf.get(h) || 0;
      else if (first === false) v += this.bs.get(h) || 0;
      if (rule && this.rule[rule] && this.rule[rule][h]) v += this.rule[rule][h][1];
      return v;
    }
    /** What adding c to my side changes. -> { total, base, syn, ctr, pairs: [{ kind: 'syn' | 'ctr', code, v }] } */
    gain(c, mine = [], enemy = [], first = null, rule = null) {
      const base = this.hero(c, first, rule);
      const pairs = [];
      let syn = 0;
      let ctr = 0;
      for (const m of mine) {
        const v = this.synOf(c, m);
        if (v) {
          pairs.push({ kind: 'syn', code: m, v });
          syn += v;
        }
      }
      for (const e of enemy) {
        const v = this.ctrOf(c, e);
        if (v) {
          pairs.push({ kind: 'ctr', code: e, v });
          ctr += v;
        }
      }
      return { total: base + syn + ctr, base, syn, ctr, pairs };
    }
    logit(mine, enemy, meFirst = null, rule = null) {
      mine = mine.filter(Boolean);
      enemy = enemy.filter(Boolean);
      let z = meFirst === null || meFirst === undefined ? 0 : meFirst ? this.fp : -this.fp;
      const enFirst = meFirst === null || meFirst === undefined ? null : !meFirst;
      for (const h of mine) z += this.hero(h, meFirst, rule);
      for (const h of enemy) z -= this.hero(h, enFirst, rule);
      for (let i = 0; i < mine.length; i++) for (let k = i + 1; k < mine.length; k++) z += this.synOf(mine[i], mine[k]);
      for (let i = 0; i < enemy.length; i++) for (let k = i + 1; k < enemy.length; k++) z -= this.synOf(enemy[i], enemy[k]);
      for (const m of mine) for (const e of enemy) z += this.ctrOf(m, e);
      return z;
    }
    /** log-odds -> the win rate to show (0..1). */
    wr(z) {
      return sigmoid(this.tau * z);
    }
    /** a log-odds difference -> percentage points near 50%. */
    pp(dz) {
      return round((sigmoid(this.tau * dz) - 0.5) * 100, 1);
    }
    winrate(mine, enemy, meFirst = null, rule = null) {
      return this.wr(this.logit(mine, enemy, meFirst, rule));
    }
  }

  // ---------------------------------------------------------------- policy

  const K_BACKOFF = 30.0; // with this many (weighted) closer games, their share is trusted half
  const K_WR = 20.0;
  // enemy picks already made when my slot i is chosen: as first pick / as second pick
  const OPP_SEEN = { true: [0, 2, 2, 4, 4], false: [1, 1, 3, 3, 5] };

  /** "Same spot, similar draft: what did top players pick?" from the drafts table (first side's 5, second side's 5). */
  class Policy {
    constructor(stats) {
      const d = (stats && stats.drafts) || {};
      this.codes = d.codes || [];
      this.idx = new Map(this.codes.map((c, i) => [c, i]));
      this.n = this.codes.length;
      const G = (d.w || []).length;
      this.G = G;
      this.F = new Int32Array(G * 5);
      this.S = new Int32Array(G * 5);
      for (let i = 0; i < G; i++) {
        for (let k = 0; k < 5; k++) {
          this.F[i * 5 + k] = d.F[i][k];
          this.S[i * 5 + k] = d.S[i][k];
        }
      }
      this.wf = Uint8Array.from(d.wf || []);
      this.w = Float64Array.from(d.w || [], (x) => x / 1000);
      this.ok = G > 0 && this.n > 0;
    }
    /**
     * One slot of mine. -> { p, wr, cnt (Float64Array in codes order), nDeep (games in the closest layer), depth }
     * p = share of top players' drafts with that hero in this slot, backed off from "all drafts" towards "drafts
     * sharing more of my picks and of the enemy picks visible at that moment".
     */
    slot(meFirst, slot, mine = [], enemy = []) {
      if (!this.ok) return null;
      meFirst = !!meFirst;
      const T = meFirst ? this.F : this.S;
      const O = meFirst ? this.S : this.F;
      const seen = OPP_SEEN[meFirst][slot];
      const G = this.G;
      const m = new Int32Array(G);
      const mi = mine.map((h) => this.idx.get(h)).filter((i) => i !== undefined);
      const ei = seen ? enemy.map((h) => this.idx.get(h)).filter((i) => i !== undefined) : [];
      let maxM = 0;
      for (let g = 0; g < G; g++) {
        let c = 0;
        const o = g * 5;
        for (const i of mi) {
          for (let k = 0; k < 5; k++) {
            if (k !== slot && T[o + k] === i) {
              c++;
              break;
            }
          }
        }
        for (const i of ei) {
          for (let k = 0; k < seen; k++) {
            if (O[o + k] === i) {
              c++;
              break;
            }
          }
        }
        m[g] = c;
        if (c > maxM) maxM = c;
      }
      let p = null;
      let wr = null;
      let cnt = null;
      let nDeep = 0;
      let depth = 0;
      for (let t = 0; t <= maxM; t++) {
        const c = new Float64Array(this.n);
        const wn = new Float64Array(this.n);
        let nT = 0;
        for (let g = 0; g < G; g++) {
          if (m[g] < t) continue;
          const key = T[g * 5 + slot];
          const wt = this.w[g];
          nT += wt;
          c[key] += wt;
          if (meFirst ? this.wf[g] : !this.wf[g]) wn[key] += wt;
        }
        if (nT <= 0) break;
        if (!p) {
          p = new Float64Array(this.n);
          wr = new Float64Array(this.n);
          for (let i = 0; i < this.n; i++) {
            p[i] = c[i] / nT;
            wr[i] = (wn[i] + K_WR * 0.5) / (c[i] + K_WR);
          }
        } else {
          for (let i = 0; i < this.n; i++) {
            p[i] = (c[i] + K_BACKOFF * p[i]) / (nT + K_BACKOFF);
            wr[i] = (wn[i] + K_WR * wr[i]) / (c[i] + K_WR);
          }
        }
        cnt = c;
        nDeep = nT;
        depth = t;
      }
      return p ? { p, wr, cnt, nDeep, depth } : null;
    }
  }

  // ---------------------------------------------------------------- engine

  const MIN_HERO_N = 8.0; // heroes with fewer weighted appearances are no candidates
  const RISK_PROB = 0.5; // how likely the opponent really brings the counter
  const POP_REF = 0.08; // from this pick rate on a hero counts fully as "the opponent probably has it"
  const BAN_DISCOUNT = 0.5; // outside the ban-guard slot: value lost to being banned
  const GAIN_WEIGHT = 10.0; // +1 pp expected win rate ≈ 1.5× pick share in the ranking
  const POL_FLOOR = 1e-4;
  const BAN_GUARD_SLOT = 2; // the third pick cannot be banned

  class Engine {
    constructor(stats) {
      this.stats = stats || {};
      this.h = this.stats.heroes || {};
      this.meta = this.stats.meta || {};
      this.model = new Model(this.stats);
      this.policy = new Policy(this.stats);
      this.cands = Object.keys(this.h).filter((c) => (this.h[c].n || 0) >= MIN_HERO_N);
      const cset = new Set(this.cands);
      this.counters = new Map(); // c -> [{ wv, v, code }] biggest first: who hurts c
      for (const [k, d] of this.model.ctr) {
        const [a, e] = k.split('>');
        if (d < -0.02 && cset.has(e)) {
          if (!this.counters.has(a)) this.counters.set(a, []);
          this.counters.get(a).push({ wv: -d * Math.min(1, (this.h[e].pick || 0) / POP_REF), v: -d, code: e });
        }
      }
      for (const lst of this.counters.values()) {
        lst.sort((x, y) => y.wv - x.wv);
        lst.length = Math.min(lst.length, 12);
      }
      this._memo = new Map();
    }
    get ready() {
      return this.cands.length > 0;
    }
    /** Counters the opponent could still bring against c. -> [{ wv (weighted by how common), v, code }] */
    threats(c, gone) {
      return (this.counters.get(c) || []).filter((t) => !gone.has(t.code) && t.v > 0.02);
    }
    /** Risk that a counter comes within the opponent's remaining r picks, and those counters. */
    risk(c, gone, r) {
      if (r <= 0) return { risk: 0, counters: [] };
      const top = this.threats(c, gone).slice(0, r >= 2 ? 2 : 1);
      return { risk: RISK_PROB * top.reduce((s, t) => s + t.wv, 0), counters: top.map((t) => ({ code: t.code, v: t.v })) };
    }
    /**
     * Numbers for every available candidate.
     *   mine / enemy: picks so far (codes), taken: pre-bans, meFirst: true / false / null, slot: my slot being filled
     *   (0..4, or null), rEnemy: enemy picks still to come
     * -> { z0, wr0, rows: Map(code -> row) }, row = { code, z, gain (parts), pp, risk, counters, qban, key, pol, polN,
     *    polWr, score, rank }
     */
    rows(mine, enemy, taken = [], meFirst = null, slot = null, rEnemy = 0, rule = null) {
      mine = mine.filter(Boolean);
      enemy = enemy.filter(Boolean);
      const mk = `${mine.join(',')}/${enemy.join(',')}/${[...taken].sort().join(',')}/${meFirst}/${slot}/${rEnemy}/${rule || ''}`;
      if (this._memo.has(mk)) return this._memo.get(mk);
      const m = this.model;
      const gone = new Set([...taken, ...mine, ...enemy]);
      const z0 = m.logit(mine, enemy, meFirst, rule);
      const pol = meFirst !== null && meFirst !== undefined && slot !== null && slot !== undefined && slot >= 0 && slot < 5 ? this.policy.slot(meFirst, slot, mine, enemy) : null;
      const rows = new Map();
      for (const c of this.cands) {
        if (gone.has(c)) continue;
        const gain = m.gain(c, mine, enemy, meFirst, rule);
        const rk = this.risk(c, gone, rEnemy);
        const q = this.h[c].qban === undefined ? 0.25 : this.h[c].qban;
        const g = gain.total;
        const key = slot === BAN_GUARD_SLOT || slot === null || slot === undefined ? g - rk.risk : (g > 0 ? g * (1 - BAN_DISCOUNT * q) : g) - rk.risk;
        const boost = Math.exp(GAIN_WEIGHT * m.tau * key);
        const row = { code: c, z: z0 + g, gain, pp: m.pp(g), risk: rk.risk, riskPp: m.pp(rk.risk), counters: rk.counters, qban: q, key, pol: null, polN: 0, polWr: null, score: boost };
        const i = this.policy.idx.get(c);
        if (pol && i !== undefined) {
          row.pol = pol.p[i];
          row.polN = pol.cnt[i];
          row.polWr = pol.wr[i];
          row.score = (pol.p[i] + POL_FLOOR) * boost;
        } else if (pol) row.score = POL_FLOOR * boost;
        rows.set(c, row);
      }
      [...rows.values()].sort((x, y) => y.score - x.score).forEach((r, i) => (r.rank = i + 1));
      const out = { z0, wr0: m.wr(z0), rows, polGames: pol ? pol.nDeep : 0, polDepth: pol ? pol.depth : 0 };
      if (this._memo.size > 40) this._memo.clear();
      this._memo.set(mk, out);
      return out;
    }
    /**
     * Heroes top players really pre-ban. myUse = { code: share of my games I pick it } lowers heroes I play myself.
     * -> [{ code, rate (a player puts it in their two pre-bans), rateAny (pre-banned by either), pick, byRole, score }]
     */
    prebans(exclude = [], myUse = {}, meFirst = null) {
      const ex = new Set(exclude);
      const key = meFirst === null || meFirst === undefined ? null : meFirst ? 'prebanPf' : 'prebanPs';
      const out = [];
      for (const [c, st] of Object.entries(this.h)) {
        const base = st.prebanP === undefined || st.prebanP === null ? (st.preban || 0) / 2 : st.prebanP;
        let rate = key ? st[key] : null;
        if (rate === null || rate === undefined) rate = base;
        if (ex.has(c) || Math.max(rate, base) < 0.005) continue;
        const use = myUse[c] || 0;
        let pen = 0.7 * Math.min(1, use / 0.15); // my own main heroes rank lower …
        if (meFirst === false) pen *= Math.max(0, 1 - 3 * (st.first || 0)); // … less so when the opponent could first-pick them
        out.push({ code: c, rate, rateAny: st.preban || 0, pick: st.pick || 0, first: st.first || 0, byRole: !!(key && st[key] !== null && st[key] !== undefined), myUse: use, score: rate * (1 - pen) });
      }
      return out.sort((x, y) => y.score - x.score);
    }
    /** What top players open with as first pick. -> [{ code, rate }] */
    firstPicks(gone = [], top = 6) {
      const g = new Set(gone);
      return Object.entries(this.h).filter(([c, st]) => !g.has(c) && (st.first || 0) >= 0.01).map(([c, st]) => ({ code: c, rate: st.first })).sort((x, y) => y.rate - x.rate).slice(0, top);
    }
    /**
     * Which of the enemy's five to ban. Assumes they ban the hero of mine whose loss hurts me most (never the third
     * pick). Ranked by expected win rate after both bans; how often top players ban a hero is NOT part of the rank
     * (E7DaT measured that it says nothing about winning).
     * -> { rows: [{ code, wr, gain, pp, qban }], theirBan, wrNow }
     */
    bans(mine, enemy, meFirst = null, rule = null) {
      const m = this.model;
      mine = mine.filter(Boolean);
      enemy = enemy.filter(Boolean);
      const z0 = m.logit(mine, enemy, meFirst, rule);
      const guardMine = mine.length === 5 ? mine[BAN_GUARD_SLOT] : null;
      const guardEnemy = enemy.length === 5 ? enemy[BAN_GUARD_SLOT] : null;
      let theirBan = null;
      let worst = -Infinity;
      for (const h of mine) {
        if (h === guardMine) continue;
        const loss = z0 - m.logit(mine.filter((x) => x !== h), enemy, meFirst, rule);
        if (loss > worst) {
          worst = loss;
          theirBan = h;
        }
      }
      const after = mine.filter((x) => x !== theirBan);
      const zNow = m.logit(after, enemy, meFirst, rule);
      const rows = [];
      for (const e of enemy) {
        if (e === guardEnemy) continue;
        const z = m.logit(after, enemy.filter((x) => x !== e), meFirst, rule);
        rows.push({ code: e, z, wr: m.wr(z), gain: z - zNow, pp: m.pp(z - zNow), qban: this.h[e] ? this.h[e].qban : 0.25 });
      }
      rows.sort((x, y) => y.gain - x.gain);
      return { rows, theirBan, wrNow: m.wr(zNow), guardEnemy };
    }
    winrate(mine, enemy, meFirst = null, rule = null) {
      return this.model.winrate(mine, enemy, meFirst, rule);
    }
  }

  const api = { DEFAULTS, FORMAT, BAN_GUARD_SLOT, build, select, seasonPlan, Model, Policy, Engine, engine: (stats) => (stats && stats.meta && stats.meta.format === FORMAT ? new Engine(stats) : null), _lbfgs: lbfgs, _calib: calib, sigmoid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7TopModel = api;
})(typeof self !== 'undefined' ? self : this);
