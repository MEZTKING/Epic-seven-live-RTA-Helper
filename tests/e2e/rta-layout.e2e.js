// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: tesseract.js)
// Built-in layout (js/layouts.js): with NO boxes drawn, a 16:9 game picture is ready to read; the status table says
// what is built-in / yours / not set; the built-in result box reads VICTORY on the REAL Steam screenshot;
// "Use built-in" forgets your own boxes for a part.
const __path = require('path');
const __fs = require('fs');
const OUT = process.env.E7_OUT || __path.join(__dirname, 'out');
__fs.mkdirSync(OUT, { recursive: true });
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
  const table = () => p.$$eval('#auto-layout tr', (rows) => rows.map((r) => [r.cells[0].textContent, r.cells[1].textContent.trim()]));
  console.log('before any picture:', (await p.textContent('#auto-layout-head')).slice(0, 90));
  // a real 16:9 game picture, nothing drawn
  await p.setInputFiles('#auto-shot', __path.join(FX, 'steam-rta-victory.png'));
  await p.waitForTimeout(800);
  console.log('head:', (await p.textContent('#auto-layout-head')).slice(0, 90));
  console.log('status line:', (await p.textContent('#auto-status')).slice(0, 90));
  console.log('calibration popped open:', await p.evaluate(() => !document.querySelector('#calib').classList.contains('hidden')));
  console.log('table:', JSON.stringify(await table()));
  // built-in result box on the real screenshot -> OCR
  const ocr = await p.evaluate(async () => {
    const r = window.E7Layouts.layoutFor(1343, 758).regions.result;
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.src = 'tests/fixtures/screens/steam-rta-victory.png'; });
    const cv = document.createElement('canvas');
    const W = img.naturalWidth, H = img.naturalHeight, scale = Math.max(1, 64 / (r.h * H));
    cv.width = Math.round(r.w * W * scale); cv.height = Math.round(r.h * H * scale);
    const cx = cv.getContext('2d'); cx.filter = 'grayscale(1) contrast(1.6)';
    cx.drawImage(img, r.x * W, r.y * H, r.w * W, r.h * H, 0, 0, cv.width, cv.height);
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const w = await Tesseract.createWorker('eng');
    return (await w.recognize(cv)).data.text.trim();
  });
  console.log('built-in result box reads:', JSON.stringify(ocr));
  // Check shows the boxes (alignment check) on the picture
  await p.click('[data-lay-check=draft]');
  await p.waitForTimeout(300);
  console.log('check:', (await p.textContent('#calib-title')) + ' / ' + (await p.textContent('#calib-step')).slice(0, 50));
  await p.screenshot({ path: OUT + '/rta-layout-check.png', fullPage: false });
  await p.click('#calib-cancel');
  // your own box for the result -> "Yours"; Use built-in -> back to built-in
  await p.evaluate(() => { window.RTAApp.store.auto.regions = { result: { x: 0.3, y: 0.3, w: 0.3, h: 0.1 } }; window.RTAApp.save(); window.RTAAuto.render(); });
  console.log('result after drawing my own:', JSON.stringify((await table()).find((r) => r[0].startsWith('Victory'))));
  await p.click('[data-lay-reset=result]');
  console.log('after Use built-in:', JSON.stringify((await table()).find((r) => r[0].startsWith('Victory'))), 'own boxes left:', await p.evaluate(() => Object.keys(window.RTAApp.store.auto.regions).length));
  // built-in screen signature: the real pre-ban picker is recognised WITHOUT teaching; draft slots are not read there
  // the reader waits until all hero portraits are loaded before it looks at anything
  await p.waitForFunction(() => window.RTAAuto._officialLoad.total > 0 && window.RTAAuto._officialLoad.done >= window.RTAAuto._officialLoad.total, null, { timeout: 120000 });
  await p.setInputFiles('#auto-shot', __path.join(FX, 'steam-rta-preban-select.png'));
  await p.waitForTimeout(400);
  for (let i = 0; i < 4; i++) await p.evaluate(() => window.RTAAuto.tick());
  const picker = await p.evaluate(() => ({ screen: window.E7Screens.current(), taught: window.E7Screens.refs().length, builtIn: window.E7Screens.builtIn().length, confirmed: [...window.RTAAuto._track.values()].filter((t) => t.confirmed).length, read: [...window.RTAAuto._track.values()].filter((t) => t.result).length }));
  console.log('pre-ban picker file:', JSON.stringify(picker), '(expect screen rta-preban-pick, taught 0, confirmed 0; raw guesses from the first frame before the screen is settled are fine)');
  // and the Victory screen is not mistaken for the picker
  await p.setInputFiles('#auto-shot', __path.join(FX, 'steam-rta-victory.png'));
  await p.waitForTimeout(400);
  for (let i = 0; i < 4; i++) await p.evaluate(() => window.RTAAuto.tick());
  console.log('victory file screen:', JSON.stringify(await p.evaluate(() => window.E7Screens.current())), '(expect not rta-preban-pick)');
  console.log('errors:', errs);
  await b.close();
})();
