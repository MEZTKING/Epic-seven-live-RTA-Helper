// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: text reader + its
// Japanese data and hero portraits from the CDN)
// DEVLOG #57, the owner's battle-result windows of 2026-11-16 (names replaced, tools/dev/redact-gw-screens.py):
//  1) our own fortress map (green rings, one tower damaged) -> our members
//  2) a member's TOWER page: the name and both teams (round 1 stands on top / left / BOTTOM of the four places)
//  3) "Failed Defense" on that member's page -> two defense records (lost, lost), with both sides' heroes
//  4) "Successful Attack" on an ENEMY's page = that enemy beat two of our members -> defense records for them
//  5) the same window again -> nothing new; Undo takes the last one back
//  6) a result that is OUR attack (sent as the reader's event; no screenshot of one yet) -> two attack records with
//     the defender's line-up, one attack token used, the enemy's saved defense updated
//  7) a result read while the Guild War page was closed is logged when the page opens
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
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
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
        const offs = ['guild:forts', 'guild:fortress', 'guild:defense', 'guild:name-read', 'guild:result'].map((t) => window.E7Bus.on(t, (d) => (got[t.slice(6)] = d)));
        for (let i = 0; i < rounds; i++) {
          await window.E7Vision.tick(true);
          await new Promise((res) => setTimeout(res, 400));
          if (until && until.every((u) => got[u])) break;
        }
        for (const off of offs) off();
        const notes = {};
        for (const id of ['guild-fortress', 'guild-defense', 'guild-name', 'guild-result']) notes[id] = R(id).note;
        return { got, notes };
      },
      { url: dataUrl(file), until: until || null, rounds },
    );
  const H = await lv.evaluate(() => Object.fromEntries(window.RTASources.allHeroes.map((h) => [h.code, h.name])));
  const nm = (cs) => (cs || []).map((c) => H[c] || c);
  const state = () =>
    gp.evaluate(() => {
      const s = window.GuildApp.state;
      return { attacks: s.attacks.map((a) => ({ by: a.by, team: a.team, result: a.result, heroes: a.heroes, defense: a.defense, token: !!a.token, fromGame: !!a.fromGame })), defenses: s.defenses.map((d) => ({ member: d.member, team: d.team, result: d.result, attacker: d.attacker, heroes: d.heroes, attackerHeroes: d.attackerHeroes })), members: s.members.map((m) => m.name), targets: s.targets.map((t) => t.player) };
    });

  // the war and the enemy's map (so the enemy player is known), as in gw-scripts
  await show('steam-gw-overview-war-wide.jpg', ['forts']);
  await gp.waitForTimeout(1200);
  await show('steam-gw-map-mixed-scripts-wide.jpg', ['fortress'], 40);
  await gp.waitForTimeout(500);
  await gp.evaluate(() => document.activeElement && document.activeElement.blur()); // (the card saves by itself, DEVLOG #62)
  await gp.waitForTimeout(600);

  // 1) our own map
  const m = await show('steam-gw-map-ours-havoc-wide.jpg', ['fortress'], 40);
  const all = m.got.fortress ? [...m.got.fortress.players, m.got.fortress.keep].filter(Boolean) : [];
  const WANT = ['AmberFox', 'BirchOwl', 'CedarElk9', 'DuneHawk', 'FrostBee22', 'GaleWolf', 'HazelRay7', 'Marlow8', 'KeepOne7'];
  console.log('own map:', m.notes['guild-fortress'], '· side', m.got.fortress && m.got.fortress.side);
  console.log('  names:', JSON.stringify(all.map((p) => p.name)), '· exactly right', WANT.filter((w) => all.some((p) => p.name === w)).length, 'of', WANT.length);
  // the names as the test needs them (a reading that is off is corrected here the way the user would)
  await gp.waitForTimeout(500);
  const boxes = await gp.$$('#gw-fort-seen [data-fort-i]');
  for (let i = 0; i < boxes.length && i < WANT.length; i++) {
    const v = await boxes[i].inputValue();
    const want = WANT.find((w) => w === v) || WANT.find((w) => w.toLowerCase().slice(0, 4) === v.toLowerCase().slice(0, 4));
    if (want && want !== v) await boxes[i].fill(want);
  }
  await gp.evaluate(() => document.activeElement && document.activeElement.blur()); // (the card saves by itself, DEVLOG #62)
  await gp.waitForTimeout(600);
  console.log('  saved:', await gp.textContent('#gw-fort-msg'), '· members', JSON.stringify((await state()).members));

  // 2) the member's tower page
  const t = await show('steam-gw-member-tower-wide.jpg', ['defense', 'name-read'], 150);
  console.log('tower page:', t.notes['guild-name'], '·', t.notes['guild-defense'], '·', JSON.stringify(t.got.defense && t.got.defense.teams.map((tm) => tm.map((x) => (x ? `${H[x.code]}${x.sure ? '' : '?'}` : '-')))));

  // 3) Failed Defense on our member's page
  const d = await show('steam-gw-result-defense-wide.jpg', ['result'], 60);
  const r0 = d.got.result;
  console.log('window 1:', d.notes['guild-result']);
  console.log('  other readers:', JSON.stringify([d.notes['guild-fortress'], d.notes['guild-defense']]), '· events', Object.keys(d.got).filter((k) => k !== 'result' && k !== 'name-read').join(', ') || 'none');
  console.log('  read:', r0 && JSON.stringify({ type: r0.type, ok: r0.ok, side: r0.side, left: r0.left.name, right: r0.right.name, results: r0.rounds.map((r) => r.result) }));
  await gp.waitForTimeout(900);
  let s = await state();
  console.log('  logged defenses:', JSON.stringify(s.defenses.map((x) => `${x.member} round ${x.team} ${x.result} vs ${x.attacker}: ${nm(x.heroes).join(', ') || '?'} against ${nm(x.attackerHeroes).join(', ') || '?'}`)));
  console.log('  banner:', (await gp.textContent('#war-result')).replace(/\s+/g, ' ').trim().slice(0, 150));

  // 4) Successful Attack on the enemy's page, twice (two of our members were beaten)
  for (const f of ['steam-gw-result-attack-wide.jpg', 'steam-gw-result-attack2-wide.jpg']) {
    const a = await show(f, ['result'], 60);
    await gp.waitForTimeout(900);
    console.log(`${f}:`, a.notes['guild-result']);
  }
  s = await state();
  console.log('defenses now:', s.defenses.length, JSON.stringify(s.defenses.map((x) => `${x.member} r${x.team} ${x.result} vs ${x.attacker} [${(x.heroes || []).length}+${(x.attackerHeroes || []).length} heroes]`)));
  console.log('attacks (none of ours yet):', s.attacks.length);

  // 5) the same window again: nothing new; Undo takes the last one back
  await show('steam-gw-result-attack2-wide.jpg', ['result'], 60);
  await gp.waitForTimeout(900);
  console.log('same window again -> defenses:', (await state()).defenses.length);
  await gp.click('#war-result-undo');
  await gp.waitForTimeout(600);
  s = await state();
  console.log('after Undo -> defenses:', s.defenses.length, '· members beaten:', JSON.stringify([...new Set(s.defenses.map((x) => x.member))]));
  await show('steam-gw-result-attack2-wide.jpg', ['result'], 60);
  await gp.waitForTimeout(900);
  console.log('shown once more after Undo -> defenses (an undone result is not logged again):', (await state()).defenses.length);

  // 6) OUR attack on the enemy (the reader's event; no screenshot of this case yet): enemy page, their failed defense
  const enemyTeams = r0.rounds.map((r) => r.right.map((x) => (x ? { ...x, sure: true } : null)));
  const myTeams = r0.rounds.map((r) => r.left.map((x) => (x ? { ...x, sure: true } : null)));
  const before = await gp.evaluate(() => window.GuildApp.attacksLeft());
  await lv.evaluate(({ enemyTeams, myTeams }) => {
    window.E7Bus.publish('guild:result', { type: 'defense', ok: false, side: 'enemy', left: { name: 'りょうちゃん', options: [] }, right: { name: 'Ann', options: [] }, rounds: [{ result: 'defeat', left: enemyTeams[0], right: myTeams[0] }, { result: 'victory', left: enemyTeams[1], right: myTeams[1] }] });
  }, { enemyTeams, myTeams });
  await gp.waitForTimeout(900);
  s = await state();
  console.log('our attack:', JSON.stringify(s.attacks.map((a) => `${a.by} round ${a.team} ${a.result}${a.token ? ' (token)' : ''}: ${nm(a.heroes).length} heroes against ${nm(a.defense).join(', ')}`)));
  console.log('  attacks left for me:', before, '→', await gp.evaluate(() => window.GuildApp.attacksLeft()), '· banner:', (await gp.textContent('#war-result')).replace(/\s+/g, ' ').trim().slice(0, 90));
  console.log('  the enemy\'s saved defense now:', JSON.stringify(await gp.evaluate(() => { const t = window.GuildApp.state.targets.find((x) => x.player === 'りょうちゃん'); return t && t.teams.map((tm) => (tm.heroes || []).length); })), '· War tab:', JSON.stringify(((await gp.textContent('#war-summary')).replace(/\s+/g, ' ').match(/Defenses cleared\s*\S+\s*\S+ teams/) || [''])[0]));
  // 7) a result read while the Guild War page was closed: the reader keeps it, the page takes it when it opens
  await gp.evaluate(({ enemyTeams, myTeams }) => {
    const d = { type: 'attack', ok: true, side: 'ours', left: { name: 'Ann', options: [] }, right: { name: 'ミカちゃま', options: [] }, rounds: [{ result: 'victory', left: myTeams[1], right: enemyTeams[1] }, { result: 'victory', left: myTeams[0], right: enemyTeams[0] }] };
    localStorage.setItem('e7-gw-results', JSON.stringify([{ id: 'waiting-1', at: new Date().toISOString(), d }]));
  }, { enemyTeams, myTeams });
  await gp.reload();
  await gp.waitForTimeout(4000);
  s = await state();
  console.log('kept while the page was closed -> attacks:', s.attacks.length, JSON.stringify(s.attacks.slice(-2).map((a) => `${a.by} r${a.team} ${a.result}`)), '· still waiting:', await gp.evaluate(() => JSON.parse(localStorage.getItem('e7-gw-results') || '[]').length), '· attacks left for me:', await gp.evaluate(() => window.GuildApp.attacksLeft()));
  console.log('errors:', errs);
  await b.close();
})();
