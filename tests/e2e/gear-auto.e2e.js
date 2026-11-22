// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// DEVLOG #92 / #93 on tests/e2e/fixtures/gear-codes.txt (the owner's items of three heroes + 24 others, ids replaced):
//  1) auto-gear Eligos: damage, Speed set, speed 200+, from free items + his own, then from any hero; the builds meet
//     the minimum, the board shows six items, the stats compare with now, items from other heroes are named
//  2) "Save as a preset" makes a preset with those six; "Show the moves" lists the moves
//  3) free up inventory space: spare items, what to extract (least valuable first), locked apart, parking once a hero
//     is in "Heroes you don't gear"
const __path = require('path');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const { chromium } = require('playwright');
const { autoAsk, ask } = require('./_ask.js');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
  await autoAsk(ctx);
  const errs = [];
  const g = await ctx.newPage();
  g.on('pageerror', (e) => errs.push(e.message));
  await g.goto(BASE + 'gear.html');
  await g.evaluate(() => localStorage.clear());
  await g.reload();
  await g.waitForTimeout(400);
  await g.setInputFiles('#gs-file', __path.join(__dirname, 'fixtures', 'gear-codes.txt'));
  await g.waitForTimeout(600);
  // 1)
  const run = async (pool) => {
    await g.fill('#ag-hero', 'Eligos');
    await g.selectOption('#ag-goal', 'damage');
    await g.selectOption('#ag-set4', 'SpeedSet');
    await g.fill('#ag-spd', '200');
    await g.selectOption('#ag-pool', pool);
    await g.click('#ag-go');
    await g.waitForFunction(() => !/Searching/.test(document.querySelector('#ag-out').textContent), null, { timeout: 20000 });
    return g.evaluate(() => ({
      builds: [...document.querySelectorAll('#ag-out [data-ag-pick]')].map((x) => x.textContent),
      slots: document.querySelectorAll('#ag-out .hb-slot[data-item]').length,
      speed: [...document.querySelectorAll('#ag-out .hb-stats div')].find((d) => /Speed/.test(d.textContent)).textContent,
      cmp: !!document.querySelector('#ag-out table.cmp'),
      others: ((document.querySelector('#ag-out .loses') || {}).textContent || '').split(/wears it now/).length - 1,
      warn: !!document.querySelector('#ag-out .loses.warn') && /No combination/.test(document.querySelector('#ag-out').textContent),
    }));
  };
  const own = await run('free');
  console.log('1) free items + his own:', JSON.stringify(own));
  const any = await run('all');
  console.log('   any hero:', JSON.stringify(any));
  // 2)
  await ask(g, 'Eligos auto');
  await g.click('#ag-out [data-ag-act="preset"]');
  await g.waitForTimeout(300);
  console.log('2) preset saved:', await g.evaluate(() => { const p = window.GearApp.gs.presets.slice(-1)[0]; return p && `${p.name} · ${Object.keys(p.items).length} items`; }));
  await g.click('#ag-out [data-ag-act="moves"]');
  await g.waitForTimeout(300);
  console.log('   moves listed:', await g.evaluate(() => window.GearApp.gs.moves.length));
  // 3)
  const clean = () => g.evaluate(() => ({ head: document.querySelector('#cl-out p').textContent.trim(), cols: [...document.querySelectorAll('#cl-out .up-col h4')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()) }));
  console.log('3) clean-up:', JSON.stringify(await clean()));
  await g.fill('#sk-hero', 'Rhianna and Luciella');
  await g.click('#sk-add');
  await g.waitForTimeout(300);
  console.log('   with Rhianna in "don\'t gear" (her six slots are full): ', JSON.stringify((await clean()).cols));
  console.log('errors:', errs);
  await b.close();
})();
