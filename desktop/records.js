/*
 * Official record site transport (DEVLOG #44), main process only. Pages reach it through preload
 * (E7Desktop.records) -> ipc 'e7:records'.
 *
 * It makes the lookups the site's own page (epic7.onstove.com/gg) makes, the way E7DaT does (api.py):
 *   POST https://e7api.onstove.com/gameApi/<name>?<params>   with Origin / Referer of the site
 *   GET  https://static-pubcomm.onstove.com/gameRecord/epic7/epic7_user_<world>.json   (name -> player number)
 * Rules kept here, not in pages:
 *   - only the four lookups in ALLOWED, only plain parameters
 *   - ONE request at a time, at least INTERVAL ms apart; 429 / 5xx / network errors wait and retry (max 5 tries)
 *   - the name lists (4–17 MB per server) are kept on disk for 3 days
 * Nothing is sent except the lookup itself: a season code, a page number, a player NUMBER and server. A player's NAME is
 * looked up in the downloaded list on this PC, never sent.
 *
 *   const rec = create({ dir, request?, interval?, base?, userUrl? })
 *   rec.game(name, params) -> value object ({} on a refusal)      rec.find(world, name) -> [{ nickNo, world, name, rank }]
 *   rec.status() -> { calls, lastError, queued }
 */
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE = 'https://e7api.onstove.com/gameApi/';
const USER_URL = (world) => `https://static-pubcomm.onstove.com/gameRecord/epic7/epic7_user_${world}.json`;
const ALLOWED = new Set(['getSeasonList', 'getWorldUserRankingDetail', 'getBattleList', 'getPopularHero']);
const WORLDS = new Set(['world_global', 'world_eu', 'world_asia', 'world_kor', 'world_jpn', 'all']);
const INTERVAL = 350;
const USERS_KEEP_MS = 3 * 86400000;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Epic7Engine',
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://epic7.onstove.com',
  Referer: 'https://epic7.onstove.com/',
};

/** One HTTP(S) request -> { status, body (Buffer) }. */
function request(method, url, timeout = 25000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('http://') ? http : https;
    const req = lib.request(url, { method, headers: { ...HEADERS, ...(method === 'POST' ? { 'Content-Length': 0 } : {}) }, timeout }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
    req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function create(opts = {}) {
  const dir = opts.dir || null;
  const send = opts.request || request;
  const interval = opts.interval === undefined ? INTERVAL : opts.interval;
  const base = opts.base || BASE;
  const userUrl = opts.userUrl || USER_URL;
  const wait = opts.sleep || sleep;
  let chain = Promise.resolve();
  let last = 0;
  const st = { calls: 0, lastError: '', queued: 0 };

  /** Run jobs strictly one after another, spaced out. */
  function queue(job) {
    st.queued++;
    const run = chain.then(async () => {
      const gap = interval - (Date.now() - last);
      if (gap > 0) await wait(gap);
      try {
        return await job();
      } finally {
        last = Date.now();
        st.queued--;
      }
    });
    chain = run.catch(() => {});
    return run;
  }
  async function call(method, url, timeout) {
    let err = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      st.calls++;
      let r;
      try {
        r = await send(method, url, timeout);
      } catch (e) {
        err = e;
        await wait(interval ? Math.min(30000, 1000 * 2 ** attempt) : 0);
        continue;
      }
      if (r.status === 404) return null;
      if (r.status === 429 || r.status >= 500) {
        err = new Error(`HTTP ${r.status}`);
        await wait(interval ? Math.min(60000, 5000 * (attempt + 1)) : 0);
        continue;
      }
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      return r.body;
    }
    st.lastError = String((err && err.message) || err || 'failed');
    throw new Error(`The record site didn't answer (${st.lastError}).`);
  }

  /** One of the site's lookups. Returns its "value" object, or {} when the site refuses. */
  function game(name, params = {}) {
    if (!ALLOWED.has(name)) return Promise.reject(new Error('That lookup is not allowed.'));
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
      if (!/^[a-z_]{1,24}$/i.test(k) || !['string', 'number'].includes(typeof v) || String(v).length > 40) return Promise.reject(new Error('Bad lookup parameter.'));
      q.set(k, String(v));
    }
    if (!q.has('lang')) q.set('lang', 'en');
    return queue(async () => {
      const body = await call('POST', `${base}${name}?${q}`);
      if (!body) return {};
      let j;
      try {
        j = JSON.parse(body.toString('utf8').replace(/^﻿/, ''));
      } catch (_) {
        return {};
      }
      return j && j.code === 0 ? j.value || {} : {};
    });
  }

  // ---- name -> player number (downloaded list, kept 3 days) ----------------------------------------------------------
  const lists = new Map(); // world -> Map(lower name -> [{ nickNo, name, rank }])
  async function users(world) {
    if (!WORLDS.has(world) || world === 'all') throw new Error('Unknown server.');
    if (lists.has(world)) return lists.get(world);
    const file = dir ? path.join(dir, `users_${world}.json`) : null;
    let text = null;
    try {
      if (file && Date.now() - fs.statSync(file).mtimeMs < USERS_KEEP_MS) text = fs.readFileSync(file, 'utf8');
    } catch (_) { /* not there yet */ }
    if (!text) {
      const body = await queue(() => call('GET', userUrl(world), 120000));
      if (!body) throw new Error('The player list of that server is not available.');
      text = body.toString('utf8').replace(/^﻿/, '');
      try {
        if (file) {
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(file, text);
        }
      } catch (_) { /* only a cache */ }
    }
    const m = new Map();
    let j = {};
    try {
      j = JSON.parse(text);
    } catch (_) { /* a broken file is treated as empty */ }
    for (const u of j.users || []) {
      if (!u || !u.nick_nm) continue;
      const k = String(u.nick_nm).toLowerCase();
      const e = { nickNo: Number(u.nick_no) || 0, name: String(u.nick_nm), rank: Number(u.rank) || 0 };
      if (m.has(k)) m.get(k).push(e);
      else m.set(k, [e]);
    }
    lists.set(world, m);
    return m;
  }
  /** Players with exactly this name (letter case ignored) on that server; highest account rank first. */
  async function find(world, name) {
    const n = String(name || '').trim().toLowerCase();
    if (!n || n.length > 40) return [];
    const m = await users(world);
    return (m.get(n) || []).map((u) => ({ ...u, world })).sort((a, b) => b.rank - a.rank).slice(0, 5);
  }
  return { game, find, status: () => ({ ...st }), ALLOWED: [...ALLOWED] };
}

module.exports = { create, request, BASE, USER_URL, INTERVAL };
