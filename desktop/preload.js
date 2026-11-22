/*
 * Small bridge between the pages and the desktop app (no Node access for pages).
 *   E7Desktop.capture()      -> { mode: 'window' | 'screen', name, chosen, tracked }  what getDisplayMedia() will capture
 *   E7Desktop.pickWindow()   -> opens the "Which window is the game?" picker; resolves with the new choice
 *   E7Desktop.onCapture(cb)  -> called when the choice changes
 *   E7Desktop.onHotkey(cb)     -> global shortcuts handled by a page ('save-picture' = Ctrl+Shift+S)
 *   E7Desktop.dev() / onDev(cb) / saveDevShot(png, meta) -> Developer → Collect screenshots automatically
 *   E7Desktop.showSelf(bool)   -> show/hide this window (the hidden game watcher shows itself to ask something)
 *   E7Desktop.zoom() / onZoom(cb) -> { zoom, overlayZoom } (overlay.html scales its items by overlayZoom / zoom)
 *   E7Desktop.records.game(name, params) / .find(world, name) / .status()  -> the official record site (desktop/records.js)
 *   E7Desktop.guildStandby({ beginsAt }) / warReminder() -> Guild War reminder before the next war (desktop/reminder.js)
 *   E7Desktop.gearFile.info() / choose() / useAutosave() / stop() / read() / onChanged(cb) -> the file re-imported by
 *                              itself (gear.txt or the Fribbels optimizer's autosave.json), DEVLOG #94
 *   E7Desktop.overlayStatus()  -> { on, visible, bounds, mode, tracking, gameState, fallback, error, … } (Live page, report)
 * Used by js/game-area.js (no box needed when only the game window is captured) and overlay.html.
 * The picker page (desktop/picker.html) also uses sources() / choose().
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('E7Desktop', {
  capture: () => ipcRenderer.sendSync('e7:capture'),
  pickWindow: () => ipcRenderer.invoke('e7:pick'),
  onCapture: (cb) => ipcRenderer.on('e7:capture-changed', (_e, c) => cb(c)),
  zoom: () => ipcRenderer.sendSync('e7:zoom'),
  version: () => ipcRenderer.sendSync('e7:version'),
  overlayStatus: () => ipcRenderer.sendSync('e7:overlay-status'),
  // the overlay's clickable markers (DEVLOG #73): take the mouse / the keyboard only while one is used
  overlayMouse: (on) => ipcRenderer.send('e7:overlay-mouse', !!on),
  overlayFocus: (on) => ipcRenderer.send('e7:overlay-focus', !!on),
  records: {
    game: (name, params) => ipcRenderer.invoke('e7:records', { op: 'game', name, params }),
    find: (world, name) => ipcRenderer.invoke('e7:records', { op: 'find', world, name }),
    near: (world, text) => ipcRenderer.invoke('e7:records', { op: 'near', world, text }), // names close to a text read from the screen

    status: () => ipcRenderer.invoke('e7:records', { op: 'status' }),
  },
  guildStandby: (d) => ipcRenderer.send('e7:guild-standby', { beginsAt: d && d.beginsAt }),
  warReminder: () => ipcRenderer.sendSync('e7:war-reminder'),
  showSelf: (show) => ipcRenderer.send('e7:show-self', !!show),
  // gear.txt / the Fribbels autosave re-imported by itself (DEVLOG #94): info / choose / autosave / stop / read
  gearFile: {
    info: () => ipcRenderer.invoke('e7:gear-file', 'info'),
    choose: () => ipcRenderer.invoke('e7:gear-file', 'choose'),
    useAutosave: () => ipcRenderer.invoke('e7:gear-file', 'autosave'),
    stop: () => ipcRenderer.invoke('e7:gear-file', 'stop'),
    read: () => ipcRenderer.invoke('e7:gear-file', 'read'),
    onChanged: (cb) => ipcRenderer.on('e7:gear-file-changed', (_e, info) => cb(info)),
  },
  onHotkey: (cb) => ipcRenderer.on('e7:hotkey', (_e, name) => cb(name)),
  // developer tool: automatic screenshots (game watcher only)
  dev: () => ipcRenderer.sendSync('e7:dev'),
  onDev: (cb) => ipcRenderer.on('e7:dev-changed', (_e, on) => cb(on)),
  saveDevShot: (dataUrl, meta) => ipcRenderer.send('e7:dev-shot', { dataUrl, meta }),
  onZoom: (cb) => ipcRenderer.on('e7:zoom-changed', (_e, z) => cb(z)),
  // picker page only
  sources: () => ipcRenderer.invoke('e7:sources'),
  choose: (choice) => ipcRenderer.send('e7:choose', choice),
});
