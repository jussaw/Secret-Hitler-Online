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
  `src/test/java/game/`.
- `frontend/`: React 16 and TypeScript 3.9 on Create React App. `src/App.tsx` owns the WebSocket,
  all state, and the login, lobby and game pages; prompts live in `src/custom-alert/`.
- `docs/`: `PLAN.md` (phased plan and progress), `superpowers/specs/` (design),
  `superpowers/plans/` (per-phase step-by-step breakdowns).

## Commands

The Gradle 7.4.2 wrapper does not run on JDKs newer than 17. Java 17 comes from SDKMAN
(`17.0.21.0+9-tem`).

| Task | Command |
|---|---|
| Run backend (debug mode, `localhost:4040`) | `cd backend && ./gradlew runLocal` |
| Run frontend dev server (`localhost:3000`, against the local backend) | `cd frontend && npm install && npm run devLocal` |
| Backend tests | `cd backend && ./gradlew test` |
| Frontend tests (single run) | `cd frontend && CI=true npm test` |
| Backend build (tests + fat jar at `backend/build/libs/secret-hitler-online.jar`) | `cd backend && ./gradlew build` |
| Frontend production build (`frontend/build/`) | `cd frontend && npm run build` |

Known baseline failures (do not "fix" them while doing unrelated work):

- `CI=true npm test` fails 1 of 1: `src/App.test.js` is unmodified CRA boilerplate (#6).
- The dev-build console shows pre-existing React warnings: #2 (react-textfit), #3 (react-helmet),
  #4 (missing `key` on login page gifs), #5 (`PresidentLegislativePrompt` setState after unmount).

`npm run devServer` points at upstream's hosted dev backend, not anything this fork runs.

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
