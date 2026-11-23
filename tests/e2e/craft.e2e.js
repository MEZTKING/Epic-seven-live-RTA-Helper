// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: text reader)
// DEVLOG #96, the owner's Steel Workshop pictures (10 Wyvern weapons crafted):
//  1) the "Success" screen: rarity, set, main stat, the game's score and every substat of all 10, exactly; a mark under
//     each on the game (ENHANCE / EXTRACT); the inventory readers stay quiet
//  2) "Arrange" (ticked items dimmed): the same 10 (the reading just before is used)
//  3) the workshop itself and the inventory are not taken for it
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
const dataUrl = (f) => 'data:image/jpeg;base64,' + __fs.readFileSync(__path.join(FX, f)).toString('base64');
// read by eye from the picture: rarity, set, score, substats (all: level 85, Attack 100)
const TRUTH = [
  'H Speed 21 HealthPercent 7, Speed 3, EffectivenessPercent 4',
  'H Hit 21 EffectivenessPercent 8, HealthPercent 5, Health 169',
  'E Critical 21 CriticalHitChancePercent 3, Speed 2, HealthPercent 4, Health 161',
  'H Critical 16 Health 154, CriticalHitDamagePercent 4, EffectivenessPercent 4',
  'E Critical 25 CriticalHitChancePercent 4, EffectResistancePercent 6, CriticalHitDamagePercent 4, Health 196',
  'H Speed 22 EffectivenessPercent 5, EffectResistancePercent 8, AttackPercent 5',
  'H Hit 20 CriticalHitDamagePercent 4, Health 184, EffectResistancePercent 7',
  'R Hit 13 Health 152, AttackPercent 5',
  'R Critical 17 EffectivenessPercent 7',
  'H Critical 22 HealthPercent 7, Speed 3, CriticalHitDamagePercent 4',
];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
  const errs = [];
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push(e.message));
  await lv.goto(BASE + 'live.html');
  await lv.evaluate(() => {
    localStorage.removeItem('rta-gear-v1');
    window.__ov = {};
    const post = window.E7Overlay.post;
    window.E7Overlay.post = (l, i) => ((window.__ov[l] = i), post(l, i));
  });
  const show = (file) =>
    lv.evaluate(async (url) => {
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.src = url; });
      window.E7Vision._useSource(im);
      let got = null;
      const other = [];
      let left = false;
      const offs = [window.E7Bus.on('gear:craft', (d) => (got = d)), window.E7Bus.on('gear:craft-gone', () => (left = true)), window.E7Bus.on(['gear:grid', 'gear:item', 'gear:hero'], () => other.push(1))];
      for (let i = 0; i < 3; i++) await window.E7Vision.tick(true);
      await new Promise((r) => setTimeout(r, 300));
      offs.forEach((o) => o());
      return {
        note: window.E7Vision._readers.find((q) => q.id === 'craft-result').note,
        items: got ? got.tiles.map((t) => `${t.item.rank[0]} ${t.item.set.replace('Set', '') || '?'} ${t.item.gameScore} ${t.item.substats.map((s) => `${s.type} ${s.value}`).join(', ')}`) : null,
        mains: got ? [...new Set(got.tiles.map((t) => `lv${t.item.level} ${t.item.main.type} ${t.item.main.value}`))] : null,
        marks: (window.__ov['gear-craft'] || []).map((x) => x.title),
        other: other.length,
        left,
      };
    }, dataUrl(file));
  // 1)
  const r = await show('steel-workshop-result-wide.jpg');
  const right = (r.items || []).filter((x, i) => x === TRUTH[i]).length;
  console.log(`1) Success screen: ${right}/10 exactly · ${JSON.stringify(r.mains)} · inventory readers: ${r.other} events`);
  (r.items || []).forEach((x, i) => x !== TRUTH[i] && console.log(`   item ${i + 1}: read "${x}" / is "${TRUTH[i]}"`));
  console.log('   marks:', JSON.stringify(r.marks));
  // 2)
  const a = await show('steel-workshop-arrange-wide.jpg');
  console.log(`2) Arrange: ${(a.items || []).filter((x, i) => x === TRUTH[i]).length}/10 · ${a.note}`);
  // 3)
  for (const f of ['steel-workshop-wide.jpg', 'gear-view-full-wide.jpg']) {
    const o = await show(f);
    console.log(`3) ${f}: ${o.items ? 'READ (wrong)' : 'nothing'} · ${o.left ? 'marks taken off the game' : ''} · ${o.note}`);
  }
  console.log('errors:', errs);
  await b.close();
})();
