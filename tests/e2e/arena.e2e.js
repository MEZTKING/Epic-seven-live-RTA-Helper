// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: portraits, text reader)
// DEVLOG #71: the ARENA on the owner's real screens (every player name replaced by a made-up one):
//  1) the Opponents list: three names, points and four defense heroes each
//  2) the team set-up screen: who you are about to fight
//  3) the result: victory, points and change, your heroes; the fight is logged by the watcher, with their defense
//  4) other screens (the battle, an RTA victory) read nothing
//  5) the Arena page: opponents now with your record, the fight in the list; the home card counts it
//  6) the next Opponents list: your record against a defense you beat
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
const dataUrl = (f) => `data:image/${f.endsWith('.png') ? 'png' : 'jpeg'};base64,` + __fs.readFileSync(__path.join(FX, f)).toString('base64');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
  const errs = [];
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  await lv.evaluate(() => localStorage.removeItem('e7-arena'));
  await lv.evaluate(() => window.E7GWFaces.load());
  await lv.waitForFunction(() => window.E7GWFaces.ready(), null, { timeout: 240000 });
  const show = (file) =>
    lv.evaluate(async (url) => {
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.src = url; });
      window.E7Vision._useSource(im);
      const ev = [];
      const offs = ['arena:opponents', 'arena:prep', 'arena:result'].map((t) => window.E7Bus.on(t, (d) => ev.push(t)));
      for (let i = 0; i < 4; i++) await window.E7Vision.tick(true);
      offs.forEach((o) => o());
      return { ev, notes: window.E7Vision._readers.filter((q) => q.id.startsWith('arena')).map((q) => q.note) };
    }, dataUrl(file));
  const log = () => lv.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('e7-arena') || '{}');
    const N = new Map(window.RTASources.allHeroes.map((h) => [h.code, h.name]));
    const n = (a) => (a || []).map((c) => (c ? N.get(c) : '?'));
    return { now: ((s.now && s.now.list) || []).map((o) => `${o.name} ${o.pts} [${n(o.heroes).join(', ')}]`), pending: s.pending && `${s.pending.name} ${s.pending.pts} [${n(s.pending.defense).join(', ')}]`, fights: (s.fights || []).map((f) => `${f.opponent}: ${f.result} ${f.points} (${f.delta}) · theirs [${n(f.defense).join(', ')}] · mine [${n(f.mine).join(', ')}]`) };
  });
  const o1 = await show('arena-opponents1-wide.jpg');
  console.log('1) opponents list:', JSON.stringify(o1.ev), '\n  ', (await log()).now.join('\n   '));
  const p = await show('arena-prep-wide.jpg');
  console.log('2) set-up:', JSON.stringify(p.ev), '· pending:', (await log()).pending);
  const bt = await show('arena-battle-wide.jpg');
  console.log('4) battle screen events:', JSON.stringify(bt.ev));
  const v = await show('arena-victory-wide.jpg');
  console.log('3) result:', JSON.stringify(v.ev), '·', JSON.stringify((await log()).fights));
  const rv = await show('steam-rta-victory-opponent-left-wide.jpg');
  console.log('4) an RTA victory screen:', JSON.stringify(rv.ev), '· fights still', (await log()).fights.length);
  // the Arena page
  const ap = await ctx.newPage();
  ap.on('pageerror', (e) => errs.push('arena: ' + e.message));
  await ap.goto(BASE + 'arena.html');
  await ap.waitForTimeout(500);
  const page = () => ap.evaluate(() => ({ now: [...document.querySelectorAll('.ar-opp')].map((d) => d.textContent.replace(/\s+/g, ' ').trim()), summary: document.querySelector('#ar-summary').textContent.replace(/\s+/g, ' ').trim().slice(0, 120), fights: [...document.querySelectorAll('#ar-fights tr')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()) }));
  console.log('5) Arena page:', JSON.stringify(await page(), null, 1));
  const hp = await ctx.newPage();
  await hp.goto(BASE + 'index.html');
  await hp.waitForTimeout(400);
  console.log('   home card:', (await hp.textContent('#st-arena')).trim(), '· app bar links to Arena:', await hp.locator('.modules a[href="arena.html"]').count());
  // 6) the same opponents again (RivalOne's defense was beaten): the page shows the record
  await lv.evaluate(() => { const s = JSON.parse(localStorage.getItem('e7-arena')); s.now = null; localStorage.setItem('e7-arena', JSON.stringify(s)); });
  await show('arena-opponents2-wide.jpg');
  await show('arena-opponents1-wide.jpg');
  await ap.waitForTimeout(500);
  console.log('6) the first list again:', JSON.stringify((await page()).now));
  console.log('errors:', errs);
  await b.close();
})();
