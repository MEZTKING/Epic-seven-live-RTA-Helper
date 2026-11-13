// Packaged desktop app: the overlay shows its "✓ Epic 7 Engine overlay" badge when it starts, and the
// Overlay menu's "Show a test card" puts a card on the real overlay window.
const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'e7ud-'));
  const app = await _electron.launch({ executablePath: process.argv[2], args: ['--no-sandbox', `--user-data-dir=${userData}`] });
  const errs = [];
  await new Promise((r) => setTimeout(r, 2500));
  const ov = app.windows().find((w) => w.url().includes('overlay'));
  ov.on('pageerror', (e) => errs.push(e.message));
  console.log('badge at start:', await ov.evaluate(() => (document.querySelector('.ov-badge.on') || {}).textContent || 'none'));
  // what the menu item does
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('overlay'));
    w.webContents.send('e7:hotkey', 'overlay-test');
  });
  await ov.waitForTimeout(500);
  console.log('test card on the overlay window:', await ov.evaluate(() => (document.querySelector('.ov-card') || {}).textContent || 'none'));
  console.log('overlay window visible:', await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('overlay')).isVisible()));
  await app.close();
  console.log('errors:', errs);
})();
