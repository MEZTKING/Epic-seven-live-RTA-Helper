// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: text reader)
// DEVLOG #74: the gear analyser on the owner's real Inventory pictures, with NO boxes drawn and no screen taught:
//  1) four items (weapon, heroic helmet, equipped helmet, armor): slot, rarity, enhance, main stat, substats, set
//  2) the same weapon on a 16:9 picture (the panel is pinned to the right edge)
//  3) the Substat Modification screen (an item, but another layout) reads nothing
//  4) each item is saved (gear store, source 'screen'), judged, and the verdict goes to the overlay
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
const dataUrl = (f) => 'data:image/jpeg;base64,' + __fs.readFileSync(__path.join(FX, f)).toString('base64');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
  const errs = [];
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  await lv.evaluate(() => {
    localStorage.removeItem('e7-gearscan-boxes');
    window.__ov = [];
    const post = window.E7Overlay && window.E7Overlay.post;
    if (post) window.E7Overlay.post = (layer, items) => (window.__ov.push({ layer, items }), post(layer, items));
  });
  const show = (file) =>
    lv.evaluate(async (url) => {
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.src = url; });
      window.E7Vision._useSource(im);
      const ev = [];
      const offs = ['gear:item', 'gear:added', 'gear:dup', 'gear:gone'].map((t) => window.E7Bus.on(t, (d) => ev.push([t, d])));
      for (let i = 0; i < 3; i++) await window.E7Vision.tick(true);
      await new Promise((r) => setTimeout(r, 200));
      offs.forEach((o) => o());
      const it = ev.find((e) => e[0] === 'gear:item');
      const ad = ev.find((e) => e[0] === 'gear:added');
      const i = it && it[1].item;
      return {
        note: window.E7Vision._readers.find((q) => q.id === 'gear-item').note,
        item: i ? `${i.rank} ${i.gear} +${i.enhance} lv${i.level} · ${i.set} · ${i.main.type} ${i.main.value} · ${i.substats.map((s) => s.type + ' ' + s.value).join(', ')}` : null,
        problems: it ? it[1].problems : null,
        gone: ev.some((e) => e[0] === 'gear:gone'),
        verdict: ad ? `${ad[1].verdict} (score ${ad[1].wss}) ${ad[1].reason}` : ev.find((e) => e[0] === 'gear:dup') ? 'dup' : null,
      };
    }, dataUrl(file));
  for (const f of ['gear-weapon-wide.jpg', 'gear-helmet-heroic-wide.jpg', 'gear-helmet-equipped-wide.jpg', 'gear-armor-wide.jpg']) console.log('1)', f, JSON.stringify(await show(f)));
  await lv.evaluate(() => localStorage.removeItem('e7-gearscan-boxes'));
  console.log('2) 16:9 weapon:', JSON.stringify(await show('gear-weapon-16x9.jpg')));
  console.log('3) substat modification:', JSON.stringify(await show('gear-substat-mod-wide.jpg')));
  console.log('4) saved items:', await lv.evaluate(() => (window.GearStore.load().scanned || []).length), '· overlay posts:', JSON.stringify(await lv.evaluate(() => window.__ov.filter((p) => p.layer === 'gear').map((p) => p.items.map((x) => `${x.level} ${x.side} ${x.title} | ${x.lines[1]}`)))));
  // 5) with the owner-like roster from gear.txt: whom the item suits
  await lv.evaluate(() => (window.__ov = []));
  const gp = await ctx.newPage();
  gp.on('pageerror', (e) => errs.push('gear: ' + e.message));
  await gp.goto(BASE + 'gear.html');
  await gp.setInputFiles('#gs-file', __path.join(__dirname, 'fixtures', 'gear3.txt'));
  await gp.waitForTimeout(400);
  console.log('   gear page info:', (await gp.textContent('#gs-scan-info')).replace(/\s+/g, ' ').slice(0, 160));
  await show('gear-substat-mod-wide.jpg');
  const again = await show('gear-helmet-equipped-wide.jpg');
  console.log('5) item read before, with heroes:', again.verdict, '·', JSON.stringify(await lv.evaluate(() => window.__ov.filter((p) => p.layer === 'gear').map((p) => p.items.map((x) => `${x.title} | ${x.lines.join(' | ')}`)))));
  console.log('errors:', errs);
  await b.close();
})();
