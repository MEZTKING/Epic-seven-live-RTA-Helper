// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: portraits)
// Live → Teach heroes (DEVLOG #35) on the owner's REAL Guild War enemy screen (names blacked out):
//  1) the Guild War defense reader reads the 6 icons; pick one it is NOT sure of
//  2) open the same picture in Teach heroes, drag a deliberately sloppy square around that icon, see the guess, type a name, Add
//  3) the reader, run again, now names that icon by itself (source 'taught by you'); switching "Use the faces I taught" off undoes it
//  4) the library shows it; × forgets it
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1300, height: 1000 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + 'live.html');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  const url = 'data:image/png;base64,' + __fs.readFileSync(__path.join(FX, 'steam-gw-enemy.png')).toString('base64');
  const readDefense = () => p.evaluate(async () => {
    const r = window.E7Vision._readers.find((x) => x.id === 'guild-defense');
    r.idle();
    r.note = ''; // read afresh (the defense is published once two reads agree)
    let got = null;
    const off = window.E7Bus.on('guild:defense', (d) => (got = d));
    for (let i = 0; i < 120 && !/Defense: \d\/6 heroes recognised$|No defense/.test(r.note || ''); i++) { await window.E7Vision.tick(true); await new Promise((res) => setTimeout(res, 500)); }
    if (!got) { r.idle(); await window.E7Vision.tick(true); }
    off();
    return { note: r.note, icons: got ? got.teams.flat().map((x) => x && { code: x.code, sure: x.sure, name: (window.RTASources.officialSnapshot.heroes.find((h) => h.code === x.code) || {}).name }) : null };
  });
  await p.evaluate(async (url) => {
    const im = new Image();
    await new Promise((r) => { im.onload = r; im.src = url; });
    window.E7Vision._useSource(im);
  }, url);
  const before = await readDefense();
  console.log('reader before:', before.note, JSON.stringify(before.icons));
  const idx = before.icons.findIndex((x) => !x || !x.sure);
  console.log('teaching icon #', idx + 1);

  // 2) Teach heroes: open the file, drag a sloppy square (4 px off, 6% bigger) around that icon
  await p.setInputFiles('#teach-file', __path.join(FX, 'steam-gw-enemy.png'));
  await p.waitForSelector('#teach-work:not(.hidden)');
  await p.evaluate(() => window.E7TeachUI.load());
  const reg = await p.evaluate((i) => window.E7Layouts.layoutFor(1228, 691).regions[`gwDef${i + 1}`], idx);
  const W = 1228, H = 691;
  const box = { x: reg.x * W + 4, y: reg.y * H - 3, w: reg.w * W * 1.06, h: reg.w * W * 1.06 };
  // a real drag on the canvas (mouse), in screen coordinates
  const cb = await p.$eval('#teach-canvas', (c) => { c.scrollIntoView(); const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, s: r.width / c.width }; });
  await p.mouse.move(cb.x + box.x * cb.s, cb.y + box.y * cb.s);
  await p.mouse.down();
  await p.mouse.move(cb.x + (box.x + box.w) * cb.s, cb.y + (box.y + box.h) * cb.s, { steps: 5 });
  await p.mouse.up();
  await p.waitForFunction(() => !/Loading/.test(document.querySelector('#teach-guess').textContent), null, { timeout: 120000 });
  console.log('guess for the box:', (await p.textContent('#teach-guess')).replace(/\s+/g, ' '));
  await p.fill('#teach-name', 'Bellona');
  await p.click('#teach-add');
  console.log('message:', await p.textContent('#teach-msg'));
  console.log('guess after Add:', (await p.textContent('#teach-guess')).replace(/\s+/g, ' '));
  console.log('library:', (await p.textContent('#teach-lib')).trim(), '·', await p.textContent('#teach-count'));

  // 3) the reader again
  const after = await readDefense();
  console.log(`reader after teaching: ${after.note} · icon #${idx + 1}:`, JSON.stringify(after.icons[idx]), '(expected Bellona, sure)');
  await p.uncheck('#teach-on');
  const off = await readDefense();
  console.log(`switched off: icon #${idx + 1}:`, JSON.stringify(off.icons[idx]));
  await p.check('#teach-on');

  // 4) forget it
  await p.click('#teach-lib [data-forget]');
  console.log('after ×:', (await p.textContent('#teach-lib')).trim(), '| stored:', await p.evaluate(() => window.E7Teach.list().length));
  console.log('errors:', errs);
  await b.close();
})();
