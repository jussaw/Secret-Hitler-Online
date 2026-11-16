# Phase 13: Database backups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The database is backed up before the first game is recorded (issue #31, the first of its
ten phases): the server keeps its SQLite file in WAL mode and says when it listens, the image
carries `sqlite3`, and two host scripts take a consistent, checked snapshot while the server writes
and put one back.

**Architecture:** `SecretHitlerServer.main` puts the file in WAL mode before anything else opens
it, and logs a line of its own once Javalin listens. `devops/backup-db.sh` and
`devops/restore-db.sh` are self-contained bash scripts that work on the running container by name
through the `docker` CLI: the backup runs `VACUUM INTO` and its checks inside the container and
copies the snapshot out; the restore checks the file on the host, then swaps it in from a one-off
container of the same image. One shell test drives both, against a stubbed `docker` for the
refusals and failure paths and against a real container of the branch's image for the rest, in a
new CI job on pull requests.

**Tech Stack:** Java 17, Javalin 5.6.1, sqlite-jdbc 3.53, JUnit 4, logback's `ListAppender` ·
bash (3.2-compatible), the Docker CLI, `sha256sum` or `shasum -a 256`, `curl` (the test only) ·
`eclipse-temurin:17-jre` (Ubuntu) with `sqlite3` · GitHub Actions, `docker/build-push-action`.

**Spec:** [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](../specs/2026-11-15-game-stats-design.md),
"Database backups (Phase 13)", with its Phases, Constraints, Tests, Acceptance and Known limits.
Shared names and file ownership: [`2026-11-15-game-stats-interfaces.md`](2026-11-15-game-stats-interfaces.md).
Parent plan: [`docs/PLAN.md`](../../PLAN.md), Phase 13. Where this plan and the spec differ, the
spec wins.

## Decisions this plan makes

The spec leaves these to the builder.

1. **The startup line is the server's own.** Javalin 5.6.1 logs `Listening on …` and `Javalin
   started in <n>ms \o/`, but that wording is a dependency's, which Dependabot bumps weekly: a
   change would fail no test here and make every good restore time out. So the server logs
   `Secret Hitler Online is listening on port <port>.` once `start` returns.
2. **The restore waits for this start's line**, in `docker logs --since` the container's new
   `.State.StartedAt`: a restarted container's logs still hold its earlier runs' lines.
3. **The one-off container runs the container's image ID** (`{{.Image}}`), so a newer `:latest`
   pulled since makes no difference.
4. **A failed swap starts the container again.** In the one-off container every check comes
   before the old `-wal`, `-shm` and `-journal` go and the copy moves into place, so a failure
   leaves the database as it was; the restore starts the container on it and exits 1.
5. **Settings are checked before any `docker` call.** `BACKUP_DIR` is an absolute path to an
   existing directory (never created, so a mistyped path fails); `RETENTION_DAYS` and
   `STARTUP_TIMEOUT_SECONDS` are whole numbers of at least 1; an `ENV_FILE` that is set but missing
   stops the script (a missing default `devops/.env` does not). The file is read, never sourced: a
   known name's last `NAME=value` line, one pair of surrounding quotes removed, everything else
   ignored. An empty value, from either place, means the default (for `AFTER_BACKUP`, no hook).
6. **Files.** The snapshot is `<directory of DB_PATH>/.secret-hitler-backup-<ts>-<pid>.db`; the
   host's temporary files are `<BACKUP_DIR>/.secret-hitler-<ts>.db.<pid>.tmp` and
   `.secret-hitler-<ts>.db.sha256.<pid>.tmp`, hidden, so the retention never matches them;
   `<name>.db.sha256` holds `<sha256>  <name>.db` (two spaces, the base name), for `sha256sum -c`
   in the backup directory. A backup whose name is taken (two runs in one second) stops before the
   snapshot. The restore's copy is `<directory of DB_PATH>/.secret-hitler-restore-<pid>.db`.
7. **The scripts are self-contained** (either works copied alone) and run on bash 3.2 (macOS's
   `/bin/bash`: no associative arrays, `mapfile` or `${v,,}`). They exit 1 on every failure with
   `Error: …` on stderr, print progress as `==> …`, and turn `HUP`, `INT` and `TERM` into an exit,
   so the cleanup trap runs then too.
8. **The test** stubs `docker` for the refusals and failure paths (the spec allows it) and runs
   the real image for the rest. Unless `IMAGE` names one, it builds the image from the checkout
   under a tag of its own and removes the tag at the end.
9. **WAL that cannot be set within 5 s** is logged as an error, and the server runs on in its old
   journal mode: a busy file never keeps the game from starting.

## Global Constraints

- **The spec's Phase 13, verbatim.** Every task's requirements include it:

> **WAL.** At start, the server puts the database file in WAL mode (`PRAGMA journal_mode = WAL`,
> retried while the file is busy, for up to 5 s), so a backup's read never blocks a write and a write
> never fails because a backup is reading. Both connections keep their 5 s busy timeout. Without
> `DATABASE_PATH` nothing changes.
>
> **The image** installs the `sqlite3` package in its final stage (before `USER 1000:1000`).
>
> **Settings.** Both scripts read `devops/.env` (or the file named by `ENV_FILE`); a variable already
> set in the environment wins. `devops/.env` is git-ignored; `devops/.env.example` documents:
>
> | Setting | Default | Used by |
> |---|---|---|
> | `CONTAINER_NAME` | `secret-hitler-online` | both |
> | `DB_PATH` | `/data/backup.db` (the image's `DATABASE_PATH`) | both |
> | `BACKUP_DIR` | none; required | backup |
> | `RETENTION_DAYS` | `30` | backup |
> | `AFTER_BACKUP` | empty (no hook) | backup |
> | `STARTUP_TIMEOUT_SECONDS` | `120` | restore |
>
> Both need only `docker` and `sha256sum` (or `shasum -a 256`).
>
> **`devops/backup-db.sh`**, run on the host (for example nightly from cron):
>
> 1. Stops at once unless the container is running.
> 2. Inside the container: `sqlite3 -bail -cmd ".timeout 5000" "$DB_PATH" "VACUUM INTO '<tmp>'"`, a
>    temporary file beside the database. One consistent read while the server keeps writing.
> 3. Inside the container: `PRAGMA integrity_check` on the snapshot must print exactly `ok`, and its
>    SHA-256 is taken.
> 4. `docker cp` copies it to a temporary file in `BACKUP_DIR`; its SHA-256 on the host must match.
> 5. Moves it into place as `secret-hitler-<UTC timestamp, %Y%m%dT%H%M%SZ>.db` and writes
>    `<same>.db.sha256` beside it (each through a temporary file and `mv`).
> 6. Deletes `secret-hitler-*.db` and `secret-hitler-*.db.sha256` files in `BACKUP_DIR` older than
>    `RETENTION_DAYS` days, and nothing else.
> 7. If `AFTER_BACKUP` is set, runs it as `sh -c "$AFTER_BACKUP" sh <path of the new backup>`, so the
>    command gets the path as `$1`. If it fails, the script says so and exits non-zero (cron reports
>    it); the backup stays.
>
> Any failure before step 5 stops the script non-zero and leaves no backup behind. A trap removes the
> temporary files on the host and in the container (and the snapshot's `-wal` and `-shm`, if any) on
> every exit.
>
> **`devops/restore-db.sh <file>`**:
>
> 1. Refuses a file whose first 16 bytes are not `SQLite format 3\0`, and one with no `<file>.sha256`
>    or whose hash does not match it. Nothing is stopped yet.
> 2. Asks the user to type the container's name to go on; anything else stops it.
> 3. Reads the container's image (`docker inspect`) and stops the container.
> 4. In a one-off container of that image (`docker run --rm --network none --user root
>    --volumes-from <container> -v <file>:/restore/backup.db:ro <image> sh -euc …`): copies the file
>    beside the database, checks its hash again, makes it owned by uid 1000, removes the database's
>    `-wal`, `-shm` and `-journal` files, and moves the copy into place.
> 5. Starts the container and waits for the server's startup line in its logs (the server logs one
>    clear line once it listens; Phase 13 adds it if Javalin's own line will not do), failing if the
>    container exits or `STARTUP_TIMEOUT_SECONDS` pass.
>
> A restored file brings back its lobby backup too; lobbies past the 10-minute timeout are swept at
> start, as after any restart (from Phase 14, a game in one is recorded as unfinished).
>
> **Tested in CI.** `devops/tests/backup-restore.test.sh` runs against the image built from the
> branch: it starts a container with `TEST_SIGN_IN=true` and a fresh volume, keeps the server writing
> (test sign-ins, which write accounts and sessions), takes a backup while it writes and checks that
> it passes its checks, restores it and finds the same rows in every table (so tables later phases add
> are covered without changing the test),
> checks that `AFTER_BACKUP` runs with the path and that a failing hook exits non-zero, and that a
> file that is not SQLite, or whose hash does not match, is refused before the container is stopped.
> A new CI job runs it on pull requests.
>
> **Docs.** `README.md`'s hosting section and `DEVELOPMENT.md` say how to take, schedule (a generic
> cron line) and restore a backup, what `AFTER_BACKUP` is for, and that a backup kept on the same host
> does not survive losing that host.

- **The spec's constraints and anti-goals for this phase.** No new field or non-private method on
  `SecretHitlerGame` or `CpuPlayer`. No database call under a lobby's lock (the WAL step runs in
  `main` before any lobby loads). No new runtime dependency: the image gains `sqlite3` and nothing
  else. A backup that could be torn, or a restore that leaves a half-replaced database, is a
  failure even if it works. The repo is public: the scripts, `devops/.env.example`, the docs,
  commits and the PR name no real host, path, domain or service (placeholders such as
  `/path/to/backups`).
- **Files.** Creates `devops/backup-db.sh`, `devops/restore-db.sh`, `devops/.env.example`,
  `devops/tests/backup-restore.test.sh` (the three scripts executable, `#!/usr/bin/env bash`, `set
  -euo pipefail`) and two test classes; changes `Dockerfile`, `.gitignore`,
  `.github/workflows/ci.yml`, `SecretHitlerServer` and the docs (`CLAUDE.md`, `README.md`,
  `DEVELOPMENT.md`, its own section of `docs/PLAN.md`); nothing else. Phase 14A changes
  `SecretHitlerServer` at the same time (the sweep's unfinished record), so this phase adds two
  calls to `main` and puts the rest in methods of its own: the second of the two to merge resolves
  a small conflict in `main`.
- **`TEST_SIGN_IN=true`** only on the test's own `docker run`, never in the `Dockerfile` or CI's
  image job.
- **Environment.** Gradle and `npm run e2e` with Java 17 (`JAVA_HOME` pointing at an installed
  17; the Gradle wrapper cannot run on a newer JDK); `npm ci` in `frontend/` and `npx playwright install chromium firefox` once; browser
  tests with `E2E_PORT=4613`, and any "before" shots on port 4713 (none are expected: nothing on
  screen changes), since Phase 14A runs beside this phase. The shell test needs a running Docker and
  `curl`; its first run builds the image (minutes), later runs reuse the layer cache.
- **Branch and base.** A worktree named `phase-13-db-backups` on a new branch of that name, made
  fresh from `origin/development`, which holds Phase 12 (#73, squashed) and the design docs (the
  spec, the interfaces file, this plan and Phase 13's section of `docs/PLAN.md`), merged from
  their own `game-stats-design` branch. Task 0 checks it.
- **Commits.** Conventional Commits with a scope: `backend`, `docker`, `devops` (the new
  directory; Task 7 adds it to `CLAUDE.md`'s list), `ci`, `docs`, `readme`, `development`,
  `claude`, `plan`. Each test goes in the commit with its code. Tasks 1 to 7 each tick their box of
  Phase 13 in `docs/PLAN.md` in their commit; Task 1 also sets Phase 13's Progress row to `in
  progress`.

## Review Focus

1. **A container whose logs already hold the startup line.** Every restore restarts a container
   that logged the line when it last started, so a restore that reads all its logs would report
   success while the server is still starting. Expected: it returns only once this start's line is
   there. Task 5's `real_restore_brings_back_the_rows` pings the server once, with no retry, the
   moment the restore returns, and `stub_restore_swaps_and_waits` checks the `--since`.
2. **A path with a space in it, or given relative** (`./secret-hitler-….db` from the backup
   directory, a `BACKUP_DIR` such as `/path/to/sh backups`). Expected: the restore mounts the
   absolute path and finds its `.sha256`; the hook gets the whole path as `$1`. The test's temporary
   directory has a space in its name, Task 5 restores by a relative path, and Task 4's hook writes
   `$1` to a file that must hold the backup's absolute path.
3. **The developer's own `devops/.env`**, which may name the real container. Expected: the test
   never reads it, the environment beats the file, and an `ENV_FILE` that names a missing file stops
   the script. Every test case sets `ENV_FILE`; Task 4's `stub_settings_precedence` covers both
   scripts.
4. **Bad settings** (`RETENTION_DAYS` of `0`, `-1` or `30d`; `BACKUP_DIR` unset, relative or
   missing; `STARTUP_TIMEOUT_SECONDS` of `abc` or `0`). Expected: the script stops before any
   `docker` call, so the retention never deletes the backup it has just made, or anything outside
   `BACKUP_DIR`. Task 4's `stub_bad_settings_stop_first` and Task 5's
   `stub_bad_restore_settings_stop_first`.
5. **A swap that fails in the one-off container** (the mount fails, or the copy's hash differs).
   Expected: the database is untouched, the container runs again on it, and the restore exits 1
   saying nothing was replaced. Task 5's `stub_failed_swap_starts_the_old_database`.

---

### Task 0: The starting point

- [ ] **Step 1: Check the name is free:** `git fetch origin`, then `git branch --list
  phase-13-db-backups` and `git ls-remote --heads origin phase-13-db-backups` both print nothing.
  If either finds the branch, stop and ask: never reuse or reset it.
- [ ] **Step 2: Make the worktree:** a worktree named `phase-13-db-backups` on a new branch of that
  name from `origin/development` (nested under the session's worktree).
- [ ] **Step 3: Check what it holds:** `git merge-base --is-ancestor 794ac4f HEAD` exits 0 (Phase
  12's squash commit); `docs/PLAN.md` has `## Phase 13: Database backups` with its seven boxes and
  four acceptance boxes, all unticked; this plan, the spec and the interfaces file are there. If
  any of that is missing, stop and ask: the design docs' pull request (`game-stats-design`) has not
  merged yet.
- [ ] **Step 4: Check the tools:** `$JAVA_HOME/bin/java -version` says 17, `docker info` works,
  and `cd backend && ./gradlew test` passes before any change.

---

### Task 1: WAL at start

**Files:**
- Modify: `backend/src/main/java/server/SecretHitlerServer.java` (`main`; a new method in the
  Database Handling region)
- Test: `backend/src/test/java/server/DatabaseWalTest.java`

**Interfaces:**
- Produces on `SecretHitlerServer`: `static final long WAL_TIMEOUT_MS = 5000`;
  `static boolean useWriteAheadLog(String path, long timeoutMs)`: true when the file at `path`
  reads `wal` afterwards. Null or blank `path`: false, and nothing is created or logged. `main`
  calls `useWriteAheadLog(ApplicationConfig.DATABASE_PATH, WAL_TIMEOUT_MS)` after the
  `DATABASE_PATH` check and before `AccountStore.open`. Logs INFO `Database <path> is in WAL mode.`
  on success, and one ERROR `Could not put database <path> in WAL mode; it keeps its journal mode.`
  (with the cause, if any) when it gives up.
- Consumes: `getDatabaseConnection`, `storeLobbies`, `loadLobbies`, `AccountStore.open` as they are.

- [ ] **Step 1: Write the failing tests** (a `TemporaryFolder`, `dbPath()` as in
  `DatabaseBackupTest`, a root `ListAppender` for the logged lines):
  `aNewFileIsLeftInWalMode` (`useWriteAheadLog(dbPath(), 5000)` is true; a plain new connection's
  `PRAGMA journal_mode` reads `wal`); `anOlderFileTurnsToWalAndStillLoads` (copy
  `/backup-before-spectators.db`, true, `wal`, and `loadLobbies` gives `Set.of("WXYZ")`);
  `theServersConnectionsSeeWal` (afterwards `getDatabaseConnection`'s connection reads `wal` and
  `PRAGMA busy_timeout` 5000, and `AccountStore.open(dbPath()).upsertTestAccount("wal")` works);
  `aReadHeldOpenNeverBlocksTheBackup` (after WAL, a second connection with auto-commit off holds a
  `SELECT count(*) FROM backup` open; `storeLobbies` through `getDatabaseConnection` finishes in
  under 1000 ms, where a rollback journal would wait out the 5 s timeout and fail);
  `aBriefLockIsWaitedFor` (a file made by `getDatabaseConnection`, still in `delete` mode; a
  connection holds `BEGIN EXCLUSIVE` and a thread commits it after 500 ms:
  `useWriteAheadLog(path, 5000)` is true after at least 400 ms, and the file reads `wal`);
  `aLockPastTheLimitGivesUp` (the lock held throughout: `useWriteAheadLog(path, 300)` is false
  after 300 to 2000 ms, one ERROR is logged, it throws nothing, and once the lock goes
  `getDatabaseConnection` still opens the file); `noPathChangesNothing` (null and `" "`: false, the
  folder stays empty, no ERROR); `aMissingDirectoryGivesUpAtOnce` (`missing/dir/backup.db` with a
  5000 ms limit: false in under 1000 ms).
- [ ] **Step 2: Run** `cd backend && ./gradlew test --tests 'server.DatabaseWalTest'`. Expected:
  compilation fails (no `useWriteAheadLog`).
- [ ] **Step 3: Implement `useWriteAheadLog`.** Until the deadline: open a connection, set
  `PRAGMA busy_timeout = 0` on it (so this loop alone decides the wait), run `PRAGMA journal_mode
  = WAL`, and return true when it answers `wal`; on any other answer, or a `SQLiteException` whose
  primary code (`code & 0xFF`) is `SQLITE_BUSY` or `SQLITE_LOCKED`, close it, sleep 100 ms and try
  again. Any other `SQLException` gives up at once. Call it from `main` as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS, every earlier test included.
- [ ] **Step 5: Commit** `feat(backend): put the database in wal mode at start`, ticking box 1 and
  setting Phase 13's Progress row to `in progress`.

---

### Task 2: The startup line

**Files:**
- Modify: `backend/src/main/java/server/SecretHitlerServer.java` (`main`, two new methods)
- Test: `backend/src/test/java/server/StartupLineTest.java`

**Interfaces:**
- Produces on `SecretHitlerServer`: `static String startupLine(int port)` →
  `"Secret Hitler Online is listening on port " + port + "."`; `static Javalin startServer(int
  port)`: `createApp().start(port)`, then INFO `startupLine(app.port())`, then returns the app.
  `main` calls `startServer(getHerokuAssignedPort())` where it called `createApp().start(…)`.
- Produces for Task 5: the restore waits for the text `Secret Hitler Online is listening on port`.

- [ ] **Step 1: Write the failing test** `theServerSaysOnceItListens` (a root `ListAppender`
  attached first, and a `get(port, path)` like `ServerStartupTest`'s):

```java
Javalin app = SecretHitlerServer.startServer(0);
try {
    assertEquals(List.of("Secret Hitler Online is listening on port " + app.port() + "."),
            appender.list.stream().map(ILoggingEvent::getFormattedMessage)
                    .filter(m -> m.startsWith("Secret Hitler Online")).collect(Collectors.toList()));
    assertEquals(200, get(app.port(), "/ping").statusCode()); // at once, no retry
} finally {
    app.stop();
}
assertEquals("Secret Hitler Online is listening on port 8080.",
        SecretHitlerServer.startupLine(8080));
```

- [ ] **Step 2: Run** `./gradlew test --tests 'server.StartupLineTest'`. Expected: compilation
  fails (no `startServer`).
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): log one line once the server listens`, ticking box 2.

---

### Task 3: `sqlite3` in the image, and the test's harness

**Files:**
- Modify: `Dockerfile` (final stage)
- Create: `devops/tests/backup-restore.test.sh`

**Interfaces:**
- Consumes: Task 1's WAL and Task 2's line, as the real image shows them.
- Produces in the test script, for Tasks 4 and 5:
  - `REPO` (the repo root, from the script's own path); `T`, a fresh temporary directory whose name
    has a space (`mktemp -d "${TMPDIR:-/tmp}/sh backup test.XXXXXX"`), holding an empty
    `$T/empty.env`.
  - `fail <message>`; `assert_eq <expected> <actual> <what>`; `assert_has <text> <needle>`;
    `assert_lacks <text> <needle>`; `assert_file <path>`; `assert_absent <path>`;
    `assert_none <dir> <glob>` (no file in `dir` matches); `run <command…>` (sets `STATUS` and
    `OUT`, stdout and stderr together, never trips `set -e`); `sha_of <file>`;
    `check_sha <dir> <name.sha256>` (`sha256sum -c`, or `shasum -a 256 -c`, run in `dir`).
  - `ensure_image` (sets `IMAGE`; when it was unset, builds `secret-hitler-online:backup-test-$$`
    from `$REPO` and marks the tag for removal); `start_server` (a fresh volume `VOL` and container
    `C`, both named `shtest-$$-…`, run as `docker run -d --name "$C" -e TEST_SIGN_IN=true -v
    "$VOL":/data -p 127.0.0.1::8080 "$IMAGE"`, then waits up to 120 s for the startup line);
    `base_url` (from `docker port "$C" 8080/tcp`, read afresh each call, since a restart picks a
    new port); `sign_in <id>` (`curl -fsS -X POST -H 'Content-Type: application/json' --data
    '{"id":"<id>"}' "$(base_url)/auth/test-sign-in"`, which writes an account and a session);
    `db_rows <sql>` (`docker exec "$C" sqlite3 -bail -cmd '.timeout 5000' /data/backup.db <sql>`);
    `file_rows <file> <sql>` (sqlite3 in a one-off `--user root --network none` container of
    `$IMAGE`, on a copy of the file in a directory of its own); `start_writer` and `stop_writer` (a
    background loop of `sign_in w<n>` that appends each failure to `$T/writer-errors`;
    `stop_writer` fails the test if that file is not empty); `table_rows <sqlite3 runner…>`
    (every table in `sqlite_master` whose name does not start `sqlite_`, by name, each as a line
    `== <table>` followed by its rows in `.mode quote`, sorted: so `table_rows db_rows` and
    `table_rows file_rows "$file"` compare as text, and a table a later phase adds is compared
    with no change to the test).
  - An `EXIT` trap that stops the writer and removes the container, the volume, any tag
    `ensure_image` built, and `$T`.
  - `main`: unsets `CONTAINER_NAME`, `DB_PATH`, `BACKUP_DIR`, `RETENTION_DAYS`, `AFTER_BACKUP`,
    `STARTUP_TIMEOUT_SECONDS` and `ENV_FILE`; runs every `stub_*` case; fails with `needs a running
    Docker` unless `docker info` works; then `ensure_image`, `start_server` and the `real_*` cases
    in order; prints `backup-restore tests passed`. Any failure exits 1.

- [ ] **Step 1: Write the harness and the failing case:**

```bash
real_image_basics() {
  assert_eq 1000 "$(docker exec "$C" id -u)" "the image's user"
  docker exec "$C" sqlite3 --version >/dev/null || fail "no sqlite3 in the image"
  assert_has "$(docker logs "$C" 2>&1)" "Secret Hitler Online is listening on port 8080."
  assert_eq wal "$(db_rows 'PRAGMA journal_mode')" "the journal mode"
}
```

- [ ] **Step 2: Run** `bash devops/tests/backup-restore.test.sh`. Expected: FAIL with `no sqlite3
  in the image`.
- [ ] **Step 3: Install `sqlite3`** in the final stage, right after its `FROM` and so before `USER
  1000:1000`: `RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 && rm -rf
  /var/lib/apt/lists/*`.
- [ ] **Step 4: Run it again.** Expected: `backup-restore tests passed`, with nothing left behind
  (`docker ps -a`, `docker volume ls` and `docker images` show no `shtest-` or `backup-test-`).
- [ ] **Step 5: Commit** `build(docker): install sqlite3 in the image`, ticking box 3.

---

### Task 4: The backup script

**Files:**
- Create: `devops/backup-db.sh`, `devops/.env.example`
- Modify: `.gitignore` (`devops/.env`), `devops/tests/backup-restore.test.sh`

**Interfaces:**
- Consumes: Task 3's harness.
- Produces: `devops/backup-db.sh`, no arguments. The settings reader: for each of its names not
  set in the environment (`${!name+x}`), the last `NAME=value` line of `ENV_FILE` (default
  `<script's directory>/.env`), with one pair of surrounding quotes removed; then the defaults, then
  the checks of Decision 5. The timestamp is `date -u +%Y%m%dT%H%M%SZ`, taken once. Its `docker`
  calls take exactly these forms, which the stub answers:
  `inspect --format '{{.State.Running}}' "$CONTAINER_NAME"`;
  `exec "$CONTAINER_NAME" sqlite3 -bail -cmd ".timeout 5000" "$DB_PATH" "VACUUM INTO '$snap'"`;
  `exec "$CONTAINER_NAME" sqlite3 -bail "$snap" "PRAGMA integrity_check"`;
  `exec "$CONTAINER_NAME" sha256sum "$snap"`; `cp "$CONTAINER_NAME:$snap" "$host_tmp"`; and in the
  trap `exec "$CONTAINER_NAME" rm -f "$snap" "$snap-wal" "$snap-shm"`. The retention is
  `find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'secret-hitler-*.db' -o -name
  'secret-hitler-*.db.sha256' \) -mmin +$((RETENTION_DAYS * 1440)) -delete`. Messages the tests
  match: `is not running`, `Integrity check failed`, `does not match`, `already exists`,
  `AFTER_BACKUP failed`, and the setting's name for a bad setting; the last line on success is
  `Backup complete: <path>`.
- Produces in the test script: `stub_docker` (a fresh `$T/stub/docker` first on `PATH`, logging
  every call as one line to `$DOCKER_LOG`, which it empties; the knobs reset; and a fresh, empty
  `B="$T/backups"`), `docker_calls` (that log) and `docker_subcommands` (each call's first word,
  space-separated); `backup_with [NAME=value…]` (the backup through `run`, with
  `ENV_FILE="$T/empty.env"`, `CONTAINER_NAME=shtest`, `BACKUP_DIR="$B"` and then the given
  settings). The stub answers the forms above for any container name: `inspect` with
  `$STUB_RUNNING` (`true` by default; `missing` prints `No such object` and exits 1),
  `integrity_check` with `$STUB_INTEGRITY` (`ok`), `sha256sum` with the hash of `$STUB_SNAPSHOT` (a
  file that starts with the 16-byte header), `cp` by copying `$STUB_CP_FROM` (default
  `$STUB_SNAPSHOT`), the rest with exit 0; anything else prints `unexpected docker call` and exits
  99. Also `BACKUP` (the real backup's path) and `BACKUP_ROWS` (`table_rows file_rows "$BACKUP"`)
  for Task 5.
- Produces: `devops/.env.example`, each setting with its default and a line on what it does:
  `BACKUP_DIR=/path/to/backups` (an existing directory, absolute); the others commented out at
  their defaults; `AFTER_BACKUP` with `cp "$1" /path/to/another/disk/` as its example and the note
  that a backup kept only on this host is lost with it.

- [ ] **Step 1: Write the failing tests:**

```bash
stub_backup_takes_a_checked_snapshot() {
  stub_docker; mkdir "$B/old"
  old=secret-hitler-20000101T000000Z
  for f in "$old.db" "$old.db.sha256" notes.txt "$old.dump" "old/$old.db"; do
    touch -t 200001010000 "$B/$f"
  done
  touch "$B/secret-hitler-20991231T000000Z.db"                       # recent: kept
  backup_with
  assert_eq 0 "$STATUS" "exit"
  # NEW: the one other file named like ^secret-hitler-[0-9]{8}T[0-9]{6}Z\.db$
  cmp -s "$STUB_SNAPSHOT" "$NEW" || fail "the backup is not the snapshot"
  assert_eq "$(sha_of "$NEW")  $(basename "$NEW")" "$(cat "$NEW.sha256")" "the .sha256"
  assert_has "$OUT" "Backup complete: $NEW"
  assert_absent "$B/$old.db"; assert_absent "$B/$old.db.sha256"
  assert_file "$B/notes.txt"; assert_file "$B/$old.dump"; assert_file "$B/old/$old.db"
  assert_file "$B/secret-hitler-20991231T000000Z.db"
  assert_none "$B" '.secret-hitler-*'
  assert_has "$(docker_calls)" \
    "exec shtest sqlite3 -bail -cmd .timeout 5000 /data/backup.db VACUUM INTO '/data/.secret-hitler-backup-"
  assert_has "$(docker_calls)" "exec shtest rm -f /data/.secret-hitler-backup-" # with -wal, -shm
}
stub_backup_needs_a_running_container()  # STUB_RUNNING=false, then missing: exit 1,
                                         # "is not running", no "exec" call, $B empty
stub_backup_refuses_a_bad_snapshot()     # STUB_INTEGRITY='*** in database main ***': exit 1,
                                         # "Integrity check failed", no "cp", the trap's rm ran, $B empty
stub_backup_refuses_a_torn_copy()        # STUB_CP_FROM a file one byte longer: exit 1,
                                         # "does not match", $B empty (no temporary file either)
stub_bad_settings_stop_first()           # BACKUP_DIR unset, "backups" (relative), "$T/none";
                                         # RETENTION_DAYS 0, -1, 30d: each exit 1, the setting's
                                         # name in $OUT, docker_calls empty; RETENTION_DAYS=""
                                         # backs up with the default 30
stub_a_taken_name_stops_the_backup()     # a `date` stub printing 20260101T000000Z, and
                                         # secret-hitler-20260101T000000Z.db there: exit 1,
                                         # "already exists", the file unchanged, no "exec" call
stub_a_failing_hook_keeps_the_backup()   # AFTER_BACKUP='exit 3': exit 1, "AFTER_BACKUP failed",
                                         # the new .db and .db.sha256 there, check_sha passes
stub_settings_precedence()               # ENV_FILE with a comment, a blank line,
                                         # CONTAINER_NAME="from-file" and BACKUP_DIR='<$B>': the
                                         # calls name from-file; with CONTAINER_NAME=from-env in
                                         # the environment, from-env; ENV_FILE="$T/missing.env":
                                         # exit 1, docker_calls empty (Task 5 adds the restore)
stub_env_file_is_ignored()               # git -C "$REPO" check-ignore -q devops/.env succeeds,
                                         # and fails for devops/.env.example
real_backup_while_writing() {
  start_writer                                 # then wait until accounts has 20 rows
  before=$(db_rows 'SELECT count(*) FROM accounts')
  run env ENV_FILE="$T/empty.env" CONTAINER_NAME="$C" BACKUP_DIR="$T/backups" \
    HOOK_OUT="$T/hook-out" AFTER_BACKUP='printf "%s\n" "$1" > "$HOOK_OUT"' \
    "$REPO/devops/backup-db.sh"
  [ "$(db_rows 'SELECT count(*) FROM accounts')" -gt "$before" ] || fail "the writes stopped"
  assert_eq 0 "$STATUS" "exit"                 # BACKUP: the one secret-hitler-*.db in $T/backups
  assert_eq "$BACKUP" "$(cat "$T/hook-out")" "the hook's \$1"
  check_sha "$T/backups" "$(basename "$BACKUP").sha256"
  assert_eq ok "$(file_rows "$BACKUP" 'PRAGMA integrity_check')" "the backup's integrity"
  assert_eq 0 "$(file_rows "$BACKUP" 'SELECT count(*) FROM sessions
    WHERE account_id NOT IN (SELECT id FROM accounts)')" "sessions without an account"
  assert_eq "backup.db backup.db-shm backup.db-wal" \
    "$(docker exec "$C" ls -A /data | sort | xargs)" "the files in /data"
  assert_none "$T/backups" '.secret-hitler-*'
  BACKUP_ROWS=$(table_rows file_rows "$BACKUP")    # the writer keeps going, for Task 5
  assert_has "$BACKUP_ROWS" "== accounts"; assert_has "$BACKUP_ROWS" "== sessions"
}
```

- [ ] **Step 2: Run** `bash devops/tests/backup-restore.test.sh`. Expected: FAIL in
  `stub_backup_takes_a_checked_snapshot` (no `devops/backup-db.sh`).
- [ ] **Step 3: Implement `devops/backup-db.sh`** in the spec's seven steps, with Decisions 5 to 7
  and the forms in Interfaces: register each temporary file with the trap before the command that
  makes it; the `.db` moves into place first, then its `.sha256`; the hook runs after the retention.
  Write `devops/.env.example`, and add `devops/.env` to `.gitignore`.
- [ ] **Step 4: Run it again.** Expected: `backup-restore tests passed`.
- [ ] **Step 5: Commit** `feat(devops): add the database backup script`, ticking box 4.

---

### Task 5: The restore script

**Files:**
- Create: `devops/restore-db.sh`
- Modify: `devops/tests/backup-restore.test.sh`

**Interfaces:**
- Consumes: Task 2's line, Task 4's settings reader (copied, not shared), stub, `BACKUP` and
  `BACKUP_ROWS`.
- Produces: `devops/restore-db.sh <file>`, which reads the typed name from stdin. The path is
  resolved to an absolute one (`cd "$(dirname …)" && pwd -P`). The header check compares the
  first 16 bytes with `head -c 16 "$file" | cmp -s - <(printf 'SQLite format 3\000')` (checked on
  macOS's bash 3.2: a good header passes; a shorter file, or `SQLite format 3!`, fails; it is plain
  POSIX `head` and `cmp`, as on Ubuntu). The expected hash is
  the first field of `<file>.sha256`. The prompt names the file and the container and ends `Type
  the container's name to go on: `. Its `docker` calls, in order:
  `inspect --format '{{.Image}}' "$CONTAINER_NAME"`; `stop "$CONTAINER_NAME"`;
  `run --rm --network none --user root --volumes-from "$CONTAINER_NAME" -v
  "$file:/restore/backup.db:ro" "$image" sh -euc "$SWAP" sh "$DB_PATH" "$sha"`;
  `start "$CONTAINER_NAME"`; `inspect --format '{{.State.StartedAt}}' "$CONTAINER_NAME"`; then
  once a second until the deadline, `logs --since "$started" "$CONTAINER_NAME"` (done when it holds
  `Secret Hitler Online is listening on port`), and `inspect --format '{{.State.Status}}'
  "$CONTAINER_NAME"` (failing unless it is `running`, with the last 20 log lines). `SWAP`, in this
  order: copy `/restore/backup.db` to `<directory of $1>/.secret-hitler-restore-$$.db` (removed by
  its own trap on failure), its SHA-256 must equal `$2`, `chown 1000:1000` it, `rm -f "$1-wal"
  "$1-shm" "$1-journal"`, then `mv` it onto `$1`. When the `run` fails: `start "$CONTAINER_NAME"`
  and exit 1. Messages the tests match: `is not a SQLite database`, `no checksum file`, `does not
  match its checksum`, `Restore cancelled`, `No container`, `was not replaced`, `did not start`,
  and on success `Restore complete`.
- Produces in the stub: `inspect --format {{.Image}}` answers `sha256:stubimage` (exit 1 when
  `STUB_RUNNING=missing`); `stop` and `start` exit 0; `run` exits `$STUB_RUN_EXIT` (0);
  `{{.State.StartedAt}}` answers `2026-01-01T00:00:00.000000000Z`; `logs` prints `$STUB_LOGS`
  (by default a log line ending `Secret Hitler Online is listening on port 8080.`);
  `{{.State.Status}}` answers `$STUB_STATUS` (`running`). In the test script: `restore_typing
  <typed> <file> [NAME=value…]` pipes `<typed>` into the restore, run from the current directory
  with `ENV_FILE="$T/empty.env"` and the given settings, through `run` (so `STATUS` and `OUT` are
  set in the caller's shell: call it after a plain `cd`, never in a subshell).

- [ ] **Step 1: Write the failing tests:**

```bash
stub_restore_refuses_a_bad_file()   # each of: text with a matching .sha256 ("is not a SQLite
                                    # database"), a 10-byte file, a good header with no .sha256
                                    # ("no checksum file"), a .sha256 that does not match ("does
                                    # not match its checksum"): exit 1, docker_calls empty
stub_restore_needs_the_name()       # typed "nope", and no input at all (</dev/null): exit 1,
                                    # "Restore cancelled", docker_calls empty
stub_restore_needs_the_container()  # STUB_RUNNING=missing: exit 1, "No container",
                                    # docker_subcommands = "inspect"
stub_restore_swaps_and_waits() {
  stub_docker; f="$T/sub dir/secret-hitler-20260101T000000Z.db"  # a good header and its .sha256
  cd "$T"; restore_typing shtest "./sub dir/$(basename "$f")" CONTAINER_NAME=shtest; cd "$REPO"
  assert_eq 0 "$STATUS" "exit"; assert_has "$OUT" "Restore complete"
  assert_eq "inspect stop run start inspect logs" "$(docker_subcommands)" "the order"
  assert_has "$(docker_calls)" "run --rm --network none --user root --volumes-from shtest -v \
$(cd "$T/sub dir" && pwd -P)/$(basename "$f"):/restore/backup.db:ro sha256:stubimage sh -euc"
  assert_has "$(docker_calls)" "chown 1000:1000"  # and -wal, -shm, -journal and mv on that line
  assert_has "$(docker_calls)" "logs --since 2026-01-01T00:00:00.000000000Z shtest"
}
stub_failed_swap_starts_the_old_database()  # STUB_RUN_EXIT=1: exit 1, "was not replaced",
                                            # docker_subcommands = "inspect stop run start"
stub_restore_reports_a_server_that_does_not_start()
                                    # STUB_STATUS=exited, STUB_LOGS=boom: exit 1 at once, "did not
                                    # start" and "boom" in $OUT; logs without the line and
                                    # STARTUP_TIMEOUT_SECONDS=1: exit 1, "did not start", within 5 s
stub_bad_restore_settings_stop_first()      # STARTUP_TIMEOUT_SECONDS=abc, then 0: exit 1,
                                            # docker_calls empty
# stub_settings_precedence gains the restore: from-file, from-env, and a missing ENV_FILE
real_refusals_keep_it_running() {
  started=$(docker inspect --format '{{.State.StartedAt}}' "$C")
  # junk.db: "not a database" with a matching .sha256; torn.db: a copy of $BACKUP with byte 100
  # changed, beside a copy of $BACKUP's .sha256; bare.db: a copy with no .sha256
  for f in junk torn bare; do
    restore_typing "$C" "$T/$f.db" CONTAINER_NAME="$C"; assert_eq 1 "$STATUS" "$f"
  done
  restore_typing nope "$BACKUP" CONTAINER_NAME="$C"; assert_eq 1 "$STATUS" "a wrong name"
  assert_eq true "$(docker inspect --format '{{.State.Running}}' "$C")" "still running"
  assert_eq "$started" "$(docker inspect --format '{{.State.StartedAt}}' "$C")" "never restarted"
}
real_restore_brings_back_the_rows() {
  stop_writer
  [ "$(table_rows db_rows)" != "$BACKUP_ROWS" ] || fail "nothing was written after the backup"
  cd "$T/backups"; restore_typing "$C" "./$(basename "$BACKUP")" CONTAINER_NAME="$C"; cd "$REPO"
  assert_eq 0 "$STATUS" "exit"
  assert_eq OK "$(curl -fsS "$(base_url)/ping")" "the server, the moment the restore returns"
  assert_eq "$BACKUP_ROWS" "$(table_rows db_rows)" "every table's rows" # no lobby is ever made,
                                       # so `backup` has no row to count a load in at start
  assert_eq wal "$(db_rows 'PRAGMA journal_mode')" "WAL again" # a VACUUM INTO snapshot is not
  assert_eq 1000 "$(docker exec "$C" stat -c %u /data/backup.db)" "the owner"
  assert_lacks "$(docker exec "$C" ls -A /data)" ".secret-hitler-restore-"
  sign_in after-restore >/dev/null || fail "the restored file takes no writes"
}
```

- [ ] **Step 2: Run** `bash devops/tests/backup-restore.test.sh`. Expected: FAIL in
  `stub_restore_refuses_a_bad_file` (no `devops/restore-db.sh`).
- [ ] **Step 3: Implement `devops/restore-db.sh`** in the spec's five steps, with Decisions 2 to 7
  and the forms in Interfaces. Nothing before the confirmation calls `docker`.
- [ ] **Step 4: Run it again.** Expected: `backup-restore tests passed`.
- [ ] **Step 5: Commit** `feat(devops): add the database restore script`, ticking box 5.

---

### Task 6: The CI job

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `bash devops/tests/backup-restore.test.sh` with `IMAGE` set.
- Produces: a `devops` job, beside `test` and `e2e`. `image` keeps `needs: [test, e2e]`: `devops`
  is skipped on pushes, and a `needs` on a skipped job would skip `image` too. Its build cache has
  `scope=devops` on both sides, so it never evicts the `image` job's multi-platform cache.

- [ ] **Step 1: Add the job:**

```yaml
  devops:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7
      - uses: docker/setup-buildx-action@v4
      - uses: docker/build-push-action@v7
        with:
          context: .
          load: true
          tags: secret-hitler-online:backup-test
          cache-from: type=gha,scope=devops
          cache-to: type=gha,mode=max,scope=devops
      - name: Backup and restore tests
        run: bash devops/tests/backup-restore.test.sh
        env:
          IMAGE: secret-hitler-online:backup-test
```

- [ ] **Step 2: Run the job's two steps locally:** `docker buildx build --load -t
  secret-hitler-online:backup-test .`, then `IMAGE=secret-hitler-online:backup-test bash
  devops/tests/backup-restore.test.sh`. Expected: `backup-restore tests passed`, and the tag is
  still there afterwards (the test removes only tags it built). Remove it by hand. The job's first
  run on the pull request (Task 9) checks the workflow itself.
- [ ] **Step 3: Commit** `ci(ci): run the backup and restore test on pull requests`, ticking box 6.

---

### Task 7: Docs

**Files:**
- Modify: `README.md`, `DEVELOPMENT.md`, `CLAUDE.md`, `docs/PLAN.md`

- [ ] **Step 1: `README.md`.** In "Hosting your own": the run example uses `--name
  secret-hitler-online` (the scripts' default `CONTAINER_NAME`); `/data` must be on a local disk,
  not a network share, since the file is in WAL mode with `backup.db-wal` and `backup.db-shm`
  beside it, and is never copied by hand while the server runs. A new "### Backups" section: copy
  `devops/.env.example` to `devops/.env` and set `BACKUP_DIR`; `devops/backup-db.sh` and what it
  checks; a generic cron line (`0 4 * * * /path/to/Secret-Hitler-Online/devops/backup-db.sh
  >>/path/to/backup.log 2>&1`, and cron reports a non-zero exit where its mail is set up); the
  settings table; `AFTER_BACKUP` for copying each backup off the host, since a backup kept on the
  same host does not survive losing that host; `devops/restore-db.sh <file>`, typing the container's
  name, what it refuses before stopping anything, restoring between games, and that the restored
  file brings back its lobbies (those past 10 minutes are swept). "Known limits" gains `Backups stay
  on the host unless AFTER_BACKUP copies them elsewhere.`
- [ ] **Step 2: `DEVELOPMENT.md`.** "Persistence": WAL at start (the `-wal` and `-shm` files, the 5
  s retry), and the startup line. A "Backup and restore tests" section: `bash
  devops/tests/backup-restore.test.sh` needs Docker and `curl`, builds the image unless `IMAGE`
  names one, runs the stubbed cases and then a real container on a fresh volume, and removes what
  it made; trying the scripts by hand against a local container with `BACKUP_DIR` in a scratch
  directory.
- [ ] **Step 3: `CLAUDE.md`.** Layout: the backend's WAL step (`useWriteAheadLog`, 5 s) and
  startup line (`startServer`, `startupLine`); a `devops/` bullet (the two scripts, the settings
  and `devops/.env`, the test with its stubbed and real cases); the image has `sqlite3`. Commands:
  a row for the backup and restore test. Deploy: the `devops` job on pull requests; scheduling the
  backup on the home server is the user's job, outside this repo. Commits: the `devops` scope.
  Pointers: the game stats spec. Nothing names a real host, path or service.
- [ ] **Step 4: Check the docs:** every command they give runs as written (`bash -n` on the
  scripts, the test's command), and `git diff` holds no real host, path, domain or service.
- [ ] **Step 5: Commit** `docs(readme): …`, `docs(development): …` and `docs(claude): …`, the
  last ticking box 7.

---

### Task 8: Whole-branch review

- [ ] **Step 1: Review** the phase's commits with the `code-review` skill, from
  `$(git merge-base HEAD origin/development)`, against the spec's Phase 13, this plan and
  `CLAUDE.md`. Also run `bash -n` on the three
  scripts, and `shellcheck` on them if it is installed.
- [ ] **Step 2: Fix every finding**, Minor ones included, each with its test, in commits of their
  own (`fix(<scope>): …`). A finding that needs no change gets its reason in the PR's review notes.
- [ ] **Step 3: Run everything:** `cd backend && ./gradlew test`; `cd frontend && npm test -- --run
  && npm run build`; `bash devops/tests/backup-restore.test.sh`; `cd frontend && E2E_PORT=4613 npm
  run e2e -- --project=desktop`. Expected: all pass. Record the counts for the PR.

---

### Task 9: The pull request and the merge

- [ ] **Step 1: Open the PR:** push, then `gh pr create --repo jussaw/Secret-Hitler-Online --base
  development --head phase-13-db-backups --title "Phase 13: database backups"`. The body: what the
  phase adds and why (part of #31, not closing it), the decisions above, the tests and their
  counts, the review notes, and "This pull request changes nothing on screen." in place of the
  screenshots table.
- [ ] **Step 2: Bring CI to green:** every job passes, `devops` and all four Playwright projects
  included (`image` skips on pull requests). Fix what fails on the branch, test first.
- [ ] **Step 3: Tick** the first acceptance box (tests pass) once CI is green, in `docs(plan):
  tick phase 13's tests`, and push.
- [ ] **Step 4: Keep up with `development`.** Phase 13 merges before Phase 14B. If `development`
  has moved (Phase 14A or another PR merged first), `git fetch origin && git rebase
  origin/development`, resolving 14A's small conflict in `SecretHitlerServer.main` by keeping both
  phases' calls, and the docs' conflicts by keeping both sides; run Task 8's Step 3 again, `git
  push --force-with-lease`, and bring CI to green again.
- [ ] **Step 5: Tick "PR merged into `development`"** and set the Progress row to `done`, in
  `docs(plan): tick phase 13's merge into development`, the branch's last commit. Push and wait for
  green.
- [ ] **Step 6: Merge under the user's standing OK** (the manager session merges once CI is green),
  squashed with a Conventional subject:
  `gh pr merge <PR> --repo jussaw/Secret-Hitler-Online --squash --admin --match-head-commit
  <headRefOid> --subject "feat(devops): back up and restore the database (#<PR>)"`. Then check that
  the push to `development` ran CI and published the image (`gh run list --repo
  jussaw/Secret-Hitler-Online --branch development --limit 1`, the `image` job green).
- [ ] **Step 7: Report** the PR, its squashed commit and the image tag. The user's boxes (the
  nightly backup on the home server, one restore drill) stay unticked for the user.

---

## Self-review

- **Spec coverage.** WAL: Task 1. The image: Task 3. Settings and `.env`: Tasks 4 and 5. Backup
  steps 1 to 7 and the trap: Task 4. Restore steps 1 to 5: Task 5; the startup line it waits for:
  Task 2. The test against the branch's image, with every check the spec lists: Tasks 3 to 5. The CI
  job: Task 6. Docs, with the cron line, `AFTER_BACKUP`, the same-host warning and the known limit:
  Task 7. The JUnit test of WAL mode: Task 1; the restored file back in WAL mode: Task 5. Every
  table's rows compared after the restore: Tasks 3 to 5 (`table_rows`). Starting fresh from
  `development` with the design docs on it, and no `phase-13-db-backups` branch already there:
  Task 0. Merging before Phase 14B, and the small `main` conflict with 14A: Task 9.
- **Portability.** Nothing in the scripts needs more than bash 3.2 and POSIX tools (the header
  check is `head -c 16 | cmp -s -`, tried on macOS); no machine's paths are named.
- **Names.** `useWriteAheadLog`, `WAL_TIMEOUT_MS`, `startServer`, `startupLine`, the line's text,
  the temporary names, the `docker` forms and the stub's answers are the same in every task that
  uses them.
- **Review Focus.** Each line has its test in Task 4 or 5.
- **Proportion.** Code appears for the tests and the CI job; the WAL retry and the swap get their
  order in words, and the scripts are given by their steps, `docker` forms and messages. About a
  tenth of the length is the spec's section, quoted whole in Global Constraints.
