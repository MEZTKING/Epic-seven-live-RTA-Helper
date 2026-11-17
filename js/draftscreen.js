/*
 * World Arena draft screen: which stage is showing and what has been drafted (DEVLOG #41). Pure (Node + browser).
 * Browser: window.E7Draft. A simplified port of E7DaT's tracker (github.com/ohrgon-game/E7DaT, MIT; e7draft/tracker.py,
 * layout.py), re-written for this app.
 *
 * Stage: the text at the top centre of the draft screen, compared with stored templates (js/sources/draft-labels.js):
 *   "Your Turn" (blue) / "Opponent's Turn" (red)  -> picking, and whose turn it is
 *   "BAN"                                         -> the final ban
 *   "Ready"                                       -> pre-ban (no picks yet / the pre-ban window is open) or formation
 *   no text, "First Pick" under a player card     -> the versus screen: who picks first
 * Picks go 1-2-2-2-2-1 (TURN_SLOTS); the third pick of each side can't be banned (BAN_GUARD_SLOT).
 * My own card being chosen: in the game a hero is not clicked; the one hovered in the list on the right is shown on
 * my card and becomes the pick with Confirm (or when the time is up). Hovered is NOT a pick yet. A confirmed card has a solid blue
 * background (lockScore ≥ LOCK_MIN on two reads); until then it is reported as `held`.
 *
 *   decode(t)                              template from draft-labels.js -> { w, h, v (zero-mean), norm }
 *   matchTemplate(grey, rw, rh, T)         -> { score, x, y } best normalised correlation of T inside the region
 *   tint(rgba, rw, x, y, w, h)             -> { top, tint, rmb } brightness and red-minus-blue of the text
 *   lockScore(rgba, w, h, i)               -> share of "confirmed blue" pixels in my card i's check band
 *   prebanBox(k)                           -> { x, y, w, h } fractions (k 0,1 = mine; 2,3 = the opponent's)
 *   cardLook(rgba, w, h, side)             -> { bright, dark, lum } of the middle of a pick card (the whole card box)
 *   isBannedLook(look)                     -> the card is darkened: banned (formation screen), DEVLOG #63
 *   isEmptyLook(look)                      -> no hero on the card (flat, colourless), DEVLOG #64
 *   new Tracker()  .update(now, obs) -> state     (see Tracker)
 * The battle that follows (top bar: both players and their guilds; DEVLOG #63):
 *   vsFlame(rgba)                          -> share of flame-coloured pixels (the "VS" between the two bars: ~0.20)
 *   battleLine(text, side)                 -> { name, server } from "Global ⊕ Name" ('l') / "Name ⊕ Global" ('r')
 *   guildKey(text), sameGuild(a, b)        -> two guild names read from the same picture are the same guild
 */
(function (root) {
  'use strict';
  const TURN_SLOTS = { 1: ['first', [0]], 2: ['second', [0, 1]], 3: ['first', [1, 2]], 4: ['second', [2, 3]], 5: ['first', [3, 4]], 6: ['second', [4]] };
  const BAN_GUARD_SLOT = 2;
  // pre-ban icons: centres as fractions of the width (E7DaT layout.py), radius as a fraction of the WIDTH: the gold
  // ring measured on the owner's real draft picture (36 px of 1902; E7DaT's 0.0235 is a looser box, with which the
  // face matcher read none of the four; DEVLOG #63)
  const PREBAN = { cx: [0.3146, 0.3585, 0.4169, 0.46], cy: 0.9438, r: 0.0187 };
  const MATCH_MARGIN = 0.015; // search this far around a box (fraction of the width)
  const LABEL_MIN_BRIGHT = 60;
  const LABEL_MIN_TINT = 0.25;
  const LOCK_BAND = [[0.57, 0.64], [0.62, 0.72], [0.57, 0.64], [0.57, 0.64], [0.6, 0.72]];
  const LOCK_MIN = 0.3;
  const LOCK_FRAMES = 2;
  const IDLE_AFTER = 10000; // ms without a stage text -> the draft is over
  const VERSUS_KEEP = 25000;

  function prebanBox(k) {
    const ry = (PREBAN.r * 16) / 9;
    return { x: PREBAN.cx[k] - PREBAN.r, y: PREBAN.cy - ry, w: 2 * PREBAN.r, h: 2 * ry };
  }

  function decode(t) {
    const bin = typeof atob !== 'undefined' ? atob(t.px) : Buffer.from(t.px, 'base64').toString('binary');
    const n = t.w * t.h;
    const v = new Float32Array(n);
    let mean = 0;
    for (let i = 0; i < n; i++) {
      v[i] = bin.charCodeAt(i);
      mean += v[i];
    }
    mean /= n;
    let ss = 0;
    for (let i = 0; i < n; i++) {
      v[i] -= mean;
      ss += v[i] * v[i];
    }
    return { w: t.w, h: t.h, v, norm: Math.sqrt(ss) || 1 };
  }
  /** grey: rw×rh values (0–255). Best zero-mean normalised correlation of template T at any position. */
  function matchTemplate(grey, rw, rh, T) {
    let best = { score: 0, x: 0, y: 0 };
    if (rw < T.w || rh < T.h) return best;
    const n = T.w * T.h;
    for (let y = 0; y <= rh - T.h; y++) {
      for (let x = 0; x <= rw - T.w; x++) {
        let dot = 0;
        let s = 0;
        let s2 = 0;
        for (let ty = 0; ty < T.h; ty++) {
          let p = (y + ty) * rw + x;
          let q = ty * T.w;
          for (let tx = 0; tx < T.w; tx++, p++, q++) {
            const g = grey[p];
            dot += T.v[q] * g;
            s += g;
            s2 += g * g;
          }
        }
        const varr = s2 - (s * s) / n;
        if (varr < 1) continue;
        const sc = dot / (T.norm * Math.sqrt(varr));
        if (sc > best.score) best = { score: sc, x, y };
      }
    }
    return best;
  }
  /** The text's colour inside a w×h patch at (x, y) of an RGBA region rw wide. Text = pixels ≥ 60% of the brightest. */
  function tint(rgba, rw, x, y, w, h) {
    let top = 0;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const p = (yy * rw + xx) * 4;
      top = Math.max(top, rgba[p], rgba[p + 1], rgba[p + 2]);
    }
    let r = 0;
    let b = 0;
    let n = 0;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const p = (yy * rw + xx) * 4;
      if (Math.max(rgba[p], rgba[p + 1], rgba[p + 2]) >= 0.6 * top) {
        r += rgba[p];
        b += rgba[p + 2];
        n++;
      }
    }
    if (top < 1 || n < 10) return { top, tint: 0, rmb: 0 };
    return { top, tint: (r / n - b / n) / top, rmb: r / n - b / n };
  }
  /** A stage text is accepted when it matches well enough and (where the language asks) is brightly red or blue. */
  function acceptLabel(lang, score, t) {
    if (score < lang.labelMin) return false;
    if (lang.labelColor) return t.top >= LABEL_MIN_BRIGHT && Math.abs(t.tint) >= LABEL_MIN_TINT;
    return true;
  }

  /** rgba: my card i (w×h, the whole card box). Share of saturated blue pixels in its check band. */
  function lockScore(rgba, w, h, i) {
    const [a, b] = LOCK_BAND[i] || LOCK_BAND[0];
    const x0 = Math.round(a * w);
    const x1 = Math.round(b * w);
    const y0 = Math.floor(0.1 * h);
    const y1 = Math.floor(0.9 * h);
    let hit = 0;
    let n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const p = (y * w + x) * 4;
        const R = rgba[p];
        const G = rgba[p + 1];
        const B = rgba[p + 2];
        const mx = Math.max(R, G, B);
        const mn = Math.min(R, G, B);
        n++;
        if (mx < 70 || mx === mn) continue;
        const sat = ((mx - mn) / mx) * 255;
        if (sat < 155) continue;
        let hue;
        if (mx === R) hue = ((G - B) / (mx - mn)) * 60;
        else if (mx === G) hue = 120 + ((B - R) / (mx - mn)) * 60;
        else hue = 240 + ((R - G) / (mx - mn)) * 60;
        if (hue < 0) hue += 360;
        if (hue >= 196 && hue <= 232) hit++; // OpenCV hue 98–116
      }
    }
    return n ? hit / n : 0;
  }

  /**
   * rgba: a pick card (w×h, the whole card box; side 'own' | 'enemy'). Brightness of the part every card covers
   * (the cards are slanted and of different widths): share of bright pixels, share of dark ones, mean brightness.
   * Measured on the owner's real screens (DEVLOG #63): a BANNED card on the formation screen has no bright pixels
   * (0.00), 57 % dark ones and a mean of 45–49; a normal card 17–60 % bright; a card that cannot be banned (faded)
   * 1–8 % bright but only 2–3 % dark.
   */
  function cardLook(rgba, w, h, side) {
    const x0 = Math.round((side === 'own' ? 0.1 : 0.45) * w);
    const x1 = Math.round((side === 'own' ? 0.55 : 0.9) * w);
    const y0 = Math.round(0.15 * h);
    const y1 = Math.round(0.85 * h);
    let n = 0;
    let bright = 0;
    let dark = 0;
    let lum = 0;
    let lum2 = 0;
    let sat = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const p = (y * w + x) * 4;
        const l = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
        n++;
        lum += l;
        lum2 += l * l;
        sat += Math.max(rgba[p], rgba[p + 1], rgba[p + 2]) - Math.min(rgba[p], rgba[p + 1], rgba[p + 2]);
        if (l > 150) bright++;
        else if (l < 50) dark++;
      }
    }
    if (!n) return { bright: 0, dark: 0, lum: 0, spread: 0, sat: 0 };
    const m = lum / n;
    return { bright: bright / n, dark: dark / n, lum: m, spread: Math.sqrt(Math.max(0, lum2 / n - m * m)), sat: sat / n };
  }
  const isBannedLook = (k) => !!k && k.bright <= 0.02 && k.dark >= 0.45 && k.lum < 65;
  // An EMPTY card (no hero yet): flat and colourless. Measured on the owner's real screens (DEVLOG #64) as spread /
  // colour: empty cards 8-14 / 0-14, the empty "Ban Protection" placeholder 25-26 / 0-9, an empty card seen a little
  // off its place 23 / 7; cards with a hero: a faded hovered one 31 / 13, a banned one 18-20 / 30-64, all others more.
  // Seen without this: an empty enemy card taken for a hero with a weak score (0.62).
  const isEmptyLook = (k) => !!k && ((k.spread < 16 && k.sat < 16) || (k.spread < 30 && k.sat < 10));

  /**
   * Follows one draft. Feed it what was seen on each look:
   *   obs = { label: 'turn_me' | 'turn_enemy' | 'ban' | 'ready' | null,
   *           prebanPopup: bool, firstPickMarker: 'me' | 'enemy' | null,
   *           slots: { own: [r × 5], enemy: [r × 5] } | null      r = null | { code, sure, lock (own only) }
   *           prebans: [code | null × 4] | null,
   *           prebanPicks: [code | null × 2] | null     the two heroes selected in the pre-ban window (mine, not final)
   *           banned: { own: [bool × 5], enemy: [bool × 5] } | null     cards that look banned }
   * update() returns { stage: 'idle' | 'versus' | 'preban' | 'pick' | 'ban' | 'ready', turn: 'me' | 'enemy' | null,
   *   turnIndex, firstPick: 'me' | 'enemy' | null, own: [5], enemy: [5], prebans: [4], held: { i: code },
   *   bans: { own: code | null (my hero the opponent banned), enemy: code | null (their hero I banned) },
   *   changed, ended (the draft just finished: its last state is in .last) }.
   * A hero is taken when it is read the same twice in a row; taken picks are never removed by a bad read.
   */
  class Tracker {
    constructor() {
      this.last = null;
      this.vsFirst = null;
      this._vs = [null, 0];
      this.reset();
    }
    reset() {
      this.stage = 'idle';
      this.turn = null;
      this.turnIndex = 0;
      this.firstPick = null;
      this.own = [null, null, null, null, null];
      this.enemy = [null, null, null, null, null];
      this.prebans = [null, null, null, null];
      this.held = {};
      this._pend = {};
      this._lock = {};
      this._miss = {};
      this._pb = {};
      this.prePick = [null, null]; // selected in the pre-ban window (shown until the draft's own row is read)
      this._pp = {};
      this.banIdx = { own: null, enemy: null };
      this._bn = {};
      this.lastLabel = 0;
      this._key = '';
    }
    snapshot() {
      // my pre-bans: the draft's own row; a hero selected in the pre-ban window fills a place the row has not given yet
      const pre = [...this.prebans];
      for (const c of this.prePick) {
        if (!c || pre.includes(c)) continue;
        const k = pre[0] ? (pre[1] ? -1 : 1) : 0;
        if (k >= 0) pre[k] = c;
      }
      const bans = { own: this.banIdx.own === null ? null : this.own[this.banIdx.own] || null, enemy: this.banIdx.enemy === null ? null : this.enemy[this.banIdx.enemy] || null };
      return { stage: this.stage, turn: this.turn, turnIndex: this.turnIndex, firstPick: this.firstPick, own: [...this.own], enemy: [...this.enemy], prebans: pre, held: { ...this.held }, bans };
    }
    _settleHeld() {
      for (const [i, code] of Object.entries(this.held)) if (!this.own[i] && !this._has(code)) this.own[i] = code;
      this.held = {};
    }
    _has(code) {
      return this.own.includes(code) || this.enemy.includes(code);
    }
    _anything() {
      return this.own.some(Boolean) || this.enemy.some(Boolean);
    }
    update(now, obs) {
      let ended = false;
      const label = obs.label || null;
      if (!label) {
        // versus screen: who picks first (two looks in a row)
        if ((this.stage === 'idle' || this.stage === 'versus') && obs.firstPickMarker) {
          this._vs = this._vs[0] === obs.firstPickMarker ? [obs.firstPickMarker, this._vs[1] + 1] : [obs.firstPickMarker, 1];
          if (this._vs[1] >= 2) {
            if (this.stage === 'idle') this.reset();
            this.stage = 'versus';
            this.vsFirst = obs.firstPickMarker;
            this.firstPick = this.vsFirst;
            this.lastLabel = now;
          }
        } else if (this.stage !== 'idle' && now - this.lastLabel > (this.stage === 'versus' ? VERSUS_KEEP : IDLE_AFTER)) {
          this._settleHeld();
          if (this._anything()) {
            this.last = this.snapshot();
            ended = true;
          }
          this.reset();
          this.vsFirst = null;
        }
      } else {
        this.lastLabel = now;
        if (this.stage === 'idle' || this.stage === 'versus') {
          const keep = this.stage === 'versus' ? this.vsFirst : null;
          this.reset();
          this.lastLabel = now;
          this.vsFirst = keep;
          this.firstPick = keep;
          this.stage = 'preban';
        }
        if (label === 'ready') {
          if (obs.prebanPopup && this._anything()) {
            // the pre-ban window of a NEW match while an old draft is still held
            this.last = this.snapshot();
            ended = true;
            this.reset();
            this.vsFirst = null;
            this.lastLabel = now;
          }
          this.stage = obs.prebanPopup || !this._anything() ? 'preban' : 'ready';
          if (this.stage === 'ready') this._settleHeld();
          this.turn = null;
        } else if (label === 'ban') {
          this.stage = 'ban';
          this.turn = null;
          this._settleHeld();
        } else {
          const turn = label === 'turn_me' ? 'me' : 'enemy';
          if (this.stage !== 'pick' || turn !== this.turn) {
            this._settleHeld(); // what I was hovering when my turn ended was my pick
            this.turnIndex += 1;
            if (this.turnIndex === 1) {
              if (this.vsFirst && this.vsFirst !== turn) this.turnIndex = 2; // the first turn was missed
              this.firstPick = this.vsFirst || turn;
            }
          }
          this.stage = 'pick';
          this.turn = turn;
        }
      }
      // pick cards (never while the pre-ban window covers them)
      if (obs.slots && !obs.prebanPopup && (this.stage === 'pick' || this.stage === 'ban' || this.stage === 'ready')) {
        for (const side of ['own', 'enemy']) {
          for (let i = 0; i < 5; i++) {
            const r = obs.slots[side][i];
            const key = side + i;
            const cur = this[side][i];
            if (cur) continue;
            const choosing = side === 'own' && this.stage === 'pick' && this.turn === 'me';
            if (choosing) this._lock[i] = r && r.lock ? (this._lock[i] || 0) + 1 : 0;
            if (!r || !r.sure || !r.code) {
              delete this._pend[key];
              if (side === 'own' && this.held[i]) {
                this._miss[i] = (this._miss[i] || 0) + 1;
                if (this._miss[i] >= 3) delete this.held[i]; // I moved off it
              }
              continue;
            }
            delete this._miss[i];
            if (this._pend[key] !== r.code) {
              this._pend[key] = r.code; // once more the same, then it counts
              continue;
            }
            if (this._has(r.code)) continue; // already on another card: a misread
            if (choosing && (this._lock[i] || 0) < LOCK_FRAMES) {
              for (const k of Object.keys(this.held)) if (this.held[k] === r.code && +k !== i) delete this.held[k];
              this.held[i] = r.code; // hovered, not confirmed yet
            } else {
              this[side][i] = r.code;
              if (side === 'own') delete this.held[i];
            }
          }
        }
      }
      // pre-ban icons
      if (obs.prebans && this.stage !== 'idle' && this.stage !== 'versus') {
        obs.prebans.forEach((code, k) => {
          if (this.prebans[k] || !code) return;
          if (this._pb[k] === code) this.prebans[k] = code;
          else this._pb[k] = code;
        });
      }
      // the two heroes selected in the pre-ban window: not final (the selection can change until the time is up), so
      // each look replaces the last; the same answer twice counts, "nothing there" twice clears
      if (obs.prebanPicks && this.stage === 'preban') {
        obs.prebanPicks.forEach((code, k) => {
          if (this._pp[k] === (code || null)) this.prePick[k] = code || null;
          this._pp[k] = code || null;
        });
        if (this.prePick[0] && this.prePick[0] === this.prePick[1]) this.prePick[1] = null;
      }
      // banned cards on the formation screen: exactly one darkened card on a side, its hero known, twice in a row.
      // (During the BAN stage a dark card is only the one I am choosing, not final.) The third pick cannot be banned.
      if (obs.banned && this.stage === 'ready') {
        for (const side of ['own', 'enemy']) {
          if (this.banIdx[side] !== null) continue;
          const hits = [];
          (obs.banned[side] || []).forEach((b, i) => b && hits.push(i));
          const i = hits.length === 1 && hits[0] !== BAN_GUARD_SLOT && this[side][hits[0]] ? hits[0] : null;
          if (i !== null && this._bn[side] === i) this.banIdx[side] = i;
          this._bn[side] = i;
        }
      }
      const snap = this.snapshot();
      const key = JSON.stringify(snap);
      const changed = key !== this._key;
      this._key = key;
      return { ...snap, changed, ended, last: ended ? this.last : null };
    }
  }

  // ---- the battle's top bar ----------------------------------------------------------------------------------------
  /** Share of flame-coloured pixels (orange-red, saturated) in an RGBA block: the "VS" sign gives about 0.20. */
  function vsFlame(rgba) {
    let hit = 0;
    const n = rgba.length / 4;
    for (let p = 0; p < rgba.length; p += 4) {
      const R = rgba[p];
      const G = rgba[p + 1];
      if (R > 200 && G > 50 && G < 200 && rgba[p + 2] < 110 && R - G > 50) hit++;
    }
    return n ? hit / n : 0;
  }
  const SERVERS = ['global', 'asia', 'europe', 'korea', 'japan'];
  const isServer = (w) => SERVERS.includes(String(w || '').toLowerCase().replace(/[^a-z]/g, ''));
  /**
   * One player's line of the battle's top bar. Left player: "<server> <globe> <name>", right: "<name> <globe> <server>".
   * The globe is read as some sign; a nickname has no spaces. -> { name, server } ('' when not read).
   */
  function battleLine(text, side) {
    const words = String(text || '').replace(/[|\[\]{}<>]/g, ' ').trim().split(/\s+/).filter(Boolean);
    const si = side === 'l' ? words.findIndex(isServer) : words.map(isServer).lastIndexOf(true);
    const server = si >= 0 ? words[si].replace(/[^A-Za-z]/g, '') : '';
    // the name: the word furthest from the server that has at least two letters or digits
    const rest = (si >= 0 ? (side === 'l' ? words.slice(si + 1) : words.slice(0, si)) : words).filter((w) => (w.match(/[\p{L}\p{N}]/gu) || []).length >= 2);
    const name = (side === 'l' ? rest[rest.length - 1] : rest[0]) || '';
    return { name: name.replace(/^[^\p{L}\p{N}_]+|[^\p{L}\p{N}_]+$/gu, ''), server };
  }
  /** A guild name for comparing: letters and digits only, lower case; words of one sign (the emblem's leftovers) dropped. */
  const guildKey = (text) =>
    String(text || '')
      .split(/\s+/)
      .filter((w) => (w.match(/[\p{L}\p{N}]/gu) || []).length >= 2)
      .join('')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, '');
  /**
   * left = the guild read under my name, right = under the opponent's; both from the same picture in the same
   * lettering. The same guild when the same text (three signs or more). Something next to a name can be read along
   * (seen: an open emoji window left of mine added "Rh" in front of the guild name), always on the OUTER side, so a name of four signs
   * or more also counts when the other reading only has up to three more signs on its outer end.
   */
  function sameGuild(left, right) {
    const x = guildKey(left);
    const y = guildKey(right);
    if (x.length >= 3 && x === y) return true;
    if (y.length >= 4 && x.endsWith(y) && x.length - y.length <= 3) return true;
    return x.length >= 4 && y.startsWith(x) && y.length - x.length <= 3;
  }

  /** The tracker's picks as the app's "board" (js/logic.js boardToDraft). */
  function toBoard(st) {
    const cut = (a) => {
      const out = [];
      for (const c of a) {
        if (!c) break; // picks fill in order; stop at the first card not read
        out.push(c);
      }
      return out;
    };
    return {
      prebans: { me: st.prebans.slice(0, 2).filter(Boolean), opp: st.prebans.slice(2, 4).filter(Boolean) },
      picks: { me: cut(st.own), opp: cut(st.enemy) },
      // postbans.me = the enemy hero I banned; postbans.opp = my hero the opponent banned (js/logic.js)
      postbans: { me: st.bans && st.bans.enemy ? [st.bans.enemy] : [], opp: st.bans && st.bans.own ? [st.bans.own] : [] },
      firstPick: st.firstPick === 'enemy' ? 'opp' : st.firstPick === 'me' ? 'me' : null,
    };
  }

  const api = { TURN_SLOTS, BAN_GUARD_SLOT, PREBAN, MATCH_MARGIN, LOCK_BAND, LOCK_MIN, LOCK_FRAMES, IDLE_AFTER, VERSUS_KEEP, prebanBox, decode, matchTemplate, tint, acceptLabel, lockScore, cardLook, isBannedLook, isEmptyLook, vsFlame, battleLine, guildKey, sameGuild, Tracker, toBoard };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7Draft = api;
})(typeof self !== 'undefined' ? self : this);
