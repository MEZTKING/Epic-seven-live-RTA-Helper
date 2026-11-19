/*
 * A hero's stats with a set of items, moving gear between heroes, gear presets (DEVLOG #79). Pure (Node + browser).
 * Browser: window.E7GearBuild.
 *
 * Stats are added up the way the RexQian fork of the Fribbels optimizer does (backend StatCalculator.java):
 *   attack / health / defense = base × (1 + gear % + set %) + flat gear
 *   speed = base × (1 + Speed 25 % / Revenge 12 % / Reversal 15 % / Weakening 15 % (4 pieces)) + flat speed (rounded down)
 *   crit chance (≤ 100), crit damage (≤ 350), effectiveness, resistance = base + gear + set
 *   sets: Health / Defense +20 % base per 2 pieces, Attack +45 % (4), Critical +12 per 2, Hit / Resist +20 per 2,
 *   Destruction +60 crit damage (4), Warfare +20 % health (4), Torrent −10 % health per 2.
 * base = the hero's level-60 six-star awakened stats (fribbels-data). Artifacts, exclusive equipment and imprints are
 * NOT in it (gear.txt and the screen don't give them): the numbers are close, not the game's exact ones.
 *
 *   SLOTS                                    the six slots in the game's order
 *   heroStats(base, items)                   -> { atk, hp, def, spd, chc, chd, eff, efr, sets: [{ set, n }] } | null
 *   diff(a, b)                               -> { atk: b-a, … }
 *   withItem(items, item)                    -> the items with `item` in its slot (the old one out)
 *   movesFor(hero, wanted, wearerOf)         -> [{ item, from, to }]  what to do in the game so `hero` wears `wanted`
 *                                               (wanted: { slot: item }, wearerOf(item) -> hero code | null)
 *   conflicts(presets, preset)               -> [{ item, preset }]   items this preset shares with other presets
 */
(function (root) {
  'use strict';
  const SLOTS = ['Weapon', 'Helmet', 'Armor', 'Necklace', 'Ring', 'Boots'];
  const SET_PIECES = {
    HealthSet: 2, DefenseSet: 2, AttackSet: 4, SpeedSet: 4, CriticalSet: 2, HitSet: 2, DestructionSet: 4, LifestealSet: 4, CounterSet: 4,
    ResistSet: 2, UnitySet: 2, RageSet: 4, ImmunitySet: 2, PenetrationSet: 2, RevengeSet: 4, InjurySet: 4, ProtectionSet: 4, TorrentSet: 2,
    ReversalSet: 4, RiposteSet: 4, WarfareSet: 4, PursuitSet: 2, WeakeningSet: 4, FervorSet: 2,
  };
  const num = (x) => Number(x) || 0;

  function heroStats(base, items) {
    if (!base) return null;
    const g = { atk: 0, atkP: 0, hp: 0, hpP: 0, def: 0, defP: 0, spd: 0, chc: 0, chd: 0, eff: 0, efr: 0 };
    const counts = {};
    const add = (s) => {
      if (!s) return;
      const v = num(s.value);
      const t = s.type;
      if (t === 'Attack') g.atk += v;
      else if (t === 'AttackPercent') g.atkP += v;
      else if (t === 'Health') g.hp += v;
      else if (t === 'HealthPercent') g.hpP += v;
      else if (t === 'Defense') g.def += v;
      else if (t === 'DefensePercent') g.defP += v;
      else if (t === 'Speed') g.spd += v;
      else if (t === 'CriticalHitChancePercent') g.chc += v;
      else if (t === 'CriticalHitDamagePercent') g.chd += v;
      else if (t === 'EffectivenessPercent') g.eff += v;
      else if (t === 'EffectResistancePercent') g.efr += v;
    };
    for (const it of items || []) {
      if (!it) continue;
      add(it.main);
      for (const s of it.subs || it.substats || []) add(s);
      if (it.set) counts[it.set] = (counts[it.set] || 0) + 1;
    }
    const pairs = (set) => Math.floor((counts[set] || 0) / 2);
    const four = (set) => ((counts[set] || 0) >= 4 ? 1 : 0);
    const atk = base.atk * (1 + g.atkP / 100 + 0.45 * four('AttackSet')) + g.atk;
    const hp = base.hp * (1 + g.hpP / 100 + 0.2 * pairs('HealthSet') + 0.2 * four('WarfareSet') - 0.1 * pairs('TorrentSet')) + g.hp;
    const def = base.def * (1 + g.defP / 100 + 0.2 * pairs('DefenseSet')) + g.def;
    const spdBonus = 0.25 * four('SpeedSet') + 0.12 * four('RevengeSet') + 0.15 * four('ReversalSet') + 0.15 * four('WeakeningSet');
    const spd = Math.floor(base.spd * (1 + spdBonus) + g.spd + 1e-6); // (100 × 1.15 is 114.999… in floating point)
    const chc = Math.min(100, Math.round(num(base.chc) * 100 + g.chc + 12 * pairs('CriticalSet')));
    const chd = Math.min(350, Math.round(num(base.chd) * 100 + g.chd + 60 * four('DestructionSet')));
    const eff = Math.round(num(base.eff) * 100 + g.eff + 20 * pairs('HitSet'));
    const efr = Math.round(num(base.efr) * 100 + g.efr + 20 * pairs('ResistSet'));
    const sets = Object.entries(counts)
      .map(([set, n]) => ({ set, n, full: Math.floor(n / (SET_PIECES[set] || 99)) }))
      .filter((x) => x.full > 0);
    return { atk: Math.round(atk), hp: Math.round(hp), def: Math.round(def), spd, chc, chd, eff, efr, sets };
  }
  const KEYS = ['atk', 'hp', 'def', 'spd', 'chc', 'chd', 'eff', 'efr'];
  function diff(a, b) {
    const out = {};
    for (const k of KEYS) out[k] = a && b ? b[k] - a[k] : 0;
    return out;
  }
  function withItem(items, item) {
    const out = (items || []).filter((x) => x && x.gear !== item.gear);
    out.push(item);
    return out;
  }
  function movesFor(hero, wanted, wearerOf) {
    const moves = [];
    for (const slot of SLOTS) {
      const it = wanted && wanted[slot];
      if (!it) continue;
      const from = wearerOf(it) || null;
      if (from === hero) continue;
      moves.push({ item: it, from, to: hero });
    }
    return moves;
  }
  function conflicts(presets, preset) {
    const out = [];
    for (const p of presets || []) {
      if (!p || p.id === preset.id) continue;
      for (const slot of SLOTS) {
        const id = preset.items && preset.items[slot];
        if (id && p.items && p.items[slot] === id) out.push({ item: id, preset: p });
      }
    }
    return out;
  }

  const api = { SLOTS, SET_PIECES, KEYS, heroStats, diff, withItem, movesFor, conflicts };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7GearBuild = api;
})(typeof self !== 'undefined' ? self : this);
