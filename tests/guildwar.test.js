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
