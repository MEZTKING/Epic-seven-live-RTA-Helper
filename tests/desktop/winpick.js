// Packaged desktop app: window picker -> getDisplayMedia captures only the chosen window; no game-area box; pop-outs work.
require("fs").mkdirSync(require("path").join(__dirname, "out"), { recursive: true });
const { _electron, chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
(async () => {
  const OUT = process.argv[3] || require('path').join(__dirname, 'out');
  // a fake "game" window from another program (a headed Chromium) titled like the Steam client
  const game = await chromium.launch({ headless: false, args: ['--window-size=900,560', '--window-position=200,150'] });
  const gp = await game.newPage();
  await gp.setContent('<title>Epic Seven</title><body style="margin:0;background:#c9a24a;font:60px sans-serif">GAME WINDOW</body>');
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'e7ud-'));
  const app = await _electron.launch({ executablePath: process.argv[2], args: ['--no-sandbox', `--user-data-dir=${userData}`] });
  const errs = [];
  await new Promise((r) => setTimeout(r, 2500));
  const main = app.windows().find((w) => w.url().endsWith('index.html'));
  main.on('pageerror', (e) => errs.push(e.message));
  main.on('dialog', (d) => d.accept());
  await main.goto('e7://app/gear.html');
  console.log('capture before:', JSON.stringify(await main.evaluate(() => window.E7Desktop.capture())));
  // a reader asks for the screen -> the picker opens (first time)
  const pickerP = app.waitForEvent('window', (w) => w.url().includes('picker.html'));
  const capP = main.evaluate(async () => {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const v = document.createElement('video');
    v.muted = true;
    v.srcObject = s;
    await v.play();
    await new Promise((r) => setTimeout(r, 800));
    const src = await window.GameArea.wrap(v); // window mode: must be the video itself, no box dialog
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 36;
    c.getContext('2d').drawImage(v, 0, 0, 64, 36);
    const px = c.getContext('2d').getImageData(32, 18, 1, 1).data;
    const out = { label: s.getVideoTracks()[0].label, size: [v.videoWidth, v.videoHeight], wrappedIsVideo: src === v, centrePixel: [px[0], px[1], px[2]], boxDialogOpen: !!document.querySelector('dialog[open]') };
    s.getTracks().forEach((t) => t.stop());
    return out;
  });
  const picker = await pickerP;
  await picker.waitForSelector('button.src');
  const cards = await picker.$$eval('#windows button.src', (bs) => bs.map((b) => b.textContent));
  console.log('picker windows:', JSON.stringify(cards));
  await picker.screenshot({ path: OUT + '/picker.png' });
  const idx = cards.findIndex((t) => /Epic Seven/.test(t));
  await (await picker.$$('#windows button.src'))[idx].click();
  const cap = await capP;
  console.log('captured:', JSON.stringify(cap), '(gold ≈ [201,162,74])');
  console.log('capture after:', JSON.stringify(await main.evaluate(() => window.E7Desktop.capture())));
  const cfg = JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8'));
  console.log('saved:', JSON.stringify(cfg.capture));
  // live page status line + overlay sees window mode
  await main.goto('e7://app/live.html');
  console.log('live:', await main.textContent('#live-area'));
  const ov = app.windows().find((w) => w.url().includes('overlay'));
  console.log('overlay window mode:', await ov.evaluate(() => window.E7Desktop.capture().mode));
  // second capture: no picker this time
  let picked = false;
  app.on('window', (w) => w.url().includes('picker') && (picked = true));
  const again = await main.evaluate(async () => {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const l = s.getVideoTracks()[0].label;
    s.getTracks().forEach((t) => t.stop());
    return l;
  });
  console.log('second capture:', again, 'picker shown again:', picked);
  console.log('errors:', errs);
  await app.close();
  await game.close();
})();
