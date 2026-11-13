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
  for (const f of ['js/sources/official-heroes.js', 'js/sources/class-templates.js', 'js/roster.js', 'js/faces.js']) await p.addScriptTag({ url: BASE + f });
  const res = await p.evaluate(async (KNOWN) => {
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
    const el = new Map(heroes.map((h) => [h.code, h.element]));
    const sheet = document.createElement('canvas'); sheet.width = 10 * 170; sheet.height = 4 * 92;
    const sh = sheet.getContext('2d'); sh.fillStyle = '#111'; sh.fillRect(0, 0, sheet.width, sheet.height); sh.font = '11px sans-serif';
    const portraits = new Map();
    for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) {
      const cx = 127 + c * 96.2, cy = 175 + r * 103;
      const rect = { x: cx - 42, y: cy - 44, w: 84, h: 84 };
      const faces = F.fromRect(shot, rect);
      const k = F.classify(faces, tpl);
      // owner's ideas: read the element colour + class symbol first, then only compare heroes with both.
      // Class examples come from this same picture, so leave this face's own example out (honest test).
      const classTpl = window.RTASources.classTemplates.filter((t) => t.from !== KNOWN[`${r},${c}`]);
      const bd = F.badgesAt(shot, rect, classTpl);
      const e = { element: bd.element };
      const ke = F.classify(faces, tpl, { allow: F.badgeAllow(bd.element, bd.role, heroes) });
      out.push({ at: `${r},${c}`, role: bd.role, roleTruth: KNOWN[`${r},${c}`] ? (heroes.find((h) => h.name === KNOWN[`${r},${c}`]) || {}).role : null, element: e.element, name: k.best ? name.get(k.best.code) : '', score: k.best ? +k.best.score.toFixed(3) : 0, lead: +k.lead.toFixed(3), confident: F.isConfident(k),
        nameE: ke.best ? name.get(ke.best.code) : '', codeE: ke.best && ke.best.code, scoreE: ke.best ? +ke.best.score.toFixed(3) : 0, leadE: +ke.lead.toFixed(3), confidentE: F.isConfident(ke) });
      // contact sheet: game face | element-filtered best match
      const X = c * 170, Y = r * 92;
      sh.drawImage(shot, cx - 42, cy - 46, 84, 84, X + 2, Y + 2, 72, 72);
      if (ke.best) {
        const im = portraits.get(ke.best.code) || await load(R.PORTRAIT_URL(ke.best.code));
        portraits.set(ke.best.code, im);
        if (im) sh.drawImage(im, X + 78, Y + 2, 72, 72);
      }
      sh.fillStyle = F.isConfident(ke) ? '#7f7' : '#f99';
      sh.fillText(`${(ke.best ? name.get(ke.best.code) : '?').slice(0, 18)} ${ke.best ? ke.best.score.toFixed(2) : ''}/${ke.lead.toFixed(2)}`, X + 2, Y + 86);
    }
    return { templates: tpl.length, failed, ms: Math.round((performance.now() - t0) / 40), out, sheet: sheet.toDataURL('image/png'), elements: out.map((o) => o.element) };
  }, KNOWN);
  console.log(`templates ${res.templates} (failed ${res.failed}) · ${res.ms} ms per face`);
  const right = res.out.filter((o) => KNOWN[o.at] && o.confident && o.name === KNOWN[o.at]);
  const missed = res.out.filter((o) => KNOWN[o.at] && !(o.confident && o.name === KNOWN[o.at]));
  const falseConfident = res.out.filter((o) => !KNOWN[o.at] && o.confident);
  console.log(`known faces named confidently and correctly: ${right.length}/${Object.keys(KNOWN).length}`);
  console.log('missed:', JSON.stringify(missed));
  console.log('confident on an unconfirmed face (must be none):', JSON.stringify(falseConfident));
  console.log('unsure:', res.out.filter((o) => !o.confident).length);
  __fs.writeFileSync(OUT + '/faces-real-element-sheet.png', Buffer.from(res.sheet.split(',')[1], 'base64'));
  // element badge (colour) first
  const elRight = res.out.filter((o) => KNOWN[o.at]).filter((o) => o.element && o.nameE === KNOWN[o.at]).length;
  console.log('element badges read:', res.out.filter((o) => o.element).length, '/ 40');
  const kn = res.out.filter((o) => o.roleTruth);
  console.log(`class symbols (leave-one-out) on known faces: right ${kn.filter((o) => o.role === o.roleTruth).length}, wrong ${kn.filter((o) => o.role && o.role !== o.roleTruth).length}, unsure ${kn.filter((o) => !o.role).length}; read on all faces: ${res.out.filter((o) => o.role).length}/40`);
  console.log(`WITH element + class filter: known faces named confidently and correctly: ${res.out.filter((o) => KNOWN[o.at] && o.confidentE && o.nameE === KNOWN[o.at]).length}/${Object.keys(KNOWN).length}`);
  console.log('WITH element + class filter, known faces named wrong:', JSON.stringify(res.out.filter((o) => KNOWN[o.at] && o.confidentE && o.nameE !== KNOWN[o.at])));
  console.log('WITH element + class filter, newly confident on unconfirmed faces (check sheet):', JSON.stringify(res.out.filter((o) => !KNOWN[o.at] && o.confidentE).map((o) => [o.at, o.nameE, o.scoreE, o.leadE])));
  console.log('errors:', errs);
  await b.close();
})();
