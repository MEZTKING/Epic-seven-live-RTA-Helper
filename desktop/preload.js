/*
 * Small bridge between the pages and the desktop app (no Node access for pages).
 *   E7Desktop.capture()      -> { mode: 'window' | 'screen', name }  what getDisplayMedia() will capture
 *   E7Desktop.pickWindow()   -> opens the "Which window is the game?" picker; resolves with the new choice
 *   E7Desktop.onCapture(cb)  -> called when the choice changes
 * Used by js/game-area.js (no box needed when only the game window is captured) and overlay.html.
 * The picker page (desktop/picker.html) also uses sources() / choose().
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('E7Desktop', {
  capture: () => ipcRenderer.sendSync('e7:capture'),
  pickWindow: () => ipcRenderer.invoke('e7:pick'),
  onCapture: (cb) => ipcRenderer.on('e7:capture-changed', (_e, c) => cb(c)),
  // picker page only
  sources: () => ipcRenderer.invoke('e7:sources'),
  choose: (choice) => ipcRenderer.send('e7:choose', choice),
});
