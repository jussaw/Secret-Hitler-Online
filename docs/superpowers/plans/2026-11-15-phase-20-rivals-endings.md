# Phase 20: RIVALS and ENDINGS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill Phase 17's RIVALS and ENDINGS placeholders: who wins with and against whom, who
nominates whom, and how, how fast and how close games end (issue #31).

**Architecture:** Two pure stat modules turn the counted games into plain data: `rivals.ts`
(`computeRivals`: pairs, duos, rivalries, each player's people and opponents, nominations) and
`endings.ts` (`computeEndings`: outcomes and the Liberal win rate by player count, length, final
boards, the most of a kind in one game). Both read nominations, elections, chaos and vetoes from
Phase 16's `rounds(record)`. Two tab components draw them as Phase 17's `StatCard`s, with Phase
17's `StackedBarChart` and `ScrollRegion`, Phase 15's `StatsLink`, and one new component,
`PlayerMatrix`, for the player-by-player tables, which scroll sideways inside their card. No shared
file is edited: this phase starts once Phases 16 and 17A (the engine and shared pieces) have merged,
and runs beside 17B (OVERVIEW), 18, 19 and 21A.

**Tech Stack:** React 18, TypeScript 5, Vite, Vitest with Testing Library, `@playwright/test`
1.64.1.

**Spec:** [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](../specs/2026-11-15-game-stats-design.md)
(RIVALS, ENDINGS, Elo, Counting rules, Cards, Charts, Constraints, Tests). Shared names:
[`2026-11-15-game-stats-interfaces.md`](2026-11-15-game-stats-interfaces.md). Parent plan:
[`docs/PLAN.md`](../../PLAN.md), Phase 20. Read the spec first: this plan does not repeat its
reasons, and where the two differ the spec wins.

## Rules this plan settles

The spec leaves these open; the tests below pin them.

1. **People are human seats.** Pairs, people and nominations count only human seats
   (`humanSeats(record)`), by player number. A CPU seat is never paired, nominating or nominated,
   even with the CPU toggle on; its game still counts for the humans in it.
2. **A pair** is two players in one counted game. *Together*: the same side (`sideOf`), won when
   that side is `winner`. *Fascist together*: both on the Fascist side. *Opposed*: opposite sides,
   so exactly one of them won.
3. **Names** are `stats.names` (current names), compared with Phase 17's `compareNames`. A pair's
   names are its two names in that order; pairs compare by their first name, then their second.
   So `computeRivals` takes the names: `computeRivals(counted, names)`, as the interfaces file has
   it.
4. **Pair ties:** the value, then more games (the games the value is over), then names. Best duo:
   rate `togetherWins / together`, over pairs with `together ≥ MIN_GAMES`. Best Fascist duo: the
   same with `fascistTogetherWins / fascistTogether`.
5. **Closeness** is `|2·aWins − opposed| / (2·opposed)`, from integers, so 3 of 10 and 7 of 10 are
   exactly equal (`|aWins/opposed − 0.5|` gives 0.2 and 0.19999999999999996). Only pairs with
   `opposed ≥ MIN_GAMES`. Closest: smallest; most lopsided: largest; both then more `opposed`, then
   names.
6. **People.** *Most played with*: most `shared` games, ties by name. *Best teammate* (Phase 22's):
   the best rate together over `together ≥ MIN_GAMES`, ties more `together`, then name. *Nemesis*:
   most losses to one opponent (at least 1), ties by more `shared` games (any side, the count
   "most played with" uses), then name. *Favourite opponent*: most wins against one (at least 1),
   the same ties. Each player also has their record against every opponent met on opposite sides
   (Phase 22's Dominant Rivalry and Familiar Foe read it).
7. **Who trusts whom** counts every nomination, passed or not: each round of `rounds(record)` with a
   chancellor, when its president and chancellor are both human.
8. **Game length** is `endedAt − startedAt` and `record.rounds`, over complete games only: a
   `complete: false` record's `startedAt` is the restore, so its length is wrong. Such a game still
   counts everywhere else. *Fastest win*: the shortest, ties fewer rounds, then the earlier game.
   *Longest game*: the longest, ties more rounds, then the earlier game. Earlier is by `endedAt`,
   then `id`.
9. **Final boards.** *Closest finish*: `winner` `FASCIST` with `liberalPolicies` 4, or `LIBERAL` with
   `fascistPolicies` 5. *Most lopsided*: the losing side's count 0. Both newest first; the tab lists
   the 10 latest (`FINISHES_SHOWN`) under the count of all.
10. **Most in one game** counts rounds per game: chaos `enacted?.by === "chaos"` (every chaos
    `enact`, whether a third failed election or an accepted veto caused it, the same ones VOTES &
    POWERS counts), failed elections `election?.passed === false`, vetoes `veto?.accepted ===
    true` (an agenda vetoed; a refused request is not one). The record is the highest count above
    0; ties go to the earlier game.
11. **Rates** are `rate(hits, chances, MIN_GAMES)`. The smoothed Liberal win rate is `(liberalWins +
    ELO_PRIOR) / (games + 2·ELO_PRIOR)`, shown at any count (50% at none): the `p` the handicap of
    the next game of that size uses.

## Global Constraints

- **Interfaces, exactly.** The interfaces file wins over this plan, its "Settled after the plans
  were written" section above all: `computeRivals(counted: GameRecord[], names: Map<number,
  string>): RivalStats`, `computeEndings(counted: GameRecord[]): EndingStats`, and `PlayerRivals`'s
  fields are its. Shared names, each from its owner:
  - Phase 15: `GameRecord`, `GameEvent`, `Player`, `Role`, `Side`, `sideOf`, `parseStatsData`
    (`record.ts`); `routePath` (`routes.ts`); `PlayerName`; `outcomeLabel`, `formatDuration`,
    `formatLocalDateTime`, `plural` (`format.ts`); `StatsLink` (`{ href, className?, children }`, a
    plain click navigates without a reload); in the browser tests `stubStats`, `bigStatsData`,
    `statsSizesFor(project, viewport)` and `checkStatsPage(page, size)` (`e2e/stats.ts`).
  - Phase 16: `rounds` (`rounds.ts`); the `ev` test builders (`game/sampleGames.ts`).
  - Phase 17: `countedGames`, `humanSeats`, `rate`, `Rate`, `MIN_GAMES`, `compareNames`,
    `DEFAULT_FILTER` (`counting.ts`); `ELO_PRIOR`, `replayElo` (`elo.ts`); `StatsContext`,
    `buildStats` (`useStats.ts`); `formatPercent` (`numbers.ts`); the test builders `game` and
    `seatsOf(players, roles?)` (`testGames.ts`, test-only);
    `StatCard` (`{ title, definition, empty?: boolean | string, className?, children? }`, a `section`
    region named by its title; `empty` true shows "No games yet with these players.", a string
    shows itself, both instead of the children); `ScrollRegion` (a region that scrolls sideways
    inside a card, named `<card title> table`); `StackedBarChart` (`{ bars, colors, label, legend?
    }`, drawing its legend).
- **Before Task 1,** read the interfaces file's "Settled after the plans were written", the merged
  files behind those names, the placeholders `tabs/RivalsTab.tsx` and `tabs/EndingsTab.tsx`,
  `tabs/OverviewTab.tsx` (a filled tab to match) and the fixture `fixtures/recorded-games.json`.
  Where the code differs from the shapes above, follow the code and say so in the pull request.
- **Files.** Create or change only `frontend/src/stats/rivals.ts`, `endings.ts`, `testRivals.ts`,
  `testEndings.ts` and the two modules' tests; in `frontend/src/stats/tabs/`, `RivalsTab.tsx` and
  `EndingsTab.tsx` (filling the placeholders, named exports kept), `PlayerMatrix.tsx`, and their
  `.css` and `.test.tsx`; `frontend/e2e/stats-rivals.spec.ts`; and the docs (`CLAUDE.md`,
  `README.md`, `DEVELOPMENT.md`, Phase 20's section of `docs/PLAN.md`). Never another phase's file.
- **Bundle.** Nothing outside `frontend/src/stats/` imports these files, and only tests import
  `testRivals.ts` and `testEndings.ts`.
- **Pure stats.** `computeRivals` and `computeEndings` read only their arguments (never
  `Date.now()`), give the same result for `counted` in any order, and read nominations, elections,
  chaos and vetoes from `rounds(record)`, never from `events`.
- **CSS is global:** every class this phase adds starts `rivals-`, `endings-` or `player-matrix`.
  `App.css`'s global rules (`div` centred; `p`, `a`, `h2` sizes and margins) reach these pages, so
  each stylesheet sets its own alignment, sizes and margins.
- **Layout.** At every size the stats tests cover (320x568 to 1920x1080) the page may scroll down,
  never sideways. Matrices and the tabs' tables scroll sideways inside their card (`ScrollRegion`),
  their first column held in view. Every target is at least 44px (`MIN_TARGET`) where Phase 17's
  stacked query matches; ENDINGS's game links are 44px at every size. In the stacked query
  (`(max-width: 768px), (aspect-ratio < 5/4), (max-height: 500px)`) every row of a
  `table.player-matrix` is at least 44px tall, so Phase 22's name links in those tables need no
  padding. Every grid or flex child has `min-width: 0`, so a long name wraps inside its column.
  The tabs have no text field.
- **Headline names are never links.** `PlayerName` takes `link?: boolean` from Phase 15A (a no-op
  until Phase 22A makes names links). A name in a headline (`Ann & Bo`, `Ann 3–2 Cy`) is
  `<PlayerName player={n} name={…} link={false} />`; `player={null}` is only for CPU seats. Names in
  table headers and cells, and the Fastest win and Longest game seats lines (as GAMES rows), keep
  the default.
- **ES2020.** `frontend/tsconfig.json` targets ES2020 and `npm run build` type-checks the tests: no
  `Array.prototype.at`, `Object.hasOwn`, `replaceAll`, `findLast` or anything newer, in code or
  tests.
- **Browser tests import no browser-only module:** nothing in `e2e/` here imports `src/constants`
  or anything that imports it. The specs import `./stats`, `./lobby` (`settle`) and `routePath`
  from `../src/stats/routes`, and build page paths with `routePath`.
- **Look.** Text in `--textFont`, numbers `font-variant-numeric: tabular-nums`. In a matrix: ahead
  `--textColorWhite` bold, behind `--playerDisabledTextColor`, the diagonal `rgba(0, 0, 0, 0.25)`,
  sticky cells on `--backgroundDark`. Outcome colours
  from `variables.css`: Liberal policies `#5a9ba6`, Hitler executed `#386f8b`, Fascist policies
  `#e8604a`, Hitler elected `#b4431a`.
- **Text:** "no value" is `—` (U+2014); wins and losses `3–2` (U+2013); percentages through
  `formatPercent`, counts of games through `plural(n, "game")`.
- **No new dependency** and no new art.
- **Environment.** `npm ci` in `frontend/` once and `npx playwright install chromium firefox` once.
  Run `npm run e2e` with `JAVA_HOME` at an installed Java 17 and `E2E_PORT=4620`;
  the "before" screenshots use `E2E_PORT=4720` (check each is free: `lsof -iTCP:<port>
  -sTCP:LISTEN` prints nothing). Firefox that will not launch on macOS, and the phone projects with
  CI's wider Linux fonts, run in `mcr.microsoft.com/playwright:v1.64.1-noble` as `DEVELOPMENT.md`
  ("Browser tests on Linux") writes out.
- **Branch and commits.** Branch `phase-20-rivals-endings` in a worktree of the same name, from
  `origin/development` once Phases 16 and 17A have merged. Conventional Commits with a scope
  (`frontend`, `plan`, `docs`, `claude`, `readme`, `development`), lowercase, at most 72
  characters. Each test lands in the commit with its code. Task N ticks the Nth box of Phase 20 in
  `docs/PLAN.md` in its last commit.
- **Public repo:** nothing about the hosting setup in code, docs, commits or the PR.

## Review Focus

1. **A filter that leaves one player, or none** (or one human among CPU players with the toggle
   on): every card says so in words; no empty table, `NaN`, `undefined` or `null`. Tasks 1, 2
   and 6.
2. **CPU seats with the toggle on:** never in a pair, a matrix or a nomination count, while their
   games still count for the humans in them. Tasks 1 and 2.
3. **A game restored from a backup with no timeline** (`complete: false`, `startedAt` at the
   restore): left out of Game length, so it is never the fastest win. Tasks 3 and 7.
4. **Mirror-image rivalries** (3 of 10 and 7 of 10): exactly as close, the tie broken by games then
   names, not by floating-point noise. Task 1.
5. **Ten players with twelve-character names on a 320px phone:** the matrices and tables scroll
   inside their card with the names held in view, and the page never scrolls sideways. Task 8.

---

### Task 1: Pairs, duos and rivalries

**Files:**
- Create: `frontend/src/stats/rivals.ts`, `frontend/src/stats/testRivals.ts`
- Test: `frontend/src/stats/rivals.test.ts`
- Modify: `docs/PLAN.md`

**Interfaces:**
- Consumes:
  - `counting.ts`: `humanSeats`, `MIN_GAMES`, `compareNames`; in tests `countedGames`,
    `DEFAULT_FILTER`.
  - `record.ts`: `sideOf`; in tests `parseStatsData`.
  - `testGames.ts` (tests only): `game`, `seatsOf`.
  - The fixture `fixtures/recorded-games.json` (tests only).
- Produces in `rivals.ts`:

```ts
export interface Pair {
  a: number; b: number;                           // player numbers, a < b
  shared: number;                                 // counted games both played, any side
  together: number; togetherWins: number;         // Rule 2
  fascistTogether: number; fascistTogetherWins: number;
  opposed: number; aWins: number;                 // b won opposed − aWins
}
export interface Rivalry { pair: Pair; closeness: number }   // Rule 5
export interface RivalStats {
  players: number[];                              // everyone in a counted game, by name (Rule 3)
  pairs: Map<string, Pair>;                       // by pairKey
  bestDuo: Pair | null; bestFascistDuo: Pair | null;          // Rule 4
  closest: Rivalry | null; mostLopsided: Rivalry | null;      // Rule 5
}
export function pairKey(x: number, y: number): string;        // `${min}-${max}`
export function pairOf(stats: RivalStats, x: number, y: number): Pair | undefined;
export function against(stats: RivalStats, player: number, opponent: number): { wins: number; losses: number };
export function computeRivals(counted: GameRecord[], names: Map<number, string>): RivalStats;
```

- Produces in `testRivals.ts` (test support): `NAMES` (players 1 to 10: Ann, Bo, Cy, Di, Ed, Fay,
  Gus, Hal, Ivy, Jo); `repeat<T>(n: number, make: () => T): T[]`; `played(seats: [number | null,
  Role][], winner: Side, events?: GameEvent[]): GameRecord` (Phase 17's `game` with `seatsOf` of
  the players and roles, ids `g1`, `g2`, … and `endedAt` an hour apart in call order, overriding
  `events` and `rounds` (the largest `r`) when events are given); `together(x: number, y: number,
  side: Side, won: boolean)` (five seats: Liberal `[x LIBERAL, y LIBERAL, CPU LIBERAL, CPU FASCIST,
  CPU HITLER]`, Fascist `[x FASCIST, y HITLER, CPU LIBERAL ×3]`, `side` winning when `won`);
  `beats(winner: number, loser: number)` (`[winner LIBERAL, loser FASCIST, CPU LIBERAL, CPU
  LIBERAL, CPU HITLER]`, Liberals win).

- [ ] **Step 1: Write the failing tests** in `rivals.test.ts`:

```ts
it("counts each pair's games on the same side and on opposite sides", () => {
  const r = computeRivals([
    played([[1, "LIBERAL"], [2, "LIBERAL"], [3, "LIBERAL"], [4, "FASCIST"], [5, "HITLER"]], "LIBERAL"),
    played([[1, "FASCIST"], [2, "HITLER"], [3, "LIBERAL"], [4, "LIBERAL"], [5, "LIBERAL"]], "FASCIST"),
  ], NAMES);
  expect(r.players).toEqual([1, 2, 3, 4, 5]);
  expect(r.pairs.size).toBe(10);
  expect(pairOf(r, 2, 1)).toEqual({ a: 1, b: 2, shared: 2, together: 2, togetherWins: 2,
    fascistTogether: 1, fascistTogetherWins: 1, opposed: 0, aWins: 0 });
  expect(pairOf(r, 1, 3)).toEqual({ a: 1, b: 3, shared: 2, together: 1, togetherWins: 1,
    fascistTogether: 0, fascistTogetherWins: 0, opposed: 1, aWins: 1 });
  expect(pairOf(r, 4, 5)).toEqual({ a: 4, b: 5, shared: 2, together: 2, togetherWins: 0,
    fascistTogether: 1, fascistTogetherWins: 0, opposed: 0, aWins: 0 });
  expect(against(r, 3, 1)).toEqual({ wins: 0, losses: 1 });
  expect(against(r, 3, 4)).toEqual({ wins: 1, losses: 0 });
  expect(against(r, 1, 2)).toEqual({ wins: 0, losses: 0 });
});

it("never pairs a CPU seat", () => {
  const r = computeRivals([together(1, 2, "LIBERAL", true)], NAMES);
  expect([...r.pairs.keys()]).toEqual(["1-2"]);
  expect(r.players).toEqual([1, 2]);
});

it("the best duo needs 5 games together, then more games, then names", () => {
  const r = computeRivals([
    ...repeat(4, () => together(1, 2, "LIBERAL", true)), together(1, 2, "LIBERAL", false), // 4 of 5
    ...repeat(8, () => together(3, 4, "LIBERAL", true)),
    ...repeat(2, () => together(3, 4, "FASCIST", false)),                                 // 8 of 10
    ...repeat(4, () => together(5, 6, "LIBERAL", true)),                                   // too few
  ], NAMES);
  expect(r.bestDuo).toMatchObject({ a: 3, b: 4, together: 10, togetherWins: 8 });
  const even = computeRivals([
    ...repeat(4, () => together(3, 4, "LIBERAL", true)), together(3, 4, "LIBERAL", false),
    ...repeat(4, () => together(1, 2, "LIBERAL", true)), together(1, 2, "LIBERAL", false),
  ], NAMES);
  expect(even.bestDuo).toMatchObject({ a: 1, b: 2 });
});

it("the best Fascist duo counts only games on the Fascist side", () => {
  const r = computeRivals([
    ...repeat(3, () => together(1, 2, "FASCIST", true)), ...repeat(2, () => together(1, 2, "FASCIST", false)),
    ...repeat(6, () => together(3, 4, "LIBERAL", true)),
    ...repeat(4, () => together(5, 6, "FASCIST", true)),
  ], NAMES);
  expect(r.bestDuo).toMatchObject({ a: 3, b: 4 });
  expect(r.bestFascistDuo).toMatchObject({ a: 1, b: 2, fascistTogether: 5, fascistTogetherWins: 3 });
});

it("rivalries need 5 games on opposite sides: closest smallest, most lopsided largest", () => {
  const r = computeRivals([
    ...repeat(3, () => beats(1, 2)), ...repeat(3, () => beats(2, 1)), // Ann 3–3 Bo
    ...repeat(3, () => beats(3, 4)), ...repeat(7, () => beats(4, 3)), // Cy 3–7 Di
    ...repeat(5, () => beats(7, 8)),                                   // Gus 5–0 Hal
    ...repeat(4, () => beats(9, 10)),                                  // too few
  ], NAMES);
  expect(r.closest).toEqual({ pair: expect.objectContaining({ a: 1, b: 2, opposed: 6, aWins: 3 }), closeness: 0 });
  expect(r.mostLopsided).toEqual({ pair: expect.objectContaining({ a: 7, b: 8, opposed: 5, aWins: 5 }), closeness: 0.5 });
});

it("mirror-image rivalries are exactly as close", () => {
  const r = computeRivals([
    ...repeat(7, () => beats(5, 6)), ...repeat(3, () => beats(6, 5)), // Ed 7–3 Fay
    ...repeat(3, () => beats(3, 4)), ...repeat(7, () => beats(4, 3)), // Cy 3–7 Di
  ], NAMES);
  expect(r.closest!.pair).toMatchObject({ a: 3, b: 4 });      // tied at 0.2 and on games: names
  expect(r.mostLopsided!.pair).toMatchObject({ a: 3, b: 4 });
  expect(r.closest!.closeness).toBe(0.2);
});
```

  Also `has nothing without counted games` (`computeRivals([], NAMES)`: `players` `[]`, no pairs,
  all four picks null), and `adds up on the contract fixture` (`parseStatsData` of
  `./fixtures/recorded-games.json`, `countedGames(games, DEFAULT_FILTER)` (the fixture has CPU
  seats in some games; every fixture test in this phase runs on these counted games), names from
  its `players`: every pair has `together + opposed === shared`, `aWins <= opposed` and
  `fascistTogether <= together`; the sum of `shared` equals the sum over games of `h·(h − 1)/2`
  for `h = humanSeats(game).length`, and that sum is above 0).
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/stats/rivals.test.ts`. Expected: FAIL
  (`rivals.ts` and `testRivals.ts` do not exist).
- [ ] **Step 3: Implement** `testRivals.ts`, then `rivals.ts` as in Interfaces and Rules 1 to 5: one
  pass over each record's human seats, every pair `i < j`; picks chosen by comparators, never by
  insertion order.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): count pairs, duos and rivalries`, ticking box 1.

---

### Task 2: Each player's people and opponents, and who trusts whom

**Files:**
- Modify: `frontend/src/stats/rivals.ts`, `frontend/src/stats/testRivals.ts`, `docs/PLAN.md`
- Test: `frontend/src/stats/rivals.test.ts`

**Interfaces:**
- Consumes: Task 1; `rounds` (`rounds.ts`); `ev` (`game/sampleGames.ts`).
- Produces in `rivals.ts` (Rules 6 and 7; `PlayerRivals`'s field names and shapes are the
  interfaces file's, which Phase 22 reads):

```ts
export interface PlayerRivals {
  opponents: Map<number, { games: number; wins: number; losses: number }>;  // everyone met on opposite sides
  mostPlayedWith: { player: number; games: number } | null;                   // games: shared
  bestTeammate: { player: number; wins: number; games: number } | null;       // games: together, ≥ MIN_GAMES
  nemesis: { player: number; losses: number; games: number } | null;          // games: shared
  favouriteOpponent: { player: number; wins: number; games: number } | null;  // games: shared
}
// RivalStats gains:
//   nominations: Map<number, Map<number, number>>;  president → chancellor → count, no zeros
//   byPlayer: Map<number, PlayerRivals>;            an entry for every one of `players`
```

- Produces in `testRivals.ts`: `nominated(r: number, president: number, chancellor: number, passed:
  boolean): GameEvent[]` (`ev.nominate`, then `ev.election` 3–2 passed or 1–4 failed, at `t = r ·
  60_000`; a failed one adds `ev.tracker` 1).

- [ ] **Step 1: Write the failing tests:**

```ts
it("most played with counts games on either side, ties by name", () => {
  const r = computeRivals([
    ...repeat(3, () => together(1, 2, "LIBERAL", true)),
    ...repeat(2, () => together(1, 3, "LIBERAL", true)), beats(3, 1),
    ...repeat(2, () => together(1, 4, "FASCIST", false)),
  ], NAMES);
  expect(r.byPlayer.get(1)!.mostPlayedWith).toEqual({ player: 2, games: 3 }); // Bo before Cy
  expect(r.byPlayer.get(4)!.mostPlayedWith).toEqual({ player: 1, games: 2 });
});

it("the best teammate needs 5 games together", () => {
  const r = computeRivals([
    ...repeat(3, () => together(1, 2, "LIBERAL", true)), ...repeat(2, () => together(1, 2, "LIBERAL", false)),
    ...repeat(4, () => together(1, 3, "FASCIST", true)), together(1, 3, "LIBERAL", false),
    ...repeat(4, () => together(1, 4, "LIBERAL", true)),
  ], NAMES);
  expect(r.byPlayer.get(1)!.bestTeammate).toEqual({ player: 3, wins: 4, games: 5 });
  expect(r.byPlayer.get(4)!.bestTeammate).toBeNull();
});

it("the nemesis has the most wins against the player; ties by more shared games, then name", () => {
  const r = computeRivals([
    ...repeat(2, () => beats(2, 1)), beats(1, 2),                                         // Bo 2–1, 3 shared
    ...repeat(2, () => beats(3, 1)), ...repeat(2, () => together(1, 3, "LIBERAL", true)), // Cy 2–0, 4 shared
    beats(4, 1),
  ], NAMES);
  expect(r.byPlayer.get(1)!.nemesis).toEqual({ player: 3, losses: 2, games: 4 });
  expect(r.byPlayer.get(4)!.nemesis).toBeNull();
  expect(r.byPlayer.get(2)!.favouriteOpponent).toEqual({ player: 1, wins: 2, games: 3 });
  expect(r.byPlayer.get(1)!.favouriteOpponent).toEqual({ player: 2, wins: 1, games: 3 });
  expect(r.byPlayer.get(1)!.opponents).toEqual(new Map([
    [2, { games: 3, wins: 1, losses: 2 }], [3, { games: 2, wins: 0, losses: 2 }], [4, { games: 1, wins: 0, losses: 1 }],
  ]));
  expect(computeRivals([beats(3, 1), beats(2, 1)], NAMES).byPlayer.get(1)!.nemesis)
    .toEqual({ player: 2, losses: 1, games: 1 });
});

it("the favourite opponent breaks ties by more shared games", () => {
  const r = computeRivals([beats(1, 2), beats(1, 2), beats(1, 3), beats(1, 3),
    together(1, 3, "LIBERAL", false), beats(1, 4)], NAMES);
  expect(r.byPlayer.get(1)!.favouriteOpponent).toEqual({ player: 3, wins: 2, games: 3 });
});

it("counts who nominated whom, human to human", () => {
  const seats: [number | null, Role][] =
    [[1, "LIBERAL"], [2, "LIBERAL"], [3, "FASCIST"], [null, "LIBERAL"], [null, "HITLER"]];
  const r = computeRivals([played(seats, "LIBERAL", [
    ...nominated(1, 0, 1, true), ...nominated(2, 1, 0, false), ...nominated(3, 2, 0, true),
    ...nominated(4, 3, 0, true), ...nominated(5, 4, 1, false), ...nominated(6, 0, 1, false),
  ])], NAMES);
  expect(r.nominations).toEqual(new Map([
    [1, new Map([[2, 2]])], [2, new Map([[1, 1]])], [3, new Map([[1, 1]])],
  ]));
});
```

  Also `a lone player has an entry with no one in it` (one game, player 1 among four CPU seats:
  `players` `[1]`, no pairs, no nominations, `byPlayer.get(1)` the four picks null and
  `opponents` empty), and in the fixture test: `byPlayer.size === players.length`, and the
  nominations' sum equals the `nominate` events of the counted games (`DEFAULT_FILTER`) whose
  `president` and `chancellor` seats both have a player.
- [ ] **Step 2: Run** `npx vitest run src/stats/rivals.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** Rules 6 and 7 in `computeRivals`, and `nominated` in `testRivals.ts`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): find each player's rivals and nominations`, ticking box 2.

---

### Task 3: How games end, and how long they last

**Files:**
- Create: `frontend/src/stats/endings.ts`, `frontend/src/stats/testEndings.ts`
- Test: `frontend/src/stats/endings.test.ts`
- Modify: `docs/PLAN.md`

**Interfaces:**
- Consumes:
  - `counting.ts`: `rate`, `Rate`, `MIN_GAMES`; in tests `countedGames`, `DEFAULT_FILTER`.
  - `elo.ts`: `ELO_PRIOR`; in tests `replayElo`.
  - Tests only: `game`, `seatsOf` (`testGames.ts`); `repeat` (`testRivals.ts`); `parseStatsData`
    (`record.ts`); the fixture.
- Produces in `endings.ts`:

```ts
export const FINISHED_OUTCOMES = ["LIBERAL_POLICIES", "HITLER_EXECUTED", "FASCIST_POLICIES", "HITLER_ELECTED"] as const;
export type FinishedOutcome = (typeof FINISHED_OUTCOMES)[number];
export const OUTCOME_LABELS: Record<FinishedOutcome, string>;  // "Liberal policies", "Hitler executed", "Fascist policies", "Hitler elected"
export const OUTCOME_COLORS: Record<FinishedOutcome, string>;  // Global Constraints' colours
export interface LengthStats { games: number; averageMs: number | null; averageRounds: number | null } // Rule 8
export interface SizeEndings {
  seats: number; games: number; outcomes: Record<FinishedOutcome, number>;
  liberalWins: number; liberalRate: Rate; smoothedLiberalRate: number; length: LengthStats;
}
export interface EndingStats {
  bySize: SizeEndings[];               // sizes with a counted game, ascending
  length: LengthStats;                 // every size
  fastestWin: GameRecord | null; longestGame: GameRecord | null;
}
export function smoothedLiberalRate(liberalWins: number, games: number): number;   // Rule 11
export function outcomeBars(stats: EndingStats): { label: string; parts: { key: string; value: number }[] }[];
export function computeEndings(counted: GameRecord[]): EndingStats;
```

  `outcomeBars` gives one bar per `bySize` entry, labelled `<seats> players`, its parts keyed by
  outcome in `FINISHED_OUTCOMES` order (the chart gets `legend={OUTCOME_LABELS}`).
- Produces in `testEndings.ts`: `MINUTE = 60_000`; `ended(seats: number, outcome: FinishedOutcome,
  options?: { minutes?: number; rounds?: number; complete?: boolean; liberal?: number; fascist?:
  number; events?: GameEvent[] }): GameRecord` (Phase 17's `game` with `seatsOf` of players 1 to
  `seats`; `winner` from the outcome; boards by default 5 L 2 F, 2 L 4 F, 2 L 6 F and 2 L 3 F in
  `FINISHED_OUTCOMES` order, none close or lopsided; 30 minutes, 6 rounds, complete; ids `e1`,
  `e2`, … with `endedAt` an hour apart in call order and `startedAt` `minutes` before it).

- [ ] **Step 1: Write the failing tests:**

```ts
it("counts games by player count and outcome", () => {
  const e = computeEndings([ended(5, "LIBERAL_POLICIES"), ended(7, "FASCIST_POLICIES"),
    ended(5, "HITLER_ELECTED"), ended(5, "LIBERAL_POLICIES"), ended(7, "HITLER_EXECUTED")]);
  expect(e.bySize.map((s) => [s.seats, s.games, s.outcomes, s.liberalWins])).toEqual([
    [5, 3, { LIBERAL_POLICIES: 2, HITLER_EXECUTED: 0, FASCIST_POLICIES: 0, HITLER_ELECTED: 1 }, 2],
    [7, 2, { LIBERAL_POLICIES: 0, HITLER_EXECUTED: 1, FASCIST_POLICIES: 1, HITLER_ELECTED: 0 }, 1],
  ]);
  expect(outcomeBars(e)[0]).toEqual({ label: "5 players", parts: [
    { key: "LIBERAL_POLICIES", value: 2 }, { key: "HITLER_EXECUTED", value: 0 },
    { key: "FASCIST_POLICIES", value: 0 }, { key: "HITLER_ELECTED", value: 1 }] });
  expect(outcomeBars(e).map((b) => b.label)).toEqual(["5 players", "7 players"]);
});

it("rates Liberal wins per player count: raw from 5 games, smoothed at any count", () => {
  const [five, six] = computeEndings([
    ...repeat(4, () => ended(6, "LIBERAL_POLICIES")), ...repeat(6, () => ended(6, "FASCIST_POLICIES")),
    ended(5, "LIBERAL_POLICIES"), ended(5, "HITLER_EXECUTED"), ended(5, "HITLER_ELECTED"),
  ]).bySize;
  expect(five.liberalRate.value).toBeNull();
  expect(five.smoothedLiberalRate).toBe(7 / 13);
  expect(six.liberalRate).toEqual({ hits: 4, chances: 10, value: 0.4 });
  expect(six.smoothedLiberalRate).toBe(0.45);
  expect(smoothedLiberalRate(0, 0)).toBe(0.5);
});

it("smooths the rate as the Elo handicap does", () => {
  const earlier = (["LIBERAL_POLICIES", "FASCIST_POLICIES", "FASCIST_POLICIES", "HITLER_EXECUTED",
    "HITLER_ELECTED", "FASCIST_POLICIES"] as const).map((o) => ended(7, o));
  const next = ended(7, "LIBERAL_POLICIES");
  const p = computeEndings(earlier).bySize[0].smoothedLiberalRate;
  expect(p).toBe(7 / 16);
  expect(replayElo([...earlier, next]).games.get(next.id)!.handicap)
    .toBeCloseTo(400 * Math.log10((1 - p) / p), 9);
});

it("averages length and rounds, leaving out games not recorded from their start", () => {
  const e = computeEndings([ended(5, "LIBERAL_POLICIES", { minutes: 30, rounds: 6 }),
    ended(5, "HITLER_ELECTED", { minutes: 50, rounds: 8 }),
    ended(5, "LIBERAL_POLICIES", { minutes: 5, rounds: 3, complete: false }),
    ended(8, "FASCIST_POLICIES", { minutes: 70, rounds: 10 })]);
  expect(e.bySize.map((s) => [s.seats, s.games, s.length])).toEqual([
    [5, 3, { games: 2, averageMs: 40 * MINUTE, averageRounds: 7 }],
    [8, 1, { games: 1, averageMs: 70 * MINUTE, averageRounds: 10 }],
  ]);
  expect(e.length).toEqual({ games: 3, averageMs: 50 * MINUTE, averageRounds: 8 });
});

it("the fastest win and the longest game: ties by rounds, then the earlier game", () => {
  const a = ended(5, "LIBERAL_POLICIES", { minutes: 30, rounds: 6 });
  const b = ended(5, "FASCIST_POLICIES", { minutes: 30, rounds: 5 });
  const c = ended(6, "HITLER_ELECTED", { minutes: 90, rounds: 9 });
  const d = ended(6, "HITLER_EXECUTED", { minutes: 90, rounds: 9 });
  const restored = ended(5, "LIBERAL_POLICIES", { minutes: 1, rounds: 1, complete: false });
  const e = computeEndings([d, restored, c, b, a]);
  expect(e.fastestWin).toBe(b);
  expect(e.longestGame).toBe(c);
});
```

  Also `has nothing without counted games` (`bySize` `[]`, `length` `{ games: 0, averageMs: null,
  averageRounds: null }`, both games null), and `adds up on the contract fixture` (on
  `countedGames(games, DEFAULT_FILTER)`: the sizes' `games` sum to `counted.length`, each size's
  `outcomes` sum to its `games`, and `length.games` is the number of complete counted games).
- [ ] **Step 2: Run** `npx vitest run src/stats/endings.test.ts`. Expected: FAIL (no
  `endings.ts`).
- [ ] **Step 3: Implement** `testEndings.ts`, then `endings.ts` as in Interfaces and Rules 8 and 11.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): count how games end and how long they last`, ticking
  box 3.

---

### Task 4: Final boards and the most in one game

**Files:**
- Modify: `frontend/src/stats/endings.ts`, `frontend/src/stats/testEndings.ts`, `docs/PLAN.md`
- Test: `frontend/src/stats/endings.test.ts`

**Interfaces:**
- Consumes: Task 3; `rounds` (`rounds.ts`); `ev` (`game/sampleGames.ts`).
- Produces in `endings.ts` (Rules 9 and 10):

```ts
export const FINISHES_SHOWN = 10;
export interface GameCount { game: GameRecord; count: number }
export function isClosestFinish(record: GameRecord): boolean;
export function isLopsidedFinish(record: GameRecord): boolean;
// EndingStats gains:
//   closestFinishes: GameRecord[]; lopsidedFinishes: GameRecord[];   newest first, all of them
//   mostChaos: GameCount | null; mostFailedElections: GameCount | null; mostVetoes: GameCount | null;
```

- Produces in `testEndings.ts` (seat 0 president and seat 1 chancellor throughout, built from `ev`,
  `t` rising): `failed(r: number, tracker: number): GameEvent[]` (a nomination voted down 1–4, the
  tracker moving to `tracker`); `chaosRun(r: number): GameEvent[]` (`failed` in rounds `r`, `r + 1`
  and `r + 2` with trackers 1, 2 and 3, then `L` enacted by chaos in round `r + 2`); `vetoed(r:
  number, accepted: boolean, tracker = 1): GameEvent[]` (passed 3–2, `LFF` drawn, the `L`
  discarded, a veto, the answer; accepted, the tracker moves to `tracker`, and at 3 `L` is enacted
  by chaos in round `r`; refused, the chancellor enacts `F`).

- [ ] **Step 1: Write the failing tests:**

```ts
it("lists closest and most lopsided finishes, newest first", () => {
  const a = ended(6, "HITLER_ELECTED", { liberal: 4, fascist: 3 });
  const b = ended(7, "HITLER_EXECUTED", { liberal: 3, fascist: 5 });
  const c = ended(5, "LIBERAL_POLICIES", { liberal: 5, fascist: 4 });
  const d = ended(5, "LIBERAL_POLICIES", { liberal: 5, fascist: 0 });
  const f = ended(8, "FASCIST_POLICIES", { liberal: 0, fascist: 6 });
  const g = ended(9, "FASCIST_POLICIES", { liberal: 4, fascist: 6 });
  const e = computeEndings([a, b, c, d, f, g]);
  expect(e.closestFinishes).toEqual([g, b, a]);
  expect(e.lopsidedFinishes).toEqual([f, d]);
});

it("finds the most chaos policies, failed elections and vetoes in one game", () => {
  const a = ended(5, "LIBERAL_POLICIES", { events: [...chaosRun(1), ...vetoed(4, true, 1), ...vetoed(5, true, 2), ...vetoed(6, false)] });
  const b = ended(5, "FASCIST_POLICIES", { events: [...chaosRun(1), ...failed(4, 1), ...failed(5, 2), ...vetoed(6, true, 3)] });
  const c = ended(5, "HITLER_ELECTED", { events: [...chaosRun(1), ...chaosRun(4), ...failed(7, 1)] });
  const e = computeEndings([c, a, b]);
  expect(e.mostChaos).toEqual({ game: b, count: 2 });           // one by a veto; c ties it later
  expect(e.mostFailedElections).toEqual({ game: c, count: 7 });
  expect(e.mostVetoes).toEqual({ game: a, count: 2 });           // the refused one is not counted
});
```

  Also `has no record nobody set` (`computeEndings([ended(5, "LIBERAL_POLICIES")])`: both lists
  empty, the three counts null), and in the fixture test (the same counted games): `mostChaos?.count
  ?? 0` equals the most `enact` events by `chaos` in one counted game, `mostFailedElections` the most `election` events
  with `passed: false`, and `mostVetoes` the most `vetoAnswer` events with `accepted: true` (so
  `rounds` and the recorder agree).
- [ ] **Step 2: Run** `npx vitest run src/stats/endings.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** Rules 9 and 10, and the three builders.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): find close finishes and the wildest games`, ticking box 4.

---

### Task 5: The player matrix

**Files:**
- Create: `frontend/src/stats/tabs/PlayerMatrix.tsx`, `frontend/src/stats/tabs/PlayerMatrix.css`
- Test: `frontend/src/stats/tabs/PlayerMatrix.test.tsx`
- Modify: `docs/PLAN.md`

**Interfaces:**
- Consumes: `PlayerName` (Phase 15); `ScrollRegion` (Phase 17).
- Produces:

```ts
export interface MatrixCell { text: string; sub?: string; title: string; tone?: "ahead" | "behind" }
export function PlayerMatrix(props: {
  title: string;                         // its card's title: the region is "<title> table"
  players: number[]; names: Map<number, string>;
  cell: (row: number, column: number) => MatrixCell | null;   // never called on the diagonal
}): JSX.Element;
```

  Markup: Phase 17's `ScrollRegion`, named `<title> table`, around `table.player-matrix`: a header
  row (an empty `td` corner, then a `th scope="col"` per player), and a row per player (`th
  scope="row"`, then a `td` per column: `.is-self` and empty on the diagonal; empty for a null
  cell; else `text`, then `sub` in `span.player-matrix-sub`, `title` on the `td`, `.is-ahead` or
  `.is-behind` from `tone`). Names are `PlayerName`s. The tabs put their other tables in a
  `ScrollRegion` too, with the `player-matrix` class, each row led by a `th`.
  CSS (`PlayerMatrix.css`, the table only; the region's is Phase 17's): `border-collapse: separate;
  border-spacing: 0`; cells `white-space: nowrap`, centred, `padding: 0.35em 0.6em`, tabular
  numbers; each row's first cell `position: sticky; left: 0; z-index: 1`, left-aligned;
  `.player-matrix-sub` on its own line at 0.75em in `--textColorOnDark`; colours as Global
  Constraints; in the stacked query every `th` and `td` `height: 44px` (`box-sizing: border-box`; a
  cell's height is its row's minimum), so every row is at least 44px tall.

- [ ] **Step 1: Write the failing test:**

```tsx
it("draws a row and a column per player in its card's scroll region, the diagonal blank", () => {
  render(<PlayerMatrix title="Opponents" players={[1, 2, 3]} names={new Map([[1, "Ann"], [2, "Bo"], [3, "Cy"]])}
    cell={(r, c) => (r === 3 ? null : { text: `${r}:${c}`, sub: "x", title: `t${r}${c}`, tone: r < c ? "ahead" : "behind" })} />);
  const region = screen.getByRole("region", { name: "Opponents table" });
  expect(within(region).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Ann", "Bo", "Cy"]);
  expect(within(region).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Ann", "Bo", "Cy"]);
  const rows = within(region).getAllByRole("row");
  const ann = within(rows[1]).getAllByRole("cell");
  expect(ann.map((c) => c.textContent)).toEqual(["", "1:2x", "1:3x"]);
  expect(ann[0]).toHaveClass("is-self");
  expect(ann[1]).toHaveAttribute("title", "t12");
  expect(ann[1]).toHaveClass("is-ahead");
  expect(within(rows[3]).getAllByRole("cell").map((c) => c.textContent)).toEqual(["", "", ""]);
});
```

- [ ] **Step 2: Run** `npx vitest run src/stats/tabs/PlayerMatrix.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `PlayerMatrix.tsx` and `PlayerMatrix.css` as in Interfaces.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the player matrix`, ticking box 5.

---

### Task 6: The RIVALS tab

**Files:**
- Modify: `frontend/src/stats/tabs/RivalsTab.tsx`, `frontend/src/stats/testRivals.ts`,
  `docs/PLAN.md`
- Create: `frontend/src/stats/tabs/RivalsTab.css`
- Test: `frontend/src/stats/tabs/RivalsTab.test.tsx`

**Interfaces:**
- Consumes: Tasks 1, 2 and 5; `StatCard`, `ScrollRegion`, `buildStats`, `formatPercent` (Phase
  17); `PlayerName`, `plural` (Phase 15).
- Produces: `RivalsTab({ stats }: { stats: StatsContext })`, computing `computeRivals(stats.counted,
  stats.names)` in a `useMemo` on those two. In `testRivals.ts`: `statsOf(games: GameRecord[], cpu
  = false): StatsContext` (`buildStats` of `NAMES` as the players and `games`, with `{ players:
  null, cpu }`).

  The cards, in order. With no counted game every card gets `empty`; otherwise a card with nothing
  to show gets its note as `empty`. The four matrices and People take their note while fewer than
  two players have games.

  | Title | Definition | Content | Note |
  |---|---|---|---|
  | Best duo | The best win rate on the same side, over 5 or more games together. | `p.rivals-headline` `<A> & <B>` (Rule 3's order; headline names plain, as Global Constraints says), then `p.rivals-figure` `<rate> · won <w> of <n>` | No pair has 5 games on the same side yet. |
  | Best Fascist duo | The same, counting only games together on the Fascist side. | as Best duo, from the Fascist counts | No pair has 5 games together on the Fascist side yet. |
  | Closest rivalry | Of pairs with 5 or more games on opposite sides, the most even. | headline `<X> <w>–<l> <Y>` (more wins first; when even, by name), figure `plural(n, "game")` | No pair has 5 games on opposite sides yet. |
  | Most lopsided rivalry | Of pairs with 5 or more games on opposite sides, the most one-sided. | as Closest rivalry | as Closest rivalry |
  | Teammates | Win rate together on the same side (from 5 games), over games together. | `PlayerMatrix`: text the rate or `—`, sub the games; title `<A> and <B>: won <w> of <n> together`; null with no game together | No two players have shared a game yet. |
  | Opponents | Each row's wins and losses against each column, on opposite sides. | `PlayerMatrix`: `<w>–<l>` from `against`, tone ahead or behind when unequal, title `<A> against <B>: won <w>, lost <l>`; null when never opposed | as Teammates |
  | People | Most played with: the most games together, on either side. Nemesis: the most losses to one opponent. Favourite opponent: the most wins against one. | `ScrollRegion` and `table.player-matrix`: `Player`, `Most played with`, `Nemesis`, `Favourite opponent`; a row per player: `<name> · <plural(n, "game")>`, `<name> · lost <n>`, `<name> · won <n>`, `—` when null | as Teammates |
  | Who trusts whom | How often each president (row) nominated each chancellor (column). | `PlayerMatrix`: the count; title `<A> nominated <B> once` or `… <n> times`; null at 0 | as Teammates |

  Layout (`RivalsTab.css`): the root `div.rivals-tab` is a grid, `grid-template-columns:
  repeat(auto-fill, minmax(min(100%, 18em), 1fr))`, `gap: 16px`, every child `min-width: 0`; the
  four headline cards first, then the other four with `className="rivals-wide"` (`grid-column: 1 /
  -1`). `.rivals-headline` 1.4em bold, `.rivals-figure` in `--textColorOnDark`.

- [ ] **Step 1: Write the failing tests** (`GAMES = [...repeat(4, () => together(1, 2, "LIBERAL",
  true)), together(1, 2, "LIBERAL", false), ...repeat(3, () => beats(1, 3)), ...repeat(2, () =>
  beats(3, 1)), together(1, 3, "LIBERAL", true)]`, rendered from `statsOf(GAMES)`):
  - `shows every card`: a region named by each of the eight titles.
  - `shows the best duo and the rivalries`: `screen.getByText("80% · won 4 of 5")`'s
    `previousElementSibling` reads `Ann & Bo`; the `.rivals-headline` texts are `["Ann & Bo", "Ann
    3–2 Cy", "Ann 3–2 Cy"]`; "No pair has 5 games together on the Fascist side yet." shows.
  - `reads the opponents matrix as row against column`: in region `Opponents table`, Ann's row's
    cells read `["", "", "3–2"]`, the last with title `Ann against Cy: won 3, lost 2` and class
    `is-ahead`; Cy's row's read `["2–3", "", ""]`, the first `is-behind`.
  - `shows a dash for teammates under 5 games together`: in region `Teammates table`, Ann's row's
    cells read `["", "80%5", "—1"]`.
  - `says so without counted games`: `statsOf([])`: the eight regions, no `table`.
  - `a lone player gets notes, not tables`: `statsOf([played([[1, "LIBERAL"], [null, "LIBERAL"],
    [null, "LIBERAL"], [null, "FASCIST"], [null, "HITLER"]], "LIBERAL")], true)`: no `table`;
    "No two players have shared a game yet." four times; "No pair has 5 games on the same side
    yet." once.
- [ ] **Step 2: Run** `npx vitest run src/stats/tabs/RivalsTab.test.tsx`. Expected: FAIL (the
  placeholder).
- [ ] **Step 3: Implement** `RivalsTab.tsx`, `RivalsTab.css` and `statsOf` as in Interfaces.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): fill the rivals tab`, ticking box 6.

---

### Task 7: The ENDINGS tab

**Files:**
- Modify: `frontend/src/stats/tabs/EndingsTab.tsx`, `docs/PLAN.md`
- Create: `frontend/src/stats/tabs/EndingsTab.css`
- Test: `frontend/src/stats/tabs/EndingsTab.test.tsx`

**Interfaces:**
- Consumes: Tasks 3 to 5; `StatCard`, `StackedBarChart`, `ScrollRegion`, `formatPercent` (Phase
  17); `StatsLink`, `PlayerName`, `outcomeLabel`, `formatDuration`, `formatLocalDateTime`, `plural`,
  `routePath` (Phase 15); `statsOf` (`testRivals.ts`), `ended` (`testEndings.ts`).
- Produces: `EndingsTab({ stats }: { stats: StatsContext })`, computing
  `computeEndings(stats.counted)` in a `useMemo`. Every game link is `<StatsLink href={routePath({
  page: "game", id })} className="endings-game-link">` (`display: inline-flex; align-items: center;
  min-height: 44px; min-width: 44px`).

  The cards, in order. With no counted game every card gets `empty`; otherwise a card with nothing
  to show (Game length, Fastest win and Longest game with no complete game; a finish list with
  none) gets its note as `empty`:

  | Title | Definition | Content | Note |
  |---|---|---|---|
  | How games are won | Counted games by the number of players and how they ended. | `StackedBarChart` with `bars={outcomeBars(e)}`, `colors={OUTCOME_COLORS}`, `legend={OUTCOME_LABELS}`, `label="How games are won"` | |
  | Liberal win rate by player count | Smoothed: pulled toward a half by five imaginary games each way, the rate the Elo handicap uses. | `ScrollRegion` and `table.player-matrix`: `Players`, `Games`, `Liberal wins`, `Win rate`, `Smoothed`; a row per size, `—` for a rate under 5 games | |
  | Game length | From start to end, over games recorded from their start. | `ScrollRegion` and `table.player-matrix`: `Players`, `Games`, `Average length` (`formatDuration`), `Average rounds` (one decimal); a row per size, then `All`; `—` with no complete game | No game recorded from its start yet. |
  | Fastest win | The shortest game recorded from its start. | `p.endings-headline` `<formatDuration> · <n> rounds`; `outcomeLabel`; the seats in turn order as `PlayerName`s with their roles, `, ` between; a link `See this game` | No game recorded from its start yet. |
  | Longest game | The longest game recorded from its start. | as Fastest win | as Fastest win |
  | Most in one game | Chaos policies, failed elections and vetoed agendas. Ties go to the earlier game. | a `ul`: `Chaos policies`, `Failed elections`, `Vetoes`, each `<label>: <count> · ` and a link reading `formatLocalDateTime(endedAt)`, or `<label>: none yet` | |
  | Closest finishes | The losing side one policy from winning: 4 Liberal or 5 Fascist policies. | `plural(n, "game")`, then a `ul` of the `FINISHES_SHOWN` latest, each a link reading `<formatLocalDateTime(endedAt)> · <outcomeLabel> · <L> L, <F> F` | No close finishes yet. |
  | Most lopsided finishes | The losing side's track still at 0. | as Closest finishes | No lopsided finishes yet. |

  Layout (`EndingsTab.css`): `div.endings-tab`, the same grid as RIVALS; How games are won and both
  finish lists with `className="endings-wide"`.

- [ ] **Step 1: Write the failing tests:**
  - `shows every card`: a region named by each of the eight titles.
  - `links each listed game to its page`: `close = ended(6, "HITLER_ELECTED", { liberal: 4,
    fascist: 3 })`, `statsOf([close])`; the link named `` `${formatLocalDateTime(close.endedAt)} ·
    Fascists win · Hitler elected · 4 L, 3 F` `` has `href` `/stats/games/${close.id}`, and both
    `See this game` links have it too.
  - `shows raw and smoothed Liberal rates`: the games of Task 3's rate test; in region `Liberal win
    rate by player count table`, the body rows' `th, td` texts are `["5", "3", "2", "—", "54%"]`
    and `["6", "10", "4", "40%", "45%"]`.
  - `leaves games not recorded from their start out of length`: only `ended(5, "LIBERAL_POLICIES",
    { complete: false })`: "No game recorded from its start yet." three times; "Chaos policies:
    none yet" shows.
  - `says so without counted games`: `statsOf([])`: the eight regions, no link, no `table`.
- [ ] **Step 2: Run** `npx vitest run src/stats/tabs/EndingsTab.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `EndingsTab.tsx` and `EndingsTab.css` as in Interfaces.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): fill the endings tab`, ticking box 7.

---

### Task 8: Browser tests of both tabs

**Files:**
- Create: `frontend/e2e/stats-rivals.spec.ts` (`stats-*` files already run in all four projects)
- Modify: `docs/PLAN.md`

**Interfaces:**
- Consumes, all from Phase 15's `e2e/stats.ts` (`./stats`): `stubStats`, `bigStatsData`,
  `statsSizesFor(project, viewport)` (the sizes this project checks), and `checkStatsPage(page,
  size)` (no sideways scroll, content inside a sideways scroller such as a `ScrollRegion` not
  counted; 44px targets and field text where the stacked query matches); `settle`
  (`e2e/lobby.ts`); `routePath` (`../src/stats/routes`). Nothing imported reaches `src/constants`
  (Global Constraints). The spec writes no sideways check of its own.

- [ ] **Step 1: Write the tests.** For each tab (`RIVALS`: `routePath({ page: "tab", tab: "rivals"
  })`, ready when region `Opponents table` shows; `ENDINGS`: `routePath({ page: "tab", tab:
  "endings" })`, ready when region `How games are won` shows): `stubStats(page, bigStatsData())`,
  open the path, wait until ready, `settle`. Both tests walk many sizes, so each starts with
  `test.slow()`.
  - `<TAB> fits every stats size`: `checkStatsPage(page, size)` at each size of
    `statsSizesFor(test.info().project.name, page.viewportSize()!)`; in the phone projects also
    every `table.player-matrix` row in the tab at least 44px tall (`MIN_TARGET` from
    `e2e/layout.ts`).
  - `RIVALS' matrices scroll inside their cards` (phone projects only, at each of their
    `statsSizesFor` sizes; Review Focus 5): for regions `Teammates table`, `Opponents table` and
    `Who trusts whom table`, the region's sides lie within its card's `section` (1px);
    `scrollWidth > clientWidth`; after setting `scrollLeft` to `scrollWidth`, `scrollLeft` is above
    0, `window.scrollX` is 0, and the first `rowheader`'s left is where it was before the scroll
    (1px), so the names stay in view.
- [ ] **Step 2: Run** `E2E_PORT=4620 npx playwright test e2e/stats-rivals.spec.ts --project=desktop
  --project=phone-360 --project=phone-412` (Java 17), then `firefox`, `phone-360` and `phone-412`
  in the Linux image as Global Constraints says. Expected: PASS everywhere. Fix the CSS, not the
  test, for anything that does not fit.
- [ ] **Step 3: Commit** `test(frontend): check rivals and endings at every size`, ticking box 8.

---

### Task 9: Docs

**Files:**
- Modify: `CLAUDE.md` (Layout, the stats part: RIVALS from `rivals.ts` and ENDINGS from
  `endings.ts` in a sentence each, Rules 1, 5, 8 and 10 in a clause each, `PlayerMatrix` (a
  table in Phase 17's `ScrollRegion` that scrolls inside its card, the first column held), `testRivals.ts` and
  `testEndings.ts`, and `stats-rivals.spec.ts` beside the other specs), `README.md` (the stats line
  of "What this fork adds", if it lists the tabs), `DEVELOPMENT.md` (only if it lists the stats
  specs or tabs), `docs/PLAN.md`

- [ ] **Step 1: Update the docs** as in Files, in the voice of the text around them; nothing names a
  real host or deploy tool.
- [ ] **Step 2: Commit** `docs(claude): describe the rivals and endings tabs`, and
  `docs(readme): …` or `docs(development): …` for those that changed, ticking box 9 in the last.

---

### Task 10: Review

- [ ] **Step 1: Review the branch** against `origin/development` with the `code-review` skill
  (standards and the spec), plus a check of every Rule, Global Constraint and Review Focus line.
- [ ] **Step 2: Fix every finding,** Minor ones too, each in its own commit with its test where one
  applies; a finding that needs no change gets its reason. Keep the findings, fixes and reasons for
  the pull request's Review section.
- [ ] **Step 3: Run everything:** `cd backend && ./gradlew test`; `cd frontend && npm test -- --run
  && npm run build`; `E2E_PORT=4620 npm run e2e` (`desktop`, `phone-360`, `phone-412`; `firefox`
  in the Linux image if it will not launch). Expected: all pass; note the counts for the PR.
- [ ] **Step 4: Commit** the last fix (or, with none, the boxes alone as `chore(plan): tick phase
  20's review`), ticking box 10 and the acceptance's first box (the tests pass in all four
  projects).

---

### Task 11: Screenshots and the pull request

**Files:**
- Create: `docs/pr/phase-20-rivals-endings/` `before-rivals-1600x900.png`,
  `before-rivals-412x915.png`, `before-endings-1600x900.png`, `before-endings-412x915.png`, and the
  four `after-…` images
- Temporary, never committed: `frontend/e2e/pr-shots.spec.ts`

- [ ] **Step 1: Write the shot spec** (importing only `./stats`, `./lobby` and `routes.ts`, like
  Task 8): for `rivals` and `endings`, `stubStats(page, bigStatsData())`, open `routePath({ page:
  "tab", tab })`, wait for the tab's root or the text `Coming in a later
  update.` (the placeholder), `settle`, and take a full-page screenshot to
  `$PR_SHOTS_DIR/$PR_SHOTS_PREFIX-<tab>-<width>x<height>.png`: 1600x900 in `desktop`, 412x915 in
  `phone-412`.
- [ ] **Step 2: Take the shots.** "After" on the branch (`PR_SHOTS_PREFIX=after`,
  `E2E_PORT=4620`); "before" in a worktree of `origin/development` named `phase-20-before-shots`,
  nested under this one, with the spec copied in, `npm ci`, `PR_SHOTS_PREFIX=before` and
  `E2E_PORT=4720`; `PR_SHOTS_DIR` is the branch's `docs/pr/phase-20-rivals-endings/` in both. Then
  remove that worktree and delete the spec.
- [ ] **Step 3: Commit** the eight images `docs(docs): add the rivals and endings screenshots`,
  ticking box 11.
- [ ] **Step 4: Open the pull request:** push, and `gh pr create --repo jussaw/Secret-Hitler-Online
  --base development`, titled `feat(frontend): the rivals and endings tabs`, its body following
  `CLAUDE.md`'s Workflow: the before-and-after table near the top (raw URLs pinned to the
  screenshots' commit), what changed, the Rules in short, where the merged code differed from this
  plan, the test counts, the Review section, and `Part of #31`. Loop on CI (`gh pr checks --watch
  --repo jussaw/Secret-Hitler-Online`) until green, fixing what fails from its logs and the kept
  Playwright report.
- [ ] **Step 5: Rebase whenever a phase running beside this one (17B, 18, 19 or 21A) merges
  first:** `git fetch
  origin && git rebase origin/development`; in `CLAUDE.md`, `README.md`, `DEVELOPMENT.md` and
  `docs/PLAN.md` keep both sides; run Task 10's step 3 again; `git push
  --force-with-lease`; re-pin the PR body's image links to the screenshots' new commit (`git log -1
  --format=%H -- docs/pr/phase-20-rivals-endings`); loop on CI again.
- [ ] **Step 6: Merge under the user's standing OK:** tick "PR merged into `development`" and set
  the Progress table's Phase 20 row to `done` in a last commit (`chore(plan): tick phase 20's
  merge`), push, wait for green, then squash it with a Conventional subject: `gh pr merge <N>
  --squash --admin --subject "feat(frontend): the rivals and endings tabs (#<N>)" --repo
  jussaw/Secret-Hitler-Online`. Check that `development`'s image publishes (`gh run list --repo
  jussaw/Secret-Hitler-Online --branch development --limit 1`).
