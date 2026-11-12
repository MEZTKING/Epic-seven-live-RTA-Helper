// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// Serves the repo on http://localhost:8766 (override with E7_BASE). Screenshots -> tests/e2e/out/ (E7_OUT).
const __path = require('path');
const __fs = require('fs');
const OUT = process.env.E7_OUT || __path.join(__dirname, 'out');
__fs.mkdirSync(OUT, { recursive: true });
const FX = __path.join(__dirname, 'fixtures');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const { chromium } = require('playwright');
const SP = OUT;
const B = BASE;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  const watch = (pg) => { pg.on('pageerror', (e) => errs.push(pg.url().split('/').pop() + ': ' + e.message)); pg.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text()) && errs.push(m.text())); };
  const g = await ctx.newPage(); watch(g);
  g.on('dialog', (d) => d.accept());
  await g.goto(B + 'gear.html');
  await g.evaluate(() => localStorage.clear());
  await g.setInputFiles('#gs-file', FX + '/gear3.txt'); // heroes + gear for "best for" (shared roster)
  await g.waitForTimeout(400);
  // overlay preview listening
  const ov = await ctx.newPage(); watch(ov);
  await ov.goto(B + 'overlay.html');
  // the game watcher runs on the Live page in a browser (data-vision-host="browser")
  const l = await ctx.newPage(); watch(l);
  await l.goto(B + 'live.html'); await l.waitForTimeout(300);
  // fake game frames: item details panel, and some other screen (made in the watcher's page)
  await l.evaluate(() => {
    const mk = (lines, other) => {
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
      const x = c.getContext('2d'); x.fillStyle = other ? '#3a1b1b' : '#141a26'; x.fillRect(0, 0, 1280, 720);
      x.fillStyle = other ? '#552' : '#1f2738'; x.fillRect(820, 120, 400, 460);
      x.fillStyle = '#fff'; x.font = 'bold 26px sans-serif';
      lines.forEach(([t, y]) => x.fillText(t, 840, y));
      return c;
    };
    window.__item = mk([['Epic Boots', 160], ['+15', 200], ['Speed Set', 240], ['Speed 45', 300], ['Critical Hit Chance 14%', 360], ['Attack 18%', 400], ['Speed 12', 440], ['Effectiveness 6%', 480]]);
    window.__item2 = mk([['Epic Ring', 160], ['+15', 200], ['Hit Set', 240], ['Defense 300', 300], ['Defense 5%', 360], ['Health 4%', 400], ['Effect Resistance 4%', 440], ['Attack 33', 480]]);
    window.__other = mk([['VICTORY', 300]], true);
    const box = (y, w = 380) => ({ x: 832 / 1280, y: (y - 30) / 720, w: w / 1280, h: 40 / 720 });
    localStorage.setItem('e7-gearscan-boxes', JSON.stringify({ gear: box(160), enhance: box(200, 80), set: box(240), main: box(300), sub0: box(360), sub1: box(400), sub2: box(440), sub3: box(480) }));
    window.E7Screens.teach(window.__item, 'gear-item'); window.E7Screens.teach(window.__item2, 'gear-item');
  });
  const run = async (frame) => { await l.evaluate((f) => window.E7Vision._useSource(window[f]), frame); for (let i = 0; i < 3; i++) await l.evaluate(() => window.E7Vision.tick(true)); await g.waitForTimeout(300); };
  console.log('is host: live', await l.evaluate(() => window.E7Vision.isHost), '/ gear page has no watcher', await g.evaluate(() => !window.E7Vision));
  await run('__item');
  console.log('status 1 (gear page):', await g.textContent('#gs-scan-status'));
  console.log('log 1 (gear page):', (await g.textContent('#gs-scan-log')).replace(/\s+/g, ' '));
  await run('__item2');
  console.log('snapshot for Set boxes (gear page):', JSON.stringify(await g.evaluate(async () => { const s = await window.VisionClient.snapshot(); return [s.w, s.h, s.frameKey, s.img.naturalWidth]; })));
  console.log('status 2 (gear page):', await g.textContent('#gs-scan-status'));
  // other screen: the gear reader must pause
  await run('__other');
  console.log('reader on other screen:', await l.evaluate(() => window.E7Vision._readers.find((r) => r.id === 'gear-item').note));
  console.log('watcher log:', (await l.textContent('#vw-log')).replace(/\s+/g, ' ').slice(0, 300));
  console.log('scanned items:', JSON.stringify(await g.evaluate(() => window.GearApp.gs.scanned.map((i) => [i.gear, i.set, i.enhance, i.main.type, i.main.value, i.subs.map((s) => s.type + ' ' + s.value).join(', ')]))));
  console.log('in sorter table:', await g.$$eval('#gs-rows tr', (r) => r.filter((x) => x.textContent.includes('screen')).length), 'rows with screen badge');
  await g.waitForTimeout(300);
  console.log('overlay draws:', (await ov.textContent('#layers')).replace(/\s+/g, ' ').slice(0, 200));
  await ov.screenshot({ path: SP + '/v10-overlay.png' });
  await g.screenshot({ path: SP + '/v10-gear-scan.png' });
  // live page + home
  console.log('live screens:', (await l.textContent('#live-screens')).replace(/\s+/g, ' '));
  await l.screenshot({ path: SP + '/v10-live.png', fullPage: true });
  const h = await ctx.newPage(); watch(h); await h.goto(B + 'index.html');
  console.log('home live card:', await h.textContent('#st-live'));
  const m = await ctx.newPage(); await m.setViewportSize({ width: 390, height: 844 });
  for (const f of ['live.html', 'gear.html']) { await m.goto(B + f); console.log('mobile', f, 'hscroll', await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)); }
  console.log('errors:', errs);
  await b.close();
})();
