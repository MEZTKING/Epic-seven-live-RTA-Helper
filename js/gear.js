/*
 * Gear & builds. Pure (no DOM). Browser: window.RTAGear. Node: require().
 *
 * Sources (kept apart):
 *   'fribbels-data'  hero base stats + artifact list (data used by the RexQian fork of the Fribbels optimizer)
 *   'fribbels'       YOUR gear.txt (exported by that optimizer): which items each of your heroes wears
 *
 * Speed is calculated exactly the way the game adds it up:
 *   base speed (6 stars, awakened) x (1 + 25% Speed set + 12% Revenge set) + flat speed on gear
 * Not included (not in gear.txt): exclusive equipment speed bonus. Heroes whose
 * EE can give speed are flagged.
 */
(function (root) {
  /*
   * Data comes from the maintained RexQian fork of the Fribbels optimizer
   * (github.com/RexQian/Fribbels-Epic-7-Optimizer). The fork itself loads its
   * hero/artifact data from this S3 bucket; its GitHub copy is the fallback.
   */
  const FORK_REPO = 'https://github.com/RexQian/Fribbels-Epic-7-Optimizer';
  const HERO_STATS_URL = 'https://e7-optimizer-game-data.s3-accelerate.amazonaws.com/herodata.json';
  const ARTIFACT_URL = 'https://e7-optimizer-game-data.s3-accelerate.amazonaws.com/artifactdata.json';
  const HERO_STATS_FALLBACK = 'https://raw.githubusercontent.com/RexQian/Fribbels-Epic-7-Optimizer/main/data/cache/herodata.json';
  const ARTIFACT_FALLBACK = 'https://raw.githubusercontent.com/RexQian/Fribbels-Epic-7-Optimizer/main/data/cache/artifactdata.json';

  // Fribbels set ids -> display names, and pieces needed for the bonus.
  const SETS = {
    SpeedSet: ['Speed', 4],
    AttackSet: ['Attack', 4],
    DestructionSet: ['Destruction', 4],
    LifestealSet: ['Lifesteal', 4],
    CounterSet: ['Counter', 4],
    RageSet: ['Rage', 4],
    RevengeSet: ['Revenge', 4],
    InjurySet: ['Injury', 4],
    HealthSet: ['Health', 2],
    DefenseSet: ['Defense', 2],
    CriticalSet: ['Critical', 2],
    HitSet: ['Hit', 2],
    ResistSet: ['Resist', 2],
    UnitySet: ['Unity', 2],
    ImmunitySet: ['Immunity', 2],
    PenetrationSet: ['Penetration', 2],
    ProtectionSet: ['Protection', 2],
    TorrentSet: ['Torrent', 2],
    ReversalSet: ['Reversal', 4],
    RiposteSet: ['Riposte', 4],
    PursuitSet: ['Pursuit', 2],
    WarfareSet: ['Warfare', 2],
    WeakeningSet: ['Weakening', 2],
    FervorSet: ['Fervor', 2],
  };
  const SET_NAMES = Object.values(SETS).map(([n]) => n);
  const SPEED_BONUS = { SpeedSet: 0.25, RevengeSet: 0.12 };
  const GEAR_SLOTS = ['Weapon', 'Helmet', 'Armor', 'Necklace', 'Ring', 'Boots'];

  /** herodata.json (keyed by name) -> { [code]: { name, spd, hp, atk, def, chc, chd, eff, efr, eeSpeed } } */
  function normalizeHeroStats(raw) {
    const out = {};
    for (const h of Object.values(raw || {})) {
      if (!h || !h.code) continue;
      const s = (h.calculatedStatus && (h.calculatedStatus.lv60SixStarFullyAwakened || h.calculatedStatus.lv50FiveStarFullyAwakened)) || null;
      if (!s || !s.spd) continue;
      const ee = Array.isArray(h.ex_equip) ? h.ex_equip : [];
      out[h.code] = {
        name: h.name,
        spd: s.spd,
        hp: s.hp,
        atk: s.atk,
        def: s.def,
        chc: s.chc,
        chd: s.chd,
        eff: s.eff,
        efr: s.efr,
        eeSpeed: ee.some((e) => e && e.stat && e.stat.type === 'speed') || undefined,
      };
    }
    return out;
  }

  function normalizeArtifacts(raw) {
    return Object.values(raw || {})
      .filter((a) => a && a.name)
      .map((a) => ({ code: a.code || '', name: a.name, role: a.role || '', rarity: a.rarity || 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const num = (x) => (typeof x === 'number' ? x : Number(x) || 0);
  const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

  /**
   * Pull each of your heroes' equipped items and artifact out of a Fribbels
   * export. heroes = official hero list (to map names -> codes).
   * Returns { [code]: { ingameId, artifact, items: [{gear,set,main:{type,value},subs:[{type,value}]}] } }
   */
  function extractBuilds(data, heroes) {
    const items = Array.isArray(data && data.items) ? data.items : [];
    const units = Array.isArray(data && data.heroes) ? data.heroes : [];
    const byName = new Map(heroes.map((h) => [nameKey(h.name), h]));
    const byCode = new Map(heroes.map((h) => [h.code, h]));
    const slim = (it) => ({
      gear: it.gear || '',
      set: it.set || '',
      main: it.main ? { type: it.main.type, value: num(it.main.value) } : null,
      subs: (it.substats || []).filter((s) => s && s.type).map((s) => ({ type: s.type, value: num(s.value) })),
    });
    const builds = {};
    for (const u of units) {
      const hero = (u.code && byCode.get(u.code)) || byName.get(nameKey(u.name));
      if (!hero) continue;
      const ids = new Set([u.id, u.ingameId].filter((x) => x !== undefined && x !== null && x !== '').map(String));
      const mine = items.filter(
        (it) =>
          (it.ingameEquippedId && it.ingameEquippedId !== '0' && ids.has(String(it.ingameEquippedId))) ||
          (it.equippedById && ids.has(String(it.equippedById))) ||
          (it.equippedByName && nameKey(it.equippedByName) === nameKey(u.name) && !it.ingameEquippedId),
      );
      const artifact = typeof u.artifact === 'string' ? u.artifact : (u.artifact && u.artifact.name) || u.artifactName || '';
      const b = { ingameId: [...ids][0] || '', artifact, items: mine.map(slim) };
      // duplicates of the same hero: keep the copy wearing the most gear
      if (!builds[hero.code] || builds[hero.code].items.length < b.items.length) builds[hero.code] = b;
    }
    return builds;
  }

  function setCounts(items) {
    const c = {};
    for (const it of items) if (it.set) c[it.set] = (c[it.set] || 0) + 1;
    return c;
  }

  /** Completed set bonuses, e.g. ['Speed', 'Critical']. */
  function completedSets(items) {
    const out = [];
    for (const [id, n] of Object.entries(setCounts(items))) {
      const [label, need] = SETS[id] || [id.replace(/Set$/, ''), 2];
      for (let k = 0; k < Math.floor(n / need); k++) out.push(label);
    }
    return out;
  }

  function flatTotals(items) {
    const t = {};
    for (const it of items) for (const s of [it.main, ...(it.subs || [])]) if (s && s.type) t[s.type] = (t[s.type] || 0) + num(s.value);
    return t;
  }

  /** Full speed calculation for one of your heroes. */
  function computeBuild(code, build, statsByCode) {
    const base = statsByCode && statsByCode[code];
    const items = (build && build.items) || [];
    const counts = setCounts(items);
    let bonus = 0;
    for (const [id, pct] of Object.entries(SPEED_BONUS)) if ((counts[id] || 0) >= 4) bonus += pct;
    const flat = flatTotals(items);
    const flatSpeed = flat.Speed || 0;
    const speed = base ? Math.floor(base.spd * (1 + bonus) + flatSpeed) : null;
    return {
      code,
      speed,
      baseSpeed: base ? base.spd : null,
      flatSpeed,
      setBonusSpeed: base ? Math.floor(base.spd * bonus) : 0,
      sets: completedSets(items),
      artifact: (build && build.artifact) || '',
      itemCount: items.length,
      flat,
      eeSpeedPossible: !!(base && base.eeSpeed),
      note: !base ? 'No base stats for this hero.' : items.length < 6 ? `Only ${items.length}/6 items equipped in gear.txt.` : '',
    };
  }

  const api = { FORK_REPO, HERO_STATS_URL, ARTIFACT_URL, HERO_STATS_FALLBACK, ARTIFACT_FALLBACK, SETS, SET_NAMES, GEAR_SLOTS, normalizeHeroStats, normalizeArtifacts, extractBuilds, setCounts, completedSets, flatTotals, computeBuild };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RTAGear = api;
})(typeof window !== 'undefined' ? window : globalThis);
