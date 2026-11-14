// Desktop app, LIVE check of the official record site (DEVLOG #44). Not part of the regular suites: it makes about
// 25 real lookups (spaced 0.35 s apart). Public leaderboard data only; no player name is typed or printed.
//   bash tests/desktop/withwm.sh tests/desktop/records-live.js <packaged app>
// Checks, inside the real app: the bridge page -> main process -> site works; a ranked player's games are read and
// parsed; the smallest server's player list is downloaded and searched; a 2-player collection run stores games and
// builds statistics.
const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'e7ud-'));
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ capture: { mode: 'screen', id: 'screen:0:0', name: 'Screen 1' } }));
  const args = [...(process.argv[3] ? [process.argv[3]] : []), '--no-sandbox', `--user-data-dir=${userData}`];
  const app = await _electron.launch({ executablePath: process.argv[2], args });
  let p = null;
  for (let i = 0; i < 40 && !p; i++) {
    await new Promise((r) => setTimeout(r, 500));
    p = app.windows().find((w) => /index\.html/.test(w.url()));
  }
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(p.url().replace(/[^/]*$/, 'rta.html'));
  await p.waitForFunction(() => window.E7RecordsApp && window.E7RecordsApp.available());
  const out = await p.evaluate(async () => {
    const D = window.E7Desktop.records;
    const R = window.E7Records;
    const res = {};
    const seasons = (await D.game('getSeasonList', {})).result_body || [];
    const cur = R.latestSeason(seasons);
    res.season = cur && cur.code;
    // the ranking (in a pre-season: the season before)
    let rows = (await D.game('getWorldUserRankingDetail', { season_code: cur.code, world_code: 'all', current_page: 1 })).result_body || [];
    if (!rows.length) for (const s of R.earlierSeasons(seasons, cur.code).slice(0, 2)) {
      rows = (await D.game('getWorldUserRankingDetail', { season_code: s.code, world_code: 'all', current_page: 1 })).result_body || [];
      if (rows.length) break;
    }
    res.ranked = rows.length;
    const top = rows[0];
    const body = (await D.game('getBattleList', { nick_no: top.nick_no, world_code: top.world_code, current_page: 1 })).result_body || {};
    const parsed = (body.battle_list || []).map(R.parseBattle).filter(Boolean);
    res.games = `${parsed.length} of ${(body.battle_list || []).length} parsed`;
    const s = R.summary(parsed);
    res.summary = `${s.games} games, ${s.picks.length} different heroes picked, ${Object.keys(s.builds).length} with builds`;
    // name list of the smallest server: downloaded once, searched on this PC
    const t0 = Date.now();
    res.find = (await D.find('world_jpn', 'no-such-player-xyz')).length;
    res.findMs = Date.now() - t0;
    const t1 = Date.now();
    await D.find('world_jpn', 'another-missing-name');
    res.findAgainMs = Date.now() - t1;
    // the bridge refuses anything else
    res.refused = await D.game('deleteAccount', {}).then(() => 'NOT refused', (e) => 'refused');
    // a tiny collection run: 2 players
    window.E7RecordsApp.saveCfg({ top: { ...window.E7RecordsApp.cfg().top, players: 2 } });
    const run = await R.crawl(
      { seasons: async () => seasons, ranking: async (sc, page) => (await D.game('getWorldUserRankingDetail', { season_code: sc, world_code: 'all', current_page: page })).result_body || [], battles: async (n, w, page) => (await D.game('getBattleList', { nick_no: n, world_code: w, current_page: page })).result_body || {} },
      window.E7RecordsApp._store,
      { trackPlayers: 2, maxPages: 2, rankPages: 1 },
    );
    res.crawl = `${run.players} players, ${run.pages} pages, ${run.added} games stored`;
    const T = await window.E7RecordsApp.rebuildTop();
    res.stats = T ? `${T.games} Legend/Emperor games, ${T.hero.size} heroes` : 'none';
    res.status = await D.status();
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  await app.close();
  console.log('errors:', errs);
})().catch((e) => { console.error(e); process.exit(1); });
