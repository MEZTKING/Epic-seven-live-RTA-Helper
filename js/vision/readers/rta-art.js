/*
 * Reader: the opponent's PROFILE ART on the RTA versus screen (DEVLOG #70). The game hides the opponent's name until
 * the battle; their card art is shown at once. The art's fingerprint (js/artprint.js) is remembered with the name the
 * battle bar shows later (rta-battle.js → 'rta:battle'), in localStorage['e7-rta-arts'] (on this PC). When an art seen
 * before shows up again:
 *   'rta:art' { names: [{ name, n, server }], sim }   (n = how often that name came with this art)
 * so the RTA page can name the opponent (a guess, corrected by the battle bar) and look them up before the draft.
 * The card picture itself (full size, JPEG) goes to IndexedDB 'e7-rta-arts' (js/artstore.js) for the gallery on the
 * RTA page's History tab, only once the name is known (owner's wish: "copy that art").
 * Only looks at the picture.
 */
(function () {
  'use strict';
  const V = window.E7Vision;
  const A = window.E7ArtPrint;
  if (!V || !A) return;
  const KEY = 'e7-rta-arts';
  const KEEP_MS = 20 * 60 * 1000; // a versus screen and its battle are at most this far apart
  const cv = document.createElement('canvas');
  cv.width = A.FP_W;
  cv.height = A.FP_H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.imageSmoothingQuality = 'high';
  const load = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '[]') || [];
    } catch (_) {
      return [];
    }
  };
  let pending = null; // { fp, at, prev } this match's art, waiting for the name
  let sentFor = null;

  /** The card as the game shows it, full size (JPEG), for the gallery. */
  function picOf(ctx) {
    try {
      const b = A.cardBox('opp', ctx.w(), ctx.h());
      const c = document.createElement('canvas');
      c.width = Math.round(b.w);
      c.height = Math.round(b.h);
      c.getContext('2d').drawImage(ctx.source, b.x, b.y, b.w, b.h, 0, 0, c.width, c.height);
      return { jpg: c.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height };
    } catch (_) {
      return null;
    }
  }
  function fpOf(ctx) {
    const b = A.cardBox('opp', ctx.w(), ctx.h());
    cx.clearRect(0, 0, A.FP_W, A.FP_H);
    cx.drawImage(ctx.source, b.x, b.y, b.w, b.h, 0, 0, A.FP_W, A.FP_H);
    return A.fingerprint(cx.getImageData(0, 0, A.FP_W, A.FP_H).data);
  }

  V.register({
    id: 'rta-art',
    label: "RTA versus screen: the opponent's profile art (who it probably is)",
    module: 'rta',
    every: 700,
    ready: () => true,
    async read(ctx) {
      const R = window.E7RtaDraft;
      const st = R && R.tracker && R.tracker.stage;
      if (st !== 'versus') return ctx.note(pending ? 'Profile art kept for this match, waiting for the name' : 'Not the versus screen');
      const fp = fpOf(ctx);
      // the card slides in: the same picture twice before it counts
      if (!pending || A.similarity(pending.fp, fp) < 0.97 || pending.done) {
        if (!pending || pending.done || performance.now() - pending.at > 60000 || A.similarity(pending.fp, fp) < 0.97) pending = { fp, at: performance.now(), seen: 1 };
        return ctx.note('Versus screen: reading the profile art…');
      }
      pending.seen++;
      if (sentFor === pending) return ctx.note('Profile art read');
      sentFor = pending;
      pending.pic = picOf(ctx);
      const hit = A.lookup(load(), fp);
      ctx.publish('rta:art', hit ? { names: hit.names, sim: hit.sim } : { names: [], sim: 0 });
      ctx.note(hit ? `Profile art seen before with: ${hit.names.map((x) => `${x.name} (${x.n}×)`).join(', ')}` : 'Profile art not seen before');
    },
  });

  // the battle bar gave the opponent's name: remember it with this match's art
  if (window.E7Bus) {
    window.E7Bus.on('rta:battle', (d) => {
      if (!d || !d.opp || !d.opp.name || !pending || performance.now() - pending.at > KEEP_MS) return;
      const p = pending;
      try {
        const list = A.remember(load(), p.fp, d.opp.name, { server: d.opp.server });
        localStorage.setItem(KEY, JSON.stringify(list));
        const e = A.entryFor(list, p.fp);
        if (e && p.pic && window.E7ArtStore) window.E7ArtStore.put(e.id, { ...p.pic, at: Date.now() });
        // pictures of arts no longer in the list (it keeps the newest 400) are dropped
        if (window.E7ArtStore && list.length >= 400) {
          const keep = new Set(list.map((x) => x.id));
          window.E7ArtStore.all().then((all) => all.filter((x) => !keep.has(x.id)).forEach((x) => window.E7ArtStore.remove(x.id)));
        }
      } catch (_) { /* storage full: only a hint */ }
      pending = null;
      sentFor = null;
    });
  }
  window.E7RtaArt = { _key: KEY, _pending: () => pending };
})();
