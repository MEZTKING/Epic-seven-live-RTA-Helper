# E7DaT study notes (for porting)

**What:** E7DaT 1.0.0 (github.com/ohrgon-game/E7DaT, MIT; the owner supplied a zip on 2026-11-14) is a Python World Arena
draft assistant for the Epic Seven PC client: it reads the draft from the screen and recommends pre-bans, picks and the ban
from statistics of top players' matches. These notes record what was learned from its source, what this app already
uses (DEVLOG #41), and what is left to port. Nothing of E7DaT is executed by this app; code here was re-written in
JavaScript. Source comments are Korean.

## Already used here (DEVLOG #41)

| From E7DaT | Here |
|---|---|
| `layout.py`: pick card boxes, pre-ban icon centres, stage text box, FIRST PICK boxes, turn order | `js/wide.js` `SLOT`, `js/draftscreen.js` `PREBAN` / `TURN_SLOTS`, `js/layouts.js` pre-bans, `js/sources/draft-labels.js` boxes |
| `assets/<lang>/label_*.png`, `popup_preban.png`, `label_first_pick.png` (en, ko, ja) | `js/sources/draft-labels.js` (grey templates, built by `tools/make-draft-labels.py`) |
| `tracker.py`: stage from the top text + its colour, pre-ban window, versus screen, hover vs confirmed (blue band), "same twice", turn counting | `js/draftscreen.js` (`Tracker`, `lockScore`, `matchTemplate`, `tint`), simplified |
| `vision.py`: pick cards = wide portraits `{code}_l.png` (+ skins), mirrored on my side | `js/wide.js`, but a direct masked correlation at the measured fixed geometry instead of SIFT (no OpenCV in the app) |
| `templates.py`: round icons from the official site, falling back to CeciliaBot/E7Assets-Temp | `RTARoster.PORTRAIT_URL` (asset repo for heroes the official list lacks) |
| `assets/knowledge.json` + the filters of `knowledge.py` (HURT_OK 1.5, AVOID_OK 0.8, MIN_LIFT 1.3, strict rules need pair data) | `js/sources/e7dat-knowledge.js`, `js/knowledge.js` (DEVLOG #42): reasons / cautions, builds, openers. Not used: `needs` (feeds E7DaT's win-rate model), `imprint`, `exclusive`, per-pair counter lists |

Not ported from the tracker: the opening rule (Korean templates only), VICTORY/DEFEAT templates (this app has its own
result reader), unknown-slot marking, re-verification of the previous turn's cards, weak pre-ban reads for small windows.

## Data pipeline (`update.py`, `api.py`, `store.py`) — lookups + collection ported in DEVLOG #44 (`desktop/records.js`, `js/records.js`); the model on top is not

- All data comes from the official record site's own lookups: `POST https://e7api.onstove.com/gameApi/<name>` with
  `Origin` / `Referer` set to `epic7.onstove.com` (undocumented; E7DaT spaces requests 0.35 s apart).
  `getSeasonList`, `getWorldUserRankingDetail(season_code, world_code=all, current_page)`,
  `getBattleList(nick_no, world_code, current_page)` (10 games per page, a player's last 100), `getPopularHero`.
  Player name → `nick_no` via `static-pubcomm.onstove.com/gameRecord/epic7/epic7_user_{world}.json` (large).
- First run: top 100 ranked players, then opponents met at Legend/Emperor until `track_players` = 400 are done;
  up to 400 × 10 = 4,000 `getBattleList` calls (20–40 minutes). Daily run: 1–3 pages per player.
- One game (`parse_battle`): `battle_seq`, completion time, `season_code`, `opening_rule_desc_tid`, both grades,
  `iswin` (1 win, 2 loss), `my_deck` / `enemy_deck` `.hero_list[5]` `{hero_code, first_pick, ban}` and `.preban_list`,
  `energyGauge` (start CR per hero: 100 = fastest, 0 = banned).
- SQLite: `battles` (seq PK, picks in pick order, bans, pre-bans, first pick, win, energy), `players`, `meta`.
- A session safety check blocked calling these lookups from the development environment (2026-11-14), so nothing here
  was verified live beyond one `getSeasonList` call that answered.

## Statistics (`stats.py`, output `stats.json` format 6)

- Row weight: `gw[a_grade] · gw[b_grade]` (legend 1.0, emperor 0.6, others dropped); older than the latest
  `recent_days` × 0.2; older than 60 days dropped; previous-season games blended out as the new season reaches 10,000 games.
- Per hero: games, win rate (unsmoothed), pick rates (overall / first / second), pre-ban rates, first-pick share, ban rate
  `qban = (banned + 2.5) / (picked + 10)` on non-guard slots, slot histogram, start CR mean, share fastest, win rate
  with / without the first turn.
- Residual tables (shrunk towards 0, two rounds): pair synergy `a|b` (k 40, n ≥ 6), counter `a>b` (k 40, n ≥ 6), first /
  second side (k 20), opening rule (k 20, n ≥ 12), first turn (k 20, n ≥ 12). Update `d ← d0 + damp·(num − k·d0)/(den + k)`.
- Ban model: softmax over the four bannable cards (`θ_h + α[first][slot] + κ·Δz`), needs ≥ 200 samples.
- Turn model: logistic on "A has the fastest hero" → `sp` per hero; opener pair terms.
- Bundles (similar teams): `B = (W + 15)/(N + 30) − 0.5` over teams sharing ≥ 4 heroes (3 shared weigh 0.15).
- `drafts` table: every first-side and second-side draft in pick order with weights (the pick policy needs it).

## Win-rate model (`stats._fit`, `model.py`)

- Weighted L2 logistic regression, additive log-odds, hand-written L-BFGS:
  `z = Σθ[A's 4 played] − Σθ[B's 4] + skill_A − skill_B + fp·θF + θC + pop·θA (+ turn·θT)`; hero λ 5; player skill for
  players with ≥ 12 games, else per grade.
- Inference: `z = ±fp_bias + Σ(b + side + rule) mine − enemy + Σsyn mine − Σsyn enemy + Σctr(m, e) + turn_z + dep_z`;
  `wr = σ(calib·z)` (calib ≈ 0.7).
- Checked daily against the newest day (grid over λ and k, Platt calibration, log-loss).

## Recommendations (`policy.py`, `recommend.py`, `plan.py`)

- Policy = how often top players pick a hero in this situation: back-off over how many of my picks / revealed enemy picks
  match (`p = (c_t + 30·p_prev)/(n_t + 30)`).
- Candidate score per slot: `(policy + 1e-4) · exp(10·τ·key)`, `key = gain − risk + deny` (ban-guard slot) or with gain
  discounted by `0.5·qban` (other slots). Risk = likely enemy counters and speed threats; deny = P(enemy picks it) × their gain.
- Pre-bans: pre-ban rate for my side × (1 − penalty for heroes I use myself).
- Final ban: expected log-odds gain per enemy bannable hero, given a forecast of their ban on me.
- Team plans: exhaustive enumeration of per-slot candidate lists (≤ 120,000 combinations), availability-weighted
  (`(1 − lost)·Π(1 − P_enemy)`), two plans (best + a clearly different one).

## Reasons (`advisor.py`, `knowledge.py`, `assets/knowledge.json`)

- Advisor turns model numbers into sentences (synergy / counter ≥ 1 pp, counter warning ≥ 3 pp, "enemy wants it too",
  often banned, turn-order notes, similar-team record, my own record).
- `knowledge.json` (43 kB, frozen 2026-11-14, no generator in the repo): mechanic tags for 272 heroes, 23 rules
  ("X blocks Y"), lifts measured on 40,300 games, artifact / set variants, openers, heroes that need a specific ally.
  Mostly derived tags and short paraphrases; a few lines closely paraphrase in-game effect text.

## What a port would look like

1. **Needs the data first.** Everything statistical needs ≥ 10,000 Legend/Emperor games from the record site. Since
   DEVLOG #44 the app collects them (RTA → Data → Official match records → top players; IndexedDB `e7-records`) and
   uses plain win rates from them; the steps below are still open.
2. Cheap pure ports once `stats.json`-like data exists: `DraftModel`, `Policy`, `Bundles`, candidate rows, pre-bans, bans,
   enemy-likely picks, the planner (typed-array loops), advisor sentences.
3. Moderate: the fit (L-BFGS logistic, ~300 heroes + ~400 players) — or fixed λ / k / calib without the daily grid.
4. Keep it a separate source in this app ("top players' matches (official record site)"), switchable, with every
   suggestion reason labelled, next to the owner's notes and the app's own learning.
