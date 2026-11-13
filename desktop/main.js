/*
 * Epic 7 Engine — desktop app (Electron).
 *
 * Runs the same pages as the website, plus:
 *  - OVERLAY: a transparent, click-through, always-on-top window covering the
 *    display the game is on. It shows overlay.html, which draws what the
 *    modules post (dots, suggestions, speeds) next to the game's own UI.
 *    It is hidden from screen capture, so the readers never read our own text.
 *  - Capture just the GAME WINDOW (picked once; desktop/picker.html), or a whole
 *    display. Pages calling getDisplayMedia() get it automatically, no prompt.
 *    In window mode the overlay follows the game window (wintrack.js, Windows). If that tracker
 *    fails or doesn't answer within 5 s, the overlay is shown over the game's display instead
 *    (lines up exactly with borderless fullscreen), and the reason is in Overlay → Status and
 *    in the "Copy report" text (E7Desktop.overlayStatus()).
 *  - Pop-out windows stay on top of the game.
 * It only READS the screen. It never sends input to the game.
 *
 *  - In-app updates (updater.js): checks GitHub Releases at start and from the
 *    menu "Check for updates…"; downloads, then restarts on the new version.
 *
 * Shortcuts: Ctrl+Shift+O show/hide overlay · Ctrl+Shift+E show the main window · Ctrl+Shift+S save a game picture
 */
const { app, BrowserWindow, protocol, net, screen, session, desktopCapturer, globalShortcut, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const updater = require('./updater');
const wintrack = require('./wintrack');
const PRELOAD = path.join(__dirname, 'preload.js');
// tests only (tests/desktop/overlay-status.js): behave as on Windows, so the window tracker really starts (and,
// off Windows, really fails: no PowerShell), and expose trackGame
const IS_WIN = process.platform === 'win32' || process.env.E7_TEST_WIN === '1';

const ROOT = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..');
const ORIGIN = 'e7://app';
const CONFIG = () => path.join(app.getPath('userData'), 'config.json');

protocol.registerSchemesAsPrivileged([{ scheme: 'e7', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

let main = null;
let overlay = null;
let vision = null; // the game watcher: hidden window running vision.html (js/vision/hub.js)
let quitting = false;
// capture: null (not chosen yet) | { mode: 'window', id, name } | { mode: 'screen', id, displayId, name }
let config = { displayId: null, overlay: true, zoom: 1.25, overlayZoom: 1.25, capture: null, devCapture: false };
let tracker = null;
let gameState = null; // last tracker state of the game window
// why the overlay is where it is (Overlay menu → status, E7Desktop.overlayStatus(), the diagnostic report)
const ovStatus = { fallback: false, error: '', failedAt: 0, trackingSince: 0, lastStateAt: 0, shownOnce: false };
const TRACK_WAIT_MS = 5000; // no answer from the tracker in this time -> show the overlay over the display
const TRACK_RETRY_MS = 60000; // after a failure, try the tracker again only this often
const clampZoom = (z) => Math.min(2.5, Math.max(0.6, Math.round(z * 100) / 100));

function loadConfig() {
  try {
    config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG(), 'utf8')) };
  } catch (_) { /* first run */ }
}
function saveConfig() {
  try {
    fs.writeFileSync(CONFIG(), JSON.stringify(config, null, 2));
  } catch (_) { /* ignore */ }
}
function gameDisplay() {
  return screen.getAllDisplays().find((d) => d.id === config.displayId) || screen.getPrimaryDisplay();
}

/** Serve the app's own files under e7://app/ (one origin for all windows: shared storage + live channels). */
function serveFiles() {
  protocol.handle('e7', (req) => {
    const url = new URL(req.url);
    let p = decodeURIComponent(url.pathname);
    if (p === '/' || p === '') p = '/index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT + path.sep) || p.includes('/.git')) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

// ------------------------------------------------------------ what to capture
const ownSourceIds = () => BrowserWindow.getAllWindows().map((w) => w.getMediaSourceId());
const GAME_GUESS = /epic\s*seven|ldplayer|bluestacks|nox\s*player|memu|mumu|google play games|gameloop|msi app player/i;

async function listSources(thumb) {
  const own = new Set(ownSourceIds());
  const list = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: thumb || { width: 0, height: 0 } });
  return list.filter((s) => !own.has(s.id));
}

let picker = null;
let pickerDone = null;
/** Ask which window is the game. Resolves with the saved choice, or null if cancelled. */
function pickWindow(why) {
  if (picker) {
    picker.focus();
    return new Promise((res) => {
      const prev = pickerDone;
      pickerDone = (c) => {
        prev && prev(c);
        res(c);
      };
    });
  }
  return new Promise((resolve) => {
    picker = new BrowserWindow({ width: 900, height: 680, title: 'Which window is the game?', parent: main || undefined, backgroundColor: '#12131a', autoHideMenuBar: true, webPreferences: { preload: PRELOAD } });
    picker.loadFile(path.join(__dirname, 'picker.html'), why ? { query: { why } } : undefined);
    pickerDone = resolve;
    picker.on('closed', () => {
      picker = null;
      const d = pickerDone;
      pickerDone = null;
      d && d(null);
    });
  });
}
ipcMain.handle('e7:sources', async () => {
  const displays = screen.getAllDisplays();
  return (await listSources({ width: 320, height: 180 })).map((s) => ({
    id: s.id,
    name: s.id.startsWith('screen') ? `Screen ${displays.findIndex((d) => String(d.id) === String(s.display_id)) + 1 || ''} ${s.name}`.trim() : s.name,
    kind: s.id.startsWith('screen') ? 'screen' : 'window',
    displayId: s.display_id,
    thumb: s.thumbnail.toDataURL(),
    guess: !s.id.startsWith('screen') && GAME_GUESS.test(s.name),
  }));
});
ipcMain.on('e7:choose', (e, choice) => {
  if (!picker || e.sender !== picker.webContents) return; // only the picker window may choose
  if (choice) setCapture(choice);
  const d = pickerDone;
  pickerDone = null;
  if (picker) picker.close();
  d && d(choice ? config.capture : null);
});
ipcMain.handle('e7:pick', () => pickWindow());
ipcMain.on('e7:version', (e) => {
  e.returnValue = app.getVersion();
});
// ---- developer tool: collect game screenshots automatically (for improving the readers) ----
const devFolder = () => path.join(app.getPath('pictures'), 'Epic 7 Engine', new Date().toISOString().slice(0, 10));
let devCount = 0;
ipcMain.on('e7:dev', (e) => {
  e.returnValue = { on: !!config.devCapture, folder: devFolder(), count: devCount };
});
/** { dataUrl (PNG), meta } from the game watcher -> <Pictures>/Epic 7 Engine/<date>/<time>-<screen>.png + .json */
ipcMain.on('e7:dev-shot', (_e, shot) => {
  if (!config.devCapture || !shot || !/^data:image\/png;base64,/.test(shot.dataUrl || '')) return;
  try {
    const dir = devFolder();
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
    const tag = String((shot.meta && shot.meta.screen) || 'unknown').replace(/[^a-z0-9-]/gi, '').slice(0, 30) || 'unknown';
    const base = path.join(dir, `${stamp}-${tag}-${++devCount}`);
    fs.writeFileSync(base + '.png', Buffer.from(shot.dataUrl.split(',')[1], 'base64'));
    fs.writeFileSync(base + '.json', JSON.stringify(shot.meta || {}, null, 2));
  } catch (_) { /* disk full / no permission: skip */ }
});
function setDevCapture(on) {
  config.devCapture = !!on;
  saveConfig();
  if (vision && !vision.isDestroyed()) vision.webContents.send('e7:dev-changed', config.devCapture);
  buildMenu();
}

// a hidden window (the game watcher) shows itself while it needs the user, e.g. "Where is the game?"
ipcMain.on('e7:show-self', (e, show) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || w === overlay) return;
  if (show) {
    w.show();
    w.focus();
  } else if (w === vision) w.hide();
});
// zoom is shared by every window of the same origin (e7://app), so the overlay scales its own items by overlayZoom / zoom
ipcMain.on('e7:zoom', (e) => {
  e.returnValue = { zoom: config.zoom, overlayZoom: config.overlayZoom };
});
ipcMain.on('e7:capture', (e) => {
  const c = config.capture;
  e.returnValue = { mode: c ? c.mode : 'screen', name: c ? c.name : '', chosen: !!c, tracked: !!(tracker && gameState && gameState.w) };
});
function overlayStatus() {
  const c = config.capture;
  const b = overlay && !overlay.isDestroyed() ? overlay.getBounds() : null;
  return {
    on: !!config.overlay,
    visible: !!(overlay && !overlay.isDestroyed() && overlay.isVisible()),
    bounds: b,
    mode: c ? c.mode : 'not chosen',
    platform: process.platform,
    tracking: !!tracker,
    gameState,
    lastStateAgoMs: ovStatus.lastStateAt ? Date.now() - ovStatus.lastStateAt : null,
    fallback: ovStatus.fallback,
    error: ovStatus.error,
    display: gameDisplay().bounds,
  };
}
ipcMain.on('e7:overlay-status', (e) => {
  e.returnValue = overlayStatus();
});

function setCapture(choice) {
  config.capture = { mode: choice.mode === 'window' ? 'window' : 'screen', id: choice.id, name: choice.name };
  if (choice.mode !== 'window' && choice.displayId) {
    config.displayId = Number(choice.displayId) || choice.displayId;
    config.capture.displayId = config.displayId;
  }
  saveConfig();
  if (config.capture.mode === 'window') trackGame(choice.id);
  else stopTracking();
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('e7:capture-changed', { mode: config.capture.mode, name: config.capture.name });
  buildMenu();
}

/** Find the chosen source again (window ids change when the game restarts; then match by title). */
async function resolveSource() {
  let c = config.capture;
  if (!c) {
    c = await pickWindow();
    if (!c) return null;
  }
  const list = await listSources();
  if (c.mode === 'window') {
    const w = list.find((s) => s.id === c.id) || list.find((s) => !s.id.startsWith('screen') && s.name === c.name);
    if (w) {
      if (w.id !== c.id) {
        c.id = w.id;
        saveConfig();
      }
      trackGame(w.id);
      return w;
    }
    const again = await pickWindow(`The game window "${c.name}" wasn't found (is the game open and not minimized?). Pick it again, or choose a whole screen.`);
    return again ? resolveSource() : null;
  }
  const d = gameDisplay();
  return list.find((s) => String(s.display_id) === String(d.id)) || list.find((s) => s.id.startsWith('screen')) || null;
}

/** getDisplayMedia() in any page -> the game window (or display), no browser picker. */
function autoCapture() {
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, callback) => {
    let src = null;
    try {
      src = await resolveSource();
    } catch (_) { /* treated as cancelled */ }
    try {
      if (src) callback({ video: src });
      else callback(); // cancelled: the page's getDisplayMedia() rejects
    } catch (_) { /* already answered */ }
  });
}

// ------------------------------------------------------------ overlay follows the game window
function trackGame(sourceId) {
  const hwnd = wintrack.hwndOf(sourceId);
  if (tracker && tracker.hwnd === hwnd) return;
  stopTracking();
  if (!hwnd || !IS_WIN) return;
  const t = wintrack.track(hwnd, process.pid, (s) => tracker === t && onGameState(s), { dir: app.getPath('userData'), force: IS_WIN });
  tracker = t;
  tracker.hwnd = hwnd;
  ovStatus.trackingSince = Date.now();
  // no answer in time: don't leave the overlay hidden, show it over the display (and say why)
  setTimeout(() => {
    if (tracker === t && !gameState) trackerFailed(`no answer from the window tracker in ${TRACK_WAIT_MS / 1000} s`);
  }, TRACK_WAIT_MS);
}
function stopTracking() {
  if (tracker) tracker.stop();
  tracker = null;
  gameState = null;
  placeOverlay();
}
function trackerFailed(text) {
  ovStatus.error = text;
  ovStatus.failedAt = Date.now();
  ovStatus.fallback = true;
  console.warn('[overlay] window tracker:', text);
  if (tracker) tracker.stop();
  tracker = null;
  gameState = null;
  placeOverlay();
}
function onGameState(s) {
  if (s.failed) return trackerFailed(s.failed);
  gameState = s;
  ovStatus.lastStateAt = Date.now();
  ovStatus.fallback = false;
  ovStatus.error = '';
  if (!overlay) return;
  if (s.gone) {
    stopTracking();
    return;
  }
  if (s.min || !s.w || !s.h) return overlay.hide();
  const r = screen.screenToDipRect ? screen.screenToDipRect(null, { x: s.x, y: s.y, width: s.w, height: s.h }) : { x: s.x, y: s.y, width: s.w, height: s.h };
  overlay.setBounds(r);
  if (config.overlay && s.front) showOverlay();
  else overlay.hide();
}
/** Show without taking focus; the first time it really appears, the overlay shows its "✓ overlay" badge. */
function showOverlay() {
  if (!overlay || overlay.isDestroyed()) return;
  if (!overlay.isVisible()) overlay.showInactive();
  if (!ovStatus.shownOnce) {
    ovStatus.shownOnce = true;
    overlay.webContents.send('e7:hotkey', 'overlay-badge');
  }
}

function createMain() {
  main = new BrowserWindow({
    width: 1280,
    height: 860,
    title: `Epic 7 Engine ${app.getVersion()}`,
    backgroundColor: '#12131a',
    webPreferences: { backgroundThrottling: false, preload: PRELOAD }, // keep reading the game while this window is behind it
  });
  main.loadURL(`${ORIGIN}/index.html`);
  // bigger text by default (View menu / Ctrl + Ctrl − Ctrl 0 to change; remembered)
  main.webContents.on('did-finish-load', () => main.webContents.setZoomFactor(config.zoom));
  main.webContents.on('did-create-window', (child) => {
    child.webContents.setZoomFactor(config.zoom); // about:blank pop-outs may never fire did-finish-load
    child.webContents.on('did-finish-load', () => child.webContents.setZoomFactor(config.zoom));
  });
  // pop-out windows (mini windows) stay on top of the game
  main.webContents.setWindowOpenHandler(({ frameName }) => {
    const mini = frameName === 'rta-mini' || frameName === 'e7-guild-mini';
    return { action: 'allow', overrideBrowserWindowOptions: mini ? { alwaysOnTop: true, width: 380, height: 620, backgroundColor: '#12131a', webPreferences: { backgroundThrottling: false } } : { backgroundColor: '#12131a' } };
  });
  main.on('closed', () => {
    main = null;
    app.quit();
  });
}

/** The game watcher: always running in the background, whatever page the main window shows. */
function createVision() {
  vision = new BrowserWindow({
    show: false,
    width: 1000,
    height: 760,
    title: 'Epic 7 Engine · Game watcher',
    backgroundColor: '#12131a',
    autoHideMenuBar: true,
    webPreferences: { backgroundThrottling: false, preload: PRELOAD },
  });
  vision.loadURL(`${ORIGIN}/vision.html`);
  vision.on('close', (e) => {
    if (quitting) return;
    e.preventDefault(); // closing it only hides it; it keeps watching
    vision.hide();
  });
  vision.on('closed', () => (vision = null));
}

function createOverlay() {
  const b = gameDisplay().bounds;
  overlay = new BrowserWindow({
    ...b,
    transparent: true,
    frame: false,
    resizable: true, // so it can follow the game window's size (it never takes mouse input)
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    alwaysOnTop: true,
    show: false, // shown by showOverlay() once we know where the game is
    webPreferences: { backgroundThrottling: false, preload: PRELOAD },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true); // clicks go straight through to the game
  overlay.setContentProtection(true); // not visible to screen capture -> readers never read the overlay itself
  overlay.setVisibleOnAllWorkspaces(true);
  overlay.loadURL(`${ORIGIN}/overlay.html?desktop=1`);
  overlay.webContents.once('did-finish-load', () => placeOverlay());
  // (no setZoomFactor here: zoom is shared per origin with the main window; overlay.html scales its items itself)
}

const windowModeOnWindows = () => IS_WIN && config.capture && config.capture.mode === 'window';
function placeOverlay() {
  if (!overlay || overlay.isDestroyed()) return;
  if (tracker && gameState) return onGameState(gameState); // window mode: the tracker places it
  if (tracker) return; // waiting for the tracker's first answer (at most TRACK_WAIT_MS, then the fallback)
  overlay.setBounds(gameDisplay().bounds);
  // window mode without a working tracker: still show it over the display (lines up with borderless fullscreen)
  if (windowModeOnWindows() && !ovStatus.fallback) return overlay.hide(); // game window not found yet
  if (config.overlay) showOverlay();
  else overlay.hide();
}

function buildMenu() {
  const displays = screen.getAllDisplays();
  const template = [
    {
      label: 'Epic 7 Engine',
      submenu: [
        { label: 'Home', click: () => main && main.loadURL(`${ORIGIN}/index.html`) },
        { label: 'RTA', click: () => main && main.loadURL(`${ORIGIN}/rta.html`) },
        { label: 'Gear', click: () => main && main.loadURL(`${ORIGIN}/gear.html`) },
        { label: 'Guild War', click: () => main && main.loadURL(`${ORIGIN}/guild.html`) },
        { label: 'Live (overlay & screens)', click: () => main && main.loadURL(`${ORIGIN}/live.html`) },
        { type: 'separator' },
        { label: 'Check for updates…', click: () => updater.check(true) },
        { label: `Version ${app.getVersion()} · release notes`, click: () => shell.openExternal(updater.RELEASES) },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Bigger text', accelerator: 'CmdOrCtrl+=', click: () => setZoom(config.zoom + 0.1) },
        { label: 'Bigger text', accelerator: 'CmdOrCtrl+Plus', visible: false, acceleratorWorksWhenHidden: true, click: () => setZoom(config.zoom + 0.1) },
        { label: 'Smaller text', accelerator: 'CmdOrCtrl+-', click: () => setZoom(config.zoom - 0.1) },
        { label: 'Normal size (125%)', accelerator: 'CmdOrCtrl+0', click: () => setZoom(1.25) },
      ],
    },
    {
      label: 'Game window',
      submenu: [
        { label: config.capture ? `Reading: ${config.capture.mode === 'window' ? 'window' : 'screen'} "${config.capture.name}"` : 'Reading: not chosen yet', enabled: false },
        { label: 'Pick the game window…', click: () => pickWindow() },
        { label: 'Show the game watcher', click: () => vision && (vision.show(), vision.focus()) },
        { label: 'Save a game picture (to draw boxes on later)', accelerator: 'Ctrl+Shift+S', click: savePicture },
        { type: 'separator' },
        { label: 'The game watcher restarts by itself after a change.', enabled: false },
      ],
    },
    {
      label: 'Developer',
      submenu: [
        { label: 'Copy report for Claude (what the app sees and did)', click: () => main && main.webContents.send('e7:hotkey', 'copy-report') },
        { type: 'separator' },
        { label: 'Collect screenshots automatically (to improve the readers)', type: 'checkbox', checked: !!config.devCapture, click: (mi) => setDevCapture(mi.checked) },
        { label: 'Open the screenshot folder', click: () => { fs.mkdirSync(devFolder(), { recursive: true }); shell.openPath(devFolder()); } },
        { label: `Saves a PNG + notes when the game screen changes (and once a minute). Stays on this PC.`, enabled: false },
      ],
    },
    {
      label: 'Overlay',
      submenu: [
        { label: 'Show / hide overlay', accelerator: 'Ctrl+Shift+O', click: toggleOverlay },
        { label: 'Show a test card (is the overlay working?)', click: () => {
          if (!config.overlay) toggleOverlay();
          if (overlay && !overlay.isDestroyed()) overlay.webContents.send('e7:hotkey', 'overlay-test');
        } },
        { label: 'Overlay status (is it working?)…', click: showOverlayStatus },
        { label: 'Bigger overlay text', click: () => setOverlayZoom(config.overlayZoom + 0.15) },
        { label: 'Smaller overlay text', click: () => setOverlayZoom(config.overlayZoom - 0.15) },
        { type: 'separator' },
        ...displays.map((d, i) => ({
          label: `Game is on display ${i + 1} (${d.size.width}×${d.size.height})${d.id === screen.getPrimaryDisplay().id ? ' · primary' : ''}`,
          type: 'radio',
          checked: d.id === gameDisplay().id,
          click: () => {
            config.displayId = d.id;
            if (config.capture && config.capture.mode === 'screen') config.capture.displayId = d.id;
            saveConfig();
            placeOverlay();
          },
        })),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function sendZoom() {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send('e7:zoom-changed', { zoom: config.zoom, overlayZoom: config.overlayZoom });
}
function setZoom(z) {
  config.zoom = clampZoom(z);
  saveConfig();
  for (const w of BrowserWindow.getAllWindows()) if (w !== overlay && !w.isDestroyed()) w.webContents.setZoomFactor(config.zoom);
  sendZoom();
}
function setOverlayZoom(z) {
  config.overlayZoom = clampZoom(z);
  saveConfig();
  sendZoom();
}

/** Ctrl+Shift+S: the game watcher saves a picture of the game (js/pictures.js) to calibrate on after the match. */
function savePicture() {
  if (vision && !vision.isDestroyed()) vision.webContents.send('e7:hotkey', 'save-picture');
}

function toggleOverlay() {
  if (!overlay) return;
  config.overlay = !config.overlay;
  saveConfig();
  if (!config.overlay) overlay.hide();
  else placeOverlay();
}

/** Overlay → Overlay status: plain words for "why don't I see it?" */
function overlayStatusText(st = overlayStatus()) {
  const lines = [];
  lines.push(`Overlay: ${st.on ? 'on' : 'OFF (Ctrl+Shift+O turns it on)'} · ${st.visible ? 'visible' : 'hidden right now'}`);
  if (st.mode === 'window') {
    if (st.tracking && st.gameState && st.gameState.w) {
      lines.push(`Following the game window at ${st.gameState.x},${st.gameState.y} (${st.gameState.w}×${st.gameState.h}).`);
      if (!st.gameState.front) lines.push('Hidden because another program is in front of the game. Click the game and it comes back.');
    } else if (st.tracking && st.gameState && st.gameState.min) lines.push('Hidden because the game window is minimized.');
    else if (st.tracking) lines.push('Looking for the game window…');
    else if (st.fallback) lines.push(`Couldn't follow the game window, so the overlay covers the whole display instead (lines up exactly when the game runs borderless fullscreen).`, `Reason: ${st.error}`);
    else lines.push('The game window isn\'t open (or wasn\'t found). Start the game, or Game window → Pick the game window.');
  } else if (st.mode === 'screen') lines.push('Covering the whole display the game is on.');
  else lines.push('No game window chosen yet: Game window → Pick the game window.');
  lines.push('Test: Overlay → Show a test card. A green card should appear on top of the game for 5 seconds.');
  return lines.join('\n');
}
function showOverlayStatus() {
  const { dialog } = require('electron');
  dialog.showMessageBox(main || undefined, { type: 'info', title: 'Overlay status', message: 'Overlay status', detail: overlayStatusText() });
}

app.whenReady().then(() => {
  loadConfig();
  serveFiles();
  autoCapture();
  createMain();
  createOverlay();
  createVision();
  buildMenu();
  updater.init(() => main);
  // window mode: start following the game window right away (if it's open)
  if (config.capture && config.capture.mode === 'window') resolveSourceQuiet();
  globalShortcut.register('Ctrl+Shift+O', toggleOverlay);
  globalShortcut.register('Ctrl+Shift+E', () => main && (main.show(), main.focus()));
  globalShortcut.register('Ctrl+Shift+S', savePicture);
  screen.on('display-added', buildMenu);
  screen.on('display-removed', () => {
    buildMenu();
    placeOverlay();
  });
});
async function resolveSourceQuiet() {
  const c = config.capture;
  if (!c || c.mode !== 'window' || tracker) return;
  if (ovStatus.failedAt && Date.now() - ovStatus.failedAt < TRACK_RETRY_MS) return; // failed recently: keep the fallback a while
  const list = await listSources().catch(() => []);
  const w = list.find((s) => s.id === c.id) || list.find((s) => !s.id.startsWith('screen') && s.name === c.name);
  if (w) trackGame(w.id);
}
// the game was closed or not open yet: look for its window again every few seconds
setInterval(() => {
  if (app.isReady() && windowModeOnWindows() && !tracker) resolveSourceQuiet();
}, 4000);
if (process.env.E7_TEST_WIN === '1') global.__e7test = { trackGame, overlayStatusText };
app.on('before-quit', () => (quitting = true));
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (tracker) tracker.stop();
});
