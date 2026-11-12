// Packaged desktop app: main-window zoom vs overlay zoom are independent (zoom is per origin in Chromium,
// so the overlay must scale its own items). Prints the zoom both windows end up with and the overlay item scale.
const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'e7ud-'));
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ zoom: 1.5, overlayZoom: 1.0 }));
  const app = await _electron.launch({ executablePath: process.argv[2], args: ['--no-sandbox', `--user-data-dir=${userData}`] });
  await new Promise((r) => setTimeout(r, 3000));
  const z = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => [w.webContents.getURL().replace(/.*\//, ''), w.webContents.getZoomFactor()]));
  console.log('zoom per window:', JSON.stringify(z));
  const ov = app.windows().find((w) => w.url().includes('overlay'));
  await ov.evaluate(() => window.E7OverlayView.layers.t = [{ x: 0.2, y: 0.2, w: 0.1, h: 0.1, kind: 'card', title: 'x', lines: ['y'] }]);
  await ov.evaluate(() => window.E7OverlayView.draw());
  const t = await ov.$eval('.ov-card', (el) => el.style.transform);
  console.log('overlay card transform:', t, '(expected scale(0.666…) = 1.0 / 1.5)');
  await app.close();
})();
