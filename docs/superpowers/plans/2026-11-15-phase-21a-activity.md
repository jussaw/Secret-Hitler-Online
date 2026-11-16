# Phase 21A: ACTIVITY Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the stats' ACTIVITY tab: games over time, attendance, the calendar heatmap, when
games start, sessions and gaps, and decision times, all in the viewer's time zone, with two new
hand-drawn charts (issue #31, Phase 21A).

**Architecture:** Two pure modules turn the counted games into numbers: `activity.ts` (with the
calendar helpers the stats need beyond Phase 15's `localDayKey`, which Phase 21B's `records.ts`
reuses) and `timing.ts` (reads `rounds()`; owns the fastest-voter rule Speed Demon shares). Two SVG
components, `BarChart` and `CalendarHeatmap`, size themselves from their box and share Phase 17A's
chart look. `ActivityTab` replaces Phase 17A's placeholder, memoizes the modules per counted set,
and lays out `StatCard`s.

**Tech Stack:** React 18, TypeScript 5 (ES2020), Vite, Vitest with Testing Library (jsdom),
`@playwright/test` 1.64.1, `Intl.DateTimeFormat` with an explicit `timeZone`. No new dependency.

**Branch:** `phase-21a-activity` (the worktree has the same name), after Phases 16 and 17A merge,
beside 17B, 18, 19 and 20. Phase 21B (RECORDS) follows it.

**Spec:** [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](../specs/2026-11-15-game-stats-design.md)
(ACTIVITY, Counting rules, Charts, Cards, Constraints, Tests), with
[`2026-11-15-game-stats-interfaces.md`](2026-11-15-game-stats-interfaces.md) for every name that
crosses phases, its section "Settled after the plans were written" first. Parent plan:
[`docs/PLAN.md`](../../PLAN.md), Phase 21A. Where this plan and the spec differ, the spec wins;
where it and the settled section differ, the settled section wins.

## Decisions (made here, where the spec leaves a choice)

1. **The time zone is a parameter.** `computeActivity` takes a trailing `timeZone =
   viewerTimeZone()` (pinned in the interfaces file). Dates come from Phase 15's `localDayKey(ms,
   timeZone)`, day differences from Phase 17A's `localDaysBetween(from, to, timeZone)`, and the hour
   from this phase's `localHour(ms, timeZone)`; weeks, months and weekdays are arithmetic on the day
   key. Nothing reads `Date`'s local getters, so Vitest passes zones and Playwright checks the
   default with `timezoneId`. The tab takes optional `now` and `timeZone` props for its tests.
2. **Every bucket is by the game's start** (the spec's Counting rules); only "days since the last
   game" uses the last game's `endedAt`.
3. **Games over time** ends at the latest counted game's period. Weekly shows the last
   `WEEKS_SHOWN = 52` weeks (fewer when play began later); monthly every month from the first
   game's. Empty periods are bars of 0. `cumulative` counts every counted game up to the period's
   end, so it is all-time even when the first week shown is not. Cumulative games are bars too.
   Attendance follows the same week or month switch.
4. **The heatmap's "last 12 months"** is the 365 local days ending on the latest counted game's
   start day; each year with a counted game has its own view (1 Jan to 31 Dec). A view's shade
   scale is its own busiest day: `shade = games === 0 ? 0 : ceil(games · 4 / busiest)`.
5. **Decision times** are `rounds()`'s. "Choose as chancellor" counts both `ms.chancellor` and
   `ms.chancellorAfterVeto`. "End a term" averages only terms the president ended (`endTerm.by ===
   "president"`); the countdown's are its share. **Slowest president** pools a player's nominate,
   discard, power and END TERM times and needs `MIN_CHANCES` samples, ties all shown. The
   **fastest voter** is the settled one-holder rule shared with Speed Demon (`fastestVoter`, Task
   3). CPU presidents' terms are not in the countdown share: they never get one.
6. **Ties** not given by the spec go to the later period or session. Tied slowest presidents are
   listed by `compareNames` of `stats.names`.
7. **Hover and tap** show Phase 17A's `.chart-tooltip` (`charts/charts.css`) over the active bar or
   day, as its line and stacked bar charts do; arrow keys move it too.
8. **Names in a sentence** (the fastest voter and slowest president lines) are `<PlayerName …
   link={false} />`; names in the decision-times table keep `PlayerName`'s default, in rows at
   least 44px tall where the stacked query matches, so they are 44px targets once Phase 22 makes
   them links.

## Global Constraints

- **Ownership:** create or change only `frontend/src/stats/activity.ts`, `timing.ts`,
  `charts/BarChart.tsx`, `charts/CalendarHeatmap.tsx`, `tabs/ActivityTab.tsx`, each one's
  `.test.ts(x)` and `.css` beside it, `frontend/e2e/stats-activity.spec.ts`, the docs (`CLAUDE.md`,
  `README.md`, `DEVELOPMENT.md`, Phase 21A's section and Progress row of `docs/PLAN.md`) and
  `docs/pr/phase-21a-activity/`.
- **Consumed, never edited:** `record.ts`; `format.ts` (`viewerTimeZone`, `localDayKey`);
  `rounds.ts` (`rounds`, `Round.ms` with `chancellorAfterVeto`, `Vote.ms`, `endTerm.by`, `pauses`,
  `disconnects`, and `formatDecisionTime`: whole seconds, at least 1, `"8 s"`, from 60 s `"1 min
  05 s"`); `game/sampleGames.ts` (`ev.<type>(r, t, …)`, tests only); `counting.ts`
  (`countedGames`, `DEFAULT_FILTER`, `MIN_CHANCES = 5`, `rate`, `Rate`, `rankRows`, `Row`,
  `humanSeats`, `sessions`, `compareNames`, `localDaysBetween`); `elo.ts` (`replayElo`, tests);
  `useStats.ts` (`StatsContext`); `StatCard` (`empty?: boolean | string`, `className?`,
  `NO_GAMES`); `RankedTable`; `ScrollRegion`; `numbers.ts` (`formatPercent`); `PlayerName`
  (`link?: boolean`); `testRecords.ts` (`makeRecord`, `makeSeats`); `charts/useChartWidth.ts`,
  `charts/charts.css`, `SERIES_COLORS`, `charts/StackedBarChart.tsx` (`bars`, `colors`, `label`,
  `legend`); `e2e/stats.ts` (`stubStats`, `bigStatsData`, `statsSizesFor`, `checkStatsPage`);
  `e2e/layout.ts`; `e2e/lobby.ts` (`settle`); `fixtures/recorded-games.json`.
- **ES2020 only**, tests included (`npm run build` type-checks them): no `Array.prototype.at`,
  `Object.hasOwn`, `replaceAll`, `findLast` or newer (`xs[xs.length - 1]`, not `xs.at(-1)`).
- **The browser spec imports nothing that imports `src/constants`** (it reads `window` when it
  loads): only `./stats`, `./layout`, `./lobby`, `../src/stats/testRecords` and `record.ts` types.
- **Every browser test that checks a page at every size calls `test.slow()`.**
- **`now` is passed in**; no module calls `Date.now()`. Weeks start on Monday; weekday 0 is Monday.
- **Labels are fixed English** from constant arrays, never the browser's locale: day `14 Nov` /
  `Sat 14 Nov 2026`, week `9 Nov` / `Week of 9 Nov 2026`, month `Nov 2026` / `November 2026`,
  weekday `Mon` / `Monday`, hour `21` / `21:00 to 22:00`.
- **Colours:** office orange `#f08a5d` (bars, the heatmap's top shade), players in
  `SERIES_COLORS` by their index in `stats.data.players`; fonts `var(--headerFont)` (titles) and
  `var(--textFont)`.
- **Layout:** the tab may scroll down, never sideways, from 320x568 to 1920x1080; every button is at
  least 44px both ways at every size; the decision-times table scrolls inside its card in a
  `ScrollRegion`; every grid or flex child has `min-width: 0`. The tab has no text field.
- **Numbers:** percentages through `formatPercent`, counts through `countLabel` (`1 game`, `2
  games`), average times through `formatAverageTime`.
- **Linux fonts:** CI draws Germania One 11–17% wider than macOS at phone sizes; before pushing CSS
  that fits text tightly, measure in the Playwright Linux image (`DEVELOPMENT.md`, "Browser tests on
  Linux"), which also runs Firefox where it will not launch on macOS.
- **Environment:** Node 22.12+; `JAVA_HOME` on a Java 17 for `npm run e2e`, which builds the jar.
  Browser tests on `E2E_PORT=4621`; the "before" screenshots on `4721`.
- **Commits:** Conventional Commits with a scope (`frontend`, `plan`, `docs`, `claude`, `readme`,
  `development`), at most 72 characters. Task N ticks the Nth box of Phase 21A in `docs/PLAN.md` in
  its last commit. Nothing about the hosting setup anywhere.

## Review Focus

1. **A game that crosses local midnight** (23:30 to 00:30): it counts on its start's day, week,
   month and hour; "days since" uses its end. Test: Task 2 `aGameCountsOnTheDayItStarted`.
2. **A daylight-saving change** in the viewer's zone: hours are wall-clock, weeks stay seven days.
   Test: Task 1 `aDaylightSavingChangeMovesNoHourOrDay`.
3. **A viewer's clock behind the server's** (`now` before the last game's end): "days since" is 0,
   never negative. Test: Task 2 `aClockBehindTheLastGameGivesZeroDays`.
4. **Years of play:** the weekly charts stay at 52 bars, and a chart with more bars than pixels
   stays in its box. Tests: Task 1 `weeksStopAtFiftyTwo`, Task 4 `manyBarsStayInTheBox`.
5. **A quick voter with few games** (35 timed votes over 7 games): no fastest voter, as Speed Demon
   gives no trophy. Test: Task 3 `theFastestVoterNeedsThirtyVotesAndEightGames`.

---

### Before you start

- [ ] **Check the prerequisites.** `git fetch origin`; on `origin/development`, Phases 16 and 17A
  are merged: `frontend/src/stats/rounds.ts` has `chancellorAfterVeto` and `formatDecisionTime`,
  `counting.ts` has `localDaysBetween`, `charts/useChartWidth.ts` exists and
  `tabs/ActivityTab.tsx` is the "Coming in a later update." placeholder (`git show
  origin/development:<path>`); and `docs/PLAN.md` has `## Phase 21A: ACTIVITY`. If any is missing,
  stop and report to the manager.
- [ ] **Make the branch:** a worktree and branch named `phase-21a-activity` from
  `origin/development`; `cd frontend && npm ci`; `npm test -- --run` passes before any change. Set
  Phase 21A's Progress row to `in progress` in Task 1's commit.

---

### Task 1: The local calendar and games over time

**Files:**
- Create: `frontend/src/stats/activity.ts`, `frontend/src/stats/activity.test.ts`
- Modify: `docs/PLAN.md` (the Progress row, and box 1)

**Interfaces:**
- Consumes: `GameRecord`, `humanSeats`; `viewerTimeZone`, `localDayKey`; `makeRecord`,
  `makeSeats` (tests).
- Produces in `activity.ts` (Phase 21B uses `Label`, the keys, the labels and `countLabel`):
  ```ts
  export type Grain = "week" | "month";
  export const WEEKS_SHOWN = 52;
  export interface Label { key: string; label: string; long: string }
  export interface Period extends Label { games: number; cumulative: number; byPlayer: Map<number, number> }
  export interface PlayerActivity { games: number; share: number; lastEndedAt: number }
  export interface ActivityStats {
    byPlayer: Map<number, PlayerActivity>;   // human players; share = games / counted.length
    periods: Record<Grain, Period[]>;
    byWeekday: number[];                     // 7, Monday first
    byHour: number[];                        // 24
  }
  export function localHour(ms: number, timeZone: string): number;  // 0–23 on the wall clock
  export function weekdayOf(dayKey: string): number;                 // 0 = Monday
  export function weekKey(dayKey: string): string;                   // its Monday's day key
  export function monthKey(dayKey: string): string;                  // "2026-11"
  export function addDays(dayKey: string, days: number): string;
  export function dayLabel(key: string): Label;
  export function weekLabel(key: string): Label;
  export function monthLabel(key: string): Label;
  export function countLabel(n: number, unit: [string, string]): string; // "1 game", "0 games"
  export function computeActivity(counted: GameRecord[], now: number, timeZone = viewerTimeZone()): ActivityStats;
  ```

- [ ] **Step 1: Write the failing tests.** The builder `game(id, start, minutes, players)`: five
  seats (`LIBERAL`×3, `FASCIST`, `HITLER`) held by `players` (`null` a CPU seat), `startedAt =
  Date.parse(start)`, `endedAt` `minutes` later, a Liberal win, no events. The shared set:

```ts
const NOVEMBER = [
  game("g1", "2026-11-02T19:00:00Z", 40, [1, 2, 3, 4, 5]),
  game("g2", "2026-11-02T20:00:00Z", 40, [1, 2, 3, 4, 5]),
  game("g3", "2026-11-02T22:30:00Z", 30, [1, 2, 3, 4, 6]),
  game("g4", "2026-11-07T18:00:00Z", 45, [1, 2, 3, 5, 6]),
  game("g5", "2026-11-14T21:00:00Z", 60, [2, 3, 4, 5, 6]),
  game("g6", "2026-11-14T23:30:00Z", 60, [1, 2, 3, 4, 5]), // ends 00:30 on Sunday
];
const NOW = Date.parse("2026-11-20T12:00:00Z");

it("theHourAndTheDayFollowTheGivenZone", () => {
  const t = Date.parse("2026-11-13T23:30:00Z");
  const at = (zone: string) => [localDayKey(t, zone), localHour(t, zone)];
  expect([at("UTC"), at("Pacific/Auckland"), at("America/Los_Angeles")])
    .toEqual([["2026-11-13", 23], ["2026-11-14", 12], ["2026-11-13", 15]]);
  expect([weekdayOf("2026-11-13"), weekdayOf("2026-11-14")]).toEqual([4, 5]);
});
it("keysAndLabels", () => {
  expect([weekKey("2026-11-14"), monthKey("2026-11-14")]).toEqual(["2026-11-09", "2026-11"]);
  expect(dayLabel("2026-11-14")).toEqual({ key: "2026-11-14", label: "14 Nov", long: "Sat 14 Nov 2026" });
  expect(weekLabel("2026-11-09")).toEqual({ key: "2026-11-09", label: "9 Nov", long: "Week of 9 Nov 2026" });
  expect(monthLabel("2026-11")).toEqual({ key: "2026-11", label: "Nov 2026", long: "November 2026" });
});
it("countsPlayersWeeksMonthsWeekdaysAndHours", () => {
  const a = computeActivity(NOVEMBER, NOW, "UTC");
  expect(a.byPlayer.get(2)).toEqual({ games: 6, share: 1, lastEndedAt: Date.parse("2026-11-15T00:30:00Z") });
  expect(a.byPlayer.get(6)).toMatchObject({ games: 3, share: 0.5 });
  expect(a.periods.week.map((p) => [p.key, p.games, p.cumulative])).toEqual([["2026-11-02", 4, 4], ["2026-11-09", 2, 6]]);
  expect(Object.fromEntries(a.periods.week[0].byPlayer)).toEqual({ 1: 4, 2: 4, 3: 4, 4: 3, 5: 3, 6: 2 });
  expect(Object.fromEntries(a.periods.week[1].byPlayer)).toEqual({ 1: 1, 2: 2, 3: 2, 4: 2, 5: 2, 6: 1 });
  expect(a.periods.month.map((p) => [p.key, p.games, p.cumulative])).toEqual([["2026-11", 6, 6]]);
  expect(a.byWeekday).toEqual([3, 0, 0, 0, 0, 3, 0]);
  expect(a.byHour.flatMap((n, h) => (n ? [h] : []))).toEqual([18, 19, 20, 21, 22, 23]);
});
```

  And, with exact values:
  - `theViewersZoneMovesDaysAndHours`: `NOVEMBER` in `Pacific/Auckland` gives `byWeekday` `[0, 3,
    0, 0, 0, 0, 3]` and hours 7 to 12, one game each.
  - `aWeekRunsMondayToSundayAcrossANewYear`: `weekKey("2025-12-31")` and `weekKey("2026-01-04")`
    are `"2025-12-29"`; `weekKey("2026-01-05")` is `"2026-01-05"`.
  - `calendarArithmetic`: `addDays("2026-11-14", -364)` `"2025-11-15"`; `addDays("2026-03-07", 2)`
    `"2026-03-09"`; `countLabel(1, ["loss", "losses"])` `"1 loss"`, `countLabel(0, ["game",
    "games"])` `"0 games"`.
  - `aDaylightSavingChangeMovesNoHourOrDay` (Review Focus 2): in `America/New_York`, games from
    `2026-03-08T06:30:00Z` and `07:30:00Z` (clocks go forward at 07:00Z) give `byHour[1]` and
    `byHour[3]` `1`, `byWeekday[6]` `2`, and week keys `["2026-03-02"]`.
  - `emptyPeriodsAreZeroBars`: games on `2026-10-21` and `2026-11-12` (20:00Z) give weeks
    `2026-10-19`, `10-26`, `11-02`, `11-09` with games `[1, 0, 0, 1]`; games on `2025-12-15` and
    `2026-02-10` give months `2025-12`, `2026-01`, `2026-02`, games `[1, 0, 1]`, cumulative `[1, 1, 2]`.
  - `weeksStopAtFiftyTwo` (Review Focus 4): games on `2025-01-06` and `2026-11-09` give 52 weeks,
    the first `{ key: "2025-11-17", games: 0, cumulative: 1 }`, the last `{ key: "2026-11-09",
    cumulative: 2 }`, and 23 months.
  - `cpuSeatsAreNoPlayer`: a game held by `[1, 2, null, null, null]` gives `byPlayer` keys `[1, 2]`
    and the same in its week's `byPlayer`.
- [ ] **Step 2: Run** `cd frontend && npm test -- --run src/stats/activity.test.ts`. Expected:
  FAIL, `./activity` cannot be resolved.
- [ ] **Step 3: Implement** as in Interfaces. `localHour` keeps one `Intl.DateTimeFormat("en-US",
  { timeZone, hourCycle: "h23", hour: "numeric" })` per zone in a `Map`; the key functions work on
  `Date.UTC` of the key (`weekdayOf` is `(getUTCDay() + 6) % 7`), so only `localDayKey` and
  `localHour` touch the zone. Each game's start is read once per call.
- [ ] **Step 4: Run it again.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): count games over time in the viewer's time zone`,
  ticking box 1 and setting the Progress row to `in progress`.

---

### Task 2: The heatmap, sessions, busiest times and gaps

**Files:**
- Modify: `frontend/src/stats/activity.ts`, `frontend/src/stats/activity.test.ts`

**Interfaces:**
- Consumes: Task 1; `sessions(games)`, `localDaysBetween`; `parseStatsData`, `countedGames`, the
  contract fixture (tests).
- Produces, added to `activity.ts` (Phase 21B uses `SessionSummary` and `sessionSummaries`):
  ```ts
  export const LAST_12_MONTHS = "last-12-months";
  export interface Counted extends Label { games: number }
  export interface SessionSummary { games: number; startedAt: number; endedAt: number; day: string } // day: long label of its first start
  export interface Gap { days: number; from: string; to: string }   // long day labels
  export interface HeatmapDay extends Label { games: number; shade: 0 | 1 | 2 | 3 | 4 }
  export interface Heatmap { id: string; label: string; days: HeatmapDay[]; busiest: number;
    busiestDay: string | null; games: number; activeDays: number }
  // added to ActivityStats:
  heatmaps: Heatmap[];   // LAST_12_MONTHS ("Last 12 months") first, then each year with games ("2026"), newest first
  sessions: { count: number; average: number | null; most: SessionSummary | null };
  busiest: { day: Counted | null; week: Counted | null; month: Counted | null };
  longestGap: Gap | null;        // localDaysBetween(a session's endedAt, the next one's startedAt, timeZone)
  daysSinceLast: number | null;  // max(0, localDaysBetween(the last counted endedAt, now, timeZone))
  export function sessionSummaries(counted: GameRecord[], timeZone: string): SessionSummary[]; // in play order
  ```
  A session's `startedAt` is its earliest start and `endedAt` its latest end. Ties of `most`,
  `busiest` and `longestGap`, and of each heatmap's `busiestDay`, go to the later one.

- [ ] **Step 1: Write the failing tests** (`NOVEMBER`, `NOW` and `game` from Task 1):

```ts
it("sessionsBusiestTimesAndGaps", () => {
  const a = computeActivity(NOVEMBER, NOW, "UTC");
  expect(a.sessions).toEqual({ count: 3, average: 2, most: { games: 3, day: "Mon 2 Nov 2026",
    startedAt: Date.parse("2026-11-02T19:00:00Z"), endedAt: Date.parse("2026-11-02T23:00:00Z") } });
  expect(a.busiest.day).toEqual({ key: "2026-11-02", label: "2 Nov", long: "Mon 2 Nov 2026", games: 3 });
  expect(a.busiest.week).toMatchObject({ key: "2026-11-02", games: 4 });
  expect(a.busiest.month).toMatchObject({ key: "2026-11", games: 6 });
  expect(a.longestGap).toEqual({ days: 7, from: "Sat 7 Nov 2026", to: "Sat 14 Nov 2026" });
  expect(a.daysSinceLast).toBe(5);
  expect(computeActivity(NOVEMBER, NOW, "America/New_York").daysSinceLast).toBe(6);
});
it("theLast12MonthsEndOnTheLatestStartDay", () => {
  const [last, year] = computeActivity(NOVEMBER, NOW, "UTC").heatmaps;
  expect(last).toMatchObject({ id: LAST_12_MONTHS, label: "Last 12 months", busiest: 3,
    busiestDay: "Mon 2 Nov 2026", games: 6, activeDays: 3 });
  expect([last.days.length, last.days[0].key, last.days[364].key]).toEqual([365, "2025-11-15", "2026-11-14"]);
  const shade = (k: string) => last.days.find((d) => d.key === k)!.shade;
  expect(["2026-11-02", "2026-11-14", "2026-11-07", "2026-11-08"].map(shade)).toEqual([4, 3, 2, 0]);
  expect(year).toMatchObject({ id: "2026", label: "2026" });
  expect([year.days.length, year.days[0].key, year.days[364].key]).toEqual([365, "2026-01-01", "2026-12-31"]);
});
it("noGames", () => {
  expect(computeActivity([], NOW, "UTC")).toEqual({ byPlayer: new Map(), periods: { week: [], month: [] },
    heatmaps: [], byWeekday: [0, 0, 0, 0, 0, 0, 0], byHour: Array(24).fill(0),
    sessions: { count: 0, average: null, most: null }, busiest: { day: null, week: null, month: null },
    longestGap: null, daysSinceLast: null });
});
it("onTheContractFixture", () => {
  const counted = countedGames(parseStatsData(fixture).games, { players: null, cpu: true });
  const a = computeActivity(counted, NOW, "UTC");
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const months = a.periods.month;
  expect([sum(a.byWeekday), sum(a.byHour), sum(months.map((p) => p.games))]).toEqual(Array(3).fill(counted.length));
  expect(months[months.length - 1].cumulative).toBe(counted.length);
  expect(sum(a.heatmaps.slice(1).map((h) => h.games))).toBe(counted.length);
  expect(a.sessions.average! * a.sessions.count).toBeCloseTo(counted.length);
});
```

  And, with exact values:
  - `aGameCountsOnTheDayItStarted` (Review Focus 1): in `NOVEMBER`'s last-12-months view,
    `2026-11-14` has 2 games and there is no `2026-11-15` (g6 started on the 14th).
  - `tiesGoToTheLaterOne`: 30-minute games at 19:00 and 20:00 on 2 and 4 Nov 2026 and one at 19:00
    on 6 Nov give `busiest.day.key` `"2026-11-04"`, `sessions.most.day` `"Wed 4 Nov 2026"` and
    `longestGap` `{ days: 2, from: "Wed 4 Nov 2026", to: "Fri 6 Nov 2026" }`.
  - `aClockBehindTheLastGameGivesZeroDays` (Review Focus 3): `NOVEMBER` with `now` at
    `2026-11-14T12:00:00Z` gives `daysSinceLast` `0`.
  - `shadesAreQuartersOfTheBusiestDay`: 8, 1, 2, 4 and 6 ten-minute games on 1 to 5 June 2026
    (starting hourly from 00:00Z) give the 2026 view's shades for 1 to 6 June `[4, 1, 1, 2, 3, 0]`.
  - `eachYearWithGamesHasItsOwnView`: games on `2024-02-29` and `2026-01-10` give view ids
    `[LAST_12_MONTHS, "2026", "2024"]`, 366 days in 2024's, and the last 12 months starting
    `"2025-01-11"`.
  - `theNewYearFollowsTheZone`: one game at `2026-01-01T04:30:00Z` gives `[LAST_12_MONTHS,
    "2026"]` in `UTC` and `[LAST_12_MONTHS, "2025"]` in `America/New_York`.
- [ ] **Step 2: Run** `npm test -- --run src/stats/activity.test.ts`. Expected: the new tests
  FAIL.
- [ ] **Step 3: Implement** as in Interfaces: one pass over the counted games builds a count per day
  key; each heatmap walks its range with `addDays`; `sessionSummaries` maps `sessions(counted)`.
- [ ] **Step 4: Run it again.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the heatmap, sessions and gaps to activity`, ticking
  box 2.

---

### Task 3: Decision times

**Files:**
- Create: `frontend/src/stats/timing.ts`, `frontend/src/stats/timing.test.ts`

**Interfaces:**
- Consumes: `rounds(record)` (Phase 16 works out every span: nominate from the previous term's end,
  the game's start or a `restored`; a vote from the `nominate`; the chancellor from the `discard`
  and, as `chancellorAfterVeto`, from a refused `vetoAnswer`; a power from the round's chancellor
  `enact`; END TERM from the round's last action; null for a CPU decider or across a `restored`);
  `formatDecisionTime` (both from `../rounds`); `rate`, `Rate`, `MIN_CHANCES`, `compareNames`,
  `countedGames`, `DEFAULT_FILTER`; Phase 16's `ev.<type>(r, t, …)` from `game/sampleGames.ts`
  (tests).
- Produces in `timing.ts` (Phase 22 uses `fastestVoter` for Speed Demon and `formatAverageTime`
  for its Timing card):
  ```ts
  export type Decision = "nominate" | "vote" | "discard" | "chancellor" | "power" | "endTerm";
  export const DECISIONS: Decision[] = ["nominate", "vote", "discard", "chancellor", "power", "endTerm"];
  export const MIN_TIMED_VOTES = 30, FASTEST_VOTER_MIN_GAMES = 8;
  export interface Mean { count: number; ms: number | null }     // ms: the average, null when count is 0
  export interface PlayerTiming {
    games: number;                      // counted games with a human seat of theirs
    decisions: Record<Decision, Mean>;  // chancellor: ms.chancellor and ms.chancellorAfterVeto; endTerm: terms the president ended
    asPresident: Mean;                  // their nominate, discard, power and endTerm samples pooled
    termsEnded: number;                 // terms ended (either way) while they were president
    countdownEnded: number;             // of those, by the countdown
    pauses: number;                     // Round.pauses of their terms
    drops: number;                      // their seat's entries in Round.disconnects
  }
  export interface TimingStats {
    byPlayer: Map<number, PlayerTiming>;
    slowestPresident: number[];  // highest asPresident ms among count ≥ MIN_CHANCES; ties all
    countdown: Rate;             // rate(Σ countdownEnded, Σ termsEnded)
    pauses: number;
    drops: number;
  }
  export function computeTiming(counted: GameRecord[]): TimingStats;
  // The one rule for the fastest voter and Speed Demon: of the players with decisions.vote.count ≥
  // MIN_TIMED_VOTES and games ≥ FASTEST_VOTER_MIN_GAMES, the lowest vote ms; ties to more timed
  // votes, then compareNames; one holder or null.
  export function fastestVoter(timing: TimingStats, names: Map<number, string>): number | null;
  export function formatAverageTime(ms: number): string;  // "4.2 s" under 60 s, else formatDecisionTime(ms)
  ```
  A sample belongs to the seat that decided (president, voter, chancellor, the power's seat) and
  counts only when that seat's `player` is not null and the time is not null. A round with a CPU
  president adds nothing to `termsEnded`.

- [ ] **Step 1: Write the failing tests.** Builders in the test file, each event made with `ev`:
  `term(r, at, president, chancellor, d, by = "president")` returns `{ events, end }` for one term
  starting at `at`: `nominate` at `at + d.nominate`; seat `i` votes Ja `d.votes[i]` after it; the
  passed `election` and the president's `draw` at the last vote; `discard` `d.discard` later; the
  chancellor's `enact` (`L`) `d.chancellor` later; `endTerm` by `by` `d.endTerm` later; every event
  with `r`. `timed(id, players, events)` makes a five-seat record (`cpu` where the player is
  `null`) with those events and an `end`. `T1(id, { players = [1, 2, 3, 4, 5], restoredAt }?)` is
  two terms with `votes: [1000, 2000, 3000, 4000, 5000]`: term 1 at 0, president seat 0,
  chancellor 1, `{ nominate: 4000, discard: 3000, chancellor: 2000, endTerm: 6000 }`; term 2 at
  20000, president 1, chancellor 2, `{ nominate: 8000, discard: 5000, chancellor: 4000, endTerm:
  15000 }` by `countdown`, with `timerPause` (seat 1) at 45000, `disconnect` (seat 3) at 46000 and
  `timerResume` (seat 1) at 50000 before its `endTerm`; `restoredAt` adds `{ type: "restored", t,
  r: 1 }` in time order. `votingGame(id, terms, { votes = [1000, 2000, 3000, 4000, 5000], players
  = [1, 2, 3, 4, 5] }?)` is `terms` terms in a row from the start, term `k` with president seat
  `k % 5`, chancellor `(k + 1) % 5`, those votes and T1's term-1 times. `peekGame(id)` is term 1
  alone with a Fascist `enact` (`liberal: 0, fascist: 3`), a `peek` by seat 0 at 21000 and its
  `endTerm` at 24000. `vetoGame(id)` is term 1 alone with, after the discard at 12000, a `veto` by
  seat 1 at 13000, a refused `vetoAnswer` by seat 0 at 15000, the `enact` at 18000 and its
  `endTerm` at 24000. `NAMES` maps 1 to 6 to `Bo`, `Ann`, `Cy`, `Di`, `Ed`, `Flo`; `copies(n, f)`
  makes `f("c1")` to `f("c<n>")`.

```ts
const mean = (count: number, ms: number | null) => ({ count, ms });
it("averagesEachDecisionByWhoMadeIt", () => {
  const t = computeTiming([T1("t1")]);
  expect(t.byPlayer.get(1)).toEqual({ games: 1, termsEnded: 1, countdownEnded: 0, pauses: 0, drops: 0,
    asPresident: mean(3, 13000 / 3),
    decisions: { nominate: mean(1, 4000), vote: mean(2, 1000), discard: mean(1, 3000),
      chancellor: mean(0, null), power: mean(0, null), endTerm: mean(1, 6000) } });
  expect(t.byPlayer.get(2)).toMatchObject({ termsEnded: 1, countdownEnded: 1, pauses: 1,
    asPresident: mean(2, 6500), decisions: { nominate: mean(1, 8000), chancellor: mean(1, 2000),
      discard: mean(1, 5000), endTerm: mean(0, null), vote: mean(2, 2000) } });
  expect(t.byPlayer.get(3)!.decisions.chancellor).toEqual(mean(1, 4000));
  expect(t.byPlayer.get(4)).toMatchObject({ drops: 1, decisions: { vote: mean(2, 4000) } });
  expect(t.countdown).toEqual(rate(1, 2));
  expect([t.pauses, t.drops, t.slowestPresident, fastestVoter(t, NAMES)]).toEqual([1, 1, [], null]);
});
it("theFastestVoterNeedsThirtyVotesAndEightGames", () => { // Review Focus 5
  expect(fastestVoter(computeTiming(copies(8, (id) => votingGame(id, 4))), NAMES)).toBe(1);   // 32 votes, 8 games
  expect(fastestVoter(computeTiming(copies(8, (id) => votingGame(id, 3))), NAMES)).toBeNull(); // 24 votes
  expect(fastestVoter(computeTiming(copies(7, (id) => votingGame(id, 5))), NAMES)).toBeNull(); // 35 votes, 7 games
});
```

  And, with exact values:
  - `aFastestVoterTieGoesToMoreVotesThenTheName`: 8 copies of `votingGame(id, 4, { votes: [1000,
    1000, 3000, 4000, 5000] })` give `2` (`Ann` before `Bo`, both 32 votes at 1000); adding
    `votingGame("x", 1, { votes: [1000, 3000, 3000, 4000, 5000], players: [1, 6, 3, 4, 5] })`
    gives `1` (33 votes against 32).
  - `theSlowestPresidentNeedsFiveChoices`: three copies of `T1` give `slowestPresident` `[2]` (6
    samples at 6500 against player 1's 9 at 4333).
  - `bothChancellorChoicesAroundARefusedVetoCount`: `vetoGame` gives player 2 `chancellor`
    `mean(2, 2000)` (1000 to the veto, 3000 after the refusal) and player 1 `endTerm`
    `mean(1, 6000)`.
  - `powerTimeRunsFromTheEnactThatGaveIt`: `peekGame` gives player 1 `power` `mean(1, 7000)` and
    `endTerm` `mean(1, 3000)` (from the peek, the term's last action).
  - `aSpanAcrossARestoreIsLeftOut`: `T1` with `restoredAt: 7500` gives vote counts `[2, 2, 2, 1, 1]`
    for players 1 to 5.
  - `cpuDecisionsAndCpuPresidentsAreLeftOut`: `T1` with `players: [null, 2, 3, 4, 5]` has no
    player 1, and `countdown` is `rate(1, 1)`.
  - `formatsAverages`: `formatAverageTime(4240)` `"4.2 s"`, `(950)` `"1.0 s"`, `(65000)` equals
    `formatDecisionTime(65000)`.
  - `noGames`: `computeTiming([])` equals `{ byPlayer: new Map(), slowestPresident: [], countdown:
    rate(0, 0), pauses: 0, drops: 0 }`.
  - `onTheContractFixture`: on `countedGames(games, DEFAULT_FILTER)` of the fixture, the players'
    vote counts sum to the number of non-null `Vote.ms` over `counted.flatMap(rounds)`, and every
    `ms` is null or finite and at least 0.
- [ ] **Step 2: Run** `npm test -- --run src/stats/timing.test.ts`. Expected: FAIL, `./timing`
  cannot be resolved.
- [ ] **Step 3: Implement** as in Interfaces (a sum and a count per player and decision, divided at
  the end).
- [ ] **Step 4: Run it again.** Expected: PASS. A span that disagrees (not a sum) means `rounds`
  and this plan read the spec differently: report it to the manager rather than work around it.
- [ ] **Step 5: Commit** `feat(frontend): add decision times and the countdown's share`, ticking
  box 3.

---

### Task 4: The bar chart

**Files:**
- Create: `frontend/src/stats/charts/BarChart.tsx`, `BarChart.test.tsx` (and `BarChart.css` only
  for what `charts.css` does not cover)

**Interfaces:**
- Consumes: `useChartWidth`, `charts.css` (axis text, `.chart-tooltip`); `countLabel` (Task 1).
- Produces in `charts/BarChart.tsx`:
  ```ts
  export interface Bar { label: string; long?: string; value: number }
  export interface BarChartProps { bars: Bar[]; label: string; unit: [string, string]; color?: string } // color default "#f08a5d"
  export function BarChart(props: BarChartProps): JSX.Element;
  ```
- Geometry: root `div.bar-chart` (`position: relative`, `min-width: 0`), `W = useChartWidth(ref,
  320)`; `svg` width `W`, height `H = round(min(220, max(120, 0.4·W)))`; plot from `x = 32` (the
  y labels 0 and the maximum) to `W`, and from `y = 8` to `H − 20` (the x labels). `slot = (W −
  32) / n`; `rect.bar` at `x = 32 + i·slot + 0.1·slot`, width `0.8·slot`, height `value / max(1,
  maxValue) · (H − 28)`. `text.x-label` under every `step`-th bar, `step = max(1, ceil(n ·
  (7·longestLabel.length + 8) / (W − 32)))`.
- Behaviour: the `svg` has `role="img"`, `aria-label={label}`, `tabIndex={0}`, and
  `aria-describedby` a visually hidden `p` reading `bars.map((b) => `${b.long ?? b.label}
  ${b.value}`).join(", ")`. The active bar (from `clientX` on `pointermove` and `pointerdown`; none
  after `pointerleave` for a mouse; `ArrowRight`/`ArrowLeft` step, from none the first or the
  last, `Home`/`End` jump) is drawn brighter, and `.chart-tooltip` shows `${long ?? label}:
  ${countLabel(value, unit)}` at `left` = its centre's share of `W` in percent with
  `translateX(-<same>%)`.

- [ ] **Step 1: Write the failing tests** (`widthIs(W)` stubs `Element.prototype.getBoundingClientRect`
  to `{ left: 0, top: 0, width: W, … }`):

```ts
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => ({ label, value: i + 1 }));
const draw = (bars = WEEK) => render(<BarChart bars={bars} label="Games by day of the week" unit={["game", "games"]} />);
const tip = () => document.querySelector(".chart-tooltip")?.textContent ?? "";
it("sizesItselfFromItsBox", () => {
  widthIs(500);
  const { container } = draw();
  const svg = container.querySelector("svg")!;
  expect([svg.getAttribute("width"), svg.getAttribute("height")]).toEqual(["500", "200"]);
  const rects = [...container.querySelectorAll("rect.bar")].map((r) => ["x", "width", "height"].map((a) => Number(r.getAttribute(a))));
  expect(rects).toHaveLength(7);
  expect(rects[6][2]).toBeCloseTo(172);
  expect(rects[3][2]).toBeCloseTo(98.29, 1);
  expect(rects[0][0]).toBeCloseTo(38.69, 1);
  expect(rects[0][1]).toBeCloseTo(53.49, 1);
});
it("showsTheValueUnderThePointerOrATap", () => {
  widthIs(500);
  draw();
  const svg = screen.getByRole("img", { name: "Games by day of the week" });
  expect(svg).toHaveAccessibleDescription("Mon 1, Tue 2, Wed 3, Thu 4, Fri 5, Sat 6, Sun 7");
  fireEvent.pointerMove(svg, { clientX: 266, clientY: 100, pointerType: "mouse" });
  expect(tip()).toBe("Thu: 4 games");
  fireEvent.pointerLeave(svg, { pointerType: "mouse" });
  expect(tip()).toBe("");
  fireEvent.pointerDown(svg, { clientX: 40, clientY: 100, pointerType: "touch" });
  fireEvent.pointerLeave(svg, { pointerType: "touch" });
  expect(tip()).toBe("Mon: 1 game");
});
```

  And, with exact values:
  - `arrowKeysStepThroughTheBars`: `ArrowRight` twice gives `"Tue: 2 games"`; `End` `"Sun: 7 games"`.
  - `labelsThinOutToFit`: 24 bars `"00"` to `"23"` at width 300 give x labels `"00"`, `"02"`, …,
    `"22"` (12).
  - `manyBarsStayInTheBox` (Review Focus 4): 500 bars at width 200: every `rect.bar` has `x ≥ 32`
    and `x + width ≤ 200`.
  - `theTooltipUsesTheLongLabel`: one bar `{ label: "21", long: "21:00 to 22:00", value: 5 }` and
    `ArrowRight` give `"21:00 to 22:00: 5 games"`.
  - `fallsBackWithoutAWidth`: width 0 draws the `svg` 320 wide.
- [ ] **Step 2: Run** `npm test -- --run src/stats/charts/BarChart.test.tsx`. Expected: FAIL,
  `./BarChart` cannot be resolved.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run it again.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the bar chart`, ticking box 4.

---

### Task 5: The calendar heatmap

**Files:**
- Create: `frontend/src/stats/charts/CalendarHeatmap.tsx`, `CalendarHeatmap.test.tsx` (and
  `CalendarHeatmap.css` if needed)

**Interfaces:**
- Consumes: `Heatmap`, `countLabel`, `computeActivity` (tests); `useChartWidth`, `charts.css`.
- Produces:
  ```ts
  export const HEAT_COLORS = ["#4d4945", "#6e4a39", "#94573d", "#c26b45", "#f08a5d"]; // by shade 0–4
  export function CalendarHeatmap(props: { heatmap: Heatmap; label: string }): JSX.Element;
  ```
- Geometry: root `div.calendar-heatmap`. Columns are weeks, from the Monday on or before the first
  day to the week of the last; rows Monday to Sunday. `pitch = min(16, (W − 28) / columns)`; `svg`
  width `28 + columns·pitch`, height `16 + 7·pitch`; one `rect.day` (`data-day`, `data-shade`) of
  side `0.85·pitch` per day in range, filled `HEAT_COLORS[shade]`. Month names (`Jan`…) above the
  column holding each month's first day, skipped within 24px of the last one drawn; `Mon`, `Wed`,
  `Fri` in the left gutter when `pitch ≥ 7`.
- Behaviour: `role="img"`, `aria-label={`${label}, ${heatmap.label}`}`, `tabIndex={0}`, and a
  description `${countLabel(games, G)} on ${countLabel(activeDays, ["day", "days"])}; busiest
  ${busiestDay} with ${countLabel(busiest, G)}.` (`No games.` when none; `G = ["game", "games"]`).
  The tooltip shows `${long}: ${games ? countLabel(games, G) : "no games"}` for the day under the
  pointer or a tap (none outside the range). With no day active the first arrow key picks the
  range's last day; then `ArrowUp`/`ArrowDown` move a day and `ArrowLeft`/`ArrowRight` a week,
  clamped.

- [ ] **Step 1: Write the failing tests.** `Y2026` is the `"2026"` view of `computeActivity` on two
  games on 1 Jan 2026 and one on 2 Mar 2026 (noon UTC, zone `UTC`); `widthIs` and `tip` as in Task 4.

```ts
const draw = () => render(<CalendarHeatmap heatmap={Y2026} label="Games per day" />);
it("sizesItselfFromItsBox", () => {
  widthIs(500);
  const { container } = draw();
  const svg = container.querySelector("svg")!;
  expect(Number(svg.getAttribute("width"))).toBeCloseTo(500);
  expect(Number(svg.getAttribute("height"))).toBeCloseTo(78.34, 1);   // 53 weeks at 472/53
  expect(container.querySelectorAll("rect.day")).toHaveLength(365);
  const fill = (k: string) => container.querySelector(`rect[data-day="${k}"]`)!.getAttribute("fill");
  expect(["2026-01-01", "2026-03-02", "2026-01-02"].map(fill)).toEqual([HEAT_COLORS[4], HEAT_COLORS[2], HEAT_COLORS[0]]);
  expect(screen.getByRole("img", { name: "Games per day, 2026" }))
    .toHaveAccessibleDescription("3 games on 2 days; busiest Thu 1 Jan 2026 with 2 games.");
});
it("showsTheDayUnderThePointer", () => {
  widthIs(500);
  draw();
  const pitch = 472 / 53, svg = screen.getByRole("img");
  fireEvent.pointerMove(svg, { clientX: 28 + 0.5 * pitch, clientY: 16 + 3.5 * pitch, pointerType: "mouse" });
  expect(tip()).toBe("Thu 1 Jan 2026: 2 games");
  fireEvent.pointerMove(svg, { clientX: 28 + 0.5 * pitch, clientY: 16 + 0.5 * pitch, pointerType: "mouse" }); // 29 Dec 2025
  expect(tip()).toBe("");
});
```

  And, with exact values:
  - `wideCardsCapTheCell`: width 1200 draws the `svg` 876 by 128.
  - `arrowKeysMoveByDayAndWeek`: three presses in a row on one chart: `ArrowUp` picks the last day
    (`"Thu 31 Dec 2026: no games"`), then `ArrowUp` (to 30 Dec) and `ArrowLeft` (a week back) end
    on `"Wed 23 Dec 2026: no games"`.
- [ ] **Step 2: Run** `npm test -- --run src/stats/charts/CalendarHeatmap.test.tsx`. Expected:
  FAIL, `./CalendarHeatmap` cannot be resolved.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run it again.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the calendar heatmap`, ticking box 5.

---

### Task 6: The ACTIVITY tab

**Files:**
- Modify: `frontend/src/stats/tabs/ActivityTab.tsx` (Phase 17A's placeholder; keep its named
  export)
- Create: `frontend/src/stats/tabs/ActivityTab.css`, `frontend/src/stats/tabs/ActivityTab.test.tsx`

**Interfaces:**
- Consumes: `StatsContext`; Tasks 1 to 5; `StatCard`, `NO_GAMES`, `RankedTable`, `ScrollRegion`,
  `rankRows`, `rate`, `MIN_CHANCES`, `compareNames`, `formatPercent`, `PlayerName`,
  `StackedBarChart`, `SERIES_COLORS`, `viewerTimeZone`.
- Produces: `ActivityTab(props: { stats: StatsContext; now?: number; timeZone?: string })`:
  `const [mountedAt] = useState(Date.now)`, `now = props.now ?? mountedAt`, `zone = props.timeZone
  ?? viewerTimeZone()`; `computeActivity` memoized on `[stats.counted, now, zone]`, `computeTiming`
  on `[stats.counted]`. Root `div.activity-tab`, a grid of `repeat(auto-fill, minmax(min(100%,
  300px), 1fr))`. Each `StatCard` sits in its own `div.activity-cell` with `min-width: 0` and
  `data-card` set to its slug; the section headings (`h2.activity-heading`, Germania One) and the
  wide cells (`.activity-wide`) span every column. Choice buttons (`button.activity-choice`,
  `aria-pressed`, at least 44x44px, the active one `var(--headerFill)`) are built in this file.
  Every card is `empty` when `stats.counted` is empty; a card with games but nothing to show passes
  its own `empty` line.
- The cards, in order: section — *title* (`slug`, wide or not): "definition"; content.
  - **Games** — *Games over time* (`games-over-time`, wide): "Counted games started each week (the
    last 52) or each month." `PER WEEK` / `PER MONTH` (week first), then a `BarChart` labelled
    `Games per week` / `Games per month`, bars `{ label, long, value: games }`. *Cumulative games*
    (`cumulative-games`, wide): "All counted games so far, at the end of each week or month."
    `BarChart` `Cumulative games per week` / `… month`. *Attendance* (`attendance`, wide): "Each
    player's counted games each week." (or `each month.`); `StackedBarChart` labelled `Attendance
    per week` / `… month`, parts keyed by player number, `colors` from `SERIES_COLORS` by the
    player's index in `stats.data.players` (cycling), `legend` their names. *Participation*
    (`participation`): "A player's share of all counted games." `RankedTable` of `share`
    (`formatPercent`), count `games`, minimum 1.
  - **When** — *Calendar* (`calendar`, wide): "Counted games started each day, darker on busier
    days." A choice per heatmap (`LAST 12 MONTHS`, `2026`, …; the first chosen), then
    `CalendarHeatmap` labelled `Games per day`. *Day of the week* (`day-of-week`): "When counted
    games started, Monday first." `BarChart` `Games by day of the week` (`Mon`…, long `Monday`…).
    *Hour of the day* (`hour-of-day`, wide): "The hour each counted game started." `BarChart`
    `Games by hour of the day` (`00`…`23`, long `21:00 to 22:00`). *Busiest times*
    (`busiest-times`): `Busiest day: Mon 2 Nov 2026 · 3 games`, `Busiest week: Week of 2 Nov 2026 ·
    4 games`, `Busiest month: November 2026 · 6 games`.
  - **Sessions and gaps** — *Sessions* (`sessions`): "A run of games, each starting less than 3
    hours after the last ended." `3 sessions · 2.0 games per session` and `Most in one: 3 games,
    Mon 2 Nov 2026`. *Gaps* (`gaps`): `Longest gap between sessions: 7 days, Sat 7 Nov 2026 to Sat
    14 Nov 2026` (or `Only one session so far.`) and `Days since the last game: 5`.
  - **Timing** — *Decision times* (`decision-times`, wide): "Each player's average time to
    decide." A table in a `ScrollRegion`: rows the players with a sample, by `compareNames`, at
    least 44px tall where the stacked query matches; columns Nominate, Vote, Discard, Chancellor,
    Power, End term; a cell is `formatAverageTime(ms)`, or `—` under `MIN_CHANCES` samples, with the
    count in its `title`. *Fastest voter* (`fastest-voter`): "The lowest average time to vote, of
    players with 30 or more timed votes and 8 or more counted games." `fastestVoter(timing,
    stats.names)`'s name (`link={false}`) and time, or `empty="No one has 30 timed votes over 8
    games yet."` *Slowest president* (`slowest-president`): "The highest average time over a
    president's choices: nominating, discarding, powers and ending the term, over at least 5." the
    names (`link={false}`) and the time, or `empty="No president has 5 timed choices yet."` *The END
    TERM countdown* (`countdown`): "How often the countdown, not the president, ended a term."
    `Ended by the countdown: 50% (1 of 2 terms)` (`—` under `MIN_CHANCES`), `Pauses: 1`, and a
    `RankedTable` of each president's `rate(countdownEnded, termsEnded)`. *Dropped connections*
    (`dropped-connections`): "Times a player's connection dropped during counted games."
    `RankedTable` of `drops` for players with at least one, count `games`, or `empty="No dropped
    connections in these games."`

- [ ] **Step 1: Write the failing tests.** The context is `{ data, filter: { players: null, cpu:
  false }, counted, elo: replayElo(counted), names }`, players 1 to 6 `Ann`, `Bo`, `Cy`, `Di`,
  `Ed`, `Flo`; `NOVEMBER` rebuilt here; `tab(games)` renders with `now = NOW` and `timeZone =
  "UTC"`; `card(slug)` is the `[data-card="<slug>"]` cell.

```ts
const SLUGS = ["games-over-time", "cumulative-games", "attendance", "participation", "calendar", "day-of-week",
  "hour-of-day", "busiest-times", "sessions", "gaps", "decision-times", "fastest-voter", "slowest-president",
  "countdown", "dropped-connections"];
it("showsEveryCardInOrder", () => {
  tab(NOVEMBER);
  expect([...document.querySelectorAll(".activity-cell")].map((c) => c.getAttribute("data-card"))).toEqual(SLUGS);
  expect(within(card("busiest-times")).getByText("Busiest day: Mon 2 Nov 2026 · 3 games")).toBeInTheDocument();
  expect(within(card("gaps")).getByText("Days since the last game: 5")).toBeInTheDocument();
});
it("theSwitchRedrawsGamesCumulativeAndAttendance", () => {
  tab(NOVEMBER);
  expect(screen.getByRole("button", { name: "PER WEEK" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "PER MONTH" }));
  expect(screen.getByRole("img", { name: "Games per month" })).toHaveAccessibleDescription("November 2026 6");
  expect(screen.getByRole("img", { name: "Cumulative games per month" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Attendance per month" })).toBeInTheDocument();
});
it("noGamesEmptiesEveryCard", () => {
  tab([]);
  for (const slug of SLUGS) expect(within(card(slug)).getByText(NO_GAMES)).toBeInTheDocument();
  expect(document.querySelector(".activity-tab svg")).toBeNull();
});
```

  And: `theCalendarOffersLast12MonthsAndEachYear` (buttons `LAST 12 MONTHS`, pressed, and `2026`;
  after `2026`, the image `Games per day, 2026` described `6 games on 3 days; busiest Mon 2 Nov 2026
  with 3 games.`); `belowTheMinimumShowsADash` (one game: seat 0 nominates seat 1 at 4000, each seat
  votes Ja at 5000 to 9000, the election passes: `fastest-voter` says `No one has 30 timed votes
  over 8 games yet.` and `decision-times` shows `—`).
- [ ] **Step 2: Run** `npm test -- --run src/stats/tabs/ActivityTab.test.tsx`. Expected: FAIL (the
  placeholder says "Coming in a later update.").
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): fill the activity tab`, ticking box 6.

---

### Task 7: ACTIVITY in the browser

**Files:**
- Create: `frontend/e2e/stats-activity.spec.ts` (its name runs it in `desktop`, `firefox`,
  `phone-360` and `phone-412`)

**Interfaces:**
- Consumes from `./stats`: `stubStats`, `bigStatsData`, `statsSizesFor(project, viewport)`,
  `checkStatsPage(page, size)`; from `./layout`: `wrappedLabels`; `settle` (`./lobby`);
  `makeRecord`, `makeSeats` (`../src/stats/testRecords`).
- Produces in the spec only: `open(page, data = bigStatsData())` (`stubStats`,
  `page.clock.setFixedTime` an hour after the data's latest `endedAt`, then `goto("/stats/activity")`,
  `.activity-tab` visible, `settle`); `chartsOutside(page)` (each `.bar-chart` or
  `.calendar-heatmap` whose `svg` reaches outside the chart's box, or whose box reaches outside its
  `[data-card]` cell, as `<slug> [l, r] in [l, r]`, with 0.5px slack). No sideways check of its
  own: `checkStatsPage` is the one.

- [ ] **Step 1: Write the tests:**
  - `"ACTIVITY fits sideways at every stats size, with 44px targets"`: `test.slow()`, then at each
    of `statsSizesFor(project, viewport)`, `checkStatsPage(page, size)`, `chartsOutside` `[]`,
    `wrappedLabels(page, ".activity-tab")` `[]`, and at least 6 chart `svg`s drawn.
  - `"the charts show the value under the pointer or a tap"`: at the project's viewport, on the
    image `Games by day of the week` and on the heatmap's first `rect.day[data-shade="4"]`,
    `tap()` in the phone projects and `hover()` otherwise; the tooltips match
    `/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun): \d+ games?$/` and
    `/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2} \d{4}: \d+ games?$/`.
  - `"PER MONTH redraws games over time, cumulative games and attendance"` (`desktop`): images
    named `Games per month`, `Cumulative games per month` and `Attendance per month` are visible.
  - Two `test.describe`s with `test.use({ timezoneId })` (`desktop`), on one counted five-player
    game from `2026-11-13T23:30:00Z` to `2026-11-14T00:10:00Z`: `Pacific/Auckland` shows `Busiest
    day: Sat 14 Nov 2026 · 1 game`, `America/Los_Angeles` `Busiest day: Fri 13 Nov 2026 · 1 game`.
- [ ] **Step 2: Run** `cd frontend && E2E_PORT=4621 npx playwright test e2e/stats-activity.spec.ts`.
  Expected: PASS in every project; run `firefox`, and the phone projects again for CI's wider
  fonts, through `DEVELOPMENT.md`'s "Browser tests on Linux" when Firefox will not launch on macOS.
  Fix a failure in the task that owns it, test first; at 320x568 the fix is wrapping or the card's
  own scroller, never a sideways page scroll.
- [ ] **Step 3: Commit** `test(frontend): check the activity tab in the browser`, ticking box 7.

---

### Task 8: Docs

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `DEVELOPMENT.md` (only if it has a note on the stats' tests),
  `docs/PLAN.md` (Phase 21A's section)

- [ ] **Step 1: `CLAUDE.md`**, where Layout describes `src/stats/`: `activity.ts` (the calendar on
  top of `localDayKey` and `localHour` with an explicit zone, every bucket by the game's start;
  games over time with `WEEKS_SHOWN`, attendance, participation, the heatmaps, weekday and hour,
  sessions, busiest times, gaps, days since through `localDaysBetween`), `timing.ts`
  (`formatAverageTime`, and `fastestVoter`, the one rule Speed Demon shares),
  `charts/BarChart.tsx` and `charts/CalendarHeatmap.tsx`, the tab and its optional `now`/`timeZone`
  props, and `stats-activity.spec.ts` (`checkStatsPage` at `statsSizesFor`, the tooltips,
  `timezoneId`). Commit `docs(claude): describe the activity tab`.
- [ ] **Step 2: `README.md`**, "What this fork adds", the stats entry: ACTIVITY in a line. Commit
  `docs(readme): add the activity tab`.
- [ ] **Step 3: `DEVELOPMENT.md`**, if it has a note on the stats' tests: Vitest's date tests pass
  an IANA zone to the functions; the browser tests use Playwright's `timezoneId`. Commit
  `docs(development): note how the stats' date tests pin a zone`.
- [ ] **Step 4: Tick box 8** in `docs/PLAN.md` in the last of these commits.

---

### Task 9: Whole-branch review

- [ ] **Step 1: Review** the branch against `origin/development` with the `code-review` skill
  (standards, and the spec: this plan, the spec's ACTIVITY, Counting rules, Charts and
  Constraints, and the interfaces file's settled section).
- [ ] **Step 2: Fix every finding**, Minor ones included, test first where it is behaviour, each as
  its own `fix(frontend): …` or `test(frontend): …` commit; a finding that needs no change gets its
  reason in the review record for the PR body.
- [ ] **Step 3: Run** `cd frontend && npm test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 4: Tick box 9** in `docs/PLAN.md` (`docs(plan): close phase 21a's review`).

---

### Task 10: Screenshots and the pull request

**Files:**
- Create: `docs/pr/phase-21a-activity/` (`before-1600x900.png`, `after-1600x900.png`,
  `before-412x915.png`, `after-412x915.png`)
- Temporary, never committed: `frontend/e2e/pr-shots.spec.ts`

- [ ] **Step 1: Run everything:** `cd backend && ./gradlew test`; `cd frontend && npm test -- --run
  && npm run build`; `E2E_PORT=4621 npm run e2e` (all four projects, Firefox and the phone projects
  also in the Linux image when Firefox will not launch locally). Expected: all pass; keep the
  counts for the PR.
- [ ] **Step 2: Take the screenshots.** `pr-shots.spec.ts`: `stubStats` with `bigStatsData()`, the
  clock an hour after its latest game, a full-page screenshot of `/stats/activity` after `settle`,
  at 1600x900 in `desktop` and 412x915 in `phone-412`, to
  `docs/pr/phase-21a-activity/<PR_SHOTS>-<size>.png` (`PR_SHOTS` is `before` or `after`). Run it
  here with `PR_SHOTS=after E2E_PORT=4621`. For "before", add a worktree of `origin/development`
  nested under this one (`<this worktree>/.claude/worktrees/phase-21a-before`), copy the spec in,
  `npm ci`, run it with `PR_SHOTS=before E2E_PORT=4721` (the "Coming in a later update."
  placeholder), copy the images back and remove the worktree. Delete `pr-shots.spec.ts`; `git
  status` must not list it.
- [ ] **Step 3: Commit** the images, ticking box 10: `docs(docs): add the activity tab's
  screenshots`.
- [ ] **Step 4: Push and open the PR** into `development` with `gh pr create --repo
  jussaw/Secret-Hitler-Online --base development`, titled `feat(frontend): add the activity tab`.
  Near the top, a table of before and after at both sizes, by raw URLs pinned to the screenshots'
  commit; then what changed, the Decisions above, the review record, the test counts, and `Part of
  #31`.
- [ ] **Step 5: Keep it green and current.** Fix CI until every check passes. When Phase 17B, 18,
  19 or 20 merges first: `git fetch origin && git rebase origin/development`; conflicts can only be
  in the docs (`CLAUDE.md`, `README.md`, `DEVELOPMENT.md`, `docs/PLAN.md`): keep both sides; run the
  unit tests and the build again, then `git push --force-with-lease`. The phase is done here: the
  PR is open and CI is green.
- [ ] **Step 6: Merge (the manager session, with the user's standing OK; safe to run again).** If
  `gh pr view <N> --repo jussaw/Secret-Hitler-Online --json state -q .state` says `MERGED`, go
  straight to the image check. Otherwise, unless the last commit already ticks them, tick "PR
  merged into `development`" and the tests' acceptance box and set the Progress row to `done`
  (`docs(plan): tick phase 21a's merged box`), push, wait for green, then `gh pr merge <N> --squash
  --admin --repo jussaw/Secret-Hitler-Online --subject "feat(frontend): add the activity tab (#<N>)"`.
  Last, check that `development`'s CI run, which publishes the image, passes. The user's box stays
  unticked.
