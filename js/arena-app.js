/*
 * The Arena page (DEVLOG #71): reads localStorage['e7-arena'] (written by js/arena-log.js next to the game watcher)
 * and shows the opponents now with your record against each defense, a summary and every fight. Redraws when the
 * log changes (the storage event).
 */
(function () {
  'use strict';
  const A = window.E7Arena;
  const R = window.RTARoster;
  const S = window.RTASources || {};
  const HEROES = S.allHeroes || (S.officialSnapshot && S.officialSnapshot.heroes) || [];
  const NAME = new Map(HEROES.map((h) => [h.code, h.name]));
  const $ = (q) => document.querySelector(q);
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const KEY = 'e7-arena';
  const load = () => {
    try {
      return { now: null, defs: {}, pending: null, fights: [], ...(JSON.parse(localStorage.getItem(KEY) || '{}') || {}) };
    } catch (_) {
      return { now: null, defs: {}, pending: null, fights: [] };
    }
  };
  const save = (s) => localStorage.setItem(KEY, JSON.stringify(s));
  const hero = (c) =>
    c
      ? `<span class="ar-hero" title="${esc(NAME.get(c) || c)}"><img class="pt" loading="lazy" alt="" src="${esc(R.PORTRAIT_URL(c))}" onerror="this.classList.add('broken')" /></span>`
      : '<span class="ar-hero unknown" title="not recognised">?</span>';
  const team = (codes) => `<span class="ar-team">${(codes && codes.length ? codes : [null, null, null, null]).map(hero).join('')}</span>`;
  const when = (t) => (t ? new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

  function render() {
    const s = load();
    const fights = s.fights || [];
    // opponents now, best chance first
    const now = (s.now && s.now.list) || [];
    if (now.length) {
      const rows = now.map((o) => ({ o, a: A.advise(o, fights) }));
      const best = rows.filter((r) => r.a.score !== null).sort((x, y) => y.a.score - x.a.score)[0];
      $('#ar-now').innerHTML =
        `<p class="hint">Read from the game ${esc(when(s.now.at))}.</p>` +
        rows
          .map(({ o, a }) => {
            const teams = a.exact.teams.filter((t) => t.wins > 0).slice(0, 2);
            return `<div class="ar-opp${best && best.o === o ? ' best' : ''}"><div class="ar-who"><b>${esc(o.name)}</b> <span class="hint">${o.pts ? esc(o.pts.toLocaleString()) + ' pts' : ''}</span>${best && best.o === o ? ' <span class="src learned">best chance</span>' : ''}</div>${team(o.heroes)}<div class="ar-adv">${esc(a.text)}${teams.length ? `<div class="hint">Won with: ${teams.map((t) => `${t.team.map((c) => esc(NAME.get(c) || '?')).join(', ')} (${t.wins}–${t.losses})`).join(' · ')}</div>` : ''}</div></div>`;
          })
          .join('');
    }
    // summary
    const counted = fights.filter((f) => !f.fun);
    const wins = counted.filter((f) => f.result === 'win').length;
    const week = counted.filter((f) => Date.now() - f.at < 7 * 864e5);
    const hr = [...A.heroRecord(counted).entries()].filter(([, r]) => r.wins + r.losses >= 2).sort((a, b) => a[1].wins / (a[1].wins + a[1].losses) - b[1].wins / (b[1].wins + b[1].losses)).slice(0, 5);
    $('#ar-summary').innerHTML = counted.length
      ? `<div class="card"><div class="hint">Fights logged</div><div class="stat">${counted.length}</div><div class="hint">${wins} won · ${counted.length - wins} lost</div></div>
         <div class="card"><div class="hint">Last 7 days</div><div class="stat">${week.filter((f) => f.result === 'win').length}–${week.filter((f) => f.result !== 'win').length}</div><div class="hint">${week.reduce((s2, f) => s2 + (f.delta || 0), 0) >= 0 ? '+' : ''}${week.reduce((s2, f) => s2 + (f.delta || 0), 0)} points</div></div>
         <div class="card"><div class="hint">Defense heroes you lose to most</div>${hr.length ? hr.map(([c, r]) => `<div>${hero(c)} ${esc(NAME.get(c) || c)} <span class="hint">${r.wins}–${r.losses}</span></div>`).join('') : '<div class="hint">After a few fights.</div>'}</div>`
      : '';
    $('#ar-fights').innerHTML =
      fights
        .slice(0, 300)
        .map((f, i) => `<tr class="${f.fun ? 'off' : ''}"><td>${esc(when(f.at))}</td><td>${esc(f.opponent)}</td><td>${team(f.defense)}</td><td>${team(f.mine)}</td><td class="res ${f.result}">${f.result === 'win' ? 'WIN' : 'LOSS'}</td><td>${f.points ? esc(f.points.toLocaleString()) : ''}${typeof f.delta === 'number' ? ` <span class="hint">(${f.delta > 0 ? '+' : ''}${f.delta})</span>` : ''}</td><td><button class="btn" data-del="${i}" title="Delete this fight">✕</button></td></tr>`)
        .join('') || '<tr><td colspan="7" class="hint">No fights yet: fight in the game\'s Arena and the result is logged here.</td></tr>';
  }
  $('#ar-fights').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b || !confirm('Delete this fight?')) return;
    const s = load();
    s.fights.splice(Number(b.dataset.del), 1);
    save(s);
    render();
  });
  window.addEventListener('storage', (e) => e.key === KEY && render());
  render();
  window.E7ArenaApp = { render };
})();
