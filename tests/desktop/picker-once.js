// Packaged desktop app (DEVLOG #87): "Which window is the game?" does not keep opening after it was closed.
// The saved game window isn't there: the watcher asks once; closed without a choice -> it doesn't open by itself
// again (watcher restarts, Start buttons, the RTA page); the page says what to do; asked for (menu / "pick the game
// window" button) it still opens.
const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'e7ud-'));
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ capture: { mode: 'window', id: 'none', name: 'Epic Seven (not running)' } }));
  const app = await _electron.launch({ executablePath: process.argv[2], args: ['--no-sandbox', `--user-data-dir=${userData}`] });
  const errs = [];
  let pickers = 0;
  const seen = [];
  app.on('window', async (w) => {
    if (!w.url().includes('picker')) return;
    pickers++;
    seen.push(w);
  });
  // the first one may already be open before the listener: count those too
  await new Promise((r) => setTimeout(r, 4000));
  for (const w of app.windows()) if (w.url().includes('picker') && !seen.includes(w)) (pickers++, seen.push(w));
  console.log('pickers opened by themselves at start:', pickers);
  for (const w of seen) await w.click('#cancel').catch(() => {});
  const main = app.windows().find((w) => w.url().endsWith('index.html'));
  main.on('pageerror', (e) => errs.push(e.message));
  main.on('dialog', (d) => d.accept());
  await main.goto('e7://app/rta.html');
  await main.waitForTimeout(4000);
  await main.goto('e7://app/gear.html');
  await main.click('#gs-scan');
  await main.waitForTimeout(2500);
  console.log('after closing it: RTA page open + Start on the Gear page -> pickers opened:', pickers, '· message:', (await main.textContent('#gs-scan-status')).trim());
  const p = app.waitForEvent('window', (w) => w.url().includes('picker'));
  main.evaluate(() => window.E7Desktop.pickWindow());
  const asked = await p.catch(() => null);
  console.log('asked for from the menu / button: opens:', !!asked);
  if (asked) await asked.click('#cancel').catch(() => {});
  console.log('errors:', errs);
  await app.close();
})();
