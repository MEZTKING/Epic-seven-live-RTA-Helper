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
const B = BASE;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  const errs = [];
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text()) && errs.push(m.text()));
  p.on('dialog', (d) => d.accept());
  await p.goto(B + 'rta.html');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForFunction(() => localStorage.getItem('e7-cecilia-heroes'), null, { timeout: 30000 });
  console.log('effects cached for', await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('e7-cecilia-heroes')).heroes).length), 'heroes');
  console.log('auto tags AV:', JSON.stringify(await p.evaluate(() => window.CeciliaBot.tagsFor('c2007'))), '| Belian:', JSON.stringify(await p.evaluate(() => window.CeciliaBot.tagsFor('c1117'))));
  // card with skills
  await p.evaluate(() => window.HeroInfo.open('c2007'));
  await p.waitForFunction(() => !document.querySelector('.hi-cb').textContent.includes('Loading'), null, { timeout: 30000 });
  console.log('card skills:', (await p.textContent('.hi-cb')).replace(/\s+/g, ' ').slice(0, 400));
  console.log('card tags:', (await p.textContent('.hi-tags')).replace(/\s+/g, ' '));
  await p.screenshot({ path: SP + '/v12-cecilia-card.png' });
  await p.click('dialog.heroinfo [data-hi=close]');
  // team check without any manual tags: enemies with debuffs, my team without cleanse
  const pick = async (n) => { await p.fill('#hero-search', n); await p.press('#hero-search', 'Enter'); };
  await p.selectOption('#first-pick', 'me');
  for (const n of ['Luna', 'Krau', 'Aria', 'Sez', 'Arbiter Vildred', 'Seaside Bellona', 'Tamarinne', 'Ravi', 'Ken', 'Landy', 'Belian']) await pick(n);
  console.log('team check:', (await p.textContent('#insights')).replace(/\s+/g, ' ').slice(0, 300));
  console.log('suggestion chips:', (await p.textContent('#suggest-list li')).replace(/\s+/g, ' ').slice(0, 120));
  // switch off -> no automatic tags
  await p.evaluate(() => window.CeciliaBot.setEnabled(false));
  console.log('off -> tags:', JSON.stringify(await p.evaluate(() => window.CeciliaBot.tagsFor('c2007'))));
  // privacy: what did we send to CeciliaBot?
  console.log('errors:', errs);
  await b.close();
})();
