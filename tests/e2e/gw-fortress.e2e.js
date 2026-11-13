// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: OCR, portraits)
// DEVLOG #38, any window size + Guild War fortresses, on the owner's real screens (player names replaced by made-up ones):
//  1) Stinger Fortress map from a MAXIMIZED window (2000×1070, wider than 16:9): fortress from the pager, 9 defenders +
//     the keep, their names read; the Guild War page shows them, one is corrected, Save files all 10 under Stinger
//  2) Darkwood Fortress map at 16:9 (1228×691): the middle pill, 9 defenders + keep
//  3) the wide Guild War overview is recognised as the overview and is not read as a map
//  4) a captured window with its title bar: the title bar is found from the pixels (js/frame.js)
//  5) the enemy-defense reader on a WIDER picture, panel pinned left or centred: both placements are tried
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
const STINGER = ['Alpha01', 'BravoKnight', 'CharlieRose', 'Delta7', 'EchoMoon', 'Foxtrot', 'GolfStar', 'HotelBlue', 'IndiaRain', 'Tango'];
const DARKWOOD = ['Kilo88', 'LimaBean', 'MikeTower', 'November', 'OscarWild', 'PapaBear', 'QuebecCat', 'Romeo5', 'SierraSky', 'Uniform'];
const dataUrl = (f) => `data:image/${f.endsWith('.png') ? 'png' : 'jpeg'};base64,` + __fs.readFileSync(__path.join(FX, f)).toString('base64');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } });
  const errs = [];
  // Guild War page with a war
  const gp = await ctx.newPage();
  gp.on('pageerror', (e) => errs.push('guild: ' + e.message));
  const answers = ['Test Foes', ''];
  gp.on('dialog', (d) => {
    const a = answers.shift();
    if (a === undefined) d.accept();
    else d.accept(a);
  });
  await gp.goto(BASE + 'guild.html');
  await gp.evaluate(() => localStorage.clear());
  await gp.reload();
  await gp.click('.tab[data-tab=setup]');
  await gp.fill('#my-name', 'Ann');
  await gp.press('#my-name', 'Tab');
  await gp.fill('#guild-name', 'Testers');
  await gp.click('#guild-create');
  await gp.waitForTimeout(300);
  await gp.click('.tab[data-tab=war]');
  await gp.click('#war-new');
  await gp.waitForTimeout(300);
  // the game watcher (Live page)
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  const readFort = (url) =>
    lv.evaluate(async (url) => {
      const im = new Image();
      await new Promise((r) => {
        im.onload = r;
        im.src = url;
      });
      window.E7Vision._useSource(im);
      const r = window.E7Vision._readers.find((x) => x.id === 'guild-fortress');
      r.idle();
      r.note = '';
      let got = null;
      const off = window.E7Bus.on('guild:fortress', (d) => (got = d));
      for (let i = 0; i < 40 && !got && !/Not a fortress/.test(r.note || ''); i++) {
        await window.E7Vision.tick(true);
        await new Promise((res) => setTimeout(res, 200));
      }
      off();
      return { note: r.note, screen: window.E7Screens && window.E7Screens.current(), fort: got && got.fort, names: got ? [...got.players.map((p) => p.name), got.keep && got.keep.name] : null };
    }, url);
  const score = (got, want) => (got || []).filter((n) => want.includes(n)).length;

  const s = await readFort(dataUrl('steam-gw-map-stinger-wide.jpg'));
  console.log('Stinger (2000×1070):', s.fort, '·', s.note, '· screen', s.screen);
  console.log('  names:', JSON.stringify(s.names), `→ ${score(s.names, STINGER)}/10 exactly right`);
  await gp.waitForTimeout(400);
  const panel = await gp.evaluate(() => {
    const el = document.querySelector('#gw-fort-seen');
    return el && !el.classList.contains('hidden') ? el.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) : 'not shown';
  });
  console.log('Guild War page:', panel);
  // correct the first name that isn't one of the made-up ones (as the owner would), then save
  const inputs = await gp.$$('#gw-fort-seen input');
  let fixed = '';
  for (const i of inputs) {
    const v = await i.inputValue();
    if (!STINGER.includes(v)) {
      const want = STINGER.find((n) => !(s.names || []).includes(n)) || 'Alpha01';
      await i.fill(want);
      fixed = `${v || '(empty)'} → ${want}`;
      break;
    }
  }
  await gp.click('#gw-fort-save');
  await gp.waitForTimeout(600);
  console.log('corrected:', fixed || 'nothing needed', '·', await gp.textContent('#gw-fort-msg'));
  const saved = await gp.evaluate(() => window.GuildApp.state.targets.map((t) => [t.player, t.tower, !!t.keep]));
  console.log('targets now:', saved.length, 'all in Stinger:', saved.every((t) => t[1] === 'Stinger Fortress'), '· keep:', JSON.stringify(saved.filter((t) => t[2]).map((t) => t[0])));
  await gp.selectOption('#target-fort', 'Darkwood Fortress');
  const inDark = await gp.$$eval('#targets .gw-card', (c) => c.length);
  await gp.selectOption('#target-fort', 'Stinger Fortress');
  const inSting = await gp.$$eval('#targets .gw-card', (c) => c.length);
  console.log('War tab fortress filter: Stinger', inSting, '· Darkwood', inDark, '· first card:', (await gp.textContent('#targets .gw-card')).replace(/\s+/g, ' ').trim().slice(0, 90));
  console.log('name fixes remembered:', await gp.evaluate(() => localStorage.getItem('e7-gw-name-fixes')));

  const d = await readFort(dataUrl('steam-gw-map-darkwood.jpg'));
  console.log('Darkwood (1228×691):', d.fort, '·', d.note);
  console.log('  names:', JSON.stringify(d.names), `→ ${score(d.names, DARKWOOD)}/10 exactly right`);

  const o = await readFort(dataUrl('steam-gw-overview-wide-blurred.jpg'));
  console.log('overview (2000×1070):', o.note, '· screen', o.screen);

  // 4) title bar from the pixels
  const frame = await lv.evaluate(async (url) => {
    const im = new Image();
    await new Promise((r) => {
      im.onload = r;
      im.src = url;
    });
    const c = document.createElement('canvas');
    c.width = im.width;
    c.height = im.height;
    const x = c.getContext('2d');
    x.drawImage(im, 0, 0);
    return { size: [im.width, im.height], frame: window.E7Frame.detect(x.getImageData(0, 0, im.width, im.height).data, im.width, im.height) };
  }, dataUrl('steam-window-titlebar-lobby.jpg'));
  console.log('window with title bar', JSON.stringify(frame.size), '→ game', JSON.stringify(frame.frame), '(expected y 18, h 1070)');

  // 5) defense reader on a wider picture (the real 16:9 enemy screen, scaled to 1070 high, inside a 2000-wide picture)
  for (const where of ['left', 'centre']) {
    const r = await lv.evaluate(
      async ({ url, where }) => {
        const im = new Image();
        await new Promise((res) => {
          im.onload = res;
          im.src = url;
        });
        const H = 1070;
        const w16 = Math.round((H * 16) / 9);
        const c = document.createElement('canvas');
        c.width = 2000;
        c.height = H;
        const x = c.getContext('2d');
        x.fillStyle = '#20242c';
        x.fillRect(0, 0, 2000, H);
        x.drawImage(im, where === 'left' ? 0 : (2000 - w16) / 2, 0, w16, H);
        window.E7Vision._useSource(c);
        const rd = window.E7Vision._readers.find((q) => q.id === 'guild-defense');
        rd.idle();
        rd.note = '';
        for (let i = 0; i < 120 && !/Defense: \d\/6 heroes recognised$|No defense/.test(rd.note || ''); i++) {
          await window.E7Vision.tick(true);
          await new Promise((res) => setTimeout(res, 500));
        }
        return rd.note;
      },
      { url: dataUrl('steam-gw-enemy.png'), where },
    );
    console.log(`defense panel pinned ${where} on a 2000×1070 picture:`, r);
  }
  console.log('errors:', errs);
  await b.close();
})();
