// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: text reader)
// DEVLOG #79: gear designs, moving gear between heroes, gear presets (owner's pictures + the gear3.txt fixture):
//  1) the watcher learns each design once with its name from the details panel, and names known designs on tiles
//  2) the Gear page: names on the cards, the "Gear designs seen" gallery, renaming a design renames its items
//  3) stats: the speed adds up the same as the RTA helper's speed (RTAGear.computeBuild) for every gear.txt hero
//  4) "Try it on a hero": now vs with it, who loses it and their best spare, "Plan both moves", the moves list
//  5) presets: new preset (starts from what the hero wears), change a slot, compare with now, a shared item warned,
//     fill empty slots, "Show the moves", delete
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
  const show = (file) =>
    lv.evaluate(async (url) => {
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.src = url; });
      window.E7Vision._useSource(im);
      for (let i = 0; i < 3; i++) await window.E7Vision.tick(true);
      await new Promise((r) => setTimeout(r, 300));
    }, dataUrl(file));
  // 1)
  for (const f of ['gear-weapon-wide.jpg', 'gear-helmet-heroic-wide.jpg', 'gear-helmet-equipped-wide.jpg', 'gear-armor-wide.jpg', 'gear-boots-wide.jpg', 'gear-necklace-wide.jpg', 'gear-ring-wide.jpg', 'gear-view-score-top-wide.jpg', 'gear-view-full-wide.jpg', 'gear-view-full2-wide.jpg']) await show(f);
  const d1 = await lv.evaluate(() => {
    const arts = JSON.parse(localStorage.getItem('e7-gear-arts') || '[]');
    const sc = window.GearStore.load().scanned;
    return { designs: arts.length, named: arts.filter((a) => a.name).map((a) => `${a.name} (${a.gear})`).sort(), items: sc.length, itemsNamed: sc.filter((x) => x.name).length, agony: sc.filter((x) => x.name === 'Bow of Agony').length };
  });
  console.log('1) designs seen:', d1.designs, '· with a name:', JSON.stringify(d1.named));
  console.log('   items:', d1.items, '· with a name:', d1.itemsNamed, '· Bow of Agony:', d1.agony);
  // 2)
  const g = await ctx.newPage();
  g.on('pageerror', (e) => errs.push('gear: ' + e.message));
  g.on('dialog', (dl) => dl.accept());
  await g.goto(BASE + 'gear.html');
  await g.setInputFiles('#gs-file', __path.join(__dirname, 'fixtures', 'gear3.txt'));
  await g.waitForTimeout(800);
  await g.evaluate(() => (document.querySelector('#gs-designs-box').open = true));
  await g.waitForTimeout(300);
  console.log('2) gallery:', await g.textContent('#gs-designs-count'), '·', await g.$$eval('#gs-designs .design img', (l) => l.length), 'pictures');
  const unnamed = await g.$eval('#gs-designs input[value=""]', (i) => i.dataset.art).catch(() => null);
  if (unnamed) {
    await g.fill(`#gs-designs input[data-art="${unnamed}"]`, 'Test Axe');
    await g.dispatchEvent(`#gs-designs input[data-art="${unnamed}"]`, 'change');
    await g.waitForTimeout(200);
    console.log('   renamed a design → its items:', await g.evaluate((id) => window.GearApp.gs.scanned.filter((x) => x.art === id).map((x) => x.name).join(', '), unnamed));
  }
  // 3) the speed, two ways
  const sp = await g.evaluate(() => {
    const B = window.E7GearBuild;
    const G = window.RTAGear;
    const stats = window.RTASources.fribbelsSnapshot.stats;
    const gs = window.GearApp.gs;
    const heroes = [...new Set(gs.items.filter((x) => x.equipped).map((x) => x.equipped))];
    return heroes.map((c) => {
      const items = gs.items.filter((x) => x.equipped === c);
      const mine = B.heroStats(stats[c], items);
      const theirs = G.computeBuild(c, { items: items.map((x) => ({ ...x, substats: x.subs })) }, stats);
      return [c, mine && mine.spd, theirs.speed];
    });
  });
  console.log('3) speed (mine / RTA helper):', JSON.stringify(sp), '· all equal:', sp.every((x) => x[1] === x[2]));
  // 4) a gear.txt item worn by one hero, tried on another
  const pick = await g.evaluate(() => {
    const gs = window.GearApp.gs;
    const it = gs.items.find((x) => x.equipped && x.gear === 'Weapon');
    const other = [...new Set(gs.items.filter((x) => x.equipped && x.equipped !== it.equipped).map((x) => x.equipped))][0];
    const N = new Map(window.RTASources.allHeroes.map((h) => [h.code, h.name]));
    return { id: it.id, from: N.get(it.equipped), to: N.get(other) };
  });
  await g.selectOption('#f-view', 'cards');
  await g.selectOption('#f-gear', 'Weapon');
  await g.selectOption('#f-eq', 'eq');
  await g.waitForTimeout(200);
  await g.click(`#gs-cards [data-item="${pick.id}"]`);
  await g.waitForTimeout(300);
  await g.fill('#gs-detail [data-try="hero"]', pick.to);
  await g.dispatchEvent('#gs-detail [data-try="hero"]', 'change');
  await g.waitForTimeout(300);
  const t = await g.evaluate(() => ({ rows: document.querySelectorAll('#gs-detail table.cmp tr').length, loses: (document.querySelector('#gs-detail .loses') || {}).textContent || '', btns: [...document.querySelectorAll('#gs-detail [data-act^="plan"]')].map((x) => x.textContent) }));
  console.log(`4) ${pick.from}'s weapon tried on ${pick.to}: table rows`, t.rows, '·', t.loses.replace(/\s+/g, ' ').trim().slice(0, 200), '·', JSON.stringify(t.btns));
  await g.screenshot({ path: OUT + '/gear-tryon.png' });
  if (t.btns.length > 1) await g.click('#gs-detail [data-act="plan2"]');
  else await g.click('#gs-detail [data-act="plan"]');
  await g.waitForTimeout(200);
  const moves = () => g.$$eval('#gs-moves li', (l) => l.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  console.log('   moves:', JSON.stringify(await moves()));
  await g.check('#gs-moves input[type="checkbox"]');
  await g.click('#gs-moves-clear');
  await g.waitForTimeout(100);
  console.log('   after ticking the first and "Clear the ticked ones":', (await moves()).length, 'left');
  // 5) presets for the hero that lost the weapon
  await g.fill('#ps-hero', pick.from);
  await g.dispatchEvent('#ps-hero', 'input');
  await g.waitForTimeout(200);
  console.log('5) now:', (await g.textContent('#ps-out')).replace(/\s+/g, ' ').trim().slice(0, 160));
  await g.click('#ps-out [data-ps-act="new"]');
  await g.fill('.ask-dialog input', 'RTA speed');
  await g.click('.ask-dialog button.primary');
  await g.waitForTimeout(300);
  const ps = () => g.evaluate(() => ({ tabs: [...document.querySelectorAll('#ps-out .ps-tabs button')].map((x) => x.textContent), filled: [...document.querySelectorAll('#ps-out select')].filter((x) => x.value).length, cmp: document.querySelectorAll('#ps-out table.cmp tr').length, warn: ((document.querySelector('#ps-out .loses') || {}).textContent || '').replace(/\s+/g, ' ').trim() }));
  console.log('   new preset:', JSON.stringify(await ps()));
  // empty two slots, change the boots to the best other boots, then fill
  await g.selectOption('#ps-out select[data-ps-slot="Ring"]', '');
  await g.selectOption('#ps-out select[data-ps-slot="Necklace"]', '');
  await g.waitForTimeout(150);
  const second = await g.$eval('#ps-out select[data-ps-slot="Boots"]', (s) => [...s.options].map((o) => o.value).filter((v) => v && v !== s.value)[0]);
  if (second) await g.selectOption('#ps-out select[data-ps-slot="Boots"]', second);
  await g.waitForTimeout(150);
  console.log('   two slots emptied, boots changed:', JSON.stringify(await ps()));
  await g.click('#ps-out [data-ps-act="fill"]');
  await g.waitForTimeout(150);
  console.log('   "Fill empty slots":', JSON.stringify(await ps()));
  await g.screenshot({ path: OUT + '/gear-presets.png', fullPage: false });
  await g.click('#ps-out [data-ps-act="moves"]');
  await g.waitForTimeout(200);
  console.log('   "Show the moves":', JSON.stringify(await moves()));
  // the watcher saving the store keeps presets and moves
  await show('gear-view-full-wide.jpg');
  console.log('   after the watcher saved the store again: presets', await lv.evaluate(() => window.GearStore.load().presets.length), '· moves', await lv.evaluate(() => window.GearStore.load().moves.length));
  await g.click('#ps-out [data-ps-act="delete"]');
  await g.waitForTimeout(150);
  console.log('   deleted:', JSON.stringify((await ps()).tabs));
  console.log('errors:', errs);
  await b.close();
})();
