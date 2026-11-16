# Phase 21B: RECORDS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the stats' RECORDS tab: streaks, the best weeks and months, player of the month and
its history, the longest game nights, the highest peak rating and the biggest upset, in the
viewer's time zone (issue #31, Phase 21B).

**Architecture:** One pure module, `records.ts`, builds on what is already merged: Phase 17B's
`winStreaks` and `playerOfTheMonth` (so OVERVIEW and RECORDS share one rule), Phase 21A's calendar
helpers and session summaries in `activity.ts`, and Phase 17A's `EloResult`. `RecordsTab` replaces
Phase 17A's placeholder, memoizes the module per counted set, and lays out `StatCard`s; Phase 22
later adds its trophy holders as a last card.

**Tech Stack:** React 18, TypeScript 5 (ES2020), Vite, Vitest with Testing Library (jsdom),
`@playwright/test` 1.64.1. No new dependency.

**Branch:** `phase-21b-records` (the worktree has the same name), after Phases 21A and 17B merge.

**Spec:** [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](../specs/2026-11-15-game-stats-design.md)
(RECORDS, Counting rules, Elo, Cards, Constraints, Tests), with
[`2026-11-15-game-stats-interfaces.md`](2026-11-15-game-stats-interfaces.md) for every name that
crosses phases, its section "Settled after the plans were written" first. Parent plan:
[`docs/PLAN.md`](../../PLAN.md), Phase 21B. Where this plan and the spec differ, the spec wins;
where it and the settled section differ, the settled section wins.

## Decisions (made here, where the spec leaves a choice)

1. **The time zone is a parameter.** `computeRecords` takes a trailing `timeZone =
   viewerTimeZone()` (pinned in the interfaces file); weeks, months and labels come from Phase 21A's
   `activity.ts` on Phase 15's `localDayKey`. The tab takes optional `now` and `timeZone` props for
   its tests.
2. **Every bucket is by the game's start** (the spec's Counting rules): the best week and month,
   the player of the month and its history.
3. **Shared with OVERVIEW:** each player's streaks (`PlayerStreaks`: current wins, the longest win
   and losing runs with their first and last games) come from Phase 17B's `winStreaks`, and the
   player of the month (this month's and each completed month's) from its
   `playerOfTheMonth(counted, now, timeZone)`. `records.ts` adds the runs' dates, a losing current
   streak, the records across players, the best weeks and months, the history and the sessions.
4. **Rating records** are the highest peak and the biggest upset, shown with its winners' gain and
   its losers' loss. There is no separate biggest gain or loss: with no CPU seats they are always
   the upset's game.
5. **Ties** not given by the spec go to the later period, session, streak or game. The tab lists
   players tied for a title by more counted games, then `compareNames` of `stats.names`.
6. **A record needs a person:** the biggest upset needs a human winner; a month whose only winners
   were CPU seats has no player of the month (`playerOfTheMonth` gives null).
7. **Names in a one-line record** (the streak holders, the player of the month, the highest peak,
   the upset's sides) are `<PlayerName … link={false} />`; names in tables (`RankedTable`, the
   history table, whose rows are at least 44px tall where the stacked query matches) keep the
   default.

## Global Constraints

- **Ownership:** create or change only `frontend/src/stats/records.ts`, `records.test.ts`,
  `tabs/RecordsTab.tsx` with its `.test.tsx` and `.css`, `frontend/e2e/stats-records.spec.ts`, the
  docs (`CLAUDE.md`, `README.md`, `DEVELOPMENT.md`, Phase 21B's section and Progress row of
  `docs/PLAN.md`) and `docs/pr/phase-21b-records/`.
- **Consumed, never edited:** `record.ts` (`Side`); `format.ts` (`viewerTimeZone`, `localDayKey`,
  `formatDuration`); `activity.ts` (`Label`, `weekKey`, `monthKey`, `dayLabel`, `weekLabel`,
  `monthLabel`, `countLabel`, `sessionSummaries`, `SessionSummary`, `computeActivity`);
  `timing.ts` (`computeTiming`); `counting.ts` (`countedGames`, `DEFAULT_FILTER`, `rankRows`,
  `Row`, `humanSeats`, `seatWon`, `compareNames`); `elo.ts` (`EloResult`, `GameElo`,
  `PlayerRating`, `replayElo`); `overview.ts` (`winStreaks`, `PlayerStreaks`, `StreakRun`,
  `playerOfTheMonth`, `Leaders`); `useStats.ts` (`StatsContext`); `StatCard` (`empty?: boolean |
  string`, `className?`, `NO_GAMES`); `RankedTable`; `StatsLink`; `numbers.ts` (`formatPercent`,
  `formatSigned`, `formatRating`); `PlayerName` (`link?: boolean`); `routes.ts` (`routePath`);
  `testRecords.ts` (`makeRecord`, `makeSeats`); `e2e/stats.ts` (`stubStats`, `bigStatsData`,
  `statsSizesFor`, `checkStatsPage`); `e2e/layout.ts` (`MIN_TARGET`); `e2e/lobby.ts` (`settle`);
  `fixtures/recorded-games.json`.
- **ES2020 only**, tests included (`npm run build` type-checks them): no `Array.prototype.at`,
  `Object.hasOwn`, `replaceAll`, `findLast` or newer.
- **The browser spec imports nothing that imports `src/constants`:** only `./stats`, `./layout`,
  `./lobby`, `../src/stats/testRecords` and `record.ts` types.
- **Timing assertions use the spec's limits** (1,000 games well under a second: under 1,000 ms).
  Every browser test that checks a page at every size calls `test.slow()`.
- **`now` is passed in**; `records.ts` never calls `Date.now()`.
- **Layout:** the tab may scroll down, never sideways, from 320x568 to 1920x1080; the game link is
  at least 44px both ways at every size; every grid or flex child has `min-width: 0`. The tab has
  no text field.
- **Numbers:** percentages through `formatPercent`, rating changes through `formatSigned` (U+2212
  minus), ratings through `formatRating`, counts through `countLabel` (`1 win`, `2 wins`, `1 loss`,
  `2 losses`).
- **Linux fonts:** CI draws Germania One 11–17% wider than macOS at phone sizes; before pushing CSS
  that fits text tightly, measure in the Playwright Linux image (`DEVELOPMENT.md`, "Browser tests on
  Linux"), which also runs Firefox where it will not launch on macOS.
- **Environment:** Node 22.12+; `JAVA_HOME` on a Java 17 for `npm run e2e`, which builds the jar.
  Browser tests on `E2E_PORT=4631`; the "before" screenshots on `4731`.
- **Commits:** Conventional Commits with a scope (`frontend`, `plan`, `docs`, `claude`, `readme`,
  `development`), at most 72 characters. Task N ticks the Nth box of Phase 21B in `docs/PLAN.md` in
  its last commit. Nothing about the hosting setup anywhere.

## Review Focus

1. **A win at 23:30 on a month's last day** that ends after midnight: it counts in the month it
   started, in the viewer's zone. Test: Task 1 `aWinCountsInTheMonthItStarted`.
2. **A counted game won by CPU seats alone** (CPU toggle on): it is no upset and makes no player of
   the month, while the humans who lost it still lose streak and rating. Tests: Task 1
   `cpuOnlyWinsNameNoPlayerOfTheMonth`, Task 2 `aWinByCpuSeatsAloneIsNoUpset`.
3. **Two players with equally long streaks:** the one whose streak ended later holds the record.
   Test: Task 1 `theLongestEverTakesTheLaterTie`.
4. **A month just begun with no games yet:** this month has no holder, and last month moves into
   the history. Test: Task 1 `playerOfTheMonthAndItsHistory`.
5. **A player who has only lost:** no longest win, a negative current streak. Test: Task 1
   `cpuOnlyWinsNameNoPlayerOfTheMonth`.

---

### Before you start

- [ ] **Check the prerequisites.** `git fetch origin`; on `origin/development`, Phases 21A and 17B
  are merged: `frontend/src/stats/activity.ts` exports `sessionSummaries` and `countLabel`,
  `timing.ts` exists, `overview.ts` exports `winStreaks` and `playerOfTheMonth`, and
  `tabs/RecordsTab.tsx` is the "Coming in a later update." placeholder (`git show
  origin/development:<path>`); and `docs/PLAN.md` has `## Phase 21B: RECORDS`. If any is missing,
  stop and report to the manager.
- [ ] **Make the branch:** a worktree and branch named `phase-21b-records` from
  `origin/development`; `cd frontend && npm ci`; `npm test -- --run` passes before any change. Set
  Phase 21B's Progress row to `in progress` in Task 1's commit.

---

### Task 1: Streaks, best periods, player of the month, longest sessions

**Files:**
- Create: `frontend/src/stats/records.ts`, `frontend/src/stats/records.test.ts`
- Modify: `docs/PLAN.md` (the Progress row, and box 1)

**Interfaces:**
- Consumes: `activity.ts` (`Label`, `weekKey`, `monthKey`, `dayLabel`, `weekLabel`, `monthLabel`,
  `sessionSummaries`, `SessionSummary`); `viewerTimeZone`, `localDayKey`; `seatWon`, `humanSeats`;
  from `overview.ts`, `winStreaks(counted): Map<number, PlayerStreaks>` (`PlayerStreaks { games;
  current; longestWin: StreakRun | null; longestLoss: StreakRun | null }`, `StreakRun { player;
  length; firstGameId; lastGameId }`, `current` the wins in a row, 0 or more) and
  `playerOfTheMonth(counted, now, timeZone?): Leaders | null` (`{ players, value }`, value the
  wins); `EloResult` (the type, until Task 2).
- Produces in `records.ts` (Phase 22 reads `byPlayer`'s `current`, `longestWin` and `longestLoss`):
  ```ts
  export const TOP_SESSIONS = 5;
  export interface Streak extends StreakRun { from: string; to: string } // long day labels of the first and the last game's start
  export interface BestPeriod extends Label { wins: number }
  export interface PlayerRecords { games: number;
    current: number;   // PlayerStreaks.current when above 0, else minus the losses in a row that end their games
    longestWin: Streak | null; longestLoss: Streak | null; bestWeek: BestPeriod | null; bestMonth: BestPeriod | null }
  export interface MonthHolder extends Label { players: number[]; wins: number }  // [] and 0 when nobody won
  export interface RecordStats {
    byPlayer: Map<number, PlayerRecords>;
    longestWin: Streak | null; longestLoss: Streak | null;   // across players, ties to the later end
    playerOfTheMonth: MonthHolder;                          // playerOfTheMonth(counted, now, timeZone)
    monthHistory: MonthHolder[];                            // completed months with a holder, newest first
    topSessions: SessionSummary[];                          // at most TOP_SESSIONS, most games first, ties later first
  }
  export function computeRecords(counted: GameRecord[], elo: EloResult, now: number, timeZone = viewerTimeZone()): RecordStats;
  ```
  A player's `games`, `longestWin` and `longestLoss` are `winStreaks`' (`PlayerStreaks`), each
  `StreakRun` given `from` and `to` from its first and last game; nothing walks the runs again but
  the losses that end a player's games (for a negative `current`). The across-player records take
  the longest of those runs, a tie going to the run whose last game is later in counted order. A
  completed month's holder is `playerOfTheMonth(counted, <the latest counted start in that month>,
  timeZone)`, so OVERVIEW and RECORDS share one rule; months where it gives null are left out.
  `players` keep `playerOfTheMonth`'s order.

- [ ] **Step 1: Write the failing tests.** Builder `played(id, start, winners, losers = [], side =
  "LIBERAL")`: a 30-minute game won by `side`, `winners` seated on it and `losers` on the other
  (the Fascist side's first seat `HITLER`), then CPU seats up to five, on the winning side when
  `winners` is empty and on the losing side otherwise, `hasCpu` set. `NO_ELO` is an `EloResult`
  with empty maps and history; `NOW = Date.parse("2026-11-20T12:00:00Z")`; `sorted(xs)` copies and
  sorts numbers.

```ts
const day = (d: number) => `2026-10-${String(d).padStart(2, "0")}T20:00:00Z`;
const run = (player: number, results: string, from: number) => results.split("").map((r, i) =>
  played(`p${player}-${i + 1}`, day(from + i), r === "W" ? [player] : [], r === "W" ? [] : [player]));
const MONTHS = [played("aug", "2026-08-10T20:00:00Z", [2]), played("o1", "2026-10-12T20:00:00Z", [3]),
  played("o2", "2026-10-13T20:00:00Z", [3]), played("o3", "2026-10-14T20:00:00Z", [1]),
  ...[2, 3, 4, 5].map((d) => played(`n${d}`, `2026-11-0${d}T20:00:00Z`, [1, 2])),
  played("n6", "2026-11-06T20:00:00Z", [3])];

it("streaks", () => {
  const counted = [...run(1, "WWLWWWLLLW", 1), ...run(3, "WWW", 20)];
  const r = computeRecords(counted, NO_ELO, NOW, "UTC");
  expect(r.byPlayer.get(1)).toMatchObject({ games: 10, current: 1,
    longestWin: { player: 1, length: 3, firstGameId: "p1-4", lastGameId: "p1-6", from: "Sun 4 Oct 2026", to: "Tue 6 Oct 2026" },
    longestLoss: { length: 3, firstGameId: "p1-7", lastGameId: "p1-9" } });
  expect(r.longestWin).toMatchObject({ player: 3, length: 3 });   // the later end
  expect(r.longestLoss).toMatchObject({ player: 1, length: 3 });
  for (const [n, s] of winStreaks(counted)) {
    expect(r.byPlayer.get(n)!.longestWin?.length ?? 0).toBe(s.longestWin?.length ?? 0);
    expect(r.byPlayer.get(n)!.longestLoss?.lastGameId).toBe(s.longestLoss?.lastGameId);
  }
});
it("playerOfTheMonthAndItsHistory", () => { // Review Focus 4
  const r = computeRecords(MONTHS, NO_ELO, NOW, "UTC");
  expect(r.playerOfTheMonth).toMatchObject({ key: "2026-11", label: "Nov 2026", long: "November 2026", wins: 4 });
  expect(sorted(r.playerOfTheMonth.players)).toEqual([1, 2]);
  expect(r.monthHistory.map((m) => [m.key, sorted(m.players), m.wins])).toEqual([["2026-10", [3], 2], ["2026-08", [2], 1]]);
  const dec = computeRecords(MONTHS, NO_ELO, Date.parse("2026-12-02T12:00:00Z"), "UTC");
  expect(dec.playerOfTheMonth).toMatchObject({ key: "2026-12", players: [], wins: 0 });
  expect(dec.monthHistory[0]).toMatchObject({ key: "2026-11", wins: 4 });
});
```

  And, with exact values:
  - `aLosingRunMakesTheCurrentStreakNegative`: `run(2, "WWLWWLL", 1)` gives player 2 `current`
    `-2` and `longestLoss` `{ length: 2, lastGameId: "p2-7" }`; `run(2, "WWL", 1)` then `run(2,
    "W", 4)` gives `current` `1`.
  - `theLongestEverTakesTheLaterTie` (Review Focus 3): `run(1, "WW", 1)` and `run(3, "WW", 10)`
    give `longestWin.player` `3`; `run(1, "LL", 1)` and `run(3, "LL", 10)` give
    `longestLoss.player` `3`.
  - `bestWeekAndMonthTakeTheLaterTie`: player 1 wins games starting `2026-10-05T20`, `10-07T19`,
    `10-07T20`, `11-02T20`, `11-04T19`, `11-04T20` and `11-10T20` (`:00:00Z`): `bestWeek` `{ key:
    "2026-11-02", long: "Week of 2 Nov 2026", wins: 3 }`, `bestMonth` `{ key: "2026-11", long:
    "November 2026", wins: 4 }`.
  - `aWinCountsInTheMonthItStarted` (Review Focus 1, and the zone): player 4's win starting
    `2026-10-31T23:30:00Z` is in `monthHistory` as `"2026-10"` in `UTC`, and makes
    `playerOfTheMonth.players` `[4]` in `Europe/Paris` (00:30 on 1 November).
  - `cpuOnlyWinsNameNoPlayerOfTheMonth` (Review Focus 2 and 5): `played("c", "2026-10-12T20:00:00Z",
    [], [1, 2], "FASCIST")` gives `monthHistory` `[]` and player 1 `current` `-1`,
    `longestLoss.length` `1` and `longestWin` `null`.
  - `topSessions`: 3 games on 2 Nov (10:00, 11:00, 12:00Z), 1 on 7 Nov, 2 on 14 Nov give `[games,
    day]` `[[3, "Mon 2 Nov 2026"], [2, "Sat 14 Nov 2026"], [1, "Sat 7 Nov 2026"]]`; seven one-game
    nights on 1 to 7 Nov give the days `Sat 7`, `Fri 6`, `Thu 5`, `Wed 4`, `Tue 3 Nov 2026`.
  - `noGames`: `byPlayer` empty, both streaks null, `playerOfTheMonth` `{ key: "2026-11", players:
    [], wins: 0 }`, `monthHistory` and `topSessions` `[]`.
- [ ] **Step 2: Run** `cd frontend && npm test -- --run src/stats/records.test.ts`. Expected: FAIL,
  `./records` cannot be resolved.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run it again.** Expected: PASS. If `winStreaks` or `playerOfTheMonth` disagrees with
  a test here, report it to the manager: the rule is OVERVIEW's, so the fix is in one place.
- [ ] **Step 5: Commit** `feat(frontend): add streaks, best periods and player of the month`,
  ticking box 1 and setting the Progress row to `in progress`.

---

### Task 2: Rating records

**Files:**
- Modify: `frontend/src/stats/records.ts`, `frontend/src/stats/records.test.ts`

**Interfaces:**
- Consumes: `EloResult` (`ratings.get(n).peak`, `games.get(id)`: `expectedLiberal`,
  `liberalChange`); `replayElo`, `countedGames`, `DEFAULT_FILTER`, `parseStatsData`,
  `computeActivity`, `computeTiming` (tests).
- Produces, added to `RecordStats`:
  ```ts
  export interface Upset { gameId: string; endedAt: number; winner: Side; chance: number;
    change: number;                       // |liberalChange|: each winner's gain and each loser's loss
    winners: number[]; losers: number[] } // human players, ascending
  highestPeak: { players: number[]; rating: number } | null;  // Math.round of the highest peak; every player whose rounded peak equals it
  biggestUpset: Upset | null;  // the lowest winner's chance (E for a Liberal win, 1 − E for a Fascist one) among games with a human winner
  ```
  Games with no entry in `elo.games` are skipped; a tie goes to the later game in counted order.

- [ ] **Step 1: Write the failing tests.** `eloOf(games, peaks)` maps each game ID to `{ gameId,
  expectedLiberal, handicap: 0, liberalChange }` and each player to a `PlayerRating` with that
  `peak` (the same `rating`, 6 games, not provisional), with an empty `history`:

```ts
const games = [played("a", "2026-11-01T20:00:00Z", [1, 2, 3], [4, 5]),
  played("b", "2026-11-02T20:00:00Z", [4, 5], [1, 2, 3], "FASCIST"),
  played("c", "2026-11-03T20:00:00Z", [1, 2, 3], [4, 5]),
  played("d", "2026-11-04T20:00:00Z", [1, 2, 3], [4, 5]),
  played("e", "2026-11-05T20:00:00Z", [], [1, 2, 3], "FASCIST")];   // won by CPU seats alone
const elo = eloOf({ a: [0.5, 16], b: [0.75, -24], c: [0.625, 12], d: [0.25, 24], e: [0.875, -28] },
  { 1: 1561.4, 2: 1530, 3: 1561.2 });   // [expectedLiberal, liberalChange] by game; peaks by player
it("ratingRecords", () => {
  const r = computeRecords(games.slice(0, 3), elo, NOW, "UTC");
  expect(r.highestPeak).toEqual({ players: [1, 3], rating: 1561 });
  expect(r.biggestUpset).toMatchObject({ gameId: "b", winner: "FASCIST", chance: 0.25, change: 24,
    winners: [4, 5], losers: [1, 2, 3] });
});
it("onTheContractFixture", () => {
  // DEFAULT_FILTER leaves out the fixture's games with CPU seats, where a CPU-won swing is no upset.
  const counted = countedGames(parseStatsData(fixture).games, DEFAULT_FILTER);
  const elo = replayElo(counted);
  const r = computeRecords(counted, elo, NOW, "UTC");
  // A side moves together, so with no CPU seats the upset is also the biggest swing.
  expect(r.biggestUpset!.change).toBeCloseTo(Math.max(...counted.map((g) => Math.abs(elo.games.get(g.id)!.liberalChange))));
  r.byPlayer.forEach((p) =>
    expect(Math.max(Math.abs(p.current), p.longestWin ? p.longestWin.length : 0, p.bestMonth ? p.bestMonth.wins : 0))
      .toBeLessThanOrEqual(p.games));
});
```

  And, with exact values:
  - `anUpsetTieGoesToTheLaterGame`: games `a` to `d` give the upset `{ gameId: "d", winner:
    "LIBERAL", chance: 0.25, change: 24, winners: [1, 2, 3], losers: [4, 5] }`.
  - `aWinByCpuSeatsAloneIsNoUpset` (Review Focus 2): games `a` to `e` still give `"d"`, though
    `e`'s winners had a 0.125 chance.
  - `noRatingRecordsWithoutGames`: both null.
  - `theStatsModulesOn1000GamesUnderASecond` (the spec's "well under a second"): the fixture's
    games, repeated to 1,000 (each copy's ids suffixed and its times a week later), counted with
    `cpu: true` and `replayElo` run first; `computeActivity`, `computeTiming` and `computeRecords`
    together take under 1,000 ms (`performance.now()`).
- [ ] **Step 2: Run** `npm test -- --run src/stats/records.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run it again.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the highest peak and the biggest upset`, ticking box 2.

---

### Task 3: The RECORDS tab

**Files:**
- Modify: `frontend/src/stats/tabs/RecordsTab.tsx` (Phase 17A's placeholder; keep its named
  export; Phase 22 adds a last card, `Trophy holders`, so end with this phase's last card and no
  placeholder)
- Create: `frontend/src/stats/tabs/RecordsTab.css`, `frontend/src/stats/tabs/RecordsTab.test.tsx`

**Interfaces:**
- Consumes: `StatsContext`; Tasks 1 and 2; `StatCard`, `NO_GAMES`, `RankedTable`, `rankRows`,
  `compareNames`, `formatPercent`, `formatSigned`, `formatRating`, `PlayerName`, `formatDuration`,
  `StatsLink`, `routePath`, `countLabel`, `viewerTimeZone`.
- Produces: `RecordsTab(props: { stats: StatsContext; now?: number; timeZone?: string })`: `const
  [mountedAt] = useState(Date.now)`, `now = props.now ?? mountedAt`, `zone = props.timeZone ??
  viewerTimeZone()`; `computeRecords` memoized on `[stats.counted, stats.elo, now, zone]`. Root
  `div.records-tab`, a grid of `repeat(auto-fill, minmax(min(100%, 300px), 1fr))`. Each `StatCard`
  sits in its own `div.records-cell` with `min-width: 0` and `data-card` set to its slug; the
  section headings are `h2.records-heading` (Germania One). A record with no holder leaves its line
  out; a card with games but nothing to show passes its own `empty` line. The game link is a
  `StatsLink` with `className="records-game-link"` (`See the game`, `href = routePath({ page:
  "game", id })`), `display: inline-flex`, at least 44px both ways. Players tied for a title are
  listed by more counted games (`records.byPlayer`), then `compareNames` of `stats.names`.
- The cards, in order, each `empty` without counted games:
  - **Streaks** — *Longest win streak* (`longest-win-streak`): "The most counted wins in a row; a
    tie goes to the later streak." `Maya · 3 wins · Sun 4 Oct 2026 to Tue 6 Oct 2026` (the name
    `link={false}`). *Longest losing streak* (`longest-losing-streak`): the same with losses.
    *Current streaks* (`current-streaks`): "Each player's run as of their last counted game."
    `RankedTable` of `current` (`3 wins`, `1 loss`), most wins first, minimum 1.
  - **Wins** — *Most wins in a week* (`most-wins-week`): "Each player's best week, Monday to
    Sunday; a tie goes to the later week." `RankedTable` of `bestWeek` (`3 · Week of 2 Nov 2026`),
    by wins. *Most wins in a month* (`most-wins-month`): likewise. *Player of the month*
    (`player-of-the-month`): "The most counted wins this month (November 2026); ties all shown."
    the names (`link={false}`) and `4 wins`, or `empty="No wins yet this month."`. *Players of the
    month* (`players-of-the-month`): "Each completed month's player of the month." A table of
    month, names, wins, newest first, its rows at least 44px tall where the stacked query matches.
  - **Sessions** — *Most games in one session* (`most-games-session`): "The longest game nights; a
    tie goes to the later one." Up to five lines `6 games · Sat 14 Nov 2026 · 4 h 10 min`.
  - **Ratings** — *Rating records* (`rating-records`): "The highest Elo reached, and the win least
    expected, under this filter." `Highest peak: Ann, Cy · 1561`; `Biggest upset: Fascists won with
    a 25% chance · Di, Ed +24 · Ann, Bo, Cy −24` (the winners' gain and the losers' loss through
    `formatSigned`; a side with no human players left out; names `link={false}`) and its game link.

- [ ] **Step 1: Write the failing tests.** The context is `{ data, filter: { players: null, cpu:
  false }, counted, elo: replayElo(counted), names }`; `tab(games)` renders with `now = NOW` and
  `timeZone = "UTC"`; `card(slug)` is the `[data-card="<slug>"]` cell. Task 1's `MONTHS` and Task
  2's games `a` to `d` (`GAMES_A_TO_D`) are rebuilt here, with players 1 `Bo`, 2 `Ann`, 3 `Cy`, 4
  `Di`, 5 `Ed`.

```ts
const SLUGS = ["longest-win-streak", "longest-losing-streak", "current-streaks", "most-wins-week",
  "most-wins-month", "player-of-the-month", "players-of-the-month", "most-games-session", "rating-records"];
it("playerOfTheMonthListsEveryTiedPlayer", () => {
  tab(MONTHS);
  expect([...document.querySelectorAll(".records-cell")].map((c) => c.getAttribute("data-card"))).toEqual(SLUGS);
  // Bo and Ann both won 4 in 5 counted games: by name
  expect(within(card("player-of-the-month")).getAllByText(/^(Ann|Bo)$/).map((e) => e.textContent)).toEqual(["Ann", "Bo"]);
  expect(within(card("player-of-the-month")).getByText("4 wins")).toBeInTheDocument();
});
it("theUpsetLinksToItsGame", () => {
  tab(GAMES_A_TO_D);
  const links = within(card("rating-records")).getAllByRole("link", { name: "See the game" });
  expect(links).toHaveLength(1);
  expect(links[0].getAttribute("href")).toMatch(/^\/stats\/games\/[abcd]$/);
  fireEvent.click(links[0]);
  expect(window.location.pathname).toBe(links[0].getAttribute("href"));
});
```

  And: `currentStreaksReadAsWinsAndLosses` (games `a` to `d`: `current-streaks` shows `2 wins`
  three times and `2 losses` twice); `noGamesEmptiesEveryCard` (each slug's cell shows `NO_GAMES`,
  checked per cell, so Phase 22's extra card does not break it).
- [ ] **Step 2: Run** `npm test -- --run src/stats/tabs/RecordsTab.test.tsx`. Expected: FAIL (the
  placeholder says "Coming in a later update.").
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): fill the records tab`, ticking box 3.

---

### Task 4: RECORDS in the browser

**Files:**
- Create: `frontend/e2e/stats-records.spec.ts` (its name runs it in `desktop`, `firefox`,
  `phone-360` and `phone-412`)

**Interfaces:**
- Consumes from `./stats`: `stubStats`, `bigStatsData`, `statsSizesFor(project, viewport)`,
  `checkStatsPage(page, size)`; `MIN_TARGET` (`./layout`); `settle` (`./lobby`); `makeRecord`,
  `makeSeats` (`../src/stats/testRecords`).
- Produces in the spec only: `open(page, data = bigStatsData(), at?)` (`stubStats`,
  `page.clock.setFixedTime(at ?? an hour after the data's latest endedAt)`, so this month has a
  player of the month, then `goto("/stats/records")`, `.records-tab` visible, `settle`). No
  sideways check of its own: `checkStatsPage` is the one.

- [ ] **Step 1: Write the tests:**
  - `"RECORDS fits sideways at every stats size, with 44px targets"`: `test.slow()`, then at each
    of `statsSizesFor(project, viewport)`, `checkStatsPage(page, size)` and at least one
    `a.records-game-link`, each at least `MIN_TARGET` both ways.
  - `"See the game opens the upset's game"` (`desktop`): `See the game` lands on
    `/stats/games/<id>`, `<id>` one of `bigStatsData()`'s games.
  - Two `test.describe`s with `test.use({ timezoneId })` (`desktop`), on one counted five-player
    game won by player 1 (`Ann`), from `2026-10-31T23:30:00Z` to `2026-11-01T00:10:00Z`, with the
    clock at `2026-11-20T12:00:00Z`: in `Europe/Paris` the player of the month is `Ann`; in
    `America/Los_Angeles` it says `No wins yet this month.` and the history lists `October 2026`.
- [ ] **Step 2: Run** `cd frontend && E2E_PORT=4631 npx playwright test e2e/stats-records.spec.ts`.
  Expected: PASS in every project; run `firefox`, and the phone projects again for CI's wider
  fonts, through `DEVELOPMENT.md`'s "Browser tests on Linux" when Firefox will not launch on macOS.
  Fix a failure in the task that owns it, test first; at 320x568 the fix is wrapping, never a
  sideways page scroll.
- [ ] **Step 3: Commit** `test(frontend): check the records tab in the browser`, ticking box 4.

---

### Task 5: Docs

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `DEVELOPMENT.md` (only if something in it went stale),
  `docs/PLAN.md` (Phase 21B's section)

- [ ] **Step 1: `CLAUDE.md`**, where Layout describes `src/stats/`: `records.ts` (built on
  OVERVIEW's `winStreaks` and `playerOfTheMonth`, so the two tabs share one rule; the best weeks
  and months by the game's start in the viewer's zone; the history; the top sessions; the highest
  peak and the biggest upset), the tab and its optional `now`/`timeZone` props, and
  `stats-records.spec.ts` (`checkStatsPage` at `statsSizesFor`, `timezoneId`). Commit
  `docs(claude): describe the records tab`.
- [ ] **Step 2: `README.md`**, "What this fork adds", the stats entry: RECORDS in a line. Commit
  `docs(readme): add the records tab`.
- [ ] **Step 3: `DEVELOPMENT.md`**, only if something in it went stale. Commit
  `docs(development): …`.
- [ ] **Step 4: Tick box 5** in `docs/PLAN.md` in the last of these commits.

---

### Task 6: Whole-branch review

- [ ] **Step 1: Review** the branch against `origin/development` with the `code-review` skill
  (standards, and the spec: this plan, the spec's RECORDS, Counting rules, Elo and Constraints, and
  the interfaces file's settled section).
- [ ] **Step 2: Fix every finding**, Minor ones included, test first where it is behaviour, each as
  its own `fix(frontend): …` or `test(frontend): …` commit; a finding that needs no change gets its
  reason in the review record for the PR body.
- [ ] **Step 3: Run** `cd frontend && npm test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 4: Tick box 6** in `docs/PLAN.md` (`docs(plan): close phase 21b's review`).

---

### Task 7: Screenshots and the pull request

**Files:**
- Create: `docs/pr/phase-21b-records/` (`before-1600x900.png`, `after-1600x900.png`,
  `before-412x915.png`, `after-412x915.png`)
- Temporary, never committed: `frontend/e2e/pr-shots.spec.ts`

- [ ] **Step 1: Run everything:** `cd backend && ./gradlew test`; `cd frontend && npm test -- --run
  && npm run build`; `E2E_PORT=4631 npm run e2e` (all four projects, Firefox and the phone projects
  also in the Linux image when Firefox will not launch locally). Expected: all pass; keep the
  counts for the PR.
- [ ] **Step 2: Take the screenshots.** `pr-shots.spec.ts`: `stubStats` with `bigStatsData()`, the
  clock an hour after its latest game, a full-page screenshot of `/stats/records` after `settle`,
  at 1600x900 in `desktop` and 412x915 in `phone-412`, to
  `docs/pr/phase-21b-records/<PR_SHOTS>-<size>.png` (`PR_SHOTS` is `before` or `after`). Run it
  here with `PR_SHOTS=after E2E_PORT=4631`. For "before", add a worktree of `origin/development`
  nested under this one (`<this worktree>/.claude/worktrees/phase-21b-before`), copy the spec in,
  `npm ci`, run it with `PR_SHOTS=before E2E_PORT=4731` (the "Coming in a later update."
  placeholder), copy the images back and remove the worktree. Delete `pr-shots.spec.ts`; `git
  status` must not list it.
- [ ] **Step 3: Commit** the images, ticking box 7: `docs(docs): add the records tab's
  screenshots`.
- [ ] **Step 4: Push and open the PR** into `development` with `gh pr create --repo
  jussaw/Secret-Hitler-Online --base development`, titled `feat(frontend): add the records tab`.
  Near the top, a table of before and after at both sizes, by raw URLs pinned to the screenshots'
  commit; then what changed, the Decisions above, the review record, the test counts, and `Part of
  #31`.
- [ ] **Step 5: Keep it green and current.** Fix CI until every check passes. When another phase
  merges first: `git fetch origin && git rebase origin/development`; conflicts can only be in the
  docs (`CLAUDE.md`, `README.md`, `DEVELOPMENT.md`, `docs/PLAN.md`): keep both sides; run the unit
  tests and the build again, then `git push --force-with-lease`. The phase is done here: the PR is
  open and CI is green.
- [ ] **Step 6: Merge (the manager session, with the user's standing OK; safe to run again).** If
  `gh pr view <N> --repo jussaw/Secret-Hitler-Online --json state -q .state` says `MERGED`, go
  straight to the image check. Otherwise, unless the last commit already ticks them, tick "PR
  merged into `development`" and the tests' acceptance box and set the Progress row to `done`
  (`docs(plan): tick phase 21b's merged box`), push, wait for green, then `gh pr merge <N> --squash
  --admin --repo jussaw/Secret-Hitler-Online --subject "feat(frontend): add the records tab (#<N>)"`.
  Last, check that `development`'s CI run, which publishes the image, passes. The user's box stays
  unticked.
