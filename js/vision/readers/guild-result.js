/*
 * Reader: the Guild War BATTLE-RESULT window (DEVLOG #57). It opens from a row of a player's Season Log:
 * "Successful Attack" / "Failed Attack" / "Successful Defense" / "Failed Defense", from the point of view of the
 * player whose page is open (left); the opponent is on the right; two rounds, three heroes a side, a result each.
 *   guild:result { type: 'attack' | 'defense', ok, side: 'enemy' | 'ours' (whose page: the band's colour),
 *                  left:  { name, options, pic, official, known }, right: { … },
 *                  rounds: [{ result: 'victory' | 'defeat' | 'draw', left: [icon ×3], right: [icon ×3] }, …] }
 *                 icon = { code, score, sure } | null;  qid = its id in the waiting list (below)
 * The Guild War page turns it into attack / defense records (GuildApp.resultFromGame; js/gwresult.js plan()).
 * Every result is also kept in localStorage 'e7-gw-results' until that page has taken it (it may be closed).
 * Steps: a cheap pixel check on every pass (js/gwresult.js windowAt + roundResult); the same picture twice in a row;
 * then the title (text), the two names (js/vision/names.js, any writing) and the 12 hero icons (faces, shared with
 * the defense reader: window.E7GWFaces). A picture that was read is not read again.
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const R = window.E7GWResult;
  const L = window.E7Layouts;
  const G = window.E7GWMap;
  if (!V || !R || !L || !G) return;
  const small = document.createElement('canvas');
  const sctx = small.getContext('2d', { willReadFrequently: true });
  const tiny = document.createElement('canvas');
  tiny.width = 64;
  tiny.height = 36;
  const tctx = tiny.getContext('2d', { willReadFrequently: true });
  const forts = () => {
    try {
      return JSON.parse(localStorage.getItem('e7-gw-forts') || 'null') || {};
    } catch (_) {
      return {};
    }
  };
  let lastPic = null; // the window as last looked at (64×36 grey)
  let stable = 0; // passes in a row with that same picture
  let readPic = false; // that picture was read and published
  /** Mean difference to the window's picture of the pass before (255 = there was none). */
  function changed(src, b) {
    tctx.drawImage(src, b.x, b.y, b.w, b.h, 0, 0, 64, 36);
    const d = tctx.getImageData(0, 0, 64, 36).data;
    const g = new Uint8Array(64 * 36);
    for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
    let diff = 255;
    if (lastPic) {
      diff = 0;
      for (let i = 0; i < g.length; i++) diff += Math.abs(g[i] - lastPic[i]);
      diff /= g.length;
    }
    lastPic = g;
    return diff;
  }
  const reset = () => {
    lastPic = null;
    stable = 0;
    readPic = false;
  };

  V.register({
    id: 'guild-result',
    label: 'Guild War battle result (who beat whom, with which heroes)',
    module: 'guild',
    every: 1500,
    ready: () => true,
    idle: reset,
    async read(ctx) {
      const W = ctx.w();
      const H = ctx.h();
      const lay = L.layoutFor(W, H);
      if (!lay || !lay.regions.gwResTitle) return ctx.note('This window shape is too unusual for the built-in positions');
      // the cheap check, on a picture half the size of the 1070-high one
      const sc = 535 / H;
      small.width = Math.round(W * sc);
      small.height = 535;
      sctx.drawImage(ctx.source, 0, 0, small.width, small.height);
      const rgba = sctx.getImageData(0, 0, small.width, small.height).data;
      const sm = (k) => ({ x: lay.regions[k].x * small.width, y: lay.regions[k].y * small.height, w: lay.regions[k].w * small.width, h: lay.regions[k].h * small.height });
      const px = (k) => ({ x: lay.regions[k].x * W, y: lay.regions[k].y * H, w: lay.regions[k].w * W, h: lay.regions[k].h * H });
      const win = R.windowAt(rgba, small.width, small.height, { header: sm('gwResHeader'), band: sm('gwResBand') });
      const results = win ? [R.roundResult(rgba, small.width, small.height, sm('gwResRound1')), R.roundResult(rgba, small.width, small.height, sm('gwResRound2'))] : [];
      if (!win || !results[0] || !results[1]) {
        reset();
        return ctx.note('No battle-result window');
      }
      // the same picture twice in a row (the window fades in), and never read twice
      if (changed(ctx.source, px('gwResWindow')) < 4) stable++;
      else {
        stable = 0;
        readPic = false;
      }
      if (readPic) return;
      if (stable < 1) return ctx.note('Battle-result window: waiting for it to stand still…');
      const GF = window.E7GWFaces;
      const N = window.E7Names;
      if (!GF || !N) return ctx.note('Battle-result window: the name / face readers are not loaded');
      if (!GF.ready()) {
        GF.load();
        ctx.busy(`Reading this battle result… loading hero portraits ${GF.count()}/${GF.total}`);
        stable = 0; // come back when they are there
        return ctx.note(`Battle-result window: loading hero portraits ${GF.count()}/${GF.total}…`);
      }
      ctx.busy('Reading this battle result…');
      const title = await ctx.ocr(ctx.crop(lay.regions.gwResTitle, { minH: 72 }), { line: true });
      const kind = R.titleKind(title);
      if (!kind) {
        readPic = true;
        return ctx.note(`Not a battle-result window (title read as "${String(title).slice(0, 30)}")`);
      }
      // the left player's page: an enemy's (red band) or one of ours (green band) -> which server's names and language
      const f = forts();
      const srv = (side) => (side === 'ours' ? f.ourServer || '' : f.enemyServer || '');
      const other = win.side === 'ours' ? 'enemy' : 'ours';
      const nameOf = async (key, side) => {
        const n = await N.read(ctx, ctx.source, px(key), { lang: G.langFor(srv(side)), world: G.worldFor(srv(side)), clean: true });
        return n && n.name ? { name: n.name, options: n.options || [], pic: n.pic || '', official: !!n.official, known: !!n.known } : { name: '', options: [], pic: (n && n.pic) || '' };
      };
      const left = await nameOf('gwResNameL', win.side);
      const right = await nameOf('gwResNameR', other);
      const all = GF.all();
      const icon = (key) => {
        const r = GF.readIcon(ctx.source, px(key), all);
        return r ? { code: r.code, score: r.score, sure: r.sure } : null;
      };
      const rounds = [1, 2].map((r) => ({ result: results[r - 1], left: [1, 2, 3].map((k) => icon(`gwResL${r}${k}`)), right: [1, 2, 3].map((k) => icon(`gwResR${r}${k}`)) }));
      readPic = true;
      const sure = rounds.reduce((n, r) => n + [...r.left, ...r.right].filter((x) => x && x.sure).length, 0);
      const what = kind.draw ? `${kind.type === 'attack' ? 'Attack' : 'Defense'} draw` : `${kind.ok ? 'Successful' : 'Failed'} ${kind.type === 'attack' ? 'attack' : 'defense'}`;
      ctx.note(`${what}: ${left.name || '?'} vs ${right.name || '?'} · ${results.join(', ')} · ${sure}/12 heroes recognised`);
      const result = { type: kind.type, ok: kind.ok, side: win.side, left, right, rounds };
      // kept for the Guild War page, which may not be open right now (it takes them when it is; newest 12, 12 hours)
      try {
        const slim = (p) => ({ name: p.name, options: p.options });
        const list = (JSON.parse(localStorage.getItem('e7-gw-results') || '[]') || []).filter((x) => x && Date.now() - Date.parse(x.at || 0) < 12 * 3600 * 1000);
        result.qid = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
        list.push({ id: result.qid, at: new Date().toISOString(), d: { ...result, left: slim(left), right: slim(right) } });
        localStorage.setItem('e7-gw-results', JSON.stringify(list.slice(-12)));
      } catch (_) { /* only a help */ }
      ctx.publish('guild:result', result);
      if (!left.name || !right.name) ctx.done('Battle result read, but a name is missing: check it in the app (Guild War)', { ask: true });
      else ctx.done(`Battle result read: ${left.name} vs ${right.name}`);
    },
  });
})();
