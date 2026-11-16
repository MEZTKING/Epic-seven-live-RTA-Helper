/*
 * Readers for three more Guild War screens (DEVLOG #58). Each starts with a cheap pixel check (js/gwresult.js), reads
 * only when the picture has changed, and shows the working card while it reads.
 *
 * 1) guild-offense: the "Offense Team" screen (after choosing a defender, before Start): my two teams on the left,
 *    the defender's two teams on the right, the defender's name at the bottom.
 *      guild:offense { enemy: { name, options, pic }, rect, mine: [[icon ×3], [icon ×3]], theirs: [[…], […]] }
 *      guild:offense { away: true }   once, when that screen is left
 * 2) guild-battle: the fight itself ("Round 1" pill, the two names at the top): the attack really started.
 *      guild:battle { round: 1 | 2, left: { name, options }, right: { name, options } }
 * 3) guild-note: the note window ("<member>'s Record"): a note a guildmate left on a defender.
 *      guild:note { author, text }
 * icon = { code, score, sure } | null. The Guild War page uses them (GuildApp.offenseFromGame / battleFromGame /
 * noteFromGame).
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const R = window.E7GWResult;
  const L = window.E7Layouts;
  const G = window.E7GWMap;
  if (!V || !R || !L || !G) return;
  const forts = () => {
    try {
      return JSON.parse(localStorage.getItem('e7-gw-forts') || 'null') || {};
    } catch (_) {
      return {};
    }
  };
  /** The game picture at half the 1070 height, for the pixel checks: { rgba, W, H, at(key) -> pixel rect } or null. */
  const small = document.createElement('canvas');
  const sctx = small.getContext('2d', { willReadFrequently: true });
  function look(ctx) {
    const lay = L.layoutFor(ctx.w(), ctx.h());
    if (!lay || !lay.regions.gwOffTitle) return null;
    small.width = Math.round((ctx.w() * 535) / ctx.h());
    small.height = 535;
    sctx.drawImage(ctx.source, 0, 0, small.width, small.height);
    const rgba = sctx.getImageData(0, 0, small.width, small.height).data;
    const frac = (k) => lay.regions[k];
    return {
      lay,
      rgba,
      W: small.width,
      H: small.height,
      at: (k) => ({ x: frac(k).x * small.width, y: frac(k).y * small.height, w: frac(k).w * small.width, h: frac(k).h * small.height }),
      px: (r) => ({ x: r.x * ctx.w(), y: r.y * ctx.h(), w: r.w * ctx.w(), h: r.h * ctx.h() }),
    };
  }
  /** Has this part of the picture changed since the last look? One keeper per reader. */
  function watcher() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 36;
    const x = c.getContext('2d', { willReadFrequently: true });
    let last = null;
    return {
      diff(src, b) {
        x.drawImage(src, b.x, b.y, b.w, b.h, 0, 0, 64, 36);
        const d = x.getImageData(0, 0, 64, 36).data;
        const g = new Uint8Array(64 * 36);
        for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
        let v = 255;
        if (last) {
          v = 0;
          for (let i = 0; i < g.length; i++) v += Math.abs(g[i] - last[i]);
          v /= g.length;
        }
        last = g;
        return v;
      },
      reset() {
        last = null;
      },
    };
  }
  const nameOut = (n) => (n && n.name ? { name: n.name, options: n.options || [], pic: n.pic || '' } : { name: '', options: [], pic: (n && n.pic) || '' });

  // ------------------------------------------------------------------ 1) Offense Team
  const offW = watcher();
  let offShown = false;
  let offTitleOk = false;
  let offStable = 0;
  let offRead = false;
  let offKey = '';
  const offReset = () => {
    offW.reset();
    offTitleOk = offRead = false;
    offStable = 0;
    offKey = '';
  };
  V.register({
    id: 'guild-offense',
    label: 'Guild War Offense Team (their defense, your teams)',
    module: 'guild',
    every: 1500,
    ready: () => true,
    idle: offReset,
    async read(ctx) {
      const s = look(ctx);
      if (!s) return ctx.note('This window shape is too unusual for the built-in positions');
      if (!R.offenseAt(s.rgba, s.W, s.H, { start: s.at('gwOffStart'), topbar: s.at('gwOffTopbar') })) {
        if (offShown) ctx.publish('guild:offense', { away: true });
        offShown = false;
        offReset();
        return ctx.note('Not the Offense Team screen');
      }
      // the part with the teams and the names: read again only when it changed and then stood still
      const area = { x: 0.04 * ctx.w(), y: 0.12 * ctx.h(), w: 0.7 * ctx.w(), h: 0.84 * ctx.h() };
      if (offW.diff(ctx.source, area) < 3) offStable++;
      else {
        offStable = 0;
        offRead = false;
      }
      if (offRead) return;
      if (offStable < 1) return ctx.note('Offense Team screen: waiting for it to stand still…');
      const GF = window.E7GWFaces;
      const N = window.E7Names;
      if (!GF || !N) return ctx.note('Offense Team screen: the name / face readers are not loaded');
      if (!offTitleOk) {
        const title = await ctx.ocr(ctx.crop(s.lay.regions.gwOffTitle, { minH: 64 }), { line: true });
        if (!/of+en[sc]e\s*team/i.test(String(title))) {
          offRead = true;
          return ctx.note(`Not the Offense Team screen (title read as "${String(title).slice(0, 24)}")`);
        }
        offTitleOk = true;
      }
      if (!GF.ready()) {
        GF.load();
        offStable = 0;
        ctx.busy(`Reading both teams… loading hero portraits ${GF.count()}/${GF.total}`);
        return ctx.note(`Offense Team screen: loading hero portraits ${GF.count()}/${GF.total}…`);
      }
      ctx.busy('Reading both teams…');
      const all = GF.all();
      // every placement the layout offers (pinned left / centred): the one that recognises the most heroes wins
      const tries = L.alternatives(ctx.w(), ctx.h(), 'gwOffM11').length;
      const readAt = (k) => {
        // the face matcher is touchy about the size of the box: three sizes around the measured one (116 / 128 /
        // 140 px at 1070 height; on the owner's screenshot one size gave 6 of 12 sure, the best of three 12 of 12)
        const icon = (key) => {
          const alts = L.alternatives(ctx.w(), ctx.h(), key);
          const box = s.px((alts[k] || alts[0]).rect);
          let best = null;
          for (const f of [0.85, 0.94, 1.03]) {
            const r = GF.readIcon(ctx.source, { x: box.x + (box.w * (1 - f)) / 2, y: box.y + (box.h * (1 - f)) / 2, w: box.w * f, h: box.h * f }, all);
            if (r && (!best || (r.sure ? 1 : 0) > (best.sure ? 1 : 0) || (r.sure === best.sure && r.score > best.score))) best = r;
          }
          return best ? { code: best.code, score: best.score, sure: best.sure } : null;
        };
        const team = (side, t) => R.pickTeam([1, 2, 3, 4].map((p) => icon(`gwOff${side}${t}${p}`)));
        return { k, mine: [team('M', 1), team('M', 2)], theirs: [team('E', 1), team('E', 2)] };
      };
      const rank = (o) => [...o.mine, ...o.theirs].flat().reduce((a, x) => a + (x ? (x.sure ? 10 : 0) + x.score : 0), 0);
      let best = null;
      for (let k = 0; k < tries; k++) {
        const o = readAt(k);
        if (!best || rank(o) > rank(best)) best = o;
      }
      const nameAlts = L.alternatives(ctx.w(), ctx.h(), 'gwOffEnemyName');
      const rect = (nameAlts[best.k] || nameAlts[0]).rect;
      const server = forts().enemyServer || '';
      const enemy = nameOut(await N.read(ctx, ctx.source, s.px(rect), { lang: G.langFor(server), world: G.worldFor(server), clean: true }));
      offRead = true;
      const sure = (teams) => teams.flat().filter((x) => x && x.sure).length;
      ctx.note(`Offense Team vs ${enemy.name || '?'}: their defense ${sure(best.theirs)}/6, your teams ${sure(best.mine)}/6 heroes recognised`);
      const key = `${enemy.name}|${[...best.mine, ...best.theirs].map((t) => t.map((x) => (x && x.sure ? x.code : '-')).join(',')).join('|')}`;
      offShown = true;
      if (key === offKey) return;
      offKey = key;
      ctx.publish('guild:offense', { enemy, rect, mine: best.mine, theirs: best.theirs });
      ctx.done(enemy.name ? `Their defense read: ${enemy.name}` : 'Their defense read, but not the name: check it in the app (Guild War)', enemy.name ? undefined : { ask: true });
    },
  });

  // ------------------------------------------------------------------ 2) the fight
  const batW = watcher();
  let batKey = '';
  let batAt = 0;
  V.register({
    id: 'guild-battle',
    label: 'Guild War battle (who fights whom, which round)',
    module: 'guild',
    every: 2000,
    ready: () => true,
    idle() {
      batKey = '';
      batAt = 0;
      batW.reset();
    },
    async read(ctx) {
      const s = look(ctx);
      if (!s) return;
      if (!R.battleAt(s.rgba, s.W, s.H, s.at('gwBatRound'))) {
        batKey = '';
        batAt = 0;
        return ctx.note('No battle on screen');
      }
      // the pill is there all through the fight: look at its text when it changes, and every 20 s
      const pill = s.px(s.lay.regions.gwBatRound);
      const moved = batW.diff(ctx.source, pill) >= 3;
      if (!moved && batKey && Date.now() - batAt < 20000) return;
      const N = window.E7Names;
      const round = R.roundOf(await ctx.ocr(ctx.crop(s.lay.regions.gwBatRound, { minH: 64 }), { line: true }));
      if (!round) return ctx.note('No battle on screen (no "Round" label)');
      batAt = Date.now();
      if (batKey && batKey.startsWith(`${round}|`)) return;
      if (!N) return;
      const f = forts();
      const left = nameOut(await N.read(ctx, ctx.source, s.px(s.lay.regions.gwBatNameL), { lang: G.langFor(f.ourServer || ''), world: G.worldFor(f.ourServer || '') }));
      const right = nameOut(await N.read(ctx, ctx.source, s.px(s.lay.regions.gwBatNameR), { lang: G.langFor(f.enemyServer || ''), world: G.worldFor(f.enemyServer || '') }));
      batKey = `${round}|${left.name}|${right.name}`;
      ctx.note(`Battle: ${left.name || '?'} vs ${right.name || '?'}, round ${round}`);
      ctx.publish('guild:battle', { round, left: { name: left.name, options: left.options }, right: { name: right.name, options: right.options } });
    },
  });

  // ------------------------------------------------------------------ 3) a note
  const noteW = watcher();
  let noteStable = 0;
  let noteRead = false;
  const noteReset = () => {
    noteW.reset();
    noteStable = 0;
    noteRead = false;
  };
  V.register({
    id: 'guild-note',
    label: 'Guild War note left on a defender',
    module: 'guild',
    every: 2000,
    ready: () => true,
    idle: noteReset,
    async read(ctx) {
      const s = look(ctx);
      if (!s) return;
      if (!R.noteAt(s.rgba, s.W, s.H, { header: s.at('gwNoteHeader'), blue: s.at('gwNoteBlue') })) {
        noteReset();
        return ctx.note('No note window');
      }
      if (noteW.diff(ctx.source, s.px(s.lay.regions.gwNoteBody)) < 3) noteStable++;
      else {
        noteStable = 0;
        noteRead = false;
      }
      if (noteRead) return;
      if (noteStable < 1) return ctx.note('Note window: waiting for it to stand still…');
      noteRead = true;
      const author = R.noteTitle(await ctx.ocr(ctx.crop(s.lay.regions.gwNoteTitle, { minH: 72 }), { line: true }));
      if (!author) return ctx.note('Not a note window (no "…\'s Record" title)');
      ctx.busy('Reading this note…');
      const text = String((await ctx.ocr(ctx.crop(s.lay.regions.gwNoteBody, { minH: 600 }))) || '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
      ctx.note(`Note by ${author}: "${text.slice(0, 40)}"`);
      if (!text) return;
      ctx.publish('guild:note', { author, text });
      ctx.done(`Note by ${author} read`);
    },
  });
})();
