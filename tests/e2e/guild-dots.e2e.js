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
  const dots = await p.$$eval('.gw-card', (cards) => cards.map((c) => {
    const name = c.querySelector('[data-history]').textContent;
    const head = c.querySelector('.gw-head .gwdot').className.replace('gwdot ', '');
    const teams = [...c.querySelectorAll('.gw-team-head')].map((h) => { const d = h.querySelector('.gwdot'); return d ? d.className.replace('gwdot ', '') : 'cleared'; });
    return `${name}: player=${head} teams=${teams.join('/')}`;
  }));
  console.log(dots.join('\n'));
  console.log('tooltip RivalOne t1:', await p.$eval('.gw-card:has([data-history="RivalOne"]) .gw-team-head .gwdot', (d) => d.title.replace(/\n/g, ' | ')));
  await p.waitForTimeout(1200);
  await p.screenshot({ path: SP + '/v8-dots.png', fullPage: true });
  // filter by dot
  await p.selectOption('#target-dot', 'red');
  console.log('filter red ->', await p.$$eval('.gw-card [data-history]', (e) => e.map((x) => x.textContent).join(',')));
  await p.selectOption('#target-dot', '');
  // history dialog (click the dot)
  await p.click('.gw-card:has([data-history="RivalOne"]) .gw-head .gwdot');
  await p.waitForTimeout(800);
  console.log('history:', (await p.textContent('#hist-body')).replace(/\s+/g, ' ').slice(0, 700));
  await p.screenshot({ path: SP + '/v8-history.png' });
  await p.click('#hist-close');
  // without gear on this device -> green becomes ring
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('rta-helper-v2')); s.fribbels = null; localStorage.setItem('rta-helper-v2', JSON.stringify(s)); });
  await p.reload(); await p.waitForTimeout(500);
  console.log('no gear:', await p.$$eval('.gw-card', (cards) => cards.map((c) => c.querySelector('[data-history]').textContent + '=' + [...c.querySelectorAll('.gw-team-head .gwdot')].map((d) => d.className.replace('gwdot ', '')).join('/')).join(' ; ')));
  // attack logged by me attaches my speeds
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('rta-helper-v2')); localStorage.setItem('rta-helper-v2', JSON.stringify(s)); });
  const m = await ctx.newPage(); await m.setViewportSize({ width: 390, height: 844 }); await m.goto(U); await m.waitForTimeout(600);
  console.log('mobile hscroll:', await m.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  await m.screenshot({ path: SP + '/v8-mobile.png' });
  console.log('errors:', errs);
  await b.close();
})();
