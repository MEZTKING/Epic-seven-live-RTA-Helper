// My devices sync (js/mysync.js): two "devices" (separate storages) and one cloud (memory remote).
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/mysync.js');

function storage(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), json: (k) => JSON.parse(m.get(k) || 'null') };
}
let clock = 0;
const now = () => new Date(Date.UTC(2026, 10, 13, 0, 0, clock++)).toISOString();
const sync = (dev, cloud, state, name) => M.syncOnce({ storage: dev, remote: cloud, state, device: name, now });

test('PC uploads, phone (empty) downloads; device-only things stay put', async () => {
  const cloud = M.memoryRemote();
  const pc = storage({ 'rta-helper-v2': { notes: { c1: { tier: 'S' } }, matches: [{ id: 'm1', date: '2026-11-01' }], auto: { regions: { a: 1 } }, draft: { id: 'pcdraft' } }, 'rta-gear-v1': { items: [{ id: 'g1' }], rules: { keepWss: 60 } } });
  const phone = storage({ 'rta-helper-v2': { draft: { id: 'phonedraft' }, auto: { regions: {} } } });
  const s1 = {};
  const s2 = {};
  const r1 = await sync(pc, cloud, s1, 'pc');
  assert.ok(r1.pushed.includes('rta-notes') && r1.pushed.includes('gear-items'));
  const r2 = await sync(phone, cloud, s2, 'phone');
  assert.ok(r2.pulled.includes('rta-notes') && r2.pulled.includes('gear-items'));
  assert.deepEqual(phone.json('rta-helper-v2').notes, { c1: { tier: 'S' } });
  assert.deepEqual(phone.json('rta-gear-v1').items, [{ id: 'g1' }]);
  assert.equal(phone.json('rta-helper-v2').draft.id, 'phonedraft'); // current draft is per device
  assert.deepEqual(phone.json('rta-helper-v2').auto.regions, {}); // calibration is per device
  // nothing changed -> nothing to do
  const r3 = await sync(pc, cloud, s1, 'pc');
  assert.deepEqual([r3.pushed, r3.pulled, r3.merged].flat(), []);
});

test('matches added on both devices and a delete on one are merged, not overwritten', async () => {
  const cloud = M.memoryRemote();
  const pc = storage({ 'rta-helper-v2': { matches: [{ id: 'a', date: '2026-11-01' }, { id: 'b', date: '2026-11-02' }] } });
  const phone = storage({});
  const s1 = {};
  const s2 = {};
  await sync(pc, cloud, s1, 'pc');
  await sync(phone, cloud, s2, 'phone');
  // phone adds c, PC adds d and deletes a
  const p = phone.json('rta-helper-v2');
  p.matches.unshift({ id: 'c', date: '2026-11-03' });
  phone.setItem('rta-helper-v2', JSON.stringify(p));
  const q = pc.json('rta-helper-v2');
  q.matches = q.matches.filter((m) => m.id !== 'a');
  q.matches.unshift({ id: 'd', date: '2026-11-04' });
  pc.setItem('rta-helper-v2', JSON.stringify(q));
  await sync(phone, cloud, s2, 'phone'); // phone uploads c
  const r = await sync(pc, cloud, s1, 'pc'); // PC merges
  assert.ok(r.merged.includes('rta-matches'));
  assert.deepEqual(pc.json('rta-helper-v2').matches.map((m) => m.id), ['d', 'c', 'b']);
  await sync(phone, cloud, s2, 'phone');
  assert.deepEqual(phone.json('rta-helper-v2').matches.map((m) => m.id), ['d', 'c', 'b']); // a stays deleted
});

test('notes changed on both: the newer change wins', async () => {
  const cloud = M.memoryRemote();
  const pc = storage({ 'rta-helper-v2': { notes: { x: 1 } } });
  const phone = storage({});
  const s1 = {};
  const s2 = {};
  await sync(pc, cloud, s1, 'pc');
  await sync(phone, cloud, s2, 'phone');
  pc.setItem('rta-helper-v2', JSON.stringify({ ...pc.json('rta-helper-v2'), notes: { x: 'pc' } }));
  await sync(pc, cloud, s1, 'pc'); // PC change uploaded first
  phone.setItem('rta-helper-v2', JSON.stringify({ ...phone.json('rta-helper-v2'), notes: { x: 'phone' } }));
  await sync(phone, cloud, s2, 'phone'); // phone noticed its change after the PC upload -> phone is newer -> wins
  await sync(pc, cloud, s1, 'pc');
  assert.deepEqual(pc.json('rta-helper-v2').notes, { x: 'phone' });
});

test('big gear lists are split into chunks and put back together', async () => {
  const cloud = M.memoryRemote();
  const items = Array.from({ length: 6000 }, (_, i) => ({ id: 'g' + i, set: 'SpeedSet', main: { type: 'Speed', value: 45 }, subs: [{ type: 'Attack', value: 33 }, { type: 'CriticalHitChancePercent', value: 12 }] }));
  const pc = storage({ 'rta-gear-v1': { items } });
  await sync(pc, cloud, {}, 'pc');
  assert.ok(cloud.store.sections['gear-items'].n >= 2, `chunks: ${cloud.store.sections['gear-items'].n}`);
  const phone = storage({});
  await sync(phone, cloud, {}, 'phone');
  assert.equal(phone.json('rta-gear-v1').items.length, 6000);
});

test('a half-written upload is skipped, not applied', async () => {
  const cloud = M.memoryRemote();
  await sync(storage({ 'rta-helper-v2': { notes: { a: 1 } } }), cloud, {}, 'pc');
  cloud.store.chunks['rta-notes~0'].hash = 'other'; // chunk from a different upload
  const phone = storage({});
  const r = await sync(phone, cloud, {}, 'phone');
  assert.ok(!r.pulled.includes('rta-notes'));
  assert.equal(phone.getItem('rta-helper-v2'), null);
});

test('sync links carry the key and Firebase config', () => {
  globalThis.btoa = globalThis.btoa || ((s) => Buffer.from(s, 'binary').toString('base64'));
  globalThis.atob = globalThis.atob || ((s) => Buffer.from(s, 'base64').toString('binary'));
  const key = M.newKey();
  assert.equal(key.length, 36);
  const l = M.link('https://x.github.io/app/index.html', key, { apiKey: 'k', projectId: 'p', appId: 'a' });
  assert.deepEqual(M.parseLink(l.split('#')[1]), { key, config: { apiKey: 'k', projectId: 'p', appId: 'a' } });
  assert.equal(M.parseLink('#g=guild'), null);
});

test('Firestore remote (fake SDK): private personal/{key} path, chunks, anonymous sign-in', async () => {
  const docs = new Map(); // path -> data
  const paths = new Set();
  const colRef = (path) => ({
    doc: (id) => docRef(`${path}/${id}`),
    get: async () => ({ docs: [...docs.entries()].filter(([p]) => p.startsWith(path + '/') && !p.slice(path.length + 1).includes('/')).map(([p, d]) => ({ id: p.split('/').pop(), data: () => d })) }),
  });
  const docRef = (path) => ({
    collection: (c) => colRef(`${path}/${c}`),
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    set: async (d) => {
      paths.add(path);
      docs.set(path, JSON.parse(JSON.stringify(d)));
    },
  });
  let signedIn = false;
  const app = { name: 'rta-demo', auth: () => ({ get currentUser() { return signedIn ? {} : null; }, signInAnonymously: async () => (signedIn = true) }), firestore: () => ({ collection: (c) => colRef(c) }) };
  const fb = { apps: [], initializeApp: () => app };
  globalThis.RTASync = require('../js/sync.js');
  const key = M.newKey();
  const remote = await M.firestoreRemote(key, { apiKey: 'k', projectId: 'demo', appId: 'a' }, { fb });
  assert.ok(signedIn);
  const big = { items: Array.from({ length: 6000 }, (_, i) => ({ id: 'g' + i, gear: 'Boots', rank: 'Epic', set: 'SpeedSet', level: 85, enhance: 15, main: { type: 'Speed', value: 45 }, subs: [{ type: 'AttackPercent', value: 12 }, { type: 'Speed', value: 4 }, { type: 'CriticalHitChancePercent', value: 9 }, { type: 'EffectivenessPercent', value: 6 }] })) }; // ~1.5 MB, like a real gear.txt
  const pc = storage({ 'rta-gear-v1': big, 'rta-helper-v2': { notes: { a: 1 } } });
  await M.syncOnce({ storage: pc, remote, state: {}, device: 'pc' });
  assert.ok([...paths].every((p) => p.startsWith(`personal/${key}/sections/`) || p.startsWith(`personal/${key}/chunks/`)), [...paths].join(','));
  assert.ok([...paths].some((p) => p.endsWith('/chunks/gear-items~1')), 'gear items split into chunks');
  const phone = storage({});
  await M.syncOnce({ storage: phone, remote, state: {}, device: 'phone' });
  assert.equal(phone.json('rta-gear-v1').items.length, 6000);
  assert.deepEqual(phone.json('rta-helper-v2').notes, { a: 1 });
});
