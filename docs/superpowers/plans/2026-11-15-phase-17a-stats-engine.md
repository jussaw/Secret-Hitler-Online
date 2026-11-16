# Phase 17A: Stats engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The stats engine every tab reads (counting rules, the filter and CPU toggle in the
address, Elo with a handicap per player count), the shared cards, tables and charts, and the tab
row with all seven tabs, each a "Coming in a later update." placeholder for now, OVERVIEW included
(issue #31; Phase 17B fills OVERVIEW, Phases 18 to 21 the rest).

**Architecture:** Pure modules in `frontend/src/stats/` (`counting.ts`, `elo.ts`) turn the records
into numbers, with `now` and an optional time zone passed in. `useStats()` reads the records and
the address's filter and memoizes the counted games, Elo and names per records and filter. Phase
15A's placeholder `TabsPage.tsx` becomes the filter bar, the tab row and the route's tab, each tab
a file in `tabs/` registered in `tabs/tabs.ts`. The cards, tables and charts are built and
unit-tested here for the tabs that follow; the charts are hand-written SVG that size themselves
from their card.

**Tech Stack:** React 18.3, TypeScript 5.9 (ES2020), Vite 8, Vitest 5 with Testing Library 16 and
jsdom 30, `@playwright/test` 1.64.1, `lucide-react` 1.63.0 (icons only). No new dependency.

**Spec:** [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](../specs/2026-11-15-game-stats-design.md):
"Counting rules (Phase 17)", "Elo (Phase 17)", "The filter and the CPU toggle", "The tabs",
"Cards", "Charts", "Keeping parallel phases apart", "Constraints" and "Tests"; mockups
[`stats-layout.jpg`](../specs/2026-11-15-game-stats/stats-layout.jpg) (B, tabs) and
[`player-and-phone.jpg`](../specs/2026-11-15-game-stats/player-and-phone.jpg) (right: the phone's
filter line and tabs). Shared names: [`2026-11-15-game-stats-interfaces.md`](2026-11-15-game-stats-interfaces.md),
used exactly; its "Settled after the plans were written" section wins over this plan. Parent plan:
[`docs/PLAN.md`](../../PLAN.md), Phase 17A. Next: [Phase 17B](2026-11-15-phase-17b-overview.md).
Where this plan and the spec differ, the spec wins.

## Decisions (left open by the spec; this plan settles them)

1. **The address.** `players` lists numbers ascending, joined by plain commas (not `%2C`); every
   player on is no `players` parameter; CPU off is no `cpu` parameter, on is `cpu=1`. All chips off
   is `?players=` (an empty selection, which counts nothing). Tokens that are not positive integers
   are dropped; numbers no player has are kept and match no seat. Turning the last chip back on
   drops the parameter.
2. **Ranks** are competition ranks (1, 2, 2, 4). Names compare with `compareNames` (`localeCompare`
   in English, ignoring case). Below the minimum, rows sort by count, then name.
3. **Elo** is kept unrounded and shown rounded. `peak` is the highest rating after any of the
   player's games (the 1500 start does not count).
4. **Time zones.** `localDaysBetween` takes an optional IANA zone (default the viewer's) and works
   through Phase 15A's `localDayKey`, so tests pin a zone.
5. **Touch sizes.** 44px targets in the stacked query, so phones and tall windows (tablets) get
   them, as `SoundControl.css` does; the filter folds and the tab row scrolls in the phone-only
   query.
6. **Numbers:** percentages rounded to whole percent; signed numbers rounded, with U+2212 for
   minus and `0` for anything that rounds to zero.
7. **Tabs are links** in the button look, the current one `aria-current="page"`, so each has its
   own address and opens in a new tab. A filter change goes through `navigate`.

## Global Constraints

- **Copy, exactly.** Tabs: `OVERVIEW`, `ROLES & CARDS`, `VOTES & POWERS`, `RIVALS`, `ENDINGS`,
  `ACTIVITY`, `RECORDS`. Placeholder: `Coming in a later update.` Empty card: `No games yet with
  these players.` Toggle: `Include games with CPU players`. Phone line: `Players: <on> of <all> ·
  CPU off` (or `CPU on`), with U+00B7 between spaces.
- **Constants:** `MIN_GAMES = 5`, `MIN_CHANCES = 5`, `SESSION_GAP_MS = 3 * 60 * 60 * 1000`,
  `ELO_START = 1500`, `ELO_K = 32`, `ELO_SCALE = 400`, `ELO_PRIOR = 5`, `PROVISIONAL_GAMES = 5`.
- **Interfaces:** every name in the interfaces file's "Counting and Elo (17)" section, its Phase 17
  rows and its "Settled after the plans were written" section, spelled and typed as there.
- **Imported from Phase 15A, never redefined:** `record.ts`; `routes.ts` (`routePath`, `navigate`,
  `useLocation`, `TabId`, `PageProps`); `api.ts` (`useStatsData`); `format.ts` (`plural`,
  `localDayKey`, `viewerTimeZone`); `StatsLink`; `PlayerName`; `testRecords.ts` (`makeRecord`);
  `StatsApp.css`'s `.stats-card` and `.stats-card-title`; `e2e/stats.ts` (`stubStats`,
  `bigStatsData`, `statsSizesFor`, `checkStatsPage`).
- **Files:** only this phase's (the table below), `TabsPage.tsx` and its test, and the docs
  (`CLAUDE.md`, `README.md`, `DEVELOPMENT.md` if stale, `docs/PLAN.md`'s Phase 17A section and
  Progress row, the interfaces file only to correct a name, `docs/pr/phase-17a-stats-engine/`).
  Phases 15B and 16 run at the same time: never one of their files.
- **Time:** stat modules take `now`; only components read `Date.now()`.
- **Layout:** no sideways scroll from 320x568 to 1920x1080; wide tables scroll inside their card in
  a `ScrollRegion`. The phone-only query is GameScreen.css's, written out:
  `((max-width: 768px) or (aspect-ratio < 5/4) or (max-height: 500px)) and (not ((min-width: 700px) and (aspect-ratio < 5/4)))`;
  the stacked query is `(max-width: 768px), (aspect-ratio < 5/4), (max-height: 500px)`.
- **Look:** cards are Phase 15A's `.stats-card`; every button and button-styled link keeps
  `App.css`'s look through `--button-face`, `--button-shadow` and `--button-depth`, with no
  transition on size or place (issue #59). `App.css`'s global rules (`p`, `a`, `h2` and `button`
  sizes and margins) reach the stats pages, so each stylesheet here sets its own sizes and margins.
  Colours from `variables.css`: Liberal `--textColorLiberal`, Fascist `--textColorFascist`, the
  office orange `#f08a5d`.
- **Names never overflow:** every grid or flex child on these pages has `min-width: 0`, and names
  rely on `PlayerName`'s `overflow-wrap: anywhere`, so a twelve-character name of wide letters
  wraps inside its column at 320px. In the stacked query, rows of `RankedTable` and `SplitTable`
  are at least 44px tall, so Phase 22's name links are 44px targets.
- **ES2020 only** (`frontend/tsconfig.json`'s target and `lib`, which `npm run build` checks for the
  tests too): no `.at()`, `Object.hasOwn`, `replaceAll`, `findLast` or anything newer.
- **Browser tests import no browser-only module:** no `e2e/` file imports `src/constants` or
  anything that imports it (`api.ts`, `App`). `stats-engine.spec.ts` imports only `./stats`,
  `./lobby`, `./layout` and `../src/stats/testGames`, and `testGames.ts` (with `counting.ts`, which
  it imports) imports only `record.ts`, `format.ts` and `testRecords.ts`.
- **The game's download:** nothing here is imported outside `frontend/src/stats/`; the entry chunk
  stays the size it is on `development`.
- **Linux fonts:** CI draws Germania One 11–17% wider at phone sizes; measure the phone projects
  and Firefox in `mcr.microsoft.com/playwright:v1.64.1-noble` (`DEVELOPMENT.md`, "Browser tests on
  Linux").
- **Environment:** `JAVA_HOME` on any Java 17 for `npm run e2e`; browser tests run on
  `E2E_PORT=4617`, the screenshot runs on `4717`. A lockfile change, if any, uses `npx npm@11`.
- **Branch and commits:** `phase-17a-stats-engine`. Conventional Commits with a scope
  (`frontend`, `plan`, `docs`, `claude`, `readme`, `development`), each test with its code. Task N
  ticks Phase 17A's Nth box in `docs/PLAN.md` in its last commit.
- **Public repo:** nothing about the hosting setup in code, docs, commits or the PR.

## Files

| File (in `frontend/`) | Holds | Task |
|---|---|---|
| `src/stats/counting.ts` | The filter, counted games, rates, ranks, seats, sessions, local days | 1 |
| `src/stats/testGames.ts` | Test builders: `ROLES`, `seatsOf`, `game`, `match`, `generateData` | 1, 3 |
| `src/stats/elo.ts` | The replay, the handicap and the expected score | 2 |
| `src/stats/useStats.ts` | `buildStats`, the cache, `useStats` | 3 |
| `src/stats/numbers.ts` | Number formats | 4 |
| `src/stats/StatCard.tsx`, `RankedTable.tsx` (+ `.css`) | The card and the ranked table | 4 |
| `src/stats/ScrollRegion.tsx`, `SplitTable.tsx` (+ `.css`) | A sideways-scrolling region; a table split by role or side | 5 |
| `src/stats/charts/axis.ts`, `useChartWidth.ts`, `charts.css`, `LineChart.tsx` | Ticks, width, shared chart look, lines | 6 |
| `src/stats/charts/StackedBarChart.tsx` | Stacked bars | 7 |
| `src/stats/FilterBar.tsx` (+ `.css`) | Chips, the CPU switch, the phone line | 8 |
| `src/stats/TabRow.tsx` (+ `.css`), `tabs/tabs.ts`, `tabs/ComingSoon.tsx`, the seven placeholder tabs, `TabsPage.tsx` | The tab row and the tabs | 9 |
| `e2e/stats-engine.spec.ts` | The tab row and the filter in the browser | 10 |

Each `.ts` module has its `.test.ts` beside it, each component its `.test.tsx`.

## Review Focus

1. **A shared link with junk in it** (`?players=abc`, `?players=1,,3`, `?players=99`, `?cpu=yes`,
   `?players=1%2C3`): it parses without throwing, unknown numbers match no seat, and the page
   renders. Task 1 (`dropsWhatIsNotAPlayerNumber`) and Task 8 (`unknownNumbersAreNotCounted`).
2. **Every chip off** (`?players=`): the chips all show off, the line reads `Players: 0 of N`, the
   context has no counted games and an empty Elo, and nothing throws. Task 3
   (`anEmptySelectionBuildsAnEmptyContext`) and Task 8 (`everyChipOff`).
3. **Back and forward after filter changes:** the chips and the switch follow the address, never a
   copy of it in state. Task 8 (`followsTheFilterItIsGiven`) and Task 10 (the filter test's
   `goBack`).
4. **Local-day and zone edges:** a game ending at 23:59 seen at 00:01 is 1 day ago in the zone
   given and not in another; a span across a DST change counts whole days. Task 1
   (`localDaysBetweenInTheZoneGiven`).
5. **The rightmost point and the longest names at 320px:** a hover or tap on a chart's last point,
   ten twelve-character names in a split table and in the open filter panel never push the page
   sideways. Task 6 (`theTooltipStaysInsideAtTheRightEdge`), Task 5 (`scrollsInItsOwnRegion`) and
   Task 10 (the open panel at 320x568).

## Before you start

- [ ] **Start check.** `git fetch origin`; Phase 15A's pull request is merged into `development`,
  and `docs/PLAN.md` on `origin/development` has the section `## Phase 17A: Stats engine`. If
  either is missing, stop and report.
- [ ] From an up-to-date `development`, make the worktree and branch `phase-17a-stats-engine`
  (CLAUDE.md, Workflow). Then `cd frontend && npm ci && npx playwright install chromium firefox`.
- [ ] Read Phase 15A's `record.ts`, `routes.ts`, `api.ts`, `format.ts`, `StatsLink.tsx`,
  `PlayerName.tsx`, `testRecords.ts`, `TabsPage.tsx` and its test, `StatsApp.tsx` with
  `StatsApp.css`, and `e2e/stats.ts`. Note `TabsPage`'s export form, which stays as it is. If a name
  this plan imports is missing or differs from the interfaces file, stop and report it.
- [ ] **"Before" screenshots.** Write `frontend/e2e/pr-shots.spec.ts`, never committed: it starts
  with `test.skip(!process.env.PR_SHOTS)`, calls `stubStats(page, bigStatsData())`, sets 1600x900
  in `desktop` and 412x915 in `phone-412`, opens `/stats`, runs `settle` (`e2e/lobby.ts`) and saves
  a full-page shot to `docs/pr/phase-17a-stats-engine/before-stats-<W>x<H>.png`. Run `PR_SHOTS=1
  E2E_PORT=4717 npx playwright test e2e/pr-shots.spec.ts --project=desktop --project=phone-412`.
  Expected: two shots of Phase 15A's placeholder.

---

### Task 1: Counting rules

**Files:**
- Create: `frontend/src/stats/counting.ts`, `frontend/src/stats/counting.test.ts`,
  `frontend/src/stats/testGames.ts`
- Modify: `docs/PLAN.md` (Progress: Phase 17A `in progress`)

**Interfaces:**
- Consumes: `GameRecord`, `Seat`, `Role`, `Side`, `sideOf` (`record.ts`); `localDayKey`
  (`format.ts`); `makeRecord` (`testRecords.ts`).
- Produces, as the interfaces file: `StatsFilter`, `parseFilter`, `filterSearch`, `countedGames`,
  `MIN_GAMES`, `MIN_CHANCES`, `SESSION_GAP_MS`, `Rate`, `rate(hits, chances, min = MIN_CHANCES)`
  (`value` null when `chances < min` or `chances === 0`), `Row<T>`, `rankRows` (`min` defaults to
  `MIN_GAMES`; `compare(a, b)` negative when `a` ranks above `b`), `humanSeats` (seats with `!cpu`
  and a player), `sessions`; and the settled `DEFAULT_FILTER: StatsFilter` (`{ players: null, cpu:
  false }`, frozen); `seatWon(record: GameRecord, seat: number): boolean` (`sideOf(role) ===
  winner`); `compareNames(a: string, b: string): number` (`a.localeCompare(b, "en", { sensitivity:
  "base" })`); `localDaysBetween(from: number, to: number, timeZone?: string): number` (the two
  `localDayKey`s in the zone, their `Date.UTC` difference over 86 400 000). `counting.ts` does not
  export `seatsOf`.
- Produces, own: `togglePlayer(filter: StatsFilter, player: number, all: number[]): StatsFilter`
  (`players: null` when every number in `all` is on).
- Produces in `testGames.ts` (test builders, which the interfaces file assigns here): `ROLES:
  Record<number, Role[]>` (5: 3 L, F, H; 6: 4 L, F, H; 7: 4 L, 2 F, H; 8: 5 L, 2 F, H; 9: 5 L, 3 F,
  H; 10: 6 L, 3 F, H; Liberals first); `seatsOf(players: (number | null)[], roles?: Role[]): Seat[]`
  (roles default `ROLES[length]`; name `P<n>` or `Bot <i+1>`; `cpu` when null; alive); `game(id:
  string, endedAt: number, seats: Seat[], winner: Side | null, overrides?: Partial<GameRecord>):
  GameRecord` (`startedAt` 30 min before; outcome `LIBERAL_POLICIES`, `FASCIST_POLICIES` or
  `UNFINISHED`; `liberalPolicies` 5 or 2, `fascistPolicies` 6 or 1; `hasCpu` from the seats; one
  `end` event); `match(id: string, endedAt: number, winners: number[], losers: number[], side: Side
  = "LIBERAL"): GameRecord` (winners on `side` as `LIBERAL` or `FASCIST`, losers on the other).

- [ ] **Step 1: Write the failing tests** in `counting.test.ts` (`H = 3_600_000`, `T0` a fixed
  epoch, `ids = (gs) => gs.map((g) => g.id)`):

```ts
it("readsPlayersAndCpu", () => {
  expect(parseFilter("?players=1,3,4&cpu=1")).toEqual({ players: new Set([1, 3, 4]), cpu: true });
});
it("everyPlayerAndNoCpuIsNoParameter", () => {
  expect(parseFilter("")).toEqual(DEFAULT_FILTER);
  expect(filterSearch(DEFAULT_FILTER)).toBe("");
});
it("roundTrips", () => {
  for (const s of ["?players=1,3,4&cpu=1", "?players=2", "?cpu=1", "?players="])
    expect(filterSearch(parseFilter(s))).toBe(s);
  expect(filterSearch({ players: new Set([4, 1, 3]), cpu: true })).toBe("?players=1,3,4&cpu=1");
});
it("dropsWhatIsNotAPlayerNumber", () => { // Review Focus 1
  expect(parseFilter("?players=3,abc,,-2,1.5,0, 7,3").players).toEqual(new Set([3, 7]));
  expect(parseFilter("?players=1%2C3&page=2").players).toEqual(new Set([1, 3]));
  expect(parseFilter("?cpu=yes").cpu).toBe(false);
});
it("togglePlayerGoesBackToEveryone", () => {
  const off = togglePlayer({ players: null, cpu: true }, 2, [1, 2, 3]);
  expect(off).toEqual({ players: new Set([1, 3]), cpu: true });
  expect(togglePlayer(off, 2, [1, 2, 3])).toEqual({ players: null, cpu: true });
});
```

  `countedGames`, with `a = game("a", T0 + 2*H, seatsOf([1,2,3,4,5]), "LIBERAL")`, `u` the same
  unfinished at `T0 + 3*H`, `c = game("c", T0 + H, seatsOf([1,2,3,null,null]), "FASCIST")` and
  `o = game("o", T0 + 4*H, seatsOf([1,2,3,4,6]), "LIBERAL")`: `neverCountsUnfinished`
  (`ids(countedGames([a, u], DEFAULT_FILTER))` is `["a"]`); `cpuGamesOnlyWithTheToggle` (`["a"]`
  off, `["c", "a"]` with `cpu: true`); `everyHumanSeatMustBeOn` (`players: {1..5}, cpu: true` gives
  `["c", "a"]`); `cpuSeatsNeedNoChip` (`players: {1,2,3}, cpu: true` on `[c]` gives `["c"]`);
  `ordersByEndedAtThenId` (`b` with `a`'s `endedAt`, input `[b, a, c]`, toggle on: `["c", "a",
  "b"]`); `anEmptySelectionCountsNothing` (`[]`).

  `rate`: `rate(3, 4)` is `{ hits: 3, chances: 4, value: null }`; `rate(3, 5).value` is `0.6`;
  `rate(0, 0, 0).value` is null; `rate(1, 2, 2).value` is `0.5`.

  `rankRows`, with names `1 "Cy"`, `2 "ann"`, `3 "Bo"`, `4 "Dee"`, `5 "Eve"` and `desc = (a, b) =>
  b - a`:

```ts
it("tiesShareARankThenMoreGamesThenName", () => {
  const rows = rankRows([
    { player: 1, value: 10, count: 6 }, { player: 2, value: 12, count: 5 },
    { player: 3, value: 10, count: 8 }, { player: 4, value: 10, count: 6 },
    { player: 5, value: 9, count: 7 },
  ], desc, names);
  expect(rows.map((r) => [r.player, r.rank])).toEqual([[2, 1], [3, 2], [1, 2], [4, 2], [5, 5]]);
});
it("belowTheMinimumIsUnrankedAtTheBottom", () => {
  const rows = rankRows([
    { player: 1, value: 99, count: 4 }, { player: 2, value: 1, count: 5 },
    { player: 3, value: 50, count: 4 }, { player: 4, value: 0, count: 2 },
  ], desc, names);
  expect(rows.map((r) => [r.player, r.rank])).toEqual([[2, 1], [3, null], [1, null], [4, null]]);
});
it("namesIgnoreCase", () => {
  const rows = rankRows([{ player: 3, value: 1, count: 5 }, { player: 2, value: 1, count: 5 }], desc, names);
  expect(rows.map((r) => r.player)).toEqual([2, 3]); // "ann" before "Bo"
});
```

  `humanSeats(game("x", T0, seatsOf([4, null, 2, null, 9]), "LIBERAL"))` is `[{ seat: 0, player: 4
  }, { seat: 2, player: 2 }, { seat: 4, player: 9 }]` (and the CPU seats are named `Bot 2` and
  `Bot 4`, with roles `ROLES[5]`). `seatWon`: seat 0 of a Liberal win true, seat 4 (Hitler) false,
  any seat of an unfinished game false.

  `sessions`: `g1` 20:00–20:30; `g2` starts 3 h − 1 ms after `g1` ends; `g3` starts exactly 3 h
  after `g2` ends: `sessions([g3, g1, g2])` is `[[g1, g2], [g3]]`. `overlappingLobbies`: `gA`
  20:00–21:30, `gB` 20:15–20:45, `gC` starting 23:45 (2 h 15 after `gA`'s end) is one session.

  `localDaysBetweenInTheZoneGiven` (Review Focus 4): `Date.UTC(2026, 10, 14, 23, 59)` to
  `Date.UTC(2026, 10, 15, 0, 1)` is `1` in `"UTC"` and `0` in `"America/New_York"`;
  `Date.UTC(2026, 10, 14, 22, 59)` to `Date.UTC(2026, 10, 14, 23, 1)` is `1` in `"Europe/Paris"`
  (23:59 to 00:01) and `0` in `"UTC"`; noon to noon across DST is whole days: `Date.UTC(2026, 2, 1,
  17)` to `Date.UTC(2026, 3, 5, 16)` is `35` in `"America/New_York"`, and `Date.UTC(2026, 9, 20,
  10)` to `Date.UTC(2026, 10, 10, 11)` is `21` in `"Europe/Paris"`.

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/stats/counting.test.ts`. Expected: FAIL,
  `counting.ts` does not exist.
- [ ] **Step 3: Implement `counting.ts` and the Task 1 builders in `testGames.ts`** as in
  Interfaces. `parseFilter` reads `URLSearchParams`; `players` tokens are trimmed and kept when
  `/^[1-9]\d*$/` and safe integers. `filterSearch` builds the string by hand (plain commas).
  `countedGames` returns a sorted copy (`endedAt`, then `id` by code units). `sessions` sorts by
  `startedAt`, then `id`, and starts a new session when a game starts `SESSION_GAP_MS` or more after
  the latest `endedAt` so far in the current one.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the stats counting rules`, with Phase 17A's Progress
  row set to `in progress`, ticking box 1.

---

### Task 2: Elo

**Files:**
- Create: `frontend/src/stats/elo.ts`, `frontend/src/stats/elo.test.ts`

**Interfaces:**
- Consumes: `humanSeats` (Task 1); `seatsOf`, `game`, `match` (`testGames.ts`); `sideOf`.
- Produces, as the interfaces file: the five constants, `PlayerRating`, `RatingPoint` (`ratings`
  after the game, for every player rated so far), `GameElo`, `EloResult`, `replayElo`.
- Produces, own: `handicap(liberalWins: number, games: number): number` (`p = (wins + ELO_PRIOR) /
  (games + 2 * ELO_PRIOR)`, `ELO_SCALE * log10((1 − p) / p)`); `expectedLiberal(liberal: number,
  fascist: number, handicap: number): number` (`1 / (1 + 10 ** ((fascist + handicap − liberal) /
  ELO_SCALE))`); `eloChange(expected: number, liberalWon: boolean): number` (`ELO_K * (S − E)`).

- [ ] **Step 1: Write the failing tests** in `elo.test.ts`:

```ts
describe("the spec's worked case: 7 seats, Liberals 1512, Fascists 1517, 3 of 10 earlier Liberal wins", () => {
  const h = handicap(3, 10); // p = (3 + 5) / (10 + 10) = 0.4
  const e = expectedLiberal(1512, 1517, h);
  it("H is about +70", () => expect(h).toBeCloseTo(70.4365, 3));
  it("E is about 0.39", () => expect(e).toBeCloseTo(0.39311, 5));
  it("a Liberal win moves each side 19", () => expect(Math.round(eloChange(e, true))).toBe(19));
  it("a Fascist win moves each side 13", () => expect(Math.round(eloChange(e, false))).toBe(-13));
});
it("noEarlierGamesNoHandicap", () => expect(handicap(0, 0)).toBe(0));
it("liberalsWinningMoreMakesItNegative", () => expect(handicap(8, 10)).toBeCloseTo(-107.538, 3));
```

  `replayElo`, all on hand-built records (`L` = `LIBERAL`, …):
  - `startsAt1500AndMovesASideTogether`: one 5-seat game, players 1–5 (`seatsOf`), Liberal win:
    ratings 1–3 are `1516`, 4–5 `1484`; `games.get(id)` is `{ gameId: id, expectedLiberal: 0.5,
    handicap: 0, liberalChange: 16 }`; player 4's `lastChange` `-16`, `peak` `1484`, `games` `1`,
    `provisional` true.
  - `usesTheRatingsFromBeforeEachGame`: then the same seats again, Fascist win: `handicap`
    `≈ -31.672` (one earlier 5-seat Liberal win), `expectedLiberal ≈ 0.59062`, `liberalChange ≈
    -18.900`; player 1 ends `≈ 1497.100` with `peak` `1516` and `lastChange ≈ -18.900`.
  - `replaysByEndedAtThenId`: the result for a list and for its reverse are equal (`toEqual`), and
    two games with one `endedAt`, ids `"b"` and `"a"`, give `history` `["a", "b"]`.
  - `cpuSeatsCount1500AndAreNeverRated`: after the first game above, a 5-seat game with seats
    `[1, 2, null, 4, null]` (L L L F H), Liberal win: `expectedLiberal ≈ 0.57194` (means `1510.667`
    and `1492`, handicap `-31.672`); `ratings` keys are exactly 1–5.
  - `theHandicapLearnsFromEarlierGamesOfTheSameSize`: ten 7-seat games by players 101–107 with 3
    Liberal wins, two 5-seat Liberal wins by players 301–305, then a 7-seat Liberal win by fresh
    players 201–207: its `GameElo` has `handicap` `toBeCloseTo(70.4365, 3)`, `expectedLiberal`
    `toBeCloseTo(0.4, 10)`, `liberalChange ≈ 19.2`; players 201–204 end at `1519.2`, 205–207 at
    `1480.8`.
  - `equalSidesMoveTheTotalByZero`: three hand-built 6-seat games with roles `[L, L, L, F, F, H]`
    and mixed winners: the sum of `rating − 1500` over `ratings` is `toBeCloseTo(0, 9)`. And
    `unequalSidesMoveItByTheChange`: one 7-seat Liberal win from 1500s moves the sum by `16`.
  - `provisionalUntilFiveGames`: after 4 games `provisional` true, after the 5th false.
  - `historyCarriesMissedGamesFlat`: games 1 (players 1–5) and 2 (players 1, 2, 3, 4, 6):
    `history[0].ratings` has no 6; `history[1].ratings.get(5)` equals `history[0].ratings.get(5)`.

- [ ] **Step 2: Run** `npx vitest run src/stats/elo.test.ts`. Expected: FAIL, no `elo.ts`.
- [ ] **Step 3: Implement `elo.ts`.** The replay, in this order:

```
sort a copy by (endedAt, id); tally: Map<seat count, { wins, games }>
for each game g:
  t = tally[g.seats.length] ?? { 0, 0 };  H = handicap(t.wins, t.games)
  L, F = means of the Liberal-side and Fascist-side (FASCIST and HITLER) seats' ratings,
         a CPU seat or an unrated player counting ELO_START
  E = expectedLiberal(L, F, H);  d = eloChange(E, g.winner === "LIBERAL")
  every human seat: rating += (Liberal side ? d : −d); games += 1; lastChange; peak = max
  tally[n] += { wins: Liberal won ? 1 : 0, games: 1 }
  games.set(g.id, { gameId, expectedLiberal: E, handicap: H, liberalChange: d })
  history.push({ gameId, endedAt, ratings: a copy of every rated player's rating })
provisional = games < PROVISIONAL_GAMES
```

- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): replay elo with a handicap per player count`, ticking
  box 2.

---

### Task 3: The stats context

**Files:**
- Create: `frontend/src/stats/useStats.ts`, `useStats.test.tsx`
- Modify: `frontend/src/stats/testGames.ts` (`generateData`)

**Interfaces:**
- Consumes: `useStatsData` (`api.ts`: one request per page load, shared by every caller, so every
  caller gets the same `StatsData` object), `useLocation` (`routes.ts`), Tasks 1 and 2.
- Produces, as the interfaces file: `StatsContext`, `useStats()` (null until the records arrive;
  the filter is `parseFilter(useLocation().search)`), and the settled `buildStats(data: StatsData,
  filter: StatsFilter): StatsContext` (counted games, `replayElo` of them, `names` from
  `data.players`).
- Produces, own: `STATS_CACHE_SIZE = 8`. The cache is a `WeakMap<StatsData, Map<string,
  StatsContext>>` keyed by `filterSearch(parseFilter(search))`, dropping its oldest entry past
  `STATS_CACHE_SIZE`.
- Produces in `testGames.ts`: `generateData(games: number, seed: number, players = 10):
  StatsData`: deterministic per seed (a small seeded generator such as mulberry32), oldest first,
  ids `g0001`…, twelve-character names (`Seat01Player`…), 5 to 10 seats with roles shuffled from
  `ROLES`, six games a night every third evening, about one game in seven with CPU seats and one in
  twenty-five unfinished.

- [ ] **Step 1: Write the failing tests.** `useStats.test.tsx` mocks `./api`'s `useStatsData` and
  `./routes`'s `useLocation` (`vi.mock` with `importOriginal` for the rest), with `data =
  generateData(60, 1)`:
  `isNullUntilTheRecordsArrive`; `buildsTheContextFromTheAddress` (search `?cpu=1`: `filter` equals
  `parseFilter("?cpu=1")`, `ids(counted)` equals `ids(countedGames(data.games, filter))`,
  `elo.ratings.size` equals `replayElo(counted).ratings.size`, `names.get(1)` is
  `"Seat01Player"`); `memoizedPerDataAndFilter` (two components on `?players=1,3&cpu=1` and
  `?cpu=1&players=3,1` get the same object, `toBe`); `aNewFilterOrNewRecordsGiveANewContext` (and
  going back to the first filter returns the first object; after `STATS_CACHE_SIZE` other filters
  it is a new one); `anEmptySelectionBuildsAnEmptyContext` (Review Focus 2: `?players=` gives
  `counted` `[]`, `elo.ratings.size` `0` and `elo.history` `[]`, with `names` still every player).
- [ ] **Step 2: Run** `npx vitest run src/stats/useStats.test.tsx`. Expected: FAIL, no
  `useStats.ts`.
- [ ] **Step 3: Implement** as in Interfaces (`useMemo` over the cache lookup, keyed on `data` and
  `search`).
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): compute the stats context per filter`, ticking box 3.

---

### Task 4: Cards, ranked tables and numbers

**Files:**
- Create: `frontend/src/stats/numbers.ts` (+ `.test.ts`), `StatCard.tsx`, `StatCard.css`,
  `StatCard.test.tsx`, `RankedTable.tsx`, `RankedTable.css`, `RankedTable.test.tsx`

**Interfaces:**
- Consumes: `Row<T>`, `rankRows`, `rate` (Task 1); `PlayerName`, `plural` (Phase 15A).
- Produces in `numbers.ts`: `formatPercent(value: number): string`; `formatSigned(value: number):
  string` (the rating-change formatter and any signed number: rounded; `+n`, `−n` with U+2212, `0`
  for none, never `±0`); `formatRating(value: number): string` (`String(Math.round(value))`);
  `formatDays(days: number): string` (`Today`, `1 day`, `N days`). No `plural` and no
  `formatChange` here.
- Produces: `StatCard` with `{ title: string; definition: string; empty?: boolean | string;
  className?: string; children?: ReactNode }` and `NO_GAMES = "No games yet with these players."`
  (`empty` true shows it, a string shows that string, both instead of the children). Markup: a
  `section.stats-card` labelled by its `h3.stats-card-title` (so `getByRole("region", { name: title
  })` finds it), the definition in a `p`.
- Produces: `RankedTable<T>` with `{ rows: Row<T>[]; format: (value: T) => string; names:
  Map<number, string>; countLabel?: (count: number) => string; showCount?: boolean }`. A row's
  cells: rank (`"2."`, empty when unranked), `PlayerName` (name from `names`, else `Player N`), the
  value (`format(value)`, or `—` when unranked), and the count (`countLabel(count)`, default
  `plural(count, "game")`, on unranked rows always and on ranked rows when `showCount`). Four
  columns fit 320px: the name cell has `min-width: 0` and `PlayerName` wraps (`overflow-wrap:
  anywhere`), so it needs no scroller. In the stacked query each row is at least 44px tall.

- [ ] **Step 1: Write the failing tests.** `numbers.test.ts`: `formatPercent(0.625)` `"63%"`,
  `formatPercent(1)` `"100%"`; `formatSigned(19.42)` `"+19"`, `formatSigned(-12.58)` `"−13"`
  (U+2212), `formatSigned(16)` `"+16"`, `formatSigned(-15.6)` `"−16"`, `formatSigned(0)`,
  `formatSigned(0.4)` and `formatSigned(-0.4)` all `"0"` (never `±0`), and `numbers.ts` exports no
  `formatChange`; `formatDays(0)` `"Today"`, `(1)` `"1 day"`, `(3)` `"3 days"`.
  `StatCard.test.tsx`: `showsItsTitleDefinitionAndContent`; `anEmptyCardSaysSoInstead` (`empty`
  true: `No games yet with these players.`, the child not rendered); `anEmptyCardCanSayWhy`
  (`empty="No wins yet this month."`). `RankedTable.test.tsx` (rows from `rankRows`, cells read per
  row): `rankedRows` (`["1.", "Ann", "62%", ""]`); `tiedRowsShareTheirRank` (two `"2."`);
  `belowTheMinimum` (`["", "Bo", "—", "3 games"]`); `showCountAddsTheCount` (`["1.", "Ann", "62%",
  "28 games"]`); `countLabel` (``(n) => `${n} chances` `` gives `"3 chances"`).
- [ ] **Step 2: Run** `npx vitest run src/stats/numbers.test.ts src/stats/StatCard.test.tsx
  src/stats/RankedTable.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces. `StatCard.css` adds to Phase 15A's `.stats-card`
  only the definition (`--textFont` 500, `--textColorOnDark`), the empty line and the spacing;
  values are white Montserrat 700; the card and everything in it that sits in a grid or flex row
  has `min-width: 0`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add stat cards and ranked tables`, ticking box 4.

---

### Task 5: Scroll regions and split tables

**Files:**
- Create: `frontend/src/stats/ScrollRegion.tsx`, `ScrollRegion.css`, `ScrollRegion.test.tsx`,
  `SplitTable.tsx`, `SplitTable.css`, `SplitTable.test.tsx`

**Interfaces:**
- Consumes: `compareNames` (Task 1); `PlayerName`; `StatCard` (tests).
- Produces, exactly as the interfaces file pins them (Phases 18, 19 and 20 rely on the shape):

```ts
export function ScrollRegion(props: { label: string; children: ReactNode }): JSX.Element;
export interface SplitColumn { key: string; label: string }      // e.g. LIBERAL, FASCIST, HITLER
export interface SplitCell { text: string; count?: number }       // "60%" with count 5; "—" with count 2
export function SplitTable(props: {
  title: string;                                                   // the card's title; the region is `${title} table`
  columns: SplitColumn[];
  rows: { player: number; cells: Record<string, SplitCell> }[];    // shown sorted by name (compareNames)
  names: Map<number, string>;
}): JSX.Element;
```

- `ScrollRegion`: `<div className="scroll-region" role="region" aria-label={label}
  tabIndex={0}>`. Callers name it `<card title> table`, since the card around it is already a
  region named by the title. CSS: `overflow-x: auto; max-width: 100%; min-width: 0`, no padding (a
  sticky cell sits at its edge), a `:focus-visible` outline in `--selectionHover`.
- `SplitTable`: a `ScrollRegion` named `${title} table` around `table.split-table`: a head row
  (`th scope="col"` `Player`, then one per column, with `.split-liberal`, `.split-fascist` or
  `.split-hitler` when its `key` is `LIBERAL`, `FASCIST` or `HITLER`), then a row per player,
  sorted by `compareNames` of `names` (then number): `th scope="row"` with `PlayerName` (name from
  `names`, else `Player N`) and the full name as its `title`, then a `td` per column, reading
  `cells[column.key]`: `span.split-text` with its `text`, then `span.split-count` beside it with its
  `count` whenever `count !== undefined` (so a `0` shows); an absent cell shows `—`. CSS:
  `border-collapse: separate; border-spacing: 0`, cells `white-space: nowrap` with tabular
  numbers, right-aligned; the first column `position: sticky; left: 0` on `--backgroundDark`, at
  most `9em` with an ellipsis; heads in `--textColorLiberal` or `--textColorFascist` (Hitler's
  underlined); `.split-count` smaller, in `--textColorOnDark`; in the stacked query each row is at
  least 44px tall.

- [ ] **Step 1: Write the failing tests.** `ScrollRegion.test.tsx`:
  `isAFocusableRegionNamedByItsLabel` (`getByRole("region", { name: "Opponents table" })` has
  `tabindex="0"`, class `scroll-region` and the child; inside a `StatCard` titled `Opponents` the
  card and the table are two regions, `Opponents` and `Opponents table`). `SplitTable.test.tsx`
  (title `Ja rate`; columns `LIBERAL` `Liberal`, `FASCIST` `Fascist`, `HITLER` `Hitler`; names `1
  Cy`, `2 ann`, `3 WWWWWWWWWW01`): `headsAndRows` (column heads `["Player", "Liberal", "Fascist",
  "Hitler"]`, the last three with `split-liberal`, `split-fascist`, `split-hitler`);
  `rowsSortedByName` (rows given as players 1, 3, 2 show `ann`, `Cy`, `WWWWWWWWWW01`);
  `aCellShowsItsTextThenItsCount` (`{ text: "60%", count: 5 }` has `.split-text` `60%` and
  `.split-count` `5`; `{ text: "—", count: 2 }` has `—` and `2`; `{ text: "0%", count: 0 }` has
  `.split-count` `0`, since Phase 18 passes 0 for a hand never drawn; `{ text: "3" }` has no
  `.split-count`); `anAbsentCellShowsADash` (a row with no `HITLER` cell shows `—` there);
  `namesKeepTheirFullTitle` (the row head's `title` is `WWWWWWWWWW01`); `scrollsInItsOwnRegion`
  (Review Focus 5: `getByRole("region", { name: "Ja rate table" })` holds the table).
- [ ] **Step 2: Run** `npx vitest run src/stats/ScrollRegion.test.tsx src/stats/SplitTable.test.tsx`.
  Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add scroll regions and split tables`, ticking box 5.

---

### Task 6: The line chart

**Files:**
- Create: `frontend/src/stats/charts/axis.ts` (+ `.test.ts`), `useChartWidth.ts`, `charts.css`,
  `LineChart.tsx`, `LineChart.test.tsx`

**Interfaces:**
- Produces in `axis.ts`: `niceTicks(min: number, max: number, count = 5): number[]` (step the
  smallest of 1, 2 or 5 × 10^k at least `(max − min) / count`, from `floor(min / step) * step` to
  `ceil(max / step) * step`, rounded to the step's decimals; `min === max` widens to `± 5`).
- Produces in `useChartWidth.ts`: `useChartWidth(ref: RefObject<HTMLElement>, fallback = 320):
  number` (measured in `useLayoutEffect`, then by a `ResizeObserver` when there is one; the
  fallback, the narrowest phone, while the width is 0, as in jsdom). Phase 21's charts use it.
- Produces in `LineChart.tsx`: `LinePoint { x; y; dashed? }` and `LineSeries { key; label; points
  }` (the interfaces file's shape); `LineChart` with `{ series: LineSeries[]; label: string;
  colors?: Record<string, string>; formatY?: (y: number) => string; detail?: (series: LineSeries,
  index: number) => string[]; height?: number }` (defaults: `SERIES_COLORS` in order,
  `formatRating`, `[label, formatY(y)]`, `220`); `SERIES_COLORS` (ten colours on the dark card,
  starting `#f08a5d`, `#5a9ba6`, `#e8604a`); `LINE_PADDING = { top: 8, right: 8, bottom: 8, left:
  40 }`; `lineChartGeometry(series, width, height): { xScale; yScale; yTicks: number[]; paths: {
  key: string; d: string; dashed: boolean }[]; points: { key: string; index: number; x: number; y:
  number }[] }` (a segment is dashed when its later point is; every x the same puts the points at
  the plot's middle); `describeLines(series, formatY): string` (`"<label>: from <first> to <last>,
  highest <max>."` per series, joined by spaces).
- Markup: a wrapper (`position: relative`) holding an `svg` with `role="img"`, `aria-label={label}`,
  `aria-describedby` a visually hidden `p` with `describeLines`, `width="100%"` and a `viewBox` of
  the measured width; a dot per one-point series; a legend below (`aria-hidden`); a tooltip
  (`.chart-tooltip`) for the nearest point (pixel distance) on `pointermove` (mouse and pen) and
  `pointerdown` (touch), hidden on `pointerleave` for a mouse; `touch-action: pan-y` on the svg. The
  tooltip's `left` is the point's share of the width in percent, and its `transform` starts
  `translateX(-<same>%)`, so it never leaves the chart.

- [ ] **Step 1: Write the failing tests.** `axis.test.ts`: `niceTicks(1488, 1612)` `[1450, 1500,
  1550, 1600, 1650]`; `niceTicks(0, 7)` `[0, 2, 4, 6, 8]`; `niceTicks(0, 100)` `[0, 20, 40, 60, 80,
  100]`; `niceTicks(1500, 1500)` `[1494, 1496, 1498, 1500, 1502, 1504, 1506]` (widened to 1495–1505,
  step 2). `LineChart.test.tsx`:
  - `mapsTheDataInsideThePadding`: one series `(0, 1500)`, `(10, 1600)` at 400x200: `xScale(0)`
    `40`, `xScale(10)` `392`, `yTicks` `[1500, 1520, 1540, 1560, 1580, 1600]`, `yScale(1600)` `8`,
    `yScale(1500)` `192`.
  - `oneXSitsInTheMiddle`: two series with one point each at `x` 0, at 400x200: `xScale(0)` `216`
    and no `NaN` in any path or point.
  - `aSegmentTakesItsLaterPointsDashes`: points dashed, dashed, solid, solid give
    `paths.map((p) => p.dashed)` `[true, false]`: the dashed path through the first two points,
    the solid one through the last three.
  - `isAnImageDescribedInWords`: `getByRole("img", { name: "Rating history" })` has the accessible
    description `"Ann: from 1500 to 1612, highest 1620. Bo: from 1500 to 1480, highest 1500."`
  - `hoverShowsTheNearestPointsDetails` (`fireEvent.pointerMove` at a point's pixel position: the
    tooltip's lines are `detail`'s), `aTapShowsThemToo` (`pointerDown` with `pointerType:
    "touch"`), `leavingHidesThem`.
  - `theTooltipStaysInsideAtTheRightEdge` (Review Focus 5): hovering the last point gives the
    tooltip `left: 100%` and a `transform` starting `translateX(-100%)`.
- [ ] **Step 2: Run** `npx vitest run src/stats/charts`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces; `charts.css` holds the axis text, grid lines, legend
  and tooltip shared with Task 7 and Phase 21.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the line chart`, ticking box 6.

---

### Task 7: The stacked bar chart

**Files:**
- Create: `frontend/src/stats/charts/StackedBarChart.tsx`, `StackedBarChart.test.tsx`

**Interfaces:**
- Consumes: `niceTicks`, `useChartWidth`, `charts.css` (Task 6).
- Produces: `StackedBar { label: string; parts: { key: string; value: number }[] }`;
  `StackedBarChart` with `{ bars: StackedBar[]; colors: Record<string, string>; label: string;
  legend?: Record<string, string>; formatValue?: (value: number) => string; height?: number }`;
  `BAR_PADDING = { top: 8, right: 8, bottom: 24, left: 32 }`; `stackedBarGeometry(bars, width,
  height): { yTicks: number[]; rects: { bar: number; key: string; x: number; y: number; width:
  number; height: number }[] }` (parts bottom-up in order, scaled to `niceTicks(0, tallest)`'s last
  tick, each bar 70% of its slot, no rect for a zero part); `describeBars(bars, legend,
  formatValue): string` (`"<label>: <legend> <value>, <legend> <value>."` per bar, joined by
  spaces). Same markup rules as the line chart, with the tooltip `"<bar> · <legend> <value> of
  <total>"`. It draws its legend below (a swatch and `legend[key] ?? key` per key, in first-seen
  order), so its users draw none of their own.

- [ ] **Step 1: Write the failing tests:** `stacksBottomUpScaledToTheTallest` (bars `5: A 2, B 4`
  and `6: A 1, B 0` at 400x200: `yTicks` `[0, 2, 4, 6]`, three rects, bar 0's `A` `height` `56`
  and `y` `120`, its `B` `height` `112` and `y` `8`); `isAnImageDescribedInWords` (`"5: Liberal 2,
  Fascist 4. 6: Liberal 1, Fascist 0."` with that legend); `drawsItsLegend` (`Liberal`, `Fascist`);
  `hoverAndTapShowAPart` (`"5 · Fascist 4 of 6"`); `theTooltipStaysInsideAtTheRightEdge`.
- [ ] **Step 2: Run** `npx vitest run src/stats/charts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the stacked bar chart`, ticking box 7.

---

### Task 8: The filter bar

**Files:**
- Create: `frontend/src/stats/FilterBar.tsx`, `FilterBar.css`, `FilterBar.test.tsx`

**Interfaces:**
- Consumes: `StatsFilter`, `togglePlayer`, `compareNames` (Task 1); `Player` (`record.ts`);
  `ChevronDown` from `lucide-react`.
- Produces: `FilterBar` with `{ players: Player[]; filter: StatsFilter; onChange: (filter:
  StatsFilter) => void; showPlayers?: boolean }` (`showPlayers` defaults to true), controlled (no
  copy of the filter in state; only the panel's open flag); `filterSummary(players: Player[],
  filter: StatsFilter): string` (the phone line, counting only numbers that are in `players`).
- Markup: a summary `button` (`.filter-summary`, `aria-expanded`, `aria-controls` the panel) with
  the summary and the chevron; the panel (`.filter-panel`, `is-open` when open) holding a group
  labelled `Players` of chips (`button`, `aria-pressed`, by name, plain names, not `PlayerName`)
  and the CPU control (`button role="switch"`, `aria-checked`, `Include games with CPU players`).
  With `showPlayers` false (Phase 22's player page) there is no summary and no chips at any size:
  the switch alone. Chips and the switch keep `App.css`'s look in the lobby's grey
  (`--button-face: #6e655e`, `--button-shadow: #4b4440`, `--button-depth: 3px`), in `--textFont`;
  an off chip has a darker face, dimmed text and its name struck through; a chip's name wraps
  rather than widen the row. Desktop: the summary is `display: none` and the panel always shows.
  Phone-only query: the summary shows, full width, and the panel shows only `is-open`. Stacked
  query: chips, switch and summary at least `calc(44px + var(--button-depth))` tall and 44px wide.

- [ ] **Step 1: Write the failing tests** (players `3 Cy`, `1 ann`, `2 Bo`):
  `aChipPerPlayerAllOnByName` (names `["ann", "Bo", "Cy"]`, all `aria-pressed="true"`);
  `turningAChipOffKeepsTheOthers` (Bo: `onChange({ players: new Set([1, 3]), cpu: false })`);
  `turningTheLastBackOnIsEveryone` (from `{1, 3}`, Bo: `{ players: null, cpu: false }`);
  `theCpuSwitch` (`getByRole("switch", { name: "Include games with CPU players" })` unchecked; a
  click gives `{ players: null, cpu: true }`); `followsTheFilterItIsGiven` (Review Focus 3: a
  rerender with `{ players: new Set([1]) }` unpresses Bo and Cy); `thePhoneLine`
  (`filterSummary(players, { players: new Set([1, 3]), cpu: false })` is `"Players: 2 of 3 · CPU
  off"`, `{ players: null, cpu: true }` is `"Players: 3 of 3 · CPU on"`);
  `unknownNumbersAreNotCounted` (Review Focus 1: `new Set([1, 99])` gives `"Players: 1 of 3 · CPU
  off"`); `everyChipOff` (Review Focus 2: `new Set()` gives every chip `aria-pressed="false"` and
  `"Players: 0 of 3 · CPU off"`); `theLineOpensThePanel` (`aria-expanded` false, then true and
  `is-open` after a click); `showPlayersFalseShowsTheSwitchAlone` (no chip, no `.filter-summary`,
  the switch).
- [ ] **Step 2: Run** `npx vitest run src/stats/FilterBar.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the stats filter bar`, ticking box 8.

---

### Task 9: The tab row and the tabs

**Files:**
- Create: `frontend/src/stats/TabRow.tsx`, `TabRow.css`, `TabRow.test.tsx`, `tabs/tabs.ts`,
  `tabs/ComingSoon.tsx`, `tabs/ComingSoon.test.tsx`, `tabs/OverviewTab.tsx`, `tabs/RolesTab.tsx`,
  `tabs/VotesTab.tsx`, `tabs/RivalsTab.tsx`, `tabs/EndingsTab.tsx`, `tabs/ActivityTab.tsx`,
  `tabs/RecordsTab.tsx`
- Modify: `frontend/src/stats/TabsPage.tsx` and `TabsPage.test.tsx` (Phase 15A's placeholder and
  its test; the export form and `PageProps` stay)

**Interfaces:**
- Consumes: `TabId`, `PageProps`, `routePath`, `navigate`, `useLocation`, `StatsLink`; `useStats`,
  `filterSearch`; `FilterBar`, `StatCard`.
- Produces: `TABS: readonly { id: TabId; label: string; Component: (props: { stats: StatsContext
  }) => JSX.Element }[]` in `tabs/tabs.ts`, in the order and with the labels of the Global
  Constraints. `ComingSoon({ title }: { title: string })`: a `StatCard` whose definition is
  `Coming in a later update.` Seven named exports, one per file, each `(props: { stats:
  StatsContext }) => JSX.Element` rendering `ComingSoon`: `OverviewTab` (`Overview`), `RolesTab`
  (`Roles & cards`), `VotesTab` (`Votes & powers`), `RivalsTab` (`Rivals`), `EndingsTab`
  (`Endings`), `ActivityTab` (`Activity`), `RecordsTab` (`Records`). Phase 17B fills `OverviewTab`
  and Phases 18 to 21 the others, each replacing its file's body and touching nothing else here.
- Produces: `TabRow({ current, search }: { current: TabId; search: string })`: a `nav` labelled
  `Stats sections` of `StatsLink`s with `.button-link`, `href` `routePath({ page: "tab", tab: id })
  + search`, `aria-current="page"` on the current one (the default orange face; the others the
  lobby's grey), which scrolls itself into view (`scrollIntoView?.({ block: "nearest", inline:
  "nearest" })`) when `current` changes. It wraps on desktop and in tall windows; in the phone-only
  query it is one row with `overflow-x: auto`; in the stacked query each tab is at least 44px.
- `TabsPage`: `useStats()`; null renders nothing; otherwise a `.stats-tabs-page` column of
  `FilterBar` (its `onChange` calls `navigate(pathname + filterSearch(next))`), `TabRow` (`search`
  is `filterSearch(stats.filter)`) and the route's tab from `TABS`.

- [ ] **Step 1: Write the failing tests.** `TabRow.test.tsx`: `sevenTabsInOrder` (link names
  `["OVERVIEW", "ROLES & CARDS", "VOTES & POWERS", "RIVALS", "ENDINGS", "ACTIVITY", "RECORDS"]`,
  `href`s `/stats`, `/stats/roles`, `/stats/votes`, `/stats/rivals`, `/stats/endings`,
  `/stats/activity`, `/stats/records`, each followed by `?cpu=1`); `onlyTheCurrentTabIsMarked`.
  `ComingSoon.test.tsx`: the region `Roles & cards` says `Coming in a later update.`
  `TabsPage.test.tsx`, replacing Phase 15A's placeholder tests, mocks `./useStats` (a `buildStats`
  context), `./routes`' `useLocation` and `navigate`, and every `./tabs/*Tab` module with a stub
  (`<p>roles tab</p>`…), so later phases' tabs never break it:
  `showsTheFilterTheTabRowAndTheRoutesTab` (route `roles`: `roles tab`, and `ROLES & CARDS` has
  `aria-current="page"`); `aFilterChangeStaysOnTheTab` (pathname `/stats/roles`, the CPU switch:
  `navigate("/stats/roles?cpu=1")`); `theTabsCarryTheFilter` (search `?players=1,3&cpu=1`:
  `ENDINGS`' `href` is `/stats/endings?players=1,3&cpu=1`); `nothingUntilTheRecordsArrive`.
- [ ] **Step 2: Run** `npx vitest run src/stats`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** as in Interfaces. Then check Phase 15's browser tests for an assertion
  on the placeholder's content (`grep -rn "LATEST GAMES\|All games ›" e2e/stats-*.spec.ts`): if
  one asserts it on `/stats`, stop and report it, since that file is Phase 15's.
- [ ] **Step 4: Run** `npx vitest run src/stats && npm run build`. Expected: PASS, and the build's
  entry chunk the size it is on `development` (only the stats chunk grew).
- [ ] **Step 5: Commit** `feat(frontend): add the stats tab row and its seven tabs`, ticking box 9.

---

### Task 10: The tab row and the filter in the browser

**Files:**
- Create: `frontend/e2e/stats-engine.spec.ts`
- Modify: this phase's CSS, for whatever the tests find

**Interfaces:**
- Consumes: `stubStats`, `bigStatsData`, `statsSizesFor(project, viewport)`, `checkStatsPage(page,
  size)` (`./stats`: no sideways scroll outside boxes that scroll sideways themselves; where the
  stacked query matches, 44px targets except links inline in text, and 16px text in any field);
  `settle` (`./lobby`); `NARROW_PHONE` (`./layout`); `game`, `seatsOf` (`../src/stats/testGames`).
  `SMALL` below is a `StatsData` with players `1 Ann`, `2 Bo`, `3 Cy` and a few games built with
  `game` and `seatsOf`.

- [ ] **Step 1: Write the tests** in `stats-engine.spec.ts`. Each runs at
  `statsSizesFor(test.info().project.name, page.viewportSize()!)`:
  - `the tab row and the filter fit every stats size` (`test.slow()`): `stubStats(page,
    bigStatsData())`, then `/stats` and `/stats/roles?cpu=1`, `settle`, `checkStatsPage(page,
    size)` at each size; where the phone-only query matches, also with the filter panel open (ten
    twelve-character chips; Review Focus 5 at 320x568), and every tab has one `top` and the row's
    `scrollWidth` is more than its `clientWidth`.
  - `the filter and the CPU toggle change the address` (`SMALL`; on phones, open the summary line
    first): at `/stats` every chip is pressed and the switch unchecked; the switch: URL ends
    `/stats?cpu=1`, the switch checked; the `Bo` chip off: URL ends `/stats?players=1,3&cpu=1`, Bo
    unpressed, and on phones the line reads `Players: 2 of 3 · CPU on`; `goBack()`: URL
    `/stats?cpu=1`, `Bo` pressed again (Review Focus 3); a reload of `/stats?players=1,3&cpu=1`
    shows Bo unpressed and the switch checked.
  - `the tabs keep the filter` (`SMALL`): from `/stats?players=1,3&cpu=1`, `ROLES & CARDS` gives
    `/stats/roles?players=1,3&cpu=1` with that tab `aria-current="page"` and the switch still on;
    `RECORDS` (scrolled to on phones) gives `/stats/records?players=1,3&cpu=1`; `OVERVIEW` gives
    `/stats?players=1,3&cpu=1`; `goBack()` gives the records address. Nothing here reads a tab's
    content, which Phases 17B to 21 replace.
  - `phones fold the filter into one line` (`SMALL`): in the phone layout the line matches
    `/^Players: \d+ of \d+ · CPU (off|on)$/` and the chips are hidden until it is tapped; on
    desktop the line is hidden and the chips show.
- [ ] **Step 2: Run** `E2E_PORT=4617 npx playwright test e2e/stats-engine.spec.ts` (all four
  projects). Expected: PASS; fix this phase's CSS where it fails.
- [ ] **Step 3: Run the phone projects and Firefox in the Linux image** (`DEVELOPMENT.md`,
  "Browser tests on Linux": the jar serving on the host with `TEST_SIGN_IN=true PORT=4617`, then
  `-e E2E_PORT=4617` and `npx playwright test --config playwright.linux.config.ts
  e2e/stats-engine.spec.ts --project=firefox --project=phone-360 --project=phone-412`). Expected:
  PASS, with room to spare in every one-line label.
- [ ] **Step 4: Commit** `test(frontend): check the stats tab row and filter in the browser`, with
  any CSS fixes, ticking box 10.

---

### Task 11: Docs and the screenshots

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `DEVELOPMENT.md` (only if something in it went stale),
  `docs/superpowers/plans/2026-11-15-game-stats-interfaces.md` (only to correct a name),
  `docs/PLAN.md`
- Add: `docs/pr/phase-17a-stats-engine/before-stats-1600x900.png`, `before-stats-412x915.png`
  (taken in "Before you start"), `after-stats-1600x900.png`, `after-stats-412x915.png`

- [ ] **Step 1: `CLAUDE.md`**, in the stats part of Layout: the counting rules (`counting.ts`,
  the address's filter, `localDaysBetween` and zones), `elo.ts` (the handicap, provisional
  players), `useStats` and `buildStats`, `StatCard`, `RankedTable`, `ScrollRegion`, `SplitTable`,
  `numbers.ts`, `FilterBar` (one line and a panel on phones, `showPlayers`), `TabRow` and `tabs/`
  (`tabs/tabs.ts` registers the seven, each "Coming in a later update." until its phase fills it),
  `charts/` (`LineChart`, `StackedBarChart`, `axis.ts`, `useChartWidth`), `testGames.ts`, and
  `stats-engine.spec.ts`. Commit `docs(claude): describe the stats engine`.
- [ ] **Step 2: `README.md`**, "What this fork adds": the stats tabs, the player filter and the CPU
  toggle, shareable through the address (the tabs fill in over the next phases). Commit
  `docs(readme): describe the stats tabs and filter`.
- [ ] **Step 3: The interfaces file** already lists this phase's shared names. Check each against
  the built code; where a name or type differs, correct the file to match the code (`docs(plan):
  correct phase 17a's names in the interfaces file`), and add nothing else.
- [ ] **Step 4: "After" screenshots:** set the prefix in `pr-shots.spec.ts` to `after`, run it as
  before on port 4717 (now the filter bar, the tab row and the OVERVIEW placeholder), then delete
  it. Commit the four shots (`docs(docs): add the stats engine's screenshots`), ticking box 11.

---

### Task 12: Whole-branch review

- [ ] **Step 1:** Run the `code-review` skill against `origin/development`, with this plan, the
  interfaces file and the spec's Phase 17 sections (all but OVERVIEW) as the spec.
- [ ] **Step 2:** Fix every finding, Minor ones included, each fix with its test and in its own
  commit; a finding that needs no change gets a written reason. Keep the record for the PR.
- [ ] **Step 3:** Re-run the tests the fixes touch. Expected: PASS.

---

### Task 13: Verify, the pull request and the merge

- [ ] **Step 1: Run everything** with `JAVA_HOME` on Java 17: `cd backend && ./gradlew test`; `cd
  frontend && npm test -- --run && npm run build`; `E2E_PORT=4617 npm run e2e` (all four projects;
  Firefox and the phone projects again in the Linux image if Firefox will not launch here).
  Expected: all pass; keep the counts. Then re-run Phase 15's first-download measurement (its
  `the game's first download holds no stats code` browser test, wherever Phase 15 put it, and the
  entry chunk's gzipped size from `npm run build` against `development`'s): unchanged. A failure
  this phase cannot reach is checked on `development` as `implement-issue`'s step 5 describes
  before it is called a flake.
- [ ] **Step 2: Tick** Phase 17A's acceptance boxes this phase owns ("Backend and frontend unit
  tests pass…", "PR merged into `development`") and set its Progress row to `done`, in one last
  commit (`docs(plan): tick phase 17a`). The user's box stays unticked.
- [ ] **Step 3: Push and open the PR:** `git push -u origin phase-17a-stats-engine`; `gh pr create
  --repo jussaw/Secret-Hitler-Online --base development --head phase-17a-stats-engine --title
  "feat(frontend): add the stats engine and tab row" --body-file <scratchpad file>`. The body: a
  before-and-after table (1600x900 and 412x915, linked by
  `https://raw.githubusercontent.com/jussaw/Secret-Hitler-Online/<sha>/docs/pr/phase-17a-stats-engine/<file>`
  at the pushed head), the changes, this plan's Decisions, the review record, the tests with their
  counts, the docs, and `Part of #31` (Phase 22 closes it).
- [ ] **Step 4: CI to green:** `gh pr checks <PR> --repo jussaw/Secret-Hitler-Online --watch
  --interval 30` in the background; fix what this phase broke and push again. When Phase 15B or 16
  merges first, `git fetch origin && git rebase origin/development`, keep both sides of every docs
  conflict (`CLAUDE.md`, `README.md`, `docs/PLAN.md`), re-run the tests, `git push
  --force-with-lease`, and repoint the screenshot links at the new head. This task ends with the PR
  open, not conflicting, and every check green; report the PR number and head.
- [ ] **Step 5: Merge (the manager session, with the user's standing OK; safe to re-run).** `gh pr
  view <PR> --repo jussaw/Secret-Hitler-Online --json state,mergeable,headRefOid`. If `state` is
  `MERGED`, go to the image check. Otherwise, with every check green and `mergeable` not
  `CONFLICTING`: `gh pr merge <PR> --repo jussaw/Secret-Hitler-Online --squash --admin --subject
  "feat(frontend): add the stats engine and tab row (#<PR>)" --match-head-commit <headRefOid>`.
  Then check that `development`'s image publish passes.
