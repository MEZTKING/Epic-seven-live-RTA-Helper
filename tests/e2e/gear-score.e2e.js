// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: text reader)
// DEVLOG #83 on the owner's pictures:
//  1) Epic Seven's own Equipment Score read from the screen: under every tile of the Full format, and in the item panel
//  2) items already read are not read again (the same screen / the same panel again)
//  3) the Gear page shows the game's score by default ("Score"), the Fribbels gear score as an option; the rules follow
//  4) the reading speed setting
//  5) storage full (DEVLOG #87): the verdict still on the game, with a warning; designs stored small
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
const dataUrl = (f) => 'data:image/jpeg;base64,' + __fs.readFileSync(__path.join(FX, f)).toString('base64');
// the game's scores under the tiles (read by eye from the pictures)
const GAME = {
  'gear-view-full2-wide.jpg': [106, 104, 103, 103, 103, 103, 102, 102, 102, 102, 102, 102, 101, 101, 101, 101],
  'gear-view-full-wide.jpg': [55, 79, 82, 83, 25, 26, 55, 30, 32, 34, 28, 27, 46, 31, 27, 24],
};
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  const errs = [];
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  await lv.evaluate(() => { for (const k of ['rta-gear-v1', 'e7-gear-setbadges', 'e7-gearscan-boxes', 'e7-vision-speed']) localStorage.removeItem(k); });
  const show = (file) =>
    lv.evaluate(async (url) => {
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.src = url; });
      window.E7Vision._useSource(im);
      const ev = {};
      const offs = ['gear:grid', 'gear:item'].map((t) => window.E7Bus.on(t, (d) => (ev[t] = d)));
      const t0 = performance.now();
      for (let i = 0; i < 3; i++) await window.E7Vision.tick(true);
      const ms = Math.round(performance.now() - t0);
      offs.forEach((o) => o());
      const n = (id) => window.E7Vision._readers.find((q) => q.id === id).note;
      return { ms, grid: ev['gear:grid'] ? ev['gear:grid'].tiles.map((t) => t.item.gameScore || null) : null, panel: ev['gear:item'] ? ev['gear:item'].item.gameScore : null, gridNote: n('gear-grid'), panelNote: n('gear-item') };
    }, dataUrl(file));
  // 1)
  for (const f of Object.keys(GAME)) {
    const r = await show(f);
    const right = r.grid.filter((v, i) => v === GAME[f][i]).length;
    console.log(`1) ${f}: game's score read on ${right}/16 tiles exactly${right < 16 ? ' · read ' + JSON.stringify(r.grid) : ''} · panel: ${r.panel}`);
  }
  // 2)
  // the first screen again after the second (scrolled back): its tiles were read before
  const again = await show('gear-view-full2-wide.jpg');
  console.log('2) the first Full screen again:', again.gridNote, '·', again.ms, 'ms (', JSON.stringify(again.grid.filter(Boolean).length), 'scores kept)');
  await show('gear-view-menu-wide.jpg'); // the panel closes (menu over it)
  const back = await show('gear-weapon-wide.jpg');
  console.log('   the Bow of Agony panel again (another screen, same panel): published from what was read before:', back.panel === 55, '·', back.panelNote);
  // 3) the Gear page
  const g = await ctx.newPage();
  g.on('pageerror', (e) => errs.push('gear: ' + e.message));
  await g.goto(BASE + 'gear.html');
  await g.waitForTimeout(500);
  await g.selectOption('#f-view', 'cards');
  const bow = await g.evaluate(() => window.GearApp.gs.scanned.find((x) => x.main.value === 220 && x.subs.some((s) => s.type === 'EffectResistancePercent' && s.value === 16)).id);
  const view = async () => {
    await g.click(`#gs-cards [data-item="${bow}"]`).catch(() => {});
    await g.waitForTimeout(200);
    const r = await g.evaluate((id) => ({ card: document.querySelector(`#gs-cards [data-item="${id}"] .gt-score`).textContent, detail: document.querySelector('#gs-detail .gd-score').textContent.replace(/\s+/g, ' ').trim(), keep: document.querySelector('#r-keep').value, mode: document.querySelector('#r-score').value, todo: (document.querySelector('#gs-detail .gd-todo') || {}).textContent }), bow);
    await g.click(`#gs-cards [data-item="${bow}"]`).catch(() => {}); // close again
    return r;
  };
  console.log('3) default:', JSON.stringify(await view()));
  await g.selectOption('#r-score', 'wss');
  await g.waitForTimeout(200);
  console.log('   Fribbels gear score:', JSON.stringify(await view()));
  await g.selectOption('#r-score', 'game');
  await g.waitForTimeout(200);
  // a gear.txt item (no score read): estimated
  await g.setInputFiles('#gs-file', __path.join(__dirname, 'fixtures', 'gear3.txt'));
  await g.waitForTimeout(400);
  console.log('   gear.txt items: estimated game scores, e.g.', await g.evaluate(() => { const S = window.RTAGearSort; return window.GearApp.gs.items.slice(0, 4).map((x) => `${x.gear} +${x.enhance}: ${S.gameScore(x)} (gear score ${S.wss(x.subs)})`).join(' · '); }));
  // 4)
  await g.selectOption('#gs-scan-use + label select, [data-vision-speed]', 'fast').catch(() => g.selectOption('select[data-vision-speed]', 'fast'));
  console.log('4) reading speed:', await g.evaluate(() => [localStorage.getItem('e7-vision-speed'), window.E7VisionSpeed.factor()].join(' ×')), '· options:', await g.$$eval('select[data-vision-speed] option', (o) => o.map((x) => x.textContent).join(' / ')));
  // 5) DEVLOG #87: the app's storage full: the verdict still shows on the game (before: nothing), with a warning
  await lv.evaluate(() => {
    localStorage.removeItem('rta-gear-v1');
    window.__cards = [];
    const post = window.E7Overlay.post;
    window.E7Overlay.post = (l, i) => (l === 'gear' && i.length && window.__cards.push(i[0]), post(l, i));
    window.GearStore.save = () => { throw new Error('QuotaExceededError (test)'); };
  });
  await show('gear-necklace-wide.jpg');
  console.log('5) storage full, the necklace panel:', await lv.evaluate(() => JSON.stringify(window.__cards.map((c) => [c.title, ...c.lines].join(' / ')))));
  console.log('   designs stored small:', await lv.evaluate(() => (JSON.parse(localStorage.getItem('e7-gear-arts') || '[]').every((e) => typeof e.fp === 'string') ? 'yes' : 'no')));
  console.log('errors:', errs);
  await b.close();
})();
