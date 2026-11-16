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
  function loadTemplates() {
    if (loading) return loading;
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
    );
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
  let lastKey = '';
  // published only when two reads in a row agree: a Steam / Discord notification sliding over an icon for a moment
  // (they draw inside the game window, so the capture sees them) can't produce a wrong team
  let pendingKey = '';

  V.register({
    id: 'guild-defense',
    label: 'Guild War enemy defense teams',
    module: 'guild',
    screen: 'gw-enemy',
    every: 1500,
    ready: () => true,
    async read(ctx) {
      const cur = window.E7Screens && window.E7Screens.current();
      if (cur && OTHER.test(cur)) return ctx.note(`Not the enemy screen (${cur})`);
      const lay = L.layoutFor(ctx.w(), ctx.h());
      if (!lay || !lay.regions.gwDef1) return ctx.note('This window shape is too unusual for the built-in positions');
      if (tpl.length < 300) {
        loadTemplates();
        return ctx.note(`Loading hero portraits ${tpl.length}/${HEROES.length}…`);
      }
      const all = [...tpl, ...corrections(), ...(window.E7Teach ? window.E7Teach.templates(F) : [])]; // + faces taught on the Live page
      const ct = (window.RTASources && window.RTASources.classTemplates) || [];
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
          const role = ct.length ? F.classFromVectors(F.classVectorsAt(ctx.source, rect), ct).role : null; // class only (no element badge here)
          const faces = F.fromRect(ctx.source, rect, F.WIDE_VARIANTS);
          const r = F.classify(faces, all, { preferSource: ['my corrections', 'taught by you'], allow: F.badgeAllow(null, role, HEROES) });
          // what this icon looked like (compact), so a name you give on the Guild War page teaches it (skins too)
          const base = faces[F.WIDE_VARIANTS.findIndex((v) => Math.abs(v.k - 1.04) < 0.01 && v.dx === 0 && v.dy === 0)];
          return r.empty || !r.best ? null : { code: r.best.code, score: +r.best.score.toFixed(3), sure: F.isConfident(r), q: base ? F.quantize(base.vec) : null };
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
