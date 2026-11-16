// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: text reader + its
// Japanese / Chinese data and hero portraits from the CDN)
// DEVLOG #56, the owner's screens of 2026-11-16 (names replaced, see tools/dev/redact-gw-screens.py):
//  1) a maximized fortress map with names in hiragana, katakana, kanji, Simplified Chinese and Latin letters:
//     read by the shared name reader (js/vision/names.js); while it reads, the watcher says so ("vision:busy") and
//     the overlay shows a "working…" card that turns into a result line
//  2) an enemy STRONGHOLD screen (a banner pushes the teams down): the Chinese name and all six heroes
//  3) the player changed their defense: the Guild War page says so, updates the line-up, keeps the earlier one;
//     an attack remembers the line-up it was made against; three attacks per member per war
//  4) the two check-in windows of a new day: nothing is read from them
const __path = require('path');
const __fs = require('fs');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const FX = __path.join(__dirname, '..', 'fixtures', 'screens');
const { chromium } = require('playwright');
const { autoAsk } = require('./_ask.js');
const dataUrl = (f) => `data:image/${f.endsWith('.png') ? 'png' : 'jpeg'};base64,` + __fs.readFileSync(__path.join(FX, f)).toString('base64');
const WANT = ['りょうちゃん', 'ミカちゃま', 'sukiyaki2417', '和也', 'さくら', 'ティーナ', '龙猫乐乐'];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 950 } });
  await autoAsk(ctx);
  await ctx.addInitScript(() => {
    // the server's player list (stand-in for the desktop bridge): what is close to a text read from the screen
    const LIST = ['りょうちゃん', 'ミカちゃま', 'sukiyaki2417', 'sukiyaki2418', '和也', 'さくら', 'ティーナ', '龙猫乐乐'];
    const dist = (a, c) => { const A = [...a.toLowerCase()], C = [...c.toLowerCase()]; let prev = [0, ...C.map((_, j) => j + 1)]; for (let i = 0; i < A.length; i++) { const cur = [i + 1]; for (let j = 0; j < C.length; j++) cur.push(Math.min(prev[j + 1] + 1, cur[j] + 1, prev[j] + (A[i] === C[j] ? 0 : 1))); prev = cur; } return prev[C.length]; };
    window.__e7RecordsTest = {
      find: async () => [],
      game: async () => ({}),
      near: async (world, text) => LIST.map((name) => ({ name, d: dist(text, name), rank: 70 })).filter((x) => x.d <= 2).sort((x, y) => x.d - y.d).slice(0, 3),
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
  // the overlay (in the desktop app: the transparent window on the game)
  const ov = await ctx.newPage();
  ov.on('pageerror', (e) => errs.push('overlay: ' + e.message));
  await ov.goto(BASE + 'overlay.html');
  await ov.evaluate(() => {
    window.__busy = [];
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('.ov-busy')) {
        const t = `${el.classList.contains('done') ? (el.classList.contains('ask') ? '!' : '✓') : '…'} ${el.lastElementChild.textContent.trim()}`;
        if (window.__busy[window.__busy.length - 1] !== t) window.__busy.push(t);
      }
    }).observe(document.getElementById('layers'), { childList: true, subtree: true });
  });
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  await lv.evaluate(() => {
    window.__busyEvents = [];
    window.E7Bus.on('vision:busy', (d) => window.__busyEvents.push(d));
  });
  /** Show a screenshot to the watcher and let every Guild War reader have a go. until: reader id whose event ends the wait. */
  const show = (file, until, rounds = 8) =>
    lv.evaluate(
      async ({ url, until, rounds }) => {
        const im = new Image();
        await new Promise((r) => { im.onload = r; im.src = url; });
        window.E7Vision._useSource(im);
        const R = (id) => window.E7Vision._readers.find((x) => x.id === id);
        for (const r of window.E7Vision._readers) {
          if (/^guild/.test(r.id) && r.idle) r.idle({ publish() {}, note() {} });
          r.note = '';
        }
        const got = {};
        const offs = ['guild:forts', 'guild:fortress', 'guild:standby', 'guild:defense', 'guild:name-read'].map((t) => window.E7Bus.on(t, (d) => (got[t.slice(6)] = d)));
        for (let i = 0; i < rounds; i++) {
          await window.E7Vision.tick(true);
          await new Promise((res) => setTimeout(res, 400));
          if (until && until.every((u) => got[u])) break;
        }
        for (const off of offs) off();
        const notes = {};
        for (const id of ['guild-overview', 'guild-fortress', 'guild-standby', 'guild-defense', 'guild-name']) notes[id] = R(id).note;
        return { got, notes, screen: window.E7Screens && window.E7Screens.current() };
      },
      { url: dataUrl(file), until: until || null, rounds },
    );

  // the war (overview of #55: enemy guild on the Japanese server)
  await show('steam-gw-overview-war-wide.jpg', ['forts']);
  await gp.waitForTimeout(1200);
  console.log('war:', JSON.stringify(await gp.evaluate(() => window.GuildApp.state.wars.map((w) => `${w.enemyGuild}:${w.status}`))), '· enemy server', await gp.evaluate(() => JSON.parse(localStorage.getItem('e7-gw-forts')).enemyServer));

  // 1) the map with five kinds of writing
  const m = await show('steam-gw-map-mixed-scripts-wide.jpg', ['fortress'], 40);
  const all = m.got.fortress ? [...m.got.fortress.players, m.got.fortress.keep].filter(Boolean) : [];
  console.log('map:', m.notes['guild-fortress']);
  console.log('  names:', JSON.stringify(all.map((p) => `${p.name}${p.official ? ' ✓official' : ''}${p.lang && p.lang !== 'eng' ? ` (${p.lang})` : ''}${(p.options || []).length ? ` [also: ${p.options.join(', ')}]` : ''}`)));
  console.log('  exactly right:', WANT.filter((w) => all.some((p) => p.name === w)).length, 'of', WANT.length, '· pictures:', all.filter((p) => /^data:image\/jpeg/.test(p.pic || '')).length);
  const ev = await lv.evaluate(() => window.__busyEvents.filter((d) => d.reader === 'guild-fortress'));
  console.log('  watcher said while reading:', ev.filter((d) => !d.done && d.text).length, 'progress notes, first:', JSON.stringify((ev.find((d) => d.text) || {}).text), '· last:', JSON.stringify(ev.filter((d) => d.text).map((d) => `${d.done ? (d.ask ? '! ' : '✓ ') : ''}${d.text}`).pop()));
  await ov.waitForTimeout(300);
  const seenOv = await ov.evaluate(() => window.__busy);
  console.log('  overlay card:', seenOv.filter((t) => t.startsWith('…')).length, 'working states ·', JSON.stringify(seenOv[0]), '→', JSON.stringify(seenOv[seenOv.length - 1]));
  console.log('  Guild War page says:', JSON.stringify((await gp.textContent('#gw-watch-read')).trim()));
  await gp.evaluate(() => document.activeElement && document.activeElement.blur()); // (the card saves by itself, DEVLOG #62)
  await gp.waitForTimeout(600);
  console.log('  saved:', await gp.textContent('#gw-fort-msg'));

  // 2) the stronghold screen of the keep's player
  const s = await show('steam-gw-stronghold-cjk-wide.jpg', ['defense', 'name-read'], 150);
  const H = await lv.evaluate(() => Object.fromEntries(window.RTASources.allHeroes.map((h) => [h.code, h.name])));
  const teams = s.got.defense ? s.got.defense.teams.map((t) => t.map((x) => (x ? `${H[x.code]}${x.sure ? '' : '?'}` : '-'))) : null;
  console.log('stronghold:', s.notes['guild-defense'], '·', s.notes['guild-name'], '· options', JSON.stringify((s.got['name-read'] || {}).options || []));
  console.log('  teams:', JSON.stringify(teams));
  await gp.waitForTimeout(2600); // the name is taken when read twice in a row
  await show('steam-gw-stronghold-cjk-wide.jpg', ['name-read'], 3);
  await gp.waitForTimeout(600);
  console.log('  Guild War page:', JSON.stringify((await gp.textContent('#gw-watch-read')).trim()), '·', (await gp.textContent('#gw-seen')).replace(/\s+/g, ' ').trim().slice(0, 150));
  await gp.click('#gw-seen-save');
  await gp.waitForTimeout(300);
  await gp.click('#target-form button[type=submit]');
  await gp.waitForTimeout(600);
  const tgt = () => gp.evaluate(() => { const t = window.GuildApp.state.targets.find((x) => x.player === '龙猫乐乐'); return t && { teams: t.teams.map((tm) => ({ heroes: tm.heroes, earlier: (tm.earlier || []).map((e) => e.heroes) })), keep: !!t.keep, tower: t.tower }; });
  const t0 = await tgt();
  console.log('  saved defense:', JSON.stringify(t0 && t0.teams.map((tm) => tm.heroes.map((c) => H[c]))), '· keep', t0 && t0.keep);

  // 3) the player changes round 2 (the game would show it; here the reader's event is sent with another hero)
  const other = Object.keys(H).find((c) => !t0.teams.flat().some((tm) => (tm.heroes || []).includes(c)) && !t0.teams[0].heroes.includes(c) && !t0.teams[1].heroes.includes(c));
  await lv.evaluate(({ teams, other }) => {
    const mk = (codes) => codes.map((c) => ({ code: c, sure: true, score: 0.9 }));
    window.E7Bus.publish('guild:defense', { teams: [mk(teams[0]), mk([teams[1][0], teams[1][1], other])], sure: 6 });
  }, { teams: t0.teams.map((tm) => tm.heroes), other });
  await gp.waitForTimeout(500);
  console.log('change seen:', (await gp.textContent('#gw-seen')).replace(/\s+/g, ' ').trim().slice(0, 130), '· button:', JSON.stringify((await gp.textContent('#gw-seen-save')).trim()));
  await gp.click('#gw-seen-save');
  await gp.waitForTimeout(300);
  console.log('  edit window:', (await gp.textContent('#target-changed')).replace(/\s+/g, ' ').trim().slice(0, 110), '· round 2 boxes:', JSON.stringify(await gp.$$eval('#team-editors fieldset[data-team="1"] .h3', (xs) => xs.map((x) => x.value))));
  await gp.click('#target-form button[type=submit]');
  await gp.waitForTimeout(600);
  const t1 = await tgt();
  console.log('  after update: round 2', JSON.stringify(t1.teams[1].heroes.map((c) => H[c])), '· earlier line-ups kept:', JSON.stringify(t1.teams[1].earlier.map((e) => e.map((c) => H[c]))));
  // an attack against the new line-up; then the player changes back: the attack keeps what it was made against
  const atk = await gp.evaluate(async () => {
    const A = window.GuildApp;
    const before = A.attacksLeft();
    const t = A.state.targets.find((x) => x.player === '龙猫乐乐');
    await A.logQuick(t, 2, 'win', []);
    await new Promise((r) => setTimeout(r, 400));
    const a = A.state.attacks[A.state.attacks.length - 1] || A.state.attacks[0];
    return { before, after: A.attacksLeft(), defense: a.defense, rule: A.rules().attacksPerMember };
  });
  console.log(`attacks: ${atk.rule} per member per war · mine left ${atk.before} → ${atk.after} · the attack remembers`, JSON.stringify((atk.defense || []).map((c) => H[c])));
  console.log('  War tab:', JSON.stringify(((await gp.textContent('#war-summary')).replace(/\s+/g, ' ').match(/Attacks left this war \(guild\)\s*\d+.*?Ann \(\d\)/) || [''])[0]));

  // 4) a new day: the daily and the guild check-in windows
  for (const f of ['steam-daily-checkin.jpg', 'steam-guild-checkin-wide.jpg', 'steam-gw-hall-wide.jpg']) {
    const r = await show(f, null, 5);
    // (the name box may hold stray text there, as before: the Guild War page only acts on names it knows)
    console.log(`${f}: events ${Object.keys(r.got).filter((k) => k !== 'name-read').join(', ') || 'none'} · screen ${r.screen || '-'} · ${r.notes['guild-defense'] || r.notes['guild-fortress'] || ''} · name box: ${JSON.stringify((r.got['name-read'] || {}).text || '')}`);
  }
  await lv.waitForTimeout(600);
  console.log('working card left on the game at the end:', await ov.evaluate(() => document.querySelectorAll('.ov-busy:not(.done)').length));
  console.log('errors:', errs);
  await b.close();
})();
