/*
 * RTA → "Top players" tab (DEVLOG #47): what the collected top-player games say. Owner: "a statistics page that shows
 * useful information regarding the stats from top players' games".
 * Reads the fitted model (E7RecordsApp.topModel(), js/topmodel.js) and, for builds, the stored games. Tables come from
 * js/topstats.js; this file only draws. Nothing is sent anywhere. Source label: 'top players'.
 * Colour: one blue for "how much" bars; blue / red around a middle line for better / worse than average. Every bar has
 * its number next to it.
 */
(function () {
  'use strict';
  const TS = window.E7TopStats;
  const RA = () => window.E7RecordsApp;
  const App = () => window.RTAApp;
  const $ = (s) => document.querySelector(s);
  const root = () => $('#top-stats');
  if (!TS || !root()) return;
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const name = (c) => (App() ? App().nameOf(c) : c);
  const pic = (c) => (App() ? App().portrait(c, 'pt sm', true) : '');
  const pct = (x, d = 0) => (x === null || x === undefined ? '—' : `${(x * 100).toFixed(d)}%`);
  const sg = (x) => (x === null || x === undefined ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(1)}`);
  const chip = (c) => `<button class="link ts-hero" data-ts="${esc(c)}">${pic(c)}<span>${esc(name(c))}</span></button>`;

  const view = { sort: 'pick', dir: -1, q: '', min: 50, hero: null, season: '' }; // season '' = what suggestions use
  let cache = { engine: null, rows: null, builds: null, players: 0 };
  let seasonEngine = { code: '', engine: null, loading: false };
  let storedSeasons = [];

  /** A "how much" bar with its number: value 0..max. */
  const bar = (v, max, label, title) =>
    v === null || v === undefined
      ? '<span class="ts-none">—</span>'
      : `<span class="ts-cell" title="${esc(title || '')}"><span class="ts-num">${label}</span><span class="ts-track"><span class="ts-bar" style="width:${Math.max(0, Math.min(100, (v / max) * 100)).toFixed(1)}%"></span></span></span>`;
  /** Better / worse than average around a middle line: value in percentage points, full scale ±max. */
  const div = (v, max, title) => {
    if (v === null || v === undefined) return '<span class="ts-none">—</span>';
    const w = Math.min(50, (Math.abs(v) / max) * 50).toFixed(1);
    return `<span class="ts-cell" title="${esc(title || '')}"><span class="ts-num">${sg(v)}</span><span class="ts-div"><span class="ts-mid"></span><span class="ts-${v >= 0 ? 'pos' : 'neg'}" style="width:${w}%"></span></span></span>`;
  };

  const COLS = [
    { key: 'name', label: 'Hero', tip: 'Click a hero for partners, counters, pick order and builds' },
    { key: 'pick', label: 'Picked', tip: 'Share of games in which a player picked it' },
    { key: 'trend', label: 'Trend', tip: 'Change of its pick rate: the newest 7 days against the 7 days before, in points' },
    { key: 'wr', label: 'Win rate', tip: 'Plain win rate when it played (not banned). Good players inflate it for their favourite heroes' },
    { key: 'pp', label: 'Strength', tip: 'The model\'s hero effect in percentage points of win rate, with the players\' skill taken out. 0 = an average, often picked hero' },
    { key: 'prebanFirst', label: 'Pre-ban · 1st pick', tip: 'Share of players WITH the first pick who pre-ban it' },
    { key: 'prebanSecond', label: 'Pre-ban · 2nd pick', tip: 'Share of players picking second who pre-ban it' },
    { key: 'first', label: 'Opening pick', tip: 'Share of drafts the first-pick player opens with it' },
    { key: 'banned', label: 'Banned when picked', tip: 'How often it is the hero the opponent bans at the end (the third pick can never be banned)' },
    { key: 'fast', label: 'Moves first', tip: 'Share of its games in which it had the highest combat readiness of all ten heroes at the start' },
    { key: 'games', label: 'Games', tip: 'Weighted games it played in (recent games count more)' },
    { key: 'myGames', label: 'Me', tip: 'My own matches with it (History; the season choice there applies) and my win rate with it' },
  ];

  function tiles(o, info) {
    const t = (label, value, sub) => `<div class="card ts-tile"><div class="hint">${label}</div><div class="stat">${value}</div><div class="hint">${sub || ''}</div></div>`;
    return `<div class="ts-tiles">
      ${t('Games in use', o.games.toLocaleString(), `both players Legend / Emperor, newest ${esc(o.latestDay)}`)}
      ${t('Players seen', info.players ? info.players.toLocaleString() : '—', `${o.heroes} different heroes played`)}
      ${t('First pick wins', pct(o.firstPickWr, 1), 'of games where the first pick is known')}
      ${t('Model check', o.check ? pct(o.check.accuracy) : '—', o.check ? `winner named in ${o.check.n.toLocaleString()} games it had not seen (a coin: 50%)` : 'too few games for the self-check yet')}
    </div>`;
  }

  function table(rows) {
    const maxPick = Math.max(0.01, ...rows.map((r) => r.pick));
    const maxPre = Math.max(0.01, ...rows.map((r) => Math.max(r.prebanFirst || 0, r.prebanSecond || 0)));
    const maxFirst = Math.max(0.01, ...rows.map((r) => r.first));
    const maxPp = Math.max(1, ...rows.map((r) => Math.abs(r.pp || 0)));
    const maxTrend = Math.max(2, ...rows.map((r) => Math.abs(r.trend || 0)));
    const head = COLS.map((c) => `<th data-sort="${c.key}" title="${esc(c.tip)}" class="${view.sort === c.key ? 'sorted' : ''}">${esc(c.label)}${view.sort === c.key ? (view.dir < 0 ? ' ▾' : ' ▴') : ''}</th>`).join('');
    const body = rows
      .map(
        (r) => `<tr data-ts="${esc(r.code)}" class="${view.hero === r.code ? 'sel' : ''}">
        <td>${chip(r.code)}</td>
        <td>${bar(r.pick, maxPick, pct(r.pick), `${name(r.code)}: picked in ${pct(r.pick, 1)} of games`)}</td>
        <td>${r.trend === null ? '<span class="ts-none">—</span>' : div(r.trend, maxTrend, `${name(r.code)}: picked in ${pct(r.trendNow, 1)} of the newest week's games, ${pct(r.trendBefore, 1)} the week before`)}</td>
        <td>${r.wr === null ? '<span class="ts-none">—</span>' : div((r.wr - 0.5) * 100, 15, `${name(r.code)}: ${pct(r.wr, 1)} plain win rate`).replace(/<span class="ts-num">[^<]*<\/span>/, `<span class="ts-num">${pct(r.wr)}</span>`)}</td>
        <td>${div(r.pp, maxPp, `${name(r.code)}: ${sg(r.pp)} pp (first-pick side ${sg(r.ppFirst)}, second-pick side ${sg(r.ppSecond)})`)}</td>
        <td>${bar(r.prebanFirst, maxPre, pct(r.prebanFirst), `${pct(r.prebanFirst, 1)} of first-pick players pre-ban ${name(r.code)}`)}</td>
        <td>${bar(r.prebanSecond, maxPre, pct(r.prebanSecond), `${pct(r.prebanSecond, 1)} of second-pick players pre-ban ${name(r.code)}`)}</td>
        <td>${bar(r.first, maxFirst, pct(r.first), `Opening pick in ${pct(r.first, 1)} of drafts`)}</td>
        <td>${bar(r.banned, 1, pct(r.banned), `Banned at the end in ${pct(r.banned, 1)} of the games it was picked`)}</td>
        <td>${bar(r.fast, 1, pct(r.fast), r.cr === null ? '' : `Fastest of all ten in ${pct(r.fast, 1)} of its games · average start readiness ${r.cr}%`)}</td>
        <td class="ts-n">${Math.round(r.games).toLocaleString()}</td>
        <td class="ts-me" title="${r.myGames ? esc(`You: ${r.myGames} matches with ${name(r.code)}, ${r.myWins} won · top players win ${pct(r.wr)} with it`) : ''}">${r.myGames ? `${r.myGames} · ${pct(r.myWins / r.myGames)}` : '<span class="ts-none">—</span>'}</td>
      </tr>`,
      )
      .join('');
    return `<div class="table-wrap"><table class="db-table ts-table"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${COLS.length}" class="hint">No hero matches.</td></tr>`}</tbody></table></div>`;
  }

  const effList = (list, word) => (list.length ? list.map((x) => `<div class="ts-row">${chip(x.code)}<span class="ts-eff">${div(x.pp, 8, `${sg(x.pp)} pp ${word} ${name(x.code)} · ${x.n} games`)}</span><span class="ts-n">${x.n}</span></div>`).join('') : '<div class="hint">Nothing clear yet (needs more games together).</div>');

  function detail(stats, model, row) {
    const c = row.code;
    const P = TS.partners(stats, model, c);
    const M = TS.matchups(stats, model, c);
    const B = cache.builds && cache.builds.get(c);
    const N = RA().names;
    const slotMax = Math.max(0.01, ...row.slot);
    const slots = row.slot.map((s, i) => `<div class="ts-row"><span class="ts-lab">${['1st', '2nd', '3rd', '4th', '5th'][i]} pick${i === 2 ? ' <span class="hint">(cannot be banned)</span>' : ''}</span>${bar(s, slotMax, pct(s), `${pct(s, 1)} of its picks`)}</div>`).join('');
    const builds = B && B.list.length
      ? B.list.map((b) => `<div class="ts-row"><span class="ts-build"><b>${esc(N.artifact(b.artifact))}</b> · ${esc(b.sets.map(N.set).join(' / ') || 'sets unknown')}</span>${bar(b.share, 1, pct(b.share), `${b.n} of ${B.games} games`)}<span class="ts-n" title="Win rate with this build (few games: read with care)">${b.n >= 10 ? pct(b.wins / b.n) + ' won' : ''}</span></div>`).join('')
      : '<div class="hint">No builds recorded for it in these games.</div>';
    return `<div class="card wide ts-detail" id="ts-detail">
      <div class="ts-head">${App() ? App().portrait(c, 'pt') : ''}<h3>${esc(name(c))}</h3>
        <span class="hint">picked ${pct(row.pick)} · ${row.wr === null ? '' : `${pct(row.wr)} win rate · `}strength ${sg(row.pp)} pp (first-pick side ${sg(row.ppFirst)}, second-pick side ${sg(row.ppSecond)})</span>
        <span class="grow"></span>${window.HeroInfo ? `<button class="btn" data-card="${esc(c)}">Hero card</button>` : ''}<button class="btn" id="ts-close">Close</button></div>
      <div class="ts-grid">
        <div><h4>Best with</h4>${effList(P.best, 'with')}</div>
        <div><h4>Worse with</h4>${effList(P.worst, 'with')}</div>
        <div><h4>Good against</h4>${effList(M.good, 'against')}</div>
        <div><h4>Struggles against</h4>${effList(M.bad, 'against')}</div>
        <div><h4>When it is picked</h4>${slots}</div>
        <div><h4>How top players build it</h4>${builds}</div>
        <div><h4>You</h4>${me(row, B)}</div>
      </div>
      <p class="hint">“Best with” and “against” show what is left after the heroes' own strength and the players' skill are taken out, in percentage points of win rate; the grey number is games together. Small samples are pulled towards 0.</p>
    </div>`;
  }

  /** A hero's detail: my own record with it and my build next to the top players' builds. */
  function me(row, B) {
    const A = App();
    if (!A) return '';
    const N = RA().names;
    const out = [];
    const total = A.cache.stats ? A.cache.stats.games : 0;
    if (row.myGames) {
      const mine = row.myWins / row.myGames;
      out.push(`<div class="ts-row"><span class="ts-lab">Your matches with it <span class="hint">(${row.myGames} of ${total})</span></span>${div((mine - 0.5) * 100, 25, `${row.myWins} of ${row.myGames} won`).replace(/<span class="ts-num">[^<]*<\/span>/, `<span class="ts-num">${pct(mine)}</span>`)}</div>`);
      if (row.wr !== null && row.myGames >= 5) out.push(`<div class="hint">Top players win ${pct(row.wr)} with it${Math.abs(mine - row.wr) >= 0.08 ? (mine > row.wr ? ': you do better than they do.' : ': you do worse than they do; compare the build and the partners above.') : ', about the same as you.'}</div>`);
    } else out.push(`<div class="hint">${total ? `Not in any of your ${total} matches.` : 'No matches of your own yet (History).'}</div>`);
    const b = A.cache.builds && A.cache.builds.get(row.code);
    if (b && b.itemCount) {
      const mineB = { sets: b.sets || [], artifact: b.artifact || '' };
      out.push(`<div class="ts-row"><span class="ts-build">Your build <span class="src fribbels">gear</span>: <b>${esc(mineB.artifact || 'no artifact')}</b> · ${esc(mineB.sets.join(' / ') || 'no full set')}${b.speed ? ` · ${b.speed} speed` : ''}</span></div>`);
      if (B && B.list.length) {
        const hit = B.list.map((t) => ({ t, m: TS.sameBuild(mineB, { sets: t.sets.map(N.set), artifact: N.artifact(t.artifact) }) })).find((x) => x.m.sets);
        const top = B.list[0];
        out.push(hit
          ? `<div class="hint">✓ Same sets as ${pct(hit.t.share)} of top players${hit.m.artifact ? ', same artifact' : `; they pair them with <b>${esc(N.artifact(hit.t.artifact))}</b>`}.</div>`
          : `<div class="hint">≠ Different from what top players use most: <b>${esc(N.artifact(top.artifact))}</b> · ${esc(top.sets.map(N.set).join(' / '))} (${pct(top.share)}).</div>`);
      }
    } else if (A.cache.owned && A.cache.owned.has(row.code)) out.push('<div class="hint">You own it; no gear known for it (import gear.txt or read it with the Gear page).</div>');
    return out.join('');
  }

  /** What moved: the biggest changes of the pick rate, newest week against the week before. */
  function movers() {
    const T = cache.trends;
    if (!cache.builds) return '';
    if (!T) return '<p class="hint">Trend: needs at least 150 games in each of the last two weeks.</p>';
    const all = [...T.heroes.entries()].map(([code, t]) => ({ code, ...t })).filter((x) => Math.max(x.now, x.before) >= 0.02);
    const up = [...all].sort((x, y) => y.delta - x.delta).filter((x) => x.delta > 0.004).slice(0, 8);
    const down = [...all].sort((x, y) => x.delta - y.delta).filter((x) => x.delta < -0.004).slice(0, 8);
    const max = Math.max(2, ...all.map((x) => Math.abs(x.delta * 100)));
    const row = (x) => `<div class="ts-row">${chip(x.code)}<span class="ts-eff">${div(x.delta * 100, max, `${pct(x.now, 1)} now, ${pct(x.before, 1)} the week before`)}</span><span class="ts-n ts-was">${pct(x.before)} → ${pct(x.now)}</span></div>`;
    return `<div class="ts-lists two">
      <div class="card"><h4>Picked more this week <span class="hint">${esc(T.mid)} to ${esc(T.to)} against the 7 days before · points of pick rate</span></h4>${up.map(row).join('') || '<div class="hint">Nothing moved up.</div>'}</div>
      <div class="card"><h4>Picked less this week <span class="hint">${T.gamesNow.toLocaleString()} games now, ${T.gamesBefore.toLocaleString()} before</span></h4>${down.map(row).join('') || '<div class="hint">Nothing moved down.</div>'}</div>
    </div>`;
  }

  function lists(stats, model) {
    const rate = (list, max) => list.map((x) => `<div class="ts-row">${chip(x.code)}${bar(x.rate, max, pct(x.rate), '')}</div>`).join('') || '<div class="hint">—</div>';
    const pf = TS.prebans(stats, 'first');
    const ps = TS.prebans(stats, 'second');
    const op = TS.openers(stats);
    const mp = Math.max(0.01, ...pf.map((x) => x.rate), ...ps.map((x) => x.rate));
    const pairs = TS.topPairs(stats, model);
    const ctr = TS.topCounters(stats, model);
    const duo = (list, sep) => list.map((x) => `<div class="ts-row"><span class="ts-duo">${chip(x.a)}<span class="hint">${sep}</span>${chip(x.b)}</span><span class="ts-eff">${div(x.pp, 8, `${sg(x.pp)} pp · ${x.n} games`)}</span><span class="ts-n">${x.n}</span></div>`).join('') || '<div class="hint">Needs more games.</div>';
    return `<div class="ts-lists">
      <div class="card"><h4>Pre-bans with the first pick</h4>${rate(pf, mp)}</div>
      <div class="card"><h4>Pre-bans when picking second</h4>${rate(ps, mp)}</div>
      <div class="card"><h4>Opening picks</h4>${rate(op, Math.max(0.01, ...op.map((x) => x.rate)))}</div>
    </div>
    <div class="ts-lists two">
      <div class="card"><h4>Strongest pairs <span class="hint">extra win rate together, in points · games</span></h4>${duo(pairs, '+')}</div>
      <div class="card"><h4>Biggest counters <span class="hint">extra win rate for the first hero · games</span></h4>${duo(ctr, 'beats')}</div>
    </div>`;
  }

  /** Which season the numbers are from, and the choice of one season alone. */
  function seasonBar(engine) {
    const R = RA();
    const ss = engine.meta.season;
    if (!ss) return '';
    const TMd = window.E7TopModel ? window.E7TopModel.DEFAULTS : { seasonMinGames: 10000, minGames: 400 };
    const note = ss.only
      ? `Only games of <b>${esc(R.seasonName(ss.code))}</b> (its pre-season included).`
      : `Season <b>${esc(R.seasonName(ss.code))}</b> (its pre-season included)${ss.otherGames ? `, with ${ss.otherGames.toLocaleString()} games of the season before mixed in at ${Math.round(ss.blend * 100)}% weight: a new season starts with few Legend / Emperor games, the older ones fade out as it reaches ${TMd.seasonMinGames.toLocaleString()}` : '; games of other seasons are not used'}. This is what the suggestions use.`;
    const opts = storedSeasons.filter((s) => s.games >= TMd.minGames);
    return `<div class="filters ts-season"><label class="inline">Season <select id="ts-season">
        <option value="">newest (as the suggestions use it)</option>
        ${opts.map((s) => `<option value="${esc(s.code)}" ${view.season === s.code ? 'selected' : ''}>${esc(s.name)} only · ${s.games.toLocaleString()} games</option>`).join('')}
      </select></label><span class="hint">${note}</span></div>`;
  }

  /** Builds and the number of players come from the stored games: read once per model. */
  async function loadExtras(engine) {
    if (cache.engine === engine && cache.builds) return;
    const rows = await RA()._store.battles();
    const since = engine.meta.latestDay ? new Date(Date.parse(engine.meta.latestDay + 'T00:00:00Z') - 60 * 86400000).toISOString().slice(0, 10) : '';
    const players = new Set();
    for (const r of rows) {
      if (since && r.day < since) continue;
      if (engine.meta.season && engine.meta.season.only && RA().seasonOfRow(r) !== engine.meta.season.code) continue;
      for (const [n, w, g] of [[r.aNick, r.aWorld, r.aGrade], [r.bNick, r.bWorld, r.bGrade]]) if (g === 'legend' || g === 'emperor') players.add(`${w}:${n}`);
    }
    const season = engine.meta.season && engine.meta.season.only ? engine.meta.season.code : '';
    cache = { engine, rows: null, builds: TS.builds(season ? rows.filter((r) => RA().seasonOfRow(r) === season) : rows, { since }), players: players.size };
    cache.trends = TS.trends(season ? rows.filter((r) => RA().seasonOfRow(r) === season) : rows);
    storedSeasons = await RA().storedSeasons();
  }

  function render() {
    const el = root();
    if (!el) return;
    const R = RA();
    const base = R && R.topModel ? R.topModel() : null;
    // one season alone: its own model, fitted on demand (kept until the stored games change)
    if (view.season && base && seasonEngine.code !== view.season) {
      seasonEngine = { code: view.season, engine: null, loading: true };
      R.modelFor(view.season).then((e) => {
        if (seasonEngine.code !== view.season) return;
        seasonEngine = { code: view.season, engine: e, loading: false };
        render();
      });
    }
    if (view.season && base && seasonEngine.loading) {
      el.innerHTML = `<p class="hint"><span class="src top">top players</span> Working out the statistics of ${esc(R.seasonName(view.season))}…</p>`;
      return;
    }
    if (view.season && base && !seasonEngine.engine) {
      el.innerHTML = `<p><span class="src top">top players</span> ${esc(R.seasonName(view.season))} has too few stored games between Legend / Emperor players for its own statistics (400 needed). <button class="btn" id="ts-season-back">Back to the newest season</button></p>`;
      return;
    }
    const engine = view.season && base ? seasonEngine.engine : base;
    if (!engine || !engine.ready) {
      const t = R && R.cfg ? R.cfg().top : null;
      el.innerHTML = `<div class="card wide"><h3><span class="src top">top players</span> Statistics from top players' games</h3>
        <p>${!R || !R.available() ? 'Available in the desktop app.' : t && t.rows ? `${t.rows.toLocaleString()} games are stored, ${t.games.toLocaleString()} of them between Legend / Emperor players. The statistics appear from 400 such games on${R.topState().running ? ' (the update is still running)' : ''}.` : 'No games collected yet. Go to <b>Data → Official match records → Update now</b>; the first run takes a while, the statistics appear here by themselves.'}</p></div>`;
      return;
    }
    const stats = engine.stats;
    const model = engine.model;
    if (cache.engine !== engine) {
      cache = { engine, rows: null, builds: null, players: 0 };
      loadExtras(engine).then(render).catch(() => {});
    }
    const o = TS.overview(stats);
    const mineOf = (c) => {
      const h = App() && App().cache.stats ? App().cache.stats.hero.get(c) : null;
      return h && h.mine.games ? { myGames: h.mine.games, myWins: h.mine.wins } : { myGames: 0, myWins: 0 };
    };
    const withMe = (r) => {
      const t = cache.trends && cache.trends.heroes.get(r.code);
      return { ...r, name: name(r.code), ...mineOf(r.code), trend: t ? t.delta * 100 : null, trendNow: t ? t.now : null, trendBefore: t ? t.before : null };
    };
    let rows = TS.heroes(stats, model).map(withMe);
    const q = view.q.trim().toLowerCase();
    rows = rows.filter((r) => (q ? r.name.toLowerCase().includes(q) : r.games >= view.min || r.prebanAny >= 0.05));
    rows = TS.sortRows(rows, view.sort, view.sort === 'name' ? -view.dir : view.dir);
    const selRaw = view.hero ? TS.heroes(stats, model).find((r) => r.code === view.hero) : null;
    const sel = selRaw ? withMe(selRaw) : null;
    const keep = document.activeElement && document.activeElement.id === 'ts-q' ? document.activeElement.selectionStart : null;
    el.innerHTML = `
      <p class="hint"><span class="src top">top players</span> From the games collected on the official record site (Data tab). Bars show how much; blue / red around the middle line show better / worse than average. Hover a number for details, click a column to sort, click a hero for more.</p>
      ${seasonBar(engine)}
      ${tiles(o, cache)}
      ${sel ? detail(stats, model, sel) : ''}
      <div class="filters"><input id="ts-q" type="search" placeholder="Search hero…" autocomplete="off" value="${esc(view.q)}" />
        <label class="inline">At least <select id="ts-min">${[10, 50, 150, 400].map((n) => `<option ${view.min === n ? 'selected' : ''}>${n}</option>`).join('')}</select> games</label>
        <span class="hint">${rows.length} heroes</span></div>
      ${table(rows)}
      ${movers()}
      ${lists(stats, model)}`;
    if (keep !== null) {
      const box = $('#ts-q');
      box.focus();
      box.setSelectionRange(keep, keep);
    }
  }

  root().addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (th) {
      const k = th.dataset.sort;
      if (view.sort === k) view.dir = -view.dir;
      else {
        view.sort = k;
        view.dir = -1;
      }
      return render();
    }
    if (e.target.closest('#ts-season-back')) {
      view.season = '';
      return render();
    }
    if (e.target.closest('#ts-close')) {
      view.hero = null;
      return render();
    }
    const card = e.target.closest('[data-card]');
    if (card && window.HeroInfo) return window.HeroInfo.open(card.dataset.card);
    const h = e.target.closest('[data-ts]');
    if (h) {
      view.hero = h.dataset.ts;
      render();
      const d = $('#ts-detail');
      if (d && d.scrollIntoView) d.scrollIntoView({ block: 'nearest' });
    }
  });
  root().addEventListener('input', (e) => {
    if (e.target.id === 'ts-q') {
      view.q = e.target.value;
      render();
    }
  });
  root().addEventListener('change', (e) => {
    if (e.target.id === 'ts-min') {
      view.min = Number(e.target.value);
      render();
    }
    if (e.target.id === 'ts-season') {
      view.season = e.target.value;
      view.hero = null;
      render();
    }
  });
  if (RA() && RA().onTop) {
    RA().onTop(() => {
      seasonEngine = { code: '', engine: null, loading: false }; // the stored games changed
      if (App() && App().activeTab() === 'top') render();
    });
  }
  window.E7TopStatsUI = { render, view };
})();
