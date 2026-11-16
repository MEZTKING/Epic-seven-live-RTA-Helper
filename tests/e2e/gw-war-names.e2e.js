// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: text reader + its
// Japanese data from the CDN)
// DEVLOG #55, the owner's screens of a running war (names replaced, see tools/dev/redact-gw-screens.py):
//  1) the overview: both guild names, their servers, "War Ends in 17h" -> the war starts by itself, with its end time
//  2) a fortress map in a small window is NOT taken for the overview any more (that started a war against a made-up
//     guild and overwrote the fortress names with nonsense)
//  3) names on the map in katakana, hiragana, kanji and Latin letters, read with the enemy server's language data;
//     close spellings from that server's player list (stand-in) are used / offered; the name's picture is shown, a
//     click on an offered spelling fills the box
//  4) the VS screen and the guild hall start nothing
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
    // the server's player list (stand-in for the desktop bridge): what is close to a text read from the screen
    const LIST = ['ハナコサン', 'みどりかわ', '山田太郎', '山田次郎', 'moonpie77', 'moonpie78', 'KeepJP1'];
    const dist = (a, c) => { const A = [...a.toLowerCase()], C = [...c.toLowerCase()]; const d = A.map((_, i) => [i + 1]); const top = [0, ...C.map((_, j) => j + 1)]; let prev = top; for (let i = 0; i < A.length; i++) { const cur = [i + 1]; for (let j = 0; j < C.length; j++) cur.push(Math.min(prev[j + 1] + 1, cur[j] + 1, prev[j] + (A[i] === C[j] ? 0 : 1))); prev = cur; } return prev[C.length]; };
    window.__e7NearCalls = [];
    window.__e7RecordsTest = {
      find: async () => [],
      game: async () => ({}),
      near: async (world, text) => {
        window.__e7NearCalls.push(world);
        return LIST.map((name) => ({ name, d: dist(text, name), rank: 70 })).filter((x) => x.d <= 2).sort((x, y) => x.d - y.d).slice(0, 3);
      },
    };
  });
  const errs = [];
  const gp = await ctx.newPage();
  gp.on('pageerror', (e) => errs.push('guild: ' + e.message));
  gp.on('dialog', (d) => d.accept());
  await gp.goto(BASE + 'guild.html');
  await gp.evaluate(() => localStorage.clear());
  await gp.reload();
  await gp.click('.tab[data-tab=setup]');
  await gp.fill('#my-name', 'Ann');
  await gp.press('#my-name', 'Tab');
  await gp.fill('#guild-name', 'TestHome');
  await gp.click('#guild-create');
  await gp.waitForTimeout(300);
  await gp.click('.tab[data-tab=war]');
  const wars = () => gp.evaluate(() => window.GuildApp.state.wars.map((w) => `${w.enemyGuild}:${w.status}`));
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  const show = (file) =>
    lv.evaluate(async (url) => {
      let im = new Image();
      await new Promise((r) => { im.onload = r; im.src = url; });
      const c0 = document.createElement('canvas');
      c0.width = im.width;
      c0.height = im.height;
      const x0 = c0.getContext('2d');
      x0.drawImage(im, 0, 0);
      const fr = window.E7Frame.detect(x0.getImageData(0, 0, im.width, im.height).data, im.width, im.height);
      if (fr && (fr.y > 0 || fr.h < im.height)) {
        const c1 = document.createElement('canvas');
        c1.width = fr.w;
        c1.height = fr.h;
        c1.getContext('2d').drawImage(im, fr.x, fr.y, fr.w, fr.h, 0, 0, fr.w, fr.h);
        im = new Image();
        await new Promise((r) => { im.onload = r; im.src = c1.toDataURL('image/png'); });
      }
      window.E7Vision._useSource(im);
      const R = (id) => window.E7Vision._readers.find((x) => x.id === id);
      for (const id of ['guild-overview', 'guild-fortress', 'guild-standby']) R(id).idle();
      for (const r of window.E7Vision._readers) r.note = '';
      const got = { forts: null, fortress: null, standby: null };
      const offs = [window.E7Bus.on('guild:forts', (d) => (got.forts = d)), window.E7Bus.on('guild:fortress', (d) => (got.fortress = d)), window.E7Bus.on('guild:standby', (d) => (got.standby = d))];
      for (let i = 0; i < 6; i++) {
        await window.E7Vision.tick(true);
        await new Promise((res) => setTimeout(res, 250));
        if (got.fortress) break;
      }
      for (const off of offs) off();
      return { size: [im.naturalWidth, im.naturalHeight], overview: R('guild-overview').note, fortress: R('guild-fortress').note, ...got };
    }, dataUrl(file));

  // 4) first: screens that are neither
  for (const f of ['steam-gw-hall-wide.jpg', 'steam-gw-versus-wide.jpg']) {
    const r = await show(f);
    console.log(`${f}: events ${[r.forts && 'forts', r.fortress && 'fortress', r.standby && 'standby'].filter(Boolean).join(', ') || 'none'} · ${r.overview}`);
  }
  // 1) the overview of the running war
  const o = await show('steam-gw-overview-war-wide.jpg');
  console.log('overview:', o.overview, JSON.stringify(o.forts && { ourGuild: o.forts.ourGuild, enemyGuild: o.forts.enemyGuild, ourServer: o.forts.ourServer, enemyServer: o.forts.enemyServer, endsInHours: o.forts.endsIn / 60, names: o.forts.names }));
  await gp.waitForTimeout(1200);
  console.log('wars:', JSON.stringify(await wars()));
  console.log('War tab:', (await gp.textContent('#war-summary .card')).replace(/\s+/g, ' ').replace(/around [^·]*/, 'around <time> ').trim());
  // 2) + 3) a fortress map, small window with a title bar
  const m = await show('steam-gw-map-vortex-jp-window.png');
  console.log(`map ${m.size.join('×')}: overview reader says "${m.overview}" · forts event ${m.forts ? 'SENT (wrong)' : 'none'}`);
  console.log('  fortress reader:', m.fortress && `${m.fortress.fort} (${m.fortress.side})`);
  const all = m.fortress ? [...m.fortress.players, m.fortress.keep].filter(Boolean) : [];
  console.log('  names:', JSON.stringify(all.map((p) => `${p.name}${p.official ? ' ✓official' : ''}${(p.options || []).length ? ` [also: ${p.options.join(', ')}]` : ''}`)));
  const want = ['ハナコサン', 'みどりかわ', '山田太郎', 'moonpie77', 'KeepJP1'];
  console.log('  exactly right:', want.filter((w) => all.some((p) => p.name === w)).length, 'of', want.length, '· pictures of the names:', all.filter((p) => /^data:image\/jpeg/.test(p.pic || '')).length, '· player list asked for server:', JSON.stringify(await lv.evaluate(() => [...new Set(window.__e7NearCalls)])));
  await gp.waitForTimeout(800);
  console.log('wars after the map (no new one):', JSON.stringify(await wars()), '· fortress names kept:', JSON.stringify(await gp.evaluate(() => JSON.parse(localStorage.getItem('e7-gw-forts')).enemy)));
  // the Guild War page: pictures, offered spellings, click to use one
  console.log('Seen in game:', (await gp.textContent('#gw-fort-seen b')).trim(), '· pictures', await gp.locator('#gw-fort-seen .gw-fort-pic').count(), '· offered spellings', JSON.stringify(await gp.$$eval('#gw-fort-seen [data-fort-opt]', (bs) => bs.map((x) => x.textContent))));
  const opt = gp.locator('#gw-fort-seen [data-fort-opt]').first();
  if (await opt.count()) {
    const i = await opt.getAttribute('data-fort-opt');
    const v = await opt.textContent();
    await opt.click();
    console.log(`  clicking "${v}" fills its box:`, (await gp.inputValue(`#gw-fort-seen [data-fort-i="${i}"]`)) === v);
  }
  await gp.evaluate(() => document.activeElement && document.activeElement.blur()); // (the card saves by itself, DEVLOG #62)
  await gp.waitForTimeout(600);
  console.log('saved:', await gp.textContent('#gw-fort-msg'), '· targets', JSON.stringify(await gp.evaluate(() => window.GuildApp.state.targets.map((t) => t.player))));
  console.log('errors:', errs);
  await b.close();
})();
