/*
 * Turns text read from the game's item details panel (OCR) into an item in the
 * same shape the Fribbels / RexQian fork export uses, so the Gear Sorter and
 * the RTA speed calculation can use it directly.
 * Pure (no DOM). Browser: window.RTAStatParse. Node: require().
 *
 * OCR text is messy ("Crit1cal Hit Chance 12 %", "Spead 18"), so names are
 * matched loosely and every line is checked for a sensible value range.
 */
(function (root) {
  // stat words -> [flat type, percent type]
  const STAT_WORDS = [
    [['critical hit chance', 'crit chance', 'crit rate', 'critical chance', 'crit. chance'], 'CriticalHitChancePercent', 'CriticalHitChancePercent'],
    [['critical hit damage', 'crit damage', 'crit dmg', 'critical damage', 'crit. damage'], 'CriticalHitDamagePercent', 'CriticalHitDamagePercent'],
    [['effect resistance', 'effect resist', 'resistance', 'eff res', 'res'], 'EffectResistancePercent', 'EffectResistancePercent'],
    [['effectiveness', 'eff'], 'EffectivenessPercent', 'EffectivenessPercent'],
    [['dual attack chance', 'dual attack'], 'DualAttackChancePercent', 'DualAttackChancePercent'],
    [['speed', 'spd'], 'Speed', 'Speed'],
    [['attack', 'atk'], 'Attack', 'AttackPercent'],
    [['defense', 'defence', 'def'], 'Defense', 'DefensePercent'],
    [['health', 'hp'], 'Health', 'HealthPercent'],
  ];
  // plausible ranges (main stats up to +15 at level 90 included)
  const RANGE = {
    AttackPercent: [1, 70], HealthPercent: [1, 70], DefensePercent: [1, 70], EffectivenessPercent: [1, 70], EffectResistancePercent: [1, 70],
    CriticalHitChancePercent: [1, 65], CriticalHitDamagePercent: [1, 80], Speed: [1, 50], DualAttackChancePercent: [1, 50],
    Attack: [10, 600], Health: [50, 3200], Defense: [10, 360],
  };
  const SET_WORDS = {
    speed: 'SpeedSet', attack: 'AttackSet', destruction: 'DestructionSet', lifesteal: 'LifestealSet', counter: 'CounterSet',
    rage: 'RageSet', revenge: 'RevengeSet', injury: 'InjurySet', health: 'HealthSet', defense: 'DefenseSet', critical: 'CriticalSet',
    hit: 'HitSet', resist: 'ResistSet', unity: 'UnitySet', immunity: 'ImmunitySet', penetration: 'PenetrationSet',
    protection: 'ProtectionSet', torrent: 'TorrentSet', reversal: 'ReversalSet', riposte: 'RiposteSet', pursuit: 'PursuitSet',
    warfare: 'WarfareSet', weakening: 'WeakeningSet', fervor: 'FervorSet',
  };
  const GEAR_WORDS = { weapon: 'Weapon', helmet: 'Helmet', helm: 'Helmet', armor: 'Armor', armour: 'Armor', necklace: 'Necklace', ring: 'Ring', boots: 'Boots' };
  const RANKS = ['Epic', 'Heroic', 'Rare', 'Good', 'Normal'];

  /** Common OCR slips in words: digits read inside letters. */
  function cleanWords(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/(?<=[a-z])[1|](?=[a-z])/g, 'i')
      .replace(/(?<=[a-z])0(?=[a-z])/g, 'o')
      .replace(/(?<=[a-z])5(?=[a-z])/g, 's')
      .replace(/[^a-z%. ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function lev(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  /** Does the cleaned text contain `word` (allowing ~1 typo per 5 letters)? */
  function hasWord(text, word) {
    if (text.includes(word)) return true;
    if (word.length < 5) return false;
    const toks = text.split(' ');
    const n = word.split(' ').length;
    for (let i = 0; i + n <= toks.length; i++) {
      const chunk = toks.slice(i, i + n).join(' ');
      if (lev(chunk, word) <= Math.floor(word.length / 5)) return true;
    }
    return false;
  }

  /** "Speed 18" / "Attack 12%" / "Crit Damage +14 %" -> { type, value } or null */
  function parseStatLine(text) {
    const raw = String(text || '');
    // the value: the LAST number standing on its own (not a digit misread inside a word like "Crit1cal")
    const plain = raw.replace(/(\d),(\d)/g, '$1$2');
    const nums = [...plain.matchAll(/(?<![A-Za-z\d.])(\d+(?:\.\d+)?)\s*(%?)(?![A-Za-z])/g)];
    const m = nums[nums.length - 1];
    if (!m) return null;
    const value = Math.round(parseFloat(m[1]));
    const percent = m[2] === '%' || /%/.test(raw);
    const words = cleanWords(plain.slice(0, m.index) + ' ' + plain.slice(m.index + m[0].length));
    for (const [names, flat, pct] of STAT_WORDS) {
      if (!names.some((w) => (w.length <= 3 ? new RegExp(`(^| )${w.replace('.', '\\.')}( |$)`).test(words) : hasWord(words, w)))) continue;
      const type = percent ? pct : flat;
      const [lo, hi] = RANGE[type];
      if (value < lo || value > hi) return null;
      return { type, value };
    }
    return null;
  }

  function parseSet(text) {
    const t = cleanWords(text);
    for (const [w, id] of Object.entries(SET_WORDS)) if (new RegExp(`(^| )${w}( set|$| )`).test(t) || hasWord(t, w + ' set')) return id;
    return null;
  }
  function parseGear(text) {
    const t = cleanWords(text);
    for (const [w, id] of Object.entries(GEAR_WORDS)) if (new RegExp(`(^| )${w}( |$)`).test(t)) return id;
    return null;
  }
  function parseEnhance(text) {
    const m = String(text || '').match(/\+\s*(\d{1,2})/);
    const n = m ? Number(m[1]) : null;
    return n !== null && n <= 15 ? n : null;
  }
  function parseLevel(text) {
    const m = String(text || '').match(/(?:lv\.?|level)\s*(\d{2,3})/i) || String(text || '').match(/\b(5[0-9]|[6-8][0-9]|90)\b/);
    const n = m ? Number(m[1]) : null;
    return n && n >= 1 && n <= 100 ? n : null;
  }
  function parseRank(text) {
    const t = cleanWords(text);
    return RANKS.find((r) => t.includes(r.toLowerCase())) || null;
  }

  /**
   * readings: { gear, set, rank, level, enhance, main, subs: [4 texts] } (raw OCR text for each box)
   * Returns { item, problems: [] }. item is null when the reading is unusable.
   */
  function itemFromReadings(r) {
    const problems = [];
    const main = parseStatLine(r.main);
    const subs = (r.subs || []).map(parseStatLine).filter(Boolean);
    const gear = parseGear(r.gear) || parseGear(r.set) || null;
    const set = parseSet(r.set) || parseSet(r.gear) || null;
    if (!main) problems.push('main stat not readable');
    if (subs.length < 2) problems.push(`only ${subs.length} substats readable`);
    if (!gear) problems.push('slot not readable');
    if (!set) problems.push('set not readable');
    const seen = new Set();
    for (const s of subs) {
      if (seen.has(s.type)) problems.push(`substat ${s.type} read twice`);
      seen.add(s.type);
    }
    if (main && seen.has(main.type) && main.type !== 'Speed') problems.push('main stat repeated in substats');
    if (!main || subs.length < 2) return { item: null, problems };
    const item = {
      gear: gear || 'Unknown',
      set: set || '',
      rank: parseRank(r.rank) || (subs.length >= 4 ? 'Epic' : 'Heroic'),
      level: parseLevel(r.level) || 85,
      enhance: parseEnhance(r.enhance) ?? 0,
      main,
      substats: subs,
      source: 'screen',
    };
    return { item, problems };
  }

  /** Same item read twice gives the same key (used to skip duplicates while browsing). */
  function itemKey(it) {
    return [it.gear, it.set, it.level, it.enhance, it.main.type, it.main.value, ...it.substats.map((s) => `${s.type}:${s.value}`)].join('|');
  }

  const api = { parseStatLine, parseSet, parseGear, parseEnhance, parseLevel, parseRank, itemFromReadings, itemKey, cleanWords };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RTAStatParse = api;
})(typeof window !== 'undefined' ? window : globalThis);
