/*
 * Guild War standby reader (DEVLOG #46): the page the game shows when NO war is running ("Guild War Standby",
 * "War Begins in 29h"). Owner: "detect that since there is no guild war for today".
 * Publishes 'guild:standby' { minutes, beginsAt (ISO, estimated from the countdown), season, text } and stores
 * localStorage 'e7-gw-standby' = { at, minutes, beginsAt, season }. The Guild War page then says so, finishes a war
 * that is still open (with Undo) and stops using an older overview reading.
 * How it is recognised (js/gwmap.js STANDBY: fractions of the picture height around the middle, so any window size):
 *   1. cheap, every pass: the green "Team Formation" button where the standby page has it
 *   2. then the title is read: it must say "Guild War Standby"
 *   3. then the countdown under "War Begins" ("in 29h")
 * It is published after two passes in a row agree, and read again only once a minute while the page stays open.
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const G = window.E7GWMap;
  if (!V || !G || !G.standbyRect) return;
  const OTHER = /^(gw-enemy|gw-map|gw-battle|rta-|gear-)/;
  const KEY = 'e7-gw-standby';
  const norm = document.createElement('canvas');
  const nctx = norm.getContext('2d', { willReadFrequently: true });
  let seen = { key: '', n: 0 };
  let sent = { key: '', at: 0 };

  /** One part of the page, enlarged for the text reader: light letters on a busy background -> dark on white. */
  function crop(rect, height, min) {
    const c = document.createElement('canvas');
    c.height = height;
    c.width = Math.round((rect.w * height) / rect.h);
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingQuality = 'high';
    x.drawImage(norm, rect.x, rect.y, rect.w, rect.h, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height);
    const s = d.data;
    for (let i = 0; i < s.length; i += 4) {
      // white text: every channel light; the season line is light blue: blue light and clearly above red
      const v = (min > 0 ? Math.min(s[i], s[i + 1], s[i + 2]) >= min : s[i + 2] >= 170 && s[i + 2] - s[i] >= 60) ? 0 : 255;
      s[i] = s[i + 1] = s[i + 2] = v;
    }
    x.putImageData(d, 0, 0);
    return c;
  }

  V.register({
    id: 'guild-standby',
    label: 'Guild War standby (no war running, time to the next one)',
    module: 'guild',
    every: 5000,
    ready: () => true,
    idle() {
      seen = { key: '', n: 0 };
    },
    async read(ctx) {
      const cur = window.E7Screens && window.E7Screens.current();
      if (cur && OTHER.test(cur)) return ctx.note(`Not the standby page (${cur})`);
      const H = G.NORM_H;
      const W = Math.round((ctx.w() * H) / ctx.h());
      if (!(W > H)) return ctx.note('No picture yet');
      norm.width = W;
      norm.height = H;
      nctx.drawImage(ctx.source, 0, 0, W, H);
      const b = G.standbyRect('button', W, H);
      const green = G.greenShare(nctx.getImageData(Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)).data, Math.round(b.w), Math.round(b.h), { x: 0, y: 0, w: b.w, h: b.h });
      if (green < 0.45) {
        seen = { key: '', n: 0 };
        return ctx.note('Not the standby page');
      }
      if (sent.key && Date.now() - sent.at < 60000) return ctx.note(`Standby: no war running${sent.text ? ` · ${sent.text}` : ''}`);
      // the title (white), read two ways; one must say "Guild War Standby"
      let title = '';
      for (const min of [205, 175]) {
        title = String(await ctx.ocr(crop(G.standbyRect('title', W, H), 96, min), { line: true })).trim();
        if (G.isStandbyTitle(title)) break;
      }
      if (!G.isStandbyTitle(title)) {
        seen = { key: '', n: 0 };
        return ctx.note(`Not the standby page (title read: "${title.slice(0, 30)}")`);
      }
      let minutes = null;
      let raw = '';
      for (const min of [205, 175, 150]) {
        raw = String(await ctx.ocr(crop(G.standbyRect('time', W, H), 96, min), { line: true })).trim();
        minutes = G.standbyMinutes(raw);
        if (minutes) break;
      }
      const season = (String(await ctx.ocr(crop(G.standbyRect('season', W, H), 80, 0), { line: true })).match(/\d{4}\s*-\s*\d+/) || [''])[0].replace(/\s+/g, '');
      const key = `${minutes}`;
      seen = seen.key === key ? { key, n: seen.n + 1 } : { key, n: 1 };
      const text = minutes ? `next war in ${minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`}` : 'time to the next war not readable';
      ctx.note(`Standby: no war running · ${text}${seen.n < 2 ? ' (checking once more)' : ''}`);
      if (seen.n < 2) return;
      const now = Date.now();
      const out = { minutes, beginsAt: minutes ? new Date(now + minutes * 60000).toISOString() : null, season, text: raw };
      sent = { key, at: now, text };
      try {
        localStorage.setItem(KEY, JSON.stringify({ at: new Date(now).toISOString(), minutes, beginsAt: out.beginsAt, season }));
      } catch (_) { /* only a help */ }
      ctx.publish('guild:standby', out);
      // the desktop app reminds you about 30 minutes before that war (desktop/reminder.js)
      if (out.beginsAt && window.E7Desktop && window.E7Desktop.guildStandby) window.E7Desktop.guildStandby({ beginsAt: out.beginsAt });
    },
  });
  window.E7GuildStandby = { _reset: () => ((seen = { key: '', n: 0 }), (sent = { key: '', at: 0 })) };
})();
