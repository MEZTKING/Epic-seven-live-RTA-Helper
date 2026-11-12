/*
 * Pure logic (no DOM): draft order, suggestions and speed math. Heroes are keyed by `code`.
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

  // Fire > Earth > Ice > Fire ; Light <-> Dark.  The game calls Earth "wind".
  const ELEMENT_BEATS = { fire: ['earth'], earth: ['ice'], ice: ['fire'], light: ['dark'], dark: ['light'] };
  const el = (e) => (e === 'wind' ? 'earth' : e);

  function elementAdvantage(attacker, defender) {
    const a = el(attacker);
    const d = el(defender);
    if ((ELEMENT_BEATS[a] || []).includes(d)) return 1;
    if ((ELEMENT_BEATS[d] || []).includes(a)) return -1;
    return 0;
  }

  // ---------------------------------------------------------- suggestions
  /*
   * Suggestions add up "signals". Each signal comes from ONE source and every
   * reason is labelled with it, so you can see (and switch off) where advice
   * comes from:
   *   'my notes'   tiers / counters / synergies you typed in
   *   'learned'    stats computed from your logged matches
   *   'game rule'  element advantage
   *   'presets'    your saved team presets
   *   'player'     the current opponent's history
   *
   * ctx = { notes, stats, presets, profile, owned, useElement, learn }
   *   notes    { [code]: { tier, counters[], synergies[] } } or null (off)
   *   stats    RTALearn.buildStats(...) result or null (off)
   *   presets  [{ name, heroes[] }] or null (off)
   *   profile  opponent profile from RTALearn or null
   *   owned    Set of codes I own, or null (no roster -> no filter)
   *   learn    the RTALearn module (needed when stats is given)
   */
  const TIER_SCORE = { S: 3, A: 2, B: 1, C: 0, '': 0 };
  const W = {
    noteCounter: 3,
    noteCounteredBy: 3,
    noteSynergy: 2,
    element: 0.5,
    learnedMatchup: 8, // x (winrate - 0.5)
    learnedPair: 6,
    learnedHero: 6,
    playerHabit: 5, // x pick rate of this opponent
    preset: 2.5,
  };
  const MIN_SHOW = 0.3; // hide tiny learned effects from the reason list

  function noteOf(ctx, code) {
    return (ctx.notes && ctx.notes[code]) || null;
  }

  function scoreCandidate(hero, allies, enemies, ctx = {}, opts = {}) {
    const reasons = [];
    let score = 0;
    const push = (value, text, source) => {
      score += value;
      if (text) reasons.push({ text, source, value: Math.round(value * 10) / 10 });
    };
    const n = noteOf(ctx, hero.code);

    // my notes
    if (ctx.notes) {
      if (n && n.tier) push(TIER_SCORE[n.tier] || 0, `Tier ${n.tier}`, 'my notes');
      for (const e of enemies) {
        if (n && (n.counters || []).includes(e.code)) push(W.noteCounter, `Counters ${e.name}`, 'my notes');
        const en = noteOf(ctx, e.code);
        if (en && (en.counters || []).includes(hero.code)) push(-W.noteCounteredBy, `Countered by ${e.name}`, 'my notes');
      }
      for (const a of allies) {
        const an = noteOf(ctx, a.code);
        if ((n && (n.synergies || []).includes(a.code)) || (an && (an.synergies || []).includes(hero.code))) {
          push(W.noteSynergy, `Synergy with ${a.name}`, 'my notes');
        }
      }
    }

    // game rule
    if (ctx.useElement !== false && enemies.length) {
      const net = enemies.reduce((s, e) => s + elementAdvantage(hero.element, e.element), 0);
      if (net) push(net * W.element, net > 0 ? `Element edge (+${net})` : `Element disadvantage (${net})`, 'game rule');
    }

    // learned
    if (ctx.stats && ctx.learn) {
      const L = ctx.learn;
      const h = ctx.stats.hero.get(hero.code);
      if (h && h.team.games) {
        const wr = L.smoothed(h.team.wins, h.team.games);
        const v = (wr - 0.5) * W.learnedHero;
        if (Math.abs(v) >= MIN_SHOW) push(v, `${pct(h.team.wins / h.team.games)} win rate overall (${gm(h.team.games)})`, 'learned');
        else score += v;
      }
      for (const e of enemies) {
        const m = L.matchupOf(ctx.stats, hero.code, e.code);
        if (!m) continue;
        const v = (m.wr - 0.5) * W.learnedMatchup;
        if (Math.abs(v) >= MIN_SHOW) push(v, `${pct(m.raw)} vs ${e.name} (${gm(m.games)})`, 'learned');
        else score += v;
      }
      for (const a of allies) {
        const p = L.pairOf(ctx.stats, hero.code, a.code);
        if (!p) continue;
        const v = (p.wr - 0.5) * W.learnedPair;
        if (Math.abs(v) >= MIN_SHOW) push(v, `${pct(p.raw)} with ${a.name} (${gm(p.games)})`, 'learned');
        else score += v;
      }
    }

    // presets (only for my own picks)
    if (ctx.presets && opts.side === 'me') {
      const allyCodes = new Set(allies.map((a) => a.code));
      for (const p of ctx.presets) {
        if (!p.heroes.includes(hero.code)) continue;
        const have = p.heroes.filter((c) => allyCodes.has(c)).length;
        if (have > 0) push(W.preset, `Preset "${p.name}" (${have + 1}/${p.heroes.length})`, 'presets');
      }
    }

    // opponent habits (only when predicting the opponent)
    if (ctx.profile && opts.side === 'opp') {
      const hit = ctx.profile.picks.find((p) => p.code === hero.code);
      if (hit) push(hit.rate * W.playerHabit, `${ctx.profile.name} picks it in ${pct(hit.rate)} of games`, 'player');
    }

    return { score: Math.round(score * 10) / 10, reasons };
  }

  const gm = (n) => `${n} ${n === 1 ? 'game' : 'games'}`;
  function pct(x) {
    return Math.round(x * 100) + '%';
  }

  function heroMap(heroes) {
    const m = new Map();
    for (const h of heroes) m.set(h.code, h);
    return m;
  }

  /** Rank heroes for the current pick (mine or the opponent's). */
  function suggestPicks(draft, heroes, ctx = {}, limit = 8) {
    const step = currentStep(draft);
    if (!step || step.phase !== 'pick') return [];
    const byCode = heroMap(heroes);
    const v = draftView(draft);
    const side = step.player;
    const other = side === 'me' ? 'opp' : 'me';
    const taken = new Set([...v.prebans.me, ...v.prebans.opp, ...v.picks.me, ...v.picks.opp]);
    const allies = v.picks[side].map((c) => byCode.get(c)).filter(Boolean);
    const enemies = v.picks[other].map((c) => byCode.get(c)).filter(Boolean);
    const owned = side === 'me' && ctx.owned && ctx.owned.size ? ctx.owned : null;
    return heroes
      .filter((h) => !taken.has(h.code) && (!owned || owned.has(h.code)))
      .map((h) => ({ hero: h, ...scoreCandidate(h, allies, enemies, ctx, { side }) }))
      .filter((s) => s.reasons.length)
      .sort((x, y) => y.score - x.score || x.hero.name.localeCompare(y.hero.name))
      .slice(0, limit);
  }

  /** Rank the other side's heroes by threat (what `forPlayer` should postban). */
  function suggestPostban(draft, heroes, ctx = {}, forPlayer = 'me') {
    const byCode = heroMap(heroes);
    const v = draftView(draft);
    const other = forPlayer === 'me' ? 'opp' : 'me';
    const mine = v.picks[forPlayer].map((c) => byCode.get(c)).filter(Boolean);
    const theirs = v.picks[other].map((c) => byCode.get(c)).filter(Boolean);
    return theirs
      .map((h) => ({ hero: h, ...scoreCandidate(h, theirs.filter((t) => t.code !== h.code), mine, ctx, { side: other }) }))
      .sort((x, y) => y.score - x.score);
  }

  /**
   * Preban ideas: heroes that hurt me. Uses my tiers, my noted counters of
   * heroes I own, how badly I do against each hero (learned) and what the
   * current opponent likes to pick.
   */
  function suggestPrebans(draft, heroes, ctx = {}, limit = 8) {
    const v = draftView(draft);
    const taken = new Set(v.prebans.me);
    const ownedList = ctx.owned ? heroes.filter((h) => ctx.owned.has(h.code)) : [];
    return heroes
      .filter((h) => !taken.has(h.code))
      .map((h) => {
        const reasons = [];
        let score = 0;
        const push = (val, text, source) => {
          score += val;
          reasons.push({ text, source, value: Math.round(val * 10) / 10 });
        };
        const n = noteOf(ctx, h.code);
        if (ctx.notes && n) {
          if (n.tier && TIER_SCORE[n.tier]) push(TIER_SCORE[n.tier], `Tier ${n.tier}`, 'my notes');
          const hits = ownedList.filter((o) => o.code !== h.code && (n.counters || []).includes(o.code));
          if (hits.length) push(W.noteCounter * Math.min(hits.length, 3), `Counters your ${hits.slice(0, 3).map((o) => o.name).join(', ')}`, 'my notes');
        }
        if (ctx.stats && ctx.learn) {
          const s = ctx.stats.hero.get(h.code);
          if (s && s.vsMe.games >= 2) {
            const myWr = ctx.learn.smoothed(s.vsMe.wins, s.vsMe.games);
            const val = (0.5 - myWr) * W.learnedMatchup;
            if (val >= MIN_SHOW) push(val, `You win only ${pct(s.vsMe.wins / s.vsMe.games)} against it (${gm(s.vsMe.games)})`, 'learned');
          }
        }
        if (ctx.profile) {
          const hit = ctx.profile.picks.find((p) => p.code === h.code);
          if (hit) push(hit.rate * W.playerHabit, `${ctx.profile.name} picks it in ${pct(hit.rate)} of games`, 'player');
        }
        return { hero: h, score: Math.round(score * 10) / 10, reasons };
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
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RTALogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
