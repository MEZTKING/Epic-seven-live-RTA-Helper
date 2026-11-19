/*
 * Gear simulator and "what to do with it" (DEVLOG #78). Pure (Node + browser). Browser: window.E7GearSim.
 * Uses RTAGearSort (js/gearsort.js) for the gear score (WSS), rolls and the reforge tables.
 *
 * How enhancing works (the game's rules as players know them): every 3 levels (+3, +6, +9, +12, +15) one substat
 * gets a roll, picked at random among the 4. An item with fewer than 4 substats gets a NEW substat instead, at +12
 * (Heroic: 3 substats), at +9 and +12 (Rare: 2), … New substats are never the main stat, never one it already has; a
 * weapon gets no defense, an armor no attack.
 * Roll sizes at level 85 (built-in, approximate; the same for every rarity here): Attack% / Health% / Defense% /
 * Effectiveness / Resistance 4-8, Crit Chance 3-5, Crit Damage 4-7, Speed 2-4, flat Attack 33-46, flat Health
 * 157-202, flat Defense 28-35. At level 85 a +15 item can then be reforged (+ fixed amounts per roll, RexQian tables).
 *
 *   ROLL                                   { type: [min, max] }
 *   simulate(item, rng)                    -> { steps: [{ at, kind: 'roll'|'new', type, add }], item, wss, reforgedWss }
 *   outcomes(item, { runs, rng, keep })    -> { runs, worst, low, mid, high, best, chanceKeep, reforged: {low, mid, high},
 *                                              speedChance }   (low / mid / high = 25th / 50th / 75th percentile)
 *   advice(result, { rules, out, nameOf }) -> { action, text, tone }   one plain sentence on what to do
 */
(function (root) {
  'use strict';
  const S = typeof module !== 'undefined' && module.exports ? require('./gearsort.js') : root.RTAGearSort;
  const ROLL = {
    AttackPercent: [4, 8], HealthPercent: [4, 8], DefensePercent: [4, 8], EffectivenessPercent: [4, 8], EffectResistancePercent: [4, 8],
    CriticalHitChancePercent: [3, 5], CriticalHitDamagePercent: [4, 7], Speed: [2, 4], Attack: [33, 46], Health: [157, 202], Defense: [28, 35],
  };
  const NO_SUB = { Weapon: ['Defense', 'DefensePercent'], Armor: ['Attack', 'AttackPercent'] };
  const STEPS = [3, 6, 9, 12, 15];

  // a small seedable generator, so tests (and "roll again") are repeatable
  function rngFrom(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) % 1e9) / 1e9;
    };
  }
  const pick = (rng, list) => list[Math.floor(rng() * list.length)];
  const rollOf = (rng, type) => {
    const r = ROLL[type];
    return r ? r[0] + Math.floor(rng() * (r[1] - r[0] + 1)) : 0;
  };

  function simulate(item, rng = Math.random) {
    const subs = (item.subs || []).map((s) => ({ ...s, rolls: S.rollsOf(s) }));
    const steps = [];
    const enh = Number(item.enhance) || 0;
    const missing = Math.max(0, 4 - subs.length);
    // the levels where a new substat arrives: the last `missing` of +3..+12 (Heroic: +12; Rare: +9, +12)
    const newAt = [12, 9, 6, 3].slice(0, missing);
    for (const at of STEPS) {
      if (at <= enh) continue;
      if (newAt.includes(at) && subs.length < 4) {
        const have = new Set([item.main && item.main.type, ...subs.map((s) => s.type)]);
        const pool = Object.keys(ROLL).filter((t) => !have.has(t) && !(NO_SUB[item.gear] || []).includes(t));
        const type = pick(rng, pool);
        const add = rollOf(rng, type);
        subs.push({ type, value: add, rolls: 1 });
        steps.push({ at, kind: 'new', type, add });
      } else if (subs.length) {
        const s = pick(rng, subs);
        const add = rollOf(rng, s.type);
        s.value = (Number(s.value) || 0) + add;
        s.rolls += 1;
        steps.push({ at, kind: 'roll', type: s.type, add });
      }
    }
    const out = { ...item, enhance: 15, subs };
    return { steps, item: out, wss: S.wss(subs), reforgedWss: S.wss(S.reforgedSubs(out)) };
  }

  const pctile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
  function outcomes(item, { runs = 1000, rng = Math.random, keep = 60 } = {}) {
    if ((Number(item.enhance) || 0) >= 15) {
      const w = S.wss(item.subs);
      const rf = S.wss(S.reforgedSubs(item));
      return { runs: 0, worst: w, low: w, mid: w, high: w, best: w, chanceKeep: (rf >= keep ? 1 : 0), reforged: { low: rf, mid: rf, high: rf }, speedChance: 0 };
    }
    const w = [];
    const rf = [];
    let fast = 0;
    const speed0 = (item.subs || []).filter((s) => s.type === 'Speed').reduce((n, s) => n + (Number(s.value) || 0), 0);
    for (let i = 0; i < runs; i++) {
      const r = simulate(item, rng);
      w.push(r.wss);
      rf.push(r.reforgedWss);
      const sp = r.item.subs.filter((s) => s.type === 'Speed').reduce((n, s) => n + (Number(s.value) || 0), 0);
      if (sp >= Math.max(12, speed0 + 4)) fast++;
    }
    w.sort((a, b) => a - b);
    rf.sort((a, b) => a - b);
    const best = rf.map((v, i) => Math.max(v, w[i]));
    return {
      runs,
      worst: w[0],
      low: pctile(w, 0.25),
      mid: pctile(w, 0.5),
      high: pctile(w, 0.75),
      best: w[w.length - 1],
      chanceKeep: best.filter((v) => v >= keep).length / runs,
      reforged: { low: pctile(rf, 0.25), mid: pctile(rf, 0.5), high: pctile(rf, 0.75) },
      speedChance: fast / runs,
    };
  }

  /** One plain sentence: what to do with this item now. result = RTAGearSort.evaluate(...) (+ worn for screen items). */
  function advice(r, { rules = S.DEFAULT_RULES, out = null, nameOf = (c) => c, worn = false } = {}) {
    const it = r.item;
    const ups = (r.best || []).filter((b) => b.delta > rules.upgradeMargin);
    const who = ups.length ? ups.slice(0, 2).map((b) => nameOf(b.code)).join(' or ') : '';
    if (it.equipped || worn) {
      return { action: 'Keep', tone: 'good', text: it.equipped ? `Keep it: ${nameOf(it.equipped)} wears it.${who && ups[0].code !== it.equipped ? ` It would suit ${who} even better.` : ''}` : 'Keep it: one of your heroes wears it.' };
    }
    if (r.verdict === 'reforge') return { action: 'Reforge', tone: 'good', text: `Reforge it (level 85 → 90): gear score ${r.wss} → ${r.reforgedWss}.${who ? ` Then put it on ${who}.` : ''}` };
    if (r.verdict === 'keep') return { action: 'Keep', tone: 'good', text: who ? `Keep it and put it on ${who}.` : `Keep it: ${r.reason.charAt(0).toLowerCase() + r.reason.slice(1)}.` };
    if (r.verdict === 'enhance') {
      const next = [3, 6, 9, 12, 15].find((x) => x > (Number(it.enhance) || 0)) || 15;
      const chance = out && out.runs ? ` About ${Math.round(out.chanceKeep * 100)}% of the time it ends at ${rules.keepWss}+ (after reforge).` : '';
      const stop = next < 15 ? ` Enhance to +${next}, look at the new roll, then decide.` : ' Enhance it to +15.';
      return { action: 'Enhance', tone: 'maybe', text: `Worth a try.${stop}${chance}` };
    }
    const why = out && out.runs ? ` Even the best quarter of the simulations ends around ${out.high} (keep from ${rules.keepWss}).` : '';
    if (r.verdict === 'extract') return { action: 'Extract', tone: 'bad', text: `Extract it (level 85+ gives materials).${why}` };
    return { action: 'Sell', tone: 'bad', text: `Sell it.${why}` };
  }

  const api = { ROLL, STEPS, rngFrom, simulate, outcomes, advice };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7GearSim = api;
})(typeof self !== 'undefined' ? self : this);
