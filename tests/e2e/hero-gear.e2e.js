// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: text reader)
// DEVLOG #84: the hero equipment screen on the owner's pictures (Arbiter Vildred, Eligos, Rhianna and Luciella):
//  1) the hero's name, real stats and six items (enhance, level, set) read; the filter menu over it reads nothing
//  2) each slot linked to an item the app knows (a unique match), "? 2 alike" when two items look the same
//  3) the Gear page: "Now (seen in the game)" with the hero's real stats; "Try it on a hero" starts from them
//  5) gear.txt with design codes (DEVLOG #88): slots linked to it, sets from it, badges learned, item windows linked
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
  // 1b) DEVLOG #86: the item windows opened from Rhianna's screen: the exact items, linked to her
  const pop = (f) => lv.evaluate(async (url) => {
    const im = new Image();
    await new Promise((r) => { im.onload = r; im.src = url; });
    window.E7Vision._useSource(im);
    let ev = null;
    const off = window.E7Bus.on('gear:item', (d) => (ev = d));
    for (let i = 0; i < 3; i++) await window.E7Vision.tick(true);
    off();
    const i = ev && ev.item;
    return i ? `${i.rank} ${i.gear} +${i.enhance} lv${i.level} ${i.set} "${i.name}" · ${i.main.type} ${i.main.value} · ${i.substats.map((x) => x.type + ' ' + x.value).join(', ')} · game score ${i.gameScore} · on ${ev.wornBy}` : null;
  }, dataUrl(f));
  await show('hero-gear-rhianna-wide.jpg');
  console.log('1b) necklace window:', await pop('hero-gear-popup-necklace-wide.jpg'));
  console.log('    weapon window:', await pop('hero-gear-popup-weapon-wide.jpg'));
  console.log('    the artifact window reads nothing:', (await pop('hero-gear-artifact-wide.jpg')) === null);
  const back = await show('hero-gear-rhianna-wide.jpg');
  console.log('    her screen again:', JSON.stringify(back.linked), '·', JSON.stringify(back.marks));
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
  // 4) DEVLOG #86: the heroes you are gearing: suggestions only think of them
  await g.fill('#pr-hero', 'Rhianna and Luciella');
  await g.click('#pr-add');
  await g.waitForTimeout(200);
  console.log('4) gearing list:', (await g.textContent('#pr-list')).replace(/\s+/g, ' ').trim(), '· heroes suggestions think of:', JSON.stringify(await g.evaluate(() => window.GearApp.gs.priority)), await g.evaluate(() => { const S = window.RTAGearSort; const gs = window.GearApp.gs; return S.evaluateAll(window.GearStore.allItems(gs), window.RTASources.allHeroes, gs.overrides, gs.rules, { only: gs.priority }).profiles.map((p) => p.code).join(','); }));
  await g.click('#pr-clear');
  await g.waitForTimeout(100);
  console.log('   cleared:', (await g.textContent('#pr-list')).trim());
  // DEVLOG #90: heroes you don't gear: never a target (and not on both lists)
  await g.fill('#sk-hero', 'Rhianna and Luciella');
  await g.click('#sk-add');
  await g.waitForTimeout(200);
  console.log('   left out:', (await g.textContent('#sk-list')).replace(/\s+/g, ' ').trim(), '· heroes suggestions think of:', await g.evaluate(() => { const S = window.RTAGearSort; const gs = window.GearApp.gs; return S.evaluateAll(window.GearStore.allItems(gs), window.RTASources.allHeroes, gs.overrides, gs.rules, { only: gs.priority, skip: gs.skip }).profiles.map((p) => p.code).join(',') || '(none)'; }));
  await g.click('#pr-hero');
  await g.fill('#pr-hero', 'Rhianna and Luciella');
  await g.click('#pr-add');
  await g.waitForTimeout(200);
  console.log('   then added to the gearing list: left out', JSON.stringify(await g.evaluate(() => window.GearApp.gs.skip)), '· gearing', JSON.stringify(await g.evaluate(() => window.GearApp.gs.priority)));
  await g.click('#pr-clear');
  await g.waitForTimeout(100);
  // 5) DEVLOG #88: gear.txt from the auto importer (design codes, no names; tests/e2e/fixtures/gear-codes.txt: the
  // owner's items of these heroes, ids replaced): each slot is the item gear.txt has on that hero; sets come from it
  // (and the badges are learned: Eligos' Critical badges then read on Arbiter Vildred's screen without the file)
  await lv.evaluate(() => { localStorage.removeItem('rta-gear-v1'); localStorage.removeItem('e7-gear-setbadges-hero'); });
  await g.reload();
  await g.waitForTimeout(400);
  await g.setInputFiles('#gs-file', __path.join(__dirname, 'fixtures', 'gear-codes.txt'));
  await g.waitForTimeout(500);
  console.log('5) gear.txt:', await g.evaluate(() => { const it = window.GearApp.gs.items; return `${it.length} items, ${it.filter((x) => x.design).length} with a design code, ${it.filter((x) => x.equipped).length} on heroes`; }));
  for (const f of ['hero-gear-eligos-wide.jpg', 'hero-gear-av-wide.jpg', 'hero-gear-rhianna-wide.jpg']) {
    const r = await show(f);
    console.log(`   ${f}:`, r.slots.join(' | '), '·', JSON.stringify(r.linked));
  }
  console.log('   badges learned on the hero screen:', await lv.evaluate(() => JSON.stringify((JSON.parse(localStorage.getItem('e7-gear-setbadges-hero') || '[]')).map((b) => b.set))));
  // the item windows: linked to their gear.txt item, the design learns its code
  await pop('hero-gear-popup-necklace-wide.jpg');
  // DEVLOG #91: the card on the game says who wears it (gear.txt), not "upgrade for" heroes
  console.log('   card on the game:', await lv.evaluate(() => { const c = (window.__ov.gear || [])[0]; return c ? [c.title, ...c.lines].join(' / ') : null; }));
  await pop('hero-gear-popup-weapon-wide.jpg');
  console.log('   item windows linked to gear.txt:', await lv.evaluate(() => JSON.stringify(window.GearStore.load().scanned.filter((x) => x.fileId).map((x) => `${x.gear} → ${x.fileId}`))), '· design codes learned:', await lv.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('e7-gear-arts') || '[]').flatMap((a) => Object.keys(a.codes || {})).sort())));
  console.log('   counted once in suggestions:', await lv.evaluate(() => { const gs = window.GearStore.load(); return `${window.GearStore.allItems(gs).length} of ${gs.items.length} + ${gs.scanned.length}`; }));
  // the Gear page: a gear.txt item gets the picture of its design code (here: a design seen on Eligos' boots, given a
  // picture as the inventory would), the necklace read in its window shows that reading's own picture
  await lv.evaluate(async () => {
    const arts = JSON.parse(localStorage.getItem('e7-gear-arts') || '[]');
    const boots = arts.find((a) => a.codes && a.codes.eal85b_u);
    const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    await window.E7GearPics.put('art:' + boots.id, { icon: px, from: 'grid', at: 1 });
    const neck = window.GearStore.load().scanned.find((x) => x.fileId === 'f23');
    await window.E7GearPics.put(neck.id, { icon: px, from: 'hero-window', at: 1 });
  });
  await g.reload();
  await g.waitForTimeout(600);
  await g.selectOption('#f-view', 'cards');
  await g.waitForTimeout(300);
  const kind = (id) => g.evaluate((id) => { const t = document.querySelector(`#gs-cards [data-item="${id}"] .gt-icon`); return t ? (t.classList.contains('gt-design') ? 'design picture' : t.classList.contains('gt-pic') ? 'own picture' : 'drawn art') : 'not shown'; }, id);
  const bootIds = await g.evaluate(() => window.GearApp.gs.items.filter((x) => x.design === 'eal85b_u').map((x) => x.id));
  console.log('   Gear page: boots with code eal85b_u:', JSON.stringify(await Promise.all(bootIds.map(kind))), '· the necklace (f23):', await kind('f23'), '· an item with an unseen code:', await kind(await g.evaluate(() => window.GearApp.gs.items.find((x) => !x.equipped).id)));
  // without gear.txt: the badges learned from it still read the sets
  await lv.evaluate(() => { const gs = window.GearStore.load(); gs.items = []; window.GearStore.save(gs); });
  const av = await show('hero-gear-av-wide.jpg');
  console.log('   without gear.txt, Arbiter Vildred:', av.slots.join(' | '));
  console.log('errors:', errs);
  await b.close();
})();
