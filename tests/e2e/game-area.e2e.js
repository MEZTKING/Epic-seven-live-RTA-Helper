// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// Game area: a whole-screen capture with the game window inside it. Readers must only see the game,
// and the desktop overlay must map positions back to the full screen.
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
  const g = await ctx.newPage();
  g.on('pageerror', (e) => errs.push(e.message));
  g.on('dialog', (d) => d.accept());
  await g.goto(BASE + 'gear.html');
  await g.evaluate(() => localStorage.clear());
  await g.reload();
  // a 1920x1080 "screen": desktop clutter + the game window at (600,200) size 960x540 with an item panel inside
  const area = await g.evaluate(() => {
    const scr = document.createElement('canvas'); scr.width = 1920; scr.height = 1080;
    const x = scr.getContext('2d'); x.fillStyle = '#2b2f3a'; x.fillRect(0, 0, 1920, 1080);
    x.fillStyle = '#fff'; x.font = '20px sans-serif'; x.fillText('Some other window: Speed 99  Attack 50%', 40, 60);
    x.fillStyle = '#141a26'; x.fillRect(600, 200, 960, 540); // game window
    x.fillStyle = '#1f2738'; x.fillRect(1180, 260, 340, 380); // item panel inside the game
    x.fillStyle = '#fff'; x.font = 'bold 22px sans-serif';
    [['Epic Boots', 300], ['+15', 335], ['Speed Set', 370], ['Speed 45', 420], ['Critical Hit Chance 14%', 470], ['Attack 18%', 510], ['Speed 12', 550], ['Effectiveness 6%', 590]].forEach(([t, y]) => x.fillText(t, 1195, y));
    window.__screen = scr;
    // the user boxed the game window once
    const a = { x: 600 / 1920, y: 200 / 1080, w: 960 / 1920, h: 540 / 1080, fw: 1920, fh: 1080 };
    localStorage.setItem('e7-game-area', JSON.stringify(a));
    return a;
  });
  const res = await g.evaluate(async () => {
    const src = await window.GameArea.wrap(window.__screen);
    // item boxes are measured INSIDE the game area (960x540): panel text starts at x=595, y = (line y - 200)
    const box = (y, w = 320) => ({ x: 590 / 960, y: (y - 200 - 26) / 540, w: w / 960, h: 34 / 540 });
    localStorage.setItem('e7-gearscan-boxes', JSON.stringify({ gear: box(300), enhance: box(335, 80), set: box(370), main: box(420), sub0: box(470), sub1: box(510), sub2: box(550), sub3: box(590) }));
    window.__src = src;
    return { size: [src.width, src.height], isArea: !!src.isGameArea };
  });
  // the game watcher (Live page) reads the cropped game picture; the item lands on the Gear page
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  await lv.evaluate(async (a) => {
    // same "screen" in the watcher's page, cropped the same way
    const scr = document.createElement('canvas'); scr.width = 1920; scr.height = 1080;
    const x = scr.getContext('2d'); x.fillStyle = '#2b2f3a'; x.fillRect(0, 0, 1920, 1080);
    x.fillStyle = '#fff'; x.font = '20px sans-serif'; x.fillText('Some other window: Speed 99  Attack 50%', 40, 60);
    x.fillStyle = '#141a26'; x.fillRect(600, 200, 960, 540); x.fillStyle = '#1f2738'; x.fillRect(1180, 260, 340, 380);
    x.fillStyle = '#fff'; x.font = 'bold 22px sans-serif';
    [['Epic Boots', 300], ['+15', 335], ['Speed Set', 370], ['Speed 45', 420], ['Critical Hit Chance 14%', 470], ['Attack 18%', 510], ['Speed 12', 550], ['Effectiveness 6%', 590]].forEach(([t, y]) => x.fillText(t, 1195, y));
    const src = await window.GameArea.wrap(scr);
    window.E7Vision._useSource(src);
    for (let i = 0; i < 3; i++) await window.E7Vision.tick(true);
  });
  await g.waitForTimeout(400);
  res.scanned = await g.evaluate(() => window.GearApp.gs.scanned.map((i) => [i.gear, i.set, i.main.type, i.main.value, i.subs.length]));
  console.log('wrapped source:', JSON.stringify(res));
  // boxes drawn before (on the whole screen) -> warned once; after drawing them again on this picture -> no warning
  const stale = await g.evaluate(async () => {
    const src = await window.GameArea.wrap(window.__screen);
    const first = window.GameArea.warnIfStale('gear', src, true, 'redo');
    const again = window.GameArea.warnIfStale('gear', src, true, 'redo');
    window.GameArea.markCalibrated('gear', src);
    return { first, again, key: window.GameArea.frameKey(src), saved: JSON.parse(localStorage.getItem('e7-frame-of')).gear };
  });
  console.log('stale boxes check:', JSON.stringify(stale), '(expected first true, again false, key = saved)');
  // overlay in desktop mode maps the card back to the screen position of the game area
  const ov = await ctx.newPage();
  ov.on('pageerror', (e) => errs.push(e.message));
  await ov.setViewportSize({ width: 1920, height: 1080 });
  await ov.goto(BASE + 'overlay.html?desktop=1');
  await g.evaluate(() => window.E7Overlay.post('test', [{ x: 0.5, y: 0.5, w: 0.1, h: 0.1, kind: 'label', title: 'centre of game' }]));
  await ov.waitForTimeout(300);
  const pos = await ov.$eval('.ov-label', (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; });
  // centre of the game area = (600 + 0.5*960, 200 + 0.5*540) = (1080, 470); label sits right of a 96px box -> x ≈ 1080+96+6
  console.log('overlay label at', JSON.stringify(pos), '(expected about [1182, 470])');
  console.log('errors:', errs);
  await b.close();
})();
