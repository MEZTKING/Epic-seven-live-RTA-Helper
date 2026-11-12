# Notes for Claude sessions

**Start here:** `docs/HANDOFF.md` (how everything works, storage, flows, testing, status), then `DEVLOG.md`
(history, newest first), `docs/SOURCES.md` (every outside source and where it's used) and `docs/ROADMAP.md`.

## Privacy (owner's standing instruction)
- Never put the owner's email address, real name or other personal details in commits, code,
  comments, issues, PRs, artifacts or any request to an outside service.
- Commits must use the session's default no-reply identity; do not change `git config user.email`.

## Project
- **Epic 7 Engine** (owner's chosen name; not "RTA Engine"): fan-made Epic Seven toolkit, static browser app, no build step.
  `index.html` is the **home page** (module picker). Modules: `rta.html` (RTA helper), `gear.html` (Gear Sorter),
  `guild.html` (Guild War, shared via Firebase; see `docs/GUILD_SETUP.md`). Every page has the same app bar
  (brand → home, module switcher); a module's own tabs sit underneath. New modules get a page, a home card and an app-bar link.
  `live.html` (Live) holds the screen detector / overlay overview; `overlay.html` is the overlay layer; `desktop/` is the
  Electron app that puts the overlay on top of the game. Readers only READ the screen; never send input to the game,
  never sniff or decode game network traffic.
- Later plans live in `docs/ROADMAP.md` (e.g. the PvE & events module). Add owner's "later" ideas there.
- `npm test` runs the unit tests for the pure modules (`js/logic.js`, `js/roster.js`, `js/learn.js`, `js/vision.js`, `js/gear.js`, `js/tune.js`, `js/gearsort.js`, `js/guildwar.js`, `js/sync.js`, `js/screens.js`, `js/statparse.js`, `js/ceciliabot.js`, `js/vision/core.js`, `js/faces.js`).
- **Game watcher** (`js/vision/`, DEVLOG #21): one watcher captures the game and runs readers; modules only listen to events.
  New readers go in `js/vision/readers/`, never as a per-page capture.
- **Keep data separated by source.** Official roster, Fribbels import, the owner's notes, learned
  stats and each imported dataset are stored apart and can be toggled off individually. Never merge
  one source into another; label every suggestion reason with its source.
- Fribbels data and formats: use the maintained RexQian fork (github.com/RexQian/Fribbels-Epic-7-Optimizer),
  not the original fribbels repo.

## Devlog (owner's standing instruction)
- Every change (code, data, docs, config) gets an entry in `DEVLOG.md`, in the **same commit**, newest first,
  using the template at the bottom of that file: what was asked, research findings, what changed, bugs found
  and fixed, how it was tested (and what wasn't), and open questions or assumptions.
- Number entries in order (#1, #2, …) and reference the previous commit hash where relevant.

## Sources and handoff (owner's standing instruction)
- Every new outside source (data, API, library, website, research reference) goes into `docs/SOURCES.md` in the same
  commit: address, what it provides, which files use it, its source label, what is sent to it, and the date it was checked.
- Keep `docs/HANDOFF.md` current when architecture, storage keys, flows or status change, so any future session can continue.
- Browser tests: `bash tests/e2e/run-all.sh` (fixtures in `tests/e2e/fixtures/`); unit tests: `npm test`.
