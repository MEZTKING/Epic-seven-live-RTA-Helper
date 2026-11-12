const test = require('node:test');
const assert = require('node:assert/strict');
const GW = require('../js/guildwar.js');
const Sync = require('../js/sync.js');

const rec = (type, id, o) => ({ id, type, updatedAt: '2026-01-01T00:00:00Z', ...o });
function sample() {
  return [
    rec('member', 'm1', { name: 'Ann', roster: ['a', 'b', 'c', 'd', 'e', 'f'] }),
    rec('member', 'm2', { name: 'Bob', roster: ['a', 'b', 'c'] }),
    rec('member', 'm3', { name: 'Cy' }),
    rec('war', 'w1', { enemyGuild: 'Foes', startedAt: '2026-01-01' }),
    rec('war', 'w2', { enemyGuild: 'Foes', startedAt: '2026-01-08' }),
    rec('target', 't1', { warId: 'w1', player: 'Rival', tower: 'A1', teams: [{ heroes: ['x', 'y', 'z'] }, { heroes: ['p', 'q', 'r'] }] }),
    rec('target', 't2', { warId: 'w2', player: 'rival ', tower: 'B2', teams: [{ heroes: ['x', 'y', 'w'] }, { heroes: ['p', 'q', 'r'] }] }),
    rec('attack', 'a1', { warId: 'w1', targetId: 't1', by: 'Ann', team: 1, heroes: ['a', 'b', 'c'], result: 'win', at: '2026-01-01T10:00:00Z' }),
    rec('attack', 'a2', { warId: 'w1', targetId: 't1', by: 'Cy', team: 2, heroes: ['d', 'e', 'f'], result: 'loss', at: '2026-01-01T11:00:00Z' }),
    rec('attack', 'a3', { warId: 'w1', targetId: 't1', by: 'Ann', team: 2, heroes: ['d', 'e', 'f'], result: 'win', at: '2026-01-02T10:00:00Z' }),
    rec('defense', 'd1', { member: 'Bob', team: 1, result: 'held' }),
    rec('defense', 'd2', { member: 'Bob', team: 2, result: 'lost' }),
  ];
}

test('state: newest copy of a record wins, deleted records disappear', () => {
  const r = sample();
  r.push({ ...r[0], name: 'Ann B', updatedAt: '2026-02-01T00:00:00Z' });
  r.push({ id: 'm3', type: 'member', deleted: true, updatedAt: '2026-03-01T00:00:00Z' });
  const s = GW.buildState(r);
  assert.deepEqual(s.members.map((m) => m.name), ['Ann B', 'Bob']);
  assert.equal(s.wars[0].id, 'w2'); // newest first
});

test('target status and war summary', () => {
  const s = GW.buildState(sample());
  const st = GW.targetStatus(s.targets.find((t) => t.id === 't1'), s.attacks);
  assert.equal(st.cleared, true);
  assert.equal(st.teams[1].attempts, 2);
  assert.equal(st.teams[1].by, 'Ann');
  const w = GW.warSummary(s, 'w1');
  assert.equal(w.cleared, 1);
  assert.equal(w.teamsCleared, 2);
  assert.deepEqual(w.members.find((m) => m.name === 'Ann'), { name: 'Ann', used: 2, left: 0 });
  const day1 = GW.warSummary(s, 'w1', GW.DEFAULT_RULES, '2026-01-01');
  assert.equal(day1.members.find((m) => m.name === 'Ann').left, 1);
});

test('counter book + suggestions: exact match first, similar defenses (2 of 3) too, owners listed', () => {
  const s = GW.buildState(sample());
  const book = GW.counterBook(s);
  assert.equal(book.get('x+y+z')[0].wins, 1);
  const exact = GW.suggestCounters(['z', 'y', 'x'], book, { members: s.members });
  assert.deepEqual(exact[0].attack, ['a', 'b', 'c']);
  assert.equal(exact[0].exact, true);
  assert.deepEqual(exact[0].owners.sort(), ['Ann', 'Bob']);
  const similar = GW.suggestCounters(['x', 'y', 'w'], book, { members: s.members });
  assert.equal(similar[0].exact, false);
  // d+e+f vs p+q+r: 1 win 1 loss
  const pqr = GW.suggestCounters(['p', 'q', 'r'], book);
  assert.deepEqual([pqr[0].wins, pqr[0].games], [1, 2]);
});

test('assignment ideas: uncleared teams, members with attacks left who own a counter', () => {
  const s = GW.buildState(sample());
  const ideas = GW.assignmentIdeas(s, 'w2');
  const t1 = ideas.find((i) => i.team === 1);
  assert.deepEqual(t1.members, ['Ann', 'Bob']); // both own a+b+c and have attacks left in war 2
  assert.equal(t1.counters[0].exact, false); // x+y+w is similar (2 of 3) to the x+y+z defense Ann beat
});

test('enemy history across wars (name match ignores case/spaces), member stats, threats', () => {
  const s = GW.buildState(sample());
  const h = GW.enemyHistory(s, 'RIVAL');
  assert.equal(h.length, 2);
  assert.equal(h[0].war.id, 'w2');
  const ms = GW.memberStats(s);
  assert.deepEqual(ms.find((m) => m.name === 'Bob'), { name: 'Bob', attacks: 0, wins: 0, held: 1, lost: 1 });
  assert.equal(GW.threatHeroes(s)[0].code, 'p');
  assert.equal(GW.newId(16).length, 16);
});

// ---------------------------------------------------------------- sync
function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test('local sync: put / remove / subscribe', async () => {
  const b = await Sync.local('g1', { storage: memStorage() });
  const seen = [];
  b.subscribe((list) => seen.push(list.length));
  await b.put({ id: 'r1', type: 'member', name: 'Ann' });
  await b.put({ id: 'r1', type: 'member', name: 'Ann 2' });
  await b.remove('r1', 'Ann');
  assert.deepEqual(seen, [0, 1, 1, 1]);
  assert.equal(GW.buildState([]).members.length, 0);
  b.close();
});

function fakeFirebase() {
  const docs = new Map();
  const subs = [];
  const snap = () => ({ docs: [...docs.entries()].map(([id, d]) => ({ id, data: () => d })) });
  const col = {
    doc: (id) => ({
      set: async (data, opt) => {
        docs.set(id, opt && opt.merge ? { ...(docs.get(id) || {}), ...data } : data);
        subs.forEach((fn) => fn(snap()));
      },
    }),
    onSnapshot: (fn) => {
      subs.push(fn);
      fn(snap());
      return () => {};
    },
  };
  let signedIn = false;
  const app = {
    name: 'rta-demo',
    auth: () => ({ get currentUser() { return signedIn ? {} : null; }, signInAnonymously: async () => (signedIn = true) }),
    firestore: () => ({ collection: (c) => ({ doc: (g) => ({ collection: (r) => { assert.equal(`${c}/${g}/${r}`, 'guilds/g1/records'); return col; } }) }) }),
  };
  return { fb: { apps: [], initializeApp: () => app }, docs, isSignedIn: () => signedIn };
}

test('firebase sync (fake SDK): anonymous sign-in, guild path, live updates, soft delete', async () => {
  const f = fakeFirebase();
  const b = await Sync.firebase('g1', 'const firebaseConfig = { apiKey: "k", authDomain: "d", projectId: "demo", appId: "1:2:web:3" };', { fb: f.fb });
  assert.ok(f.isSignedIn());
  let last = [];
  b.subscribe((l) => (last = l));
  await b.put({ id: 'w1', type: 'war', enemyGuild: 'Foes' });
  assert.equal(last.length, 1);
  assert.ok(last[0].updatedAt);
  await b.remove('w1', 'Ann');
  assert.equal(last[0].deleted, true);
  assert.equal(last[0].enemyGuild, 'Foes');
});

test('config parsing and invite links', () => {
  assert.throws(() => Sync.parseConfig('{"apiKey":"x"}'), /projectId/);
  const cfg = Sync.parseConfig('{ apiKey: "k", projectId: "p", appId: "a", }');
  assert.equal(cfg.projectId, 'p');
  globalThis.btoa = globalThis.btoa || ((s) => Buffer.from(s, 'binary').toString('base64'));
  globalThis.atob = globalThis.atob || ((s) => Buffer.from(s, 'base64').toString('binary'));
  const link = Sync.inviteLink('https://x.io/guild.html', 'abc123', cfg);
  const back = Sync.parseInvite(link.split('#')[1]);
  assert.equal(back.guildCode, 'abc123');
  assert.deepEqual(back.config, cfg);
  assert.equal(Sync.parseInvite('#nothing=1'), null);
});

// ------------------------------------------------------------ verdict dots
function war(extra = []) {
  const base = [
    rec('member', 'm1', { name: 'Ann', roster: ['a', 'b', 'c'] }),
    rec('member', 'm2', { name: 'Bob', roster: ['a', 'b', 'c'] }),
    rec('war', 'w0', { enemyGuild: 'Foes', season: 'S1', startedAt: '2025-12-01' }),
    rec('war', 'w1', { enemyGuild: 'Foes', season: 'S2', startedAt: '2026-01-01' }),
    rec('target', 't0', { warId: 'w0', player: 'Rival', teams: [{ heroes: ['x', 'y', 'z'], speeds: { x: 250 }, build: 'X: Speed+Crit' }] }),
    rec('target', 't1', { warId: 'w1', player: 'Rival', teams: [{ heroes: ['x', 'y', 'z'], speeds: { y: 230 } }, { heroes: ['p', 'q', 'r'] }] }),
  ];
  return GW.buildState([...base, ...extra]);
}
const atk = (id, targetId, team, by, heroes, result, speeds) => rec('attack', id, { warId: targetId === 't0' ? 'w0' : 'w1', targetId, team, by, heroes, result, speeds, at: '2026-01-01T10:00:00Z' });
const meWith = (roster, speeds) => ({ name: 'Cy', roster: roster ? new Set(roster) : null, speeds: speeds ? new Map(Object.entries(speeds)) : null });

test('verdict grey: nothing known', () => {
  const s = war();
  const v = GW.teamVerdict(s, s.targets.find((t) => t.id === 't1'), 0, meWith(['a', 'b', 'c']));
  assert.equal(v.level, 'grey');
});

test('verdict red: lost repeatedly, never won', () => {
  const s = war([atk('a1', 't1', 1, 'Ann', ['a', 'b', 'c'], 'loss'), atk('a2', 't1', 1, 'Bob', ['d', 'e', 'f'], 'loss')]);
  assert.equal(GW.teamVerdict(s, s.targets.find((t) => t.id === 't1'), 0, meWith(['a', 'b', 'c'])).level, 'red');
});

test('verdict yellow: one win only / not owned / no roster', () => {
  const one = war([atk('a1', 't0', 1, 'Ann', ['a', 'b', 'c'], 'win')]);
  const t1 = (s) => s.targets.find((t) => t.id === 't1');
  assert.equal(GW.teamVerdict(one, t1(one), 0, meWith(['a', 'b', 'c'])).label, 'Not enough information');
  const two = war([atk('a1', 't0', 1, 'Ann', ['a', 'b', 'c'], 'win'), atk('a2', 't1', 1, 'Bob', ['a', 'b', 'c'], 'win')]);
  const notMine = GW.teamVerdict(two, t1(two), 0, meWith(['a', 'b']));
  assert.equal(notMine.level, 'yellow');
  assert.deepEqual(notMine.others.sort(), ['Ann', 'Bob']);
  assert.match(GW.teamVerdict(two, t1(two), 0, meWith(null)).lines.join(' '), /Share your roster/);
});

test('verdict proven (green ring) without gear, green with gear that checks out, yellow when slower', () => {
  const s = war([atk('a1', 't0', 1, 'Ann', ['a', 'b', 'c'], 'win', { a: 260 }), atk('a2', 't1', 1, 'Bob', ['a', 'b', 'c'], 'win', { a: 270 })]);
  const t = s.targets.find((x) => x.id === 't1');
  assert.equal(GW.teamVerdict(s, t, 0, meWith(['a', 'b', 'c'])).level, 'proven');
  // enemy speeds: x 250 (season 1), y 230 (now) -> fastest 250; my a 280 >= 260 needed and > 250*1.03
  const g = GW.teamVerdict(s, t, 0, meWith(['a', 'b', 'c'], { a: 280, b: 150 }));
  assert.equal(g.level, 'green');
  assert.match(g.lines.join(' '), /outspeed them: 280 vs their fastest ~250/);
  const slow = GW.teamVerdict(s, t, 0, meWith(['a', 'b', 'c'], { a: 240 }));
  assert.equal(slow.level, 'yellow');
  assert.match(slow.lines.join(' '), /slowest one that won had 260/);
});

test('player dot = weakest team; profile spans wars and seasons', () => {
  const s = war([atk('a1', 't0', 1, 'Ann', ['a', 'b', 'c'], 'win'), atk('a2', 't1', 1, 'Bob', ['a', 'b', 'c'], 'win')]);
  const v = GW.targetVerdict(s, s.targets.find((x) => x.id === 't1'), meWith(['a', 'b', 'c']));
  assert.equal(v.teams[0].level, 'proven');
  assert.equal(v.teams[1].level, 'grey');
  assert.equal(v.level, 'grey');
  const p = GW.playerProfile(s, 'rival');
  assert.equal(p.appearances.length, 2);
  assert.deepEqual(p.seasons.sort(), ['S1', 'S2']);
  const x = p.heroes.find((h) => h.code === 'x');
  assert.equal(x.seen, 2);
  assert.equal(x.max, 250);
  assert.equal(p.builds[0].text, 'X: Speed+Crit');
  assert.deepEqual([p.wins, p.losses], [2, 0]);
});

test('matchPlayer: tolerant to small OCR mistakes, rejects strangers', () => {
  const names = ['RivalOne', 'Moonblade', 'Kai', '라이벌'];
  assert.equal(GW.matchPlayer('RivalOne', names), 'RivalOne');
  assert.equal(GW.matchPlayer('Riva1One', names), 'RivalOne'); // 1 -> l
  assert.equal(GW.matchPlayer(' rivalone\n', names), 'RivalOne');
  assert.equal(GW.matchPlayer('Lv.60 Moonblade', names), 'Moonblade'); // extra text around it
  assert.equal(GW.matchPlayer('Kal', names), 'Kai');
  assert.equal(GW.matchPlayer('라이벌', names), '라이벌');
  assert.equal(GW.matchPlayer('Somebody', names), null);
  assert.equal(GW.matchPlayer('x', names), null);
});
