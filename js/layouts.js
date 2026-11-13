/*
 * Built-in screen layouts: where things are on the game screen, so nobody has to draw boxes.
 * Pure (Node + browser). Browser: window.E7Layouts. DEVLOG #25.
 *
 * Positions are fractions of the 16:9 GAME PICTURE (the desktop app cuts the window's title bar off, see
 * GameArea.window16x9). Your own boxes always win; the built-in ones fill in whatever you haven't drawn.
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

  const LAYOUTS = [
    {
      id: 'steam-16x9',
      label: 'Steam client, 16:9',
      aspect: 16 / 9,
      measured: { draft: 'by eye from chat screenshots', result: 'pixel exact from a real screenshot file' },
      regions: {
        mePreban1: d(403, 653, 52, 52),
        mePreban2: d(459, 653, 52, 52),
        oppPreban1: d(537, 653, 52, 52),
        oppPreban2: d(593, 653, 52, 52),
        mePickFirst: d(42, 129, 130, 70),
        mePickLast: d(42, 550, 130, 70),
        oppPickFirst: d(867, 129, 140, 70),
        oppPickLast: d(867, 550, 140, 70),
        result: v(470, 215, 410, 85),
        // pre-ban picker ("Select Pre-Ban Hero"): the two heroes you selected, bottom middle (by eye, owner's screenshot)
        myPrebanPick1: v(669, 595, 84, 84),
        myPrebanPick2: v(764, 595, 84, 84),
        // Guild War enemy defense screen: the player's name and the two defense teams (round 1, round 2)
        gwName: g(138, 147, 110, 27),
        gwDef1: ring(112, 381),
        gwDef2: ring(182, 409),
        gwDef3: ring(64, 439),
        gwDef4: ring(314, 381),
        gwDef5: ring(378, 409),
        gwDef6: ring(259, 439),
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

  /** The built-in layout for a game picture of this size (null if its shape isn't one we know). */
  function layoutFor(w, h) {
    if (!w || !h) return null;
    return LAYOUTS.find((l) => Math.abs(w / h - l.aspect) < 0.03) || null;
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

  const api = { LAYOUTS, PARTS, layoutFor, effective, status, ownOnly };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7Layouts = api;
})(typeof self !== 'undefined' ? self : this);
