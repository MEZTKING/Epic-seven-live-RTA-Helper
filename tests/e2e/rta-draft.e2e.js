// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: hero pictures)
// DEVLOG #41, the World Arena draft read with nothing drawn or taught (method + layout from E7DaT), on the owner's REAL
// screens (tests/fixtures/screens):
//  1) the BAN screen (1340×754): stage "final ban", all 10 pick cards named from the wide portraits, including six
//     heroes the official list doesn't have yet (they come from the Fribbels dataset); my cards count as confirmed
//  2) the same screen as a 2000-wide picture, cards kept where a wider window would put them (mine left, theirs middle)
//  3) screens that are NOT a draft (arena menu, match found, pre-ban picker, Guild War): no stage, nothing read
//  4) the versus screen: "First Pick" marker -> who picks first
//  5) the RTA page takes the draft from the watcher: both teams appear in the draft, no calibration
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
const dataUrl = (f) => `data:image/${f.endsWith('.png') ? 'png' : 'jpeg'};base64,` + __fs.readFileSync(__path.join(FX, f)).toString('base64');
const OWN = ['School Nurse Yulha', 'Estelle', 'Boss Arunka', 'Haru', 'Genesis Ras'];
const ENEMY = ['Rhianna and Luciella', 'Tidal Rift Elvira', 'Zio', 'Shepherd of the Dark Diene', 'Eye of the Abyss Fumyr'];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
  const errs = [];
  // the RTA page (listens to the watcher)
  const rp = await ctx.newPage();
  rp.on('pageerror', (e) => errs.push('rta: ' + e.message));
  rp.on('dialog', (d) => d.accept());
  await rp.goto(BASE + 'rta.html');
  await rp.evaluate(() => localStorage.clear());
  await rp.reload();
  // the game watcher
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  await lv.evaluate(() => { window.E7RtaDraft.loadWide(); window.E7RtaDraft.loadRound(); });
  await lv.waitForFunction(() => window.E7RtaDraft.wideReady() && window.E7RtaDraft.roundReady(), null, { timeout: 180000 });
  console.log('hero pictures:', await lv.evaluate(() => `${window.E7RtaDraft.wide.enemy.length} wide portraits of ${new Set(window.E7RtaDraft.wide.enemy.map((t) => t.code)).size} heroes · ${window.E7RtaDraft.round.tpl.length} round icons`));
  const show = (url, wide) =>
    lv.evaluate(async ({ url, wide }) => {
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.src = url; });
      let src = im;
      if (wide) {
        // a 2000×1070 picture: left part pinned left, the rest (enemy cards, label) pinned to the middle
        const H = 1070, w16 = Math.round((H * 16) / 9), c = document.createElement('canvas');
        c.width = 2000; c.height = H;
        const x = c.getContext('2d');
        x.drawImage(im, (2000 - w16) / 2, 0, w16, H);
        const cut = 0.3 * im.width;
        x.fillStyle = '#000'; x.fillRect(0, 0.12 * H, (2000 - w16) / 2 + 0.3 * w16, 0.8 * H);
        x.drawImage(im, 0, 0.12 * im.height, cut, 0.8 * im.height, 0, 0.12 * H, 0.3 * w16, 0.8 * H);
        src = c;
      }
      window.E7Vision._useSource(src);
      const T = window.E7RtaDraft.tracker;
      T.reset(); T.vsFirst = null;
      const r = window.E7Vision._readers.find((q) => q.id === 'rta-draft');
      let last = null;
      const off = window.E7Bus.on('rta:draft', (d) => (last = d));
      const t0 = performance.now();
      for (let i = 0; i < 4; i++) await window.E7Vision.tick(true);
      const ms = Math.round((performance.now() - t0) / 4);
      off();
      return { note: r.note, ms, stage: T.stage, own: last && last.names.own, enemy: last && last.names.enemy, held: last && last.held, first: T.firstPick };
    }, { url, wide });
  const hits = (got, want) => (got || []).filter((n, i) => n === want[i]).length;

  const ban = await show(dataUrl('steam-rta-ban.png'));
  console.log(`BAN screen: ${ban.note} · ${ban.ms} ms per look`);
  console.log(`  mine ${hits(ban.own, OWN)}/5 ${JSON.stringify(ban.own)}`);
  console.log(`  theirs ${hits(ban.enemy, ENEMY)}/5 ${JSON.stringify(ban.enemy)} · held (unconfirmed): ${JSON.stringify(ban.held)}`);
  console.log('  my cards look confirmed (share of solid blue in each card\'s check band, needs ≥ 0.30):', JSON.stringify(await lv.evaluate(() => window.E7RtaDraft._locks())));
  await rp.waitForTimeout(600);
  const draft = await rp.evaluate(() => {
    const v = window.RTALogic.draftView(window.RTAApp.store.draft);
    return { me: v.picks.me.map(window.RTAApp.nameOf), opp: v.picks.opp.map(window.RTAApp.nameOf) };
  });
  console.log(`RTA page draft (no calibration): mine ${hits(draft.me, OWN)}/5 · theirs ${hits(draft.opp, ENEMY)}/5`, JSON.stringify(draft));

  const wide = await show(dataUrl('steam-rta-ban.png'), true);
  console.log(`same screen as a 2000×1070 window: ${wide.note} · mine ${hits(wide.own, OWN)}/5 · theirs ${hits(wide.enemy, ENEMY)}/5`);

  for (const f of ['steam-rta-menu.png', 'steam-rta-match-found.png', 'steam-rta-preban-select.png', 'steam-rta-preban-select2.png', 'steam-gw-enemy.png', 'steam-rta-victory.png']) {
    const r = await show(dataUrl(f));
    console.log(`${f}: stage ${r.stage} · read ${JSON.stringify([...(r.own || []), ...(r.enemy || [])].filter(Boolean))}`);
  }
  const vs = await show(dataUrl('steam-rta-match-start.png'));
  console.log(`versus screen: stage ${vs.stage} · first pick: ${vs.first}`);
  // 6) the next app start: hero pictures come from the template cache, nothing is downloaded again (DEVLOG #43)
  const again = await ctx.newPage();
  again.on('pageerror', (e) => errs.push('again: ' + e.message));
  let pictures = 0;
  again.on('request', (r) => /raw\.githubusercontent\.com|smilegatemegaport\.com\/event/.test(r.url()) && pictures++);
  await again.goto(BASE + 'live.html');
  await again.evaluate(() => { window.E7RtaDraft.loadWide(); window.E7RtaDraft.loadRound(); });
  await again.waitForFunction(() => window.E7RtaDraft.wideReady() && window.E7RtaDraft.roundReady(), null, { timeout: 60000 });
  console.log('second start:', await again.evaluate(() => `wide from cache ${window.E7RtaDraft.wide.fromCache} (${window.E7RtaDraft.wide.enemy.length}) · round from cache ${window.E7RtaDraft.round.fromCache} (${window.E7RtaDraft.round.tpl.length})`), '· picture downloads:', pictures);
  const ban2 = await again.evaluate(async (url) => {
    const im = new Image();
    await new Promise((r) => { im.onload = r; im.src = url; });
    window.E7Vision._useSource(im);
    let last = null;
    const off = window.E7Bus.on('rta:draft', (d) => (last = d));
    for (let i = 0; i < 4; i++) await window.E7Vision.tick(true);
    off();
    return last && [...last.names.own, ...last.names.enemy];
  }, dataUrl('steam-rta-ban.png'));
  console.log('BAN screen read from cached templates:', hits(ban2 || [], [...OWN, ...ENEMY]), '/ 10');
  console.log('errors:', errs);
  await b.close();
})();
