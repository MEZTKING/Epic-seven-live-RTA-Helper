/*
 * Guild War battle-result window (DEVLOG #57): "Successful Attack" / "Failed Attack" / "Successful Defense" /
 * "Failed Defense". It opens from a row of a player's Season Log and shows, from the point of view of the player
 * whose page is open (LEFT): that player, the opponent (RIGHT), both sides' two teams of three and the result of
 * each round (Victory / Defeat / Draw). Pure pixel + text helpers, no DOM: unit-tested in tests/gwresult.test.js.
 * The reader is js/vision/readers/guild-result.js; positions are in js/layouts.js (gwRes…).
 *
 * Measured on the owner's 2000×1070 screenshots (2026-11-16):
 *   header (title strip)   mean colour (10,17,24)                    -> very dark
 *   middle band            (43,19,26) on an ENEMY's page (red), (30,47,30) on a page of OUR member (green)
 *   round icon             Victory: 29–31% blue, 25% white · Defeat: 14–15% red, 22% white, no blue
 *
 *   stats(rgba, W, H, rect)          -> { r, g, b, lum, blue, white, red, gold } of a pixel rect (shares 0..1)
 *   windowAt(rgba, W, H, R)          -> null | { side: 'enemy' | 'ours' }   R: { header, band } pixel rects
 *   roundResult(rgba, W, H, rect)    -> 'victory' | 'defeat' | 'draw' | null
 *   titleKind(text)                  -> null | { type: 'attack' | 'defense', ok: true | false | null, draw? }
 *                                       ("Defense Draw" / "Attack Draw": one round each way -> ok null, draw true)
 *   plan(d)                          -> what it means for OUR guild (see below)
 *   key(plan)                        -> text that is the same for the same battle (not logged twice)
 *
 * Other Guild War screens told apart by a few pixels (DEVLOG #58; measured on the owner's 2000×1070 screenshots):
 *   offenseAt(rgba, W, H, R)         -> true on the "Offense Team" screen   R: { start, topbar } (the green Start
 *                                       button (39,71,42) bottom right, a dark top bar)
 *   battleAt(rgba, W, H, pill)       -> true while a fight shows its white "Round 1" pill (216,217,217; 79% white)
 *   noteAt(rgba, W, H, R)            -> true when a note window is open   R: { header, blue } (header (11,19,28),
 *                                       body (24,58,101))
 *   noteTitle(text)                  -> "Ann's Record" -> 'Ann' (who wrote the note), or null
 *   roundOf(text)                    -> "Round 2" -> 2, or null
 *   pickTeam(icons)                  -> a team stands on three of four places: [top, left, right, bottom] -> 3 icons
 *   pageAt(rgba, W, H, R)            -> true on a player's page (name panel + Season Log)   R: { bar }
 */
(function (root) {
  'use strict';

  function stats(rgba, W, H, rect) {
    const x0 = Math.max(0, Math.round(rect.x));
    const y0 = Math.max(0, Math.round(rect.y));
    const x1 = Math.min(W, Math.round(rect.x + rect.w));
    const y1 = Math.min(H, Math.round(rect.y + rect.h));
    let r = 0, g = 0, b = 0, n = 0, blue = 0, white = 0, red = 0, gold = 0, green = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const p = (y * W + x) * 4;
        const R = rgba[p], G = rgba[p + 1], B = rgba[p + 2];
        r += R; g += G; b += B; n++;
        if (B > 150 && B - R > 60) blue++;
        if (R > 200 && G > 200 && B > 200) white++;
        if (R > 170 && G < 100 && B < 110) red++;
        if (R > 170 && G > 110 && G < 200 && B < 100) gold++;
        if (G > 140 && G - R > 50 && G - B > 40) green++;
      }
    }
    if (!n) return { r: 0, g: 0, b: 0, lum: 0, blue: 0, white: 0, red: 0, gold: 0, green: 0 };
    return { r: r / n, g: g / n, b: b / n, lum: (r + g + b) / (3 * n), blue: blue / n, white: white / n, red: red / n, gold: gold / n, green: green / n };
  }

  /**
   * Is a battle-result window open? The title strip is nearly black-blue and the band between the two sides is dark
   * and clearly red (the page of an enemy) or clearly green (the page of one of ours).
   */
  function windowAt(rgba, W, H, R) {
    const h = stats(rgba, W, H, R.header);
    if (h.lum > 40 || h.white > 0.02) return null;
    const b = stats(rgba, W, H, R.band);
    if (b.lum > 80) return null;
    if (b.r - b.g >= 10 && b.r - b.b >= 6) return { side: 'enemy' };
    if (b.g - b.r >= 8 && b.g - b.b >= 6) return { side: 'ours' };
    return null;
  }

  /**
   * The icon over "Victory" / "Defeat" / "Draw". An attack's rounds show swords (blue = won, red = lost), a
   * defense's rounds shields (green = held, red = lost); measured on a "Defense Draw" window: green shield 18%
   * green + 28% white, red shield 16% red + 22% white (DEVLOG #59). A drawn round would be a gold badge (not seen).
   */
  function roundResult(rgba, W, H, rect) {
    const s = stats(rgba, W, H, rect);
    if (s.blue >= 0.15 && s.white >= 0.1) return 'victory';
    if (s.green >= 0.1 && s.white >= 0.1 && s.red < 0.05) return 'victory';
    if (s.red >= 0.07 && s.white >= 0.1 && s.blue < 0.05) return 'defeat';
    if (s.gold >= 0.12 && s.blue < 0.05 && s.red < 0.05) return 'draw';
    return null;
  }

  /** "Successful Attack" -> { type: 'attack', ok: true }. Letters may be misread: a few forms of each word. */
  function titleKind(text) {
    const t = String(text || '').toLowerCase().replace(/[^a-z ]+/g, ' ');
    const type = /at+ack/.test(t) ? 'attack' : /de[ft]en[sc]e|defen/.test(t) ? 'defense' : null;
    if (!type) return null;
    // "Defense Draw" / "Attack Draw": one round won and one lost (DEVLOG #59)
    if (/\bdraw\b|\bdrew\b/.test(t)) return { type, ok: null, draw: true };
    const ok = /suc+es+ful|succes|ccessful/.test(t) ? true : /fail/.test(t) ? false : null;
    if (ok === null) return null;
    return { type, ok };
  }

  /**
   * What a result window means for our guild.
   *   d: { type: 'attack' | 'defense', side: 'enemy' | 'ours' (whose page: the LEFT player), left: name, right: name,
   *        rounds: [{ result: 'victory' | 'defeat' | 'draw' (for the LEFT player), left: [codes], right: [codes] }] }
   * ->  { kind: 'attack',  ours: member, enemy: player, rounds: [{ team, result: 'win' | 'loss', draw, heroes, defense }] }
   *       one of ours attacked an enemy: heroes = our attack team, defense = the enemy team it met
   *     { kind: 'defense', ours: member, enemy: player, rounds: [{ team, result: 'held' | 'lost', draw, heroes, attack }] }
   *       an enemy attacked one of ours: heroes = our defense team, attack = the enemy team that came
   * The four cases:
   *   our page,  attack   our LEFT attacked the enemy RIGHT            result as shown
   *   our page,  defense  the enemy RIGHT attacked our LEFT            result as shown
   *   enemy page, attack  the enemy LEFT attacked our RIGHT            result turned round
   *   enemy page, defense our RIGHT attacked the enemy LEFT            result turned round
   */
  function plan(d) {
    if (!d || !d.type || !d.side || !Array.isArray(d.rounds)) return null;
    const oursLeft = d.side === 'ours';
    const ourAttack = (d.type === 'attack') === oursLeft;
    const rounds = d.rounds.map((r, i) => {
      const draw = r.result === 'draw';
      // did OUR side win this round?
      const won = draw ? false : (r.result === 'victory') === oursLeft;
      const mine = (oursLeft ? r.left : r.right) || [];
      const theirs = (oursLeft ? r.right : r.left) || [];
      return ourAttack
        ? { team: i + 1, result: won ? 'win' : 'loss', draw, heroes: mine, defense: theirs }
        : { team: i + 1, result: won || draw ? 'held' : 'lost', draw, heroes: mine, attack: theirs };
    });
    return { kind: ourAttack ? 'attack' : 'defense', ours: oursLeft ? d.left : d.right, enemy: oursLeft ? d.right : d.left, rounds };
  }

  /** The same battle gives the same text (who, against whom, each round's result and heroes on both sides). */
  function key(p) {
    if (!p) return '';
    const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const team = (t) => [...(t || [])].filter(Boolean).sort().join('+');
    return [p.kind, norm(p.ours), norm(p.enemy), ...p.rounds.map((r) => `${r.result}${r.draw ? 'd' : ''}:${team(r.heroes)}:${team(r.defense || r.attack)}`)].join('|');
  }

  function offenseAt(rgba, W, H, R) {
    const s = stats(rgba, W, H, R.start);
    if (!(s.g - s.r >= 18 && s.g - s.b >= 15 && s.lum < 95)) return false;
    return stats(rgba, W, H, R.topbar).lum < 75;
  }
  function battleAt(rgba, W, H, pill) {
    const s = stats(rgba, W, H, pill);
    return s.white >= 0.55 && s.lum > 175 && Math.abs(s.r - s.b) < 12;
  }
  function noteAt(rgba, W, H, R) {
    if (stats(rgba, W, H, R.header).lum > 35) return false;
    const b = stats(rgba, W, H, R.blue);
    return b.b - b.r >= 45 && b.b > b.g && b.g > b.r && b.lum < 110;
  }
  function noteTitle(text) {
    const m = String(text || '').replace(/\s+/g, ' ').trim().match(/^(.{2,24}?)\s?['’`´‘]\s?s\s+Rec[o0]rd\b/i);
    return m ? m[1].trim() : null;
  }
  function roundOf(text) {
    const m = String(text || '').match(/r[o0]und\s*([12lI|])/i);
    return m ? (m[1] === '2' ? 2 : 1) : null;
  }
  /** [top, left, right, bottom] icons ({ code, score, sure } | null) -> the three that are heroes (weakest of four dropped). */
  function pickTeam(icons) {
    const got = [...(icons || [])];
    while (got.filter(Boolean).length > 3) {
      let weakest = -1;
      got.forEach((x, k) => {
        if (x && (weakest < 0 || x.score < got[weakest].score)) weakest = k;
      });
      got[weakest] = null;
    }
    return [...got.filter(Boolean), null, null, null].slice(0, 3);
  }

  /**
   * A player's page in Guild War (name panel left, Season Log right): the empty part of the name panel is one flat
   * slate colour, measured (46–53, 64–70, 85–89) with a spread of 1–3 on five real pages and nothing like it on any
   * other screen (DEVLOG #62). R: { bar } pixel rect of that empty part.
   */
  function pageAt(rgba, W, H, R) {
    const x0 = Math.max(0, Math.round(R.bar.x));
    const y0 = Math.max(0, Math.round(R.bar.y));
    const x1 = Math.min(W, Math.round(R.bar.x + R.bar.w));
    const y1 = Math.min(H, Math.round(R.bar.y + R.bar.h));
    // Most of the strip in the panel's slate colour (DEVLOG #72: was "all of it flat", and snowflakes drifting over the
    // panel made the page "left" for a moment, which cleared the card on the game). Measured: player pages 0.98-1.00
    // of the strip in this colour, every other screen at most 0.35.
    let n = 0;
    let inside = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const p = (y * W + x) * 4;
        const r = rgba[p];
        const g = rgba[p + 1];
        const b = rgba[p + 2];
        n++;
        if (r >= 36 && r <= 64 && g >= 54 && g <= 82 && b >= 72 && b <= 104 && b - r >= 18 && g > r) inside++;
      }
    }
    return n > 0 && inside / n >= 0.7;
  }

  const api = { stats, windowAt, roundResult, titleKind, plan, key, offenseAt, battleAt, noteAt, noteTitle, roundOf, pickTeam, pageAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7GWResult = api;
})(typeof window !== 'undefined' ? window : globalThis);
