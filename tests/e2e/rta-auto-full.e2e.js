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
const URL = BASE + 'rta.html';
const W = 1600, H = 900, S = 0.07;
const LAY = { mePreban: [[0.05, 0.05], [0.13, 0.05]], oppPreban: [[0.80, 0.05], [0.88, 0.05]], mePick: [0.06, 0.2], oppPick: [0.87, 0.2], step: 0.14, name: [0.70, 0.93, 0.22, 0.05], result: [0.35, 0.40, 0.30, 0.12] };
const scene = {
  mePreban: ['Belian', 'Luna'], oppPreban: ['Krau', 'Aria'],
  mePick: ['Arbiter Vildred', 'Ruele of Light', 'Lilias', 'Ravi', 'Destina'],
  oppPick: ['Landy', 'Seaside Bellona', 'Tamarinne', 'Ken', 'Basar'],
};
const log = (...a) => console.log(...a);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1500 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text()) && errs.push(m.text()));
  const answers = [];
  p.on('console', (m) => /OCR|ocr|Tesseract/i.test(m.text()) && console.log('CONSOLE', m.type(), m.text().slice(0, 200)));
  p.on('dialog', (d) => { const a = answers.shift(); a === undefined ? d.accept() : d.accept(a); });
  await p.goto(URL);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  const txt = async (sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();

  // ---- data imports
  await p.click('.tab[data-tab=data]');
  await p.setInputFiles('#fribbels-file', FX + '/gear2.txt'); await p.waitForTimeout(200);
  log('builds:', await txt('#src-builds'));
  answers.push('Spring test'); await p.setInputFiles('#meta-file', FX + '/meta.csv'); await p.waitForTimeout(200);
  log('meta:', await txt('#meta-sources'));
  answers.push('ladder'); await p.setInputFiles('#csv-file', FX + '/matches2.csv'); await p.waitForTimeout(200);
  await p.click('#weights-tune'); await p.waitForTimeout(3000);
  log('tune:', await txt('#tune-out'));
  log('weights:', JSON.stringify(await p.evaluate(() => window.RTAApp.store.settings.sourceWeights)));
  await p.screenshot({ path: SP + '/v4-data.png', fullPage: true });

  // ---- heroes: build column + tags
  await p.click('.tab[data-tab=heroes]');
  await p.fill('#db-search', 'Arbiter Vildred');
  log('AV row:', await txt('#db-rows tr'));
  await p.click('#db-rows [data-edit]');
  for (const t of ['aoe', 'nuker']) await p.check(`#tag-boxes input[value="${t}"]`);
  await p.click('#hero-form button[type=submit]');
  for (const [n, tags] of [['Ruele of Light', ['aoe']], ['Lilias', ['aoe']], ['Landy', ['debuffer']], ['Seaside Bellona', ['debuffer', 'counter']]]) {
    await p.fill('#db-search', n); await p.click('#db-rows tr:first-child [data-edit]');
    for (const t of tags) await p.check(`#tag-boxes input[value="${t}"]`);
    await p.click('#hero-form button[type=submit]');
  }

  // ---- auto: fake draft screen, calibrate, detect
  const shot = async (file, opts) => {
    const png = await p.evaluate(async ({ W, H, S, LAY, scene, opts }) => {
      const heroes = window.RTAApp.cache.heroes;
      const code = (n) => heroes.find((h) => h.name === n).code;
      const load = (c) => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = window.RTARoster.PORTRAIT_URL(c); });
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      g.fillStyle = '#1b2333'; g.fillRect(0, 0, W, H);
      const s = S * W;
      const draw = async (name, fx, fy, banned) => {
        const img = await load(code(name)); const x = fx * W, y = fy * H;
        g.fillStyle = '#c9a24a'; g.fillRect(x - 4, y - 4, s + 8, s + 8);
        const z = 0.12 * img.naturalWidth;
        g.drawImage(img, z, z * 0.7, img.naturalWidth - 2 * z, img.naturalHeight - 2 * z, x, y, s, s);
        if (banned) { g.fillStyle = 'rgba(20,20,20,0.65)'; g.fillRect(x, y, s, s); g.strokeStyle = '#ff3040'; g.lineWidth = 8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + s, y + s); g.moveTo(x + s, y); g.lineTo(x, y + s); g.stroke(); }
      };
      if (opts.kind === 'draft') {
        for (let i = 0; i < 2; i++) { await draw(scene.mePreban[i], ...LAY.mePreban[i]); await draw(scene.oppPreban[i], ...LAY.oppPreban[i]); }
        for (let i = 0; i < 5; i++) for (const side of ['mePick', 'oppPick']) await draw(scene[side][i], LAY[side][0], LAY[side][1] + i * LAY.step, (opts.banned || []).includes(scene[side][i]));
        g.fillStyle = '#10131a'; g.fillRect(LAY.name[0] * W, LAY.name[1] * H, LAY.name[2] * W, LAY.name[3] * H);
        g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif'; g.fillText('RivalOne', LAY.name[0] * W + 12, LAY.name[1] * H + 34);
      } else if (opts.kind === 'battle') {
        // horizontal CR bar: x 320..1280, icons 50px, 100% at the right
        const x0 = 320, span = 960 - 50, y0 = 40, sz = 50;
        g.fillStyle = '#0c0f16'; g.fillRect(x0, y0, 960, sz);
        for (const [name, cr] of opts.bar) {
          const img = await load(code(name));
          g.drawImage(img, x0 + (cr / 100) * span, y0, sz, sz);
        }
      } else if (opts.kind === 'result') {
        g.fillStyle = '#000'; g.fillRect(LAY.result[0] * W, LAY.result[1] * H, LAY.result[2] * W, LAY.result[3] * H);
        g.fillStyle = '#ffd34d'; g.font = 'bold 72px serif'; g.fillText('VICTORY', LAY.result[0] * W + 60, LAY.result[1] * H + 82);
      }
      return cv.toDataURL('image/jpeg', 0.8);
    }, { W, H, S, LAY, scene, opts });
    fs.writeFileSync(SP + '/' + file, Buffer.from(png.split(',')[1], 'base64'));
    return SP + '/' + file;
  };
  const draftShot = await shot('v4-draft.jpg', { kind: 'draft' });
  const banShot = await shot('v4-postban.jpg', { kind: 'draft', banned: ['Ravi', 'Landy'] });
  // AV 242 at 100%; Ruele 170, Lilias 145, Destina 120 ; enemies SB 230, Tama 205, Basar 190, Ken 100
  const t = 100 / 242;
  const bar = [['Ken', 100], ['Destina', 120], ['Lilias', 145], ['Ruele of Light', 170], ['Basar', 190], ['Tamarinne', 205], ['Seaside Bellona', 230], ['Arbiter Vildred', 242]].map(([n, s]) => [n, s * t]);
  const battleShot = await shot('v4-battle.jpg', { kind: 'battle', bar });
  const resultShot = await shot('v4-result.jpg', { kind: 'result' });

  await p.click('.tab[data-tab=auto]');
  await p.setInputFiles('#auto-shot', draftShot);
  // 16:9 pictures use the built-in Steam layout now (nothing pops open); this made-up screen needs its own boxes
  await p.waitForTimeout(300);
  if (await p.$eval('#calib', (e) => e.classList.contains('hidden'))) await p.click('#auto-calibrate');
  await p.waitForSelector('#calib:not(.hidden)');
  const sh = (S * W) / H;
  const box = async (fx, fy, fw, fh) => {
    const r = await p.locator('#calib-canvas').boundingBox();
    await p.mouse.move(r.x + fx * r.width, r.y + fy * r.height); await p.mouse.down();
    await p.mouse.move(r.x + (fx + fw) * r.width, r.y + (fy + fh) * r.height, { steps: 4 }); await p.mouse.up();
  };
  for (const [fx, fy] of [...LAY.mePreban, ...LAY.oppPreban]) await box(fx, fy, S, sh);
  await box(LAY.mePick[0], LAY.mePick[1], S, sh); await box(LAY.mePick[0], LAY.mePick[1] + 4 * LAY.step, S, sh);
  await box(LAY.oppPick[0], LAY.oppPick[1], S, sh); await box(LAY.oppPick[0], LAY.oppPick[1] + 4 * LAY.step, S, sh);
  await box(...LAY.name);
  await p.click('#calib-done');
  await p.waitForFunction(() => { const o = window.RTAAuto._officialLoad; return o.total && o.done === o.total; }, null, { timeout: 120000 });
  for (let i = 0; i < 3; i++) await p.evaluate(() => window.RTAAuto.tick());
  const view = () => p.evaluate(() => { const v = window.RTALogic.draftView(window.RTAApp.store.draft); const n = window.RTAApp.nameOf; const m = (a) => a.map(n); return { pre: [m(v.prebans.me), m(v.prebans.opp)], picks: [m(v.picks.me), m(v.picks.opp)], post: [m(v.postbans.me), m(v.postbans.opp)], opp: window.RTAApp.store.draft.opponent }; });
  log('DRAFT:', JSON.stringify(await view()));
  // postban screen
  await p.setInputFiles('#auto-shot', banShot); await p.waitForTimeout(300);
  for (let i = 0; i < 5; i++) await p.evaluate(() => window.RTAAuto.tick());
  log('POSTBANS:', JSON.stringify((await view()).post));
  // name via OCR
  for (let i = 0; i < 10 && !(await p.evaluate(() => window.RTAApp.store.draft.opponent)); i++) { await p.waitForTimeout(2500); await p.evaluate(() => window.RTAAuto.tick()); }
  log('opponent:', await p.evaluate(() => window.RTAApp.store.draft.opponent), '| tesseract loaded:', await p.evaluate(() => !!window.Tesseract), '| name region:', await p.evaluate(() => !!window.RTAApp.store.auto.regions.oppName), '| ocr on:', await p.evaluate(() => window.RTAApp.store.auto.ocr));
  // CR bar
  await p.setInputFiles('#auto-shot', battleShot); await p.waitForTimeout(300);
  await p.click('#auto-calib-cr');
  await box(320 / W, 40 / H, 960 / W, 50 / H);
  await p.click('#calib-done');
  await p.click('#auto-read-cr');
  log('CR:', await txt('#auto-cr-out'));
  // expanded CR bar: calibrate it on the same frame, teach that screen, read again
  await p.click('#auto-calib-cr-exp'); await box(320 / W, 40 / H, 960 / W, 50 / H); await p.click('#calib-done');
  await p.selectOption('#auto-teach-screen', 'rta-cr-expanded'); await p.click('#auto-teach');
  for (let i = 0; i < 2; i++) await p.evaluate(() => window.RTAAuto.tick());
  await p.click('#auto-read-cr');
  log('CR EXPANDED:', (await txt('#auto-cr-out')).slice(0, 70), '| screen:', await p.evaluate(() => window.E7Screens.current()));
  // draft tab with scouting + insights
  await p.click('.tab[data-tab=draft]');
  log('scout:', (await txt('#scout')).slice(0, 400));
  log('insights:', await txt('#insights'));
  { const ov = await ctx.newPage(); await ov.goto(URL.replace('rta.html', 'overlay.html')); await ov.waitForTimeout(200); await p.evaluate(() => window.RTAAuto.tick()); await ov.waitForTimeout(300); log('OVERLAY RTA:', (await ov.textContent('#layers')).replace(/\s+/g, ' ').slice(0, 200)); await ov.close(); }
  await p.screenshot({ path: SP + '/v4-draft-done.png', fullPage: true });
  // result via OCR -> auto record
  await p.click('.tab[data-tab=auto]');
  await p.click('#auto-shot'.replace('#', '#') ? '#auto-calib-result' : '');
  await p.setInputFiles('#auto-shot', resultShot); await p.waitForTimeout(300);
  await p.click('#auto-calib-result');
  await box(...LAY.result);
  await p.click('#calib-done');
  for (let i = 0; i < 12 && (await p.evaluate(() => window.RTAApp.store.matches.filter((m) => m.source === 'auto').length)) === 0; i++) { await p.waitForTimeout(2200); await p.evaluate(() => window.RTAAuto.tick()); }
  log('auto-recorded:', JSON.stringify(await p.evaluate(() => window.RTAApp.store.matches.filter((m) => m.source === 'auto').map((m) => [m.result, m.opponent, m.myPicks.length, m.theyBanned && window.RTAApp.nameOf(m.theyBanned)]))));
  log('scouting stored:', JSON.stringify(await p.evaluate(() => window.RTAApp.store.scouting.map((e) => [window.RTAApp.nameOf(e.code), e.speed, e.method, e.player, !!e.matchId]))));

  // ---- new manual draft: suggestions, pairs, hotkeys, points
  await p.click('.tab[data-tab=draft]');
  await p.fill('#opp-name', 'RivalOne');
  await p.selectOption('#first-pick', 'opp');
  const pick = async (n) => { await p.fill('#hero-search', n); await p.press('#hero-search', 'Enter'); };
  for (const n of ['Krau', 'Aria', 'Luna', 'Belian', 'Landy']) await pick(n);
  await p.click('body');
  log('my pick suggestions:', (await txt('#suggest-list')).slice(0, 380));
  log('pairs:', (await txt('#insights')).slice(0, 300));
  await p.keyboard.press('1');
  log('after hotkey 1:', JSON.stringify((await view()).picks));
  await p.keyboard.press('u');
  log('after hotkey u:', JSON.stringify((await view()).picks));
  await p.screenshot({ path: SP + '/v4-draft-pick.png', fullPage: false });
  // pip fallback popup
  const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), p.click('#pip-btn')]);
  if (popup) { await popup.waitForTimeout(300); log('popup:', (await popup.textContent('body')).replace(/\s+/g, ' ').slice(0, 250)); await popup.setViewportSize({ width: 340, height: 560 }); await popup.screenshot({ path: SP + '/v4-pip.png' }); }
  else log('popup: documentPictureInPicture path (no new page)');

  // ---- history
  await p.click('.tab[data-tab=history]');
  log('session:', await txt('#hist-session'));
  for (const t of ['speed', 'teams', 'players', 'heroes', 'data']) await p.click(`.tab[data-tab=${t}]`);
  await p.click('.tab[data-tab=players]'); await p.click('#pl-rows tr');
  log('player detail:', (await txt('#pl-detail')).slice(-300));
  log('errors:', errs);
  await b.close();
})();
