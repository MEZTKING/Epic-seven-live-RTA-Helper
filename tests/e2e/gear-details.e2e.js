// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: text reader)
// DEVLOG #78: the Gear page with the game's pictures, numbers you can fix, the enhance simulator and "what to do":
//  1) the watcher reads the owner's pictures (a details panel, two Full screens) and keeps each item's pictures
//  2) the Gear page shows the game's picture on the cards (drawn art only for items without one)
//  3) clicking the +6 Bow of Agony: what to do, the screenshot, the numbers as boxes, the simulator
//  4) fixing a number: marked, verdict recomputed, kept when the item is read again; "Back to what was read"
//  5) "Roll again" gives another try; a +15 level-85 item shows the reforge; a worn one says keep
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
    for (const k of ['rta-gear-v1', 'e7-gear-setbadges', 'e7-gearscan-boxes', 'e7-vision-log']) localStorage.removeItem(k);
    for (const x of await window.E7GearPics.all()) await window.E7GearPics.remove(x.id);
  });
  const show = (file) =>
    lv.evaluate(async (url) => {
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.src = url; });
      window.E7Vision._useSource(im);
      for (let i = 0; i < 3; i++) await window.E7Vision.tick(true);
      await new Promise((r) => setTimeout(r, 300));
    }, dataUrl(file));
  // 1)
  for (const f of ['gear-weapon-wide.jpg', 'gear-view-full-wide.jpg', 'gear-view-full2-wide.jpg']) await show(f);
  const kept = await lv.evaluate(async () => ({ items: window.GearStore.load().scanned.length, pics: (await window.E7GearPics.all()).length, panel: (await window.E7GearPics.all()).filter((x) => x.from === 'panel').length, log: (localStorage.getItem('e7-vision-log') || '').length }));
  console.log('1) items read:', kept.items, '· with pictures:', kept.pics, `(${kept.panel} from a details panel)`, '· watcher log size', kept.log, 'characters (pictures not in it)');
  // 2)
  const g = await ctx.newPage();
  g.on('pageerror', (e) => errs.push('gear: ' + e.message));
  await g.goto(BASE + 'gear.html');
  await g.waitForTimeout(800);
  console.log('2) cards:', await g.$$eval('#gs-cards .gtile', (l) => l.length), '· with the game picture:', await g.$$eval('#gs-cards .gt-pic img', (l) => l.length));
  // 3) the +6 Bow of Agony (attack 220, effect resistance 16%)
  const bowId = await g.evaluate(() => window.GearApp.gs.scanned.find((x) => x.main.value === 220 && x.subs.some((s) => s.type === 'EffectResistancePercent' && s.value === 16)).id);
  await g.click(`#gs-cards [data-item="${bowId}"]`);
  await g.waitForTimeout(300);
  const d = () => g.evaluate(() => {
    const q = (s) => document.querySelector('#gs-detail ' + s);
    return {
      todo: q('.gd-todo') && q('.gd-todo').textContent.replace(/\s+/g, ' ').trim(),
      shot: !!q('.shot-box img'),
      boxes: document.querySelectorAll('#gs-detail [data-ed]').length,
      values: [...document.querySelectorAll('#gs-detail .ed-row input')].map((i) => i.value).join(' '),
      fixed: q('.fixed-note') ? q('.fixed-note').textContent : '',
      was: [...document.querySelectorAll('#gs-detail .was')].map((x) => x.textContent).join(' | '),
      sim: q('.sim') ? q('.sim').textContent.replace(/\s+/g, ' ').trim() : '',
      score: q('.gd-score') ? q('.gd-score').textContent.replace(/\s+/g, ' ').trim() : '',
    };
  });
  const a = await d();
  console.log('3) what to do:', a.todo);
  console.log('   screenshot shown:', a.shot, '· boxes to fix:', a.boxes, '· numbers:', a.values, '·', a.score);
  console.log('   simulator:', a.sim.slice(0, 260));
  await g.screenshot({ path: OUT + '/gear-details.png' });
  // 4) fix: speed 4 -> 5
  await g.fill('#gs-detail [data-ed="sub1:value"]', '5');
  await g.dispatchEvent('#gs-detail [data-ed="sub1:value"]', 'change');
  await g.waitForTimeout(200);
  const f = await d();
  console.log('4) after fixing speed 4 → 5:', f.fixed, '·', f.was, '·', f.score);
  await g.screenshot({ path: OUT + '/gear-details-fixed.png' });
  await show('gear-weapon-wide.jpg'); // the same item read again
  await g.evaluate(() => window.GearApp.reload());
  await g.waitForTimeout(300);
  console.log('   read again from the game → still:', (await d()).values, (await d()).fixed);
  await g.click('#gs-detail [data-act="restore"]');
  await g.waitForTimeout(200);
  console.log('   "Back to what was read":', (await d()).values, '· fixed note gone:', !(await d()).fixed);
  // 5)
  const s1 = (await d()).sim;
  await g.click('#gs-detail [data-act="reroll"]');
  await g.waitForTimeout(200);
  console.log('5) "Roll again" gives another try:', s1 !== (await d()).sim);
  const r15 = await g.evaluate(() => window.GearApp.gs.scanned.find((x) => x.enhance === 15 && x.level === 85 && !x.worn).id);
  await g.click(`#gs-cards [data-item="${r15}"]`);
  await g.waitForTimeout(300);
  const e = await d();
  console.log('   +15 level 85:', e.todo, '·', e.sim.slice(0, 160));
  const worn = await g.evaluate(() => window.GearApp.gs.scanned.find((x) => x.worn).id);
  await g.click(`#gs-cards [data-item="${worn}"]`);
  await g.waitForTimeout(300);
  console.log('   worn:', (await d()).todo);
  console.log('errors:', errs);
  await b.close();
})();
