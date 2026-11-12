/*
 * Hero roster: official list, Fribbels gear.txt import, CSV match import.
 * Pure functions (no DOM). Browser: window.RTARoster. Node: require().
 *
 * Every hero record carries `source` so data from different places is never
 * mixed up:  'official'  = Smilegate's public hero list
 *            'custom'    = heroes you added yourself
 */
(function (root) {
  const OFFICIAL_HERO_URL = 'https://static.smilegatemegaport.com/gameRecord/epic7/epic7_hero.json';
  const PORTRAIT_URL = (code) => `https://static.smilegatemegaport.com/event/live/epic7/guide/images/hero/${code}_s.png`;

  // In-game codes -> labels shown to players.
  const ELEMENT_LABEL = { fire: 'Fire', ice: 'Ice', wind: 'Earth', light: 'Light', dark: 'Dark' };
  const ROLE_LABEL = { warrior: 'Warrior', knight: 'Knight', assassin: 'Thief', ranger: 'Ranger', mage: 'Mage', manauser: 'Soul Weaver' };
  const ELEMENTS = Object.keys(ELEMENT_LABEL);
  const ROLES = Object.keys(ROLE_LABEL);

  /** Convert Smilegate's JSON ({en:[...], ko:[...]}) into our hero records. */
  function normalizeOfficial(raw, lang = 'en') {
    const list = raw && (raw[lang] || raw.en);
    if (!Array.isArray(list)) throw new Error('Unexpected hero list format.');
    const seen = new Set();
    const out = [];
    for (const h of list) {
      if (!h || typeof h.code !== 'string' || !/^c[1-9]\d{3}$/.test(h.code)) continue; // skip NPC/test entries
      if (seen.has(h.code)) continue;
      seen.add(h.code);
      out.push({
        code: h.code,
        name: String(h.name || h.code),
        element: ELEMENTS.includes(h.attribute_cd) ? h.attribute_cd : 'fire',
        role: ROLES.includes(h.job_cd) ? h.job_cd : 'warrior',
        grade: Number(h.grade) || 0,
        source: 'official',
      });
    }
    return out;
  }

  /** Normalise a name for matching: case, accents, punctuation and spaces ignored. */
  function normName(s) {
    return String(s || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9぀-ヿ㐀-鿿가-힯]+/g, '');
  }

  function nameIndex(heroes) {
    const m = new Map();
    for (const h of heroes) m.set(normName(h.name), h);
    return m;
  }

  /** Find a hero by name or code. Returns the hero or null. */
  function findHero(nameOrCode, heroes, index) {
    if (!nameOrCode) return null;
    const s = String(nameOrCode).trim();
    const byCode = heroes.find((h) => h.code === s);
    if (byCode) return byCode;
    return (index || nameIndex(heroes)).get(normName(s)) || null;
  }

  /**
   * Parse a Fribbels optimizer export (gear.txt / autosave.json).
   * The file is JSON: { heroes: [{ name, stars, ... }], items: [...] }.
   * Returns { heroes: [{code, name, stars}], unmatched: [names], itemCount }.
   */
  function parseFribbels(text, heroes) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error('This file is not valid JSON. Export it again from the Fribbels optimizer.');
    }
    const list = Array.isArray(data && data.heroes) ? data.heroes : null;
    if (!list) throw new Error('No "heroes" list found in this file.');
    const idx = nameIndex(heroes);
    const out = new Map();
    const unmatched = new Set();
    for (const h of list) {
      const name = h && (h.name || (h.data && h.data.name));
      const hero = findHero(h && h.code, heroes, idx) || findHero(name, heroes, idx);
      if (!hero) {
        if (name) unmatched.add(String(name));
        continue;
      }
      const stars = Number(h.stars) || 0;
      const prev = out.get(hero.code);
      if (!prev || stars > prev.stars) out.set(hero.code, { code: hero.code, name: hero.name, stars });
    }
    return {
      heroes: [...out.values()].sort((a, b) => a.name.localeCompare(b.name)),
      unmatched: [...unmatched].sort(),
      itemCount: Array.isArray(data.items) ? data.items.length : 0,
    };
  }

  /**
   * CSV match import. Header row required. Columns (any order):
   *   result (win/loss), opponent, first_pick (me/opp), date,
   *   my_prebans, opp_prebans, my_picks, opp_picks, i_banned, they_banned, notes
   * Hero lists are separated by "|" or ";". Names or codes both work.
   */
  function parseMatchCsv(text, heroes) {
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error('CSV needs a header row and at least one match.');
    const head = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const col = (name) => head.indexOf(name);
    if (col('result') < 0 || col('my_picks') < 0 || col('opp_picks') < 0) {
      throw new Error('CSV must have at least: result, my_picks, opp_picks.');
    }
    const idx = nameIndex(heroes);
    const unknown = new Set();
    const list = (cell) =>
      String(cell || '')
        .split(/[|;]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const h = findHero(s, heroes, idx);
          if (!h) unknown.add(s);
          return h ? h.code : null;
        })
        .filter(Boolean);
    const get = (r, name) => (col(name) >= 0 ? (r[col(name)] || '').trim() : '');
    const matches = [];
    rows.slice(1).forEach((r, i) => {
      if (r.every((c) => !String(c).trim())) return;
      const res = get(r, 'result').toLowerCase();
      if (!['win', 'loss', 'w', 'l'].includes(res)) throw new Error(`Row ${i + 2}: result must be win or loss.`);
      const one = (name) => list(get(r, name))[0] || null;
      matches.push({
        date: get(r, 'date') || null,
        result: res.startsWith('w') ? 'win' : 'loss',
        opponent: get(r, 'opponent'),
        firstPick: get(r, 'first_pick').toLowerCase().startsWith('o') ? 'opp' : 'me',
        myPrebans: list(get(r, 'my_prebans')),
        oppPrebans: list(get(r, 'opp_prebans')),
        myPicks: list(get(r, 'my_picks')),
        oppPicks: list(get(r, 'opp_picks')),
        iBanned: one('i_banned'),
        theyBanned: one('they_banned'),
        notes: get(r, 'notes'),
      });
    });
    return { matches, unknown: [...unknown].sort() };
  }

  /** Small RFC-4180-ish CSV parser (quotes, commas, newlines in quotes). */
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let q = false;
    const s = String(text).replace(/^﻿/, '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (c === '"' && s[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') {
        row.push(cell);
        cell = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows;
  }

  const api = {
    OFFICIAL_HERO_URL,
    PORTRAIT_URL,
    ELEMENT_LABEL,
    ROLE_LABEL,
    ELEMENTS,
    ROLES,
    normalizeOfficial,
    normName,
    nameIndex,
    findHero,
    parseFribbels,
    parseMatchCsv,
    parseCsv,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RTARoster = api;
})(typeof window !== 'undefined' ? window : globalThis);
