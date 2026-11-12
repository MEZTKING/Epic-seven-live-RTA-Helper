// Browser end-to-end test (Playwright). Run all with: bash tests/e2e/run-all.sh
// Serves the repo on http://localhost:8766 (override with E7_BASE). Screenshots -> tests/e2e/out/ (E7_OUT).
const __path = require('path');
const __fs = require('fs');
const OUT = process.env.E7_OUT || __path.join(__dirname, 'out');
__fs.mkdirSync(OUT, { recursive: true });
const FX = __path.join(__dirname, 'fixtures');
const BASE = process.env.E7_BASE || 'http://localhost:8766/';
const { chromium } = require('playwright');
const SP = OUT;
const U = BASE + 'guild.html';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 1000 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text()) && errs.push(m.text()));
  p.on('dialog', (d) => d.accept());
  await p.goto(U);
  // this device: I own AV, Ruele, Lilias; my gear makes AV 280 speed (speed set 145 + 135 flat)
  await p.evaluate(() => {
    localStorage.clear();
    const it = (set, gear, main, subs) => ({ set, gear, main, subs });
    localStorage.setItem('rta-helper-v2', JSON.stringify({ version: 2, manualOwned: ['c2007', 'c1022', 'c1089'],
      fribbels: { heroes: [], builds: { c2007: { items: [it('SpeedSet', 'Weapon', { type: 'Attack', value: 500 }, [{ type: 'Speed', value: 22 }]), it('SpeedSet', 'Helmet', { type: 'Health', value: 2700 }, [{ type: 'Speed', value: 23 }]), it('SpeedSet', 'Armor', { type: 'Defense', value: 300 }, [{ type: 'Speed', value: 22 }]), it('SpeedSet', 'Boots', { type: 'Speed', value: 45 }, []), it('CriticalSet', 'Necklace', { type: 'CriticalHitDamagePercent', value: 60 }, [{ type: 'Speed', value: 23 }]), it('CriticalSet', 'Ring', { type: 'AttackPercent', value: 60 }, [])] } } } }));
    localStorage.setItem('e7-guild-conn', JSON.stringify({ guildCode: 'testguild12345678', guildName: 'Moonlight', myName: 'Cy' }));
  });
  // the guild's history, written by other members (Ann, Bob) over two seasons
  await p.evaluate(async () => {
    const b = await window.RTASync.local('testguild12345678');
    const t = (o) => b.put({ updatedBy: 'Ann', ...o });
    const AV = 'c2007', RU = 'c1022', LI = 'c1089', LA = 'c1109', SB = 'c5071', TA = 'c1067', BE = 'c1117', LU = 'c1066', KR = 'c1070', AR = 'c1129', KE = 'c1047', BA = 'c1053';
    await t({ id: 'm-ann', type: 'member', name: 'Ann', roster: [AV, RU, LI] });
    await t({ id: 'm-bob', type: 'member', name: 'Bob', roster: [AV, RU, LI, KE] });
    await t({ id: 'w-old', type: 'war', enemyGuild: 'Foes', season: 'Season 11', startedAt: '2026-08-01T00:00:00Z', status: 'done' });
    await t({ id: 'w-now', type: 'war', enemyGuild: 'Foes', season: 'Season 12', startedAt: '2026-11-10T00:00:00Z', status: 'active' });
    await t({ id: 't-old', type: 'target', warId: 'w-old', player: 'RivalOne', tower: 'L1', teams: [{ heroes: [LA, SB, TA], speeds: { [SB]: 250 }, build: 'SB: Speed+Crit, Alexa' }, { heroes: [BE, LU, KR] }] });
    await t({ id: 'a1', type: 'attack', warId: 'w-old', targetId: 't-old', team: 1, by: 'Ann', heroes: [AV, RU, LI], speeds: { [AV]: 262 }, result: 'win', at: '2026-08-01T10:00:00Z' });
    // current war
    await t({ id: 't1', type: 'target', warId: 'w-now', player: 'RivalOne', tower: 'L1', teams: [{ heroes: [LA, SB, TA], speeds: { [TA]: 210 } }, { heroes: [BE, LU, KR] }] });
    // Bob beat the same team last season too, on another enemy player
    await t({ id: 't-old2', type: 'target', warId: 'w-old', player: 'Other', tower: 'L2', teams: [{ heroes: [LA, SB, TA] }, { heroes: [KE, AR, BA] }] });
    await t({ id: 'a2', type: 'attack', warId: 'w-old', targetId: 't-old2', team: 1, by: 'Bob', heroes: [AV, RU, LI], speeds: { [AV]: 270 }, result: 'win', at: '2026-08-01T12:00:00Z' });
    await t({ id: 'a3', type: 'attack', warId: 'w-now', targetId: 't1', team: 2, by: 'Ann', heroes: [KE, AR, BA], result: 'loss', at: '2026-11-10T11:00:00Z' });
    await t({ id: 'a4', type: 'attack', warId: 'w-now', targetId: 't1', team: 2, by: 'Bob', heroes: [AV, KE, BA], result: 'loss', at: '2026-11-10T12:00:00Z' });
    await t({ id: 't2', type: 'target', warId: 'w-now', player: 'Quiet', tower: 'R2', teams: [{ heroes: [KE, AR, BA] }, { heroes: [LU, KR, BE] }] });
    await t({ id: 't3', type: 'target', warId: 'w-now', player: 'Newbie', tower: 'C3', teams: [{ heroes: [LA, SB, KE] }, { heroes: [TA, AR, LU] }] });
    await t({ id: 'a5', type: 'attack', warId: 'w-now', targetId: 't3', team: 2, by: 'Ann', heroes: [AV, RU, LI], result: 'win', at: '2026-11-10T13:00:00Z' });
  });
  await p.reload(); await p.waitForTimeout(800);
  // ---- pop-out via the card's pin button (headless: falls back to a normal pop-up window)
  const [pop] = await Promise.all([ctx.waitForEvent('page'), p.click('.gw-card:has([data-history="RivalOne"]) [data-pin]')]);
  await pop.waitForTimeout(600);
  const T = async () => (await pop.textContent('#gp-root')).replace(/\s+/g, ' ').trim();
  console.log('POP RivalOne:', (await T()).slice(0, 420));
  console.log('pop dots:', await pop.$$eval('#gp-root .gwdot', (d) => d.map((x) => x.className.replace('gwdot ', '')).join(',')));
  await pop.setViewportSize({ width: 360, height: 640 });
  await pop.screenshot({ path: SP + '/v9-pop.png' });
  // next / prev order: best chance first among uncleared
  await pop.click('[data-act=next]'); await pop.waitForTimeout(150);
  console.log('after Next:', (await T()).slice(0, 80));
  // type a name with a typo
  await pop.fill('#gp-q', 'quiet'); await pop.press('#gp-q', 'Enter'); await pop.dispatchEvent('#gp-q', 'change');
  await pop.waitForTimeout(200);
  console.log('typed quiet ->', (await T()).slice(0, 60));
  // one-tap Won on RivalOne team 1 (logs the proven counter)
  await p.evaluate(() => window.GuildApp.setCurrent('RivalOne'));
  await pop.waitForTimeout(200);
  pop.on('dialog', (d) => d.accept());
  await pop.click('[data-act=win][data-team="1"]');
  await pop.waitForTimeout(400);
  console.log('logged:', JSON.stringify(await p.evaluate(() => window.GuildApp.state.attacks.filter((a) => a.notes === 'logged from pop-out').map((a) => [a.by, a.team, a.result, a.heroes.map(window.GuildApp.nameOf), a.speeds]))));
  console.log('pop after win:', (await T()).slice(0, 200));
  // ---- watch game: OCR a fake game frame with a slightly wrong name
  // the name box is saved on the Guild War page; the game watcher (Live page) reads it and sends the text back
  await p.evaluate(() => { window.GuildApp.conn.watchBox = { x: 500 / 1280, y: 60 / 720, w: 300 / 1280, h: 50 / 720 }; window.GuildApp.saveConn(); });
  const lv = await p.context().newPage();
  lv.on('pageerror', (e) => errs.push('live: ' + e.message));
  await lv.goto(BASE + 'live.html');
  await lv.evaluate(async () => {
    const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
    const g = cv.getContext('2d'); g.fillStyle = '#1a2030'; g.fillRect(0, 0, 1280, 720);
    g.fillStyle = '#0b0e14'; g.fillRect(500, 60, 300, 50); g.fillStyle = '#fff'; g.font = 'bold 34px sans-serif'; g.fillText('Quiet', 520, 98);
    window.E7Vision._useSource(cv);
    for (let i = 0; i < 3; i++) await window.E7Vision.tick(true);
  });
  await p.waitForTimeout(400);
  const res = await p.evaluate(() => ({ current: window.GuildApp.current(), read: document.querySelector('#gw-watch-read').textContent }));
  console.log('watch:', JSON.stringify(res));
  await pop.waitForTimeout(300);
  console.log('pop now shows:', (await T()).slice(0, 60));
  console.log('errors:', errs);
  await b.close();
})();
