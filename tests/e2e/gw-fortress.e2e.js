// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: OCR, portraits)
// DEVLOG #38/#39, any window size + Guild War fortresses on both sides, on the owner's real screens from a MAXIMIZED
// window (2000×1070, wider than 16:9; player and guild names replaced by made-up ones / blurred):
//  1) enemy overview → the three fortress names + "enemy" (switch); kept on the war
//  2) enemy Stinger map: fortress from the pager + the overview's names, 9 defenders + keep, names; corrected + saved
//  3) our overview → our fortress names + "ours"
//  4) our Domino / Crown / Log maps: side from the green rings, beaten (grey) defenders counted; Domino saved as ours
//  5) enemy Darkwood map at 16:9 (1228×691)
//  6) a captured window with its title bar: the title bar is found from the pixels (js/frame.js)
//  7) the enemy-defense reader on the real 2000×1070 enemy screen (panel pinned left)
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
const STINGER = ['Alpha01', 'BravoKnight', 'CharlieRose', 'Delta7', 'EchoMoon', 'Foxtrot', 'GolfStar', 'HotelBlue', 'IndiaRain', 'Tango'];
const DOMINO = ['Victor9', 'Whiskey', 'XrayBeam', 'Yankee12', 'ZuluWave', 'AmberFox', 'BirchOwl', 'CedarElk', 'KeepOne'];
const CROWN = ['DuneHawk', 'EmberCat', 'FrostBee', 'GaleWolf', 'HazelRay', 'IvoryJay', 'JadeLynx', 'KestrelO', 'LarchBat', 'KeepTwo'];
const LOG = ['MapleDog', 'NovaKoi', 'OnyxYak', 'PineMole', 'QuartzEel', 'RubyHen', 'SageGnu', 'TealAnt', 'UmberPig', 'KeepThree'];
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
      for (let i = 0; i < 40 && !got && !/no fortress indicator/.test(r.note || ''); i++) {
        await window.E7Vision.tick(true);
        await new Promise((res) => setTimeout(res, 200));
      }
      off();
      return { note: r.note, side: got && got.side, fort: got && got.fort, beaten: got ? got.players.filter((p) => p.state === 'beaten').length : 0, names: got ? [...got.players.map((p) => p.name), got.keep && got.keep.name] : null };
    }, url);
  const readOverview = (url) =>
    lv.evaluate(async (url) => {
      const im = new Image();
      await new Promise((r) => {
        im.onload = r;
        im.src = url;
      });
      window.E7Vision._useSource(im);
      const r = window.E7Vision._readers.find((x) => x.id === 'guild-overview');
      r.idle();
      r.note = '';
      let got = null;
      const off = window.E7Bus.on('guild:forts', (d) => (got = d));
      // (the screen detector needs a few frames to notice the new screen: "Not the overview (gw-map)" until then)
      for (let i = 0; i < 30 && !got && !/no shield|not readable/.test(r.note || ''); i++) {
        await window.E7Vision.tick(true);
        await new Promise((res) => setTimeout(res, 200));
      }
      off();
      return { note: r.note, got };
    }, url);
  const score = (got, want) => (got || []).filter((n) => want.includes(n)).length;

  const ov = await readOverview(dataUrl('steam-gw-overview-wide-blurred.jpg'));
  console.log('enemy overview:', ov.note, '·', JSON.stringify(ov.got));
  await gp.waitForTimeout(500);
  console.log('  kept on the war:', JSON.stringify(await gp.evaluate(() => (window.GuildApp.state.wars[0] || {}).forts)));

  const s = await readFort(dataUrl('steam-gw-map-stinger-wide.jpg'));
  console.log('Stinger (2000×1070):', s.side, s.fort, '·', s.note);
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
  console.log('fortress filter offers:', JSON.stringify(await gp.$$eval('#target-fort option', (o) => o.map((x) => x.textContent))));
  await gp.selectOption('#target-fort', 'Darkwood Fortress');
  const inDark = await gp.$$eval('#targets .gw-card', (c) => c.length);
  await gp.selectOption('#target-fort', 'Stinger Fortress');
  const inSting = await gp.$$eval('#targets .gw-card', (c) => c.length);
  console.log('War tab fortress filter: Stinger', inSting, '· Darkwood', inDark, '· first card:', (await gp.textContent('#targets .gw-card')).replace(/\s+/g, ' ').trim().slice(0, 90));
  console.log('name fixes remembered:', await gp.evaluate(() => localStorage.getItem('e7-gw-name-fixes')));

  // our side
  const ovo = await readOverview(dataUrl('steam-gw-overview-ours-wide-blurred.jpg'));
  console.log('our overview:', ovo.note, '·', JSON.stringify(ovo.got));
  await gp.waitForTimeout(500);
  for (const [f, want] of [['steam-gw-map-ours-domino-wide.jpg', DOMINO], ['steam-gw-map-ours-crown-wide.jpg', CROWN], ['steam-gw-map-ours-log-wide.jpg', LOG]]) {
    const o = await readFort(dataUrl(f));
    console.log(`${f}:`, o.side, o.fort, `· beaten ${o.beaten} ·`, `${score(o.names, want)}/${want.length} names exact`, JSON.stringify(o.names));
    if (f.includes('domino')) {
      await gp.waitForTimeout(400);
      await gp.click('#gw-fort-save');
      await gp.waitForTimeout(600);
      console.log('  saved ours:', await gp.textContent('#gw-fort-msg'));
      console.log('  War tab "Our side":', (await gp.textContent('#war-ours')).replace(/\s+/g, ' ').trim().slice(0, 160));
      console.log('  members now:', await gp.evaluate(() => window.GuildApp.state.members.length));
    }
  }

  const d = await readFort(dataUrl('steam-gw-map-darkwood.jpg'));
  console.log('Darkwood (1228×691):', d.side, d.fort, '·', d.note);
  console.log('  names:', JSON.stringify(d.names), `→ ${score(d.names, DARKWOOD)}/10 exactly right`);

  const o = await readFort(dataUrl('steam-gw-overview-wide-blurred.jpg'));
  console.log('overview is not a map:', o.note);

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

  // 7) the enemy-defense reader on the real 2000×1070 enemy screen
  const dw = await lv.evaluate(async (url) => {
    const im = new Image();
    await new Promise((res) => {
      im.onload = res;
      im.src = url;
    });
    window.E7Vision._useSource(im);
    const rd = window.E7Vision._readers.find((q) => q.id === 'guild-defense');
    rd.idle();
    rd.note = '';
    let got = null;
    const off = window.E7Bus.on('guild:defense', (d) => (got = d));
    for (let i = 0; i < 120 && !/Defense: \d\/6 heroes recognised$|No defense/.test(rd.note || ''); i++) {
      await window.E7Vision.tick(true);
      await new Promise((res) => setTimeout(res, 500));
    }
    off();
    const H = window.RTASources.officialSnapshot.heroes;
    return { note: rd.note, sure: got ? got.teams.flat().map((x) => (x && x.sure ? (H.find((h) => h.code === x.code) || {}).name : '?')) : null };
  }, dataUrl('steam-gw-enemy-wide.jpg'));
  console.log('enemy defense (2000×1070):', dw.note, JSON.stringify(dw.sure));
  console.log('errors:', errs);
  await b.close();
})();
