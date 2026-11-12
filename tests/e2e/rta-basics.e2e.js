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
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror ' + e.message));
  p.on('console', m => m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text()) && errs.push(m.text()));
  const answers = [];
  p.on('dialog', d => { const a = answers.shift(); console.log('  dialog:', d.message().replace(/\n/g,' ').slice(0,140)); a === undefined ? d.accept() : d.accept(a); });
  const URL = BASE + 'rta.html';
  // 1. v1 migration
  await p.goto(URL);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('rta-helper-v1', JSON.stringify({
    heroes: [{ id: 'landy', name: 'Landy', element: 'earth', role: 'ranger', tier: 'S', owned: true, counters: ['ravi'], synergies: [], notes: 'old note' },
             { id: 'ravi', name: 'Ravi', element: 'fire', role: 'warrior', tier: '', owned: false, counters: [], synergies: [], notes: '' }],
    matches: [{ id: 'x', result: 'win', firstPick: 'me', myPicks: ['landy'], oppPicks: ['ravi'] }] })); });
  await p.reload();
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('rta-helper-v2') || 'null'));
  console.log('migrated v2 stored?', !!st, '| (saved on first change)');
  await p.click('.tab[data-tab=heroes]');
  await p.check('#db-noted-only');
  console.log('noted heroes:', (await p.textContent('#db-rows')).replace(/\s+/g, ' ').trim());
  await p.uncheck('#db-noted-only');
  console.log(await p.textContent('#db-count'));
  // 2. Fribbels + CSV import
  await p.click('.tab[data-tab=data]');
  await p.setInputFiles('#fribbels-file', FX + '/gear.txt');
  await p.waitForTimeout(300);
  console.log('fribbels:', (await p.textContent('#src-fribbels')).replace(/\s+/g, ' '));
  answers.push('ladder-notes');
  await p.setInputFiles('#csv-file', FX + '/matches.csv');
  await p.waitForTimeout(300);
  console.log('sources:', (await p.textContent('#match-sources')).replace(/\s+/g, ' '));
  // 3. Draft vs RivalOne
  await p.click('.tab[data-tab=draft]');
  await p.fill('#opp-name', 'RivalOne');
  console.log('profile:', (await p.textContent('#opp-profile')).replace(/\s+/g, ' ').trim());
  console.log('preban ideas:', (await p.textContent('#suggest-list')).replace(/\s+/g, ' ').slice(0, 260));
  await p.screenshot({ path: SP + '/v2-draft-preban.png' });
  const pick = async (n) => { await p.fill('#hero-search', n); await p.press('#hero-search', 'Enter'); };
  await p.selectOption('#first-pick', 'opp');
  for (const n of ['Arbiter Vildred', 'Belian', 'Luna', 'Krau']) await pick(n);
  console.log('opp pick prediction:', (await p.textContent('#suggest-list')).replace(/\s+/g, ' ').slice(0, 300));
  await pick('Destina');
  console.log('my pick suggestions:', (await p.textContent('#suggest-list')).replace(/\s+/g, ' ').slice(0, 300));
  await p.waitForTimeout(1500); await p.screenshot({ path: SP + '/v2-draft-pick.png' });
  for (const n of ['Landy', 'Ravi', 'Aria', 'Sez', 'Ruele of Light', 'Lilias', 'Kise', 'Tamarinne', 'Cidd']) await pick(n);
  console.log('status:', await p.textContent('#draft-status'));
  await p.click('#hero-grid .hero-btn'); await p.click('#hero-grid .hero-btn');
  answers.push('Landy core');
  await p.click('#save-team-preset');
  await p.click('#record-loss');
  for (const t of ['teams', 'players', 'history', 'speed', 'heroes', 'data']) {
    await p.click(`.tab[data-tab=${t}]`);
    if (t === 'players') { await p.click('#pl-rows tr'); console.log('player detail:', (await p.textContent('#pl-detail')).replace(/\s+/g, ' ').slice(0, 200)); }
    if (t === 'teams') console.log('teams:', (await p.textContent('#tab-teams')).replace(/\s+/g, ' ').slice(0, 300));
    await p.screenshot({ path: `${SP}/v2-${t}.png`, fullPage: false });
  }
  // toggle learned off -> learned reasons disappear
  await p.uncheck('#use-learned');
  await p.click('.tab[data-tab=draft]');
  await p.fill('#opp-name', 'RivalOne');
  const imgs = await p.evaluate(() => [...document.querySelectorAll('#hero-grid img')].slice(0, 5).map(i => i.naturalWidth));
  console.log('portrait widths:', imgs);
  const m = await ctx.newPage();
  await m.setViewportSize({ width: 390, height: 844 });
  await m.goto(URL);
  console.log('mobile hscroll:', await m.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  await m.screenshot({ path: SP + '/v2-mobile.png' });
  console.log('errors:', errs);
  await b.close();
})();
