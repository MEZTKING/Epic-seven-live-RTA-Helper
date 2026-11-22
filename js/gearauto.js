/*
 * Auto-gear a hero (DEVLOG #92): the best six items for a hero from your items, for a goal, with minimum stats and
 * the sets you want. Pure (Node + browser). Browser: window.E7GearAuto. Stats as js/gearbuild.js adds them up (the
 * RexQian fork's formula; base = level-60 six-star awakened, no artifact / exclusive equipment / imprint), so the
 * numbers are close to the game's, not exact.
 *
 * How: every item becomes a small vector (attack %, flat attack, …, its set). Per slot only the most promising items
 * are kept (by the goal's weights; the wanted sets get places of their own), about 11 per slot, so at most ~2 million
 * combinations are tried, each in a few dozen additions. Same idea as the Fribbels optimizer, much smaller.
 *
 *   GOALS                                   { damage, speed, tank, bruiser }: name + what it maximises
 *   optimize(base, items, opts)             -> { builds: [{ items: {slot: item}, stats, score, meets }], tried, kept, exact }
 *     opts: { goal: 'damage', min: { spd, chc, chd, eff, efr, hp, def, atk }, set4: 'SpeedSet' | '', set2: ['CriticalSet'],
 *             top: 5, perSlot: 11 }
 *     exact = false when no combination meets every minimum: then the closest ones are given (meets = false)
 */
(function (root) {
  'use strict';
  const B = typeof module !== 'undefined' && module.exports ? require('./gearbuild.js') : root.E7GearBuild;
  const SLOTS = B.SLOTS;
  // the vector: 0 atk, 1 atkP, 2 hp, 3 hpP, 4 def, 5 defP, 6 spd, 7 chc, 8 chd, 9 eff, 10 efr
  const IDX = { Attack: 0, AttackPercent: 1, Health: 2, HealthPercent: 3, Defense: 4, DefensePercent: 5, Speed: 6, CriticalHitChancePercent: 7, CriticalHitDamagePercent: 8, EffectivenessPercent: 9, EffectResistancePercent: 10 };
  const SET_LIST = Object.keys(B.SET_PIECES);
  const SET_ID = Object.fromEntries(SET_LIST.map((s, i) => [s, i]));
  const num = (x) => Number(x) || 0;

  /** final stats from summed gear + set counts: the same as E7GearBuild.heroStats (checked in the tests) */
  function finish(base, g, counts) {
    const c = (s) => counts[SET_ID[s]] || 0;
    const pairs = (s) => Math.floor(c(s) / 2);
    const four = (s) => Math.floor(c(s) / 4);
    const atk = base.atk * (1 + g[1] / 100 + 0.45 * four('AttackSet')) + g[0];
    const hp = base.hp * (1 + g[3] / 100 + 0.2 * pairs('HealthSet') + 0.2 * four('WarfareSet') - 0.1 * pairs('TorrentSet')) + g[2];
    const def = base.def * (1 + g[5] / 100 + 0.2 * pairs('DefenseSet')) + g[4];
    const spdBonus = 0.25 * four('SpeedSet') + 0.12 * four('RevengeSet') + 0.15 * four('ReversalSet') + 0.15 * four('WeakeningSet');
    const spd = Math.floor(base.spd * (1 + spdBonus) + g[6] + 1e-6);
    const chc = Math.min(100, Math.round(num(base.chc) * 100 + g[7] + 12 * pairs('CriticalSet')));
    const chd = Math.min(350, Math.round(num(base.chd) * 100 + g[8] + 60 * four('DestructionSet')));
    const eff = Math.round(num(base.eff) * 100 + g[9] + 20 * pairs('HitSet'));
    const efr = Math.round(num(base.efr) * 100 + g[10] + 20 * pairs('ResistSet'));
    return { atk: Math.round(atk), hp: Math.round(hp), def: Math.round(def), spd, chc, chd, eff, efr };
  }

  const dmg = (s) => s.atk * (1 + (Math.min(100, s.chc) / 100) * (s.chd / 100 - 1));
  const ehp = (s) => s.hp * (1 + s.def / 300);
  const GOALS = {
    damage: { name: 'Damage (attack × crits)', score: dmg },
    speed: { name: 'Speed (then damage and health)', score: (s) => s.spd * 1e6 + Math.sqrt(dmg(s) * ehp(s)) },
    tank: { name: 'Tankiness (health × defense)', score: ehp },
    bruiser: { name: 'Bruiser (damage and tankiness)', score: (s) => Math.sqrt(dmg(s) * ehp(s)) },
  };
  // rough worth of one point of each vector entry for picking candidates (relative to the base stats)
  function weights(base, goal, min) {
    const w = new Array(11).fill(0);
    const pa = 100 / Math.max(1, base.atk);
    const ph = 100 / Math.max(1, base.hp);
    const pd = 100 / Math.max(1, base.def);
    if (goal === 'damage' || goal === 'bruiser' || goal === 'speed') {
      w[0] = pa; w[1] = 1; w[7] = 1.2; w[8] = 0.9;
    }
    if (goal === 'tank' || goal === 'bruiser' || goal === 'speed') {
      w[2] = ph; w[3] = 1; w[4] = pd; w[5] = 1;
    }
    w[6] = goal === 'speed' ? 8 : 2;
    // a minimum asked for makes its stat count when choosing candidates
    if (min.spd) w[6] = Math.max(w[6], 4);
    if (min.chc) w[7] = Math.max(w[7], 1.5);
    if (min.chd) w[8] = Math.max(w[8], 1);
    if (min.eff) w[9] = 1.5;
    if (min.efr) w[10] = 1.5;
    if (min.hp) { w[2] = Math.max(w[2], ph); w[3] = Math.max(w[3], 1); }
    if (min.def) { w[4] = Math.max(w[4], pd); w[5] = Math.max(w[5], 1); }
    if (min.atk) { w[0] = Math.max(w[0], pa); w[1] = Math.max(w[1], 1); }
    return w;
  }
  function vec(it) {
    const v = new Array(11).fill(0);
    for (const s of [it.main, ...(it.subs || it.substats || [])]) if (s && IDX[s.type] !== undefined) v[IDX[s.type]] += num(s.value);
    return v;
  }

  function optimize(base, items, opts = {}) {
    const goal = GOALS[opts.goal] ? opts.goal : 'damage';
    const min = opts.min || {};
    const set4 = opts.set4 || '';
    const set2 = (opts.set2 || []).filter(Boolean);
    const want = [...(set4 ? [set4] : []), ...set2];
    const top = opts.top || 5;
    const perSlot = opts.perSlot || 11;
    if (!base) return { builds: [], tried: 0, kept: 0, exact: false };
    const w = weights(base, goal, min);
    // candidates per slot: the best by the weights, plus the best of each wanted set, plus "nothing" when a slot has none
    const lists = SLOTS.map((slot) => {
      const all = (items || []).filter((it) => it && it.gear === slot).map((it) => {
        const v = vec(it);
        return { it, v, set: SET_ID[it.set] ?? -1, value: v.reduce((a, x, i) => a + x * w[i], 0) + (want.includes(it.set) ? 15 : 0) };
      });
      all.sort((a, b) => b.value - a.value);
      const pick = all.slice(0, Math.max(3, perSlot - want.length * 2));
      for (const st of want) for (const c of all.filter((x) => x.it.set === st).slice(0, 3)) if (!pick.includes(c)) pick.push(c);
      return pick.length ? pick.slice(0, perSlot + want.length * 3) : [{ it: null, v: new Array(11).fill(0), set: -1, value: 0 }];
    });
    const needSets = {};
    for (const s of want) needSets[SET_ID[s]] = (needSets[SET_ID[s]] || 0) + B.SET_PIECES[s];
    const score = GOALS[goal].score;
    const MIN_KEYS = Object.keys(min).filter((k) => num(min[k]) > 0);
    const short = (st) => MIN_KEYS.reduce((a, k) => a + Math.max(0, (num(min[k]) - st[k]) / Math.max(1, num(min[k]))), 0);
    let best = []; // meets everything, by score
    let near = []; // closest when nothing meets: by shortfall, then score
    let tried = 0;
    const g = new Array(11).fill(0);
    const counts = new Array(SET_LIST.length).fill(0);
    const chosen = new Array(6);
    const keep = (arr, entry, better) => {
      if (arr.length >= top && !better(entry, arr[arr.length - 1])) return arr;
      arr.push(entry);
      arr.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
      if (arr.length > top) arr.pop();
      return arr;
    };
    const rec = (i) => {
      if (i === 6) {
        tried++;
        for (const k in needSets) if (counts[k] < needSets[k]) return;
        const st = finish(base, g, counts);
        const sc = score(st);
        const miss = short(st);
        if (miss === 0) best = keep(best, { pick: chosen.slice(), stats: st, score: sc }, (a, b) => a.score > b.score);
        else if (!best.length) near = keep(near, { pick: chosen.slice(), stats: st, score: sc, miss }, (a, b) => a.miss < b.miss || (a.miss === b.miss && a.score > b.score));
        return;
      }
      for (const c of lists[i]) {
        chosen[i] = c.it;
        for (let k = 0; k < 11; k++) g[k] += c.v[k];
        if (c.set >= 0) counts[c.set]++;
        rec(i + 1);
        for (let k = 0; k < 11; k++) g[k] -= c.v[k];
        if (c.set >= 0) counts[c.set]--;
      }
    };
    rec(0);
    const exact = best.length > 0;
    const out = (exact ? best : near).map((b) => {
      const its = {};
      b.pick.forEach((it, i) => it && (its[SLOTS[i]] = it));
      return { items: its, stats: { ...b.stats, sets: B.heroStats(base, Object.values(its)).sets }, score: Math.round(b.score), meets: exact, ...(b.miss ? { miss: b.miss } : {}) };
    });
    return { builds: out, tried, kept: lists.reduce((a, l) => a + l.length, 0), exact };
  }

  const api = { GOALS, optimize, finish, vec };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7GearAuto = api;
})(typeof self !== 'undefined' ? self : this);
