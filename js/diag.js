/*
 * Diagnostic report (DEVLOG #29): one button copies everything needed to understand what the app is doing,
 * as text the owner can paste into a Claude session. window.E7Diag
 *   E7Diag.log(area, message, data?)   remember something that happened (last 300 lines, this device:
 *                                      localStorage 'e7-diag-log'); errors on any page are logged by themselves
 *   E7Diag.report(extra?)              the whole report as text (version, screen, layout, readers, slots, draft, log)
 *   E7Diag.copy(extra?)                copy it (falls back to a text box)
 *   E7Diag.provider(name, fn)          a page adds its own section (e.g. the RTA reader's slots)
 * Never included: the sync key, Firebase settings, guild codes, gear/match contents (only counts).
 */
(function () {
  'use strict';
  const KEY = 'e7-diag-log';
  const MAX = 300;
  const providers = new Map();
  const page = location.pathname.split('/').pop() || 'index.html';
  const readJSON = (k) => {
    try {
      return JSON.parse(localStorage.getItem(k) || 'null');
    } catch (_) {
      return null;
    }
  };
  const short = (v, n = 300) => {
    let s;
    try {
      s = typeof v === 'string' ? v : JSON.stringify(v);
    } catch (_) {
      s = String(v);
    }
    return s && s.length > n ? s.slice(0, n) + '…' : s;
  };

  let last = { key: '', n: 0 };
  function log(area, message, data) {
    // collapse repeats (readers run several times a second)
    const k = `${area}|${message}|${short(data, 80)}`;
    const list = readJSON(KEY) || [];
    if (k === last.key && list.length) {
      list[list.length - 1].n = (list[list.length - 1].n || 1) + 1;
      list[list.length - 1].t2 = new Date().toISOString();
    } else {
      list.push({ t: new Date().toISOString(), p: page, a: area, m: String(message).slice(0, 200), d: data === undefined ? undefined : short(data, 300) });
      last = { key: k, n: 1 };
    }
    while (list.length > MAX) list.shift();
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch (_) { /* full: the log is only a help */ }
  }
  window.addEventListener('error', (e) => log('error', e.message || 'error', { at: `${(e.filename || '').split('/').pop()}:${e.lineno}` }));
  window.addEventListener('unhandledrejection', (e) => log('error', 'unhandled: ' + short(e.reason && (e.reason.message || e.reason), 200)));

  function round(r) {
    return r && typeof r === 'object' && 'x' in r ? [r.x, r.y, r.w, r.h].map((v) => +(+v).toFixed(4)) : r;
  }
  function section(title, lines) {
    return `## ${title}\n${lines.filter((x) => x !== null && x !== undefined && x !== '').join('\n')}\n`;
  }

  // desktop overlay: where it is and why (E7Desktop.overlayStatus, desktop/main.js)
  function overlayLine() {
    const D = window.E7Desktop;
    if (!D || !D.overlayStatus) return null;
    try {
      const o = D.overlayStatus();
      const g = o.gameState;
      return `overlay: on=${o.on} visible=${o.visible} mode=${o.mode} tracking=${o.tracking} fallback=${o.fallback}` +
        ` bounds=${o.bounds ? `${o.bounds.x},${o.bounds.y} ${o.bounds.width}×${o.bounds.height}` : '-'}` +
        ` game=${g ? (g.min ? 'minimized' : g.w ? `${g.x},${g.y} ${g.w}×${g.h} front=${g.front}` : short(g)) : '-'}` +
        `${o.lastStateAgoMs != null ? ` (${Math.round(o.lastStateAgoMs / 1000)} s ago)` : ''}${o.error ? ` · tracker error: ${short(o.error, 300)}` : ''}`;
    } catch (e) {
      return `overlay: status unavailable (${e.message})`;
    }
  }
  function report(extra) {
    const out = [];
    const ua = navigator.userAgent;
    const desktop = !!window.E7Desktop;
    out.push(section('App', [
      `time: ${new Date().toISOString()} · page: ${page}${desktop && window.E7Desktop.version ? ` · desktop app version ${window.E7Desktop.version()}` : ''}`,
      `where: ${desktop ? 'desktop app' : 'browser'} · ${/Electron\/[\d.]+/.exec(ua) || ''} ${/(Chrome|Firefox|Safari)\/[\d.]+/.exec(ua) || ''} · ${/Windows|Android|iPhone|Mac OS X|Linux/.exec(ua) || ''}`,
      `title: ${document.title} · screen ${screen.width}×${screen.height} @${devicePixelRatio} · window ${innerWidth}×${innerHeight}`,
    ]));
    // what is captured
    const cap = desktop && window.E7Desktop.capture ? window.E7Desktop.capture() : null;
    const ga = readJSON('e7-game-area');
    const vs = window.VisionClient && window.VisionClient.status();
    out.push(section('Capture / game watcher', [
      cap ? `desktop capture: mode=${cap.mode} name="${cap.name}" chosen=${cap.chosen} overlay-tracking=${cap.tracked}` : 'desktop capture: n/a',
      overlayLine(),
      `game area (browser box): ${ga ? short(ga.full ? { full: true, fw: ga.fw, fh: ga.fh } : { box: round(ga), fw: ga.fw, fh: ga.fh }) : 'none'}`,
      `frame keys (which picture boxes were drawn on): ${short(readJSON('e7-frame-of') || {})}`,
      vs ? `watcher: watching=${vs.watching} name="${vs.name}" screen=${vs.screen || '-'} readers=${short((vs.readers || []).map((r) => `${r.id}:${r.ready ? 'ready' : 'no boxes'}${r.note ? ` (${r.note})` : ''}`))}` : 'watcher: no status on this page',
    ]));
    // screens taught
    const screens = readJSON('e7-screens') || [];
    const counts = {};
    for (const r of screens) counts[r.screen] = (counts[r.screen] || 0) + 1;
    out.push(section('Screens taught', [Object.keys(counts).length ? short(counts) : 'none']));
    // RTA: calibration + layout status
    const rta = readJSON('rta-helper-v2');
    if (rta) {
      const a = rta.auto || {};
      const L = window.E7Layouts;
      out.push(section('RTA reader settings', [
        `your boxes: ${Object.keys(a.regions || {}).length ? short(Object.fromEntries(Object.entries(a.regions || {}).map(([k, v]) => [k, round(v)])), 1200) : 'none'}`,
        L ? `part status (16:9 built-in): ${L.status(a.regions || {}, L.LAYOUTS[0]).map((p) => `${p.id}=${p.state}`).join(', ')}` : '',
        `threshold=${a.threshold} interval=${a.intervalMs}ms apply=${a.apply} ocr=${a.ocr} official=${a.useOfficial} corrections=${a.useCorrections} (${(a.corrections || []).length} saved, ${(a.faceCorrections || []).length} faces) autoLearn=${a.autoLearn} postban=${a.detectPostban} result=${a.detectResult} autoCR=${a.autoReadCR}`,
        `matches: ${(rta.matches || []).length} (sources: ${short(Object.keys(rta.matchSources || {}))}) · last 3: ${short((rta.matches || []).slice(0, 3).map((m) => `${m.date || ''} ${m.result || '?'} vs ${m.opponent || '?'} [${m.source}]`))}`,
        `current draft: ${rta.draft ? `${(rta.draft.actions || []).length} actions, first pick ${rta.draft.firstPick}, opponent "${rta.draft.opponent || ''}"` : 'none'}`,
        `settings: autoRecord=${rta.settings && rta.settings.autoRecord}`,
      ]));
    }
    const gear = readJSON('rta-gear-v1');
    if (gear) out.push(section('Gear', [`gear.txt items: ${(gear.items || []).length} (${gear.fileName || '-'}) · screen-read: ${(gear.scanned || []).length} · boxes: ${short(Object.keys(readJSON('e7-gearscan-boxes') || {}))}`]));
    const gw = readJSON('e7-guild-conn');
    out.push(section('Guild War', [gw && gw.guildCode ? `guild set up (${gw.config ? 'Firebase' : 'this device only'}) · name box ${gw.watchBox ? 'set' : 'not set'}` : 'not set up']));
    // page sections (e.g. RTA slots)
    for (const [name, fn] of providers) {
      try {
        out.push(section(name, [].concat(fn() || [])));
      } catch (e) {
        out.push(section(name, ['(could not read: ' + e.message + ')']));
      }
    }
    if (extra) out.push(section('Notes', [String(extra)]));
    // recent watcher events + log
    const ev = readJSON('e7-vision-log') || [];
    out.push(section('Game watcher events (last 25)', ev.slice(-25).map((e) => `${e.at ? new Date(e.at).toISOString().slice(11, 19) : ''} ${e.type} ${short(e.data, 160)}`)));
    const lg = readJSON(KEY) || [];
    out.push(section('Log (last 120)', lg.slice(-120).map((l) => `${l.t.slice(11, 19)}${l.n ? `…${(l.t2 || '').slice(11, 19)} ×${l.n}` : ''} [${l.p}/${l.a}] ${l.m}${l.d ? ' ' + l.d : ''}`)));
    return '# Epic 7 Engine diagnostic report\n(paste this whole block to Claude; it has no sync key, Firebase settings or guild codes)\n\n' + out.join('\n');
  }

  async function copy(extra) {
    const text = report(extra);
    try {
      await navigator.clipboard.writeText(text);
      return { copied: true, text };
    } catch (_) {
      // no clipboard permission: show it so it can be copied by hand
      let d = document.getElementById('diag-dialog');
      if (!d) {
        d = document.createElement('dialog');
        d.id = 'diag-dialog';
        d.className = 'wide-dialog';
        d.innerHTML = '<h3>Diagnostic report</h3><p class="hint">Select all (Ctrl+A) and copy (Ctrl+C), then paste it to Claude.</p><textarea class="full" rows="18" readonly></textarea><div class="btn-row"><span class="spacer"></span><button class="btn" data-close>Close</button></div>';
        document.body.appendChild(d);
        d.addEventListener('click', (e) => e.target.dataset.close !== undefined && d.close());
      }
      d.querySelector('textarea').value = text;
      d.showModal();
      d.querySelector('textarea').select();
      return { copied: false, text };
    }
  }
  // any button with data-diag-copy copies the report
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-diag-copy]');
    if (!b) return;
    const r = await copy();
    if (r.copied) {
      const old = b.textContent;
      b.textContent = 'Copied ✓ now paste it to Claude';
      setTimeout(() => (b.textContent = old), 4000);
    }
  });

  // desktop menu Developer → Copy report for Claude
  if (window.E7Desktop && window.E7Desktop.onHotkey) window.E7Desktop.onHotkey((name) => name === 'copy-report' && copy());

  window.E7Diag = { log, report, copy, provider: (name, fn) => providers.set(name, fn), KEY };
})();
