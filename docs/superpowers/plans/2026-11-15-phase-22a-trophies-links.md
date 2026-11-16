# Phase 22A: Trophies and name links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The fifteen trophies and RECORDS' trophy holders, one player's numbers as a pure module
for Phase 22B's pages, the game page's Elo change, and every player's name in the stats a link to
their page (issue #31).

**Architecture:** Two pure modules do the counting. `trophies.ts` gathers per-player facts from
the earlier stat modules (`allStats.ts` runs them once) and awards the trophies from those facts.
`player.ts` assembles one player's numbers from the same modules' `byPlayer` maps, with the player
filter dropped and the CPU toggle kept, and builds the PLAYERS rows; Phase 22B draws them.
`PlayerName` turns its `link` prop on, so a non-null player becomes a `StatsLink` to
`/stats/players/<n>` (still Phase 15's placeholder until 22B). The game page replays Elo under the
default filter for its header.

**Tech Stack:** React 18, TypeScript 5 (ES2020), Vite, Vitest with Testing Library, Playwright. No
new dependency.

**Spec:** [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](../specs/2026-11-15-game-stats-design.md)
("Trophies (Phase 22)", RECORDS' "Trophy holders", the game page's Elo change in "GAMES and the game
page", "From Phase 22 a player's name anywhere in the stats links to their page", "Counting
rules"). Shared names: [`2026-11-15-game-stats-interfaces.md`](2026-11-15-game-stats-interfaces.md),
whose "Settled after the plans were written" section wins over any other breakdown. Parent plan:
[`docs/PLAN.md`](../../PLAN.md), Phase 22A. Next: Phase 22B
([`2026-11-15-phase-22b-player-pages.md`](2026-11-15-phase-22b-player-pages.md)), PLAYERS and the
player page. Where this plan and the spec differ, the spec wins.

Phases 14 to 21 are merged before this one starts, and their code is the ground truth for every
name read here; the interfaces file pins the `byPlayer` fields. Where the merged code lacks one,
compute it in `player.ts` or `trophies.ts` from `rounds()` and the seats, with a test, and list it
under "Decisions" in the PR.

## Global Constraints

- **Files.** Phase 22A creates `trophies.ts`, `allStats.ts`, `player.ts`, `game/gameElo.ts`,
  `players/testStats.ts`, `players/TrophyBadge.tsx`, `nameLinks.test.tsx` and
  `frontend/e2e/stats-names.spec.ts`, and changes `PlayerName.tsx`, `tabs/RecordsTab.tsx`,
  `game/GameHeader.tsx` and `game/GamePage.tsx` (paths under `frontend/src/stats/`), plus their
  tests and CSS, and earlier phases' tests that assert a plain-text name (the interfaces file
  allows it). It edits no other tab: names in sentences and headlines already pass
  `link={false}` (Phases 17B, 20, 21A and 21B).
- **Copy, exactly.** Trophy labels and rules: the spec's table, verbatim. `Trophy holders`, its
  definition `Worked out from the counted games. Most need 8 of them.`, `No one yet.`; `Elo:
  Liberals +16 · Fascists −16` (`formatSigned`, U+2212); `NO_GAMES` for an empty card.
- **Shared helpers, from their owners.** Phase 15: `StatsLink` (`href`), `PlayerName`'s `link?`
  prop, `routePath`, `navigate` (which scrolls to the top), `useLocation`, `parseRoute`,
  `makeRecord`. Phase 16: `rounds`, `ev` (`game/sampleGames.ts`), `GameHeader`, `GamePage`. Phase
  17: `numbers.ts` (`formatSigned`), `counting.ts` (`rate` with `min` defaulting to `MIN_CHANCES`,
  `MIN_GAMES`, `rankRows`, `compareNames`, `seatWon`, `countedGames`, `DEFAULT_FILTER`,
  `parseFilter`, `filterSearch`), `replayElo`, `buildStats`, `StatCard` (`empty?`; a `section`
  region named by its title; `NO_GAMES`). Phase 21A: `computeTiming` and `fastestVoter(timing,
  names)` (the Speed Demon). Phase 21B: `computeRecords`. Name ties use `compareNames`.
- **ES2020.** No `Array.prototype.at`, `Object.hasOwn`, `replaceAll`, `findLast` or anything newer,
  in code and tests alike (`npm run build` type-checks both).
- **Counting.** Trophies use the counted games of the context they get (RECORDS: the whole
  filter); `computePlayer` drops the player filter and keeps the CPU toggle; the game header uses
  `DEFAULT_FILTER`. Modules take `now`; only components read `Date.now()`, once per mount.
- **Time zones.** Tests pass `"UTC"` and build times with `Date.UTC`, never setting
  `process.env.TZ`.
- **Names.** Only `data.players` names and seat names; never an account or Discord ID. A CPU seat
  (`player: null`) is never a link. `PlayerName` keeps `overflow-wrap: anywhere`.
- **Look and fit.** Trophies are text badges in the game's colours, no art. Pages scroll down,
  never sideways, from 320x568 to 1920x1080. In the stacked query (`(max-width: 768px),
  (aspect-ratio < 5/4), (max-height: 500px)`) a name link in a table row is a 44px target from its
  row's height (RankedTable, SplitTable and PlayerMatrix rows are at least 44px there), never from
  padding that overlaps a neighbour; a name elsewhere stays inline.
- **Browser tests.** No `e2e/` file imports `src/constants` or anything that imports it; paths come
  from `routePath`. Every test that checks pages at every size calls `test.slow()`.
- **Download.** Nothing outside `src/stats/` imports this phase's files.
- **Linux fonts.** CI draws text wider than macOS at phone sizes; measure tight CSS in Playwright's
  Linux image (`DEVELOPMENT.md`, "Browser tests on Linux"), which also runs `firefox` when it will
  not launch on macOS.
- **Environment.** `JAVA_HOME` on Java 17; Node 22.12 or newer; `npm ci` once in `frontend/`.
  Browser tests on `E2E_PORT=4622`, "before" shots on 4722.
- **Branch and commits.** Worktree and branch `phase-22a-trophies-links`, off an up-to-date
  `development`. Conventional Commits with a scope (`frontend`, `docs`, `claude`, `readme`,
  `development`, `plan`); each test in the commit with its code. Tasks 2 to 9 each tick one box of
  Phase 22A in `docs/PLAN.md` in their commit (Task N ticks box N − 1).
- **Public repo.** Nothing about the home server in code, docs, commits or the PR.

## Review Focus

1. **A name inside another link or control** (a GAMES row, whose link is stretched over the row):
   never a link inside a link, button or label, and a click on the name opens the player, not the
   row's game. Task 5 (`namesAreLinksNeverNested`) and Task 8 (`a name in GAMES opens its player
   page, at its top`).
2. **Name links packed in a phone table** (RankedTable, SplitTable, PlayerMatrix): each a 44px
   target from its row's height, no two overlapping, so a tap never lands on the wrong player; a
   name in a headline (`Ann 3–2 Cy`) stays plain. Task 5 (`headlinesKeepPlainNames`) and Task 8
   (`name links in tables are 44px and never overlap`).
3. **A modified click on a name** (Ctrl, Cmd, Shift, the middle button): left to the browser, so it
   opens a new tab. Task 5 (`aModifiedClickIsTheBrowsers`).
4. **A known player with no counted games** (only CPU games with the toggle off, or only
   unfinished ones): `computePlayer` returns zeros and nulls and never throws on a missing
   `byPlayer` entry. Task 4 (`aPlayerWithOnlyCpuGamesHasZeroes`).
5. **A player filter that leaves the player out**: `computePlayer` gives the same numbers as
   without it. Task 4 (`thePlayerFilterIsIgnored`).

---

## The test data (Tasks 3 to 8)

`frontend/src/stats/players/testStats.ts` (builders, imported by tests only; Phase 22B reuses it)
holds `sampleData(): StatsData`, `SAMPLE_NOW = Date.UTC(2026, 10, 15, 12)` and `TZ = "UTC"`.
Players: 1 Ann, 2 Bo, 3 Cy, 4 Di, 5 Ed, 6 Fay, 7 Gus. Every game has five seats, starts at 20:00 UTC
on its day (2026) and ends at 20:40; seats carry the players' names (CPU seats `Bot 1`, `Bot 2`, …)
and are alive unless listed.

| id | Day | Seats 0 to 4 | Outcome | Dead | Round 1 (seat 0 is Ann) |
|---|---|---|---|---|---|
| `g1` | 2 Oct | Ann L, Bo L, Cy L, Di F, Ed H | `LIBERAL_POLICIES` | | Ann nominates Bo; all Ja, Ann's vote 1500 ms; hand F F L, discards 0; Bo enacts L |
| `g2` | 5 Oct | Ann F, Bo L, Cy L, Di L, Ed H | `FASCIST_POLICIES` | | Bo nominates Ann; all Ja, Ann's 2500 ms; hand L F F, discards 2; Ann enacts L |
| `g3` | 9 Oct | Ann H, Bo L, Cy L, Fay L, Di F | `HITLER_ELECTED` | | none |
| `g4` | 1 Nov | Ann L, Bo F, Cy L, Di L, Ed H | `HITLER_EXECUTED` | Ed | Ann nominates Cy; all Ja, Ann's 2000 ms; hand F F F, discards 0; Cy enacts F (board 0 L, 4 F); `execute` by seat 0 of seat 4 (`HITLER`) at `t = 21_000` |
| `g5` | 10 Nov | Ann L, Bo L, Cy F, Di L, Ed H | `FASCIST_POLICIES` | Ann | none |
| `cpu` | 12 Nov | Ann L, Gus L, CPU L, CPU F, CPU H | `LIBERAL_POLICIES`, `hasCpu` | | none |
| `g6` | 13 Nov | Ann L, Bo L, Cy L, Di F, Ed H | `LIBERAL_POLICIES` | | Ann nominates Bo; all Ja, Ann's 2000 ms; hand F F F, discards 0; Bo enacts F |
| `unf` | 14 Nov | Ann L, Bo L, Cy L, Di F, Ed H | `UNFINISHED` | | none |

It also exports, built on `makeRecord` and Phase 16's `ev`:

```ts
export function played(id: string, day: [number, number, number], seats: [number | null, Role][],
  outcome: Outcome, o?: { dead?: number[]; events?: GameEvent[] }): GameRecord;   // winner from outcome; hasCpu when a seat is null
export function term(o: { t: number; r: number; president: number; chancellor: number;
  voteMs?: Partial<Record<number, number>>; hand: Card[]; discard: number; enact: Card;
  board?: { liberal: number; fascist: number };
  execute?: { target: number; role: Role } }): GameEvent[];
export function withRatings(stats: StatsContext,
  ratings: Record<number, { rating: number; games: number }>): StatsContext;          // replaces elo.ratings; provisional = games < PROVISIONAL_GAMES, peak = rating
```

`term` emits, from `t` (each sample term uses `t = 10_000`, `r = 1`): `nominate` at `t`; a Ja `vote`
per seat in seat order at `t + voteMs[seat]` (default 1000); `election` (passed); `draw` at +5 s;
`discard` at +6 s; `enact` (`by: "chancellor"`, the chancellor's seat, the board) at +8 s; with
`execute`, the president's `execute` at +11 s and `endTerm` at +12 s, else `endTerm` at +9 s
(`by: "president"`). Contexts are `buildStats(data, filter)`, with `DEFAULT_FILTER` unless said.
Ann's numbers in this data:

| Field | Value | Field | Value |
|---|---|---|---|
| counted games | 6 (7 with the toggle on) | roles L / F / H | 4 / 1 / 1 |
| wins | 5 of 6 (6 of 7 with the toggle) | as Liberal | 3 of 4 |
| streaks | current 1, longest win 4, longest losing 1 (toggle on: current 2) | expected Liberal games | 3.6 (share 0.6) |
| hands FFF / FFL / FLL / LLL | 2 / 1 / 0 / 0 | Liberal accuracy | 1 of 1 |
| Fascist given one of each, enacted L | 1 of 1 | forced as president / chancellor | 2 / 0 |
| Ja | 4 of 4 | Liberal vote accuracy | 3 of 3 |
| executions / of Hitler | 1 / 1 | survival | 5 of 6 |
| average nominate / vote / discard | 10000 / 2000 / 1000 ms | average chancellor / power / end term | 2000 / 3000 / 1000 ms |
| vs Ed on opposite sides | 4 games, 3 wins, 1 loss | most played with | Bo, 6 (tied with Cy and Di) |
| recorded games | 8 | | |

## Where the numbers come from

| Fact | Module field (Phase) |
|---|---|
| role split, expected Liberal share, luck | `PlayerRoles.split`, `.expectedLiberalGames / games`, `.luck` (18) |
| win rate by role, by seats | `PlayerRoles.winAs`, `.bySize` (18) |
| hands, Liberal accuracy, deep cover | `PlayerCards.hands`, `.liberalAccuracy`, `.deepCover` (18) |
| given one of each by role, Fascist choices, forced Fascists | `PlayerCards.oneOfEach`, `.fascistChoices`, `.forced.president`, `.forced.chancellor` (18) |
| Ja rate, Liberal vote accuracy, Fascist loyalty | `PlayerVotes.ja`, `.liberalAccuracy`, `.fascistLoyalty` (19) |
| investigations and what they found, executions, of Hitler, survival | `PlayerPowers.investigations`, `.saw.FASCIST`, `.executions`, `.hitlerExecuted`, `.survival` (19) |
| opponents, most played with, best teammate, nemesis, favourite opponent | `PlayerRivals.opponents` (`Map<number, { games, wins, losses }>`), `.mostPlayedWith` `{ player, games }`, `.bestTeammate` `{ player, wins, games }`, `.nemesis` `{ player, losses, games }`, `.favouriteOpponent` `{ player, wins, games }` (20; `computeRivals(counted, names)`) |
| streaks | `PlayerRecords.current`, `.longestWin?.length ?? 0`, `.longestLoss?.length ?? 0` (21B) |
| decision times | `PlayerTiming.decisions[kind].ms` (21A) |
| the Speed Demon | `fastestVoter(timing, names)`: the one holder of the settled rule, or null (21A) |
| counted games, dates, overall wins, elected-Hitler wins, CPU and recorded games, latest games | the records (`humanSeats`, `seatWon`) |
| rating, provisional, peak, history, rank | `stats.elo` (17) |

---

### Task 1: Start check, branch and the "before" screenshots

**Files:**
- Create (never committed): `frontend/e2e/pr-shots.spec.ts`
- Create: `docs/pr/phase-22a-trophies-links/before-{records,game}-{1600x900,412x915}.png`

- [ ] **Step 1: Check the start.** `docs/PLAN.md`'s Progress table reads "done" for 17B, 18, 19, 20
  and 21B (and every phase before them), and `docs/PLAN.md` has a "Phase 22A: Trophies and name
  links" section. If either is not so, stop and report.
- [ ] **Step 2: Branch.** Make the worktree and branch `phase-22a-trophies-links` from an
  up-to-date `development`, and run `npm ci` in `frontend/`.
- [ ] **Step 3: Write `pr-shots.spec.ts`.** `test.skip(!process.env.PR_SHOTS)`; `const PREFIX =
  "before"`; 1600x900 in `desktop`, 412x915 in `phone-412` (`testInfo.project.name`);
  `stubStats(page, bigStatsData())`, then for each state `goto`, `settle(page)` and save to
  `docs/pr/phase-22a-trophies-links/${PREFIX}-${state}-${W}x${H}.png`: `records`
  (`routePath({ page: "tab", tab: "records" })`, full page) and `game` (the newest game with no CPU
  seat and an outcome other than `UNFINISHED`, the window).
- [ ] **Step 4: Run** `PR_SHOTS=1 E2E_PORT=4722 npx playwright test e2e/pr-shots.spec.ts
  --project=desktop --project=phone-412`. Expected: 2 passed; RECORDS has no trophy holders card,
  the game header no Elo line, and names are plain text.
- [ ] **Step 5: Commit** `docs(docs): add phase 22a's before screenshots` (the four PNGs only; the
  spec stays untracked for Task 9).

---

### Task 2: Trophy rules

**Files:**
- Create: `frontend/src/stats/trophies.ts`, `frontend/src/stats/trophies.test.ts`

**Interfaces:**
- Consumes: `Rate`, `rate`, `compareNames` (`counting.ts`).
- Produces:
  ```ts
  export type TrophyId = "regular" | "everPresent" | "onFire" | "onTheRise" | "elite" | "dominantRivalry"
    | "familiarFoe" | "hitlerHunter" | "chancellorHitler" | "deepCover" | "honestBroker"
    | "cursedHands" | "sharpEye" | "survivor" | "speedDemon";
  export interface Trophy { id: TrophyId; label: string; rule: string }
  export const TROPHIES: readonly Trophy[];   // the spec's table in its order; label and rule verbatim
  export const TROPHY_MIN_GAMES = 8;
  export interface TrophyFacts {
    games: number; rating: number; provisional: boolean; longestWinStreak: number;
    opponents: { games: number; wins: number; losses: number }[];   // one per opponent, opposite sides
    hitlerExecutions: number; wonAsElectedHitler: number;
    fascistGivenOneOfEach: Rate;   // as a FASCIST (not HITLER) chancellor handed L and F: enacted L
    liberalAccuracy: Rate;         // as a Liberal president holding both kinds: discarded F
    fffAsLiberalPresident: number; liberalVoteAccuracy: Rate; survival: Rate;
  }
  export function awardTrophies(facts: Map<number, TrophyFacts>, totalGames: number,
    speedDemon: number | null): Map<number, Trophy[]>;   // every key, [] when none; TROPHIES order
  export function trophyHolders(trophies: Map<number, Trophy[]>,
    names: Map<number, string>): { trophy: Trophy; players: number[] }[];   // every trophy; holders by name
  ```

- [ ] **Step 1: Write the failing tests.** A `base(overrides)` fact set (`games: 8`, `rating: 1500`,
  `provisional: false`, every count 0, `opponents: []`, every `Rate` `rate(0, 0)` but `survival:
  rate(0, 8)`), `totalGames` 100 unless given, `speedDemon` null, and one `it.each` row per case:
  `awardTrophies(new Map([[1, base(o)]]), total, null).get(1)` holds the trophy or does not.

  | Trophy | Holds | Does not |
  |---|---|---|
  | Regular | games 20; 21 | games 19 |
  | Ever-Present | games 8 of total 16; 9 of 16 | 8 of 17; 7 of 10 |
  | On Fire | streak 3; 4 | streak 2; streak 3 with games 7 |
  | On the Rise | rating 1549.5; 1599 | 1549.4; 1560 provisional; 1560 with games 7 |
  | Elite | rating 1599.5; 1650 (On the Rise too) | 1599.4 |
  | Dominant Rivalry | opponent 9 games 7–2; 12 games 10–2 | 8 games 6–2; 7 games 6–1; two opponents 9 games 6–3 each |
  | Familiar Foe | opponent 10 games; 11 | 9 |
  | Hitler Hunter | 1 execution of Hitler with games 1; 2 | 0 |
  | Chancellor Hitler | 1 elected-Hitler win with games 1 | 0 |
  | Deep Cover | 2 of 4; 3 of 4 | 1 of 4; 2 of 3; 2 of 4 with games 7 |
  | Honest Broker | 10 of 10; 11 of 11 | 9 of 10; 9 of 9 |
  | Cursed Hands | 3 FFF; 4 | 2 |
  | Sharp Eye | 23 of 30; 30 of 40 | 22 of 30; 22 of 29 |
  | Survivor | 9 of 10; 10 of 11 | 8 of 10; 9 of 9 |

  Then: `belowTheMinimumOnlyTwoHold` (games 7 and every other fact past its threshold: exactly
  `["hitlerHunter", "chancellorHitler"]`); `aPlayersTrophiesFollowTheTable` (a player holding
  Survivor, Regular and Elite gets `["regular", "onTheRise", "elite", "survivor"]`);
  `speedDemonIsTimingsHolder` (`speedDemon` 2 with facts for 1 and 2: only 2 holds it, whatever
  its facts; `speedDemon` null: no one; `speedDemon` 9 with no facts for 9: no one, and no key 9);
  `theTableIsTheSpecs` (labels in order; `TROPHIES[0].rule === "At least 20 counted games"`;
  Ever-Present's rule `"In at least half of all counted games (with the usual 8 of their own)"`;
  Speed Demon's `"The fastest average vote of everyone with 30 or more timed votes (one holder;
  ties go to more votes, then the name)"`); `holdersAreListedPerTrophy` (`{1: [regular], 2:
  [regular, elite]}`, names Bo for 1 and Ann for 2: 15 entries in table order, Regular `[2, 1]`,
  Elite `[2]`, the rest `[]`).
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/stats/trophies.test.ts`. Expected: FAIL
  (no `trophies.ts`).
- [ ] **Step 3: Implement** as in Interfaces. Every trophy but Hitler Hunter, Chancellor Hitler and
  Speed Demon needs `games >= TROPHY_MIN_GAMES`; Ever-Present also needs `2 * games >=
  totalGames`. Ratings are compared as `Math.round(rating)`. Shares compare in integers (`hits * 2
  >= chances`, `hits === chances`, `hits * 4 >= chances * 3`, `hits * 10 >= chances * 9`). A rivalry
  is one opponent's `wins - losses >= 5` with `games >= 8`. Speed Demon goes to `speedDemon` when it
  has facts: Phase 21A has already applied the rule (30 timed votes, 8 games, ties), so nothing here
  re-checks it.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the trophy rules`, ticking box 1.

---

### Task 3: Trophies from the stats

**Files:**
- Create: `frontend/src/stats/allStats.ts`, `allStats.test.ts`, `frontend/src/stats/players/testStats.ts`
- Modify: `frontend/src/stats/trophies.ts`, `trophies.test.ts`

**Interfaces:**
- Consumes: `computeRoles`, `computeCards`, `computeVotes`, `computePowers`, `computeRivals`,
  `computeRecords`, `computeTiming`, `fastestVoter`; `StatsContext`, `buildStats`,
  `DEFAULT_FILTER`, `countedGames`; `humanSeats`; `makeRecord`, `ev`; the fixture
  `./fixtures/recorded-games.json`, `parseStatsData`.
- Produces:
  ```ts
  // allStats.ts
  export interface AllStats { roles: RoleStats; cards: CardStats; votes: VoteStats; powers: PowerStats;
    rivals: RivalStats; records: RecordStats; timing: TimingStats }
  export function allStats(stats: StatsContext, now: number): AllStats;   // each module once, on stats.counted
  // trophies.ts
  export function trophyFacts(stats: StatsContext, all: AllStats): Map<number, TrophyFacts>;  // every player with a counted game
  export function speedDemonOf(all: AllStats, names: Map<number, string>): number | null;   // fastestVoter(all.timing, names)
  export function computeTrophies(stats: StatsContext, now: number): Map<number, Trophy[]>;
  ```
  and `players/testStats.ts` as "The test data" above. `allStats` calls `computeRivals(counted,
  stats.names)` and `computeRecords(counted, stats.elo, now)`. Each fact comes from "Where the
  numbers come from": `opponents` is `Array.from(rivals.opponents.values())`, `fascistGivenOneOfEach`
  `oneOfEach.FASCIST`, `fffAsLiberalPresident` `forced.president`; `wonAsElectedHitler` counts
  their `HITLER` seat in a `HITLER_ELECTED` game. `computeTrophies` is
  `awardTrophies(trophyFacts(…), stats.counted.length, speedDemonOf(all, stats.names))`.

- [ ] **Step 1: Write the failing tests.** `allStats.test.ts`: `runsEachModuleOnTheCountedGames`
  (each field `toEqual`s its module's output on `buildStats(sampleData(), DEFAULT_FILTER)`).
  `trophies.test.ts`, on `sampleData()` and `SAMPLE_NOW`: `gathersAnnsFacts`
  (`trophyFacts(ctx, allStats(ctx, SAMPLE_NOW)).get(1)` matches Ann's table: games 6, `rating`
  equal to `ctx.elo.ratings.get(1)!.rating`, streak 4, an opponent `{ games: 4, wins: 3, losses: 1
  }`, 1 Hitler execution, 1 elected-Hitler win, given one of each 1 of 1, Liberal accuracy 1 of 1,
  2 FFF hands, vote accuracy 3 of 3, survival 5 of 6); `oneOfEachIsFascistOnly` (an extra game
  where Ann is the `HITLER` chancellor handed L F and enacts L leaves her 1 of 1);
  `onlyCountedGamesCount` (Ann in 8 counted and 12 CPU games: no Regular with the toggle off,
  Regular with it on); `annHoldsTheTwoWithNoMinimum` (`computeTrophies(ctx, SAMPLE_NOW).get(1)` ids
  `["hitlerHunter", "chancellorHitler"]`; no Speed Demon, since no one has 30 timed votes; Gus has
  no entry); `theFixtureKeepsTheRules` (on the contract fixture under `DEFAULT_FILTER`: no throw,
  every holder of a trophy with a minimum has at least 8 counted games, Regular's at least 20, and
  Speed Demon's holders are exactly `speedDemonOf` of the same stats).
- [ ] **Step 2: Run** `npx vitest run src/stats/allStats.test.ts src/stats/trophies.test.ts`.
  Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): work out trophies from the stats`, ticking box 2.

---

### Task 4: A player's numbers

**Files:**
- Create: `frontend/src/stats/player.ts`, `frontend/src/stats/player.test.ts`

**Interfaces:**
- Consumes: `allStats`, `trophyFacts`, `speedDemonOf`, `awardTrophies`; `buildStats`; `rate`,
  `rankRows`, `MIN_GAMES`, `humanSeats`, `seatWon`, `compareNames`; `PROVISIONAL_GAMES`,
  `ELO_START`; `sideOf`, `playerName`.
- Produces (Phase 22B's pages draw these):
  ```ts
  export interface PersonLink { player: number; name: string }
  export interface LatestGame { id: string; endedAt: number; role: Role;
    result: "won" | "lost" | "unfinished"; outcome: Outcome; cpu: boolean }
  export interface PlayerStats {
    player: number; name: string;
    games: number; firstPlayed: number | null; lastPlayed: number | null;   // first startedAt, last endedAt, counted
    cpuNotCounted: number;   // finished games with a CPU seat they sat in; 0 with the toggle on
    allGames: number;        // every record with a seat of theirs, as GAMES lists them
    trophies: Trophy[];
    elo: { rating: number; provisional: boolean; rank: number | null; peak: number;
      history: { x: number; y: number; dashed: boolean }[] } | null;   // null with no counted games
    winRate: { overall: Rate; liberal: Rate; fascist: Rate; hitler: Rate; bySeats: { seats: number; rate: Rate }[] };
    roles: { liberal: number; fascist: number; hitler: number; expectedLiberal: number | null; luck: number | null };
    streaks: { current: number; longestWin: number; longestLoss: number };   // current < 0: a losing streak
    cards: { hands: [number, number, number, number];   // FFF, FFL, FLL, LLL as president
      liberalAccuracy: Rate; deepCover: Rate; oneOfEach: Record<Role, Rate>; fascistChoices: number;
      forced: { president: number; chancellor: number } };
    votes: { ja: Rate; liberalAccuracy: Rate; fascistLoyalty: Rate };
    powers: { investigations: number; foundFascist: number; executions: number;
      hitlerExecutions: number; survival: Rate };
    people: { mostPlayedWith: (PersonLink & { games: number }) | null;
      bestTeammate: (PersonLink & { wins: number; games: number }) | null;
      nemesis: (PersonLink & { losses: number; games: number }) | null;
      favouriteOpponent: (PersonLink & { wins: number; games: number }) | null };
    timing: Record<"nominate" | "vote" | "discard" | "chancellor" | "power" | "endTerm", number | null>;  // average ms
    latest: LatestGame[];    // their 5 newest records of any kind, newest first (endedAt, then id)
  }
  export function withoutPlayerFilter(stats: StatsContext): StatsContext;   // the same object when players is null
  export function computePlayer(stats: StatsContext, player: number, now: number): PlayerStats;
  export interface PlayerListRow { player: number; name: string; games: number; winRate: Rate;
    rating: number; provisional: boolean; lastPlayed: number }
  export function computePlayersList(stats: StatsContext): PlayerListRow[];
  ```
- `elo`: `rank` as OVERVIEW's power ranking gives it (non-provisional players through `rankRows`
  on rounded ratings with `min` 0; null when provisional); `history` from `{ x: 0, y: ELO_START }`,
  then a point per counted game they sat in, adding that game's `GameElo.liberalChange` as a
  Liberal and subtracting it as a Fascist, `dashed: x < PROVISIONAL_GAMES` (OVERVIEW's line is
  dashed while provisional). `roles.expectedLiberal` is `expectedLiberalGames / games`. Rates over
  games use `MIN_GAMES`; the modules' rates are passed on as they are.

- [ ] **Step 1: Write the failing tests** on `sampleData()` at `SAMPLE_NOW`, `ctx = buildStats(data,
  DEFAULT_FILTER)`:
  `annsCountsAndDates` (games 6, `firstPlayed` g1's `startedAt`, `lastPlayed` g6's `endedAt`,
  `cpuNotCounted` 1, `allGames` 8); `annsRolesWinsAndStreaks` (roles 4/1/1, `expectedLiberal`
  close to 0.6, `luck` close to 4/6 − 0.6, overall 5 of 6 with a value, as Liberal 3 of 4 with
  value null, `bySeats` one entry, 5 seats at 5 of 6, streaks `{ current: 1, longestWin: 4,
  longestLoss: 1 }`); `annsCardsVotesAndPowers` (hands `[2, 1, 0, 0]`, Liberal accuracy 1 of 1,
  `oneOfEach.FASCIST` 1 of 1, `forced` `{ president: 2, chancellor: 0 }`, Ja 4 of 4, vote accuracy
  3 of 3, executions 1, of Hitler 1, survival 5 of 6); `annsTiming` (`{ nominate: 10000, vote:
  2000, discard: 1000, chancellor: 2000, power: 3000, endTerm: 1000 }`);
  `mostPlayedWithBreaksTiesByName` (`{ player: 2, name: "Bo", games: 6 }`); `peopleComeFromRivals`
  (best teammate, nemesis and favourite opponent are `computeRivals(ctx.counted,
  ctx.names).byPlayer.get(1)`'s, with names); `annsElo` (not provisional, `rank` a number, 7
  history points, the first `{ x: 0, y: 1500, dashed: true }`, the last `y` close to
  `ctx.elo.ratings.get(1)!.rating`); `annsLatestGames` (ids `["unf", "g6", "cpu", "g5", "g4"]`,
  results `["unfinished", "won", "won", "lost", "won"]`, `cpu` only on `cpu`); `annsTrophies` (ids
  `["hitlerHunter", "chancellorHitler"]`); `theToggleCountsCpuGames` (`cpu: true`: games 7,
  `cpuNotCounted` 0, overall 6 of 7, current streak 2); `thePlayerFilterIsIgnored` (`buildStats(data,
  { players: new Set([2, 3]), cpu: false })` gives the same `PlayerStats` as `ctx`);
  `aPlayerWithOnlyCpuGamesHasZeroes` (Gus: games 0, `elo` null, `cpuNotCounted` 1, `allGames` 1,
  `latest` ids `["cpu"]`, `trophies` `[]`, every rate over 0 chances, `streaks` all 0, `people` all
  null); `anUnknownNumberHasNothing` (99: games 0, `allGames` 0, `latest` `[]`);
  `withoutPlayerFilterKeepsAContextWithNone` (returns `ctx` itself). PLAYERS:
  `sortsByEloWithProvisionalLast` (`withRatings` Ann 1540/6, Bo 1560/6, Cy 1520/6, Di 1500/6, Ed
  1560/5, Fay 1700/1: names `["Bo", "Ed", "Ann", "Cy", "Di", "Fay"]`, only Fay provisional);
  `listRowsHoldGamesWinRateAndLastPlayed` (Ann: 6 games, 5 of 6, `lastPlayed` g6's `endedAt`;
  Fay's rate value null; no row for Gus); `theListUsesTheFilter` (players 1 to 5: no Fay, Ann 5
  games).
- [ ] **Step 2: Run** `npx vitest run src/stats/player.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces. `computePlayer` starts from
  `withoutPlayerFilter(stats)` (`buildStats(data, { players: null, cpu })`) and runs `allStats`
  once for both the numbers and the trophies. PLAYERS: every player with a counted game, in power
  ranking order (non-provisional by rounded rating, ties to more games, then `compareNames`; then
  provisional by rating, games, name).
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): assemble a player's numbers`, ticking box 3.

---

### Task 5: Names link to their pages

**Files:**
- Modify: `frontend/src/stats/PlayerName.tsx`, its test and CSS; earlier phases' tests that assert
  a plain-text name
- Create: `frontend/src/stats/nameLinks.test.tsx`

**Interfaces:**
- Consumes: `StatsLink`, `useLocation`, `parseRoute`, `routePath` (`routes.ts`); `parseFilter`,
  `filterSearch`.
- Produces:
  ```ts
  export function playerHref(player: number, at: { pathname: string; search: string }): string;
  // <PlayerName player={number | null} name={string} role?={Role} link?={boolean} />   link defaults to true
  ```
  `playerHref` is `routePath({ page: "player", number })` plus `filterSearch(parseFilter(search))`
  when `at` is a tab, PLAYERS or a player page, and nothing more from GAMES or a game page (their
  address holds GAMES' own filter). `PlayerName` renders `<StatsLink href className>` with class
  `player-link` and the role classes it gave the plain name, for a non-null `player` with `link`
  true, and the plain name otherwise.

- [ ] **Step 1: Write the failing tests.** In `PlayerName.test.tsx` (each sets the address with
  `history.pushState`): `linksAPlayerToTheirPage` (at `/stats/roles`, Cy's link `href`
  `/stats/players/3`, class `player-link`); `aCpuSeatIsPlainText` (player null, `Bot 1`: no link);
  `linkFalseIsPlainText`; `carriesTheStatsFilter` (with the search `?players=1,2&cpu=1` on
  `/stats/roles`, `/stats/players` and `/stats/players/4`: `parseFilter` of the link's search is
  `{ players: {1, 2}, cpu: true }`); `carriesNothingFromGames` (at `/stats/games?players=1` and
  `/stats/games/abc`: `href` exactly `/stats/players/3`); `aPlainClickMovesInThePage`
  (`fireEvent.click(link)` returns false and `location.pathname` is `/stats/players/3`);
  `aModifiedClickIsTheBrowsers` (`ctrlKey`, `metaKey`, `shiftKey`, `button: 1`: `fireEvent.click`
  returns true, the path unchanged). `nameLinks.test.tsx`: `StatsApp` with `fetch` answering
  `sampleData()`, then the contract fixture, at `/stats`, each tab's path, `/stats/games`,
  `/stats/games/g1` and `/stats/games/cpu`: `namesAreLinksNeverNested` (once the page shows, `a a,
  button a, label a, a button` matches nothing; a name in a table cell or seat list is an
  `a.player-link`; no link's text starts `Bot `); `headlinesKeepPlainNames` (no `a.player-link`
  inside OVERVIEW's `At a glance` region, RIVALS' `.rivals-headline`, ACTIVITY's fastest voter and
  slowest president lines, or RECORDS' one-line records, all of which pass `link={false}`).
- [ ] **Step 2: Run** `npx vitest run src/stats/PlayerName.test.tsx src/stats/nameLinks.test.tsx`.
  Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces, and update every earlier test that asserted a linked
  name as plain text. CSS (`PlayerName.css`): the role colour stays, no underline but Hitler's and
  on hover, a `:focus-visible` outline in `--selectionHover`, `overflow-wrap: anywhere`; in the
  stacked query a link in a table cell (`td`, `th`) is `display: flex; align-items: center;
  min-height: 44px; min-width: 44px`, filling its row, with no padding or margin past its cell;
  anywhere else it stays inline. If a headline check fails, the owning tab misses its
  `link={false}`: stop and report rather than editing that tab.
- [ ] **Step 4: Run** `npm test -- --run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): link each player's name to their page`, ticking box 4.

---

### Task 6: RECORDS' trophy holders

**Files:**
- Create: `frontend/src/stats/players/TrophyBadge.tsx`, `TrophyBadge.css`, `TrophyBadge.test.tsx`
- Modify: `frontend/src/stats/tabs/RecordsTab.tsx` and its test

**Interfaces:**
- Consumes: `computeTrophies`, `trophyHolders`, `TROPHIES`, `StatCard`, `NO_GAMES`, `PlayerName`.
- Produces: `TrophyBadge(props: { trophy: Trophy })` (a pill with the label and the rule as its
  `title`; text and border `#f08a5d` on the card; Phase 22B's player page reuses it). RECORDS gains
  a last card, `Trophy holders`, defined as `Worked out from the counted games. Most need 8 of
  them.`: a table, one row per trophy in table order, with its badge, its rule, then its holders as
  `PlayerName`s or `No one yet.`; `empty` with no counted games. `computeTrophies` takes the `now`
  the tab already gives `computeRecords` (its optional `now` prop, else `Date.now()` once).

- [ ] **Step 1: Write the failing tests:** `trophyHoldersIsTheLastCard` (`<RecordsTab
  stats={buildStats(sampleData(), DEFAULT_FILTER)} now={SAMPLE_NOW} timeZone={TZ} />`: the last
  region `Trophy holders`, 15 rows with the labels in order, Hitler Hunter's and Chancellor
  Hitler's rows each a link `Ann`, Regular's `No one yet.`); `theCardIsEmptyWithNoGames` (players
  `{7}`: `NO_GAMES`); in `TrophyBadge.test.tsx`, `aBadgeCarriesItsRule` (`TROPHIES[0]`: text
  `Regular`, `title` `At least 20 counted games`).
- [ ] **Step 2: Run** `npx vitest run src/stats/tabs/RecordsTab.test.tsx src/stats/players`.
  Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** the same command. Expected: PASS, Phase 21B's RecordsTab tests too.
- [ ] **Step 5: Commit** `feat(frontend): list the trophy holders in records`, ticking box 5.

---

### Task 7: The game page's Elo change

**Files:**
- Create: `frontend/src/stats/game/gameElo.ts`, `gameElo.test.ts`
- Modify: `frontend/src/stats/game/GameHeader.tsx`, `game/GamePage.tsx` and their tests

**Interfaces:**
- Consumes: `replayElo`, `countedGames`, `DEFAULT_FILTER`, `GameElo`, `EloResult`, `formatSigned`.
- Produces: `defaultElo(data: StatsData): EloResult` (`replayElo(countedGames(data.games,
  DEFAULT_FILTER))`, memoized per `data` in a `WeakMap`); `gameEloChange(data: StatsData, gameId:
  string): GameElo | null`. `GameHeader` gains `elo?: GameElo | null` and, when it is set, a line
  `Elo: Liberals <formatSigned(liberalChange)> · Fascists <formatSigned(-liberalChange)>` under its
  facts; `GamePage` passes `gameEloChange(data, record.id)`. In the stacked query each
  `ol.game-seats` item is at least 44px tall and its name link fills it, as table rows do.

- [ ] **Step 1: Write the failing tests:** `gameElo.test.ts`: `theFirstFiveSeatGameMovesSixteen`
  (`gameEloChange(sampleData(), "g1")!.liberalChange` close to 16); `cpuUnfinishedAndUnknownHaveNone`
  (`cpu`, `unf`, `nope`: null); `defaultEloIsReplayedOnce` (two calls, one object).
  `GameHeader.test.tsx`: `aCountedGameShowsItsEloChange` (g1 with `elo` from `gameEloChange`:
  `Elo: Liberals +16 · Fascists −16`); `noEloNoLine` (`elo` null or absent: no text starting
  `Elo:`); `seatsLinkToPlayers` (g1's `Ann` a link; `cpu`'s `Bot 1` plain). `GamePage.test.tsx`:
  `thePageShowsTheEloChange` (`/stats/games/g1` shows the line, `/stats/games/cpu` does not).
- [ ] **Step 2: Run** `npx vitest run src/stats/game`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): show a game's elo change on its page`, ticking box 6.

---

### Task 8: Browser tests

**Files:**
- Create: `frontend/e2e/stats-names.spec.ts`

**Interfaces:**
- Consumes: `stubStats`, `bigStatsData`, `statsSizesFor`, `checkStatsPage` (`./stats`); `settle`
  (`./lobby`); `routePath` (`../src/stats/routes`); types only from `../src/stats/record`.
- Produces in the spec: `overlappingNameLinks(page: Page): Promise<string[]>` (for every `table`,
  the visible `a.player-link` boxes grouped by their cell's column index; each pair in one column
  whose boxes overlap, as `"<name> / <name>"`).

- [ ] **Step 1: Write the tests,** each against `stubStats(page, bigStatsData())`:
  `name links in tables are 44px and never overlap` (`test.slow()`; at every
  `statsSizesFor(testInfo.project.name, viewport)` size, each tab, `/stats/games` and a game page:
  `checkStatsPage(page, size)`, and where the stacked query matches, `overlappingNameLinks(page)`
  empty); `a name in GAMES opens its player page, at its top` (scroll to the last row, click its
  first `a.player-link`: the path is `/stats/players/<n>`, never `/stats/games/…`, Phase 15's
  placeholder card `PLAYER` with `Coming in a later update.` shows, `window.scrollY` is 0); `a game
  page shows its Elo change` (the newest game with no CPU seat and an outcome other than
  `UNFINISHED` shows a line starting `Elo: Liberals`; an `UNFINISHED` one shows none).
- [ ] **Step 2: Run** `E2E_PORT=4622 npm run e2e -- e2e/stats-names.spec.ts`. Expected: PASS in
  `desktop`, `firefox`, `phone-360` and `phone-412` (Firefox in the Linux image if it will not
  launch). Fix layout failures in this phase's CSS, measuring phone widths in the Linux image.
- [ ] **Step 3: Run** `E2E_PORT=4622 npm run e2e`. Expected: every project passes, the earlier
  `stats-*.spec.ts` included now that names are links.
- [ ] **Step 4: Commit** `test(frontend): check name links and the elo change in the browser`,
  ticking box 7.

---

### Task 9: Docs and screenshots

**Files:**
- Modify: `CLAUDE.md`, `DEVELOPMENT.md`, `README.md` (only if stale), `docs/PLAN.md`
- Create: `docs/pr/phase-22a-trophies-links/after-{records,game}-{1600x900,412x915}.png`
- Delete: `frontend/e2e/pr-shots.spec.ts` (never committed)

- [ ] **Step 1: Take the "after" shots.** Set `PREFIX = "after"` in `pr-shots.spec.ts`, run it as
  in Task 1 (port 4722), check that RECORDS ends with the trophy holders card, the game header has
  its Elo line and names are links, then delete the spec.
- [ ] **Step 2: Update the docs.** `CLAUDE.md` (the stats part of Layout: trophies and where their
  facts come from, `allStats`, `player.ts` for Phase 22B, `PlayerName` as a link, `playerHref` and
  the 44px rule for names in table rows, RECORDS' trophy holders, the game header's Elo change and
  `gameElo.ts`, `stats-names.spec.ts` among the browser tests); `DEVELOPMENT.md` (the stats section
  names `stats-names.spec.ts`); `README.md` only where an earlier phase's stats bullet now reads
  wrong (the whole-section rewrite is Phase 22B's). Nothing names the home server.
- [ ] **Step 3: Commit** `docs(docs): add phase 22a's after screenshots`, `docs(claude): describe
  trophies and name links`, and `docs(development): …` (and `docs(readme): …` if touched), the last
  ticking box 8.

---

### Task 10: Review

- [ ] **Step 1: Review.** Run the `code-review` skill against `origin/development`, with the spec's
  sections named at the top and this plan as the spec.
- [ ] **Step 2: Fix every finding,** Minor ones included, each with a test where it changes
  behaviour, in commits of their own scope; a finding that needs no change gets its reason. Keep
  the list (finding, what was done) for the PR's Review section.
- [ ] **Step 3: Run everything:** `cd backend && ./gradlew test`, `cd frontend && npm test -- --run
  && npm run build`, `E2E_PORT=4622 npm run e2e`. Expected: all pass in all four projects; keep the
  counts for the PR.
- [ ] **Step 4: Commit** the last fix with the acceptance box "Backend and frontend unit tests
  pass, …" ticked (or `docs(plan): tick phase 22a's test box` if there was nothing to fix).

---

### Task 11: Pull request

- [ ] **Step 1: Push and open the PR.** `git push -u origin phase-22a-trophies-links`; `gh pr
  create --repo jussaw/Secret-Hitler-Online --base development --head phase-22a-trophies-links
  --title "feat(frontend): add trophies, name links and the elo change to the stats" --body-file
  <scratchpad file>`. The body follows `CLAUDE.md`'s Workflow: the before-and-after table (RECORDS
  and a game page, at 1600x900 and 412x915, raw URLs pinned to the pushed head), Changes,
  Decisions (each number computed here rather than read from a module), Review, and `Part of #31`.
- [ ] **Step 2: Bring CI to green,** fixing on the branch and pushing until every job passes. The
  phase's work ends here, with the PR open and green; report its number.
- [ ] **Step 3: Merge (the manager session, with the user's standing OK).** Each part is skipped
  when already done, so the step can be resumed: if the "PR merged into `development`" box is not
  ticked on the branch, commit `docs(plan): tick phase 22a's merge` (the box and the Progress row
  "done"), push and wait for green; if `gh pr view <n> --repo jussaw/Secret-Hitler-Online --json
  state` is not `MERGED`, run `gh pr merge <n> --squash --admin --repo jussaw/Secret-Hitler-Online
  --subject "feat(frontend): add trophies, name links and the elo change to the stats (#<n>)"`;
  then `gh run list --repo jussaw/Secret-Hitler-Online --branch development --limit 1` shows the
  push's run publishing `:latest`.
