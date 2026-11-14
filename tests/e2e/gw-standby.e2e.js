// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: OCR)
// DEVLOG #46, "that is the guild war standby page if no guild wars are around, so detect that":
//  1) the owner's real standby screen (2000×1070) and the same page in a small window with a title bar (cut from the
//     pixels as the watcher does): "no war running, next war in 29 h", season 2026-3
//  2) other real screens are NOT taken for it (overview, fortress map, enemy defense, RTA ban, lobby)
//  3) Guild War page: the banner with the next war's time; a war still open is marked finished, with Undo; after Undo
//     another standby reading leaves the war alone
//  4) an overview read afterwards (a war is on again) starts that war and the banner goes away
//  5) a page opened later uses whichever the game showed last
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
const { autoAsk, ask } = require('./_ask.js');
const dataUrl = (f) => `data:image/${f.endsWith('.png') ? 'png' : 'jpeg'};base64,` + __fs.readFileSync(__path.join(FX, f)).toString('base64');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
  await autoAsk(ctx);
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
  await ask(gp, ['Old Foes', '']);
  await gp.click('#war-new');
  await gp.waitForTimeout(400);
  const wars = () => gp.evaluate(() => window.GuildApp.state.wars.map((w) => `${w.enemyGuild}:${w.status}`));
  console.log('wars at start:', JSON.stringify(await wars()), '· standby banner visible:', await gp.isVisible('#war-standby'));

  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  /** Show the watcher a picture (title bar cut from the pixels first) and run all readers a few times. */
  const show = (file, reset = true) =>
    lv.evaluate(async ([url, reset2]) => {
      let im = new Image();
      await new Promise((r) => {
        im.onload = r;
        im.src = url;
      });
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
        await new Promise((r) => {
          im.onload = r;
          im.src = c1.toDataURL('image/png');
        });
      }
      window.E7Vision._useSource(im);
      if (reset2) window.E7GuildStandby._reset();
      const R = (id) => window.E7Vision._readers.find((x) => x.id === id);
      R('guild-overview').idle();
      for (const r of window.E7Vision._readers) r.note = '';
      const got = { standby: null, forts: null };
      const off1 = window.E7Bus.on('guild:standby', (d) => (got.standby = d));
      const off2 = window.E7Bus.on('guild:forts', (d) => (got.forts = d));
      for (let i = 0; i < 4; i++) {
        await window.E7Vision.tick(true);
        await new Promise((res) => setTimeout(res, 250));
      }
      off1();
      off2();
      return { size: [im.naturalWidth, im.naturalHeight], note: R('guild-standby').note, overview: R('guild-overview').note, ...got };
    }, [dataUrl(file), reset]);

  // 2) first: other screens are not the standby page
  for (const f of ['steam-gw-overview-ours-wide-blurred.jpg', 'steam-gw-map-stinger-wide.jpg', 'steam-gw-enemy-wide.jpg', 'steam-rta-ban.png', 'steam-window-titlebar-lobby.jpg']) {
    const r = await show(f);
    console.log(`${f}: standby event ${r.standby ? 'SENT (wrong)' : 'none'} · ${r.note}`);
  }
  await gp.waitForTimeout(600);
  // (our side's overview names the enemy guild "TestEnemies": that war is started by itself; undo it for this test)
  if (await gp.isVisible('#war-auto-undo')) await gp.click('#war-auto-undo');
  await gp.waitForTimeout(400);
  await lv.evaluate(() => localStorage.removeItem('e7-gw-dismissed'));
  console.log('wars before the standby page:', JSON.stringify(await wars()));

  // 1) the standby page, full size and in a small window
  const s1 = await show('steam-gw-standby-wide.jpg');
  console.log('standby 2000×1070:', s1.note, JSON.stringify(s1.standby && { minutes: s1.standby.minutes, season: s1.standby.season, text: s1.standby.text }), '· overview reader:', s1.overview);
  await gp.waitForTimeout(900);
  // 3) the Guild War page
  console.log('banner:', (await gp.textContent('#war-standby')).replace(/\s+/g, ' ').trim().replace(/around [^)]*\)/, 'around <time>)').slice(0, 230));
  console.log('wars:', JSON.stringify(await wars()), '·', (await gp.textContent('#war-auto')).replace(/\s+/g, ' ').trim());
  console.log('shared with the guild:', JSON.stringify(await gp.evaluate(() => { const n = window.GuildApp.state.settings && window.GuildApp.state.settings.nextWar; return n ? { season: n.season, by: n.by, hours: Math.round((Date.parse(n.beginsAt) - Date.parse(n.at)) / 3600000) } : null; })));
  await gp.click('#war-auto-undo');
  await gp.waitForTimeout(500);
  console.log('after Undo:', JSON.stringify(await wars()));
  const s2 = await show('steam-gw-standby-window.jpg');
  console.log(`standby in a small window ${s2.size.join('×')} (title bar cut):`, s2.note, JSON.stringify(s2.standby && { minutes: s2.standby.minutes, season: s2.standby.season }));
  await gp.waitForTimeout(900);
  console.log('after another standby reading (undone before -> left alone):', JSON.stringify(await wars()));
  // while the page stays open it is read again only once a minute
  const s3 = await show('steam-gw-standby-window.jpg', false);
  console.log('same page again:', s3.note, '· event', s3.standby ? 'sent again' : 'not repeated');

  // 4) a war is on again: the enemy overview
  const o = await show('steam-gw-overview-wide-blurred.jpg');
  await gp.waitForTimeout(1200);
  console.log('overview read:', o.overview, '· standby reader:', o.note);
  console.log('wars:', JSON.stringify(await wars()), '· standby banner visible:', await gp.isVisible('#war-standby'));

  // 5) pages opened later: the overview was the last thing shown -> the war stays; then standby is the last -> finished
  const gp2 = await ctx.newPage();
  gp2.on('pageerror', (e) => errs.push('guild2: ' + e.message));
  await gp2.goto(BASE + 'guild.html');
  await gp2.waitForTimeout(2500);
  console.log('page opened after the overview:', JSON.stringify(await gp2.evaluate(() => window.GuildApp.state.wars.filter((w) => w.status !== 'done').map((w) => w.enemyGuild))), '· banner visible:', await gp2.isVisible('#war-standby'));
  await gp2.close();
  await gp.close();
  await lv.evaluate(() => localStorage.removeItem('e7-gw-standby-undone'));
  await show('steam-gw-standby-wide.jpg');
  const gp3 = await ctx.newPage();
  gp3.on('pageerror', (e) => errs.push('guild3: ' + e.message));
  await gp3.goto(BASE + 'guild.html');
  await gp3.waitForTimeout(3000);
  console.log('page opened after the standby page: open wars', JSON.stringify(await gp3.evaluate(() => window.GuildApp.state.wars.filter((w) => w.status !== 'done').map((w) => w.enemyGuild))), '· banner visible:', await gp3.isVisible('#war-standby'));
  console.log('errors:', errs);
  await b.close();
})();
