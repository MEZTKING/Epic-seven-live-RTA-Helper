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

## Any window size / Guild War fortresses (owner, DEVLOG #38)
- [x] Any window size: title bar from the pixels, anchored built-in positions, screen signatures from the middle 16:9 part.
- [x] Guild War: which fortress (Stinger / Darkwood / Vortex) and its defenders' names from the fortress map.
- [ ] **Our own side's fortresses** (the shield view): needs a screenshot of our side's map (badge colour unknown; the reader
  only takes red-ringed enemy badges now).
- [ ] RTA screens at a wider window: verify the anchors of the pre-ban / pick boxes (needs RTA screenshots from the maximized window).
- [ ] Enemy defense panel at a wider window: verify left vs middle (both are tried now).
- [ ] Better name reading (game font): 6–8 of 10 names exact now; corrections are remembered.

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
