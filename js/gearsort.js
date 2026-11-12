/*
 * Gear sorter: scores every item from gear.txt, finds which of your heroes it
 * suits best, and suggests Keep / Enhance / Reforge / Extract / Sell.
 * Pure (no DOM). Browser: window.RTAGearSort. Node: require().
 *
 * Formulas follow the RexQian fork of the Fribbels optimizer:
 *   - Gear score (WSS) = substats only: %stats x1, Speed x2, Crit Damage x8/7,
 *     Crit Chance x8/5, flat Atk x3.46/39, flat Def x4.99/31, flat HP x3.09/174
 *   - Reforge (level 85 -> 90) adds a fixed amount per substat depending on
 *     how many times it rolled (tables below, from the fork's reforge.js)
 * The Keep/Sell rules are rules of thumb with thresholds you can change.
 */
(function (root) {
  const STATS = {
    AttackPercent: 'Atk%',
    HealthPercent: 'HP%',
    DefensePercent: 'Def%',
    Attack: 'Atk',
    Health: 'HP',
    Defense: 'Def',
    Speed: 'Spd',
    CriticalHitChancePercent: 'CC',
    CriticalHitDamagePercent: 'CD',
    EffectivenessPercent: 'Eff',
    EffectResistancePercent: 'Res',
    DualAttackChancePercent: 'Dual',
  };
  const WSS_WEIGHT = {
    AttackPercent: 1,
    DefensePercent: 1,
    HealthPercent: 1,
    EffectResistancePercent: 1,
    EffectivenessPercent: 1,
    Speed: 8 / 4,
    CriticalHitDamagePercent: 8 / 7,
    CriticalHitChancePercent: 8 / 5,
    Attack: 3.46 / 39,
    Defense: 4.99 / 31,
    Health: 3.09 / 174,
  };
  const PLAIN = ['AttackPercent', 'DefensePercent', 'HealthPercent', 'EffectivenessPercent', 'EffectResistancePercent'];
  // Reforge additions by number of rolls (RexQian fork, reforge.js)
  const REFORGE = {
    plain: { 1: 1, 2: 3, 3: 4, 4: 5, 5: 7, 6: 8 },
    CriticalHitChancePercent: (r) => r,
    CriticalHitDamagePercent: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 6, 6: 7 },
    Speed: { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 4 },
    Attack: (r) => 11 * r,
    Defense: (r) => 9 * r,
    Health: (r) => 56 * r,
  };
  // Average value of one roll at level 85 (used when gear.txt has no roll counts)
  const AVG_ROLL = { plain: 6, CriticalHitChancePercent: 4, CriticalHitDamagePercent: 5.5, Speed: 3, Attack: 39, Defense: 31, Health: 174 };
  const MAX_ROLLS_15 = { Epic: 9, Heroic: 8, Rare: 7, Good: 6, Normal: 5 };
  const WSS_PER_ROLL = 6; // typical gear score gained per enhancement roll
  const MAIN_SLOTS = ['Necklace', 'Ring', 'Boots'];

  const kindOf = (type) => (PLAIN.includes(type) ? 'plain' : type);
  const num = (x) => (typeof x === 'number' ? x : Number(x) || 0);

  function rollsOf(sub) {
    if (Number(sub.rolls) > 0) return Number(sub.rolls);
    const avg = AVG_ROLL[kindOf(sub.type)];
    return avg ? Math.max(1, Math.round(num(sub.value) / avg)) : 1;
  }

  function isGaveleets(item) {
    return /gaveleet/i.test(item.name || '') && item.level === 85;
  }
  function isReforgeable(item) {
    return item.level === 85 && !isGaveleets(item);
  }

  /** Substats after reforging (level 85 items); unchanged otherwise. */
  function reforgedSubs(item) {
    const subs = item.subs || [];
    if (!isReforgeable(item)) return subs;
    return subs.map((s) => {
      const r = Math.min(6, rollsOf(s));
      const t = REFORGE[kindOf(s.type)];
      const add = typeof t === 'function' ? t(r) : t ? t[r] || 0 : 0;
      return { ...s, value: num(s.value) + add };
    });
  }

  function wss(subs) {
    let v = 0;
    for (const s of subs || []) v += num(s.value) * (WSS_WEIGHT[s.type] || 0);
    return Math.round(v);
  }

  /** Remaining enhancement rolls before +15. */
  function rollsLeft(item) {
    const total = MAX_ROLLS_15[item.rank] || 9;
    const done = (item.subs || []).reduce((n, s) => n + rollsOf(s), 0);
    return Math.max(0, Math.min(total - done, Math.ceil((15 - num(item.enhance)) / 3)));
  }

  /** Slim every item in a gear.txt (Fribbels / RexQian fork export) and link it to a hero code. */
  function slimInventory(data, heroes) {
    const items = Array.isArray(data && data.items) ? data.items : [];
    const units = Array.isArray(data && data.heroes) ? data.heroes : [];
    const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    const byName = new Map(heroes.map((h) => [key(h.name), h]));
    const idToCode = new Map();
    for (const u of units) {
      const h = byName.get(key(u.name));
      if (!h) continue;
      for (const id of [u.id, u.ingameId]) if (id !== undefined && id !== null && id !== '') idToCode.set(String(id), h.code);
    }
    return items
      .filter((it) => it && it.gear && it.main)
      .map((it, i) => {
        const eq = it.ingameEquippedId && it.ingameEquippedId !== '0' ? idToCode.get(String(it.ingameEquippedId)) : it.equippedById ? idToCode.get(String(it.equippedById)) : null;
        const byNameCode = !eq && it.equippedByName ? (byName.get(key(it.equippedByName)) || {}).code : null;
        return {
          id: String(it.id || it.ingameId || `i${i}`),
          gear: it.gear,
          set: it.set || '',
          rank: it.rank || 'Epic',
          level: num(it.level),
          enhance: num(it.enhance),
          name: it.name || '',
          locked: !!it.locked,
          main: { type: it.main.type, value: num(it.main.value) },
          subs: (it.substats || []).filter((s) => s && s.type).map((s) => ({ type: s.type, value: num(s.value), rolls: Number(s.rolls) || undefined })),
          equipped: eq || byNameCode || null,
        };
      });
  }

  // ------------------------------------------------------------ hero profiles
  const ROLE_DEFAULT = {
    warrior: { Speed: 1, CriticalHitChancePercent: 1, CriticalHitDamagePercent: 1, AttackPercent: 0.9, Attack: 0.5, HealthPercent: 0.3 },
    assassin: { Speed: 1, CriticalHitChancePercent: 1, CriticalHitDamagePercent: 1, AttackPercent: 0.9, Attack: 0.5, HealthPercent: 0.2 },
    ranger: { Speed: 1, CriticalHitChancePercent: 1, CriticalHitDamagePercent: 0.9, AttackPercent: 0.9, Attack: 0.5, EffectivenessPercent: 0.3 },
    mage: { Speed: 1, AttackPercent: 0.9, CriticalHitChancePercent: 0.8, CriticalHitDamagePercent: 0.8, EffectivenessPercent: 0.6, Attack: 0.4 },
    knight: { Speed: 1, HealthPercent: 1, DefensePercent: 0.9, EffectResistancePercent: 0.8, Health: 0.5, Defense: 0.5 },
    manauser: { Speed: 1, HealthPercent: 0.9, EffectResistancePercent: 0.8, DefensePercent: 0.6, EffectivenessPercent: 0.6, Health: 0.4 },
  };

  /**
   * What stats a hero wants. Mix of
   *   'your build'    which substats the hero's current gear rolled into
   *   'class default' a sensible default for its class
   *   'your setting'  your own override (wins if set)
   * Plus preferred main stats (Necklace/Ring/Boots) and sets from the current gear.
   */
  function heroProfile(code, role, equippedItems, override) {
    const fromRole = ROLE_DEFAULT[role] || ROLE_DEFAULT.warrior;
    const rolls = {};
    let total = 0;
    for (const it of equippedItems || []) {
      for (const s of it.subs || []) {
        const r = rollsOf(s);
        rolls[s.type] = (rolls[s.type] || 0) + r;
        total += r;
      }
    }
    const weights = {};
    const sources = {};
    for (const type of Object.keys(STATS)) {
      const r = fromRole[type] || 0;
      const b = total ? Math.min(1, ((rolls[type] || 0) / total) * 4) : null; // a stat with 25%+ of the rolls = 1
      let w = b === null ? r : 0.5 * r + 0.5 * b;
      let src = b === null ? 'class default' : 'your build + class default';
      if (type === 'Speed') w = Math.max(w, 1); // speed always matters in RTA
      if (override && typeof override[type] === 'number') {
        w = override[type];
        src = 'your setting';
      }
      weights[type] = Math.round(w * 100) / 100;
      sources[type] = src;
    }
    const mains = {};
    for (const it of equippedItems || []) if (MAIN_SLOTS.includes(it.gear)) mains[it.gear] = it.main.type;
    const setCounts = {};
    for (const it of equippedItems || []) if (it.set) setCounts[it.set] = (setCounts[it.set] || 0) + 1;
    return { code, role, weights, sources, mains, sets: Object.keys(setCounts).filter((s) => setCounts[s] >= 2) };
  }

  /** How well an item suits a hero (higher = better). Uses reforged values for level-85 items at +15. */
  function fit(item, profile) {
    const subs = num(item.enhance) >= 15 ? reforgedSubs(item) : item.subs;
    let v = 0;
    for (const s of subs || []) v += num(s.value) * (WSS_WEIGHT[s.type] || 0) * (profile.weights[s.type] || 0);
    if (MAIN_SLOTS.includes(item.gear)) {
      const want = profile.mains[item.gear];
      const mt = item.main.type;
      if (want && mt === want) v += 10;
      else if ((profile.weights[mt] || 0) >= 0.8) v += 4;
      else v -= 15;
    }
    if (item.set && profile.sets.includes(item.set)) v += 5;
    return Math.round(v * 10) / 10;
  }

  const DEFAULT_RULES = { keepWss: 60, reforgeWss: 60, speedKeep: 12, upgradeMargin: 3 };

  /**
   * Evaluate one item against all hero profiles.
   * profiles: [{ code, ...profile }], equippedBy: Map code -> { [gear]: item }
   * Returns { item, wss, reforgedWss, potential, best: [{code, fit, delta}], verdict, reason }
   */
  function evaluate(item, profiles, equippedBy, rules = DEFAULT_RULES) {
    const R = { ...DEFAULT_RULES, ...rules };
    const now = wss(item.subs);
    const ref = isReforgeable(item) ? wss(reforgedSubs(item)) : now;
    const left = rollsLeft(item);
    const potential = { expected: now + left * WSS_PER_ROLL, best: now + left * 8, rollsLeft: left };
    const best = profiles
      .map((p) => {
        const f = fit(item, p);
        const cur = equippedBy.get(p.code) && equippedBy.get(p.code)[item.gear];
        const curFit = cur && cur.id !== item.id ? fit(cur, p) : cur ? f : 0;
        return { code: p.code, fit: f, delta: Math.round((f - curFit) * 10) / 10, current: cur ? cur.id : null };
      })
      .sort((a, b) => b.delta - a.delta || b.fit - a.fit)
      .slice(0, 3);
    const top = best[0];
    const speed = (item.subs || []).filter((s) => s.type === 'Speed').reduce((n, s) => n + num(s.value), 0);
    let verdict;
    let reason;
    const highLevel = item.level >= 85;
    const dump = highLevel ? 'extract' : 'sell';
    if (item.equipped) {
      const other = best.find((b) => b.code !== item.equipped && b.delta > 8);
      verdict = 'keep';
      reason = other ? `Equipped — would be an even bigger upgrade on another hero (+${other.delta})` : 'Equipped';
    } else if (num(item.enhance) >= 15) {
      if (top && top.delta > R.upgradeMargin) {
        verdict = 'keep';
        reason = `Upgrade for a hero (+${top.delta} fit)`;
      } else if (speed >= R.speedKeep) {
        verdict = 'keep';
        reason = `Speed piece (${speed} speed)`;
      } else if (isReforgeable(item) && ref >= R.reforgeWss) {
        verdict = 'reforge';
        reason = `Gear score ${now} → ${ref} after reforge`;
      } else if (now >= R.keepWss) {
        verdict = 'keep';
        reason = `Good gear score (${now})`;
      } else {
        verdict = dump;
        reason = `Low gear score (${ref}) and not an upgrade for anyone`;
      }
    } else if (potential.expected >= R.keepWss || (speed >= 4 && item.rank === 'Epic') || (top && top.delta > R.upgradeMargin + 5)) {
      verdict = 'enhance';
      reason = `${left} roll${left === 1 ? '' : 's'} left: expected ~${potential.expected}, best ~${potential.best}${speed ? `, already ${speed} speed` : ''}`;
    } else {
      verdict = dump;
      reason = `Even a good outcome (~${potential.best}) stays below ${R.keepWss}`;
    }
    return { item, wss: now, reforgedWss: ref, potential, best, verdict, reason };
  }

  /** Evaluate the whole inventory. heroes: official list (code, role). */
  function evaluateAll(items, heroes, overrides = {}, rules = DEFAULT_RULES, { onlyOwned = null } = {}) {
    const byHero = new Map();
    for (const it of items) if (it.equipped) {
      if (!byHero.has(it.equipped)) byHero.set(it.equipped, {});
      byHero.get(it.equipped)[it.gear] = it;
    }
    const codes = new Set([...byHero.keys(), ...(onlyOwned || [])]);
    const roleOf = new Map(heroes.map((h) => [h.code, h.role]));
    const profiles = [...codes].map((code) => heroProfile(code, roleOf.get(code), Object.values(byHero.get(code) || {}), overrides[code]));
    return { profiles, results: items.map((it) => evaluate(it, profiles, byHero, rules)) };
  }

  const api = { STATS, WSS_WEIGHT, REFORGE, MAX_ROLLS_15, DEFAULT_RULES, ROLE_DEFAULT, rollsOf, isReforgeable, reforgedSubs, wss, rollsLeft, slimInventory, heroProfile, fit, evaluate, evaluateAll };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RTAGearSort = api;
})(typeof window !== 'undefined' ? window : globalThis);
