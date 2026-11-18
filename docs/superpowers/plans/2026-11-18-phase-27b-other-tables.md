# Phase 27B: Sortable split and other tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The 14 split tables, RIVALS' People table, RECORDS' Players of the month and ENDINGS' two
tables sort by any column, on Phase 27A's shared rules and heads, which finishes issue #109.

**Architecture:** No new module. Each table lists its columns as 27A's `HeadColumn`s, renders 27A's
`SortHeadRow`, takes its rows from `useTableSort` and keeps drawing its own body. `SplitCell` gains
the figure its text shows, which every caller gives. Three small helpers, each used by the formatter
it mirrors, keep what a column sorts by and what it shows from ever differing.

**Tech Stack:** React 18, TypeScript 5, Vitest with Testing Library, Playwright (macOS and its Linux
image), Lucide (`lucide-react`, through 27A's heads). No new dependency.

**Spec:** [`docs/superpowers/specs/2026-11-18-sortable-tables-design.md`](../specs/2026-11-18-sortable-tables-design.md),
whose "The rules", "The heads", "Each table" (`SplitTable`, the People table, Players of the month,
ENDINGS' two tables) and "Phasing" this phase builds, on the Interfaces of Phase 27A's plan
([`2026-11-18-phase-27a-sortable-tables.md`](2026-11-18-phase-27a-sortable-tables.md), Tasks 2 and 3),
used exactly as they are. Phase 27B's section of [`docs/PLAN.md`](../../PLAN.md) holds the boxes
this plan ticks.

## Decisions

The spec settles what players see; these settle what it leaves to the build.

- **27A's Interfaces, unchanged.** Of them this phase uses `HeadColumn`, `SortHeadRow`,
  `useTableSort`, `playerColumn` (`SortHead.tsx`), `NAME_ORDER`, `TableSort`, `SortValue`
  (`sorting.ts`), `wholePercent` (`numbers.ts`) and `.stats-sort` (`SortHead.css`); `SortColumn`,
  `SortDirection`, `nextSort`, `sortRows` and `SortHead` reach it only through those, and no table
  here has a rank, so `rankColumn` and `RANK_ORDER` go unused. A change to any of them that the
  work seems to need: stop and ask.
- **Figure helpers**, each beside the formatter it mirrors and used by it: `averageTimeTenths(ms)`
  in `timing.ts` (`formatAverageTime` uses it), `wholeMinutes(ms)` in `format.ts` (`formatDuration`
  uses it) and `rateFigure(value)` in `tabs/cellText.ts` (`wholePercent(value)`, null for null, the
  figure `rateText` shows). Average rounds sort by their shown text read back,
  `Number(averageRounds.toFixed(1))`.
- **`SplitCell.value` is required** (`number | null`, null exactly when the text is "—"), so no
  caller forgets it. A cell with two figures gives the one its text leads with: "2 of 5" is 2
  ("0 of 0" is 0, a value), "2 L · 3 F" is 2. `SplitTable` puts its rows in name order
  (`compareNames`, then number) before `useTableSort`, so ties keep name order either way, and it
  throws `Error('A split column cannot be keyed "name"')` for a column keyed `name`, the Player
  column's key.
- **Columns.** A held Player head is `playerColumn(…, "split-name")` in `SplitTable` and
  `playerColumn(…, "rivals-people-name")` in People: classes no rule styles, so `RankedTable.css`'s
  unscoped `.ranked-name` (`width: 100%`) stays off a held column. Every side or role column is
  `end`, `first: "descending"`, `className` its `HEAD_CLASS` (none for other keys, as today).
  People's and ENDINGS' columns have no `end`: their values stand at the left or in the middle, so
  the arrow goes after the words. Players of the month: Month (`className: "ranked-name"`, no
  `end`) and Wins (`"ranked-value"`, `end`).
- **Opening sorts and Players' first press.** `SplitTable` and People open at `NAME_ORDER`.
  `RecordsTab.tsx` has a frozen `MONTH_ORDER: TableSort<"month">` (`{ column: "month", direction:
  "descending" }`), `EndingsTab.tsx` a frozen `SEATS_ORDER: TableSort<"seats">` (`{ column: "seats",
  direction: "ascending" }`), each beside its tables. ENDINGS' Players column has `first:
  "ascending"`: it is the column the table's own order follows, as `#` (1 first), Player (A to Z)
  and Month (latest first) are, so on every table a press on the opening head from another column
  gives the opening order back. The spec's "most first for a number" is read as being about
  quantities; a table size is the table's index. Every other number column here runs most first.
- **Each table is a component of its own** (`SplitTable`, `PeopleTable`, a private `MonthsTable`
  in `RecordsTab.tsx`, private `WinRateTable` and `LengthTable` in `EndingsTab.tsx`), so its sort
  goes when its card empties and it opens in its own order when the card comes back (spec, "The
  sort lasts while its table is on screen"); no table's sort lives in its tab.
- **Coloured heads** (`SplitTable.css`), which outrank 27A's `.stats-screen thead
  .stats-sort.is-sorted` and `:hover` (0,3,1) at (0,4,2):
  `.stats-screen .split-table thead th.split-liberal .stats-sort { color: var(--textColorLiberal) }`,
  the same with `th.split-fascist` and `th.split-hitler` for `var(--textColorFascist)`, and
  `… th.split-hitler .stats-sort { text-decoration: underline }`, which replaces the `th`'s
  underline (an `inline-flex` button is an atomic inline, so the `th`'s underline would not reach
  its words). The arrow marks the sort, as 27A's look does.
- **A held head's focus ring.** The first column sits at its `ScrollRegion`'s left edge with no
  left padding (and `SplitTable`'s with `overflow: hidden`), which would clip the left of a focused
  head's outline. `ScrollRegion.css` adds `.stats-screen .scroll-region thead th:first-child
  .stats-sort:focus-visible { outline-offset: -2px; }`. It also reaches the power ranking's `#`
  head (27A's table, in a `ScrollRegion` too), which is harmless and wanted: say so in the pull
  request, so a review does not read it as a change to 27A's table.
- **The head words** are today's, exactly: each split table's from its caller's
  `SplitColumn.label` (unchanged), People's "Player", "Most played with", "Nemesis", "Favourite
  opponent", ENDINGS' "Players", "Games", "Liberal wins", "Win rate", "Smoothed" and "Players",
  "Games", "Average length", "Average rounds"; Players of the month's new heads are "Month" and
  "Wins". A word may be shortened only by Task 5, Step 4's rule, and the pull request lists any
  change.
- **Screenshots:** against `bigStatsData()` with the clock an hour after its last game, at 1600x900
  (`desktop`) and 412x915 (`phone-412`): ROLES & CARDS' Role split card (all three side heads),
  RIVALS' People card, RECORDS' Players of the month card and ENDINGS' two table cards. The "after"
  shots show each table in its opening order, so the only change is the heads.
- **The pull request's title:** `feat(frontend): sort the stats pages' other tables by any column`.

## Global Constraints

- **The rules (spec, "The rules"), exactly:** a press on another head sorts in that column's first
  direction; a press on the sorted head turns it round. A column sorts by the figure its cell shows,
  never a split cell's count. A missing value ("—", a cell the row lacks, no one in a People cell)
  goes below every value either way. Ties keep the table's own order whichever way the sort runs. A
  table opens in its own order with its opening column's head marked.
- **Opening columns:** the split tables and People by Player, A to Z; Players of the month by
  Month, latest first; ENDINGS' two tables by Players, 5 first. Game length's All row is never
  sorted and is always its last row.
- **Heads (spec, "The heads"), through 27A's `SortHead`:** a side's head keeps its colour, sorted,
  hovered or not; the RIVALS matrices (`tabs/PlayerMatrix.tsx`) get no head buttons.
- **The sort is each table's React state**, never the address, never stored.
- **Fit:** `checkStatsPage` passes at every `statsSizesFor` size in `desktop`, `firefox`,
  `phone-360` and `phone-412`, and ENDINGS' two tables stay whole in their cards at `DESKTOP_SIZES`
  (`stats-rivals.spec.ts`), checked in Playwright's Linux image too (CI's fonts). No name link
  inside a button.
- **Never touch:** 27A's files (`sorting.ts`, `SortHead.tsx`, `SortHead.css`, `RankedTable.*`,
  `tabs/PowerRanking.*`, `players/`) and its tables in `tabs/RecordsTab.tsx` (`PeriodTable`,
  Current streaks), `tabs/PlayerMatrix.tsx`, Trophy holders, `games/`, `players/PlayerPage.tsx`,
  `backend/` and `docs/superpowers/specs/`. 27A's cases in `e2e/stats-sort.spec.ts` stay as they
  are; this phase adds its own. A change one of them seems to need: stop and ask.
- **ES2020** in code and tests; no `e2e/` file imports `src/constants` or anything that does
  (`e2e/stats.ts` builds paths with `routePath`).
- **Environment:** `export JAVA_HOME=<java-17-home>` (any installed Java 17, `ls
  ~/.sdkman/candidates/java`) for every `npm run e2e` run; `cd frontend && npm ci` once in the
  worktree; every browser run, and the jar the Linux image tests, on one `E2E_PORT` from 4546 to
  4999 that `lsof -nP -iTCP:<port> -sTCP:LISTEN` shows free (call it `<port>` below). Git as `git -C
  <worktree> …`, one command per call. Scratch files (the PR body) in the session scratchpad.
- **Flakes:** a failure in a test this phase cannot reach is checked on `development` before it is
  called a flake (`.claude/skills/implement-issue/SKILL.md`, step 5).
- **Branch and commits:** worktree and branch `phase-27b-other-tables`, made off `origin/development`
  after 27A's merge. Conventional Commits with a scope (`frontend`, `docs`, `claude`, `readme`,
  `plan`), each test in the commit with its code, files staged by name
  (`frontend/e2e/pr-shots.spec.ts` stays untracked until Task 6 deletes it). A box of Phase 27B in
  `docs/PLAN.md` is ticked in the commit that finishes its work.
- **Public repo:** nothing about the home server in code, docs, commits or the pull request.

## Review Focus

1. **A "—" with a figure behind it** (or a figure with null): a caller's slip that sorts a dash
   among the numbers, or a number below them. Task 2 (`everyDashSortsLast` in the ROLES & CARDS,
   VOTES & POWERS and ACTIVITY tab tests, through `testSplitTables.ts`'s `dashesBeforeFigures`).
2. **A cell with two figures sorted by the wrong one:** "2 of 5" by its 5, "2 L · 3 F" by its
   Fascists or its total. Task 2 (`vetoesSortByTheAccepted`, `policiesEnactedSortByTheirLiberals`).
3. **A decision time across the minute:** "59.9 s" below "1 min 00 s", and two times that both show
   "1 min 05 s" a tie. Task 2 (`averageTimeTenthsIsWhatFormatAverageTimeShows`).
4. **The All row under a sort:** it never moves among the sizes or leaves the table, under any
   column, either way. Task 4 (`theAllRowStaysLastEitherWay`).
5. **A card that empties and comes back** (a filter that counts no game, then one that does) opens
   in its own order, not the sort it had. Task 4 (`aTableThatEmptiesOpensAgainInItsOwnOrder`) and
   Task 3 (`theMonthsOpenAgainLatestFirst`).

---

### Task 1: Start check and the "before" screenshots

**Files:**
- Modify: `docs/PLAN.md` (the Progress table: 27A "done", 27B "in progress")
- Create (never committed): `frontend/e2e/pr-shots.spec.ts`
- Create: `docs/pr/phase-27b-other-tables/before-{role-split,people,months,win-rate,length}-{1600x900,412x915}.png`

**Interfaces:**
- Consumes: nothing yet; Step 2 checks 27A's Interfaces are there as its plan names them.

- [ ] **Step 1: Make the worktree.** `git fetch origin`. 27A's pull request has merged (`gh pr list
  --repo jussaw/Secret-Hitler-Online --state merged --head phase-27a-sortable-tables` lists it); if
  not, stop and ask. Make the worktree and branch as `.claude/skills/implement-issue/SKILL.md`, step
  2, says: `git -C <parent> worktree add <parent>/.claude/worktrees/phase-27b-other-tables -b
  phase-27b-other-tables origin/development` (the parent is the session's own worktree when it runs
  inside `.claude/worktrees/`, else the main checkout), call EnterWorktree with that path, then `cd
  frontend && npm ci`.
- [ ] **Step 2: Check the start.** On the new branch: `frontend/src/stats/sorting.ts` exports
  `SortDirection`, `SortValue`, `SortColumn`, `TableSort`, `NAME_ORDER`, `RANK_ORDER`, `nextSort` and
  `sortRows`, and `SortHead.tsx` exports `HeadColumn`, `SortHead`, `SortHeadRow`, `useTableSort`,
  `rankColumn` and `playerColumn`, each with the signature 27A's plan gives; `SortHead.css` styles
  `.stats-sort`, `.is-sorted`, `.is-end` and `.stats-sort-arrow`; `numbers.ts` exports
  `wholePercent`; `frontend/e2e/stats-sort.spec.ts` exists; `docs/PLAN.md` ticks 27A's "PR merged
  into `development`"; this plan is on the branch. `SplitTable`, `PeopleTable`, the Players of the
  month card and ENDINGS' two tables still do not sort. If anything is missing or differs, stop and
  ask.
- [ ] **Step 3: Write `frontend/e2e/pr-shots.spec.ts`**, as 27A's was: `test.skip(!process.env.PR_SHOTS)`
  and `const PREFIX = "before"`; one test, in `desktop` at 1600x900 and `phone-412` at 412x915
  (`test.info().project.name`; skip other projects); `stubStats(page, bigStatsData())`,
  `page.clock.setFixedTime` an hour after the latest `endedAt`, paths by `routePath`, then element
  screenshots, each after `settle`: `/stats/roles`'s region "Role split" (`role-split`),
  `/stats/rivals`'s region "People" (`people`), `/stats/records`'s
  `[data-card="players-of-the-month"]` (`months`) and `/stats/endings`'s regions "Liberal win rate
  by player count" (`win-rate`) and "Game length" (`length`), every region by its exact name (each
  card holds a region "… table" too), saved to this worktree's
  `docs/pr/phase-27b-other-tables/${PREFIX}-<name>-${W}x${H}.png` (an absolute path).
- [ ] **Step 4: Take the shots** before any code changes: `cd frontend && PR_SHOTS=1
  E2E_PORT=<port> npx playwright test e2e/pr-shots.spec.ts --project=desktop --project=phone-412`.
  Expected: 2 passed, ten PNGs.
- [ ] **Step 5: Commit** `docs(plan): start phase 27b` (the Progress table), then `docs(docs): add
  phase 27b's before screenshots` (the ten PNGs only).

---

### Task 2: `SplitTable` sorts, on all 14 cards

**Files:**
- Modify: `frontend/src/stats/SplitTable.tsx`, `SplitTable.css`, `SplitTable.test.tsx`;
  `frontend/src/stats/ScrollRegion.css` (the focus rule); `frontend/src/stats/timing.ts`,
  `timing.test.ts` (`averageTimeTenths`); `frontend/src/stats/tabs/cellText.ts`, `cellText.test.ts`
  (`rateFigure`); `tabs/RolesTab.tsx` (`rateCell`, `countCell`, the cells built in `rolesCards`,
  `handsCard` and `chancellorCards`), `tabs/VotesTab.tsx` (`rateCell`, `countCell`, `vetoCell`),
  `tabs/ActivityTab.tsx` (`decisionRows`), and those three tabs' tests
- Create: `frontend/src/stats/testSplitTables.ts` (test support)

**Interfaces:**
- Consumes: 27A's `HeadColumn`, `SortHeadRow`, `useTableSort`, `playerColumn` (`SortHead.tsx`),
  `NAME_ORDER`, `SortValue` (`sorting.ts`) and `wholePercent` (`numbers.ts`).
- Produces:
  ```ts
  // SplitTable.tsx
  export interface SplitCell {
    text: string;          // "60%", "2 of 5", "4.2 s", or "—"
    value: number | null;  // the figure the text shows (the one it leads with), which its column
                           // sorts by; null exactly when the text is "—"
    count?: number;        // beside the text, a 0 too; never sorted by
  }
  export interface SplitColumn { key: string; label: string }   // unchanged; never keyed "name"
  export interface SplitTableProps { title: string; columns: SplitColumn[];
    rows: { player: number; cells: Record<string, SplitCell> }[]; names: Map<number, string> } // unchanged; rows in any order
  // timing.ts: the tenths of a second formatAverageTime(ms) shows: max(1, round(ms / 100)) below
  // 600, else 10 × max(1, round(ms / 1000)) (whole seconds from a minute). formatAverageTime uses it.
  export function averageTimeTenths(ms: number): number;
  // tabs/cellText.ts: the figure rateText(value) shows: wholePercent(value), null for null.
  export function rateFigure(value: number | null): number | null;
  // testSplitTables.ts: presses every head but Player of every table.split-table in `container`
  // twice; after each press, each "—" in that column above a figure is a `misplaced` line
  // ("<region> <head> <direction>: row N"); `checked` counts the dashes met.
  export function dashesBeforeFigures(container: HTMLElement): { checked: number; misplaced: string[] };
  ```
  `SplitTable`'s columns, in order: `playerColumn((row) => nameOf(names, row.player), "split-name")`,
  then per `SplitColumn` `{ key, label, className: HEAD_CLASS[key], end: true, first: "descending",
  value: (row) => <its own cell>?.value ?? null }` (a cell the row lacks is missing). It opens at
  `NAME_ORDER`, its name-ordered rows and its columns memoized on their props (`useMemo`).

- [ ] **Step 1: Write the failing tests.** In `SplitTable.test.tsx`, the fixtures gain values
  (`full`: `60`, `null`, `0`; `{ text: "3" }` becomes `{ text: "3", value: 3 }`), its helper reads
  body rows only, and every existing case stays. New:
  ```ts
  it("opensInNameOrderWithPlayerMarked")      // rows ann, Cy, WWWWWWWWWW01; only Player's columnheader has aria-sort="ascending"
  it("aSideHeadSortsMostFirstThenTurnsRound") // click "Liberal": aria-sort descending there, rows by value; again: ascending
  it("sortsByTheValueNeverTheCount")          // { 60%, value 60, count 2 } and { 40%, value 40, count 9 }: Liberal descending puts 60 first, ascending 40
  it("missingCellsGoLastEitherWay")           // a "—" cell (null) and a row lacking the cell: both last, in name order, at descending and at ascending
  it("tiesKeepNameOrderEitherWay")            // equal values: ann, Cy, WWWWWWWWWW01 at descending and at ascending
  it("zeroIsAValue")                          // values 0, null, 2: ascending gives 0, 2, then the dash
  it("sideHeadsKeepTheirClassSorted")         // after a press on Hitler: its th still has split-hitler and aria-sort descending; its button has stats-sort, is-sorted and is-end
  it("aColumnKeyedNameIsRefused")             // rendering a column { key: "name" } throws 'A split column cannot be keyed "name"'
  ```
  In `timing.test.ts`:
  ```ts
  it("averageTimeTenthsIsWhatFormatAverageTimeShows") // 4240 → 42, 950 → 10, 0 → 1, 59_940 → 599, 59_960 → 600, 64_600 and 65_400 → 650 (both "1 min 05 s"); over ms 0 to 200_000 in steps of 50 the tenths never fall, and two neighbours' tenths are equal exactly when their texts are
  ```
  In `cellText.test.ts`: `rateFigure(0.625)` is 63, `rateFigure(0)` is 0, `rateFigure(null)` is null.
  In `tabs/RolesTab.test.tsx` (`ROLE_STATS` and `CARD_STATS` are what the mocked `computeRoles` and
  `computeCards` return for every existing case, so leave them as they are: each new case gives its
  own copy with the numbers it needs through its own `mockReturnValue`):
  ```ts
  it("policiesEnactedSortByTheirLiberals")    // "1 L · 4 F" and "2 L · 0 F": a press on Liberal puts "2 L · 0 F" first
  it("handsDrawnSortsByItsTotal")             // a press on Hands puts the most hands first; on FFF, the higher whole percent first
  it("aSizeWithNoGameIsMissing")              // Win rate by player count, a press on "5": 63% above 60%, the row with no 5-seat game last both ways
  it("everyDashSortsLast")                    // dashesBeforeFigures(container): misplaced [], checked > 0
  ```
  In `tabs/VotesTab.test.tsx`: `vetoesSortByTheAccepted` (VETOES AS PRESIDENT: "2 of 2" above "1 of
  4" at descending) and `everyDashSortsLast` (on the JA RATE case's games). In
  `tabs/ActivityTab.test.tsx`: `decisionTimesSortByTheShownTime` (Vote at descending: the slower
  average first, "—" last both ways) and `everyDashSortsLast` (on `belowTheMinimumShowsADash`'s
  game together with `NIGHTS`).
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/stats/SplitTable.test.tsx src/stats/timing.test.ts
  src/stats/tabs/cellText.test.ts src/stats/tabs/RolesTab.test.tsx src/stats/tabs/VotesTab.test.tsx
  src/stats/tabs/ActivityTab.test.tsx`. Expected: FAIL (no sort heads, `averageTimeTenths`,
  `rateFigure` and `testSplitTables.ts` missing).
- [ ] **Step 3: Implement `SplitTable`, the helpers and the CSS** as in Interfaces and Decisions:
  `SplitTable` renders `SortHeadRow` and the rows from `useTableSort`, its body as today;
  `SplitTable.css` takes the coloured-head rules and loses the `th`'s underline; `ScrollRegion.css`
  takes the focus rule; `formatAverageTime` uses `averageTimeTenths`; `rateFigure` sits under
  `rateText`, the file's comment saying it holds what RIVALS', ENDINGS' and the split tables' cells
  show.
- [ ] **Step 4: Give every cell its figure, exactly from this table.** % is `rateFigure(rate.value)`
  (null exactly when the text is "—"); n is the count itself (0 too).

  | Tab | Card | Heads after Player | Text | `value` |
  |---|---|---|---|---|
  | ROLES & CARDS | Role split | Liberal, Fascist, Hitler | `60%` (count: games as the role) | % |
  | ROLES & CARDS | Win rate by player count | 5, 6, 7, 8, 9, 10 | `rateCell`; a size with no game: no cell | % |
  | ROLES & CARDS | Hands drawn | FFF, FFL, FLL, LLL | `60%` (count: those hands) | % (of the one `rate(…)` its text shows) |
  | ROLES & CARDS | Hands drawn | Hands | `countCell(drawn)` | n |
  | ROLES & CARDS | Given one of each | Liberal, Fascist, Hitler | `rateCell`; no chance: no cell | % |
  | ROLES & CARDS | Policies enacted | Liberal, Fascist, Hitler | `2 L · 3 F`; none: no cell | `L` |
  | ROLES & CARDS | Vetoes asked for | Vetoes, FF, FL, LL | `countCell` | n |
  | ROLES & CARDS | Forced Fascists | FFF as president, FF as chancellor | `countCell` | n |
  | VOTES & POWERS | PICKING A TEAMMATE, EXECUTION TARGETS | Liberal, Fascist side | `rateCell` | % |
  | VOTES & POWERS | JA RATE, SURVIVAL | Liberal, Fascist, Hitler | `rateCell` | % |
  | VOTES & POWERS | TIMES INVESTIGATED | Liberal, Fascist, Hitler | `countCell` | n |
  | VOTES & POWERS | VETOES AS PRESIDENT | Liberal, Fascist, Hitler | `vetoCell`: `2 of 5` | `accepted` (`0 of 0` is 0) |
  | ACTIVITY | Decision times | Nominate, Vote, Discard, Chancellor, Power, End term | `formatAverageTime(ms)` or "—" (count: timed decisions) | `averageTimeTenths(ms)`; null for "—" |

  `RolesTab`'s `rateCell` and `countCell` and `VotesTab`'s `rateCell`, `countCell` and `vetoCell`
  give the value; the cells built in place (Role split, Hands drawn's four, Policies enacted,
  Decision times) give it there.
- [ ] **Step 5: Run** `npx vitest run src/stats` (with `nameLinks.test.tsx`). Expected: PASS, and
  `npx tsc --noEmit -p .` clean.
- [ ] **Step 6: Commit** `feat(frontend): sort the split tables by any column` (`SplitTable` and its
  callers in one commit, as neither builds without the other).

---

### Task 3: RIVALS' People and RECORDS' Players of the month

**Files:**
- Modify: `frontend/src/stats/tabs/RivalsTab.tsx` (`PeopleTable` only), `tabs/RivalsTab.test.tsx`;
  `tabs/RecordsTab.tsx` (the Players of the month card only), `tabs/RecordsTab.test.tsx`

**Interfaces:**
- Consumes: 27A's `HeadColumn`, `SortHeadRow`, `useTableSort`, `playerColumn` (`SortHead.tsx`),
  `NAME_ORDER` and `TableSort` (`sorting.ts`).
- Produces: no new export. `PeopleTable`'s rows are `rivals.players` (already in name order, by
  `compareNames`, then number), its columns `HeadColumn<number, "name" | "most" | "nemesis" |
  "favourite">`: `playerColumn((p) => nameOf(names, p), "rivals-people-name")`, then Most played with
  (`"most"`, `first: "descending"`, `mostPlayedWith?.games ?? null`), Nemesis (`"nemesis"`,
  `nemesis?.losses ?? null`) and Favourite opponent (`"favourite"`, `favouriteOpponent?.wins ??
  null`); it opens at `NAME_ORDER`. A private `MonthsTable(props: { months: MonthHolder[]; names:
  Map<number, string>; holders: (players: number[]) => number[] })` (`holders` is the tab's
  `inTitleOrder`) draws today's rows under `SortHeadRow`, its columns `HeadColumn<MonthHolder,
  "month" | "wins">`: Month (`"month"`, `className: "ranked-name"`, `first: "descending"`,
  `Number(holder.key.replace("-", ""))`, so "2026-10" is 202610) and Wins (`"wins"`, `className:
  "ranked-value"`, `end`, `first: "descending"`, `holder.wins`); it opens at `MONTH_ORDER`. The
  month's holders stay under it in every order.

- [ ] **Step 1: Write the failing tests.** In `RivalsTab.test.tsx`, on `statsOf(GAMES, true)` (Ann:
  Cy 6 games, lost 2, won 3; Bo: Ann 5 games, —, —; Cy: Ann 6 games, lost 3, won 2):
  ```ts
  it("thePeopleOpenInNameOrderWithPlayerMarked") // rows Ann, Bo, Cy; only Player's columnheader has aria-sort="ascending"
  it("thePeopleSortByTheirCounts")               // Most played with: Ann, Cy, Bo, then Bo, Ann, Cy (the 6s in name order both ways); Nemesis: Cy, Ann, Bo, then Ann, Cy, Bo (Bo's "—" last both ways); Favourite opponent: Ann, Cy, Bo
  it("theMatricesHaveNoSortHeads")               // the Teammates, Opponents and Who trusts whom tables hold no .stats-sort and no th[aria-sort]
  ```
  In `RecordsTab.test.tsx`:
  ```ts
  it("theMonthsHaveHeadsAndOpenLatestFirst")  // columnheaders "Month", "Wins"; Month's aria-sort descending; rowsOf("players-of-the-month") as today
  it("theMonthsSortByWinsWithTheirHolders")   // MONTHS plus two more August wins for Ann (played("aug2", "2026-08-11T20:00:00Z", [2]) and "aug3" on the 12th): a press on Wins puts August (Ann, 3 wins) above October (Cy, 2 wins), each month's holders under it; Month then gives October first again; Month again, August first
  it("theMonthsOpenAgainLatestFirst")         // sorted by Wins, rerendered with no counted games (the card says NO_GAMES), then with the games: Month descending again, rows as today
  ```
- [ ] **Step 2: Run** `npx vitest run src/stats/tabs/RivalsTab.test.tsx src/stats/tabs/RecordsTab.test.tsx`.
  Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces: `SortHeadRow` replaces People's head row and adds
  Players of the month's, and the rows come from `useTableSort`; the cells are drawn as today.
- [ ] **Step 4: Run** `npx vitest run src/stats`. Expected: PASS, and `npx tsc --noEmit -p .` clean.
- [ ] **Step 5: Commit** `feat(frontend): sort RIVALS' people and the players of the month`.

---

### Task 4: ENDINGS' two tables

**Files:**
- Modify: `frontend/src/stats/tabs/EndingsTab.tsx`, `tabs/EndingsTab.test.tsx`;
  `frontend/src/stats/format.ts`, `format.test.ts` (`wholeMinutes`)

**Interfaces:**
- Consumes: 27A's `HeadColumn`, `SortHeadRow`, `useTableSort` (`SortHead.tsx`) and `TableSort`
  (`sorting.ts`); Task 2's `rateFigure`.
- Produces, in `format.ts`: `export function wholeMinutes(ms: number): number`
  (`Math.round(ms / 60_000)`), which `formatDuration` uses. In `EndingsTab.tsx`, no new export:
  `WinRateTable({ sizes }: { sizes: SizeEndings[] })` and `LengthTable({ sizes, all }: { sizes:
  SizeEndings[]; all: LengthStats })`, each opening at `SEATS_ORDER`, with these columns (none
  `end`):

  | Table | Head | Key | First | Sort figure |
  |---|---|---|---|---|
  | both | Players | `seats` | ascending | `size.seats` |
  | Liberal win rate | Games | `games` | descending | `size.games` |
  | Liberal win rate | Liberal wins | `liberalWins` | descending | `size.liberalWins` |
  | Liberal win rate | Win rate | `rate` | descending | `rateFigure(size.liberalRate.value)` |
  | Liberal win rate | Smoothed | `smoothed` | descending | `wholePercent(size.smoothedLiberalRate)` |
  | Game length | Games | `games` | descending | `size.length.games` |
  | Game length | Average length | `length` | descending | `wholeMinutes(averageMs)`, null for null |
  | Game length | Average rounds | `rounds` | descending | `Number(averageRounds.toFixed(1))`, null for null |

  `LengthTable` draws its sorted size rows, then the All row (`all`), outside the sort.

- [ ] **Step 1: Write the failing tests.** In `format.test.ts`: `wholeMinutes(89_999)` is 1,
  `wholeMinutes(90_000)` is 2, and `formatDuration` still gives "2 min" for 90 000 and "1 h 05 min"
  for 3 900 000. In `EndingsTab.test.tsx`:
  ```ts
  it("bothTablesOpenFiveFirstWithPlayersMarked")  // the two existing cases' rows unchanged; in each table only Players' columnheader has aria-sort="ascending"
  it("theWinRateTableSortsByItsShownFigures")     // the raw-and-smoothed fixture: Win rate puts 6 (40%) above 5 (—) both ways; Smoothed puts 5 (54%) first; then Players: 5, 6, aria-sort ascending; Players again: 6, 5
  it("theAllRowStaysLastEitherWay")               // the length fixture: Average length gives 8, 5, 9 (—), All; again 5, 8, 9, All; Average rounds 8, 5, 9, All; Games 5, 8, 9 (0), All, and ascending 9, 8, 5, All
  it("aTableThatEmptiesOpensAgainInItsOwnOrder")  // Game length sorted by Average length, rerendered with statsOf([]) (NO_GAMES), then with the games: Players order, Players' aria-sort ascending
  ```
- [ ] **Step 2: Run** `npx vitest run src/stats/format.test.ts src/stats/tabs/EndingsTab.test.tsx`.
  Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces: the two `ScrollRegion`s hold `WinRateTable` and
  `LengthTable`, each with `SortHeadRow` and the rows from `useTableSort`; `LengthCells` and the
  `endings-all` row stay as they are.
- [ ] **Step 4: Run** `npx vitest run src/stats`. Expected: PASS, and `npx tsc --noEmit -p .` clean.
- [ ] **Step 5: Commit** `feat(frontend): sort ENDINGS' tables, the All row last`.

---

### Task 5: In the browser, at every size

**Files:**
- Modify: `frontend/e2e/stats-sort.spec.ts` (new cases only)
- Modify (only by Step 4's rule): a table's head words in Tasks 2 to 4's files

**Interfaces:**
- Consumes: 27A's `.stats-sort` and its heads' `aria-sort`; `e2e/stats.ts` (`stubStats`,
  `bigStatsData`, `checkStatsPage`, `statsSizesFor`) and `e2e/lobby.ts` (`settle`), as 27A's cases
  use them.

- [ ] **Step 1: Add the cases** to `stats-sort.spec.ts` (all four projects run it), against
  `stubStats(page, bigStatsData())` with the clock an hour after its last game, heads pressed as
  27A's cases press them; "in order" compares the figures parsed from the cells' text, with every
  "—" after every figure:
  - `a split table's heads sort it, its dashes last`: ROLES & CARDS' region "Role split table":
    Player's `aria-sort` is ascending; a press on "Liberal" makes Liberal's descending (Player's
    gone) and its `.split-text` percents non-increasing; a second, ascending and non-decreasing,
    the dashes still last; a press on "Player" gives back the first order.
  - `a side's head keeps its colour`: in the same table, Liberal's and Hitler's buttons have their
    `th`'s computed `color` before a press, sorted, and (`desktop` and `firefox`) hovered; Hitler's
    button's `textDecorationLine` is `underline`.
  - `a held head's focus ring stays inside its region` (`desktop` and `firefox`): focus the "Role
    split table" region, press Tab: Player's button matches `:focus-visible` and its computed
    `outlineOffset` is `-2px`.
  - `the People table sorts by its counts`: RIVALS' region "People table": a press on "Nemesis"
    gives the cells' `lost N` non-increasing, every "—" last; a second, non-decreasing, "—" last.
  - `the players of the month sort by wins and by month`: RECORDS'
    `[data-card="players-of-the-month"]`: Month's `aria-sort` is descending; a press on "Wins" gives
    `.ranked-value` wins non-increasing; "Month" then gives the first order back, and again its
    reverse.
  - `ENDINGS' tables sort, the All row last`: "Game length table": a press on "Average length"
    gives the size rows' minutes (`38 min` is 38, `1 h 15 min` is 75) non-increasing and the last
    row's header "All"; a second, non-decreasing, "All" last; "Liberal win rate by player count
    table": a press on "Win rate" gives percents non-increasing, "—" last.
  - `the other sorted tables still fit` (`phone-360` at 320x568): Role split sorted by Liberal,
    People by Nemesis, Players of the month by Wins and Game length by Average length, then
    `checkStatsPage` on each tab. (The tabs' own specs already run `checkStatsPage` on every tab at
    every size, and `stats-rivals.spec.ts` ENDINGS' whole check, so the new heads' fit and 44px
    targets are checked there.)
- [ ] **Step 2: Run** `cd frontend && E2E_PORT=<port> npm run e2e -- --project=desktop
  --project=phone-360 --project=phone-412`. Expected: PASS, every `stats-*.spec` included.
- [ ] **Step 3: Run Linux's fonts and Firefox.** Serve the jar on the host with
  `TEST_SIGN_IN=true` and run `--config playwright.linux.config.ts` for `firefox`, `phone-360` and
  `phone-412` in the Playwright image (`DEVELOPMENT.md`, "Browser tests on Linux", with
  `E2E_PORT=<port>`). Expected: PASS.
- [ ] **Step 4: Only if a table fails to fit** in either run (a `checkStatsPage` problem inside one
  of this phase's tables, or ENDINGS' whole check at a `DESKTOP_SIZES` size): shorten that table's
  widest head to a shorter true word (list each change for the pull request) and run both again. If
  it still fails, stop and report the table, the size, and its needed and available widths in px.
- [ ] **Step 5: Commit** `test(frontend): check the other sortable tables in the browser`.

---

### Task 6: Docs, review, the "after" shots and the pull request

**Files:**
- Modify: `CLAUDE.md`, `docs/PLAN.md`, and `README.md` only if Step 2 finds it stale
- Create: `docs/pr/phase-27b-other-tables/after-*.png`
- Delete: `frontend/e2e/pr-shots.spec.ts`

- [ ] **Step 1: `CLAUDE.md`.** Under `frontend/` (the stats engine and the tabs): `SplitTable`'s
  sort (heads Player and each column, most first, opening at `NAME_ORDER`, a side's head keeping
  its colour and Hitler's underline on its button, a column keyed `name` refused), `SplitCell.value`
  (the figure its text shows, the leading one of two; null for "—"; never the count);
  `averageTimeTenths`, `wholeMinutes` and `rateFigure`; `ScrollRegion.css`'s inset focus ring;
  People's sort (its counts, most first, "—" last); Players of the month's head row (Month, latest
  first, and Wins; `MonthsTable`); ENDINGS' tables' sort (`WinRateTable`, `LengthTable`,
  `SEATS_ORDER`, Players' first press 5 first, the All row last); the RIVALS matrices still
  unsorted; the new `stats-sort.spec.ts` cases. Fix every sentence the phase made stale (search
  for "players down by name", "always by name", "Shown sorted by name", "plain heads", "no head
  row", `SplitCell`).
- [ ] **Step 2: `README.md`.** Read the stats line 27A wrote. If it says, or reads as, only some
  tables sorting, make it every table but the RIVALS matrices, GAMES and a player's page;
  otherwise leave the file alone.
- [ ] **Step 3: `docs/PLAN.md`.** Tick Phase 27B's boxes whose work is done.
- [ ] **Step 4: Review.** Run the `code-review` skill against `origin/development` with the spec and
  this plan as the spec. Fix every finding, Minor ones included, or write down why it needs no
  change; re-run the tests the fixes touch.
- [ ] **Step 5: The "after" shots.** Set `PREFIX = "after"` in `pr-shots.spec.ts`, run it as in
  Task 1, Step 4, then delete the spec. Expected: ten PNGs, each table in its opening order with
  its new heads.
- [ ] **Step 6: Verify.** `cd frontend && npm test -- --run && npm run build`; `cd backend &&
  ./gradlew test` (nothing there changed, but CI runs it). Keep the counts.
- [ ] **Step 7: Commit and push.** `docs(claude): describe the other sortable tables`,
  `docs(readme): say every stats table sorts` (only if Step 2 changed it), `docs(plan): tick phase
  27b`, `docs(docs): add phase 27b's after screenshots`; then `git push -u origin
  phase-27b-other-tables`.
- [ ] **Step 8: Open the pull request** (`--repo jussaw/Secret-Hitler-Online`, base `development`)
  with the title from Decisions and a body in `implement-issue`'s order (Before and after, a row
  per shot and size, linked by raw URL pinned to the pushed head; Changes; Decisions, Players'
  first press and any head word Task 5 shortened among them; Review; Tests with the counts; Docs),
  ending `Closes #109`.
- [ ] **Step 9: CI.** Watch it as `implement-issue`, step 9, says, to green. Do not merge: the user
  says when, in chat.
- [ ] **Step 10: Merge, on the user's yes in chat.** Tick "PR merged into `development`, closing
  issue #109" and set 27B's Progress row to "done" (`docs(plan): mark phase 27b merged`), push, let
  CI go green again, then merge and check the image as `implement-issue`, step 9, says (`gh pr merge
  --squash --admin --match-head-commit`), and check `gh issue view 109 --repo
  jussaw/Secret-Hitler-Online --json state` reads `CLOSED`.
