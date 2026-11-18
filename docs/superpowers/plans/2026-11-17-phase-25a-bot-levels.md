# Phase 25A: Bot skill levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every bot gets a level, `BotSkill` (Easy, Normal, Hard): Easy is Normal with a share of
random legal moves, Normal is Phase 24's bot unchanged, and Hard is Normal plus Hard's rules 1
(cleared players), 2 (the chancellor's hand) and 4 (the peek). `botMatches` plays each side at its
own level and prints the ladder and balance pairings side by side, and a no-peeking test shows that
no level reads what its seat could not see. The lobby still seats Normal bots (issue #72).

**Architecture:** `CpuPlayer` keeps its level in a field set by a new constructor and filled in
`readObject` for older backups. An Easy bot draws a coin as each decision starts and, on a mistake,
picks uniformly among that decision's legal moves; Normal's code paths and their random draws are
left as they are, held by a golden test recorded on Phase 24's code before anything changes. Hard's
rules are small classes in `game` (`ClearedPlayers`, `ChancellorHand`, `PeekMemory`) whose memory
`CpuPlayer` keeps in serialized fields and calls from `update` and its handlers, each gated by who
runs that rule. In the test source set, `BotScenes` builds a game at any decision (fixed roles,
board and cards, by reflection on `SecretHitlerGame`'s private `board` and `draw` only), `Twins`
runs one bot in two games its seat cannot tell apart and compares every decision and the bot's whole
serialized memory. `BotMatches` gains per-side levels the way Phase 24 left room for them (a bot
maker that reads the seat's role, and a label naming both levels, passed to 24's `play`) and
`-Pladder`, whose ladder and balance verdicts come from `LadderCheck` on 24's `Interval`.

**Tech Stack:** Java 17, Gradle 7.4.2 (wrapper), JUnit 4.12 (no `assertThrows`), commons-lang3's
`SerializationUtils` in tests (already a dependency, as Phase 24's tests use it). No new
dependency. Backend only.

**Spec:** [`docs/superpowers/specs/2026-11-17-bot-skill-design.md`](../specs/2026-11-17-bot-skill-design.md):
Anti-goals, Constraints, "Levels", "Easy's mistakes", "Hard's rules" (the who-runs paragraph and
rules 1, 2 and 4), "The self-play run" (options, the ladder and balance checks), "The no-peeking
test", "Names the phases share", Phases, Tests ("25A"), Docs. Issue #72 has the original detail
(its line numbers are stale). Builds on Phase 24's breakdown,
[`2026-11-17-phase-24-bot-fixes.md`](2026-11-17-phase-24-bot-fixes.md), whose Interfaces this plan
uses by name ("From Phase 24", below). Parent plan: [`docs/PLAN.md`](../../PLAN.md), Phase 25A.
Where this plan and the spec differ, the spec wins.

## Decisions (the spec's rules as this plan builds them, and what it leaves to the builder)

1. **Easy's coin.** Only an Easy bot draws it: `random.nextDouble() < EASY_MISTAKE_CHANCE`, once the
   handler has found the move is the bot's (it is president, chancellor, or has not voted) and
   before anything else; a mistake then takes `random.nextInt(n)` among the decision's legal moves.
   Normal and Hard never draw it, so their random streams stay Phase 24's.
2. **Legal moves**, one entry per move: a nomination, every living seat but the bot, the last
   chancellor, and the last president while more than 5 live (`nominateChancellor`'s own rules); a
   vote, ja or nein; the president's discard, each of the three cards by place (so a hand of F F L
   passes F L two times in three); the chancellor's choice, each card, plus VETO when
   `getNumFascistPolicies() == 5 && !didVetoOccurThisTurn()`; a veto answer, accept or refuse; an
   investigation, Phase 24's `investigationTargets(game)`; a special election, living seats but the
   bot; an execution, Phase 24's `executionTargets(game)` (living, not the bot, and for a fascist or
   Hitler no seat `knownPlayerRoles` names `FASCIST` or `HITLER`), so Easy draws among exactly the
   seats Normal picks among. The peek and END TERM are not decisions: Easy does them as every bot
   does.
3. **A mistake replaces the move only.** What the bot learns while making it stays Normal's:
   `chancellorChoices` from the card it really discarded, the veto answer's score change, an
   investigation's party in `knownPlayerRoles`.
4. **Who runs which rule** (the spec's paragraph): `hardLiberal()` (Hard and dealt Liberal) runs
   rule 1, and only it; `readsTheGame(game)` (Hard and not knowing every role: not `FASCIST`, and
   not `HITLER` at 5 or 6 seats, as `initialize` decides) runs rule 2 and rule 4's blame, reading
   the rules' "a Hard liberal bot" as "a Hard bot that reads the game", as the spec says; every Hard
   president that peeks keeps the cards (25B's deck odds read them). Rule 4 cannot matter for Hitler
   at 7 or more: only the 5 to 6 board has the peek.
5. **Rule 1.** A chancellor is cleared when the bot sees `LEGISLATIVE_PRESIDENT`,
   `LEGISLATIVE_CHANCELLOR` or `LEGISLATIVE_PRESIDENT_VETO` with 3 or more fascist policies down: in
   those states the election has passed, the game went on, and nothing has been enacted since. Bots
   are updated after every command and before every CPU step, so one of those states is seen for
   every passed election. Nominating, a cleared seat's weight is multiplied by
   `NOMINATION_WEIGHT`. Voting, a cleared chancellor gets ja, unless the bot's own investigation
   found the president or the chancellor `FASCIST`, when Normal votes (the spec is silent there, and
   voting in a known fascist hands the fascists a policy); with 3 or more fascist policies, a
   chancellor not cleared gets nein unless their score (with identity) is `TRUSTED_SCORE` (3) or
   more, when Normal votes; otherwise Normal votes.
6. **Rule 2.** Read in the chancellor's handler, once per round (`handReadRound`), so the second
   decision after a refused veto reads nothing again: two fascist cards lower the president by
   `chancellorHandDrop(game)`, two liberal cards raise them by `ChancellorHand.LL_RISE`, one of each
   changes nothing. In 25A `chancellorHandDrop` returns `ChancellorHand.FF_DROP`; it is the one place
   25B scales the drop by the deck's odds (rule 5), and 25B changes its type with the scores' when
   they carry fractions (the spec: "Scores stay from −5 to +5 but may carry fractions").
7. **Rule 4.** At the peek a Hard president keeps the three cards and the draw pile's size. The first
   legislative state it then sees belongs to the government that drew them if the pile is exactly 3
   smaller; any other size means a chaos policy or a reshuffle came between, and the cards are
   forgotten. When that government's session ends (the first state after it that is not a
   legislative one), a reader lowers both members by `PeekMemory.DROP` if they enacted a fascist
   policy and the cards held a liberal, and forgets the cards either way. Only an onlooker blames:
   as that government's president the bot held the cards itself, and as its chancellor rule 2 reads
   what it was handed (the spec is silent on both).
8. **Amounts** are the spec's "starting points": Task 9 checks them with `botMatches` and keeps them
   unless a run says otherwise.
9. **The no-peeking test.** Two games are built separately by the same `BotScenes` builder, so they
   share every visible move; the hidden fact (another seat's role, an unseen card, a card another
   president discarded) is set in the second. One bot per game, made with the same level and seed.
   Before each of its acts the two games must look the same from its seat (`Twins.Visible`); after
   it, the two decisions (`Decision.of`) and the two bots' serialized forms must be equal, so any
   field a rule adds is compared without changing `Twins`. Every scene runs at every level for
   seeds 0 to 199.
10. **Normal's baseline** is recorded once, on Phase 24's code, before any change: 20 scenes, seeds
    0 to 19, in `backend/src/test/resources/normal-baseline.txt`. It is never re-recorded to make a
    change pass; 25B keeps it too.
11. **`botMatches`.** No second `play`: the levels reach 24's `play(gamesPerSize, label, makeBot)`
    through `makeBots(liberals, fascists)`, which gives a seat dealt `LIBERAL` the liberals' level
    and one dealt `FASCIST` or `HITLER` the fascists', and `label(liberals, fascists)`, which 24's
    `play` puts in a failed game's message, so a stuck game names its size, both levels and its
    timeline. `-Pladder` plays the seven pairings E/N, N/N, H/N, N/E, N/H, E/E and H/H
    (liberals/fascists). The ladder check, as the spec now words it: at each pooled step the two
    rates' 95% intervals (24's `Interval`) do not overlap, the higher level's above
    (`LadderCheck.clearlyAbove`: `lower.high() < higher.low()`); a size is inverted when the higher
    level's interval lies wholly below the lower's. The balance check: the pooled liberal rates of
    H/H and N/N at most `BALANCE_BAND` (10) points apart, compared in whole numbers. `-Pladder`
    prints both verdicts; in 25A they are reported and need not pass (25B makes them pass), except
    the Easy steps, which Task 9 tunes to clear, and Hard, which must not be inverted.
    `LadderCheck` is 25A's; 25B uses it and only adds to it. 24's `Interval` is reused, not a new
    rate type: it is already the interval the table prints.
12. **The pre-level backup test** uses the committed `backup-before-recorder.db` (written long before
    levels: a lobby in a game with three bots, carrying the UID Phase 24 pinned), reaching its bots
    by reflection on `Lobby`'s private `cpuPlayers`, since `Lobby` is not changed.
13. **Tuning `EASY_MISTAKE_CHANCE`:** the lowest of 0.25, 0.20, 0.15, 0.10 and 0.05 at which both
    sides' Easy step clears (Easy's and Normal's pooled intervals not overlapping, Easy below, and
    no size inverted), confirmed by a second run.

## From Phase 24

Its plan's Interfaces, used here by name. "Before you start" checks that they merged as planned;
where the code differs, keep 24's code, make this plan's change on it, and say so in the PR.

- `public static boolean CpuTurn.step(SecretHitlerGame game, Collection<CpuPlayer> cpus, Runnable
  afterMove)`, `cpus` in name order, true when the bots moved the game on.
- `CpuPlayer`: `private static final long serialVersionUID = 2392054316009854878L;` (no field
  added by 24); `random` still a transient `Random` made in the constructor and in `readObject`;
  the public `chooseRandomPlayerWeighted(List<Player>, float, float, float, float)` (living others
  only, refusing an empty list) drawing through the package-private `static int
  getWeightedRandomIndex(float[] weights, double draw)`; the private `List<Player>
  investigationTargets(SecretHitlerGame)` and `List<Player> executionTargets(SecretHitlerGame)`
  (meant for 25A's Easy picks), each handler one pick over them; today's handler names.
- `server.stats.CpuGames.play(int seats, LongSupplier clock, long startedAt, int stopAtRound,
  BiFunction<String, Identity, CpuPlayer> makeBot)`: deals, then makes each seat's bot with
  `makeBot.apply(name, role)` and initializes it; the 4-argument `play` passes `(name, role) -> new
  CpuPlayer(name)`.
- `BotMatches` (`backend/src/test/java/game/`): `DEFAULT_GAMES = 2_000`; `ENDINGS`;
  `BOTS_AS_BUILT` and `BOTS_AS_BUILT_LABEL` (`"Bots as built"`); `Tally` (`add`, `games()`,
  `count(ending)`, `liberalWins()`, `static Tally pooled(Collection<Tally>)`); `record Interval(double
  low, double high)` and `static Interval interval(int wins, int games)` (Wilson, z = 1.96, clamped
  to [0, 1]); `record Results(String label, int gamesPerSize, SortedMap<Integer, Tally> bySize)`
  with `pooled()` and `table()` (line 1 `<label>: <gamesPerSize> games at each table size`, then the
  header, sizes 5 to 10 and `All`; rates `%.1f%%`, intervals `%.1f-%.1f%%`, `Locale.ROOT`); `public
  static Results play(int gamesPerSize, String label, BiFunction<String, Identity, CpuPlayer>
  makeBot)`, which rethrows a failed game as `A game of <seats> seats with <label> failed: …`;
  `record Options(int games)` with `static Options parse(String[] args)` (`--games=N`; refusals
  `-Pgames must be a whole number of at least 1, not "<value>".` and `Unknown option "<arg>".
  botMatches takes -Pgames=N.`); `main`, which prints a refusal to standard error and exits with
  status 2.
- `BotMatchesTest`: `everySizeFinishesItsGames` (3 games a size), `optionsReadTheGames` (which
  today refuses `--ladder`), the failing-run tests and `theIntervalIsWilsons`.
- `backend/build.gradle`: `task botMatches(type: JavaExec)` (`mainClass = 'game.BotMatches'`,
  `classpath = sourceSets.test.runtimeClasspath`), forwarding `-Pgames` as `--games=<value>`.

## Global Constraints

- **Names, from the spec's table, exactly:** `game.BotSkill` (`EASY`, `NORMAL`, `HARD`) in
  `backend/src/main/java/game/BotSkill.java`; `CpuPlayer(String name, BotSkill skill)`, `skill()`,
  `CpuPlayer(String name)` meaning `NORMAL`; `CpuPlayer.EASY_MISTAKE_CHANCE`; `BotMatches` and
  `BotMatchesTest` in `backend/src/test/java/game/`; `botMatches` with `-Pgames`, `-Pliberals`,
  `-Pfascists` and `-Pladder`.
- **No peeking** (the spec's anti-goal): a bot reads only its own role; what its role reveals (a
  fascist knows every role, Hitler knows them at 5 or 6 seats); what it saw as president or
  chancellor (its hands, its peek, an investigation's party); and what every seat sees (the board,
  the piles' sizes, the tracker, nominations, every vote, deaths, who is investigated, who is a
  bot). Never another seat's role or hand, and never the order of the draw pile.
- **Backups load:** `SecretHitlerGame` gets no field and no non-private method (only `BotScenes`, in
  the tests, touches its private `board` and `draw`). `CpuPlayer`'s pinned `serialVersionUID`
  stays; `readObject` fills each new field an older stream leaves null; each new `Serializable`
  class pins `private static final long serialVersionUID = 1L;`.
- **Normal stays Phase 24's:** `NormalBaselineTest` passes unchanged from Task 1 on.
- **No server change:** nothing under `backend/src/main/java/server/` changes; `Lobby` keeps
  `new CpuPlayer(name)`. No protocol change, nothing on screen, no frontend file.
- **Starting values:** `EASY_MISTAKE_CHANCE` 0.25; `ClearedPlayers.NOMINATION_WEIGHT` 3;
  `ClearedPlayers.TRUSTED_SCORE` 3 (the spec's "+3 or more", fixed); `ChancellorHand.FF_DROP` 2;
  `ChancellorHand.LL_RISE` 2; `PeekMemory.DROP` 2.
- **`./gradlew test` stays fast:** every new test class runs in under 20 s here (trials and seeds
  as each task gives them).
- **Environment:** `export JAVA_HOME=<java-17-home>` (any installed Java 17; the wrapper fails on
  newer JDKs) before every Gradle run; tests are `cd backend && ./gradlew test`. Run output and the
  PR body go in the session scratchpad's `phase-25a/` folder, never in the repo.
- **Known flake:** `GameRecorderTest.aFailingDatabaseLosesNoRecord` under load. Check a failure on
  `development` before calling it one.
- **Branch and commits:** worktree and branch `phase-25a-bot-levels` from `origin/development` once
  Phase 24 has merged. Conventional Commits with a scope (`backend`, `claude`, `development`,
  `plan`), at most 72 characters, each test in the commit with its code. Each task's last commit
  ticks the Phase 25A box in `docs/PLAN.md` that names its work (the coordinator wrote the entry:
  match by content, and if no box names a task's work, tick none and say so in the PR). Task 1 also
  sets Phase 25A's Progress row to "in progress". The pull request is squashed
  (`gh pr merge --squash --admin`) with a Conventional subject ending `(#N)`.
- **Public repo:** nothing about the home server in code, docs, commits or the PR.

## Review Focus

1. **A Hard bot's memory through a backup and a restart.** Once 26A seats Hard bots, every lobby
   backup holds their cleared players, a held peek and `handReadRound`; read back, the bot must
   remember the same and play on. Task 8 tests it (`aHardBotKeepsWhatItRemembersThroughABackup`).
2. **A chancellor's hand read twice.** A refused veto sends the bot back to choose, and bots are
   updated every tick: the president's score must change once per session. Task 7 tests it
   (`theHandIsReadOncePerSession`).
3. **A chaos policy between the peek and the next session.** The top card is gone, so the next
   government did not draw the peeked three and must not be blamed. Task 8 tests it
   (`aChaosPolicyAfterThePeekForgetsTheCards`).
4. **A mistyped or lowercase level, or `-Pladder` with a level.** `-Pliberals=hard` works,
   `-Pliberals=expert` stops with a one-line message, not a stack trace or a silent Normal run.
   Task 4 tests it.
5. **Easy where the choice is narrow:** one legal nominee, or a chancellor without the veto power.
   It still makes a legal move every time, never a veto it cannot make. Task 3 tests both.

## Scenes (`BotScenes`, shared by Tasks 1, 3 and 5 to 8)

Seats are `P0`, `P1`, … in seat order, `P0` the first president. `game(roles)` deals the roles its
string names, one letter a seat (`L`, `F`, `H`), over the game's own deal
(`getPlayer(name).setIdentity`), and marks every seat a bot (`markAsCpu`), so no pick adds the
people's bias. Primitives (all `static`):

- `SecretHitlerGame game(String roles)`.
- `void board(SecretHitlerGame g, int fascist, int liberal)`: takes those cards from the draw pile
  and enacts them on the board (`Board.enactPolicy`, by reflection on the private `board` and
  `draw`), so no power fires and the 17 cards stay 17.
- `void drawTop(SecretHitlerGame g, String cards)`: puts those cards, top first, on top of the draw
  pile, taken from the pile's own (throws if it lacks one).
- `void swapRoles(SecretHitlerGame g, String a, String b)`.
- `void swapUnseenCards(SecretHitlerGame g, int seen)`: swaps the first liberal and the first fascist
  below the top `seen` cards of the draw pile (throws if either is missing).
- `void voteAll(SecretHitlerGame g, boolean ja)`: every living seat that has not voted, in seat
  order. `void elect(SecretHitlerGame g, String chancellor)`: the president nominates, then
  `voteAll(g, true)`.
- `record Scene(SecretHitlerGame game, String bot)`; `CpuPlayer bot(Scene s, long seed)` (Task 1:
  `new CpuPlayer(s.bot())`), and from Task 2 `CpuPlayer bot(Scene s, BotSkill skill, long seed)` and
  `CpuPlayer bot(SecretHitlerGame g, String name, BotSkill skill, long seed)`: made,
  `useRandom(new Random(seed))`, then `initialize(g)`.

Builders, each returning a `Scene` at the bot's decision with the bot not yet made:

| Builder | Moves made first | The bot | Waiting on |
|---|---|---|---|
| `nomination(roles)` | P0 elects P2, hand LLL, P0 discards 0, P2 enacts, END TERM | P1 (P2 last chancellor, P0 last president) | P1's nomination |
| `vote(roles)` | P0 nominates P1 | P2 | P2's vote, no one voted yet |
| `presidentsHand(roles, hand)` | `drawTop(hand)`, P0 elects P1 | P0 | P0's discard |
| `chancellorsHand(roles, hand, extra, fascist)` | `board(fascist, 0)`, `drawTop(hand + extra)`, P0 elects P1, P0 discards index 2 | P1, holding `hand` | P1's choice (VETO open at 5) |
| `vetoAnswer(roles)` | `board(5, 0)`, `drawTop("FFF")`, P0 elects P1, P0 discards 0, P1 vetoes | P0 | P0's answer |
| `power(roles, fascist, next)` | `board(fascist − 1, 0)`, `drawTop("FFF" + next)`, P0 elects P1, P0 discards 0, P1 enacts | P0 | P0's power at `fascist` policies (investigate, elect, peek or execute, by size) |

Roles below put the bot's role on its seat, and never make P1 Hitler where an election at 3 or more
fascist policies would end the game. Tasks 6 and 8 add two builders that make the bot first and
update it after every move (`Played`, below).

---

### Before you start

- [ ] **Check the start point:** `git fetch origin`, then make the worktree and branch
  `phase-25a-bot-levels` from `origin/development`. All must hold, or stop and tell the coordinator:
  `git cat-file -e origin/development:backend/src/main/java/game/CpuTurn.java`;
  `git cat-file -e origin/development:backend/src/test/java/game/BotMatches.java`;
  `git show origin/development:backend/src/main/java/game/CpuPlayer.java | grep -n
  "serialVersionUID = 2392054316009854878L"`; `git show
  origin/development:backend/src/test/java/server/stats/CpuGames.java | grep -n
  "BiFunction<String, Identity, CpuPlayer> makeBot"`; `grep -n "botMatches" backend/build.gradle`;
  `grep -n "^## Phase 25A" docs/PLAN.md`; the spec and this plan are in `docs/superpowers/`.
- [ ] **Read Phase 24's** `CpuPlayer`, `CpuTurn`, `CpuGames`, `BotMatches`, `BotMatchesTest` and
  the `botMatches` task, and note in the scratchpad's `phase-25a/notes.md` each way they differ
  from "From Phase 24" (that list goes in the PR).
- [ ] **Take the "before" run:** `cd backend && ./gradlew -q botMatches >
  <scratchpad>/phase-25a/before.txt` (24's table, `Bots as built`, all Normal). Expected: every
  size finishes.

---

### Task 1: Scenes, a seedable bot and Normal's baseline

**Files:**
- Modify: `backend/src/main/java/game/CpuPlayer.java` (one package-private method)
- Create (test): `backend/src/test/java/game/BotScenes.java`, `Decision.java`,
  `BotScenesTest.java`, `NormalBaselineTest.java`
- Create: `backend/src/test/resources/normal-baseline.txt` (the test's own output, Step 4)

**Interfaces:**
- Consumes: Phase 24's `CpuPlayer`.
- Produces on `CpuPlayer`: `void useRandom(Random random)` (package-private; only tests call it).
- Produces: `BotScenes` as in "Scenes"; `final class Decision` with `static String of(GameState
  before, boolean acted, SecretHitlerGame after, String bot)`: `none` when `acted` is false, else by
  `before`: `nominate <getCurrentChancellor()>`; `vote ja|nein` (`getVotes().get(bot)`); `pass XY`
  (the chancellor's two cards, `F`/`L` in order); `veto` when the state is now
  `LEGISLATIVE_PRESIDENT_VETO`, else `enact F|L` (`getLastEnactedPolicy()`); `refuse veto` when the
  state is now `LEGISLATIVE_CHANCELLOR`, else `accept veto`; `investigate|elect|execute
  <getTarget()>`; `peek`; `end term`.

- [ ] **Step 1: Write the failing tests.** `BotScenesTest`: `eachBuilderStopsAtItsDecision` (each
  builder of the table, with the baseline's roles below: the state, president, chancellor and the
  bot's hand it names); `theBoardTakesItsCardsFromTheDeck` (`board(g, 5, 2)` ⇒ 5 and 2 on the
  board, no power state, draw pile 10, discards 0); `drawTopKeepsThePilesCards` (the pile's counts
  of each type before and after are equal, and its top reads as given); `swapRolesSwaps`.
  `NormalBaselineTest.normalBotsDecideAsPhase24s`: for each scene below and seeds 0 to 19, `bot(scene,
  seed).act(game)`, one line `<name> <seed>: <Decision.of(…)>`; the lines must equal
  `normal-baseline.txt`'s; on a difference it writes them to `build/normal-baseline-actual.txt` and
  fails naming the first line that differs. Scenes:

  | Name | Scene |
  |---|---|
  | `nominate-liberal` | `nomination("LLLFH")` |
  | `nominate-fascist-7` | `nomination("LFLLLFH")` |
  | `nominate-hitler-7` | `nomination("LHLLLFF")` |
  | `nominate-hitler-5` | `nomination("LHLLF")` |
  | `vote-liberal` | `vote("LLLFH")` |
  | `vote-fascist` | `vote("LLFLH")` |
  | `vote-hitler-7` | `vote("LLHLLFF")` |
  | `discard-liberal` | `presidentsHand("LLLFH", "LLF")` |
  | `discard-fascist` | `presidentsHand("FLLLH", "FLL")` |
  | `discard-hitler` | `presidentsHand("HLLLF", "FFL")` |
  | `choose-liberal` | `chancellorsHand("LLLFH", "FL", "F", 0)` |
  | `choose-fascist` | `chancellorsHand("LFLLH", "FL", "F", 0)` |
  | `choose-hitler-7` | `chancellorsHand("LHLLLFF", "FL", "F", 0)` |
  | `veto-liberal` | `chancellorsHand("LLLFH", "FF", "F", 5)` |
  | `answer-liberal` | `vetoAnswer("LLLFH")` |
  | `investigate-liberal` | `power("LLLLLFFFH", 1, "")` |
  | `investigate-fascist` | `power("FLLLLLFFH", 1, "")` |
  | `elect-liberal` | `power("LLLLFFH", 3, "")` |
  | `execute-liberal` | `power("LLLFH", 4, "")` |
  | `execute-fascist` | `power("FLLLLFH", 4, "")` |

- [ ] **Step 2: Run** `./gradlew test --tests 'game.BotScenesTest' --tests
  'game.NormalBaselineTest'`. Expected: compilation fails.
- [ ] **Step 3: Implement** `useRandom`, `BotScenes` and `Decision`. Run again. Expected:
  `BotScenesTest` passes; `NormalBaselineTest` fails (no file) and writes the actual lines.
- [ ] **Step 4: Record the baseline.** Check five lines by hand against their scenes (each a legal
  move, and `choose-hitler-7` always `enact L`), then copy `build/normal-baseline-actual.txt` to
  `src/test/resources/normal-baseline.txt`. Nothing else in `CpuPlayer` has changed, so these are
  Phase 24's decisions.
- [ ] **Step 5: Run** `./gradlew test`. Expected: PASS.
- [ ] **Step 6: Commit** `test(backend): pin what normal bots decide`, setting Phase 25A's Progress
  row to "in progress".

---

### Task 2: A bot's level

**Files:**
- Create: `backend/src/main/java/game/BotSkill.java`
- Modify: `backend/src/main/java/game/CpuPlayer.java`, `backend/src/test/java/game/BotScenes.java`
- Test: `backend/src/test/java/game/CpuPlayerSkillTest.java`,
  `backend/src/test/java/server/DatabaseBackupTest.java`

**Interfaces:**
- Produces: `public enum BotSkill { EASY, NORMAL, HARD }`.
- Produces on `CpuPlayer`: `public CpuPlayer(String name, BotSkill skill)` (null refused with
  `Objects.requireNonNull(skill, "skill")`); `public CpuPlayer(String name)`, `this(name,
  BotSkill.NORMAL)`; `public BotSkill skill()`; `private BotSkill skill` (not final:
  `readObject` sets it to `NORMAL` when an older stream leaves it null).
- Produces on `BotScenes`: the two `bot(…, BotSkill skill, long seed)` overloads.

- [ ] **Step 1: Write the failing tests.** `CpuPlayerSkillTest`: `aBotMadeWithoutALevelIsNormal`;
  `aBotKeepsTheLevelItIsMadeWith` (each value); `aNullLevelIsRefused` (`NullPointerException`);
  `aBotKeepsItsLevelThroughABackup` (for each level, `vote("LLLFH")`'s game and its bot copied
  together as one `Object[]` by `SerializationUtils.clone` ⇒ the same `skill()`, and the copied
  bot's `act` on the copied game registers its vote). `DatabaseBackupTest.aBotFromBeforeLevelsPlaysNormal`:
  copy `/backup-before-recorder.db` as `aGameFromBeforeTheRecorderIsIncomplete` does, `load()`,
  take `ABCD`'s bots by reflection on `Lobby`'s private `cpuPlayers` ⇒ three, each `skill()`
  `NORMAL`, and `CpuTurn.step(lobby.game(), bots, () -> {})` returns without throwing.
- [ ] **Step 2: Run** `./gradlew test --tests 'game.CpuPlayerSkillTest' --tests
  'server.DatabaseBackupTest'`. Expected: compilation fails.
- [ ] **Step 3: Implement** as in Interfaces; `BotScenes.bot(scene, seed)` keeps calling
  `new CpuPlayer(name)`, so the baseline still goes through it.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS, `NormalBaselineTest` unchanged.
- [ ] **Step 5: Commit** `feat(backend): give each bot a skill level`, ticking the box for
  `BotSkill` and a bot's level.

---

### Task 3: Easy's mistakes

**Files:**
- Modify: `backend/src/main/java/game/CpuPlayer.java` (every decision handler)
- Test: `backend/src/test/java/game/EasyMistakesTest.java`

**Interfaces:**
- Produces on `CpuPlayer`: `public static final double EASY_MISTAKE_CHANCE = 0.25;` and private
  `boolean mistake()` (Decision 1) and `<T> T anyOf(List<T> moves)` (`random.nextInt`). Each
  handler, once the move is the bot's: `mistake()` ? `anyOf(<its legal moves>)` : Normal's choice,
  with Decisions 2 and 3.

- [ ] **Step 1: Write the failing tests.** A helper `assertMistakes(Supplier<Scene> scene,
  Consumer<CpuPlayer> setUp, List<String> legal)`: N = 10,000 trials at `NORMAL`, then at `EASY`,
  trial `i` a fresh scene and `bot(scene, skill, i)`, `setUp`, then `act`; every outcome
  (`Decision.of`) is in `legal` and no `act` throws; for each outcome `o`, with `c` =
  `EASY_MISTAKE_CHANCE`, `n` = `legal.size()`, `k` = `o`'s count in `legal`, `p` = Normal's share,
  `e = (1 − c)·p + c·k/n`, Easy's share is within `4·sqrt(e(1 − e)/N + (1 − c)²·p(1 − p)/N) + 0.002`
  of `e`. Scores below are set with `playerReputation.put` after `bot(…)`.

  | Test | Scene | Scores | `legal`, one entry per legal move |
  |---|---|---|---|
  | `nominations` | `nomination("LLLFH")` | P0 +5, P3 −5, P4 −5 | nominate P0, P3, P4 |
  | `nominationsAtSeven` | `nomination("LFLLLFH")` | none | nominate P3, P4, P5, P6 (P0 last president, P2 last chancellor) |
  | `votes` | `vote("LLLFH")` | P0 +5, P1 +5 | vote ja, vote nein |
  | `presidentsDiscards` | `presidentsHand("LLLFH", "FFL")` | none | pass FL, pass FL, pass FF |
  | `chancellorsChoices` | `chancellorsHand("LLLFH", "FL", "F", 0)` | none | enact L, enact F (no veto) |
  | `vetoRequests` | `chancellorsHand("LLLFH", "FF", "F", 5)` | none | veto, enact F, enact F |
  | `vetoAnswers` | `vetoAnswer("LLLFH")` | none | accept veto, refuse veto |
  | `investigations` | `power("LLLLLFFFH", 1, "")` | P5 −5, the rest +5 | investigate P5, then P1 to P4, P6 to P8 |
  | `specialElections` | `power("LLLLFFH", 3, "")` | P3 +5, the rest −5 | elect P3, then P1, P2, P4 to P6 |
  | `executions` | `power("LLLFH", 4, "")` | P3 −5, the rest +5 | execute P3, then P1, P2, P4 |

  And: `easyNeverExecutesAKnownTeammate` (10,000 Easy trials of `power("FLLLLFH", 4, "")`: never P5
  or P6, and each of P1 to P4 at least once; of `power("HLLLF", 4, "")`: never P4);
  `easyMakesTheOnlyLegalMove` (`nomination("LLLFH")` with P0 and P3 `kill()`ed: 1,000 Easy trials
  all `nominate P4`); `easyEndsItsTermAsEveryBotDoes` (`power("LLLFH", 3, "")`: 1,000 Easy trials each give `peek`
  then `end term`).
- [ ] **Step 2: Run** `./gradlew test --tests 'game.EasyMistakesTest'`. Expected: compilation
  fails, then (with the constant only) FAIL: Easy's shares equal Normal's.
- [ ] **Step 3: Implement** as in Interfaces and Decisions 1 to 3; an Easy investigation or
  execution draws from 24's `investigationTargets(game)` or `executionTargets(game)`, the list
  Normal's one pick takes.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS, `NormalBaselineTest` unchanged, and
  `EasyMistakesTest` under 20 s.
- [ ] **Step 5: Commit** `feat(backend): let easy bots make random moves`, ticking the box for
  Easy's mistakes.

---

### Task 4: Each side's level in `botMatches`

**Files:**
- Modify (test): `backend/src/test/java/game/BotMatches.java`, `BotMatchesTest.java`
- Create (test): `backend/src/test/java/game/LadderCheck.java`, `LadderCheckTest.java`
- Modify: `backend/build.gradle` (the `botMatches` task's arguments)

**Interfaces:**
- Consumes: `BotSkill`, `CpuPlayer(String, BotSkill)`, and from Phase 24 `BotMatches.play(int
  gamesPerSize, String label, BiFunction<String, Identity, CpuPlayer> makeBot)`, `Results`,
  `Tally`, `Interval`, `interval(int, int)`, `Options`, `parse`, `main`, `DEFAULT_GAMES`.
- Produces on `BotMatches` (public, beside 24's; `play` is not changed and gets no second form):
  - `static BiFunction<String, Identity, CpuPlayer> makeBots(BotSkill liberals, BotSkill
    fascists)`: `(name, role) -> new CpuPlayer(name, role == Identity.LIBERAL ? liberals :
    fascists)`.
  - `static String label(BotSkill liberals, BotSkill fascists)`: `Liberals <LEVEL>, fascists
    <LEVEL>` (`Liberals HARD, fascists NORMAL`). 24's `play` puts it in a failed game's message
    (`A game of 7 seats with Liberals HARD, fascists NORMAL failed: …`, with the timeline), which
    is how the run names the size and both levels.
  - `record Options(int games, BotSkill liberals, BotSkill fascists, boolean ladder)`, widening 24's,
    and `parse` reading 24's `--games=N` plus `--liberals=<level>` and `--fascists=<level>` (any
    case; `NORMAL` by default) and `--ladder`. Refusals, as `IllegalArgumentException` (which 24's
    `main` prints to standard error before exiting with status 2): 24's `-Pgames …` line; `Unknown
    level "<value>": use EASY, NORMAL or HARD.`; `-Pladder plays its own pairings: leave out
    -Pliberals and -Pfascists.`; and 24's unknown-option line, now `Unknown option "<arg>".
    botMatches takes -Pgames=N, -Pliberals=LEVEL, -Pfascists=LEVEL and -Pladder.`
  - `static Map<LadderCheck.Pairing, Results> ladder(int gamesPerSize)`: `play(gamesPerSize,
    label(l, f), makeBots(l, f))` once per pairing, in `PAIRINGS` order (a `LinkedHashMap`).
  - `static String ladderReport(Map<LadderCheck.Pairing, Results> results)`, lines ending in
    `\n`: `Ladder and balance pairings (liberals/fascists; E Easy, N Normal, H Hard): <games> games
    at each table size`; the side-by-side table, a header of `Seats` and each pairing's label, then
    rows 5 to 10 and `All`, each cell that pairing's liberal rate and interval in 24's formats
    (`35.2% 34.3-36.1%`), aligned and spaced as 24's `table()` is; `LadderCheck.verdicts(results)`;
    then each pairing's `table()`, in order.
  - `main`: `parse`; with `ladder()`, print `ladderReport(ladder(games))`; otherwise
    `play(games, label(liberals, fascists), makeBots(liberals, fascists)).table()`. `BOTS_AS_BUILT`
    and its label stay for 24's tests.
- Produces: `final class LadderCheck` (test source, package `game`; 25A's, which 25B uses and only
  adds to), on 24's `Tally`, `Results` and `Interval`:
  - `record Pairing(BotSkill liberals, BotSkill fascists)` with `String label()` (`"E/N"`), and
    `static final List<Pairing> PAIRINGS`: E/N, N/N, H/N, N/E, N/H, E/E, H/H.
  - `static final int BALANCE_BAND = 10` (percentage points).
  - `enum Side { LIBERAL, FASCIST }`; `static int wins(Side side, Tally tally)` (`liberalWins()`, or
    `games() − liberalWins()`) and `static Interval interval(Side side, Tally tally)`.
  - `static boolean clearlyAbove(Interval higher, Interval lower)`: `lower.high() < higher.low()`,
    the intervals not overlapping (the spec's "The ladder check").
  - `record Step(Side side, BotSkill lower, BotSkill higher, boolean pooledClears, List<Integer>
    invertedSizes)` with `boolean passes()` (`pooledClears` and no inverted size); `static Step
    step(Side side, BotSkill lower, BotSkill higher, Map<Pairing, Results> results)`: the side at
    each level against Normal opponents (the liberal side's pairings `X/N`, the fascist side's
    `N/X`); `pooledClears` is `clearlyAbove` on the two pooled intervals; a size is inverted when
    `clearlyAbove(lower's interval, higher's interval)` at that size.
  - `static List<Step> ladder(Map<Pairing, Results> results)`: the liberal side's Easy < Normal and
    Normal < Hard, then the fascist side's; `static boolean balanced(Map<Pairing, Results>
    results)`: H/H's and N/N's pooled liberal rates at most `BALANCE_BAND` points apart, as
    `100·|hW·nG − nW·hG| <= BALANCE_BAND·hG·nG` in `long`s.
  - `static String verdicts(Map<Pairing, Results> results)`: `Ladder check: PASS`, or `Ladder
    check: FAIL (<each failing step and why: pooled, or its inverted sizes>)`; then a line per step,
    `  Liberal side, Easy < Normal: <rate interval> vs <rate interval> pooled, clears|overlaps; sizes
    inverted: none|<sizes>`; then `Balance check: PASS (all-Hard <rate>, all-Normal <rate>, band 10
    points)` or the same with `FAIL`. In 25A these lines are printed and quoted in the PR and need
    not pass: 25B makes them pass. Only the Easy steps must clear (Task 9).
- Produces in `build.gradle`: `botMatches` forwards each property it is given as one argument, as
  24 does `games`: `--liberals=<value>`, `--fascists=<value>`, and `--ladder` for `-Pladder`; the
  task's comment lists the four options.

- [ ] **Step 1: Write the failing tests.** In `BotMatchesTest` (24's catch-and-`assertNotNull`
  style for refusals): `everySizeFinishesItsGames` widened, as 24's plan says, to every one of the
  nine pairings of levels (`play(3, label(l, f), makeBots(l, f))`, each size's tally 3 games);
  `eachSideGetsItsLevel` (`makeBots(HARD, EASY)`: `LIBERAL` ⇒ `HARD`, `FASCIST` and `HITLER` ⇒
  `EASY`); `theLabelNamesBothLevels` (`label(HARD, NORMAL)` is `Liberals HARD, fascists NORMAL`);
  24's `optionsReadTheGames` keeps its refusals but `--ladder`, now read;
  `optionsReadTheLevels` (no argument ⇒ `NORMAL`, `NORMAL`, no ladder; `--liberals=hard
  --fascists=Easy` ⇒ `HARD`, `EASY`; `--ladder --games=50` ⇒ ladder, 50);
  `anUnknownLevelIsRefused` (`--fascists=expert` ⇒ the message, exactly);
  `theLadderTakesNoLevels` (`--ladder --liberals=HARD` ⇒ the message, exactly);
  `anUnknownOptionNamesEveryOption` (`--seed=1` ⇒ the message, exactly);
  `theLadderReportShowsEveryPairingSideBySide` (`ladderReport(ladder(2))`: one line holds the seven
  labels in `PAIRINGS` order; rows 5 to 10 and `All`; a line starting `Ladder check: ` and one
  starting `Balance check: `, each then `PASS` or `FAIL`; seven lines starting `Liberals `, one per
  pairing's `table()`). `LadderCheckTest`, on `Results` built by hand as 24's
  `theTableShowsEverySizeAndThePool` builds them (each size's `Tally` given its liberal wins as
  `LIBERAL_VICTORY_POLICY` and the rest as `FASCIST_VICTORY_POLICY`):
  `separateIntervalsClear` (`interval(400, 1000)` above `interval(300, 1000)` ⇒ true);
  `overlappingIntervalsDoNotClear` (`interval(360, 1000)` over `interval(330, 1000)` ⇒ false, though
  each rate lies outside the other's interval: the reading the spec no longer takes);
  `aSizeWhereTheHigherLevelIsClearlyLowerFailsTheStep` (Normal liberals 300 of 1,000 a size, Hard
  liberals 450 a size but 150 at 7 ⇒ pooled clears, `invertedSizes` `[7]`, `passes()` false);
  `theFascistSideCountsFascistWins` (N/E liberal wins 700 of 1,000 a size, N/N 600 ⇒ the fascist
  side's Easy < Normal step passes); `balanceAllowsTenPointsEitherWay` (N/N 350 of 1,000 a size;
  H/H 450 and 250 pass, 451 and 249 fail); `theVerdictsSayWhatFailed` (every pairing 500 of 1,000 a
  size ⇒ `Ladder check: FAIL (` naming all four steps, and `Balance check: PASS`);
  `pairingsComeInPrintOrder`.
- [ ] **Step 2: Run** `./gradlew test --tests 'game.BotMatchesTest' --tests
  'game.LadderCheckTest'`. Expected: compilation fails.
- [ ] **Step 3: Implement** as in Interfaces. If a `-Pladder` run at the default games takes more
  than 10 minutes, play the pairings on a fixed pool of `availableProcessors()` threads (the output
  unchanged).
- [ ] **Step 4: Run** `./gradlew test`, then by hand `./gradlew -q botMatches -Pgames=20
  -Pliberals=easy` (line 1 `Liberals EASY, fascists NORMAL: 20 games at each table size`),
  `./gradlew -q botMatches -Pgames=20 -Pladder` (the report, both verdict lines) and `./gradlew -q
  botMatches -Pliberals=expert` (the one-line refusal; the task fails). Expected: as said.
- [ ] **Step 5: Commit** `feat(backend): give each side its own level in bot matches`, ticking the
  box for per-side levels in `botMatches`.

---

### Task 5: The no-peeking test

**Files:**
- Create (test): `backend/src/test/java/game/Twins.java`, `NoPeekingTest.java`

**Interfaces:**
- Consumes: `BotScenes`, `Decision`, every level.
- Produces: `final class Twins` (Decision 9):
  - `static Twins of(Scene a, Scene b, BotSkill skill, long seed)` (the same bot seat; one bot per
    game, `BotScenes.bot(…, skill, seed)`) and `static Twins of(Scene a, Scene b, BotSkill skill,
    long seedA, long seedB)` (for the sanity test only).
  - `record Visible(…)` and `static Visible of(SecretHitlerGame g, String bot)`: state, round,
    president, chancellor, last president and chancellor, tracker, both policy counts, the last
    enacted policy, draw and discard sizes, `didElectionTrackerAdvance()`, `didVetoOccurThisTurn()`,
    the votes, living and investigated seats, the target, and the cards the bot holds or saw (its
    hand as president or chancellor, the two it passed while its chancellor's veto waits, its peek),
    as letters.
  - `void others(Consumer<SecretHitlerGame> move)` and `void others(Consumer<SecretHitlerGame>
    moveA, Consumer<SecretHitlerGame> moveB)` (a move by another seat, the second form for a move the
    bot never sees, such as the card another president discards): the move on each game, both
    bots' `update`, then the same memory.
  - `void botActs()`: the same `Visible` (else fails "the scene let the bot tell the games apart"),
    both bots' `update`, the same memory, both `act`, the same return, the same `Decision.of`, the
    same memory. Memory is each bot's `SerializationUtils.serialize` bytes; a failure prints both bots'
    `playerReputation`.
  - `CpuPlayer botA()`, `CpuPlayer botB()`.
- Produces: `NoPeekingTest.everyLevelAndSeed(BiConsumer<BotSkill, Long> scene)` (static,
  package-private): `scene` at each level for seeds 0 to 199, a failure naming the level and seed.
  **To cover a new rule** (25B): add a test that builds both games with `BotScenes`, sets the
  hidden fact in the second (`swapRoles`, `swapUnseenCards`, or `others(moveA, moveB)`), and drives
  `Twins` through the moves that bring the rule into play, inside `everyLevelAndSeed`.

- [ ] **Step 1: Write the tests.** `NoPeekingTest`, each inside `everyLevelAndSeed`, the bot acting
  once (`botActs()`):

  | Test | Both games | Bot | Hidden in the second |
  |---|---|---|---|
  | `nominations` | `nomination("LLLFH")` | P1, liberal | `swapRoles(P0, P3)` |
  | `nominationsByAFascist` | `nomination("LFLLLFH")` | P1, fascist | `swapUnseenCards(0)` |
  | `nominationsByHitlerAtSeven` | `nomination("LHLLLFF")` | P1, Hitler | `swapRoles(P3, P5)` |
  | `votes` | `vote("LLLFH")` | P2, liberal | `swapRoles(P1, P3)` |
  | `votesByHitlerAtSeven` | `vote("LLHLLFF")` | P2, Hitler | `swapRoles(P0, P5)` |
  | `presidentsDiscards` | `presidentsHand("LLLFH", "FFL")` | P0, liberal | `swapRoles(P3, P4)`, `swapUnseenCards(0)` |
  | `presidentsDiscardsByAFascist` | `presidentsHand("FLLLH", "FLL")` | P0, fascist | `swapUnseenCards(0)` |
  | `chancellorsChoices` | `chancellorsHand("LLLFH", "FL", extra, 0)` | P1, liberal | extra `L` in the first, `F` in the second; `swapRoles(P3, P4)` |
  | `chancellorsChoicesByAFascist` | `chancellorsHand("LFLLH", "FL", extra, 0)` | P1, fascist | extra `L`, then `F` |
  | `vetoRequests` | `chancellorsHand("LLLFH", "FF", extra, 5)` | P1, liberal | extra `L`, then `F`; `swapRoles(P3, P4)` |
  | `vetoAnswers` | `vetoAnswer("LLLFH")` | P0, liberal | `swapRoles(P3, P4)`, `swapUnseenCards(0)` |
  | `investigations` | `power("LLLLLFFFH", 1, "")` | P0, liberal | `swapRoles(P6, P8)` (fascist and Hitler: an investigation finds both `FASCIST`) |
  | `specialElections` | `power("LLLLFFH", 3, "")` | P0, liberal | `swapRoles(P1, P5)` |
  | `executions` | `power("LLLFH", 4, "")` | P0, liberal | `swapRoles(P1, P3)` |
  | `executionsByAFascist` | `power("FLLLLFH", 4, "")` | P0, fascist | `swapUnseenCards(0)` |

  And the sanity tests, at `NORMAL`: `theTwinsTellADecisionApart` (`presidentsHand("LLLFH",
  "LLF")` twice, `Twins.of(a, b, NORMAL, s, s + 1)`: `botActs()` throws `AssertionError` for at
  least one `s` of 0 to 199); `theTwinsTellAHandTheBotSees` (`presidentsHand` with `LLF` and `LLL`:
  `botActs()` throws for seed 0, at the `Visible` check); `theTwinsTellADifferentMemory` (the second
  bot's score for P3 set to −5: `others(g -> {})` throws).
- [ ] **Step 2: Run** `./gradlew test --tests 'game.NoPeekingTest'`. Expected: compilation fails,
  then PASS once `Twins` is written (it checks the bots as Tasks 1 to 3 left them; a failure here is
  a peek to fix in `CpuPlayer`, never a scene to loosen).
- [ ] **Step 3: Run** `./gradlew test`. Expected: PASS, `NoPeekingTest` under 20 s.
- [ ] **Step 4: Commit** `test(backend): check that no bot level peeks`, ticking the box for the
  no-peeking test.

---

### Task 6: Hard's rule 1, cleared players

**Files:**
- Create: `backend/src/main/java/game/ClearedPlayers.java`
- Modify: `backend/src/main/java/game/CpuPlayer.java`, `backend/src/test/java/game/BotScenes.java`,
  `NoPeekingTest.java`
- Test: `backend/src/test/java/game/ClearedPlayersTest.java`

**Interfaces:**
- Produces: `final class ClearedPlayers implements Serializable` (UID 1L): `static final double
  NOMINATION_WEIGHT = 3`; `static final int TRUSTED_SCORE = 3`; `void observe(SecretHitlerGame
  game)` (Decision 5's states and count: adds `getCurrentChancellor()`); `boolean contains(String
  name)`; `Set<String> names()` (unmodifiable, in the order cleared); `double
  nominationFactor(String name)` (`NOMINATION_WEIGHT` if cleared, else 1); `Optional<Boolean>
  vote(SecretHitlerGame game, int chancellorScore, Map<String, Identity> known)` (Decision 5; empty
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
- Produces on `BotScenes`: `record Played(SecretHitlerGame game, CpuPlayer bot)` with `void
  then(Consumer<SecretHitlerGame> move)` (the move, then `bot.update(game)`), and `static Played
  cleared(String botSeat, BotSkill skill, long seed)`: `game("FLLFLLH")`, `board(3, 0)`,
  `drawTop("LLLLLL")`, the bot made first; round 1 P0 elects P3, round 2 P1 elects P4, each with
  every seat's ja (the bot's made by the scene), a discard of 0 and the chancellor enacting L, then
  END TERM, the bot updated after every move; it waits at round 3, P2 to nominate (P3 and P4
  cleared; P1, the last president, and P4, the last chancellor, not eligible).

- [ ] **Step 1: Write the failing tests.** `ClearedPlayersTest`, on `BotScenes` games:
  `aChancellorElectedWithThreeFascistPoliciesDownIsCleared` (`board(3, 0)`, an election passed,
  observed in `LEGISLATIVE_PRESIDENT`); `itIsStillSeenOnceThePresidentHasDiscarded` (observed only
  in `LEGISLATIVE_CHANCELLOR`); `twoFascistPoliciesClearNoOne`; `aFailedElectionClearsNoOne` (all
  nein at 3); `aClearedChancellorGetsJa`; `aKnownFascistGetsNoJaForBeingCleared` (`known` has the
  chancellor or the president `FASCIST` ⇒ empty); `anUnclearedChancellorUnderThreeGetsNein`
  (scores 2 and −5 ⇒ false); `fromThreeTheVoteIsNormals` (score 3 ⇒ empty);
  `beforeThreeFascistPoliciesTheVoteIsNormals`; `onlyClearedPlayersWeighMore` (3 and 1). Through
  `CpuPlayer`: `aHardLiberalPrefersClearedPlayersWhenItNominates` (`cleared("P2", …)` over 10,000
  seeds, the scores of the eligible P0, P3, P5 and P6 set to 0 first, so their weights are equal: P3
  nominated in 0.50 ± 0.02 of them at `HARD` and 0.25 ± 0.02 at `NORMAL`);
  `aHardLiberalVotesForAClearedChancellor` (`cleared("P5", …)`, P2 nominates P3: ja in all of 1,000
  seeds); `aHardLiberalVotesNoOnAChancellorNotCleared` (P2
  nominates P6: nein in all); `aTrustedChancellorGetsNormalsVote` (P6's score set to 3: the Hard
  and the Normal bot of each of 1,000 seeds vote the same); `onlyAHardLiberalKeepsTheList` (Normal
  P2, Hard P3 (fascist) and Hard P6 (Hitler) through `cleared` ⇒ `names()` empty).
  `NoPeekingTest.hardRule1ClearedPlayers`: both games `game("FLLFLLH")`, `board(3, 0)`,
  `drawTop("LLLLLL")`, the second with `swapRoles(P0, P6)`; bot P2. P0 nominates P3; the bot votes
  (`botActs`); the others vote ja, P0 discards 0, P3 enacts, P0 ends the term; P1 nominates P4; the
  bot votes; the same to the end of round 2; then the bot nominates and votes (`botActs` twice).
- [ ] **Step 2: Run** `./gradlew test --tests 'game.ClearedPlayersTest' --tests
  'game.NoPeekingTest'`. Expected: compilation fails.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS, `NormalBaselineTest` unchanged.
- [ ] **Step 5: Commit** `feat(backend): let hard liberals trust cleared players`, ticking the box
  for Hard's rule 1.

---

### Task 7: Hard's rule 2, the chancellor's hand

**Files:**
- Create: `backend/src/main/java/game/ChancellorHand.java`
- Modify: `backend/src/main/java/game/CpuPlayer.java`, `backend/src/test/java/game/NoPeekingTest.java`
- Test: `backend/src/test/java/game/ChancellorHandTest.java`

**Interfaces:**
- Produces: `final class ChancellorHand` (static only): `static final int FF_DROP = 2`; `static
  final int LL_RISE = 2`; `static int presidentChange(List<Policy> hand, int drop)` (−`drop` for
  two fascist cards, +`LL_RISE` for two liberal cards, 0 for one of each).
- Produces on `CpuPlayer`: `private int handReadRound` (0 from an older stream); private `boolean
  readsTheGame(SecretHitlerGame game)` (Decision 4); `private int chancellorHandDrop(SecretHitlerGame
  game)`, returning `ChancellorHand.FF_DROP`: **the one place 25B scales the drop by the deck's
  odds**. In the chancellor's handler, once the move is the bot's: `readsTheGame(game) &&
  handReadRound != game.getRound()` ⇒ set `handReadRound`, and a nonzero
  `presidentChange(hand, chancellorHandDrop(game))` goes to `updateReputation(president, …)`.

- [ ] **Step 1: Write the failing tests.** `ChancellorHandTest`: `twoFascistCardsLowerThePresident`
  (−2), `twoLiberalCardsRaiseThePresident` (+2), `oneOfEachSaysNothing` (FL and LF ⇒ 0),
  `theDropIsTheOneGiven` (FF with 3 ⇒ −3). Through `CpuPlayer`, P0's score after the bot's `act`:
  `aHardLiberalChancellorLowersAPresidentWhoPassesTwoFascists` (`chancellorsHand("LLLFH", "FF",
  "L", 0)` ⇒ −2); `aHardLiberalChancellorRaisesAPresidentWhoPassesTwoLiberals` (`"LL"`, `"F"` ⇒
  +2); `oneOfEachChangesNoScore`; `aHardHitlerAtSevenReadsTheHand` (`chancellorsHand("LHLLLFF",
  "FF", "L", 0)` ⇒ −2); `aHardFascistAndHitlerAtFiveDoNot` (`"LFLLH"` and `"LHLLF"`, FF ⇒ 0);
  `aNormalOrEasyChancellorDoesNot` (FF ⇒ 0 at `NORMAL` and at `EASY`, whatever move Easy makes);
  `theHandIsReadOncePerSession` (Review Focus 2: `chancellorsHand("LLLFH", "FF", "F", 5)` at
  `HARD`: the bot vetoes, P0 refuses, the bot is updated twice and acts again ⇒ P0 at −2, not −4).
  `NoPeekingTest`: `hardRule2TwoFascistCards` (`chancellorsHand("LLLFH", "FF", extra, 0)`, extra
  `L` then `F`, `swapRoles(P3, P4)`, bot P1); `hardRule2TwoLiberalCards` (`"LL"`, extra `F` then
  `L`); `hardRule2HitlerAtSeven` (`chancellorsHand("LHLLLFF", "FF", extra, 0)`, extra `L` then `F`,
  `swapRoles(P2, P5)`, bot P1).
- [ ] **Step 2: Run** `./gradlew test --tests 'game.ChancellorHandTest' --tests
  'game.NoPeekingTest'`. Expected: compilation fails.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): let hard bots read the chancellor's hand`, ticking the box
  for Hard's rule 2.

---

### Task 8: Hard's rule 4, the peek

**Files:**
- Create: `backend/src/main/java/game/PeekMemory.java`
- Modify: `backend/src/main/java/game/CpuPlayer.java`, `backend/src/test/java/game/BotScenes.java`,
  `NoPeekingTest.java`
- Test: `backend/src/test/java/game/PeekMemoryTest.java`, `CpuPlayerSkillTest.java`

**Interfaces:**
- Produces: `final class PeekMemory implements Serializable` (UID 1L): `static final int DROP = 2`;
  `void saw(List<Policy> cards, int drawSize)`; `List<Policy.Type> cards()` (the peek it holds, top
  first; empty before any and once forgotten; 25B's deck odds read it); `List<String>
  observe(SecretHitlerGame game, String self)` (Decision 7: the two members to lower, once, or no
  one; no one when `self` is one of them).
- Produces on `CpuPlayer`: `private PeekMemory peekMemory` (filled in `readObject` when null);
  package-private `PeekMemory peekMemory()`. At the peek, a Hard bot calls `peekMemory.saw(
  game.getPeek(), game.getDrawSize())` before `endPeek()`; in `update`, `readsTheGame(game)` ⇒ each
  name `observe` returns gets `updateReputation(name, -PeekMemory.DROP)`.
- Produces on `BotScenes`: `static Played peeked(String roles, String peek, BotSkill skill, long
  seed)`: `game(roles)`, `board(2, 0)`, `drawTop("FFF" + peek)`, the bot P0 made first and updated
  after every move; P0 elects P1 (the scene nominates and votes for the bot's seat), the bot
  discards itself (`act`, so its own `chancellorChoices` is set), P1 enacts, the bot peeks and ends
  its term (`act` twice); it waits at round 2, P1 to nominate.

- [ ] **Step 1: Write the failing tests.** `PeekMemoryTest`, through `peeked("LLLFH", "LFF", HARD,
  seed)` unless said, round 2 played with `then(…)`: P1 elects P2, P1 discards 0 (the L), P2 enacts
  F, so the game is in `PRESIDENTIAL_POWER_EXECUTION`:
  `aGovernmentThatEnactsAFascistFromAPeekWithALiberalIsLowered` (P1 and P2 at −2, which Normal's
  own −1 does not reach before `POST_LEGISLATIVE`); `aPeekOfThreeFascistsBlamesNoOne` (`"FFF"` ⇒
  0); `aLiberalPolicyBlamesNoOne` (P1 discards an F, P2 enacts the L ⇒ 0); 
  `aChaosPolicyAfterThePeekForgetsTheCards` (Review Focus 3: P1, P2 and P3 each nominate and every
  seat votes nein, so the chaos policy takes the peek's top card; then P4 elects P1, who enacts F ⇒
  every score still 0 in `PRESIDENTIAL_POWER_EXECUTION`, and `cards()` empty); `itBlamesOnce`
  (more updates and the next round add nothing from the rule);
  `theBotInThatGovernmentBlamesNoOne` (a unit test of `observe` with `self` the chancellor ⇒ no one);
  `aHardFascistKeepsThePeekButBlamesNoOne` (`peeked("FLLLH", "LFF", …)`: `cards()` is L F F, and
  no score moves from the rule); `normalAndEasyKeepNoPeek` (`cards()` empty).
  `CpuPlayerSkillTest.aHardBotKeepsWhatItRemembersThroughABackup` (Review Focus 1: a Hard liberal
  with two cleared players (`cleared("P5", HARD, 0)`), and a Hard liberal holding a peek
  (`peeked`), each written with its game and read back ⇒ the same `names()`, `cards()` and
  serialized bytes, and the read bot's `act` works). `NoPeekingTest.hardRule4Peek`: both games
  `game("LLLFH")`, `board(2, 0)`, `drawTop("FFFLFF")`, the second with `swapRoles(P3, P4)` and
  `swapUnseenCards(6)`; bot P0. Others: P0's seat nominates P1 and every seat votes ja; the bot
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

### Task 9: Tune with `botMatches`

**Files:**
- Modify: `backend/src/main/java/game/CpuPlayer.java` (`EASY_MISTAKE_CHANCE`), and Hard's amounts
  only if Step 4 says so
- Output (scratchpad only): `phase-25a/ladder-<value>.txt`, one a run

- [ ] **Step 1: Run at 0.25:** `./gradlew -q botMatches -Pladder >
  <scratchpad>/phase-25a/ladder-0.25.txt`. Read the two `Easy < Normal` lines under `Ladder
  check:`: a step clears when its pooled intervals do not overlap and no size is inverted
  (`Step.passes()`).
- [ ] **Step 2: Find the lowest value** (Decision 13): while both Easy steps clear, set the constant
  0.05 lower and run again (0.20, 0.15, 0.10, 0.05); keep the last value at which both cleared. If
  0.25 already fails, go up by 0.05 until both clear, and past 0.50 stop and ask the coordinator.
- [ ] **Step 3: Confirm** with a second `-Pladder` run at the kept value; if an Easy step fails,
  step up 0.05 and confirm again.
- [ ] **Step 4: Check Hard against Normal** in the confirming run: for neither side may Hard's
  interval lie wholly below Normal's, pooled or at any size (the anti-goal "a lower level that plays
  better than a higher one"; clearing the `Normal < Hard` step is 25B's). If one does, find the rule
  with `-Pliberals=HARD` (or `-Pfascists=HARD`) runs, each with one rule's amount set to 0 in a
  scratch edit, and retune it within `NOMINATION_WEIGHT` 2, 3, 5 or `FF_DROP`, `LL_RISE`, `DROP` 1,
  2, 3; if no value clears it, stop and ask. Otherwise keep the starting amounts. Whatever the
  `Ladder check:` and `Balance check:` lines say overall is reported, not fixed, in 25A.
- [ ] **Step 5: Run** `./gradlew test`. Expected: PASS (`EasyMistakesTest` reads the constant).
- [ ] **Step 6: Commit** `feat(backend): set easy's mistake chance from bot matches` with the
  constant (and any amount), its body a table of each value tried and both Easy steps' pooled rates
  and verdicts; keep the runs for the PR.

---

### Task 10: Docs

**Files:**
- Modify: `CLAUDE.md`, `DEVELOPMENT.md`

- [ ] **Step 1: Update `CLAUDE.md`**, beside Phase 24's lines on the bots (Layout's backend part
  and the Commands table): every bot's level (`BotSkill`, by name; `CpuPlayer(name, skill)`,
  `CpuPlayer(name)` Normal, `skill()`; `readObject` gives an older bot `NORMAL` and empty Hard
  memory; the lobby still seats Normal bots until 26A); Normal held by `NormalBaselineTest` and
  `normal-baseline.txt`, never re-recorded to make a change pass; Easy (the coin, the legal moves,
  the left-out teammates, learning kept, `EASY_MISTAKE_CHANCE`'s final value and how it was set,
  `EasyMistakesTest`); Hard's rules so far (rule 1 `ClearedPlayers`, rule 2 `ChancellorHand` and
  `chancellorHandDrop`, the place 25B scales, rule 4 `PeekMemory`; who runs which, the amounts);
  `BotScenes`, `Decision`, `Twins` and `NoPeekingTest`, with how a rule adds a scene; `botMatches`'s
  `-Pliberals`, `-Pfascists`, `-Pladder`, its report and `LadderCheck`'s reading of the ladder and
  balance checks.
- [ ] **Step 2: Update `DEVELOPMENT.md`'s** `botMatches` section: the three options, one example
  each, what `-Pladder` prints, that levels are read in any case, and that no two runs are the same.
- [ ] **Step 3: Commit** `docs(claude): describe the bots' levels` and `docs(development): describe
  bot match levels`, the last ticking the docs box. Nothing names the home server.

---

### Task 11: Whole-branch review

- [ ] **Step 1: Review** the branch since its merge-base with `origin/development` with the
  `code-review` skill (Standards against `CLAUDE.md`; Spec against the spec's 25A parts and this
  plan), with fresh reviewers.
- [ ] **Step 2: Fix every finding**, Minor ones included, each with a test when it changes
  behaviour; a finding that needs no change gets a stated reason. Keep the list for the PR.
- [ ] **Step 3: Run** `./gradlew test`. Expected: PASS; note the counts.
- [ ] **Step 4: Commit** the last fix (scope `backend`, or the doc's), ticking the acceptance box for
  the tests.

---

### Task 12: The pull request

- [ ] **Step 1: Take the "after" runs:** `./gradlew -q botMatches >
  <scratchpad>/phase-25a/after.txt` (`Liberals NORMAL, fascists NORMAL`, to set beside "before":
  Normal did not change, so the two should agree within their intervals; a size that does not is
  run again before anything else is looked at) and `./gradlew -q botMatches -Pladder >
  <scratchpad>/phase-25a/after-ladder.txt`.
- [ ] **Step 2: Push and open the PR** into `development`: `git push -u origin
  phase-25a-bot-levels`; `gh pr create --repo jussaw/Secret-Hitler-Online --base development
  --head phase-25a-bot-levels --title "feat(backend): add bot skill levels" --body-file
  <scratchpad>/phase-25a/pr-body.md`. The body: what the phase adds; "This pull request changes
  nothing on screen."; `botMatches` before (Phase 24's bots, all Normal) and after, then
  `botMatches -Pladder` after, in code blocks; the `Ladder check:` and `Balance check:` verdicts as
  printed, with a line that in 25A they are reported and need not pass (25B makes them pass), only
  the Easy steps clearing; the Easy tuning table; where Phase 24's code differed from its plan's
  Interfaces; the review record; the test counts; "Part of #72". Read it back (`gh pr view --json body`).
- [ ] **Step 3: Loop CI to green**, fixing each failure on the branch. If `development` moves,
  rebase (keep both sides of `CLAUDE.md` and `docs/PLAN.md`), run `./gradlew test`, push with
  `--force-with-lease`. The phase's work ends here, with the PR open and green.
- [ ] **Step 4 (the manager's, once CI is green: the user gave a standing OK for these five phase pull requests; resumable):** if the "PR merged into
  `development`" box is not ticked on the branch, commit `docs(plan): tick phase 25a's merge` (the
  acceptance boxes but the user's, that box, and the Progress row "done"), push and wait for green;
  if `gh pr view <n> --repo jussaw/Secret-Hitler-Online --json state` is not `MERGED`, run `gh pr
  merge <n> --squash --admin --repo jussaw/Secret-Hitler-Online --subject "feat(backend): add bot
  skill levels (#<n>)"`; then check that `development`'s run published the image.

---

## Self-review

- **Spec coverage:** `BotSkill`, the constructors, `skill()` and `readObject` (Task 2); Easy's
  mistakes at each decision kind the spec lists, the left-out teammates and END TERM (3); the
  self-play run's `-Pliberals`, `-Pfascists` and `-Pladder` on 24's `play`, levels after the deal
  (24's maker), the levels in a stuck game's message (the label), the ladder and balance checks as
  verdict lines (`LadderCheck`, the intervals not overlapping, `BALANCE_BAND` 10), and the fast
  test at every pairing (4); the no-peeking test for every level,
  each decision kind and each Hard rule built (5 to 8); rules 1, 2 and 4 with who runs which (6 to
  8); `EASY_MISTAKE_CHANCE`'s final value from the run (9); the pre-level backup (2); the docs (10);
  the PR quoting `botMatches` before and after (12). Rules 3, 5, 6 and 7 and the ladder check
  passing are 25B's; the lobby and the records are 26A's and 26B's.
- **Anti-goals:** no peeking (Task 5's twins, at every level, and each rule's scene); a lower level
  not above a higher (Task 9, Step 4); no stall (every pairing finishes at every size, Task 4);
  backups load (Task 2's old fixture, Task 8's round trip).
- **Names** match the spec's table: `BotSkill`, `CpuPlayer(String name, BotSkill skill)`, `skill()`,
  `EASY_MISTAKE_CHANCE`, `CpuTurn.step`, `BotMatches`, `BotMatchesTest`, `botMatches`; Phase 24's
  are used as its plan's Interfaces give them (`play(gamesPerSize, label, makeBot)`, `Results`,
  `Tally`, `Interval`, `interval`, `Options`, `investigationTargets`, `executionTargets`,
  `CpuGames.play(…, makeBot)`), with no second `play` and no second interval type. Every name a
  later task uses is in an earlier task's Interfaces: `BotScenes`, `Scene`, `Played`, `Decision.of`,
  `Twins`, `useRandom`, `readsTheGame`, `hardLiberal`, `chancellorHandDrop`, `ClearedPlayers`,
  `ChancellorHand`, `PeekMemory`, `makeBots`, `label`, `ladder`, `ladderReport`, `LadderCheck`.
