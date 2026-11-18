# Phase 27A: Sortable ranked tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The 39 `RankedTable` cards, OVERVIEW's power ranking and RECORDS' two `PeriodTable`s sort
by any column as PLAYERS does, through one shared set of rules and heads that PLAYERS moves onto
too.

**Architecture:** A pure module (`stats/sorting.ts`) holds the rules: the press, missing values
last, ties in the table's own order. A head module (`stats/SortHead.tsx`, `SortHead.css`) holds
PLAYERS' head made shared, a head row, a hook that keeps a table's sort in its state, and the `#`
and Player columns every ranked table shares. Each table lists its columns and keeps drawing its own
rows. `RankedTable` gains a head row, and on 18 cards a count column.

**Tech Stack:** React 18, TypeScript 5, Vitest with Testing Library, Playwright (macOS and its Linux
image), Lucide (`lucide-react`, already a dependency). No new dependency.

**Spec:** [`docs/superpowers/specs/2026-11-18-sortable-tables-design.md`](../specs/2026-11-18-sortable-tables-design.md),
whose "The rules", "The heads", "Each table" (`RankedTable`, the power ranking, `PeriodTable`,
PLAYERS) and "Phasing" this phase builds. Phase 27A's section of [`docs/PLAN.md`](../../PLAN.md)
holds the boxes this plan ticks. Phase 27B
([`2026-11-18-phase-27b-other-tables.md`](2026-11-18-phase-27b-other-tables.md)) builds the rest
on this phase's Interfaces, so their names are fixed here.

## Decisions

The spec settles what players see; these settle what it leaves to the build.

- **Files:** `frontend/src/stats/sorting.ts` (pure, imports only `counting.ts`'s `compareNames`),
  `frontend/src/stats/SortHead.tsx` and `SortHead.css` (React and CSS), each with its tests beside
  it. `numbers.ts` gains `wholePercent`, which `formatPercent` uses, so what a percent sorts by and
  what it shows can never differ.
- **Ties are the rows' input order.** `sortRows` is a stable sort over the rows as given; each table
  gives its rows in its own order (`rankRows`' for `RankedTable` and `PeriodTable`,
  `computeOverview`'s for the power ranking). PLAYERS' `sortPlayers` puts its rows in name order
  first, so its existing tests (which pass rows in any order) still pass.
- **`RankedTable`'s props:** `valueHead`, `sortValue` and an optional `countHead` replace
  `countLabel` and `showCount`. The count shows as a bare number under its head. A card without a
  count column has three cells a row (no empty fourth).
- **The head words** are the table under Task 4, Step 3, copied exactly. A word may be shortened
  only by Task 6, Step 4's rule, and the pull request lists any change.
- **The head look** moves from `PowerRanking.css`'s `th` rules into `RankedTable.css` (every ranked
  table has a head row now), and from `PlayersPage.css`'s `.players-sort` rules into `SortHead.css`
  as `.stats-sort`, with selectors starting `.stats-screen thead .stats-sort`, so they still undo
  App.css's button look. PLAYERS' heads look the same before and after, which the screenshots show.
- **`#`'s button** shows `#` and has `aria-label="Rank"`, so its column head's accessible name is
  Rank.
- **Screenshots:** against `bigStatsData()` with the clock an hour after its last game, at 1600x900
  (`desktop`) and 412x915 (`phone-412`): OVERVIEW's Power ranking card, OVERVIEW's Headline grid,
  RECORDS' Most wins in a week card and PLAYERS' card. The "after" shots show each table in its
  opening order, so the only change is the heads.
- **The pull request's title:** `feat(frontend): sort the stats pages' ranked tables by any column`.

## Global Constraints

- **The rules (spec, "The rules"), exactly:** a press on another head sorts in that column's first
  direction (A to Z for words, most first for numbers, 1 first for `#`); a press on the sorted head
  turns it round. A column sorts by the figure its cell shows. A missing value (shown "—") goes below
  every value either way. Ties keep the table's own order whichever way the sort runs. A table opens
  in its own order with its opening column's head marked. Ranks never change.
- **Opening columns:** `RankedTable`, the power ranking and `PeriodTable` open sorted by `#`, 1
  first; PLAYERS by Player, A to Z, as now.
- **Heads (spec, "The heads"):** a `th scope="col"` holding a `button type="button"`; Lucide's
  `ArrowUp` (ascending) or `ArrowDown` (descending) on the sorted head, a dimmed `ArrowUpDown` on
  the others; the arrow before the words in a column whose values stand at the right, after them
  otherwise; `aria-sort` on the sorted head only; a 44px target wherever the stacked query matches;
  words that never wrap.
- **The sort is each table's React state**, never the address, never stored.
- **Fit:** `checkStatsPage` passes at every `statsSizesFor` size in `desktop`, `firefox`,
  `phone-360` and `phone-412`; a `RankedTable` never scrolls sideways at 320x568, checked in
  Playwright's Linux image too (CI's fonts). No name link inside a button.
- **Never touch:** `SplitTable.tsx` and its callers' cells, `tabs/PlayerMatrix.tsx`,
  `tabs/RivalsTab.tsx`, `tabs/EndingsTab.tsx`, the Players of the month and Trophy holders cards in
  `tabs/RecordsTab.tsx`, `games/`, `players/PlayerPage.tsx` (Phase 27B owns the first five; the rest
  do not sort), `backend/` and `docs/superpowers/specs/`. A change one of them seems to need: stop
  and ask.
- **ES2020** in code and tests; no `e2e/` file imports `src/constants` or anything that does
  (`e2e/stats.ts` builds paths with `routePath`).
- **Environment:** `export JAVA_HOME=<java-17-home>` (any installed Java 17, `ls
  ~/.sdkman/candidates/java`) for every `npm run e2e` run; `cd frontend && npm ci` once in the
  worktree; every browser run, and the jar the Linux image tests, on one `E2E_PORT` from 4546 to
  4999 that `lsof -nP -iTCP:<port> -sTCP:LISTEN` shows free (call it `<port>` below). Scratch files
  (the PR body) in the session scratchpad.
- **Flakes:** a failure in a test this phase cannot reach is checked on `development` before it is
  called a flake (`.claude/skills/implement-issue/SKILL.md`, step 5).
- **Branch and commits:** worktree and branch `phase-27a-sortable-tables`, which holds the spec,
  both phases' plans and their `docs/PLAN.md` sections. Conventional Commits with a scope
  (`frontend`, `docs`, `claude`, `readme`, `plan`), each test in the commit with its code, files
  staged by name (`frontend/e2e/pr-shots.spec.ts` stays untracked until Task 7 deletes it). A box of
  Phase 27A in `docs/PLAN.md` is ticked in the commit that finishes its work.
- **Public repo:** nothing about the home server in code, docs, commits or the pull request.

## Review Focus

1. **The rows change under a sort** (a filter chip or the CPU switch, which keep the tab mounted):
   the table keeps its column and direction, sorts the new rows, and a player who left the rows
   leaves no gap. Task 3 (`aSortSurvivesNewRows`).
2. **A turned-round sort with ties:** two players with the same games under games ascending keep
   their rank order, not the reverse of it. Task 2 (`tiesKeepTheInputOrderEitherWay`).
3. **Every row missing in the sorted column** (a card whose rows are all below its minimum, sorted
   by its value): the rows keep their own order and nothing throws. Task 2
   (`everyValueMissingKeepsTheInputOrder`) and Task 4 (`allUnrankedSortedByValue`).
4. **A count or value of 0** sorts as 0 among the numbers, never as missing. Task 2
   (`zeroIsAValueNotMissing`).
5. **The keyboard:** Enter or Space on a focused head sorts, and the focus stays on that head after
   the rows reorder. Task 3 (`theFocusStaysOnThePressedHead`).

---

### Task 1: Start check and the "before" screenshots

**Files:**
- Modify: `docs/PLAN.md` (the Progress row of 27A reads "in progress")
- Create (never committed): `frontend/e2e/pr-shots.spec.ts`
- Create: `docs/pr/phase-27a-sortable-tables/before-{power-ranking,headline,wins,players}-{1600x900,412x915}.png`

- [ ] **Step 1: Enter the worktree.** The branch `phase-27a-sortable-tables` is checked out in
  `<session worktree>/.claude/worktrees/phase-27a-sortable-tables`; call EnterWorktree with that
  path (or, if `git worktree list` shows the branch nowhere, make one as
  `.claude/skills/implement-issue/SKILL.md`, step 2, says, from `origin/phase-27a-sortable-tables`).
  The branch's docs (the spec, both plans, `docs/PLAN.md`) are committed and pushed; if `git status`
  shows anything uncommitted there, stop and ask. `git fetch origin` and `git rebase
  origin/development`, then `cd frontend && npm ci`.
- [ ] **Step 2: Check the start.** The branch has the spec, this plan, 27B's plan and Phase 27A's
  and 27B's sections in `docs/PLAN.md`. `frontend/src/stats/players/playersOrder.ts` exports
  `NAME_ORDER`, `pressHead`, `sortPlayers`, `PlayersColumn` and `PlayersSort`, and
  `players/PlayersPage.tsx` has a private `SortHead`. If any is missing, stop and ask.
- [ ] **Step 3: Write `frontend/e2e/pr-shots.spec.ts`.** It starts with
  `test.skip(!process.env.PR_SHOTS)` and `const PREFIX = "before"`. One test, in `desktop` at
  1600x900 and `phone-412` at 412x915 (`test.info().project.name`; skip other projects):
  `stubStats(page, bigStatsData())`, `page.clock.setFixedTime` an hour after the latest `endedAt`
  (as `stats-records.spec.ts`'s `open` does), then element screenshots, each after `settle`:
  `/stats`'s region "Power ranking" (`power-ranking`) and `.overview-headline` (`headline`),
  `/stats/records`'s `[data-card="most-wins-week"]` (`wins`) and `/players`'s region "Players"
  (`players`), every region by its exact name (`{ name, exact: true }`: a card holding a
  `ScrollRegion` also holds a region "… table"), saved to this worktree's
  `docs/pr/phase-27a-sortable-tables/${PREFIX}-<name>-${W}x${H}.png` (an absolute path).
- [ ] **Step 4: Take the shots** before any code changes: `cd frontend && PR_SHOTS=1
  E2E_PORT=<port> npx playwright test e2e/pr-shots.spec.ts --project=desktop --project=phone-412`.
  Expected: 2 passed, eight PNGs.
- [ ] **Step 5: Commit** `docs(plan): start phase 27a` (the Progress row), then `docs(docs): add
  phase 27a's before screenshots` (the eight PNGs only).

---

### Task 2: The rules

**Files:**
- Create: `frontend/src/stats/sorting.ts`, `frontend/src/stats/sorting.test.ts`
- Modify: `frontend/src/stats/numbers.ts` (`wholePercent`; `formatPercent` uses it),
  `frontend/src/stats/numbers.test.ts`

**Interfaces:**
- Consumes: `compareNames(a: string, b: string): number` from `counting.ts`.
- Produces, in `sorting.ts`:
  ```ts
  export type SortDirection = "ascending" | "descending";   // as aria-sort says it
  export type SortValue = number | string | null;           // null: missing, shown "—"
  export interface SortColumn<R, K extends string = string> {
    key: K;
    first: SortDirection;                // a first press's direction
    value: (row: R) => SortValue;        // the figure the cell shows; strings compare by compareNames
  }
  export interface TableSort<K extends string = string> {
    readonly column: K;
    readonly direction: SortDirection;
  }
  export const NAME_ORDER: TableSort<"name">;   // frozen { column: "name", direction: "ascending" }
  export const RANK_ORDER: TableSort<"rank">;   // frozen { column: "rank", direction: "ascending" }
  export function nextSort<K extends string>(sort: TableSort<K>, column: { key: K; first: SortDirection }): TableSort<K>;
  export function sortRows<R, K extends string>(rows: readonly R[], columns: readonly SortColumn<R, K>[], sort: TableSort<K>): R[];
  ```
  `sortRows` returns a new array, throws `Error(\`No column "${key}"\`)` for a key no column has,
  and is stable: equal values, and the missing ones, keep the input order in both directions.
- Produces, in `numbers.ts`: `export function wholePercent(value: number): number` (`Math.round(value
  * 100)`), which `formatPercent` uses.

- [ ] **Step 1: Write the failing tests** in `sorting.test.ts`, over rows `{ id, name, games,
  rate }` with a name column (`first: "ascending"`, value the name) and number columns
  (`first: "descending"`):
  ```ts
  it("aPressOnAnotherHeadUsesItsFirstDirection")  // nextSort(NAME_ORDER, {key:"games", first:"descending"}) → games descending; on {key:"name", first:"ascending"} from games → name ascending
  it("aPressOnTheSortedHeadTurnsItRound")         // twice gives back the first; RANK_ORDER and NAME_ORDER are frozen
  it("numbersSortEitherWay")                      // games [3, 9, 5] → 9, 5, 3 descending; 3, 5, 9 ascending
  it("namesCompareIgnoringCase")                  // "bo", "Ann", "cy", "ann" ascending → Ann, ann, bo, cy (the Anns tie: input order), descending → cy, bo, Ann, ann
  it("missingValuesGoLastEitherWay")              // rate [0.5, null, 0.7, null] → 0.7, 0.5, then the nulls in input order; ascending → 0.5, 0.7, then the nulls
  it("tiesKeepTheInputOrderEitherWay")            // games [5, 5, 3] (ids a, b, c): descending a, b, c; ascending c, a, b
  it("zeroIsAValueNotMissing")                    // games [0, null, 2] ascending → 0, 2, null
  it("everyValueMissingKeepsTheInputOrder")       // rate all null, both ways → the input order
  it("theOpeningSortGivesTheRowsBack")            // rows already in name order: sortRows(rows, columns, NAME_ORDER) equals rows (a new array)
  it("anUnknownColumnThrows")                     // sortRows(rows, columns, { column: "nope", direction: "ascending" }) throws 'No column "nope"'
  it("leavesItsInputAlone")                       // the input array is unchanged after a sort
  ```
  and in `numbers.test.ts`: `wholePercent(0.625)` is 63, `wholePercent(0.5249)` is 52, and
  `formatPercent(0.625)` is still "63%".
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/stats/sorting.test.ts src/stats/numbers.test.ts`.
  Expected: FAIL (`sorting.ts` and `wholePercent` missing).
- [ ] **Step 3: Implement** as in Interfaces, with comments in `playersOrder.ts`' style. Compare
  numbers numerically and strings with `compareNames`; flip only the comparison of two present
  values; break every tie by input index.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the stats tables' shared sort rules`.

---

### Task 3: The heads, and PLAYERS on them

**Files:**
- Create: `frontend/src/stats/SortHead.tsx`, `frontend/src/stats/SortHead.css`,
  `frontend/src/stats/SortHead.test.tsx`
- Modify: `frontend/src/stats/players/playersOrder.ts`, `frontend/src/stats/players/PlayersPage.tsx`,
  `frontend/src/stats/players/PlayersPage.css` (its `.players-sort` and `.players-sort-arrow` rules
  leave for `SortHead.css`)
- Test (unchanged, must pass): `players/playersOrder.test.ts`, `players/PlayersPage.test.tsx`

**Interfaces:**
- Consumes: Task 2's `SortColumn`, `TableSort`, `SortDirection`, `nextSort`, `sortRows`,
  `NAME_ORDER`, `RANK_ORDER`.
- Produces, in `SortHead.tsx`:
  ```ts
  export interface HeadColumn<R, K extends string = string> extends SortColumn<R, K> {
    label: string;       // the head's words, exactly
    className?: string;  // the th's class (the class its cells share)
    end?: boolean;       // values stand at the right: the arrow before the words, the content at the
                         // right of its 44px box
    name?: string;       // the button's aria-label, when the words are a sign ("Rank" for "#")
  }
  export function SortHead<K extends string>(props: { column: HeadColumn<never, K>; sort: TableSort<K>; onSort: (key: K) => void }): JSX.Element;
  export function SortHeadRow<K extends string>(props: { columns: readonly HeadColumn<never, K>[]; sort: TableSort<K>; onSort: (key: K) => void }): JSX.Element; // <thead><tr>{SortHead…}</tr></thead>
  export function useTableSort<R, K extends string>(rows: readonly R[], columns: readonly SortColumn<R, K>[], opening: TableSort<K>): { rows: R[]; sort: TableSort<K>; press: (key: K) => void };
  export function rankColumn<R>(rank: (row: R) => number | null): HeadColumn<R, "rank">;
      // label "#", name "Rank", className "ranked-rank", end, first "ascending"; null: unranked
  export function playerColumn<R>(name: (row: R) => string, className?: string): HeadColumn<R, "name">;
      // label "Player", className "ranked-name" unless given, first "ascending"
  ```
  (`HeadColumn<never, K>` lets a head take any table's column; the builder may pick another way to
  type it if the compiler wants one.) The button has class `stats-sort`, plus `is-sorted` on the
  sorted head and `is-end` for `end`; the arrow `stats-sort-arrow`. `useTableSort` keeps the sort in
  `useState(opening)` and memoizes `sortRows(rows, columns, sort)` on the three.
- `playersOrder.ts` keeps its exports with their signatures (`PlayersColumn`, `PlayersSort`,
  `SortDirection` re-exported from `sorting.ts`, `NAME_ORDER` re-exported, `pressHead(sort,
  column)`, `sortPlayers(rows, sort, timeZone?)`, `searchPlayers`, `noMatchLine`) and adds
  `playersColumns(timeZone: string): SortColumn<PlayerListRow, PlayersColumn>[]`, PLAYERS' five
  columns with today's sort keys. `pressHead` is `nextSort` with PLAYERS' first directions;
  `sortPlayers` is `sortRows` over the rows put in name order first (`compareNames`, then number).

- [ ] **Step 1: Write the failing tests** in `SortHead.test.tsx`, rendering a small table through
  `SortHeadRow` and `useTableSort` (a `Harness` component, rows of `{ player, name, games, rank }`,
  columns `rankColumn`, `playerColumn` and a Games column with `end`):
  ```ts
  it("opensInTheOpeningOrderWithItsHeadMarked")    // RANK_ORDER: rows by rank; only Rank's columnheader has aria-sort="ascending"
  it("aPressSortsAndASecondTurnsItRound")          // click "Games": descending, aria-sort moves; again: ascending
  it("arrowsShowTheSort")                           // the sorted head's svg is lucide-arrow-down then lucide-arrow-up; others lucide-arrow-up-down (classes Lucide gives)
  it("theRankHeadIsNamedRank")                      // getByRole("columnheader", { name: "Rank" }) holds a button whose text is "#"
  it("anEndColumnPutsItsArrowFirst")                // Games' button: svg before the text; Player's: text before the svg
  it("unrankedRowsStayLastUnderTheRankEitherWay")   // a rank null row is last at Rank ascending and descending
  it("aSortSurvivesNewRows")                        // Games descending, rerender with a row fewer and one new: still Games descending, the new rows in order
  it("theFocusStaysOnThePressedHead")               // Games' button .focus(), then fireEvent.click: sorted, document.activeElement is that button (the repo has no user-event; Task 6 presses Enter and Space for real)
  it("noLinkSitsInAHead")                           // container.querySelectorAll("th a, button a") is empty
  ```
- [ ] **Step 2: Run** `npx vitest run src/stats/SortHead.test.tsx`. Expected: FAIL (`SortHead.tsx`
  missing).
- [ ] **Step 3: Implement `SortHead.tsx` and `SortHead.css`.** `SortHead` is PLAYERS' `SortHead`
  taking a `HeadColumn` (its `arrowFirst` is `end`), adding `aria-label` from `name`. The words stay
  a bare text node beside the arrow, as in PLAYERS' head: a `span` round them would be a flex child
  with text that cannot shrink, which `stats-votes.spec.ts`, `stats-rivals.spec.ts`
  (`stuckChildren`) and `stats-engine.spec.ts` fail. `SortHead.css`
  is PLAYERS' `.players-sort` rules with `.stats-screen .players-table .players-sort` written
  `.stats-screen thead .stats-sort`, the arrow rules as `.stats-sort-arrow`, and the stacked query's
  44px box with `justify-content: flex-end` on `.stats-sort.is-end` (PLAYERS'
  `th.power-number .players-sort` rule). `SortHead.tsx` imports `./SortHead.css`.
- [ ] **Step 4: Move PLAYERS onto it.** `playersOrder.ts` as in Interfaces. `PlayersPage.tsx`
  deletes its `SortHead` and `Head`; its `HEADS` become `HeadColumn<PlayerListRow,
  PlayersColumn>[]` with today's words, classes and sides (`arrowFirst` → `end`), taking `first` and
  `value` from `playersColumns(zone)` by key; `PlayersList` renders `SortHeadRow` and keeps its
  sort with `useTableSort(rows, heads, NAME_ORDER)` (`computePlayersList`'s rows, already in name
  order), then searches the sorted rows as now. `PlayersPage.css` loses the moved rules and keeps the rest.
- [ ] **Step 5: Run** `npx vitest run src/stats`. Expected: PASS, with `playersOrder.test.ts` and
  `PlayersPage.test.tsx` unchanged.
- [ ] **Step 6: Commit** `feat(frontend): share PLAYERS' sortable heads with every stats table`.

---

### Task 4: `RankedTable` sorts, on all 39 cards

**Files:**
- Modify: `frontend/src/stats/RankedTable.tsx`, `RankedTable.css`, `RankedTable.test.tsx`;
  `tabs/OverviewTab.tsx` (its five headline cards), `tabs/ActivityTab.tsx` (Participation, The END
  TERM countdown, Dropped connections), `tabs/RolesTab.tsx` (`ranked` and `winAs`),
  `tabs/VotesTab.tsx` (`countTable`, `rateTable`, `investigationTable`), `tabs/VotesTab.css` (only
  if INVESTIGATIONS' 65% rule needs the head row), `tabs/RecordsTab.tsx` (Current streaks only);
  the tabs' tests that read a ranked card's text
- Test: `RankedTable.test.tsx`, `tabs/*.test.tsx`

**Interfaces:**
- Consumes: Task 3's `HeadColumn`, `SortHeadRow`, `useTableSort`, `rankColumn`, `playerColumn`;
  Task 2's `RANK_ORDER`, `wholePercent`.
- Produces:
  ```ts
  export interface RankedTableProps<T> {
    rows: Row<T>[];                          // in rankRows' order
    format: (value: T) => string;
    names: Map<number, string>;
    valueHead: string;                       // the value column's head
    sortValue: (value: T) => number | null;  // a ranked row's sort figure; an unranked row's is null
    countHead?: string;                      // the count column's head; no count column without it
    valueEnd?: boolean;                      // the value stands at the right (default true);
                                             // INVESTIGATIONS' left-aligned text passes false
  }
  ```
  Columns, in order: `rankColumn(row => row.rank)`; `playerColumn(row => nameOf(names, row.player))`;
  `{ key: "value", label: valueHead, className: "ranked-value", end: valueEnd, first: "descending" }`; and
  with `countHead`, `{ key: "count", label: countHead, className: "ranked-count", end, first:
  "descending", value: row.count }`. It opens at `RANK_ORDER`.

- [ ] **Step 1: Write the failing tests** in `RankedTable.test.tsx`, rewriting its helper to read
  body rows only (`tbody` rows' cells) and replacing `showCountAddsTheCount` and `countLabel`:
  ```ts
  it("headsNameEachColumn")                     // columnheaders: Rank ("#"), Player, valueHead, countHead
  it("withoutACountHeadThereAreThreeColumns")   // each body row has three cells
  it("aCountHeadShowsTheCountOnEveryRow")       // ranked and unranked rows: the bare count, "28"
  it("opensInRankOrder")                        // rows as rankRows gave them; Rank aria-sort ascending
  it("aSortKeepsEveryRowsRank")                 // click Player: names A to Z, each row's "N." unchanged
  it("unrankedRowsGoLastUnderTheValueEitherWay")// one below the minimum: last at value descending and ascending
  it("aNameSortMixesUnrankedRowsIn")            // the unranked "Bo" between "Ann" and "Cy"
  it("aCountSortCanPutUnrankedRowsFirst")       // count ascending: the unranked row (fewest games) first
  it("theValueSortsByItsShownFigure")           // 0.524 and 0.52 both "52%": a tie, kept in rank order
  it("allUnrankedSortedByValue")                // every row unranked: value either way keeps their order
  ```
  Keep `rankedRows`, `tiedRowsShareTheirRank`, `belowTheMinimum` and `anUnknownPlayerIsNamedByNumber`
  with the new props (`valueHead="Win rate"`, `sortValue={wholePercent}`), their expectations
  rewritten too: three cells a row without `countHead` (no fourth `""`), and a bare count (`"3"`,
  not `"3 games"`) under `countHead="Games"`. Add `INVESTIGATIONS`' case:
  `aLeftStandingValuePutsItsArrowLast` (`valueEnd={false}`: the value head's text before its svg).
- [ ] **Step 2: Run** `npx vitest run src/stats/RankedTable.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement `RankedTable`, then every card from this table, exactly.** `n` is the
  value itself; `%` is `wholePercent(rate.value)` (null for a null value); "—" means no count
  column.

  | Tab | Card | Value head | Sort figure | Count head |
  |---|---|---|---|---|
  | OVERVIEW | Games played | Games | n | — |
  | OVERVIEW | Wins | Wins | n | — |
  | OVERVIEW | Win rate | Win rate | % | Games |
  | OVERVIEW | Current streak | Streak | n | — |
  | OVERVIEW | Longest streak | Streak | n | — |
  | ACTIVITY | Participation | Share | `wholePercent(share)` | Games |
  | ACTIVITY | The END TERM countdown | Countdown | % (`value ?? 0`, as shown) | Terms |
  | ACTIVITY | Dropped connections | Drops | n | Games |
  | ROLES & CARDS | Win rate as Liberal, as Fascist, as Hitler (`winAs`) | Win rate | % | Games |
  | ROLES & CARDS | Role luck | Luck | `Math.round(luck * 100)`, null for null | Games |
  | ROLES & CARDS | Times as Hitler | Times | n | — |
  | ROLES & CARDS | Longest run of one role | Run | `run.length` | — |
  | ROLES & CARDS | First president | Win rate | % | Games |
  | ROLES & CARDS | Liberal accuracy | Accuracy | % | Hands |
  | ROLES & CARDS | Deep cover (president) | Discards | % (the first share) | Hands |
  | ROLES & CARDS | Fascist choices | Choices | n | — |
  | VOTES & POWERS | NOMINATED AS CHANCELLOR, HITLER EXECUTED, TIMES EXECUTED, SPECIAL ELECTIONS | Times | n | — |
  | VOTES & POWERS | VOTED HITLER IN, SWING VOTES, LONE DISSENT | Votes | n | — |
  | VOTES & POWERS | FAILED ELECTIONS | Failed | n | — |
  | VOTES & POWERS | CHAOS | Chaos | n | — |
  | VOTES & POWERS | PEEKS | Peeks | n | — |
  | VOTES & POWERS | EXECUTIONS | Executions | n | — |
  | VOTES & POWERS | FIRST TO GO | Games | n | — |
  | VOTES & POWERS | NOMINATIONS PASSED | Passed | % | Nominations |
  | VOTES & POWERS | ELECTED AS CHANCELLOR | Elected | % | Elections |
  | VOTES & POWERS | LIBERAL VOTE ACCURACY | Accuracy | % | Votes |
  | VOTES & POWERS | FASCIST LOYALTY | Loyalty | % | Votes |
  | VOTES & POWERS | LIBERAL FINDS | Finds | % | Checks |
  | VOTES & POWERS | CHECKING A TEAMMATE | Teammate | % | Checks |
  | VOTES & POWERS | SPECIAL ELECTION PICKS | Teammate | % | Elections |
  | VOTES & POWERS | INVESTIGATIONS (`valueEnd={false}`) | Investigations | `p.investigations` | — |
  | RECORDS | Current streaks | Streak | the signed current run (losses negative) | — |

  `countTable(entries, value, valueHead)` and `rateTable(entries, value, valueHead, countHead)`
  take their heads in `VotesTab.tsx`; `ranked(…)` in `RolesTab.tsx` takes `valueHead`,
  `sortValue` and `countHead` in place of `countLabel`. `RankedTable.css` takes
  `PowerRanking.css`'s `th` rules as `.ranked-table thead th`, `.ranked-table thead th.ranked-name`
  (left-aligned) and `thead th:first-child` and `:last-child`, never a bare `.ranked-table th`, which
  would reach Trophy holders' row heads (`th scope="row"` in `table.ranked-table.trophy-holders`,
  `RecordsTab.tsx`) and stop their rules wrapping; and its rule drawing a line above the first body
  row, as `.ranked-table thead ~ tbody tr:first-child td`.
- [ ] **Step 4: Run** `npx vitest run src/stats`. A tab test that fails only because a ranked card's
  count is now a bare number, or because a head row adds header cells or a row, is updated to the
  new text; any other failure is a bug to fix. Expect these: `tabs/ActivityTab.test.tsx` (its
  `querySelectorAll("tr")` now meets the head row; "6 games", "8 terms", "8 games"),
  `tabs/OverviewTab.test.tsx` (its `rows` helper reads every row; "5 games") and
  `tabs/VotesTab.test.tsx` (its ranked cards' rows). Expected after: PASS, and `npx tsc --noEmit -p .`
  clean.
- [ ] **Step 5: Commit** `feat(frontend): sort every ranked table by any column` (`RankedTable` and
  its callers in one commit, as neither builds without the other).

---

### Task 5: The power ranking and the best weeks and months

**Files:**
- Modify: `frontend/src/stats/tabs/PowerRanking.tsx`, `tabs/PowerRanking.css` (its `th` rules left
  for `RankedTable.css`), `tabs/RecordsTab.tsx` (`PeriodTable` only)
- Create: `frontend/src/stats/tabs/PowerRanking.test.tsx`
- Test: `tabs/OverviewTab.test.tsx`, `tabs/RecordsTab.test.tsx`

**Interfaces:**
- Consumes: Task 3's heads and hook, Task 2's `RANK_ORDER`.
- Produces: no new export. The power ranking's columns: `rankColumn(r => r.rank)`, `playerColumn`,
  Elo (`key: "rating"`, `className: "power-number"`, end, descending, `Math.round(rating)`), Last
  (`"change"`, `Math.round(lastChange)`) and Games (`"games"`). `PeriodTable`'s: `rankColumn`,
  `playerColumn` (its period stays under the name), and Wins (`"wins"`, `className:
  "ranked-value"`, end, descending, `value.wins`). Both open at `RANK_ORDER`.

- [ ] **Step 1: Write the failing tests.** `PowerRanking.test.tsx`:
  `opensInComputeOverviewsOrder` (settled by rating, provisional last; Rank `aria-sort`
  ascending), `aProvisionalRowTakesItsPlaceByElo` (Elo descending puts a provisional 1700 first),
  `provisionalRowsStayLastUnderRankEitherWay`, `eloComparesRounded` (1540.4 and 1539.6 tie, in their
  own order), `theLastChangeSorts` (−13 below +19 at descending). In `RecordsTab.test.tsx`:
  `theBestWeekSortsByPlayerAndWins` (heads Rank, Player, Wins; a press on Player puts names A to Z,
  each rank kept, the period still under its name).
- [ ] **Step 2: Run** `npx vitest run src/stats/tabs/PowerRanking.test.tsx src/stats/tabs/RecordsTab.test.tsx`.
  Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces: `SortHeadRow` replaces each table's head row (the
  power ranking's) or adds one (`PeriodTable`), and the rows come from `useTableSort`.
- [ ] **Step 4: Run** `npx vitest run src/stats`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): sort the power ranking and the best weeks and months`.

---

### Task 6: In the browser, at every size

**Files:**
- Create: `frontend/e2e/stats-sort.spec.ts`
- Modify (only by Step 4's rule): a card's head words in Task 4's files

- [ ] **Step 1: Write `stats-sort.spec.ts`** (all four projects run it, `firefox`'s `testMatch`
  taking `stats-*.spec`), against `stubStats(page, bigStatsData())` with the clock an hour after
  its last game:
  - `a ranked card's heads sort it and its ranks stay`: OVERVIEW's region "Win rate": Rank's
    `aria-sort` is ascending; a press on "Games" makes it descending and the body's count cells
    non-increasing, each player's rank text the same as before the press; a second press,
    ascending and non-decreasing; a press on "Rank" gives back the first order.
  - `the power ranking sorts by Elo`: a press on "Elo" gives non-increasing Elo cells.
  - `a best week sorts by player`: RECORDS' Most wins in a week, a press on "Player" puts the names
    A to Z by `localeCompare(…, "en", { sensitivity: "base" })`.
  - `Enter and Space on a focused head sort it` (`desktop` and `firefox`): OVERVIEW's Win rate, Tab
    to its Games head, `page.keyboard.press("Enter")`: descending, the focus still on that button;
    `Space`: ascending.
  - `a sorted ranked card still fits`: in `phone-360` at 320x568, OVERVIEW's Win rate sorted by
    Games, then `checkStatsPage`. (The tabs' own specs already run `checkStatsPage` on every tab at
    every size, so the new heads' fit and 44px targets are checked there.)
- [ ] **Step 2: Run** `cd frontend && E2E_PORT=<port> npm run e2e -- --project=desktop
  --project=phone-360 --project=phone-412`. Expected: PASS, every `stats-*.spec` included (a spec
  that reads a ranked card's count text is updated as in Task 4, Step 4).
- [ ] **Step 3: Run Linux's fonts and Firefox.** Serve the jar on the host with
  `TEST_SIGN_IN=true` and run `--config playwright.linux.config.ts` for `firefox`, `phone-360` and
  `phone-412` in the Playwright image (`DEVELOPMENT.md`, "Browser tests on Linux", with
  `E2E_PORT=<port>`). Expected: PASS.
- [ ] **Step 4: Only if a ranked card fails to fit** (a `checkStatsPage` sideways problem inside a
  `.ranked-table`) at a phone size in either run. Expect it: the plan's audit estimates that at
  320px a 44px `#`, a 44px name link and a value and count head such as "Passed" and "Nominations"
  need about 280px of a card's 260px, so budget this session for the fallback and its tests. First
  shorten that card's value or count head to
  a shorter true word (list each change for the pull request) and run both again. If a card with a
  count column still fails, apply the spec's fallback to every `RankedTable` with a count column:
  in the phone-only query (written out as `PlayersPage.css` writes it) the count's head and cells
  are hidden, and a `span.ranked-count-under` under the name shows `countLabel(row.count, [one,
  many])` (`countLabel.ts`), `many` being `countHead` lowercased and `one` that less its final "s"
  (every count head in Task 4's table is a plural in -s; a `RankedTable.test.tsx` case holds it for
  each), in `.players-last-under`'s look. Test it as PLAYERS' Last played is tested, and run both
  again. If a card still fails, stop and report the card, the size, and the table's needed and
  available widths in px.
- [ ] **Step 5: Commit** `test(frontend): check the sortable tables in the browser`.

---

### Task 7: Docs, review, the "after" shots and the pull request

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `docs/PLAN.md`
- Create: `docs/pr/phase-27a-sortable-tables/after-*.png`
- Delete: `frontend/e2e/pr-shots.spec.ts`

- [ ] **Step 1: `CLAUDE.md`.** Under `frontend/` (the stats engine and the tabs): `sorting.ts`
  and `SortHead.tsx` (the rules, the heads, `useTableSort`, `rankColumn`, `playerColumn`,
  `NAME_ORDER`, `RANK_ORDER`, `.stats-sort`); `RankedTable`'s head row, `valueHead`, `sortValue`,
  `countHead` and which cards have a count column (no more `countLabel` or `showCount`); the power
  ranking's and `PeriodTable`'s heads; `wholePercent`; PLAYERS' sort on the shared pieces
  (`playersColumns`); `stats-sort.spec.ts`. Fix every sentence the phase made stale (search for
  `rankRows`' order, `showCount`, `countLabel`, `SortHead`, `.players-sort`, "no head row"). Under
  Pointers, add the spec: "sortable stats tables (#109, Phases 27A and 27B):
  `docs/superpowers/specs/2026-11-18-sortable-tables-design.md`".
- [ ] **Step 2: `README.md`.** The stats bullet says the tables sort by any column at a press on
  a heading, beside PLAYERS' line that already says it of PLAYERS.
- [ ] **Step 3: `docs/PLAN.md`.** Tick Phase 27A's boxes whose work is done.
- [ ] **Step 4: Review.** Run the `code-review` skill against `origin/development` with the spec
  and this plan as the spec. Fix every finding, Minor ones included, or write down why it needs no
  change; re-run the tests the fixes touch.
- [ ] **Step 5: The "after" shots.** Set `PREFIX = "after"` in `pr-shots.spec.ts`, run it as in
  Task 1, Step 4, then delete the spec. Expected: eight PNGs; PLAYERS' pair matches its "before"
  pair.
- [ ] **Step 6: Verify.** `cd frontend && npm test -- --run && npm run build`; `cd backend &&
  ./gradlew test` (nothing there changed, but CI runs it). Keep the counts.
- [ ] **Step 7: Commit and push.** `docs(claude): describe the sortable ranked tables`,
  `docs(readme): say the stats tables sort`, `docs(plan): tick phase 27a`, `docs(docs): add phase
  27a's after screenshots`; then `git push -u origin phase-27a-sortable-tables`.
- [ ] **Step 8: Open the pull request** with the title from Decisions and a body in
  `implement-issue`'s order (Before and after, a row per shot and size, linked by raw URL pinned to
  the pushed head; Changes; Decisions; Review; Tests with the counts; Docs), ending `Part of #109`
  (never a closing keyword: 27B closes the issue).
- [ ] **Step 9: CI.** Watch it as `implement-issue`, step 9, says, to green. Do not merge: the user
  says when, in chat.
- [ ] **Step 10: Merge, on the user's yes in chat.** Tick "PR merged into `development`" in Phase
  27A's section (`docs(plan): mark phase 27a merged`), push, let CI go green again, then merge and
  check the image as `implement-issue`, step 9, says (`gh pr merge --squash --admin
  --match-head-commit`). Phase 27B starts from the `development` this merge makes.
