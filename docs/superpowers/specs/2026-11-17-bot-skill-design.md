# Bot skill: design

Date: 2026-11-17
Status: approved design, pending implementation plans (`docs/PLAN.md`, Phases 24 to 26B)
Issue: [#72](https://github.com/jussaw/Secret-Hitler-Online/issues/72), which builds on #70 (merged
as #102) and on #31's game records

## Why

The bots (`CpuPlayer`, `backend/src/main/java/game/CpuPlayer.java`) play one fixed set of rules: an
if/else on the bot's role and the board, a score from −5 to +5 for each player, and a weighted
random pick. The user wants levels the host can choose, so a group can play against smarter bots:
"we just want different levels so to make it more difficult/smarter bots". A higher level should
mean a bot that notices more of the game, not one that knows more than it should.

Issue #72 has four parts, in this order: fix the weighted pick, add a run that plays many all-bot
games and counts who wins, make the bots play better, and let the host set Easy, Normal or Hard in
the lobby. This design keeps all four and settles what #72 left open: what each level does, where
the control goes now that #70 has put a bot stepper on START GAME's row, and whether a game's record
keeps its level.

### What changed since #72 was written

#72 was written at 2796a36, before #70 and #31 merged. Its line numbers are stale, and some of what
it says about today is no longer true:

- **Bots now play at tables of 5 to 10.** #70 lets the host choose how many bots join (the stepper
  − 2 BOTS + at the left of START GAME, `BotStepper` in `frontend/src/lobby/LobbyScreen.tsx`;
  `Lobby.setBotCount`, `botCount`, the `set-bot-count` command and the lobby packet's `bots`). So the
  broken pick (part 1) now also chooses investigation targets and special elections, not only
  nominations and executions. Part 1 matters more than #72 says.
- **An all-bot game player already exists.** #31 added `CpuGames` (`backend/src/test/java/server/
  stats/CpuGames.java`), which plays games with a bot in every seat the way `Lobby.updateAllUsers`
  runs them, and fails a game that passes 2,000 moves. `RandomGamesReplayTest` and the stats' contract
  fixture use it. Part 2 builds on it rather than starting fresh.
- **Games are recorded.** A game with bots is recorded like any other, with `hasCpu` true and a null
  `player` on each bot's seat. Nothing in a record says how well the bots played.
- **`Lobby` keeps the bot count in a transient field** (`chosenBots`), as #72 suggested for the
  level.

## Goals

- **A ladder of three levels**, Easy, Normal and Hard, that a group can feel: a side of bots one
  level up wins measurably more often against the same opponents.
- **Hard bots play smarter**, by reading more of what happened in the game: who has been proved not
  to be Hitler, the cards a president hands them, how people voted, the peek, the odds of the deck
  and the election tracker. Hard fascists also bluff.
- **Normal is today's bots with their bugs fixed**, so the default stays familiar.
- **Easy is Normal with mistakes**: a share of its decisions are random legal moves.
- **The host chooses the level in the lobby**, on a row of its own under START GAME's row. Guests
  and spectators see the level the host chose.
- **A game's record keeps its level**, and the stats pages show it where they now say "Bots".
- **A self-play run** that measures all of the above: win rates by table size and by how the game
  ended, with each side's level chosen on its own.

## Non-goals

- A level per bot or per side in a real game. One level applies to every bot in a lobby (#72,
  "Decided"). Only the self-play run gives each side its own level.
- A filter by level on the stats pages, or a rating for bots. Elo still counts a bot's seat as 1500
  whatever its level, and games with bots stay out of the stats unless the CPU switch is on.
- Showing the level on the game page while a game runs.
- Changing how fast bots move (`CPU_ACTION_DELAY_IN_SEC`, 4 s) or how many join (#70).
- A new kind of bot (see Approaches).

## Anti-goals (a failure even if it works)

- **A bot that knows more than a person in its seat would.** The user's rule: "bots themselves
  should only have the same information as users do. they shouldnt know anymore than a human
  player". A bot may use its own role, what its role reveals under the rules (a fascist knows the
  fascists and Hitler; Hitler knows them only at a table of 5 or 6), what it saw as president or
  chancellor (its own hands and peek, an investigation's party), and what every player sees (the
  board, the piles' sizes, the tracker, nominations, every vote, who is dead, who is a bot). Nothing
  else, and never another player's role or hand. `CpuPlayer` is handed the whole `SecretHitlerGame`,
  so this is a rule the code keeps and a test checks (Phase 25A), not something the types prevent.
- **A lower level that plays better than a higher one** in the self-play run.
- **A Hard lobby that is lopsided**: one side winning far more often than in a Normal lobby (the
  balance check below).
- **A bot that stalls or loops.** Every level must finish every game the run plays.
- **Backups that stop loading.** A lobby or game backed up before these phases must still load.
- **A lobby that no longer fits one screen** at the tested sizes (below).

## Constraints

- `SecretHitlerGame` pins no `serialVersionUID`, so no phase adds a field or a non-private method to
  it (`CLAUDE.md`). Anything a bot remembers lives in `CpuPlayer`.
- `CpuPlayer` pins no `serialVersionUID` today. Phase 24 pins it, before any field is added, to the
  value Java computes for the class at Phase 24's base: run `serialver` on the class built from
  `development` and check that it gives `2392054316009854878L`, as #72 found at 2796a36 (the class
  has not changed since). Fields added later come back empty from an older backup, so `readObject`
  fills them, as it does `random` today.
- The players' WebSocket protocol only adds: one command (`set-bot-skill`) and one lobby-packet field
  (`botSkill`). Spectators get the field too and send nothing new.
- No new art. The control uses words, not icons.
- The lobby fits one screen as it does today: with ten players and the longest status, for every
  kind of viewer, at `DESKTOP_SIZES`, `SQUARE_DESKTOPS`, the `NARROW_WINDOWS`, 360x740 and 412x915,
  with 44px targets on phones, checked with CI's Linux fonts too (`DEVELOPMENT.md`, "Browser tests
  on Linux"). At 320x568 it may scroll down, as today.
- One pull request per phase, squashed into `development` (`CLAUDE.md`, Workflow).

## Approaches

### How the levels differ

1. **Each level turns on more rules (chosen).** One kind of bot, as today. Each new skill is a rule
   the bot's level switches on. Easy is Normal plus random legal moves, Normal is today's play with
   the bugs fixed, and Hard turns on every rule. Each rule gets its own test, and the self-play run
   shows that it helps and that the ladder holds. Cost: checks on the level inside the bot's
   decisions.
2. **One smart bot, with lower levels making mistakes.** Every level gets the new rules; Easy and
   Normal make random moves part of the time. Cheapest, but Easy plays erratically rather than
   naively, and Normal gets harder for everyone who never touches the switch.
3. **A new kind of bot for Hard** that weighs every way the roles could have been dealt, given what
   it has seen. Could get the smartest, but it is close to a research project, and backups would
   have to load a second kind of bot.

The user chose 1: the levels differ in what a bot notices, not in how often it blunders, and
backups keep one kind of bot.

### Where the control goes

Settled with browser mockups of the host's lobby at 1600x900 and on a 412px phone, starting from the
lobby as #70 left it. Screenshots are in [`2026-11-17-bot-skill/`](2026-11-17-bot-skill/):
`placement-options.png` (the three drawn) and `option-a-states.png` (the chosen one for each kind of
viewer). They are drawings, not the page: sizes and spacing are close but not exact, the portraits
are blank, and the 320px drawing cuts START GAME short, which the real row does not.

- **A. A row of its own under START GAME's row (chosen).** #70's row stays as merged; a three-way
  switch sits under it. Costs about one line of height.
- **B. In the roster, above the bot rows.** Next to what it changes, but splits the host's controls
  between the roster and the button column, and heads no rows when no bots will join.
- **C. One BOTS card above START GAME**, holding the count and the level, with START GAME back on a
  row of its own. Undoes #70's placement and is too tight for its words at 320px.
- **D. (not drawn) A grey BOT SKILL button that opens a prompt** with the three levels. Costs no
  room but hides the choice behind a tap. It is the fallback if A does not fit (below).

### Whether a record keeps its level

- **Record it (chosen).** Each new game with bots stores its level; the stats pages show it. A
  level not recorded now is lost for good.
- **Leave records as they are.** Less to build, but a win against Hard bots could never be told
  from one against Easy bots.

## Design

### Levels

A new enum, `game.BotSkill`: `EASY`, `NORMAL`, `HARD`, written in the protocol and the records by
its name. `CpuPlayer` keeps its level in a field (`skill`), set by a new constructor
`CpuPlayer(String name, BotSkill skill)`; the existing `CpuPlayer(String name)` means `NORMAL`.
`skill()` returns it. A `CpuPlayer` read from a backup made before the field existed gets `NORMAL`
in `readObject`.

| Level | What it does |
|---|---|
| Easy | Normal, plus at each decision a chance of a random legal move instead (below) |
| Normal | Today's rules with Phase 24's fixes: the fair weighted pick, fascists never shooting a teammate, no re-pick loops |
| Hard | Normal plus every rule under "Hard's rules" |

#### Easy's mistakes

At each decision an Easy bot makes (a nomination, a vote, a discard as president, a choice as
chancellor, a veto answer, a power's target), it first draws: with probability `EASY_MISTAKE_CHANCE`
it picks uniformly among the legal moves instead of deciding as Normal would. The random pick leaves
out the moves no level makes because they throw the game for the bot's own side: the fixes below
hold at every level, so a fascist or Hitler never executes a known teammate, and a fascist never
executes Hitler. (A bot that shoots its own Hitler ends the game at once and reads as broken, not
naive.) The starting value is 0.25; Phase 25A sets the final value from the self-play run, the
lowest that keeps Easy clearly below Normal (below). Ending its term as president is not a
decision: Easy ends it as every bot does.

#### Hard's rules

Each rule reads only what the bot's seat could see (the anti-goal above). Each is its own method or
small class with its own test, and only a Hard bot runs it. The amounts below are starting points;
each phase tunes them with the self-play run and writes the final ones in the code.

Here a "liberal bot" is one dealt Liberal, a "fascist bot" one dealt Fascist, and "the fascist side"
is fascist bots and Hitler. Who runs which rule: rule 1 is a liberal bot's. Rules 2 to 5 read the
game, and run for every Hard bot that does not know every role: liberal bots, and Hitler at a table
of 7 or more, who uses what they read to vote and nominate as the fascist side wants (where a rule
below says "a Hard liberal bot", read "a Hard bot that reads the game"). Rule 6 runs for every Hard
bot, liberal bots one way and the fascist side the other. Rule 7 runs for fascist bots: Hitler
already plays liberal policies to look clean, and keeps its play.

Scores stay from −5 to +5 but may carry fractions where a rule scales an amount (rule 5).

The fascist side gets fewer rules, so it may fail the checks (below). If the ladder check fails on
the fascist side, or the balance check fails with all-Hard liberals too far ahead, Phase 25D may add
rules for the fascist side beyond these seven, each keeping the no-peeking rule, with its own test,
and listed in its pull request. It stops to ask if a check still fails after that, or fails in a
way extra fascist-side rules cannot help (its plan gives the exact stop conditions).

1. **Cleared players.** A chancellor elected after 3 fascist policies, when the game does not end,
   is not Hitler. A Hard liberal bot keeps that list, prefers those players when it nominates, votes
   yes for a government whose chancellor is on it, and with 3 or more fascist policies votes no on a
   chancellor who is not on it unless that player's score is +3 or more. Where its own investigation
   found the president or the chancellor fascist, it votes as Normal does.
2. **The chancellor's hand.** A bot learns nothing from the two cards a president hands it today
   (`handleLegislativeChancellor`). A Hard liberal bot as chancellor lowers the president's score
   for two fascist cards and raises it for two liberal cards, the drop scaled by the deck's odds
   (rule 5), since a liberal president dealt three fascists has to hand on two.
3. **Votes.** A Hard bot remembers every player's vote in every election, from
   `SecretHitlerGame.getVotes()` as each election closes (the game keeps only the latest). A Hard
   liberal bot lowers its score a little for players who keep voting yes for governments that then
   enact fascist policies.
4. **The peek.** A Hard bot president that peeks keeps the three cards it saw (thrown away today,
   `handlePresidentialPowerPeek`). If it is liberal and those cards held a liberal, and the next
   government draws them (no reshuffle between) and enacts a fascist policy, it lowers both
   members' scores, as an onlooker only (not when it sits in that government).
5. **Deck odds.** An onlooker's −1 for a fascist policy is weak evidence when the deck is mostly
   fascist. A Hard bot scales it by how unlikely an all-fascist hand was, worked out from the 17-card
   deck (6 liberal, 11 fascist), the policies on the board and the piles' sizes
   (`getDrawSize`, `getDiscardSize`), with the cards it has seen itself.
6. **The election tracker.** With two failed elections, a third enacts the top card
   (`getElectionTracker()`). A Hard liberal bot votes yes more readily then; a Hard fascist bot less
   readily.
7. **Fascists bluff.** Today a fascist chancellor holding one of each card always plays the fascist
   one, so a liberal president's test catches it every time. While fewer than 3 fascist policies are
   down, a Hard fascist chancellor sometimes plays the liberal one, as Hitler already does, and a
   Hard fascist president sometimes passes one of each.

#### The bug fixes every level gets (Phase 24)

- **The weighted pick.** `getWeightedRandomIndex` scales its random number by the number of eligible
  players, not by their total weight, and falls back to the last eligible player, so the last seat in
  order is picked far too often or never (#72's table). The fix: draw a number in `[0, total
  weight)` and return the first eligible player whose running total exceeds it. A weight of 0 is
  never picked unless every weight is 0, and then the pick is uniform among the eligible players
  (today it is the first). The class's `serialVersionUID` is unchanged by this.
- **Fascists never shoot a teammate.** A fascist bot or Hitler weighs its known fascist teammates at
  0.5 when it executes (`handlePresidentialPowerExecution`); it becomes 0. Hitler at 7 or more knows
  a teammate only by investigating one, and then leaves them out too; players whose roles it does not
  know keep today's weights.
- **No re-pick loops.** Investigation and execution pick again until the pick lands on an allowed
  player. They pick only among allowed players instead (not investigated before, alive, not
  themselves). A liberal bot's investigation can loop forever today when every player not yet
  investigated is a bot at +3 or more; with the bigger tables #70 allows, this can now happen.

### One bot step for the lobby and the self-play run (Phase 24)

The step `Lobby.updateAllUsers` runs on each CPU tick (every bot's `update`, then `act` in name order
until one changes the state, with every bot voting in the same step) moves to one place in the
`game` package, which the lobby, `CpuGames` and the self-play run all call, so the three cannot
drift apart. It takes a callback after each move, which the lobby uses for `observeGame` and
`CpuGames` for its snapshots. The lobby's 4 s timer, its locking and its record keeping stay in
`Lobby`.

### The self-play run

A Gradle task, `./gradlew botMatches`, plays all-bot games straight on `SecretHitlerGame` and
`CpuPlayer` with no server and no waits, and prints, for each table size from 5 to 10 and pooled:
the games played, the liberal side's win rate with its 95% interval, and the share of each ending (5
liberal policies, Hitler shot, 6 fascist policies, Hitler elected chancellor). Its options:

- `-Pgames=N`, games per table size (default 2,000).
- `-Pliberals=LEVEL` and `-Pfascists=LEVEL`: the level of the bots dealt liberal, and of those dealt
  fascist or Hitler (default `NORMAL` for both). Roles are dealt when the game is made, so the run
  makes each bot after the deal, with its side's level.
- `-Pladder`: runs the pairings the ladder and balance checks need (below) and prints them side by
  side.

A game still running after 2,000 moves fails the run, naming the size, the levels and the game's
timeline. The deck shuffle cannot be seeded without adding to `SecretHitlerGame`, so runs are not
repeatable: the intervals say how far a difference can be trusted.

`./gradlew test` stays fast: one test plays a few games at every size and at every pairing of levels
and checks only that each finishes. The ladder is checked by `botMatches -Pladder`, whose output each
bot phase's pull request quotes before and after.

**The ladder check.** For each side, its win rate pooled over sizes 5 to 10 must rise with its level
against Normal opponents: Easy below Normal below Hard, the two rates' 95% intervals not
overlapping at each step. Per size, a higher level's rate must not be lower with the intervals not
overlapping. Phase 25D's pull request shows
the full table. If Hard's fascist side cannot clear Normal by the margin, even with the extra
fascist-side rules allowed above, Phase 25D says so and why, and stops to ask, rather than shipping a
weaker check.

**The balance check.** A real lobby gives every bot one level, so `-Pladder` also plays all-Easy,
all-Normal and all-Hard games. The user's target: pooled over sizes 5 to 10, the liberal win rate in
all-Hard games stays within 10 percentage points of the all-Normal rate, so a person dealt either
side in a Hard lobby has about the chance they would have in a Normal one. Phase 25D tunes toward
both checks and reports both. If they pull against each other (the ladder needs a rule that tips
all-Hard games past the band), it stops and asks.

### The no-peeking test (Phase 25A)

For each level, a test builds two games that a bot's seat cannot tell apart (the same seat order, the
bot's own role, the same visible moves) but that differ in something hidden from it (another
player's role, or the order of cards it has not seen), and checks that the bot, with its random
source seeded the same, makes the same decisions in both. It covers each kind of decision the bot
makes, and every Hard rule.

### The lobby (Phase 26A)

**Server.** `Lobby` keeps the host's level in a transient field beside `chosenBots`: `NORMAL` in a
new lobby, kept after a game, and back to `NORMAL` in a lobby restored from a backup (as the bot
count goes back to the fewest). `Lobby.botSkill()` reads it and `Lobby.setBotSkill(BotSkill)` sets
it outside a game. `startNewGame` makes each bot with it. The host's command:

- `set-bot-skill`, with `skill`: `"EASY"`, `"NORMAL"` or `"HARD"`.
- From anyone but the host it is refused as `set-bot-count` is; an unknown level is refused; sent
  while a game runs (a press just after START GAME) it is dropped and logged, as `set-bot-count`
  is.
- Every lobby packet adds `botSkill`, the level's name, for players and spectators.

**Page: option A.** Under START GAME's row, the host gets a row of its own in the stepper's card
style: the label BOT SKILL, then three buttons, EASY, NORMAL and HARD, the chosen one in the orange
of START GAME and the others dark. It is a `role="group"` named "Bot skill", its buttons
`aria-pressed`, as the stepper is a group named "Bots". A press shows the new level at once and
sends `set-bot-skill`; the next lobby packet's `botSkill` confirms it, as the stepper's count does.
The switch stays on when no bots will join, as #72 decided: with ten people the stepper reads 0 and
both its buttons are off, but the level can still be set. The row is as wide as START GAME's row on
desktop and the full column on phones, its buttons 44px targets on phones.

Guests and spectators get the same line in the same place without buttons: BOT SKILL, then the level
in white (for a spectator, under the status card and above PLAY INSTEAD or SIGN IN TO PLAY). The
level shows in this one place only: the roster's bot rows and the status line stay as #70 drew them.

**Fit.** The new line is about 50px on a phone. The lobby must still fit one screen as the
Constraints say, for the host, a guest and every spectator viewer `longestLineViewers` covers, with
ten players. If BOT SKILL and its three buttons do not fit one line at a phone width (360x740,
412x915 or 320x568) with Linux fonts, after the row's own spacing is tightened, the label may
shorten to SKILL at that width. If the row still takes two lines at any tested size, or the lobby
no longer fits one screen at any tested size for some viewer, Phase 26A stops and asks, with the
widths and heights it measured, before falling back to option D.

### The records (Phase 26B)

**Format 2.** A record adds one key, `botSkill`, right after `hasCpu`: the level's name when any
seat was a bot, and `null` when none was. `GameRecord.FORMAT` becomes 2. `handOverGame` takes the
level from the game's bots (every bot in a lobby game shares one; a bot restored from an older
backup reads `NORMAL`). The `games` table is unchanged: the record's JSON holds the key, and its
`format` column says 2. Records already stored stay format 1 and are served as stored.

**Readers.** `parseStatsData` accepts format 1 (no `botSkill`; read as `null`) and format 2
(`botSkill` `null` or one of the three names), and still throws `Unsupported game record format: N`
for any other. `RecordFormat` (the backend's test of the spec's format) knows both. The contract
fixture is made again (`./gradlew recordedGamesFixture`): its games with bot seats get levels in
turn, Easy, Normal, Hard. The game stats design's record table
(`docs/superpowers/specs/2026-11-15-game-stats-design.md`, "The record") gains the key and format 2.

**Pages.** Where a game with bots is tagged "Bots" (a GAMES row, `GameRow`; a player's latest
games, `PlayerPage`), a record with a level says "Easy bots", "Normal bots" or "Hard bots"; a format
1 record still says "Bots". A GAMES row's link name says "· with Hard bots" in the same way. A game's
page (`GameHeader`) adds the level to its header for a game with bots ("Hard bots"), and nothing for
a format 1 record. The tag keeps its look; its 320px fit is checked by the stats specs as today.

### Names the phases share

25B, 25C and 25D (one after the other), 26A and 26B run at the same time once 25A has merged, so these names
are fixed here:

| Name | Where | Made in |
|---|---|---|
| `BotSkill` (`EASY`, `NORMAL`, `HARD`) | `backend/src/main/java/game/BotSkill.java` | 25A |
| `CpuPlayer(String name, BotSkill skill)`, `skill()` | `CpuPlayer` | 25A |
| `EASY_MISTAKE_CHANCE` | `CpuPlayer` | 25A |
| `CpuTurn.step(SecretHitlerGame game, Collection<CpuPlayer> cpus, Runnable afterMove)`, returning whether the bots moved the game on (the lobby's `didCpuUpdateState`); `cpus` in name order | `backend/src/main/java/game/CpuTurn.java` | 24 |
| `BotMatches` (the run's `main` and `play`), `BotMatchesTest` (the fast test) | `backend/src/test/java/game/` | 24 (levels 25A) |
| `botMatches` and its options | `backend/build.gradle`, a `JavaExec` on the test classpath, as `recordedGamesFixture` is | 24 (levels 25A) |
| `Lobby.botSkill()`, `Lobby.setBotSkill(BotSkill)` | `Lobby` | 26A |
| `set-bot-skill`, `skill`, `botSkill` | `SecretHitlerServer` constants, `frontend/src/types/commands.ts` | 26A |
| Record key `botSkill`, `GameRecord.FORMAT = 2` | `GameRecord`, `frontend/src/stats/record.ts` | 26B |

File owners while they run: 25B, 25C and 25D in turn own `CpuPlayer.java` and the bot tests; 26A owns `LobbyScreen.*`,
`App.tsx`'s lobby state, `SecretHitlerServer`'s command, and `Lobby`'s field, command and
`startNewGame`; 26B owns `server/stats/`, `frontend/src/stats/` and `Lobby.handOverGame`. `CLAUDE.md`
and `README.md` are edited by each in its own section, and the later to merge rebases.

## Phases

| Phase | What | Needs |
|---|---|---|
| 24. Bot fixes and self-play | Pin `CpuPlayer`'s `serialVersionUID`; the weighted pick, teammate executions and re-pick loops fixed; the shared bot step; `botMatches` with today's bots | — |
| 25A. Bot skill levels | `BotSkill`; a bot's level; Easy's mistakes, tuned; per-side levels and the checks in `botMatches`; the no-peeking test | 24 |
| 25B. Hard's first rules | Hard's rules 1, 2 and 4, each in the no-peeking test; Hard not below Normal | 25A |
| 25C. Hard's other rules | Hard's rules 3, 5, 6 and 7, each in the no-peeking test, with rule 2 scaled by rule 5 | 25B |
| 25D. Ladder and balance | Tuning the amounts (and any extra fascist-side rules) until the ladder and balance checks pass | 25C |
| 26A. Bot skill in the lobby | The lobby's level, `set-bot-skill`, `botSkill`, the BOT SKILL row and the guests' line | 25A to build, 25D to merge |
| 26B. Bot skill in the records | Format 2 with `botSkill`, the readers, the fixture and the stats pages' tags | 25A to build, 25D to merge |

26A and 26B are built alongside 25B to 25D but merge after 25D, in the order 25D, 26A, 26B. Every merge
into `development` publishes the image the home server pulls, so HARD reaches players, and records
start saying "Hard bots", only once Hard has passed the ladder check. 26B, merging last, adds the
test that a game started at Hard in a lobby is recorded as Hard.

24 and 25A to 25D each change what bots do, so each quotes `botMatches` before and after. 24 and 25A to 25D
change nothing on screen; 26A and 26B show before-and-after screenshots at a desktop and a phone
size (`CLAUDE.md`, Workflow).

## Tests

- **24:** `testCpuPlayer` gains a test with unequal weights that checks each player's share within a
  tolerance (#72's cases, using `makePlayers`, `getPlayerOfIdentity` and `ITERATIONS`), one where
  every weight is 0, one that a fascist never executes a known teammate, and one that investigation
  and execution end with every other player at +3 or more. `CpuGames` and the lobby use the shared
  step (`RandomGamesReplayTest` and the lobby's CPU tests still pass unchanged). The fast self-play
  test. `DatabaseBackupTest` still loads older backups with the pinned UID.
- **25A:** a test per Easy decision kind (a random legal move happens at about the set rate, and
  never an illegal one); the no-peeking test, with seeds mixed so each seed's draws differ, open
  votes hidden until the election closes, and every pair of other seats swapped; a bot restored
  from a pre-level backup plays `NORMAL`; the fast self-play test at every pairing of levels.
- **25B:** a test per Hard rule (1, 2 and 4), each also in the no-peeking test; a Hard bot's memory
  through a backup; Hard not below Normal in `-Pladder`.
- **25C:** a test per Hard rule (3, 5, 6 and 7), each also in the no-peeking test; deck odds through
  a reshuffle.
- **25D:** a test per extra fascist-side rule, if any; the ladder and balance checks' output in the
  pull request, from two confirming runs pooled.
- **26A:** backend tests beside `LobbyStartTest` and `BotCountServerTest`: the command (host only,
  known levels only, dropped during a game), the packet field for players and spectators, a start at
  each level seats bots of that level, the level kept after a game and back to Normal after a restore.
  Vitest for `LobbyScreen`: the host's three buttons and their pressed state, a press that shows at
  once, the guests' and spectators' line. Browser tests: `no-scroll.spec.ts` (`desktop`, `firefox`)
  and `phone.spec.ts` (`phone-360`, `phone-412`, and 320x568 in `phone-360`) still fit the lobby for
  every viewer with the new row or line, with 44px targets on phones; `actionLabels` knows the new
  buttons. Run with Linux fonts in the Playwright image for the phone sizes.
- **26B:** `GameRecordJsonTest` (the key's place and values), `GameStoreTest` (a format 2 record
  saved and served beside a format 1 one), `RecordFormat` and `RecordedGamesFixtureTest` on the new
  fixture, a lobby test that a game's record carries the lobby's level, Vitest for `parseStatsData`
  (both formats, a bad level refused) and for each tag, and the stats specs at every size.

## Docs

Each phase updates `CLAUDE.md` for what it changed: the bots and their levels and the self-play run
(24 to 25D, including the line that `CpuPlayer` pins no `serialVersionUID`, which 24 changes), the
lobby and the protocol line under Constraints (26A: one command and one field), and the record's
format (26B). `README.md`'s list of what the fork adds gains bot levels (26A). `DEVELOPMENT.md`
gains `./gradlew botMatches` (24). The game stats design's record table gains `botSkill` (26B).

## Acceptance

- `botMatches -Pladder` shows the ladder and the balance band (Phase 25D), and every level finishes
  every game it plays.
- The no-peeking test passes for every level and every Hard rule.
- In a lobby, the host sets each level and a guest and a spectator see it; a game started at Hard
  seats Hard bots, and GAMES then lists it with "Hard bots".
- Backups written before these phases load, with their bots playing Normal.
- The lobby fits one screen at every tested size for every viewer, with 44px targets on phones.
- The user plays a game against Hard bots on the deployed build (the user's box).

## Left to the builder

- Each Hard rule's amounts, and `EASY_MISTAKE_CHANCE`'s final value, set from `botMatches`.
- The shared step's name and signature, and where the self-play run's code lives in the test source
  set.
- How the deck odds are worked out, as long as they use only what the bot's seat has seen.
- The BOT SKILL row's exact spacing and the label's shortening at 320px, within the fit rules above.
- How a press of a level, like the stepper's, holds its shown value until the next packet.
