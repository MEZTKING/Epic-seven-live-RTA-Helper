// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// DEVLOG #44, the official record site in the app, against a stand-in for the site (window.__e7RecordsTest) that serves
// one REAL page of games (tests/fixtures/records/battle-list.json; names replaced):
//  1) Data -> Official match records: Find me -> Import -> 10 matches of source 'official record'; importing again adds none
//  2) the opponent typed in the draft is looked up (found on another server), their habits and builds are shown, and
//     the suggestion engine gets a labelled 'official record' reason
//  3) Update top players: the ranking + their games are collected; statistics are built from Legend / Emperor games
//  4) Guild War: "Arena record" on an enemy card shows how the heroes of their defense are built in the arena
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const { chromium } = require('playwright');
const { autoAsk, ask } = require('./_ask.js');
const PAGE = __fs.readFileSync(__path.join(__dirname, '..', 'fixtures', 'records', 'battle-list.json'), 'utf8');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
  await autoAsk(ctx);
  await ctx.addInitScript((page) => {
    const body = JSON.parse(page).value.result_body;
    const calls = [];
    window.__e7RecordsCalls = calls;
    window.__e7RecordsTest = {
      async find(world, name) {
        calls.push(`find ${world}`);
        const n = name.toLowerCase();
        if (n === 'tester' && world === 'world_global') return [{ nickNo: 900001, name: 'Tester', rank: 70, world }];
        if (n === 'rival01' && world === 'world_kor') return [{ nickNo: 900002, name: 'Rival01', rank: 70, world }];
        return [];
      },
      async game(name, p) {
        calls.push(`${name} ${p.nick_no || p.season_code || ''} ${p.current_page || ''}`.trim());
        if (name === 'getSeasonList') return { result_body: [{ season_code: 'ss21', startDate: '2026-08-08 00:00:00.0', name: 'Fall 2026' }] };
        if (name === 'getWorldUserRankingDetail') return { result_body: p.current_page === 1 ? [{ nick_no: 900001, world_code: 'world_global', season_rank: 1, season_tiercode: 'legend' }] : [] };
        if (name === 'getBattleList') return { result_body: p.current_page === 1 ? { ...body, total_count: 10 } : { battle_list: [], total_count: 10 } };
        return {};
      },
    };
  }, PAGE);
  const errs = [];
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('rta: ' + e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(BASE + 'rta.html');
  await p.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('e7-records'); q.onsuccess = q.onerror = q.onblocked = r; }); });
  await p.reload();
  // 1) my matches
  await p.click('.tab[data-tab=data]');
  await p.selectOption('#rec-world', 'world_global');
  await p.fill('#rec-name', 'tester');
  await p.click('#rec-find');
  await p.waitForFunction(() => /Account: Tester/.test(document.querySelector('#records-card-body').textContent));
  await p.click('#rec-import');
  await p.waitForFunction(() => /Read 10 games/.test(document.querySelector('#rec-msg').textContent));
  console.log('import:', await p.textContent('#rec-msg'));
  const m = await p.evaluate(() => { const l = window.RTAApp.store.matches; return { n: l.length, sources: [...new Set(l.map((x) => x.source))], first: [l[0].result, l[0].opponent, l[0].myPicks.length, l[0].oppPicks.length, l[0].firstPick], src: window.RTAApp.store.matchSources['official record'] && window.RTAApp.store.matchSources['official record'].enabled }; });
  console.log('matches:', JSON.stringify(m));
  await p.click('#rec-import');
  await p.waitForFunction(() => /0 new/.test(document.querySelector('#rec-msg').textContent));
  console.log('import again:', await p.textContent('#rec-msg'), '· matches', await p.evaluate(() => window.RTAApp.store.matches.length));
  console.log('learned from them:', await p.evaluate(() => { const h = window.RTAApp.cache.stats.hero.get('c2185'); return h ? `${window.RTAApp.nameOf('c2185')} ${h.mine.wins}-${h.mine.games - h.mine.wins} for me` : 'nothing'; }));

  // 2) opponent on the draft tab
  await p.click('.tab[data-tab=draft]');
  await p.fill('#opp-name', 'Rival01');
  await p.waitForFunction(() => /Picks:/.test(document.querySelector('#records-opp').textContent), null, { timeout: 15000 });
  console.log('opponent panel:', (await p.textContent('#records-opp')).replace(/\s+/g, ' ').slice(0, 330));
  console.log('servers tried for the opponent:', JSON.stringify(await p.evaluate(() => window.__e7RecordsCalls.filter((c) => c.startsWith('find')).slice(1))));
  const reason = await p.evaluate(() => {
    const A = window.RTAApp;
    const h = A.cache.heroes.find((x) => x.code === 'c2185');
    const r = window.RTALogic.scoreCandidate(h, [], [], A.suggestionContext(), { side: 'opp' });
    return r.reasons.filter((x) => x.source === 'official record').map((x) => `${x.text} (+${x.value})`);
  });
  console.log("predicting the opponent's pick:", JSON.stringify(reason));
  // their pick on the board -> its build is shown
  await p.evaluate(() => window.RTAApp.replaceDraft({ ...window.RTALogic.boardToDraft({ prebans: { me: [], opp: [] }, picks: { me: [], opp: ['c2185'] } }, 'opp'), opponent: 'Rival01' }));
  await p.waitForTimeout(400);
  console.log('with their pick on the board:', ((await p.textContent('#records-opp')).replace(/\s+/g, ' ').match(/Rhianna and Luciella: [^↻]*/) || ['(no build line)'])[0].trim());

  // 3) top players
  await p.click('.tab[data-tab=data]');
  await p.click('#rec-top');
  await p.waitForFunction(() => /Done:/.test(document.querySelector('#rec-msg').textContent), null, { timeout: 30000 });
  console.log('top players:', await p.textContent('#rec-msg'), '·', await p.evaluate(() => { const T = window.E7RecordsApp.topStats(); return T ? `${T.games} games in the statistics, ${T.hero.size} heroes` : 'no statistics'; }));
  console.log('lookups made in total:', await p.evaluate(() => window.__e7RecordsCalls.length));

  // 4) Guild War
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
  await g.fill('#target-form [name=player]', 'Rival01');
  const fs = g.locator('#team-editors .gw-fs');
  const t1 = ['Rhianna and Luciella', 'Perfumer Byblis', 'Aube'];
  for (let k = 0; k < 3; k++) await fs.nth(0).locator('.h3').nth(k).fill(t1[k]);
  await g.click('#target-form button[type=submit]');
  await g.waitForTimeout(300);
  // (the button is for the desktop app; a plain browser hides desktop-only controls on the guildmates' page)
  await g.evaluate(() => document.documentElement.classList.remove('web-guild'));
  await g.click('#targets [data-record]');
  await g.waitForFunction(() => /Picks:/.test(document.querySelector('#targets .gw-record').textContent), null, { timeout: 15000 });
  console.log('Guild War enemy card:', (await g.textContent('#targets .gw-record')).replace(/\s+/g, ' ').slice(0, 420));
  console.log('errors:', errs);
  await b.close();
})();
