// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// DEVLOG #72: the Guild War card ON THE GAME (overlay layer 'guild'): when the game watcher reads a player's name on
// their page, the Guild War page posts a card next to it (their dot, each team's verdict); it must reach the overlay
// and stay while the page is shown. (The owner: "guild war overlay not visible".)
// + snow (the owner's real page, names replaced): snowflakes drift over the page; the page must not be taken for
// "left" (that cleared the card) and the heroes must still be read (2 of 6 on the owner's PC before).
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const { chromium } = require('playwright');
const { autoAsk, ask } = require('./_ask.js');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
  await autoAsk(ctx);
  const errs = [];
  const gp = await ctx.newPage();
  gp.on('pageerror', (e) => errs.push('guild: ' + e.message));
  gp.on('dialog', (d) => d.accept());
  await gp.goto(BASE + 'guild.html');
  await gp.evaluate(() => localStorage.clear());
  await gp.reload();
  await gp.click('.tab[data-tab=setup]');
  await gp.fill('#my-name', 'Ann'); await gp.press('#my-name', 'Tab');
  await gp.fill('#guild-name', 'Testers');
  await gp.click('#guild-create');
  await gp.waitForTimeout(300);
  await gp.click('.tab[data-tab=war]');
  await ask(gp, ['Test Foes', '']);
  await gp.click('#war-new');
  await gp.waitForTimeout(300);
  // a defender from a fortress map (as the watcher would have saved it)
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  await lv.evaluate(() => window.E7Bus.publish('guild:fortress', { side: 'enemy', index: 0, fort: 'Stinger Fortress', players: [{ name: 'Rival7', known: false, conf: 90, agree: true, x: 0.4, y: 0.4, pos: 0 }], keep: null }));
  await gp.waitForTimeout(800);
  // the overlay page (what the desktop app shows on the game)
  const ov = await ctx.newPage();
  ov.on('pageerror', (e) => errs.push('overlay: ' + e.message));
  await ov.goto(BASE + 'overlay.html');
  await ov.waitForTimeout(500);
  // the watcher's status, as the desktop app's watcher sends it (here no real capture runs)
  await lv.evaluate(() => { const send = () => window.E7Bus.publish('vision:status', { watching: true, name: 'Epic Seven', screen: null, screenLabel: '' }); send(); setInterval(send, 2000); });
  await gp.waitForTimeout(600);
  const status = await gp.evaluate(() => ({ watching: !!(window.VisionClient.alive() && (window.VisionClient.status() || {}).watching), targets: window.GuildApp.state.targets.map((t) => t.player) }));
  console.log('guild page: targets', JSON.stringify(status.targets), '· sees the watcher running:', status.watching);
  // the player's page: the name read twice (as the watcher does every few seconds)
  for (let i = 0; i < 3; i++) {
    await lv.evaluate(() => window.E7Bus.publish('guild:name-read', { text: 'Rival7', rect: { x: 0.107, y: 0.213, w: 0.085, h: 0.039 }, options: [] }));
    await gp.waitForTimeout(400);
  }
  await ov.waitForTimeout(800);
  const shown = () => ov.evaluate(() => ({ guild: ((window.E7OverlayView && window.E7OverlayView.layers.guild) || []).map((x) => `${x.kind} "${x.title}" ${(x.lines || []).join(' / ')}`), text: document.querySelector('#layers').textContent.replace(/\s+/g, ' ').trim().slice(0, 160) }));
  console.log('overlay after the name was read:', JSON.stringify(await shown()));
  await ov.waitForTimeout(16000);
  console.log('16 s later (the page repeats its layer):', JSON.stringify(await shown()));
  await lv.evaluate(() => window.E7Bus.publish('guild:name-read', { text: '', away: true }));
  await ov.waitForTimeout(800);
  console.log('page left in the game:', JSON.stringify(await shown()));
  // snow: the real page with two different sets of snowflakes, shown in turn
  const url = 'data:image/jpeg;base64,' + require('fs').readFileSync(require('path').join(__dirname, '..', 'fixtures', 'screens', 'steam-gw-page-snow-wide.jpg')).toString('base64');
  const snow = await lv.evaluate(async (url) => {
    const im = new Image();
    await new Promise((r) => { im.onload = r; im.src = url; });
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const frame = () => {
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      x.fillStyle = 'rgba(245,248,252,0.95)';
      for (let i = 0; i < 1400; i++) { x.beginPath(); x.arc(rnd() * im.width, rnd() * im.height, 2 + rnd() * 4, 0, 7); x.fill(); }
      return c;
    };
    const frames = [frame(), frame()];
    const GF = window.E7GWFaces;
    GF.load();
    for (let i = 0; i < 240 && !GF.ready(); i++) await new Promise((r) => setTimeout(r, 500));
    let away = 0;
    let names = 0;
    const off1 = window.E7Bus.on('guild:name-read', (d) => (d.away ? away++ : names++));
    const notes = [];
    for (let i = 0; i < 8; i++) {
      window.E7Vision._useSource(frames[i % 2]);
      await window.E7Vision.tick(true);
      notes.push(window.E7Vision._readers.find((q) => q.id === 'guild-defense').note);
    }
    off1();
    const one = (() => { const c = frames[0]; window.E7Vision._useSource(c); return window.E7GWPage.shown({ source: c, w: () => c.width, h: () => c.height }); })();
    return { away, names, last: notes[notes.length - 1], notes: [...new Set(notes)], oneFrameShown: one };
  }, url);
  console.log('snow: page "left" events', snow.away, '(0 = never left) · names read', snow.names, '· one snowy frame alone counts as the page:', snow.oneFrameShown);
  console.log('   defense reader:', snow.last, JSON.stringify(snow.notes));
  console.log('errors:', errs);
  await b.close();
})();
