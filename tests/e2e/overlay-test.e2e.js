// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// "Is the overlay working?": Live → "Show a test card on the overlay" puts a card on the overlay for 5 s.
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  const ov = await ctx.newPage();
  ov.on('pageerror', (e) => errs.push('overlay: ' + e.message));
  await ov.goto(BASE + 'overlay.html');
  const live = await ctx.newPage();
  live.on('pageerror', (e) => errs.push('live: ' + e.message));
  await live.goto(BASE + 'live.html');
  await live.click('#live-test');
  await ov.waitForTimeout(400);
  const shown = await ov.evaluate(() => ({ card: (document.querySelector('.ov-card') || {}).textContent || '', badge: document.querySelector('.ov-badge.on') ? document.querySelector('.ov-badge').textContent : '' }));
  console.log('test card shown:', JSON.stringify(shown));
  await ov.waitForTimeout(5200);
  console.log('after 5 s, card gone:', await ov.evaluate(() => !document.querySelector('.ov-card')));
  console.log('errors:', errs);
  await b.close();
})();
