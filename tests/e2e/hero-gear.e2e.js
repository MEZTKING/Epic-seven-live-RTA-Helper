// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: text reader)
// DEVLOG #84: the hero equipment screen on the owner's pictures (Arbiter Vildred, Eligos, Rhianna and Luciella):
//  1) the hero's name, real stats and six items (enhance, level, set) read; the filter menu over it reads nothing
//  2) each slot linked to an item the app knows (a unique match), "? 2 alike" when two items look the same
//  3) the Gear page: "Now (seen in the game)" with the hero's real stats; "Try it on a hero" starts from them
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
const dataUrl = (f) => 'data:image/jpeg;base64,' + __fs.readFileSync(__path.join(FX, f)).toString('base64');
// the stats as the game shows them (read by eye)
const REAL = {
  'hero-gear-av-wide.jpg': 'Arbiter Vildred · 5015 897 8003 238 98 294 9 8 3',
  'hero-gear-eligos-wide.jpg': 'Eligos · 4043 1055 8674 239 100 350 7 0 3',
  'hero-gear-rhianna-wide.jpg': 'Rhianna and Luciella · 2733 912 9521 319 100 271 5 0 3',
};
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  const errs = [];
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  await lv.evaluate(() => {
    for (const k of ['rta-gear-v1', 'e7-gear-setbadges', 'e7-gear-arts']) localStorage.removeItem(k);
    window.__ov = {};
    const post = window.E7Overlay.post;
    window.E7Overlay.post = (l, i) => ((window.__ov[l] = i), post(l, i));
  });
  const show = (file) =>
    lv.evaluate(async (url) => {
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.src = url; });
      window.E7Vision._useSource(im);
      const ev = {};
      const offs = ['gear:hero', 'gear:hero-linked'].map((t) => window.E7Bus.on(t, (d) => (ev[t] = d)));
      for (let i = 0; i < 3; i++) await window.E7Vision.tick(true);
      await new Promise((r) => setTimeout(r, 200));
      offs.forEach((o) => o());
      const h = ev['gear:hero'];
      return {
        note: window.E7Vision._readers.find((q) => q.id === 'hero-gear').note,
        real: h && h.stats ? `${h.hero.name} · ${['atk', 'def', 'hp', 'spd', 'chc', 'chd', 'eff', 'efr', 'dac'].map((k) => h.stats[k]).join(' ')}` : h ? h.hero.name : null,
        slots: h ? h.slots.map((s) => `${s.gear} +${s.enhance} lv${s.level}${s.set ? ' ' + s.set.replace('Set', '') : ''}`) : null,
        linked: ev['gear:hero-linked'] || null,
        marks: (window.__ov['gear-hero'] || []).map((x) => x.title),
      };
    }, dataUrl(file));
  // 1)
  for (const f of Object.keys(REAL)) {
    const r = await show(f);
    console.log(`1) ${f}: stats ${r.real === REAL[f] ? 'exactly right' : 'read "' + r.real + '" / is "' + REAL[f] + '"'}`);
    console.log('   ', r.slots.join(' | '));
  }
  const fl = await show('hero-gear-filter-wide.jpg');
  console.log('   the filter menu over it:', fl.note, '· read:', !!fl.real);
  // 2) items like Rhianna's: her weapon (+15, level 90, speed) once, her boots twice (two alike)
  await lv.evaluate(() => {
    const GS = window.GearStore;
    const gs = GS.load();
    const mk = (gear, main, lvl, set) => ({ gear, set, rank: 'Epic', level: lvl, enhance: 15, main, substats: [{ type: 'Speed', value: 19 }, { type: 'AttackPercent', value: 8 }, { type: 'CriticalHitChancePercent', value: 10 }, { type: 'CriticalHitDamagePercent', value: 6 }], source: 'screen' });
    GS.addScanned(gs, mk('Weapon', { type: 'Attack', value: 525 }, 90, 'SpeedSet'), 'k-weapon');
    GS.addScanned(gs, mk('Boots', { type: 'Speed', value: 45 }, 90, 'SpeedSet'), 'k-boots1');
    GS.addScanned(gs, { ...mk('Boots', { type: 'Speed', value: 45 }, 90, 'SpeedSet'), substats: [{ type: 'HealthPercent', value: 20 }, { type: 'AttackPercent', value: 8 }, { type: 'CriticalHitChancePercent', value: 10 }, { type: 'CriticalHitDamagePercent', value: 6 }] }, 'k-boots2');
    GS.save(gs);
  });
  await show('hero-gear-eligos-wide.jpg');
  const rh = await show('hero-gear-rhianna-wide.jpg');
  console.log('2) Rhianna again:', JSON.stringify(rh.linked), '· marks:', JSON.stringify(rh.marks));
  const store = await lv.evaluate(() => { const gs = window.GearStore.load(); const sn = gs.heroSeen; return { heroes: Object.values(sn).map((h) => h.name), weapon: gs.scanned.find((x) => x.key === 'k-weapon').wornBy, boots: gs.scanned.filter((x) => x.gear === 'Boots').map((x) => x.wornBy || '-') }; });
  console.log('   saved:', JSON.stringify(store));
  // 3) the Gear page
  const g = await ctx.newPage();
  g.on('pageerror', (e) => errs.push('gear: ' + e.message));
  await g.goto(BASE + 'gear.html');
  await g.waitForTimeout(500);
  await g.fill('#ps-hero', 'Rhianna and Luciella');
  await g.dispatchEvent('#ps-hero', 'input');
  await g.waitForTimeout(200);
  console.log('3) presets, now:', (await g.textContent('#ps-out')).replace(/\s+/g, ' ').trim().slice(0, 260));
  const boots = await g.evaluate(() => window.GearApp.gs.scanned.find((x) => x.key === 'k-boots2').id);
  await g.selectOption('#f-view', 'cards');
  await g.click(`#gs-cards [data-item="${boots}"]`);
  await g.waitForTimeout(200);
  await g.fill('#gs-detail [data-try="hero"]', 'Rhianna and Luciella');
  await g.dispatchEvent('#gs-detail [data-try="hero"]', 'change');
  await g.waitForTimeout(300);
  console.log('   try the other boots on her:', (await g.textContent('#gs-detail .tryon')).replace(/\s+/g, ' ').trim().slice(0, 420));
  console.log('errors:', errs);
  await b.close();
})();
