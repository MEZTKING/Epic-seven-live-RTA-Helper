// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// Serves the repo on http://localhost:8766 (override with E7_BASE). Screenshots -> tests/e2e/out/ (E7_OUT).
const __path = require('path');
const __fs = require('fs');
const OUT = process.env.E7_OUT || __path.join(__dirname, 'out');
__fs.mkdirSync(OUT, { recursive: true });
const FX = __path.join(__dirname, 'fixtures');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const { chromium } = require('playwright');
const SP = OUT;
const B = BASE;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  const errs = [];
  const watch = (pg) => { pg.on('pageerror', (e) => errs.push(pg.url().split('/').pop() + ': ' + e.message)); pg.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text()) && errs.push(m.text())); };
  const p = await ctx.newPage(); watch(p);
  p.on('dialog', (d) => d.accept());
  await p.goto(B + 'rta.html');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  // RTA: Heroes tab -> ⓘ on Arbiter Vildred -> add my tags + S3 note
  await p.click('.tab[data-tab=heroes]');
  await p.fill('#db-search', 'Arbiter Vildred');
  await p.click('#db-rows tr:first-child [data-hero]');
  await p.waitForSelector('dialog.heroinfo[open]');
  console.log('card link:', await p.getAttribute('dialog.heroinfo a[href*="epic7x"]', 'href'));
  await p.click('dialog.heroinfo [data-hi=edit-mine]');
  for (const t of ['nuker', 'aoe', 'extra turn']) await p.check(`dialog.heroinfo input[value="${t}"]`);
  await p.fill('dialog.heroinfo [data-skill=S3]', 'AoE, extra turn when it kills');
  await p.click('dialog.heroinfo [data-hi=save-mine]');
  console.log('card after save:', (await p.textContent('dialog.heroinfo .hi-body')).replace(/\s+/g, ' ').slice(0, 260));
  await p.click('dialog.heroinfo [data-hi=close]');
  // suggestion list shows tag chips + ⓘ ; ⓘ doesn't pick
  await p.click('.tab[data-tab=draft]');
  await p.evaluate(() => { window.RTAApp.store.notes['c2007'].tier = 'S'; window.RTAApp.save(); window.RTAApp.render(); });
  const sug = await p.$eval('#suggest-list li', (li) => li.textContent.replace(/\s+/g, ' ').trim());
  console.log('suggestion row:', sug.slice(0, 120));
  await p.click('#suggest-list li:first-child button.info');
  console.log('ⓘ opened card, draft untouched:', await p.isVisible('dialog.heroinfo[open]'), (await p.evaluate(() => window.RTAApp.store.draft.actions.length)) === 0);
  await p.click('dialog.heroinfo [data-hi=close]');
  // ---- Guild War: guild notes on a hero
  const g = await ctx.newPage(); watch(g); g.on('dialog', (d) => d.accept());
  await g.goto(B + 'guild.html');
  await g.evaluate(() => localStorage.setItem('e7-guild-conn', JSON.stringify({ guildCode: 'heroguild1234567', guildName: 'Moonlight', myName: 'Ann' })));
  await g.evaluate(async () => {
    const be = await window.RTASync.local('heroguild1234567');
    await be.put({ id: 'w1', type: 'war', enemyGuild: 'Foes', startedAt: '2026-11-11T00:00:00Z' });
    await be.put({ id: 't1', type: 'target', warId: 'w1', player: 'Rival', teams: [{ heroes: ['c2007', 'c1022', 'c1089'] }, { heroes: ['c1117'] }] });
  });
  await g.reload(); await g.waitForTimeout(400);
  await g.click('.gw-card [data-hero="c2007"]');
  await g.waitForSelector('dialog.heroinfo[open]');
  await g.click('dialog.heroinfo [data-hi=edit-guild]');
  for (const t of ['nuker', 'defense break']) await g.check(`dialog.heroinfo .hi-edit input[value="${t}"]`);
  await g.fill('dialog.heroinfo [data-skill=S1]', 'Hits 2 targets, applies defense break');
  await g.click('dialog.heroinfo [data-hi=save-guild]');
  await g.waitForTimeout(300);
  console.log('guild card:', (await g.textContent('dialog.heroinfo .hi-body')).replace(/\s+/g, ' ').slice(0, 330));
  await g.screenshot({ path: SP + '/v11-heroinfo.png' });
  await g.click('dialog.heroinfo [data-hi=close]');
  console.log('guild card tags on war card:', (await g.textContent('.gw-card .gw-team')).replace(/\s+/g, ' ').slice(0, 120));
  console.log('stored as record:', JSON.stringify(await g.evaluate(() => window.GuildApp.state.heroNotes.map((r) => [r.id, r.tags, r.skills, r.updatedBy]))));
  // ---- Gear page sees both sources (guild read-only)
  const gp = await ctx.newPage(); watch(gp);
  await gp.goto(B + 'gear.html');
  await gp.evaluate(() => window.HeroInfo.open('c2007'));
  console.log('gear page card:', (await gp.textContent('dialog.heroinfo .hi-body')).replace(/\s+/g, ' ').slice(0, 400));
  // RTA tab reloaded my notes without losing guild-written data
  await p.waitForTimeout(300);
  console.log('RTA still has my tags:', JSON.stringify(await p.evaluate(() => window.RTAApp.store.notes.c2007.tags)));
  console.log('errors:', errs);
  await b.close();
})();
