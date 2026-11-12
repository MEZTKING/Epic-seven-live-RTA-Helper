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
  set('st-gear', gear && Array.isArray(gear.items) && gear.items.length ? `${gear.items.length} items from ${gear.fileName || 'gear.txt'}` : 'Import gear.txt to start');

  const g = read('e7-guild-conn');
  set('st-guild', g && g.guildCode ? `${g.guildName || 'Guild'} · ${g.config ? 'shared live' : 'this device only'}${g.myName ? ` · you are ${g.myName}` : ''}` : 'Create or join your guild');
})();
