/*
 * The inventory's "Full" display format (DEVLOG #77): every tile shows the item's main stat and its substats as an
 * ICON + a number, so a whole screen of items can be read without clicking each one. Pure (Node + browser).
 * Browser: window.E7GearGrid. The watcher side is js/vision/readers/gear-grid.js.
 *
 * Measured on the owner's 2000×1070 pictures (Full format, weapons, two sort orders). Positions are in pixels of a
 * picture 1070 high, x from the LEFT edge of the window (the inventory list is pinned left; centred is tried too):
 *   column k: icons x 361 + 254k (32 wide), numbers x 393 + 254k (70 wide)
 *   row: the main stat's line (white) at y; substats at y + 35.5 / 66 / 96 / 127; rows 191.3 apart (they scroll, so the
 *   reader finds each row by its white main-stat line)
 *   on the item picture: enhance badge (300, y-28, 58, 26), the level's 2nd digit (251, y-7, 15, 19), set badge
 *   (311, y+57, 44, 46), hero portrait (worn) centre (248, y+80) r 29, lock (222, y-32, 26, 26), picture (227, y-15, 120, 60),
 *   pictures kept with each item (DEVLOG #78): the item (220, y-26, 136, 134), the whole tile (216, y-29, 256, 178)
 *   the selected tile's gold frame: its top edge, a 1-px line at y-28 over x 230..330 (0.9 gold on the owner's picture;
 *   its left edge at x 217 is no use: the frame of the tile before ends at x 471, where the next tile's left edge is)
 *
 * The eight stat icons (attack, health, defense, speed, crit chance, crit damage, effectiveness, resistance) are kept
 * as 16×14 grey templates (zero mean, unit length): the mean of every example on the owner's pictures (defense from
 * the Standard format's tiles, the same icon). Measured: every example nearest its own icon by 0.15 or more.
 *
 *   GEO, LINE_OFF                       positions (see above)
 *   ICONS                               { Attack: Float32Array, … }
 *   iconVector(grey16x14)               -> zero mean, unit length
 *   classifyIcon(vec)                   -> { stat, score, lead }
 *   sureIcon(r)                         -> bool (score >= 0.6 and lead >= 0.08)
 *   mainRows(counts, scale)             -> [y]  centres of the white main-stat lines (counts[y] = white pixels per row)
 *   statFrom(icon, text)                -> { type, value } | null   ("6%" with the sword -> AttackPercent 6)
 *   levelFrom(digit, main, enhance)     -> 85 | 88 | 90   (a +15 weapon / helmet's main stat, else the level's 2nd digit)
 *   levelFromMain(main, enhance)        -> 85 | 88 | 90 | null   (the main-stat rule alone; also used by the item panel)
 *   rankFrom(nSubs)                     -> 'Epic' | 'Heroic'  (4 substats = Epic; a Heroic item at +12 or more counts as Epic)
 *   badgePrint(rgba)                    -> fingerprint of a set badge (12×12 colour)
 *   badgeSet(list, fp)                  -> { set, sim } | null    list: [{ set, fp }]
 *   learnBadge(list, set, fp)           -> new list (at most 6 per set)
 */
(function (root) {
  'use strict';
  const GEO = {
    colX: 361, colStep: 254, iconW: 32, valueX: 393, valueW: 70, lineH: 28, rowStep: 191.3,
    badge: [300, -28, 58, 26], level2: [251, -7, 15, 19], set: [311, 57, 44, 46], portrait: [248, 80, 29],
    lock: [222, -32, 26, 26], picture: [227, -15, 120, 60], frame: [230, -31, 100, 6], icon: [220, -26, 136, 136], tile: [216, -29, 256, 178],
  };
  const LINE_OFF = [0, 35.5, 66, 96, 127];
  const ICON_W = 16;
  const ICON_H = 14;
  const B64 = {
    Attack: '5ufn5+jo6Onp6ejn6O/z6ebn5+jo6Onp6ejp8gchG/Pm5+fo6Ojo6OfsCS9JTBvu5ufn5+jo6OftEUJZXj8C6Obn5+fo6OfuFEFKUVIj7+jm5ubn5+bvFkA7NEg3Aujo5ubt9+vtFDYuJDo3C+zo6ebpBRsCAyglDzE4Dezn6enm6AgtJiEzJRozEe3n6Onp5uXwHEVQUiYaEu7n6enp6ebm5glMWlUfBvHn6Onp6enm5e0aPzs+JQLp5+np6enp5uYAJhcMHicN6+fp6enp6eXsDw3v6fYQEO7n6enp6ek=',
    Speed: '5OXl5eTr/QEA9Obm5ufn5+Tl5eXk8BwzNSL35ubm5ubk5eXl5ef8K0E+IPPl5ubm5OXl5PEC7AMyQj0Z7+Xm5uTl5OcNLgjtCjVCOxPr5ebk5Oj9LUAxBO4QOEI3DOrl5OYCKkBDQSv47h5AQjH+5eTl/CM+Q0Am9vUlQEEp+OXk5OX3KEAt/vMdPUIwAObl5OTk5ggqA/AWO0I0COjl5uTk5OTu/O4POkI3Derl5ufk5OXk4+gHM0E6E+zl5ufn5OTl5eTvFSUlEu/l5ubm5uTk5eXk5u3v7+rl5ebm5uY=',
    CriticalHitChance: '5ubm5ufl6+nm5+fn5ujp5ebm5ubm5QQJ6Obm6PQRCObm5ubl5+QFORLv+Bc/UBDm5ubm6wQAF0sxBzdbbEXz5ebm5ekNOkof9P88SV8a5ubm5ubk6yo47+cPNzk9+OTn5ubl7QU5IeoOORYBBuzl5ubm5f8iQiAROxjq6R0O5uXm5uTp7wUiOhvt6AlLOgTo5ubm5OcMOyQRDR5HMRMO7ebm5egLORkBPEo4SAvl6OXl5ecKORvr6CAj9xYQ5eTk5eT/Nxrr5OP/+OPs9OPl5eTj/RLt4+Xj5eXk5OPk5eU=',
    CriticalHitDamage: '6erq6urq6u0F9+rp6ejp6+np6urp6PMILCAG9wHz6Ovp6erq6en7DxkvQz8v+Onr6enp6ery+/j1/SdWJu3q6+jp6Pb4+u7q6un9RjT26uro6PEOB/Dp6+vp90NXLf3p5+sTKgnr6uvr6gRPUSX56ejpBjUO6urq6vMtVh7w6ero6O8yL/br7PglWEf96erq6ejsKVQxGB46WWNL/unq6uno+DE7RlZaTTg/Sg3q6urp5/P/9QZESQ7z9wr+6erq6enp6enrDxHs6enq6unq6urq6urq6ezs6erq6urq6uo=',
    EffectResistance: '4eLi4+Lj4+Tm4+Pj4+Tj4+Hi4uLm8fLx/O727OTj4+Pi4uHrBw73ABf0BBD55OLj4uHqERr06hgz++oIIPzj4uHiCCz+5gM5Rh/u6hsk7uHg6iUl8wMySUpBGvQGNAXi3/AzKhw3SUtLSkIpGzkU4t/wMysgOkhLS0pDLB45FOPg6iYj8wg1SUpCH/cFMwbi4eMKK/rmBztHI/DoFyXv4eHh6xQX8eobNv3oAyD+4uLi4eHsCQvzAhry/xH75OLi4eLi4ef08/H97vft4uHi4uHi4uLi4uLk5uPj4uLi4uI=',
    Effectiveness: '3Nri49ra3urv69/a2uPi2tza9xr49A8gJiER9vUa/drc2ucpQC4UAP3+Dys/MOza3NraDEtACxEbEwk7TRbd2tza5CAWM0IfCBpAOBIi69rc2vwi9Ccf89rtGiv1Hgfa29sOHvko7NrX2eck/xMT29vaDx35KOza19rnI/8SE9vb2v4i9Ccg89nuGyv0HAfa3NrlHxQ0QxwBFkA5DyLs2tva2g1KPw0SGxQLOUwX3drb2ucpQSsN/fv8CSg/MO3a29r2Gfj1EyEiIhb49Bn829va4OLa2uDq7uvh2tri4do=',
    Health: '4OHh4ODh4eHh4eHh4ODh4eDg4OP0BP7r4ev9BPfk4OHh4OMAISwpFPQMJywjBeTg4ODyITAxMS0VCiMuMCX34ODgAywxMTExKgf6GS8tBuDg4AIsMTExMS4O6wwuLQXg4ODyIjAxMTExJRQkMCf34ODg5A0tMTExMTEvMC8T5+Dh4ODwHDAxMTExMTAg9ODh4OHg4fkiMDExMTAm/uLh4eDh4eDj/iMwMTAmAuXg4eLg4OHh4OP8IC4jAeXh4eLi4OHh4eHg4vYP+uTh4uLi4uHh4eHh4eDh5uLh4uLi4uI=',
    Defense: '5uPk6OPr9ezh5e/i2+Da2ODg9Q79CSUXCRkqB/sR8tnZ3AopGxYXDwsSGxkhMwza2NwXGPXu8v0F//Pw+B0T29jdGwjqGSkxNTEqG/ELE9vY3RoJ8zM+Pz8/PzT8DRPb2NsRC/EvPj8/Pz8x9REP2tjZ/xTyIj0/Pj89JvIU/tnZ2O0e+Ag3Pj8/OAv6G+rX2djdDBHxGDg+OhzzEAjc2NnZ2OwYAvAQJhPxBBbq19nY2djZ9hkE7e7uBBjz2djZ2NjZ2Nr2GRcJFxfz2dfY2NjY2NjX2e8RJBDt2NfY2Ng='

  };
  const decode = (s) => {
    const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
    const v = new Float32Array(bin.length);
    for (let i = 0; i < bin.length; i++) v[i] = ((bin.charCodeAt(i) << 24) >> 24) / 508;
    return iconVector(v);
  };
  function iconVector(g) {
    const n = g.length;
    let m = 0;
    for (let i = 0; i < n; i++) m += g[i];
    m /= n;
    const v = new Float32Array(n);
    let ss = 0;
    for (let i = 0; i < n; i++) {
      v[i] = g[i] - m;
      ss += v[i] * v[i];
    }
    const k = 1 / (Math.sqrt(ss) || 1);
    for (let i = 0; i < n; i++) v[i] *= k;
    return v;
  }
  const ICONS = {};
  for (const [k, s] of Object.entries(B64)) ICONS[k] = decode(s);
  function classifyIcon(vec) {
    let best = null;
    let second = -1;
    for (const [stat, t] of Object.entries(ICONS)) {
      let s = 0;
      for (let i = 0; i < t.length; i++) s += t[i] * vec[i];
      if (!best || s > best.score) {
        if (best) second = Math.max(second, best.score);
        best = { stat, score: s };
      } else second = Math.max(second, s);
    }
    return { stat: best.stat, score: Math.round(best.score * 1000) / 1000, lead: Math.round((best.score - second) * 1000) / 1000 };
  }
  const sureIcon = (r) => !!r && r.score >= 0.6 && r.lead >= 0.08;

  /** Centres of the white main-stat lines: runs of at least 6 rows (at 1070 high) with 4+ white pixels. */
  function mainRows(counts, scale = 1) {
    const minRun = Math.max(3, Math.round(6 * scale));
    const minPx = Math.max(2, Math.round(4 * scale));
    const out = [];
    let start = -1;
    for (let y = 0; y <= counts.length; y++) {
      const on = y < counts.length && counts[y] >= minPx;
      if (on && start < 0) start = y;
      if (!on && start >= 0) {
        if (y - start >= minRun && y - start <= 40 * scale) out.push((start + y - 1) / 2);
        start = -1;
      }
    }
    return out;
  }

  const ALWAYS_PCT = { CriticalHitChance: 1, CriticalHitDamage: 1, Effectiveness: 1, EffectResistance: 1 };
  // the smallest FLAT value each can have (a substat's first roll; main stats are bigger): below = a lost "%"
  const FLAT_MIN = { Attack: 25, Health: 100, Defense: 20 };
  function statFrom(icon, text) {
    const t = String(text || '').replace(/[oO]/g, '0').replace(/(\d),(\d)/g, '$1$2');
    const m = t.match(/\d+/);
    if (!icon || !m) return null;
    const value = parseInt(m[0], 10);
    if (!(value > 0)) return null;
    if (icon === 'Speed') return value <= 50 ? { type: 'Speed', value } : null;
    if (ALWAYS_PCT[icon]) return value <= 80 ? { type: icon + 'Percent', value } : null;
    const pct = /%/.test(t) || value < FLAT_MIN[icon];
    if (pct) return value <= 70 ? { type: icon + 'Percent', value } : null;
    return { type: icon, value };
  }
  // a +15 weapon / helmet's main stat tells the level exactly (the level's digits are often under the lock):
  // attack 500 / 515 / 525, health 2700 / 2765 at level 85 / 88 / 90 (the owner's items)
  const MAIN_LEVEL = { Attack: { 500: 85, 515: 88, 525: 90 }, Health: { 2700: 85, 2765: 88 } };
  const levelFromMain = (main, enhance) => (enhance === 15 && main && MAIN_LEVEL[main.type] && MAIN_LEVEL[main.type][main.value]) || null;
  function levelFrom(d, main, enhance) {
    return levelFromMain(main, enhance) || { 5: 85, 8: 88, 0: 90 }[String(d || '').replace(/\D/g, '').slice(-1)] || 85;
  }
  // (the picture's colour is no help: the art covers it; a teal bow looked "rare")
  const rankFrom = (nSubs) => (nSubs >= 4 ? 'Epic' : 'Heroic');

  const BADGE = 12;
  function badgePrint(rgba) {
    const n = BADGE * BADGE;
    const v = new Array(n * 3);
    const mean = [0, 0, 0];
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) mean[c] += rgba[i * 4 + c] / n;
    // colour matters (sets share shapes, not colours): only the overall brightness is taken out
    const mm = (mean[0] + mean[1] + mean[2]) / 3;
    let ss = 0;
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
      const x = rgba[i * 4 + c] - mm;
      v[i * 3 + c] = x;
      ss += x * x;
    }
    const k = 1 / (Math.sqrt(ss) || 1);
    return v.map((x) => Math.round(x * k * 10000) / 10000);
  }
  const dot = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  };
  function badgeSet(list, fp) {
    let best = null;
    for (const e of list || []) {
      if (!e.fp || e.fp.length !== fp.length) continue;
      const s = dot(e.fp, fp);
      if (!best || s > best.sim) best = { set: e.set, sim: s };
    }
    return best && best.sim >= 0.9 ? { set: best.set, sim: Math.round(best.sim * 100) / 100 } : null;
  }
  function learnBadge(list, set, fp) {
    const out = (list || []).slice();
    if (!set || !fp) return out;
    // already known this way: nothing to add
    if (out.some((e) => e.set === set && dot(e.fp, fp) >= 0.97)) return out;
    out.push({ set, fp });
    const mine = out.filter((e) => e.set === set);
    if (mine.length > 6) out.splice(out.indexOf(mine[0]), 1);
    return out;
  }

  const api = { GEO, LINE_OFF, ICON_W, ICON_H, ICONS, BADGE, iconVector, classifyIcon, sureIcon, mainRows, statFrom, levelFrom, levelFromMain, rankFrom, badgePrint, badgeSet, learnBadge };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7GearGrid = api;
})(typeof self !== 'undefined' ? self : this);
