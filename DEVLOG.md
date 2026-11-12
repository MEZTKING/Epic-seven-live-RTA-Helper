# Devlog

A running record of every change to the Epic 7 Engine (formerly the RTA Live Helper): what changed, why, what was found while researching,
bugs found and fixed, how it was tested, and what is still open. Newest entries first.

**Rule:** every change to the project adds an entry here **in the same commit**. Use the template at the bottom.

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
