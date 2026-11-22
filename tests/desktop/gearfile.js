// Packaged desktop app (DEVLOG #94): your gear file re-imported by itself.
// The chosen file (here a copy of tests/e2e/fixtures/gear-codes.txt) is imported by the game watcher at start; the Gear
// page shows it; when the file changes (fewer items, and without design codes, like the Fribbels optimizer's own
// autosave) it is imported again by itself, the design codes are kept from the last import, the open Gear page follows.
const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'e7ud-'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e7gf-'));
  const file = path.join(dir, 'gear.txt');
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'e2e', 'fixtures', 'gear-codes.txt'), 'utf8'));
  fs.writeFileSync(file, JSON.stringify(data));
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ gearFile: file }));
  const app = await _electron.launch({ executablePath: process.argv[2], args: ['--no-sandbox', `--user-data-dir=${userData}`] });
  const errs = [];
  await new Promise((r) => setTimeout(r, 6000));
  const main = app.windows().find((w) => w.url().endsWith('index.html'));
  main.on('pageerror', (e) => errs.push(e.message));
  await main.goto('e7://app/gear.html');
  await main.waitForTimeout(1500);
  const state = () => main.evaluate(() => ({ items: window.GearApp.gs.items.length, codes: window.GearApp.gs.items.filter((x) => x.design).length, file: window.GearApp.gs.fileName, shown: document.querySelector('#gf-state').textContent.replace(/[^ ]*e7gf-[^ ]*/, '<file>') }));
  console.log('at start:', JSON.stringify(await state()));
  // a new version: 30 items, no design codes (as the optimizer's autosave writes them)
  const v2 = { ...data, items: data.items.slice(0, 30).map(({ code, ...it }) => it) };
  fs.writeFileSync(file, JSON.stringify(v2));
  await main.waitForTimeout(9000);
  console.log('after the file changed:', JSON.stringify(await state()));
  // stop: no more re-imports
  await main.click('#gf-stop');
  await main.waitForTimeout(500);
  fs.writeFileSync(file, JSON.stringify({ ...data, items: data.items.slice(0, 10) }));
  await main.waitForTimeout(8000);
  console.log('after Stop and another change:', JSON.stringify(await state()));
  console.log('errors:', errs);
  await app.close();
})();
