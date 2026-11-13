// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: OCR)
// DEVLOG #40, "I CANT ADD A NEW WAR, it should automatically be able to tell by looking at the guild name":
//  - New war works without window.prompt (which does nothing in the desktop app): an in-page form
//  - the game's Guild War overview (owner's real screen, guild names replaced by "TestHome" / "TestEnemies") starts the
//    war vs the enemy guild by itself, with the fortress names; reading it again doesn't add another; Undo removes it
//  - after Undo, reading that guild again does NOT start it again (review, DEVLOG #40); a war you finished isn't restarted
//  - a Guild War page opened after the overview was read uses the stored reading (and doesn't duplicate anything)
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
const { autoAsk, ask } = require('./_ask.js');
const dataUrl = (f) => 'data:image/jpeg;base64,' + __fs.readFileSync(__path.join(FX, f)).toString('base64');
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
  await gp.fill('#my-name', 'Ann');
  await gp.press('#my-name', 'Tab');
  await gp.fill('#guild-name', 'TestHome');
  await gp.click('#guild-create');
  await gp.waitForTimeout(300);
  await gp.click('.tab[data-tab=war]');
  const wars = () => gp.evaluate(() => window.GuildApp.state.wars.map((w) => `${w.enemyGuild}:${w.status}${w.forts && w.forts.enemy ? ' [' + w.forts.enemy.join(', ') + ']' : ''}`));
  console.log('wars at start:', JSON.stringify(await wars()));

  // the game watcher reads the enemy overview
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  const readOverview = (url) =>
    lv.evaluate(async (url) => {
      const im = new Image();
      await new Promise((r) => {
        im.onload = r;
        im.src = url;
      });
      window.E7Vision._useSource(im);
      const r = window.E7Vision._readers.find((x) => x.id === 'guild-overview');
      r.idle();
      r.note = '';
      let got = null;
      const off = window.E7Bus.on('guild:forts', (d) => (got = d));
      for (let i = 0; i < 30 && !got && !/no shield|not readable/.test(r.note || ''); i++) {
        await window.E7Vision.tick(true);
        await new Promise((res) => setTimeout(res, 200));
      }
      off();
      return { note: r.note, got };
    }, url);
  const o1 = await readOverview(dataUrl('steam-gw-overview-wide-blurred.jpg'));
  console.log('overview read:', o1.note, JSON.stringify(o1.got && { ourGuild: o1.got.ourGuild, enemyGuild: o1.got.enemyGuild }));
  await gp.waitForTimeout(800);
  console.log('wars after the overview:', JSON.stringify(await wars()));
  console.log('banner:', (await gp.textContent('#war-auto')).replace(/\s+/g, ' ').trim(), '| visible:', await gp.isVisible('#war-auto'));
  console.log('selected war:', await gp.evaluate(() => (window.GuildApp.state.wars.find((w) => w.id === window.GuildApp.warId) || {}).enemyGuild));

  // the same overview again: no second war
  await readOverview(dataUrl('steam-gw-overview-wide-blurred.jpg'));
  await gp.waitForTimeout(600);
  console.log('after reading it again:', JSON.stringify(await wars()));

  // Undo
  await gp.click('#war-auto-undo');
  await gp.waitForTimeout(600);
  console.log('after Undo:', JSON.stringify(await wars()));

  // New war by hand: the in-page form (no window.prompt)
  await ask(gp, ['Hand Made Guild', 'Season 9']);
  await gp.click('#war-new');
  await gp.waitForTimeout(600);
  console.log('after New war (form):', JSON.stringify(await wars()), '· season', await gp.evaluate(() => window.GuildApp.state.wars[0].season));

  // the guild you undid, read again (our side's overview names the enemy too): not started again
  await readOverview(dataUrl('steam-gw-overview-ours-wide-blurred.jpg'));
  await gp.waitForTimeout(800);
  console.log('after reading the undone guild again (expected: only Hand Made Guild):', JSON.stringify(await wars()));
  const gp2 = await ctx.newPage();
  gp2.on('pageerror', (e) => errs.push('guild2: ' + e.message));
  await gp2.goto(BASE + 'guild.html');
  await gp2.waitForTimeout(2500);
  console.log('a page opened later selects (expected Hand Made Guild, 1 war):', await gp2.evaluate(() => (window.GuildApp.state.wars.find((w) => w.id === window.GuildApp.warId) || {}).enemyGuild), '· wars:', await gp2.evaluate(() => window.GuildApp.state.wars.length));
  console.log('errors:', errs);
  await b.close();
})();
