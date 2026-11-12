const test = require('node:test');
const assert = require('node:assert/strict');
const Learn = require('../js/learn.js');
const R = require('../js/roster.js');
const snapshot = require('../js/sources/official-heroes.js');

test('postbanned heroes are excluded from win/matchup stats but counted as picks', () => {
  const s = Learn.buildStats([{ result: 'win', myPicks: ['a', 'b'], oppPicks: ['x', 'y'], iBanned: 'x', theyBanned: 'b' }]);
  assert.equal(s.hero.get('b').pickedByMe, 1);
  assert.equal(s.hero.get('b').mine.games, 0);
  assert.equal(s.hero.get('x').postbanned, 1);
  assert.ok(Learn.matchupOf(s, 'a', 'y'));
  assert.equal(Learn.matchupOf(s, 'a', 'x'), null);
  assert.equal(Learn.matchupOf(s, 'y', 'a').raw, 0);
});

test('smoothing pulls small samples toward 50%', () => {
  assert.equal(Learn.smoothed(1, 1), 3 / 5);
  assert.ok(Learn.smoothed(90, 100) > 0.85);
});

test('top combos and preset records', () => {
  const ms = [
    { result: 'win', myPicks: ['a', 'b', 'c'], oppPicks: [] },
    { result: 'win', myPicks: ['a', 'b', 'd'], oppPicks: [] },
    { result: 'win', myPicks: ['a', 'b'], oppPicks: [] },
    { result: 'loss', myPicks: ['c', 'd'], oppPicks: [] },
  ];
  const top = Learn.topCombos(ms, { size: 2, minGames: 3 });
  assert.deepEqual(top[0].heroes, ['a', 'b']);
  assert.deepEqual(Learn.presetRecord(ms, ['a', 'b']), { games: 3, wins: 3 });
});

test('official snapshot: codes unique, game element/class codes', () => {
  assert.ok(snapshot.heroes.length > 300);
  const codes = new Set(snapshot.heroes.map((h) => h.code));
  assert.equal(codes.size, snapshot.heroes.length);
  for (const h of snapshot.heroes) {
    assert.ok(R.ELEMENTS.includes(h.element), h.name);
    assert.ok(R.ROLES.includes(h.role), h.name);
    assert.equal(h.source, 'official');
  }
  const av = snapshot.heroes.find((h) => h.name === 'Arbiter Vildred');
  assert.equal(av.role, 'assassin');
});

test('Fribbels gear.txt import matches names, keeps best stars, reports unknowns', () => {
  const file = JSON.stringify({
    items: [{}, {}],
    heroes: [{ name: 'Arbiter Vildred', stars: 6 }, { name: 'arbiter  vildred', stars: 5 }, { name: 'Landy', stars: 6 }, { name: 'Not A Hero' }],
  });
  const r = R.parseFribbels(file, snapshot.heroes);
  assert.deepEqual(r.heroes.map((h) => [h.name, h.stars]), [['Arbiter Vildred', 6], ['Landy', 6]]);
  assert.deepEqual(r.unmatched, ['Not A Hero']);
  assert.equal(r.itemCount, 2);
  assert.throws(() => R.parseFribbels('nope', snapshot.heroes), /not valid JSON/);
});

test('CSV match import', () => {
  const csv = 'result,opponent,first_pick,my_picks,opp_picks,they_banned\n' +
    'win,Rival,opp,Landy|Ravi,"Arbiter Vildred;Unknown Guy",Ravi\n';
  const r = R.parseMatchCsv(csv, snapshot.heroes);
  assert.equal(r.matches.length, 1);
  const m = r.matches[0];
  assert.equal(m.firstPick, 'opp');
  assert.equal(m.myPicks.length, 2);
  assert.equal(m.theyBanned, m.myPicks[1]);
  assert.deepEqual(r.unknown, ['Unknown Guy']);
});

test('epic7x hero page addresses', () => {
  assert.equal(R.epic7xUrl('Seaside Bellona'), 'https://epic7x.com/character/seaside-bellona/');
  assert.equal(R.epic7xUrl('Baal & Sezan'), 'https://epic7x.com/character/baal-and-sezan/');
  assert.equal(R.epic7xUrl('ae-KARINA'), 'https://epic7x.com/character/ae-karina/');
  assert.equal(R.epic7xUrl("Archdemon's Shadow"), 'https://epic7x.com/character/archdemons-shadow/'); // checked against the live site
});

test('tags from several sources stay labelled', () => {
  const t = R.tagSources({ 'my notes': ['aoe', 'nuker'], guild: ['nuker', 'defense break'] });
  assert.deepEqual(t[0], { tag: 'nuker', sources: ['my notes', 'guild'] });
  assert.equal(t.length, 3);
  assert.deepEqual(R.tagSources({}), []);
});
