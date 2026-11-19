// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: text reader)
// DEVLOG #80: (1) gear.txt items shown with the game's picture of their design (matched by name and slot), the item's
// own level / enhance / set on top; (2) the separate "Item upgrades" part: enhance next, reforge, modify a substat;
// clicking a row opens the item with its simulator.
const __path = require('path');
const __fs = require('fs');
const OUT = process.env.E7_OUT || __path.join(__dirname, 'out');
__fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
const dataUrl = (f) => 'data:image/jpeg;base64,' + __fs.readFileSync(__path.join(FX, f)).toString('base64');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  const errs = [];
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  await lv.evaluate(async () => {
    for (const k of ['rta-gear-v1', 'e7-gear-arts', 'e7-gear-setbadges', 'e7-gearscan-boxes']) localStorage.removeItem(k);
    for (const x of await window.E7GearPics.all()) await window.E7GearPics.remove(x.id);
  });
  for (const f of ['gear-weapon-wide.jpg', 'gear-ring-wide.jpg', 'gear-view-full-wide.jpg']) {
    await lv.evaluate(async (url) => {
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.src = url; });
      window.E7Vision._useSource(im);
      for (let i = 0; i < 3; i++) await window.E7Vision.tick(true);
      await new Promise((r) => setTimeout(r, 300));
    }, dataUrl(f));
  }
  const g = await ctx.newPage();
  g.on('pageerror', (e) => errs.push('gear: ' + e.message));
  await g.goto(BASE + 'gear.html');
  await g.setInputFiles('#gs-file', __path.join(__dirname, 'fixtures', 'gear3.txt'));
  await g.waitForTimeout(500);
  // the test gear.txt has dummy names: give two items the names of designs the watcher learned
  const ids = await g.evaluate(() => {
    const gs = window.GearApp.gs;
    const w = gs.items.find((x) => x.gear === 'Weapon');
    const r = gs.items.find((x) => x.gear === 'Ring');
    const h = gs.items.find((x) => x.gear === 'Helmet');
    w.name = 'Bow of Agony';
    r.name = 'Ring of Agony';
    h.name = 'Bow of Agony'; // a name of another slot: no picture
    localStorage.setItem('rta-gear-v1', JSON.stringify(gs));
    window.GearApp.reload();
    return { w: w.id, r: r.id, h: h.id };
  });
  await g.waitForTimeout(600);
  await g.selectOption('#f-view', 'cards');
  await g.selectOption('#f-eq', '');
  const pic = (id) => g.evaluate((id) => { const t = document.querySelector(`#gs-cards [data-item="${id}"] .gt-icon`); return t ? (t.classList.contains('gt-design') ? 'design picture' : t.classList.contains('gt-pic') ? 'own picture' : 'drawn art') + (t.querySelector('.gt-enh') ? ' + ' + t.querySelector('.gt-enh').textContent : '') : 'not shown'; }, id);
  for (const [k, sel] of [['weapon named Bow of Agony', ids.w], ['ring named Ring of Agony', ids.r], ['helmet named Bow of Agony', ids.h]]) {
    await g.selectOption('#f-gear', { Weapon: 'Weapon', Ring: 'Ring', Helmet: 'Helmet' }[k.split(' ')[0].replace(/^./, (c) => c.toUpperCase())] || '');
    await g.waitForTimeout(150);
    console.log('1)', k, '→', await pic(sel));
  }
  await g.selectOption('#f-gear', 'Weapon');
  await g.waitForTimeout(150);
  await g.screenshot({ path: OUT + '/gear-design-pics.png' });
  await g.selectOption('#f-gear', '');
  // 2) item upgrades
  await g.waitForTimeout(300);
  const up = await g.evaluate(() => [...document.querySelectorAll('#up-out .up-col')].map((c) => `${c.querySelector('h4').textContent}: ${c.querySelectorAll('.up-row').length}${c.querySelector('.up-row') ? ' · first: ' + c.querySelector('.up-row').textContent.replace(/\s+/g, ' ').trim().slice(0, 120) : ''}`));
  console.log('2) item upgrades:\n   ' + up.join('\n   '));
  await g.evaluate(() => document.querySelector('#up-box').scrollIntoView());
  await g.screenshot({ path: OUT + '/gear-upgrades.png' });
  const first = await g.$eval('#up-out .up-col .up-row', (x) => x.dataset.item);
  await g.click('#up-out .up-col .up-row');
  await g.waitForTimeout(400);
  console.log('   clicked the first → details of that item:', await g.evaluate((id) => !!document.querySelector(`#gs-cards [data-item="${id}"].sel`), first), '· simulator shown:', !!(await g.$('#gs-detail .sim')));
  console.log('errors:', errs);
  await b.close();
})();
