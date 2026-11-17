# Epic 7 Engine — roadmap (later plans)

Ideas the owner asked to keep for later. When one is started, it moves to `DEVLOG.md`.

## Next up (as of DEVLOG #63; the overview of what is verified is in docs/HANDOFF.md §0)

Needs the owner first:
1. **RTA on the owner's PC after #63** (report after a few matches); a picture of MY turn with a hero clicked but
   not confirmed (hover against confirmed is still checked only on #41's BAN screen).
2. **Guild War screens, as files**: the END of a fight (Victory / Defeat after each round) → the attack logged
   without asking; a whole map with a note bubble on a badge → notes attached without asking; a battle-result
   window where one of OURS attacked, one with a Draw, one with
   a round won and a round lost (the reader of DEVLOG #57 has only seen enemy wins); right after a war; an enemy
   map with a beaten defender; a map with Korean names.
3. Their report on DEVLOG #46–#52 on Windows (standby banner, reminder, statistics tab, team plans, turn order).

Can be done without the owner:
0h. After DEVLOG #63: if the owner agrees, DeepSeek's vision model as a second reader for Guild War names the app is
   not sure of (key entered in the desktop app, only the small name picture sent, label `DeepSeek`); a friend
   outside the guild marked "for fun" by name (a list of friends).
0g. After DEVLOG #62: the same "automate, fewer buttons" pass over the rest of the app (RTA Draft tab, Gear, Live:
   fold tools that are rarely needed, replace confirm buttons by "done by itself + undo"); save a player's defense
   by itself when their page is read and all six heroes are sure (now: "Save as … defense"); drop the old
   "teach this screen" buttons once no reader needs them.
0f. After DEVLOG #61: once real draft pictures are there, find out why pre-bans are never read and why the
   opponent's picks are read unevenly (compare the wide-portrait reader's boxes with the pictures at both of the
   owner's window sizes); read the bans; show the watcher's slots in "What each slot saw"; make the Guild War page
   readers independent of screens taught long ago (`gw-enemy`); test shared scans with two connected PCs.
0e. RTA, after DEVLOG #60: use "First Pick" from the match-start screen (it is written under the player who picks
   first) as an early, sure source for who picks first; keep games with fewer than five picks a side out of the
   statistics when they come from the official record site; count walkovers in the season table as the game does.
0d. Guild War, after DEVLOG #59: read the Season Log rows of a player's page directly (shield / swords in front,
   two round icons, name, "5m ago": colours measured in #59) → attacks and defenses logged without opening each
   window; the attacks left from the top bar ("2/3"); "Cannot Battle" / "Battle in Progress" under a name → show
   on the War tab who is being fought right now; keep Latin letters at the end of a kana name when the reader is
   sure; complete `FORT_PLACES` for the right fortress.
0c. Guild War, after DEVLOG #58: suggest counters ON the Offense Team screen from what is read there (their two
   teams are known exactly at that moment: compare my chosen teams with the guild's proven counters and say so on
   the overlay); read the speeds shown in that screen's hero list; show my attacks left from "3/3" in the top bar.
0b. Guild War, after DEVLOG #57: recognise DEAD heroes better on result windows (compare against greyed, darkened
   portraits; about a quarter are left out now); let a logged attack / defense be edited (now only Undo); read the
   Season Log rows directly (who, when, both rounds) without opening each window; save a member's defense from
   their tower page; show "what beat us" (enemy attack teams from defense records) next to the counters.
0a. Guild War, from the fixtures of DEVLOG #56: the **season log** on a player's screen (who attacked them, when,
   won or lost per round); a tower's hit points ("Defense 330/450") and the **Havoc** score on maps and overview;
   show a player's earlier line-ups (`team.earlier`) in their history window; a daily note built on the game day
   (10:00 UTC on Global).
0. Guild War, from the screens of DEVLOG #55 (fixtures are in the repository): read the **VS screen** (both guild
   names and servers, large and clear: a second, independent source before a war is started) and the guild hall's
   "Guild War in progress"; on the overview: my attacks left (3/3), both guilds' attack totals, standing defenders
   per fortress (7/7, 4/5, 5/5) → attacks left from the game instead of from logged attacks.
1. Team plans and the standby note on the in-game overlay (now only in the app window).
2. From E7DaT: ban forecast, similar-team records, heroes that need a specific ally, the turn-order correction from
   my own matches, "had you built this hero" in the plans.
3. Statistics tab: what top players pick at a given draft position; element / class filters.
4. Move the old RTA reader (`js/auto.js`) into `js/vision/readers/` (architecture plan, step 1b part 2).
5. Guild War: look up all enemies of a war on the record site in one go; count attacks left from the game.

## New module: PvE & events (planned)

A module for everything outside PvP: which heroes and which gear setups to use, per content and per stage/boss.

- **Content to cover:** limited events, Advent, Dimensional Exploration, Hunts, Otherworldly Breach,
  Trial of Constellation, Strategic Archive (names as the owner listed them; check the exact current in-game names),
  and other recurring PvE content.
- **For each:** recommended teams, gear sets and stat targets (for example speed, effectiveness, crit), boss mechanics and
  notes, and teams **you can build from your own roster and gear** (from gear.txt or the screen gear reader), ranked by
  how close your heroes are to the targets.
- **Data, kept by source like everything else:**
  - `my notes`: your own team and gear setups per content.
  - `guild`: shared setups from guildmates, using the same Firebase sharing as Guild War.
  - `learned`: clears and failures you log, and which teams worked.
  - Community guides only as an imported dataset with its own name, never mixed in.
- **Automation later:** recognise the content screen (screen detector) and show the matching setup in the overlay.
- **Needs from the owner:** which content matters most first, and screenshots of their stage/boss screens.

## Architecture plan (docs/DESIGN_REVIEW.md)

1. ~~Game watcher + event bus~~: done for Gear and Guild War (DEVLOG #21). 1b part 1 done (DEVLOG #28: the RTA reader starts
   and stops with the watcher). **1b part 2:** move the RTA reader (`js/auto.js`) into
   `js/vision/readers/` (draft board, prebans/postbans, opponent name, CR bar, Victory/Defeat), with a consumer that updates
   the RTA store, so the RTA page only listens.
2. **Partly done (DEVLOG #25):** built-in Steam 16:9 layout for the draft (by eye; verify with a real file) and the result
   banner (exact). Still to add from screenshot files: CR bars, opponent name, drafting help, Guild War name, gear panel.
   Built-in screen layouts ("layout packs", fractions of a 16:9 game picture) from real Steam screenshots → no boxes.
   The owner shared draft (preban / picks / postban / Ready), battle (CR bar normal + expanded with exact CR %),
   Defeat, inventory and item-detail screenshots in chat; they're needed as files (e.g. `tests/fixtures/screens/`).
3. IndexedDB storage, one store per source; append-only match / gear history.
4. A fixed-font digit/glyph reader for gear stats (tesseract stays for names).
5. ~~Stronger hero-face matcher~~: done for round icons (DEVLOG #23, `js/faces.js`: 14/15 known faces, 0 wrong).
   Next: use it for the CR bar and result-screen icons; a banner matcher for draft picks once real draft screenshots
   exist; skins come from corrections (or a skin portrait list if one is found).
5b. Element colour + class symbol narrowing (DEVLOG #29): done for round icons with badges; next: badge positions on
   pick banners (from a real draft file), more class examples (`tools/make-class-templates.js`).
   The owner's BAN-screen screenshot (chat only) shows each pick banner's element + class badges at the banner's top
   end: right end on my side, left end on the opponent's; banners have different widths, so positions per slot.
6. Opponent names in Korean / Japanese / Chinese: load those tesseract languages for the name reader; result +/− from the
   arrow colour, not the OCR'd sign.

## From E7DaT (owner supplied the project, DEVLOG #41; notes in docs/E7DAT_NOTES.md)
- [x] RTA draft read with no calibration: stage texts, pick cards from wide portraits, pre-ban icon positions, first pick.
- [x] Newest heroes (missing from the official list) from the Fribbels dataset.
- [x] Hero mechanics, blocking rules and top-player builds from its knowledge file as their own source (DEVLOG #42).
- [ ] The knowledge file is a snapshot of Nov 2026: refresh it when E7DaT publishes a newer one (`tools/make-e7dat-knowledge.py`).
- [x] The official record site's lookups (owner's OK 2026-11-14, DEVLOG #44): own match history, opponent scouting in
  the draft, Guild War "Arena record", top players' games → win-rate statistics as a suggestion source.
- [x] From the top players' games: fitted win-rate model (hero strength + pairs + counters, player skill removed),
  self-check, pick policy, pre-ban and final-ban advice, third-pick ban rule (DEVLOG #45, `js/topmodel.js`).
- [ ] Still to port from E7DaT (`docs/E7DAT_NOTES.md`):
  - ~~turn-order model~~: done (DEVLOG #51). Open: the correction from my own matches ("I move first more / less often
    than my heroes suggest"), E7DaT `personal.py`
  - ban forecast (which of my five they ban) and with it the expected value of the final ban
  - similar-team records ("teams sharing 4 of these 5 went 31–12")
  - heroes that need a specific ally; opening-rule effects in the reasons
  - ~~the team planner~~: done (DEVLOG #52, `js/teamplan.js`). Open: plans on the in-game overlay, following a plan
    I chose, "had you built this hero" for heroes I do not own
- [ ] Model, to confirm with the owner's own collection: fit time on Windows, how the advice reads in a real draft;
  then tune `W.topModel` / `topPolicy` / `topBanned` / `topPreban` in `js/logic.js`.
- [x] Statistics page RTA → Top players: hero table, details per hero, pre-bans by role, openers, pairs, counters,
  builds (DEVLOG #47).
- [x] Seasons: my matches / learning per season (History → Seasons), statistics of one season alone, the season
  shown wherever top-player numbers appear; update checks at start for the app and the top players' games
  (DEVLOG #48).
- [ ] Seasons, to confirm at the next real season change: the list's time zone, the pre-season code, the blend.
- [x] Statistics page: weekly trend, my own matches and build next to the top players' (DEVLOG #49).
- [ ] Statistics page, next: what top players pick at a given draft position, element / class filters, a list of
  the heroes I build differently (needs my gear: gear.txt or the screen-read gear).
- [x] Record site on the owner's PC (2026-11-14, from a screenshot): "Find me" on Global, first import (97 games) and
  the top-player update work.
- [ ] Record site, still to confirm on the owner's PC: import after a real match (delay), twin detection with the
  app's own recording, a full top-player run; then tune the 4 / 12 minute import delays.
- [ ] Record site ideas: opponent's win rate per hero and against my heroes; Guild War: look up all enemies of a war
  in one go; show my own habits the way the opponent would see them.
- [ ] Verify on real picking-phase screens: pre-ban icons, hover vs confirmed cards, turn counting (only a BAN screen so far).
- [x] Keep computed portrait templates between app starts (DEVLOG #43).
- [ ] Opening rule (E7DaT reads it on Korean screens only), which hero was banned at the end (faded card).
- [ ] RTA at a wider window: confirm where the enemy cards and pre-bans sit (alternatives are tried now).

## Any window size / Guild War fortresses (owner, DEVLOG #38)
- [x] Any window size: title bar from the pixels, anchored built-in positions, screen signatures from the middle 16:9 part.
- [x] Guild War: which fortress (Stinger / Darkwood / Vortex) and its defenders' names from the fortress map.
- [x] Our own side's fortresses (the shield view), fortress names read from the overview, beaten defenders (DEVLOG #39).
- [x] Standby page (no war running, time to the next war): recognised, said on the War tab, open war finished with
  Undo, next war's time shared with the guild (DEVLOG #46).
- [ ] Guild War states still unknown: what the game shows between standby and the war (matching / preparation), and
  when a war has just ended (results). Needs screenshots; then a reminder shortly before a war begins.
- [ ] Standby page in other game languages (the title is matched in English).
- [x] "Beaten" from the enemy map marks targets cleared; reminder 30 minutes before the next war (DEVLOG #50).
- [ ] Count attacks left from the game (the map shows who is beaten, not who attacked).
- [ ] RTA screens at a wider window: verify the anchors (needs RTA screenshots from the maximized window; see the E7DaT section).
- [x] Enemy defense panel at a wider window: pinned left (DEVLOG #39).
- [ ] Better name reading (game font): 6–8 of 10 names exact now; corrections are remembered.
- [ ] Round icons of skins (67 in the asset repository) for the face matcher: tried in DEVLOG #43, changed nothing on the
  owner's screens (the misses were new heroes, not skins); add when a skin is actually missed.

## Desktop-only + in-game overlays (owner, DEVLOG #37)
- [x] Desktop app is the product; web keeps only Guild War for guildmates; offline web app and My devices sync removed.
- [ ] **Steam / Discord overlay awareness:** teach a "covered" screen from real screenshots (Steam overlay open with
  Shift+Tab; Discord voice widget / a notification over the game) so readers pause and our overlay hides while the Steam
  overlay is open. Needs those screenshots from the owner.
- [ ] Make the desktop app feel like one app: a single window with a sidebar instead of web pages, tray icon, start with
  Windows, settings page for overlay and shortcuts.
- [ ] Phone companion later (read-only view of notes/matches), if wanted again.

## Other planned items

- **Top priority: read each hero's equipped gear from the hero gear screen.** Fribbels' importer doesn't work with
  the Steam version, so Steam players have no `gear.txt`. This would link gear to heroes and give real speeds for RTA and
  the Guild War dots. Until then, typed speeds (RTA → Heroes → Edit → My speed) fill the gap.
  Needs a Steam-version screenshot of a hero's gear screen.

- **Mobile version:** an Android app that reuses this code, with screen reading (with permission) and a floating
  bubble over the game. iPhone is very limited. After the PC version has been tested on the real game.
- **Official RTA match history import:** an "export my matches" bookmarklet run on the official site while logged in.
  It saves a file the RTA module imports as its own source (`official records`). Needs a screenshot or saved copy of
  the match-history page.
- **Guild War screen reading:** enemy defenses and attack results read from the screen (needs Guild War screenshots).
  Dots drawn right next to every name on the Guild War map in the desktop overlay.
- **Gear from hero screens:** read each hero's equipped items from the hero gear screen, so screen-read gear is linked
  to heroes and speeds work without gear.txt.
- **Default positions for common emulator resolutions,** so calibration can be skipped (needs real screenshots).
- **Gear check beyond speed** for Guild War dots (effectiveness, crit, HP).
