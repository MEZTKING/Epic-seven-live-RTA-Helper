/*
 * My devices sync, in the app (js/mysync.js does the work). Loaded on Home, RTA and Gear.
 *   - Runs a sync pass shortly after the page opens, every 30 s, and when you come back to the app.
 *   - One tab at a time (Web Locks). After data came in, pages reload it ('e7-synced' event here,
 *     the storage event in other tabs).
 *   - Home page (#mysync card): turn on (uses your Guild War Firebase project or a pasted config), link for the other
 *     device, sync now, turn off. Opening a link with #sync=… on the other device connects it.
 * Settings on this device: localStorage 'e7-mysync' = { key, config, device, enabled, sections, changedAt, lastAt, last, error }
 */
(function () {
  'use strict';
  const M = window.MySync;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const readState = () => {
    try {
      return JSON.parse(localStorage.getItem(M.STATE_KEY) || 'null') || {};
    } catch (_) {
      return {};
    }
  };
  const writeState = (s) => localStorage.setItem(M.STATE_KEY, JSON.stringify(s));
  const deviceName = () => {
    const ua = navigator.userAgent;
    const kind = /Android/i.test(ua) ? 'Android phone' : /iPhone|iPad/i.test(ua) ? 'iPhone/iPad' : /Electron/.test(ua) ? 'PC app' : /Windows/.test(ua) ? 'Windows browser' : 'browser';
    return kind;
  };
  let remote = null;
  let remoteFor = '';
  let running = false;
  let testRemote = null; // tests plug in a shared fake cloud

  async function getRemote(st) {
    if (testRemote) return testRemote;
    const id = st.key + (st.config && st.config.projectId);
    if (!remote || remoteFor !== id) {
      remote = await M.firestoreRemote(st.key, st.config);
      remoteFor = id;
    }
    return remote;
  }

  /** One pass (skipped if sync is off or another tab is syncing). Returns the result or null. */
  async function run() {
    const st = readState();
    if (!st.enabled || !st.key || (!st.config && !testRemote) || running) return null;
    const pass = async () => {
      running = true;
      try {
        const r = await M.syncOnce({ storage: localStorage, remote: await getRemote(st), state: st, device: st.device || deviceName() });
        st.lastAt = new Date().toISOString();
        st.last = r;
        st.error = '';
        writeState(st);
        const changed = [...r.pulled, ...r.merged];
        if (changed.length) window.dispatchEvent(new CustomEvent('e7-synced', { detail: { sections: changed } }));
        render();
        return r;
      } catch (e) {
        st.error = String((e && e.message) || e);
        writeState(st);
        render();
        return null;
      } finally {
        running = false;
      }
    };
    if (navigator.locks) return navigator.locks.request('e7-mysync', { ifAvailable: true }, (lock) => (lock ? pass() : null));
    return pass();
  }

  // ------------------------------------------------------------ Home card
  function guildConfig() {
    try {
      return (JSON.parse(localStorage.getItem('e7-guild-conn') || 'null') || {}).config || null;
    } catch (_) {
      return null;
    }
  }
  const pageBase = () => location.href.split('#')[0].replace(/[^/]*$/, '') + 'index.html';
  function render() {
    const box = $('#mysync');
    if (!box) return;
    const st = readState();
    if (!st.enabled) {
      const gc = guildConfig();
      box.innerHTML = `<p class="hint">Keep your RTA notes, match history, presets, scouting and gear the same on your PC and phone.
        Uses <b>your own</b> Firebase project (the one from Guild War works). The current draft, calibration and screen pictures stay on each device.</p>
        ${gc ? `<label class="inline"><input type="radio" name="ms-cfg" value="guild" checked /> Use my Guild War Firebase project (${esc(gc.projectId)})</label><br>` : ''}
        <label class="inline"><input type="radio" name="ms-cfg" value="paste" ${gc ? '' : 'checked'} /> Paste a Firebase config</label>
        <textarea id="ms-config" rows="3" class="full ${gc ? 'hidden' : ''}" placeholder='const firebaseConfig = { apiKey: "…", projectId: "…", appId: "…" };'></textarea>
        <div class="btn-row"><button id="ms-on" class="btn primary">Turn on sync</button></div>
        <p class="hint">On the other device, open the link this gives you. Firebase setup: see <a href="docs/GUILD_SETUP.md" target="_blank" rel="noopener">the guide</a>
        (publish the updated <code>firestore.rules</code> once so the private <code>personal/</code> area is allowed).</p>`;
      return;
    }
    const last = st.last || { pushed: [], pulled: [], merged: [] };
    const label = (id) => (M.SECTIONS.find((s) => s.id === id) || {}).label || id;
    const did = [...last.pulled.map((x) => `↓ ${label(x)}`), ...last.merged.map((x) => `⇄ ${label(x)}`), ...last.pushed.map((x) => `↑ ${label(x)}`)];
    box.innerHTML = `<p><b>Sync is on</b> on this device (${esc(st.device || deviceName())}) · project ${esc((st.config && st.config.projectId) || '?')}</p>
      <p class="hint">${st.lastAt ? `Last sync ${new Date(st.lastAt).toLocaleString()}${did.length ? ': ' + esc(did.join(' · ')) : ': everything already the same'}` : 'Not synced yet.'}
      ${st.error ? `<br><span class="warn-text">⚠ ${esc(st.error)}</span>` : ''}</p>
      <div class="btn-row"><button id="ms-now" class="btn primary">Sync now</button><button id="ms-link" class="btn">Copy the link for my other device</button><button id="ms-off" class="btn danger">Turn off on this device</button></div>
      <p class="hint">Keep the link private: anyone with it can see and change your synced data.</p>
      <input id="ms-linkbox" class="full hidden" readonly />`;
  }
  async function turnOn(key, config) {
    const st = { key, config, enabled: true, device: deviceName(), sections: {}, changedAt: {} };
    writeState(st);
    render();
    await run();
  }
  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.id === 'ms-on') {
      let config = null;
      const choice = (document.querySelector('input[name=ms-cfg]:checked') || {}).value;
      try {
        config = choice === 'guild' ? guildConfig() : window.RTASync.parseConfig($('#ms-config').value);
      } catch (err) {
        return alert('That Firebase config doesn\'t look right: ' + err.message);
      }
      await turnOn(M.newKey(), config);
    } else if (t.id === 'ms-now') {
      t.disabled = true;
      await run();
      t.disabled = false;
    } else if (t.id === 'ms-link') {
      const st = readState();
      const l = M.link(pageBase(), st.key, st.config);
      const box = $('#ms-linkbox');
      box.value = l;
      box.classList.remove('hidden');
      box.select();
      try {
        await navigator.clipboard.writeText(l);
        t.textContent = 'Link copied ✓';
      } catch (_) {
        t.textContent = 'Copy it from the box below';
      }
    } else if (t.id === 'ms-off') {
      if (!confirm('Turn sync off on this device? Your data stays here and in the cloud.')) return;
      writeState({ ...readState(), enabled: false });
      render();
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.name === 'ms-cfg') $('#ms-config').classList.toggle('hidden', e.target.value !== 'paste');
  });

  // a link from the other device: index.html#sync=<key>&c=<config>
  const joined = M.parseLink(location.hash);
  if (joined && joined.key) {
    history.replaceState(null, '', location.pathname + location.search); // don't leave the key in the address bar
    if (!joined.config) alert('This sync link is missing its Firebase settings. Copy it again on the other device.');
    else if (confirm('Connect this device to your synced data? Your notes, matches and gear from the other device will be loaded here.')) turnOn(joined.key, joined.config);
  }

  render();
  setTimeout(run, 1500);
  setInterval(run, 30000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && run());
  window.MySyncApp = { run, render, _useRemote: (r) => (testRemote = r) };
})();
