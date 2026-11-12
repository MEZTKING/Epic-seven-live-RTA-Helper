// Packaged desktop app: Developer → Collect screenshots automatically.
// The watcher starts by itself on the (fake) game window and saves PNG + JSON notes when the scene changes.
const { _electron, chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
(async () => {
  const game = await chromium.launch({ headless: false, args: ['--window-size=900,560', '--window-position=200,150'] });
  const gp = await game.newPage();
  await gp.setContent('<title>Epic Seven</title><body style="margin:0;background:#c9a24a;font:60px sans-serif">LOBBY</body>');
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'e7ud-'));
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ devCapture: true, capture: { mode: 'window', id: 'none', name: 'Epic Seven - Google Chrome for Testing' } }));
  const app = await _electron.launch({ executablePath: process.argv[2], args: ['--no-sandbox', `--user-data-dir=${userData}`] });
  const errs = [];
  await new Promise((r) => setTimeout(r, 6000));
  const vision = app.windows().find((w) => w.url().includes('vision.html'));
  vision.on('pageerror', (e) => errs.push(e.message));
  const dev = await vision.evaluate(() => window.E7Desktop.dev());
  console.log('dev tool:', JSON.stringify({ on: dev.on, count: dev.count }));
  // change the scene twice (different colours/text), give the watcher time to see it hold still
  await gp.setContent('<title>Epic Seven</title><body style="margin:0;background:#3a1b6b;color:#fff;font:60px sans-serif">DRAFT</body>');
  await new Promise((r) => setTimeout(r, 4000));
  await gp.setContent('<title>Epic Seven</title><body style="margin:0;background:#0b6b3a;color:#fff;font:60px sans-serif">BATTLE</body>');
  await new Promise((r) => setTimeout(r, 4000));
  const files = fs.existsSync(dev.folder) ? fs.readdirSync(dev.folder).sort() : [];
  console.log('saved files:', files.length, JSON.stringify(files.slice(0, 8)));
  const metaFile = files.find((f) => f.endsWith('.json'));
  if (metaFile) console.log('notes:', JSON.stringify(JSON.parse(fs.readFileSync(path.join(dev.folder, metaFile), 'utf8'))).slice(0, 300));
  await app.close();
  await game.close();
  fs.rmSync(path.dirname(dev.folder), { recursive: true, force: true });
  console.log('errors:', errs);
})();
