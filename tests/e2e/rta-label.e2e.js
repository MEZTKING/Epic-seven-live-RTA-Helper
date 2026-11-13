// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: portraits)
// 1) "Name the heroes on this picture" on the owner's REAL BAN screen: two pick banners are named once, and the next
//    time that screen is read those slots are recognised (confirmed) by themselves.
// 2) "Read teams from the CR bar": round hero icons on a bar (made from official portraits, red ring = opponent).
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(BASE + 'rta.html');
  await p.evaluate(async () => { localStorage.clear(); await window.E7Pictures.clear(); });
  await p.reload();
  await p.click('.tab[data-tab=auto]');
  await p.setInputFiles('#auto-shot', __path.join(FX, 'steam-rta-menu.png'));
  await p.waitForFunction(() => window.RTAAuto._officialLoad.total > 0 && window.RTAAuto._officialLoad.done >= window.RTAAuto._officialLoad.total, null, { timeout: 120000 });

  // the BAN screen as a saved picture
  const url = 'data:image/png;base64,' + __fs.readFileSync(__path.join(FX, 'steam-rta-ban.png')).toString('base64');
  await p.evaluate(async (url) => window.E7Pictures.add({ url, w: 1340, h: 754, frameKey: 'window-16x9', note: 'draft board · test' }), url);
  await p.click('#auto-pics');
  await p.waitForSelector('#pics[open] .pic');
  await p.click('#pics .pic');
  await p.click('#pics-label');
  await p.waitForSelector('#label-dlg[open] .label-cell');
  const cells = await p.$$eval('#label-grid .label-cell', (c) => c.map((x) => x.querySelector('.hint').textContent));
  console.log('slots offered for naming:', cells.length, JSON.stringify(cells.slice(0, 6)));
  // name my pick #1 and the opponent's pick #2 (any two heroes: the point is "named once, recognised next time")
  const idx = (label) => cells.indexOf(label);
  await p.fill(`#label-grid input[data-i="${idx('My pick #1')}"]`, 'Bellona');
  await p.fill(`#label-grid input[data-i="${idx('Opponent pick #2')}"]`, 'Arbiter Vildred');
  await p.click('#label-save');
  await p.waitForTimeout(300);
  console.log('corrections saved:', await p.evaluate(() => window.RTAApp.store.auto.corrections.filter((c) => c.source === 'my corrections').length));
  // next time: the same screen -> those two slots are recognised by themselves
  await p.setInputFiles('#auto-shot', __path.join(FX, 'steam-rta-ban.png'));
  await p.waitForTimeout(300);
  for (let i = 0; i < 3; i++) await p.evaluate(() => window.RTAAuto.tick());
  const conf = await p.evaluate(() => Object.fromEntries([...window.RTAAuto._track.entries()].filter(([id]) => /pick/.test(id)).map(([id, t]) => [id, t.confirmed ? `${window.RTAApp.nameOf(t.confirmed.code)} (${t.confirmed.source})` : '-'])));
  console.log('BAN screen read again:', JSON.stringify(conf));

  // CR bar: round icons of real portraits, red ring = opponent
  const teams = await p.evaluate(async () => {
    const R = window.RTARoster;
    const load = (src) => new Promise((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.src = src; });
    const codes = [['c1174', 'me'], ['c1172', 'opp'], ['c5175', 'me'], ['c1169', 'opp']]; // Stark, Frieren, Aram, Robin
    const c = document.createElement('canvas'); c.width = 1340; c.height = 754;
    const x = c.getContext('2d'); x.fillStyle = '#30343c'; x.fillRect(0, 0, 1340, 754);
    let y = 150;
    for (const [code, side] of codes) {
      const im = await load(R.PORTRAIT_URL(code));
      x.save(); x.beginPath(); x.arc(42, y + 28, 26, 0, Math.PI * 2); x.clip(); x.drawImage(im, 16, y + 2, 52, 52); x.restore();
      x.lineWidth = 4; x.strokeStyle = side === 'opp' ? '#d8262c' : '#e8e8e8'; x.beginPath(); x.arc(42, y + 28, 27, 0, Math.PI * 2); x.stroke();
      y += 90;
    }
    window.RTAApp.store.auto.regions = { crBar: { x: 12 / 1340, y: 140 / 754, w: 60 / 1340, h: 380 / 754 } };
    window.RTAApp.save();
    const blob = await new Promise((r) => c.toBlob(r));
    return { blobUrl: URL.createObjectURL(blob) };
  });
  // load that picture as the screen, then read the teams
  const png = await p.evaluate(async (u) => { const r = await fetch(u); const b = await r.arrayBuffer(); return Array.from(new Uint8Array(b)); }, teams.blobUrl);
  __fs.writeFileSync(__path.join(__dirname, 'out', 'cr-test.png'), Buffer.from(png));
  await p.setInputFiles('#auto-shot', __path.join(__dirname, 'out', 'cr-test.png'));
  await p.waitForTimeout(400);
  const t = await p.evaluate(() => { const r = window.RTAAuto._scanCRTeams({ quiet: true }); return r && { me: r.me.map(window.RTAApp.nameOf), opp: r.opp.map(window.RTAApp.nameOf) }; });
  console.log('teams from the CR bar:', JSON.stringify(t), '(expected me: Stark, Aram · opp: Frieren, Robin)');
  console.log('errors:', errs);
  await b.close();
})();
