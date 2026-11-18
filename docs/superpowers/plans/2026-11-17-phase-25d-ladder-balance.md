# Phase 25D: Ladder and balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hard's amounts are tuned (and, only if the spec's two cases call for them, extra
fascist-side rules added) until `./gradlew botMatches -Pladder` passes the ladder check and the
balance check, accepted on two confirming runs pooled, so HARD can reach players (issue #72,
part 3).

**Architecture:** No new rule is needed unless the checks fail where the spec allows extra
fascist-side rules. Tuning changes `static final` amounts in `CpuPlayer`, `ClearedPlayers`,
`ChancellorHand` and `PeekMemory`, each kept above a floor so no rule is switched off. Every full
run is made on committed code and logged in a file pushed with the branch, so another session can
resume. `-Pladder` gains a tally block at the end of its report and `-Ppool` reads two reports'
blocks back, so the acceptance is worked out exactly on both confirming runs' games together.

**Tech Stack:** Java 17, Gradle 7.4.2 wrapper (a `JavaExec` task), JUnit 4.12 (no `assertThrows`).
No new dependency.

**Spec:** [`docs/superpowers/specs/2026-11-17-bot-skill-design.md`](../specs/2026-11-17-bot-skill-design.md):
"Hard's rules" (its paragraph on extra fascist-side rules), "The self-play run" (the ladder check
and the balance check), "The no-peeking test", Anti-goals, Phases and Docs. Builds on
[Phase 24](2026-11-17-phase-24-bot-fixes.md), [25A](2026-11-17-phase-25a-bot-levels.md),
[25B](2026-11-17-phase-25b-hard-reads.md) and [25C](2026-11-17-phase-25c-hard-bots.md), whose
Interfaces this plan uses by name ("From Phases 24 to 25C"). 26A and 26B merge after this phase.
Parent plan: [`docs/PLAN.md`](../../PLAN.md), Phase 25D. Where this plan and the spec differ, the
spec wins.

## From Phases 24 to 25C

Their plans' Interfaces, used here by name. "Before you start" checks that they merged as planned;
where the code differs, keep the code's names and say so in the PR.

- **24:** `BotMatches`' `Tally` (`add`, `games()`, `count(ending)`, `liberalWins()`, `static Tally
  pooled(Collection<Tally>)`), `ENDINGS`, `record Interval(double low, double high)` and
  `interval(int wins, int games)` (Wilson), `Results(String label, int gamesPerSize,
  SortedMap<Integer, Tally> bySize)` with `pooled()` and `table()`, `Options`, `parse`, `main`
  (a refused option exits with status 2); `build.gradle`'s `botMatches` task, forwarding each `-P`
  option as one argument; `CpuTurn.step`.
- **25A:** `BotSkill`; `EASY_MISTAKE_CHANCE` (set one 0.05 notch above the lowest value at which both
  Easy < Normal steps cleared); `useRandom`; `BotScenes`, `Decision`, `Twins`,
  `NoPeekingTest.everyLevelAndSeed` (each scene once per swappable pair of other seats);
  `NormalBaselineTest` and `normal-baseline.txt`, **never re-recorded to make a change pass**;
  `LadderCheck` (`Pairing`, `PAIRINGS`, `BALANCE_BAND = 10`, `Side`, `interval(Side, Tally)`,
  `clearlyAbove`, `Step` with `passes()`, `step`, `ladder`, `balanced`, `verdicts`);
  `BotMatches.ladder(int)`, `ladderReport(Map<Pairing, Results>)`, `makeBots`, `label`;
  `EasyMistakesTest`.
- **25B:** rule 1, `ClearedPlayers` (`NOMINATION_WEIGHT` 3, a `double`; `TRUSTED_SCORE` 3, the spec's
  "+3 or more", fixed); rule 2, `ChancellorHand` (`FF_DROP` and `LL_RISE`); rule 4, `PeekMemory`
  (`DROP`); `readsTheGame(game)`, `hardLiberal()`; their tests `ClearedPlayersTest`,
  `ChancellorHandTest`, `PeekMemoryTest` and `CpuPlayerSkillTest`, which read the amounts by name.
- **25C:** `ChancellorHand.FF_DROP` and `LL_RISE` and `PeekMemory.DROP` made `double`s (2.0), rules 2's
  and 4's changes going through `shiftReputation`; in `CpuPlayer`, `VOTE_DROP` 0.25, `LIBERAL_TRACKER_PUSH` 0.5f, `FASCIST_TRACKER_PULL` 0.5f,
  `CHANCELLOR_BLUFF_CHANCE` 0.35 and `PRESIDENT_BLUFF_CHANCE` 0.35 (rules 3, 6 and 7);
  `shiftReputation(name, amount)` and `score(name)` (scores carry fractions); `DeckOdds` (rule 5,
  which also scales `chancellorHandDrop`, now a `double`); `Election`, `elections()`;
  `chanceOfYes(game)`; `LadderCheck`'s six steps (Easy < Normal, Normal < Hard and Easy < Hard on
  each side); `BotScenes.secondRound`; the tests `DeckOddsTest`, `HardDeckOddsTest`,
  `HardVoteMemoryTest`, `HardTrackerTest`, `HardBluffTest`, `HardBotBackupTest` and
  `NoPeekingTest`'s rule 3, 5, 6 and 7 cases. 25C's pull request holds `-Pladder` before and after
  its rules, with their verdicts, and how long a full run took.

## Decisions

1. **Runs, passes and the acceptance.** A *full run* is `./gradlew -q botMatches -Pladder` at the
   default 2,000 games a size; an *exploration run* adds `-Pgames=500`, is free and decides nothing.
   A full run *passes* when its `Ladder check:` passes (all six steps) and its balance is within 8
   points (`Balance target: PASS`, the tuning target, which leaves the acceptance room for chance).
   The *acceptance* is the pass and its confirmation pooled (`-Ppool`, 4,000 games a size, 24,000 a
   pairing): its `Ladder check:` must pass and its `Balance check:` (the spec's 10 points) too.
   With the budgets spent, a run whose only shortfall is a balance between 8 and 10 points goes on
   to its confirmation and the acceptance, the confirmation judged at 10 points too, instead of
   stopping.
2. **The run rules,** so a pass cannot be had by re-rolling:
   - Only failing full runs count toward the budgets.
   - After a pass, one confirmation run on the same code is always allowed; it counts only if it
     fails.
   - Never two full runs on the same code, except that one confirmation and the re-run of
     Decision 3.
   - A failed confirmation, or a failed acceptance (which counts as one failing full run), needs a
     code change, with its reason in the log, before the next full run.
   - Every full run is made on committed code, and its line is in the tuning log, pushed with the
     code, before the next one starts.
3. **Easy < Normal is marginal by design** (25A sets `EASY_MISTAKE_CHANCE` one notch above its lowest
   clearing value), and 25D changes neither level. After the "before" run, if either `Easy < Normal`
   step fails, or clears by under 1 point (the gap between the two pooled intervals on its step
   line), tell the manager and wait before tuning. A full run whose only failures are `Easy <
   Normal` steps consumes no budget and is run once more on the same code; a second such failure
   in a row is stop condition 4.
4. **The amounts, their ranges and their floors.** Since 25C every tuned amount is a `double` (or
   `float`) and every score change it makes goes through `shiftReputation`, so each takes any value
   in its range: `VOTE_DROP`, `ChancellorHand.FF_DROP` and `LL_RISE` and `PeekMemory.DROP` from 0.1
   to 5; `LIBERAL_TRACKER_PUSH` and `FASCIST_TRACKER_PULL` from 0.1 to 0.9;
   `CHANCELLOR_BLUFF_CHANCE` and `PRESIDENT_BLUFF_CHANCE` from 0.10 to 0.90;
   `ClearedPlayers.NOMINATION_WEIGHT` from 1.5 to 5. `ClearedPlayers.TRUSTED_SCORE` and
   `EASY_MISTAKE_CHANCE` do not change. The floor is what keeps a rule on: a rule that only passes
   below its floor is stop condition 6.
5. **The order of the work.** (a) Tune the amounts (Task 4), at most 10 failing full runs. (b) If the
   latest failing run of (a) fails only where extra fascist-side rules can help, the spec's two
   cases (the ladder fails on the fascist side: `Fascist side, Normal < Hard` or `Fascist side, Easy
   < Hard`, pooled or at a size; or the balance fails with all-Hard liberals too far ahead), add them
   (Task 5), at most 3 rules and at most 10 more failing full runs. (c) Done at the acceptance.
6. **Stop condition.** Stop, write the stop report and wait for the manager session (which asks the
   user) as soon as any one of these holds:
   1. (a)'s 10 failing full runs are spent and the latest fails in a way extra fascist-side rules
      cannot help: a liberal-side step up to Hard (`Liberal side, Normal < Hard` or `Liberal side,
      Easy < Hard`, pooled or at a size), or the balance over 8 points with all-Hard liberals
      *behind* all-Normal.
   2. (b)'s 3 rules or 10 failing full runs are spent and a check still fails, including a failure
      after the review (Task 7) with the budget spent.
   3. Three full runs in a row each pass one check and fail the other (the checks pull against each
      other).
   4. An `Easy < Normal` step, pooled or at one size, fails in two full runs in a row (Decision 3's
      re-run included). The stop report names the remedy: raise `EASY_MISTAKE_CHANCE` one 0.05
      notch, the manager's call.
   5. Passing would need a change outside the files Global Constraints lists, a re-recorded
      `normal-baseline.txt`, or a rule that reads what the seat cannot see.
   6. A rule passes only with an amount below its floor (Decision 4).

   While stopped: no merge, no change to either check, its reading or its numbers, and no change to
   Easy, Normal or `EASY_MISTAKE_CHANCE`. The stop report holds the latest full run's whole output,
   its failing lines, the tuning log, the extra rules tried, one paragraph with the numbers on why
   the check seems out of reach, and the choices the user could make (never acted on).
7. **Pooling two runs exactly.** The printed rates are rounded, so `ladderReport` ends with a block of
   raw tallies, and `-Ppool=<report>,<report>` reads two such blocks back, adds them (24's
   `Tally.pooled`) and prints the report of the pooled games, whose verdicts are the acceptance.
8. **Resuming.** The tuning may outlast a session (25C's PR gives a full run's duration). So the
   branch is pushed and a draft PR opened before tuning starts, and the tuning log,
   `docs/pr/phase-25d-ladder-balance/tuning-log.md`, is committed and pushed with every full run:
   a new session reads it and goes on from the last line.
9. **Extra fascist-side rules** (only under Decision 5 (b)): each for the fascist side only, Hard only,
   with a `static final` amount and a floor, reading only what the bot's role reveals under the
   rules (a fascist bot knows every role; Hitler at 7 or more knows only those it investigated, so a
   rule that needs teammates is a fascist bot's alone). Candidates, in the order to try them: **groom
   Hitler** (a fascist president, before 3 fascist policies, nominates Hitler more often and passes
   him one of each when it can, so his public record shows liberal policies by the time his
   election wins); **special elections to the side** (a fascist, or Hitler that knows roles, hands
   the presidency only to its side when it can); **shoot the trusted** (a fascist executes the
   living liberal whose governments enacted the most liberal policies, a public record). Others are
   allowed under the same rules.

## Global Constraints

- **Files.** 25D changes the Hard amounts in `backend/src/main/java/game/CpuPlayer.java`,
  `ClearedPlayers.java`, `ChancellorHand.java` and `PeekMemory.java`, and any extra fascist-side
  rule in `CpuPlayer.java`; in `backend/src/test/java/game/` it changes `ClearedPlayersTest`,
  `PeekMemoryTest`, `ChancellorHandTest`, `CpuPlayerSkillTest` (named amounts only), `BotMatches`,
  `BotMatchesTest`, `LadderCheck` and `LadderCheckTest` (the pooling), `NoPeekingTest` and
  `BotScenes` (only for extra rules), and creates `HardAmountsTest` (and `HardFascistRulesTest` if
  Task 5 runs); it changes `backend/build.gradle` (one line, forwarding `-Ppool`); it creates
  `docs/pr/phase-25d-ladder-balance/tuning-log.md`; and the docs (`CLAUDE.md`'s bots section,
  `DEVELOPMENT.md`'s `botMatches` section, Phase 25D's section and Progress row in `docs/PLAN.md`).
- **Never touch** `SecretHitlerGame.java`, `game/datastructures/`, `CpuTurn.java`, `DeckOdds.java`,
  `Twins.java`, `NormalBaselineTest` and `normal-baseline.txt`, `EasyMistakesTest`,
  `EASY_MISTAKE_CHANCE`, `ClearedPlayers.TRUSTED_SCORE`, anything in `server/` and `frontend/`.
- **No peeking.** An extra rule reads only what its seat could see (25C's Global Constraints, "No
  peeking"), and gets its own no-peeking case.
- **Levels.** Only Hard changes. `NormalBaselineTest` passes unchanged at every commit.
- **Amounts** as Decision 4; tests name the constants, never their values (Task 1), and
  `HardAmountsTest` holds the ranges.
- **A bot never throws or stalls.** A full run that fails a game past 2,000 moves is a bug:
  reproduce its position from the printed timeline in a test, fix it, and run again (that run
  counts toward no budget).
- **The checks, exactly (spec):** for each side, its win rate pooled over sizes 5 to 10 rises with its
  level against Normal opponents, Easy below Normal below Hard, the two rates' 95% intervals not
  overlapping at each step; per size, a higher level's rate must not be lower with the intervals not
  overlapping; the pooled liberal win rate of all-Hard games stays within 10 percentage points of
  all-Normal's. As `LadderCheck` computes them (with 25C's Easy < Hard step), on the acceptance's
  pooled games.
- **Environment.** Java 17 from SDKMAN for every Gradle run: `export
  JAVA_HOME=<java-17-home>` (any installed Java 17: the default JDK is newer, and the Gradle
  7.4.2 wrapper does not run on it). Tests: `cd backend && ./gradlew test`. Full runs in the
  background (the Bash tool's `run_in_background`), each waited for. Full outputs and exploration
  runs live in the session scratchpad's `phase-25d/` folder; the tuning log is in the repo
  (Decision 8).
- **Branch and commits.** Worktree and branch `phase-25d-ladder-balance`, off `origin/development`
  once 25C has merged. Conventional Commits with a scope (`backend`, `docs`, `plan`, `claude`,
  `development`), lowercase imperative, at most 72 characters; each test in the commit with its
  code. Each task's last commit ticks the Phase 25D box in `docs/PLAN.md` that names its work (the
  coordinator wrote the entry: match by content; if no box names a task's work, tick none and say so
  in the PR).
- **The builder stops at green CI:** its work ends with the pull request ready and CI green, handing
  back the PR number, its head sha and the Review and Tests lists. The merge is the manager's step.
  On a rebase, keep both sides of `docs/PLAN.md` (each phase its own row and boxes),
  `DEVELOPMENT.md`, `CLAUDE.md` and `README.md`; any other conflict (`build.gradle` included): stop
  and report. The PR is squashed and says "Part of #72", never a closing keyword.
- **Public repo.** Nothing about the home server in code, docs, commits, the log or the PR.

## Review Focus

1. **A pass by luck:** a full run that clears by chance must not ship. Decisions 1 and 2: the
   confirmation and the pooled acceptance (Task 4), and `poolingAddsTheTallies` (Task 2).
2. **A tuned amount that a hard-rule test pins by its value:** the change would fail `./gradlew test`
   for the wrong reason or tempt an edit to the test. Task 1 names every amount in the tests;
   `./gradlew test` runs before every full run.
3. **A rule switched off by tuning** (a chance or drop at 0): `HardAmountsTest.everyRuleStaysOn`
   (Task 1) fails below a floor.
4. **An extra rule that peeks:** its no-peeking case in `everyLevelAndSeed` (Task 5).
5. **Easy and Normal unchanged:** `NormalBaselineTest` at every commit, and the acceptance's Easy and
   Normal rows matching the "before" run's within their intervals (Task 8's PR line).

---

### Before you start

- [ ] **Make the worktree:** `git fetch origin`, then the worktree and branch
  `phase-25d-ladder-balance` from `origin/development`, nested under the session's worktree folder.
- [ ] **Check the start point.** All must hold, or stop and tell the manager: `docs/PLAN.md`'s
  Progress table reads "done" for 24 to 25C; `grep -n "^## Phase 25D" docs/PLAN.md` finds its
  section; the spec and this plan are in `docs/superpowers/`.
- [ ] **Check the names:** `git grep -n -e "VOTE_DROP" -e "LIBERAL_TRACKER_PUSH" -e
  "FASCIST_TRACKER_PULL" -e "CHANCELLOR_BLUFF_CHANCE" -e "PRESIDENT_BLUFF_CHANCE" -e
  "shiftReputation" origin/development -- backend/src/main/java/game/CpuPlayer.java`; `git grep -n -e
  "NOMINATION_WEIGHT" -e "FF_DROP" -e "LL_RISE" -e "DROP =" origin/development --
  backend/src/main/java/game/`; `git grep -n -e "Easy < Hard\|EASY, HARD" origin/development --
  backend/src/test/java/game/LadderCheck.java`. Each must be found; a name that differs: use the
  code's and note it in `<scratchpad>/phase-25d/names.md` for the PR.
- [ ] **Budget the session:** read 25C's PR for a full run's duration `d` and its "after" table. The
  tuning may take the "before" run, up to 20 failing full runs, a confirmation per pass and
  exploration runs: if `25 × d` is more than this session can hold, plan on another session
  resuming from Task 3's draft PR and log (Decision 8). Note `d` in the log's header.

---

### Task 1: Named amounts and their floors

**Files:**
- Modify (test): `ClearedPlayersTest.java`, `PeekMemoryTest.java`, `ChancellorHandTest.java`,
  `CpuPlayerSkillTest.java` (only where they write an amount's value)
- Create (test): `backend/src/test/java/game/HardAmountsTest.java`

**Interfaces:**
- Produces: every expectation in the four tests derived from its constant (`−PeekMemory.DROP`, not
  `−2`; `ClearedPlayers.NOMINATION_WEIGHT`'s share, not 0.50); `HardAmountsTest.everyRuleStaysOn`,
  asserting Decision 4's ranges for the nine amounts it names (and each extra rule's, added in
  Task 5).

- [ ] **Step 1: Find the values written out:** in the four tests, every number that is an amount's
  value or follows from one. If 25B's tests already name them all, write so in the log and skip to
  Step 3.
- [ ] **Step 2: Name them.** Rewrite each such expectation from its constant, so a tuned amount moves
  the expectation with it; a share that follows from a weight is worked out in the test (for rule
  1's nomination over four equal seats, `w / (w + 3)` with `w = NOMINATION_WEIGHT`). Run `cd backend
  && ./gradlew test`. Expected: all pass, unchanged in number.
- [ ] **Step 3: Write `HardAmountsTest.everyRuleStaysOn`** with Decision 4's ranges (each a bound
  assertion naming the constant and its range). Run it. Expected: PASS at the starting amounts.
- [ ] **Step 4: Commit** `test(backend): name hard amounts in the hard-rule tests`.

---

### Task 2: Pooling two runs

**Files:**
- Modify (test): `backend/src/test/java/game/BotMatches.java`, `BotMatchesTest.java`, `LadderCheck.java`,
  `LadderCheckTest.java`
- Modify: `backend/build.gradle` (the `botMatches` task forwards `-Ppool` as `--pool=<value>`)

**Interfaces:**
- Produces on `BotMatches`:
  - `ladderReport` ends with the block `Tallies: <games> games at each table size`, then a line per
    pairing and size, `<label> <seats> <liberal policies> <hitler shot> <fascist policies> <hitler
    elected>` (each `ENDINGS` count, in `ENDINGS`' order, for every pairing in `PAIRINGS` order and
    seats 5 to 10).
  - `static Map<LadderCheck.Pairing, Results> readTallies(List<String> reportLines)`: the block read
    back; `IllegalArgumentException` (`No tally block in the report.` or the first line it cannot
    read) otherwise.
  - `static Map<LadderCheck.Pairing, Results> pool(Map<LadderCheck.Pairing, Results> a,
    Map<LadderCheck.Pairing, Results> b)`: each pairing's and size's tallies added
    (`Tally.pooled`), label `Pooled`, `gamesPerSize` the sum; `IllegalArgumentException` (`The two
    runs do not match.`) unless both have the same pairings and sizes.
  - `Options` gains `pool` (two paths), read from `--pool=<file>,<file>`; with it, `main` prints
    `ladderReport(pool(readTallies(a), readTallies(b)))`. `--pool` with any other option, or not two
    paths, is refused: `-Ppool takes two ladder reports: -Ppool=<file>,<file>.`
- Produces on `LadderCheck`: `static final int TUNING_BAND = 8` and, in `verdicts`, a line after
  `Balance check:`, `Balance target: PASS|FAIL (<d> points apart, target 8)`, compared in whole
  numbers as `balanced` is.

- [ ] **Step 1: Write the failing tests.** `BotMatchesTest`: `aReportsTalliesReadBack` (`readTallies`
  of `ladderReport(ladder(2))`'s lines gives every pairing's and size's four counts back);
  `poolingAddsTheTallies` (two hand-built results: each count and `games()` the sum, `gamesPerSize`
  the sum, label `Pooled`); `poolRefusesRunsThatDoNotMatch` (a pairing missing from one ⇒ the
  message); `aReportWithoutTalliesIsRefused`; `optionsReadThePool` (`--pool=a.txt,b.txt` ⇒ both
  paths; `--pool=a.txt`, `--pool=a.txt,b.txt --ladder` ⇒ the refusal). `LadderCheckTest`:
  `theTuningTargetIsEightPoints` (N/N 350 of 1,000 a size; H/H 430 ⇒ `Balance target: PASS`, 431 ⇒
  `FAIL`, while `Balance check:` passes at both).
- [ ] **Step 2: Run** `./gradlew test --tests game.BotMatchesTest --tests game.LadderCheckTest`.
  Expected: compilation fails.
- [ ] **Step 3: Implement** as in Interfaces, and the one `build.gradle` line beside 25A's.
- [ ] **Step 4: Run** `./gradlew test`, then by hand `./gradlew -q botMatches -Pladder -Pgames=20 >
  <scratchpad>/phase-25d/a.txt`, the same to `b.txt`, and `./gradlew -q botMatches
  -Ppool=<scratchpad>/phase-25d/a.txt,<scratchpad>/phase-25d/b.txt`. Expected: all pass; the pooled
  report's first line says 40 games at each table size, with its verdicts.
- [ ] **Step 5: Commit** `test(backend): pool two ladder runs for the acceptance`.

---

### Task 3: The draft PR, the log and the "before" run

**Files:**
- Create: `docs/pr/phase-25d-ladder-balance/tuning-log.md`

- [ ] **Step 1: Start the log:** a header (a full run's duration `d`, the budgets, the run rules of
  Decision 2 in one line each), then a table with a row per run: its number, `full`, `confirmation`
  or `acceptance`, the commit, every Hard amount, the seven pairings' pooled liberal rates, the six
  steps' verdicts, the balance's points apart, whether it counted toward a budget, and the reason
  for the change that follows it.
- [ ] **Step 2: Push and open a draft PR:** `git push -u origin phase-25d-ladder-balance`; `gh pr
  create --draft --repo jussaw/Secret-Hitler-Online --base development --head
  phase-25d-ladder-balance --title "feat(backend): tune hard bots to pass the ladder and balance"
  --body "Tuning in progress: docs/pr/phase-25d-ladder-balance/tuning-log.md. Part of #72."`.
- [ ] **Step 3: The "before" run,** in the background, on 25C's amounts (Tasks 1 and 2 change no
  bot): `./gradlew -q botMatches -Pladder > <scratchpad>/phase-25d/run-00-before.txt 2>&1`. It
  counts toward no budget. Log it.
- [ ] **Step 4: Check Easy < Normal** (Decision 3): if either side's `Easy < Normal` step fails, or
  its two pooled intervals are under 1 point apart, tell the manager with the two step lines and
  wait for the answer before tuning.
- [ ] **Step 5: Commit and push** `docs(docs): start phase 25d's tuning log`.

---

### Task 4: Tuning the amounts

**Files:**
- Modify: the amounts of Decision 4 in `CpuPlayer.java`, `ClearedPlayers.java`, `ChancellorHand.java`
  and `PeekMemory.java`; the tuning log; `docs/PLAN.md` (the boxes for the checks, and the one for
  extra rules when none was needed)

- [ ] **Step 1: Read the latest run:** its `Ladder check:` line, the six step lines, `Balance check:`
  and `Balance target:`. It passes (Decision 1): go to Step 4. Its only failures are `Easy <
  Normal` steps and it is the first such run in a row: run it once more on the same code (Decision
  3). Otherwise Step 2.
- [ ] **Step 2: Choose the change.** Change one amount at a time in exploration runs (`-Pgames=500`,
  to `<scratchpad>/phase-25d/explore-NN.txt`), reading the pooled rates of the pairings it moves
  (H/N for a liberal rule, N/H for a fascist one, H/H for both), within Decision 4's ranges.
  Starting directions: a liberal step up to Hard short, raise `VOTE_DROP`, `FF_DROP`,
  `PeekMemory.DROP`, `NOMINATION_WEIGHT` or `LIBERAL_TRACKER_PUSH`; a fascist step up to Hard short,
  try both directions of the bluff chances (a bluff costs the fascists a policy) and raise
  `FASCIST_TRACKER_PULL`; all-Hard liberals too far ahead, weaken the liberal amounts only while the
  liberal steps hold, or strengthen the fascist side; too far behind, the reverse.
- [ ] **Step 3: The next full run:** run `./gradlew test` (all pass, `NormalBaselineTest` and
  `HardAmountsTest` too), commit the amounts (`feat(backend): tune hard bots, run <N>`), make the
  full run in the background to `<scratchpad>/phase-25d/run-<N>.txt`, log it with the reason for
  its change, and commit and push the log (`docs(docs): log phase 25d's run <N>`). Back to Step 1.
  Follow Decision 5: once (a)'s 10 failing full runs are spent, go to Task 5 if (b) covers what
  fails, else stop (Decision 6).
- [ ] **Step 4: Confirm:** one full run on the same code to `run-<N>-confirm.txt`, logged. It passes:
  Step 5. It fails: it counts; log it, make a change with its reason (Step 2), and go on from
  Step 3.
- [ ] **Step 5: The acceptance:** `./gradlew -q botMatches
  -Ppool=<scratchpad>/phase-25d/run-<N>.txt,<scratchpad>/phase-25d/run-<N>-confirm.txt >
  <scratchpad>/phase-25d/acceptance.txt`, logged. Its `Ladder check:` and `Balance check:` pass:
  Step 6. Otherwise it counts as a failing full run: a change with its reason (Step 2), and on from
  Step 3.
- [ ] **Step 6: Commit** the log with the acceptance, ticking the boxes for the ladder and balance
  checks (and the extra-rules box with "none was needed" when Task 5 did not run), and push.

---

### Task 5: Extra fascist-side rules (only when Decision 5 (b) sends you here)

**Files:**
- Modify: `backend/src/main/java/game/CpuPlayer.java`; `NoPeekingTest.java`; `HardAmountsTest.java`;
  `BotScenes.java` (only a builder a rule's tests need)
- Create (test): `backend/src/test/java/game/HardFascistRulesTest.java`

At most three rules, one at a time, from Decision 9.

- [ ] **Step 1: Write the failing tests** for the rule in `HardFascistRulesTest`, on `BotScenes`: its
  behaviour at its amount (a share within ± 0.03 over 4,000 seeds, or an exact choice), that it
  never applies outside its window, and a Normal counterpart that decides as before. Add its range
  to `HardAmountsTest`.
- [ ] **Step 2: Extend the no-peeking test** with a twin case for the rule inside `everyLevelAndSeed`:
  the second game differing in something its seat cannot see (`swapUnseenCards`, or for Hitler at
  7 or more `swapRoles` of two seats it does not know).
- [ ] **Step 3: Run** them: they fail. **Implement** the rule. **Run** them and `./gradlew test`: all
  pass, `NormalBaselineTest` unchanged.
- [ ] **Step 4: Commit** `feat(backend): <the rule, in words>` (one commit per rule), and log the
  rule, its amount and why it was added.
- [ ] **Step 5: Tune it** as Task 4, Steps 1 to 6, against (b)'s budget. When (b)'s budget runs out
  first: stop (Decision 6). The acceptance's commit also ticks the extra-rules box.

---

### Task 6: Docs

**Files:**
- Modify: `CLAUDE.md` (the bots section, and `docs/`'s line on `pr/`); `DEVELOPMENT.md` (`botMatches`)

- [ ] **Step 1: Update `CLAUDE.md`** in the house style, beside 24's to 25C's lines: every Hard amount's
  final value and its range (Decision 4), any extra fascist-side rule and its amount, the
  acceptance's pooled numbers (each step's rates, all-Hard against all-Normal), `HardAmountsTest`,
  the tally block and `-Ppool`, `TUNING_BAND`, and that `docs/pr/phase-25d-ladder-balance/` holds
  the tuning log. Nothing about the lobby or the records, nothing about the home server.
- [ ] **Step 2: Update `DEVELOPMENT.md`'s** `botMatches` section: the tally block, `-Ppool` with an
  example, the `Balance target:` line, and how a change to the bots is accepted (a pass, its
  confirmation, the two pooled).
- [ ] **Step 3: Commit** `docs(claude): record the hard bots' tuned amounts` and `docs(development):
  describe pooling two ladder runs`.

---

### Task 7: Review

- [ ] **Step 1: Review.** Run the `code-review` skill against `origin/development`, with the spec,
  Phase 25D's section of `docs/PLAN.md` and this plan as the spec.
- [ ] **Step 2: Fix every finding,** Minor ones included, each with a test where it changes
  behaviour, in commits of their own; a finding that needs no change gets its reason. Keep the list
  for the PR's Review section. A fix in a file another phase owns: ask first.
- [ ] **Step 3: Run** `./gradlew test`. Expected: all pass, `NormalBaselineTest` unchanged; keep the
  counts.
- [ ] **Step 4: Accept again** if any fix changed a file in `backend/src/main/java/game/`: a new full
  run, its confirmation and their acceptance (Task 4, Steps 3 to 5, the run rules and budgets
  unchanged; a failure with the budget spent is stop condition 2).
- [ ] **Step 5: Commit** the last fix with the acceptance box for the tests ticked (or `docs(plan):
  tick phase 25d's test box` if there was nothing to fix), and push.

---

### Task 8: Pull request

- [ ] **Step 1: Write the body** in `<scratchpad>/phase-25d/pr-body.md`: a summary ("Part of #72");
  "This pull request changes nothing on screen." in place of the screenshot table; the amounts,
  before and after, with their ranges; extra fascist-side rules (each with its tests and effect, or
  "None were needed"); the "before" run's full output and the acceptance's (the pooled report),
  each in a code block with its verdict lines, and the pass and its confirmation named by their
  log rows; a line that the Easy and Normal rows of the "before" run and the acceptance agree within
  their intervals; the tuning log's summary (runs made, runs that counted, budgets left) with a link
  to the file; Decisions (this plan's, and every name from `names.md` that differed); Review; Tests
  (counts).
- [ ] **Step 2: Ready the PR:** `gh pr edit <n> --repo jussaw/Secret-Hitler-Online --title
  "feat(backend): tune hard bots to pass the ladder and balance" --body-file
  <scratchpad>/phase-25d/pr-body.md`; `gh pr ready <n> --repo jussaw/Secret-Hitler-Online`. Read it
  back (`gh pr view --json body`).
- [ ] **Step 3: Bring CI to green,** fixing on the branch and pushing until every job passes. If
  `development` moves while it is open, rebase as Global Constraints says, run `./gradlew test`,
  push with `--force-with-lease`; a rebase that brings a change to `game/` needs Task 7, Step 4.
  **The builder's work ends here:** hand back the PR number, its head sha, the Review list and the
  Tests list.
- [ ] **Step 4 (the manager's, with the standing OK):** if the "PR merged into `development`" box is
  not ticked on the branch, commit `docs(plan): tick phase 25d's merge` (that box and the Progress
  row "done"), push and wait for green; then `gh pr merge <n> --squash --admin --match-head-commit
  <head sha> --repo jussaw/Secret-Hitler-Online --subject "feat(backend): tune hard bots to pass the
  ladder and balance (#<n>)"`, and check that `development`'s run published the image. 26A, then
  26B, may now rebase onto `development` and merge.
