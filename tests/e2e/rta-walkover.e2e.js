// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: portraits, text reader)
// DEVLOG #60: a match the opponent left before the draft was finished (the owner's real screen, names blurred).
//  1) match start -> the draft under way -> the game shows VICTORY: noted apart from the matches, the draft cleared,
//     no match added, nothing in the hero statistics; the same screen is not counted twice
//  2) History shows it on its own card
//  3) without a match going on (no start screen seen) the same picture does nothing
const __path = require('path');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1300, height: 950 } })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(BASE + 'rta.html');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.click('.tab[data-tab=auto]');
  await p.setInputFiles('#auto-shot', __path.join(FX, 'steam-rta-menu.png'));
  await p.waitForFunction(() => window.RTAAuto._officialLoad.total > 0 && window.RTAAuto._officialLoad.done >= window.RTAAuto._officialLoad.total, null, { timeout: 120000 });
  let following = false; // "live": the reader follows the game (loading a screenshot switches that off each time)
  const load = async (file, ticks = 3, gap = 300) => {
    await p.setInputFiles('#auto-shot', __path.join(FX, file));
    await p.waitForTimeout(300);
    if (following) await p.evaluate(() => window.RTAAuto._setLive(true));
    for (let i = 0; i < ticks; i++) {
      await p.evaluate(() => window.RTAAuto.tick());
      await p.waitForTimeout(gap);
    }
  };
  const state = () => p.evaluate(() => ({ walkovers: (window.RTAApp.store.walkovers || []).map((w) => ({ result: w.result, source: w.source, mine: w.picks.me.length })), matches: window.RTAApp.store.matches.length, draftActions: window.RTAApp.store.draft.actions.length }));

  // 3) first: the picture alone, no match going on
  await load('steam-rta-victory-opponent-left-wide.jpg', 4, 2200);
  console.log('result screen with no match going on:', JSON.stringify(await state()), '· Confirm button seen:', await p.evaluate(() => window.RTAAuto._confirmShown()));

  // 1) a match starts (the reader follows the game: "live"), the draft is under way, the opponent leaves
  following = true;
  await load('steam-rta-match-start.png');
  console.log('draft before the result:', JSON.stringify(await state()));
  await load('steam-rta-victory-opponent-left-wide.jpg', 5, 2200);
  const s1 = await state();
  console.log('after VICTORY with an unfinished draft:', JSON.stringify(s1));
  console.log('status:', (await p.textContent('#auto-status')).replace(/\s+/g, ' ').trim().slice(0, 140));
  await load('steam-rta-victory-opponent-left-wide.jpg', 4, 2200);
  console.log('the same screen still up -> walkovers:', (await state()).walkovers.length, '(1 = not counted twice)');

  // 2) History
  await p.click('.tab[data-tab=history]');
  await p.waitForTimeout(300);
  console.log('History card:', (await p.locator('#hist-walkovers').count()) ? (await p.textContent('#hist-walkovers')).replace(/\s+/g, ' ').trim() : '(missing)');
  console.log('History matches card:', (await p.textContent('#hist-summary .card')).replace(/\s+/g, ' ').trim().slice(0, 60));
  console.log('errors:', errs);
  await b.close();
})();
