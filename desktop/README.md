# Epic 7 Engine — desktop app

The same Epic 7 Engine pages, plus what a browser can't do:

- **Overlay on top of the game:** a transparent, click-through layer showing suggestions next to draft slots,
  enemy speeds, Guild War dots next to the enemy's name, and gear verdicts next to the item panel.
  It's hidden from screen capture, so the readers never read the overlay's own text.
- **Reads just the game window** (picked once from a list with previews), even when other windows cover it; the
  overlay follows that window. A whole screen can be chosen instead.
- **No "choose what to share" prompt** every session.
- **Updates itself** from this repository's GitHub Releases (Epic 7 Engine → Check for updates…).
- **Mini windows stay on top** of the game.

It only **reads** the screen and never clicks or types into the game.

## Easiest: download the ready-made app (Windows)

Repository → **Releases** → newest → `Epic-7-Engine-Setup-<version>.exe` (installer, per-user, no admin) or
`Epic-7-Engine-<version>-portable.exe`. "Windows protected your PC" → **More info → Run anyway** (the app isn't signed).
Every push that changes the app builds a new release (`.github/workflows/desktop-build.yml`, version `0.1.<run number>`),
and the app offers it: the installed app via electron-updater, the portable .exe by downloading the new .exe and
swapping it after you close the app.

## Run it from source (Windows, macOS or Linux)

1. Install [Node.js](https://nodejs.org) (LTS).
2. In a terminal:
   ```
   cd desktop
   npm install
   npm start
   ```
3. If the game is on a second monitor: **Overlay → Game is on display N**.
4. The first time a module starts reading, pick the **game window** in "Which window is the game?". Change it with the
   **Game window** menu or **Reset game area** (then stop and start reading). If you pick a whole screen instead, you're
   asked to drag a box around the game.
5. In each module, calibrate once and teach its screens (RTA → Auto, Guild War → Watch game, Gear → Read gear).

Shortcuts: **Ctrl+Shift+O** show/hide overlay · **Ctrl+Shift+E** bring back the main window ·
**Ctrl+=** bigger text · **Ctrl+-** smaller text · **Ctrl+0** normal (125%). Overlay text size: **Overlay** menu.

## Build a single .exe

```
cd desktop
npm install
npm run dist
```
The installer `Epic-7-Engine-Setup-<version>.exe` (+ `latest.yml`) and the portable `Epic-7-Engine-<version>-portable.exe` appear in `desktop/dist/`. `package-lock.json` pins the exact
dependency versions (`npm ci` uses it).

## Notes

- **Is the overlay working?** Overlay → *Overlay status (is it working?)…* says where it is and why it might be hidden;
  Overlay → *Show a test card* draws a green card on top of the game for 5 s. If the window tracker can't run (for
  example blocked by antivirus), the overlay covers the whole display instead; that lines up exactly when the game runs
  in borderless (windowed) fullscreen.
- Run the emulator in **windowed full-screen** or a normal window, not exclusive full-screen; overlays can't draw on top
  of exclusive full-screen games.
- Data is stored inside the app (separate from your browser). Use **RTA → Data → Export** in the browser and
  **Import** in the app to move it.
