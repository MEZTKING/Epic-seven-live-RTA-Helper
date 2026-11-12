# Epic Seven Live RTA Helper

A fan-made helper for Epic Seven Real-Time Arena (RTA). It runs in any browser, including on a phone,
with no install, account or server. All your data stays in your browser.

> Not affiliated with Smilegate or Epic Seven. The hero list and portraits load from the official Epic Seven site.

## Features

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
Postbans are still one click in the Draft tab.

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
| `Fribbels` | Heroes you own and their stars | Your `gear.txt` from the Fribbels optimizer |
| `my notes` | Tiers, counters, synergies, notes, owned ticks | You |
| `custom` | Heroes you added that are missing from the official list | You |
| `manual` matches | Matches you logged from the Draft tab | You |
| `import:<name>` matches | Each imported CSV dataset, under its own name | Files you import |
| `learned` | Win rates, matchups, pairs, player profiles | Calculated only from the match sources you have switched on |
| `my corrections` | Screen images of slots you labeled | You, in the Auto tab |
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

Plain HTML, CSS and JavaScript with no build step. Open `index.html`.

```
js/sources/official-heroes.js  built-in copy of the official hero list (generated)
js/roster.js    official list parsing, Fribbels + CSV import      (pure, tested)
js/learn.js     learning engine: stats, matchups, pairs, players  (pure, tested)
js/logic.js     draft rules, suggestion scoring, speed math       (pure, tested)
js/vision.js    image matching, calibration layout, confidence  (pure, tested)
js/app.js       UI and storage
js/auto.js      screen capture, calibration UI, detection loop, OCR
tools/update-official-heroes.js  regenerates the built-in hero list
```

```
npm test               # unit tests (Node 18+)
npm run update-heroes  # refresh js/sources/official-heroes.js
```

## Roadmap
- [x] Auto-detect the draft from the emulator window
- [x] Read the opponent's name from the screen (OCR via tesseract.js, loaded on demand)
- [ ] Detect postbans and the Win/Defeat screen automatically
- [ ] Optional import of official battle records, if they can be reached from the browser
