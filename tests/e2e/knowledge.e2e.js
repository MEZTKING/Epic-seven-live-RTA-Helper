// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// DEVLOG #42, hero mechanics from E7DaT's knowledge file as their own source ('E7DaT knowledge'):
//  1) RTA: with Boss Arunka on the enemy side, suggestion rows carry labelled mechanic reasons; switching the source
//     off removes them
//  2) the hero card shows mechanics and top players' builds (translated), labelled with the source and its date
//  3) Guild War: a defense card says what to watch for; the attack window warns about the heroes typed in
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const { chromium } = require('playwright');
const { autoAsk, ask } = require('./_ask.js');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
  await autoAsk(ctx);
  const errs = [];
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('rta: ' + e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(BASE + 'rta.html');
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  // the opponent picked first: Boss Arunka. My turn.
  await p.evaluate(() => {
    const L = window.RTALogic;
    window.RTAApp.replaceDraft(L.boardToDraft({ prebans: { me: [], opp: [] }, picks: { me: [], opp: ['c2124'] } }, 'opp'), { newMatch: true });
  });
  await p.waitForTimeout(300);
  console.log('status:', (await p.textContent('#draft-status')).replace(/\s+/g, ' ').trim().slice(0, 60));
  // search the suggestion list text for the source badge
  const sugg = async () => (await p.textContent('#suggest-list')).replace(/\s+/g, ' ');
  let text = await sugg();
  console.log('suggestions mention the source:', /E7DaT knowledge/.test(text), '·', (text.match(/[^.]{0,60}E7DaT knowledge[^.]{0,90}/) || [''])[0].trim());
  await p.click('.tab[data-tab=data]');
  await p.uncheck('#use-knowledge');
  await p.click('.tab[data-tab=draft]');
  await p.waitForTimeout(200);
  text = await sugg();
  console.log('source switched off -> mentioned:', /E7DaT knowledge/.test(text));
  await p.click('.tab[data-tab=data]');
  await p.check('#use-knowledge');

  // hero card
  await p.evaluate(() => window.HeroInfo.open('c2124'));
  await p.waitForTimeout(300);
  const card = await p.evaluate(() => { const el = [...document.querySelectorAll('.hi-src')].find((x) => /E7DaT knowledge/.test(x.textContent)); return el ? el.textContent.replace(/\s+/g, ' ').trim() : 'missing'; });
  console.log('hero card (Boss Arunka):', card.slice(0, 260));
  await p.evaluate(() => window.HeroInfo.open('c1133'));
  await p.waitForTimeout(300);
  console.log('hero card (Zio):', (await p.evaluate(() => { const el = [...document.querySelectorAll('.hi-src')].find((x) => /E7DaT knowledge/.test(x.textContent)); return el ? el.textContent.replace(/\s+/g, ' ').trim() : 'missing'; })).slice(0, 200));

  // Guild War
  const g = await ctx.newPage();
  g.on('pageerror', (e) => errs.push('guild: ' + e.message));
  g.on('dialog', (d) => d.accept());
  await g.goto(BASE + 'guild.html');
  await g.click('.tab[data-tab=setup]');
  await g.fill('#my-name', 'Ann');
  await g.press('#my-name', 'Tab');
  await g.fill('#guild-name', 'Testers');
  await g.click('#guild-create');
  await g.waitForTimeout(300);
  await g.click('.tab[data-tab=war]');
  await ask(g, ['Foes Guild', '']);
  await g.click('#war-new');
  await g.waitForTimeout(300);
  await g.click('#target-add');
  await g.fill('#target-form [name=player]', 'RivalOne');
  const fs = g.locator('#team-editors .gw-fs');
  const t1 = ['Boss Arunka', 'Zio', 'Belian'];
  for (let k = 0; k < 3; k++) await fs.nth(0).locator('.h3').nth(k).fill(t1[k]);
  await g.click('#target-form button[type=submit]');
  await g.waitForTimeout(300);
  console.log('defense card:', (await g.evaluate(() => { const el = [...document.querySelectorAll('#targets .gw-team .hint')].find((x) => /Watch for/.test(x.textContent)); return el ? el.textContent.replace(/\s+/g, ' ').trim() : 'missing'; })).slice(0, 260));
  await g.click('#targets [data-attack]');
  await g.waitForSelector('#attack-dialog[open]');
  const mine = ['Kawerik', 'Ruele of Light', 'Arbiter Vildred'];
  for (let k = 0; k < 3; k++) await g.locator('#atk-heroes .h3').nth(k).fill(mine[k]);
  await g.waitForTimeout(200);
  console.log('attack window:', (await g.textContent('#atk-mech')).replace(/\s+/g, ' ').trim().slice(0, 400));
  console.log('errors:', errs);
  await b.close();
})();
