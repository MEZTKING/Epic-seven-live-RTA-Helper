// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// My devices sync: a "PC" and a "phone" (two separate browsers = separate storage) share one cloud
// (a fake held by this test, standing in for Firebase). Gear + matches from the PC appear on the phone's pages;
// a match added on the phone reaches the PC; the Home card shows the state; a #sync= link connects a device.
const __path = require('path');
const __fs = require('fs');
const OUT = process.env.E7_OUT || __path.join(__dirname, 'out');
__fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, 'fixtures');
const { chromium, devices } = require('playwright');
const M = require('../../js/mysync.js');
(async () => {
  const cloud = M.memoryRemote();
  const b = await chromium.launch();
  const errs = [];
  const KEY = 'a'.repeat(36);
  async function device(opts, name) {
    const ctx = await b.newContext(opts);
    // the page's remote calls go to the shared fake cloud in this test
    await ctx.exposeBinding('cloudList', () => cloud.list());
    await ctx.exposeBinding('cloudGet', (_s, id, meta) => cloud.get(id, meta));
    await ctx.exposeBinding('cloudPut', (_s, id, value, meta) => cloud.put(id, value, meta));
    await ctx.addInitScript((key) => {
      localStorage.setItem('e7-mysync', localStorage.getItem('e7-mysync') || JSON.stringify({ key, config: null, enabled: true, sections: {}, changedAt: {} }));
      window.addEventListener('DOMContentLoaded', () => window.MySyncApp && window.MySyncApp._useRemote({ list: () => window.cloudList(), get: (i, m) => window.cloudGet(i, m), put: (i, v, m) => window.cloudPut(i, v, m) }));
    }, KEY);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
    p.on('dialog', (d) => d.accept());
    return p;
  }
  const pc = await device({ viewport: { width: 1280, height: 900 } }, 'pc');
  const phone = await device({ ...devices['iPhone 13'] }, 'phone');

  // PC: import gear.txt (gear + roster) and record a match
  await pc.goto(BASE + 'gear.html');
  await pc.setInputFiles('#gs-file', FX + '/gear3.txt');
  await pc.waitForTimeout(500);
  await pc.evaluate(() => { const s = JSON.parse(localStorage.getItem('rta-helper-v2')) || {}; s.matches = [{ id: 'pc1', date: '2026-11-12T10:00:00Z', result: 'win', source: 'manual', opponent: 'Rival', picks: { me: [], opp: [] } }]; s.notes = { c1001: { tier: 'S' } }; localStorage.setItem('rta-helper-v2', JSON.stringify(s)); });
  console.log('pc sync:', JSON.stringify(await pc.evaluate(() => window.MySyncApp.run())));
  console.log('cloud sections:', Object.keys(cloud.store.sections).length, '· gear chunks:', cloud.store.sections['gear-items'] && cloud.store.sections['gear-items'].n);

  // phone: open the Gear page -> gear arrives and the page shows it
  await phone.goto(BASE + 'gear.html');
  await phone.waitForTimeout(2500); // first pass runs 1.5 s after opening
  console.log('phone gear tiles:', await phone.$$eval('.gtile', (t) => t.length), '·', await phone.textContent('#gs-src'));
  await phone.screenshot({ path: OUT + '/mysync-phone-gear.png' });
  // phone: RTA page sees the PC's match; phone adds its own match
  await phone.goto(BASE + 'rta.html');
  await phone.waitForTimeout(2500);
  const phoneRta = await phone.evaluate(() => ({ matches: window.RTAApp.store.matches.map((m) => m.id), notes: Object.keys(window.RTAApp.store.notes) }));
  console.log('phone RTA store:', JSON.stringify(phoneRta));
  await phone.evaluate(() => { window.RTAApp.store.matches.unshift({ id: 'ph1', date: '2026-11-13T09:00:00Z', result: 'loss', source: 'manual', opponent: 'Other', picks: { me: [], opp: [] } }); window.RTAApp.save(); });
  await phone.evaluate(() => window.MySyncApp.run());
  // PC: next pass brings the phone's match in, and the open RTA page reloads it
  await pc.goto(BASE + 'rta.html');
  await pc.waitForTimeout(2500);
  console.log('pc RTA matches after phone added one:', JSON.stringify(await pc.evaluate(() => window.RTAApp.store.matches.map((m) => m.id))));
  // Home card on the phone
  await phone.goto(BASE + 'index.html');
  await phone.waitForTimeout(2500);
  console.log('phone home card:', (await phone.textContent('#mysync')).replace(/\s+/g, ' ').slice(0, 160));
  console.log('phone home no sideways scroll:', await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await phone.screenshot({ path: OUT + '/mysync-phone-home.png' });

  // joining with a link on a fresh device: state is saved and the key leaves the address bar
  const ctx3 = await b.newContext();
  const p3 = await ctx3.newPage();
  p3.on('dialog', (d) => d.accept());
  p3.on('pageerror', (e) => errs.push('new device: ' + e.message));
  const l = await pc.evaluate(() => window.MySync.link(location.origin + '/index.html', 'b'.repeat(36), { apiKey: 'k', projectId: 'demo', appId: 'a' }));
  await p3.goto(l);
  await p3.waitForTimeout(800);
  const joined = await p3.evaluate(() => ({ st: JSON.parse(localStorage.getItem('e7-mysync') || '{}'), url: location.href }));
  console.log('joined by link:', JSON.stringify({ enabled: joined.st.enabled, keyLen: (joined.st.key || '').length, project: joined.st.config && joined.st.config.projectId, keyStillInUrl: joined.url.includes('sync=') }));
  console.log('errors:', errs);
  await b.close();
})();
