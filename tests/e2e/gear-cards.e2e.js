// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// Gear card view: items show as tiles (like the game's inventory); clicking one opens the detail card;
// the table view still works and the choice is remembered.
const __path = require('path');
const __fs = require('fs');
const OUT = process.env.E7_OUT || __path.join(__dirname, 'out');
__fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, 'fixtures');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const vp of [{ width: 1400, height: 1000 }, { width: 390, height: 844 }]) {
    const g = await b.newPage({ viewport: vp, deviceScaleFactor: 1 });
    g.on('pageerror', (e) => errs.push(e.message));
    g.on('dialog', (d) => d.accept());
    await g.goto(BASE + 'gear.html');
    await g.evaluate(() => localStorage.clear());
    await g.reload();
    await g.setInputFiles('#gs-file', FX + '/gear3.txt');
    await g.waitForSelector('.gtile');
    const tiles = await g.$$eval('.gtile', (ts) => ts.length);
    await g.click('.gtile');
    await g.waitForSelector('#gs-detail:not(.hidden) .gd-main');
    const det = await g.$eval('#gs-detail', (d) => ({ main: d.querySelector('.gd-main').textContent.replace(/\s+/g, ' ').trim(), subs: d.querySelectorAll('.gd-sub').length, score: d.querySelector('.gd-score').textContent.replace(/\s+/g, ' ').trim() }));
    const overflow = await g.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await g.screenshot({ path: `${OUT}/gear-cards-${vp.width}.png`, fullPage: false });
    console.log(`${vp.width}px: tiles ${tiles}, detail ${JSON.stringify(det)}, horizontal overflow ${overflow}`);
    if (vp.width > 1000) {
      await g.selectOption('#f-view', 'table');
      const rows = await g.$$eval('#gs-rows tr', (r) => r.length);
      const cardsHidden = await g.$eval('#gs-browse', (e) => e.classList.contains('hidden'));
      await g.reload();
      const remembered = await g.$eval('#f-view', (e) => e.value);
      console.log(`table view: rows ${rows}, cards hidden ${cardsHidden}, remembered "${remembered}"`);
    }
    await g.close();
  }
  console.log('errors:', errs);
  await b.close();
})();
