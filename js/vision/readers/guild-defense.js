/*
 * Reader: the enemy's DEFENSE TEAMS on the Guild War enemy screen (DEVLOG #34). The 6 heroes (round 1, round 2) are
 * round icons, read with the face matcher (js/faces.js) against the official portraits + your corrections, narrowed by
 * the CLASS symbol only: on this screen the top-right badge is the hero's level ("60"), not the element.
 *   guild:defense { teams: [[{ code, score, sure }|null ×3], […]], sure }   only when ≥ 2 heroes are sure,
 *                                                                            and again when what's seen changes
 * Positions: built-in (js/layouts.js gwDef1..6, measured on a real 1228×691 enemy screen; 16:9 game pictures).
 * Since DEVLOG #56: a team stands on three of FOUR places (gwDef7 / gwDef8 = the bottom place of each team), and on a
 * stronghold screen a banner pushes everything down (L.GW_DEF_SHIFTS): every placement is read, the best one wins.
 * Real file (one enemy's defense): Kawerik 0.89, Frieren 0.88, Lionheart Cermia 0.78 right; the other 3 (skins?) unsure.
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const F = window.RTAFaces;
  const L = window.E7Layouts;
  const R = window.RTARoster;
  if (!V || !F || !L || !R) return;
  const HEROES = window.RTASources.allHeroes || window.RTASources.officialSnapshot.heroes; // official + newest heroes (fribbels-data)
  const OTHER = /^(gw-map|gw-overview|gw-battle|rta-)/;
  const tpl = [];
  let loading = null;
  /** Official portraits → face templates (once, in the background). */
  // All portraits loaded (or tried)? Reading with only part of them makes the heroes that come last in the list,
  // the newest, unknown (seen in a test: 300 of 368 loaded, three new heroes "not recognised"; DEVLOG #62). After 25 s
  // the readers go on with what is there (a slow or broken connection must not stop them for good).
  let allLoaded = false;
  let loadStarted = 0;
  const facesReady = () => allLoaded || (loadStarted > 0 && tpl.length >= 300 && Date.now() - loadStarted > 25000);
  function loadTemplates() {
    if (loading) return loading;
    loadStarted = Date.now();
    loading = Promise.all(
      HEROES.map(
        (h) =>
          new Promise((res) => {
            const im = new Image();
            im.crossOrigin = 'anonymous';
            im.onload = () => {
              try {
                tpl.push({ code: h.code, vec: F.fromPortrait(im), source: 'official' });
              } catch (_) { /* skip */ }
              res();
            };
            im.onerror = res;
            im.src = R.PORTRAIT_URL_CORS(h.code);
          }),
      ),
    ).then((r) => {
      allLoaded = true;
      return r;
    });
    return loading;
  }
  // your Guild War corrections (names you gave on the Guild War page): 'e7-gw-face-corrections' [{ code, q }]
  const corrections = () => {
    try {
      return (JSON.parse(localStorage.getItem('e7-gw-face-corrections') || '[]') || []).map((c) => ({ code: c.code, vec: F.dequantize(c.q), source: 'my corrections' }));
    } catch (_) {
      return [];
    }
  };
  /** Every face the Guild War readers know: official portraits + your corrections + faces taught on the Live page. */
  const allFaces = () => [...tpl, ...corrections(), ...(window.E7Teach ? window.E7Teach.templates(F) : [])];
  /**
   * One round hero icon (class symbol top left, level top right) -> { code, score, sure, q } or null (empty place).
   * rect in pixels of `source`. Shared with the battle-result reader (guild-result.js) through window.E7GWFaces.
   */
  function readIcon(source, rect, all) {
    const ct = (window.RTASources && window.RTASources.classTemplates) || [];
    const role = ct.length ? F.classFromVectors(F.classVectorsAt(source, rect), ct).role : null; // class only (no element badge here)
    const faces = F.fromRect(source, rect, F.WIDE_VARIANTS);
    const r = F.classify(faces, all || allFaces(), { preferSource: ['my corrections', 'taught by you'], allow: F.badgeAllow(null, role, HEROES) });
    // what this icon looked like (compact), so a name you give on the Guild War page teaches it (skins too)
    const base = faces[F.WIDE_VARIANTS.findIndex((v) => Math.abs(v.k - 1.04) < 0.01 && v.dx === 0 && v.dy === 0)];
    return r.empty || !r.best ? null : { code: r.best.code, score: +r.best.score.toFixed(3), sure: F.isConfident(r), q: base ? F.quantize(base.vec) : null };
  }
  window.E7GWFaces = { load: loadTemplates, ready: facesReady, count: () => tpl.length, total: HEROES.length, all: allFaces, readIcon };
  // the portraits are fetched when the watcher starts, not when the first hero has to be read (they come from the
  // browser's cache after the first time)
  setTimeout(loadTemplates, 2500);

  let lastKey = '';
  // published only when two reads in a row agree: a Steam / Discord notification sliding over an icon for a moment
  // (they draw inside the game window, so the capture sees them) can't produce a wrong team
  let pendingKey = '';

  V.register({
    id: 'guild-defense',
    label: 'Guild War enemy defense teams',
    module: 'guild',
    // (no `screen`: the page is recognised by its own pixels, js/vision/readers/guild-name.js pageShown; DEVLOG #62)
    every: 1500,
    ready: () => true,
    async read(ctx) {
      if (window.E7GWPage && !window.E7GWPage.shown(ctx)) {
        lastKey = '';
        pendingKey = '';
        return ctx.note('Waiting for a player\'s page…');
      }
      const lay = L.layoutFor(ctx.w(), ctx.h());
      if (!lay || !lay.regions.gwDef1) return ctx.note('This window shape is too unusual for the built-in positions');
      if (!facesReady()) {
        loadTemplates();
        return ctx.note(`Loading hero portraits ${tpl.length}/${HEROES.length}…`);
      }
      const all = allFaces();
      const px = (r) => ({ x: r.x * ctx.w(), y: r.y * ctx.h(), w: r.w * ctx.w(), h: r.h * ctx.h() });
      // any window shape (DEVLOG #38): where the panel sits on a wider window isn't verified yet, so every placement
      // js/layouts.js offers is read and the one that recognises the most heroes wins
      // places of a team in the order they are stored: top, right, left, then the bottom place (three of four are used)
      const PLACES = [[1, 2, 3, 7], [4, 5, 6, 8]];
      const readAt = (anchorIdx, dy) => {
        const read1 = (i) => {
          const alts = L.alternatives(ctx.w(), ctx.h(), 'gwDef' + i);
          if (!alts.length) return null;
          const rect = px((alts[anchorIdx] || alts[0]).rect);
          rect.y += dy * ctx.h();
          if (rect.y + rect.h > ctx.h()) return null;
          return readIcon(ctx.source, rect, all);
        };
        const icons = [];
        for (const team of PLACES) {
          let got = team.map(read1);
          // the bottom place only counts when a hero is clearly there (it is usually the empty one)
          if (got[3] && !got[3].sure) got[3] = null;
          // four readings: one place is empty in the game; the weakest reading is the scenery
          while (got.filter(Boolean).length > 3) {
            const weakest = got.reduce((w, x, k) => (x && (w < 0 || x.score < got[w].score) ? k : w), -1);
            got[weakest] = null;
          }
          // three places are stored per team: with the bottom place in use, the heroes in reading order
          got = got[3] ? [...got.filter(Boolean), null, null].slice(0, 3) : got.slice(0, 3);
          icons.push(...got);
        }
        return icons;
      };
      const rank = (icons) => icons.filter((x) => x && x.sure).length * 10 + icons.reduce((a, x) => a + (x ? x.score : 0), 0);
      const tries = L.alternatives(ctx.w(), ctx.h(), 'gwDef1').length;
      let out = null;
      for (let k = 0; k < tries; k++) {
        for (const dy of L.GW_DEF_SHIFTS || [0]) {
          const o = readAt(k, dy);
          if (!out || rank(o) > rank(out)) out = o;
        }
      }
      const sure = out.filter((x) => x && x.sure).length;
      if (sure < 2) return ctx.note(`No defense recognised (${sure} heroes sure)`);
      const teams = [out.slice(0, 3), out.slice(3, 6)];
      const key = out.map((x) => (x && x.sure ? x.code : '-')).join(',');
      if (key === lastKey) return ctx.note(`Defense: ${sure}/6 heroes recognised`);
      if (key !== pendingKey) {
        pendingKey = key;
        return ctx.note(`Defense: ${sure}/6 heroes recognised (checking again…)`);
      }
      ctx.note(`Defense: ${sure}/6 heroes recognised`);
      lastKey = key;
      ctx.publish('guild:defense', { teams, sure });
    },
    idle() {
      lastKey = '';
      pendingKey = '';
    },
  });
})();
