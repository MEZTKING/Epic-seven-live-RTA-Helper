/*
 * Reader: the enemy player's name in Guild War (enemy defense / profile screen).
 *   guild:name-read { text, rect }        raw text in the name box (the Guild War page matches it to known players)
 *   guild:name-read { text: '', away: true }  once, when that screen is left
 * Box: Guild War page "Set name box" (localStorage 'e7-guild-conn'.watchBox).
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const own = () => {
    try {
      return (JSON.parse(localStorage.getItem('e7-guild-conn') || 'null') || {}).watchBox || null;
    } catch (_) {
      return null;
    }
  };
  // your own box wins; otherwise the built-in one (js/layouts.js, measured on a real enemy-defense screen; 16:9 only)
  let size = null;
  const builtIn = () => {
    const L = window.E7Layouts;
    const lay = L && size ? L.layoutFor(size.w, size.h) : L && L.LAYOUTS[0];
    return lay && lay.regions.gwName ? lay.regions.gwName : null;
  };
  const box = () => own() || builtIn();
  // screens that are certainly NOT the enemy screen (recognised from real screenshots): don't read names there
  const OTHER = /^(gw-map|gw-overview|gw-battle|rta-)/;
  let shown = false;

  V.register({
    id: 'guild-name',
    label: 'Guild War enemy name',
    module: 'guild',
    screen: 'gw-enemy',
    every: 2000,
    ready: () => !!box(),
    hasBoxes: () => !!own(),
    idle(ctx) {
      if (shown) ctx.publish('guild:name-read', { text: '', away: true });
      shown = false;
      ctx.note('Waiting for an enemy defense / profile screen…');
    },
    async read(ctx) {
      size = { w: ctx.w(), h: ctx.h() };
      const cur = window.E7Screens && window.E7Screens.current();
      if (cur && OTHER.test(cur)) return ctx.note(`Not the enemy screen (${cur})`);
      const r = box();
      const text = await ctx.ocr(ctx.crop(r, { minH: 64 }));
      shown = true;
      ctx.publish('guild:name-read', { text, rect: r });
      ctx.note(text ? `Read "${text.slice(0, 24)}"` : 'No name visible');
    },
  });
})();
