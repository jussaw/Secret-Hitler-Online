# Phase 25C: Hard's other rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hard bots get the last four of Hard's rules (3, votes; 5, deck odds, which also scales rule
2's drop; 6, the election tracker; 7, fascists bluff), each with its own tests and a case in the
no-peeking test, at their starting amounts; `./gradlew botMatches -Pladder` is quoted before and
after with its verdicts reported, which Phase 25D then tunes to pass (issue #72, part 3).

**Architecture:** Every rule lives in `CpuPlayer` behind the bot's level, so Easy and Normal decide
exactly as before (25A's `NormalBaselineTest` holds Normal). The deck odds are a small class of
their own, `game.DeckOdds`, that is handed only numbers a seat can see (the board's counts, the
draw pile's size and the cards the bot saw discarded), so it cannot peek. Scores stay from −5 to +5
and carry fractions where a rule scales an amount: a remainder per player beside the whole-number
scores. 25A's `LadderCheck` gains the one comparison the spec's per-size rule needs that its steps
leave out. 25C does no tuning: 25D does, with a stop condition written out in full.

**Tech Stack:** Java 17, Gradle 7.4.2 wrapper, JUnit 4.12 (no `assertThrows`), commons-lang3's
`SerializationUtils` in tests. No new dependency.

**Spec:** [`docs/superpowers/specs/2026-11-17-bot-skill-design.md`](../specs/2026-11-17-bot-skill-design.md):
"Hard's rules" (rules 3, 5, 6 and 7, "who runs which rule" and the fractions), "The self-play run",
"The no-peeking test", "Names the phases share" and its file owners, Anti-goals, Constraints,
Phases, Tests ("25C") and Docs. Issue #72 has the rules' first wording (its line numbers are stale).
Builds on [Phase 24](2026-11-17-phase-24-bot-fixes.md), [Phase 25A](2026-11-17-phase-25a-bot-levels.md)
and [Phase 25B](2026-11-17-phase-25b-hard-reads.md), whose Interfaces this plan uses by name ("From
Phases 24 to 25B"); [Phase 25D](2026-11-17-phase-25d-ladder-balance.md) follows it. Parent plan:
[`docs/PLAN.md`](../../PLAN.md), Phase 25C. Where this plan and the spec differ, the spec wins.

## From Phases 24 to 25B

Their plans' Interfaces, used here by name. "Before you start" checks that they merged as planned;
where the code differs, keep the code's names, make this plan's change on them, and say so in the PR.

- **24:** `CpuTurn.step(SecretHitlerGame game, Collection<CpuPlayer> cpus, Runnable afterMove)` (true
  when the bots moved the game on, `cpus` in name order); `CpuPlayer`'s pinned `serialVersionUID =
  2392054316009854878L`; `investigationTargets` and `executionTargets`; `BotMatches`' `Tally`
  (`games()`, `liberalWins()`), `record Interval(double low, double high)` and `interval(int wins,
  int games)` (Wilson, z = 1.96), `Results` (`bySize`, `pooled()`, `table()`) and `play(gamesPerSize,
  label, makeBot)`.
- **25A:** `BotSkill`; `CpuPlayer(String name, BotSkill skill)`, `CpuPlayer(String name)` (Normal),
  `skill()`; `EASY_MISTAKE_CHANCE`, `mistake()` and `anyOf(List<T>)` (Easy's coin, drawn first at
  each decision, by Easy only); `void useRandom(Random)` (package-private, tests only); `playerReputation`
  still `HashMap<String, Integer>`, changed by `updateReputation(String, int)`. In the tests:
  `BotScenes` (seats `P0`, `P1`, …, `P0` the first president, every seat marked a bot; `game(roles)`,
  `board(g, fascist, liberal)`, `drawTop(g, cards)`, `swapRoles`, `swapUnseenCards(g, seen)`,
  `voteAll(g, ja)`, `elect(g, chancellor)`, `record Scene`, `bot(…, skill, seed)`, which seeds with
  `new Random(mix(seed))`; the builders `nomination`, `vote`, `presidentsHand`,
  `chancellorsHand(roles, hand, extra, fascist)`, `vetoAnswer`, `power`); `Decision.of` (`enact L`,
  `pass FL`, `vote ja`, …); `Twins` (`of`, `Visible`, which records only who has voted while
  `CHANCELLOR_VOTING` and the votes once the election closes, `others(move)`, `others(moveA,
  moveB)`, `botActs()`, `botA()`, `botB()`; it compares each bot's serialized memory, so a field 25C
  adds is compared with no change to it); `NoPeekingTest.everyLevelAndSeed(BiConsumer<BotSkill,
  Long>)` and its note on covering a new rule (build both games with `BotScenes`, set the hidden fact
  in the second, drive `Twins` through the moves that bring the rule into play, inside
  `everyLevelAndSeed`), each scene run once per swappable pair of other seats; `NormalBaselineTest`
  and `normal-baseline.txt`, **never re-recorded to make a change pass**; `LadderCheck` (`record
  Pairing(liberals, fascists)` with `label()`, `PAIRINGS` E/N, N/N, H/N, N/E, N/H, E/E, H/H,
  `BALANCE_BAND = 10`, `enum Side`, `wins(Side, Tally)`, `interval(Side, Tally)`,
  `clearlyAbove(Interval higher, Interval lower)` (`lower.high() < higher.low()`), `record Step(side,
  lower, higher, pooledClears, invertedSizes)` with `passes()`, `step(…)`, `ladder(results)`,
  `balanced(results)`, `verdicts(results)`); `BotMatches.ladder(int)`, `ladderReport(…)`,
  `makeBots`, `label`. `-Pladder` prints `Ladder check: PASS|FAIL (…)`, a line per step
  (`  Liberal side, Easy < Normal: … clears|overlaps; sizes inverted: none|…`) and `Balance check:
  PASS|FAIL (all-Hard …, all-Normal …, band 10 points)`.
- **25B:** `hardLiberal()` (rule 1's gate); `readsTheGame(SecretHitlerGame game)` (Hard, and not
  `FASCIST`, and not `HITLER` at 5 or 6 seats); rule 1, `ClearedPlayers` (`NOMINATION_WEIGHT` 3,
  `TRUSTED_SCORE` 3, `vote(game, chancellorScore, known)`, empty meaning Normal votes) and
  `clearedPlayers()`; rule 2, `ChancellorHand` (`FF_DROP` 2, `LL_RISE` 2, `presidentChange(List<Policy>
  hand, int drop)`), `handReadRound` and `private int chancellorHandDrop(SecretHitlerGame game)`,
  **the one place rule 5 scales rule 2's drop**; rule 4, `PeekMemory` (`DROP` 2, `saw(List<Policy>
  cards, int drawSize)`, `List<Policy.Type> cards()`, `List<String> observe(SecretHitlerGame game,
  String self)`) and `peekMemory()`. In the tests: `record Played(game, bot)` with `then(move)`, and
  the builders `cleared` and `peeked(roles, peek, skill, seed)`; `ClearedPlayersTest`,
  `ChancellorHandTest`, `PeekMemoryTest`, `CpuPlayerSkillTest`; `NoPeekingTest`'s rule 1, 2 and 4
  cases.
- **Their notes for 25C:** Normal's `update` judges no government of round 1 (`lastUpdatedRound`
  starts at 1), so an onlooker's judgement starts in round 2; and its president branch throws a
  `NullPointerException` if a test makes the bot's own discard for it before `update`
  (`chancellorChoices` unset), so a scene lets a bot in office discard for itself.

## Decisions

1. **Who runs which rule** (the spec's paragraph). Rules 3 and 5 run for every Hard bot that reads
   the game (`readsTheGame(game)`: liberal bots, and Hitler at 7 or more). Rule 6 runs for every
   Hard bot: liberal bots one way, the fascist side (fascist bots and Hitler, at every size) the
   other. Rule 7 runs for fascist bots (`Identity.FASCIST`) only; Hitler keeps its play. Both of
   rule 7's bluffs need fewer than 3 fascist policies down (the spec's window, for the chancellor
   and the president) and fewer than 4 liberal ones (`isFascistInDanger` false; Decision 9).
2. **Fractional scores.** The spec lets scores carry fractions where a rule scales an amount.
   `playerReputation` keeps its type (older backups hold its `Integer`s, and every decision reads
   it), so a Hard reader keeps the fraction beside it, `reputationCarry`. `shiftReputation(name,
   amount)` adds `amount` to the whole score (`playerReputation` plus carry), clamps it to [−5, 5],
   stores `Math.round` of it in `playerReputation` and the rest in the carry; no decision path
   changes. Whole-number changes keep using `updateReputation`. `score(name)` (package-private, for
   tests) is the clamped sum. Rule 2's drop becomes a `double` (`chancellorHandDrop`,
   `ChancellorHand.presidentChange`), and, as 25B's Decision 5 expects, 25B's whole-number amounts
   become `double`s: `ChancellorHand.FF_DROP` and `LL_RISE` and `PeekMemory.DROP` are `static final
   double` 2.0, and rules 2's and 4's score changes go through `shiftReputation`, so 25D can tune
   them in fractions. At 2.0 they change every score exactly as before.
3. **Deck odds (rule 5).** A hand is three cards drawn at random from the cards the seat cannot
   place: the 17 (6 liberal, 11 fascist) less the board's policies and less the cards it saw go to
   the discard pile since the last reshuffle. It sees: its own discard as president and the card it
   did not enact as chancellor (each recorded just before the game call that discards it), both
   cards of a veto it accepts as president (likewise), and its chancellor's discard of a pair it
   passed, deduced from the policy enacted. That deduction comes at the bot's first look after its
   chancellor enacts, and a reshuffle inside the enactment (`onEnactPolicy` shuffles the discards
   back when the draw pile falls under 3) has already put that card back: so it is recorded only
   when `getDrawSize()` is no larger than the size `DeckOdds` last saw
   (`!deck.reshuffledSince(drawSize)`), checked before that look, and skipped otherwise. A
   chancellor whose veto is accepted also saw both cards go to the discards; that case is left out
   on purpose (vetoes come only at 5 fascist policies, and a card left unplaced makes the odds less
   informed, never wrong). `getDrawSize` shows a reshuffle (the draw pile only grows when the
   discards go back in), which brings the seen discards back into the pool. The odds of a round's
   hand are taken at the bot's first look at that round's legislative session, after 25B's
   `peekMemory.observe` has run in that `update`: a peek still held then (`peekMemory().cards()`
   not empty) is this hand, so its odds are known, 1 for three fascists, else 0. A round it never
   saw drawn falls back to the board less the enacted policy. The onlooker's −1 for a fascist
   policy, where Normal's `update` judges it (round 2 on), becomes `−(1 − P(three fascists))`; its
   +1 for a liberal stays whole. Rule 2's drop becomes `ChancellorHand.FF_DROP` times the chance
   the president's discarded card was liberal, given the two fascists the chancellor holds:
   `liberals / (pool − 2)`. A pool that cannot be (under 3 cards, or a negative count, as after an
   odd restore) falls back to the cards not on the board.
4. **Votes (rule 3).** A reader records an election at its first look after the vote closes (any
   state but `CHANCELLOR_NOMINATION` and `CHANCELLOR_VOTING`), once per round, round 1's included,
   as `new Election(round, president, chancellor, new TreeMap<>(game.getVotes()))` (a sorted map, so
   `Twins` compares the same bytes). It never reads `getVotes()` while a vote is open, and never at
   a nomination, where the map still holds the last round's votes. Where the onlooker judges a
   government that enacted a fascist policy (not chaos), and only when an `Election` for this round
   was recorded (looked up by this round's number: a bot restored mid-round never uses an earlier
   round's entry), every other living player who voted yes, the government's two members and
   itself left out (the onlooker drop already judges them), gets `shiftReputation(−VOTE_DROP × (1 −
   P(three fascists)))`, so a forced hand blames no one and repeated backing adds up.
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
7. **The checks are 25A's `LadderCheck`**, which reads them as the spec words them: at each pooled
   step the two rates' 95% intervals do not overlap (`clearlyAbove`); a size fails when the higher
   level's interval lies wholly below the lower's; the balance is `balanced`. 25A's steps compare
   neighbours only (Easy < Normal, Normal < Hard), and the spec's per-size rule covers any higher
   level, so Task 2 adds an Easy < Hard step on each side: its pooled part follows from the other
   two, and its sizes catch an Easy clearly above Hard where Normal overlaps both. 25C reports the
   verdicts before and after its rules and needs neither check to pass; 25D tunes until both do.
8. **Backups.** `CpuPlayer` keeps 24's pinned `serialVersionUID`. New fields that come back null from
   an older backup are filled in `readObject`, as 25A's and 25B's are; new `int` and `double` fields
   are chosen so that 0 means "nothing seen yet". `DeckOdds` pins `serialVersionUID = 1L`; the
   nested record `Election` needs none (records are matched by component name). The amounts are
   `static final`, so no backup holds them. A fixture written by 25B's code (Task 1), holding a Hard
   bot with cleared players, proves a bot of every level loads under 25C's and plays its game out.
9. **Where this plan departs from or fills in the spec** (listed in the PR too):
   - `getDiscardSize` adds nothing: under this model every card the seat cannot place is equally
     likely to be anywhere it might be, so how they split between the draw and the discards does
     not change a hand's odds. `getDrawSize` is read, for reshuffles.
   - Rule 7 also stops once the liberals have 4 policies, a window the spec does not name: a bluff
     then could hand the liberals their fifth.
   - `liberalThirdCard = liberals / (pool − 2)` scales rule 2's drop by how likely the discarded
     card was liberal; it is a scale, not the exact posterior (which would weigh how likely a
     liberal or a fascist president is to pass two fascists).
   - Fractions are kept beside the whole scores (Decision 2), not in a new score type.
   - Hard keeps Normal's onlooker judgement from round 2 on; rule 3 records round 1's votes anyway.
   - An accepted veto's two cards are not counted by the chancellor (Decision 3).

## Global Constraints

- **Files.** 25C changes `backend/src/main/java/game/CpuPlayer.java` and 25B's `ChancellorHand.java`
  and `PeekMemory.java` (their amounts and the drop become `double`s); creates `backend/src/main/java/game/DeckOdds.java`; in
  `backend/src/test/java/game/` creates `DeckOddsTest`, `HardDeckOddsTest`, `HardBotBackupTest`,
  `HardVoteMemoryTest`, `HardTrackerTest` and `HardBluffTest`, and
  `backend/src/test/resources/bots-before-25c.ser`; changes 25A's `LadderCheck` and `LadderCheckTest`
  (one step), 25B's `ChancellorHandTest` (its scaled cases), 25B's `PeekMemoryTest` (its
  expectations read through `score` with a delta, as `ChancellorHandTest`'s are, once `DROP` is a
  `double`), `NoPeekingTest` (a case per rule) and
  `BotScenes` (one builder, `secondRound`); and the docs (`CLAUDE.md`'s bots section,
  `DEVELOPMENT.md`'s `botMatches` lines, Phase 25C's section and Progress row in `docs/PLAN.md`).
- **Never touch** `SecretHitlerGame.java` (no field, no method, not even private: the class pins no
  `serialVersionUID`), `game/datastructures/`, `CpuTurn.java`, `ClearedPlayers.java`, the rest of
  `PeekMemory.java` (only `DROP`'s type changes), `build.gradle`, `BotMatches.java`, `Twins.java`, `NormalBaselineTest` and
  `normal-baseline.txt`, anything in `server/` (26A owns `Lobby` and `SecretHitlerServer`'s command,
  26B owns `server/stats/` and `Lobby.handOverGame`), and `frontend/`. 26A and 26B are built at the
  same time and merge after 25D. A change one of them needs from `CpuPlayer` (`skill()` stays as
  25A made it): ask first.
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
- **Amounts.** Package-private `static final` constants in `CpuPlayer`, at their starting values:
  `VOTE_DROP = 0.25`, `LIBERAL_TRACKER_PUSH = 0.5f`, `FASCIST_TRACKER_PULL = 0.5f`,
  `CHANCELLOR_BLUFF_CHANCE = 0.35`, `PRESIDENT_BLUFF_CHANCE = 0.35`. 25C tunes nothing, 25B's
  amounts included; 25D does. Tests name the constants, never their values, so tuning edits no test.
- **A bot never throws or stalls.** Every new path ends in a legal move; the odds fall back rather
  than throw. A `-Pladder` run that fails a game past 2,000 moves is a bug: reproduce its position
  from the printed timeline in a test, fix it, and run again.
- **The checks are reported, not required.** 25C quotes `-Pladder` before and after, with its
  verdicts, whatever they say; 25D makes them pass.
- **Environment.** Java 17 from SDKMAN for every Gradle run: `export
  JAVA_HOME=<java-17-home>` (any installed Java 17: the default JDK is newer, and the Gradle
  7.4.2 wrapper does not run on it). Tests: `cd backend && ./gradlew test`. A full `-Pladder` run
  takes minutes: run it in the background (the Bash tool's `run_in_background`) and wait for its
  notification. Run outputs and the PR body live in the session scratchpad's `phase-25c/` folder,
  never in the repo.
- **Branch and commits.** Worktree and branch `phase-25c-hard-bots`, off `origin/development` once
  25B has merged. Conventional Commits with a scope (`backend`, `plan`, `claude`, `development`),
  lowercase imperative, at most 72 characters; each test in the commit with its code. Each task's
  last commit ticks the Phase 25C box in `docs/PLAN.md` that names its work (the coordinator wrote
  the entry: match by content; if no box names a task's work, tick none and say so in the PR).
- **The builder stops at green CI:** its work ends with the pull request open and CI green, handing
  back the PR number, its head sha and the Review and Tests lists. The merge is the manager's step.
  On a rebase, keep both sides of `docs/PLAN.md` (each phase its own row and boxes),
  `DEVELOPMENT.md`, `CLAUDE.md` and `README.md`; any other conflict: stop and report. The PR is
  squashed and says "Part of #72", never a closing keyword.
- **Public repo.** Nothing about the home server in code, docs, commits or the PR.

## Review Focus

1. **A bot from a backup made before 25C** (its new fields null, its level any of the three, a Hard
   one holding 25B's cleared players): it loads, remembers nothing new and plays its game out.
   Task 4 (`HardBotBackupTest`, on Task 1's fixture), extended in Task 5.
2. **A bot that sees an election late, or the last round's votes at a nomination:** it never records
   an election twice, never takes the last round's leftover votes for this round's, and never reads
   a vote still open. Task 5 (`aRoundItNeverSawIsNotTakenForTheNext`,
   `neverReadsAnElectionStillOpen`, `remembersEachElectionOnce`) and its no-peeking case.
3. **A reshuffle between two looks, or inside an enactment the bot's chancellor made:** the odds
   forget the seen discards, never count a card the reshuffle put back, and never throw. Task 3
   (`aReshuffleBringsSeenDiscardsBack`, `aPoolThatCannotBeFallsBackToTheCardsOffTheBoard`), Task 4
   (`aReshuffleInTheEnactmentDropsTheDeducedDiscard`).
4. **A Hard rule overriding a safer decision:** rule 6 turning rule 1's nein into a yes, or a bluff
   once the liberals have four policies. Task 6 (`rule1sNeinStandsAtTwo`), Task 7
   (`noBluffOnceTheLiberalsHaveFour`).
5. **Easy and Normal unchanged:** `NormalBaselineTest` at every commit, a Normal (and, where it decides,
   Easy) case in every rule task, and the after table's Easy and Normal rows matching the before
   table's within their intervals (Task 10's PR line; a difference beyond them is a bug to find
   first).

---

### Before you start

- [ ] **Make the worktree:** `git fetch origin`, then the worktree and branch `phase-25c-hard-bots`
  from `origin/development`, nested under the session's worktree folder.
- [ ] **Check the start point.** All must hold, or stop and tell the manager: `docs/PLAN.md`'s
  Progress table reads "done" for 24, 25A and 25B; `grep -n "^## Phase 25C" docs/PLAN.md` finds its
  section; the spec and this plan are in `docs/superpowers/`.
- [ ] **Check the names:** `git grep -n -e "void useRandom" -e "boolean readsTheGame" -e "boolean
  hardLiberal" -e "chancellorHandDrop" origin/development -- backend/src/main/java/game/CpuPlayer.java`;
  `git grep -n -e "class PeekMemory" -e "List<Policy.Type> cards" -e "class ChancellorHand" -e
  "class ClearedPlayers" origin/development -- backend/src/main/java/game/`; `git grep -n -e "class
  LadderCheck" -e "static List<Step> ladder" -e "everyLevelAndSeed" -e "record Played"
  origin/development -- backend/src/test/java/game/`; `git cat-file -e
  origin/development:backend/src/test/resources/normal-baseline.txt`. Each must be found. A name
  that differs from "From Phases 24 to 25B": use the code's and note it in
  `<scratchpad>/phase-25c/names.md` for the PR. If `LadderCheck` reads the checks other than as
  Decision 7 says, stop and ask.

---

### Task 1: Start, and bots from before 25C

**Files:**
- Modify: `docs/PLAN.md` (Phase 25C's Progress row)
- Create: `backend/src/test/resources/bots-before-25c.ser`
- Create (never committed): `<scratchpad>/phase-25c/fixture/game/WriteOlderBots.java`

**Interfaces:**
- Produces: the resource `/bots-before-25c.ser`, one `Object[] { SecretHitlerGame game,
  ArrayList<CpuPlayer> bots }` written with `ObjectOutputStream` by 25B's classes: seven seats `Bot
  1` to `Bot 7`, levels by seat EASY, NORMAL, HARD, EASY, NORMAL, HARD, EASY, the bots in name
  order, the game unfinished, and at least one Hard bot with a cleared player.

- [ ] **Step 1: Commit** `docs(plan): start phase 25c`: the Progress row reads "in progress" (and,
  if `git cat-file -e origin/development:docs/superpowers/plans/2026-11-17-phase-25c-hard-bots.md`
  fails, this file is added in the same commit).
- [ ] **Step 2: Write the generator** in `package game`, so it reaches the package-private
  `clearedPlayers()`: make the game and the bots as in Interfaces (`new CpuPlayer(name, skill)`,
  `initialize(game)`, a `TreeSet`), call `CpuTurn.step(game, bots, () -> {})` until some Hard bot's
  `clearedPlayers().names()` is not empty, starting over with a new game whenever `game.getState()`
  shows it finished first; then write the file named by `args[0]` and print the round, each bot's
  level and the cleared names.
- [ ] **Step 3: Run it on 25B's classes**, before any change: `cd backend && ./gradlew testClasses`;
  `javac -cp build/classes/java/main -d <scratchpad>/phase-25c/fixture/out
  <scratchpad>/phase-25c/fixture/game/WriteOlderBots.java`; `java -cp
  build/classes/java/main:<scratchpad>/phase-25c/fixture/out game.WriteOlderBots
  src/test/resources/bots-before-25c.ser`. Expected: the round, the seven levels and at least one
  cleared name printed; the file a few KB. Keep the generator's source for the PR body.
- [ ] **Step 4: Commit** `test(backend): keep bots from before phase 25c` (the `.ser` only).

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
- [ ] **Step 5: Take the "before" table,** in the background, timing it: `time ./gradlew -q
  botMatches -Pladder > <scratchpad>/phase-25c/ladder-before.txt 2>&1`. Expected: 25B's bots, the
  side-by-side table, both verdict lines and six step lines (whatever they say). Note the duration
  for the PR (25D budgets its session by it).
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
  - `boolean reshuffledSince(int drawSize)`: `drawSize` is larger than at the last look;
  - `void look(int drawSize)`: a reshuffle since the last look forgets the seen discards (a fresh
    memory's last size is 0, so its first look forgets nothing it had); then the size is kept;
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
  `allFascist(6, 11, 3)`); `aLargerPileMeansAReshuffle` (after `look(11)`: `reshuffledSince(11)`
  and `reshuffledSince(8)` false, `reshuffledSince(12)` true); `theCardBesideTwoHandedFascists`
  (`liberalThirdCard(0, 0)` is 6.0 / 15, and 5.0 / 14 after a liberal discarded);
  `aPoolThatCannotBeFallsBackToTheCardsOffTheBoard` (6 liberals and 11 fascists discarded at an
  empty board: `allFascistHand(0, 0)` is `allFascist(6, 11, 3)` and `liberalThirdCard(0, 0)` is
  6.0 / 15).
- [ ] **Step 2: Run** `./gradlew test --tests game.DeckOddsTest`. Expected: compilation fails.
- [ ] **Step 3: Implement** `DeckOdds` as in Interfaces (`C(n, k)` as a product in `double`; the
  numbers are at most C(17, 3)).
- [ ] **Step 4: Run** the test again. Expected: 13 passed.
- [ ] **Step 5: Commit** `feat(backend): work out the policy deck's odds for hard bots`.

---

### Task 4: Rule 5 in the bot, rule 2 scaled, and older backups

**Files:**
- Modify: `backend/src/main/java/game/CpuPlayer.java`, `backend/src/main/java/game/ChancellorHand.java`,
  `backend/src/main/java/game/PeekMemory.java` (`DROP`'s type)
- Modify (test): `BotScenes.java`, `ChancellorHandTest.java`, `PeekMemoryTest.java` (read
  through `score` with a delta, as `ChancellorHandTest`'s are, once `DROP` is a `double`),
  `NoPeekingTest.java`
- Create (test): `backend/src/test/java/game/HardDeckOddsTest.java`, `HardBotBackupTest.java`

**Interfaces:**
- Consumes: `DeckOdds` (Task 3); 25B's `readsTheGame(game)`, `chancellorHandDrop`, `ChancellorHand`,
  `peekMemory()`, `Played`, `peeked`; 25A's `useRandom`, `BotScenes`, `Twins`, `everyLevelAndSeed`;
  24's `CpuTurn.step`; `/bots-before-25c.ser` (Task 1).
- Produces on `CpuPlayer`: fields `private DeckOdds deck`, `private HashMap<String, Double>
  reputationCarry`, `private int drawnRound` and `private double drawnAllFascist` (the odds of the
  hand drawn in round `drawnRound`), and `private int passedRound` (the round in which this bot, as
  president, passed `chancellorChoices`; 0 for none, and back to 0 once its chancellor's discard is
  deduced or skipped); `double score(String name)` and `DeckOdds deckOdds()` (package-private);
  `private void shiftReputation(String name, double amount)` (Decision 2); `private double
  handAllFascist(SecretHitlerGame game)` (Decision 3: the snapshot of this round, a peeked hand's 1
  or 0 included, else `deck.allFascistHand(liberals, fascists − 1)` for a fascist policy it never
  saw drawn); `chancellorHandDrop` now `private double`, `ChancellorHand.FF_DROP ×
  deck.liberalThirdCard(liberals, fascists)`. `initialize` and the constructor set the new fields up
  empty, and `readObject` fills any that come back null.
- Produces on `ChancellorHand`: `static final double FF_DROP = 2.0` and `LL_RISE = 2.0`; `static double
  presidentChange(List<Policy> hand, double drop)` (−`drop` for two fascist cards, +`LL_RISE` for
  two liberal cards, 0 for one of each); the chancellor's handler sends a nonzero change to
  `shiftReputation(president, …)`. On `PeekMemory`: `static final double DROP = 2.0`, which rule 4's
  blame in `update` now applies as `shiftReputation(name, −PeekMemory.DROP)`. 25B's tests read these
  by name and pass unchanged in value.
- Produces on `BotScenes`: `static Played secondRound(String roles, String bot, BotSkill skill, long
  seed)`: `game(roles)`, the bot made first and updated after every move (`then`); round 1 played
  by the others: `drawTop("LLL")`, P0 elects P1 (every seat ja, the bot's made by the scene), P0
  discards 0, P1 enacts 0, P0 ends the term; it waits at round 2, P1 to nominate, one liberal
  policy down and no government judged (Normal's `update` skips round 1). It refuses a bot seat of
  P0 or P1.

- [ ] **Step 1: Write the failing tests** in `HardDeckOddsTest` (scores with tolerance 1e-9),
  `secondRound("LLLFH", "P2", HARD, seed)` unless said, round 2 played with `then(…)`: P1 elects P3
  from `drawTop("FFL")`, P1 discards the L, P3 enacts an F:
  - `anOnlookerScalesTheFascistDrop`: P1's and P3's `score` is `−(1 − DeckOdds.allFascist(5, 11,
    3))` and `playerReputation` −1.
  - `anOnlookerKeepsTheWholeRaiseForALiberal`: `"LLF"`, the F discarded, an L enacted: both scores
    exactly 1.0.
  - `aSeenDiscardChangesTheOdds`: `secondRound("LLFLH", "P3", …)`: round 2 P1 elects the bot from
    `"LFF"` and discards an F, the bot enacts the L itself (`act`); round 3 P2 elects P0 from
    `"FFL"`, discards the L, P0 enacts an F: P2's score is `−(1 − DeckOdds.allFascist(4, 10, 3))`.
  - `thePresidentDeducesItsChancellorsDiscard`: round 2 fails (P1 nominates P3, every seat nein);
    round 3 the bot presides: `drawTop("FFL")`, the scene nominates P0 for it and every seat votes
    ja, the bot discards itself (an F, passing F and L), P0 enacts the F: then
    `deckOdds().allFascistHand(1, 1)` equals `DeckOdds.allFascist(4, 9, 3)` (its own F and the
    deduced L placed).
  - `aReshuffleInTheEnactmentDropsTheDeducedDiscard` (the audit's case): a bot made first on
    `game("LLLFH")` at P2, `board(g, 4, 2)`; rounds 1 and 2 enact a liberal each from `"LFF"` (P0
    with P1, then P1 with P3; each president discards an F); round 3 the bot presides:
    `drawTop("FFL")`, the scene nominates P0 for it and every seat votes ja, so the draw pile is at
    2 after the deal; the bot discards itself (passing F and L); P0 enacts the F and the pile
    reshuffles: after the bot's `update`, `deckOdds().allFascistHand(4, 5)` equals
    `DeckOdds.allFascist(2, 6, 3)`, the board-only pool.
  - `aPeekedHandIsKnownNotGuessed`: 25B's `peeked("LLLFH", peek, HARD, seed)`, then P1 elects P2, P1
    discards index 0, P2 enacts index 0, P1 executes P3: for peek `"FFF"` P1's and P2's scores are
    0; for `"LFF"` both are `−(1 + PeekMemory.DROP)`.
  - `theChancellorsDropIsScaledByTheDiscardedCard`: 25A's `chancellorsHand("LLLFH", "FF", "L", 0)` at
    `HARD`: P0's score is `−ChancellorHand.FF_DROP × 6.0 / 15`; `chancellorsHand("LLLFH", "FF", "F",
    5)`: `−FF_DROP × 6.0 / 10`.
  - `othersStillDropByOne`: the first scene with a Normal and an Easy liberal at P2, and with a Hard
    fascist at P2 of `"LLFLH"`: P1's score exactly −1.0.
  - `hitlerAtSevenSeatsReadsTheOdds`: `secondRound("LLHLLFF", "P2", HARD, seed)`, P1 elects P3 from
    `"FFL"`, an F enacted: the scaled drop.

  `HardBotBackupTest`, on `/bots-before-25c.ser`: `botsFromBefore25CKeepTheirLevels` (EASY, NORMAL,
  HARD, … by seat, and the Hard bot's cleared names as the generator printed them);
  `botsFromBefore25CRememberNothingNew` (for every bot and every seat, `score` equals
  `playerReputation`); `botsFromBefore25CPlayTheirGameOut` (`CpuTurn.step` until the game is
  finished, within 2,000 steps, with no exception). In 25B's `ChancellorHandTest`, the cases rule 5
  now scales: the unit cases take a `double` drop (FF with 3.0 ⇒ −3.0);
  `aHardLiberalChancellorLowersAPresidentWhoPassesTwoFascists` and `aHardHitlerAtSevenReadsTheHand`
  expect `score` `−FF_DROP × 6.0 / 15`; `theHandIsReadOncePerSession` (at 5 fascist policies)
  expects `−FF_DROP × 6.0 / 10`, once. They are Hard's alone; `NormalBaselineTest` is not touched.
- [ ] **Step 2: Extend the no-peeking test:** `hardRule5DeckOdds`, inside `everyLevelAndSeed`. Both
  games `game("LLLFH")`, bot P2, the second with `swapUnseenCards(g, 3)` once round 2's hand is on
  top; round 1 as `secondRound` plays it (the bot's vote by `botActs`); round 2: `drawTop("FFL")`, P1
  nominates P3, the bot votes, the others vote ja, then `others(moveA, moveB)`: P1 discards the L in
  the first and an F in the second, P3 enacting an F either way; P1 ends the term; then the bot, now
  president, nominates (`botActs`). 25B's `hardRule2TwoFascistCards` (the president's discard
  differing) now also covers rule 2's scaling and must pass unchanged.
- [ ] **Step 3: Run** `./gradlew test --tests game.HardDeckOddsTest --tests game.HardBotBackupTest
  --tests game.ChancellorHandTest --tests game.NoPeekingTest`. Expected: the new and changed tests
  fail (no `score`, no scaling).
- [ ] **Step 4: Implement** in `CpuPlayer`, for readers only (`readsTheGame(game)`): in `update`, after
  25B's `clearedPlayers` and `peekMemory` observations, first the deduction (Decision 3: when
  `passedRound` is this round, the session is over and `didElectionTrackerAdvance()` is false,
  `deck.discarded` of the passed card the chancellor did not enact unless
  `deck.reshuffledSince(game.getDrawSize())`; `passedRound` back to 0 either way), then
  `deck.look(game.getDrawSize())`, then the round's snapshot at the first look at
  `LEGISLATIVE_PRESIDENT`, `LEGISLATIVE_CHANCELLOR` or `LEGISLATIVE_PRESIDENT_VETO`; in Normal's
  onlooker branch, the fascist drop as `shiftReputation(name, −(1 − handAllFascist(game)))`;
  `deck.discarded` just before the game call for the card it discards as president (setting
  `passedRound`), the card it does not enact as chancellor and both cards of a veto it accepts;
  rule 2 as in Interfaces. `readObject` fills `deck` and `reputationCarry` when null.
- [ ] **Step 5: Run** the tests again, then `./gradlew test`. Expected: all pass,
  `NormalBaselineTest` unchanged.
- [ ] **Step 6: Commit** `feat(backend): scale hard bots' suspicion by the deck's odds`.

---

### Task 5: Rule 3, votes

**Files:**
- Modify: `backend/src/main/java/game/CpuPlayer.java`
- Modify (test): `NoPeekingTest.java`, `HardBotBackupTest.java`
- Create (test): `backend/src/test/java/game/HardVoteMemoryTest.java`

**Interfaces:**
- Consumes: `shiftReputation`, `handAllFascist` (Task 4); `BotScenes.secondRound`, `vote`, `Played`.
- Produces on `CpuPlayer`: `record Election(int round, String president, String chancellor,
  Map<String, Boolean> votes) implements Serializable` (nested, package-private; `votes` a
  `TreeMap`); `private ArrayList<Election> elections`; `List<Election> elections()`
  (package-private, unmodifiable, oldest first); `static final double VOTE_DROP = 0.25`. Decision 4.

- [ ] **Step 1: Write the failing tests** in `HardVoteMemoryTest`, on `secondRound("LLLFH", "P2",
  HARD, seed)` unless said:
  - `remembersEveryVoteOnceTheElectionCloses`: after round 1, `elections()` is `[Election(1, "P0",
    "P1", every seat true)]`; round 2: P1 nominates P3, P0, P1 and P4 vote ja, P3 nein, the bot
    votes last (`act`, then `update`; its vote `v`): then `Election(2, "P1", "P3", {P0: true, P1:
    true, P2: v, P3: false, P4: true})` follows, its `votes` a `TreeMap`.
  - `remembersAFailedElection`: round 2 all nein: its election, president P1, follows round 1's.
  - `neverReadsAnElectionStillOpen`: round 2 with two votes in, an `update`: round 1's alone.
  - `aRoundItNeverSawIsNotTakenForTheNext`: a bot on a fresh `game("LLLFH")`, not updated through
    round 1; at round 2's nomination an `update` records nothing; after round 2's vote closes, one
    election, round 2, president P1.
  - `remembersEachElectionOnce`: three `update`s after the close: one entry for the round.
  - `lowersYesVotersOfAGovernmentThatEnactsAFascistPolicy`: round 2: P1 elects P3 from `"FFL"` with
    P4 voting nein and the rest ja, P1 discards the L, P3 enacts an F: P0's score is `−VOTE_DROP × (1
    − DeckOdds.allFascist(5, 11, 3))`, P4's 0, P1's and P3's the onlooker drop alone.
  - `leavesVotersOfALiberalPolicyAlone`: `"LLF"`, an L enacted: P0, no member, stays at 0.
  - `aChaosPolicyBlamesNoVoter`: `secondRound("LLFHL", "P4", …)`: rounds 2 to 4 fail with P0 ja each
    time: P0's score 0.
  - `backingAddsUp`: `secondRound("LLFHL", "P4", …)`: round 2 P1 and P2, round 3 P2 and P3, each
    enacting an F from `"FFL"` with P0 ja: P0's score is `−VOTE_DROP × ((1 −
    DeckOdds.allFascist(5, 11, 3)) + (1 − DeckOdds.allFascist(5, 10, 3)))`.
  - `onlyReadersRemember`: a Normal and an Easy liberal at P2, a Hard fascist at P2 of `"LLFLH"` and
    a Hard Hitler at P2 of `"LLHLF"`: `elections()` empty; a Hard Hitler at P2 of `"LLHLLFF"`:
    round 1's election.

  `HardBotBackupTest.botsFromBefore25CRememberNothingNew` also checks `elections()` empty.
- [ ] **Step 2: Extend the no-peeking test:** `hardRule3Votes`, inside `everyLevelAndSeed`, two pairs:
  - Both games `game("LLLLFFH")`, bot P2, the second with `swapRoles(P3, P5)` (a liberal and a
    fascist, among 25A's swappable pairs). Round 1 as `secondRound` plays it (the bot's vote by
    `botActs`). Round 2: `drawTop("FFL")`, P1 nominates P4, P3 and P5 vote ja, P6 nein, the bot
    votes (`botActs`), the rest ja; P1 discards the L, P4 enacts an F, P1 ends the term. Round 3:
    the bot presides and nominates (`botActs`), the bot votes (`botActs`), the others vote nein,
    the bot ends its term (`botActs`). Round 4: P3, a yes-voter, nominates P0, and the bot votes
    (`botActs`): a decision that reads P3's score.
  - `vote("LLLFH")` (bot P2, no one voted yet), with `others(moveA, moveB)`: P3 votes ja in the
    first and nein in the second, then `botActs()` (25A's `Visible` shows only who has voted while
    the election is open).
- [ ] **Step 3: Run** `./gradlew test --tests game.HardVoteMemoryTest --tests game.HardBotBackupTest
  --tests game.NoPeekingTest`. Expected: compilation fails (no `Election`).
- [ ] **Step 4: Implement** Decision 4 in `update`, for readers: record after `deck.look` and the
  snapshot, judge in Normal's onlooker branch beside rule 5's drop, through this round's
  `Election` only; `readObject` fills `elections` when null; `initialize` clears it.
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
  P2 at score 0: `2t − t²` at t = 0.75, 0.9375, as at tracker 0); `hitlerAtSevenSeatsPullsBackToo`
  (that Hitler with P2 nominating P0, both at score 0: `0.75 × (1 − FASCIST_TRACKER_PULL)`);
  `oneFailedElectionChangesNothing` (a Hard liberal at tracker 1: 0.75);
  `normalAndEasyIgnoreTheTracker` (Normal and Easy liberals at tracker 2: 0.75).
- [ ] **Step 4: Extend the no-peeking test:** `hardRule6Tracker`, inside `everyLevelAndSeed`. Twins
  with the two failed elections and round 3's nomination, then `botActs()` for the bot's vote, the
  second game differing in what the bot cannot see:
  - a Hard liberal at P3 of `"LLFLH"`, P2 nominating P0: `swapRoles(P0, P4)` (the nominee, a
    liberal, with Hitler);
  - a Hard Hitler at P3 of `"LLLHLFF"`, P2 nominating P0: `swapRoles(P0, P5)` (the nominee, a
    liberal, with a fascist it has not investigated);
  - a Hard fascist at P3 of `"LLLFH"`, which knows every role: `swapUnseenCards(g, 0)`.
- [ ] **Step 5: Run** `./gradlew test --tests game.HardTrackerTest --tests game.NoPeekingTest`.
  Expected: the rule-6 tests fail.
- [ ] **Step 6: Implement** Decision 5 in `chanceOfYes`, Hard only.
- [ ] **Step 7: Run** the tests again, then `./gradlew test`. Expected: all pass,
  `NormalBaselineTest` unchanged.
- [ ] **Step 8: Commit** `feat(backend): let hard bots weigh the election tracker`.

---

### Task 7: Rule 7, fascists bluff

**Files:**
- Modify: `backend/src/main/java/game/CpuPlayer.java`; `NoPeekingTest.java`
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
- [ ] **Step 6: Commit** `feat(backend): let hard fascists bluff`, ticking the box for Hard's rules
  3, 5, 6 and 7 in Phase 25C's section of `docs/PLAN.md`.

---

### Task 8: Docs

**Files:**
- Modify: `CLAUDE.md` (the bots section only); `DEVELOPMENT.md` (`botMatches`' lines)

- [ ] **Step 1: Update `CLAUDE.md`'s bots section** in the house style, beside 24's, 25A's and 25B's
  lines: Hard's rules 3, 5, 6 and 7 at their starting amounts and who runs each (Decision 1);
  `DeckOdds`, what a seat counts and the deduced discard's reshuffle check, the peek's known hand
  (Decision 3); the scores' carry and `score`, `chancellorHandDrop` scaled, and 25B's amounts
  `double`s through `shiftReputation` (Decision 2); `Election` and `elections()`; `chanceOfYes`; the new fields filled in `readObject` and the
  fixture `bots-before-25c.ser` with `HardBotBackupTest`; `LadderCheck`'s Easy < Hard step;
  `BotScenes.secondRound`; the new test classes; that 25D tunes the amounts. Nothing about the
  lobby or the records (26A's and 26B's sections), nothing about the home server.
- [ ] **Step 2: Update `DEVELOPMENT.md`'s** `botMatches` section: the six step lines under `Ladder
  check:`.
- [ ] **Step 3: Commit** `docs(claude): describe the hard bots' other rules` and `docs(development):
  describe the easy against hard step`, the last ticking the docs box in Phase 25C's section of
  `docs/PLAN.md`.

---

### Task 9: Review

- [ ] **Step 1: Review.** Run the `code-review` skill against `origin/development`, with the spec,
  Phase 25C's section of `docs/PLAN.md` and this plan as the spec.
- [ ] **Step 2: Fix every finding,** Minor ones included, each with a test where it changes
  behaviour, in commits of their own; a finding that needs no change gets its reason. Keep the list
  (finding, what was done) for the PR's Review section. A fix in a file another phase owns: ask
  first.
- [ ] **Step 3: Run** `./gradlew test`. Expected: all pass, `NormalBaselineTest` unchanged; keep the
  counts for the PR.
- [ ] **Step 4: Commit** the last fix with the acceptance box for the tests ticked (or `docs(plan):
  tick phase 25c's test box` if there was nothing to fix).

---

### Task 10: Pull request

- [ ] **Step 1: Take the "after" table,** in the background, on the branch's last code: `time ./gradlew
  -q botMatches -Pladder > <scratchpad>/phase-25c/ladder-after.txt 2>&1`, and note its duration.
- [ ] **Step 2: Write the body** in `<scratchpad>/phase-25c/pr-body.md`: a summary ("Part of #72");
  "This pull request changes nothing on screen." in place of the screenshot table; Changes; the
  rules with their starting amounts and who runs each; the full `-Pladder` output before (25B's
  bots) and after, each in a code block with its verdict lines, and a line that 25C reports them
  and 25D tunes them to pass; a line that the Easy and Normal rows of the two tables agree within
  their intervals; a full `-Pladder` run's duration (for 25D's budget); Decisions (this plan's 1 to
  9, Decision 9 in full; the changes to 25A's `LadderCheck` and `BotScenes` and to 25B's
  `ChancellorHand`, `PeekMemory` and `ChancellorHandTest`; every name from `names.md` that
  differed); the fixture
  generator's source, in a code block; Review; Tests (counts).
- [ ] **Step 3: Push and open the PR:** `git push -u origin phase-25c-hard-bots`; `gh pr create
  --repo jussaw/Secret-Hitler-Online --base development --head phase-25c-hard-bots --title
  "feat(backend): add hard bots' votes, odds, tracker and bluffs" --body-file
  <scratchpad>/phase-25c/pr-body.md`. Read it back (`gh pr view --repo jussaw/Secret-Hitler-Online
  --json body`).
- [ ] **Step 4: Bring CI to green,** fixing on the branch and pushing until every job passes. If
  `development` moves while it is open, rebase as Global Constraints says, run `./gradlew test`,
  push with `--force-with-lease`. **The builder's work ends here:** hand back the PR number, its
  head sha, the Review list and the Tests list.
- [ ] **Step 5 (the manager's, with the standing OK):** if the "PR merged into `development`" box is
  not ticked on the branch, commit `docs(plan): tick phase 25c's merge` (that box and the Progress
  row "done"), push and wait for green; then `gh pr merge <n> --squash --admin --match-head-commit
  <head sha> --repo jussaw/Secret-Hitler-Online --subject "feat(backend): add hard bots' votes,
  odds, tracker and bluffs (#<n>)"`, and check that `development`'s run published the image. 25D
  starts from here.
