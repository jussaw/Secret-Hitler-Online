# Development setup for Secret Hitler Online

Requirements: Java 17 for the backend, Node.js 22.12 or newer for the frontend (tested with Node 24).

## Quick start using Docker:
- Run the backend and the frontend dev server with Docker Compose:
  - `docker compose up --build`
  - Open frontend: [http://localhost:3000](http://localhost:3000)
  - Backend health: [http://localhost:4040/ping](http://localhost:4040/ping)
  - Lobbies are backed up to SQLite on the `sh-data` volume (`DATABASE_PATH=/data/backup.db`).
  - The containers run as root, so `frontend/node_modules`, `backend/build` and `backend/.gradle` in your checkout end up owned by root.

## Persistence

The server backs up all lobbies to a SQLite file every minute (when something changed) and on shutdown, and restores them on start. Set `DATABASE_PATH` to the file to use, for example `DATABASE_PATH=/tmp/sh-backup.db ./gradlew runLocal`. With it unset, the server logs one error and runs without persistence.

## One port: the production layout

The backend serves the built frontend itself, so the whole app runs on one port:

```bash
cd frontend && npm install && npm run build      # writes frontend/dist
cd ../backend && ./gradlew jar                  # bundles frontend/dist into the jar as /public
PORT=4040 java -jar build/libs/secret-hitler-online.jar
```

The Docker image does the same in three stages: `docker build -t secret-hitler-online .` at the repo root, then `docker run -p 8080:8080 -v sh-data:/data secret-hitler-online`. CI publishes it as `ghcr.io/jussaw/secret-hitler-online` on every push to `development`.

## Running the backend and the frontend

This fork runs no hosted development backend, so even frontend-only changes need the server running locally. You'll need two terminal windows to run the frontend and backend. (`npm run dev:server` still reads `.env.dev`, which points at upstream's hosted development backend. That server has none of this fork's changes, spectators among them.)

### Running backend server

In your first terminal, clone the repo if you haven't yet. Navigate to the `backend` subdirectory, then use gradle to start the server.

```bash
git clone git@github.com:jussaw/Secret-Hitler-Online.git
cd Secret-Hitler-Online/backend

./gradlew runLocal
```

This will start the backend server at [`http://localhost:4040`](http://localhost:4040) by default. This also puts the server in debug mode, which allows cross-origin requests (only needed if a frontend on another origin calls it directly, such as with `VITE_SERVER_ADDRESS`).

**Every time you make changes to Java files, you'll need to stop and restart the development server.**

You can also run the backend-server using your preferred IDE by launching the Main-method in `ApplicationTest` found in the test directory.

### Running frontend server

Open another terminal at the root of the project, and run the following commands.

```bash
cd frontend

npm install
npm run dev
```

The dev server proxies `/check-login`, `/new-lobby`, `/ping` and the `/game` WebSocket to the backend, so the page talks to its own origin, as it does in production. The proxy target is `BACKEND_URL` (default `http://localhost:4040`; compose sets `http://backend:4040`). `.env.development` only turns on debug logging.

### Frontend tests and build

From `frontend/`:

```bash
npm test              # Vitest in watch mode
npm test -- --run     # single run
npm run build         # type-check, then build into dist/
npm run preview       # serve dist/ on port 3000
```

### Browser tests

The Playwright tests build the frontend and the jar, serve them on port 4545 and drive the whole app in desktop Chrome, Firefox and two emulated phones. They need Java 17 active for the Gradle wrapper. From `frontend/`:

```bash
npx playwright install chromium firefox   # once
npm run e2e                               # every project
npm run e2e -- --project=phone-360        # one project
```
