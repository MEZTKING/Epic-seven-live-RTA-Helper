/*
 * Readers for the game's ARENA (DEVLOG #71); built-in positions (js/layouts.js arena*), nothing to draw or teach.
 *   'arena:opponents' { list: [{ name, pts, heroes: [code|null ×4], sure: [bool ×4] }] }   the Opponents screen
 *   'arena:prep'      { name, pts }                                    the team set-up screen before a fight
 *   'arena:result'    { result: 'win'|'loss', points, delta, mine: [code|null ×4] }       the result screen
 * How each screen is recognised (measured on the owner's screens):
 *   - Opponents: the three magnifier buttons on the right of the rows look the same (correlation 0.99–1.00) and dark;
 *     on every other screen they don't.
 *   - Set-up: the big flame-coloured "VS" in the middle (E7Draft.vsFlame), then the name must read.
 *   - Result: the green Confirm button bottom right AND the words "Victory Points" (an RTA result has the button but
 *     not the words).
 * A screen is read when it stands still (the same small picture twice) and once until it changes. Only looks.
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const L = window.E7Layouts;
  const D = window.E7Draft;
  const A = window.E7Arena;
  const F = window.RTAFaces;
  const I = window.E7Icons;
  if (!V || !L || !A || !F || !I) return;

  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const px = (ctx, key) => {
    const lay = L.layoutFor(ctx.w(), ctx.h());
    const r = lay && lay.regions[key];
    return r ? { x: r.x * ctx.w(), y: r.y * ctx.h(), w: r.w * ctx.w(), h: r.h * ctx.h() } : null;
  };
  const grab = (ctx, r, w, h) => {
    cv.width = w;
    cv.height = h;
    cx.drawImage(ctx.source, r.x, r.y, r.w, r.h, 0, 0, w, h);
    return cx.getImageData(0, 0, w, h).data;
  };
  const grey = (d) => {
    const g = new Float32Array(d.length / 4);
    for (let i = 0; i < g.length; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    return g;
  };
  const corr = (a, b) => {
    let ma = 0;
    let mb = 0;
    for (let i = 0; i < a.length; i++) {
      ma += a[i];
      mb += b[i];
    }
    ma /= a.length;
    mb /= b.length;
    let s = 0;
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < a.length; i++) {
      s += (a[i] - ma) * (b[i] - mb);
      sa += (a[i] - ma) ** 2;
      sb += (b[i] - mb) ** 2;
    }
    return s / Math.sqrt(sa * sb + 1e-9);
  };
  const mean = (g) => g.reduce((s, v) => s + v, 0) / g.length;
  /** A small grey picture of an area, to tell whether the screen changed / stands still. */
  const thumb = (ctx, r) => grey(grab(ctx, r, 48, 27));
  const diff = (a, b) => {
    if (!a || !b) return 255;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
    return s / a.length;
  };
  const text = async (ctx, key) => {
    const lay = L.layoutFor(ctx.w(), ctx.h());
    return String((await ctx.ocr(ctx.crop(lay.regions[key], { minH: 64 }), { line: true })) || '').trim();
  };
  const nameAt = async (ctx, key) => {
    const N = window.E7Names;
    const r = px(ctx, key);
    if (N && r) {
      const n = await N.read(ctx, ctx.source, r, { clean: true, offerOnly: true });
      if (n && n.name) return n.name;
    }
    const t = await text(ctx, key);
    return (t.split(/\s+/).find((w) => /[\p{L}\p{N}]{2,}/u.test(w)) || '').replace(/[^\p{L}\p{N}_-]/gu, '');
  };

  // ---- the Opponents screen ----------------------------------------------------------------------------------------
  function isOpponents(ctx) {
    const g = [0, 1, 2].map((k) => {
      const r = px(ctx, 'arenaOppMag' + k);
      return r ? grey(grab(ctx, r, 16, 16)) : null;
    });
    if (g.some((x) => !x)) return false;
    return g.every((x) => mean(x) < 70) && corr(g[0], g[1]) > 0.9 && corr(g[0], g[2]) > 0.9;
  }
  let oppSeen = { pic: null, stable: 0, read: false };
  V.register({
    id: 'arena-opponents',
    label: 'Arena: the opponents list (names, points, defenses)',
    module: 'arena',
    every: 1200,
    ready: () => true,
    async read(ctx) {
      if (!L.layoutFor(ctx.w(), ctx.h())) return ctx.note('This window shape is too unusual for the built-in positions');
      if (!isOpponents(ctx)) {
        oppSeen = { pic: null, stable: 0, read: false };
        return ctx.note('Not the arena opponents list');
      }
      const area = px(ctx, 'arenaOppName0');
      const pic = thumb(ctx, { x: area.x, y: area.y, w: px(ctx, 'arenaOppMag2').x + 60 - area.x, h: px(ctx, 'arenaOppMag2').y + 60 - area.y });
      if (diff(pic, oppSeen.pic) > 4) {
        oppSeen = { pic, stable: 0, read: false };
        return ctx.note('Arena opponents: waiting for the list to stand still…');
      }
      if (oppSeen.read) return ctx.note('Arena opponents read');
      const GF = window.E7GWFaces;
      if (!GF || !GF.ready()) {
        if (GF) GF.load();
        return ctx.note('Arena opponents: loading hero portraits…');
      }
      ctx.busy('Reading your arena opponents…');
      const list = [];
      for (let k = 0; k < 3; k++) {
        const name = await nameAt(ctx, 'arenaOppName' + k);
        const pts = A.points(await text(ctx, 'arenaOppPts' + k));
        const heroes = [];
        const sure = [];
        for (let i = 0; i < 4; i++) {
          const r = GF.readIcon(ctx.source, px(ctx, `arenaOppHero${k}${i}`));
          heroes.push(r && r.code ? r.code : null);
          sure.push(!!(r && r.sure));
        }
        if (name) list.push({ name, pts, heroes, sure });
      }
      oppSeen.read = true;
      if (!list.length) return ctx.done('Arena opponents: no names read');
      ctx.publish('arena:opponents', { list });
      ctx.done(`Arena: ${list.length} opponents read`);
      ctx.note(`Arena opponents: ${list.map((o) => `${o.name} (${o.pts || '?'})`).join(', ')}`);
    },
  });

  // ---- the team set-up screen --------------------------------------------------------------------------------------
  let prepLast = { name: '', at: -Infinity };
  V.register({
    id: 'arena-prep',
    label: 'Arena: the team set-up screen (who you are about to fight)',
    module: 'arena',
    every: 1500,
    ready: () => true,
    async read(ctx) {
      const vs = px(ctx, 'arenaPrepVs');
      if (!vs || !D || D.vsFlame(grab(ctx, vs, 60, 56)) < 0.08) return ctx.note('Not the arena team set-up');
      if (window.E7RtaDraft && window.E7RtaDraft.tracker && window.E7RtaDraft.tracker.stage !== 'idle') return ctx.note('An RTA draft is on');
      if (performance.now() - prepLast.at < 20000) return ctx.note(`Arena set-up: ${prepLast.name || '?'}`);
      const name = await nameAt(ctx, 'arenaPrepName');
      const pts = A.points(await text(ctx, 'arenaPrepPts'));
      if (!name || pts === null) return ctx.note('Arena set-up: the opponent was not read (yet)');
      prepLast = { name, at: performance.now() };
      ctx.publish('arena:prep', { name, pts });
      ctx.note(`Arena set-up: about to fight ${name} (${pts} pts)`);
    },
  });

  // ---- the result screen -------------------------------------------------------------------------------------------
  let resSeen = { pic: null, read: false };
  function confirmGreen(ctx) {
    const r = px(ctx, 'arenaResConfirm');
    if (!r) return false;
    const d = grab(ctx, r, 40, 14);
    let g = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 1] > d[i] + 25 && d[i + 1] > d[i + 2] + 15 && d[i + 1] > 60) g++;
    return g / (d.length / 4) > 0.2;
  }
  /** The arrow beside the change: green = up, red = down. */
  function arrowUp(ctx) {
    const r = px(ctx, 'arenaResDelta');
    const d = grab(ctx, { x: r.x, y: r.y, w: r.w * 0.35, h: r.h }, 16, 16);
    let gr = 0;
    let rd = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 1] > d[i] + 40 && d[i + 1] > 90) gr++;
      if (d[i] > d[i + 1] + 40 && d[i] > 90) rd++;
    }
    return gr >= rd;
  }
  V.register({
    id: 'arena-result',
    label: 'Arena: the result of a fight',
    module: 'arena',
    every: 1500,
    ready: () => true,
    async read(ctx) {
      if (!confirmGreen(ctx)) {
        resSeen = { pic: null, read: false };
        return ctx.note('No result screen');
      }
      const pic = thumb(ctx, px(ctx, 'arenaResPts'));
      if (diff(pic, resSeen.pic) > 4) {
        resSeen = { pic, read: false };
        return ctx.note('Result screen: waiting for it to stand still…');
      }
      if (resSeen.read) return ctx.note('Arena result read');
      resSeen.read = true;
      const label = (await text(ctx, 'arenaResLabel')).toUpperCase();
      if (!/POINT|VICTORY P|ICTORY/.test(label)) return ctx.note('A result screen, not the arena\'s');
      const result = A.resultWord(await text(ctx, 'arenaResWord'));
      const points = A.points(await text(ctx, 'arenaResPts'));
      const delta = A.delta(await text(ctx, 'arenaResDelta'), arrowUp(ctx));
      if (!result) return ctx.note('Arena result: VICTORY / DEFEAT not read');
      const mine = [];
      for (let i = 0; i < 4; i++) {
        const r = F.classify(F.fromRect(ctx.source, px(ctx, 'arenaResMine' + i), F.WIDE_VARIANTS), I.all()); // (skins too: your own heroes may wear one)
        // (there is always a hero on these four places, so a slightly lower bar than for a place that may be empty;
        // measured: right heroes 0.81-0.93 with a lead of 0.12-0.17)
        mine.push(!r.empty && r.best && (F.isConfident(r) || F.isConfident(r, 0.76, 0.1)) ? r.best.code : null);
      }
      ctx.publish('arena:result', { result, points, delta, mine });
      ctx.done(`Arena: ${result === 'win' ? 'victory' : 'defeat'} logged`);
      ctx.note(`Arena result: ${result}, ${points} pts (${delta > 0 ? '+' : ''}${delta})`);
    },
  });
})();
