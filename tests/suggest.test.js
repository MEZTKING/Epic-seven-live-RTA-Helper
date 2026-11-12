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
  const s = L.suggestPicks(d, heroes, { notes, useElement: false });
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
