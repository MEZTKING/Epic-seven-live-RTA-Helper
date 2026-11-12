# Epic 7 Engine — desktop app

The same Epic 7 Engine pages, plus what a browser can't do:

- **Overlay on top of the game:** a transparent, click-through layer showing suggestions next to draft slots,
  enemy speeds, Guild War dots next to the enemy's name, and gear verdicts next to the item panel.
  It's hidden from screen capture, so the readers never read the overlay's own text.
- **No "choose what to share" prompt** every session: the game's display is captured automatically.
- **Mini windows stay on top** of the game.

It only **reads** the screen and never clicks or types into the game.

## Easiest: download the ready-made .exe (Windows)

GitHub builds it automatically (`.github/workflows/desktop-build.yml`): repository → **Actions** → **Build Windows app**
→ newest green run → **Artifacts** → **Epic-7-Engine-windows**. Unzip and run `Epic-7-Engine-<version>-portable.exe`
("Windows protected your PC" → **More info → Run anyway**, because the app isn't signed). Tags `v*` also attach the .exe to a Release.

## Run it from source (Windows, macOS or Linux)

1. Install [Node.js](https://nodejs.org) (LTS).
2. In a terminal:
   ```
   cd desktop
   npm install
   npm start
   ```
3. If the game is on a second monitor: **Overlay → Game is on display N**.
4. The first time a module starts reading, it shows your whole screen: **drag a box around the game window** and Save.
   If you move or resize the game window later, press **Reset game area** and start reading again.
5. In each module, calibrate once and teach its screens (RTA → Auto, Guild War → Watch game, Gear → Read gear).

Shortcuts: **Ctrl+Shift+O** show/hide overlay · **Ctrl+Shift+E** bring back the main window ·
**Ctrl+=** bigger text · **Ctrl+-** smaller text · **Ctrl+0** normal (125%). Overlay text size: **Overlay** menu.

## Build a single .exe

```
cd desktop
npm install
npm run dist
```
The portable `Epic-7-Engine-<version>-portable.exe` appears in `desktop/dist/`. `package-lock.json` pins the exact
dependency versions (`npm ci` uses it).

## Notes

- Run the emulator in **windowed full-screen** or a normal window, not exclusive full-screen; overlays can't draw on top
  of exclusive full-screen games.
- Data is stored inside the app (separate from your browser). Use **RTA → Data → Export** in the browser and
  **Import** in the app to move it.
