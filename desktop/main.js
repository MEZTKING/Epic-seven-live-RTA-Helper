/*
 * Epic 7 Engine — desktop app (Electron).
 *
 * Runs the same pages as the website, plus:
 *  - OVERLAY: a transparent, click-through, always-on-top window covering the
 *    display the game is on. It shows overlay.html, which draws what the
 *    modules post (dots, suggestions, speeds) next to the game's own UI.
 *    It is hidden from screen capture, so the readers never read our own text.
 *  - Screen capture without the "choose what to share" prompt every session:
 *    pages calling getDisplayMedia() get the game display automatically.
 *  - Pop-out windows stay on top of the game.
 * It only READS the screen. It never sends input to the game.
 *
 * Shortcuts: Ctrl+Shift+O show/hide overlay · Ctrl+Shift+E show the main window
 */
const { app, BrowserWindow, protocol, net, screen, session, desktopCapturer, globalShortcut, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const ROOT = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..');
const ORIGIN = 'e7://app';
const CONFIG = () => path.join(app.getPath('userData'), 'config.json');

protocol.registerSchemesAsPrivileged([{ scheme: 'e7', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

let main = null;
let overlay = null;
let config = { displayId: null, overlay: true, zoom: 1.25, overlayZoom: 1.25 };
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

/** getDisplayMedia() in any page -> the game's display, no picker. */
function autoCapture() {
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    const d = gameDisplay();
    const src = sources.find((s) => String(s.display_id) === String(d.id)) || sources[0];
    callback(src ? { video: src } : {});
  });
}

function createMain() {
  main = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'Epic 7 Engine',
    backgroundColor: '#12131a',
    webPreferences: { backgroundThrottling: false }, // keep reading the game while this window is behind it
  });
  main.loadURL(`${ORIGIN}/index.html`);
  // bigger text by default (View menu / Ctrl + Ctrl − Ctrl 0 to change; remembered)
  main.webContents.on('did-finish-load', () => main.webContents.setZoomFactor(config.zoom));
  main.webContents.on('did-create-window', (child) => child.webContents.on('did-finish-load', () => child.webContents.setZoomFactor(config.zoom)));
  // pop-out windows (mini windows) stay on top of the game
  main.webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { alwaysOnTop: true, width: 380, height: 620, backgroundColor: '#12131a', webPreferences: { backgroundThrottling: false } } }));
  main.on('closed', () => {
    main = null;
    app.quit();
  });
}

function createOverlay() {
  const b = gameDisplay().bounds;
  overlay = new BrowserWindow({
    ...b,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    alwaysOnTop: true,
    show: config.overlay,
    webPreferences: { backgroundThrottling: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true); // clicks go straight through to the game
  overlay.setContentProtection(true); // not visible to screen capture -> readers never read the overlay itself
  overlay.setVisibleOnAllWorkspaces(true);
  overlay.loadURL(`${ORIGIN}/overlay.html?desktop=1`);
  overlay.webContents.on('did-finish-load', () => overlay.webContents.setZoomFactor(config.overlayZoom));
}

function placeOverlay() {
  if (overlay) overlay.setBounds(gameDisplay().bounds);
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
      label: 'Overlay',
      submenu: [
        { label: 'Show / hide overlay', accelerator: 'Ctrl+Shift+O', click: toggleOverlay },
        { label: 'Bigger overlay text', click: () => setOverlayZoom(config.overlayZoom + 0.15) },
        { label: 'Smaller overlay text', click: () => setOverlayZoom(config.overlayZoom - 0.15) },
        { type: 'separator' },
        ...displays.map((d, i) => ({
          label: `Game is on display ${i + 1} (${d.size.width}×${d.size.height})${d.id === screen.getPrimaryDisplay().id ? ' · primary' : ''}`,
          type: 'radio',
          checked: d.id === gameDisplay().id,
          click: () => {
            config.displayId = d.id;
            saveConfig();
            placeOverlay();
          },
        })),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setZoom(z) {
  config.zoom = clampZoom(z);
  saveConfig();
  for (const w of BrowserWindow.getAllWindows()) if (w !== overlay) w.webContents.setZoomFactor(config.zoom);
}
function setOverlayZoom(z) {
  config.overlayZoom = clampZoom(z);
  saveConfig();
  if (overlay) overlay.webContents.setZoomFactor(config.overlayZoom);
}

function toggleOverlay() {
  if (!overlay) return;
  config.overlay = !overlay.isVisible();
  config.overlay ? overlay.showInactive() : overlay.hide();
  saveConfig();
}

app.whenReady().then(() => {
  loadConfig();
  serveFiles();
  autoCapture();
  createMain();
  createOverlay();
  buildMenu();
  globalShortcut.register('Ctrl+Shift+O', toggleOverlay);
  globalShortcut.register('Ctrl+Shift+E', () => main && (main.show(), main.focus()));
  screen.on('display-added', buildMenu);
  screen.on('display-removed', () => {
    buildMenu();
    placeOverlay();
  });
});
app.on('will-quit', () => globalShortcut.unregisterAll());
