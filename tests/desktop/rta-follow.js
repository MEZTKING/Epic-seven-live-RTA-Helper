// Packaged desktop app: the RTA reader follows the game watcher (DEVLOG #28).
// The watcher starts on the (fake) game window by itself; opening RTA starts reading without any click or picker;
// stopping the watcher stops the RTA reader; Stop on the RTA page keeps it stopped.
const { _electron, chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
(async () => {
  const game = await chromium.launch({ headless: false, args: ['--window-size=900,560', '--window-position=200,150'] });
  const gp = await game.newPage();
  await gp.setContent('<title>Epic Seven</title><body style="margin:0;background:#20253a;color:#fff;font:60px sans-serif">DRAFT</body>');
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'e7ud-'));
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ capture: { mode: 'window', id: 'none', name: 'Epic Seven - Google Chrome for Testing' } }));
  const app = await _electron.launch({ executablePath: process.argv[2], args: ['--no-sandbox', `--user-data-dir=${userData}`] });
  const errs = [];
  await new Promise((r) => setTimeout(r, 3000));
  const main = app.windows().find((w) => w.url().endsWith('index.html'));
  main.on('pageerror', (e) => errs.push(e.message));
  let pickerShown = false;
  app.on('window', (w) => w.url().includes('picker') && (pickerShown = true));
  await main.goto('e7://app/rta.html');
  await main.click('.tab[data-tab=auto]');
  await main.waitForTimeout(6000);
  const st = () => main.evaluate(() => ({ reading: window.RTAAuto.isWatching(), status: document.querySelector('#auto-status').textContent.slice(0, 110), size: (() => { const v = document.querySelector('#auto-video'); return v && v.videoWidth ? [v.videoWidth, v.videoHeight] : null; })() }));
  console.log('after opening RTA (no click):', JSON.stringify(await st()), '| picker shown:', pickerShown);
  await main.evaluate(() => window.VisionClient.stop());
  await main.waitForTimeout(4500);
  console.log('after the watcher stopped:', JSON.stringify(await st()));
  await main.evaluate(() => window.VisionClient.start());
  await main.waitForTimeout(5000);
  console.log('watcher started again:', JSON.stringify(await st()));
  await main.click('#auto-stop');
  await main.waitForTimeout(4000);
  console.log('after pressing Stop on the RTA page:', JSON.stringify(await st()));
  await app.close();
  await game.close();
  console.log('errors:', errs);
})();
