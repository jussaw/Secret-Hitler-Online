# Phase 25B: Hard bots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hard bots get the last four of Hard's rules (3, votes; 5, deck odds, which also scales rule
2's drop; 6, the election tracker; 7, fascists bluff), each with its own tests and a case in the
no-peeking test, and their amounts are tuned until `./gradlew botMatches -Pladder` passes the
ladder check and the balance check (issue #72, part 3's second half).

**Architecture:** Every rule lives in `CpuPlayer` behind the bot's level, so Easy and Normal decide
exactly as before (25A's `NormalBaselineTest` holds Normal). The deck odds are a small class of
their own, `game.DeckOdds`, that is handed only numbers a seat can see (the board's counts, the
draw pile's size and the cards the bot saw discarded), so it cannot peek. Scores stay from −5 to +5
and carry fractions where a rule scales an amount: a remainder per player beside 25A's
whole-number scores. `-Pladder` already prints both checks' verdicts (25A's `LadderCheck`); 25B adds
the one comparison the spec's per-size rule needs that 25A's steps leave out, then tunes until both
checks pass, with a stop condition written out in full.

**Tech Stack:** Java 17, Gradle 7.4.2 wrapper, JUnit 4.12 (no `assertThrows`), commons-lang3's
`SerializationUtils` in tests. No new dependency.

**Spec:** [`docs/superpowers/specs/2026-11-17-bot-skill-design.md`](../specs/2026-11-17-bot-skill-design.md):
"Hard's rules" (rules 3, 5, 6 and 7, "who runs which rule", the fractions, and the extra
fascist-side rules), "The self-play run" (the ladder check and the balance check), "The no-peeking
test", "Names the phases share" and its file owners, Anti-goals, Constraints, Phases, Tests ("25B")
and Docs. Issue #72 has the rules' first wording (its line numbers are stale). Builds on
[Phase 24](2026-11-17-phase-24-bot-fixes.md) and [Phase 25A](2026-11-17-phase-25a-bot-levels.md),
whose Interfaces this plan uses by name ("From Phases 24 and 25A"). Parent plan:
[`docs/PLAN.md`](../../PLAN.md), Phase 25B. Where this plan and the spec differ, the spec wins.

## From Phases 24 and 25A

Their plans' Interfaces, used here by name. "Before you start" checks that they merged as planned;
where the code differs, keep the code's names, make this plan's change on them, and say so in the PR.

- **24:** `CpuTurn.step(SecretHitlerGame game, Collection<CpuPlayer> cpus, Runnable afterMove)` (true
  when the bots moved the game on, `cpus` in name order); `CpuPlayer`'s pinned `serialVersionUID =
  2392054316009854878L`; `investigationTargets` and `executionTargets`; `BotMatches`' `Tally`
  (`games()`, `liberalWins()`), `record Interval(double low, double high)` and `interval(int wins,
  int games)` (Wilson, z = 1.96), `Results` (`bySize`, `pooled()`, `table()`) and `play(gamesPerSize,
  label, makeBot)`.
- **25A, in `CpuPlayer`:** `BotSkill`; `CpuPlayer(String name, BotSkill skill)`, `CpuPlayer(String
  name)` (Normal), `skill()`; `EASY_MISTAKE_CHANCE`, `mistake()` and `anyOf(List<T>)` (Easy's coin,
  drawn first at each decision, by Easy only); `void useRandom(Random)` (package-private, tests
  only); `hardLiberal()` (rule 1's gate); `readsTheGame(SecretHitlerGame game)` (Hard, and not
  `FASCIST`, and not `HITLER` at 5 or 6 seats); rule 1, `ClearedPlayers` (`NOMINATION_WEIGHT` 3,
  `TRUSTED_SCORE` 3, `vote(game, chancellorScore, known)`, empty meaning Normal votes) and
  `clearedPlayers()`; rule 2, `ChancellorHand` (`FF_DROP` 2, `LL_RISE` 2, `presidentChange(List<Policy>
  hand, int drop)`), `handReadRound` and `private int chancellorHandDrop(SecretHitlerGame game)`,
  **the one place rule 5 scales rule 2's drop**; rule 4, `PeekMemory` (`DROP` 2, `saw(List<Policy>
  cards, int drawSize)`, `List<Policy.Type> cards()`, `List<String> observe(SecretHitlerGame game,
  String self)`) and `peekMemory()`; `playerReputation` still `HashMap<String, Integer>`, changed by
  `updateReputation(String, int)`.
- **25A, in the tests:** `BotScenes` (seats `P0`, `P1`, …, `P0` the first president, every seat marked
  a bot; `game(roles)`, `board(g, fascist, liberal)`, `drawTop(g, cards)`, `swapRoles`,
  `swapUnseenCards(g, seen)`, `voteAll(g, ja)`, `elect(g, chancellor)`, `record Scene`, `bot(…,
  skill, seed)`; the builders `nomination`, `vote`, `presidentsHand`, `chancellorsHand(roles, hand,
  extra, fascist)`, `vetoAnswer`, `power`; `record Played(game, bot)` with `then(move)`, and
  `cleared`, `peeked(roles, peek, skill, seed)`); `Decision.of` (`enact L`, `pass FL`, `vote ja`, …);
  `Twins` (`of`, `Visible`, `others(move)`, `others(moveA, moveB)`, `botActs()`, `botA()`, `botB()`;
  it compares each bot's serialized memory, so a field 25B adds is compared with no change to it);
  `NoPeekingTest.everyLevelAndSeed(BiConsumer<BotSkill, Long>)` and its note on covering a new rule
  (build both games with `BotScenes`, set the hidden fact in the second, drive `Twins` through the
  moves that bring the rule into play, inside `everyLevelAndSeed`); `NormalBaselineTest` and
  `normal-baseline.txt`, **never re-recorded to make a change pass**; `LadderCheck` (`record
  Pairing(liberals, fascists)` with `label()`, `PAIRINGS` E/N, N/N, H/N, N/E, N/H, E/E, H/H,
  `BALANCE_BAND = 10`, `enum Side`, `wins(Side, Tally)`, `interval(Side, Tally)`,
  `clearlyAbove(Interval higher, Interval lower)` (`lower.high() < higher.low()`), `record Step(side,
  lower, higher, pooledClears, invertedSizes)` with `passes()`, `step(…)`, `ladder(results)`,
  `balanced(results)`, `verdicts(results)`); `BotMatches.ladder(int)`, `ladderReport(…)`,
  `makeBots`, `label`. `-Pladder` prints `Ladder check: PASS|FAIL (…)`, a line per step
  (`  Liberal side, Easy < Normal: … clears|overlaps; sizes inverted: none|…`) and `Balance check:
  PASS|FAIL (all-Hard …, all-Normal …, band 10 points)`.
- **25A's notes for 25B:** Normal's `update` judges no government of round 1 (`lastUpdatedRound`
  starts at 1), so an onlooker's judgement starts in round 2; and its president branch throws a
  `NullPointerException` if a test makes the bot's own discard for it before `update`
  (`chancellorChoices` unset), so a scene lets a bot in office act for itself.

## Decisions

1. **Who runs which rule** (the spec's paragraph). Rules 3 and 5 run for every Hard bot that reads
   the game (`readsTheGame(game)`: liberal bots, and Hitler at 7 or more). Rule 6 runs for every
   Hard bot: liberal bots one way, the fascist side (fascist bots and Hitler, at every size) the
   other. Rule 7 runs for fascist bots (`Identity.FASCIST`) only; Hitler keeps its play. Both of
   rule 7's bluffs need fewer than 3 fascist policies down (the spec's window, for the chancellor
   and the president), and, as every fascist rule there, fewer than 4 liberal ones
   (`isFascistInDanger` false).
2. **Fractional scores.** The spec lets scores carry fractions where a rule scales an amount.
   `playerReputation` keeps its type (older backups hold its `Integer`s, and every decision reads
   it), so a Hard reader keeps the fraction beside it, `reputationCarry`. `shiftReputation(name,
   amount)` adds `amount` to the whole score (`playerReputation` plus carry), clamps it to [−5, 5],
   stores `Math.round` of it in `playerReputation` and the rest in the carry; no decision path
   changes. Whole-number changes keep using `updateReputation`. `score(name)` (package-private, for
   tests) is the clamped sum. Rule 2's drop becomes a `double` (`chancellorHandDrop`,
   `ChancellorHand.presidentChange`) and goes through `shiftReputation`.
3. **Deck odds (rule 5).** A hand is three cards drawn at random from the cards the seat cannot
   place: the 17 (6 liberal, 11 fascist) less the board's policies and less the cards it saw go to
   the discard pile since the last reshuffle (its own discard as president and the card it did not
   enact as chancellor, the chancellor's discard of a pair it passed, and both cards of a veto it
   accepted). How those cards split between the draw and the rest of the discards does not change a
   hand's odds, so `getDiscardSize` adds nothing; `getDrawSize` shows a reshuffle (the draw pile
   only grows when the discards go back in), which brings the seen discards back into the pool. The
   odds of a round's hand are taken at the bot's first look at that round's legislative session,
   after 25A's `peekMemory.observe` has run in that `update`: a peek still held then
   (`peekMemory().cards()` not empty) is this hand, so its odds are known, 1 for three fascists,
   else 0. A round it never saw drawn falls back to the board less the enacted policy. The
   onlooker's −1 for a fascist policy, where Normal's `update` judges it (round 2 on), becomes
   `−(1 − P(three fascists))`; its +1 for a liberal stays whole. Rule 2's drop becomes
   `ChancellorHand.FF_DROP` times the chance the president's discarded card was liberal, given the
   two fascists the chancellor holds: `liberals / (pool − 2)`. A pool that cannot be (under 3 cards,
   or a negative count, as after an odd restore) falls back to the cards not on the board.
4. **Votes (rule 3).** A reader records an election at its first look after the vote closes (any
   state but `CHANCELLOR_NOMINATION` and `CHANCELLOR_VOTING`), once per round, from `getVotes()`,
   round 1's included. It never reads `getVotes()` while a vote is open, and never at a nomination,
   where the map still holds the last round's votes. Where the onlooker judges a government that
   enacted a fascist policy (not chaos), every other living player who voted yes, the government's
   two members and itself left out (the onlooker drop already judges them), gets
   `shiftReputation(−VOTE_DROP × (1 − P(three fascists)))`, so a forced hand blames no one and
   repeated backing adds up.
5. **The tracker (rule 6).** `chanceOfYes(game)` (package-private) is the yes probability every voting
   path already works out, rule 1's nein (`ClearedPlayers.vote` false) as 0 and its ja as 1, and
   `handleChancellorVoting` votes with it, Easy's coin still first. The refactor leaves Normal's
   decisions and random draws as they are: `NormalBaselineTest` passes unchanged. With
   `getElectionTracker() == 2`, a Hard liberal's yes on the trusting path (the curve `2t − t²`)
   becomes `p + LIBERAL_TRACKER_PUSH × (1 − p)`; the untrusted 0.05 and rule 1's ja and nein stay.
   The fascist side's yes on a government with no member it knows is on its side (itself included;
   `knownPlayerRoles` `FASCIST` or `HITLER`) becomes `p × (1 − FASCIST_TRACKER_PULL)`; the 0.99 for
   Hitler's winning election stays.
6. **Bluffs (rule 7).** A Hard fascist chancellor holding one of each card, under a president it knows
   is liberal, plays the liberal with `CHANCELLOR_BLUFF_CHANCE`. A Hard fascist president dealt two
   fascists and a liberal, with a chancellor it knows is liberal, discards a fascist (so passes one
   of each) with `PRESIDENT_BLUFF_CHANCE`. A teammate in the other office gets no bluff. A random
   number is drawn only when a bluff is possible, so no other path's draws move.
7. **The checks are 25A's `LadderCheck`**, which reads them as the spec now words them: at each pooled
   step the two rates' 95% intervals do not overlap (`clearlyAbove`); a size fails when the higher
   level's interval lies wholly below the lower's; the balance is `balanced` (all-Hard against
   all-Normal pooled liberal rates, at most `BALANCE_BAND` points apart). 25A's steps compare
   neighbours only (Easy < Normal, Normal < Hard), and the spec's per-size rule covers any higher
   level, so Task 2 adds an Easy < Hard step on each side: its pooled part follows from the other
   two, and its sizes catch an Easy clearly above Hard where Normal overlaps both.
8. **When a check fails, and when to stop.** A *full run* is `./gradlew -q botMatches -Pladder` at the
   default 2,000 games a size; only full runs decide. Exploration runs (`-Pgames=500`) are free and
   never decide. In order:
   - (a) Tune the Hard amounts (Task 8). At most 10 full runs.
   - (b) If the latest full run of (a) fails only where extra fascist-side rules can help, add them
     (Task 9), at most 3 rules and at most 10 more full runs. That is the spec's two cases: the
     ladder fails on the fascist side (`Fascist side, Normal < Hard` or `Fascist side, Easy < Hard`,
     pooled or at a size), or the balance fails with all-Hard liberals too far ahead (all-Hard's
     rate more than 10 points above all-Normal's).
   - (c) Done when two full runs in a row, with no code change between, both pass both checks.

   **Stop condition.** Stop, write the stop report and wait for the manager session (which asks the
   user) as soon as any one of these holds:
   1. (a)'s 10 full runs are spent and the latest fails in a way extra fascist-side rules cannot
      help: a liberal-side step up to Hard (`Liberal side, Normal < Hard` or `Liberal side, Easy <
      Hard`, pooled or at a size), an `Easy < Normal` step on either side, or the balance with
      all-Hard liberals more than 10 points *below* all-Normal.
   2. (b)'s 3 rules or 10 full runs are spent and a check still fails.
   3. Three full runs in a row each pass one check and fail the other (the checks pull against
      each other).
   4. An `Easy < Normal` step, pooled or at one size, fails in two full runs in a row (25B changes
      neither level, so this is not 25B's to tune).
   5. Passing would need a change outside the files Global Constraints lists, a re-recorded
      `normal-baseline.txt`, or a rule that reads what the seat cannot see.

   While stopped: no PR merge, no change to either check, its reading or its numbers, and no change
   to Easy, Normal or `EASY_MISTAKE_CHANCE`. The stop report holds the latest full run's whole
   output, its failing lines, the tuning log (each full run's amounts and verdicts), the extra rules
   tried, one paragraph with the numbers on why the check seems out of reach, and the choices the
   user could make (never acted on).
9. **Backups.** `CpuPlayer` keeps 24's pinned `serialVersionUID`. New fields that come back null from
   an older backup are filled in `readObject`, as 25A's are; new `int` and `double` fields are
   chosen so that 0 means "nothing seen yet". `DeckOdds` pins `serialVersionUID = 1L`; the nested
   record `Election` needs none (records are matched by component name). The amounts are `static
   final`, so no backup holds them. A fixture written by 25A's code (Task 1) proves a bot of every
   level, Hard ones with 25A's memories, loads under 25B's and plays its game out.

## Global Constraints

- **Files.** 25B changes `backend/src/main/java/game/CpuPlayer.java` and 25A's `ChancellorHand.java`
  (the drop becomes a `double`); creates `backend/src/main/java/game/DeckOdds.java`; in
  `backend/src/test/java/game/` creates `DeckOddsTest`, `HardDeckOddsTest`, `HardBotBackupTest`,
  `HardVoteMemoryTest`, `HardTrackerTest`, `HardBluffTest` (and `HardFascistRulesTest` if Task 9
  runs), and `backend/src/test/resources/bots-before-25b.ser`; changes 25A's `LadderCheck` and
  `LadderCheckTest` (one step), `ChancellorHandTest` (its scaled cases), `NoPeekingTest` (a case
  per rule), `BotScenes` (one builder, `secondRound`) and, only if Task 5 needs it, `Twins.Visible`;
  and the docs (`CLAUDE.md`'s bots section, `DEVELOPMENT.md`'s `botMatches` lines, Phase 25B's
  section and Progress row in `docs/PLAN.md`).
- **Never touch** `SecretHitlerGame.java` (no field, no method, not even private: the class pins no
  `serialVersionUID`), `game/datastructures/`, `CpuTurn.java`, `build.gradle`, `BotMatches.java`
  (25A's `-Pladder` already plays and prints what the checks need), `NormalBaselineTest` and
  `normal-baseline.txt`, anything in `server/` (26A owns `Lobby` and `SecretHitlerServer`'s
  command, 26B owns `server/stats/` and `Lobby.handOverGame`), and `frontend/`. 26A and 26B are
  built at the same time and merge after this phase. A change one of them needs from `CpuPlayer`
  (`skill()` stays as 25A made it): ask first.
- **No peeking.** A Hard rule reads only: the bot's own role and what it reveals under the rules
  (`knownPlayerRoles`, investigations included), its own hands, peek and investigation results, and
  what every player sees (the board's counts, `getDrawSize`, `getElectionTracker`,
  `didElectionTrackerAdvance`, nominations, offices and term limits, votes once an election closes,
  who is dead, who is a bot). Never `getPlayer(other).getIdentity()`, `isFascist()` or `isHitler()`;
  never the legislative choices outside its own office; `getPeek()` only in its own peek;
  `getVotes()` never while `CHANCELLOR_VOTING` (the page hides votes until the election closes).
- **Levels.** Only Hard runs the new rules. Normal stays Phase 24's: `NormalBaselineTest` passes
  unchanged at every commit. Easy is Normal plus 25A's coin, which stays first at each decision.
  `EASY_MISTAKE_CHANCE` does not change.
- **Amounts.** Package-private `static final` constants in `CpuPlayer`, starting at `VOTE_DROP =
  0.25`, `LIBERAL_TRACKER_PUSH = 0.5f`, `FASCIST_TRACKER_PULL = 0.5f`, `CHANCELLOR_BLUFF_CHANCE =
  0.35`, `PRESIDENT_BLUFF_CHANCE = 0.35`. Tuning may also change 25A's Hard amounts,
  `ClearedPlayers.NOMINATION_WEIGHT`, `ChancellorHand.FF_DROP` and `LL_RISE` and `PeekMemory.DROP`,
  never `ClearedPlayers.TRUSTED_SCORE` (the spec's "+3 or more"). Tests name the constants, never
  their values, so tuning edits no test. Tuning keeps every rule on: each drop, rise and push above
  0, each chance strictly between 0 and 1.
- **A bot never throws or stalls.** Every new path ends in a legal move; the odds fall back rather
  than throw. A full run that fails a game past 2,000 moves is a bug: reproduce its position from
  the printed timeline in a test, fix it, and run again (that run counts toward no budget).
- **The checks, exactly (spec):** for each side, its win rate pooled over sizes 5 to 10 rises with its
  level against Normal opponents, Easy below Normal below Hard, the two rates' 95% intervals not
  overlapping at each step; per size, a higher level's rate must not be lower with the intervals not
  overlapping; the pooled liberal win rate of all-Hard games stays within 10 percentage points of
  all-Normal's. As 25A's `LadderCheck` computes them, with Task 2's Easy < Hard step.
- **Environment.** Java 17 from SDKMAN for every Gradle run: `export
  JAVA_HOME=<java-17-home>` (any installed Java 17: the default JDK is newer, and the Gradle
  7.4.2 wrapper does not run on it). Tests: `cd backend && ./gradlew test`. A full `-Pladder` run
  takes minutes: run it in the background (the Bash tool's `run_in_background`) and wait for its
  notification. Run outputs, the tuning log and the PR body live in the session scratchpad's
  `phase-25b/` folder, never in the repo.
- **Branch and commits.** Worktree and branch `phase-25b-hard-bots`, off `origin/development` once
  25A has merged. Conventional Commits with a scope (`backend`, `plan`, `claude`, `development`),
  lowercase imperative, at most 72 characters; each test in the commit with its code. A box of
  Phase 25B in `docs/PLAN.md` is ticked in the commit that does its work. The PR is squashed
  (`gh pr merge --squash --admin`) and says "Part of #72", never a closing keyword.
- **Public repo.** Nothing about the home server in code, docs, commits or the PR.

## Review Focus

1. **A bot from a backup made before 25B** (its new fields null, its level any of the three, a Hard
   one holding 25A's cleared players or peek): it loads, remembers nothing new and plays its game
   out. Task 4 (`HardBotBackupTest`, on Task 1's fixture), extended in Task 5.
2. **A bot that sees an election late, or the last round's votes at a nomination:** it never records
   an election twice, never takes the last round's leftover votes for this round's, and never reads
   a vote still open. Task 5 (`aRoundItNeverSawIsNotTakenForTheNext`,
   `neverReadsAnElectionStillOpen`, `remembersEachElectionOnce`) and its no-peeking case.
3. **A reshuffle between two looks, or a memory that no longer fits the cards off the board:** the
   odds forget the seen discards, never count a card twice and never throw. Task 3
   (`aReshuffleBringsSeenDiscardsBack`, `aPoolThatCannotBeFallsBackToTheCardsOffTheBoard`).
4. **A Hard rule overriding a safer decision:** rule 6 turning rule 1's nein into a yes, or a bluff
   once the liberals have four policies. Task 6 (`rule1sNeinStandsAtTwo`), Task 7
   (`noBluffOnceTheLiberalsHaveFour`).
5. **Easy and Normal unchanged:** `NormalBaselineTest` at every commit, a Normal (and, where it decides,
   Easy) case in every rule task, and the after table's Easy and Normal rows matching the before
   table's within their intervals (Task 12's PR line; a difference beyond them is a bug to find
   first).

---

### Before you start

- [ ] **Check the start point.** `git fetch origin`, then make the worktree and branch
  `phase-25b-hard-bots` from `origin/development`. All must hold, or stop and tell the manager:
  `docs/PLAN.md`'s Progress table reads "done" for 24 and 25A; `grep -n "^## Phase 25B: Hard bots"
  docs/PLAN.md` finds the section with five deliverable boxes; the spec and this plan are in
  `docs/superpowers/`.
- [ ] **Check 25A's names:** `git grep -n -e "void useRandom" -e "boolean readsTheGame" -e "boolean
  hardLiberal" -e "chancellorHandDrop" origin/development -- backend/src/main/java/game/CpuPlayer.java`;
  `git grep -n -e "class PeekMemory" -e "List<Policy.Type> cards" -e "class ChancellorHand"
  origin/development -- backend/src/main/java/game/`; `git grep -n -e "class LadderCheck" -e
  "static List<Step> ladder" -e "everyLevelAndSeed" -e "record Played" origin/development --
  backend/src/test/java/game/`; `git cat-file -e
  origin/development:backend/src/test/resources/normal-baseline.txt`. Each must be found. A name
  that differs from "From Phases 24 and 25A": use the code's and note it in
  `<scratchpad>/phase-25b/names.md` for the PR. If `LadderCheck` reads the checks other than as
  Decision 7 says, stop and ask.

---

### Task 1: Start, and bots from before 25B

**Files:**
- Modify: `docs/PLAN.md` (Phase 25B's Progress row)
- Create: `backend/src/test/resources/bots-before-25b.ser`
- Create (never committed): `<scratchpad>/phase-25b/fixture/WriteOlderBots.java`

**Interfaces:**
- Produces: the resource `/bots-before-25b.ser`, one `Object[] { SecretHitlerGame game,
  ArrayList<CpuPlayer> bots }` written with `ObjectOutputStream` by 25A's classes: seven seats `Bot
  1` to `Bot 7`, levels by seat EASY, NORMAL, HARD, EASY, NORMAL, HARD, EASY, the bots in name
  order, the game unfinished at round 5 or later.

- [ ] **Step 1: Commit** `docs(plan): start phase 25b`: the Progress row reads "in progress" (and,
  if `git cat-file -e origin/development:docs/superpowers/plans/2026-11-17-phase-25b-hard-bots.md`
  fails, this file is added in the same commit).
- [ ] **Step 2: Write the generator** in the default package, public API only: make the game and the
  bots as in Interfaces (`new CpuPlayer(name, skill)`, `initialize(game)`, a `TreeSet`), call
  `CpuTurn.step(game, bots, () -> {})` until `game.getRound() >= 5`, start over with a new game if
  `game.getState()` shows it finished first, then write the file named by `args[0]` and print the
  round and each bot's level.
- [ ] **Step 3: Run it on 25A's classes**, before any change: `cd backend && ./gradlew testClasses`;
  `javac -cp build/classes/java/main -d <scratchpad>/phase-25b/fixture/out
  <scratchpad>/phase-25b/fixture/WriteOlderBots.java`; `java -cp
  build/classes/java/main:<scratchpad>/phase-25b/fixture/out WriteOlderBots
  src/test/resources/bots-before-25b.ser`. Expected: a round of 5 or more and the seven levels
  printed; the file a few KB.
- [ ] **Step 4: Commit** `test(backend): keep bots from before phase 25b` (the `.ser` only).

---

### Task 2: Easy against Hard at every size, and the "before" table

**Files:**
- Modify (test): `backend/src/test/java/game/LadderCheck.java`, `LadderCheckTest.java`

**Interfaces:**
- Consumes: 25A's `LadderCheck` and 24's `Results`, `Tally`, `interval`.
- Produces: `LadderCheck.ladder(results)` returns, for each side, Easy < Normal, Normal < Hard and
  **Easy < Hard** (`step(side, EASY, HARD, results)`, through 25A's own `step`, on the pairings
  E/N and H/N for the liberal side and N/E and N/H for the fascist side); `verdicts` prints its
  line (`  Liberal side, Easy < Hard: …`) as it prints the others. Nothing else in `LadderCheck`,
  and nothing in `BotMatches`, changes.

- [ ] **Step 1: Write the failing test** in `LadderCheckTest`, on `Results` built by hand as 25A's
  tests build them (1,000 games a size): `easyClearlyAboveHardAtASizeFailsTheLadder` (liberal wins
  E/N 300, N/N 400, H/N 500 at every size but 7, where they are 450, 400 and 350; the fascist side's
  pairings well apart ⇒ the liberal side's Easy < Normal and Normal < Hard steps pass, its Easy <
  Hard step has `pooledClears` true, `invertedSizes` `[7]` and `passes()` false). Change 25A's
  `theVerdictsSayWhatFailed` to expect all six steps named.
- [ ] **Step 2: Run** `cd backend && ./gradlew test --tests game.LadderCheckTest`. Expected: the new
  test fails (no such step).
- [ ] **Step 3: Implement** the step as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: all pass, `NormalBaselineTest` unchanged.
- [ ] **Step 5: Take the "before" table,** in the background: `./gradlew -q botMatches -Pladder >
  <scratchpad>/phase-25b/ladder-before.txt 2>&1`. Expected: 25A's bots, the side-by-side table,
  both verdict lines and six step lines (whatever they say); start
  `<scratchpad>/phase-25b/tuning-log.md` with its pooled rates.
- [ ] **Step 6: Commit** `test(backend): check easy against hard at every table size`.

---

### Task 3: Rule 5's arithmetic, `DeckOdds`

**Files:**
- Create: `backend/src/main/java/game/DeckOdds.java`, `backend/src/test/java/game/DeckOddsTest.java`

**Interfaces:**
- Consumes: `Policy.Type`.
- Produces `final class DeckOdds implements Serializable` (package-private, `serialVersionUID =
  1L`), whose state is what one seat saw go to the discard pile since the last reshuffle (two
  counts) and the draw pile's size at its last look:
  - `static double allFascist(int liberals, int fascists, int cards)`: the chance that `cards` drawn
    at random without replacement from that pool are all fascist, `C(fascists, cards) /
    C(liberals + fascists, cards)`; `IllegalArgumentException` for a negative count or a pool
    smaller than `cards`;
  - `void look(int drawSize)`: a draw pile larger than at the last look means a reshuffle, which
    forgets the seen discards (a fresh memory's last size is 0, so its first look forgets nothing
    it had);
  - `void discarded(Policy.Type type)`;
  - `double allFascistHand(int liberalsOnBoard, int fascistsOnBoard)`: `allFascist` of the pool
    (6 − board − seen liberals, 11 − board − seen fascists, 3 cards);
  - `double liberalThirdCard(int liberalsOnBoard, int fascistsOnBoard)`: for a chancellor holding
    two fascists, the chance the president discarded a liberal, `poolLiberals / (pool − 2)`;
  - both fall back to the cards not on the board when the pool is under 3 cards (or under 2
    fascists for `liberalThirdCard`) or a count is negative.

- [ ] **Step 1: Write the failing tests** in `DeckOddsTest` (tolerance 1e-12):
  `allFascistAtTheStart` (`allFascist(6, 11, 3)` is 165.0 / 680); `allFascistNeedsThreeFascists`
  (`allFascist(5, 2, 3)` is 0); `allFascistOfOneCard` (`allFascist(3, 5, 1)` is 5.0 / 8);
  `allFascistOfAnAllFascistPool` (`allFascist(0, 4, 3)` is 1); `refusesAPoolSmallerThanTheDraw`
  (`allFascist(1, 1, 3)` throws); `refusesANegativeCount`; `aFreshSeatKnowsOnlyTheDeck`
  (`allFascistHand(0, 0)` equals `allFascist(6, 11, 3)`); `theBoardLeavesThePool`
  (`allFascistHand(2, 3)` equals `allFascist(4, 8, 3)`); `seenDiscardsLeaveThePool` (after one
  liberal and one fascist discarded: `allFascist(5, 10, 3)`); `aReshuffleBringsSeenDiscardsBack`
  (`look(14)`, a liberal discarded, `look(11)`: `allFascist(5, 11, 3)`; then `look(15)`:
  `allFascist(6, 11, 3)`); `theCardBesideTwoHandedFascists` (`liberalThirdCard(0, 0)` is 6.0 / 15,
  and 5.0 / 14 after a liberal discarded); `aPoolThatCannotBeFallsBackToTheCardsOffTheBoard` (6
  liberals and 11 fascists discarded at an empty board: `allFascistHand(0, 0)` is
  `allFascist(6, 11, 3)` and `liberalThirdCard(0, 0)` is 6.0 / 15).
- [ ] **Step 2: Run** `./gradlew test --tests game.DeckOddsTest`. Expected: compilation fails.
- [ ] **Step 3: Implement** `DeckOdds` as in Interfaces (`C(n, k)` as a product in `double`; the
  numbers are at most C(17, 3)).
- [ ] **Step 4: Run** the test again. Expected: 12 passed.
- [ ] **Step 5: Commit** `feat(backend): work out the policy deck's odds for hard bots`.

---

### Task 4: Rule 5 in the bot, rule 2 scaled, and older backups

**Files:**
- Modify: `backend/src/main/java/game/CpuPlayer.java`, `backend/src/main/java/game/ChancellorHand.java`
- Modify (test): `BotScenes.java`, `ChancellorHandTest.java`, `NoPeekingTest.java`
- Create (test): `backend/src/test/java/game/HardDeckOddsTest.java`, `HardBotBackupTest.java`

**Interfaces:**
- Consumes: `DeckOdds` (Task 3); 25A's `readsTheGame(game)`, `chancellorHandDrop`,
  `ChancellorHand`, `peekMemory()`, `useRandom`, `BotScenes`, `Twins`, `everyLevelAndSeed`; 24's
  `CpuTurn.step`; `/bots-before-25b.ser` (Task 1).
- Produces on `CpuPlayer`: fields `private DeckOdds deck`, `private HashMap<String, Double>
  reputationCarry`, `private int drawnRound` and `private double drawnAllFascist` (the odds of the
  hand drawn in round `drawnRound`); `double score(String name)` (package-private); `private void
  shiftReputation(String name, double amount)` (Decision 2); `private double
  handAllFascist(SecretHitlerGame game)` (Decision 3: the snapshot of this round, a peeked hand's 1
  or 0 included, else `deck.allFascistHand(liberals, fascists − 1)` for a fascist policy it never
  saw drawn); `chancellorHandDrop` now `private double`, `ChancellorHand.FF_DROP ×
  deck.liberalThirdCard(liberals, fascists)`. `initialize` and the constructor set the new fields up
  empty, and `readObject` fills any that come back null.
- Produces on `ChancellorHand`: `static double presidentChange(List<Policy> hand, double drop)` (−`drop`
  for two fascist cards, +`LL_RISE` for two liberal cards, 0 for one of each); the chancellor's
  handler sends a nonzero change to `shiftReputation(president, …)`.
- Produces on `BotScenes`: `static Played secondRound(String roles, String bot, BotSkill skill, long
  seed)`: `game(roles)`, the bot made first and updated after every move (`then`); round 1 played
  by the others: `drawTop("LLL")`, P0 elects P1 (every seat ja, the bot's made by the scene), P0
  discards 0, P1 enacts 0, P0 ends the term; it waits at round 2, P1 to nominate, one liberal
  policy down and no government judged (Normal's `update` skips round 1). It refuses a bot seat of
  P0 or P1.

- [ ] **Step 1: Write the failing tests** in `HardDeckOddsTest` (scores with tolerance 1e-9),
  `secondRound("LLLFH", "P2", HARD, seed)` unless said, round 2 played with `then(…)`: P1 elects P3
  from `drawTop("FFL")`, P1 discards the L, P3 enacts an F: `anOnlookerScalesTheFascistDrop` (P1's
  and P3's `score` is `−(1 − DeckOdds.allFascist(5, 11, 3))` and `playerReputation` −1);
  `anOnlookerKeepsTheWholeRaiseForALiberal` (`"LLF"`, the F discarded, an L enacted: both scores
  exactly 1.0); `aSeenDiscardChangesTheOdds` (`secondRound("LLFLH", "P3", …)`: round 2 P1 elects
  the bot from `"LFF"` and discards an F, the bot enacts the L itself (`act`); round 3 P2 elects P0
  from `"FFL"`, discards the L, P0 enacts an F: P2's score is `−(1 −
  DeckOdds.allFascist(4, 10, 3))`); `aPeekedHandIsKnownNotGuessed` (25A's `peeked("LLLFH", peek,
  HARD, seed)`, then P1 elects P2, P1 discards index 0, P2 enacts index 0, P1 executes P3: for peek
  `"FFF"` P1's and P2's scores are 0; for `"LFF"` both are `−(1 + PeekMemory.DROP)`);
  `theChancellorsDropIsScaledByTheDiscardedCard` (25A's `chancellorsHand("LLLFH", "FF", "L", 0)` at
  `HARD`: P0's score is `−ChancellorHand.FF_DROP × 6.0 / 15`; `chancellorsHand("LLLFH", "FF", "F",
  5)`: `−FF_DROP × 6.0 / 10`); `othersStillDropByOne` (the first scene with a Normal and an Easy
  liberal at P2, and with a Hard fascist at P2 of `"LLFLH"`: P1's score exactly −1.0);
  `hitlerAtSevenSeatsReadsTheOdds` (`secondRound("LLHLLFF", "P2", HARD, seed)`, P1 elects P3 from
  `"FFL"`, an F enacted: the scaled drop). `HardBotBackupTest`, on `/bots-before-25b.ser`:
  `botsFromBefore25BKeepTheirLevels` (EASY, NORMAL, HARD, … by seat);
  `botsFromBefore25BRememberNothingNew` (for every bot and every seat, `score` equals
  `playerReputation`); `botsFromBefore25BPlayTheirGameOut` (`CpuTurn.step` until the game is
  finished, within 2,000 steps, with no exception). In 25A's `ChancellorHandTest`, the cases rule
  5 now scales: the unit cases take a `double` drop (FF with 3.0 ⇒ −3.0);
  `aHardLiberalChancellorLowersAPresidentWhoPassesTwoFascists` and `aHardHitlerAtSevenReadsTheHand`
  expect `score` `−FF_DROP × 6.0 / 15`; `theHandIsReadOncePerSession` (at 5 fascist policies)
  expects `−FF_DROP × 6.0 / 10`, once. They are Hard's alone; `NormalBaselineTest` is not touched.
- [ ] **Step 2: Extend the no-peeking test:** `hardRule5DeckOdds`, inside `everyLevelAndSeed`. Both
  games `game("LLLFH")`, bot P2, the second with `swapUnseenCards(g, 3)` once round 2's hand is on
  top; round 1 as `secondRound` plays it (the bot's vote by `botActs`); round 2: `drawTop("FFL")`, P1
  nominates P3, the bot votes, the others vote ja, then `others(moveA, moveB)`: P1 discards the L in
  the first and an F in the second, P3 enacting an F either way; P1 ends the term; then the bot, now
  president, nominates (`botActs`). 25A's `hardRule2TwoFascistCards` (the president's discard
  differing) now also covers rule 2's scaling and must pass unchanged.
- [ ] **Step 3: Run** `./gradlew test --tests game.HardDeckOddsTest --tests game.HardBotBackupTest
  --tests game.ChancellorHandTest --tests game.NoPeekingTest`. Expected: the new and changed tests
  fail (no `score`, no scaling).
- [ ] **Step 4: Implement** in `CpuPlayer`, for readers only (`readsTheGame(game)`): in `update`, after
  25A's `clearedPlayers` and `peekMemory` observations, `deck.look(game.getDrawSize())`, then the
  round's snapshot at the first look at `LEGISLATIVE_PRESIDENT`, `LEGISLATIVE_CHANCELLOR` or
  `LEGISLATIVE_PRESIDENT_VETO`; in Normal's onlooker branch, the fascist drop as
  `shiftReputation(name, −(1 − handAllFascist(game)))`; `deck.discarded` for the card it discards
  as president, the card it does not enact as chancellor, the chancellor's discard of the pair it
  passed (in `update`'s president branch) and both cards of a veto it accepts; rule 2 as in
  Interfaces. `readObject` fills `deck` and `reputationCarry` when null.
- [ ] **Step 5: Run** the tests again, then `./gradlew test`. Expected: all pass,
  `NormalBaselineTest` unchanged.
- [ ] **Step 6: Commit** `feat(backend): scale hard bots' suspicion by the deck's odds`.

---

### Task 5: Rule 3, votes

**Files:**
- Modify: `backend/src/main/java/game/CpuPlayer.java`
- Modify (test): `NoPeekingTest.java`, `HardBotBackupTest.java`, and `Twins.java` only if Step 2 says so
- Create (test): `backend/src/test/java/game/HardVoteMemoryTest.java`

**Interfaces:**
- Consumes: `shiftReputation`, `handAllFascist` (Task 4); `BotScenes.secondRound`, `vote`, `Played`.
- Produces on `CpuPlayer`: `record Election(int round, String president, String chancellor,
  Map<String, Boolean> votes) implements Serializable` (nested, package-private); `private
  ArrayList<Election> elections`; `List<Election> elections()` (package-private, unmodifiable, oldest
  first); `static final double VOTE_DROP = 0.25`. Decision 4.

- [ ] **Step 1: Write the failing tests** in `HardVoteMemoryTest`, on `secondRound("LLLFH", "P2",
  HARD, seed)` unless said: `remembersEveryVoteOnceTheElectionCloses` (after round 1, `elections()`
  is `[Election(1, "P0", "P1", every seat true)]`; round 2: P1 nominates P3, P0, P1 and P4 vote ja,
  P3 nein, the bot votes last (`act`, then `update`; its vote `v`): then `Election(2, "P1", "P3", {P0: true, P1:
  true, P2: v, P3: false, P4: true})` follows); `remembersAFailedElection` (round 2 all nein: its
  election, president P1, follows round 1's); `neverReadsAnElectionStillOpen` (round 2 with two
  votes in, an `update`: round 1's alone); `aRoundItNeverSawIsNotTakenForTheNext` (a bot on a fresh
  `game("LLLFH")`, not updated through round 1; at round 2's nomination an `update` records
  nothing; after round 2's vote closes, one election, round 2, president P1);
  `remembersEachElectionOnce` (three `update`s after the close: one entry for the round);
  `lowersYesVotersOfAGovernmentThatEnactsAFascistPolicy` (round 2: P1 elects P3 from `"FFL"` with
  P4 voting nein and the rest ja, P1 discards the L, P3 enacts an F: P0's score is `−VOTE_DROP × (1 −
  DeckOdds.allFascist(5, 11, 3))`, P4's 0, P1's and P3's the onlooker drop alone);
  `leavesVotersOfALiberalPolicyAlone` (`"LLF"`, an L enacted: P0, no member, stays at 0);
  `aChaosPolicyBlamesNoVoter` (`secondRound("LLFHL", "P4", …)`: rounds 2 to 4 fail with P0 ja each
  time: P0's score 0); `backingAddsUp` (`secondRound("LLFHL", "P4", …)`: round 2 P1 and P2, round 3
  P2 and P3, each enacting an F from `"FFL"` with P0 ja: P0's score is `−VOTE_DROP × ((1 −
  DeckOdds.allFascist(5, 11, 3)) + (1 − DeckOdds.allFascist(5, 10, 3)))`); `onlyReadersRemember`
  (a Normal and an Easy liberal at P2, a Hard fascist at P2 of `"LLFLH"` and a Hard Hitler at P2 of
  `"LLHLF"`: `elections()` empty; a Hard Hitler at P2 of `"LLHLLFF"`: round 1's election).
  `HardBotBackupTest.botsFromBefore25BRememberNothingNew` also checks `elections()` empty.
- [ ] **Step 2: Extend the no-peeking test:** `hardRule3Votes`, inside `everyLevelAndSeed`. Both games
  `game("LLLLFFH")`, bot P2, the second with `swapRoles(P3, P5)`; rounds 1 and 2 played the same in
  both (the others' moves by `others`, the bot's votes by `botActs`, the hands by `drawTop`), then
  the bot's next vote (`botActs`). A second pair, `vote("LLLFH")` (bot P2, no one voted yet), with
  `others(moveA, moveB)`: P3 votes ja in the first and nein in the second, then `botActs()`. If
  `Twins.Visible` compares an open election's vote values and so fails that pair at its `Visible`
  check, narrow it to who has voted while `CHANCELLOR_VOTING` (what the page shows: the roster
  hides votes until the election closes) and say so in the PR.
- [ ] **Step 3: Run** `./gradlew test --tests game.HardVoteMemoryTest --tests game.HardBotBackupTest
  --tests game.NoPeekingTest`. Expected: compilation fails (no `Election`).
- [ ] **Step 4: Implement** Decision 4 in `update`, for readers: record after `deck.look` and the
  snapshot, judge in Normal's onlooker branch beside rule 5's drop; `readObject` fills `elections`
  when null; `initialize` clears it.
- [ ] **Step 5: Run** the tests again, then `./gradlew test`. Expected: all pass,
  `NormalBaselineTest` unchanged.
- [ ] **Step 6: Commit** `feat(backend): let hard bots remember every vote`.

---

### Task 6: Rule 6, the election tracker

**Files:**
- Modify: `backend/src/main/java/game/CpuPlayer.java`; `NoPeekingTest.java`
- Create (test): `backend/src/test/java/game/HardTrackerTest.java`

**Interfaces:**
- Produces on `CpuPlayer`: `float chanceOfYes(SecretHitlerGame game)` (package-private; Decision 5);
  `static final float LIBERAL_TRACKER_PUSH = 0.5f` and `FASCIST_TRACKER_PULL = 0.5f`.
- Scenes: tracker 2 is two failed elections, P0's and P1's (each a nomination, `voteAll(g, false)`
  and the end of the term, through `Played.then`), the bot at P3 and P2 nominating in round 3.

- [ ] **Step 1: Write the refactor's guard** in `HardTrackerTest`: `normalChancesAreAsBefore` (Normal
  bots on 25A's `vote(roles)` scenes, tolerance 1e-6: `vote("LLLFH")` 0.75, and 0.05 with P0's score
  set to −4; `vote("LLFLH")` (a fascist on two liberals) 0.6; `vote("HLFLL")` (one of each) 0.7;
  `vote("FHFLLLL")` (two of its side) 0.8). Run it: compilation fails (no `chanceOfYes`).
- [ ] **Step 2: Refactor** `handleChancellorVoting` to vote with `chanceOfYes(game)`, every path's
  value kept and Easy's coin where 25A put it. Run `./gradlew test`. Expected: all pass,
  `NormalBaselineTest` unchanged (Normal's votes and its random draws are as before; if it fails,
  the refactor is wrong, never the baseline). Commit `refactor(backend): work out each vote's
  chance of yes in one place`.
- [ ] **Step 3: Write the failing tests** in `HardTrackerTest`, at tracker 2 unless said:
  `aLiberalVotesYesMoreReadilyAtTwoFailedElections` (a Hard liberal at P3 of `"LLFLH"`, P2 nominating
  P0, both at score 0: `0.75 + LIBERAL_TRACKER_PUSH × 0.25`);
  `aLiberalStillRejectsAnUntrustedGovernmentAtTwo` (P2's score −4: 0.05); `rule1sNeinStandsAtTwo`
  (`board(g, 3, 0)` first, P2 nominating P0, never in a government and below `TRUSTED_SCORE`: 0);
  `theFascistSidePullsBackFromALiberalGovernmentAtTwo` (a Hard fascist at P3 of `"LLLFH"`, P2
  nominating P0: `0.6 × (1 − FASCIST_TRACKER_PULL)`); `theFascistSideKeepsItsYesForItsOwnGovernment`
  (the same bot, P2 nominating P4, its Hitler: 0.7; a Hard Hitler at P3 of `"LLLHLFF"` nominated by
  P2 at score 0: `2t − t²` at t = 0.75, 0.9375, as at tracker 0); `hitlerAtSevenSeatsPullsBackToo` (that Hitler
  with P2 nominating P0, both at score 0: `0.75 × (1 − FASCIST_TRACKER_PULL)`);
  `oneFailedElectionChangesNothing` (a Hard liberal at tracker 1: 0.75);
  `normalAndEasyIgnoreTheTracker` (Normal and Easy liberals at tracker 2: 0.75).
- [ ] **Step 4: Extend the no-peeking test:** `hardRule6Tracker`, inside `everyLevelAndSeed`. Twins
  with the two failed elections and round 3's nomination, then `botActs()` for the bot's vote: a
  liberal bot with `swapRoles` of two other seats in the second game; a fascist bot, and Hitler at 7
  seats, with `swapUnseenCards(g, 0)`.
- [ ] **Step 5: Run** `./gradlew test --tests game.HardTrackerTest --tests game.NoPeekingTest`.
  Expected: the rule-6 tests fail.
- [ ] **Step 6: Implement** Decision 5 in `chanceOfYes`, Hard only.
- [ ] **Step 7: Run** the tests again, then `./gradlew test`. Expected: all pass,
  `NormalBaselineTest` unchanged.
- [ ] **Step 8: Commit** `feat(backend): let hard bots weigh the election tracker`.

---

### Task 7: Rule 7, fascists bluff

**Files:**
- Modify: `backend/src/main/java/game/CpuPlayer.java`; `NoPeekingTest.java`; `docs/PLAN.md` (box 1)
- Create (test): `backend/src/test/java/game/HardBluffTest.java`

**Interfaces:**
- Produces on `CpuPlayer`: `static final double CHANCELLOR_BLUFF_CHANCE = 0.35` and
  `PRESIDENT_BLUFF_CHANCE = 0.35`, used in `handleLegislativeChancellor`'s one-of-each branch and
  `handleLegislativePresident`'s two-fascists branch. Decision 6.

- [ ] **Step 1: Write the failing tests** in `HardBluffTest`, each scene fresh for each seed 0, 1, 2,
  …, outcomes read with `Decision.of`: `aFascistChancellorSometimesBluffsALiberalPresident`
  (`chancellorsHand("LFLLH", "FL", "F", 0)`, the Hard fascist P1 under the liberal P0: over 4,000
  seeds the share of `enact L` is `CHANCELLOR_BLUFF_CHANCE` ± 0.03);
  `aFascistChancellorNeverBluffsATeammate` (`chancellorsHand("HFLLL", "FL", "F", 0)` and, at 7
  seats, `chancellorsHand("FFLLLLH", "FL", "F", 0)`: 0 of 500);
  `noChancellorBluffFromThreeFascistPolicies` (`chancellorsHand("LFLLH", "FL", "F", 3)`: 0 of 500);
  `aFascistPresidentSometimesPassesOneOfEach` (`presidentsHand("FLLLH", "FFL")`, the liberal P1
  elected: over 4,000 seeds the share of one of each passed is `PRESIDENT_BLUFF_CHANCE` ± 0.03);
  `aFascistPresidentPassesTwoFascistsToATeammate` (`presidentsHand("FHLLL", "FFL")`, Hitler as
  chancellor: 0 of 500); `noBluffOnceTheLiberalsHaveFour` (the first and fourth scenes with
  `board(g, 0, 4)` after the builder: 0 of 500 each); `normalFascistsNeverBluff` (both offices'
  scenes at `NORMAL`: 0 of 500 each; Easy is Normal plus 25A's coin, which `EasyMistakesTest`
  covers); `hitlerPlaysAsBefore` (`chancellorsHand("LHLLF", "FL", "F", 0)` at `HARD`: `enact L` in
  500 of 500; `presidentsHand("HLLLF", "FFL")` at `HARD`: one of each passed in 2/3 ± 0.03 of
  3,000).
- [ ] **Step 2: Extend the no-peeking test:** `hardRule7Bluffs`, inside `everyLevelAndSeed`:
  `chancellorsHand("LFLLH", "FL", "F", 0)` and `presidentsHand("FLLLH", "FFL")`, each twinned with
  `swapUnseenCards(g, 0)` in the second game, then `botActs()`.
- [ ] **Step 3: Run** `./gradlew test --tests game.HardBluffTest --tests game.NoPeekingTest`.
  Expected: the bluff tests fail.
- [ ] **Step 4: Implement** Decision 6, Hard fascists only.
- [ ] **Step 5: Run** the tests again, then `./gradlew test`. Expected: all pass,
  `NormalBaselineTest` unchanged.
- [ ] **Step 6: Commit** `feat(backend): let hard fascists bluff`, ticking Phase 25B's first box
  (rules 3, 5, 6 and 7, each with its own tests and in the no-peeking test).

---

### Task 8: Tuning the amounts

**Files:**
- Modify: `backend/src/main/java/game/CpuPlayer.java` and 25A's `ClearedPlayers`, `ChancellorHand` and
  `PeekMemory` (Hard amounts only); `docs/PLAN.md` (boxes 2 and 3, and box 4 when no extra rule was
  needed)

- [ ] **Step 1: The first full run,** in the background: `./gradlew -q botMatches -Pladder >
  <scratchpad>/phase-25b/ladder-run-01.txt 2>&1`. Log it (Step 3's line).
- [ ] **Step 2: Read the verdicts:** the `Ladder check:` line, the six step lines under it and the
  `Balance check:` line. Both pass: go to Step 5. Otherwise Step 4.
- [ ] **Step 3: Keep the log.** One line per run in `tuning-log.md`: the run's file, its games a size,
  every Hard amount (25A's too), the pooled liberal rate of the seven pairings and both verdicts.
  Every full run is numbered, since Decision 8 counts them.
- [ ] **Step 4: Tune.** Change one amount at a time in exploration runs (`-Pgames=500`, output to
  `explore-NN.txt`), reading the pooled rates of the pairings it moves (H/N for a liberal rule, N/H
  for a fascist one, H/H for both). Starting directions: a liberal step up to Hard short, raise
  `VOTE_DROP`, `FF_DROP`, `PeekMemory.DROP`, `NOMINATION_WEIGHT` or `LIBERAL_TRACKER_PUSH`; a
  fascist step up to Hard short, try both directions of the bluff chances (a bluff costs the
  fascists a policy) and raise `FASCIST_TRACKER_PULL`; all-Hard liberals too far ahead, weaken the
  liberal amounts only while the liberal steps hold, or strengthen the fascist side; too far
  behind, the reverse. Decide with a full run; back to Step 2. Follow Decision 8: once (a)'s 10
  full runs are spent, go to Task 9 if (b) covers what fails, else stop.
- [ ] **Step 5: Confirm.** A second full run with no code change between. Both pass: Step 6.
  Otherwise back to Step 4 (the run counts).
- [ ] **Step 6: Run** `./gradlew test`. Expected: all pass (tests name the constants),
  `NormalBaselineTest` unchanged.
- [ ] **Step 7: Commit** `feat(backend): tune hard bots for the ladder and balance checks` with the
  final amounts, ticking boxes 2 and 3, and box 4 with "no extra fascist-side rule was needed" in
  the PR when Task 9 is skipped.

---

### Task 9: Extra fascist-side rules (only when Decision 8 (b) sends you here)

**Files:**
- Modify: `backend/src/main/java/game/CpuPlayer.java`; `NoPeekingTest.java`; `docs/PLAN.md` (boxes 2,
  3 and 4)
- Create (test): `backend/src/test/java/game/HardFascistRulesTest.java`

At most three rules, one at a time, each for the fascist side only, Hard only, with a `static final`
amount, reading only what the bot's role reveals under the rules (a fascist bot knows every role;
Hitler at 7 or more knows only those it investigated, so a rule that needs teammates is a fascist
bot's alone). Candidates, in the order to try them: **groom Hitler** (a fascist president, before 3
fascist policies, nominates Hitler more often and passes him one of each when it can, so his public
record shows liberal policies by the time his election wins); **special elections to the side** (a
fascist, or Hitler that knows roles, hands the presidency only to its side when it can); **shoot
the trusted** (a fascist executes the living liberal whose governments enacted the most liberal
policies, a public record). Others are allowed under the same rules.

- [ ] **Step 1: Write the failing tests** for the rule in `HardFascistRulesTest`, on `BotScenes`: its
  behaviour at its amount (a share within ± 0.03 over 4,000 seeds, or an exact choice), that it
  never applies outside its window, and a Normal counterpart that decides as before.
- [ ] **Step 2: Extend the no-peeking test** with a twin case for the rule inside `everyLevelAndSeed`:
  the second game differing in something its seat cannot see (`swapUnseenCards`, or for Hitler at
  7 or more `swapRoles` of two seats it does not know).
- [ ] **Step 3: Run** them: they fail. **Implement** the rule. **Run** them and `./gradlew test`: all
  pass, `NormalBaselineTest` unchanged.
- [ ] **Step 4: Tune** it as Task 8, Steps 2 to 5, against (b)'s budget.
- [ ] **Step 5: Commit** `feat(backend): <the rule, in words>` (one commit per rule). Add the rule's
  name, its amount and its effect on the pooled rates to `<scratchpad>/phase-25b/extra-rules.md`
  for the PR. When the checks pass twice in a row, the last rule's commit ticks boxes 2, 3 and 4.
  When (b)'s budget runs out first: stop (Decision 8).

---

### Task 10: Docs

**Files:**
- Modify: `CLAUDE.md` (the bots section only); `DEVELOPMENT.md` (`botMatches`' lines)

- [ ] **Step 1: Update `CLAUDE.md`'s bots section** in the house style, beside 24's and 25A's lines:
  Hard's rules 3, 5, 6 and 7 (and any extra fascist-side rule) with their final amounts and who runs
  each (Decision 1), and 25A's amounts if tuning moved them; `DeckOdds` and what a seat counts, the
  peek's known hand (Decision 3); the scores' carry and `score`, `chancellorHandDrop` scaled and a
  `double` (Decision 2); `Election` and `elections()`; `chanceOfYes`; the new fields filled in
  `readObject` and the fixture `bots-before-25b.ser` with `HardBotBackupTest`; `LadderCheck`'s
  Easy < Hard step; the checks' final pooled numbers (each step's rates, all-Hard against
  all-Normal); `BotScenes.secondRound` (and `Twins.Visible`'s narrowing, if made); the new test
  classes. Nothing about the lobby or the records (26A's and 26B's sections), nothing about the
  home server.
- [ ] **Step 2: Update `DEVELOPMENT.md`'s** `botMatches` section: the six step lines under `Ladder
  check:`.
- [ ] **Step 3: Commit** `docs(claude): describe the hard bots' rules and the ladder` and
  `docs(development): describe the easy against hard step`.

---

### Task 11: Review

- [ ] **Step 1: Review.** Run the `code-review` skill against `origin/development`, with the spec,
  Phase 25B's section of `docs/PLAN.md` and this plan as the spec.
- [ ] **Step 2: Fix every finding,** Minor ones included, each with a test where it changes
  behaviour, in commits of their own; a finding that needs no change gets its reason. Keep the list
  (finding, what was done) for the PR's Review section. A fix in a file another phase owns: ask
  first.
- [ ] **Step 3: Run** `./gradlew test`. Expected: all pass, `NormalBaselineTest` unchanged; keep the
  counts for the PR.
- [ ] **Step 4: Run the ladder again** if any fix changed a file in `backend/src/main/java/game/`: two
  full runs in a row must pass both checks (they count toward Decision 8's budgets; a failure goes
  back to Task 8, Step 4). The last two passing full runs, with no code change after them, are the
  "after" tables.
- [ ] **Step 5: Commit** the last fix with the acceptance box "Backend tests pass" ticked (or
  `docs(plan): tick phase 25b's test box` if there was nothing to fix).

---

### Task 12: Pull request and merge

- [ ] **Step 1: Write the body** in `<scratchpad>/phase-25b/pr-body.md`: a summary ("Part of #72");
  "This pull request changes nothing on screen." in place of the screenshot table; Changes; the
  rules with their final amounts and who runs each; Extra fascist-side rules (each with its tests and
  effect, or "None were needed"); Ladder and balance: the full `-Pladder` output before (25A's bots,
  `ladder-before.txt`) and after (the last passing full run), each in a code block with its verdict
  lines, and the run before it named as passing too; a line that the Easy and Normal rows of the two
  tables agree within their intervals; Decisions (this plan's 1 to 9; the changes to 25A's
  `LadderCheck`, `ChancellorHand` and its test, `BotScenes` and `Twins`; every name from `names.md`
  that differed); Review; Tests (counts). Check that both tables are whole.
- [ ] **Step 2: Push and open the PR:** `git push -u origin phase-25b-hard-bots`; `gh pr create
  --repo jussaw/Secret-Hitler-Online --base development --head phase-25b-hard-bots --title
  "feat(backend): finish the hard bots and pass the ladder check" --body-file
  <scratchpad>/phase-25b/pr-body.md`. Read it back (`gh pr view --repo jussaw/Secret-Hitler-Online
  --json body`).
- [ ] **Step 3: Bring CI to green,** fixing on the branch and pushing until every job passes. If
  `development` moves while it is open, rebase (keeping both sides of any docs), run `./gradlew
  test`, push with `--force-with-lease`; if the rebase brought a change to `game/`, run the ladder
  twice again and update the after table. The phase's work ends here, with the PR open and green.
- [ ] **Step 4: Merge (the manager session, once CI is green: the user gave a standing OK for these five phase pull requests).** Each part is skipped
  when already done, so the step can be resumed: if the "PR merged into `development`" box is not
  ticked on the branch, commit `docs(plan): tick phase 25b's merge` (that box, box 5 once the body
  quotes both tables, and the Progress row "done"), push and wait for green; if `gh pr view <n>
  --repo jussaw/Secret-Hitler-Online --json state` is not `MERGED`, run `gh pr merge <n> --squash
  --admin --repo jussaw/Secret-Hitler-Online --match-head-commit <head sha> --subject
  "feat(backend): finish the hard bots and pass the ladder check (#<n>)"`; then `gh run list --repo
  jussaw/Secret-Hitler-Online --branch development --limit 1` shows the push's run publishing
  `:latest`. Tell the manager that 26A and 26B may now rebase onto `development` and merge.
