/*
 * Gear consumer: runs next to the game watcher (vision.html / Live page), so items are saved even when the
 * Gear page isn't open. On 'gear:item' it adds the item to the gear store (source 'screen'), evaluates it
 * with your gear and heroes, shows the verdict in the overlay and publishes:
 *   gear:added { desc, verdict, reason, wss, reforgedWss, best, problems }   or   gear:dup { desc }
 */
(function () {
  'use strict';
  if (!window.E7Vision || !window.E7Vision.isHost) return;
  const bus = window.E7Bus;
  const GS = window.GearStore;
  const S = window.RTAGearSort;
  const HEROES = window.RTASources.officialSnapshot.heroes;
  const byCode = new Map(HEROES.map((h) => [h.code, h]));
  const nameOf = (c) => (byCode.get(c) || {}).name || c;

  bus.on('gear:item', ({ item, key, problems, rect }) => {
    const desc = `${item.gear} · ${String(item.set || '').replace(/Set$/, '') || '?'} · +${item.enhance} · ${item.main.type} ${item.main.value}`;
    const gs = GS.load();
    const slim = GS.addScanned(gs, item, key);
    if (!slim) {
      bus.publish('gear:dup', { desc });
      return;
    }
    try {
      GS.save(gs);
    } catch (e) {
      bus.publish('vision:warning', { reader: 'gear-item', text: 'Could not save the item (browser storage full?): ' + e.message });
      return;
    }
    const ev = S.evaluateAll(GS.allItems(gs), HEROES, gs.overrides, gs.rules);
    const res = ev.results.find((r) => r.item.id === slim.id);
    if (!res) return;
    const best = res.best.filter((x) => x.delta > gs.rules.upgradeMargin)[0] || null;
    bus.publish('gear:added', { desc, verdict: res.verdict, reason: res.reason, wss: res.wss, reforgedWss: res.reforgedWss, best: best && { code: best.code, name: nameOf(best.code), delta: best.delta }, problems });
    if (window.E7Overlay && rect) {
      window.E7Overlay.post('gear', [{ ...rect, kind: 'card', side: 'right', title: `${res.verdict.toUpperCase()} · gear score ${res.wss}${res.reforgedWss !== res.wss ? ` → ${res.reforgedWss}` : ''}`, lines: [res.reason, best ? `Best for ${nameOf(best.code)} (+${best.delta})` : 'Not an upgrade for anyone'] }]);
    }
  });
})();
