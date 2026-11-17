# Development setup for Secret Hitler Online

Requirements: Java 17 for the backend, Node.js 22.12 or newer for the frontend (tested with Node 24).

## Quick start using Docker:
- Run the backend and the frontend dev server with Docker Compose:
  - `docker compose up --build`
  - Open frontend: [http://localhost:3000](http://localhost:3000)
  - Backend health: [http://localhost:4040/ping](http://localhost:4040/ping)
  - Lobbies are backed up to SQLite on the `sh-data` volume (`DATABASE_PATH=/data/backup.db`), which also keeps the accounts, the sessions and the game records.
  - The backend runs `runLocal`, so the login page has TEST SIGN-IN (see [Signing in locally](#signing-in-locally)).
  - The containers run as root, so `frontend/node_modules`, `backend/build` and `backend/.gradle` in your checkout end up owned by root.

## Persistence

The server backs up all lobbies to a SQLite file every minute (when something changed) and on shutdown, and restores them on start. The same file holds the accounts and sessions, in two tables of their own (`accounts` and `sessions`), written as they change, and a record of every game that ends or whose lobby times out, in three more (`players`, `games` and `game_seats`), each written once, on a thread of its own, just after its game. Set `DATABASE_PATH` to the file to use, for example `DATABASE_PATH=/tmp/sh-backup.db ./gradlew runLocal`. With it unset, the server logs one error and runs without persistence: accounts and records live in memory and go when it stops.

At start, before anything else opens it, the server puts the file in SQLite's WAL mode (`PRAGMA journal_mode = WAL`), so a backup's read never blocks the server's writes; while it runs, `backup.db-wal` and `backup.db-shm` sit beside the file. A file that another process keeps busy is tried again for up to 5 s, after which the server logs an error and runs on in the file's old journal mode. Once it listens, the server logs `Secret Hitler Online is listening on port <port>.`, the line `devops/restore-db.sh` waits for.

To see a local run's records, as the stats pages will read them:

```bash
curl -s localhost:4040/api/stats/games
```

It needs no sign-in, and shows each player by number with their name now, never an account ID.

## Backing up and restoring the database

The README's [Backups](README.md#backups) has the whole of it: the settings, what each script checks, and what a restore brings back. In short, on the host that runs the container:

- Copy `devops/.env.example` to `devops/.env` (git-ignored) and set `BACKUP_DIR` to an existing directory, as an absolute path. The container is `secret-hitler-online` unless `CONTAINER_NAME` names another.
- Take a backup with `devops/backup-db.sh`, and schedule it with a cron line such as `0 4 * * * /path/to/Secret-Hitler-Online/devops/backup-db.sh >>/path/to/backup.log 2>&1` (leave out `2>&1` to have cron mail the errors).
- A backup kept on the same host does not survive losing that host. `AFTER_BACKUP` is a command run after each backup with the new backup's path as `$1`, for copying it elsewhere, such as `AFTER_BACKUP=cp "$1" "$1.sha256" /path/to/another/disk/`.
- Restore one, between games, with `devops/restore-db.sh /path/to/backups/secret-hitler-<UTC time>.db`, which needs the `.sha256` beside it and asks you to type the container's name.

## One port: the production layout

The backend serves the built frontend itself, so the whole app runs on one port:

```bash
cd frontend && npm install && npm run build      # writes frontend/dist
cd ../backend && ./gradlew jar                  # bundles frontend/dist into the jar as /public
PORT=4040 java -jar build/libs/secret-hitler-online.jar
```

Nobody can play on that server until someone can sign in: add `TEST_SIGN_IN=true` (test accounts, for local runs only) or the three Discord variables (below) in front of `java`. Without either, the server logs a warning at start and the login page only lets people watch.

The Docker image does the same in three stages: `docker build -t secret-hitler-online .` at the repo root, then `docker run -p 8080:8080 -v sh-data:/data secret-hitler-online`. CI publishes it as `ghcr.io/jussaw/secret-hitler-online` on every push to `development`. Players on the image need the Discord variables ([README](README.md#discord-sign-in)); the image never turns on the test sign-in.

## Running the backend and the frontend

This fork runs no hosted development backend, so even frontend-only changes need the server running locally. You'll need two terminal windows to run the frontend and backend. (`npm run dev:server` still reads `.env.dev`, which points at upstream's hosted development backend. That server has none of this fork's changes, spectators among them.)

### Running backend server

In your first terminal, clone the repo if you haven't yet. Navigate to the `backend` subdirectory, then use gradle to start the server.

```bash
git clone git@github.com:jussaw/Secret-Hitler-Online.git
cd Secret-Hitler-Online/backend

./gradlew runLocal
```

This will start the backend server at [`http://localhost:4040`](http://localhost:4040) by default. This also puts the server in debug mode, which allows cross-origin requests (only needed if a frontend on another origin calls it directly, such as with `VITE_SERVER_ADDRESS`) and lets a player's WebSocket in from any origin, and it turns on the test sign-in (below).

**Every time you make changes to Java files, you'll need to stop and restart the development server.**

You can also run the backend-server using your preferred IDE by launching the Main-method in `ApplicationTest` found in the test directory.

### Running frontend server

Open another terminal at the root of the project, and run the following commands.

```bash
cd frontend

npm install
npm run dev
```

Change dependencies with npm 11 (`npx npm@11 install …`): npm 10 drops the `libc` fields from `package-lock.json`.

The dev server proxies `/check-login`, `/new-lobby`, `/ping`, `/auth`, `/me`, `/api` and the `/game` WebSocket to the backend, so the page talks to its own origin, as it does in production. The proxy target is `BACKEND_URL` (default `http://localhost:4040`; compose sets `http://backend:4040`). `.env.development` only turns on debug logging.

### Signing in locally

Playing needs an account. `runLocal` turns on the test sign-in (`TEST_SIGN_IN`, which the server warns about at start), so the login page shows **TEST SIGN-IN** beside SIGN IN WITH DISCORD. Each press signs the browser in as a new test account, which then chooses a name. One browser holds one session, a cookie every tab shares, so for several players open each in a private window or another browser, or let CPU players fill the table: a lobby of fewer than 5 gets enough to make 5, and the host's − BOTS + beside START GAME adds more, up to 10. Sign out and press TEST SIGN-IN again for another account. Test accounts stay until the server stops, or in the `DATABASE_PATH` file.

To try Discord sign-in itself, create a Discord application in the [Discord Developer Portal](https://discord.com/developers/applications), add `http://localhost:3000/auth/discord/callback` to its OAuth2 redirects, and start the backend with its client ID and secret and that URL:

```bash
DISCORD_CLIENT_ID=<client id> DISCORD_CLIENT_SECRET=<client secret> \
  DISCORD_REDIRECT_URI=http://localhost:3000/auth/discord/callback ./gradlew runLocal
```

Discord then sends the browser back to the dev server on port 3000, which hands `/auth/discord/callback` to the backend. Keep the secret out of the repo and out of any file you commit.

### Frontend tests and build

From `frontend/`:

```bash
npm test              # Vitest in watch mode
npm test -- --run     # single run
npm run build         # type-check the app and the browser tests, then build into dist/
npm run preview       # serve dist/ on port 3000
```

### The stats pages

The stats pages are at `/stats` (the tabs), `/games` (GAMES and each game) and `/players` (PLAYERS and each player): [`http://localhost:3000/stats`](http://localhost:3000/stats) on the dev server, or the same paths on the jar's port, where the server answers every path under them with the page (whole segments only: `/gamesx` is a 404, and the players' socket stays at `/game`), so a reload or a link to any stats page works. The old addresses from before GAMES and PLAYERS left `/stats`, `/stats/games…` and `/stats/players…`, still work: the page moves them to the new ones, query and all. The dev server's proxy sends `/game` itself to the backend, never `/games`. The login page has their header too (`src/header/SiteHeader.tsx`, which the stats pages draw through `StatsHeader`), so a change to it shows on both, and `stats-shell.spec.ts` checks the two match at every size. They load as a code chunk of their own, so the game's first download does not grow; after `npm run build`, `npm run first-download` prints each file `dist/index.html` loads with its gzipped size and the total, which a stats phase must leave as it was, within the small margin its plan allows.

Games are recorded as they finish (or when their lobby times out), so to see one locally, sign in with one test account, create a lobby and start it: four CPU players fill the seats, and once the game ends its record is in `GET /api/stats/games` and on the stats pages after a reload.

GAMES (`/games`) keeps its filter in the address, so a filter can be tried by typing it: `players` (player numbers, comma-separated: a game matches if any of them sat in it), `from` and `to` (`YYYY-MM-DD`, the viewer's local day of the game's start, both inclusive), `size` (5 to 10 seats), `ending` (`liberal-policies`, `hitler-executed`, `fascist-policies`, `hitler-elected` or `unfinished`), `cpu` (`without` or `with`), `per` (`50` or `100` games a page; 20 by default) and `page`. For example `/games?players=1,3&from=2026-10-01&size=7&cpu=without&page=2`. Any other value reads as the default, an unknown player number is ignored, and a page past the last shows the last.

PLAYERS (`/players`) lists every player with a counted game, by name; each column's heading sorts by it, and the search box left of the Bots switch narrows the list by name. Neither is kept in the address, so a reload opens in name order with no search. Like a player's page it has no player chips, only the Bots switch (`?cpu=1`), and it ignores a `players` list in the address, which its switch's next change drops. A player's page is `/players/<n>`, `n` being the player's number in `GET /api/stats/games`'s `players` (every name in the stats links to it): it reads only `cpu=1` from the address and ignores `players`. A number no player has shows "This player was not found.", and `0` (no player's number) the stats' "This page was not found.".

The browser tests check the stats pages' layouts without playing games: they stub `/api/stats/games` with `bigStatsData()` (`e2e/stats.ts`, 400 games of ten players with twelve-character names, the same on every run), and each `stats-*.spec.ts` runs in every project and checks its pages with `checkStatsPage`, at every size its project covers: no sideways scroll, and wherever the game's stacked query matches (phones, phones held sideways, and narrow and tall windows) 44px targets and 16px field text. Only `stats-games.spec.ts` plays a real game, on `desktop`, to find it in GAMES and follow its victory screen's link. Players' names are links to their pages, and `stats-names.spec.ts` checks them across every tab, GAMES and a game page: 44px targets that never overlap in a table where the stacked query matches, a name in GAMES opening its player's page rather than the row's game, and a game page's Elo change. `stats-players.spec.ts` checks PLAYERS (and that it ignores `?players=`), the busiest player's page and an unknown player's at every size, a name in GAMES opening its player's page, All N games opening GAMES filtered to the player, and the player page's CPU switch. Dates are the viewer's: the stats' unit tests pass an IANA zone to the functions that take one (`computeActivity(games, now, "UTC")`, say) rather than set `process.env.TZ`, and the browser tests that need another zone set Playwright's `timezoneId` (`stats-activity.spec.ts`, `stats-records.spec.ts`).

### The stats pages' fixture

`frontend/src/stats/fixtures/recorded-games.json` is what `GET /api/stats/games` would serve for 62 or more games played by CPU players, recorded as if twelve accounts held the seats. The stats pages' tests read it, and `RecordedGamesFixtureTest` checks it against the record's format, so the Java and TypeScript sides agree. After a change to the format, remake it from `backend/` and commit it with the change:

```bash
./gradlew recordedGamesFixture
```

The games cannot be seeded, so every run writes a different file.

### Browser tests

The Playwright tests build the frontend and the jar, serve them on port 4545 and drive the whole app in desktop Chrome, Firefox and two emulated phones. They turn on the test sign-in themselves (`TEST_SIGN_IN=true` in `playwright.config.ts`'s `webServer.env`) and sign every player in through it. They need Java 17 active for the Gradle wrapper, and network access, because the web fonts come from Google Fonts and a test fails when they do not load. From `frontend/`:

```bash
npx playwright install chromium firefox   # once
npm run e2e                               # every project
npm run e2e -- --project=phone-360        # one project
```

Names are unique across accounts, so every name a test gives the server comes from `uniqueName` (`e2e/accounts.ts`) and carries the run's three digits, `E2E_RUN`, which `playwright.config.ts` sets when the run starts. A second run against the same server (as below) then takes none of the first run's names. Set `E2E_RUN` to three digits yourself to make a run's names again.

To run two at once, in two worktrees, give each its own port with `E2E_PORT` (`E2E_PORT=4601 npm run e2e`). A run builds for a minute or two before its server starts, and it waits for any server on its port to answer `/ping`, so a second run on the same port can end up testing the first run's code without an error. A run that stops at once with `http://localhost:4545/ping is already used` has found another server on its port.

### Browser tests on Linux

CI runs the browser tests on Linux, where Germania One is drawn wider than on macOS at phone sizes, so a line with little room to spare can pass on a Mac and wrap on CI. Firefox may also fail to launch on macOS. Playwright's Linux image covers both: it runs the tests against the jar serving on the host, with `playwright.linux.config.ts` (the repo's config, without its own server).

Build the app and serve it on the host with the test sign-in, which the tests sign in with, from the repo root with Java 17 active (a local command only: never set `TEST_SIGN_IN` in the image):

```bash
(cd frontend && npm run build) && (cd backend && ./gradlew jar)
TEST_SIGN_IN=true PORT=${E2E_PORT:-4545} java -jar backend/build/libs/secret-hitler-online.jar
```

Then, in a second terminal from the repo root, run the projects you need. The image's version is the one `frontend/package.json` pins for `@playwright/test`, `-e E2E_PORT` passes the port on when it is set, and the unnamed volume keeps the image's `node_modules` apart from the host's (`--rm` deletes it afterwards):

```bash
docker run --rm --ipc=host --add-host=host.docker.internal:host-gateway -e E2E_PORT -v "$PWD":/work -v /work/frontend/node_modules -w /work/frontend "mcr.microsoft.com/playwright:v$(node -p "require('./frontend/package.json').devDependencies['@playwright/test']")-noble" bash -c "npm ci && npx playwright test --config playwright.linux.config.ts --project=firefox"
```

The jar serves the `frontend/dist` it was built with, so rebuild both and restart it after a change to the page. Stop it when you are done.

### Backup and restore tests

`devops/tests/backup-restore.test.sh` tests `devops/backup-db.sh` and `devops/restore-db.sh`. From the repo root, with Docker running and `curl` installed:

```bash
bash devops/tests/backup-restore.test.sh
```

It builds the image from the checkout under a tag of its own (minutes the first time, then from Docker's layer cache), unless `IMAGE` names one, as CI does (`IMAGE=secret-hitler-online:backup-test`). It runs the stubbed cases first, against a stub `docker` first on `PATH` (the refusals, the failure paths and the settings), then a real container of the image with `TEST_SIGN_IN=true` on a fresh volume: it keeps signing test accounts in while it takes a backup, checks the backup and the hook, refuses bad files without stopping the server, then restores the backup and finds every table's rows as they were. It prints `backup-restore tests passed`, or the failing case, and removes the container, the volume, the tag it built and its temporary files either way. It never reads `devops/.env`: each case reads an empty settings file. It runs on macOS's bash 3.2 and on Linux.

To try the scripts by hand, run the image as a container of your own and point the scripts at it and at a scratch directory. The environment wins over `devops/.env`, and an empty `ENV_FILE` keeps a real `AFTER_BACKUP` in it from running:

```bash
docker build -t secret-hitler-online . && docker run -d --name sh-try -e TEST_SIGN_IN=true -p 127.0.0.1:8080:8080 -v sh-try-data:/data secret-hitler-online
dir=$(mktemp -d) && : >"$dir/empty.env"
ENV_FILE="$dir/empty.env" CONTAINER_NAME=sh-try BACKUP_DIR="$dir" devops/backup-db.sh
ENV_FILE="$dir/empty.env" CONTAINER_NAME=sh-try devops/restore-db.sh "$dir"/secret-hitler-*.db   # type sh-try
docker rm -f sh-try && docker volume rm sh-try-data && rm -rf "$dir"
```
