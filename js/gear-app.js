/* Gear Sorter page. Uses RTARoster, RTAGear, RTAGearSort. */
(function () {
  'use strict';
  const R = window.RTARoster;
  const G = window.RTAGear;
  const S = window.RTAGearSort;
  const HEROES = window.RTASources.allHeroes || window.RTASources.officialSnapshot.heroes; // official + newest heroes (fribbels-data)
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
    // screen items a hero wears (the tile shows the portrait, not who): keep, whatever the score (DEVLOG #78)
    for (const r of evald.results)
      if (r.item.worn && r.verdict !== 'keep') {
        r.verdict = 'keep';
        r.reason = 'One of your heroes wears it';
      }
  }
  // ---- pictures of items as the game showed them (IndexedDB 'e7-gear-pics', js/gearpics.js; DEVLOG #78)
  let pics = new Map();
  function loadPics() {
    if (!window.E7GearPics) return;
    window.E7GearPics.all().then((all) => {
      pics = new Map(all.map((x) => [x.id, x]));
      render();
    });
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

  // ---- card view (looks like the game's inventory; the game's own picture of an item read from the screen (DEVLOG #78),
  // else our own symbols)
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
    const pic = pics.get(it.id);
    if (pic && pic.icon) return `<div class="gt-icon gt-pic" title="As the game showed it"><img alt="" src="${pic.icon}" /></div>`;
    return `<div class="gt-icon ${rankCls(it.rank)}">${it.locked ? '<span class="gt-lock" title="Locked">🔒</span>' : ''}<span class="gt-lv">${it.level || ''}</span>${slotArt(it.gear)}${it.enhance ? `<span class="gt-enh">+${it.enhance}</span>` : ''}${it.equipped ? `<span class="gt-hero" title="On ${esc(nameOf(it.equipped))}">${portrait(it.equipped)}</span>` : ''}${it.set ? setBadge(it.set) : ''}</div>`;
  }
  function tile(r) {
    const it = r.item;
    const line = (st, cls) => `<div class="${cls}"><span class="si">${STAT_ICON[st.type] || '·'}</span>${esc(val(st))}${cls === 'sub' && st.rolls > 1 ? `<sup>${st.rolls}</sup>` : ''}</div>`;
    return `<button class="gtile vdc-${r.verdict}${selected === it.id ? ' sel' : ''}" data-item="${esc(it.id)}" title="${esc(`${it.rank} ${it.gear} · ${setLabel(it.set)} · ${VERDICT_LABEL[r.verdict]}`)}">
      <div class="gt-left">${iconBox(it)}<div class="gt-score" title="Gear score (WSS)">${r.wss}</div></div>
      <div class="gt-stats">${line(it.main, 'main')}${it.subs.map((x) => line(x, 'sub')).join('')}</div></button>`;
  }
  // ---- details: what to do, the game's picture, numbers you can fix, the enhance simulator (DEVLOG #78)
  const SIM = window.E7GearSim;
  let simSeed = 1;
  const EDIT_TYPES = Object.keys(S.STATS).filter((t) => t !== 'DualAttackChancePercent');
  const statLabel = (t) => `${STAT_NAME[t] || t}${pct(t) ? ' %' : ''}`;
  const snapshot = (it) => JSON.parse(JSON.stringify({ main: it.main, subs: it.subs, enhance: it.enhance, level: it.level, set: it.set }));
  /** Which numbers you changed: ['main', 'sub0', …, 'enhance', 'level', 'set'] */
  function fixedParts(it) {
    if (!it.read) return [];
    const a = it.read;
    const same = (x, y) => !!x && !!y && x.type === y.type && Number(x.value) === Number(y.value);
    const out = [];
    if (!same(a.main, it.main)) out.push('main');
    for (let k = 0; k < Math.max(a.subs.length, it.subs.length); k++) if (!same(a.subs[k], it.subs[k])) out.push('sub' + k);
    for (const f of ['enhance', 'level', 'set']) if (String(a[f]) !== String(it[f])) out.push(f);
    return out;
  }
  const readText = (st) => (st ? `${STAT_NAME[st.type] || st.type} ${val(st)}` : '—');
  function editRow(it, k, fixed) {
    const st = k === 'main' ? it.main : it.subs[Number(k.slice(3))];
    const was = it.read && (k === 'main' ? it.read.main : it.read.subs[Number(k.slice(3))]);
    const isFixed = fixed.includes(k);
    return `<div class="ed-row${k === 'main' ? ' main' : ''}${isFixed ? ' fixed' : ''}"><select data-ed="${k}:type">${(k === 'main' ? '' : '<option value="">(none)</option>') + EDIT_TYPES.map((t) => `<option value="${t}"${st && st.type === t ? ' selected' : ''}>${esc(statLabel(t))}</option>`).join('')}</select><input type="number" min="0" data-ed="${k}:value" value="${st ? esc(st.value) : ''}" />${isFixed ? `<span class="was" title="What the screen reader read">read: ${esc(readText(was))}</span>` : ''}</div>`;
  }
  function simBlock(r) {
    const it = r.item;
    if (!SIM) return '';
    if (Number(it.enhance) >= 15) {
      if (r.reforgedWss === r.wss) return '';
      const ref = S.reforgedSubs(it);
      return `<div class="gd-block sim"><b>Reforge (level 85 → 90)</b><div class="sim-subs">${ref.map((x, k) => `<span>${esc(STAT_NAME[x.type] || x.type)} ${esc(val(it.subs[k]))} → <b>${esc(val(x))}</b></span>`).join('')}</div><div>Gear score ${r.wss} → <b>${r.reforgedWss}</b></div></div>`;
    }
    const out = SIM.outcomes(it, { runs: 1000, rng: SIM.rngFrom(12345), keep: gs.rules.keepWss });
    const one = SIM.simulate(it, SIM.rngFrom(simSeed * 7919));
    const steps = one.steps.map((x) => `<div class="sim-step"><span class="sim-at">+${x.at}</span> ${x.kind === 'new' ? 'new substat: ' : ''}${esc(STAT_NAME[x.type] || x.type)} <b>+${x.add}${pct(x.type) ? '%' : ''}</b></div>`).join('');
    const reforged = Number(it.level) === 85 ? ` → <b>${one.reforgedWss}</b> after reforge` : '';
    return `<div class="gd-block sim"><b>Simulate enhancing to +15</b>
      <div class="sim-range" title="1000 simulated enhancements">Usual result: gear score <b>${out.low}–${out.high}</b> <span class="hint">(worst ${out.worst}, best ${out.best}${Number(it.level) === 85 ? `; after reforge ~${out.reforged.mid}` : ''})</span></div>
      <div class="hint">${Math.round(out.chanceKeep * 100)}% of the time it ends at ${gs.rules.keepWss}+ (your "keep" line)${out.speedChance ? ` · ${Math.round(out.speedChance * 100)}% of the time it gets good speed` : ''}</div>
      <div class="sim-run"><div class="hint">One try:</div>${steps}<div>Result: ${one.item.subs.map((x) => `${esc(S.STATS[x.type] || x.type)} ${esc(val(x))}`).join(' · ')}</div><div>Gear score <b>${one.wss}</b>${reforged}</div></div>
      <button class="btn" data-act="reroll">Roll again</button></div>`;
  }
  function detail(r) {
    const it = r.item;
    const screen = it.source === 'screen';
    const pic = pics.get(it.id);
    const fixed = screen ? fixedParts(it) : [];
    const best = (r.heroFit ? [r.heroFit] : r.best)
      .filter((b) => b.delta > 0 || b.code === it.equipped)
      .slice(0, 4)
      .map((b) => `<div class="clickable" data-hero="${esc(b.code)}">${portrait(b.code)} ${esc(nameOf(b.code))} <small class="${b.delta > gs.rules.upgradeMargin ? 'up' : 'hint'}">${b.delta > 0 ? '+' + b.delta : 'current'}</small></div>`)
      .join('') || '<span class="hint">Not an upgrade for anyone</span>';
    const SET_SIZE = G.SETS[it.set] ? G.SETS[it.set][1] : '';
    const out = SIM && Number(it.enhance) < 15 ? SIM.outcomes(it, { runs: 1000, rng: SIM.rngFrom(12345), keep: gs.rules.keepWss }) : null;
    const adv = SIM ? SIM.advice(r, { rules: gs.rules, out, nameOf, worn: !!it.worn }) : { action: VERDICT_LABEL[r.verdict], tone: '', text: r.reason };
    const head = `<div class="gd-head">${iconBox(it)}<div><div class="gd-rank">${esc(it.rank)} ${esc(it.gear)}</div><div class="gd-name">${esc(it.name && it.name.length > 2 ? it.name : `${setLabel(it.set)} ${it.gear}`)}</div>
        <div class="hint">Level ${it.level} · +${it.enhance}${screen ? ' · <span class="src other">screen</span>' : ' · <span class="src fribbels">Fribbels</span>'}${it.worn ? ' · on a hero' : ''}${fixed.length ? ` · <b class="fixed-note">${fixed.length} fixed by you</b>` : ''}</div></div></div>`;
    const todo = `<div class="gd-todo tone-${adv.tone}"><span class="vd ${r.verdict}">${esc(adv.action)}</span> ${esc(adv.text)}</div>`;
    const shot = pic && pic.shot ? `<div class="shot-box"><img alt="The item as the game showed it" src="${pic.shot}" /></div><div class="shot-cap">What the game showed (${new Date(pic.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}). If a number below is wrong, change it.</div>` : '';
    const numbers = screen
      ? `${editRow(it, 'main', fixed)}${[0, 1, 2, 3].map((k) => (it.subs[k] || k < 4 ? editRow(it, 'sub' + k, fixed) : '')).join('')}
        <div class="ed-meta"><label${fixed.includes('enhance') ? ' class="fixed"' : ''}>Enhance<input type="number" min="0" max="15" data-ed="enhance" value="${esc(it.enhance)}" /></label><label${fixed.includes('level') ? ' class="fixed"' : ''}>Level<select data-ed="level">${[85, 88, 90, 70, 72, 75, 78].map((l) => `<option${Number(it.level) === l ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label${fixed.includes('set') ? ' class="fixed"' : ''}>Set<select data-ed="set"><option value="">?</option>${Object.entries(G.SETS).map(([k, [n]]) => `<option value="${k}"${it.set === k ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label></div>
        <div class="btn-row">${fixed.length ? '<button class="btn" data-act="restore">Back to what was read</button>' : ''}<button class="btn danger" data-act="delete">Delete item</button></div>`
      : `<div class="gd-main"><span><span class="si">${STAT_ICON[it.main.type] || ''}</span> ${esc(STAT_NAME[it.main.type] || it.main.type)}</span><span>${esc(val(it.main))}</span></div>
        ${it.subs.map((x) => `<div class="gd-sub"><span>${esc(STAT_NAME[x.type] || x.type)}${x.rolls > 1 ? ` <small class="hint">×${x.rolls}</small>` : ''}</span><span>${esc(val(x))}</span></div>`).join('')}`;
    return `${head}${todo}${shot}${numbers}
      <div class="gd-score"><span title="Fribbels/RexQian WSS: substats only">Gear score</span><span>${r.wss}</span></div>
      ${r.reforgedWss !== r.wss ? `<div class="gd-sub"><span>After reforge</span><span>${r.reforgedWss}</span></div>` : ''}
      ${simBlock(r)}
      ${tryOnBlock(r)}
      ${it.set && !screen ? `<div class="gd-set">${setBadge(it.set)} ${esc(setLabel(it.set))} Set ${SET_SIZE ? `<span class="hint">(${SET_SIZE} pieces)</span>` : ''}</div>` : ''}
      ${it.equipped ? `<div class="gd-block">Equipped on <span class="clickable" data-hero="${esc(it.equipped)}">${portrait(it.equipped)} ${esc(nameOf(it.equipped))}</span></div>` : ''}
      <div class="gd-block"><b>Best for</b>${best}</div>`;
  }
  /** A number changed in the details panel (screen items only); the reading is kept in item.read to go back. */
  function editItem(id, field, value) {
    const it = gs.scanned.find((x) => x.id === id);
    if (!it) return;
    if (!it.read) it.read = snapshot(it);
    const [k, prop] = field.split(':');
    if (k === 'enhance') it.enhance = Math.max(0, Math.min(15, Number(value) || 0));
    else if (k === 'level') it.level = Number(value) || 85;
    else if (k === 'set') it.set = value;
    else if (k === 'main') it.main = { ...it.main, [prop]: prop === 'value' ? Number(value) || 0 : value };
    else {
      const n = Number(k.slice(3));
      const subs = it.subs.slice();
      if (prop === 'type' && !value) subs.splice(n, 1);
      else if (subs[n]) subs[n] = { ...subs[n], [prop]: prop === 'value' ? Number(value) || 0 : value, rolls: undefined };
      else if (prop === 'type') subs.push({ type: value, value: 0 });
      it.subs = subs.filter(Boolean);
    }
    if (!fixedParts(it).length) delete it.read;
    save();
    recompute();
    render();
  }
  $('#gs-detail').addEventListener('change', (e) => {
    const f = e.target.dataset.ed;
    if (f && selected) editItem(selected, f, e.target.value);
  });
  $('#gs-detail').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a || !selected) return;
    const it = gs.scanned.find((x) => x.id === selected);
    if (a.dataset.act === 'reroll') {
      simSeed++;
      return render();
    }
    if (!it) return;
    if (a.dataset.act === 'restore' && it.read) {
      Object.assign(it, it.read);
      delete it.read;
    } else if (a.dataset.act === 'delete') {
      if (!confirm('Delete this item (read from the screen)?')) return;
      gs.scanned = gs.scanned.filter((x) => x.id !== it.id);
      if (window.E7GearPics) window.E7GearPics.remove(it.id);
      selected = null;
    } else return;
    save();
    recompute();
    render();
  });
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
    renderMoves();
    renderPresets();
    renderDesigns();
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
    simSeed = 1;
    selected = selected === t.dataset.item ? null : t.dataset.item;
    render();
    if (selected && innerWidth < 1100) $('#gs-detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('#gs-cards').addEventListener('click', (e) => {
    const t = e.target.closest('[data-item]');
    if (!t) return;
    simSeed = 1;
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


  // ---- moving gear between heroes, gear presets, designs seen (DEVLOG #79) -------------------------------------
  const B = window.E7GearBuild;
  const BASE = (() => {
    const snap = ((window.RTASources && window.RTASources.fribbelsSnapshot) || {}).stats || {};
    try {
      const main = JSON.parse(localStorage.getItem(MAIN_KEY) || 'null');
      return { ...snap, ...((main && main.fribbelsData && main.fribbelsData.stats) || {}) };
    } catch (_) {
      return snap;
    }
  })();
  const codeOfName = (q) => {
    const h = q && HEROES.find((x) => R.normName(x.name) === R.normName(q));
    return h ? h.code : null;
  };
  const itemsById = () => new Map([...gs.items, ...gs.scanned].map((x) => [x.id, x]));
  /** What a hero wears now (from gear.txt). */
  const wearing = (code) => gs.items.filter((x) => x.equipped === code);
  const itemLabel = (it) => `${it.name && it.name.length > 2 ? it.name : `${setLabel(it.set) || '?'} ${it.gear}`} · ${STAT_NAME[it.main.type] || it.main.type} ${val(it.main)} · +${it.enhance}`;
  const STAT_ROWS = [['atk', 'Attack', ''], ['hp', 'Health', ''], ['def', 'Defense', ''], ['spd', 'Speed', ''], ['chc', 'Crit Chance', '%'], ['chd', 'Crit Damage', '%'], ['eff', 'Effectiveness', '%'], ['efr', 'Effect Resistance', '%']];
  function cmpTable(a, b, labels = ['now', 'with it']) {
    if (!a || !b) return '<p class="hint">No base stats for this hero.</p>';
    return `<table class="cmp"><tr><td></td><td class="hint">${labels[0]}</td><td class="hint">${labels[1]}</td><td></td></tr>${STAT_ROWS.map(([k, n, u]) => {
      const d = b[k] - a[k];
      return `<tr><td>${n}</td><td>${a[k]}${u}</td><td><b>${b[k]}${u}</b></td><td class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d ? `${d > 0 ? '+' : ''}${d}${u}` : '—'}</td></tr>`;
    }).join('')}</table><div class="hint">Sets: ${b.sets.map((x) => `${setLabel(x.set)}${x.full > 1 ? ` ×${x.full}` : ''}`).join(' + ') || 'none complete'}${a.sets.map((x) => x.set + x.full).join() !== b.sets.map((x) => x.set + x.full).join() ? ` (now: ${a.sets.map((x) => setLabel(x.set)).join(' + ') || 'none'})` : ''} · without artifact and exclusive equipment</div>`;
  }
  const profileOf = (code) => evald.profiles.find((p) => p.code === code) || S.heroProfile(code, (byCode.get(code) || {}).role, wearing(code), gs.overrides[code]);
  /** The best spare item (worn by nobody) of this slot for a hero. */
  function bestSpare(code, gear, exclude) {
    const p = profileOf(code);
    return [...gs.items.filter((x) => !x.equipped), ...gs.scanned.filter((x) => !x.worn)]
      .filter((x) => x.gear === gear && x.id !== exclude)
      .map((x) => ({ x, f: S.fit(x, p) }))
      .sort((a, b) => b.f - a.f)[0];
  }
  let tryHero = null;
  function tryOnBlock(r) {
    const it = r.item;
    const heroes = evald.profiles.map((p) => p.code);
    if (!tryHero && r.best[0]) tryHero = r.best[0].code;
    const code = tryHero;
    const head = `<div class="gd-block tryon"><b>Try it on a hero</b><div class="btn-row"><input data-try="hero" list="gs-allheroes" placeholder="Hero" value="${esc(code ? nameOf(code) : '')}" autocomplete="off" />${heroes.length ? '' : '<span class="hint">import gear.txt to know what your heroes wear now</span>'}</div>`;
    if (!code || !BASE[code]) return head + (code ? '<p class="hint">No base stats for this hero.</p>' : '') + '</div>';
    if (it.equipped === code) return head + `<p class="hint">${esc(nameOf(code))} already wears it.</p></div>`;
    const now = wearing(code);
    const a = B.heroStats(BASE[code], now);
    const b = B.heroStats(BASE[code], B.withItem(now, it));
    let loser = '';
    let rep = null;
    if (it.equipped && BASE[it.equipped]) {
      const theirs = wearing(it.equipped);
      const la = B.heroStats(BASE[it.equipped], theirs);
      const lb = B.heroStats(BASE[it.equipped], theirs.filter((x) => x.id !== it.id));
      rep = bestSpare(it.equipped, it.gear, it.id);
      const lc = rep ? B.heroStats(BASE[it.equipped], B.withItem(theirs, rep.x)) : null;
      loser = `<div class="loses"><b>${esc(nameOf(it.equipped))}</b> would lose it: speed ${la.spd} → ${lb.spd}, attack ${la.atk} → ${lb.atk}, health ${la.hp} → ${lb.hp}.${rep ? ` Best spare ${esc(it.gear.toLowerCase())} for them: <b>${esc(itemLabel(rep.x))}</b> (speed ${lc.spd}, attack ${lc.atk}).` : ''}</div>`;
    } else if (it.worn) loser = '<div class="loses">One of your heroes wears it now (the screen doesn\'t say who): they would lose it.</div>';
    const planned = gs.moves.some((m) => m.item === it.id && m.to === code && !m.done);
    return `${head}${cmpTable(a, b)}${loser}<div class="btn-row">${planned ? '<span class="hint">✓ planned (see "Moves to make in the game")</span>' : `<button class="btn primary" data-act="plan">Plan this move</button>${rep ? '<button class="btn" data-act="plan2">Plan both moves</button>' : ''}`}</div></div>`;
  }
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function planMove(itemId, from, to) {
    if (gs.moves.some((m) => m.item === itemId && m.to === to && !m.done)) return;
    gs.moves.push({ id: newId(), item: itemId, from: from || null, to, done: false, at: Date.now() });
  }
  $('#gs-detail').addEventListener('change', (e) => {
    if (e.target.dataset.try !== 'hero') return;
    tryHero = codeOfName(e.target.value);
    render();
  });
  $('#gs-detail').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a || !selected || !['plan', 'plan2'].includes(a.dataset.act) || !tryHero) return;
    const it = itemsById().get(selected);
    if (!it) return;
    planMove(it.id, it.equipped || (it.worn ? '?' : null), tryHero);
    if (a.dataset.act === 'plan2' && it.equipped) {
      const rep = bestSpare(it.equipped, it.gear, it.id);
      if (rep) planMove(rep.x.id, null, it.equipped);
    }
    save();
    render();
  });
  function renderMoves() {
    const byId = itemsById();
    const list = gs.moves;
    $('#gs-moves-card').classList.toggle('hidden', !list.length);
    const who = (c) => (c === '?' ? 'a hero' : c ? esc(nameOf(c)) : 'inventory');
    $('#gs-moves').innerHTML = list
      .map((m) => {
        const it = byId.get(m.item);
        return `<li class="${m.done ? 'done' : ''}"><label><input type="checkbox" data-move="${esc(m.id)}"${m.done ? ' checked' : ''} /> ${it ? esc(itemLabel(it)) : '(item no longer in your gear)'}: ${who(m.from)} → <b>${who(m.to)}</b></label> <button class="btn link" data-move-del="${esc(m.id)}" title="Remove">✕</button></li>`;
      })
      .join('');
  }
  $('#gs-moves').addEventListener('change', (e) => {
    const m = gs.moves.find((x) => x.id === e.target.dataset.move);
    if (!m) return;
    m.done = e.target.checked;
    save();
    renderMoves();
  });
  $('#gs-moves').addEventListener('click', (e) => {
    const id = e.target.dataset && e.target.dataset.moveDel;
    if (!id) return;
    gs.moves = gs.moves.filter((x) => x.id !== id);
    save();
    renderMoves();
  });
  $('#gs-moves-clear').addEventListener('click', () => {
    gs.moves = gs.moves.filter((x) => !x.done);
    save();
    renderMoves();
  });

  // presets
  let psTab = 'now';
  function presetItems(p) {
    const byId = itemsById();
    return B.SLOTS.map((g) => (p.items[g] ? byId.get(p.items[g]) : null)).filter(Boolean);
  }
  function renderPresets() {
    const code = codeOfName($('#ps-hero').value.trim());
    const box = $('#ps-out');
    if (!code) {
      box.innerHTML = '<p class="hint">Type a hero to see what they wear now and to make presets.</p>';
      return;
    }
    const mine = gs.presets.filter((p) => p.hero === code);
    if (psTab !== 'now' && !mine.some((p) => p.id === psTab)) psTab = 'now';
    const tabs = `<div class="ps-tabs"><button class="${psTab === 'now' ? 'on' : ''}" data-ps-tab="now">Now (gear.txt)</button>${mine.map((p) => `<button class="${psTab === p.id ? 'on' : ''}" data-ps-tab="${esc(p.id)}">${esc(p.name)}</button>`).join('')}<button data-ps-act="new">+ New preset</button></div>`;
    const now = wearing(code);
    const base = BASE[code];
    const sNow = B.heroStats(base, now);
    const byId = itemsById();
    if (psTab === 'now') {
      box.innerHTML = `${tabs}<div class="ps-slots">${B.SLOTS.map((g) => {
        const it = now.find((x) => x.gear === g);
        return `<div class="ps-slot">${it ? iconBox(it) : '<div class="gt-icon ps-empty"></div>'}<div class="hint">${esc(g)}</div>${it ? `<div class="small">${esc(itemLabel(it))}</div>` : ''}</div>`;
      }).join('')}</div>${sNow ? statLine(sNow) : '<p class="hint">No base stats for this hero.</p>'}${now.length ? '' : '<p class="hint">Nothing from gear.txt for this hero (import gear.txt to see what they wear).</p>'}`;
      return;
    }
    const p = mine.find((x) => x.id === psTab);
    const items = presetItems(p);
    const sP = B.heroStats(base, items);
    const prof = profileOf(code);
    const clash = B.conflicts(gs.presets, p).map((c) => `${esc(itemLabel(byId.get(c.item) || { main: {}, subs: [] }))} is also in ${esc(nameOf(c.preset.hero))} · ${esc(c.preset.name)}`);
    const worn = items.filter((it) => it.equipped && it.equipped !== code).map((it) => `${esc(itemLabel(it))}: ${esc(nameOf(it.equipped))} wears it now`);
    const slotSel = (g) => {
      const cur = p.items[g];
      const opts = [...gs.items, ...gs.scanned]
        .filter((x) => x.gear === g)
        .map((x) => ({ x, f: S.fit(x, prof) }))
        .sort((a, b) => b.f - a.f)
        .slice(0, 60);
      if (cur && !opts.some((o) => o.x.id === cur) && byId.get(cur)) opts.unshift({ x: byId.get(cur), f: S.fit(byId.get(cur), prof) });
      return `<select data-ps-slot="${g}"><option value="">(empty)</option>${opts.map((o) => `<option value="${esc(o.x.id)}"${o.x.id === cur ? ' selected' : ''}>${esc(itemLabel(o.x))}${o.x.equipped ? ` · on ${esc(nameOf(o.x.equipped))}` : ''}</option>`).join('')}</select>`;
    };
    box.innerHTML = `${tabs}<div class="ps-slots">${B.SLOTS.map((g) => {
      const it = p.items[g] && byId.get(p.items[g]);
      return `<div class="ps-slot${clash.length && it && B.conflicts(gs.presets, p).some((c) => c.item === it.id) ? ' warn' : ''}">${it ? iconBox(it) : '<div class="gt-icon ps-empty"></div>'}<div class="hint">${esc(g)}</div>${slotSel(g)}</div>`;
    }).join('')}</div>
      ${sNow && sP ? cmpTable(sNow, sP, ['now', 'this preset']) : sP ? statLine(sP) : '<p class="hint">No base stats for this hero.</p>'}
      ${clash.length || worn.length ? `<div class="loses warn">${[...clash, ...worn].join('<br>')}</div>` : ''}
      <div class="btn-row"><button class="btn primary" data-ps-act="moves">Show the moves to wear this preset</button><button class="btn" data-ps-act="fill">Fill empty slots with the best items</button><button class="btn" data-ps-act="copy">Copy what they wear now</button><button class="btn" data-ps-act="rename">Rename</button><button class="btn danger" data-ps-act="delete">Delete</button></div>`;
  }
  const statLine = (s) => `<div class="stats8">${STAT_ROWS.map(([k, n, u]) => `<span>${n} <b>${s[k]}${u}</b></span>`).join('')}</div>`;
  $('#ps-hero').addEventListener('input', () => {
    psTab = 'now';
    renderPresets();
  });
  $('#ps-out').addEventListener('change', (e) => {
    const g = e.target.dataset.psSlot;
    const p = gs.presets.find((x) => x.id === psTab);
    if (!g || !p) return;
    if (e.target.value) p.items[g] = e.target.value;
    else delete p.items[g];
    save();
    renderPresets();
  });
  $('#ps-out').addEventListener('click', async (e) => {
    const t = e.target.closest('[data-ps-tab],[data-ps-act]');
    if (!t) return;
    const code = codeOfName($('#ps-hero').value.trim());
    if (!code) return;
    if (t.dataset.psTab) {
      psTab = t.dataset.psTab;
      return renderPresets();
    }
    const act = t.dataset.psAct;
    const p = gs.presets.find((x) => x.id === psTab);
    const ask = (q, d) => window.E7Ask(q, d); // (prompt() does nothing in the desktop app: js/ask.js)
    if (act === 'new') {
      const name = await ask('Name of the preset?', `${nameOf(code)} preset ${gs.presets.filter((x) => x.hero === code).length + 1}`);
      if (!name || !name.trim()) return;
      const np = { id: newId(), hero: code, name: name.trim(), items: {} };
      for (const it of wearing(code)) np.items[it.gear] = it.id;
      gs.presets.push(np);
      psTab = np.id;
    } else if (!p) return;
    else if (act === 'rename') {
      const name = await ask('New name?', p.name);
      if (!name || !name.trim()) return;
      p.name = name.trim();
    } else if (act === 'delete') {
      if (!confirm(`Delete the preset "${p.name}"?`)) return;
      gs.presets = gs.presets.filter((x) => x.id !== p.id);
      psTab = 'now';
    } else if (act === 'copy') {
      p.items = {};
      for (const it of wearing(code)) p.items[it.gear] = it.id;
    } else if (act === 'fill') {
      const prof = profileOf(code);
      const used = new Set(gs.presets.filter((x) => x.id !== p.id).flatMap((x) => Object.values(x.items)));
      for (const g of B.SLOTS) {
        if (p.items[g]) continue;
        const best = [...gs.items, ...gs.scanned].filter((x) => x.gear === g && !used.has(x.id) && (!x.equipped || x.equipped === code)).sort((a, b) => S.fit(b, prof) - S.fit(a, prof))[0];
        if (best) p.items[g] = best.id;
      }
    } else if (act === 'moves') {
      const byId = itemsById();
      const wanted = {};
      for (const g of B.SLOTS) if (p.items[g] && byId.get(p.items[g])) wanted[g] = byId.get(p.items[g]);
      const moves = B.movesFor(code, wanted, (it) => it.equipped || (it.worn ? '?' : null));
      for (const m of moves) planMove(m.item.id, m.from, m.to);
      save();
      render();
      $('#gs-moves-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    save();
    renderPresets();
  });

  // designs seen (localStorage 'e7-gear-arts', pictures 'art:<id>' in IndexedDB 'e7-gear-pics')
  const ARTS_KEY = 'e7-gear-arts';
  const loadArts = () => {
    try {
      return JSON.parse(localStorage.getItem(ARTS_KEY) || '[]') || [];
    } catch (_) {
      return [];
    }
  };
  function renderDesigns() {
    const arts = loadArts();
    $('#gs-designs-count').textContent = arts.length ? `(${arts.length}, ${arts.filter((a) => a.name).length} with a name)` : '(none yet)';
    if (!$('#gs-designs-box').open) return;
    const count = new Map();
    for (const it of gs.scanned) if (it.art) count.set(it.art, (count.get(it.art) || 0) + 1);
    $('#gs-designs').innerHTML = arts
      .slice()
      .sort((a, b) => (count.get(b.id) || 0) - (count.get(a.id) || 0) || (b.n || 0) - (a.n || 0))
      .map((a) => {
        const pic = pics.get('art:' + a.id);
        return `<div class="design">${pic ? `<img alt="" src="${pic.icon}" />` : '<div class="gt-icon"></div>'}<input data-art="${esc(a.id)}" value="${esc(a.name || '')}" placeholder="name?" /><div class="hint">${esc(a.gear || '?')} · ${count.get(a.id) || 0} item${count.get(a.id) === 1 ? '' : 's'}</div></div>`;
      })
      .join('') || '<p class="hint">Nothing seen yet.</p>';
  }
  $('#gs-designs-box').addEventListener('toggle', renderDesigns);
  $('#gs-designs').addEventListener('change', (e) => {
    const id = e.target.dataset.art;
    if (!id) return;
    const arts = loadArts();
    const a = arts.find((x) => x.id === id);
    if (!a) return;
    a.name = e.target.value.trim();
    a.named = !!a.name;
    try {
      localStorage.setItem(ARTS_KEY, JSON.stringify(arts));
    } catch (_) { /* full */ }
    // the items of this design take the name (unless you typed one for the item itself)
    for (const it of gs.scanned) if (it.art === id && !it.nameTyped) it.name = a.name;
    save();
    recompute();
    render();
  });
  $('#gs-allheroes').innerHTML = HEROES.filter((h) => BASE[h.code]).map((h) => `<option value="${esc(h.name)}"></option>`).join('');

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
      loadPics();
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
  loadPics();
})();
