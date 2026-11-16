# Phase 22B: Player pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PLAYERS, the list of every player with counted games by Elo, and a page per player with
their numbers and trophies: the last phase of issue #31.

**Architecture:** Phase 22A already computes everything: `player.ts` gives `computePlayer` and
`computePlayersList`, `trophies.ts` the trophies, `players/TrophyBadge.tsx` the badge, and every
name is a link to `/stats/players/<n>`. This phase fills Phase 15's two placeholders in `players/`,
each a thin wrapper (hooks, `now`, the filter bar) around a pure view that Vitest renders, plus the
text helpers those views share.

**Tech Stack:** React 18, TypeScript 5 (ES2020), Vite, Vitest with Testing Library, Playwright. No
new dependency; the rating history uses Phase 17's `charts/LineChart.tsx`.

**Spec:** [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](../specs/2026-11-15-game-stats-design.md)
("PLAYERS and the player page (Phase 22)", "Counting rules"), mockup
[`player-and-phone.jpg`](../specs/2026-11-15-game-stats/player-and-phone.jpg) (left). Shared names:
[`2026-11-15-game-stats-interfaces.md`](2026-11-15-game-stats-interfaces.md), whose "Settled after
the plans were written" section wins over any other breakdown. Before this:
[`2026-11-15-phase-22a-trophies-links.md`](2026-11-15-phase-22a-trophies-links.md). Parent plan:
[`docs/PLAN.md`](../../PLAN.md), Phase 22B. Where this plan and the spec differ, the spec wins.

## Global Constraints

- **Files.** Phase 22B creates `players/playerText.ts`, `players/PlayersPage.css`,
  `players/PlayerPage.css`, `frontend/e2e/stats-players.spec.ts` and their tests, and changes
  `players/PlayersPage.tsx` and `players/PlayerPage.tsx` (Phase 15's placeholders; their exports
  and `PageProps` stay). Paths are under `frontend/src/stats/`. It edits no other source file.
- **Copy, exactly.** Player page card titles, in order: `Elo`, `Win rate`, `Roles`, `Cards as
  president`, `As chancellor`, `Votes & powers`, `People`, `Timing`, `Latest games`; PLAYERS'
  card: `Players`. Lines: `6 games since 2 Oct · +1 with CPU players, not counted · last played 2
  days ago`, `No counted games`, `All 8 games ›` (`All 1 game ›`; the `›` hidden from screen
  readers), `This player was not found.`, `All players`. Empty states: `No counted games yet.`
  (player page cards), `NO_GAMES` (PLAYERS).
- **Shared helpers, from their owners.** Phase 15: `StatsLink` (`href`), `plural`, `routePath`,
  `navigate` (which scrolls to the top), `useLocation`, `PageProps`, `viewerTimeZone`,
  `NO_GAMES_FILTER`, `gamesFilterSearch`, `parseGamesFilter`, `filterGames`. Phase 17:
  `numbers.ts` (`formatPercent`, `formatSigned`, `formatRating`), `counting.ts` (`rate`,
  `MIN_GAMES`, `localDaysBetween`, `DEFAULT_FILTER`, `parseFilter`, `filterSearch`), `buildStats`,
  `useStats`, `StatCard` (`empty?`; a `section` region named by its title; `NO_GAMES`), `FilterBar`
  (`showPlayers?`), `LineChart`. Phase 21A: `formatAverageTime`. Phase 22A: `computePlayer`,
  `PlayerStats`, `computePlayersList`, `PlayerListRow`, `TrophyBadge`, `PlayerName` (a link), and
  the test data in `players/testStats.ts`.
- **ES2020.** No `Array.prototype.at`, `Object.hasOwn`, `replaceAll`, `findLast` or anything newer,
  in code and tests alike (`npm run build` type-checks both).
- **Counting.** The player page counts with the address's CPU toggle and without its player filter
  (`computePlayer` already drops it); PLAYERS uses the whole filter. Only components read
  `Date.now()`, once per mount (`useState(Date.now)`).
- **Time zones.** Local dates go through `Intl` with an optional `timeZone` that defaults to
  `viewerTimeZone()`. Views take an optional `timeZone` prop; tests pass `"UTC"` and build times
  with `Date.UTC`, never setting `process.env.TZ`.
- **Look and fit.** Cards through `StatCard`; trophies through `TrophyBadge`; Lucide for any icon.
  `App.css`'s global `div`, `p`, `a`, `h2` and `button` rules reach the stats, so each stylesheet
  sets its own alignment, sizes and margins, and every grid or flex child has `min-width: 0`. Pages
  scroll down, never sideways, from 320x568 to 1920x1080. In the stacked query (`(max-width:
  768px), (aspect-ratio < 5/4), (max-height: 500px)`) table rows are at least 44px, so name links
  fill them (Phase 22A's rule), and every other control is a 44px target.
- **Browser tests.** No `e2e/` file imports `src/constants` or anything that imports it; paths come
  from `routePath`. Every test that checks pages at every size calls `test.slow()`.
- **Download.** Nothing outside `src/stats/` imports this phase's files.
- **Linux fonts.** CI draws text wider than macOS at phone sizes. Before pushing CSS that fits the
  PLAYERS table or the player header tightly, measure in Playwright's Linux image
  (`DEVELOPMENT.md`, "Browser tests on Linux"), which also runs `firefox` when it will not launch
  on macOS.
- **Environment.** `JAVA_HOME` on Java 17; Node 22.12 or newer; `npm ci` once in `frontend/`.
  Browser tests on `E2E_PORT=4632`, "before" shots on 4732.
- **Branch and commits.** Worktree and branch `phase-22b-player-pages`, off an up-to-date
  `development`. Conventional Commits with a scope (`frontend`, `docs`, `claude`, `readme`,
  `development`, `plan`); each test in the commit with its code. Tasks 2 to 5 each tick one box of
  Phase 22B in `docs/PLAN.md` in their commit (Task N ticks box N − 1).
- **Public repo.** Nothing about the home server in code, docs, commits or the PR.

## Review Focus

1. **A known player with no counted games** (only CPU games with the toggle off, or only
   unfinished ones): the page shows the header with `No counted games · +1 with CPU players, not
   counted`, every card's empty state, the latest games and `All 1 game`. Task 3
   (`aPlayerWithNoCountedGamesShowsEmptyCards`).
2. **A player filter in the address that leaves the player out** (`/stats/players/1?players=2,3`):
   the page shows no player chips and the same numbers as without it. Task 3
   (`theCpuToggleStandsAlone`).
3. **An unknown or impossible player number** (`/stats/players/99`, `/stats/players/0`): a short
   not-found page with a way back, never a blank page or a throw. Task 3
   (`anUnknownPlayerIsNotFound`).
4. **Twelve-character names at 320px** in the PLAYERS table and the player header, ten players and
   many trophies: no sideways scroll, every target 44px. Task 4 (`PLAYERS fits every stats size`,
   `a player page fits every stats size`).
5. **Two PLAYERS rows with the same rounded rating**: ordered by more games, then the name, the
   same every time. Task 2 (`sortsByEloWithProvisionalLast`).

---

## The test data

Phase 22A's `players/testStats.ts`: `sampleData()`, `SAMPLE_NOW = Date.UTC(2026, 10, 15, 12)`,
`TZ = "UTC"`, `withRatings(stats, ratings)`, and `buildStats(data, filter)` contexts with
`DEFAULT_FILTER` unless said. Players: 1 Ann, 2 Bo, 3 Cy, 4 Di, 5 Ed, 6 Fay, 7 Gus. Games (20:00 to
20:40 UTC, 2026): `g1` 2 Oct, `g2` 5 Oct, `g3` 9 Oct (Fay's only game), `g4` 1 Nov, `g5` 10 Nov,
`cpu` 12 Nov (Ann, Gus and three CPU seats, a Liberal win), `g6` 13 Nov, `unf` 14 Nov (unfinished).
What this phase's tests read from it:

| For | Value |
|---|---|
| Ann's header | `6 games since 2 Oct · +1 with CPU players, not counted · last played 2 days ago`; with the toggle on `7 games since 2 Oct · last played 2 days ago` |
| Ann's trophies | `Hitler Hunter`, `Chancellor Hitler` |
| Ann's latest games | `unf`, `g6`, `cpu`, `g5`, `g4`; `All 8 games` |
| Ann's most played with | Bo, 6 |
| Ann's PLAYERS row | 6 games, 5 of 6 (`83%`), last played `2 days ago` |
| Fay | 1 game, lost, provisional |
| Gus | no counted games, 1 CPU game: `No counted games · +1 with CPU players, not counted`, `All 1 game` |
| the ratings for PLAYERS' order (`withRatings`, rating/games) | Ann 1540/6, Bo 1560/6, Cy 1520/6, Di 1500/6, Ed 1560/5, Fay 1700/1 → order Bo, Ed, Ann, Cy, Di, Fay |

---

### Task 1: Start check, branch and the "before" screenshots

**Files:**
- Create (never committed): `frontend/e2e/pr-shots.spec.ts`
- Create: `docs/pr/phase-22b-player-pages/before-{players,player}-{1600x900,412x915}.png`

- [ ] **Step 1: Check the start.** `docs/PLAN.md`'s Progress table reads "done" for Phase 22A (and
  every phase before it), and `docs/PLAN.md` has a "Phase 22B: Player pages" section. If either is
  not so, stop and report.
- [ ] **Step 2: Branch.** Make the worktree and branch `phase-22b-player-pages` from an up-to-date
  `development`, and run `npm ci` in `frontend/`.
- [ ] **Step 3: Write `pr-shots.spec.ts`.** `test.skip(!process.env.PR_SHOTS)`; `const PREFIX =
  "before"`; 1600x900 in `desktop`, 412x915 in `phone-412` (`testInfo.project.name`);
  `stubStats(page, bigStatsData())`, then for each state `goto`, `settle(page)` and save to
  `docs/pr/phase-22b-player-pages/${PREFIX}-${state}-${W}x${H}.png`: `players`
  (`routePath({ page: "players" })`, full page) and `player` (`routePath({ page: "player", number:
  n })`, full page, `n` the player in the most of the data's games).
- [ ] **Step 4: Run** `PR_SHOTS=1 E2E_PORT=4732 npx playwright test e2e/pr-shots.spec.ts
  --project=desktop --project=phone-412`. Expected: 2 passed; both show "Coming in a later update."
- [ ] **Step 5: Commit** `docs(docs): add phase 22b's before screenshots` (the four PNGs only; the
  spec stays untracked for Task 5).

---

### Task 2: PLAYERS

**Files:**
- Create: `frontend/src/stats/players/playerText.ts`, `playerText.test.ts`, `players/PlayersPage.css`,
  `players/PlayersPage.test.tsx`
- Modify: `frontend/src/stats/players/PlayersPage.tsx`

**Interfaces:**
- Consumes: `computePlayersList`, `PlayerListRow`; `useStats`, `FilterBar`, `StatCard`,
  `NO_GAMES`, `PlayerName`, `formatPercent`, `formatSigned`, `formatRating`, `localDaysBetween`,
  `viewerTimeZone`, `navigate`, `useLocation`, `filterSearch`.
- Produces in `playerText.ts`: `formatRate(rate: Rate): string` (`formatPercent(value)`, or below
  its minimum `— (<chances>)`); `formatPoints(fraction: number): string` (`formatSigned(fraction *
  100)` and `%`); `formatShortDate(ms: number, now: number, timeZone = viewerTimeZone()): string`
  (`Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone })`, plus the year
  when it differs from `now`'s in that zone); `formatLastPlayed(ms: number, now: number, timeZone =
  viewerTimeZone()): string` (`localDaysBetween(ms, now, timeZone)`: `today`, `yesterday`, `N days
  ago`).
- Produces in `PlayersPage.tsx`: `PlayersList(props: { stats: StatsContext; now: number;
  timeZone?: string })` (the `Players` card: a table of Player, Games, Win rate, Elo, Last played,
  in `computePlayersList`'s order; provisional rows `.is-provisional`, in italics, as OVERVIEW's
  power ranking; in the stacked query rows at least 44px; in the phone-only query the last played
  line sits under the name, so the table fits 320px without its own scroll) and the page:
  `useStats()` (null renders nothing), then a column of `FilterBar` (`players: data.players`,
  `filter: stats.filter`, `onChange` calling `navigate(pathname + filterSearch(next))`, as
  `TabsPage` does) and `PlayersList`, with `now` from `useState(Date.now)`.

- [ ] **Step 1: Write the failing tests.** `playerText.test.ts`: `formatRate(rate(5, 6))` `83%`,
  `(rate(1, 1))` `— (1)`; `formatPoints(0.0667)` `+7%`, `(-0.03)` `−3%`, `(0.001)` `0%`;
  `formatShortDate` of 2 Oct 2026 and 2 Oct 2025, 20:00 UTC, at `SAMPLE_NOW` in `TZ`: `2 Oct`, `2
  Oct 2025`; `formatLastPlayed` in `TZ` of 15 Nov 08:00 `today`, 14 Nov 23:59 `yesterday`, 13 Nov
  20:40 `2 days ago`, and of 14 Nov 23:30 UTC in `"Europe/Paris"` `today`. `PlayersPage.test.tsx`,
  `PlayersList` on `sampleData()` at `SAMPLE_NOW` in `TZ`, with the ratings above for the first
  two: `sortsByEloWithProvisionalLast` (row names `["Bo", "Ed", "Ann", "Cy", "Di", "Fay"]`, Fay's
  row `.is-provisional`); `showsGamesWinRateEloAndLastPlayed` (Ann's row: `6`, `83%`, `1540`, `2
  days ago`; Fay's win rate `— (1)`); `namesLinkToTheirPages` (Ann's link `/stats/players/1`);
  `theFilterApplies` (players 1 to 5: no Fay, Ann `5`); `noCountedGamesIsTheEmptyState` (players
  `{7}`: `NO_GAMES`).
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/stats/players`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): list the players by elo`, ticking box 1.

---

### Task 3: The player page

**Files:**
- Create: `frontend/src/stats/players/PlayerPage.css`, `players/PlayerPage.test.tsx`
- Modify: `frontend/src/stats/players/PlayerPage.tsx`

**Interfaces:**
- Consumes: `computePlayer`, `PlayerStats`; `playerText.ts`; `TrophyBadge`; `formatPercent`,
  `formatRating`, `plural`, `formatAverageTime`; `StatCard`, `LineChart`, `PlayerName`,
  `StatsLink`, `FilterBar`, `useStats`, `navigate`, `useLocation`, `filterSearch`;
  `NO_GAMES_FILTER`, `gamesFilterSearch`, `routePath`.
- Produces: `PlayerView(props: { player: PlayerStats; cpu: boolean; now: number; timeZone?: string
  })`; the page, which renders the not-found page (`This player was not found.` and an `All
  players` `StatsLink` to `/stats/players`) when `route.number` is not in `data.players`, before
  any hook, and otherwise a child that calls `useStats()` (null renders nothing), takes `now` from
  `useState(Date.now)`, memoizes `computePlayer`, and shows `FilterBar` with `showPlayers={false}`
  (the CPU toggle on its own; `onChange` calling `navigate(pathname + filterSearch(next))`) above
  `PlayerView`.
- `PlayerView`, in order: the header (an `h1` with the name, not a link; the line `6 games since 2
  Oct · +1 with CPU players, not counted · last played 2 days ago`, which reads `No counted games`
  with none, drops the CPU part with the toggle on or N 0, and drops the last part with no games;
  the trophies as `TrophyBadge`s), then the cards `Elo` (`formatRating`, `#2` or `provisional`,
  `peak 1601`, the history as one `LineChart` series labelled `Rating history`), `Win rate`
  (overall, as Liberal, as Fascist, as Hitler, each with its count, then by seats), `Roles` (a split
  bar in the Liberal, Fascist and Hitler colours, the expected Liberal share, role luck through
  `formatPoints`, the current and longest streaks), `Cards as president` (hands FFF · FFL · FLL ·
  LLL, Liberal accuracy, deep cover, FFF drawn as a Liberal), `As chancellor` (given one of each,
  enacted the Liberal: as Liberal, as Fascist, as Hitler; FF handed to them as a Liberal; Fascist
  choices), `Votes & powers` (Ja rate, Liberal vote accuracy, Fascist loyalty, investigations with
  how many found a Fascist, executions with Hitler's, survived to the end), `People` (a table of
  the four, each a `PlayerName` with its count, best teammate with `formatPercent(wins / games)`,
  or `—`), `Timing` (six rows through `formatAverageTime`, `—` when null), `Latest games` (a table:
  the date as a `StatsLink` to its game, the role word in its colour, won, lost or unfinished, the
  ending, a `CPU` tag; then `All 8 games ›` to `/stats/games` plus `gamesFilterSearch({
  ...NO_GAMES_FILTER, players: [n] })`). Every card but `Latest games` is `StatCard`'s `empty="No
  counted games yet."` when `games` is 0. Cards sit in a grid of `repeat(auto-fill, minmax(min(100%,
  18em), 1fr))` under the full-width header: one column on phones, three at 1600px as in the
  mockup. In the stacked query the People and Latest games rows are at least 44px, and `All N
  games` and `All players` are 44px targets.

- [ ] **Step 1: Write the failing tests** (`PlayerView` on `computePlayer(ctx, 1, SAMPLE_NOW)` in
  `TZ` unless said): `theCardsFollowTheSpec` (`getAllByRole("region")` names equal the nine
  player-page titles, in order); `theHeaderSaysGamesCpuGamesAndLastPlayed` (the `h1` `Ann`, the
  line exactly as above, badges `Hitler Hunter` and `Chancellor Hitler` with their rules as
  titles); `theToggleDropsTheCpuNote` (`cpu: true`: `7 games since 2 Oct · last played 2 days
  ago`); `eloShowsRatingRankAndPeak` (`formatRating(rating)`, `#${rank}`, `peak
  ${formatRating(peak)}`; Fay's card says `provisional`); `latestGamesLinkToTheirGames` (5 rows,
  the first linking `/stats/games/unf`, `CPU` on the `cpu` row); `allGamesOpensGamesFilteredToThem`
  (the link named `/^All 8 games/`; `filterGames(data.games, parseGamesFilter(search))` of its
  `href` gives Ann's 8 ids); `peopleLinkToPlayers` (`People` has a link `Bo`);
  `aPlayerWithNoCountedGamesShowsEmptyCards` (Gus: `No counted games · +1 with CPU players, not
  counted`, eight regions with `No counted games yet.`, `Latest games` listing `cpu`, `All 1
  game`); `anUnknownPlayerIsNotFound` (the page with `{ page: "player", number: 99 }`, and `0`:
  the not-found copy and the `All players` link); `theCpuToggleStandsAlone` (`StatsApp` with
  `fetch` answering `sampleData()` at `/stats/players/1?players=2,3`: a switch named `Include
  games with CPU players`, no player chips, the line starting `6 games`; turning the switch on
  moves the address to `parseFilter` `cpu: true` and the line to `7 games`).
- [ ] **Step 2: Run** `npx vitest run src/stats/players`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the player page`, ticking box 2.

---

### Task 4: Browser tests

**Files:**
- Create: `frontend/e2e/stats-players.spec.ts`

**Interfaces:**
- Consumes: `stubStats`, `bigStatsData`, `statsSizesFor`, `checkStatsPage` (`./stats`); `settle`
  (`./lobby`); `routePath` (`../src/stats/routes`); types only from `../src/stats/record`.
- Produces in the spec: `busiestPlayer(data: StatsData): number`.

- [ ] **Step 1: Write the tests,** each against `stubStats(page, bigStatsData())`: `PLAYERS fits
  every stats size` (`test.slow()`; `/stats/players` and `/stats/players?cpu=1` at every
  `statsSizesFor(testInfo.project.name, viewport)` size: `checkStatsPage(page, size)`); `a player
  page fits every stats size` (`test.slow()`; the busiest player, the same check, and at least one
  trophy badge shown); `a name in GAMES opens its player page` (click the first row's first
  `a.player-link`: the `h1` is that player's name, `window.scrollY` is 0); `All N games opens GAMES
  filtered to the player` (every row on the first page names the player); `the player page's CPU
  switch counts CPU games` (the switch adds `cpu=1` to the address and the header drops its `+N`
  part).
- [ ] **Step 2: Run** `E2E_PORT=4632 npm run e2e -- e2e/stats-players.spec.ts`. Expected: PASS in
  `desktop`, `firefox`, `phone-360` and `phone-412` (Firefox in the Linux image if it will not
  launch). Fix layout failures in this phase's CSS, measuring phone widths in the Linux image.
- [ ] **Step 3: Run** `E2E_PORT=4632 npm run e2e`. Expected: every project passes.
- [ ] **Step 4: Commit** `test(frontend): check the player pages in the browser`, ticking box 3.

---

### Task 5: Docs and screenshots

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `DEVELOPMENT.md`, `docs/PLAN.md`
- Create: `docs/pr/phase-22b-player-pages/after-{players,player}-{1600x900,412x915}.png`,
  `docs/images/stats-desktop.png`, `docs/images/stats-phone.png`
- Delete: `frontend/e2e/pr-shots.spec.ts` (never committed)

- [ ] **Step 1: Take the "after" shots.** Set `PREFIX = "after"` in `pr-shots.spec.ts`, add a
  `readme` state saving the busiest player's page at 1600x900 (the window) to
  `docs/images/stats-desktop.png` and OVERVIEW at 412x915 to `docs/images/stats-phone.png`, run it
  as in Task 1 (port 4732), check the "after" shots show PLAYERS and the player page, then delete
  the spec.
- [ ] **Step 2: Update the docs.** `CLAUDE.md` (the stats part of Layout: PLAYERS, the player page
  with its lone CPU switch, `playerText.ts`, `stats-players.spec.ts` among the browser tests);
  `README.md` (one "What this fork adds" bullet for the stats section as a whole: every game
  recorded by the server, the tabs with the player filter and CPU toggle, Elo with its handicap,
  GAMES and each game's timeline, PLAYERS and player pages with trophies, names that link to them,
  the links in, the database backups; then a `<p>` with the two stats images and alt text, after
  the list; every earlier phase's stats bullet folded into it); `DEVELOPMENT.md` (the stats section
  names `/stats/players`, `/stats/players/<n>` and `stats-players.spec.ts`). Nothing names the home
  server.
- [ ] **Step 3: Commit** `docs(docs): add phase 22b's after screenshots and the stats images`,
  `docs(claude): describe the player pages`, `docs(readme): describe the stats section`,
  `docs(development): describe the player pages`, the last ticking box 4.

---

### Task 6: Review

- [ ] **Step 1: Review.** Run the `code-review` skill against `origin/development`, with the spec's
  sections named at the top and this plan as the spec.
- [ ] **Step 2: Fix every finding,** Minor ones included, each with a test where it changes
  behaviour, in commits of their own scope; a finding that needs no change gets its reason. Keep
  the list (finding, what was done) for the PR's Review section.
- [ ] **Step 3: Run everything:** `cd backend && ./gradlew test`, `cd frontend && npm test -- --run
  && npm run build`, `E2E_PORT=4632 npm run e2e`. Expected: all pass in all four projects; keep the
  counts for the PR.
- [ ] **Step 4: Commit** the last fix with the acceptance box "Backend and frontend unit tests
  pass, …" ticked (or `docs(plan): tick phase 22b's test box` if there was nothing to fix).

---

### Task 7: Pull request

- [ ] **Step 1: Push and open the PR.** `git push -u origin phase-22b-player-pages`; `gh pr create
  --repo jussaw/Secret-Hitler-Online --base development --head phase-22b-player-pages --title
  "feat(frontend): add players and player pages to the stats" --body-file <scratchpad file>`. The
  body follows `CLAUDE.md`'s Workflow: the before-and-after table (PLAYERS and a player page, at
  1600x900 and 412x915, raw URLs pinned to the pushed head), Changes, Decisions, Review, and `Part
  of #31` (closing the issue is the user's box).
- [ ] **Step 2: Bring CI to green,** fixing on the branch and pushing until every job passes. The
  phase's work ends here, with the PR open and green; report its number.
- [ ] **Step 3: Merge (the manager session, with the user's standing OK).** Each part is skipped
  when already done, so the step can be resumed: if the "PR merged into `development`" box is not
  ticked on the branch, commit `docs(plan): tick phase 22b's merge` (the box and the Progress row
  "done"), push and wait for green; if `gh pr view <n> --repo jussaw/Secret-Hitler-Online --json
  state` is not `MERGED`, run `gh pr merge <n> --squash --admin --repo jussaw/Secret-Hitler-Online
  --subject "feat(frontend): add players and player pages to the stats (#<n>)"`; then `gh run list
  --repo jussaw/Secret-Hitler-Online --branch development --limit 1` shows the push's run
  publishing `:latest`. The user's two boxes stay open.
