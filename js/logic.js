/*
 * Pure logic (no DOM): draft order, suggestions and speed math.
 * Works in the browser (window.RTALogic) and in Node (require) for tests.
 */
(function (root) {
  // ---------------------------------------------------------------- draft

  /**
   * RTA draft order. Prebans happen at the same time in game, so their order
   * here doesn't matter. Picks go 1-2-2-2-2-1 starting with the first-pick
   * player. Then each player postbans one of the OPPONENT's five heroes.
   */
  function draftSteps(firstPick) {
    const a = firstPick === 'opp' ? 'opp' : 'me';
    const b = a === 'me' ? 'opp' : 'me';
    const steps = [];
    const add = (phase, player, count) => {
      for (let i = 0; i < count; i++) steps.push({ phase, player });
    };
    add('preban', 'me', 2);
    add('preban', 'opp', 2);
    add('pick', a, 1);
    add('pick', b, 2);
    add('pick', a, 2);
    add('pick', b, 2);
    add('pick', a, 2);
    add('pick', b, 1);
    add('postban', 'me', 1);
    add('postban', 'opp', 1);
    return steps;
  }

  function newDraft(firstPick) {
    return { firstPick: firstPick === 'opp' ? 'opp' : 'me', actions: [] };
  }

  function currentStep(draft) {
    const steps = draftSteps(draft.firstPick);
    return steps[draft.actions.length] || null;
  }

  function isComplete(draft) {
    return currentStep(draft) === null;
  }

  /** Summarise a draft into lists of hero ids. */
  function draftView(draft) {
    const v = {
      prebans: { me: [], opp: [] },
      picks: { me: [], opp: [] },
      postbans: { me: [], opp: [] }, // postbans.me = enemy hero that *I* banned
    };
    for (const a of draft.actions) {
      const bucket = a.phase === 'preban' ? v.prebans : a.phase === 'pick' ? v.picks : v.postbans;
      bucket[a.player].push(a.heroId);
    }
    return v;
  }

  /** Can the current step take this hero? Returns null if OK, or a reason string. */
  function canSelect(draft, heroId) {
    const step = currentStep(draft);
    if (!step) return 'Draft is complete.';
    const v = draftView(draft);
    const allPrebans = [...v.prebans.me, ...v.prebans.opp];
    if (step.phase === 'preban') {
      if (v.prebans[step.player].includes(heroId)) return 'Already prebanned by this player.';
      return null;
    }
    if (step.phase === 'pick') {
      if (allPrebans.includes(heroId)) return 'That hero is prebanned.';
      if (v.picks.me.includes(heroId) || v.picks.opp.includes(heroId)) return 'That hero is already picked.';
      return null;
    }
    // postban: must be one of the opponent's picks
    const other = step.player === 'me' ? 'opp' : 'me';
    if (!v.picks[other].includes(heroId)) return 'Postban must target one of the opponent\'s picks.';
    return null;
  }

  function select(draft, heroId) {
    const reason = canSelect(draft, heroId);
    if (reason) throw new Error(reason);
    const step = currentStep(draft);
    return { ...draft, actions: [...draft.actions, { phase: step.phase, player: step.player, heroId }] };
  }

  function undo(draft) {
    return { ...draft, actions: draft.actions.slice(0, -1) };
  }

  // ------------------------------------------------------------- elements

  // Fire > Earth > Ice > Fire ; Light <-> Dark
  const ELEMENT_BEATS = { fire: ['earth'], earth: ['ice'], ice: ['fire'], light: ['dark'], dark: ['light'] };

  function elementAdvantage(attacker, defender) {
    if ((ELEMENT_BEATS[attacker] || []).includes(defender)) return 1;
    if ((ELEMENT_BEATS[defender] || []).includes(attacker)) return -1;
    return 0;
  }

  // ---------------------------------------------------------- suggestions

  const TIER_SCORE = { S: 3, A: 2, B: 1, C: 0, '': 0 };

  const W = { counter: 3, counteredBy: 3, synergy: 2, element: 0.5 };

  function indexHeroes(heroes) {
    const map = new Map();
    for (const h of heroes) map.set(h.id, h);
    return map;
  }

  function counters(a, b) {
    return !!a && !!b && (a.counters || []).includes(b.id);
  }
  function synergy(a, b) {
    return !!a && !!b && ((a.synergies || []).includes(b.id) || (b.synergies || []).includes(a.id));
  }

  /**
   * Score one candidate hero for a side, given allies and enemies already picked.
   * Returns { score, reasons[] }.
   */
  function scoreCandidate(hero, allies, enemies) {
    let score = TIER_SCORE[hero.tier || ''] || 0;
    const reasons = [];
    if (hero.tier) reasons.push(`Tier ${hero.tier}`);
    for (const e of enemies) {
      if (counters(hero, e)) {
        score += W.counter;
        reasons.push(`Counters ${e.name}`);
      }
      if (counters(e, hero)) {
        score -= W.counteredBy;
        reasons.push(`Countered by ${e.name}`);
      }
      const adv = elementAdvantage(hero.element, e.element);
      score += adv * W.element;
    }
    for (const a of allies) {
      if (synergy(hero, a)) {
        score += W.synergy;
        reasons.push(`Synergy with ${a.name}`);
      }
    }
    const elemNet = enemies.reduce((s, e) => s + elementAdvantage(hero.element, e.element), 0);
    if (elemNet > 0) reasons.push(`Element edge (+${elemNet})`);
    if (elemNet < 0) reasons.push(`Element disadvantage (${elemNet})`);
    return { score: Math.round(score * 10) / 10, reasons };
  }

  /**
   * Suggest heroes for the current pick (for whichever side is picking).
   * If the picking side is "me" and any hero is marked owned, only owned heroes
   * are suggested.
   */
  function suggestPicks(draft, heroes, limit = 8) {
    const step = currentStep(draft);
    if (!step || step.phase !== 'pick') return [];
    const byId = indexHeroes(heroes);
    const v = draftView(draft);
    const side = step.player;
    const other = side === 'me' ? 'opp' : 'me';
    const taken = new Set([...v.prebans.me, ...v.prebans.opp, ...v.picks.me, ...v.picks.opp]);
    const allies = v.picks[side].map((id) => byId.get(id)).filter(Boolean);
    const enemies = v.picks[other].map((id) => byId.get(id)).filter(Boolean);
    const anyOwned = heroes.some((h) => h.owned);
    return heroes
      .filter((h) => !taken.has(h.id))
      .filter((h) => !(side === 'me' && anyOwned && !h.owned))
      .map((h) => ({ hero: h, ...scoreCandidate(h, allies, enemies) }))
      .sort((x, y) => y.score - x.score || x.hero.name.localeCompare(y.hero.name))
      .slice(0, limit);
  }

  /**
   * Rank the opponent's heroes by how dangerous they are to my team
   * (i.e. what I should postban).
   */
  function suggestPostban(draft, heroes, forPlayer = 'me') {
    const byId = indexHeroes(heroes);
    const v = draftView(draft);
    const other = forPlayer === 'me' ? 'opp' : 'me';
    const mine = v.picks[forPlayer].map((id) => byId.get(id)).filter(Boolean);
    const theirs = v.picks[other].map((id) => byId.get(id)).filter(Boolean);
    return theirs
      .map((h) => {
        const teammates = theirs.filter((t) => t.id !== h.id);
        const r = scoreCandidate(h, teammates, mine);
        return { hero: h, score: r.score, reasons: r.reasons };
      })
      .sort((x, y) => y.score - x.score);
  }

  /** Preban ideas: high-tier heroes that counter the heroes I own. */
  function suggestPrebans(heroes, limit = 6) {
    const owned = heroes.filter((h) => h.owned);
    return heroes
      .map((h) => {
        let score = TIER_SCORE[h.tier || ''] || 0;
        const reasons = h.tier ? [`Tier ${h.tier}`] : [];
        for (const o of owned) {
          if (o.id !== h.id && counters(h, o)) {
            score += W.counter;
            reasons.push(`Counters your ${o.name}`);
          }
        }
        return { hero: h, score, reasons };
      })
      .filter((s) => s.score > 0)
      .sort((x, y) => y.score - x.score || x.hero.name.localeCompare(y.hero.name))
      .slice(0, limit);
  }

  // ---------------------------------------------------------------- speed

  /**
   * Estimate enemy speed from their CR bar at the moment your unit takes the
   * first turn of the fight.
   *
   *   mySpeed       speed of the unit that just got the first turn
   *   enemyCR       enemy unit's combat readiness % shown at that moment
   *   startVariance max random starting CR % each unit can begin with
   *
   * With no random start, enemySpeed = mySpeed * CR / 100. With random start
   * CR in [0, v] for both units, the true value lies in [min, max].
   */
  function estimateEnemySpeed(mySpeed, enemyCR, startVariance = 5) {
    const s = Number(mySpeed);
    const cr = Number(enemyCR);
    const v = Math.max(0, Number(startVariance) || 0);
    if (!(s > 0) || !(cr >= 0)) return null;
    const estimate = (s * cr) / 100;
    const min = Math.max(0, ((cr - v) * s) / 100);
    const max = (cr * s) / (100 - v);
    return { estimate: round1(estimate), min: round1(min), max: round1(max) };
  }

  /**
   * Speed you need to be guaranteed to move before a unit with `enemySpeed`,
   * even in the worst case for random starting CR.
   */
  function speedToOutspeed(enemySpeed, startVariance = 5) {
    const e = Number(enemySpeed);
    const v = Math.max(0, Number(startVariance) || 0);
    if (!(e > 0) || v >= 100) return null;
    const guaranteed = Math.floor((e * 100) / (100 - v)) + 1;
    return { noVariance: Math.floor(e) + 1, guaranteed };
  }

  /**
   * Simulate the opening turn order.
   * units: [{ name, side: 'me'|'opp', speed, startCR?, pushAllies?, pushOnce? }]
   *   pushAllies  % CR given to all allies when this unit acts (e.g. 20)
   *   pushOnce    if true, only push on this unit's first turn
   * Returns [{ turn, name, side, crSnapshot: {name: cr} }]
   */
  function simulateTurns(units, turns = 10) {
    const st = units
      .filter((u) => Number(u.speed) > 0)
      .map((u, i) => ({
        i,
        name: u.name || `Unit ${i + 1}`,
        side: u.side === 'opp' ? 'opp' : 'me',
        speed: Number(u.speed),
        cr: clamp(Number(u.startCR) || 0, 0, 100),
        push: Number(u.pushAllies) || 0,
        pushOnce: !!u.pushOnce,
        acted: 0,
      }));
    const out = [];
    if (!st.length) return out;
    for (let t = 1; t <= turns; t++) {
      // time until each unit reaches 100%
      let dt = Infinity;
      for (const u of st) dt = Math.min(dt, Math.max(0, (100 - u.cr) / u.speed));
      for (const u of st) u.cr = Math.min(100, u.cr + u.speed * dt);
      // actor: highest CR, tie -> higher speed, tie -> list order
      const actor = st
        .filter((u) => u.cr >= 100 - 1e-9)
        .sort((a, b) => b.speed - a.speed || a.i - b.i)[0];
      const snapshot = {};
      for (const u of st) snapshot[u.name] = round1(u.cr);
      out.push({ turn: t, name: actor.name, side: actor.side, crSnapshot: snapshot });
      actor.cr = 0;
      actor.acted++;
      if (actor.push && (!actor.pushOnce || actor.acted === 1)) {
        for (const u of st) if (u !== actor && u.side === actor.side) u.cr = Math.min(100, u.cr + actor.push);
      }
    }
    return out;
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }
  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  // ---------------------------------------------------------------- stats

  /** matches: [{ result: 'win'|'loss', myPicks, oppPicks, myPostbanned (mine banned by opp) }] */
  function heroStats(matches) {
    const mine = new Map();
    const vs = new Map();
    const bump = (m, id, win) => {
      const r = m.get(id) || { games: 0, wins: 0 };
      r.games++;
      if (win) r.wins++;
      m.set(id, r);
    };
    for (const m of matches) {
      const win = m.result === 'win';
      for (const id of m.myPicks || []) bump(mine, id, win);
      for (const id of m.oppPicks || []) bump(vs, id, win);
    }
    return { mine, vs };
  }

  const api = {
    draftSteps,
    newDraft,
    currentStep,
    isComplete,
    draftView,
    canSelect,
    select,
    undo,
    elementAdvantage,
    scoreCandidate,
    suggestPicks,
    suggestPostban,
    suggestPrebans,
    estimateEnemySpeed,
    speedToOutspeed,
    simulateTurns,
    heroStats,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RTALogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
