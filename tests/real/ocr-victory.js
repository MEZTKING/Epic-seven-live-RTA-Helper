// Run from the repo root: node tests/real/ocr-victory.js (needs internet for tesseract.js)
// OCR experiment on real screenshots: does the app's text reader (tesseract.js 5.1.1, same CDN) read real game text?
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const FX = path.join(__dirname, '..', 'fixtures', 'screens');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent('<body></body>');
  await p.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js' });
  const img = 'data:image/png;base64,' + fs.readFileSync(FX + '/steam-rta-victory.png').toString('base64');
  const regions = {
    result: [480, 225, 390, 70],
    points: [600, 452, 140, 50],
    change: [630, 500, 80, 30],
    // player names are blacked out in the fixture (public repo). On the original, eng read "MEZTKING" (92%),
    // and the Korean opponent name needed the 'kor' model (eng: garbage 2%, kor: 94%). See DEVLOG #22.
    leftMsg: [500, 678, 340, 30],
  };
  const out = await p.evaluate(async ({ img, regions }) => {
    const im = new Image();
    await new Promise((r) => { im.onload = r; im.src = img; });
    const eng = await Tesseract.createWorker('eng');
        const res = {};
    for (const [k, [x, y, w, h]] of Object.entries(regions)) {
      const scale = Math.max(1, 64 / h);
      const cv = document.createElement('canvas');
      cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
      const cx = cv.getContext('2d');
      cx.filter = 'grayscale(1) contrast(1.6)';
      cx.drawImage(im, x, y, w, h, 0, 0, cv.width, cv.height);
      const e = (await eng.recognize(cv)).data;
      const kk = null;
      res[k] = { eng: e.text.trim(), conf: Math.round(e.confidence), ...(kk ? { kor: kk.text.trim(), korConf: Math.round(kk.confidence) } : {}) };
    }
    return res;
  }, { img, regions });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
