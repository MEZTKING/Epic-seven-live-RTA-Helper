// Developer check: collect public top-player games exactly the way the app does (same transport, same spacing,
// same crawl), into a file OUTSIDE version control, to try the model / planner / statistics on real data.
//   node tools/dev/collect-top-games.js [players = 100]
// Writes tools/dev/out/top-games.json (git-ignored; public game records, never commit them: they hold player numbers).
// About 10 lookups per player, 0.35 s apart: 100 players ≈ 12 minutes. The owner approved these lookups on 2026-11-14
// (DEVLOG #44); a cloud session may need the owner's go-ahead again before its first outside request.
const path = require('path');
const fs = require('fs');
const REPO = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(__dirname, 'out');
const OUT = path.join(OUT_DIR, 'top-games.json');
const PLAYERS = Number(process.argv[2] || 100);
const R = require(path.join(REPO, 'js/records.js'));
fs.mkdirSync(OUT_DIR, { recursive: true });
const T = require(path.join(REPO, 'desktop/records.js')).create({ dir: path.join(OUT_DIR, 'records-cache') });
(async () => {
  const battles = new Map();
  const players = new Map();
  if (fs.existsSync(OUT)) for (const r of JSON.parse(fs.readFileSync(OUT, 'utf8'))) battles.set(r.seq, r); // add to what is there
  const store = {
    players: async () => [...players.values()],
    getPlayer: async (k) => players.get(k),
    setPlayer: async (k, v) => void players.set(k, { k, ...v }),
    addBattles: async (rows) => {
      let n = 0;
      for (const r of rows) {
        if (!battles.has(r.seq)) {
          battles.set(r.seq, r);
          n++;
        }
      }
      return n;
    },
  };
  const api = {
    seasons: async () => (await T.game('getSeasonList', {})).result_body || [],
    ranking: async (sc, page) => (await T.game('getWorldUserRankingDetail', { season_code: sc, world_code: 'all', current_page: page })).result_body || [],
    battles: async (n, w, page) => (await T.game('getBattleList', { nick_no: n, world_code: w, current_page: page })).result_body || {},
  };
  const save = () => fs.writeFileSync(OUT, JSON.stringify([...battles.values()]));
  const run = await R.crawl(api, store, {
    trackPlayers: PLAYERS,
    maxPages: 10,
    onProgress: (p) => {
      if (p.step === 'players' && p.done % 10 === 0) {
        save();
        console.log(`${p.done}/${p.of} players, ${p.pages} pages, ${battles.size} games`);
      }
    },
  });
  save();
  console.log('done', JSON.stringify({ players: run.players, pages: run.pages, games: battles.size, file: path.relative(REPO, OUT) }));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
