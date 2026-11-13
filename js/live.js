/* Live page: taught screens, overlay preview and a monitor of what modules send to the overlay. */
(function () {
  'use strict';
  const SW = window.E7Screens;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MODULE = { rta: 'RTA', guild: 'Guild War', gear: 'Gear' };
  const desktop = location.protocol === 'e7:';
  $('#live-env').textContent = desktop ? 'Running in the desktop app: the overlay is on top of the game (Ctrl+Shift+O to show/hide).' : 'Running in a browser: the overlay can only be previewed here. Use the desktop app to draw it on top of the game.';

  function renderScreens() {
    const counts = {};
    for (const r of SW.refs()) counts[r.screen] = (counts[r.screen] || 0) + 1;
    $('#live-screens').innerHTML = SW.SCREENS.map(
      (s) => `<tr><td>${esc(s.label)}</td><td>${esc(MODULE[s.module] || s.module)}</td><td>${counts[s.id] ? `✓ ${counts[s.id]}` : '<span class="hint">not taught</span>'}</td><td>${counts[s.id] ? `<button class="btn" data-forget="${esc(s.id)}">Forget</button>` : ''}</td></tr>`,
    ).join('');
  }
  $('#live-screens').addEventListener('click', (e) => {
    const b = e.target.closest('[data-forget]');
    if (b && confirm(`Forget "${SW.label(b.dataset.forget)}"?`)) SW.forget(b.dataset.forget);
    renderScreens();
  });
  SW.onChange(renderScreens);
  addEventListener('storage', (e) => e.key === 'e7-screens' && renderScreens());
  renderScreens();

  const ga = window.GameArea && window.GameArea.get();
  const dc = window.E7Desktop && window.E7Desktop.capture();
  if (dc && dc.mode === 'window') $('#live-area').textContent = `Reading only the game window "${dc.name}" (change: Reset game area, or the Game window menu).`;
  else $('#live-area').textContent = ga ? (ga.full ? 'Game area: the whole capture.' : `Game area set (${Math.round(ga.w * ga.fw)}×${Math.round(ga.h * ga.fh)} px of a ${ga.fw}×${ga.fh} capture).`) : 'Game area not set yet: you\'ll be asked to box the game the first time a reader starts.';
  // test card on the overlay (desktop: on top of the game; browser: in the overlay preview window)
  $('#live-test').addEventListener('click', () => {
    if (typeof BroadcastChannel !== 'undefined') new BroadcastChannel('e7-overlay').postMessage({ test: true });
  });
  // desktop: is the overlay on screen, and if not, why (refreshed every 2 s)
  const ovStatus = () => {
    const D = window.E7Desktop;
    const el = $('#live-ovstatus');
    if (!D || !D.overlayStatus) return;
    let o;
    try {
      o = D.overlayStatus();
    } catch (_) {
      return;
    }
    const g = o.gameState;
    let why;
    if (!o.on) why = 'The overlay is turned off. Ctrl+Shift+O turns it on.';
    else if (o.mode === 'window' && o.tracking && g && g.w) why = o.visible ? `On top of the game window (${g.w}×${g.h}).` : 'Hidden while another program is in front of the game. Click the game and it comes back.';
    else if (o.mode === 'window' && o.tracking && g && g.min) why = 'Hidden: the game window is minimized.';
    else if (o.mode === 'window' && o.tracking) why = 'Looking for the game window…';
    else if (o.fallback) why = `Couldn't follow the game window, so the overlay covers the whole display (lines up exactly in borderless fullscreen). Reason: ${o.error}`;
    else if (o.mode === 'window') why = "The game window isn't open or wasn't found: start the game (it's found again within a few seconds) or use Game window → Pick the game window.";
    else if (o.mode === 'screen') why = o.visible ? 'Covering the whole display the game is on.' : 'Hidden.';
    else why = 'No game window chosen yet: Game window → Pick the game window.';
    el.innerHTML = `<b>Overlay now:</b> ${o.visible ? '<span class="ok-text">visible</span>' : '<span class="warn-text">not visible</span>'} · ${esc(why)}`;
    el.classList.remove('hidden');
  };
  ovStatus();
  setInterval(ovStatus, 2000);
  $('#live-preview').addEventListener('click', () => window.open('overlay.html', 'e7-overlay-preview', 'width=1100,height=640'));

  const layers = {};
  if (typeof BroadcastChannel !== 'undefined') {
    const ch = new BroadcastChannel('e7-overlay');
    ch.onmessage = (e) => {
      if (!e.data || !e.data.layer) return;
      layers[e.data.layer] = { items: e.data.items || [], at: e.data.at };
      $('#live-layers').innerHTML =
        Object.entries(layers)
          .map(([k, v]) => `<li><b>${esc(MODULE[k] || k)}</b> <span class="hint">${new Date(v.at).toLocaleTimeString()}</span>${v.items.length ? v.items.map((i) => `<div class="small">${i.level ? `<span class="gwdot ${esc(i.level)}"></span> ` : ''}${esc(i.title || '')}${(i.lines || []).length ? ` <span class="hint">— ${esc(i.lines.join(' · '))}</span>` : ''}</div>`).join('') : '<div class="hint">cleared</div>'}</li>`)
          .join('') || '<li class="hint">Nothing yet.</li>';
    };
    ch.postMessage({ hello: true });
  }
})();
