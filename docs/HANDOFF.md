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
| `localStorage['e7-gearscan-boxes']` | `js/gear-scan.js` | Item-panel calibration boxes |
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
- **Gear:** `gear.txt` → `RTAGear.extractBuilds` (RTA speeds) and `RTAGearSort.slimInventory` (Gear Sorter). The screen
  reader `js/gear-scan.js` OCRs the boxed item panel → `RTAStatParse.itemFromReadings` → `GearApp.addScanned`
  (source `screen`, not linked to heroes).
- **Guild War:** records go through `RTASync`; `RTAGuildWar.buildState` builds the state, the newest copy of each record
  wins. Dots come from `targetVerdict`/`teamVerdict`, using your roster and speeds (computed from the RTA store's
  `fribbels.builds` with `RTAGear`), the guild's attacks (`winSpeeds`) and the enemy's recorded speeds across all
  wars/seasons. The pop-out is `js/guild-pip.js`; "Watch game" (`js/guild-watch.js`) OCRs the enemy name
  (`matchPlayer`) and posts the overlay layer `guild`.
- **Hero card:** `js/heroinfo.js` combines tags from `my notes` / `guild` / `ceciliabot` (`RTARoster.tagSources`),
  skill notes per source, CeciliaBot skill text (`CeciliaBot.loadHero`), and an epic7x link. Pages plug in storage with
  `HeroInfo.configure`.
- **Desktop app** (`desktop/main.js`):
  - Serves the files at `e7://app/` (one origin, so storage and channels are shared).
  - Auto-approves `getDisplayMedia` for the chosen display.
  - Overlay window: transparent, click-through, always on top, `setContentProtection(true)` so readers never read it.
  - Ctrl+Shift+O / Ctrl+Shift+E.

## 6. Testing

- **Unit:** `npm test` (Node 18+; `node --test tests/*.test.js`). 74 tests at the time of writing.
- **Browser end-to-end:** `bash tests/e2e/run-all.sh`. It serves the repo on :8766 and runs `tests/e2e/*.e2e.js` with
  Playwright. Fixtures are in `tests/e2e/fixtures/`, screenshots go to `tests/e2e/out/` (git-ignored). The tests build
  **generated** game screens (portraits drawn on canvases, text for OCR) because no real screenshots exist yet.
  They need internet (portraits, jsDelivr, CeciliaBot).
  - Each test prints `errors: []` at the end when clean; the runner fails otherwise.
  - Gotcha: calibration drags must stay inside the viewport. The app now scrolls the calibration image into view and
    caps it at 62vh.
- After a change, run both, and add a devlog entry with what was tested and what wasn't.

## 7. Status (end of DEVLOG #14)

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
cd desktop && npm run dist             # portable Windows .exe in desktop/dist/
```

**CI:**
- `.github/workflows/pages.yml` runs the tests and publishes the site from `main`.
- `.github/workflows/desktop-build.yml` runs the tests, then builds the Windows .exe on `windows-latest` for every push
  that touches the app (on `main` and the dev branch). It's uploaded as the artifact `Epic-7-Engine-windows`; `v*`
  tags also attach it to a GitHub Release.
