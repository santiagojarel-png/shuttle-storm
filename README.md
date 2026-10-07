# Shuttle Storm

A local-first badminton doubles queue manager built with HTML, CSS and vanilla JavaScript ES modules. No framework, package dependencies, Firebase dependency, tracking or reference-site runtime requests.

## Run

Install a current Node.js LTS release if Node is not already available. From this folder:

```sh
npm start
```

Open **http://localhost:4173**. No `npm install` or build is needed. Do not open `index.html` with a `file://` URL: modules and service workers need a web server.

The development server listens only on this computer. To install on an Android phone, deploy the static app files to an HTTPS host and open that URL in Chrome. Then use Settings → Install app or the browser's install menu. An ordinary HTTP LAN address is not sufficient for PWA installation. No hosting account or public deployment has been configured in this version.

## Use

1. Open Players and add names, genders and skill levels. Bulk add accepts one name per line and assigns common initial gender/skill values.
2. Open Queue and use + Add Court to add your courts (blank names become Court 1, Court 2, etc.). The court overview appears at the top, showing availability and current teams with VS between them. Below it, choose Balanced, Mixed Doubles or Same Gender Balanced, then Generate queue. This fills as many disjoint matches as the eligible pool allows. Existing matches remain intact.
3. Use Start next match on an available court to assign the first queued match there, or Start match on a queued match to use the first available court. Each court hosts one active match. Court creation, removal and match controls all live in Queue. Old #courts links redirect to Queue.
4. Use Finish match on its court card and select the winner. This frees the court. All four players get a game, winners get wins, and opponents get losses.
5. Use Stats to correct participants/results or delete a mistaken completed match. Statistics are rebuilt from history each time.
6. Finance stores costs, fee rules and paid flags. Payment never changes player status.
7. Use Settings → Export full session JSON to keep a separate backup. Import validates it, then requires confirmation before replacing the session. CSV exports are for spreadsheets, not restoring app data.

Edit teams to replace players or swap partners/opponents. The up/down buttons reorder queued matches. Remove releases the players. Players in a queued or playing match must be released or finish before changing their status. Profile deletion is blocked when a player has completed history; check them out instead, or delete the profile after starting a new session.

Start new session keeps stable player IDs, names, genders, skill levels and app preferences, plus configured courts. It resets session data, costs and payments, and moves every player to standby for explicit check-in. Clear all players is a separate confirmed operation that also removes the roster. Both set a fresh session start time. Export first if you want to preserve the previous session.

## Project map

| File | Responsibility |
| --- | --- |
| `index.html`, `styles.css` | Semantic shell, original club branding, responsive dark/light themes |
| `js/constants.js` | Skill labels, statuses, modes, default weights and IDs |
| `js/state.js` | Central schema, state factory and full integrity validation |
| `js/storage.js` | Transactional local persistence, validated JSON import, stale-tab checks |
| `js/players.js` | Player profiles, eligibility, check-in, status and deletion rules |
| `js/matchmaking.js` | Fair player selection and weighted team optimization |
| `js/courts.js` | Court creation, availability and protected removal |
| `js/queue.js` | Queue generation, manual matches, ordering, start, finish and corrections |
| `js/stats.js` | History-derived stats, last-play times and safe CSV formatting |
| `js/finance.js` | Integer-cent costs, fees and payment summaries |
| `js/session.js` | New-session and clear-roster operations |
| `js/views.js`, `js/ui.js`, `js/app.js` | Rendering, dialogs, input handling, navigation and downloads |
| `manifest.webmanifest`, `sw.js`, `icons/` | Install metadata and offline shell |
| `tests/core.test.js`, `tests/courts.test.js` | Automated integrity, court and view behavior tests |
| `scripts/serve.js`, `scripts/check.js` | Dependency-free local server and syntax/asset checks |

## Matchmaking algorithm

Selection and team balancing are separate so a skill advantage cannot continually push a waiting player out of the eligible group.

1. Exclude standby, checked-out, playing and already-queued players. A player can be reserved in at most one unfinished match.
2. Calculate a priority cost for every eligible player (lower is better):

   `games × gamesWeight − cappedWaitingMinutes × waitingWeight + fadingArrivalPenalty × arrivalWeight`

   Waiting begins at the later of the player's latest activation and their latest completed match. It is capped at 60 minutes in the scoring function. The arrival penalty falls linearly from 1 to 0 over ten minutes after activation, then disappears. Arrival has no permanent session-long penalty. The UI shows uncapped waiting time.

3. Default weights are games **100**, waiting **2**, arrival **40**. With these values, one game usually dominates moderate waiting differences, but long waits can outweigh a one-game difference. A player with one game normally beats someone with four. Settings exposes these weights, and `DEFAULT_WEIGHTS` is the central source of defaults.
4. Balanced chooses the first four. Mixed selects the two highest-priority male and two highest-priority female players. Same Gender Balanced chooses the feasible group of four with the lowest combined priority cost. If the required pool is missing, show a specific explanation instead of silently falling back to a different mode. Other is a supported gender; four Other players can form a same-gender match, and all genders are eligible in Balanced.
5. Evaluate the three possible team partitions of those four players. Mixed retains only male/female teams. Minimize:

   `absoluteSkillDifference × skillWeight + priorPartnerCount × partnerWeight + priorOpponentCount × opponentWeight`

   Default skill, partner and opponent weights are **12**, **8**, and **3**. Pair counts use the most recent 40 completed matches. Numeric skill ranks are 1–5 in the order specified by Shuttle Storm; the UI displays labels. High variety weights can deliberately trade some skill balance for new pairings.
6. Reserve selected players, then repeat until another valid group is unavailable. Generation appends to the existing queue and never silently replaces manual work.

Ties are deterministic using activation time and stable player ID. This is a transparent heuristic, not a claim of globally optimal scheduling. Automatic scheduling does not rewrite already-queued matches after a new arrival or a history correction. Remove and regenerate affected queued matches when the manager wants to reconsider them.

## State and persistence

The state contains `schemaVersion`, `revision`, `session`, `players`, `courts`, `queue`, `activeMatches`, `completedMatches`, `finance`, and `settings`. Matches reference courts through `courtId`. Courts and assignments persist through refresh and JSON backup/restore. Older backups without court fields remain supported; their active matches appear under Playing without a court and can still be finished.

All UI mutations go through `store.update`: clone → apply business operation → validate entire draft → rebuild derived stats → persist → render. Failed writes do not publish an unsaved state. Imported game counts, win/loss totals, last-play time and current-match markers are overwritten with values derived from validated history and active matches. Winner is internally team index 0 or 1.

The single active session uses localStorage. This keeps the learning project small and exportable; limits are 500 players, 10,000 matches per list and 10 MB JSON imports. Browser storage quota can be lower. Errors remain visible and the previous saved state is retained. Export regularly, especially before starting fresh. Clearing browser site data, using private browsing or switching origin/browser/device does not preserve this local copy. `localhost` and `127.0.0.1` are separate storage origins.

Web Locks serialize writes across tabs where supported. A stale tab loads the newest revision and rejects its pending operation so the manager can review and retry. Without Web Locks the revision check still detects most stale writes, but simultaneous writes are not atomic across tabs: use one manager tab. This is not live multi-device synchronization.

Corrupt saved data is not silently discarded. The recovery screen offers the raw stored value for download. A maintainer can repair the JSON, clear the damaged browser data, then import the repaired backup.

## Finance baseline

- Total cost = session/venue cost + shuttlecock unit cost × quantity + other expenses.
- Equal split divides among **all roster members**, including standby/checked-out players. Remainder cents are assigned in stable roster order.
- Flat fee, per-game contribution, and flat + per-game rules are also supported.
- Currency is configurable (PHP default, SGD, USD).
- Paid is a boolean session flag, not a historical receipt amount. Collected/remaining amounts use **current** calculated fees. Costs, games or roster changes can change these totals. The UI explicitly labels this behavior.
- Actual club fee policies, partial payments, refunds, immutable receipts and exemptions are future work in `finance.js`.

## Offline and release behavior

The service worker pre-caches the whole app shell, modules and icons. The first successful visit needs network access; subsequent refreshes and core session operations can work without the server. App-shell installation failure is reported while local session saving remains available.

For a new release, change the cache version in `sw.js` whenever a cached asset changes. Updates wait until all old windows close to avoid swapping JavaScript modules in the middle of a session. Session data lives outside the shell cache. Do not clear site data to update the app.

## Firebase — deferred phase

Authentication, cloud backup and multi-device continuation are **not implemented or connected** in this first local version. No Firebase credentials or SDK were invented or added. The queue, history, finance and export/import flows do not depend on a cloud service.

Before implementing the optional Firebase phase, the project owner will need to provide their Firebase web app configuration, enable the chosen authentication providers, create Firestore, and configure its allowed domains and authenticated per-user security rules. The intended integration is an explicit upload/download backup adapter: uploads must report success/failure, and downloads must pass the same local validation and overwrite confirmation. Local changes must continue to work when cloud requests fail. Concurrent-device merging will require a separate conflict policy and should not be presented as automatic live sync.

## Verification

```sh
npm test
npm run check
```

Automated tests cover court naming, occupancy, Queue rendering, legacy backups, unique doubles matches, fewer-game and wait priority, fading arrival effects, active/queued exclusion, standby/checkout, completion, history corrections and deletion, replacement players, mixed/same-gender constraints, skill balance, partner variety, refresh persistence, JSON round trips, malformed imports, failed storage writes, stale tabs, reset distinctions, payments, exact-cent splits, duplicate-name override, protected profile deletion, reorder and CSV formula escaping.

Browser smoke tests performed in an isolated test origin:

- Added eight test players, generated two matches, started/finished a match, and refreshed successfully.
- Corrected the winner and verified recalculated wins/losses.
- Stopped the local server, reloaded the cached app, saved finance changes, reloaded again, generated and started matches.
- Verified Queue court creation, start/finish actions, statistics, legacy Courts-link redirection and refresh persistence.
- Inspected desktop (1366 × 900) and phone (390 × 844) layouts in dark/light themes; checked 320px width and long names for horizontal overflow.

Physical Android installation and Firebase have not been verified. This is a working local first version, not a hosted production deployment.

## Functional reference

The public UI at https://www.smashsyndicateph.com/ was reviewed only for player, queue, stats, finance and backup workflows. No source code, text, branding, logo or proprietary asset was copied. Its tournament, subscription, and advertising systems are outside this app's scope.
