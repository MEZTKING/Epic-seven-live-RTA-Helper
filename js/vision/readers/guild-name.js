/*
 * Reader: the enemy player's name in Guild War (enemy defense / profile screen).
 *   guild:name-read { text, rect }        raw text in the name box (the Guild War page matches it to known players)
 *   guild:name-read { text: '', away: true }  once, when that screen is left
 * Box: Guild War page "Set name box" (localStorage 'e7-guild-conn'.watchBox).
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const box = () => {
    try {
      return (JSON.parse(localStorage.getItem('e7-guild-conn') || 'null') || {}).watchBox || null;
    } catch (_) {
      return null;
    }
  };
  let shown = false;

  V.register({
    id: 'guild-name',
    label: 'Guild War enemy name',
    module: 'guild',
    screen: 'gw-enemy',
    every: 2000,
    ready: () => !!box(),
    hasBoxes: () => !!box(),
    idle(ctx) {
      if (shown) ctx.publish('guild:name-read', { text: '', away: true });
      shown = false;
      ctx.note('Waiting for an enemy defense / profile screen…');
    },
    async read(ctx) {
      const r = box();
      const text = await ctx.ocr(ctx.crop(r, { minH: 64 }));
      shown = true;
      ctx.publish('guild:name-read', { text, rect: r });
      ctx.note(text ? `Read "${text.slice(0, 24)}"` : 'No name visible');
    },
  });
})();
