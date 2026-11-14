// Desktop app: the update check runs by itself right after start, and the menu says when it ran and what it found
// (DEVLOG #48, "make the check for update happen on startup").
//   bash tests/desktop/withwm.sh tests/desktop/update-check.js <packaged app>
// (The Linux test build has no newer release to find; what is tested is that the check ran without anyone asking and
// that the menu line changed from "checking at start…" to "Last check <time>: …".)
const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'e7ud-'));
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ capture: { mode: 'screen', id: 'screen:0:0', name: 'Screen 1' } }));
  const app = await _electron.launch({ executablePath: process.argv[2], args: ['--no-sandbox', `--user-data-dir=${userData}`] });
  const line = () => app.evaluate(({ Menu }) => {
    const m = Menu.getApplicationMenu();
    const items = m ? m.items[0].submenu.items.map((i) => i.label) : [];
    const k = items.findIndex((l) => /^Check for updates/.test(l));
    return k >= 0 ? items[k + 1] : '(no menu yet)';
  });
  await new Promise((r) => setTimeout(r, 1500));
  console.log('menu line right after start:', await line());
  let last = '';
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    last = await line();
    if (/^Last check/.test(last)) break;
  }
  console.log('menu line after the check at start:', last.replace(/\d\d:\d\d(\s?[AP]M)?/, '<time>'));
  await app.close();
  console.log('errors:', /^Last check/.test(last) ? [] : ['the check at start did not report']);
})().catch((e) => { console.error(e); process.exit(1); });
