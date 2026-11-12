# Phase 7: Spectators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone with the lobby code can watch a lobby and its game without a seat, hearing the public sounds, and never receiving a secret before the game ends.

**Architecture:** The server keeps spectators in a set of connections in `Lobby`, beside the players. They join with `?lobby=CODE&spectator=true` and no name. They get the state packet from a new `GameToJSONConverter.convertForSpectator`, built from an allow-list that has no roles, hands or peek until the game ends. Every command from a spectator connection except `ping` and `get-state` is dropped and logged. The client gets a WATCH button, a spectator cookie, a read-only lobby and a `GameScreen` with no prompts, whose status line names the players. A count of spectators sits at the left of the lobby and game headers.

**Tech Stack:** Java 17, Javalin 5.6.1 (Jetty 11), org.json, JUnit 4, `java.net.http` (WebSocket and HTTP clients, tests only) · React 18, TypeScript 5, Vite 8, Vitest 5, `lucide-react` 1.63.0, `js-cookie` · `@playwright/test` 1.64.1.

Parent plan: [`docs/PLAN.md`](../../PLAN.md), Phase 7. Spec: [`docs/superpowers/specs/2026-11-11-self-hosted-fork-design.md`](../specs/2026-11-11-self-hosted-fork-design.md), sections "7. Spectators", "Error handling" and "Testing".

## Global Constraints

- Spectators see public information only. Roles, party membership, hands, peek and investigation results reach them only when the game is over, as they reach everyone. Filtering happens server-side in `GameToJSONConverter`.
- Spectators may join before or during a game. They do not count toward the player limit, and every game command from them is rejected.
- State packets include a spectator count. A lobby with only spectators is inactive for the inactivity cleanup.
- A spectator who joins an unknown lobby gets the same error as a player. A dropped spectator reconnects the same way a player does, keeping the flag.
- The WebSocket protocol stays backward compatible for players: spectators only add fields (`spectatorCount`) and a query parameter (`spectator`). The player packets are otherwise unchanged.
- The desktop table, the phone layout and the narrow-window layout look the same for players, apart from the spectator count. No new art (D9 asks the user about one Lucide icon).
- Do not fix the baseline issues in `CLAUDE.md` (#4, #5, #8, #9, #10, #13) or the 30 s WebSocket idle timeout. Ask the user first if this phase has to touch their code. Anything that drives a game keeps every socket pinging (about every 10 s).
- Java 17 for Gradle and `npm run e2e` (`JAVA_HOME=$HOME/.sdkman/candidates/java/17.0.8-zulu` locally). Lockfile changes use `npx npm@11.21.1`. `npm run e2e` needs `npx playwright install chromium firefox`.
- Commits follow Conventional Commits with a scope (`backend`, `frontend`, `ci`, `plan`, `docs`, `claude`). Tick each `docs/PLAN.md` box in the same commit as its work. Nothing about the host's infrastructure goes into the repo, commit messages or PR text.

## Findings from the re-read

Measured against `./gradlew runLocal` and `npm run dev`. Scripts, probes and screenshots are in the session scratchpad.

1. **Line numbers.** `SecretHitlerServer.java`: `checkLogin` 370 (registered at 145), `removeInactiveLobbies` 194, `onWebsocketConnect` 474 (PLAN said 505), `onWebSocketMessage` 539, `resetTimeout` call 572, `onWebSocketClose` 730. `Lobby.java`: `hasTimedOut` 87, `getConnections` 97, `isFull` 168, `getUserCount` 298, `updateAllUsers` 311, `updateUser` 386, `readObject` 413. `GameToJSONConverter.convert` 61. `App.tsx`: `tryOpenWebSocket` 285, `onWebSocketMessage` 409, `sendWSCommand` 487, `onClickJoin` 556 (cookies 595-596), `onClickCreateLobby` 611 (cookies 627-628), `renderLoginPage` 646, `renderLobbyPage` 836, `onGameStateChanged` 991, `queueStatusMessage` 1692, `renderGamePage` 1704.
2. **The handshake needs a name today.** `onWebsocketConnect` closes a socket without `name` (475-480). It also fails to `return` after closing for a blank name (486-489) and goes on to add the user. That is upstream behaviour, outside this phase, and the spectator branch comes before it.
3. **The converter throws for a non-player.** `convert` calls `game.getPlayer(userName).getIdentity()` (72), and `getPlayer` throws for anyone not in the game. So the spectator conversion is its own entry point, not `convert` with a null name.
4. **Players' packets already carry other people's secrets.** In `LEGISLATIVE_PRESIDENT`, `LEGISLATIVE_CHANCELLOR` and `PRESIDENTIAL_POWER_PEEK`, `convert` puts `presidentChoices`, `chancellorChoices` and `peek` into every player's packet, not just the president's or chancellor's (118-126). Out of scope (the player protocol does not change), but spectators get none of it.
5. **Votes are public as they are cast.** `userVotes` holds every vote cast so far, with its value, in every player's packet during `CHANCELLOR_VOTING`. The client shows them only at the reveal. Votes are not on the spec's secret list, and the client needs them for the reveal and the "who has voted" bubbles, so spectators get them as players do.
6. **The investigation result is a direct reply.** `get-investigation` sends `{type: "investigation", investigation, target}` to the president's socket only (637-650). The state has only the public `investigated` flag. A spectator could only get the result by sending that command, which is rejected.
7. **Who receives what.** `Lobby.updateAllUsers` sends `updateUser` to every player connection (`userToUsername`), then sets `game = null` once a game has finished, so the victory state is sent exactly once. Spectators must be in that same send loop, before `game = null`. `updateAllUsers` also lets CPU players act, which a spectator joining or leaving must not trigger.
8. **Commands are checked against the message, not the socket.** `onWebSocketMessage` reads `lobby` and `name` from the message body (`getString` throws if one is missing) and closes the socket when `hasUser(ctx, name)` fails (566-570). So the spectator check has to come first, by connection.
9. **Timeouts.** Only player messages reset the lobby's 10-minute timeout (572); connecting does not. `removeInactiveLobbies` closes `lobby.getConnections()`, which today is the players only, so a spectator's socket would outlive its lobby.
10. **The idle drop and spectators** (probe, 45 s). A socket that only receives packets stays open: a silent socket received a lobby packet every 10 s and was still open at 45 s. A socket in a quiet lobby closed at 30.0 s (`1001 Connection Idle Timeout`). So a spectator drops only when the whole table is quiet for 30 s, which is when players drop too. Its reconnect carries no name, so baseline #10 cannot refuse it. Not changed in this phase.
11. **The client throws for a spectator in four places.** `onGameStateChanged` reads `newState.players[this.state.name].id` for the role reveal (1096) and `newState.players[name].alive` for the vote prompt (1129). `PlayerDisplay.shouldShowRole` reads `gameState.players[props.user].id`, which `TableSeats` calls for every seat, so `GameScreen` itself throws. `seatPositions` already treats an index of -1 as 0, so with no self seat, `playerOrder[0]` sits at bottom centre.
12. **Alerts wait for the server.** `queueAlert` closes most prompts on the server's next `ok` (`closeOnOK`, the default). A spectator never sends a command and never gets an `ok`, so `PolicyEnactedAlert`, `ElectionTrackerAlert` and the result prompts would each hold its queue until the spectator clicked OKAY.
13. **Refresh today.** Nothing rejoins on load: a player's refresh lands on the login page with name and lobby filled in from the cookies, and they press JOIN. Reconnects after a drop are in memory (`onWebSocketClose` calls `tryOpenWebSocket(this.state.name, this.state.lobby)`), and so is RETURN TO LOBBY (1449). Both must carry the spectator flag.
14. **Sounds.** `soundEvents` treats a user missing from `playerOrder` as an onlooker: every public sound, `investigate` from the state change (a spectator never gets the `investigation` packet), `victory` at the end, never `yourTurn` or `defeat`. A spectator's name is `""`, which is never in `playerOrder`. In the lobby, `lobbySounds` plays `playerJoined` for a new name, and a spectator adds none, so nobody hears a spectator arrive. The portrait picker opens when `icons[this.state.name]` is the default, and `icons[""]` is undefined. Each sound's cue still fires where its alert would have been, so a spectator hears `policyFascist` when the board changes.
15. **Headers** (before-shots, ten players, scripted socket). The space left of the title is 66px in the lobby and 71px in the game at 360x740, 83 and 71 at 412x915, and over 260 at every larger size. Header heights: lobby 51.8-75.6px, game 33.9-50.8px. The speaker control takes the right edge; the left edge is free.
16. **A shown prompt** is `#alert.appear-custom-alert`, and a hidden one `#alert.disappear-custom-alert`. The client never sends `get-state`.
17. **Testing the server.** Javalin's `WsContext` compares by session, and `queryParam` reads the real upgrade request, so a fake context cannot drive `onWebsocketConnect`. The server tests start a Javalin on a free port with the same three handlers and connect with Java's built-in `java.net.http.WebSocket`. `Lobby` only calls `ctx.send`, so the `Lobby` tests use a `WsConnectContext` around a `java.lang.reflect.Proxy` `Session`.

## Decisions

**D1. The spectator packet** (`GameToJSONConverter.convertForSpectator(SecretHitlerGame game): JSONObject`). It is built from the same public fields as `convert`, moved into a shared private method so the two cannot drift. Then:

| Field | Players (unchanged) | Spectators before the game ends | Spectators after |
|---|---|---|---|
| `players.<name>.id` (role) | own, plus the rules' reveals | absent | every player's |
| `players.<name>.alive`, `.investigated` | yes | yes | yes |
| `presidentChoices`, `chancellorChoices`, `peek` | in their states | absent | absent (no victory state has them) |
| `investigation` (separate packet) | president only | never | never |
| `playerOrder`, `president`, `chancellor`, `state`, `lastState`, `lastPresident`, `lastChancellor`, `targetUser`, `electionTracker`, `electionTrackerAdvanced`, `lastPolicy`, `drawSize`, `discardSize`, `fascistPolicies`, `liberalPolicies`, `userVotes`, `vetoOccurred` | yes | yes | yes |

"The game ends" is `game.hasGameFinished()`. A finished game's spectator packet equals a player's packet for the same game.

**D2. The handshake.** `/game?lobby=CODE&spectator=true` makes a spectator, whether or not a `name` is given; a name is ignored. Without `lobby` the socket closes with `PROTOCOL` and "Must have the 'lobby' parameter." An unknown lobby closes with exactly the player's code and reason: `PROTOCOL` and "The lobby 'CODE' does not exist.". Otherwise the connection is added to the lobby's spectators, mapped in `userToLobby`, sent its packet, and every other connection gets a fresh packet with the new count (`Lobby.sendStateToAll`, which does not let CPU players act). Closing removes it the same way, again without a CPU step. Spectators are not persisted (`hasLobbyChanged` untouched).

**D3. Identity.** In the lobby, a spectator is its connection, in `Lobby.spectators`; it has no name, seat or icon. In the logs it is `spectator <session id>` (Javalin's `ctx.getSessionId()`), on connect, disconnect and rejection, at `info`, `info` and `warn`. In `/check-login` it is `spectator=true` with `lobby` and no `name`: 400 "Lobby must be specified." without a lobby, 404 "No such lobby found." for an unknown one (the player's 404), and 200 "Spectator login valid." otherwise, even when the lobby is full or in a game.

**D4. A rejected command** is logged at `warn` (`Rejected '<command>' from spectator <id> in lobby <code>.`) and dropped. No reply, no `ok`, no state change, no timeout reset, and the socket stays open. Closing would start the client's reconnect loop, and a reply would need a packet type no client reads. `ping` answers `pong`. `get-state` sends the spectator packet. Spectator messages are handled before the player path reads `name` or `lobby`, so a body naming a player changes nothing.

**D5. The lobby.** Spectators are kept out of `activeUsernames`, `usersInGame` and `usernameToIcon`, so `getUserCount`, `isFull`, `getUserNames`, the start of a game and the lobby's `usernames` never include them. Activity comes from players only. `Lobby.recordActivity(ctx)` resets the timeout only for a player connection, and it replaces the server's `resetTimeout()` call at 572. A lobby left with only spectators therefore times out 10 minutes after the last player message, and `removeInactiveLobbies` closes the spectators with "The lobby has timed out." (`getConnections` now returns both kinds). Every packet, lobby or game, player or spectator, carries `spectatorCount` (an integer, 0 when nobody watches), added in `Lobby` next to `type` and `icon`. So PLAN's "add `spectatorCount`" box moves from Task 7.1 to 7.2.

**D6. The client's spectator mode.** `App` state gains `spectator: boolean` and `spectatorCount: number`. A spectator's `name` is `""`.
- Login: a WATCH button beside JOIN, enabled once the lobby field holds four characters, with no name needed. It checks `/check-login?lobby=CODE&spectator=true` and shows JOIN's messages: 404 "The lobby could not be found.", any other failure "There was an error connecting to the server. Please try again.", and a network error "There was an error contacting the server. Please wait and try again.". Then it opens `?lobby=CODE&spectator=true`.
- `tryOpenWebSocket(name, lobby, spectator)` builds the spectator URL without `name`. The reconnect in `onWebSocketClose` and RETURN TO LOBBY pass `this.state.spectator`.
- `sendWSCommand` sends only `ping` and `get-state` for a spectator.
- Lobby page: the spectator sees the code, the invite link, the player list and LEAVE LOBBY. CHANGE ICON, START GAME and the VIP line are replaced by one line: "You are watching. The game starts when the VIP starts it." The portrait picker never opens.

**D7. The cookie and a refresh** (asks the user, see the end). A spectator cookie, `spectator=true`, is a session cookie like `lobby`. WATCH sets `lobby` and `spectator` and leaves `name` alone. JOIN and CREATE LOBBY remove `spectator`, and so does LEAVE LOBBY when watching. On load (`componentDidMount`), if `spectator` and `lobby` are set and the URL names no other lobby, App runs WATCH's steps for that lobby. A refresh therefore goes straight back to watching. On a 404 it stays on the login page with the lobby filled in and the error shown, and drops the cookie. Cost: the page loads with no gesture, so sound stays off until the first click, tap or key (Phase 6's unlock rule).

**D8. No prompts; a status line that describes the table.** For a spectator, `onGameStateChanged` queues no `queueAlert` before the game ends: no role reveal, no action prompt and no informational alert (Finding 12). Each alert a player would see becomes a status line held for `SPECTATOR_RESULT_MS = 3000`, and each waiting line names the players. The texts come from `frontend/src/spectator/spectatorStatus.ts`:

```ts
export function waitingText(game: GameState): string; // what the table waits for, by state
export function policyText(game: GameState): string;  // replaces PolicyEnactedAlert
export function trackerText(game: GameState): string; // replaces ElectionTrackerAlert
export function resultText(game: GameState): string;  // replaces the POST_LEGISLATIVE and execution result prompts; "" when there is none
```

| State or event | Text (P president, C chancellor, T `targetUser`) |
|---|---|
| `CHANCELLOR_NOMINATION` | Waiting for P to nominate a chancellor. |
| `CHANCELLOR_VOTING` | P nominated C. Waiting for all players to vote. |
| `LEGISLATIVE_PRESIDENT` | Waiting for P to choose a policy to discard. |
| `LEGISLATIVE_CHANCELLOR` | Waiting for C to choose a policy to enact. |
| `LEGISLATIVE_PRESIDENT_VETO` | C has motioned to veto. Waiting for P to decide. |
| `PRESIDENTIAL_POWER_PEEK` | Peek: P is previewing the next 3 policies. |
| `PRESIDENTIAL_POWER_INVESTIGATE` | Investigation: P is choosing a player to investigate. |
| `PRESIDENTIAL_POWER_ELECTION` | Special Election: P is choosing the next president. |
| `PRESIDENTIAL_POWER_EXECUTION` | Execution: P is choosing a player to execute. |
| `POST_LEGISLATIVE` | Waiting for P to end their term. |
| `SETUP` | empty |
| a victory state | the victory prompt's own message, for example "Fascists successfully passed six policies!" |
| policy enacted | A liberal policy was enacted. / A fascist policy was enacted. |
| tracker 1 or 2 | The election tracker moves to N. |
| tracker reset by a third failure | The election tracker reached 3. The top policy is enacted. |
| after an investigation | P investigated T. |
| after a special election | P chose T to be the next president. |
| after an execution | P executed T. |

With twelve-character names every line is at most 81 characters, the length of the longest status a player sees, which the no-scroll test wraps. The vote reveal is unchanged: it is the table, not a prompt.

**D9. The game end** (asks the user). At a victory state a spectator gets the same victory screen as a player, with every role and RETURN TO LOBBY, which reopens the socket as a spectator. It is the end-of-game reveal that the spec gives everyone. Before that, `#alert` never opens for a spectator.

**D10. `GameScreen` for spectators.** `GameScreenProps` gains `spectator?: boolean` and `spectatorCount: number`. END TERM keeps its box but gets `visibility: hidden` for a spectator, so the centre lays out exactly as a player's does and the hidden button is not a touch target. `PlayerDisplay.shouldShowRole` reads `players[props.user]?.id`. A spectator's seats come from `seatPositions(count, -1)`, with `playerOrder[0]` at bottom centre and no highlighted tile, and roles show only in a victory state.

**D11. The spectator count** (asks the user about the icon). New `frontend/src/spectator/SpectatorCount.tsx`: `export default function SpectatorCount(props: { count: number }): JSX.Element | null`. It renders nothing at 0, otherwise:

```html
<div class="spectator-count" role="status" aria-label="2 spectators watching" title="2 watching">
  <svg class="lucide lucide-eye" aria-hidden="true">…</svg><span>2</span>
</div>
```

The label is "1 spectator watching" for one. It sits in the lobby and game headers, absolutely positioned at the header's left (`left: max(8px, 1vw)`, top to bottom, centred), mirroring the speaker on the right, so the title stays centred and no layout moves. The icon is `0.8em` and the number `0.7em` of the header's font. At 360x740 it ends by about x 52 with a two-digit count, inside the 66px the title leaves (Finding 15). It is text, not a control, so the 44px target rule does not apply. The login page has none.

**D12. Tests.**
- Backend: `SpectatorStateTest` (Task 1) plays whole games through a test `GameDriver` and scans every spectator packet. `LobbySpectatorTest` (Task 2) uses `FakeSocket`. `SpectatorServerTest` (Task 3) runs real sockets against a Javalin on a free port.
- Frontend unit: `spectatorStatus.test.ts`, `SpectatorCount.test.tsx`, plus spectator cases in `PlayerDisplay.test.tsx`, `GameScreen.test.tsx` and `soundEvents.test.ts`.
- Browser, new `e2e/spectator.spec.ts`. Its scripted test runs in `desktop`, and its real-game test in `desktop` against the jar, with every player a raw socket from the new `e2e/driveGame.ts`. The header-fit test runs in all four projects. `no-scroll.spec.ts` and `phone.spec.ts` gain a spectator's view of ten players, and their player games get one raw spectator, so the player views carry the count. `firefox`'s `testMatch` adds `spectator`.

**D13. Acceptance drive** (scratchpad, never the repo). Seven raw-socket players (`e2e/driveGame.ts`) play one full game against `runLocal` and `npm run dev`. A Chromium spectator page at 1920x1080 joins through WATCH after the first policy, and reloads after the third. Each action waits until the spectator's status line shows `waitingText` for the current state, so every animation plays. The page records every frame its sockets receive, every `sound-play` event with its screen context, and every `#alert` opening. The user gets: the frame scan (frames per state, and no `id`, `presidentChoices`, `chancellorChoices`, `peek`, `investigation` or `"HITLER"` before the victory frame), screenshots of the table and status at each state, the sounds by event, the alert log (only the victory screen), and the reload result (the new socket has `spectator=true`, no `name`, and the page is back on the game).

**D13a. Screenshots.** Before (taken while planning; a spectator view did not exist yet): `shots/before-player-{lobby,game}-{360x740,412x915,1920x1080,1280x720,960x1080}.png` from the scripted socket with ten players, and header boxes in `before-player-headers-*.json`. After: the same as a player with no spectators (0 px may differ), as a player watched by two spectators (only the count's box may differ), and as a spectator.

**D14. Out of scope.** Hiding the hands from other players' packets (Finding 4). Hiding votes before the reveal (Finding 5). The missing `return` in `onWebsocketConnect` (Finding 2). The idle timeout (Finding 10) and the baseline issues. Spectator names, chat, or a spectator becoming a player mid-game.

## Review Focus

1. **A secret must not reach a spectator by any path other than the state packet:** a command's reply (`investigation`, `ok`), `get-state`, the last packet before `game = null`, or a refresh mid-game. Tests: Task 3 "every command but ping and get-state is dropped" (no packet but `pong` and the spectator packet ever arrives), Task 4's real-game frame scan, which includes a reload.
2. **A spectator connection must not act as a player, whatever its message says.** A body with a living player's `name` and `register-vote` must change no votes and get no `ok`. Task 3 test.
3. **Players' packets must not change** apart from `spectatorCount`. Task 1 characterization test `playerPacketsAreUnchanged`, run before and after the refactor, and Task 2 `playersGetTheSameKeysPlusTheCount`.
4. **Every way back to a socket keeps the spectator a spectator:** a refresh, a dropped socket, RETURN TO LOBBY, a timed-out lobby. It must never become a nameless player join, which the server closes. Tests: Task 4 browser tests (reload, RETURN TO LOBBY opens `spectator=true`), Task 3 "a timed-out lobby closes its spectators".
5. **The count must fit every header** at two digits, at 360px, and with Firefox's rounding, and must not move the title or the speaker. Task 5 browser test "the spectator count fits every header" with counts 1 and 12.

## File map

| File | Change | Task |
|---|---|---|
| `backend/src/main/java/server/util/GameToJSONConverter.java` | shared public fields; `convertForSpectator` | 1 |
| `backend/src/test/java/server/SpectatorStateTest.java`, `GameDriver.java`, `Secrets.java` | new | 1 |
| `backend/src/main/java/server/util/Lobby.java` | spectator set and methods, `sendStateToAll`, `recordActivity`, `spectatorCount`, `getConnections`, `readObject` | 2 |
| `backend/src/test/java/server/util/LobbySpectatorTest.java`, `FakeSocket.java` | new | 2 |
| `backend/src/main/java/server/SecretHitlerServer.java` | `PARAM_SPECTATOR`, `PARAM_SPECTATOR_COUNT`; spectator connect, message, close; `checkLogin`; `recordActivity`; package-private handlers, `codeToLobby`, `removeInactiveLobbies` | 2 (constants), 3 |
| `backend/src/test/java/server/SpectatorServerTest.java`, `TestSocket.java` | new | 3 |
| `frontend/src/spectator/spectatorStatus.ts`, `.test.ts` | new (D8) | 4 |
| `frontend/src/App.tsx` | spectator mode (D6-D9) | 4, 5 |
| `frontend/src/player/PlayerDisplay.tsx`, `.test.tsx`; `frontend/src/game/GameScreen.tsx`, `.test.tsx`; `frontend/src/types/lobby_state.ts`; `frontend/src/constants/index.ts`; `frontend/src/sound/soundEvents.test.ts` | D10, `spectatorCount`, `PARAM_SPECTATOR`, onlooker cases | 4 |
| `frontend/e2e/driveGame.ts`, `frontend/e2e/secrets.ts`, `frontend/e2e/spectator.spec.ts` | new | 4, 5 |
| `frontend/e2e/soundLog.ts`, `frontend/e2e/sounds.spec.ts` | `recordSounds` and `soundLog` move to `soundLog.ts`, shared by both specs | 4 |
| `frontend/e2e/fakeGame.ts`, `frontend/e2e/lobby.ts` | `openFakeWatch`, `spectatorPacket`; `joinSpectator`, `watchLobby`, `startGame` option | 4, 5 |
| `frontend/src/spectator/SpectatorCount.tsx`, `.css`, `.test.tsx` | new (D11) | 5 |
| `frontend/e2e/no-scroll.spec.ts`, `phone.spec.ts`, `frontend/playwright.config.ts` | spectator views; `firefox` matches `spectator` | 5 |
| `CLAUDE.md` | handshake, filtering rule, `src/spectator/`, `spectator.spec.ts` | 5 |
| `docs/PLAN.md` | ticks; Phase 7 wording follows this breakdown | 1-5 |

---

### Task 1 (PLAN 7.1): Spectator state filtering

**Files:**
- Modify: `backend/src/main/java/server/util/GameToJSONConverter.java:61-129`
- Create: `backend/src/test/java/server/SpectatorStateTest.java`, `backend/src/test/java/server/GameDriver.java`, `backend/src/test/java/server/Secrets.java`

**Interfaces:**
- Produces: `public static JSONObject GameToJSONConverter.convertForSpectator(SecretHitlerGame game)`. Test helpers, public in test package `server`: `GameDriver.play(int players, Consumer<SecretHitlerGame> onStep): SecretHitlerGame`, which returns the finished game, and `Secrets.find(Object json): List<String>`, which returns the paths of every secret it finds. Tasks 2 and 3 use both helpers.

- [ ] **Step 1: Test helpers.** `Secrets.find` walks a `JSONObject` or `JSONArray` at every depth. It reports each key in `{"id", "presidentChoices", "chancellorChoices", "peek", "investigation"}` and each string value `"HITLER"`, as paths like `players.Ann.id`. `GameDriver.play` builds `new SecretHitlerGame(names)` with names `"P0"`.. and calls `onStep` after construction and after every action until `hasGameFinished()`, giving up after 500 actions. Its moves:
  - nomination: the first living player after the president who is not term-limited (`lastChancellor`, and `lastPresident` while more than 5 live) and, with 3 or more fascist policies, not Hitler;
  - voting: every living player votes, NEIN in the first election, JA after;
  - president: discard the first liberal, else index 0;
  - chancellor: with 5 fascist policies and no veto yet this term, `chancellorVeto()`; otherwise enact the first fascist, else index 0;
  - veto prompt: `presidentialVeto(true)`;
  - powers: `endPeek()`; investigate, then elect, the first living player who is not the president (investigate skips the investigated); execute the first living non-president who is not Hitler;
  - `POST_LEGISLATIVE`: `endPresidentialTerm()`.

- [ ] **Step 2: Write the tests** in `SpectatorStateTest`:
  - `playerPacketsAreUnchanged` (characterization): one `GameDriver.play(10, …)`. At every step and for every player, `convert(game, name)` has `id` on that player. In `LEGISLATIVE_PRESIDENT` it has `presidentChoices` for every player (and `chancellorChoices` and `peek` in theirs). Its key set is the public keys of D1 plus those three where they apply, and nothing else.
  - `spectatorPacketsHoldNoSecretBeforeTheGameEnds`: play 10-player and 5-player games, repeating up to 20 games each until the steps seen cover every state of `GameState` but `SETUP` and the victory states (the peek comes from the 5-player games). At every step before `hasGameFinished()`, `Secrets.find(convertForSpectator(game))` is empty. In the same step, the president's `convert` holds `presidentChoices` or `chancellorChoices` or `peek` whenever the state has them, which proves the scan looks for the right keys.
  - `spectatorsSeeEveryRoleWhenTheGameEnds`: for the finished game, `convertForSpectator(game).similar(convert(game, anyPlayerName))` is true and every `players.<name>` has `id`.
  - `spectatorPacketKeepsEveryPublicField`: at every step before the end, `convertForSpectator(game)` is similar to `convert(game, liberal)` (some liberal player) with `presidentChoices`, `chancellorChoices`, `peek` and every `players.<name>.id` removed.

- [ ] **Step 3: Run them to verify they fail.** `cd backend && JAVA_HOME=<Java 17> ./gradlew test --tests 'server.SpectatorStateTest'`. Expected: compilation fails, because `convertForSpectator` is undefined. With the three spectator tests commented out, `playerPacketsAreUnchanged` passes (it pins today's output).

- [ ] **Step 4: Implement D1.** Move the public fields into `private static JSONObject publicState(SecretHitlerGame game, Predicate<Player> showRole)`. `convert` calls it with today's role rule (the `showAllRoles` logic and the own-role rule), then adds the three hand fields as today. `convertForSpectator` calls it with `p -> game.hasGameFinished()` and adds nothing.

- [ ] **Step 5: Run the backend tests.** `cd backend && JAVA_HOME=<Java 17> ./gradlew test`. Expected: all pass, `playerPacketsAreUnchanged` included.

- [ ] **Step 6: Commit.** Ticks "Begin Task 7.1" and Task 7.1's first two boxes. The `spectatorCount` box moves to Task 7.2 (D5).

```bash
git add backend/src docs/PLAN.md
git commit -m "feat(backend): filter secrets from a spectator's game state"
```

### Task 2 (PLAN 7.2): Lobby spectators

**Files:**
- Modify: `backend/src/main/java/server/util/Lobby.java` (fields 32-35, `getConnections` 97, `updateAllUsers` 311, `updateUser` 386, `readObject` 413), `backend/src/main/java/server/SecretHitlerServer.java` (constants, 43-54)
- Create: `backend/src/test/java/server/util/LobbySpectatorTest.java`, `backend/src/test/java/server/util/FakeSocket.java`

**Interfaces:**
- Consumes: `convertForSpectator`, `Secrets.find` (Task 1).
- Produces, on `Lobby`, all `synchronized public`: `void addSpectator(WsContext ctx)` (throws `IllegalArgumentException` for a connection that is already a player or spectator), `void removeSpectator(WsContext ctx)` (throws if it is not a spectator), `boolean isSpectator(WsContext ctx)`, `int getSpectatorCount()`, `void updateSpectator(WsContext ctx)`, `void sendStateToAll()` (every player and spectator gets a packet; no CPU step), `void recordActivity(WsContext ctx)` (resets the timeout only for a player). `getConnections()` returns players and spectators. On `SecretHitlerServer`: `PARAM_SPECTATOR = "spectator"` and `PARAM_SPECTATOR_COUNT = "spectatorCount"`. In test package `server.util`: `FakeSocket.open(): FakeSocket` with fields `WsContext ctx` and `List<String> sent`, and `JSONObject last()`.

- [ ] **Step 1: `FakeSocket`.** A `WsConnectContext(UUID, session)`, where `session` is a `Proxy` for `org.eclipse.jetty.websocket.api.Session`. Its `getRemote()` returns a `Proxy` `RemoteEndpoint` whose `sendString` appends to `sent`. `equals` and `hashCode` are by identity, `isOpen` is true, and anything else returns null, false or 0.

- [ ] **Step 2: Write the tests** in `LobbySpectatorTest` (players are `FakeSocket`s added with `addUser`, with icons set with `trySetUserIcon("p<i>", ctx)` when a game starts):
  - `aSpectatorTakesNoSeat`: three players and two spectators give `getUserCount()` 3, `getSpectatorCount()` 2, `isFull()` false and `getUserNames()` of the three. Ten players and a spectator give `isFull()` true and `getUserCount()` 10.
  - `spectatorsGetEveryUpdate`: two players and one spectator. After `updateAllUsers()`, the spectator's last packet is `{type: "lobby", usernames: [the two], icon: {...}, spectatorCount: 1}`, and each player's has `spectatorCount` 1.
  - `spectatorsGetTheSpectatorPacketDuringAGame`: five players, icons set, `startNewGame()`, a spectator, `updateAllUsers()`. The spectator's last packet has `type` `game` and `spectatorCount` 1, and `Secrets.find` on it is empty. Each player's has `id` on that player.
  - `playersGetTheSameKeysPlusTheCount`: in the same game, a player's packet has exactly `convert(game, name)`'s keys plus `type`, `icon` and `spectatorCount`.
  - `aSpectatorOnlyLobbyIsInactive`: with `LOBBY_TIMEOUT_DURATION_IN_MIN` set to 0 while the lobby is built (restored to 10 in `finally`): add a player and a spectator, `removeUser` the player, `recordActivity(spectator)`, and `hasTimedOut()` is true. Then a new player's `recordActivity` makes it false.
  - `connectionsIncludeSpectators`: `getConnections()` holds both kinds; after `removeSpectator`, `isSpectator` is false and the count drops.
  - `addSpectatorRejectsAPlayerOrASecondAdd`: both throw `IllegalArgumentException`.
  - `spectatorsAreNotBackedUp`: serialize and deserialize a lobby with a spectator (`ObjectOutputStream`). The copy has `getSpectatorCount()` 0, and `addSpectator` on it works.

- [ ] **Step 3: Run them to verify they fail.** `cd backend && JAVA_HOME=<Java 17> ./gradlew test --tests 'server.util.LobbySpectatorTest'`. Expected: compilation fails on the missing methods.

- [ ] **Step 4: Implement D5.** `transient private Set<WsContext> spectators = ConcurrentHashMap.newKeySet()`, re-created in `readObject`. `updateAllUsers` starts with `sendStateToAll()` in place of its player loop, so spectators get the victory packet before `game = null`. Packets put `PARAM_SPECTATOR_COUNT` beside `icon` in both `updateUser` and `updateSpectator`. `updateSpectator` sends `convertForSpectator(game)` with type `game` during a game, otherwise the lobby packet.

- [ ] **Step 5: Run the backend tests.** `cd backend && JAVA_HOME=<Java 17> ./gradlew test`. Expected: all pass.

- [ ] **Step 6: Commit.** Ticks Task 7.2's two boxes and the moved `spectatorCount` box.

```bash
git add backend/src docs/PLAN.md
git commit -m "feat(backend): track spectators in a lobby"
```

### Task 3 (PLAN 7.3): Server handshake and command rejection

**Files:**
- Modify: `backend/src/main/java/server/SecretHitlerServer.java` (`codeToLobby` 86, `removeInactiveLobbies` 194, `checkLogin` 370, `onWebsocketConnect` 474, `onWebSocketMessage` 539 and 572, `onWebSocketClose` 730)
- Create: `backend/src/test/java/server/SpectatorServerTest.java`, `backend/src/test/java/server/TestSocket.java`

**Interfaces:**
- Consumes: Task 2's `Lobby` methods and constants.
- Produces: `/game?lobby=CODE&spectator=true` (D2, D4) and `/check-login?lobby=CODE&spectator=true` (D3), used by Task 4. Package-private for tests: `codeToLobby`, `onWebsocketConnect`, `onWebSocketMessage`, `onWebSocketClose`, `removeInactiveLobbies`. In test package `server`: `TestSocket.connect(int port, String query): TestSocket`, `send(JSONObject)`, `JSONObject next(String type)` (waits up to 5 s for a packet of that type and fails otherwise), `List<JSONObject> received()`, and `CloseInfo awaitClose()` (`int code`, `String reason`; waits up to 5 s).

- [ ] **Step 1: Write the tests.** `SpectatorServerTest` starts `Javalin.create()` with `ws("/game", …)` using the three handlers and `get("/check-login", SecretHitlerServer::checkLogin)` on port 0 (`@BeforeClass`, stopped in `@AfterClass`). Each test registers its own lobby code in `codeToLobby` and removes it after. `TestSocket` wraps `HttpClient.newHttpClient().newWebSocketBuilder()`: it joins partial text frames, queues each packet, records the close code and reason, and requests one message at a time. Tests:
  - `aSpectatorConnectsWithoutAName`: `?lobby=SPEC&spectator=true` gets a lobby packet with `usernames` `[]` and `spectatorCount` 1.
  - `anUnknownLobbyGivesSpectatorsThePlayersError`: `?lobby=NONE&name=Ann` and `?lobby=NONE&spectator=true` both close with 1002 and "The lobby 'NONE' does not exist.".
  - `checkLoginAcceptsSpectators`: `spectator=true` gets 200 for an open lobby, 404 "No such lobby found." for `NONE` (as `name=Ann` does), 400 without `lobby`, 200 for a full lobby (a player gets 489) and 200 during a game (a new player gets 488).
  - `playersSeeTheCount`: a player gets `spectatorCount` 1 when a spectator connects, and 0 after it closes.
  - `everyCommandButPingAndGetStateIsDropped`: five players `Ann`..`Eve` connect, pick `p1`..`p5`, and `Ann` sends `start-game`. A spectator connects, the president nominates the next player, and every player sees `CHANCELLOR_VOTING`. The spectator sends `register-vote` (with `name` set to a living player, and once with no `name`), then every other command in `SecretHitlerServer`'s `COMMAND_*` list with plausible parameters. After each it sends `ping` and waits for `pong`. Then: `codeToLobby.get(code).game().getVotes()` is empty and the state is still `CHANCELLOR_VOTING`. The spectator received no `ok` and no `investigation`, and the socket is open. `get-state` returns a `game` packet with `Secrets.find` empty.
  - `spectatorsDoNotKeepALobbyAlive`: a lobby built with a 0-minute timeout. A spectator connects and pings, and `hasTimedOut()` stays true. `removeInactiveLobbies()` then closes the spectator's socket with "The lobby has timed out.".

- [ ] **Step 2: Run them to verify they fail.** `cd backend && JAVA_HOME=<Java 17> ./gradlew test --tests 'server.SpectatorServerTest'`. Expected: compilation fails on the private handlers, then (once they are package-private) the spectator tests fail, because a nameless socket is closed with "Must have the 'lobby' and 'name' parameters.".

- [ ] **Step 3: Implement D2-D4.** `onWebsocketConnect` begins `if ("true".equals(ctx.queryParam(PARAM_SPECTATOR))) { connectSpectator(ctx); return; }`; everything after it is unchanged. `onWebSocketMessage` begins by looking up `userToLobby.get(ctx)`, and for a spectator calls `onSpectatorMessage(ctx, lobby)` and returns, before any parsing. That method parses with `optString`, so a malformed body counts as a rejected command. Line 572 becomes `lobby.recordActivity(ctx)`. `onWebSocketClose` removes a spectator with `removeSpectator` and `sendStateToAll`. `checkLogin` handles `spectator=true` first.

- [ ] **Step 4: Run the backend tests.** `cd backend && JAVA_HOME=<Java 17> ./gradlew test`. Expected: all pass, `DatabaseBackupTest` included.

- [ ] **Step 5: Commit.** Ticks Task 7.3's four boxes and the acceptance box "Backend tests pass".

```bash
git add backend/src docs/PLAN.md
git commit -m "feat(backend): let spectators watch a lobby without a seat"
```

### Task 4 (PLAN 7.4, part 1): Watching from the client

**Files:**
- Create: `frontend/src/spectator/spectatorStatus.ts`, `.test.ts`; `frontend/e2e/driveGame.ts`; `frontend/e2e/secrets.ts`; `frontend/e2e/soundLog.ts` (`recordSounds` and `soundLog`, moved from `sounds.spec.ts`); `frontend/e2e/spectator.spec.ts`
- Modify: `frontend/src/App.tsx` (D6-D9), `frontend/src/player/PlayerDisplay.tsx` and `.test.tsx`, `frontend/src/game/GameScreen.tsx` and `.test.tsx`, `frontend/src/types/lobby_state.ts` (`spectatorCount?: number`), `frontend/src/constants/index.ts` (`PARAM_SPECTATOR`), `frontend/src/sound/soundEvents.test.ts`, `frontend/e2e/fakeGame.ts`, `frontend/e2e/lobby.ts`

**Interfaces:**
- Consumes: Task 3's protocol.
- Produces: the four functions of D8; `GameScreenProps.spectator?: boolean` and `spectatorCount: number` (Task 5 renders the count). In `e2e/fakeGame.ts`: `openFakeWatch(page): Promise<FakeGame>` (routes `/check-login` and the socket, then WATCHes lobby `FAKE`) and `spectatorPacket(overrides, dead?)` (a `gamePacket` with no roles). In `e2e/lobby.ts`: `joinSpectator(baseURL, lobby): Promise<WebSocket>` (a raw spectator socket that pings every 10 s) and `watchLobby(page, lobby)` (WATCH from the login form). In `e2e/driveGame.ts`: `openTable(baseURL, players): Promise<Table>`, where `Table` is `{ lobby: string; close(): void }`, plus `play(table, opts: { until?: (g: GameState) => boolean; pace?: (g: GameState) => Promise<void> }): Promise<GameState>`. `openTable` seats "Long Guest 1".. as raw sockets with portraits and starts the game. `play` makes GameDriver's moves (Task 1) and resolves with the state where `until` held, or the victory state. In `e2e/secrets.ts`: `findSecrets(json: unknown): string[]`, the TS twin of `Secrets.find`.

- [ ] **Step 1: Write the failing unit tests.**
  - `spectatorStatus.test.ts`: one case per row of D8 with players "Long Guest 1".."Long Guest 9" (P = 1, C = 2, T = 5), expecting the exact text. `resultText` is `""` for a `POST_LEGISLATIVE` after a plain policy or a peek. Every text with these names is at most 81 characters.
  - `PlayerDisplay.test.tsx`: with `user` `""`, tiles render without throwing, none is highlighted, and roles in the state are hidden until a victory state, where every role shows.
  - `GameScreen.test.tsx`: with `spectator` and `user` `""`, it renders ten seats, and END TERM has `visibility: hidden` even when `state` is `POST_LEGISLATIVE`.
  - `soundEvents.test.ts`: with user `""`, the investigation result gives `["investigate"]`, the president's END TERM state gives no `yourTurn`, and a fascist victory gives `victory`. These pin behaviour that already holds (Finding 14), so they pass at once.

- [ ] **Step 2: Write the failing browser tests** in `e2e/spectator.spec.ts`:
  - `a spectator gets the player's error for an unknown lobby` (desktop): WATCH with `ZZZZ` shows "The lobby could not be found.", as JOIN with a name does.
  - `a spectator watches a scripted game without prompts` (desktop): `recordSounds` (from `sounds.spec.ts`, moved to `e2e/soundLog.ts` so both specs share it), an init script that logs every `#alert` change to `appear-custom-alert`, then `openFakeWatch`. Then:
    1. Lobby packet of TEN with `spectatorCount` 1: no CHANGE ICON or START GAME button, the text "You are watching. The game starts when the VIP starts it.", a LEAVE LOBBY button, and no portrait picker.
    2. Spectator packets, each sent once the previous step's status line shows (for the single vote, once its `voteCast` is recorded): nomination (president `TEN[1]`), voting (chancellor `TEN[2]`), one vote, the passing vote, `LEGISLATIVE_PRESIDENT`, `LEGISLATIVE_CHANCELLOR`, `PRESIDENTIAL_POWER_INVESTIGATE` with one fascist policy, `POST_LEGISLATIVE` after the investigation of `TEN[5]`, then `FASCIST_VICTORY_POLICY` with every role. At each step the status text becomes D8's line.
    3. The alert log is empty until the victory screen. The sounds by name are `gameStart, nominate, voteCast, voteCast, votePassed, cardDraw, cardDiscard, policyFascist, power, investigate, policyFascist, victory`, with no `yourTurn` or `defeat`.
    4. RETURN TO LOBBY opens a socket whose URL has `spectator=true` and no `name`.
  - `a spectator joins a running game and never receives a secret` (desktop, real jar): `openTable(baseURL, 7)`, then `play` until the first policy. A new page records every frame received on `/game` sockets (`page.on("websocket")`), and `watchLobby` joins. `play` runs until the next policy, then the page reloads and `.game-screen` shows again. `play` runs to the end. `findSecrets` is `[]` for every frame before the first one in a victory state. The victory frame has `id` for all seven players. Every socket the page opened has `spectator=true` and no `name`, and `#alert` never had `appear-custom-alert` before the victory frame arrived.

- [ ] **Step 3: Run them to verify they fail.** `cd frontend && npm test -- --run src/spectator src/player src/game` (FAIL: `./spectatorStatus` unresolved; PlayerDisplay throws for `""`), then `JAVA_HOME=<Java 17> npm run e2e -- --project=desktop e2e/spectator.spec.ts` (FAIL: no WATCH button).

- [ ] **Step 4: Implement D6-D10** in `App.tsx`, `PlayerDisplay.tsx` and `GameScreen.tsx`. In `onGameStateChanged`, set `isPresident` and `isChancellor` to false for a spectator. Guard the role reveal and the vote prompt with `!spectator`. Replace each `queueAlert` before the victory with `queueStatusMessage(text, SPECTATOR_RESULT_MS)` (a new optional hold on the existing method), and each `queueStatusMessage` with the D8 line. Sound cues stay exactly where they are. The victory screen is unchanged apart from RETURN TO LOBBY passing `this.state.spectator`.

- [ ] **Step 5: Run everything.** `cd frontend && npm test -- --run && npm run build && JAVA_HOME=<Java 17> npm run e2e`. Expected: every project passes, the new tests included.

- [ ] **Step 6: Commit.** Ticks Task 7.4's boxes for WATCH, the cookie, the read-only lobby and `GameScreen`, and the sounds, plus the acceptance boxes "e2e: a spectator joins a running game…" (frames) and "A spectator joining mid-game and refreshing stays a spectator".

```bash
git add frontend docs/PLAN.md
git commit -m "feat(frontend): watch a lobby as a spectator"
```

### Task 5 (PLAN 7.4, part 2): The spectator count, layouts, docs and acceptance

**Files:**
- Create: `frontend/src/spectator/SpectatorCount.tsx`, `SpectatorCount.css`, `SpectatorCount.test.tsx`
- Modify: `frontend/src/App.tsx` (lobby header), `frontend/src/game/GameScreen.tsx` (game header), `frontend/e2e/spectator.spec.ts`, `frontend/e2e/no-scroll.spec.ts`, `frontend/e2e/phone.spec.ts`, `frontend/e2e/lobby.ts` (`startGame(page, baseURL, players, { spectators = 1 })`), `frontend/playwright.config.ts`, `CLAUDE.md`, `docs/PLAN.md`

**Interfaces:**
- Consumes: `GameScreenProps.spectatorCount`, `joinSpectator`, `watchLobby`, `openFakeWatch` (Task 4); `DESKTOP_SIZES`, `NARROW_WINDOWS`, `overflowX`, `smallTargets`, `pageHeight` (`e2e/layout.ts`).
- Produces: `SpectatorCount` (D11).

- [ ] **Step 1: Write the failing tests.**
  - `SpectatorCount.test.tsx`: nothing renders at 0. At 1 there is a status "1 spectator watching" showing "1" and a `.lucide-eye` icon. At 12 the label is "12 spectators watching".
  - `spectator.spec.ts`, `the spectator count fits every header` (all four projects; desktop and Firefox loop over `DESKTOP_SIZES` and `NARROW_WINDOWS`, phones use their own size). On the scripted lobby and game, with `spectatorCount` 1 and then 12: the count's box lies inside the header, does not overlap the title's text range or `.sound-control`, and the header's height equals its height with `.spectator-count { display: none }`.
  - `no-scroll.spec.ts`: `startGame` joins one raw spectator by default, so every player test runs with the count showing. New `a spectator's view of 10 players fits every desktop size and narrow window`: a second page `watchLobby`s the host's game and passes the same checks as the player tests at each size (no scroll, seats inside the window and apart, the centre rows in the centre box, at narrow sizes the stacked order), with ten seats and no highlighted tile.
  - `phone.spec.ts`: new `a spectator's lobby and game fit the phone` (10 players): no horizontal overflow and `smallTargets` `[]` on both pages. The hidden END TERM is not a target.
  - `playwright.config.ts`: `firefox` `testMatch` becomes `/(no-scroll|sounds|spectator)\.spec/`. In Firefox, the spectator tests that need Chromium skip.

- [ ] **Step 2: Run them to verify they fail.** `cd frontend && npm test -- --run src/spectator && JAVA_HOME=<Java 17> npm run e2e`. Expected: `./SpectatorCount` unresolved, and the header-fit tests fail on a missing `.spectator-count`.

- [ ] **Step 3: Implement D11.** If the user approves the icon, `Eye` comes from `lucide-react` (already pinned at 1.63.0; check the export). Otherwise the count is text, "2 watching". Render `<SpectatorCount count={…} />` in the lobby header and in `GameScreen`'s header, before `<SoundControl />`.

- [ ] **Step 4: Run everything.** `cd frontend && npm test -- --run && npm run build && JAVA_HOME=<Java 17> npm run e2e`, and `cd backend && JAVA_HOME=<Java 17> ./gradlew test`. Expected: all green in all four projects.

- [ ] **Step 5: After-screenshots and diffs.** Retake the D13a shots (`SHOTS=after`, `VIEW=player|player-watched|spectator`) and look at every one. Diff `after-player-*` against `before-player-*` with `compare -metric AE`; expected 0 at all ten. Diff `after-player-watched-*` with the count's box masked; expected 0.

- [ ] **Step 6: `CLAUDE.md`.** Under Layout, add the handshake (`/game?lobby=CODE&spectator=true`, no `name`; `/check-login?…&spectator=true`). Add the rule that secrets are filtered server-side by `GameToJSONConverter.convertForSpectator`, a spectator's commands other than `ping` and `get-state` are dropped and logged, and `spectatorCount` is in every packet. Add `src/spectator/` (`spectatorStatus`, `SpectatorCount`), the spectator cookie, and `spectator.spec.ts` with `driveGame.ts`. Under Constraints, extend the Lucide line if D11's icon is approved.

- [ ] **Step 7: Acceptance drive** (D13), in the scratchpad. Show the user the frame scan, the screenshots, the sounds by event, the alert log, and the reload result.

- [ ] **Step 8: Commit.**

```bash
git add frontend docs/PLAN.md
git commit -m "feat(frontend): show the spectator count in the header"
git add CLAUDE.md
git commit -m "docs(claude): describe spectators"
```

This ticks Task 7.4's last two boxes and the acceptance box "layout tests still pass with a spectator viewport". Then come the final review, the fix pass, a push, and `gh pr create --repo jussaw/Secret-Hitler-Online --base development`. Ask before merging. "Deployed" and the Done-when boxes are the user's.
