# Epic 7 Engine — roadmap (later plans)

Ideas the owner asked to keep for later. When one is started, it moves to `DEVLOG.md`.

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

1. ~~Game watcher + event bus~~: done for Gear and Guild War (DEVLOG #21). **1b:** move the RTA reader (`js/auto.js`) into
   `js/vision/readers/` (draft board, prebans/postbans, opponent name, CR bar, Victory/Defeat), with a consumer that updates
   the RTA store, so the RTA page only listens.
2. Built-in screen layouts ("layout packs", fractions of a 16:9 game picture) from real Steam screenshots → no boxes.
   The owner shared draft (preban / picks / postban / Ready), battle (CR bar normal + expanded with exact CR %),
   Defeat, inventory and item-detail screenshots in chat; they're needed as files (e.g. `tests/fixtures/screens/`).
3. IndexedDB storage, one store per source; append-only match / gear history.
4. A fixed-font digit/glyph reader for gear stats (tesseract stays for names).
5. ~~Stronger hero-face matcher~~: done for round icons (DEVLOG #23, `js/faces.js`: 14/15 known faces, 0 wrong).
   Next: use it for the CR bar and result-screen icons; a banner matcher for draft picks once real draft screenshots
   exist; skins come from corrections (or a skin portrait list if one is found).
6. Opponent names in Korean / Japanese / Chinese: load those tesseract languages for the name reader; result +/− from the
   arrow colour, not the OCR'd sign.

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
