/*
 * Follows one window on Windows: where it is on screen, whether it's minimized, and
 * whether something else is in front of it. Used to keep the overlay exactly on top of
 * the game window when only that window is captured.
 *
 * It runs one small PowerShell loop that READS window positions through public Windows
 * functions (DwmGetWindowAttribute, IsIconic, GetForegroundWindow). It never sends
 * anything to the game window.
 *
 *   const t = track(hwnd, ourPid, (state) => …, { dir })   // state: { gone } | { min } | { x, y, w, h, front } | { failed }
 *   t.stop()
 * x/y/w/h are physical screen pixels; front = a window of the game (or of this app) is the active window.
 * { failed: text } = PowerShell couldn't start or stopped by itself (text = its error output), e.g. blocked by
 * antivirus. The script is written to <dir>/e7-wintrack.ps1 and run with -File (encoded commands that call
 * Windows functions are often blocked); without a dir it falls back to -EncodedCommand.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type @'
using System; using System.Runtime.InteropServices;
public class E7W {
  [StructLayout(LayoutKind.Sequential)] public struct R { public int L, T, Rt, B; }
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out R r, int s);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
'@
$h = [IntPtr][Int64]$args[0]
$me = [uint32]$args[1]
$game = [uint32]0; [void][E7W]::GetWindowThreadProcessId($h, [ref]$game)
$last = ''
while ($true) {
  try { [void][System.Diagnostics.Process]::GetProcessById([int]$me) } catch { break } # the app is gone: stop
  if (-not [E7W]::IsWindow($h)) { [Console]::Out.WriteLine('gone'); [Console]::Out.Flush(); break }
  if ([E7W]::IsIconic($h)) { $line = 'min' }
  else {
    $r = New-Object E7W+R
    if ([E7W]::DwmGetWindowAttribute($h, 9, [ref]$r, 16) -ne 0) { [void][E7W]::GetWindowRect($h, [ref]$r) }
    $fg = [E7W]::GetForegroundWindow(); $pid2 = [uint32]0; [void][E7W]::GetWindowThreadProcessId($fg, [ref]$pid2)
    $front = if ($fg -eq $h -or $pid2 -eq $me -or ($game -ne 0 -and $pid2 -eq $game)) { 1 } else { 0 }
    $line = "$($r.L) $($r.T) $($r.Rt - $r.L) $($r.B - $r.T) $front"
  }
  if ($line -ne $last) { [Console]::Out.WriteLine($line); [Console]::Out.Flush(); $last = $line }
  Start-Sleep -Milliseconds 300
}
`;

/** Parse a parsed tracker line (exported for tests). */
function parseLine(line) {
  line = line.trim();
  if (line === 'gone') return { gone: true };
  if (line === 'min') return { min: true };
  const n = line.split(/\s+/).map(Number);
  if (n.length < 5 || n.some((v) => !Number.isFinite(v))) return null;
  return { x: n[0], y: n[1], w: n[2], h: n[3], front: n[4] === 1 };
}

/** PowerShell arguments: run the script from a file when possible (exported for tests). */
function psArgs(hwnd, ourPid, dir) {
  const base = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass'];
  if (dir) {
    try {
      const file = path.join(dir, 'e7-wintrack.ps1');
      fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== SCRIPT) fs.writeFileSync(file, SCRIPT, 'utf8');
      return [...base, '-File', file, String(hwnd), String(ourPid)];
    } catch (_) { /* fall back below */ }
  }
  const encoded = Buffer.from(`& { ${SCRIPT} } ${hwnd} ${ourPid}`, 'utf16le').toString('base64');
  return [...base, '-EncodedCommand', encoded];
}

function track(hwnd, ourPid, onState, opts = {}) {
  if ((process.platform !== 'win32' && !opts.spawn && !opts.force) || !hwnd) return { stop() {} };
  const run = opts.spawn || spawn;
  let buf = '';
  let err = '';
  let stopped = false;
  const fail = (text) => {
    if (stopped) return;
    stopped = true;
    onState({ failed: String(text || 'the window tracker stopped').replace(/\s+/g, ' ').trim().slice(0, 400) });
  };
  let ps;
  try {
    ps = run('powershell.exe', psArgs(hwnd, ourPid, opts.dir), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    setImmediate(() => fail(`PowerShell could not start: ${e.message}`)); // after the caller has kept the handle
    return { stop: () => (stopped = true) };
  }
  if (ps.stderr) ps.stderr.on('data', (d) => (err = (err + d.toString()).slice(-2000)));
  ps.on('exit', (code) => fail(`PowerShell stopped (exit ${code})${err ? `: ${err}` : ''}`));
  ps.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const s = parseLine(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (s && !stopped) onState(s);
    }
  });
  ps.on('error', (e) => fail(`PowerShell could not start: ${e.message}`));
  return {
    stop() {
      stopped = true;
      try {
        ps.kill();
      } catch (_) { /* already gone */ }
    },
  };
}

/** desktopCapturer window ids look like "window:<HWND>:0" on Windows. */
const hwndOf = (sourceId) => {
  const m = /^window:(\d+):/.exec(String(sourceId || ''));
  return m ? m[1] : null;
};

module.exports = { track, parseLine, hwndOf, psArgs, SCRIPT };
