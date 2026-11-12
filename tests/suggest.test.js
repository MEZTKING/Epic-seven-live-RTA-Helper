const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');
const Learn = require('../js/learn.js');

const H = (code, element = 'fire') => ({ code, name: code.toUpperCase(), element, role: 'warrior', source: 'official' });
const heroes = 'abcdefghijklmnop'.split('').map((c) => H(c));
const play = (first, codes) => codes.reduce((d, c) => L.select(d, c), L.newDraft(first));
const sources = (r) => new Set(r.reasons.map((x) => x.source));

test('my-notes signals: counters, countered-by, synergy, tier — all labelled "my notes"', () => {
  const notes = { c: { tier: 'S', counters: ['e'] }, d: { synergies: ['f'] }, e: { counters: ['g'] } };
  // prebans a,b,x? use h,i,j,k ; opp first picks e, I pick f
  const d = play('opp', ['h', 'i', 'j', 'k', 'e', 'f']);
  const s = L.suggestPicks(d, heroes, { notes, useElement: false, deny: false });
  const by = Object.fromEntries(s.map((r) => [r.hero.code, r]));
  assert.equal(s[0].hero.code, 'c'); // tier S + counters e
  assert.equal(by.c.score, 6);
  assert.equal(by.d.score, 2); // synergy with f
  assert.equal(by.g.score, -3); // countered by e
  for (const r of s) assert.deepEqual([...sources(r)], ['my notes']);
});

test('owned roster filters only MY suggestions', () => {
  const notes = { c: { tier: 'S' }, d: { tier: 'A' } };
  const owned = new Set(['d']);
  const mine = L.suggestPicks(play('me', ['h', 'i', 'j', 'k']), heroes, { notes, owned });
  assert.deepEqual(mine.map((r) => r.hero.code), ['d']);
  const theirs = L.suggestPicks(play('opp', ['h', 'i', 'j', 'k']), heroes, { notes, owned });
  assert.deepEqual(theirs.map((r) => r.hero.code), ['c', 'd']);
});

test('learned matchups come from match history and are labelled "learned"', () => {
  // I (with a) beat enemy e five times; with b I lost to e five times.
  const mk = (mine, result) => ({ source: 'manual', result, myPicks: [mine], oppPicks: ['e'] });
  const matches = [...Array(5)].map(() => mk('a', 'win')).concat([...Array(5)].map(() => mk('b', 'loss')));
  const stats = Learn.buildStats(matches);
  const d = play('opp', ['h', 'i', 'j', 'k', 'e']);
  const s = L.suggestPicks(d, heroes, { stats, learn: Learn, useElement: false });
  assert.equal(s[0].hero.code, 'a');
  assert.equal(s[s.length - 1].hero.code, 'b');
  assert.ok(s[0].reasons.some((r) => r.source === 'learned' && /vs E/.test(r.text)));
  // turning learned off removes the signal entirely
  assert.equal(L.suggestPicks(d, heroes, { stats: null, learn: Learn, useElement: false }).length, 0);
});

test('opponent profile predicts their picks and suggests prebans', () => {
  const m = (oppPicks) => ({ source: 'manual', result: 'loss', opponent: 'Rival', myPicks: ['a'], oppPicks });
  const stats = Learn.buildStats([m(['p', 'o']), m(['p']), m(['p', 'n'])]);
  const profile = Learn.getProfile(stats, 'rival');
  assert.equal(profile.games, 3);
  assert.equal(profile.picks[0].code, 'p');
  const d = play('opp', ['h', 'i', 'j', 'k']);
  const s = L.suggestPicks(d, heroes, { profile, useElement: false });
  assert.equal(s[0].hero.code, 'p');
  assert.equal(s[0].reasons[0].source, 'player');
  const pre = L.suggestPrebans(L.newDraft('me'), heroes, { profile });
  assert.equal(pre[0].hero.code, 'p');
});

test('presets boost the heroes that complete a core I already started', () => {
  const presets = [{ name: 'Core', heroes: ['a', 'b', 'c'] }];
  const d = play('me', ['h', 'i', 'j', 'k', 'a', 'x1', 'x2'].filter((c) => c[0] !== 'x').concat(['l', 'm']));
  const s = L.suggestPicks(d, heroes, { presets, useElement: false });
  assert.deepEqual(s.map((r) => r.hero.code).sort(), ['b', 'c']);
  assert.equal(s[0].reasons[0].source, 'presets');
});

test('source weights scale or switch off a whole group', () => {
  const notes = { c: { tier: 'S' } };
  const d = play('me', ['h', 'i', 'j', 'k']);
  const base = L.suggestPicks(d, heroes, { notes, deny: false })[0];
  assert.equal(base.score, 3);
  assert.deepEqual(base.bySource, { 'my notes': 3 });
  assert.equal(L.suggestPicks(d, heroes, { notes, deny: false, sourceWeights: { 'my notes': 2 } })[0].score, 6);
  assert.equal(L.suggestPicks(d, heroes, { notes, deny: false, sourceWeights: { 'my notes': 0 } }).length, 0);
});

test('meta datasets add labelled win/pick/ban signals', () => {
  const meta = [{ name: 'S1', rows: { c: { win: 0.6, pick: 0.4, ban: 0.3 } } }];
  const mine = L.suggestPicks(play('me', ['h', 'i', 'j', 'k']), heroes, { meta, deny: false });
  assert.equal(mine[0].hero.code, 'c');
  assert.equal(mine[0].reasons[0].source, 'meta: S1');
  const theirs = L.suggestPicks(play('opp', ['h', 'i', 'j', 'k']), heroes, { meta });
  assert.ok(theirs[0].reasons.some((r) => /meta pick rate/.test(r.text)));
  const pre = L.suggestPrebans(L.newDraft('me'), heroes, { meta });
  assert.match(pre[0].reasons[0].text, /30% meta ban rate/);
});

test('speed edge: my gear speed vs scouted enemy speed', () => {
  const speed = { mine: new Map([['c', 300], ['d', 200]]), all: new Map([['e', { speed: 250, n: 4 }]]) };
  const d = play('opp', ['h', 'i', 'j', 'k', 'e']);
  const s = L.suggestPicks(d, heroes, { speed, deny: false, useElement: false });
  assert.equal(s[0].hero.code, 'c');
  assert.match(s[0].reasons[0].text, /Faster than E \(300 vs ~250\)/);
  assert.equal(s[s.length - 1].hero.code, 'd');
});

test('deny: a hero that would be strong for the opponent gets a bonus', () => {
  const H_ = (c) => heroes.find((h) => h.code === c);
  const notes = { c: { counters: ['m'] } }; // c counters my hero m
  // scoring c for ME, with m on my team: for the opponent c would counter m (+3), so I get a deny bonus
  const r = L.scoreCandidate(H_('c'), [H_('m')], [], { notes }, { side: 'me', deny: true });
  const deny = r.reasons.find((x) => x.source === 'deny');
  assert.ok(deny);
  assert.equal(deny.value, 0.9);
  assert.equal(L.scoreCandidate(H_('c'), [H_('m')], [], { notes }, { side: 'me', deny: false }).reasons.length, 0);
});

test('pairs on 2-pick turns, picksThisTurn', () => {
  const notes = { c: { tier: 'A', synergies: ['d'] }, d: { tier: 'A' }, e: { tier: 'S' } };
  const d = play('opp', ['h', 'i', 'j', 'k', 'n']); // opp first pick done -> I pick 2
  assert.equal(L.picksThisTurn(d), 2);
  const pairs = L.suggestPairs(d, heroes, { notes, deny: false });
  assert.deepEqual(pairs[0].heroes.map((h) => h.code).sort(), ['c', 'd']); // 2+2+synergy 2 = 6 > e's 3 + 2
  const d1 = L.select(d, 'c');
  assert.equal(L.picksThisTurn(d1), 1);
  assert.equal(L.suggestPairs(d1, heroes, { notes }).length, 0);
});

test('postban risk uses opponent ban habits', () => {
  const profile = { name: 'Rival', picks: [], postbans: [{ code: 'b', n: 3, rate: 1 }] };
  const d = play('me', ['h', 'i', 'j', 'k', 'a', 'x', 'y', 'b', 'c'].map((c) => (c === 'x' ? 'l' : c === 'y' ? 'm' : c)));
  const r = L.postbanRisk(d, heroes, { profile });
  assert.equal(r.hero.code, 'b');
  assert.match(r.reasons[0].text, /postbans it in 100%/);
});

test('first pick safety penalises heroes with many known counters', () => {
  const notes = { c: { tier: 'S' }, d: { tier: 'S' }, x1: { counters: ['c'] }, x2: { counters: ['c'] } };
  const s = L.suggestPicks(play('me', ['h', 'i', 'j', 'k']), heroes, { notes, deny: false });
  assert.equal(s[0].hero.code, 'd');
  assert.ok(s.find((r) => r.hero.code === 'c').reasons.some((r) => /2 known counters/.test(r.text)));
});

test('composition warnings from tags', () => {
  const notes = { a: { tags: ['aoe'] }, b: { tags: ['aoe'] }, c: { tags: ['aoe'] }, d: { tags: ['nuker'] }, x: { tags: ['debuffer'] }, y: { tags: ['debuffer', 'counter'] } };
  const w = L.compositionWarnings(['a', 'b', 'c', 'd'], ['x', 'y'], notes).map((x) => x.text);
  assert.ok(w.some((t) => /No cleanse/.test(t)));
  assert.ok(w.some((t) => /counter team/.test(t)));
  assert.ok(w.some((t) => /No sustain/.test(t)));
  assert.deepEqual(L.compositionWarnings(['a'], ['x'], null), []);
});

test('speeds from CR bar positions', () => {
  // my unit (speed 300) acts at 100%; enemy at 80% -> 240; my other (200) at 66.7%
  const r = L.speedsFromCR(
    [{ code: 'a', side: 'me', cr: 100 }, { code: 'b', side: 'me', cr: 66.7 }, { code: 'x', side: 'opp', cr: 80 }],
    new Map([['a', 300], ['b', 200]]),
  );
  const x = r.find((e) => e.code === 'x');
  assert.ok(Math.abs(x.speed - 240) < 1);
  assert.ok(x.min < 240 && x.max > 240);
  assert.deepEqual(L.speedsFromCR([{ code: 'x', side: 'opp', cr: 50 }], new Map()), []);
});
