/* Epic 7 Engine home page: a one-line status for each module, read from this device's storage. */
(function () {
  'use strict';
  const read = (key) => {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (_) {
      return null;
    }
  };
  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  const rta = read('rta-helper-v2');
  if (rta && Array.isArray(rta.matches)) {
    const n = rta.matches.length;
    const wins = rta.matches.filter((m) => m.result === 'win').length;
    set('st-rta', n ? `${n} matches logged · ${Math.round((wins / n) * 100)}% wins` : 'No matches logged yet');
  } else set('st-rta', 'Not used on this device yet');

  const gear = read('rta-gear-v1');
  const nItems = gear ? (Array.isArray(gear.items) ? gear.items.length : 0) + (Array.isArray(gear.scanned) ? gear.scanned.length : 0) : 0;
  set('st-gear', nItems ? `${nItems} items (gear.txt + read from screen)` : 'Import gear.txt or read gear from the game');

  const g = read('e7-guild-conn');
  set('st-guild', g && g.guildCode ? `${g.guildName || 'Guild'} · ${g.config ? 'shared live' : 'this device only'}${g.myName ? ` · you are ${g.myName}` : ''}` : 'Create or join your guild');
  let screens = [];
  try {
    screens = JSON.parse(localStorage.getItem('e7-screens') || '[]');
  } catch (_) { /* none */ }
  const kinds = new Set(screens.map((x) => x.screen)).size;
  set('st-live', kinds ? `${kinds} of 6 screens taught` : 'Teach your game screens to switch on automation');
})();
