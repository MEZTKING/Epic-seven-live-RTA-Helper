// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: portraits, tesseract.js)
// The RTA reader on the owner's REAL Steam screens (tests/fixtures/screens, names blacked out), with NOTHING taught:
// which screen it recognises (built-in signatures), First Pick on the match-start screen, the 2 selected pre-bans on
// the picker, and what it reads in the pick slots of the BAN screen.
const __path = require('path');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(BASE + 'rta.html');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.click('.tab[data-tab=auto]');
  // the reader waits for all hero portraits before it looks at anything
  await p.setInputFiles('#auto-shot', __path.join(FX, 'steam-rta-menu.png'));
  await p.waitForFunction(() => window.RTAAuto._officialLoad.total > 0 && window.RTAAuto._officialLoad.done >= window.RTAAuto._officialLoad.total, null, { timeout: 120000 });
  const load = async (file) => {
    await p.setInputFiles('#auto-shot', __path.join(FX, file));
    await p.waitForTimeout(300);
    for (let i = 0; i < 3; i++) await p.evaluate(() => window.RTAAuto.tick());
    return p.evaluate(() => window.E7Screens.current());
  };
  const expect = { 'steam-rta-menu.png': 'rta-lobby', 'steam-rta-match-found.png': 'rta-found', 'steam-rta-match-start.png': 'rta-intro', 'steam-rta-preban-select.png': 'rta-preban-pick', 'steam-rta-preban-select2.png': 'rta-preban-pick', 'steam-rta-ban.png': 'rta-draft', 'steam-rta-victory.png': null };
  const got = {};
  for (const f of Object.keys(expect)) got[f] = await load(f);
  console.log('screens recognised with nothing taught:', JSON.stringify(Object.fromEntries(Object.keys(expect).map((f) => [f.replace('steam-rta-', '').replace('.png', ''), `${got[f]}${got[f] === expect[f] ? ' ✓' : ' ✗ expected ' + expect[f]}`]))));
  console.log('taught screens:', await p.evaluate(() => window.E7Screens.refs().length));
  // First Pick on the match-start screen ("First Pick" is under the opponent's art on this one)
  await load('steam-rta-match-start.png');
  await p.evaluate(() => window.RTAAuto._readFirstPick());
  await p.waitForTimeout(500);
  console.log('first pick read:', await p.evaluate(() => window.RTAApp.store.draft.firstPick), '(expected opp)');
  // the 2 selected pre-bans on the picker
  await load('steam-rta-preban-select2.png');
  console.log('selected pre-bans read on the picker:', JSON.stringify(await p.evaluate(() => window.RTAAuto._pickerPrebans().codes.map(window.RTAApp.nameOf))));
  // pick slots on the BAN screen
  await load('steam-rta-ban.png');
  for (let i = 0; i < 2; i++) await p.evaluate(() => window.RTAAuto.tick());
  const picks = await p.evaluate(() => [...window.RTAAuto._track.entries()].filter(([id]) => /pick/.test(id)).map(([id, t]) => `${id}: ${t.confirmed ? window.RTAApp.nameOf(t.confirmed.code) + ' ✓' : t.result && t.result.best ? window.RTAApp.nameOf(t.result.best.code) + '? ' + t.result.best.sim.toFixed(2) : '-'}`));
  console.log('BAN screen pick slots:', JSON.stringify(picks));
  console.log('errors:', errs);
  await b.close();
})();
