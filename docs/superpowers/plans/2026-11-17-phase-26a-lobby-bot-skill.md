# Phase 26A: Bot skill in the lobby Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The host sets how well the bots play (EASY, NORMAL or HARD) on a row of its own under
START GAME's row, the next game seats every bot at that level, and every guest and spectator sees
the level on a line in the same place.

**Architecture:** As #70 did for the bot count (PR #102): `Lobby` keeps the host's level in a
transient field beside `chosenBots`, sends it as `botSkill` in every lobby packet, and makes each
bot of the next game with it; `SecretHitlerServer` takes the host's `set-bot-skill` the way it
takes `set-bot-count`. On the page, `LobbyScreen` draws the host's three-way switch (a
`BotSkillSwitch` beside `BotStepper`, holding a press until the next lobby packet as the stepper
does) and everyone else's read-only line, and `App` keeps the packet's level in its lobby state.

**Tech Stack:** Java 17, Javalin 5, JUnit 4 · React 18, TypeScript 5, Vitest with Testing Library,
Playwright (macOS and its Linux image). No new dependency.

**Spec:** [`docs/superpowers/specs/2026-11-17-bot-skill-design.md`](../specs/2026-11-17-bot-skill-design.md),
"The lobby (Phase 26A)", "Where the control goes" (option A, drawn in
[`2026-11-17-bot-skill/option-a-states.png`](../specs/2026-11-17-bot-skill/option-a-states.png)),
"Names the phases share", Constraints, Tests "26A", Docs and Acceptance. Phase 26A's section of
[`docs/PLAN.md`](../../PLAN.md) holds the boxes this plan ticks.

## Decisions

The spec settles what players see; these settle what it leaves to the build.

- **An unknown level is refused like any malformed command:** the handler's `RuntimeException`
  path closes the host's socket with 1002 and changes nothing (`BotSkill.valueOf` of a missing,
  lowercase, unknown or non-string `skill` throws). Checks run in `set-bot-count`'s order: host,
  then a running game (dropped), then the level.
- **The press's hold** mirrors `BotStepper`: the switch keeps `{ on: bots, skill }` and shows that
  level while the `bots` prop is the same array, which `App` makes anew from every lobby packet
  (`message[PARAM_BOTS] ?? []`). So the next lobby packet, whatever it says, ends the hold. A press
  of the level already shown sends nothing.
- **Guests and spectators always get the line**, bots or not: the host's switch is on with no bots
  to seat (#72), and the level shows in one place for every viewer.
- **"As wide as START GAME's row" on desktop:** START GAME's row and the switch share a new column,
  `div.lobby-host-controls`, as wide as the wider of the two (it shrinks to fit inside
  `.lobby-actions`, which centres it), and the switch stretches across it. On phones it is the
  column's width, as `.lobby-actions` stretches its children there.
- **44px targets at every size** for EASY, NORMAL and HARD, as for every button under the status
  line (`no-scroll.spec.ts` checks `.lobby-actions` at every size).
- **Where the names live:** `WSCommandType.SET_BOT_SKILL`, its payload, the `BotSkill` type,
  `BOT_SKILLS` and `botSkillOf` in `frontend/src/types/commands.ts` (the spec's table);
  `PARAM_BOT_SKILL` in `frontend/src/constants/index.ts` beside #70's `PARAM_BOTS`, where the lobby
  packet's fields are.
- **A test-only view of the seated bots:** `Lobby.seatedBotSkills()`, package-private, so the lobby
  tests can see each seated bot's level; nothing else reads it.
- **The label shortens to SKILL** (at widths under 360px only) only if the Linux image's 320x568 run
  puts the host's row on two lines (Task 5).
- **Screenshots:** a lobby of four people and two bots (the mockup's), seen by the host and a guest;
  in the "after" shots the host has chosen HARD, so the guest's line shows the host's choice.

## Global Constraints

- **Protocol (spec, Constraints):** the players' protocol only adds one command, `set-bot-skill`
  with `skill` (`"EASY"`, `"NORMAL"` or `"HARD"`), and one lobby-packet field, `botSkill` (the
  level's name). Spectators get the field too and send nothing new.
- **Names, exactly (spec, "Names the phases share"):** `Lobby.botSkill()`,
  `Lobby.setBotSkill(BotSkill)`, `set-bot-skill`, `skill`, `botSkill`. From Phase 25A (consumed,
  never edited): `game.BotSkill` (`EASY`, `NORMAL`, `HARD`), `CpuPlayer(String name, BotSkill
  skill)` and `CpuPlayer.skill()`.
- **Copy, exactly:** the host's label `BOT SKILL` (`SKILL` under 360px only if Task 5 needs it),
  the buttons `EASY`, `NORMAL`, `HARD`, the group's name `Bot skill`; the others' line `BOT SKILL`
  then the level's name in white. The roster's bot rows and the status line are unchanged (the level
  shows in this one place only). No new art: words, no icons.
- **Look:** the switch and the line in the stepper's card style (`--backgroundDark`, `0.6em`
  radius, the same shadow); the chosen button in START GAME's orange (App.css's default face), the
  others dark with `#b9ab9f` labels. No transition on anything but a colour
  (`button-press.spec.ts`).
- **Fit (spec, Constraints and "Fit"):** with ten players and the longest status, for the host, a
  guest and every spectator viewer `longestLineViewers` covers, the lobby fits one screen at
  `DESKTOP_SIZES`, `SQUARE_DESKTOPS`, the `NARROW_WINDOWS`, 360x740 and 412x915, with 44px targets on
  phones, checked with CI's Linux fonts too; at 320x568 it may scroll down, never sideways. Only
  the new row's own spacing may be tuned to fit. **If any of those sizes still fails for any
  viewer, stop and ask** (report each viewer, size and overflow in px); the fallback, a prompt
  (option D), is never built without the user's word.
- **Never touch:** `backend/src/main/java/game/` (`CpuPlayer.java` is 25B's, `BotSkill.java`
  25A's), `backend/src/test/java/game/`, `server/stats/`, `frontend/src/stats/` and
  `Lobby.handOverGame` (26B's), and `docs/superpowers/specs/`. A change one of them seems to need:
  stop and ask.
- **ES2020** in code and tests; no `e2e/` file imports `src/constants` or anything that does.
- **Environment:** `export JAVA_HOME=<java-17-home>` (any installed Java 17) for every Gradle
  and `npm run e2e` run; `cd frontend && npm ci` once in the worktree; every browser run, and the
  jar the Linux image tests, on `E2E_PORT=4626` (another phase may use 4627 at the same time). Scratch
  files (the PR body) in the session scratchpad.
- **Flakes:** a failure in a test this phase cannot reach is checked on `development` before it is
  called a flake (the `implement-issue` skill, step 5).
- **Branch and commits:** worktree and branch `phase-26a-lobby-bot-skill`, off an `origin/development`
  that has Phase 25A. Conventional Commits with a scope (`backend`, `frontend`, `docs`, `claude`,
  `readme`, `development`, `plan`), each test in the commit with its code, files staged by name
  (`frontend/e2e/pr-shots.spec.ts` stays untracked until Task 6 deletes it). A box of Phase 26A in
  `docs/PLAN.md` is ticked in the commit that finishes its work.
- **Merge order:** the pull request merges only after Phase 25B's. 26B edits `Lobby.java`
  (`handOverGame`), `CLAUDE.md` and `README.md` at the same time: whichever merges later rebases and
  keeps both sides.
- **Public repo:** nothing about the home server in code, docs, commits or the pull request.

## Review Focus

1. **A malformed `set-bot-skill`** from a changed client (`skill` missing, `"hard"`, `"EXPERT"`, `2`
   or `null`): the host's socket closes with 1002, the level stays as it was, and nothing escapes to
   Javalin's handler. Task 3 (`anUnknownSkillIsRefused`).
2. **A lobby packet with no `botSkill`, or an unknown one** (the scripted sockets of
   `e2e/fakeGame.ts` send none): the page shows NORMAL, never a blank line or an error. Task 4
   (`a lobby packet without a known bot skill shows NORMAL`).
3. **The host leaves and the next player becomes host:** the new host gets the switch with the
   level the old host chose pressed, and the server takes their presses. Task 3
   (`theNextHostSetsTheSkill`) and Task 4 (`a new host gets the switch, at the level chosen`).
4. **A server restart mid-game:** the running game's bots keep their level (they are backed up),
   while the lobby's choice is NORMAL for the next game. Task 2
   (`aRestoredGameKeepsItsBotsSkill`).
5. **Quick presses:** a press of the level shown sends nothing; two presses before the server
   answers show and send the second; the next lobby packet, even one that left before the press
   arrived, shows the server's level. Task 4 (`pressing the level shown sends nothing`, `a second
   press before the server answers shows the second`, `the level pressed holds until the next lobby
   packet`).

---

### Task 1: Start check and the "before" screenshots

**Files:**
- Modify: `docs/PLAN.md` (the Progress row of 26A reads "in progress")
- Create (never committed): `frontend/e2e/pr-shots.spec.ts`
- Create: `docs/pr/phase-26a-lobby-bot-skill/before-{host,guest}-{1600x900,412x915}.png`

- [ ] **Step 1: Check the start.** `origin/development` has Phase 25A:
  `backend/src/main/java/game/BotSkill.java` declares `EASY`, `NORMAL`, `HARD`, and `CpuPlayer` has
  `public CpuPlayer(String name, BotSkill skill)` and `public BotSkill skill()`. `docs/PLAN.md` has
  "Phase 26A: Bot skill in the lobby" with its four boxes. If 25A's names differ from these, stop
  and ask.
- [ ] **Step 2: Write `frontend/e2e/pr-shots.spec.ts`.** It starts with
  `test.skip(!process.env.PR_SHOTS)` and a `const PREFIX = "before"`. One test, in `desktop` at
  1600x900 and in `phone-412` at 412x915 (`test.info().project.name`; skip other projects): the host
  (`page`) `createLobby(page, uniqueName("Host Player"))`; a guest page (`browser.newPage()`, same
  viewport) `joinLobby(guest, code, uniqueName("Guest"))`; `joinGuests(baseURL, code, 2)`;
  `waitForPlayers` 4 on both pages; the host presses "More bots" once (two bots, the mockup's
  lobby); when `PREFIX !== "before"` (Task 4's `check` and Task 6's `after`), the host presses HARD
  in the group "Bot skill" and the guest's `.lobby-skill-level` reads `HARD`; then `settle` both and save window-sized shots to this
  worktree's `docs/pr/phase-26a-lobby-bot-skill/${PREFIX}-host-${W}x${H}.png` and
  `${PREFIX}-guest-${W}x${H}.png` (an absolute path). Close the raw guests and the guest page.
- [ ] **Step 3: Take the shots** before any code changes:
  `cd frontend && PR_SHOTS=1 E2E_PORT=4626 npx playwright test e2e/pr-shots.spec.ts
  --project=desktop --project=phone-412`. Expected: 2 passed, four PNGs showing #70's lobby (the
  stepper beside START GAME, no BOT SKILL row).
- [ ] **Step 4: Commit** `docs(plan): start phase 26a` (the Progress row), then `docs(docs): add
  phase 26a's before screenshots` (the four PNGs only). The spec stays uncommitted for Task 6.

---

### Task 2: The lobby keeps the host's level

**Files:**
- Modify: `backend/src/main/java/server/util/Lobby.java` (the field beside `chosenBots`, the
  constructor, `botSkill`, `setBotSkill`, `seatedBotSkills`, `lobbyPacket`, `readObject`,
  `startNewGame`; nothing in `handOverGame`), `backend/src/main/java/server/SecretHitlerServer.java`
  (`PARAM_BOT_SKILL` only, beside `PARAM_BOTS`)
- Create: `backend/src/test/java/server/util/LobbyBotSkillTest.java`

**Interfaces:**
- Consumes: `game.BotSkill`, `new CpuPlayer(String name, BotSkill skill)`, `CpuPlayer.skill()` and
  `CpuPlayer.myName` (25A).
- Produces in `Lobby`:
  ```java
  transient private BotSkill chosenSkill;            // NORMAL in a new lobby and after readObject
  synchronized public BotSkill botSkill();           // the level the next game's bots play at
  synchronized public void setBotSkill(BotSkill skill);
      // @throws IllegalStateException in a game (nothing changes); NullPointerException for null.
      // Sends nothing: the caller sends the state.
  synchronized Map<String, BotSkill> seatedBotSkills(); // package-private, for tests: the running
      // game's bots, seat name to level, in name order (a TreeMap); empty outside a game
  ```
  In `SecretHitlerServer`: `public static final String PARAM_BOT_SKILL = "botSkill"; // in every
  lobby packet: the level of the bots a game started now seats`. `lobbyPacket()` puts it as
  `chosenSkill.name()`, after `PARAM_BOTS`. `startNewGame`
  makes each bot `new CpuPlayer(botName, chosenSkill)`. The field's comment says what `chosenBots`'
  says about backups: transient, so a backup is as it was, and a restored lobby is NORMAL.

- [ ] **Step 1: Write the failing tests** in `LobbyBotSkillTest`, with `LobbyBotCountTest`'s
  `@Before`/`@After` grace window, its `addPlayer`/`addPlayers`, and `packetSkill(lobby, socket)`
  (`sendStateToAll()` under the lobby's lock, then `socket.last().getString("botSkill")`):
  ```java
  @Test public void aNewLobbyIsNormal()                 // botSkill() NORMAL; packetSkill "NORMAL"
  @Test public void everyViewerGetsTheSkillInTheLobbyPacket()
      // two players and a spectator, setBotSkill(HARD): "HARD" in P2's packet, and the spectator's
      // last packet is type "lobby" with botSkill "HARD"
  @Test public void theStartSeatsBotsAtTheChosenSkill()
      // for (BotSkill skill : BotSkill.values()): a new lobby of two, setBotSkill(skill),
      // startNewGame(): seatedBotSkills() equals {"Bot 1": skill, "Bot 2": skill, "Bot 3": skill}
  @Test public void aStartWithoutAChoiceSeatsNormalBots() // four players: {"Bot 1": NORMAL}
  @Test public void noBotsAreSeatedOutsideAGame()       // empty in a new lobby and after dropGame()
  @Test public void theSkillCannotChangeDuringAGame()
      // HARD, start, setBotSkill(EASY) throws IllegalStateException; botSkill() still HARD and
      // every seated bot still HARD
  @Test public void aNullSkillIsRefused()               // NullPointerException; still NORMAL
  @Test public void theSkillStaysAfterAGame()
      // HARD, start, dropGame(): botSkill() HARD, packetSkill "HARD", and the next start seats HARD
  @Test public void aRestoredLobbyIsNormal()
      // HARD, no game, written and read back as LobbyBotCountTest.aRestoredLobbyStartsAtTheFewestBots
      // does: botSkill() NORMAL, and a player added to it gets "NORMAL"
  @Test public void aRestoredGameKeepsItsBotsSkill()
      // two players, HARD, start, written and read back: seatedBotSkills() all HARD (the game's
      // bots are backed up), botSkill() NORMAL (the next game's)
  ```
- [ ] **Step 2: Run** `cd backend && ./gradlew test --tests server.util.LobbyBotSkillTest`.
  Expected: FAIL to compile (`botSkill`, `setBotSkill`, `seatedBotSkills` missing).
- [ ] **Step 3: Implement** as in Interfaces, with Javadoc in `setBotCount`'s style.
- [ ] **Step 4: Run** `./gradlew test --tests 'server.util.*'`. Expected: PASS, `LobbyBotCountTest`
  and `LobbyStartTest` unchanged and green.
- [ ] **Step 5: Commit** `feat(backend): keep the host's bot skill in the lobby`.

---

### Task 3: The host's `set-bot-skill`

**Files:**
- Modify: `backend/src/main/java/server/SecretHitlerServer.java` (two constants and one `case`
  after `COMMAND_SET_BOT_COUNT`'s), `docs/PLAN.md`
- Create: `backend/src/test/java/server/BotSkillServerTest.java`

**Interfaces:**
- Consumes: `Lobby.botSkill()`, `Lobby.setBotSkill(BotSkill)` (Task 2), `Lobby.isHost(String)`
  (#70).
- Produces in `SecretHitlerServer`, beside #70's:
  ```java
  public static final String PARAM_SKILL = "skill"; // set-bot-skill's level: EASY, NORMAL or HARD
  public static final String COMMAND_SET_BOT_SKILL = "set-bot-skill"; // the host's, in the lobby: params PARAM_SKILL (a BotSkill's name)
  ```
  The `case` is `COMMAND_SET_BOT_COUNT`'s with its last line
  `lobby.setBotSkill(BotSkill.valueOf(message.getString(PARAM_SKILL)))` and the refusal "Only the
  host chooses how well the bots play."

- [ ] **Step 1: Write the failing tests** in `BotSkillServerTest`, a copy of `BotCountServerTest`'s
  harness (its server, `SignedInPlayers`, `thrown`, codes `BS00`…, `players`, `settle`,
  `command`), with `setSkill(code, Object skill)` (`set-bot-skill` with `skill`, or no `skill` when
  it is `null`), `lastSkill(socket)` (the last lobby packet's `botSkill`) and
  `awaitLobby(socket, Predicate<JSONObject>)` (polls `received()` for 5 s until the last lobby
  packet matches):
  ```java
  @Test public void theHostsSkillReachesEveryone()
      // four players and a spectator: the spectator's first lobby packet says "NORMAL"; the host
      // sends HARD and gets "ok"; after settle, lastSkill is "HARD" for the host, a guest and the
      // spectator
  @Test public void aGuestCannotSetTheSkill()
      // guest sends HARD: closed with 1002; the host's lastSkill "NORMAL"; thrown is empty
  @Test public void aSpectatorsSkillIsDropped()
      // the spectator stays open; the host's lastSkill "NORMAL"
  @Test public void anUnknownSkillIsRefused()
      // for each of: no skill, "hard", "EXPERT", 2, JSONObject.NULL, in a new lobby of two each:
      // the host's socket closes with 1002, the guest's lastSkill is "NORMAL", thrown is empty
  @Test public void aSkillSentAfterTheStartIsDropped()
      // five players; start-game then set-bot-skill EASY at once: the game starts, the host's
      // socket stays open, codeToLobby.get(code).botSkill() is NORMAL, thrown is empty
  @Test public void theNextHostSetsTheSkill()
      // Ann (host) and Bea; Ann sends HARD; Lobby.PLAYER_TIMEOUT_IN_SEC = 0.05f, Ann's socket
      // closes; awaitLobby(bea, usernames is ["Bea"]); Bea's lastSkill "HARD"; Bea sends EASY,
      // gets "ok", and her lastSkill is "EASY"
  ```
- [ ] **Step 2: Run** `./gradlew test --tests server.BotSkillServerTest`. Expected: FAIL in
  `theHostsSkillReachesEveryone` and `theNextHostSetsTheSkill`: the command is unrecognized, so the
  server closes the host's socket (the tests send literals, as `BotCountServerTest` does, so they
  compile).
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS, every backend test.
- [ ] **Step 5: Commit** `feat(backend): take the host's set-bot-skill`, ticking Phase 26A's first
  box ("`Lobby` keeps the host's level …").

---

### Task 4: The BOT SKILL row and the level line

**Files:**
- Modify: `frontend/src/types/commands.ts`, `frontend/src/constants/index.ts`,
  `frontend/src/lobby/LobbyScreen.tsx`, `LobbyScreen.css`, `LobbyScreen.test.tsx`,
  `frontend/src/App.tsx`, `frontend/src/App.test.tsx`, `docs/PLAN.md`

**Interfaces:**
- Consumes: the lobby packet's `botSkill` and the `set-bot-skill` command (Task 3).
- Produces in `types/commands.ts`:
  ```ts
  export type BotSkill = "EASY" | "NORMAL" | "HARD";
  export const BOT_SKILLS: readonly BotSkill[] = ["EASY", "NORMAL", "HARD"];
  /** A lobby packet's botSkill: one of BOT_SKILLS, or NORMAL for anything else (missing, unknown). */
  export function botSkillOf(value: unknown): BotSkill;
  // WSCommandType.SET_BOT_SKILL = "set-bot-skill" (comment: the host chooses how well the bots play, #72)
  // ServerRequestPayload gains { command: WSCommandType.SET_BOT_SKILL; skill: BotSkill }
  ```
  and the `WSCommand` doc comment gains `@param {BotSkill} skill`.
- Produces in `constants/index.ts`, after `PARAM_BOTS`: `export const PARAM_BOT_SKILL = "botSkill";`
  (doc: the lobby packet's level of the bots a game started now seats, #72).
- `LobbyScreenProps` gains `botSkill: BotSkill` ("The level the bots play at, as the lobby packet
  says") and `onSetBotSkill: (skill: BotSkill) => void` ("The host's switch: asks the server for this
  level").
- In `LobbyScreen.tsx`, beside `BotStepper`:
  ```ts
  function BotSkillSwitch(props: { skill: BotSkill; bots: string[]; onSetBotSkill: (skill: BotSkill) => void }): JSX.Element;
  //   div.lobby-skill role="group" aria-label="Bot skill": span.lobby-skill-label aria-hidden="true"
  //   "BOT SKILL", then div.lobby-skill-options of three button.lobby-skill-option (EASY, NORMAL,
  //   HARD, type="button", aria-pressed). Holds { on: bots, skill } after a press (Decisions).
  function BotSkillLine(props: { skill: BotSkill }): JSX.Element;
  //   p.lobby-skill-line: span.lobby-skill-label "BOT SKILL", a space, span.lobby-skill-level the name
  ```
  In `.lobby-actions`, the host gets `div.lobby-host-controls` holding `.lobby-start-row` (as now)
  then `BotSkillSwitch`; anyone else gets `BotSkillLine` first, before `.lobby-secondary`. The
  component docs (file header comment, `LobbyScreen`'s) name the row and the line.
- `App.tsx`: `AppState.botSkill: BotSkill` (default `"NORMAL"`, doc: the lobby packet's level, #72);
  a lobby packet sets `botSkill: botSkillOf(message[PARAM_BOT_SKILL])` beside `bots`; a socket to
  another lobby resets it with `usernames` and `bots`; `onClickSetBotSkill(skill: BotSkill)` sends
  `{ command: WSCommandType.SET_BOT_SKILL, skill }`, bound in the constructor; `LobbyScreen` gets
  `botSkill` and `onSetBotSkill`.
- `LobbyScreen.css` (after the stepper's rules; values not given here are the builder's):
  `.lobby-bots`' card look (background, radius, shadow) moves to a list with `.lobby-skill` and
  `.lobby-skill-line`. `.lobby-host-controls`: a column, `align-items: stretch`, `max-width: 100%`,
  the gap of `.lobby-actions` (1em; 10px in the phone-only block). `.lobby-skill`: one flex line
  (`flex-wrap: wrap`, so a row too narrow shows as two lines in Task 5's check rather than
  overflowing), the label then the options, centred. `.lobby-skill-label`: `.lobby-bots-word`'s look
  (header font, 1.15em, 0.06em spacing, `#b9ab9f`), `white-space: nowrap`.
  `.lobby-skill-options`: the three side by side on a darker track. `.lobby-main .lobby-skill-option`:
  `min-width: 44px; min-height: calc(44px + var(--button-depth))` at every size, `white-space:
  nowrap`; not pressed, a dark face and shadow with a `#b9ab9f` label and a lighter dark face on
  hover and focus; `[aria-pressed="true"]`, App.css's orange face and white label.
  `.lobby-skill-line`: centred, `margin: 0`, its level `.lobby-skill-level` in the header font and
  `#ffffff`. Phone-only block: `.lobby-skill` across the column with the label at the left and the
  options sharing the rest in equal columns; `.lobby-skill-line` across the column. Tall-window
  block: nothing unless Task 5 finds a need (its 44px faces already reach the options).

- [ ] **Step 1: Write the failing tests.** `LobbyScreen.test.tsx`: `lobbyProps` gains
  `botSkill: "NORMAL"` and `onSetBotSkill: vi.fn()`; helpers `skillGroup = () =>
  screen.queryByRole("group", { name: "Bot skill" })` and `pressed = () =>
  within(skillGroup()!).getAllByRole("button").map((b) => b.getAttribute("aria-pressed"))`.
  - "the host's buttons" becomes `["COPY", "Fewer bots", "More bots", "START GAME", "EASY",
    "NORMAL", "HARD", "CHANGE NAME", "CHANGE LOOK", "WATCH INSTEAD", "LEAVE LOBBY"]`.
  - `the host's BOT SKILL row sits under START GAME's row`:
    `Array.from(document.querySelector(".lobby-host-controls")!.children)` equals
    `[document.querySelector(".lobby-start-row"), skillGroup()]`; the group's text matches
    `/^BOT SKILL\s*EASY\s*NORMAL\s*HARD$/`; `pressed()` is `["false", "true", "false"]`.
  - `a press shows the level at once and asks the server for it`: click HARD → `pressed()` is
    `["false", "false", "true"]` and `onSetBotSkill` was called once, with `"HARD"`.
  - `the level pressed holds until the next lobby packet`: with `bots(2)`, click HARD;
    `rerender(<LobbyScreen {...props} />)` → still HARD; `rerender` with a new `bots(2)` and
    `botSkill="NORMAL"` (a packet sent before the server took the press) → NORMAL; again with a new
    `bots(2)` and `botSkill="HARD"` → HARD.
  - `a second press before the server answers shows the second`: HARD then EASY → calls
    `[["HARD"], ["EASY"]]`, EASY pressed.
  - `pressing the level shown sends nothing`: click NORMAL → `onSetBotSkill` not called, NORMAL
    still pressed.
  - `the switch stays on with ten people and no bots`: `renderLobby()` → EASY, NORMAL and HARD
    enabled, while "Fewer bots" and "More bots" are disabled.
  - `guests and spectators see the level on a line where the host's row is, without buttons`: for
    a guest (`user: lg(1)`) and `watching()` signed in, signed out, and signed out without Discord,
    each with `botSkill: "HARD"`: `skillGroup()` is null, no button named EASY, NORMAL or HARD,
    `.lobby-actions`' first element child has class `lobby-skill-line` and text
    `/^BOT SKILL\s*HARD$/`, and `.lobby-skill-level` reads `HARD`.
  - `the level shows in that one place only`: the host and a guest of `FOUR` with `bots(2)` and
    `botSkill: "HARD"`: `screen.getAllByText("HARD")` has length 1, and neither the roster's rows
    nor `statusText()` match `/easy|normal|hard/i`.
  - `a new host gets the switch, at the level chosen`: `lg(1)` as a guest of `FOUR` with
    `botSkill: "HARD"` has no group; rerendered with `usernames: FOUR.slice(1)` (lg(1) first), the
    group is there with `pressed()` `["false", "false", "true"]`.
  `App.test.tsx` (`PARAM_BOT_SKILL` imported beside `PARAM_BOTS`):
  - `the lobby shows the server's bot skill, and the host's row asks it for another`:
    `tryOpenWebSocket("A", "HBIA")`, a lobby packet of `["A", "B", "C"]` with two bots and
    `[PARAM_BOT_SKILL]: "EASY"` → EASY pressed in the group "Bot skill"; a click on HARD → the last
    message sent equals `{ command: "set-bot-skill", skill: "HARD", name: "A", lobby: "HBIA" }`.
  - `a lobby packet without a known bot skill shows NORMAL`: `lobbyPacket` (no field), then with
    `"EXPERT"`, then with `"hard"`: `.lobby-skill-level` reads `NORMAL` each time.
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/lobby src/App.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS; the build type-checks
  the browser tests too (`e2e/lobby.ts` is unchanged so far, and its host button list is Task 5's).
- [ ] **Step 5: Look at it** before committing: set `pr-shots.spec.ts`'s `PREFIX` to `"check"`, run
  Task 1's Step 3 command, and compare the four `check-*.png` with `option-a-states.png`: the
  host's row under START GAME's row and as wide as it at 1600x900, across the column at 412px, HARD
  orange; the guest's line in the same place. Fix what differs, then delete the `check-*.png`.
- [ ] **Step 6: Commit** `feat(frontend): let the host choose how well the bots play`, ticking
  Phase 26A's second box ("The host's BOT SKILL row …").

---

### Task 5: The lobby still fits every screen

**Files:**
- Modify: `frontend/e2e/lobby.ts`, `frontend/e2e/no-scroll.spec.ts`, `frontend/e2e/phone.spec.ts`,
  `docs/PLAN.md`, and `frontend/src/lobby/LobbyScreen.css` (and, only for the 320px label,
  `LobbyScreen.tsx`) if a check fails

**Interfaces:**
- Produces in `e2e/lobby.ts`:
  ```ts
  /** The level the lobby shows: the pressed button of the group "Bot skill" (the host's), or the line's `.lobby-skill-level`; "" for neither. */
  export function skillShown(page: Page): Promise<string>;
  /**
   * How many lines the host's row (its label and three buttons) or another viewer's line (its
   * label and level) takes: parts whose vertical centres are within 2px share a line. 0 for neither.
   */
  export function skillRowLines(page: Page): Promise<number>;
  ```
  `LobbyViewer` gains `skill: "NORMAL" | "HARD"`. `HOST_BUTTONS` becomes `["Fewer bots", "More bots",
  "START GAME", "EASY", "NORMAL", "HARD", ...PLAYER_BUTTONS]`; `actionLabels` itself is unchanged
  (the three are buttons with text in `.lobby-actions`), and its doc names the new buttons.
  `failedPlayInstead`: after "More bots", the host presses HARD in the group "Bot skill" and it is
  `aria-pressed="true"`; after `watchLobby`, the spectator's `.lobby-skill-level` reads `HARD` (the
  server's level, sent to a spectator who joined after the press). In `longestLineViewers`, the
  `botHost` and `failed` viewers have `skill: "HARD"`, the other five `"NORMAL"` (NORMAL, the
  longest word, is the line every other viewer is measured with).

- [ ] **Step 1: Extend the fit tests.** `no-scroll.spec.ts`'s lobby test: for each viewer,
  `expect(await skillShown(viewerPage), \`the ${viewer}'s bot skill\`).toBe(skill)`; `checkLobby`
  adds `expect(await skillRowLines(page), \`the bot skill row's lines at ${at}\`).toBe(1)`.
  `phone.spec.ts`'s "the host's, a guest's and spectators' lobbies fit": the same two checks for
  every viewer, at the phone's size and at 320x568.
- [ ] **Step 2: Run on macOS:** `E2E_PORT=4626 npm run e2e -- e2e/no-scroll.spec.ts e2e/phone.spec.ts
  --project=desktop --project=phone-360 --project=phone-412`. Expected: PASS. A fit that fails here
  is fixed (Step 4) before the Linux run.
- [ ] **Step 3: Run in Playwright's Linux image** (`DEVELOPMENT.md`, "Browser tests on Linux"): from
  the repo root, `(cd frontend && npm run build) && (cd backend && ./gradlew jar)`, then
  `TEST_SIGN_IN=true PORT=4626 java -jar backend/build/libs/secret-hitler-online.jar` in the
  background, then `E2E_PORT=4626 docker run --rm --ipc=host
  --add-host=host.docker.internal:host-gateway -e E2E_PORT -v "$PWD":/work -v
  /work/frontend/node_modules -w /work/frontend "mcr.microsoft.com/playwright:v$(node -p
  "require('./frontend/package.json').devDependencies['@playwright/test']")-noble" bash -c "npm ci
  && npx playwright test --config playwright.linux.config.ts --project=firefox --project=phone-360
  --project=phone-412 e2e/no-scroll.spec.ts e2e/phone.spec.ts"`. Expected: PASS. Stop the jar.
- [ ] **Step 4: If a check fails,** tune only the new row and line in `LobbyScreen.css` (their
  padding, gaps, the options' horizontal padding and font size, never below the 44px faces), rebuild
  and re-run Steps 2 and 3. If the host's row takes two lines at 320x568 in the Linux image, and
  only then, shorten its label: in `BotSkillSwitch` the label becomes `<span
  className="lobby-skill-bot">BOT </span>SKILL`, and the phone-only block hides
  `.lobby-skill-bot` under `(max-width: 359px)`; the Vitest label regex still matches above 360px,
  and the line keeps `BOT SKILL`. If any size of Global Constraints, "Fit", still fails for any
  viewer: **stop and ask**, with each failing viewer, size and how many px it overflows.
- [ ] **Step 5: Run the other lobby specs** on macOS: `E2E_PORT=4626 npm run e2e --
  e2e/lobby-switch.spec.ts e2e/accounts.spec.ts e2e/button-press.spec.ts e2e/sounds.spec.ts
  --project=desktop --project=phone-360`. Expected: PASS.
- [ ] **Step 6: Commit** `test(frontend): check the bot skill row fits the lobby` (with any CSS or
  label change in `fix(frontend): fit the bot skill row …` first), ticking Phase 26A's third box
  ("The lobby still fits one screen …").

---

### Task 6: Docs and the "after" screenshots

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `DEVELOPMENT.md`, `docs/PLAN.md`
- Create: `docs/pr/phase-26a-lobby-bot-skill/after-{host,guest}-{1600x900,412x915}.png`
- Delete: `frontend/e2e/pr-shots.spec.ts` (never committed)

- [ ] **Step 1: Take the "after" shots:** `PREFIX` becomes `"after"`; run Task 1's Step 3 command.
  Expected: 2 passed; the host's BOT SKILL row with HARD orange under START GAME's row, the
  guest's line `BOT SKILL HARD` in the same place. Delete the spec.
- [ ] **Step 2: `CLAUDE.md`.** Layout, backend part: after the `set-bot-count` passage, the host's
  `set-bot-skill` (`skill`, a `BotSkill`'s name, `PARAM_SKILL`; a guest's closed with 1002, a
  spectator's dropped, one in a game dropped with no OK, an unknown level closed with 1002), the
  transient `Lobby.chosenSkill` (NORMAL in a new lobby and after a restore, kept after a game, a
  restored game's bots keeping theirs), `botSkill()`, `setBotSkill` (throws in a game),
  `startNewGame`'s bots at that level, `seatedBotSkills()` for tests, and `LobbyBotSkillTest` and
  `BotSkillServerTest`; the "Every lobby packet … adds `bots`" sentence adds `botSkill`
  (`PARAM_BOT_SKILL`). Frontend part: the host's BOT SKILL row (`BotSkillSwitch`, the group "Bot
  skill", `aria-pressed`, the hold until the next packet, `.lobby-host-controls` as wide as START
  GAME's row, across the column on phones, 44px targets at every size, on with no bots, and the
  label's shortening if Task 5 made it), everyone else's line (`BotSkillLine`, first in
  `.lobby-actions`), `App`'s `botSkill` (`botSkillOf`, NORMAL for a missing or unknown one) and
  `onClickSetBotSkill`. The lobby browser tests: `HOST_BUTTONS`, viewers' `skill`, the bot host
  pressing HARD, `skillShown` and `skillRowLines`. Constraints: the protocol line adds "and the
  host's bot skill only adds `botSkill` to every lobby packet and the host's `set-bot-skill`
  command".
- [ ] **Step 3: `README.md`.** In "What this fork adds", after the bot-count bullet, a bullet on bot
  levels: under START GAME's row the host chooses EASY, NORMAL (the default) or HARD for every bot
  in the next game; Easy sometimes makes a random move, Normal plays as the bots always have (with
  their bugs fixed), Hard reads more of the game (who has been cleared, the votes, the cards and the
  odds) and its fascists bluff, and no level sees anything a person in its seat could not; everyone
  else in the lobby sees the level on a line in the same place; the choice stays for the next game.
  The intro's "the host can add more" sentence may add "and choose how well they play".
  `DEVELOPMENT.md`: the local-play sentence on the stepper adds "and BOT SKILL under it sets how
  well they play". `docs/images/` holds only the game page, so no README screenshot changes.
- [ ] **Step 4: Commit** `docs(docs): add phase 26a's after screenshots`, `docs(claude): describe
  the host's bot skill`, `docs(readme): add bot levels to what the fork adds` and
  `docs(development): mention the bot skill row for local games`, the last ticking Phase 26A's
  fourth box (docs and screenshots).

---

### Task 7: Review and the full run

- [ ] **Step 1: Review.** Run the `code-review` skill against `origin/development`, with the
  spec's "The lobby (Phase 26A)" and this plan as the spec.
- [ ] **Step 2: Fix every finding,** Minor ones included, each with a test where it changes
  behaviour, in commits of their own scope; a finding that needs no change gets its reason. Keep
  the list (finding, what was done) for the pull request. A fix in a file Global Constraints says
  never to touch: stop and ask.
- [ ] **Step 3: Run everything:** `cd backend && ./gradlew test`; `cd frontend && npm test -- --run
  && npm run build`; `E2E_PORT=4626 npm run e2e` (`desktop`, `phone-360`, `phone-412` on macOS);
  `firefox`, `phone-360` and `phone-412` in the Linux image (Task 5, Step 3, with no spec named).
  Expected: all pass; keep the counts.
- [ ] **Step 4: Commit** the last fix with Phase 26A's acceptance box "Backend and frontend unit
  tests pass, …" ticked, or `docs(plan): tick phase 26a's test box` if nothing needed fixing.

---

### Task 8: Pull request

- [ ] **Step 1: Push and open the pull request.** `git push -u origin phase-26a-lobby-bot-skill`;
  `gh pr create --repo jussaw/Secret-Hitler-Online --base development --head
  phase-26a-lobby-bot-skill --title "feat(frontend): let the host choose how well the bots play"
  --body-file <scratchpad>/pr-body.md`. The body: **Before and after** (a row each for the host and
  the guest at 1600x900 and 412x915, before left, after right, each image by
  `https://raw.githubusercontent.com/jussaw/Secret-Hitler-Online/<head sha>/docs/pr/phase-26a-lobby-bot-skill/<file>`),
  **Changes** (server, page), **Decisions** (this plan's, and the label's shortening if made),
  **Review**, **Tests** (what each new test checks, the counts, the Linux image runs), **Docs**, and
  "Part of #72" (never a closing keyword: the user closes #72 after 26B). Read it back with `gh pr
  view --json body`.
- [ ] **Step 2: Bring CI to green,** fixing on the branch until every job passes (`gh pr checks
  <n> --repo jussaw/Secret-Hitler-Online --watch --interval 30`).
- [ ] **Step 3: Wait for Phase 25B.** Its pull request (branch `phase-25b-hard-bots`) must be
  merged first. Then `git fetch origin`, `git rebase origin/development` (keep both sides in
  `CLAUDE.md`, `README.md` and `Lobby.java`, 26B's `handOverGame` included if it is in), re-run
  Task 7, Step 3, `git push --force-with-lease`, and re-pin the body's screenshot links to the new
  head (`gh pr edit <n> --repo jussaw/Secret-Hitler-Online --body-file …`). Watch CI to green again.
  If Phase 26B is in `development` by then, add `aGameStartedAtHardRecordsHard` to
  `LobbyRecordingTest` (`lobby.setBotSkill(BotSkill.HARD)` before `startNewGame()`,
  `stepCpusToTheEnd`, the record says `HARD`) in a commit of its own, as 26B's plan does when 26A is
  in first, so whichever merges second checks the level from the lobby through to the record.
- [ ] **Step 4: Merge (the manager session, once 25B has merged and CI is green: the user gave a standing OK for these five phase pull requests).** Each part is skipped when
  already done: commit `docs(plan): tick phase 26a's merge` (the "PR merged into `development`" box
  and the Progress row "done"), push and wait for green; then `gh pr merge <n> --repo
  jussaw/Secret-Hitler-Online --squash --admin --match-head-commit <head sha> --subject
  "feat(frontend): let the host choose how well the bots play (#<n>)"`; then the push's run on
  `development` publishes `:latest` (`gh run list --repo jussaw/Secret-Hitler-Online --branch
  development --limit 1`, watched to the end). The user's box (a game against Hard bots on the
  deployed build) stays open.
