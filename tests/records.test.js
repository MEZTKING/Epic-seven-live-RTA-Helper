// js/records.js (the official record site's data) and desktop/records.js (its transport), DEVLOG #44.
// The fixture is one real page of games (names and player numbers replaced).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const R = require('../js/records.js');
const Learn = require('../js/learn.js');
const transport = require('../desktop/records.js');
const PAGE = require('./fixtures/records/battle-list.json');
const LIST = PAGE.value.result_body.battle_list;

test('records: a real game is read completely', () => {
  const rows = LIST.map(R.parseBattle);
  assert.equal(rows.filter(Boolean).length, 10);
  const r = rows[0];
  assert.equal(r.seq, '85592835');
  assert.equal(r.date, '2026-07-23T04:48:01Z');
  assert.deepEqual([r.aWin, r.aFirst, r.aGrade, r.bGrade], [true, false, 'legend', 'emperor']);
  assert.deepEqual(r.a.picks, ['c2185', 'c5154', 'c5190', 'c1172', 'c1163']);
  assert.equal(r.a.ban, 'c1163', 'my hero that was banned');
  assert.equal(r.b.ban, 'c1117');
  assert.deepEqual(r.a.prebans, ['c1133', 'c1153']);
  assert.deepEqual(r.b.prebans, ['c6005', 'c2181']);
  assert.deepEqual(r.a.builds.c2185, { artifact: 'ef504', sets: ['set_speed', 'set_might'] });
  assert.equal(r.a.energy.c5190, 100, 'the fastest hero starts at 100');
  assert.equal(r.a.energy.c1163, 0, 'a banned hero has no start CR');
  assert.equal(r.bName, 'Rival01');
  // incomplete answers are dropped, never half-read
  assert.equal(R.parseBattle({ ...LIST[0], iswin: 0 }), null);
  assert.equal(R.parseBattle({ ...LIST[0], my_deck: { hero_list: [] } }), null);
  assert.equal(R.parseBattle({}), null);
  assert.equal(R.setName('set_cri_dmg'), 'Destruction');
  assert.equal(R.setName('set_brand_new'), 'Brand new');
});

test('records: my game as a match of the app; a player\'s habits', () => {
  const rows = LIST.map(R.parseBattle).filter(Boolean);
  const m = R.toMatch(rows[0]);
  assert.deepEqual([m.id, m.source, m.result, m.firstPick, m.opponent], ['or-85592835', 'official record', 'win', 'opp', 'Rival01']);
  assert.equal(m.iBanned, 'c1117', 'their hero I banned');
  assert.equal(m.theyBanned, 'c1163');
  assert.equal(m.myPicks.length, 5);
  // the app's learning takes it as it is (the banned heroes didn't play)
  const st = Learn.buildStats([m]);
  assert.equal(st.hero.get('c2185').mine.games, 1);
  assert.equal(st.hero.get('c1163').mine.games, 0);
  assert.ok(st.players.get('rival01'));
  const s = R.summary(rows);
  assert.equal(s.games, 10);
  assert.equal(s.wins, 10);
  assert.deepEqual([s.picks[0].code, s.picks[0].n], ['c2185', 8]);
  assert.deepEqual(s.prebans.slice(0, 2).map((p) => [p.code, p.rate]), [['c1133', 1], ['c1153', 1]]);
  assert.deepEqual(s.builds.c2185[0], { artifact: 'ef504', sets: ['set_might', 'set_speed'], n: 4, rate: 4 / 6 });
  assert.ok(s.speed.c5190 === 100 && s.fastest.length > 0);
  assert.equal(s.firstPickRate, 0.4);
});

test('records: seasons (a pre-season keeps the season that just ended)', () => {
  const seasons = [
    { season_code: 'ss22', startDate: '2026-12-05 00:00:00.0', endDate: '2027-03-01 00:00:00.0', name: 'Winter' }, // announced, not started
    { season_code: 'ss21', startDate: '2026-08-08 00:00:00.0', endDate: '2026-11-14 00:00:00.0', name: 'Fall 2026' },
    { season_code: 'ss20', startDate: '2026-04-04 00:00:00.0', endDate: '2026-07-11 00:00:00.0', name: 'Summer 2026' },
  ];
  assert.equal(R.latestSeason(seasons, new Date('2026-11-20T00:00:00Z')).code, 'ss21');
  assert.deepEqual(R.earlierSeasons(seasons, 'ss21').map((s) => s.code), ['ss20']);
  assert.equal(R.seasonOf('pvp_rta_ss20f'), 'pvp_rta_ss20');
  assert.equal(R.seasonOf('pvp_rta_ss20'), 'pvp_rta_ss20');
});

// a small fake record site: 3 ranked players (only in LAST season's ranking: pre-season), each with 2 pages of games
function fakeSite() {
  const calls = [];
  const WORLD = { 1: 'world_kor', 2: 'world_global', 3: 'world_eu', 50: 'world_global', 51: 'world_global', 60: 'world_asia' };
  const mk = (seq, nick, world, opp, oppGrade, date) => ({ ...LIST[0], battle_seq: String(seq), nicknameno: nick, worldCode: world, matchPlayerNicknameno: opp, enemy_world_code: WORLD[opp], enemy_grade_code: oppGrade, battle_day: date });
  const games = {
    1: [mk(101, 1, 'world_kor', 50, 'legend', '2026-11-10 10:00:00.0'), mk(102, 1, 'world_kor', 51, 'gold', '2026-11-09 10:00:00.0')],
    2: [mk(201, 2, 'world_global', 1, 'legend', '2026-11-10 11:00:00.0')],
    3: [mk(301, 3, 'world_eu', 2, 'emperor', '2026-11-08 10:00:00.0')],
    50: [mk(501, 50, 'world_global', 3, 'legend', '2026-11-11 10:00:00.0')],
  };
  return {
    calls,
    seasons: async () => [{ season_code: 'ss21', startDate: '2026-08-08 00:00:00.0' }, { season_code: 'ss20', startDate: '2026-04-04 00:00:00.0' }],
    ranking: async (season, page) => {
      calls.push(`rank ${season} ${page}`);
      if (season !== 'ss20' || page > 1) return [];
      return [{ nick_no: 1, world_code: 'world_kor', season_rank: 1, season_tiercode: 'legend' }, { nick_no: 2, world_code: 'world_global', season_rank: 2, season_tiercode: 'legend' }, { nick_no: 3, world_code: 'world_eu', season_rank: 3, season_tiercode: 'legend' }];
    },
    battles: async (nick, world, page) => {
      calls.push(`games ${nick} ${page}`);
      const all = games[nick] || [];
      return { battle_list: page === 1 ? all : [], total_count: all.length };
    },
    add: (nick, g) => games[nick].unshift(mk(g.seq, nick, 'world_kor', 60, 'legend', g.date)),
  };
}
function memStore() {
  const battles = new Map();
  const players = new Map();
  return {
    battles,
    addBattles: (rows) => rows.reduce((n, r) => (battles.has(r.seq) ? n : (battles.set(r.seq, r), n + 1)), 0),
    getPlayer: (k) => players.get(k),
    setPlayer: (k, o) => players.set(k, { k, ...o }),
    players: () => [...players.values()],
  };
}

test('records: collecting top players (pre-season ranking, strong opponents join, later runs read only what is new)', async () => {
  const site = fakeSite();
  const store = memStore();
  const now = new Date('2026-11-14T12:00:00Z');
  const res = await R.crawl(site, store, { trackPlayers: 10, now });
  assert.equal(res.season.code, 'ss21');
  assert.ok(site.calls.includes('rank ss21 1') && site.calls.includes('rank ss20 1'), 'empty current ranking -> the season before');
  assert.deepEqual([res.players, res.added], [4, 5], '3 ranked players + the Legend opponent one of them met');
  assert.ok(store.battles.has('501'), 'the Legend opponent\'s own games were read too');
  assert.ok(!site.calls.includes('games 51 1'), 'a Gold opponent is not followed');
  // a later run: one new game for player 1; nothing is counted twice
  site.calls.length = 0;
  site.add(1, { seq: 103, date: '2026-11-12 10:00:00.0' });
  const again = await R.crawl(site, store, { trackPlayers: 10, now });
  assert.equal(again.added, 1);
  assert.equal(store.battles.size, 6);
  // stopping
  let n = 0;
  const stopped = await R.crawl(site, memStore(), { trackPlayers: 10, now, stop: () => ++n > 6 });
  assert.ok(stopped.stopped && stopped.players < 4);
  // statistics: only games between Legend / Emperor players, one match per game
  const matches = R.toStatsMatches([...store.battles.values()]);
  assert.equal(matches.length, 5, 'the game against a Gold player is left out');
  const T = Learn.buildStats(matches);
  assert.equal(T.games, 5);
  assert.equal(T.hero.get('c2185').team.games, 5, 'each hero counted once per game');
});

test('records transport: one lookup at a time, spaced; retries; only the allowed lookups; names found on this PC', async () => {
  const hits = [];
  let fail = 1;
  const srv = http.createServer((req, res) => {
    hits.push({ t: Date.now(), method: req.method, url: req.url, origin: req.headers.origin, referer: req.headers.referer });
    if (req.url.startsWith('/users_world_eu.json')) return res.end(JSON.stringify({ users: [{ nick_no: '77', nick_nm: 'TestPlayer', rank: '70', code: 'c1001' }, { nick_no: '78', nick_nm: 'testplayer', rank: '66', code: 'c1001' }] }));
    if (req.url.startsWith('/getBattleList') && fail-- > 0) {
      res.statusCode = 503;
      return res.end('busy');
    }
    if (req.url.startsWith('/getSeasonList')) return res.end(JSON.stringify({ code: 0, value: { result_body: [{ season_code: 'x' }] } }));
    if (req.url.startsWith('/getBattleList')) return res.end(JSON.stringify(PAGE));
    res.end(JSON.stringify({ code: 500, message: 'no' }));
  });
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e7rec-'));
  const slept = [];
  const rec = transport.create({ dir, base, userUrl: (w) => `${base}users_${w}.json`, interval: 60, sleep: (ms) => (slept.push(ms), new Promise((r) => setTimeout(r, Math.min(ms, 60)))) });
  try {
    // three lookups started together run one after another, at least 60 ms apart, with the site's headers
    const [a, b, c] = await Promise.all([rec.game('getSeasonList'), rec.game('getSeasonList', { lang: 'ko' }), rec.game('getWorldUserRankingDetail', { season_code: 'x', world_code: 'all', current_page: 1 })]);
    assert.equal(a.result_body[0].season_code, 'x');
    assert.deepEqual(c, {}, 'a refusal from the site is an empty answer');
    assert.ok(b);
    assert.ok(hits[1].t - hits[0].t >= 50 && hits[2].t - hits[1].t >= 50, 'spaced out');
    assert.deepEqual([hits[0].method, hits[0].origin, hits[0].referer], ['POST', 'https://epic7.onstove.com', 'https://epic7.onstove.com/']);
    assert.ok(/lang=en/.test(hits[0].url) && /lang=ko/.test(hits[1].url));
    // a busy answer is retried after a wait
    const g = await rec.game('getBattleList', { nick_no: 900001, world_code: 'world_kor', current_page: 1 });
    assert.equal(g.result_body.battle_list.length, 10);
    assert.ok(slept.includes(5000), 'waited before retrying');
    // nothing else can be asked
    await assert.rejects(rec.game('getUserSecrets'), /not allowed/);
    await assert.rejects(rec.game('getBattleList', { nick_no: { $ne: 1 } }), /Bad lookup parameter/);
    await assert.rejects(rec.game('getBattleList', { 'x y': 1 }), /Bad lookup parameter/);
    // names: looked up in the downloaded list (letter case ignored, higher account rank first), kept on disk
    const before = hits.length;
    const found = await rec.find('world_eu', 'TESTPLAYER');
    assert.deepEqual(found.map((u) => [u.nickNo, u.name, u.world]), [[77, 'TestPlayer', 'world_eu'], [78, 'testplayer', 'world_eu']]);
    assert.deepEqual(await rec.find('world_eu', 'nobody'), []);
    assert.equal(hits.length, before + 1, 'the list is downloaded once');
    assert.ok(fs.existsSync(path.join(dir, 'users_world_eu.json')));
    assert.ok(!hits.some((h) => /testplayer/i.test(h.url)), 'the name itself is never sent');
    await assert.rejects(rec.find('world_mars', 'x'), /Unknown server/);
  } finally {
    srv.close();
  }
});

test('records: top players and the opponent\'s record become labelled suggestion reasons', () => {
  const L = require('../js/logic.js');
  // 40 games among top players: hero A's team beats hero X's team 30 times
  const matches = [];
  for (let i = 0; i < 40; i++) matches.push({ id: 't' + i, result: i < 30 ? 'win' : 'loss', firstPick: 'me', myPicks: ['A', 'B'], oppPicks: ['X', 'Y'], myPrebans: [], oppPrebans: [], opponent: '' });
  const T = Learn.buildStats(matches);
  const H = (c) => ({ code: c, name: c, element: 'fire', role: 'warrior' });
  const r = L.scoreCandidate(H('A'), [H('B')], [H('X')], { useElement: false, learn: Learn, topStats: T }, { side: 'me' });
  const texts = r.reasons.filter((x) => x.source === 'top players').map((x) => x.text);
  assert.ok(texts.some((t) => /75% win rate among top players \(40 games\)/.test(t)), texts.join(' | '));
  assert.ok(texts.some((t) => /75% vs X among top players/.test(t)));
  assert.ok(texts.some((t) => /75% with B among top players/.test(t)));
  assert.ok(r.score > 0);
  // too few games among top players: silent
  const few = Learn.buildStats(matches.slice(0, 10));
  assert.equal(L.scoreCandidate(H('A'), [], [H('X')], { useElement: false, learn: Learn, topStats: few }, { side: 'me' }).reasons.length, 0);
  // this opponent's own record, when predicting their pick
  const p = L.scoreCandidate(H('X'), [], [], { useElement: false, recordProfile: { name: 'Rival', games: 20, picks: [{ code: 'X', rate: 0.6 }] } }, { side: 'opp' });
  assert.deepEqual(p.reasons.map((x) => [x.source, x.text]), [['official record', 'Rival picked it in 60% of their last 20 arena games']]);
  assert.ok(L.SOURCE_GROUPS.includes('top players') && L.SOURCE_GROUPS.includes('official record'));
});

test('records: seasons — table, the season of a date (a pre-season counts to the season before), a match\'s season (DEVLOG #48)', () => {
  const raw = [
    { season_code: 'pvp_rta_ss21', name: 'Fall 2026', startDate: '2026-08-08 00:00:00.0', endDate: '2026-11-14 00:00:00.0' },
    { season_code: 'pvp_rta_ss20', name: 'Summer 2026', startDate: '2026-05-02 00:00:00.0', endDate: '2026-08-01 00:00:00.0' },
    { season_code: '', name: 'broken' },
  ];
  const T = R.seasonTable(raw);
  assert.deepStrictEqual(T.map((s) => s.code), ['pvp_rta_ss20', 'pvp_rta_ss21'], 'oldest first');
  assert.strictEqual(R.seasonForDate(T, '2026-06-01T10:00:00Z').code, 'pvp_rta_ss20');
  assert.strictEqual(R.seasonForDate(T, '2026-08-03T10:00:00Z').code, 'pvp_rta_ss20', 'between two seasons: still the one before');
  assert.strictEqual(R.seasonForDate(T, '2026-08-08T00:00:01Z').code, 'pvp_rta_ss21');
  assert.strictEqual(R.seasonForDate(T, '2026-12-24T10:00:00Z').code, 'pvp_rta_ss21', 'after its end: its pre-season');
  assert.strictEqual(R.seasonForDate(T, '2026-01-01T10:00:00Z'), null);
  assert.strictEqual(R.seasonForDate([], '2026-06-01T10:00:00Z'), null);
  // what the record site said wins over the date; a pre-season code is its season
  assert.strictEqual(R.seasonOfMatch(T, { season: 'pvp_rta_ss21f', date: '2026-06-01T10:00:00Z' }), 'pvp_rta_ss21');
  assert.strictEqual(R.seasonOfMatch(T, { date: '2026-06-01T10:00:00Z' }), 'pvp_rta_ss20');
  assert.strictEqual(R.seasonOfMatch([], { date: '2026-06-01T10:00:00Z' }), '');
  assert.strictEqual(R.seasonOfMatch(T, {}), '');
});

test('records transport: names CLOSE to a text read from the screen, from the server\'s own player list (DEVLOG #55)', async () => {
  const http = require('http');
  const os = require('os');
  const users = ['moonpie5385', 'Moonpie', 'OKameko', 'ハナコサクロ', 'ユキダルマ', 'ミドリカワ', 'starry26', 'starry27', '山田太郎', 'Ab'];
  const srv = http.createServer((req, res) => res.end(JSON.stringify({ users: users.map((n, i) => ({ nick_no: String(100 + i), nick_nm: n, rank: String(70 - i) })) })));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const rec = transport.create({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'e7near-')), base, userUrl: (w) => `${base}users_${w}.json`, interval: 0 });
  try {
    const names = async (t) => (await rec.near('world_jpn', t)).map((x) => `${x.name}:${x.d}`);
    assert.deepEqual(await names('moonpies385'), ['moonpie5385:1'], 'the reader took 5 for s');
    assert.deepEqual(await names('0Kameko'), ['OKameko:1'], '0 for O');
    assert.deepEqual(await names('ハナコサク回'), ['ハナコサクロ:1'], 'one character of a Japanese name off');
    assert.deepEqual(await names('ユキダルマ'), ['ユキダルマ:0']);
    assert.deepEqual(await names('okameko'), ['OKameko:0'], 'letter case does not count');
    assert.deepEqual(await names('starry2B'), ['starry26:1', 'starry27:1'], 'two players equally close: both are returned, the caller must not guess');
    assert.deepEqual(await names('zzzzzzzz'), []);
    assert.deepEqual(await names('A'), [], 'too short to search');
    // two characters: only the very same name (a scrap of scenery read as two characters "found" a real player,
    // DEVLOG #62); short names allow one edit; long ones up to three
    assert.deepEqual(await names('Xb'), []);
    assert.deepEqual(await names('ab'), ['Ab:0']);
    assert.deepEqual(await names('Moonpia'), ['Moonpie:1']);
    assert.deepEqual(await names('moonpye53B5x'), ['moonpie5385:3']);
    assert.strictEqual(transport.editDistance([...'kitten'], [...'sitting'], 5), 3);
    assert.strictEqual(transport.editDistance([...'abcdef'], [...'uvwxyz'], 2), 3, 'stops early: "more than the limit"');
  } finally {
    srv.close();
  }
});
