# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A personal, self-hosted fork of [`ShrimpCryptid/Secret-Hitler-Online`](https://github.com/ShrimpCryptid/Secret-Hitler-Online),
a web adaptation of the Secret Hitler board game. Licence: CC BY-NC-SA 4.0 (`LICENSE`); the README
keeps credit to upstream and to the board game's creators.

- Remotes: `origin` is the fork (`jussaw/Secret-Hitler-Online`), `upstream` is the original.
- Default working branch: `development`. `main` is stale and not worked on.

## Layout

- `backend/`: Java 17, Gradle (7.4.2 wrapper), Javalin 5. Game rules and CPU players in
  `src/main/java/game/`; HTTP endpoints (`/check-login`, `/new-lobby`, `/ping`, `/api/stats/games`
  and the account routes below), the `/game` WebSocket, lobbies and state serialization in
  `src/main/java/server/`, accounts in `src/main/java/server/accounts/` and game records in
  `src/main/java/server/stats/` (below). JUnit 4 tests in `src/test/java/game/` and
  `src/test/java/server/`. Lobbies are backed up to a SQLite file at `DATABASE_PATH`, which also
  holds the accounts and sessions and the game records (unset = no backup, and the accounts and the
  records each in an in-memory database that is gone at restart). `main` first puts that file in WAL
  mode, before anything else opens it (`useWriteAheadLog`: `PRAGMA journal_mode = WAL` with a busy
  timeout of 0, tried again every 100 ms while the file is busy or locked, for `WAL_TIMEOUT_MS`, 5
  s; any other failure gives up at once, and giving up logs one error and leaves the file in its old
  mode, so a busy file never keeps the server from starting: `DatabaseWalTest`), so a backup's read
  never blocks a write; all three connections (the backup's, the account store's and the game
  store's) keep their 5 s busy timeout. `startServer` starts the app and then logs
  `startupLine(port)`, "Secret Hitler Online is listening on port <port>.", the server's own line
  (not Javalin's, which a dependency update could change) that `devops/restore-db.sh` waits for
  (`StartupLineTest`). The server also serves the built frontend from the
  classpath directory `/public`, which `processResources` fills from `frontend/dist` when it exists;
  CORS is enabled only in debug mode. `createApp()` is `createApp("/public")`; `createApp(frontendDir)`
  serves that classpath directory when it has an `index.html` and then adds Javalin's single-page
  fallback for `/stats` (`config.spaRoot.addFile`), so a GET of any path starting `/stats` (a prefix
  match: `/statsx` too) that no route or file answered, whose `Accept` has `text/html` or `*/*` or is
  empty, gets `index.html`: a reload or a link to any stats page works. Routes always answer first,
  other paths stay 404, and without a frontend there is no fallback (`StatsFallbackTest`, over the
  test classpath's `/spa-test`). Playing needs an account, made by signing in with Discord;
  watching needs none. `server.accounts` has `Usernames` (the page's name rules, which the server
  applies itself, with the messages both show: `normalize` makes each run of what JavaScript's `\s`
  matches one space and trims, a name has at most 12 UTF-16 code units, `key` lowers it with
  `Locale.ROOT` for uniqueness, and `Bot` with a number is a CPU player's), `Account` (`id`, the
  Discord user ID or `test-<id>`; `discordUsername` and `discordAvatar`; and `username`, null until
  chosen, which nothing from Discord ever fills), `AccountStore`, `AuthRoutes` and `DiscordSignIn`.
  `AccountStore` keeps two tables beside `backup`, `accounts` (a unique index on `username_key`
  decides two saves of one name at once) and `sessions`, on one connection with a 5 s busy timeout
  (the backup's connection waits 5 s too), every method synchronized. A session is the `session`
  cookie (HttpOnly, SameSite=Lax, path `/`, Secure when `DISCORD_REDIRECT_URI` starts with
  `https:`): a random 32-byte token, of which the database keeps only the SHA-256, so a copy of the
  file signs no one in. It lasts 30 days: a read with under 29 days left extends it back to 30
  (`AccountStore.lookup`, so at most one write a day), and the 60 s timer deletes the expired rows
  (`sweepExpiredSessions`). Every HTTP read that finds a session (`AuthRoutes.signedIn`: `/me`,
  `/me/username`, `/check-login` and `/new-lobby`) sets the cookie again with the time the row has
  left, since a WebSocket handshake renews the row but cannot set a cookie (Javalin runs no HTTP
  before-handler on the upgrade). A cookie that matches no live session (junk, empty, signed out,
  expired) is signed out, never an error. `GET /me` says who is signed in (`signedIn`, `id`,
  `username`, `discordUsername`, `test`) and which sign-ins the server has (`discord`,
  `testSignIn`); `POST /me/username` renames (400 for a name the rules refuse, 401, 403 while seated
  in a running game, 409 taken, each with its message as the body); `POST /auth/sign-out` clears
  the cookie, then deletes the row, so a store that fails (a 500) still signs the browser out
  (`AuthRoutesTest.aFailedSignOutStillClearsTheCookie`), and sockets already open stay open.
  `/auth/discord[?lobby=CODE]` keeps a one-use state, with the lobby code, in the `oauth-state`
  cookie (path `/auth`, 10 minutes) and sends the browser to Discord (scope `identify`);
  `/auth/discord/callback` checks the state, trades the code for a token and reads the user (each
  call to Discord within one 10 s deadline, `DiscordSignIn.TIMEOUT`), makes or updates the account,
  starts a session and goes to `/` or `/?lobby=CODE`, and any failure goes to `/?signin=failed`. The
  code, the token and the client secret are never logged or stored, and only a 4-letter code from
  the code alphabet ever reaches a redirect (`DiscordSignInTest`, against a fake Discord:
  `authorizeUrl` and `apiBase` are fields).
  Discord sign-in is on when `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` and `DISCORD_REDIRECT_URI`
  are set (`ApplicationConfig.discordConfigured`); `/auth/discord` is 503 otherwise.
  `TEST_SIGN_IN=true` adds `POST /auth/test-sign-in` (JSON `{"id", "username"}`, 404 without it),
  which signs in as `test-<id>`, named if a name is given; `runLocal` (`game.ApplicationTest`) and
  the browser tests turn it on, and the image and CI's image job never do. The server warns at start
  while it is on, and when nobody can sign in at all. The three POSTs need `Content-Type:
  application/json` (415 otherwise), which a form on another site cannot send without the browser
  asking first. `/new-lobby` answers 401 "Sign in to play." to a request without a signed-in account
  with a name, before the sweep runs or a lobby is made. A player's `/check-login` takes only
  `lobby` and answers, in this order: 400 (no lobby), 401 "Sign in to play." (no session, or no name
  yet), 404, 403 "You're already in this lobby in another tab or window." (the account has a live
  connection there, even in a full lobby or a game), 200 (taking back its own seat), 489 (full), 488
  (in a game) and 200 (`AccountJoinServerTest.checkLoginStatuses`). A player's `/game` socket is the
  account of its `session` cookie, which browsers send on a same-origin handshake (`signedInPlayer`,
  read before any lock), and the `name` query parameter is ignored. No session, or an account with
  no name yet, is closed with 1002 "Sign in and choose a name to play." before any lobby is touched;
  outside debug mode, so is an `Origin` that is missing or not the server's own, which is the origin
  of `DISCORD_REDIRECT_URI` when it is set and otherwise the `Host`'s (`sameOrigin` reads both by
  hand, `SameOriginTest`), with "Connections from another site are not allowed.". A player's message
  still carries `name`, which the server never reads: it acts as the connection's account
  (`Lobby.accountOf`), under its seat's name in a game (`Lobby.seatName`), and a connection that is
  not a player's in the message's lobby is closed (`AccountJoinServerTest`).
  `SecretHitlerServer.ACCOUNTS_LOCK` is taken by every join, every rename (`renameAccount`) and
  every game start (`startGame`, the start-game command's only path), always before any lobby's
  lock, and no database call runs under a lobby's lock. A rename is refused if the account is seated
  in a running game in any lobby; otherwise it saves the name, then renames the account in every
  lobby it is in and sends each lobby its state. So either a game seats the new name or the rename
  finds the seat and is refused (`RenameServerTest.renameAgainstGameStart`), and a join, which reads
  the account's name again under the lock (`currentName`), never records a name a rename has just
  replaced (`AccountJoinServerTest.aJoinNeverRecordsAStaleName`). `Lobby` keys everything on the
  account ID and keeps names only to show them. `userToAccount` (connection to account),
  `activeAccounts` (join order, the host first), `accountToName` (each account's current name, which
  packets show), `accountToRejoinKey` and `pendingRemovals` are transient; `accountToIcon`,
  `accountToPreferredIcon` and `gameSeats` (the running game's human seats, account ID to seat name,
  which `seatAccounts()` turns round for game records, #31) are backed up. `updateAllUsers` clears
  `gameSeats` once it has sent a finished game's last packet, so `seatAccounts()` is empty from
  then on: the game's record (below) reads the seats just before that clear. `startNewGame` seats
  each live account under its current name, which the seat keeps until the game ends, and
  `Lobby.rename` (refused while seated) changes only the name packets show (`LobbyRenameTest`).
  Packets keep their shape (`usernames` and `icon` by name, game packets by seat name), and every
  player's packet adds `you`, their name or, in a game, their seat's; a spectator's gets none.
  Every game packet, a player's or a spectator's, the victory packet included, carries `gameId`,
  the running game's record ID (`Lobby.gameId()`, not a secret): `GameToJSONConverter.convert(game,
  name, gameId)` and `convertForSpectator(game, gameId)` put it in (org.json leaves a null out),
  and `Lobby.updatePlayer` and `updateSpectator` pass it (`LobbyGameIdTest`; `SpectatorStateTest`
  counts it among the keys every packet has).
  Spectators connect with `/game?lobby=CODE&spectator=true`, with no `name` and no session (checked
  first with `/check-login?lobby=CODE&spectator=true`). In `Lobby` they are a set
  of connections with no seat, name or icon: never counted as users, never backed up, and they do
  not keep a lobby from timing out. Secrets are filtered on the server only:
  `GameToJSONConverter.convertForSpectator` sends no role, hand or peek until the game is over.
  Every command from a spectator except `ping` and `get-state` is logged and dropped, and every
  packet, lobby or game, carries `spectatorCount`. `Lobby` pins its `serialVersionUID`, so backups
  written by earlier releases still load (`DatabaseBackupTest`). A backup from before accounts
  loads its name-keyed maps into no field, as `Lobby` no longer has those, and `readObject` makes
  the account maps that come back null and marks the lobby (`wasBackedUpBeforeAccounts`):
  `loadLobbies` keeps such a lobby if it is idle and drops it, logging its code, if it is in a
  game, whose seats belong to typed names that no account can take back
  (`aBackupFromBeforeAccountsKeepsIdleLobbies`; `seatsKeepTheirAccountsThroughABackup` checks that
  a game's seats keep their accounts). A player whose connection closes
  keeps their place in `activeAccounts` and their portrait for a 3 s grace window
  (`PLAYER_TIMEOUT_IN_SEC`), counted from that disconnect (in a game the seat itself is kept for
  the whole game). The removal a disconnect schedules is the account's only pending one
  (`pendingRemovals`), a new connection for the account calls it off, and it runs under the
  lobby's lock and does nothing unless it is still the pending one. So a removal never undoes a
  rejoin under way, and one left from an earlier drop never cuts a later window short, even if it
  fell due during a rejoin (`LobbyRejoinTest`, `LobbyGraceWindowTest`). `Lobby.startNewGame` seats
  only players with a live connection: an account still inside the 3 s grace window after a
  disconnect is dropped from `activeAccounts`, `accountToName` and `accountToIcon` (its preferred
  portrait is kept), so no seat is made for someone who cannot take it, and a start that fails
  leaves the lobby untouched (`LobbyStartTest`). A player who rejoins a running game after that
  window, or after a restore from a backup (`activeAccounts` is transient, so a restored lobby has
  no one in it), goes back at the end of `activeAccounts`, and to their seat by account: the lobby
  counts them at once, and lists and seats them when the game ends. So a host back after the
  window is host no longer, and after a restore the first player back is the host. One back inside
  the window keeps their place (`LobbyRejoinTest`,
  `AccountJoinServerTest.aRestoredGameIsRetakenByAccount`).
  While a game waits in `POST_LEGISLATIVE` for a human president, `Lobby` runs
  the END TERM countdown (`TermTimer`, `END_TERM_TIMER_IN_SEC`, 10 s): it starts with the first
  game packet that shows END TERM, and at zero it ends the term as END TERM would (one daemon
  thread keeps time for every lobby and hands each end to a pooled thread, so a lobby busy sending
  delays no other). The president's `pause-term-timer` and `resume-term-timer` pause it and
  run it on from the time left; every game packet carries `termTimer` (`remainingMs` and `paused`)
  while there is one. CPU presidents get none, since they end their own terms. It is transient, so
  a lobby restored from a backup starts a fresh countdown with its first packet. An END TERM, pause
  or resume from the president whose term the countdown has just ended is dropped instead of
  refused (`Lobby.isLateForTerm`), so that race never closes their socket (`LobbyTermTimerTest`,
  `TermTimerServerTest`). `SecretHitlerGame` and `CpuPlayer` do not pin a `serialVersionUID`, so a
  new field or non-private method on either would stop older backups loading: game-side state that
  is not part of the rules (accounts and seats included) belongs in `Lobby`. A player's `/game`
  query may carry `rejoinKey`, a random key the page keeps for its lifetime (sent to no client and
  not backed up). A connection that brings the key its account's live connection was opened with
  takes that connection's place, keeping the seat and portrait, and the old one is closed with
  4001 (`CLOSE_REPLACED`). So a page whose network dropped gets back in at once, although the
  server sees a dead socket close only at its 30 s idle timeout. Without the key (another tab, or
  an older client), a second connection for an account live in the lobby is refused with "You're
  already in this lobby in another tab or window." (`RejoinServerTest`,
  `AccountJoinServerTest.aSecondTabIsRefused`). `Lobby.joinRefusal` is the one rule for who may
  join, and `Lobby.addUser` enforces it too: `CLOSED`, `NO_ACCOUNT`, `ALREADY_IN`, `FULL` and
  `IN_GAME`, in that order. `onWebsocketConnect` reads the account's name, asks it and adds the
  connection in one step under `ACCOUNTS_LOCK` and the lobby's lock, so of two connections arriving
  at once for one account or for the last seat, the second is refused with 1002 and the reason it
  would get had it arrived later, not failed with 1011 by the add (`RejoinServerTest`). After
  `CLOSED` (below), its first refusal is a null or blank account ID (`NO_ACCOUNT`, "Sign in and
  choose a name to play."), which the handshake never passes, and `addUser` refuses a blank name
  too: a socket the handler closed but went on to add would hold a seat for good, as its close came
  before the add (`LobbyNoAccountTest`, `RejoinServerTest.aBlankNameIsRefusedAndNeverJoins`, and
  issue #63). A lobby times out after 10
  minutes with no message from a player (`LOBBY_TIMEOUT_DURATION_IN_MIN`). The sweep
  (`removeInactiveLobbies`), every 60 s and before each new lobby, holds no handler's lock: it
  closes each lobby that has timed out under the lobby's own lock (`Lobby.closeIfTimedOut`, which
  hands over the record of a game running in it and drops the game, below),
  removes it from `codeToLobby` and closes its connections, which stay in `userToLobby` until
  their close handlers run, so a spectator's message on its way is still known as a spectator's.
  Every handler looks a lobby up once and treats a closed one as gone: a join or a message is
  closed with 1002 and "The lobby 'CODE' does not exist." (`JoinRefusal.CLOSED` for a player's
  join), checked under the lobby's lock, and `/check-login` answers 404. So a sweep that lands
  between a handler's lookup and its work makes no handler throw and leaves no connection in a
  removed lobby (`LobbyTimeoutServerTest`, which runs the real sweep just before or just after a
  handler's lookup, while a join holds the lock, and while one waits for `ACCOUNTS_LOCK`;
  `LobbyCloseTest`). The accounts' own tests are `UsernamesTest` (the page's whitespace, Unicode
  spaces included, and the 12 code units), `AccountStoreTest` (on a clock the test moves: the
  unique name, two saves at once, hashed tokens, renewal and the sweep), `AuthRoutesTest` (every
  route's statuses and cookies, and no token in any log line), `DiscordSignInTest`,
  `AccountJoinServerTest` (the handshake, `/check-login`, the `Origin` check and messages by
  account), `RenameServerTest` (renames across lobbies, and against a game start),
  `SessionSweepTest` and `LobbyRenameTest`. The server tests sign players in with `SignedInPlayers`
  (a JUnit rule: a fresh in-memory `AccountStore` per test, and `session(name)` for the account
  `test-<name>` named so), and `TestSocket.connect(port, query, token)` sends the `session` cookie
  and the server's own `Origin`; the lobby tests name each player's account with `LobbyTesting`.
  Game records (#31) are made in `server.stats` and `Lobby`, then stored and served (below):
  `GameSnapshot` (one look at a `SecretHitlerGame`: state,
  round, seats, roles, deaths, offices, votes, tracker, board, piles, and the hand or peek of the
  state that shows one; `of` reads `getState()` first, which notices a policy victory),
  `TimelineDiff` (`between(before, after, t)`: the events one game method made between two looks,
  in the game's order and the spec's format, keyed `type`, `t`, `r` and then the spec's fields, of
  JDK types only. A third failed election, or an accepted veto at tracker 2, is `tracker` 3 then
  the chaos `enact`, with no event for the reset; a `reshuffle` comes wherever the game shuffles
  discards back in; only living seats' votes are events or counted; `r` is `before.round()`, so
  an `endTerm` carries the term it ended. It throws for a change no single method makes, two looks
  in one state that differ in more than new votes included), `GameRecord` (the immutable copy a
  game hands over: header, seats in turn order with their accounts, null for a CPU's, and the
  timeline; `winner()`, `hasCpu()`, `accountIds()`) and `GameRecordSink` (where
  `Lobby.recordSink` hands each record, under the lobby's lock, so a sink never blocks;
  `DROPPING`, the sink until recording starts, drops it with a debug line). `Lobby` keeps the
  running game's `gameId` (a random UUID; `gameId()` gives it, then the last game's until the next
  starts), `gameStartedAt` (`recordClock`, epoch ms), `gameComplete` and `gameEvents`, all backed
  up, and the transient `lastSnapshot`; `timeline()` gives a copy of the running game's events.
  It takes a snapshot of the game (`observeGame`) first in
  `updateAllUsers` and after every CPU move, so CPU votes come one by one in name order; the END
  TERM countdown's look after `endPresidentialTerm` makes its `endTerm` `by` `countdown`. `t` is
  ms since the start on `recordClock`, never going back. `Lobby` adds its own events: `timerPause`
  and `timerResume` when the countdown changes, `disconnect` when a seated account's connection is
  removed, and `reconnect` when one comes back after a `disconnect` (looking back no further than
  the last `restored`; a takeover by rejoin key is neither), none after the game's `end`. A move it
  cannot read is logged in one warning line and left out, and the record is `complete: false`:
  nothing the recorder does stops a game. `handOverGame` makes every record. A game that has ended
  keeps its outcome, with exactly one `end`, so a game a CPU won, which the next tick drops, keeps
  it when the sweep or a restart comes first; any other is `UNFINISHED`, with an `end` at the
  sweep. A record's `endedAt` is `startedAt` plus its `end`'s `t`, the sweep's time unless the
  clock stepped back.
  `updateAllUsers` hands a finished game over before it clears the seats, marks the lobbies changed
  (`SecretHitlerServer.markLobbiesChanged`, so the next backup holds no finished game) and drops it
  (`dropGame`); `closeIfTimedOut` hands over and drops a game in a swept lobby, so no CPU tick or
  countdown plays on in it. A record or sink that throws is logged, and the game is dropped as
  usual. `writeObject` writes a lobby under its own lock, so a backup's game and timeline match.
  `readObject` adds `restored` unless the timeline ends with `end`, gives a game from a backup
  before the recorder (`gameEvents` null; `backup-before-recorder.db`) a new ID, a start at the
  restore, `restored` at `t` 0 and `complete: false`, and marks the lobbies changed, so the next
  tick keeps what it changed. It reads the game no further than its round: the first snapshot after
  a restore is taken in `observeGame`, in `game()`, which every command goes through before it
  changes the game, or by the END TERM countdown just before it ends a term (the one change made
  without `game()`). The tests: `TimelineDiffTest` (every event type and the
  several-at-once moves, from hand-built looks, `Snapshots`), `RandomGamesReplayTest` (300 games of
  CPU players in every seat, `CpuGames`, which Phase 14B's fixture uses too, each replayed by
  `TimelineReplay`, which checks every event's place against the game's rules and its keys against
  `RecordFormat`, the spec's format; and games until every event type and outcome has come up),
  `LobbyRecordingTest`, and `DatabaseBackupTest`'s restores. Both of those take the records through
  `RecordedGames` (a JUnit rule: the records, a clock the test sets, and CPU ticks, countdowns and
  grace windows long enough that none ends by itself, all put back after). `GameDriver.stepCpus`
  plays a lobby's CPU players one tick at a time, `GameDriver.playUntil(game, state, onStep)` calls
  `onStep` after every move as `playOut` does, and `ServerTesting.lobbiesChanged()` and
  `clearLobbiesChanged()` read and reset the server's mark for the next backup.
  The records are stored by `GameStore`: three tables in the `DATABASE_PATH` file beside the
  accounts (or an in-memory database of its own without one), on one connection with a 5 s busy
  timeout, every public method synchronized, each SQL failure an `IllegalStateException`. `players`
  (`number`, an autoincrement key, `account_id` unique, `created_at`) numbers each account the first
  time one of its games is saved, in seat order; `games` (`id` the key, `format`, `started_at`,
  `ended_at` indexed, `outcome`, `has_cpu`, `record`, the JSON) and `game_seats` (`game_id` and
  `seat` the key, `player_number`, null for a CPU's and indexed, `name`, `role`). `save` is one
  transaction, its own `BEGIN IMMEDIATE`, `COMMIT` and `ROLLBACK` on a connection left in autocommit
  (the driver's own transactions begin again after each commit, and one whose begin timed out ran
  its next save outside any), taking the write lock at its start: a number for each account that has
  none (looked up before one is made, as an ignored `INSERT OR IGNORE` still uses up an
  autoincrement number), then the game, with `GameRecord.toJson(numbers)` (format 1 in the spec's
  key order, each seat's `player` its number, never an account ID), and its seats; an ID already
  there rolls it all back and returns false, so a game is recorded once. `recordedIds` asks for many
  IDs in one query, `players()` gives them by number and `recordsJson()` by `ended_at`, then `id`.
  `GameRecorder` is the sink: `submit` only queues (unbounded: it never blocks, throws or touches
  the store), one daemon thread, `game-recorder`, saves and then runs `afterSave` (the route's
  `invalidate`), even when the game was there already (a retry of a save that wrote but reported a
  failure, say), and a record whose save fails is logged and waits in memory (`waitingCount`) until
  `retryWaiting` queues it again; `flush` tries every queued and waiting record once on the calling
  thread, and `stop` interrupts the thread and waits up to 10 s for a save under way.
  `SecretHitlerServer` keeps `recorder` and `stats`: `startRecording(store)` makes the route and the
  writer and sets the writer as `Lobby.recordSink` (`stopRecording` puts `DROPPING` back), and
  `main` calls `startUp(GameStore.open(DATABASE_PATH))` (recording, `loadDatabaseBackup`,
  `dropRecordedGames`, then the start-up sweep, in that order), runs `everyMinute()` on its timer
  (the lobby sweep, the session sweep, `retryWaiting`, then the backup if lobbies changed) and
  `onShutdown()` in its hook (the writer stopped and flushed, then the last lobby backup, so a game
  whose record is saved never comes back running, then a second flush for the records of games that
  ended meanwhile, which that backup no longer holds). `dropRecordedGames` is the spec's "a finished
  game never comes back": it reads each restored game's ID under its lobby's lock, asks the store
  once under none, and drops each game that has a record (`Lobby.dropGame`), logging "Dropped the
  game in lobby CODE: it has a record already." and marking the lobbies changed; a read that fails
  keeps every game, with an error. No database call runs under a lobby's lock. `StatsRoutes` answers
  `GET /api/stats/games` with no sign-in: `{"players": [{"number", "name"}], "games": [record…]}`,
  each name the account's now (`currentName`, through the account store; `Player N` for none) and
  the games oldest first. It reads the games before the players, so a save between the two reads
  never serves a player number the list lacks. It keeps the serialized body, its gzip and its `ETag`
  (the body's SHA-256 in hex, quoted, so a restart keeps it) until `invalidate`, after each saved
  record and each rename `renameAccount` saves; it rebuilds under its own lock from a version read
  before the database, so a change during a build leaves it stale. Every answer has `Cache-Control:
  no-cache` and `Vary: Accept-Encoding`; a matching `If-None-Match` (any entry, `W/` or not, or `*`)
  gets 304; a request whose `Accept-Encoding` names gzip, read as Javalin's own compressor reads it
  (a substring), gets the kept gzip with `Content-Encoding: gzip`, which that compressor then leaves
  alone; a database failure is 503 with `UNAVAILABLE` ("Stats are unavailable right now."), as is
  every request before recording starts. The contract fixture,
  `frontend/src/stats/fixtures/recorded-games.json`, is the response for 62 or more `CpuGames`
  recorded as if twelve accounts (Ada to Maximilianus, twelve characters) held the seats: ten
  finished at each size from 5 to 10, two cut off once round 5 begins, two CPU seats in every sixth,
  and more games only if an outcome is missing, made by `./gradlew recordedGamesFixture`
  (`RecordedGamesFixture`, in the test source set) and committed. The games cannot be seeded, so
  every run changes it; `RecordedGamesFixtureTest` checks it against `RecordFormat` and replays
  every timeline. The tests: `GameRecordJsonTest`, `GameStoreTest`, `GameRecorderTest` (over
  `TestStore`, a store that can fail, hold its saves back and count its calls),
  `RecordingServerTest` (no database call under a lobby's lock, a stuck database, the start-up
  order, a database down at start-up, the shutdown's flush), `StatsRoutesTest` and
  `DatabaseBackupTest`'s drops; `TestRecords` builds their records and `ServerLog.during` collects
  what the server logs. `ServerTesting` passes `dropRecordedGames`, `startUp`, `everyMinute` and
  `onShutdown` on.
- `frontend/`: React 18 and TypeScript 5, built with Vite and tested with Vitest. The entry is
  `src/main.tsx`, with `index.html` at the `frontend/` root, whose description is one plain line
  and which has no preview image, so an invite link previews as that line (`linkPreview.test.ts`).
  `main.tsx` checks the path once (`isStatsPath`, `src/statsPath.ts`: `/stats` or a path under
  `/stats/`) and renders either `App`, after starting the sound gesture listener and the clips'
  preload, or the stats pages, `React.lazy`'s `src/stats/StatsApp` in `Suspense`, with neither.
  The stats are a chunk of their own: nothing outside `src/stats/` imports from it but that
  `import()`, and nothing in it imports `App`, the game, lobby or login pages or `SoundManager`
  (leaf modules such as `src/constants` are fine), so the game's first download holds none of it
  (`npm run first-download` gives its gzipped size). `src/stats/` (issue #31; the interfaces file
  names who fills what): `record.ts` (the record's types, format 1, with `ROLES`, `SIDES` and
  `OUTCOMES` the lists their unions come from, `STATS_GAMES_PATH`,
  `EVENT_FIELDS`, each event type's keys in the spec's order, `parseStatsData`, which checks a
  response and throws `Unsupported game record format: N` or the path of the first malformed
  field, `sideOf` and `playerName`, `Player N` for a number with no player; it imports nothing, so
  the browser tests use it), `testRecords.ts` (`makeRecord`, `makeSeats`, `makeData`, for tests
  only), `format.ts` (`outcomeLabel`, which starts with `sideWord`'s "Liberals" or "Fascists" for a
  finished game, `formatDuration`, `plural`, and `formatLocalDate`,
  `formatLocalTime`, `formatLocalDateTime` and `localDayKey`, English whatever the locale, each in
  a time zone it is passed, `viewerTimeZone()` by default, so tests pass one and never set
  `process.env.TZ`), `PlayerName` (the one way a name shows: a `span.player-name` with
  `overflow-wrap: anywhere`, coloured by role through `stats-liberal`, `stats-fascist` and
  `stats-hitler`, underlined, which any stats page may use for a side's word through `roleClass`,
  and `data-player`;
  `link`, `true` by default, does nothing until Phase 22A makes names links, and a name inside a
  sentence or a headline passes `link={false}`), `routes.ts` (`TabId`, `TAB_IDS`, `StatsRoute`,
  `PageProps`, `parseRoute`, `routePath`, `navigate`, which pushes one history entry, none for the
  address the page is at, and scrolls to the top only for a new path, and `useLocation`, which
  follows `navigate` and the back and forward buttons; no router library), `StatsLink` (the one
  in-page link: an `<a href>` whose plain click navigates in place, while a modified or middle
  click, or a link with a `target`, is the browser's; every other prop goes to the `<a>`),
  `api.ts` (`fetchStatsData`, which rejects a non-2xx status, a network error, a body that is not
  JSON and a response `parseStatsData` refuses; `useStatsData`, one shared request per page load,
  forgotten when it fails so the next mount asks again; `STATS_LOAD_ERROR`;
  `resetStatsDataForTests`), `StatsApp` (the header and `main.stats-main`: `Loading the games…`
  while they come, `STATS_LOAD_ERROR` if they cannot, else the route's page, or for an address that
  names nothing "This page was not found." with Go to the stats, at once; `document.title` is
  `<Page> · Secret Hitler Online`; no later phase edits it), `StatsHeader` (SECRET-HITLER, then a
  `nav` "Stats pages" of STATS, GAMES and PLAYERS, `StatsLink`s, and PLAY, a full load of `/`, the
  current one `aria-current="page"` and underlined, each a 44px target at every size; one row on
  desktop, the title over a row of four equal columns in the phone-only query) and `StatsApp.css`
  (`.stats-screen`, left-aligned, `.stats-main`, at most 1100px wide, `.stats-card` and
  `.stats-card-title`, the game's card look, and `.stats-link`, a 44px target in the stacked
  query), and placeholders for later phases to fill: `TabsPage` (17A; for now the ten latest games
  as links and All games ›), `games/GamesPage` (15B), `players/PlayersPage` and
  `players/PlayerPage` (22B), each "Coming in a later update." until then. App.css still styles
  the stats pages' `header`, `a`, `p`, `h2` and `div`, and the stats CSS sets what it needs over it.
  `rounds.ts` (Phase 16) turns a record into rounds, `rounds(record)`, which the game page draws
  and every stat phase reads instead of the raw events: one `Round` per round number in the
  timeline, ascending, an `endTerm`, a pause or a resume in its term and a chaos `enact` in the
  round of the failed election or accepted veto that caused it, and a finished record's round of
  only `end`, `restored`, `disconnect` and `reconnect` left out. A round with no recorded
  nomination takes its president from `SecretHitlerGame.endPresidentialTerm`'s rotation after the
  round before (a special election's target, the turn back to the first living seat after its
  caller, else the first living seat after its president), and the first round of a record that
  starts late from its president's first move, or is left out with none. `blame` is the president
  who discarded the one Liberal of their hand, when a chancellor enacted a Fascist from a hand with
  a Liberal, else that chancellor. Each decision time (`ms`, `Vote.ms`) runs from the event that
  asked for the decision to the one that made it, a nomination from the last END TERM or restart
  before it (in a complete record, the game's start without either), and is null for a CPU
  decider, a missing event or a `restored` event between the two; `formatDecisionTime` shows one
  in whole seconds (`8 s`, `1 min 05 s`). `rounds` reads only the record and never throws on a
  format-1 one. `game/sampleGames.ts` is test support: `ev.<type>(r, t, …)`, one builder per event
  type with its fields in the spec's order and cards as a string (later phases' tests use it),
  `fiveSeatGame`, and `SHOWCASE_PLAYERS` and `showcaseGame()`, a seven-seat game holding every
  kind of round, for the pull request's screenshots. The game page, `game/GamePage` (Phase 16):
  the record whose `id` is exactly the address's (else "This game was not found." and All games);
  `GameHeader`, a card with the result, its first word in the winners' colour, the start, length,
  rounds and final board, and the seats in turn order with their roles, Hitler's marked; "The
  first rounds of this game were not recorded." for a `complete: false` record; an
  `ol.game-rounds` of `RoundBlock`s, each a card edged in the colour of the policy it enacted (grey
  for none) with a line per part of the round (the nomination and result, the votes by name, the
  tracker or chaos, the president's cards, the chancellor's cards, veto and choice, blame, the
  power, and the term's end, pauses, dropped connections and reshuffle), policies as tiles
  (`role="img"`, Liberal or Fascist) and each decision's time after it; and "Unfinished: the lobby
  closed" at the end of an unfinished game. A round with no nominee says "<P> had yet to nominate"
  when nothing came after the nomination, and "<P>'s nomination" before a result it has.
  `game/text.tsx` holds what the header and the rounds share: `joined` (a line's clauses or a
  list's names), `ROLE_WORDS`, `CARD_WORDS` and `RoleWord` (a role's word in its colour).
  `src/App.tsx` owns the WebSocket, all state and the overlays; prompts live in `src/custom-alert/`,
  in one overlay (`CustomAlert`) that `render()` draws for every page, so a prompt open on the login
  page stays open when the page moves to the lobby (`toLoginPage` bumps `alertKey`, so the overlay
  it closes goes at once). The account is `App`'s `account`, `GET /me`'s answer (`Me`), undefined
  until it comes; `src/account/account.ts` has the calls (`fetchMe`, `saveUsername`, `signOut`,
  `testSignIn`, which signs in as a new random test account) and `discordSignInHref`, the link to
  `/auth/discord` with `?lobby=CODE` for a whole code. The page keeps no name of its own: the `name`
  cookie is gone (`lobby` and `spectator` stay), and neither `/check-login` nor `/game` is sent one.
  The login page is `src/login/LoginScreen` (markup and `LoginScreen.css`): the header, then three
  cards in the lobby's look, the account card (`AccountCard`), JOIN A GAME (the lobby code, JOIN and
  WATCH, a hint and its error line) and OR START ONE (CREATE LOBBY and its error line), then a
  footer with How to play (the official rules), About this project, Report a bug and the credit line
  the licence asks for. The account card is blank, at the signed-in card's height, until `/me`
  answers (and says `CONTACT_ERROR` if it fails); signed out it is YOUR ACCOUNT, with SIGN IN WITH
  DISCORD (a `.button-link` to `discordSignInHref` of the code field, in the same tab), "Sign in to
  play. Anyone can watch." and, where `/me` says `testSignIn`, a grey TEST SIGN-IN beside it; where
  `/me` says no `discord`, the button is off and the line reads "Sign-in is not set up on this
  server.". Signed in it is YOUR NAME: the name, a grey CHANGE NAME and "Signed in with Discord as
  rowan.d · Sign out", with the account's Discord username ("Signed in with a test account
  (test-…)" for a test account), the only place the Discord username shows. Sign out is a button
  drawn as a link, with a 44px target at every size whose margins take back all but its line's
  height (`lh`). After `/?signin=failed`, which `App` takes out of the address (keeping `?lobby=`),
  the card says "Signing in with Discord failed. Please try again.". JOIN needs a signed-in account
  with a name and the 4-letter code, WATCH only the code, CREATE LOBBY only the account with a name;
  the hint reads "JOIN needs you signed in · WATCH needs only the code" until then and "WATCH needs
  only the code" after. A 401 from JOIN, CREATE LOBBY or the name prompt's save says "Sign in to
  play." and asks `/me` again (a session that has ended closes the prompt). CHOOSE A NAME and CHANGE
  NAME are one prompt, `NamePrompt`: its title, "Others see it in lobbies and games. Up to 12
  characters.", the field, which takes `typedName` (`src/lobby/normalizeName.ts`: runs of whitespace
  one space, none at the start, twelve characters at most) and saves `normalizeName`'s, then the
  confirm button and the other on one row (`.name-prompt-buttons`, 44px targets on phones): CONTINUE
  and SIGN OUT, or SAVE and CANCEL. The server's message shows under the field and the prompt stays
  open, and a press counts once. CHOOSE A NAME opens by itself for a signed-in account with no name,
  on the login page and in the lobby only: never over the game page, where a game packet drops it,
  to be asked again on the login page or in the lobby. Nothing but CONTINUE and SIGN OUT puts it
  away. `syncNamePrompt` fits the prompt to each new account; `accountRequest` lets only the latest
  request that sets the account show (a saved name counts, so an older `/me` cannot take it back,
  but a sign-out's answer always shows); `namePromptSession` and the prompt's `key` keep a late
  reply from touching a later prompt; `testSigningIn` and `signingOut` take one press at a time; and
  `toLoginPage` asks `/me` again, keeping the account last known, with `CONTACT_ERROR`, if it
  cannot. The code field and a `?lobby=CODE` link take `normalizeCode` (no whitespace, capitals,
  four letters at most). In `App`, `loginForm` fills or empties the code field and the error lines
  together. The footer links are in `src/constants`:
  `RULES_URL`, and `ABOUT_URL` and `ISSUES_URL`, which the lobby's footer shares, each an `OutLink`
  (`src/util/`, a new tab). `GameScreen.css` lists `.login-screen` beside the lobby and the game
  for the page and its header, and `LobbyScreen.css` lists the login page's selectors beside the
  lobby's for the cards' look, the fields' focus, the centred column, the grey buttons and the
  footer; `LoginScreen.css` holds the rest. The cards are a column centred both ways on desktop and
  in tall windows, and start at the top on phones (`LoginScreen.css` writes out the phone-only
  query). It fits one screen at every tested size but 320x568, where it may scroll down. The game
  page is `src/game/`: `GameScreen` (markup and the three layouts), `PlayerRoster` (a row per player
  in `playerOrder`: portrait, name, office or role, and the vote or busy bubble), `RoundTracker`
  (the four steps of a round, the current one lit, over the status line `#status-bar-text`; its line
  always keeps two lines' height, and `--round-tracker-ems` is the whole card's height in its own
  ems, which the layouts reserve) and `roundStep` (a pure function from the game state and
  `lastState` to the step; `App` queues the step with each status line). `TermTimer` is the END
  TERM countdown: an icon and the seconds left, counted down on the page from each packet's
  `remainingMs`. The page takes the time passed since the packet from `remainingMs`, not the page
  time from a deadline, whose fractions could show a second too many: the first frame shows the
  server's seconds exactly. It is the president's pause and resume button, and shows everyone
  else (spectators too) whether it is paused; the seconds left are its accessible description, so
  its name stays put. `GameScreen` puts it in `.end-term-slot` with END TERM, which flashes
  (an outline, held steady with reduced motion) while the countdown runs. It stands just above END
  TERM on desktop and in tall windows, in the room the table keeps there beside the tracker, and
  at its right on phones, so it moves nothing.
  `RosterRow` (`src/game/`) draws one row and is shared by `PlayerRoster` and `LobbyRoster`.
  `usePlayerRows` (`src/player/`) is the per-player state the roster rows and the prompts' card
  tiles share. Desktops get the roster as a column at the left, the tracker over the boards, and
  END TERM, the counts box, the draw pile and the discard pile in a column beside them, on one
  screen (`.game-table` is a size container, and the boards' width comes from its container units). Phones, windows narrower
  than 5:4 and windows under 500px tall get one column from the phone-only query in
  `GameScreen.css` and `PlayerRoster.css`, which is the stacked query
  `(max-width: 768px), (aspect-ratio < 5/4), (max-height: 500px)` less tall windows (written out in
  those files): compact rows about 26px tall in two columns (`PRES` or `CHAN` after the name), the
  tracker, a decks row with END TERM over the counts box, and the boards at full width. With ten
  players and the longest status it fits 360x740 and 412x915 without scrolling; a phone held
  sideways scrolls. The phone layout holds down to 320px wide, where the page may scroll: the login
  page, the lobby, every prompt and the game are tested at 320x568 (narrower phones are out of
  scope); with Linux-drawn fonts the longest status still takes a third line at a few untested
  widths (see `docs/PLAN.md`, Phase 9). `SoundControl.css` (44px header targets) and
  `RoundTracker.css` (the smaller step line) keep the stacked query itself, so tall windows get
  those too, on purpose. Among the stacked windows, those at least 700px wide and narrower than 5:4
  (half-screen desktop windows, upright monitors, tablets held upright) fit one screen instead, with
  the roster across the top in two columns (three in near-square windows) and the counts box
  between the draw and discard piles (`order` moves it there), from a later block,
  `(min-width: 700px) and (aspect-ratio < 5/4)`, in `GameScreen.css` alone (`PlayerRoster.css` has
  no tall block). That block holds only what differs from desktop, and no longer undoes the phone
  block, which never reaches those windows. On desktop and in tall windows a twelve-character name
  fits whole, and only a name too wide for its row ends in an ellipsis, with the full name in the
  row's title on hover; the phones' compact rows end any name that does not fit in an ellipsis.
  The lobby is `src/lobby/`, built like the game page and on the same three layouts: `LobbyScreen`
  (markup and `LobbyScreen.css`: the header, the roster column, then a code card with the invite
  link and COPY, a status card kept two lines tall, the buttons by viewer, the note, and a footer
  with the About and Report a bug links), `LobbyRoster` (a `RosterRow` per player, `Picking a look…`
  for a player on the default portrait, HOST on the host's row), `lobbyStatus` (a pure function from
  the usernames, portraits and viewer to the status line; it names who START GAME waits for and says
  when bots fill the table), `joinError` (`joinErrorMessage`, `CONTACT_ERROR`, `CONNECT_ERROR`: the
  `/check-login` messages JOIN and PLAY INSTEAD share, 401 "Sign in to play." and 403 "You're
  already in this lobby in another tab or window." among them), `normalizeName` (runs of whitespace
  made one space, then trimmed, as the server's `Usernames.normalize` does: the name prompt saves
  every name through it, and its field takes at most `MAX_NAME_LENGTH` characters) and `copyText`
  (the Clipboard API, with a select-and-copy fallback).
  `GameScreen.css` lists the lobby's selectors beside the game's for the page, header and roster
  column, so the roster cannot drift between the lobby and the game; `LobbyScreen.css` holds only
  what the lobby has (and the login page shares), with its own phone-only and tall-window blocks
  written out as in the game's files. With ten players and the longest status it fits one screen at
  the same sizes the game does, for every kind of viewer. The buttons: the host gets START GAME (off
  until every player has picked a look); every player gets CHANGE NAME (the CHANGE NAME prompt,
  which starts from the roster's name, `nameToChange`), CHANGE LOOK, WATCH INSTEAD and LEAVE LOBBY
  (`.lobby-player-buttons`: a wrapping centred row on desktop and in tall windows, two rows of two
  on phones); a signed-in spectator gets PLAY INSTEAD (off when the lobby is full) and LEAVE LOBBY;
  and a signed-out spectator gets SIGN IN TO PLAY (a `.button-link` to `/auth/discord?lobby=CODE`,
  off where `/me` says there is no Discord sign-in) and LEAVE LOBBY. Under a spectator's buttons the
  note (`#lobby-note`, `.lobby-note`, `role="status"`) is always mounted, empty and out of the flow
  when there is nothing to say, so a note is announced as it comes: signed in, the full lobby's note
  (`.lobby-full-note`) while it is full, otherwise PLAY INSTEAD's error (`playInsteadError`, which a
  press, a new socket and a packet that shows the lobby full, or the one after it, clear); signed
  out, a failed sign-in, then "Sign-in is not set up on this server.", then the full lobby's note. A
  player's packets carry `you`, which `App` keeps as `state.name`, so the roster's mark, START GAME
  and CHANGE NAME's name follow a rename made in another tab, and `onGameStateChanged` takes the
  name from the packet itself; a spectator's name stays `""`. The switch between playing and
  watching is offered in the lobby only, and works by reconnecting: WATCH INSTEAD reopens the socket
  as a spectator and sets the `spectator` cookie; PLAY INSTEAD takes a seat under the account's name
  at once, with no prompt: it checks `/check-login`, reopens the socket as a player and saves the
  cookies as JOIN does, and the portrait picker opens unless the server restores the account's
  remembered portrait. An account with no name yet answers CHOOSE A NAME first, and its CONTINUE
  takes the seat (`playInsteadAwaitsName`). Just after WATCH INSTEAD the server may still count the
  page's closing player socket as the account's connection, and would answer 403, so PLAY INSTEAD's
  check first waits for that socket's close event (`closingSeat`, `seatClosed`),
  `SEAT_CLOSE_WAIT_MS` (2 s) at the most, and forgets a socket whose close never came.
  `playInsteadPending` names the PLAY INSTEAD under way: LEAVE LOBBY, a game starting, the login
  page and a name prompt closed unanswered end it (`cancelPlayInstead`), so a late answer takes no
  seat. If the server closes PLAY INSTEAD's player socket before its first message (the seat went
  between the check and the join), `seatPending` sends the person back to watching with a snackbar.
  A signed-out spectator's SIGN IN TO PLAY comes back, through the `spectator` cookie, to watching
  the same lobby signed in, with PLAY INSTEAD ready (and CHOOSE A NAME there after a first sign-in).
  In `App`, `openSeat`, `openWatch` and `closeSocket` do this, and `tryOpenWebSocket` builds the new
  socket before it closes the old one, keeping the lobby's players on screen when it reopens to the
  same lobby. `alertShowCount` and `pickerShownAt` keep a late reply from touching the wrong prompt:
  the picker updates only while it is the alert on screen. `animationStep` names the running queue
  step, and every queue timer (`finishStepAfter`, for the event bar, the board, the vote tally and a
  held status line, and the fade in `hideAlertAndFinish`) finishes only the step it belongs to, so a
  timer left from a cleared queue never cuts short the next one's step. A prompt's server-OK
  listener (`addServerOKListener`) is tied to its step the same way: an OK goes to the first
  listener whose step is still the current one, and `clearAnimationQueue` drops them all (and a name
  prompt still queued). A lost socket is reopened at once, then after each wait in
  `RECONNECT_DELAYS` (1, 2, 4, 8 and 15 s). The page gives up with "Disconnected from the lobby."
  when the last attempt fails, or at once when the server refuses a socket outright (1002 before its
  first message: the lobby is gone, full, or playing without this account, or the session has
  ended). The server must answer a new socket or a ping within `REPLY_TIMEOUT` (10 s), or
  `onNoReply` drops the socket as dead, and a page coming back into view pings at once. While
  `reconnecting`, a press in a game waits in `pendingCommands` until the server takes a new socket
  (its first message), and a press in the lobby with no socket shows the retrying snackbar instead.
  Every close is logged with the time, its code and reason and the page's visibility, without the
  URL's key.
  Prompts are a fixed overlay whose box scrolls (`CustomAlert.css`), except the portrait picker
  (`IconSelection`): its box is a column with CONFIRM pinned at the foot, and only the grid of
  portraits scrolls (`IconSelection.css`, keyed on `ButtonPrompt`'s `className`). `CustomAlert`
  fades the overlay in and out with CSS classes, and once a closed prompt's fade-out has had its
  `ALERT_FADE_OUT_MS` (1 s, which `hideAlertAndFinish` also waits) it sets `hidden` on `#alert`
  (`display: none`). So a closed prompt is never drawn and never takes a press, however the browser
  left its animations (Firefox could leave the empty box up until a reload, issue #27), and an
  overlay that was never shown starts hidden, with no fade-out when a page opens. While it fades
  out, `#alert` and everything in it take no pointer events, so a press goes through to the page
  (issue #29). Every button but the header's speaker shares `App.css`'s look: `::before` draws the
  face and, below it, the shadow (`--button-depth`, 5px), both inside the button's box, so a press
  anywhere on what is drawn reaches the button. A press moves the face and the label down onto the
  shadow by moving the box's transparent border (`--button-border`, 2px) from its foot to its top,
  in one step: browsers round each border width down to whole pixels, so widths on their way would
  shrink the box, while the two widths swapped keep it as it is. The box never moves, so a held
  press stays on the button, and buttons are top-aligned, so a press moves no button beside it.
  Variants set `--button-face` and `--button-shadow` (the lobby's grey buttons, the countdown chip,
  whose depth is whole pixels where the browser has `round()`). A bottom margin `--button-depth`
  smaller keeps the shadow out of the layout, as when it was drawn outside the box; END TERM, with
  no margin, gives its shadow the 5px it kept below itself. A 44px minimum is the face's:
  `calc(44px + var(--button-depth))`. END TERM stands above the piles' cards, and its countdown
  flash is drawn round the face. Only the label's colour eases (the face's eases in `::before`); a
  button's size and place follow the layout at once. That goes for the header's speaker too, which
  undoes the look but keeps `App.css`'s `transition`. Firefox styles a page that has just appeared
  with its container units measured against the window, then against their containers, and an
  ease from there slid END TERM, the countdown chip and the speaker into place, out from under a
  press (issue #59).
  Sounds are in `src/sound/`:
  `SoundManager` (Web Audio; the `AudioContext` is created in the first trusted gesture, so `play()`
  before it is a silent no-op; volume and mute in `localStorage` under `sounds`; every `play()`
  dispatches a `sound-play` event, which tests record), `soundEvents` (a pure function from the
  previous and next game state to sound names, and `SOUND_CUES`, the queued animation each sound
  waits for; `App` puts each sound into its animation queue just before that animation; and
  `lobbySounds`, `playerJoined` for a name the last lobby packet did not have, but none for a
  rename, a list of the same length with one place changed) and
  `SoundControl` (the speaker button and volume slider in all three headers, above the prompt
  overlay, with Lucide icons from `lucide-react`). The clips are in `src/assets/sounds/`, an Ogg
  Opus and an MP3 per sound, each credited in `docs/SOUND-CREDITS.md`. Spectators are in
  `src/spectator/`: `spectatorStatus` (the status lines a spectator gets in place of prompts, naming
  the players) and `SpectatorCount` (Lucide's eye and the number, at the left of the lobby and game
  headers). A spectator's name is `""`, and the `spectator` cookie takes a reload straight back to
  watching. Playwright tests live in `frontend/e2e/`, in four projects: `desktop`
  (`no-scroll.spec.ts`: at `DESKTOP_SIZES` and in the `NARROW_WINDOWS` no scroll, every board at
  least its `BOARD_FLOOR`, the tracker exactly its reserved height and the boards unmoved by the
  longest status; wide twelve-character names fit there and at `SQUARE_DESKTOPS`; at all three
  the decks column keeps its order, the counts box above the draw pile on desktops and between
  the piles in the narrow windows, clear of every pile's cards; every media query
  parses and the phone-only query exists, found by what it matches), `firefox` (the same no-scroll
  tests, since Firefox rounds the layout differently, the header-fit tests of `sounds.spec.ts` and
  `spectator.spec.ts`, `prompt-close.spec.ts` and `button-press.spec.ts`), and
  `phone-360`/`phone-412` (Galaxy S8 and Pixel 7 emulation, `phone.spec.ts`: the game fits without
  scrolling, in order, with 44px targets, for players and a spectator; at 320x568 it keeps the
  phone layout and only scrolls down, for both, and `phone-360` also checks the login page and the
  lobby there; the login page fits without scrolling in each of `LOGIN_STATES`, with 44px targets
  (SIGN IN WITH DISCORD, TEST SIGN-IN, CHANGE NAME and Sign out among them), 16px field text and
  unwrapped button labels; the lobby tests (the lobby fits without scrolling for each of
  `longestLineViewers`' six viewers, each with its note, with 44px targets and 16px field text,
  the roster first, the busy bubble at 320px, and `checkNamePrompt` for CHOOSE A NAME on the login
  page and over the lobby, after which PLAY INSTEAD takes a seat at once, and for CHANGE NAME on the
  login page and in the lobby: 44px targets, 16px field text, unwrapped labels, both buttons on one
  row and twelve characters at most); and a phone held sideways gets the phone layout).
  `no-scroll.spec.ts` also has a lobby test, for the same six viewers, each one's buttons checked
  by label (`actionLabels`), a spectator's note by its text, and the buttons 44px targets at every
  size, and a login page test per state (the cards and the footer in order, 44px targets and 16px
  field text, and Sign out's box clear of CHANGE NAME's, `accountTargets`), both at
  `DESKTOP_SIZES`, `SQUARE_DESKTOPS` and the `NARROW_WINDOWS`. The viewers are the host and a guest
  (the four player buttons), a signed-in spectator (PLAY INSTEAD, off in the full lobby) and two
  signed-out ones, on a server with Discord sign-in and one without (`/me` stubbed), all in the
  full lobby; and a signed-in spectator of a lobby of nine, with the longest line too, whose PLAY
  INSTEAD's `/check-login` failed: its note, `CONTACT_ERROR`, is the longest a spectator gets (one
  line on desktop, with 220px or more to spare; two on phones, with 170px to spare at 360x740 and
  27px at 320x568, on Linux too). The login tests open the page with `longestLogin(page, state)`
  (`e2e/lobby.ts`): each state at its fullest from stubbed requests, the longest error under every
  card and, signed in, a twelve-character name and `LONGEST_DISCORD_NAME` (32 m's, Discord's
  widest; "signed in, short Discord name" puts Sign out on the line just under CHANGE NAME). The
  thinnest fits are the signed-in login page at 800x700, about 6px to spare, and on phones at
  360x740 on Linux, where the widest Discord username takes three lines, also about 6px
  (`LoginScreen.css`): an added line fails there first. `lobby-switch.spec.ts` (`desktop`
  and `phone-360`) plays the seat switch in a real lobby: watching instead and playing instead, a
  full lobby, a taken name (a first sign-in from watching gets CHOOSE A NAME over the lobby, which
  refuses the host's name), the host passing on, reloads, the grace window, and a game started
  right after someone watches instead (both grace-window tests fail when their timing missed the
  window). `accounts.spec.ts` (`desktop` and `phone-360`) signs in, names and renames in the
  browser: signed out (JOIN and CREATE LOBBY off, WATCH works, SIGN IN WITH DISCORD's link carries
  the code), the first sign-in's CHOOSE A NAME, renaming on the login page and a taken name, a
  rename in the lobby that another player sees at once with no join sound, no CHANGE NAME in a game
  and the server's 403 there, a signed-out spectator's SIGN IN TO PLAY link, and a signed-in
  spectator's PLAY INSTEAD with no prompt. `tracker.spec.ts` (`desktop`) checks the lit step
  against the status line.
  `term-timer.spec.ts` (`desktop` and both phone projects) plays the END TERM countdown from a
  scripted socket for the president (pause and resume), another player and a spectator, checks it
  stands beside END TERM at every tested size and on a phone held sideways, clear of the rest of
  the table (with 8 discards, the most a game holds at END TERM without vetoes) and moving
  nothing, checks on phones that it stays on top of the 11 discards vetoes can leave, and
  (`desktop`) lets the server end a real game's term after 10 s.
  The scripted sockets record what the page sends (`received`).
  `prompts.spec.ts` runs in `desktop` and both phone projects (`phone-360` also at 320x568); it
  opens every prompt from a scripted game socket (`e2e/fakeGame.ts`), and checks that the portrait
  picker's label and CONFIRM are in view without scrolling, on a phone held sideways too, while its
  grid scrolls to the last portrait. `prompt-close.spec.ts` runs in every project: after the role
  alert's OKAY, a vote closed by the server's OK, the policy alert (then END TERM, which must take
  the press) and the portrait picker in the lobby, the overlay stops being drawn within the
  fade-out (a screenshot with it against one without), stays gone, and lets presses through to the
  page; END TERM also takes a press (a tap on phones) 300 ms after the policy alert's OKAY, while
  the alert fades out. `button-press.spec.ts` (`desktop` and `firefox`; a phone's touch adjustment
  never missed) holds mouse presses for 150 ms on END TERM and on the veto prompt's REJECT, 1px
  and 3px below the top edge and 2px into the shadow and at its foot (the shadow found by its
  colour in a screenshot), and checks that each click reaches the button and that, in no frame of
  a held press, REJECT's box or ACCEPT's beside it moves. It measures a button once the page's
  images have loaded, and checks that no button eases its size or place (a transition on anything
  but a colour) as the game page appears (END TERM, the president's countdown chip and the
  header's speaker did in Firefox). `sounds.spec.ts` runs in every
  project: no sound and no `AudioContext` before the first trusted gesture, each sound in step with
  its animation, and the header control's fit, touch targets, keyboard use and saved settings.
  `spectator.spec.ts` plays a scripted game to a spectator (no prompt before the victory screen, the
  status lines, the sounds), plays a real game whose spectator frames it scans for secrets
  (`e2e/driveGame.ts` seats raw-socket players; `e2e/secrets.ts` mirrors the backend's list), and
  checks the count fits every header. `startGame` (`e2e/lobby.ts`) joins one raw spectator by
  default, and the no-scroll and phone tests also measure a spectator's view. `settle`
  (`e2e/lobby.ts`) fails when the web fonts do not load; they come from Google Fonts through
  `src/fonts.css`, so the browser tests need network access. They serve on port 4545, or on
  `E2E_PORT`, which gives runs in two worktrees at once a port each: a run waits for any server on
  its port to answer `/ping` while it builds, so two on one port can test the wrong code.
  `playwright.linux.config.ts` runs the same projects in Playwright's Linux image against a jar
  already serving on the host with `TEST_SIGN_IN=true` (`DEVELOPMENT.md`, "Browser tests on
  Linux"): Firefox where it will not launch on macOS, and the phone layouts with CI's wider Linux
  fonts. Playing needs an account, so `playwright.config.ts`'s `webServer.env` sets `TEST_SIGN_IN`
  (nothing else does), and every player signs in through `e2e/accounts.ts`: `signInPage` posts to
  the test sign-in with `page.request`, so the page's context keeps the `session` cookie (`null`
  for an account with no name yet), `signInRaw` signs in with `fetch` and returns the cookie, and
  `playerSocket` opens a raw player socket with that cookie and the server's own `Origin` (Node's
  own WebSocket takes headers), resolving on the server's first packet. `stubMe` (with `signedInMe`
  and `signedOutMe`) stubs `/me` for scripted pages. Names are unique across accounts and the tests
  run in parallel against one server, so every name a real server sees comes from
  `uniqueName(stem)`: exactly twelve characters, two of the stem, a space and nine digits, the run's
  three (`E2E_RUN`, which `playwright.config.ts` sets once per run, so a later run against the same
  jar takes none of an earlier run's names; set it to three digits to make a run's names again), the
  worker's two and a count's four. `createLobby`, `joinLobby`, `joinGuests` (which returns each
  `Guest` with its name), `startGame` and `driveGame.ts`'s `openTable` (whose lobby is made with a
  signed-in `fetch`) sign their players in; the scripted pages of `e2e/fakeGame.ts` stub `/me`
  signed in and carry `you` in their player packets. The server closes a
  `/game` socket after 30 s with no traffic either way, so the client pings every 20 s
  (`PING_INTERVAL`); `connection.spec.ts` (`desktop`) holds a quiet lobby's socket open for 35 s.
  `reconnect.spec.ts` (`desktop`) cuts a player's connection mid-game through Playwright's
  `routeWebSocket`: with the browser noticing and the server's end left open, with no network for
  2.5 s, and with neither end noticing. Each time, the server replaces the dead socket. The scripted
  sockets of `e2e/fakeGame.ts` answer pings (`answerPings`), and `FakeWatch.down` refuses new
  sockets as `LOBBY_GONE`, so the page gives up at once. `recorder.spec.ts` (`desktop`) plays a
  real game to its end through `e2e/driveGame.ts` and finds its record in `GET /api/stats/games`,
  its keys in the spec's order, with no account ID in the body. `e2e/fakeGame.ts`'s victory packet
  carries `FAKE_GAME_ID`. The stats specs (`stats-*.spec.ts`, which run in all four projects:
  `firefox`'s `testMatch` takes them) share `e2e/stats.ts`: `statsSizes` (`DESKTOP_SIZES`,
  `SQUARE_DESKTOPS`, the `NARROW_WINDOWS` and `PHONE_SIZES`, 360x740, 412x915 and 320x568) and
  `statsSizesFor(project, viewport)` (all of them in `desktop` and `firefox`, the project's own
  viewport on a phone, and 320x568 too in `phone-360`), `stubStats(page, data)` (routes
  `/api/stats/games`), `bigStatsData()` (the same 400 games on every call, from a seeded generator:
  players 1 to 10 named `WWWWWWWWWW01` to `WWWWWWWWWW10`, `big-001` to `big-400` four an evening
  every third or fourth evening from 6 Oct 2025, sizes cycling 5 to 10, one or two CPU seats in
  every seventh, Hitler among them at least once, every 25th unfinished and the rest cycling through the four
  endings, `big-200` also incomplete and opening with `restored`, each timeline played by the rules:
  rounds, votes, the tracker, which only a policy puts back, and chaos, cards, vetoes, powers by size, the term's end, by the
  countdown in every fifth, pauses, dropped connections, reshuffles, and the board in the last
  `enact`; later phases assume nothing else about it), `statsPageProblems(page)` (what is wrong at
  the current size: anything past either side but inside a box that scrolls sideways itself, never
  `body`, `.stats-screen` or `.stats-main`; and in the stacked query, controls under 44px, but for a
  link inline in a sentence of a `p` and never one in a table cell, and field text under 16px),
  `checkStatsPage(page, size)` (sets the size, waits two frames, and expects none; every stats spec
  checks its pages with it and writes no sideways check of its own), `STATS_ONLY_STRINGS` and
  `downloads(page, path)` (every same-origin response of a load, with scripts' and stylesheets'
  text). `stats-shell.spec.ts` checks `bigStatsData` and the page check itself, every shell page at
  every size (the loading and error lines too), a twelve-character name of wide letters inside its
  line at 320px, that the game's first download holds no stats code and fetches the clips while the
  stats fetch their chunk and no clip, the header moving in place, and back, forward, reload and a
  deep link. `stats-game.spec.ts` checks the game page at every size against `bigStatsData()` (its
  largest game, ten twelve-character names voting, its first incomplete and first unfinished
  games, and an unknown ID; at every size each line and name inside its card's padding, and on
  phones each round's block at least the window's width less 32px), a round's 6px edge in its
  policy's colour and its lines' 4px spacing, All games moving in place from the not-found page,
  and (`desktop`) a real seven-seat game's page
  opened by its `gameId`: a block per round, the first election failed, a decision's time and the
  accepted veto. No `e2e/` file imports `src/constants` or anything that does (`api.ts`, `App`): it
  reads `window` when it loads, which throws in Playwright's Node process; specs build stats paths
  with `routePath`. Shared helpers are `e2e/lobby.ts`
  (`waitForPlayers`, `joinGuests`, with `pickLooks` false for guests who stay on the default
  portrait, `joinLobby`, `pickPortrait`, `longestLineLobby`, `longestLineViewers`, `actionLabels`,
  `longestLogin`, `accountTargets`, `lobbyStatusCard`, `waitForPrompt`, `watchLobby`, and
  `codeField`, the login page's one field), `e2e/accounts.ts`, `e2e/layout.ts` (`wrappedLabels` and
  `smallTargets`, which measure links drawn as buttons, `.button-link`, too, `smallFieldText`,
  `MIN_FIELD_TEXT`, and `addPngDecoder` for page functions that read screenshots) and
  `e2e/soundLog.ts`. `App.css` hides
  `overflow-x` on `html` and `body`, so horizontal overflow shows only in `body.scrollWidth`, and
  `body` scrolls vertically by itself (`pageHeight` measures both). The client talks to its own
  origin (`src/constants/serverUrls.ts`; `wss:` on `https:` pages) unless `VITE_SERVER_ADDRESS` is
  set, and the dev server proxies the backend paths (`/check-login`, `/new-lobby`, `/ping`, `/auth`,
  `/me`, `/api` and `/game`) to `BACKEND_URL` (default `http://localhost:4040`). `VITE_*` variables
  live in `.env.development` (dev server only: `VITE_DEBUG`) and `.env.dev` (`--mode dev`), typed in
  `src/vite-env.d.ts`.
- `devops/`: host scripts for the database, each self-contained bash (it works copied alone, on
  macOS's bash 3.2 too) that works on the running container by its name through the `docker` CLI,
  needs only `docker` and `sha256sum` (or `shasum`), prints its steps as `==> …` and exits 1 with
  `Error: …` on stderr. `backup-db.sh` takes one `VACUUM INTO` snapshot beside the database inside
  the container, checks it there (`PRAGMA integrity_check` must print `ok`; its SHA-256), copies it
  out with `docker cp` and checks its SHA-256 again, then moves it into `BACKUP_DIR` as
  `secret-hitler-<%Y%m%dT%H%M%SZ>.db` with `<same>.db.sha256` (`<sha256>  <name>`, for
  `sha256sum -c`), deletes `secret-hitler-*.db` and `.db.sha256` files there older than
  `RETENTION_DAYS`, and runs `AFTER_BACKUP` as `sh -c "$AFTER_BACKUP" sh <new backup>`; a failing
  hook keeps the backup and exits 1. A failure before the move leaves no backup behind, and a trap
  removes the temporary files on both sides on every exit; a signal ends either script with
  `Error: …` (the backup holds one back while it moves its two files into place), and the
  restore's trap starts a container it stopped again, saying on which database. The retention's
  `find -H` follows a `BACKUP_DIR` that is a symlink. `restore-db.sh <file>` refuses a file
  without SQLite's 16-byte header, or with no `<file>.sha256` or one it does not match, before
  anything stops; asks for the container's name; stops the container; swaps the file in from a
  one-off container of the container's image ID (`docker run --rm --network none --user root
  --volumes-from`, the file mounted read-only: the copy is checked again, owned by uid 1000 and
  synced to disk before the `-wal`, `-shm` and `-journal` go and it moves into place, so a failed
  swap leaves the database as it was and the container starts on it); starts it; and waits for this start's
  startup line (`docker logs --since` its new `StartedAt`, since the logs keep earlier starts'),
  failing if the container stops or `STARTUP_TIMEOUT_SECONDS` pass. Settings (`CONTAINER_NAME`,
  `DB_PATH`, `BACKUP_DIR`, `RETENTION_DAYS`, `AFTER_BACKUP`, `STARTUP_TIMEOUT_SECONDS`) come from
  the environment, then from `devops/.env` beside the script (git-ignored; `devops/.env.example`
  documents each) or the file `ENV_FILE` names (which must exist), read and never sourced, then the
  defaults, and are checked before any `docker` call. `devops/tests/backup-restore.test.sh` runs
  its `stub_*` cases against a stub `docker` first on `PATH`, then its `real_*` cases in order
  against a container of the image (built from the checkout under a tag of its own, unless `IMAGE`
  names one) with `TEST_SIGN_IN=true` on a fresh volume, while test sign-ins keep it writing: the
  backup's checks and hook, refusals that leave the server running, and a restore that brings back
  every table's rows (`table_rows`, so tables later phases add are compared too). Every case reads
  an empty `ENV_FILE`, never `devops/.env`, and it runs from any directory. CI's `devops` job runs
  `shellcheck` on the three scripts first. The image installs `sqlite3` for the backup.
- `docs/`: `PLAN.md` (phased plan and progress), `superpowers/specs/` (design),
  `superpowers/plans/` (per-phase step-by-step breakdowns), `images/` (the README's screenshots,
  taken from a scripted seven-player game at 1600x900 and at 412x915 on a phone), `pr/` (each pull
  request's before-and-after screenshots, in a folder named for its branch).
- `.claude/skills/`: project skills. `implement-issue` (`/implement-issue N`) takes one GitHub issue
  through the Workflow below to a pull request with green CI, which it merges for an issue labelled
  `bug`, then checks the published image. An issue that needs design gets a pushed spec and plan and
  a prompt for a new session instead. `write-issue` (`/write-issue <what you saw or want>`)
  writes one or more issues in the house style (`formats.md`), tries every bug on `development`
  first, and posts each only once the user has read its draft and said yes.

## Commands

The Gradle 7.4.2 wrapper does not run on JDKs newer than 17. Java 17 comes from SDKMAN
(`17.0.21.0+9-tem`). The frontend needs Node 22.12 or newer (Vitest 5, jsdom 30); local is 24.
Change the frontend's dependencies with npm 11 (`npx npm@11 install …`): npm 10 drops the `libc`
fields from `package-lock.json`.

| Task | Command |
|---|---|
| Run backend (debug mode with test sign-in, `localhost:4040`) | `cd backend && ./gradlew runLocal` |
| Run frontend dev server (`localhost:3000`, against the local backend) | `cd frontend && npm install && npm run dev` |
| Backend tests | `cd backend && ./gradlew test` |
| Remake the stats pages' contract fixture after a change to the record's format (a new file every run; commit it with the change) | `cd backend && ./gradlew recordedGamesFixture` |
| Frontend tests (single run) | `cd frontend && npm test -- --run` |
| Browser tests (build the frontend and the jar, serve them on `localhost:4545` with test sign-in, or `E2E_PORT` beside another run; Java 17 active) | `cd frontend && npx playwright install chromium firefox && npm run e2e` (one project: `-- --project=phone-360`) |
| Browser tests on Linux (Firefox, or CI's font widths), against the jar serving on the host with `TEST_SIGN_IN=true` | `docker run … mcr.microsoft.com/playwright:v<version>-noble … npx playwright test --config playwright.linux.config.ts`, written out in `DEVELOPMENT.md` |
| Backend build (tests + fat jar at `backend/build/libs/secret-hitler-online.jar`) | `cd backend && ./gradlew build` |
| Frontend production build (type-checks the app and the browser tests, then writes `frontend/dist/`) | `cd frontend && npm run build` |
| The game's first download, each file `dist/index.html` loads gzipped and the total (after the build; a stats phase leaves it as it was) | `cd frontend && npm run first-download` |
| Whole app on one port (after the frontend build; `TEST_SIGN_IN=true` before `java` to sign in with test accounts) | `cd backend && ./gradlew jar && java -jar build/libs/secret-hitler-online.jar` |
| Image (repo root) | `docker build -t secret-hitler-online .` |
| Backup and restore tests (Docker running and `curl`; builds the image unless `IMAGE` names one) | `bash devops/tests/backup-restore.test.sh` |

`npm run dev:server` points at upstream's hosted dev backend, not anything this fork runs.

## Deploy

CI (`.github/workflows/ci.yml`) runs the backend and frontend tests, the frontend build and the
browser tests on every pull request into `development`, and keeps the Playwright report and traces
of a failed browser run as an artifact. On pull requests only, its `devops` job builds the
branch's image (its own build cache, `scope=devops`) and runs the backup and restore test against
it; `image` does not wait for it, since it is skipped on pushes. On every push to `development` it also
publishes `ghcr.io/jussaw/secret-hitler-online:latest` and `:sha-<short>` for `linux/arm64` and
`linux/amd64`, once those checks pass.
A home server runs that image and pulls new `:latest` images once a day. TLS ends at a proxy in
front of it, so the container serves plain HTTP on `8080`. Lobby backups, accounts, sessions and
game records go to `/data/backup.db`, so mount a volume at `/data`, on a local disk (the file is in
WAL mode). Scheduling `devops/backup-db.sh` on the home server, with any `AFTER_BACKUP`, is the
user's job, outside this repo. Discord sign-in needs `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`
and `DISCORD_REDIRECT_URI` set on the host (README, "Hosting your own"), which is the user's job,
outside this repo. A game running when an image with accounts first starts is dropped, so deploy
between games.

## Workflow

- One branch per phase off an up-to-date `development` (`phase-1-housekeeping`, `phase-2-vite`, …),
  merged into `development` by pull request on the fork once every box in the phase is ticked.
- A single issue outside a phase gets its own branch and pull request through the `implement-issue`
  skill. Once CI is green it merges the pull request itself for an issue labelled `bug`, and any
  other once the user says yes in chat.
- Every pull request, a phase's or an issue's, is squashed into one commit on `development`: never
  a merge commit or a rebase. `development` asks for an approving review, so every merge is
  `gh pr merge --squash --admin`.
- Name every worktree for the work it holds (`pin-picker-confirm`, not a generated name such as
  `game-state-sync-b7a6ea`), and give its branch the same name. Rename a generated or prefixed
  branch (`claude/…`, `worktree-…`) before the first commit.
- Every pull request shows before-and-after screenshots of what it changes on screen, in a table
  near the top of its description: at least one desktop size and one phone size, the same
  scripted state in both, "before" from `development` and "after" from the branch. Commit the
  images under `docs/pr/<branch>/` on the branch and link them by raw URL pinned to that commit,
  so they still show after the branch is deleted. A pull request that changes nothing on screen
  says so in place of the table.
- At the end of every phase, before its PR is merged, bring the docs up to date with what the
  phase changed. That means `README.md` (what the fork adds, hosting, and the screenshots in
  `docs/images/` when the game screen looks different), `DEVELOPMENT.md`, this file, and anything
  else under `docs/` the phase left stale. Commit them on the phase's branch, so the PR merges
  with its docs.
- Every finding a review raises during a phase (per-task reviews, the whole-branch review, PR
  review), Minor ones included, is fixed on the phase's branch before its PR merges. Nothing is
  deferred to a later phase or left as a note. A finding that needs no change gets a stated reason
  in the review record instead.
- The phase's own PR ticks its "PR merged into `development`" box in `docs/PLAN.md`, in its last
  commit before the merge, so no follow-up PR is opened just for that tick. Boxes the user owns,
  such as a real game on the deployed build, stay unticked for the user.
- In a fork `gh` defaults to `upstream`, so pass `--repo jussaw/Secret-Hitler-Online` on every `gh`
  command. Never push to `upstream` or open pull requests against it.

## Commits

Conventional Commits, always with a scope: `type(scope): summary`, lowercase imperative summary,
no trailing period, at most 72 characters. Scopes in use: `frontend`, `backend`, `docker`, `devops`
(`devops/`), `ci`
(CI, `.github/workflows/`), `github` (the rest of `.github/`, such as the issue templates), `plan`
(`docs/PLAN.md` and its breakdowns), `docs` (other files under `docs/`), `skills`
(`.claude/skills/`), and for top-level documents the file's name (`readme`, `development`,
`claude`).

## Pointers

- `docs/PLAN.md` is the source of truth for progress. Tick a box in the same commit as the work it
  describes.
- Design spec: `docs/superpowers/specs/2026-11-11-self-hosted-fork-design.md`; accounts:
  `docs/superpowers/specs/2026-11-15-accounts-design.md`; game records and stats (#31, Phases 13
  to 22): `docs/superpowers/specs/2026-11-15-game-stats-design.md`, with the names and file owners
  the phases share in `docs/superpowers/plans/2026-11-15-game-stats-interfaces.md`.

## Constraints

- No new art (the header's speaker icons and the spectator count's eye come from the Lucide icon
  pack). Sound clips are CC0 only and listed in `docs/SOUND-CREDITS.md`.
- The WebSocket protocol stays backward compatible for spectators. Players need a signed-in
  session (accounts), and their packets only add fields (`you`); spectator support only adds
  fields and a query parameter, the END TERM countdown only adds `termTimer` and two commands, and
  recording games only adds `gameId` to every game packet.
- Never set `TEST_SIGN_IN` in the `Dockerfile` or CI's image job (the backup test sets it only on
  its own `docker run`), and never log a session token,
  an OAuth code, an access token or the Discord client secret, or put one in a URL or a file.
- Deploys go through the host's deploy tooling, never `docker compose up` from a checkout.
- This repo is public. Never write details of the personal infrastructure it runs on into files,
  commit messages, PR or issue text, or code comments: machine and host names, the hardware, other
  repositories (compose stacks, dotfiles), deploy and update tools, LAN addresses, ports, host
  paths, domains and subdomains, or the proxy, tunnel and monitoring setup. Write "the home server"
  or "the host" instead, and keep plans and acceptance notes generic (`https://<subdomain>/ping`).
  The one exception is the README's link to the live site, its public address and nothing more.
