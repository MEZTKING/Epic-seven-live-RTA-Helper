# Devlog

A running record of every change to the Epic 7 Engine (formerly the RTA Live Helper): what changed, why, what was found while researching,
bugs found and fixed, how it was tested, and what is still open. Newest entries first.

**Rule:** every change to the project adds an entry here **in the same commit**. Use the template at the bottom.

---

## 2026-11-13 · #33 · Match review: what the app saw, per match · this commit (previous: `8017eef`)

**Asked for:** "its seems even when starting the match the prebans arent even detected and nothing goes forward, is there a
way to check per match all the correct things the app sees".

**Findings**
- The pre-ban row on the draft screen is the one built-in position never checked against a real **file** (the BAN
  screen file doesn't show it; the picking-phase screens only came as chat images). So the pre-ban boxes may be off.
- "Nothing goes forward" for picks is also expected until their banners are named once (DEVLOG #31/#32).
- What's needed: per match, see **where** the app looked and **what** it saw, and get the pictures out as files.

**Changed**
- `js/matchtrace.js` (new, `E7Trace`, tested): per-match record in `localStorage['e7-match-trace']` (newest 15 matches,
  200 events each): timeline events (repeats collapsed) and the latest snapshot of every slot.
- `js/auto.js`:
  - `note()` writes to both the diagnostic log and the match timeline: match found / start, first pick, draft screen
    found, status changes (e.g. "0 of 4 recognised"), slot confirmations with scores, picker pre-bans, board picture,
    result, CR teams, names given.
  - Every 5 s while live: a snapshot of each slot (guess, score, sure, confirmed, source, badges).
  - While the draft is open: a picture every 20 s (up to 6) tied to the match. Match-start and board pictures are tied
    too (`draftId`).
- RTA → Auto, new card **Match review: what the app saw**:
  - choose a match (time · result vs opponent)
  - its pictures with **Show with boxes** (the alignment view on that picture), **Name heroes**, **Download** (a .jpg
    file to send to Claude)
  - a slot table and the timeline
  - **Copy this match for Claude** (the diagnostic report with this match's slots + timeline)
- `js/pictures.js`: pictures can carry `draftId`; keeps the newest 60.
- Diagnostic report: a "This match" section and the **desktop app version** (`E7Desktop.version()`).
- `sw.js` v24.

**Bugs found and fixed while building:** a blind replace turned the log call inside `note()` into a call to `note()`
itself (endless loop). Caught by reading the result before running; fixed.

**Tested**
- `npm test` 104 (matchtrace: 2 new).
- Browser suite **22/22** clean. New `match-review.e2e.js`:
  - timeline with the repeat count, slot table, the real BAN picture
  - Show with boxes → alignment view at 1340 px
  - Download → `epic7-draft-screen-1-….jpg`
  - Copy → text with slots + timeline
- Desktop `rta-follow.js` still passes ("waiting for the RTA draft screen (… 0 of 4 recognised)").
- **Not tested:** a real match (the owner's next match fills it).

**Open:** with one downloaded picking-phase picture, the pre-ban positions can be made exact.

---

## 2026-11-13 · #32 · Name the heroes after the match, teams from the CR bar, "is the overlay working?" · this commit (previous: `684dd4d`)

**Asked for:** "yes do both" ("label this draft after the match" + reading the CR bar to confirm teams), "and how to get the
overlay and is there a way to know when its working".

**Changed**
- **Name the heroes on a saved picture** (`rta.html` dialog `#label-dlg`, `js/auto.js` `openLabel` / `saveLabels`):
  - Saved-picture chooser → "Name the heroes on this picture" shows every pre-ban and pick slot of that picture (crop +
    name box). Guesses the app is sure of are prefilled; unsure ones show as "maybe X".
  - Saving adds each name as a "my corrections" example (and a face example for round slots). That hero's banner is
    recognised by itself from then on. Optionally the names become the current draft.
- **A picture of the draft board is saved once per match** when the BAN screen shows (built-in `rta-draft` signature), so
  there's always one to name after the match.
- **Teams from the CR bar** (`scanCRTeams`, button "Read teams from the CR bar"):
  - Slides along the calibrated CR bar (step 1/6 of the icon size), quick check then the face matcher with the wide
    alignment search; keeps confident faces.
  - Side from the ring colour (red = opponent).
  - Saved on the draft as `crTeams` (kept when the draft updates). `matchFromDraft` uses them for picks the draft is
    missing (`teamsFrom: 'cr bar'`).
- **Is the overlay working?**
  - `overlay.html` shows a "✓ Epic 7 Engine overlay" badge for 6 s when it starts (desktop).
  - Desktop menu **Overlay → Show a test card** and Live → **Show a test card on the overlay** put a card on it for 5 s.

**Bugs found and fixed:** the first CR scan moved 1/3 of an icon per step, so icons sitting between two windows (8 px
off) were missed. Now 1/6 of an icon plus the wide alignment search.

**Tested**
- `npm test` 102. Browser suite **21/21** clean. New:
  - `rta-label.e2e.js` on the **real BAN screen**: 14 slots offered; two named (my pick 1, opponent pick 2) → 2
    corrections; reading the screen again → exactly those two confirmed "(my corrections)", the other 8 picks still
    unconfirmed. On a CR bar made from real portraits (white / red rings): you Stark + Aram, opponent Frieren + Robin.
    Correct.
  - `overlay-test.e2e.js`: Live → test card appears on the overlay with the badge, gone after 5 s.
- Packaged desktop app, new `tests/desktop/overlay-test.js`: badge at start, test card on the real overlay window,
  window visible.
- **Not tested:** the CR bar on a real battle screen (no battle file yet; the ring colour rule comes from the owner's
  chat screenshot).

---

## 2026-11-13 · #31 · Real RTA screens as files: built-in recognition of 6 screens, First Pick read, banners can't match portraits · this commit (previous: `50aa89a`)

**Asked for:** "how do i send the screenshots as files", then the owner attached five real Steam screens as files
(menu, "Here comes a new challenger!", match start, pre-ban picker with 2 selected, BAN screen).

**Changed**
- `tests/fixtures/screens/`: `steam-rta-menu`, `steam-rta-match-found`, `steam-rta-match-start`,
  `steam-rta-preban-select2`, `steam-rta-ban` (1340×754, the game picture; the owner's name and guild name blacked out).
- `js/screens.js`: new screen `rta-found` (match found).
- `tools/make-screen-refs.js` → `js/sources/screen-refs.js`: built-in signatures for **rta-lobby, rta-found,
  rta-intro, rta-preban-pick (×2), rta-draft (BAN screen)**.
  - Pairwise similarity: everything ≤ 0.42 except the two pickers (0.95: the same screen at another moment) and
    menu ↔ match found (0.81: the found banner over a darkened menu, below the 0.82 threshold + margin).
- `js/auto.js`:
  - **Match found** starts a new match (the earliest signal). Match start within 20 s is the same match: it saves the
    profile art and reads First Pick.
  - The built-in draft-board signature keeps the draft gate open.
  - Test hooks `_readFirstPick`, `_pickerPrebans`.
- New `tests/e2e/rta-real-screens.e2e.js`.

**Findings (real files, nothing taught)**
- Screens recognised: **7/7** (menu, found, match start, both pickers, BAN screen; Victory → none, as it should be).
- **First Pick** (OCR word position on the match-start screen): read **opponent**. Correct.
- Pre-ban picker, selected heroes: 1/2 confident (**Lady of the Scales**); the other stays unsure.
- The by-eye built-in pick boxes sit on the heroes on the real BAN screen, and the selected-pre-ban boxes on the real
  picker.
- **Pick banners cannot be matched to the official portraits.** The banner is a different crop of the art. Old matcher:
  all 10 slots unsure at 0.45–0.69, so nothing wrong is confirmed. Face matcher with a size/position search: 0.65–0.78
  with tiny leads and wrong-looking names (Kawerik ×3).
  - Way forward: **learn banners from corrections**. Each hero's banner never changes, so one correction per hero
    (click the slot → type the name) is remembered for good; the element + class badges on the banners can narrow
    candidates once their positions are added.
  - Alternatively: the battle CR bar and the result screen use **round** icons, which the face matcher reads well.

**Tested:** `npm test` 102; RTA browser tests clean; `rta-real-screens.e2e.js` as above.

**Open:** banner badge positions; a "label this draft after the match" flow on a saved BAN/Ready picture, so the
corrections can be made without time pressure.

---

## 2026-11-13 · #30 · Match start (versus / profile art), First Pick, RTA menu, pre-ban picker recognised without teaching · this commit (previous: `844cfea`)

**Asked for:** "maybe you should also log the profile art that plays at the very start and this can be a way to know
when a match is starting". Screenshots of the RTA menu, the match-start screen, the pre-ban picker with 2 selected and
the BAN screen followed, all pasted in chat (not files).

**Findings (from the screenshots)**
- **Match-start screen:** both profile arts, a big "VS.", rank tiers, and **"First Pick"** under the side that picks
  first. That's a clean "new match" signal and tells who picks first.
- **RTA menu (World Arena, Find Opponent):** this is where the wrong heroes of DEVLOG #29 came from. Seeing it means the
  draft is over.
- **Pre-ban picker with selections:** "Selected Heroes (2/2)" shows your two pre-bans with element + class badges at the
  bottom middle. That's also the screen where pick positions would land on the face grid.
- **BAN screen:** each pick banner has element + class badges at its top end (positions differ per slot). Kept for
  later.

**Changed**
- `js/screens.js`: new screens `rta-lobby` (RTA menu), `rta-intro` (match start), `rta-preban-pick` (pre-ban picker).
- **Built-in screen signatures:** `tools/make-screen-refs.js` (new) → `js/sources/screen-refs.js` (generated) from the
  real picker file. `js/screen-watch.js` detects with built-in + taught signatures (built-in ones are not used for
  gating). The picker is recognised **without teaching**.
- `js/auto.js`:
  - **Match start** (taught `rta-intro`):
    - a new match begins (a complete previous draft is kept as pending); old slots are forgotten
    - the draft gate opens for 5 minutes, so it no longer depends only on recognising pre-bans
    - the profile art is saved as a picture ("match start (profile art) · draft …"), and it's logged
    - **First Pick** is read by OCR (bottom strip, word positions: left = me, right = opponent) and sets the draft's
      first pick
  - **RTA menu** (taught `rta-lobby`): closes the draft gate at once.
  - **Pre-ban picker:** draft slots are never read there; your 2 selected pre-bans are read (face matcher + badges,
    built-in boxes `myPrebanPick1/2` measured by eye) and logged / shown.
  - A newly loaded screenshot clears the slot results.
  - New `ocrWords` (words with x positions).
- **Teach a screen from a saved picture** (saved-picture chooser → "this picture shows…"), for screens too quick to
  teach live (match start). RTA → Auto → Screens has the new screens too.
- `js/layouts.js`: `myPrebanPick1/2`. `sw.js` v22. ROADMAP: banner badges.

**Tested**
- `npm test` 102.
- Browser suite 18/18 clean:
  - `rta-layout.e2e.js`: the **real pre-ban picker file is recognised as `rta-preban-pick` with 0 taught screens** and 0
    confirmed slots; the real Victory file is not taken for the picker
  - `rta-pictures.e2e.js`: teaching `rta-intro` from a saved picture works (1 example); match start replaces a
    14-action draft with a fresh one (new id)
- **Not tested:** First Pick OCR (no match-start file), the selected-pre-ban positions (by eye), the menu and
  match-start screens (must be taught once from a saved picture: Developer → Collect screenshots, or Ctrl+Shift+S, then
  "this picture shows…").

**Open:** with files of the match-start and menu screens, their signatures can be built in like the picker's (no
teaching). Pick-banner badge positions need a draft file.

---

## 2026-11-13 · #29 · Fix "everything wrong" (draft gate), element colour + class symbol, diagnostic report · this commit (previous: `b49c3bc`)

**Asked for** (several messages):
- "for the heros your can learn it by coloour since the icons are always their for them"
- "currently its taking everything wrong" (screenshot of the RTA "What I see" slots)
- "for the icons you can use the colour and the symbol on the other side for rangers and thiefs and more etc"
- "make a system so that i can paste a log file to u so you have all the neccesary infiormations"

**Findings**
- **Why everything was wrong:** the owner's slot pictures showed lobby text ("Rank: 35…", "Win Rate: 45…", "7h 36m"),
  not heroes. Since DEVLOG #25 the built-in positions count as calibrated, so the reader read those positions on
  **every screen**. Before that nothing ran until boxes were drawn. Also, the old matcher's "big lead at a low score"
  rule let 34–60% guesses through for pick slots.
- **Element colour** (top-right badge: flame / drop / tree / star / moon): read correctly on 15/15 known faces of the
  real grid and plausibly on all 40.
- **Class symbol** (top-left badge: hood / bow / sword / hat / shield / swirl): learned from the 15 known faces.
  Leave-one-out in Python 14/15. In the app (browser code, cautious thresholds): 8 right, 0 wrong, 7 unsure (no filter).
- With element + class narrowing, the face matcher names **15/15** known faces confidently and correctly (was 14;
  Genesis Ras now clear), still with **0** wrong confident answers and no newly confident unknown faces.
- The small pre-ban faces on the draft screen don't seem to show badges, and the pick banners show them elsewhere
  (position unknown without a real draft file). So the badges help where present and are skipped where not.

**Changed**
- `js/auto.js`, **draft gate**:
  - While watching live (and the draft screen isn't taught), the pick/help/name/postban readers only run when ≥ 2 of
    the 4 pre-ban faces are recognised confidently, and for 90 s after; otherwise "waiting for the RTA draft screen".
  - Pick slots now need score ≥ threshold (0.72) **and** a 0.04 lead.
  - Screenshots loaded by hand aren't gated.
  - Bug found while testing: `draftSeenAt` started at 0, and `performance.now()` is near 0 right after the page opens,
    so the first 90 s counted as "draft just seen". Now `-Infinity`.
- `js/faces.js`:
  - `elementFromRGBA` / `elementAt` (badge hue bins), `elementAllow`
  - `classVector` / `classVectorsAt` / `classFromVectors` (16×16 grey symbol vs learned examples, score ≥ 0.75 and
    lead ≥ 0.10)
  - `badgesAt`, `badgeAllow` (element ∧ class, falls back to element only)
- The round slots in `js/auto.js` use the badge filter when badges are found.
- `tools/make-class-templates.js` (new) → `js/sources/class-templates.js` (generated): 15 class-symbol examples cut
  from the real screenshot with the app's own browser code.
- **Diagnostic report:** `js/diag.js` (new, `E7Diag`).
  - "Copy report for Claude" on RTA → Auto, Live, Gear, Guild War, and desktop menu Developer → Copy report for Claude.
  - Contents: app/device, capture, game area, frame keys, watcher status, taught screens, RTA settings and part status,
    matches (count + last 3), current draft, gear counts, sync/guild state, **every RTA slot** (badges, confirmed,
    best/2nd guess with score and source, box in px), the last 25 watcher events and a 300-line log.
  - The log records RTA status changes, the draft screen being found, slot confirmations with scores, results read,
    the watcher starting, and page errors.
  - **Never included:** sync key, Firebase settings, guild code.
  - Falls back to a text box when the clipboard isn't allowed.
- `sw.js` v21; all pages load `js/diag.js`.

**Tested**
- `npm test` 102 passing (element colours, class symbol rule, `badgeAllow`).
- Browser suite 18/18 clean:
  - `faces-real.e2e.js`: 40/40 element badges, class leave-one-out 8/0/7, **15/15** with element + class, 0 wrong
  - new `diag.e2e.js`: report of about 2.2 k characters with all sections and slot lines, the button says "Copied ✓",
    and **no planted secret** (sync key, API key, project id, guild code) appears
- Packaged desktop app, `rta-follow.js`, on a non-draft fake game screen: "Watching · waiting for the RTA draft screen
  (… 0 of 4 recognised)", nothing read.
- **Not tested on a real draft:** whether the built-in pre-ban positions + face matcher open the gate on the owner's
  screen. If it never opens, the diagnostic report will show why (pre-ban guesses and scores), or teach the draft screen
  (RTA → Auto → Screens) and the gate uses that instead.

**Open:** badge positions on pick banners (need a draft file). More class examples will make the class reader surer.

---

## 2026-11-13 · #28 · Step 1b part 1: the RTA reader follows the game watcher · this commit (previous: `231b7ba`)

**Asked for:** "do 2 then 1b". 2 = DEVLOG #27. 1b = move the RTA reader into the game watcher.

**Findings / decision**
- `js/auto.js` (1150 lines) is tied to the RTA page:
  - its data: drafts (`App.replaceDraft`), results, scouting, game help, opponent
  - its UI: slot list, corrections, calibration, status table
  - the overlay suggestions, which need the RTA logic
- A full move into the watcher window means rewriting that, and there is still **no real draft screenshot as a file** to
  test it on (only made-up screens). Risky for the one reader that works.
- What the owner notices from 1b is not having to start the RTA reader separately. So it's split:
  - **Part 1 (this commit):** in the desktop app the RTA reader starts and stops with the game watcher: same game window,
    same title-bar cut, no picker, no extra click.
  - **Part 2 (later, with real draft screenshots):** move the slot / postban / help / result / CR / name readers into
    `js/vision/readers/`, publishing events that the RTA page applies.

**Changed**
- `js/auto.js`:
  - `followWatcher` (via `VisionClient` status): starts the capture when the watcher is watching (desktop only;
    browsers need a click), stops it when the watcher stops.
  - Pressing Stop keeps it stopped until Start.
  - `startCapture` can't run twice at once.
- `rta.html`: loads the vision bus/client; the button is now "Start reading the game".

**Tested**
- New `tests/desktop/rta-follow.js` (packaged app, fake game window):
  - opening RTA → reading with no click, no picker
  - watcher stopped → RTA stopped ("The game watcher stopped…")
  - watcher started again → reading again
  - Stop on the RTA page → stays stopped
- `npm test` 100; browser suite 17/17; desktop watcher/popout/cancel pass.
- **Not tested:** Windows, real drafts.

**Open:** part 2 of 1b, once real draft screenshots exist (Developer → Collect screenshots).

---

## 2026-11-13 · #27 · Sync my devices (PC ↔ phone) · this commit (previous: `b6b3fce`)

**Asked for:** "Then why do we have it as a phone browser if it cant do the same thing" → option 2 "do 2 then 1b": make the
phone version worthwhile by syncing the owner's own data between PC and phone (step 1b follows).

**Design**
- The owner's own Firebase project (the Guild War one can be reused), Firestore `personal/{key}`, anonymous sign-in.
  The 36-hex random key is the secret and travels in a link; the part after `#` never reaches a server.
- Data goes in **sections** that stay separate:
  - RTA: notes, custom heroes/owned/typed speeds, Fribbels import, presets, matches (+ match sources), scouting, game
    help, meta imports, settings
  - Gear: gear.txt items, screen-read items, rules/weights
- **Not synced (per device):** current draft, pending, sim, calibration and corrections, game area, pictures, taught
  screens.
- Per section: changed here only → upload; there only → download; both → lists with ids (matches, presets, scouting,
  game help) are merged **three-way** (adds and deletes from both sides kept); anything else → newer change wins. A
  device joining for the first time takes the cloud copy (lists are merged).
- Firestore documents max out at 1 MiB, so big sections (gear.txt) are split into 700 kB chunks. Each chunk carries the
  section hash, so a half-written upload is skipped, not applied.

**Changed**
- `js/mysync.js` (new, pure + tested): `readLocal`, `applyLocal`, `mergeList` (three-way), `decide`, `syncOnce`,
  `memoryRemote`, `firestoreRemote`, `link` / `parseLink`, `newKey`.
- `js/mysync-app.js` (new): background pass 1.5 s after opening, every 30 s and when the app comes back to the
  foreground. One tab at a time (Web Locks). After data comes in, the page reloads it (`e7-synced` event; other tabs via
  the storage event).
  - **Home card "Sync my devices (PC ↔ phone)":** turn on (Guild War project or pasted config), last sync with
    ↓ ⇄ ↑ per section, Sync now, copy the link for the other device, turn off.
  - Opening `index.html#sync=…&c=…` asks, then connects that device and removes the key from the address bar.
- `index.html`, `rta.html`, `gear.html` load it. `js/app.js` and `js/gear-app.js` reload on `e7-synced`.
- `firestore.rules`: private `personal/{key}/{sections|chunks}/{doc}` (signed in, key ≥ 32 chars, doc < 1 MB).
  **The owner must publish the rules again.**
- `docs/GUILD_SETUP.md`, `docs/SOURCES.md` (6b), Home intro text, `sw.js` v19.

**Tested**
- `npm test`: 7 new tests:
  - PC → empty phone (draft and calibration stay per device)
  - matches added on both plus a delete merged, and the delete stays deleted
  - notes edited on both: newer wins
  - 6000-item gear split into chunks and rebuilt
  - half-written upload skipped
  - links
  - Firestore remote with a fake SDK: only `personal/{key}/…` paths, gear in ≥ 2 chunks, anonymous sign-in
- New `tests/e2e/mysync.e2e.js`: a PC and an iPhone-sized phone (separate storage) sharing one fake cloud.
  - The PC's gear.txt shows on the phone's Gear page (248 items).
  - The PC's match and notes appear on the phone's RTA page; a match added on the phone reaches the PC.
  - The Home card works at phone width.
  - A sync link connects a new device and the key leaves the address bar.
- **Not tested:** a real Firebase project (none exists yet), a real phone.

**Open:** the "newer change wins" rule uses when a change was first *noticed* (passes run every 30 s), so two edits of
the same notes on two devices within the same half minute can go either way. Lists with ids don't have this problem.

---

## 2026-11-13 · #26 · Phone: publish the web app from the work branch · this commit (previous: `5b3bd4a`)

**Asked for:** "How to run this on mobile".

**Findings**
- The repo only has the work branch `ccr-2c9db930-kqvr1r`, which is also its **default branch**. There is no `main`.
- `pages.yml` only deployed on pushes to `main`, so the web version had never been published.
- GitHub Pages also needs the one-time setting Settings → Pages → Source = GitHub Actions. That's the owner's to switch;
  there's no tool for it here.

**Changed**
- `.github/workflows/pages.yml`: also deploys on pushes to the work branch. The default `github-pages` environment allows
  the default branch.
- `README.md`: phone instructions:
  - the address (`https://meztking.github.io/Epic-seven-live-RTA-Helper/`)
  - Add to Home Screen on Android and iPhone
  - what works on a phone (Gear, Guild War, RTA by tapping, hero info) and what doesn't (screen reading and overlay)
  - data is per device; only Guild War syncs, via Firebase

**Tested:** workflow YAML checked; tests run in CI before deploy. **Not tested:** the deploy itself (it fails until the
owner switches the Pages source; then re-run it from the Actions tab or push).

**Open:** phone layout was checked at 390 px wide in the browser tests (no sideways scrolling on live, gear, home), not on
a real phone.

---

## 2026-11-12 · #25 · Built-in screen positions (no drawing for Steam 16:9) and a clear "what's set" table · this commit (previous: `0041c80`)

**Asked for:** "why does it say not calibrated yet, and its hard to tell what is calibrated and what is not, and this
should be a one time thing that users shouldn't have to go through" + "do the other recommended" (step 2 of the plan:
built-in layouts; step 1b is next).

**Findings**
- "Not calibrated yet" meant: all 8 draft boxes are required (4 pre-bans + first/last pick on each side). Setting other
  parts (CR bar, result, single boxes) never made it "calibrated", and nothing on screen said what was missing.
- In window mode the capture includes the **Windows title bar** (owner's screenshots: 1348×794 window, 1342×755 game at
  (3, 36)). Fixed positions need the same picture every time, so the title bar is now cut off automatically.
- On the real Victory screenshot, the built-in result box OCRs as **"VICEFORY"** (the sword crosses the T). The old exact
  `/VICTORY/` test would have missed the win.

**Changed**
- `js/game-area.js`: `window16x9(W, H)`. A captured game window that's taller than 16:9 is cropped to its 16:9 game
  picture (bottom, full width minus the border), recomputed if the window is resized; frame key `window-16x9`.
  `overlay.html` uses the same rule, so the overlay still lines up. Checked on the owner's sizes: 1348×794 → (3, 36,
  1342×755), exactly the hand crop.
- `js/layouts.js` (new, `E7Layouts`, pure + tested): built-in **Steam 16:9** positions.
  - Draft: 4 pre-ban icons and the first/last pick slot per side, **measured by eye** from the owner's chat screenshots,
    so possibly a few px off.
  - Result banner: **pixel exact**, from the Victory file.
  - Not built in yet: CR bars, opponent name, drafting help (they need screenshot files).
  - `effective` (built-in + yours, yours win), `status` per part (yours / built-in / mixed / not set), `ownOnly` (save
    only boxes that differ from built-in).
- `js/auto.js`:
  - Every reader uses `regions()` = built-in + yours. So a 16:9 Steam picture is ready with nothing drawn, and the
    "not calibrated" message only shows for other shapes (it now says why and what to do).
  - Calibration starts from the boxes in use and saves only your changes.
  - The pre-ban face search is wider (±21%, `RTAFaces.WIDE_VARIANTS`) when a box is built-in, to absorb by-eye errors.
- RTA Auto tab, new card **"What the reader knows about the screen"**:
  - A headline says whether the built-in positions are in use for this game picture.
  - A table lists each part (draft, opponent name, CR bar, expanded CR bar, Victory/Defeat, drafting help) as
    **Built-in / Yours / Built-in + yours / Not set (optional)**.
  - Buttons per part: **Check** (shows the boxes on the live picture, or the newest saved picture), **Set/Redo**, and
    **Use built-in** (forgets your boxes for that part).
- `js/vision.js`: `resultWord(text)`, a tolerant VICTORY/DEFEAT reader (within 2 edits, spaced letters, ignores "Victory
  Points"), used by the result reader.
- `sw.js` v18. Docs: HANDOFF, ROADMAP, CLAUDE.md.

**Bugs found and fixed:** the exact VICTORY match (see findings). Two older tests assumed calibration pops open on any
uncalibrated picture. Their made-up screens now open it themselves, since 16:9 pictures use the built-in layout.

**Tested**
- `npm test` 93 passing (layouts: 4 new, `resultWord`: 1 new).
- Browser suite 16/16 clean. New `rta-layout.e2e.js`:
  - with no boxes, the real Victory screenshot gives "built-in positions in use", nothing pops open, and draft/result
    both show "Built-in"
  - the built-in result box OCRs "VICEFORY", which `resultWord` reads as a win
  - Check shows the alignment view
  - your own result box shows as "Yours"; Use built-in returns to "Built-in"
- **Not tested on real draft pictures:** the by-eye draft positions. The first real draft screenshot (dev tool or Ctrl+Shift+S)
  should be checked with **Check**, then the numbers fixed in `js/layouts.js`. Emulators with side toolbars still need
  boxes drawn once.

---

## 2026-11-12 · #24 · Saved picture: choose which part to calibrate first · this commit (previous: `62deec4`)

**Asked for:** "when pressing calibrate on a saved picture its supposed to let you choose which part it is first, not
start calibration from step 1".

**Changed**
- `rta.html` / `js/auto.js`: picking a saved picture now opens **"What's on this picture?"**: the picture next to a
  list of parts. Each part shows ✓ when it's already set:
  - draft screen: all slots
  - redo **one** draft box (dropdown with the 9 boxes: prebans, pick slots, opponent name)
  - CR bar
  - expanded CR bar
  - Victory / Defeat
  - the game's drafting help (asks how many heroes it shows, as before)
- Only that part's boxes are then drawn. Single parts save straight into the existing boxes (the others are kept).
  "← Other picture" goes back to the list.
- `calibrateHelp` accepts a saved picture. `css/styles.css`: layout for the chooser (stacks on phones).

**Tested:** `rta-pictures.e2e.js` extended:
- choosing a picture shows the 5 parts and 9 single boxes, with calibration not opened yet
- the CR part → "Step 1/1 … CR bar"; one box (opponent pick #1) → "Step 1/1 … OPPONENT's pick slot #1"
- the whole draft → "Step 1/9"; Back / Cancel still close

`npm test` 88 passing; rta-auto-full, rta-basics and drafthelp-gearsorter clean.

---

## 2026-11-12 · #23 · Stronger face matcher, calibrate after the match, gear art, gear per hero, dev screenshot tool · this commit (previous: `7f6836d`)

**Asked for** (several messages):
- "do the stronger face matcher"
- "pressing back on calibration should close it currently does nothing"
- "there should be a live version to calibrate automatically since while im in a game i dont have time to adjust"
- "for the gear images use fable to draw a better one that is closer to the game"
- "gears should also be shown per hero too"
- "since the icons dont change it not a big problem, except for hero maybe whos got a different skin"
- "you should set up a dev tool to take screenshots automatically for your own learning"

**Research: face matcher** (real pre-ban grid, `tests/fixtures/screens/steam-rta-preban-select.png`)
- The official portrait `{code}_s.png` (112×112, round, transparent corners) is the **same artwork** as the in-game round
  icon. In game it sits inside a gold ring, with the class icon top-left, the element icon top-right and stars at the
  bottom.
- Mapping found by search on 6 sure faces: the portrait window centred at (+2, +4) px with half-size 56 equals the in-game
  ring box. Masked normalised cross-correlation at 32×32 scored 0.94 on average for those 6.
- The owner confirmed that four of the old matcher's guesses were **wrong** ("these are all wrong"). Many remaining
  faces are probably **skins** (different art, per the owner). A correction teaches a skin once, since icons never change.
- In the browser, a one-step canvas shrink (84 → 32 px) lowered the scores; shrinking in two steps (→ 64 → 32) and a
  3×3 shift search fixed that.

**Changed**
- `js/faces.js` (new, `RTAFaces`; pure parts tested):
  - face mask (circle minus icon corners and the star band); 32×32 colour vector, zero-mean and normalised
  - `classify` (best of all alignment variants), and `isConfident`: score ≥ 0.80 **and** ≥ 0.10 ahead of the next hero
  - corrections stored as int8 base64
  - browser helpers `fromPortrait` / `fromRect` (36 alignment variants)
- `js/auto.js`:
  - The **pre-ban slots (round icons) use the face matcher** (source shown as "official (face match)"). Pick banners keep
    the old matcher until real draft screenshots exist.
  - A correction on a round slot also saves the face (`auto.faceCorrections`), so skins are learned once.
  - "Delete my corrections" clears those too.
- Calibration:
  - **Back on step 1 now closes it**; new **Cancel** button (both close without saving).
  - **No calibration during a match:** when the RTA reader is watching but not calibrated, it no longer pops the
    calibration open. It saves a game picture every 15 s instead.
  - **Calibrate on a saved picture** opens the boxes on any saved picture after the match. Boxes are fractions of the
    game picture, so they work in every later game.
  - **Save a game picture** button. Desktop: **Ctrl+Shift+S anywhere** (and Game window menu) asks the game watcher to save
    one (`save-picture` command).
  - `js/pictures.js` (new): IndexedDB `e7-pictures`, newest 24.
- Gear art: `js/gear-icons.js` (new, drawn by a Fable sub-agent): original SVGs, six slots in a dark-steel/gold/red
  style and 24 round set emblems; **not game art**. Used on gear tiles and the details card (emoji/letters remain as
  fallback).
- **Gear per hero:** Gear page "View: by hero". One row per hero with their six slots in order, full sets, the gear score
  total and speed from gear; clicking a slot opens the details card. The hero box filters it.
- **Developer tool** (desktop): menu **Developer → Collect screenshots automatically** (off by default) and "Open the
  screenshot folder".
  - The game watcher saves a full-size PNG of the game when the scene changes and holds still for 2 passes (at most
    every 2 s), plus once a minute.
  - Next to each PNG is a `.json` with the time, why it was saved, the detected screen, each reader's note and the frame
    key.
  - Saved to `Pictures/Epic 7 Engine/<date>/` on the owner's PC; nothing is uploaded. The owner drags pictures into the
    chat to share them.
- `sw.js` v17 (new files). Docs: HANDOFF, ROADMAP, CLAUDE.md.

**Tested**
- `npm test`: 88 passing (5 new for faces).
- Browser suite 15/15 clean:
  - `faces-real.e2e.js` (new): on the **real** grid with all 367 official portraits, **14/15** confirmed faces named
    confidently and correctly, and **0** confident answers on any unconfirmed face (Genesis Ras: right name, but its lead
    is too small, so it stays "unsure"). About 43 ms per face.
  - `rta-pictures.e2e.js` (new): saved pictures listed (including one saved by the watcher command); calibration opens
    on a saved picture; Back on step 1 closes; Back after a box goes to step 1; Cancel closes without saving.
  - `gear-cards.e2e.js`: + the by-hero view (8 heroes, 6 slots each; details card from a hero row).
- Packaged desktop app: new `tests/desktop/devshots.js` (3 PNG + JSON pairs for a first picture and two scene changes,
  nothing in between); watcher, popout, cancel, zoom, winpick still pass.
- **Not tested:** the face matcher on live drafts (no draft screenshots as files yet), skins, Windows.

**Open:** labels for the faces the matcher is unsure about (some are skins). Real draft / CR / Defeat screenshots, which
the dev tool can now collect.

---

## 2026-11-12 · #22 · First real game screenshots: what the readers get right and wrong · this commit (previous: `06ae25a`)

**Asked for:** the owner sent two Steam screenshots as files: the RTA **pre-ban picker** ("Select Pre-Ban Hero" grid) and a
**Victory** screen. (The earlier draft / battle / Defeat screenshots were pasted into the chat and aren't available as
files.)

**Changed**
- `tests/fixtures/screens/` (new), the start of the real-screenshot test set:
  - `steam-rta-victory.png` and `steam-rta-preban-select.png`, cropped to the game picture (without the Windows title
    bar; both exactly 16:9, about 1343×757).
  - The player name, the opponent's name and both guild names are blacked out, because the repo is public.
- `tests/real/ocr-victory.js` and `tests/real/match-portraits.js` (new): re-runnable checks of the current text reader and
  face matcher on those pictures. They're not part of `run-all.sh` yet, because there are no confirmed right answers
  (labels) for the faces.

**Findings (real data, first time)**
- **Text (tesseract.js 5.1.1, `eng`)**:
  - "VICTORY" correct (confidence 42, stylised font); Victory Points "1,344" (96); "The opponent has left the battle."
    (95); the player name correct (92, on the unredacted original).
  - **The point change "▲ 23" reads as "- 23"**: the arrow becomes a minus. Win or loss and +/− must come from the
    arrow's colour (green up / blue down) or the result word, never from the sign in the text.
  - **Korean opponent names**: `eng` gives garbage (confidence 2). `kor` reads "여우는…구미호" (94, with one repeated
    syllable from a line split). The opponent-name reader needs Korean (and likely Japanese/Chinese) data and must join
    lines. The result screen also says when the opponent **left**, which is worth recording.
- **Hero faces (current matcher: 16×16 colour feature vs the official portraits, 3 template crops, 15 crop variants)**,
  40 round faces in the pre-ban grid, checked by eye on a contact sheet (crop vs best match):
  - **20/40 confident**; about 18 of those look right, and 1–2 confident matches look wrong (e.g. a silver-haired face
    → "Shepherd Jena").
  - Most "unsure" ones are wrong.
  - So the current matcher isn't good enough for real games. A stronger face matcher (the embedding / ONNX model both
    reviewers suggested, or at least larger features with a circular mask) moves up in priority. Corrections ("my
    corrections" source) and the "owned heroes only" filter for my picks help in the meantime.
- The pre-ban is chosen in its own picker (grid + "Recently Selected"), and the opponent is "Unknown Opponent" until
  the draft ends. Useful for the screen layouts in step 2.

**Tested:** both scripts run on the redacted fixtures and give the same results as on the originals (names excepted).

**Open:** the owner could label the 40 faces (or send screenshots with known picks) so the face test gets right answers.
More screenshots as files (draft picks/postban, CR bar, Defeat) are needed for step 2.

---

## 2026-11-12 · #21 · Step 1a: one game watcher for the whole app (vision service + event bus) · this commit (previous: `6747836`)

**Asked for:** "yes start step 1": the first step of the plan in `docs/DESIGN_REVIEW.md`. One always-on watcher captures
the game, works out the screen and runs the readers; modules only receive events. While this was being built the owner
also sent Steam screenshots of the RTA draft (preban, picking, postban "BAN", "Ready" with BANNED stamps), battle (CR bar,
expanded CR with exact percentages) and a Defeat screen. They're input for step 2; chat images aren't files here.

**Findings**
- The Gear and Guild War readers are small and only need a few saved boxes, so they move cleanly.
- The RTA reader (`js/auto.js`, 940 lines) uses about 50 RTA page elements and the RTA app state directly. Moving it is
  step **1b**. Until then it keeps its own capture; in the desktop app both capture the same game window, which is fine.
- Video frames can't be shared between windows cheaply, so the readers run next to the capture (in the watcher) and only
  facts travel. Drawing boxes uses a JPEG **snapshot** requested from the watcher.
- Electron allows `getDisplayMedia` from a hidden window (checked), so the desktop watcher can start by itself.

**Changed**
- New `js/vision/`:
  - `core.js` (pure, tested): event bus with cross-window delivery, a fact log in `localStorage['e7-vision-log']` (last
    200), request/reply commands, and `repeatGate` (a value must be seen twice in a row).
  - `bus.js`.
  - `hub.js`: the watcher. One capture; game area or game window; screen detection every 0.5 s; readers run only on
    their own screen; one shared tesseract worker; commands start / stop / status / snapshot / teach. A second start
    while starting reuses the first.
  - `client.js`, `panel.js`.
  - `readers/gear-item.js`, `readers/guild-name.js`.
  - `consumers/gear.js`.
- `js/gearstore.js` (new): the gear store shared by the Gear page and the gear consumer. Screen items are saved even when
  the Gear page is closed; sources are still kept apart.
- `vision.html` (new): the watcher's page. In the desktop app it's a hidden window created at start. It starts by itself
  once a game window was chosen, restarts when the choice changes, and closing it only hides it. Menu **Game window → Show
  the game watcher**. `E7Desktop.showSelf` lets it show itself while asking "Where is the game?".
- `live.html`: hosts the watcher in a browser (keep the tab open); new **Game watcher** card with status, readers and
  recent events. In the desktop app it shows the background watcher.
- `js/gear-scan.js` and `js/guild-watch.js` rewritten as watcher clients: start the watcher (desktop) or open Live
  (browser); draw boxes on a snapshot; teach screens through the watcher; show results from events. The Guild War page
  matches `guild:name-read` to known players itself (it has the guild data) and posts the overlay.
- `js/gear-app.js` uses `GearStore`, reloads on `gear:added` / storage changes. `js/game-area.js`: `isStale` (no alert),
  `markCalibrated` takes a frame key.
- Desktop: `main.js` creates the hidden watcher window; preload `showSelf`; `capture().chosen`; `vision.html` packaged.
- `sw.js` v15 (new files). Docs: HANDOFF (code map, flows, storage key), ROADMAP (architecture plan steps 1b–4),
  CLAUDE.md (where readers go).

**Bugs found and fixed while building**
- I overwrote the existing `tests/vision.test.js` (portrait tests) with the new bus tests. Restored from git; the new
  tests are `tests/vision-core.test.js`.
- `gear-app.js` called `load()` before it was defined (crash on load); fixed.
- Desktop tests picked the hidden watcher window as "main"; they now look for `index.html`.

**Tested**
- `npm test` 83 passing (5 new). Browser suite 13/13 clean. The moved tests now run the watcher on the Live page with fake
  game frames:
  - Gear: two items added from the Live page show up on the Gear page with verdicts, and in the overlay. The reader
    pauses on another screen. The "Set boxes" snapshot arrives (1280×720).
  - Guild War: the name read by the watcher selects "Quiet" in the pop-out.
  - Game-area crop through the watcher.
- Packaged desktop app (Xvfb + Openbox), new `tests/desktop/watcher.js`:
  - First launch: hidden watcher; Gear "Start the game watcher" → picker → watching only the fake game window; the Gear
    page shows the status; the watcher stays hidden.
  - Second launch: it starts by itself with no picker.
  - `cancel.js`: cancelling the picker shows "Capture was cancelled", not watching.
  - `popout.js`, `zoom.js`, `winpick.js` still pass.
- **Not tested:** real game screens, Windows.

**Open:** step 1b (RTA reader into the watcher). The screenshots need to be files for step 2.

---

## 2026-11-12 · #20 · Design review: Fable and DeepSeek on "build it from scratch" · this commit (previous: `d2160db`)

**Asked for:** "ask fable and deepseek what is the best way to design this app from scratch again".

**Done**
- Wrote one neutral brief: goals, how the owner plays, the read-only rule, source separation, the solo maintainer
  setup. It contains no personal details, no description of the current code and none of our opinions, so the answers
  aren't anchored on ours.
- Fable answered as an independent sub-agent, told not to read the repo.
- DeepSeek answered via its chat API. The owner entered their API key in the secure credential form; it is stored as a
  network secret on their cloud environment, and the session never saw it. We requested `deepseek-reasoner`; the API
  reported `deepseek-flash`.
- `docs/DESIGN_REVIEW.md` (new): the brief, both answers, and a comparison with the current app. `docs/SOURCES.md`:
  new section 2b "Outside advice".

**Findings**
- Both reviewers agree on the core:
  - capture the game window, normalised to one 16:9 frame
  - ship screen layouts as versioned data instead of user-drawn boxes
  - a central vision pipeline that emits events to the modules
  - a real-screenshot test corpus
  - local, source-separated storage
  - explainable scoring with Bayesian smoothing
  - read-only
- They disagree on the platform:
  - Fable: web tech + Electron, which is what we have.
  - DeepSeek: C# .NET + WPF + SQLite + Velopack, with Supabase and a separate PWA.
- Recommendation: evolve the current app, don't rewrite. Order: vision service → layout packs from real screenshots →
  IndexedDB → glyph reader for stats.

**Tested:** n/a (docs only). **Open:** waiting for the owner's go-ahead and real screenshots for the layout packs.

---

## 2026-11-12 · #19 · Gear card view (like the game's inventory) · this commit (previous: `a43ba45`)

**Asked for:** (two Steam screenshots: an item's details panel, and the inventory grid) "also display the gears like this
or the second one". Also asked why the app is "portable" and to "make a full version".

**Findings**
- The screenshots show the Steam client's inventory: tiles with level, set icon, main stat + 4 subs with stat icons,
  and the score under the icon; a details panel on the right.
- The game's own "Equipment Score" (33 for Defense 60 / HP 7% / Def 7% / Spd 4 / Res 6%) is **not** the
  Fribbels WSS (28 for the same item), and its formula isn't public. We show our WSS, labelled "Gear score", and don't
  imitate the game's number.
- The **full (installed) version already exists** since v0.1.3: `Epic-7-Engine-Setup-<v>.exe` on Releases. The
  portable .exe is the extra.

**Changed**
- `gear.html` / `js/gear-app.js`:
  - New **View: cards / table** switch, default cards, remembered in `localStorage['e7-gear-view']`.
  - Cards: a tile per item with a rank-coloured icon (Epic red, Heroic purple, Rare blue…), level, +enhance, lock,
    equipped hero's face and set badge. The gear score sits under the icon; main stat and substats have stat symbols
    (roll counts as small numbers). The bottom edge is coloured by verdict.
  - Clicking a tile opens a details card styled like the game's (rank + slot, main stat bar, substats with full names,
    gear score, after reforge, expected at +15, set, verdict + reason, equipped on, best heroes). It's a sticky side
    panel on wide screens and sits below on narrow ones.
  - All symbols, colours and shapes are our own (no game art); slot symbols are standard emoji.
- `css/styles.css`: gear card styles; two tiles per row on phones.
- `sw.js` cache v14. README: says plainly that the Setup .exe is the full version.

**Tested:** new `tests/e2e/gear-cards.e2e.js` (248-item fixture):
- 150 tiles render; clicking opens the details card.
- No sideways scrolling at 1400 px or 390 px.
- The table view still works and the choice is remembered.
- Full browser suite 13/13 clean; `npm test` 78 passing.

**Open:** real game icons for sets and slots can't be used (game art). If wanted, we can draw our own SVG set icons.

---

## 2026-11-12 · #18 · Fixes from an independent review (Fable) · this commit (previous: `2d69443`)

**Asked for:** "use fable to check if anything else is wrong and then push". A separate Fable review read
`e062f43..2d69443` without being told my conclusions. Every finding below was checked against the code before fixing.

**Bugs found and fixed**
1. **Portable update never swapped** (high). The .cmd waited with `timeout /t 1`, which exits at once when stdin
   isn't a keyboard (we spawn with `stdio: 'ignore'`). The 60 retries took about 1 s, before the portable launcher
   freed the .exe, and the next start deleted the download. Now it waits with `ping -n 2 127.0.0.1`.
2. **Non-ASCII or space-containing paths in the swap script** (medium). The paths were written into the .cmd file
   (UTF-8, but cmd reads the OEM code page). They're now passed as arguments (`%~1` / `%~2`), on a verbatim
   `cmd /d /s /c ""script" "a" "b""` command line.
3. **Main and overlay zoom weren't independent** (medium). Chromium zoom is per origin; both windows are `e7://app`.
   Confirmed in the packaged app: with zoom 1.5 the overlay window also reported 1.5. The overlay no longer uses
   `setZoomFactor`; `overlay.html` scales each card or label by `overlayZoom / zoom` (CSS transform, origin on the side
   facing its box, so positions stay exact). Values come over IPC (`E7Desktop.zoom()` / `onZoom`).
4. **Update download had no write-error handling** (medium-low). A read-only folder or full disk could crash the main
   process or hang with `busy` stuck on. It now uses `stream.pipeline`, removes the partial file, and gives a clear
   message.
5. **Overlay in the wrong place in window mode with no tracker** (medium): game not open yet, game closed,
   PowerShell blocked. On Windows the overlay now hides until the game window is found again, and the app looks for it
   every 4 s, not only when a reader starts.
6. **Every child window forced to 380×620 and always on top** (low). Only the mini windows (`rta-mini`,
   `e7-guild-mini`) get that now; e.g. Live → Open overlay preview opens normally at 1100×640.
7. **Readers and the game-area dialog** (low). The capture-ended listener is now attached before the dialog. Cancelling
   "Where is the game?" stops the reader (`GameArea.wrap` returns null) instead of silently reading the whole screen.
   Applies to `js/auto.js`, `js/guild-watch.js` and `js/gear-scan.js`.

**Also fixed (the review's "speculative" list)**
- **Old calibration boxes**: boxes drawn on the whole screen are in the wrong place once only the game is read.
  `GameArea.markCalibrated(module, src)` records which picture each module's boxes were drawn on, in
  `localStorage['e7-frame-of']` (`window` / `area:x,y,w,h` / `full`). `warnIfStale` alerts once when a reader starts
  with boxes from another picture.
- Display-media handler: when cancelled, `callback()` is called with no arguments, guarded.
- Window title match is exact (a browser tab named "Epic Seven …" can no longer be picked by accident; you're asked
  instead).
- The PowerShell tracker stops when the app's process is gone (no orphan after a crash).
- Pop-out windows get the zoom at creation (`about:blank` may never fire `did-finish-load`).
- Only the picker window may send `e7:choose`.
- **Kept on purpose:** every build of the dev branch becomes the "latest" release. That's how the owner gets updates,
  since this branch is where all work happens.

**Tested**
- `npm test` 78 passing; browser suite 12/12 clean. `game-area.e2e.js` now also checks the old-boxes warning (warns
  once; no warning after redrawing).
- Packaged Linux app (Xvfb + Openbox), scripts in `tests/desktop/`:
  - `zoom.js`: overlay card scale 1/1.5 with zoom 1.5 / overlayZoom 1.0.
  - `popout.js`: both pop-outs open, with content, on top.
  - `winpick.js`: window capture as before.
  - `cancel.js`: cancelling the picker leaves Gear "not reading", no errors; the overlay preview is 1100×640 and not on
    top.
- **Not tested (needs Windows):** the swap script, PowerShell tracker, NSIS install and update.

---

## 2026-11-12 · #17 · Pop out fixed, in-app updater, read just the game window · this commit (previous: `d112aa5`)

**Asked for:** (screenshot of Guild War in the desktop app) "POP OUT DOESNT DO ANYTHING"; then "make an inapp updater";
then "can the window not lock on per window instead of the whole screen".

**Findings**
- Pop out: in Electron 33, `documentPictureInPicture` exists but `requestWindow()` **never resolves** (checked in the
  packaged app: the promise hangs, no error). So the click did nothing. A try/catch alone wouldn't help.
- electron-updater can update an NSIS-installed app from GitHub Releases, but **not a portable .exe**. The repo is public,
  so Releases download without signing in. Every build needs a higher version, so CI sets `0.1.<run number>`.
- Electron's capture sources include single windows (`window:<HWND>:0` on Windows). Capturing a window gives just the
  game, even when other windows cover it. The overlay then has to know where that window is: read with
  `DwmGetWindowAttribute` (physical pixels), converted with `screen.screenToDipRect`.

**Changed**
- `js/pip.js`, `js/guild-pip.js`: in the desktop app, open a normal window (the app keeps it always on top); in a browser,
  Picture-in-Picture with a fallback to a normal pop-up if it fails.
- In-app updater, `desktop/updater.js` (new):
  - Checks about 10 s after start, quietly, and from the menu **Epic 7 Engine → Check for updates…**.
  - Installed app: electron-updater. It asks first, shows progress on the taskbar icon, then "Restart now / Later".
    Later = installs on close.
  - Portable .exe: GitHub API `releases/latest`, downloads `*-portable.exe` next to the old one as `.update`. After the
    app exits, a small `.cmd` retries `move` until the old file is free, then starts the new one if "Restart now" was
    chosen. Same file name and place, so shortcuts keep working.
  - The menu also shows the version and links to the Releases page.
- `desktop/package.json`: targets `nsis` + `portable`. NSIS is one-click, per-user (no admin), with a desktop shortcut;
  output `Epic-7-Engine-Setup-<v>.exe`. Adds a `publish` block (github, so `latest.yml` / `app-update.yml` are written)
  and the dependency `electron-updater` 6.3.9. Lock file regenerated.
- `.github/workflows/desktop-build.yml`: version `0.1.<run number>`. Every app change publishes Release `v0.1.<n>`
  (marked latest) with the installer, its blockmap, `latest.yml` and the portable .exe. The `v*`-tag trigger was removed
  (versions are automatic). `concurrency` keeps builds in order.
- Read just the game window:
  - `desktop/picker.html` (new): "Which window is the game?" with live previews. Emulators and Steam "Epic Seven" are
    marked "looks like the game"; whole screens are a fallback.
  - `desktop/preload.js` (new): `window.E7Desktop` `{capture, pickWindow, onCapture}`.
  - `desktop/main.js`: `config.capture` (`{mode:'window'|'screen', id, name}`). `getDisplayMedia` gets that window;
    the picker opens the first time, or when the window can't be found (matched by id, then by title).
  - Menu **Game window**: shows the current choice; **Pick the game window…**.
  - `desktop/wintrack.js` (new): one PowerShell loop reads the game window's position, minimized state and whether it
    (or this app) is active. The overlay window follows it, and hides when the game is minimized or another program
    is in front.
  - `js/game-area.js`: in window mode no box is asked (the capture is already the game). **Reset game area** opens the
    window picker in the desktop app.
  - `overlay.html`: identity mapping in window mode. `js/live.js`: the status line shows the game window.
- `sw.js` cache v13 (changed pages and scripts).
- `tests/desktop.test.js` (new, 4 tests): tracker line parsing, HWND from source id, version compare.
- `tests/desktop/` (new): Playwright-driven checks of the packaged app (pop-outs, window picker).

**Tested**
- `npm test`: 78 passing. Browser suite: 12/12 clean.
- Packaged Linux build (`electron-builder --linux dir`), driven by Playwright under Xvfb + Openbox:
  - Pop out on Guild War and on RTA opens a window with its content, always on top. The old code hung in
    `requestWindow`.
  - Window picker: a fake "Epic Seven" window (separate Chromium) was listed and marked; the app's own windows were not.
    Picking it made `getDisplayMedia` capture only that window: the centre pixel was the game's gold colour, the
    track label was the window title, and no box dialog appeared. The choice was saved in `config.json` and the next
    capture skipped the picker. The overlay page and Live see window mode.
- `app.asar` contains `updater.js`, `electron-updater`; `app-update.yml` is in resources. An AppImage build writes
  `latest-linux.yml`, so the Windows build will write `latest.yml`.
- **Not tested (needs Windows):** the PowerShell window tracker and the overlay following the window; the NSIS
  installer and the actual update download and swap (first possible once two Releases exist); DPI scaling other than
  100%.

**Open:** updates are unsigned (SmartScreen may ask after an update). The first installed or portable version that has
the updater is the one from this build. Older .exe files must be replaced by hand once.

---

## 2026-11-12 · #16 · Box the game window (game area) + bigger text · this commit (previous: `e062f43`)

**Asked for:** (with two screenshots of the desktop app on Windows) "make the ui and text size bigger" and "watch
emulator window shows up like that". The calibration picture showed the **whole desktop** (other windows, the app
itself) with the game small in the middle, because the desktop app captures the entire display.

**Findings:** Electron's display-capture approval hands over the whole display, so every calibration box and every
reader worked on a full-screen picture where the game is small. Cropping once, centrally, fixes all three readers and
makes calibration show the game large. The overlay must then map positions back from the game to the screen.

**Changed**
- `js/game-area.js` (new): `GameArea.wrap(video)` asks once for a box around the game ("Where is the game?" dialog;
  "Use the whole picture" also possible), saves it in `localStorage['e7-game-area']`, and returns a canvas with just the
  game, refreshed every 100 ms. Asked again if the capture size changes. Any `[data-reset-game-area]` button clears it.
- `js/auto.js`, `js/guild-watch.js`, `js/gear-scan.js`: read from the wrapped source and stop its timer on stop.
  `auto.js` gained a `live` flag so screenshot mode and live mode no longer depend on `source === video`.
- `rta.html`, `guild.html`, `gear.html`, `live.html` (+ `js/live.js` status line): "Reset game area" buttons; load
  `game-area.js`.
- `overlay.html`: in desktop mode, item positions are mapped through the game area; re-draws when it changes.
- Bigger text: `css/styles.css` base font 14px → 15px (line height 1.5), hints 12.5px → 13.5px. Desktop app opens
  pages at **125% zoom**; View menu Ctrl+= / Ctrl+- / Ctrl+0 (0.6–2.5, saved); Overlay menu bigger/smaller overlay text.
- `sw.js` cache v12 (adds game-area.js). Docs: HANDOFF (storage key, flow, zoom), README, desktop/README.

**Tested**
- `npm test`: 74 passing. `node --check desktop/main.js` ok.
- New `tests/e2e/game-area.e2e.js`: a generated 1920×1080 "screen" with distracting text outside and a 960×540 game
  window holding an item panel. The wrapped source is 960×540, the gear reader read the item correctly (Boots, Speed
  Set, Speed 45, 4 substats) and ignored the text outside; the desktop overlay put a label at the expected screen
  position ([1182, 470]).
- Full browser suite: all 12 tests clean.
- **Not tested:** the Electron zoom menu and overlay mapping in the real Windows app (no Windows/display here). The
  owner's next exe run is the first real check.

**Open:** if the game window moves, the box must be redrawn (Reset game area). Auto-finding the game window by its
picture could come later.

---

## 2026-11-12 · #15 · Automatic Windows .exe build (GitHub Actions) · this commit (previous: `605855e`)

**Asked for:** set up the automatic exe build (after explaining how to install on Windows), so the app can be
downloaded without installing Node.js or using a command line.

**Changed**
- `.github/workflows/desktop-build.yml` (new):
  - Runs `npm test` on Ubuntu, then on `windows-latest` runs `npm ci` + `npm run dist` in `desktop/`.
  - Uploads `desktop/dist/*.exe` as the artifact **Epic-7-Engine-windows** (30 days).
  - On `v*` tags, also attaches it to a GitHub Release (`softprops/action-gh-release@v2`, the only reason for
    `contents: write`).
  - Triggers: pushes to `main` / the dev branch that touch app files, tags, and manual "Run workflow".
- `desktop/package.json`:
  - `dist` = `electron-builder --win portable --publish never` (never tries to publish by itself).
  - Output name `Epic-7-Engine-${version}-portable.exe`; `author` set (electron-builder warns without it).
- `desktop/package-lock.json` (new): made with `npm install --package-lock-only --ignore-scripts`. It pins Electron
  33.2.1 / electron-builder 25.1.8 and their dependencies, so CI uses `npm ci`.
- Docs: README "Install on Windows", desktop/README, HANDOFF (CI section), SOURCES (actions used).

**Tested**
- Workflow YAML parses; `npm test` 74 passing.
- **First real build on GitHub: run #1 (id 43301060267), success.** Tests passed on Ubuntu; `windows-latest` ran
  `npm ci` (24 s) and `npm run dist` (78 s). The artifact **Epic-7-Engine-windows** (74.3 MB zip, expires 2026-12-12)
  was uploaded; the Release step was skipped as intended (no tag).
- **The .exe itself has not been started yet** (no Windows/display here). The first launch is the owner's.

**Open:** the .exe is unsigned (Windows SmartScreen asks once). Code signing needs a certificate (paid).
Downloading Actions artifacts requires being signed in to GitHub; tagged Releases don't.

---

## 2026-11-12 · #14 · Steam version: typed hero speeds; docs updated · this commit (previous: `bc29f70`)

**Asked / told:** can the Steam version be used instead of an emulator? (Yes: the app only reads the screen, so any PC
window works; calibrate per client; windowed/borderless for the overlay; capture "Entire screen" if a window capture is
black.) The owner reports **Fribbels' gear importer doesn't work with the Steam version**.

**Consequence:** Steam players have no `gear.txt`, so no hero speeds (RTA speed checks, scouting comparisons, Guild War
green dots need them). The screen gear reader gives inventory items, but they aren't linked to heroes.

**Changed**
- `js/app.js`:
  - New store field `mySpeeds` {code: speed} (source `my speeds`), set in the hero editor's new "My speed" field.
  - In `derive()`, typed speeds win over gear.txt builds; `cache.typedSpeeds` records which ones were typed.
  - Heroes tab shows "typed" (plus the gear.txt value if both exist); the hero card shows both.
- `js/guild-app.js`: your speeds for the Guild War gear check include typed speeds; Setup's hint mentions it.
- `rta.html`: "My speed" field in the hero editor.
- Docs: HANDOFF (storage field, source label, status: Steam + Fribbels limitation), SOURCES (Fribbels importer
  limitation, typed speeds as user data), ROADMAP (hero gear screen reader now top priority), README "Steam version".
- `tests/e2e/typed-speed.e2e.js` (new).

**Tested**
- `npm test`: 74 passing.
- New browser test: typed 282 for Arbiter Vildred → Heroes row "282 spd typed", `cache.mySpeeds` = 282.
  On the Guild War page a proven counter (2-0, slowest winning AV 270) turned into a **green** dot from the typed speed.
  No errors.

**Open**
- Steam screenshots (all screens, especially a hero's gear screen) to build the hero-gear reader and Steam default boxes.

---

## 2026-11-12 · #13 · Full handoff docs + sources list; CeciliaBot skills and automatic tags; e2e tests in the repo · this commit (previous: `52c9339`)

**Asked for:** document everything so any future task can continue; list all sources and where they're used; "you can
use Cecilia bot website maybe".

**Research: CeciliaBot**
- Site `https://ceciliabot.github.io` (Vue app). Its code calls `https://cecilia-bot-api.vercel.app/api/v1`
  (`getList?list=hero|buff|debuff|common`, `getItem?list=hero&id=<slug>`). CORS `*`, so other sites can call it.
- `getList?list=hero`: 389 heroes with `id` = official code (e.g. `c1144`), `_id` slug, `buff` / `debuff` / `common`
  effect ids.
- `getItem`: full skills (`description` with `**bold**`, `++buff++`, `--debuff--`, `{{variable}}` placeholders and
  per-placeholder `values` [base, +enh…], an `awakened` version, cooldown, passive).
- `data/HeroDatabase.json` on the site has only basic info; its `tags` field is availability (1 = limited), not roles.
- No explicit licence found. Used at runtime only (nothing copied into the repo), credited with a link, only hero ids
  sent, can be switched off. Logged in `docs/SOURCES.md`.

**Changed**
- `js/ceciliabot.js` (new): list (weekly cache) + per-hero skills (weekly cache, only when a card opens).
  - `EFFECT_TAGS` maps game effect ids to our tags; 2+ different debuffs → `debuffer`.
  - `renderText` escapes everything and allows bold/buff/debuff markup and filled `{{variable}}` values at max
    enhancement (e.g. "revives to **10%** Health").
- `js/heroinfo.js`: third tag source `ceciliabot`; CeciliaBot skill section (normal + awakened, cooldown, passive)
  with a use switch; pages re-render when the effect list first arrives (`HeroInfo.onTagsReady`).
- `js/logic.js`: `compositionWarnings(my, enemy, notes, extra)` accepts automatic tags as their own labelled source.
  RTA passes CeciliaBot tags, so "No cleanse or immunity against 2 debuffers" works with no manual tagging.
- Calibration usability (found by the tests): the calibration image is capped at 62% of the window height and
  scrolled into view when calibration starts. A drag ending off-screen used to draw the wrong box. The Guild War and
  Gear calibration canvases use the same cap.
- Docs:
  - `docs/HANDOFF.md` (new): what it is, rules, code map, every storage key, source labels, flows, testing, status, commands.
  - `docs/SOURCES.md` (new): every runtime data source, library and research reference, with file usage, label, what
    is sent and when checked; rejected sources and why; privacy summary.
  - `CLAUDE.md` "Start here" + rules to keep SOURCES/HANDOFF current; README Development section.
- `tests/e2e/` (new): the 10 Playwright scripts used during development, made portable (`BASE`/`OUT`/`FX`), with fixtures
  and `run-all.sh`. `tests/e2e/out/` is git-ignored. `sw.js` cache v11.

**Bugs found and fixed**
- CeciliaBot skill text showed raw `{{variable}}`: placeholders are now filled from `values`.
- The drafting-help e2e test failed after the Auto tab grew (Screens card): the calibration image ran below the window,
  so two drags missed and the pick columns were spread sideways. Fixed in the product (cap + scroll into view), not by
  just enlarging the test window.
- A converted test script declared `BASE` twice (test-only).

**Tested**
- `npm test`: 74 passing (new: effect → tag mapping incl. Arbiter Vildred's real effects, all mapped tags exist,
  text escaping/markup, placeholder values, team check with an automatic-tag source).
- `bash tests/e2e/run-all.sh`: **all 10 browser tests pass**.
  - CeciliaBot live: 389 heroes cached; tags AV = aoe, attack buff, cr push, revive; Belian = aoe, control, cr reduce,
    debuffer, dispel, heal, provoke; card shows S1–S3 with awakened text and "10%"; switch-off removes tags.

**Open / unverified**
- CeciliaBot terms aren't stated. If its maintainers object, switch the source off by default (one line in `js/ceciliabot.js`).
- Judgement roles (nuker, tank, support, bruiser, healer, speed control) still come only from you and your guild.
- Everything in HANDOFF "Never tested on the real game" still applies.

---

## 2026-11-12 · #12 · Expanded CR bar, hero info card (skills + role tags) · this commit (previous: `b1867c6`)

**Asked for**
1. The CR bar has an expanded screen: read it too.
2. Show any hero's skill descriptions in Guild War or RTA, in case someone forgets.
3. A tag system per hero by role, for a quick overview.
(Also answered, no code change: the owner said Fribbels only reads data sent to the player. I re-checked the RexQian
fork at `1d7fef5`: `scanner.py` captures the game traffic locally, then `scanner.js` POSTs it to
`krivpfvxi0.execute-api…/dev/getItems` to decode; the only alternative is a developer-only `127.0.0.1:5000` decoder
that isn't in the repo. Conclusion from #10 unchanged.)

**Research: skill text sources**
- EpicSevenDB API (`api.epicsevendb.com`, used in old Fribbels code): unreachable; the website's certificate has expired.
- Official static server (`static.smilegatemegaport.com/gameRecord/epic7/`): `epic7_artifact.json` exists, but no
  skill file (`epic7_skill`, `epic7_hero_skill`, `epic7_hero_detail` → 403).
- Fribbels herodata: skills have multipliers only, no text.
- Community GitHub repos with old EpicSevenDB copies: not used (unclear licences, likely outdated after reworks).
- **epic7x.com** hero pages are reachable, at `/character/<name>/`: lowercase, "&" → "and", apostrophes dropped,
  other characters → "-". 12 sampled heroes all resolve.
- Decision: link to epic7x for full text; skill **notes** come from `my notes` and `guild`, kept separate.

**Changed**
- `js/logic.js`: `TAG_GROUPS` (Role / Offense / Utility / Control, 31 tags); `TAGS` derived from it (team checks keep working).
- `js/roster.js`: `epic7xUrl(name)`, `tagSources({source: tags})`.
- `js/heroinfo.js` (new, shared): hero card dialog.
  - Header, combined tags with ✓ when sources agree, epic7x link, page extras.
  - `my notes` and `guild` blocks, each with tags and skill notes (S1, S2, S3, Passive/EE), editable per source.
  - `tagChips()` for quick-overview chips. Any element with `data-hero` opens the card (capture phase, so an ⓘ
    never also triggers a pick).
- RTA (`js/app.js`):
  - The card reads and saves through the in-memory store; extras show your build, learned win rate and scouted speeds.
  - ⓘ + tag chips on suggestions, ⓘ in the Heroes tab, filled draft slots and scouting rows open the card.
  - **New:** the RTA page reloads its data when another tab changes it (Guild War / Gear pages write the same
    storage), so it no longer overwrites their changes.
- Guild War:
  - New shared record type `hero` (`hero-<code>`), also allowed in `firestore.rules`.
  - Hero chips on cards are tappable and show tag chips.
  - Guild notes are cached in localStorage `e7-guild-heroes` for the other pages (read-only there).
  - The page now loads `js/logic.js` for the tag groups.
- Gear: "best for" heroes open the card; loads `js/logic.js` + `js/heroinfo.js`.
- Expanded CR bar:
  - Screen type `rta-cr-expanded` and a "Calibrate expanded CR bar" box (`crBarExpanded`).
  - The CR reader uses the expanded box when that screen is showing, else the normal bar, else whichever exists.
  - Automatic reading also runs on the expanded screen; the result says which bar was used.
- CSS for the card and chips; `sw.js` cache v10.

**Bugs found and fixed:** epic7x link for names with apostrophes ("Archdemon's Shadow") pointed to `archdemon-s-shadow`
(404); apostrophes are now dropped (`archdemons-shadow`, 200).

**Tested**
- `npm test`: 69 passing (new: epic7x addresses incl. "&" and apostrophes, tag sources).
- Browser:
  - RTA card opened from the Heroes tab; my tags and S3 note saved; chips show in suggestions; ⓘ opened the card
    without picking.
  - Guild War guild notes saved as a `hero` record "by Ann", shown with ✓ where sources agree, chips on the war card.
  - The Gear page shows both sources (guild read-only); the RTA tab kept my notes after the other page wrote.
  - Expanded CR: after teaching `rta-cr-expanded`, "8 heroes read from the expanded CR bar".
  - All earlier browser tests pass; no console errors.

**Open / unverified**
- What the real expanded CR view looks like (it might show % numbers that could be read directly). Needs a screenshot.
- No automatic tags from skill text (no permitted skill-text source); tags come from you and your guild.

---

## 2026-11-12 · #11 · Live layer system, desktop overlay app, gear read from the screen · this commit (previous: `0fe8ac4`)

**Asked for:** "Make everything automatic, maybe use a layer system so a window over it can read everything on the
game's screen." During the work: plan (not build) a PvE/events module (events, Advent, Dimensional Exploration, Hunts,
Otherworldly Breach, Trial of Constellation, Strategic Archive), recorded in `docs/ROADMAP.md`.

**Design: four layers**
1. Capture.
2. **Screen detector** (`js/screens.js`): whole frame → 32×18 fingerprint (zero-mean, unit length). Each screen is
   taught by example (up to 5 per screen), matched against those examples, and must be the same twice in a row.
   Untaught screens don't block anything, so nothing breaks before teaching.
3. Readers gated by screen.
4. **Overlay**: modules post items `{x,y,w,h as fractions of the game frame, kind, level, title, lines}` on the
   BroadcastChannel `e7-overlay` (`js/overlay-bus.js`); `overlay.html` draws them.
   - In the desktop app that page is a transparent, click-through, always-on-top window over the game display.
   - In a browser it's a preview.

**Changed**
- `js/screens.js`, `js/screen-watch.js` (new): detector + shared helper (`E7Screens.update/teach/forget/allowed`);
  fingerprints in localStorage `e7-screens`, shared by all modules on the device.
- RTA (`js/auto.js`, `rta.html`):
  - Draft-screen readers (slots, postbans, drafting help, name) run only on `rta-draft`, the result reader only on
    `rta-result`, the CR reader only on `rta-battle`, each only once that screen has been taught.
  - Teach / Forget controls and status in Auto.
  - Overlay layer `rta`: top 3 suggestions next to the slot being picked, scouted enemy speeds next to their heroes.
- Guild War (`js/guild-watch.js`, `guild.html`): name reading only on `gw-enemy` (once taught); "This is the enemy
  screen" button; overlay layer `guild`: a card next to the enemy's name with their dot, each team's verdict and your counter.
- Gear without Fribbels:
  - `js/statparse.js` (new, pure): OCR text → stat lines (loose names, OCR slips like "Crit1cal", % vs flat,
    plausible ranges), set, slot, enhance, level, rank → a Fribbels-shaped item, plus a list of problems.
  - `js/gear-scan.js` (new): capture; box the panel once (main, 2–4 substats, optional set/slot/enhance/level);
    OCR every 1.5 s on the `gear-item` screen; the same item twice in a row is added once.
  - `js/gear-app.js`: `gs.scanned` kept separate from gear.txt items, with an on/off switch and a "screen" badge.
  - Overlay layer `gear`: the verdict next to the panel.
- `live.html` + `js/live.js` (new module "Live"): the four layers explained, taught screens (Forget), overlay preview,
  a monitor of what modules send, desktop app instructions. App-bar link on every page, home card, manifest shortcut.
- `overlay.html` (new): draws cards, labels and dots; flips a card to the other side of its box and clamps it to stay on screen.
- `desktop/` (new, Electron 33.2.1, electron-builder 25.1.8 for a portable .exe):
  - Serves the app under `e7://app` (one origin, so storage and channels are shared).
  - Auto-approves screen capture for the chosen display.
  - Overlay window: transparent, click-through, always-on-top, `setContentProtection(true)` so it's excluded from
    capture and the readers never read the overlay.
  - Pop-outs stay on top; menu to pick the game's display; Ctrl+Shift+O / Ctrl+Shift+E.
- `sw.js` cache v9, Pages workflow publishes `live.html`/`overlay.html`, `.gitignore` for desktop builds,
  README sections, CLAUDE.md (readers only read; never sniff game traffic), `docs/ROADMAP.md`.

**Bugs found and fixed**
- "Crit1cal Hit Chance 12 %" parsed as value 1 (a digit inside a word). The value is now the last number standing
  on its own.
- "Health 2,700": thousands separators broke the line split; parsing now uses the cleaned text.
- Overlay card next to an item panel near the right edge was squeezed off screen; it now flips side and is clamped.
- Gear overlay said "Best for Lilias (+2.2)" next to "not an upgrade"; it now only names a hero above the upgrade margin.

**Tested**
- `npm test`: 67 passing (new: detector through noise/brightness, unknown screens rejected, stabilizer, gating;
  stat lines incl. OCR slips/percent/flat/ranges; set/slot/enhance/level/rank; whole item + problems; item key).
- Browser (http):
  - Generated item-details frames: Boots (Speed Set +15, Speed 45, 4 substats) read correctly → KEEP (best for Ravi);
    Ring → EXTRACT. On another screen reading paused.
  - The overlay page drew the gear card. The Live page lists taught screens; the home card reads "1 of 5 screens taught".
  - Full RTA test still passes and its overlay shows enemy speeds; Guild War pop-out and live-sync tests pass.
  - No console errors; Live and Gear pages don't scroll sideways on phones.
- Desktop app: `node --check` only. **Not run** (no desktop/display here). Electron and electron-builder versions
  checked to exist on npm.

**Open / unverified**
- Everything screen-based still needs **real game screens**: teaching, box positions, OCR on the game's font.
- Screen-read gear isn't linked to heroes (roadmap: hero gear screens).
- The desktop overlay needs the emulator in windowed or borderless mode (not exclusive full-screen).
- Data inside the desktop app is separate from the browser's (export/import to move it).

---

## 2026-11-12 · #10 · Guild War pop-out + "Watch game"; research on getting gear.txt without Fribbels · this commit (previous: `42a5d4b`)

**Asked for**
1. Build the Guild War pop-out window (the "option 1" overlay discussed: see the dots and details while in game).
2. "Make the system to get the gear.txt just like Fribbels does", so people don't need Fribbels.

**Research: how Fribbels (RexQian fork) gets gear**
- `data/py/scanner.py` (scapy, needs Python + Npcap/Wireshark) **sniffs the game's network traffic** (TCP ports 3333
  and 5222) and prints the raw payloads as hex.
- `app/js/lib/scanner.js` then **POSTs those raw payloads to Fribbels' private server**
  (`https://krivpfvxi0.execute-api.us-west-2.amazonaws.com/dev/getItems`), which decodes them into items and heroes.
  The decoding is not in the repo. Licence: GPL-2.0.
- **Decision: not built.** Copying it would mean either using Fribbels' private server without permission, which also
  sends the user's raw game traffic (possibly account and session data) to a third party, or reverse-engineering the
  game's network protocol ourselves, which is likely against the game's terms and risky for accounts. Both conflict
  with this project's privacy rule.
  Safe alternative proposed to the owner: a **screen-based gear reader** (the same approach as the draft reader:
  calibrate the item-details panel once, read each item with OCR as you browse the inventory). It needs a screenshot
  of the in-game item details screen. Waiting for the owner's decision.

**Changed**
- `js/guild-pip.js` (new): the Guild War pop-out (Document Picture-in-Picture, falls back to a pop-up).
  - The current enemy player with their dot (only teams still standing count).
  - Each team: verdict, reasons, speeds, builds, "also owned by".
  - One-tap Won / Lost: logs the suggested counter as your team, with your speeds; Won asks to confirm.
  - Prev/Next through uncleared targets, best chance first (green → ring → yellow → grey → red); a name search;
    "Full history"; your attacks left today.
- `js/guild-watch.js` (new): **Watch game**.
  - Captures the emulator window and, once you box where the enemy's name appears (saved on this device, per browser),
    reads it every 2 s with tesseract.js.
  - The name must be the same twice in a row before switching, which avoids flicker. Only reads the screen.
- `js/guildwar.js`: `matchPlayer()` (OCR-tolerant name matching: about 1 mistake per 4 letters, or a
  substring with extra text like "Lv.60 Name") and `editDistance()`.
- `js/guild-app.js`: ⧉ button on each card; `window.GuildApp` API (current player, verdicts, quick log, history);
  listeners refresh the pop-out on every change.
- `guild.html`: Pop out / Watch game / Set name box buttons, name-box calibration dialog. `sw.js` cache v8.

**Tested**
- `npm test`: 62 passing (new: matchPlayer with typos, extra text, Korean, strangers rejected).
- Browser, using the seeded two-season guild from #9:
  - The pop-out opened from ⧉ shows RivalOne with a green team 1 ("280 vs their fastest ~250") and a red team 2.
  - Next moves to the next target; a typed name works.
  - One-tap Won logged Ruele + Lilias + Arbiter Vildred with speed 280: attacks left 2 → 1, team shown cleared.
  - Watch game read "Quiet" from a generated game frame and switched the pop-out.
  - No console errors.

**Not tested / open**
- Real emulator screens (the name position and font) and real Document PiP on a desktop (headless used the pop-up fallback).
- Getting gear without Fribbels: waiting on the owner's choice (screen-based reader needs an item-details screenshot).

---

## 2026-11-12 · #9 · Guild War verdict dots, gear check, player history across seasons · this commit (previous: `d40be0d`)

**Asked for**
- A marker next to each Guild War player: grey (no info), yellow (not enough info), green (win if you use the right
  heroes and gear), plus the suggested red. It should consider **your own gear**, with a different look for people who
  haven't imported gear.
- Use enemies' stats from previous fights, and record players across seasons (their heroes and gear before).
- Hover or press to load a player's previous information from any time anyone met them.
- (Also asked: what the app is right now; a mobile version in the future; training RTA from the official match history.
  Answers are under Open.)

**Design**
- Each enemy team gets a verdict for the viewing member (their heroes + their gear). The player's dot is their weakest
  team **still standing** (cleared teams are ignored).
  - grey: no information.
  - red: lost to it 2+ times and never won (or 3+ losses to similar teams with no wins).
  - yellow: some information or a catch.
  - green ring: proven counter you own, gear not checked.
  - green: proven counter you own and gear checks out.
- "Proven" = beaten this exact team 2+ times with 0 losses, or 3+ wins at 80%+. Wording says "reliable", not
  "guaranteed" (crits and turn meter can always flip a fight).
- Gear check:
  - Your speeds come from your gear.txt on this device (computed with `RTAGear`; nothing is uploaded).
  - Each counter hero must be no more than 2 slower than the slowest speed that hero has won with.
  - Your fastest hero must beat the enemy's fastest recorded speed by at least 3%. That speed is the latest per hero
    from any earlier time anyone recorded this player, and this war's entry overrides it.
  - Too close to call or slower → yellow, with the numbers in the reason.
- Red and green are deliberately separate colours, plus a ring for "proven, gear not checked", so a colour-blind
  reader can still tell filled from hollow.

**Changed**
- `js/guildwar.js`:
  - `counterBook` keeps the slowest winning speed per hero (`winSpeeds`).
  - New: `recordVs`, `enemySpeeds`, `teamVerdict`, `gearCheck`, `targetVerdict`, `playerProfile` (appearances
    newest first, latest and highest speed per hero, builds noted, seasons, record), `LEVELS`, `PROVEN`.
  - Verdict text uses hero names (a name function is passed in).
- Records: `war.season` (asked when starting a war, pre-filled with the last one); `attack.speeds` (attacker's own
  speeds, attached only when you log your own attack and "Attach my hero speeds" is on in Setup, which is the default).
- `js/guild-app.js` / `guild.html`:
  - Dots on every player and team, a one-line reason under each team, a legend and a filter by dot.
  - Tap a dot or name to open the player history window: verdict per team with reasons, heroes over time, builds,
    every meeting in every war and season with attacks and speeds, and your own RTA record vs that name (this device
    only, labelled `my RTA`, not shared).
  - The Enemies list shows dots too.
  - Setup shows whether your gear was found and has the share-speeds toggle.
  - The page now also loads `js/gear.js` + `js/sources/fribbels-data.js` to compute your speeds.
- CSS: `.gwdot` styles (filled / ring / glow), legend, wide dialog.

**Tested**
- `npm test`: 61 passing (new: grey, red, yellow ×3 cases, proven without gear, green with gear, yellow when slower,
  weakest-team player dot, profile across 2 seasons).
- Browser, with a guild history seeded from "other members" over Season 11 and 12 and gear for this device:
  - The expected dots everywhere: green "280 vs their fastest ~250", using Seaside Bellona's speed from last season;
    red for a team lost to twice (also caught on another player with the same team); yellow for similar-only; grey for unknown.
  - Filtering red works; tapping a dot opens history spanning both seasons; without gear the green becomes a ring.
  - No errors; no sideways scrolling on phones. The earlier Guild War test still passes.

**Open / unverified**
- The thresholds (2 wins, 3%, 2 speed) are first guesses; easy to tune once the guild has real data.
- Gear check uses **speed only**. Other stats (effectiveness, crit, HP) aren't compared yet.
- Other members' gear isn't checked for "Also owned by" (only their roster). Their speeds appear once they log attacks.
- **Official RTA match history (owner's idea):** good source for training RTA. It can't be reached from the dev
  environment and needs the owner's login, which we must not handle. Plan: an "export my matches" bookmarklet the
  owner runs on the official site while logged in, which saves a file the RTA module imports as its own source
  (`official records`). Needs a screenshot or saved copy of the match-history page to build.
- **Mobile:** today every page works in a phone browser and can be installed, but automatic screen reading needs
  an Android app (screen capture permission + floating bubble). iPhone is very limited. Planned for after the PC
  version has been tested on the real game.

---

## 2026-11-12 · #8 · Epic 7 Engine home page and module switcher · this commit (previous: `2c0234e`)

**Asked for:** "Epic 7 Engine" is the overall application; under it you select Guild War, Gear, RTA "and the rest".

**Changed**
- `index.html` is now the **home page** (module picker). The RTA helper moved to **`rta.html`** (`git mv`, history kept).
  - Cards for RTA, Gear and Guild War, plus a "More coming" placeholder for future modules.
  - Each card shows a one-line status from this device's storage (`js/home.js`, new): matches logged and win %,
    gear items imported, and guild name with shared or local.
  - A short getting-started list.
- Every page has the same **app bar**: "Epic 7 Engine" (links home) plus a module switcher
  (RTA · Gear · Guild War, current one highlighted). A module's own tabs sit underneath in a second row.
  The old "Gear ↗ / RTA ↗ / Guild War ↗" links in each page's tabs were removed.
- `manifest.webmanifest`: installed-app shortcuts for RTA, Gear and Guild War (`start_url` stays the home page).
- `sw.js` cache `epic7-engine-v7` (adds `rta.html`, `js/home.js`); Pages workflow publishes `rta.html`.
- README and CLAUDE.md describe the home page + modules layout and how to add a module
  (a page, a home card, an app-bar link).

**Bugs found and fixed**
- Turn beep: the browser warned "AudioContext was not allowed to start" because the beep could fire before any
  click. It now only plays after the user has interacted with the page (`navigator.userActivation.hasBeenActive`).
- (Test only) The full RTA browser test stopped reading the opponent's name. The taller two-row header pushed the
  bottom of the calibration image below the test window, so the name box drag missed and the box was never saved.
  Checked that OCR itself still works (read "RivalOne"); made the test window taller. In real use you scroll.

**Tested**
- `npm test`: 56 passing.
- Browser:
  - Home page statuses are correct.
  - Each module link opens the right page with the right module highlighted and its own tabs; the brand returns home.
  - RTA tab switching still works; no sideways scrolling on phones for all 4 pages.
- All earlier browser tests re-run against `rta.html`:
  - Draft, postbans, OCR name, CR speeds, auto-recorded result.
  - Drafting help, gear sorter (same 248-item result), Guild War live sync. No console errors.

**Open / notes**
- Old bookmarks to `index.html` now open the home page (one click to RTA). RTA data is unchanged
  (same storage key `rta-helper-v2`).
- "More coming" is a placeholder; tell me which modules you want next.

---

## 2026-11-12 · #7 · Epic 7 Engine + Guild War (shared with the guild) · this commit (previous: `93abee7`)

**Asked for:** turn the app into a bigger toolkit, named **"Epic 7 Engine"** (the owner corrected an earlier
"RTA engine": it helps with the whole game, not just RTA). Add a Guild War feature that tracks everything for every
player and is shared between guildmates.

**Decisions (asked and answered)**
- "Guild Wars" = **Epic Seven's Guild War mode**, not the separate game Guild Wars 2.
- Sharing: **free Firebase** (Firestore + anonymous sign-in), chosen over sharing files in Discord or a GitHub repo.
- Rename now.

**Research:** Firebase JS SDK 10.12.2 "compat" builds load from `www.gstatic.com` (checked: HTTP 200), so no build step is needed.

**Changed**
- Rename: page titles and headers ("Epic 7 Engine · RTA / Gear / Guild War"), shared nav links between the 3 pages,
  manifest (`Epic 7 Engine` / `E7 Engine`), `package.json` name `epic7-engine`, README intro, footer, CLAUDE.md.
  Service worker cache `epic7-engine-v6` now includes the guild files. Pages workflow publishes `guild.html`,
  `docs/` and `firestore.rules`. The repository name is unchanged.
- `js/guildwar.js` (new, pure): all guild data is a flat list of records (`member`, `war`, `target`, `attack`,
  `defense`, `settings`), and the newest copy of each record wins. Functions:
  - `warSummary` (cleared, attacks left per member per day)
  - `targetStatus`
  - `counterBook` (enemy defense → our attack teams with record)
  - `suggestCounters` (exact first, then 2-of-3 similar, plus which members own the team)
  - `assignmentIdeas`, `enemyHistory` (case-insensitive across wars), `memberStats`, `threatHeroes`
  - Rules (attacks per member per day = 2, teams per defense = 2) are shared settings, not hard-coded, because
    the current in-game numbers are unconfirmed.
- `js/sync.js` (new): one interface, two backends.
  - `local`: localStorage, with BroadcastChannel so other tabs update live.
  - `firebase`: Firestore `guilds/{code}/records/{id}`, live updates, anonymous sign-in, soft deletes.
  - Also: pasted-config parser (accepts the `const firebaseConfig = {...}` snippet) and invite links
    (`guild.html#g=<code>&c=<config>`). The hash never reaches a server and is cleared from the address bar after use.
- `guild.html` + `js/guild-app.js` (new): War, Counters, Members (my defense, defense log, share roster),
  Enemies and Setup (name, create/join guild, invite link, Firebase connect, rules, export/import that merges by
  newest record).
- Guild War data is its own source (`guild`) and is not mixed into RTA data. Sharing a roster sends only the codes
  of heroes you own (from the RTA helper's Fribbels import + owned ticks), never gear.
- `firestore.rules` (new): sign-in required, guild code at least 12 characters, known record types only, size limits,
  everything else denied. `docs/GUILD_SETUP.md` (new): 10-minute setup for the guild leader.

**Bugs found and fixed**
- A test expected only Bob for an assignment, but Ann also had attacks left (the test was wrong; fixed).
- Guild portraits were blank in screenshots: they loaded lazily and without `crossorigin`. Now loaded immediately (6/6 loaded).

**Tested**
- `npm test`: 56 passing. New tests: state merge/delete, war summary per day, counter book, exact vs similar
  counters with owners, assignments, enemy history, member stats, threats, local sync, **Firebase sync against a
  fake SDK** (anonymous sign-in, guild path, live updates, soft delete), config parsing, invite links.
- Browser (over http, local mode):
  - Guild created; war, defense and attacks logged; a second page updated live.
  - In war 2 a similar enemy defense showed "Beaten before by …" and suggested the member who owns that team;
    the attack form filled it in.
  - Counters, enemy history across wars, my defense and defense log work; the invite link opened in a fresh profile
    (lands on Setup, code saved, hash cleared).
  - No console errors; no sideways scrolling on phones; RTA and Gear pages still load with the new titles.

**Not tested / open**
- **Real Firebase not tested** (no project exists yet). Only the fake-SDK test covers that code. The first real
  connection should be checked by the owner following `docs/GUILD_SETUP.md`.
- Guild War rules defaults are assumptions and can be edited in Setup.
- Enemy defenses are entered by hand; reading them from the screen needs screenshots.
- Anyone with the guild code can edit everything (no per-member permissions yet).

---

## 2026-11-12 · #6 · Devlog started

**Asked for:** document everything in a devlog, with every modification and change.

**Changed**
- Added `DEVLOG.md` (this file), with entries #1–#5 written retroactively from the commit history and session notes.
- `CLAUDE.md`: new standing rule. Every change adds a devlog entry in the same commit.

**Tested:** documentation only; no code changed. `npm test`: 48 passing.

---

## 2026-11-12 · #5 · RexQian fork, game's drafting help, Gear Sorter · commit `96bdfde`

**Asked for**
1. Use the RexQian fork of the Fribbels optimizer, since the original is no longer updated.
2. Use RTA's built-in **drafting help** (the game's own pick and ban recommendations) to build our own database.
3. A gear sorter: what to keep, enhance, reforge, extract, sell or buy, and which hero each item suits.

**Research**
- RexQian fork (`github.com/RexQian/Fribbels-Epic-7-Optimizer`), last updated for patch 2026-08-28:
  - Its `heroData.js` still loads `herodata.json` and `artifactdata.json` from the same S3 bucket we already used
    (`e7-optimizer-game-data.s3-accelerate.amazonaws.com`).
  - The fork's newest data branch (`e7-data-291fab…`, 2026-10-29) has exactly the same 393 heroes as S3.
    The copy on its `main` branch is an older fallback (388 heroes).
  - `scanner.js` is identical to the original. The export is still `{"items": [...], "heroes": [...]}`, and items
    carry `gear, rank, set, level, enhance, main, substats[{type, value, rolls}], ingameEquippedId`.
  - Gear score (WSS, `backend/.../ItemDb.java`): substats only. %stats ×1, Speed ×2, Crit Damage ×8/7,
    Crit Chance ×8/5, flat Attack ×3.46/39, flat Defense ×4.99/31, flat HP ×3.09/174.
  - Reforge (level 85 → 90, `app/js/lib/reforge.js`), added per substat by roll count:
    %stats [1,3,4,5,7,8], Crit Chance +rolls, Crit Damage [1,2,3,4,6,7], Speed [0,1,2,3,4,4],
    Attack +11/roll, Defense +9/roll, HP +56/roll. Gaveleet's items can't be reforged.
    Maximum rolls at +15: Epic 9, Heroic 8, Rare 7.

**Changed**
- `js/gear.js`, `tools/update-fribbels-data.js`, Data tab text: data comes from the RexQian fork, with the S3
  bucket first and the fork's GitHub copy as fallback (both allow browser access). The built-in copy
  `js/sources/fribbels-data.js` was regenerated and now records `fork: RexQian/...`.
- Game's drafting help (new source `game help`):
  - `js/vision.js`: `GAME_HELP_STEPS` and `helpSlots()`. You box the first and last recommended icon, and
    N icons are spaced evenly between them.
  - `js/auto.js`: help icons are recognized each check. The same list twice in a row is saved once per
    draft step, via `App.addGameHelp`. Calibrated with **Calibrate game's drafting help**.
  - `js/learn.js`: `gameHelpStats()` builds `against` (enemy → recommended heroes), `with` (ally →
    recommended heroes), `picks`, `bans`, and follow-through (win rate when 2+ of your picks were recommended).
  - `js/logic.js`: new signal group `game help`. Live recommendation +3 for #1, 15% less per rank;
    the learned database adds +0.4 against / +0.25 with per time (max 5) and a ban signal for prebans.
    It also adds to postban suggestions.
  - `js/app.js` / `index.html`: `store.gameHelp`, a Data card (count, CSV export, delete), an on/off switch,
    a weight slider, a Teams card to browse the database, and a History card on follow-through.
- Gear Sorter (new page `gear.html` + `js/gear-app.js`, logic in `js/gearsort.js`):
  - WSS score, score after reforge, expected and best-case score at +15 (about 6 / 8 WSS per remaining roll).
  - Hero profiles: stat weights = 50% the substats the hero's current gear rolled into + 50% a class default
    (Speed is always ≥1), or your own per-hero override. Preferred main stats and sets come from current gear.
  - The item's fit for each hero is compared with what that hero wears in the slot, which gives "upgrade +N".
  - Verdicts (adjustable rules of thumb): Keep, Enhance, Reforge, Extract (level 85+), Sell.
  - Shop check form ("worth buying?").
  - Shares `gear.txt`: importing in either app updates both. The full inventory is stored in localStorage
    under `rta-gear-v1`; the main app's `fribbels` roster is updated too.
- Service worker cache `v5` and the Pages workflow now include `gear.html`. Links styled for the dark theme.

**Tested**
- `npm test`: 48 passing (new: reforge table, WSS, rolls left, inventory linking, verdicts, profile override,
  help strip layout, game-help database, game-help signals).
- Browser: a fake draft screen with a 3-hero help strip. All 3 recognized (90–92%), saved with the board,
  shown live in suggestions, and visible in the database card. A generated 248-item inventory gave
  Keep 115 / Enhance 31 / Reforge 6 / Extract 76 / Sell 20. Hero filter, profile sliders and shop check work.
  Importing on the gear page updated the main app (8 builds). No console errors; no sideways scrolling on phones.

**Open / unverified**
- The real drafting-help layout hasn't been seen (it may show win-% numbers or a grid). Needs a screenshot.
- Keep/Sell thresholds are rules of thumb. What extracting gives in the current game is unconfirmed; the UI says to check in game.
- No real `gear.txt` has been tested yet.

---

## 2026-11-12 · #4 · Gear builds, scouting, smarter drafting, more automation · commit `a05af7d`

**Asked for:** "all of" the 14 ideas proposed in #3's follow-up, plus storing what gear opponents may have
during a match. Question: will the app consider my gear, sets and artifacts, and opponents'?

**Research**
- Fribbels `scanner.js`: items link to heroes through `ingameEquippedId` = the hero's in-game `id`.
  Set ids are `SpeedSet` etc.; stat ids are `Speed`, `CriticalHitChancePercent`, etc.
- Hero base stats: `herodata.json` (S3), `calculatedStatus.lv60SixStarFullyAwakened.spd`, keyed by name,
  including `code`. Browsers can load it. 31 heroes have exclusive equipment with a speed option.
  Imprints never give speed.
- The official World Arena infographics (Stove) are drawn by scripts as images, with no table data.
- The official battle-record site (`epic7.gg.onstove.com`) returns 503 from the dev environment; not usable from here.

**Changed**
- `js/gear.js` (new): links equipped items to heroes and calculates speed exactly:
  `floor(base × (1 + 25% Speed set + 12% Revenge set) + flat speed)`; also sets and artifact.
  Built-in copy of the stats and artifact list: `js/sources/fribbels-data.js` (source `fribbels-data`).
- Scouting (new source `scouting`): a Draft panel per enemy hero (speed / sets / artifact), saved per player and
  per hero, and linked to the match when recorded. `Learn.scoutSummary()` gives median and low–high speed
  plus common sets and artifacts.
- Speed edge signal (`speed`): your gear speed vs the speed seen for that opponent, else for all players
  (±0.6 per enemy, 3% buffer). Draft speed check: your fastest vs their fastest.
- Auto (`js/auto.js`):
  - Postban detection (experimental): a pick slot that changes most from how it looked when confirmed,
    3 checks in a row.
  - Victory/Defeat OCR, recorded as source `auto`.
  - CR-bar reader: each fighter's portrait is matched along the bar, then `L.speedsFromCR()` uses your known
    speeds as reference (speed = CR / t).
  - Calibration supports step subsets (CR bar, result banner) and a setting for which end is 100%.
- Draft (`js/logic.js`): source weights (`ctx.sourceWeights`, with a per-source `bySource` breakdown),
  best pairs on 2-pick turns, first-pick safety, postban risk (with the opponent's ban habits), deny,
  role tags + `compositionWarnings()`, and meta datasets (`meta: <name>`, CSV import).
- `js/tune.js` (new): "Tune from my matches", a logistic regression on per-source team score differences.
  Learned stats are rebuilt without the match being scored. Needs 15+ matches.
- Session: today's record, streak, a warning after 3+ losses, rank points (optional field, SVG chart), and
  whether following suggestions wins more (`suggestLog` per draft).
- `js/pip.js` (new): always-on-top mini window (Document Picture-in-Picture, falls back to a pop-up).
- Shortcuts (1/2/3, U, N, W/L, P, R, ?) and a beep when your turn starts.
- Installable app: `manifest.webmanifest`, `icon.svg`, `sw.js` (offline); `.github/workflows/pages.yml`.

**Bugs found and fixed while testing**
- Results read from the screen were saved as `manual`: `matchFromDraft` hard-coded the source. Fixed.
- "all: 230–230" when there was only one reading; now shows "~230".
- Heroes table header indentation didn't match the edit script (no change applied; fixed and re-run).

**Tested**
- `npm test`: 40 passing.
- Browser on generated screens:
  - Gear speed of 242 for Arbiter Vildred (116×1.25+97), matching the hand calculation.
  - Full draft and both postbans detected; opponent name by OCR.
  - CR read gave 230/205/101/189 against true 230/205/100/190.
  - Victory OCR auto-recorded the match.
  - Pairs, deny, hotkeys and the mini-window fallback all work.
- Over http: service worker registered; offline reload works.

**Open / unverified**
- Opponents' sets and artifacts are typed by hand; the screen gives only speed.
- Battle records not possible from here; meta stats must be imported as CSV.
- Exclusive-equipment speed isn't in gear.txt (affected heroes are marked *).

---

## 2026-11-12 · #3 · Auto-detect the draft from the emulator window · commit `27195ef`

**Asked for:** make it fully automatic. The owner plays on PC with an emulator.

**Design**
- Browser screen capture (`getDisplayMedia`) of the emulator window; a screenshot file also works.
- One-time calibration: drag boxes over the slots. For pick columns, only the first and last box are drawn;
  the middle ones are spaced evenly. Saved as fractions of the frame so it survives resizing.
- Recognition (`js/vision.js`): every slot and portrait is shrunk to 16×16 RGB and compared by correlation,
  so overall brightness doesn't matter. Templates are official portraits at 3 crop sizes,
  plus `my corrections` (preferred) and optional `auto-learned`.
- The board becomes the draft through `L.boardToDraft()`, replayed in official order; it stops at the first
  gap or duplicate. Who picked first is worked out while only one side has picks. A new match starts when
  new prebans appear. **The draft never shrinks automatically.**
- OCR of the opponent's name with tesseract.js 5.1.1, loaded only when needed.

**Bugs found and fixed while testing**
- First version locked in a look-alike (Arbiter Vildred vs Vildred, 91% vs 89%) because detection ran
  before all portraits had loaded. Detection now waits for them.
- Correct heroes below the 72% bar stalled the draft (one unsure preban blocks the replay). Fixes: 7
  slightly shifted crops per slot, and a second rule that accepts a score down to 15 points lower when it
  leads the runner-up by 0.12 or more.
  Result: 90–97% on all slots.
- A corrected slot showed "103%"; display capped at 100%.
- `applyBoard` logic simplified to two rules (new match → replace; otherwise apply only if not smaller).

**Tested:** `npm test` 25 passing. A generated 1600×900 draft screen (zoomed, tinted, framed, JPEG) gave the
full draft with no clicks, OCR read "RivalOne", and a correction was preferred afterwards.

**Open:** needs real emulator screenshots to tune for the real art and layout.

---

## 2026-11-12 · #2 · Official hero list, separate sources, learning, players, presets · commit `a79a0a9`

**Asked for:** fully automatic; option A (an online database) or B (learn from my picks and bans); roster from
Fribbels `gear.txt`; player profiles; team presets and combos; "a powerful application". Also:
**keep data separated by source in case one is wrong**, and **never leak my email**.

**Research**
- Official hero list: `static.smilegatemegaport.com/gameRecord/epic7/epic7_hero.json`. Browsers can load it,
  it's in 10 languages, and it has 370 entries (368 playable after dropping NPC codes `c0xxx`).
  Earth is `wind` and Thief/Soul Weaver are `assassin`/`manauser`.
  This showed the first version's hand-typed list had mistakes (for example, the game classes Arbiter Vildred
  as an assassin).
- Portraits: `.../guide/images/hero/{code}_s.png`, which browsers can load.
- No public RTA stats feed exists; official pick/ban/win rates are only in image infographics.
  → Core = option B (learn from logged matches), with every source kept separate.

**Changed**
- `js/roster.js`: official list parsing, name matching, Fribbels import, CSV match import.
- `js/learn.js`: hero, matchup (a>b) and pair stats; smoothing (4 imaginary games at 50%); postbanned heroes
  left out of fighting stats; player profiles; best combos; preset records.
- Suggestions: every reason labeled with its source (`my notes`, `learned`, `game rule`, `presets`, `player`).
- New tabs: Teams (presets, best pairs/trios), Players, Data (source switches, imports, backup).
- Storage v2 with an upgrade from v1. `CLAUDE.md` added with the privacy rule and the separate-sources rule.

**Tested:** `npm test` 18 passing. Browser: v1 upgrade, Fribbels import (unknown names listed), CSV import as
`import:<name>`, profile-based predictions, presets. Commits use the no-reply identity; no personal details in the repo.

---

## 2026-11-12 · #1 · First version · commit `cef3808`

**Asked for:** "my own RTA live helper for Epic 7".

**Changed:** static browser app, no build step (opens from `index.html`, works on phones).
- Draft tracker in RTA order: 2+2 prebans, picks 1-2-2-2-2-1, then 1 postban each.
- Suggestions from tiers, counters and synergies you enter, plus element advantage.
- Speed tools: enemy speed from the CR bar (range for 0–5% random start CR), the speed needed to outspeed,
  and a turn order simulator with CR push.
- Hero database (60-hero starter list), match history with win rates, JSON export/import.

**Bugs fixed:** typing "Ravi" + Enter picked "Apocalypse Ravi"; Enter now prefers an exact match, then names
that start with the text.

**Tested:** `node --test` 9 passing; full-draft browser test; no sideways scrolling on phones.

---

## Entry template

```
## YYYY-MM-DD · #N · Short title · commit `<hash>` (add after committing, or say "this commit")

**Asked for:** what the owner requested (paraphrased).
**Research:** sources checked, facts found (with URLs/paths), anything that changed the plan.
**Changed:** files and behaviour, grouped by feature. Note new data sources and how they're kept separate.
**Bugs found and fixed:** symptom → cause → fix.
**Tested:** unit test count, browser checks, what was NOT tested.
**Open / unverified:** assumptions, guesses, things that need real data or the owner's input.
```
