// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// Typed hero speeds (source 'my speeds') for players without gear.txt (e.g. the Steam version).
const __path = require('path');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  const errs = [];
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(BASE + 'rta.html');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.click('.tab[data-tab=heroes]');
  await p.fill('#db-search', 'Arbiter Vildred');
  await p.click('#db-rows tr:first-child [data-edit]');
  await p.fill('#hero-form [name=mySpeed]', '282');
  await p.check('#hero-form [name=owned]');
  await p.click('#hero-form button[type=submit]');
  console.log('heroes row:', (await p.textContent('#db-rows tr:first-child')).replace(/\s+/g, ' ').trim().slice(0, 80));
  console.log('cache speed:', await p.evaluate(() => window.RTAApp.cache.mySpeeds.get('c2007')));
  // Guild War sees the typed speed for its gear check
  const g = await ctx.newPage();
  g.on('pageerror', (e) => errs.push(e.message));
  await g.goto(BASE + 'guild.html');
  await g.evaluate(async () => {
    localStorage.setItem('e7-guild-conn', JSON.stringify({ guildCode: 'speedguild123456', guildName: 'G', myName: 'Cy' }));
    const be = await window.RTASync.local('speedguild123456');
    const t = (o) => be.put({ updatedBy: 'Ann', ...o });
    await t({ id: 'm1', type: 'member', name: 'Cy', roster: ['c2007', 'c1022', 'c1089'] });
    await t({ id: 'w0', type: 'war', enemyGuild: 'F', startedAt: '2026-10-01T00:00:00Z' });
    await t({ id: 'w1', type: 'war', enemyGuild: 'F', startedAt: '2026-11-10T00:00:00Z' });
    await t({ id: 'tA', type: 'target', warId: 'w0', player: 'X', teams: [{ heroes: ['c1109', 'c5071', 'c1067'], speeds: { c5071: 250 } }] });
    await t({ id: 'tB', type: 'target', warId: 'w0', player: 'Y', teams: [{ heroes: ['c1109', 'c5071', 'c1067'] }] });
    await t({ id: 'a1', type: 'attack', warId: 'w0', targetId: 'tA', team: 1, by: 'Ann', heroes: ['c2007', 'c1022', 'c1089'], speeds: { c2007: 270 }, result: 'win' });
    await t({ id: 'a2', type: 'attack', warId: 'w0', targetId: 'tB', team: 1, by: 'Bob', heroes: ['c2007', 'c1022', 'c1089'], result: 'win' });
    await t({ id: 'tC', type: 'target', warId: 'w1', player: 'Z', teams: [{ heroes: ['c1109', 'c5071', 'c1067'] }] });
  });
  await g.reload();
  await g.waitForTimeout(500);
  console.log('guild dot with typed speed:', await g.$eval('.gw-card .gw-team-head .gwdot', (d) => d.className + ' | ' + d.title.replace(/\n/g, ' | ')));
  console.log('errors:', errs);
  await b.close();
})();
