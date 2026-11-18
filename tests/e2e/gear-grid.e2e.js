// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: text reader)
// DEVLOG #77: the inventory in the game's "Full" display format, read a whole screen at once (owner's pictures):
//  1) 16 weapons at +15 (most worn by heroes): every main stat, substat, level, worn / locked, set from known badges
//  2) 16 weapons from +0 to +15 (the selected tile has a gold frame)
//  3) the other formats (Standard, Equipment Score) and the filter menu read nothing
//  4) labels on the overlay, one per tile (WORN for items on a hero); all saved once
//  5) a set badge not known yet is learned from the clicked item's details panel
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
const dataUrl = (f) => 'data:image/jpeg;base64,' + __fs.readFileSync(__path.join(FX, f)).toString('base64');
// what the tiles show (read by eye from the pictures): main | substats
const TRUTH = {
  'gear-view-full2-wide.jpg': [
    'Atk 525 | Spd 13, CC% 17, CD% 16, ER% 9', 'Atk 525 | Spd 4, Eff% 26, HP% 26, ER% 18', 'Atk 515 | Atk% 32, Spd 5, CC% 12, CD% 15', 'Atk 525 | CC% 6, HP% 26, Eff% 8, Spd 17',
    'Atk 515 | HP% 36, Spd 5, ER% 18, Eff% 14', 'Atk 525 | HP% 33, CD% 15, ER% 8, CC% 12', 'Atk 515 | Atk% 33, HP% 9, CC% 16, CD% 8', 'Atk 515 | HP% 25, Atk% 16, Spd 13, CC% 6',
    'Atk 515 | Atk% 9, Spd 13, CC% 12, CD% 20', 'Atk 515 | Atk% 23, Spd 9, CC% 17, HP% 9', 'Atk 525 | CD% 22, Atk% 14, Spd 14, Eff% 9', 'Atk 515 | Atk% 23, Spd 8, CC% 12, CD% 16',
    'Atk 515 | Atk% 27, Spd 5, CC% 10, CD% 20', 'Atk 515 | HP% 27, Atk% 15, Spd 8, CC% 11', 'Atk 515 | HP% 32, Atk% 15, Spd 5, CC% 12', 'Atk 525 | Atk% 23, CC% 6, Spd 13, HP% 17',
  ],
  'gear-view-full-wide.jpg': [
    'Atk 220 | Atk% 6, Spd 4, ER% 16, CD% 13', 'Atk 500 | Atk% 7, HP% 22, Spd 4, ER% 18', 'Atk 500 | Spd 9, Atk% 16, ER% 4, HP% 20', 'Atk 500 | ER% 8, HP% 23, Eff% 24, HP 184',
    'Atk 100 | HP% 4, CD% 5, CC% 3, ER% 6', 'Atk 100 | Spd 3, Eff% 6, CC% 4, HP 170', 'Atk 280 | ER% 21, Spd 5, HP% 6, CC% 3', 'Atk 100 | Eff% 6, Spd 2, Atk% 8, ER% 8',
    'Atk 100 | Eff% 7, ER% 5, CC% 5, CD% 7', 'Atk 100 | CD% 6, CC% 4, Atk% 8, Eff% 8', 'Atk 100 | CC% 5, Spd 3, HP% 4, Atk% 6', 'Atk 100 | CD% 7, Atk% 6, ER% 4, HP% 5',
    'Atk 220 | HP% 4, Spd 4, Atk% 15, Eff% 9', 'Atk 100 | CC% 4, CD% 5, Eff% 7, HP% 7', 'Atk 100 | HP% 5, CC% 5, Spd 2, CD% 5', 'Atk 100 | Spd 2, ER% 5, Eff% 7, HP% 4',
  ],
};
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
  const errs = [];
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  await lv.evaluate(() => {
    localStorage.removeItem('e7-gearscan-boxes');
    localStorage.removeItem('e7-gear-setbadges');
    localStorage.removeItem('rta-gear-v1');
    window.__ov = {};
    const post = window.E7Overlay.post;
    window.E7Overlay.post = (layer, items) => ((window.__ov[layer] = items), post(layer, items));
  });
  const show = (file) =>
    lv.evaluate(async (url) => {
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.src = url; });
      window.E7Vision._useSource(im);
      const ev = {};
      const offs = ['gear:grid', 'gear:grid-gone', 'gear:grid-judged', 'gear:item'].map((t) => window.E7Bus.on(t, (d) => (ev[t] = d)));
      for (let i = 0; i < 3; i++) await window.E7Vision.tick(true);
      await new Promise((r) => setTimeout(r, 150));
      offs.forEach((o) => o());
      const ab = (t) => t.replace('Percent', '%').replace('CriticalHitChance', 'CC').replace('CriticalHitDamage', 'CD').replace('Effectiveness', 'Eff').replace('EffectResistance', 'ER').replace('Attack', 'Atk').replace('Health', 'HP').replace('Speed', 'Spd').replace('Defense', 'Def');
      const g = ev['gear:grid'];
      return {
        note: window.E7Vision._readers.find((q) => q.id === 'gear-grid').note,
        slot: g && g.slot,
        stats: g ? g.tiles.map((t) => `${ab(t.item.main.type)} ${t.item.main.value} | ${t.item.substats.map((s) => ab(s.type) + ' ' + s.value).join(', ')}`) : null,
        extra: g ? g.tiles.map((t) => `+${t.item.enhance} lv${t.item.level} ${t.item.rank} ${t.item.set || '-'}${t.worn ? ' worn' : ''}${t.locked ? ' locked' : ''}${t.selected ? ' SELECTED' : ''}`) : null,
        gone: !!ev['gear:grid-gone'],
        judged: ev['gear:grid-judged'] || null,
        panel: ev['gear:item'] ? `${ev['gear:item'].item.gear} ${ev['gear:item'].item.set}` : null,
      };
    }, dataUrl(file));
  const check = (file, r) => {
    const want = TRUTH[file];
    const got = r.stats || [];
    const bad = want.map((w, i) => (got[i] === w ? null : `#${i}: read "${got[i]}" / is "${w}"`)).filter(Boolean);
    return `${got.length} tiles, ${want.length - bad.length}/${want.length} exactly right${bad.length ? ' · ' + bad.join(' · ') : ''}`;
  };
  // 1)
  const a = await show('gear-view-full2-wide.jpg');
  console.log('1) Full, +15 weapons:', a.slot, '·', check('gear-view-full2-wide.jpg', a));
  console.log('   ', a.extra.join(' | '));
  console.log('    judged:', JSON.stringify(a.judged), '· labels:', JSON.stringify(await lv.evaluate(() => (window.__ov['gear-grid'] || []).map((x) => `${x.level}:${x.title}`))));
  // 2)
  const c = await show('gear-view-full-wide.jpg');
  console.log('2) Full, +0..+15 weapons:', c.slot, '·', check('gear-view-full-wide.jpg', c), '· panel read too:', c.panel);
  console.log('   ', c.extra.join(' | '));
  console.log('    labels:', JSON.stringify(await lv.evaluate(() => (window.__ov['gear-grid'] || []).map((x) => x.title))));
  // 3)
  for (const f of ['gear-view-score-top-wide.jpg', 'gear-weapon-wide.jpg', 'gear-view-menu2-wide.jpg']) {
    const r = await show(f);
    console.log('3)', f, '→', r.note, '· tiles', r.stats ? r.stats.length : 0, '· labels taken off', r.gone);
  }
  // 4) saved once
  await show('gear-view-full2-wide.jpg');
  console.log('4) saved from the screen:', await lv.evaluate(() => { const s = window.GearStore.load().scanned; return `${s.length} items, ${new Set(s.map((x) => x.key)).size} different (32 tiles + the details panels' items)`; }));
  // 5) learning: forget the built-in badges; the clicked Bow of Agony (panel: Weakening) teaches its badge
  await lv.evaluate(() => { window.__seed = window.E7GearSetSeed; window.E7GearSetSeed = []; localStorage.removeItem('e7-gear-setbadges'); });
  await show('gear-view-score-top-wide.jpg');
  const l1 = await show('gear-view-full-wide.jpg');
  const learnt = await lv.evaluate(() => JSON.parse(localStorage.getItem('e7-gear-setbadges') || '[]').map((e) => e.set));
  await show('gear-view-score-top-wide.jpg');
  const l2 = await show('gear-view-full-wide.jpg');
  console.log('5) learned from the panel:', JSON.stringify(learnt), '· selected tile now:', l1.extra[0], '· next time Weakening tiles:', l2.extra.filter((x) => /Weakening/.test(x)).length);
  await lv.evaluate(() => { window.E7GearSetSeed = window.__seed; });
  console.log('errors:', errs);
  await b.close();
})();
