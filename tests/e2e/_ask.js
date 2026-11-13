// Test helper (DEVLOG #40): answers the app's in-page questions (js/ask.js), the way page.on('dialog') answered
// window.prompt() before (prompt() does nothing in the desktop app, so the app no longer uses it).
//   await autoAsk(page)            once, before page.goto
//   await ask(page, 'answer')      queue the answer for the next question (an array fills several fields)
exports.autoAsk = (page) =>
  page.addInitScript(() => {
    window.__askQueue = [];
    const answer = () => {
      const d = document.querySelector('dialog.ask-dialog[open]');
      if (!d || d.__answered || !window.__askQueue.length) return;
      d.__answered = true;
      const vals = [].concat(window.__askQueue.shift());
      d.querySelectorAll('input').forEach((i, k) => {
        if (vals[k] !== undefined) i.value = vals[k];
      });
      d.querySelector('button.primary').click();
    };
    new MutationObserver(answer).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    setInterval(answer, 100);
  });
exports.ask = (page, v) => page.evaluate((v) => window.__askQueue.push(v), v);
