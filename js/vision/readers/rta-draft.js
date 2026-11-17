/*
 * World Arena draft reader (DEVLOG #41): stage, whose turn, first pick, the four pre-bans and both players' picks,
 * with nothing to draw or teach. Publishes
 *   'rta:draft'      { stage, turn, turnIndex, firstPick, own[5], enemy[5], prebans[4], held, bans, board, lang }
 *   'rta:draft-end'  { last: <the finished draft's last state>, board }
 * Method and layout follow E7DaT (github.com/ohrgon-game/E7DaT, MIT): stage texts by template (js/draftscreen.js,
 * js/sources/draft-labels.js), pick cards against the heroes' wide portraits (js/wide.js; downloaded from the community
 * repository CeciliaBot/E7Assets-Temp, listed in js/sources/wide-portraits.js), pre-ban icons with the face matcher
 * against the game's round icons (js/vision/icons.js).
 * Since DEVLOG #63 (the owner's first real pictures of a whole draft): my two pre-bans are already read in the pre-ban
 * window ("Selected Heroes"), and both bans from the darkened BANNED cards of the formation screen.
 * Game language: English, Korean or Japanese, found by itself. Any window shape: where a position's anchor isn't
 * verified, every alternative is tried and the one that reads something is kept.
 * Only looks at the picture; nothing is sent to the game.
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const D = window.E7Draft;
  const W = window.E7Wide;
  const L = window.E7Layouts;
  const F = window.RTAFaces;
  const R = window.RTARoster;
  const S = window.RTASources || {};
  const I = window.E7Icons;
  if (!V || !D || !W || !L || !R || !I || !S.draftLabels) return;
  const HEROES = S.allHeroes || (S.officialSnapshot && S.officialSnapshot.heroes) || [];
  const NAME = new Map(HEROES.map((h) => [h.code, h.name]));
  const LANGS = S.draftLabels.langs;
  const REF = 16 / 9;
  const OTHER = /^(gw-|gear)/;

  // ---- templates -------------------------------------------------------------------------------------------------
  const decoded = {};
  const lang = (code) => {
    if (decoded[code]) return decoded[code];
    const l = LANGS[code];
    const out = { code, ...l, labels: Object.fromEntries(Object.entries(l.labels).map(([k, t]) => [k, D.decode(t)])) };
    if (l.prebanPopup) out.prebanPopup = { box: l.prebanPopup.box, T: D.decode(l.prebanPopup) };
    if (l.firstPick) out.firstPick = { boxes: l.firstPick.boxes, T: D.decode(l.firstPick) };
    return (decoded[code] = out);
  };
  let curLang = (() => {
    try {
      return LANGS[localStorage.getItem('e7-rta-lang')] ? localStorage.getItem('e7-rta-lang') : 'en';
    } catch (_) {
      return 'en';
    }
  })();
  let probe = 0;

  // Computed templates are kept between app starts (DEVLOG #43): IndexedDB 'e7-templates', one record per set, valid for
  // the same picture list and month. Without it every session downloads ~850 small pictures before its first draft.
  const MONTH = new Date().toISOString().slice(0, 7);
  const tcache = I.store; // IndexedDB 'e7-templates' (js/vision/icons.js)

  // wide portraits (pick cards): once, in the background, 12 at a time
  const wide = { own: [], enemy: [], total: 0, done: 0, started: false, fromCache: false };
  function loadWide() {
    if (wide.started) return;
    wide.started = true;
    const list = S.widePortraits || { base: [], skins: {} };
    const names = [];
    for (const h of HEROES) {
      if (!list.base.includes(h.code)) continue;
      names.push([h.code, `${h.code}_l`]);
      for (const nn of list.skins[h.code] || []) names.push([h.code, `${h.code}_s${nn}_l`]);
    }
    wide.total = names.length;
    const sig = `${list.listedAt || ''}|${names.length}|${MONTH}|v1`;
    const add = (code, t) => {
      wide.enemy.push({ code, name: NAME.get(code) || code, t });
      wide.own.push({ code, name: NAME.get(code) || code, t: W.mirror(t) });
    };
    const cv = document.createElement('canvas');
    const cx = cv.getContext('2d', { willReadFrequently: true });
    let i = 0;
    const finished = () => {
      if (wide.done >= wide.total && !wide.fromCache && wide.enemy.length >= wide.total * 0.9) tcache.set('wide', { sig, items: wide.enemy.map((x) => ({ code: x.code, idx: x.t.idx, val: x.t.val, n: x.t.n })) });
    };
    const next = () => {
      if (i >= names.length) return finished();
      const [code, name] = names[i++];
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => {
        try {
          const w = Math.round((im.naturalWidth * 89) / im.naturalHeight); // one skin file is bigger: scale to 89 high
          cv.width = w;
          cv.height = 89;
          cx.clearRect(0, 0, w, 89);
          cx.drawImage(im, 0, 0, w, 89);
          const t = W.template(cx.getImageData(0, 0, w, 89).data, w, 89);
          if (t) add(code, t);
        } catch (_) { /* unreadable: skipped */ }
        wide.done++;
        next();
      };
      im.onerror = () => {
        wide.done++;
        next();
      };
      im.src = R.WIDE_PORTRAIT_URL(name);
    };
    tcache.get('wide').then((c) => {
      if (c && c.sig === sig && Array.isArray(c.items) && c.items.length) {
        for (const x of c.items) add(x.code, { idx: x.idx, val: x.val, n: x.n });
        wide.fromCache = true;
        wide.done = wide.total;
        return;
      }
      for (let k = 0; k < 12; k++) next();
    });
  }
  const wideReady = () => wide.started && wide.total > 0 && wide.done >= wide.total; // all of them: the newest heroes load last

  // round icons (pre-bans): the shared loader (js/vision/icons.js); the pre-ban row never shows a skin
  const round = {
    get tpl() {
      return I.base();
    },
    get fromCache() {
      return I.fromCache;
    },
  };
  const loadRound = () => I.load();
  const roundReady = () => I.ready();
  // Both sets are fetched as soon as the watcher runs, not when the first draft appears: at the first match after the
  // month's templates ran out the pictures arrived during the picks (seen in the owner's notes: "loading hero pictures
  // 0/458" on the pre-ban screen) and the first cards were missed.
  // (In the desktop app, where the watcher always runs. A browser page loads them when a draft shows up, as before.)
  if (window.E7Desktop) {
    setTimeout(() => {
      loadWide();
      loadRound();
    }, 3000);
  }

  // ---- picture helpers ---------------------------------------------------------------------------------------------
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d', { willReadFrequently: true });
  /** Draw a source rectangle (pixels) into a w×h canvas and return its RGBA. */
  function grab(ctx, r, w, h) {
    cv.width = w;
    cv.height = h;
    cx.drawImage(ctx.source, r.x, r.y, r.w, r.h, 0, 0, w, h);
    return cx.getImageData(0, 0, w, h).data;
  }
  const grey = (rgba, n) => {
    const g = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) g[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    return g;
  };
  const boxOf = (a) => ({ x: a[0], y: a[1], w: a[2], h: a[3] });
  /** A 16:9 box placed in this picture with an anchor, in pixels. */
  const px = (ctx, box, anchor) => {
    const p = L.place(box, ctx.w(), ctx.h(), anchor);
    return { x: p.x * ctx.w(), y: p.y * ctx.h(), w: p.w * ctx.w(), h: p.h * ctx.h() };
  };
  /** The region around a box (± margin), scaled so the box is T.w wide: { rgba, g, rw, rh }. */
  function region(ctx, bpx, T) {
    const refW = Math.min(ctx.w(), ctx.h() * REF);
    const m = D.MATCH_MARGIN * refW;
    const s = T.w / bpx.w;
    const r = { x: Math.max(0, bpx.x - m), y: Math.max(0, bpx.y - m), w: bpx.w + 2 * m, h: bpx.h + 2 * m };
    const rw = Math.max(T.w, Math.round(r.w * s));
    const rh = Math.max(T.h, Math.round(r.h * s));
    const rgba = grab(ctx, r, rw, rh);
    return { rgba, g: grey(rgba, rw * rh), rw, rh };
  }
  function readLabel(ctx, code) {
    const l = lang(code);
    const any = l.labels.turn_me;
    const reg = region(ctx, px(ctx, boxOf(l.labelBox), 'c'), any);
    let best = { score: 0, name: null };
    for (const [name, T] of Object.entries(l.labels)) {
      const m = D.matchTemplate(reg.g, reg.rw, reg.rh, T);
      if (m.score > best.score) best = { ...m, name, T };
    }
    if (!best.name) return { score: 0, name: null };
    const t = D.tint(reg.rgba, reg.rw, best.x, best.y, best.T.w, best.T.h);
    if (!D.acceptLabel(l, best.score, t)) return { score: best.score, name: null };
    let name = best.name;
    if ((name === 'turn_me' || name === 'turn_enemy') && Math.abs(t.rmb) >= 15) name = t.rmb > 0 ? 'turn_enemy' : 'turn_me'; // red = theirs, blue = mine
    return { score: best.score, name };
  }
  /** Best match of template T around a box, over the anchors worth trying. */
  function bestAt(ctx, box, T, anchors) {
    let best = 0;
    for (const a of anchors) {
      const reg = region(ctx, px(ctx, boxOf(box), a), T);
      best = Math.max(best, D.matchTemplate(reg.g, reg.rw, reg.rh, T).score);
    }
    return best;
  }
  const exact = (ctx) => Math.abs(ctx.w() / ctx.h() - REF) < 0.03;
  const anchorsFor = (ctx, list) => (exact(ctx) ? [list[0]] : list);

  // ---- the reader ---------------------------------------------------------------------------------------------------
  const tracker = new D.Tracker();
  let stageSent = { stage: '', at: -Infinity };
  const anchor = { own: null, enemy: null, pre: null }; // the anchor that worked at this window shape
  let shape = '';
  function readSlot(ctx, side, i) {
    const tries = anchor[side] ? [anchor[side]] : anchorsFor(ctx, side === 'own' ? ['l', 'c'] : ['c', 'r', 'l']);
    let out = null;
    for (const a of tries) {
      const slot = px(ctx, W.slotBox(side, i), a);
      const pr = W.patchRect(slot, side, ctx.h());
      const r = W.match(W.patchFromRGBA(grab(ctx, pr, W.BIG_W, W.BIG_H)), wide[side]);
      const sure = W.isConfident(r);
      if (sure) anchor[side] = a;
      if (!out || (r.best && r.best.score > out.score)) {
        out = { code: r.best ? r.best.code : null, score: r.best ? r.best.score : 0, lead: r.lead, sure, slot };
      }
      if (sure) break;
    }
    if (out && side === 'own') out.lock = D.lockScore(grab(ctx, out.slot, 160, 64), 160, 64, i) >= D.LOCK_MIN;
    return out;
  }
  function readPreban(ctx, k) {
    const key = ['mePreban1', 'mePreban2', 'oppPreban1', 'oppPreban2'][k];
    const alts = L.alternatives(ctx.w(), ctx.h(), key);
    const tries = anchor.pre ? alts.filter((a) => a.anchor === anchor.pre) : alts;
    for (const a of tries.length ? tries : alts) {
      const rect = { x: a.rect.x * ctx.w(), y: a.rect.y * ctx.h(), w: a.rect.w * ctx.w(), h: a.rect.h * ctx.h() };
      const r = F.classify(F.fromRect(ctx.source, rect, F.WIDE_VARIANTS), round.tpl);
      if (!r.empty && r.best && F.isConfident(r)) {
        anchor.pre = a.anchor;
        return r.best.code;
      }
    }
    return null;
  }
  /** The two heroes selected in the pre-ban window ("Selected Heroes (2/2)", bottom middle): [code | null, code | null]. */
  function readPrebanPicks(ctx) {
    return ['myPrebanPick1', 'myPrebanPick2'].map((key) => {
      for (const a of L.alternatives(ctx.w(), ctx.h(), key)) {
        const rect = { x: a.rect.x * ctx.w(), y: a.rect.y * ctx.h(), w: a.rect.w * ctx.w(), h: a.rect.h * ctx.h() };
        const r = F.classify(F.fromRect(ctx.source, rect, F.WIDE_VARIANTS), round.tpl);
        if (!r.empty && r.best && F.isConfident(r)) return r.best.code;
      }
      return null;
    });
  }
  /** Which cards look banned (darkened): { own: [bool × 5], enemy: [bool × 5] }. */
  function readBanned(ctx) {
    const out = { own: [], enemy: [] };
    for (const side of ['own', 'enemy']) {
      const a = anchor[side] || (side === 'own' ? 'l' : 'c');
      for (let i = 0; i < 5; i++) out[side].push(D.isBannedLook(D.cardLook(grab(ctx, px(ctx, W.slotBox(side, i), a), 160, 48), 160, 48, side)));
    }
    return out;
  }
  let lastCtx = null;
  /** Test / report hook: the lock score of each of my cards on the picture last read. */
  const locks = () => (lastCtx ? [0, 1, 2, 3, 4].map((i) => +D.lockScore(grab(lastCtx, px(lastCtx, W.slotBox('own', i), anchor.own || 'l'), 160, 64), 160, 64, i).toFixed(2)) : null);
  const names = (codes) => codes.map((c) => (c ? NAME.get(c) || c : null));
  const STAGE = { idle: 'no draft on screen', versus: 'match found', preban: 'pre-bans', pick: 'picking', ban: 'final ban', ready: 'battle ready' };

  V.register({
    id: 'rta-draft',
    label: 'RTA draft (stage, pre-bans, picks)',
    module: 'rta',
    every: 700,
    ready: () => true,
    async read(ctx) {
      lastCtx = ctx;
      const cur = window.E7Screens && window.E7Screens.current();
      if (tracker.stage === 'idle' && cur && OTHER.test(cur)) return ctx.note(`Not the arena (${cur})`);
      const sh = `${ctx.w()}x${ctx.h()}`;
      if (sh !== shape) {
        shape = sh;
        anchor.own = anchor.enemy = anchor.pre = null;
      }
      // 1) the stage text (current language; while nothing is going on, one other language per look)
      let lab = readLabel(ctx, curLang);
      if (!lab.name && (tracker.stage === 'idle' || tracker.stage === 'versus')) {
        const others = Object.keys(LANGS).filter((c) => c !== curLang);
        const other = others[probe++ % others.length];
        const l2 = readLabel(ctx, other);
        if (l2.name && l2.score >= 0.85) {
          curLang = other;
          lab = l2;
          try {
            localStorage.setItem('e7-rta-lang', other);
          } catch (_) { /* only a preference */ }
        }
      }
      const obs = { label: lab.name, prebanPopup: false, firstPickMarker: null, slots: null, prebans: null, prebanPicks: null, banned: null };
      const l = lang(curLang);
      // 2) versus screen: FIRST PICK under my card (left) or the opponent's (right)
      if (!lab.name && (tracker.stage === 'idle' || tracker.stage === 'versus')) {
        for (const code of [curLang, ...Object.keys(LANGS).filter((c) => c !== curLang)]) {
          const fp = lang(code).firstPick;
          if (!fp) continue;
          const me = bestAt(ctx, fp.boxes.me, fp.T, anchorsFor(ctx, ['c', 'l']));
          const en = bestAt(ctx, fp.boxes.enemy, fp.T, anchorsFor(ctx, ['c', 'r']));
          if (Math.max(me, en) >= 0.7) {
            obs.firstPickMarker = me >= en ? 'me' : 'enemy';
            break;
          }
        }
      }
      if (lab.name) {
        loadWide(); // (normally started already, 3 s after the watcher)
        loadRound();
      }
      // 3) the pre-ban window covers the cards
      if (lab.name === 'ready' && l.prebanPopup) obs.prebanPopup = bestAt(ctx, l.prebanPopup.box, l.prebanPopup.T, anchorsFor(ctx, ['c', 'l'])) >= 0.6;
      // 4) pick cards and pre-ban icons
      if (lab.name && !obs.prebanPopup) {
        // cards: while picking / banning, and on "Ready" once something was drafted (formation), never in the pre-ban phase
        if (wideReady() && (lab.name !== 'ready' || tracker.own.some(Boolean) || tracker.enemy.some(Boolean))) {
          obs.slots = { own: [], enemy: [] };
          for (const side of ['own', 'enemy']) for (let i = 0; i < 5; i++) obs.slots[side].push(tracker[side][i] ? null : readSlot(ctx, side, i));
        }
        if (F && roundReady() && tracker.prebans.some((c) => !c)) obs.prebans = tracker.prebans.map((c, k) => (c ? c : readPreban(ctx, k)));
        // formation screen: the two banned cards
        if (lab.name === 'ready' && (tracker.banIdx.own === null || tracker.banIdx.enemy === null) && tracker.own.some(Boolean) && tracker.enemy.some(Boolean)) obs.banned = readBanned(ctx);
      } else if (obs.prebanPopup && F && roundReady()) {
        obs.prebanPicks = readPrebanPicks(ctx); // what I have selected in the pre-ban window so far
      }
      const st = tracker.update(performance.now(), obs);
      if (st.stage !== 'idle') api.seenAt = performance.now(); // (the battle reader, rta-battle.js, follows a draft)
      // "is an arena draft on screen right now?" for whoever draws on the game (the RTA overlay shows nothing outside a
      // draft; DEVLOG #54): on every change of stage and every 4 s
      if (st.stage !== stageSent.stage || performance.now() - stageSent.at > 4000) {
        stageSent = { stage: st.stage, at: performance.now() };
        ctx.publish('rta:stage', { stage: st.stage, turn: st.turn || null });
      }
      // status line
      const n = (a) => a.filter(Boolean).length;
      let note = STAGE[st.stage];
      if (st.stage === 'pick') note = st.turn === 'me' ? `your turn (turn ${st.turnIndex})` : `opponent's turn (turn ${st.turnIndex})`;
      if (st.stage !== 'idle') {
        note = `Draft: ${note} · you ${n(st.own)}/5 · opponent ${n(st.enemy)}/5 · pre-bans ${n(st.prebans)}/4`;
        if (st.firstPick) note += ` · ${st.firstPick === 'me' ? 'you pick' : 'opponent picks'} first`;
        if (st.bans.own || st.bans.enemy) note += ` · banned: yours ${NAME.get(st.bans.own) || '?'}, theirs ${NAME.get(st.bans.enemy) || '?'}`;
        if (lab.name && !wideReady()) note += ` · loading hero pictures ${wide.done}/${wide.total}`;
      } else note = 'Waiting for an arena draft…';
      ctx.note(note);
      if (st.ended && st.last) ctx.publish('rta:draft-end', { last: st.last, board: D.toBoard(st.last), names: { own: names(st.last.own), enemy: names(st.last.enemy) } });
      if (st.changed) {
        ctx.publish('rta:draft', {
          stage: st.stage, turn: st.turn, turnIndex: st.turnIndex, firstPick: st.firstPick, own: st.own, enemy: st.enemy, prebans: st.prebans, held: st.held, bans: st.bans,
          board: D.toBoard(st), lang: curLang, names: { own: names(st.own), enemy: names(st.enemy), prebans: names(st.prebans), bans: { own: NAME.get(st.bans.own) || null, enemy: NAME.get(st.bans.enemy) || null } },
        });
      }
    },
  });
  const api = { tracker, wide, round, loadWide, loadRound, wideReady, roundReady, seenAt: 0, _readSlot: readSlot, _readLabel: readLabel, _locks: locks };
  window.E7RtaDraft = api;
})();
