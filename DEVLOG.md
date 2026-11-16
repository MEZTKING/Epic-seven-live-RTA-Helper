# Devlog

A running record of every change to the Epic 7 Engine (formerly the RTA Live Helper): what changed, why, what was found while researching,
bugs found and fixed, how it was tested, and what is still open. Newest entries first.

**Rule:** every change to the project adds an entry here **in the same commit**. Use the template at the bottom.

---

## 2026-11-16 · #61 · Guild War: names that cannot be read are marked and read from the player's page; scans shared in the guild are not repeated. RTA: results and the draft's status on the owner's PC · this commit (previous: `50ad523`)

**Asked for**
- (the keep's name on the middle map read as nonsense in the app; its page next to it) "if a guild war player cannot
  be read it should be marked and show a symbol to open that player. and read it from another angle."
- "also if our guildmates have already scanned them then everyone should have the same copies shown, so we're not
  scanning twice (if in a guild sharing session)"
- "also the rta mini doesn't work" · (a screenshot of the Auto tab after a whole match: "prebans 0+0, picks 0+0", two
  match-start pictures, every slot empty) "this is all i get from a whole rta match" · a DEFEAT screen · the app's
  diagnostic report.

**Findings**
- **The diagnostic report** (version 0.1.44, the game window watched at 1229×691 and maximized):
  - The game watcher's draft reader DOES follow real drafts: versus → pre-ban → pick (your turn / the opponent's)
    → ban → ready, with first pick read from the match-start screen. In one match it recognised all ten heroes (you
    5, opponent 5), in another your 5 and 1 of theirs, in a third (window 1231×693) none. Pre-bans: never (0 of 4 in
    every match).
  - What the owner looked at says none of this: the status line and the table "What each slot saw" show this
    PAGE's own slot boxes, which stay empty while the watcher's reader fills the draft.
  - **No result was ever recorded from the screen.** Two causes: (a) the result is only read on a screen the
    detector calls `rta-result`, and the owner taught that screen long ago at another window size (2 examples), so
    today's result screens are not recognised; (b) a draft counts as complete only with pre-bans and bans, which
    were never read, so even ten known heroes were "not complete".
  - Match review kept pictures per DRAFT, at most 6: with a draft that never got a hero the same draft went on for
    days and its six pictures were used up on 13 November. That is why only match-start pictures were left.
  - Screens taught: `rta-result` 2, `rta-intro` 1, `rta-draft` 1, `gw-enemy` 1 (all from small windows).
- **The mini window** opens and works in the packaged app (checked: it follows the draft and its buttons act); with
  no hero in the draft it has nothing to show, which is what the owner saw.
- A full result screen has a brown "Battle Results" button next to Confirm; the early-end one does not.
- **Names**: on the map the keep's name (kana + a Latin "x") came out as nonsense in the owner's app and as kana
  without the x here; on that player's own page the same name stands on a plain panel and reads cleanly, except
  that Latin letters at the end of a kana name were thrown away as stray marks and the reader gave the x three
  times ("xXx").
- **Sharing**: a scanned fortress was saved as names only. A guildmate's app, seeing the same map, read every name
  again (and could read some differently). The defenders' places never move, so "this place is already scanned" can
  be known from the saved place.

**Changed**
- **Unsure names** (`js/guild-watch.js`, `js/vision/readers/guild-fortress.js`): a name that is neither one the
  guild has nor confirmed by the official list is marked ⚠ on the card and with "? name not read · tap this player"
  on the game (overlay layer `guild-fort`, removed when the map is left). The marked box takes the next name read
  on a player's page ("✓ from their page"; the earlier reading stays as a button). With one marked name it waits by
  itself; with several the ⚠ button says which one waits. A page of another, sure defender of that map is not
  taken. The watcher's card on the game says "N not sure: tap that player (marked ?)".
- **Kana + Latin** (`E7GWMap.cleanCjk(text, { keepLatin })`, `pickRead(readings, { keepLatin })`, `E7Names.read`
  `clean: true` from the page / window / Offense Team readers): on a plain panel Latin letters at the end of a name
  are kept, a letter given two or three times in a row counts once.
- **Shared scans**: the map reader sends each defender's place (`pos`: from the middle of the picture, in units of
  its height) and the page saves it with the fortress number on the target (`pos`, `fortIndex`; our side: in
  `war.ourForts`). From the guild's records the page writes `e7-gw-fort-cache` (per side and fortress: name, place,
  keep); the reader takes a name from there for a badge on a scanned place and reads nothing (`fromGuild`). When
  everything on a map comes from there the card says "already in the guild's war plan" and offers nothing to save;
  beaten / standing is still taken from the badges.
- **RTA** (`js/auto.js`, `js/app.js`, `js/pip.js`):
  - a result screen is read when its Confirm button is there, whatever the screen detector thinks
  - all ten heroes known but pre-bans / bans not read → a played match: recorded (source `auto`, `bansUnknown:
    true`); fewer → the early end of #60. A stage reported by the watcher's reader counts as "the draft is on screen"
  - the status line says the watcher's board while it is reporting ("from the game watcher: pre-bans 0+0, picks 5+5")
  - Match review: pictures counted per MATCH (from its start screen), every 12 s, up to 12
  - mini window: an error is shown in it instead of a blank window; it shows the picks so far and "waiting for
    their pick"; it redraws every second while open

**Tested**
- `npm test` **175** (+1: kana + Latin on a clean panel / over scenery).
- Browser suite **40/40** clean, no code changed during the run. New `tests/e2e/gw-shared.e2e.js`:
  - a map where one name is not on the player list: that box marked and waiting, one "?" on the game, the
    watcher's line; the player's page shown → the name goes into the box, "✓ from their page", the marks gone
  - Save → every target has its place; the reader's cache holds 7; the same map on a fresh reader: 7 of 7 names
    taken from the plan, card "already in the guild's war plan", no Save button
  - a map with five unsure names: nothing waits until ⚠ is pressed on one; a page name then fills that box
  `tests/e2e/rta-walkover.e2e.js` (+1 case): ten heroes on the board, bans not read, result screen → one match with
  `bansUnknown`, no extra early end.
- The owner's real pictures (not committed): the keep's page reads the kana name with its Latin x.
- Desktop (packaged Linux build): `watcher`, `overlay-test`, `newwar`, `war-reminder`, `popout`, `update-check` pass; the mini window was opened there and followed a draft.
- **Not tested:** two PCs sharing through Firebase (the cache is built from the shared records, the test uses one
  browser); the result of a real match on the owner's PC; DEFEAT (only the word differs).

**Open — the RTA draft itself**
- Heroes are recognised unevenly (10 of 10, 6 of 10, 0 of 10 in three matches) and pre-bans never. There is still
  **no picture of a real draft while picking** to find out why. Asked for again; with this build Match review
  keeps up to 12 pictures of every match, and the Developer menu can collect them in a folder.
- A played match recorded without bans counts a banned hero as played on both sides.
- Old taught screens can still keep the Guild War page readers (`gw-enemy`) from running; not changed here.

---

## 2026-11-16 · #60 · RTA: a match that ends before the draft is finished (the opponent leaves) is noted apart and the draft cleared · this commit (previous: `470905b`)

**Asked for** (three screenshots: "Here comes a new challenger!", the match-start screen, VICTORY with "The opponent's
connection to the server has been lost."): "sometimes players will join a rta match but concede or lose connection,
this is what happens", and "also where are you storing all this".

**Findings**
- The result reader only looked for VICTORY / DEFEAT once the draft was complete (so that the word is not searched
  for on every screen). A match that ends during the draft was therefore never noticed: nothing was recorded, and
  the half-made draft with its suggestions stayed until the next match replaced it.
- The game counts such a match (the screen shows "Placement in progress 1/10"), but there are no two full teams:
  it must not go into the hero statistics, the learned counters or the win rate by first pick.
- Every result screen has a green "Confirm" button bottom right (56,84,59 on this screenshot, 51,81,54 on the older
  16:9 Victory fixture): a result screen can be told by pixels, without reading text. Guild War's Offense Team
  screen has a green Start button in the same corner, so the test is only used while an RTA match is going on.
- The match-start screen shows "First Pick" under the player who picks first, and "Pre-Season" / "Placement in
  progress" instead of a rank. Written down; not used here.
- **Where everything is stored** (the owner's question; the full table is docs/HANDOFF.md §4):
  - on the owner's PC, inside the desktop app's own data folder (Electron's `userData`; the packaged app's name is
    `epic7-engine-desktop`, so on Windows that should be `%APPDATA%\epic7-engine-desktop`, not checked there; the
    new menu item opens it): matches,
    notes, settings, taught faces, Guild War records of this device, the games of top players, the list of official
    player names per server, `config.json`. Developer screenshots, when switched on: `Pictures\Epic 7 Engine`.
  - shared with the guild only when a Firebase project was connected in Guild War → Setup (it is not, so far).
  - sent out: player NUMBERS to the official record site for lookups; downloads of hero portraits, the text reader
    and its language data, the weekly effect list; the update check on GitHub. No screenshots, no names, no matches.
  - in this public repository: the program, the documentation and test pictures with every player and guild name
    replaced. Raw screenshots sent in chat stay in the session's temporary workspace and are never committed.

**Changed**
- `js/auto.js` `maybeReadResult`: with an unfinished draft a result is looked for only while a result screen is up
  (`confirmShown()`: the Confirm button's pixels, `js/layouts.js` `rtaConfirm`) and a match is going on (its start
  screen in the last 5 minutes or its draft in the last 2). VICTORY / DEFEAT read twice → `App.recordWalkover`.
  One result screen gives one result: after any result is recorded, nothing more is read until that screen is gone.
- `js/app.js`: `store.walkovers` (newest 500: date, result, source, first pick, the picks made so far) and
  `recordWalkover(result, source)`: kept apart from `store.matches`, the draft is cleared. History shows a card
  "Ended before the draft was finished: N (W won, L lost) · not counted above, not used for hero statistics".
- `desktop/main.js`: menu **Epic 7 Engine → Open the folder where the app keeps its data**.
- Fixture: `steam-rta-victory-opponent-left-wide.jpg` (the names shining through the dimmed draft blurred away).

**Bugs found and fixed while doing it**
- The new menu item was first put right under "Check for updates…", where the line with the result of the update
  check belongs: `tests/desktop/update-check.js` caught it; the item is below the version line now.
- In the test, loading a screenshot switches the reader's follow mode off, so "a match starts" was never noticed
  and the early result was (rightly) ignored: the test switches it on again after each picture.

**Tested**
- `npm test` **174** (no new unit test: the change is in the page code).
- Browser suite **39/39** clean, no code changed during the run. New `tests/e2e/rta-walkover.e2e.js`:
  - the result picture with no match going on: nothing happens
  - match start → draft under way → the VICTORY screen: one entry in `walkovers` (win, auto), no match added, draft
    cleared; the same screen kept up: still one; History shows the card and "Matches 0"
  - `rta-auto-full`, `rta-real-screens`, `rta-draft`, `rta-basics` print exactly what they printed before this
    change; `match-review` differs only in its times of day
- Desktop (packaged Linux build): `watcher`, `overlay-test`, `newwar`, `war-reminder`, `popout`, `update-check` pass; the menu shows the new item under the version line.
- **Not tested:** a concede (its wording is not known; only the word VICTORY / DEFEAT and the Confirm button are
  used, so it should not matter), a DEFEAT of this kind, the live game, the owner's PC.

**Open**
- Matches imported from the official record site: whether such a game appears there, and with which picks, has
  not been looked at; an imported game with fewer than five picks a side should probably be kept out of the
  statistics the same way.
- The season table (History → Seasons) counts finished matches only; the game's own count includes these.

---

## 2026-11-16 · #59 · Guild War in a running war: every defender found (it missed two kinds of badge), draw results, names cut by their centring, the fixed places · this commit (previous: `2bfbbfa`)

**Asked for** (five screenshots: a "Defense Draw" window, an enemy's page that was already attacked, the Stinger map
with "Cannot Battle" and "Battle in Progress", an enemy's page with "Battle in progress.", the middle fortress):
- "notes only appear on a per person basis (not important for now)"
- "results with a draw"
- "for the stinger fortress it read 5 names, and the middle fortress read 3 names … but the stinger fortress actually
  has 7 names and the darkwood actually has 5"
- "the positions of the players do not change so you can look at all the fixed places, and sometimes guilds don't
  have players in certain spots"
- "which one is it struggling on … show me a picture of which ones, because one of them is greyed out because their
  defence is destroyed"

**Findings**
- **Two looks of a badge the finder did not know** (reproduced on the owner's two maps: 5 of 6 and 3 of 4 badges):
  - "Battle in Progress": crossed swords, and an orange "1/3" tag lies over part of the ring. Measured: the ring
    85% / 88% dark instead of all dark, spread 39 (the rule wanted ≥ 90% and ≤ 35).
  - a **destroyed** defender on the enemy's side: the whole badge is dark, glyph included (ring all dark, spread
    13, the glyph 84 against 40 on the ring, no colour at all). The finder wanted a light glyph. (Beaten badges on
    our own maps keep a light glyph; that is why this was not seen before.)
- **The places are fixed** (the owner's tip). Collected from the nine maps seen so far (two window shapes), measured
  from the middle of the picture in units of its height: 12 places on the left fortress, 11 on the middle one, 9 on
  the right one (one map only). A guild's defenders stand on some of them. With the right fortress, no map has a
  dark round thing on a known place that the finder misses, so as a safety net it changes nothing on today's maps.
- **Result windows**: "Defense Draw" (and by the same pattern "Attack Draw") when one round goes each way. A
  defense's rounds show shields: red = lost (16% red, 22% white), **green = held** (18% green, 28% white, no blue).
  The reader knew only blue swords and red shields, and no title with "Draw". This window is also the first real
  one of OUR attack: on the enemy's page, the enemy left, our member right.
- **Names on a map are centred under the badge**: over 20 names the middle of the name was within 8 px of the
  middle of a 96 px high crop. That tells where a name ends even when a roof edge stands right next to it.
  - The owner's enemy maps: roof highlights after one katakana name were read as four more characters; a blob after
    a two-kanji name as a fifth character; with the tight cut the kanji 警 (two unjoined halves, neither
    "letter-sized") and the long-vowel dash were lost.
- Enemy pages with a banner over the teams ("You cannot battle a target that has already been attacked.",
  "Battle in progress."): the same 78 px shift as the stronghold banner; round 1 there uses left / right / bottom.
- Season Log rows: a shield or crossed swords in front (defense / attack), then the two rounds; the same colours
  as in the windows (measured on three rows).
- Other things on these screens, written down for later: the top bar shows the attacks left ("2/3"); a note bubble
  on a badge is a megaphone when empty and a sheet when a note exists; notes belong to one defender; a destroyed
  tower still shows on the map (greyed); "Cannot Battle" under a name = already attacked by me; the Ready button
  shows the cost "1/2".

**Changed**
- **`E7GWMap.findBadges`**: two more looks. `busy` ("Battle in Progress": ring ≥ 80% dark, a strong light glyph AND
  a coloured ring) and `dim` (a dark beaten badge: even dark disc, a dim grey glyph, no colour → state `beaten`).
  A `dim` badge counts only when a name stands under it (`js/vision/readers/guild-fortress.js`).
- **Fixed places**: `E7GWMap.FORT_PLACES` and `placesToCheck(rgba, W, H, fortIndex, badges)`: a known place with
  something round and dark on it that is not a found badge is looked at too, and kept only with a name under it.
- **Results**: `E7GWResult.roundResult` knows the green shield; `titleKind` returns `{ type, ok: null, draw: true }`
  for "… Draw"; the reader's note says "Defense draw".
- **Names**: `nameLetters(…, { tight, centred })`: the letter-sized group gives how far the name reaches on its
  longer side; the same reach on the other side belongs to it (letter-sized patches first, then small ones:
  anything between the letters, past the last letter only a small kana or a long-vowel dash); `sym` says it came
  out centred. "Letter-sized" is now relative to the tallest patch (a keep's name is small in its box).
  `pickRead`: a centred tight reading beats a loose one that holds it plus more, or is two or more characters
  longer (three characters at least in the centred one); Latin the same for any number of added characters.
  `E7Names.read(…, { centred: true })` from the map reader only (names elsewhere are not centred).
- Fixtures (names replaced): `steam-gw-map-states-wide.jpg`, `steam-gw-map-middle-beaten-wide.jpg`,
  `steam-gw-result-draw-wide.jpg`, `steam-gw-enemy-attacked-wide.jpg`, `steam-gw-enemy-inbattle-wide.jpg`.
  `tools/dev/name-boxes.js` uses the centred cut, so made-up names are drawn where the real ones are centred.

**Bugs found and fixed while doing it**
- The first version of the centred cut let admitted patches widen the reach, so scenery crept in again: the reach is
  set once by the letter-sized group.
- "Longer loose reading loses" also killed a right loose reading when the centred one had only two characters:
  three are required.

**Tested**
- `npm test` **174** (+2: the centred cut on made-up pixels; the centred readings in `pickRead`).
- The owner's real maps (not committed), before → after: Stinger **5 → 7 of 7 defenders**, middle **3 → 5 of 5**
  (the destroyed one as beaten), own map 9 of 9. Names exact: **17 of 21** (6 of 7, 4 of 5, 8 of 9). The four:
  a katakana name with roof edges touching its last letter (two characters off), a small っ read as づ, a keep's
  name that ends in a Latin x after kana (the x is dropped by the cleaning of stray Latin letters), a speck touching
  a first letter (an extra "A"). All four are within what the player list or a saved name corrects. A picture
  marking each name was sent to the owner.
- The real "Defense Draw" window: both names, defeat / victory, **12 of 12 heroes**.
- Browser suite **38/38**. New `tests/e2e/gw-states.e2e.js` (replaced names): the Stinger map **7 of 7 defenders** (6 names exact, the "Battle in Progress" one flagged), the middle map **5 of 5** (4 names exact, the dark one marked beaten on the War tab); the draw window → my attack, round 1 won, round 2 lost, 12 of 12 heroes, 3 → 2 attacks left; both enemy pages with a banner: the name and 5 of 6 heroes. The older Guild War tests print the same numbers as before this change.
- Desktop (packaged Linux build): `watcher`, `overlay-test`, `newwar`, `war-reminder`, `popout` pass.
- **Not tested:** the fixed places finding a defender the badge finder missed (no map has such a case; the pieces
  are unit-tested); "Attack Draw", a drawn single round; the right fortress during a war; on the owner's PC.

**Open**
- Mixed names (kana + Latin letters): `cleanCjk` drops Latin letters at the ends as stray; a rule that keeps them
  when the reader was sure needs more examples.
- Scenery that touches a letter cannot be cut off by position; the player list / known names correct it.
- Reading the Season Log rows directly, the attacks left ("2/3"), "Cannot Battle" under a name: on the roadmap.

---

## 2026-11-16 · #58 · Guild War: the Offense Team screen, the start of the fight, notes left in the game; falling snow taken out of map names · this commit (previous: `fefacf1`)

**Asked for** (five screenshots: a note bubble on a map badge, the note window "<member>'s Record", the "Offense
Team" screen, two moments of the fight):
- "1. you can also set notes in game like this 2. i also sent the page after selecting a person to battle, where you
  get ready for attacking, their AI defense. 3. i also sent the beginning of the first battle"
- about the stray "A" on one map name (#57): "the snow specks are constantly moving going from the top diagonally so
  it will clear within milliseconds"

**Findings**
- **Offense Team screen** (after choosing a defender, before Start): my two teams left (green), the defender's two
  teams right (red), each on three of four places, as large clear icons of living heroes; the defender's name bottom
  right; the cost "1/3" on the Start button. This is the best place to read a defense: nothing is greyed or crossed.
  - The face matcher is touchy about the box size here: with one size 6 of 12 heroes were sure, with the best of
    three sizes (116 / 128 / 140 px at 1070 height) 12 of 12. Checked against the names the screen itself shows in
    its hero list.
  - Whether the teams are pinned to the left edge or centred on a 16:9 window is not known (one screenshot, wider
    than 16:9): both placements are tried.
- **The fight**: a white "Round 1" pill under the VS at the top, my name left of it and the defender's right, all
  through the round. The flame art of the "VS" touches the start of the right name (two extra characters were read
  before the box was moved 7 px).
- **Notes**: a speech-bubble with a megaphone above a defender's badge on the map means a guildmate left a note;
  the window is titled "<member>'s Record" and holds the text. The window does not say which defender it is about.
- **Snow**: the owner is right, the specks move and the letters do not. Of two looks at the same map a moment
  apart, the darker value of each pixel keeps the white letters and drops a white speck that moved. The map reader
  already waits for the same map twice before it reads names, so the first look can be kept at no extra cost.
- Telling the screens apart with a few pixels (measured on the files): the Start button is dark green (39,71,42)
  with a dark top bar; the round pill is 79% white and neutral (a pale blue sky is 62% white but blue); a note
  window has a nearly black title strip (11,19,28) over a deep blue body (24,58,101), a result window red or green.

**Changed**
- **`js/vision/readers/guild-offense.js`** (new; three readers, each with a cheap pixel check first, reading only a
  picture that changed and then stood still):
  - `guild-offense` → `guild:offense { enemy, rect, mine, theirs }` (and `{ away: true }` when the screen is left)
  - `guild-battle` → `guild:battle { round, left, right }`
  - `guild-note` → `guild:note { author, text }`
- `js/gwresult.js`: `offenseAt`, `battleAt`, `noteAt`, `noteTitle`, `roundOf`, `pickTeam`. `js/layouts.js`:
  `gwOff…`, `gwBat…`, `gwNote…` (helpers `lft`, `rgt` for boxes pinned to an edge).
- **Guild War page** (`js/guild-app.js`, `js/guild-watch.js`, `guild.html`):
  - Offense Team screen → the defender's teams are saved as their defense of this war (new, filled, or updated
    with the earlier line-up kept: "they changed it"); that player becomes the current one, so the card with the
    known counters shows above their name on the game; my two teams are kept as the attack being prepared
    (`e7-gw-pending-attack`)
  - the fight seen → the War tab asks "Your attack on X: how did it go?" with Won / Lost per round; Log writes the
    attack records with my heroes and the line-up attacked (and my speeds, as before). The same battle read later
    from its result window is recognised (same key) and not logged again; if the result window comes first, the
    question goes away
  - a note → the War tab shows it and asks which enemy it is about (the player the game showed in the 20 s before is
    offered first); saved as a line on that player's notes; the same note is not asked twice
- **Snow** (`E7GWMap.darkerOfTwo`, `js/vision/readers/guild-fortress.js`): names are read from the two looks
  combined; when the map was moved between them (more than 12% of the pixels differ strongly) only the last look is
  used, as before.
- Fixtures (names replaced): `steam-gw-offense-wide.jpg`, `steam-gw-battle1-wide.jpg`, `steam-gw-battle2-wide.jpg`,
  `steam-gw-note-record-wide.jpg`.

**Tested**
- `npm test` **172** (+3: the three pixel checks; note title / round label / three-of-four places; the snow filter).
- Browser suite **37/37** clean, with no code changed during the run; the printed results of the Guild War tests
  (`gw-fortress`, `gw-war-names`, `gw-scripts`, `gw-result`, `gw-offense`) were read line by line. New `tests/e2e/gw-offense.e2e.js`:
  - Offense Team: the defender's name (Japanese), **6 of 6** of their heroes and **6 of 6** of mine; saved as
    their defense; current player set; no question before the fight
  - the fight: round 1 and both names; the question appears; Won / Lost → two attack records with heroes and the
    line-up attacked; 3 → 2 attacks left; a later moment of the same fight does not bring the question back
  - the same battle from a result window afterwards: still two records
  - the note: author and text; asked, the right player offered; saved on their notes; not asked again
  - a map, a result window, a tower page, a check-in window: none of the three readers reports anything
- The real, unreplaced screenshots: the defender's Japanese name exact on the Offense Team screen; the note's
  author and text exact; both names exact on the fight (after moving the right name's box).
- Desktop (packaged Linux build): `watcher`, `overlay-test`, `newwar`, `war-reminder`, `popout` pass.
- **Not tested:**
  - the snow filter on real moving snow (there is no pair of real frames; unit-tested on made-up pixels, and a still
    picture is unchanged by it)
  - the Offense Team screen at 16:9 or in a small window; round 2 of a fight; the end of a fight
  - the overlay card on the Offense Team screen inside the desktop app
  - on the owner's PC

**Open**
- The end of a Guild War fight (the Victory / Defeat screen of each round) has not been seen: with it the result
  could be logged without asking.
- The megaphone bubble on a map badge is not detected, so a note read from a map still needs one click to say whom
  it is about. A sharp crop of one badge is not enough to place it safely next to snow.
- Notes are read with the English text data only.

---

## 2026-11-16 · #57 · Guild War: battle-result windows are read and logged by themselves (who beat whom, with which heroes) · this commit (previous: `51ccdf7`)

**Asked for:** "anything else you need", then five screenshots as files: two "Successful Attack" windows, a member's
tower page, a "Failed Defense" window, our own fortress map; and: "The fourth formation place - there's a limit of 3
heroes max in guild wars."

**Findings**
- **What the windows mean** (this corrects DEVLOG #56, which had it the wrong way round). The window opens from a
  row of the Season Log on a player's page and is written from the point of view of **that player (left)**; the
  opponent is on the right. A ✗ on a hero = it died.
  - On our member's page: "Failed Defense", our member left with ✗ on all six heroes, the enemy attacker right
    without any, "Defeat" twice. The row in the log has a shield in front (a defense) and two red shields.
  - On an enemy's page: "Successful Attack" = **that enemy attacked one of ours and won**: the enemy left, our
    member right with ✗ on all six, "Victory" twice. The three rows "1h ago" on that enemy's log are the three
    attack tokens he spent on three of our members.
  - The same enemy shows the same first team in two of his attacks, so heroes do not seem to be locked after an
    attack.
  - The band between the two sides is dark red on an enemy's page and dark green on a page of one of ours
    (measured: (43,19,26) against (30,47,30)); the title strip is nearly black (10,17,24).
  - The round icon: Victory 29–31% clearly blue pixels and 25% white; Defeat 14–15% red, 22% white, no blue.
- **The fourth place** (the owner's remark): agreed, a team is three heroes. "Fourth place" meant the fourth
  *standing position* of the formation diamond (top, right, left, bottom), of which three are used. On the member's
  tower page round 1 stands on top / left / bottom: all three were read from the file, so the positions set by eye
  in #56 hold.
- A member's tower page: its Victory / Draw / Defeat counters with sword icons are that member's own attacks; an
  enemy's page shows shields (their defenses). "Defense 330/450" after one lost defense (120 gone for two lost
  rounds; whether it is 60 a round is a guess).
- Face matching on the windows: 6, 9 and 9 of 12 heroes sure. Dead heroes are drawn darker and greyer and score
  lower. The ✗ itself is not the reason: it sits where the matcher already ignores the picture (the star row).
- Our own map (real file): 8 of 9 names exact. The ninth has a snow speck touching its first letter, read as an
  extra "A"; both cuts contain it, so only the member list or the player list corrects it.
- Found on the test copy of that map: for the keep's name the tight cut kept only two letters from the middle of
  the name, and that short reading won because the reader was surer of it.
- One attack in the game is both rounds against one defender. The app stores one record per round and counted each
  as an attack: with 3 attacks per war (#56) one real attack would have used two of three.

**Changed**
- **`js/gwresult.js`** (new, pure): `windowAt` (is a result window open, and is the page an enemy's or ours),
  `roundResult` (victory / defeat / draw from the icon's colours), `titleKind`, `plan` (the four cases → an attack
  of ours or a defense of ours, with the result turned round on an enemy's page), `key`.
- **`js/vision/readers/guild-result.js`** (new): a cheap pixel check each pass; the same picture twice; then the
  title (text), both names (`E7Names`, any writing, each side with its own server's language and player list) and
  the 12 hero icons; publishes `guild:result`. Shows the working card ("Reading this battle result…"). A window
  that was read is not read again. Positions `gwRes…` in `js/layouts.js` (centred window, measured at 2000×1070).
- `js/vision/readers/guild-defense.js`: the icon reading is shared (`window.E7GWFaces`: `load`, `ready`, `all`,
  `readIcon`).
- **Logging** (`js/guild-app.js` `resultFromGame`, `js/guild-watch.js`, `guild.html` `#war-result`):
  - an enemy's attack on one of ours → two `defense` records (member, round, held / lost, attacker, the heroes of
    both sides, `fromGame`, `token`)
  - an attack of ours → two `attack` records (by, round, win / loss, our heroes, the defender's line-up of that
    battle, `fromGame`, `token`); the enemy's target is created, filled or, when the line-up changed, updated with
    the earlier one kept
  - names are matched to members and to this war's enemies (also through the offered spellings); a known name
    decides whose page it was, the colour otherwise
  - heroes: only icons the app is sure of; when the sure ones fit a team already saved for that player, that team
    is used whole
  - the same battle is logged once (same players and results, unless round 1's attacking team is a different one);
    a banner says what was logged, with **Undo**; an undone result is not logged again (`e7-gw-result-undone`)
  - the Guild War page does not have to be open: the reader keeps each result in `e7-gw-results` (newest 12, 12
    hours) and the page takes them when it opens, when the guild's records have loaded, and every 5 s while
    something waits (a result without a running war waits for the war)
- **Attack tokens** (`GW.attacksUsed`): records read from the game count by `token` (both rounds = one attack);
  records logged by hand are paired per defender (two rounds = one, a third = a second attack).
- **Names** (`E7GWMap.pickRead`, readings now carry `cut`): a loose reading that is the tight one plus one or two
  characters at an end loses (a speck read as a letter); a tight reading that is only a piece of the loose one loses.
- Fixtures (names replaced; `tools/dev/redact-gw-screens.py` extended): `steam-gw-result-attack-wide.jpg`,
  `steam-gw-result-attack2-wide.jpg`, `steam-gw-result-defense-wide.jpg`, `steam-gw-member-tower-wide.jpg`,
  `steam-gw-map-ours-havoc-wide.jpg`. Behind the windows the page owner's name and the log's names are blurred away.

**Tested**
- `npm test` **169** (+5: `tests/gwresult.test.js` window / icon / title / the four cases and the key; attack
  tokens; the two rules for the cuts).
- Browser suite **36/36** clean. New `tests/e2e/gw-result.e2e.js`:
  - our own map: our side from the green rings, 8 of 9 made-up names exact (the ninth corrected the way a user would)
  - the member's tower page: name, 5 of 6 heroes, round 1 on top / left / bottom
  - "Failed Defense": read as a defense of ours, both names (one Japanese), defeat ×2 → two defense records with
    heroes; the map, overview and defense readers publish nothing while the window is open
  - two "Successful Attack" windows on the enemy's page → defenses of the two other members (6 records in all)
  - the same window again: nothing new; Undo removes its two records; shown once more: still not logged
  - an attack of ours (the reader's event; there is no screenshot of that case): two attack records with the
    defender's line-up, 3 → 2 attacks left, the enemy's saved defense filled
  - a result put in the waiting list while the page was closed: logged after the page opens, list empty, 2 → 1
- The suite's own run of `gw-result` happened while the waiting list was still being written; it ended without
  errors but printed wrong numbers for the last two steps. It and `gw-scripts` were run again with the final code and
  read line by line, and `guild-basics`, `guild-popout-watch`, `gw-autowar`, `gw-standby`, `guild-dots` once more.
  (These tests print what they find; "errors: []" alone only says nothing crashed.)
- The real, unreplaced windows: names exact in all three (Latin and Japanese, left and right).
- Desktop (packaged Linux build): `watcher`, `overlay-test`, `newwar`, `war-reminder`, `popout` pass.
- **Not tested:**
  - a window where one of OURS attacked (title "Successful / Failed Attack" on a member's page, or "… Defense" on
    an enemy's page), a Draw, a mixed result (one round won, one lost): no screenshots; the logic is unit-tested
  - other window sizes than 2000×1070 (the window is assumed centred and scaling with the height)
  - on the owner's PC

**Open**
- Heroes on these windows: about three quarters are recognised; the rest are left out ("heroes not recognised" in
  the banner), mostly dead (greyed) ones. Next step: compare dead icons against greyed portraits.
- A banner cannot be edited: a wrong result can only be undone. Editing a logged attack's heroes is on the roadmap.
- The Season Log rows themselves (who, when, both rounds) could be read without opening each window.

---

## 2026-11-16 · #56 · Guild War: names in any writing (also on the enemy screen), stronghold screens, a "working…" card on the game, defenses that change, three attacks per war · this commit (previous: `2c43471`)

**Asked for** (several messages, with screenshots: guild hall, the daily and the guild check-in windows, a maximized
fortress map with names in Japanese, Chinese and Latin letters, an enemy stronghold screen with a Chinese name,
"Successful Attack" / "Failed Defense" windows, a member's tower screen, our own fortress map):
- "login for new day, a couple of others, keep what you need on the github and map with other language names"
- "and also a new day for guild, but not always guild war, a day reset is at 10:00"
- "what other screenshots do you need, here's another one where someone has attacked from my guild" (+ two more, and
  "images of one of our players who got attacked")
- "you should have a live loading screen overlay when the app is reading from an image or doing something where it
  requires more information"
- "you also need to consider that any players can change their defence at any point as well, so the attacking combos
  and defending combos may differ after every war"
- "make sure to document everything so any session can pick it up anytime"

**Findings**
- **Maximized map, names in five kinds of writing** (hiragana with small kana, katakana with a long-vowel dash,
  kanji, Simplified Chinese, Latin with digits). The cut of #55 (letter mask → span around the middle) either lost
  the short last stroke of a kana name or took specks of scenery in. Measured on the real map: a "loose" cut (small
  strokes on the line may join) and a "tight" cut (only letter-sized patches) each get some names right that the
  other does not; reading both and letting the readings compete got 6 of 7 right before any correction, the seventh
  one character off (inside what the server's player list corrects).
- A **Chinese name on the Japanese server** read as nonsense with the Japanese data and exactly with the Simplified
  Chinese data (`chi_sim`). An unknown Chinese character is often read as a kana, so "only Chinese characters were
  read" was too strict a trigger; "a Chinese character was read" is the trigger now.
- A dark-outline test for specks (letters have a dark ring, snow does not) was measured and rejected: letters over
  bright snow have no dark ring either.
- **Enemy screen**: the name reader was English-only (three stray Latin scraps for a Chinese name), and on a **stronghold** screen
  the defense reader found 0 heroes: a banner ("One of the two Defense Towers must be destroyed first to attack the
  Stronghold.") pushes the six icons down by 78 px at 1070 height. The name box does not move.
- A team stands on **three of four places** (a diamond). The built-in positions knew three; on a member's tower
  screen round 1 used the bottom place instead of the right one.
- **Game facts** (from the screenshots, for whoever continues):
  - attack tokens are **3 per member per war** ("3/3" in the top bar; 73 of 87 left on the overview of a 29-member
    guild). The app counted 2 per UTC day.
  - the game day turns over at 10:00 UTC on the Global server; the first visit to the guild hall after it shows
    "Guild Check-In Reward". A new guild day is not a new war.
  - "Havoc" is the game's word for the war score (overview: "Havoc: 1620" under each guild; on a map: the bar at
    the top left). It is not a guild name.
  - a tower's screen shows "Defense 330/450" (hit points of the tower), a stronghold "1280/1280".
  - the windows "Successful Attack" and "Failed Defense" hold both players' names and both sides' two teams of
    three: everything an attack record needs. (Who is who in them was written down wrongly here at first:
    the left player is the one whose page is open and the title is from their point of view, see DEVLOG #57.)
  - a player can change their defense at any moment, so a saved defense is "as last seen".
- Pictures sent in the middle of a running reply reached the session as pictures only, not as files, so they could
  not be used as fixtures (the attack windows, the member's tower screen, our own map).

**Changed**
- **One name reader for every place** (`js/vision/names.js`, new; `E7Names.read(ctx, picture, box, { lang, world,
  offerOnly })`):
  - `E7GWMap.nameLetters` (new, pure): the letters of ONE name from the mask: connected patches, the letter-sized
    ones around the middle make the line, smaller patches on that line join when close (loose) or only inside the
    group (tight); tiny patches outside the name are dropped, a dot inside it is kept
  - both cuts are read in English and the server's language; with a Chinese character in the reading also with
    `chi_sim`; without a server language and a poor English reading, Japanese / Korean / Traditional Chinese
  - `pickRead` now also returns `all` (every usable reading, best first) and prefers a clearly longer sure reading
  - known names and earlier corrections win; then up to four candidates are looked up in the server's player list
    and the closest clear match is used ("✓ official"); the rest are offered
  - used by the fortress map reader and, new, by the **enemy-screen name reader** (`guild-name.js`): any writing;
    whose server that player is on is not known there, so official spellings are only offered (`offerOnly`); the
    same picture is not read twice; the Guild War page also tries the offered spellings against the names it knows
- **Stronghold and formations** (`js/vision/readers/guild-defense.js`, `js/layouts.js`): the fourth place of each
  team (`gwDef7`, `gwDef8`) and the banner shift (`GW_DEF_SHIFTS`); every placement is read and the best one wins;
  with four readings in a team the weakest is dropped.
- **"Working…" card on the game** (`js/vision/hub.js`, `overlay.html`, `js/guild-watch.js`): a reader can say
  `ctx.busy(text)` and `ctx.done(text, { ask })`. The overlay shows a small card at the top middle of the game with a
  spinner ("Reading the names on this map… 3 of 7"), which becomes a result line ("✓ 7 names read", or "! 7 names
  read, 2 to check in the app" in gold when the app needs the user) and leaves after 8 / 15 s. A reader that ends
  without a result takes its card away. The same line shows on the Guild War page; event `vision:busy`.
- **Defenses change** (`js/guildwar.js`, `js/guild-app.js`, `js/guild-watch.js`, `guild.html`):
  - every attack now stores the line-up it was made against (`attack.defense`); the counter book uses it, so a
    win stays a win against that team after the player changed their defense
  - `GW.defenseChange` (new, pure): the game shows three sure heroes that are not the saved three → "Changed since
    it was saved: Round 2 was …", the button becomes "Update …'s defense", the edit window explains it, the new
    line-up goes in (speeds stay for heroes that stayed) and the earlier one is kept on the team (`earlier`, up to 5)
  - a defense from an earlier war shown on the game's overlay card says "From an earlier war: may have changed"
    (the pop-out already said so)
  - nothing else had to change: defenses are stored per war, and counter ideas are looked up by the three heroes of
    a team, not by the player
- **Attacks**: 3 per member per **war** (`DEFAULT_RULES.attacksPerMember`, counting no longer per UTC day; labels
  "this war"). A guild that had changed the rule keeps its own number (Setup → Guild War rules).
- **Fixtures** (names replaced by `tools/dev/redact-gw-screens.py`, which now finds the names on a map with the
  app's own code through `tools/dev/name-boxes.js`, new): `steam-gw-map-mixed-scripts-wide.jpg`,
  `steam-gw-stronghold-cjk-wide.jpg`, `steam-guild-checkin-wide.jpg`, `steam-daily-checkin.jpg`.

**Bugs found and fixed while doing it**
- The loose cut dropped the dot of an "i" in a Latin name: the size rule now only applies outside the name.
- The enemy-screen name reader showed a "working" card on every screen it looked at: it shows none now (its read is
  short, and it does not repeat a read of the same picture).
- A made-up Chinese name was read with kana in it and the Chinese data was never tried: trigger widened (above).
- Housekeeping: real player names that earlier entries (#34, #38, #39), one code comment and two tests still
  carried were replaced by made-up ones or removed (the repository is public; they remain in the git history).

**Tested**
- `npm test` **164** (+3: `nameLetters`; `pickRead().all`; defense change + the attack's own line-up; attacks per
  war in the existing summary test).
- Browser suite **35/35** clean (the runner was cut off by this session's time limit after 31 tests; the last
  four and `gw-defense`, edited afterwards, were run one by one). The suite now takes about 15 minutes: the
  Guild War tests read names in several languages. New `tests/e2e/gw-scripts.e2e.js`:
  - the mixed map: **7 of 7 names** (five kinds of writing), 7 name pictures, 7 progress notes then "✓ 7 names read"
    on the bus, on the overlay page and on the Guild War page; no card left at the end
  - the stronghold screen: the Chinese name, **6 of 6 heroes**; the Guild War page recognises the player saved from
    the map and saves the defense
  - a changed round 2: notice, "Update", edit window, earlier line-up kept; an attack remembers the new line-up;
    3 → 2 attacks left this war
  - the two check-in windows and the guild hall: no Guild War event
- The older map tests after the change of the cut (`gw-fortress`, `gw-war-names`): Japanese small-window map 5 of 5;
  English maps 42 of 49 exact against 45 with the old cut. The three lost ones were compared cut by cut: the
  pictures of the letters are the same, the reader's answer differs on the drawn test font at low confidence
  ("Yankee12", "NovaKoi", "JadeLynx"). Not seen on real game letters.
- The owner's real map (not committed): six of the seven names exact from at least one of the two cuts (two
  hiragana / mixed names, the Latin name with digits, a two-kanji name, a three-hiragana name, the Chinese keep
  name); one katakana name one character off.
- Desktop (packaged Linux build): `watcher`, `overlay-test`, `overlay-status`, `newwar`, `war-reminder` pass. (The
  working card itself is checked on the overlay page in the browser test, not inside the packaged app.)
- **Not tested:**
  - the fourth formation place with a hero on it (seen only in a chat picture; positions by eye)
  - a tower (not stronghold) screen of a member, the "Successful Attack" / "Failed Defense" windows, our own map
    with a damaged tower: no files
  - Korean names; the real Japanese player list (the test uses a stand-in)
  - how long the first read takes on the owner's PC while the Japanese and Chinese data download (a few MB each)
  - on the owner's PC

**Open**
- **Reading the attack windows** (who attacked whom, with which teams, who won each round → attack logged by
  itself, with Undo): needs the windows as files. Asked for.
- Built-in recognition of the check-in windows, the guild hall and the VS screen was not added: a window dims
  whatever is behind it, so its 32×18 signature depends on the background. They are safe as they are (nothing is
  read from them; tested).
- The game day (10:00 UTC on Global) is written down but nothing uses it yet; attacks are per war now.
- Still to read from screens already in the fixtures: my attacks left ("3/3"), the Havoc score, a tower's hit
  points, the season log on a player's screen (who attacked them and how it went).

---

## 2026-11-16 · #55 · Guild War in a running war: no more wars against made-up guilds; names in any script; pick the right spelling by eye · this commit (previous: `dcfb1e1`)

**Asked for** (with screenshots of the guild hall "Guild War in progress", the VS screen, the overview of a running
war, and two fortress maps of a Japanese enemy guild next to the app):
- "when clicking on guild war in progress, those are the pages it opens when going into a new war"
- "how to deal with non-english characters"
- "it still gets english names wrong" (moonpie5385 was read as moonpies385)
- "and if it gets a name wrong, how can i correct it if i dont know any other languages"

**Findings** (the owner's screenshots run through the readers as they were)
- (Player and guild names in this entry are replaced by made-up ones of the same kind: the repository is public.)
- The real overview read correctly: both guild names, all three fortress names.
- **The bug behind "New war vs bit®Hole started by itself" and the fortress names "EES" / "NSE":** on a fortress
  MAP the overview reader took the page indicator (bottom right, one third lit) for the overview's side switch (same
  place, one half lit), read scenery as fortress names (stored over the real ones) and as guild names, and when two
  nonsense readings agreed a war was started. Measured on 12 real screens: map = one third ≥ 0.69 lit and the other
  two ≤ 0.03; overview = one half 0.55–0.86 lit, the other ≤ 0.09, middle third 0.36–0.64.
- Names: the white-letter mask also kept white snow and roofs next to a name, and its threshold lost thin strokes in
  a small window. The readings were of the scenery ("KEEEE", "S24—anag", "Navy").
- Japanese names are simply not in the English text data. With the Japanese data the real names read
  (ユキダルマ exact, ミドリカワ exact, one name off by its last character).
- The overview shows each guild's server (Global / Japan / …) next to its name, and "War Ends in 17h".
- The record site's player list per server (already used for "Find me") holds the official spelling of every
  ranked player: a reading that is one or two characters off can be matched to it without sending anything.
- A CJK font was needed to draw made-up names into the test picture: `apt-get install fonts-noto-cjk` (only to
  rebuild the fixtures; the tests use the committed pictures).

**Changed**
- **Map against overview** (`js/gwmap.js` `barKind`): the overview reader needs "one half lit", the map reader refuses
  it; a war is only started when BOTH guild names were read (`js/guild-watch.js`).
- **Names** (`js/gwmap.js`, `js/vision/readers/guild-fortress.js`):
  - `nameMask`: white patches that cannot be letters are dropped (touching the crop's edge, too tall, too big, too
    thick); threshold 170 instead of 190; crops read at 96 px instead of 64
  - languages: `js/vision/hub.js` can load other text data (`ctx.ocr(canvas, { lang, full })`); a name is read in
    English and, by the enemy's (or our) server tag, in Japanese / Korean / Traditional Chinese; without a tag and
    with a poor English reading the three are tried. `pickRead` decides; `cleanCjk` joins the characters
  - **official spelling**: `desktop/records.js` `near(world, text)` (+ IPC op `near`, `E7Desktop.records.near`)
    returns the players of that server whose name is 1–3 edits from the reading; one clearly closest → used and
    marked "✓ official"; several → offered
  - **correcting without knowing the script**: every box in "Seen in game" has the name's **picture from the game**
    above it and the close official spellings as buttons under it (a click swaps, so it can be taken back); a hint
    says that a name left as read still works, because the same reading is recognised again
- **Overview of a running war** (`js/vision/readers/guild-overview.js`, `js/layouts.js` `gwWarEnds`): servers of both
  guilds and "War Ends in 17h" are read; `guild:forts` carries `ourServer`, `enemyServer`, `endsIn`, `endsAt`; kept in
  `e7-gw-forts`; the war gets `endsAt` / `enemyServer` (`GuildApp.warEndsFromGame`) and the War tab shows "War ends in
  about 17 hours".
- New fixtures, names replaced by `tools/dev/redact-gw-screens.py` (new): `steam-gw-overview-war-wide.jpg`,
  `steam-gw-map-vortex-jp-window.png` (small window with title bar; made-up names in katakana, hiragana, kanji and
  Latin letters), `steam-gw-versus-wide.jpg`, `steam-gw-hall-wide.jpg`.

**Tested**
- `npm test` **161** (+4: `barKind`; servers / `cleanCjk` / `pickRead`; `nameMask`; `near` on a local server:
  moonpies385 → moonpie5385, 0Kameko → OKameko, ハナコサク回 → ハナコサクロ, ties, limits).
- Browser suite **34/34** clean. New `tests/e2e/gw-war-names.e2e.js`: hall and VS start nothing; overview → war vs
  the enemy with servers and end time; the small-window map → "Not the overview (a fortress map)", no new war,
  fortress names untouched; **5 of 5 names exact** (ハナコサン, みどりかわ, 山田太郎, moonpie77, KeepJP1), pictures,
  offered spellings, click to use one, save.
- English names on the older real maps (same fixtures as before): **45 of 49 exact, was 36** (Stinger 9/10 from 6,
  Darkwood 9/10 from 8, Domino 9/9, Crown 8/10 from 6, Log 10/10 from 8).
- The owner's real map (not committed): ユキダルマ, ミドリカワ, starry26, OKameko exact; ハナコサク回 for ハナコサクロ
  (the player list would correct it in the desktop app).
- Desktop (packaged Linux build): `newwar`, `war-reminder` pass.
- **Not tested:**
  - Korean and Chinese names (no screenshot; same path with other language data)
  - the official-spelling lookup against the real Japanese list (unit-tested with a local list; the Japan list is
    1.5 MB, Global 17 MB on first use)
  - the maximized map of the owner's last message (it was shown in the chat but not saved as a file here)
  - on the owner's PC

**Open**
- The guild hall ("Guild War in progress") and the VS screen are recognised as "not an overview" only; nothing is
  read from them yet (the VS screen has both guild names and servers large and clear). ROADMAP.
- Also on the overview and not read yet: my attacks left (3/3), both guilds' attack totals, standing defenders per
  fortress (7/7, 4/5, 5/5).
- The war "vs bit®Hole" on the owner's PC was started by the bug: press Undo on its banner, or Mark finished. The
  wrong fortress names are replaced the next time the overview is on screen.
- Latin look-alikes the picture cannot settle (O / 0, l / 1 / I) are only fixed by the player list or by hand.

---

## 2026-11-16 · #54 · RTA overlay only during an RTA draft; overlay cards no longer outlive their page · this commit (previous: `bb60305`)

**Asked for:** (screenshots of the lobby and a Guild War map with "Your preban: …" drawn on them) "prebans shouldn't
appear here until you're in an RTA match".

**Findings**
- The RTA page posted its overlay card whenever it had slot positions and a draft step. A fresh draft's first step is
  "my pre-ban", so the card was up all the time: lobby, Guild War, everywhere.
- Second cause, visible in the owner's last screenshot (app on the Guild War page, card still on the game): the
  overlay kept a layer until someone cleared it. A page that was closed or changed never did.

**Changed**
- `js/vision/readers/rta-draft.js`: publishes `rta:stage { stage, turn }` on every change of stage and every 4 s
  (`idle` included).
- `js/auto.js`: `rtaOnScreen()` = the watcher's stage is not `idle` (word from it in the last 15 s), else the screen
  detector's RTA screens, else the draft board seen in the last 20 s. While watching live, `postOverlay` shows nothing
  unless that is true (a screenshot file loaded by hand keeps its preview). Re-checked on `rta:stage`,
  `screen:changed`; cleared on `vision:stopped`.
- `js/overlay-bus.js` + `overlay.html`: a layer lives only as long as its page: what is shown is repeated every 5 s,
  the overlay drops a layer not heard from for 15 s, and a page that is left clears its layers at once (`pagehide`).

**Tested**
- `npm test` 157.
- New `tests/e2e/overlay-rta-gate.e2e.js`: live with no draft → nothing; match found → card; pre-ban → card; draft
  over → nothing; card up, RTA page left for the Guild War page → nothing.
- `rta-auto-full`, `live-gearscan-overlay`, `overlay-test` still pass (their overlay output unchanged).
- **Not tested:** on the owner's PC. The draft reader has still only seen one real draft screen, so "a draft is on
  screen" rests on its stage texts (match found, pre-ban, pick, ban, ready).

---

## 2026-11-15 · #53 · Handoff: documentation brought up to date, developer check scripts added · this commit (previous: `bdadc24`)

**Asked for:** "Make sure to upload everything and document everything so another AI session can pick it up".

**Findings**
- Everything was already pushed (local and remote at `bdadc24`), and every Windows build through #52 succeeded.
- `docs/HANDOFF.md` had stale parts: it still called the project a browser app with an optional desktop app, its
  code map lacked the modules of #44–#52 and most readers, the testing section said "74 tests" and "no real
  screenshots exist", the tail listed things as untested that the owner has since used, and there was no single
  place saying what is verified, what is waiting on the owner and what bites.
- `README.md` did not mention the official record site, top players, team plans, seasons or that Guild War reads
  the game.
- The real games used to judge the model (#45, #51, #52) existed only in the session's scratch folder, with one-off
  scripts: a next session could not repeat those checks.

**Changed**
- `docs/HANDOFF.md`:
  - new **§0 "Where things stand"**: who the owner is and how work reaches them, a table of every area with what is
    verified on their PC, what is waiting on them, good next steps, and the traps (prompt in Electron, package file
    list, `data-hero`, portraits, public repository, record-site approval, commit rules)
  - §1 rewritten (desktop app first; all pages incl. the watcher and the Top players tab)
  - §3 code map: `js/records.js`, `js/topmodel.js`, `js/teamplan.js`, `js/topstats.js`, a table of all seven readers
    and their events, the page parts for the record site, the desktop main-process files
  - §5 flows: suggestions with all source groups, the record site / top players chain, the RTA draft reader, Guild
    War from the screen, the updater's timing
  - §6 testing: current counts, how to run one browser test, which tests use real screenshots, the stand-in for the
    record site, the desktop checks and how to build for them, the real-games check
  - §7 keeps the per-feature notes; its stale ending is replaced; §8 commands are current and complete
- `README.md`: sections for official match records / top players and for Guild War reading the game; four more rows
  in the sources table; the development file list; the roadmap ticks; "start here" pointer for whoever continues.
- `docs/ROADMAP.md`: new "Next up" block (what needs the owner, what does not).
- `tools/dev/collect-top-games.js`, `tools/dev/model-report.js` (new): collect public top-player games the way the
  app does and print what the model, statistics and planner make of them. Output goes to `tools/dev/out/`
  (git-ignored: the records hold player numbers and are never committed).

**Tested**
- `node tools/dev/model-report.js` on the 10,615 games of #45: same numbers as recorded there (57% of 1,104 unseen
  games; who moves first 88.7%; third pick banned 0 of 21,230; a 5-slot plan from 43,142 teams in 91 ms).
- `npm test` 157; no app code changed in this commit, so the browser and desktop suites were not run again (last
  full run: #52, all green).
- **Not tested:** `tools/dev/collect-top-games.js` from its new place (same code as the session's one-off script,
  which ran once: 110 players, 1,100 lookups).

---

## 2026-11-14 · #52 · Whole-team plans: what to pick now and what to follow it with (E7DaT's planner) · this commit (previous: `6ac61be`)

**Asked for:** "and do everything else" (last item of the list: plans for the whole team instead of one pick at a
time, with a second plan in case a hero is taken or banned).

**Findings**
- Read E7DaT `plan.py` in full (587 lines). Its core: candidates per remaining slot, every team from them (up to
  120,000), a later-slot hero counted only by the chance the enemy has not taken it by then, early picks paying for
  counters still open, the value of a pick now = mean of the best three teams after it minus leaving it open, rank =
  top players' pick share × e^(weight × scale × value), two plans (best and clearly different).
- E7DaT's own measurements, taken over as they are:
  - valuing a team by the expected 4 v 4 after both bans made plans **worse**; it is switched off there → not ported
  - of the difference the model sees between options, about a third holds up → the number shown is damped (0.035 ×
    the difference of the log ranking scores)
- On the real games of #45: 43,000 teams for five open slots in about 55 ms, 1,000 teams late in the draft in 20 ms.
  Quick enough to run on every redraw of the draft.
- Not ported: similar-team records, heroes that need a specific ally, following a plan the user chose, "deny",
  the correction for heroes I do not own ("had you built it").

**Changed**
- `js/teamplan.js` (new, pure): `E7TeamPlan.search(engine, { own, enemy, taken, meFirst, pool })` → choices for
  the pick(s) now and up to two plans, each with the five heroes by slot, and for every later slot the chance the
  hero is still free plus two stand-ins. With a roster, only heroes I own (when I own enough of them).
- `js/topmodel.js`: `Policy.pair` (two slots picked together, from similar drafts).
- Draft tab (`js/app.js`, insights): card **Team plans** on my pick: "Plan A: now X + Y, then Z (86% still free;
  else A / B) … +2.0 pp" and "Plan B: a different team …". Clicking a hero of "now" picks it.
- `tests/_world.js`: the made-up test world, now shared by the model and the planner tests.

**Tested**
- `npm test` **157** (+7: slots per side and turn, a planted pair completed, no taken hero and no hero twice,
  ranking and shown numbers in the same order, the second plan differs, availability of later picks, only my own
  heroes, speed, joint pick share of two slots).
- Browser suite **32/32** clean; `tests/e2e/topmodel.e2e.js`: two plans on the draft tab, Plan A picks the planted
  partner of my hero now, clicking a planned hero picks it.
- Desktop (packaged Linux build): `topmodel`, `newwar`, `update-check` pass.
- Looked at with the real games (screenshot): two full plans after the most common opener, readable in the side
  column.
- **Not tested:** in a real draft on the owner's PC; whether following the plans wins more (E7DaT measured +0.6 to
  +1.0 points for looking ahead at a lower ranking weight, and "hard to say" at the weight used now).

**Open**
- The plans are not on the in-game overlay yet (only the single-pick suggestions are).
- The suggestion list (all sources added up) and the plans (top-player model alone) can disagree; both are labelled.

---

## 2026-11-14 · #51 · Turn order: who moves first, heroes that need the first turn (E7DaT's turn model) · this commit (previous: `094ff73`)

**Asked for:** "and do everything else" (item: use the stored start readiness to say who moves first and warn when
the enemy can out-speed a hero that needs the first turn).

**Findings**
- Ported from E7DaT `stats.py` (`_turn`, `_turn_model`, the turn terms of `_fit` / `_residual_pass` / `_offsets`,
  step 4 of `_tune`) and `model.py` (`ft_logit`, `p_first`, `turn_z`, `turn_gain`), `recommend.py` (`turn_info`,
  `speed_threats`, threats by turn).
- The first turn = the side with the highest start combat readiness of all ten heroes. The model for it is its own
  logistic fit: a speed effect per hero, the players' own gear speed in the player terms, plus match-ups between
  heroes that often move first.
- **On the real games of #45** (6,734 usable):
  - who moves first is called right from the draft alone in **89%** of 1,104 unseen games
  - the two heroes that are the fastest of all ten in 98% and 94% of their games come out on top, and the match-up
    table says which of the two moves before the other, as E7DaT describes
  - the side that moves first wins 52.6%
  - several heroes win about 60% when their side moves first and about 30% when it does not
  - adding turn order to the win-rate model did **not** improve its predictions on this sample (log-loss 0.6803 with,
    0.6797 without), so the self-check left it out of the win rates. It decides again at every fit; the owner's
    collection is 3.5 times bigger. Shown either way.
- Fit time with the full search: 4.1 s for 6,734 games (was 2.7 s), in the background worker.

**Changed**
- `js/topmodel.js` (stored format 2: fitted once more after the update): `turnOf`, `turnModel`; turn terms in
  `fit`, `residualPass`, `step`, `offsets`, `estimate`; the self-check measures how well the first turn is called
  and whether turn order helps the win rate (`meta.useTurn`, `ftCalib`, `backtest.ftAccuracy`); per hero `sp`,
  `t1`, `t0`, `fast`, `tf`, `wr1`, `wr0`, `n1`, `n0`; `Model.ftLogit / pFirst / turnZ / turnGain` (inside `gain` and
  `logit` when in use); `Engine.turnInfo`, `speedThreats`, threats that take the first turn away; candidate rows
  carry `pf0` / `pf`.
- `js/logic.js` (source `top players`): "Your chance to move first: 37% → 100%", "Needs the first turn (wins 64%
  with it, 29% without); your side would have it in about 20%", "Gets the first turn it needs …", "(moves before
  it)" on open counters, "turn order ±x" inside the model's win-chance reason when it is in use.
- Draft tab: "… you move first in about X%". Data tab: how well the first turn is called and whether it is counted.
- Statistics page: lists "Moves first" and "Needs the first turn", a line in the hero details, the model-check tile.

**Tested**
- `npm test` **150** (+2: `turnOf`, planted fastest heroes found, a planted hero that needs the first turn, chance of
  the first turn, rows, threats, the reasons for my side and for the opponent's).
- Browser suite **32/32** clean; `tests/e2e/topmodel.e2e.js`: the planted opener's reason, the draft line, the turn
  lists, the tile ("who moves first: 87% right").
- Desktop: `tests/desktop/topmodel.js` (worker, stored, reused).
- Real games: see Findings.
- **Not tested:** with the owner's 23,888 games; equal gear is assumed (a much faster or slower account shifts all
  of this; E7DaT corrects for it with one's own match history, not ported).

---

## 2026-11-14 · #50 · Guild War: reminder before the next war; enemies marked beaten from the fortress map · this commit (previous: `fd71a7a`)

**Asked for:** "and do everything else" (Guild War part of the list: a reminder shortly before a war begins, targets
cleared from the "beaten" badges).

**Findings**
- The fortress-map reader already tells for every defender whether the badge ring is red (standing) or grey
  (beaten); it was only shown, never used.
- No enemy map among the owner's screenshots has a beaten defender (the beaten ones are on our own side's maps), so
  the enemy case is tested with the reader's event, not with a picture.
- The time of the next war is known since #46, rough to the hour.

**Changed**
- **Reminder** (desktop app):
  - `desktop/reminder.js` (new): one timer, one notification about 30 minutes before the war, once per war. Readings
    of the same war (up to 3 hours apart) do not repeat it; the earlier estimate wins; kept in `config.json`
    (`warReminder`) so it also fires after a restart. Clicking the notification opens the Guild War page.
  - bridge `E7Desktop.guildStandby({ beginsAt })` / `warReminder()`; called by the standby reader and by the Guild
    War page (so a guildmate's shared reading reminds this PC too). The standby banner says that a reminder is set.
- **Beaten from the map**:
  - `js/guild-app.js` `markBeaten(players)`: when an enemy fortress map is seen, defenders whose name is one of this
    war's targets get `beaten` from their badge, without a button (grey = beaten; red after an earlier grey = back
    to standing). Shared with the guild. Names the war does not have yet are left for "Save as this war's …", which
    now keeps the beaten state too.
  - `js/guildwar.js` `targetStatus`: a beaten target counts as cleared (all teams, also without a logged attack;
    `fromGame`), so summary, filters, "who can take what" and the dots follow.
  - card: "beaten (seen in the game)" and a line with when and who, with **Not beaten** to take it back; that
    correction is not overwritten by later readings in this war.

**Tested**
- `npm test` **148** (+2: reminder timing with a fake clock: 29 h ahead, the same war read again, the next war, an
  earlier reading, restart, already announced, less than 30 minutes left, nonsense; `targetStatus` with `beaten`).
- Browser: `tests/e2e/gw-fortress.e2e.js` (after the real Stinger map was saved: a map event with two known
  defenders beaten and one unknown name → 2 of 10 cleared, card line, "Not beaten", a later reading leaves the hand
  correction alone and puts another one back to standing); `gw-standby`, `gw-autowar`, `web-guild` still clean.
- Desktop (packaged Linux build): `tests/desktop/war-reminder.js`: the bridge schedules the time, keeps it in
  `config.json`, has it again after a restart.
- **Not tested:** the notification itself on Windows; a real enemy map with a beaten defender (colour rule is the
  one measured on our own side's maps in #39).

**Open**
- A wrongly read grey ring would show a target as cleared to the whole guild until someone presses "Not beaten" or
  the next reading shows it standing.
- Still unknown: what the game shows right before a war and right after one (screenshots needed).

---

## 2026-11-14 · #49 · Statistics page: my own numbers next to the top players', weekly trends · this commit (previous: `a924ec1`)

**Asked for:** "and do everything else" (the list of improvements offered after #48; this is the statistics part:
my numbers next to theirs, meta changes over time). Owner's PC: the 400-player update finished (33,953 games stored,
23,888 in use; the model named the winner in 58% of 6,006 games it had not seen).

**Changed**
- `js/topstats.js`: `trends(rows)` (each hero's pick rate in the newest 7 days against the 7 days before; needs 150
  games in each week), `sameBuild(mine, top)`.
- Top players tab (`js/topstats-ui.js`):
  - new column **Trend** (points of pick rate, week against week) and two lists "Picked more / less this week"
  - new column **Me**: my matches with the hero and my win rate (from History; the season choice there applies)
  - hero details, block **You**: my record with the hero against the top players' win rate; my build from gear.txt
    next to the builds top players use most ("same sets as 33% of top players" / "different from …")
  - the tab is wider than the others (up to 1420 px) so the twelve columns fit
- Not built: a list of all heroes I build differently (the owner's gear.txt import does not work with the Steam
  client, so there is nothing to compare yet; the per-hero line is there for when gear is known).

**Tested**
- `npm test` **146** (+2: trends with windows, ignored games and too-few-games; build comparison).
- Browser suite **32/32** clean; `tests/e2e/topmodel.e2e.js`: sort by my own matches, the "You" block ("6 of 6 … you
  do better than they do"), the trend lists and column.
- Looked at with the real games of #45: e.g. one hero went from 21% to 28% pick rate in a week.
- **Not tested:** the build comparison on the page with a real gear.txt (unit-tested only).

---

## 2026-11-14 · #48 · Seasons: my matches and the statistics per season; update checks at start (app and top-player games) · this commit (previous: `aae51fb`)

**Asked for:** "and is the rta stuff separated by seasons, also make the check for update happen on startup".

**Findings**
- Before this change:
  - top players' model: yes, by season (newest season; games of the season before are mixed in with falling weight
    until the new one has 10,000 games; a pre-season counts to its season). Nothing on screen said so.
  - my own matches, what the app learns from them, the History page: **not** separated.
  - the statistics page: no way to look at one season alone.
- The app's own update check already ran 10 s after start, but silently: nothing showed that it had happened, and a
  failed check (no internet yet) was not tried again.
- Top players' games were only fetched when "Update now" was pressed.
- The record site's season list has code, name, start and end; games carry their season code (`…f` = pre-season).
  The real fixture page is from July 2026 with code `pvp_rta_ss20f`, i.e. the pre-season after season 20.

**Changed**
- Seasons
  - `js/records.js`: `seasonTable`, `seasonForDate` (the season that started last before a date), `seasonOfMatch`
    (the site's code when the match has one, else by date); imported matches now keep `season`.
  - `js/records-app.js`: the season list is fetched once a day and kept in `localStorage['e7-records-seasons']`;
    `seasons()`, `seasonName()`, `storedSeasons()`, `modelFor(season)` (a model of one season alone, kept in
    IndexedDB `kv` under `model:<code>`).
  - `js/app.js` + History tab: new card **Seasons** with my record per season and the choice "count my matches from:
    all seasons / the current season only (switches by itself) / one season". The choice (`settings.seasonScope`,
    default: all) sets what History shows **and** what the app learns from my matches.
  - `js/topmodel.js`: `opts.onlySeason`; `meta.season` now says how many games of the season before are mixed in.
  - Statistics page and Data tab: a line saying which season the numbers are from and how much of the season before
    is mixed in; the statistics page can show one stored season alone (needs 400 usable games of it).
- Update checks at start
  - `desktop/updater.js`: the app update check runs 3 s after start, again after 5 minutes when it failed (up to 3
    times) and every 6 hours while the app is open. The menu shows "Last check 14:02: up to date (version)" /
    "version X is available" / "could not reach the update server" under "Check for updates…". A version answered
    with "Not now" is not offered again by itself.
  - `js/records-app.js`: top players' games are fetched by themselves 20 s after start (and every 30 minutes the
    age is looked at again) when the last update is older than 6 hours. Only after a first update by hand; switch
    "update when the app starts" on the card. It reads only what is new (usually one page per player).

**Tested**
- `npm test` **144** (+2: season table / season of a date / of a match; model per season and blending).
- Browser suite **32/32** clean:
  - new `tests/e2e/seasons.e2e.js` (stand-in site, clock set to 14 Nov 2026): season list kept; imported matches get
    `pvp_rta_ss20` from the site's `ss20f`; Seasons card (Fall 2 matches, Summer 13); "Summer only" → 13 matches
    shown and learned from; "current season" → 2; kept after a restart; update at start: not without a first update
    by hand, runs when 7 hours old, not when fresh, not when switched off
  - `tests/e2e/topmodel.e2e.js`: season line ("1,500 games of the season before mixed in at 55% weight"), "Summer
    2026 only" → 1,500 games, back to the newest
- Desktop (packaged Linux build): new `tests/desktop/update-check.js`: the menu line goes from "checking at start…"
  to "Last check <time>: …" without anyone asking; `topmodel`, `newwar` still pass.
- **Not tested:** the update dialogs on Windows with a real newer release; the season list's real names and time zone
  (dates are compared as written; a match within hours of a season's start could land in the neighbouring season
  unless the site gave its code); a real season change.

**Open**
- Default stays "all seasons" for my own matches, so nothing disappears by surprise; "current season only" is one
  choice away. Say if the default should be the current season.
- The stored models are fitted once more after this update (their signature changed).

---

## 2026-11-14 · #47 · "Top players" statistics page: hero table, hero details, pre-bans, openers, pairs, counters, builds · this commit (previous: `a82ddf3`)

**Asked for:** "can you make a statistics page that shows useful information regarding the stats from top players'
games".

**Findings**
- Everything needed is already in the stored model of #45 (per hero: pick rate, win rate, skill-adjusted strength,
  pre-bans by role, opening picks, bans, pick order, start readiness; pair and counter tables). Builds (artifact +
  gear sets) are in the stored games.
- With the real games collected for #45 (6,734 usable): the plain win rate and the skill-adjusted strength often
  disagree (a hero with 59% win rate has −1.5 points of strength: its users are simply better players), so both are
  shown side by side.
- The app opens its hero card for anything marked `data-hero`; the page's own rows must not use that attribute.

**Changed**
- New tab **RTA → Top players** (`rta.html` `#tab-top`):
  - four headline numbers: games in use, players seen, first-pick win rate, the model's self-check
  - hero table, sortable by every column, with search and a minimum-games filter: picked, win rate, strength,
    pre-banned by first-pick / second-pick players, opening pick, banned when picked, moves first, games
  - click a hero: best / worse with, good / struggles against, in which pick it is taken, how top players build it
    (artifact + sets, share, win rate), and a button to the app's hero card
  - lists: pre-bans with the first pick, pre-bans when picking second, opening picks, strongest pairs, biggest counters
  - an explanation when nothing is collected yet or the model is not ready
- `js/topstats.js` (new, pure): `overview`, `heroes`, `sortRows`, `partners`, `matchups`, `topPairs`, `topCounters`,
  `prebans`, `openers`, `builds`.
- `js/topstats-ui.js` (new): draws the tab; redraws when the model changes (`E7RecordsApp.onTop`).
- `js/records-app.js`: `onTop(fn)`, `names { artifact, hero, set }`. `js/app.js`: the tab's render hook.
- `css/styles.css`: `.ts-*`. One blue for "how much" bars; blue / red around a middle line for better / worse than
  average (the pair passes the colour-blind separation and contrast checks on the app's dark panel); every bar has
  its number next to it.

**Tested**
- `npm test` **142** (new `tests/topstats.test.js` ×5: rows, sorting with missing values, partners / match-ups from
  the hero's own side, lists, builds).
- Browser suite **31/31** clean; `tests/e2e/topmodel.e2e.js` now also opens the tab: headline numbers, sort by
  strength (planted strong hero first) and by second-pick pre-bans (planted hero first), search keeps the focus, hero
  details (planted partner under "Best with", pick order, builds), the app's own hero card does not open, the lists.
- Looked at with the 10,615 real games of #45 loaded (not committed): layout fits the page at 1500 px, real names and
  portraits, plausible content (e.g. one hero pre-banned by 91% of second-pick players).
- **Not tested:** in the desktop app on Windows with the owner's collection; windows narrower than about 1250 px (the
  table then scrolls sideways).

**Open**
- Not shown yet: change over time (pick rate this week against last), the pick policy for a given draft position,
  my own numbers next to the top players'.

---

## 2026-11-14 · #46 · Guild War standby page: "no war running, next war in 29 h" is recognised · this commit (previous: `a93acf1`)

**Asked for:** (two screenshots of the standby page: maximized, and in a small window next to the app) "that is the
guild war standby page if no guild wars are around, so detect that since there is no guild war for today, war begins
in 29 hours". The same message showed the record features working on the owner's PC.

**Findings**
- The standby page has, in the middle from top to bottom: "2026-3 Season", "Guild War Standby", a sentence on a dark
  band, "War Begins" / "in 29h", then three buttons (Team Formation is green, Battle Log and War Ranking dark).
  Everything is centred and scales with the picture height, the same in the 2000×1070 screenshot and the small window.
- The existing overview reader does **not** take this page for an overview ("no shield / swords switch"), so it did
  not start a war from it. The "started by itself" banner in the owner's screenshot came from an overview read
  earlier. Nothing closed that war again once the game showed standby: fixed here.
- A Guild War page opened later used a stored overview reading up to 12 hours old, even when the game had shown the
  standby page since.
- Owner's PC (Windows, from the screenshot), first real use of #44: "Find me" found the account on Global, the import
  read 97 games, the top-player update was at player 33 of 200 with 3,262 games.

**Changed**
- `js/gwmap.js`: `STANDBY` places, `standbyRect`, `isStandbyTitle`, `standbyMinutes` ("in 29h", "in 1d 5h", "in 45m";
  mends OCR slips), `greenShare`.
- `js/vision/readers/guild-standby.js` (new reader; `vision.html`, `live.html`):
  - every pass, cheap: is the green button where the standby page has it?
  - then the title must read "Guild War Standby", then the countdown and the season are read
  - published after two passes agree: `guild:standby { minutes, beginsAt, season, text }`; kept in
    `localStorage['e7-gw-standby']`; while the page stays open it is read again once a minute
- `js/guild-app.js` / `guild.html` / `js/guild-watch.js`:
  - War tab banner `#war-standby`: "No Guild War right now … next war begins in about 29 hours (around <day, time>)",
    counted down from the reading; gone when a war is started after it or when the time has passed
  - a war still open is **marked finished** (shared with the guild), with **Undo**; after Undo it is left alone for
    12 hours
  - the next war's time is shared in the guild's settings record (`nextWar`), so guildmates see the banner too
  - a page opened later uses whichever the game showed last: the standby page or an overview

**Tested**
- `npm test` **137** (+1: title, countdown formats and OCR slips, places at two window sizes, green share).
- Browser suite **31/31** clean; new `tests/e2e/gw-standby.e2e.js` on the owner's two real screens (new fixtures
  `steam-gw-standby-wide.jpg` 2000×1070 and `steam-gw-standby-window.jpg`, the small window cut from the desktop
  screenshot, title bar included):
  - both read "no war running · next war in 29 h", season 2026-3 (the window one after the title bar is cut from the
    pixels: 1162×654)
  - not taken for standby: our overview, a fortress map, the enemy defense screen, the RTA ban screen, the lobby
  - Guild War page: banner; open war finished + Undo; after Undo another reading leaves it alone; an overview read
    afterwards starts that war and hides the banner; pages opened later follow the last thing the game showed
- **Not tested:** live on the owner's PC; other countdown forms ("in 45m", "in 1d 5h" are guesses, only "in 29h" was
  seen); the game in another language (the title is matched in English).

**Open**
- The game shows whole hours, so "begins around" can be up to an hour early.
- What the game shows between "standby" and the war (matching / preparation) is not known yet: a screenshot helps.
- The banner in the owner's screenshot belongs to a war started from an earlier overview reading; which guild name
  was read there is not visible. If it was wrong, Undo removes it; the standby page now finishes it either way.

---

## 2026-11-14 · #45 · Win-rate model, pick policy, ban and pre-ban advice from top players' games (E7DaT's statistical core) · this commit (previous: `bdf7ac4`)

**Asked for:** the rest of "add the record site, all of it": use the collected top-player games the way E7DaT does,
not only as plain win rates.

**Findings**
- Ported from E7DaT (MIT; `stats.py`, `model.py`, `policy.py`, `recommend.py`), read in full first:
  - which games count: both players Legend / Emperor (1.0 / 0.6, multiplied), last 60 days, previous season blended
    out as the new one fills
  - the fit: logistic regression with hero effects, **player skill** (players with ≥ 12 games, else their grade),
    first-pick bias, a popularity trend; then pair / counter / first-or-second-side effects from what the fit gets
    wrong, pulled towards 0 when games are few; two rounds
  - a self-check: a model built without the newest ~1,000 games predicts them; this picks the pull strengths and a
    scale against overconfidence
  - pick policy: share of top-player drafts with a hero in this slot, backed off from all drafts to drafts sharing
    my picks and the enemy picks visible at that moment
  - candidates: gain, risk from counters still open, discount for heroes that get banned a lot; pre-bans by role;
    final ban by expected win rate after both bans
- **Checked on real games** (collected for this check the same way the app does: 110 ranked players, 1,100 lookups,
  10,615 games, kept outside the repository):
  - 6,734 games usable; fit with the full search 2.7 s; stored model 418 kB
  - held-out 1,104 newest games: winner named in **57%**, log-loss 0.680 against 0.693 for a coin; predicted and real
    win rates agree per band (e.g. predicted 58% → real 60%, predicted 67% → real 67%)
  - a draft decides only part of a match, so 55–60% is what such a model can reach (E7DaT reports the same range)
  - the model's first choice for the second side's third pick was the real pick in 21%, in its top five in 60%
- Seen in the real games, and used:
  - **the third pick of a side is never banned** (0 of 21,230 picks; last pick banned in 50%, fourth in 29%)
  - top players pre-ban very differently by role (one hero is pre-banned by 90% of second-pick players and rarely by
    first-pick players), so pre-ban advice uses the role
  - first pick wins 52%
- Changed on purpose from E7DaT: it is updated daily and weighs the newest day 1.0, older days 0.2; this app is updated
  when the owner presses a button, so the last 14 days weigh 1.0 and older games 0.5.

**Changed**
- `js/topmodel.js` (new, pure): `build(rows)` → stored statistics; `Model` (position → win rate, `gain` with its
  parts); `Policy.slot`; `Engine` (`rows`, `prebans`, `firstPicks`, `bans`, `winrate`).
- `js/topmodel-worker.js` (new): the fit runs in a background worker, the app stays usable.
- `js/records-app.js`: after an update (and at start) the model is fitted, kept in IndexedDB `e7-records` (now
  version 2, store `kv`, key `model`) and reused while the stored games are the same. Data tab: what it is built on
  and its self-check result. Draft tab `#top-model-line`: win chance for the board as it stands; with 5 v 5 the best
  ban and which of my heroes they will likely ban.
- `js/logic.js`, source **`top players`** (same switch as before):
  - pick reasons: "Top-player model: +2.3 pp win chance (hero +1.1, with A +0.8, vs B +0.4)", "Top players pick it
    at this spot in X% of similar drafts", "Still open against it: A, B (−X pp risk)", "Banned in X% of top players'
    games when picked"; these replace #44's plain win rates when a model exists (≥ 400 usable games)
  - final ban: "banning it is worth +X pp"; **game rule: the third pick cannot be banned** (never suggested now, also
    without the model)
  - pre-bans: "Top players pre-ban it in X% of their drafts as first / second pick"; lowered for heroes I play a lot
- `js/app.js`: `ctx.topModel`, `ctx.nameOf`, `ctx.myUse`.

**Bugs found and fixed while building**
- With the model present, the final-ban list still added #44's plain win rates for the same games → only one of them.
- The third-pick rule first applied only with all five picks; it holds from the third pick on (post-ban risk).

**Tested**
- `npm test` **136** (new `tests/topmodel.test.js` ×8: a made-up world with planted effects: strong hero found, good
  players' favourite NOT mistaken for a strong hero, pair, counter, first-pick bias, self-check beats a coin, policy
  back-off, risk, ban-guard slot, pre-bans by role, final ban, JSON round trip).
- Browser suite **30/30** clean; new `tests/e2e/topmodel.e2e.js` (6,000 made-up games between real heroes put into the
  records database): fitted in a worker, Data tab line, pick reasons naming the ally / enemy, win-chance line,
  pre-ban idea, final ban with the third pick refused and "they will likely ban", after a restart the stored model
  (no second fit), source switched off → no model reasons.
- Desktop (packaged Linux build): `tests/desktop/topmodel.js` → fitted **in the worker** under the app's own page
  protocol, stored, reused after a reload; `records-live`, `newwar` still pass.
- Real games: see Findings.
- **Not tested:** on Windows; with the owner's own collection (first run 200 players ≈ 15–20 minutes); how the
  advice reads during a real draft.

**Open**
- Not ported yet (ROADMAP): turn-order model (who moves first), ban forecast, similar-team records, heroes that need a
  specific ally, the team planner (whole-team plans), reasons from the opening rule.
- The weights that turn model numbers into suggestion points (`W.topModel` 0.8 per pp, capped; `topPolicy`,
  `topBanned`, `topPreban`) are first guesses; "Tune from my matches" can scale the whole `top players` group.
- The model assumes equal skill and gear on both sides.

---

## 2026-11-14 · #44 · Official record site: own match history, opponent scouting, Guild War player lookup, top-player statistics · this commit (previous: `580527b`)

**Asked for:** "yes add the record site, all of it and what details did you need i can send them now" (the owner's OK
for the lookups that waited since #41).

**Findings** (checked against the live site on 2026-11-14, public data only)
- The site (epic7.onstove.com/gg) reads its data with `POST https://e7api.onstove.com/gameApi/<name>?…&lang=en`; the
  server wants the site's `Origin` / `Referer` headers. Undocumented. Used: `getSeasonList`,
  `getWorldUserRankingDetail` (10 rows per page, top 100), `getBattleList` (10 games per page, a player's last 100).
- A player is addressed by a **number** (`nick_no`) plus server. Name → number comes from one public file per server
  (`static-pubcomm.onstove.com/gameRecord/epic7/epic7_user_<world>.json`; Global 17 MB, Asia 12 MB, Korea 4.8 MB,
  Europe 4 MB, Japan 1.5 MB). So a name never has to be sent anywhere: the file is downloaded and searched on the PC.
- One game holds: both sides' 5 picks in pick order, the banned hero, pre-bans, first pick, result, both grades,
  every hero's artifact and gear sets, and the combat readiness each hero started with (speed order).
- The Fall 2026 season ended today: the current (pre-season) ranking is empty, so the top players come from the
  season before.
- A new main-process file must be in `desktop/package.json`
  `build.files` or the installed app does not start. Missed at first, caught by the packaged-app test; now a unit test.

**Changed**
- `desktop/records.js` (new, main process): the only place that talks to the record site. Fixed list of allowed
  lookups and parameters, one request at a time 0.35 s apart, retries with growing waits, the server's player list
  cached for 3 days in the app's data folder. Bridge: `ipcMain` `e7:records` (only for the app's own pages) →
  `E7Desktop.records { game, find, status }` in `desktop/preload.js`.
- `js/records.js` (new, pure): `parseBattle`, `toMatch` (a game as one of the app's matches), `summary` (a player's
  habits), `crawl` (ranking → players → their games, opponents at Legend / Emperor join the queue, only pages newer
  than what is stored), `toStatsMatches` (one entry per game, both players Legend / Emperor, last 60 days).
- `js/records-app.js` (new):
  - **RTA → Data → Official match records**: server + in-game name → "Find me" → "Import my matches now" (last 100
    games). Stored as match source **`official record`** (switchable like every source). A game the app already
    recorded itself (within 3 hours, same heroes) is not added twice. Options: import after each match (4 and 12
    minutes after a draft ends, and at start), look up my opponent during a draft.
  - **Draft tab**: the opponent's name (read from the screen or typed) is looked up on my server first, then the
    others → panel `#records-opp`: grade, win rate, most picked, pre-bans, first picks, usually fastest; for every hero
    they have on the board: artifact + sets they use and the combat readiness it starts with.
  - **Top players**: "Update now" follows 100–400 players (default 200) and builds statistics from games where both
    players are Legend / Emperor. Kept in IndexedDB `e7-records`.
- `js/logic.js`: two new, separately labelled sources in `scoreCandidate`:
  - **`top players`** (`ctx.topStats`, from 30 games on): hero win rate, win rate against an enemy pick, with an ally,
    pick rate. Switch: Suggestion sources → "Top players' games".
  - **`official record`** (`ctx.recordProfile`): "Name picked it in X% of their last N arena games" when predicting the
    opponent's pick. Switch: "Opponent's official record".
- `js/guild-app.js`: enemy cards get **Arena record** (desktop only): the player's arena habits, and how the heroes of
  their defense are built in the arena. Labelled as arena data (a Guild War build can differ).
- `desktop/package.json`: `records.js` added to the packaged files.

**Bugs found and fixed while building**
- Packaged app did not start (`Cannot find module './records'`): file list, see above; guarded by
  `tests/desktop.test.js`.
- Top-player statistics counted every game twice and the pick rate was halved → one entry per game.
- Opponent panel did not appear when the name was typed (typing does not redraw the draft) → listens to the field too.

**Tested**
- `npm test` **128** (new: `tests/records.test.js` ×6: parsing one real page of games, match conversion, summary,
  seasons, crawl against a fake site, transport against a local server incl. retries and the refused lookup,
  suggestion reasons; `tests/desktop.test.js` +1 package list).
- Browser suite **29/29** clean; new `tests/e2e/records.e2e.js` against a stand-in site serving one real page of games
  (names replaced): import 10 → again 0 new; opponent found on Korea after Global / Europe / Asia; reason "Rival01
  picked it in 80% of their last 10 arena games (+4)"; build line "A Symbol of Unity + Might / Speed (4 of 8 games) ·
  starts at ~96% CR"; top-player update; Guild War card.
- **Live, inside the packaged app** (`tests/desktop/records-live.js`, Linux build, 11 real lookups): seasons, ranking
  10 rows, a ranked player's page 10 of 10 games parsed (24 heroes, 22 with builds), Japan's player list downloaded
  and searched in 1.6 s (second search 0 ms), a lookup outside the list refused, a 2-player collection run stored 40
  games → 20 Legend / Emperor games, 53 heroes; no page errors.
- Desktop: `newwar`, `overlay-status` still pass.
- **Not tested:**
  - on Windows (the owner's PC)
  - "Find me" with a real account name (no name was typed here on purpose); the 17 MB Global list
  - a full 200-player run (about 2,000 lookups, 12–15 minutes)
  - import right after a real match (how quickly the site lists a finished game: 4 / 12 minutes is a guess)
  - the app's own recording and the site's copy of the same real match being recognised as twins

**Open**
- The lookups are undocumented and can change or be blocked without notice; the feature then reports the error and
  everything else keeps working.
- Top-player statistics reuse the app's own counting (`RTALearn.buildStats`): descriptive win rates. E7DaT's fitted
  win-rate model, pick policy and team planner are **not** ported yet (ROADMAP).
- Fixture `tests/fixtures/records/battle-list.json`: one real page of public games with names and player numbers
  replaced.

---

## 2026-11-14 · #43 · Guild War defense 6/6 on the real screen; hero pictures cached between starts · this commit (previous: `79506b5`)

**Asked for:** still "anything that works in the meantime".

**Findings**
- The three Guild War defense icons the reader was "unsure" of since #34 (blamed on skins) were **new heroes missing
  from the roster**: Rhianna and Luciella, Lisette, Renoa. With #41's roster they get the right best match.
- Two right matches then missed the certainty rule by a hair (Kawerik 0.90 with lead 0.09, Lisette 0.87 / 0.08): a
  similar-looking new hero now scores close behind.
- Evidence for a second rule, from the owner's real screens with the full roster (40 faces of the pre-ban grid, checked
  on a contact sheet, plus the 6 Guild War icons):
  - every match scoring ≥ 0.86 is right
  - no wrong match scores above 0.76
  - The grid's top rows, which the app couldn't name at all before, are now matched correctly too (Tidal Rift Elvira,
    Ivana, Salome, Ruiza, Aki, Shepherd of the Dark Diene, …).
- Adding the 67 round skin icons from the asset repository changed nothing on these screens, so they are not added.
- Every session downloaded about 850 small pictures (458 wide portraits, 391 round icons) before its first draft.

**Changed**
- `js/faces.js` `isConfident`: also sure when score ≥ 0.86 and lead ≥ 0.07 (only for the default call; callers that pass
  their own thresholds are unchanged).
- `js/vision/readers/rta-draft.js`: computed templates are kept in IndexedDB `e7-templates` (wide portraits and round
  icons; valid for the same picture list and calendar month) and reused on the next start.
- Tests: `gw-defense` and `teach` now correct a recognised icon (there is no unsure one left on that screen);
  `rta-draft` checks a second start.

**Tested**
- `npm test` **121**.
- `gw-defense.e2e.js` on the real enemy screen: **6/6 recognised** (was 3/6 in #34, 4/6 after #41): Rhianna and
  Luciella, Lionheart Cermia, Kawerik · Frieren, Lisette, Renoa; the editor is prefilled with all six; a correction is
  still learned.
- `gw-fortress.e2e.js` (the 2000×1070 enemy screen): 6/6.
- `faces-real.e2e.js`: no unconfirmed face named confidently; known faces 14/15 plain, 15/15 with the badge filter (as
  before).
- `rta-draft.e2e.js`: second start → wide and round templates from the cache, **0 picture downloads**, BAN screen
  10/10.
- Browser suite **28/28** clean.
- **Not tested:** the cache inside the desktop app on Windows (same browser engine).

**Open:** the names of the six defenders were judged by eye against the screenshot (no in-game confirmation).

---

## 2026-11-14 · #42 · Hero mechanics as a suggestion source: RTA reasons, hero card, Guild War warnings (E7DaT knowledge) · this commit (previous: `202ee25`)

**Asked for:** "Anything work in the meantime, work on that" (while the owner decides about the official record site).
Chosen: the part of E7DaT that needs no outside lookups, its bundled hero knowledge.

**Findings**
- E7DaT's `assets/knowledge.json` (MIT, frozen 2026-11-14) holds:
  - mechanic tags for 272 heroes (38 tags, e.g. "blocks Souls", "revive", "front-line guard", "turn catch")
  - 23 rules "tag A blocks tag B" with an English sentence for each side
  - per hero and rule, how much more top players pick the blocker in that spot and how the victim's win rate changes
    (from 40,300 Legend/Emperor games)
  - the builds top players use (artifact + sets, share, start CR) for 56 heroes; the 12 usual openers
- Its build strings are Korean; the file's own tables translate every artifact and set (nothing left untranslated).
- E7DaT's filters matter:
  - a caution is dropped when the victim still does well against that mechanic, or when top players don't avoid that
    opponent
  - artifact-based rules only count for hero pairs the records single out
  - Without those the notes would be noisy (81 heroes have "extra turns").
- The game text in it is derived tags and short paraphrases; the few lines that closely paraphrase in-game effect text
  (artifact effects, exclusive equipment, `needs.why`) are not shown as text in the app. Artifact names are shown.

**Changed**
- `tools/make-e7dat-knowledge.py` → `js/sources/e7dat-knowledge.js` (English only, 36 kB).
- `js/knowledge.js` (new, pure): `mechanics`, `versus`, `notesFor`, `threats`, `builds`, `opener`.
- RTA:
  - `scoreCandidate` takes `ctx.knowledge`: reasons (my pick shuts down theirs; "top players pick it N× more here" when
    the records say so) and cautions (theirs shut mine down, with the pp when it is large), capped at +2 / −2.4
  - source label **E7DaT knowledge** on each; its own switch in Data → Suggestion sources (`useKnowledge`, on by
    default) and its own weight group
- Hero card (all pages): "Mechanics and top-player builds" block with the source and its date.
- Guild War:
  - every open defense team shows "Watch for: front-line guard (Boss Arunka) · blocks Souls (Belian) …"
  - the attack window lists what the defense does to the heroes typed in and what they do to it
- Docs: SOURCES (row 8 extended), HANDOFF, ROADMAP, E7DAT_NOTES.

**Tested**
- `npm test` **121**. New `tests/knowledge.test.js`:
  - each filter on a small made-up set (proven reason, proven caution, victim does well, not avoided, strict pair only,
    contradicted reason, non-warning rule)
  - the suggestion engine adds labelled notes; weight 0 switches them off
  - the real file: Boss Arunka's front line vs Kawerik's single-target skill, and no Korean left in builds
- New `knowledge.e2e.js`:
  - RTA with Boss Arunka picked by the opponent: suggestion rows carry "E7DaT knowledge" reasons (e.g. Desert Jewel
    Basar "Turns barriers into damage (vs Boss Arunka) · top players pick it 6× more here"); switched off → none
  - hero cards of Boss Arunka (front-line guard; Proof of Valor / Crown of Glory + Immunity + Protection, 32% each) and
    Zio (opener)
  - Guild War defense card "Watch for: …"; attack window: "⚠ Kawerik: Boss Arunka: single-target key skill can't
    reach past the front line", "✓ Ruele of Light: … (vs Zio) · top players pick it 1.5× more here"
- Browser suite **28/28** clean.
- **Not tested:** whether the weights (+0.6 / +1.0 per reason, −0.8 / −1.2 per caution) sit well next to the owner's
  notes in real drafts; they can be scaled with the source's weight.

**Open:** the knowledge is a snapshot of November 2026 (new heroes after that have no tags); E7DaT's "needs an ally"
table and per-pair counter lists aren't used yet.

---

## 2026-11-14 · #41 · RTA draft read with no calibration (from E7DaT); newest heroes added to the roster · this commit (previous: `1d192f8`)

**Asked for:** the owner supplied `E7DaT-main.zip`: "Use this to help you create the perfect application. Especially for rta
and guild war".

**Research (the archive was unpacked into its own folder and only read; none of its code was run)**
- E7DaT 1.0.0 (ohrgon-game, MIT) is a Python World Arena draft assistant for the same Steam client: it reads the draft from
  the screen and recommends from top players' match records. Nothing in it is about Guild War.
- Its measured draft layout fits the owner's real BAN screenshot exactly (10 card boxes, the stage text box, the pre-ban
  row). **My by-eye pre-ban row was ~5% of the height too high**: that alone explains "pre-bans aren't even detected".
- Pick cards show the hero's **wide portrait** (`{code}_l.png`, skins `_sNN_l`; community repository
  CeciliaBot/E7Assets-Temp: 400 heroes, 66 skins), mirrored on my side.
  - E7DaT matches SIFT features. My own SIFT run (written from its description) on the 1340×754 JPEG-sourced fixture
    read only 4 of 10 cards, but it showed that the portrait is always drawn at the same place and scale.
  - So a direct masked correlation at that fixed geometry works, with no OpenCV needed: all 10 cards right.
  - Pinning the alignment to 1 pixel raised scores to 0.85–0.98 (a greyed-out card 0.66, lead 0.11).
  - On five screens without cards nothing passes the confidence rule.
- **The official hero list lags:** 6 of the 10 heroes on that screen (Estelle, Haru, Rhianna and Luciella, Tidal Rift
  Elvira, Shepherd of the Dark Diene, Eye of the Abyss Fumyr) aren't in it at all.
  - The Fribbels dataset (RexQian) has 24 such heroes with element and class.
  - The official site has no icons for them (HTTP 403); the asset repository does.
- Stage texts ("Your Turn" blue, "Opponent's Turn" red, "BAN", "Ready", "First Pick", "Select Pre-Ban Hero") are plain;
  E7DaT's crops exist for English, Korean and Japanese.
- A confirmed card of mine has a solid blue band (E7DaT: ≥ 0.43 of the band; the real screen here: 0.44–0.76); a hero
  only clicked doesn't.
- E7DaT's data comes from the official record site's own lookups (`e7api.onstove.com/gameApi`, undocumented, called
  imitating the site). One `getSeasonList` call answered; a further probe was **blocked by this session's safety
  check** and not retried. Own-history import, opponent scouting and the statistics model therefore wait for the
  owner's decision (docs/E7DAT_NOTES.md has the full study, written with a sub-agent's read-through of the other
  5,000 lines).

**Changed**
- `js/wide.js` (new, pure): card boxes, patch geometry, portrait templates (enemy orientation + mirror), coarse-then-fine
  masked correlation at 1-pixel steps, confidence rule.
- `js/draftscreen.js` (new, pure): template matching for the stage texts, text colour, confirmed-card check, and a
  `Tracker`:
  - stages: idle / versus / pre-ban / pick / ban / ready; whose turn, turn number, first pick
  - a hero counts on the second identical read; hovered heroes are `held`; picks are never dropped
  - the draft is handed over 10 s after the texts disappear
- `js/vision/readers/rta-draft.js` (new, in the game watcher):
  - language found by itself (en / ko / ja); FIRST PICK marker on the versus screen
  - cards against wide portraits (loaded once per session, 12 at a time); pre-ban icons with the face matcher
  - any window shape: unverified anchors are tried and the working one kept
  - publishes `rta:draft` / `rta:draft-end`
- `js/auto.js`: takes the watcher's board (`onWatcherDraft`); its own slot reading doesn't touch the draft for 20 s after.
- `js/logic.js`: pre-bans nobody saw become placeholders (`UNSEEN`), so picks aren't held back; `draftView` skips them.
- `js/layouts.js`: pre-ban boxes from E7DaT's centres and radius.
- Roster:
  - `js/gear.js` keeps element / class / rarity from the Fribbels data; snapshot refreshed (393 heroes)
  - `RTARoster.extraHeroes` / `allHeroes`, `js/sources/all-heroes.js` (`RTASources.allHeroes`, each hero keeps its source)
  - used by the RTA app, hero info, Guild War, Gear, Teach heroes and the readers
  - `PORTRAIT_URL` uses the asset repository for heroes the official site has no icon for
- `js/sources/draft-labels.js` (`tools/make-draft-labels.py`), `js/sources/wide-portraits.js`
  (`tools/update-wide-list.py`).
- **Bug found by the suite:** displayed portraits used `crossorigin` on some pages and not on others, at the same
  address in one cache (the #34 problem again, from the display side). All displayed portraits are plain now; tests that
  build fake screens load them through `PORTRAIT_URL_CORS`.
- Docs: `docs/E7DAT_NOTES.md` (study + porting plan), SOURCES rows 8–9, HANDOFF, ROADMAP.

**Tested**
- `npm test` **118**. New `tests/draft.test.js`:
  - synthetic cards matched on both sides, shifted ±4 px and greyed out; empty / unknown cards rejected
  - text template found inside its search area, red vs blue
  - confirmed-card band
  - a whole tracked draft: versus → pre-ban → hover → confirm → turn change → bad reads → ban → end → the app's board
    and draft
- New `rta-draft.e2e.js` on real screens:
  - BAN screen: stage "final ban", **10/10 cards**, my five look confirmed (0.44–0.76)
  - the RTA page's draft shows both teams with no calibration
  - the same picture as a 2000×1070 window: 10/10
  - arena menu, match found, Guild War, Victory: idle, nothing read
  - both pre-ban pickers: stage "pre-bans", nothing read
  - versus screen: opponent picks first (the older OCR test agrees)
- Browser suite **27/27** clean.
- **Not tested:**
  - a real picking-phase screen (pre-ban icons at the new positions, hover vs confirm, turn counting)
  - Korean / Japanese screens
  - the desktop app on Windows

**Open / assumptions**
- One positive real frame so far; thresholds come from it and four negative frames.
- About 460 small picture downloads on the first draft of a session (cached by the app's HTTP cache for revalidation).
- The official record site lookups: the owner decides (see ROADMAP).

---

## 2026-11-13 · #40 · New war works in the desktop app + wars start by themselves from the game; bug sweep · this commit (previous: `97ee0b5`)

**Asked for:**
- "I CANT ADD A NEW WAR, it should automatiacally be able to tell by looking at the guild name etc"
- "check for any other bugs"

**Findings**
- **New war did nothing in the desktop app:** it asked for the guild name with `window.prompt()`, which Electron doesn't
  support (no dialog, nothing happens).
  - Six more questions used it: RTA preset name, meta / match-source names, the drafting-help count, the invite-link
    fallback.
  - The browser tests didn't catch it because Chromium does support `prompt()`.
- **Guild names on the overview:** both sit in the left panel (ours by the green bar, the enemy's by the red one),
  pinned left, at the same place on both sides' overviews, wide and 16:9.
  - OCR on the owner's three overviews: "Legacies … Global" and "OldMemory … Global" every time; only the server tag
    and a symbol need dropping.
- **Bug sweep:** an independent review of the code changed since #35 found 6 issues; all confirmed by reading the code
  or reproducing them, all fixed:
  1. A stale enemy guild name (from an earlier reading) could pick or start the wrong war, or put fortress names on the
     wrong war.
  2. A war you finished or undid was started again whenever the Guild War page was reopened (within 12 h).
  3. Every overview reading reached the Guild War page twice (bus + storage event). Two wars vs the same guild could be
     started at once. This happened in the browser test: fortress names on one war, the page showing the other.
  4. One unchecked reading (a 1–2 letter fragment, or a misread) could start a war and finish all others for the whole
     guild.
  5. Title bar NOT cut when the game's picture starts with its black band (RTA screens) and the window isn't 16:9 (the
     owner's 2560×1392). Readers were ~30 px off there, and the overlay jumped every 3 s. Reproduced with a synthetic
     picture.
  6. With the window tracker failing (the overlay covers the display), the overlay still used window fractions, so
     drawings were off by up to ~48 px at the owner's size.
  - Also: the guild page gave up waiting for Firebase after ~3 s; names missing from a reading were filled from the
    PREVIOUS war's names.
  - The old Linux test build still had `prompt()`: rebuilt. The owner gets the fix with the next release.

**Changed**
- `js/ask.js` (new): `E7Ask` dialogs (text, multi-field form, show-to-copy). All seven `prompt()` calls replaced
  (`js/app.js`, `js/auto.js`, `js/guild-app.js`). Loaded on every page.
  - `tests/no-prompt.test.js` fails if any page script calls `prompt()` again.
- **New war** is a form (enemy guild + season). It notes that watching the game does it by itself.
- `js/layouts.js`: `gwOurGuild`, `gwEnemyGuild` (left).
- `js/gwmap.js` `cleanGuild`.
- `js/vision/readers/guild-overview.js`:
  - reads both guild names two ways, keeping only a name both agree on (≥ 3 characters)
  - stores only this reading's enemy guild
  - takes missing fortress names from the last reading only if it's the same enemy
  - reads a single fortress label on its own when the band passes miss it
- `js/guild-app.js`:
  - `startWar` (finishes other active wars)
  - `warFromGame`, one at a time: selects the active war vs that guild, otherwise starts it with an **Undo** banner
  - never restarts a war vs that guild started in the last 5 days (any status) or one you undid
    (`e7-gw-dismissed`); waits up to 30 s for the guild's records
  - `saveFortNames` only writes onto the war those names belong to
- `js/guild-watch.js`: the stored reading is used once on load (no storage listener).
- `js/frame.js`: the game's black band right under a title bar counts as game, so the title bar is cut. Older 16:9
  window captures are now cut exactly too.
- `js/game-area.js` keeps the last title-bar cut for the same window size (no jumping).
- `overlay.html`: uses the game frame only while the tracker follows the window, otherwise the whole display; redraws
  when that changes.
- Tests: `tests/e2e/_ask.js` answers the in-page questions (six tests switched from `page.on('dialog')`). The overview
  fixtures got made-up guild names ("TestHome", "TestEnemies") where the blurred ones were.

**Tested**
- `npm test` **113**:
  - new: title bar above a black band
  - new: no `prompt()` anywhere
  - `cleanGuild` on the real OCR outputs (checked separately)
- New `gw-autowar.e2e.js`:
  - no war → the enemy overview → war "vs TestEnemies" started by itself, with its three fortress names and an Undo
    banner
  - read again → still 1
  - Undo → none
  - New war through the form → "Hand Made Guild", season kept
  - the undone guild read again → not restarted
  - a page opened later → keeps "Hand Made Guild", 1 war
- `gw-fortress.e2e.js`: the whole two-sided flow. No duplicate war any more; names land on the right war.
- Browser suite **26/26** clean.
- Desktop tests on a rebuilt Linux package: all 9 pass (overlay test card, watcher, RTA follow, pop-outs, zoom, dev screenshots, cancel, window picker, overlay status) + new `tests/desktop/newwar.js`: in the real app `prompt()` throws "prompt() is and will not be supported.", New war through the form creates "vs Foes Guild".
- **Not tested:** on the owner's Windows PC (needs the new release); Firebase with two guildmates reading at once (the
  lock is per page).

**Open:** two guildmates' apps could still both start the same war at the same moment (each page has its own lock); the
second one would be visible as a duplicate and can be removed with Undo.

---

## 2026-11-13 · #39 · Guild War on both sides: fortress names from the overview, our side, beaten defenders · this commit (previous: `82023db`)

**Asked for:**
- The owner sent our side's overview and its three fortress maps: "from left to right is domino (middle tower is iggy),
  crown (middle tower is lucky) and log fortress".
- "these positions can change anytime depending in the guild leader".
- "the last one is a enemy player fullscreen from guild war" (2000×1070).

**Findings (the owner's screens, checked on this machine before writing code)**
- **Fortress names are per side (and war):** ours Domino / Crown / Log, the enemy's Stinger / Darkwood / Vortex. #38's
  built-in names were wrong for our side, so names are now read from the overview.
  - Which side the overview shows: the shield/swords switch at the bottom right, where the map's pager is. Left half
    lit = our side.
  - Names: the label band read four ways (grey 2×/3×, white letters at two thresholds). Each pass missed a different
    name; together they read all six, wide and 16:9. The name's position gives left / middle / right.
- **Badge ring = health:**
  - red = enemy, green = ours, all grey = beaten. Domino "2/9": exactly 2 green badges.
  - A nearly beaten defender keeps a short arc (one defender: 21% red), so ≥ 4% colour = standing.
  - The #38 rule (needs ≥ 15% red) missed every beaten and every own badge.
  - New rule: dark disc + a bright symbol in the middle (≥ 40% light; all 27 badges 0.44–0.88, snow ≤ 0.33) + an even
    ring (spread ≤ 35: badges ≤ 24, name labels that also looked like a disc 49–64).
  - Result: every badge on all six maps (Domino 8, Crown 9, Log 9, Stinger 9 twice, Darkwood 9; keep apart), no false
    hit on maps, side right on all six. Other screens give 0–2 hits but have no pager pill (maps ≥ 163, others ≤ 64).
- Positions can change (owner): nothing relies on fixed places; badges are found wherever they are.
- **Enemy defense panel at 2000×1070:** pinned to the LEFT edge (patch match offset 0 px; 48 px if centred). The season
  log is pinned right. Read on the real screen: 3/6 heroes sure (Lionheart Cermia, Kawerik, Frieren), the same as at 16:9.

**Changed**
- `js/gwmap.js`:
  - `findBadges` (symbol + even ring; `state` enemy / ours / beaten) and `sideOf`
  - `toggleSide`, `fortNamesFromWords`
  - `DEFAULT_FORTS` ("Left/Middle/Right fortress") until the overview is read
- `js/vision/readers/guild-overview.js` (new):
  - overview → `guild:forts {side, names}` and `localStorage['e7-gw-forts']`
  - read again only when a name is missing, the side changed, or after a minute
- `js/vision/hub.js` `ocrWords(canvas)` (words with positions).
- `js/vision/readers/guild-fortress.js`:
  - side from ring colours (else the last overview), the fortress name for that side, each player's `state`
  - `guild:fortress` carries `side`
- `js/layouts.js`: `gwName` / `gwDef1..6` anchored left only (verified); new `gwFortNames` (the label band).
- Guild War page:
  - fortress names read on the overview are kept on the war (`war.forts`, shared)
  - the fortress filter and the target editor's suggestions use them
  - a map of our side → **Save as our <fortress>**: `war.ourForts[<fortress>] = [{name, keep, state}]`, new names added
    as members
  - War tab "Our side" card (✗ = beaten when read)
  - beaten defenders shown dimmed with ✗ in the panel
  - known names for matching include members
- Fixtures (all player names replaced by made-up ones, including the owner's own in-game name; guild names, the notice
  and the season log blurred):
  - `steam-gw-map-ours-domino-wide.jpg`, `steam-gw-map-ours-crown-wide.jpg`, `steam-gw-map-ours-log-wide.jpg`
  - `steam-gw-overview-ours-wide-blurred.jpg`
  - `steam-gw-enemy-wide.jpg` (player name, rank and season log blurred; heroes kept)

**Tested**
- `npm test` **111**:
  - synthetic red / green / grey badges → enemy / ours / beaten, and a dark blob without a symbol is rejected
  - `sideOf`, the switch, fortress names from the real OCR words of both overviews (wide and 16:9)
  - left-only anchor
- `gw-fortress.e2e.js`:
  - enemy overview → "Stinger · Darkwood · Vortex" kept on the war
  - Stinger map → "Stinger Fortress", 0 beaten, 6/10 names exact; saved under Stinger, and the filter offers the read
    names
  - our overview → "Domino · Crown · Log"
  - Domino → side ours, 6 beaten, 8/9 names exact; saved as ours (9 members added, "Our side" card)
  - Crown: ours, 3 beaten, 6/10 exact. Log: ours, 3 beaten, 8/10 exact
  - Darkwood 16:9: "Darkwood Fortress", 8/10 exact
  - the overview is not taken for a map
  - title bar 18 rows
  - real wide enemy screen: 3/6
- Browser suite **25/25** clean.
- **Not tested:** the desktop app on the owner's PC.

**Open / assumptions**
- The keep's health / beaten state isn't read (its badge is different).
- "Beaten" is only shown; marking targets cleared from it is on the roadmap.
- In-battle badges (crossed swords, "Battle in Progress") count as standing.

---

## 2026-11-13 · #38 · Any window size; Guild War fortresses (which fortress, its defenders) · this commit (previous: `58b9ec4`)

**Asked for:** the owner confirmed the overlay now works (badge visible, Overlay status "following the game window at 0,0
(2560×1392)"), then: "make it work at any window size, since i have to sometimes take a screenshot using the windows
snippet and that might not be accurate, also for the guild wars dont forget that there are 3 different defence areas on
each side of the war … each place has its own set of player" (+ the overview and the three fortress maps from a
maximized window, 2000×1070).

**Findings**
- The owner's maximized window is **not 16:9** (2560×1392 with title bar).
  - The old title-bar rule only worked for 16:9 windows, so the title bar stayed in the picture.
  - `layoutFor` returned nothing for other shapes, so **no built-in position was used at all** on the owner's PC.
- **How the game adapts to a wider window** (pixel-checked: the owner's 16:9 and 2000×1070 shots of the same screens,
  patch matching): everything scales with the window **height** and is pinned to the **left edge, the middle or the
  right edge**.
  - Left: title, Havoc bar, guild emblems, bottom-left buttons (offset 0 px as 'l').
  - Right: menu, shield/swords, fortress pager (0 px as 'r').
  - Middle: fortress map, player icons, the three fortresses (0 px as 'c').
- **Title bar from the pixels:**
  - Title-bar rows are ≥ 0.96 one colour and take the window's colour, never black, ending abruptly.
  - The game's own top band can be PURE BLACK (RTA screens) and must be kept.
  - On all 33 screenshots the owner has sent, only the two with a title bar were cut (18 rows); every game-only
    picture was left whole.
- **Fortresses:**
  - All three use the same castle picture; which one is open is the white pill in the bottom-right pager (left /
    middle / right).
  - 10 defenders each (9 + the keep, whose locked badge is at the same spot in all three).
  - Each defender has a dark round badge (house/tower symbol, red ring for the enemy) with the name below it at a fixed
    offset.
  - The owner's earlier 16:9 "map2" is Darkwood.
- **Badge finder:** measured rule, on a copy scaled to 1070 px high:
  - dark at 0.8 r and 0.9 r, mean brightness at 0.9 r ≤ 65
  - ≥ 15% red on the rim, not dark just outside
  - Result: all 9 on the wide Stinger map, on the 16:9 copy of it and on 16:9 Darkwood. The reader also needs a clear
    pager pill (contrast ≥ 100; maps 174), because other screens give a few hits.
- **Names:**
  - OCR of the whole map is useless (3 of 10, garbled).
  - Per badge: crop the name box, keep white letters only, cut to the letters around the middle, read one line.
  - Real Stinger map: 6/10 exact, 2 close (one letter off; a stray ending), 2 wrong. (Player names removed from
    this entry in DEVLOG #56: the repository is public.)
  - So the names are shown editable, matched to names you already have (small edit distance), and corrections are
    remembered.
- Screen signatures: the wide map scores 0.978 against the 16:9 one when taken from the middle 16:9 part (0.924 when
  squeezed).

**Changed**
- `js/frame.js` (new, pure): finds the game inside a window / screenshot.
  - `js/game-area.js` `windowFrame`: window capture at any size. Detection runs on a ≤1000 px copy, when the size
    changes and every 3 s; the old 16:9 rule is the fallback.
  - The result goes to `localStorage['e7-window-frame']` so `overlay.html` lines up.
- `js/layouts.js`:
  - every region has an anchor; `place`, `layoutFor` (any shape 1.2–2.6) and `alternatives` (unverified anchors)
  - Guild War defense panel `l` with `c` as alternative; RTA anchors guessed from position (pre-bans `c` with `l` as
    alternative, my picks `l`, opponent picks `r`)
  - new `gwFortPager` (right) and `gwKeepName` (middle)
- `js/screens.js` `refCrop`: screen signatures from the middle 16:9 part (`js/screen-watch.js`, `js/vision/hub.js`).
- `js/vision/readers/guild-defense.js`: reads every placement offered and keeps the one recognising the most heroes.
- `js/gwmap.js` (new, pure): badges, name boxes, letter mask/span, `cleanName`, `matchName`, `pagerIndex`, `FORTS`.
- `js/vision/readers/guild-fortress.js` (new):
  - fortress map → `guild:fortress {index, fort, players:[{name, raw, known, x, y}], keep}`
  - same map seen twice before the names are read; enemy (red) badges only
  - `js/vision/hub.js` `ocr(canvas, {line})` gives the one-line text mode
- Guild War page:
  - "Seen in game: <fortress>" with editable names (✓ = already known) and **Save as this war's <fortress>**
    (`GuildApp.saveFortress`): creates/updates this war's targets with `tower` = fortress and `keep`
  - corrections → `e7-gw-name-fixes`; known names → `e7-gw-known-names`
  - War tab: fortress filter, cards sorted Stinger → Darkwood → Vortex, "Defense not scouted yet" for players without
    teams
  - the target editor's Tower field is now "Fortress" with the three names suggested
- Fixtures (player names replaced: real names blurred out, made-up names drawn in the game's style, same spots):
  - `steam-gw-map-stinger-wide.jpg` (2000×1070) and `steam-gw-map-darkwood.jpg` (1228×691)
  - `steam-gw-overview-wide-blurred.jpg` (guild names blurred)
  - `steam-window-titlebar-lobby.jpg`: the owner's lobby with its title bar; the owner's in-game name and a coupon code
    blurred
  - Made with Pillow + DejaVu Sans on this machine (no outside source).

**Tested**
- `npm test` **110**. New `tests/frame-gwmap.test.js`: title bar cut / black band kept / plain area kept; badges found on
  a wide and a 16:9 map and not on a plain dark blob; pager thirds; real OCR outputs cleaned and matched; letter span.
  `layouts.test.js` replaced the "16:9 only" test with anchored placement at 2000×1070 and 1600×1200.
- New `gw-fortress.e2e.js`:
  - Stinger (wide): "Stinger Fortress", 9 defenders + keep, 6/10 exact made-up names; one corrected in the panel → Save
    → 10 targets in Stinger, keep marked, fortress filter Stinger 10 / Darkwood 0, fix remembered
  - Darkwood (16:9): "Darkwood Fortress", 8/10 exact
  - wide overview: not read as a map
  - title bar in the lobby screenshot: exactly 18 rows
  - enemy defense on a 2000×1070 picture with the panel pinned left or centred: 3/6 both, the same as at 16:9
- Browser suite **25/25** clean.
- Before writing the code, checked on the owner's real (unredacted) screenshots on this machine only: badges 9/9 on
  three maps, pager on Stinger/Darkwood, names as above, frame detection on all 33 screenshots.
- **Not tested:** the desktop app on the owner's PC at 2560×1392; RTA screens at a wider window (no screenshots); our own
  side's fortress maps.

**Open / assumptions**
- Narrower-than-16:9 windows are assumed to scale with the width, centred vertically (not seen yet).
- A loose Snipping Tool box (extra desktop around the game) isn't detected; positions then shift by that margin. Snip
  close to the game, or use the app's own capture.
- Korean / other-script names can't be read by the English OCR; type them once and the fix is remembered.

---

## 2026-11-13 · #37 · Desktop-only: web keeps only Guild War for guildmates; Steam / Discord overlay safety · this commit (previous: `9588219`)

**Asked for:** "lets move away from a browser version and use a proper desktop one with a proper overlay, also beware of
steam own overlay and maybe even discords". Owner's choices: keep a web Guild War page for guildmates; drop the phone
version (website + My devices sync) for now.

**Findings**
- Steam's and Discord's overlays are **injected into the game** and draw inside its window. That's why they work in
  exclusive fullscreen, and also why our window capture **sees them**.
  - The Steam overlay (Shift+Tab) covers the whole game.
  - Notifications and Discord's voice widget sit in a corner and can cover a hero icon for a few seconds.
- Our overlay is a separate topmost, click-through window. That is the safe way: injecting like Steam/Discord would mean
  touching the game process (against the project rule, and an anti-cheat risk). It also means exclusive fullscreen can't
  be used: play borderless.
- Shortcuts: ours (Ctrl+Shift+O/E/S) don't clash with Steam's defaults (Shift+Tab, F12).
- Our overlay has content protection, so it doesn't appear in Discord screen sharing / OBS.
- Old browser data: RTA notes etc. saved in a browser on the web address would become unreachable once that page is gone,
  so the old addresses now offer **Save my RTA data** (the same file as RTA → Data → Export).

**Changed**
- Web (GitHub Pages, `.github/workflows/pages.yml`) publishes **only** `guild.html`, plus:
  - `css/`, `js/`, `icon.svg`, `firestore.rules`, `docs/GUILD_SETUP.md`
  - the retired `sw.js`
  - `tools/web/moved.html` as `index/rta/gear/live.html`: "Epic 7 Engine is a desktop app now", Save my RTA data when
    old data is there, otherwise on to Guild War
- `guild.html` in a normal browser (no `E7Desktop`):
  - `html.web-guild` hides `.desktop-only`: the RTA/Gear/Live links, Watch game, Set name box, Reset game area and
    "This is the enemy screen"
  - shows **Get the desktop app** (latest release)
- Offline web app removed:
  - `manifest.webmanifest` and the manifest links / service-worker registration on every page
  - `sw.js` is now a kill-switch: it deletes its caches, unregisters, and reloads open pages
- **My devices sync removed:** `js/mysync.js`, `js/mysync-app.js`, its tests, the home card, the RTA reload hook, the
  report section, the `personal/` Firestore rule and the SOURCES row (6b). Data already synced stays in your Firebase
  project until you delete the `personal` collection there; redeploy `firestore.rules` to close access.
- Guild War defense reader: publishes only when **two reads in a row agree** (Steam/Discord notifications sliding over
  an icon), and reads every 1.5 s instead of 2.5 s to keep it quick.
- Home page text for the desktop app. Docs: README (desktop app, guildmates' web page), `desktop/README.md` (Steam/Discord
  section), CLAUDE.md, HANDOFF, ROADMAP (covered-screen detection needs screenshots; one-window app; phone companion later).

**Tested**
- `npm test` **104** (mysync's 7 tests removed with the module).
- New `web-guild.e2e.js`:
  - builds the site with the workflow's own commands → files: css docs firestore.rules gear guild icon index js live rta sw
  - an old offline-app install is cleared (0 registrations, 0 caches)
  - the web Guild War bar shows "Epic 7 Engine · Guild War · Get the desktop app", with no game-reading buttons
  - `rta.html` without old data → Guild War; with old data → Save → the file imports into the app's RTA page (note
    "old browser note" back)
- Browser suite **24/24** clean, including `gw-defense` and `teach` with the two-reads rule.
- Two tests were updated for the new behaviour: `home-modules` now checks the guildmate view of `guild.html` in a plain browser
  (no home/RTA links, "Get the desktop app" shown); `teach`'s helper clears the reader's note so it reads twice.
- **Not tested:** real Steam/Discord overlays (no Windows/Steam here); the live Pages deploy (runs on push).

**Open:** screenshots from the owner of the Steam overlay open and of a Discord widget/notification over the game →
"covered" screen detection, and hide our overlay while the Steam overlay is open.

---

## 2026-11-13 · #36 · Remove test screenshots committed by mistake · this commit (previous: `6999f86`)

**What:** #35 accidentally committed `undefined/` (three screenshots of the app's own test windows, written by
`tests/desktop/popout.js` and `winpick.js` when no output folder was passed). Removed. Those tests now default to
`tests/desktop/out/`, which is git-ignored.
**Tested:** `node --check` on both tests. Nothing else changed.

---

## 2026-11-13 · #35 · Overlay: never stuck hidden + "is it working?" status; Teach heroes (your own face examples) · this commit (previous: `64a8e03`)

**Asked for:** "also the overlay still does not work"; "where are you saving the images, and make a system where the user
can train a model too manually if it helps"; whether to play in fullscreen windowed instead (answered in chat: any 16:9
size works because every position is a fraction of the game picture; bigger = sharper icons; use borderless/windowed
fullscreen, not exclusive fullscreen; no second model needed).

**Findings (overlay)**
- In window mode on Windows the overlay was **hidden until the PowerShell window tracker reported the game window's
  position**. If that tracker never answered, the overlay stayed hidden for good, and the test card was drawn into a
  hidden window. Nothing recorded why: PowerShell's error output was thrown away.
  - Likely causes on a real PC: antivirus / AMSI blocking an *encoded* PowerShell command that compiles Windows API
    calls (a pattern malware uses), or PowerShell restricted by policy.
- The "game is in front" check only accepted the exact captured window handle. If the game's active window is another
  window of the same process, the overlay hid itself as if another program were in front.
- The start-up "✓ overlay" badge was shown when the page loaded, often while the window was still hidden, so it was
  never seen.

**Changed**
- `desktop/wintrack.js`:
  - the script is written to `<userData>/e7-wintrack.ps1` and run with `-File` (the encoded command is only a
    fallback)
  - stderr and the exit code are kept; a failure is reported once as `{ failed: text }`
  - any window of the game's process counts as "the game is in front"
- `desktop/main.js`:
  - if the tracker fails, or sends nothing within 5 s, the overlay is **shown over the game's display** (lines up exactly
    in borderless fullscreen) and the reason is kept; the tracker is retried at most once a minute
  - the overlay is created hidden and shown once its position is known; the "✓ Epic 7 Engine overlay" badge is sent the
    first time it really appears
  - new menu item **Overlay → Overlay status (is it working?)…** explains in plain words why it is or isn't visible
  - new IPC `e7:overlay-status` (`E7Desktop.overlayStatus()`)
  - test switch `E7_TEST_WIN=1` (behave as on Windows; tests only)
- The **Live page** shows "Overlay now: visible / not visible · why", refreshed every 2 s. The **Copy report** text has
  an `overlay:` line (on, visible, mode, tracking, fallback, bounds, game window, tracker error).
- **Teach heroes** (Live page; `js/teach.js` store + `js/teach-ui.js`):
  - open a picture file, a saved game picture, or paste one with Ctrl+V
  - drag a square around a round hero icon; the tool shows what the app currently thinks it is (official portraits plus
    every example you have, with source)
  - type the name → **Add**: the face is aligned to that hero's portrait (best of the small shifts, so a sloppy box
    still works) and stored with a 48 px thumbnail
  - library per hero with × to forget; a switch "Use the faces I taught"; Export / Import (.json) for backup or for
    sending them to Claude to build in
  - the other example stores are listed separately: RTA corrections (managed on RTA → Auto) and Guild War icon names
    (with Forget)
  - storage: `localStorage['e7-face-examples']` = `{ on, examples: [{id, code, q, thumb, from, at}] }`, at most 12 per hero
    and 500 in total, source label **'taught by you'**, kept apart from the other stores
  - it's **example-based learning, not neural-network training**: each example is one more face for the matcher to
    compare against, so it works from the first example
- Readers use taught faces: RTA (`activeFaceTemplates` in `js/auto.js`: pre-bans, CR bar, face-matched slots) and
  Guild War defense (`js/vision/readers/guild-defense.js`).
  - `RTAFaces.classify`'s `preferSource` now also takes a list: your corrections and taught faces both get the small
    tie-break bonus.
  - Pick banners still use their own matcher and are taught via RTA → "Name the heroes on this picture".
- `js/mysync.js`: new section `face-examples` (merged by id). `rta.html`, `live.html` and `vision.html` load
  `js/teach.js`; `sw.js` v26. `.ok-text` style.

**Tested**
- `npm test` **111**. New:
  - `tests/teach.test.js` (store, per-hero cap, switch, export/import with bad thumbnails refused, listeners)
  - tracker tests with a fake PowerShell: `-File` used, positions parsed, failure text including stderr reported once,
    nothing after `stop()`, spawn failure
- New `tests/desktop/overlay-status.js`, run on the Electron app from source:
  - screen mode: overlay visible, badge shown, Live page "visible · covering the whole display"
  - window mode as on Windows (`E7_TEST_WIN=1`), where PowerShell can't run here (like a blocked PowerShell): before,
    the overlay stayed hidden; now visible over the display
    - Overlay status, Live page and report all say "PowerShell could not start: spawn powershell.exe ENOENT"
    - Live → "Show a test card" draws on it
- The 8 older desktop tests pass on a rebuilt Linux package (overlay test card, watcher, RTA follow, pop-outs, zoom, dev
  screenshots, cancel, window picker).
- Browser suite **24/24** clean. New `teach.e2e.js` on the real Guild War enemy screen:
  - the defense reader is unsure of icon #1 (guess "Closer Charles" 0.63)
  - a real mouse drag of a deliberately sloppy square (4 px off, 6% too big) → guess shown → typed a name → Add
  - the tool now says "recognises this as … taught by you"; the reader goes from 3/6 to **4/6** with that icon sure
  - switch off → back to the old guess; × → forgotten
- **Not tested:** the real Windows tracker (no Windows here). The owner's report (Overlay → Overlay status, or the
  `overlay:` line in Copy report) will say whether it was failing and why.

**Open / assumptions**
- The fallback covers the whole display. If the game runs in a normal window (not borderless fullscreen), overlay items
  won't line up with the game while the tracker is failing.
- An antivirus that blocks the `-File` script too would need an allow-rule. The status text shows the error to look for.

---

## 2026-11-13 · #34 · Guild War from real screens (name, defense teams, learning) + portrait cache bug fixed · this commit (previous: `f681cdb`)

**Asked for:** the owner moved to testing Guild War and attached five real Guild War screens as files (overview, two
fortress maps, an enemy's defense with season log, a defense battle result). Questions about fullscreen / resolution are
answered in chat.

**Findings (real files, 1228×691)**
- **Enemy name** with a built-in box (no "Set name box"): OCR read the real name (88%), exactly right.
- **Defense teams:** six round icons. The top-right badge here is the **level ("60", coloured), not the element**, so only
  the class symbol may narrow candidates.
  - Kawerik (0.89), Frieren (0.88) and Lionheart Cermia right; the other three unsure (skins / other art), never wrong.
  - With the class filter the reader reports **3/6** sure. After one name typed for an unsure icon: **4/6** and that icon
    sure next time.
- Screen signatures: Guild War screens are well separated from each other and from the RTA ones (highest cross-screen
  similarity is still RTA menu ↔ match found, 0.81).
  - Two different fortress maps only match each other at 0.76, so another fortress (and the enemy screen in front of it)
    may not be recognised. The Guild War readers therefore **don't require** recognition: they skip only screens that
    are certainly something else, and the defense reader needs ≥ 2 sure heroes.
- **Bug (would have hit the real app): portraits for face matching could be refused.** The portrait server
  (CloudFront) only adds `Access-Control-Allow-Origin` when asked with an Origin and doesn't send `Vary: Origin`. So a
  copy cached from a normal `<img>` (the RTA / Guild War pages show portraits) can't be read for pixels later ("blocked
  by CORS"). In the desktop app all windows share one cache, so readers could end up with **no portraits at all**. That
  alone would make pre-bans unrecognisable (the owner's RTA report).
  - Fix: `RTARoster.PORTRAIT_URL_CORS` (`?cors=1`, a separate cache entry that always carries the header), used by
    every pixel-reading load (RTA reader, Guild War defense reader, tests).
  - Found by `live-gearscan-overlay.e2e.js` failing once the Live page loaded portraits after the Gear page had shown
    them.

**Changed**
- Fixtures:
  - `steam-gw-enemy.png` (enemy name and season-log names blacked out; icons sharp).
  - `steam-gw-overview / map1 / map2 / battle-blurred.png`: blurred so no name is readable; the 32×18 signatures are
    unaffected.
- `js/screens.js`: new screens `gw-overview`, `gw-map`, `gw-battle`. `tools/make-screen-refs.js` → built-in signatures
  for them and `gw-enemy`.
- `js/layouts.js`: built-in `gwName` and `gwDef1..6` (pixel-measured on the 1228×691 file).
- `js/vision/readers/guild-name.js`: your box, else the built-in one; skips screens that are certainly not the enemy
  screen.
- `js/vision/readers/guild-defense.js` (new):
  - loads the portraits in the watcher, reads the 6 icons (face matcher, wide alignment search, class-only filter, plus
    your Guild War corrections)
  - publishes `guild:defense` when ≥ 2 are sure and again when what's seen changes, with each icon's compact face
- Guild War page (`js/guild-watch.js`, `js/guild-app.js`):
  - "Seen in game: Round 1 … · Round 2 …" with **Save as …'s defense**, which opens the editor for that player (existing
    or new) with the sure heroes filled in
  - on save, every icon the app wasn't sure of (or got wrong) plus the hero you typed is stored in
    `localStorage['e7-gw-face-corrections']`, so it's recognised next time
  - Watch game no longer forces "Set name box"
- `vision.html` / `live.html` load roster, faces, layouts, class templates and the new reader. `sw.js` v25.

**Tested**
- `npm test` 104.
- Browser suite **23/23** clean. New `gw-defense.e2e.js` on the real enemy screen:
  - reader "Defense: 3/6"
  - the Guild War page shows the seen teams
  - the editor is prefilled with Lionheart Cermia, Kawerik, Frieren
  - typing one name → learned 1 → read again: 4/6, that icon sure
- **Not tested:** the name reader inside the full app on a real screen (the fixture's name is blacked out; checked
  separately on the original: read exactly), other fortresses, the desktop app on Windows.

**Open:** read the fortress maps (enemy names under the avatars) to list a fortress's defenders; read battle results to
log attacks.

---

## 2026-11-13 · #33 · Match review: what the app saw, per match · this commit (previous: `8017eef`)

**Asked for:** "its seems even when starting the match the prebans arent even detected and nothing goes forward, is there a
way to check per match all the correct things the app sees".

**Findings**
- The pre-ban row on the draft screen is the one built-in position never checked against a real **file** (the BAN
  screen file doesn't show it; the picking-phase screens only came as chat images). So the pre-ban boxes may be off.
- "Nothing goes forward" for picks is also expected until their banners are named once (DEVLOG #31/#32).
- What's needed: per match, see **where** the app looked and **what** it saw, and get the pictures out as files.

**Changed**
- `js/matchtrace.js` (new, `E7Trace`, tested): per-match record in `localStorage['e7-match-trace']` (newest 15 matches,
  200 events each): timeline events (repeats collapsed) and the latest snapshot of every slot.
- `js/auto.js`:
  - `note()` writes to both the diagnostic log and the match timeline: match found / start, first pick, draft screen
    found, status changes (e.g. "0 of 4 recognised"), slot confirmations with scores, picker pre-bans, board picture,
    result, CR teams, names given.
  - Every 5 s while live: a snapshot of each slot (guess, score, sure, confirmed, source, badges).
  - While the draft is open: a picture every 20 s (up to 6) tied to the match. Match-start and board pictures are tied
    too (`draftId`).
- RTA → Auto, new card **Match review: what the app saw**:
  - choose a match (time · result vs opponent)
  - its pictures with **Show with boxes** (the alignment view on that picture), **Name heroes**, **Download** (a .jpg
    file to send to Claude)
  - a slot table and the timeline
  - **Copy this match for Claude** (the diagnostic report with this match's slots + timeline)
- `js/pictures.js`: pictures can carry `draftId`; keeps the newest 60.
- Diagnostic report: a "This match" section and the **desktop app version** (`E7Desktop.version()`).
- `sw.js` v24.

**Bugs found and fixed while building:** a blind replace turned the log call inside `note()` into a call to `note()`
itself (endless loop). Caught by reading the result before running; fixed.

**Tested**
- `npm test` 104 (matchtrace: 2 new).
- Browser suite **22/22** clean. New `match-review.e2e.js`:
  - timeline with the repeat count, slot table, the real BAN picture
  - Show with boxes → alignment view at 1340 px
  - Download → `epic7-draft-screen-1-….jpg`
  - Copy → text with slots + timeline
- Desktop `rta-follow.js` still passes ("waiting for the RTA draft screen (… 0 of 4 recognised)").
- **Not tested:** a real match (the owner's next match fills it).

**Open:** with one downloaded picking-phase picture, the pre-ban positions can be made exact.

---

## 2026-11-13 · #32 · Name the heroes after the match, teams from the CR bar, "is the overlay working?" · this commit (previous: `684dd4d`)

**Asked for:** "yes do both" ("label this draft after the match" + reading the CR bar to confirm teams), "and how to get the
overlay and is there a way to know when its working".

**Changed**
- **Name the heroes on a saved picture** (`rta.html` dialog `#label-dlg`, `js/auto.js` `openLabel` / `saveLabels`):
  - Saved-picture chooser → "Name the heroes on this picture" shows every pre-ban and pick slot of that picture (crop +
    name box). Guesses the app is sure of are prefilled; unsure ones show as "maybe X".
  - Saving adds each name as a "my corrections" example (and a face example for round slots). That hero's banner is
    recognised by itself from then on. Optionally the names become the current draft.
- **A picture of the draft board is saved once per match** when the BAN screen shows (built-in `rta-draft` signature), so
  there's always one to name after the match.
- **Teams from the CR bar** (`scanCRTeams`, button "Read teams from the CR bar"):
  - Slides along the calibrated CR bar (step 1/6 of the icon size), quick check then the face matcher with the wide
    alignment search; keeps confident faces.
  - Side from the ring colour (red = opponent).
  - Saved on the draft as `crTeams` (kept when the draft updates). `matchFromDraft` uses them for picks the draft is
    missing (`teamsFrom: 'cr bar'`).
- **Is the overlay working?**
  - `overlay.html` shows a "✓ Epic 7 Engine overlay" badge for 6 s when it starts (desktop).
  - Desktop menu **Overlay → Show a test card** and Live → **Show a test card on the overlay** put a card on it for 5 s.

**Bugs found and fixed:** the first CR scan moved 1/3 of an icon per step, so icons sitting between two windows (8 px
off) were missed. Now 1/6 of an icon plus the wide alignment search.

**Tested**
- `npm test` 102. Browser suite **21/21** clean. New:
  - `rta-label.e2e.js` on the **real BAN screen**: 14 slots offered; two named (my pick 1, opponent pick 2) → 2
    corrections; reading the screen again → exactly those two confirmed "(my corrections)", the other 8 picks still
    unconfirmed. On a CR bar made from real portraits (white / red rings): you Stark + Aram, opponent Frieren + Robin.
    Correct.
  - `overlay-test.e2e.js`: Live → test card appears on the overlay with the badge, gone after 5 s.
- Packaged desktop app, new `tests/desktop/overlay-test.js`: badge at start, test card on the real overlay window,
  window visible.
- **Not tested:** the CR bar on a real battle screen (no battle file yet; the ring colour rule comes from the owner's
  chat screenshot).

---

## 2026-11-13 · #31 · Real RTA screens as files: built-in recognition of 6 screens, First Pick read, banners can't match portraits · this commit (previous: `50aa89a`)

**Asked for:** "how do i send the screenshots as files", then the owner attached five real Steam screens as files
(menu, "Here comes a new challenger!", match start, pre-ban picker with 2 selected, BAN screen).

**Changed**
- `tests/fixtures/screens/`: `steam-rta-menu`, `steam-rta-match-found`, `steam-rta-match-start`,
  `steam-rta-preban-select2`, `steam-rta-ban` (1340×754, the game picture; the owner's name and guild name blacked out).
- `js/screens.js`: new screen `rta-found` (match found).
- `tools/make-screen-refs.js` → `js/sources/screen-refs.js`: built-in signatures for **rta-lobby, rta-found,
  rta-intro, rta-preban-pick (×2), rta-draft (BAN screen)**.
  - Pairwise similarity: everything ≤ 0.42 except the two pickers (0.95: the same screen at another moment) and
    menu ↔ match found (0.81: the found banner over a darkened menu, below the 0.82 threshold + margin).
- `js/auto.js`:
  - **Match found** starts a new match (the earliest signal). Match start within 20 s is the same match: it saves the
    profile art and reads First Pick.
  - The built-in draft-board signature keeps the draft gate open.
  - Test hooks `_readFirstPick`, `_pickerPrebans`.
- New `tests/e2e/rta-real-screens.e2e.js`.

**Findings (real files, nothing taught)**
- Screens recognised: **7/7** (menu, found, match start, both pickers, BAN screen; Victory → none, as it should be).
- **First Pick** (OCR word position on the match-start screen): read **opponent**. Correct.
- Pre-ban picker, selected heroes: 1/2 confident (**Lady of the Scales**); the other stays unsure.
- The by-eye built-in pick boxes sit on the heroes on the real BAN screen, and the selected-pre-ban boxes on the real
  picker.
- **Pick banners cannot be matched to the official portraits.** The banner is a different crop of the art. Old matcher:
  all 10 slots unsure at 0.45–0.69, so nothing wrong is confirmed. Face matcher with a size/position search: 0.65–0.78
  with tiny leads and wrong-looking names (Kawerik ×3).
  - Way forward: **learn banners from corrections**. Each hero's banner never changes, so one correction per hero
    (click the slot → type the name) is remembered for good; the element + class badges on the banners can narrow
    candidates once their positions are added.
  - Alternatively: the battle CR bar and the result screen use **round** icons, which the face matcher reads well.

**Tested:** `npm test` 102; RTA browser tests clean; `rta-real-screens.e2e.js` as above.

**Open:** banner badge positions; a "label this draft after the match" flow on a saved BAN/Ready picture, so the
corrections can be made without time pressure.

---

## 2026-11-13 · #30 · Match start (versus / profile art), First Pick, RTA menu, pre-ban picker recognised without teaching · this commit (previous: `844cfea`)

**Asked for:** "maybe you should also log the profile art that plays at the very start and this can be a way to know
when a match is starting". Screenshots of the RTA menu, the match-start screen, the pre-ban picker with 2 selected and
the BAN screen followed, all pasted in chat (not files).

**Findings (from the screenshots)**
- **Match-start screen:** both profile arts, a big "VS.", rank tiers, and **"First Pick"** under the side that picks
  first. That's a clean "new match" signal and tells who picks first.
- **RTA menu (World Arena, Find Opponent):** this is where the wrong heroes of DEVLOG #29 came from. Seeing it means the
  draft is over.
- **Pre-ban picker with selections:** "Selected Heroes (2/2)" shows your two pre-bans with element + class badges at the
  bottom middle. That's also the screen where pick positions would land on the face grid.
- **BAN screen:** each pick banner has element + class badges at its top end (positions differ per slot). Kept for
  later.

**Changed**
- `js/screens.js`: new screens `rta-lobby` (RTA menu), `rta-intro` (match start), `rta-preban-pick` (pre-ban picker).
- **Built-in screen signatures:** `tools/make-screen-refs.js` (new) → `js/sources/screen-refs.js` (generated) from the
  real picker file. `js/screen-watch.js` detects with built-in + taught signatures (built-in ones are not used for
  gating). The picker is recognised **without teaching**.
- `js/auto.js`:
  - **Match start** (taught `rta-intro`):
    - a new match begins (a complete previous draft is kept as pending); old slots are forgotten
    - the draft gate opens for 5 minutes, so it no longer depends only on recognising pre-bans
    - the profile art is saved as a picture ("match start (profile art) · draft …"), and it's logged
    - **First Pick** is read by OCR (bottom strip, word positions: left = me, right = opponent) and sets the draft's
      first pick
  - **RTA menu** (taught `rta-lobby`): closes the draft gate at once.
  - **Pre-ban picker:** draft slots are never read there; your 2 selected pre-bans are read (face matcher + badges,
    built-in boxes `myPrebanPick1/2` measured by eye) and logged / shown.
  - A newly loaded screenshot clears the slot results.
  - New `ocrWords` (words with x positions).
- **Teach a screen from a saved picture** (saved-picture chooser → "this picture shows…"), for screens too quick to
  teach live (match start). RTA → Auto → Screens has the new screens too.
- `js/layouts.js`: `myPrebanPick1/2`. `sw.js` v22. ROADMAP: banner badges.

**Tested**
- `npm test` 102.
- Browser suite 18/18 clean:
  - `rta-layout.e2e.js`: the **real pre-ban picker file is recognised as `rta-preban-pick` with 0 taught screens** and 0
    confirmed slots; the real Victory file is not taken for the picker
  - `rta-pictures.e2e.js`: teaching `rta-intro` from a saved picture works (1 example); match start replaces a
    14-action draft with a fresh one (new id)
- **Not tested:** First Pick OCR (no match-start file), the selected-pre-ban positions (by eye), the menu and
  match-start screens (must be taught once from a saved picture: Developer → Collect screenshots, or Ctrl+Shift+S, then
  "this picture shows…").

**Open:** with files of the match-start and menu screens, their signatures can be built in like the picker's (no
teaching). Pick-banner badge positions need a draft file.

---

## 2026-11-13 · #29 · Fix "everything wrong" (draft gate), element colour + class symbol, diagnostic report · this commit (previous: `b49c3bc`)

**Asked for** (several messages):
- "for the heros your can learn it by coloour since the icons are always their for them"
- "currently its taking everything wrong" (screenshot of the RTA "What I see" slots)
- "for the icons you can use the colour and the symbol on the other side for rangers and thiefs and more etc"
- "make a system so that i can paste a log file to u so you have all the neccesary infiormations"

**Findings**
- **Why everything was wrong:** the owner's slot pictures showed lobby text ("Rank: 35…", "Win Rate: 45…", "7h 36m"),
  not heroes. Since DEVLOG #25 the built-in positions count as calibrated, so the reader read those positions on
  **every screen**. Before that nothing ran until boxes were drawn. Also, the old matcher's "big lead at a low score"
  rule let 34–60% guesses through for pick slots.
- **Element colour** (top-right badge: flame / drop / tree / star / moon): read correctly on 15/15 known faces of the
  real grid and plausibly on all 40.
- **Class symbol** (top-left badge: hood / bow / sword / hat / shield / swirl): learned from the 15 known faces.
  Leave-one-out in Python 14/15. In the app (browser code, cautious thresholds): 8 right, 0 wrong, 7 unsure (no filter).
- With element + class narrowing, the face matcher names **15/15** known faces confidently and correctly (was 14;
  Genesis Ras now clear), still with **0** wrong confident answers and no newly confident unknown faces.
- The small pre-ban faces on the draft screen don't seem to show badges, and the pick banners show them elsewhere
  (position unknown without a real draft file). So the badges help where present and are skipped where not.

**Changed**
- `js/auto.js`, **draft gate**:
  - While watching live (and the draft screen isn't taught), the pick/help/name/postban readers only run when ≥ 2 of
    the 4 pre-ban faces are recognised confidently, and for 90 s after; otherwise "waiting for the RTA draft screen".
  - Pick slots now need score ≥ threshold (0.72) **and** a 0.04 lead.
  - Screenshots loaded by hand aren't gated.
  - Bug found while testing: `draftSeenAt` started at 0, and `performance.now()` is near 0 right after the page opens,
    so the first 90 s counted as "draft just seen". Now `-Infinity`.
- `js/faces.js`:
  - `elementFromRGBA` / `elementAt` (badge hue bins), `elementAllow`
  - `classVector` / `classVectorsAt` / `classFromVectors` (16×16 grey symbol vs learned examples, score ≥ 0.75 and
    lead ≥ 0.10)
  - `badgesAt`, `badgeAllow` (element ∧ class, falls back to element only)
- The round slots in `js/auto.js` use the badge filter when badges are found.
- `tools/make-class-templates.js` (new) → `js/sources/class-templates.js` (generated): 15 class-symbol examples cut
  from the real screenshot with the app's own browser code.
- **Diagnostic report:** `js/diag.js` (new, `E7Diag`).
  - "Copy report for Claude" on RTA → Auto, Live, Gear, Guild War, and desktop menu Developer → Copy report for Claude.
  - Contents: app/device, capture, game area, frame keys, watcher status, taught screens, RTA settings and part status,
    matches (count + last 3), current draft, gear counts, sync/guild state, **every RTA slot** (badges, confirmed,
    best/2nd guess with score and source, box in px), the last 25 watcher events and a 300-line log.
  - The log records RTA status changes, the draft screen being found, slot confirmations with scores, results read,
    the watcher starting, and page errors.
  - **Never included:** sync key, Firebase settings, guild code.
  - Falls back to a text box when the clipboard isn't allowed.
- `sw.js` v21; all pages load `js/diag.js`.

**Tested**
- `npm test` 102 passing (element colours, class symbol rule, `badgeAllow`).
- Browser suite 18/18 clean:
  - `faces-real.e2e.js`: 40/40 element badges, class leave-one-out 8/0/7, **15/15** with element + class, 0 wrong
  - new `diag.e2e.js`: report of about 2.2 k characters with all sections and slot lines, the button says "Copied ✓",
    and **no planted secret** (sync key, API key, project id, guild code) appears
- Packaged desktop app, `rta-follow.js`, on a non-draft fake game screen: "Watching · waiting for the RTA draft screen
  (… 0 of 4 recognised)", nothing read.
- **Not tested on a real draft:** whether the built-in pre-ban positions + face matcher open the gate on the owner's
  screen. If it never opens, the diagnostic report will show why (pre-ban guesses and scores), or teach the draft screen
  (RTA → Auto → Screens) and the gate uses that instead.

**Open:** badge positions on pick banners (need a draft file). More class examples will make the class reader surer.

---

## 2026-11-13 · #28 · Step 1b part 1: the RTA reader follows the game watcher · this commit (previous: `231b7ba`)

**Asked for:** "do 2 then 1b". 2 = DEVLOG #27. 1b = move the RTA reader into the game watcher.

**Findings / decision**
- `js/auto.js` (1150 lines) is tied to the RTA page:
  - its data: drafts (`App.replaceDraft`), results, scouting, game help, opponent
  - its UI: slot list, corrections, calibration, status table
  - the overlay suggestions, which need the RTA logic
- A full move into the watcher window means rewriting that, and there is still **no real draft screenshot as a file** to
  test it on (only made-up screens). Risky for the one reader that works.
- What the owner notices from 1b is not having to start the RTA reader separately. So it's split:
  - **Part 1 (this commit):** in the desktop app the RTA reader starts and stops with the game watcher: same game window,
    same title-bar cut, no picker, no extra click.
  - **Part 2 (later, with real draft screenshots):** move the slot / postban / help / result / CR / name readers into
    `js/vision/readers/`, publishing events that the RTA page applies.

**Changed**
- `js/auto.js`:
  - `followWatcher` (via `VisionClient` status): starts the capture when the watcher is watching (desktop only;
    browsers need a click), stops it when the watcher stops.
  - Pressing Stop keeps it stopped until Start.
  - `startCapture` can't run twice at once.
- `rta.html`: loads the vision bus/client; the button is now "Start reading the game".

**Tested**
- New `tests/desktop/rta-follow.js` (packaged app, fake game window):
  - opening RTA → reading with no click, no picker
  - watcher stopped → RTA stopped ("The game watcher stopped…")
  - watcher started again → reading again
  - Stop on the RTA page → stays stopped
- `npm test` 100; browser suite 17/17; desktop watcher/popout/cancel pass.
- **Not tested:** Windows, real drafts.

**Open:** part 2 of 1b, once real draft screenshots exist (Developer → Collect screenshots).

---

## 2026-11-13 · #27 · Sync my devices (PC ↔ phone) · this commit (previous: `b6b3fce`)

**Asked for:** "Then why do we have it as a phone browser if it cant do the same thing" → option 2 "do 2 then 1b": make the
phone version worthwhile by syncing the owner's own data between PC and phone (step 1b follows).

**Design**
- The owner's own Firebase project (the Guild War one can be reused), Firestore `personal/{key}`, anonymous sign-in.
  The 36-hex random key is the secret and travels in a link; the part after `#` never reaches a server.
- Data goes in **sections** that stay separate:
  - RTA: notes, custom heroes/owned/typed speeds, Fribbels import, presets, matches (+ match sources), scouting, game
    help, meta imports, settings
  - Gear: gear.txt items, screen-read items, rules/weights
- **Not synced (per device):** current draft, pending, sim, calibration and corrections, game area, pictures, taught
  screens.
- Per section: changed here only → upload; there only → download; both → lists with ids (matches, presets, scouting,
  game help) are merged **three-way** (adds and deletes from both sides kept); anything else → newer change wins. A
  device joining for the first time takes the cloud copy (lists are merged).
- Firestore documents max out at 1 MiB, so big sections (gear.txt) are split into 700 kB chunks. Each chunk carries the
  section hash, so a half-written upload is skipped, not applied.

**Changed**
- `js/mysync.js` (new, pure + tested): `readLocal`, `applyLocal`, `mergeList` (three-way), `decide`, `syncOnce`,
  `memoryRemote`, `firestoreRemote`, `link` / `parseLink`, `newKey`.
- `js/mysync-app.js` (new): background pass 1.5 s after opening, every 30 s and when the app comes back to the
  foreground. One tab at a time (Web Locks). After data comes in, the page reloads it (`e7-synced` event; other tabs via
  the storage event).
  - **Home card "Sync my devices (PC ↔ phone)":** turn on (Guild War project or pasted config), last sync with
    ↓ ⇄ ↑ per section, Sync now, copy the link for the other device, turn off.
  - Opening `index.html#sync=…&c=…` asks, then connects that device and removes the key from the address bar.
- `index.html`, `rta.html`, `gear.html` load it. `js/app.js` and `js/gear-app.js` reload on `e7-synced`.
- `firestore.rules`: private `personal/{key}/{sections|chunks}/{doc}` (signed in, key ≥ 32 chars, doc < 1 MB).
  **The owner must publish the rules again.**
- `docs/GUILD_SETUP.md`, `docs/SOURCES.md` (6b), Home intro text, `sw.js` v19.

**Tested**
- `npm test`: 7 new tests:
  - PC → empty phone (draft and calibration stay per device)
  - matches added on both plus a delete merged, and the delete stays deleted
  - notes edited on both: newer wins
  - 6000-item gear split into chunks and rebuilt
  - half-written upload skipped
  - links
  - Firestore remote with a fake SDK: only `personal/{key}/…` paths, gear in ≥ 2 chunks, anonymous sign-in
- New `tests/e2e/mysync.e2e.js`: a PC and an iPhone-sized phone (separate storage) sharing one fake cloud.
  - The PC's gear.txt shows on the phone's Gear page (248 items).
  - The PC's match and notes appear on the phone's RTA page; a match added on the phone reaches the PC.
  - The Home card works at phone width.
  - A sync link connects a new device and the key leaves the address bar.
- **Not tested:** a real Firebase project (none exists yet), a real phone.

**Open:** the "newer change wins" rule uses when a change was first *noticed* (passes run every 30 s), so two edits of
the same notes on two devices within the same half minute can go either way. Lists with ids don't have this problem.

---

## 2026-11-13 · #26 · Phone: publish the web app from the work branch · this commit (previous: `5b3bd4a`)

**Asked for:** "How to run this on mobile".

**Findings**
- The repo only has the work branch `ccr-2c9db930-kqvr1r`, which is also its **default branch**. There is no `main`.
- `pages.yml` only deployed on pushes to `main`, so the web version had never been published.
- GitHub Pages also needs the one-time setting Settings → Pages → Source = GitHub Actions. That's the owner's to switch;
  there's no tool for it here.

**Changed**
- `.github/workflows/pages.yml`: also deploys on pushes to the work branch. The default `github-pages` environment allows
  the default branch.
- `README.md`: phone instructions:
  - the address (`https://meztking.github.io/Epic-seven-live-RTA-Helper/`)
  - Add to Home Screen on Android and iPhone
  - what works on a phone (Gear, Guild War, RTA by tapping, hero info) and what doesn't (screen reading and overlay)
  - data is per device; only Guild War syncs, via Firebase

**Tested:** workflow YAML checked; tests run in CI before deploy. **Not tested:** the deploy itself (it fails until the
owner switches the Pages source; then re-run it from the Actions tab or push).

**Open:** phone layout was checked at 390 px wide in the browser tests (no sideways scrolling on live, gear, home), not on
a real phone.

---

## 2026-11-12 · #25 · Built-in screen positions (no drawing for Steam 16:9) and a clear "what's set" table · this commit (previous: `0041c80`)

**Asked for:** "why does it say not calibrated yet, and its hard to tell what is calibrated and what is not, and this
should be a one time thing that users shouldn't have to go through" + "do the other recommended" (step 2 of the plan:
built-in layouts; step 1b is next).

**Findings**
- "Not calibrated yet" meant: all 8 draft boxes are required (4 pre-bans + first/last pick on each side). Setting other
  parts (CR bar, result, single boxes) never made it "calibrated", and nothing on screen said what was missing.
- In window mode the capture includes the **Windows title bar** (owner's screenshots: 1348×794 window, 1342×755 game at
  (3, 36)). Fixed positions need the same picture every time, so the title bar is now cut off automatically.
- On the real Victory screenshot, the built-in result box OCRs as **"VICEFORY"** (the sword crosses the T). The old exact
  `/VICTORY/` test would have missed the win.

**Changed**
- `js/game-area.js`: `window16x9(W, H)`. A captured game window that's taller than 16:9 is cropped to its 16:9 game
  picture (bottom, full width minus the border), recomputed if the window is resized; frame key `window-16x9`.
  `overlay.html` uses the same rule, so the overlay still lines up. Checked on the owner's sizes: 1348×794 → (3, 36,
  1342×755), exactly the hand crop.
- `js/layouts.js` (new, `E7Layouts`, pure + tested): built-in **Steam 16:9** positions.
  - Draft: 4 pre-ban icons and the first/last pick slot per side, **measured by eye** from the owner's chat screenshots,
    so possibly a few px off.
  - Result banner: **pixel exact**, from the Victory file.
  - Not built in yet: CR bars, opponent name, drafting help (they need screenshot files).
  - `effective` (built-in + yours, yours win), `status` per part (yours / built-in / mixed / not set), `ownOnly` (save
    only boxes that differ from built-in).
- `js/auto.js`:
  - Every reader uses `regions()` = built-in + yours. So a 16:9 Steam picture is ready with nothing drawn, and the
    "not calibrated" message only shows for other shapes (it now says why and what to do).
  - Calibration starts from the boxes in use and saves only your changes.
  - The pre-ban face search is wider (±21%, `RTAFaces.WIDE_VARIANTS`) when a box is built-in, to absorb by-eye errors.
- RTA Auto tab, new card **"What the reader knows about the screen"**:
  - A headline says whether the built-in positions are in use for this game picture.
  - A table lists each part (draft, opponent name, CR bar, expanded CR bar, Victory/Defeat, drafting help) as
    **Built-in / Yours / Built-in + yours / Not set (optional)**.
  - Buttons per part: **Check** (shows the boxes on the live picture, or the newest saved picture), **Set/Redo**, and
    **Use built-in** (forgets your boxes for that part).
- `js/vision.js`: `resultWord(text)`, a tolerant VICTORY/DEFEAT reader (within 2 edits, spaced letters, ignores "Victory
  Points"), used by the result reader.
- `sw.js` v18. Docs: HANDOFF, ROADMAP, CLAUDE.md.

**Bugs found and fixed:** the exact VICTORY match (see findings). Two older tests assumed calibration pops open on any
uncalibrated picture. Their made-up screens now open it themselves, since 16:9 pictures use the built-in layout.

**Tested**
- `npm test` 93 passing (layouts: 4 new, `resultWord`: 1 new).
- Browser suite 16/16 clean. New `rta-layout.e2e.js`:
  - with no boxes, the real Victory screenshot gives "built-in positions in use", nothing pops open, and draft/result
    both show "Built-in"
  - the built-in result box OCRs "VICEFORY", which `resultWord` reads as a win
  - Check shows the alignment view
  - your own result box shows as "Yours"; Use built-in returns to "Built-in"
- **Not tested on real draft pictures:** the by-eye draft positions. The first real draft screenshot (dev tool or Ctrl+Shift+S)
  should be checked with **Check**, then the numbers fixed in `js/layouts.js`. Emulators with side toolbars still need
  boxes drawn once.

---

## 2026-11-12 · #24 · Saved picture: choose which part to calibrate first · this commit (previous: `62deec4`)

**Asked for:** "when pressing calibrate on a saved picture its supposed to let you choose which part it is first, not
start calibration from step 1".

**Changed**
- `rta.html` / `js/auto.js`: picking a saved picture now opens **"What's on this picture?"**: the picture next to a
  list of parts. Each part shows ✓ when it's already set:
  - draft screen: all slots
  - redo **one** draft box (dropdown with the 9 boxes: prebans, pick slots, opponent name)
  - CR bar
  - expanded CR bar
  - Victory / Defeat
  - the game's drafting help (asks how many heroes it shows, as before)
- Only that part's boxes are then drawn. Single parts save straight into the existing boxes (the others are kept).
  "← Other picture" goes back to the list.
- `calibrateHelp` accepts a saved picture. `css/styles.css`: layout for the chooser (stacks on phones).

**Tested:** `rta-pictures.e2e.js` extended:
- choosing a picture shows the 5 parts and 9 single boxes, with calibration not opened yet
- the CR part → "Step 1/1 … CR bar"; one box (opponent pick #1) → "Step 1/1 … OPPONENT's pick slot #1"
- the whole draft → "Step 1/9"; Back / Cancel still close

`npm test` 88 passing; rta-auto-full, rta-basics and drafthelp-gearsorter clean.

---

## 2026-11-12 · #23 · Stronger face matcher, calibrate after the match, gear art, gear per hero, dev screenshot tool · this commit (previous: `7f6836d`)

**Asked for** (several messages):
- "do the stronger face matcher"
- "pressing back on calibration should close it currently does nothing"
- "there should be a live version to calibrate automatically since while im in a game i dont have time to adjust"
- "for the gear images use fable to draw a better one that is closer to the game"
- "gears should also be shown per hero too"
- "since the icons dont change it not a big problem, except for hero maybe whos got a different skin"
- "you should set up a dev tool to take screenshots automatically for your own learning"

**Research: face matcher** (real pre-ban grid, `tests/fixtures/screens/steam-rta-preban-select.png`)
- The official portrait `{code}_s.png` (112×112, round, transparent corners) is the **same artwork** as the in-game round
  icon. In game it sits inside a gold ring, with the class icon top-left, the element icon top-right and stars at the
  bottom.
- Mapping found by search on 6 sure faces: the portrait window centred at (+2, +4) px with half-size 56 equals the in-game
  ring box. Masked normalised cross-correlation at 32×32 scored 0.94 on average for those 6.
- The owner confirmed that four of the old matcher's guesses were **wrong** ("these are all wrong"). Many remaining
  faces are probably **skins** (different art, per the owner). A correction teaches a skin once, since icons never change.
- In the browser, a one-step canvas shrink (84 → 32 px) lowered the scores; shrinking in two steps (→ 64 → 32) and a
  3×3 shift search fixed that.

**Changed**
- `js/faces.js` (new, `RTAFaces`; pure parts tested):
  - face mask (circle minus icon corners and the star band); 32×32 colour vector, zero-mean and normalised
  - `classify` (best of all alignment variants), and `isConfident`: score ≥ 0.80 **and** ≥ 0.10 ahead of the next hero
  - corrections stored as int8 base64
  - browser helpers `fromPortrait` / `fromRect` (36 alignment variants)
- `js/auto.js`:
  - The **pre-ban slots (round icons) use the face matcher** (source shown as "official (face match)"). Pick banners keep
    the old matcher until real draft screenshots exist.
  - A correction on a round slot also saves the face (`auto.faceCorrections`), so skins are learned once.
  - "Delete my corrections" clears those too.
- Calibration:
  - **Back on step 1 now closes it**; new **Cancel** button (both close without saving).
  - **No calibration during a match:** when the RTA reader is watching but not calibrated, it no longer pops the
    calibration open. It saves a game picture every 15 s instead.
  - **Calibrate on a saved picture** opens the boxes on any saved picture after the match. Boxes are fractions of the
    game picture, so they work in every later game.
  - **Save a game picture** button. Desktop: **Ctrl+Shift+S anywhere** (and Game window menu) asks the game watcher to save
    one (`save-picture` command).
  - `js/pictures.js` (new): IndexedDB `e7-pictures`, newest 24.
- Gear art: `js/gear-icons.js` (new, drawn by a Fable sub-agent): original SVGs, six slots in a dark-steel/gold/red
  style and 24 round set emblems; **not game art**. Used on gear tiles and the details card (emoji/letters remain as
  fallback).
- **Gear per hero:** Gear page "View: by hero". One row per hero with their six slots in order, full sets, the gear score
  total and speed from gear; clicking a slot opens the details card. The hero box filters it.
- **Developer tool** (desktop): menu **Developer → Collect screenshots automatically** (off by default) and "Open the
  screenshot folder".
  - The game watcher saves a full-size PNG of the game when the scene changes and holds still for 2 passes (at most
    every 2 s), plus once a minute.
  - Next to each PNG is a `.json` with the time, why it was saved, the detected screen, each reader's note and the frame
    key.
  - Saved to `Pictures/Epic 7 Engine/<date>/` on the owner's PC; nothing is uploaded. The owner drags pictures into the
    chat to share them.
- `sw.js` v17 (new files). Docs: HANDOFF, ROADMAP, CLAUDE.md.

**Tested**
- `npm test`: 88 passing (5 new for faces).
- Browser suite 15/15 clean:
  - `faces-real.e2e.js` (new): on the **real** grid with all 367 official portraits, **14/15** confirmed faces named
    confidently and correctly, and **0** confident answers on any unconfirmed face (Genesis Ras: right name, but its lead
    is too small, so it stays "unsure"). About 43 ms per face.
  - `rta-pictures.e2e.js` (new): saved pictures listed (including one saved by the watcher command); calibration opens
    on a saved picture; Back on step 1 closes; Back after a box goes to step 1; Cancel closes without saving.
  - `gear-cards.e2e.js`: + the by-hero view (8 heroes, 6 slots each; details card from a hero row).
- Packaged desktop app: new `tests/desktop/devshots.js` (3 PNG + JSON pairs for a first picture and two scene changes,
  nothing in between); watcher, popout, cancel, zoom, winpick still pass.
- **Not tested:** the face matcher on live drafts (no draft screenshots as files yet), skins, Windows.

**Open:** labels for the faces the matcher is unsure about (some are skins). Real draft / CR / Defeat screenshots, which
the dev tool can now collect.

---

## 2026-11-12 · #22 · First real game screenshots: what the readers get right and wrong · this commit (previous: `06ae25a`)

**Asked for:** the owner sent two Steam screenshots as files: the RTA **pre-ban picker** ("Select Pre-Ban Hero" grid) and a
**Victory** screen. (The earlier draft / battle / Defeat screenshots were pasted into the chat and aren't available as
files.)

**Changed**
- `tests/fixtures/screens/` (new), the start of the real-screenshot test set:
  - `steam-rta-victory.png` and `steam-rta-preban-select.png`, cropped to the game picture (without the Windows title
    bar; both exactly 16:9, about 1343×757).
  - The player name, the opponent's name and both guild names are blacked out, because the repo is public.
- `tests/real/ocr-victory.js` and `tests/real/match-portraits.js` (new): re-runnable checks of the current text reader and
  face matcher on those pictures. They're not part of `run-all.sh` yet, because there are no confirmed right answers
  (labels) for the faces.

**Findings (real data, first time)**
- **Text (tesseract.js 5.1.1, `eng`)**:
  - "VICTORY" correct (confidence 42, stylised font); Victory Points "1,344" (96); "The opponent has left the battle."
    (95); the player name correct (92, on the unredacted original).
  - **The point change "▲ 23" reads as "- 23"**: the arrow becomes a minus. Win or loss and +/− must come from the
    arrow's colour (green up / blue down) or the result word, never from the sign in the text.
  - **Korean opponent names**: `eng` gives garbage (confidence 2). `kor` reads "여우는…구미호" (94, with one repeated
    syllable from a line split). The opponent-name reader needs Korean (and likely Japanese/Chinese) data and must join
    lines. The result screen also says when the opponent **left**, which is worth recording.
- **Hero faces (current matcher: 16×16 colour feature vs the official portraits, 3 template crops, 15 crop variants)**,
  40 round faces in the pre-ban grid, checked by eye on a contact sheet (crop vs best match):
  - **20/40 confident**; about 18 of those look right, and 1–2 confident matches look wrong (e.g. a silver-haired face
    → "Shepherd Jena").
  - Most "unsure" ones are wrong.
  - So the current matcher isn't good enough for real games. A stronger face matcher (the embedding / ONNX model both
    reviewers suggested, or at least larger features with a circular mask) moves up in priority. Corrections ("my
    corrections" source) and the "owned heroes only" filter for my picks help in the meantime.
- The pre-ban is chosen in its own picker (grid + "Recently Selected"), and the opponent is "Unknown Opponent" until
  the draft ends. Useful for the screen layouts in step 2.

**Tested:** both scripts run on the redacted fixtures and give the same results as on the originals (names excepted).

**Open:** the owner could label the 40 faces (or send screenshots with known picks) so the face test gets right answers.
More screenshots as files (draft picks/postban, CR bar, Defeat) are needed for step 2.

---

## 2026-11-12 · #21 · Step 1a: one game watcher for the whole app (vision service + event bus) · this commit (previous: `6747836`)

**Asked for:** "yes start step 1": the first step of the plan in `docs/DESIGN_REVIEW.md`. One always-on watcher captures
the game, works out the screen and runs the readers; modules only receive events. While this was being built the owner
also sent Steam screenshots of the RTA draft (preban, picking, postban "BAN", "Ready" with BANNED stamps), battle (CR bar,
expanded CR with exact percentages) and a Defeat screen. They're input for step 2; chat images aren't files here.

**Findings**
- The Gear and Guild War readers are small and only need a few saved boxes, so they move cleanly.
- The RTA reader (`js/auto.js`, 940 lines) uses about 50 RTA page elements and the RTA app state directly. Moving it is
  step **1b**. Until then it keeps its own capture; in the desktop app both capture the same game window, which is fine.
- Video frames can't be shared between windows cheaply, so the readers run next to the capture (in the watcher) and only
  facts travel. Drawing boxes uses a JPEG **snapshot** requested from the watcher.
- Electron allows `getDisplayMedia` from a hidden window (checked), so the desktop watcher can start by itself.

**Changed**
- New `js/vision/`:
  - `core.js` (pure, tested): event bus with cross-window delivery, a fact log in `localStorage['e7-vision-log']` (last
    200), request/reply commands, and `repeatGate` (a value must be seen twice in a row).
  - `bus.js`.
  - `hub.js`: the watcher. One capture; game area or game window; screen detection every 0.5 s; readers run only on
    their own screen; one shared tesseract worker; commands start / stop / status / snapshot / teach. A second start
    while starting reuses the first.
  - `client.js`, `panel.js`.
  - `readers/gear-item.js`, `readers/guild-name.js`.
  - `consumers/gear.js`.
- `js/gearstore.js` (new): the gear store shared by the Gear page and the gear consumer. Screen items are saved even when
  the Gear page is closed; sources are still kept apart.
- `vision.html` (new): the watcher's page. In the desktop app it's a hidden window created at start. It starts by itself
  once a game window was chosen, restarts when the choice changes, and closing it only hides it. Menu **Game window → Show
  the game watcher**. `E7Desktop.showSelf` lets it show itself while asking "Where is the game?".
- `live.html`: hosts the watcher in a browser (keep the tab open); new **Game watcher** card with status, readers and
  recent events. In the desktop app it shows the background watcher.
- `js/gear-scan.js` and `js/guild-watch.js` rewritten as watcher clients: start the watcher (desktop) or open Live
  (browser); draw boxes on a snapshot; teach screens through the watcher; show results from events. The Guild War page
  matches `guild:name-read` to known players itself (it has the guild data) and posts the overlay.
- `js/gear-app.js` uses `GearStore`, reloads on `gear:added` / storage changes. `js/game-area.js`: `isStale` (no alert),
  `markCalibrated` takes a frame key.
- Desktop: `main.js` creates the hidden watcher window; preload `showSelf`; `capture().chosen`; `vision.html` packaged.
- `sw.js` v15 (new files). Docs: HANDOFF (code map, flows, storage key), ROADMAP (architecture plan steps 1b–4),
  CLAUDE.md (where readers go).

**Bugs found and fixed while building**
- I overwrote the existing `tests/vision.test.js` (portrait tests) with the new bus tests. Restored from git; the new
  tests are `tests/vision-core.test.js`.
- `gear-app.js` called `load()` before it was defined (crash on load); fixed.
- Desktop tests picked the hidden watcher window as "main"; they now look for `index.html`.

**Tested**
- `npm test` 83 passing (5 new). Browser suite 13/13 clean. The moved tests now run the watcher on the Live page with fake
  game frames:
  - Gear: two items added from the Live page show up on the Gear page with verdicts, and in the overlay. The reader
    pauses on another screen. The "Set boxes" snapshot arrives (1280×720).
  - Guild War: the name read by the watcher selects "Quiet" in the pop-out.
  - Game-area crop through the watcher.
- Packaged desktop app (Xvfb + Openbox), new `tests/desktop/watcher.js`:
  - First launch: hidden watcher; Gear "Start the game watcher" → picker → watching only the fake game window; the Gear
    page shows the status; the watcher stays hidden.
  - Second launch: it starts by itself with no picker.
  - `cancel.js`: cancelling the picker shows "Capture was cancelled", not watching.
  - `popout.js`, `zoom.js`, `winpick.js` still pass.
- **Not tested:** real game screens, Windows.

**Open:** step 1b (RTA reader into the watcher). The screenshots need to be files for step 2.

---

## 2026-11-12 · #20 · Design review: Fable and DeepSeek on "build it from scratch" · this commit (previous: `d2160db`)

**Asked for:** "ask fable and deepseek what is the best way to design this app from scratch again".

**Done**
- Wrote one neutral brief: goals, how the owner plays, the read-only rule, source separation, the solo maintainer
  setup. It contains no personal details, no description of the current code and none of our opinions, so the answers
  aren't anchored on ours.
- Fable answered as an independent sub-agent, told not to read the repo.
- DeepSeek answered via its chat API. The owner entered their API key in the secure credential form; it is stored as a
  network secret on their cloud environment, and the session never saw it. We requested `deepseek-reasoner`; the API
  reported `deepseek-flash`.
- `docs/DESIGN_REVIEW.md` (new): the brief, both answers, and a comparison with the current app. `docs/SOURCES.md`:
  new section 2b "Outside advice".

**Findings**
- Both reviewers agree on the core:
  - capture the game window, normalised to one 16:9 frame
  - ship screen layouts as versioned data instead of user-drawn boxes
  - a central vision pipeline that emits events to the modules
  - a real-screenshot test corpus
  - local, source-separated storage
  - explainable scoring with Bayesian smoothing
  - read-only
- They disagree on the platform:
  - Fable: web tech + Electron, which is what we have.
  - DeepSeek: C# .NET + WPF + SQLite + Velopack, with Supabase and a separate PWA.
- Recommendation: evolve the current app, don't rewrite. Order: vision service → layout packs from real screenshots →
  IndexedDB → glyph reader for stats.

**Tested:** n/a (docs only). **Open:** waiting for the owner's go-ahead and real screenshots for the layout packs.

---

## 2026-11-12 · #19 · Gear card view (like the game's inventory) · this commit (previous: `a43ba45`)

**Asked for:** (two Steam screenshots: an item's details panel, and the inventory grid) "also display the gears like this
or the second one". Also asked why the app is "portable" and to "make a full version".

**Findings**
- The screenshots show the Steam client's inventory: tiles with level, set icon, main stat + 4 subs with stat icons,
  and the score under the icon; a details panel on the right.
- The game's own "Equipment Score" (33 for Defense 60 / HP 7% / Def 7% / Spd 4 / Res 6%) is **not** the
  Fribbels WSS (28 for the same item), and its formula isn't public. We show our WSS, labelled "Gear score", and don't
  imitate the game's number.
- The **full (installed) version already exists** since v0.1.3: `Epic-7-Engine-Setup-<v>.exe` on Releases. The
  portable .exe is the extra.

**Changed**
- `gear.html` / `js/gear-app.js`:
  - New **View: cards / table** switch, default cards, remembered in `localStorage['e7-gear-view']`.
  - Cards: a tile per item with a rank-coloured icon (Epic red, Heroic purple, Rare blue…), level, +enhance, lock,
    equipped hero's face and set badge. The gear score sits under the icon; main stat and substats have stat symbols
    (roll counts as small numbers). The bottom edge is coloured by verdict.
  - Clicking a tile opens a details card styled like the game's (rank + slot, main stat bar, substats with full names,
    gear score, after reforge, expected at +15, set, verdict + reason, equipped on, best heroes). It's a sticky side
    panel on wide screens and sits below on narrow ones.
  - All symbols, colours and shapes are our own (no game art); slot symbols are standard emoji.
- `css/styles.css`: gear card styles; two tiles per row on phones.
- `sw.js` cache v14. README: says plainly that the Setup .exe is the full version.

**Tested:** new `tests/e2e/gear-cards.e2e.js` (248-item fixture):
- 150 tiles render; clicking opens the details card.
- No sideways scrolling at 1400 px or 390 px.
- The table view still works and the choice is remembered.
- Full browser suite 13/13 clean; `npm test` 78 passing.

**Open:** real game icons for sets and slots can't be used (game art). If wanted, we can draw our own SVG set icons.

---

## 2026-11-12 · #18 · Fixes from an independent review (Fable) · this commit (previous: `2d69443`)

**Asked for:** "use fable to check if anything else is wrong and then push". A separate Fable review read
`e062f43..2d69443` without being told my conclusions. Every finding below was checked against the code before fixing.

**Bugs found and fixed**
1. **Portable update never swapped** (high). The .cmd waited with `timeout /t 1`, which exits at once when stdin
   isn't a keyboard (we spawn with `stdio: 'ignore'`). The 60 retries took about 1 s, before the portable launcher
   freed the .exe, and the next start deleted the download. Now it waits with `ping -n 2 127.0.0.1`.
2. **Non-ASCII or space-containing paths in the swap script** (medium). The paths were written into the .cmd file
   (UTF-8, but cmd reads the OEM code page). They're now passed as arguments (`%~1` / `%~2`), on a verbatim
   `cmd /d /s /c ""script" "a" "b""` command line.
3. **Main and overlay zoom weren't independent** (medium). Chromium zoom is per origin; both windows are `e7://app`.
   Confirmed in the packaged app: with zoom 1.5 the overlay window also reported 1.5. The overlay no longer uses
   `setZoomFactor`; `overlay.html` scales each card or label by `overlayZoom / zoom` (CSS transform, origin on the side
   facing its box, so positions stay exact). Values come over IPC (`E7Desktop.zoom()` / `onZoom`).
4. **Update download had no write-error handling** (medium-low). A read-only folder or full disk could crash the main
   process or hang with `busy` stuck on. It now uses `stream.pipeline`, removes the partial file, and gives a clear
   message.
5. **Overlay in the wrong place in window mode with no tracker** (medium): game not open yet, game closed,
   PowerShell blocked. On Windows the overlay now hides until the game window is found again, and the app looks for it
   every 4 s, not only when a reader starts.
6. **Every child window forced to 380×620 and always on top** (low). Only the mini windows (`rta-mini`,
   `e7-guild-mini`) get that now; e.g. Live → Open overlay preview opens normally at 1100×640.
7. **Readers and the game-area dialog** (low). The capture-ended listener is now attached before the dialog. Cancelling
   "Where is the game?" stops the reader (`GameArea.wrap` returns null) instead of silently reading the whole screen.
   Applies to `js/auto.js`, `js/guild-watch.js` and `js/gear-scan.js`.

**Also fixed (the review's "speculative" list)**
- **Old calibration boxes**: boxes drawn on the whole screen are in the wrong place once only the game is read.
  `GameArea.markCalibrated(module, src)` records which picture each module's boxes were drawn on, in
  `localStorage['e7-frame-of']` (`window` / `area:x,y,w,h` / `full`). `warnIfStale` alerts once when a reader starts
  with boxes from another picture.
- Display-media handler: when cancelled, `callback()` is called with no arguments, guarded.
- Window title match is exact (a browser tab named "Epic Seven …" can no longer be picked by accident; you're asked
  instead).
- The PowerShell tracker stops when the app's process is gone (no orphan after a crash).
- Pop-out windows get the zoom at creation (`about:blank` may never fire `did-finish-load`).
- Only the picker window may send `e7:choose`.
- **Kept on purpose:** every build of the dev branch becomes the "latest" release. That's how the owner gets updates,
  since this branch is where all work happens.

**Tested**
- `npm test` 78 passing; browser suite 12/12 clean. `game-area.e2e.js` now also checks the old-boxes warning (warns
  once; no warning after redrawing).
- Packaged Linux app (Xvfb + Openbox), scripts in `tests/desktop/`:
  - `zoom.js`: overlay card scale 1/1.5 with zoom 1.5 / overlayZoom 1.0.
  - `popout.js`: both pop-outs open, with content, on top.
  - `winpick.js`: window capture as before.
  - `cancel.js`: cancelling the picker leaves Gear "not reading", no errors; the overlay preview is 1100×640 and not on
    top.
- **Not tested (needs Windows):** the swap script, PowerShell tracker, NSIS install and update.

---

## 2026-11-12 · #17 · Pop out fixed, in-app updater, read just the game window · this commit (previous: `d112aa5`)

**Asked for:** (screenshot of Guild War in the desktop app) "POP OUT DOESNT DO ANYTHING"; then "make an inapp updater";
then "can the window not lock on per window instead of the whole screen".

**Findings**
- Pop out: in Electron 33, `documentPictureInPicture` exists but `requestWindow()` **never resolves** (checked in the
  packaged app: the promise hangs, no error). So the click did nothing. A try/catch alone wouldn't help.
- electron-updater can update an NSIS-installed app from GitHub Releases, but **not a portable .exe**. The repo is public,
  so Releases download without signing in. Every build needs a higher version, so CI sets `0.1.<run number>`.
- Electron's capture sources include single windows (`window:<HWND>:0` on Windows). Capturing a window gives just the
  game, even when other windows cover it. The overlay then has to know where that window is: read with
  `DwmGetWindowAttribute` (physical pixels), converted with `screen.screenToDipRect`.

**Changed**
- `js/pip.js`, `js/guild-pip.js`: in the desktop app, open a normal window (the app keeps it always on top); in a browser,
  Picture-in-Picture with a fallback to a normal pop-up if it fails.
- In-app updater, `desktop/updater.js` (new):
  - Checks about 10 s after start, quietly, and from the menu **Epic 7 Engine → Check for updates…**.
  - Installed app: electron-updater. It asks first, shows progress on the taskbar icon, then "Restart now / Later".
    Later = installs on close.
  - Portable .exe: GitHub API `releases/latest`, downloads `*-portable.exe` next to the old one as `.update`. After the
    app exits, a small `.cmd` retries `move` until the old file is free, then starts the new one if "Restart now" was
    chosen. Same file name and place, so shortcuts keep working.
  - The menu also shows the version and links to the Releases page.
- `desktop/package.json`: targets `nsis` + `portable`. NSIS is one-click, per-user (no admin), with a desktop shortcut;
  output `Epic-7-Engine-Setup-<v>.exe`. Adds a `publish` block (github, so `latest.yml` / `app-update.yml` are written)
  and the dependency `electron-updater` 6.3.9. Lock file regenerated.
- `.github/workflows/desktop-build.yml`: version `0.1.<run number>`. Every app change publishes Release `v0.1.<n>`
  (marked latest) with the installer, its blockmap, `latest.yml` and the portable .exe. The `v*`-tag trigger was removed
  (versions are automatic). `concurrency` keeps builds in order.
- Read just the game window:
  - `desktop/picker.html` (new): "Which window is the game?" with live previews. Emulators and Steam "Epic Seven" are
    marked "looks like the game"; whole screens are a fallback.
  - `desktop/preload.js` (new): `window.E7Desktop` `{capture, pickWindow, onCapture}`.
  - `desktop/main.js`: `config.capture` (`{mode:'window'|'screen', id, name}`). `getDisplayMedia` gets that window;
    the picker opens the first time, or when the window can't be found (matched by id, then by title).
  - Menu **Game window**: shows the current choice; **Pick the game window…**.
  - `desktop/wintrack.js` (new): one PowerShell loop reads the game window's position, minimized state and whether it
    (or this app) is active. The overlay window follows it, and hides when the game is minimized or another program
    is in front.
  - `js/game-area.js`: in window mode no box is asked (the capture is already the game). **Reset game area** opens the
    window picker in the desktop app.
  - `overlay.html`: identity mapping in window mode. `js/live.js`: the status line shows the game window.
- `sw.js` cache v13 (changed pages and scripts).
- `tests/desktop.test.js` (new, 4 tests): tracker line parsing, HWND from source id, version compare.
- `tests/desktop/` (new): Playwright-driven checks of the packaged app (pop-outs, window picker).

**Tested**
- `npm test`: 78 passing. Browser suite: 12/12 clean.
- Packaged Linux build (`electron-builder --linux dir`), driven by Playwright under Xvfb + Openbox:
  - Pop out on Guild War and on RTA opens a window with its content, always on top. The old code hung in
    `requestWindow`.
  - Window picker: a fake "Epic Seven" window (separate Chromium) was listed and marked; the app's own windows were not.
    Picking it made `getDisplayMedia` capture only that window: the centre pixel was the game's gold colour, the
    track label was the window title, and no box dialog appeared. The choice was saved in `config.json` and the next
    capture skipped the picker. The overlay page and Live see window mode.
- `app.asar` contains `updater.js`, `electron-updater`; `app-update.yml` is in resources. An AppImage build writes
  `latest-linux.yml`, so the Windows build will write `latest.yml`.
- **Not tested (needs Windows):** the PowerShell window tracker and the overlay following the window; the NSIS
  installer and the actual update download and swap (first possible once two Releases exist); DPI scaling other than
  100%.

**Open:** updates are unsigned (SmartScreen may ask after an update). The first installed or portable version that has
the updater is the one from this build. Older .exe files must be replaced by hand once.

---

## 2026-11-12 · #16 · Box the game window (game area) + bigger text · this commit (previous: `e062f43`)

**Asked for:** (with two screenshots of the desktop app on Windows) "make the ui and text size bigger" and "watch
emulator window shows up like that". The calibration picture showed the **whole desktop** (other windows, the app
itself) with the game small in the middle, because the desktop app captures the entire display.

**Findings:** Electron's display-capture approval hands over the whole display, so every calibration box and every
reader worked on a full-screen picture where the game is small. Cropping once, centrally, fixes all three readers and
makes calibration show the game large. The overlay must then map positions back from the game to the screen.

**Changed**
- `js/game-area.js` (new): `GameArea.wrap(video)` asks once for a box around the game ("Where is the game?" dialog;
  "Use the whole picture" also possible), saves it in `localStorage['e7-game-area']`, and returns a canvas with just the
  game, refreshed every 100 ms. Asked again if the capture size changes. Any `[data-reset-game-area]` button clears it.
- `js/auto.js`, `js/guild-watch.js`, `js/gear-scan.js`: read from the wrapped source and stop its timer on stop.
  `auto.js` gained a `live` flag so screenshot mode and live mode no longer depend on `source === video`.
- `rta.html`, `guild.html`, `gear.html`, `live.html` (+ `js/live.js` status line): "Reset game area" buttons; load
  `game-area.js`.
- `overlay.html`: in desktop mode, item positions are mapped through the game area; re-draws when it changes.
- Bigger text: `css/styles.css` base font 14px → 15px (line height 1.5), hints 12.5px → 13.5px. Desktop app opens
  pages at **125% zoom**; View menu Ctrl+= / Ctrl+- / Ctrl+0 (0.6–2.5, saved); Overlay menu bigger/smaller overlay text.
- `sw.js` cache v12 (adds game-area.js). Docs: HANDOFF (storage key, flow, zoom), README, desktop/README.

**Tested**
- `npm test`: 74 passing. `node --check desktop/main.js` ok.
- New `tests/e2e/game-area.e2e.js`: a generated 1920×1080 "screen" with distracting text outside and a 960×540 game
  window holding an item panel. The wrapped source is 960×540, the gear reader read the item correctly (Boots, Speed
  Set, Speed 45, 4 substats) and ignored the text outside; the desktop overlay put a label at the expected screen
  position ([1182, 470]).
- Full browser suite: all 12 tests clean.
- **Not tested:** the Electron zoom menu and overlay mapping in the real Windows app (no Windows/display here). The
  owner's next exe run is the first real check.

**Open:** if the game window moves, the box must be redrawn (Reset game area). Auto-finding the game window by its
picture could come later.

---

## 2026-11-12 · #15 · Automatic Windows .exe build (GitHub Actions) · this commit (previous: `605855e`)

**Asked for:** set up the automatic exe build (after explaining how to install on Windows), so the app can be
downloaded without installing Node.js or using a command line.

**Changed**
- `.github/workflows/desktop-build.yml` (new):
  - Runs `npm test` on Ubuntu, then on `windows-latest` runs `npm ci` + `npm run dist` in `desktop/`.
  - Uploads `desktop/dist/*.exe` as the artifact **Epic-7-Engine-windows** (30 days).
  - On `v*` tags, also attaches it to a GitHub Release (`softprops/action-gh-release@v2`, the only reason for
    `contents: write`).
  - Triggers: pushes to `main` / the dev branch that touch app files, tags, and manual "Run workflow".
- `desktop/package.json`:
  - `dist` = `electron-builder --win portable --publish never` (never tries to publish by itself).
  - Output name `Epic-7-Engine-${version}-portable.exe`; `author` set (electron-builder warns without it).
- `desktop/package-lock.json` (new): made with `npm install --package-lock-only --ignore-scripts`. It pins Electron
  33.2.1 / electron-builder 25.1.8 and their dependencies, so CI uses `npm ci`.
- Docs: README "Install on Windows", desktop/README, HANDOFF (CI section), SOURCES (actions used).

**Tested**
- Workflow YAML parses; `npm test` 74 passing.
- **First real build on GitHub: run #1 (id 43301060267), success.** Tests passed on Ubuntu; `windows-latest` ran
  `npm ci` (24 s) and `npm run dist` (78 s). The artifact **Epic-7-Engine-windows** (74.3 MB zip, expires 2026-12-12)
  was uploaded; the Release step was skipped as intended (no tag).
- **The .exe itself has not been started yet** (no Windows/display here). The first launch is the owner's.

**Open:** the .exe is unsigned (Windows SmartScreen asks once). Code signing needs a certificate (paid).
Downloading Actions artifacts requires being signed in to GitHub; tagged Releases don't.

---

## 2026-11-12 · #14 · Steam version: typed hero speeds; docs updated · this commit (previous: `bc29f70`)

**Asked / told:** can the Steam version be used instead of an emulator? (Yes: the app only reads the screen, so any PC
window works; calibrate per client; windowed/borderless for the overlay; capture "Entire screen" if a window capture is
black.) The owner reports **Fribbels' gear importer doesn't work with the Steam version**.

**Consequence:** Steam players have no `gear.txt`, so no hero speeds (RTA speed checks, scouting comparisons, Guild War
green dots need them). The screen gear reader gives inventory items, but they aren't linked to heroes.

**Changed**
- `js/app.js`:
  - New store field `mySpeeds` {code: speed} (source `my speeds`), set in the hero editor's new "My speed" field.
  - In `derive()`, typed speeds win over gear.txt builds; `cache.typedSpeeds` records which ones were typed.
  - Heroes tab shows "typed" (plus the gear.txt value if both exist); the hero card shows both.
- `js/guild-app.js`: your speeds for the Guild War gear check include typed speeds; Setup's hint mentions it.
- `rta.html`: "My speed" field in the hero editor.
- Docs: HANDOFF (storage field, source label, status: Steam + Fribbels limitation), SOURCES (Fribbels importer
  limitation, typed speeds as user data), ROADMAP (hero gear screen reader now top priority), README "Steam version".
- `tests/e2e/typed-speed.e2e.js` (new).

**Tested**
- `npm test`: 74 passing.
- New browser test: typed 282 for Arbiter Vildred → Heroes row "282 spd typed", `cache.mySpeeds` = 282.
  On the Guild War page a proven counter (2-0, slowest winning AV 270) turned into a **green** dot from the typed speed.
  No errors.

**Open**
- Steam screenshots (all screens, especially a hero's gear screen) to build the hero-gear reader and Steam default boxes.

---

## 2026-11-12 · #13 · Full handoff docs + sources list; CeciliaBot skills and automatic tags; e2e tests in the repo · this commit (previous: `52c9339`)

**Asked for:** document everything so any future task can continue; list all sources and where they're used; "you can
use Cecilia bot website maybe".

**Research: CeciliaBot**
- Site `https://ceciliabot.github.io` (Vue app). Its code calls `https://cecilia-bot-api.vercel.app/api/v1`
  (`getList?list=hero|buff|debuff|common`, `getItem?list=hero&id=<slug>`). CORS `*`, so other sites can call it.
- `getList?list=hero`: 389 heroes with `id` = official code (e.g. `c1144`), `_id` slug, `buff` / `debuff` / `common`
  effect ids.
- `getItem`: full skills (`description` with `**bold**`, `++buff++`, `--debuff--`, `{{variable}}` placeholders and
  per-placeholder `values` [base, +enh…], an `awakened` version, cooldown, passive).
- `data/HeroDatabase.json` on the site has only basic info; its `tags` field is availability (1 = limited), not roles.
- No explicit licence found. Used at runtime only (nothing copied into the repo), credited with a link, only hero ids
  sent, can be switched off. Logged in `docs/SOURCES.md`.

**Changed**
- `js/ceciliabot.js` (new): list (weekly cache) + per-hero skills (weekly cache, only when a card opens).
  - `EFFECT_TAGS` maps game effect ids to our tags; 2+ different debuffs → `debuffer`.
  - `renderText` escapes everything and allows bold/buff/debuff markup and filled `{{variable}}` values at max
    enhancement (e.g. "revives to **10%** Health").
- `js/heroinfo.js`: third tag source `ceciliabot`; CeciliaBot skill section (normal + awakened, cooldown, passive)
  with a use switch; pages re-render when the effect list first arrives (`HeroInfo.onTagsReady`).
- `js/logic.js`: `compositionWarnings(my, enemy, notes, extra)` accepts automatic tags as their own labelled source.
  RTA passes CeciliaBot tags, so "No cleanse or immunity against 2 debuffers" works with no manual tagging.
- Calibration usability (found by the tests): the calibration image is capped at 62% of the window height and
  scrolled into view when calibration starts. A drag ending off-screen used to draw the wrong box. The Guild War and
  Gear calibration canvases use the same cap.
- Docs:
  - `docs/HANDOFF.md` (new): what it is, rules, code map, every storage key, source labels, flows, testing, status, commands.
  - `docs/SOURCES.md` (new): every runtime data source, library and research reference, with file usage, label, what
    is sent and when checked; rejected sources and why; privacy summary.
  - `CLAUDE.md` "Start here" + rules to keep SOURCES/HANDOFF current; README Development section.
- `tests/e2e/` (new): the 10 Playwright scripts used during development, made portable (`BASE`/`OUT`/`FX`), with fixtures
  and `run-all.sh`. `tests/e2e/out/` is git-ignored. `sw.js` cache v11.

**Bugs found and fixed**
- CeciliaBot skill text showed raw `{{variable}}`: placeholders are now filled from `values`.
- The drafting-help e2e test failed after the Auto tab grew (Screens card): the calibration image ran below the window,
  so two drags missed and the pick columns were spread sideways. Fixed in the product (cap + scroll into view), not by
  just enlarging the test window.
- A converted test script declared `BASE` twice (test-only).

**Tested**
- `npm test`: 74 passing (new: effect → tag mapping incl. Arbiter Vildred's real effects, all mapped tags exist,
  text escaping/markup, placeholder values, team check with an automatic-tag source).
- `bash tests/e2e/run-all.sh`: **all 10 browser tests pass**.
  - CeciliaBot live: 389 heroes cached; tags AV = aoe, attack buff, cr push, revive; Belian = aoe, control, cr reduce,
    debuffer, dispel, heal, provoke; card shows S1–S3 with awakened text and "10%"; switch-off removes tags.

**Open / unverified**
- CeciliaBot terms aren't stated. If its maintainers object, switch the source off by default (one line in `js/ceciliabot.js`).
- Judgement roles (nuker, tank, support, bruiser, healer, speed control) still come only from you and your guild.
- Everything in HANDOFF "Never tested on the real game" still applies.

---

## 2026-11-12 · #12 · Expanded CR bar, hero info card (skills + role tags) · this commit (previous: `b1867c6`)

**Asked for**
1. The CR bar has an expanded screen: read it too.
2. Show any hero's skill descriptions in Guild War or RTA, in case someone forgets.
3. A tag system per hero by role, for a quick overview.
(Also answered, no code change: the owner said Fribbels only reads data sent to the player. I re-checked the RexQian
fork at `1d7fef5`: `scanner.py` captures the game traffic locally, then `scanner.js` POSTs it to
`krivpfvxi0.execute-api…/dev/getItems` to decode; the only alternative is a developer-only `127.0.0.1:5000` decoder
that isn't in the repo. Conclusion from #10 unchanged.)

**Research: skill text sources**
- EpicSevenDB API (`api.epicsevendb.com`, used in old Fribbels code): unreachable; the website's certificate has expired.
- Official static server (`static.smilegatemegaport.com/gameRecord/epic7/`): `epic7_artifact.json` exists, but no
  skill file (`epic7_skill`, `epic7_hero_skill`, `epic7_hero_detail` → 403).
- Fribbels herodata: skills have multipliers only, no text.
- Community GitHub repos with old EpicSevenDB copies: not used (unclear licences, likely outdated after reworks).
- **epic7x.com** hero pages are reachable, at `/character/<name>/`: lowercase, "&" → "and", apostrophes dropped,
  other characters → "-". 12 sampled heroes all resolve.
- Decision: link to epic7x for full text; skill **notes** come from `my notes` and `guild`, kept separate.

**Changed**
- `js/logic.js`: `TAG_GROUPS` (Role / Offense / Utility / Control, 31 tags); `TAGS` derived from it (team checks keep working).
- `js/roster.js`: `epic7xUrl(name)`, `tagSources({source: tags})`.
- `js/heroinfo.js` (new, shared): hero card dialog.
  - Header, combined tags with ✓ when sources agree, epic7x link, page extras.
  - `my notes` and `guild` blocks, each with tags and skill notes (S1, S2, S3, Passive/EE), editable per source.
  - `tagChips()` for quick-overview chips. Any element with `data-hero` opens the card (capture phase, so an ⓘ
    never also triggers a pick).
- RTA (`js/app.js`):
  - The card reads and saves through the in-memory store; extras show your build, learned win rate and scouted speeds.
  - ⓘ + tag chips on suggestions, ⓘ in the Heroes tab, filled draft slots and scouting rows open the card.
  - **New:** the RTA page reloads its data when another tab changes it (Guild War / Gear pages write the same
    storage), so it no longer overwrites their changes.
- Guild War:
  - New shared record type `hero` (`hero-<code>`), also allowed in `firestore.rules`.
  - Hero chips on cards are tappable and show tag chips.
  - Guild notes are cached in localStorage `e7-guild-heroes` for the other pages (read-only there).
  - The page now loads `js/logic.js` for the tag groups.
- Gear: "best for" heroes open the card; loads `js/logic.js` + `js/heroinfo.js`.
- Expanded CR bar:
  - Screen type `rta-cr-expanded` and a "Calibrate expanded CR bar" box (`crBarExpanded`).
  - The CR reader uses the expanded box when that screen is showing, else the normal bar, else whichever exists.
  - Automatic reading also runs on the expanded screen; the result says which bar was used.
- CSS for the card and chips; `sw.js` cache v10.

**Bugs found and fixed:** epic7x link for names with apostrophes ("Archdemon's Shadow") pointed to `archdemon-s-shadow`
(404); apostrophes are now dropped (`archdemons-shadow`, 200).

**Tested**
- `npm test`: 69 passing (new: epic7x addresses incl. "&" and apostrophes, tag sources).
- Browser:
  - RTA card opened from the Heroes tab; my tags and S3 note saved; chips show in suggestions; ⓘ opened the card
    without picking.
  - Guild War guild notes saved as a `hero` record "by Ann", shown with ✓ where sources agree, chips on the war card.
  - The Gear page shows both sources (guild read-only); the RTA tab kept my notes after the other page wrote.
  - Expanded CR: after teaching `rta-cr-expanded`, "8 heroes read from the expanded CR bar".
  - All earlier browser tests pass; no console errors.

**Open / unverified**
- What the real expanded CR view looks like (it might show % numbers that could be read directly). Needs a screenshot.
- No automatic tags from skill text (no permitted skill-text source); tags come from you and your guild.

---

## 2026-11-12 · #11 · Live layer system, desktop overlay app, gear read from the screen · this commit (previous: `0fe8ac4`)

**Asked for:** "Make everything automatic, maybe use a layer system so a window over it can read everything on the
game's screen." During the work: plan (not build) a PvE/events module (events, Advent, Dimensional Exploration, Hunts,
Otherworldly Breach, Trial of Constellation, Strategic Archive), recorded in `docs/ROADMAP.md`.

**Design: four layers**
1. Capture.
2. **Screen detector** (`js/screens.js`): whole frame → 32×18 fingerprint (zero-mean, unit length). Each screen is
   taught by example (up to 5 per screen), matched against those examples, and must be the same twice in a row.
   Untaught screens don't block anything, so nothing breaks before teaching.
3. Readers gated by screen.
4. **Overlay**: modules post items `{x,y,w,h as fractions of the game frame, kind, level, title, lines}` on the
   BroadcastChannel `e7-overlay` (`js/overlay-bus.js`); `overlay.html` draws them.
   - In the desktop app that page is a transparent, click-through, always-on-top window over the game display.
   - In a browser it's a preview.

**Changed**
- `js/screens.js`, `js/screen-watch.js` (new): detector + shared helper (`E7Screens.update/teach/forget/allowed`);
  fingerprints in localStorage `e7-screens`, shared by all modules on the device.
- RTA (`js/auto.js`, `rta.html`):
  - Draft-screen readers (slots, postbans, drafting help, name) run only on `rta-draft`, the result reader only on
    `rta-result`, the CR reader only on `rta-battle`, each only once that screen has been taught.
  - Teach / Forget controls and status in Auto.
  - Overlay layer `rta`: top 3 suggestions next to the slot being picked, scouted enemy speeds next to their heroes.
- Guild War (`js/guild-watch.js`, `guild.html`): name reading only on `gw-enemy` (once taught); "This is the enemy
  screen" button; overlay layer `guild`: a card next to the enemy's name with their dot, each team's verdict and your counter.
- Gear without Fribbels:
  - `js/statparse.js` (new, pure): OCR text → stat lines (loose names, OCR slips like "Crit1cal", % vs flat,
    plausible ranges), set, slot, enhance, level, rank → a Fribbels-shaped item, plus a list of problems.
  - `js/gear-scan.js` (new): capture; box the panel once (main, 2–4 substats, optional set/slot/enhance/level);
    OCR every 1.5 s on the `gear-item` screen; the same item twice in a row is added once.
  - `js/gear-app.js`: `gs.scanned` kept separate from gear.txt items, with an on/off switch and a "screen" badge.
  - Overlay layer `gear`: the verdict next to the panel.
- `live.html` + `js/live.js` (new module "Live"): the four layers explained, taught screens (Forget), overlay preview,
  a monitor of what modules send, desktop app instructions. App-bar link on every page, home card, manifest shortcut.
- `overlay.html` (new): draws cards, labels and dots; flips a card to the other side of its box and clamps it to stay on screen.
- `desktop/` (new, Electron 33.2.1, electron-builder 25.1.8 for a portable .exe):
  - Serves the app under `e7://app` (one origin, so storage and channels are shared).
  - Auto-approves screen capture for the chosen display.
  - Overlay window: transparent, click-through, always-on-top, `setContentProtection(true)` so it's excluded from
    capture and the readers never read the overlay.
  - Pop-outs stay on top; menu to pick the game's display; Ctrl+Shift+O / Ctrl+Shift+E.
- `sw.js` cache v9, Pages workflow publishes `live.html`/`overlay.html`, `.gitignore` for desktop builds,
  README sections, CLAUDE.md (readers only read; never sniff game traffic), `docs/ROADMAP.md`.

**Bugs found and fixed**
- "Crit1cal Hit Chance 12 %" parsed as value 1 (a digit inside a word). The value is now the last number standing
  on its own.
- "Health 2,700": thousands separators broke the line split; parsing now uses the cleaned text.
- Overlay card next to an item panel near the right edge was squeezed off screen; it now flips side and is clamped.
- Gear overlay said "Best for Lilias (+2.2)" next to "not an upgrade"; it now only names a hero above the upgrade margin.

**Tested**
- `npm test`: 67 passing (new: detector through noise/brightness, unknown screens rejected, stabilizer, gating;
  stat lines incl. OCR slips/percent/flat/ranges; set/slot/enhance/level/rank; whole item + problems; item key).
- Browser (http):
  - Generated item-details frames: Boots (Speed Set +15, Speed 45, 4 substats) read correctly → KEEP (best for Ravi);
    Ring → EXTRACT. On another screen reading paused.
  - The overlay page drew the gear card. The Live page lists taught screens; the home card reads "1 of 5 screens taught".
  - Full RTA test still passes and its overlay shows enemy speeds; Guild War pop-out and live-sync tests pass.
  - No console errors; Live and Gear pages don't scroll sideways on phones.
- Desktop app: `node --check` only. **Not run** (no desktop/display here). Electron and electron-builder versions
  checked to exist on npm.

**Open / unverified**
- Everything screen-based still needs **real game screens**: teaching, box positions, OCR on the game's font.
- Screen-read gear isn't linked to heroes (roadmap: hero gear screens).
- The desktop overlay needs the emulator in windowed or borderless mode (not exclusive full-screen).
- Data inside the desktop app is separate from the browser's (export/import to move it).

---

## 2026-11-12 · #10 · Guild War pop-out + "Watch game"; research on getting gear.txt without Fribbels · this commit (previous: `42a5d4b`)

**Asked for**
1. Build the Guild War pop-out window (the "option 1" overlay discussed: see the dots and details while in game).
2. "Make the system to get the gear.txt just like Fribbels does", so people don't need Fribbels.

**Research: how Fribbels (RexQian fork) gets gear**
- `data/py/scanner.py` (scapy, needs Python + Npcap/Wireshark) **sniffs the game's network traffic** (TCP ports 3333
  and 5222) and prints the raw payloads as hex.
- `app/js/lib/scanner.js` then **POSTs those raw payloads to Fribbels' private server**
  (`https://krivpfvxi0.execute-api.us-west-2.amazonaws.com/dev/getItems`), which decodes them into items and heroes.
  The decoding is not in the repo. Licence: GPL-2.0.
- **Decision: not built.** Copying it would mean either using Fribbels' private server without permission, which also
  sends the user's raw game traffic (possibly account and session data) to a third party, or reverse-engineering the
  game's network protocol ourselves, which is likely against the game's terms and risky for accounts. Both conflict
  with this project's privacy rule.
  Safe alternative proposed to the owner: a **screen-based gear reader** (the same approach as the draft reader:
  calibrate the item-details panel once, read each item with OCR as you browse the inventory). It needs a screenshot
  of the in-game item details screen. Waiting for the owner's decision.

**Changed**
- `js/guild-pip.js` (new): the Guild War pop-out (Document Picture-in-Picture, falls back to a pop-up).
  - The current enemy player with their dot (only teams still standing count).
  - Each team: verdict, reasons, speeds, builds, "also owned by".
  - One-tap Won / Lost: logs the suggested counter as your team, with your speeds; Won asks to confirm.
  - Prev/Next through uncleared targets, best chance first (green → ring → yellow → grey → red); a name search;
    "Full history"; your attacks left today.
- `js/guild-watch.js` (new): **Watch game**.
  - Captures the emulator window and, once you box where the enemy's name appears (saved on this device, per browser),
    reads it every 2 s with tesseract.js.
  - The name must be the same twice in a row before switching, which avoids flicker. Only reads the screen.
- `js/guildwar.js`: `matchPlayer()` (OCR-tolerant name matching: about 1 mistake per 4 letters, or a
  substring with extra text like "Lv.60 Name") and `editDistance()`.
- `js/guild-app.js`: ⧉ button on each card; `window.GuildApp` API (current player, verdicts, quick log, history);
  listeners refresh the pop-out on every change.
- `guild.html`: Pop out / Watch game / Set name box buttons, name-box calibration dialog. `sw.js` cache v8.

**Tested**
- `npm test`: 62 passing (new: matchPlayer with typos, extra text, Korean, strangers rejected).
- Browser, using the seeded two-season guild from #9:
  - The pop-out opened from ⧉ shows RivalOne with a green team 1 ("280 vs their fastest ~250") and a red team 2.
  - Next moves to the next target; a typed name works.
  - One-tap Won logged Ruele + Lilias + Arbiter Vildred with speed 280: attacks left 2 → 1, team shown cleared.
  - Watch game read "Quiet" from a generated game frame and switched the pop-out.
  - No console errors.

**Not tested / open**
- Real emulator screens (the name position and font) and real Document PiP on a desktop (headless used the pop-up fallback).
- Getting gear without Fribbels: waiting on the owner's choice (screen-based reader needs an item-details screenshot).

---

## 2026-11-12 · #9 · Guild War verdict dots, gear check, player history across seasons · this commit (previous: `d40be0d`)

**Asked for**
- A marker next to each Guild War player: grey (no info), yellow (not enough info), green (win if you use the right
  heroes and gear), plus the suggested red. It should consider **your own gear**, with a different look for people who
  haven't imported gear.
- Use enemies' stats from previous fights, and record players across seasons (their heroes and gear before).
- Hover or press to load a player's previous information from any time anyone met them.
- (Also asked: what the app is right now; a mobile version in the future; training RTA from the official match history.
  Answers are under Open.)

**Design**
- Each enemy team gets a verdict for the viewing member (their heroes + their gear). The player's dot is their weakest
  team **still standing** (cleared teams are ignored).
  - grey: no information.
  - red: lost to it 2+ times and never won (or 3+ losses to similar teams with no wins).
  - yellow: some information or a catch.
  - green ring: proven counter you own, gear not checked.
  - green: proven counter you own and gear checks out.
- "Proven" = beaten this exact team 2+ times with 0 losses, or 3+ wins at 80%+. Wording says "reliable", not
  "guaranteed" (crits and turn meter can always flip a fight).
- Gear check:
  - Your speeds come from your gear.txt on this device (computed with `RTAGear`; nothing is uploaded).
  - Each counter hero must be no more than 2 slower than the slowest speed that hero has won with.
  - Your fastest hero must beat the enemy's fastest recorded speed by at least 3%. That speed is the latest per hero
    from any earlier time anyone recorded this player, and this war's entry overrides it.
  - Too close to call or slower → yellow, with the numbers in the reason.
- Red and green are deliberately separate colours, plus a ring for "proven, gear not checked", so a colour-blind
  reader can still tell filled from hollow.

**Changed**
- `js/guildwar.js`:
  - `counterBook` keeps the slowest winning speed per hero (`winSpeeds`).
  - New: `recordVs`, `enemySpeeds`, `teamVerdict`, `gearCheck`, `targetVerdict`, `playerProfile` (appearances
    newest first, latest and highest speed per hero, builds noted, seasons, record), `LEVELS`, `PROVEN`.
  - Verdict text uses hero names (a name function is passed in).
- Records: `war.season` (asked when starting a war, pre-filled with the last one); `attack.speeds` (attacker's own
  speeds, attached only when you log your own attack and "Attach my hero speeds" is on in Setup, which is the default).
- `js/guild-app.js` / `guild.html`:
  - Dots on every player and team, a one-line reason under each team, a legend and a filter by dot.
  - Tap a dot or name to open the player history window: verdict per team with reasons, heroes over time, builds,
    every meeting in every war and season with attacks and speeds, and your own RTA record vs that name (this device
    only, labelled `my RTA`, not shared).
  - The Enemies list shows dots too.
  - Setup shows whether your gear was found and has the share-speeds toggle.
  - The page now also loads `js/gear.js` + `js/sources/fribbels-data.js` to compute your speeds.
- CSS: `.gwdot` styles (filled / ring / glow), legend, wide dialog.

**Tested**
- `npm test`: 61 passing (new: grey, red, yellow ×3 cases, proven without gear, green with gear, yellow when slower,
  weakest-team player dot, profile across 2 seasons).
- Browser, with a guild history seeded from "other members" over Season 11 and 12 and gear for this device:
  - The expected dots everywhere: green "280 vs their fastest ~250", using Seaside Bellona's speed from last season;
    red for a team lost to twice (also caught on another player with the same team); yellow for similar-only; grey for unknown.
  - Filtering red works; tapping a dot opens history spanning both seasons; without gear the green becomes a ring.
  - No errors; no sideways scrolling on phones. The earlier Guild War test still passes.

**Open / unverified**
- The thresholds (2 wins, 3%, 2 speed) are first guesses; easy to tune once the guild has real data.
- Gear check uses **speed only**. Other stats (effectiveness, crit, HP) aren't compared yet.
- Other members' gear isn't checked for "Also owned by" (only their roster). Their speeds appear once they log attacks.
- **Official RTA match history (owner's idea):** good source for training RTA. It can't be reached from the dev
  environment and needs the owner's login, which we must not handle. Plan: an "export my matches" bookmarklet the
  owner runs on the official site while logged in, which saves a file the RTA module imports as its own source
  (`official records`). Needs a screenshot or saved copy of the match-history page to build.
- **Mobile:** today every page works in a phone browser and can be installed, but automatic screen reading needs
  an Android app (screen capture permission + floating bubble). iPhone is very limited. Planned for after the PC
  version has been tested on the real game.

---

## 2026-11-12 · #8 · Epic 7 Engine home page and module switcher · this commit (previous: `2c0234e`)

**Asked for:** "Epic 7 Engine" is the overall application; under it you select Guild War, Gear, RTA "and the rest".

**Changed**
- `index.html` is now the **home page** (module picker). The RTA helper moved to **`rta.html`** (`git mv`, history kept).
  - Cards for RTA, Gear and Guild War, plus a "More coming" placeholder for future modules.
  - Each card shows a one-line status from this device's storage (`js/home.js`, new): matches logged and win %,
    gear items imported, and guild name with shared or local.
  - A short getting-started list.
- Every page has the same **app bar**: "Epic 7 Engine" (links home) plus a module switcher
  (RTA · Gear · Guild War, current one highlighted). A module's own tabs sit underneath in a second row.
  The old "Gear ↗ / RTA ↗ / Guild War ↗" links in each page's tabs were removed.
- `manifest.webmanifest`: installed-app shortcuts for RTA, Gear and Guild War (`start_url` stays the home page).
- `sw.js` cache `epic7-engine-v7` (adds `rta.html`, `js/home.js`); Pages workflow publishes `rta.html`.
- README and CLAUDE.md describe the home page + modules layout and how to add a module
  (a page, a home card, an app-bar link).

**Bugs found and fixed**
- Turn beep: the browser warned "AudioContext was not allowed to start" because the beep could fire before any
  click. It now only plays after the user has interacted with the page (`navigator.userActivation.hasBeenActive`).
- (Test only) The full RTA browser test stopped reading the opponent's name. The taller two-row header pushed the
  bottom of the calibration image below the test window, so the name box drag missed and the box was never saved.
  Checked that OCR itself still works (read "RivalOne"); made the test window taller. In real use you scroll.

**Tested**
- `npm test`: 56 passing.
- Browser:
  - Home page statuses are correct.
  - Each module link opens the right page with the right module highlighted and its own tabs; the brand returns home.
  - RTA tab switching still works; no sideways scrolling on phones for all 4 pages.
- All earlier browser tests re-run against `rta.html`:
  - Draft, postbans, OCR name, CR speeds, auto-recorded result.
  - Drafting help, gear sorter (same 248-item result), Guild War live sync. No console errors.

**Open / notes**
- Old bookmarks to `index.html` now open the home page (one click to RTA). RTA data is unchanged
  (same storage key `rta-helper-v2`).
- "More coming" is a placeholder; tell me which modules you want next.

---

## 2026-11-12 · #7 · Epic 7 Engine + Guild War (shared with the guild) · this commit (previous: `93abee7`)

**Asked for:** turn the app into a bigger toolkit, named **"Epic 7 Engine"** (the owner corrected an earlier
"RTA engine": it helps with the whole game, not just RTA). Add a Guild War feature that tracks everything for every
player and is shared between guildmates.

**Decisions (asked and answered)**
- "Guild Wars" = **Epic Seven's Guild War mode**, not the separate game Guild Wars 2.
- Sharing: **free Firebase** (Firestore + anonymous sign-in), chosen over sharing files in Discord or a GitHub repo.
- Rename now.

**Research:** Firebase JS SDK 10.12.2 "compat" builds load from `www.gstatic.com` (checked: HTTP 200), so no build step is needed.

**Changed**
- Rename: page titles and headers ("Epic 7 Engine · RTA / Gear / Guild War"), shared nav links between the 3 pages,
  manifest (`Epic 7 Engine` / `E7 Engine`), `package.json` name `epic7-engine`, README intro, footer, CLAUDE.md.
  Service worker cache `epic7-engine-v6` now includes the guild files. Pages workflow publishes `guild.html`,
  `docs/` and `firestore.rules`. The repository name is unchanged.
- `js/guildwar.js` (new, pure): all guild data is a flat list of records (`member`, `war`, `target`, `attack`,
  `defense`, `settings`), and the newest copy of each record wins. Functions:
  - `warSummary` (cleared, attacks left per member per day)
  - `targetStatus`
  - `counterBook` (enemy defense → our attack teams with record)
  - `suggestCounters` (exact first, then 2-of-3 similar, plus which members own the team)
  - `assignmentIdeas`, `enemyHistory` (case-insensitive across wars), `memberStats`, `threatHeroes`
  - Rules (attacks per member per day = 2, teams per defense = 2) are shared settings, not hard-coded, because
    the current in-game numbers are unconfirmed.
- `js/sync.js` (new): one interface, two backends.
  - `local`: localStorage, with BroadcastChannel so other tabs update live.
  - `firebase`: Firestore `guilds/{code}/records/{id}`, live updates, anonymous sign-in, soft deletes.
  - Also: pasted-config parser (accepts the `const firebaseConfig = {...}` snippet) and invite links
    (`guild.html#g=<code>&c=<config>`). The hash never reaches a server and is cleared from the address bar after use.
- `guild.html` + `js/guild-app.js` (new): War, Counters, Members (my defense, defense log, share roster),
  Enemies and Setup (name, create/join guild, invite link, Firebase connect, rules, export/import that merges by
  newest record).
- Guild War data is its own source (`guild`) and is not mixed into RTA data. Sharing a roster sends only the codes
  of heroes you own (from the RTA helper's Fribbels import + owned ticks), never gear.
- `firestore.rules` (new): sign-in required, guild code at least 12 characters, known record types only, size limits,
  everything else denied. `docs/GUILD_SETUP.md` (new): 10-minute setup for the guild leader.

**Bugs found and fixed**
- A test expected only Bob for an assignment, but Ann also had attacks left (the test was wrong; fixed).
- Guild portraits were blank in screenshots: they loaded lazily and without `crossorigin`. Now loaded immediately (6/6 loaded).

**Tested**
- `npm test`: 56 passing. New tests: state merge/delete, war summary per day, counter book, exact vs similar
  counters with owners, assignments, enemy history, member stats, threats, local sync, **Firebase sync against a
  fake SDK** (anonymous sign-in, guild path, live updates, soft delete), config parsing, invite links.
- Browser (over http, local mode):
  - Guild created; war, defense and attacks logged; a second page updated live.
  - In war 2 a similar enemy defense showed "Beaten before by …" and suggested the member who owns that team;
    the attack form filled it in.
  - Counters, enemy history across wars, my defense and defense log work; the invite link opened in a fresh profile
    (lands on Setup, code saved, hash cleared).
  - No console errors; no sideways scrolling on phones; RTA and Gear pages still load with the new titles.

**Not tested / open**
- **Real Firebase not tested** (no project exists yet). Only the fake-SDK test covers that code. The first real
  connection should be checked by the owner following `docs/GUILD_SETUP.md`.
- Guild War rules defaults are assumptions and can be edited in Setup.
- Enemy defenses are entered by hand; reading them from the screen needs screenshots.
- Anyone with the guild code can edit everything (no per-member permissions yet).

---

## 2026-11-12 · #6 · Devlog started

**Asked for:** document everything in a devlog, with every modification and change.

**Changed**
- Added `DEVLOG.md` (this file), with entries #1–#5 written retroactively from the commit history and session notes.
- `CLAUDE.md`: new standing rule. Every change adds a devlog entry in the same commit.

**Tested:** documentation only; no code changed. `npm test`: 48 passing.

---

## 2026-11-12 · #5 · RexQian fork, game's drafting help, Gear Sorter · commit `96bdfde`

**Asked for**
1. Use the RexQian fork of the Fribbels optimizer, since the original is no longer updated.
2. Use RTA's built-in **drafting help** (the game's own pick and ban recommendations) to build our own database.
3. A gear sorter: what to keep, enhance, reforge, extract, sell or buy, and which hero each item suits.

**Research**
- RexQian fork (`github.com/RexQian/Fribbels-Epic-7-Optimizer`), last updated for patch 2026-08-28:
  - Its `heroData.js` still loads `herodata.json` and `artifactdata.json` from the same S3 bucket we already used
    (`e7-optimizer-game-data.s3-accelerate.amazonaws.com`).
  - The fork's newest data branch (`e7-data-291fab…`, 2026-10-29) has exactly the same 393 heroes as S3.
    The copy on its `main` branch is an older fallback (388 heroes).
  - `scanner.js` is identical to the original. The export is still `{"items": [...], "heroes": [...]}`, and items
    carry `gear, rank, set, level, enhance, main, substats[{type, value, rolls}], ingameEquippedId`.
  - Gear score (WSS, `backend/.../ItemDb.java`): substats only. %stats ×1, Speed ×2, Crit Damage ×8/7,
    Crit Chance ×8/5, flat Attack ×3.46/39, flat Defense ×4.99/31, flat HP ×3.09/174.
  - Reforge (level 85 → 90, `app/js/lib/reforge.js`), added per substat by roll count:
    %stats [1,3,4,5,7,8], Crit Chance +rolls, Crit Damage [1,2,3,4,6,7], Speed [0,1,2,3,4,4],
    Attack +11/roll, Defense +9/roll, HP +56/roll. Gaveleet's items can't be reforged.
    Maximum rolls at +15: Epic 9, Heroic 8, Rare 7.

**Changed**
- `js/gear.js`, `tools/update-fribbels-data.js`, Data tab text: data comes from the RexQian fork, with the S3
  bucket first and the fork's GitHub copy as fallback (both allow browser access). The built-in copy
  `js/sources/fribbels-data.js` was regenerated and now records `fork: RexQian/...`.
- Game's drafting help (new source `game help`):
  - `js/vision.js`: `GAME_HELP_STEPS` and `helpSlots()`. You box the first and last recommended icon, and
    N icons are spaced evenly between them.
  - `js/auto.js`: help icons are recognized each check. The same list twice in a row is saved once per
    draft step, via `App.addGameHelp`. Calibrated with **Calibrate game's drafting help**.
  - `js/learn.js`: `gameHelpStats()` builds `against` (enemy → recommended heroes), `with` (ally →
    recommended heroes), `picks`, `bans`, and follow-through (win rate when 2+ of your picks were recommended).
  - `js/logic.js`: new signal group `game help`. Live recommendation +3 for #1, 15% less per rank;
    the learned database adds +0.4 against / +0.25 with per time (max 5) and a ban signal for prebans.
    It also adds to postban suggestions.
  - `js/app.js` / `index.html`: `store.gameHelp`, a Data card (count, CSV export, delete), an on/off switch,
    a weight slider, a Teams card to browse the database, and a History card on follow-through.
- Gear Sorter (new page `gear.html` + `js/gear-app.js`, logic in `js/gearsort.js`):
  - WSS score, score after reforge, expected and best-case score at +15 (about 6 / 8 WSS per remaining roll).
  - Hero profiles: stat weights = 50% the substats the hero's current gear rolled into + 50% a class default
    (Speed is always ≥1), or your own per-hero override. Preferred main stats and sets come from current gear.
  - The item's fit for each hero is compared with what that hero wears in the slot, which gives "upgrade +N".
  - Verdicts (adjustable rules of thumb): Keep, Enhance, Reforge, Extract (level 85+), Sell.
  - Shop check form ("worth buying?").
  - Shares `gear.txt`: importing in either app updates both. The full inventory is stored in localStorage
    under `rta-gear-v1`; the main app's `fribbels` roster is updated too.
- Service worker cache `v5` and the Pages workflow now include `gear.html`. Links styled for the dark theme.

**Tested**
- `npm test`: 48 passing (new: reforge table, WSS, rolls left, inventory linking, verdicts, profile override,
  help strip layout, game-help database, game-help signals).
- Browser: a fake draft screen with a 3-hero help strip. All 3 recognized (90–92%), saved with the board,
  shown live in suggestions, and visible in the database card. A generated 248-item inventory gave
  Keep 115 / Enhance 31 / Reforge 6 / Extract 76 / Sell 20. Hero filter, profile sliders and shop check work.
  Importing on the gear page updated the main app (8 builds). No console errors; no sideways scrolling on phones.

**Open / unverified**
- The real drafting-help layout hasn't been seen (it may show win-% numbers or a grid). Needs a screenshot.
- Keep/Sell thresholds are rules of thumb. What extracting gives in the current game is unconfirmed; the UI says to check in game.
- No real `gear.txt` has been tested yet.

---

## 2026-11-12 · #4 · Gear builds, scouting, smarter drafting, more automation · commit `a05af7d`

**Asked for:** "all of" the 14 ideas proposed in #3's follow-up, plus storing what gear opponents may have
during a match. Question: will the app consider my gear, sets and artifacts, and opponents'?

**Research**
- Fribbels `scanner.js`: items link to heroes through `ingameEquippedId` = the hero's in-game `id`.
  Set ids are `SpeedSet` etc.; stat ids are `Speed`, `CriticalHitChancePercent`, etc.
- Hero base stats: `herodata.json` (S3), `calculatedStatus.lv60SixStarFullyAwakened.spd`, keyed by name,
  including `code`. Browsers can load it. 31 heroes have exclusive equipment with a speed option.
  Imprints never give speed.
- The official World Arena infographics (Stove) are drawn by scripts as images, with no table data.
- The official battle-record site (`epic7.gg.onstove.com`) returns 503 from the dev environment; not usable from here.

**Changed**
- `js/gear.js` (new): links equipped items to heroes and calculates speed exactly:
  `floor(base × (1 + 25% Speed set + 12% Revenge set) + flat speed)`; also sets and artifact.
  Built-in copy of the stats and artifact list: `js/sources/fribbels-data.js` (source `fribbels-data`).
- Scouting (new source `scouting`): a Draft panel per enemy hero (speed / sets / artifact), saved per player and
  per hero, and linked to the match when recorded. `Learn.scoutSummary()` gives median and low–high speed
  plus common sets and artifacts.
- Speed edge signal (`speed`): your gear speed vs the speed seen for that opponent, else for all players
  (±0.6 per enemy, 3% buffer). Draft speed check: your fastest vs their fastest.
- Auto (`js/auto.js`):
  - Postban detection (experimental): a pick slot that changes most from how it looked when confirmed,
    3 checks in a row.
  - Victory/Defeat OCR, recorded as source `auto`.
  - CR-bar reader: each fighter's portrait is matched along the bar, then `L.speedsFromCR()` uses your known
    speeds as reference (speed = CR / t).
  - Calibration supports step subsets (CR bar, result banner) and a setting for which end is 100%.
- Draft (`js/logic.js`): source weights (`ctx.sourceWeights`, with a per-source `bySource` breakdown),
  best pairs on 2-pick turns, first-pick safety, postban risk (with the opponent's ban habits), deny,
  role tags + `compositionWarnings()`, and meta datasets (`meta: <name>`, CSV import).
- `js/tune.js` (new): "Tune from my matches", a logistic regression on per-source team score differences.
  Learned stats are rebuilt without the match being scored. Needs 15+ matches.
- Session: today's record, streak, a warning after 3+ losses, rank points (optional field, SVG chart), and
  whether following suggestions wins more (`suggestLog` per draft).
- `js/pip.js` (new): always-on-top mini window (Document Picture-in-Picture, falls back to a pop-up).
- Shortcuts (1/2/3, U, N, W/L, P, R, ?) and a beep when your turn starts.
- Installable app: `manifest.webmanifest`, `icon.svg`, `sw.js` (offline); `.github/workflows/pages.yml`.

**Bugs found and fixed while testing**
- Results read from the screen were saved as `manual`: `matchFromDraft` hard-coded the source. Fixed.
- "all: 230–230" when there was only one reading; now shows "~230".
- Heroes table header indentation didn't match the edit script (no change applied; fixed and re-run).

**Tested**
- `npm test`: 40 passing.
- Browser on generated screens:
  - Gear speed of 242 for Arbiter Vildred (116×1.25+97), matching the hand calculation.
  - Full draft and both postbans detected; opponent name by OCR.
  - CR read gave 230/205/101/189 against true 230/205/100/190.
  - Victory OCR auto-recorded the match.
  - Pairs, deny, hotkeys and the mini-window fallback all work.
- Over http: service worker registered; offline reload works.

**Open / unverified**
- Opponents' sets and artifacts are typed by hand; the screen gives only speed.
- Battle records not possible from here; meta stats must be imported as CSV.
- Exclusive-equipment speed isn't in gear.txt (affected heroes are marked *).

---

## 2026-11-12 · #3 · Auto-detect the draft from the emulator window · commit `27195ef`

**Asked for:** make it fully automatic. The owner plays on PC with an emulator.

**Design**
- Browser screen capture (`getDisplayMedia`) of the emulator window; a screenshot file also works.
- One-time calibration: drag boxes over the slots. For pick columns, only the first and last box are drawn;
  the middle ones are spaced evenly. Saved as fractions of the frame so it survives resizing.
- Recognition (`js/vision.js`): every slot and portrait is shrunk to 16×16 RGB and compared by correlation,
  so overall brightness doesn't matter. Templates are official portraits at 3 crop sizes,
  plus `my corrections` (preferred) and optional `auto-learned`.
- The board becomes the draft through `L.boardToDraft()`, replayed in official order; it stops at the first
  gap or duplicate. Who picked first is worked out while only one side has picks. A new match starts when
  new prebans appear. **The draft never shrinks automatically.**
- OCR of the opponent's name with tesseract.js 5.1.1, loaded only when needed.

**Bugs found and fixed while testing**
- First version locked in a look-alike (Arbiter Vildred vs Vildred, 91% vs 89%) because detection ran
  before all portraits had loaded. Detection now waits for them.
- Correct heroes below the 72% bar stalled the draft (one unsure preban blocks the replay). Fixes: 7
  slightly shifted crops per slot, and a second rule that accepts a score down to 15 points lower when it
  leads the runner-up by 0.12 or more.
  Result: 90–97% on all slots.
- A corrected slot showed "103%"; display capped at 100%.
- `applyBoard` logic simplified to two rules (new match → replace; otherwise apply only if not smaller).

**Tested:** `npm test` 25 passing. A generated 1600×900 draft screen (zoomed, tinted, framed, JPEG) gave the
full draft with no clicks, OCR read "RivalOne", and a correction was preferred afterwards.

**Open:** needs real emulator screenshots to tune for the real art and layout.

---

## 2026-11-12 · #2 · Official hero list, separate sources, learning, players, presets · commit `a79a0a9`

**Asked for:** fully automatic; option A (an online database) or B (learn from my picks and bans); roster from
Fribbels `gear.txt`; player profiles; team presets and combos; "a powerful application". Also:
**keep data separated by source in case one is wrong**, and **never leak my email**.

**Research**
- Official hero list: `static.smilegatemegaport.com/gameRecord/epic7/epic7_hero.json`. Browsers can load it,
  it's in 10 languages, and it has 370 entries (368 playable after dropping NPC codes `c0xxx`).
  Earth is `wind` and Thief/Soul Weaver are `assassin`/`manauser`.
  This showed the first version's hand-typed list had mistakes (for example, the game classes Arbiter Vildred
  as an assassin).
- Portraits: `.../guide/images/hero/{code}_s.png`, which browsers can load.
- No public RTA stats feed exists; official pick/ban/win rates are only in image infographics.
  → Core = option B (learn from logged matches), with every source kept separate.

**Changed**
- `js/roster.js`: official list parsing, name matching, Fribbels import, CSV match import.
- `js/learn.js`: hero, matchup (a>b) and pair stats; smoothing (4 imaginary games at 50%); postbanned heroes
  left out of fighting stats; player profiles; best combos; preset records.
- Suggestions: every reason labeled with its source (`my notes`, `learned`, `game rule`, `presets`, `player`).
- New tabs: Teams (presets, best pairs/trios), Players, Data (source switches, imports, backup).
- Storage v2 with an upgrade from v1. `CLAUDE.md` added with the privacy rule and the separate-sources rule.

**Tested:** `npm test` 18 passing. Browser: v1 upgrade, Fribbels import (unknown names listed), CSV import as
`import:<name>`, profile-based predictions, presets. Commits use the no-reply identity; no personal details in the repo.

---

## 2026-11-12 · #1 · First version · commit `cef3808`

**Asked for:** "my own RTA live helper for Epic 7".

**Changed:** static browser app, no build step (opens from `index.html`, works on phones).
- Draft tracker in RTA order: 2+2 prebans, picks 1-2-2-2-2-1, then 1 postban each.
- Suggestions from tiers, counters and synergies you enter, plus element advantage.
- Speed tools: enemy speed from the CR bar (range for 0–5% random start CR), the speed needed to outspeed,
  and a turn order simulator with CR push.
- Hero database (60-hero starter list), match history with win rates, JSON export/import.

**Bugs fixed:** typing "Ravi" + Enter picked "Apocalypse Ravi"; Enter now prefers an exact match, then names
that start with the text.

**Tested:** `node --test` 9 passing; full-draft browser test; no sideways scrolling on phones.

---

## Entry template

```
## YYYY-MM-DD · #N · Short title · commit `<hash>` (add after committing, or say "this commit")

**Asked for:** what the owner requested (paraphrased).
**Research:** sources checked, facts found (with URLs/paths), anything that changed the plan.
**Changed:** files and behaviour, grouped by feature. Note new data sources and how they're kept separate.
**Bugs found and fixed:** symptom → cause → fix.
**Tested:** unit test count, browser checks, what was NOT tested.
**Open / unverified:** assumptions, guesses, things that need real data or the owner's input.
```
