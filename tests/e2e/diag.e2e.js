// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// Diagnostic report (js/diag.js): "Copy report for Claude" copies a text report with the reader's view of every slot,
// settings, watcher events and the log; secrets (sync key, Firebase settings, guild code) are never in it.
const __path = require('path');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.replace(/\/$/, '') });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + 'rta.html');
  await p.evaluate(() => {
    localStorage.clear();
    // secrets that must never appear in a report
    localStorage.setItem('e7-mysync', JSON.stringify({ enabled: true, key: 'SECRETSYNCKEY0000000000000000000000', config: { apiKey: 'SECRETAPIKEY', projectId: 'secretproject', appId: 'x' }, device: 'pc' }));
    localStorage.setItem('e7-guild-conn', JSON.stringify({ guildCode: 'SECRETGUILDCODE1234', config: { apiKey: 'SECRETAPIKEY2', projectId: 'p2', appId: 'y' } }));
  });
  await p.reload();
  await p.click('.tab[data-tab=auto]');
  await p.setInputFiles('#auto-shot', __path.join(FX, 'steam-rta-victory.png'));
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.E7Diag.log('test', 'hello from the test', { a: 1 }));
  await p.click('#tab-auto [data-diag-copy]');
  await p.waitForTimeout(500);
  const text = await p.evaluate(() => navigator.clipboard.readText());
  const sections = (text.match(/^## .+$/gm) || []).map((x) => x.slice(3));
  console.log('report length:', text.length, 'chars · sections:', JSON.stringify(sections));
  console.log('has slot lines:', /mePreban1|me-preban-0/.test(text), '· has layout:', /steam-16x9/.test(text), '· has log line:', text.includes('hello from the test'));
  console.log('secrets in report (must be none):', JSON.stringify(['SECRETSYNCKEY', 'SECRETAPIKEY', 'secretproject', 'SECRETGUILDCODE'].filter((s) => text.includes(s))));
  console.log('button says:', await p.textContent('#tab-auto [data-diag-copy]'));
  console.log(text.split('\n').filter((l) => /^me-preban-0|^me-pick-0|^source:/.test(l)).join('\n'));
  console.log('errors:', errs);
  await b.close();
})();
