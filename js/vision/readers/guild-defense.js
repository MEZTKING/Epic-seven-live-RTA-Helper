/*
 * Reader: the enemy's DEFENSE TEAMS on the Guild War enemy screen (DEVLOG #34). The 6 heroes (round 1, round 2) are
 * round icons, read with the face matcher (js/faces.js) against the official portraits + your corrections, narrowed by
 * the CLASS symbol only: on this screen the top-right badge is the hero's level ("60"), not the element.
 *   guild:defense { teams: [[{ code, score, sure }|null ×3], […]], sure }   only when ≥ 2 heroes are sure,
 *                                                                            and again when what's seen changes
 * Positions: built-in (js/layouts.js gwDef1..6, measured on a real 1228×691 enemy screen; 16:9 game pictures).
 * Real file (Ozythral's defense): Kawerik 0.89, Frieren 0.88, Lionheart Cermia 0.78 right; the other 3 (skins?) unsure.
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const F = window.RTAFaces;
  const L = window.E7Layouts;
  const R = window.RTARoster;
  if (!V || !F || !L || !R) return;
  const HEROES = window.RTASources.officialSnapshot.heroes;
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

  V.register({
    id: 'guild-defense',
    label: 'Guild War enemy defense teams',
    module: 'guild',
    screen: 'gw-enemy',
    every: 2500,
    ready: () => true,
    async read(ctx) {
      const cur = window.E7Screens && window.E7Screens.current();
      if (cur && OTHER.test(cur)) return ctx.note(`Not the enemy screen (${cur})`);
      const lay = L.layoutFor(ctx.w(), ctx.h());
      if (!lay || !lay.regions.gwDef1) return ctx.note('Built-in positions need a 16:9 game picture');
      if (tpl.length < 300) {
        loadTemplates();
        return ctx.note(`Loading hero portraits ${tpl.length}/${HEROES.length}…`);
      }
      const all = [...tpl, ...corrections()];
      const ct = (window.RTASources && window.RTASources.classTemplates) || [];
      const px = (r) => ({ x: r.x * ctx.w(), y: r.y * ctx.h(), w: r.w * ctx.w(), h: r.h * ctx.h() });
      const out = [];
      for (let i = 1; i <= 6; i++) {
        const rect = px(lay.regions['gwDef' + i]);
        const role = ct.length ? F.classFromVectors(F.classVectorsAt(ctx.source, rect), ct).role : null; // class only (no element badge here)
        const faces = F.fromRect(ctx.source, rect, F.WIDE_VARIANTS);
        const r = F.classify(faces, all, { preferSource: 'my corrections', allow: F.badgeAllow(null, role, HEROES) });
        // what this icon looked like (compact), so a name you give on the Guild War page teaches it (skins too)
        const base = faces[F.WIDE_VARIANTS.findIndex((v) => Math.abs(v.k - 1.04) < 0.01 && v.dx === 0 && v.dy === 0)];
        out.push(r.empty || !r.best ? null : { code: r.best.code, score: +r.best.score.toFixed(3), sure: F.isConfident(r), q: base ? F.quantize(base.vec) : null });
      }
      const sure = out.filter((x) => x && x.sure).length;
      if (sure < 2) return ctx.note(`No defense recognised (${sure} heroes sure)`);
      const teams = [out.slice(0, 3), out.slice(3, 6)];
      const key = out.map((x) => (x && x.sure ? x.code : '-')).join(',');
      ctx.note(`Defense: ${sure}/6 heroes recognised`);
      if (key === lastKey) return;
      lastKey = key;
      ctx.publish('guild:defense', { teams, sure });
    },
    idle() {
      lastKey = '';
    },
  });
})();
