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
const U = BASE + 'guild.html';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
  const errs = [];
  const watch = (pg) => { pg.on('pageerror', (e) => errs.push('pageerror ' + e.message)); pg.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text()) && errs.push(m.text())); };
  const A = await ctx.newPage(); watch(A);
  const answers = [];
  A.on('dialog', (d) => { const a = answers.shift(); a === undefined ? d.accept() : d.accept(a); });
  await A.goto(U);
  await A.evaluate(() => localStorage.clear());
  // seed the RTA helper roster on this device (as if gear.txt had been imported there)
  await A.evaluate(() => localStorage.setItem('rta-helper-v2', JSON.stringify({ version: 2, manualOwned: ['c2007', 'c1022', 'c1089', 'c1019'], fribbels: null })));
  await A.reload();
  const txt = async (pg, s) => (await pg.textContent(s)).replace(/\s+/g, ' ').trim();
  console.log('start:', await txt(A, '#conn-status'));
  await A.click('.tab[data-tab=setup]');
  await A.fill('#my-name', 'Ann'); await A.press('#my-name', 'Tab');
  await A.fill('#guild-name', 'Moonlight');
  await A.click('#guild-create');
  await A.waitForTimeout(300);
  console.log('setup:', await txt(A, '#guild-info'), '|', await txt(A, '#conn-status'));
  const B = await ctx.newPage(); watch(B);
  await B.goto(U);
  // ---- war + target
  await A.click('.tab[data-tab=war]');
  answers.push('Foes Guild'); await A.click('#war-new'); await A.waitForTimeout(200);
  await A.click('#target-add');
  await A.fill('#target-form [name=player]', 'RivalOne'); await A.fill('#target-form [name=tower]', 'Left 1');
  const fs = A.locator('#team-editors .gw-fs');
  const team1 = ['Landy', 'Seaside Bellona', 'Tamarinne'], team2 = ['Belian', 'Luna', 'Krau'];
  for (const [i, t] of [[0, team1], [1, team2]]) for (let k = 0; k < 3; k++) await fs.nth(i).locator('.h3').nth(k).fill(t[k]);
  await fs.nth(0).locator('.spd').nth(1).fill('231');
  await fs.nth(0).locator('.build').fill('SB: Speed+Crit, Alexa');
  await A.click('#target-form button[type=submit]');
  await A.waitForTimeout(200);
  // ---- attacks: team 1 loss then win, team 2 win
  const attack = async (teamNo, heroes, res) => {
    await A.click(`[data-attack][data-team="${teamNo}"]`);
    for (let k = 0; k < 3; k++) await A.locator('#atk-heroes .h3').nth(k).fill(heroes[k]);
    await A.click(`#attack-form [data-res=${res}]`);
    await A.waitForTimeout(150);
  };
  await attack(1, ['Ravi', 'Ken', 'Aria'], 'loss');
  await attack(1, ['Arbiter Vildred', 'Ruele of Light', 'Lilias'], 'win');
  console.log('summary A:', await txt(A, '#war-summary'));
  console.log('card A:', (await txt(A, '#targets')).slice(0, 300));
  await A.waitForTimeout(1500); console.log('portraits loaded:', await A.$$eval('#targets img', (els) => els.filter((i) => i.naturalWidth > 0).length + '/' + els.length));
  await A.screenshot({ path: SP + '/v6-guild-war.png', fullPage: true });
  // ---- B sees it live
  await B.click('.tab[data-tab=war]'); await B.waitForTimeout(300);
  console.log('B live:', (await txt(B, '#war-summary')).slice(0, 120));
  // ---- second war: same enemy, similar defense -> counters + assignment
  await A.click('.tab[data-tab=members]');
  await A.click('#roster-share'); await A.waitForTimeout(200);
  console.log('members:', await txt(A, '#member-rows'));
  await A.click('.tab[data-tab=war]');
  answers.push('Foes Guild'); await A.click('#war-new'); await A.waitForTimeout(200);
  await A.click('#target-add');
  await A.fill('#target-form [name=player]', 'rivalone');
  for (let k = 0; k < 3; k++) await A.locator('#team-editors .gw-fs').nth(0).locator('.h3').nth(k).fill(['Landy', 'Seaside Bellona', 'Destina'][k]);
  await A.click('#target-form button[type=submit]'); await A.waitForTimeout(200);
  console.log('war 2 card:', (await txt(A, '#targets')).slice(0, 260));
  console.log('ideas:', await txt(A, '#war-ideas'));
  await A.click('[data-attack][data-team="1"]');
  console.log('attack dialog counters:', await txt(A, '#atk-counters'));
  await A.click('#atk-counters [data-fill]');
  console.log('filled:', await A.$$eval('#atk-heroes .h3', (els) => els.map((e) => e.value).join(', ')));
  await A.click('#attack-cancel');
  // ---- counters + enemies tabs
  await A.click('.tab[data-tab=counters]');
  for (let k = 0; k < 3; k++) await A.locator('#tab-counters .h3').nth(k).fill(team1[k]);
  console.log('counters:', await txt(A, '#counter-out'));
  await A.click('.tab[data-tab=enemies]');
  await A.click('[data-enemy]');
  await A.waitForSelector('#hist-dialog[open]');
  console.log('enemy history:', (await txt(A, '#hist-body')).slice(0, 300));
  await A.click('#hist-close');
  // ---- my defense + defense log
  await A.click('.tab[data-tab=members]');
  for (let k = 0; k < 3; k++) await A.locator('#mydef-1 .h3').nth(k).fill(['Belian', 'Ruele of Light', 'Ravi'][k]);
  await A.click('#mydef-save');
  await A.fill('#dl-attacker', 'RivalOne'); await A.click('[data-dl=held]'); await A.waitForTimeout(200);
  console.log('members after:', await txt(A, '#member-rows'));
  // ---- invite link round trip into a fresh browser profile (local mode: no data, but code + name flow)
  const link = await A.evaluate(() => window.RTASync.inviteLink(location.href.split('#')[0], JSON.parse(localStorage.getItem('e7-guild-conn')).guildCode, null));
  const ctx2 = await b.newContext(); const C = await ctx2.newPage(); watch(C);
  await C.goto(link); await C.waitForTimeout(300);
  console.log('invitee lands on:', await C.$eval('.tab.active', (e) => e.dataset.tab), '| code saved:', await C.evaluate(() => !!JSON.parse(localStorage.getItem('e7-guild-conn')).guildCode), '| url hash cleared:', await C.evaluate(() => location.hash === ''));
  // ---- bad firebase config handling
  await A.click('.tab[data-tab=setup]');
  await A.fill('#fb-config', '{ apiKey: "x" }');
  await A.click('#fb-connect');
  const m = await ctx.newPage(); watch(m);
  await m.setViewportSize({ width: 390, height: 844 }); await m.goto(U);
  console.log('mobile hscroll:', await m.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  // main app + gear page still fine with new nav
  for (const pth of ['index.html', 'rta.html', 'gear.html']) { const pg = await ctx.newPage(); watch(pg); await pg.goto(BASE + pth); console.log(pth, await pg.title()); }
  console.log('errors:', errs);
  await b.close();
})();
