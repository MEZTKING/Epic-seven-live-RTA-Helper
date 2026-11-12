// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh   (needs internet: official portraits)
// The face matcher (js/faces.js) on a REAL Steam screenshot: the pre-ban picker grid (tests/fixtures/screens).
//  - the 15 faces confirmed by eye (same artwork as the official portrait) must be named confidently and correctly;
//  - no other face may be named confidently (the owner confirmed several old guesses were wrong; being unsure is fine).
const __path = require('path');
const __fs = require('fs');
const OUT = process.env.E7_OUT || __path.join(__dirname, 'out');
__fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const { chromium } = require('playwright');
const KNOWN = {
  '2,2': 'Swift Flagbearer Sigret', '2,3': 'School Nurse Yulha', '2,4': 'Saria', '2,6': 'Stark', '2,7': 'Frieren', '2,9': 'Lady of the Scales',
  '3,0': 'Genesis Ras', '3,1': 'Aram', '3,2': 'Witch of the Mere Tenebria', '3,3': 'Argent Waves Hwayoung', '3,5': 'Robin', '3,6': 'Rinak',
  '3,7': 'Boss Arunka', '3,8': 'Guard Captain Krau', '3,9': 'Successor Taeyou',
};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + 'live.html');
  for (const f of ['js/sources/official-heroes.js', 'js/roster.js', 'js/faces.js']) await p.addScriptTag({ url: BASE + f });
  const res = await p.evaluate(async () => {
    const F = window.RTAFaces;
    const R = window.RTARoster;
    const heroes = window.RTASources.officialSnapshot.heroes;
    const load = (src) => new Promise((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    const tpl = [];
    let failed = 0;
    await Promise.all(heroes.map(async (h) => {
      const i = await load(R.PORTRAIT_URL(h.code));
      if (!i) return failed++;
      tpl.push({ code: h.code, vec: F.fromPortrait(i), source: 'official' });
    }));
    const shot = await load('tests/fixtures/screens/steam-rta-preban-select.png');
    const name = new Map(heroes.map((h) => [h.code, h.name]));
    const out = [];
    const t0 = performance.now();
    for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) {
      const cx = 127 + c * 96.2, cy = 175 + r * 103;
      const k = F.classify(F.fromRect(shot, { x: cx - 42, y: cy - 44, w: 84, h: 84 }), tpl);
      out.push({ at: `${r},${c}`, name: k.best ? name.get(k.best.code) : '', score: k.best ? +k.best.score.toFixed(3) : 0, lead: +k.lead.toFixed(3), confident: F.isConfident(k) });
    }
    return { templates: tpl.length, failed, ms: Math.round((performance.now() - t0) / 40), out };
  });
  console.log(`templates ${res.templates} (failed ${res.failed}) · ${res.ms} ms per face`);
  const right = res.out.filter((o) => KNOWN[o.at] && o.confident && o.name === KNOWN[o.at]);
  const missed = res.out.filter((o) => KNOWN[o.at] && !(o.confident && o.name === KNOWN[o.at]));
  const falseConfident = res.out.filter((o) => !KNOWN[o.at] && o.confident);
  console.log(`known faces named confidently and correctly: ${right.length}/${Object.keys(KNOWN).length}`);
  console.log('missed:', JSON.stringify(missed));
  console.log('confident on an unconfirmed face (must be none):', JSON.stringify(falseConfident));
  console.log('unsure:', res.out.filter((o) => !o.confident).length);
  console.log('errors:', errs);
  await b.close();
})();
