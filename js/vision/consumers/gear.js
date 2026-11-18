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

  bus.on('gear:item', ({ item, key, problems, rect }) => {
    const desc = `${item.gear} · ${String(item.set || '').replace(/Set$/, '') || '?'} · +${item.enhance} · ${item.main.type} ${item.main.value}`;
    const gs = GS.load();
    let slim = GS.addScanned(gs, item, key);
    const dup = !slim;
    if (dup) slim = gs.scanned.find((x) => x.key === key); // read before: still show its verdict on the game
    else {
      try {
        GS.save(gs);
      } catch (e) {
        bus.publish('vision:warning', { reader: 'gear-item', text: 'Could not save the item (browser storage full?): ' + e.message });
        return;
      }
    }
    if (dup) bus.publish('gear:dup', { desc });
    if (!slim) return;
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
  bus.on('gear:grid', ({ tiles }) => {
    const gs = GS.load();
    const mine = [];
    let added = 0;
    for (const t of tiles || []) {
      let slim = GS.addScanned(gs, t.item, t.key);
      if (slim) added++;
      else slim = gs.scanned.find((x) => x.key === t.key);
      if (slim) mine.push({ t, slim });
    }
    if (added) {
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
    bus.publish('gear:grid-judged', { read: mine.length, added, counts });
    if (window.E7Overlay) window.E7Overlay.post('gear-grid', labels);
  });
  bus.on('gear:grid-gone', () => window.E7Overlay && window.E7Overlay.clear('gear-grid'));
})();
