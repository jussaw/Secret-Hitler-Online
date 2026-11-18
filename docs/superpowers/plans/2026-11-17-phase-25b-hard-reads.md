# Phase 25B: Hard's first rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hard bots start reading the game: rule 1 (a Hard liberal keeps the players proved not to
be Hitler and trusts them), rule 2 (a Hard bot that reads the game learns from the two cards a
president hands it as chancellor) and rule 4 (a Hard president keeps its peek and blames the next
government that enacts a fascist policy from a hand it knows held a liberal), each in the
no-peeking test, and Hard no longer below Normal in the self-play run for either side (issue #72).

**Architecture:** Each rule is a small class in `game` (`ClearedPlayers`, `ChancellorHand`,
`PeekMemory`); the two with memory are `Serializable` fields of `CpuPlayer`, filled in `readObject`
for older backups, and `CpuPlayer` calls them from `update` and its handlers, each gated by who
runs that rule. The tests build their games with Phase 25A's `BotScenes` and two new builders that
make the bot first and update it after every move, check each rule through `CpuPlayer` and on its
own, add a scene per rule to 25A's `NoPeekingTest` (whose `Twins` already compares every new field),
and take every expected amount from the rules' named constants, so Phase 25D can retune them
without editing a test. `botMatches -Pladder` (25A) shows Hard against Normal before and after.

**Tech Stack:** Java 17, Gradle 7.4.2 (wrapper), JUnit 4.12 (no `assertThrows`), commons-lang3's
`SerializationUtils` in tests. No new dependency. Backend only.

**Spec:** [`docs/superpowers/specs/2026-11-17-bot-skill-design.md`](../specs/2026-11-17-bot-skill-design.md):
Anti-goals, Constraints, "Hard's rules" (the who-runs paragraph and rules 1, 2 and 4), "The
self-play run", "The no-peeking test", "Names the phases share", Phases ("25B. Hard's first
rules"), Docs. Builds on Phase 24
([`2026-11-17-phase-24-bot-fixes.md`](2026-11-17-phase-24-bot-fixes.md)) and Phase 25A
([`2026-11-17-phase-25a-bot-levels.md`](2026-11-17-phase-25a-bot-levels.md)), whose names it uses
("From Phases 24 and 25A", below). Hard's rules 3, 5, 6 and 7 are Phase 25C's ("Hard's other
rules"); passing the ladder and balance checks is 25D's ("Ladder and balance"). Merges go 24, 25A,
25B, 25C, 25D, 26A, 26B. Parent plan: [`docs/PLAN.md`](../../PLAN.md), Phase 25B. Where this plan
and the spec differ, the spec wins.

## Decisions (where this plan fills or departs from the spec)

1. **Who runs which rule** (the spec's paragraph): `hardLiberal()` (Hard and dealt Liberal) runs
   rule 1, and only it; `readsTheGame(game)` (Hard and not knowing every role: not `FASCIST`, and
   not `HITLER` at 5 or 6 seats, as `initialize` decides) runs rule 2 and rule 4's blame, reading
   the rules' "a Hard liberal bot" as "a Hard bot that reads the game", as the spec says; every Hard
   president that peeks keeps the cards (25C's deck odds read them). Rule 4 cannot matter for
   Hitler at 7 or more: only the 5 to 6 board has the peek.
2. **Rule 1.** A chancellor is cleared when the bot sees `LEGISLATIVE_PRESIDENT`,
   `LEGISLATIVE_CHANCELLOR` or `LEGISLATIVE_PRESIDENT_VETO` with 3 or more fascist policies down: in
   those states the election has passed, the game went on, and nothing has been enacted since. Bots
   are updated after every command and before every CPU step, so one of those states is seen for
   every passed election. Nominating, a cleared seat's weight is multiplied by
   `NOMINATION_WEIGHT`. Voting, a cleared chancellor gets ja, **except** when the bot's own
   investigation found the president or the chancellor `FASCIST`: then Normal votes (the spec's
   rule 1 says so: voting in a known fascist hands the fascists a policy). With 3 or more fascist policies, a chancellor not cleared gets nein unless their score
   (with identity) is `TRUSTED_SCORE` or more, when Normal votes; otherwise Normal votes.
3. **Rule 2.** Read in the chancellor's handler, once per round (`handReadRound`), so the second
   decision after a refused veto reads nothing again: two fascist cards lower the president by
   `chancellorHandDrop(game)`, two liberal cards raise them by `ChancellorHand.LL_RISE`, one of each
   changes nothing. In 25B `chancellorHandDrop` returns `ChancellorHand.FF_DROP`; it is the one
   place 25C scales the drop by the deck's odds (rule 5).
4. **Rule 4.** At the peek a Hard president keeps the three cards and the draw pile's size. The first
   legislative state it then sees belongs to the government that drew them if the pile is exactly 3
   smaller; any other size means a chaos policy or a reshuffle came between, and the cards are
   forgotten. When that government's session ends (the first state after it that is not a
   legislative one), a reader lowers both members by `PeekMemory.DROP` if they enacted a fascist
   policy and the cards held a liberal, and forgets the cards either way. **Only an onlooker
   blames** (the spec is silent here): as that government's president the bot held the cards
   itself, and as its chancellor rule 2 reads what it was handed.
5. **Amounts** are the spec's "starting points", kept as `int`s while scores are whole numbers:
   `NOMINATION_WEIGHT` 3 (a `double`, a weight), `TRUSTED_SCORE` 3 (the spec's "+3 or more",
   fixed), `FF_DROP` 2, `LL_RISE` 2, `PeekMemory.DROP` 2. 25C moves the amounts to `double` with
   fractional scores. Every test takes its expected value from these constants, never a literal, so
   25D retunes them without editing a test (25C only makes them `double`s).
6. **Hard not below Normal** (the anti-goal "a lower level that plays better than a higher one"):
   in `-Pladder`'s run, for neither side may Hard's interval lie wholly below Normal's, pooled or at
   any size. Clearing the `Normal < Hard` step is 25D's.

## From Phases 24 and 25A

Their plans' Interfaces, used here by name. "Before you start" checks that they merged as planned;
where the code differs, keep the code, make this plan's change on it, and say so in the PR.

- **24:** `CpuTurn.step(SecretHitlerGame, Collection<CpuPlayer>, Runnable)`; `CpuPlayer`'s pinned
  `serialVersionUID = 2392054316009854878L`, transient `random`, the public
  `chooseRandomPlayerWeighted(List<Player>, float, float, float, float)` drawing through the
  package-private `static int getWeightedRandomIndex(float[] weights, double draw)`, the private
  `investigationTargets` and `executionTargets`, `private void updateReputation(String, int)` and
  `private int getPlayerReputationWithIdentity(String)`; `BotMatches` (`play`, `Results`, `Tally`,
  `Interval`, `interval`).
- **25A, main:** `enum BotSkill { EASY, NORMAL, HARD }`; `CpuPlayer(String name, BotSkill skill)`,
  `CpuPlayer(String name)` (Normal), `public BotSkill skill()`, `private BotSkill skill` filled in
  `readObject`; `public static final double EASY_MISTAKE_CHANCE`; private `mistake()` and
  `anyOf(List<T>)`; package-private `void useRandom(Random)`.
- **25A, tests (`backend/src/test/java/game/`):** `BotScenes` (`game`, `board`, `drawTop`,
  `swapRoles`, `swapUnseenCards`, `voteAll`, `elect`, `mix`, `record Scene(SecretHitlerGame game,
  String bot)`, the builders `nomination`, `vote`, `presidentsHand`, `chancellorsHand`,
  `vetoAnswer`, `power`, and `bot(Scene, BotSkill, long)` and `bot(SecretHitlerGame, String,
  BotSkill, long)`, which seed with `new Random(mix(seed))`); `Decision.of(GameState, boolean,
  SecretHitlerGame, String)`; `Twins` (`of(Scene, Scene, BotSkill, long)`, `others(move)`,
  `others(moveA, moveB)`, `botActs()`, `botA()`, `botB()`, `Visible`), which compares each bot's
  serialized bytes, so every field this phase adds is compared; `NoPeekingTest.everyLevelAndSeed(
  BiConsumer<BotSkill, Long>)` and `swaps(String roles, String bot, String... electedAtThree)`;
  `NormalBaselineTest` and `normal-baseline.txt`; `EasyMistakesTest`; `CpuPlayerSkillTest`.
- **25A, the run:** `BotMatches.makeBots`, `label`, `ladder(int)`, `ladderReport`; `LadderCheck`
  (`Pairing`, `PAIRINGS`, `Side`, `clearlyAbove(Interval higher, Interval lower)`, `Step` with
  `pooledClears` and `invertedSizes`, `step`, `ladder`, `balanced`, `verdicts`); `./gradlew
  botMatches -Pladder`.

## Global Constraints

- **Names:** `game.ClearedPlayers`, `game.ChancellorHand`, `game.PeekMemory`; on `CpuPlayer` the
  private `hardLiberal()`, `readsTheGame(SecretHitlerGame)`, `chancellorHandDrop(SecretHitlerGame)`
  and the package-private `clearedPlayers()` and `peekMemory()`, as Tasks 1 to 3 give them; 25C
  builds on them.
- **No peeking** (the spec's anti-goal): each rule reads only its seat's role, what that role
  reveals, what the bot saw as president or chancellor (its hands, its peek, an investigation's
  party), and what every seat sees (the board, the piles' sizes, the tracker, nominations, closed
  elections' votes, deaths). Each rule gets a `NoPeekingTest` scene.
- **Backups load:** `SecretHitlerGame` gets no field and no non-private method. `CpuPlayer`'s pinned
  `serialVersionUID` stays; `readObject` fills `clearedPlayers` and `peekMemory` when an older
  stream leaves them null (`handReadRound` comes back 0); `ClearedPlayers` and `PeekMemory` each pin
  `private static final long serialVersionUID = 1L;`.
- **Only Hard changes:** `NormalBaselineTest` and `EasyMistakesTest` pass unchanged; no rule runs
  for a bot that is not `HARD`.
- **Starting values** (Decision 5): `ClearedPlayers.NOMINATION_WEIGHT` 3, `TRUSTED_SCORE` 3,
  `ChancellorHand.FF_DROP` 2, `LL_RISE` 2, `PeekMemory.DROP` 2. Tests read them by name.
- **File owners:** 25B owns `CpuPlayer.java`, the three new classes and the bot tests while it runs;
  26A and 26B are built at the same time. Nothing under `backend/src/main/java/server/`, no
  frontend file, no protocol change, nothing on screen.
- **`./gradlew test` stays fast:** each new test class under 20 s here; `NoPeekingTest` under 60 s.
- **Environment:** `export JAVA_HOME=<java-17-home>` (any installed Java 17; the wrapper fails on
  newer JDKs) before every Gradle run; tests are `cd backend && ./gradlew test`. Run output and the
  PR body go in the session scratchpad's `phase-25b/` folder, never in the repo.
- **Known flake:** `GameRecorderTest.aFailingDatabaseLosesNoRecord` under load. Check a failure on
  `development` before calling it one.
- **Branch and commits:** worktree and branch `phase-25b-hard-reads` from `origin/development` once
  Phase 25A has merged. Conventional Commits with a scope (`backend`, `claude`, `development`,
  `plan`), lowercase imperative, at most 72 characters, each test in the commit with its code. Each
  task's last commit ticks the Phase 25B box in `docs/PLAN.md` that names its work (match by
  content; if no box names a task's work, tick none and say so in the PR). Task 1 also sets Phase
  25B's Progress row to "in progress". Every `gh` command takes `--repo
  jussaw/Secret-Hitler-Online`. The builder's work ends at the pull request open with CI green; the
  merge is the manager's (Task 7).
- **Public repo:** nothing about the home server in code, docs, commits or the PR.

## Review Focus

1. **A Hard bot's memory through a backup and a restart.** Once 26A seats Hard bots, every lobby
   backup holds their cleared players, a held peek and `handReadRound`; read back, the bot must
   remember the same and play on. Task 3 tests it (`aHardBotKeepsWhatItRemembersThroughABackup`).
2. **A chancellor's hand read twice.** A refused veto sends the bot back to choose, and bots are
   updated every tick: the president's score must change once per session. Task 2 tests it
   (`theHandIsReadOncePerSession`).
3. **A chaos policy between the peek and the next session.** The top card is gone, so the next
   government did not draw the peeked three and must not be blamed. Task 3 tests it
   (`aChaosPolicyAfterThePeekForgetsTheCards`).
4. **A cleared player the bot knows to be fascist.** Its own investigation said `FASCIST`, so rule
   1's ja would hand the fascists a policy; Normal votes instead. Task 1 tests it
   (`aKnownFascistGetsNoJaForBeingCleared`).
5. **A cleared player who cannot be nominated** (the last chancellor, or the last president at more
   than five living): the preference never makes an illegal nomination. Task 1's nomination test
   checks that P1 and P4 are never nominated.

## Scenes added (`BotScenes`)

- `record Played(SecretHitlerGame game, CpuPlayer bot)` with `void then(Consumer<SecretHitlerGame>
  move)`: the move, then `bot.update(game)`.
- `static Played cleared(String botSeat, BotSkill skill, long seed)`: `game("FLLFLLH")`,
  `board(3, 0)`, `drawTop("LLLLLL")`, the bot (`bot(game, botSeat, skill, seed)`) made first; round 1
  P0 elects P3, round 2 P1 elects P4, each with every seat's ja (the bot's made by the scene), a
  discard of 0 and the chancellor enacting L, then END TERM, the bot updated after every move. It
  waits at round 3, P2 to nominate: P3 and P4 are cleared; P1 (the last president) and P4 (the last
  chancellor) are not eligible.
- `static Played peeked(String roles, String peek, BotSkill skill, long seed)`: `game(roles)`,
  `board(2, 0)`, `drawTop("FFF" + peek)`, the bot P0 made first and updated after every move; P0
  elects P1 (the scene nominates and votes for the bot's seat), the bot discards itself (`act`, so
  its own `chancellorChoices` is set), P1 enacts, the bot peeks and ends its term (`act` twice). It
  waits at round 2, P1 to nominate.

---

### Before you start

- [ ] **Make the worktree:** `git fetch origin`, then the worktree and branch
  `phase-25b-hard-reads` from `origin/development`, nested under the session's worktree folder.
- [ ] **Check the start point.** All must hold, or stop and tell the coordinator:
  `git cat-file -e origin/development:backend/src/main/java/game/BotSkill.java`;
  `git cat-file -e origin/development:backend/src/test/java/game/Twins.java`;
  `git cat-file -e origin/development:backend/src/test/java/game/NoPeekingTest.java`;
  `git cat-file -e origin/development:backend/src/test/java/game/LadderCheck.java`;
  `git cat-file -e origin/development:backend/src/test/resources/normal-baseline.txt`;
  `grep -n "^## Phase 25B" docs/PLAN.md`; the spec and this plan are in `docs/superpowers/`.
- [ ] **Read 25A's** `CpuPlayer`, `BotScenes`, `Twins`, `NoPeekingTest`, `CpuPlayerSkillTest` and
  `LadderCheck`, and note in the scratchpad's `phase-25b/notes.md` each way they differ from "From
  Phases 24 and 25A" (that list goes in the PR).
- [ ] **Take the "before" run:** `cd backend && ./gradlew -q botMatches -Pladder >
  <scratchpad>/phase-25b/before-ladder.txt` (25A's bots: Hard plays as Normal). Expected: every
  pairing finishes; the verdict lines print.

---

### Task 1: Hard's rule 1, cleared players

**Files:**
- Create: `backend/src/main/java/game/ClearedPlayers.java`
- Modify: `backend/src/main/java/game/CpuPlayer.java`, `backend/src/test/java/game/BotScenes.java`,
  `NoPeekingTest.java`
- Test: `backend/src/test/java/game/ClearedPlayersTest.java`

**Interfaces:**
- Produces: `final class ClearedPlayers implements Serializable` (UID 1L): `static final double
  NOMINATION_WEIGHT = 3`; `static final int TRUSTED_SCORE = 3`; `void observe(SecretHitlerGame
  game)` (Decision 2's states and count: adds `getCurrentChancellor()`); `boolean contains(String
  name)`; `Set<String> names()` (unmodifiable, in the order cleared); `double
  nominationFactor(String name)` (`NOMINATION_WEIGHT` if cleared, else 1); `Optional<Boolean>
  vote(SecretHitlerGame game, int chancellorScore, Map<String, Identity> known)` (Decision 2; empty
  means Normal votes).
- Produces on `CpuPlayer`: `private ClearedPlayers clearedPlayers` (filled in `readObject` when
  null); package-private `ClearedPlayers clearedPlayers()`; private `boolean hardLiberal()`; a
  private overload of 24's `chooseRandomPlayerWeighted` taking a `ToDoubleFunction<String> factor`
  that multiplies each eligible player's weight, as a `float`, after its clamp and before 24's
  `getWeightedRandomIndex(weights, random.nextDouble())` (the public method passes `name -> 1`: a
  factor of exactly 1 leaves every Normal pick as it was). In `update`, `hardLiberal()` ⇒
  `clearedPlayers.observe(game)` first; nominating, the liberal branch passes
  `clearedPlayers::nominationFactor` when `hardLiberal()`; voting, `hardLiberal()` and a present
  `vote(…)` (with `getPlayerReputationWithIdentity(chancellor)` and `knownPlayerRoles`) registers it
  instead of Normal's vote.
- Produces on `BotScenes`: `Played` and `cleared`, as in "Scenes added".

- [ ] **Step 1: Write the failing tests.** `ClearedPlayersTest`, on `BotScenes` games, every amount
  by its constant:
  - `aChancellorElectedWithThreeFascistPoliciesDownIsCleared` (`board(3, 0)`, an election passed,
    observed in `LEGISLATIVE_PRESIDENT`); `itIsStillSeenOnceThePresidentHasDiscarded` (observed only
    in `LEGISLATIVE_CHANCELLOR`); `twoFascistPoliciesClearNoOne`; `aFailedElectionClearsNoOne` (all
    nein at 3).
  - `aClearedChancellorGetsJa`; `aKnownFascistGetsNoJaForBeingCleared` (Review Focus 4: `known` has
    the chancellor or the president `FASCIST` ⇒ empty);
    `anUnclearedChancellorUnderTheTrustedScoreGetsNein` (scores `TRUSTED_SCORE − 1` and −5 ⇒
    false); `fromTheTrustedScoreTheVoteIsNormals` (score `TRUSTED_SCORE` ⇒ empty);
    `beforeThreeFascistPoliciesTheVoteIsNormals`; `onlyClearedPlayersWeighMore`
    (`NOMINATION_WEIGHT` and 1).
  - Through `CpuPlayer`: `aHardLiberalPrefersClearedPlayersWhenItNominates` (Review Focus 5:
    `cleared("P2", …)` over 10,000 seeds, the scores of the eligible P0, P3, P5 and P6 set to 0
    first, so their weights are equal: P3 nominated in `NOMINATION_WEIGHT / (NOMINATION_WEIGHT + 3)`
    ± 0.02 of them at `HARD` and 0.25 ± 0.02 at `NORMAL`, and P1 and P4 never);
    `aHardLiberalVotesForAClearedChancellor` (`cleared("P5", …)`, P2 nominates P3: ja in all of
    1,000 seeds); `aHardLiberalVotesNoOnAChancellorNotCleared` (P2 nominates P6: nein in all);
    `aTrustedChancellorGetsNormalsVote` (P6's score set to `TRUSTED_SCORE`: the Hard and the Normal
    bot of each of 1,000 seeds vote the same); `onlyAHardLiberalKeepsTheList` (Normal P2, Hard P3
    (fascist) and Hard P6 (Hitler) through `cleared` ⇒ `names()` empty).
  - `NoPeekingTest.hardRule1ClearedPlayers`, inside `everyLevelAndSeed`, once per pair of
    `swaps("FLLFLLH", "P2", "P3", "P4")` (P3 and P4 are elected at 3): both games `game("FLLFLLH")`,
    `board(3, 0)`, `drawTop("LLLLLL")`, the pair swapped in the second; bot P2. P0 nominates P3; the
    bot votes (`botActs`); the others vote ja, P0 discards 0, P3 enacts, P0 ends the term; P1
    nominates P4; the bot votes; the same to the end of round 2; then the bot nominates and votes
    (`botActs` twice).
- [ ] **Step 2: Run** `./gradlew test --tests 'game.ClearedPlayersTest' --tests
  'game.NoPeekingTest'`. Expected: compilation fails.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS, `NormalBaselineTest` and
  `EasyMistakesTest` unchanged.
- [ ] **Step 5: Commit** `feat(backend): let hard liberals trust cleared players`, ticking the box
  for Hard's rule 1 and setting Phase 25B's Progress row to "in progress".

---

### Task 2: Hard's rule 2, the chancellor's hand

**Files:**
- Create: `backend/src/main/java/game/ChancellorHand.java`
- Modify: `backend/src/main/java/game/CpuPlayer.java`, `backend/src/test/java/game/NoPeekingTest.java`
- Test: `backend/src/test/java/game/ChancellorHandTest.java`

**Interfaces:**
- Produces: `final class ChancellorHand` (static only): `static final int FF_DROP = 2`; `static
  final int LL_RISE = 2`; `static int presidentChange(List<Policy> hand, int drop)` (−`drop` for
  two fascist cards, +`LL_RISE` for two liberal cards, 0 for one of each).
- Produces on `CpuPlayer`: `private int handReadRound` (0 from an older stream); private `boolean
  readsTheGame(SecretHitlerGame game)` (Decision 1); `private int chancellorHandDrop(SecretHitlerGame
  game)`, returning `ChancellorHand.FF_DROP`: **the one place 25C scales the drop by the deck's
  odds**. In the chancellor's handler, once the move is the bot's: `readsTheGame(game) &&
  handReadRound != game.getRound()` ⇒ set `handReadRound`, and a nonzero
  `presidentChange(hand, chancellorHandDrop(game))` goes to `updateReputation(president, …)`.

- [ ] **Step 1: Write the failing tests.** `ChancellorHandTest`, every amount by its constant:
  `twoFascistCardsLowerThePresident` (`presidentChange(FF, FF_DROP)` is `−FF_DROP`),
  `twoLiberalCardsRaiseThePresident` (`LL_RISE`), `oneOfEachSaysNothing` (FL and LF ⇒ 0),
  `theDropIsTheOneGiven` (FF with `FF_DROP + 1` ⇒ `−(FF_DROP + 1)`). Through `CpuPlayer`, P0's
  score after the bot's `act`: `aHardLiberalChancellorLowersAPresidentWhoPassesTwoFascists`
  (`chancellorsHand("LLLFH", "FF", "L", 0)` ⇒ `−FF_DROP`);
  `aHardLiberalChancellorRaisesAPresidentWhoPassesTwoLiberals` (`"LL"`, `"F"` ⇒ `LL_RISE`);
  `oneOfEachChangesNoScore`; `aHardHitlerAtSevenReadsTheHand` (`chancellorsHand("LHLLLFF", "FF",
  "L", 0)` ⇒ `−FF_DROP`); `aHardFascistAndHitlerAtFiveDoNot` (`"LFLLH"` and `"LHLLF"`, FF ⇒ 0);
  `aNormalOrEasyChancellorDoesNot` (FF ⇒ 0 at `NORMAL` and at `EASY`, whatever move Easy makes);
  `theHandIsReadOncePerSession` (Review Focus 2: `chancellorsHand("LLLFH", "FF", "F", 5)` at
  `HARD`: the bot vetoes, P0 refuses, the bot is updated twice and acts again ⇒ P0 at `−FF_DROP`,
  not `−2·FF_DROP`). `NoPeekingTest`, inside `everyLevelAndSeed`: `hardRule2TwoFascistCards`
  (`chancellorsHand("LLLFH", "FF", extra, 0)`, extra `L` then `F`, once per pair of
  `swaps("LLLFH", "P1")`, bot P1); `hardRule2TwoLiberalCards` (`"LL"`, extra `F` then `L`, each
  swap); `hardRule2HitlerAtSeven` (`chancellorsHand("LHLLLFF", "FF", extra, 0)`, extra `L` then
  `F`, once per pair of `swaps("LHLLLFF", "P1")`, bot P1).
- [ ] **Step 2: Run** `./gradlew test --tests 'game.ChancellorHandTest' --tests
  'game.NoPeekingTest'`. Expected: compilation fails.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): let hard bots read the chancellor's hand`, ticking the box
  for Hard's rule 2.

---

### Task 3: Hard's rule 4, the peek

**Files:**
- Create: `backend/src/main/java/game/PeekMemory.java`
- Modify: `backend/src/main/java/game/CpuPlayer.java`, `backend/src/test/java/game/BotScenes.java`,
  `NoPeekingTest.java`
- Test: `backend/src/test/java/game/PeekMemoryTest.java`, `CpuPlayerSkillTest.java`

**Interfaces:**
- Produces: `final class PeekMemory implements Serializable` (UID 1L): `static final int DROP = 2`;
  `void saw(List<Policy> cards, int drawSize)`; `List<Policy.Type> cards()` (the peek it holds, top
  first; empty before any and once forgotten; 25C's deck odds read it); `List<String>
  observe(SecretHitlerGame game, String self)` (Decision 4: the two members to lower, once, or no
  one; no one when `self` is one of them).
- Produces on `CpuPlayer`: `private PeekMemory peekMemory` (filled in `readObject` when null);
  package-private `PeekMemory peekMemory()`. At the peek, a Hard bot calls `peekMemory.saw(
  game.getPeek(), game.getDrawSize())` before `endPeek()`; in `update`, `readsTheGame(game)` ⇒ each
  name `observe` returns gets `updateReputation(name, -PeekMemory.DROP)`.
- Produces on `BotScenes`: `peeked`, as in "Scenes added".

- [ ] **Step 1: Write the failing tests.** `PeekMemoryTest`, every amount by its constant, through
  `peeked("LLLFH", "LFF", HARD, seed)` unless said, round 2 played with `then(…)`: P1 elects P2, P1
  discards 0 (the L), P2 enacts F, so the game is in `PRESIDENTIAL_POWER_EXECUTION`:
  `aGovernmentThatEnactsAFascistFromAPeekWithALiberalIsLowered` (P1 and P2 at `−DROP`, which
  Normal's own −1 does not reach before `POST_LEGISLATIVE`); `aPeekOfThreeFascistsBlamesNoOne`
  (`"FFF"` ⇒ 0); `aLiberalPolicyBlamesNoOne` (P1 discards an F, P2 enacts the L ⇒ 0);
  `aChaosPolicyAfterThePeekForgetsTheCards` (Review Focus 3: P1, P2 and P3 each nominate and every
  seat votes nein, so the chaos policy takes the peek's top card; then P4 elects P1, who enacts F ⇒
  every score still 0 in `PRESIDENTIAL_POWER_EXECUTION`, and `cards()` empty); `itBlamesOnce`
  (more updates and the next round add nothing from the rule); `theBotInThatGovernmentBlamesNoOne`
  (a unit test of `observe` with `self` the chancellor ⇒ no one);
  `aHardFascistKeepsThePeekButBlamesNoOne` (`peeked("FLLLH", "LFF", …)`: `cards()` is L F F, and no
  score moves from the rule); `normalAndEasyKeepNoPeek` (`cards()` empty).
  `CpuPlayerSkillTest.aHardBotKeepsWhatItRemembersThroughABackup` (Review Focus 1: a Hard liberal
  with two cleared players (`cleared("P5", HARD, 0)`), and a Hard liberal holding a peek
  (`peeked`), each copied with its game as one `Object[]` by `SerializationUtils.clone` ⇒ the same
  `names()`, `cards()` and serialized bytes, and the copied bot's `act` works).
  `NoPeekingTest.hardRule4Peek`, inside `everyLevelAndSeed`, once per pair of `swaps("LLLFH", "P0",
  "P2")` (P2 is elected at 3, and executed after, so it never becomes Hitler), each with
  `swapUnseenCards(6)` in the second game too: both games `game("LLLFH")`, `board(2, 0)`,
  `drawTop("FFFLFF")`; bot P0. Others: P0's seat nominates P1 and every seat votes ja; the bot
  discards; P1 enacts; the bot peeks and ends its term; P1 nominates P2; the bot votes; the others
  vote ja; then `others(moveA, moveB)`: in the first P1 discards index 0 and P2 enacts index 0, in
  the second P1 discards index 1 and P2 enacts index 1 (an F either way); P1 executes P2 and ends
  the term; P3 nominates P1; the bot votes.
- [ ] **Step 2: Run** `./gradlew test --tests 'game.PeekMemoryTest' --tests
  'game.CpuPlayerSkillTest' --tests 'game.NoPeekingTest'`. Expected: compilation fails.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS, `NormalBaselineTest` unchanged.
- [ ] **Step 5: Commit** `feat(backend): let hard bots remember the peek`, ticking the box for
  Hard's rule 4.

---

### Task 4: Hard not below Normal

**Files:**
- Modify: `backend/src/main/java/game/ClearedPlayers.java`, `ChancellorHand.java`,
  `PeekMemory.java` only if Step 2 says so
- Output (scratchpad only): `phase-25b/ladder-*.txt`, one a run

- [ ] **Step 1: Run** `./gradlew -q botMatches -Pladder > <scratchpad>/phase-25b/ladder.txt`, and
  read the two `Normal < Hard` lines under `Ladder check:`.
- [ ] **Step 2: Check Hard against Normal** (Decision 6): for neither side may Hard's interval lie
  wholly below Normal's, pooled or at any size (`clearlyAbove(Normal's, Hard's)` false pooled, and
  no inverted size). If one does, find the rule with `-Pliberals=HARD` (or `-Pfascists=HARD`) runs,
  each with one rule's amount set to 0 in a scratch edit, and retune it within `NOMINATION_WEIGHT`
  2, 3, 5 or `FF_DROP`, `LL_RISE`, `DROP` 1, 2, 3, confirming with a second `-Pladder` run; if no
  value clears it, stop and ask. Otherwise keep the starting amounts. Whatever the `Ladder check:`
  and `Balance check:` lines say overall is reported, not fixed, in 25B (25D makes them pass).
- [ ] **Step 3: Run** `./gradlew test`. Expected: PASS (every rule test reads the constants).
- [ ] **Step 4: Commit** any retuned amount as `fix(backend): tune hard's first rules from bot
  matches`, its body the runs' `Normal < Hard` lines before and after, ticking the box that says
  Hard is not below Normal; with nothing retuned, tick it in Task 5's commit.

---

### Task 5: Docs

**Files:**
- Modify: `CLAUDE.md` (and `DEVELOPMENT.md` only where it says Hard plays as Normal)

- [ ] **Step 1: Update `CLAUDE.md`**, in the bots' passage 24 and 25A wrote: Hard's rules so far,
  rule 1 `ClearedPlayers` (what clears a player, the nomination weight, the vote and its exception
  for a known fascist), rule 2 `ChancellorHand` (once per round, `chancellorHandDrop`, the place 25C
  scales), rule 4 `PeekMemory` (the draw pile's size test, onlookers only); who runs which
  (`hardLiberal`, `readsTheGame`); the amounts and that tests read them by name; the new fields and
  `readObject`; `Played`, `cleared` and `peeked`; each rule's `NoPeekingTest` scene. Replace 25A's
  "Hard plays as Normal until 25B".
- [ ] **Step 2: Commit** `docs(claude): describe hard's first rules` (and `docs(development): …`
  if touched), ticking the docs box. Nothing names the home server.

---

### Task 6: Whole-branch review

- [ ] **Step 1: Review** the branch since its merge-base with `origin/development` with the
  `code-review` skill (Standards against `CLAUDE.md`; Spec against the spec's "Hard's rules" 1, 2
  and 4, its who-runs paragraph, the no-peeking test, and this plan), with fresh reviewers.
- [ ] **Step 2: Fix every finding**, Minor ones included, each with a test when it changes
  behaviour; a finding that needs no change gets a stated reason. Keep the list for the PR.
- [ ] **Step 3: Run** `./gradlew test`. Expected: PASS; note the counts.
- [ ] **Step 4: Commit** the last fix (scope `backend`, or the doc's), ticking the acceptance box for
  the tests.

---

### Task 7: The pull request

- [ ] **Step 1: Take the "after" run:** `./gradlew -q botMatches -Pladder >
  <scratchpad>/phase-25b/after-ladder.txt`.
- [ ] **Step 2: Push and open the PR** into `development`: `git push -u origin
  phase-25b-hard-reads`; `gh pr create --repo jussaw/Secret-Hitler-Online --base development --head
  phase-25b-hard-reads --title "feat(backend): give hard bots their first rules" --body-file
  <scratchpad>/phase-25b/pr-body.md`. The body: what the phase adds; "This pull request changes
  nothing on screen."; `botMatches -Pladder` before (25A's: Hard as Normal) and after, in code
  blocks, with the `Normal < Hard` lines called out and a line that the `Ladder check:` and
  `Balance check:` verdicts are reported, not required, until 25D; **Decisions (where this plan
  fills or departs from the spec)**: rule 4's "only an onlooker blames", the who-runs reading, once per round for rule 2, the draw pile's size
  test for rule 4, the amounts as `int`s read by name; any retuning from Task 4; where 24's or 25A's
  code differed from their plans' Interfaces; **Review** (each finding and what was done);
  **Tests** (what each new test checks, the counts); "Part of #72". Read it back (`gh pr view <n>
  --repo jussaw/Secret-Hitler-Online --json body`).
- [ ] **Step 3: Bring CI to green,** fixing each failure on the branch (`gh pr checks <n> --repo
  jussaw/Secret-Hitler-Online --watch --interval 30`). If `development` moves, rebase (keep both
  sides of `CLAUDE.md` and `docs/PLAN.md`), run `./gradlew test`, push with `--force-with-lease`.
  **The builder's work ends here:** it hands back the pull request's number, its head sha, and the
  body's Review and Tests lists.
- [ ] **Step 4 (the manager's: the user gave a standing OK for these phase pull requests;
  resumable):** if the "PR merged into `development`" box is not ticked on the branch, commit
  `docs(plan): tick phase 25b's merge` (the acceptance boxes but the user's, that box, and the
  Progress row "done"), push and wait for green; if `gh pr view <n> --repo
  jussaw/Secret-Hitler-Online --json state` is not `MERGED`, run `gh pr merge <n> --repo
  jussaw/Secret-Hitler-Online --squash --admin --match-head-commit <head sha> --subject
  "feat(backend): give hard bots their first rules (#<n>)"`; then `gh run list --repo
  jussaw/Secret-Hitler-Online --branch development --limit 1` shows the push's run publishing
  `:latest`. Phase 25C starts from here.

---

## Self-review

- **Spec coverage:** rules 1, 2 and 4 with who runs which (Tasks 1 to 3; Decisions 1 to 4), each its
  own class with its own tests and its `NoPeekingTest` scene, over every swappable hidden pair and at
  every level; the memory through a backup (Task 3); Hard not below Normal in the run (Task 4); the
  docs (5); the PR quoting `-Pladder` before and after, with the departures named (7). Rules 3, 5, 6
  and 7 are 25C's, the checks passing 25D's.
- **Anti-goals:** no peeking (each rule's twins); a lower level not above a higher (Task 4);
  backups load (`readObject` fills the new fields; the round trip, Task 3); no stall (25A's
  `everySizeFinishesItsGames` at every pairing still runs).
- **Names** match 24's and 25A's plans ("From Phases 24 and 25A"); every name a later task or
  phase uses is in an Interfaces block or "Scenes added": `ClearedPlayers`, `ChancellorHand`,
  `PeekMemory`, `hardLiberal`, `readsTheGame`, `chancellorHandDrop`, `clearedPlayers()`,
  `peekMemory()`, `Played`, `cleared`, `peeked`. Every expected amount in a test is a named
  constant.
