// Run from the repo root: python3 -m http.server 8766 & node tests/real/match-portraits.js
// Real-screenshot test of the hero-face matcher (js/vision.js, same feature as js/auto.js) on the pre-ban picker grid.
// Builds templates from every official portrait, classifies 40 grid faces, writes a contact sheet (crop | best match).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const FX = path.join(__dirname, '..', 'fixtures', 'screens');
const OUT = process.env.E7_OUT || path.join(__dirname, '..', 'e2e', 'out');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.E7_BASE || 'http://localhost:8766/'; // serve the repo first: python3 -m http.server 8766
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto(BASE + 'index.html');
  for (const f of ['js/sources/official-heroes.js', 'js/roster.js', 'js/vision.js']) await p.addScriptTag({ path: f });
  const img = 'data:image/png;base64,' + fs.readFileSync(FX + '/steam-rta-preban-select.png').toString('base64');
  const res = await p.evaluate(async ({ img }) => {
    const V = window.RTAVision;
    const R = window.RTARoster;
    const heroes = window.RTASources.officialSnapshot.heroes;
    const sc = document.createElement('canvas'); sc.width = sc.height = V.SIZE;
    const sx = sc.getContext('2d', { willReadFrequently: true });
    const feat = (im, x, y, w, h) => { sx.clearRect(0, 0, V.SIZE, V.SIZE); sx.drawImage(im, x, y, w, h, 0, 0, V.SIZE, V.SIZE); return V.featureFromRGBA(sx.getImageData(0, 0, V.SIZE, V.SIZE).data); };
    const load = (src) => new Promise((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    const tpl = [];
    const portraits = {};
    let failed = 0;
    await Promise.all(heroes.map(async (h) => {
      const i = await load(R.PORTRAIT_URL(h.code));
      if (!i) { failed++; return; }
      portraits[h.code] = i;
      const W = i.naturalWidth, H = i.naturalHeight;
      for (const inset of [0, 0.1, 0.2]) tpl.push({ code: h.code, vec: feat(i, W * inset, H * inset, W * (1 - 2 * inset), H * (1 - 2 * inset)).vec, source: 'official' });
    }));
    const shot = await load(img);
    const out = [];
    const sheet = document.createElement('canvas'); sheet.width = 10 * 170; sheet.height = 4 * 90;
    const sh = sheet.getContext('2d'); sh.fillStyle = '#111'; sh.fillRect(0, 0, sheet.width, sheet.height); sh.font = '11px sans-serif';
    const byCode = new Map(heroes.map((h) => [h.code, h.name]));
    for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) {
      const cx = 127 + c * 96.2, cy = 175 + r * 103;
      let best = null;
      for (const half of [26, 30, 34]) for (const [ox, oy] of [[0, 0], [0, -4], [0, 4], [-3, 0], [3, 0]]) {
        const f = feat(shot, cx - half + ox, cy - half - 4 + oy, half * 2, half * 2);
        const k = V.classify(f, tpl);
        if (!k.empty && (!best || k.best.sim > best.best.sim)) best = k;
      }
      const name = best ? byCode.get(best.best.code) : '?';
      out.push({ r, c, name, sim: best && +best.best.sim.toFixed(3), second: best && best.second && byCode.get(best.second.code), lead: best && best.second ? +(best.best.sim - best.second.sim).toFixed(3) : null, confident: !!best && V.isConfident(best) });
      const X = c * 170, Y = r * 90;
      sh.drawImage(shot, cx - 40, cy - 44, 80, 80, X + 2, Y + 2, 70, 70);
      if (best && portraits[best.best.code]) sh.drawImage(portraits[best.best.code], X + 76, Y + 2, 70, 70);
      sh.fillStyle = V.isConfident(best) ? '#7f7' : '#f77'; sh.fillText(`${name} ${best ? best.best.sim.toFixed(2) : ''}`.slice(0, 26), X + 2, Y + 86);
    }
    return { templates: tpl.length, failed, out, sheet: sheet.toDataURL('image/png') };
  }, { img });
  fs.writeFileSync(OUT + '/real-match-sheet.png', Buffer.from(res.sheet.split(',')[1], 'base64'));
  console.log('templates', res.templates, 'portraits failed', res.failed);
  console.log('confident', res.out.filter((o) => o.confident).length, 'of', res.out.length);
  for (const o of res.out) console.log(o.r, o.c, o.name, o.sim, o.confident ? 'OK' : 'unsure', '| 2nd', o.second, o.lead);
  await b.close();
})();
