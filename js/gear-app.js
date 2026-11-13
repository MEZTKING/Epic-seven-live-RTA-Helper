/* Gear Sorter page. Uses RTARoster, RTAGear, RTAGearSort. */
(function () {
  'use strict';
  const R = window.RTARoster;
  const G = window.RTAGear;
  const S = window.RTAGearSort;
  const HEROES = window.RTASources.officialSnapshot.heroes;
  const GS = window.GearStore; // shared with the game watcher's gear consumer (storage key 'rta-gear-v1')
  const MAIN_KEY = 'rta-helper-v2'; // the RTA Helper's store (we only update its `fribbels` roster)
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const byCode = new Map(HEROES.map((h) => [h.code, h]));
  const nameOf = (c) => (byCode.get(c) || {}).name || c;
  const portrait = (c) => (byCode.get(c) ? `<img class="pt sm" loading="lazy" alt="" src="${esc(R.PORTRAIT_URL(c))}" onerror="this.classList.add('broken')" />` : '');
  const setLabel = (s) => (G.SETS[s] ? G.SETS[s][0] : String(s || '').replace(/Set$/, ''));

  let gs = GS.load();
  let evald = { profiles: [], results: [] };
  let shown = 150;

  const load = () => GS.load();
  function save() {
    try {
      GS.save(gs);
    } catch (e) {
      alert('Could not save (browser storage full?): ' + e.message);
    }
  }

  function recompute() {
    evald = S.evaluateAll(allItems(), HEROES, gs.overrides, gs.rules);
  }
  /** gear.txt items + screen-read items (kept as separate sources; screen items aren't linked to a hero). */
  const allItems = () => GS.allItems(gs);

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

  // ---- card view (looks like the game's inventory; our own symbols, no game art)
  const STAT_ICON = { Attack: '⚔', AttackPercent: '⚔', Health: '♥', HealthPercent: '♥', Defense: '⛨', DefensePercent: '⛨', Speed: '»', CriticalHitChancePercent: '✦', CriticalHitDamagePercent: '✸', EffectivenessPercent: '◎', EffectResistancePercent: '✚', DualAttackChancePercent: '⇄' };
  const STAT_NAME = { Attack: 'Attack', AttackPercent: 'Attack', Health: 'Health', HealthPercent: 'Health', Defense: 'Defense', DefensePercent: 'Defense', Speed: 'Speed', CriticalHitChancePercent: 'Critical Hit Chance', CriticalHitDamagePercent: 'Critical Hit Damage', EffectivenessPercent: 'Effectiveness', EffectResistancePercent: 'Effect Resistance', DualAttackChancePercent: 'Dual Attack Chance' };
  const SLOT_ICON = { Weapon: '🗡', Helmet: '⛑', Armor: '🛡', Necklace: '📿', Ring: '💍', Boots: '👢' };
  const SET_COLOR = { SpeedSet: '#2f8f5b', AttackSet: '#b33a3a', DestructionSet: '#a3452a', LifestealSet: '#8a2d5c', CounterSet: '#2f5fa8', RageSet: '#a32a2a', RevengeSet: '#7a3aa8', InjurySet: '#8a5a2a', HealthSet: '#3a8a3a', DefenseSet: '#3a6a8a', CriticalSet: '#a8842a', HitSet: '#2a8a8a', ResistSet: '#5a5aa8', UnitySet: '#5a8a2a', ImmunitySet: '#2a7a6a', PenetrationSet: '#6a6a6a', ProtectionSet: '#4a7aa8', TorrentSet: '#a85a2a', ReversalSet: '#6a3a8a', RiposteSet: '#3a4a8a', PursuitSet: '#8a3a3a', WarfareSet: '#8a6a2a', WeakeningSet: '#5a3a5a', FervorSet: '#a8432a' };
  const pct = (t) => /Percent/.test(t);
  const val = (s) => `${s.value}${pct(s.type) ? '%' : ''}`;
  const ICONS = window.E7GearIcons; // original SVG drawings (js/gear-icons.js); emoji/letters if missing
  const setBadge = (set) =>
    ICONS && ICONS.set(set)
      ? `<span class="setb setb-svg" title="${esc(setLabel(set))} set">${ICONS.set(set)}</span>`
      : `<span class="setb" style="--set:${SET_COLOR[set] || '#555'}" title="${esc(setLabel(set))} set">${esc(setLabel(set).slice(0, 2))}</span>`;
  const slotArt = (g) => (ICONS && ICONS.slot(g) ? `<span class="gt-art">${ICONS.slot(g)}</span>` : esc(SLOT_ICON[g] || '?'));
  const rankCls = (rank) => `rk-${['Epic', 'Heroic', 'Rare', 'Good', 'Normal'].includes(rank) ? rank : 'Epic'}`;
  function iconBox(it) {
    return `<div class="gt-icon ${rankCls(it.rank)}">${it.locked ? '<span class="gt-lock" title="Locked">🔒</span>' : ''}<span class="gt-lv">${it.level || ''}</span>${slotArt(it.gear)}${it.enhance ? `<span class="gt-enh">+${it.enhance}</span>` : ''}${it.equipped ? `<span class="gt-hero" title="On ${esc(nameOf(it.equipped))}">${portrait(it.equipped)}</span>` : ''}${it.set ? setBadge(it.set) : ''}</div>`;
  }
  function tile(r) {
    const it = r.item;
    const line = (st, cls) => `<div class="${cls}"><span class="si">${STAT_ICON[st.type] || '·'}</span>${esc(val(st))}${cls === 'sub' && st.rolls > 1 ? `<sup>${st.rolls}</sup>` : ''}</div>`;
    return `<button class="gtile vdc-${r.verdict}${selected === it.id ? ' sel' : ''}" data-item="${esc(it.id)}" title="${esc(`${it.rank} ${it.gear} · ${setLabel(it.set)} · ${VERDICT_LABEL[r.verdict]}`)}">
      <div class="gt-left">${iconBox(it)}<div class="gt-score" title="Gear score (WSS)">${r.wss}</div></div>
      <div class="gt-stats">${line(it.main, 'main')}${it.subs.map((x) => line(x, 'sub')).join('')}</div></button>`;
  }
  function detail(r) {
    const it = r.item;
    const best = (r.heroFit ? [r.heroFit] : r.best)
      .filter((b) => b.delta > 0 || b.code === it.equipped)
      .slice(0, 4)
      .map((b) => `<div class="clickable" data-hero="${esc(b.code)}">${portrait(b.code)} ${esc(nameOf(b.code))} <small class="${b.delta > gs.rules.upgradeMargin ? 'up' : 'hint'}">${b.delta > 0 ? '+' + b.delta : 'current'}</small></div>`)
      .join('') || '<span class="hint">Not an upgrade for anyone</span>';
    const SET_SIZE = G.SETS[it.set] ? G.SETS[it.set][1] : '';
    return `<div class="gd-head">${iconBox(it)}<div><div class="gd-rank">${esc(it.rank)} ${esc(it.gear)}</div><div class="gd-name">${esc(it.name && it.name.length > 2 ? it.name : `${setLabel(it.set)} ${it.gear}`)}</div>
        <div class="hint">Level ${it.level} · +${it.enhance}${it.source === 'screen' ? ' · <span class="src other">screen</span>' : ' · <span class="src fribbels">Fribbels</span>'}</div></div></div>
      <div class="gd-main"><span><span class="si">${STAT_ICON[it.main.type] || ''}</span> ${esc(STAT_NAME[it.main.type] || it.main.type)}</span><span>${esc(val(it.main))}</span></div>
      ${it.subs.map((x) => `<div class="gd-sub"><span>${esc(STAT_NAME[x.type] || x.type)}${x.rolls > 1 ? ` <small class="hint">×${x.rolls}</small>` : ''}</span><span>${esc(val(x))}</span></div>`).join('')}
      <div class="gd-score"><span title="Fribbels/RexQian WSS: substats only">Gear score</span><span>${r.wss}</span></div>
      ${r.reforgedWss !== r.wss ? `<div class="gd-sub"><span>After reforge</span><span>${r.reforgedWss}</span></div>` : ''}${r.potential.rollsLeft ? `<div class="gd-sub"><span>Expected at +15</span><span>≈${r.potential.expected}</span></div>` : ''}
      ${it.set ? `<div class="gd-set">${setBadge(it.set)} ${esc(setLabel(it.set))} Set ${SET_SIZE ? `<span class="hint">(${SET_SIZE} pieces)</span>` : ''}</div>` : ''}
      <div class="gd-block"><span class="vd ${r.verdict}">${VERDICT_LABEL[r.verdict]}</span> <span class="hint">${esc(r.reason)}</span></div>
      ${it.equipped ? `<div class="gd-block">Equipped on <span class="clickable" data-hero="${esc(it.equipped)}">${portrait(it.equipped)} ${esc(nameOf(it.equipped))}</span></div>` : ''}
      <div class="gd-block"><b>Best for</b>${best}</div>`;
  }
  /** One row per hero: their 6 slots in order, active sets, gear score total. */
  function heroRows() {
    const q = $('#f-hero').value.trim();
    const qh = q ? HEROES.find((h) => R.normName(h.name) === R.normName(q)) : null;
    const byHero = new Map();
    for (const r of evald.results) {
      const c = r.item.equipped;
      if (!c || (qh && c !== qh.code)) continue;
      if (!byHero.has(c)) byHero.set(c, {});
      byHero.get(c)[r.item.gear] = r;
    }
    if (!byHero.size) return `<p class="hint">${gs.items.length ? 'No equipped gear found (import a gear.txt that includes your heroes).' : 'Import gear.txt to start.'}</p>`;
    return [...byHero.entries()]
      .sort((a, b) => nameOf(a[0]).localeCompare(nameOf(b[0])))
      .map(([code, slots]) => {
        const items = Object.values(slots);
        const counts = {};
        for (const r of items) if (r.item.set) counts[r.item.set] = (counts[r.item.set] || 0) + 1;
        const sets = Object.entries(counts)
          .map(([st, n]) => {
            const need = (G.SETS[st] || [0, 2])[1];
            const full = Math.floor(n / need);
            return full ? `<span class="hg-set">${setBadge(st)} ${esc(setLabel(st))}${full > 1 ? ` ×${full}` : ''}</span>` : '';
          })
          .join('') || '<span class="hint">no full set</span>';
        const spd = items.reduce((n, r) => n + (r.item.main.type === 'Speed' ? r.item.main.value : 0) + r.item.subs.filter((x) => x.type === 'Speed').reduce((m, x) => m + x.value, 0), 0);
        const total = items.reduce((n, r) => n + r.wss, 0);
        return `<div class="hg-row"><div class="hg-hero clickable" data-hero="${esc(code)}">${portrait(code)}<b>${esc(nameOf(code))}</b>
            <div class="hint">gear score ${Math.round(total)} · +${spd} speed from gear</div><div class="hg-sets">${sets}</div></div>
          <div class="hg-slots">${G.GEAR_SLOTS.map((g) => (slots[g] ? tile(slots[g]) : `<div class="gtile hg-empty"><span class="hint">${g}: empty</span></div>`)).join('')}</div></div>`;
      })
      .join('');
  }
  const VIEW_KEY = 'e7-gear-view';
  let selected = null;
  const view = () => $('#f-view').value;
  try {
    $('#f-view').value = localStorage.getItem(VIEW_KEY) || 'cards';
  } catch (_) { /* default */ }

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
    const cards = view() === 'cards' || view() === 'heroes';
    $('#gs-table').classList.toggle('hidden', cards);
    $('#gs-browse').classList.toggle('hidden', !cards);
    $('#gs-cards').classList.toggle('hidden', view() !== 'cards');
    $('#gs-heroview').classList.toggle('hidden', view() !== 'heroes');
    if (view() === 'heroes') $('#gs-heroview').innerHTML = heroRows();
    if (cards) {
      if (view() === 'cards') $('#gs-cards').innerHTML = list.slice(0, shown).map(tile).join('') || `<p class="hint">${gs.items.length ? 'No items match.' : 'Import gear.txt to start.'}</p>`;
      const sel = selected && evald.results.find((r) => r.item.id === selected);
      const selR = sel && (list.find((r) => r.item.id === selected) || sel);
      $('#gs-detail').classList.toggle('hidden', !selR);
      $('#gs-browse').classList.toggle('has-detail', !!selR);
      $('#gs-detail').className = `gear-detail${selR ? '' : ' hidden'} ${selR ? rankCls(selR.item.rank) : ''}`;
      $('#gs-detail').innerHTML = selR ? detail(selR) : '';
    }
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
  $('#gs-heroview').addEventListener('click', (e) => {
    const t = e.target.closest('[data-item]');
    if (!t) return;
    selected = selected === t.dataset.item ? null : t.dataset.item;
    render();
    if (selected && innerWidth < 1100) $('#gs-detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('#gs-cards').addEventListener('click', (e) => {
    const t = e.target.closest('[data-item]');
    if (!t) return;
    selected = selected === t.dataset.item ? null : t.dataset.item;
    render();
    if (selected && innerWidth < 1100) $('#gs-detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('#f-view').addEventListener('change', () => {
    try {
      localStorage.setItem(VIEW_KEY, view());
    } catch (_) { /* fine */ }
  });
  ['#f-verdict', '#f-gear', '#f-set', '#f-eq', '#f-sort', '#f-hero', '#f-view'].forEach((s) =>
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
      const slim = GS.addScanned(gs, item, key);
      if (!slim) return null;
      save();
      recompute();
      render();
      return evald.results.find((r) => r.item.id === slim.id) || null;
    },
    /** Reload from storage (the game watcher saved new items, or another tab changed something). */
    reload() {
      gs = load();
      recompute();
      render();
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

  // the game watcher (another window) adds screen-read items straight to storage
  addEventListener('storage', (e) => {
    if (e.key === GS.KEY) window.GearApp.reload();
  });
  addEventListener('e7-synced', () => window.GearApp.reload()); // My devices sync brought new gear


  recompute();
  render();
})();
