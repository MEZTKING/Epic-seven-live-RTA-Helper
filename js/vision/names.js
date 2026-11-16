/*
 * Reading ONE player name from the game picture, in any script (DEVLOG #56). Shared by the fortress-map reader and the
 * enemy-screen reader; runs next to the game watcher (needs a reader's ctx for the text reader).
 *
 *   E7Names.read(ctx, canvas, box, { lang, world, offerOnly }) -> null (nothing there) or
 *     { name, raw, known, official, options: [other spellings], lang, pic }
 *   offerOnly: official spellings are only offered (options), never put in place of the reading (when it is not known
 *   whose server the player is on)
 *
 * Steps:
 *   1. the letters of the name without scenery: G.nameLetters, once "loose" (short strokes and dashes may join at the
 *      ends) and, when that gives another cut, once "tight"
 *   2. each cut is read in English and in the script of that server (lang: 'jpn' | 'kor' | 'chi_tra'); a reading
 *      with Chinese characters in it is also read with Simplified Chinese data (a Chinese name on a Japanese server);
 *      without a server language and with a poor English reading, the other scripts are tried
 *   3. G.pickRead chooses; names already in the war and corrections made before win
 *   4. the server's own player list (desktop app, searched on this PC) is asked for names close to each candidate:
 *      one clearly closest player -> that spelling ("official"); the rest are offered as options
 *   5. pic: the name as the game shows it (small JPEG), so anyone can compare by eye
 */
(function () {
  'use strict';
  const G = window.E7GWMap;
  if (!G) return;
  const OTHER_LANGS = ['jpn', 'kor', 'chi_tra'];
  const readJSON = (k, d) => {
    try {
      return JSON.parse(localStorage.getItem(k) || 'null') || d;
    } catch (_) {
      return d;
    }
  };

  /** Black-on-white picture of the letters (96 px high + margin) for one cut, or null. Also returns the cut. */
  function cut(src, box, tight) {
    const H = 96;
    const W = Math.max(8, Math.round((box.w * H) / box.h));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingQuality = 'high';
    x.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, W, H);
    const L = G.nameLetters(x.getImageData(0, 0, W, H).data, W, H, { tight });
    if (!L) return null;
    const pad = 16;
    const out = document.createElement('canvas');
    out.width = L.span[1] - L.span[0] + 1 + 2 * pad;
    out.height = H + 2 * pad;
    const o = out.getContext('2d');
    const img = o.createImageData(out.width, out.height);
    for (let y = 0; y < out.height; y++) {
      for (let X = 0; X < out.width; X++) {
        const sx = X - pad + L.span[0];
        const sy = y - pad;
        const v = sy >= 0 && sy < H && sx >= L.span[0] && sx <= L.span[1] && L.mask[sy * W + sx] ? 0 : 255;
        const p = (y * out.width + X) * 4;
        img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
        img.data[p + 3] = 255;
      }
    }
    o.putImageData(img, 0, 0);
    return { canvas: out, key: `${L.span[0]}-${L.span[1]}` };
  }
  function pic(src, box) {
    try {
      const c = document.createElement('canvas');
      c.height = 40;
      c.width = Math.round((box.w * 40) / box.h);
      c.getContext('2d').drawImage(src, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.7);
    } catch (_) {
      return '';
    }
  }
  /** Names of that server close to a text -> [{ name, d }] (desktop bridge, or the tests' stand-in); [] without it. */
  async function near(world, text) {
    const R = window.__e7RecordsTest || (window.E7Desktop && window.E7Desktop.records);
    if (!R || !R.near || !world || !text) return [];
    try {
      return (await Promise.race([R.near(world, text), new Promise((res) => setTimeout(() => res([]), 12000))])) || [];
    } catch (_) {
      return [];
    }
  }

  async function read(ctx, src, box, opts = {}) {
    const loose = cut(src, box, false);
    if (!loose) return null;
    const tight = cut(src, box, true);
    const cuts = [loose, ...(tight && tight.key !== loose.key ? [tight] : [])];
    const reads = [];
    for (const c of cuts) {
      const eng = { ...(await ctx.ocr(c.canvas, { line: true, full: true })), cut: c === loose ? 'loose' : 'tight' };
      reads.push(eng);
      if (opts.lang) {
        const r = await ctx.ocr(c.canvas, { line: true, full: true, lang: opts.lang });
        reads.push(r);
        // Chinese characters in it: it may be a Chinese name (on any server), and the Simplified data knows characters
        // the others do not. Also when kana were read next to them: an unknown character is often read as a kana.
        const t = G.cleanCjk(r.text);
        if (opts.lang !== 'chi_sim' && t && /[\u3400-\u9fff\uf900-\ufaff]/u.test(t)) reads.push(await ctx.ocr(c.canvas, { line: true, full: true, lang: 'chi_sim' }));
      } else if (!G.cleanName(eng.text) || eng.conf < 35) {
        for (const l of OTHER_LANGS) reads.push(await ctx.ocr(c.canvas, { line: true, full: true, lang: l }));
      }
    }
    const picked = G.pickRead(reads);
    const picture = pic(src, box);
    if (!picked.name) return { name: '', raw: '', known: false, pic: picture };
    const clean = picked.name;
    const fixes = readJSON('e7-gw-name-fixes', {});
    for (const c of picked.all) if (fixes[c.name.toLowerCase()]) return { name: fixes[c.name.toLowerCase()], raw: c.name, known: true, pic: picture };
    const knownList = readJSON('e7-gw-known-names', []);
    for (const c of picked.all) {
      const k = G.matchName(c.name, knownList);
      if (k) return { name: k, raw: c.name, known: true, pic: picture };
    }
    // the server's player list: the candidate with the closest player wins
    let best = null;
    const offered = [];
    for (const c of picked.all.slice(0, 4)) {
      const list = await near(opts.world, c.name);
      if (!list.length) continue;
      for (const x of list) if (!offered.includes(x.name)) offered.push(x.name);
      const [a, b] = list;
      const tie = b && b.d === a.d && b.name.toLowerCase() !== a.name.toLowerCase();
      if (!tie && (!best || a.d < best.d)) best = a;
    }
    if (opts.offerOnly) best = null;
    const name = best ? best.name : clean;
    const options = [...offered, ...picked.all.map((c) => c.name)].filter((o, i, arr) => o !== name && arr.indexOf(o) === i).slice(0, 4);
    return { name, raw: clean, known: false, official: !!best, options, lang: picked.lang, pic: picture };
  }

  window.E7Names = { read };
})();
