# Phase 14A: Game timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every game a lobby runs keeps a timeline of everything that happens in it, survives a
backup with it, and hands one immutable `GameRecord` to a sink when it ends or its lobby times out
(issue #31; Phase 14B stores and serves the records).

**Architecture:** A new package `server.stats` holds a pure comparison of two looks at a game
(`GameSnapshot`, `TimelineDiff`), the immutable record (`GameRecord`) and the interface a record is
handed to (`GameRecordSink`). `Lobby` keeps the running game's ID, start time and timeline in
backed-up fields of JDK types, looks at the game after every change, adds its own events (pauses,
drops), and hands the record over under its lock to `Lobby.recordSink`, which by default drops it
with a debug line; Phase 14B puts its writer there. No database is touched. `SecretHitlerGame` and
`CpuPlayer` do not change.

**Tech Stack:** Java 17, Javalin 5.6.1, Jackson 2.16.1 (tests compare JSON text), JUnit 4.

**Spec:** [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](../specs/2026-11-15-game-stats-design.md)
("The record", and in "The recorder (Phase 14)": Watching, Records, Restored games, the line on
marking the lobby changed; Constraints, Anti-goals, Tests, Known limits, Left to the builder).
Shared names: [`2026-11-15-game-stats-interfaces.md`](2026-11-15-game-stats-interfaces.md), whose
"Settled after the plans were written" section settles where the breakdowns differed. Parent plan:
[`docs/PLAN.md`](../../PLAN.md), Phase 14A. Next: [Phase 14B](2026-11-15-phase-14b-game-records.md).
Where this plan and the spec differ, the spec wins.

## Decisions (the spec's rules as this plan builds them, and what it leaves to the builder)

1. **Where the game is looked at.** `Lobby.observeGame` runs first in `updateAllUsers` (after every
   player command, the END TERM countdown, a disconnect and every CPU tick) and after every
   `cpu.act` that returns true, in both branches of the CPU loop. So each look sees the work of one
   game method, and CPU votes are recorded one by one in the order the CPUs cast them.
2. **One method, several changes.** `TimelineDiff` reads the move from `before.state()` and
   `after.state()` and spells out what that one method did, in the game's order (Task 1's table): a
   third failed election, or an accepted veto at tracker 2, adds `tracker{value 3}` and then the
   chaos `enact` (the game puts the tracker back to 0 in the same move, with no event for it); an
   `enact` may be followed by `reshuffle` and `end`; a power is recorded when it is used.
3. **Reshuffles from the pile sizes.** The game shuffles the discards into the draw pile when it
   holds under 3 cards: before a legislative session's draw, before chaos takes its card, and after
   every enact. `TimelineDiff` follows both piles through the move from `before`'s sizes and writes
   `reshuffle` only where a shuffle brings cards back (the discard pile is not empty then), with
   `drawPile` the pile's size just after. If its piles do not come out at `after`'s sizes it throws.
4. **Votes are the living seats'.** `registerVote` stores a vote from a dead seat (the server does
   not check) but counts only the living. `vote` events are written for living seats only, and an
   `election`'s `ja`, `nein` and `passed` (`ja > nein`) count the living seats' votes only.
5. **`endTerm` by countdown.** A snapshot cannot say who ended a term, so `TimelineDiff` writes
   `by: "president"`, and `Lobby.endTermOnTime` looks at the game right after `endPresidentialTerm`
   with `observeGame(true)`, which rewrites it to `"countdown"`.
6. **Rounds and times.** An event's `r` is the round the move was made in, as `getRound()` counted
   it before the move (`before.round()`), so `endTerm` carries the term it ended; `Lobby`'s own
   events carry the round the game is in, which for a pause or resume is its term. `t` is
   `Lobby.recordClock` minus `gameStartedAt`, never less than the last event's `t`. A finished
   game's `endedAt` is `startedAt` plus its `end` event's `t`; an unfinished one's is the sweep's time.
7. **The discard's `index`** is the lowest index whose removal from the president's three leaves the
   chancellor's two in order. **Peeks:** a snapshot in `PRESIDENTIAL_POWER_PEEK` holds the top three,
   and the move out of that state writes `peek` with `before`'s cards.
8. **Restores.** `readObject` never reads the game beyond `getRound()` and never calls
   `GameSnapshot.of` (a throw there would lose every lobby in the backup): it leaves `lastSnapshot`
   null, and adds `restored` unless the timeline already ends with `end`. A backup from before the
   recorder is spotted by `gameEvents == null`: its game gets a new ID, `gameStartedAt` = the
   restore's time, `gameComplete = false` and a timeline that starts with `restored` at `t` 0. The
   baseline is taken, guarded, the first time anything reaches the game: in `observeGame`, or in
   `Lobby.game()`, the accessor every command goes through before it changes the game. `storeLobbies`
   holds no lock, so `Lobby` gains a `writeObject` that serializes it under its own lock.
9. **Handing over.** One method, `handOverGame(boolean swept)`, makes every record. If the game has
   finished (its state, read through `getState()`, is a victory), the record has that outcome and
   exactly one `end` (added if the timeline lacks it): so a game a CPU won inside the CPU loop,
   which `updateAllUsers` drops only at the next tick about 4 s later, keeps its outcome if the
   sweep, or a restore, comes in between. Otherwise (the sweep) it adds `end` `UNFINISHED` with
   `endedAt` the sweep's time. `closeIfTimedOut`, closing a lobby in a game, hands over and drops
   the game (`dropGame`), so no CPU tick or countdown plays on in a closed lobby.
10. **Drops and returns.** `disconnect` is written when a seated account's connection is removed;
    `reconnect` when a seated account gets a new connection and that seat's latest `disconnect` or
    `reconnect`, looking back only to the last `restored`, is a `disconnect`. A connection that
    takes another's place by rejoin key is neither.
11. **Nothing the recorder does stops a game.** Any `RuntimeException` anywhere in `observeGame` is
    caught and logged (one warning line with the message, no stack trace): the lobby takes a fresh
    baseline (guarded), sets `gameComplete = false` because a move went unrecorded, and goes on, so
    packets still go out and CPUs still act. A hand-over or a sink that throws is logged and the game
    is dropped as usual.

## Global Constraints

- **Serialization:** `Lobby` keeps `serialVersionUID = 7519753883184174211L`. `SecretHitlerGame`
  and `CpuPlayer` are not edited at all. `Lobby`'s new backed-up fields are exactly `String gameId`,
  `long gameStartedAt`, `boolean gameComplete` and `ArrayList<LinkedHashMap<String, Object>>
  gameEvents`, whose values are only `String`, `Integer`, `Long`, `Boolean` and `ArrayList<String>`.
  No `server.stats` object is ever in a backup (`lastSnapshot` is transient; `recordSink` and
  `recordClock` are static).
- **No database:** this phase opens no connection and writes no table. Under a lobby's lock `Lobby`
  only builds the `GameRecord` copy and calls `recordSink.submit`.
- **Format 1, the spec's tables:** every event starts `type`, `t`, `r`, then its fields in the spec
  table's order (a chaos `enact` has no `seat`); seats by index; cards and policies `L`/`F`; roles
  `LIBERAL`/`FASCIST`/`HITLER`; outcomes `LIBERAL_POLICIES`, `HITLER_EXECUTED`, `FASCIST_POLICIES`,
  `HITLER_ELECTED`, `UNFINISHED`. `RecordFormat` (Task 1) also holds the record's and a seat's keys,
  in order, for Phase 14B: `id`, `format`, `startedAt`, `endedAt`, `outcome`, `winner`, `complete`,
  `hasCpu`, `liberalPolicies`, `fascistPolicies`, `rounds`, `seats`, `events`; and `player`, `name`,
  `cpu`, `role`, `alive`.
- **Existing tests** keep passing, changed only where this plan says, the Lobby race-fix tests above
  all (`LobbyRejoinTest`, `LobbyGraceWindowTest`, `LobbyStartTest`, `LobbyNoAccountTest`,
  `LobbyCloseTest`, `LobbyTimeoutServerTest`, `RejoinServerTest`, `AccountJoinServerTest`).
- **Environment:** Java 17 (`JAVA_HOME` pointing at an installed 17) for every `./gradlew` and
  `npm run e2e`. Browser tests use `E2E_PORT=4614`: `desktop` on macOS, `firefox` in Playwright's
  Linux image as `DEVELOPMENT.md` ("Browser tests on Linux") describes. Nothing changes on screen,
  so there are no "before" shots (their port would be 4714).
- **Phase 13 runs beside this phase:** never touch `devops/`, the `Dockerfile`, `ci.yml` or
  `SecretHitlerServer.main`. In `SecretHitlerServer` this phase only adds `markLobbiesChanged`.
- **Branch and commits:** worktree and branch `phase-14a-game-timeline` from `origin/development`.
  Conventional Commits with a scope (`backend`, `plan`, `docs`, `claude`), at most 72 characters.
  Task N (1 to 7) ticks the Nth box of Phase 14A in `docs/PLAN.md` in its last commit; Task 1's
  commit also sets Phase 14A's Progress row to "in progress". The pull request is squashed
  (`gh pr merge --squash --admin`) with a Conventional subject ending `(#N)`.
- **Public repo:** nothing about the hosting setup in code, docs, commits or the PR.

## Review Focus

1. **A CPU's winning move, then the sweep (or a restart) before the next tick:** the record has the
   game's real outcome and one `end`, never `UNFINISHED` with a second `end`. Tasks 3 and 5 test it.
2. **A vote from a dead seat** (a stale page sending one): no `vote` event, and the `election`
   counts the living only. Task 1 tests it.
3. **Two restarts during one game, and the first move after each:** one `restored` per restart, the
   same ID and `startedAt`, `complete` unchanged (false stays false, with the ID made at the first
   restore), and the move right after a restore recorded. Task 5 tests it.
4. **Two games in a row in one lobby:** separate IDs and timelines; `gameId()` gives the finished
   one's until the next start. Task 3 tests it.
5. **The wall clock stepping back mid-game:** `t` never goes down. Task 3 tests it.

---

### Before you start

- [ ] **Check the start point:** `git fetch origin`, then make the worktree and branch
  `phase-14a-game-timeline` from `origin/development`. All must hold, or stop and tell the
  coordinator: `git merge-base --is-ancestor 794ac4f HEAD` (Phase 12 is in); `grep -n "^## Phase
  14A: Game timeline" docs/PLAN.md` finds the section with seven deliverable boxes; the spec, the
  interfaces file and this plan are in `docs/superpowers/`.

---

### Task 1: Snapshots and the timeline comparison

**Files:**
- Create: `backend/src/main/java/server/stats/GameSnapshot.java`, `TimelineDiff.java`
- Create (test): `backend/src/test/java/server/stats/Snapshots.java`, `TimelineReplay.java`,
  `RecordFormat.java`
- Test: `backend/src/test/java/server/stats/TimelineDiffTest.java`

**Interfaces:**
- Produces: `public record GameSnapshot(GameState state, int round, List<String> seats,
  List<String> roles, List<Boolean> alive, String president, String chancellor,
  Map<String, Boolean> votes, int tracker, int liberal, int fascist, int drawSize, int discardSize,
  List<String> presidentHand, List<String> chancellorHand, List<String> peek, String target)`, all
  collections unmodifiable copies; `static GameSnapshot of(SecretHitlerGame game)`;
  `int seatIndex(String name)` (-1 for none); `static String outcomeOf(GameState state)`
  (`LIBERAL_VICTORY_POLICY` → `LIBERAL_POLICIES`, `LIBERAL_VICTORY_EXECUTION` → `HITLER_EXECUTED`,
  `FASCIST_VICTORY_POLICY` → `FASCIST_POLICIES`, `FASCIST_VICTORY_ELECTION` → `HITLER_ELECTED`,
  else null); `String outcome()` and `boolean finished()` from it.
- Produces: `public final class TimelineDiff` with
  `static List<LinkedHashMap<String, Object>> between(GameSnapshot before, GameSnapshot after, long t)`
  (a new mutable list; throws `IllegalStateException`, naming both states, for a change no single
  game method makes, and when its piles or tracker do not come out at `after`'s) and
  `static LinkedHashMap<String, Object> event(String type, long t, int r)` (`type`, `t` as `Long`,
  `r` as `Integer`), which `Lobby` uses for its own events.
- Produces (test): `Snapshots.table(int seats)`, a mutable builder: seats `S0`…, roles `LIBERAL`s
  then `FASCIST`s then `HITLER` last (5 seats: L L L F H), all alive, `CHANCELLOR_NOMINATION`, round
  1, president `S0`, no chancellor, no votes, tracker 0, board 0/0, piles 17/0, no hands, peek or
  target; setters `state`, `round`, `president`, `chancellor`, `vote(name, ja)`, `tracker`,
  `board(l, f)`, `piles(draw, discard)`, `presidentHand(…)`, `chancellorHand(…)`, `peek(…)`,
  `target`, `dead(name)`; `build()`.
- Produces (test): `RecordFormat.RECORD_KEYS`, `RecordFormat.SEAT_KEYS` (Global Constraints) and
  `static List<String> expectedKeys(Map<String, Object> event)` (the spec's table for its `type`, a
  chaos `enact` without `seat`).
- Produces (test): `TimelineReplay.replay(List<? extends Map<String, Object>> events, List<String>
  roles)` → `record Replayed(int liberal, int fascist, Set<Integer> dead, int tracker, int drawPile,
  int discardPile, String outcome)` (outcome null with no `end`), and `static Replayed
  of(SecretHitlerGame game)`. It fails, naming the event's index, unless: each event's keys are
  `expectedKeys`; `t` and `r` never go down and `r` rises by one right after each `endTerm` and
  nowhere else; after a `nominate` come one `vote` per living seat, each once, then an `election`
  counting them; a passed election that does not end the game is followed by a `draw` (after any
  `reshuffle`), whose `discard` has `card == cards[index]`; the chancellor's `enact` is one of the
  two left unless a `veto` comes first; each `veto` gets a `vetoAnswer`, a refused one followed by
  the chancellor's `enact`; `enact`'s board is the running board; each `tracker` is the running
  tracker plus one and every `enact` resets it; the piles (17/0; `draw` −3, chaos −1, `discard` +1,
  the chancellor's `enact` +1 and an accepted veto +2 to the discards) match each `reshuffle`'s
  `drawPile` (draw + discards then, which become 0); after a `peek`, the next take alone is checked
  (a `draw`'s three equal its cards, or a chaos policy is its first); `investigate`'s `result` is
  the target's side and `execute`'s `role` the target's role; one `end`, last. `restored` is skipped.

- [ ] **Step 1: Write the failing tests** in `TimelineDiffTest`. `T = 5_000L`; `ev(type, k1, v1, …)`
  builds an expected event with `t` T and `r` 1 (unless the test says) and the pairs in order;
  lists are compared as Jackson JSON text, so key order counts. One written out:

```java
@Test public void theThirdFailedElectionEnactsTheTopPolicy() {
    GameSnapshot before = table(5).state(CHANCELLOR_VOTING).chancellor("S2").tracker(2).board(1, 2)
            .piles(10, 4).vote("S0", true).vote("S1", true).vote("S2", false).vote("S3", false).build();
    GameSnapshot after = table(5).state(POST_LEGISLATIVE).chancellor("S2").tracker(0).board(1, 3)
            .piles(9, 4).vote("S0", true).vote("S1", true).vote("S2", false).vote("S3", false)
            .vote("S4", false).build();
    assertJson(List.of(ev("vote", "seat", 4, "ja", false),
            ev("election", "passed", false, "ja", 2, "nein", 3),
            ev("tracker", "value", 3),
            ev("enact", "policy", "F", "by", "chaos", "liberal", 1, "fascist", 3)),
            TimelineDiff.between(before, after, T));
}
```

  The rest (before ⇒ after ⇒ events; the chancellor is `S2` wherever one is needed):
  - `nothingChangedIsNoEvent`: any snapshot against itself ⇒ `[]`.
  - `aNominationIsOneEvent`: nomination ⇒ voting, chancellor S2 ⇒ `nominate{president 0, chancellor 2}`.
  - `eachVoteIsAnEvent`: voting {} ⇒ {S1 ja} ⇒ `vote{seat 1, ja true}`; {} ⇒ {S3 nein, S1 ja} ⇒
    seat 1 then seat 3.
  - `aDeadSeatsVoteIsLeftOut` (Review Focus 2): S3 dead; {S0 ja, S1 ja, S2 nein} ⇒ the same plus S3
    ja ⇒ `[]`; then plus S4 nein, `POST_LEGISLATIVE`, tracker 1 ⇒ `vote{4, false}`,
    `election{false, 2, 2}`, `tracker{1}`.
  - `theLastVoteClosesTheElection`: S0–S2 ja, S3 nein, piles 17/0 ⇒ `LEGISLATIVE_PRESIDENT`, S4
    nein, hand F L F, piles 14/0 ⇒ `vote{4, false}`, `election{true, 3, 2}`, `draw{seat 0, cards
    [F, L, F]}`.
  - `aFailedElectionMovesTheTracker`: S0 S1 ja, S2–S4 nein ⇒ `POST_LEGISLATIVE`, tracker 1 ⇒ vote,
    `election{false, 2, 3}`, `tracker{1}`.
  - `chaosCanReshuffleBeforeItsCard`: as written out, piles 2/5 ⇒ 6/0 ⇒ …, `tracker{3}`,
    `reshuffle{drawPile 7}`, chaos `enact`.
  - `chaosCanReshuffleAfterItsCard`: piles 3/4 ⇒ 6/0 ⇒ …, `tracker{3}`, chaos `enact`, `reshuffle{6}`.
  - `chaosCanEndTheGame`: board 2/5 ⇒ 2/6, `FASCIST_VICTORY_POLICY` ⇒ …, `enact{F, chaos, 2, 6}`,
    `end{outcome FASCIST_POLICIES}`.
  - `aPassedElectionCanReshuffleBeforeTheDraw`: piles 2/6 ⇒ 5/0 ⇒ vote, election, `reshuffle{8}`, draw.
  - `electingHitlerEndsTheGame`: chancellor S4, board 0/3 ⇒ `FASCIST_VICTORY_ELECTION` ⇒ vote,
    `election{passed true}`, `end{HITLER_ELECTED}`, no draw.
  - `theDiscardIsTheMissingCard`: hand L F F, piles 14/0 ⇒ `LEGISLATIVE_CHANCELLOR` with L F, piles
    14/1 ⇒ `discard{seat 0, index 1, card F}`; hand F L F ⇒ F F ⇒ `discard{0, 1, L}`.
  - `anEnactByTheChancellor`: hand L F, board 0/0, piles 14/1 ⇒ `POST_LEGISLATIVE`, board 1/0,
    piles 14/2 ⇒ `enact{L, chancellor, seat 2, 1, 0}`.
  - `anEnactCanUnlockAPower`: board 0/1 ⇒ 0/2 in `PRESIDENTIAL_POWER_INVESTIGATE` ⇒ the `enact` only.
  - `anEnactCanReshuffle`: piles 2/3 ⇒ 6/0 ⇒ `enact`, `reshuffle{6}`.
  - `anEnactCanEndTheGame`: board 4/0 ⇒ 5/0, `LIBERAL_VICTORY_POLICY` ⇒ `enact`, `end{LIBERAL_POLICIES}`.
  - `aVetoAndItsRefusal`: chancellor ⇒ veto state ⇒ `veto{seat 2}`; veto state ⇒ chancellor ⇒
    `vetoAnswer{seat 0, accepted false}`.
  - `anAcceptedVetoMovesTheTracker`: veto state, tracker 0, piles 8/4 ⇒ `POST_LEGISLATIVE`, tracker
    1, piles 8/6 ⇒ `vetoAnswer{true}`, `tracker{1}`.
  - `anAcceptedVetoCanBringChaos`: tracker 2, board 3/5, piles 8/4 ⇒ tracker 0, board 4/5, piles 7/6
    ⇒ `vetoAnswer{true}`, `tracker{3}`, `enact{L, chaos, 4, 5}`.
  - `aPeekIsRecordedWhenItCloses`: peek state with L F F ⇒ `POST_LEGISLATIVE` ⇒ `peek{0, [L, F, F]}`.
  - `thePowers`: investigate ⇒ target S4 ⇒ `investigate{0, target 4, result FASCIST}`; execution ⇒
    S3 dead ⇒ `execute{0, 3, role FASCIST}`; execution ⇒ `LIBERAL_VICTORY_EXECUTION`, S4 dead ⇒
    `execute{0, 4, HITLER}`, `end{HITLER_EXECUTED}`; election ⇒ target S2 ⇒ `specialElection{0, 2}`.
  - `endingATerm`: `POST_LEGISLATIVE`, round 3, president S1 ⇒ nomination, round 4, president S2 ⇒
    `endTerm{seat 1, by president}` with `r` 3.
  - `anImpossibleChangeThrows`: nomination ⇒ `POST_LEGISLATIVE` throws `IllegalStateException`; an
    `enact` whose `after` has discards 5 instead of 2 throws.
  - `aRealGameReplays`: for 5 to 10 seats, `GameDriver.play(n, g -> looks.add(GameSnapshot.of(g)))`
    (a failed election, the powers and a veto); the events between consecutive looks, `t` the step's
    index, replay to `TimelineReplay.of(game)`.
  - `aSnapshotOfANewGame`: `of(new SecretHitlerGame(names))` has `CHANCELLOR_NOMINATION`, round 1,
    seats in player order, president `seats.get(0)`, piles 17/0 and no hands; after a nomination and
    five Ja votes its `presidentHand` has three cards, each `L` or `F`.
- [ ] **Step 2: Run** `cd backend && ./gradlew test --tests 'server.stats.TimelineDiffTest'`.
  Expected: compilation fails (no `GameSnapshot`).
- [ ] **Step 3: Implement `GameSnapshot` and `TimelineDiff`.** `of` calls `getState()` first (it
  notices a policy victory, as `GameToJSONConverter` does; packets show no difference), then reads
  `getPresidentLegislativeChoices()` only in `LEGISLATIVE_PRESIDENT`,
  `getChancellorLegislativeChoices()` only in `LEGISLATIVE_CHANCELLOR` and
  `LEGISLATIVE_PRESIDENT_VETO`, `getPeek()` only in `PRESIDENTIAL_POWER_PEEK`. `between` returns
  `[]` when the states are equal (and, while voting, the living seats' votes too); otherwise every
  event has `r = before.round()` and the move is read by `before.state()`:

| `before` | `after` | Events, in order |
|---|---|---|
| `CHANCELLOR_NOMINATION` | `CHANCELLOR_VOTING` | `nominate` (president `before`'s, chancellor `after`'s) |
| `CHANCELLOR_VOTING` | `CHANCELLOR_VOTING` | a `vote` per living seat in `after.votes` not in `before.votes`, in seat order |
| `CHANCELLOR_VOTING` | any other | those `vote`s; `election` over the living seats' votes; passed: `end` `HITLER_ELECTED` if `after` is that state, else [`reshuffle`], `draw` (`after.presidentHand`); failed: `tracker` (`before.tracker + 1`), and at 3 the chaos steps |
| `LEGISLATIVE_PRESIDENT` | `LEGISLATIVE_CHANCELLOR` | `discard` (Decision 7) |
| `LEGISLATIVE_CHANCELLOR` | `LEGISLATIVE_PRESIDENT_VETO` | `veto` (the chancellor) |
| `LEGISLATIVE_CHANCELLOR` | any other | `enact` (by `chancellor`, `seat`), [`reshuffle`], [`end`] |
| `LEGISLATIVE_PRESIDENT_VETO` | `LEGISLATIVE_CHANCELLOR` | `vetoAnswer` refused |
| `LEGISLATIVE_PRESIDENT_VETO` | any other | `vetoAnswer` accepted, `tracker`, and at 3 the chaos steps |
| `PRESIDENTIAL_POWER_PEEK` | `POST_LEGISLATIVE` | `peek` (`before.peek`) |
| `PRESIDENTIAL_POWER_INVESTIGATE` | `POST_LEGISLATIVE` | `investigate` (`after.target`, its side) |
| `PRESIDENTIAL_POWER_EXECUTION` | `POST_LEGISLATIVE` or `LIBERAL_VICTORY_EXECUTION` | `execute` (`after.target`, its role), [`end`] |
| `PRESIDENTIAL_POWER_ELECTION` | `POST_LEGISLATIVE` | `specialElection` (`after.target`) |
| `POST_LEGISLATIVE` | `CHANCELLOR_NOMINATION` | `endTerm` (`before.president`, `by: "president"`) |

  The chaos steps: [`reshuffle`], `enact` by `chaos` (no `seat`), [`reshuffle`], [`end`]. Any other
  pair throws. An `enact`'s policy is the side whose count rose; its `liberal`/`fascist` are
  `after`'s board; `end` follows whenever `after.finished()` and `before` was not. Reshuffles follow
  Decision 3; at the end the piles must equal `after`'s, and after a failed election or an accepted
  veto `after.tracker` must be the new value (0 after chaos), else it throws.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): spell out a game's changes as timeline events`, ticking
  box 1 and setting Phase 14A's Progress row to "in progress".

---

### Task 2: Random CPU games replay

**Files:**
- Create (test): `backend/src/test/java/server/stats/CpuGames.java`
- Test: `backend/src/test/java/server/stats/RandomGamesReplayTest.java`

**Interfaces:**
- Consumes: `GameSnapshot`, `TimelineDiff`, `TimelineReplay`.
- Produces (test): `CpuGames.play(int seats, LongSupplier clock, long startedAt, int stopAtRound)` →
  `record Played(SecretHitlerGame game, List<String> roles, List<LinkedHashMap<String, Object>> events)`.
  Seats `Bot 1`…`Bot n`, shuffled, each a `CpuPlayer` initialised on the game; it runs `Lobby`'s CPU
  loop (all `update`, then each `act`s; after an `act` that returns true it diffs with `t = clock −
  startedAt`, going on to the next CPU only while it is still voting) until the game ends, or
  `getRound()` reaches `stopAtRound` (0: to the end), or 2,000 moves (then it fails with the
  timeline as JSON). Phase 14B's fixture generator uses it too.

- [ ] **Step 1: Write the tests.** `everyRandomGameReplaysToItsEnd`: 300 games, 50 at each size 5
  to 10; each game's `TimelineReplay.replay(events, roles)` equals `TimelineReplay.of(game)`, the
  failure message giving the size, the game's index and its events as JSON.
  `randomGamesCoverEveryEventType`: plays games round-robin over sizes 5 to 10, each checked the same
  way, until all of these have been seen: every event type CPUs can make (all but `timerPause`,
  `timerResume`, `disconnect`, `reconnect` and `restored`), `enact` by `chancellor` and by `chaos`,
  `vetoAnswer` accepted and refused, and the four outcomes; it fails only if 5,000 games pass
  without one of them, naming what is missing. Unseeded games can take a few hundred to see them all;
  the cap keeps CI from flaking.
- [ ] **Step 2: Run** `./gradlew test --tests 'server.stats.RandomGamesReplayTest'`. Expected: PASS
  if Task 1 is right. A failure is a `TimelineDiff` bug: add its case to `TimelineDiffTest`, fix
  it, and run both.
- [ ] **Step 3: Commit** `test(backend): replay random cpu games from their timelines`, ticking box 2.

---

### Task 3: `Lobby` keeps a timeline and hands over the record

**Files:**
- Create: `backend/src/main/java/server/stats/GameRecord.java`, `GameRecordSink.java`,
  `backend/src/test/resources/backup-before-recorder.db` (Step 1)
- Modify: `backend/src/main/java/server/util/Lobby.java`,
  `backend/src/main/java/server/SecretHitlerServer.java` (`markLobbiesChanged`),
  `backend/src/test/java/server/ServerTesting.java` (`lobbiesChanged`, `clearLobbiesChanged`),
  `backend/src/test/java/server/GameDriver.java` (`stepCpus`)
- Test: `backend/src/test/java/server/util/LobbyRecordingTest.java`

**Interfaces:**
- Consumes: `GameSnapshot`, `TimelineDiff`, `TimelineReplay`, `GameDriver.playOut`.
- Produces: `public record GameRecord(String id, long startedAt, long endedAt, String outcome,
  boolean complete, int liberalPolicies, int fascistPolicies, int rounds, List<Seat> seats,
  List<Map<String, Object>> events)` with `public record Seat(String accountId, String name, boolean
  cpu, String role, boolean alive)` (`accountId` null for a CPU seat); constants `FORMAT = 1`,
  `LIBERAL_POLICIES`, `HITLER_EXECUTED`, `FASCIST_POLICIES`, `HITLER_ELECTED`, `UNFINISHED`; the
  compact constructor copies deeply, keeping key order (`Collections.unmodifiableMap(new
  LinkedHashMap<>(…))`, `List.copyOf` for cards, never `Map.copyOf`) and checks nothing else (14B
  builds a broken record on purpose); `static GameRecord of(String id, long startedAt, long endedAt,
  String outcome, boolean complete, SecretHitlerGame game, Map<String, String> seatAccounts,
  List<? extends Map<String, Object>> events)` (seats in turn order; a seat is a CPU's when
  `seatAccounts`, seat name → account as `Lobby.seatAccounts()` gives it, has no entry);
  `String winner()` (`LIBERAL` for the first two outcomes, `FASCIST` for the next two, null for
  `UNFINISHED`); `boolean hasCpu()`; `List<String> accountIds()`.
- Produces: `@FunctionalInterface public interface GameRecordSink { void submit(GameRecord record);
  GameRecordSink DROPPING = … }` (a sink is called under a lobby's lock: it must not block or touch a
  database; `DROPPING` logs at debug `No recorder: dropped the record of game <id>.`).
- Produces on `Lobby`: the four backed-up fields and `transient GameSnapshot lastSnapshot`;
  `public static volatile GameRecordSink recordSink = GameRecordSink.DROPPING`;
  `public static volatile LongSupplier recordClock = System::currentTimeMillis`;
  `synchronized public String gameId()` (the running game's ID, else the last finished one's, else
  null); `synchronized public void dropGame()` (game, `gameSeats`, `cpuPlayers`, the countdown,
  `expiredTermTimer`, `gameEvents` and `lastSnapshot` go; `gameId` stays); `game()` takes the
  baseline when `lastSnapshot` is null (Decision 8). While a game runs, `gameEvents` is never null.
- Produces on `SecretHitlerServer`: `public static void markLobbiesChanged()`; `hasLobbyChanged`
  becomes package-private and `volatile`.
- Produces (test): `GameDriver.stepCpus(Lobby lobby, Predicate<SecretHitlerGame> until)`: with the
  caller's `CPU_ACTION_DELAY_IN_SEC` at 600, so no tick comes during a test, it calls
  `updateAllUsers` under the lock (one CPU move, or one round of CPU votes, each) until `until`
  holds for `lobby.game()` or the lobby is idle; 2,000 calls at most.

- [ ] **Step 1: Write the pre-recorder backup**, before any change to `Lobby`: a temporary test
  stores, with `SecretHitlerServer.storeLobbies`, a lobby `ABCD` in a just-started game seated by
  `acct-Ann` (portrait `p1`), `acct-Bob` (`p2`) and three CPU players into
  `backend/src/test/resources/backup-before-recorder.db`. Run it once, delete the test, keep the
  file, and note `git rev-parse --short HEAD` for Task 5's Javadoc.
- [ ] **Step 2: Write the failing tests** in `LobbyRecordingTest`. `@Before` saves and `@After`
  puts back `recordSink` (here `records::add` on a synchronized list), `recordClock`,
  `CPU_ACTION_DELAY_IN_SEC` (600), `LOBBY_TIMEOUT_DURATION_IN_MIN`, `END_TERM_TIMER_IN_SEC` (600
  unless a test sets it) and `PLAYER_TIMEOUT_IN_SEC` (60). `playOut(lobby)` is
  `GameDriver.playOut(lobby.game(), g -> { synchronized (lobby) { lobby.updateAllUsers(); } })`.
  - `aFinishedGameHandsOverOneRecord`: players `P1`…`P5`, `playOut` ⇒ one record; `id` is
    `gameId()`; `outcome` is the game's; `complete` true; `hasCpu` false; seats in turn order with
    `acct-P1`…; the last event is `end`, the only one; `endedAt == startedAt + t` of it; the replay
    equals `TimelineReplay.of(game)`; the lobby is idle.
  - `cpuVotesAreRecordedOneByOne`: no players, `startNewGame`, `stepCpus` to the end ⇒ one record,
    `hasCpu` true, every seat `cpu` with a null account, the replay matches, and each election's
    `vote`s come in the bots' name order (`Bot 1` first), the order `Lobby` lets them act.
  - `aSweptGameHandsOverOneUnfinishedRecord`: timeout 0, `acct-Ann`, `acct-Bob` and three CPUs in a
    game started at clock 1,000,000; clock 1,600,000 ⇒ `closeIfTimedOut()` true and one record:
    `UNFINISHED`, `winner()` null, `endedAt` 1,600,000, last event `{type end, t 600000, …, outcome
    UNFINISHED}`, Ann's and Bob's seats with their accounts and three CPU seats; the lobby is not
    in a game; a second `closeIfTimedOut()` is false and adds no record.
  - `aFinishedGameSweptBeforeItsTickKeepsItsOutcome` (Review Focus 1): timeout 0, no players,
    `stepCpus` until `GameSnapshot.of(game).finished()` while the lobby is still in its game ⇒
    `closeIfTimedOut()` ⇒ one record with the game's real outcome and `winner()`, exactly one `end`
    (last); the lobby is idle.
  - `anUnreadableMoveIsSkippedAndTheGameGoesOn`: five players; `lobby.game().nominateChancellor(…)`
    and every living seat's vote with no `updateAllUsers` between, then `updateAllUsers` ⇒ every
    player's socket received a new packet; `playOut` ⇒ the game ends and one record has `complete`
    false.
  - `aSinkThatThrowsNeverStopsTheGame`: the sink throws ⇒ after `playOut` the lobby is idle and
    `startNewGame` works.
  - `twoGamesInARowAreTwoRecords` (Review Focus 4): `playOut` ⇒ `gameId()` is the first record's ID
    while idle; `startNewGame` ⇒ a new ID; `playOut` ⇒ two records with different IDs, the
    second's events start at `r` 1 and replay to the second game.
  - `tNeverGoesBack` (Review Focus 5): clock 1,000,000; start; nominate and `updateAllUsers` at
    +5,000; clock back to +1,000; a vote and `updateAllUsers` ⇒ that `vote`'s `t` is 5,000.
  - `noRecordWhileTheGameRuns`: after a nomination and two votes, `records` is empty.
  - `aGameThatEndsMarksTheBackupStale`: `ServerTesting.clearLobbiesChanged()`; a CPU-only game
    `stepCpus`'d to its end and idle ⇒ `ServerTesting.lobbiesChanged()` is true.
- [ ] **Step 3: Run** `./gradlew test --tests 'server.util.LobbyRecordingTest'`. Expected:
  compilation fails.
- [ ] **Step 4: Implement** as in Interfaces and the Decisions:
  - `startNewGame`, once the game exists (nothing set when it throws): a random UUID,
    `gameStartedAt = recordClock`, `gameComplete = true`, a new `gameEvents`, the baseline (guarded).
  - `private void observeGame(boolean byCountdown)`: nothing without a game; a null baseline is
    only taken; else `TimelineDiff.between(lastSnapshot, now, eventTime())`, appended, and `now`
    is the baseline; all inside the catch of Decision 11.
  - `private long eventTime()` (Decision 6) and `private void handOverGame(boolean swept)`
    (Decision 9): `observeGame(false)`, the outcome from `GameSnapshot.outcomeOf(game.getState())`,
    the `end` and `endedAt`, then `GameRecord.of` with `seatAccounts()` and `gameEvents` and
    `recordSink.submit`, in a `try`.
  - `updateAllUsers`: `observeGame(false)` first (its `getState()` also lets `hasGameFinished()` see
    a policy victory with no one connected); when finished, before the seats are cleared:
    `handOverGame(false)`, `markLobbiesChanged()`, then drop the game as today plus `gameEvents` and
    `lastSnapshot`. `observeGame(false)` after each `cpu.act` that returns true.
  - `closeIfTimedOut`, closing a lobby in a game: `handOverGame(true)`, then `dropGame()`.
- [ ] **Step 5: Run** `./gradlew test`. Expected: PASS, every existing test included.
- [ ] **Step 6: Commit** `feat(backend): keep a timeline per game and hand over its record`, with
  the backup file, ticking box 3.

---

### Task 4: Pauses, countdowns, drops and returns

**Files:**
- Modify: `backend/src/main/java/server/util/Lobby.java`,
  `backend/src/test/java/server/GameDriver.java` (`playUntil` with `onStep`)
- Test: `backend/src/test/java/server/util/LobbyRecordingTest.java`

**Interfaces:**
- Consumes: Task 3's `Lobby`, `TimelineDiff.event`.
- Produces (test): `GameDriver.playUntil(SecretHitlerGame game, GameState state,
  Consumer<SecretHitlerGame> onStep)`, calling `onStep` after every action as `playOut` does.
- Produces on `Lobby`: `pauseTermTimer` adds `timerPause{seat}` and `resumeTermTimer`
  `timerResume{seat}` (the president's seat) only when the countdown changes; `endTermOnTime` calls
  `observeGame(true)` right after `endPresidentialTerm()`; `removeUser` adds `disconnect{seat}` for
  a seated account; a seated account's new connection (not a takeover by key) adds
  `reconnect{seat}` under Decision 10. Seats are indexes in `game.getPlayerList()`.

- [ ] **Step 1: Write the failing tests** (players at END TERM by
  `GameDriver.playUntil(game, POST_LEGISLATIVE, g -> updateAllUsers under the lock)`):
  - `pausesAndResumesAreRecorded`: pause, pause, resume, resume ⇒ the timeline ends
    `timerPause{seat p}`, `timerResume{seat p}`, `p` the president's seat.
  - `theCountdownEndsTheTermByCountdown`: `END_TERM_TIMER_IN_SEC` 0.2, `updateAllUsers` starts it;
    wait for the next round ⇒ one `endTerm` for the round, `by` `countdown`, and
    `isLateForTerm(president)` is true (the server drops that president's late END TERM without
    touching the game, so it adds no second `endTerm`).
  - `aPresidentsEndTermIsByPresident`: `endPresidentialTerm()` and `updateAllUsers` ⇒ `by` `president`.
  - `dropsAndReturnsAreRecorded`: `removeUser(P2)` ⇒ `disconnect{seat of P2}`; P2 joins again with
    no key ⇒ `reconnect{same seat}`; P3, live with key `k`, replaced by a connection with `k` ⇒ no
    event; a spectator added and removed ⇒ no event.
- [ ] **Step 2: Run** `./gradlew test --tests 'server.util.LobbyRecordingTest'`. Expected: the new
  tests fail.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): record pauses, countdown ends, drops and returns`,
  ticking box 4.

---

### Task 5: Backups carry the timeline

**Files:**
- Modify: `backend/src/main/java/server/util/Lobby.java` (`readObject`, a new `writeObject`)
- Test: `backend/src/test/java/server/DatabaseBackupTest.java`

**Interfaces:**
- Consumes: Task 3's fields, `GameDriver.stepCpus`, `backup-before-recorder.db`.
- Produces on `Lobby`: `private void writeObject(ObjectOutputStream out)`, which runs
  `out.defaultWriteObject()` inside `synchronized (this)`; `readObject` as Decision 8 gives it.
  `storeLobbies` and `loadLobbies` are unchanged.

- [ ] **Step 1: Write the failing tests** (through the SQLite backup file, as the class's others):
  - `aGameRestoredMidGameKeepsItsTimeline`: five players, a few `GameDriver` steps with
    `updateAllUsers`, store and load; `GameDriver.playOut` on the restored lobby ⇒ one record with
    the original `id` and `startedAt`, `complete` true, one `restored`, whose events before it equal
    the timeline at the backup and whose `r` is the round then; the replay matches.
  - `theFirstMoveAfterARestoreIsRecorded` (Review Focus 3): restored at a nomination;
    `lobby.game().nominateChancellor(…)` then `updateAllUsers` ⇒ the timeline ends `restored`,
    `nominate`.
  - `twoRestartsAddTwoRestoredEvents` (Review Focus 3): stored and loaded twice ⇒ two `restored`,
    the same `id` and `startedAt`, `complete` true.
  - `aGameFromBeforeTheRecorderIsIncomplete` (Javadoc: written by `<the short hash from Task 3>`):
    clock 1,000,000, load the fixture ⇒ `ABCD` in a game with a new `gameId()`, a timeline of
    `[restored{t 0, r 1}]`, `seatAccounts()` Ann's and Bob's; clock 1,060,000, store and load again
    ⇒ the same ID and `[restored{t 0}, restored{t 60000}]`; `closeIfTimedOut()` ⇒ a record with
    `complete` false and `startedAt` 1,000,000.
  - `aSeatsFirstReturnAfterARestoreIsNoReconnect`: P2 disconnects (a `disconnect`), store and load,
    P2 joins ⇒ no `reconnect`.
  - `aFinishedGameRestoredBeforeItsTickKeepsItsOutcome` (Review Focus 1): a CPU-only game
    `stepCpus`'d until finished but not dropped, stored and loaded ⇒ no `restored` after its `end`;
    `closeIfTimedOut()` ⇒ one record, the real outcome, one `end`.
  - `theBackupTakesTheLobbysLock`: one thread holds the lobby's lock; `storeLobbies` on another is
    `BLOCKED` within 5 s and finishes once the lock is let go.
  - `aBackupHoldsNoRecorderClass`: the serialized bytes of a lobby in a game with a timeline do not
    contain `server.stats`.
- [ ] **Step 2: Run** `./gradlew test --tests 'server.DatabaseBackupTest'`. Expected: the new tests
  fail; `aBackupFromBeforeAccountsKeepsIdleLobbies` and `seatsKeepTheirAccountsThroughABackup` pass.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): back up the timeline with its game`, ticking box 5.

---

### Task 6: Docs

**Files:**
- Modify: `CLAUDE.md`, `docs/PLAN.md`

- [ ] **Step 1: Update `CLAUDE.md`'s Layout:** the `server.stats` package so far (`GameSnapshot`,
  `TimelineDiff`, `GameRecord`, `GameRecordSink`, and that Phase 14B adds the store, the writer and
  the route); `Lobby`'s timeline fields, the observation points, the lazy baseline, `endTerm` by
  countdown, Lobby's own events, `restored`, `complete: false` (a backup from before the recorder,
  or a skipped move), the hand-over (a finished game keeps its outcome even when swept), that a
  swept lobby drops its game, `writeObject` under the lock, `gameId()`, `recordSink` dropping
  records until 14B; the new tests and `GameDriver.stepCpus`. `README.md` and `DEVELOPMENT.md` gain
  nothing (nothing is stored or served yet); the PR says so.
- [ ] **Step 2: Commit** `docs(claude): describe the game timeline`, ticking box 6.

---

### Task 7: Whole-branch review

- [ ] **Step 1: Review** the branch since its merge-base with `origin/development` with the
  `code-review` skill (Standards against `CLAUDE.md`, Spec against the spec's Phase 14 parts this
  phase builds and this plan), with fresh reviewers.
- [ ] **Step 2: Fix every finding**, Minor ones included, each with a test when it changes
  behaviour; a finding that needs no change gets a stated reason in the review record for the PR.
- [ ] **Step 3: Run** `./gradlew test`. Expected: PASS.
- [ ] **Step 4: Commit** the last fix, ticking box 7.

---

### Task 8: The pull request

- [ ] **Step 1: Run everything on macOS:** `cd backend && ./gradlew test`; `cd ../frontend && npm
  test -- --run && npm run build`; `E2E_PORT=4614 npm run e2e -- --project=desktop`. Expected: all
  pass; note the counts.
- [ ] **Step 2: Run `firefox` in the Linux image** from the repo root as `DEVELOPMENT.md` ("Browser
  tests on Linux") gives it: build the frontend and the jar, serve it with `TEST_SIGN_IN=true
  PORT=4614`, and in a second terminal the guide's `docker run …` with `E2E_PORT=4614` and
  `--project=firefox`. Expected: PASS; stop the jar.
- [ ] **Step 3: Push and open the PR** into `development` (`gh pr create --repo
  jussaw/Secret-Hitler-Online --base development --title "feat(backend): keep a timeline of every
  game"`): what the phase adds, "This pull request changes nothing on screen." in place of the
  screenshot table, the test counts, the review record, "Part of #31; Phase 14B stores and serves
  the records", and that `README.md` and `DEVELOPMENT.md` need no change yet.
- [ ] **Step 4: Loop CI to green**, fixing each failure on the branch (phone failures reproduced in
  the Linux image). The session ends here: report the PR's number and that CI is green.
- [ ] **Step 5 (the manager's, resumable):** when the user says yes in chat: if `development` has
  moved, `git fetch origin && git rebase origin/development` (keep both sides of each docs
  conflict), run `./gradlew test`, push with `--force-with-lease` and wait for green CI; then the
  last commit, `docs(plan): tick phase 14a's merge` (the acceptance boxes, and the Progress row
  "done"), push, green CI; then `gh pr merge <number> --squash --admin --repo
  jussaw/Secret-Hitler-Online --subject "feat(backend): keep a timeline of every game (#<number>)"`,
  and check that `development`'s run published the image. Each part can be picked up where it stopped.

---

## Self-review

- **Spec coverage (this half):** the record's fields and events (Tasks 1, 3, `RecordFormat`);
  watching, one method spelled out, Lobby's own events (1, 3, 4); records at the end and at the
  sweep, with the sweep's `endedAt` and the game dropped (3); restored games, the `restored` event,
  `complete: false` spotted by `gameEvents == null`, `writeObject` under the lock (5); "Lobby marks
  itself changed" (3); the spec's tests for the comparison, the random replays, one record per
  finished game, one unfinished record per swept game, restores mid-game and from before the
  recorder (1 to 5). The tables, the writer, the load-time drop, the route and the fixture are
  Phase 14B's.
- **The spec's wording:** `r` is the round the move was made in (Decision 6); a chaos `enact`
  follows `tracker{3}` with no event for the reset (Decision 2); a swept lobby records `UNFINISHED`
  with `endedAt` the sweep's time and drops its game (Decision 9); `writeObject` takes its own lock,
  a pre-recorder game gets `restored` at `t` 0 and `complete: false` (Decision 8).
- **Audit findings:** a finished game swept or restored before its tick (Decision 9, Tasks 3 and 5);
  robustness and a null baseline after `readObject` (Decisions 8 and 11, `anUnreadableMove…`,
  `theFirstMoveAfterARestore…`); dead seats' votes (Decision 4, `aDeadSeatsVoteIsLeftOut`);
  coverage over random games capped, not flaky (Task 2); `reconnect` only back to the last
  `restored` (Decision 10, Task 5); no machine-specific JDK path.
- **Names** match the interfaces file: the four `Lobby` fields, `gameId()`, `GameSnapshot`,
  `TimelineDiff.between(GameSnapshot, GameSnapshot, long)`, `GameRecord`; `GameRecordSink` is new,
  and Phase 14B implements it.
