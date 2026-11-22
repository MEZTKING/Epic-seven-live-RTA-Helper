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
    const byCode = new Map(heroes.map((h) => [h.code, h]));
    for (const u of units) {
      // the auto importer's units carry the game's hero code (DEVLOG #88); else by name
      const h = (u.code && byCode.get(u.code)) || byName.get(key(u.name));
      if (!h) continue;
      for (const id of [u.id, u.ingameId]) if (id !== undefined && id !== null && id !== '') idToCode.set(String(id), h.code);
    }
    return items
      .filter((it) => it && it.gear && it.main)
      .map((it, i) => {
        const eq = it.ingameEquippedId && it.ingameEquippedId !== '0' ? idToCode.get(String(it.ingameEquippedId)) : it.equippedById ? idToCode.get(String(it.equippedById)) : null;
        const byNameCode = !eq && it.equippedByName ? (byName.get(key(it.equippedByName)) || {}).code : null;
        return {
          // the game's own id first (DEVLOG #94): the optimizer's autosave gives its own ids, the game's stay the same
          id: String(it.ingameId || it.id || `i${i}`),
          gear: it.gear,
          set: it.set || '',
          rank: it.rank || 'Epic',
          level: num(it.level),
          enhance: num(it.enhance),
          name: it.name && it.name !== 'Unknown' ? it.name : '',
          // the game's design code (auto importer, DEVLOG #88): items with one code share one picture
          design: it.code ? String(it.code) : undefined,
          locked: !!(it.locked || it.l === true), // the auto importer's own field is `l` (DEVLOG #93)
          main: { type: it.main.type, value: num(it.main.value) },
          subs: (it.substats || []).filter((s) => s && s.type).map((s) => ({ type: s.type, value: num(s.value), rolls: Number(s.rolls) || undefined })),
          equipped: eq || byNameCode || null,
          // which copy of the hero (two copies of one hero have one code), DEVLOG #88
          ...(eq && it.ingameEquippedId && it.ingameEquippedId !== '0' ? { unit: String(it.ingameEquippedId) } : {}),
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

  // scoreMode (DEVLOG #83): which gear score the app shows: 'game' = Epic Seven's own Equipment Score (default), 'wss' =
  // the Fribbels / RexQian gear score. The rules stay in gear score (WSS) inside; the Gear page shows them in the chosen one.
  const PER_SLOT = 2; // upgrade candidates per hero and slot (DEVLOG #90)
  const DEFAULT_RULES = { keepWss: 60, reforgeWss: 60, speedKeep: 12, upgradeMargin: 3, scoreMode: 'game' };

  /*
   * Epic Seven's Equipment Score (DEVLOG #83). Not published by the game; worked out from 41 of the owner's items whose
   * score the game shows (two Full screens + nine item panels): the substats' gear score (WSS, above) + the main stat
   * weighed by how far it has grown: 26 × (main ÷ its value at +15) − 1. All 41 within 1.3 of the game's number.
   * When the game's number was read from the screen (item.gameScore), that one is used.
   */
  const MAIN_AT_15 = { Attack: { 85: 500, 88: 515, 90: 525 }, Health: { 85: 2700, 88: 2765, 90: 2835 }, Defense: { 85: 300, 88: 310, 90: 315 }, Speed: { 85: 45, 88: 46, 90: 47 } };
  const PCT_AT_15 = { 85: 60, 88: 62, 90: 65 };
  function mainShare(item) {
    const m = item && item.main;
    if (!m) return 0;
    const lv = [85, 88, 90].includes(Number(item.level)) ? Number(item.level) : 85;
    const top = (MAIN_AT_15[m.type] || {})[lv] || PCT_AT_15[lv];
    return top ? Math.min(1, num(m.value) / top) : 0;
  }
  const GAME_MAIN = 26;
  /** The game's Equipment Score of an item: the number read from the screen, else the estimate. */
  function gameScore(item) {
    if (item && Number(item.gameScore) > 0) return Number(item.gameScore);
    return Math.max(0, Math.round(wssExact(item && item.subs) + GAME_MAIN * mainShare(item) - 1));
  }
  /** A gear score (WSS) at +15 as the game would show it (the main stat at its +15 value). */
  const gameAt15 = (w) => Math.round(w + GAME_MAIN - 1);
  function wssExact(subs) {
    let v = 0;
    for (const s of subs || []) v += num(s.value) * (WSS_WEIGHT[s.type] || 0);
    return v;
  }

  /**
   * Evaluate one item against all hero profiles.
   * profiles: [{ code, ...profile }], equippedBy: Map code -> { [gear]: item }
   * Returns { item, wss, reforgedWss, potential, best: [{code, fit, delta}], verdict, reason }
   */
  function evaluate(item, profiles, equippedBy, rules = DEFAULT_RULES, allowed = null) {
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
      // allowed (DEVLOG #90): only the best few items per hero and slot count as that hero's upgrade
      .map((b) => (allowed && b.delta > R.upgradeMargin && !allowed.has(`${b.code}|${item.gear}|${item.id}`) ? { ...b, delta: Math.min(b.delta, R.upgradeMargin), capped: true } : b))
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
  // only (DEVLOG #86): the heroes you are gearing; when given, suggestions consider only them
  // skip (DEVLOG #90): heroes you don't gear: never a suggestion's target (their worn items stay theirs)
  function evaluateAll(items, heroes, overrides = {}, rules = DEFAULT_RULES, { onlyOwned = null, only = null, skip = null } = {}) {
    const byHero = new Map();
    for (const it of items) if (it.equipped) {
      if (!byHero.has(it.equipped)) byHero.set(it.equipped, {});
      byHero.get(it.equipped)[it.gear] = it;
    }
    const codes = only && only.length ? new Set(only) : new Set([...byHero.keys(), ...(onlyOwned || [])]);
    for (const c of skip || []) codes.delete(c);
    const roleOf = new Map(heroes.map((h) => [h.code, h.role]));
    const profiles = [...codes].map((code) => heroProfile(code, roleOf.get(code), Object.values(byHero.get(code) || {}), overrides[code]));
    // A slot holds one item: a hero is an upgrade target for at most PER_SLOT items in each slot, the ones that fit
    // best. Before (DEVLOG #90), a hero with an empty slot made every item of that slot "an upgrade" (on the owner's
    // gear.txt: 572 spare items kept, 54 of them for one hero's two empty slots).
    const R = { ...DEFAULT_RULES, ...rules };
    const first = items.map((it) => evaluate(it, profiles, byHero, rules));
    const bySlot = new Map();
    for (const r of first)
      for (const b of r.best)
        if (b.delta > R.upgradeMargin && b.code !== r.item.equipped) {
          const k = `${b.code}|${r.item.gear}`;
          if (!bySlot.has(k)) bySlot.set(k, []);
          bySlot.get(k).push({ id: r.item.id, fit: b.fit });
        }
    const allowed = new Set();
    for (const [k, l] of bySlot) for (const x of l.sort((a, b) => b.fit - a.fit).slice(0, PER_SLOT)) allowed.add(`${k}|${x.id}`);
    return { profiles, results: items.map((it) => evaluate(it, profiles, byHero, rules, allowed)) };
  }

  const api = { STATS, WSS_WEIGHT, REFORGE, MAX_ROLLS_15, DEFAULT_RULES, MAIN_AT_15, mainShare, gameScore, gameAt15, ROLE_DEFAULT, rollsOf, isReforgeable, reforgedSubs, wss, rollsLeft, slimInventory, heroProfile, fit, evaluate, evaluateAll };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RTAGearSort = api;
})(typeof window !== 'undefined' ? window : globalThis);
