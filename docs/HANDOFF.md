# Handoff — how Orbis Lens works, for whoever continues it

> **Name (DEVLOG #81):** the app is called **Orbis Lens** (before: Epic 7 Engine). The desktop build still has `productName`
> "Epic 7 Engine", `appId` `app.epic7engine.desktop` and the package name `epic7-engine-desktop` ON PURPOSE: they set the
> data folder (%APPDATA%\\Epic 7 Engine), the install folder and the update channel. Shortcuts / Apps list say Orbis Lens
> (`nsis.shortcutName`, `uninstallDisplayName`); the installed .exe file keeps its old name.

Read this first, then `CLAUDE.md` (rules), `DEVLOG.md` (history, newest first), `docs/SOURCES.md` (every outside
source and where it's used), `docs/ROADMAP.md` (later plans) and, for anything about top players' games,
`docs/E7DAT_NOTES.md`.

## 0. Where things stand (end of DEVLOG #73, 2026-11-18) — read this before touching anything

**The owner** plays the Steam PC client on Windows (game window maximized, 2560×1392, not 16:9), is not a
programmer, wants everything automatic, and tests by installing the Windows build and sending screenshots. Write to
them in plain words; say what was tested and what was not.

**How work reaches the owner.** There is ONE branch, `ccr-2c9db930-kqvr1r` (it is the repository's default branch;
there is no `main`). Every push that touches the app builds a Windows release (`.github/workflows/desktop-build.yml`,
version `0.1.<run number>`) and the installed app offers it at its next start. So: **never push broken app code**,
run the suites first (§6), and one DEVLOG entry per commit.

**What exists and how far it is verified**

| Area | State | Verified on the owner's PC? |
|---|---|---|
| Desktop app, overlay on the game, updater | Works | Overlay shown over the game (screenshot, #35–#37). Update dialogs: not seen |
| Official record site: find me, import my matches, top-player update | Works | **Yes** (screenshots #46, #49: 97 games imported, 400 players, 33,953 games) |
| Top-player model (win rate, pick policy, bans, pre-bans, turn order), statistics tab, team plans | Works on real games here | Model fitted on their PC (58% on 6,006 unseen games). Statistics tab / plans / turn order: **not yet looked at by the owner** |
| Seasons (History → Seasons, statistics per season) | Works in tests | No |
| RTA draft read from the screen without calibration | **Whole real match since #63** (owner's pictures, 2000×1070): pre-bans 4/4, picks 10/10, both bans, first pick, opponent's name from the battle, guildmate → for fun | Before #63 on the owner's PC: heroes 10/10, 6/10, 0/10, pre-bans never. #63 itself not yet seen on their PC |
| Guild War: overview → war starts by itself, fortress maps (names in any writing), enemy defense / stronghold screen (name + 6/6), standby page, changed defenses, "working…" card | Works on the owner's real screenshots | Auto-war seen working (#46). Names in a running war were wrong on their PC before #55 / #56; **not yet confirmed fixed there**. Standby / reminder / beaten marking: not yet |
| Gear Sorter, screen gear reader | **Built-in item panel since #74** (owner's 2000×1070 inventory pictures: 7/7 items exact); verdict + whom it suits on the overlay. **Full format (#77):** a whole screen at once, 32/32 tiles exact on two pictures | Not yet seen on their PC |
| Guild sharing through Firebase | Built; local mode tested | No real Firebase project connected |

**Waiting on the owner (ask for these; they unblock the most):**
1. **A diagnostic report after a few RTA matches with #63** (pre-bans, bans, opponent name, "for fun"); pictures
   of MY turn with a hero hovered (shown on my card) before Confirm are still missing (the owner's match had only the opponent's turn).
   Whether DeepSeek may be used inside the app for unsure names (DEVLOG #63, Open).
2. Guild War, **as files** (a picture sent while a reply is still being written reaches the session only as a
   picture, not as a file, and cannot become a fixture: ask for it again in a normal message):
   - the END of a Guild War fight (the Victory / Defeat screen after each round) and round 2 of a fight
   - a map with a note bubble (megaphone) on a badge, whole screen, and the window that opens when a note is
     WRITTEN
   - a right-hand fortress map during a war (the list of fixed places has only one map of it)
   - a result window titled "Attack Draw", and one where a single ROUND is a draw (open a row with crossed swords in front on a member's Season
     Log, or a shield row on an enemy's), one with a Draw, one with a round won and a round lost
   - the screen right after a war ends; an enemy map with at least one beaten defender; a map with Korean names
   (Received as files 2026-11-16: guild hall, VS screen, overview of a running war, maps of a Japanese guild, the
   check-in windows, an enemy stronghold screen, two "Successful Attack" and one "Failed Defense" window, a
   member's tower page, our own map, the Offense Team screen, two moments of a fight, a note window → DEVLOG
   #55–#58.)
3. A report of how #46–#59 behave on their PC: first the names on a map, the "working…" card and the battle
   results logged by themselves (#56, #57); then the standby banner, reminder notification, statistics tab, team
   plans, "you move first in about X%".
4. "Copy report for Claude" (RTA → Auto, Live, Gear, Guild War, or the Developer menu) whenever something misbehaves.

**Good next steps without the owner** (details in `docs/ROADMAP.md`): team plans and standby note on the in-game
overlay; ban forecast and similar-team records from E7DaT; the correction of turn order from my own matches; the
statistics tab's "what top players pick at this draft position"; moving the old RTA reader (`js/auto.js`) into
`js/vision/readers/`.

**Things that bite**
- `window.prompt()` throws in Electron → use `E7Ask` (`js/ask.js`); `tests/no-prompt.test.js` guards it.
- A new file in `desktop/` that `main.js` requires must be listed in `desktop/package.json` `build.files`, or the
  installed app does not start (`tests/desktop.test.js` guards it).
- Any element with `data-hero` opens the app's hero card on click; use another attribute for own click targets.
- Displayed portraits are plain `<img>`; pixel reading uses `PORTRAIT_URL_CORS` (mixing both on one URL breaks loading).
- A reader that takes more than a moment says so: `ctx.busy(text)` / `ctx.done(text, { ask })` (the card on the game,
  DEVLOG #56). Do not call `busy` from a reader that runs on every screen.
- A saved Guild War defense is "as last seen": players change them at any time. Never attribute an attack to the
  target's current team; use `attack.defense` (`GW.defenseOf`).
- `E7Bus.publish` payloads may hold small pictures (`pic` of a name): keep them small (JPEG, 40 px high).
- The repository is public: screenshots and fixtures must not show real player or guild names (replace them), and
  collected games (`tools/dev/out/`) are never committed.
- The record site's lookups are undocumented and were approved by the owner on 2026-11-14 (DEVLOG #44). Keep the
  0.35 s spacing and never send names (only player numbers). A cloud session's safety check may refuse the first
  outside request until the owner says yes again; do not work around a refusal.
- Commits: session's default no-reply identity; no model names, no personal details anywhere in the repository.

## 1. What it is

**Orbis Lens** is a fan-made Epic Seven toolkit (the owner's name for it; not "RTA Engine"). Since DEVLOG #37 it is
a **desktop app** (Electron, `desktop/`) that shows the static pages of this repository (no build step for the
pages) and puts an overlay on top of the game. The web (GitHub Pages) only hosts the Guild War page for guildmates.

| Page | Module | Main files |
|---|---|---|
| `index.html` | Home (module picker + status per module) | `js/home.js` |
| `rta.html` | RTA helper (tabs: Draft, Auto, Speed, Heroes, Teams, Players, History, **Top players**, Data) | `js/app.js` (UI + storage), `js/auto.js` (old screen reader, follows the watcher), `js/records-app.js` (official record site), `js/topstats-ui.js` (statistics tab), `js/pip.js` (mini window) |
| `gear.html` | Gear Sorter + screen gear reader | `js/gear-app.js`, `js/gear-scan.js` |
| `guild.html` | Guild War (tabs: War, Counters, Members, Enemies, Setup), shared via Firebase | `js/guild-app.js`, `js/guild-pip.js`, `js/guild-watch.js`, `js/sync.js` |
| `live.html` | Live: screen detector, overlay preview, teach heroes, desktop app info | `js/live.js` |
| `vision.html` | The game watcher (hidden window in the desktop app) | `js/vision/hub.js` + readers |
| `overlay.html` | The overlay layer (transparent, on top of the game) | inline script |

Every page shares the same **app bar**: the brand links to home, then the module switcher (RTA · Gear · Guild War · Live).
A module's own tabs sit underneath. **A new module needs** a page, a card on `index.html` (+ status in `js/home.js`),
a link in every page's `.modules` nav (mark it `desktop-only` on `guild.html`) and an entry in `desktop/package.json`
`extraResources` if it adds top-level files. **Web (GitHub Pages) = Guild War only** (DEVLOG #37): `pages.yml` publishes
`guild.html` + `css/` `js/` `icon.svg` `firestore.rules` `docs/GUILD_SETUP.md`, the retired `sw.js` (clears old installs) and
`tools/web/moved.html` as `index/rta/gear/live.html` (offers "Save my RTA data" for old browser data, else goes to Guild War).

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
| `js/ask.js` | `E7Ask` | Questions inside the page (`E7Ask(msg, value)`, `.form(title, fields)`, `.show(msg, text)`). **`window.prompt()` does nothing in Electron**: never use it (`tests/no-prompt.test.js` checks) |
| `js/records.js` | `E7Records` | Official record site, pure part: `parseBattle` (one game → row), `toMatch` (row → one of my matches), `summary` (a player's habits and builds), seasons (`latestSeason`, `seasonTable`, `seasonForDate`, `seasonOfMatch`), `crawl` (ranking → players → games), `toStatsMatches` (DEVLOG #44, #48) |
| `js/topmodel.js` | `E7TopModel` | The model on top players' games (port of E7DaT's `stats.py` / `model.py` / `policy.py` / `recommend.py`): `build(rows, opts)` → stored statistics (format 2); `Model` (`logit`, `gain`, `winrate`, `pFirst`, `turnZ`), `Policy` (`slot`, `pair`), `Engine` (`rows`, `prebans`, `firstPicks`, `bans`, `turnInfo`, `speedThreats`); `turnOf`, `select`, `seasonPlan` (DEVLOG #45, #48, #51) |
| `js/teamplan.js` | `E7TeamPlan` | Whole-team plans (port of the core of E7DaT's `plan.py`): `search(engine, { own, enemy, taken, meFirst, pool })` → choices now + two plans (DEVLOG #52) |
| `js/topstats.js` | `E7TopStats` | Tables of the statistics tab: `overview`, `heroes`, `sortRows`, `partners`, `matchups`, `topPairs`, `topCounters`, `prebans`, `openers`, `builds`, `trends`, `sameBuild`, `turnLists` (DEVLOG #47, #49, #51) |
| `js/knowledge.js` | `E7Know` (`E7Knowledge` = built from `RTASources.e7datKnowledge`) | Hero mechanics as their own source 'E7DaT knowledge': `mechanics`, `versus`, `notesFor` (reasons / cautions with E7DaT's record-based filters), `threats`, `builds`, `opener` (DEVLOG #42) |
| `js/wide.js` | `E7Wide` | RTA pick cards from the heroes' wide portraits (`{code}_l.png`, skins; mirrored on my side): `slotBox`, `patchRect`, `template`, `match`, `isConfident` (DEVLOG #41, method from E7DaT) |
| `js/draftscreen.js` | `E7Draft` | RTA draft stage: text templates (`matchTemplate`, `tint`), confirmed-card check (`lockScore`), `Tracker` (stage, turn, first pick, picks, pre-bans, held), `toBoard` |
| `js/frame.js` | `E7Frame` | Where the game is inside a captured window / screenshot: title bar and thin borders found from the pixels (`detect`), any size (DEVLOG #38) |
| `js/gwmap.js` (also: `barKind`, `nameMask`, `pickRead`, `cleanCjk`, `serverOf`, `langFor`, `worldFor`, standby helpers) | `E7GWMap` | Guild War: defender badges with state (enemy / ours / beaten), `sideOf`, name boxes, letter mask, name cleaning/matching, which fortress (pager), overview switch (`toggleSide`) and fortress names (`fortNamesFromWords`); `DEFAULT_FORTS` |
| `js/teach.js` | `E7Teach` | Hero faces you taught (Live → Teach heroes; UI in `js/teach-ui.js`): add/remove/switch/export/import, `templates(F)` for the face matcher (source 'taught by you') |
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
| `js/diag.js` | `E7Diag` | Diagnostic report ("Copy report for Claude"): `log(area,msg,data)` → `localStorage['e7-diag-log']` (300 lines), `report()`, `provider(name, fn)`; never includes sync key / Firebase settings / guild codes (DEVLOG #29) |
| `js/layouts.js` | `E7Layouts` | Built-in screen positions (Steam 16:9: draft by eye, result exact), `effective` (built-in + yours), per-part `status`, `ownOnly` (DEVLOG #25) |
| `js/faces.js` | `RTAFaces` | Round hero-icon matcher: masked 32×32 NCC vs official portraits (+ face corrections), confidence = score ≥0.80 and lead ≥0.10 (DEVLOG #23) |
| `js/vision/core.js` | `E7VisionCore` | Game-watcher event bus (`createBus`: publish/on/request/handle, fact log) and `repeatGate` |

**Game watcher (vision service, DEVLOG #21):** one watcher captures the game, detects the screen and runs readers; modules
only receive events.
- `js/vision/hub.js` (`E7Vision`): the watcher. Hosted by `vision.html` (desktop: hidden window started with the app,
  `data-vision-host="always"`) or `live.html` in a browser (`data-vision-host="browser"`); does nothing elsewhere.
  Answers `start`, `stop`, `status`, `snapshot`, `teach`; publishes `vision:status` (3 s), `vision:started`/`stopped`,
  `vision:warning`, `screen:changed`, `vision:busy` (a reader is working on something slow or needs the user,
  DEVLOG #56). One tesseract worker per language (English always; others loaded when a name needs them).
- `js/vision/bus.js` (`E7Bus`, BroadcastChannel `e7-vision`), `js/vision/client.js` (`VisionClient`: status, ensure,
  teach, snapshot for drawing boxes), `js/vision/panel.js` (status/readers/events panel).
- Consumer `js/vision/consumers/gear.js` (runs next to the watcher) saves items via `js/gearstore.js` (`GearStore`) and
  publishes `gear:added` / `gear:dup`. The Guild War page itself consumes `guild:name-read` (it needs the guild data).
- **RTA reader:** `js/auto.js` still captures on its own, but in the desktop app it **follows the watcher** (starts/stops with
  it, same window; `followWatcher`, DEVLOG #28). Moving its readers into `js/vision/readers/` is step 1b part 2.
- Developer tool (desktop menu **Developer**): the watcher saves PNG + JSON notes on scene changes (`devTick` in hub.js);
  `E7Desktop.dev()/saveDevShot()`; main writes to `Pictures/Orbis Lens/<date>/`.
- Gear art: `js/gear-icons.js` (`E7GearIcons.slot/set`), original SVG (not game art).

- **Shared by readers:** `js/vision/names.js` (`E7Names.read`: one player name in any writing, DEVLOG #56; loaded
  before the readers). A reader's `ctx`: `source, w(), h(), crop, ocr(canvas, { line, lang, full }), ocrWords,
  publish, note, busy(text), done(text, { ask })`.
- **All readers** (`js/vision/readers/`, loaded by `vision.html` and `live.html`):

  | Reader | Publishes | Reads |
  |---|---|---|
  | `gear-item.js` | `gear:item`, `gear:gone` | Item details panel, built-in positions (`gear*` in `js/layouts.js`, #74), recognised by the yellow "Equipment Score"; drawn boxes still win |
  | `gear-grid.js` | `gear:grid { slot, tiles }`, `gear:grid-gone` | The inventory in the **Full** display format: every tile at once (stat icons `js/geargrid.js`, numbers, enhance, level, worn / locked / selected, set badge learned from the details panel; #77) |
  | `guild-name.js` | `guild:name-read { text, rect, options?, pic?, lang? }` | A player's name on a defense / stronghold screen, in any writing (`js/vision/names.js`) |
  | `guild-defense.js` | `guild:defense` | The six hero icons of a player's two defense teams (faces, no calibration; 3 of 4 places per team, stronghold shift) |
  | `guild-fortress.js` | `guild:fortress { side, index, fort, players, keep }` | A fortress map: which fortress, each defender's name and badge state (enemy / ours / beaten) |
  | `guild-overview.js` | `guild:forts { side, names, ourGuild, enemyGuild, ourServer, enemyServer, endsIn, endsAt }` | The overview: three fortress names, which side, both guild names and servers, "War Ends in …" |
  | `guild-standby.js` | `guild:standby { minutes, beginsAt, season }` | The standby page: no war running, time to the next one |
  | `guild-offense.js` (three readers) | `guild:offense { enemy, rect, mine, theirs }`, `guild:battle { round, left, right }`, `guild:note { author, text }` | The Offense Team screen (their defense, my teams), the fight ("Round 1" pill + names), a note window ("…'s Record") (DEVLOG #58) |
  | `guild-result.js` | `guild:result { type, ok, side, left, right, rounds }` | A battle-result window ("Successful Attack" / "Failed Defense" …): both players, both sides' two teams, each round's result (DEVLOG #57) |
  | `rta-draft.js` | `rta:draft`, `rta:draft-end`, `rta:stage` (every 4 s) | The RTA draft without calibration (stage texts, pick cards from wide portraits, pre-ban icons, my pre-bans in the pre-ban window, both bans from the formation screen, first pick) |
  | `rta-battle.js` | `rta:battle { me, opp, sameGuild }` | The battle's top bar after an arena draft: both names, servers, guilds (DEVLOG #63) |
  | `rta-cr.js` | `rta:cr { readings: [{ code, side, cr }] }` | The CR bar at the start of an arena battle (built-in place; DEVLOG #69) |
  | `rta-art.js` | `rta:art { names: [{ name, n, server }], sim }` | The opponent's profile art on the versus screen, looked up among arts seen before (DEVLOG #70) |
  | `arena.js` (three readers) | `arena:opponents { list }`, `arena:prep { name, pts }`, `arena:result { result, points, delta, mine }` | The Arena: opponents list, team set-up, result (DEVLOG #71) |

**Page parts for the official record site and top players** (not pure; `rta.html`, the first also `guild.html`):
- `js/records-app.js` (`E7RecordsApp`): settings, find me, import my matches, opponent panel, Guild War "Arena
  record", top-player update (by hand and at start), seasons cache, model storage and fitting (`loadModel`,
  `modelFor(season)`), draft-tab model line. Talks to the site only through `E7Desktop.records` (tests replace it with
  `window.__e7RecordsTest`).
- `js/topmodel-worker.js`: fits the model off the page's thread.
- `js/topstats-ui.js` (`E7TopStatsUI`): the Top players tab.

**Desktop app** (`desktop/`, Electron main process; every file here must be in `package.json` `build.files`):
`main.js` (windows, overlay, menu, IPC), `preload.js` (`window.E7Desktop` bridge), `picker.html` (which window is
the game), `wintrack.js` (follows the game window, PowerShell, read-only), `updater.js` (GitHub Releases; checks at
start), `records.js` (the ONLY code that talks to the official record site), `reminder.js` (Guild War reminder).

**Browser-only helpers:** `js/screen-watch.js` (`E7Screens`), `js/overlay-bus.js` (`E7Overlay`), `js/heroinfo.js`
(`HeroInfo` card, `data-hero` attribute opens it anywhere).

**Built-in data copies** (generated; refresh with `npm run update-heroes` / `npm run update-fribbels-data`):
`js/sources/official-heroes.js`, `js/sources/fribbels-data.js`.

## 4. Storage (all on the user's device unless noted)

Where "the user's device" is: the desktop app's own data folder (Electron `userData`; by the package name
`%APPDATA%\epic7-engine-desktop` on Windows, not checked there; menu Orbis Lens → "Open the folder where the
app keeps its data"): the pages' localStorage and IndexedDB, `config.json`, `records/` (player lists and games
from the official record site). Developer screenshots: `Pictures\Orbis Lens\<date>`. Nothing of it is in the
repository. The RTA store (`localStorage['rta-helper-v2']`) also holds `walkovers` since DEVLOG #60.

| Key / place | Owner | Content |
|---|---|---|
| `localStorage['rta-helper-v2']` | `js/app.js` | RTA store: `official`, `custom`, `fribbels` (roster + `builds`), `fribbelsData`, `notes` (tier, counters, synergies, notes, **tags**, **skills**), `manualOwned`, `mySpeeds` (typed speed per hero, source `my speeds`; wins over gear.txt), `presets`, `matches` (each with `source`), `matchSources`, `meta`, `scouting`, `gameHelp`, `settings` (source switches, `sourceWeights`, …), `draft` (+ `id`, `suggestLog`), `pending`, `sim`, `auto` (calibration `regions`, thresholds, `corrections`, `helpCount`, `crEnd`…). The RTA page reloads it on the `storage` event, because other pages write it too |
| `localStorage['rta-helper-v1']` | legacy | First version's data; upgraded automatically (`migrateV1`) |
| `localStorage['rta-gear-v1']` | `js/gear-app.js` | Gear Sorter: `items` (gear.txt inventory), `scanned` (source `screen`), `useScanned`, `rules`, `overrides` |
| `localStorage['e7-guild-conn']` | `js/guild-app.js` | `guildCode`, `guildName`, `myName`, Firebase `config`, `shareSpeeds`, `watchBox` |
| `localStorage['rta-guild-<code>']` | `js/sync.js` local backend | Guild records when Firebase isn't connected |
| `localStorage['e7-guild-heroes']` | `js/guild-app.js` | Cache of guild hero notes for other pages (read-only there) |
| `localStorage['e7-screens']` | `js/screen-watch.js` | Screen fingerprints `[{screen, fp, at}]`, shared by all modules |
| `localStorage['e7-gear-arts']` | `js/vision/consumers/gear.js` (learns), `js/vision/readers/gear-grid.js` (looks up), `js/gear-app.js` (gallery, renaming) | Gear designs `[{ id, fp, name, gear, rank, n, first, last, named }]` (#79); each design's picture is `art:<id>` in IndexedDB `e7-gear-pics`; screen items point to theirs with `item.art` |
| IndexedDB `e7-gear-pics` (store `pics`) | `js/gearpics.js` (written by the gear consumer, read by `js/gear-app.js`) | The game's pictures of each screen-read item `{ id, icon, shot, from: 'panel'|'grid', at }` (#78); a panel picture is not replaced by a grid one |
| `localStorage['e7-gear-setbadges']` | `js/vision/readers/gear-grid.js` | Set badges learned on this PC `[{ set, fp }]` (≤ 6 per set), next to the built-in ones in `js/gear-setseed.js` |
| `localStorage['e7-gearscan-boxes']` | `js/gear-scan.js` | Own item-panel boxes (fractions of the game area); optional since #74 (built-in positions otherwise) |
| `localStorage['e7-vision-log']` | `js/vision/core.js` | Last 200 game-watcher facts (`gear:*`, `guild:*`, `screen:changed`, `vision:started/stopped/warning`), shown on the Live / Gear pages |
| `localStorage['e7-arena']` | `js/arena-log.js` (next to the watcher) → `js/arena-app.js`, `js/home.js` | Arena: `now {at, list}`, `defs` (defenses by name, newest 300), `pending` (the fight being set up), `fights` (newest 2000: `{at, opponent, theirPts, defense, mine, result, points, delta}`) |
| `localStorage['e7-rta-arts']` + IndexedDB `e7-rta-arts` (store `pics`) | `js/vision/readers/rta-art.js`, `js/artstore.js` → RTA History gallery | Opponents' profile art: `[{ id, fp, names: [{ name, n, server, last }], first, last }]` (newest 400) and each art's picture `{ id, jpg, w, h, at }` |
| IndexedDB `e7-templates` (store `t`, keys `wide`, `icons`; `round` is no longer written since #63) | `js/vision/readers/rta-draft.js` (wide), `js/vision/icons.js` (round icons + skins) | Computed hero-picture templates kept between app starts: `{ sig, items }` (valid for the same picture list and month); only a cache |
| `localStorage['e7-records']` | `js/records-app.js` | Official record site settings: `me {world, name, nickNo}`, `autoImport`, `autoScout`, `lastImportAt`, `lastImport`, `top {players, at, season, games, rows}` |
| `localStorage['e7-records-seasons']` | `js/records-app.js` → `js/app.js` | The record site's season list `{ at, list: [{ code, name, start, end }] }` (oldest first), refreshed once a day |
| `localStorage['e7-records-players']` | `js/records-app.js` | Looked-up players (newest 30, fresh for 12 h): name, server, grade, summary of their last games |
| IndexedDB `e7-records` (version 2: stores `battles` by `seq`, `players` by `k`, `kv` by `k`) | `js/records-app.js` | Top players' games (parsed rows), the followed players with their newest stored game, and `kv` `model` = `{ sig, stats, at }` (the fitted top-player model, `js/topmodel.js`) plus `model:<season code>` (one season alone, for the statistics page) |
| `<userData>/records/users_<world>.json` (desktop) | `desktop/records.js` | The record site's player list per server, re-downloaded after 3 days |
| `localStorage['e7-window-frame']` | `js/game-area.js` (`windowFrame`) → `overlay.html` | Where the game is inside the captured window `{x,y,w,h}` fractions (title bar cut), so the overlay lines up at any window size |
| `localStorage['e7-gw-forts']` | `js/vision/readers/guild-overview.js` → fortress reader, Guild War page | Fortress names per side `{ ours: [3], enemy: [3], side, ourGuild, enemyGuild (this reading only), at }` (read on the overview; also kept on the war record as `forts`) |
| `localStorage['e7-gw-standby']` | `js/vision/readers/guild-standby.js` → `js/guild-app.js`, `js/guild-watch.js` | The game's standby page as last read: `{ at, minutes, beginsAt (estimated), season }`; holds until `beginsAt` or until a war is started after it |
| `localStorage['e7-gw-standby-undone']` | `js/guild-app.js` | Time you undid "marked finished" after a standby reading: not done again for 12 hours |
| Firestore / local `settings`.`nextWar` (shared) | `js/guild-app.js` (`standbyFromGame`) | `{ at, beginsAt, season, by }`: the next war's time as a member's game showed it |
| `localStorage['e7-gw-dismissed']` | `js/guild-app.js` | `{ enemyGuild: time }`: wars you undid after they were started from the game; not started again by themselves for 5 days |
| `localStorage['e7-gw-known-names']` | `js/guild-app.js` → `js/vision/readers/guild-fortress.js` | Enemy player names you already have (for matching what's read on a fortress map) |
| `localStorage['e7-gw-fort-cache']` | `js/guild-app.js` → `js/vision/readers/guild-fortress.js` | This war's scanned fortresses by place: `{ warId, enemy: { <0..2>: [{ name, pos, keep }] }, ours: {…} }` (built from the shared records) |
| `localStorage['e7-gw-pending-attack']` | `js/guild-app.js` (`offenseFromGame`, `battleFromGame`) | The attack being prepared / fought: `{ warId, enemy, mine, theirs, at, started, round }` (3 hours) |
| `localStorage['e7-gw-results']` | `js/vision/readers/guild-result.js` → `js/guild-watch.js` (`takeResults`) | Battle results read from the game that the Guild War page has not logged yet: `[{ id, at, d }]` (newest 12, 12 hours) |
| `localStorage['e7-gw-result-undone']` | `js/guild-app.js` (`resultFromGame`) | `{ "<war id>|<battle key>": time }`: battle results you undid; not logged again (newest 100) |
| `localStorage['e7-gw-name-fixes']` | `js/guild-app.js` (`saveFortress`) → fortress reader | `{ readText(lowercase): name }`: names you corrected after a fortress read, used next time |
| `localStorage['e7-face-examples']` | `js/teach.js` (Live → Teach heroes, `js/teach-ui.js`); read by `js/auto.js` and `js/vision/readers/guild-defense.js` | Hero faces you taught: `{on, examples: [{id, code, q, thumb, from, at}]}`, source label 'taught by you', ≤ 12 per hero / 500 total. |
| `localStorage['e7-gw-face-corrections']` | `js/guild-app.js`, `js/vision/readers/guild-defense.js` | Guild War icons you named: `[{code, q}]` (face examples, newest 300) |
| `localStorage['e7-match-trace']` | `js/matchtrace.js` | Per match (draft id): timeline events + last slot snapshot (newest 15) |
| `localStorage['e7-gear-view']` | `js/gear-app.js` | Gear list view: `cards` (default, game-like tiles + details card), `table` or `heroes` (gear per hero) |
| IndexedDB `e7-pictures` | `js/pictures.js` | Saved game pictures (newest 24) to calibrate on after a match (choose the part first: draft, one box, CR, expanded CR, result, drafting help): Ctrl+Shift+S (desktop), "Save a game picture", or auto every 15 s while RTA isn't calibrated |
| `rta-helper-v2`.`auto.faceCorrections` | `js/auto.js` | Face-matcher copies of your corrections on round slots (`{code, q}`) |
| Desktop `config.devCapture` + `Pictures/Orbis Lens/<date>/` | `desktop/main.js`, `js/vision/hub.js` | Developer tool: automatic PNG + JSON notes when the scene changes |
| `localStorage['e7-frame-of']` | `js/game-area.js` | Which picture each module's calibration boxes were drawn on (`{rta, gear, guild}` → `window` / `area:x,y,w,h` / `full`); readers warn once when it changed |
| `localStorage['e7-game-area']` | `js/game-area.js` | Where the game is inside a whole-screen capture: `{x,y,w,h}` fractions + capture size `fw,fh`, or `{full:true,fw,fh}`. Asked again when the capture size changes; "Reset game area" buttons clear it. `overlay.html` reads it too |
| `localStorage['e7-cecilia-heroes']`, `['e7-cecilia-hero-<slug>']`, `['e7-use-cecilia']` | `js/ceciliabot.js` | CeciliaBot effect list (weekly), per-hero skills (weekly), on/off |
| BroadcastChannel `e7-overlay` | `js/overlay-bus.js` → `overlay.html`, `js/live.js` | Overlay layers `{layer, items}`; items use fractions of the game frame. Layers: `rta`, `guild`, `gear`, `gear-grid` (a label per inventory tile), `busy` (the working card, posted by the watcher) |
| BroadcastChannel `rta-guild-<code>` | `js/sync.js` | Live sync between tabs in local mode |
| **Firestore** `guilds/{code}/records/{id}` (shared) | `js/sync.js` | Records `member`, `war` (+`season`), `target` (teams may hold `earlier` line-ups), `attack` (+`speeds`, +`defense` = the line-up attacked), `defense`, `settings`, `hero`; soft deletes; rules in `firestore.rules` |

**Source labels used in the app:** `official`, `custom`, `fribbels`, `fribbels-data`, `my notes`, `learned`, `game rule`,
`presets`, `player`, `meta: <name>`, `speed`, `deny`, `scouting`, `game help`, `ceciliabot`, `guild`, `my speeds`,
`my corrections` / `auto-learned` (recognition templates), `screen` (screen-read gear), and match sources
`manual` / `auto` / `import:<name>` / `official record`; suggestion sources `E7DaT knowledge`, `top players`,
`official record`.

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
- **Suggestions:** `RTALogic.scoreCandidate` adds signals by source group (`SOURCE_GROUPS`): my notes, learned, game
  rule, presets, player, meta, speed, deny, game help, E7DaT knowledge, top players, official record.
  `sourceWeights` scales each group (sliders or `RTATune`). The context comes from `suggestionContext()` in
  `js/app.js` (`ctx.topModel`, `ctx.recordProfile`, `ctx.knowledge`, …).
- **Official record site and top players** (desktop only; DEVLOG #44, #45, #48, #51, #52):
  1. `desktop/records.js` does every lookup (allowed names only, one at a time, 0.35 s apart, retries); pages reach
     it through `E7Desktop.records`. Names are matched on the PC against the site's player list; only numbers are sent.
  2. My matches: `E7RecordsApp.importMine` → `store.matches` with source `official record` (deduped by `recordSeq`
     and against app-recorded twins). By itself at start and 4 / 12 minutes after a draft ends.
  3. Opponent: name known in the draft → `lookup` → panel `#records-opp` and `ctx.recordProfile`.
  4. Top players: `updateTop` (button, or by itself at start when older than 6 h) → `E7Records.crawl` → IndexedDB
     `e7-records` → `rebuildTop` → `loadModel` (stored copy, or a fit in `js/topmodel-worker.js`) → `topModel()`
     (an `E7TopModel.Engine`) → suggestions, draft line `#top-model-line`, team plans `#team-plans`, statistics tab.
  5. Seasons: list cached in `e7-records-seasons`; `settings.seasonScope` filters my matches in `derive()`.
- **RTA draft from the screen** (DEVLOG #41): reader `rta-draft` → `rta:draft` → `js/auto.js` `onWatcherDraft` →
  `applyBoard` → the draft in `js/app.js`. The old slot reader in `js/auto.js` stands back for 20 s after each event.
- **Guild War from the screen** (DEVLOG #38–#40, #46, #50): overview → `guild:forts` → `GuildApp.warFromGame` (selects
  or starts the war, Undo banner) and `saveFortNames`; fortress map → `guild:fortress` → the "Seen in game" panel
  (names checked, then saved as targets) and `markBeaten` (no button); enemy screen → `guild:defense`; standby page →
  `guild:standby` → `standbyFromGame` (banner, open war finished with Undo, `settings.nextWar`, desktop reminder).
- **Gear:** `gear.txt` → `RTAGear.extractBuilds` (RTA speeds) and `RTAGearSort.slimInventory` (Gear Sorter). Screen
  reading: the game watcher's `gear-item` reader OCRs the item panel at built-in positions (colour masks for the slot
  line / badge / level, digits-only re-reads) → `RTAStatParse.itemFromReadings` → `gear:item` → gear consumer →
  `GearStore.addScanned` (source `screen`, not linked to heroes) → `gear:added` (or `gear:dup`) and a verdict card on
  the overlay's `gear` layer (left of the panel: verdict, reason, whom it suits); `gear:gone` clears it. The Gear page
  (`js/gear-scan.js`) can still draw own boxes on a watcher snapshot ("Items not read?") and reloads on `gear:added`.
  Full display format (#77): `gear-grid` reads every tile → `gear:grid` → the consumer saves each (dedup by key), judges
  them all at once and posts a label per tile on the overlay's `gear-grid` layer (WORN for items on a hero: the screen
  doesn't say which hero, so they are not judged) → `gear:grid-judged { read, added, counts, failed }`. Tiles not read get
  "✗ <why>" and the row cut off at the bottom "↓ scroll to read" (`status` in `gear:grid`, #82).
  Pictures (#78): both readers send `pics { icon, shot }` (JPEG data URLs) with each item; the consumer keeps them in
  IndexedDB `e7-gear-pics` (keyed by the item's id). Events over 4 KB go to the watcher log without their data.
  Gear page details (#78): "what to do" (`E7GearSim.advice`), the game's screenshot, every number of a screen item
  editable (`item.read` keeps the reading; the item's dedup key stays the reading, so a fix survives a new read;
  "Back to what was read"), the enhance simulator (`E7GearSim.outcomes` / `simulate`, `js/gearsim.js`) or the reforge
  for a +15 level-85 item. Screen items marked `worn` (from the Full grid) are always Keep.
  Designs (#79, `js/geararts.js`): the middle of the item picture is fingerprinted; the panel reader also reads the
  item's name (white text, `gearName`) and the consumer learns design → name / slot; the grid reader looks each tile's
  design up (name; slot when the "all" tab is open). Moves and presets (#79, `js/gearbuild.js`): hero stats = RexQian
  formula with the bundled base stats (no artifact / EE); "Try it on a hero" in the item details; `gs.moves` (a to-do
  list, the app never changes the game) and `gs.presets` in the gear store (`GearStore.load` keeps them, so the
  watcher's saves don't drop them).
  Pictures for gear.txt items (#80): a design with the same name and slot (`designByName` in `js/gear-app.js`) gives its
  picture (`art:<id>`), shown zoomed to the middle with the item's own level / enhance / set / hero on top; drawn art
  only when no design matches. "Item upgrades" (#80): `E7GearSim.upgradePlan` → enhance next / reforge / modify a
  substat, cached per evaluation; a row opens the item.
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
    (`screen.screenToDipRect`) and hidden when it's minimized or another program (not the game's process, not this app) is in front.
    The script runs from `<userData>/e7-wintrack.ps1` with `-File`; a failure (stderr + exit code) comes back as `{failed}`.
  - **Updater** `desktop/updater.js`: installed app = electron-updater (GitHub provider, asks before download, restart to
    install); portable = GitHub API `releases/latest` → download `*-portable.exe` as `<exe>.update` → `.cmd` swaps it
    after exit. Checks 3 s after start (retry after 5 min, again every 6 h) and from the menu; the menu line under
    "Check for updates…" says when the last check was and what it found (DEVLOG #48).
  - Pop-outs (`js/pip.js`, `js/guild-pip.js`) use `window.open` in Electron: Document PiP's `requestWindow` hangs there.
  - **Zoom is per origin** in Chromium, so all `e7://app` windows share `config.zoom`. The overlay therefore never calls
    `setZoomFactor`; `overlay.html` scales items by `overlayZoom / zoom`.
  - Window mode on Windows: the overlay is hidden until the game window is found (retried every 4 s). If the tracker fails
    or doesn't answer within 5 s, the overlay covers the game's display instead (`ovStatus.fallback`), the tracker is retried
    at most once a minute, and the reason is shown by Overlay → Overlay status / `e7:overlay-status`.
    `E7_TEST_WIN=1` makes the app behave as on Windows (tests: `tests/desktop/overlay-status.js`).
  - Text size: pages open at 125% zoom (`config.zoom`, saved in the app's config file). View menu: Ctrl+= bigger,
    Ctrl+- smaller, Ctrl+0 back to 125%. Overlay menu: bigger/smaller overlay text (`config.overlayZoom`).

## 6. Testing

Counts at DEVLOG #63: **180 unit tests, 41 browser tests, 14 desktop checks.** Unit and browser suites were green at
that commit; which desktop checks were run is in the devlog entry.

- **Unit:** `npm test` (Node 18+; `node --test tests/*.test.js`), a few seconds. One file per pure module;
  `tests/_world.js` is a made-up world with planted effects shared by the model and planner tests.
- **Browser end-to-end:** `bash tests/e2e/run-all.sh` (about 25 minutes since #59; in a cloud session start it in
  the background with a 30-minute limit, or it is cut off). It serves the repo on :8766 and runs every
  `tests/e2e/*.e2e.js` with Playwright (pre-installed in cloud sessions). Each test prints what it found and ends with
  `errors: []`; the runner fails otherwise. **The tests print, they do not assert:** `errors: []` only says nothing
  crashed, so read the printed lines of the tests that cover what you changed. They need internet (portraits, OCR library from jsDelivr, CeciliaBot).
  Run one alone: `python3 -m http.server 8766 &` then `node tests/e2e/<name>.e2e.js`.
  - Real screenshots of the owner (names replaced) are in `tests/fixtures/screens/`; tests that use them:
    `gw-fortress`, `gw-war-names`, `gw-scripts`, `gw-result`, `gw-offense`, `gw-states`, `gw-shared`, `gw-autowar`, `gw-standby`, `gw-defense`, `rta-draft`, `rta-match`, `rta-cr`, `rta-art`, `arena`, `gw-overlay`,
    `rta-real-screens`, `faces-real`, `teach`.
  - The record site is replaced by a stand-in (`window.__e7RecordsTest`) serving one real page of games
    (`tests/fixtures/records/battle-list.json`, names replaced): `records`, `seasons`. `topmodel` puts 6,000 made-up
    games into the records database and checks the model, team plans, turn order and the statistics tab.
  - Dialogs: `tests/e2e/_ask.js` (`autoAsk(ctx)`, `ask(page, value)`) answers the in-page questions.
- **Desktop app:** `tests/desktop/*.js` drive the **packaged Linux build** under Xvfb + Openbox:
  `cd desktop && npx electron-builder --linux dir --publish never`, then
  `xvfb-run -a bash tests/desktop/withwm.sh tests/desktop/<name>.js desktop/dist/linux-unpacked/epic7-engine-desktop`.
  Rebuild after every change to `desktop/` or the pages. `records-live.js` makes about 25 REAL lookups on the record
  site (not part of routine runs). `E7_TEST_WIN=1` makes the app behave as on Windows.
- **Real top-player games** (to judge changes to the model, planner or statistics): `node tools/dev/collect-top-games.js 100`
  (about 12 minutes of spaced lookups, writes the git-ignored `tools/dev/out/top-games.json`), then
  `node tools/dev/model-report.js`. The reference numbers are in that script's header and in DEVLOG #45 / #51 / #52.
- **Not possible here:** Windows, the real game, a real Firebase project. Say so in the devlog's "Not tested".
- After a change: run unit + browser suites (and the desktop checks when `desktop/` or page loading changed), then
  write the devlog entry with what was tested and what wasn't.

## 7. Status notes per feature (newest first; §0 has the overview)

**Seasons** (DEVLOG #48): season list of the record site cached in `localStorage['e7-records-seasons']`
(`js/records-app.js`, once a day); `E7Records.seasonTable / seasonForDate / seasonOfMatch`. `js/app.js` `derive()`
filters `cache.enabledMatches` by `settings.seasonScope` (`all` | `current` | a season code; `cache.sourceMatches` =
before the season filter, `cache.scopeCode`, `cache.nowSeason`); History card `#hist-season`. `js/records.js` is
loaded BEFORE `js/app.js` in `rta.html` for this. Top players: `TM.build(rows, { onlySeason })`,
`E7RecordsApp.modelFor(code)`, selector `#ts-season` on the statistics page.
**Updates at start:** `desktop/updater.js` (3 s after start, retry, every 6 h, `statusText()` in the menu);
`js/records-app.js` `autoTop()` (top players' games when older than 6 h; `cfg.top.auto`).


**Top players statistics tab** (DEVLOG #47): `rta.html` `#tab-top` / `#top-stats`; tables from `js/topstats.js`
(`E7TopStats`, pure) over the stored model (`E7RecordsApp.topModel().stats`) and, for builds, the stored games;
drawn by `js/topstats-ui.js` (`E7TopStatsUI.render`, hooked into `RENDER.top` in `js/app.js` and
`E7RecordsApp.onTop`). Rows use `data-ts` (not `data-hero`, which opens the app's hero card). Since #49: `TS.trends`
(week against week), column "Me" and block "You" from `RTAApp.cache.stats` / `cache.builds`; `#tab-top` is wider.


**DEVLOG #64–#65** (the owner's PC with #63):
- In the owner's game a hero is never clicked: the one HOVERED in the list is shown on the card; Confirm (or the
  time running out) makes it the pick. The tracker's `held` is that hovered hero.
- `rta-draft.js`: only a read scoring ≥ 0.80 may fix a side's card place (`anchor`); empty cards
  (`E7Draft.isEmptyLook`) are never heroes; `rta:draft.seen` = each card's last read (logged at ban / formation).
- `js/auto.js` `playedAt`: a draft that reached ban / formation is a played match; half-read ones are left to the
  official record import, never filed as walkovers.
- (#66) `E7Draft.toBoard` keeps an unread card BEFORE a read one as `?unseen-<side><i>`: never cut a pick list at
  the first gap (that emptied the whole RTA page). The Draft tab shows such places as "?"; count places with
  `draft.actions`, not `draftView` (which leaves placeholders out).
- (#67) The owner's game window can show its Windows title bar (maximised, not borderless), with a few black rows
  above it. `js/frame.js` skips those black rows; when card scores on the owner's PC are all low (0.5–0.7), suspect
  the frame first (all positions shift together).
- (#68) The owner can send at most 5 pictures / 30 MB per message: ask for Developer → "Pack the newest screenshots
  into one file for Claude" (one zip on their Desktop, `desktop/pack.js`) plus the text report. The RTA mini window's
  height is set by `desktop/main.js` (`setContentSize`), not by the page.
- (#69) CR bar: watcher reader `rta-cr.js` → `rta:cr` → `js/auto.js` `onWatcherCR` → scouting speeds. The game's bar
  has 100 % at the BOTTOM (`E7Draft.CR_BAR`). The old `readCR` on the RTA page (drawn box) is still there but is not
  needed. Speeds need the owner's own speeds (gear.txt builds or typed).
- (#70) Profile art: `rta-art.js` reads the opponent's card on the versus screen, remembers it with the battle bar's
  name (`localStorage['e7-rta-arts']` + pictures in IndexedDB `e7-rta-arts`), and `rta:art` names a known opponent
  before the draft (`draft.opponentFrom = 'profile art'` = a guess the battle replaces). Gallery: RTA → History.
- (#71) New module **Arena** (`arena.html`, `js/arena-app.js`, pure `js/arena.js`): readers in
  `js/vision/readers/arena.js` (opponents list, set-up, result), the log kept by `js/arena-log.js` next to the watcher
  (`localStorage['e7-arena']`). New pages must also go into `desktop/package.json` → `extraResources.filter`.
- (#72) Snow on Guild War pages: `E7GWResult.pageAt` counts the share of the strip in the slate colour (≥ 0.7),
  `guild-name.js` needs 3 misses before "left" (which clears the overlay card), `guild-defense.js` reads icons from
  the darker of two looks. Test with snow: `tests/e2e/gw-overlay.e2e.js`.
- (#73) Clickable overlay: item `kind: 'pin'` with `pin: { layer, id, key, name, lines, options, input }`; overlay.html
  sends `{ action: 'pick', layer, id, key, value }` on the 'e7-overlay' channel; the page that posted the pin handles it
  (Guild War: `js/guild-watch.js`). Desktop: `setIgnoreMouseEvents(true, { forward: true })`, IPC `e7:overlay-mouse` /
  `e7:overlay-focus` (overlay page only). Never send anything to the game.

**DEVLOG #63** (the owner's real arena match):
- Round icons for every reader come from `window.E7Icons` (`js/vision/icons.js`): the game's own icon files from
  the community repository (source `game icon`), the official site only as a fallback; skins flagged `skin: true`
  (`base()` without them, `all()` with them; `guild-defense.js` `readIcon` tries without skins first). The official
  site's icons are older artwork for about half of the heroes: never go back to them for reading the game.
- Draft tracker (`js/draftscreen.js`): `prePick` (pre-ban window), `banIdx` / `bans` (darkened cards on the formation
  screen, `cardLook` / `isBannedLook`), `toBoard` gives `postbans`; `js/auto.js` `applyBoard` applies them.
- RTA store: a match / draft may carry `fun` (+ `funWhy`); `derive()` leaves fun matches out of everything counted.
  `App.markFun(why)` (not again after "Count it after all": `draft.funOff`). `js/auto.js` `onWatcherBattle`.

**DEVLOG #62** (what the owner's PC showed after #61):
- Readers must not depend on screens the user taught (`screen:` in `V.register`): an old example from another
  window size silently switches the reader off. `guild-name` / `guild-defense` gate themselves with
  `window.E7GWPage.shown(ctx)` (`E7GWResult.pageAt`, the name panel's flat colour). `guild-fortress` still has
  `screen: 'gw-map'` (built-in signatures only; nobody can teach it from the UI).
- "Seen in game" card (`js/guild-watch.js`): `saveFort()` after every reading / change (no Save button);
  `whoIs(d)` + `fillFromPage(d)` put a page name on its defender; `unsure = E7GWMap.unsureName`; rows in
  `.gw-fort-rows` (css/styles.css). `GuildApp.saveFortress` identifies a defender by `fortIndex` + `pos` (keep:
  `fortIndex` + `keep`), renames (`aka`), keeps `nameSure`.
- Rarely needed buttons live in `<details class="more-tools">` (rta.html Auto tab, guild.html). Browser tests that
  click one of them open the fold first.
- The owner's wish, standing: **automate, fewer clicks, easy to read**. Before adding a button, ask whether the app
  can decide by itself and show the result with an undo or a correction instead.

**DEVLOG #61** (unsure names, shared scans, RTA results):
- Unsure name = not `known`, not `official`, not `fromPage`: ⚠ on the card (`askFort` = the box that waits),
  overlay layer `guild-fort`; `fillFromPage(d)` in `js/guild-watch.js` puts the next `guild:name-read` into it.
  The map reader sends `guild:fortress { away: true }` when the map is left.
- `E7Names.read(..., { clean: true })` for names on plain panels → `pickRead(..., { keepLatin: true })`.
- Places: players in `guild:fortress` carry `pos`; `saveFortress(fort, players, side, { index })` stores `pos`
  and `fortIndex`; `e7-gw-fort-cache` (written in the records' subscribe callback of `js/guild-app.js`) lets the
  reader reuse names (`fromGuild`). Targets saved before #61 have no place: they are read as before.
- RTA: `maybeReadResult` runs on `confirmShown()`; ten picks without bans → `recordResult(r, 'auto',
  { bansUnknown: true })`; `boardSummary()` shows the watcher's board; trace pictures per match.
- When the owner sends a diagnostic report ("Copy report for Claude"): the lines "draft from the game watcher"
  show what `js/vision/readers/rta-draft.js` saw (own / enemy = recognised heroes); the slot table below it is the
  PAGE's own old reader and is expected to be empty in the desktop app.

**RTA, DEVLOG #60** (a match that ends during the draft): `js/auto.js` `maybeReadResult` reads a result with an
unfinished draft only while `confirmShown()` (the result screen's green Confirm button, `rtaConfirm` in
`js/layouts.js`) and a match is going on → `RTAApp.recordWalkover(result, source)` → `store.walkovers` (apart from
`store.matches`; never used for statistics), draft cleared, card `#hist-walkovers` on History. Test hooks:
`RTAAuto._confirmShown()`, `RTAAuto._resultState()`. Loading a screenshot switches the reader's follow mode off:
tests call `RTAAuto._setLive(true)` after each load when they need "a match starts".

**Guild War, DEVLOG #59** (a war in progress):
- `findBadges` returns `{ x, y, r, state, busy?, dim? }`: `busy` = "Battle in Progress" badge; `dim` = a dark
  destroyed badge on the enemy's side (state `beaten`), kept by the reader only with a name under it.
  `FORT_PLACES[fort]` = the fixed places ([x from the middle, y], units of the picture's height);
  `placesToCheck` adds known places with a dark disc the finder missed (`byPlace`, also only with a name).
  When a new look of a badge turns up: measure it with the numbers in that function's comments, add a rule there.
- Map names are centred under the badge: `E7Names.read(..., { centred: true })` → `nameLetters({ tight, centred })`
  → `sym`; `pickRead` believes a centred tight reading over a longer loose one. Only the map reader passes
  `centred`; names on pages and windows are left- or right-aligned.
- Result windows: titles "Successful / Failed Attack", "Successful / Failed Defense", "Attack Draw", "Defense
  Draw"; round icons: swords for an attack (blue won, red lost), shields for a defense (green held, red lost).
- Players' game states seen on maps and pages, not used yet: "Cannot Battle" (I attacked them already), top bar
  "2/3" attacks left, tower hit points, note bubble (megaphone = none, sheet = a note exists; notes are per defender).

**Guild War, DEVLOG #58** (Offense Team screen, the fight, notes, snow):
- Readers in `js/vision/readers/guild-offense.js`; pixel checks `E7GWResult.offenseAt / battleAt / noteAt`; positions
  `gwOff…` (pinned left, centred as the alternative; icons read at three box sizes and the best kept), `gwBat…`,
  `gwNote…`.
- `GuildApp.offenseFromGame(d)`: `lineupsFromGame(enemy, lineups)` (target new / filled / updated with `earlier`),
  `setPending({ enemy, mine, theirs })`, current player set → `js/guild-watch.js` posts the overlay card above the
  name (`lastSide = 'above'`). `battleFromGame` marks the pending attack started → `#war-pending` ("how did it
  go?") → attack records with `token` = `E7GWResult.key(...)`, so the result window of the same battle is 'known'.
- `GuildApp.noteFromGame(d, suggest)` → `#war-note` (which enemy?) → a line on `target.notes`.
- Snow: `guild-fortress.js` keeps the look before (`before`) and reads names from `E7GWMap.darkerOfTwo(before, now)`.
- Order of a normal attack in the game, for whoever continues: map → tap a defender (their page: name, defense,
  Season Log) → Ready → **Offense Team** (pick two teams, Start costs 1 of 3) → fight round 1 → round 2 → (end
  screens not seen yet) → the row appears in both players' Season Logs → result window on tap.

**Guild War, DEVLOG #57** (battle results logged by themselves):
- **The window:** opens from a Season Log row on a player's page. LEFT = the player whose page it is, the title and
  each round's Victory / Defeat are from THEIR point of view, RIGHT = the opponent. Band colour: red = an enemy's
  page, green = one of ours. ✗ on a hero = dead. An enemy's "Successful Attack" is a lost defense of ours.
- **Chain:** `js/vision/readers/guild-result.js` (no screen gating; pixel check `E7GWResult.windowAt` +
  `roundResult` → same picture twice → title text → `E7Names.read` ×2 → 12 × `E7GWFaces.readIcon`) → bus
  `guild:result` (+ the waiting list `e7-gw-results`, so a closed Guild War page loses nothing) →
  `js/guild-watch.js` `takeResults` → `GuildApp.resultFromGame` → `E7GWResult.plan` → records:
  - defense of ours: `defense { warId, member, team, result: 'held'|'lost', attacker, attackerHeroes, heroes, draw?,
    fromGame, token, at }` ×2
  - attack of ours: `attack { warId, targetId, team, defense, by, heroes, result: 'win'|'loss', draw?, fromGame,
    token, at }` ×2 (+ the target created / filled / updated)
  - once per battle (`token` = `E7GWResult.key` of players + results; `#2` when round 1's attackers differ), banner
    `#war-result` with Undo, undone results remembered.
- **Tokens:** `GW.attacksUsed` counts attacks, not records (see its comment). `memberStats` still counts rounds.
- **Positions:** `gwResTitle`, `gwResHeader`, `gwResBand`, `gwResNameL/R`, `gwResRound1/2`, `gwResWindow`,
  `gwResL<round><n>` / `gwResR<round><n>` (`mid()` in `js/layouts.js`: boxes measured on a 2000×1070 picture of a
  centred window).
- **Names:** readings carry `cut: 'loose' | 'tight'`; `pickRead` drops a loose reading that only adds 1–2
  characters at an end and a tight reading that is only a piece of the loose one.

**Guild War, DEVLOG #56** (names anywhere, strongholds, the working card, changing defenses):
- **One name reader:** `js/vision/names.js` `E7Names.read(ctx, picture, box, { lang, world, offerOnly })` →
  `null | { name, raw, known, official, options, lang, pic }`. Steps: `E7GWMap.nameLetters` loose + tight → each read
  in English + the server language (+ `chi_sim` when a Chinese character was read; all three other scripts when
  there is no server language and English is poor) → `pickRead` (`.all` = candidates) → name fixes
  (`e7-gw-name-fixes`) / known names (`e7-gw-known-names`) → `records.near(world, candidate)` for up to 4
  candidates. Used by `guild-fortress.js` and `guild-name.js` (there with `offerOnly`: side unknown). The loaded
  page needs `js/vision/names.js` before the readers (`vision.html`, `live.html`).
- **Enemy / member screen:** teams stand on 3 of 4 places (`gwDef1..6` + `gwDef7`, `gwDef8`); a stronghold's banner
  shifts them down (`E7Layouts.GW_DEF_SHIFTS`); `guild-defense.js` reads every placement and keeps the best.
- **Working card:** `js/vision/hub.js` `setWorking` → overlay layer `busy` (items `{ kind: 'busy', title, done, ask }`,
  drawn top middle by `overlay.html` `.ov-busy`) and bus event `vision:busy { reader, text, done, ask }`
  (`js/guild-watch.js` shows it in `#gw-watch-read`). Auto-clear: 8 s after `done`, 15 s with `ask`, at once when
  the reader's pass ends without `done`, and on stop.
- **Changing defenses:** `attack.defense` (heroes at the time; `lineupOf` in `js/guild-app.js`), `GW.defenseOf`
  prefers it; `GW.defenseChange(target, seenTeams)`; a target team may hold `earlier: [{ heroes, speeds, build,
  until }]`; `#target-changed` in the edit window; `#gw-seen` says "Changed since it was saved".
- **Attacks:** `DEFAULT_RULES.attacksPerMember` = 3, counted per war (`GW.attacksUsed(attacks, warId)` without a day).
- **Game facts** worth knowing: 3 attack tokens per member per war; game day turns at 10:00 UTC (Global), the guild
  hall then shows "Guild Check-In Reward" (a new day is not a new war); "Havoc" = the war score; tower "Defense
  330/450" = its hit points (120 gone after one lost defense); the result windows: see DEVLOG #57 above.
- Fixtures: `tools/dev/redact-gw-screens.py <raw dir> <out dir>` (needs `fonts-noto-cjk`; finds map names with
  `tools/dev/name-boxes.js`); the raw screenshots are never committed.

**Guild War names and running wars** (DEVLOG #55; the name steps were replaced by #56 above):
- `E7GWMap.barKind` tells a map's page indicator (one third lit) from the overview's side switch (one half lit);
  both readers use it. Never start a war from one guild name alone.
- Names: `nameMask` → `letterSpan` → 96 px crop → `ctx.ocr(c, { line, full, lang })` in English + the side's server
  language (`e7-gw-forts`.`ourServer` / `enemyServer` → `langFor`), else all three when English is poor → `pickRead`
  → known names / fixes → `E7Desktop.records.near(world, text)` (official spelling; tests: `__e7RecordsTest.near`).
  Each player in `guild:fortress` may carry `pic` (JPEG of the name), `official`, `options`, `lang`.
- Overview: `guild:forts` also has `ourServer`, `enemyServer`, `endsIn`, `endsAt`; war records get `endsAt`,
  `enemyServer` (`GuildApp.warEndsFromGame`).
- Fixtures with replaced names are built by `tools/dev/redact-gw-screens.py` from raw screenshots (needs
  `apt-get install fonts-noto-cjk` for the Japanese ones; the raw pictures are not in the repository).

**Overlay rules** (DEVLOG #54): the RTA layer is posted only while `rtaOnScreen()` (js/auto.js; fed by the draft
reader's `rta:stage` heartbeat); every overlay layer is repeated by its page every 5 s and dropped by `overlay.html`
after 15 s of silence or on the page's `pagehide`.

**Team plans** (DEVLOG #52): `js/teamplan.js` (`E7TeamPlan.search(engine, { own, enemy, taken, meFirst, pool })`,
pure; uses `Engine.rows` per slot, `Policy.slot / pair`); shown by `renderInsights` in `js/app.js` (`#team-plans`)
on my pick turns when a model exists.

**Turn order** (DEVLOG #51): `js/topmodel.js` format 2: `turnOf`, `turnModel`, `meta.useTurn / ftCalib`, heroes
`sp / t1 / t0 / fast / tf / wr1 / wr0`, `stats.ftPair`; `Model.pFirst / turnZ`, `Engine.turnInfo / speedThreats`;
reasons in `js/logic.js` (`W.topFirstTurn`, `W.topTurnDep`); draft line and statistics lists.

**Guild War reminder + beaten from the map** (DEVLOG #50): `desktop/reminder.js` (config `warReminder`
`{ beginsAt, firedFor }`, IPC `e7:guild-standby` / `e7:war-reminder`, `E7Desktop.guildStandby / warReminder`);
`GuildApp.markBeaten(players)` on `guild:fortress` (enemy side) sets target `beaten / beatenAt / beatenBy`
(`beatenByHand` after "Not beaten"); `GW.targetStatus` treats `target.beaten` as cleared (`fromGame`).

**Guild War standby page** (DEVLOG #46): reader `js/vision/readers/guild-standby.js` (green-button check → title →
countdown; places in `E7GWMap.STANDBY`) → `guild:standby { minutes, beginsAt, season, text }` → `GuildApp.standbyFromGame`
(banner `#war-standby`, shares `settings.nextWar`, marks open wars finished with Undo) and `GuildApp.standby()`.
`js/guild-watch.js` applies the newer of the stored standby reading and the stored overview reading when a page opens.


**Top-player model** (DEVLOG #45; port of E7DaT's statistical core, see `docs/E7DAT_NOTES.md`):
- `js/topmodel.js` (`E7TopModel`, pure): `build(rows, opts)` → stats `{ meta (games, calib, backtest…), heroes, syn,
  ctr, rule, drafts }` or null below 400 usable games; `engine(stats)` → `Engine` (`model`, `policy`, `rows(mine,
  enemy, taken, meFirst, slot, rEnemy)` cached per position, `prebans`, `firstPicks`, `bans`, `winrate`).
- `js/records-app.js` `rebuildTop()` → `loadModel(rows)`: stored copy (IndexedDB `e7-records` v2, store `kv`, key
  `model`, signature = row count | newest game | format) or a fit in `js/topmodel-worker.js` (falls back to the page
  thread); `E7RecordsApp.topModel()`, `topState().modelVia` (`worker` / `page` / `stored`).
- `js/logic.js`: `ctx.topModel` in `scoreCandidate` (needs `opts.first`, `opts.slot`, `opts.taken`, `opts.rEnemy`
  from `suggestPicks`; `opts.noTopModel` for callers that add their own model line), `suggestPostban` (third pick =
  ban guard, model ban), `suggestPrebans` (by role, `ctx.myUse`). With a model, #44's plain `ctx.topStats` reasons
  are not added.
- Draft tab `#top-model-line`; Data tab `#rec-model`.


**Official record site** (DEVLOG #44; desktop app only):
- Transport `desktop/records.js` in the main process (allowed lookups only, serial, 0.35 s apart, retries; player lists
  cached 3 days in `<userData>/records/users_<world>.json`), IPC `e7:records` → `E7Desktop.records {game, find, status}`.
  A new main-process file must be listed in `desktop/package.json` `build.files` (unit test guards this).
- Pure part `js/records.js` (`E7Records`: `parseBattle`, `toMatch`, `summary`, `crawl`, `toStatsMatches`); page part
  `js/records-app.js` (`E7RecordsApp`; tests replace the transport with `window.__e7RecordsTest`).
- Flows: RTA → Data → Official match records (find me, import → match source `official record`, deduped by
  `recordSeq` / twin of an app-recorded match); draft tab `#records-opp` (opponent looked up 1.5 s after the name is
  known; my server first); auto import at start and 4 / 12 min after `rta:draft-end`; top players → statistics
  (`RTALearn.buildStats` over Legend / Emperor games of the last 60 days) → `ctx.topStats`; `ctx.recordProfile` for the
  opponent's habits; Guild War enemy card "Arena record".
- Settings `useTopPlayers`, `useRecordProfile`; source groups 'top players', 'official record'.
- Live check (real site, public data): `tests/desktop/records-live.js` (not in the regular suites).
- The model on top of these games: see "Top-player model" above.


**Faces:** `RTAFaces.isConfident` also accepts score ≥ 0.86 with lead ≥ 0.07 (default call only). With the newest heroes
in the roster the real Guild War enemy screen reads 6/6. Hero-picture templates are cached in IndexedDB `e7-templates`.

**Hero mechanics** (DEVLOG #42): `js/sources/e7dat-knowledge.js` (built by `tools/make-e7dat-knowledge.py` from E7DaT's
frozen `knowledge.json`) → `js/knowledge.js`. Used by RTA suggestions (`ctx.knowledge` in `scoreCandidate`, source group
'E7DaT knowledge', setting `useKnowledge`), the hero card (mechanics, top-player builds, opener) and Guild War (defense
cards "Watch for", attack window `#atk-mech`).

**RTA draft without calibration** (DEVLOG #41, method and layout from E7DaT, see `docs/E7DAT_NOTES.md`): watcher reader
`js/vision/readers/rta-draft.js` → `rta:draft {stage, turn, firstPick, own, enemy, prebans, held, board}` /
`rta:draft-end`. `js/auto.js` `onWatcherDraft` applies the board (`applyBoard(board)`); its own slot reading stands back
for 20 s after each event. Wide portraits and round icons of the newest heroes come from CeciliaBot/E7Assets-Temp at run
time (list in `js/sources/wide-portraits.js`, `tools/update-wide-list.py`). **Roster:** `RTASources.allHeroes` = official
+ heroes only the Fribbels dataset has (`source: 'fribbels-data'`, `js/sources/all-heroes.js`, `RTARoster.extraHeroes`).
Draft model: unseen pre-bans are placeholders (`RTALogic.UNSEEN`, skipped by `draftView`). Displayed portraits are plain
`<img>` (no `crossorigin`); pixel reading uses `PORTRAIT_URL_CORS` / the asset repo.

**Wars start by themselves** (DEVLOG #40): the overview reader also reads both guild names (`gwOurGuild`, `gwEnemyGuild`;
two readings must agree, ≥ 3 characters) → `guild:forts {…, enemyGuild}` → `GuildApp.warFromGame`: selects the active war
vs that guild, else starts one (other active wars finished) with Undo; a recent war vs that guild (any status) or an
undone one is never restarted; one at a time (`warBusy`). New war by hand uses `E7Ask.form` (prompt() fails in Electron).

**Guild War, both sides** (DEVLOG #39): overview reader (`guild-overview`: fortress names + side → `guild:forts`, kept on
the war as `war.forts = {enemy, ours}`); fortress maps on either side (ring colour: red enemy, green ours, grey beaten);
our side saved on the war (`war.ourForts[fortress] = [{name, keep, state}]`, members added). Fortress names are per side
and war, never built in. Enemy defense panel verified pinned left at 2000×1070.

**Any window size** (DEVLOG #38): the game picture is found from the pixels (`js/frame.js`; title bar cut), built-in
positions are anchored left / middle / right and scale with the height (`js/layouts.js` `place`, `layoutFor` for any
shape, `alternatives` for unverified anchors), screen signatures use the middle 16:9 part (`RTAScreens.refCrop`).
Verified on the owner's Guild War screens (16:9 vs 2000×1070). RTA anchors are still guesses (no wide RTA screenshot).
**Guild War fortresses:** `guild-fortress` reader → `guild:fortress {index, fort, players, keep}` → Guild War page
"Save as this war's <fortress>" (targets get `tower` = fortress, `keep` flag); War tab filter by fortress.

**Desktop-only** (owner, DEVLOG #37): the browser/phone version, the offline web app (manifest, service worker) and My
devices sync are gone; the web keeps `guild.html` for guildmates. **Steam / Discord in-game overlays** draw inside the game
window, so the capture sees them: Guild War defense publishes only when two reads agree; covered-screen detection waits for
real screenshots (ROADMAP).

**Overlay (desktop):** never stuck hidden any more: if the window tracker (PowerShell) fails or is silent for 5 s, the overlay
covers the game's display. Why it is/isn't visible: Overlay → Overlay status, Live page "Overlay now", the `overlay:` line
in Copy report (`E7Desktop.overlayStatus()`). **Teach heroes** (Live page): your own face examples, `e7-face-examples`.

**Guild War from the screen:** fortress maps (which fortress + its defenders' names, `guild-fortress`), name (built-in box) + defense teams (`guild-defense` reader → `guild:defense` → "Save as …'s
defense"; learning in `e7-gw-face-corrections`). **Portraits for pixel reading must use `RTARoster.PORTRAIT_URL_CORS`.**


**Per-match debugging:** RTA → Auto → Match review (timeline, slot snapshot, pictures with boxes, download, copy for Claude;
`js/matchtrace.js`, `localStorage['e7-match-trace']`, pictures with `draftId`).


**Pick banners** are learned by naming them on a saved picture (`openLabel`); **teams** can come from the CR bar (`scanCRTeams`,
`draft.crTeams`). Overlay check: Overlay → Show a test card / Live → Show a test card on the overlay.


**Real screens (files) and what they showed:** see DEVLOG #31. Built-in screen signatures for menu, match found, match start,
pre-ban picker, draft (BAN). Pick banners don't match official portraits: they are learned from corrections.


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

**Never tested on the real game or the owner's PC** (see §0 for what has been): the Gear Sorter's screen reader,
the old slot-based RTA reader on a live draft, CR-bar speed reading, Victory / Defeat reading on a live match, a real
`gear.txt`, a real Firebase project, the Windows update dialogs, the Guild War reminder notification.

## 8. Handy commands

```
npm test                                   # unit tests (157)
bash tests/e2e/run-all.sh                  # browser tests (32, ~8 min)
python3 -m http.server 8766 &              # serve locally, then: node tests/e2e/<name>.e2e.js   (one browser test)
cd desktop && npm install                  # once per fresh checkout (Electron, electron-builder)
cd desktop && npx electron-builder --linux dir --publish never      # packaged Linux build for the desktop checks
xvfb-run -a bash tests/desktop/withwm.sh tests/desktop/<name>.js desktop/dist/linux-unpacked/epic7-engine-desktop
                                           # names: cancel devshots newwar overlay-status overlay-test popout rta-follow
                                           #        topmodel update-check war-reminder watcher winpick zoom
                                           #        records-live (REAL lookups on the record site: only on purpose)
node tools/dev/collect-top-games.js 100    # real top-player games into tools/dev/out/ (git-ignored; ~12 min of lookups)
node tools/dev/model-report.js             # what the model, statistics and planner make of them
npm run update-heroes                      # refresh js/sources/official-heroes.js
npm run update-fribbels-data               # refresh js/sources/fribbels-data.js (RexQian fork data)
python3 tools/update-wide-list.py          # refresh js/sources/wide-portraits.js (new heroes' wide portraits / skins)
python3 tools/make-e7dat-knowledge.py      # rebuild js/sources/e7dat-knowledge.js from a newer E7DaT knowledge.json
cd desktop && npm start                    # run the desktop app from source (needs a display)
cd desktop && npm run dist                 # Windows installer + portable .exe (CI does this on every push)
git push -u origin ccr-2c9db930-kqvr1r     # the only branch; a push that touches the app ships a Windows update
```

**CI:**
- `.github/workflows/pages.yml` runs the tests and publishes **only the Guild War page** (GitHub Pages) from `main` **and the work branch** (the
  repo's default branch; there is no `main`). Needs Settings → Pages → Source = GitHub Actions (owner, one time).
- `.github/workflows/desktop-build.yml` runs the tests, then builds on `windows-latest` for every push that touches the
  app (on `main` and the dev branch). Version = `0.1.<run number>`. It publishes **Release `v0.1.<n>`** (latest) with
  `Epic-7-Engine-Setup-<v>.exe` (+ `.blockmap`, `latest.yml`) and `Epic-7-Engine-<v>-portable.exe`, and also uploads
  them as the artifact `Epic-7-Engine-windows`. The in-app updater reads these Releases, so **every push to the dev
  branch that touches the app ships an update to the owner**. Don't push broken app code.
