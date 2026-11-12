/*
 * Hero info card, shared by every page: element/class, role tags and skill
 * notes (each from its own source), your build and RTA record when known, and
 * a link to the hero's full, current skill text on epic7x.com.
 *
 * Sources (never merged):
 *   'my notes'  your own tags / skill notes   (stored with your RTA notes on this device)
 *   'guild'     shared by your guild          (Guild War sync; cached on this device for other pages)
 *
 * A page can plug in its own storage with HeroInfo.configure({...}); otherwise
 * it reads/writes this device's storage directly.
 */
(function () {
  'use strict';
  const R = window.RTARoster;
  const L = window.RTALogic;
  const HEROES = window.RTASources.officialSnapshot.heroes;
  const byCode = new Map(HEROES.map((h) => [h.code, h]));
  const TAG_GROUPS = (L && L.TAG_GROUPS) || {};
  const ALL_TAGS = [...new Set(Object.values(TAG_GROUPS).flat())];
  const SKILLS = [
    ['S1', 'Skill 1'],
    ['S2', 'Skill 2'],
    ['S3', 'Skill 3'],
    ['other', 'Passive / EE / notes'],
  ];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- default storage (pages without their own adapter)
  const readJSON = (k) => {
    try {
      return JSON.parse(localStorage.getItem(k) || 'null');
    } catch (_) {
      return null;
    }
  };
  let adapter = {
    getMyNote(code) {
      const s = readJSON('rta-helper-v2');
      return (s && s.notes && s.notes[code]) || null;
    },
    saveMyNote(code, note) {
      const s = readJSON('rta-helper-v2') || { version: 2 };
      s.notes = s.notes || {};
      s.notes[code] = { ...(s.notes[code] || {}), ...note };
      localStorage.setItem('rta-helper-v2', JSON.stringify(s));
    },
    getGuildNote(code) {
      const g = readJSON('e7-guild-heroes');
      return (g && g[code]) || null;
    },
    saveGuildNote: null, // only the Guild War page can write guild notes
    extras: null, // (code) -> html  e.g. your speed / RTA record
  };
  function configure(a) {
    adapter = { ...adapter, ...a };
  }

  function tagList(code) {
    const mine = (adapter.getMyNote(code) || {}).tags || [];
    const guild = (adapter.getGuildNote(code) || {}).tags || [];
    return R.tagSources({ 'my notes': mine, guild });
  }
  /** Small tag chips for quick overview next to a hero. */
  function tagChips(code, max = 3) {
    const t = tagList(code);
    if (!t.length) return '';
    return `<span class="htags">${t
      .slice(0, max)
      .map((x) => `<span class="tag" title="${esc(x.tag)} — from ${esc(x.sources.join(' + '))}">${esc(x.tag)}</span>`)
      .join('')}${t.length > max ? `<span class="tag more" title="${esc(t.slice(max).map((x) => x.tag).join(', '))}">+${t.length - max}</span>` : ''}</span>`;
  }

  // ---------------------------------------------------------------- modal
  let dlg = null;
  function ensureDialog() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.className = 'wide-dialog heroinfo';
    dlg.innerHTML = '<div class="hi-body"></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', onClick);
    return dlg;
  }
  let current = null;
  let editing = null; // 'mine' | 'guild' | null

  function open(code) {
    if (!code) return;
    current = code;
    editing = null;
    render();
    const d = ensureDialog();
    if (!d.open) d.showModal();
  }

  function sourceBlock(label, cls, note, canEdit, which) {
    const skills = (note && note.skills) || {};
    const has = SKILLS.some(([k]) => skills[k]) || (note && (note.tags || []).length) || (note && note.notes);
    return `<div class="hi-src"><h4><span class="src ${cls}">${esc(label)}</span>${note && note.updatedBy ? ` <span class="hint">by ${esc(note.updatedBy)}</span>` : ''}
        ${canEdit ? `<button class="btn" data-hi="edit-${which}">${has ? 'Edit' : 'Add'}</button>` : ''}</h4>
      ${has ? `${(note.tags || []).length ? `<div>${note.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        ${SKILLS.filter(([k]) => skills[k]).map(([k, l]) => `<div class="hi-skill"><b>${esc(l)}:</b> ${esc(skills[k])}</div>`).join('')}
        ${note.notes ? `<div class="hint">${esc(note.notes)}</div>` : ''}` : '<p class="hint">Nothing yet.</p>'}</div>`;
  }

  function editor(which, note) {
    const n = note || {};
    const skills = n.skills || {};
    return `<div class="hi-edit" data-which="${which}">
      <h4>${which === 'guild' ? 'Guild notes (shared with your guild)' : 'My notes (this device)'}</h4>
      ${Object.entries(TAG_GROUPS)
        .map(([g, tags]) => `<div class="hi-tg"><span class="hint">${esc(g)}:</span> ${tags.map((t) => `<label class="inline tagbox"><input type="checkbox" value="${esc(t)}" ${(n.tags || []).includes(t) ? 'checked' : ''}/> ${esc(t)}</label>`).join('')}</div>`)
        .join('')}
      ${SKILLS.map(([k, l]) => `<label>${esc(l)} <textarea rows="2" data-skill="${k}" placeholder="Short reminder, e.g. 'AoE, extra turn on kill, ignores counter'">${esc(skills[k] || '')}</textarea></label>`).join('')}
      <div class="btn-row"><button class="btn" data-hi="cancel">Cancel</button><button class="btn primary" data-hi="save-${which}">Save</button></div>
    </div>`;
  }

  function render() {
    if (!dlg && !current) return;
    const d = ensureDialog();
    const h = byCode.get(current) || { code: current, name: current };
    const mine = adapter.getMyNote(current);
    const guild = adapter.getGuildNote(current);
    const tags = tagList(current);
    d.querySelector('.hi-body').innerHTML = `
      <div class="hi-head">${h.source === 'official' || byCode.has(current) ? `<img class="pt" alt="" src="${esc(R.PORTRAIT_URL(current))}" onerror="this.classList.add('broken')" />` : ''}
        <div><h3>${esc(h.name)}</h3><div class="hint">${esc(R.ELEMENT_LABEL[h.element] || h.element || '')} · ${esc(R.ROLE_LABEL[h.role] || h.role || '')}</div></div>
        <span class="spacer"></span><button class="btn" data-hi="close">Close</button></div>
      ${tags.length ? `<div class="hi-tags">${tags.map((x) => `<span class="tag" title="from ${esc(x.sources.join(' + '))}">${esc(x.tag)}${x.sources.length > 1 ? ' ✓' : ''}</span>`).join('')}</div>` : '<p class="hint">No role tags yet. Add yours below; the guild can add shared ones from the Guild War page.</p>'}
      <p><a href="${esc(R.epic7xUrl(h.name))}" target="_blank" rel="noopener">Full, current skill descriptions on epic7x.com ↗</a></p>
      ${adapter.extras ? adapter.extras(current) || '' : ''}
      ${editing === 'mine' ? editor('mine', mine) : sourceBlock('my notes', 'notes', mine, true, 'mine')}
      ${editing === 'guild' ? editor('guild', guild) : sourceBlock('guild', 'game', guild, !!adapter.saveGuildNote, 'guild')}
      ${!adapter.saveGuildNote ? '<p class="hint">Guild notes are edited on the Guild War page and shown here from this device\'s last sync.</p>' : ''}`;
  }

  async function onClick(e) {
    const b = e.target.closest('[data-hi]');
    if (!b) return;
    const a = b.dataset.hi;
    if (a === 'close') return dlg.close();
    if (a === 'cancel') editing = null;
    else if (a === 'edit-mine') editing = 'mine';
    else if (a === 'edit-guild') editing = 'guild';
    else if (a === 'save-mine' || a === 'save-guild') {
      const box = dlg.querySelector('.hi-edit');
      const tags = [...box.querySelectorAll('input[type=checkbox]:checked')].map((i) => i.value);
      const skills = {};
      for (const t of box.querySelectorAll('[data-skill]')) if (t.value.trim()) skills[t.dataset.skill] = t.value.trim();
      if (a === 'save-mine') adapter.saveMyNote(current, { tags, skills });
      else await adapter.saveGuildNote(current, { tags, skills });
      editing = null;
    }
    render();
  }

  /** Any element with data-hero="<code>" opens the card (delegated, works for content added later). */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-hero]');
    if (!el || e.defaultPrevented) return;
    e.preventDefault();
    e.stopPropagation();
    open(el.dataset.hero);
  }, true);

  window.HeroInfo = { open, configure, tagChips, tagList, ALL_TAGS, TAG_GROUPS, refresh: render };
})();
