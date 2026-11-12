# Epic 7 Engine

A fan-made toolkit for Epic Seven. It runs in any browser, including on a phone, with no install.
The home page (`index.html`) lets you pick a module, and every page has the same top bar for switching between them:

| Page | What it does |
|---|---|
| **RTA** (`rta.html`) | Live draft helper: reads the draft from your emulator, suggests picks and bans, scouts opponents, tracks speeds and learns from your matches |
| **Gear** (`gear.html`) | Gear sorter: keep / enhance / reforge / extract / sell, and which hero each item suits |
| **Live** (`live.html`) | Screen detector, readers and the overlay on top of the game (desktop app) |
| **Guild War** (`guild.html`) | Enemy defenses, attacks, counters and member records, **shared live with your guild** |

RTA and Gear data stay in your browser. Guild War data is shared with your guild through a free Firebase project
(see [docs/GUILD_SETUP.md](docs/GUILD_SETUP.md)), or kept on one device if you don't set that up.

> Epic 7 Engine is fan-made and not affiliated with Smilegate or Epic Seven. The hero list and portraits load from the official Epic Seven site.

## Live: automatic, with an overlay on the game

Everything works in four layers:
1. **Capture:** a live picture of the game.
2. **Screen detector:** recognises which game screen is showing. You teach each screen once by pressing
   "This is that screen"; it's saved on your device and shared by all modules.
3. **Readers:** each one runs only on its own screen.
   - RTA: draft, drafting help, postbans, opponent name, CR bar (normal or **expanded**), Victory/Defeat.
   - Guild War: the enemy's name.
   - Gear: item details.
4. **Overlay:** suggestions next to the draft slot being picked, enemy speeds next to their heroes, the Guild War dot and
   counter next to the enemy's name, and the gear verdict next to the item panel.

The overlay sits **on top of the game** in the **desktop app** (`desktop/`, Electron: transparent, click-through, hidden
from capture so the readers never read it, and no "choose what to share" prompt). In a browser you can preview it
from the Live page. Everything only reads the screen.

## Hero info: skills and role tags (every page)

Tap **ⓘ**, a hero in a draft slot, or a hero chip in Guild War to open the hero's card:
- **Role tags** for a quick overview, grouped as Role, Offense, Utility and Control (nuker, tank, support, cleanse, dispel,
  defense break, extra turn, stun, provoke…). They also show as small chips next to heroes in suggestions, scouting
  and Guild War cards. ✓ means both sources agree.
- **Skill notes**, short reminders per skill, kept by source: `my notes` (yours, this device) and `guild` (shared with
  your guild through Guild War sync, edited on the Guild War page).
- **Full skill descriptions from [CeciliaBot](https://ceciliabot.github.io)** (normal + awakened, numbers at max
  enhancement), loaded when you open a card and cached on your device. Only hero ids are sent; it can be switched off on the card.
- **Automatic role tags** (`ceciliabot`) from each hero's game effects (AoE, defense break, stun, cleanse, barrier…).
  These are facts, not opinions, so the team check works with no manual tagging.
- A link to the hero's page on **epic7x.com**, plus your build, RTA record and opponents' speeds seen.

## Gear without Fribbels

**Gear → Read gear from the game:** box the item details panel once, then click through your inventory. Each item is
read with OCR, checked, and added as its own source (`screen`). Nothing is sent anywhere. Items read this way aren't
linked to heroes yet; for hero speeds use `gear.txt` for now.
Why not copy Fribbels' importer: it records the game's network traffic and decodes it on Fribbels' private server
(see DEVLOG #10).

## Later plans

See [docs/ROADMAP.md](docs/ROADMAP.md): a PvE & events module (Advent, Dimensional Exploration, Hunts, Otherworldly Breach,
Trial of Constellation, Strategic Archive…), a mobile app, importing official match history, and more.

## Guild War (shared with your guild)

- **War board:** add each enemy player's defense (2 teams of 3, with speeds, sets and artifacts), see which teams are
  cleared and by whom, assign targets to members, and log every attack with one click.
- **Counters from guild history:** for any defense, see the attack teams that beat it before. Exact matches come first,
  then teams sharing 2 of 3 heroes, with their record and who used them. The attack form can fill in a known counter.
- **Who can take what:** for each uncleared team, the members with attacks left who **own** a known counter.
  Members share only which heroes they own, taken from their RTA roster, never their gear.
- **Members:** attacks left today, win rate, defense held/lost, and each member's current defense.
- **Enemies:** everything seen of an enemy player across all wars (defenses, speeds, builds, who beat them with what).
- **Counters tab:** enemy heroes your guild loses to most, and your best attack teams overall.
- **Dots: can *you* beat them?** Every enemy team, and every player (their weakest team still standing), gets a marker
  worked out from **your** heroes and **your** gear:

  | Dot | Meaning |
  |---|---|
  | 🟢 green dot | Proven counter you own **and your gear checks out**: your speeds match the teams that won and beat this enemy's recorded speeds |
  | 🟢 green ring | Proven counter you own, **gear not checked** (no `gear.txt` imported on this device) |
  | 🟡 yellow | Not enough information, or a catch: only similar teams beaten, one win, a mixed record, you don't own the counter, or you're slower |
  | 🔴 red | No chance right now: lost to it repeatedly, never won |
  | ⚪ grey | No information |

  "Proven" means this exact team was beaten 2+ times with no losses (or 3+ wins at 80%). Crits and turn meter can always
  flip a fight, so green means reliable, not guaranteed. Hover a dot for the reasons; tap a dot or a name for the full history.
- **Player history across seasons:** wars can carry a season label, and nothing is ever thrown away. The history window
  shows every time anyone in the guild met that player: their teams, speeds (latest and highest per hero), builds
  noted, every attack with who, which team, the result and the attacker's speeds, and the guild's record against them.
  If you met them in RTA, your own RTA record against them is shown too (from this device only, not shared).
- **Pop-out beside the game (⧉):** a small always-on-top window (Chrome/Edge) showing the enemy you're looking at.
  It has their dot, each team with your proven counter and speed check, one-tap **Won / Lost** (logs the suggested
  counter, with your speeds), Prev/Next through uncleared targets with the best chances first, and a link to their full history.
  Pick the player with ⧉ on a card, by typing in the pop-out, or let **Watch game** do it: box where the enemy's
  name appears once, and the app reads it from the emulator every 2 seconds. It tolerates small reading mistakes and
  never touches the game.
- **Speeds on attacks:** when you log an attack, your heroes' speeds from your `gear.txt` are attached (you can turn this
  off in Setup). That's how the guild learns what speed it takes to win.
- **Sharing:** live through Firebase, with anonymous sign-in (no emails). One person sets it up in about 10 minutes and
  everyone else opens an invite link. You can also export or import files (for example, to share in Discord).
- Rules such as attacks per day and teams per defense are shared guild settings, in case the game changes them.

## RTA features

**Auto: no typing during the draft** (PC with an emulator, in Chrome or Edge)
1. Open the helper in Chrome or Edge **next to** the emulator, not minimized.
2. **Auto → Watch emulator window** and choose the emulator window.
3. With the draft screen showing, press **Calibrate slots** and drag a box over each slot when asked:
   both prebans for each side, then the **first and last** pick slot for each side
   (the app spaces the middle three evenly), and optionally the opponent's name. You only do this once.
4. Play. A few times a second the app recognizes the hero in every slot, fills the Draft tab in game order,
   works out who picked first, starts a new draft when new prebans appear, and reads the opponent's name.
5. If it gets a hero wrong, click that slot in **What I see** and type the right hero. The app keeps that
   screen image as a **my corrections** example and prefers it from then on, so it improves the more you play.

It only reads the screen and never clicks or types into the game. Recognition starts from the official portraits,
so the in-game art may need a few corrections at first. **Check alignment** shows your boxes over the current frame.
**Use a screenshot** lets you calibrate or test with a saved screenshot instead of a live window.
**Also automatic (each needs its own one-time box):**
- **Postbans** (experimental): spotted when one pick slot on each side changes look after the picks.
- **Victory/Defeat:** press *Calibrate result banner* on the result screen. The result is recorded under its own
  source `auto`. You can switch this off.
- **Enemy speeds:** press *Calibrate CR bar* on a battle screen. At battle start the app finds every hero on the bar and
  works out enemy speeds from your heroes' known speeds. These are saved to Scouting.

**Floating mini window.** **Pop out ⧉** (or press **P**) opens a small window that stays on top of the emulator.
It shows whose turn it is, the top 3 suggestions (click to pick), the best pair, postban risk, the opponent's habits,
enemy speeds, and Win/Loss/Undo. In Chrome or Edge it stays on top of the emulator; other browsers open it as an ordinary pop-up.

**Gear, sets and artifacts (yours and your opponents')**
- **Yours, exact:** importing `gear.txt` reads every equipped item. The app calculates each hero's real speed
  (base × Speed or Revenge set bonus + flat speed from main stats and substats) and lists sets and artifacts.
  Speeds appear on your draft slots, in the Heroes tab, in speed checks and in the turn simulator.
  Not included: exclusive-equipment speed (those heroes are marked *).
- **Opponents', observed:** the **Scouting** panel in the Draft tab saves each enemy hero's speed, sets and artifact,
  per player. Speeds fill in automatically when the CR bar is read at battle start. Next time you meet that player,
  or that hero, you'll see what they ran before, and suggestions use speed edges like
  "Faster than Seaside Bellona (242 vs ~230)".

**Smarter drafting**
- **Best pair** on 2-pick turns. The second hero is scored with the first already on the team.
- **First-pick safety:** heroes with many known counters, or that often get postbanned, rank lower.
- **Postban risk:** which of your heroes they are most likely to ban, using their own ban history.
- **Deny:** a bonus for heroes that would also be strong for the opponent.
- **Team check:** tag heroes (cleanse, dispel, debuffer, AoE, heal…) to get warnings like
  "No cleanse or immunity against 2 debuffers".
- **Meta datasets:** import season pick, ban and win rates as their own sources.
- **Tune from my matches** learns how much to trust each source from your own wins and losses.
  You can also set the weights by hand with sliders.

**Session:** today's record, current streak, a warning after 3 losses in a row, rank points over time, and whether
following the suggestions actually wins you more games.

**Shortcuts** (when not typing): `1` `2` `3` pick a suggestion · `U` undo · `N` new draft · `W`/`L` record win/loss ·
`P` pop-out · `R` read CR bar · `?` help. The app also beeps when your turn starts (can be switched off).

**The game's own drafting help → your own database.** Turn on drafting help in RTA, then press
**Auto → Calibrate game's drafting help**. Box the first and last recommended hero and enter how many it shows.
At every draft step, for picks and for pre- and postbans, the app records what the game recommends together with the board at that moment,
under its own source `game help`:
- **Live:** the current recommendations are added to the suggestions ("Game's drafting help suggests it now (#1)").
- **Database:** over time the app learns which heroes the game recommends **against** each enemy hero, **with** each
  ally, and which heroes it recommends banning. Browse it in **Teams → Game's drafting-help database**, export it as CSV,
  and use it as a signal in suggestions ("Game recommended it vs Landy 7×").
- **Did it help?** History compares your win rate when you followed the game's help with when you didn't.

**Gear Sorter** (`gear.html`, the **Gear ↗** link). A separate page that shares your `gear.txt`:
- Gear score for every item, using the same **WSS** formula as the Fribbels/RexQian optimizer (substats only),
  plus the **score after reforging** (level 85 → 90, using the fork's per-roll reforge table) and the **expected score at +15**
  for unfinished items.
- **Who it's best for:** each item is compared with what each of your heroes wears in that slot. Hero priorities are
  learned from the substats their current gear rolled into, mixed with a class default, and you can override them per hero.
- **Verdict:** Keep / Enhance / Reforge / Extract / Sell, each with a reason (for example "Upgrade for a hero (+9 fit)",
  "Speed piece (15 speed)", "65 → 77 after reforge"). The thresholds are adjustable rules of thumb.
- **Shop check:** enter an item from a shop to see if it's worth buying and for whom.
- Filter by verdict, slot, set, spare or equipped, or **best for a hero**.

**Draft**
- Tracks the RTA draft: 2 prebans each, picks in 1-2-2-2-2-1 order, then 1 postban each.
- Shows hero portraits. Click a hero, or type part of a name and press **Enter**.
- Enter the **opponent's name** to see their profile and get suggestions based on their habits.
- Suggestions for prebans, your picks, the opponent's likely picks and postbans. **Every reason is labeled with its source.**
- Press **Win** or **Loss** to log the match. Every logged match teaches the app.

**Speed:** enemy speed from the CR bar, the speed you need to outspeed, and a turn order simulator.

**Heroes:** all 368 heroes from the official list. Add your tiers, counters, synergies and notes, and see each hero's learned win rate.

**Teams:** save team presets. During a draft, heroes that complete a preset you've started get a bonus.
The app also lists your **best pairs and trios** based on your results.

**Players:** a profile for every opponent you've named, showing favorite picks, prebans, first picks,
which of your heroes they postban, and your win rate against them.

**History:** win rate overall and by first or second pick, win rate for each of your heroes,
your win rate against each enemy hero, and the most-banned heroes.

## Data sources are kept separate

Each source is stored separately and never merged into another. If one turns out to be wrong, switch it off or delete it
in the **Data** tab without touching the rest.

| Source | What it holds | Where it comes from |
|---|---|---|
| `official` | Hero names, elements, classes, codes | Smilegate's public hero list. A copy is built in; **Update from official site** refreshes it |
| `Fribbels` | Heroes you own and their stars | Your `gear.txt` from the Fribbels optimizer ([RexQian fork](https://github.com/RexQian/Fribbels-Epic-7-Optimizer)) |
| `my notes` | Tiers, counters, synergies, notes, owned ticks | You |
| `custom` | Heroes you added that are missing from the official list | You |
| `manual` matches | Matches you logged from the Draft tab | You |
| `import:<name>` matches | Each imported CSV dataset, under its own name | Files you import |
| `learned` | Win rates, matchups, pairs, player profiles | Calculated only from the match sources you have switched on |
| `my corrections` | Screen images of slots you labeled | You, in the Auto tab |
| `fribbels-data` | Hero base stats and artifact names | Data used by the [RexQian fork](https://github.com/RexQian/Fribbels-Epic-7-Optimizer) of the Fribbels optimizer (built-in copy + **Update**; the fork's GitHub copy is the fallback) |
| `game help` | What the game's RTA drafting help recommended, for picks and bans, with the board at that moment | Auto-detection |
| `scouting` | Opponents' speeds, sets and artifacts, per player and per hero | You, or the CR-bar reader |
| `meta: <name>` | Season pick, ban and win rates | Meta CSVs you import |
| `auto` matches | Results read from the Victory/Defeat screen | Auto-detection |
| `auto-learned` | Screen images saved automatically from confident matches (off by default) | Auto-detection |

## How suggestions are scored

Each signal adds or subtracts points. You can switch each one off.

| Signal | Source | Points |
|---|---|---|
| Your tier rating | my notes | S +3, A +2, B +1 |
| Counters an enemy pick / countered by one | my notes | +3 / −3 each |
| Synergy with an ally | my notes | +2 each |
| Element advantage (Fire > Earth > Ice > Fire, Light ↔ Dark) | game rule | ±0.5 per enemy |
| Hero's win rate, its win rate against each enemy, and with each ally | learned | (win rate − 50%) × 6 / 8 / 6 |
| Completes a preset you've started | presets | +2.5 |
| Meta win rate / pick rate (for their picks) / ban rate (for prebans) | meta | (win − 50%) × 10, pick × 3, ban × 4 |
| Faster or slower than each enemy (your gear vs scouted speed) | speed | ±0.6 per enemy |
| Would also be strong for the opponent | deny | their score × 0.3 |
| The game's drafting help recommends it right now | game help | +3 for #1, then 15% less per rank |
| Recommended by the game against an enemy on the board, or with an ally, in past drafts | game help | +0.4 / +0.25 per time (max 5) |
| The opponent's pick habits (predicting their picks, and prebans) | player | pick rate × 5 |

Learned win rates are smoothed toward 50% (4 imaginary games at 50%), so 1–2 lucky games don't dominate.
Postbanned heroes don't count toward matchup or win-rate stats, because they didn't fight.
You can tune the weights in `js/logic.js` (`W`, `TIER_SCORE`).

## Importing data

- **Fribbels roster:** Data → *Import gear.txt*. Names the app doesn't recognize are listed so you can check them.
- **Matches (CSV):** Data → *Download CSV template*, fill it in, then *Import matches*. You name the dataset, and it stays separate.
  Separate hero names with `|`.
- **Backup:** *Export everything* / *Import backup* moves all your data between devices.

## Development

Documentation for anyone continuing the project:
- [docs/HANDOFF.md](docs/HANDOFF.md): how everything works (code map, storage, flows, testing, status).
- [DEVLOG.md](DEVLOG.md): every change, with research, bugs fixed and what was tested.
- [docs/SOURCES.md](docs/SOURCES.md): every outside source, where it's used and what's sent to it.
- [docs/ROADMAP.md](docs/ROADMAP.md): later plans.

Tests: `npm test` (unit) and `bash tests/e2e/run-all.sh` (browser, Playwright).

Plain HTML, CSS and JavaScript with no build step. Open `index.html` (the home page) and pick a module.

```
js/sources/official-heroes.js  built-in copy of the official hero list (generated)
js/roster.js    official list parsing, Fribbels + CSV import      (pure, tested)
js/learn.js     learning engine: stats, matchups, pairs, players  (pure, tested)
js/logic.js     draft rules, suggestion scoring, speed math       (pure, tested)
js/vision.js    image matching, calibration layout, confidence  (pure, tested)
js/gear.js      gear.txt builds, set bonuses, speed calculation   (pure, tested)
js/gearsort.js  gear score, reforge, hero fit, keep/sell verdicts (pure, tested)
gear.html, js/gear-app.js  the Gear Sorter page
js/tune.js      learns suggestion weights from your matches       (pure, tested)
js/sources/fribbels-data.js  built-in copy of hero base stats + artifacts (generated)
js/guildwar.js  Guild War logic: war summary, counters, assignments  (pure, tested)
js/sync.js      shared storage: local (this device) or Firebase (guild)  (tested with a fake SDK)
guild.html, js/guild-app.js  the Guild War page
firestore.rules, docs/GUILD_SETUP.md  Firebase security rules + setup guide
js/screens.js   screen detector (fingerprints, detect, gating)    (pure, tested)
js/statparse.js OCR text -> gear item (stat lines, set, slot)     (pure, tested)
js/screen-watch.js, js/overlay-bus.js  shared browser helpers (current screen, overlay channel)
live.html, js/live.js, overlay.html    the Live page and the overlay layer
js/gear-scan.js the screen gear reader (Gear page)
desktop/        Electron desktop app (overlay on top of the game)
js/app.js       UI and storage
js/auto.js      screen capture, calibration, detection loop, OCR, postbans, result, CR bar
js/pip.js       always-on-top mini window
sw.js, manifest.webmanifest  install as an app / offline (when served over https)
tools/update-official-heroes.js  regenerates the built-in hero list
```

```
npm test               # unit tests (Node 18+)
npm run update-heroes  # refresh js/sources/official-heroes.js
npm run update-fribbels-data  # refresh js/sources/fribbels-data.js
```

### Install it / open it on any device (GitHub Pages)
1. Merge this branch into `main`.
2. In the repository, go to **Settings → Pages → Source** and choose **GitHub Actions**. You only do this once.
3. Every push to `main` runs the tests and publishes the app at `https://<user>.github.io/<repo>/`.
   In Chrome or Edge, use the install icon in the address bar to get a desktop app that also works offline.

## Roadmap
- [x] Auto-detect the draft from the emulator window
- [x] Read the opponent's name from the screen (OCR via tesseract.js, loaded on demand)
- [x] Detect postbans, Victory/Defeat and CR-bar speeds from the screen
- [x] Your gear: real speeds, sets and artifacts from gear.txt
- [x] Opponent scouting: speeds, sets and artifacts per player
- [x] Guild War tracker shared with the guild
- [ ] Default slot positions for common emulator resolutions (needs real screenshots)
- [ ] Guild War: read enemy defenses from the screen (needs screenshots)
- [ ] Optional import of official battle records, if they can be reached from the browser
