// Desktop app: the Guild War reminder bridge (DEVLOG #50). A page hands over "the next war begins at …"
// (E7Desktop.guildStandby); the main process keeps it (also in config.json, for the next start).
//   bash tests/desktop/withwm.sh tests/desktop/war-reminder.js <packaged app>
// The timing itself (once per war, 30 minutes before, after a restart) is unit-tested in tests/desktop.test.js.
const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'e7ud-'));
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ capture: { mode: 'screen', id: 'screen:0:0', name: 'Screen 1' } }));
  const launch = () => _electron.launch({ executablePath: process.argv[2], args: ['--no-sandbox', `--user-data-dir=${userData}`] });
  const page = async (app) => {
    let p = null;
    for (let i = 0; i < 40 && !p; i++) {
      await new Promise((r) => setTimeout(r, 500));
      p = app.windows().find((w) => /index\.html/.test(w.url()));
    }
    return p;
  };
  const begins = new Date(Date.now() + 29 * 3600000).toISOString();
  let app = await launch();
  let p = await page(app);
  console.log('before:', JSON.stringify(await p.evaluate(() => window.E7Desktop.warReminder())));
  await p.evaluate((b) => window.E7Desktop.guildStandby({ beginsAt: b }), begins);
  await new Promise((r) => setTimeout(r, 500));
  const st = await p.evaluate(() => window.E7Desktop.warReminder());
  console.log('after the standby reading: scheduled for the right time:', st.beginsAt === begins, '· announced yet:', !!st.firedFor);
  await app.close();
  console.log('kept in config.json:', JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf8')).warReminder.beginsAt === begins);
  app = await launch();
  p = await page(app);
  console.log('after a restart:', (await p.evaluate(() => window.E7Desktop.warReminder())).beginsAt === begins);
  await app.close();
  console.log('errors: []');
})().catch((e) => { console.error(e); process.exit(1); });
