// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// The web site after DEVLOG #37 (desktop-only app; the web keeps only Guild War for guildmates):
//  - builds _site exactly like .github/workflows/pages.yml and serves it on :8767
//  - guild.html in a browser: shared war plan, no game-reading buttons, no RTA/Gear/Live links, "Get the desktop app"
//  - rta.html (old address) with old RTA data in the browser: "Save my RTA data" → that file imports into the app's RTA page
//  - without old data it goes to Guild War by itself
//  - the retired service worker clears its caches and unregisters itself
const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', '..');
const SITE = path.join(__dirname, 'out', 'site');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
(async () => {
  // the "Collect site files" step of pages.yml, run as written
  const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/pages.yml'), 'utf8');
  const step = yml.split('- name: Collect site files')[1].split('run: |')[1].split(/\n\s{6}- /)[0];
  const cmds = step.split('\n').map((l) => l.replace(/^\s{10}/, '')).filter((l) => l.trim()).join('\n');
  fs.rmSync(SITE, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(SITE), { recursive: true });
  execSync(cmds.replace(/_site/g, SITE), { cwd: ROOT, shell: '/bin/bash' });
  console.log('site files:', fs.readdirSync(SITE).sort().join(' '));
  const srv = spawn('python3', ['-m', 'http.server', '8767'], { cwd: SITE, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const WEB = 'http://localhost:8767/';
  const b = await chromium.launch();
  const errs = [];
  try {
    const ctx = await b.newContext({ acceptDownloads: true });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    // the retired service worker: an old install is cleared
    await p.goto(WEB + 'guild.html');
    await p.evaluate(async () => { const c = await caches.open('epic7-engine-v25'); await c.put('/x', new Response('old')); await navigator.serviceWorker.register('sw.js'); });
    await p.waitForTimeout(1500);
    console.log('after the old offline app updates: registrations', await p.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), '· caches', JSON.stringify(await p.evaluate(() => caches.keys())));
    await p.goto(WEB + 'guild.html');
    const vis = (sel) => p.$$eval(sel, (els) => els.filter((e) => e.offsetParent !== null).map((e) => e.textContent.trim()));
    console.log('guild page (web) app bar:', JSON.stringify(await vis('.appbar a, .appbar .brand')));
    console.log('game-reading buttons visible:', JSON.stringify(await vis('#gw-watch, #gw-watch-box, #gw-teach, [data-reset-game-area]')));
    console.log('war tabs:', JSON.stringify(await vis('.tabs .tab')));
    // old address, no old data -> Guild War
    await p.goto(WEB + 'rta.html');
    await p.waitForURL(/guild\.html/, { timeout: 6000 });
    console.log('rta.html without old data ->', p.url().replace(WEB, ''));
    // old address WITH old RTA data -> save it -> import into the app's RTA page
    await p.evaluate(() => localStorage.setItem('rta-helper-v2', JSON.stringify({ version: 2, notes: { c1071: { text: 'old browser note' } }, matches: [] })));
    await p.goto(WEB + 'rta.html');
    await p.waitForTimeout(3000);
    console.log('rta.html with old data stays:', p.url().endsWith('rta.html'), '·', (await p.textContent('#saved')).replace(/\s+/g, ' ').trim().slice(0, 90));
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#save')]);
    const file = path.join(__dirname, 'out', 'old-rta-backup.json');
    await dl.saveAs(file);
    const a = await ctx.newPage();
    a.on('pageerror', (e) => errs.push('app: ' + e.message));
    a.on('dialog', (d) => d.accept());
    await a.goto(BASE + 'rta.html');
    await a.evaluate(() => localStorage.clear());
    await a.reload();
    await a.click('.tab[data-tab=data]');
    await a.setInputFiles('#import', file);
    await a.waitForTimeout(500);
    console.log('imported into the app:', JSON.stringify(await a.evaluate(() => (window.RTAApp.store.notes.c1071 || {}).text)));
  } finally {
    await b.close();
    srv.kill();
  }
  console.log('errors:', errs);
})();
