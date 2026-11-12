/*
 * "Tune from my matches": learns how much to trust each suggestion source.
 * Pure (no DOM). Browser: window.RTATune. Node: require().
 *
 * For every logged match it scores both final teams with each source group
 * separately (my team minus their team), then fits a logistic regression
 * P(win) = sigmoid(sum_g b_g * x_g). A group whose scores predicted your wins
 * well gets a bigger weight; one that didn't gets a smaller one (never < 0).
 * Learned stats are rebuilt WITHOUT the match being scored (leave-one-out),
 * so a match can't "predict itself".
 */
(function (root) {
  function sigmoid(z) {
    return 1 / (1 + Math.exp(-z));
  }

  /** Plain logistic regression with L2, batch gradient descent. */
  function fitLogistic(X, y, { l2 = 0.05, iters = 1500, lr = 0.1 } = {}) {
    const d = X[0] ? X[0].length : 0;
    const w = new Array(d).fill(0);
    let b = 0;
    const n = X.length;
    for (let it = 0; it < iters; it++) {
      const gw = new Array(d).fill(0);
      let gb = 0;
      for (let i = 0; i < n; i++) {
        let z = b;
        for (let j = 0; j < d; j++) z += w[j] * X[i][j];
        const e = sigmoid(z) - y[i];
        for (let j = 0; j < d; j++) gw[j] += e * X[i][j];
        gb += e;
      }
      for (let j = 0; j < d; j++) w[j] -= lr * (gw[j] / n + l2 * w[j]);
      b -= lr * (gb / n);
    }
    return { w, b };
  }

  /** Team value per source group: sum over my fighters minus sum over theirs. */
  function teamFeatures(mine, theirs, ctx, Logic, groups) {
    const total = (team, others, side) => {
      const t = {};
      for (const h of team) {
        const r = Logic.scoreCandidate(h, team.filter((x) => x !== h), others, ctx, { side });
        for (const [g, v] of Object.entries(r.bySource || {})) t[g] = (t[g] || 0) + v;
      }
      return t;
    };
    const a = total(mine, theirs, 'me');
    const b = total(theirs, mine, 'opp');
    return groups.map((g) => (a[g] || 0) - (b[g] || 0));
  }

  /**
   * matches   enabled matches (most recent `limit` are used)
   * heroesByCode Map
   * baseCtx   suggestion context WITHOUT learned stats / player profile
   * Learn, Logic modules
   */
  function tuneWeights(matches, heroesByCode, baseCtx, Learn, Logic, { limit = 300, groups = ['my notes', 'learned', 'game rule', 'presets', 'meta', 'speed'] } = {}) {
    const ms = matches.filter((m) => (m.myPicks || []).length && (m.oppPicks || []).length).slice(0, limit);
    if (ms.length < 15) return { ok: false, reason: `Needs at least 15 matches with both teams (have ${ms.length}).`, n: ms.length };
    const X = [];
    const y = [];
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      const others = ms.slice(0, i).concat(ms.slice(i + 1));
      const ctx = { ...baseCtx, stats: Learn.buildStats(others), learn: Learn, profile: null, deny: false, sourceWeights: null };
      const { mine, theirs } = Learn.lineups(m);
      const H = (codes) => codes.map((c) => heroesByCode.get(c)).filter(Boolean);
      X.push(teamFeatures(H(mine), H(theirs), ctx, Logic, groups));
      y.push(m.result === 'win' ? 1 : 0);
    }
    // scale features so groups are comparable during fitting
    const scale = groups.map((_, j) => Math.sqrt(X.reduce((s, r) => s + r[j] * r[j], 0) / X.length) || 1);
    const Xs = X.map((r) => r.map((v, j) => v / scale[j]));
    const { w, b } = fitLogistic(Xs, y);
    const raw = w.map((v, j) => Math.max(0, v / scale[j]));
    const used = groups.map((_, j) => X.some((r) => r[j] !== 0));
    const active = raw.filter((v, j) => used[j] && v > 0);
    const norm = active.length ? active.reduce((s, v) => s + v, 0) / active.length : 1;
    const weights = {};
    groups.forEach((g, j) => (weights[g] = used[j] ? Math.round(Math.min(3, raw[j] / norm) * 100) / 100 : 1));
    const acc = (fn) => X.filter((r, i) => (fn(r) > 0 ? 1 : 0) === y[i]).length / X.length;
    return {
      ok: true,
      n: ms.length,
      weights,
      accuracyBefore: acc((r) => r.reduce((s, v) => s + v, 0)),
      accuracyAfter: acc((r) => r.reduce((s, v, j) => s + v * weights[groups[j]], 0)),
      intercept: b,
    };
  }

  const api = { sigmoid, fitLogistic, teamFeatures, tuneWeights };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RTATune = api;
})(typeof window !== 'undefined' ? window : globalThis);
