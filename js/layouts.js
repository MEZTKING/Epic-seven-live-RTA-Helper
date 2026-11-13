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
  const REF = 16 / 9;
  // anchors: a = 'l' | 'c' | 'r'; alt = other anchors worth trying (not verified on a non-16:9 picture yet)
  const A = (r, a, alt) => ({ ...r, a, ...(alt ? { alt } : {}) });

  const LAYOUTS = [
    {
      id: 'steam-16x9',
      label: 'Steam client, 16:9',
      aspect: 16 / 9,
      measured: { draft: 'by eye from chat screenshots', result: 'pixel exact from a real screenshot file' },
      regions: {
        // RTA (anchors guessed from where they sit; no wider RTA screenshot yet)
        mePreban1: A(d(403, 653, 52, 52), 'c', ['l']),
        mePreban2: A(d(459, 653, 52, 52), 'c', ['l']),
        oppPreban1: A(d(537, 653, 52, 52), 'c', ['l']),
        oppPreban2: A(d(593, 653, 52, 52), 'c', ['l']),
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

  const api = { LAYOUTS, PARTS, REF, place, layoutFor, alternatives, effective, status, ownOnly };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7Layouts = api;
})(typeof self !== 'undefined' ? self : this);
