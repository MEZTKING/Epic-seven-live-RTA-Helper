// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: portraits)
// Guild War enemy defense read from the owner's REAL screen (tests/fixtures/screens/steam-gw-enemy.png, names blacked out):
// the game watcher (Live page) reads the 6 defense icons; the Guild War page shows "Seen in game" and "Save as … defense"
// opens the editor with the sure heroes filled in; a name typed for an unsure icon is learned (skins).
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
const { autoAsk, ask } = require('./_ask.js');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
  await autoAsk(ctx); // answers the app's in-page questions (js/ask.js)
  const errs = [];
  const gp = await ctx.newPage();
  gp.on('pageerror', (e) => errs.push('guild: ' + e.message));
  const answers = ['Test Foes'];
  gp.on('dialog', (d) => { const a = answers.shift(); a === undefined ? d.accept() : d.accept(a); });
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
  // the game watcher: Live page, fed the real enemy-defense screen
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  const url = 'data:image/png;base64,' + __fs.readFileSync(__path.join(FX, 'steam-gw-enemy.png')).toString('base64');
  const read = await lv.evaluate(async (url) => {
    const im = new Image();
    await new Promise((r) => { im.onload = r; im.src = url; });
    window.E7Vision._useSource(im);
    const r = window.E7Vision._readers.find((x) => x.id === 'guild-defense');
    // portraits load in the background on the first pass
    for (let i = 0; i < 120 && !/Defense: \d\/6 heroes recognised$|No defense/.test(r.note || ''); i++) { await window.E7Vision.tick(true); await new Promise((res) => setTimeout(res, 500)); }
    return r.note;
  }, url);
  console.log('defense reader:', read);
  await gp.waitForTimeout(500);
  const seen = await gp.evaluate(() => { const el = document.querySelector('#gw-seen'); return el && !el.classList.contains('hidden') ? el.textContent.replace(/\s+/g, ' ').trim() : 'not shown'; });
  console.log('Guild War page:', seen.slice(0, 200));
  // Save as … defense -> editor prefilled
  await gp.click('#gw-seen-save');
  await gp.waitForSelector('#target-dialog[open]');
  await gp.fill('#target-form [name=player]', 'Ozythral');
  const filled = await gp.$$eval('#team-editors .h3', (i) => i.map((x) => x.value));
  console.log('editor prefilled:', JSON.stringify(filled));
  // type a hero for the first empty place (as the owner would for a skin), then save -> learned
  const emptyIdx = filled.findIndex((v) => !v);
  if (emptyIdx >= 0) await (await gp.$$('#team-editors .h3'))[emptyIdx].fill('Bellona');
  await gp.click('#target-form button[type=submit], #target-save');
  await gp.waitForTimeout(500);
  const after = await gp.evaluate(() => ({ targets: window.GuildApp.state.targets.map((t) => [t.player, t.teams.map((tm) => tm.heroes.length)]), learned: JSON.parse(localStorage.getItem('e7-gw-face-corrections') || '[]').length }));
  console.log('saved:', JSON.stringify(after));
  // next time the same screen is read, the icon you named is recognised as that hero
  const again = await lv.evaluate(async () => {
    const r = window.E7Vision._readers.find((x) => x.id === 'guild-defense');
    r.idle(); // as if the screen had been left and opened again
    let got = null;
    const off = window.E7Bus.on('guild:defense', (d) => (got = d));
    await window.E7Vision.tick(true);
    await window.E7Vision.tick(true); // published when two reads agree
    off();
    return { note: r.note, first: got && got.teams[0][0] && { code: got.teams[0][0].code, sure: got.teams[0][0].sure } };
  });
  console.log('read again after learning:', JSON.stringify(again), '(Bellona = c1071)');
  console.log('errors:', errs);
  await b.close();
})();
