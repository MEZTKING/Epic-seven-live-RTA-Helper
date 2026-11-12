# Notes for Claude sessions

## Privacy (owner's standing instruction)
- Never put the owner's email address, real name or other personal details in commits, code,
  comments, issues, PRs, artifacts or any request to an outside service.
- Commits must use the session's default no-reply identity; do not change `git config user.email`.

## Project
- **Epic 7 Engine** (owner's chosen name; not "RTA Engine"): fan-made Epic Seven toolkit, static browser app, no build step.
  Pages: `index.html` (RTA helper), `gear.html` (Gear Sorter), `guild.html` (Guild War, shared via Firebase; see `docs/GUILD_SETUP.md`).
- `npm test` runs the unit tests for the pure modules (`js/logic.js`, `js/roster.js`, `js/learn.js`, `js/vision.js`, `js/gear.js`, `js/tune.js`, `js/gearsort.js`, `js/guildwar.js`, `js/sync.js`).
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
