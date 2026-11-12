# Devlog

A running record of every change to the Epic 7 Engine (formerly the RTA Live Helper): what changed, why, what was found while researching,
bugs found and fixed, how it was tested, and what is still open. Newest entries first.

**Rule:** every change to the project adds an entry here **in the same commit**. Use the template at the bottom.

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
