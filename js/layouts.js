/*
 * Built-in screen layouts: where things are on the game screen, so nobody has to draw boxes.
 * Pure (Node + browser). Browser: window.E7Layouts. DEVLOG #25.
 *
 * Positions are written as fractions of a 16:9 GAME PICTURE (the desktop app cuts the window's title bar off, see
 * js/frame.js). Your own boxes always win; the built-in ones fill in whatever you haven't drawn.
 *
 * ANY WINDOW SIZE (DEVLOG #38). The game scales with the window HEIGHT and pins each thing to the left edge, the middle
 * or the right edge. Pixel-checked on the owner's Guild War screens, 16:9 (1228×691) vs wider (2000×1070):
 * the left UI (title, Havoc bar, guild emblems) matched exactly as 'l', the right UI (menu, shield/swords) as 'r', the
 * fortress map and the three fortresses as 'c' (offset 0 px each). So each region has an anchor `a` ('l' | 'c' | 'r');
 * layoutFor(w, h) places them for that picture. Regions whose anchor isn't verified yet list `alt` anchors; readers can
 * try those (alternatives()). Narrower than 16:9 (rare on PC): assumed to scale with the WIDTH, centred vertically.
 *
 * Sources of the numbers (label 'built-in'):
 *   - draft screen (pre-bans, pick slots): measured BY EYE from the owner's Steam draft screenshots pasted in chat
 *     (2026-11-12; no files yet), so they can be a few pixels off. Readers search around them.
 *   - result (VICTORY / DEFEAT): measured on tests/fixtures/screens/steam-rta-victory.png (pixel exact).
 *   - CR bars, opponent name, drafting help: not built in yet (need screenshots as files).
 * When real files arrive (Developer → Collect screenshots), re-measure and set `measured` to 'files'.
 */
(function (root) {
  'use strict';
  // helper: a box in pixels of a W×H game picture → fractions
  const px = (W, H) => (x, y, w, h) => ({ x: x / W, y: y / H, w: w / W, h: h / H });
  const d = px(1346, 757); // draft screenshots (game picture after removing the title bar)
  const v = px(1343, 758); // victory fixture
  const g = px(1228, 691); // Guild War enemy-defense file (pixel-measured)
  const ring = (cx, cy) => g(cx - 31, cy - 31, 62, 62); // a round hero icon (gold ring box)
  // a pre-ban icon: circle centre (fractions, E7DaT layout.py) and radius (fraction of the WIDTH) -> its box. Radius:
  // the gold ring on the owner's real draft picture (36 px of 1902, DEVLOG #63); E7DaT's 0.0235 is a looser box and
  // the face matcher, which expects the ring's own box, read none of the four pre-bans with it.
  const PB = { cx: [0.3146, 0.3585, 0.4169, 0.46], cy: 0.9438, r: 0.0187 };
  const pb = (k) => ({ x: PB.cx[k] - PB.r, y: PB.cy - (PB.r * 16) / 9, w: 2 * PB.r, h: (2 * PB.r * 16) / 9 });
  const REF = 16 / 9;
  // a box measured on a 2000×1070 picture of something CENTRED in the window (a pop-up window): fractions of the
  // 16:9 frame in the middle (1902 px wide there)
  const mid = (x, y, w, h) => ({ x: 0.5 + (x - 1000) / (1070 * REF), y: y / 1070, w: w / (1070 * REF), h: h / 1070 });
  const midRing = (cx, cy) => mid(cx - 48, cy - 48, 96, 96);
  // …of something pinned to the LEFT / RIGHT edge of the window
  const lft = (x, y, w, h) => ({ x: x / (1070 * REF), y: y / 1070, w: w / (1070 * REF), h: h / 1070 });
  const rgt = (x, y, w, h) => ({ x: 1 - (2000 - x) / (1070 * REF), y: y / 1070, w: w / (1070 * REF), h: h / 1070 });
  const bigRing = (cx, cy) => lft(cx - 68, cy - 68, 136, 136); // a hero on the Offense Team screen
  // anchors: a = 'l' | 'c' | 'r'; alt = other anchors worth trying (not verified on a non-16:9 picture yet)
  const A = (r, a, alt) => ({ ...r, a, ...(alt ? { alt } : {}) });

  const LAYOUTS = [
    {
      id: 'steam-16x9',
      label: 'Steam client, 16:9',
      aspect: 16 / 9,
      measured: { draft: 'pre-bans and pick cards: E7DaT (checked on a real screenshot); old pick boxes by eye', result: 'pixel exact from a real screenshot file' },
      regions: {
        // RTA draft: the four pre-ban icons (left two mine, right two the opponent's). Centres measured by E7DaT
        // (github.com/ohrgon-game/E7DaT, layout.py; 2600×1460 recordings); centres, radius and the anchor (middle)
        // checked on the owner's real draft picture, 2000×1070 (DEVLOG #63: Stark, Fern, Rhianna and Luciella,
        // Lisette all read). The 'l' alternative stays for window shapes not seen yet.
        mePreban1: A(pb(0), 'c', ['l']),
        mePreban2: A(pb(1), 'c', ['l']),
        oppPreban1: A(pb(2), 'c', ['l']),
        oppPreban2: A(pb(3), 'c', ['l']),
        mePickFirst: A(d(42, 129, 130, 70), 'l'),
        mePickLast: A(d(42, 550, 130, 70), 'l'),
        oppPickFirst: A(d(867, 129, 140, 70), 'r', ['c']),
        oppPickLast: A(d(867, 550, 140, 70), 'r', ['c']),
        result: A(v(470, 215, 410, 85), 'c'),
        // pre-ban picker ("Select Pre-Ban Hero"): the two heroes you selected, bottom middle (by eye, owner's screenshot)
        myPrebanPick1: A(v(669, 595, 84, 84), 'c'),
        myPrebanPick2: A(v(764, 595, 84, 84), 'c'),
        // Guild War enemy defense screen: the player's name and the two defense teams (round 1, round 2).
        // Pinned to the LEFT edge: pixel-checked on the owner's 2000×1070 enemy screen (offset 0 px as 'l', 48 px as 'c').
        gwName: A(g(138, 147, 110, 27), 'l'),
        gwDef1: A(ring(112, 381), 'l'),
        gwDef2: A(ring(182, 409), 'l'),
        gwDef3: A(ring(64, 439), 'l'),
        gwDef4: A(ring(314, 381), 'l'),
        gwDef5: A(ring(378, 409), 'l'),
        gwDef6: A(ring(259, 439), 'l'),
        // the FOURTH place of each team's formation (bottom of the diamond): a team is three heroes standing on three
        // of four places. By eye from the owner's 2000×1070 screenshot of a member's tower (DEVLOG #56); checked on
        // that screenshot as a file in DEVLOG #57 (round 1 on top / left / bottom: all three read).
        gwDef7: A(ring(130, 469), 'l'),
        gwDef8: A(ring(332, 469), 'l'),
        // Guild War battle-result window ("Successful Attack" / "Failed Defense" …), centred: measured on the owner's
        // 2000×1070 screenshots (DEVLOG #57). Title, the two names, the band between the sides, the icon over each
        // round's result, and the 12 hero icons: gwResL<round><n> (left player), gwResR<round><n> (right player).
        gwResTitle: A(mid(760, 222, 480, 62), 'c'),
        gwResHeader: A(mid(430, 205, 300, 80), 'c'),
        gwResBand: A(mid(930, 320, 140, 40), 'c'),
        gwResNameL: A(mid(622, 379, 300, 42), 'c'),
        gwResNameR: A(mid(1078, 379, 294, 42), 'c'),
        gwResRound1: A(mid(965, 548, 70, 68), 'c'),
        gwResRound2: A(mid(965, 713, 70, 68), 'c'),
        gwResWindow: A(mid(410, 190, 1180, 690), 'c'),
        ...Object.fromEntries(
          [603, 768].flatMap((cy, r) => [
            ...[525, 670, 815].map((cx, k) => [`gwResL${r + 1}${k + 1}`, A(midRing(cx, cy), 'c')]),
            ...[1180, 1326, 1470].map((cx, k) => [`gwResR${r + 1}${k + 1}`, A(midRing(cx, cy), 'c')]),
          ]),
        ),
        // RTA result screen: the green "Confirm" button, bottom right (owner's 2000×1070 screenshot of a match the
        // opponent left, DEVLOG #60; the older 16:9 Victory fixture has the same green there). Tells "a result is on
        // screen" without reading text.
        rtaConfirm: A(rgt(1740, 960, 190, 45), 'r'),
        // An arena battle's top bar (centred; measured on the owner's 2000×1070 battle pictures, DEVLOG #63): the "VS"
        // sign, each player's line ("Global ⊕ Name" / "Name ⊕ Global") and each guild's name (without its emblem)
        rtaBatVs: A(mid(930, 2, 140, 128), 'c'),
        rtaBatNameL: A(mid(630, 8, 300, 44), 'c'),
        rtaBatNameR: A(mid(1070, 8, 300, 44), 'c'),
        rtaBatGuildL: A(mid(640, 100, 248, 40), 'c'),
        rtaBatGuildR: A(mid(1112, 100, 150, 40), 'c'),
        // A player's page in Guild War: the empty part of the name panel (right of the name), pinned left (DEVLOG #62)
        // ARENA (DEVLOG #71), measured on the owner's 2000×1070 screens. Opponents list (3 rows, 190 apart, centred):
        // magnifier button, name, points, 4 defense heroes (round icons with class top left, level top right)
        arenaOppMag0: A(mid(1415, 303, 62, 62), 'c'),
        arenaOppName0: A(mid(636, 300, 264, 45), 'c'),
        arenaOppPts0: A(mid(636, 358, 170, 44), 'c'),
        arenaOppHero00: A(mid(907, 278, 110, 110), 'c'),
        arenaOppHero01: A(mid(1030, 278, 110, 110), 'c'),
        arenaOppHero02: A(mid(1153, 278, 110, 110), 'c'),
        arenaOppHero03: A(mid(1276, 278, 110, 110), 'c'),
        arenaOppMag1: A(mid(1415, 493, 62, 62), 'c'),
        arenaOppName1: A(mid(636, 490, 264, 45), 'c'),
        arenaOppPts1: A(mid(636, 548, 170, 44), 'c'),
        arenaOppHero10: A(mid(907, 468, 110, 110), 'c'),
        arenaOppHero11: A(mid(1030, 468, 110, 110), 'c'),
        arenaOppHero12: A(mid(1153, 468, 110, 110), 'c'),
        arenaOppHero13: A(mid(1276, 468, 110, 110), 'c'),
        arenaOppMag2: A(mid(1415, 683, 62, 62), 'c'),
        arenaOppName2: A(mid(636, 680, 264, 45), 'c'),
        arenaOppPts2: A(mid(636, 738, 170, 44), 'c'),
        arenaOppHero20: A(mid(907, 658, 110, 110), 'c'),
        arenaOppHero21: A(mid(1030, 658, 110, 110), 'c'),
        arenaOppHero22: A(mid(1153, 658, 110, 110), 'c'),
        arenaOppHero23: A(mid(1276, 658, 110, 110), 'c'),
        // team set-up before the fight: the big VS in the middle, the opponent's name and points (right, bright)
        arenaPrepVs: A(mid(800, 470, 260, 240), 'c'),
        arenaPrepName: A(mid(1330, 798, 230, 42), 'c'),
        arenaPrepPts: A(mid(1380, 838, 180, 42), 'c'),
        // result: VICTORY / DEFEAT, "Victory Points", the points and their change, my 4 heroes (left; the box sits a
        // little low: a heart covers the top of each portrait), Confirm (right)
        arenaResWord: A(mid(720, 315, 560, 95), 'c'),
        arenaResLabel: A(mid(890, 603, 220, 42), 'c'),
        arenaResPts: A(mid(920, 650, 165, 55), 'c'),
        arenaResDelta: A(mid(950, 712, 100, 40), 'c'),
        arenaResMine0: A(lft(44, 268, 112, 112), 'l'),
        arenaResMine1: A(lft(44, 427, 112, 112), 'l'),
        arenaResMine2: A(lft(44, 587, 112, 112), 'l'),
        arenaResMine3: A(lft(44, 747, 112, 112), 'l'),
        arenaResConfirm: A(rgt(1712, 940, 248, 85), 'r'),
        gwPageBar: A(lft(440, 228, 120, 74), 'l'),
        // Gear: an item's details panel (Inventory, a hero's gear, the shop), DEVLOG #74. Measured on the owner's 2000×1070
        // inventory pictures (weapon, helmet ×2, armor): the same layout for every item. Pinned right (tried centred too).
        gearType: A(rgt(1540, 254, 240, 66), 'r', ['c']), // "Epic Weapon" / "Otherworldly Epic Armor"
        gearLevel: A(rgt(1411, 266, 41, 30), 'r', ['c']), // "85" on the item picture
        gearEnhance: A(rgt(1484, 250, 58, 30), 'r', ['c']), // the "+6" badge
        gearMain: A(rgt(1400, 488, 520, 44), 'r', ['c']),
        ...Object.fromEntries([0, 1, 2, 3].map((k) => [`gearSub${k}`, A(rgt(1400, 552 + 33 * k, 520, 34), 'r', ['c'])])),
        gearScore: A(rgt(1400, 700, 520, 38), 'r', ['c']), // "Equipment Score 55" (yellow)
        gearScoreLabel: A(rgt(1405, 705, 235, 28), 'r', ['c']),
        gearSet: A(rgt(1455, 822, 265, 42), 'r', ['c']), // "Weakening Set (0/4)"
        // Guild War "Offense Team" screen (after choosing a defender, before Start): measured on the owner's 2000×1070
        // screenshot (DEVLOG #58). A team stands on three of four places: 1 top, 2 left, 3 right, 4 bottom.
        // gwOffM<team><place> = my teams (left, green), gwOffE<team><place> = the defender's teams (right, red).
        // Whether the teams are pinned to the left edge or centred on a 16:9 window is not known: both are tried.
        gwOffTitle: A(lft(95, 22, 300, 60), 'l'),
        gwOffStart: A(rgt(1700, 950, 160, 60), 'r'),
        gwOffTopbar: A(mid(400, 20, 900, 60), 'c'),
        gwOffEnemyName: A(lft(1000, 938, 335, 42), 'l', ['c']),
        ...Object.fromEntries(
          [0, 387].flatMap((dy, t) => [
            ...[[396, 230], [257, 330], [553, 317], [409, 405]].map(([cx, cy], k) => [`gwOffM${t + 1}${k + 1}`, A(bigRing(cx, cy + dy), 'l', ['c'])]),
            ...[[1206, 230], [1049, 317], [1347, 330], [1183, 403]].map(([cx, cy], k) => [`gwOffE${t + 1}${k + 1}`, A(bigRing(cx, cy + dy), 'l', ['c'])]),
          ]),
        ),
        // Guild War battle (the fight itself): "Round 1" pill and the two names at the top, centred
        gwBatRound: A(mid(925, 142, 150, 42), 'c'),
        gwBatNameL: A(mid(690, 74, 240, 40), 'c'),
        gwBatNameR: A(mid(1082, 74, 300, 40), 'c'),
        // Guild War note window ("<member>'s Record": a note a guildmate left on a defender), centred
        gwNoteHeader: A(mid(730, 215, 540, 30), 'c'),
        gwNoteTitle: A(mid(740, 230, 520, 62), 'c'),
        gwNoteBody: A(mid(740, 340, 520, 440), 'c'),
        gwNoteBlue: A(mid(740, 600, 520, 180), 'c'),
        // Guild War fortress map: the page indicator at the bottom right (white pill = which fortress), pixel-measured
        // (bar 0.42 h … 0.041 h from the right edge at 93.5% height, the same on 2000×1070 and 1228×691)
        gwFortPager: A(g(938, 630, 262, 32), 'r'),
        // the keep's defender (locked / gold badge in the middle of the castle): the same spot in every fortress, both sides
        gwKeepName: A(g(545, 371, 180, 32), 'c'),
        // Guild War overview: the band with the three fortress names (and, at the bottom right, the shield/swords switch
        // in the same place as gwFortPager). Middle-anchored, measured on both sides' overviews.
        gwFortNames: A(g(307, 404, 921, 55), 'c'),
        // Guild War overview, left panel: our guild's name (green bar) and the enemy guild's (red bar), each followed by a
        // server tag ("Global"). Pinned left; the same place on both sides' overviews (owner's 2000×1070 and 1228×691).
        gwOurGuild: A(g(32, 240, 181, 24), 'l'),
        gwEnemyGuild: A(g(32, 505, 181, 24), 'l'),
        // Guild War overview, top left: "War Ends  in 17h" (owner's 2000×1070 overview of a running war, DEVLOG #55)
        gwWarEnds: A(g(30, 84, 170, 40), 'l'),
      },
    },
  ];

  // the parts the RTA reader uses, and which boxes make each part
  const PARTS = [
    { id: 'draft', label: 'Draft screen (pre-bans + pick slots)', keys: ['mePreban1', 'mePreban2', 'oppPreban1', 'oppPreban2', 'mePickFirst', 'mePickLast', 'oppPickFirst', 'oppPickLast'] },
    { id: 'oppName', label: "Opponent's name", keys: ['oppName'], optional: true },
    { id: 'cr', label: 'Battle: CR bar', keys: ['crBar'], optional: true },
    { id: 'crx', label: 'Battle: expanded CR bar', keys: ['crBarExpanded'], optional: true },
    { id: 'result', label: 'Victory / Defeat', keys: ['result'], optional: true },
    { id: 'help', label: "Game's drafting help", keys: ['helpFirst', 'helpLast'], optional: true },
  ];

  /** Put one 16:9 region into a w×h picture with anchor `a` (fractions of w×h). */
  function place(r, w, h, a) {
    const ar = w / h;
    if (Math.abs(ar - REF) < 0.005) return { x: r.x, y: r.y, w: r.w, h: r.h };
    if (ar > REF) {
      const refW = REF * h; // the game's 16:9 "design width" at this height, in pixels
      const off = a === 'l' ? 0 : a === 'r' ? w - refW : (w - refW) / 2;
      return { x: (off + r.x * refW) / w, y: r.y, w: (r.w * refW) / w, h: r.h };
    }
    const refH = w / REF; // narrower: scales with the width, centred vertically (assumed)
    const off = (h - refH) / 2;
    return { x: r.x, y: (off + r.y * refH) / h, w: r.w, h: (r.h * refH) / h };
  }
  /** The built-in layout placed for a game picture of this size (null for odd shapes). Regions: fractions of w×h. */
  function layoutFor(w, h) {
    if (!w || !h) return null;
    const ar = w / h;
    if (ar < 1.2 || ar > 2.6) return null;
    const base = LAYOUTS[0];
    const regions = {};
    for (const [k, r] of Object.entries(base.regions)) regions[k] = place(r, w, h, r.a || 'c');
    return { id: base.id, label: base.label, aspect: ar, measured: base.measured, regions, exact: Math.abs(ar - REF) < 0.03 };
  }
  // Guild War stronghold (keep) screen: a banner ("One of the two Defense Towers must be destroyed first…") pushes the
  // teams down by this share of the height (78 px at 1070, measured on the owner's 2000×1070 screenshot, DEVLOG #56)
  const GW_DEF_SHIFTS = [0, 78 / 1070];
  /** Every placement worth trying for one region in a w×h picture: [{ anchor, rect }] (main anchor first). */
  function alternatives(w, h, key) {
    const r = LAYOUTS[0].regions[key];
    if (!r || !w || !h) return [];
    const anchors = [r.a || 'c', ...(r.alt || [])];
    const out = [];
    for (const a of anchors) {
      const rect = place(r, w, h, a);
      if (!out.some((o) => Math.abs(o.rect.x - rect.x) < 1e-4)) out.push({ anchor: a, rect });
    }
    return out;
  }
  /** Boxes to use: built-in ones, with your own on top. */
  function effective(own, layout) {
    return { ...((layout && layout.regions) || {}), ...(own || {}) };
  }
  /** For each part: 'mine' (all your boxes), 'built-in', 'mixed' or 'missing'. */
  function status(own, layout) {
    const o = own || {};
    const b = (layout && layout.regions) || {};
    return PARTS.map((p) => {
      const mine = p.keys.filter((k) => o[k]).length;
      const built = p.keys.filter((k) => !o[k] && b[k]).length;
      const state = mine === p.keys.length ? 'mine' : mine + built < p.keys.length ? 'missing' : mine ? 'mixed' : 'built-in';
      return { ...p, state };
    });
  }
  const same = (a, b) => !!a && !!b && ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) < 0.003);
  /** Keep only boxes that differ from the built-in ones (so "built-in" stays visible as built-in). */
  function ownOnly(regions, layout) {
    const b = (layout && layout.regions) || {};
    const out = {};
    for (const [k, r] of Object.entries(regions || {})) if (r && !same(r, b[k])) out[k] = r;
    return out;
  }

  const api = { LAYOUTS, PARTS, REF, GW_DEF_SHIFTS, place, layoutFor, alternatives, effective, status, ownOnly };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7Layouts = api;
})(typeof self !== 'undefined' ? self : this);
