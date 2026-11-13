// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// RTA: calibrate on a SAVED game picture (after the match), Back on step 1 / Cancel close calibration,
// and the game watcher's "save-picture" command stores a picture the RTA page can use.
const __path = require('path');
const __fs = require('fs');
const OUT = process.env.E7_OUT || __path.join(__dirname, 'out');
__fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(BASE + 'rta.html');
  await p.evaluate(async () => {
    localStorage.clear();
    await window.E7Pictures.clear();
  });
  await p.reload();
  await p.click('.tab[data-tab=auto]');
  // no pictures yet: the button explains how to get them
  await p.click('#auto-pics');
  // a picture saved "during a match" (here: a drawn draft-like screen)
  await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const x = c.getContext('2d'); x.fillStyle = '#20253a'; x.fillRect(0, 0, 1280, 720);
    x.fillStyle = '#3a6ad8'; for (let i = 0; i < 5; i++) x.fillRect(20, 120 + i * 105, 230, 90);
    x.fillStyle = '#d83a4a'; for (let i = 0; i < 5; i++) x.fillRect(1030, 120 + i * 105, 230, 90);
    await window.E7Pictures.capture(c, 'test draft');
  });
  // the game watcher (Live page) saves one too, by command (what Ctrl+Shift+S does in the desktop app)
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  const viaWatcher = await lv.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    c.getContext('2d').fillStyle = '#555'; c.getContext('2d').fillRect(0, 0, 1280, 720);
    window.E7Vision._useSource(c);
    const r = await window.E7Bus.request('save-picture', { note: 'Ctrl+Shift+S' });
    return !!r.id;
  });
  console.log('watcher saved a picture:', viaWatcher);
  await p.click('#auto-pics');
  await p.waitForSelector('#pics[open] .pic');
  const listed = await p.$$eval('#pics .pic span', (s) => s.map((x) => x.textContent.replace(/^\S+\s*(AM|PM)?\s*/, '').trim()));
  console.log('pictures listed:', JSON.stringify(listed));
  await p.screenshot({ path: OUT + '/rta-pictures.png' });
  // pick the "test draft" picture -> first say what's on it (no calibration yet)
  const idx = listed.findIndex((t) => t.includes('test draft'));
  await (await p.$$('#pics .pic'))[idx].click();
  await p.waitForTimeout(300);
  const parts = await p.evaluate(() => ({ calibOpen: !document.querySelector('#calib').classList.contains('hidden'), parts: [...document.querySelectorAll('#pics-parts [data-part]')].map((b) => b.textContent), oneBoxChoices: document.querySelectorAll('#pics-one option').length - 1 }));
  console.log('after choosing a picture:', JSON.stringify(parts));
  // a single part: the CR bar -> only that one step
  await p.click('#pics-parts [data-part=cr]');
  await p.waitForTimeout(400);
  console.log('CR bar part:', await p.textContent('#calib-step'));
  await p.click('#calib-cancel');
  // one draft box from the dropdown
  await p.click('#auto-pics');
  await p.waitForSelector('#pics[open] .pic');
  await (await p.$$('#pics .pic'))[idx].click();
  await p.selectOption('#pics-one', 'one:oppPickFirst');
  await p.waitForTimeout(400);
  console.log('one box:', await p.textContent('#calib-step'));
  await p.click('#calib-cancel');
  // the whole draft screen
  await p.click('#auto-pics');
  await p.waitForSelector('#pics[open] .pic');
  await (await p.$$('#pics .pic'))[idx].click();
  await p.click('#pics-parts [data-part=draft]');
  await p.waitForTimeout(400);
  const open1 = await p.evaluate(() => ({ visible: !document.querySelector('#calib').classList.contains('hidden'), step: document.querySelector('#calib-step').textContent, w: document.querySelector('#calib-canvas').width }));
  console.log('calibration on saved picture:', JSON.stringify(open1));
  // Back on step 1 closes it
  await p.click('#calib-back');
  console.log('after Back on step 1, open:', await p.evaluate(() => !document.querySelector('#calib').classList.contains('hidden')));
  // open again, draw one box, Back goes to step 1, Cancel closes without saving
  await (await p.$$('#auto-pics')).at(0).click();
  await p.waitForSelector('#pics[open] .pic');
  await (await p.$$('#pics .pic'))[idx].click();
  await p.click('#pics-parts [data-part=draft]');
  await p.waitForTimeout(300);
  const cv = await p.$('#calib-canvas');
  const bb = await cv.boundingBox();
  await p.mouse.move(bb.x + bb.width * 0.3, bb.y + bb.height * 0.85);
  await p.mouse.down();
  await p.mouse.move(bb.x + bb.width * 0.34, bb.y + bb.height * 0.92, { steps: 4 });
  await p.mouse.up();
  const stepAfterBox = await p.textContent('#calib-step');
  await p.click('#calib-back');
  const stepAfterBack = await p.textContent('#calib-step');
  await p.click('#calib-cancel');
  const saved = await p.evaluate(() => Object.keys((window.RTAApp.store.auto && window.RTAApp.store.auto.regions) || {}).length);
  console.log(JSON.stringify({ stepAfterBox: stepAfterBox.slice(0, 12), stepAfterBack: stepAfterBack.slice(0, 12), closed: await p.evaluate(() => document.querySelector('#calib').classList.contains('hidden')), regionsSaved: saved }));
  // teach the match-start screen (too quick to teach live) from a saved picture
  await p.click('#auto-pics');
  await p.waitForSelector('#pics[open] .pic');
  await (await p.$$('#pics .pic'))[idx].click();
  const teachOpts = await p.$$eval('#pics-teach option', (o) => o.map((x) => x.value).filter(Boolean));
  await p.selectOption('#pics-teach', 'rta-intro');
  await p.waitForTimeout(300);
  console.log('teach options:', JSON.stringify(teachOpts), '· taught rta-intro:', await p.evaluate(() => window.E7Screens.refs().filter((r) => r.screen === 'rta-intro').length));
  await p.click('#pics-close');
  // match start: a finished draft is kept as pending, a fresh draft begins, the profile art is saved
  const ms = await p.evaluate(async () => {
    const A = window.RTAApp;
    const L = window.RTALogic;
    let d = L.newDraft('me');
    for (const c of ['c1001', 'c1002', 'c1003', 'c1004', 'c1005', 'c1006', 'c1007', 'c1008', 'c1009', 'c1010', 'c1011', 'c1012', 'c1013', 'c1014']) if (!L.isComplete(d) && !L.canSelect(d, c)) d = L.select(d, c); // canSelect returns a reason when NOT allowed
    A.replaceDraft(d);
    const before = { id: A.store.draft.id, actions: A.store.draft.actions.length };
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720; c.getContext('2d').fillRect(0, 0, 1280, 720);
    window.RTAAuto._onMatchStart();
    await new Promise((r) => setTimeout(r, 400));
    const pics = await window.E7Pictures.list();
    return { before, after: { id: A.store.draft.id, actions: A.store.draft.actions.length }, pendingKept: !!A.store.pending, pictureNotes: pics.map((x) => x.note).filter((n) => /match start/.test(n)).length };
  });
  console.log('match start:', JSON.stringify(ms));
  console.log('errors:', errs);
  await b.close();
})();
