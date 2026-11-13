// Desktop app (DEVLOG #35): "the overlay still does not work".
// 1) Screen mode: the overlay is shown, its "✓ overlay" badge appears, E7Desktop.overlayStatus() and the report say so.
// 2) Window mode as on Windows (E7_TEST_WIN=1): the window tracker (PowerShell) can't run here, exactly like when
//    antivirus blocks it. Before this fix the overlay then stayed hidden forever; now it falls back to the game's display,
//    and the Live page / report / Overlay status say why.
// Run: bash tests/desktop/withwm.sh tests/desktop/overlay-status.js <electron binary> [app dir]
const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const exe = process.argv[2];
const appDir = process.argv[3]; // when running from source: the desktop/ folder
async function launch(config, env = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'e7ud-'));
  if (config) fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify(config));
  const args = [...(appDir ? [appDir] : []), '--no-sandbox', `--user-data-dir=${userData}`];
  return _electron.launch({ executablePath: exe, args, env: { ...process.env, ...env } });
}
const ovWin = (app) => app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('overlay'));
  return { visible: w.isVisible(), bounds: w.getBounds() };
});
const mainPage = (app) => app.windows().find((w) => /index\.html|live\.html/.test(w.url()));
(async () => {
  const errs = [];
  // 1) screen mode
  let app = await launch({ capture: { mode: 'screen', id: 'screen:0:0', name: 'Screen 1' } });
  await new Promise((r) => setTimeout(r, 3000));
  let ov = app.windows().find((w) => w.url().includes('overlay'));
  ov.on('pageerror', (e) => errs.push('overlay: ' + e.message));
  console.log('screen mode · overlay window:', JSON.stringify(await ovWin(app)));
  console.log('screen mode · badge:', await ov.evaluate(() => (document.querySelector('.ov-badge.on') || {}).textContent || 'none'));
  let mp = mainPage(app);
  mp.on('pageerror', (e) => errs.push('main: ' + e.message));
  await mp.goto(mp.url().replace(/[^/]*$/, 'live.html'));
  await mp.waitForTimeout(800);
  console.log('screen mode · Live page:', await mp.$eval('#live-ovstatus', (e) => e.textContent));
  await app.close();

  // 2) window mode on "Windows", tracker can't run
  app = await launch({ capture: { mode: 'window', id: 'window:4242:0', name: 'Epic Seven' } }, { E7_TEST_WIN: '1' });
  await new Promise((r) => setTimeout(r, 1500));
  ov = app.windows().find((w) => w.url().includes('overlay'));
  ov.on('pageerror', (e) => errs.push('overlay: ' + e.message));
  console.log('window mode · before tracking:', JSON.stringify(await ovWin(app)));
  await app.evaluate(() => global.__e7test.trackGame('window:4242:0'));
  await new Promise((r) => setTimeout(r, 1500));
  const st = await app.evaluate(() => global.__e7test.overlayStatusText());
  console.log('window mode · after the tracker failed:', JSON.stringify(await ovWin(app)));
  console.log('window mode · Overlay status text:\n  ' + st.replace(/\n/g, '\n  '));
  console.log('window mode · badge:', await ov.evaluate(() => (document.querySelector('.ov-badge.on') || {}).textContent || 'none'));
  mp = mainPage(app);
  mp.on('pageerror', (e) => errs.push('main: ' + e.message));
  await mp.goto(mp.url().replace(/[^/]*$/, 'live.html'));
  await mp.waitForTimeout(800);
  console.log('window mode · Live page:', await mp.$eval('#live-ovstatus', (e) => e.textContent));
  const rep = await mp.evaluate(() => window.E7Diag.report());
  console.log('window mode · report line:', (rep.split('\n').find((l) => l.startsWith('overlay:')) || 'missing'));
  // the test card reaches the visible overlay
  await mp.click('#live-test');
  await ov.waitForTimeout(400);
  console.log('test card:', await ov.evaluate(() => (document.querySelector('.ov-card') || {}).textContent || 'none'));
  await app.close();
  console.log('errors:', errs);
})().catch((e) => { console.error(e); process.exit(1); });
