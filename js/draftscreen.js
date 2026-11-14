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
 * My own card being chosen: a hero only clicked (hovered) is NOT a pick yet. A confirmed card has a solid blue
 * background (lockScore ≥ LOCK_MIN on two reads); until then it is reported as `held`.
 *
 *   decode(t)                              template from draft-labels.js -> { w, h, v (zero-mean), norm }
 *   matchTemplate(grey, rw, rh, T)         -> { score, x, y } best normalised correlation of T inside the region
 *   tint(rgba, rw, x, y, w, h)             -> { top, tint, rmb } brightness and red-minus-blue of the text
 *   lockScore(rgba, w, h, i)               -> share of "confirmed blue" pixels in my card i's check band
 *   prebanBox(k)                           -> { x, y, w, h } fractions (k 0,1 = mine; 2,3 = the opponent's)
 *   new Tracker()  .update(now, obs) -> state     (see Tracker)
 */
(function (root) {
  'use strict';
  const TURN_SLOTS = { 1: ['first', [0]], 2: ['second', [0, 1]], 3: ['first', [1, 2]], 4: ['second', [2, 3]], 5: ['first', [3, 4]], 6: ['second', [4]] };
  const BAN_GUARD_SLOT = 2;
  // pre-ban icons: centres as fractions of the width, radius as a fraction of the WIDTH (E7DaT layout.py)
  const PREBAN = { cx: [0.3146, 0.3585, 0.4169, 0.46], cy: 0.9438, r: 0.0235 };
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
   * Follows one draft. Feed it what was seen on each look:
   *   obs = { label: 'turn_me' | 'turn_enemy' | 'ban' | 'ready' | null,
   *           prebanPopup: bool, firstPickMarker: 'me' | 'enemy' | null,
   *           slots: { own: [r × 5], enemy: [r × 5] } | null      r = null | { code, sure, lock (own only) }
   *           prebans: [code | null × 4] | null }
   * update() returns { stage: 'idle' | 'versus' | 'preban' | 'pick' | 'ban' | 'ready', turn: 'me' | 'enemy' | null,
   *   turnIndex, firstPick: 'me' | 'enemy' | null, own: [5], enemy: [5], prebans: [4], held: { i: code },
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
      this.lastLabel = 0;
      this._key = '';
    }
    snapshot() {
      return { stage: this.stage, turn: this.turn, turnIndex: this.turnIndex, firstPick: this.firstPick, own: [...this.own], enemy: [...this.enemy], prebans: [...this.prebans], held: { ...this.held } };
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
            this._settleHeld(); // what I had clicked when my turn ended was my pick
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
                if (this._miss[i] >= 3) delete this.held[i]; // I un-clicked it
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
              this.held[i] = r.code; // clicked, not confirmed yet
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
      const snap = this.snapshot();
      const key = JSON.stringify(snap);
      const changed = key !== this._key;
      this._key = key;
      return { ...snap, changed, ended, last: ended ? this.last : null };
    }
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
      postbans: {},
      firstPick: st.firstPick === 'enemy' ? 'opp' : st.firstPick === 'me' ? 'me' : null,
    };
  }

  const api = { TURN_SLOTS, BAN_GUARD_SLOT, PREBAN, MATCH_MARGIN, LOCK_BAND, LOCK_MIN, LOCK_FRAMES, IDLE_AFTER, VERSUS_KEEP, prebanBox, decode, matchTemplate, tint, acceptLabel, lockScore, Tracker, toBoard };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.E7Draft = api;
})(typeof self !== 'undefined' ? self : this);
