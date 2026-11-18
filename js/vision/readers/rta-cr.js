/*
 * Reader: the CR (turn order) bar at the START of an arena battle (DEVLOG #69). No box to draw: the bar's place is
 * built in (E7Draft.CR_BAR, measured on the owner's battle pictures). Publishes once per match
 *   'rta:cr' { readings: [{ code, side: 'me' | 'opp', cr, score }] }
 * The RTA page turns it into the opponent's speeds (RTALogic.speedsFromCR, with your own heroes' speeds as the yardstick)
 * and saves them as scouting (method 'cr-read').
 *
 * How: for 25 s after the battle's "VS" bar first shows (only after an arena draft), the column of round portraits
 * at the left is compared with the ten heroes of that draft (the game's round icons, js/vision/icons.js); one hero per
 * place; CR % from the height. The same answer twice (within 3 %) counts. At the start of a battle the bar's numbers
 * come from speed alone, which is what makes speeds out of them; later, pushes and cuts change them, so only the start
 * is read. Only looks at the picture.
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const D = window.E7Draft;
  const L = window.E7Layouts;
  const F = window.RTAFaces;
  const I = window.E7Icons;
  if (!V || !D || !L || !F || !I) return;
  const AFTER_DRAFT_MS = 8 * 60 * 1000;
  const WINDOW_MS = 25000;
  let doneFor = 0;
  let firstVs = { for: 0, at: 0 };
  let prev = null;
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const one = [{ k: 1, dx: 0, dy: 0 }];

  function scan(ctx, team) {
    const H = ctx.h();
    const B = D.CR_BAR;
    const x = B.x * H;
    const half = B.r * H;
    const tpl = I.all().filter((t) => team.has(t.code));
    const rows = [];
    for (let y = B.top * H; y <= B.bottom * H; y += Math.max(2, 3 * (H / 1070))) {
      const r = F.classify(F.fromRect(ctx.source, { x: x - half, y: y - half, w: 2 * half, h: 2 * half }, one), tpl);
      if (!r.empty && r.best) rows.push({ y, code: r.best.code, score: r.best.score, lead: r.lead });
    }
    return D.barPeaks(rows, H);
  }

  V.register({
    id: 'rta-cr',
    label: 'RTA battle start: the CR bar -> the opponent\'s speeds',
    module: 'rta',
    every: 600,
    ready: () => true,
    async read(ctx) {
      const R = window.E7RtaDraft;
      const seen = (R && R.seenAt) || 0;
      if (!seen || performance.now() - seen > AFTER_DRAFT_MS) return ctx.note('No arena match going on');
      if (R.tracker && R.tracker.stage !== 'idle') return ctx.note('Draft in progress');
      if (doneFor === seen) return ctx.note('CR bar already read for this match');
      const last = R.tracker && R.tracker.last;
      if (!last) return ctx.note('No draft to compare the bar with');
      const lay = L.layoutFor(ctx.w(), ctx.h());
      if (!lay || !lay.regions.rtaBatVs) return ctx.note('This window shape is too unusual for the built-in positions');
      const vs = lay.regions.rtaBatVs;
      cv.width = 70;
      cv.height = 65;
      cx.drawImage(ctx.source, vs.x * ctx.w(), vs.y * ctx.h(), vs.w * ctx.w(), vs.h * ctx.h(), 0, 0, 70, 65);
      if (D.vsFlame(cx.getImageData(0, 0, 70, 65).data) < 0.1) return ctx.note('No battle on screen');
      if (firstVs.for !== seen) firstVs = { for: seen, at: performance.now() };
      if (performance.now() - firstVs.at > WINDOW_MS) {
        doneFor = seen;
        return ctx.note('The start of the battle has passed: the CR bar was not read for this match');
      }
      if (!I.ready()) {
        I.load();
        return ctx.note('Loading hero portraits…');
      }
      const side = new Map();
      (last.own || []).forEach((c) => c && side.set(c, 'me'));
      (last.enemy || []).forEach((c) => c && side.set(c, 'opp'));
      const peaks = scan(ctx, new Set(side.keys()));
      if (peaks.length < 2) {
        prev = null;
        return ctx.note(`Battle start: ${peaks.length} hero on the CR bar so far`);
      }
      const same = prev && peaks.length === prev.length && peaks.every((p) => prev.some((q) => q.code === p.code && Math.abs(q.cr - p.cr) <= 3));
      prev = peaks;
      if (!same) return ctx.note(`Battle start: ${peaks.length} heroes on the CR bar, checking once more`);
      doneFor = seen;
      const readings = peaks.map((p) => ({ code: p.code, side: side.get(p.code), cr: p.cr, score: p.score }));
      ctx.publish('rta:cr', { readings });
      ctx.note(`CR bar at the battle start: ${readings.map((r) => `${r.side === 'me' ? 'you' : 'them'} ${r.cr}%`).join(', ')}`);
    },
  });
})();
