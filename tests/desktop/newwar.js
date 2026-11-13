// Desktop app (DEVLOG #40): "I can't add a new war". window.prompt() does nothing in Electron; New war now asks inside
// the page (js/ask.js). Run: bash tests/desktop/withwm.sh tests/desktop/newwar.js <electron binary> [app dir]
const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'e7ud-'));
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ capture: { mode: 'screen', id: 'screen:0:0', name: 'Screen 1' } }));
  const args = [...(process.argv[3] ? [process.argv[3]] : []), '--no-sandbox', `--user-data-dir=${userData}`];
  const app = await _electron.launch({ executablePath: process.argv[2], args });
  await new Promise((r) => setTimeout(r, 2500));
  const p = app.windows().find((w) => /index\.html/.test(w.url()));
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(p.url().replace(/[^/]*$/, 'guild.html'));
  console.log('prompt() in Electron returns:', JSON.stringify(await p.evaluate(() => { try { return window.prompt('x', 'y'); } catch (e) { return 'throws: ' + e.message; } })));
  await p.click('.tab[data-tab=setup]');
  await p.fill('#my-name', 'Ann');
  await p.press('#my-name', 'Tab');
  await p.fill('#guild-name', 'Testers');
  await p.click('#guild-create');
  await p.waitForTimeout(400);
  await p.click('.tab[data-tab=war]');
  await p.click('#war-new');
  await p.waitForSelector('dialog.ask-dialog[open]', { timeout: 5000 });
  await p.fill('dialog.ask-dialog input[name=guild]', 'Foes Guild');
  await p.click('dialog.ask-dialog button.primary');
  await p.waitForTimeout(500);
  console.log('wars after New war:', JSON.stringify(await p.evaluate(() => window.GuildApp.state.wars.map((w) => `${w.enemyGuild}:${w.status}`))));
  console.log('war shown:', await p.$eval('#war-select', (s) => s.selectedOptions[0] && s.selectedOptions[0].textContent));
  await app.close();
  console.log('errors:', errs);
})().catch((e) => { console.error(e); process.exit(1); });
