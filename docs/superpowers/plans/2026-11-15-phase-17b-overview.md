# Phase 17B: OVERVIEW Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The OVERVIEW tab at `/stats`: the dashboard, the power ranking, the rating history, the
headline numbers and the latest games, under the filter and the CPU toggle (issue #31). It fills
the placeholder Phase 17A left.

**Architecture:** `overview.ts` is a pure function from the stats context, `now` and an optional
time zone to every OVERVIEW number; it also exports `winStreaks` and `playerOfTheMonth`, which
Phase 21B's RECORDS imports. `tabs/OverviewTab.tsx` draws them with Phase 17A's cards, tables and
line chart.

**Tech Stack:** React 18.3, TypeScript 5.9 (ES2020), Vite 8, Vitest 5 with Testing Library 16 and
jsdom 30, `@playwright/test` 1.64.1. No new dependency.

**Spec:** [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](../specs/2026-11-15-game-stats-design.md):
"OVERVIEW (Phase 17)", "Counting rules (Phase 17)" (ties, time), "RECORDS (Phase 21)" (player of
the month), "Cards", "Charts" and "Tests"; mockups
[`stats-layout.jpg`](../specs/2026-11-15-game-stats/stats-layout.jpg) (B) and
[`player-and-phone.jpg`](../specs/2026-11-15-game-stats/player-and-phone.jpg) (right: OVERVIEW on a
phone). Shared names: [`2026-11-15-game-stats-interfaces.md`](2026-11-15-game-stats-interfaces.md),
used exactly; its "Settled after the plans were written" section wins over this plan. Parent plan:
[`docs/PLAN.md`](../../PLAN.md), Phase 17B. Before it: [Phase 17A](2026-11-15-phase-17a-stats-engine.md).
Where this plan and the spec differ, the spec wins.

## Decisions (left open by the spec; this plan settles them)

1. **Leaders.** Win streak and hot hand show every player tied for the lead, ordered by more
   counted games, then current name. "Within 7 days" is `now − startedAt ≤ 7 × 24 h` of the
   player's last counted game (the spec's Time rule: every period uses a game's start).
   `playerOfTheMonth` takes no names, so its ties go by more counted games, then the name on the
   player's latest counted seat, then number.
2. **Time zones.** `computeOverview` and `playerOfTheMonth` take an optional IANA zone (default the
   viewer's) through `localDayKey`; `OverviewTab` takes optional `now` and `timeZone` props for its
   tests.
3. **Last game and latest games** come from counted games, so the filter applies (GAMES lists
   all).
4. **Rating history:** x is the counted game's index, a player's line starts at their first
   counted game, and a point is dashed (as is the segment into it) while the player is
   provisional. The power ranking ranks rounded ratings.
5. **Names.** A name inside a dashboard value (win streak, hot hand, player of the month) is
   `<PlayerName … link={false} />`, so Phase 22 does not turn it into a link; names in the power
   ranking and the headline tables are plain `PlayerName`s, which Phase 22 links.

## Global Constraints

- **Copy, exactly:** the card titles, definitions and empty lines in Task 2; `No games yet with
  these players.` (`NO_GAMES`) for any card with no counted games.
- **Interfaces:** the interfaces file's `overview.ts` row and its "Settled after the plans were
  written" section (`winStreaks`, `PlayerStreaks`, `StreakRun`, `playerOfTheMonth`), spelled and
  typed as there.
- **Imported, never redefined:** from Phase 17A, `counting.ts` (`countedGames`, `rankRows`, `rate`,
  `MIN_GAMES`, `seatWon`, `compareNames`, `localDaysBetween`, `DEFAULT_FILTER`), `elo.ts`
  (`ELO_START`, `PROVISIONAL_GAMES`, `replayElo`), `useStats.ts` (`StatsContext`, `buildStats`),
  `numbers.ts` (`formatPercent`, `formatSigned`, `formatRating`, `formatDays`), `StatCard`,
  `RankedTable`, `ScrollRegion`, `charts/LineChart.tsx` (`LineChart`, `SERIES_COLORS`),
  `testGames.ts` (`game`, `match`, `seatsOf`, `generateData`); from Phase 15A, `format.ts`
  (`outcomeLabel`, `formatLocalDateTime`, `plural`, `localDayKey`), `routes.ts` (`routePath`),
  `StatsLink`, `PlayerName` (with `link`), `e2e/stats.ts` (`stubStats`, `bigStatsData`,
  `statsSizesFor`, `checkStatsPage`).
- **Files:** only this phase's (the table below), and the docs (`CLAUDE.md`, `README.md`,
  `DEVELOPMENT.md` if stale, `docs/PLAN.md`'s Phase 17B section and Progress row, the interfaces
  file only to correct a name, `docs/pr/phase-17b-overview/`). Of Phase 17A's files it changes only
  `tabs/OverviewTab.tsx`. Phases 18, 19, 20 and 21A run at the same time: never one of their files.
- **Time:** `overview.ts` takes `now`; only `OverviewTab` reads `Date.now()`.
- **Layout:** no sideways scroll from 320x568 to 1920x1080; the power ranking scrolls inside its
  card in a `ScrollRegion`. The phone-only query is GameScreen.css's, written out:
  `((max-width: 768px) or (aspect-ratio < 5/4) or (max-height: 500px)) and (not ((min-width: 700px) and (aspect-ratio < 5/4)))`;
  the stacked query is `(max-width: 768px), (aspect-ratio < 5/4), (max-height: 500px)`.
- **Names never overflow:** every grid or flex child on the tab has `min-width: 0` (the two-column
  phone dashboard above all), and names rely on `PlayerName`'s `overflow-wrap: anywhere`. In the
  stacked query, power-ranking rows and latest-games links are at least 44px tall.
- **Look:** cards are `StatCard`s; colours from `variables.css` (Liberal `--textColorLiberal`,
  Fascist `--textColorFascist`); `App.css`'s global `p`, `a` and `h2` rules reach the page, so
  `OverviewTab.css` sets its own sizes and margins.
- **ES2020 only:** no `.at()`, `Object.hasOwn`, `replaceAll`, `findLast` or anything newer.
- **Browser tests import no browser-only module:** `stats-overview.spec.ts` imports only `./stats`,
  `./lobby`, `./layout` and `../src/stats/testGames`, never `src/constants` or `api.ts`.
- **The game's download:** nothing here is imported outside `frontend/src/stats/`; the entry chunk
  stays the size it is on `development`.
- **Linux fonts:** measure the phone projects and Firefox in
  `mcr.microsoft.com/playwright:v1.64.1-noble` (`DEVELOPMENT.md`, "Browser tests on Linux").
- **Environment:** `JAVA_HOME` on any Java 17 for `npm run e2e`; browser tests run on
  `E2E_PORT=4627`, the screenshot runs on `4727`.
- **Branch and commits:** `phase-17b-overview`. Conventional Commits with a scope (`frontend`,
  `plan`, `docs`, `claude`, `readme`), each test with its code. Task N ticks Phase 17B's Nth box in
  `docs/PLAN.md` in its last commit.
- **Public repo:** nothing about the hosting setup in code, docs, commits or the PR.

## Files

| File (in `frontend/`) | Holds | Task |
|---|---|---|
| `src/stats/overview.ts` (+ `.test.ts`) | `computeOverview`, `winStreaks`, `playerOfTheMonth`, `ratingPointDetail` | 1 |
| `src/stats/testOverview.ts` | The test fixture `overviewFixture` (a test-only file of this phase's) | 1 |
| `src/stats/tabs/OverviewTab.tsx` (filling 17A's placeholder), `tabs/PowerRanking.tsx`, `tabs/OverviewTab.css`, `tabs/OverviewTab.test.tsx` | OVERVIEW | 2 |
| `e2e/stats-overview.spec.ts` | OVERVIEW in the browser | 3 |

## Review Focus

1. **A filter that leaves no counted games** (all chips off, or two players who never shared a
   table): every card shows its empty state, the chart draws nothing, and no `NaN`, `Infinity` or
   `undefined` reaches the page. Task 1 (`noCountedGames`) and Task 2
   (`everyCardSaysSoWithNoGames`).
2. **One counted game:** every line is a single point, which the chart draws as a dot at the
   plot's middle; no `NaN` anywhere. Task 1 (`oneCountedGame`) and Task 2 (`oneGameDrawsDots`).
3. **Back and forward after filter changes:** every number follows the address. Task 3 (the filter
   test's `goBack`).
4. **Local-day and zone edges:** a game ending at 23:59 seen at 00:01 is 1 day ago in the zone
   given; a win that started at 23:30 UTC on 31 October is October's in UTC and November's in
   Paris; a game later this month than `now` still counts toward its player of the month; a last
   game exactly 7 days ago is within 7 days. Task 1.
5. **The rightmost point and the longest names at 320px:** a tap on the chart's last point, and
   tied leaders with twelve-character names in the two-column phone dashboard, never push the page
   sideways. Task 3 (the 320px tap and `OVERVIEW fits every stats size`).

## Before you start

- [ ] **Start check.** `git fetch origin`; Phase 17A's pull request is merged into `development`,
  and `docs/PLAN.md` on `origin/development` has the section `## Phase 17B: OVERVIEW`. If either is
  missing, stop and report.
- [ ] From an up-to-date `development`, make the worktree and branch `phase-17b-overview`
  (CLAUDE.md, Workflow). Then `cd frontend && npm ci && npx playwright install chromium firefox`.
- [ ] Read Phase 17A's `counting.ts`, `elo.ts`, `useStats.ts`, `numbers.ts`, `StatCard.tsx`,
  `RankedTable.tsx`, `ScrollRegion.tsx`, `charts/LineChart.tsx`, `testGames.ts` and
  `tabs/OverviewTab.tsx`, and Phase 15A's `format.ts`, `PlayerName.tsx` (its `link` prop) and
  `e2e/stats.ts`. If a name this plan imports is missing or differs from the interfaces file, stop
  and report it.
- [ ] **"Before" screenshots.** Write `frontend/e2e/pr-shots.spec.ts`, never committed: it starts
  with `test.skip(!process.env.PR_SHOTS)`, fixes the clock 2 days after `bigStatsData()`'s last
  `endedAt` (`page.clock.setFixedTime`), calls `stubStats`, sets 1600x900 in `desktop` and 412x915
  in `phone-412`, opens `/stats`, runs `settle` (`e2e/lobby.ts`) and saves a full-page shot to
  `docs/pr/phase-17b-overview/before-overview-<W>x<H>.png`. Run `PR_SHOTS=1 E2E_PORT=4727 npx
  playwright test e2e/pr-shots.spec.ts --project=desktop --project=phone-412`. Expected: two shots
  of Phase 17A's OVERVIEW placeholder under the filter and the tab row.

---

### Task 1: The OVERVIEW numbers

**Files:**
- Create: `frontend/src/stats/overview.ts`, `overview.test.ts`, `testOverview.ts`
- Modify: `docs/PLAN.md` (Progress: Phase 17B `in progress`)

**Interfaces:**
- Consumes: `StatsContext`, `buildStats`; `countedGames`, `rankRows`, `rate`, `seatWon`,
  `compareNames`, `localDaysBetween`, `DEFAULT_FILTER`; `ELO_START`, `PROVISIONAL_GAMES`;
  `formatSigned`, `formatRating`; `outcomeLabel`, `formatLocalDateTime`, `localDayKey`; `match`,
  `game`, `seatsOf`, `generateData` (tests).
- Produces (interfaces file): `computeOverview(stats: StatsContext, now: number, timeZone?:
  string): OverviewStats`, and `winStreaks` and `playerOfTheMonth`, which Phase 21B's `records.ts`
  imports rather than recomputes.
- Produces, own:

```ts
export const RECENT_MS = 7 * 24 * 60 * 60 * 1000, LATEST_GAMES = 10, HOT_HAND_GAMES = 5, HOT_HAND_WINS = 3;
export interface Leaders { players: number[]; value: number }
export interface StreakRun { player: number; length: number; firstGameId: string; lastGameId: string }
export interface PlayerStreaks { games: number; current: number; longestWin: StreakRun | null; longestLoss: StreakRun | null } // current: wins in a row up to their last game, 0 or more
export interface PowerRow { player: number; rank: number | null; rating: number; lastChange: number; games: number; provisional: boolean }
export interface RatingLinePoint { game: number; rating: number; change: number | null; provisional: boolean } // game: index in counted; change null when missed
export interface RatingLine { player: number; points: RatingLinePoint[] }
export interface OverviewStats {
  daysSinceLastGame: number | null; lastGame: GameRecord | null;
  winStreak: Leaders | null; hotHand: Leaders | null; playerOfMonth: Leaders | null;
  powerRanking: PowerRow[]; ratingHistory: RatingLine[];
  headline: { games: Row<number>[]; wins: Row<number>[]; winRate: Row<Rate>[];
    currentStreak: Row<number>[]; longestStreak: Row<number>[]; liberalWins: number; fascistWins: number };
  latestGames: GameRecord[];   // newest first
}
export function winStreaks(counted: GameRecord[]): Map<number, PlayerStreaks>;
export function playerOfTheMonth(counted: GameRecord[], now: number, timeZone?: string): Leaders | null;
export function ratingPointDetail(game: GameRecord, name: string, point: RatingLinePoint): string[];
```

  Rules: `winStreaks` runs each player's counted games in order; a longest run ties to the later
  one. `daysSinceLastGame` is `max(0, localDaysBetween(last.endedAt, now, timeZone))`. The
  win-streak leaders have `current` above 0 and their last counted game started within `RECENT_MS`
  of `now`. Hot hand: players with at least `HOT_HAND_GAMES` counted games, at least
  `HOT_HAND_WINS` wins in their last five, and the last started within `RECENT_MS`; the leaders are
  those with the most such wins. Their ties: more counted games, then `compareNames` of
  `stats.names`. `playerOfTheMonth`: most wins among every counted game whose start's
  `localDayKey(…, timeZone)` month is `now`'s, including any that started after `now` (Phase 21B
  passes a completed month's latest start as `now` to get that month's holder); null when no human
  won a game that month; ties by more counted games, then `compareNames` of the name on the
  player's latest counted seat, then number. `powerRanking`: non-provisional players through
  `rankRows` on rounded ratings (`min` 0), then provisional ones (rank null) by rating, games,
  name. Headline: `games`, `wins`, `currentStreak` (`current`) and `longestStreak`
  (`longestWin?.length ?? 0`) with `min` 0 and `count` the games; `winRate` `rate(wins, games,
  MIN_GAMES)`. A rating point's `change` is its rating minus the one before (`ELO_START` first);
  `provisional` while the player has fewer than `PROVISIONAL_GAMES` counted games after that game.
  `ratingPointDetail` gives `[name, "<formatLocalDateTime(endedAt)> · <outcomeLabel>",
  "<formatSigned(change)> → <formatRating(rating)>"]`, or `"Did not play ·
  <formatRating(rating)>"` as the last line for a missed game.
- Produces in `testOverview.ts`: `overviewFixture(): { data: StatsData; now: number }`, with `now =
  Date.UTC(2026, 10, 15, 12)`, `d(n, h = 20) = Date.UTC(2026, 10, 15 - n, h)`, players `1 Ann`,
  `2 Bo`, `3 Cy`, `9 Zed`, and these `match` games (`d` their `endedAt`): `g01` `d(9)` Cy beats
  Zed; `g02` `d(6)` Zed beats Ann (`"FASCIST"`); `g03` `d(5)` and `g04` `d(4)` Ann beats Zed; `g05`
  `d(3)` Ann beats Bo (`"FASCIST"`); `g06` `d(2)` Ann beats Zed; `g07` `d(2, 21)` Bo beats Cy.

- [ ] **Step 1: Write the failing tests** in `overview.test.ts` (`ctx = buildStats(data,
  DEFAULT_FILTER)`, `computeOverview(ctx, now, "UTC")` unless said):
  - `theFixtureDashboard`: `daysSinceLastGame` `2`; `lastGame.id` `"g07"`; `winStreak` `{ players:
    [1], value: 4 }`; `hotHand` `{ players: [1], value: 4 }`; `playerOfMonth` `{ players: [1],
    value: 4 }`; `headline.liberalWins` `5`, `fascistWins` `2`.
  - `theFixtureHeadline` (as `[player, rank, value]`): `games` `[[1, 1, 5], [9, 1, 5], [2, 3, 2],
    [3, 3, 2]]`; `wins` `[[1, 1, 4], [9, 2, 1], [2, 2, 1], [3, 2, 1]]`; `winRate` ranks `[[1, 1],
    [9, 2], [2, null], [3, null]]` with Ann's value `0.8`; `currentStreak` Ann `4`, Zed `0`;
    `longestStreak` Ann `4`, Zed `1`.
  - `winStreaksRunBothWays`: player 2's games `p2-1` to `p2-7` going W W L W W L L give `current`
    `0` (wins only, never negative), `longestWin` `{ length: 2, firstGameId: "p2-4", lastGameId:
    "p2-5" }` (the later tie), `longestLoss` `{ length: 2, firstGameId: "p2-6", lastGameId: "p2-7"
    }`, `games` `7`.
  - `powerRankingPutsProvisionalPlayersLast`: players `[1, 9, 3, 2]` (ratings about 1543, 1459,
    1500 and 1498), ranks `[1, 2, null, null]`, `provisional` `[false, false, true, true]`, each
    `rating` equal to `ctx.elo`'s.
  - `ratingHistoryCarriesAndDashes`: Ann's points as `[game, provisional, change === null]` are
    `[[1, true, false], [2, true, false], [3, true, false], [4, true, false], [5, false, false],
    [6, false, true]]`; her first `change` is `toBeCloseTo(rating - 1500)`.
  - `ratingPointDetail` for Ann at game 6 ends `"Did not play · <her rounded rating>"`, and its
    second line is `formatLocalDateTime(g07.endedAt) + " · Liberals win · 5 Liberal policies"`.
  - `streakTiesAndTheSevenDayEdge`: Dee winning 4 in a row like Ann gives `players: [1, 4]`; a
    5-win streak whose last game started exactly `now − RECENT_MS` leads, and 1 ms earlier does not.
  - `hotHandNeedsFiveGames`: a player with 4 wins in 4 games is not hot; one with 2 of 5 is not.
  - `playerOfTheMonthByStartInTheZone` (Review Focus 4): with `now` as above, Ann and Bo each win 3
    November games against Zed, and Cy wins 3 games starting `Date.UTC(2026, 9, 31, 23, 30)`: in
    `"UTC"` `{ players: [1, 2], value: 3 }`, in `"Europe/Paris"` (00:30 on 1 November) `{ players:
    [1, 2, 3], value: 3 }`; a fourth November win for Bo starting after `now` (on 20 November)
    counts, giving `{ players: [2], value: 4 }` in `"UTC"`; no human win this month (only a game
    whose winners are all CPU seats) gives `null`; two players tied on wins and games whose latest
    seats are named `Zoe` (player 1) and `Al` (player 2) give `players: [2, 1]`.
  - `aGameEndingAt2359SeenAt0001IsADayAgo` (Review Focus 4): ended `Date.UTC(2026, 10, 14, 23,
    59)`, `now` `Date.UTC(2026, 10, 15, 0, 1)`: `1` in `"UTC"`, `0` in `"America/New_York"`.
  - `latestGamesAreTheTenNewestCounted`: 12 counted games give ids `g12` down to `g03`.
  - `noCountedGames` (Review Focus 1): with `players: new Set()`, every number is null or 0 and
    every list empty.
  - `oneCountedGame` (Review Focus 2): only `g01`: each rating line has one point, `game` `0`;
    `daysSinceLastGame` `9`; no value in the result is `NaN`.
  - `theContractFixtureAddsUp`: Phase 14's `fixtures/recorded-games.json` through `parseStatsData`
    and `buildStats` with `DEFAULT_FILTER` (the fixture has CPU seats in some games): every
    finished game without a CPU seat is counted and has a `GameElo`, every rating is finite,
    `liberalWins + fascistWins` is the counted games' number, and the `games` values sum to the
    counted games' human seats.
  - `computesOverviewFor1000GamesWellUnderASecond`: `generateData(1000, 17)` with `cpu: true`;
    `buildStats` plus `computeOverview` take under 1,000 ms (`performance.now()`), the spec's
    limit.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/stats/overview.test.ts`. Expected: FAIL,
  no `overview.ts`.
- [ ] **Step 3: Implement** as in Interfaces: one pass over the counted games builds each
  player's results in order, which every stat reads.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): compute the overview stats`, with Phase 17B's Progress row
  set to `in progress`, ticking box 1.

---

### Task 2: The OVERVIEW tab

**Files:**
- Create: `frontend/src/stats/tabs/PowerRanking.tsx`, `tabs/OverviewTab.css`,
  `tabs/OverviewTab.test.tsx`
- Modify: `frontend/src/stats/tabs/OverviewTab.tsx` (Phase 17A's placeholder; its named export
  stays)

**Interfaces:**
- Consumes: Task 1; `StatCard`, `NO_GAMES`, `RankedTable`, `ScrollRegion`, `LineChart`,
  `SERIES_COLORS`, `formatPercent`, `formatSigned`, `formatRating`, `formatDays`; `StatsLink`,
  `routePath`; `outcomeLabel`, `formatLocalDateTime`, `plural`; `PlayerName`.
- Produces: `OverviewTab({ stats, now, timeZone }: { stats: StatsContext; now?: number; timeZone?:
  string }): JSX.Element` (`now` defaults to `useState(Date.now)`; the stats from `useMemo(() =>
  computeOverview(stats, now, timeZone))`). `PowerRanking({ rows, names }: { rows: PowerRow[];
  names: Map<number, string> })`: a `ScrollRegion` `Power ranking table` round a table with a
  header row `#`, `Player`, `Elo`, `Last` (`formatSigned`), `Games`; provisional rows
  `.is-provisional` (italic), rank blank.
- The tab, top to bottom (title — definition):
  - A dashboard grid, `aria-label="At a glance"`: `Since last game` — `Whole days since the last
    counted game ended.` (`formatDays`); `Last game` — `The most recent counted game.` (a
    `StatsLink` to `routePath({ page: "game", id })`: `outcomeLabel` coloured by the winning side,
    then the local date and time; no names in the link); `Win streak` — `The longest current run
    of wins, among players seen in the last 7 days.` (`<names> · <plural(value, "win")>`); `Hot
    hand` — `Won at least 3 of their last 5 games, and played in the last 7 days.` (`<names> ·
    <value> of 5`); `Player of the month` — `Most wins this month.` (`<names> · <plural(value,
    "win")>`). Names here are `<PlayerName player name link={false} />`, joined by `, `.
  - `h2` `Ratings`: `Power ranking` — `Elo ratings. Players with fewer than 5 games are
    provisional, in italics at the bottom.`; `Rating history` — `Each player's rating after every
    counted game, dashed while provisional.` (`LineChart`, `label="Rating history"`, a series per
    `RatingLine` keyed by player number with `x: game`, `y: rating`, `dashed: provisional`; colours
    `SERIES_COLORS` by the player's place in `data.players` sorted by number, so a player keeps a
    colour under any filter; `detail` from `ratingPointDetail`).
  - `h2` `Headline`: `Games played` — `Counted games each player played.`; `Wins` — `Counted games
    each player won.`; `Win rate` — `Share of their games each player won, from 5 games.`
    (`formatPercent`, `showCount`); `Current streak` — `Wins in a row up to each player's latest
    game.`; `Longest streak` — `The most wins in a row each player has had.`; `Liberal / Fascist
    wins` — `Counted games won by each side.` (`<liberal> / <fascist>`, each in its side's colour).
  - `h2` `Games`: `Latest games` — `The ten most recent counted games.` (a `StatsLink` row per
    game: local date and time, then `outcomeLabel`; no names inside the link).
  - Empty states: with no counted games every card is `empty`; otherwise `Win streak` says `No
    current win streaks in the last 7 days.`, `Hot hand` `No one has won 3 of their last 5 in the
    last 7 days.`, `Player of the month` `No wins yet this month.`
  - CSS: grids of `repeat(auto-fit, minmax(min(100%, <n>em), 1fr))` (dashboard about 11em,
    ratings 22em, headline 16em); in the phone-only query the dashboard is two columns of
    `minmax(0, 1fr)`; every grid and flex child (cards, the leaders' name lists, the latest-games
    rows) has `min-width: 0`; in the stacked query every `StatsLink` row and power-ranking row is
    at least 44px tall.

- [ ] **Step 1: Write the failing tests** in `OverviewTab.test.tsx`
  (`render(<OverviewTab stats={buildStats(fixture.data, DEFAULT_FILTER)} now={fixture.now}
  timeZone="UTC" />)`): `theDashboard` (regions read by name: `Since last game` has `2 days`; `Last
  game`'s link has `href` `/stats/games/g07` and text starting `Liberals win · 5 Liberal
  policies`; `Win streak` has `Ann · 4 wins`; `Hot hand` `Ann · 4 of 5`; `Player of the month` `Ann
  · 4 wins`); `dashboardNamesAreNotLinks` (with `../PlayerName` mocked to record its props, every
  name in the `Win streak`, `Hot hand` and `Player of the month` cards has `link: false`, and the
  power ranking's names have no `link` prop, since PlayerName stays plain text until Phase 22);
  `powerRankingRows` (names in order `Ann`, `Zed`, `Cy`, `Bo`; the last two `.is-provisional`;
  the region `Power ranking table`); `theRatingHistoryChart` (`getByRole("img", { name: "Rating
  history" })` inside its card, with a description naming Ann); `theHeadline` (`Wins` rows `["1.",
  "Ann", "4", ""]`, `["2.", "Zed", "1", ""]`; `Win rate` row `["", "Bo", "—", "2 games"]`;
  `Liberal / Fascist wins` `5 / 2`); `latestGamesLink` (7 links, the first to
  `/stats/games/g07`); `everyCardSaysSoWithNoGames` (Review Focus 1: with `players: new Set()`, 14
  cards say `No games yet with these players.` and the text holds no `NaN`, `Infinity` or
  `undefined`); `oneGameDrawsDots` (Review Focus 2: only `g01`: the chart has a dot per player and
  no `NaN` in any `d`, `cx` or `cy`).
- [ ] **Step 2: Run** `npx vitest run src/stats/tabs`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `npx vitest run src/stats && npm run build`. Expected: PASS (17A's
  `TabsPage.test.tsx` stubs `OverviewTab`, so it is untouched), and the entry chunk the size it is
  on `development`.
- [ ] **Step 5: Commit** `feat(frontend): add the overview tab`, ticking box 2.

---

### Task 3: OVERVIEW in the browser

**Files:**
- Create: `frontend/e2e/stats-overview.spec.ts`
- Modify: this phase's CSS, for whatever the tests find

**Interfaces:**
- Consumes: `stubStats`, `bigStatsData`, `statsSizesFor(project, viewport)`, `checkStatsPage(page,
  size)` (`./stats`); `settle` (`./lobby`); `NARROW_PHONE` (`./layout`); `game`, `seatsOf`
  (`../src/stats/testGames`).

- [ ] **Step 1: Write the tests** in `stats-overview.spec.ts`. Each runs at
  `statsSizesFor(test.info().project.name, page.viewportSize()!)`:
  - `OVERVIEW fits every stats size` (`test.slow()`): the clock fixed 2 days after
    `bigStatsData()`'s last game (so the dashboard has leaders with twelve-character names),
    `stubStats`, `/stats` and then `/stats?cpu=1`, `settle`, `checkStatsPage(page, size)` at each
    size (Review Focus 5).
  - `the numbers follow the filter and the toggle`: players `1 Ann`, `2 Bo`, `3 Cy`; four games
    `[Ann L, Bo L, Cy F]` won by Liberals, two `[Ann L, Cy F]` won by Fascists, two `[Ann L, Bo L,
    CPU F]` won by Liberals. On phones, open the filter's summary line first. `Games played` rows
    (cells per row): at `/stats` `[["1.", "Ann", "6", ""], ["1.", "Cy", "6", ""], ["3.", "Bo", "4",
    ""]]`; the CPU switch: `[["1.", "Ann", "8", ""], ["2.", "Bo", "6", ""], ["2.", "Cy", "6",
    ""]]`; the `Bo` chip off (`/stats?players=1,3&cpu=1`): `[["1.", "Ann", "2", ""], ["1.", "Cy",
    "2", ""]]`; `goBack()`: Ann `8` again (Review Focus 3); a reload of `/stats?players=1,3&cpu=1`
    shows Ann `2`.
  - `the rating history shows a game's change on hover or tap`: `hover()` on desktop and `tap()`
    on phones over the chart shows `.chart-tooltip` with a line matching `/^([+−]\d+|0) → \d+$|^Did
    not play · \d+$/`; at `NARROW_PHONE` a tap 2px inside the chart's right edge leaves
    `checkStatsPage` passing (Review Focus 5).
- [ ] **Step 2: Run** `E2E_PORT=4627 npx playwright test e2e/stats-overview.spec.ts` (all four
  projects). Expected: PASS; fix this phase's CSS where it fails.
- [ ] **Step 3: Run the phone projects and Firefox in the Linux image** (`DEVELOPMENT.md`,
  "Browser tests on Linux": the jar serving on the host with `TEST_SIGN_IN=true PORT=4627`, then
  `-e E2E_PORT=4627` and `npx playwright test --config playwright.linux.config.ts
  e2e/stats-overview.spec.ts --project=firefox --project=phone-360 --project=phone-412`). Expected:
  PASS, with room to spare in every one-line value.
- [ ] **Step 4: Commit** `test(frontend): check the overview in the browser`, with any CSS fixes,
  ticking box 3.

---

### Task 4: Docs and the screenshots

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `DEVELOPMENT.md` (only if something in it went stale),
  `docs/superpowers/plans/2026-11-15-game-stats-interfaces.md` (only to correct a name),
  `docs/PLAN.md`
- Add: `docs/pr/phase-17b-overview/before-overview-1600x900.png`, `before-overview-412x915.png`
  (taken in "Before you start"), `after-overview-1600x900.png`, `after-overview-412x915.png`

- [ ] **Step 1: `CLAUDE.md`**, in the stats part of Layout: `overview.ts` (the dashboard rules,
  the time zone, `winStreaks` and `playerOfTheMonth`, which RECORDS shares), `tabs/OverviewTab.tsx`
  and `PowerRanking`, `testOverview.ts`, and `stats-overview.spec.ts`. Commit `docs(claude):
  describe the overview tab`.
- [ ] **Step 2: `README.md`**, "What this fork adds": OVERVIEW at `/stats` (the dashboard, Elo
  with a handicap per player count, the rating history, the headline numbers). Commit
  `docs(readme): describe the stats overview`.
- [ ] **Step 3: The interfaces file** already lists `overview.ts`'s shared names. Check each
  against the built code; where a name or type differs, correct the file to match the code
  (`docs(plan): correct phase 17b's names in the interfaces file`), and add nothing else.
- [ ] **Step 4: "After" screenshots:** set the prefix in `pr-shots.spec.ts` to `after`, run it as
  before on port 4727, then delete it. Commit the four shots (`docs(docs): add the overview's
  screenshots`), ticking box 4.

---

### Task 5: Whole-branch review

- [ ] **Step 1:** Run the `code-review` skill against `origin/development`, with this plan, the
  interfaces file and the spec's "OVERVIEW (Phase 17)" section (with the counting rules it uses)
  as the spec.
- [ ] **Step 2:** Fix every finding, Minor ones included, each fix with its test and in its own
  commit; a finding that needs no change gets a written reason. Keep the record for the PR.
- [ ] **Step 3:** Re-run the tests the fixes touch. Expected: PASS.

---

### Task 6: Verify, the pull request and the merge

- [ ] **Step 1: Run everything** with `JAVA_HOME` on Java 17: `cd backend && ./gradlew test`; `cd
  frontend && npm test -- --run && npm run build`; `E2E_PORT=4627 npm run e2e` (all four projects;
  Firefox and the phone projects again in the Linux image if Firefox will not launch here).
  Expected: all pass; keep the counts. Then re-run Phase 15's first-download measurement (its
  `the game's first download holds no stats code` browser test, and the entry chunk's gzipped size
  from `npm run build` against `development`'s): unchanged. A failure this phase cannot reach is
  checked on `development` as `implement-issue`'s step 5 describes before it is called a flake.
- [ ] **Step 2: Tick** Phase 17B's acceptance boxes this phase owns ("Backend and frontend unit
  tests pass…", "OVERVIEW shows the numbers…", "PR merged into `development`") and set its Progress
  row to `done`, in one last commit (`docs(plan): tick phase 17b`). The user's box stays unticked.
- [ ] **Step 3: Push and open the PR:** `git push -u origin phase-17b-overview`; `gh pr create
  --repo jussaw/Secret-Hitler-Online --base development --head phase-17b-overview --title
  "feat(frontend): add the stats overview" --body-file <scratchpad file>`. The body: a
  before-and-after table (1600x900 and 412x915, linked by
  `https://raw.githubusercontent.com/jussaw/Secret-Hitler-Online/<sha>/docs/pr/phase-17b-overview/<file>`
  at the pushed head), the changes, this plan's Decisions, the review record, the tests with their
  counts, the docs, and `Part of #31` (Phase 22 closes it).
- [ ] **Step 4: CI to green:** `gh pr checks <PR> --repo jussaw/Secret-Hitler-Online --watch
  --interval 30` in the background; fix what this phase broke and push again. When Phase 18, 19,
  20 or 21A merges first, `git fetch origin && git rebase origin/development`, keep both sides of
  every docs conflict (`CLAUDE.md`, `README.md`, `docs/PLAN.md`), re-run the tests, `git push
  --force-with-lease`, and repoint the screenshot links at the new head. This task ends with the PR
  open, not conflicting, and every check green; report the PR number and head.
- [ ] **Step 5: Merge (the manager session, with the user's standing OK; safe to re-run).** `gh pr
  view <PR> --repo jussaw/Secret-Hitler-Online --json state,mergeable,headRefOid`. If `state` is
  `MERGED`, go to the image check. Otherwise, with every check green and `mergeable` not
  `CONFLICTING`: `gh pr merge <PR> --repo jussaw/Secret-Hitler-Online --squash --admin --subject
  "feat(frontend): add the stats overview (#<PR>)" --match-head-commit <headRefOid>`. Then check
  that `development`'s image publish passes.
