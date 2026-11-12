// Packaged desktop app: the game watcher (hidden vision.html window).
//  1st launch: Gear page "Start the game watcher" -> window picker -> the hidden watcher captures the fake game window,
//              the Gear page sees the status; the watcher window stays hidden.
//  2nd launch (same settings): the watcher starts by itself, no picker.
const { _electron, chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
(async () => {
  const game = await chromium.launch({ headless: false, args: ['--window-size=900,560', '--window-position=200,150'] });
  const gp = await game.newPage();
  await gp.setContent('<title>Epic Seven</title><body style="margin:0;background:#c9a24a;font:60px sans-serif">GAME WINDOW</body>');
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'e7ud-'));
  const errs = [];
  const launch = async () => {
    const app = await _electron.launch({ executablePath: process.argv[2], args: ['--no-sandbox', `--user-data-dir=${userData}`] });
    await new Promise((r) => setTimeout(r, 3000));
    for (const w of app.windows()) w.on('pageerror', (e) => errs.push(w.url().split('/').pop() + ': ' + e.message));
    return app;
  };
  const windows = (app) => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => [w.webContents.getURL().replace(/.*\//, ''), w.isVisible()]));

  let app = await launch();
  console.log('1st launch windows [page, visible]:', JSON.stringify(await windows(app)));
  const main = app.windows().find((w) => w.url().endsWith('index.html'));
  await main.goto('e7://app/gear.html');
  await main.waitForTimeout(1500);
  console.log('gear page before:', await main.textContent('#gs-scan-info'));
  const pickerP = app.waitForEvent('window', (w) => w.url().includes('picker.html'));
  main.on('dialog', (d) => d.dismiss()); // the "Set boxes" step that follows needs an item on screen; skip it here
  await main.click('#gs-scan');
  const picker = await pickerP;
  await picker.waitForSelector('#windows button.src');
  const cards = await picker.$$eval('#windows button.src', (bs) => bs.map((b) => b.textContent));
  await (await picker.$$('#windows button.src'))[cards.findIndex((t) => /Epic Seven/.test(t))].click();
  await main.waitForTimeout(4000);
  console.log('gear page after:', await main.textContent('#gs-scan-info'));
  console.log('button:', await main.textContent('#gs-scan'));
  const vision = app.windows().find((w) => w.url().includes('vision.html'));
  console.log('watcher page status:', await vision.textContent('#vw-status'));
  console.log('windows now:', JSON.stringify(await windows(app)));
  await app.close();

  app = await launch();
  await new Promise((r) => setTimeout(r, 3000));
  const v2 = app.windows().find((w) => w.url().includes('vision.html'));
  let pickerShown = app.windows().some((w) => w.url().includes('picker'));
  console.log('2nd launch: watcher', await v2.textContent('#vw-status'), '| picker shown:', pickerShown);
  await app.close();
  await game.close();
  console.log('errors:', errs);
})();
