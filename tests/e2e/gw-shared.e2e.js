// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: text reader + its
// Japanese / Chinese data and hero portraits from the CDN)
// DEVLOG #61 (fixtures with replaced names):
//  1) a name the app is not sure of is MARKED (on the card and with a "?" on the game); with one such name the card
//     waits by itself, and the name read on that player's own page goes into its box
//  2) with several unsure names the user picks which box waits (⚠ button)
//  3) after Save the places are in the guild's records: the same map again is not read a second time; the card says
//     it is already in the war plan and offers nothing to save; the marks on the game are gone when the map is left
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
const { autoAsk } = require('./_ask.js');
const dataUrl = (f) => `data:image/${f.endsWith('.png') ? 'png' : 'jpeg'};base64,` + __fs.readFileSync(__path.join(FX, f)).toString('base64');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
  await autoAsk(ctx);
  await ctx.addInitScript(() => {
    // the server's player list (stand-in): every defender of the map EXCEPT the keep's player is on it
    const LIST = ['りょうちゃん', 'ミカちゃま', 'sukiyaki2417', '和也', 'さくら', 'ティーナ'];
    const dist = (a, c) => { const A = [...a.toLowerCase()], C = [...c.toLowerCase()]; let prev = [0, ...C.map((_, j) => j + 1)]; for (let i = 0; i < A.length; i++) { const cur = [i + 1]; for (let j = 0; j < C.length; j++) cur.push(Math.min(prev[j + 1] + 1, cur[j] + 1, prev[j] + (A[i] === C[j] ? 0 : 1))); prev = cur; } return prev[C.length]; };
    window.__e7RecordsTest = { find: async () => [], game: async () => ({}), near: async (world, text) => LIST.map((name) => ({ name, d: dist(text, name), rank: 70 })).filter((x) => x.d <= 2).sort((x, y) => x.d - y.d).slice(0, 3) };
  });
  const errs = [];
  const gp = await ctx.newPage();
  gp.on('pageerror', (e) => errs.push('guild: ' + e.message));
  gp.on('dialog', (d) => d.accept());
  await gp.goto(BASE + 'guild.html');
  await gp.evaluate(() => localStorage.clear());
  await gp.reload();
  await gp.click('.tab[data-tab=setup]');
  await gp.fill('#my-name', 'AmberFox');
  await gp.press('#my-name', 'Tab');
  await gp.fill('#guild-name', 'TestHome');
  await gp.click('#guild-create');
  await gp.waitForTimeout(300);
  await gp.click('.tab[data-tab=war]');
  const ov = await ctx.newPage();
  await ov.goto(BASE + 'overlay.html');
  const marks = () => ov.evaluate(() => [...document.querySelectorAll('.ov-label')].filter((e) => /name not read/.test(e.textContent)).length);
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  const show = (file, until, rounds = 8) =>
    lv.evaluate(
      async ({ url, until, rounds }) => {
        const im = new Image();
        await new Promise((r) => { im.onload = r; im.src = url; });
        window.E7Vision._useSource(im);
        const t0 = Date.now();
        for (const r of window.E7Vision._readers) {
          if (/^guild-(overview|standby|name|defense)/.test(r.id) && r.idle) r.idle({ publish() {}, note() {} });
          r.note = '';
        }
        const got = {};
        let reads = 0;
        const offs = ['guild:forts', 'guild:fortress', 'guild:name-read', 'guild:defense'].map((t) => window.E7Bus.on(t, (d) => { if (!d.away) got[t.slice(6)] = d; }));
        const offBusy = window.E7Bus.on('vision:busy', (d) => { if (d.reader === 'guild-fortress' && !d.done && d.text) reads++; });
        for (let i = 0; i < rounds; i++) {
          await window.E7Vision.tick(true);
          await new Promise((res) => setTimeout(res, 400));
          if (until && until.every((u) => got[u])) break;
        }
        for (const off of offs) off();
        offBusy();
        return { got, ms: Date.now() - t0, progress: reads, fortNote: window.E7Vision._readers.find((x) => x.id === 'guild-fortress').note, nameNote: window.E7Vision._readers.find((x) => x.id === 'guild-name').note };
      },
      { url: dataUrl(file), until: until || null, rounds },
    );
  const card = async () => ({
    head: (await gp.textContent('#gw-fort-seen b')).replace(/\s+/g, ' ').trim(),
    boxes: await gp.$$eval('#gw-fort-seen [data-fort-i]', (xs) => xs.map((x) => x.value)),
    marked: await gp.$$eval('#gw-fort-seen [data-fort-ask]', (xs) => xs.map((x) => `${x.dataset.fortAsk}:${/waiting/.test(x.textContent) ? 'waiting' : 'not sure'}`)),
    save: await gp.locator('#gw-fort-save').count(),
    msg: ((await gp.locator('#gw-fort-msg').count()) ? await gp.textContent('#gw-fort-msg') : '').trim(),
  });

  await show('steam-gw-overview-war-wide.jpg', ['forts']);
  await gp.waitForTimeout(1200);
  // 1) the Stinger map: six names are on the player list, the keep's name is not -> one marked name, waiting
  const m = await show('steam-gw-map-states-wide.jpg', ['fortress'], 40);
  await gp.waitForTimeout(500);
  await ov.waitForTimeout(300);
  let c = await card();
  console.log('map:', m.fortNote);
  console.log('  card:', c.head, '· marked', JSON.stringify(c.marked), '· "?" on the game:', await marks());
  console.log('  watcher says:', JSON.stringify(await gp.textContent('#gw-watch-read')));
  // the player's own page (the stronghold screen of the keep's player)
  const pg = await show('steam-gw-stronghold-cjk-wide.jpg', ['name-read'], 60);
  await gp.waitForTimeout(600);
  await ov.waitForTimeout(300);
  c = await card();
  console.log('their page:', pg.nameNote, '→ boxes', JSON.stringify(c.boxes), '· marked now', JSON.stringify(c.marked), '·', c.msg, '· "?" on the game after leaving the map:', await marks());
  console.log('  that box says:', (await gp.textContent('#gw-fort-seen label:last-of-type')).replace(/\s+/g, ' ').trim().slice(0, 60));

  // 3) save; the same map again
  await gp.click('#gw-fort-save');
  await gp.waitForTimeout(800);
  console.log('saved:', (await card()).msg, '· places kept:', JSON.stringify(await gp.evaluate(() => window.GuildApp.state.targets.map((t) => (Number.isInteger(t.fortIndex) ? (t.pos ? 'pos' : 'keep') : 'none')))), '· cache for the reader:', JSON.stringify(await gp.evaluate(() => { const k = JSON.parse(localStorage.getItem('e7-gw-fort-cache') || '{}'); return Object.fromEntries(Object.entries(k.enemy || {}).map(([i, l]) => [i, l.length])); })));
  // (as on a guildmate's PC, or after a restart: the reader has not seen this map yet)
  await lv.evaluate(() => window.E7Vision._readers.find((x) => x.id === 'guild-fortress').idle({ publish() {}, note() {} }));
  const again = await show('steam-gw-map-states-wide.jpg', ['fortress'], 40);
  await gp.waitForTimeout(500);
  c = await card();
  const all = again.got.fortress ? [...again.got.fortress.players, again.got.fortress.keep].filter(Boolean) : [];
  console.log('the same map again:', again.fortNote, '· taken from the plan:', all.filter((p) => p.fromGuild).length, 'of', all.length, '· names read again:', again.progress, '· first time it took', m.ms, 'ms, now', again.ms, 'ms');
  console.log('  card:', c.head, '· Save offered:', c.save === 1, '· marked', JSON.stringify(c.marked), '· "?" on the game:', await marks());

  // 2) several unsure names (no player list this time): the user says which box waits
  await gp.evaluate(() => { window.GuildApp.state.targets.length = 0; localStorage.removeItem('e7-gw-fort-cache'); localStorage.removeItem('e7-gw-known-names'); });
  await lv.evaluate(() => { window.__e7RecordsTest.near = async () => []; localStorage.removeItem('e7-gw-fort-cache'); localStorage.removeItem('e7-gw-known-names'); });
  await show('steam-gw-map-middle-beaten-wide.jpg', ['fortress'], 40);
  await gp.waitForTimeout(500);
  c = await card();
  console.log('a map with no list to check against: marked', JSON.stringify(c.marked));
  await gp.click('[data-fort-ask="3"]');
  await gp.waitForTimeout(200);
  console.log('  after pressing ⚠ on the fourth:', JSON.stringify((await card()).marked));
  await lv.evaluate(() => window.E7Bus.publish('guild:name-read', { text: '夕凪', options: [], rect: { x: 0.1, y: 0.2, w: 0.1, h: 0.03 } }));
  await gp.waitForTimeout(400);
  c = await card();
  console.log('  a name read on a player page -> box 4:', JSON.stringify(c.boxes[3]), '·', c.msg);
  console.log('errors:', errs);
  await b.close();
})();
