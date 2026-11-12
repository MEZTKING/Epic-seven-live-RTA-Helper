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

  /**
   * Build a draft from what is visible on the board (used by auto-detection).
   *   board = { prebans: {me:[], opp:[]}, picks: {me:[], opp:[]}, postbans: {me:[], opp:[]} }
   * Picks are in slot order. Actions are replayed in official draft order and
   * replay stops at the first step whose hero isn't on the board yet, so a
   * misread far-away slot can never jump ahead of the real draft.
   */
  function boardToDraft(board, firstPick) {
    let d = newDraft(firstPick);
    const used = { preban: { me: 0, opp: 0 }, pick: { me: 0, opp: 0 }, postban: { me: 0, opp: 0 } };
    const src = { preban: board.prebans || {}, pick: board.picks || {}, postban: board.postbans || {} };
    for (const step of draftSteps(d.firstPick)) {
      const list = src[step.phase][step.player] || [];
      const code = list[used[step.phase][step.player]];
      if (!code || canSelect(d, code)) break;
      d = select(d, code);
      used[step.phase][step.player]++;
    }
    return d;
  }

  /**
   * Guess who picked first from pick counts. Only certain while exactly one
   * side has picks; returns null when it can't tell.
   */
  function inferFirstPick(board) {
    const me = (board.picks.me || []).length;
    const opp = (board.picks.opp || []).length;
    if (me && !opp) return 'me';
    if (opp && !me) return 'opp';
    return null;
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
   * ctx = { notes, stats, presets, profile, owned, useElement, learn,
   *         meta, speed, deny, sourceWeights }
   *   notes    { [code]: { tier, counters[], synergies[] } } or null (off)
   *   stats    RTALearn.buildStats(...) result or null (off)
   *   presets  [{ name, heroes[] }] or null (off)
   *   profile  opponent profile from RTALearn or null
   *   owned    Set of codes I own, or null (no roster -> no filter)
   *   learn    the RTALearn module (needed when stats is given)
   *   meta     [{ name, rows: { [code]: { pick, ban, preban, win } } }]  imported meta datasets
   *   speed    { mine: Map code->speed (your gear), player: Map, all: Map code->{speed,n} (scouting) }
   *   deny     false to turn off "also strong for them"
   *   sourceWeights { [group]: multiplier }  see SOURCE_GROUPS
   *   gameHelp { live: { phase, player, recs[] } | null, stats: RTALearn.gameHelpStats() | null }
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
    playerBan: 4, // x rate this opponent postbans the hero
    preset: 2.5,
    metaWin: 10, // x (meta win rate - 0.5)
    metaPick: 3, // x meta pick rate (predicting the opponent)
    metaBan: 4, // x meta (pre)ban rate (preban ideas)
    speedEdge: 0.6, // per enemy you out- or under-speed
    firstPickCounter: 0.5, // per known counter, when first-picking
    firstPickBanned: 3, // x how often it gets postbanned, when first-picking
    deny: 0.3, // x how good it would be for the opponent
    gameHelpLive: 3, // the game's drafting help recommends it right now (#1; less for lower ranks)
    gameHelpAgainst: 0.4, // per time the game recommended it against an enemy on the board (max 5)
    gameHelpWith: 0.25, // per time it was recommended alongside an ally (max 5)
    gameHelpBan: 0.3, // per time the game recommended banning it (max 8), for ban ideas
  };
  const MIN_SHOW = 0.3; // hide tiny learned effects from the reason list

  /*
   * Every signal belongs to one source group. ctx.sourceWeights can scale a
   * whole group (1 = normal, 0 = off) — e.g. the values "Tune from my matches"
   * finds. Meta sources are named 'meta: <dataset>' and share the 'meta' weight.
   */
  const SOURCE_GROUPS = ['my notes', 'learned', 'game rule', 'presets', 'player', 'meta', 'speed', 'deny', 'game help'];
  const groupOf = (source) => (source.startsWith('meta') ? 'meta' : source);

  function noteOf(ctx, code) {
    return (ctx.notes && ctx.notes[code]) || null;
  }

  function makeAcc(ctx) {
    const acc = { score: 0, reasons: [], bySource: {} };
    acc.add = (value, text, source) => {
      const w = ctx.sourceWeights && ctx.sourceWeights[groupOf(source)] !== undefined ? ctx.sourceWeights[groupOf(source)] : 1;
      const v = value * w;
      acc.score += v;
      acc.bySource[groupOf(source)] = (acc.bySource[groupOf(source)] || 0) + value;
      if (text && v !== 0) acc.reasons.push({ text, source, value: Math.round(v * 10) / 10 });
    };
    acc.result = () => ({ score: Math.round(acc.score * 10) / 10, reasons: acc.reasons, bySource: acc.bySource });
    return acc;
  }

  /** Typical speed of an enemy hero: this opponent's scouting first, then everyone's. */
  function enemySpeedOf(ctx, code) {
    const sp = ctx.speed;
    if (!sp) return null;
    return (sp.player && sp.player.get(code)) || (sp.all && sp.all.get(code)) || null;
  }

  function scoreCandidate(hero, allies, enemies, ctx = {}, opts = {}) {
    const acc = makeAcc(ctx);
    const push = acc.add;
    const quiet = (v, source) => push(v, null, source); // counts, but not listed
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
        const v = (L.smoothed(h.team.wins, h.team.games) - 0.5) * W.learnedHero;
        if (Math.abs(v) >= MIN_SHOW) push(v, `${pct(h.team.wins / h.team.games)} win rate overall (${gm(h.team.games)})`, 'learned');
        else quiet(v, 'learned');
      }
      for (const e of enemies) {
        const m = L.matchupOf(ctx.stats, hero.code, e.code);
        if (!m) continue;
        const v = (m.wr - 0.5) * W.learnedMatchup;
        if (Math.abs(v) >= MIN_SHOW) push(v, `${pct(m.raw)} vs ${e.name} (${gm(m.games)})`, 'learned');
        else quiet(v, 'learned');
      }
      for (const a of allies) {
        const p = L.pairOf(ctx.stats, hero.code, a.code);
        if (!p) continue;
        const v = (p.wr - 0.5) * W.learnedPair;
        if (Math.abs(v) >= MIN_SHOW) push(v, `${pct(p.raw)} with ${a.name} (${gm(p.games)})`, 'learned');
        else quiet(v, 'learned');
      }
    }

    // meta datasets (each its own source)
    for (const m of ctx.meta || []) {
      const row = m.rows[hero.code];
      if (!row) continue;
      if (typeof row.win === 'number') {
        const v = (row.win - 0.5) * W.metaWin;
        if (Math.abs(v) >= MIN_SHOW) push(v, `${pct(row.win)} meta win rate`, `meta: ${m.name}`);
        else quiet(v, `meta: ${m.name}`);
      }
      if (opts.side === 'opp' && typeof row.pick === 'number' && row.pick >= 0.05) push(row.pick * W.metaPick, `${pct(row.pick)} meta pick rate`, `meta: ${m.name}`);
    }

    // speed: your gear vs. what you've scouted
    if (ctx.speed && ctx.speed.mine) {
      const mineSpd = (code) => ctx.speed.mine.get(code);
      for (const e of enemies) {
        const my = opts.side === 'opp' ? enemySpeedOf(ctx, hero.code) : mineSpd(hero.code);
        const their = opts.side === 'opp' ? mineSpd(e.code) : enemySpeedOf(ctx, e.code);
        const a = my && (my.speed || my);
        const b = their && (their.speed || their);
        if (!a || !b) continue;
        if (a > b * 1.03) push(W.speedEdge, `Faster than ${e.name} (${Math.round(a)} vs ~${Math.round(b)})`, 'speed');
        else if (a * 1.03 < b) push(-W.speedEdge, `Slower than ${e.name} (${Math.round(a)} vs ~${Math.round(b)})`, 'speed');
      }
    }

    // first pick safety (no picks on the board yet)
    if (opts.side === 'me' && !allies.length && !enemies.length && opts.firstPick) {
      const counterers = new Set();
      if (ctx.notes) for (const [code, note] of Object.entries(ctx.notes)) if ((note.counters || []).includes(hero.code)) counterers.add(code);
      if (counterers.size) push(-W.firstPickCounter * Math.min(counterers.size, 6), `${counterers.size} known counter${counterers.size > 1 ? 's' : ''} left in the pool`, 'my notes');
      const s = ctx.stats && ctx.stats.hero.get(hero.code);
      if (s && s.pickedByMe >= 3) {
        const banRate = s.postbanned / (s.pickedByMe + s.pickedByOpp);
        if (banRate >= 0.15) push(-banRate * W.firstPickBanned, `Postbanned in ${pct(banRate)} of games it was picked`, 'learned');
        else push(W.firstPickBanned * 0.15, `Rarely postbanned (${pct(banRate)})`, 'learned');
      }
    }

    // the game's own drafting help: live recommendation + database built from past ones
    if (ctx.gameHelp) {
      const gh = ctx.gameHelp;
      const live = gh.live && opts.side === gh.live.player && gh.live.phase === 'pick' ? gh.live.recs.indexOf(hero.code) : -1;
      if (live >= 0) push(W.gameHelpLive * Math.max(0.4, 1 - live * 0.15), `Game's drafting help suggests it now (#${live + 1})`, 'game help');
      if (gh.stats) {
        for (const e of enemies) {
          const n = (gh.stats.against.get(e.code) || new Map()).get(hero.code) || 0;
          if (n >= 2) push(W.gameHelpAgainst * Math.min(n, 5), `Game recommended it vs ${e.name} ${n}×`, 'game help');
        }
        for (const a of allies) {
          const n = (gh.stats.with.get(a.code) || new Map()).get(hero.code) || 0;
          if (n >= 2) push(W.gameHelpWith * Math.min(n, 5), `Game recommended it with ${a.name} ${n}×`, 'game help');
        }
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

    // deny: also great for the opponent? (my picks only)
    if (opts.side === 'me' && opts.deny) {
      const theirs = scoreCandidate(hero, enemies, allies, ctx, { side: 'opp' });
      if (theirs.score >= 3) push(theirs.score * W.deny, `Deny: also strong for them (+${theirs.score})`, 'deny');
    }

    return acc.result();
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

  function pickContext(draft, heroes) {
    const step = currentStep(draft);
    if (!step || step.phase !== 'pick') return null;
    const byCode = heroMap(heroes);
    const v = draftView(draft);
    const side = step.player;
    const other = side === 'me' ? 'opp' : 'me';
    return {
      step,
      side,
      taken: new Set([...v.prebans.me, ...v.prebans.opp, ...v.picks.me, ...v.picks.opp]),
      allies: v.picks[side].map((c) => byCode.get(c)).filter(Boolean),
      enemies: v.picks[other].map((c) => byCode.get(c)).filter(Boolean),
      firstPick: !v.picks.me.length && !v.picks.opp.length,
    };
  }

  /** Rank heroes for the current pick (mine or the opponent's). */
  function suggestPicks(draft, heroes, ctx = {}, limit = 8) {
    const pc = pickContext(draft, heroes);
    if (!pc) return [];
    const owned = pc.side === 'me' && ctx.owned && ctx.owned.size ? ctx.owned : null;
    const opts = { side: pc.side, deny: ctx.deny !== false, firstPick: pc.firstPick };
    return heroes
      .filter((h) => !pc.taken.has(h.code) && (!owned || owned.has(h.code)))
      .map((h) => ({ hero: h, ...scoreCandidate(h, pc.allies, pc.enemies, ctx, opts) }))
      .filter((s) => s.reasons.length)
      .sort((x, y) => y.score - x.score || x.hero.name.localeCompare(y.hero.name))
      .slice(0, limit);
  }

  /** How many picks the current player makes in this turn (1 or 2). */
  function picksThisTurn(draft) {
    const steps = draftSteps(draft.firstPick);
    const i = draft.actions.length;
    const s = steps[i];
    if (!s || s.phase !== 'pick') return 0;
    let n = 0;
    for (let k = i; k < steps.length && steps[k].phase === 'pick' && steps[k].player === s.player; k++) n++;
    // only count the picks left in THIS turn (a turn is at most 2)
    let before = 0;
    for (let k = i - 1; k >= 0 && steps[k].phase === 'pick' && steps[k].player === s.player; k--) before++;
    return Math.min(n, 2 - (before % 2));
  }

  /**
   * Best PAIR for a 2-pick turn: the second hero is scored with the first
   * already on the team (so synergy between them counts).
   */
  function suggestPairs(draft, heroes, ctx = {}, limit = 3) {
    if (picksThisTurn(draft) < 2) return [];
    const pc = pickContext(draft, heroes);
    const singles = suggestPicks(draft, heroes, ctx, 12);
    const pairs = [];
    for (let i = 0; i < singles.length; i++) {
      for (let j = i + 1; j < singles.length; j++) {
        const a = singles[i];
        const b = singles[j];
        const bWithA = scoreCandidate(b.hero, [...pc.allies, a.hero], pc.enemies, ctx, { side: pc.side, deny: ctx.deny !== false });
        const aWithB = scoreCandidate(a.hero, [...pc.allies, b.hero], pc.enemies, ctx, { side: pc.side, deny: ctx.deny !== false });
        const score = Math.round(Math.max(a.score + bWithA.score, b.score + aWithB.score) * 10) / 10;
        const together = bWithA.reasons.filter((r) => r.text.includes(a.hero.name));
        pairs.push({ heroes: [a.hero, b.hero], score, together });
      }
    }
    return pairs.sort((x, y) => y.score - x.score).slice(0, limit);
  }

  /** Rank the other side's heroes by threat (what `forPlayer` should postban). */
  function suggestPostban(draft, heroes, ctx = {}, forPlayer = 'me') {
    const byCode = heroMap(heroes);
    const v = draftView(draft);
    const other = forPlayer === 'me' ? 'opp' : 'me';
    const mine = v.picks[forPlayer].map((c) => byCode.get(c)).filter(Boolean);
    const theirs = v.picks[other].map((c) => byCode.get(c)).filter(Boolean);
    return theirs
      .map((h) => {
        const r = scoreCandidate(h, theirs.filter((t) => t.code !== h.code), mine, ctx, { side: other });
        // the game's drafting help recommending this postban right now
        const gl = ctx.gameHelp && ctx.gameHelp.live;
        if (forPlayer === 'me' && gl && gl.phase === 'postban' && gl.player === 'me' && gl.recs.includes(h.code)) {
          const v3 = W.gameHelpLive * Math.max(0.4, 1 - gl.recs.indexOf(h.code) * 0.15);
          r.score = Math.round((r.score + v3) * 10) / 10;
          r.reasons = [{ text: `Game's drafting help suggests banning it (#${gl.recs.indexOf(h.code) + 1})`, source: 'game help', value: Math.round(v3 * 10) / 10 }, ...r.reasons];
        }
        // when predicting THEIR ban of my hero, use this opponent's postban habits
        if (forPlayer === 'opp' && ctx.profile) {
          const hit = (ctx.profile.postbans || []).find((p) => p.code === h.code);
          if (hit) {
            const v2 = hit.rate * W.playerBan;
            r.score = Math.round((r.score + v2) * 10) / 10;
            r.reasons = [...r.reasons, { text: `${ctx.profile.name} postbans it in ${pct(hit.rate)} of games`, source: 'player', value: Math.round(v2 * 10) / 10 }];
          }
        }
        return { hero: h, ...r };
      })
      .sort((x, y) => y.score - x.score);
  }

  /**
   * Postban risk while I'm still picking: which of my heroes the opponent is
   * most likely to ban, and how much of my team's value it carries.
   */
  function postbanRisk(draft, heroes, ctx = {}) {
    const v = draftView(draft);
    if (v.picks.me.length < 3) return null;
    const ranked = suggestPostban(draft, heroes, ctx, 'opp');
    if (!ranked.length) return null;
    const total = ranked.reduce((s, r) => s + Math.max(0, r.score), 0) || 1;
    const top = ranked[0];
    return { hero: top.hero, score: top.score, share: Math.max(0, top.score) / total, reasons: top.reasons, ranked };
  }

  /**
   * Preban ideas: heroes that hurt me. Uses my tiers, my noted counters of
   * heroes I own, how badly I do against each hero (learned), meta ban rates
   * and what the current opponent likes to pick.
   */
  function suggestPrebans(draft, heroes, ctx = {}, limit = 8) {
    const v = draftView(draft);
    const taken = new Set(v.prebans.me);
    const ownedList = ctx.owned ? heroes.filter((h) => ctx.owned.has(h.code)) : [];
    return heroes
      .filter((h) => !taken.has(h.code))
      .map((h) => {
        const acc = makeAcc(ctx);
        const push = acc.add;
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
        if (ctx.gameHelp) {
          const gh = ctx.gameHelp;
          const live = gh.live && gh.live.phase === 'preban' && gh.live.player === 'me' ? gh.live.recs.indexOf(h.code) : -1;
          if (live >= 0) push(W.gameHelpLive * Math.max(0.4, 1 - live * 0.15), `Game's drafting help suggests banning it (#${live + 1})`, 'game help');
          const n = gh.stats ? gh.stats.bans.get(h.code) || 0 : 0;
          if (n >= 2) push(W.gameHelpBan * Math.min(n, 8), `Game recommended banning it ${n}×`, 'game help');
        }
        for (const m of ctx.meta || []) {
          const row = m.rows[h.code];
          if (!row) continue;
          const ban = Math.max(row.preban || 0, row.ban || 0);
          if (ban >= 0.05) push(ban * W.metaBan, `${pct(ban)} meta ban rate`, `meta: ${m.name}`);
        }
        if (ctx.profile) {
          const hit = ctx.profile.picks.find((p) => p.code === h.code);
          if (hit) push(hit.rate * W.playerHabit, `${ctx.profile.name} picks it in ${pct(hit.rate)} of games`, 'player');
        }
        return { hero: h, ...acc.result() };
      })
      .filter((s) => s.score > 0)
      .sort((x, y) => y.score - x.score || x.hero.name.localeCompare(y.hero.name))
      .slice(0, limit);
  }

  // ----------------------------------------------------------- team checks
  /** Role tags you can put on heroes (stored in your notes). */
  const TAG_GROUPS = {
    Role: ['nuker', 'bruiser', 'tank', 'support', 'healer', 'debuffer', 'speed control'],
    Offense: ['aoe', 'single target', 'extra turn', 'defense break', 'attack buff', 'crit buff', 'penetration', 'counter'],
    Utility: ['cleanse', 'dispel', 'immunity', 'speed buff', 'cr push', 'cr reduce', 'barrier', 'revive', 'heal'],
    Control: ['control', 'stun', 'provoke', 'silence', 'sleep', 'unhealable', 'debuff extend'],
  };
  const TAGS = [...new Set(Object.values(TAG_GROUPS).flat())];

  /**
   * Simple composition warnings from the tags in your notes.
   * Returns [{ text, source: 'my notes', level: 'warn'|'info' }]
   */
  function compositionWarnings(myCodes, enemyCodes, notes, extra = null) {
    // extra = { tags: { code: [tags] }, source: 'ceciliabot' }  automatic tags from another source
    if (!notes && !extra) return [];
    const label = [notes ? 'my notes' : null, extra ? extra.source : null].filter(Boolean).join(' + ');
    const tagsOf = (codes) => {
      const c = {};
      for (const code of codes) {
        const all = new Set([...((notes && notes[code] && notes[code].tags) || []), ...((extra && extra.tags[code]) || [])]);
        for (const t of all) c[t] = (c[t] || 0) + 1;
      }
      return c;
    };
    const me = tagsOf(myCodes);
    const them = tagsOf(enemyCodes);
    const tagged = myCodes.some((c) => (notes && notes[c] && (notes[c].tags || []).length) || (extra && (extra.tags[c] || []).length));
    const out = [];
    const warn = (text, level = 'warn') => out.push({ text, source: label, level });
    if ((them.debuffer || 0) >= 2 && !me.cleanse && !me.immunity) warn(`No cleanse or immunity against ${them.debuffer} debuffers`);
    if ((them.barrier || 0) + (them.immunity || 0) + (them['speed buff'] || 0) >= 2 && !me.dispel) warn('No dispel against their buffs');
    if ((them.counter || 0) >= 1 && (me.aoe || 0) >= 3) warn('Lots of AoE into a counter team');
    if (tagged && myCodes.length >= 4 && !me.heal && !me.barrier && !me.revive) warn('No sustain (heal, barrier or revive)', 'info');
    if (tagged && myCodes.length >= 4 && !me['speed buff'] && !me['cr push']) warn('No speed buff or CR push', 'info');
    return out;
  }

  // ------------------------------------------------------------ CR reading
  /**
   * Turn CR-bar positions into speeds. At the first turn every unit has gained
   * CR for the same time t, so cr = speed * t. Your heroes with known speed
   * (from gear.txt) pin down t; then speed = cr / t for everyone else.
   *   readings  [{ code, side: 'me'|'opp', cr }]   cr in %
   *   mySpeeds  Map code -> speed
   * Returns [{ code, side, cr, speed, min, max, known }]
   */
  function speedsFromCR(readings, mySpeeds, startVariance = 5) {
    const refs = readings.filter((r) => r.side === 'me' && mySpeeds.get(r.code) && r.cr > 5);
    if (!refs.length) return [];
    const t = refs.reduce((s, r) => s + r.cr / mySpeeds.get(r.code), 0) / refs.length;
    const v = Math.max(0, Number(startVariance) || 0);
    return readings.map((r) => {
      const known = r.side === 'me' ? mySpeeds.get(r.code) || null : null;
      const est = r.cr / t;
      return {
        code: r.code,
        side: r.side,
        cr: r.cr,
        known,
        speed: round1(est),
        min: round1(Math.max(0, (r.cr - v) / t)),
        max: round1(r.cr / t / (1 - v / 100)),
      };
    });
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
    boardToDraft,
    inferFirstPick,
    elementAdvantage,
    scoreCandidate,
    suggestPicks,
    suggestPostban,
    suggestPrebans,
    suggestPairs,
    picksThisTurn,
    postbanRisk,
    compositionWarnings,
    speedsFromCR,
    TAGS,
    TAG_GROUPS,
    SOURCE_GROUPS,
    W,
    estimateEnemySpeed,
    speedToOutspeed,
    simulateTurns,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RTALogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
