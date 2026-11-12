# Epic Seven Live RTA Helper

A fan-made helper for Epic Seven Real-Time Arena (RTA). It runs in any browser, including on a phone,
with no install, account or server. All your data stays in your browser.

> Not affiliated with Smilegate or Epic Seven.

## Features

**Draft**
- Tracks the RTA draft: 2 prebans each, picks in 1-2-2-2-2-1 order (choose who picks first), then 1 postban each.
- Click a hero, or type a name and press **Enter**, to fill the next slot. **Undo** removes the last action.
- Suggestions panel:
  - *Preban:* high-tier heroes that counter heroes in your roster.
  - *Your pick:* ranked by your tier list, counters against enemy picks, synergy with your picks, and element advantage. Only heroes you own are suggested once you mark your roster.
  - *Opponent's pick:* what they are likely to take next.
  - *Postban:* the enemy heroes most dangerous to your team.
- When the draft is complete, press **Win** or **Loss** to log the match.

**Speed**
- **Enemy speed from CR bar:** when your unit takes the first turn, enter its speed and the enemy's CR %.
  The tool estimates their speed and gives a range that accounts for random starting CR.
- **Speed needed to outspeed:** the speed you need to always move first.
- **Turn order simulator:** enter units with speed, starting CR and CR push (for example, a speed buffer
  that pushes allies 20% on its first turn) to see the opening turns. **Load names from draft** fills in the current teams.

**Heroes**
- Edit each hero's element, class, tier, notes, **counters** ("good against") and **synergies** ("works well with").
- Tick **Owned** to build your roster.
- Add new heroes as they are released.
- **Export/Import JSON** to back up your data or move it to another device.

**History**
- Overall win rate, plus win rate when you pick first and when you pick second.
- Win rate for each of your heroes, and your win rate against each enemy hero.

## Getting started

1. Open `index.html` in a browser (double-click works).
2. In **Heroes**, tick the heroes you own and set tiers. Add counters and synergies as you learn matchups.
   The suggestions get better as you add this information.
3. Use **Draft** during your RTA games.

The starting hero list is a small sample with names, elements and classes only. Counters and tiers start
empty because the meta changes every season. Fill them in from your own experience.

### Use it on your phone (GitHub Pages)
In the GitHub repository go to **Settings → Pages**, choose "Deploy from a branch", pick your branch and `/ (root)`, and save.
The site will be at `https://<your-username>.github.io/<repo-name>/`. Your data is saved separately on each device.
Use Export/Import to copy it between devices.

## Development

Plain HTML, CSS and JavaScript with no build step.

```
index.html        page layout
css/styles.css    styling
js/data.js        starter hero list
js/logic.js       draft rules, suggestion scoring, speed math (no DOM; unit-tested)
js/app.js         UI and localStorage
tests/            node tests for logic.js
```

```
npm test          # runs the unit tests (Node 18+)
npm start         # optional local server at http://localhost:8080
```

### How suggestions are scored
Each candidate hero starts with a score from its tier (S=3, A=2, B=1). Then:
- **+3** for each enemy pick it counters
- **−3** for each enemy pick that counters it
- **+2** for each ally it has synergy with
- **±0.5** per enemy for element advantage (Fire > Earth > Ice > Fire, Light ↔ Dark)

These weights are in `js/logic.js` (`W` and `TIER_SCORE`) if you want to tune them.
