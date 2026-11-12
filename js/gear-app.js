/* Gear Sorter page. Uses RTARoster, RTAGear, RTAGearSort. */
(function () {
  'use strict';
  const R = window.RTARoster;
  const G = window.RTAGear;
  const S = window.RTAGearSort;
  const HEROES = window.RTASources.officialSnapshot.heroes;
  const GEAR_KEY = 'rta-gear-v1'; // { fileName, importedAt, items, rules, overrides }
  const MAIN_KEY = 'rta-helper-v2'; // the RTA Helper's store (we only update its `fribbels` roster)
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const byCode = new Map(HEROES.map((h) => [h.code, h]));
  const nameOf = (c) => (byCode.get(c) || {}).name || c;
  const portrait = (c) => (byCode.get(c) ? `<img class="pt sm" loading="lazy" alt="" src="${esc(R.PORTRAIT_URL(c))}" onerror="this.classList.add('broken')" />` : '');
  const setLabel = (s) => (G.SETS[s] ? G.SETS[s][0] : String(s || '').replace(/Set$/, ''));

  let gs = load();
  let evald = { profiles: [], results: [] };
  let shown = 150;

  function load() {
    let g = null;
    try {
      g = JSON.parse(localStorage.getItem(GEAR_KEY));
    } catch (_) { /* ignore */ }
    g = g && typeof g === 'object' ? g : {};
    return {
      fileName: g.fileName || '',
      importedAt: g.importedAt || null,
      items: Array.isArray(g.items) ? g.items : [], // source 'fribbels' (gear.txt)
      scanned: Array.isArray(g.scanned) ? g.scanned : [], // source 'screen' (read from the game, see gear-scan.js)
      useScanned: g.useScanned !== false,
      rules: { ...S.DEFAULT_RULES, ...(g.rules || {}) },
      overrides: g.overrides || {},
    };
  }
  function save() {
    try {
      localStorage.setItem(GEAR_KEY, JSON.stringify(gs));
    } catch (e) {
      alert('Could not save (browser storage full?): ' + e.message);
    }
  }
  function recompute() {
    evald = S.evaluateAll(allItems(), HEROES, gs.overrides, gs.rules);
  }
  /** gear.txt items + screen-read items (kept as separate sources; screen items aren't linked to a hero). */
  function allItems() {
    return gs.useScanned ? [...gs.items, ...gs.scanned] : gs.items;
  }

  // ------------------------------------------------------------------ import
  $('#gs-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const items = S.slimInventory(data, HEROES);
      if (!items.length) throw new Error('No items found in this file.');
      gs = { ...gs, fileName: file.name, importedAt: new Date().toISOString(), items };
      save();
      // keep the RTA Helper's roster + speeds in sync (its own 'fribbels' source)
      try {
        const main = JSON.parse(localStorage.getItem(MAIN_KEY) || 'null');
        if (main && typeof main === 'object') {
          const r = R.parseFribbels(text, HEROES);
          main.fribbels = { source: 'fribbels', fileName: file.name, importedAt: gs.importedAt, ...r, builds: G.extractBuilds(data, HEROES) };
          localStorage.setItem(MAIN_KEY, JSON.stringify(main));
        }
      } catch (_) { /* the helper will pick it up on its own import */ }
      recompute();
      render();
    } catch (err) {
      alert('Could not import: ' + err.message);
    }
  });

  // ------------------------------------------------------------------- rules
  const RULE_INPUTS = { '#r-keep': 'keepWss', '#r-reforge': 'reforgeWss', '#r-speed': 'speedKeep', '#r-margin': 'upgradeMargin' };
  for (const [sel, k] of Object.entries(RULE_INPUTS)) {
    $(sel).addEventListener('change', (e) => {
      gs.rules[k] = Number(e.target.value) || 0;
      save();
      recompute();
      render();
    });
  }

  // ------------------------------------------------------------------ render
  const fmtSub = (s) => `${S.STATS[s.type] || s.type} ${s.value}${/Percent/.test(s.type) ? '%' : ''}${s.rolls > 1 ? `<sup>${s.rolls}</sup>` : ''}`;
  const VERDICT_LABEL = { keep: 'Keep', enhance: 'Enhance', reforge: 'Reforge', extract: 'Extract', sell: 'Sell' };

  function filtered() {
    const v = $('#f-verdict').value;
    const g = $('#f-gear').value;
    const st = $('#f-set').value;
    const eq = $('#f-eq').value;
    const hq = $('#f-hero').value.trim();
    const hero = hq ? HEROES.find((h) => R.normName(h.name) === R.normName(hq)) : null;
    let list = evald.results.filter(
      (r) => (!v || r.verdict === v) && (!g || r.item.gear === g) && (!st || r.item.set === st) && (!eq || (eq === 'eq' ? r.item.equipped : !r.item.equipped)),
    );
    if (hero) {
      const p = evald.profiles.find((x) => x.code === hero.code);
      if (p) {
        const cur = gs.items.filter((i) => i.equipped === hero.code);
        list = list
          .filter((r) => r.item.equipped !== hero.code)
          .map((r) => {
            const c = cur.find((i) => i.gear === r.item.gear);
            const f = S.fit(r.item, p);
            return { ...r, heroFit: { code: hero.code, fit: f, delta: Math.round((f - (c ? S.fit(c, p) : 0)) * 10) / 10 } };
          })
          .filter((r) => r.heroFit.delta > 0);
      }
    }
    const sort = $('#f-sort').value;
    const speed = (r) => r.item.subs.filter((s) => s.type === 'Speed').reduce((n, s) => n + s.value, 0) + (r.item.main.type === 'Speed' ? 100 : 0);
    const key = sort === 'delta' ? (r) => (r.heroFit ? r.heroFit.delta : r.best[0] ? r.best[0].delta : -99) : sort === 'speed' ? speed : (r) => r.wss;
    return list.sort((a, b) => key(b) - key(a));
  }

  function render() {
    $('#gs-src').innerHTML =
      (gs.items.length ? `${gs.items.length} items from <b>${esc(gs.fileName)}</b> (${new Date(gs.importedAt).toLocaleDateString()}) · ${gs.items.filter((i) => i.equipped).length} equipped · ${evald.profiles.length} heroes with gear` : 'No gear.txt imported.') +
      (gs.scanned.length ? `<br>${gs.scanned.length} items read from the game screen <span class="src other">screen</span>${gs.useScanned ? '' : ' (switched off)'}` : '');
    for (const [sel, k] of Object.entries(RULE_INPUTS)) $(sel).value = gs.rules[k];
    const counts = {};
    for (const r of evald.results) counts[r.verdict] = (counts[r.verdict] || 0) + 1;
    $('#gs-summary').innerHTML = Object.keys(VERDICT_LABEL)
      .map((v) => `<button class="vd ${v}" data-v="${v}">${VERDICT_LABEL[v]} <b>${counts[v] || 0}</b></button>`)
      .join('');
    const list = filtered();
    $('#gs-count').textContent = `${list.length} items`;
    $('#gs-rows').innerHTML =
      list
        .slice(0, shown)
        .map((r) => {
          const it = r.item;
          const best = (r.heroFit ? [r.heroFit] : r.best)
            .filter((b) => b.delta > 0 || b.code === it.equipped)
            .map((b) => `<div class="clickable" data-hero="${esc(b.code)}">${portrait(b.code)} ${esc(nameOf(b.code))} <small class="${b.delta > gs.rules.upgradeMargin ? 'up' : 'hint'}">${b.delta > 0 ? '+' + b.delta : 'current'}</small></div>`)
            .join('') || '<span class="hint">no upgrade</span>';
          return `<tr>
            <td><b>${esc(it.gear)}</b> · ${esc(setLabel(it.set))}${it.source === 'screen' ? ' <span class="src other" title="Read from the game screen">screen</span>' : ''}<div class="hint">${esc(it.rank)} lv${it.level} +${it.enhance}${it.locked ? ' 🔒' : ''}</div>
              <div class="hint">Main: ${fmtSub(it.main)}</div>${it.equipped ? `<div class="hint">on ${portrait(it.equipped)} ${esc(nameOf(it.equipped))}</div>` : ''}</td>
            <td class="small">${it.subs.map(fmtSub).join('<br>')}</td>
            <td><b>${r.wss}</b>${r.reforgedWss !== r.wss ? `<div class="hint">→ ${r.reforgedWss} reforged</div>` : ''}${r.potential.rollsLeft ? `<div class="hint">~${r.potential.expected} at +15</div>` : ''}</td>
            <td class="small">${best}</td>
            <td><span class="vd ${r.verdict}">${VERDICT_LABEL[r.verdict]}</span><div class="hint">${esc(r.reason)}</div></td></tr>`;
        })
        .join('') || `<tr><td colspan="5" class="hint">${gs.items.length ? 'No items match.' : 'Import gear.txt to start.'}</td></tr>`;
    $('#gs-more').classList.toggle('hidden', list.length <= shown);
    const sets = [...new Set(gs.items.map((i) => i.set).filter(Boolean))].sort();
    const fs = $('#f-set');
    if (fs.options.length - 1 !== sets.length) fs.innerHTML = '<option value="">All sets</option>' + sets.map((s) => `<option value="${esc(s)}">${esc(setLabel(s))}</option>`).join('');
    const withGear = evald.profiles.map((p) => p.code);
    $('#gs-heroes').innerHTML = withGear.map((c) => `<option value="${esc(nameOf(c))}"></option>`).join('');
    renderProfile();
  }
  $('#gs-summary').addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    $('#f-verdict').value = $('#f-verdict').value === b.dataset.v ? '' : b.dataset.v;
    render();
  });
  ['#f-verdict', '#f-gear', '#f-set', '#f-eq', '#f-sort', '#f-hero'].forEach((s) =>
    $(s).addEventListener('input', () => {
      shown = 150;
      render();
    }),
  );
  $('#gs-more').addEventListener('click', () => {
    shown += 150;
    render();
  });
  $('#f-gear').innerHTML = '<option value="">All slots</option>' + G.GEAR_SLOTS.map((g) => `<option>${g}</option>`).join('');

  // ------------------------------------------------------------ hero profile
  function renderProfile() {
    const q = $('#hp-hero').value.trim();
    const hero = q ? HEROES.find((h) => R.normName(h.name) === R.normName(q)) : null;
    const box = $('#hp-out');
    if (!hero) {
      box.innerHTML = '';
      return;
    }
    const p = S.heroProfile(hero.code, hero.role, gs.items.filter((i) => i.equipped === hero.code), gs.overrides[hero.code]);
    box.innerHTML = `<div class="hint">${esc(R.ROLE_LABEL[hero.role] || hero.role)} · sets: ${p.sets.map(setLabel).join(', ') || '—'} · mains: ${Object.entries(p.mains).map(([g, t]) => `${g} ${S.STATS[t]}`).join(', ') || '—'}</div>
      <div class="weights">${Object.keys(S.WSS_WEIGHT)
        .map((t) => `<label class="wrow"><span style="width:44px">${S.STATS[t]}</span><input type="range" min="0" max="1" step="0.05" data-t="${t}" value="${p.weights[t]}" /><span>${p.weights[t].toFixed(2)}</span><small class="hint" style="width:110px">${esc(p.sources[t])}</small></label>`)
        .join('')}</div>
      <div class="btn-row"><button class="btn" id="hp-reset">Reset to automatic</button></div>`;
    box.dataset.code = hero.code;
  }
  $('#hp-hero').addEventListener('input', renderProfile);
  $('#hp-out').addEventListener('change', (e) => {
    const t = e.target.dataset.t;
    if (!t) return;
    const code = $('#hp-out').dataset.code;
    gs.overrides[code] = { ...(gs.overrides[code] || {}), [t]: Number(e.target.value) };
    save();
    recompute();
    render();
  });
  $('#hp-out').addEventListener('click', (e) => {
    if (e.target.id !== 'hp-reset') return;
    delete gs.overrides[$('#hp-out').dataset.code];
    save();
    recompute();
    render();
  });

  // -------------------------------------------------------------- shop check
  const statOpts = (extra = '') => extra + Object.entries(S.STATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('#b-gear').innerHTML = G.GEAR_SLOTS.map((g) => `<option>${g}</option>`).join('');
  $('#b-set').innerHTML = Object.entries(G.SETS).map(([k, [n]]) => `<option value="${k}">${n}</option>`).join('');
  $('#b-main').innerHTML = statOpts();
  $('#b-subs').innerHTML = [1, 2, 3, 4]
    .map((i) => `<label>Sub ${i} <select data-sub="${i}">${statOpts('<option value="">—</option>')}</select></label><label>Value <input type="number" data-subv="${i}" /></label>`)
    .join('');
  $('#b-check').addEventListener('click', () => {
    const subs = [1, 2, 3, 4]
      .map((i) => ({ type: document.querySelector(`[data-sub="${i}"]`).value, value: Number(document.querySelector(`[data-subv="${i}"]`).value) || 0 }))
      .filter((s) => s.type && s.value);
    const it = { id: 'shop', gear: $('#b-gear').value, set: $('#b-set').value, rank: $('#b-rank').value, level: Number($('#b-level').value) || 85, enhance: Number($('#b-enh').value) || 0, main: { type: $('#b-main').value, value: 0 }, subs, equipped: null };
    if (!evald.profiles.length) return ($('#b-out').innerHTML = '<p class="hint">Import gear.txt first so the check knows your heroes.</p>');
    const byHero = new Map();
    for (const i of gs.items) if (i.equipped) {
      if (!byHero.has(i.equipped)) byHero.set(i.equipped, {});
      byHero.get(i.equipped)[i.gear] = i;
    }
    const r = S.evaluate(it, evald.profiles, byHero, gs.rules);
    const worth = r.best[0] && r.best[0].delta > gs.rules.upgradeMargin;
    $('#b-out').innerHTML = `<div class="ins ${worth || r.verdict === 'enhance' ? 'good' : 'warn'}"><b>${worth ? 'Worth buying' : r.verdict === 'enhance' ? 'Maybe: good start, needs enhancing' : 'Probably skip'}</b> · gear score ${r.wss}${r.potential.rollsLeft ? ` (≈${r.potential.expected} at +15)` : ''}
      <div>${r.best.filter((b) => b.delta > 0).map((b) => `${portrait(b.code)} ${esc(nameOf(b.code))} +${b.delta}`).join(' · ') || 'Not an upgrade for any hero right now.'}</div></div>`;
  });

  // ---------------------------------------------------- API for gear-scan.js
  window.GearApp = {
    get gs() {
      return gs;
    },
    S,
    esc,
    nameOf,
    /** Add an item read from the screen (source 'screen'). Returns the evaluation, or null if it was already there. */
    addScanned(item, key) {
      if (gs.scanned.some((x) => x.key === key)) return null;
      const slim = {
        id: 'scan-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        key,
        source: 'screen',
        gear: item.gear,
        set: item.set,
        rank: item.rank,
        level: item.level,
        enhance: item.enhance,
        name: '',
        locked: false,
        main: item.main,
        subs: item.substats.map((x) => ({ type: x.type, value: x.value })),
        equipped: null,
        at: new Date().toISOString(),
      };
      gs.scanned.push(slim);
      save();
      recompute();
      render();
      return evald.results.find((r) => r.item.id === slim.id) || null;
    },
    clearScanned() {
      gs.scanned = [];
      save();
      recompute();
      render();
    },
    setUseScanned(on) {
      gs.useScanned = on;
      save();
      recompute();
      render();
    },
  };

  recompute();
  render();
})();
