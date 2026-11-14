// Desktop app: the top-player model is fitted in a background worker inside the packaged app (DEVLOG #45).
//   bash tests/desktop/withwm.sh tests/desktop/topmodel.js <packaged app>
// 1,200 made-up games go into the records database; the model must come from the worker (page protocol e7://app), be
// stored, and be used after a reload without a second fit. No lookups are made.
const { _electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'e7ud-'));
  fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ capture: { mode: 'screen', id: 'screen:0:0', name: 'Screen 1' } }));
  const app = await _electron.launch({ executablePath: process.argv[2], args: ['--no-sandbox', `--user-data-dir=${userData}`] });
  let p = null;
  for (let i = 0; i < 40 && !p; i++) {
    await new Promise((r) => setTimeout(r, 500));
    p = app.windows().find((w) => /index\.html/.test(w.url()));
  }
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(p.url().replace(/[^/]*$/, 'rta.html'));
  await p.waitForFunction(() => window.E7RecordsApp && window.E7RecordsApp.available() && window.RTAApp && window.RTAApp.cache.heroes.length > 100);
  const first = await p.evaluate(async () => {
    let s = 3;
    const R = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
    const codes = window.RTAApp.cache.heroes.slice(0, 30).map((h) => h.code);
    const rows = [];
    for (let g = 0; g < 1200; g++) {
      const pool = [...codes].sort(() => R() - 0.5);
      const pa = pool.slice(0, 5);
      const pb = pool.slice(5, 10);
      const z = (pa.includes(codes[0]) ? 0.8 : 0) - (pb.includes(codes[0]) ? 0.8 : 0);
      const day = `2026-11-${String(1 + (g % 12)).padStart(2, '0')}`;
      rows.push({ seq: 'd' + g, day, date: day + 'T10:00:00Z', season: 'pvp_rta_ss21', rule: '', aGrade: 'legend', bGrade: 'legend', aFirst: g % 2 === 0, aWin: R() < 1 / (1 + Math.exp(-z)), aNick: 1 + (g % 40), aWorld: 'world_global', bNick: 100 + (g % 37), bWorld: 'world_kor', a: { picks: pa, ban: pa[4], prebans: pool.slice(10, 12), builds: {}, energy: {} }, b: { picks: pb, ban: pb[0], prebans: pool.slice(12, 14), builds: {}, energy: {} } });
    }
    await window.E7RecordsApp._store.addBattles(rows);
    await window.E7RecordsApp.rebuildTop();
    const M = window.E7RecordsApp.topModel();
    return { model: !!M, via: window.E7RecordsApp.topState().modelVia, games: M && M.meta.games, strong: M && M.model.pp(M.model.hero(codes[0])) };
  });
  console.log('first start:', JSON.stringify(first));
  await p.reload();
  await p.waitForFunction(() => window.E7RecordsApp && window.E7RecordsApp.topModel(), null, { timeout: 30000 });
  console.log('after a reload:', JSON.stringify(await p.evaluate(() => window.E7RecordsApp.topState().modelVia)));
  await app.close();
  console.log('errors:', errs);
})().catch((e) => { console.error(e); process.exit(1); });
