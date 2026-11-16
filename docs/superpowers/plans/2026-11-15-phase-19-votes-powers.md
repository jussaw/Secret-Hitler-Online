# Phase 19: VOTES & POWERS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The VOTES & POWERS tab at `/stats/votes`: each player's elections, votes, presidential powers
and survival over the counted games (issue #31, Phase 19 of 22).

**Architecture:** Two pure modules read `rounds(record)` (Phase 16) for every counted game and keep
one entry per player number: `votes.ts` (`computeVotes`) and `powers.ts` (`computePowers`). The tab
(`tabs/VotesTab.tsx`, Phase 17A's placeholder) memoizes both on `stats.counted` and draws 26
`StatCard`s in two sections, each holding Phase 17A's `RankedTable` or `SplitTable`. No shared
source file changes; only the docs are shared.

**Tech Stack:** React 18, TypeScript 5, Vite, Vitest with Testing Library, `@playwright/test`.

**Spec:** [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](../specs/2026-11-15-game-stats-design.md):
"VOTES & POWERS (Phase 19)", "Counting rules", "Cards", "The record", "Constraints" and "Tests".
Shared names: [`2026-11-15-game-stats-interfaces.md`](2026-11-15-game-stats-interfaces.md), used
exactly, its "Settled after the plans were written" section above all. Parent plan:
[`docs/PLAN.md`](../../PLAN.md), Phase 19. Where this plan and the spec differ, the spec wins.

## Before you start

- [ ] Make the worktree and branch `phase-19-votes-powers` off an up-to-date `origin/development`
  once Phases 16 and 17A (the stats engine and shared pieces) have merged: check that `git log
  origin/development` has both before branching. Phases 17B (OVERVIEW), 18, 20 and 21A run at the
  same time on their own branches. In `frontend/`: `npm ci && npx playwright install chromium firefox`. Browser tests run
  on `E2E_PORT=4619` and the screenshot runs on `E2E_PORT=4719` (check each is free: `lsof
  -iTCP:<port> -sTCP:LISTEN` prints nothing), the Linux image's runs too. Java 17 active for
  anything that builds the jar (`JAVA_HOME` at an installed Java 17).
- [ ] Read what this phase consumes, and treat its tests as the authority where this plan restates
  it: `record.ts`; `format.ts` (`plural`); `rounds.ts` and `game/sampleGames.ts` (`ev`);
  `counting.ts` (`rate`, `rankRows`, `humanSeats`); `testGames.ts` (`game`, `seatsOf`); `useStats.ts`
  (`buildStats`); `numbers.ts` (`formatPercent`); `StatCard.tsx` (`empty`, `className`,
  `NO_GAMES`); `RankedTable.tsx` (`countLabel`, `showCount`); `SplitTable.tsx` and
  `ScrollRegion.tsx`; `tabs/VotesTab.tsx` (its named export); `e2e/stats.ts` (`stubStats`,
  `bigStatsData`, `statsSizesFor`, `checkStatsPage`). Where one differs from what this plan says,
  report it before going on.
- [ ] **"Before" screenshots, before any code change.** Write `frontend/e2e/pr-shots.spec.ts`
  (never committed): `test.skip(!process.env.PR_SHOTS)`, then one test that sets 1600x900 in
  `desktop` and 412x915 in `phone-412` (`testInfo.project.name`), calls `stubStats(page,
  bigStatsData())`, opens `/stats/votes`, calls `settle(page)` and saves a full-page screenshot to
  `../docs/pr/phase-19-votes-powers/${process.env.PR_SHOTS}-votes-<W>x<H>.png`. Run
  `PR_SHOTS=before E2E_PORT=4719 npx playwright test e2e/pr-shots.spec.ts --project=desktop
  --project=phone-412`. Expected: two PNGs of Phase 17A's "Coming in a later update." card.

## Global Constraints

- **Files:** create `frontend/src/stats/votes.ts`, `powers.ts`, `votesTestRounds.ts` (test builders,
  imported only by tests), `votes.test.ts`, `powers.test.ts`, `tabs/VotesTab.css`,
  `tabs/VotesTab.test.tsx` and `frontend/e2e/stats-votes.spec.ts`; fill `tabs/VotesTab.tsx`. No
  other source file changes. The docs (`CLAUDE.md`, `README.md`, `DEVELOPMENT.md` if stale, Phase
  19's section and Progress row in `docs/PLAN.md`, `docs/pr/phase-19-votes-powers/`) are the only
  shared files.
- **Read rounds, never events:** `votes.ts` and `powers.ts` read `rounds(record)` and
  `record.seats` only. Only the fixture tests count raw events, on purpose, to cross-check them.
- **People only:** `byPlayer` is keyed by player number, from `humanSeats(record)`. A CPU seat never
  gets an entry, but its vote counts in an election's totals and its role decides who is a
  teammate. A player with no counted game has no entry.
- **Sides:** the Liberal side is `LIBERAL`; the Fascist side is `FASCIST` and `HITLER` (`sideOf`). A
  teammate is another seat on the same side. "As Fascist" in a split by role means `FASCIST` only.
- **Minimum samples:** every `Rate` comes from Phase 17A's `rate(hits, chances, min = MIN_CHANCES)`;
  survival passes `MIN_GAMES` (both are 5, powers included), so `value` is null below it and the
  count still shows beside the "—".
- **The voting rule:** a government passes when its Ja votes are strictly more than half of the
  votes cast (`SecretHitlerGame.registerVote`: `ja / total > VOTING_CUTOFF`, 0.5000001, with at most
  10 votes), so a tie fails. `round.election.passed` is that result; read it, never recompute it.
- **Copy, exactly:** section headings `ELECTIONS AND VOTES` and `POWERS AND SURVIVAL`; the titles,
  definitions and lines in Task 5's table; `NO_GAMES` (`No games yet with these players.`) on every
  card when no game counts.
- **Layout:** no sideways scroll from 320x568 to 1920x1080 (`checkStatsPage`, no check of this
  phase's own), a split table scrolling inside its card (`SplitTable`'s `ScrollRegion`); 44px
  targets in the stacked query. `App.css`'s global rules (`div` centred, `h2` sizes and margins)
  reach the stats pages, so `VotesTab.css` sets its own alignment, sizes and margins. No new
  dependency, chart or art.
- **ES2020 only** (`tsconfig.json`'s target and `lib`; `npm run build` type-checks the tests too):
  no `Array.prototype.at`, `Object.hasOwn`, `replaceAll`, `findLast` or newer (`rs[rs.length -
  1]`). No `e2e/` file imports `src/constants` or anything that imports it.
- **Linux fonts:** CI draws text 11–17% wider than macOS at phone sizes; measure the phone projects
  and Firefox in `mcr.microsoft.com/playwright` (`DEVELOPMENT.md`, "Browser tests on Linux").
- **Commits:** Conventional Commits with a scope (`frontend`, `plan`, `docs`, `claude`, `readme`,
  `development`), lowercase imperative, at most 72 characters, each test with its code. Tasks 1 to 7
  tick Phase 19's boxes 1 to 7 in `docs/PLAN.md` in their last commit, and Task 8 ticks boxes 8
  (the review) and 9 (the screenshots); Task 1 also sets Phase 19's Progress row to `in progress`.
- **Public repo:** nothing about the hosting setup in code, docs, commits or the PR.

## Definitions (Tasks 1 to 4)

For each counted game `g`, with `rs = rounds(g)` and a seat's side `sideOf(g.seats[seat].role)`:

- A **nomination** is a round with `chancellor !== null`; its **government** is `president` and
  `chancellor`. A round's **votes** count only once voting closed (`election !== null`).
- With `n = election.ja + election.nein` and `need = Math.floor(n / 2) + 1` (the fewest Ja that
  pass), as the spec words it: a **swing vote** is a Ja in a passed election with `election.ja ===
  need`, or a Nein in a failed one with `election.ja === need - 1`. So 4–3, 4–2 and 2–1 make every
  Ja a swing vote, 3–4, 3–3 and 1–2 every Nein, and 5–2 and 2–4 none.
- A **lone dissent** is a vote in an election with `n >= 3` whose side has exactly one vote
  (`election.ja === 1` for a Ja, `election.nein === 1` for a Nein).
- A **failed election** is a round with `election.passed === false`. **Chaos** is every round with
  `enacted?.by === "chaos"`, whether a third failed election or an accepted veto with the tracker at
  2 caused it (the same ones ENDINGS counts), counted for that round's `president`. An accepted veto
  is not a failed election.
- **The election that voted Hitler in** exists only when `g.outcome === "HITLER_ELECTED"`: the last
  round whose election passed with a `HITLER` chancellor. An earlier passed election of Hitler
  (before three Fascist policies) is not it.
- A power is `round.power`, used by `power.seat`. A veto answer is `round.veto` with `accepted !==
  null`, given by `round.president`. Survival is `seat.alive` at the end.

## Review Focus

1. **CPU seats with the toggle on:** a CPU's vote decides whether a person's vote swung it, a CPU
   president's nomination, investigation or execution counts for the person it named, and no CPU
   gets a row or a `null` key. Tasks 2 and 4 test it.
2. **A chaos policy after an accepted veto** (tracker at two): chaos for that term's president, but
   no failed election, since the government was elected. Task 1 tests it.
3. **Hitler elected chancellor before three Fascist policies:** the game goes on, and those Ja votes
   are not "voted Hitler in". Task 2 tests it.
4. **Nobody with a chance** (no counted games, or no veto, execution or investigation under the
   filter): no division by zero, no `NaN`, the row left out and the card's own line shown. Tasks 1
   and 5 test it.
5. **A renamed player:** one row per player number, under the current name from `stats.names`,
   never a seat's old name. Task 5 tests it.

---

### Task 1: Elections (`votes.ts`, part 1)

**Files:**
- Create: `frontend/src/stats/votesTestRounds.ts`, `frontend/src/stats/votes.ts`
- Test: `frontend/src/stats/votes.test.ts`

**Interfaces:**
- Consumes: `rounds`, `Round` (`rounds.ts`); `ev` (`game/sampleGames.ts`); `GameRecord`,
  `GameEvent`, `Role`, `Side`, `Card`, `Outcome`, `sideOf` (`record.ts`); `rate`, `Rate`,
  `humanSeats` (Phase 17A's `counting.ts`), `seatsOf` (Phase 17A's `testGames.ts`); `makeRecord` (`testRecords.ts`).
- Produces in `votesTestRounds.ts`:
  - `FIVE: Role[]` (`LIBERAL` ×3, `FASCIST`, `HITLER`); `SEVEN: Role[]` (`LIBERAL` ×4, `FASCIST`
    ×2, `HITLER`); `ALL = [0, 1, 2, 3, 4]`; `range(from: number, to: number): number[]`.
  - `type PowerEvent`: a `peek`, `investigate`, `execute` or `specialElection` event without `t`
    and `r` (a distributive `Omit`, `T extends unknown ? Omit<T, "t" | "r"> : never`, so `type`
    still narrows); `interface TermOptions { chaos?: Card; veto?: boolean; power?: PowerEvent;
    ends?: boolean }`; `investigate(seat: number, target: number, result: Side): TermOptions` and
    `execute(seat: number, target: number, role: Role): TermOptions` (a `power` of that kind).
  - `term(r: number, president: number, chancellor: number, ja: number[], nein: number[], options?:
    TermOptions): GameEvent[]`, every event with `r` and `t` 0, through `ev`: `nominate`; a `vote`
    per seat in `ja`, then in `nein`; `election` (`passed: ja.length > nein.length`). With `ends`,
    nothing more (the game ended at the election). A failed one: `tracker` (`value: chaos ? 3 :
    1`) and, with `chaos`, an `enact` of it `by: "chaos"`. A passed one: the president's `draw`
    `"FFL"` and `discard` `{ index: 0, card: "F" }`; then with `veto` defined, the chancellor's
    `veto` and the president's `vetoAnswer` `{ accepted: veto }`, followed when accepted by the
    failed path's `tracker` and chaos `enact`, when refused by the chancellor's `enact` of `F`;
    without `veto`, the chancellor's `enact` of `F`, then `power` (given `t` and `r`). Every term
    but an `ends` one closes with `endTerm` `{ seat: president, by: "president" }`. Board counts
    in `enact` are placeholders.
  - `interface GameOptions { players?: (number | null)[]; names?: string[]; outcome?: Outcome }`;
    `gameOf(roles: Role[], terms: GameEvent[][], options?: GameOptions): GameRecord` (named apart
    from `testGames.ts`'s `game`), through `seatsOf` and `makeRecord`: players default to seat +
    1 (`null` a CPU seat, `hasCpu` set), `names` replace the seats' names, a seat an `execute` targets ends not alive, `t` renumbered
    1000 apart, an `end` event with the last term's `r`, `rounds` that `r`, `outcome` default
    `LIBERAL_POLICIES` with its `winner`, and a fresh `id` and a later `endedAt` per call.
  - `eventsOf<T extends GameEvent["type"]>(games: GameRecord[], type: T): { g: GameRecord; e:
    Extract<GameEvent, { type: T }> }[]` and `sum<T>(items: Iterable<T>, f: (item: T) => number):
    number`, for the fixture tests.
- Produces in `votes.ts` (Task 2 adds the vote fields):

```ts
export interface PlayerVotes {
  games: number;                    // counted games they held a seat in
  nominatedChancellor: number;      // nominations naming them chancellor
  presidentPassed: Rate;            // as president: passed / nominations voted on
  chancellorPassed: Rate;           // as chancellor: passed / nominations voted on
  teammatePick: Record<Side, Rate>; // as president, by their side: nominations of a teammate / nominations
  failedAsPresident: number;        // as president: nominations voted down
  chaos: number;                    // as president: terms that ended in a chaos enact (failed election or accepted veto)
}
export interface VoteStats { byPlayer: Map<number, PlayerVotes> }
export function computeVotes(counted: GameRecord[]): VoteStats;
```

- [ ] **Step 1: Write the failing tests** in `votes.test.ts` (players 1 to 5 sit in seats 0 to 4):

```ts
it("counts nominations and the elections they led to", () => {
  const g = gameOf(FIVE, [
    term(1, 0, 3, [0, 1, 2, 3], [4]), term(2, 1, 3, [3], [0, 1, 2, 4]),
    term(3, 2, 0, ALL, []), term(4, 3, 0, [0, 3], [1, 2, 4]),
  ]);
  const p = computeVotes([g]).byPlayer;
  expect(p.get(4)).toMatchObject({ games: 1, nominatedChancellor: 2, failedAsPresident: 1,
    chancellorPassed: { hits: 1, chances: 2, value: null }, presidentPassed: { hits: 0, chances: 1 } });
  expect(p.get(1)).toMatchObject({ nominatedChancellor: 2, chancellorPassed: { hits: 1, chances: 2 },
    presidentPassed: { hits: 1, chances: 1 }, failedAsPresident: 0 });
  expect(p.get(2)).toMatchObject({ nominatedChancellor: 0, presidentPassed: { hits: 0, chances: 1 }, failedAsPresident: 1 });
  expect(p.get(5)!.presidentPassed).toEqual({ hits: 0, chances: 0, value: null });
});
it("gives a rate its value from five chances", () => {
  const terms = range(0, 5).map((i) => term(i + 1, 0, 1, i < 3 ? [0, 1, 2] : [0], i < 3 ? [3, 4] : [1, 2, 3, 4]));
  expect(computeVotes([gameOf(FIVE, terms)]).byPlayer.get(1)!.presidentPassed).toEqual({ hits: 3, chances: 5, value: 0.6 });
});
it("splits picking a teammate by the president's side", () => {
  const g = gameOf(FIVE, [term(1, 0, 3, ALL, []), term(2, 1, 2, ALL, []), term(3, 3, 4, ALL, []),
    term(4, 4, 0, ALL, []), term(5, 0, 1, ALL, [])]);
  const p = computeVotes([g]).byPlayer;
  expect(p.get(1)!.teammatePick).toMatchObject({ LIBERAL: { hits: 1, chances: 2 }, FASCIST: { hits: 0, chances: 0 } });
  expect(p.get(2)!.teammatePick.LIBERAL).toMatchObject({ hits: 1, chances: 1 });
  expect(p.get(4)!.teammatePick.FASCIST).toMatchObject({ hits: 1, chances: 1 }); // Hitler is a teammate
  expect(p.get(5)!.teammatePick.FASCIST).toMatchObject({ hits: 0, chances: 1 });
});
const fail = (r: number, president: number, options?: TermOptions) => term(r, president, 3, [3], [0, 1, 2, 4], options);
it("counts chaos for the president whose third failed election enacted the top policy", () => {
  const p = computeVotes([gameOf(FIVE, [fail(1, 0), fail(2, 1), fail(3, 2, { chaos: "F" })])]).byPlayer;
  expect([1, 2, 3].map((n) => [p.get(n)!.failedAsPresident, p.get(n)!.chaos])).toEqual([[1, 0], [1, 0], [1, 1]]);
});
it("counts chaos after an accepted veto too, but not as a failed election", () => {
  const p = computeVotes([gameOf(FIVE, [fail(1, 0), fail(2, 1), term(3, 2, 3, ALL, [], { veto: true, chaos: "L" })])]).byPlayer;
  expect([1, 2, 3].map((n) => [p.get(n)!.failedAsPresident, p.get(n)!.chaos])).toEqual([[1, 0], [1, 0], [0, 1]]);
});
it("has no entry without counted games, and no value without chances", () => {
  expect(computeVotes([]).byPlayer.size).toBe(0);
  const p = computeVotes([gameOf(FIVE, [term(1, 0, 3, ALL, [])])]).byPlayer;
  expect([...p.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  expect(p.get(5)!.teammatePick.FASCIST).toEqual({ hits: 0, chances: 0, value: null });
});
```

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/stats/votes.test.ts`. Expected: FAIL (no
  `votes.ts`, no `votesTestRounds.ts`).
- [ ] **Step 3: Implement** `votesTestRounds.ts` and `computeVotes` as in Interfaces and
  Definitions: one pass over `rounds(g)` per game with a seat-to-player map from `humanSeats(g)`,
  then `rate(hits, chances, MIN_CHANCES)` for each tally.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the election stats`, with Phase 19's Progress row set
  to `in progress`, ticking box 1.

---

### Task 2: Votes (`votes.ts`, part 2)

**Files:**
- Modify: `frontend/src/stats/votes.ts`
- Test: `frontend/src/stats/votes.test.ts`

**Interfaces:**
- Consumes: Task 1; `parseStatsData` (`record.ts`), `countedGames`, `DEFAULT_FILTER`
  (`counting.ts`), and `frontend/src/stats/fixtures/recorded-games.json` (imported as `fixture`).
  The fixture has CPU seats in some games, so its tests count on `countedGames(games,
  DEFAULT_FILTER)` and, where they sum raw events, only events whose seat has a player.
- Produces: `PlayerVotes` gains

```ts
  votes: number;                    // votes cast in elections that closed
  ja: Rate;                         // Ja / votes
  jaByRole: Record<Role, Rate>;     // the same, by their role in that game
  liberalAccuracy: Rate;            // as LIBERAL: right votes / votes (Ja with no Fascist-side seat in the government, Nein with one)
  fascistLoyalty: Rate;             // Fascist side: Ja / votes on governments holding a teammate other than themselves
  votedHitlerIn: number;            // as LIBERAL: Ja on the election that voted Hitler in
  hitlerElectionVotes: number;      // as LIBERAL: votes on that election
  swing: number;                    // swing votes (Definitions)
  loneDissent: number;              // lone dissents (Definitions)
```

- [ ] **Step 1: Write the failing tests:**

```ts
const TWO_FASCISTS: Role[] = ["LIBERAL", "LIBERAL", "FASCIST", "FASCIST", "HITLER"];
it("splits the Ja rate by role", () => {
  const a = gameOf(FIVE, [term(1, 0, 3, [0, 1, 3, 4], [2]), term(2, 1, 2, [0], [1, 2, 3, 4])]);
  const b = gameOf(["HITLER", "LIBERAL", "LIBERAL", "FASCIST", "LIBERAL"], [term(1, 1, 2, ALL, [])]);
  const p = computeVotes([a, b]).byPlayer;
  expect(p.get(1)).toMatchObject({ votes: 3, ja: { hits: 3, chances: 3 },
    jaByRole: { LIBERAL: { hits: 2, chances: 2 }, FASCIST: { hits: 0, chances: 0 }, HITLER: { hits: 1, chances: 1 } } });
  expect(p.get(3)!.jaByRole.LIBERAL).toMatchObject({ hits: 1, chances: 3 });
  expect(p.get(4)!.jaByRole.FASCIST).toMatchObject({ hits: 2, chances: 3 });
  expect(p.get(5)!.jaByRole).toMatchObject({ HITLER: { hits: 1, chances: 2 }, LIBERAL: { hits: 1, chances: 1 } });
});
it("judges a Liberal's vote by whether the government holds the Fascist side", () => {
  const g = gameOf(FIVE, [term(1, 0, 1, [0, 1, 3], [2, 4]), term(2, 2, 3, [2, 3, 4], [0, 1]), term(3, 3, 0, [0, 3, 4], [1, 2])]);
  const p = computeVotes([g]).byPlayer;
  expect([1, 2, 3].map((n) => p.get(n)!.liberalAccuracy)).toMatchObject([
    { hits: 2, chances: 3 }, { hits: 3, chances: 3 }, { hits: 1, chances: 3 }]);
  expect(p.get(4)!.liberalAccuracy.chances).toBe(0);
});
it("counts Fascist loyalty only on governments with a teammate other than the voter", () => {
  const g = gameOf(TWO_FASCISTS, [term(1, 2, 0, [2, 3], [0, 1, 4]), term(2, 0, 4, [0, 2, 4], [1, 3]),
    term(3, 0, 1, ALL, []), term(4, 2, 3, [2, 3, 4], [0, 1])]);
  const p = computeVotes([g]).byPlayer;
  expect([3, 4, 5].map((n) => p.get(n)!.fascistLoyalty)).toMatchObject([
    { hits: 2, chances: 2 }, { hits: 2, chances: 3 }, { hits: 1, chances: 2 }]);
});
it("counts voting Hitler in only on the election that ended the game", () => {
  const won = gameOf(FIVE, [term(1, 0, 4, [1, 3, 4], [0, 2]), term(2, 1, 4, [0, 2, 3, 4], [1], { ends: true })],
    { outcome: "HITLER_ELECTED" });
  const lost = gameOf(FIVE, [term(1, 0, 4, ALL, [])]);
  const p = computeVotes([won, lost]).byPlayer;
  expect([1, 2, 3, 4].map((n) => [p.get(n)!.votedHitlerIn, p.get(n)!.hitlerElectionVotes]))
    .toEqual([[1, 1], [0, 1], [1, 1], [0, 0]]);
});
it.each([
  { ja: 4, nein: 3, side: "ja" }, { ja: 5, nein: 2, side: null }, { ja: 4, nein: 2, side: "ja" },
  { ja: 3, nein: 3, side: "nein" }, { ja: 3, nein: 4, side: "nein" }, { ja: 2, nein: 4, side: null },
  { ja: 2, nein: 1, side: "ja" }, { ja: 1, nein: 2, side: "nein" },
])("finds the swing votes at $ja–$nein", ({ ja, nein, side }) => {
  const jaSeats = range(0, ja), neinSeats = range(ja, ja + nein);
  const p = computeVotes([gameOf(SEVEN, [term(1, 0, 1, jaSeats, neinSeats)])]).byPlayer;
  const swung = side === "ja" ? jaSeats : side === "nein" ? neinSeats : [];
  expect([...p].filter(([, v]) => v.swing === 1).map(([n]) => n).sort((a, b) => a - b)).toEqual(swung.map((s) => s + 1));
});
it.each([
  { ja: 6, nein: 1, lone: "nein" }, { ja: 1, nein: 6, lone: "ja" }, { ja: 2, nein: 1, lone: "nein" },
  { ja: 5, nein: 2, lone: null }, { ja: 7, nein: 0, lone: null },
])("finds the lone dissent at $ja–$nein", ({ ja, nein, lone }) => {
  const jaSeats = range(0, ja), neinSeats = range(ja, ja + nein);
  const p = computeVotes([gameOf(SEVEN, [term(1, 0, 1, jaSeats, neinSeats)])]).byPlayer;
  const alone = lone === "ja" ? jaSeats : lone === "nein" ? neinSeats : [];
  expect([...p].filter(([, v]) => v.loneDissent === 1).map(([n]) => n)).toEqual(alone.map((s) => s + 1));
});
it("lets CPU seats' votes decide a swing but gives them no entry", () => {
  const g = gameOf(SEVEN, [term(1, 1, 0, [0, 2, 3, 4], [1, 5, 6])], { players: [1, null, 3, 4, 5, null, 7] });
  const p = computeVotes([g]).byPlayer;
  expect([...p.keys()].sort((a, b) => a - b)).toEqual([1, 3, 4, 5, 7]);
  expect([1, 3, 4, 5, 7].map((n) => p.get(n)!.swing)).toEqual([1, 1, 1, 1, 0]); // 4–3, two Neins from CPUs
  expect(p.get(1)).toMatchObject({ nominatedChancellor: 1, liberalAccuracy: { hits: 1, chances: 1 } });
});
it("agrees with the contract fixture's raw events", () => {
  const counted = countedGames(parseStatsData(fixture).games, DEFAULT_FILTER);
  const human = (g: GameRecord, seat: number) => g.seats[seat].player !== null;
  const all = [...computeVotes(counted).byPlayer.values()];
  expect(counted.length).toBeGreaterThan(0);
  expect(sum(all, (v) => v.votes)).toBe(eventsOf(counted, "vote").filter(({ g, e }) => human(g, e.seat)).length);
  expect(sum(all, (v) => v.ja.hits)).toBe(eventsOf(counted, "vote").filter(({ g, e }) => e.ja && human(g, e.seat)).length);
  expect(sum(all, (v) => v.nominatedChancellor)).toBe(eventsOf(counted, "nominate").filter(({ g, e }) => human(g, e.chancellor)).length);
  for (const v of all) {
    expect(sum(Object.values(v.jaByRole), (r) => r.chances)).toBe(v.votes);
    for (const r of [v.presidentPassed, v.chancellorPassed, v.liberalAccuracy, v.fascistLoyalty]) expect(r.hits).toBeLessThanOrEqual(r.chances);
    expect(Math.max(v.swing, v.loneDissent, v.votedHitlerIn)).toBeLessThanOrEqual(v.votes);
  }
});
```

- [ ] **Step 2: Run** `npx vitest run src/stats/votes.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the new fields in the same pass over each round's votes, as in
  Definitions.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the vote stats`, ticking box 2.

---

### Task 3: Investigations, peeks and special elections (`powers.ts`, part 1)

**Files:**
- Create: `frontend/src/stats/powers.ts`
- Test: `frontend/src/stats/powers.test.ts`

**Interfaces:**
- Consumes: Task 1's builders (`investigate` among them); `rounds`, `rate`, `MIN_CHANCES`,
  `humanSeats`, `sideOf`.
- Produces (Task 4 adds the rest):

```ts
export interface PlayerPowers {
  games: number;
  investigations: number;                  // investigations they made as president
  saw: Record<Side, number>;               // their results
  investigatedPlayers: Map<number, number>; // target player → times; CPU targets left out
  liberalFinds: Rate;                      // as LIBERAL: results FASCIST / investigations
  teammateChecks: Rate;                    // Fascist side: targets on the Fascist side / investigations
  timesInvestigated: Record<Role, number>; // times investigated, by their role in that game
  peeks: number;
  specialElections: number;
  specialTeammate: Rate;                   // special elections whose target is on their side / special elections
}
export interface PowerStats { byPlayer: Map<number, PlayerPowers> }
export function computePowers(counted: GameRecord[]): PowerStats;
```

- [ ] **Step 1: Write the failing tests:**

```ts
it("counts investigations, what they saw and whom", () => {
  const g = gameOf(FIVE, [term(1, 0, 1, ALL, [], investigate(0, 3, "FASCIST")), term(2, 1, 2, ALL, [], investigate(1, 0, "LIBERAL")),
    term(3, 3, 0, ALL, [], investigate(3, 4, "FASCIST")), term(4, 4, 0, ALL, [], investigate(4, 2, "LIBERAL")),
    term(5, 0, 1, ALL, [], investigate(0, 4, "FASCIST"))]);
  const p = computePowers([g]).byPlayer;
  expect(p.get(1)).toMatchObject({ investigations: 2, saw: { LIBERAL: 0, FASCIST: 2 }, liberalFinds: { hits: 2, chances: 2 } });
  expect([...p.get(1)!.investigatedPlayers]).toEqual([[4, 1], [5, 1]]);
  expect(p.get(2)).toMatchObject({ investigations: 1, saw: { LIBERAL: 1, FASCIST: 0 }, liberalFinds: { hits: 0, chances: 1 } });
  expect(p.get(4)).toMatchObject({ teammateChecks: { hits: 1, chances: 1 }, liberalFinds: { chances: 0 } });
  expect(p.get(5)!.teammateChecks).toMatchObject({ hits: 0, chances: 1 });
  expect([1, 3, 4, 5].map((n) => p.get(n)!.timesInvestigated)).toEqual([
    { LIBERAL: 1, FASCIST: 0, HITLER: 0 }, { LIBERAL: 1, FASCIST: 0, HITLER: 0 },
    { LIBERAL: 0, FASCIST: 1, HITLER: 0 }, { LIBERAL: 0, FASCIST: 0, HITLER: 2 }]);
});
it("counts peeks and special elections, and which picked a teammate", () => {
  const g = gameOf(FIVE, [term(1, 0, 1, ALL, [], { power: { type: "peek", seat: 0, cards: ["L", "F", "F"] } }),
    term(2, 3, 0, ALL, [], { power: { type: "specialElection", seat: 3, target: 4 } }),
    term(3, 1, 0, ALL, [], { power: { type: "specialElection", seat: 1, target: 3 } }),
    term(4, 1, 0, ALL, [], { power: { type: "specialElection", seat: 1, target: 2 } })]);
  const p = computePowers([g]).byPlayer;
  expect(p.get(1)!.peeks).toBe(1);
  expect(p.get(4)).toMatchObject({ specialElections: 1, specialTeammate: { hits: 1, chances: 1 } });
  expect(p.get(2)).toMatchObject({ specialElections: 2, specialTeammate: { hits: 1, chances: 2, value: null } });
});
```

- [ ] **Step 2: Run** `npx vitest run src/stats/powers.test.ts`. Expected: FAIL (no `powers.ts`).
- [ ] **Step 3: Implement** `computePowers` as in Interfaces and Definitions.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the investigation, peek and special election stats`,
  ticking box 3.

---

### Task 4: Executions, vetoes and survival (`powers.ts`, part 2)

**Files:**
- Modify: `frontend/src/stats/powers.ts`
- Test: `frontend/src/stats/powers.test.ts`

**Interfaces:**
- Consumes: Task 3; Task 1's `execute`; `MIN_GAMES`; the fixture, `parseStatsData`,
  `countedGames`, `DEFAULT_FILTER`, `computeVotes`.
- Produces: `export interface VetoAnswers { accepted: number; refused: number }`, and `PlayerPowers`
  gains

```ts
  executions: number;
  fascistTargets: Record<Side, Rate>;      // by the executioner's side: targets on the Fascist side / executions
  hitlerExecuted: number;                  // executions whose target was HITLER
  timesExecuted: number;
  executedFirst: number;                   // games whose first execution targeted them
  vetoes: Record<Role, VetoAnswers>;       // as president, answers to a chancellor's veto, by their role
  survival: Rate;                          // games alive at the end / games (MIN_GAMES)
  survivalByRole: Record<Role, Rate>;
```

- [ ] **Step 1: Write the failing tests:**

```ts
const hunted = gameOf(FIVE, [term(1, 0, 1, ALL, [], execute(0, 3, "FASCIST")),
  term(2, 1, 2, [0, 1, 2, 4], [], execute(1, 4, "HITLER"))], { outcome: "HITLER_EXECUTED" });
const purged = gameOf(FIVE, [term(1, 3, 1, ALL, [], execute(3, 0, "LIBERAL")),
  term(2, 4, 1, [1, 2, 3, 4], [], execute(4, 3, "FASCIST"))], { outcome: "FASCIST_POLICIES" });
it("counts executions, their targets, Hitler and who went first", () => {
  const p = computePowers([hunted, purged]).byPlayer;
  expect(p.get(1)).toMatchObject({ executions: 1, fascistTargets: { LIBERAL: { hits: 1, chances: 1 } }, timesExecuted: 1, executedFirst: 1 });
  expect(p.get(2)).toMatchObject({ executions: 1, hitlerExecuted: 1, fascistTargets: { LIBERAL: { hits: 1, chances: 1 } }, timesExecuted: 0 });
  expect(p.get(4)).toMatchObject({ executions: 1, fascistTargets: { FASCIST: { hits: 0, chances: 1 } }, timesExecuted: 2, executedFirst: 1 });
  expect(p.get(5)).toMatchObject({ executions: 1, hitlerExecuted: 0, fascistTargets: { FASCIST: { hits: 1, chances: 1 } },
    timesExecuted: 1, executedFirst: 0 });
});
it("splits survival by role", () => {
  const p = computePowers([hunted, purged]).byPlayer;
  expect(p.get(1)).toMatchObject({ survival: { hits: 1, chances: 2, value: null }, survivalByRole: { LIBERAL: { hits: 1, chances: 2 } } });
  expect(p.get(2)!.survival).toMatchObject({ hits: 2, chances: 2 });
  expect(p.get(4)!.survivalByRole.FASCIST).toMatchObject({ hits: 0, chances: 2 });
  expect(p.get(5)!.survivalByRole.HITLER).toMatchObject({ hits: 1, chances: 2 });
});
it("gives survival its value from five games", () => {
  const games = range(0, 5).map((i) => gameOf(FIVE, [term(1, 3, 1, ALL, [], i === 0 ? execute(3, 0, "LIBERAL") : {})]));
  expect(computePowers(games).byPlayer.get(1)!.survival).toEqual({ hits: 4, chances: 5, value: 0.8 });
});
it("splits a president's veto answers by role", () => {
  const g = gameOf(FIVE, [term(1, 0, 1, ALL, [], { veto: true }), term(2, 1, 2, ALL, [], { veto: false }),
    term(3, 3, 0, ALL, [], { veto: true }), term(4, 0, 1, ALL, [], { veto: false })]);
  const none = { accepted: 0, refused: 0 };
  const p = computePowers([g]).byPlayer;
  expect(p.get(1)!.vetoes).toEqual({ LIBERAL: { accepted: 1, refused: 1 }, FASCIST: none, HITLER: none });
  expect(p.get(2)!.vetoes.LIBERAL).toEqual({ accepted: 0, refused: 1 });
  expect(p.get(4)!.vetoes.FASCIST).toEqual({ accepted: 1, refused: 0 });
  expect(p.get(5)!.vetoes).toEqual({ LIBERAL: none, FASCIST: none, HITLER: none });
});
it("counts what a CPU seat did to a person, and never the CPU seat", () => {
  const g = gameOf(FIVE, [term(1, 1, 0, ALL, [], investigate(1, 0, "LIBERAL")), term(2, 0, 2, ALL, [], investigate(0, 1, "LIBERAL")),
    term(3, 1, 2, ALL, [], execute(1, 0, "LIBERAL"))], { players: [1, null, 3, 4, 5] });
  const p = computePowers([g]).byPlayer;
  expect([...p.keys()].sort((a, b) => a - b)).toEqual([1, 3, 4, 5]);
  expect(p.get(1)).toMatchObject({ investigations: 1, saw: { LIBERAL: 1 }, timesInvestigated: { LIBERAL: 1 },
    timesExecuted: 1, executedFirst: 1, survival: { hits: 0, chances: 1 } });
  expect(p.get(1)!.investigatedPlayers.size).toBe(0);
});
it("agrees with the contract fixture's raw events, and 1,000 games take under a second", () => {
  const counted = countedGames(parseStatsData(fixture).games, DEFAULT_FILTER);
  expect(counted.length).toBeGreaterThan(0);
  const human = (g: GameRecord, seat: number) => g.seats[seat].player !== null;
  const all = [...computePowers(counted).byPlayer.values()];
  expect(sum(all, (v) => v.executions)).toBe(eventsOf(counted, "execute").filter(({ g, e }) => human(g, e.seat)).length);
  expect(sum(all, (v) => v.timesExecuted)).toBe(eventsOf(counted, "execute").filter(({ g, e }) => human(g, e.target)).length);
  expect(sum(all, (v) => v.investigations)).toBe(eventsOf(counted, "investigate").filter(({ g, e }) => human(g, e.seat)).length);
  expect(sum(all, (v) => sum(Object.values(v.timesInvestigated), (n) => n)))
    .toBe(eventsOf(counted, "investigate").filter(({ g, e }) => human(g, e.target)).length);
  expect(sum(all, (v) => v.executedFirst)).toBe(counted.filter((g) => {
    const first = eventsOf([g], "execute")[0];
    return first !== undefined && human(g, first.e.target);
  }).length);
  for (const v of all) {
    expect(v.saw.LIBERAL + v.saw.FASCIST).toBe(v.investigations);
    expect(v.survival.chances).toBe(v.games);
    expect(sum(Object.values(v.survivalByRole), (r) => r.chances)).toBe(v.games);
  }
  const many = range(0, 1000).map((i) => counted[i % counted.length]);
  const start = performance.now();
  computeVotes(many);
  computePowers(many);
  expect(performance.now() - start).toBeLessThan(1000);
});
```

- [ ] **Step 2: Run** `npx vitest run src/stats/powers.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the new fields as in Interfaces and Definitions, survival with
  `rate(alive, games, MIN_GAMES)`.
- [ ] **Step 4: Run** `npx vitest run src/stats`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the execution, veto and survival stats`, ticking box 4.

---

### Task 5: The VOTES & POWERS tab

**Files:**
- Modify: `frontend/src/stats/tabs/VotesTab.tsx` (Phase 17A's placeholder)
- Create: `frontend/src/stats/tabs/VotesTab.css`
- Test: `frontend/src/stats/tabs/VotesTab.test.tsx`

**Interfaces:**
- Consumes: `StatsContext`, `buildStats` (`useStats.ts`); `StatCard` (`title`, `definition`, `empty?:
  boolean | string`, `className`; a `section` labelled by its `h3`), `NO_GAMES`; `RankedTable`
  (`rows`, `format`, `names`, `countLabel`, `showCount`); `SplitTable({ title, columns:
  SplitColumn[], rows: { player, cells: Record<string, SplitCell> }[], names })` with `SplitColumn
  { key, label }` and `SplitCell { text, count? }` (a player column, then a cell's text with its
  count beside it, an absent cell "—", rows sorted by name, inside a `ScrollRegion` named `${title}
  table`); `rankRows`, `Rate`, `MIN_CHANCES`, `compareNames` (`counting.ts`); `formatPercent`
  (`numbers.ts`); `plural` (Phase 15's `format.ts`); `computeVotes`, `computePowers`; for tests,
  Task 1's builders.
- Produces: the named export `VotesTab(props: { stats: StatsContext }): JSX.Element`, as Phase 17A
  made it. Markup: root `.votes-tab`; two `section.votes-section`, each an `h2` and a `.votes-grid`
  of `StatCard`s with `className="votes-card"`. Local to the file:
  - `percent(r: Rate): string`: `—` when `value` is null, else `formatPercent(value)`.
  - **Count cards:** `rankRows(rows, (a, b) => b - a, stats.names, 0)` over `{ player, value, count:
    games }` for players whose value is above zero; `format` `String`.
  - **Rate cards:** `rankRows` over `{ player, value: rate, count: rate.chances }` for players with
    `chances > 0`, larger `value` first (null last), `min` `MIN_CHANCES`; `format` `(r) =>
    formatPercent(r.value!)` (a ranked row always has a value),
    `showCount`, `countLabel` `(n) => plural(n, noun)` with the noun in the table.
  - **Split cards:** `<SplitTable title={card title} columns={…} rows={…} names={stats.names} />`.
    Columns: by role `[{ key: "LIBERAL", label: "Liberal" }, { key: "FASCIST", label: "Fascist" },
    { key: "HITLER", label: "Hitler" }]`, by side `[{ key: "LIBERAL", label: "Liberal" }, { key:
    "FASCIST", label: "Fascist side" }]`, and no other. Rows: one per player with a chance in any
    column, every column's cell given (none left to show "—" by absence): a rate cell `{ text:
    percent(r), count: r.chances }` (so a "—" still shows its count), a count cell `{ text:
    String(n) }`, a veto cell `{ text: "<accepted> of <accepted + refused>" }`.
  - Every card's `empty`: `true` (`NO_GAMES`) when `stats.counted` is empty, else its line when it
    has no row, else unset.
  - `useMemo` of `computeVotes(stats.counted)` and of `computePowers(stats.counted)`, keyed on
    `stats.counted`.

The cards, in order; the first twelve under ELECTIONS AND VOTES, the rest under POWERS AND SURVIVAL
(`v` is a `PlayerVotes`, `p` a `PlayerPowers`):

| Title | Definition | Table | Line when it has no row |
|---|---|---|---|
| NOMINATED AS CHANCELLOR | Times a president named them chancellor. | count `v.nominatedChancellor` | No nominations yet with these players. |
| NOMINATIONS PASSED | As president, the share of their nominations the vote passed. | rate `v.presidentPassed`, `nomination` | No nominations yet with these players. |
| ELECTED AS CHANCELLOR | As a nominated chancellor, the share of their elections that passed. | rate `v.chancellorPassed`, `election` | No nominations yet with these players. |
| PICKING A TEAMMATE | As president, the share of their nominations that named someone on their own side. | split `v.teammatePick`: Liberal, Fascist side | No nominations yet with these players. |
| JA RATE | The share of their votes that were Ja, by their role. | split `v.jaByRole`: Liberal, Fascist, Hitler | No votes yet with these players. |
| LIBERAL VOTE ACCURACY | As a Liberal, the share of votes that were right: Ja on a government with no one from the Fascist side, Nein on one with someone from it. | rate `v.liberalAccuracy`, `vote` | No votes yet with these players. |
| FASCIST LOYALTY | On the Fascist side, the share of Ja votes on governments with a teammate in them, not counting themselves. | rate `v.fascistLoyalty`, `vote` | No votes on a teammate's government yet with these players. |
| VOTED HITLER IN | As a Liberal, Ja votes on the election that made Hitler chancellor and ended the game. | count `v.votedHitlerIn` | No Liberal has voted Hitler in yet with these players. |
| SWING VOTES | Votes that alone would have flipped the result, had they gone the other way. | count `v.swing` | No swing votes yet with these players. |
| LONE DISSENT | The only vote against all the others in an election. | count `v.loneDissent` | No lone dissent yet with these players. |
| FAILED ELECTIONS | As president, nominations the vote turned down. | count `v.failedAsPresident` | No failed elections yet with these players. |
| CHAOS | As president, terms whose failed election or accepted veto put the top policy on the board. | count `v.chaos` | No chaos policies yet with these players. |
| INVESTIGATIONS | Party memberships they looked at as president, what they saw (F for the Fascist side, L for Liberal) and whom. | count `p.investigations`, ranked by it, shown as `4 (3 F, 1 L) · Bo 2, Cy 1, CPU 1` (see below) | No investigations yet with these players. |
| LIBERAL FINDS | As a Liberal, the share of their investigations that found someone from the Fascist side. | rate `p.liberalFinds`, `investigation` | No investigations by a Liberal yet with these players. |
| CHECKING A TEAMMATE | On the Fascist side, the share of their investigations that looked at a teammate. | rate `p.teammateChecks`, `investigation` | No investigations by the Fascist side yet with these players. |
| TIMES INVESTIGATED | Times others investigated them, by their role. | split counts `p.timesInvestigated`: Liberal, Fascist, Hitler | No investigations yet with these players. |
| PEEKS | Times they looked at the top three policies as president. | count `p.peeks` | No peeks yet with these players. |
| EXECUTIONS | Players they executed as president. | count `p.executions` | No executions yet with these players. |
| EXECUTION TARGETS | The share of their executions that hit someone from the Fascist side, by their own side. | split `p.fascistTargets`: Liberal, Fascist side | No executions yet with these players. |
| HITLER EXECUTED | Times they executed Hitler. | count `p.hitlerExecuted` | No one has executed Hitler yet with these players. |
| TIMES EXECUTED | Times they were executed. | count `p.timesExecuted` | No executions yet with these players. |
| FIRST TO GO | Games where they were the first player executed. | count `p.executedFirst` | No executions yet with these players. |
| SPECIAL ELECTIONS | Times they chose the next president. | count `p.specialElections` | No special elections yet with these players. |
| SPECIAL ELECTION PICKS | The share of their special elections that made a teammate president. | rate `p.specialTeammate`, `special election` | No special elections yet with these players. |
| VETOES AS PRESIDENT | Vetoes they accepted, of those their chancellor asked for, by their role. | split vetoes `p.vetoes`: Liberal, Fascist, Hitler | No vetoes yet with these players. |
| SURVIVAL | The share of their games they were alive at the end, by their role. | split `p.survivalByRole`: Liberal, Fascist, Hitler | No games yet with these players. |

**INVESTIGATIONS' value** is `{ count, saw, targets }` (`p.investigations`, `p.saw`,
`p.investigatedPlayers`), compared by `count`, and its `format` writes `<count> (<saw.FASCIST> F,
<saw.LIBERAL> L)`, then ` · ` and whom: each target as `<name> <times>`, most times first, then by
`compareNames`, joined by `, `, and last `CPU <n>` when `n = count − sum(targets)` is above zero.
The names are plain text from `stats.names` inside the value (as a name in running text, which stays
unlinked when Phase 22 links names); the value wraps inside its cell (`PlayerName`'s
`overflow-wrap: anywhere` and the card's `min-width: 0`).

`VotesTab.css`: the sections in a left-aligned column, `1em` apart; `h2` in `var(--headerFont)` and
`var(--textColorOnDark)` with its own size and margins; `.votes-grid` a grid, `gap: 1em`,
`grid-template-columns: repeat(auto-fit, minmax(min(100%, 20em), 1fr))`. Nothing here styles a
`RankedTable` or `SplitTable`; their look is Phase 17A's.

- [ ] **Step 1: Write the failing tests** (`PLAYERS` is Ann, Bo, Cy, Di, Ed as players 1 to 5;
  `show(games, players = PLAYERS)` renders `<VotesTab stats={buildStats({ players, games }, {
  players: null, cpu: true })} />`; `card(title)` is `screen.getByRole("region", { name: title })`;
  `TITLES` is the table's 26 titles in order):

```ts
it("shows the 26 cards in order under their two headings", () => {
  const { container } = show([]);
  expect(Array.from(container.querySelectorAll(".votes-section > h2"), (h) => h.textContent)).toEqual(["ELECTIONS AND VOTES", "POWERS AND SURVIVAL"]);
  expect(Array.from(container.querySelectorAll(".votes-card h3"), (h) => h.textContent)).toEqual(TITLES);
});
it("says so on every card when no game counts", () => {
  const { container } = show([]);
  for (const title of TITLES) expect(card(title).textContent).toContain(NO_GAMES);
  expect(container.querySelectorAll(".votes-card")).toHaveLength(26);
});
it("gives a card nobody had a chance in its own line, and never NaN", () => {
  const { container } = show([gameOf(FIVE, [term(1, 0, 1, ALL, [])])]);
  expect(card("VETOES AS PRESIDENT").textContent).toContain("No vetoes yet with these players.");
  expect(card("HITLER EXECUTED").textContent).toContain("No one has executed Hitler yet with these players.");
  expect(container.textContent).not.toMatch(/NaN|undefined|Infinity/);
  expect(container.textContent).not.toContain(NO_GAMES);
});
it("ranks a count card higher first, ties by name", () => {
  show([gameOf(FIVE, [term(1, 0, 1, [0, 1, 2], [3, 4]), term(2, 0, 1, [1, 3, 4], [0, 2])])]); // Bo 2, the rest 1
  const text = card("SWING VOTES").textContent!;
  const at = ["Bo", "Ann", "Cy", "Di", "Ed"].map((name) => text.indexOf(name));
  expect(at).toEqual([...at].sort((a, b) => a - b));
});
it("shows a split cell's value with its count, and — below the minimum", () => {
  const five = gameOf(FIVE, range(0, 5).map((i) => term(i + 1, 1, 2, i < 3 ? ALL : [1, 2, 3, 4], i < 3 ? [] : [0])));
  const once = gameOf(["HITLER", "LIBERAL", "LIBERAL", "FASCIST", "LIBERAL"], [term(1, 1, 2, ALL, [])]);
  show([five, once]);
  const table = within(card("JA RATE")).getByRole("region", { name: "JA RATE table" }); // SplitTable's ScrollRegion
  const row = within(table).getAllByRole("row").find((tr) => within(tr).queryByText("Ann"))!;
  expect(within(row).getAllByRole("cell").slice(-3).map((td) => td.textContent)) // Liberal, Fascist, Hitler
    .toEqual([expect.stringMatching(/^60%\s*5$/), expect.stringMatching(/^—\s*0$/), expect.stringMatching(/^—\s*1$/)]);
});
it("says whom each player investigated, CPU seats last", () => {
  show([gameOf(FIVE, [term(1, 0, 1, ALL, [], investigate(0, 3, "FASCIST")), term(2, 0, 1, ALL, [], investigate(0, 4, "FASCIST")),
    term(3, 0, 2, ALL, [], investigate(0, 1, "LIBERAL")), term(4, 0, 2, ALL, [], investigate(0, 3, "FASCIST"))],
    { players: [1, 2, 3, 4, null] })]);
  expect(within(card("INVESTIGATIONS")).getByText("4 (3 F, 1 L) · Di 2, Bo 1, CPU 1")).toBeInTheDocument();
});
it("shows a renamed player once, under their current name", () => {
  const seated = (first: string) => gameOf(FIVE, [term(1, 1, 0, ALL, [])], { names: [first, "Bo", "Cy", "Di", "Ed"] });
  const { container } = show([seated("Rowan"), seated("Ash")], [{ number: 1, name: "Ash" }, ...PLAYERS.slice(1)]);
  expect(container.textContent).not.toContain("Rowan");
  expect(within(card("NOMINATED AS CHANCELLOR")).getAllByText("Ash")).toHaveLength(1);
});
```

- [ ] **Step 2: Run** `npx vitest run src/stats/tabs/VotesTab.test.tsx`. Expected: FAIL (the
  placeholder has no cards).
- [ ] **Step 3: Implement** `VotesTab.tsx` and `VotesTab.css` as in Interfaces and the table.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS, no type error, and the
  build's entry chunk the size it is on `development` (only the stats chunk grew).
- [ ] **Step 5: Commit** `feat(frontend): fill the votes and powers tab`, ticking box 5.

---

### Task 6: The tab in the browser

**Files:**
- Create: `frontend/e2e/stats-votes.spec.ts` (runs in `desktop`, `phone-360`, `phone-412` and
  `firefox` by its name; `playwright.config.ts` does not change)
- Modify: `VotesTab.css` only if the tests find a layout fault

**Interfaces:**
- Consumes: `stubStats`, `bigStatsData`, `statsSizesFor(project, viewport)`, `checkStatsPage(page,
  size)` (Phase 15's `e2e/stats.ts`, imported from `./stats`); `settle` (`e2e/lobby.ts`); Task 5's
  `.votes-tab` and `.votes-card`.

- [ ] **Step 1: Write the tests.** `statsSizesFor` gives each project its sizes (every stats size
  in `desktop` and `firefox`; the project's viewport, plus `NARROW_PHONE` in `phone-360`).
  `checkStatsPage` checks that the page never scrolls sideways (a `ScrollRegion`'s content not
  counted) and, where the stacked query matches, 44px targets and 16px field text. The spec writes
  no sideways check of its own.

```ts
const NO_GAMES = "No games yet with these players.";
test("VOTES & POWERS fits every stats size", async ({ page }, testInfo) => {
  test.slow(); // the tab at every size, twice
  const sizes = statsSizesFor(testInfo.project.name, page.viewportSize()!);
  await stubStats(page, bigStatsData());
  for (const search of ["", "?cpu=1"]) {
    await page.goto(`/stats/votes${search}`);
    await expect(page.locator(".votes-card")).toHaveCount(26);
    await settle(page);
    await expect(page.locator(".votes-tab").getByText(NO_GAMES)).toHaveCount(0);
    for (const size of sizes) await checkStatsPage(page, size);
  }
});
test("with no counted game every card says so", async ({ page }) => {
  await stubStats(page, bigStatsData());
  await page.goto("/stats/votes?players=1"); // no game has player 1 in every human seat
  await expect(page.locator(".votes-tab").getByText(NO_GAMES)).toHaveCount(26);
});
```

- [ ] **Step 2: Run** `E2E_PORT=4619 npx playwright test e2e/stats-votes.spec.ts` (all four
  projects). Expected: PASS; fix `VotesTab.css` where it fails, never by dropping a column (a fault
  inside `SplitTable` or `RankedTable` goes to the manager for Phase 17A's owner).
- [ ] **Step 3: Run the phone projects and Firefox in the Linux image** (`DEVELOPMENT.md`, "Browser
  tests on Linux": the jar serving on the host with `TEST_SIGN_IN=true PORT=4619`, then
  `E2E_PORT=4619 npx playwright test --config playwright.linux.config.ts e2e/stats-votes.spec.ts --project=firefox
  --project=phone-360 --project=phone-412`). Expected: PASS.
- [ ] **Step 4: Commit** `test(frontend): check the votes and powers tab in the browser`, with any
  CSS fixes, ticking box 6.

---

### Task 7: Docs

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `DEVELOPMENT.md` (only if something in it went stale),
  `docs/PLAN.md`

- [ ] **Step 1: `CLAUDE.md`**, in the stats part of Layout: `votes.ts` (`computeVotes`) and
  `powers.ts` (`computePowers`), read from `rounds`, keyed by player number, with the swing-vote and
  chaos rules in a line each; `tabs/VotesTab.tsx` (two sections of 26 cards through Phase 17A's
  `RankedTable` and `SplitTable`, INVESTIGATIONS naming whom, each card's line when it has no row);
  `votesTestRounds.ts`; and the browser test (`stats-votes.spec.ts`). Commit `docs(claude):
  describe the votes and powers tab`.
- [ ] **Step 2: `README.md`**, "What this fork adds": what VOTES & POWERS shows, in one line beside
  the other tabs. Nothing names a host, domain or deploy tool. Commit `docs(readme): describe the
  votes and powers tab`, ticking box 7.

---

### Task 8: Whole-branch review and the "after" screenshots

**Files:**
- Create: `docs/pr/phase-19-votes-powers/before-votes-1600x900.png`, `before-votes-412x915.png`
  (taken in "Before you start"), `after-votes-1600x900.png`, `after-votes-412x915.png`
- Delete: `frontend/e2e/pr-shots.spec.ts` (never committed)

- [ ] **Step 1: Review** with the `code-review` skill against `origin/development`, with the spec's
  "VOTES & POWERS (Phase 19)" and this plan as the spec.
- [ ] **Step 2: Fix every finding,** Minor ones included, each with a test where it changes
  behaviour (`fix(frontend): …`, `test(frontend): …`, `docs(claude): …`), or write down why it needs
  no change for the PR.
- [ ] **Step 3: Re-run** `cd frontend && npm test -- --run && npm run build` and the specs the fixes
  touch. Expected: PASS. Commit the last fix (or `docs(plan): close phase 19's review`) ticking
  box 8.
- [ ] **Step 4: "After" screenshots, now that the review has changed what it will:** run
  `PR_SHOTS=after E2E_PORT=4719 npx playwright test e2e/pr-shots.spec.ts --project=desktop
  --project=phone-412`. Expected: the whole tab at both sizes. Delete `pr-shots.spec.ts`. Commit
  the four images as `docs(docs): add the votes and powers tab's screenshots`, ticking box 9.

---

### Task 9: The pull request

- [ ] **Step 1: Run everything** with Java 17 active: `cd backend && ./gradlew test`; `cd frontend &&
  npm test -- --run && npm run build`; `E2E_PORT=4619 npm run e2e -- --project=desktop
  --project=phone-360 --project=phone-412 --project=firefox` (Firefox in the Linux image if it will
  not launch on macOS). Expected: all pass; keep the counts for the PR. Commit `docs(plan): tick
  phase 19's tests box`, ticking the first acceptance box.
- [ ] **Step 2: Push and open the PR:** `git push -u origin phase-19-votes-powers`, then `gh pr
  create --repo jussaw/Secret-Hitler-Online --base development --title "feat(frontend): add the
  votes and powers tab"`. The body opens with the before-and-after table (1600x900 and 412x915,
  each image by `https://raw.githubusercontent.com/jussaw/Secret-Hitler-Online/<sha>/docs/pr/phase-19-votes-powers/<file>`,
  `<sha>` the pushed head), then the rules this plan settled where the spec is brief (lone dissent
  needs three votes, the election that voted Hitler in, a split table lists players with any
  chance), the review record and the test counts, and ends `Part of #31`.
- [ ] **Step 3: Get CI green:** `gh pr checks <n> --repo jussaw/Secret-Hitler-Online --watch`; fix
  what fails on the branch.
- [ ] **Step 4: When Phase 17B, 18, 20 or 21A merges first:** `git fetch origin && git rebase
  origin/development`. Conflicts can only be in the docs; keep both sides (their lines and ours).
  Re-run Step 1's frontend commands and `npx playwright test e2e/stats-` in all four projects, push
  with `--force-with-lease`, and re-pin the PR's image links to the new head.
- [ ] **Step 5: Merge** once CI is green and the user says yes in chat: in a last commit, tick "PR
  merged into `development`" and set Phase 19's Progress row to `done` (`docs(plan): mark phase 19
  merged`); push, wait for CI, then `gh pr merge <n> --repo jussaw/Secret-Hitler-Online --squash
  --admin --subject "feat(frontend): add the votes and powers tab (#<n>)" --match-head-commit
  <headRefOid>`, and check that `development`'s image publish passes. The user's box stays
  unticked.
