# Phase 16: The game page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a game's timeline into rounds (`rounds(record)`, which every stat phase after this
reads) and show each recorded game at `/stats/games/<id>`, round by round (issue #31).

**Architecture:** `frontend/src/stats/rounds.ts` is a pure function from one `GameRecord` to one
`Round` per round number, with blame and decision times worked out once, so no later phase reads the
raw events for them. The page fills Phase 15A's `game/GamePage.tsx` placeholder: a `GameHeader`,
then a `RoundBlock` per round, edged in the colour of the policy it enacted. It lives in the stats
chunk. Phase 15A (the stats shell) must have merged first; Phases 15B (GAMES and the links in) and
17A (the engine) run beside this one, and it touches none of their files.

**Tech Stack:** React 18, TypeScript 5, Vite, Vitest with Testing Library, `@playwright/test`
1.64.1. No new dependency.

**Spec:** [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](../specs/2026-11-15-game-stats-design.md)
("The record", "Counting rules", "ROLES & CARDS" for blame, "GAMES and the game page", Constraints,
Tests), with the mockup's right half in
[`2026-11-15-game-stats/games.jpg`](../specs/2026-11-15-game-stats/games.jpg). Shared names:
[`2026-11-15-game-stats-interfaces.md`](2026-11-15-game-stats-interfaces.md), its `rounds.ts`
section and "Settled after the plans were written" above all. Phase 15's breakdown,
[`2026-11-15-phase-15a-stats-shell.md`](2026-11-15-phase-15a-stats-shell.md), describes the shell
(its 15A part) this phase builds on. Parent plan: [`docs/PLAN.md`](../../PLAN.md), Phase 16. Read the
spec first: this plan does not repeat its reasons, and where the two differ the spec wins. The game
page's Elo change is Phase 22A's, not this phase's.

## How `rounds` reads a record

The spec and the interfaces file settle most of this; the rest is this plan's, and the tests pin all
of it.

1. **Grouping.** One `Round` per distinct `r` in `events`, ascending, each built from its own events
   in order. An `endTerm`, `timerPause` or `timerResume` carries the term it belongs to, and a chaos
   `enact` (after its `tracker` of 3) the round of the failed election or accepted veto that caused
   it (the spec's "The record"). In a finished record (`outcome` not `UNFINISHED`), a round whose
   events are all `end`, `restored`, `disconnect` or `reconnect` is left out: a game ends on a move,
   so only a hand-built record has one (Phase 15A's `makeRecord()` is a lone `end` at `r` 9). Task 3's
   fixture test checks the recorder agrees with all this; if it does not, stop and report to the
   manager.
2. **President.** The `president` of the round's `nominate`; else, when a round comes before it, the
   rotation of `SecretHitlerGame.endPresidentialTerm` from that round: its special-election target
   if it had one; else, if its president was named by a special election in the round before it, the
   first seat after the caller, in turn order, alive at its end; else the first seat after its
   president alive at its end. A seat is dead once an `execute` targets it, and, in a `complete:
   false` record, from the start when it ends not alive and no recorded `execute` targets it. The
   first round (which in a `complete: false` record can start mid-term) takes the `seat` of its first
   `draw`, `discard`, `vetoAnswer`, `peek`, `investigate`, `execute`, `specialElection`, `endTerm`,
   `timerPause` or `timerResume`; with none of these, it is left out of a `complete: false` record
   (and so is each leading round like it), and in a complete record it gets seat 0 (round 1's first
   president, and the fallback for a record that cannot say).
3. **Chancellor.** The `nominate`'s `chancellor`, else the `seat` of a chancellor `enact` or a
   `veto`, else null (only when the lobby closed first, or before the restore).
4. **Cards.** `hand` is the `draw`'s cards; `discard` its `index` and `card`; `chancellorHand` is
   `hand` with the card at `discard.index` removed, in order, and null unless both are recorded.
5. **Tracker.** `trackerAfter` is the `value` of the round's last `tracker` event, else null (3 in a
   chaos round).
6. **Veto.** `{ accepted }` from the `vetoAnswer` after the round's `veto`, `{ accepted: null }` when
   none follows (the lobby closed first), null without a `veto`.
7. **The rest.** `pauses` counts `timerPause`; `reshuffled` is any `reshuffle`; `disconnects` has
   one seat per `disconnect` event, in order, repeats kept.
8. **Blame** only when `enacted` is `{ policy: "F", by: "chancellor" }` and `hand` holds at least one
   `L`: the president when the hand holds exactly one `L` and the discard was it, else the
   chancellor. Null otherwise, and when `hand` or `discard` is missing.
9. **Decision times** are `end.t − start.t`, null when the deciding seat is a CPU (`seats[i].cpu`),
   when either event is missing, or when a `restored` event lies between the two in `events`:

| Field | Decider | Start | End |
|---|---|---|---|
| `ms.nominate` | president | the last `endTerm` or `restored` before the `nominate`; with neither, in a complete record, the game's start (`t` 0) | `nominate` |
| `Vote.ms` | voter | the round's `nominate` | the `vote` |
| `ms.discard` | president | `draw` | `discard` |
| `ms.chancellor` | chancellor | `discard` | the first `veto` or chancellor `enact` after it |
| `ms.chancellorAfterVeto` | chancellor | a refused `vetoAnswer` | the chancellor `enact` after it |
| `ms.vetoAnswer` | president | `veto` | `vetoAnswer` |
| `ms.power` | president | the round's chancellor `enact` | the power's event |
| `ms.endTerm` | the `endTerm`'s seat | the round's last event before it that is not `timerPause`, `timerResume`, `disconnect`, `reconnect` or `restored` | `endTerm`, by the president or the countdown alike |

`rounds` is pure: it reads only the record (never `Date.now()`), never throws on a format-1 record
(a missing event leaves its field null; a seat the record does not have counts as human; a
`discard.index` outside the hand leaves `chancellorHand` null), and skips an event type it does not
know.

## Global Constraints

- **Interfaces, exactly.** `Vote`, `Power`, `Round` (with `ms.chancellorAfterVeto`), `rounds(record:
  GameRecord): Round[]` and `formatDecisionTime(ms: number): string` as the interfaces file's
  `rounds.ts` section gives them; `rounds.ts` exports nothing else. Phase 15A's names are used as
  given: `GameRecord`, `GameEvent`, `Seat`, `Card`, `Player`, `parseStatsData` (`record.ts`);
  `PageProps`, `routePath` (`routes.ts`); `StatsLink`; `PlayerName` (no `link` prop here; Phase 22A
  adds name links) and its classes `stats-liberal`,
  `stats-fascist`, `stats-hitler`; `outcomeLabel`, `formatDuration`, `formatLocalDateTime`, `plural`
  (`format.ts`); `makeRecord`, `makeSeats` (`testRecords.ts`); `.stats-card` and `.stats-card-title`
  (`StatsApp.css`); `stubStats`, `bigStatsData`, `statsSizesFor`, `checkStatsPage` (`e2e/stats.ts`);
  `GameState.gameId` (15A puts it in every game packet).
- **Files.** Create or change only `frontend/src/stats/rounds.ts` and its test,
  `frontend/src/stats/game/` (filling `GamePage.tsx`), `frontend/e2e/stats-game.spec.ts`, and the
  docs. Never a file 15B or 17A owns (the interfaces file's ownership table: `games/`,
  `constants/`, the login, lobby and victory screens, `e2e/stats-games.spec.ts`; `counting.ts`,
  `elo.ts`, `useStats.ts`, `numbers.ts`, `testGames.ts`, `StatCard.tsx`, `RankedTable.tsx`,
  `SplitTable.tsx`, `ScrollRegion.tsx`, `FilterBar.tsx`, `TabRow.tsx`, `charts/`, `tabs/`,
  `TabsPage.tsx`, `e2e/stats-engine.spec.ts`), nor 15A's `StatsApp.tsx`, `record.ts`, `format.ts`,
  `testRecords.ts`, `e2e/stats.ts` or `playwright.config.ts`.
- **Start check, before Task 1:** `origin/development` holds Phase 15A (`frontend/src/stats/record.ts`,
  `routes.ts`, `StatsLink.tsx`, `game/GamePage.tsx`, `frontend/e2e/stats.ts`) and Phase 14B's
  `frontend/src/stats/fixtures/recorded-games.json`; if not, stop and report. Then read what 15A
  left: those files, `StatsApp.tsx` and `StatsApp.css`, `PlayerName.tsx` and its CSS, `format.ts`,
  `testRecords.ts`, the placeholder's test, `e2e/stats-shell.spec.ts` and
  `scripts/first-download.mjs`. Nothing here waits on 15B or 17A.
- **Copy, exactly.** Not found: `This game was not found.` and a `StatsLink` `All games` to
  `/stats/games` (15A's placeholder wording; `STATS_ONLY_STRINGS` holds the first). Notes: `The first
  rounds of this game were not recorded.` and `Unfinished: the lobby closed`. Header: an `h1`
  `outcomeLabel(record)`, its first word in `stats-liberal` or `stats-fascist` by `winner` (as 15A's
  placeholder colours it); the facts line
  `<formatLocalDateTime(startedAt)> · <formatDuration(endedAt − startedAt)> · <plural(rounds, "round")> · board <L> L, <F> F`;
  `Seats in order:` then the seats as `PlayerName`s with their roles, joined by ` · `, Hitler's
  followed by ` (Hitler)`. A round: an `h2` `Round <r>`; `<P> nominates <C>` or `<P> had yet to
  nominate`; `passes <ja>–<nein>` or `fails <ja>–<nein>` (U+2013); `Ja: <names>` and `Nein: <names>`
  (seat order, `, ` between names, ` · ` between the two, an empty side left out); `election tracker
  <n>`; `<P> drew <3 tiles>, discarded <tile>`; `<C> got <2 tiles>, enacted <tile>`; `<C> got <2
  tiles>, asked to veto`; `<P> accepted the veto`; `<P> refused the veto`, then `<C> enacted <tile>`;
  `<P> had yet to answer`; `<C> enacted <tile>` (when the hand was not recorded); `Chaos: the top
  policy was enacted <tile>`; `Blame: <name> chose a Fascist over a Liberal`; `Power: <P> peeked at
  <3 tiles>`; `Power: <P> investigated <T> and saw Liberal` (or `Fascist`); `Power: <P> executed <T>,
  a Liberal` (`, a Fascist`, `, Hitler`); `Power: <P> chose <T> as the next president`; `END TERM by
  <P>` or `END TERM by the countdown`; `Countdown paused once` or `Countdown paused <n> times`; `Lost
  connection: <names>` (each seat once, in order of its first drop); `Discards shuffled into the
  draw pile`. Each clause appears only when its data is there.
- **Tiles** are `role="img"` named `Liberal` or `Fascist`. **Times** (`formatDecisionTime`) follow
  the nomination, the discard, the chancellor's first choice, the veto answer, the chancellor's
  enact after a refused veto, the power and an END TERM by a president; a null time shows nothing.
- **Look.** The header and each round are `.stats-card`s; headings in `--headerFont`, text in
  `--textFont`. Names in rounds are plain `PlayerName`s (no role); the header's carry their roles.
  A side's word (the result's first word, an investigation's result, an executed role) takes
  `stats-liberal`, `stats-fascist` or `stats-hitler`. Round edges: Liberal `--textColorLiberal`,
  Fascist `--textColorFascist`, no policy `--buttonDisabledFill`. Tiles the same blue and red.
- **Layout.** `.stats-main` already sets the column (at most 1100px, 16px padding, 8px on phones);
  this page sets no width of its own, and everything in it wraps. Names never overflow:
  `PlayerName` wraps (`overflow-wrap: anywhere`), and every grid or flex child in `GamePage.css` and
  `RoundBlock.css` has `min-width: 0`. No sideways scroll and 44px targets on phones, as
  `checkStatsPage` checks; the page may scroll down.
- **ES2020.** `npm run build` type-checks the tests too against `lib` ES2020: no `.at()`,
  `Object.hasOwn`, `replaceAll`, `findLast` or anything newer, in code or tests (`rs[rs.length - 1]`).
- **Browser tests load no browser-only module.** `stats-game.spec.ts` imports `./stats`, the
  existing Node-safe helpers `./driveGame` (`openTable`, `play`) and `./lobby` (`settle`), and from
  `src/` only `stats/record.ts`, `stats/routes.ts`, `stats/format.ts` and `stats/rounds.ts`, none of
  which loads `src/constants`; it builds every page path with `routePath`. So do the temporary
  screenshot specs (Task 9).
- **Bundle.** Nothing outside `frontend/src/stats/` imports from it; the page stays in the stats
  chunk.
- **Environment.** `npm ci` in `frontend/` once and `npx playwright install chromium firefox` once.
  Run `npm run e2e` with `JAVA_HOME` at an installed Java 17 and `E2E_PORT=4616`
  (15B and 17A run beside this phase on their own ports); "before" shots on 4716. Firefox that will not
  launch on macOS runs in the Linux image as `DEVELOPMENT.md` ("Browser tests on Linux") writes out.
  CI draws Germania One 11–17% wider at phone sizes: measure tight CSS in
  `mcr.microsoft.com/playwright:v1.64.1-noble` before pushing.
- **Branch and commits.** Branch `phase-16-game-page` in a worktree of the same name, from
  `development` once Phase 15A has merged. Conventional Commits with a scope (`frontend`, `plan`,
  `docs`, `claude`, `readme`). Task N ticks the Nth box of Phase 16 in `docs/PLAN.md` in its last
  commit. Task 1 sets Phase 16's Progress row to `in progress`; the last commit before the merge
  sets it to `done` and ticks the acceptance boxes this phase owns, as Phases 15A and 17A do.
- **Public repo:** nothing about the hosting setup in code, docs, commits or the PR.

## Review Focus

1. **A lobby closed during a nomination:** the last round has no `nominate`. Its president comes
   from the rotation (after an execution, and after a special election), its chancellor is null,
   and the page says `<P> had yet to nominate`, then `Unfinished: the lobby closed`. Tasks 1 and 5.
2. **A `restored` event inside a decision's span:** that time is null, the round's other times
   stay, and the next nomination is timed from the `restored` event. Task 2.
3. **A `complete: false` record that starts mid-term, or holds no action at all:** fields from the
   missing events are null, the first round's president comes from a later event naming them or the
   round is left out, and the page shows the note and never `undefined` or `null`. Tasks 1 and 4.
4. **Ten seats with twelve-character names:** a ten-name votes line and the header's seat list wrap
   inside their cards at 320px. Task 6.
5. **An id that is not a game's** (a prefix of a real id, another case, a percent-encoded character):
   `This game was not found.`, never a thrown render. Task 4.

---

### Task 1: Rounds from a timeline

**Files:**
- Create: `frontend/src/stats/rounds.ts`, `frontend/src/stats/game/sampleGames.ts`
- Modify: `docs/PLAN.md` (Progress: Phase 16 `in progress`)
- Test: `frontend/src/stats/rounds.test.ts`

**Interfaces:**
- Consumes: `GameRecord`, `GameEvent`, `Seat`, `Card` (`record.ts`); `makeRecord`, `makeSeats`
  (`testRecords.ts`).
- Produces in `rounds.ts`: `Vote`, `Power`, `Round`, `rounds` following rules 1 to 7; in this task
  `blame` is always null and every time null (Task 2 fills them).
- Produces in `sampleGames.ts` (test support, which Phases 19 and 20 import): `ev`, one builder per
  event type, `ev.<type>(r, t, …the type's fields in the spec's table order)`, returning that
  `GameEvent`, cards written as a string (`ev.draw(1, 9_000, 0, "LFF")`); `fiveSeatGame(events:
  GameEvent[], overrides?: Partial<GameRecord>): GameRecord` (`makeRecord` with `makeSeats(["LIBERAL",
  "LIBERAL", "FASCIST", "HITLER", "LIBERAL"], [1, 2, 3, 4, null])`, so seats P1, P2, P3, P4 and the
  CPU `Bot 1`, the given `events`, and `rounds` the largest `r`).

- [ ] **Step 1: Write the failing tests.** Seats `A, B, C, D, BOT = 0, 1, 2, 3, 4`. `PASSED_TERM` is
  shared with Task 2:

```ts
const PASSED_TERM = fiveSeatGame([
  ev.nominate(1, 4_000, A, B),
  ev.vote(1, 5_000, B, true), ev.vote(1, 6_000, A, true), ev.vote(1, 6_000, BOT, false),
  ev.vote(1, 7_000, C, true), ev.vote(1, 9_000, D, false),
  ev.election(1, 9_000, true, 3, 2),
  ev.draw(1, 9_000, A, "LFF"), ev.discard(1, 12_000, A, 1, "F"),
  ev.enact(1, 15_000, "L", "chancellor", B, 1, 0),
  ev.endTerm(1, 18_000, A, "president"),
]);

it("reads a passed election's term", () => {
  expect(rounds(PASSED_TERM)).toHaveLength(1);
  expect(rounds(PASSED_TERM)[0]).toMatchObject({
    r: 1, president: A, chancellor: B,
    votes: [{ seat: B, ja: true }, { seat: A, ja: true }, { seat: BOT, ja: false },
      { seat: C, ja: true }, { seat: D, ja: false }],
    election: { passed: true, ja: 3, nein: 2 }, trackerAfter: null,
    hand: ["L", "F", "F"], discard: { index: 1, card: "F" }, chancellorHand: ["L", "F"],
    veto: null, enacted: { policy: "L", by: "chancellor" }, power: null,
    endTerm: { by: "president" }, pauses: 0, reshuffled: false, disconnects: [],
  });
});
```

  And, each on its own small `fiveSeatGame`:
  - `a failed election moves the tracker and the countdown ends the term`: election `(false, 2, 3)`,
    `tracker` 1, `timerPause`, `timerResume`, `timerPause` and `endTerm` by the countdown, all `r` 1:
    `election` `{ passed: false, ja: 2, nein: 3 }`, `trackerAfter` 1, `hand` null, `enacted` null,
    `endTerm` `{ by: "countdown" }`, `pauses` 2.
  - `chaos belongs to the failed election's round`: rounds 1 to 3 fail (`tracker` 1, 2, 3), round 3's
    `tracker(3, …, 3)` is followed by `enact(3, …, "F", "chaos", undefined, 0, 1)` and
    `reshuffle(3, …, 14)`, then its `endTerm`, and round 4 has a `nominate`. `rounds[2]`:
    `trackerAfter` 3, `enacted` `{ policy: "F", by: "chaos" }`, `reshuffled` true, `chancellor` the
    round's nominee; `rounds[3].enacted` null.
  - `a refused veto, then the chancellor's enact`: `veto` by B, `vetoAnswer` by A refused, then B's
    `enact` of F: `veto` `{ accepted: false }`, `enacted` `{ policy: "F", by: "chancellor" }`.
  - `an accepted veto moves the tracker`: `veto`, accepted, `tracker` 2, `endTerm`: `veto`
    `{ accepted: true }`, `trackerAfter` 2, `enacted` null. With the tracker at 2 before it, then
    `tracker` 3 and a chaos `enact` after the answer: `trackerAfter` 3, `enacted` by chaos.
  - `reads each power`: four terms, one power each: `{ kind: "peek", seat: A, cards: ["F", "L",
    "F"] }`, `{ kind: "investigate", seat: B, target: C, result: "FASCIST" }`, `{ kind: "execute",
    seat: C, target: B, role: "LIBERAL" }`, `{ kind: "specialElection", seat: D, target: A }`.
  - `keeps every drop and the reshuffle`: `disconnect` C, A, `reconnect` A, `disconnect` C:
    `disconnects` `[C, A, C]`; a `reshuffle` makes `reshuffled` true.
  - `two equal cards`: `draw` `"FFL"` with `discard` index 0 and, in another record, index 1, card
    F: `chancellorHand` `["F", "L"]` both times.
  - `Hitler elected ends the round at its election`: `nominate(A, D)`, a passed election, then
    `end` `HITLER_ELECTED`: `hand`, `enacted` and `endTerm` null.
  - `an unfinished round stops where the lobby closed`: `nominate`, votes, a passed election,
    `draw`, then `end` `UNFINISHED`: `hand` set, `discard`, `chancellorHand`, `enacted` and
    `endTerm` null. Another with a `veto` and then the `end`: `veto` `{ accepted: null }`.
  - `a lobby closed during a nomination` (Review Focus 1): round 1's term by A, then `end(2, …,
    "UNFINISHED")`: `rounds[1]` is `{ r: 2, president: B, chancellor: null, votes: [], election:
    null, … }`. After round 1's president A executes B: round 2's president is C. After A's
    `specialElection` of D in round 1: round 2's president is D; with round 2 played and `end(3)`:
    round 3's president is B. A complete record holding only `end(1)`: round 1's president is 0.
  - `a record that starts mid-term` (Review Focus 3): `complete: false`, events `restored(4)`, D's
    chancellor `enact` of F, `endTerm(4)` by C, round 5's `nominate(D, A)`: `rounds.map((x) => x.r)`
    is `[4, 5]`; round 4 has `president` C, `chancellor` D, `hand`, `discard` and `chancellorHand`
    null, `enacted` `{ policy: "F", by: "chancellor" }`. A record of `restored(3)` and `end(3)`
    only: `rounds` is `[]`.
  - `Phase 15A's builders' records`: `rounds(makeRecord())` (a finished record whose only event is
    `end` at `r` 9) is `[]`; `rounds(makeRecord({ outcome: "UNFINISHED", winner: null }))` is one
    round, `{ r: 9, president: 0, chancellor: null, votes: [], election: null, … }`.
  - `never throws on an odd record`: a `vote` by seat 9 of five, a `discard` with `index` 5, and a
    `nominate` with no `end`: `rounds` returns (`chancellorHand` null for the bad index).
- [ ] **Step 2: Run** `cd frontend && npm test -- --run src/stats/rounds.test.ts`. Expected: fails
  (no `rounds.ts`).
- [ ] **Step 3: Implement `sampleGames.ts` and `rounds(record: GameRecord): Round[]`** as in
  Interfaces: group by `r`, fold each round's events into a `Round`, then fill each president by
  rule 2, carrying the dead seats from round to round.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): build rounds from a game's timeline`, with Phase 16's
  Progress row set to `in progress`, ticking box 1.

---

### Task 2: Blame and decision times

**Files:**
- Modify: `frontend/src/stats/rounds.ts`
- Test: `frontend/src/stats/rounds.test.ts`

**Interfaces:**
- Consumes: Task 1's `rounds`, `ev`, `fiveSeatGame`.
- Produces: `Round.blame` by rule 8; `Round.ms` and `Vote.ms` by rule 9; `formatDecisionTime(ms:
  number): string`: whole seconds, rounded, at least 1, `"8 s"`; from 60 s, `"<m> min <ss> s"` (two-
  digit seconds). Phase 21's `formatAverageTime` hands it any average of a minute or more.

- [ ] **Step 1: Write the failing tests:**

```ts
it("times a passed election's decisions", () => {
  const [r1] = rounds(PASSED_TERM);
  expect(r1.ms).toEqual({ nominate: 4_000, discard: 3_000, chancellor: 3_000,
    chancellorAfterVeto: null, vetoAnswer: null, power: null, endTerm: 3_000 });
  expect(r1.votes.map((v) => v.ms)).toEqual([1_000, 2_000, null, 3_000, 5_000]);
});
it("formats one decision's time", () => {
  expect([400, 8_000, 8_499, 59_600, 65_000, 3_725_000].map(formatDecisionTime))
    .toEqual(["1 s", "8 s", "8 s", "1 min 00 s", "1 min 05 s", "62 min 05 s"]);
});
```

  - `a CPU decides untimed`: a term with `BOT` as president: `ms.nominate`, `discard`, `power` and
    `endTerm` null; a human chancellor's `ms.chancellor` still set.
  - `a restart voids only the spans across it` (Review Focus 2): `draw` at 9 000, `restored` at
    50 000, `discard` at 52 000, chancellor `enact` at 55 000: `ms.discard` null, `ms.chancellor`
    3 000.
  - `a nomination is timed from the previous term's end, or a restart`: round 1's `endTerm` at
    18 000, round 2's `nominate` at 20 000: 2 000. With `restored` at 19 000 between them: 1 000.
    Round 1 of a complete record, `nominate` at 4 000: 4 000; with `restored` at 1 000 before it:
    3 000. A `complete: false` record opening `restored(3)` at 30 000, `nominate` at 34 000: 4 000.
  - `veto times`: `discard` 8 000, `veto` 10 000, refused `vetoAnswer` 13 000, `enact` 16 000:
    `ms.chancellor` 2 000, `ms.vetoAnswer` 3 000, `ms.chancellorAfterVeto` 3 000. An accepted veto:
    `chancellorAfterVeto` null.
  - `a power is timed from its policy`: chancellor `enact` 15 000, `investigate` 36 000:
    `ms.power` 21 000.
  - `END TERM is timed from the term's last action`: `investigate` 36 000, `timerPause` 38 000,
    `disconnect` 39 000, `timerResume` 41 000, `endTerm` by the countdown 45 000: `ms.endTerm`
    9 000. After a failed election (`election` and `tracker` at 9 000, `endTerm` 12 000): 3 000.
  - `blame` (each its own term): `FFL`, the L discarded, F enacted: the president. `FFL`, an F
    discarded, F enacted: the chancellor. `FLL`, an L discarded, F enacted: the chancellor. `FFF`
    then F: null. `LFF`, L enacted: null. A chaos F: null. A refused veto, then F from `L, F`: the
    chancellor. F enacted with no `draw` recorded: null.
- [ ] **Step 2: Run** `npm test -- --run src/stats/rounds.test.ts`. Expected: the new tests fail.
- [ ] **Step 3: Implement** rules 8 and 9 and `formatDecisionTime`. Times look up events by their
  place in `events`, so the `restored` check compares places, not `t`.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add blame and decision times to rounds`, ticking box 2.

---

### Task 3: Rounds reconcile with the contract fixture

**Files:**
- Test: `frontend/src/stats/rounds.test.ts` (and `rounds.ts` only if a test finds a fault in it)

**Interfaces:**
- Consumes: `parseStatsData`, `frontend/src/stats/fixtures/recorded-games.json` (Phase 14), read
  as Phase 15A's tests read it.

- [ ] **Step 1: Write the tests,** one `describe` per fixture game (`describe.each`), with
  `rs = rounds(game)` and `last = rs[rs.length - 1]`:

```ts
it("has one round per number, 1 to rounds", () =>
  expect(rs.map((x) => x.r)).toEqual(Array.from({ length: game.rounds }, (_, i) => i + 1)));
it("adds up to the final board", () => {
  expect(rs.filter((x) => x.enacted?.policy === "L")).toHaveLength(game.liberalPolicies);
  expect(rs.filter((x) => x.enacted?.policy === "F")).toHaveLength(game.fascistPolicies);
});
it("ends every term but the last", () => {
  expect(rs.slice(0, -1).every((x) => x.endTerm !== null)).toBe(true);
  if (game.outcome !== "UNFINISHED") expect(last.endTerm).toBeNull();
});
it("executes exactly the dead", () =>
  expect(rs.flatMap((x) => (x.power?.kind === "execute" ? [x.power.target] : [])).sort())
    .toEqual(game.seats.flatMap((s, i) => (s.alive ? [] : [i])).sort()));
```

  And: `ends as its outcome says` (`LIBERAL_POLICIES`: `liberalPolicies` 5 and `last.enacted.policy`
  L; `FASCIST_POLICIES`: 6 and F; `HITLER_ELECTED`: `last.election.passed`, the chancellor's seat
  `HITLER`, `last.enacted` null, `fascistPolicies` at least 3; `HITLER_EXECUTED`: `last.power` an
  `execute` whose `role` and seat are `HITLER`); `counts its votes` (each round's `votes.length` is
  `ja + nein`, its Ja votes `ja`, and `passed` is `ja > nein`); `draws after every passed election
  that did not elect Hitler`; `a failed election moves the tracker`; `a chancellor enacts a card
  they were handed`; `blames only a Fascist enacted by a chancellor` (`blame` is the president or the
  chancellor); `has no time below zero, and none for a CPU decider`; and `follows the rotation`: for
  each round k from 2, the record cut to the events of rounds before k plus `end(k, …,
  "UNFINISHED")` gives round k the president `rs[k − 1]` has (rule 2 checked against every real
  term).
- [ ] **Step 2: Run** `npm test -- --run src/stats/rounds.test.ts`. Expected: PASS. A failure is
  either a fault in `rounds` (fix it, with a hand-built test in Task 1's or 2's style that shows it)
  or a recorder that breaks the spec's record (stop and report to the manager).
- [ ] **Step 3: Commit** `test(frontend): reconcile rounds with the recorded games`, ticking box 3.

---

### Task 4: The header and the page around it

**Files:**
- Create: `frontend/src/stats/game/GameHeader.tsx`, `GamePage.css`
- Modify: `frontend/src/stats/game/GamePage.tsx` (the placeholder; keep its export)
- Test: `frontend/src/stats/game/GameHeader.test.tsx`, `GamePage.test.tsx` (replacing the
  placeholder's)

**Interfaces:**
- Consumes: `outcomeLabel`, `formatDuration`, `formatLocalDateTime`, `plural`, `PlayerName`,
  `StatsLink`, `PageProps`, `makeRecord`, `makeSeats`, `fiveSeatGame`.
- Produces: `GameHeader({ record }: { record: GameRecord })`, a `header.stats-card.game-header`
  with the Global Constraints' `h1`, facts line (`p.game-facts`) and seats line (`p.game-seats`);
  Phase 22A adds an `elo` prop. `GamePage({ data, route }: PageProps)`: finds the record whose `id`
  equals `route.id` exactly (one lookup, at the top, which Phase 22A extends with `game/gameElo.ts`),
  else the not-found copy, its link at least 44px tall on phones; for a record, `<GameHeader
  record={record} />`, the incomplete note (`p.game-note`) when `complete` is false, the rounds (Task
  5), and the unfinished line (`p.game-note`) when `outcome` is `UNFINISHED`. `GamePage.css` holds
  the header, the notes and the gaps between cards, with `min-width: 0` on every grid or flex child.
  A finished `makeRecord()` (no rounds) renders the header alone.

- [ ] **Step 1: Write the failing tests:** `GameHeader.test.tsx`: the `h1` reads
  `outcomeLabel(record)`, its first word in `stats-liberal` for a Liberal win, `stats-fascist` for a
  Fascist one, neither unfinished; the facts line equals the copy built from the record's
  `formatLocalDateTime`, `formatDuration` and `plural` (`makeRecord`'s defaults give `… · 9 rounds ·
  board 5 L, 2 F`; `rounds: 1` gives `· 1 round ·`); the seats line reads `Seats in order: P1 · P2 ·
  P3 · P4 (Hitler) · Bot 1` for `fiveSeatGame`, P3's `PlayerName` in `stats-fascist` and P4's in
  `stats-hitler`. `GamePage.test.tsx`: a known id shows the header; `nope`, the real id's first eight
  characters, the id in capitals and `…` (what `%E2%80%A6` decodes to) each show `This game was not
  found.` and an `All games` link to `/stats/games` (Review Focus 5); `complete: false` shows the
  note before the rounds, and nothing when complete; `UNFINISHED` ends with `Unfinished: the lobby
  closed`, and a finished game has no such line; a `complete: false`, `UNFINISHED` record of
  `restored(3)` and `end(3)` only shows the header, the note and the line, and no `undefined` or
  `null` in its text (Review Focus 3).
- [ ] **Step 2: Run** `npm test -- --run src/stats/game`. Expected: the new tests fail.
- [ ] **Step 3: Implement** as in Interfaces, in the Global Constraints' look and layout.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): show a recorded game's header`, ticking box 4.

---

### Task 5: Each round as a block

**Files:**
- Create: `frontend/src/stats/game/RoundBlock.tsx`, `RoundBlock.css`
- Modify: `frontend/src/stats/game/GamePage.tsx`, `frontend/src/stats/game/sampleGames.ts`
- Test: `frontend/src/stats/game/RoundBlock.test.tsx`, `GamePage.test.tsx`

**Interfaces:**
- Consumes: `Round`, `rounds`, `formatDecisionTime`, `PlayerName`, `makeSeats`.
- Produces: `RoundBlock({ round, seats }: { round: Round; seats: Seat[] })`: a
  `section.stats-card.round-block` with class `round-liberal`, `round-fascist` (chancellor or
  chaos) or `round-none` (a 6px left edge in that colour), labelled by its `h2` `Round <r>`, then
  the Global Constraints' clauses in this order, one `p` per line: the nomination and result; the
  votes; the tracker or chaos; the president's cards; the chancellor's cards, veto and choice; blame;
  the power; the term's end, pauses, drops and reshuffle. Each time is a `span.decision-time`; each
  tile a `span.policy-tile`. Every grid or flex child in `RoundBlock.css` has `min-width: 0`.
  `GamePage` renders one `RoundBlock` per `rounds(record)` entry (memoized on the record) in an
  `ol.game-rounds`. Produces in `sampleGames.ts`:
  `SHOWCASE_PLAYERS: Player[]` and `showcaseGame(): GameRecord`: seven seats (Maya, Rowan, Theo,
  Priya, Sam, Ash, Blair; Theo `FASCIST`, Sam `HITLER`, players 1 to 7), complete,
  `LIBERAL_POLICIES`, holding at least one round each with every decision timed, a failed election,
  chaos with a reshuffle, blame on a president and on a chancellor, an investigation, a refused veto
  and the enact after it, a countdown end with a pause, and a dropped connection, its events adding
  up to its board.

- [ ] **Step 1: Write the failing tests** in `RoundBlock.test.tsx`, on hand-built `Round`s over the
  five seats of `fiveSeatGame` (P1, P2, P3, P4, Bot 1): the edge class for L, F, chaos F and none;
  the heading `Round 3`; `P1 nominates P2` with `8 s` after it; no nomination: `P1 had yet to
  nominate` and no votes line; votes arriving P3, P1, P4, P2 read `Ja: P1, P2, P3 · Nein: P4` with
  `passes 3–1`; a failed one `fails 1–3` and `election tracker 1`; the president's line has tiles
  named Liberal, Fascist, Fascist, then `discarded` and a Fascist tile; the chancellor's `got`, two
  tiles, `enacted`; a veto accepted, refused (then `P2 enacted` with `3 s` after it) and unanswered
  (`P1 had yet to answer`); `Blame: P2 chose a Fascist over a Liberal`; chaos with a Fascist tile;
  the four power lines (`saw Fascist`, `executed P2, a Liberal`, `executed P4, Hitler`, `chose P4
  as the next president`); `END TERM by P1` with `4 s`, and `END TERM by the countdown` with no
  time; `Countdown paused once` and `Countdown paused 2 times`; `disconnects` `[2, 0, 2]` reads `Lost
  connection: P3, P1`; `Discards shuffled into the draw pile`; a round with every time null has no
  `.decision-time`. In `GamePage.test.tsx`: `showcaseGame()` shows one `.round-block` per round, in
  order; a record whose lobby closed during a nomination ends with a block reading `P2 had yet to
  nominate` before the unfinished line (Review Focus 1).
- [ ] **Step 2: Run** `npm test -- --run src/stats/game`. Expected: the new tests fail.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): draw each round of a recorded game`, ticking box 5.

---

### Task 6: Browser tests of the game page

**Files:**
- Create: `frontend/e2e/stats-game.spec.ts` (runs in all four projects through Phase 15A's
  `stats-` match)

**Interfaces:**
- Consumes: `stubStats`, `bigStatsData`, `statsSizesFor`, `checkStatsPage` (`./stats`); `settle`
  (`./lobby`); `openTable`, `play` (`./driveGame`); `STATS_GAMES_PATH` (`../src/stats/record`),
  `routePath` (`../src/stats/routes`), `outcomeLabel` (`../src/stats/format`), `rounds`
  (`../src/stats/rounds`), as Global Constraints' browser-test rule allows.

- [ ] **Step 1: Write the tests:**
  - `the game page fits every size` (`test.slow()`): `stubStats(page, bigStatsData())`; the largest
    game (the most seats, then the most events), its first `complete: false` game and its first
    `UNFINISHED` game, and the id `no-such-game`; for each, `goto(routePath({ page: "game", id }))`,
    `settle`, then `checkStatsPage(page, size)` at every `statsSizesFor(project, viewport)` size. At
    phone sizes every `.round-block` is also at least the window's width less 32px wide. The largest
    game shows `rounds(game).length` blocks (Review Focus 4: ten twelve-character names voting).
  - `an unknown game says so`: `routePath({ page: "game", id: "no-such-game" })` shows `This game
    was not found.`, and `All games` goes to `routePath({ page: "games" })` without a reload.
  - `a real game's page shows every round` (`desktop` only, `test.setTimeout(180_000)`):
    `openTable(baseURL, 5)`, `play` to the end, `id = table.latest()!.gameId` (15A's packet field);
    poll `STATS_GAMES_PATH` (`../src/stats/record`, 30 s at most) until it holds `id`; `goto`
    `routePath({ page: "game", id })` directly (never through 15B's victory link); there the `h1` reads
    `outcomeLabel(record)`, it has `record.rounds` blocks, the first reads `fails` (driveGame fails
    the first election), at least one `.decision-time` shows, and, when the record has an accepted
    `vetoAnswer`, a block reads `accepted the veto`.
- [ ] **Step 2: Run** `E2E_PORT=4616 npx playwright test e2e/stats-game.spec.ts` (Java 17), and the
  firefox project as Global Constraints says. Expected: PASS in all four projects. Fix the CSS, not
  the test, for anything that does not fit.
- [ ] **Step 3: Commit** `test(frontend): check the game page in the browser`, ticking box 6.

---

### Task 7: Docs

**Files:**
- Modify: `CLAUDE.md` (Layout, the stats part: `rounds.ts` and what reads it, rules 1, 2, 8 and 9 in
  a sentence each, `sampleGames.ts`, the game page and `stats-game.spec.ts` beside the other
  specs), `README.md` (the stats line of "What this fork adds", if it lists the pages: each game's
  page, round by round), `docs/PLAN.md`

- [ ] **Step 1: Update the docs** as in Files, in the voice of the text around them; nothing names a
  real host or deploy tool.
- [ ] **Step 2: Commit** `docs(claude): describe rounds and the game page` and, if README changed,
  `docs(readme): mention each game's page`, ticking box 7 in the last.

---

### Task 8: Review

- [ ] **Step 1: Review the branch** against `development` with the `code-review` skill (standards
  and the spec), plus a check of every Global Constraint and Review Focus line.
- [ ] **Step 2: Fix every finding,** Minor ones too, each in its own commit with its test where one
  applies; a finding that needs no change gets its reason. Keep the findings, fixes and reasons for
  the pull request's Review section.
- [ ] **Step 3: Run the final verify:** `npm test -- --run && npm run build` and `E2E_PORT=4616 npm
  run e2e` (firefox in the Linux image if need be). Expected: all pass; note the counts for the PR.
  Then re-run Phase 15A's first-download measurement: its browser check in `stats-shell.spec.ts`
  passes (in that e2e run), and `npm run first-download` (after `npm run build`) gives the same
  gzipped total on this branch as on `origin/development`.
- [ ] **Step 4: Commit** the last fix (or, with none, the box alone as `chore(plan): …`), ticking
  box 8.

---

### Task 9: Screenshots and the pull request

**Files:**
- Create: `docs/pr/phase-16-game-page/before-1600x900.png`, `after-1600x900.png`,
  `before-412x915.png`, `after-412x915.png`
- Temporary, never committed: `frontend/e2e/pr-shots-data.spec.ts`, `frontend/e2e/pr-shots.spec.ts`

- [ ] **Step 1: Write the shot data:** `pr-shots-data.spec.ts` writes `{ players:
  SHOWCASE_PLAYERS, games: [showcaseGame()] }` as JSON to `$SHOTS_DATA` (a file in the scratchpad).
  Run it once on the branch.
- [ ] **Step 2: Take the shots:** `pr-shots.spec.ts` reads `$SHOTS_DATA`, calls `stubStats`, opens
  `routePath({ page: "game", id })`, `settle`s and takes a full-page screenshot to `$SHOTS_OUT`, at
  1600x900 in `desktop` and in `phone-412` (412x915). "After" on the branch with `E2E_PORT=4616`; "before" in a
  worktree of `origin/development` (Phase 15A's placeholder page), with the same spec file copied in
  and `E2E_PORT=4716`. Delete both temporary specs and that worktree afterwards.
- [ ] **Step 3: Commit** the four images `docs(docs): add the game page's screenshots`, ticking box
  9.
- [ ] **Step 4: Rebase if 15B or 17A (or both) merged first:** `git fetch origin && git rebase
  origin/development`; in `CLAUDE.md`, `README.md` and `docs/PLAN.md` keep both sides; run Task 8's
  step 3 again. Do the same whenever one of them merges while this PR is open.
- [ ] **Step 5: Open the pull request:** push, and `gh pr create --repo jussaw/Secret-Hitler-Online
  --base development`, its body following `CLAUDE.md`'s Workflow: the before-and-after table near
  the top (raw URLs pinned to the screenshots' commit), what changed, the test counts, the Review
  section, and `Part of #31`. Loop on CI until green.
- [ ] **Step 6: Merge under the user's standing OK:** in a last commit (`chore(plan): tick phase 16's
  merge`), tick Phase 16's acceptance boxes "Backend and frontend unit tests pass…" (from the final
  verify, Task 8's step 3 or its re-run after a rebase) and "PR merged into `development`", and set
  its Progress row to `done`; the user's box stays unticked. Push, wait for green, then `gh pr
  merge --squash --admin --repo jussaw/Secret-Hitler-Online --subject "feat(frontend): show each
  recorded game round by round (#<PR>)"`, and check that `development`'s image publishes.
