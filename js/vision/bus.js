/* The app-wide vision event bus for this window (see js/vision/core.js). window.E7Bus */
(function () {
  'use strict';
  const C = window.E7VisionCore;
  let storage = null;
  try {
    storage = window.localStorage;
  } catch (_) { /* private mode: no log */ }
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(C.CHANNEL) : null;
  window.E7Bus = C.createBus({ channel, storage });
})();
