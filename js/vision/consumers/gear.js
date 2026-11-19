/*
 * Gear consumer: runs next to the game watcher (vision.html / Live page), so items are saved even when the
 * Gear page isn't open. On 'gear:item' it adds the item to the gear store (source 'screen'), evaluates it
 * with your gear and heroes, shows the verdict in the overlay and publishes:
 *   gear:added { desc, verdict, reason, wss, reforgedWss, best, problems }   or   gear:dup { desc } (read before; its
 *   verdict is shown again). 'gear:gone' (the panel closed) takes the verdict off the overlay.
 *   'gear:grid' (the Full format, many items) → each saved and judged, a label per tile on the overlay's 'gear-grid'
 *   layer; publishes gear:grid-judged { read, added, counts }.
 */
(function () {
  'use strict';
  if (!window.E7Vision || !window.E7Vision.isHost) return;
  const bus = window.E7Bus;
  const GS = window.GearStore;
  const S = window.RTAGearSort;
  const HEROES = window.RTASources.allHeroes || window.RTASources.officialSnapshot.heroes; // official + newest heroes (fribbels-data)
  const byCode = new Map(HEROES.map((h) => [h.code, h]));
  const nameOf = (c) => (byCode.get(c) || {}).name || c;

  // the item's pictures as the game showed it (IndexedDB, js/gearpics.js), for the Gear page (DEVLOG #78)
  const keepPics = (slim, pics) => {
    if (slim && pics && (pics.icon || pics.shot) && window.E7GearPics) window.E7GearPics.put(slim.id, { ...pics, at: Date.now() });
  };
  // designs (js/geararts.js, DEVLOG #79): one entry per design in localStorage['e7-gear-arts'] { id, fp, name, gear,
  // rank, n, first, last }, one clean picture per design in IndexedDB 'e7-gear-pics' under 'art:<id>'
  const ARTS_KEY = 'e7-gear-arts';
  const loadArts = () => {
    try {
      return JSON.parse(localStorage.getItem(ARTS_KEY) || '[]') || [];
    } catch (_) {
      return [];
    }
  };
  function learnArt(art, info, pics) {
    const A = window.E7GearArts;
    if (!A || !art || !art.fp) return null;
    const r = A.learn(loadArts(), art.fp, info);
    try {
      localStorage.setItem(ARTS_KEY, JSON.stringify(r.list));
    } catch (_) { /* full: only a convenience */ }
    if (r.entry && pics && pics.icon && window.E7GearPics) {
      const id = 'art:' + r.entry.id;
      // the design's picture: the first one, or a sharper one from the details panel
      window.E7GearPics.get(id).then((old) => (!old || (old.from !== 'panel' && pics.from === 'panel')) && window.E7GearPics.put(id, { icon: pics.icon, from: pics.from, at: Date.now() }));
    }
    return r.entry;
  }
  /** Link an item to its design; the design's name fills a missing item name. Returns true when the item changed. */
  function linkArt(slim, entry) {
    if (!slim || !entry) return false;
    let ch = false;
    if (slim.art !== entry.id) {
      slim.art = entry.id;
      ch = true;
    }
    if (entry.name && slim.name !== entry.name && (!slim.name || !slim.nameTyped)) {
      slim.name = entry.name;
      ch = true;
    }
    return ch;
  }
  bus.on('gear:item', ({ item, key, problems, rect, pics, art }) => {
    const desc = `${item.gear} · ${String(item.set || '').replace(/Set$/, '') || '?'} · +${item.enhance} · ${item.main.type} ${item.main.value}`;
    const gs = GS.load();
    let slim = GS.addScanned(gs, item, key);
    const dup = !slim;
    if (dup) slim = gs.scanned.find((x) => x.key === key); // read before: still show its verdict on the game
    const entry = learnArt(art, { name: art && art.name, gear: item.gear !== 'Unknown' ? item.gear : '', rank: item.rank }, pics);
    if (linkArt(slim, entry) && dup) {
      try {
        GS.save(gs);
      } catch (_) { /* full */ }
    }
    if (!dup) {
      try {
        GS.save(gs);
      } catch (e) {
        bus.publish('vision:warning', { reader: 'gear-item', text: 'Could not save the item (browser storage full?): ' + e.message });
        return;
      }
    }
    if (dup) bus.publish('gear:dup', { desc });
    if (!slim) return;
    keepPics(slim, pics);
    // the item on screen is judged even when screen-read items are switched off for the sorter
    const all = GS.allItems(gs);
    const ev = S.evaluateAll(all.includes(slim) ? all : [...all, slim], HEROES, gs.overrides, gs.rules);
    const res = ev.results.find((r) => r.item.id === slim.id);
    if (!res) return;
    const best = res.best.filter((x) => x.delta > gs.rules.upgradeMargin)[0] || null;
    if (!dup) bus.publish('gear:added', { desc, verdict: res.verdict, reason: res.reason, wss: res.wss, reforgedWss: res.reforgedWss, best: best && { code: best.code, name: nameOf(best.code), delta: best.delta }, problems });
    if (window.E7Overlay && rect) {
      // whom it suits: up to two heroes it is an upgrade for, else the hero it fits best (your heroes from gear.txt)
      const ups = res.best.filter((x) => x.delta > gs.rules.upgradeMargin).slice(0, 2);
      const whom = ups.length ? `Upgrade for ${ups.map((x) => `${nameOf(x.code)} (+${x.delta})`).join(', ')}` : res.best[0] ? `Fits ${nameOf(res.best[0].code)} best (not an upgrade)` : 'Import gear.txt on the Gear page to see whom it suits';
      // the item panel sits at the right edge: the card goes on its left (DEVLOG #74); a coloured dot per verdict
      const level = { keep: 'green', reforge: 'green', enhance: 'yellow', extract: 'red', sell: 'red' }[res.verdict] || 'grey';
      window.E7Overlay.post('gear', [{ ...rect, kind: 'card', side: rect.x > 0.5 ? 'left' : 'right', level, title: `${res.verdict.toUpperCase()} · gear score ${res.wss}${res.reforgedWss !== res.wss ? ` → ${res.reforgedWss}` : ''}`, lines: /^Upgrade for a hero/.test(res.reason) ? [whom] : [res.reason, whom] }]);
    }
  });
  // the item panel closed: take the verdict off the game
  bus.on('gear:gone', () => window.E7Overlay && window.E7Overlay.clear('gear'));

  // the inventory in the Full format (DEVLOG #77): every item on the screen at once → saved, judged, and a short
  // label on each tile (KEEP / ENHANCE / REFORGE / EXTRACT / SELL; WORN = on a hero, kept whatever its score)
  const SHORT = { keep: 'KEEP', enhance: 'ENHANCE', reforge: 'REFORGE', extract: 'EXTRACT', sell: 'SELL' };
  const COLOR = { keep: 'green', reforge: 'green', enhance: 'yellow', extract: 'red', sell: 'red' };
  bus.on('gear:grid', ({ tiles, status }) => {
    const gs = GS.load();
    const mine = [];
    let added = 0;
    let changed = false;
    for (const t of tiles || []) {
      let slim = GS.addScanned(gs, t.item, t.key);
      if (slim) added++;
      else slim = gs.scanned.find((x) => x.key === t.key);
      if (slim) mine.push({ t, slim });
      if (slim && t.art && linkArt(slim, learnArt(t.art, {}, t.pics))) changed = true;
      // a picture from the details panel (sharper, stats in words) is not replaced by a grid tile's
      if (slim && t.pics && window.E7GearPics) window.E7GearPics.get(slim.id).then((old) => (!old || old.from !== 'panel') && keepPics(slim, t.pics));
      // on a hero / locked, as the tile shows it now (the Gear page keeps worn items)
      if (slim && (!!slim.worn !== !!t.worn || !!slim.locked !== !!t.locked)) {
        slim.worn = !!t.worn;
        slim.locked = !!t.locked;
        changed = true;
      }
    }
    if (added || changed) {
      try {
        GS.save(gs);
      } catch (e) {
        bus.publish('vision:warning', { reader: 'gear-grid', text: 'Could not save the items (browser storage full?): ' + e.message });
      }
    }
    const all = GS.allItems(gs);
    const extra = mine.map((m) => m.slim).filter((x) => !all.includes(x));
    const ev = S.evaluateAll([...all, ...extra], HEROES, gs.overrides, gs.rules);
    const byId = new Map(ev.results.map((r) => [r.item.id, r]));
    const counts = {};
    const labels = mine.map(({ t, slim }) => {
      const r = byId.get(slim.id);
      const verdict = t.worn ? 'worn' : r ? r.verdict : '?';
      counts[verdict] = (counts[verdict] || 0) + 1;
      const title = t.worn ? 'WORN' : r ? `${SHORT[r.verdict] || r.verdict.toUpperCase()} ${r.wss}` : '?';
      return { ...t.rect, kind: 'label', side: 'below', level: t.worn ? 'grey' : r ? COLOR[r.verdict] || 'grey' : 'grey', title };
    });
    // tiles not read: a red mark with the reason; rows cut off at the bottom: "scroll" (DEVLOG #82)
    const SHORT_WHY = (w) => (/slot/.test(w || '') ? 'open its slot tab' : /icon/.test(w || '') ? 'not recognised' : /number|enhance/.test(w || '') ? 'numbers unclear' : 'not read');
    for (const s of status || []) {
      if (s.state === 'failed') labels.push({ ...s.rect, kind: 'label', side: 'below', level: 'grey', title: `✗ ${SHORT_WHY(s.why)}` });
      else if (s.state === 'partial') labels.push({ ...s.rect, kind: 'label', side: 'below', level: 'grey', title: '↓ scroll to read' });
    }
    bus.publish('gear:grid-judged', { read: mine.length, added, counts, failed: (status || []).filter((s) => s.state === 'failed').length });
    if (window.E7Overlay) window.E7Overlay.post('gear-grid', labels);
  });
  bus.on('gear:grid-gone', () => window.E7Overlay && window.E7Overlay.clear('gear-grid'));
})();
