/*
 * Reader: the top bar of the arena battle that follows a draft (DEVLOG #63). During the draft the game hides the
 * opponent ("Unknown Opponent"); in the battle the bar shows both players' names, servers and guilds. Publishes once
 * per match
 *   'rta:battle' { me: { name, server, guild }, opp: { name, server, guild }, sameGuild }
 * so the RTA page can note who the opponent was and mark a match against a GUILDMATE as played for fun (the owner:
 * "some matches are done for fun and the losses don't mean anything … I ended up playing against my guildmate").
 *
 * How: only for a few minutes after an arena draft was on screen (Guild War battles have the same bar); the cheap
 * check is the flame-coloured "VS" sign between the bars; then four short texts are read (js/layouts.js rtaBat*).
 * The two guild names are compared with each other as read (same lettering, same picture), so a small reading error
 * hits both alike. Only looks at the picture; nothing is sent to the game or anywhere else.
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const D = window.E7Draft;
  const L = window.E7Layouts;
  if (!V || !D || !L) return;
  const AFTER_DRAFT_MS = 8 * 60 * 1000;
  const MAX_TRIES = 12;
  let doneFor = 0; // the draft (its last-seen time) this was read for
  let tries = 0;
  let triedFor = 0;
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d', { willReadFrequently: true });

  V.register({
    id: 'rta-battle',
    label: 'RTA battle (who the opponent is; a guildmate = played for fun)',
    module: 'rta',
    every: 2500,
    ready: () => true,
    async read(ctx) {
      const R = window.E7RtaDraft;
      const seen = (R && R.seenAt) || 0;
      if (!seen || performance.now() - seen > AFTER_DRAFT_MS) return ctx.note('No arena match going on');
      if (R.tracker && R.tracker.stage !== 'idle') return ctx.note('Draft in progress');
      if (doneFor === seen) return ctx.note('Opponent already read for this match');
      if (triedFor !== seen) {
        triedFor = seen;
        tries = 0;
      }
      if (tries >= MAX_TRIES) return ctx.note('The battle bar could not be read for this match');
      const lay = L.layoutFor(ctx.w(), ctx.h());
      if (!lay || !lay.regions.rtaBatVs) return ctx.note('This window shape is too unusual for the built-in positions');
      const g = lay.regions;
      // the "VS" sign
      const vs = g.rtaBatVs;
      cv.width = 70;
      cv.height = 65;
      cx.drawImage(ctx.source, vs.x * ctx.w(), vs.y * ctx.h(), vs.w * ctx.w(), vs.h * ctx.h(), 0, 0, 70, 65);
      if (D.vsFlame(cx.getImageData(0, 0, 70, 65).data) < 0.1) return ctx.note('No battle on screen');
      tries++;
      const text = async (key) => String((await ctx.ocr(ctx.crop(g[key], { minH: 64 }), { line: true })) || '');
      const me = { ...D.battleLine(await text('rtaBatNameL'), 'l'), guild: (await text('rtaBatGuildL')).trim() };
      const opp = { ...D.battleLine(await text('rtaBatNameR'), 'r'), guild: (await text('rtaBatGuildR')).trim() };
      if (!opp.name) return ctx.note(`Battle bar: the opponent's name was not read (try ${tries}/${MAX_TRIES})`);
      // Both servers ("Global", "Asia", …) read = the bar is fully shown. Seen on the owner's PC (DEVLOG #64): a look
      // while the bar was still fading in gave two wrong names and no server, guild or anything else.
      if (!me.server || !opp.server) return ctx.note(`Battle bar not fully shown yet (try ${tries}/${MAX_TRIES})`);
      // a guildmate: the same guild name on both sides, and not two different servers
      const sameGuild = D.sameGuild(me.guild, opp.guild) && (!me.server || !opp.server || me.server.toLowerCase() === opp.server.toLowerCase());
      doneFor = seen;
      ctx.publish('rta:battle', { me, opp, sameGuild });
      ctx.note(`Battle: ${me.name || 'you'} vs ${opp.name}${sameGuild ? ' · same guild: played for fun' : ''}`);
    },
  });
})();
