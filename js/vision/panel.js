/*
 * Game watcher panel: status, readers and recent events. Used by vision.html and the Live page.
 * Expects #vw-start, #vw-stop, #vw-status, #vw-readers, #vw-log (any may be missing).
 */
(function () {
  'use strict';
  const C = window.VisionClient;
  const bus = window.E7Bus;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const set = (sel, html) => {
    const el = $(sel);
    if (el) el.innerHTML = html;
  };
  let warning = '';

  const describe = (e) => {
    const d = e.data || {};
    switch (e.type) {
      case 'gear:added': return `Gear: added ${d.desc} → ${String(d.verdict || '').toUpperCase()}`;
      case 'gear:dup': return `Gear: already have ${d.desc}`;
      case 'gear:item': return null; // shown as gear:added / gear:dup
      case 'guild:name-read': return d.away ? null : `Guild War: read "${(d.text || '').slice(0, 30)}"`;
      case 'screen:changed': return `Screen: ${d.label || 'other / not taught'}`;
      case 'vision:started': return `Started watching "${d.name}"`;
      case 'vision:stopped': return 'Stopped watching';
      case 'vision:warning': return `⚠ ${d.text}`;
      case 'picture:saved': return `Saved a game picture (${d.note || ''}): use it to draw boxes later`;
      default: return e.type;
    }
  };
  function renderLog() {
    const rows = bus.log().slice(-40).reverse().map((e) => [e, describe(e)]).filter(([, t]) => t);
    set('#vw-log', rows.map(([e, t]) => `<li><span class="hint">${new Date(e.at).toLocaleTimeString()}</span> ${esc(t)}</li>`).join('') || '<li class="hint">Nothing yet.</li>');
  }
  function render(s) {
    set('#vw-status', esc(C.line()) + (warning ? `<br><span class="warn-text">⚠ ${esc(warning)}</span>` : ''));
    const st = s || C.status();
    set('#vw-readers', st && st.readers ? st.readers.map((r) => `<li><b>${esc(r.label)}</b> ${r.ready ? '' : '<span class="hint">(boxes not set: set them on its module page)</span>'} <span class="hint">${esc(r.note)}</span></li>`).join('') : '');
    const w = st && st.watching;
    if ($('#vw-start')) $('#vw-start').classList.toggle('hidden', !!w);
    if ($('#vw-stop')) $('#vw-stop').classList.toggle('hidden', !w);
  }
  C.onStatus(render);
  bus.on('vision:warning', (d) => {
    warning = d.text;
    render();
  });
  bus.on(['gear:*', 'guild:*', 'screen:changed', 'vision:started', 'vision:stopped', 'vision:warning', 'picture:saved'], () => setTimeout(renderLog, 0));
  if ($('#vw-start'))
    $('#vw-start').addEventListener('click', () => {
      warning = '';
      C.ensure().catch((e) => {
        warning = e.message;
        render();
      });
    });
  if ($('#vw-stop')) $('#vw-stop').addEventListener('click', () => C.stop().catch(() => {}));
  setInterval(() => render(), 4000);
  render();
  renderLog();
})();
