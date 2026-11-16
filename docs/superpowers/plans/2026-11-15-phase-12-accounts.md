# Phase 12: Accounts with Discord sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Playing needs an account, made by signing in with Discord; each account has a unique
username of its own, renamable outside games; watching needs nothing (issue #30).

**Architecture:** A new `server.accounts` package holds the username rules, the SQLite account and
session store, the account routes and the Discord flow. `Lobby` is re-keyed on account IDs, with
names only for display and a backed-up map from each seat to its account. The server finds a
player's account from the `session` cookie on the `/game` handshake and ignores the name in the
query and in messages. The page asks `/me` who is signed in, shows the account card and the name
prompt, and adds CHANGE NAME and SIGN IN TO PLAY to the lobby.

**Tech Stack:** Java 17, Javalin 5.6.1 (`Context.cookie`, `WsContext.cookie`/`header`),
`java.net.http.HttpClient`, sqlite-jdbc, JUnit 4 · React 18, TypeScript 5, Vite, Vitest with Testing
Library, `@playwright/test` 1.64.1, Node's built-in `WebSocket` (it sends `headers`).

**Spec:** [`docs/superpowers/specs/2026-11-15-accounts-design.md`](../specs/2026-11-15-accounts-design.md),
with the mockups in [`2026-11-15-accounts/`](../specs/2026-11-15-accounts/). Parent plan:
[`docs/PLAN.md`](../../PLAN.md), Phase 12. Read the spec first: this plan does not repeat its
reasons, and where the two differ the spec wins.

## Decisions (the user, 2026-11-15)

1. **Sessions in SQLite**, 30 days, renewed by use.
2. **Login page B:** the name shown as text with CHANGE NAME; the first sign-in opens CHOOSE A NAME
   by itself; the line reads "Signed in with Discord as <Discord username>".
3. **Lobby A:** CHANGE NAME is a fourth player button, two rows of two on phones.
4. **Approach B:** `Lobby` keyed on account IDs; names are display only.
5. **OAuth by hand** with Java's `HttpClient`; no new server dependency.

## Global Constraints

- **Copy, exactly.** Buttons: `SIGN IN WITH DISCORD`, `TEST SIGN-IN`, `CHANGE NAME`, `Sign out`,
  `CONTINUE`, `SIGN OUT`, `SAVE`, `CANCEL`, `SIGN IN TO PLAY`, `PLAY INSTEAD`. Card titles: `YOUR
  ACCOUNT` (signed out), `YOUR NAME` (signed in). Prompt titles: `CHOOSE A NAME`, `CHANGE NAME`;
  prompt text: `Others see it in lobbies and games. Up to 12 characters.` Lines: `Sign in to play.
  Anyone can watch.`, `Sign-in is not set up on this server.`, `Signed in with Discord as
  <discordUsername>`, `Signed in with a test account (<id>)`, `Signing in with Discord failed.
  Please try again.`, hints `JOIN needs you signed in · WATCH needs only the code` (signed out) and
  `WATCH needs only the code` (signed in). Errors: `Another player already has that name.`, `Names
  like "Bot 1" are kept for CPU players.`, `You can't change your name during a game.`, `Sign in to
  play.`, `You're already in this lobby in another tab or window.`, the socket refusal `Sign in and
  choose a name to play.`
- **Names:** at most 12 UTF-16 code units (`MAX_NAME_LENGTH`); whitespace is exactly
  `[\t\n\u000B\f\r    -     　﻿]` (JavaScript's
  `\s`); unique by `name.toLowerCase(Locale.ROOT)`; `^bot [0-9]+$` on the key is a CPU player's.
- **Cookies:** `session` (HttpOnly, SameSite=Lax, path `/`, Max-Age 30 days, Secure iff
  `DISCORD_REDIRECT_URI` starts with `https:`); `oauth-state` (HttpOnly, SameSite=Lax, path `/auth`,
  Max-Age 600). Tokens: 32 bytes from `SecureRandom`, URL-safe base64 without padding; the
  database keeps SHA-256 hex of the session token only.
- **Environment variables:** `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`,
  `TEST_SIGN_IN` (`true` turns it on). Never set `TEST_SIGN_IN` in the `Dockerfile` or CI's image job.
- **Packets:** shapes unchanged; every packet to a player adds `you` (their name, or seat name in a
  game); spectators get none. Spectators' handshake and commands are unchanged.
- **Serialization:** `Lobby` keeps `serialVersionUID = 7519753883184174211L`; no field or
  non-private method is added to `SecretHitlerGame` or `CpuPlayer`.
- **Locks:** a database call never runs under a lobby's lock. `SecretHitlerServer.ACCOUNTS_LOCK`,
  when taken, is always taken before any lobby's lock.
- **Secrets:** never log a session token, an OAuth code, an access token or the client secret, and
  never put one in a URL.
- **Phones:** buttons and links at least 44 px (`MIN_TARGET`), fields at 16 px or more. The login
  page and the lobby fit every size their layout tests cover today.
- **Linux fonts:** CI draws Germania One 11–17% wider than macOS at phone sizes. Before pushing CSS
  that fits text tightly, measure in `mcr.microsoft.com/playwright:v1.64.1-noble`.
- **Environment:** run `npm ci` in `frontend/` once and `npx playwright install chromium firefox`
  once. Run Gradle and `npm run e2e` with `JAVA_HOME=$HOME/.sdkman/candidates/java/17.0.8-zulu`
  (the default JDK 25 cannot run the Gradle wrapper). If the lockfile must change, use
  `npx npm@11.21.1`. No new runtime dependency on either side.
- **Browser tests** fail from Task 5 (which guards `/new-lobby`) until Task 12 moves them onto
  accounts. Each task before Task 12 runs the backend and Vitest suites only.
- **Branch and commits:** branch `phase-12-accounts` (the worktree has the same name).
  Conventional Commits with a scope (`backend`, `frontend`, `plan`, `docs`, `claude`, `readme`,
  `development`). Task N ticks the Nth box of Phase 12 in `docs/PLAN.md` in its last commit.
- **Public repo:** nothing about the hosting setup in code, docs, commits or the PR.

## Review Focus

1. **A `session` cookie that matches no row** (signed out in another tab, a reset database, a
   tampered value, an empty value): treated as signed out everywhere, never a 500 or a thrown
   handler. Tasks 5 and 7 test it.
2. **A player whose session ends mid-game** (expired, or signed out elsewhere) reconnects: the
   socket is refused with `Sign in and choose a name to play.`, and after signing in again they
   take their seat back by account. Task 7 tests it.
3. **One account in two lobbies renames:** both rosters change, the host stays the host in each,
   and a lobby where it is seated in a running game refuses the rename for all. Task 5 tests it.
4. **A hostile `lobby` on `/auth/discord`** (`../evil`, `https://x`, lower case, five letters, a
   script): it never reaches the redirect; only a valid 4-letter code from the code alphabet does.
   Task 6 tests it.
5. **A second tab of the same browser** joins the lobby the first tab is in: `/check-login` says 403
   with `You're already in this lobby in another tab or window.`, and its socket (another rejoin
   key) is refused without touching the first tab's. Task 7 tests it.

---

### Task 1: Username rules

**Files:**
- Create: `backend/src/main/java/server/accounts/Usernames.java`
- Test: `backend/src/test/java/server/accounts/UsernamesTest.java`

**Interfaces:**
- Produces (all `public static`): `int MAX_LENGTH = 12`; `String normalize(String raw)` (runs of
  whitespace to one space, then trimmed, with the Global Constraints' whitespace class); `String
  key(String normalized)` (`toLowerCase(Locale.ROOT)`); `enum Problem { BLANK, TOO_LONG, CPU_NAME }`;
  `Problem problem(String normalized)` (null when the name is fine); message constants `TAKEN`,
  `CPU_NAME`, `IN_GAME`, `BLANK` (`Choose a name.`), `TOO_LONG` (`Names are at most 12
  characters.`), the first three with the Global Constraints' copy.

- [ ] **Step 1: Write the failing tests**

```java
@Test public void collapsesAndTrimsJavaScriptWhitespace() {
    assertEquals("Ann Lee", Usernames.normalize("  Ann \t\n Lee  "));
    assertEquals("Ann Lee", Usernames.normalize(" Ann　 Lee﻿"));
}
@Test public void keyIgnoresCase() { assertEquals(Usernames.key("ALICE"), Usernames.key("alice")); }
@Test public void blankAndLength() {
    assertEquals(Usernames.Problem.BLANK, Usernames.problem(""));
    assertNull(Usernames.problem("x".repeat(12)));
    assertEquals(Usernames.Problem.TOO_LONG, Usernames.problem("x".repeat(13)));
    assertEquals(Usernames.Problem.TOO_LONG, Usernames.problem("😀".repeat(7))); // 14 code units
}
@Test public void cpuNamesAreRefused() {
    for (String name : List.of("Bot 1", "bot 7", "BOT 12")) {
        assertEquals(name, Usernames.Problem.CPU_NAME, Usernames.problem(name));
    }
    for (String name : List.of("Bot", "Bot 1a", "Robot 1", "Bot one")) {
        assertNull(name, Usernames.problem(name));
    }
}
```

- [ ] **Step 2: Run** `cd backend && ./gradlew test --tests 'server.accounts.UsernamesTest'`.
  Expected: compilation fails (no `Usernames`).
- [ ] **Step 3: Implement `Usernames`** as in Interfaces.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): add the username rules`, ticking box 1.

---

### Task 2: Account and session store

**Files:**
- Create: `backend/src/main/java/server/accounts/Account.java`,
  `backend/src/main/java/server/accounts/AccountStore.java`
- Test: `backend/src/test/java/server/accounts/AccountStoreTest.java`

**Interfaces:**
- Produces: `public record Account(String id, String discordUsername, String discordAvatar, String
  username)` with `boolean isTest()` (`id.startsWith("test-")`).
- Produces on `AccountStore` (every public method `synchronized`, one JDBC connection with
  `PRAGMA busy_timeout = 5000`, tables created if missing as the spec's Data section gives them):
  - `static AccountStore open(String databasePath)`: the file, or `jdbc:sqlite::memory:` when null or
    blank; `static AccountStore open(String databasePath, LongSupplier clock)` for tests.
  - `Account upsertDiscordAccount(String discordId, String discordUsername, String avatar)`: keeps
    `username`.
  - `Account upsertTestAccount(String id)`: account `"test-" + id`, Discord username the same.
  - `Account find(String accountId)`: null if none.
  - `enum NameResult { SAVED, TAKEN }`; `NameResult setUsername(String accountId, String
    normalizedName)`: the caller has checked `Usernames.problem`; TAKEN when the unique index on
    `username_key` refuses it (catch the constraint error, never check-then-write).
  - `String createSession(String accountId)`: returns the raw token.
  - `record SessionLookup(Account account, boolean renewed)`; `SessionLookup lookup(String token)`:
    null for null, blank, unknown or expired tokens; extends `expires_at` to 30 days from now when
    under 29 days remain, and says so in `renewed`.
  - `void deleteSession(String token)`; `int sweepExpiredSessions()` (rows deleted).
  - `static final long SESSION_MS = 30 days`, `RENEW_BELOW_MS = 29 days`.

- [ ] **Step 1: Write the failing tests** (in-memory, a mutable clock):
  `discordSignInKeepsTheChosenName` (upsert, set "Rowan", upsert again with a new Discord username:
  `username` still "Rowan", `discordUsername` the new one); `namesAreUniqueIgnoringCase` (A saves
  "Alice", B's "ALICE" is TAKEN, A's own "alice" is SAVED); `twoSavesAtOnceOneWins` (two threads,
  two accounts, the same name through a `CountDownLatch`: exactly one SAVED);
  `sessionsAreStoredHashed` (no row's `token_hash` equals the token; it equals the token's SHA-256
  hex); `aSessionLastsThirtyDays` (lookup at +29d 23h finds it, at +30d 1m after no use returns
  null); `useRenewsAtMostDaily` (lookup at +12h: `renewed` false; at +1d 1m: true, and it then lasts
  to +31d 1m); `sweepDeletesOnlyExpired`; `signOutEndsTheSession`; `junkTokensFindNothing` (null,
  "", "x", a deleted token).
- [ ] **Step 2: Run** `./gradlew test --tests 'server.accounts.AccountStoreTest'`. Expected: fails
  to compile.
- [ ] **Step 3: Implement `Account` and `AccountStore`** as in Interfaces.
- [ ] **Step 4: Run it again.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): store accounts and sessions in sqlite`, ticking box 2.

---

### Task 3: `Lobby` keyed on account IDs

**Files:**
- Modify: `backend/src/main/java/server/util/Lobby.java`,
  `backend/src/main/java/server/SecretHitlerServer.java` (callers only)
- Test: every file in `backend/src/test/java/server/util/` that adds users, `RejoinServerTest`,
  `LobbyTimeoutServerTest` (their `Lobby` subclasses override `addUser`)

**Interfaces:**
- Produces on `Lobby` (fields as the spec's table; the seats map `gameSeats`, account ID → seat
  name, replaces `usersInGame`; `accountToName` is transient):
  - `enum JoinRefusal { CLOSED, NO_ACCOUNT, ALREADY_IN, FULL, IN_GAME }`;
    `JoinRefusal joinRefusal(String accountId, String rejoinKey)` in that order; `NO_ACCOUNT` for a
    null or blank ID.
  - `WsContext addUser(WsContext ctx, String accountId, String name, String rejoinKey)` and
    `void addUser(WsContext ctx, String accountId, String name)` (no key); both throw
    `IllegalArgumentException` when `joinRefusal` is not null, as today.
  - `String accountOf(WsContext ctx)` (null for a non-player); `boolean hasAccount(String
    accountId)` (a live connection: was `hasUserWithName`); `boolean hasLiveConnectionWithKey(String
    accountId, String rejoinKey)`; `boolean canRejoin(String accountId)`; `boolean
    canAddUserDuringGame(String accountId)`.
  - `void updateUser(WsContext ctx)` (the lobby knows whose it is); `hasUser(WsContext, String)` goes.
  - `List<String> getUserNames()`, `trySetUserIcon`, `removeUser`, `startNewGame` keep their
    meaning. Packets: `usernames` lists the names of the accounts in join order, and `icon` is keyed
    by name in the lobby and by seat name in a game.
  - A `readObject` that leaves every account map non-null when the stream had none (a backup from
    before accounts).
- Until Task 7, `SecretHitlerServer` passes the `name` query parameter as both account ID and name,
  so the server and its tests behave as today.

- [ ] **Step 1: Move the tests onto account IDs.** Each lobby test gives player `P1` the account
  `acct-P1` (a helper `join(lobby, ctx, name)` in each test class, or one in
  `server/util/LobbyTesting.java`) and asserts on names as today. Every test keeps its scenario and
  still fails without the fix it guards (#41, #42, #43, #63, #64). `LobbyBlankNameTest` becomes
  `LobbyNoAccountTest`: a null or blank account ID is `NO_ACCOUNT`, `addUser` throws for it, and the
  lobby is unchanged. Add `aSecondConnectionForAnAccountNeedsItsKey` to `LobbyRejoinTest`: account
  `a` with a live connection makes a second connection without its key `ALREADY_IN`, and with the
  key a takeover.
- [ ] **Step 2: Run** `./gradlew test`. Expected: compilation fails on the new signatures.
- [ ] **Step 3: Re-key `Lobby`** as in Interfaces, and update `SecretHitlerServer`'s calls
  (`joinRefusal(name, key)`, `addUser(ctx, name, name, key)`, `hasUser(ctx)` for messages,
  `updateUser(ctx)`, `refusalReason` for the new enum: `NO_ACCOUNT` reads `Lobby and name must be
  specified.` until Task 7, `ALREADY_IN` reads as `NAME_TAKEN` did).
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS, the same count as before plus the new test.
- [ ] **Step 5: Commit** `refactor(backend): key the lobby on account ids`, ticking box 3.

---

### Task 4: Seats, `you` and renaming in a lobby

**Files:**
- Modify: `backend/src/main/java/server/util/Lobby.java`,
  `backend/src/main/java/server/SecretHitlerServer.java` (`PARAM_YOU`)
- Test: `backend/src/test/java/server/util/LobbyRenameTest.java`, `LobbyTermTimerTest.java`

**Interfaces:**
- Consumes: Task 3's `Lobby`.
- Produces on `Lobby`: `String seatName(WsContext ctx)` (the connection's seat in the running game,
  else null); `boolean isSeated(String accountId)` (in the running game); `Map<String, String>
  seatAccounts()` (seat name → account ID, a copy, empty outside a game: #31 reads it);
  `boolean rename(String accountId, String name)` (true when the account is in the lobby, live or
  inside the grace window, and its name changed; throws `IllegalStateException` when it is seated
  in a running game). `startNewGame` seats each live account under its name and fills `gameSeats`;
  the END TERM countdown asks `gameSeats.containsValue(president)` where it asked `usersInGame`.
- Produces on `SecretHitlerServer`: `public static final String PARAM_YOU = "you"`, put into every
  packet `send` gives a player (their name in the lobby, their seat name in a game), never a
  spectator's.

- [ ] **Step 1: Write the failing tests** in `LobbyRenameTest`:
  `aRenameShowsInTheNextPacket` (A renames `Ann` to `Annie`: every connection's next lobby packet
  lists `Annie` in A's place, and the icon map has `Annie`'s portrait);
  `theHostStaysTheHost` (the host renames: still first in `usernames`);
  `aRenameInsideTheGraceWindowSticks` (A disconnects, renames, rejoins inside the window under the
  new name: one entry, the new name, A's place);
  `aSeatedAccountCannotRename` (game running: `rename` throws, `usernames` and the seats unchanged);
  `seatsMapToAccounts` (after `startNewGame`, `seatAccounts()` maps each human seat name to its
  account and has no `Bot n`); `youIsTheViewersName` (each player's packet has `you` = their name,
  a spectator's has no `you`); `youIsTheSeatNameInAGame`.
  In `LobbyTermTimerTest`, the existing CPU-president and human-president cases keep passing.
- [ ] **Step 2: Run** `./gradlew test --tests 'server.util.*'`. Expected: the new tests fail.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): rename accounts in a lobby and send each player's name`,
  ticking box 4.

---

### Task 5: Sessions, account routes and renaming across lobbies

**Files:**
- Modify: `backend/src/main/java/server/ApplicationConfig.java`,
  `backend/src/main/java/server/SecretHitlerServer.java` (routes, `accounts`, `ACCOUNTS_LOCK`,
  `renameAccount`, the `/new-lobby` guard, the sweep timer), `backend/src/test/java/game/ApplicationTest.java`
  (`runLocal` turns on `TEST_SIGN_IN`), `frontend/vite.config.ts` (proxy `/auth` and `/me`)
- Create: `backend/src/main/java/server/accounts/AuthRoutes.java`
- Test: `backend/src/test/java/server/accounts/AuthRoutesTest.java`,
  `backend/src/test/java/server/RenameServerTest.java`, `backend/src/test/java/server/TestAccounts.java`

**Interfaces:**
- Consumes: `Usernames`, `AccountStore`, `Lobby.isSeated`/`rename`/`sendStateToAll`.
- Produces on `ApplicationConfig`: `String DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`,
  `DISCORD_REDIRECT_URI`; `boolean TEST_SIGN_IN` (`"true".equals(getenv)`); `static boolean
  discordConfigured()` (all three non-blank); `static boolean secureCookies()`. All non-final, so
  tests set them.
- Produces on `SecretHitlerServer`: `static AccountStore accounts` (opened in `main` from
  `DATABASE_PATH`; tests assign their own); `static final Object ACCOUNTS_LOCK`; `enum RenameResult
  { SAVED, TAKEN, SEATED }`; `static RenameResult renameAccount(String accountId, String
  normalizedName)`. Under `ACCOUNTS_LOCK` it checks every lobby (each under its own lock) for
  `isSeated`, saves through `accounts.setUsername`, then calls `rename` and `sendStateToAll` in
  each lobby that has the account, and sets `hasLobbyChanged`. `COMMAND_START_GAME` takes
  `ACCOUNTS_LOCK` before the lobby's lock. The 60 s timer calls `accounts.sweepExpiredSessions()`.
- Produces on `AuthRoutes`: `static final String SESSION_COOKIE = "session"`; `static Account
  signedIn(Context ctx)` (null when signed out; re-sets the cookie when the lookup renewed it);
  `static void startSession(Context ctx, String accountId)`; `static JSONObject me(Account account)`
  (the spec's `/me` body; `discord` and `testSignIn` from `ApplicationConfig`); handlers
  `getMe`, `postUsername`, `postSignOut`, `postTestSignIn` with the spec's statuses and bodies. Both
  account-changing `POST`s answer 415 unless the content type is `application/json`.
  `createNewLobby` answers 401 `Sign in to play.` unless `signedIn` has a username, before the sweep.
- Produces in tests: `TestAccounts.signIn(AccountStore store, String id, String name)` → session
  token, for every server test from here on.

- [ ] **Step 1: Write the failing tests.** `AuthRoutesTest` runs `SecretHitlerServer.createApp()` on
  a free port with an in-memory store: `/me` signed out, signed in without and with a name;
  `postUsername` 200 (the body is the normalized name), 400 for each `Problem`, 401 without a
  session, 409 taken (another case), 415 without JSON; a junk, empty or deleted `session` cookie is
  signed out on `/me`, `/me/username` (401) and `/new-lobby` (401), never 500; sign-out deletes the
  row and sends an expiring cookie; test sign-in 404 while off, and while on creates `test-<id>`,
  sets the cookie (HttpOnly, SameSite=Lax, Max-Age 2592000) and applies an optional username (409
  when taken); `/new-lobby` makes no lobby without a named account (`codeToLobby` unchanged).
  `RenameServerTest` (lobbies built with `Lobby.addUser` on `FakeSocket`s, registered in
  `codeToLobby`): `renamesEveryLobbyTheAccountIsIn` (both lobbies' next packets have the new name,
  and the account is still the host of the lobby it hosts); `aSeatAnywhereRefusesTheRename` (seated in one
  lobby's game, idle in another: SEATED, no lobby and no row changed); `renameAgainstGameStart`
  (rename and `startNewGame` released together 200 times: either the seat has the new name and the
  row too, or the result is SEATED and the row keeps the old name).
- [ ] **Step 2: Run** `./gradlew test --tests 'server.accounts.AuthRoutesTest' --tests
  'server.RenameServerTest'`. Expected: fails to compile.
- [ ] **Step 3: Implement** as in Interfaces, logging a warning at start when `TEST_SIGN_IN` is on,
  and another when neither sign-in is available.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): add sessions, the account routes and renaming`, ticking
  box 5.

---

### Task 6: Discord sign-in

**Files:**
- Create: `backend/src/main/java/server/accounts/DiscordSignIn.java`
- Modify: `backend/src/main/java/server/SecretHitlerServer.java` (two routes)
- Test: `backend/src/test/java/server/accounts/DiscordSignInTest.java`

**Interfaces:**
- Consumes: `AuthRoutes.startSession`, `AccountStore.upsertDiscordAccount`, `ApplicationConfig`.
- Produces: `DiscordSignIn` with `static String authorizeUrl = "https://discord.com/oauth2/authorize"`,
  `static String apiBase = "https://discord.com/api"` (tests point both at a fake), `static
  Duration TIMEOUT = 10 s`; handlers `start(Context)` for `GET /auth/discord` and `callback(Context)`
  for `GET /auth/discord/callback`, following the spec's steps 1 to 4; `static String
  validLobbyCode(String raw)` (the code when it is 4 characters of `SecretHitlerServer`'s code
  alphabet, else null).

- [ ] **Step 1: Write the failing tests** with a fake Discord (a Javalin app on a free port that
  answers `/oauth2/token` and `/users/@me`, and records what it got):
  `startRedirectsToDiscordWithAState` (302; the `oauth-state` cookie; the URL has `client_id`,
  `scope=identify`, `response_type=code`, the redirect URI and the state);
  `callbackSignsInAndComesHome` (302 to `/`, a `session` cookie, the account with the fake's
  username and avatar and no `username`); `callbackKeepsTheLobbyCode` (start with `?lobby=KQMX`,
  callback lands on `/?lobby=KQMX`); `hostileLobbyCodesNeverRedirect` (`../evil`, `https://x`,
  `kqmx`, `KQMXZ`, `<b>`: the callback lands on `/`); `aWrongOrMissingStateFails` (lands on
  `/?signin=failed`, no session, no call to the fake); `cancelAtDiscordFails` (`?error=access_denied`);
  `discordDownOrSlowFails` (the fake answers 500, or sleeps past a 1 s test timeout);
  `nothingSecretIsLogged` (a log appender sees neither the code, the token nor the secret);
  `startIs503WhenNotConfigured`.
- [ ] **Step 2: Run** `./gradlew test --tests 'server.accounts.DiscordSignInTest'`. Expected: fails
  to compile.
- [ ] **Step 3: Implement `DiscordSignIn`** and register its routes.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): sign in with discord`, ticking box 6.

---

### Task 7: Players join by account

**Files:**
- Modify: `backend/src/main/java/server/SecretHitlerServer.java` (`onWebsocketConnect`,
  `checkLogin`, `onWebSocketMessage`, `refusalReason`)
- Test: `TestSocket.java`, `RejoinServerTest.java`, `SpectatorServerTest.java`,
  `TermTimerServerTest.java`, `LobbyTimeoutServerTest.java`, `GameDriver.java` (all in
  `backend/src/test/java/server/`)

**Interfaces:**
- Consumes: `AuthRoutes.SESSION_COOKIE`, `AccountStore.lookup`, `ACCOUNTS_LOCK`, Task 3 and 4's
  `Lobby`.
- Produces: a player's handshake reads `ctx.cookie("session")` and looks the account up before any
  lock; no account, or no username: close 1002 `Sign in and choose a name to play.`; then, outside
  `ApplicationConfig.DEBUG`, `static boolean sameOrigin(WsContext ctx)` must hold (the `Origin`
  header's scheme, host and port equal `DISCORD_REDIRECT_URI`'s when set, else its host and port
  equal the `Host` header), else close 1002. The account's name is read again under
  `ACCOUNTS_LOCK`, which is held through `joinRefusal` and `addUser`. `NO_ACCOUNT` reads `Sign in
  and choose a name to play.`, `ALREADY_IN` reads `You're already in this lobby in another tab or
  window.` `checkLogin` for players: the spec's table (401 also for an account with no username).
  `onWebSocketMessage` ignores `name`: the player is `lobby.accountOf(ctx)`, and commands that need
  a name (`verifyIsPresident`, `verifyIsChancellor`, `registerVote`, `isLateForTerm`) get
  `lobby.seatName(ctx)`.
- Produces in tests: `TestSocket.connect(int port, String query, String sessionToken)` (sends
  `Cookie: session=…` and `Origin: http://localhost:<port>`); the two-argument `connect` stays for
  spectators.

- [ ] **Step 1: Move the server tests onto sessions** (`TestAccounts.signIn` for each player; the
  existing scenarios unchanged, still failing without their fixes), and **write the failing tests**:
  `aPlayerWithoutASessionIsRefused` (none, junk, expired, signed out: 1002 with the message, the
  lobby untouched); `anAccountWithNoNameIsRefused`; `theNameComesFromTheAccount` (query
  `name=Mallory`, account "Rowan": the roster says Rowan); `anotherOriginIsRefused` and
  `aMissingOriginIsRefused` (`DEBUG` false); `checkLoginStatuses` (401 signed out, 401 no name, 403
  a live connection in this lobby, then 404, 488, 489, 200 as today); `aSecondTabIsRefused` (Review
  Focus 5); `aMessageNamingSomeoneElseActsAsItsSender` (B's socket sends a vote with `name` A: B's
  vote is counted, A's is not); `aSessionThatEndsMidGameNeedsASignIn` (Review Focus 2: sign out,
  reconnect refused, sign in again, rejoin the seat); `aRestoredGameIsRetakenByAccount` (a lobby
  round-tripped through `storeLobbies`/`loadLobbies` mid-game: the seat's account rejoins it);
  `aJoinNeverRecordsAStaleName` (a join and a `renameAccount` released together 200 times: the
  roster always ends with the saved name); `spectatorsNeedNoSession`.
- [ ] **Step 2: Run** `./gradlew test`. Expected: the new tests fail.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): join lobbies by signed-in account`, ticking box 7.

---

### Task 8: Backups from before accounts

**Files:**
- Modify: `backend/src/main/java/server/util/Lobby.java`, `SecretHitlerServer.loadLobbies`
- Test: `backend/src/test/java/server/DatabaseBackupTest.java`

**Interfaces:**
- Produces: `boolean Lobby.wasBackedUpBeforeAccounts()` (true when `readObject` found no account
  maps); `loadLobbies` drops such a lobby when it is in a game, logging `Dropped lobby <CODE>: its
  game was backed up before accounts.`, and keeps it otherwise.

- [ ] **Step 1: Write the failing tests:** `aBackupFromBeforeSpectatorsStillLoads` becomes
  `aBackupFromBeforeAccountsKeepsIdleLobbies` (the fixture loads without throwing, `WXYZ` is kept
  and joinable by an account, `ABCD` is gone); `seatsKeepTheirAccountsThroughABackup` (a game
  seated by two accounts and CPU players: `seatAccounts()` is equal after the round trip).
- [ ] **Step 2: Run** `./gradlew test --tests 'server.DatabaseBackupTest'`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): drop games backed up before accounts`, ticking box 8.

---

### Task 9: The page's account calls, name prompt and messages

**Files:**
- Create: `frontend/src/account/account.ts`, `frontend/src/account/account.test.ts`,
  `frontend/src/custom-alert/NamePrompt.tsx` (from `PlayInsteadPrompt.tsx`, with its CSS and test
  renamed to `NamePrompt.css` and `NamePrompt.test.tsx`)
- Modify: `frontend/src/constants/index.ts`, `frontend/src/lobby/joinError.ts` (and its test),
  `frontend/src/sound/soundEvents.ts` (and its test)

**Interfaces:**
- Produces in `constants`: `ME = "/me"`, `ME_USERNAME = "/me/username"`, `AUTH_DISCORD =
  "/auth/discord"`, `AUTH_SIGN_OUT = "/auth/sign-out"`, `AUTH_TEST_SIGN_IN = "/auth/test-sign-in"`,
  `PARAM_YOU = "you"`; `COOKIE_NAME` goes.
- Produces in `account.ts`: `type Me = { signedIn: false; discord: boolean; testSignIn: boolean } |
  { signedIn: true; id: string; username: string | null; discordUsername: string; test: boolean;
  discord: boolean; testSignIn: boolean }`; `fetchMe(): Promise<Me>`; `saveUsername(name: string):
  Promise<{ ok: true; username: string } | { ok: false; error: string }>` (the error is the
  server's body, or `CONTACT_ERROR`); `signOut(): Promise<void>`; `testSignIn(): Promise<Me>` (a
  random ID per call); `discordSignInHref(lobby: string): string` (`/auth/discord`, plus
  `?lobby=CODE` when `lobby` is a full code).
- Produces: `NamePrompt` with props `{ title: string; initialName: string; confirmLabel: string;
  secondaryLabel: string; onConfirm(name: string): Promise<string>; onSecondary(): void }`
  (`onConfirm` resolves "" on success, else the error to show), the prompt text from the Global
  Constraints, the field taking `typedName`, the confirm button off while the normalized name is
  blank or a save is running, and `PlayInsteadPrompt`'s single-press guard.
- Produces: `joinErrorMessage(status: number): string` (no name argument): 401 `Sign in to play.`,
  403 `You're already in this lobby in another tab or window.`, 404, 488, 489 as today.
- Produces: `lobbySounds(prev, next)` plays nothing when `next` has `prev`'s length and differs in
  exactly one place.

- [ ] **Step 1: Write the failing tests:** `account.test.ts` (each `Me` shape parsed; `saveUsername`
  maps 200, 409 with its body, and a network failure; `discordSignInHref("KQMX")` and `("KQ")`);
  `NamePrompt.test.tsx` (PlayInsteadPrompt's cases with the new props, plus CONTINUE/SIGN OUT
  and SAVE/CANCEL labels, and an error staying under the field with the prompt open);
  `joinError.test.ts` (401, 403); `soundEvents.test.ts`:

```ts
it("a rename is not a join", () => {
  expect(lobbySounds(["Ann", "Bo", "Cy"], ["Ann", "Bob", "Cy"])).toEqual([]);
});
it("a join still sounds, even with a leave", () => {
  expect(lobbySounds(["Ann", "Bo"], ["Ann", "Bo", "Cy"])).toEqual(["playerJoined"]);
  expect(lobbySounds(["Ann", "Bo", "Cy"], ["Ann", "Cy", "Di"])).toEqual(["playerJoined"]);
});
```

- [ ] **Step 2: Run** `cd frontend && npm test -- --run`. Expected: the new tests fail.
- [ ] **Step 3: Implement** as in Interfaces. `App` keeps compiling: pass statuses without the name,
  and leave the PLAY INSTEAD prompt on `NamePrompt` until Task 11.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the account calls and the name prompt`, ticking box 9.

---

### Task 10: The login page

**Files:**
- Modify: `frontend/src/login/LoginScreen.tsx`, `LoginScreen.css`, `LoginScreen.test.tsx`,
  `frontend/src/App.tsx` (login state and wiring), `frontend/src/App.test.tsx`,
  `frontend/src/AppLobbyLink.test.tsx`

**Interfaces:**
- Consumes: Task 9's `account.ts`, `NamePrompt`, `joinErrorMessage`.
- Produces: `LoginScreenProps` loses `name` and `onNameChange` and gains `account: Me | undefined`
  (undefined while `/me` is pending), `accountError: string`, `discordHref: string`,
  `onTestSignIn(): void`, `onChangeName(): void`, `onSignOut(): void`. JOIN needs a signed-in
  account with a username and a full code; CREATE LOBBY a signed-in account with a username;
  WATCH only the code. The card's states, copy and layout are the spec's (The login page) and
  `login-phone.jpg`; Sign out is a button styled as a link.
- Produces in `App`: `account?: Me` in state, loaded by `fetchMe` in `componentDidMount`;
  `?signin=failed` sets the card's error and is removed with `history.replaceState`, keeping
  `?lobby=`; a signed-in account with no username queues `NamePrompt` (`CHOOSE A NAME`, `CONTINUE`,
  `SIGN OUT`), which cannot be dismissed otherwise; CHANGE NAME queues it as `CHANGE NAME`, `SAVE`,
  `CANCEL`; `tryLogin(lobby)` sends no name; `openSeat(lobby)` opens the socket with no `name` in
  the query; `loginName`, `typedName` on the login page and `COOKIE_NAME` go.

- [ ] **Step 1: Write the failing tests:** `LoginScreen.test.tsx` (pending: no button, JOIN and
  CREATE off; `/me` failed: `CONTACT_ERROR` in the card; signed out: the link's `href` carries the code, JOIN and CREATE off, WATCH on, the
  hint; Discord off: the button disabled with its line; test sign-in on: TEST SIGN-IN shown; signed
  in: the name, CHANGE NAME, `Signed in with Discord as rowan.d`, a test account's line, Sign out;
  `accountError` shown under the button); `App.test.tsx` (a first sign-in opens CHOOSE A NAME and
  JOIN stays off until CONTINUE saves; SIGN OUT in it signs out; CHANGE NAME saves and the card
  shows the new name; a 409 keeps the prompt open with the message; `?signin=failed` shows the
  failure and leaves `?lobby=KQMX` in the URL; JOIN calls `/check-login?lobby=KQMX` with no name).
- [ ] **Step 2: Run** `npm test -- --run`. Expected: the new tests fail.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): sign in on the login page`, ticking box 10.

---

### Task 11: The lobby

**Files:**
- Modify: `frontend/src/lobby/LobbyScreen.tsx`, `LobbyScreen.css`, `LobbyScreen.test.tsx`,
  `frontend/src/App.tsx`, `frontend/src/AppSwitch.test.tsx`
- Delete: `frontend/src/custom-alert/PlayInsteadPrompt.*` if Task 9 left any of it

**Interfaces:**
- Consumes: `Me`, `NamePrompt`, `discordSignInHref`, `PARAM_YOU`.
- Produces: `LobbyScreenProps` gains `signedIn: boolean` and `signInHref: string` (for a spectator)
  and `onChangeName(): void`. A player gets CHANGE NAME, CHANGE LOOK, WATCH INSTEAD, LEAVE LOBBY (in
  that order); a spectator signed out gets SIGN IN TO PLAY (an `<a>` styled as the grey button, to
  `signInHref`) and LEAVE LOBBY; signed in, PLAY INSTEAD and LEAVE LOBBY. In the phone-only block of
  `LobbyScreen.css`, a player's four buttons are a two-column grid; a spectator's two stay one row.
- Produces in `App`: every lobby and game packet's `you` sets `state.name`; PLAY INSTEAD checks and
  opens the seat with no prompt, or with no username queues CHOOSE A NAME first and takes the seat
  after CONTINUE; `seatPending` behaves as today.

- [ ] **Step 1: Write the failing tests:** `LobbyScreen.test.tsx` (the buttons per viewer and their
  order; SIGN IN TO PLAY's `href`; a full lobby keeps its note for a signed-in spectator);
  `AppSwitch.test.tsx` (PLAY INSTEAD signed in opens the seat at once; with no name, CHOOSE A NAME
  first; a `you` change after a rename moves the viewer's mark and the host's START GAME).
- [ ] **Step 2: Run** `npm test -- --run`. Expected: the new tests fail.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): rename and sign in from the lobby`, ticking box 11.

---

### Task 12: The browser tests on accounts

**Files:**
- Create: `frontend/e2e/accounts.ts`
- Modify: `frontend/playwright.config.ts` (`webServer.env.TEST_SIGN_IN = "true"`),
  `frontend/e2e/lobby.ts`, `driveGame.ts`, `fakeGame.ts` (stub `/me` as a signed-in account),
  every spec that seats a player, `no-scroll.spec.ts` and `phone.spec.ts` (login and lobby tests)

**Interfaces:**
- Produces in `accounts.ts`: `uniqueName(stem: string): string` (exactly 12 characters, unique
  across the run: the stem cut to fit, then a tag from the worker index and a counter);
  `signInPage(page: Page, name: string): Promise<void>` (`page.request.post` to the test sign-in,
  so the page's context holds the cookie); `signInRaw(baseURL: string, name: string):
  Promise<string>` (the `Cookie` header value); `playerSocket(baseURL: string, lobby: string,
  cookie: string): Promise<WebSocket>` (Node's `WebSocket` with `headers: { Cookie, Origin }`).
- `createLobby`, `joinLobby`, `joinGuests`, `longestLogin`, `startGame` and `openTable` sign their
  players in and take names from `uniqueName` (tests asserting a name read it back from the
  helper); `nameField` goes. `driveGame.ts` makes its lobby with a signed-in `fetch`.

- [ ] **Step 1: Switch the helpers and the specs** to accounts, as in Interfaces.
- [ ] **Step 2: Extend the layout tests:** the login page signed out and signed in (with a stubbed
  `/me` whose Discord username is 32 characters) fits at every size it covers today, with 44 px
  targets for SIGN IN WITH DISCORD, CHANGE NAME and Sign out; the lobby's four player buttons fit,
  with 44 px targets, at every size, for the host, a guest and spectators signed in and out.
- [ ] **Step 3: Run** `npm run e2e`. Expected: every project passes. Fix what fails; the layout is
  the spec's, so the room for a second button row on phones comes from spacing, not from dropping
  anything.
- [ ] **Step 4: Commit** `test(frontend): run the browser tests on accounts`, ticking box 12.

---

### Task 13: Browser tests of accounts

**Files:**
- Create: `frontend/e2e/accounts.spec.ts` (`desktop` and `phone-360`; add it to `phone-412`'s
  `testIgnore` in `playwright.config.ts`)

- [ ] **Step 1: Write the tests:** `signedOutCanOnlyWatch` (JOIN and CREATE LOBBY off, WATCH works,
  SIGN IN WITH DISCORD's `href` carries the code); `theFirstSignInAsksForAName` (TEST SIGN-IN, then
  CHOOSE A NAME, then CREATE LOBBY works); `renameOnTheLoginPage` (a taken name shows its error, a
  free one saves); `aRenameShowsInTheLobbyAtOnce` (a second page in the lobby sees the new name
  without a reload, and no join sound plays: `soundLog`); `noRenameInAGame` (no CHANGE NAME on the
  game page; `/me/username` answers 403 while seated); `signInToPlayLink` (a signed-out spectator's
  button links to `/auth/discord?lobby=CODE`); `playInsteadNeedsNoPrompt` (a signed-in spectator
  takes a seat under the account's name at once).
- [ ] **Step 2: Run** `npx playwright test e2e/accounts.spec.ts`. Expected: PASS in both projects.
- [ ] **Step 3: Commit** `test(frontend): add the accounts browser tests`, ticking box 13.

---

### Task 14: Docs and the pull request

**Files:**
- Modify: `CLAUDE.md` (Layout: accounts, sessions, the routes, `Lobby` keyed on accounts, the login
  page and lobby, the new tests; Constraints: the protocol line as the spec's Constraints words
  it, and the same line under Global Constraints in `docs/PLAN.md`), `README.md` (what the fork adds; hosting: create a Discord application, register
  `https://<host>/auth/discord/callback`, set the three variables), `DEVELOPMENT.md` (`runLocal` has
  test sign-in; trying Discord locally with `http://localhost:3000/auth/discord/callback`; several
  players need private windows or other browsers), `docs/PLAN.md`

- [ ] **Step 1: Update the docs** as in Files; nothing names a real host, domain or deploy tool.
- [ ] **Step 2: Run everything:** `./gradlew test`, `npm test -- --run`, `npm run build`, `npm run
  e2e`. Expected: all pass; record the counts for the PR.
- [ ] **Step 3: Take the before-and-after screenshots** (the login page signed out and signed in,
  and the lobby for a player and a signed-out spectator, at 1600x900 and 412x915) into
  `docs/pr/phase-12-accounts/`, "before" from `development`.
- [ ] **Step 4: Commit** the docs (`docs(claude): …`, `docs(readme): …`, `docs(development): …`)
  and the screenshots, ticking box 14, then push and open the PR into `development` with `gh pr
  create --repo jussaw/Secret-Hitler-Online`, its body following the Workflow in `CLAUDE.md` and
  ending `Closes #30`. Tick "PR merged" in the PR's last commit before the merge.
