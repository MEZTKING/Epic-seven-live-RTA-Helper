// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: hero pictures, text reader)
// DEVLOG #63: one whole World Arena match on the owner's REAL screens (2000×1070; the owner's name and guild blacked
// out, the names on the battle bar replaced by made-up ones), followed by the game watcher with nothing drawn or taught:
//  1) versus screen -> who picks first
//  2) the pre-ban window with two heroes selected -> my two pre-bans, before the draft begins
//  3) the draft while picking -> all four pre-bans (the small round icons at the bottom) and the cards so far
//  4) the BAN screen -> all of my cards, four of theirs (the fifth is darkened: I have clicked it)
//  5) the formation screen -> the fifth, and BOTH bans from the darkened BANNED cards
//  6) the RTA page has the complete draft (pre-bans, picks, bans) with no click
//  7) the battle -> the opponent's name (hidden during the draft) and "same guild" -> the match is marked for fun
//  8) the result screen -> recorded as a normal match, kept in History, counted nowhere; "Count it" counts it again
//  9) round icons come from the game's own files (the official site's are older artwork for many heroes)
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
const dataUrl = (f) => `data:image/${f.endsWith('.png') ? 'png' : 'jpeg'};base64,` + __fs.readFileSync(__path.join(FX, f)).toString('base64');
const OWN = ['Mort', 'Ambitious Tywin', 'Salome', 'Closer Charles', 'Auxiliary Lots'];
const ENEMY = ['Desert Jewel Basar', 'Jenua', 'Sea Phantom Politis', 'Lone Wolf Peira', 'Aubade Ludwig'];
const PRE = ['Stark', 'Fern', 'Rhianna and Luciella', 'Lisette'];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
  const errs = [];
  const rp = await ctx.newPage();
  rp.on('pageerror', (e) => errs.push('rta: ' + e.message));
  rp.on('dialog', (d) => d.accept());
  await rp.goto(BASE + 'rta.html');
  await rp.evaluate(() => localStorage.clear());
  await rp.reload();
  await rp.click('.tab[data-tab=auto]');
  await rp.setInputFiles('#auto-shot', __path.join(FX, 'steam-rta-menu.png'));
  await rp.waitForFunction(() => window.RTAAuto._officialLoad.total > 0 && window.RTAAuto._officialLoad.done >= window.RTAAuto._officialLoad.total, null, { timeout: 120000 });
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  await lv.evaluate(() => { window.E7RtaDraft.loadWide(); window.E7RtaDraft.loadRound(); });
  await lv.waitForFunction(() => window.E7RtaDraft.wideReady() && window.E7RtaDraft.roundReady(), null, { timeout: 240000 });
  console.log('hero pictures:', await lv.evaluate(() => `${window.E7RtaDraft.wide.enemy.length} wide portraits · ${window.E7Icons.base().length} round icons + ${window.E7Icons.all().length - window.E7Icons.base().length} skins · from: ${[...new Set(window.E7Icons.all().map((t) => t.source))].join(', ')}`));
  await lv.evaluate(() => { const T = window.E7RtaDraft.tracker; T.reset(); T.vsFirst = null; });
  const show = (file, ticks = 4, reader = 'rta-draft') =>
    lv.evaluate(async ({ url, ticks, reader }) => {
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.src = url; });
      window.E7Vision._useSource(im);
      let last = null;
      const off = window.E7Bus.on('rta:draft', (d) => (last = d));
      for (let i = 0; i < ticks; i++) await window.E7Vision.tick(true);
      off();
      return { note: window.E7Vision._readers.find((q) => q.id === reader).note, names: last && last.names };
    }, { url: dataUrl(file), ticks, reader });
  const hits = (got, want) => (got || []).filter((n, i) => n === want[i]).length;
  const same = (got, want) => (got || []).filter(Boolean).length === want.length && want.every((n) => (got || []).includes(n));

  // 0) another match (DEVLOG #64): MY turn, hovering a hero (shown on my card, not confirmed) -> held, not a pick;
  //    an empty enemy card is not a hero
  for (const [f, want] of [['steam-rta-myturn1-wide.jpg', 'Westwind Executioner Schuri'], ['steam-rta-myturn2-wide.jpg', 'Renoa'], ['steam-rta-myturn3-wide.jpg', 'Shepherd of the Dark Diene']]) {
    const r = await lv.evaluate(async (url) => {
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.src = url; });
      window.E7Vision._useSource(im);
      const T = window.E7RtaDraft.tracker;
      T.reset(); T.vsFirst = null;
      for (let i = 0; i < 3; i++) await window.E7Vision.tick(true);
      const N = (c) => (c ? window.RTAApp ? c : c : null);
      const NAME = new Map(window.RTASources.allHeroes.map((h) => [h.code, h.name]));
      return { own: T.own.map((c) => NAME.get(c) || null), enemy: T.enemy.map((c) => NAME.get(c) || null), held: Object.values(T.held).map((c) => NAME.get(c)) };
    }, dataUrl(f));
    console.log(`0) my turn ${f.match(/\d/)[0]}: hovered ${JSON.stringify(r.held)} (right: ${r.held.length === 1 && r.held[0] === want}, not a pick: ${!r.own.includes(want)}) · picks mine ${r.own.filter(Boolean).length} theirs ${r.enemy.filter(Boolean).length} ${JSON.stringify(r.enemy)}`);
  }
  await lv.evaluate(() => { const T = window.E7RtaDraft.tracker; T.reset(); T.vsFirst = null; });
  console.log('1) versus:', (await show('steam-rta-versus-wide.jpg')).note);
  const pb = await show('steam-rta-preban-chosen-wide.jpg');
  console.log('2) pre-ban window:', pb.note, '· my pre-bans so far:', JSON.stringify(pb.names && pb.names.prebans));
  const pk = await show('steam-rta-pick-wide.jpg');
  console.log('3) picking:', pk.note);
  console.log(`   pre-bans ${hits(pk.names.prebans, PRE)}/4 ${JSON.stringify(pk.names.prebans)} · mine ${hits(pk.names.own, OWN.slice(0, 4))}/4 · theirs ${hits(pk.names.enemy, ENEMY.slice(0, 3))}/3`);
  const bn = await show('steam-rta-ban-wide.jpg');
  console.log('4) BAN screen:', bn.note, `· mine ${hits(bn.names.own, OWN)}/5 · theirs ${hits(bn.names.enemy, ENEMY)}/5 · bans yet: ${JSON.stringify(bn.names.bans)}`);
  const fm = await show('steam-rta-formation-wide.jpg');
  console.log('5) formation:', fm.note);
  console.log(`   mine ${hits(fm.names.own, OWN)}/5 · theirs ${hits(fm.names.enemy, ENEMY)}/5 · banned: ${JSON.stringify(fm.names.bans)} (right: ${fm.names.bans.own === OWN[4] && fm.names.bans.enemy === ENEMY[4]})`);
  await rp.click('.tab[data-tab=draft]');
  await rp.waitForTimeout(700);
  const draft = await rp.evaluate(() => {
    const d = window.RTAApp.store.draft;
    const v = window.RTALogic.draftView(d);
    const n = (a) => a.map(window.RTAApp.nameOf);
    return { complete: window.RTALogic.isComplete(d), firstPick: d.firstPick, preMe: n(v.prebans.me), preOpp: n(v.prebans.opp), me: n(v.picks.me), opp: n(v.picks.opp), iBanned: n(v.postbans.me), theyBanned: n(v.postbans.opp), status: document.querySelector('#draft-status').textContent };
  });
  console.log(`6) RTA page, no click: complete ${draft.complete} · first pick ${draft.firstPick} · my pre-bans right ${same(draft.preMe, PRE.slice(0, 2))} · theirs right ${same(draft.preOpp, PRE.slice(2))} · mine ${hits(draft.me, OWN)}/5 · theirs ${hits(draft.opp, ENEMY)}/5 · I banned ${JSON.stringify(draft.iBanned)} · they banned ${JSON.stringify(draft.theyBanned)}`);
  console.log('   status line:', draft.status);

  // 7) the battle: first the draft's texts are gone for 10 s (the draft is over), then the bar is read
  await show('steam-rta-battle-wide.jpg', 2);
  await lv.waitForTimeout(10600);
  const bt = await show('steam-rta-battle-wide.jpg', 3, 'rta-battle');
  console.log('7) battle bar:', bt.note);
  await rp.waitForTimeout(700);
  await rp.click('.tab[data-tab=draft]');
  const fun = await rp.evaluate(() => ({ opponent: window.RTAApp.store.draft.opponent, fun: window.RTAApp.store.draft.fun || null, box: document.querySelector('#fun-box').classList.contains('hidden') ? '(hidden)' : document.querySelector('#fun-box').textContent.replace(/\s+/g, ' ').trim() }));
  console.log('   RTA page: opponent', JSON.stringify(fun.opponent), '· for fun:', JSON.stringify(fun.fun), '·', fun.box.slice(0, 150));
  // a Guild War battle has the same bar: without an arena draft just before, nothing is read
  const idle = await lv.evaluate(async (url) => {
    const im = new Image();
    await new Promise((r) => { im.onload = r; im.src = url; });
    window.E7Vision._useSource(im);
    window.E7RtaDraft.seenAt = 0;
    let ev = 0;
    const off = window.E7Bus.on('rta:battle', () => ev++);
    for (let i = 0; i < 2; i++) await window.E7Vision.tick(true);
    off();
    return { ev, note: window.E7Vision._readers.find((q) => q.id === 'rta-battle').note };
  }, dataUrl('steam-rta-battle-wide.jpg'));
  console.log('   the same bar with no arena draft before it:', idle.note, '· events:', idle.ev);

  // 8) the result screen (read by the RTA page's own reader)
  await rp.click('.tab[data-tab=auto]');
  for (let k = 0; k < 2; k++) {
    await rp.setInputFiles('#auto-shot', __path.join(FX, 'steam-rta-victory-opponent-left-wide.jpg'));
    await rp.waitForTimeout(300);
    await rp.evaluate(() => window.RTAAuto._setLive(true));
    for (let i = 0; i < 3; i++) {
      await rp.evaluate(() => window.RTAAuto.tick());
      await rp.waitForTimeout(2200);
    }
    if (await rp.evaluate(() => window.RTAApp.store.matches.length)) break;
  }
  const rec = await rp.evaluate(() => {
    const A = window.RTAApp;
    const n = (c) => (c ? A.nameOf(c) : null);
    return { matches: A.store.matches.map((m) => ({ result: m.result, source: m.source, opponent: m.opponent, fun: !!m.fun, why: m.funWhy || '', bansUnknown: !!m.bansUnknown, iBanned: n(m.iBanned), theyBanned: n(m.theyBanned), pre: m.myPrebans.length + m.oppPrebans.length, picks: m.myPicks.length + m.oppPicks.length })), counted: A.cache.enabledMatches.length, walkovers: (A.store.walkovers || []).length, draftActions: A.store.draft.actions.length, nextFun: A.store.draft.fun || null };
  });
  console.log('8) after the result screen:', JSON.stringify(rec));
  await rp.click('.tab[data-tab=history]');
  await rp.waitForTimeout(300);
  const hist = async () => ({
    card: (await rp.locator('#hist-fun').count()) ? (await rp.textContent('#hist-fun')).replace(/\s+/g, ' ').trim().slice(0, 60) : '(no card)',
    counted: (await rp.textContent('#hist-summary .card')).replace(/\s+/g, ' ').trim().slice(0, 40),
    row: (await rp.locator('#hist-list li').count()) ? (await rp.textContent('#hist-list li div.meta')).replace(/\s+/g, ' ').trim().slice(0, 70) : '(no row)',
    button: (await rp.locator('#hist-list [data-fun]').count()) ? await rp.textContent('#hist-list [data-fun]') : '(no button)',
  });
  console.log('   History:', JSON.stringify(await hist()));
  await rp.click('#hist-list [data-fun]');
  await rp.waitForTimeout(200);
  console.log('   after "Count it":', JSON.stringify(await hist()));
  await rp.click('#hist-list [data-fun]');
  await rp.waitForTimeout(200);
  console.log('   after "For fun" again:', JSON.stringify(await hist()));
  console.log('errors:', errs);
  await b.close();
})();
