/*
 * Hero mechanics knowledge (DEVLOG #42). Pure (Node + browser). Browser: window.E7Know (built from
 * RTASources.e7datKnowledge, js/sources/e7dat-knowledge.js).
 *
 * Source: E7DaT's knowledge file (github.com/ohrgon-game/E7DaT, MIT; a fixed snapshot of 2026-11-14): mechanic tags per
 * hero (from skill descriptions), 23 rules "tag A blocks tag B", how top players reacted to them in 40,300 Legend/Emperor
 * games, their usual builds, and who usually moves first. Its own source label: 'E7DaT knowledge'. It only adds reasons
 * and cautions; it never replaces the owner's notes or what the app learned.
 *
 * The filters follow E7DaT's knowledge.py:
 *   - a "strict" rule (artifact-based: turn catch, ignoring damage sharing, first turn) only counts for hero pairs the
 *     records single out
 *   - a caution is dropped when the victim still does well against that mechanic (≥ HURT_OK pp), or when top players
 *     don't avoid that opponent (pick multiplier ≥ AVOID_OK)
 *   - a reason is dropped when top players pick the hero clearly LESS in that spot (multiplier < LIFT_LOW)
 *
 *   const K = E7Know.create(data)
 *   K.mechanics(code)                 -> [{ tag, label, artifact? }]
 *   K.versus(blockers, victims)       -> [{ rule, by, on, text, hurt, lift, pp }]   (hero codes; who blocks whom)
 *   K.notesFor(code, allies, enemies) -> { good: [...], bad: [...], score }          (enemies / allies: [{ code, name }])
 *   K.threats(codes)                  -> [{ code, tag, label }] the blocking mechanics a team brings (Guild War defenses)
 *   K.builds(code)                    -> [{ artifact, sets[], share, startCR, guard }]
 *   K.opener(code)                    -> { fastest, available, top3 } | null   (percentages)
 */
(function (root) {
  'use strict';
  const SOURCE = 'E7DaT knowledge';
  const HURT_OK = 1.5;
  const AVOID_OK = 0.8;
  const MIN_LIFT = 1.3;
  const LIFT_LOW = 0.8;
  const W = { good: 0.6, goodProven: 1.0, bad: -0.8, badProven: -1.2, maxGood: 2, maxBad: -2.4 };

  function create(data) {
    const d = data || {};
    const rules = d.rules || [];
    const tags = d.tags || {};
    const has = (code, tag) => (tags[code] || []).includes(tag);

    function mechanics(code) {
      const from = (d.tagFromArtifact || {})[code] || {};
      return (tags[code] || []).map((tag) => ({ tag, label: (d.labels || {})[tag] || tag, ...(from[tag] ? { artifact: from[tag] } : {}) }));
    }
    /** Which of `blockers` shuts down which of `victims` (lists of hero codes). */
    function versus(blockers, victims) {
      const out = [];
      rules.forEach((r, i) => {
        for (const b of blockers) {
          if (!has(b, r.by)) continue;
          for (const v of victims) {
            if (v === b || !has(v, r.on)) continue;
            const pair = !!(((d.pairLift || {})[b] || {})[i] || {})[v] || !!(((d.pairAvoid || {})[v] || {})[i] || {})[b];
            if (r.strict && !pair) continue;
            const lift = (d.lift || {})[b] && d.lift[b][i] ? d.lift[b][i][0] : null; // how much more top players pick the blocker in that spot
            const hurt = (d.hurt || {})[v] && d.hurt[v][i] ? d.hurt[v][i][0] : null; // victim's win-rate change (pp) facing it
            const avoid = (d.pairAvoid || {})[v] && d.pairAvoid[v][i] && d.pairAvoid[v][i][b] ? d.pairAvoid[v][i][b][0] : null;
            out.push({ rule: i, by: b, on: v, text: r.text, hurt: r.hurt, warn: r.warn, lift, pp: hurt, avoid });
          }
        }
      });
      return out;
    }
    /** Reasons (my hero blocks theirs) and cautions (theirs block mine) for picking `code`. */
    function notesFor(code, allies, enemies) {
      const name = new Map((enemies || []).map((e) => [e.code, e.name || e.code]));
      const foes = (enemies || []).map((e) => e.code);
      const good = [];
      const bad = [];
      for (const x of versus([code], foes)) {
        if (x.lift !== null && x.lift < LIFT_LOW) continue; // top players pick it less there: the records disagree
        const proven = x.lift !== null && x.lift >= MIN_LIFT;
        good.push({ text: `${cap(x.text)} (vs ${name.get(x.on)})${proven ? ` · top players pick it ${fmt(x.lift)}× more here` : ''}`, value: proven ? W.goodProven : W.good, vs: x.on, rule: x.rule });
      }
      for (const x of versus(foes, [code])) {
        if (!x.warn || !x.hurt) continue;
        if (x.pp !== null && x.pp >= HURT_OK) continue; // still does well against it
        if (x.avoid !== null && x.avoid >= AVOID_OK) continue; // top players don't avoid that opponent
        const proven = x.pp !== null && x.pp <= -2;
        bad.push({ text: `${name.get(x.by)}: ${x.hurt}${proven ? ` (${fmt(x.pp)} pp in top games)` : ''}`, value: proven ? W.badProven : W.bad, vs: x.by, rule: x.rule });
      }
      const sum = (l, lim) => {
        const s = l.reduce((a, x) => a + x.value, 0);
        return lim > 0 ? Math.min(lim, s) : Math.max(lim, s);
      };
      return { good, bad, score: sum(good, W.maxGood) + sum(bad, W.maxBad) };
    }
    /** The blocking mechanics a team brings (what an attacker has to respect). */
    function threats(codes) {
      const blocking = new Set(rules.filter((r) => r.warn).map((r) => r.by));
      const out = [];
      for (const c of codes || []) for (const m of mechanics(c)) if (blocking.has(m.tag)) out.push({ code: c, tag: m.tag, label: m.label });
      return out;
    }
    function builds(code) {
      return ((d.variants || {})[code] || []).map((v) => ({ artifact: v[0], sets: v[1], share: v[2], startCR: v[3], guard: v[4] }));
    }
    function opener(code) {
      const o = (d.openers || []).find((x) => x[0] === code);
      return o ? { fastest: o[1], available: o[2], top3: o[3] } : null;
    }
    return { SOURCE, date: d.date || '', basis: d.basis || '', mechanics, versus, notesFor, threats, builds, opener, heroes: Object.keys(tags).length };
  }
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const fmt = (n) => (Math.round(n * 10) / 10).toString();

  const api = { create, SOURCE, W };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.E7Know = api;
    const data = root.RTASources && root.RTASources.e7datKnowledge;
    if (data) root.E7Knowledge = create(data);
  }
})(typeof self !== 'undefined' ? self : this);
