# Sortable stats tables: design

Date: 2026-11-18
Status: approved design, pending implementation plans (`docs/PLAN.md`, Phases 27A and 27B)
Issue: [#109](https://github.com/jussaw/Secret-Hitler-Online/issues/109), which builds on #100
(merged as #105, PLAYERS' sort and search)

## Why

PLAYERS (`/players`) sorts by any column since #100: a press on a column's head sorts by it, a
second press turns the order round, and the sorted head says so with `aria-sort` and an arrow.
Every other table on the stats pages keeps one fixed order. The user wants the others to sort the
same way: "it makes analyzing stats easier, and its what i have on my harborstats app which this is
inspired by".

harborstats is the user's own stats site for another game. Its `StatsLeaderboardTable` is one table
that every leaderboard renders through: a head row of small labels, a press that sorts and a second
that turns it round, the first press running most first for a number and A to Z for a word, the
sort in the component's state (a reload opens in the table's own order), a `#` column that keeps
each row's rank from the card's own order while the rows move, and missing values at the bottom
either way. Its head-to-head matrix and its games list do not sort. This design follows it except
where the user chose otherwise, or this site already does something else (each marked below).

## What is there today

Paths are under `frontend/src/stats/`, as of `development` at 337174c.

- **`RankedTable`** (`RankedTable.tsx`): the rank, the name, the value and the count, with no head
  row. Its rows come in `rankRows`' order (`counting.ts`): by the card's value, most first, ties by
  count, then name, with competition ranks (1, 2, 2, 4) and the rows below the card's minimum
  unranked ("—" for the value) at the bottom. The count shows on every row with `showCount`, and
  otherwise only on unranked rows, as "12 games" (`countLabel`). It fits a 320px phone without
  scrolling sideways. It is drawn on 39 cards: OVERVIEW's five headline cards, ACTIVITY's
  Participation, END TERM countdown and Dropped connections, 10 cards of ROLES & CARDS (the three
  Win rate as … cards of `winAs` and seven more of `ranked`, in `tabs/RolesTab.tsx`; #109 counts
  8), 20 of VOTES & POWERS' 26 (`countTable`'s 12, `rateTable`'s 7 and INVESTIGATIONS, in
  `tabs/VotesTab.tsx`) and RECORDS' Current streaks. Every card ranks most first.
- **OVERVIEW's power ranking** (`tabs/PowerRanking.tsx`): #, Player, Elo, Last and Games under a
  head row of plain labels, in `computeOverview`'s order: settled players by rounded rating, then
  provisional players, unranked and in italics.
- **`SplitTable`** (`SplitTable.tsx`): players down, roles or sides across, always by name, under
  plain heads in their side's colour, inside a `ScrollRegion` with the names held at the left. A
  cell is text and an optional count (`SplitCell`), so it holds no number to sort by. It is drawn
  14 times: 7 in ROLES & CARDS, 6 in VOTES & POWERS and ACTIVITY's Decision times.
- **RIVALS' People table** (`PeopleTable` in `tabs/RivalsTab.tsx`): Player, Most played with,
  Nemesis and Favourite opponent under plain heads, in name order, each cell a name link and a
  count.
- **RECORDS' tables** (`tabs/RecordsTab.tsx`): Most wins in a week and in a month (`PeriodTable`:
  the rank, the name over its period, and the wins, no head row), Players of the month (a row per
  completed month, newest first: the month over its holders, and the wins, no head row) and Trophy
  holders.
- **ENDINGS' two tables** (`tabs/EndingsTab.tsx`): Liberal win rate by player count (Players,
  Games, Liberal wins, Win rate, Smoothed) and Game length (Players, Games, Average length, Average
  rounds, then an All row), a row per table size, smallest first, under plain heads.
- **RIVALS' three matrices** (`PlayerMatrix`), **GAMES' list**, **Trophy holders** and **a
  player's page's** facts, hands and latest games.
- **PLAYERS' pieces** (#100), all its own: `SortHead` in `players/PlayersPage.tsx` (a button in the
  `th`, Lucide's `ArrowUp` or `ArrowDown` on the sorted head and a dimmed `ArrowUpDown` on the
  others, `aria-sort` on the sorted one), the `.players-sort` look in `players/PlayersPage.css`
  (the button look undone, the sorted head in `--headerTextColor`, a focus outline, a 44px target in
  the stacked query, every rule under `.players-table`), and `pressHead`, `sortPlayers` and
  `NAME_ORDER` in `players/playersOrder.ts`. The sort is `PlayersList`'s state.

## Goals

- **Every table but the RIVALS matrices sorts by any of its columns**, as PLAYERS does: the 39
  `RankedTable` cards, the power ranking, the 14 split tables, the People table, both
  `PeriodTable`s, Players of the month and ENDINGS' two tables. (The user chose this over "per-player
  tables only" and "leaderboards only".)
- **One set of rules for every table**: the press, the first direction, ties, missing values, the
  arrows and `aria-sort`, written once.
- **Each table opens exactly as it does today**, with the head its order follows marked as sorted.
- **PLAYERS works as it does now**, on the shared pieces.

## Non-goals

- Sorting the RIVALS matrices (Teammates, Opponents, Who trusts whom). Their column heads are name
  links, which no button may hold (`nameLinks.test.tsx` fails on `button a`), and sorting their rows
  alone would break the blank diagonal. harborstats' matrix does not sort either.
- Sorting GAMES. It is a paged list with its filter in the address, not a table, and harborstats'
  games list does not sort.
- Sorting Trophy holders or anything on a player's page (facts, hands, their 5 latest games).
- Keeping a sort in the address, or across a reload or a change of tab.
- Sorting by two columns at once, or by anything a table does not show as a column (the period
  under a name in `PeriodTable`, the holders under a month, a split cell's count).
- Changing what any stat counts or says.

## Anti-goals

- A `RankedTable` that no longer fits a 320px phone without scrolling sideways, or any stats page
  that `checkStatsPage` fails at any `statsSizesFor` size.
- A name link inside a button, or a head button inside a link.
- A table whose opening order differs from today's, even by a tie.
- New art: the arrows stay Lucide's, as PLAYERS' are.

## Constraints

- `CLAUDE.md`'s rules: the stats chunk imports nothing outside `src/stats/` but leaf modules, no
  `e2e/` file imports `src/constants`, Lucide only for icons, before-and-after screenshots per pull
  request, docs updated in the same pull request.
- Every head is a 44px target wherever the stacked query matches (`checkStatsPage` fails a smaller
  control), and its words never wrap a button's label.
- CI draws Germania One and the text font wider on Linux than macOS does at phone sizes, so the
  320px fit is checked in Playwright's Linux image (`DEVELOPMENT.md`, "Browser tests on Linux").

## Approaches

1. **Shared heads and sorting, each table keeps its own body (chosen).** One module holds the
   sortable head, the press rule and a hook that sorts rows by the rules below. Each table lists
   its columns (head words, the value it sorts by, which way a first press runs), renders its head
   row from that list and goes on drawing its own rows. The tables differ a lot (SplitTable's held
   names and coloured heads, PeriodTable's line under the name, ENDINGS' All row, INVESTIGATIONS'
   long value), and those stay as they are, with the least churn in markup already tested at every
   size.
2. **One table component every table renders through**, as harborstats' `StatsLeaderboardTable`
   does: each table passes columns and rows of cells, and the component draws the head, the rank
   and the order. The most uniform, but all eight kinds of table are rewritten into one shape, which
   has to grow options for held names, coloured heads, two-line cells and sideways scrolling, and
   most of their CSS is re-pointed.
3. **A sort written into each table on its own.** Dropped: PLAYERS' rules copied eight times, free
   to drift apart.

The user picked 1.

## Decided with the user

- **Which tables**: all but the RIVALS matrices; GAMES, Trophy holders and a player's page stay as
  they are.
- **Rows below a card's minimum**: only a "—" in the sorted column drops. A row whose value in the
  sorted column is missing ("—") goes below every value, whichever way the sort runs; otherwise it
  sorts like any other row, so a sort by name mixes unranked rows in, and a sort by games ascending
  can put them on top. This is PLAYERS' rule. (harborstats pins such rows to the bottom under every
  sort; the user chose PLAYERS' rule over it.) A provisional player is not missing anything, so
  their row takes its place like anyone else's, as on PLAYERS.
- **Ranks stay put**: under another sort a row keeps the rank the card's own order gave it, as in
  harborstats, so `#` still says where a row stands by the card's own stat.
- **The sort is each table's own state**, as on PLAYERS and harborstats.
- **The approach**: shared heads and sorting, each table keeping its own body.

## Design

Calls marked *(my call)* were made in writing this design, not by the user; the reviewer and the
user may change them.

### The rules

- **A press** on a head that is not the sorted one sorts by its column in the column's first
  direction: A to Z for a name or other words, most (or latest) first for a number, 1 first for
  `#`, and 5 first for ENDINGS' Players, a table size, which is that table's own order rather than
  a quantity *(my call)*. A press on the sorted head turns the order round. (PLAYERS' `pressHead`,
  with each column naming its first direction.)
- **What a column sorts by** is the figure its cell shows: a whole percent as `formatPercent`
  rounds it, a rounded rating, a signed whole for a shift, a run's length for "4 as Liberal", the
  first share of "60% · 40%", the investigations of INVESTIGATIONS' "4 (3 F, 1 L) · …", the signed
  current run of "3 wins" or "2 losses", a decision time as it shows it (to the tenth of a second
  below a minute, whole seconds from one). Names
  and other words compare as `compareNames` does (English, ignoring case). So two rows the reader
  sees as equal are a tie.
- **A missing value** ("—", or no one in a People cell) goes below every value, either way, as
  decided above.
- **Ties keep the table's own order**, whichever way the sort runs *(my call)*. The own order is the
  order the table opens in: names A to Z on PLAYERS, the split tables and People, which is PLAYERS'
  "ties by name, then number"; the rank order elsewhere, so a sort by games puts the better of two
  players with the same games first. A table sorted by its opening column is exactly its own order,
  which the tests hold.
- **`#` is a head too** where a table has one (the 39 `RankedTable` cards, the power ranking, both
  `PeriodTable`s), sorting by the rank, 1 first, with unranked rows missing *(my call; harborstats'
  `#` does not sort)*. The power ranking's own order (settled players by rating, then provisional
  ones) is no other column's order, so `#` is the one way back to it; making `#` a head wherever it
  shows keeps one rule. Its button's accessible name is "Rank".
- **The opening state**: each table opens in its own order with the head of the column that order
  follows marked as sorted (`aria-sort` and its arrow), as PLAYERS marks Player.

  | Table | Opens sorted by |
  |---|---|
  | `RankedTable`, power ranking, `PeriodTable` | `#`, 1 first |
  | PLAYERS, split tables, People | Player, A to Z |
  | Players of the month | Month, latest first |
  | ENDINGS' two tables | Players, 5 first |

- **The sort lasts while its table is on screen**: the filter chips, the CPU switch and a search
  keep it, as on PLAYERS, since the tab stays mounted; a reload, another tab, or a card that goes
  empty and comes back opens it in its own order again.

### The heads

PLAYERS' `SortHead` and its look, made shared *(my call: names and files are the builder's)*:

- A `th scope="col"` holding a button with the column's words and an arrow (Lucide's `ArrowUp` or
  `ArrowDown` on the sorted head, a dimmed `ArrowUpDown` on the others), the arrow after the words
  in a column whose values stand at the left and before them in one whose values stand at the right,
  and `aria-sort` on the sorted head only, as on PLAYERS.
- The look generalised from `.players-sort`, with no rule scoped under `.players-table`: the
  button look undone, the head's own size and weight, the sorted head and a hovered one in
  `--headerTextColor`, a focus outline, and a 44px target (`min-width` and `min-height`) wherever
  the stacked query matches.
- A head in a side's colour (the split tables' Liberal, Fascist and Hitler heads) keeps its colour,
  sorted, hovered or not; its arrow marks the sort *(my call)*.
- A head's words never wrap; each table's head words are short enough that the table still fits
  where it fits today (below).

### Each table

- **`RankedTable`** gains a head row in the power ranking's head look (small, bold, grey), which
  moves into `RankedTable.css` so both share it *(my call)*: `#`, Player, the card's value head and,
  on cards that have one, a count head. Each card names its value head (the stat in a word or two:
  Wins, Win rate, Luck, Run, Accuracy) and, with a count column, its count head (the counted noun:
  Games, Hands, Votes, Terms), and gives the number its value sorts by. A card has a count column
  when a row of it can show a count today *(my call)*: with `showCount`, or with a minimum above 1,
  below which a row is unranked and shows its count. It then shows the count on every row as a bare
  number under its head, since a column empty on most rows cannot be sorted by. That is 18 cards:

  | Tab | Cards with a count column (18) | Cards keeping three columns (21) |
  |---|---|---|
  | OVERVIEW | Win rate | Games played, Wins, Current streak, Longest streak |
  | ACTIVITY | Participation, END TERM countdown, Dropped connections | |
  | ROLES & CARDS | Win rate as Liberal, as Fascist, as Hitler; Role luck; First president; Liberal accuracy; Deep cover | Times as Hitler, Longest run of one role, Fascist choices (a minimum of 1, and every row they show has a count of 1 or more, so none is ever unranked) |
  | VOTES & POWERS | `rateTable`'s 7 | `countTable`'s 12, INVESTIGATIONS |
  | RECORDS | | Current streaks (a minimum of 1, as above) |

  Ranks and the "—" of unranked rows stay as they are. It still fits 320px without scrolling
  sideways, a twelve-character name of wide letters wrapping in its own column, and INVESTIGATIONS'
  value still wraps in 65% of the table. On a phone `#` (a 44px button), the name (a 44px link in a
  table cell) and a count head leave the value about 100px at 320px, so count heads are one short
  word. Should a card with a count column still not fit 320px in the Linux image once its words are
  short and its padding tight, then in the phone-only query every `RankedTable` with a count column
  moves its count under the name as a small line ("12 games") and its count head goes with it, as
  PLAYERS' Last played does; sorting by the count is then a desktop thing, as sorting by Last played
  is *(my call, by PLAYERS' precedent; one look for every such card, not a few)*. Its rows are 44px
  tall in the stacked query as today, and so is its head row. On phones that is one 44px row more on
  every card, 39 of them across the tabs, which was put to the user while the design was talked
  over *(my call)*.
- **The power ranking** keeps its heads, made buttons: #, Player, Elo (the rounded rating), Last
  (the rounded change) and Games. A provisional row has no rank, so a sort by `#` keeps provisional
  rows at the bottom either way; under any other column they take their place.
- **`SplitTable`**: its heads become buttons, Player and each role's or side's. `SplitCell` gains
  the number its text shows, null for "—" (a value every caller gives, so none is forgotten *(my
  call)*); a cell the row lacks is missing. A column sorts by that number, never by the count beside
  it. A cell with two figures sorts by the one its text leads with *(my call)*: Vetoes as
  president's "2 of 5" by 2, and Policies enacted's "2 L · 3 F" by its Liberal policies.
- **The People table**: Player, and the other three by their counts (games together, losses, wins),
  most first; a cell with no one is missing.
- **`PeriodTable`** (Most wins in a week, in a month) gains a head row: `#`, Player and Wins. The
  period stays under the name and does not sort.
- **Players of the month** gains a head row: Month (by the month, latest first; its holders stay
  under it) and Wins.
- **ENDINGS' two tables**: their heads become buttons, every column by its number (Players by the
  table size, the rates as whole percents, the average length and rounds as shown), a "—" missing.
  Game length's All row is never sorted and stays last.
- **PLAYERS** moves onto the shared pieces with no change anyone can see or a test can tell: it
  opens in name order, its columns, first directions, tie rule (its own order is name order) and
  win rates below the minimum stay as they are. Its search stays its own.

### Testing

- The rules, with no page: a press (first direction per column, turning round), what each column
  sorts by, missing values below in both directions, ties keeping the own order in both directions,
  names ignoring case, and each table's opening state giving back its rows unchanged.
- The heads: the arrows, `aria-sort` on the sorted head only, the button's name (Rank for `#`), and
  a coloured head keeping its colour.
- Each table's own tests (`RankedTable.test.tsx`, `SplitTable.test.tsx`, the tabs' and PLAYERS'):
  its heads, its opening order (today's, including ties), a press on each kind of column reordering
  the rows with the ranks kept, and a missing value staying last both ways. PLAYERS' existing tests
  pass unchanged but for imports.
- `nameLinks.test.tsx` still finds no link in a button on any page.
- Browser tests: `checkStatsPage` already checks every tab at every `statsSizesFor` size in all
  four projects, so the new heads must pass its 44px and overflow checks as they stand. A new spec
  presses heads on one table of each kind on desktop and on a phone and checks the rows' order and
  `aria-sort`, and checks a `RankedTable` with a count column and a twelve-character name fits
  320x568, which is also run in the Linux image.

### Docs

`CLAUDE.md` (the shared sorting pieces; `RankedTable`'s head row and count column; the power
ranking, `SplitTable`, People, `PeriodTable`, Players of the month and ENDINGS' tables sorting;
PLAYERS on the shared pieces), the README's line on the stats pages, and `docs/PLAN.md`.

### Phasing *(my call)*

Two phases, each its own branch, session and pull request, the second after the first merges, since
both edit the same tabs:

- **27A**: the shared rules, heads and look; PLAYERS onto them; `RankedTable`'s 39 cards; the power
  ranking; both `PeriodTable`s.
- **27B**: the 14 split tables and `SplitCell`'s number; the People table; Players of the month;
  ENDINGS' two tables.

## Left to the builder

- The module's files and names, its API (a hook, a head component, a pure sort), and how PLAYERS'
  `playersOrder.ts` keeps its search beside it.
- Each card's exact head words, within the rules above (short, one or two words, never wrapping,
  fitting where the table fits today), listed in the phase's plan.
- The CSS that moves from `PowerRanking.css` and `PlayersPage.css` into the shared look, and any
  phone tightening a head row needs to keep `RankedTable` inside 320px.
- Test file names and fixtures.
