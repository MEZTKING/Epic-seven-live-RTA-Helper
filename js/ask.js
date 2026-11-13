/*
 * Asking for a line of text inside the page (DEVLOG #40). window.prompt() does NOT work in the desktop app (Electron
 * doesn't support it: it does nothing), so every question goes through here instead.
 *
 *   await E7Ask('Enemy guild name?', 'default')             -> the text, or null when cancelled
 *   await E7Ask.form('New war', [{ name, label, value, placeholder, required }]) -> { name: value, … } or null
 *   await E7Ask.show('Copy this invite link:', link)         -> shows text ready to copy (selected)
 */
(function () {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function form(title, fields, opts = {}) {
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.className = 'ask-dialog';
      d.innerHTML = `<form method="dialog">
        <h3>${esc(title)}</h3>
        ${opts.hint ? `<p class="hint">${esc(opts.hint)}</p>` : ''}
        ${fields.map((f, i) => `<label>${esc(f.label || '')}<input name="${esc(f.name || 'f' + i)}" value="${esc(f.value ?? '')}" placeholder="${esc(f.placeholder || '')}" ${f.readonly ? 'readonly' : ''} autocomplete="off" /></label>`).join('')}
        <div class="btn-row"><span class="spacer"></span>${opts.noCancel ? '' : '<button value="cancel" class="btn" type="button" data-cancel>Cancel</button>'}<button value="ok" class="btn primary">${esc(opts.ok || 'OK')}</button></div>
      </form>`;
      document.body.appendChild(d);
      const inputs = [...d.querySelectorAll('input')];
      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        d.close();
        d.remove();
        resolve(val);
      };
      d.querySelector('[data-cancel]') && d.querySelector('[data-cancel]').addEventListener('click', () => finish(null));
      d.addEventListener('cancel', (e) => {
        e.preventDefault();
        finish(null);
      });
      d.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const out = {};
        fields.forEach((f, i) => (out[f.name || 'f' + i] = inputs[i].value));
        const missing = fields.findIndex((f, i) => f.required && !inputs[i].value.trim());
        if (missing >= 0) return inputs[missing].focus();
        finish(out);
      });
      d.showModal();
      if (inputs[0]) {
        inputs[0].focus();
        inputs[0].select();
      }
    });
  }
  async function ask(message, value = '') {
    const r = await form(message, [{ name: 'v', value }]);
    return r ? r.v : null;
  }
  ask.form = form;
  ask.show = (message, text) => form(message, [{ name: 'v', value: text, readonly: true }], { noCancel: true, ok: 'Close' });
  window.E7Ask = ask;
})();
