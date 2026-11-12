# Notes for Claude sessions

## Privacy (owner's standing instruction)
- Never put the owner's email address, real name or other personal details in commits, code,
  comments, issues, PRs, artifacts or any request to an outside service.
- Commits must use the session's default no-reply identity; do not change `git config user.email`.

## Project
- Epic Seven RTA helper: static browser app, no build step. Open `index.html`.
- `npm test` runs the unit tests for the pure modules (`js/logic.js`, `js/roster.js`, `js/learn.js`).
- **Keep data separated by source.** Official roster, Fribbels import, the owner's notes, learned
  stats and each imported dataset are stored apart and can be toggled off individually. Never merge
  one source into another; label every suggestion reason with its source.
