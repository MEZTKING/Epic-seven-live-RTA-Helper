// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// Match review: a match's timeline, slot snapshot and pictures (here: the real BAN screen) show up; "Show with boxes"
// opens the boxes on that picture; "Download" saves it as a file; "Copy this match for Claude" copies the text.
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.replace(/\/$/, '') });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + 'rta.html');
  await p.evaluate(async () => { localStorage.clear(); await window.E7Pictures.clear(); });
  await p.reload();
  await p.click('.tab[data-tab=auto]');
  const url = 'data:image/png;base64,' + __fs.readFileSync(__path.join(FX, 'steam-rta-ban.png')).toString('base64');
  await p.evaluate(async (url) => {
    const id = window.RTAApp.store.draft.id;
    window.E7Trace.event(id, 'match found ("Here comes a new challenger!"): new match');
    window.E7Trace.event(id, 'status: waiting for the RTA draft screen (0 of 4 recognised)');
    window.E7Trace.event(id, 'status: waiting for the RTA draft screen (0 of 4 recognised)');
    window.E7Trace.slots(id, { 'me-preban-0': { guess: 'Stark', score: 0.61, sure: false, source: 'official (face match)', badges: 'fire/warrior' }, 'me-pick-0': { guess: '', score: null, confirmed: '' } });
    await window.E7Pictures.add({ url, w: 1340, h: 754, frameKey: 'window-16x9', note: 'draft screen 1', draftId: id });
    await window.RTAAuto._renderReview();
  }, url);
  const body = await p.evaluate(() => ({ option: document.querySelector('#mr-match').selectedOptions[0].textContent, pics: document.querySelectorAll('#mr-body .pic').length, slots: document.querySelectorAll('#mr-body table tbody tr').length, timeline: [...document.querySelectorAll('#mr-body ul li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim()) }));
  console.log('match review:', JSON.stringify(body));
  await p.click('[data-mr-boxes]');
  await p.waitForTimeout(400);
  console.log('show with boxes:', await p.textContent('#calib-title'), '·', await p.evaluate(() => document.querySelector('#calib-canvas').width));
  await p.click('#calib-cancel');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-mr-dl]')]);
  console.log('download:', dl.suggestedFilename());
  await p.click('#mr-copy');
  await p.waitForTimeout(300);
  const txt = await p.evaluate(() => navigator.clipboard.readText());
  console.log('copied match text has slots + timeline:', /me-preban-0/.test(txt) && /Timeline/.test(txt), '·', txt.split('\n')[0].slice(0, 60));
  console.log('errors:', errs);
  await b.close();
})();
