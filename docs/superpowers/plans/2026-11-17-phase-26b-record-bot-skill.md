# Phase 26B: Bot skill in the records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every game recorded from now on keeps the level of its bots (record format 2, `botSkill`
right after `hasCpu`), records already stored stay format 1 and are still served and read, and the
stats pages say "Easy bots", "Normal bots" or "Hard bots" where they say "Bots" today.

**Architecture:** `GameRecord` gains a `BotSkill botSkill` component, null exactly when no seat is a
bot's, and writes it by name after `hasCpu`; `FORMAT` becomes 2. `Lobby.handOverGame` takes the
level from the running game's bots themselves (`cpuPlayers`), never from the lobby's own choice, so
a restored game keeps the level its bots were made at. `GameStore` and `StatsRoutes` change no
code: the `format` column takes `GameRecord.FORMAT`, and every record's JSON is served as it was
stored, so a format 1 record stays format 1. On the page, `record.ts` accepts both formats and a
level is read only through `botSkillOf` (null for format 1); one label function, `botsLabel`,
writes the tag on GAMES' rows and a player's latest games and the level on the game page's header.

**Tech Stack:** Java 17, JUnit 4, Jackson, sqlite-jdbc · React 18, TypeScript 5 (ES2020), Vitest
with Testing Library, Playwright. No new dependency.

**Spec:** [`docs/superpowers/specs/2026-11-17-bot-skill-design.md`](../specs/2026-11-17-bot-skill-design.md),
"The records (Phase 26B)", "Names the phases share", Tests ("26B"), Docs and Acceptance; it wins
over everything else. The record itself: [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](../specs/2026-11-15-game-stats-design.md),
"The record" and "GAMES and the game page". The phase's boxes: `docs/PLAN.md`, "Phase 26B: Bot
skill in the records". How a record is made, stored and read today: `CLAUDE.md`'s Layout (game
records, `GameRecord`, `GameStore`, `StatsRoutes`, the contract fixture, `record.ts`, `GameRow`,
`GameHeader`, `PlayerPage`, `bigStatsData()`).

## Decisions

The spec settles what players see. These settle what it leaves to the build.

- **The record's level is a `game.BotSkill`** (25A's enum), written by its name. `GameRecord`'s
  canonical constructor refuses a level without a bot seat and a bot seat without a level
  (`IllegalArgumentException`), so format 2's rule ("the level's name when any seat was a bot, and
  `null` when none was") cannot be broken by a caller. `GameRecord.of`, the lobby's one way in,
  never throws for it: it gives `NORMAL` when a seat is a bot's and the level passed is null, and
  null when no seat is a bot's whatever was passed, so nothing the recorder does stops a game or
  loses its record (CLAUDE.md: "nothing the recorder does stops a game"); the lobby tests pin the
  real level, so such a mismatch, which only a bug could make, does not go unseen.
- **The level comes from the bots, not the lobby.** `handOverGame` reads `cpuPlayers`, the running
  game's bots, through a private `gameBotSkill()`: null with none, else the first's in name order
  (`startNewGame` makes every bot of a game at one level, so the first's is every one's; mixed
  levels cannot happen and are not checked). It never reads 26A's `Lobby.botSkill()`, the host's
  choice, which a restore puts back to Normal while the restored game's bots keep their own; a bot
  from a backup older than levels reads `NORMAL` (25A's `readObject`).
- **The page never rewrites a record.** `parseStatsData` returns its input unchanged (the stats
  shell's `bigStatsData()` test compares the response before and after parsing), so "format 1 is
  read as `null`" is `botSkillOf(record)`: the record's level for format 2, null for format 1
  whatever it holds. `botSkill` is an optional key in the type, absent from format 1. A format 2
  record must have the key: missing, or any value but null and the three names (`"hard"` included),
  is refused, and so is one whose level disagrees with `hasCpu` (null in a game with bots, or a
  level in a game without), the server's own rule, each named by its field path as any malformed
  field is.
- **Test records stay format 1.** `makeRecord`, and every builder on it (`fiveSeatGame`,
  `testGames.ts`'s `game`, `players/testStats.ts`'s `played`, …), keeps making format 1 records with
  no `botSkill` key, as every record stored before this phase is. So an existing test's game with
  bots stays one the server could have written, and its "Bots" stays honest. New tests make format 2
  with `asFormatTwo(record, skill)`.
- **The stats keep their own `BotSkill`.** `record.ts`'s `BotSkill` and `BOT_SKILLS` are separate
  from the lobby's in `src/types/commands.ts` (26A's): `record.ts` imports nothing, so the browser
  tests can use it, and the stats chunk imports nothing from the game's code. A comment beside them
  says so.
- **The words.** `botsLabel(skill)`: `"Easy bots"`, `"Normal bots"`, `"Hard bots"`, and `"Bots"`
  for no level (a format 1 record). A GAMES row's tag and a player's latest games' tag show it for
  any game with bots; a GAMES row's link name ends `· with Hard bots` (`· with Bots` for format 1).
  The game page's header adds it as the last part of its facts line (`… · board 5 L, 2 F · Hard
  bots`), only when there is a level: nothing for a format 1 record, as the spec says. Every other
  "Bots" stays: "Include games with Bots", GAMES' Bots filter and "+N with Bots, not counted" (no
  filter by level: the spec's Non-goals).
- **The tag is one badge:** `.games-row-cpu` gains `white-space: nowrap`, so "Normal bots" wraps as
  a whole, never between its words. Its look is otherwise unchanged.
- **The contract fixture's levels are labels**, as its accounts are: `RecordedGamesFixture.record`
  gives the games with bot seats (`k % 6 == 5`: games 5, 11, 17, …) `BotSkill.values()[(k / 6) %
  3]`, so Easy, Normal and Hard in turn. `CpuGames` still plays every seat with
  `new CpuPlayer(name)`, Normal.
- **`bigStatsData()`** holds both formats, as an upgraded database would: `big-001` to `big-200`
  format 1 (no `botSkill` key), `big-201` to `big-400` format 2, `botSkill` null without bots and
  otherwise `BOT_SKILLS[Math.floor(number / 42) % 3]` (the m-th CPU game, number 7m, takes the
  levels in turn by sixes, so every table size meets every level). Nothing calls its random source
  for this, so every other value it makes stays as it is, in this tree and in `development`'s.
- **The lobby tests set a level without 26A.** `RecordedGames.seatBotsAt(lobby, skill)` replaces a
  started game's bots with bots of that level (by reflection on `Lobby`'s private `cpuPlayers`, the
  one test helper that reaches inside `Lobby`), standing in for the host's choice. So the tests hold
  whether or not 26A has merged, and a new lobby's bots record `NORMAL` either way (before 26A the
  lobby makes `new CpuPlayer(name)`; after it, a new lobby's level is Normal). The merge order is
  fixed, 25D, then 26A, then 26B, so the last rebase, onto 26A, adds the test through the host's
  own `setBotSkill` (Task 9, Step 4).
- **Historical breakdowns stay as written:** `docs/superpowers/plans/2026-11-15-*.md` (the
  interfaces file's `format: 1` included) describe what those phases built.

## Global Constraints

- **Shared names, exactly as the spec's table pins them:** `game.BotSkill` (`EASY`, `NORMAL`,
  `HARD`) and `CpuPlayer(String name, BotSkill skill)`, `skill()` (25A, consumed); the record key
  `botSkill` and `GameRecord.FORMAT = 2` (this phase). Never define `Lobby.botSkill()`,
  `Lobby.setBotSkill(BotSkill)`, `set-bot-skill` or `skill` (26A's).
- **Format 2's keys, in order:** `id`, `format`, `startedAt`, `endedAt`, `outcome`, `winner`,
  `complete`, `hasCpu`, `botSkill`, `liberalPolicies`, `fascistPolicies`, `rounds`, `seats`,
  `events`. Seats and events are as in format 1. `botSkill` is `"EASY"`, `"NORMAL"`, `"HARD"` or
  `null`.
- **Storage:** the `games`, `game_seats` and `players` tables keep their columns; nothing rewrites
  a stored record; `GET /api/stats/games` serves each record's JSON as stored.
- **Copy, exactly:** `Easy bots`, `Normal bots`, `Hard bots`, `Bots`; link names
  `… · with Hard bots` and `… · with Bots`; header `… · Hard bots`; errors `Unsupported game record
  format: N`, `Malformed games response: games[i].botSkill is not a bot skill or null: <value>` and
  `Malformed games response: games[i].botSkill does not match hasCpu: <value>`.
- **Files this phase owns** (the spec's file owners): `backend/src/main/java/server/stats/`,
  `backend/src/test/java/server/stats/`, `frontend/src/stats/`, and in `Lobby.java` only
  `handOverGame` and the private `gameBotSkill()` beside it. It also edits these tests:
  `server/util/RecordedGames.java`, `LobbyRecordingTest.java`, `server/DatabaseBackupTest.java`
  (two new tests, placed after `aGameFromBeforeTheRecorderIsIncomplete`), and `frontend/e2e/stats.ts`,
  `recorder.spec.ts`, `stats-shell.spec.ts`, `stats-games.spec.ts`, `stats-game.spec.ts`.
- **Never touch** (other phases' while they run): `backend/src/main/java/game/` (`CpuPlayer.java`
  and the bot tests are the 25B to 25D phases'), `Lobby`'s fields, commands, packet, `readObject`, `startNewGame` and
  test-only `seatedBotSkills()`, `SecretHitlerServer`, `frontend/src/lobby/`, `App.tsx`,
  `src/types/commands.ts` (26A's). `gameBotSkill()` (this phase's, private) is not 26A's
  `seatedBotSkills()`: never rename either toward the other.
- **Rebase conflicts:** keep both sides in `docs/PLAN.md` (each phase keeps its own Progress row and
  boxes), `DEVELOPMENT.md`, `CLAUDE.md`, `README.md` and `Lobby.java` (26A's field, command, packet,
  `readObject`, `startNewGame` and `seatedBotSkills()` beside this phase's `handOverGame` and
  `gameBotSkill()`), then re-run the tests those files touch; a conflict in any other file: stop
  and report.
- **Download:** the game's first download (`npm run first-download`) is unchanged: nothing outside
  `src/stats/` imports what this phase adds.
- **ES2020** in code and tests; **no `e2e/` file imports `src/constants`** or anything that does.
- **Environment:** `export JAVA_HOME=<java-17-home>` (any installed Java 17
  works) for every Gradle and `npm run e2e` run; `cd frontend && npm ci` once in the worktree;
  every browser run and any jar on `E2E_PORT=4627` (another phase may use 4626 at the same time).
  Firefox does not launch on this Mac: run `firefox`, and the phone projects whose text must fit,
  in Playwright's Linux image (`DEVELOPMENT.md`, "Browser tests on Linux"). Scratch files (the
  screenshot spec, the PR body) live in the session scratchpad's `phase-26b/` folder only.
- **Known flakes outside these files:** `src/AppSwitch.test.tsx` and `prompt-close.spec.ts` under
  load, a 5px scroll in `stats-games.spec.ts`, `GameRecorderTest.aFailingDatabaseLosesNoRecord`.
  Check a failure on `development` before calling it one.
- **Branch and commits:** worktree and branch `phase-26b-record-bot-skill`, off `origin/development`
  once 25A has merged. The merge order is fixed: 25D, then 26A, then 26B. The builder's work ends
  with the pull request open and CI green (Task 9, Step 2); the rebases and the merge after it are
  the manager's to trigger (Task 9, Steps 3 to 5). Conventional Commits with a scope (`backend`,
  `frontend`, `docs`, `claude`, `readme`, `development`, `plan`), lowercase imperative, at most 72
  characters; each test in the commit with its code; each `docs/PLAN.md` box ticked in the commit
  of its work.
- **Public repo:** nothing about the home server in code, docs, commits or the PR.

## Review Focus

1. **A database that already holds format 1 records** (every deployed server, once this merges):
   GAMES, a game's page and a player's page load, the old records say "Bots" and show no level,
   and nothing refuses them. Task 2 (`reads a response holding both formats`), Task 3
   (`aFormatTwoRecordIsServedBesideAStoredFormatOneRecord`), Task 6 (GAMES' third page of
   `bigStatsData()` says "Bots").
2. **A game restored from a backup:** one written before levels comes back with Normal bots, and
   one with Hard bots keeps them, though 26A puts the lobby's own level back to Normal: each record
   names its bots' level. Task 3 (`aBotFromABackupBeforeLevelsIsRecordedNormal`,
   `aRestoredGameKeepsItsBotsLevel`).
3. **A game with bots swept unfinished** keeps its level in the `UNFINISHED` record (the sweep's
   path through `handOverGame`). Task 3 (`aSweptGameRecordsItsBotsLevel`).
4. **"Normal bots" at 320px with CI's Linux fonts,** in a GAMES row after a long result and in a
   player's latest games' ending cell: it never breaks between its words and never pushes the page
   sideways. Task 5 (`white-space: nowrap`), Task 6 (`checkStatsPage` at 320x568 in `phone-360`,
   in the Linux image).
5. **A response the page must not guess at:** a newer format (3), a level in the wrong case
   (`"hard"`), a format 2 record without `botSkill`, or one whose level disagrees with `hasCpu`:
   the page shows its load error instead of misreading. Task 2 (`refuses another format`,
   `refuses a bad level`, `refuses a level that disagrees with hasCpu`).

---

### Task 1: Start check and the "before" screenshots

**Files:**
- Modify: `docs/PLAN.md` (Phase 26B's Progress row: "in progress")
- Create (never committed): `<scratchpad>/phase-26b/pr-shots.spec.ts`
- Create: `docs/pr/phase-26b-record-bot-skill/before-{games,game}-{1600x900,412x915}.png`

- [ ] **Step 1: Check the start.** `git fetch origin`; make the worktree and branch (`git -C
  <session worktree> worktree add <session worktree>/.claude/worktrees/phase-26b-record-bot-skill
  -b phase-26b-record-bot-skill origin/development`); `npm ci` in its `frontend/`. All must hold,
  or stop and report: `backend/src/main/java/game/BotSkill.java` is an enum of `EASY`, `NORMAL`,
  `HARD`; `CpuPlayer` has `CpuPlayer(String name, BotSkill skill)` and `BotSkill skill()`;
  `Lobby.java` still keeps the game's bots in a field `cpuPlayers`; `docs/PLAN.md` has "Phase 26B:
  Bot skill in the records" with four boxes and three acceptance boxes, and this file is on the
  branch. Note whether 25D and 26A have merged (`git log origin/development --oneline`).
- [ ] **Step 2: Commit** `docs(plan): start phase 26b` (the Progress row "in progress").
- [ ] **Step 3: Write `pr-shots.spec.ts`** in the scratchpad: `test.skip(!process.env.PR_SHOTS)`;
  `PREFIX = process.env.PR_SHOTS` (`before` or `after`); `OUT` the absolute path of this worktree's
  `docs/pr/phase-26b-record-bot-skill/`; 1600x900 in `desktop`, 412x915 in `phone-412`. Its data is
  `bigStatsData()`'s players and games `big-378`, `big-385`, `big-392`, `big-399` (bots) and
  `big-400` (none), each record's format set here, so both trees stub the same games: `before`, all
  five format 1 with no `botSkill` (what `development` reads; it refuses format 2); `after`,
  `big-378` format 1, `big-385`, `big-392`, `big-399` format 2 at `EASY`, `NORMAL`, `HARD`, and
  `big-400` format 2 with `null`. Cast the data `as unknown as StatsData`, so it compiles in either
  tree. `stubStats(page, data)`, then for each page `settle(page)` and a full-page screenshot:
  `/games` → `${PREFIX}-games-${W}x${H}.png`, `/games/big-399` → `${PREFIX}-game-${W}x${H}.png`.
- [ ] **Step 4: Take the "before" shots** in the new worktree before any code changes (the branch
  is `development` there): copy the spec into `frontend/e2e/`, run `PR_SHOTS=before E2E_PORT=4627
  npx playwright test e2e/pr-shots.spec.ts --project=desktop --project=phone-412`, then delete the
  copy. Expected: 2 passed, four PNGs, each CPU row tagged "Bots" and the game page's facts ending
  in its board.
- [ ] **Step 5: Commit** `docs(docs): add phase 26b's before screenshots` (the four PNGs only).

---

### Task 2: The page reads formats 1 and 2

**Files:**
- Modify: `frontend/src/stats/record.ts`, `frontend/src/stats/testRecords.ts`
- Test: `frontend/src/stats/record.test.ts`, `frontend/src/stats/api.test.ts`

**Interfaces:**
- Produces in `record.ts`:
  ```ts
  /** Every bot level, as the server names them, easiest first. */
  export const BOT_SKILLS = ["EASY", "NORMAL", "HARD"] as const;
  export type BotSkill = (typeof BOT_SKILLS)[number];
  // GameRecord: format: 1 | 2; and after hasCpu:
  //   /** Format 2: the level of the game's bots, null without bots. Format 1 has no such key: read it through botSkillOf. */
  //   botSkill?: BotSkill | null;
  /** The level of the record's bots: null for a game without bots, and for every format 1 record. */
  export function botSkillOf(record: GameRecord): BotSkill | null;
  ```
  Beside `BOT_SKILLS` and `BotSkill`, a comment says why they are not the lobby's (from
  `src/types/commands.ts`): `record.ts` imports nothing, so the browser tests can use it, and the
  stats chunk imports nothing from the game's code.
  `parseStatsData` accepts `format` 1 or 2 and throws `Unsupported game record format: <format>`
  for any other, before any other check of that record; for format 2 it checks `botSkill` right
  after `hasCpu`: null or one of `BOT_SKILLS` (else `games[i].botSkill is not a bot skill or null`
  with the value found), then that it is a level exactly when `hasCpu` is true (else
  `games[i].botSkill does not match hasCpu` with the value found); format 1's `botSkill` is not
  read. It still returns its input unchanged.
- Produces in `testRecords.ts`: `makeRecord` stays as it is, format 1 with no `botSkill` key (as
  every record stored before this phase); `asFormatTwo(record: GameRecord, skill: BotSkill | null):
  GameRecord`, a copy in format 2 with `botSkill` right after `hasCpu`. It checks nothing, so the
  refusal tests build bad records with it.

- [ ] **Step 1: Write the failing tests** in `record.test.ts`:
  - `refuses another format` (replaces the test of format 2): format `3` throws
    `/Unsupported game record format: 3/`, format `0` throws `/Unsupported game record format: 0/`.
  Below, `bots` is `makeRecord({ hasCpu: true, seats: makeSeats([...], [1, 2, null, 4, null]) })`
  and `none` is `makeRecord()`.
  - `reads format 1, which has no level`: `makeData([bots])` parses, `parseStatsData(data)` is
    `data` (the same object), `"botSkill" in data.games[0]` is false, `botSkillOf(data.games[0])`
    is null.
  - `reads format 2 with each level or none`: `asFormatTwo(bots, skill)` for each of `"EASY"`,
    `"NORMAL"`, `"HARD"`, and `asFormatTwo(none, null)`, parse, and `botSkillOf` gives the level
    back (null for `none`).
  - `refuses a bad level`: `asFormatTwo(bots, …)` with `botSkill` `"EXPERT"` throws
    `Malformed games response: games[0].botSkill is not a bot skill or null: "EXPERT"`; `"hard"`
    throws; a format 2 record with the key deleted throws `/games\[0\]\.botSkill/`.
  - `refuses a level that disagrees with hasCpu`: `asFormatTwo(none, "HARD")` throws `Malformed
    games response: games[0].botSkill does not match hasCpu: "HARD"`, and `asFormatTwo(bots, null)`
    throws `… games[0].botSkill does not match hasCpu: null`.
  - `reads a response holding both formats`: `bots` then `asFormatTwo(bots, "HARD")` parse;
    `botSkillOf` gives `[null, "HARD"]`.
  In `api.test.ts`, `rejects a failed or malformed answer` sets the fixture copy's `format` to 3 and
  expects `Unsupported game record format: 3`. (`the builders make valid data` is unchanged and
  keeps passing: `makeRecord` is still format 1.)
- [ ] **Step 2: Run** `cd frontend && npm test -- --run src/stats/record.test.ts
  src/stats/api.test.ts`. Expected: FAIL (`botSkillOf` and `asFormatTwo` missing; format 3 not
  named; format 2 refused).
- [ ] **Step 3: Implement** the Interfaces above, and update `record.ts`'s header comment and
  `parseStatsData`'s `@throws` for both formats.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS (the fixture is still
  format 1, which the page still reads).
- [ ] **Step 5: Commit** `feat(frontend): read game records of formats 1 and 2`.

---

### Task 3: The server records format 2 with the bots' level

**Files:**
- Modify: `backend/src/main/java/server/stats/GameRecord.java`,
  `backend/src/main/java/server/util/Lobby.java` (`handOverGame` and a new private
  `gameBotSkill()` beside it), `backend/src/main/java/server/stats/GameStore.java` and
  `TimelineDiff.java` (comments only)
- Modify (test support): `backend/src/test/java/server/stats/RecordFormat.java`, `TestRecords.java`,
  `RecordedGamesFixture.java` (`record` passes a level), `backend/src/test/java/server/util/RecordedGames.java`
- Test: `backend/src/test/java/server/stats/GameRecordJsonTest.java`, `GameStoreTest.java`,
  `RecordedGamesFixtureTest.java`, `backend/src/test/java/server/util/LobbyRecordingTest.java`,
  `backend/src/test/java/server/DatabaseBackupTest.java`, `frontend/e2e/recorder.spec.ts`

**Interfaces:**
- Consumes: `game.BotSkill`, `CpuPlayer(String, BotSkill)`, `CpuPlayer.skill()`, `CpuPlayer.myName`,
  `CpuPlayer.initialize(SecretHitlerGame)`.
- Produces in `GameRecord`:
  ```java
  public record GameRecord(String id, long startedAt, long endedAt, String outcome, boolean complete,
          BotSkill botSkill, int liberalPolicies, int fascistPolicies, int rounds, List<Seat> seats,
          List<Map<String, Object>> events)
  public static final int FORMAT = 2;
  // compact constructor: IllegalArgumentException when (botSkill != null) differs from "a seat is a CPU's"
  public static GameRecord of(String id, long startedAt, long endedAt, String outcome, boolean complete,
          SecretHitlerGame game, Map<String, String> seatAccounts, BotSkill botSkill,
          List<? extends Map<String, Object>> events)   // botSkill: the level the game's bots share, or null
  // of never throws for the level: NORMAL when a seat is a CPU's and botSkill is null, null when no seat is
  ```
  `toJson` puts `"botSkill"` (the level's `name()`, or null) right after `"hasCpu"` and `FORMAT` in
  `"format"`.
- Produces in `Lobby`: `private BotSkill gameBotSkill()` (Decisions: the first of `cpuPlayers`'
  `skill()`, or null with none); `handOverGame` passes it to `GameRecord.of`.
- Produces in `RecordFormat`:
  ```java
  public static final List<String> FORMAT_1_KEYS;   // format 1's record keys, in order: no botSkill
  public static final List<String> RECORD_KEYS;     // format 2's: FORMAT_1_KEYS with "botSkill" after "hasCpu"
  public static final List<String> BOT_SKILLS = List.of("EASY", "NORMAL", "HARD"); // written out, not read from BotSkill
  public static List<String> recordKeys(int format); // IllegalArgumentException for any format but 1 and 2
  ```
- Produces in `TestRecords`: `record(String id, long endedAt, String outcome, List<GameRecord.Seat>
  seats, BotSkill botSkill)` (through the canonical constructor, so a mismatch throws); the
  four-argument `record` gives `NORMAL` when a seat is a CPU's and null otherwise;
  `driven(String id, Map<String, String> seatAccounts, BotSkill botSkill)` (through `of`), and the
  two-argument `driven` is `driven(id, seatAccounts, BotSkill.NORMAL)`.
- Produces in `RecordedGames`: `public static void seatBotsAt(Lobby lobby, BotSkill skill)`: under
  the lobby's lock, replaces each bot of the running game (`cpuPlayers`, read by reflection) with
  `new CpuPlayer(bot.myName, skill)` initialized on `lobby.game()`; a reflection failure is an
  `IllegalStateException`.
- `RecordedGamesFixture.record` gives the record `cpuSeats > 0 ? BotSkill.values()[(k / 6) % 3] :
  null` (Decisions); the class comment says so and that the levels are labels.

- [ ] **Step 1: Write the failing tests.**
  - `GameRecordJsonTest`: `theJsonHasTheSpecsFieldsInOrder` expects `RecordFormat.RECORD_KEYS`,
    `format` 2 and `botSkill` `"NORMAL"`; `eachLevelIsWrittenByItsName` (for every `BotSkill`,
    `TestRecords.record("g", 2_000_000L, GameRecord.LIBERAL_POLICIES, TestRecords.seats("acct-Ann"),
    skill)` writes `skill.name()` and `hasCpu` true); `aGameWithoutBotsWritesNull`
    (`TestRecords.seats("acct-1", …, "acct-5")`, each numbered, and null: the key is there, its value
    null, `hasCpu` false); `botSeatsNeedALevel` and
    `aLevelNeedsBotSeats` (`@Test(expected = IllegalArgumentException.class)`: CPU seats with null;
    five human seats with `HARD`, both through the constructor); `ofNeverRefusesALevel`
    (`TestRecords.driven("g", ANN_AND_BOB, null).botSkill()` is `NORMAL`, and `driven` with all five
    seats' accounts and `BotSkill.HARD` gives null); `theFormatKnowsBothKeyLists` (`recordKeys(1)` is
    `FORMAT_1_KEYS` with no `botSkill`; `recordKeys(2)` is `RECORD_KEYS`, with `botSkill` at
    `indexOf("hasCpu") + 1` and otherwise equal to format 1's; `recordKeys(3)` throws); and
    `theFormatsLevelsAreBotSkillsNames` (`BOT_SKILLS` equals the names of `BotSkill.values()` in
    order).
  - `GameStoreTest`: `seatsAreStoredForEachGame` expects `"g1|2|2000000|HITLER_EXECUTED|1"` and
    `"g2|2|…"`; `aFormatTwoRecordIsServedBesideAStoredFormatOneRecord` (a file store; a second
    connection inserts `old`, format 1, ended at 2,000,000, `has_cpu` 1, with `FORMAT_ONE_JSON`, a
    format 1 record of five CPU seats written out in the test as Phase 14B wrote it, whose keys are
    `recordKeys(1)`; then `save(TestRecords.record("new", 3_000_000L, GameRecord.HITLER_ELECTED,
    TestRecords.seats("acct-Ann"), BotSkill.HARD))` is true; `rows("SELECT id, format FROM games
    ORDER BY ended_at")` is `["old|1", "new|2"]`; `recordsJson().get(0)` equals `FORMAT_ONE_JSON`
    exactly, and `get(1)` parses with keys `RECORD_KEYS`, `format` 2, `botSkill` `"HARD"`);
    `theGamesTableKeepsItsColumns` (`SELECT name FROM pragma_table_info('games') ORDER BY cid` is
    `id`, `format`, `started_at`, `ended_at`, `outcome`, `has_cpu`, `record`).
  - `RecordedGamesFixtureTest.theFixtureIsInFormatOne` becomes `everyRecordHasItsFormatsKeys`,
    keeping its checks of the top keys, the seats' and the events': each record's keys are
    `RecordFormat.recordKeys(<its format>)` (the committed fixture is still format 1 until Task 4).
  - `LobbyRecordingTest`: `aFinishedGameHandsOverOneRecord` adds `assertNull(record.botSkill())`;
    `cpuVotesAreRecordedOneByOne` adds `assertEquals(BotSkill.NORMAL, record.botSkill())` (a new
    lobby's bots); `aGameRecordsItsBotsLevel` (for each `BotSkill`: a new lobby, `startNewGame()`,
    `RecordedGames.seatBotsAt(lobby, skill)`, `stepCpusToTheEnd(lobby)`; one more record, `hasCpu`
    true, `botSkill()` that level); `aSweptGameRecordsItsBotsLevel` (`Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN
    = 0` before `new Lobby()`, `startNewGame()`, `seatBotsAt(lobby, BotSkill.EASY)`,
    `closeIfTimedOut()` true; the record is `UNFINISHED` with `EASY`).
  - `DatabaseBackupTest`: `aBotFromABackupBeforeLevelsIsRecordedNormal` (`backup-before-recorder.db`,
    whose lobby `ABCD` holds a game with three CPU players written before levels: `load()`,
    `closeIfTimedOut()` true, one record, `hasCpu` true, `botSkill()` `NORMAL`) and
    `aRestoredGameKeepsItsBotsLevel` (`LOBBY_TIMEOUT_DURATION_IN_MIN = 0`, a new lobby,
    `startNewGame()`, `seatBotsAt(lobby, BotSkill.HARD)`, `roundTrip(lobby)`, `closeIfTimedOut()` on
    the restored lobby; its record says `HARD`).
  - `recorder.spec.ts`: `RECORD_KEYS` gains `"botSkill"` after `"hasCpu"`, and the test expects
    `record!.format` 2 and `record!.botSkill` null (seven people, no bots).
- [ ] **Step 2: Run** `cd backend && ./gradlew test --tests 'server.stats.*' --tests
  'server.util.LobbyRecordingTest' --tests 'server.DatabaseBackupTest'`. Expected: FAIL to compile
  (`botSkill()`, `seatBotsAt`, the five-argument `record`, the three-argument `driven`,
  `recordKeys`).
- [ ] **Step 3: Implement** the Interfaces above. Update the comments that name format 1 as the
  current one: `GameRecord`'s class comment and `toJson`'s, `RecordFormat`'s ("formats 1 and 2"),
  `GameRecordJsonTest`'s, `RecordedGamesFixtureTest`'s, `TimelineDiff`'s (its events are both
  formats'), and one line in `GameStore`'s class comment: a record keeps the format it was saved
  in, and `recordsJson` gives each as stored.
- [ ] **Step 4: Run** `./gradlew test`, then `cd ../frontend && E2E_PORT=4627 npx playwright test
  e2e/recorder.spec.ts --project=desktop`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): record the bots' skill in format 2 of game records`,
  ticking Phase 26B's first box ("Records are format 2 …").

---

### Task 4: The contract fixture in format 2

**Files:**
- Modify: `frontend/src/stats/fixtures/recorded-games.json` (made by the task, never by hand)
- Test: `backend/src/test/java/server/stats/RecordedGamesFixtureTest.java`,
  `frontend/src/stats/record.test.ts`

**Interfaces:**
- Consumes: Task 3's `RecordFormat.recordKeys`, `RecordFormat.BOT_SKILLS` and
  `RecordedGamesFixture`'s levels; Task 2's `botSkillOf` and `BOT_SKILLS`.

- [ ] **Step 1: Write the failing tests.** `RecordedGamesFixtureTest`: `theFixtureIsInFormatTwo`
  (every record's `format` is 2 and its `botSkill` null or one of `RecordFormat.BOT_SKILLS`);
  `theFixtureCoversTheStats` adds, per game, `botSkill != null` equals `hasCpu`, and over the games
  with bot seats the levels seen equal `Set.copyOf(RecordFormat.BOT_SKILLS)` ("Easy, Normal and Hard
  bots"). `record.test.ts`'s `parses the contract fixture` adds: every game's `format` is 2,
  `botSkillOf(game) === null` exactly when `!game.hasCpu`, and the levels seen equal
  `new Set(BOT_SKILLS)`.
- [ ] **Step 2: Run** `./gradlew test --tests 'server.stats.RecordedGamesFixtureTest'` and `npm test
  -- --run src/stats/record.test.ts`. Expected: FAIL (the fixture is format 1).
- [ ] **Step 3: Make the fixture again:** `cd backend && ./gradlew recordedGamesFixture`. Expected:
  `Wrote <62 or more> games to …/recorded-games.json.`; `git diff --stat` shows only that file.
- [ ] **Step 4: Run** `./gradlew test` and `cd ../frontend && npm test -- --run && npm run build`.
  Expected: PASS. Every fixture-based Vitest test reads new games now: one that fails on what the
  new games hold (not on the format) needs something the generator never promised. If a fresh run
  holds it with near certainty (a chaos policy among 62 games), make the fixture once more and say
  so in the PR; anything else is a real failure to fix.
- [ ] **Step 5: Commit** `test(backend): make the stats fixture again in format 2` (the generator's
  test, the JSON and `record.test.ts`), ticking the second box ("The contract fixture is made again
  …").

---

### Task 5: The level on the stats pages

**Files:**
- Modify: `frontend/src/stats/format.ts`, `games/GameRow.tsx`, `games/GamesPage.css`
  (`.games-row-cpu`), `player.ts` (`LatestGame`), `players/PlayerPage.tsx`, `game/GameHeader.tsx`
- Test: `frontend/src/stats/format.test.ts`, `games/GameRow.test.tsx`, `player.test.ts`,
  `players/PlayerPage.test.tsx`, `game/GameHeader.test.tsx`

**Interfaces:**
- Consumes: Task 2's `BotSkill`, `botSkillOf`, `asFormatTwo`.
- Produces in `format.ts`: `botsLabel(skill: BotSkill | null): string` (`"Easy bots"`, `"Normal
  bots"`, `"Hard bots"`, `"Bots"` for null).
- Produces in `player.ts`: `LatestGame.botSkill: BotSkill | null` (after `cpu`: its bots' level,
  `botSkillOf(record)`).
- `GameRow`: the tag `<span className="games-row-cpu">{botsLabel(botSkillOf(record))}</span>` for a
  game with bots, and the link's name `… · with ${botsLabel(botSkillOf(record))}`; its comment's
  "`CPU` tag" becomes the bots' tag. `PlayerPage`'s Latest games: the same tag from
  `botsLabel(game.botSkill)`. `GameHeader`: the facts line gains `botsLabel(level)` as its last
  part when `record.hasCpu` and `botSkillOf(record)` is a level. `.games-row-cpu` gains
  `white-space: nowrap`.

- [ ] **Step 1: Write the failing tests.**
  - `format.test.ts`: `botsLabel` gives `"Bots"`, `"Easy bots"`, `"Normal bots"`, `"Hard bots"` for
    `null`, `EASY`, `NORMAL`, `HARD`.
  - `GameRow.test.tsx`: new `tags a game with its bots' level`: for each level,
    `asFormatTwo(<the bots game of "tags a game with Bots…">, skill)` has the tag `^Easy bots$`,
    `^Normal bots$` or `^Hard bots$`, and at `HARD` its link is named `Sat 14 Nov 2026, 9:42 PM ·
    Fascists win · Hitler elected · with Hard bots`.
  - `GameHeader.test.tsx`: new `names the bots' level for a game with bots`:
    `asFormatTwo(fiveSeatGame([]), "HARD")`'s `p.game-facts` ends ` · board 5 L, 2 F · Hard bots`;
    `fiveSeatGame([])`'s (format 1) ends ` · board 5 L, 2 F`; `makeRecord()`'s has no `bots`.
  - `player.test.ts`: `annsLatestGames`' `toEqual` of `latest[0]` adds `botSkill: null`; new
    `latestGamesCarryTheirBotsLevel` (a newest game of Ann's with bots, `asFormatTwo(played(…),
    "HARD")`, gives `HARD`; the same game left in format 1 gives null).
  - `PlayerPage.test.tsx`: new `latestGamesNameTheirBotsLevel`: `view(1, DEFAULT_FILTER, …)` with
    the sample data plus a newest game of Ann's with bots, `asFormatTwo(…, "HARD")`, and an older
    one in format 1; their rows' `.games-row-cpu` read `/^Hard bots$/` and `/^Bots$/`.
  - **Regression guards, not failing-first tests** (they pass before and after this task; do not
    hunt for a red in them): `GameRow.test.tsx`'s `tags a game with Bots and reads an unfinished
    one` and `PlayerPage.test.tsx`'s `latestGamesLinkToTheirGames` stay exactly as they are. Their
    games are format 1 (`makeRecord`, `played`), so they must still say "Bots" and `· with Bots`.
- [ ] **Step 2: Run** `npm test -- --run src/stats/format.test.ts src/stats/games
  src/stats/player.test.ts src/stats/players src/stats/game`. Expected: the new tests and
  `annsLatestGames` FAIL; the two regression guards pass.
- [ ] **Step 3: Implement** the Interfaces above.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): name the bots' level on the stats pages`, ticking the
  third box ("GAMES rows and a player's latest games say …").

---

### Task 6: The stats browser tests

**Files:**
- Modify: `frontend/e2e/stats.ts` (`bigStatsData()`)
- Test: `frontend/e2e/stats-shell.spec.ts`, `stats-games.spec.ts`, `stats-game.spec.ts`

**Interfaces:**
- Consumes: Task 2's `BOT_SKILLS` (from `../src/stats/record`).
- `bigStatsData()` as Decisions says: `format` 1 and no `botSkill` key for `number <= 200`; `format`
  2 and `botSkill` right after `hasCpu` for the rest. Its comment says so; no `rng` call is added.

- [ ] **Step 1: Write the failing checks.**
  - `stats-shell.spec.ts`, `bigStatsData() is a valid response`: games 1 to 200 are format 1 with
    no `botSkill` key, 201 to 400 format 2; in format 2, `botSkill === null` exactly when
    `!hasCpu`; the levels of format 2's games with bots are all three of `BOT_SKILLS`.
  - `stats-games.spec.ts`, new `a game's tag names its bots' level, and an older one says Bots`
    (every project, its own viewport): `/games?per=100` (big-400 to big-301) has `.games-row-cpu`
    texts whose set is `Easy bots`, `Normal bots`, `Hard bots`, and some `a.games-row-link` named
    `/ · with (Easy|Normal|Hard) bots$/`; `/games?per=100&page=3` (big-200 to big-101) has only
    `Bots`.
  - `stats-game.spec.ts`, `the game page fits every size`: the list of games gains `withBots`, the
    format 2 game with a level with the most seats, then the most events, whose `p.game-facts`
    ends `/ · (Easy|Normal|Hard) bots$/`, checked at every size like the others.
- [ ] **Step 2: Run** `E2E_PORT=4627 npx playwright test e2e/stats-shell.spec.ts
  e2e/stats-games.spec.ts e2e/stats-game.spec.ts --project=desktop`. Expected: FAIL (every record
  is format 1 and the games have no level).
- [ ] **Step 3: Implement** `bigStatsData()`'s formats and levels.
- [ ] **Step 4: Run** every stats spec and the recorder's: `E2E_PORT=4627 npx playwright test
  e2e/stats-*.spec.ts e2e/recorder.spec.ts --project=desktop --project=phone-360
  --project=phone-412`, then `firefox`, `phone-360` and `phone-412` for `stats-*.spec.ts` in the
  Linux image against a jar on 4627 (`DEVELOPMENT.md`, "Browser tests on Linux"). Expected: PASS
  everywhere, `checkStatsPage` finding nothing at 320x568.
- [ ] **Step 5: Commit** `test(frontend): check the bots' level in the stats browser tests`.

---

### Task 7: Docs and the "after" screenshots

**Files:**
- Create: `docs/pr/phase-26b-record-bot-skill/after-{games,game}-{1600x900,412x915}.png`
- Modify: `docs/superpowers/specs/2026-11-15-game-stats-design.md`, `CLAUDE.md`, `README.md`,
  `DEVELOPMENT.md`, `docs/PLAN.md`

- [ ] **Step 1: Take the "after" shots:** the scratchpad spec copied into `frontend/e2e/`,
  `PR_SHOTS=after E2E_PORT=4627 npx playwright test e2e/pr-shots.spec.ts --project=desktop
  --project=phone-412`, then the copy deleted. Expected: GAMES' rows tagged "Hard bots", "Normal
  bots", "Easy bots" and "Bots" (`big-378`, format 1), `big-400` with none, and `big-399`'s facts
  ending "· Hard bots".
- [ ] **Step 2: The game stats design.** "The record": "Format 1:" becomes the record's formats
  (`format` `1` or `2`, 2 since Phase 26B; a record keeps the format it was saved in); a `botSkill`
  row after `hasCpu`: "Format 2: `EASY`, `NORMAL` or `HARD`, the level of the game's bots (every bot
  of a game shares one), or `null` when no seat was a bot. Format 1 has no such key, read as
  `null`." "GAMES and the game page": the row's "Bots tag" names the level ("Easy bots", "Normal
  bots", "Hard bots"; "Bots" for a format 1 record), and the game page's header the level of a
  game with bots. "PLAYERS and the player page": latest games carry the same tag.
- [ ] **Step 3: `CLAUDE.md`**, in its game records and stats sections only: `GameRecord` (its
  `botSkill`, null exactly when no seat is a bot's, which the constructor enforces, and `of`, which
  never throws for it); `handOverGame` (the level from the running game's bots, `gameBotSkill()`,
  never the lobby's choice); `GameStore` (`toJson`'s format 2 with
  `botSkill` after `hasCpu`; a record saved earlier stays format 1 and is served as stored); the
  contract fixture (its games with bot seats labelled Easy, Normal and Hard in turn, `(k / 6) % 3`,
  labels only); `RecordFormat` (both formats: `FORMAT_1_KEYS`, `RECORD_KEYS`, `recordKeys`,
  `BOT_SKILLS`); `RecordedGames.seatBotsAt`; `record.ts` (formats 1 and 2, `BOT_SKILLS` and why
  they are the stats' own, `botSkillOf`, the format error, a format 2 level that must agree with
  `hasCpu`); `testRecords.ts` (`makeRecord` still format 1, `asFormatTwo`); `format.ts` (`botsLabel`); GAMES' `GameRow` (the tag, its words, the link name,
  `white-space: nowrap`); `PlayerPage`'s Latest games (the tag of the level); `GameHeader` (the
  level after the board); `bigStatsData()` (formats by number, levels by sixes); `recorder.spec.ts`
  (format 2, `botSkill` null); and the three specs' new checks.
- [ ] **Step 4: `README.md`'s** GAMES bullet: a game with bots is tagged with their level, Easy,
  Normal or Hard (games recorded before levels say only Bots). **`DEVELOPMENT.md`'s** "The stats
  pages' fixture": its games with bot seats are labelled Easy, Normal and Hard in turn. Nothing
  names the home server.
- [ ] **Step 5: Commit** `docs(docs): add phase 26b's after screenshots`, `docs(docs): add the
  bots' level to the game stats design`, `docs(claude): describe format 2 of the game record`, `docs(readme):
  name the bots' level in games`, `docs(development): describe the fixture's bot levels`, the last
  ticking the fourth box ("The game stats design's record table and `CLAUDE.md` updated …").

---

### Task 8: Review and the full run

- [ ] **Step 1: Review.** Run the `code-review` skill against `origin/development`, with the bot
  skill design's "The records (Phase 26B)", `docs/PLAN.md`'s Phase 26B and this plan as the spec.
- [ ] **Step 2: Fix every finding,** Minor ones included, each with a test where it changes
  behaviour, in commits of their own scope; a finding that needs no change gets its reason. Keep
  the list (finding, what was done) for the PR's Review section. A fix in a file another phase
  owns (Global Constraints): ask first.
- [ ] **Step 3: Run everything:** `cd backend && ./gradlew test`; `cd frontend && npm test -- --run
  && npm run build && npm run first-download`; `E2E_PORT=4627 npm run e2e` (`desktop`,
  `phone-360`, `phone-412` on macOS); `firefox` and both phone projects in the Linux image against a
  jar on 4627. Expected: all pass, and the first download's total as on `development`; keep the
  counts for the PR.
- [ ] **Step 4: Commit** the last fix with the acceptance box "Backend and frontend unit tests pass,
  …" ticked (or `docs(plan): tick phase 26b's test box` if there was nothing to fix).

---

### Task 9: The pull request

- [ ] **Step 1: Push and open the PR.** `git push -u origin phase-26b-record-bot-skill`; `gh pr
  create --repo jussaw/Secret-Hitler-Online --base development --head phase-26b-record-bot-skill
  --title "feat(backend): record each game's bot skill and show it in the stats" --body-file
  <scratchpad>/phase-26b/pr-body.md`. The body, in order: Before and after (a table, a row per size
  and page, GAMES and the game page at 1600x900 and 412x915, "before" left, by raw URL pinned to the
  pushed head, `https://raw.githubusercontent.com/jussaw/Secret-Hitler-Online/<sha>/docs/pr/phase-26b-record-bot-skill/<file>`);
  Changes (server, page); Decisions (this plan's); Known limits (the level of a game recorded
  before this phase was never kept, so it says "Bots" for good; a rollback to a build before this
  phase serves format 2 records that its page refuses, so the stats show their load error until
  this build is back; a stats page left open across the deploy keeps the old script, which shows
  its load error for format 2 records until the page is reloaded; the fixture's levels are labels);
  Review; Tests (with counts). "Part of #72", never a closing keyword. Read it back (`gh pr view
  --json body`).
- [ ] **Step 2: Bring CI to green,** fixing on the branch and pushing until every job passes. **The
  builder's work ends here:** it hands back the PR's number, its head sha, and the PR's Review and
  Tests lists. It does not wait for another phase.
- [ ] **Step 3 (manager-triggered, after 25D merges): rebase onto it.** The manager resumes the
  builder or does it itself: `git fetch origin`, `git rebase origin/development`, conflicts as
  Global Constraints says (keep both sides in `docs/PLAN.md`, `DEVELOPMENT.md`, `CLAUDE.md`,
  `README.md` and `Lobby.java`; any other: stop and report), re-run the tests the conflicts touch
  (and `./gradlew test`, since 25D changed the bots), push with `--force-with-lease`, re-pin the
  screenshot links in the PR body to the new head, and bring CI to green again.
- [ ] **Step 4 (manager-triggered, after 26A merges): rebase onto it and add the cross-check.** The
  same rebase as Step 3, keeping 26A's `Lobby` field, command, packet, `readObject`, `startNewGame`
  and `seatedBotSkills()` beside this phase's `handOverGame` and `gameBotSkill()`. Then add
  `aGameStartedAtHardRecordsHard` to `LobbyRecordingTest`: a new lobby,
  `lobby.setBotSkill(BotSkill.HARD)` before `startNewGame()`, `stepCpusToTheEnd(lobby)`, and the
  record's `botSkill()` is `HARD`. Commit it alone, `test(backend): check a game started at hard
  records hard`, run `./gradlew test`, push with `--force-with-lease`, re-pin the links, and bring
  CI to green again.
- [ ] **Step 5 (manager-triggered): merge, only once 25D and 26A have merged and CI is green: the user gave a standing OK for these phase pull requests of #72.**
  Each part is skipped when already done: if the "PR merged into `development`" box is not ticked
  on the branch, commit `docs(plan): tick phase 26b's merge` (the box and the Progress row "done"),
  push and wait for green; if `gh pr view <n> --repo jussaw/Secret-Hitler-Online --json state` is
  not `MERGED`, run `gh pr merge <n> --squash --admin --repo jussaw/Secret-Hitler-Online
  --match-head-commit <head sha> --subject "feat(backend): record each game's bot skill and show
  it in the stats (#<n>)"`; then `gh run list --repo jussaw/Secret-Hitler-Online --branch
  development --limit 1` shows the push's run publishing `:latest`. The user's box (closing #72
  once 24 to 26B are merged) stays open.

---

## Self-review

- **Spec coverage:** format 2, `botSkill` after `hasCpu`, null without bots (Task 3); the level
  from the game's bots, Normal from an older backup (Task 3); the `games` table unchanged, format 1
  records served as stored (Task 3); `parseStatsData` for both formats and the format error (Task
  2); `RecordFormat` knows both (Task 3); the fixture made again with levels in turn (Task 4); the
  tags, the link name and the header (Task 5); the stats specs at every size (Task 6); the record
  table and `CLAUDE.md` (Task 7); the spec's Tests "26B": `GameRecordJsonTest`, `GameStoreTest`,
  `RecordFormat` and `RecordedGamesFixtureTest`, the lobby test, Vitest for `parseStatsData` and
  each tag (Tasks 2 to 5). The spec's Acceptance line "GAMES then lists it with 'Hard bots'" is
  checked once 26A is in (Task 9, Step 4's `aGameStartedAtHardRecordsHard`, and the user's game).
- **Anti-goals:** backups still load and their bots read Normal
  (`aBotFromABackupBeforeLevelsIsRecordedNormal`); no protocol change; no lobby fit at stake (the
  lobby is untouched).
- **Names:** `BotSkill`, `CpuPlayer(String, BotSkill)`, `skill()`, `botSkill`, `FORMAT = 2` as the
  spec's table; nothing named `Lobby.botSkill()` or `setBotSkill` (26A's, used only in Task 9, Step
  4); `botSkillOf`, `botsLabel`, `asFormatTwo`, `seatBotsAt`, `gameBotSkill()` (never 26A's
  test-only `seatedBotSkills()`), `recordKeys`, `FORMAT_1_KEYS` and `BOT_SKILLS` used the same way
  in every task.
