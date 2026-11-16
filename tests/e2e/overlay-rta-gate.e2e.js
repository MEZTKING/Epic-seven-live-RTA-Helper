// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// DEVLOG #54, "prebans shouldn't appear here until you're in an RTA match" (the pre-ban card was on the game in the
// lobby and on Guild War maps):
//  1) watching live, the RTA overlay shows nothing until the watcher's draft reader says a draft is on screen
//     ('rta:stage'); it comes with the draft and goes again when the draft is over
//  2) a layer lives only as long as its page: leaving the RTA page removes its card from the overlay at once
const __path = require('path');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
  const errs = [];
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('rta: ' + e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(BASE + 'rta.html');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  const ov = await ctx.newPage();
  ov.on('pageerror', (e) => errs.push('overlay: ' + e.message));
  await ov.goto(BASE + 'overlay.html');
  const bus = await ctx.newPage(); // stands in for the game watcher
  await bus.goto(BASE + 'live.html');
  const shown = async () => ((await ov.textContent('#layers')).replace(/\s+/g, ' ').trim().slice(0, 60) || '(nothing)');
  const stage = async (s) => {
    await bus.evaluate((st) => window.E7Bus.publish('rta:stage', { stage: st, turn: null }), s);
    await p.waitForTimeout(350);
  };
  // a draft screenshot gives the page its slot positions (built-in layout); a file is not "live": preview as before
  await p.click('.tab[data-tab=auto]');
  await p.setInputFiles('#auto-shot', __path.join(FX, 'steam-rta-ban.png'));
  await p.waitForTimeout(1200);
  await p.evaluate(() => {
    const A = window.RTAApp;
    for (const h of A.cache.heroes.slice(0, 3)) A.store.notes[h.code] = { ...(A.store.notes[h.code] || {}), tier: 'S' }; // something to suggest
    A.save();
    A.replaceDraft(window.RTALogic.newDraft('me'), { newMatch: true });
  });
  await p.waitForTimeout(400);
  console.log('screenshot file (not live):', await shown());
  // live, no draft on screen (lobby, Guild War …)
  await p.evaluate(() => window.RTAAuto._setLive(true));
  await stage('idle');
  console.log('live, watcher says no draft:', await shown(), '· on screen:', await p.evaluate(() => window.RTAAuto._rtaOnScreen()));
  await stage('versus');
  console.log('live, match found (versus):', await shown());
  await stage('preban');
  console.log('live, pre-ban phase:', await shown());
  await stage('idle');
  console.log('live, draft over:', await shown());
  // 2) the card is up; the RTA page is left (the owner was on the Guild War page with the card still on the game)
  await stage('preban');
  console.log('before leaving the RTA page:', await shown());
  await p.goto(BASE + 'guild.html');
  await ov.waitForTimeout(500);
  console.log('after leaving the RTA page:', await shown());
  console.log('errors:', errs);
  await b.close();
})();
