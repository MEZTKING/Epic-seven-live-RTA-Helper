// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// Serves the repo on http://localhost:8766 (override with E7_BASE). Screenshots -> tests/e2e/out/ (E7_OUT).
const __path = require('path');
const __fs = require('fs');
const OUT = process.env.E7_OUT || __path.join(__dirname, 'out');
__fs.mkdirSync(OUT, { recursive: true });
const FX = __path.join(__dirname, 'fixtures');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const { chromium } = require('playwright');
const SP = OUT;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + 'index.html');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('rta-helper-v2', JSON.stringify({ version: 2, matches: [{ result: 'win' }, { result: 'loss' }, { result: 'win' }] })); localStorage.setItem('e7-guild-conn', JSON.stringify({ guildCode: 'abcdefghijkl1234', guildName: 'Moonlight', myName: 'Ann' })); });
  await p.reload();
  console.log('home status:', await p.$$eval('.stat-line', (e) => e.map((x) => x.textContent).join(' | ')));
  await p.screenshot({ path: SP + '/v7-home.png' });
  for (const [mod, file] of [['RTA', 'rta.html'], ['Gear', 'gear.html'], ['Guild War', 'guild.html']]) {
    await p.click(`.modules a:has-text("${mod}")`);
    await p.waitForLoadState();
    const active = await p.$eval('.mod.active', (e) => e.textContent);
    const tabs = await p.$$eval('.topbar .tabs .tab', (e) => e.map((x) => x.textContent.trim()).join(','));
    console.log(file, '| url ok:', p.url().endsWith(file), '| active:', active, '| subtabs:', tabs || '(none)');
    if (file === 'rta.html') { await p.click('.tab[data-tab=speed]'); console.log('  rta tab switch works:', await p.isVisible('#tab-speed')); await p.screenshot({ path: SP + '/v7-rta.png' }); }
    await p.click('.brand'); await p.waitForLoadState();
    console.log('  brand -> home:', p.url().endsWith('index.html'));
  }
  const m = await ctx.newPage();
  await m.setViewportSize({ width: 390, height: 844 });
  for (const f of ['index.html', 'rta.html', 'gear.html', 'guild.html']) { await m.goto(BASE + f); console.log('mobile', f, 'hscroll:', await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)); if (f !== 'gear.html') await m.screenshot({ path: SP + `/v7-m-${f.replace('.html', '')}.png` }); }
  console.log('errors:', errs);
  await b.close();
})();
