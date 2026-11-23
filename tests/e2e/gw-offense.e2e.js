// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: text reader + its
// Japanese data and hero portraits from the CDN)
// DEVLOG #58, the owner's screens of 2026-11-16 (names replaced, tools/dev/redact-gw-screens.py):
//  1) the Offense Team screen: the defender's name, their two teams and mine -> their defense is saved as it stands,
//     that player becomes the current one, my teams are kept for the attack
//  2) the start of the fight ("Round 1"): the attack started -> "How did it go?" on the War tab; Won / Lost -> two
//     attack records with my heroes and the line-up attacked; one attack used
//  3) the same battle read later from its result window is not logged a second time
//  4) a note window: author and text -> asked which enemy it is about (the one just seen is offered) -> on their notes
//  5) other screens (a map, a result window, a tower page): these three readers stay quiet
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
  await gp.fill('#my-name', 'AmberFox');
  await gp.press('#my-name', 'Tab');
  await gp.fill('#guild-name', 'TestHome');
  await gp.click('#guild-create');
  await gp.waitForTimeout(300);
  await gp.click('.tab[data-tab=war]');
  const lv = await ctx.newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  const EVENTS = ['guild:forts', 'guild:fortress', 'guild:offense', 'guild:battle', 'guild:note', 'guild:result'];
  const show = (file, until, rounds = 8) =>
    lv.evaluate(
      async ({ url, until, rounds, EVENTS }) => {
        const im = new Image();
        await new Promise((r) => { im.onload = r; im.src = url; });
        window.E7Vision._useSource(im);
        for (const r of window.E7Vision._readers) {
          if (/^guild/.test(r.id) && r.idle) r.idle({ publish() {}, note() {} });
          r.note = '';
        }
        const got = {};
        const offs = EVENTS.map((t) => window.E7Bus.on(t, (d) => { if (!d.away) got[t.slice(6)] = d; }));
        for (let i = 0; i < rounds; i++) {
          await window.E7Vision.tick(true);
          await new Promise((res) => setTimeout(res, 400));
          if (until && until.every((u) => got[u])) break;
        }
        for (const off of offs) off();
        const notes = {};
        for (const id of ['guild-offense', 'guild-battle', 'guild-note']) notes[id] = window.E7Vision._readers.find((x) => x.id === id).note;
        return { got, notes };
      },
      { url: dataUrl(file), until: until || null, rounds, EVENTS },
    );
  const H = await lv.evaluate(() => Object.fromEntries(window.RTASources.allHeroes.map((h) => [h.code, h.name])));
  const nm = (cs) => (cs || []).map((c) => H[c] || c);
  const icons = (t) => t.map((x) => (x ? `${H[x.code]}${x.sure ? '' : '?'}` : '-'));

  // the war and the enemy's map, as in gw-scripts
  await show('steam-gw-overview-war-wide.jpg', ['forts']);
  await gp.waitForTimeout(1200);
  await show('steam-gw-map-mixed-scripts-wide.jpg', ['fortress'], 40);
  await gp.waitForTimeout(500);
  await gp.evaluate(() => document.activeElement && document.activeElement.blur()); // (the card saves by itself, DEVLOG #62)
  await gp.waitForTimeout(600);

  // 1) the Offense Team screen
  const o = await show('steam-gw-offense-wide.jpg', ['offense'], 150);
  const od = o.got.offense;
  console.log('offense:', o.notes['guild-offense']);
  console.log('  enemy:', od && od.enemy.name, '· their teams:', JSON.stringify(od && od.theirs.map(icons)));
  console.log('  my teams:', JSON.stringify(od && od.mine.map(icons)));
  await gp.waitForTimeout(900);
  const tgt = () => gp.evaluate(() => { const t = window.GuildApp.state.targets.find((x) => x.player === 'りょうちゃん'); return t && { teams: (t.teams || []).map((tm) => tm.heroes || []), notes: t.notes || '' }; });
  console.log('  saved as their defense:', JSON.stringify(((await tgt()) || { teams: [] }).teams.map(nm)), '· current player:', await gp.evaluate(() => window.GuildApp.current()));
  console.log('  status:', (await gp.textContent('#conn-status')).trim().slice(0, 90), '· "how did it go" shown before the fight:', !(await gp.evaluate(() => document.getElementById('war-pending').classList.contains('hidden'))));

  // 1b) DEVLOG #102: read once per enemy: my own side changing (heroes swapped: here blanked) reads nothing again;
  // "Read again" on the Guild War page does
  const again = await lv.evaluate(async (url) => {
    const im = new Image();
    await new Promise((r) => { im.onload = r; im.src = url; });
    const c = document.createElement('canvas');
    c.width = im.width;
    c.height = im.height;
    const x = c.getContext('2d');
    x.drawImage(im, 0, 0);
    x.fillStyle = 'rgba(0,0,0,0.6)';
    x.fillRect(0, 0.12 * c.height, 0.42 * c.width, 0.75 * c.height); // my two teams changed
    window.E7Vision._useSource(c);
    let n = 0;
    const off = window.E7Bus.on('guild:offense', (d) => { if (!d.away) n++; });
    for (let i = 0; i < 4; i++) {
      await window.E7Vision.tick(true);
      await new Promise((r) => setTimeout(r, 300));
    }
    const mineChanged = n;
    window.E7Bus.publish('cmd:offense-reread', {});
    for (let i = 0; i < 40 && n === mineChanged; i++) {
      await window.E7Vision.tick(true);
      await new Promise((r) => setTimeout(r, 400));
    }
    off();
    return { mineChanged, afterReadAgain: n - mineChanged };
  }, dataUrl('steam-gw-offense-wide.jpg'));
  console.log('  my side changed: readings', again.mineChanged, '· after "Read again":', again.afterReadAgain, '· the button shown on the Guild War page:', await gp.evaluate(() => !document.getElementById('gw-offense-again').classList.contains('hidden')));

  // 2) the fight starts
  const b1 = await show('steam-gw-battle1-wide.jpg', ['battle'], 20);
  console.log('battle:', b1.notes['guild-battle'], JSON.stringify(b1.got.battle && { round: b1.got.battle.round, left: b1.got.battle.left.name, right: b1.got.battle.right.name }));
  await gp.waitForTimeout(600);
  console.log('  War tab asks:', (await gp.textContent('#war-pending')).replace(/\s+/g, ' ').trim().slice(0, 170));
  const before = await gp.evaluate(() => window.GuildApp.attacksLeft());
  await gp.selectOption('[data-pend="0"]', 'win');
  await gp.selectOption('[data-pend="1"]', 'loss');
  await gp.click('#war-pending-log');
  await gp.waitForTimeout(700);
  const atk = () => gp.evaluate(() => window.GuildApp.state.attacks.map((a) => ({ by: a.by, team: a.team, result: a.result, heroes: a.heroes, defense: a.defense, token: !!a.token })));
  let as = await atk();
  console.log('  logged:', JSON.stringify(as.map((a) => `${a.by} round ${a.team} ${a.result}: ${nm(a.heroes).join(', ')} against ${nm(a.defense).join(', ')}`)));
  console.log('  attacks left for me:', before, '→', await gp.evaluate(() => window.GuildApp.attacksLeft()), '· question gone:', await gp.evaluate(() => document.getElementById('war-pending').classList.contains('hidden')));
  const b2 = await show('steam-gw-battle2-wide.jpg', ['battle'], 20);
  console.log('a later moment of the fight:', b2.notes['guild-battle'], '· question back (must not be):', !(await gp.evaluate(() => document.getElementById('war-pending').classList.contains('hidden'))));

  // 3) the same battle from its result window (the enemy's page, their failed defense): known already
  await lv.evaluate(({ theirs, mine }) => {
    const sure = (t) => t.map((x) => (x ? { ...x, sure: true } : null));
    window.E7Bus.publish('guild:result', { type: 'defense', ok: false, side: 'enemy', left: { name: 'りょうちゃん', options: [] }, right: { name: 'AmberFox', options: [] }, rounds: [{ result: 'defeat', left: sure(theirs[0]), right: sure(mine[0]) }, { result: 'victory', left: sure(theirs[1]), right: sure(mine[1]) }] });
  }, { theirs: od.theirs, mine: od.mine });
  await gp.waitForTimeout(900);
  as = await atk();
  console.log('same battle from its result window -> attack records:', as.length, '(2 = not logged twice)');

  // 4) a note window
  const n = await show('steam-gw-note-record-wide.jpg', ['note'], 20);
  console.log('note:', o.notes['guild-note'] === undefined ? '' : n.notes['guild-note'], JSON.stringify(n.got.note));
  await gp.waitForTimeout(600);
  console.log('  War tab asks:', (await gp.textContent('#war-note')).replace(/\s+/g, ' ').trim().slice(0, 110), '· offered:', await gp.$eval('#war-note-for', (s) => s.options[s.selectedIndex].textContent));
  await gp.selectOption('#war-note-for', { label: await gp.$eval('#war-note-for', (s) => [...s.options].find((x) => x.textContent.startsWith('りょうちゃん')).textContent) });
  await gp.click('#war-note-save');
  await gp.waitForTimeout(600);
  console.log('  on that player\'s notes:', JSON.stringify((await tgt()).notes));
  await show('steam-gw-note-record-wide.jpg', ['note'], 20);
  await gp.waitForTimeout(500);
  console.log('  the same note again -> asked again (must not be):', !(await gp.evaluate(() => document.getElementById('war-note').classList.contains('hidden'))));

  // 5) other screens
  for (const f of ['steam-gw-map-mixed-scripts-wide.jpg', 'steam-gw-result-attack-wide.jpg', 'steam-gw-member-tower-wide.jpg', 'steam-guild-checkin-wide.jpg']) {
    const r = await show(f, null, 5);
    console.log(`${f}: offense / battle / note events: ${['offense', 'battle', 'note'].filter((k) => r.got[k]).join(', ') || 'none'} · ${r.notes['guild-offense']} · ${r.notes['guild-battle']} · ${r.notes['guild-note']}`);
  }
  console.log('errors:', errs);
  await b.close();
})();
