/*
 * Pop-out mini window that stays on top of the emulator
 * (Document Picture-in-Picture, Chrome/Edge 116+). Falls back to a normal
 * small popup window in other browsers.
 *
 * Shows: draft status, top suggestions (click to pick), best pair, postban
 * risk, opponent profile, scouted enemy speeds, and Win/Loss/Undo buttons.
 */
(function () {
  'use strict';
  const App = window.RTAApp;
  const L = window.RTALogic;
  const Learn = window.RTALearn;
  const esc = App.esc;
  let win = null;

  async function open() {
    if (win && !win.closed) return win.focus();
    win = null;
    // Picture-in-Picture (Chrome/Edge). The desktop app has no PiP: it opens a normal window that it keeps on top.
    const desktop = /Electron/.test(navigator.userAgent);
    if (window.documentPictureInPicture && !desktop) {
      try {
        win = await window.documentPictureInPicture.requestWindow({ width: 340, height: 520 });
      } catch (_) {
        win = null;
      }
    }
    if (!win) {
      win = window.open('', 'rta-mini', 'width=340,height=560');
      if (!win) return alert('The pop-up was blocked. Allow pop-ups for this page.');
      win.document.title = 'RTA mini';
    }
    for (const link of document.querySelectorAll('link[rel=stylesheet]')) {
      const l = win.document.createElement('link');
      l.rel = 'stylesheet';
      l.href = link.href;
      win.document.head.appendChild(l);
    }
    win.document.body.className = 'pip';
    win.document.body.innerHTML = '<div id="pip-root"></div>';
    win.document.body.addEventListener('click', onClick);
    win.document.addEventListener('keydown', (e) => document.dispatchEvent(new KeyboardEvent('keydown', { key: e.key })));
    win.addEventListener('pagehide', () => (win = null));
    render();
  }

  function close() {
    if (win) win.close();
    win = null;
  }

  function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'pick') App.selectHero(b.dataset.code);
    else if (a === 'win' || a === 'loss') App.recordResult(a);
    else if (a === 'undo') document.querySelector('#draft-undo').click();
    else if (a === 'cr' && window.RTAAuto) window.RTAAuto.readCR();
    render();
  }

  function render() {
    if (!win || win.closed) return;
    const root = win.document.getElementById('pip-root');
    if (!root) return;
    const st = App.store;
    const d = st.draft;
    const step = L.currentStep(d);
    const ctx = App.suggestionContext();
    const v = L.draftView(d);
    const chip = (code) => `<span class="hchip">${App.portrait(code, 'pt sm')}${esc(App.nameOf(code))}</span>`;
    const parts = [];

    const status = !step ? 'Draft complete' : `${step.player === 'me' ? 'YOUR' : 'Their'} ${step.phase}`;
    parts.push(`<div class="pip-status ${step ? step.player : ''}">${status}${d.opponent ? ` · vs <b>${esc(d.opponent)}</b>` : ''}${window.RTAAuto && window.RTAAuto.isWatching() ? ' <span class="live-dot on"></span>' : ''}</div>`);

    const prof = st.settings.usePlayer ? Learn.getProfile(App.cache.stats, d.opponent) : null;
    if (prof) parts.push(`<div class="pip-line"><span class="src player">player</span> ${prof.games}g, you win ${Math.round((prof.myWins / prof.games) * 100)}% · likes ${prof.picks.slice(0, 3).map((x) => esc(App.nameOf(x.code))).join(', ')}</div>`);

    let items = [];
    if (step && step.phase === 'preban' && step.player === 'me') items = L.suggestPrebans(d, App.cache.heroes, ctx, 3);
    else if (step && step.phase === 'pick') items = L.suggestPicks(d, App.cache.heroes, ctx, 3);
    else if (step && step.phase === 'postban') items = L.suggestPostban(d, App.cache.heroes, ctx, step.player).slice(0, 3);
    if (items.length) {
      parts.push(
        '<ol class="pip-sug">' +
          items
            .map((s, i) => `<li><button data-act="pick" data-code="${esc(s.hero.code)}" title="Shortcut: ${i + 1}">${chip(s.hero.code)}</button> <span class="score">${s.score > 0 ? '+' : ''}${s.score}</span><div class="why">${s.reasons.slice(0, 2).map((r) => esc(r.text)).join(' · ')}</div></li>`)
            .join('') +
          '</ol>',
      );
    }
    if (step && step.phase === 'pick' && step.player === 'me') {
      const pair = L.suggestPairs(d, App.cache.heroes, ctx, 1)[0];
      if (pair) parts.push(`<div class="pip-line">Pair: ${chip(pair.heroes[0].code)} + ${chip(pair.heroes[1].code)} <span class="score">+${pair.score}</span></div>`);
      const risk = L.postbanRisk(d, App.cache.heroes, ctx);
      if (risk && risk.score > 0) parts.push(`<div class="pip-line warn">Ban risk: ${chip(risk.hero.code)}</div>`);
    }

    const enemies = v.picks.opp.filter((c) => !v.postbans.me.includes(c));
    if (enemies.length) {
      parts.push(
        '<div class="pip-speeds">' +
          enemies
            .map((c) => {
              const e = st.scouting.find((x) => x.draftId === d.id && x.code === c);
              const seen = App.scoutedSpeed(c, d.opponent);
              const sp = (e && e.speed) || (seen && seen.speed);
              return `<span>${App.portrait(c, 'pt sm')} ${sp ? `${e && e.speed ? '' : '~'}${Math.round(sp)}` : '?'}</span>`;
            })
            .join('') +
          '</div>',
      );
    }

    parts.push(`<div class="btn-row">
      <button class="btn" data-act="undo">Undo</button>
      ${!step ? '<button class="btn win" data-act="win">Win</button><button class="btn loss" data-act="loss">Loss</button>' : ''}
      ${window.RTAAuto ? '<button class="btn" data-act="cr">Read CR</button>' : ''}
    </div>`);
    root.innerHTML = parts.join('');
  }

  App.onDraftRender(render);
  document.querySelector('#pip-btn').addEventListener('click', open);
  window.RTAPip = { open, close, toggle: () => (win && !win.closed ? close() : open()), render, isOpen: () => !!(win && !win.closed) };
})();
