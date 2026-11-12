/*
 * Guild War pop-out: a small always-on-top window beside the game
 * (Document Picture-in-Picture in Chrome/Edge; a normal pop-up elsewhere).
 * Shows the enemy you're looking at: their dot, each team, your proven
 * counter and speed check, and one-tap Won / Lost buttons.
 * The player is picked by the ⧉ button on a card, by typing in the pop-out,
 * or automatically when "Watch game" reads their name from the screen.
 */
(function () {
  'use strict';
  const A = window.GuildApp;
  const GW = window.RTAGuildWar;
  let win = null;

  async function open() {
    if (win && !win.closed) return win.focus();
    win = null;
    // Picture-in-Picture (Chrome/Edge). The desktop app has no PiP: it opens a normal window that it keeps on top.
    const desktop = /Electron/.test(navigator.userAgent);
    if (window.documentPictureInPicture && !desktop) {
      try {
        win = await window.documentPictureInPicture.requestWindow({ width: 360, height: 560 });
      } catch (_) {
        win = null;
      }
    }
    if (!win) {
      win = window.open('', 'e7-guild-mini', 'width=360,height=600');
      if (!win) return alert('The pop-up was blocked. Allow pop-ups for this page.');
      win.document.title = 'Guild War · Epic 7 Engine';
    }
    for (const l of document.querySelectorAll('link[rel=stylesheet]')) {
      const n = win.document.createElement('link');
      n.rel = 'stylesheet';
      n.href = l.href;
      win.document.head.appendChild(n);
    }
    win.document.body.className = 'pip';
    win.document.body.innerHTML = `<div class="pip-search"><input id="gp-q" list="gp-names" placeholder="Enemy player…" autocomplete="off" /><datalist id="gp-names"></datalist></div><div id="gp-root"></div>`;
    win.document.body.addEventListener('click', onClick);
    win.document.getElementById('gp-q').addEventListener('change', (e) => {
      const name = GW.matchPlayer(e.target.value, names()) || e.target.value.trim();
      e.target.value = '';
      A.setCurrent(name);
    });
    win.addEventListener('pagehide', () => (win = null));
    render();
  }
  function close() {
    if (win) win.close();
    win = null;
  }
  const names = () => [...new Set(A.state.targets.map((t) => t.player).filter(Boolean))];

  /** Uncleared targets in the current war, best chance first (green, ring, yellow, grey, red). */
  function queue() {
    const order = ['green', 'proven', 'yellow', 'grey', 'red'];
    return A.state.targets
      .filter((t) => t.warId === A.warId)
      .map((t) => ({ t, v: A.verdict(t) }))
      .filter((x) => !x.v.status.cleared)
      .sort((a, b) => order.indexOf(a.v.level) - order.indexOf(b.v.level));
  }

  function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'next' || act === 'prev') {
      const q = queue();
      if (!q.length) return;
      const i = q.findIndex((x) => GW.playerKey(x.t.player) === GW.playerKey(A.current()));
      const j = i < 0 ? 0 : (i + (act === 'next' ? 1 : -1) + q.length) % q.length;
      A.setCurrent(q[j].t.player);
    } else if (act === 'history') {
      window.focus();
      A.openHistory(A.current());
    } else if (act === 'win' || act === 'loss') {
      const t = A.targetFor(A.current());
      if (!t) return;
      const heroes = b.dataset.heroes ? b.dataset.heroes.split(',') : [];
      if (act === 'win' && !confirm(`Log a WIN vs ${t.player} team ${b.dataset.team}${heroes.length ? ' with ' + heroes.map(A.nameOf).join(' + ') : ''}?`)) return;
      A.logQuick(t, Number(b.dataset.team), act, heroes);
    }
  }

  function render() {
    if (!win || win.closed) return;
    const root = win.document.getElementById('gp-root');
    if (!root) return;
    const esc = A.esc;
    win.document.getElementById('gp-names').innerHTML = names().map((n) => `<option value="${esc(n)}"></option>`).join('');
    const left = A.attacksLeft();
    const watching = window.GuildWatch && window.GuildWatch.isWatching();
    const head = `<div class="pip-line hint">${left === null ? '' : `Your attacks left today: <b>${left}</b> · `}${watching ? '<span class="live-dot on"></span> reading names from the game' : 'tip: “Watch game” picks the player for you'}</div>`;
    const name = A.current();
    const t = name ? A.targetFor(name) : null;
    if (!t) {
      root.innerHTML = `${head}<p class="hint">${name ? `No record of <b>${esc(name)}</b> yet. Add their defense in the Guild War page.` : 'Press ⧉ on a player, type a name above, or turn on “Watch game”.'}</p>
        <div class="btn-row"><button class="btn" data-act="prev">◀ Prev</button><button class="btn" data-act="next">Next ▶</button></div>`;
      return;
    }
    const v = A.verdict(t);
    const thisWar = t.warId === A.warId;
    const teams = (t.teams || [])
      .slice(0, A.rules().teamsPerDefense)
      .map((tm, i) => {
        const tv = v.teams[i] || { level: 'grey', label: 'No information', lines: [] };
        const st = v.status.teams[i] || {};
        const speeds = Object.entries(tm.speeds || {}).filter(([, x]) => x);
        const ctr = tv.counter && tv.level !== 'red' ? tv.counter.attack : [];
        return `<div class="gw-team ${st.cleared ? 'cleared' : ''}">
          <div class="gw-team-head">${st.cleared ? '<span class="vd keep">cleared</span>' : A.dot(tv)} Team ${i + 1} · ${esc(tv.label)}</div>
          <div>${(tm.heroes || []).map(A.chip).join('')}</div>
          ${speeds.length ? `<div class="hint">Speed: ${speeds.map(([c, x]) => `${esc(A.nameOf(c))} ${x}`).join(' · ')}</div>` : ''}
          ${tm.build ? `<div class="hint">${esc(tm.build)}</div>` : ''}
          ${!st.cleared && tv.lines.length ? `<div class="hint">${tv.lines.map(esc).join('<br>')}</div>` : ''}
          ${!st.cleared && (tv.others || []).length ? `<div class="hint">Also owned by: ${esc(tv.others.join(', '))}</div>` : ''}
          ${!st.cleared && thisWar ? `<div class="btn-row"><button class="btn win" data-act="win" data-team="${i + 1}" data-heroes="${esc(ctr.join(','))}" title="${ctr.length ? 'Logs the suggested counter as your team' : ''}">Won</button><button class="btn loss" data-act="loss" data-team="${i + 1}" data-heroes="${esc(ctr.join(','))}">Lost</button></div>` : ''}
        </div>`;
      })
      .join('');
    root.innerHTML = `${head}
      <div class="pip-status">${A.dot(v)} ${esc(t.player)}${t.tower ? ` <span class="hint">· ${esc(t.tower)}</span>` : ''}${thisWar ? '' : ' <span class="hint">(from an earlier war)</span>'}</div>
      ${teams}
      <div class="btn-row"><button class="btn" data-act="prev">◀ Prev</button><button class="btn" data-act="next">Next ▶</button><button class="btn" data-act="history">Full history</button></div>`;
  }

  A.onChange(render);
  document.querySelector('#gw-pip').addEventListener('click', open);
  window.GuildPip = { open, close, render, isOpen: () => !!(win && !win.closed) };
})();
