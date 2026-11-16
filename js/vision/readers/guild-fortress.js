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
  let shown = false; // a map was published and is still on screen (an "away" is sent once when it is left)
  // What the guild already has for this war's fortresses (written by the Guild War page, shared between guildmates
  // through its records): { enemy: { <fortress 0..2>: [{ name, pos: [x from the middle, y], keep }] }, ours: {…} }.
  // A defender standing on a place somebody already scanned is not read again (DEVLOG #61).
  const scanned = (side, index) => {
    const c = readJSON('e7-gw-fort-cache', {});
    return ((c[side === 'ours' ? 'ours' : 'enemy'] || {})[index] || []).filter((p) => p && p.name);
  };
  let before = null; // the look before this one: { rgba, W, H }
  const calm = document.createElement('canvas'); // the two looks with the snow taken out

  // one name, in any script: js/vision/names.js (shared with the enemy-screen reader)
  const N = window.E7Names;

  V.register({
    id: 'guild-fortress',
    label: 'Guild War fortress map (which fortress, its players)',
    module: 'guild',
    screen: 'gw-map',
    every: 2500,
    ready: () => true,
    idle(ctx) {
      lastKey = pendingKey = published = '';
      before = null;
      if (shown && ctx && ctx.publish) ctx.publish('guild:fortress', { away: true });
      shown = false;
    },
    async read(ctx) {
      const cur = window.E7Screens && window.E7Screens.current();
      const gone = () => {
        if (shown) ctx.publish('guild:fortress', { away: true });
        shown = false;
      };
      if (cur && OTHER.test(cur)) {
        gone();
        return ctx.note(`Not a fortress map (${cur})`);
      }
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
      if (pager.contrast < 100) {
        gone();
        return ctx.note('Not a fortress map (no fortress indicator)');
      }
      // the overview has its side switch in the same place: one HALF lit, not one third (DEVLOG #55)
      if (G.barKind(rgba, W, H, bar).kind === 'overview') {
        gone();
        return ctx.note('Not a fortress map (the overview)');
      }
      const found = G.findBadges(rgba, W, H);
      const forts = readJSON('e7-gw-forts', {});
      const side = G.sideOf(found) || forts.side || 'enemy';
      // defenders always stand on the same places of a fortress: a known place with something round and dark on it
      // that the finder did not take for a badge is looked at too (kept only when a name stands under it, below)
      // (a dark "beaten" badge only counts on a known place of this fortress: dark scenery can look like one)
      const real = found.filter((b) => !b.dim || G.onPlace(pager.index, b.x, b.y, W, H));
      const badges = [...real, ...G.placesToCheck(rgba, W, H, pager.index, real).map((b) => ({ ...b, state: side === 'ours' ? 'ours' : 'enemy' }))].sort((a, b) => a.y - b.y || a.x - b.x);
      const fort = (forts[side] && forts[side][pager.index]) || G.DEFAULT_FORTS[pager.index];
      if (badges.length < 2) return ctx.note(`${fort}: no defenders found`);
      // the same map twice in a row before reading names (OCR is slow; the map may still be scrolling in)
      const key = `${side}|${pager.index}|${badges.map((b) => `${Math.round(b.x / 20)},${Math.round(b.y / 20)}${b.state[0]}`).join(';')}`;
      if (key === published) return ctx.note(`${fort} (${side === 'ours' ? 'our side' : 'enemy'}): ${badges.length + 1} defenders (read)`);
      if (key !== pendingKey) {
        pendingKey = key;
        before = { rgba: new Uint8ClampedArray(rgba), W, H }; // this look, to take the falling snow out of the next one
        return ctx.note(`${fort}: ${badges.length} defenders found, reading names…`);
      }
      // Snow falls across the names and the letters stand still: of this look and the one before, the darker of each
      // pixel (G.darkerOfTwo; the owner's tip, DEVLOG #58). Not when the map was moved in between.
      let from = norm;
      const calmed = before && before.W === W && before.H === H ? G.darkerOfTwo(before.rgba, rgba) : null;
      if (calmed) {
        calm.width = W;
        calm.height = H;
        calm.getContext('2d').putImageData(new ImageData(calmed, W, H), 0, 0);
        from = calm;
      }
      before = null;
      // which script the names are usually in, and whose player list knows the spelling: that side's server
      const server = side === 'ours' ? forts.ourServer || '' : forts.enemyServer || '';
      const lang = G.langFor(server);
      const world = G.worldFor(server);
      const players = [];
      const have = scanned(side, pager.index);
      const posOf = (x, y) => [+((x - W / 2) / H).toFixed(4), +(y / H).toFixed(4)];
      const fromGuild = (pos) => have.find((p) => !p.keep && Array.isArray(p.pos) && Math.hypot(p.pos[0] - pos[0], p.pos[1] - pos[1]) < 0.03);
      for (const b of badges) {
        const pos = posOf(b.x, b.y);
        const g = fromGuild(pos);
        if (g) {
          // somebody in the guild scanned this place already: the same name for everyone, nothing read again
          players.push({ name: g.name, raw: g.name, known: true, fromGuild: true, state: b.state, x: b.x / W, y: b.y / H, pos, ...(b.busy ? { busy: true } : {}) });
          continue;
        }
        if (ctx.busy) ctx.busy(`Reading the names on this map… ${players.length + 1} of ${badges.length + 1}`);
        const n = await N.read(ctx, from, G.nameBox(b, H), { lang, world, centred: true });
        // a dark (beaten) badge or a badge known only by its place counts only with a name under it
        if ((b.dim || b.byPlace) && !(n && n.name)) continue;
        players.push({ ...(n || { name: '', raw: '', known: false }), state: b.state, x: b.x / W, y: b.y / H, pos, ...(b.busy ? { busy: true } : {}) });
      }
      const kr = lay.regions.gwKeepName;
      const gk = have.find((p) => p.keep);
      if (!gk && ctx.busy) ctx.busy(`Reading the names on this map… ${badges.length + 1} of ${badges.length + 1}`);
      const kn0 = gk ? { name: gk.name, raw: gk.name, known: true, fromGuild: true } : await N.read(ctx, from, { x: kr.x * W, y: kr.y * H, w: kr.w * W, h: kr.h * H }, { lang, world, centred: true });
      const kn = kn0 && kn0.name ? { ...kn0, x: kr.x + kr.w / 2, y: kr.y - 0.06 } : null;
      if (ctx.done) {
        const all = [...players, ...(kn ? [kn] : [])].filter((p) => p.name);
        const unsure = all.filter((p) => G.unsureName(p)).length;
        const reused = all.filter((p) => p.fromGuild).length;
        if (unsure) ctx.done(`${all.length} names, ${unsure} not sure: tap ${unsure === 1 ? 'that player' : 'those players'} (marked ?) and the name is read from their page`, { ask: true });
        else if (reused === all.length) ctx.done(`${all.length} defenders: already in your guild's war plan`);
        else ctx.done(`${all.length} names read${reused ? ` (${reused} already in the war plan)` : ''}`);
      }
      lastKey = published = key;
      ctx.note(`${fort} (${side === 'ours' ? 'our side' : 'enemy'}): ${players.length} defenders + keep (${players.filter((p) => p.name).length + (kn ? 1 : 0)} names read, ${players.filter((p) => p.state === 'beaten').length} beaten)`);
      shown = true;
      ctx.publish('guild:fortress', { side, index: pager.index, fort, players, keep: kn ? { ...kn, keep: true } : null });
    },
  });
})();
