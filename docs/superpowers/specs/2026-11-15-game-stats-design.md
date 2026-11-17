# Game records and stats: design

Date: 2026-11-15
Status: approved design, pending implementation plans (`docs/PLAN.md`, Phases 13 to 22)
Issue: [#31](https://github.com/jussaw/Secret-Hitler-Online/issues/31)
Builds on: Phase 12, accounts with Discord sign-in ([#30](https://github.com/jussaw/Secret-Hitler-Online/issues/30), merged
into `development` as #73)

## Why

The group already keeps a stats site for another board game. There, someone types each game in by
hand after it is played, so a record holds little more than who played and who won. Here the game
and the stats live in the same app, so the server can record every game itself, as it is played,
with everything that happens in it: every nomination, vote, hand of cards, discard, policy, power
and veto, and how long each player took over each decision. The stats can then answer questions no
hand-kept record can, such as how often a player was Liberal, or how often a Fascist chancellor
handed one Liberal and one Fascist policy enacted the Liberal.

Accounts (#30) make this possible: a player is the same person across names and lobbies, so their
games can be tied together.

The feature is large. The stats site it is modeled on grew to a 2,800-line stats module and a
2,000-line stats page over seven months, and this one also needs a recorder in the game server, a
schema, an endpoint and backups of the database. It is split into ten phases, each sized for one
agent session, each built by its own subagent and merged by its own pull request (see Phases).

Today (on `development`, with Phase 12):

- A game ends inside `Lobby.updateAllUsers`, which runs under the lobby's lock after every change:
  a player's command (`SecretHitlerServer.onWebSocketMessage` takes the lobby's lock, calls one
  `SecretHitlerGame` method, then `updateAllUsers`), a CPU player's move (`updateAllUsers` lets the
  CPU players act, one change per tick, then schedules the next tick) and the END TERM countdown
  (`Lobby` calls `endPresidentialTerm`, then `updateAllUsers`). `updateAllUsers` sends the state to
  everyone and, once `hasGameFinished()`, drops the game and its seats.
- `SecretHitlerGame` already exposes what a recorder needs: the state and the state before it, the
  round, the president and chancellor, the votes (kept until the next nomination), the president's
  and chancellor's cards while they choose, the peeked cards, the power's target (`getTarget()`),
  the policy counts, the election tracker, the draw pile's size, each player's role and whether they
  are alive.
- `Lobby.startNewGame` seats each live account under its current name and fills seats with CPU
  players (`Bot 1`, `Bot 2`, …) only when fewer than five accounts start the game. `gameSeats` maps
  each human seat to its account (`seatAccounts()`), and is backed up.
- A lobby times out 10 minutes after its last message from a player. The sweep
  (`removeInactiveLobbies`, every 60 s and once at start, after the backup loads) closes it under its
  lock (`Lobby.closeIfTimedOut`). A game running in it is lost.
- The SQLite file at `DATABASE_PATH` (`/data/backup.db` in the image) holds the lobby backup (one
  row, replaced every minute while lobbies change), `accounts` and `sessions`. Both of the server's
  connections to it wait up to 5 s on a busy file (`PRAGMA busy_timeout = 5000`). The image has no
  `sqlite3`, and nothing backs the file up.
- The page has no router: `main.tsx` renders `App`, which picks the login page, the lobby or the
  game from its state. The server serves the built frontend from `/public` with no fallback, so
  `/stats` is a 404.
- Account IDs are Discord user IDs (`test-…` for test accounts). #30 keeps Discord identities from
  other players.

The look of the new pages was settled with mockups. Screenshots are in
[`2026-11-15-game-stats/`](2026-11-15-game-stats/):

- `stats-layout.jpg`: the stats page as one long page or as tabs (tabs were picked)
- `games.jpg`: the GAMES list and the page of one game, with its timeline
- `player-and-phone.jpg`: a player's page, and the OVERVIEW tab on a phone

Sizes, spacing and the made-up numbers in the screenshots are close, not exact. The real pages use
the game's fonts, colours and card look.

## Goals

1. **Every game is recorded, by the server, as it happens.** No entry form, no import, no editing.
   Each game's record holds its seats, roles and result and a timeline of everything that happened
   in it, with times. Finished games, games with CPU players, and games abandoned when their lobby
   timed out are all recorded, each exactly once.
2. **The database is backed up before the first game is recorded.** A backup script takes a
   consistent, checked snapshot; a restore script puts one back; an optional hook copies each backup
   off the host.
3. **A stats section** at `/stats`, in tabs (OVERVIEW, ROLES & CARDS, VOTES & POWERS, RIVALS,
   ENDINGS, ACTIVITY, RECORDS), with a player filter and a toggle for games with CPU players at the
   top. Ratings are Elo with a handicap per player count.
4. **Game history:** a filterable list of every recorded game, and a page per game with its whole
   timeline, round by round.
5. **Player pages:** each player's numbers on one page, with trophies.
6. **Easy to reach:** links from the login page, the lobby and the victory screen.

## Non-goals

- Adding, editing, importing or deleting a game by hand, and any admin page.
- Stats for CPU players themselves.
- Anything about a game in progress: nothing of a running game reaches the stats until it ends.
- Signing in to see the stats, or hiding a player from them. The stats are public, like watching.
- Discord names, avatars or IDs anywhere in the stats.
- Copying backups off the host from within this repo (only a hook the user fills in).
- Computing or caching stats on the server.
- Games played before recording ships.

## Anti-goals (a failure even if it works)

- A game slowed, stalled or broken by the recorder, by a database write or by the stats.
- A game recorded twice, or a finished game left without a record (outside the known limits).
- A secret out before its game ends: no role, hand or peek of a running game in any record, response
  or page.
- An account ID or Discord ID in any response the stats read, or on any stats page.
- A backup that could be torn, or a restore that leaves a half-replaced database.
- A CPU player's choices moving a person's numbers while the CPU toggle is off.
- The game page's download growing because of the stats pages.
- Any detail of the home server (host names, paths, services, addresses) in the scripts, their
  examples or the docs.

## Constraints

- `SecretHitlerGame` and `CpuPlayer` pin no `serialVersionUID`, so neither gets a new field or a new
  non-private method. Whatever the recorder keeps during a game lives in `Lobby`, which pins its
  `serialVersionUID`. A backup written before the recorder still loads; its new fields come back
  null (see The recorder).
- No database call while a lobby's lock is held (the rule Phase 12 set).
- The players' WebSocket protocol only gains a field (`gameId`, see Getting there). Spectators stay
  backward compatible.
- No new runtime dependency on the server (sqlite-jdbc, Jackson and org.json are there) or in the
  page (charts are drawn by hand). The image gains the `sqlite3` package.
- The stats pages load as their own code chunk, so the game's first download does not grow (beyond
  the one check of the path that picks the stats or the game).
- No new art: trophies are text badges in the game's colours; icons come from Lucide.
- The repo is public: `devops/.env` is git-ignored, and the scripts, `devops/.env.example` and the
  docs name no real host, path, domain or service.
- The stats pages may scroll down but never sideways, at every size the layout tests cover
  (320x568 to 1920x1080, the square desktops and narrow windows included), with 44px targets and
  16px field text on phones. Wide tables and matrices scroll inside their own card.

## Approaches

The user picked each of these.

**Where the stats are computed.**

- **A. In the browser (picked).** The server stores each record and serves all of them in one
  cached response; the page computes every stat in TypeScript. The filter and the CPU toggle
  recompute at once, the Elo replay and the viewer's time zone run on the page, and a new stat
  changes only the frontend. The download grows about 3 KB per game (under 100 KB compressed per
  year of play at the group's pace).
- B. On the server: Java computes each section per request. A small, fixed download, but a round
  trip per filter change, the stats competing with games for the home server's CPU, and every stat
  written in Java and again in the page.
- C. Per-seat tallies on the server, sums in the browser: the smallest download, but a schema change
  and a backfill for each new stat, and each definition in two languages.

**Charts.** **Hand-written SVG components (picked)**, as the reference site draws all eight of its
charts: no dependency and the game's exact look, with hover details and axes written by hand.
Recharts was the alternative: less code per chart, but a dependency to style and keep up to date.

**Games with CPU players.** **Recorded and listed, not counted (picked), with a toggle.** They show
in game history and on player pages, tagged, and by default count toward no stat. The stats pages'
"Include games with Bots" toggle counts them (the user's word for CPU players on the stats pages). The alternatives were counting them always, or
not recording them.

**Unfinished games.** **Recorded as unfinished (picked):** a game whose lobby times out is saved with
everything up to that point and no winner, listed but counted toward no stat. The alternatives were
counting its actions in the action stats, or not saving it.

**Elo for a team game.** **Team average with a handicap per player count (picked).** Each side's
strength is the mean of its players' ratings, the handicap is learned from the group's own earlier
games, and everyone on a side moves by the same amount. The alternatives were no handicap, or
scoring each Liberal against each Fascist as a separate match.

**Copies off the host.** **A hook after each backup (picked):** an optional command in
`devops/.env`, run with the new backup's path. The alternatives were documenting host-only backups,
or building an upload to one kind of storage into the script.

**Stats page layout.** **Tabs (picked)**, each a short page with its own link, over one long page
with jump links.

**Getting there.** **Links from the login page, the lobby and the victory screen (picked).**

## Phases

Fifteen phases, each on its own branch and pull request into `development`, each built by one
subagent with its own step-by-step breakdown in `docs/superpowers/plans/`. The work was first cut
into ten; an audit judged five of them too large for one agent session, so each of those became an
A and a B phase (14, 15, 17, 21 and 22). A manager session runs them: one subagent per phase, never
two phases in one subagent, and phases that do not depend on each other at the same time, each in
its own worktree.

| Phase | Branch | Needs | What it delivers |
|---|---|---|---|
| 13. Database backups | `phase-13-db-backups` | 12 | WAL mode, `sqlite3` in the image, `devops/backup-db.sh`, `restore-db.sh`, the hook, their test in CI |
| 14A. Game timeline | `phase-14a-game-timeline` | 12 | `GameSnapshot`, `TimelineDiff`, the timeline in `Lobby` and its backups, `Lobby.gameId()`, the record handed to a sink; no database |
| 14B. Game records | `phase-14b-game-records` | 14A, and 13 merged first | The tables, player numbers, the writer thread, the load-time drop, `GET /api/stats/games`, the contract fixture |
| 15A. Stats shell | `phase-15a-stats-shell` | 14B | `gameId` in packets, the `/stats` fallback and lazy chunk, the record types, routes, `StatsLink`, `PlayerName`, `format.ts`, the page placeholders, the shared browser-test helpers |
| 15B. Game history | `phase-15b-game-history` | 15A | GAMES and its filter; the links in from the login page, the lobby and the victory screen |
| 16. The game page | `phase-16-game-page` | 15A | Rounds from a timeline, `/stats/games/<id>` |
| 17A. Stats engine | `phase-17a-stats-engine` | 15A | Counting rules, Elo, the shared cards and tables, the line and stacked bar charts, the filter and CPU toggle, the tab row with all seven tabs as placeholders |
| 17B. OVERVIEW | `phase-17b-overview` | 17A | `overview.ts` (with `winStreaks` and `playerOfTheMonth`), OVERVIEW |
| 18. ROLES & CARDS | `phase-18-roles-cards` | 16, 17A | Role and card stats, win rates by role and size |
| 19. VOTES & POWERS | `phase-19-votes-powers` | 16, 17A | Election, vote and power stats, survival |
| 20. RIVALS and ENDINGS | `phase-20-rivals-endings` | 16, 17A | Pairs, matrices, how games end, game length |
| 21A. ACTIVITY | `phase-21a-activity` | 16, 17A | Activity in the viewer's time zone, decision times, the bar chart and the heatmap |
| 21B. RECORDS | `phase-21b-records` | 21A, 17B | Streaks, best periods, player of the month, sessions, rating records |
| 22A. Trophies and name links | `phase-22a-trophies-links` | 17B, 18, 19, 20, 21B | Trophies, RECORDS' trophy holders, the game page's Elo change; names become links everywhere |
| 22B. Player pages | `phase-22b-player-pages` | 22A | PLAYERS and the player page |

So they run in eight waves:

1. **13 and 14A** together.
2. **14B**, merged after Phase 13: the backups land before the first record is written.
3. **15A.**
4. **15B, 16 and 17A** together.
5. **17B, 18, 19, 20 and 21A** together.
6. **21B.**
7. **22A.**
8. **22B.**

**Keeping parallel phases apart.** Phase 15A creates a placeholder file for every page it routes to,
so no later phase edits the route table. Phase 17A makes the tab row with all seven tabs, each tab a
page of its own file (`frontend/src/stats/tabs/`) saying "Coming in a later update." until its phase
fills it. Each phase then fills its own tab files, its own stat modules
(`frontend/src/stats/<topic>.ts`) and its own charts, and touches no shared file but the docs.
Phase 16 owns `rounds`; later phases only read it. `PlayerName` accepts `link` from Phase 15A, and
each tab's owner shows names inside a sentence or headline with `link={false}`, so Phase 22A, which
makes names links, edits no other phase's tab. The waves' phases each start from the same point
and, when one merges, the others rebase onto `development` and resolve the docs' conflicts, keeping
both sides. The interfaces file
(`docs/superpowers/plans/2026-11-15-game-stats-interfaces.md`) lists who owns which file.

Phases 13 and 14A run together; 14A's change to `SecretHitlerServer` is the sweep's unfinished
record, and 13's is WAL and the startup line. Each keeps its change in `main` to a call or two and
puts the rest in methods of its own, so the second to merge resolves a small conflict.

Phase 12 (#73) is merged into `development`, so Phases 13 and 14A start from `development`. The
design documents (this spec, the interfaces file, every breakdown and the `docs/PLAN.md` sections)
reach `development` first, through a docs-only pull request. Every pull request is squashed into one
commit on `development` (`CLAUDE.md`), so a phase that started from another phase's branch is moved
onto `development` with `git rebase --onto` once that branch is merged.

## Design

### Database backups (Phase 13)

**WAL.** At start, the server puts the database file in WAL mode (`PRAGMA journal_mode = WAL`,
retried while the file is busy, for up to 5 s), so a backup's read never blocks a write and a write
never fails because a backup is reading. Both connections keep their 5 s busy timeout. Without
`DATABASE_PATH` nothing changes.

**The image** installs the `sqlite3` package in its final stage (before `USER 1000:1000`).

**Settings.** Both scripts read `devops/.env` (or the file named by `ENV_FILE`); a variable already
set in the environment wins. `devops/.env` is git-ignored; `devops/.env.example` documents:

| Setting | Default | Used by |
|---|---|---|
| `CONTAINER_NAME` | `secret-hitler-online` | both |
| `DB_PATH` | `/data/backup.db` (the image's `DATABASE_PATH`) | both |
| `BACKUP_DIR` | none; required | backup |
| `RETENTION_DAYS` | `30` | backup |
| `AFTER_BACKUP` | empty (no hook) | backup |
| `STARTUP_TIMEOUT_SECONDS` | `120` | restore |

Both need only `docker` and `sha256sum` (or `shasum -a 256`).

**`devops/backup-db.sh`**, run on the host (for example nightly from cron):

1. Stops at once unless the container is running.
2. Inside the container: `sqlite3 -bail -cmd ".timeout 5000" "$DB_PATH" "VACUUM INTO '<tmp>'"`, a
   temporary file beside the database. One consistent read while the server keeps writing.
3. Inside the container: `PRAGMA integrity_check` on the snapshot must print exactly `ok`, and its
   SHA-256 is taken.
4. `docker cp` copies it to a temporary file in `BACKUP_DIR`; its SHA-256 on the host must match.
5. Moves it into place as `secret-hitler-<UTC timestamp, %Y%m%dT%H%M%SZ>.db` and writes
   `<same>.db.sha256` beside it (each through a temporary file and `mv`).
6. Deletes `secret-hitler-*.db` and `secret-hitler-*.db.sha256` files in `BACKUP_DIR` older than
   `RETENTION_DAYS` days, and nothing else.
7. If `AFTER_BACKUP` is set, runs it as `sh -c "$AFTER_BACKUP" sh <path of the new backup>`, so the
   command gets the path as `$1`. If it fails, the script says so and exits non-zero (cron reports
   it); the backup stays.

Any failure before step 5 stops the script non-zero and leaves no backup behind. A trap removes the
temporary files on the host and in the container (and the snapshot's `-wal` and `-shm`, if any) on
every exit.

**`devops/restore-db.sh <file>`**:

1. Refuses a file whose first 16 bytes are not `SQLite format 3\0`, and one with no `<file>.sha256`
   or whose hash does not match it. Nothing is stopped yet.
2. Asks the user to type the container's name to go on; anything else stops it.
3. Reads the container's image (`docker inspect`) and stops the container.
4. In a one-off container of that image (`docker run --rm --network none --user root
   --volumes-from <container> -v <file>:/restore/backup.db:ro <image> sh -euc …`): copies the file
   beside the database, checks its hash again, makes it owned by uid 1000, removes the database's
   `-wal`, `-shm` and `-journal` files, and moves the copy into place.
5. Starts the container and waits for the server's startup line in its logs (the server logs one
   clear line once it listens; Phase 13 adds it if Javalin's own line will not do), failing if the
   container exits or `STARTUP_TIMEOUT_SECONDS` pass.

A restored file brings back its lobby backup too; lobbies past the 10-minute timeout are swept at
start, as after any restart (from Phase 14, a game in one is recorded as unfinished).

**Tested in CI.** `devops/tests/backup-restore.test.sh` runs against the image built from the
branch: it starts a container with `TEST_SIGN_IN=true` and a fresh volume, keeps the server writing
(test sign-ins, which write accounts and sessions), takes a backup while it writes and checks that
it passes its checks, restores it and finds the same rows in every table (so tables later phases add
are covered without changing the test),
checks that `AFTER_BACKUP` runs with the path and that a failing hook exits non-zero, and that a
file that is not SQLite, or whose hash does not match, is refused before the container is stopped.
A new CI job runs it on pull requests.

**Docs.** `README.md`'s hosting section and `DEVELOPMENT.md` say how to take, schedule (a generic
cron line) and restore a backup, what `AFTER_BACKUP` is for, and that a backup kept on the same host
does not survive losing that host.

### The record

A record is one JSON object, the same in the database, in the response the stats read and in the
page's types. Format 1:

| Field | Meaning |
|---|---|
| `id` | The game's ID: a random UUID made when the game starts |
| `format` | `1` |
| `startedAt`, `endedAt` | Epoch milliseconds (UTC) |
| `outcome` | `LIBERAL_POLICIES`, `HITLER_EXECUTED`, `FASCIST_POLICIES`, `HITLER_ELECTED` or `UNFINISHED` |
| `winner` | `LIBERAL`, `FASCIST`, or `null` when unfinished |
| `complete` | `false` when the timeline does not start at the game's start (see Restored games) |
| `hasCpu` | Whether any seat was a CPU player |
| `liberalPolicies`, `fascistPolicies` | The board at the end |
| `rounds` | The last round number |
| `seats` | In turn order (a seat's index is its number in `events`): `player` (the player number, `null` for a CPU player), `name` (the name at the time), `cpu`, `role` (`LIBERAL`, `FASCIST` or `HITLER`), `alive` (at the end) |
| `events` | The timeline, oldest first |

Every event has `type`, `t` (milliseconds since `startedAt`, never going down) and `r` (the round
the move was made in, as `SecretHitlerGame.getRound()` counted it before the move: an `endTerm`,
pause or resume carries the term it belongs to, though the game's counter moves on inside
`endPresidentialTerm`). Seats are referred to by index; cards and policies are `L` or `F`. A chaos
`enact` (the third failed election, or an accepted veto with the tracker at 2) follows a `tracker`
event with `value` 3; the game puts the tracker back to 0 in the same move, with no event for it.

| `type` | Other fields | When |
|---|---|---|
| `nominate` | `president`, `chancellor` | The president named a chancellor |
| `vote` | `seat`, `ja` (boolean) | One per vote, in the order the server took them |
| `election` | `passed`, `ja`, `nein` | Voting closed |
| `tracker` | `value` | The election tracker moved up (a failed election or an accepted veto) |
| `draw` | `seat`, `cards` (three, in the order the president saw them) | The president's hand |
| `discard` | `seat`, `index`, `card` | The president's discard; the chancellor gets the other two |
| `veto` | `seat` | The chancellor asked to veto |
| `vetoAnswer` | `seat`, `accepted` | The president's answer |
| `enact` | `policy`, `by` (`chancellor` or `chaos`), `seat` (the chancellor; absent for chaos), `liberal`, `fascist` (the board after) | A policy was enacted |
| `reshuffle` | `drawPile` (its size after) | The discards were shuffled back into the draw pile |
| `peek` | `seat`, `cards` | The president looked at the top three (recorded when they close it) |
| `investigate` | `seat`, `target`, `result` (`LIBERAL` or `FASCIST`) | |
| `execute` | `seat`, `target`, `role` | |
| `specialElection` | `seat`, `target` | |
| `endTerm` | `seat`, `by` (`president` or `countdown`) | The term ended |
| `timerPause`, `timerResume` | `seat` | The president paused or resumed the END TERM countdown |
| `disconnect`, `reconnect` | `seat` | A human seat's last connection closed, or one came back |
| `restored` | | The lobby came back from a backup after a restart |
| `end` | `outcome` | The game ended, or was abandoned |

A record never holds an account ID. Player numbers (below) are the only link between a seat and a
person.

### The recorder (Phase 14)

**Watching.** `Lobby` keeps, for the running game, its ID, its start time and its timeline. After
every change to the game it compares what the game shows now with what it showed last time and adds
the events between them: at the start of `updateAllUsers` (a player's command, the END TERM
countdown, a CPU tick) and after each CPU player's move inside it, so no two changes are ever seen
as one, except where one game method makes several (a failed third election enacting the top
policy, a policy unlocking a power or ending the game), which the comparison spells out in order.
The pause and resume commands, disconnects and rejoins add their events where `Lobby` handles them.
`SecretHitlerGame` does not change.

The comparison is a pure function from two snapshots of the game to the events between them (like
the page's `roundStep` and `soundEvents`), so it is tested without a lobby.

**Records.** When `updateAllUsers` sees the game finished, before it drops the game, `Lobby` takes an
immutable copy of everything the record needs (header, seats with their accounts, timeline) and
hands it to the recorder. When the sweep closes a lobby in a game (`closeIfTimedOut`, including the
sweep at start after a restore), the same happens with `outcome` `UNFINISHED` and `endedAt` the
sweep's time, and the lobby drops the game, so no CPU tick or countdown plays on in a closed lobby.
Taking the copy is cheap and happens under the lock; everything else happens on the recorder's own
thread.

**Writing.** One background thread writes records, so a game never waits on the database:

1. It gives each account in the record a player number (`players`, below), the first time it sees
   it.
2. It writes the game and its seats in one transaction, with the record's JSON carrying player
   numbers only. A second write of the same game ID changes nothing (`INSERT OR IGNORE` or the
   like), so a game is never recorded twice.
3. If the database fails, the record waits in memory and is tried again on the 60 s timer; the
   shutdown hook tries the waiting records once before the last lobby backup. A record is lost only
   if the server stops before the database comes back (Known limits).

**Restored games.** The game ID, start time and timeline are backed-up fields of `Lobby`, serialized
with the game under the lobby's lock so the two always match (today `storeLobbies` serializes with
no lock held, so `Lobby` gains a `writeObject` that takes its own). A lobby restored after a restart
adds a `restored` event and goes on recording. A game restored from a backup written before the
recorder existed has no timeline (the timeline field comes back null): it gets an ID and a start
time at the restore, a `restored` event at `t` 0, and its record is marked `complete: false`.

After a game ends, `Lobby` marks itself changed, so the next 60 s tick backs it up without the
finished game.

**A finished game never comes back.** For up to a minute after a game ends, the database holds its
record and a lobby backup in which it still runs: a crash in that minute, or a restore of a database
backup taken in it, would bring the game back to play, though its roles and hands are already public.
So when the lobby backup loads, before the start-up sweep, any restored game whose ID already has a
record is dropped (one read at start, under no lock): its lobby comes back idle, as if its backup had
caught up, with a log line naming the lobby. The game did end; its record stands.

**Tables** (created if missing at start, in the same file):

- `players`: `number` (integer primary key, autoincrement), `account_id` (text, unique),
  `created_at` (epoch ms). Numbers are given in the order players are first recorded.
- `games`: `id` (text primary key), `format`, `started_at`, `ended_at` (epoch ms, indexed),
  `outcome`, `has_cpu`, `record` (the JSON).
- `game_seats`: `game_id`, `seat` (primary key together), `player_number` (null for a CPU player,
  indexed), `name`, `role`.

Without `DATABASE_PATH`, records go to an in-memory database of the recorder's own (the account
store's belongs to its one connection) and are gone at restart; names are read through the account
store, not a join.

**`GET /api/stats/games`** answers `{"players": [{"number", "name"}], "games": [record, …]}`: every
player with their account's current name, and every record, oldest first (by `endedAt`, then `id`).
It needs no sign-in. The server keeps the serialized response until the next record is saved or an
account is renamed, sends it compressed with an `ETag`, and answers a matching `If-None-Match` with
304. A database failure is 503. The dev server's proxy adds `/api`.

**A contract fixture.** A Gradle task plays a fixed number of seeded games with CPU players in every
seat, records them as if accounts held the seats, and writes the response to
`frontend/src/stats/fixtures/recorded-games.json`, committed. The page's tests read it, so the Java
and TypeScript sides of the format are checked against each other.

### The stats pages: shell and routes (Phase 15A)

`main.tsx` renders the stats when the path is under `/stats`, `/games` or `/players` (whole
segments; `/games` and `/players` since Phase 23), and the game otherwise. The stats load as their
own chunk (`React.lazy`), with no part of `App`. The server answers every path under those three
with `index.html` (Javalin's single-page fallback, by whole segments, so never the players'
socket, `/game`); the dev server already does.

| Path | Page |
|---|---|
| `/stats` | OVERVIEW |
| `/stats/roles`, `/stats/votes`, `/stats/rivals`, `/stats/endings`, `/stats/activity`, `/stats/records` | The other tabs |
| `/games` | GAMES: the list |
| `/games/<id>` | One game |
| `/players` | PLAYERS: the list |
| `/players/<number>` | One player |

GAMES and PLAYERS were `/stats/games…` and `/stats/players…` until Phase 23 moved them out of
`/stats`; the page moves an old address to its new one, query and all.

Moving between them changes the address (the History API) without reloading, and the back button
works. The records are fetched once per visit.

**The header** is the game's: SECRET-HITLER and PLAY · STATS · GAMES · PLAYERS (PLAY goes to `/`;
it came last until Phase 23, which made the header the login page's too and put PLAY first),
the current one underlined. On phones the links sit in a row under the title, each a 44px target.

**The filter and the CPU toggle** (Phase 17A) sit at the top of every tab and the PLAYERS list, and
their state is in the address (`?players=1,3,4&cpu=1`), so it carries across tabs and in shared
links:

- **Players:** each player's name as a chip, all on by default. Turning some off keeps only the games
  whose every human seat is a player still on.
- **Include games with Bots** (games with CPU players): off by default.

On phones they fold into one line ("Players: 7 of 8 · CPU off") that opens a panel.

**The tabs** (Phase 17A: OVERVIEW, ROLES & CARDS, VOTES & POWERS, RIVALS, ENDINGS, ACTIVITY, RECORDS)
are a row of buttons under the filter; on phones they scroll sideways. Until Phase 17A, `/stats` shows
GAMES' link and the latest games.

**Cards.** Each stat is a card in the game's look (`stats-layout.jpg`): a Germania One title, a
one-line definition in plain words, then a ranked table or a chart. A card whose stat has no data
under the filter says so ("No games yet with these players.").

**The links in** (Phase 15B):

- The login page's footer and the lobby's footer get "Stats" beside "About this project". On the
  login page it opens in the same tab; in the lobby, in a new one, so the lobby stays open.
- The victory screen gets "See this game", which opens `/games/<id>` in a new tab. For it,
  every game packet, to players and spectators, carries **`gameId`**: the record's ID. It is not a
  secret.

### Counting rules (Phase 17A)

- **Counted games.** A game counts when it is not unfinished, has no CPU seat (or the toggle is on),
  and every human seat's player is on in the filter. Every stat counts only counted games, except
  GAMES, which lists every game, and the player page's game count, which says how many more games
  were not counted.
- **Sides.** The Liberal side is `LIBERAL` seats; the Fascist side is `FASCIST` and `HITLER` seats.
  "As Fascist" in a split by role means `FASCIST` seats only, beside "as Hitler".
- **Teammates.** Two seats on the same side.
- **A minimum sample.** A rate needs at least 5 counted games, or 5 chances for a rate over chances
  (`MIN_GAMES`, `MIN_CHANCES`). Below it a player shows "—" and their count, and is not ranked.
- **Ties.** Equal values share a rank, then more games (or chances) first, then names in alphabetical
  order, unless a stat says otherwise.
- **Time.** Dates, weeks, months, days of the week and hours are the viewer's, from the browser's
  time zone, worked out with `Intl` so a function can take an explicit zone (tests pin one). Weeks
  start on Monday (ISO). Every period uses a game's start; only "days since the last game" uses its
  end. A **session** is a run of games each starting less than 3 hours after the previous one
  ended, so a game night past midnight is one session.
- **CPU seats** are never ranked and have no stats. With the toggle on, their games count for the
  humans in them.
- **Decision times** (Phase 16 works them out in `rounds`; Phase 21A shows them) run from the event
  that asked for a decision to the event that made it: a nomination from the previous `endTerm` (or
  the game's start, or a `restored` event), a vote from the `nominate`, a discard from the `draw`,
  the chancellor's choice from the `discard` to the `enact` or `veto`, and again from a refused
  `vetoAnswer` to the `enact`, a veto answer from the `veto`, a power from the `enact` that gave it,
  and END TERM from the term's last action. CPU decisions are left out, and so is any span with a
  `restored` event in it.

### Elo (Phase 17A)

- Everyone starts at 1500. A player is **provisional** until they have 5 counted games.
- Counted games are replayed in order (`endedAt`, then `id`), using the ratings from before each
  game.
- A side's strength is the mean of its seats' ratings. With the CPU toggle on, a CPU seat counts as a
  fixed 1500 and is never rated.
- **The handicap.** For a game with `n` seats, `p` is the Liberal win rate in earlier counted games
  with `n` seats, pulled toward a half by five imaginary games each way: `p = (Liberal wins + 5) /
  (games + 10)`. The handicap is `H = 400 · log10((1 − p) / p)` points added to the Fascist side
  (negative when Liberals win more often).
- The Liberal side's expected score is `E = 1 / (1 + 10^((F + H − L) / 400))`, where `L` and `F` are
  the two sides' means. With `S` 1 for a Liberal win and 0 for a Fascist one, every Liberal gains
  `32 · (S − E)` and every Fascist loses as much.
- A worked case: 7 seats, Liberals average 1512, Fascists 1517, and Liberals won 3 of 10 earlier
  7-seat games, so `p = (3 + 5) / (10 + 10) = 0.4`, `H` is about +70 and `E` about 0.39. A Liberal
  win moves every Liberal up 19 and every Fascist down 19; a Fascist win moves each by 13 the other
  way. Unit tests pin these numbers. The total of all ratings stays put only when the two sides are
  the same size, which no real game has (hand-built records test it); a real game moves the total by
  the change times the difference in side sizes.
- Ratings are shown rounded. Elo is replayed on the counted games, so the filter and the toggle
  change it.

### OVERVIEW (Phase 17B)

- **Dashboard cards:**
  - **Days since the last game:** whole local days since the last counted game ended.
  - **Last game:** its winning side, how it was won, and a link to it.
  - **Win streak:** the current win-streak leaders (streak above zero, last played within 7 days),
    all tied leaders shown.
  - **Hot hand:** of the players who won at least 3 of their last 5 counted games (they must have
    played 5) and played within 7 days, those with the most wins in their last 5, ties all shown.
  - **Player of the month** (as in RECORDS).
- **Power ranking:** rank, name, Elo, the last change, counted games; provisional players at the
  bottom in italics.
- **Rating history:** a line per player, one point per counted game, carried flat through games they
  missed, dashed while provisional. Hovering (or tapping) a point shows the game and the change.
- **Headline:** games played, wins, win rate (`MIN_GAMES`), current and longest win streak, and the
  Liberal and Fascist side's wins in all.
- **Latest games:** the ten most recent, linked.

### ROLES & CARDS (Phase 18)

Roles:

- **Role split:** each player's share of counted games as Liberal, as Fascist and as Hitler.
- **Role luck:** their Liberal share minus the share their games should have given: the sum over
  their games of Liberal seats ÷ seats (3 of 5, 4 of 6, 4 of 7, 5 of 8, 5 of 9, 6 of 10), divided by
  their number of games.
- **Times as Hitler**, and each player's **longest run of one role**.
- **Win rate as Liberal, as Fascist and as Hitler** (`MIN_GAMES` each).
- **Win rate by player count:** a table of players by 5 to 10 seats.
- **First president:** win rate in games where they made the first nomination.

As president (`draw` and `discard`):

- **Hands drawn:** how often their three cards held 0, 1, 2 or 3 Liberals (FFF, FFL, FLL, LLL),
  beside the group's shares.
- **Liberal accuracy:** as a Liberal president holding both kinds, the share of discards that were a
  Fascist.
- **Deep cover (president):** the same share for Fascist and Hitler presidents: holding both kinds,
  how often they still discarded a Fascist. Its other side, discarding a Liberal while holding a
  Fascist, is shown with it.

As chancellor (the two cards left after the `discard`):

- **Given one of each:** the share of times they enacted the Liberal, as Liberal, as Fascist and as
  Hitler. A veto that was accepted is not counted; after a refused one, what they enacted is.
- **Policies enacted** as chancellor, by kind and by their role.
- **Vetoes asked for**, with the two cards behind each.

Blame:

- In a government whose president held at least one Liberal and which enacted a Fascist, exactly one
  person chose it: the president, if they discarded the Liberal of an FFL hand, or else the
  chancellor, who was handed one of each. **Fascist choices** counts each player's.
- **Forced Fascists:** for Liberal presidents, FFF hands; for Liberal chancellors, two Fascists
  handed to them.

### VOTES & POWERS (Phase 19)

Elections and votes:

- **Nominations:** times nominated as chancellor; as president, the share of their nominations that
  passed; as chancellor, the share of their elections that passed.
- **Picking a teammate:** as president, the share of nominations of a teammate, split by their side.
- **Ja rate:** the share of a player's votes that were Ja, by role.
- **Liberal vote accuracy:** a Liberal's vote is right when it is Ja on a government with no one from
  the Fascist side in it, or Nein on one with someone from it.
- **Fascist loyalty:** a Fascist-side voter's share of Ja on governments with a teammate other than
  themselves in them.
- **Voted Hitler in:** Liberal Ja votes on the election that made Hitler chancellor and ended the
  game.
- **Swing votes:** votes that alone would have flipped the result. A government passes on more Ja
  than half the votes cast (a tie fails), so with `need = floor(votes / 2) + 1`: a Ja on a vote that
  passed with exactly `need` Ja, and a Nein on one that failed with exactly `need − 1` Ja.
- **Lone dissent:** the only vote against all the others.
- **Failed elections:** as president, nominations voted down; and **chaos**: being the president
  whose failed election, or accepted veto, made the tracker enact the top policy (every chaos
  `enact`, the same ones ENDINGS counts).

Powers and survival:

- **Investigations:** how many, whom they investigated and what they saw; for Liberals the share
  that found someone from the Fascist side, for the Fascist side the share that investigated a
  teammate; and how often each player was investigated, by their role.
- **Peeks:** how many.
- **Executions:** how many; the share of targets from the Fascist side, split by the executioner's
  side; **Hitler executed** (each executor's count); times executed; times executed first in a game.
- **Special elections:** how many, and the share that picked a teammate.
- **Vetoes as president:** accepted and refused, by role.
- **Survival:** the share of counted games alive at the end, by role.

### RIVALS (Phase 20)

- **Teammates:** each pair's games on the same side and their win rate together. **Best duo:** the
  highest win rate together with at least 5 games together. **Best Fascist duo:** the same on the
  Fascist side.
- **Opponents:** each pair's games on opposite sides and each one's wins (every such game is won by
  one of them). Shown as a matrix of wins and losses.
- **Rivalries:** for pairs with at least 5 games on opposite sides, closeness is the distance of A's
  share of those wins from a half. **Closest:** the smallest; **most lopsided:** the largest. Ties:
  more games, then names.
- **Most played with** (any side), **nemesis** (most losses to one opponent; ties by more shared
  games, then name), **favourite opponent** (most wins against one).
- **Who trusts whom:** a matrix of how often each president nominated each chancellor.

### ENDINGS (Phase 20)

- **How games are won by player count:** a stacked bar per count of the four outcomes.
- **Liberal win rate by player count**, with the smoothed rate the Elo handicap uses beside it.
- **Game length:** minutes (start to end) and rounds; the average per player count; **fastest win**
  and **longest game**, with their players and links.
- **Final boards:** the closest finishes (the losing side one policy from winning: 4 Liberal or 5
  Fascist policies) and the most lopsided (the losing side's track at 0), listed with links.
- **Most chaos policies, failed elections and vetoes** in one game.

### ACTIVITY (Phase 21A)

All in the viewer's time zone.

- **Games over time:** per week or per month (a switch), and **cumulative games**.
- **Attendance:** a stacked chart of each player's games per period; **participation rate:** a
  player's counted games over all counted games.
- **Calendar heatmap:** the last 12 months up to the latest game, or any year with games; a day's
  shade is `ceil(count / busiest day · 4)` of four.
- **Day of the week** (Monday first) and **hour of the day** of each game's start.
- **Sessions:** games per session on average, and the most in one.
- **Busiest day, week and month; longest gap** between sessions in whole days; **days since the last
  game**.
- **Timing:** each player's average time to nominate, vote, discard, choose as chancellor, use a
  power and end a term; the **fastest voter** (of players with 30 or more timed votes, the same
  rule as the Speed Demon trophy) and the **slowest president**; the share of terms the countdown
  ended, and pauses; **dropped connections** during games per player.

### RECORDS (Phase 21B)

- **Win streaks:** the longest ever (ties go to the later end), the longest losing streak, and
  everyone's current streaks.
- **Most wins in a week and in a month:** each player's best, ties going to the later period.
- **Player of the month:** most wins in the current local month, ties all shown; and its **history**
  over completed months.
- **Most games in one session.**
- **Rating records:** the highest peak rating, and the **biggest upset**: the win with the lowest
  expected chance (`E` for a Liberal win, `1 − E` for a Fascist one), with its winners' gain and its
  losers' loss. Everyone on a side moves by the same amount, so with no CPU seats the biggest gain
  and the biggest loss are always that same game; they are not shown apart.
- **Trophy holders** (Phase 22A): each trophy and who holds it.

### GAMES and the game page (Phases 15B and 16)

**GAMES** (`games.jpg`, left) lists every recorded game, newest first, 20, 50 or 100 to a page
(default 20), with Previous, Next and page numbers, and "N games recorded". It does not use the stats
filter; it has its own, also in the address:

- **Players:** a game matches if any chosen player played in it.
- **From** and **To:** local dates, inclusive.
- **Size:** any, or 5 to 10 seats.
- **Ending:** any, one of the four outcomes, or unfinished.
- **Bots** (CPU players): any, without, or with ("With or without CPU", "Without Bots", "With Bots").

Each row shows the local date and time, the length, the result ("Liberals win · 5 Liberal policies",
"Fascists win · Hitler elected", "Unfinished after round 6 · 4 L, 3 F"), the seats in turn order
coloured by role (Hitler underlined), the seat and round counts, and a CPU tag. A row opens its game
(one link stretched over the row, never an anchor wrapped round the names, which become links of
their own in Phase 22A).

**The game page** (`games.jpg`, right) has a header with the result, date and time, length, rounds,
the final board, and the seats in turn order with their roles; from Phase 22A also the Elo change of
the game when it counted under the default filter (Elo arrives in Phase 17A, beside this page's
phase). Then each round, in order, a block edged in the colour of the
policy it enacted (grey for none):

- the nomination; the votes, Ja and Nein, by name, and the result; the election tracker;
- the president's three cards and discard, the chancellor's two cards and choice, any veto, with
  each decision's time;
- a **blame** note when a Fascist was chosen over a Liberal;
- the power and its result, how the term ended, pauses, and dropped connections;
- a reshuffle or chaos policy where one happened.

A record with `complete: false` says its first rounds were not recorded. An unfinished game ends with
"Unfinished: the lobby closed". An unknown ID gets a short "This game was not found" page.

Phase 16 builds **rounds from a timeline** (`rounds(record)`: one entry per round, with its
government, votes, cards, power and end), which the game page draws and every stat phase after it
reads.

### PLAYERS and the player page (Phase 22B)

**PLAYERS** lists every player with counted games: name, games, win rate, Elo and when they last
played, by Elo. It uses the stats filter.

**The player page** (`player-and-phone.jpg`, left) has the CPU toggle on its own (no player chips)
and ignores the player filter:

- **Header:** the name, counted games since their first, "+N with CPU players, not counted" when the
  toggle is off, when they last played, and their trophies.
- **Elo:** rating, rank, peak, and their rating history.
- **Win rate:** overall, as Liberal, as Fascist and as Hitler, and by player count.
- **Roles:** their split and role luck; current and longest win and losing streaks.
- **Cards:** hands drawn, Liberal accuracy, deep cover as president and as chancellor, Fascist
  choices.
- **Votes and powers:** Ja rate, vote accuracy or loyalty, investigations and what they found,
  executions, survival.
- **People:** most played with, best teammate, nemesis, favourite opponent.
- **Timing:** their average decision times.
- **Latest games**, linked, and "All N games", which opens GAMES filtered to them.

From Phase 22A a player's name anywhere in the stats links to their page.

### Trophies (Phase 22A)

Worked out from the stats on every load, never stored. Unless a rule says otherwise, a player needs 8
counted games for any trophy.

| Trophy | Rule |
|---|---|
| Regular | At least 20 counted games |
| Ever-Present | In at least half of all counted games (with the usual 8 of their own) |
| On Fire | A win streak of 3 or more, ever |
| On the Rise | Elo at least 1550, not provisional |
| Elite | Elo at least 1600, not provisional |
| Dominant Rivalry | At least 5 more wins than losses against one opponent, over 8 or more games on opposite sides |
| Familiar Foe | At least 10 games on opposite sides with one player |
| Hitler Hunter | Executed Hitler at least once (no minimum) |
| Chancellor Hitler | Won as Hitler by being elected chancellor (no minimum) |
| Deep Cover | As a Fascist (not Hitler) chancellor given one of each, enacted the Liberal at least half the time, over 4 or more chances |
| Honest Broker | Liberal accuracy of 100% over 10 or more mixed hands |
| Cursed Hands | Drew FFF at least 3 times as a Liberal president |
| Sharp Eye | Liberal vote accuracy of at least 75% over 30 or more votes as a Liberal |
| Survivor | Alive at the end of at least 90% of 10 or more games |
| Speed Demon | The fastest average vote of everyone with 30 or more timed votes (one holder; ties go to more votes, then the name) |

### Charts

Hand-written SVG React components in `frontend/src/stats/charts/`, each added by the phase that
first needs it:

| Chart | First used for | Phase |
|---|---|---|
| Lines | Rating history | 17A |
| Stacked bars | How games are won by player count (20), attendance (21A) | 17A, so both can use it |
| Bars | Games over time, day of the week, hour of the day | 21A |
| Calendar heatmap | Activity | 21A |

Each sizes itself from its card's width, uses the game's colours (Liberal blue, Fascist red, the
office orange) and fonts, shows the value under the pointer or a tap, and has a text description for
screen readers. Matrices (rivals, trust) are HTML tables, not SVG.

### Tests

Each phase carries its own tests; its breakdown lists them. In outline:

- **Backups (13):** the shell test above, in CI; a JUnit test that the server leaves the file in
  WAL mode.
- **Recorder (14):** the snapshot comparison for every event type, including the several-at-once
  cases; random games played by CPU players in every seat, many seeds, where replaying each recorded
  timeline from the start gives the game's final board, deaths, election tracker and outcome, and
  no event is missing or doubled; a finished game in a `Lobby` writes one record; a lobby swept
  mid-game writes one unfinished record; a game backed up and restored mid-game writes one complete
  record with a `restored` event, and one restored from a backup with no timeline writes one with
  `complete: false`; a restored game that already has a record is dropped at load, its lobby idle; a second write of an ID changes nothing; a failing database neither stalls the
  game nor loses the record while the server runs; no database call happens under a lobby's lock;
  the response has no account ID, answers 304 to its `ETag`, and changes when a record lands; a
  record of a running game is never served.
- **The page (15 to 22):** Vitest for every stat on small hand-built records with known answers, and
  on the contract fixture; Elo's worked case and its sum (with equal side sizes the total moves by
  zero); counting rules, the filter and the toggle; rounds from timelines; each card's empty state;
  the charts' sizes and descriptions. Playwright (`stats.spec.ts` and the layout specs, in every
  project): each page fits sideways at every tested size, with 44px targets and 16px field text on
  phones, against a large stubbed response (ten players with twelve-character names, hundreds of
  games); a real game played to its end through `e2e/driveGame.ts` shows up in GAMES and on its page,
  and its victory screen's link opens it; the links in from the login page and the lobby.
- **The game's own tests** keep passing, and the game's first download stays the same size within a
  small margin (checked from the build's output).

## Acceptance

- Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four
  Playwright projects, at the end of every phase.
- A backup taken while the server writes passes its checks and restores the same rows; a bad file
  is refused before anything stops (Phase 13).
- Every game played to its end, with or without CPU players, and every game abandoned mid-way, has
  exactly one record, and the record's timeline replays to the game's end (Phase 14).
- The stats pages show the numbers in this design for a known set of records, under the filter and
  the toggle (Phases 17A to 22B).
- `CLAUDE.md`, `README.md` and `DEVELOPMENT.md` describe what each phase adds.
- The user schedules the backup on the home server, plays games on the deployed build, and finds
  them in the stats. (The user's boxes.)

## Known limits

- Stats start with the first game played after Phase 14 deploys; nothing earlier is imported.
- A record waiting for a failed database is lost if the server stops before the database comes back.
- If the server stops within a minute of a game's end and its record could not be written before it
  stopped (the database failing as well), the lobby comes back with the game still running, and the
  record is made when it ends again.
- The stats are public: anyone with the address sees names, roles and every hand of every finished
  game.
- "See this game" opened before its record is saved (or while the database is failing) says "This
  game was not found." until the page is reloaded.
- The stats download grows by about 3 KB per game.
- Two viewers in different time zones can see a different player of the month, or week, at the
  boundaries.
- Backups stay on the host unless `AFTER_BACKUP` copies them elsewhere.
- Rolling back to an image from before Phase 14 leaves the new tables unread and loses the timeline
  of games in progress (their record, once the newer image is back, is `complete: false`).

## Left to the builder

- Class, package and file names, and how the snapshot comparison reads each change.
- How the recorder's thread, queue and retries are built, and whether it shares the account store's
  connection.
- The JSON's exact spelling where this design does not give it, as long as the Java writer, the
  fixture and the TypeScript types agree.
- Whether the shell test also uses stubbed `docker` calls for the refusal cases, beside the real
  image.
- How the contract fixture's games are seeded: `SecretHitlerGame` and `Deck` shuffle with unseeded
  randomness and cannot change, so seeding goes through the test source set (reflection, say), or
  the fixture is made once and regenerating it changes it.
- The discard's `index` when two of the president's cards are the same, and `endedAt` for an
  unfinished game (the sweep's time, say).
- Keeping the timeline in JDK types (lists and maps of strings and numbers), so a lobby backup still
  loads after a rollback to a build with a different recorder.
- The exact startup line the restore waits for.
- Chart internals, hover details and the look of each card within the game's style.
- Tie-breaks and empty states not given here, and messages, in the voice of the ones that are.
- How the page memoizes the stats per filter (computing every tab for 1,000 games should take well
  under a second on a phone).
