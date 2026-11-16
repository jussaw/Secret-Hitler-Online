# Phase 18: ROLES & CARDS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the ROLES & CARDS tab (`/stats/roles`) with each player's role and card stats over the
counted games: role split and luck, win rates by role, table size and first presidency, the hands
they drew and what they discarded, their choices as chancellor, vetoes, and blame (issue #31).

**Architecture:** Two pure modules turn `stats.counted` into numbers keyed by player number:
`roles.ts` from each record's seats and winner (and its first round), `cards.ts` from
`rounds(record)` alone. `tabs/RolesTab.tsx` memoizes both per `stats.counted` and draws four
sections of Phase 17A's `StatCard`s: one number per player through `rankRows` and `RankedTable`, and
every split (by role, size, hand or office) through `SplitTable`, which scrolls inside its card. No
shared source file changes.

**Tech Stack:** React 18, TypeScript 5, Vitest 5 with Testing Library, `@playwright/test` 1.64.1,
plain CSS. No new dependency.

**Spec:** [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](../specs/2026-11-15-game-stats-design.md)
("ROLES & CARDS (Phase 18)", "Counting rules", "Cards", "The record", Constraints, Tests), with the
names every phase shares in [`2026-11-15-game-stats-interfaces.md`](2026-11-15-game-stats-interfaces.md)
(its "Settled after the plans were written" section wins over every breakdown, this one included).
Parent plan: [`docs/PLAN.md`](../../PLAN.md), Phase 18. Where this plan and the spec differ, the
spec wins; where a shared name is missing or wrong, report it, never patch another phase's file.

## Global Constraints

- **Files.** Phase 18 creates and changes only `frontend/src/stats/roles.ts`, `cards.ts`,
  `tabs/RolesTab.tsx` (each with its `.test.ts`/`.test.tsx` beside it, and `tabs/RolesTab.css`),
  `frontend/e2e/stats-roles.spec.ts`, `docs/pr/phase-18-roles-cards/`, and the docs (`CLAUDE.md`,
  `README.md`, `DEVELOPMENT.md`, Phase 18's section and Progress row in `docs/PLAN.md`). Phase 18
  needs Phases 16 and 17A (the engine and shared pieces) merged, and runs beside 17B (OVERVIEW),
  19, 20 and 21A, each on its own files.
- **Shared helpers come from their owners**, never a private copy: `plural`, `PlayerName`
  (Phase 15); `rate` (`min` defaults to `MIN_CHANCES`), `rankRows` (`compare` negative when `a`
  ranks above `b`), `humanSeats`, `seatWon`, `formatPercent`, `formatSigned`,
  `StatCard` (`empty?: boolean | string`, `className?`, `NO_GAMES`), `RankedTable` (`countLabel`,
  `showCount`), `SplitTable` (with the interfaces file's props exactly), the `testGames.ts` builders
  (Phase 17A); `rounds` and the `ev` builders of `game/sampleGames.ts` (Phase 16).
- **Counted games only** (`stats.counted`, already in order: `endedAt`, then `id`).
- **Sides:** Liberal side `LIBERAL`; Fascist side `FASCIST` and `HITLER`. "As Fascist" in a split by
  role means `FASCIST` seats only, beside "as Hitler". Where both count, the copy says "Fascist or
  Hitler".
- **Minimum samples:** `MIN_GAMES` (5) for a rate over games, `MIN_CHANCES` (5) for a rate over
  chances, always passed explicitly. Below it a player shows "—" and their count and is not ranked.
- **Ties:** equal values share a rank, then more games (or chances) first, then names (`rankRows`).
- **CPU seats** are never ranked and have no stats; with the toggle on, their games count for the
  humans in them. `byPlayer` never has a key for a CPU seat.
- **Liberal seats per size:** 3 of 5, 4 of 6, 4 of 7, 5 of 8, 5 of 9, 6 of 10.
- **Cards and blame come from `rounds(record)`**, never from `record.events`.
- **Copy:** the no-games line is `NO_GAMES` ("No games yet with these players."); titles,
  definitions and every other line as Task 5's table gives them.
- **Layout:** the page may scroll down but never sideways at every `statsSizes` size (320x568 to
  1920x1080), with 44px targets on phones: Phase 15's `checkStatsPage` is the one check. Wide
  tables scroll inside their own card (`SplitTable`).
- **No new art or dependency.** Colours from `variables.css` and Phase 17A's components.
- **The stats chunk:** nothing outside `frontend/src/stats/` imports these files.
- **Linux fonts:** CI draws Germania One 11–17% wider than macOS at phone sizes; run the phone
  projects in `mcr.microsoft.com/playwright:v1.64.1-noble` (`DEVELOPMENT.md`, "Browser tests on
  Linux") before pushing CSS.
- **Environment:** `JAVA_HOME` at a Java 17 (an installed 17 on the
  build machine) for `npm run e2e`: the Gradle wrapper fails on newer JDKs. Browser tests on
  `E2E_PORT=4618`, the "before" screenshots on `E2E_PORT=4718`, so phases running together never
  share a port.
- **ES2020:** the frontend targets ES2020 and the build type-checks the tests, so no `.at()`,
  `Object.hasOwn`, `replaceAll`, `findLast` or anything newer, in code or tests.
- **Browser tests** import nothing that imports `src/constants` (it reads `window` when it loads) and
  no component (they import CSS); a page at every size calls `test.slow()`.
- **Branch and commits:** branch and worktree `phase-18-roles-cards`. Conventional Commits with a
  scope (`frontend`, `plan`, `docs`, `claude`, `readme`, `development`), at most 72 characters,
  each test committed with the code it tests. Task N ticks the Nth box of Phase 18 in
  `docs/PLAN.md` in its commit. Stage files by name: the "before" screenshots stay untracked until
  Task 9. The PR is squashed into `development` (`gh pr merge --squash --admin`).
- **Public repo:** no host, path, domain or deploy detail in code, docs, commits or the PR.

## Review Focus

1. **CPU seats with the toggle on.** A CPU president's hand, a CPU chancellor's enact or veto, and
   a CPU seat's blame credit no player, and `byPlayer` gets no key for them; the group's hands still
   count a CPU president's. Tasks 1, 3 and 4 test it.
2. **A record with `complete: false`** (restored from a backup older than the recorder): its first
   recorded nomination is not the game's first, so it never counts for First president; a round
   with no hand (the timeline starts mid-term) is skipped without throwing. Tasks 2 and 3 test it.
3. **Vetoes.** An accepted veto, including one whose tracker move enacted the top policy by chaos,
   counts toward no chancellor's choice or policy; after a refused one, the enact counts. Task 4
   tests it.
4. **A player renamed since a game.** Every table shows the name from `players` (`stats.names`),
   never a seat's name at the time. Task 5 tests it.
5. **Twelve-character names in seven-column tables at 320px.** The table scrolls inside its card
   rather than squeezing, and `checkStatsPage` passes (it leaves out what scrolls inside a box,
   such as a `ScrollRegion` or the phone tab row). Task 6 tests it.

## Setup (before Task 1)

- [ ] Make the worktree and branch `phase-18-roles-cards` off an up-to-date `origin/development`
  once Phases 16 and 17A have merged (Phase 18 starts only then; it does not wait for 17B). In
  `frontend/`:
  `npm ci && npx playwright install chromium firefox`. Check the ports are free (`lsof
  -iTCP:4618 -sTCP:LISTEN` and the same for 4718 print nothing).
- [ ] Read what this phase consumes, as merged: `record.ts`, `rounds.ts` and
  `game/sampleGames.ts` (`ev`), `counting.ts`, `testGames.ts` (`game`, `seatsOf`), `numbers.ts`, `StatCard.tsx`, `RankedTable.tsx`, `SplitTable.tsx` (its props as the
  interfaces file pins them), `format.ts` (`plural`), `PlayerName.tsx`, `TabRow.tsx`, `tabs/RolesTab.tsx` (and any
  `RolesTab.test.tsx`), `e2e/stats.ts`. Where one differs from the interfaces file, report it
  before going on. Run `npm run build` and note the size of the main (non-stats) chunk.
- [ ] **"Before" screenshots.** Write `frontend/e2e/pr-shots.spec.ts` (never committed):
  `test.skip(!process.env.PR_SHOTS)`, then one test that sets 1600x900 in `desktop` and 412x915 in
  `phone-412` (`testInfo.project.name`), calls `stubStats(page, bigStatsData())`, opens
  `/stats/roles`, calls `settle(page)` and saves a full-page screenshot to
  `../docs/pr/phase-18-roles-cards/${process.env.PR_SHOTS}-roles-<W>x<H>.png`. Run
  `PR_SHOTS=before E2E_PORT=4718 npx playwright test e2e/pr-shots.spec.ts --project=desktop
  --project=phone-412`. Expected: two PNGs of Phase 17A's placeholder card.

---

### Task 1: Role split, role luck, times as Hitler and the longest run

**Files:**
- Create: `frontend/src/stats/roles.ts`
- Test: `frontend/src/stats/roles.test.ts`
- Modify: `docs/PLAN.md` (box 1; Progress row 18 to "in progress")

**Interfaces:**
- Consumes: `GameRecord`, `Role`, `parseStatsData` (`record.ts`); `Rate`, `rate`, `MIN_GAMES`,
  `humanSeats`, `countedGames` (`counting.ts`); `game`, `seatsOf` (Phase 17A's test builders); the
  fixture `./fixtures/recorded-games.json`.
- Produces in `roles.ts`:
  ```ts
  export const LIBERAL_SEATS: Readonly<Record<number, number>> = { 5: 3, 6: 4, 7: 4, 8: 5, 9: 5, 10: 6 };
  export const TABLE_SIZES = [5, 6, 7, 8, 9, 10] as const;
  export interface PlayerRoles {
    games: number;                          // counted games played
    split: Record<Role, Rate>;              // hits: games in that role; chances: games; MIN_GAMES
    expectedLiberalGames: number;           // Σ over their games of LIBERAL_SEATS[seats] / seats (a sum of games)
    luck: number | null;                    // split.LIBERAL.hits / games − expectedLiberalGames / games (a share
                                            // difference); null below MIN_GAMES
    longestRun: { role: Role; length: number };  // most games in a row in one role, over their own games in
                                            // `counted` order (a game they missed breaks nothing); a tie goes to the later run
  }
  export interface RoleStats { byPlayer: Map<number, PlayerRoles> }   // every human player in `counted`
  export function computeRoles(counted: GameRecord[]): RoleStats;
  ```

- [ ] **Step 1: Write the failing tests.** Two builders in the test file:
  `table(n: number, first: Role): Role[]` (`first` in seat 0, then the rest of an n-seat table's
  roles in the order Liberals, Fascists, Hitler: `table(5, "LIBERAL")` is `[L, L, L, F, H]`,
  `table(5, "HITLER")` is `[H, L, L, L, F]`) and `play(i: number, roles: Role[], winner: Side,
  extra?: { players?: (number | null)[]; events?: GameEvent[]; complete?: boolean }): GameRecord`
  (Phase 17A's `game` with id `g<i>`, `endedAt` `T0 + i * 3_600_000`, `seatsOf(players, roles)` with
  players 1…n in seats 0…n−1 unless given, and `events` and `complete` as overrides when given).

```ts
const SIX: Role[] = ["LIBERAL", "LIBERAL", "FASCIST", "HITLER", "LIBERAL", "LIBERAL"];
const six = () => SIX.map((first, i) => play(i + 1, table(5, first), "LIBERAL"));

it("splits each player's games by role, Fascist apart from Hitler", () => {
  const ann = computeRoles(six()).byPlayer.get(1)!;
  expect(ann.games).toBe(6);
  expect(ann.split).toEqual({
    LIBERAL: rate(4, 6, MIN_GAMES), FASCIST: rate(1, 6, MIN_GAMES), HITLER: rate(1, 6, MIN_GAMES),
  });
});
it("counts times as Hitler", () => {
  const { byPlayer } = computeRoles(six());
  expect([1, 4, 5].map((p) => byPlayer.get(p)!.split.HITLER.hits)).toEqual([1, 0, 5]);
});
it("leaves a share unset below MIN_GAMES", () => {
  expect(computeRoles(six().slice(0, 4)).byPlayer.get(1)!.split.LIBERAL).toEqual({ hits: 2, chances: 4, value: null });
});
it("measures role luck against each table size's Liberal seats", () => {
  const firsts: Role[] = ["LIBERAL", "FASCIST", "LIBERAL", "LIBERAL", "HITLER", "LIBERAL"];
  const counted = TABLE_SIZES.map((n, i) => play(i + 1, table(n, firsts[i]), "LIBERAL"));
  const ann = computeRoles(counted).byPlayer.get(1)!;
  expect(ann.expectedLiberalGames).toBeCloseTo(3.61865, 4);   // 3/5 + 4/6 + 4/7 + 5/8 + 5/9 + 6/10
  expect(ann.luck).toBeCloseTo(0.06356, 4);                   // 4/6 − 3.61865/6
  expect(computeRoles(counted.slice(0, 4)).byPlayer.get(1)!.luck).toBeNull();
});
```

  More tests in the same style:
  - `"finds the longest run of one role, the later run on a tie"`: seat 0's roles over eight games
    `L L F F F L L L` give player 1 `{ role: "LIBERAL", length: 3 }`, and player 5 (Hitler in all
    eight) `{ role: "HITLER", length: 8 }`.
  - `"does not break a run on a game the player missed"`: games 1, 2 and 4 put player 1 in seat 0
    as Liberal; game 3 seats players `[9, 2, 3, 4, 5]`. Player 1: `{ role: "LIBERAL", length: 3 }`.
  - `"gives CPU seats no stats and counts their games for the humans"`: one game with players
    `[1, null, null, 2, 3]`: the sorted keys of `byPlayer` are `[1, 2, 3]`; player 2's `games` is 1.
  - `"agrees with the contract fixture"`: every fixture game's count of `LIBERAL` seats equals
    `LIBERAL_SEATS[seats.length]`; over `countedGames(games, { players: null, cpu: true })`, the sum
    of `games` over `byPlayer` equals the sum of `humanSeats(g).length`, and each player's three
    `split` hits add up to their `games`.
- [ ] **Step 2: Run** `cd frontend && npm test -- --run src/stats/roles.test.ts`. Expected: FAIL,
  `./roles` cannot be resolved.
- [ ] **Step 3: Implement `computeRoles(counted: GameRecord[]): RoleStats`** in `roles.ts`: one pass
  over `counted` and `humanSeats(record)`, tallies per player, then the rates.
- [ ] **Step 4: Run** `npm test -- --run src/stats/roles.test.ts && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): count role splits, role luck and runs`, with box 1 ticked
  and Progress row 18 set to "in progress".

---

### Task 2: Win rates by role, by player count and as first president

**Files:**
- Modify: `frontend/src/stats/roles.ts`, `roles.test.ts`, `docs/PLAN.md` (box 2)

**Interfaces:**
- Consumes: Task 1's `roles.ts`; `seatWon` (`counting.ts`); `rounds` (`rounds.ts`); `ev`
  (`game/sampleGames.ts`, tests only).
- Produces: `PlayerRoles` gains
  ```ts
  winAs: Record<Role, Rate>;     // hits: games won in that role (seatWon); chances: games in it; MIN_GAMES
  bySize: Map<number, Rate>;     // seats → wins ÷ games at that size; only sizes they played; MIN_GAMES per size
  firstPresident: Rate;          // wins ÷ games with `complete` true whose first round with a chancellor
                                 // (rounds(record).find((r) => r.chancellor !== null)) has their seat as president; MIN_GAMES
  ```

- [ ] **Step 1: Write the failing tests.** Builder `opening(president: number, failed = false):
  GameEvent[]` (from `ev`): round 1's `nominate` by `president` of seat `(president + 1) % 5` and
  its `election` (passed unless `failed`); when `failed`, then a `tracker` to 1 and round 2's passed
  nomination by seat `(president + 1) % 5`.
  - `"win rates by role need MIN_GAMES each"`: player 1 in seat 0, six games as Liberal (Liberals
    win 4), five as Fascist (Fascists win 2), two as Hitler (Fascists win both): `winAs` equals
    `{ LIBERAL: rate(4, 6, MIN_GAMES), FASCIST: rate(2, 5, MIN_GAMES), HITLER: rate(2, 2, MIN_GAMES) }`,
    so `winAs.FASCIST.value` is `0.4` and `winAs.HITLER.value` is `null`.
  - `"win rate by player count, MIN_GAMES per size"`: player 1 a Liberal in five 5-seat games
    (Liberals win 3) and two 7-seat games (Liberals win 1): `bySize.get(5)` equals
    `rate(3, 5, MIN_GAMES)` (value `0.6`), `bySize.get(7)` equals `{ hits: 1, chances: 2, value: null }`,
    and `bySize.has(6)` is false.
  - `"first president: their seat made the first nomination, failed or not, in complete games
    only"`: player 1 a Liberal in seat 0 of games 1–5 (`opening(0)`; Liberals win games 1, 2 and
    3, Fascists 4 and 5) and game 6 (`opening(0, true)`, Fascists win), plus game 7 with
    `complete: false`, `opening(0)` and a Liberal win: player 1's `firstPresident` equals
    `rate(3, 6, MIN_GAMES)` (value `0.5`); player 2's equals `rate(0, 0, MIN_GAMES)`.
- [ ] **Step 2: Run** `npm test -- --run src/stats/roles.test.ts`. Expected: the three new tests
  fail (`winAs` undefined).
- [ ] **Step 3: Implement** the three fields in `computeRoles`, calling `rounds(record)` only for
  records with `complete` true.
- [ ] **Step 4: Run** `npm test -- --run src/stats/roles.test.ts && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): count win rates by role, size and first president`, box 2
  ticked.

---

### Task 3: Hands drawn, Liberal accuracy and deep cover as president

**Files:**
- Create: `frontend/src/stats/cards.ts`
- Test: `frontend/src/stats/cards.test.ts`
- Modify: `docs/PLAN.md` (box 3)

**Interfaces:**
- Consumes: `rounds`, `Round` (`rounds.ts`); `ev` (`game/sampleGames.ts`, tests only); `rate`,
  `MIN_CHANCES`, `humanSeats`, `countedGames` (`counting.ts`); `game`, `seatsOf`; the record types.
- Produces in `cards.ts`:
  ```ts
  export type HandCounts = [number, number, number, number];   // index: Liberals among the three (FFF, FFL, FLL, LLL)
  export const HAND_LABELS = ["FFF", "FFL", "FLL", "LLL"] as const;
  export interface PlayerCards {
    hands: HandCounts;          // hands drawn as president
    liberalAccuracy: Rate;      // as LIBERAL president with 1 or 2 Liberals: discards of an F ÷ such hands; MIN_CHANCES
    deepCover: Rate;            // the same for FASCIST and HITLER presidents; its complement is the Liberal discards
  }
  export interface CardStats {
    byPlayer: Map<number, PlayerCards>;   // every human player in `counted`, zeros where they never held office
    hands: HandCounts;                    // every hand drawn in `counted`, CPU presidents' too
  }
  export function computeCards(counted: GameRecord[]): CardStats;
  ```
  A round counts toward hands, accuracy and deep cover only with `hand` and `discard` both non-null.

- [ ] **Step 1: Write the failing tests.** Seats 0–4 hold players 1–5 as `LIBERAL, LIBERAL, LIBERAL,
  FASCIST, HITLER` unless a test says otherwise. Builders, from Phase 16's `ev`: `interface TermSpec
  { president: number; chancellor: number; hand: Card[]; discard?: number; enact?: Card; veto?:
  "accepted" | "refused"; chaos?: Card }`; `term(r: number, t: TermSpec): GameEvent[]` gives, in
  order, `nominate`, `election` (passed, 5 Ja, 0 Nein), `draw`, `discard` (index `discard ?? 0`),
  then `veto` and `vetoAnswer` when `veto` is set; then an accepted veto adds a `tracker` move (to 3
  with `chaos`, else to 1) and, with `chaos`, a chaos `enact` of it; otherwise the chancellor's
  `enact` of `enact ?? the first card handed on`; last an `endTerm` by the president.
  `cardGame(i: number, terms: TermSpec[], opts?: { roles?: Role[]; players?: (number | null)[];
  complete?: boolean; before?: GameEvent[] }): GameRecord` is Phase 17A's `game` (a Liberal win) whose
  events are `before`, the terms (numbered on from the last round in `before`, else from 1) and an
  `end`, each `enact`'s `liberal` and `fascist` the running board, and the final board to match. It
  never derives the outcome from the board: a test game stays a Liberal win with six Fascist
  policies, since `computeCards` reads neither the outcome nor the board.
  - `"counts hands drawn by Liberals in any order, beside every hand in the counted games"` (each
    term's chancellor the next seat): game 1, player 1 draws `FFF`, `FLF`, `LLF` and player 4 draws
    `LLL`, `FFL`; game 2 seats players `[1, 2, null, 4, 5]` and the CPU seat 2 draws `FFF`.
    `byPlayer.get(1)!.hands` is `[1, 1, 1, 0]`, `byPlayer.get(4)!.hands` is `[0, 1, 0, 1]`,
    `byPlayer.get(3)!.hands` is `[0, 0, 0, 0]`, `hands` is `[2, 2, 1, 1]`, and the sorted keys of
    `byPlayer` are `[1, 2, 3, 4, 5]`.
  - `"Liberal accuracy: Liberal presidents' mixed hands, the share discarding a Fascist"`: player 1
    presides over `FFL` discarding index 0, `FLL` 0, `FLL` 1, `FFL` 1, `FFL` 0, `FFF`, `LLL`; player 4
    over `FFL` discarding 0. `byPlayer.get(1)!.liberalAccuracy` equals `rate(4, 5, MIN_CHANCES)`
    (value `0.8`); player 4's equals `rate(0, 0, MIN_CHANCES)`.
  - `"deep cover: Fascist and Hitler presidents' mixed hands"`: player 4 presides over `FFL`
    discarding 0, `FLL` 1, `FFL` 2, `FLL` 0, `FFL` 2; player 5 over `FLL` 0 and `FFL` 2. Player 4's
    `deepCover` equals `rate(2, 5, MIN_CHANCES)` (value `0.4`), player 5's
    `{ hits: 1, chances: 2, value: null }`, player 1's `rate(0, 0, MIN_CHANCES)`.
  - `"skips a round with no hand"`: a record with `complete: false` whose `before` is a `restored`,
    a `discard` by seat 0 and a chancellor's `enact` by seat 1 (round 3, no `nominate` or `draw`),
    then one term of player 1 drawing `FLL` (round 4): `computeCards` does not throw, player 1's
    `hands` is `[0, 0, 1, 0]`, and `hands` is `[0, 0, 1, 0]`.
  - `"agrees with the contract fixture"`: over the fixture's counted games (`cpu: true`), the sum of
    `hands` is the number of rounds with a `hand`, and for each index the players' `hands` add up to
    at most `hands`.
- [ ] **Step 2: Run** `npm test -- --run src/stats/cards.test.ts`. Expected: FAIL, `./cards` cannot
  be resolved.
- [ ] **Step 3: Implement `computeCards(counted: GameRecord[]): CardStats`**: for each record,
  `humanSeats` gives the seat → player map and each `rounds(record)` entry is read once.
- [ ] **Step 4: Run** `npm test -- --run src/stats/cards.test.ts && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): count the president's hands and discards`, box 3 ticked.

---

### Task 4: Chancellor choices, vetoes, Fascist choices and forced Fascists

**Files:**
- Modify: `frontend/src/stats/cards.ts`, `cards.test.ts`, `docs/PLAN.md` (box 4)

**Interfaces:**
- Consumes: Task 3's `cards.ts` and builders; `countedGames`, `DEFAULT_FILTER` (`counting.ts`, the
  fixture test); `computeRoles` (the timing test only).
- Produces: `PairCounts = [number, number, number]` (index: Liberals among the chancellor's two:
  FF, FL, LL), and `PlayerCards` gains
  ```ts
  oneOfEach: Record<Role, Rate>;              // as chancellor handed one L and one F, kept per role that game:
                                              // hits: enacted L; chances: rounds with enacted.by === "chancellor"; MIN_CHANCES
  enacted: Record<Role, { L: number; F: number }>;  // enacted.by === "chancellor" with them as chancellor
  vetoes: PairCounts;                         // rounds with veto !== null and chancellorHand known, them as chancellor
  fascistChoices: number;                     // rounds whose blame is their seat
  forced: { president: number; chancellor: number };  // as LIBERAL: FFF hands drawn; FF handed to them,
                                                       // whatever followed (an accepted veto too)
  ```
  A chaos policy, and an accepted veto, belong to no chancellor. Phase 22's Deep Cover trophy reads
  `oneOfEach.FASCIST` (Fascist, not Hitler).

- [ ] **Step 1: Write the failing tests.** Unless said, the president is player 1 drawing `FFL` and
  discarding index 0, so the chancellor holds `F, L`.
  - `"given one of each: accepted vetoes left out, refused ones counted"`: player 2 as chancellor
    enacts `L`; `F`; vetoes, accepted; vetoes, refused, then enacts `L`; vetoes, accepted, with chaos
    `F`; enacts `L`; enacts `L`; then holds `F, F` (player 1 draws `FFF`) and enacts `F`; then holds
    `L, L` (player 1 draws `FLL`, discards 0) and enacts `L`. Player 4 as chancellor enacts `F`,
    `F`, `L`, `F`, `F`; player 5 enacts `L` once. `byPlayer.get(2)!.oneOfEach.LIBERAL` equals
    `rate(4, 5, MIN_CHANCES)`, player 4's `oneOfEach.FASCIST` `rate(1, 5, MIN_CHANCES)` (value
    `0.2`), player 5's `oneOfEach.HITLER` `{ hits: 1, chances: 1, value: null }`.
  - `"counts policies enacted as chancellor by kind and role; chaos is no one's"`: game 1, player 1
    as chancellor (player 2 presiding) enacts `L`, `L`, `F`, player 4 enacts `F`, and player 1's
    accepted veto (player 2 presiding) ends in chaos `L`; game 2 with roles `HITLER, LIBERAL,
    LIBERAL, LIBERAL, FASCIST`, player 1 as chancellor (player 2 presiding) enacts `F`. Player 1's
    `enacted` equals `{ LIBERAL: { L: 2, F: 1 }, FASCIST: { L: 0, F: 0 }, HITLER: { L: 0, F: 1 } }`;
    player 4's `enacted.FASCIST` equals `{ L: 0, F: 1 }`.
  - `"counts vetoes asked for by the two cards behind each"`: player 1 as chancellor (player 2
    presiding) holds `F, F` (from `FFF`) and vetoes, accepted; holds `F, L`, vetoes, refused, enacts
    `L`; holds `F, F`, vetoes, refused, enacts `F`. In game 2 (players `[1, 2, null, 4, 5]`) the CPU
    seat 2 as chancellor holds `F, F` (player 1 draws `FFF`) and vetoes, accepted. Player 1's
    `vetoes` is `[2, 1, 0]`, and `byPlayer` has no key for the CPU seat.
  - `"Fascist choices follow each round's blame"`: player 1 draws `FFL`, discards 2, player 4
    enacts `F` (blames player 1); player 2 draws `FFL`, discards 0, player 4 enacts `F` (blames
    player 4); player 2 draws `FFF`, player 4 enacts `F` (no one); player 1 draws `FLL`, discards 1,
    player 5 enacts `F` (blames player 5); player 1 draws `FLL`, discards 0, player 2 enacts `L` (no
    one). `fascistChoices` for players 1, 2, 4 and 5: `[1, 0, 1, 1]`.
  - `"forced Fascists: FFF for Liberal presidents, FF handed to Liberal chancellors"`: player 1 draws
    `FFF` for chancellor 2; player 1 draws `FFL`, discards 2, for chancellor 3; player 4 draws `FFF`
    for chancellor 2, who vetoes, accepted; player 2 draws `FFF` for chancellor 4; player 1 draws
    `FFL`, discards 0, for chancellor 2. `forced` for players 1–4: `{ president: 1, chancellor: 0 }`,
    `{ president: 1, chancellor: 2 }`, `{ president: 0, chancellor: 1 }`,
    `{ president: 0, chancellor: 0 }`.
  - `"agrees with the contract fixture"`: over `countedGames(fixture games, DEFAULT_FILTER)` (no
    CPU games, so every chancellor and every blamed seat has a player), the players' `enacted` L and
    F, plus the rounds whose `enacted.by` is `"chaos"`, add up to the sum of `liberalPolicies +
    fascistPolicies`; the players' `fascistChoices` add up to the number of rounds with a `blame`.
  - `"computes 1,000 games in well under a second"`: the fixture's games repeated to 1,000 with ids
    `x0`…`x999`; `computeRoles` and `computeCards` together take under 1,000 ms
    (`performance.now()`), the spec's limit.
- [ ] **Step 2: Run** `npm test -- --run src/stats/cards.test.ts`. Expected: the new tests fail.
- [ ] **Step 3: Implement** the five fields in the same pass over each record's rounds.
- [ ] **Step 4: Run** `npm test -- --run src/stats && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): count chancellor choices, vetoes and blame`, box 4 ticked.

---

### Task 5: The ROLES & CARDS tab

**Files:**
- Modify: `frontend/src/stats/tabs/RolesTab.tsx` (replaces Phase 17A's placeholder)
- Create: `frontend/src/stats/tabs/RolesTab.css`; `RolesTab.test.tsx` (or replace the placeholder's
  case in it, if Phase 17A made one)
- Modify: `docs/PLAN.md` (box 5)

**Interfaces:**
- Consumes: `StatsContext` (`useStats.ts`); `computeRoles`, `TABLE_SIZES`; `computeCards`,
  `HAND_LABELS`; `StatCard`, `NO_GAMES`, `RankedTable`, `SplitTable`, `SplitColumn`, `SplitCell`;
  `formatPercent`, `formatSigned` (`numbers.ts`); `rankRows`, `MIN_GAMES`, `MIN_CHANCES`
  (`counting.ts`); `plural` (`format.ts`); in tests `rate`, `buildStats` (`useStats.ts`), `game`,
  `seatsOf`.
- Produces: `export function RolesTab(props: { stats: StatsContext }): JSX.Element` (a named
  export, as every tab). It calls `useMemo(() => computeRoles(stats.counted), [stats.counted])` and
  the same for `computeCards`. Markup the browser test reads: `.roles-tab` (the root),
  `.roles-section > h2`; each card is a `StatCard` (a region named by its title) and each split a
  `SplitTable` (a region named `<title> table`).

**Cards**, in this order, four `<section className="roles-section">`s under `<h2>`s: Roles, As
president, As chancellor, Blame. Bodies:
- **ranked:** `RankedTable` over `rankRows(rows, compare, stats.names, min)` for players with a count
  above zero; `countLabel` `(n) => plural(n, "hand")` for the hand-based rates, else
  `RankedTable`'s default (games).
- **split:** `SplitTable({ title, columns, rows, names: stats.names })` with the card's title, the
  columns below (each `{ key, label }`: roles keyed `LIBERAL`, `FASCIST`, `HITLER`; sizes `"5"` …
  `"10"`; hands `FFF` … `LLL`), and a row per player with a count above zero; a cell is left out
  (`SplitTable` shows "—") where the player has nothing for it. `SplitTable` sorts the rows by name.

| Section | Title | Definition | Body | Line when it has nothing |
|---|---|---|---|---|
| Roles | Role split | Share of their games as Liberal, as Fascist and as Hitler. | split, wide: Liberal, Fascist, Hitler; the share (`—` under `MIN_GAMES`) with the games in that role as its count | |
| | Role luck | Their Liberal share minus the share their tables' seats would give. | ranked: `luck`, `MIN_GAMES`, signed | |
| | Times as Hitler | Games played as Hitler. | ranked: `split.HITLER.hits`, `min` 1 | |
| | Longest run of one role | Most games in a row in the same role. | ranked: `length`, `min` 1, `8 as Hitler` | |
| | Win rate as Liberal | Games won as a Liberal, of their games as one. | ranked rate, `MIN_GAMES` | |
| | Win rate as Fascist | Games won as a Fascist (not Hitler), of their games as one. | ranked rate, `MIN_GAMES` | |
| | Win rate as Hitler | Games won as Hitler, of their games as Hitler. | ranked rate, `MIN_GAMES` | |
| | Win rate by player count | Games won at each table size, from 5 to 10 seats. | split, wide: 5 … 10; rate cells, only for sizes played | |
| | First president | Games won when they made the first nomination. | ranked rate, `MIN_GAMES` | No complete games yet with these players. |
| As president | Hands drawn | How often their three cards held 0, 1, 2 or 3 Liberals, beside everyone's. | wide: the group line, then split: FFF, FFL, FLL, LLL (the share of their hands, `—` under `MIN_CHANCES`, with that hand's count, 0 included), Hands (their total, no count) | No hands drawn yet with these players. |
| | Liberal accuracy | As a Liberal president holding both kinds, how often they discarded a Fascist. | ranked rate, `MIN_CHANCES`, counted in hands | No Liberal president has held both kinds yet. |
| | Deep cover (president) | As a Fascist or Hitler president holding both kinds: discarded a Fascist · a Liberal. | ranked rate, `MIN_CHANCES`, counted in hands, `40% · 60%` | No Fascist or Hitler president has held both kinds yet. |
| As chancellor | Given one of each | Handed a Liberal and a Fascist, how often they enacted the Liberal. Accepted vetoes are left out. | split: Liberal, Fascist, Hitler; the share (`—` under `MIN_CHANCES`) with the chances as its count, only for roles with chances | No chancellor has been handed one of each yet. |
| | Policies enacted | Policies enacted as chancellor, by kind and by their role. | split, wide: Liberal, Fascist, Hitler; `2 L · 1 F`, no count, only for roles with a policy | No policy enacted by a chancellor yet. |
| | Vetoes asked for | Vetoes asked for as chancellor, by the two cards they held. | split: Vetoes, FF, FL, LL; counts as text | No vetoes yet with these players. |
| Blame | Fascist choices | Times they chose a Fascist when the government could have enacted a Liberal. | ranked: `fascistChoices`, players with one or more, `min` 1 | No Fascist chosen over a Liberal yet. |
| | Forced Fascists | As a Liberal: three Fascists drawn as president, or two handed over as chancellor. | split: FFF as president, FF as chancellor; counts as text | No forced Fascists yet with these players. |

`StatCard`'s `empty` is `true` (it shows `NO_GAMES`) when `stats.counted` is empty, else the card's
own line when it has no rows, else unset. Wide cards pass `className="roles-wide"`.

**Formats:** a share is `formatPercent(v)`; a rate cell is the `SplitCell` `{ text: "60%", count: 5 }`
(the chances), `{ text: "—", count: 2 }` below the minimum, and left out with no chances; the group
line is `p.roles-group` reading `Everyone: FFF 33% · FFL 33% · FLL 17% · LLL 17% (6 hands)` (shares of
`CardStats.hands`, then `plural(total, "hand")`); role luck is `` `${formatSigned(luck * 100)}%` ``
(`+6%`, `−60%`, `0%`); deep cover is `40% · 60%`, the second figure `100 −` the first after
rounding; a policy cell is `{ text: "2 L · 1 F" }`; a count cell is `{ text: String(n) }`; role words
are Liberal, Fascist, Hitler. Rate rankings compare `value`, larger first, `null` last; a ranked
row's `count` is the rate's chances, or the player's counted games for the plain counts.

**CSS** (`RolesTab.css`, every class `roles-` prefixed): `.roles-tab` a column; `.roles-section >
h2` in the lobby roster heading's look (`LobbyScreen.css` `.lobby-players-head`: Germania One,
`#b9ab9f`, letter-spacing `0.06em`); `.roles-grid` `display: grid; grid-template-columns:
repeat(auto-fill, minmax(min(100%, 22em), 1fr)); align-items: start`; every child of `.roles-tab`,
`.roles-section` and `.roles-grid` `min-width: 0`, so long names wrap in their column;
`.roles-wide` `grid-column: 1 / -1`; `.roles-group` in `--textColorOnDark`, wrapping on phones.
Nothing here sets a table's row height or padding: Phase 17A's tables keep their rows at least 44px
tall on phones, which Phase 22's name links rely on.

- [ ] **Step 1: Write the failing tests** in `RolesTab.test.tsx`. Mock the two modules
  (`vi.mock("../roles", async (orig) => ({ ...(await orig()), computeRoles: vi.fn() }))`, and
  `../cards` likewise) and give them stats from zero-filled builders `playerRoles(o)` and
  `playerCards(o)`. The context is `buildStats({ players, games }, { players: null, cpu: true })`
  with players 1 `Annie` (whose seat in the one game is named `Ann`), 2 `Bo`, 4 `Di`, and one
  finished game (`game` with `seatsOf`). Annie: `games` 6, `luck` 0.0636, `longestRun`
  `{ role: "LIBERAL", length: 3 }`, `bySize` 5 → `rate(3, 5, MIN_GAMES)` and 7 →
  `rate(1, 2, MIN_GAMES)`, `hands` `[1, 1, 1, 1]`, `enacted`
  `{ LIBERAL: { L: 2, F: 1 }, FASCIST: { L: 0, F: 0 }, HITLER: { L: 0, F: 1 } }`; Di: `deepCover`
  `rate(2, 5, MIN_CHANCES)`; `CardStats.hands` `[2, 2, 1, 1]`; no vetoes.
  - `"shows four sections and seventeen cards in order"`: the level-2 headings are `Roles`,
    `As president`, `As chancellor`, `Blame`; the seventeen card regions
    (`getByRole("region", { name: title })`) each follow the one before
    (`compareDocumentPosition`).
  - `"shows each format"`: `+6%`, `3 as Liberal` and `40% · 60%` are on the page, and
    `.roles-group` reads `Everyone: FFF 33% · FFL 33% · FLL 17% · LLL 17% (6 hands)`. Annie's
    row's cells after her name (`SplitTable` puts a cell's count beside its text) match, in
    `Win rate by player count table`, `[/^60%\D*5$/, /^—$/, /^—\D*2$/, /^—$/, /^—$/, /^—$/]`; in
    `Hands drawn table`, `[/^—\D*1$/, /^—\D*1$/, /^—\D*1$/, /^—\D*1$/, /^4$/]`; in
    `Policies enacted table`, `[/^2 L · 1 F$/, /^—$/, /^0 L · 1 F$/]`.
  - `"names players as they are called now"`: `Annie` is shown, and no element's text is exactly
    `Ann`.
  - `"says NO_GAMES on every card when nothing counts"`: with no games, `getAllByText(NO_GAMES)` has
    length 17.
  - `"gives a card with nothing its own line"`: with the data above, `No vetoes yet with these
    players.` is shown.
  - `"keeps wide tables in their card's region that scrolls"`: the regions `Role split table`,
    `Win rate by player count table`, `Hands drawn table` and `Policies enacted table` exist, each
    inside the card region of its title, which has the class `roles-wide`.
  - `"computes once per counted games"`: after `rerender` with the same `stats`, `computeRoles` and
    `computeCards` have each been called once.
- [ ] **Step 2: Run** `npm test -- --run src/stats/tabs/RolesTab.test.tsx`. Expected: FAIL (the
  placeholder renders one card).
- [ ] **Step 3: Implement `RolesTab`** and `RolesTab.css` as above.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS, and the main
  (non-stats) chunk the size noted in Setup.
- [ ] **Step 5: Commit** `feat(frontend): fill the roles and cards tab`, box 5 ticked.

---

### Task 6: The tab fits every size

**Files:**
- Create: `frontend/e2e/stats-roles.spec.ts` (runs in `desktop`, `phone-360`, `phone-412` and,
  through Phase 15's `testMatch`, `firefox`)
- Modify: `RolesTab.css` only if the tests find a layout fault; `docs/PLAN.md` (box 6)

**Interfaces:**
- Consumes: `stubStats`, `bigStatsData`, `statsSizesFor`, `checkStatsPage` (`./stats`);
  `NARROW_PHONE` (`./layout`); `settle` (`./lobby`); Task 5's titles and class names. The no-games
  line is a constant in the spec, `const NO_GAMES = "No games yet with these players."` (StatCard's
  own, not imported: the component imports CSS).

- [ ] **Step 1: Write the spec.** Each test calls `stubStats(page, bigStatsData())`, opens the
  page, waits for `.roles-tab` and calls `settle`. No sideways check of its own: `checkStatsPage`
  is the check.
  - `"ROLES & CARDS fits every stats size"` (`test.slow()`): for each `size` of
    `statsSizesFor(test.info().project.name, page.viewportSize()!)`: `page.setViewportSize(size)`,
    then `checkStatsPage(page, size)`; the seventeen card regions are each found once, and
    `NO_GAMES` has count 0.
  - `"a wide table scrolls inside its card on a 320px phone"` (`phone-360` only, at `NARROW_PHONE`):
    `checkStatsPage(page, NARROW_PHONE)` passes, and the `Win rate by player count table` region's
    `scrollWidth` exceeds its `clientWidth` (the table scrolls rather than squeezing).
  - `"the tab row opens ROLES & CARDS and keeps the filter"`: open `/stats?cpu=1`, click the tab
    row's `ROLES & CARDS` link; the URL ends `/stats/roles?cpu=1`, that link has
    `aria-current="page"`, and the four level-2 section headings are visible.
- [ ] **Step 2: Run** `E2E_PORT=4618 npx playwright test e2e/stats-roles.spec.ts --project=desktop
  --project=phone-360 --project=phone-412`, then the `firefox` and both phone projects in the Linux
  image (`DEVELOPMENT.md`, "Browser tests on Linux", with `-e E2E_PORT=4618` and
  `e2e/stats-roles.spec.ts` on the command line). Expected: PASS everywhere. A layout failure is
  fixed in `RolesTab.css` (never by hiding overflow or shrinking text below what the cards use); one
  in Phase 15's or 17A's parts is reported.
- [ ] **Step 3: Commit** `test(frontend): check the roles and cards tab at every size` (with any CSS
  fix), box 6 ticked.

---

### Task 7: Docs

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `docs/PLAN.md` (box 7); `DEVELOPMENT.md` only if something in
  it is now stale

- [ ] **Step 1: Update the docs.** `CLAUDE.md` (Layout, beside the stats pages' paragraph): ROLES &
  CARDS is `tabs/RolesTab.tsx`, from `computeRoles` (`roles.ts`: seats, winners and the first
  round; `expectedLiberalGames` and `luck`) and `computeCards` (`cards.ts`: from `rounds(record)`
  only), memoized per counted games; every split goes through `SplitTable`, with the group's hand
  shares on a line above Hands drawn; `e2e/stats-roles.spec.ts` runs `checkStatsPage` at every
  `statsSizesFor` size. Also the choices this phase made: the group's hands include CPU
  presidents', First president skips `complete: false` records, a tie for the longest run goes to
  the later run and a missed game breaks no run, Forced Fascists counts every FF handed whatever
  followed, and each table size's cell needs `MIN_GAMES`. `README.md` ("What this fork adds", the
  stats entry): what ROLES & CARDS shows, in a sentence.
- [ ] **Step 2: Commit** `docs(claude): describe the roles and cards tab` (with box 7 ticked) and
  `docs(readme): mention the roles and cards tab`.

---

### Task 8: Whole-branch review

**Files:** whatever the findings touch, within the Global Constraints' list; `docs/PLAN.md` (box 8)

- [ ] **Step 1: Run the `code-review` skill** against `origin/development`, with the spec's ROLES &
  CARDS, Counting rules and Cards sections, the interfaces file's settled section and this plan as
  the spec.
- [ ] **Step 2: Fix every finding**, Minor ones included, each behaviour change with its test, in
  `fix(frontend): …` commits. A finding that needs no change gets its reason in the PR's "Review"
  section. A finding in another phase's file is reported, not fixed here.
- [ ] **Step 3: Run everything** with `JAVA_HOME` as in Global Constraints: `cd backend && ./gradlew
  test`; `cd frontend && npm test -- --run && npm run build`; `E2E_PORT=4618 npm run e2e` (all four
  projects; `firefox` in the Linux image if it will not launch). Expected: all pass; keep the counts
  for the PR.
- [ ] **Step 4: Commit** box 8's tick with the last fix (or as `docs(plan): tick phase 18's review`
  when nothing needed a change).

---

### Task 9: Screenshots, pull request and merge

**Files:** `docs/pr/phase-18-roles-cards/` (four PNGs), `docs/PLAN.md` (box 9, the acceptance
boxes, Progress row 18)

- [ ] **Step 1: "After" screenshots.** `PR_SHOTS=after E2E_PORT=4718 npx playwright test
  e2e/pr-shots.spec.ts --project=desktop --project=phone-412`, then delete `pr-shots.spec.ts`.
  Expected: `after-roles-1600x900.png` and `after-roles-412x915.png` beside the "before" pair.
- [ ] **Step 2: Commit** `docs(docs): add the roles and cards tab's screenshots` with the four PNGs,
  box 9 and the acceptance box "unit tests pass … all four Playwright projects" ticked.
- [ ] **Step 3: Open the PR.** `git push -u origin phase-18-roles-cards`, then `gh pr create --repo
  jussaw/Secret-Hitler-Online --base development`. The body opens with a before/after table
  (1600x900 and 412x915), each image by
  `https://raw.githubusercontent.com/jussaw/Secret-Hitler-Online/<sha>/docs/pr/phase-18-roles-cards/<file>`
  with `<sha>` the pushed head; then what the tab shows, the choices listed in Task 7, the test
  counts, the "Review" section, and `Part of #31`.
- [ ] **Step 4: Loop CI to green:** `gh pr checks <n> --repo jussaw/Secret-Hitler-Online --watch`;
  on a failure, `gh run view <run> --repo jussaw/Secret-Hitler-Online --log-failed`, fix with its
  test, push.
- [ ] **Step 5: When Phase 17B, 19, 20 or 21A merges first:** `git fetch origin && git rebase
  origin/development`. Conflicts may only be in `CLAUDE.md`, `README.md`, `DEVELOPMENT.md` and
  `docs/PLAN.md`: keep both sides (both phases' sentences, rows and ticks). A conflict in any other
  file means the file ownership broke: stop and report. Then run Task 8's Step 3, `git push
  --force-with-lease`, and re-pin the PR body's image URLs to the rebased SHA.
- [ ] **Step 6: Merge once the user says yes in chat.** Commit `docs(plan): mark phase 18 merged`
  (the "PR merged" box ticked and Progress row 18 "done"; the user's box stays unticked), push, wait
  for CI, then `gh pr merge <n> --squash --admin --repo jussaw/Secret-Hitler-Online --subject
  "feat(frontend): add the roles and cards tab (#<n>)"`. Check that `development`'s image publish
  passes: `gh run list --repo jussaw/Secret-Hitler-Online --branch development --limit 3`.
