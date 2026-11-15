// Developer check: fit the top-player model on collected games and print what it learned, so a change to
// js/topmodel.js / js/teamplan.js / js/topstats.js can be judged on real data (DEVLOG #45, #51, #52).
//   node tools/dev/model-report.js [file = tools/dev/out/top-games.json]
// Get the file with tools/dev/collect-top-games.js. Nothing is sent anywhere by this script.
// Reference run (2026-11-14, 10,615 games from 110 players): 6,734 usable; winner named in 57% of 1,104 held-out
// games (log-loss 0.680 vs 0.693); who moves first called right in 89%; fit 4 s; a 5-slot plan: 43,000 teams, 55 ms.
const path = require('path');
const fs = require('fs');
const REPO = path.join(__dirname, '..', '..');
const TM = require(path.join(REPO, 'js/topmodel.js'));
const TP = require(path.join(REPO, 'js/teamplan.js'));
const TS = require(path.join(REPO, 'js/topstats.js'));
const file = process.argv[2] || path.join(__dirname, 'out', 'top-games.json');
if (!fs.existsSync(file)) {
  console.error(`No games at ${file}. Run: node tools/dev/collect-top-games.js`);
  process.exit(1);
}
const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
// hero names from the bundled source files (code -> name)
const names = {};
for (const f of fs.readdirSync(path.join(REPO, 'js/sources'))) {
  const s = fs.readFileSync(path.join(REPO, 'js/sources', f), 'utf8');
  for (const m of s.matchAll(/"?code"?\s*:\s*["'](c\d{4})["'][^{}]{0,200}?"?name"?\s*:\s*["']([^"']+)["']/g)) names[m[1]] = names[m[1]] || m[2];
  for (const m of s.matchAll(/"?name"?\s*:\s*["']([^"']+)["'][^{}]{0,200}?"?code"?\s*:\s*["'](c\d{4})["']/g)) names[m[2]] = names[m[2]] || m[1];
}
const n = (c) => names[c] || c || '—';
const pc = (x, d = 0) => (x === null || x === undefined ? '—' : (x * 100).toFixed(d) + '%');

let t = Date.now();
const stats = TM.build(rows, {});
if (!stats) {
  console.error(`Too few usable games (${rows.length} rows; ${TM.DEFAULTS.minGames} between Legend / Emperor players needed).`);
  process.exit(1);
}
const m = stats.meta;
const bt = m.backtest || {};
console.log(`rows ${rows.length} · usable ${m.games} (weighted ${m.weightedGames}) · newest ${m.latestDay} · fit ${Date.now() - t} ms · stored ${Math.round(JSON.stringify(stats).length / 1024)} kB`);
console.log(`season ${JSON.stringify(m.season)} · chosen: hero pull ${m.l2Hero}, pair pull ${m.kPair}, popularity ${m.usePop}, scale ${m.calib}, turn order in win rates ${m.useTurn}`);
console.log(`self-check on ${bt.n} newest games: winner ${pc(bt.accuracy, 1)} · log-loss ${bt.logloss} (coin ${bt.coinLogloss}) · who moves first ${pc(bt.ftAccuracy, 1)} · with turn ${bt.loglossTurn} / without ${bt.loglossNoTurn}`);
console.log('  predicted vs real per band:', (bt.bins || []).map((b) => `${pc(b.predicted)}→${pc(b.actual)} (${b.n})`).join(' · '));
console.log(`first pick wins ${pc(m.firstPickWr, 1)} · the side that moves first wins ${pc(m.ftWin, 1)}`);

const E = new TM.Engine(stats);
const H = TS.heroes(stats, E.model).filter((r) => r.games >= 60);
const line = (label, list) => console.log(`${label}: ${list.join(' · ')}`);
line('most picked', TS.sortRows(H, 'pick').slice(0, 8).map((r) => `${n(r.code)} ${pc(r.pick)}`));
line('strongest (skill removed)', TS.sortRows(H, 'pp').slice(0, 8).map((r) => `${n(r.code)} ${r.pp > 0 ? '+' : ''}${r.pp}pp (raw ${pc(r.wr)})`));
line('weakest', TS.sortRows(H, 'pp', 1).slice(0, 5).map((r) => `${n(r.code)} ${r.pp}pp (raw ${pc(r.wr)})`));
line('pre-bans, first pick', TS.prebans(stats, 'first', 6).map((x) => `${n(x.code)} ${pc(x.rate)}`));
line('pre-bans, second pick', TS.prebans(stats, 'second', 6).map((x) => `${n(x.code)} ${pc(x.rate)}`));
line('opening picks', TS.openers(stats, 6).map((x) => `${n(x.code)} ${pc(x.rate)}`));
line('strongest pairs', TS.topPairs(stats, E.model, { k: 6 }).map((x) => `${n(x.a)} + ${n(x.b)} +${x.pp}pp (${x.n})`));
line('biggest counters', TS.topCounters(stats, E.model, { k: 6 }).map((x) => `${n(x.a)} > ${n(x.b)} +${x.pp}pp (${x.n})`));
const TL = TS.turnLists(stats);
line('moves first', TL.fastest.slice(0, 6).map((x) => `${n(x.code)} ${pc(x.fast)}`));
line('needs the first turn', TL.needs.slice(0, 6).map((x) => `${n(x.code)} ${pc(x.wr1)}→${pc(x.wr0)}`));
const tr = TS.trends(rows);
if (tr) line(`trend ${tr.mid}..${tr.to} vs the week before`, [...tr.heroes.entries()].sort((a, b) => b[1].delta - a[1].delta).slice(0, 5).map(([c, v]) => `${n(c)} ${pc(v.before)}→${pc(v.now)}`));

// the banned slot: the third pick must never be banned (game rule the app relies on)
const slot = [0, 0, 0, 0, 0];
for (const r of rows) for (const s of [r.a, r.b]) slot[s.picks.indexOf(s.ban)]++;
console.log('banned pick, by slot 1..5:', slot.join(' / '), slot[2] === 0 ? '(third pick never banned: OK)' : '!! the third pick WAS banned: the ban-guard rule is wrong now');

// a plan: second pick, after the most common opener and the usual pre-bans
const pre = [...TS.prebans(stats, 'second', 2), ...TS.prebans(stats, 'first', 2)].map((x) => x.code);
const fp = E.firstPicks(pre)[0].code;
t = Date.now();
const plan = TP.search(E, { own: [], enemy: [fp], taken: pre, meFirst: false });
console.log(`\nplan as second pick after ${n(fp)} (pre-bans ${pre.map(n).join(', ')}): ${plan.n} teams in ${Date.now() - t} ms`);
for (const p of plan.plans) console.log(`  ${p.kind}: now ${p.codes.map(n).join(' + ')} → ${p.later.map((l) => `${n(l.code)} (${pc(l.avail)} free; else ${l.alts.map(n).join(' / ')})`).join(' → ')}  ${p.pp > 0 ? '+' : ''}${p.pp}pp`);
