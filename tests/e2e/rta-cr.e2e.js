// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: hero pictures)
// DEVLOG #69: the CR (turn order) bar at the start of an arena battle, with nothing drawn, on the owner's REAL battle
// picture (names and guilds hidden). The game's own expanded list at the same moment said: Peira 16 %, Tywin 34 %,
// Jenua 50 %, Politis 74 % (Mort and Basar were dead, Salome acting).
//  1) the watcher reads the bar once per match (after an arena draft, while the battle's VS bar shows)
//  2) the RTA page: without your own speeds it says so; with your Tywin at 200 speed it works out their speeds
//  3) no arena draft before it (e.g. a Guild War battle): nothing is read
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
  const rp = await ctx.newPage();
  rp.on('pageerror', (e) => errs.push('rta: ' + e.message));
  await rp.goto(BASE + 'rta.html');
  await rp.evaluate(() => localStorage.clear());
  await rp.reload();
  await rp.waitForTimeout(1500);
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  await lv.evaluate(() => window.E7Icons.load());
  await lv.waitForFunction(() => window.E7Icons.ready(), null, { timeout: 240000 });
  const run = (withDraft) =>
    lv.evaluate(async ({ url, withDraft }) => {
      const H = window.RTASources.allHeroes;
      const c = (n) => H.find((h) => h.name === n).code;
      const R = window.E7RtaDraft;
      R.tracker.reset();
      R.tracker.last = withDraft ? { own: ['Mort', 'Ambitious Tywin', 'Salome', 'Closer Charles', 'Auxiliary Lots'].map(c), enemy: ['Desert Jewel Basar', 'Jenua', 'Sea Phantom Politis', 'Lone Wolf Peira', 'Aubade Ludwig'].map(c) } : null;
      R.seenAt = withDraft ? performance.now() - 2000 - Math.random() * 1000 : 0;
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.src = url; });
      window.E7Vision._useSource(im);
      let ev = null;
      const off = window.E7Bus.on('rta:cr', (d) => (ev = d));
      for (let i = 0; i < 3; i++) await window.E7Vision.tick(true);
      off();
      const NAME = new Map(H.map((h) => [h.code, h.name]));
      return { note: window.E7Vision._readers.find((q) => q.id === 'rta-cr').note, readings: ev && ev.readings.map((r) => `${r.side} ${NAME.get(r.code)} ${r.cr}%`) };
    }, { url: dataUrl('steam-rta-battle-start-wide.jpg'), withDraft });
  const r1 = await run(true);
  console.log('1) battle start:', r1.note);
  console.log('   readings:', JSON.stringify(r1.readings), '(the game said: Peira 16, Tywin 34, Jenua 50, Politis 74)');
  await rp.waitForTimeout(600);
  console.log('2) RTA page without your speeds:', (await rp.textContent('#auto-status')).replace(/\s+/g, ' ').trim().slice(0, 170));
  // your Tywin at 200 speed (typed, source 'my speeds'): their speeds follow; publish the same reading again
  const sc = await rp.evaluate(async (readings) => {
    const A = window.RTAApp;
    const H = window.RTASources.allHeroes;
    const code = (n) => H.find((h) => h.name === n).code;
    A.store.mySpeeds[code('Ambitious Tywin')] = 200;
    A.save();
    window.E7Bus.publish('rta:cr', { readings: readings.map((t) => { const m = t.match(/^(me|opp) (.+) ([\d.]+)%$/); return { side: m[1], code: code(m[2]), cr: +m[3] }; }) });
    await new Promise((r) => setTimeout(r, 400));
    const NAME = new Map(H.map((h) => [h.code, h.name]));
    return { status: document.querySelector('#auto-status').textContent.replace(/\s+/g, ' ').trim(), scouting: A.store.scouting.map((e) => `${NAME.get(e.code)} ${e.speed} (${e.method})`) };
  }, r1.readings || []);
  console.log('   with your Tywin at 200 speed:', sc.status.slice(0, 170));
  console.log('   scouting saved:', JSON.stringify(sc.scouting), '(expected about Peira 93, Jenua 297, Politis 434)');
  const r3 = await run(false);
  console.log('3) the same picture with no arena draft before it:', r3.note, '· readings:', JSON.stringify(r3.readings));
  console.log('errors:', errs);
  await b.close();
})();
