// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: text reader)
// DEVLOG #70: the opponent's PROFILE ART on the versus screen (the owner's real screens; their own name hidden):
//  1) a match: the art is read on the versus screen; the battle bar's name is remembered with it (and its picture)
//  2) the next match with the same art: the RTA page names the opponent BEFORE the draft (a guess: "profile art")
//  3) the battle bar's name replaces the guess when it differs
//  4) another opponent's art: "not seen before"
//  5) History → "Profile art seen": the picture with its name and a Save button
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
const dataUrl = (f) => `data:image/${f.endsWith('.png') ? 'png' : 'jpeg'};base64,` + __fs.readFileSync(__path.join(FX, f)).toString('base64');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
  const errs = [];
  const rp = await ctx.newPage();
  rp.on('pageerror', (e) => errs.push('rta: ' + e.message));
  await rp.goto(BASE + 'rta.html');
  await rp.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('e7-rta-arts'); });
  await rp.reload();
  await rp.waitForTimeout(1200);
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  const versus = (file) =>
    lv.evaluate(async (url) => {
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.src = url; });
      window.E7Vision._useSource(im);
      const T = window.E7RtaDraft.tracker;
      T.reset(); T.vsFirst = null;
      let ev = null;
      const off = window.E7Bus.on('rta:art', (d) => (ev = d));
      for (let i = 0; i < 5; i++) await window.E7Vision.tick(true);
      off();
      return { stage: T.stage, note: window.E7Vision._readers.find((q) => q.id === 'rta-art').note, ev };
    }, dataUrl(file));
  const battle = (name) => lv.evaluate((name) => window.E7Bus.publish('rta:battle', { me: { name: 'Tester', server: 'Global', guild: '' }, opp: { name, server: 'Global', guild: '' }, sameGuild: false }), name);
  const rtaState = () => rp.evaluate(() => ({ opponent: window.RTAApp.store.draft.opponent, from: window.RTAApp.store.draft.opponentFrom || '', status: document.querySelector('#auto-status').textContent.replace(/\s+/g, ' ').trim().slice(0, 150) }));

  const v1 = await versus('steam-rta-versus-wide.jpg');
  console.log('1) versus screen:', v1.stage, '·', v1.note, '· event names:', JSON.stringify(v1.ev && v1.ev.names));
  await battle('Rival_77');
  await lv.waitForTimeout(300);
  console.log('   remembered:', await lv.evaluate(async () => {
    const list = JSON.parse(localStorage.getItem('e7-rta-arts') || '[]');
    const pics = await window.E7ArtStore.all();
    return `${list.length} art(s), names ${JSON.stringify(list.map((e) => e.names.map((x) => x.name + ' ' + x.n)))}, pictures ${pics.length} (${pics[0] ? pics[0].w + '×' + pics[0].h : '-'})`;
  }));
  // the next match: a fresh draft on the RTA page, the same art
  await rp.evaluate(() => window.RTAApp.replaceDraft(window.RTALogic.newDraft('me'), { newMatch: true }));
  const v2 = await versus('steam-rta-versus-wide.jpg');
  await rp.waitForTimeout(400);
  console.log('2) same art again:', v2.note, '· RTA page:', JSON.stringify(await rtaState()));
  await lv.evaluate(() => window.E7RtaDraft.tracker.reset());
  await battle('Rival_78');
  await rp.waitForTimeout(400);
  console.log('3) the battle bar says Rival_78:', JSON.stringify(await rtaState()));
  const v4 = await versus('steam-rta-match-start.png');
  console.log('4) another opponent\'s art:', v4.note, '· event names:', JSON.stringify(v4.ev && v4.ev.names));
  await rp.click('.tab[data-tab=history]');
  await rp.click('#art-gallery summary');
  await rp.waitForTimeout(500);
  console.log('5) gallery:', JSON.stringify(await rp.evaluate(() => ({ count: document.querySelector('#art-count').textContent, figures: [...document.querySelectorAll('#art-grid figure')].map((f) => ({ names: f.querySelector('figcaption').textContent, save: f.querySelector('a').getAttribute('download'), img: f.querySelector('img').naturalWidth })) }))));
  console.log('errors:', errs);
  await b.close();
})();
