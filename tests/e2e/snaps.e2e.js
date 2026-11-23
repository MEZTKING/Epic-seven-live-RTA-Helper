// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: text reader)
// DEVLOG #109: quick snaps (desktop hotkey Ctrl+Shift+D): pictures kept at once and read one after another, then live
// reading goes on. Here three of the owner's pictures are snapped while the "live" picture is the game's title screen:
// an item panel, a hero's equipment screen, the Steel Workshop's result: each is read as if it stood on the screen.
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
  lv.on('pageerror', (e) => errs.push(e.message));
  await lv.goto(BASE + 'live.html');
  await lv.evaluate(() => localStorage.removeItem('rta-gear-v1'));
  const r = await lv.evaluate(async (urls) => {
    const load = async (u) => {
      const im = new Image();
      await new Promise((res) => { im.onload = res; im.src = u; });
      return im;
    };
    const [live, ...pics] = await Promise.all(urls.map(load));
    window.E7Vision._useSource(live);
    const got = [];
    const cards = [];
    const offs = [
      window.E7Bus.on('gear:item', (d) => got.push(`item: ${d.item.gear} ${d.item.main.type} ${d.item.main.value}`)),
      window.E7Bus.on('gear:hero', (d) => got.push(`hero screen: ${d.hero.name}`)),
      window.E7Bus.on('gear:craft', (d) => got.push(`crafted: ${d.tiles.length} items`)),
      window.E7Bus.on('vision:busy', (d) => d.reader === 'snaps' && d.text && cards.push(d.text)),
    ];
    const t0 = performance.now();
    const queued = pics.map((p) => window.E7Vision.snap(p));
    const leftAtOnce = window.E7Vision.snapsLeft();
    await new Promise((res) => {
      const off = window.E7Bus.on('vision:snaps-done', () => (off(), res()));
    });
    offs.forEach((o) => o());
    return { queued, leftAtOnce, got, cards: [...new Set(cards)], ms: Math.round(performance.now() - t0), backToLive: window.E7Vision._readers.length > 0 && (await (async () => { await window.E7Vision.tick(true); return window.E7Vision._readers.find((q) => q.id === 'gear-item').note; })()) };
  }, ['steam-title-screen.jpg', 'gear-necklace-wide.jpg', 'hero-gear-rhianna-wide.jpg', 'steel-workshop-result-wide.jpg'].map(dataUrl));
  console.log('snapped at once:', JSON.stringify(r.queued), '· waiting right after:', r.leftAtOnce);
  console.log('read from the snaps:', JSON.stringify(r.got));
  console.log('card on the game:', JSON.stringify(r.cards));
  console.log('then back to the live picture (title screen): item reader says', JSON.stringify(r.backToLive));
  // DEVLOG #110 (right-click snaps): a snap taken while snaps are being read is of the GAME (the live picture), not
  // of the snap being read; and many clicks in a row keep at most 40 waiting
  const r2 = await lv.evaluate(async (urls) => {
    const load = async (u) => {
      const im = new Image();
      await new Promise((res) => { im.onload = res; im.src = u; });
      return im;
    };
    const [live, hero] = await Promise.all(urls.map(load));
    window.E7Vision._useSource(live);
    const got = [];
    const offs = [
      window.E7Bus.on('gear:item', (d) => got.push(`item: ${d.item.gear} ${d.item.main.type}`)),
      window.E7Bus.on('gear:hero', (d) => got.push(`hero screen: ${d.hero.name}`)),
    ];
    window.E7Vision.snap(hero);
    await new Promise((res) => setTimeout(res, 50)); // the hero picture is being read now
    const during = window.E7Vision.snap(); // like a right-click: the game as it is
    await new Promise((res) => {
      const off = window.E7Bus.on('vision:snaps-done', () => (off(), res()));
    });
    offs.forEach((o) => o());
    const before = window.E7Vision.snapsLeft();
    for (let i = 0; i < 45; i++) window.E7Vision.snap();
    const capped = window.E7Vision.snapsLeft();
    await new Promise((res) => {
      const off = window.E7Bus.on('vision:snaps-done', () => (off(), res()));
    });
    return { during, got: [...new Set(got)], before, capped };
  }, ['gear-necklace-wide.jpg', 'hero-gear-rhianna-wide.jpg'].map(dataUrl));
  console.log('snap during reading (live = item panel):', r2.during, JSON.stringify(r2.got));
  console.log('45 snaps in a row: waiting', r2.capped, '(at most 41: 40 + the one being read)');
  console.log('errors:', errs);
  await b.close();
})();
