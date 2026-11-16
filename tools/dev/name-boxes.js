#!/usr/bin/env node
/*
 * Where the player names are on a fortress-map screenshot (for tools/dev/redact-gw-screens.py, which replaces them
 * with made-up names before a screenshot goes into the public repository). Uses the app's own code.
 *   node tools/dev/name-boxes.js <file.rgba> <width> <height>     (raw RGBA pixels of the GAME picture, no title bar)
 * Prints JSON: [{ x0, y0, x1, y1, keep }] in pixels: the box around the letters of each name.
 */
const fs = require('fs');
const path = require('path');
const G = require(path.join(__dirname, '..', '..', 'js', 'gwmap.js'));
const L = require(path.join(__dirname, '..', '..', 'js', 'layouts.js'));
const [file, w, h] = process.argv.slice(2);
const W = +w;
const H = +h;
const rgba = new Uint8ClampedArray(fs.readFileSync(file));
const lay = L.layoutFor(W, H);
const kr = lay.regions.gwKeepName;
const boxes = [...G.findBadges(rgba, W, H).map((b) => ({ ...G.nameBox(b, H), keep: false })), { x: kr.x * W, y: kr.y * H, w: kr.w * W, h: kr.h * H, keep: true }];
const out = [];
for (const b of boxes) {
  const x0 = Math.max(0, Math.round(b.x));
  const y0 = Math.max(0, Math.round(b.y));
  const bw = Math.min(W - x0, Math.round(b.w));
  const bh = Math.min(H - y0, Math.round(b.h));
  const crop = new Uint8ClampedArray(bw * bh * 4);
  for (let y = 0; y < bh; y++) crop.set(rgba.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + bw) * 4), y * bw * 4);
  const n = G.nameLetters(crop, bw, bh, {});
  out.push(n ? { x0: x0 + n.span[0], x1: x0 + n.span[1], y0: y0 + n.band[0], y1: y0 + n.band[1], keep: b.keep } : { x0, x1: x0 + bw, y0, y1: y0 + bh, keep: b.keep, none: true });
}
console.log(JSON.stringify(out));
