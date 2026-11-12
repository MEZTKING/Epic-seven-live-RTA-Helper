const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/gear.js');
const Learn = require('../js/learn.js');
const Logic = require('../js/logic.js');
const Tune = require('../js/tune.js');
const snap = require('../js/sources/fribbels-data.js');
const official = require('../js/sources/official-heroes.js').heroes;

const item = (set, gear, main, subs = []) => ({ set, gear, main, substats: subs, ingameEquippedId: '111' });

test('Fribbels gear: items linked to hero, speed = base x set bonus + flat', () => {
  const data = {
    heroes: [{ id: 111, name: 'Arbiter Vildred', stars: 6 }, { id: 222, name: 'Ravi', stars: 6 }],
    items: [
      item('SpeedSet', 'Weapon', { type: 'Attack', value: 500 }, [{ type: 'Speed', value: 18 }]),
      item('SpeedSet', 'Helmet', { type: 'Health', value: 2700 }, [{ type: 'Speed', value: 16 }]),
      item('SpeedSet', 'Armor', { type: 'Defense', value: 310 }, [{ type: 'Speed', value: 14 }]),
      item('SpeedSet', 'Boots', { type: 'Speed', value: 45 }),
      item('CriticalSet', 'Necklace', { type: 'CriticalHitChancePercent', value: 60 }, [{ type: 'Speed', value: 4 }]),
      item('CriticalSet', 'Ring', { type: 'AttackPercent', value: 65 }),
      { ...item('AttackSet', 'Ring', { type: 'Speed', value: 99 }), ingameEquippedId: '0' }, // unequipped: ignored
    ],
  };
  const builds = G.extractBuilds(data, official);
  const av = builds.c2007;
  assert.equal(av.items.length, 6);
  const b = G.computeBuild('c2007', av, snap.stats);
  // base 116 * 1.25 = 145 + flat (18+16+14+45+4 = 97) = 242
  assert.equal(b.speed, 242);
  assert.deepEqual(b.sets.sort(), ['Critical', 'Speed']);
  assert.equal(G.computeBuild('c1019', builds.c1019, snap.stats).speed, 102); // Ravi, no gear
  assert.match(G.computeBuild('c1019', builds.c1019, snap.stats).note, /0\/6/);
});

test('scouting summary: per hero and per player', () => {
  const s = Learn.scoutSummary([
    { player: 'Rival', code: 'x', speed: 280, sets: ['Speed', 'Critical'], artifact: 'Alexa', at: '2026-01-01' },
    { player: 'Rival', code: 'x', speed: 290, sets: ['Critical', 'Speed'], at: '2026-01-02' },
    { player: 'Other', code: 'x', speed: 250 },
  ]);
  assert.equal(s.all.get('x').speed, 280);
  assert.equal(s.all.get('x').low, 250);
  assert.equal(s.byPlayer.get('rival').get('x').speed, 285);
  assert.deepEqual(s.byPlayer.get('rival').get('x').sets[0], { name: 'Critical + Speed', n: 2 });
});

test('session stats: today, streak, points', () => {
  const now = new Date('2026-03-10T20:00:00');
  const ms = [
    { date: '2026-03-09T10:00:00', result: 'win', points: 2000 },
    { date: '2026-03-10T10:00:00', result: 'loss', points: 1985 },
    { date: '2026-03-10T11:00:00', result: 'loss' },
    { date: '2026-03-10T12:00:00', result: 'loss', points: 1955 },
  ];
  const s = Learn.sessionStats(ms, now);
  assert.deepEqual(s.today, { games: 3, wins: 0 });
  assert.deepEqual(s.streak, { result: 'loss', n: 3 });
  assert.equal(s.points.length, 3);
});

test('suggestion follow stats', () => {
  const log = (n) => Array.from({ length: 5 }, (_, i) => ({ chosen: 'h' + i, top: i < n ? ['h' + i] : ['z'] }));
  const r = Learn.suggestionFollow([{ result: 'win', suggestLog: log(4) }, { result: 'loss', suggestLog: log(1) }, { result: 'win' }]);
  assert.equal(r.picks, 10);
  assert.equal(r.followed, 5);
  assert.deepEqual(r.mostly, { games: 1, wins: 1 });
  assert.deepEqual(r.rarely, { games: 1, wins: 0 });
});

test('logistic fit finds the predictive feature', () => {
  const X = [];
  const y = [];
  for (let i = 0; i < 200; i++) {
    const a = Math.sin(i * 1.7) * 2;
    const b = Math.cos(i * 3.1) * 2;
    X.push([a, b]);
    y.push(a > 0 ? 1 : 0); // only feature 0 matters
  }
  const { w } = Tune.fitLogistic(X, y);
  assert.ok(w[0] > 1 && Math.abs(w[1]) < 0.5, JSON.stringify(w));
});

test('tuneWeights: trusts notes that predicted wins, distrusts element when it did not', () => {
  const H = (code, element) => ({ code, name: code, element, role: 'warrior' });
  const heroes = [H('a', 'fire'), H('b', 'fire'), H('x', 'wind'), H('y', 'wind')];
  const byCode = new Map(heroes.map((h) => [h.code, h]));
  // notes: a is tier S. Element: fire beats earth(wind) always for my side when I play a/b vs x/y.
  // I win exactly when I have 'a' -> notes predictive; element is the same in all matches -> uninformative.
  const ms = [];
  for (let i = 0; i < 30; i++) ms.push(i % 2 ? { result: 'win', myPicks: ['a'], oppPicks: ['x'] } : { result: 'loss', myPicks: ['b'], oppPicks: ['y'] });
  const r = Tune.tuneWeights(ms, byCode, { notes: { a: { tier: 'S' } }, useElement: true }, Learn, Logic, { groups: ['my notes', 'game rule'] });
  assert.ok(r.ok);
  assert.ok(r.weights['my notes'] > r.weights['game rule'], JSON.stringify(r.weights));
  assert.ok(r.accuracyAfter >= r.accuracyBefore);
  assert.equal(Tune.tuneWeights(ms.slice(0, 5), byCode, {}, Learn, Logic).ok, false);
});
