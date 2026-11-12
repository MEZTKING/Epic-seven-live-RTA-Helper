/*
 * In-app updater for the Epic 7 Engine desktop app.
 *
 * Every build on GitHub (".github/workflows/desktop-build.yml") publishes a numbered
 * Release (v0.1.<run number>) with the installer, its latest.yml and the portable .exe.
 *
 *  - INSTALLED app (Epic-7-Engine-Setup-*.exe): uses electron-updater against those
 *    Releases. Asks before downloading, shows progress on the taskbar icon, and
 *    installs on restart.
 *  - PORTABLE .exe: electron-updater can't update a portable app, so this downloads
 *    the new portable .exe next to the old one and, after the app closes, a tiny
 *    script swaps the files and starts the new version (same file name and place,
 *    so shortcuts keep working).
 *
 * Checks quietly ~10 s after start (only says something if there is an update)
 * and from the menu "Check for updates…". Only talks to github.com / api.github.com
 * (public release info and files); nothing about you is sent.
 */
const { app, dialog, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const OWNER = 'MEZTKING';
const REPO = 'Epic-seven-live-RTA-Helper';
const RELEASES = `https://github.com/${OWNER}/${REPO}/releases`;
const portableExe = () => process.env.PORTABLE_EXECUTABLE_FILE || '';

let getWindow = () => null;
let busy = false;
let autoUpdater = null;

/** Compare "1.2.3" style versions. >0 when a is newer. */
function newer(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

function ask(opts) {
  const w = getWindow();
  return w ? dialog.showMessageBox(w, opts) : dialog.showMessageBox(opts);
}
function progress(f) {
  const w = getWindow();
  if (w) w.setProgressBar(f);
}

// ------------------------------------------------------------ installed app
function setupInstalled() {
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (_) {
    return false;
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('download-progress', (p) => progress(p.percent / 100));
  autoUpdater.on('update-downloaded', async (info) => {
    progress(-1);
    busy = false;
    const r = await ask({ type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1, title: 'Update ready', message: `Version ${info.version} is ready.`, detail: 'Restart now to use it, or it installs the next time you close the app.' });
    if (r.response === 0) autoUpdater.quitAndInstall(true, true);
  });
  autoUpdater.on('error', () => {
    progress(-1);
    busy = false;
  });
  return true;
}

async function checkInstalled(manual) {
  const res = await autoUpdater.checkForUpdates();
  const info = res && res.updateInfo;
  if (!info || newer(info.version, app.getVersion()) <= 0) {
    if (manual) ask({ type: 'info', message: `You have the newest version (${app.getVersion()}).` });
    return;
  }
  const r = await ask({ type: 'question', buttons: ['Update now', 'Not now'], defaultId: 0, cancelId: 1, title: 'Update available', message: `Version ${info.version} is available (you have ${app.getVersion()}).`, detail: 'It downloads in the background; you can keep using the app.' });
  if (r.response !== 0) return;
  busy = true;
  progress(0.01);
  await autoUpdater.downloadUpdate();
}

// ------------------------------------------------------------ portable .exe
async function latestRelease() {
  const res = await net.fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Epic-7-Engine-updater' } });
  if (res.status === 404) return null; // no release yet
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return res.json();
}

async function download(url, dest) {
  const res = await net.fetch(url, { headers: { 'User-Agent': 'Epic-7-Engine-updater' } });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const out = fs.createWriteStream(dest);
  const reader = res.body.getReader();
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
    if (total) progress(got / total);
  }
  await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
  if (total && got !== total) throw new Error('Download was cut off');
}

async function checkPortable(manual) {
  const rel = await latestRelease();
  const version = rel && String(rel.tag_name || '').replace(/^v/, '');
  if (!rel || newer(version, app.getVersion()) <= 0) {
    if (manual) ask({ type: 'info', message: `You have the newest version (${app.getVersion()}).` });
    return;
  }
  const asset = (rel.assets || []).find((a) => /-portable\.exe$/i.test(a.name));
  if (!asset) {
    if (manual) ask({ type: 'info', message: `Version ${version} is out, but it has no portable .exe. Get it from the Releases page.` }).then(() => shell.openExternal(RELEASES));
    return;
  }
  const r = await ask({ type: 'question', buttons: ['Update now', 'Not now'], defaultId: 0, cancelId: 1, title: 'Update available', message: `Version ${version} is available (you have ${app.getVersion()}).`, detail: 'It downloads in the background. When it\'s done the app restarts on the new version (same file, same place).' });
  if (r.response !== 0) return;
  const exe = portableExe();
  const tmp = exe + '.update';
  busy = true;
  progress(0.01);
  try {
    await download(asset.browser_download_url, tmp);
  } finally {
    progress(-1);
    busy = false;
  }
  const r2 = await ask({ type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1, title: 'Update ready', message: `Version ${version} is downloaded.`, detail: 'Restart now to use it. If you choose Later, it switches the next time you close the app.' });
  swapOnExit(exe, tmp, r2.response === 0, version);
  if (r2.response === 0) app.quit();
}

/** After this app (and its portable launcher) exits, replace the .exe and start it again. */
let swapArmed = null; // version waiting to be swapped in
function swapOnExit(exe, tmp, restartNow, version) {
  if (swapArmed) return;
  swapArmed = version;
  const restart = { value: restartNow }; // "Later": swap when the app closes, but don't start it again
  app.once('will-quit', () => {
    if (app.relaunchAfterSwap) restart.value = true;
    const cmd = path.join(os.tmpdir(), `e7-engine-update-${Date.now()}.cmd`);
    // retry the move until the old .exe is no longer locked (up to ~60 s), then start the new one
    const script = [
      '@echo off',
      'set n=0',
      ':retry',
      `move /y "${tmp}" "${exe}" >nul 2>&1 && goto start`,
      'set /a n+=1',
      'if %n% geq 60 goto end',
      'timeout /t 1 /nobreak >nul',
      'goto retry',
      ':start',
      restart.value ? `start "" "${exe}"` : 'rem',
      ':end',
      '(goto) 2>nul & del "%~f0"',
    ].join('\r\n');
    try {
      fs.writeFileSync(cmd, script);
      spawn('cmd.exe', ['/c', cmd], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    } catch (_) { /* the .update file stays; next check downloads again */ }
  });
}

// ------------------------------------------------------------ public
async function check(manual) {
  if (!app.isPackaged) {
    if (manual) ask({ type: 'info', message: 'Updates work in the built app (.exe). When running from source, use git pull.' });
    return;
  }
  if (busy) {
    if (manual) ask({ type: 'info', message: 'An update is already downloading.' });
    return;
  }
  if (swapArmed) {
    if (manual) {
      const r = await ask({ type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1, message: `Version ${swapArmed} is downloaded.`, detail: 'Restart to use it.' });
      if (r.response === 0) {
        app.relaunchAfterSwap = true;
        app.quit();
      }
    }
    return;
  }
  try {
    if (portableExe()) await checkPortable(manual);
    else if (autoUpdater || setupInstalled()) await checkInstalled(manual);
    else if (manual) shell.openExternal(RELEASES);
  } catch (e) {
    busy = false;
    progress(-1);
    if (manual) {
      const r = await ask({ type: 'warning', buttons: ['Open Releases page', 'Close'], defaultId: 0, cancelId: 1, message: 'Could not check for updates.', detail: String((e && e.message) || e) });
      if (r.response === 0) shell.openExternal(RELEASES);
    }
  }
}

function init(windowGetter) {
  getWindow = windowGetter;
  // a leftover download from an update that never got swapped in
  const exe = portableExe();
  if (exe) fs.rm(exe + '.update', { force: true }, () => {});
  setTimeout(() => check(false), 10000);
}

module.exports = { init, check, newer, RELEASES };
