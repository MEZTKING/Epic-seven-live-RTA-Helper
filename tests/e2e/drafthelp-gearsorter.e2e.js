// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// Serves the repo on http://localhost:8766 (override with E7_BASE). Screenshots -> tests/e2e/out/ (E7_OUT).
const __path = require('path');
const __fs = require('fs');
const OUT = process.env.E7_OUT || __path.join(__dirname, 'out');
__fs.mkdirSync(OUT, { recursive: true });
const FX = __path.join(__dirname, 'fixtures');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const { chromium } = require('playwright');
const fs = require('fs');
const SP = OUT;
const W = 1600, H = 900, S = 0.07;
const LAY = { mePreban: [[0.05, 0.05], [0.13, 0.05]], oppPreban: [[0.80, 0.05], [0.88, 0.05]], mePick: [0.06, 0.2], oppPick: [0.87, 0.2], step: 0.14, help: [[0.36, 0.78], [0.56, 0.78]] };
const scene = { mePreban: ['Belian', 'Luna'], oppPreban: ['Krau', 'Aria'], mePick: [], oppPick: ['Landy'], help: ['Lilias', 'Ravi', 'Destina'] };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  const p = await ctx.newPage();
  const errs = [];
  const watch = (pg) => { pg.on('pageerror', (e) => errs.push('pageerror ' + e.message)); pg.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text()) && errs.push(m.text())); };
  watch(p);
  const answers = [];
  p.on('dialog', (d) => { const a = answers.shift(); a === undefined ? d.accept() : d.accept(a); });
  await p.goto(BASE + 'rta.html');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  const txt = async (pg, sel) => (await pg.textContent(sel)).replace(/\s+/g, ' ').trim();

  // ---------- game drafting help
  const png = await p.evaluate(async ({ W, H, S, LAY, scene }) => {
    const heroes = window.RTAApp.cache.heroes;
    const code = (n) => heroes.find((h) => h.name === n).code;
    const load = (c) => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = window.RTARoster.PORTRAIT_URL(c); });
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.fillStyle = '#1b2333'; g.fillRect(0, 0, W, H);
    const s = S * W;
    const draw = async (name, fx, fy, size = s) => { const img = await load(code(name)); const x = fx * W, y = fy * H; g.fillStyle = '#c9a24a'; g.fillRect(x - 3, y - 3, size + 6, size + 6); const z = 0.1 * img.naturalWidth; g.drawImage(img, z, z, img.naturalWidth - 2 * z, img.naturalHeight - 2 * z, x, y, size, size); };
    for (let i = 0; i < 2; i++) { await draw(scene.mePreban[i], ...LAY.mePreban[i]); await draw(scene.oppPreban[i], ...LAY.oppPreban[i]); }
    for (let i = 0; i < 5; i++) { g.fillStyle = '#2a2f3d'; g.fillRect(LAY.mePick[0] * W, (LAY.mePick[1] + i * LAY.step) * H, s, s); if (scene.oppPick[i]) await draw(scene.oppPick[i], LAY.oppPick[0], LAY.oppPick[1] + i * LAY.step); else { g.fillStyle = '#2a2f3d'; g.fillRect(LAY.oppPick[0] * W, (LAY.oppPick[1] + i * LAY.step) * H, s, s); } }
    for (let i = 0; i < 3; i++) await draw(scene.help[i], LAY.help[0][0] + i * 0.1, LAY.help[0][1], 80);
    return cv.toDataURL('image/jpeg', 0.8);
  }, { W, H, S, LAY, scene });
  fs.writeFileSync(SP + '/v5-help.jpg', Buffer.from(png.split(',')[1], 'base64'));
  await p.click('.tab[data-tab=auto]');
  await p.setInputFiles('#auto-shot', SP + '/v5-help.jpg');
  // 16:9 pictures use the built-in Steam layout now (nothing pops open); this made-up screen needs its own boxes
  await p.waitForTimeout(300);
  if (await p.$eval('#calib', (e) => e.classList.contains('hidden'))) await p.click('#auto-calibrate');
  await p.waitForSelector('#calib:not(.hidden)');
  const sh = (S * W) / H;
  const box = async (fx, fy, fw, fh) => { const r = await p.locator('#calib-canvas').boundingBox(); await p.mouse.move(r.x + fx * r.width, r.y + fy * r.height); await p.mouse.down(); await p.mouse.move(r.x + (fx + fw) * r.width, r.y + (fy + fh) * r.height, { steps: 4 }); await p.mouse.up(); };
  for (const [fx, fy] of [...LAY.mePreban, ...LAY.oppPreban]) await box(fx, fy, S, sh);
  await box(LAY.mePick[0], LAY.mePick[1], S, sh); await box(LAY.mePick[0], LAY.mePick[1] + 4 * LAY.step, S, sh);
  await box(LAY.oppPick[0], LAY.oppPick[1], S, sh); await box(LAY.oppPick[0], LAY.oppPick[1] + 4 * LAY.step, S, sh);
  await p.click('#calib-skip'); // no name box
  await p.click('#calib-done');
  answers.push('3');
  await p.click('#auto-calib-help');
  await box(0.36, 0.78, 80 / W, 80 / H); await box(0.56, 0.78, 80 / W, 80 / H);
  await p.click('#calib-done');
  await p.waitForFunction(() => { const o = window.RTAAuto._officialLoad; return o.total && o.done === o.total; }, null, { timeout: 120000 });
  for (let i = 0; i < 4; i++) await p.evaluate(() => window.RTAAuto.tick());
  console.log('help slots:', (await p.$$eval('#auto-slots .aslot.help', (els) => els.map((e) => e.innerText.replace(/\n/g, ' ')))).join(' | '));
  console.log('gameHelp stored:', JSON.stringify(await p.evaluate(() => window.RTAApp.store.gameHelp.map((e) => [e.phase, e.player, e.recs.map(window.RTAApp.nameOf), e.board.oppPicks.map(window.RTAApp.nameOf)]))));
  await p.click('.tab[data-tab=draft]');
  console.log('status:', await txt(p, '#draft-status'));
  console.log('suggestions:', (await txt(p, '#suggest-list')).slice(0, 330));
  await p.screenshot({ path: SP + '/v5-draft-help.png' });
  await p.click('.tab[data-tab=teams]');
  console.log('gh db:', await txt(p, '#gh-out'));
  await p.fill('#gh-hero', 'Landy');
  console.log('gh vs Landy:', await txt(p, '#gh-out'));
  await p.click('.tab[data-tab=data]');
  console.log('gh src:', await txt(p, '#src-game-help'));

  // ---------- gear sorter
  const g = await ctx.newPage(); watch(g);
  g.on('dialog', (d) => d.accept());
  await g.goto(BASE + 'gear.html');
  await g.setInputFiles('#gs-file', FX + '/gear3.txt');
  await g.waitForTimeout(500);
  console.log('gear src:', await txt(g, '#gs-src'));
  console.log('summary:', await txt(g, '#gs-summary'));
  console.log('first rows:', (await txt(g, '#gs-rows')).slice(0, 400));
  await g.screenshot({ path: SP + '/v5-gear.png', fullPage: false });
  await g.fill('#f-hero', 'Arbiter Vildred'); await g.waitForTimeout(200);
  console.log('for AV:', (await txt(g, '#gs-count')), (await txt(g, '#gs-rows')).slice(0, 250));
  await g.fill('#f-hero', '');
  await g.fill('#hp-hero', 'Belian'); await g.waitForTimeout(200);
  console.log('profile Belian:', (await txt(g, '#hp-out')).slice(0, 250));
  await g.selectOption('#b-gear', 'Boots'); await g.selectOption('#b-main', 'Speed');
  await g.selectOption('[data-sub="1"]', 'CriticalHitChancePercent'); await g.fill('[data-subv="1"]', '12');
  await g.selectOption('[data-sub="2"]', 'AttackPercent'); await g.fill('[data-subv="2"]', '14');
  await g.selectOption('[data-sub="3"]', 'CriticalHitDamagePercent'); await g.fill('[data-subv="3"]', '14');
  await g.fill('#b-enh', '15');
  await g.click('#b-check');
  console.log('shop:', await txt(g, '#b-out'));
  // main app picked up roster + speeds from the gear page import
  await p.reload();
  console.log('main app builds after gear-page import:', await p.evaluate(() => window.RTAApp.cache.builds.size), 'owned:', await p.evaluate(() => window.RTAApp.cache.owned.size));
  const m = await ctx.newPage(); watch(m);
  await m.setViewportSize({ width: 390, height: 844 });
  await m.goto(BASE + 'gear.html');
  console.log('gear mobile hscroll:', await m.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  console.log('errors:', errs);
  await b.close();
})();
