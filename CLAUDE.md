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
  `src/main/java/game/`; HTTP endpoints (`/check-login`, `/new-lobby`, `/ping`), the `/game`
  WebSocket, lobbies and state serialization in `src/main/java/server/`. JUnit 4 tests in
  `src/test/java/game/` and `src/test/java/server/`. Lobbies are backed up to a SQLite file at
  `DATABASE_PATH` (unset = no persistence). The server also serves the built frontend from the
  classpath directory `/public`, which `processResources` fills from `frontend/dist` when it exists;
  CORS is enabled only in debug mode.
- `frontend/`: React 18 and TypeScript 5, built with Vite and tested with Vitest. The entry is
  `src/main.tsx`, with `index.html` at the `frontend/` root. `src/App.tsx` owns the WebSocket, all
  state, and the login, lobby and game pages; prompts live in `src/custom-alert/`. The client talks
  to its own origin (`src/constants/serverUrls.ts`; `wss:` on `https:` pages) unless
  `VITE_SERVER_ADDRESS` is set, and the dev server proxies the backend paths to `BACKEND_URL`
  (default `http://localhost:4040`). `VITE_*` variables live in `.env.development` (dev server only:
  `VITE_DEBUG`) and `.env.dev` (`--mode dev`), typed in `src/vite-env.d.ts`.
- `docs/`: `PLAN.md` (phased plan and progress), `superpowers/specs/` (design),
  `superpowers/plans/` (per-phase step-by-step breakdowns).

## Commands

The Gradle 7.4.2 wrapper does not run on JDKs newer than 17. Java 17 comes from SDKMAN
(`17.0.21.0+9-tem`). The frontend needs Node 22.12 or newer (Vitest 5, jsdom 30); local is 24.

| Task | Command |
|---|---|
| Run backend (debug mode, `localhost:4040`) | `cd backend && ./gradlew runLocal` |
| Run frontend dev server (`localhost:3000`, against the local backend) | `cd frontend && npm install && npm run dev` |
| Backend tests | `cd backend && ./gradlew test` |
| Frontend tests (single run) | `cd frontend && npm test -- --run` |
| Backend build (tests + fat jar at `backend/build/libs/secret-hitler-online.jar`) | `cd backend && ./gradlew build` |
| Frontend production build (type-check, then `frontend/dist/`) | `cd frontend && npm run build` |
| Whole app on one port (after the frontend build) | `cd backend && ./gradlew jar && java -jar build/libs/secret-hitler-online.jar` |
| Image (repo root) | `docker build -t secret-hitler-online .` |

Known baseline failures (do not "fix" them while doing unrelated work):

- The dev-build console shows pre-existing React warnings: #4 (missing `key` on login page gifs),
  #8 (`Player.render` calls `setState`), and #5 (prompts set state from uncleared timers; on
  React 18 only `ElectionTrackerAlert`'s constructor timer still warns, after a failed election).
- #9: the lobby tags every player except the host as `[Host]`.
- #10: rejoining within 3 s of a reload is refused as "in a game"; #13: a request right after the
  server starts can 404 because routes are registered after `start()`.

`npm run dev:server` points at upstream's hosted dev backend, not anything this fork runs.

## Deploy

CI (`.github/workflows/ci.yml`) runs the backend and frontend tests and the frontend build on every
pull request into `development`. On every push to `development` it also publishes
`ghcr.io/jussaw/secret-hitler-online:latest` and `:sha-<short>` for `linux/arm64` and `linux/amd64`.
A home server runs that image and pulls new `:latest` images once a day. TLS ends at a proxy in
front of it, so the container serves plain HTTP on `8080`. Lobby backups go to `/data/backup.db`,
so mount a volume at `/data`.

## Workflow

- One branch per phase off an up-to-date `development` (`phase-1-housekeeping`, `phase-2-vite`, …),
  merged into `development` by pull request on the fork once every box in the phase is ticked.
- In a fork `gh` defaults to `upstream`, so pass `--repo jussaw/Secret-Hitler-Online` on every `gh`
  command. Never push to `upstream` or open pull requests against it.

## Commits

Conventional Commits, always with a scope: `type(scope): summary`, lowercase imperative summary,
no trailing period, at most 72 characters. Scopes in use: `frontend`, `backend`, `docker`, `ci`,
`plan` (`docs/PLAN.md` and its breakdowns), `docs` (other files under `docs/`), and for top-level
documents the file's name (`readme`, `development`, `claude`).

## Pointers

- `docs/PLAN.md` is the source of truth for progress. Tick a box in the same commit as the work it
  describes.
- Design spec: `docs/superpowers/specs/2026-11-11-self-hosted-fork-design.md`.

## Constraints

- No new art. Sound clips are CC0 only and listed in `docs/SOUND-CREDITS.md`.
- The WebSocket protocol stays backward compatible for players; spectator support only adds
  fields and a query parameter.
- Deploys go through the host's deploy tooling, never `docker compose up` from a checkout.
- This repo is public. Never write details of the personal infrastructure it runs on into files,
  commit messages, PR or issue text, or code comments: machine and host names, the hardware, other
  repositories (compose stacks, dotfiles), deploy and update tools, LAN addresses, ports, host
  paths, domains and subdomains, or the proxy, tunnel and monitoring setup. Write "the home server"
  or "the host" instead, and keep plans and acceptance notes generic (`https://<subdomain>/ping`).
