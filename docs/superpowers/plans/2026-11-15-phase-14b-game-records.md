# Phase 14B: Game records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The server stores every record Phase 14A hands over in SQLite exactly once, with player
numbers in place of accounts, and serves every record from `GET /api/stats/games`, with a committed
contract fixture for the stats pages (issue #31).

**Architecture:** `server.stats` gains the tables (`GameStore`), one writer thread that implements
14A's `GameRecordSink` (`GameRecorder`) and the route with its cache (`StatsRoutes`).
`SecretHitlerServer` sets the writer as `Lobby.recordSink` at start-up, drops a restored game that
already has a record before the start-up sweep, retries waiting records every minute and flushes
them at shutdown, each in a method of its own that tests call. Every database call runs on the
writer's thread, the start-up or timer thread, or an HTTP thread, never under a lobby's lock.

**Tech Stack:** Java 17, Javalin 5.6.1 (its gzip leaves alone a response that already has
`Content-Encoding`), sqlite-jdbc 3.53.4.0, Jackson 2.16.1 (JSON in key order), JUnit 4 ·
Playwright (one spec) · Vite (one proxy entry).

**Spec:** [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](../specs/2026-11-15-game-stats-design.md)
("The record"; in "The recorder (Phase 14)": Writing, A finished game never comes back, Tables, the
in-memory case, `GET /api/stats/games`, A contract fixture; Constraints, Anti-goals, Tests, Known
limits). Shared names: [`2026-11-15-game-stats-interfaces.md`](2026-11-15-game-stats-interfaces.md)
and its "Settled after the plans were written". Builds on
[Phase 14A](2026-11-15-phase-14a-game-timeline.md). Parent plan: [`docs/PLAN.md`](../../PLAN.md),
Phase 14B. Where this plan and the spec differ, the spec wins.

## Decisions (the spec's rules as this plan builds them, and what it leaves to the builder)

1. **Connections.** `GameStore` opens its own connection to `DATABASE_PATH` (busy timeout 5 s), or,
   without one, an in-memory database of the recorder's own (the account store's belongs to its one
   connection), gone at restart. Names are read through the account store (`AccountStore.find`),
   not a join.
2. **One write per game.** `save` numbers the record's accounts (in `players`, in seat order) and
   writes the game and its seats in one transaction, which takes the write lock at its start; a
   game ID already there rolls it all back and changes nothing. (As built: a number is looked up
   before one is made, since an `INSERT OR IGNORE` that SQLite ignores still uses up an
   `AUTOINCREMENT` number and left gaps.)
3. **The writer.** `GameRecorder` is the sink: `submit` only queues. One daemon thread saves; a
   record whose save fails waits in memory, goes back on the queue every minute, and is tried once
   more at shutdown before the last lobby backup.
4. **Wiring in methods tests call.** `main` keeps a few calls: `startUp(GameStore)` (start
   recording, load the lobby backup, drop restored games that have a record, the start-up sweep, in
   that order), `everyMinute()` (the timer's body: the sweep, the session sweep, the retry, the
   backup) and `onShutdown()` (the hook's body: the flush, then the last backup).
5. **A finished game never comes back.** `dropRecordedGames` reads each restored game's ID under its
   lobby's lock, asks the store once under no lock, and drops each one that has a record
   (`Lobby.dropGame()`), logging the lobby. A read that fails keeps every game.
6. **The route keeps its serialized response until the next record is saved or an account is
   renamed**, as UTF-8 bytes, their gzip and their ETag (the body's SHA-256). A request with
   `Accept-Encoding: gzip` gets the gzip bytes with `Content-Encoding: gzip`; Javalin 5.6.1's
   compressor skips a response that already has `Content-Encoding`, so it is gzipped once. (As
   built: the header is read as that compressor reads it, a case-blind `gzip` substring with any
   `q` aside, since it gzips the plain body of any request that names gzip.)
7. **The contract fixture is made once:** regenerating it changes it. The generator lives in the
   test source set and uses 14A's `CpuGames`; `RecordedGamesFixtureTest` checks the committed file
   against 14A's `RecordFormat`, which `GameRecordJsonTest` holds the Java writer to.
8. **The end-to-end proof:** `frontend/e2e/recorder.spec.ts` plays a real game to its end through
   `e2e/driveGame.ts` and finds it in `GET /api/stats/games` in the spec's key order; the PR task
   checks it again with `curl` against a jar with a database file.

## Global Constraints

- **Locks:** no database call while any lobby's lock is held. `GameRecorder.submit` never blocks,
  throws or touches the store. `ACCOUNTS_LOCK`, when taken, is still taken before any lobby's lock.
- **Secrets:** nothing of a running game reaches any response: the route serves only rows of
  `games`, which only finished or abandoned games reach.
- **No account ID** in any record's JSON or any response: seats carry player numbers.
- **Format 1, the spec's tables:** record keys `RecordFormat.RECORD_KEYS` (`id`, `format`,
  `startedAt`, `endedAt`, `outcome`, `winner`, `complete`, `hasCpu`, `liberalPolicies`,
  `fascistPolicies`, `rounds`, `seats`, `events`), seat keys `RecordFormat.SEAT_KEYS` (`player`,
  `name`, `cpu`, `role`, `alive`), events as 14A writes them.
- **Tables:** `players (number INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL)`; `games (id TEXT PRIMARY KEY, format INTEGER NOT NULL, started_at
  INTEGER NOT NULL, ended_at INTEGER NOT NULL, outcome TEXT NOT NULL, has_cpu INTEGER NOT NULL,
  record TEXT NOT NULL)` with index `games_ended_at`; `game_seats (game_id TEXT NOT NULL, seat
  INTEGER NOT NULL, player_number INTEGER, name TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY
  (game_id, seat))` with index `game_seats_player`. Created if missing, in the `DATABASE_PATH` file.
- **Route:** `GET /api/stats/games`, no sign-in; body `{"players":[{"number","name"}…],"games":[…]}`,
  players by number, games by `endedAt` then `id`; headers `Content-Type: application/json`,
  `ETag` (quoted hex), `Cache-Control: no-cache`, `Vary: Accept-Encoding`, `Content-Encoding: gzip`
  when asked; 304 to a matching `If-None-Match`; 503 with `Stats are unavailable right now.` when
  the database fails.
- **No new dependency** on either side.
- **Existing tests** keep passing, changed only where this plan says.
- **Environment:** Java 17 (`JAVA_HOME` pointing at an installed 17) for every `./gradlew` and
  `npm run e2e`. Browser tests use `E2E_PORT=4624`: `desktop` on macOS, `firefox` in Playwright's
  Linux image as `DEVELOPMENT.md` ("Browser tests on Linux") describes. Nothing changes on screen,
  so there are no "before" shots (their port would be 4724).
- **Phase 13 merges first:** never touch `devops/`, the `Dockerfile` or `ci.yml`. If Phase 13 is
  not on `development` when this phase starts, keep `main`'s change to the calls of Decision 4, and
  keep both sides of `main` (its WAL call and `startServer`) at the rebase.
- **Branch and commits:** worktree and branch `phase-14b-game-records` from `origin/development`
  once Phase 14A has merged. Conventional Commits with a scope (`backend`, `frontend`, `plan`,
  `docs`, `claude`, `readme`, `development`), at most 72 characters. Task N (1 to 8) ticks the Nth
  box of Phase 14B in `docs/PLAN.md` in its last commit; Task 1's commit also sets Phase 14B's
  Progress row to "in progress". The pull request is squashed (`gh pr merge --squash --admin`) with
  a Conventional subject ending `(#N)`.
- **Public repo:** nothing about the hosting setup in code, docs, commits or the PR.

## Review Focus

1. **A rename after a game is recorded:** the next response shows the new name, not the cached old
   one. Task 4 tests it.
2. **A browser that sends no `Accept-Encoding: gzip`, or an `If-None-Match` from before a
   restart:** plain JSON for the first; 304 for the second exactly when the body is unchanged.
   Task 4 tests both.
3. **The database down at start-up:** the load-time read fails, so every restored game is kept and
   an error logged; records handed over meanwhile wait and are written once it is back. Task 3
   tests it.
4. **A restored game that already has a record, in a lobby that has timed out:** dropped before the
   sweep, so the sweep makes no `UNFINISHED` record for it and the first record stands. Task 3
   tests it.
5. **The server stopping with records waiting:** each is tried once before the last lobby backup.
   Task 3 tests it.

---

### Before you start

- [ ] **Check the start point:** `git fetch origin`, then make the worktree and branch
  `phase-14b-game-records` from `origin/development`. All must hold, or stop and tell the
  coordinator: `git cat-file -e origin/development:backend/src/main/java/server/stats/GameRecordSink.java`
  (Phase 14A is in); `grep -n "^## Phase 14B: Game records" docs/PLAN.md` finds the section with
  eight deliverable boxes; the spec, the interfaces file and this plan are in `docs/superpowers/`.
  Note whether Phase 13 is in (`git cat-file -e origin/development:devops/backup-db.sh`): if not,
  build anyway; the PR waits for it.

---

### Task 1: The tables and the record's JSON

**Files:**
- Create: `backend/src/main/java/server/stats/GameStore.java`
- Modify: `backend/src/main/java/server/stats/GameRecord.java` (`toJson`)
- Test: `backend/src/test/java/server/stats/GameStoreTest.java`, `GameRecordJsonTest.java`

**Interfaces:**
- Consumes: 14A's `GameRecord`, `RecordFormat`, `GameDriver`.
- Produces on `GameRecord`: `String toJson(Map<String, Integer> playerNumbers)`: Jackson over
  ordered maps in `RECORD_KEYS` order (`format` 1, `winner()`, `hasCpu()`); each seat's `player` is
  its account's number, or null for a CPU seat.
- Produces: `public class GameStore implements AutoCloseable` (not final, so tests override its
  methods) with `protected GameStore(String databasePath)` (the file, or `jdbc:sqlite::memory:` when
  null or blank; `PRAGMA busy_timeout = 5000`; the tables created if missing; throws
  `IllegalStateException` when it cannot open); `static GameStore open(String databasePath)`; every
  public method `synchronized`, each SQL failure an `IllegalStateException`:
  `boolean save(GameRecord record)` (Decision 2: look up each account's number in seat order and
  insert a `players` row for one that has none; `INSERT OR IGNORE` the `games` row with `toJson(numbers)`; no row
  changed: roll back, false; else the `game_seats` rows, commit, true; any failure rolls back);
  `Set<String> recordedIds(Collection<String> ids)` (one query); `record PlayerRow(int number,
  String accountId)` and `List<PlayerRow> players()` (by number); `List<String> recordsJson()` (by
  `ended_at`, then `id`); `void close()`.

- [ ] **Step 1: Write the failing tests.**
  `GameRecordJsonTest`: `theJsonHasTheSpecsFieldsInOrder` (a record from a `GameDriver` game, parsed
  into ordered maps: keys `RECORD_KEYS`, `format` 1, seat keys `SEAT_KEYS`, every event's keys
  `expectedKeys`); `seatsCarryPlayerNumbersOnly` (numbers {acct-Ann: 3, acct-Bob: 7}: seats 3, 7 and
  null for CPUs; the JSON holds neither account ID); `winnerFollowsTheOutcome` (each outcome, and
  JSON `null` for `UNFINISHED`).
  `GameStoreTest` (in memory unless said): `playersAreNumberedInTheOrderTheyAreFirstRecorded` (game
  1 seats Ann, Bob; game 2 Cy, Ann: Ann 1, Bob 2, Cy 3, and game 2's seats are 3 and 1);
  `aSecondWriteOfAnIdChangesNothing` (`save` true, then the same ID with another outcome false; one
  `games` row holding the first JSON; `game_seats` and `players` unchanged);
  `seatsAreStoredForEachGame` (rows with `player_number` null for CPUs, the names and roles);
  `recordsComeOldestFirst` (by `ended_at`, ties by `id`); `recordedIdsFindsOnlySavedGames`;
  `aFailedSaveWritesNothing` (a record built with a null seat name throws `IllegalStateException`
  and leaves no `games`, `game_seats` or new `players` row); `theTablesLiveBesideTheAccounts` (on a
  temporary file, `AccountStore.open` and `GameStore.open` of one path both work, the file has all
  five tables, and the store's `busy_timeout` is 5000).
- [ ] **Step 2: Run** `cd backend && ./gradlew test --tests 'server.stats.GameStoreTest' --tests
  'server.stats.GameRecordJsonTest'`. Expected: compilation fails.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): store game records with player numbers`, ticking box 1 and
  setting Phase 14B's Progress row to "in progress".

---

### Task 2: The recorder

**Files:**
- Create: `backend/src/main/java/server/stats/GameRecorder.java`
- Test: `backend/src/test/java/server/stats/GameRecorderTest.java`

**Interfaces:**
- Consumes: `GameStore`, 14A's `GameRecordSink`.
- Produces: `public final class GameRecorder implements GameRecordSink` with `GameRecorder(GameStore
  store, Runnable afterSave)`; `void start()` (one daemon thread, `game-recorder`, taking from an
  unbounded queue: `save`, then `afterSave` when a row was written; a failure is logged and the
  record waits); `void submit(GameRecord record)` (queues it; never blocks, throws or touches the
  store); `void retryWaiting()` (every waiting record back on the queue); `void flush()` (on the
  calling thread, every queued and waiting record tried once; those that fail wait again);
  `int waitingCount()`; `void stop()` (interrupts and joins the thread).

- [ ] **Step 1: Write the failing tests** (a `GameStore` subclass in memory that can fail, block
  and count calls): `aRecordIsWrittenOffTheCallersThread` (saved within 5 s on `game-recorder`;
  `afterSave` once); `aFailingDatabaseLosesNoRecord` (failing: `submit` returns, `waitingCount()`
  becomes 1, a `retryWaiting()` while still failing keeps it 1; healed: `retryWaiting()` saves it
  within 5 s, `waitingCount()` 0, `afterSave` once); `flushTriesEveryWaitingRecordOnce` (thread
  stopped, two waiting and one queued: failing, `flush()` makes exactly three `save` calls and keeps
  all three; healed, `flush()` saves all three on the test's thread); `submitNeverBlocks` (with
  `save` blocked on a latch, three `submit`s each return within 100 ms).
- [ ] **Step 2: Run** `./gradlew test --tests 'server.stats.GameRecorderTest'`. Expected:
  compilation fails.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): write game records on their own thread`, ticking box 2.

---

### Task 3: Start-up, the minute and shutdown

**Files:**
- Modify: `backend/src/main/java/server/SecretHitlerServer.java`,
  `backend/src/test/java/server/ServerTesting.java`
- Test: `backend/src/test/java/server/RecordingServerTest.java`, `DatabaseBackupTest.java`

**Interfaces:**
- Consumes: `GameStore`, `GameRecorder`, 14A's `Lobby.recordSink`, `Lobby.gameId()`,
  `Lobby.dropGame()`, `GameDriver.stepCpus`.
- Produces on `SecretHitlerServer` (package-private unless said): `static GameStore games`,
  `static GameRecorder recorder`; `static void startRecording(GameStore store)` (the recorder,
  started, as `Lobby.recordSink`) and `static void stopRecording()` (stops it; the sink back to
  `GameRecordSink.DROPPING`); `static void dropRecordedGames(Map<String, Lobby> lobbies, GameStore
  store)` (Decision 5; the log line `Dropped the game in lobby <CODE>: it has a record already.`;
  marks the lobbies changed); `static void startUp(GameStore store)` (`startRecording`,
  `loadDatabaseBackup()`, `dropRecordedGames(codeToLobby, store)`, `removeInactiveLobbies()`);
  `static void everyMinute()` (today's timer body plus `recorder.retryWaiting()` after the session
  sweep); `static void onShutdown()` (`recorder.stop()` and `recorder.flush()`, then today's hook
  body). `main`: after the
  account store, `startUp(GameStore.open(DATABASE_PATH))`; the timer's task calls `everyMinute()`
  and the hook's thread `onShutdown()`. `ServerTesting` passes `dropRecordedGames`, `startUp`,
  `everyMinute` and `onShutdown` on.

- [ ] **Step 1: Write the failing tests.** Each saves and puts back `codeToLobby`,
  `ApplicationConfig.DATABASE_PATH` (a temporary file where a test needs one), `accounts` (an
  in-memory store) and the CPU delay (600, for `stepCpus`), and calls `stopRecording()` after.
  `RecordingServerTest`:
  - `noDatabaseCallUnderALobbyLock`: a store recording, at every call, whether the calling thread
    holds any of the test's lobbies' locks; a game played to its end, a second lobby in a game swept
    by `removeInactiveLobbies()`, and `dropRecordedGames` over a backup of a third ⇒ at least two
    `save`s and one `recordedIds`, none under a lobby's lock.
  - `aStuckDatabaseNeverHoldsUpTheGame`: `save` blocked; a CPU-only game `stepCpus`'d to its end ⇒
    the lobby is idle, and so is a second game after it, while neither is saved; let go, both are
    saved within 5 s.
  - `startUpDropsRecordedGamesBeforeTheSweep` (Review Focus 4): a backup file with `ABCD` (in a
    game whose ID already has a record, timed out) and `EFGH` (in a game, timed out, no record) ⇒
    `startUp(store)` ⇒ both lobbies swept; within 5 s `EFGH`'s game has one `UNFINISHED` record;
    `save` is never called with `ABCD`'s ID, whose first record stands.
  - `aDatabaseDownAtStartUpKeepsTheGames` (Review Focus 3): with every store call failing, a backup
    with `ABCD` (in a game, live) and `EFGH` (in a game, timed out) ⇒ `startUp` keeps `ABCD`'s game,
    logs an error, and `EFGH`'s `UNFINISHED` record waits; healed, `everyMinute()` writes it within 5 s.
  - `onShutdownTriesWaitingRecordsBeforeTheLastBackup` (Review Focus 5): a record waiting, the
    store healed, the thread stopped ⇒ `onShutdown()` saves it, the file had no `backup` row when
    `save` ran, and has one after.
  `DatabaseBackupTest`: `aRestoredGameThatHasARecordIsDropped` (`ABCD`, whose game's ID has a
  record, and `EFGH`, whose has none, stored and loaded, then `dropRecordedGames` ⇒ `ABCD` idle with
  `gameId()` that ID and the log line once; `EFGH` still in its game);
  `theDropKeepsGamesWhenTheDatabaseFails` (`recordedIds` throws ⇒ both in their games, an error
  logged).
- [ ] **Step 2: Run** `./gradlew test --tests 'server.RecordingServerTest' --tests
  'server.DatabaseBackupTest'`. Expected: compilation fails.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): record games from start-up to shutdown`, ticking box 3.

---

### Task 4: `GET /api/stats/games`

**Files:**
- Create: `backend/src/main/java/server/stats/StatsRoutes.java`
- Modify: `backend/src/main/java/server/SecretHitlerServer.java` (the route, `stats`,
  `startRecording`, `renameAccount`), `frontend/vite.config.ts`
- Test: `backend/src/test/java/server/StatsRoutesTest.java`

**Interfaces:**
- Consumes: `GameStore.players()`, `GameStore.recordsJson()`, `GameRecorder`'s `afterSave`.
- Produces: `public final class StatsRoutes` with `StatsRoutes(GameStore store, Function<String,
  String> currentName)` (account ID → its name now, or null); `static final String UNAVAILABLE =
  "Stats are unavailable right now."`; `void invalidate()` (bumps an `AtomicLong` version; never
  blocks); `String body()` (the cached body, built when stale; throws when the database fails;
  Task 5's generator calls it); `void getGames(Context ctx)`. The body is `{"players":` + Jackson of
  `[{"number", "name"}…]` (a missing name reads `Player <number>`) + `,"games":[` + the stored
  records joined by `,` + `]}`. A matching `If-None-Match` (any comma-separated entry, `W/`
  stripped, equal to the ETag, or `*`) gets 304 with the ETag and no body; otherwise 200 with the
  Global Constraints' headers (Decision 6). A `RuntimeException` while building is logged and
  answered 503 with `UNAVAILABLE`.
- Produces on `SecretHitlerServer`: `static StatsRoutes stats`; `startRecording` makes it first and
  gives the recorder `stats::invalidate`, with names from `accounts.find(id).username()`;
  `.get("/api/stats/games", …)` answers 503 with `UNAVAILABLE` while `stats` is null;
  `renameAccount` calls `stats.invalidate()` on `SAVED`. `vite.config.ts`: `"/api": backend`.

- [ ] **Step 1: Write the failing tests** in `StatsRoutesTest` (the app on port 0,
  `SignedInPlayers` for the accounts, `startRecording(GameStore.open(null))` before and
  `stopRecording()` after; games played in lobbies registered with `ServerTesting.putLobby`, seats
  `test-P1`…`test-P5` named `P1`…; `awaitGames(n)` polls the route until it lists `n` games):
  - `anEmptyDatabaseAnswersEmptyLists`: the body is exactly `{"players":[],"games":[]}`.
  - `answersPlayersAndRecordsOldestFirst`: two games ⇒ 200, `application/json`, players numbered
    1–5 in the first game's seat order, each with their account's name, the games in `endedAt`
    order, each equal to its stored JSON; no cookie is needed.
  - `noAccountIdInTheResponse`: the body contains no `test-`.
  - `aMatchingETagAnswers304`: the ETag is a quoted 64-character hex string, with `Cache-Control:
    no-cache` and `Vary: Accept-Encoding`; `If-None-Match` with it, or with `W/` before it, ⇒ 304,
    no body, the same ETag; another tag ⇒ 200.
  - `aNewRecordChangesTheResponse`: another game ends ⇒ the old ETag gets 200, a new ETag, one more game.
  - `aRenameChangesTheResponse` (Review Focus 1): `renameAccount("test-P1", "Annie")` ⇒ the old ETag
    gets 200 and `P1`'s number reads `Annie`.
  - `itIsGzippedOnce` (Review Focus 2): with `Accept-Encoding: gzip`, `Content-Encoding: gzip`, and
    one `GZIPInputStream` gives the same body as a request without it, which has no
    `Content-Encoding`.
  - `aRestartKeepsTheETag` (Review Focus 2): a new `StatsRoutes` over the same store gives the same ETag.
  - `aFailingDatabaseIs503`: `recordsJson` throws ⇒ 503 with `UNAVAILABLE`; healed ⇒ 200.
  - `aRunningGameIsNeverServed`: a lobby with a nomination and votes made ⇒ no game with its
    `gameId()`; played to its end ⇒ it is served.
- [ ] **Step 2: Run** `./gradlew test --tests 'server.StatsRoutesTest'`. Expected: compilation fails.
- [ ] **Step 3: Implement** as in Interfaces, and add the proxy entry.
- [ ] **Step 4: Run** `./gradlew test`, then `cd ../frontend && npm test -- --run && npm run build`.
  Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): serve every record from /api/stats/games`, ticking box 4,
  and `feat(frontend): proxy /api to the backend in the dev server`.

---

### Task 5: The contract fixture

**Files:**
- Create (test): `backend/src/test/java/server/stats/RecordedGamesFixture.java`
- Modify: `backend/build.gradle` (task `recordedGamesFixture`)
- Create: `frontend/src/stats/fixtures/recorded-games.json` (the task's output)
- Test: `backend/src/test/java/server/stats/RecordedGamesFixtureTest.java`

**Interfaces:**
- Consumes: 14A's `CpuGames`, `GameRecord.of`, `TimelineReplay`, `RecordFormat`; `GameStore`,
  `StatsRoutes`, `AccountStore`.
- Produces: `RecordedGamesFixture.main(String[] args)`, writing to `args[0]` (making its folder):
  - Twelve in-memory accounts `test-fixture-1`…`12` named `Ada`, `Bea`, `Cyrus`, `Dov`, `Esme`,
    `Finnegan`, `Gus`, `Hedda`, `Ivo`, `Juno`, `Kit`, `Maximilianus` (twelve characters).
  - 62 games: ten finished games at each size from 5 to 10, then two cut off once round 5 begins
    (5 and 10 seats), recorded `UNFINISHED` with an `end` event added. Game `k` seats the accounts
    in turn from account `k mod 12`; when `k mod 6 == 5` its last two seats stay CPU seats.
  - Game `k` starts at `1_793_559_600_000L` (2026-11-01 19:00 UTC) + `(k / 4)` × 3 days +
    `(k % 4)` × 50 minutes, and each move takes 2 to 20 s on the generator's clock.
  - Each record is saved to an in-memory `GameStore`; the file is `StatsRoutes.body()` over that
    store and the accounts, pretty-printed by Jackson, with a trailing newline.
- Produces in `build.gradle`: `task recordedGamesFixture(type: JavaExec)` with `mainClass =
  'server.stats.RecordedGamesFixture'`, `classpath = sourceSets.test.runtimeClasspath` and `args
  file('../frontend/src/stats/fixtures/recorded-games.json').absolutePath`, outside `build` and
  `test`.

- [ ] **Step 1: Write the failing tests** in `RecordedGamesFixtureTest`, reading
  `../frontend/src/stats/fixtures/recorded-games.json`: `theFixtureIsInFormatOne` (top keys
  `players` and `games`, every record's, seat's and event's keys as `RecordFormat` gives them,
  `format` 1); `everyFixtureGameReplays` (each timeline replays, and its board, dead seats and
  outcome match the record's `liberalPolicies`, `fascistPolicies`, seats' `alive` and `outcome`);
  `theFixtureCoversTheStats` (at least ten finished games at each size from 5 to 10, each of the
  four outcomes, two `UNFINISHED` with `winner` null, a game with CPU seats, every seat's `player`
  in `players`, games oldest first); `theFixtureHoldsNoAccountId` (no `test-` in the file).
- [ ] **Step 2: Run** `./gradlew test --tests 'server.stats.RecordedGamesFixtureTest'`. Expected:
  FAIL (no file).
- [ ] **Step 3: Implement** the generator and the task, then run `./gradlew recordedGamesFixture`.
  If the 60 finished games lack one of the four outcomes, play on at that size until it appears
  (the generator, not the test, does the looking).
- [ ] **Step 4: Run** `./gradlew test`, then `cd ../frontend && npm test -- --run && npm run build`
  (nothing imports the file yet). Expected: PASS.
- [ ] **Step 5: Commit** `test(backend): generate the recorded games fixture`, ticking box 5, and
  `test(frontend): add the recorded games fixture` with the JSON.

---

### Task 6: A real game, end to end

**Files:**
- Create: `frontend/e2e/recorder.spec.ts`

**Interfaces:**
- Consumes: `openTable`, `play`, `isVictory` from `e2e/driveGame.ts`; Playwright's `request`.

- [ ] **Step 1: Write the test** `a game played to its end is served by /api/stats/games`
  (`test.skip` outside `desktop`, "one browser is enough"; 180 s): `openTable(baseURL, 5)`, then
  `play(table)` to a victory; poll `request.get("/api/stats/games")` for up to 10 s for a game whose
  seats' names equal the victory state's `playerOrder` ⇒ its keys are exactly, in order, `id`,
  `format`, `startedAt`, `endedAt`, `outcome`, `winner`, `complete`, `hasCpu`, `liberalPolicies`,
  `fascistPolicies`, `rounds`, `seats`, `events`; `outcome` is the victory state's
  (`LIBERAL_VICTORY_POLICY` → `LIBERAL_POLICIES`, and so on); `complete` true, `hasCpu` false; the
  raw body has no `test-`. Close the table in a `finally`.
- [ ] **Step 2: Run** `cd frontend && E2E_PORT=4624 npx playwright test e2e/recorder.spec.ts
  --project=desktop`. Expected: PASS (Tasks 1 to 4 make it pass; it proves them together, and
  drives no new code).
- [ ] **Step 3: Commit** `test(frontend): check that a real game is recorded`, ticking box 6.

---

### Task 7: Docs

**Files:**
- Modify: `CLAUDE.md`, `DEVELOPMENT.md`, `README.md`, `docs/PLAN.md`

- [ ] **Step 1: Update the docs:** `CLAUDE.md`'s Layout: `GameStore`, `GameRecorder` (the sink),
  `StatsRoutes`; the tables; `startUp`'s order, `everyMinute`, `onShutdown`; the load-time drop; the
  route, its cache (kept until a record is saved or an account renamed), ETag, gzip, 503; the dev
  server's `/api` proxy; the fixture and its test; `recorder.spec.ts`; the new tests.
  `DEVELOPMENT.md`: the file also holds `players`, `games` and `game_seats`; `curl -s
  localhost:4040/api/stats/games` to see a local run's records; `./gradlew recordedGamesFixture`
  remakes the fixture after a change to the format, differs every run, and is committed with the
  change. `README.md`: what the fork adds (the server records every game; the stats pages come
  later) and, in hosting, that the records live in `/data/backup.db` with the rest. Nothing names a
  real host, path or service.
- [ ] **Step 2: Commit** `docs(claude): describe the game records`, `docs(development): describe
  the records and the fixture task` and `docs(readme): mention the game records`, ticking box 7.

---

### Task 8: Whole-branch review

- [ ] **Step 1: Review** the branch since its merge-base with `origin/development` with the
  `code-review` skill (Standards against `CLAUDE.md`, Spec against the spec's parts this phase
  builds and this plan), with fresh reviewers.
- [ ] **Step 2: Fix every finding**, Minor ones included, each with a test when it changes
  behaviour; a finding that needs no change gets a stated reason in the review record for the PR.
- [ ] **Step 3: Run** `./gradlew test`, `npm test -- --run` and `npm run build`. Expected: PASS.
- [ ] **Step 4: Commit** the last fix, ticking box 8.

---

### Task 9: The pull request

- [ ] **Step 1: Run everything on macOS:** `cd backend && ./gradlew test`; `cd ../frontend && npm
  test -- --run && npm run build`; `E2E_PORT=4624 npm run e2e -- --project=desktop`. Expected: all
  pass; note the counts.
- [ ] **Step 2: Run `firefox` in the Linux image and check a real game end to end**, from the repo
  root as `DEVELOPMENT.md` ("Browser tests on Linux") gives it: build the frontend and the jar,
  serve it with `TEST_SIGN_IN=true PORT=4624` and `DATABASE_PATH` a file in a new temporary folder.
  `curl -s localhost:4624/api/stats/games` prints `{"players":[],"games":[]}`. In a second
  terminal, the guide's `docker run …` with `E2E_PORT=4624`, first `--project=firefox`, then
  `--project=desktop e2e/recorder.spec.ts`. Then this prints a count of at least 1 and exits 0:

```bash
curl -s localhost:4624/api/stats/games | node -e '
  const d = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const want = "id,format,startedAt,endedAt,outcome,winner,complete,hasCpu,liberalPolicies,fascistPolicies,rounds,seats,events";
  if (!d.games.length || d.games.some((g) => Object.keys(g).join() !== want)) process.exit(1);
  console.log(d.games.length + " games recorded");'
```

  Stop the jar. Expected: PASS and the count.
- [ ] **Step 3: Push and open the PR** into `development` (`gh pr create --repo
  jussaw/Secret-Hitler-Online --base development --title "feat(backend): store and serve every
  game's record"`): what the phase adds, "This pull request changes nothing on screen." in place of
  the screenshot table, the test counts, the end-to-end count, the review record, "Part of #31", and
  that it merges after Phase 13's pull request.
- [ ] **Step 4: Loop CI to green**, fixing each failure on the branch (phone failures reproduced in
  the Linux image). The session ends here: report the PR's number, that CI is green, and whether
  Phase 13 has merged.
- [ ] **Step 5 (the manager's, resumable):** once Phase 13 has merged, under the user's standing OK, in
  chat: if `development` has moved, `git fetch origin && git rebase origin/development` (keep both
  sides of `SecretHitlerServer.main`, `docs/PLAN.md` and the docs), run `./gradlew test`, `npm test
  -- --run` and `npm run build`, push with `--force-with-lease` and wait for green CI; then the last
  commit, `docs(plan): tick phase 14b's merge` (the acceptance boxes but the user's, and the
  Progress row "done"), push, green CI; then `gh pr merge <number> --squash --admin --repo
  jussaw/Secret-Hitler-Online --subject "feat(backend): store and serve every game's record
  (#<number>)"`, and check that `development`'s run published the image. Each part can be picked up
  where it stopped.

---

## Self-review

- **Spec coverage (this half):** numbering players, one transaction, `INSERT OR IGNORE` of the game, retries on
  the minute and once at shutdown (Tasks 1 to 3); the finished-game drop before the start-up sweep
  (3); the tables and the in-memory case (1, Decision 1); the route with its cache until a record
  or a rename, ETag, 304, gzip, 503, no sign-in (4); the `/api` proxy (4); the fixture (5); the
  spec's tests for a second write, a failing database, no database call under a lobby's lock, the
  response's 304 and its change on a new record, no account ID and no running game (1 to 4); docs
  (7). The timeline, the hand-over and the restores are Phase 14A's.
- **Anti-goals:** a game never waits on the database (`aStuckDatabaseNeverHoldsUpTheGame`); one
  record per game (`aSecondWriteOfAnIdChangesNothing`, `startUpDropsRecordedGamesBeforeTheSweep`); no
  secret of a running game (`aRunningGameIsNeverServed`); no account ID (`noAccountIdInTheResponse`,
  `theFixtureHoldsNoAccountId`, `recorder.spec.ts`).
- **Audit findings:** `main`'s timer and hook bodies are `everyMinute` and `onShutdown`, called by
  tests, with `startUp`'s order tested (Task 3); a real game is proved recorded end to end, in the
  browser tests and with `curl` (Tasks 6 and 9); no machine-specific JDK path.
- **Names** match the interfaces file and 14A: `GameStore`, `GameRecorder` (a `GameRecordSink`),
  `StatsRoutes`, the three tables, the route.
