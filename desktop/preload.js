/*
 * Small bridge between the pages and the desktop app (no Node access for pages).
 *   E7Desktop.capture()      -> { mode: 'window' | 'screen', name, chosen, tracked }  what getDisplayMedia() will capture
 *   E7Desktop.pickWindow()   -> opens the "Which window is the game?" picker; resolves with the new choice
 *   E7Desktop.onCapture(cb)  -> called when the choice changes
 *   E7Desktop.onHotkey(cb)     -> global shortcuts handled by a page ('save-picture' = Ctrl+Shift+S)
 *   E7Desktop.dev() / onDev(cb) / saveDevShot(png, meta) -> Developer → Collect screenshots automatically
 *   E7Desktop.showSelf(bool)   -> show/hide this window (the hidden game watcher shows itself to ask something)
 *   E7Desktop.zoom() / onZoom(cb) -> { zoom, overlayZoom } (overlay.html scales its items by overlayZoom / zoom)
 * Used by js/game-area.js (no box needed when only the game window is captured) and overlay.html.
 * The picker page (desktop/picker.html) also uses sources() / choose().
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('E7Desktop', {
  capture: () => ipcRenderer.sendSync('e7:capture'),
  pickWindow: () => ipcRenderer.invoke('e7:pick'),
  onCapture: (cb) => ipcRenderer.on('e7:capture-changed', (_e, c) => cb(c)),
  zoom: () => ipcRenderer.sendSync('e7:zoom'),
  showSelf: (show) => ipcRenderer.send('e7:show-self', !!show),
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
