/*
 * Guild War fortress map reader (DEVLOG #38, #39): which fortress is open and the names of its defenders, on either
 * side. Publishes 'guild:fortress' { side: 'enemy' | 'ours', index, fort, players: [{ name, raw, known, state, x, y }],
 * keep: {...} | null }. state = 'enemy' | 'ours' (ring colour = health left) | 'beaten' (grey ring).
 * Side: the ring colours (red enemy, green ours); when every defender is beaten, the side last shown on the overview.
 * Fortress names: read on the overview (js/vision/readers/guild-overview.js, 'e7-gw-forts'); until then "Left fortress"…
 * Picture work is in js/gwmap.js (badges, name boxes, pager); text via the watcher's OCR, one line per name.
 * Names are matched to names you already have (enemy players saved before, and fixes you typed:
 * localStorage 'e7-gw-known-names' and 'e7-gw-name-fixes', written by the Guild War page).
 * Any window size: the picture is scaled to E7GWMap.NORM_H first.
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const G = window.E7GWMap;
  const L = window.E7Layouts;
  if (!V || !G || !L || !window.E7Names) return;
  const OTHER = /^(gw-enemy|gw-overview|gw-battle|rta-)/;
  const norm = document.createElement('canvas');
  const nctx = norm.getContext('2d', { willReadFrequently: true });
  const readJSON = (k, d) => {
    try {
      return JSON.parse(localStorage.getItem(k) || 'null') || d;
    } catch (_) {
      return d;
    }
  };
  let lastKey = '';
  let pendingKey = '';
  let published = '';

  // one name, in any script: js/vision/names.js (shared with the enemy-screen reader)
  const N = window.E7Names;

  V.register({
    id: 'guild-fortress',
    label: 'Guild War fortress map (which fortress, its players)',
    module: 'guild',
    screen: 'gw-map',
    every: 2500,
    ready: () => true,
    idle() {
      lastKey = pendingKey = published = '';
    },
    async read(ctx) {
      const cur = window.E7Screens && window.E7Screens.current();
      if (cur && OTHER.test(cur)) return ctx.note(`Not a fortress map (${cur})`);
      const sc = G.NORM_H / ctx.h();
      norm.width = Math.round(ctx.w() * sc);
      norm.height = G.NORM_H;
      nctx.drawImage(ctx.source, 0, 0, norm.width, norm.height);
      const W = norm.width;
      const H = norm.height;
      const rgba = nctx.getImageData(0, 0, W, H).data;
      const lay = L.layoutFor(W, H);
      if (!lay) return ctx.note('This window shape is too unusual for the built-in positions');
      const pr = lay.regions.gwFortPager;
      const bar = { x: pr.x * W, y: pr.y * H, w: pr.w * W, h: pr.h * H };
      const pager = G.pagerIndex(rgba, W, H, bar);
      if (pager.contrast < 100) return ctx.note('Not a fortress map (no fortress indicator)');
      // the overview has its side switch in the same place: one HALF lit, not one third (DEVLOG #55)
      if (G.barKind(rgba, W, H, bar).kind === 'overview') return ctx.note('Not a fortress map (the overview)');
      const badges = G.findBadges(rgba, W, H);
      const forts = readJSON('e7-gw-forts', {});
      const side = G.sideOf(badges) || forts.side || 'enemy';
      const fort = (forts[side] && forts[side][pager.index]) || G.DEFAULT_FORTS[pager.index];
      if (badges.length < 2) return ctx.note(`${fort}: no defenders found`);
      // the same map twice in a row before reading names (OCR is slow; the map may still be scrolling in)
      const key = `${side}|${pager.index}|${badges.map((b) => `${Math.round(b.x / 20)},${Math.round(b.y / 20)}${b.state[0]}`).join(';')}`;
      if (key === published) return ctx.note(`${fort} (${side === 'ours' ? 'our side' : 'enemy'}): ${badges.length + 1} defenders (read)`);
      if (key !== pendingKey) {
        pendingKey = key;
        return ctx.note(`${fort}: ${badges.length} defenders found, reading names…`);
      }
      // which script the names are usually in, and whose player list knows the spelling: that side's server
      const server = side === 'ours' ? forts.ourServer || '' : forts.enemyServer || '';
      const lang = G.langFor(server);
      const world = G.worldFor(server);
      const players = [];
      for (const b of badges) {
        if (ctx.busy) ctx.busy(`Reading the names on this map… ${players.length + 1} of ${badges.length + 1}`);
        const n = await N.read(ctx, norm, G.nameBox(b, H), { lang, world });
        players.push({ ...(n || { name: '', raw: '', known: false }), state: b.state, x: b.x / W, y: b.y / H });
      }
      const kr = lay.regions.gwKeepName;
      if (ctx.busy) ctx.busy(`Reading the names on this map… ${badges.length + 1} of ${badges.length + 1}`);
      const kn0 = await N.read(ctx, norm, { x: kr.x * W, y: kr.y * H, w: kr.w * W, h: kr.h * H }, { lang, world });
      const kn = kn0 && kn0.name ? kn0 : null;
      if (ctx.done) {
        const all = [...players, ...(kn ? [kn] : [])].filter((p) => p.name);
        const unsure = all.filter((p) => !p.known && !p.official).length;
        if (unsure) ctx.done(`${all.length} names read, ${unsure} to check in the app (Guild War → Seen in game)`, { ask: true });
        else ctx.done(`${all.length} names read`);
      }
      lastKey = published = key;
      ctx.note(`${fort} (${side === 'ours' ? 'our side' : 'enemy'}): ${players.length} defenders + keep (${players.filter((p) => p.name).length + (kn ? 1 : 0)} names read, ${players.filter((p) => p.state === 'beaten').length} beaten)`);
      ctx.publish('guild:fortress', { side, index: pager.index, fort, players, keep: kn ? { ...kn, keep: true } : null });
    },
  });
})();
