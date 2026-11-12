# Sources — every outside source, where it's used, and what it's allowed to do

**Rule:** any new outside source (data, library, API, website, research reference) is added here **in the same commit**
that starts using it. Every source of *data* also gets its own **source label** inside the app, so it can be switched
off or deleted without touching other data, and every suggestion reason says which source it came from.

Checked = last time the address was confirmed working from the dev environment.

## 1. Data the app loads at runtime

| # | Source | Address | What it provides | Used in (code) | Source label in app | Sent to it | Checked |
|---|---|---|---|---|---|---|---|
| 1 | **Smilegate official hero list** | `https://static.smilegatemegaport.com/gameRecord/epic7/epic7_hero.json` | All heroes: code, name (10 languages), element, class, rarity. Browser access allowed (CORS `*`) | `js/roster.js` (`OFFICIAL_HERO_URL`, `normalizeOfficial`), `js/app.js` (Data → *Update from official site*), `tools/update-official-heroes.js` → built-in copy `js/sources/official-heroes.js` | `official` | nothing (plain GET) | 2026-11-12 |
| 2 | **Official hero portraits** | `https://static.smilegatemegaport.com/event/live/epic7/guide/images/hero/{code}_s.png` | Small face portraits (CORS `*`, so they can be compared pixel by pixel) | `js/roster.js` (`PORTRAIT_URL`); shown in `js/app.js`, `js/guild-app.js`, `js/gear-app.js`, `js/heroinfo.js`; **recognition templates** in `js/auto.js` | `official` (templates) | nothing | 2026-11-12 |
| 3 | **Fribbels optimizer data — RexQian fork** (hero base stats, artifacts) | Primary `https://e7-optimizer-game-data.s3-accelerate.amazonaws.com/herodata.json` and `/artifactdata.json` (the bucket the fork itself loads). Fallback `https://raw.githubusercontent.com/RexQian/Fribbels-Epic-7-Optimizer/main/data/cache/herodata.json` / `artifactdata.json` | 6★ base stats (speed etc.) for 393 heroes, exclusive equipment speed flag, artifact names | `js/gear.js` (`HERO_STATS_URL`, `ARTIFACT_URL`, fallbacks, `normalizeHeroStats`, `normalizeArtifacts`), `js/app.js` (Data → *Update*), `tools/update-fribbels-data.js` → built-in copy `js/sources/fribbels-data.js`, `js/guild-app.js` (your speeds) | `fribbels-data` | nothing | 2026-11-12 |
| 4 | **CeciliaBot API** | `https://cecilia-bot-api.vercel.app/api/v1/getList?list=hero` (all heroes' effects, once a week) and `/getItem?list=hero&id={slug}` (one hero's skills, when its card is opened). Site: `https://ceciliabot.github.io` | Full skill descriptions (normal + awakened, values per enhancement), each hero's buff / debuff / effect ids (`stic_def_dn`, `cmn_aoe`, …) | `js/ceciliabot.js` (fetch, cache, `tagsFromEffects` → automatic tags, `renderText`), `js/heroinfo.js` (skills on the card, tag chips), `js/app.js` (team check via `compositionWarnings(..., {source: 'ceciliabot'})`) | `ceciliabot` (switch on the hero card) | hero ids only | 2026-11-12 |
| 5 | **epic7x.com** (fan site) | `https://epic7x.com/character/{slug}/` (slug: lowercase, `&`→`and`, apostrophes dropped, other characters → `-`) | Link only: full skill text on their site | `js/roster.js` (`epic7xUrl`), `js/heroinfo.js` (link on the card) | — (link) | nothing until the user clicks | 2026-11-12 (12 sampled heroes) |
| 6 | **Your guild's Firebase project** (owner-created) | `firestore.googleapis.com` via the SDK, path `guilds/{guildCode}/records/{id}` | Shared Guild War records | `js/sync.js` (`firebase` backend), `js/guild-app.js`; rules in `firestore.rules`; setup in `docs/GUILD_SETUP.md` | `guild` | Guild War records, in-game names, anonymous sign-in id. No emails | rules + fake-SDK test only; **no real project tested yet** |

Data the user brings (kept as separate sources): `gear.txt` from the Fribbels optimizer (`fribbels`), CSV match files
(`import:<name>`), meta CSVs (`meta: <name>`), backups.

## 2. Libraries loaded at runtime

| Library | Address | Used in | Notes |
|---|---|---|---|
| **tesseract.js 5.1.1** (OCR) | `https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js` (+ its English language data, which it downloads from its default CDN) | `js/auto.js` (opponent name, Victory/Defeat), `js/guild-watch.js` (enemy name), `js/gear-scan.js` (item stats) | Loaded only when a reader that needs text first runs. Runs in the browser; screen pictures never leave the device |
| **Firebase JS SDK 10.12.2** (compat builds: app, auth, firestore) | `https://www.gstatic.com/firebasejs/10.12.2/firebase-{app,auth,firestore}-compat.js` | `js/sync.js` | Loaded only when Firebase is connected in Guild War → Setup |
| **Electron 33.2.1**, **electron-builder 25.1.8** | npm | `desktop/` (overlay app) | Versions confirmed on npm 2026-11-12. The app has not been run yet (no display in the dev environment) |
| **Playwright** (Chromium) | dev only | `tests/e2e/*.e2e.js` | Pre-installed in Claude Code cloud sessions; elsewhere `npm i -D playwright` |
| GitHub Actions: `actions/checkout@v4`, `setup-node@v4`, `configure-pages@v5`, `upload-pages-artifact@v3`, `deploy-pages@v4` | GitHub | `.github/workflows/pages.yml` | Publishes the site from `main` |

## 3. Facts and formulas taken from research (no code or data copied)

| What | Where it came from | Used in |
|---|---|---|
| `gear.txt` format: `{items: [...], heroes: [...]}`; items `gear, rank, set, level, enhance, main{type,value}, substats[{type,value,rolls}], ingameEquippedId`; set/stat ids (`SpeedSet`, `CriticalHitChancePercent`…) | RexQian fork: `app/js/lib/scanner.js`, `backend/.../Item.java` | `js/roster.js` (`parseFribbels`), `js/gear.js` (`extractBuilds`), `js/gearsort.js` (`slimInventory`), `js/statparse.js` (item shape) |
| Gear score **WSS** (substats only; Speed ×2, Crit Damage ×8/7, Crit Chance ×8/5, flat Atk ×3.46/39, Def ×4.99/31, HP ×3.09/174) | RexQian fork `backend/.../db/ItemDb.java` `calculateWss` | `js/gearsort.js` (`WSS_WEIGHT`, `wss`) |
| Reforge table (level 85→90, per roll count) and max rolls at +15 (Epic 9, Heroic 8, Rare 7) | RexQian fork `app/js/lib/reforge.js` | `js/gearsort.js` (`REFORGE`, `MAX_ROLLS_15`, `reforgedSubs`) |
| Speed = base × (1 + 25% Speed set + 12% Revenge set) + flat speed | Game rules; base speed from source #3 | `js/gear.js` (`computeBuild`) |
| How Fribbels' auto importer works: records game traffic locally, then decodes it on Fribbels' private server (`https://krivpfvxi0.execute-api.us-west-2.amazonaws.com/dev/getItems`) | RexQian fork `data/py/scanner.py`, `app/js/lib/scanner.js` (checked at commit `1d7fef5`) | **Deliberately not copied** — see DEVLOG #10 and #12. We read gear from the screen instead (`js/gear-scan.js`) |
| RTA draft order (2+2 prebans, picks 1-2-2-2-2-1, 1 postban each), element advantage | Game rules | `js/logic.js` |
| Effect id → tag mapping (`cmn_aoe`→aoe, `stic_def_dn`→defense break, `stic_stun`→stun+control…) | Effect names from CeciliaBot (`getList?list=buff/debuff/common`) | `js/ceciliabot.js` (`EFFECT_TAGS`) |
| World Arena pick/ban/win rates exist only as image infographics on Stove (e.g. `https://page.onstove.com/epicseven/global/view/12903188`) | Stove community | Not loaded. Meta stats come in as user CSVs (`meta: <name>`) |

## 4. Checked and NOT used (and why)

| Source | Why not |
|---|---|
| Official battle records `https://epic7.gg.onstove.com` (`/gameApi/getBattleList`) | 503 from the dev environment; needs the user's login (must not be handled). Plan: export bookmarklet (docs/ROADMAP.md) |
| Fribbels private decoding API (above) | Would send the user's raw game traffic to a third party without permission; replicating the decoding = reverse-engineering the game protocol (ToS / account risk) |
| EpicSevenDB API `https://api.epicsevendb.com` / `epicsevendb.com` | API unreachable, website certificate expired (2026-11-12) |
| Community GitHub copies of hero/skill data (e.g. `KadoBOT/epic-seven-ranking`, `kmalone86/gamedatabase`, `cbebry/e7-compendium`, `fmnb0516/fmnb0516-ep7-bot`) | Unclear licences, likely outdated after skill reworks; CeciliaBot API is current |
| Official `epic7_skill.json` / `epic7_hero_skill.json` / `epic7_hero_detail.json` on the static server | 403 (don't exist). `epic7_artifact.json` exists (200) but isn't used yet |
| epic7.fandom.com | 403 from the dev environment |

## 5. Privacy summary

- No email, real name or account data is sent anywhere. Guild War uses anonymous Firebase sign-in and in-game names.
- Screen captures and OCR stay in the browser or desktop app on the user's device.
- Outbound requests: official hero list and portraits; Fribbels data files; CeciliaBot (hero ids only); jsDelivr
  (OCR library); gstatic and Firestore (only if the guild connected Firebase); epic7x (only on click).
