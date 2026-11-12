/*
 * CeciliaBot data (source 'ceciliabot'): full skill descriptions and each
 * hero's buffs / debuffs / effects, from the public API behind
 * https://ceciliabot.github.io (https://cecilia-bot-api.vercel.app/api/v1).
 *
 * Used for:
 *   - skill text on the hero card (fetched when a card is opened, cached on this device)
 *   - AUTOMATIC role tags, mapped from the game's effect ids (facts, not opinions)
 * Only hero ids are ever sent. Data is fetched at runtime and kept on the user's
 * device; nothing from CeciliaBot is copied into this repository.
 *
 * Pure part (tagsFromEffects, renderText) works in Node for tests.
 * Browser: window.CeciliaBot. Node: require().
 */
(function (root) {
  const API = 'https://cecilia-bot-api.vercel.app/api/v1';
  const SITE = 'https://ceciliabot.github.io';
  const LIST_KEY = 'e7-cecilia-heroes'; // { fetchedAt, heroes: { code: { slug, effects: {buff, debuff, common} } } }
  const HERO_KEY = (slug) => `e7-cecilia-hero-${slug}`; // { fetchedAt, data }
  const MAX_AGE = 7 * 24 * 3600 * 1000;

  // game effect id -> our tags (see js/logic.js TAG_GROUPS)
  const EFFECT_TAGS = {
    cmn_aoe: ['aoe'],
    cmn_extra_turn: ['extra turn'],
    cmn_dispel: ['dispel'],
    cmn_cleanse: ['cleanse'],
    cmn_heal: ['heal'],
    stic_heal: ['heal'],
    stic_protect: ['barrier'],
    cmn_ab_up: ['cr push'],
    cmn_ab_down: ['cr reduce'],
    cmn_penetration: ['penetration'],
    stic_def_dn: ['defense break'],
    stic_att_up: ['attack buff'],
    stic_att_up2: ['attack buff'],
    stic_cridmg_up: ['crit buff'],
    stic_speed_up: ['speed buff'],
    stic_debuf_impossible: ['immunity'],
    stic_stun: ['stun', 'control'],
    stic_sleep: ['sleep', 'control'],
    stic_provoke: ['provoke', 'control'],
    stic_silence: ['silence', 'control'],
    stic_heal_impossible: ['unhealable'],
    cmn_revive: ['revive'],
    cmn_counterattack: ['counter'],
    stic_counter: ['counter'],
  };

  /** effects { buff: [], debuff: [], common: [] } -> sorted tags. 2+ different debuffs also -> 'debuffer'. */
  function tagsFromEffects(effects) {
    const e = effects || {};
    const out = new Set();
    for (const id of [...(e.buff || []), ...(e.debuff || []), ...(e.common || [])]) for (const t of EFFECT_TAGS[id] || []) out.add(t);
    if (new Set(e.debuff || []).size >= 2) out.add('debuffer');
    return [...out].sort();
  }

  /**
   * CeciliaBot skill text markup: **bold**, ++buff++, --debuff--, and {{variable}}
   * placeholders filled from `values` (one entry per placeholder: [base, +enh1, +enh2, ...];
   * shown at max enhancement; fractions shown as %). Everything else is escaped.
   */
  function fillValue(v) {
    const arr = Array.isArray(v) ? v : [v];
    const nums = arr.map(Number).filter((x) => !Number.isNaN(x));
    if (!nums.length) return '?';
    const total = nums.reduce((a, b) => a + b, 0);
    return nums.every((x) => Math.abs(x) <= 1) ? `${Math.round(total * 1000) / 10}%` : String(Math.round(total * 100) / 100);
  }
  function renderText(s, values = []) {
    let i = 0;
    const withValues = String(s ?? '').replace(/\{\{\s*variable\s*\}\}/g, () => `[[${fillValue(values[i++])}]]`);
    const esc = withValues.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    return esc
      .replace(/\[\[(.+?)\]\]/g, '<b>$1</b>')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\+\+(.+?)\+\+/g, '<b class="cb-buff">$1</b>')
      .replace(/--(.+?)--/g, '<b class="cb-debuff">$1</b>')
      .replace(/\n/g, '<br>');
  }

  /** Skills from a getItem response -> [{ n, name, text, awakenedText, passive, cooldown }] */
  function skillsOf(data) {
    return ((data && data.skills) || []).map((s, i) => ({
      n: s.skill || i + 1,
      name: s.name || `Skill ${i + 1}`,
      text: s.description || '',
      values: s.values || [],
      awakenedText: s.awakened && s.awakened.description && s.awakened.description !== s.description ? s.awakened.description : '',
      awakenedValues: (s.awakened && s.awakened.values) || [],
      passive: !!s.passive,
      cooldown: s.cooldown || 0,
    }));
  }

  // ------------------------------------------------------------- browser part
  const readJSON = (k) => {
    try {
      return JSON.parse(localStorage.getItem(k) || 'null');
    } catch (_) {
      return null;
    }
  };
  const enabled = () => (typeof localStorage === 'undefined' ? true : localStorage.getItem('e7-use-cecilia') !== 'off');
  function setEnabled(on) {
    localStorage.setItem('e7-use-cecilia', on ? 'on' : 'off');
  }

  let listPromise = null;
  /** All heroes' effects (one request, refreshed weekly). Resolves to the cached map. */
  function loadList(force = false) {
    const cached = readJSON(LIST_KEY);
    if (!force && cached && Date.now() - cached.fetchedAt < MAX_AGE) return Promise.resolve(cached);
    if (listPromise) return listPromise;
    listPromise = fetch(`${API}/getList?list=hero`)
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then((list) => {
        const heroes = {};
        for (const h of list || []) if (h && h.id && h._id) heroes[h.id] = { slug: h._id, effects: { buff: h.buff || [], debuff: h.debuff || [], common: h.common || [] } };
        const val = { fetchedAt: Date.now(), heroes };
        try {
          localStorage.setItem(LIST_KEY, JSON.stringify(val));
        } catch (_) { /* storage full: keep in memory only */ }
        return val;
      })
      .catch((e) => {
        listPromise = null;
        if (cached) return cached;
        throw e;
      });
    return listPromise;
  }
  /** Automatic tags for a hero from the cached list (sync; empty until the list has loaded once). */
  function tagsFor(code) {
    if (!enabled()) return [];
    const c = readJSON(LIST_KEY);
    const h = c && c.heroes && c.heroes[code];
    return h ? tagsFromEffects(h.effects) : [];
  }
  /** Full hero data incl. skills (cached per hero, refreshed weekly). */
  async function loadHero(code) {
    const list = await loadList();
    const h = list.heroes[code];
    if (!h) throw new Error('Not in CeciliaBot yet');
    const cached = readJSON(HERO_KEY(h.slug));
    if (cached && Date.now() - cached.fetchedAt < MAX_AGE) return cached.data;
    const r = await fetch(`${API}/getItem?list=hero&id=${encodeURIComponent(h.slug)}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    try {
      localStorage.setItem(HERO_KEY(h.slug), JSON.stringify({ fetchedAt: Date.now(), data: { skills: data.skills, name: data.name, updated_dt: data.updated_dt } }));
    } catch (_) { /* ignore */ }
    return data;
  }
  function heroPage(code) {
    const c = readJSON(LIST_KEY);
    const h = c && c.heroes && c.heroes[code];
    return h ? `${SITE}/#/hero/${h.slug}` : SITE;
  }

  const api = { API, SITE, EFFECT_TAGS, tagsFromEffects, renderText, skillsOf, loadList, loadHero, tagsFor, heroPage, enabled, setEnabled };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CeciliaBot = api;
})(typeof window !== 'undefined' ? window : globalThis);
