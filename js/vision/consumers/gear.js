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
  function learnArt(art, info, pics, gs) {
    const A = window.E7GearArts;
    if (!A || !art || !art.fp) return null;
    const r = A.learn(loadArts(), art.fp, info);
    try {
      localStorage.setItem(ARTS_KEY, JSON.stringify(r.list));
    } catch (_) { /* full: only a convenience */ }
    // designs joined under one name (DEVLOG #85): items pointing to a joined design follow it (in the caller's copy of
    // the gear store, which it saves)
    if (gs && r.into) for (const it of gs.scanned) if (it.art && r.into[it.art]) {
      it.art = r.into[it.art];
      learnArt.moved = true;
    }
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
  // the score shown (DEVLOG #83): the game's Equipment Score (read, else estimated) or the Fribbels gear score (rules)
  const gameMode = (gs) => (gs.rules.scoreMode || 'game') !== 'wss';
  const scoreNum = (it, r, gs) => (gameMode(gs) ? S.gameScore(it) : r.wss);
  function scoreText(it, r, gs) {
    const now = scoreNum(it, r, gs);
    const after = r.reforgedWss !== r.wss ? now + (r.reforgedWss - r.wss) : null;
    return `${gameMode(gs) ? 'score' : 'gear score'} ${now}${after !== null ? ` → ${after}` : ''}`;
  }
  bus.on('gear:item', ({ item, key, problems, rect, pics, art, wornBy }) => {
    const desc = `${item.gear} · ${String(item.set || '').replace(/Set$/, '') || '?'} · +${item.enhance} · ${item.main.type} ${item.main.value}`;
    const gs = GS.load();
    // the same item (main stat and every substat alike) already known: that one (the item window on the hero screen
    // shows no level badge to read, so its key can differ), DEVLOG #86
    const sameStats = (x) => x.main && x.main.type === item.main.type && Number(x.main.value) === Number(item.main.value) && (x.subs || []).length === item.substats.length && x.subs.every((sb, i) => sb.type === item.substats[i].type && Number(sb.value) === Number(item.substats[i].value));
    let slim = wornBy ? gs.scanned.find(sameStats) || null : null;
    let dup = !!slim;
    if (!slim) {
      slim = GS.addScanned(gs, item, key);
      dup = !slim;
      if (dup) slim = gs.scanned.find((x) => x.key === key); // read before: still show its verdict on the game
    }
    learnArt.moved = false;
    const entry = learnArt(art, { name: art && art.name, gear: item.gear !== 'Unknown' ? item.gear : '', rank: item.rank }, pics, gs);
    // the game's score read now fills one an item read before didn't have (DEVLOG #83)
    let scoreNew = false;
    if (slim && item.gameScore && slim.gameScore !== item.gameScore) {
      slim.gameScore = item.gameScore;
      scoreNew = true;
    }
    // the item window from a hero's equipment screen (DEVLOG #86): this exact item is on that hero
    let wornNew = false;
    if (slim && wornBy) {
      for (const it of gs.scanned) if (it !== slim && it.wornBy === wornBy && it.gear === slim.gear) delete it.wornBy;
      if (slim.wornBy !== wornBy || !slim.worn) wornNew = true;
      slim.wornBy = wornBy;
      slim.worn = true;
      const seen = gs.heroSeen[wornBy];
      const sl = seen && seen.slots.find((x) => x.gear === slim.gear);
      if (sl && sl.itemId !== slim.id) {
        sl.itemId = slim.id;
        wornNew = true;
      }
    }
    if ((linkArt(slim, entry) || scoreNew || learnArt.moved || wornNew) && dup) {
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
    const ev = S.evaluateAll(all.includes(slim) ? all : [...all, slim], HEROES, gs.overrides, gs.rules, { only: gs.priority });
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
      window.E7Overlay.post('gear', [{ ...rect, kind: 'card', side: rect.x > 0.5 ? 'left' : 'right', level, title: `${res.verdict.toUpperCase()} · ${scoreText(slim, res, gs)}`, lines: /^Upgrade for a hero/.test(res.reason) ? [whom] : [res.reason, whom] }]);
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
      learnArt.moved = false;
      if (slim && t.art && linkArt(slim, learnArt(t.art, {}, t.pics, gs))) changed = true;
      if (learnArt.moved) changed = true;
      if (slim && t.item.gameScore && slim.gameScore !== t.item.gameScore) {
        slim.gameScore = t.item.gameScore;
        changed = true;
      }
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
    const ev = S.evaluateAll([...all, ...extra], HEROES, gs.overrides, gs.rules, { only: gs.priority });
    const byId = new Map(ev.results.map((r) => [r.item.id, r]));
    const counts = {};
    const labels = mine.map(({ t, slim }) => {
      const r = byId.get(slim.id);
      const verdict = t.worn ? 'worn' : r ? r.verdict : '?';
      counts[verdict] = (counts[verdict] || 0) + 1;
      const title = t.worn ? 'WORN' : r ? `${SHORT[r.verdict] || r.verdict.toUpperCase()} ${scoreNum(slim, r, gs)}` : '?';
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

  // a hero's equipment screen (DEVLOG #84): each slot linked to an item the app knows (same slot, enhance, level, set
  // and design where known); the hero's real stats kept; a mark on each slot (✓ linked / ? not found / ? several match)
  bus.on('gear:hero', ({ hero, stats, slots }) => {
    if (!hero || !hero.code) return;
    const gs = GS.load();
    const all = [...gs.scanned, ...gs.items];
    const linked = (slots || []).map((sl) => {
      const cands = all.filter(
        (it) =>
          it.gear === sl.gear &&
          Number(it.enhance) === Number(sl.enhance) &&
          (!sl.level || Number(it.level) === Number(sl.level)) &&
          (!sl.set || !it.set || it.set === sl.set) &&
          (!sl.art || !sl.art.id || !it.art || it.art === sl.art.id),
      );
      // several alike: the one already known on this hero
      const pick = cands.length === 1 ? cands[0] : cands.find((it) => it.equipped === hero.code || it.wornBy === hero.code) || null;
      return { gear: sl.gear, enhance: sl.enhance, level: sl.level, set: sl.set, art: sl.art && sl.art.id, itemId: pick ? pick.id : null, candidates: cands.length, rect: sl.rect };
    });
    // screen items: who wears them now (an item seen on this hero before, in a slot now holding another, is free)
    for (const it of gs.scanned) if (it.wornBy === hero.code && !linked.some((l) => l.itemId === it.id)) delete it.wornBy;
    for (const l of linked) {
      const it = gs.scanned.find((x) => x.id === l.itemId);
      if (it) {
        it.wornBy = hero.code;
        it.worn = true;
      }
    }
    gs.heroSeen[hero.code] = { name: hero.name, at: Date.now(), stats: stats || (gs.heroSeen[hero.code] || {}).stats || null, slots: linked.map(({ rect, ...l }) => l) };
    try {
      GS.save(gs);
    } catch (e) {
      bus.publish('vision:warning', { reader: 'hero-gear', text: 'Could not save (browser storage full?): ' + e.message });
    }
    const n = linked.filter((l) => l.itemId).length;
    bus.publish('gear:hero-linked', { hero: hero.name, linked: n, slots: linked.length });
    if (window.E7Overlay)
      window.E7Overlay.post(
        'gear-hero',
        linked.map((l) => ({ x: l.rect.x, y: l.rect.y + l.rect.h, w: 0, h: 0, kind: 'label', side: 'below', level: l.itemId ? 'green' : 'grey', title: l.itemId ? '✓ known' : l.candidates > 1 ? `? ${l.candidates} alike` : '? not read yet' })),
      );
  });
  bus.on('gear:hero-gone', () => window.E7Overlay && window.E7Overlay.clear('gear-hero'));
})();
