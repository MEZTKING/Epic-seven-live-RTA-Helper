// Packaged desktop app: cancelling "Which window is the game?" leaves the game watcher not watching (no crash),
// and "Open overlay preview" is a normal window (not the small always-on-top mini window).
const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'e7ud-'));
  const app = await _electron.launch({ executablePath: process.argv[2], args: ['--no-sandbox', `--user-data-dir=${userData}`] });
  const errs = [];
  await new Promise((r) => setTimeout(r, 2500));
  const main = app.windows().find((w) => w.url().endsWith('index.html'));
  main.on('pageerror', (e) => errs.push(e.message));
  main.on('dialog', (d) => d.accept());
  await main.goto('e7://app/gear.html');
  const pickerP = app.waitForEvent('window', (w) => w.url().includes('picker.html'));
  await main.click('#gs-scan');
  const picker = await pickerP;
  await picker.click('#cancel');
  await main.waitForTimeout(1500);
  console.log('after cancel, button says:', await main.textContent('#gs-scan'), '| message:', await main.textContent('#gs-scan-status'), '| watcher:', await main.evaluate(() => window.VisionClient.line()));
  await main.goto('e7://app/live.html');
  const p = app.waitForEvent('window');
  await main.click('#live-preview');
  await p;
  await main.waitForTimeout(800);
  const wins = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => [w.webContents.getURL().replace(/.*\//, ''), w.getSize().join('x'), w.isAlwaysOnTop()]));
  console.log('windows:', JSON.stringify(wins));
  console.log('errors:', errs);
  await app.close();
})();
