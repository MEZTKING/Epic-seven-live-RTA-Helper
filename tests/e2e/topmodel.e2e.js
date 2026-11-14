// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// DEVLOG #45, the win-rate model fitted on top players' games, inside the page. 6,000 MADE-UP games between real hero
// codes are put into the records database, with planted effects:
//   A strong · B + C strong together · D beats E · second-pick players pre-ban P a lot · first-pick players open with O
//  1) the model is fitted in a worker and described on the Data tab (with its self-check)
//  2) draft (my turn): suggestion reasons from the model (labelled 'top players'), the win-chance line
//  3) pre-ban ideas from what top players pre-ban
//  4) final ban: the third pick cannot be banned; the model's ban; "they will likely ban"
//  5) after a restart the stored model is used (no second fit); switching the source off removes its reasons
//  6) the statistics tab "Top players" (DEVLOG #47)
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const { chromium } = require('playwright');
const { autoAsk } = require('./_ask.js');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
  await autoAsk(ctx);
  await ctx.addInitScript(() => {
    // the desktop bridge stand-in (no lookups are made in this test)
    window.__e7RecordsTest = { find: async () => [], game: async () => ({}) };
    const W = window.Worker;
    window.__workers = 0;
    window.Worker = function (url, o) {
      window.__workers++;
      return new W(url, o);
    };
  });
  const errs = [];
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('rta: ' + e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(BASE + 'rta.html');
  await p.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('e7-records'); q.onsuccess = q.onerror = q.onblocked = r; }); });
  await p.reload();
  await p.waitForFunction(() => window.RTAApp && window.RTAApp.cache.heroes.length > 100 && window.E7RecordsApp);

  // made-up games between real heroes
  const names = await p.evaluate(async () => {
    let s = 7;
    const R = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const codes = window.RTAApp.cache.heroes.slice(0, 40).map((h) => h.code);
    const [A, B, C, D, E, , , , P, O] = codes;
    // a dozen more pairs and counters among the other heroes, so that pair terms are worth keeping (as in real games)
    const more = [];
    for (let k = 0; k < 24; k++) more.push([codes[5 + Math.floor(R() * 15)], codes[5 + Math.floor(R() * 15)], k % 2 ? 'syn' : 'ctr']);
    const z1 = (team, other) => {
      let z = (team.includes(A) ? 0.6 : 0) + (team.includes(B) && team.includes(C) ? 0.9 : 0) + (team.includes(D) && other.includes(E) ? 0.9 : 0);
      for (const [x, y, kind] of more) if (x !== y && team.includes(x) && (kind === 'syn' ? team : other).includes(y)) z += 0.7;
      return z;
    };
    const rows = [];
    for (let g = 0; g < 6000; g++) {
      const aFirst = R() < 0.5;
      const pre = (second) => {
        const out = second && R() < 0.6 ? [P] : [];
        while (out.length < 2) {
          const c = codes[20 + Math.floor(R() * 20)];
          if (!out.includes(c)) out.push(c);
        }
        return out;
      };
      const preA = pre(!aFirst);
      const preB = pre(aFirst);
      const gone = new Set([...preA, ...preB]);
      const draft = (first) => {
        const want = [];
        if (first && R() < 0.5) want.push(O, B);
        if (R() < 0.35) want.push(A);
        if (R() < 0.3) want.push(B, C);
        if (R() < 0.25) want.push(D);
        if (R() < 0.25) want.push(E);
        const picks = [];
        for (const c of want) if (!gone.has(c) && !picks.includes(c) && picks.length < 5) picks.push(c);
        while (picks.length < 5) {
          const c = codes[Math.floor(R() * 20)];
          if (!gone.has(c) && !picks.includes(c)) picks.push(c);
        }
        for (const c of picks) gone.add(c);
        return picks;
      };
      const pa = draft(aFirst);
      const pb = draft(!aFirst);
      const banA = pa[[0, 1, 3, 4][Math.floor(R() * 4)]];
      const banB = pb[[0, 1, 3, 4][Math.floor(R() * 4)]];
      const ta = pa.filter((h) => h !== banA);
      const tb = pb.filter((h) => h !== banB);
      const z = z1(ta, tb) - z1(tb, ta) + (aFirst ? 0.15 : -0.15);
      const day = `2026-11-${String(1 + Math.floor((g / 6000) * 12)).padStart(2, '0')}`;
      rows.push({ seq: 'x' + g, day, date: `${day}T10:00:${String(g % 60).padStart(2, '0')}Z`, season: 'pvp_rta_ss21', rule: '', aGrade: 'legend', bGrade: g % 3 ? 'legend' : 'emperor', aFirst, aWin: R() < 1 / (1 + Math.exp(-z)), aNick: 1000 + Math.floor(R() * 150), aWorld: 'world_global', bNick: 2000 + Math.floor(R() * 150), bWorld: 'world_kor', a: { picks: pa, ban: banA, prebans: preA, builds: Object.fromEntries(pa.map((c) => [c, { artifact: g % 4 ? 'art-one' : 'art-two', sets: g % 4 ? ['set_speed', 'set_immune'] : ['set_max_hp', 'set_res'] }])), energy: {} }, b: { picks: pb, ban: banB, prebans: preB, builds: {}, energy: {} } });
    }
    await window.E7RecordsApp._store.addBattles(rows);
    await window.E7RecordsApp.rebuildTop();
    const n = (c) => window.RTAApp.nameOf(c);
    return { codes, A: n(A), B: n(B), C: n(C), D: n(D), E: n(E), P: n(P), O: n(O) };
  });
  const [A, B, C, D, E, , , , P, O] = names.codes;
  console.log('planted:', JSON.stringify({ strong: names.A, pair: [names.B, names.C], counter: `${names.D} beats ${names.E}`, preban: names.P, opener: names.O }));

  // 1) fitted, described
  await p.waitForFunction(() => window.E7RecordsApp.topModel());
  console.log('workers started for the fit:', await p.evaluate(() => window.__workers));
  await p.click('.tab[data-tab=data]');
  console.log('Data tab:', (await p.textContent('#rec-model')).replace(/\s+/g, ' ').slice(0, 300));

  // 2) draft: I am first pick and hold B; they hold a filler. C should come with a model reason naming B.
  await p.click('.tab[data-tab=draft]');
  const filler = names.codes[15];
  const filler2 = names.codes[19];
  await p.evaluate(([B2, f, f2]) => window.RTAApp.replaceDraft(window.RTALogic.boardToDraft({ prebans: { me: [], opp: [] }, picks: { me: [B2], opp: [f, f2] } }, 'me'), { newMatch: true }), [B, filler, filler2]);
  await p.waitForTimeout(400);
  const reasonsFor = (code) => p.evaluate((c) => {
    const A2 = window.RTAApp;
    const d = A2.store.draft;
    const list = window.RTALogic.suggestPicks(d, A2.cache.heroes, A2.suggestionContext(), 400);
    const i = list.findIndex((x) => x.hero.code === c);
    return i < 0 ? null : { rank: i + 1, reasons: list[i].reasons.filter((r) => r.source === 'top players').map((r) => `${r.text} (${r.value > 0 ? '+' : ''}${r.value})`) };
  }, code);
  console.log('status:', (await p.textContent('#draft-status')).replace(/\s+/g, ' ').trim().slice(0, 70));
  console.log(`${names.C} (pairs with my ${names.B}):`, JSON.stringify(await reasonsFor(C)));
  console.log(`${names.A} (strong):`, JSON.stringify(await reasonsFor(A)));
  console.log('suggestion list shows the model:', /Top-player model/.test(await p.textContent('#suggest-list')));
  console.log('win chance line:', (await p.textContent('#top-model-line')).replace(/\s+/g, ' ').trim());
  // their D on the board -> my E gets a counter warning inside the model reason
  await p.evaluate(([B2, D2, f2]) => window.RTAApp.replaceDraft(window.RTALogic.boardToDraft({ prebans: { me: [], opp: [] }, picks: { me: [B2], opp: [D2, f2] } }, 'me'), { newMatch: true }), [B, D, filler2]);
  await p.waitForTimeout(300);
  console.log(`${names.E} against their ${names.D}:`, JSON.stringify(await reasonsFor(E)));

  // 3) pre-bans
  const pre = await p.evaluate((P2) => {
    const A2 = window.RTAApp;
    const d = window.RTALogic.newDraft('opp');
    const list = window.RTALogic.suggestPrebans(d, A2.cache.heroes, A2.suggestionContext(), 40);
    const i = list.findIndex((x) => x.hero.code === P2);
    return i < 0 ? null : { rank: i + 1, reasons: list[i].reasons.filter((r) => r.source === 'top players').map((r) => r.text) };
  }, P);
  console.log(`pre-ban idea ${names.P}:`, JSON.stringify(pre));

  // 4) final ban: 5 v 5, their third pick is A (strong, but it cannot be banned); their D beats my E
  const mine = [names.codes[11], names.codes[12], names.codes[13], names.codes[14], E];
  const theirs = [D, names.codes[16], A, names.codes[17], names.codes[18]];
  await p.evaluate(([m, t]) => window.RTAApp.replaceDraft(window.RTALogic.boardToDraft({ prebans: { me: [], opp: [] }, picks: { me: m, opp: t } }, 'me'), { newMatch: true }), [mine, theirs]);
  await p.waitForTimeout(400);
  console.log('status:', (await p.textContent('#draft-status')).replace(/\s+/g, ' ').trim().slice(0, 70));
  const ban = await p.evaluate(() => {
    const A2 = window.RTAApp;
    return window.RTALogic.suggestPostban(A2.store.draft, A2.cache.heroes, A2.suggestionContext(), 'me').map((x) => `${x.hero.name}: ${x.reasons.filter((r) => r.source === 'top players' || r.source === 'game rule').map((r) => r.text).join(' | ')}`);
  });
  console.log('ban ranking:', JSON.stringify(ban, null, 1));
  console.log('win chance line:', (await p.textContent('#top-model-line')).replace(/\s+/g, ' ').trim());

  // 6) the statistics tab (DEVLOG #47): tiles, the hero table (sortable, searchable), a hero's details, the lists
  await p.click('.tab[data-tab=top]');
  await p.waitForSelector('#top-stats .ts-table tbody tr');
  await p.waitForTimeout(1200); // builds are read from the stored games
  const tile = (i) => p.evaluate((k) => { const t = document.querySelectorAll('#top-stats .ts-tile')[k]; return `${t.children[0].textContent}: ${t.children[1].textContent}`; }, i);
  console.log('statistics tiles:', [await tile(0), await tile(1), await tile(2), await tile(3)].join(' · '));
  const firstRows = () => p.evaluate(() => [...document.querySelectorAll('#top-stats .ts-table tbody tr')].slice(0, 3).map((tr) => tr.children[0].textContent.trim()));
  console.log('table, most picked first:', JSON.stringify(await firstRows()), '· rows', await p.locator('#top-stats .ts-table tbody tr').count());
  await p.click('#top-stats th[data-sort=pp]');
  console.log(`sorted by strength (planted strong hero ${names.A}):`, JSON.stringify(await firstRows()));
  await p.click('#top-stats th[data-sort=prebanSecond]');
  console.log(`sorted by pre-bans of second-pick players (planted ${names.P}):`, JSON.stringify((await firstRows())[0]));
  await p.fill('#ts-q', names.C.slice(0, 5));
  await p.waitForTimeout(200);
  console.log(`search "${names.C.slice(0, 5)}":`, JSON.stringify(await firstRows()), '· the box keeps the focus:', await p.evaluate(() => document.activeElement.id === 'ts-q'));
  await p.fill('#ts-q', '');
  await p.click(`#top-stats .ts-table tr[data-ts="${C}"]`);
  await p.waitForSelector('#ts-detail');
  const det = (await p.textContent('#ts-detail')).replace(/\s+/g, ' ');
  console.log('details:', det.slice(0, 150));
  console.log(`  best with names ${names.B}:`, new RegExp('Best with\\s*' + names.B.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(det), '· pick order shown:', /3rd pick \(cannot be banned\)/.test(det), '· builds:', (det.match(/How top players build it(.{0,90})/) || ['', 'missing'])[1].trim());
  console.log('  the app\'s own hero card did not open:', await p.evaluate(() => !document.querySelector('dialog[open]')));
  const lists = await p.evaluate(() => [...document.querySelectorAll('#top-stats .ts-lists .card')].map((c) => `${c.querySelector('h4').childNodes[0].textContent.trim()}: ${(c.querySelector('.ts-row') || { textContent: '—' }).textContent.replace(/\s+/g, ' ').trim()}`));
  console.log('lists (first line of each):', JSON.stringify(lists, null, 1));
  await p.click('#ts-close');

  // 5) restart: the stored model, no second fit; source off -> no model reasons
  await p.reload();
  await p.waitForFunction(() => window.E7RecordsApp && window.E7RecordsApp.topModel(), null, { timeout: 20000 });
  console.log('after a restart: model ready, workers started:', await p.evaluate(() => window.__workers));
  await p.evaluate(([B2, f, f2]) => window.RTAApp.replaceDraft(window.RTALogic.boardToDraft({ prebans: { me: [], opp: [] }, picks: { me: [B2], opp: [f, f2] } }, 'me'), { newMatch: true }), [B, filler, filler2]);
  await p.click('.tab[data-tab=data]');
  await p.uncheck('#use-top-players');
  await p.click('.tab[data-tab=draft]');
  await p.waitForTimeout(300);
  console.log('source switched off -> model reasons:', JSON.stringify((await reasonsFor(C)) || 'none'), '· line hidden:', await p.evaluate(() => document.querySelector('#top-model-line').classList.contains('hidden')));
  console.log('errors:', errs);
  await b.close();
})();
