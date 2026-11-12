/*
 * Starter hero list. This is a small seed only — edit, add or remove heroes
 * from the "Heroes" tab in the app (your edits are saved in your browser).
 *
 * Fields:
 *   id         unique key (lowercase, dashes)
 *   name       display name
 *   element    fire | ice | earth | light | dark
 *   role       warrior | knight | thief | ranger | mage | soul-weaver
 *   tier       S | A | B | C | "" (your own rating; used by suggestions)
 *   owned      true if it is in YOUR roster (suggested picks prefer owned heroes)
 *   counters   ids of heroes this hero is good AGAINST
 *   synergies  ids of heroes this hero works well WITH
 *   notes      free text (speed tunes, sets, reminders...)
 *
 * Counters/synergies start empty on purpose: the meta changes every season,
 * so fill them in with what you see in your own games.
 */
(function (root) {
  const seed = [
    ['Arbiter Vildred', 'dark', 'thief'],
    ['Seaside Bellona', 'ice', 'ranger'],
    ['Landy', 'earth', 'ranger'],
    ['Ruele of Light', 'light', 'soul-weaver'],
    ['Lilias', 'fire', 'knight'],
    ['Martial Artist Ken', 'dark', 'warrior'],
    ['Fallen Cecilia', 'dark', 'knight'],
    ['Spirit Eye Celine', 'light', 'thief'],
    ['Ravi', 'fire', 'warrior'],
    ['Apocalypse Ravi', 'dark', 'warrior'],
    ['Tamarinne', 'fire', 'soul-weaver'],
    ['Specter Tenebria', 'dark', 'mage'],
    ['Tenebria', 'fire', 'mage'],
    ['Aria', 'ice', 'mage'],
    ['Luna', 'ice', 'warrior'],
    ['Krau', 'ice', 'knight'],
    ['Last Rider Krau', 'light', 'knight'],
    ['Ran', 'ice', 'thief'],
    ['Belian', 'light', 'knight'],
    ['Cermia', 'fire', 'warrior'],
    ['Lionheart Cermia', 'light', 'warrior'],
    ['Destina', 'earth', 'soul-weaver'],
    ['Sez', 'ice', 'thief'],
    ['Kise', 'ice', 'thief'],
    ['Judge Kise', 'light', 'warrior'],
    ['Basar', 'earth', 'mage'],
    ['Yufine', 'earth', 'warrior'],
    ['Abyssal Yufine', 'dark', 'warrior'],
    ['Charlotte', 'fire', 'knight'],
    ['Vildred', 'ice', 'thief'],
    ['Diene', 'ice', 'soul-weaver'],
    ['Vivian', 'earth', 'mage'],
    ['Bellona', 'earth', 'ranger'],
    ['Iseria', 'earth', 'ranger'],
    ['Briar Witch Iseria', 'dark', 'ranger'],
    ['Ray', 'earth', 'soul-weaver'],
    ['Cidd', 'earth', 'thief'],
    ['Baal & Sezan', 'fire', 'mage'],
    ['Haste', 'fire', 'thief'],
    ['Kayron', 'fire', 'thief'],
    ['Ken', 'fire', 'warrior'],
    ['Ludwig', 'earth', 'mage'],
    ['Lidica', 'fire', 'ranger'],
    ['Sigret', 'ice', 'warrior'],
    ['Alencia', 'earth', 'warrior'],
    ['Senya', 'earth', 'knight'],
    ['Straze', 'dark', 'warrior'],
    ['Dark Corvus', 'dark', 'warrior'],
    ['Flan', 'ice', 'ranger'],
    ['Lilibet', 'earth', 'warrior'],
    ['Commander Lorina', 'dark', 'warrior'],
    ['Choux', 'ice', 'warrior'],
    ['Elena', 'ice', 'soul-weaver'],
    ['Hwayoung', 'fire', 'warrior'],
    ['Ambitious Tywin', 'light', 'knight'],
    ['Tywin', 'ice', 'knight'],
    ['Mort', 'earth', 'knight'],
    ['Celine', 'earth', 'thief'],
    ['Aramintha', 'fire', 'mage'],
    ['Silver Blade Aramintha', 'light', 'mage'],
  ];

  function slug(name) {
    return name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  const DEFAULT_HEROES = seed.map(([name, element, role]) => ({
    id: slug(name),
    name,
    element,
    role,
    tier: '',
    owned: false,
    counters: [],
    synergies: [],
    notes: '',
  }));

  const api = { DEFAULT_HEROES, slug };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RTAData = api;
})(typeof window !== 'undefined' ? window : globalThis);
