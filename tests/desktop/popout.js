// Drives the packaged desktop app: Pop out on Guild War and RTA must open an always-on-top window with content.
const { _electron } = require('playwright');
(async () => {
  const app = await _electron.launch({ executablePath: process.argv[2], args: ['--no-sandbox'] });
  const errs = [];
  await new Promise((r) => setTimeout(r, 2500));
  const main = app.windows().find((w) => !w.url().includes('overlay'));
  main.on('pageerror', (e) => errs.push(e.message));
  for (const [page, root] of [['guild.html', '#gp-root'], ['rta.html', '#pip-root']]) {
    await main.goto('e7://app/' + page);
    await main.waitForTimeout(1000);
    const ids = await main.$$eval('button', (bs) => bs.filter((b) => /pop out/i.test(b.textContent) && b.offsetParent).map((b) => b.id));
    const p = app.waitForEvent('window', { timeout: 5000 }).catch(() => null);
    await main.click('#' + ids[0]);
    const child = await p;
    let ok = false;
    let top = null;
    if (child) {
      await child.waitForTimeout(700);
      ok = !!(await child.$(root));
      top = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.isAlwaysOnTop()).length);
      await child.screenshot({ path: process.argv[3] + '/' + page + '.png' });
      await child.close();
    }
    console.log(page, 'button', ids[0], 'opened', !!child, 'content', ok, 'always-on-top windows', top);
  }
  console.log('version', await app.evaluate(({ app }) => app.getVersion()));
  console.log('errors:', errs);
  await app.close();
})();
