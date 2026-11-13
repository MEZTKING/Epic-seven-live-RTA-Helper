# Handoff — how Epic 7 Engine works, for whoever continues it

Read this first, then `CLAUDE.md` (rules), `DEVLOG.md` (history, newest first), `docs/SOURCES.md` (every outside
source and where it's used) and `docs/ROADMAP.md` (later plans).

## 1. What it is

**Epic 7 Engine** is a fan-made Epic Seven toolkit (the owner's name for it; not "RTA Engine"). It's a static browser
app with **no build step**: open `index.html`, or serve the folder. There's also an optional Electron desktop app in
`desktop/` for the overlay on top of the game.

| Page | Module | Main files |
|---|---|---|
| `index.html` | Home (module picker + status per module) | `js/home.js` |
| `rta.html` | RTA draft helper (tabs: Draft, Auto, Speed, Heroes, Teams, Players, History, Data) | `js/app.js` (UI + storage), `js/auto.js` (screen readers), `js/pip.js` (mini window) |
| `gear.html` | Gear Sorter + screen gear reader | `js/gear-app.js`, `js/gear-scan.js` |
| `guild.html` | Guild War (tabs: War, Counters, Members, Enemies, Setup), shared via Firebase | `js/guild-app.js`, `js/guild-pip.js`, `js/guild-watch.js`, `js/sync.js` |
| `live.html` | Live: screen detector, overlay preview, desktop app info | `js/live.js` |
| `overlay.html` | The overlay layer (transparent in the desktop app) | inline script |

Every page shares the same **app bar**: the brand links to home, then the module switcher (RTA · Gear · Guild War · Live).
A module's own tabs sit underneath. **A new module needs** a page, a card on `index.html` (+ status in `js/home.js`),
a link in every page's `.modules` nav, an entry in `sw.js` and in the Pages workflow copy list, and a manifest shortcut.

## 2. Owner's standing rules (also in CLAUDE.md)

1. **Privacy:** never put the owner's email, real name or personal details in commits, code, issues, PRs, artifacts
   or requests to outside services. Commits use the session's no-reply identity.
2. **Separate sources:** every data source is stored apart, can be switched off or deleted alone, and every suggestion
   reason is labeled with its source. Never merge one source into another.
3. **Fribbels:** use the RexQian fork (`github.com/RexQian/Fribbels-Epic-7-Optimizer`) for data and formats.
4. **Devlog:** every change gets a `DEVLOG.md` entry in the same commit (template at the bottom of that file).
5. **Sources doc:** every new outside source goes into `docs/SOURCES.md` in the same commit.
6. **Read only:** screen readers only READ the screen. Never send input to the game, never sniff or decode game
   network traffic, never handle the user's game login.
7. Later ideas go to `docs/ROADMAP.md`.

## 3. Code map

**Pure modules** (no DOM; `window.X` in the browser, `require()` in Node; unit-tested by `npm test`):

| File | Global | Does |
|---|---|---|
| `js/roster.js` | `RTARoster` | Official list parsing, name matching, Fribbels `gear.txt` roster, CSV match import, `epic7xUrl`, `tagSources` |
| `js/learn.js` | `RTALearn` | Learning from matches: hero/matchup/pair stats, player profiles, combos, scouting summary, sessions, suggestion follow-through, `gameHelpStats` |
| `js/logic.js` | `RTALogic` | Draft rules/state, `boardToDraft`, suggestion scoring (`scoreCandidate` with per-source `bySource`), pairs, postban risk, prebans, `TAG_GROUPS`/`TAGS`, `compositionWarnings`, speed maths, `speedsFromCR` |
| `js/tune.js` | `RTATune` | Logistic-regression weight tuning ("Tune from my matches") |
| `js/vision.js` | `RTAVision` | 16×16 portrait features, `classify`, confidence rule, calibration layout (slots, drafting-help strip), OCR name cleanup |
| `js/gear.js` | `RTAGear` | Hero stats/artifacts normalisation, `extractBuilds` (gear.txt → equipped items per hero), `computeBuild` (speed) |
| `js/gearsort.js` | `RTAGearSort` | WSS, reforge, rolls left, inventory slimming, hero stat profiles, fit, Keep/Enhance/Reforge/Extract/Sell |
| `js/guildwar.js` | `RTAGuildWar` | Guild records → state; war summary; counter book; counters/assignments; verdict dots; player profiles; `matchPlayer` |
| `js/sync.js` | `RTASync` | Shared storage: `local` (localStorage + BroadcastChannel) and `firebase` (Firestore); invite links |
| `js/screens.js` | `RTAScreens` | Screen detector (32×18 fingerprints, detect, stabilizer, gating) |
| `js/statparse.js` | `RTAStatParse` | OCR text → gear item (stat lines, set, slot, enhance, level, rank) |
| `js/ceciliabot.js` | `CeciliaBot` | CeciliaBot API: effect list → automatic tags, skill text rendering (pure parts tested) |
| `js/mysync.js` | `MySync` | My devices sync (PC ↔ phone): sections, three-way list merge, `syncOnce`, chunked Firestore remote, links (DEVLOG #27) |
| `js/diag.js` | `E7Diag` | Diagnostic report ("Copy report for Claude"): `log(area,msg,data)` → `localStorage['e7-diag-log']` (300 lines), `report()`, `provider(name, fn)`; never includes sync key / Firebase settings / guild codes (DEVLOG #29) |
| `js/layouts.js` | `E7Layouts` | Built-in screen positions (Steam 16:9: draft by eye, result exact), `effective` (built-in + yours), per-part `status`, `ownOnly` (DEVLOG #25) |
| `js/faces.js` | `RTAFaces` | Round hero-icon matcher: masked 32×32 NCC vs official portraits (+ face corrections), confidence = score ≥0.80 and lead ≥0.10 (DEVLOG #23) |
| `js/vision/core.js` | `E7VisionCore` | Game-watcher event bus (`createBus`: publish/on/request/handle, fact log) and `repeatGate` |

**Game watcher (vision service, DEVLOG #21):** one watcher captures the game, detects the screen and runs readers; modules
only receive events.
- `js/vision/hub.js` (`E7Vision`): the watcher. Hosted by `vision.html` (desktop: hidden window started with the app,
  `data-vision-host="always"`) or `live.html` in a browser (`data-vision-host="browser"`); does nothing elsewhere.
  Answers `start`, `stop`, `status`, `snapshot`, `teach`; publishes `vision:status` (3 s), `vision:started`/`stopped`,
  `vision:warning`, `screen:changed`. One shared tesseract worker for all readers.
- `js/vision/bus.js` (`E7Bus`, BroadcastChannel `e7-vision`), `js/vision/client.js` (`VisionClient`: status, ensure,
  teach, snapshot for drawing boxes), `js/vision/panel.js` (status/readers/events panel).
- Readers `js/vision/readers/gear-item.js` → `gear:item`; `guild-name.js` → `guild:name-read`.
- Consumer `js/vision/consumers/gear.js` (runs next to the watcher) saves items via `js/gearstore.js` (`GearStore`) and
  publishes `gear:added` / `gear:dup`. The Guild War page itself consumes `guild:name-read` (it needs the guild data).
- **RTA reader:** `js/auto.js` still captures on its own, but in the desktop app it **follows the watcher** (starts/stops with
  it, same window; `followWatcher`, DEVLOG #28). Moving its readers into `js/vision/readers/` is step 1b part 2.
- Developer tool (desktop menu **Developer**): the watcher saves PNG + JSON notes on scene changes (`devTick` in hub.js);
  `E7Desktop.dev()/saveDevShot()`; main writes to `Pictures/Epic 7 Engine/<date>/`.
- Gear art: `js/gear-icons.js` (`E7GearIcons.slot/set`), original SVG (not game art).

**Browser-only helpers:** `js/screen-watch.js` (`E7Screens`), `js/overlay-bus.js` (`E7Overlay`), `js/heroinfo.js`
(`HeroInfo` card, `data-hero` attribute opens it anywhere).

**Built-in data copies** (generated; refresh with `npm run update-heroes` / `npm run update-fribbels-data`):
`js/sources/official-heroes.js`, `js/sources/fribbels-data.js`.

## 4. Storage (all on the user's device unless noted)

| Key / place | Owner | Content |
|---|---|---|
| `localStorage['rta-helper-v2']` | `js/app.js` | RTA store: `official`, `custom`, `fribbels` (roster + `builds`), `fribbelsData`, `notes` (tier, counters, synergies, notes, **tags**, **skills**), `manualOwned`, `mySpeeds` (typed speed per hero, source `my speeds`; wins over gear.txt), `presets`, `matches` (each with `source`), `matchSources`, `meta`, `scouting`, `gameHelp`, `settings` (source switches, `sourceWeights`, …), `draft` (+ `id`, `suggestLog`), `pending`, `sim`, `auto` (calibration `regions`, thresholds, `corrections`, `helpCount`, `crEnd`…). The RTA page reloads it on the `storage` event, because other pages write it too |
| `localStorage['rta-helper-v1']` | legacy | First version's data; upgraded automatically (`migrateV1`) |
| `localStorage['rta-gear-v1']` | `js/gear-app.js` | Gear Sorter: `items` (gear.txt inventory), `scanned` (source `screen`), `useScanned`, `rules`, `overrides` |
| `localStorage['e7-guild-conn']` | `js/guild-app.js` | `guildCode`, `guildName`, `myName`, Firebase `config`, `shareSpeeds`, `watchBox` |
| `localStorage['rta-guild-<code>']` | `js/sync.js` local backend | Guild records when Firebase isn't connected |
| `localStorage['e7-guild-heroes']` | `js/guild-app.js` | Cache of guild hero notes for other pages (read-only there) |
| `localStorage['e7-screens']` | `js/screen-watch.js` | Screen fingerprints `[{screen, fp, at}]`, shared by all modules |
| `localStorage['e7-gearscan-boxes']` | `js/gear-scan.js` | Item-panel calibration boxes (fractions of the game area) |
| `localStorage['e7-vision-log']` | `js/vision/core.js` | Last 200 game-watcher facts (`gear:*`, `guild:*`, `screen:changed`, `vision:started/stopped/warning`), shown on the Live / Gear pages |
| `localStorage['e7-mysync']` | `js/mysync-app.js` | My devices sync: `{key, config, enabled, device, sections:{id:{hash,at,ids}}, changedAt, lastAt, last, error}`. Cloud: Firestore `personal/{key}/sections` + `chunks` |
| `localStorage['e7-gear-view']` | `js/gear-app.js` | Gear list view: `cards` (default, game-like tiles + details card), `table` or `heroes` (gear per hero) |
| IndexedDB `e7-pictures` | `js/pictures.js` | Saved game pictures (newest 24) to calibrate on after a match (choose the part first: draft, one box, CR, expanded CR, result, drafting help): Ctrl+Shift+S (desktop), "Save a game picture", or auto every 15 s while RTA isn't calibrated |
| `rta-helper-v2`.`auto.faceCorrections` | `js/auto.js` | Face-matcher copies of your corrections on round slots (`{code, q}`) |
| Desktop `config.devCapture` + `Pictures/Epic 7 Engine/<date>/` | `desktop/main.js`, `js/vision/hub.js` | Developer tool: automatic PNG + JSON notes when the scene changes |
| `localStorage['e7-frame-of']` | `js/game-area.js` | Which picture each module's calibration boxes were drawn on (`{rta, gear, guild}` → `window` / `area:x,y,w,h` / `full`); readers warn once when it changed |
| `localStorage['e7-game-area']` | `js/game-area.js` | Where the game is inside a whole-screen capture: `{x,y,w,h}` fractions + capture size `fw,fh`, or `{full:true,fw,fh}`. Asked again when the capture size changes; "Reset game area" buttons clear it. `overlay.html` reads it too |
| `localStorage['e7-cecilia-heroes']`, `['e7-cecilia-hero-<slug>']`, `['e7-use-cecilia']` | `js/ceciliabot.js` | CeciliaBot effect list (weekly), per-hero skills (weekly), on/off |
| BroadcastChannel `e7-overlay` | `js/overlay-bus.js` → `overlay.html`, `js/live.js` | Overlay layers `{layer, items}`; items use fractions of the game frame |
| BroadcastChannel `rta-guild-<code>` | `js/sync.js` | Live sync between tabs in local mode |
| **Firestore** `guilds/{code}/records/{id}` (shared) | `js/sync.js` | Records `member`, `war` (+`season`), `target`, `attack` (+`speeds`), `defense`, `settings`, `hero`; soft deletes; rules in `firestore.rules` |

**Source labels used in the app:** `official`, `custom`, `fribbels`, `fribbels-data`, `my notes`, `learned`, `game rule`,
`presets`, `player`, `meta: <name>`, `speed`, `deny`, `scouting`, `game help`, `ceciliabot`, `guild`, `my speeds`,
`my corrections` / `auto-learned` (recognition templates), `screen` (screen-read gear), and match sources
`manual` / `auto` / `import:<name>`.

## 5. How the main flows work

- **RTA auto:**
  1. `js/auto.js` captures the emulator window (or uses a screenshot file), reads each calibrated slot at 7 crops, and
     calls `RTAVision.classify` against the official portraits plus corrections.
  2. A slot counts once it gives the same answer twice. The board becomes the draft through `RTALogic.boardToDraft`,
     which never shrinks the draft; new prebans mean a new match.
  3. Other readers: postbans (slot appearance change), the game's drafting-help strip (`gameHelp`), opponent name
     (OCR), Victory/Defeat (OCR → match source `auto`), the CR bar (normal or expanded) → `speedsFromCR` → scouting.
  4. Readers are gated by `E7Screens.allowed(screen)` once that screen has been taught. The overlay layer `rta` is
     posted from `postOverlay()`.
- **Suggestions:** `RTALogic.scoreCandidate` adds signals by source group: my notes, learned, game rule, presets,
  player, meta, speed, deny, game help. `sourceWeights` scales each group (sliders or `RTATune`).
- **Gear:** `gear.txt` → `RTAGear.extractBuilds` (RTA speeds) and `RTAGearSort.slimInventory` (Gear Sorter). Screen
  reading: the game watcher's `gear-item` reader OCRs the boxed item panel → `RTAStatParse.itemFromReadings` →
  `gear:item` → gear consumer → `GearStore.addScanned` (source `screen`, not linked to heroes) → `gear:added`. The Gear page
  (`js/gear-scan.js`) draws boxes on a watcher snapshot, teaches the screen, and reloads on `gear:added` / storage.
- **Guild War:** records go through `RTASync`; `RTAGuildWar.buildState` builds the state, the newest copy of each record
  wins. Dots come from `targetVerdict`/`teamVerdict`, using your roster and speeds (computed from the RTA store's
  `fribbels.builds` with `RTAGear`), the guild's attacks (`winSpeeds`) and the enemy's recorded speeds across all
  wars/seasons. The pop-out is `js/guild-pip.js`; "Watch game" (`js/guild-watch.js`) starts the game watcher, whose `guild-name`
  reader sends `guild:name-read`; the page matches it (`matchPlayer`) and posts the overlay layer `guild`.
- **Hero card:** `js/heroinfo.js` combines tags from `my notes` / `guild` / `ceciliabot` (`RTARoster.tagSources`),
  skill notes per source, CeciliaBot skill text (`CeciliaBot.loadHero`), and an epic7x link. Pages plug in storage with
  `HeroInfo.configure`.
- **Built-in layout** (DEVLOG #25): in window mode the title bar is cut off (`GameArea.window16x9`, same rule in
  overlay.html), so the game picture is 16:9; `js/auto.js` `regions()` = `E7Layouts.effective(own boxes, layoutFor(w,h))`.
  Your boxes (`rta-helper-v2`.`auto.regions`) only hold what differs from built-in. Auto tab card shows per-part status.
- **Game area** (`js/game-area.js`): every reader (RTA `auto.js`, Guild `guild-watch.js`, Gear `gear-scan.js`) passes its
  capture video through `GameArea.wrap(video)`. The first time (or when the capture size changes) the user boxes the
  game window; from then on readers get a canvas holding only the game (refreshed every 100 ms), so all calibration
  boxes are fractions of the game, not the screen. In desktop mode `overlay.html` maps overlay positions back to the
  real screen with the same box. Test: `tests/e2e/game-area.e2e.js`.
- **Desktop app** (`desktop/main.js`):
  - Serves the files at `e7://app/` (one origin, so storage and channels are shared).
  - Auto-approves `getDisplayMedia` for the chosen display.
  - Overlay window: transparent, click-through, always on top, `setContentProtection(true)` so readers never read it.
  - Ctrl+Shift+O / Ctrl+Shift+E.
  - **Capture** (`config.capture` in the app's `config.json`): `{mode:'window', id, name}` = only the game window
    (picked in `desktop/picker.html`, matched again by id then title), or `{mode:'screen', …}`. `null` → the picker
    opens on the first `getDisplayMedia`. Pages see it through `desktop/preload.js` → `window.E7Desktop`
    (`capture()`, `pickWindow()`, `onCapture()`, `zoom()`/`onZoom()`); `js/game-area.js` skips the box in window mode, `overlay.html` uses no
    mapping. Menu **Game window**.
  - **Overlay follows the game window** (Windows): `desktop/wintrack.js` runs one PowerShell loop reading
    `DwmGetWindowAttribute` / `IsIconic` / `GetForegroundWindow` (read-only); the overlay is moved to the window
    (`screen.screenToDipRect`) and hidden when it's minimized or another program is in front.
  - **Updater** `desktop/updater.js`: installed app = electron-updater (GitHub provider, asks before download, restart to
    install); portable = GitHub API `releases/latest` → download `*-portable.exe` as `<exe>.update` → `.cmd` swaps it
    after exit. Checks 10 s after start and from the menu.
  - Pop-outs (`js/pip.js`, `js/guild-pip.js`) use `window.open` in Electron: Document PiP's `requestWindow` hangs there.
  - **Zoom is per origin** in Chromium, so all `e7://app` windows share `config.zoom`. The overlay therefore never calls
    `setZoomFactor`; `overlay.html` scales items by `overlayZoom / zoom`.
  - Window mode on Windows: the overlay is hidden until the game window is found (retried every 4 s).
  - Text size: pages open at 125% zoom (`config.zoom`, saved in the app's config file). View menu: Ctrl+= bigger,
    Ctrl+- smaller, Ctrl+0 back to 125%. Overlay menu: bigger/smaller overlay text (`config.overlayZoom`).

## 6. Testing

- **Unit:** `npm test` (Node 18+; `node --test tests/*.test.js`). 74 tests at the time of writing.
- **Browser end-to-end:** `bash tests/e2e/run-all.sh`. It serves the repo on :8766 and runs `tests/e2e/*.e2e.js` with
  Playwright. Fixtures are in `tests/e2e/fixtures/`, screenshots go to `tests/e2e/out/` (git-ignored). The tests build
  **generated** game screens (portraits drawn on canvases, text for OCR) because no real screenshots exist yet.
  They need internet (portraits, jsDelivr, CeciliaBot).
  - Each test prints `errors: []` at the end when clean; the runner fails otherwise.
  - Gotcha: calibration drags must stay inside the viewport. The app now scrolls the calibration image into view and
    caps it at 62vh.
- **Real screenshots:** `tests/fixtures/screens/` (Steam client, cropped to the game, names blacked out). Checks that run
  the current readers on them: `tests/real/ocr-victory.js`, `tests/real/match-portraits.js` (serve the repo on :8766
  first). They print results; no labelled answers yet.
- **Desktop app:** `tests/desktop/*.js` drive the packaged Linux build under Xvfb + Openbox (`withwm.sh`).
- After a change, run both, and add a devlog entry with what was tested and what wasn't.

## 7. Status (end of DEVLOG #30)

**Debugging with the owner:** ask for **Copy report for Claude** (RTA → Auto, Live, Gear, Guild War, or desktop
Developer menu) and have it pasted into the chat. It shows what every RTA slot sees, the gate, layout status and a log.
**RTA draft gate:** live reading of picks only after ≥ 2 pre-bans are recognised, for 5 min after the match-start screen
(`rta-intro`, taught), or when the draft screen is taught; the RTA menu (`rta-lobby`) closes it; never on the pre-ban picker
(`rta-preban-pick`, **built-in signature**: `js/sources/screen-refs.js` from `tools/make-screen-refs.js`).


**Direction:** `docs/DESIGN_REVIEW.md` (two outside architecture reviews + the agreed plan: vision service, layout packs from real
screenshots, IndexedDB, glyph reader).


**Game client:** works with any PC window (Steam version, official PC client, Google Play Games, emulators), because
it only reads the screen; calibrate per client. **Fribbels' gear importer does NOT work with the Steam version**
(owner, 2026-11-12). Steam players get gear from the screen gear reader and type key hero speeds (RTA → Heroes → Edit
→ My speed) until the hero-gear-screen reader exists.

Built and tested on generated data:
- RTA: draft reading, suggestions, learning, scouting, CR speeds, drafting-help capture, overlay layer.
- Gear Sorter and screen gear reader.
- Guild War: sync, dots, pop-out, Watch game.
- Live page, hero card with CeciliaBot skills and automatic tags.

**Never tested on the real game or real accounts:**
- every screen reader (needs real screenshots: draft, drafting help, postban, battle/CR bar incl. expanded,
  Victory/Defeat, Guild War enemy screen, item details)
- the real `gear.txt`
- a real Firebase project
- the desktop app (no display in the dev environment)

Next steps (see `docs/ROADMAP.md`):
- tune the readers on real screenshots and add default box positions per emulator resolution
- Guild War defense/result reading
- gear from hero screens
- the official match-history export bookmarklet
- the PvE & events module
- the Android app

## 8. Handy commands

```
npm test                               # unit tests
bash tests/e2e/run-all.sh              # browser tests
npm run update-heroes                  # refresh js/sources/official-heroes.js
npm run update-fribbels-data           # refresh js/sources/fribbels-data.js (RexQian fork data)
python3 -m http.server 8766            # serve locally (needed for service worker / BroadcastChannel tests)
cd desktop && npm install && npm start # desktop overlay app
cd desktop && npm run dist             # Windows installer + portable .exe in desktop/dist/ (needs Windows or wine)
cd desktop && npx electron-builder --linux dir --publish never   # packaged Linux build, for tests here
xvfb-run -a tests/desktop/withwm.sh tests/desktop/winpick.js   # also popout.js, zoom.js, cancel.js, watcher.js, devshots.js; $PWD/desktop/dist/linux-unpacked/epic7-engine-desktop /tmp  # desktop checks (also popout.js)
```

**CI:**
- `.github/workflows/pages.yml` runs the tests and publishes the site (GitHub Pages) from `main` **and the work branch** (the
  repo's default branch; there is no `main`). Needs Settings → Pages → Source = GitHub Actions (owner, one time).
- `.github/workflows/desktop-build.yml` runs the tests, then builds on `windows-latest` for every push that touches the
  app (on `main` and the dev branch). Version = `0.1.<run number>`. It publishes **Release `v0.1.<n>`** (latest) with
  `Epic-7-Engine-Setup-<v>.exe` (+ `.blockmap`, `latest.yml`) and `Epic-7-Engine-<v>-portable.exe`, and also uploads
  them as the artifact `Epic-7-Engine-windows`. The in-app updater reads these Releases, so **every push to the dev
  branch that touches the app ships an update to the owner**. Don't push broken app code.
