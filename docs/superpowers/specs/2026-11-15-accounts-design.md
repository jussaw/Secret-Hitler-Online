# Accounts with Discord sign-in: design

Date: 2026-11-15
Status: approved design, pending implementation plan (`docs/PLAN.md`, Phase 12)
Issue: [#30](https://github.com/jussaw/Secret-Hitler-Online/issues/30)

## Why

Issue #31 records every finished game and shows stats per player. That needs a player who stays the
same person across names and lobbies, which typed names cannot give: anyone can type any name, and
the same person types different ones. This phase adds accounts. Signing in is only through Discord,
and playing needs an account. Watching does not.

Today (on `development`):

- A player types a name on the login page (`LoginScreen`, the `name` cookie keeps it for a week)
  and joins with `/check-login?lobby=CODE&name=NAME`, then `/game?lobby=CODE&name=NAME&rejoinKey=…`.
- `Lobby` keys everything on that name: the join order and host (`activeUsernames`), the live
  connection (`userToUsername`), the portrait and preferred portrait (`usernameToIcon`,
  `usernameToPreferredIcon`, both backed up), the rejoin key, the grace window's pending removal
  (`pendingRemovals`) and the running game's players (`usersInGame`, backed up).
- Every message from a player carries `name`, and the server checks it against the connection
  (`Lobby.hasUser(ctx, name)`).
- The SQLite file at `DATABASE_PATH` holds one table, `backup`, with the serialized lobbies.

The look of the new login page and lobby was settled with mockups. Screenshots are in
[`2026-11-15-accounts/`](2026-11-15-accounts/):

- `login-phone.jpg`: the login page signed out, at the first sign-in (CHOOSE A NAME), signed in,
  and the CHANGE NAME prompt with a taken name
- `lobby-phone.jpg`: the host and a player with CHANGE NAME, a spectator who is not signed in
  (SIGN IN TO PLAY) and one who is (PLAY INSTEAD)

Sizes and spacing in the screenshots are close, not exact. The real pages keep today's components
and CSS.

## Goals

1. **Sign in with Discord.** A "SIGN IN WITH DISCORD" button on the login page runs Discord's OAuth2
   authorization code flow (scope `identify`). The server keeps the person signed in with a session
   cookie, and they can sign out.
2. **Playing needs an account.** Someone who is not signed in can only watch, as a spectator does
   today. Spectators and CPU players need no account.
3. **A username of the account's own.** Chosen at the first sign-in, before the person can play.
   Never taken from or filled in with anything from Discord. It is the name shown for them in
   lobbies and games.
4. **Renaming.** From the login page or the lobby, any number of times, with no cooldown. A rename
   in a lobby shows to everyone at once. Not while the account has a seat in a running game.
5. **Unique names.** First come, first served, across all accounts. Two names that differ only in
   case are the same name.
6. **Seats tied to accounts.** A running game knows which account holds each seat, and the lobby
   backups keep it, so #31 can count games per account.
7. **Sign-ins survive restarts.** The server restarts with each image update and brings lobbies back
   from the backup; a signed-in player is still signed in and goes back to their seat.

## Non-goals

- Any sign-in other than Discord, or passwords.
- Playing as a guest without an account.
- Limiting who may sign in (an allow-list, Discord server membership). Anyone with a Discord account
  can sign in.
- Showing Discord avatars or the Discord name to other players. The avatar is stored for later use;
  only the signed-in person sees their own Discord username.
- Deleting an account, or any admin page.
- Stats, game records and the stats page (#31).
- Renaming during a game.
- Taking back a seat in a game that was running when this phase deploys (see Known limits).

## Anti-goals (a failure even if it works)

- The Discord client secret, a session token or any detail of the deployment in the repo, in a log
  line or in a URL.
- A way to sign in without Discord that the published image can reach.
- A username taken from Discord, or a game seat whose name changes during the game.
- A rename that leaves a lobby half-moved (the roster showing one name, the portrait or the host
  keyed on the other).
- Losing any of the race fixes in `Lobby` (#41, #43, #63, #64): each keeps a test that fails without
  it.
- Spectating that needs an account, or a spectator who sees a secret.
- A login page or lobby that scrolls at a size the layout tests cover today.

## Constraints

- **The players' WebSocket protocol changes.** A player's socket needs a signed-in session. The
  constraint in `CLAUDE.md` ("stays backward compatible for players") is reworded in this phase:
  spectators stay backward compatible; players need a session, and packets only add fields.
- `SecretHitlerGame` and `CpuPlayer` pin no `serialVersionUID`: no new field or non-private method
  on either. Accounts live in `Lobby` and the server.
- `Lobby` pins its `serialVersionUID`. Backups written before this phase must still load without an
  error (see Backups).
- No new art: the Discord button is a text button in today's style (Lucide has no brand icons, and
  no Discord logo is added).
- The repo is public. The environment variables are named in the docs; their values, the host's
  address and the Discord application's settings are not.
- Every layout test that passes today still passes: the login page and the lobby fit one screen at
  every tested size, with 44px targets on phones and 16px field text.
- No new runtime dependency on the server: Java 17's `java.net.http.HttpClient`, `SecureRandom`,
  `MessageDigest` and the existing `sqlite-jdbc` cover it.

## Approaches

Three choices shaped this design. The user picked each.

**Where accounts live in a lobby.**

- A. Keep `Lobby` keyed on names and carry each connection's account beside them; a rename moves the
  name's entries (place, portrait, preferred portrait, rejoin key, pending removal) under the lock.
  Smallest change to the race-hardened join code; one new backed-up field.
- **B. Re-key `Lobby` on account IDs; names are only for display (picked).** A rename moves nothing:
  packets look the name up. Cleaner over time, at the cost of rewriting most of `Lobby`'s join,
  rejoin and grace-window logic and its backed-up fields, converting older backups, and proving the
  race fixes again.

**Where sessions live.**

- **SQLite, next to the accounts (picked).** The server restarts with every daily image update and
  restores lobbies from the backup, so players reconnect to their seats still signed in.
- In memory: no table, but every restart signs everyone out, and a player mid-game would have to go
  through Discord again to get back to their seat.

**How the OAuth flow is built.**

- **By hand, with Java's own HTTP client (picked).** Three requests to Discord, about a hundred lines,
  no new dependency.
- An OAuth library (pac4j and the like): a large dependency that brings its own session store,
  which would fight the SQLite one.

## Design

### Data

Two new tables in the SQLite file at `DATABASE_PATH`, beside `backup`, created if missing at start:

- **`accounts`**: `id` (text, primary key: the Discord user ID, or `test-…` for a test account),
  `discord_username` (text), `discord_avatar` (text or null: Discord's avatar hash), `username`
  (text or null until chosen), `username_key` (text or null, unique: the name in lower case, see
  Usernames), `created_at` and `updated_at` (epoch ms).
- **`sessions`**: `token_hash` (text, primary key: SHA-256 of the cookie's token, hex), `account_id`
  (text), `expires_at` (epoch ms), `created_at` (epoch ms).

The Discord username and avatar are refreshed at every Discord sign-in. Nothing from Discord ever
fills `username`.

Without `DATABASE_PATH` (local runs, most tests), accounts and sessions live in an in-memory SQLite
database kept open for the server's life, and are gone at restart. Lobby backups stay off, as today.

### Usernames

The server applies the page's rules itself and never trusts the page:

- **Normalized** as `normalizeName` does (`frontend/src/lobby/normalizeName.ts`): each run of
  whitespace becomes one space, then the ends are trimmed. "Whitespace" is exactly what JavaScript's
  `\s` matches (Unicode spaces such as U+00A0 and U+3000 included), not Java's ASCII-only `\s`, so
  a name means the same on both sides.
- **At most 12** UTF-16 code units (`MAX_NAME_LENGTH`), counted as JavaScript's `length` counts
  them. Not blank.
- **Unique ignoring case.** `username_key` is the normalized name lowered with `Locale.ROOT`, under a
  unique index, so two accounts saving "alice" and "Alice" at once cannot both win.
- **Not a CPU player's name.** `Bot` followed by a space and digits (any case) is refused, since
  `Lobby.startNewGame` names CPU players `Bot 1`, `Bot 2`, ….
- **Not while seated in a running game** in any lobby (see Renaming).

Messages, used by the page and the server alike:

| Case | Message |
|---|---|
| Taken | Another player already has that name. |
| A CPU player's | Names like "Bot 1" are kept for CPU players. |
| In a game | You can't change your name during a game. |

A blank or over-long name never reaches the server from the page (the field stops at 12 and SAVE
is off while blank); the server answers 400 for one.

### Signing in with Discord

1. The page links to **`GET /auth/discord`**, with `?lobby=CODE` when a lobby code is in hand (the
   code field, or the lobby a spectator is watching).
2. The server makes a random `state` (32 bytes, URL-safe base64) and sets it, with the lobby code,
   in a short-lived cookie (`oauth-state`: HttpOnly, SameSite=Lax, 10 minutes, path `/auth`). It
   redirects to `https://discord.com/oauth2/authorize` with `response_type=code`, the client ID,
   `scope=identify`, the redirect URL and the state.
3. Discord sends the person back to **`GET /auth/discord/callback?code=…&state=…`**. The server
   checks the state against the cookie and clears the cookie, then:
   - trades the code for a token (`POST https://discord.com/api/oauth2/token`, form-encoded, with the
     client ID and secret),
   - reads the user (`GET https://discord.com/api/users/@me`: `id`, `username`, `avatar`),
   - creates or updates the account, starts a session (below), and
   - redirects to `/`, or `/?lobby=CODE` when the state cookie carried a code.

   The token is used for that one read and never stored.
4. Any failure (the person pressed Cancel at Discord, a missing or wrong state, Discord down or
   slow, an unexpected answer) redirects to `/?signin=failed` (with `&lobby=CODE` when there was
   one), and the page shows "Signing in with Discord failed. Please try again." under the button.
   The reason is logged without the code, the token or the secret.

Only a lobby code ever goes into the redirect, checked as 4 letters from the code alphabet, so the
callback cannot be made to redirect anywhere else.

Requests to Discord time out after 10 s. They run on the request's thread; no lock is held.

The Discord endpoints' base URLs are fields the tests can point at a fake Discord server (a small
Javalin app on a free port), so the whole flow is tested without Discord.

### Sessions

- **The cookie.** `session`: a random 32-byte token, URL-safe base64; HttpOnly, SameSite=Lax, path
  `/`, Max-Age 30 days. `Secure` when `DISCORD_REDIRECT_URI` starts with `https:` (TLS ends at the
  proxy, so the server cannot tell from the request).
- **Stored hashed.** The database keeps only the token's SHA-256, so a copy of the database file
  signs no one in.
- **30 days, renewed by use.** Any request that reads a session (the WebSocket connect,
  `/check-login`, `/me`) extends a session with less than 29 days left back to 30 days, and sets the
  cookie again: at most one write a day per session. An expired session counts as none.
- **Swept.** The 60 s timer that sweeps lobbies also deletes expired sessions.
- **Sign-out** (`POST /auth/sign-out`) deletes the row and clears the cookie. Sockets already open
  stay open until they close; the next connection needs a session.

### Test sign-in

With `TEST_SIGN_IN=true`, the server adds **`POST /auth/test-sign-in`**, with a JSON body
`{"id": "3", "username": "Long Guest 3"}` (the username optional). It creates or updates the
account `test-3` (Discord username `test-3`), sets the username if one is given (under the usual
rules: a taken name is 409), starts a session and sets the cookie, as the Discord callback does.

- `runLocal` (`game.ApplicationTest`) turns it on, and so does Playwright's `webServer` env.
- The image never sets it. The server logs a warning at start while it is on, and `/me` reports it,
  so the login page can show a TEST SIGN-IN button beside the Discord one (local runs only). Each
  press signs the browser in as a new test account (a random ID), which then chooses a name. One
  browser holds one session, so more players locally need private windows or other browsers;
  `DEVELOPMENT.md` says so.
- A test account can never become a Discord one: their IDs cannot collide (`test-` is not a
  Discord ID).

### HTTP endpoints

| Endpoint | Answer |
|---|---|
| `GET /auth/discord[?lobby=CODE]` | 302 to Discord. 503 when Discord sign-in is not configured. |
| `GET /auth/discord/callback` | 302 to `/` or `/?lobby=CODE`, with the session cookie; on failure `/?signin=failed[&lobby=CODE]`. |
| `POST /auth/sign-out` | 204, the cookie cleared (also when there was no session). |
| `POST /auth/test-sign-in` | Only with `TEST_SIGN_IN=true` (404 otherwise). 200 `/me`'s body, with the cookie. |
| `GET /me` | 200 `{"signedIn": false, "discord": bool, "testSignIn": bool}`, or `{"signedIn": true, "id", "username" (null until chosen), "discordUsername", "test": bool, "discord", "testSignIn"}`. |
| `POST /me/username` | JSON `{"username"}`. 200 `{"username"}` (normalized); 400 blank, too long or a CPU player's name; 401 no session; 403 seated in a running game; 409 taken. The body of an error is its message. |
| `GET /new-lobby` | As today for a signed-in account with a name; 401 "Sign in to play." otherwise, before the sweep runs or a lobby is made. |

The two `POST`s that change state (`/auth/sign-out`, `/me/username`) need `Content-Type:
application/json`, which a form on another site cannot send without the browser asking first.

`/check-login`, `/new-lobby` and `/ping` keep their paths. The dev server's proxy
(`frontend/vite.config.ts`) adds `/auth` and `/me`.

### Joining and playing

**Who a socket is.** A player's `/game` socket (no `spectator=true`) is the account of its
`session` cookie, which browsers send on a same-origin WebSocket handshake. `onWebsocketConnect`
looks the session up before it takes the lobby's lock (a database read never happens under a lobby
lock), then:

- no session, an expired one, or an account with no username yet: closed with 1002 and "Sign in
  and choose a name to play.", before the lobby is touched;
- otherwise `Lobby.joinRefusal(accountId, rejoinKey)` and `addUser` under the lock, as today.

The `name` query parameter is ignored: the name is the account's. `rejoinKey` works as today, per
account.

**`/check-login`** for a player takes only `lobby` (a `name` is ignored) and reads the session:

| Status | When | The page says |
|---|---|---|
| 401 | No session, or no username yet | Sign in to play. |
| 404 | No such lobby, or the sweep closed it | The lobby could not be found. |
| 403 | The account already has a live connection in this lobby | You're already in this lobby in another tab or window. |
| 489 | Full, and not taking back their own seat | The lobby is currently full. |
| 488 | In a game, and not one of its players | The lobby is currently in a game. |
| 200 | It may join (or rejoin) | |

The spectator check (`spectator=true`) is unchanged and needs no session.

**Another site's page cannot open a player's socket.** Outside debug mode, a player's socket whose
`Origin` header is missing or is not the server's own origin is refused (1002). Browsers always send
one; the tests' raw sockets send the server's. The server's own origin is the
origin of `DISCORD_REDIRECT_URI` when it is set, and otherwise the request's `Host`. SameSite=Lax
already keeps the cookie off such a handshake in current browsers; the `Origin` check does not rely
on it.

**Messages.** A player's message still carries `name` (the page keeps sending it), but the server
no longer reads it: the player is the connection's account, and in a game its seat's name (below).
`verifyIsPresident`, `registerVote` and the rest get the seat's name from the connection. A
connection not in the lobby is closed as today.

**Packets.** Unchanged in shape: `usernames` and the `icon` map stay keyed by name, and game packets
by seat name. Every packet a player gets adds **`you`**: their own name (in a game, their seat's
name), so the page always knows which row is theirs, even right after a rename made in another tab.
Spectators' packets get no `you`.

**One account, several places.** An account may be in several lobbies at once (as a name can be
today). A second socket for the same account in the same lobby is refused, unless it brings the live
connection's rejoin key, in which case it takes that connection's place (as today for a name).

### The lobby keyed on accounts

`Lobby` keys everything on the account ID and keeps names only to show them:

| Today | Becomes | Backed up |
|---|---|---|
| `userToUsername` (connection → name) | connection → account ID | no |
| `activeUsernames` (join order, host first) | account IDs in join order | no |
| `usernameToRejoinKey` | account ID → rejoin key | no |
| `pendingRemovals` (name → removal) | account ID → removal | no |
| `usernameToIcon` | account ID → portrait | yes |
| `usernameToPreferredIcon` | account ID → preferred portrait | yes |
| `usersInGame` (names) | the running game's seats: account ID → seat name | yes |
| (none) | account ID → current name, for the accounts in the lobby | no |

Every rule keeps its meaning with "account" for "name": the grace window
(`PLAYER_TIMEOUT_IN_SEC`), the single pending removal and its cancelling (`LobbyGraceWindowTest`,
`LobbyRejoinTest`), the rejoin key's takeover (`RejoinServerTest`), the check-and-add in one step
under the lock (#43), seating only live connections at game start (`LobbyStartTest`), a rejoin after
the window or a restore going to the end of the order (#41), and a closed lobby taking no one (#64).
`joinRefusal`'s order becomes `CLOSED`, `NO_ACCOUNT` (a null or blank account ID, which the handler
never passes: the guard #63 added for a blank name, so `addUser` enforces it too), `ALREADY_IN` (was
`NAME_TAKEN`), `FULL`, `IN_GAME`.

**Names in the lobby.** `addUser(ctx, accountId, name, rejoinKey)` records the account's current
name. The lobby packet lists the names of the accounts in join order, and the `icon` map keyed by
those names. A restored lobby has no one in it (the join order and names are transient), so names
come back as players do.

**Game start.** `startNewGame` seats each live account under its current name and records the seats
(account ID → seat name). `SecretHitlerGame` gets the seat names as today. CPU players are named
`Bot 1`, `Bot 2`, …, skipping any seat name already taken (none can be, as account names cannot look
like a CPU player's, but the check stays). The seat names do not change until the game ends, and a
player who rejoins is matched by account to their seat.

**Seats for #31.** While a game runs, and in its backup, `Lobby` knows the account behind every human
seat; CPU seats have none. #31 reads it when the game ends.

### Renaming

`POST /me/username` (from the login page or the lobby):

1. Validates and normalizes the name (Usernames).
2. Refuses (403) if the account holds a seat in a running game in any lobby.
3. Saves it (409 if the unique index refuses it).
4. In every lobby the account is in, updates its name and sends every player and spectator a lobby
   packet, so the roster changes everywhere at once.

A rename never interleaves with a game start or a join in a lobby the account is in: either the game
seats the new name, or the rename is refused because the account is now seated; and a join never
records a name the account no longer has (one read just before a rename saved, say). The builder
picks the mechanism (for example, one lock that a rename, every join and every game start take
before any lobby's lock, always in that order, with the join's name read under it).

The game page has no rename, and a rename never changes a seat's name.

**Sounds.** The lobby plays `playerJoined` when a name appears that the last packet did not have
(`lobbySounds` in `frontend/src/sound/soundEvents.ts`). A rename is not a join: when the list keeps
its length and only one place changes its name, no sound plays. A rename keeps the account's place
in the join order, so this tells the two apart.

### Backups

Lobby backups keep their table and format; `Lobby`'s fields change as above. `Lobby` keeps its
pinned `serialVersionUID`, so a backup written before this phase still deserializes: fields it has
that `Lobby` dropped are ignored, and the new fields come back null. `loadDatabaseBackup` then treats
such a lobby as follows:

- **Not in a game:** kept, with empty account maps. It has no one in it anyway (the join order is
  transient), and its code and invite link go on working.
- **In a game:** dropped, with a log line naming its code. Its seats belong to typed names, which no
  account can take back.

`DatabaseBackupTest`'s fixture from before spectators (`backup-before-spectators.db`: an idle lobby
`WXYZ` and a CPU-only game `ABCD`) checks both: `WXYZ` loads, `ABCD` is dropped, and the load does
not throw. A new round-trip test checks that the seats' accounts survive a backup.

### The login page

`LoginScreen` (`frontend/src/login/`), with the account card in place of YOUR NAME (see
`login-phone.jpg`):

- **Before `/me` answers:** the card is blank and kept at its signed-in height; JOIN and CREATE LOBBY
  are off. If `/me` fails, the card says the server could not be reached (`CONTACT_ERROR`).
- **Signed out:** YOUR ACCOUNT, with SIGN IN WITH DISCORD (a link to `/auth/discord`, carrying the
  code field's lobby code) and "Sign in to play. Anyone can watch." JOIN is off, with the hint "JOIN
  needs you signed in · WATCH needs only the code"; CREATE LOBBY is off; WATCH works as today. When
  Discord is not configured, the button is off and the line says "Sign-in is not set up on this
  server." With test sign-in on, a TEST SIGN-IN button stands beside it.
- **Signed in, no name yet:** the CHOOSE A NAME prompt opens by itself over the page: "Others see it
  in lobbies and games. Up to 12 characters.", the name field, CONTINUE and SIGN OUT. It cannot be
  dismissed any other way. JOIN and CREATE LOBBY stay off until a name is saved.
- **Signed in:** YOUR NAME, the name, CHANGE NAME (grey), and "Signed in with Discord as
  rowan.d · Sign out", with the Discord username and nothing else from Discord. A test account
  reads "Signed in with a test account (test-3) · Sign out". Sign out is a button styled as a link,
  a 44px target on phones. JOIN needs the code; CREATE LOBBY is on.
- **CHANGE NAME** opens the same prompt titled CHANGE NAME, filled with the name, with SAVE and
  CANCEL. The field takes `typedName` as today. An error (table in Usernames) shows under the field;
  the prompt stays open.
- **After `/?signin=failed`:** the card shows the failure line under the button.
- An invite link (`?lobby=CODE`) fills the code field as today, and signing in from there comes back
  with the code still in it.

The prompt is `NamePrompt` (`frontend/src/custom-alert/`), grown out of `PlayInsteadPrompt`, which
goes: the same look, field and single-press guard, with its title, text and buttons as props.

The `name` cookie goes. `lobby` and `spectator` stay. The longest Discord username is 32
characters; at 320px the "Signed in with Discord as …" line may wrap to a second line, and the page
still fits the screens it fits today.

### The lobby

`LobbyScreen` (`frontend/src/lobby/`, see `lobby-phone.jpg`):

- **A player** (the host too) gets CHANGE NAME, CHANGE LOOK, WATCH INSTEAD and LEAVE LOBBY: a
  wrapping centred row on desktop and in tall windows, two rows of two on phones. With ten players
  and the longest status line, the lobby still fits every size it fits today (the builder finds the
  room on phones if the extra row does not fit). CHANGE NAME opens the CHANGE NAME prompt.
- **A spectator who is not signed in** gets SIGN IN TO PLAY (in place of PLAY INSTEAD) and LEAVE
  LOBBY. It goes to `/auth/discord?lobby=CODE`. The `spectator` cookie brings the page back to
  watching the same lobby, now signed in, with PLAY INSTEAD ready; a first sign-in opens CHOOSE A
  NAME there.
- **A spectator who is signed in** gets PLAY INSTEAD, which takes a seat under the account's name at
  once: `/check-login`, then the player socket, with no prompt. With no name yet, CHOOSE A NAME opens
  first and the seat is taken after CONTINUE. A full lobby keeps today's note, and `seatPending`
  keeps sending the person back to watching if the seat goes between the check and the join.
- The roster marks the viewer's own row by the packets' `you`.

### The game page

No change. There is no rename in a game.

### Configuration and deploy

New environment variables (`ApplicationConfig`):

| Variable | Meaning |
|---|---|
| `DISCORD_CLIENT_ID` | The Discord application's client ID |
| `DISCORD_CLIENT_SECRET` | Its client secret: never committed |
| `DISCORD_REDIRECT_URI` | `https://<host>/auth/discord/callback`, as registered with the application |
| `TEST_SIGN_IN` | `true` turns on the test sign-in (never in the image) |

Discord sign-in is on when the first three are set. With none of them and no test sign-in, the
server logs a warning at start that nobody can play.

The README's hosting section says to create a Discord application, register the redirect URL and
set the three variables, without naming any real host. `DEVELOPMENT.md` covers local runs: `runLocal`
has test sign-in; to try Discord locally, register `http://localhost:3000/auth/discord/callback`.

Setting the variables on the home server is the user's job, outside this repo.

### Tests

Backend (JUnit 4):

- `UsernamesTest`: normalizing matches the page's rules, Unicode spaces included; 12 code units;
  the CPU-player pattern; the case-insensitive key.
- `AccountStoreTest` (in-memory SQLite): creating and updating a Discord account; the username's
  uniqueness ignoring case, including two saves at once; sessions stored hashed; expiry, renewal at
  most daily, and the sweep; sign-out.
- `DiscordSignInTest` (a fake Discord server): the happy path with and without a lobby code; a wrong
  or missing state; Cancel at Discord; Discord failing or timing out; no redirect except a lobby
  code; the token and secret never logged.
- `AuthRoutesTest`: `/me` signed in and out; every `/me/username` status; sign-out; test sign-in is
  404 unless turned on; the JSON content type on both `POST`s; `/new-lobby` 401 without an account
  or a name, and no lobby made.
- `Lobby*Test`: every existing lobby test rewritten on account IDs, still failing without the fix it
  guards; `LobbyBlankNameTest` becomes the `NO_ACCOUNT` test.
- `LobbyRenameTest`: a rename shows in every packet of every lobby the account is in; refused while
  seated; a rename against a game start in the same lobby (both orders) never seats a stale name,
  and against a join never records one; the host stays the host.
- Server tests (`RejoinServerTest`, `SpectatorServerTest`, `TermTimerServerTest`,
  `LobbyTimeoutServerTest`): connect with session cookies; a player socket with no session, an
  expired one or no username is refused; a spectator needs none; another origin is refused; `you` in
  every player packet and in no spectator packet.
- `DatabaseBackupTest`: as in Backups.

Frontend (Vitest): `/me` parsing and the account calls; `NamePrompt` (from `PlayInsteadPrompt`'s
tests); `LoginScreen` in each state; `LobbyScreen`'s buttons per viewer; `App`: the first sign-in
prompt, JOIN off until a name, PLAY INSTEAD with no prompt, SIGN IN TO PLAY's link, `you` marking the
row after a rename; `lobbySounds`: a rename plays no sound, a join still does.

Browser (Playwright):

- `webServer` sets `TEST_SIGN_IN=true`. A helper signs a page in (`page.request` to the test
  sign-in, so the page's context holds the cookie), and the raw-socket players of `joinGuests`,
  `driveGame.ts` and the rest sign in with `fetch` and send the cookie and an `Origin` on their
  socket (Node's WebSocket takes a `headers` option; failing that, the `ws` package as a dev
  dependency). `driveGame.ts` makes its lobby with a signed-in `fetch` (`/new-lobby` needs one).
- Tests run in parallel against one server, and names are unique across accounts, so each test's
  accounts and names are its own (a per-test suffix that keeps the twelve characters the layout
  tests need).
- Every existing spec passes on accounts.
- New `accounts.spec.ts` (`desktop` and `phone-360`): signed out (JOIN and CREATE LOBBY off, WATCH
  works, SIGN IN WITH DISCORD's link carries the code); the first sign-in prompt; renaming on the
  login page, with a taken name; a rename in the lobby showing to another player at once; no rename
  in a game, and the server's 403; a signed-out spectator's SIGN IN TO PLAY link; a signed-in
  spectator's PLAY INSTEAD with no prompt.
- The login page and lobby layout tests (`no-scroll.spec.ts`, `phone.spec.ts`) cover the signed-in
  and signed-out pages, the four lobby buttons, a 32-character Discord username and 44px targets
  for Sign out and CHANGE NAME, at every size they cover today.

## Acceptance

- Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four
  Playwright projects.
- Signed out, a person can watch but cannot join, create a lobby or take a seat.
- With test sign-in, a player chooses a name, plays a game, renames between games, and the rename
  shows in the lobby at once; a rename during the game is refused.
- A game's seats map to accounts, before and after a backup round trip.
- `CLAUDE.md`, `README.md` and `DEVELOPMENT.md` describe accounts, sign-in, the variables and the
  test sign-in.
- The user signs in with Discord on the deployed build and plays a game. (The user's box.)

## Known limits

- A game running when this phase deploys is dropped at the first start, since no account can take
  its seats. Deploy between games.
- Anyone with a Discord account can sign in.
- Signing out leaves sockets already open until they close.
- There is no way to delete an account.
- The typed name the `name` cookie remembered is forgotten; each person chooses a name once.
- One browser is one account: every tab shares the session cookie (and Discord's own sign-in), so
  two people can no longer play from two tabs of one browser.
- Rolling back to an image from before this phase: that server ignores the new tables, but a lobby it
  restores from a backup this phase wrote fails on every join until it times out (10 minutes). New
  lobbies work at once; deleting the backup file clears the old ones sooner.

## Left to the builder

- Class and package names (`server.accounts` or similar), and how the store holds its connection
  (one connection with a busy timeout, its access serialized).
- How a rename is kept from interleaving with a join or a game start.
- Whether to revoke the Discord token after reading the user (best effort, its failure ignored).
- Where the phone lobby finds room for the second row of buttons, if it needs to.
- Whether raw test sockets send the cookie through Node's WebSocket or the `ws` package.
- The TEST SIGN-IN button's look on the login page (local runs only).
- Messages not given here, in the voice of the ones that are.
