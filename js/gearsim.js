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
 *   upgradePlan(results, { rules, runs })  -> { enhance, reforge, modify }  what to upgrade next (DEVLOG #80)
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
  function advice(r, { rules = S.DEFAULT_RULES, out = null, nameOf = (c) => c, worn = false, show = null } = {}) {
    // show (DEVLOG #83): the score the page shows: { label, now, after, at15(gear score at +15) }; default the gear score
    const sh = show || { label: 'gear score', now: r.wss, after: r.reforgedWss, at15: (w) => w };
    const it = r.item;
    const ups = (r.best || []).filter((b) => b.delta > rules.upgradeMargin);
    const who = ups.length ? ups.slice(0, 2).map((b) => nameOf(b.code)).join(' or ') : '';
    if (it.equipped || worn) {
      return { action: 'Keep', tone: 'good', text: it.equipped ? `Keep it: ${nameOf(it.equipped)} wears it.${who && ups[0].code !== it.equipped ? ` It would suit ${who} even better.` : ''}` : 'Keep it: one of your heroes wears it.' };
    }
    if (r.verdict === 'reforge') return { action: 'Reforge', tone: 'good', text: `Reforge it (level 85 → 90): ${sh.label} ${sh.now} → ${sh.after}.${who ? ` Then put it on ${who}.` : ''}` };
    if (r.verdict === 'keep') return { action: 'Keep', tone: 'good', text: who ? `Keep it and put it on ${who}.` : `Keep it: ${r.reason.charAt(0).toLowerCase() + r.reason.slice(1)}.` };
    if (r.verdict === 'enhance') {
      const next = [3, 6, 9, 12, 15].find((x) => x > (Number(it.enhance) || 0)) || 15;
      const chance = out && out.runs ? ` About ${Math.round(out.chanceKeep * 100)}% of the time it ends at ${sh.at15(rules.keepWss)}+ (after reforge).` : '';
      const stop = next < 15 ? ` Enhance to +${next}, look at the new roll, then decide.` : ' Enhance it to +15.';
      return { action: 'Enhance', tone: 'maybe', text: `Worth a try.${stop}${chance}` };
    }
    const why = out && out.runs ? ` Even the best quarter of the simulations ends around ${sh.at15(out.high)} (keep from ${sh.at15(rules.keepWss)}).` : '';
    if (r.verdict === 'extract') return { action: 'Extract', tone: 'bad', text: `Extract it (level 85+ gives materials).${why}` };
    return { action: 'Sell', tone: 'bad', text: `Sell it.${why}` };
  }

  /**
   * Item upgrades (DEVLOG #80): what is worth doing next across your gear. results = RTAGearSort.evaluate(...) list.
   *   enhance: items below +15 worth enhancing, by the usual gain (median of the simulations) → { r, out, gain }
   *   reforge: +15 level-85 items, by the gear score reforging adds → { r, gain }
   *   modify:  +15 items you keep, their weakest substat and the best other substat for it, with as many rolls
   *            (an estimate: average rolls; the game's modification gems give their own ranges) → { r, sub, to, gain }
   */
  const AVG = { AttackPercent: 6, HealthPercent: 6, DefensePercent: 6, EffectivenessPercent: 6, EffectResistancePercent: 6, CriticalHitChancePercent: 4, CriticalHitDamagePercent: 5.5, Speed: 3, Attack: 39, Health: 174, Defense: 31 };
  function upgradePlan(results, { rules = S.DEFAULT_RULES, runs = 300, rng = rngFrom(4242), limit = 12 } = {}) {
    const enhance = [];
    const reforge = [];
    const modify = [];
    for (const r of results || []) {
      const it = r.item;
      const enh = Number(it.enhance) || 0;
      if (enh < 15 && (r.verdict === 'enhance' || r.verdict === 'keep')) {
        const out = outcomes(it, { runs, rng, keep: rules.keepWss });
        enhance.push({ r, out, gain: out.mid - r.wss });
      }
      if (enh >= 15 && r.reforgedWss > r.wss && (r.verdict === 'reforge' || r.verdict === 'keep' || it.equipped || it.worn)) reforge.push({ r, gain: r.reforgedWss - r.wss });
      if (enh >= 15 && (r.verdict === 'keep' || r.verdict === 'reforge' || it.equipped || it.worn) && (it.subs || []).length === 4) {
        const contrib = (s) => (Number(s.value) || 0) * (S.WSS_WEIGHT[s.type] || 0);
        const weakest = it.subs.slice().sort((a, b) => contrib(a) - contrib(b))[0];
        const rolls = S.rollsOf(weakest);
        const have = new Set([it.main && it.main.type, ...it.subs.map((s) => s.type)]);
        const options = Object.keys(AVG)
          .filter((t) => !have.has(t) && !(NO_SUB[it.gear] || []).includes(t))
          .map((t) => ({ t, v: Math.round(AVG[t] * rolls), w: AVG[t] * rolls * (S.WSS_WEIGHT[t] || 0) }))
          .sort((a, b) => b.w - a.w);
        const best = options[0];
        if (best && best.w - contrib(weakest) >= 4) modify.push({ r, sub: weakest, to: { type: best.t, value: best.v }, gain: Math.round(best.w - contrib(weakest)) });
      }
    }
    const by = (k) => (a, b) => b[k] - a[k];
    return { enhance: enhance.sort((a, b) => b.out.chanceKeep - a.out.chanceKeep || b.gain - a.gain).slice(0, limit), reforge: reforge.sort(by('gain')).slice(0, limit), modify: modify.sort(by('gain')).slice(0, limit) };
  }

  const api = { ROLL, STEPS, rngFrom, simulate, outcomes, advice, upgradePlan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7GearSim = api;
})(typeof self !== 'undefined' ? self : this);
