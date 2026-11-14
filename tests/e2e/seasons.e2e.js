// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// DEVLOG #48, "is the rta stuff separated by seasons, also make the check for update happen on startup":
//  1) the season list is fetched once at start (stand-in site) and kept; matches get a season: imported ones from the
//     record site's own season code (a pre-season counts to its season), the others by their date
//  2) History → Seasons: my record per season; choosing one season changes what the page shows AND what the app
//     learns from; "current season" follows the calendar
//  3) top players' games are fetched at start: only after a first update by hand, only when the last one is older
//     than 6 hours, and not when switched off
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const { chromium } = require('playwright');
const { autoAsk } = require('./_ask.js');
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
        return name.toLowerCase() === 'tester' && world === 'world_global' ? [{ nickNo: 900001, name: 'Tester', rank: 70, world }] : [];
      },
      async game(name, p) {
        calls.push(name);
        if (name === 'getSeasonList') {
          return { result_body: [
            { season_code: 'pvp_rta_ss22', startDate: '2026-11-20 00:00:00.0', endDate: '2027-02-20 00:00:00.0', name: 'Winter 2026' }, // not started yet
            { season_code: 'pvp_rta_ss21', startDate: '2026-08-08 00:00:00.0', endDate: '2026-11-14 00:00:00.0', name: 'Fall 2026' },
            { season_code: 'pvp_rta_ss20', startDate: '2026-05-02 00:00:00.0', endDate: '2026-07-18 00:00:00.0', name: 'Summer 2026' },
          ] };
        }
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
  // the app's clock: 2026-11-14 (in Fall 2026's pre-season)
  await p.clock.install({ time: new Date('2026-11-14T12:00:00Z') });
  await p.goto(BASE + 'rta.html');
  await p.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('e7-records'); q.onsuccess = q.onerror = q.onblocked = r; }); });
  await p.reload();
  await p.waitForFunction(() => window.RTAApp && window.RTAApp.cache.heroes.length > 100 && window.E7RecordsApp);
  await p.clock.runFor(4000); // the season list is asked for 3 s after start
  await p.waitForFunction(() => window.E7RecordsApp.seasons().length === 3);
  console.log('season list kept:', JSON.stringify(await p.evaluate(() => window.E7RecordsApp.seasons().map((s) => `${s.name} from ${s.start.slice(0, 10)}`))));

  // my matches: 3 typed in by hand in June (2 won), 2 in September (1 won), and 10 imported (the site says ss20f)
  await p.evaluate(() => {
    const A = window.RTAApp;
    const codes = A.cache.heroes.slice(0, 10).map((h) => h.code);
    const mk = (id, date, result) => ({ id, source: 'manual', date, result, opponent: 'Someone', firstPick: 'me', myPrebans: [], oppPrebans: [], myPicks: codes.slice(0, 5), oppPicks: codes.slice(5, 10), notes: '' });
    A.store.matches.push(mk('m1', '2026-06-01T10:00:00Z', 'win'), mk('m2', '2026-06-02T10:00:00Z', 'win'), mk('m3', '2026-06-03T10:00:00Z', 'loss'), mk('m4', '2026-09-01T10:00:00Z', 'win'), mk('m5', '2026-09-02T10:00:00Z', 'loss'));
    A.save();
    A.render();
  });
  await p.click('.tab[data-tab=data]');
  await p.selectOption('#rec-world', 'world_global');
  await p.fill('#rec-name', 'tester');
  await p.click('#rec-find');
  await p.waitForFunction(() => /Account: Tester/.test(document.querySelector('#records-card-body').textContent));
  await p.click('#rec-import');
  await p.waitForFunction(() => /Read 10 games/.test(document.querySelector('#rec-msg').textContent));
  console.log('imported matches carry the season:', JSON.stringify(await p.evaluate(() => [...new Set(window.RTAApp.store.matches.filter((m) => m.source === 'official record').map((m) => m.season))])));

  // 2) History → Seasons
  await p.click('.tab[data-tab=history]');
  const table = () => p.evaluate(() => [...document.querySelectorAll('#hist-season tbody tr')].map((tr) => [...tr.children].slice(0, 3).map((td) => td.textContent.trim()).join(' | ') + (tr.classList.contains('sel') ? '  <- counted' : '')));
  const counted = () => p.evaluate(() => `${window.RTAApp.cache.enabledMatches.length} matches · summary "${document.querySelector('#hist-summary .card').textContent.replace(/\s+/g, ' ').trim()}" · learned from ${window.RTAApp.cache.stats.games}`);
  console.log('seasons table:', JSON.stringify(await table(), null, 1));
  console.log('all seasons:', await counted());
  console.log('choices:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('#hist-season-sel option')].map((o) => o.textContent.trim()))));
  await p.selectOption('#hist-season-sel', 'pvp_rta_ss20');
  console.log('Summer 2026 only:', await counted());
  await p.selectOption('#hist-season-sel', 'current');
  console.log('current season only (clock: 14 Nov, pre-season of Fall 2026):', await counted());
  console.log('seasons table now:', JSON.stringify((await table()).filter((r) => /counted/.test(r))));
  await p.reload();
  await p.waitForFunction(() => window.RTAApp && window.RTAApp.cache.heroes.length > 100);
  console.log('after a restart the choice is kept:', await p.evaluate(() => `${window.RTAApp.store.settings.seasonScope} · ${window.RTAApp.cache.enabledMatches.length} matches`));
  await p.click('.tab[data-tab=history]');
  await p.selectOption('#hist-season-sel', 'all');

  // 3) top players at start
  const run = async (label, top) => {
    await p.evaluate((t) => window.E7RecordsApp.saveCfg({ top: { ...window.E7RecordsApp.cfg().top, ...t } }), top);
    const before = await p.evaluate(() => window.__e7RecordsCalls.filter((c) => c === 'getBattleList').length);
    const res = await p.evaluate(async () => { const r = window.E7RecordsApp._autoTop(); if (r) await r; return !!r; });
    const after = await p.evaluate(() => window.__e7RecordsCalls.filter((c) => c === 'getBattleList').length);
    console.log(`update at start · ${label}:`, res ? `ran (${after - before} lookups of games)` : 'not run');
  };
  const hoursAgo = (h) => new Date(Date.parse('2026-11-14T12:00:00Z') - h * 3600000).toISOString();
  await run('never updated by hand', { at: '', auto: true });
  await run('last update 7 hours ago', { at: hoursAgo(7), auto: true });
  await run('just updated', {});
  await run('7 hours ago but switched off', { at: hoursAgo(7), auto: false });
  await p.click('.tab[data-tab=data]');
  console.log('card:', (await p.textContent('#rec-msg')).trim(), '· switch shown:', await p.isVisible('#rec-top-auto'));
  console.log('errors:', errs);
  await b.close();
})();
