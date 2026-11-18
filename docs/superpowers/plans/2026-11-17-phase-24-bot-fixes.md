# Phase 24: Bot fixes and self-play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The bots pick their targets fairly and never shoot a known teammate or loop on a pick,
one bot step drives the lobby and every all-bot game, and `./gradlew botMatches` measures how
often each side wins, quoted before and after the fixes (issue #72, parts 1 and 2).

**Architecture:** `CpuPlayer` pins its `serialVersionUID` first, so the fixes cannot break old
backups. The CPU tick moves out of `Lobby.updateAllUsers` into `game.CpuTurn.step`, which `Lobby`
calls with `observeGame` and `CpuGames` with its snapshots and move guard. The self-play run,
`BotMatches` in the test source set, plays its games through `CpuGames` (which gains a bot maker,
so Phase 25A can give each side its level) and prints a table per table size. Only then do the
fixes land in `CpuPlayer`: the weighted pick, then the power targets.

**Tech Stack:** Java 17, Gradle 7.4.2 (a `JavaExec` task), JUnit 4.12 (no `assertThrows`),
commons-lang3 3.14.0's `SerializationUtils` (already a dependency; tests only). No new dependency.

**Spec:** [`docs/superpowers/specs/2026-11-17-bot-skill-design.md`](../specs/2026-11-17-bot-skill-design.md):
"The bug fixes every level gets (Phase 24)", "One bot step for the lobby and the self-play run
(Phase 24)", "The self-play run" (without levels), Constraints, Anti-goals, Phases, Tests "24",
Docs, and "Names the phases share". Issue #72 has the original detail; its line numbers are stale
(the spec's "What changed since #72"). Parent plan: [`docs/PLAN.md`](../../PLAN.md), Phase 24.
Where this plan and the spec differ, the spec wins.

## Decisions (what the spec leaves to the builder, settled here)

1. **The pin is checked, not assumed.** `serialver` on the class built from `development`, before
   any change, must print `2392054316009854878L`. The CPU players inside both backup fixtures
   (`backend/src/test/resources/backup-before-spectators.db` and `backup-before-recorder.db`) were
   written with that value (read from their class descriptors while planning), so
   `DatabaseBackupTest.aBackupFromBeforeAccountsKeepsIdleLobbies` and
   `aGameFromBeforeTheRecorderIsIncomplete` fail if the pin is wrong.
2. **One step.** `CpuTurn.step` is the tick: every bot's `update`, then `act` in the collection's
   order until a move moves the game on, every bot voting in the same step. Callers pass the bots
   in name order (`Lobby`'s `ConcurrentSkipListSet`, a `TreeSet` in `CpuGames`); `step` does not
   sort. Upstream's own `testCpuPlayer.testCanPlayFullGame` keeps its loop: it tests `act`'s
   return value one move a pass and is none of the three callers the spec names.
3. **The run plays through `CpuGames`.** `BotMatches` does not copy `CpuGames`' loop: `CpuGames`
   gains `play(…, makeBot)`, the one place an all-bot game is dealt, played through `CpuTurn.step`,
   guarded (2,000 moves, a bot that cannot move, a move that throws) and given a timeline. So the
   run's failures carry the same timeline the replay tests trust, and the self-play run still calls
   the shared step, through `CpuGames`. `BotMatches` only tallies and prints.
4. **The interval is Wilson's** (z = 1.96), clamped to [0, 1]: a table size can sit near 0% or
   100%, where the normal approximation leaves the range or shrinks to nothing. The table is plain
   ASCII, formatted with `Locale.ROOT`, so it pastes into a pull request as it printed.
5. **The weighted pick keeps its public signature.** `chooseRandomPlayerWeighted` keeps its weight
   formula (a known role's weight; otherwise the reputation interpolated between the fascist and
   liberal weights; plus `userBias` for a person; clamped at 0), but first keeps only the list's
   living players other than the bot. The draw moves into `getWeightedRandomIndex(float[] weights,
   double draw)`, static and package-private, so tests give it exact draws; running totals are
   summed in `double`.
6. **Allowed targets, one pick.** Investigation picks among `investigationTargets` (living, not
   the bot, not investigated before), execution among `executionTargets` (living, not the bot, and
   for a fascist or Hitler no player its `knownPlayerRoles` holds as `FASCIST` or `HITLER`), each
   with one call at today's weights. Leaving known teammates out is their weight of 0, while unknown
   players keep today's interpolation (the fascist side's 0.5 endpoint stays), so Hitler at 7 or
   more, who is dealt no teammates, weighs everyone as before.
7. **Tests through `act` start from one game state and copy it per pick** (`SerializationUtils.clone`;
   `SecretHitlerGame` is serializable, as backups need), reached with `server.GameDriver.playUntil`.
8. **Before and after.** The "before" table is the branch after Task 3, whose bots are
   `development`'s; the "after" is the branch after Task 5. Both at 2,000 games a size.

## Global Constraints

- **The pin first:** `CpuPlayer` gets `private static final long serialVersionUID =
  2392054316009854878L;` in Task 1, before any other change to the class. This phase adds no field
  to `CpuPlayer`. No phase adds a field or a non-private method to `SecretHitlerGame`.
- **The lobby's tick is unchanged:** its 4 s timer (`CPU_ACTION_DELAY_IN_SEC`), its lock,
  `observeGame(false)` after every bot move (each vote too), and the next tick scheduled only when
  the bots moved the game on.
- **The weighted pick, exactly:** draw in `[0, total weight)`; return the first eligible player
  whose running total exceeds it; a weight of 0 is never picked unless every weight is 0, and then
  the pick is uniform among the eligible players (living, not the bot).
- **The run, exactly:** sizes 5 to 10 and pooled; `-Pgames=N` games a size, 2,000 by default; per
  row the games, the liberal side's win rate with its 95% interval, and the share of each ending (5
  liberal policies, Hitler shot, 6 fascist policies, Hitler elected); a game past 2,000 moves fails
  the run, naming the size and the bots, with the game's timeline. `./gradlew test` stays fast: the
  run's test plays 3 games a size.
- **Existing tests pass unchanged:** `RandomGamesReplayTest`, `RecordedGamesFixtureTest`,
  `LobbyRecordingTest`, `RecordingServerTest`, `DatabaseBackupTest`, `LobbyBotCountTest`,
  `BotCountServerTest`, `LobbyStartTest`, the existing `testCpuPlayer` tests. Only `CpuGames.java`
  changes under `backend/src/test/java/server/`.
- **Backend only, nothing on screen, no protocol change.** Never touch `frontend/`, `devops/`, the
  `Dockerfile` or `ci.yml`.
- **Environment:** every `./gradlew` with Java 17:
  `export JAVA_HOME=<java-17-home>` (any installed Java 17; the
  wrapper fails on newer JDKs), then `cd backend && ./gradlew test`. Scratch files (the two
  `botMatches` outputs, the PR body) live in the session scratchpad's `phase-24/` folder only.
- **Known flake:** `GameRecorderTest.aFailingDatabaseLosesNoRecord`. Check a failure on
  `development` before calling it one.
- **Branch and commits:** worktree and branch `phase-24-bot-fixes`, off `origin/development`.
  Conventional Commits with a scope (`backend`, `claude`, `development`, `plan`), lowercase
  imperative, at most 72 characters; each test in the commit with its code. Each task ticks the
  Phase 24 box it names, in `docs/PLAN.md`, in its own commit. The pull request is squashed
  (`gh pr merge --squash --admin`); write "Part of #72", never a closing keyword.
- **Public repo:** nothing about the home server in code, docs, commits or the PR.

## Review Focus

1. **Bots voting before people have:** the step returns false, so the lobby schedules no tick,
   while each bot's vote still reaches `afterMove` (the timeline) on its own. Task 2,
   `botsWaitingForPeopleDoNotMoveTheGameOn`.
2. **A draw that rounds up to the total:** summed float weights and a draw just under 1 must still
   land on a weighted player, never a zero-weight one or past the end of the list. Task 4,
   `aDrawAtTheTopPicksTheLastWeightedEntry`.
3. **Every weight 0, in a list that holds the bot itself and the dead:** uniform among the living
   others only (today it returns the list's first entry, which can be the bot); a list with no one
   else alive is refused, not answered with the bot. Task 4,
   `everyWeightZeroPicksUniformlyAmongTheLiving` and `noOneToPickIsRefused`.
4. **A backup written before this phase, with bots in it:** it loads, with the pinned UID. Task 1,
   `cpuPlayerPinsItsSerialVersionUid` and `DatabaseBackupTest`'s two fixture tests.
5. **A self-play game that stalls, runs on or throws, and a bad `-Pgames`:** the run stops with a
   message naming the size and the bots and the timeline, or with a usage line, never a hang or a
   table of `NaN`. Task 3, `aGamePastTwoThousandMovesFailsTheRun`, `aGameNoBotCanMoveFailsTheRun`,
   `aBotThatThrowsFailsTheRun` and `optionsReadTheGames`.

---

### Before you start

- [ ] **Make the worktree:** `git fetch origin`, then the worktree and branch `phase-24-bot-fixes`
  from `origin/development`, nested under the session's worktree folder.
- [ ] **Check the start point.** All must hold, or stop and tell the coordinator:
  `git cat-file -e origin/development:docs/superpowers/plans/2026-11-17-phase-24-bot-fixes.md`
  and the same for `docs/superpowers/specs/2026-11-17-bot-skill-design.md`;
  `grep -n "^## Phase 24: Bot fixes and self-play" docs/PLAN.md` finds the section with six boxes
  and two acceptance boxes; `git log --oneline 2796a36..origin/development --
  backend/src/main/java/game/CpuPlayer.java` prints nothing (the class #72 measured).
- [ ] **Check the UID before any change:**

```bash
export JAVA_HOME=<java-17-home>
cd backend && ./gradlew compileJava
"$JAVA_HOME/bin/serialver" -classpath build/classes/java/main game.CpuPlayer
```

  Expected: `game.CpuPlayer:    private static final long serialVersionUID = 2392054316009854878L;`.
  Any other value: stop and ask; never pin another value.

---

### Task 1: Pin `CpuPlayer`'s `serialVersionUID`

**Files:**
- Modify: `backend/src/main/java/game/CpuPlayer.java` (the field, beside `MAX_REPUTATION`)
- Modify: `docs/PLAN.md` (Phase 24's first box; Progress row "in progress")
- Test: `backend/src/test/java/game/testCpuPlayer.java`

**Interfaces:**
- Produces: `CpuPlayer.serialVersionUID = 2392054316009854878L` (private static final long). From
  here on, methods may change; a field added later (Phase 25A's `skill`) comes back empty from an
  older backup and is filled in `readObject`, as `random` is.

- [ ] **Step 1: Write the failing test** `cpuPlayerPinsItsSerialVersionUid`:
  `CpuPlayer.class.getDeclaredField("serialVersionUID")` is `private`, `static` and `final`, of type
  `long`, and `ObjectStreamClass.lookup(CpuPlayer.class).getSerialVersionUID()` is
  `2392054316009854878L`.
- [ ] **Step 2: Run** `./gradlew test --tests 'game.testCpuPlayer.cpuPlayerPinsItsSerialVersionUid'`.
  Expected: FAIL with `NoSuchFieldException`.
- [ ] **Step 3: Add the field,** with a comment: the value Java computed for the class before it
  was pinned, which older backups carry.
- [ ] **Step 4: Run** `./gradlew test --tests 'game.testCpuPlayer' --tests 'server.DatabaseBackupTest'`,
  then `./gradlew test`. Expected: PASS.
- [ ] **Step 5: Commit** `chore(backend): pin CpuPlayer's serialVersionUID`, ticking Phase 24's
  first box and setting its Progress row to "in progress".

---

### Task 2: One bot step

**Files:**
- Create: `backend/src/main/java/game/CpuTurn.java`
- Modify: `backend/src/main/java/server/util/Lobby.java` (the CPU block of `updateAllUsers` only)
- Modify: `backend/src/test/java/server/stats/CpuGames.java` (its tick loop and javadoc)
- Test: `backend/src/test/java/game/CpuTurnTest.java`

**Interfaces:**
- Produces: `public final class CpuTurn` (private constructor) with
  `public static boolean step(SecretHitlerGame game, Collection<CpuPlayer> cpus, Runnable afterMove)`:
  calls `update(game)` on every bot in `cpus`' order, then `act(game)` on each in the same order.
  After each `act` that returns true it runs `afterMove`, then returns true, unless the state was
  `CHANCELLOR_VOTING` before that `act` and still is (a vote that leaves the election open: on to
  the next bot). It returns false when the bots run out: nobody acted, or every act was a vote and
  the election still waits for people. Its javadoc says `cpus` must be in name order. This is the
  lobby's `didCpuUpdateState`.
- `Lobby.updateAllUsers`: the loop becomes `boolean didCpuUpdateState = isInGame() &&
  CpuTurn.step(game, cpuPlayers, () -> observeGame(false));`; the scheduling after it is unchanged.
- `CpuGames.play(int seats, LongSupplier clock, long startedAt, int stopAtRound)`: same signature
  and behavior. While the game runs (and is below `stopAtRound`), it calls `CpuTurn.step`, whose
  `afterMove` counts the move (past `MAX_MOVES`, 2,000, the same `AssertionError` with the
  timeline) and diffs the look into the events. A false from `step` is the same `"No CPU could move
  in <state>: <timeline>"` `AssertionError`.

- [ ] **Step 1: Write the failing tests** in `CpuTurnTest` (seats named `Bot 1`…`Bot 5`, whose
  first seat is the first president, or `Ann`, `Bob`, `Bot 1`, `Bot 2`, `Bot 3` with Ann
  president; the bots each `initialize`d and in a `TreeSet`; `afterMove` counts into an
  `AtomicInteger`):
  - `aBotsMoveEndsTheStep`: five bots at `CHANCELLOR_NOMINATION` ⇒ true, state
    `CHANCELLOR_VOTING`, `afterMove` ran once.
  - `everyBotVotesInOneStep`: then a second step ⇒ true, `afterMove` ran 5 more times, state no
    longer `CHANCELLOR_VOTING`.
  - `botsWaitingForPeopleDoNotMoveTheGameOn` (Review Focus 1): Ann nominates Bob by hand ⇒ step
    false, `afterMove` 3 times, each bot `hasPlayerVoted`, Ann and Bob not, state still
    `CHANCELLOR_VOTING`; Ann and Bob vote ⇒ the state moves on.
  - `noBotToActIsNoMove`: Ann's game at `CHANCELLOR_NOMINATION` ⇒ false, `afterMove` never ran.
  - `everyBotUpdatesBeforeAnyActs`: bots that are `CpuPlayer` subclasses logging `update <name>`
    and `act <name>` before calling `super` ⇒ after one step the log starts `update Bot 1` …
    `update Bot 5`, then `act Bot 1`.
  - `aFinishedGameTakesNoStep`: a game from `server.GameDriver.play(5, g -> {})` with a bot per
    seat ⇒ false, `afterMove` never ran.
- [ ] **Step 2: Run** `./gradlew test --tests 'game.CpuTurnTest'`. Expected: compilation fails.
- [ ] **Step 3: Implement** `CpuTurn`, then move `Lobby` and `CpuGames` onto it, as in Interfaces.
  `CpuGames`' javadoc says it plays through `CpuTurn.step`, as `Lobby` does.
- [ ] **Step 4: Run** `./gradlew test --tests 'game.CpuTurnTest' --tests
  'server.stats.RandomGamesReplayTest' --tests 'server.stats.RecordedGamesFixtureTest' --tests
  'server.util.LobbyRecordingTest' --tests 'server.RecordingServerTest' --tests
  'server.DatabaseBackupTest' --tests 'server.util.LobbyBotCountTest' --tests
  'server.BotCountServerTest' --tests 'server.util.LobbyStartTest'`, then `./gradlew test`.
  Expected: PASS. `git diff --stat origin/development -- backend/src/test/java/server` lists only
  `CpuGames.java`.
- [ ] **Step 5: Commit** `refactor(backend): share one bot step between the lobby and CpuGames`,
  ticking the box "`game.CpuTurn.step` is the one bot step".

---

### Task 3: The self-play run

**Files:**
- Create: `backend/src/test/java/game/BotMatches.java`
- Modify: `backend/src/test/java/server/stats/CpuGames.java` (the bot maker; a move that throws)
- Modify: `backend/build.gradle` (task `botMatches`, beside `recordedGamesFixture`)
- Test: `backend/src/test/java/game/BotMatchesTest.java`

**Interfaces:**
- Consumes: `CpuTurn.step` (through `CpuGames`).
- Produces on `CpuGames`: `public static Played play(int seats, LongSupplier clock, long
  startedAt, int stopAtRound, BiFunction<String, Identity, CpuPlayer> makeBot)`: deals the game as
  now, then makes each seat's bot with `makeBot.apply(name, role)` after the deal and initializes
  it. The 4-argument `play` passes `(name, role) -> new CpuPlayer(name)`. A `RuntimeException` out
  of a step becomes `AssertionError("A CPU's move failed in <state>: <exception>: <timeline>", e)`.
- Produces: `public final class BotMatches` (private constructor) with:
  - `public static final int DEFAULT_GAMES = 2_000;`
  - `public static final List<GameState> ENDINGS`: `LIBERAL_VICTORY_POLICY`,
    `LIBERAL_VICTORY_EXECUTION`, `FASCIST_VICTORY_POLICY`, `FASCIST_VICTORY_ELECTION` (the
    columns' order).
  - `public static final BiFunction<String, Identity, CpuPlayer> BOTS_AS_BUILT = (name, role) ->
    new CpuPlayer(name);` and `public static final String BOTS_AS_BUILT_LABEL = "Bots as built";`.
  - `public static final class Tally`: `void add(GameState ending)` (`IllegalArgumentException`
    unless one of `ENDINGS`), `int games()`, `int count(GameState ending)`, `int liberalWins()`
    (the two liberal endings), `static Tally pooled(Collection<Tally> tallies)`.
  - `public record Interval(double low, double high)` and `public static Interval interval(int
    wins, int games)`: Wilson's score interval at z = 1.96, each end clamped to [0, 1];
    `IllegalArgumentException` for `games < 1` or `wins` outside `[0, games]`.
  - `public record Results(String label, int gamesPerSize, SortedMap<Integer, Tally> bySize)` with
    `Tally pooled()` and `String table()` (below).
  - `public static Results play(int gamesPerSize, String label, BiFunction<String, Identity,
    CpuPlayer> makeBot)`: for seats 5 to 10 in order, `gamesPerSize` games each through
    `CpuGames.play(seats, () -> 0L, 0L, 0, makeBot)`, each game's final `getState()` added to its
    size's tally; an `AssertionError` from a game is rethrown as `AssertionError("A game of <seats>
    seats with <label> failed: <its message>", e)`; `gamesPerSize < 1` is an
    `IllegalArgumentException`.
  - `public record Options(int games)` with `public static Options parse(String[] args)`: no
    argument gives `DEFAULT_GAMES`; `--games=N` gives N, a whole number of at least 1. Anything
    else is an `IllegalArgumentException`: `-Pgames must be a whole number of at least 1, not
    "<value>".` or `Unknown option "<arg>". botMatches takes -Pgames=N.`
  - `public static void main(String[] args)`: `parse`, then prints `play(options.games(),
    BOTS_AS_BUILT_LABEL, BOTS_AS_BUILT).table()` to standard output. A refused option prints its
    message to standard error and exits with status 2. A failed game's `AssertionError` leaves
    `main` (the run fails).
- `table()`: lines ending in `\n`. Line 1 is `<label>: <gamesPerSize> games at each table size`.
  Line 2 is the header, then one row for each size 5 to 10, then `All` (the pooled tally). Cells
  are right-aligned to their column, with at least two spaces between columns, and numbers use
  `Locale.ROOT`. The header cells are `Seats`, `Games`, `Liberals win`, `95% interval`,
  `5 liberal`, `Hitler shot`, `6 fascist`, `Hitler elected`. A row's cells are the size (or `All`),
  the games (no separator), the liberal rate `%.1f%%`, the interval `%.1f-%.1f%%` (in percent), and
  each ending's share `%.1f%%`, in `ENDINGS`' order.
- `build.gradle`, as written (Phase 25A forwards `liberals`, `fascists` and `ladder` the same way):

```groovy
// Plays games with a bot in every seat and prints who wins, for each table size from 5 to 10
// and pooled (game.BotMatches, in the test source set). -Pgames=N plays N games a size (2,000 by
// default). The games cannot be seeded, so every run differs. Neither build nor test runs it.
task botMatches(type: JavaExec) {
    mainClass = 'game.BotMatches'
    classpath = sourceSets.test.runtimeClasspath
    if (project.hasProperty('games')) {
        args "--games=${project.property('games')}"
    }
}
```

- **For Phase 25A, with no rewrite of `play`:** 25A passes a maker that reads the seat's role,
  `(name, role) -> new CpuPlayer(name, role == Identity.LIBERAL ? liberals : fascists)`, and a
  label naming both levels. `Options` gains `liberals`, `fascists` and `ladder`, `parse` gains
  `--liberals=`, `--fascists=` and `--ladder`, and `build.gradle` forwards each `-P` property it is
  given as one argument. `-Pladder` calls `play` once per pairing and prints their `Results`
  together. `BotMatchesTest.everySizeFinishesItsGames` loops over the pairings. `Interval` is what
  25B's ladder check compares (`a.high() < b.low()`).

- [ ] **Step 1: Write the failing tests** in `BotMatchesTest` (JUnit 4.12: catch the throwable and
  `assertNotNull` it, as `LobbySpectatorTest`'s `expectIllegalArgument` does):
  - `everySizeFinishesItsGames`: `play(3, "Test bots", BOTS_AS_BUILT)` ⇒ `bySize` keys exactly 5
    to 10, each tally's `games()` 3 and its four `count`s summing to 3; `pooled().games()` 18.
  - `aGamePastTwoThousandMovesFailsTheRun`: a maker of `CpuPlayer` subclasses whose `act` returns
    true and does nothing, label `"Stalling bots"` ⇒ an `AssertionError` whose message holds
    `5 seats`, `Stalling bots` and `ran past 2000 moves`.
  - `aGameNoBotCanMoveFailsTheRun`: `act` always false, label `"Idle bots"` ⇒ its message holds
    `5 seats`, `Idle bots` and `No CPU could move`.
  - `aBotThatThrowsFailsTheRun`: `act` throws `IllegalStateException("boom")`, label
    `"Broken bots"` ⇒ its message holds `5 seats`, `Broken bots` and `boom`.
  - `theIntervalIsWilsons` (within 0.0001): `interval(5, 10)` is (0.2366, 0.7634);
    `interval(500, 1000)` is (0.4691, 0.5309); `interval(0, 10)` is (0.0, 0.2775) with `low()
    >= 0`; `interval(10, 10)` is (0.7225, 1.0) with `high() <= 1`; `interval(1, 0)` and
    `interval(11, 10)` are refused.
  - `theTableShowsEverySizeAndThePool`: a `Results("Test bots", 10, …)` built by hand: size 5 with
    4 `LIBERAL_VICTORY_POLICY`, 1 `LIBERAL_VICTORY_EXECUTION`, 3 `FASCIST_VICTORY_POLICY`, 2
    `FASCIST_VICTORY_ELECTION`; sizes 6 to 10 with 10 `FASCIST_VICTORY_POLICY` each. Split on
    `\s{2,}` after trimming: line 1 is `Test bots: 10 games at each table size`; line 2 is the
    eight header cells; size 5 is `5, 10, 50.0%, 23.7-76.3%, 40.0%, 10.0%, 30.0%, 20.0%`; size 6
    is `6, 10, 0.0%, 0.0-27.8%, 0.0%, 0.0%, 100.0%, 0.0%`; the last line is `All, 60, 8.3%,
    3.6-18.1%, 6.7%, 1.7%, 88.3%, 3.3%`; 9 lines in all.
  - `optionsReadTheGames` (Review Focus 5): `parse()` is 2000; `--games=50` is 50; `--games=0`,
    `--games=-3`, `--games=abc`, `--games=` and `--ladder` are refused.
- [ ] **Step 2: Run** `./gradlew test --tests 'game.BotMatchesTest'`. Expected: compilation fails.
- [ ] **Step 3: Implement** `CpuGames`' maker, `BotMatches` and the task, as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS. Then `./gradlew -q botMatches
  -Pgames=20` prints the 9-line table, and `./gradlew -q botMatches -Pgames=0` fails with the
  `-Pgames must be …` line.
- [ ] **Step 5: Take the "before" table** (the bots are still `development`'s): `./gradlew -q
  botMatches | tee <scratchpad>/phase-24/botmatches-before.txt`. Note how long it took. If it
  prints nothing for 10 minutes, a re-pick loop has hung (Task 5 removes it): stop it and keep
  that as the "before" finding.
- [ ] **Step 6: Commit** `test(backend): add the botMatches self-play run`, ticking the box
  "`./gradlew botMatches` prints win rates …".

---

### Task 4: The weighted pick

**Files:**
- Modify: `backend/src/main/java/game/CpuPlayer.java` (`chooseRandomPlayerWeighted`,
  `getWeightedRandomIndex`)
- Test: `backend/src/test/java/game/testCpuPlayer.java`

**Interfaces:**
- Produces: `static int getWeightedRandomIndex(float[] weights, double draw)` (package-private,
  replacing the private instance method that took running thresholds). `draw` is in `[0, 1)`. A
  weight at or below 0 counts as 0. With a positive total, it returns the first index whose
  running total (summed in `double`) exceeds `draw × total`, or, when rounding leaves none, the
  last index with a positive weight. With every weight 0, it returns `min((int) (draw ×
  length), length − 1)`. An empty array is an `IllegalArgumentException`.
- `public String chooseRandomPlayerWeighted(List<Player> playerList, float fascistWeight, float
  hitlerWeight, float liberalWeight, float userBias)`: same signature and weight formula
  (Decision 5). It keeps only the list's living players other than this bot, in the list's order,
  refuses an empty result with `IllegalArgumentException`, and returns
  `eligible.get(getWeightedRandomIndex(weights, random.nextDouble()))`. The threshold array and
  its `-1` go. The javadoc says what a weight of 0 means and when it throws.
- Test helpers in `testCpuPlayer` (Decision 7): `TOLERANCE = 0.01`;
  `gameAt(int seats, GameState state, Identity presidentRole)` makes games of `makePlayers(seats)`
  until one has a president of that role in that state, by `server.GameDriver.playUntil` unless
  the state is `CHANCELLOR_NOMINATION` (a new game is in it). It skips a game that ends first (an
  `IllegalStateException`) and fails after 200 games. `copyOf(game)` is
  `SerializationUtils.clone`. `presidentBot(game)` is a `CpuPlayer` for `getCurrentPresident()`,
  initialized. `assertShares(Map<String, Integer> picks, Map<String, Double> expected)` checks each
  name's share of all picks within `TOLERANCE`, and that no other name was picked.

- [ ] **Step 1: Write the failing tests:**
  - `theDrawLandsInTheRunningTotals`: weights `{1, 0, 3}`: draws 0.0 and 0.2 ⇒ 0; 0.25, 0.9 and
    `Math.nextDown(1.0)` ⇒ 2.
  - `aDrawAtTheTopPicksTheLastWeightedEntry` (Review Focus 2): `{0.1f, 0.2f, 0.3f, 0f}` with
    `Math.nextDown(1.0)` ⇒ 2.
  - `allZeroWeightsSplitTheDrawEvenly`: `{0, 0, 0, 0}`: 0.0 ⇒ 0, 0.25 ⇒ 1, 0.5 ⇒ 2, 0.74 ⇒ 2,
    `Math.nextDown(1.0)` ⇒ 3.
  - `anEmptyListOfWeightsIsRefused`: `new float[0]` ⇒ `IllegalArgumentException`.
  - `everyWeightZeroPicksUniformlyAmongTheLiving` (Review Focus 3): a 6-seat game, the bot on
    seat `0`, seat `3` killed; `ITERATIONS` picks of `chooseRandomPlayerWeighted(
    game.getPlayerList(), 0, 0, 0, 0)` ⇒ shares 0.25 for each of `1`, `2`, `4`, `5`.
  - `noOneToPickIsRefused` (Review Focus 3): a list of only the bot's own `Player` and a dead one ⇒
    `IllegalArgumentException`.
  - #72's table, `ITERATIONS` picks each, with `assertShares`:
    - `aLiberalsFirstNominationIsEven` (through `act`): `gameAt(5, CHANCELLOR_NOMINATION,
      LIBERAL)`; each pick is `act` on a copy, counting `getCurrentChancellor()`. Four people at
      reputation 0 weigh 0.605 each ⇒ 0.25 each (today 15.1%, 15.1%, 15.1%, 54.7%).
    - `aLiberalsExecutionFollowsTheWeights` (through `act`): `gameAt(5,
      PRESIDENTIAL_POWER_EXECUTION, LIBERAL)`; on each copy, the bot's reputation for the first
      other seat in seat order is −5 (weight 1.0), the other three 0 (weight 0.3), counting
      `getTarget()` ⇒ 0.5263, then 0.1579 each (today 25.0%, 7.6%, 7.4%, 60.1%).
    - `aFascistNominatesHitlerByWeightWhereverHeSits` (direct): a FASCIST bot of a 5-seat game,
      Hitler `markAsCpu()`'d, two liberals as people, weights `(0.35f, 1.5f, 0.15f, 0.05f)` (the
      nomination after 3 fascist policies). The list `[Hitler, L, L]` ⇒ Hitler 0.7895, each
      liberal 0.1053; the list `[L, L, Hitler]` ⇒ the same.
    - `aFascistsSpecialElectionFollowsTheWeights` (through `act`): `gameAt(7,
      PRESIDENTIAL_POWER_ELECTION, FASCIST)`, counting `getTarget()`: the other fascist and Hitler
      weigh 1.5 ⇒ 0.2143 each; four liberals weigh 1.0 ⇒ 0.1429 each (today the last seat 0.0%).
  - `aLiberalExecutionEndsWhenEveryoneLeftIsTrusted` (the spec's execution case): `gameAt(5,
    PRESIDENTIAL_POWER_EXECUTION, LIBERAL)`; on each of `ITERATIONS / 10` copies, every other
    player is `markAsCpu()`'d at reputation +3 (weight 0) ⇒ `act` returns true; the target is
    alive before, never the bot; every other seat is executed at least once (today always the
    first).
- [ ] **Step 2: Run** `./gradlew test --tests 'game.testCpuPlayer'`. Expected: compilation fails
  (no static `getWeightedRandomIndex(float[], double)` yet).
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS, the existing `testCpuPlayer` tests among
  them.
- [ ] **Step 5: Commit** `fix(backend): pick bots' targets in proportion to their weights`,
  ticking the box "The weighted pick draws in proportion to the weights …".

---

### Task 5: Allowed targets and teammates

**Files:**
- Modify: `backend/src/main/java/game/CpuPlayer.java` (`handlePresidentialPowerInvestigate`,
  `handlePresidentialPowerExecution`, two private helpers, and `knownPlayerRoles`' comment, which
  credits the peek where investigations fill it)
- Test: `backend/src/test/java/game/testCpuPlayer.java`

**Interfaces:**
- Consumes: Task 4's pick and test helpers.
- Produces (private, for Phase 25A's Easy picks, which draw among the same moves):
  `List<Player> investigationTargets(SecretHitlerGame game)` (living, not this bot, not
  `hasBeenInvestigated()`) and `List<Player> executionTargets(SecretHitlerGame game)` (living, not
  this bot; for a bot dealt FASCIST or HITLER, no player whose `knownPlayerRoles` entry is
  `FASCIST` or `HITLER`). Each handler makes one `chooseRandomPlayerWeighted` call over its targets
  at today's weights: investigation `(1, 0, −0.4, 0.5)` for a liberal and `(1, 1, 1, 0.5)`
  otherwise; execution `(1, 1, −0.4, 0)` for a liberal and `(0.5, 0, 1, 0)` for the fascist side.
  No loop and no re-pick.

- [ ] **Step 1: Write the failing tests** (`ITERATIONS / 10` copies each unless said):
  - `aFascistNeverExecutesAKnownTeammate`: `gameAt(7, PRESIDENTIAL_POWER_EXECUTION, FASCIST)` ⇒
    the target is never FASCIST or HITLER, and each of the four liberals is executed at least once.
  - `hitlerAtFiveNeverExecutesTheFascist`: `gameAt(5, PRESIDENTIAL_POWER_EXECUTION, HITLER)` (a
    Hitler at 5 knows the fascist) ⇒ never the fascist, and each liberal at least once.
  - `hitlerAtSevenStillWeighsByReputation` (`ITERATIONS` copies, `assertShares`): `gameAt(7,
    PRESIDENTIAL_POWER_EXECUTION, HITLER)`, the first other seat at reputation −5 ⇒ that seat
    0.1176 (weight 0.5) and each of the other five 0.1765 (weight 0.75). It passes before the
    change too, and guards that unknown players keep the 0.5 endpoint.
  - `aLiberalInvestigationEndsWhenEveryoneLeftIsTrusted`: `gameAt(9,
    PRESIDENTIAL_POWER_INVESTIGATE, LIBERAL)`. On each copy the first other seat in seat order
    stays a person, at reputation +3 (weight 0.38) and already `investigate()`d, and every other
    seat is `markAsCpu()`'d at +3 (weight 0). The whole loop runs inside `endsWithin(10, …)`, which
    runs it on a daemon thread and fails with "the investigation never ended" if it has not
    returned in 10 s (today's re-pick loop spins on the one weighted player forever, and a daemon
    thread lets the test JVM exit). ⇒ `act` returns true, the state is `POST_LEGISLATIVE`, the
    target is neither the bot nor the investigated seat and is in `knownPlayerRoles`, and each of
    the seven others is investigated at least once.
- [ ] **Step 2: Run** `./gradlew test --tests 'game.testCpuPlayer'`. Expected: the two teammate
  tests and the investigation test FAIL (the last by its 10 s limit); the Hitler-at-7 test passes.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS.
- [ ] **Step 5: Take the "after" table:** `./gradlew -q botMatches | tee
  <scratchpad>/phase-24/botmatches-after.txt`, noting how long it took.
- [ ] **Step 6: Commit** `fix(backend): never let a bot execute a teammate or pick twice`,
  ticking the box "A fascist bot or Hitler never executes a known teammate …".

---

### Task 6: Docs

**Files:**
- Modify: `CLAUDE.md`, `DEVELOPMENT.md`, `docs/PLAN.md`

- [ ] **Step 1: `CLAUDE.md`.** In Layout's backend part, replace "`SecretHitlerGame` and
  `CpuPlayer` do not pin a `serialVersionUID`, so a new field or non-private method on either
  would stop older backups loading …" with: `SecretHitlerGame` pins none (the same rule, for it
  alone); `CpuPlayer` pins `2392054316009854878L`, the value Java computed before Phase 24, which
  both backup fixtures' CPU players carry, so its methods may change and a field added later comes
  back empty from an older backup and is filled in `readObject`, as `random` is. Right after it,
  one passage on the bots (#72), which Phases 25A and 25B extend:
  - Each CPU tick is `CpuTurn.step` (every bot's `update`, then `act` in name order, every bot
    voting in one step; `afterMove` after each move, each vote too; true when the bots moved the
    game on). `Lobby.updateAllUsers` calls it with `observeGame` and schedules the next tick only
    on true; `CpuGames` calls it with its snapshots and guards.
  - The pick (`chooseRandomPlayerWeighted` and `getWeightedRandomIndex(weights, draw)`), and the
    single pick among `investigationTargets` and `executionTargets`, a fascist or Hitler leaving
    out every player it knows to be on its side.
  - `./gradlew botMatches` (`BotMatches`): what it prints, `-Pgames`, the 2,000-move guard, the
    Wilson interval, and that runs differ. `CpuGames.play`'s bot maker.
  - The tests: `CpuTurnTest`, `BotMatchesTest` (3 games a size), and `testCpuPlayer`'s new cases.

  Add a row to the Commands table: "Play all-bot games and print who wins at each table size
  (2,000 games a size, `-Pgames=N` for another count; runs differ)" | `cd backend && ./gradlew
  botMatches`.
- [ ] **Step 2: `DEVELOPMENT.md`.** A section "The bots' self-play run" after "The stats pages'
  fixture": what `./gradlew botMatches` plays and prints (the columns, sizes 5 to 10 and `All`),
  `./gradlew botMatches -Pgames=500` for a quicker run, that a game past 2,000 moves (or one no bot
  can move) fails the run with its timeline, that the games cannot be seeded, so the intervals say
  how far a difference can be trusted, and that a change to the bots quotes the run before and
  after in its pull request.
- [ ] **Step 3: Commit** `docs(claude): describe the bot step, fixes and self-play run` and
  `docs(development): add the bots' self-play run`, the last ticking the box "`CLAUDE.md` and
  `DEVELOPMENT.md` updated; the pull request quotes `botMatches` …" (the two tables are saved, and
  the PR quotes them in Task 8).

---

### Task 7: Whole-branch review

- [ ] **Step 1: Review** the branch since its merge-base with `origin/development` with the
  `code-review` skill: Standards against `CLAUDE.md`, and Spec against the spec's Phase 24 parts
  and this plan, with fresh reviewers.
- [ ] **Step 2: Fix every finding,** Minor ones included, each with a test where it changes
  behavior, in commits of their own scope. A finding that needs no change gets a stated reason.
  Keep the list (finding, what was done) for the PR's Review section. A change to the bots' play
  after Task 5 means taking the "after" table again.
- [ ] **Step 3: Run** `./gradlew build` (the tests and the jar). Expected: PASS; note the test
  count.
- [ ] **Step 4: Commit** the last fix with the acceptance box "Backend tests pass" ticked, or
  `docs(plan): tick phase 24's test box` if there was nothing to fix.

---

### Task 8: The pull request

- [ ] **Step 1: Push and open the PR:** `git push -u origin phase-24-bot-fixes`; `gh pr create
  --repo jussaw/Secret-Hitler-Online --base development --head phase-24-bot-fixes --title
  "feat(backend): add a bot self-play run and fix the bots' picks" --body-file
  <scratchpad>/phase-24/pr-body.md`. The body, in order:
  - What the phase does (the pin, the step, the run, the three fixes).
  - "This PR changes nothing on screen." in place of the screenshot table.
  - `botMatches` before (the bots as on `development`) and after, each its file verbatim in a code
    block with its run time, and under them a line for each row whose liberal rate moved beyond
    both intervals.
  - Decisions (this plan's).
  - Review (each finding and what was done).
  - Tests (the counts).
  - "Part of #72".

  Read it back (`gh pr view --repo jussaw/Secret-Hitler-Online --json body`) and check it is this
  phase's.
- [ ] **Step 2: Bring CI to green,** fixing each failure on the branch and pushing until every job
  passes. If `development` moves while it is open, rebase (keep both sides of `CLAUDE.md` and
  `docs/PLAN.md`), run `./gradlew test`, and push with `--force-with-lease`. The phase's work ends
  here, with the PR open and green.
- [ ] **Step 3: Merge (the manager session, once CI is green: the user gave a standing OK for these five phase pull requests).** Each part is
  skipped when already done, so the step can be resumed:
  - If the "PR merged into `development`" box is not ticked on the branch, commit `docs(plan):
    tick phase 24's merge` (that box and the Progress row "done"), push, and wait for green.
  - If `gh pr view <n> --repo jussaw/Secret-Hitler-Online --json state` is not `MERGED`, run `gh
    pr merge <n> --squash --admin --repo jussaw/Secret-Hitler-Online --match-head-commit <head
    sha> --subject "feat(backend): add a bot self-play run and fix the bots' picks (#<n>)"`.
  - `gh run list --repo jussaw/Secret-Hitler-Online --branch development --limit 1` shows the
    push's run publishing `:latest`.

---

## Self-review

- **Spec coverage:** the pin, checked by `serialver` before any change (Before you start, Task 1);
  the weighted pick (Task 4); teammates at 0 and no re-pick loops (Task 5); the one step for the
  lobby, `CpuGames` and the run (Tasks 2 and 3); `botMatches` with `-Pgames`, sizes 5 to 10 and
  pooled, the interval, the endings' shares and the 2,000-move guard (Task 3); the fast test
  (Task 3); the run before and after the fixes (Tasks 3 and 5, quoted in Task 8); Tests "24"
  (#72's cases within a tolerance, all weights 0, a fascist and a teammate, investigation and
  execution with everyone at +3, the shared step under the unchanged tests, `DatabaseBackupTest`);
  Docs (Task 6). Levels, Easy and Hard are Phase 25A's and later.
- **Anti-goals:** a bot that stalls or loops (Task 3's guards and Task 5's single pick); backups
  that stop loading (Task 1, and the two fixtures written with the pinned value).
- **Names:** `CpuTurn.step(SecretHitlerGame, Collection<CpuPlayer>, Runnable)` returning the
  lobby's `didCpuUpdateState`, `BotMatches` (`main`, `play`), `BotMatchesTest` and the
  `botMatches` task, as the spec's "Names the phases share" pins them; `CpuGames.play(…, makeBot)`,
  `BotMatches.Interval` and `Options` are this plan's, for 25A and 25B.
