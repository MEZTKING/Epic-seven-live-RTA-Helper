// Per-match record (js/matchtrace.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/matchtrace.js');

function mem() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('events per match, repeats collapsed, slots snapshot, newest first', () => {
  const t = T.create(mem());
  t.event('d1', 'match found');
  t.event('d1', 'waiting for pre-bans');
  t.event('d1', 'waiting for pre-bans');
  t.slots('d1', { 'me-preban-0': { guess: 'Stark', score: 0.91, sure: true } });
  t.event('d2', 'match start');
  const d1 = t.get('d1');
  assert.deepEqual(d1.events.map((e) => [e.text, e.n || 1]), [['match found', 1], ['waiting for pre-bans', 2]]);
  assert.equal(d1.slots['me-preban-0'].guess, 'Stark');
  assert.equal(t.list().length, 2);
  t.event(null, 'ignored');
  assert.equal(t.list().length, 2);
});

test('only the newest matches are kept', () => {
  const st = mem();
  const t = T.create(st);
  for (let i = 0; i < T.MAX + 5; i++) {
    const all = JSON.parse(st.getItem(T.KEY) || '{}');
    all['m' + i] = { startedAt: new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString(), events: [], slots: {} };
    st.setItem(T.KEY, JSON.stringify(all));
  }
  t.event('m' + (T.MAX + 4), 'last one');
  const ids = t.list().map((x) => x.id);
  assert.equal(ids.length, T.MAX);
  assert.ok(ids.includes('m' + (T.MAX + 4)) && !ids.includes('m0'));
});
