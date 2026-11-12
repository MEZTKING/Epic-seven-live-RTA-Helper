# Design review: "how would you build Epic 7 Engine from scratch?" (2026-11-12)

The owner asked two outside reviewers how to design the app from zero. Both got the **same neutral brief** (below: goals and
constraints only, no personal details, no description of the current code, no opinions from us). Answers are kept verbatim
in content (lightly formatted). Our comparison with the current app and the chosen plan are at the end.
See DEVLOG #20.

- **Fable** (Anthropic model, run as an independent sub-agent; told not to look at this repo).
- **DeepSeek** (DeepSeek chat API, `api.deepseek.com/chat/completions`, requested model `deepseek-reasoner`; the API
  answered as `deepseek-flash`). Only the brief was sent.

---

## The brief

### Design brief: "Epic 7 Engine" — if you were building it from scratch

A fan-made companion app for the mobile/PC gacha game **Epic Seven** (Smilegate). One player builds it for themselves
and their guild. Asking: what is the best overall architecture and design, starting from zero?

## What it must do
1. **RTA (real-time arena) draft helper**: during a live PvP draft (2+2 prebans, picks 1-2-2-2-2-1, 1 postban each),
   recognise which heroes are picked/banned and suggest picks/bans, counters, synergies, the enemy's likely postban;
   learn from the player's own match history; profile opponents met before; estimate enemy speeds from the turn-order
   (CR) bar in battle; record results (Victory/Defeat) automatically.
2. **Gear sorter**: know every gear piece the player owns (thousands) with main stat/substats; score it; say keep /
   enhance / reforge / extract / sell; which hero it suits best; shop "worth buying?" check. Show items like the game's
   inventory grid.
3. **Guild War tracker shared with guildmates**: enemy defenses per war, who beat what with which team, a colour dot per
   enemy (proven counter / risky / no info), enemy history across wars and seasons; a mini window and an overlay dot next
   to the enemy's name in game.
4. **Hero info**: skill text, role tags, per-hero notes; data from public sources (official hero list JSON, a community
   API for skills, an optimizer's base-stat data).
5. Later: PvE & event helpers (Hunts, Abyss-like modes, raids…), official match-history import, Android version.

## How the player plays / constraints
- Plays on **Windows PC**: the **Steam client** or an Android emulator (LDPlayer/BlueStacks etc.), windowed.
- Wants it **fully automatic**: read the game from the screen, show info in an **overlay on top of the game window**, as
  little manual setup as possible.
- **Must only READ the screen.** No input injection, no memory reading, no network sniffing/decoding of game traffic
  (ToS/account risk). Existing community tool (Fribbels optimizer) sniffs traffic to export gear and does not work with
  the Steam client.
- Data must be **kept separated by source** (official, community API, optimizer data, own notes, learned stats, imports)
  and each source can be switched off; suggestions must say which source they came from (data may be wrong).
- Privacy: nothing personal leaves the device except what the guild-sharing feature must share.
- One non-professional owner + AI coding assistants maintain it: simplicity, no fragile toolchains, good docs.
  Free hosting preferred (GitHub). Updates should reach the owner automatically.
- Phone access is nice to have (Guild War info on the go, reading results), but the core use is on the PC.

## Questions
1. Overall architecture (platform, language/runtime, process structure, how modules relate).
2. How to recognise the game screen robustly (which screen is showing; hero portraits; text/numbers; CR bar) across
   window sizes, DPI, clients (Steam vs emulator), and game UI updates — with minimal calibration.
3. Overlay approach on Windows.
4. Data/storage model (source separation, history, sync for the guild feature, phone access).
5. How to get the player's gear without traffic sniffing.
6. Recommendation system design (draft suggestions, learning from history).
7. Testing strategy, distribution & auto-update.
8. What you would deliberately NOT do, and the biggest risks.
Be concrete (name libraries/APIs/techniques), prioritise, and keep it to roughly 900 words.

---

## Answer 1: Fable

**1. Architecture.** Web-tech core + thin Windows desktop shell. Core: plain TypeScript/JS modules (no framework lock-in),
split into pure logic (draft engine, gear scoring, guild-war model, parsers) and UI pages; hosted on GitHub Pages as a PWA
(phone access + automatic updates free). Desktop shell: Electron (Tauri is leaner but Electron has the easiest transparent
always-on-top windows, `desktopCapturer`, one language, most AI-assistant familiarity; .NET/WinUI has best native
capture/OCR but a second language and no phone reuse). Processes: main (window tracking, capture, updater), a hidden
"vision" renderer/worker (recognition pipeline), overlay window, app window. Module contract: one typed event bus
(`screen:changed`, `draft:pick`, `battle:cr`, `result:victory`…). Vision emits facts; modules consume them. Modules never
touch pixels; vision never knows module logic. A small native sidecar exe (Windows.Graphics.Capture + Windows.Media.Ocr)
only if `desktopCapturer`/JS OCR proves inadequate.

**2. Screen recognition (priority order).** (1) Capture the game window, not the screen; normalise to a canonical 16:9
frame (detect letterbox / emulator toolbars); all regions are fractions of that frame → calibration becomes "which
window?". (2) Screen classifier: anchor regions per screen with small reference patches (perceptual hash / normalised
cross-correlation), 2-of-3 anchors + hysteresis; the table is versioned JSON, so a UI patch is a data update. (3) Hero
portraits: crop known slots, match by embeddings (small ONNX MobileNet-class model via onnxruntime-web) + cosine nearest
neighbour + colour-histogram check; confidence; "?" with one-click correction; corrections stored as a separate "learned"
source. (4) Text/numbers: fixed game fonts → custom digit/glyph template classifier for stats; Windows.Media.Ocr
(sidecar) or Tesseract.js for names; validate with domain rules (stat ranges, set/slot legality, roll tables). (5) CR bar:
segment, detect icons by embedding, read positions at 10–15 fps; fit relative speeds from deltas, report ranges.
(6) Golden screenshots per client (Steam, LDPlayer, BlueStacks) drive all of it.

**3. Overlay.** Transparent, frameless, always-on-top, click-through Electron window repositioned to the game window rect
(polling or `SetWinEventHook` helper). Windowed/borderless only; no injection, no DirectX hooking. Exclude from capture
(`setContentProtection` / `WDA_EXCLUDEFROMCAPTURE`). Keep it passive and small.

**4. Data/storage.** Local-first IndexedDB (thin wrapper e.g. `idb`), one store/namespace per source. Never merge at rest:
a resolver composes a read-time view from enabled sources; every value carries `{source, fetchedAt}`. History is an
append-only event log; stats are derived and rebuildable. JSON export/import. Guild sync: Firebase (Firestore/RTDB) with
anonymous auth, guild code, security rules. Phone via the same PWA.

**5. Gear without sniffing.** Guided inventory scan (player taps/scrolls; reader parses each detail panel with glyph
classifier + rule validation; dedupe by content hash; unseen items flagged stale). Opportunistic re-scan whenever a gear
panel is on screen. Fribbels JSON import as its own source. A hands-off scan is impossible without input injection; say so.

**6. Recommendations.** Transparent additive scoring `Σ weight × evidence` (global priors, counter/synergy tables,
role/composition needs, own gear readiness, opponent profile, own win-rate). Bayesian shrinkage (Beta priors) for own
history. Each term shows reason + source tag and can be disabled. Postban prediction = postban priors + "most threatening
to my draft". ML only after hundreds of logged matches.

**7. Testing, distribution, update.** Unit tests (Node runner); golden-image tests (real screenshots + expected facts per
client/resolution: "the single most valuable asset"); replay harness (recorded frame sequences → expected events); a few
Playwright smoke tests; GitHub Actions. Web on GitHub Pages + service worker; desktop electron-builder (NSIS) +
electron-updater from GitHub Releases. Shell could load the hosted web app with an offline cache so most updates need no
reinstall. Recognition data (layouts, reference patches) updatable separately from code.

**8. Not doing / risks.** Not: memory reading, packet capture, input automation, DLL injection, a custom backend, heavy
framework/build chain, cloud OCR/LLM in the live loop, an Android overlay now. Risks: (1) game UI patches breaking
recognition (data-driven layouts, golden tests, confidence + correction); (2) anti-cheat/ToS perception of overlays (stay
read-only, document it); (3) stale/incomplete gear data (show freshness); (4) third-party source drift (isolation, schema
validation, cached last-known-good); (5) complexity creep (strict vision/event/module boundary, living handoff doc);
(6) Firebase rules misconfiguration leaking guild data.

---

## Answer 2: DeepSeek

**Recommendation:** Windows-first desktop app in **C# .NET 8 + WPF**, with a thin Win32 overlay and offline Python only for training/exporting CV models to ONNX. It gives the best capture/overlay/update story and avoids Python packaging fragility. SQLite locally; Supabase/Cloudflare for guild sync; GitHub Releases + **Velopack** for auto-update.

### 1. Architecture
Single desktop process with background services over `System.Threading.Channels`: `CaptureService → VisionService → GameStateMachine → Domain/Recommender → UI/Overlay`, plus `Storage` and `Sync`. Modules: hero data, gear, RTA draft, battle/CR, guild war, notes, updater. Use WPF for main window, mini-window and click-through overlay. Keep a versioned “template pack” separate from the app so UI changes can ship without a full release. Build order: hero info + overlay shell → gear capture → RTA draft/results → guild sync → CR speed/PvE.

### 2. Screen recognition
Capture only the game client with **Windows.Graphics.Capture**; use a 5 fps idle / 10–15 fps event-driven loop and skip identical frames. Manifest **PerMonitorV2 DPI awareness** and work in physical pixels. Detect the game content rectangle inside the client (letterboxing/emulator borders), then normalize to a canonical 1920×1080 coordinate space.

Use a confidence-gated **state machine**, not one giant classifier: identify screens by stable anchors (buttons/headers) via `OpenCvSharp` multi-scale `MatchTemplate`, plus OCR in bounded regions via **PaddleOCRSharp/RapidOCR**. Hero portraits: crop fixed slot regions, match a template bank generated from public hero icons, then fall back to a small ONNX embedding model (MobileNet/ArcFace-style) trained on icons + screenshots. Text/numbers: OCR only known fields, regex/whitelist against hero/stat dictionaries; low confidence triggers a manual correction UI.

CR bar: anchor-detect the bar, segment avatar chips, track x-positions across frames, infer turn order and relative CR; estimate speed ranges from repeated displacement, never claim exact enemy speed. UI updates: template packs, fallback OCR, opt-in debug snapshots, and an “unknown screen” state.

### 3. Overlay
WPF borderless transparent window with `WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW`, topmost, click-through, following the game window via `GetWindowRect`/`DwmGetWindowAttribute`. Register a hotkey to toggle interactive mode. Support windowed/borderless only; do not attempt exclusive fullscreen. Draw overlays, draft panels, and the guild enemy dot as separate WPF layers so they never enter the captured game window.

### 4. Data/storage
SQLite WAL locally. Every row carries `source_id`, `imported_at`, `version`, `confidence`, and provenance; a source registry can disable official/community/optimizer/learned/notes imports. Tables: heroes, skills, gear_items, gear_observations, matches, drafts, enemy_defenses, teams, notes, learned_stats, opponent_profiles, sync_queue.

Guild sync: **Supabase Postgres free tier + RLS + anonymous auth** (or Cloudflare D1/Workers). Only explicitly guild-shared rows leave the PC; encrypt free-text notes optionally with a guild key. PC is source of truth with last-write-wins + tombstones. Phone: small **Svelte/React PWA on GitHub Pages** reading Supabase with the anon key and RLS.

### 5. Gear without sniffing
Screen-read the inventory grid: detect cells, OCR main/substats, classify set/rank/slot by icon templates, dedupe by item signature, and stitch as the user scrolls. Since input injection is forbidden, the app cannot scroll for you: show a “open gear inventory and scroll” capture mode, auto-capture on visual scroll, and prompt for missed rows. Shop “worth buying?” is the same pipeline on the shop card. This is slower than Fribbels but ToS-safer and works with Steam/emulators.

### 6. Recommendations
Start explainable: hero role/tag rules + Bayesian-smoothed statistics. Draft score = role coverage + counter matchup + synergy + personal comfort + opponent tendency − risk; show reason text and source badges. Opponent postban prediction: frequency + smoothed Markov/context model. Update counters/synergy from recorded results with recency weighting and confidence intervals. CR estimates feed speed-check advice, not exact claims. Avoid deep RL until data volume justifies it.

### 7. Testing/distribution
Golden-screenshot corpus across resolutions, DPI, Steam/emulators and UI versions; unit tests for OCR parsers/scoring; recorded-video replay harness; GitHub Actions CI. Ship via GitHub Releases using Velopack with stable/beta channels and automatic update. Code-sign if possible; otherwise document SmartScreen warnings. Keep a kill switch and debug capture bundle for recognition failures.

### 8. Deliberately not do / risks
No input injection, memory reading, packet sniffing/decoding, anti-cheat evasion, auto-play, or cloud storage of personal gear/notes by default. No universal emulator/resolution support at launch. No opaque ML suggestions. Biggest risks: ToS/account action even for read-only tooling; OCR/UI drift; false-confidence counters; guild-sync privacy; packaging/AV false positives; maintenance burden. Mitigate with conservative confidence, manual override, local-first data, versioned templates, and clear “source may be wrong” labelling.
---

## Comparison with the current app (our notes)

**Both agree on:** capture only the game window and normalise it to one fixed 16:9 frame so screen positions can be
shipped instead of drawn by the user; a screen classifier from anchors stored as **versioned data** (UI patch = data
update); portrait matching with confidence + one-click correction kept as its own source; reading only known text fields
and validating against game rules; CR bar → speed *ranges*; a passive click-through overlay following the game window;
local, source-separated storage with an append-only history; gear by screen scanning (honest: no auto-scroll); explainable
additive suggestions with Bayesian smoothing; a **golden screenshot corpus + replay tests** as the most valuable asset;
auto-update from GitHub Releases; no injection / sniffing / memory reading.

**They disagree on the platform:** Fable keeps web tech + Electron (one language, phone PWA reuse, easiest for AI
maintainers). DeepSeek prefers C# .NET 8 + WPF + SQLite + Velopack, Supabase for guild sync, and a separate small PWA for
the phone.

**Where the current app already is:** Electron + PWA, game-window capture (#17), overlay following the game window,
source separation with labels, explainable scoring, Firebase guild sync, auto-update from Releases (#17), a screen
classifier from taught fingerprints, ONE language.

**Gaps vs. both reviews:**
1. Each module captures and reads on its own → want one **vision service** emitting events to modules.
2. Users draw **calibration boxes** → want **layout packs** (fractions of a canonical 16:9 game frame) shipped as data.
3. No **real-screenshot corpus**; tests use generated screens.
4. `localStorage` (5–10 MB) → **IndexedDB** with a store per source and an append-only match/gear log.
5. tesseract for stats → glyph/digit classifier (fixed font) or Windows OCR; tesseract only for names.
6. Portraits by raw template correlation → embeddings (later; only if accuracy needs it).

**Decision (recommended to the owner):** don't rewrite in C#. Evolve the current code in this order: vision service + event
bus → layout packs from real screenshots (golden corpus) → IndexedDB → glyph reader → embeddings if needed.
