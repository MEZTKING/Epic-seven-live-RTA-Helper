// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh  (needs internet: text reader + its
// Japanese / Chinese data and hero portraits from the CDN)
// DEVLOG #59, the owner's screens of a war in progress (names replaced, tools/dev/redact-gw-screens.py):
//  1) the Stinger map with a "Cannot Battle" defender and a "Battle in Progress" badge: all 7 defenders (it was 5)
//  2) the middle fortress with a dark BEATEN badge: all 5 defenders (it was 3), the beaten one marked cleared
//  3) a "Defense Draw" window on the enemy's page = our member's attack, one round won, one lost (red and green
//     shields) -> two attack records
//  4) the enemy's page with a banner over the teams ("You cannot battle a target that has already been attacked",
//     "Battle in progress."): name and all six heroes
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
  const show = (file, until, rounds = 8) =>
    lv.evaluate(
      async ({ url, until, rounds }) => {
        const im = new Image();
        await new Promise((r) => { im.onload = r; im.src = url; });
        window.E7Vision._useSource(im);
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
        for (const id of ['guild-fortress', 'guild-defense', 'guild-name', 'guild-result']) notes[id] = window.E7Vision._readers.find((x) => x.id === id).note;
        return { got, notes };
      },
      { url: dataUrl(file), until: until || null, rounds },
    );
  const H = await lv.evaluate(() => Object.fromEntries(window.RTASources.allHeroes.map((h) => [h.code, h.name])));
  const nm = (cs) => (cs || []).map((c) => H[c] || c);
  const report = (label, m, want) => {
    const all = m.got.fortress ? [...m.got.fortress.players, m.got.fortress.keep].filter(Boolean) : [];
    console.log(`${label}:`, m.notes['guild-fortress']);
    console.log('  names:', JSON.stringify(all.map((p) => `${p.name}${p.state === 'beaten' ? ' (beaten)' : ''}${p.busy ? ' (battle in progress)' : ''}`)));
    console.log('  defenders found:', all.length, 'of', want.length, '· names exactly right:', want.filter((w) => all.some((p) => p.name === w)).length);
  };

  await show('steam-gw-overview-war-wide.jpg', ['forts']);
  await gp.waitForTimeout(1200);
  // 1) the Stinger map in the middle of the war
  const m1 = await show('steam-gw-map-states-wide.jpg', ['fortress'], 40);
  report('Stinger map', m1, ['りょうちゃん', 'ミカちゃま', 'sukiyaki2417', '和也', 'さくら', 'ティーナ', '龙猫乐乐']);
  await gp.waitForTimeout(500);
  await gp.evaluate(() => document.activeElement && document.activeElement.blur()); // (the card saves by itself, DEVLOG #62)
  await gp.waitForTimeout(600);
  // 2) the middle fortress with a beaten defender
  const m2 = await show('steam-gw-map-middle-beaten-wide.jpg', ['fortress'], 40);
  report('middle map', m2, ['Juniper', '白雪姫子', 'WillowSan', '夕凪', 'ナツメグ']);
  await gp.waitForTimeout(500);
  await gp.evaluate(() => document.activeElement && document.activeElement.blur()); // (the card saves by itself, DEVLOG #62)
  await gp.waitForTimeout(700);
  console.log('  saved:', await gp.textContent('#gw-fort-msg'), '· marked beaten from the map:', JSON.stringify(await gp.evaluate(() => window.GuildApp.state.targets.filter((t) => t.beaten).map((t) => t.player))), '· targets', await gp.evaluate(() => window.GuildApp.state.targets.length));

  // 3) Defense Draw on the enemy's page: my attack, one round each
  const d = await show('steam-gw-result-draw-wide.jpg', ['result'], 80);
  const r = d.got.result;
  console.log('window:', d.notes['guild-result']);
  console.log('  read:', r && JSON.stringify({ type: r.type, ok: r.ok, side: r.side, left: r.left.name, right: r.right.name, results: r.rounds.map((x) => x.result) }));
  await gp.waitForTimeout(900);
  console.log('  attacks:', JSON.stringify(await gp.evaluate(() => window.GuildApp.state.attacks.map((a) => ({ by: a.by, team: a.team, result: a.result, heroes: a.heroes, defense: a.defense }))).then((as) => as.map((a) => `${a.by} round ${a.team} ${a.result}: ${nm(a.heroes).join(', ')} against ${nm(a.defense).join(', ')}`))));
  console.log('  banner:', (await gp.textContent('#war-result')).replace(/\s+/g, ' ').trim().slice(0, 100), '· attacks left for me:', await gp.evaluate(() => window.GuildApp.attacksLeft()));

  // 4) enemy pages with a banner over the teams
  for (const f of ['steam-gw-enemy-attacked-wide.jpg', 'steam-gw-enemy-inbattle-wide.jpg']) {
    const e = await show(f, ['defense', 'name-read'], 80);
    console.log(`${f}:`, e.notes['guild-name'], '·', e.notes['guild-defense'], '·', JSON.stringify(e.got.defense && e.got.defense.teams.map((t) => t.map((x) => (x ? `${H[x.code]}${x.sure ? '' : '?'}` : '-')))));
  }
  console.log('errors:', errs);
  await b.close();
})();
