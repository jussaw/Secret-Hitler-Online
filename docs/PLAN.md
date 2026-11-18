# Self-Hosted Fork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a personal copy of this project on a home server with a no-scroll round-table game screen, sound effects, spectators, a phone layout, a modern frontend toolchain and SQLite persistence.

**Architecture:** The Java/Javalin backend keeps the rules and WebSocket protocol and additionally serves the built frontend, so the app is one image on one port. The React frontend moves to Vite and React 18, then the game screen is extracted from `App.tsx` so layout, sound and spectator work each land in small focused modules.

**Tech Stack:** Java 17, Gradle, Javalin 5, sqlite-jdbc, JUnit 4 · React 18, TypeScript 5, Vite, Vitest, Playwright · Docker (multi-arch), GitHub Actions, GHCR.

**Spec:** [`docs/superpowers/specs/2026-11-11-self-hosted-fork-design.md`](superpowers/specs/2026-11-11-self-hosted-fork-design.md)

## Global Constraints

- Licence stays CC BY-NC-SA 4.0; README keeps credit to upstream and the board game's creators.
- No new art. Sound clips are CC0 only and listed in `docs/SOUND-CREDITS.md`.
- The WebSocket protocol stays backward compatible for spectators. Players need a signed-in session (Phase 12), and their packets only add fields; spectator support only adds fields and a query parameter.
- One branch per phase off `development` (`phase-1-housekeeping`, `phase-2-vite`, …), merged by pull request on the fork when every box in the phase is ticked.
- Commits follow Conventional Commits with a scope: `type(scope): summary`.
- Tick a box in this file in the same commit as the work it describes.
- Desktop acceptance sizes: 1920x1080, 1920x937, 1600x900, 1366x768, 1280x720. Phone acceptance sizes: 360x740, 412x915.
- Deploys go through the host's deploy tooling, never `docker compose up` from a checkout.

## How to use this file

Each phase lists its tasks, the files they touch, and acceptance checks. Phases 2 to 7 depend on the code shape left by the phase before, so the step-by-step breakdown (exact code and test bodies) for a phase is written to `docs/superpowers/plans/` when that phase starts, and linked from its heading here. This file is the source of truth for what is done.

Every phase ends with a **Start Phase N** block. A phase is not finished until that block is done, so work flows straight from one phase into the next. Its boxes are ticked in the first commit on the new phase's branch, because the previous phase's PR is already merged by then. Phases 8 and 9 end without a Start block, since Phases 9 and 10 were added after they were planned, and Phase 10 ends with **Done when** instead.

## Progress

| Phase | Branch | Status |
|---|---|---|
| 1. Housekeeping | `phase-1-housekeeping` | done |
| 2. Frontend modernization | `phase-2-vite` | done |
| 3. Persistence, packaging, first deploy | `phase-3-deploy` | done |
| 4. Round-table game screen | `phase-4-round-table` | done |
| 5. Phone layout | `phase-5-phone` | done |
| 6. Sounds | `phase-6-sounds` | done |
| 7. Spectators | `phase-7-spectators` | done |
| 8. Game screen redesign | `phase-8-game-screen` | done |
| 9. Phase 8 follow-ups | `phase-9-follow-ups` | done |
| 10. Baseline bugs | `fix/issue-N`, one per issue | done |
| 11. Lobby redesign | `phase-11-lobby` | done |
| 12. Accounts with Discord sign-in | `phase-12-accounts` | done |
| 13. Database backups | `phase-13-db-backups` | done |
| 14A. Game timeline | `phase-14a-game-timeline` | done |
| 14B. Game records | `phase-14b-game-records` | done |
| 15A. Stats shell | `phase-15a-stats-shell` | done |
| 15B. Game history | `phase-15b-game-history` | done |
| 16. The game page | `phase-16-game-page` | done |
| 17A. Stats engine | `phase-17a-stats-engine` | done |
| 17B. OVERVIEW | `phase-17b-overview` | done |
| 18. ROLES & CARDS | `phase-18-roles-cards` | done |
| 19. VOTES & POWERS | `phase-19-votes-powers` | done |
| 20. RIVALS and ENDINGS | `phase-20-rivals-endings` | done |
| 21A. ACTIVITY | `phase-21a-activity` | done |
| 21B. RECORDS | `phase-21b-records` | done |
| 22A. Trophies and name links | `phase-22a-trophies-links` | done |
| 22B. Player pages | `phase-22b-player-pages` | done |
| 23. One header for the site | `phase-23-site-header` | done |
| 24. Bot fixes and self-play | `phase-24-bot-fixes` | done |
| 25A. Bot skill levels | `phase-25a-bot-levels` | done |
| 25B. Hard's first rules | `phase-25b-hard-reads` | done |
| 25C. Hard's other rules | `phase-25c-hard-bots` | in progress |
| 25D. Ladder and balance | `phase-25d-ladder-balance` | planned |
| 26A. Bot skill in the lobby | `phase-26a-lobby-bot-skill` | planned |
| 26B. Bot skill in the records | `phase-26b-record-bot-skill` | planned |

---

## Phase 1: Housekeeping

Outcome: a clean fork that runs locally, with upstream's hosted-service extras gone.

### Task 1.1: Baseline

- [x] Run `cd backend && ./gradlew test`; record pass/fail counts in the PR description
- [x] Run `./gradlew runLocal` and `cd frontend && npm install && npm run devLocal`; play one 5-player game with CPU players to the end
- [x] Note any pre-existing failures as issues on the fork; do not fix them in this phase (#2, #3, #4, #5: dev-mode console warnings; #6: `App.test.js` fails)

### Task 1.2: Remove analytics

Files: `frontend/src/App.tsx` (import at line 2, `ReactGA.initialize` at 223, about 20 `ReactGA.event` calls), `frontend/src/LoginPageContent.js`, `frontend/package.json`

- [x] Delete every `ReactGA` import and call
- [x] `npm uninstall react-ga`
- [x] `grep -rn "ReactGA\|react-ga" frontend/src frontend/package.json` returns nothing

### Task 1.3: Remove Twitter embed

Files: `frontend/src/custom-alert/IconSelection.tsx` (two `TwitterShareButton` blocks), `frontend/src/custom-alert/IconSelection.css` (`#twitter-icon`), `frontend/src/assets/index.ts` and `twitter-icon.svg`, `frontend/src/index.d.ts`, `frontend/src/App.tsx:805`, `frontend/package.json`

- [x] Remove the share buttons, icon asset, CSS rule and module declaration
- [x] `npm uninstall react-twitter-embed @types/twitter-for-web`
- [x] `grep -rni "twitter" frontend/src frontend/package.json` returns nothing
- [x] Icon selection dialog still opens and selects a portrait

### Task 1.4: Remove upstream deploy config

- [x] Delete `.github/workflows/firebase-deploy.yml`, `firebase-deploy-dev.yml`, `firebase-preview.yml`, `fly-deploy.yml`, `fly-deploy-dev.yml`
- [x] Delete `backend/fly.toml`, `backend/DEPLOYMENT.md`, and any `firebase.json` / `.firebaserc` under `frontend/`
- [x] Keep `codeql-analysis.yml`

### Task 1.5: Prune fork branches

- [x] List: `git branch -r | grep origin/ | grep -vE 'origin/(HEAD|main|development)'`
- [x] Delete each listed branch on the fork with `git push origin --delete <branch>` (fork only; never `upstream`)
- [x] `git fetch --prune origin` shows only `main` and `development`

### Task 1.6: Docs

- [x] README: fork notice linking upstream, licence and attribution section, local run instructions
- [x] Update `DEVELOPMENT.md` clone URLs to the fork

### Task 1.7: Repo `CLAUDE.md`

Files: new `CLAUDE.md` at the repo root

- [x] What this is: a personal fork of `ShrimpCryptid/Secret-Hitler-Online`, remotes `origin` (fork) and `upstream`, default working branch `development`, licence CC BY-NC-SA 4.0
- [x] Layout: `backend/` (Java, Gradle, Javalin; rules in `src/main/java/game/`, server in `src/main/java/server/`), `frontend/` (React, TypeScript), `docs/`
- [x] Commands: run backend, run frontend, run each test suite, build (verified by running each one)
- [x] Workflow: one branch per phase off `development`, PRs target the fork (`--repo jussaw/Secret-Hitler-Online`, since `gh` defaults to upstream), never push to `upstream`
- [x] Commit convention: Conventional Commits with a scope; list the scopes in use (`frontend`, `backend`, `docker`, `ci`, `docs`, `plan`)
- [x] Pointers: `docs/PLAN.md` is the source of truth for progress and boxes are ticked in the same commit as the work; the spec path
- [x] Constraints: no new art, CC0 sounds only, WebSocket protocol stays backward compatible for players, deploys go through the host's deploy tooling
- [x] Add a line for this repo to the user-level `~/CLAUDE.md`

**Phase 1 acceptance**

- [x] `./gradlew test` matches the baseline
- [x] `npm run build` succeeds in `frontend/`
- [x] A full CPU game plays locally with no console errors beyond the baseline tracked in #2 to #5
- [x] PR merged into `development` (#7)

**Start Phase 2: Frontend modernization**

- [x] Progress table: Phase 1 set to "done", Phase 2 set to "in progress"
- [x] `git checkout development && git pull`, then `git checkout -b phase-2-vite`
- [x] Re-read Phase 2 below against the code as it now stands; fix any file paths or line numbers that moved
- [x] Write the Phase 2 step-by-step breakdown to `docs/superpowers/plans/` (writing-plans skill) and link it from the Phase 2 heading
- [x] Begin Task 2.1

---

## Phase 2: Frontend modernization

Breakdown: [`docs/superpowers/plans/2026-11-11-phase-2-frontend-modernization.md`](superpowers/plans/2026-11-11-phase-2-frontend-modernization.md)

Outcome: same app, same behaviour, on Vite + React 18 + TypeScript 5 + Vitest.

### Task 2.1: Dependency audit

- [x] Remove packages with no imports: `react-router`, `react-router-dom`, `react-router-config`, `react-alice-carousel` (and `src/util/CustomAliceCarousel.css` with its dead import in `LoginPageContent.js`; it only styles the commented-out carousel), `query-string`, `@testing-library/user-event`. `prop-types` stays (nine files import it)
- [x] `npm run build` still succeeds on CRA before the migration starts

### Task 2.2: CRA to Vite

Files: `frontend/package.json`, new `frontend/vite.config.ts`, `frontend/index.html` (moved from `public/`), `frontend/src/index.js` → `src/main.tsx`, `frontend/.env.local`, `frontend/.env.dev`, new `frontend/src/vite-env.d.ts`

- [x] Install `vite` and `@vitejs/plugin-react`; remove `react-scripts`, `env-cmd`, `@babel/plugin-proposal-private-property-in-object`, the Jest-era `@testing-library/react` and `@testing-library/jest-dom`, the `eslintConfig` and `browserslist` blocks
- [x] Upgrade `typescript` to 5 in the same step (`react-scripts` peer-pins TS 3/4, and Vite's types need TS 5); fix resulting type errors without changing behaviour
- [x] Move `public/index.html` to `frontend/index.html`, replace `%PUBLIC_URL%` paths, add `<script type="module" src="/src/main.tsx">`
- [x] Rename env vars `REACT_APP_*` → `VITE_*` in both `.env` files and every `process.env.REACT_APP_*` → `import.meta.env.VITE_*`
- [x] Scripts: `dev` (`vite`; Vite rejects `local` as a mode name and loads `.env.local` in every mode), `dev:server` (`vite --mode dev`), `build` (`tsc --noEmit && vite build`), `preview` (`test` lands with Vitest in Task 2.4)
- [x] Rename any `.js` file containing JSX to `.jsx` (Vite does not parse JSX in `.js`)
- [x] Delete `src/serviceWorker.js` and its registration call
- [x] Dev server on port 3000 loads the login page against a local backend

### Task 2.3: React 18

`react-textfit` peer-pins React 15/16, so it goes before the upgrade.

- [x] Replace `react-textfit` in `src/player/Player.jsx` with CSS `clamp()` font sizing; uninstall it
- [x] Replace `react-helmet` (`src/util/HelmetMetaData.jsx`, used at `App.tsx:1735`) with static `<meta>` tags in `index.html`; delete the component; uninstall it
- [x] Upgrade `react`, `react-dom` to 18 and `@types/react`, `@types/react-dom` to match; switch the entry to `createRoot`
- [x] Check timing under React 18 automatic batching: the animation queue in `App.tsx` (`addAnimationToQueue`, `onAnimationFinish`) must still play events in order, and the reads of `this.state` right after `setState` in socket and promise callbacks are made explicit (lobby packet icon dialog at `App.tsx:410-418`, login cookies at `:576` and `:606`)

### Task 2.4: Vitest

- [x] Install `vitest`, `jsdom`, `@testing-library/react` (v14+), `@testing-library/jest-dom` (v6+); add `test` config to `vite.config.ts` and the `test` script
- [x] Port `src/App.test.js` and `src/setupTests.js`; `npm test -- --run` passes

### Task 2.5: Update dev Docker and docs

- [x] `docker-compose.yml` frontend service: `node:24` (Vitest 5 and jsdom 30 need Node 22+), command `npm install && npm run dev -- --host`
- [x] `DEVELOPMENT.md`, `README.md` and `frontend/README.md` reflect the new script names
- [x] `CLAUDE.md` commands and layout updated for Vite and Vitest

**Phase 2 acceptance**

- [x] `npm run build` and `npm test -- --run` pass
- [x] `grep -rn "REACT_APP_\|react-scripts" frontend --include='*' --exclude-dir=node_modules` returns nothing
- [x] Manual regression: create lobby, join with a second browser, add CPU players, play to both a liberal and a fascist win, refresh mid-game and rejoin
- [x] PR merged into `development` (#11)

**Start Phase 3: Persistence, packaging, first deploy**

- [x] Progress table: Phase 2 set to "done", Phase 3 set to "in progress"
- [x] `git checkout development && git pull`, then `git checkout -b phase-3-deploy`
- [x] Re-read Phase 3 below against the code as it now stands; fix any file paths or line numbers that moved
- [x] Write the Phase 3 step-by-step breakdown to `docs/superpowers/plans/` (writing-plans skill) and link it from the Phase 3 heading
- [x] Begin Task 3.1

---

## Phase 3: Persistence, packaging, first deploy

Breakdown: [`docs/superpowers/plans/2026-11-12-phase-3-persistence-packaging-deploy.md`](superpowers/plans/2026-11-12-phase-3-persistence-packaging-deploy.md)

Outcome: the unmodified-looking game runs on the home server at its public subdomain and survives restarts.

Phase 3 lands in two PRs. CI publishes images only from `development`, so Tasks 3.1-3.5 merged first (#12), which published the first image. Tasks 3.6-3.7 and the acceptance checks follow on a second `phase-3-deploy` branch.

### Task 3.1: SQLite backup

Files: `backend/build.gradle`, `backend/src/main/java/server/ApplicationConfig.java`, `backend/src/main/java/server/SecretHitlerServer.java` (database section, lines 211-359), new `backend/src/test/java/server/DatabaseBackupTest.java`

- [x] Write a failing test: store a lobby map to a temp-file database, load it back, assert lobby codes and usernames match
- [x] Replace `org.postgresql:postgresql` with `org.xerial:sqlite-jdbc` (3.53.4.0)
- [x] `ApplicationConfig`: replace `DATABASE_URL` with `DATABASE_PATH`; unset means persistence disabled
- [x] `getDatabaseConnection()`: `jdbc:sqlite:<DATABASE_PATH>`; table column `lobby_bytes BLOB`; make the insert an upsert that SQLite accepts
- [x] Extract store/load so they take a connection (or path) parameter and are callable from the test
- [x] Unset or unwritable path logs one error and the server keeps running
- [x] `./gradlew test` passes

### Task 3.2: Same-origin serving

Files: `backend/src/main/java/server/SecretHitlerServer.java` (Javalin config), `backend/build.gradle`, `frontend/src/constants/index.ts` (server address constants), `frontend/src/App.tsx:858` (invite link), `frontend/vite.config.ts`, `frontend/.env.*`

- [x] Javalin serves static files from the classpath directory `/public` with `index.html` at `/` (only when it exists; Javalin refuses to start on a missing classpath directory)
- [x] CORS only in debug mode: the old production rule allowed only upstream's domain and answered the page's own `crossorigin` asset requests with 400
- [x] Frontend builds API and WebSocket URLs from `window.location` (`wss:` when the page is `https:`) unless `VITE_SERVER_ADDRESS` is set
- [x] The lobby invite link uses the page's own origin instead of `https://secret-hitler.online`
- [x] `.env.local` becomes `.env.development` with only `VITE_DEBUG`, so `vite build` no longer bakes in a backend address or debug logging
- [x] Vite dev server proxies `/check-login`, `/new-lobby`, `/ping` and `/game` (with `ws: true`) to `BACKEND_URL` (default `localhost:4040`)
- [x] Gradle task copies `frontend/dist` into the jar's `public/` when present
- [x] `java -jar` with a built frontend serves the whole app on one port

### Task 3.3: Image

Files: new `Dockerfile` and `.dockerignore` at repo root, delete `backend/Dockerfile` and `backend/config/Dockerfile.dev` if unused

- [x] Stage 1 `node:24` (Phase 2 needs Node 22+), on `$BUILDPLATFORM`: `npm ci && npm run build` in `frontend/`
- [x] Stage 2 `eclipse-temurin:17-jdk` on `$BUILDPLATFORM`: copy `frontend/dist`, run the wrapper's `./gradlew jar` (the build is only known-good on Gradle 7.4.2)
- [x] Stage 3 `eclipse-temurin:17-jre`: copy the jar, `ENV PORT=8080 DATABASE_PATH=/data/backup.db`, `VOLUME /data`, `EXPOSE 8080`, run as non-root uid 1000
- [x] `docker build` then `docker run -p 8080:8080 -v sh-data:/data` plays a game locally
- [x] Restart the container mid-game; the lobby is still there after rejoin

### Task 3.4: Dev compose

- [x] `docker-compose.yml`: remove the `db` service and `DATABASE_URL`; backend gets `DATABASE_PATH` on a named volume; frontend gets `BACKEND_URL` for the proxy
- [x] `DEVELOPMENT.md` updated
- [x] `CLAUDE.md` updated: SQLite `DATABASE_PATH`, same-origin serving, image build and deploy path

### Task 3.5: CI

Files: new `.github/workflows/ci.yml`

- [x] Job `test`: `./gradlew test` and `npm ci && npm test -- --run && npm run build`, on pull requests and pushes to `development`
- [x] Job `image` (push to `development` only, after `test`): buildx with QEMU, platforms `linux/arm64,linux/amd64`, push `ghcr.io/jussaw/secret-hitler-online:latest` and `:sha-<short>`
- [x] First run is green and the package is visible on GHCR (run 43167662489; public, `linux/amd64` + `linux/arm64`)

### Task 3.6: Host stack

- [x] Add a compose service on the host: `container_name`, the GHCR image, `TZ`, a free published port mapped to `8080`, `restart: unless-stopped`, and a bind mount to `/data`
- [x] `docker compose config` validates for the host's stack
- [x] Commit the stack change, then deploy it on the host
- [x] The GHCR package is public, so the host pulls it without credentials; if it is private, make it public

### Task 3.7: Proxy

TLS ends at a proxy in front of the host.

- [x] Add a public hostname for the subdomain on the host's proxy, pointing at the published port; the proxy terminates TLS and passes WebSockets
- [x] Add the URL to an uptime monitor using `/ping`

**Phase 3 acceptance**

- [x] `https://<subdomain>/ping` answers (`OK`)
- [x] A game with two real browsers plus CPU players completes over `wss` (`wss://<subdomain>/game`, liberal win, mid-game reload and rejoin)
- [x] `docker restart` of the container mid-game; players rejoin and continue (backup stored on shutdown, loaded on start; both rejoined via JOIN; #13 explains a transient 404 right after start)
- [x] Pushing to `development` produces a new image that the host picks up (2026-11-12: CI run 43187178189 published `:latest` for `6b01066`, and the host's container runs that image, digest `sha256:24324133…c252`)
- [x] PR merged into `development` (#14)

**Start Phase 4: Round-table game screen**

- [x] Progress table: Phase 3 set to "done", Phase 4 set to "in progress"
- [x] `git checkout development && git pull`, then `git checkout -b phase-4-round-table`
- [x] Re-read Phase 4 below against the code as it now stands; fix any file paths or line numbers that moved
- [x] Write the Phase 4 step-by-step breakdown to `docs/superpowers/plans/` (writing-plans skill) and link it from the Phase 4 heading
- [x] Begin Task 4.1

---

## Phase 4: Round-table game screen

Breakdown: [`docs/superpowers/plans/2026-11-12-phase-4-round-table.md`](superpowers/plans/2026-11-12-phase-4-round-table.md)

Outcome: all players and both boards visible with no scrolling on desktop.

### Task 4.1: Extract `GameScreen`

Files: new `frontend/src/game/GameScreen.tsx`, `frontend/src/game/GameScreen.css`; modify `frontend/src/App.tsx` (`renderGamePage`, lines 1625-1713)

- [x] Move the game markup into `GameScreen`, a presentational component: props are `gameState`, `user`, `showVotes`, `showBusy`, `statusBarText`, deck sizes, policy counts, `electionTracker`, `onEndTerm`
- [x] `App.tsx` renders `<GameScreen …/>` plus the existing `CustomAlert`, `EventBar` and snackbar; no inline layout styles remain in `renderGamePage`
- [x] No visual change in this task (compare screenshots before and after)

### Task 4.2: Seat geometry

Files: new `frontend/src/game/seatPositions.ts`, `frontend/src/game/seatPositions.test.ts`

- [x] Tests first: for counts 5 to 10, returns `count` positions; the local player's seat is bottom centre (`x` 50, largest `y`); seating order follows `playerOrder` clockwise; all coordinates within 0 to 100; no two seats closer than a minimum distance
- [x] Implement `seatPositions(count: number, selfIndex: number): { x: number; y: number }[]` as points on an ellipse in percent units
- [x] A spectator (no `selfIndex`) gets `selfIndex = 0`

### Task 4.3: Table layout

Files: new `frontend/src/game/TableSeats.tsx`, `TableSeats.css`; modify `GameScreen.tsx/.css`, `seatPositions.ts` (`centreBox`), `frontend/src/player/PlayerDisplay.tsx` (`usePlayerTiles`). `Player.css`, `Board.css` and `App.css` stay as they are: seats scale the existing tile with a transform, and `GameScreen.css` overrides sizes only inside the game screen.

`PlayerDisplay` is also rendered inside prompts (execution, special election, investigation and victory results at `App.tsx:954`, `1259`, `1291` and `1414`, and `PlayerDisplayPrompt`, which `SelectPlayerPrompt` uses), and the lobby renders `Player` directly (`App.tsx:729`). Those keep their current layout.

- [x] `GameScreen` is a grid filling `100dvh` minus a slimmer header; `overflow: hidden` is not used to fake the result
- [x] `TableSeats` absolutely positions each existing `Player` at its seat; president/chancellor markers, vote icons, busy icons and the executed state render as before
- [x] Centre column: board(s), then draw deck / policy status / discard deck, then status text and END TERM
- [x] Sizes use `clamp()` with `vh`/`vw` so the table scales between the smallest and largest acceptance sizes
- [x] Selecting a player in prompts (`SelectPlayerPrompt`) still works; prompts stay in the overlay

### Task 4.4: No-scroll browser test

Files: new `frontend/e2e/no-scroll.spec.ts`, `frontend/playwright.config.ts`; `package.json` script `e2e`; CI job

Playwright is not installed yet: `@playwright/test` and a browser are new dev dependencies. CPU players only fill a lobby up to 5 (`backend/src/main/java/server/util/Lobby.java:497-511`), so 7 and 10 players need extra connections.

- [x] Test starts a lobby against a local backend, reaches 5 players with CPU players and 7 and 10 with WebSocket guests, starts the game
- [x] At each desktop acceptance size asserts `document.documentElement.scrollHeight <= window.innerHeight` and `scrollWidth <= innerWidth`, and that every seat's bounding box is inside the viewport
- [x] Add the e2e run to `ci.yml`
- [x] `CLAUDE.md` updated: `frontend/src/game/` layout and the `npm run e2e` command

**Phase 4 acceptance**

- [x] `npm run e2e` passes at all five desktop sizes for 5, 7 and 10 players
- [x] Vote reveal, policy enactment, investigation, special election, execution and victory animations all display correctly over the table
- [x] PR merged into `development`; deployed image checked on a real 1080p monitor

**Start Phase 5: Phone layout**

- [x] Progress table: Phase 4 set to "done", Phase 5 set to "in progress"
- [x] `git checkout development && git pull`, then `git checkout -b phase-5-phone`
- [x] Re-read Phase 5 below against the code as it now stands; fix any file paths or line numbers that moved
- [x] Write the Phase 5 step-by-step breakdown to `docs/superpowers/plans/` (writing-plans skill) and link it from the Phase 5 heading
- [x] Begin Task 5.1

---

## Phase 5: Phone layout

Breakdown: [`docs/superpowers/plans/2026-11-12-phase-5-phone.md`](superpowers/plans/2026-11-12-phase-5-phone.md)

Outcome: playable on a phone in portrait, with vertical scrolling allowed.

### Task 5.1: Stacked game layout

Files: `frontend/src/game/GameScreen.css`, `frontend/src/game/TableSeats.css`, `frontend/src/game/TableSeats.tsx`, `frontend/src/game/seatPositions.ts` (`seatColumns`); browser tests `frontend/e2e/phone.spec.ts` (new), `frontend/e2e/no-scroll.spec.ts`, shared helpers `frontend/e2e/lobby.ts` (was `guests.ts`) and `frontend/e2e/layout.ts`, and the `desktop`, `phone-360` and `phone-412` projects in `frontend/playwright.config.ts`

Seat and centre-box positions are inline styles: `TableSeats.tsx` sets each seat's `left`/`top` from `seatPositions()`, and `GameScreen.tsx` sets `.game-centre`'s `left`/`right`/`top`/`bottom` from `centreBox()`. Seats are the default player tile scaled with a transform in `TableSeats.css`, and the table's board, deck and status sizes are overrides scoped in `GameScreen.css`; `Player.css` was not changed in Phase 4. Phase 4 deferred two desktop problems here: windows narrower than about 5:4 (for example 960x1080) put the diagonal seats over the boards, and tall prompts (below) run past the bottom of a desktop screen.

- [x] Under `(max-width: 768px), (aspect-ratio < 5/4)`, seats render as a wrapping grid instead of ellipse positions; then status and END TERM, boards at full width, decks

### Task 5.2: Other pages and prompts

Files: `frontend/src/custom-alert/CustomAlert.css` (prompts become a fixed overlay whose box scrolls), `frontend/src/App.css` (44px minimum for buttons and text fields on phones); browser tests `frontend/e2e/prompts.spec.ts` and `frontend/e2e/fakeGame.ts` (new; every prompt opened from a scripted game socket), `frontend/e2e/phone.spec.ts` (login and lobby). The login page (`App.tsx` `renderLoginPage`, lines 629-712), the lobby (`renderLobbyPage`, lines 816-921) and the prompt CSS files needed no change.

`frontend/index.html` already has `width=device-width, initial-scale=1`. Before this phase `#alert-box` was `position: absolute` at `top: 10vh` with `min-width: 80vmin` and `max-width: 40vw`; below a 2:1 window the `min-width` wins, so it is 80vmin wide plus padding. With ten players the nomination, investigation, special election, execution and victory prompts are taller than a 1920x1080 screen (RETURN TO LOBBY ends at y 1398), and at 1280x720 the vote prompt is too.

- [x] Login and lobby fit 360px width
- [x] On phones every button, text field, player tile, vote card and policy card is at least 44x44px
- [x] Alerts use near-full width on phones; policy and vote prompts fit without horizontal scroll

### Task 5.3: Phone browser test

Files: new `frontend/e2e/phone.spec.ts` and `frontend/e2e/prompts.spec.ts` (built in Tasks 5.1 and 5.2), `frontend/playwright.config.ts` (trace and HTML report on failure), `.github/workflows/ci.yml` (keeps them as an artifact)

`App.css` sets `overflow-x: hidden` on both `html` and `body`, so `body` clips anything too wide and `document.documentElement.scrollWidth` stays at the viewport width whatever overflows; only `document.body.scrollWidth` shows it. The same holds for Phase 4's desktop `scrollWidth` check in `no-scroll.spec.ts`.

- [x] Galaxy S8 (360x740) and Pixel 7 (412x915) projects assert no horizontal overflow (`body.scrollWidth`, and no element past the edge) on login, lobby, the game at 5 and 10 players, and every prompt opened from a scripted game socket

### Task 5.4: Narrow windows and upright tablets

Files: `frontend/src/game/GameScreen.css`, `frontend/src/game/TableSeats.css`, `frontend/src/game/TableSeats.tsx`, `frontend/src/game/seatPositions.ts` (`seatColumns`); browser test `frontend/e2e/no-scroll.spec.ts`, with the window sizes in `frontend/e2e/layout.ts`, also run in Firefox by a `firefox` project (`frontend/playwright.config.ts`, `.github/workflows/ci.yml`)

Tasks 5.1-5.3 give every window narrower than 5:4 the phone layout, with full-size tiles. With ten players, half a 1080p screen (960x1080) shows only tiles on its first screen, and the boards start at y 1037; held upright, an iPad Air (820x1180) starts them at y 991.

- [x] Windows at least 700px wide and narrower than 5:4 (half-screen desktop windows, upright monitors, tablets held upright) fit the game screen without scrolling: round-table-size tiles up to 5 to a row, then status and END TERM, then the boards with the decks in a column beside them

**Phase 5 acceptance**

Deferred: a desktop prompt taller than the window (ten-player pickers and the victory prompt at 1080p and below) now scrolls inside its box instead of growing the page, but it does not yet fit the window without scrolling. That needs smaller prompt contents, not layout.

- [x] Phone e2e passes; Phase 4 e2e still passes
- [x] One full game played on a real phone against the deployed instance
- [x] PR merged into `development`

**Start Phase 6: Sounds**

- [x] Progress table: Phase 5 set to "done", Phase 6 set to "in progress"
- [x] `git checkout development && git pull`, then `git checkout -b phase-6-sounds`
- [x] Re-read Phase 6 below against the code as it now stands; fix any file paths or line numbers that moved
- [x] Write the Phase 6 step-by-step breakdown to `docs/superpowers/plans/` (writing-plans skill) and link it from the Phase 6 heading
- [x] Begin Task 6.1

---

## Phase 6: Sounds

Breakdown: [`docs/superpowers/plans/2026-11-12-phase-6-sounds.md`](superpowers/plans/2026-11-12-phase-6-sounds.md)

Outcome: game events are audible, with volume and mute controls.

### Task 6.1: Source clips

Files: new `frontend/src/assets/sounds/*` (an `.ogg` and an `.mp3` per sound), new `docs/SOUND-CREDITS.md` (`CLAUDE.md` already names it)

- [x] One CC0 clip per sound name: `yourTurn`, `playerJoined`, `gameStart`, `nominate`, `voteCast`, `votePassed`, `voteFailed`, `trackerAdvance`, `cardDraw`, `cardDiscard`, `policyLiberal`, `policyFascist`, `power`, `investigate`, `execution`, `veto`, `victory`, `defeat`
- [x] Each trimmed, loudness-normalized, exported as Ogg Opus and MP3, under 100 KB where possible
- [x] `docs/SOUND-CREDITS.md` lists file, source URL, author and licence for every clip

### Task 6.2: `SoundManager`

Files: new `frontend/src/sound/SoundManager.ts`, `frontend/src/sound/SoundManager.test.ts`; `frontend/src/main.tsx` (preload, first-gesture listener)

- [x] Tests first: volume and mute persist to and restore from `localStorage`; `play` before unlock does nothing; `play` when muted does nothing; a clip that fails to load does not throw
- [x] Implement `play(name: SoundName)`, `setVolume(0..1)`, `setMuted(boolean)`, `unlock()`; `unlock` is called on the first pointer or key event
- [x] `SoundName` is a string-literal union of the names in Task 6.1

### Task 6.3: `soundEvents`

Files: new `frontend/src/sound/soundEvents.ts`, `frontend/src/sound/soundEvents.test.ts`

- [x] Tests first, one per event, using pairs of `GameState` fixtures (types in `frontend/src/types/lobby_state.ts`, built with `frontend/src/game/testGameState.ts`): for example state changes to the vote-result state with a passing vote returns `["votePassed"]`; the election tracker moving returns `["trackerAdvance"]` (`electionTrackerAdvanced` alone stays true until the next nomination); the local player becomes the one who must act returns `["yourTurn"]`
- [x] Implement `soundEvents(prev: GameState | undefined, next: GameState, user: string): SoundName[]` as a pure function
- [x] Victory versus defeat is decided from the local player's party; a user who is not in `playerOrder` (Phase 7's spectators) hears the public sounds and `victory`, never `yourTurn`

### Task 6.4: Wire up

Files: `frontend/src/App.tsx`: `onGameStateChanged` (line 968), the animation queue (`animationQueue`, `addAnimationToQueue`, `clearAnimationQueue`; lines 198 and 1469-1491), `showVotes` (1493), the lobby and investigation packets in `onWebSocketMessage` (405, 437), `tryOpenWebSocket` (276); new browser test `frontend/e2e/sounds.spec.ts`

- [x] Call `soundEvents` in `onGameStateChanged` and queue each sound through the existing animation queue so audio lines up with the visuals, not with packet arrival
- [x] Lobby user-list growth plays `playerJoined`
- [x] The first packet after a socket opens (a reload, a reconnect, a rejoin) plays nothing

### Task 6.5: Controls

Files: new `frontend/src/sound/SoundControl.tsx` and `.css`; the headers at `frontend/src/App.tsx:632` (login), `App.tsx:823` (lobby) and `frontend/src/game/GameScreen.tsx:40` (game); `frontend/e2e/sounds.spec.ts`

- [x] Speaker button toggles mute; hovering or tapping shows a volume slider
- [x] Control fits in the header of every page in every layout (the round table at the five desktop sizes, the stacked phone layout at 360x740 and 412x915, the narrow windows in `NARROW_WINDOWS`) and does not break the no-scroll tests or the phone tests' 44px touch targets
- [x] `CLAUDE.md` updated: `frontend/src/sound/` modules and the CC0 credits rule

**Phase 6 acceptance**

- [x] Unit tests pass; Phase 4 and 5 e2e still pass, and so does the sounds e2e
- [x] A recorded 7-player game shows every listed event playing once, in sync with its animation
- [x] In a full game every listed event is heard (the user, in a real game)
- [x] Mute and volume survive a page refresh
- [x] No sound plays before the first click, and no autoplay error appears in the console
- [x] PR merged into `development`

**Start Phase 7: Spectators**

- [x] Progress table: Phase 6 set to "done", Phase 7 set to "in progress"
- [x] `git checkout development && git pull`, then `git checkout -b phase-7-spectators`
- [x] Re-read Phase 7 below against the code as it now stands; fix any file paths or line numbers that moved
- [x] Write the Phase 7 step-by-step breakdown to `docs/superpowers/plans/` (writing-plans skill) and link it from the Phase 7 heading
- [x] Begin Task 7.1

---

## Phase 7: Spectators

Breakdown: [`docs/superpowers/plans/2026-11-12-phase-7-spectators.md`](superpowers/plans/2026-11-12-phase-7-spectators.md)

Outcome: anyone with the lobby code can watch without a seat and without seeing secrets.

### Task 7.1: Spectator state filtering

Files: `backend/src/main/java/server/util/GameToJSONConverter.java` (`convert`, line 61), new `backend/src/test/java/server/SpectatorStateTest.java` with the test helpers `GameDriver.java` and `Secrets.java`

`convert` calls `game.getPlayer(userName).getIdentity()` (line 72), which throws for anyone who is not a player, so the spectator conversion is its own entry point, `convertForSpectator`. Players' packets keep their exact shape.

- [x] Tests first: the spectator conversion of an in-progress game contains no player `id` (role), no `presidentChoices`, `chancellorChoices` or `peek`, and no investigation result, at any depth and in every state; after the game ends roles are present, matching what players receive
- [x] Implement a spectator conversion path (`convertForSpectator`, built from the same public fields as `convert`)

### Task 7.2: Lobby spectators

Files: `backend/src/main/java/server/util/Lobby.java` (players live in `userToUsername` and `activeUsernames`; `hasTimedOut` 87, `getConnections` 97, `isFull` 168, `getUserCount` 298, `updateAllUsers` 311, which sends to `userToUsername` only, `updateUser` 386, `readObject` 413), new `backend/src/test/java/server/util/LobbySpectatorTest.java` and `FakeSocket.java`

- [x] Tests first: adding a spectator does not change `getUserCount()` or `isFull()`; spectators receive updates from `updateAllUsers()`; removing the last player leaves a spectator-only lobby that `hasTimedOut()` treats as inactive
- [x] Add a transient spectator connection set with `addSpectator`, `removeSpectator`, `isSpectator`; include spectators in `updateAllUsers()` using the spectator conversion
- [x] Add `spectatorCount` to every state packet, lobby and game (packets are assembled in `Lobby`, where `type` and `icon` are added)

### Task 7.3: Server handshake and command rejection

Files: `backend/src/main/java/server/SecretHitlerServer.java` (`onWebsocketConnect` line 474, `onWebSocketMessage` 539, `onWebSocketClose` 730, `checkLogin` 370, registered at 145, `removeInactiveLobbies` 194), new `backend/src/test/java/server/SpectatorServerTest.java` and `TestSocket.java`

Today the socket requires a `name` query parameter, and the server closes it without one (lines 475-480).

- [x] `/game?lobby=CODE&spectator=true` connects without a `name`; unknown lobby closes with the same error as a player join
- [x] `/check-login` accepts a spectator check so the client can validate the code first
- [x] Any command other than `ping` and `get-state` from a spectator connection is rejected and logged
- [x] Test: a spectator sending `register-vote` does not change the game's votes

### Task 7.4: Client

Files: `frontend/src/App.tsx` (login form `renderLoginPage` 646, `tryOpenWebSocket` 285, cookies at 595-596 and 627-628, `renderLobbyPage` 836, `onGameStateChanged` 991, whose role reveal (1096) and vote prompt (1129) index `players[name]` and throw for a spectator), `frontend/src/player/PlayerDisplay.tsx` (`shouldShowRole` throws for a spectator too), `frontend/src/types/`, `frontend/src/game/GameScreen.tsx`, new `frontend/src/spectator/`; browser tests in new `frontend/e2e/spectator.spec.ts`, with spectator views added to `no-scroll.spec.ts` and `phone.spec.ts`

- [x] "Watch" button beside Join on the login form; needs only a lobby code
- [x] Spectator flag stored in a cookie so refresh and reconnect keep spectating
- [x] Spectators see the lobby page read-only before the game starts, then `GameScreen`; no prompts are queued for them; status text describes what the table is doing
- [x] Spectator count shown in the lobby and on the game screen when above zero
- [x] Sounds play for spectators
- [x] `CLAUDE.md` updated: spectator handshake parameter and the server-side filtering rule

**Phase 7 acceptance**

- [x] Backend tests pass
- [x] e2e: a spectator joins a running game, the WebSocket frames it receives contain no role or hand fields before game end, and layout tests still pass with a spectator viewport
- [x] A spectator joining mid-game and refreshing stays a spectator
- [x] PR merged into `development` (#18) and deployed

**Start Phase 8: Game screen redesign**

- [x] Progress table: Phase 8 added and set to "in progress"
- [x] `git checkout development && git pull`, then `git checkout -b phase-8-game-screen`
- [x] Design written and committed: [`docs/superpowers/specs/2026-11-12-game-screen-redesign-design.md`](superpowers/specs/2026-11-12-game-screen-redesign-design.md), with reference screenshots
- [x] Write the Phase 8 step-by-step breakdown to `docs/superpowers/plans/` (writing-plans skill) and link it from the Phase 8 heading
- [x] Begin Task 8.1

---

## Phase 8: Game screen redesign

Breakdown: [`docs/superpowers/plans/2026-11-12-phase-8-game-screen.md`](superpowers/plans/2026-11-12-phase-8-game-screen.md) · Spec: [`docs/superpowers/specs/2026-11-12-game-screen-redesign-design.md`](superpowers/specs/2026-11-12-game-screen-redesign-design.md)

Outcome: the players sit in a roster at the side and the boards are more than twice as wide on desktop; a round tracker replaces the black status bar; a phone shows the whole game without scrolling; the banner reads `SECRET-HITLER`.

### Task 8.1: Banner reads SECRET-HITLER

Files: `frontend/src/App.tsx` (754, 957), `frontend/src/game/GameScreen.tsx` (47), `frontend/e2e/spectator.spec.ts` (375), with tests in `App.test.tsx` and `GameScreen.test.tsx`

- [x] The login, lobby and game headers read `SECRET-HITLER`

### Task 8.2: Round step mapping

Files: new `frontend/src/game/roundStep.ts` and `roundStep.test.ts`

- [x] Tests first: `stepForState` for every state, `POST_LEGISLATIVE` after each kind of `lastState`, `null` for setup and victory; `stepForPolicyLine`
- [x] Implement `RoundStep`, `ROUND_STEPS`, `stepForState`, `stepForPolicyLine`

### Task 8.3: Per-player row data

Files: new `frontend/src/player/usePlayerRows.ts` and `usePlayerRows.test.tsx`, `frontend/src/player/PlayerDisplay.tsx`

- [x] Tests first: office, busy, role by viewer, executed, staged votes, the user's row
- [x] Move the per-player logic out of `usePlayerTiles` into `usePlayerRows`; the prompts' tiles are unchanged (`PlayerDisplay.test.tsx` passes as is)

### Task 8.4: PlayerRoster

Files: new `frontend/src/game/PlayerRoster.tsx`, `PlayerRoster.css`, `PlayerRoster.test.tsx`

- [x] Tests first: order, the user's row, offices, own and teammates' roles beside offices, executed, busy, votes, the reserved detail line
- [x] Implement the roster rows (portrait in the card's frame, name, detail line, vote or busy)

### Task 8.5: RoundTracker

Files: new `frontend/src/game/RoundTracker.tsx`, `RoundTracker.css`, `RoundTracker.test.tsx`

- [x] Tests first: the lit step, no step, the orange words, `#status-bar-text`, the fade
- [x] Implement the tracker

### Task 8.6: Queue the step with each status line

Files: `frontend/src/App.tsx` (state 179 and 210, `queueStatusMessage` 1817 and its callers, `showVotes` 1693), `frontend/src/game/GameScreen.tsx`, new `frontend/e2e/tracker.spec.ts`

- [x] Browser tests first: the vote result keeps ELECTION lit; end of term after a failed vote lights ELECTION
- [x] `App` queues a step with every status line; `GameScreen` shows `RoundTracker` in place of `StatusBar`

### Task 8.7: Desktop and tall-window layout

Files: `frontend/src/game/GameScreen.tsx`, `GameScreen.css`, `GameScreen.test.tsx`, `frontend/e2e/layout.ts`, `frontend/e2e/no-scroll.spec.ts`; deletes `TableSeats.*`, `seatPositions.*` and `frontend/src/status-bar/`

- [x] Browser tests first: no scroll, the board floors, the roster beside or above, the tracker centred on the boards, END TERM above the draw pile, rows that never jump, the spectator view
- [x] Rebuild the game page as roster, tracker, boards and decks column; delete the round table

### Task 8.8: Phone layout and docs

Files: `frontend/src/game/GameScreen.css`, `frontend/src/game/PlayerRoster.css`, `frontend/e2e/phone.spec.ts`, `frontend/e2e/prompts.spec.ts`, `frontend/src/sound/SoundControl.css`, `CLAUDE.md`

- [x] Browser tests first: no scroll at 360x740 and 412x915 with ten players and the longest status, the order, END TERM over the counts box, touch targets, a sideways phone, the spectator view
- [x] Compact roster and the phone column
- [x] `CLAUDE.md` updated: the game page's files, layouts, breakpoints and tests

**Phase 8 acceptance**

- [x] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four Playwright projects
- [x] Every board floor in the breakdown's Global Constraints holds
- [x] One real game on the deployed build, on a desktop and on a phone, shows every row state: office, busy, votes, roles, executed, victory
- [x] PR merged into `development` and deployed

---

## Phase 9: Phase 8 follow-ups

Breakdown: [`docs/superpowers/plans/2026-11-12-phase-9-follow-ups.md`](superpowers/plans/2026-11-12-phase-9-follow-ups.md) · Spec: [`docs/superpowers/specs/2026-11-12-game-screen-redesign-design.md`](superpowers/specs/2026-11-12-game-screen-redesign-design.md)

These are Minor review findings deferred from Phase 8. The breakdown records the decisions taken when the phase started.

- [x] `frontend/src/game/roundStep.ts`: list the five no-step states explicitly instead of `default`, so TypeScript checks the switch is exhaustive; wrap the over-long `stepForPolicyLine` line; add a test that `lastState` is ignored outside `POST_LEGISLATIVE`
- [x] `frontend/src/player/usePlayerRows.ts`: `busy` is typed `boolean` but is `undefined` when `showBusy` is omitted (coerce or default it); the voting-state busy loop indexes `getPlayerOrder()` by `playerOrder.length` and throws with `includeUser: false` (iterate the order directly); a dead president counts as busy in nomination; remove the double blank line
- [x] `frontend/src/player/usePlayerRows.test.tsx`: the test "a liberal sees only their own role" asserts that a liberal sees all five roles (the fixture sets every id); rename it or set only the user's id
- [x] `frontend/src/game/PlayerRoster.css`: the Fascist/Hitler role word uses `#e8604a`, not a palette colour; derive it from the palette (e.g. `--textColorHighlight`) or name it in `variables.css`, distinct from the `#f08a5d` office orange
- [x] `frontend/src/game/PlayerRoster.test.tsx`: add tests that an office outranks `EXECUTED` on the detail line, and that a visible role icon shows on a darkened row
- [x] `frontend/src/game/RoundTracker.tsx`: build the highlight regex once; add tests for an empty line, an all-caps `PRESIDENT`, and the first render having no fade class; a step-only change (same text) leaves `shown.step` stale, so a text change right after briefly re-lights the older step during the fade
- [x] `frontend/src/game/GameScreen.test.tsx`: make the status assertion exact (`toHaveTextContent(/^…$/)`); add a test that `statusStep` reaches the tracker's `aria-current`
- [x] `frontend/src/App.tsx`: RETURN TO LOBBY resets the boards but not `statusBarText` or `statusStep`, so the next game opens with the last game's line and lit step; reset both; wrap the over-long election-tracker line
- [x] `frontend/e2e/tracker.spec.ts`: add a case that ELECTION stays lit under the victory screen (voting, then `FASCIST_VICTORY_ELECTION`)
- [x] `frontend/src/game/GameScreen.css` and `PlayerRoster.css`: the tall-window blocks restate base values to undo the phone block; note at the base rules that their values are restated there, or move to a phone-only query
- [x] `frontend/e2e/phone.spec.ts`: no check that rows keep their place when a PRES/CHAN tag appears (`rowShift` fills `.roster-detail`, which phones hide)
- [x] `frontend/e2e/prompts.spec.ts`: add an upright short viewport (the project's width x 600) beside the sideways one for the scrolled-prompt test
- [x] Phones under 360 px: below about 257 px (about 273 px on Linux) the tracker's steps wrap and the card grows past its reserved height; decide whether to support or test narrower phones. Decided: supported down to 320px wide (tested at 320x568, where the page may scroll); narrower phones are out of scope.
- [x] `frontend/src/game/RoundTracker.css`: the smaller phone step line uses the shared stacked-layout query, so tall windows get it too; decide whether tall windows keep it or get their own step size. Decided: tall windows keep the phone's step line (the stacked query, on purpose).
- [x] `frontend/src/game/RoundTracker.css`: the phone block's comment says the arrow's half-width is "about 0.2em"; it is 0.16–0.18em
- [x] `CLAUDE.md`: it says `--round-tracker-ems` keeps two lines' height; it is the whole card's height in its ems
- [x] Tooling: the e2e files are outside `tsconfig.json`'s `include`, so `npm run build` does not type-check them; Vitest prints a "jsdom was created N times" notice

**Known limits.** With Linux-drawn fonts, the longest status takes a third line at 335px and 363–364px wide, so the tracker grows by a line there (about 14px at 335px, 16px at 363–364px); at 381–383px the step line keeps under 12% to spare but does not wrap. None of these is a common phone width, and each was measured in the Playwright Linux image (Galaxy S8 emulation).

**Phase 9 acceptance**

- [x] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four Playwright projects
- [x] Every board floor in Phase 8's breakdown holds

---

## Phase 10: Baseline bugs

The six open issues `CLAUDE.md` listed as known baseline failures (each fix removed its entry, and the list is gone). Each is fixed test first on its own branch and lands here as one commit with its box ticked.

- [x] #4: the login page's gifs get a stable `key`
- [x] #5: the prompts clear their timers on unmount, and `ElectionTrackerAlert` and `InvestigationAlert` start theirs in `componentDidMount`
- [x] #8: `Player`, `EventBar` and `App` no longer call `setState` in `render`
- [x] #9: the lobby tags only the host as `[Host]`
- [x] #10: a player who reloads can take back their seat within the 3 s grace window, in a game or a full lobby
- [x] #13: the routes and the `/game` WebSocket are registered before the server starts
- [x] PRs merged into `development`: each fix merged by its own PR from `fix/issue-N` (#32, #33, #34, #35, #37, #38), so no `phase-10-baseline-bugs` branch was made

---

## Phase 11: Lobby redesign

Breakdown: [`docs/superpowers/plans/2026-11-13-phase-11-lobby.md`](superpowers/plans/2026-11-13-phase-11-lobby.md) · Spec: [`docs/superpowers/specs/2026-11-13-lobby-redesign-design.md`](superpowers/specs/2026-11-13-lobby-redesign-design.md)

Issue #23: the lobby matches the game screen and fits one screen, says what START GAME is waiting for, and lets anyone in the lobby switch between playing and watching. Added after the first ten phases were done, so the "Done when" below covers Phases 1 to 10.

- [x] `backend/src/main/java/server/util/Lobby.java`: a game seats only players with a live connection, so nobody inside the 3 s grace window gets a seat they cannot take
- [x] `frontend/src/game/RosterRow.tsx`: one roster row for the game and the lobby
- [x] `frontend/src/lobby/lobbyStatus.ts`: the status line names who START GAME is waiting for and says when bots fill the table
- [x] `frontend/src/lobby/joinError.ts` and `copyText.ts`: JOIN's error messages shared with PLAY INSTEAD; COPY uses the Clipboard API with today's fallback
- [x] `frontend/src/lobby/LobbyScreen.tsx`: the lobby page in the game's three layouts, with the game's header, roster rows and cards
- [x] `frontend/src/custom-alert/PlayInsteadPrompt.tsx`: the name prompt behind PLAY INSTEAD
- [x] `frontend/src/App.tsx`: WATCH INSTEAD and PLAY INSTEAD reconnect as the other kind, in the lobby only
- [x] `frontend/src/App.tsx`: the lobby page is `LobbyScreen`; `Lobby.css` and the old lobby markup are gone; the browser tests use the new wording
- [x] `frontend/e2e/no-scroll.spec.ts` and `phone.spec.ts`: the lobby fits every tested window with ten players and the longest line, for the host, a guest and a spectator
- [x] `frontend/e2e/lobby-switch.spec.ts`: the switch both ways, a full lobby, a taken name, the host passing on, reloads, and a game started right after a switch
- [x] `CLAUDE.md` and `README.md` describe the lobby and the switch
- [x] The pull request shows the lobby before and after, on desktop and on a phone, and closes #23

**Phase 11 acceptance**

- [x] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four Playwright projects
- [x] PR merged into `development`
- [ ] The user plays one real lobby on the deployed build, on a desktop and on a phone: switches each way, sees the status line name the player still picking, and starts a game

---

## Phase 12: Accounts with Discord sign-in

Breakdown: [`docs/superpowers/plans/2026-11-15-phase-12-accounts.md`](superpowers/plans/2026-11-15-phase-12-accounts.md) · Spec: [`docs/superpowers/specs/2026-11-15-accounts-design.md`](superpowers/specs/2026-11-15-accounts-design.md)

Issue #30: playing needs an account, made by signing in with Discord; each account has a unique username of its own, renamable outside games; watching needs nothing. Issue #31 (game stats) builds on it. Added after the first ten phases were done, so the "Done when" below covers Phases 1 to 10.

- [x] `backend/src/main/java/server/accounts/Usernames.java`: the name rules (the page's whitespace and length, unique ignoring case, no CPU player's name)
- [x] `backend/src/main/java/server/accounts/AccountStore.java`: accounts and hashed sessions in SQLite, 30 days renewed by use
- [x] `backend/src/main/java/server/util/Lobby.java`: keyed on account IDs, with the race fixes' tests moved over
- [x] `Lobby`: seats tied to accounts, `you` in every player's packet, renaming in a lobby
- [x] `/me`, `/me/username`, sign-out, the test sign-in, the `/new-lobby` guard, and renaming across lobbies
- [x] `backend/src/main/java/server/accounts/DiscordSignIn.java`: the Discord OAuth2 flow
- [x] `SecretHitlerServer`: players join and act by signed-in account; the `Origin` check
- [x] Backups: idle lobbies from before accounts kept, their games dropped; seats' accounts survive a backup
- [x] `frontend/src/account/` and `NamePrompt`: the account calls, the name prompt, the messages, no join sound for a rename
- [x] `frontend/src/login/LoginScreen.tsx`: the account card, CHOOSE A NAME and CHANGE NAME
- [x] `frontend/src/lobby/LobbyScreen.tsx`: CHANGE NAME, SIGN IN TO PLAY, PLAY INSTEAD with no prompt
- [x] The browser tests run on accounts, and the login page and lobby fit every tested size
- [x] `frontend/e2e/accounts.spec.ts`: signing in, naming, renaming and watching in the browser
- [x] `CLAUDE.md`, `README.md` and `DEVELOPMENT.md` describe accounts; the pull request shows the login page and lobby before and after, and closes #30

**Phase 12 acceptance**

- [x] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four Playwright projects
- [x] PR merged into `development`
- [ ] The user creates the Discord application and sets `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` and `DISCORD_REDIRECT_URI` on the home server
- [ ] The user signs in with Discord on the deployed build, on a desktop and on a phone, chooses a name, renames in a lobby, and plays a game

---

## Phases 13 to 22: Game records and stats

Spec: [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](superpowers/specs/2026-11-15-game-stats-design.md) · Shared names and file ownership: [`docs/superpowers/plans/2026-11-15-game-stats-interfaces.md`](superpowers/plans/2026-11-15-game-stats-interfaces.md)

Issue #31: the server records every game as it is played, and a stats section at `/stats` reads the records. Fifteen phases (13 to 22, five of them in an A and a B part), each its own branch and pull request, each built by one subagent from its breakdown; a manager session runs them. Phases that do not depend on each other run at the same time, in eight waves: **13 and 14A**; **14B** (merged after 13, so the backups land before the first record is written); **15A**; **15B, 16 and 17A**; **17B, 18, 19, 20 and 21A**; **21B**; **22A**; **22B**. Added after the first ten phases were done, so the "Done when" below covers Phases 1 to 10.

---

## Phase 13: Database backups

Breakdown: [`docs/superpowers/plans/2026-11-15-phase-13-db-backups.md`](superpowers/plans/2026-11-15-phase-13-db-backups.md) · Spec: [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](superpowers/specs/2026-11-15-game-stats-design.md), "Database backups (Phase 13)"

Issue #31 (game stats), the first of its ten phases: the database is backed up before the first game is recorded. The server keeps its SQLite file in WAL mode and logs one line once it listens, the image gains `sqlite3`, and two host scripts take a consistent, checked snapshot while the server writes and put one back. Builds on Phase 12 and merges before Phase 14.

- [x] `backend/src/main/java/server/SecretHitlerServer.java`: the database file in WAL mode at start, retried while busy for up to 5 s
- [x] `SecretHitlerServer`: one startup line once the server listens, which the restore waits for
- [x] `Dockerfile`: `sqlite3` in the final stage; `devops/tests/backup-restore.test.sh` checks it, the startup line and WAL mode in the branch's image
- [x] `devops/backup-db.sh` and `devops/.env.example` (`devops/.env` git-ignored): a checked snapshot while the server writes, retention, and the `AFTER_BACKUP` hook
- [x] `devops/restore-db.sh`: a bad file refused before anything stops, the file swapped in one move, the startup line waited for
- [x] `.github/workflows/ci.yml`: a `devops` job runs the backup and restore test against the branch's image on pull requests
- [x] `CLAUDE.md`, `README.md` and `DEVELOPMENT.md` describe backups and restores; the pull request says it changes nothing on screen

**Phase 13 acceptance**

- [x] Backend and frontend unit tests pass, the frontend builds, the backup and restore test passes, and the browser tests pass in all four Playwright projects
- [x] PR merged into `development`
- [ ] The user schedules the nightly backup on the home server, with `AFTER_BACKUP` copying each backup off the host if wanted
- [ ] The user takes one restore drill on the home server: restores a recent backup and signs in to find their account and name

---

## Phase 14A: Game timeline

Breakdown: [`docs/superpowers/plans/2026-11-15-phase-14a-game-timeline.md`](superpowers/plans/2026-11-15-phase-14a-game-timeline.md) · Spec: [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](superpowers/specs/2026-11-15-game-stats-design.md)

Issue #31, the first half of the game recorder: every game a lobby runs keeps a timeline of everything that happens in it, survives a backup with it, and hands one record to a sink when it ends or its lobby times out. Nothing is stored or served yet (Phase 14B), and nothing changes on screen. It is built beside Phase 13 and needs no database.

- [x] `backend/src/main/java/server/stats/GameSnapshot.java` and `TimelineDiff.java`: the events between two looks at a game, spelled out in order where one move makes several, with only the living seats' votes
- [x] Random games played by CPU players in every seat replay to their final board, deaths, tracker, piles and outcome, and between them make every event type and outcome
- [x] `Lobby`: a timeline per game, and one `GameRecord` handed to `GameRecordSink` when the game ends or its lobby times out, a finished game keeping its outcome
- [x] `Lobby`: pauses, resumes, terms the countdown ends, dropped connections and returns
- [x] Backups carry the timeline, taken under the lobby's lock; a restore adds `restored`; a game from before the recorder is `complete: false`
- [x] `CLAUDE.md` describes the timeline
- [x] Every finding of the whole-branch review fixed, Minor ones included

**Phase 14A acceptance**

- [x] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass (`desktop` on macOS and `firefox` in the Linux image before the PR, all four projects in CI)
- [x] Every game played to its end, with or without CPU players, and every game abandoned mid-way, hands over exactly one record, whose timeline replays to the game's end
- [x] The pull request says it changes nothing on screen
- [x] PR merged into `development`

---

## Phase 14B: Game records

Breakdown: [`docs/superpowers/plans/2026-11-15-phase-14b-game-records.md`](superpowers/plans/2026-11-15-phase-14b-game-records.md) · Spec: [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](superpowers/specs/2026-11-15-game-stats-design.md)

Issue #31, the second half of the game recorder: the server stores every record Phase 14A hands over in SQLite exactly once, with player numbers in place of accounts, and serves every record from `GET /api/stats/games`, with the contract fixture the stats pages test against. It changes nothing on screen. It starts once Phase 14A has merged and merges after Phase 13, so the backups land before any record is written.

- [x] `backend/src/main/java/server/stats/GameStore.java`: `players`, `games` and `game_seats`, player numbers, one write per game ID
- [x] `GameRecorder`: the sink, writing on its own thread; a record that fails waits for the next try
- [x] `SecretHitlerServer`: start-up (recording, the backup, the drop of a restored game that has a record, the sweep), the minute's retry and the shutdown's flush, each a method the tests call
- [x] `GET /api/stats/games`: cached until a record is saved or an account renamed, `ETag` and 304, gzip, 503, no account IDs; the dev server proxies `/api`
- [x] `frontend/src/stats/fixtures/recorded-games.json` from `./gradlew recordedGamesFixture`, checked against the spec's format
- [x] `frontend/e2e/recorder.spec.ts`: a real game played to its end is served in the spec's key order
- [x] `CLAUDE.md`, `README.md` and `DEVELOPMENT.md` describe the store, the writer, the route and the fixture
- [x] Every finding of the whole-branch review fixed, Minor ones included

**Phase 14B acceptance**

- [x] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass (`desktop` on macOS and `firefox` in the Linux image before the PR, all four projects in CI)
- [x] Every game played to its end, with or without CPU players, and every game abandoned mid-way, has exactly one stored record
- [x] A real game played against the jar with a database file is served by `/api/stats/games` in the spec's key order (`curl`)
- [x] The pull request says it changes nothing on screen
- [x] PR merged into `development`, after Phase 13's
- [ ] The user plays a game on the deployed build and finds its record in `https://<subdomain>/api/stats/games`

---

## Phase 15A: Stats shell

Breakdown: [`docs/superpowers/plans/2026-11-15-phase-15a-stats-shell.md`](superpowers/plans/2026-11-15-phase-15a-stats-shell.md) · Spec: [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](superpowers/specs/2026-11-15-game-stats-design.md)

Issue #31: the stats pages' shell at `/stats`, loaded as a chunk of its own so the game's first download does not grow, with the header, the routes and a placeholder for every page; `gameId` in every game packet; and the record's types, labels, names, links and data, and the browser-test helpers, that Phases 15B, 16 and 17A build on. Needs Phase 14B.

- [x] `GameToJSONConverter` and `Lobby`: every game packet, to players and spectators, carries `gameId`
- [x] `SecretHitlerServer`: every path under `/stats` answers with the page (Javalin's single-page fallback)
- [x] `frontend/src/stats/record.ts`: the record's types, parsed with a format check against the contract fixture, and `testRecords.ts`
- [x] `frontend/src/stats/format.ts` and `PlayerName.tsx`: results, lengths, local dates and times in the viewer's zone, and names coloured by role
- [x] `frontend/src/stats/routes.ts`, `StatsLink.tsx` and `api.ts`: the paths, History API navigation with a working back button, and the games fetched once per visit
- [x] `frontend/src/main.tsx`, `statsPath.ts` and `stats/StatsApp.tsx`: the stats as their own lazy chunk, the header, and the placeholder pages; `npm run first-download`
- [x] `frontend/e2e/stats.ts` and `stats-shell.spec.ts`: the shared helpers and page check, every page fits every tested size, the game's first download holds no stats code, and `firefox` runs `stats-*.spec`
- [x] `CLAUDE.md` and `DEVELOPMENT.md` describe the shell and the stats tests; the pull request shows the new pages
- [x] Every finding of the whole-branch review fixed, Minor ones included

**Phase 15A acceptance**

- [x] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four Playwright projects (`desktop` on macOS and `firefox` in the Linux image before the PR, all four in CI)
- [x] PR merged into `development`, after Phase 14B's
- [ ] The user opens `/stats` on the deployed build, on a desktop and on a phone, opens a game from the latest games, and moves between the pages with the header and the back button

---

## Phase 15B: Game history

Breakdown: [`docs/superpowers/plans/2026-11-15-phase-15b-game-history.md`](superpowers/plans/2026-11-15-phase-15b-game-history.md) · Spec: [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](superpowers/specs/2026-11-15-game-stats-design.md)

Issue #31: GAMES at `/stats/games`, every recorded game, newest first, with its own filter in the address, 20, 50 or 100 to a page; and the links in, from the login page's and the lobby's footers and the victory screen's "See this game". Needs Phase 15A; built beside Phases 16 and 17A, touching none of their files.

- [x] `frontend/src/stats/games/gamesFilter.ts` and `pages.ts`: GAMES' filter read from and written to the address, any other value read as the default, local days both inclusive, and the page links
- [x] `frontend/src/stats/games/GameRow.tsx` and `GamesPage.tsx`: GAMES as in `games.jpg`, one link stretched over each row, filling 15A's placeholder
- [x] The links in: Stats in the login page's and the lobby's footers, See this game on the victory screen
- [x] `frontend/e2e/stats-games.spec.ts`: GAMES fits every tested size, names stay in their columns at 320px, filters and pages go through the address, and a real game shows up in GAMES and its victory link opens it
- [x] `CLAUDE.md`, `README.md` and `DEVELOPMENT.md` describe GAMES and the links in; the pull request shows the footers, the victory screen and GAMES before and after
- [x] Every finding of the whole-branch review fixed, Minor ones included

**Phase 15B acceptance**

- [x] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four Playwright projects (`desktop` on macOS and `firefox` in the Linux image before the PR, all four in CI)
- [x] PR merged into `development`, after Phase 15A's
- [ ] The user opens GAMES and a game's link from a real game on the deployed build, on a desktop and on a phone

---

## Phase 16: The game page

Breakdown: [`docs/superpowers/plans/2026-11-15-phase-16-game-page.md`](superpowers/plans/2026-11-15-phase-16-game-page.md) · Spec: [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](superpowers/specs/2026-11-15-game-stats-design.md)

Issue #31: each game's record, round by round. `rounds(record)` turns a timeline into one entry per round, with its government, votes, cards, veto, power, blame and decision times. Every stat phase after this one reads it. `/stats/games/<id>` shows a game's header and its rounds. Built after Phase 15A, beside 15B and 17A, touching none of their files.

- [x] `frontend/src/stats/rounds.ts`: one `Round` per round from a record's timeline: the government, votes, election, tracker, cards, veto, policy, power, the term's end, pauses, reshuffles and dropped connections
- [x] `rounds.ts`: blame and each decision's time, by the spec's rules
- [x] `rounds.test.ts`: every game in the contract fixture lines up with its final board, deaths, outcome and the president rotation
- [x] `frontend/src/stats/game/GameHeader.tsx` and `GamePage.tsx`: the header, the incomplete and unfinished notes, and "This game was not found"
- [x] `frontend/src/stats/game/RoundBlock.tsx`: each round as a block edged in its policy's colour
- [x] `frontend/e2e/stats-game.spec.ts`: the page never scrolls sideways at any tested size and has 44px targets on phones, and a real game's page shows every round
- [x] `CLAUDE.md` and `README.md` describe `rounds` and the game page
- [x] Every review finding is fixed or answered with a reason
- [x] The pull request shows the game page before and after, on desktop and on a phone

**Phase 16 acceptance**

- [x] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four Playwright projects
- [x] PR merged into `development`
- [ ] The user opens a game they played, from GAMES and from its victory screen, on a desktop and on a phone, and reads its rounds

---

## Phase 17A: Stats engine

Breakdown: [`docs/superpowers/plans/2026-11-15-phase-17a-stats-engine.md`](superpowers/plans/2026-11-15-phase-17a-stats-engine.md) · Spec: [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](superpowers/specs/2026-11-15-game-stats-design.md)

Issue #31: the stats engine every tab reads (the counting rules, the player filter and the CPU toggle kept in the address, Elo with a handicap per player count), the shared cards, tables and charts, and the tab row with all seven tabs, each "Coming in a later update." until its phase fills it. Needs Phase 15A; runs beside Phases 15B and 16, touching none of their files.

- [x] `frontend/src/stats/counting.ts`: the filter in the address, counted games, rates with their minimum, ranks with ties, sessions, local days in any time zone
- [x] `frontend/src/stats/elo.ts`: Elo replayed over counted games, with the handicap per player count, provisional players and the spec's worked case
- [x] `frontend/src/stats/useStats.ts`: counted games, Elo and names, memoized per records and filter
- [x] `StatCard`, `RankedTable` and `numbers.ts`: the card look, empty states, ranked tables with "—" below the minimum
- [x] `ScrollRegion` and `SplitTable`: tables that scroll inside their card, split by role or side, for Phases 18 to 20
- [x] `frontend/src/stats/charts/LineChart.tsx`: lines dashed while provisional, details on hover or tap, a description for screen readers
- [x] `frontend/src/stats/charts/StackedBarChart.tsx`: stacked bars with their legend, ready for Phases 20 and 21A
- [x] `frontend/src/stats/FilterBar.tsx`: player chips and the CPU toggle, kept in the address; one line and a panel on phones; the toggle alone for the player page
- [x] `TabRow.tsx`, `tabs/` and `TabsPage.tsx`: seven tabs, each a "Coming in a later update." placeholder until filled, each keeping the filter
- [x] `frontend/e2e/stats-engine.spec.ts`: the tab row and the filter fit every stats size; the filter and toggle change the address; the tabs keep the filter
- [x] `CLAUDE.md` and `README.md` describe the stats engine; the pull request shows `/stats` before and after

**Phase 17A acceptance**

- [x] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four Playwright projects
- [x] PR merged into `development`
- [ ] The user opens `/stats` on the deployed build, on a desktop and on a phone, moves between the tabs, and changes the filter and the toggle

---

## Phase 17B: OVERVIEW

Breakdown: [`docs/superpowers/plans/2026-11-15-phase-17b-overview.md`](superpowers/plans/2026-11-15-phase-17b-overview.md) · Spec: [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](superpowers/specs/2026-11-15-game-stats-design.md)

Issue #31: OVERVIEW at `/stats`, filling Phase 17A's placeholder: the dashboard (days since the last game, the last game, win streak, hot hand, player of the month), the power ranking, the rating history, the headline numbers and the latest games, under the filter and the toggle. `winStreaks` and `playerOfTheMonth` are shared with RECORDS (Phase 21B). Needs Phase 17A; runs beside Phases 18, 19, 20 and 21A, touching none of their files.

- [x] `frontend/src/stats/overview.ts`: every OVERVIEW number, with `winStreaks` and `playerOfTheMonth` for RECORDS; 1,000 games well under a second
- [x] `frontend/src/stats/tabs/OverviewTab.tsx`: OVERVIEW, with the power ranking and the rating history
- [x] `frontend/e2e/stats-overview.spec.ts`: OVERVIEW fits every stats size; the numbers follow the filter and the toggle; the rating history's details on hover or tap
- [x] `CLAUDE.md` and `README.md` describe OVERVIEW; the pull request shows `/stats` before and after

**Phase 17B acceptance**

- [x] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four Playwright projects
- [x] OVERVIEW shows the numbers this design gives for a known set of records, under the filter and the toggle
- [x] PR merged into `development`
- [ ] The user opens OVERVIEW on the deployed build, on a desktop and on a phone, once games are recorded, and changes the filter and the toggle

---

## Phase 18: ROLES & CARDS

Breakdown: [`docs/superpowers/plans/2026-11-15-phase-18-roles-cards.md`](superpowers/plans/2026-11-15-phase-18-roles-cards.md) · Spec: [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](superpowers/specs/2026-11-15-game-stats-design.md)

Issue #31: the ROLES & CARDS tab fills Phase 17A's placeholder with each player's role and card stats over the counted games, read from the records' seats and from `rounds(record)` (Phase 16). Built after Phases 16 and 17A, beside 17B, 19, 20 and 21A; it changes no shared source file, only its own modules, its tab, its browser spec and the docs.

- [x] `frontend/src/stats/roles.ts`: role split, role luck, times as Hitler and the longest run of one role
- [x] `roles.ts`: win rates as Liberal, as Fascist and as Hitler, by player count, and as first president
- [x] `frontend/src/stats/cards.ts`: hands drawn beside the group's, Liberal accuracy and deep cover as president
- [x] `cards.ts`: given one of each, policies enacted and vetoes as chancellor; Fascist choices and forced Fascists
- [x] `frontend/src/stats/tabs/RolesTab.tsx`: the tab's four sections and seventeen cards, split tables that scroll inside their card, and every card's empty state
- [x] `frontend/e2e/stats-roles.spec.ts`: the tab never scrolls sideways at any `statsSizes` size against `bigStatsData()`, with 44px targets on phones
- [x] `CLAUDE.md` and `README.md` describe ROLES & CARDS
- [x] Every finding of the whole-branch review fixed, Minor ones included
- [x] The pull request shows the tab before and after, on desktop and on a phone

**Phase 18 acceptance**

- [x] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four Playwright projects
- [x] PR merged into `development`
- [ ] The user opens ROLES & CARDS on the deployed build, on a desktop and on a phone, and finds their games' numbers

---

## Phase 19: VOTES & POWERS

Breakdown: [`docs/superpowers/plans/2026-11-15-phase-19-votes-powers.md`](superpowers/plans/2026-11-15-phase-19-votes-powers.md) · Spec: [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](superpowers/specs/2026-11-15-game-stats-design.md)

Issue #31: the VOTES & POWERS tab at `/stats/votes`. It shows each player's elections, votes, presidential powers and survival over the counted games, computed in the page from `rounds(record)`. It runs after Phases 16 and 17A, beside 17B, 18, 20 and 21A: it fills its own tab file and stat modules and shares only the docs.

- [x] `frontend/src/stats/votes.ts`: nominations, nominations passed as president and as chancellor, picking a teammate, failed elections and chaos
- [x] `frontend/src/stats/votes.ts`: Ja rate by role, Liberal vote accuracy, Fascist loyalty, voted Hitler in, swing votes and lone dissent, checked against the contract fixture
- [x] `frontend/src/stats/powers.ts`: investigations (whom they investigated and what they saw, Liberal finds, checking a teammate, times investigated), peeks and special elections
- [x] `frontend/src/stats/powers.ts`: executions (targets by side, Hitler executed, times executed, first to go), vetoes as president and survival by role, checked against the contract fixture
- [x] `frontend/src/stats/tabs/VotesTab.tsx`: the tab's 26 cards in two sections (INVESTIGATIONS naming whom, split cards through Phase 17A's `SplitTable`), each with its empty state
- [x] `frontend/e2e/stats-votes.spec.ts`: the tab fits every stats size against the large stubbed response, with 44px targets on phones
- [x] `CLAUDE.md` and `README.md` describe VOTES & POWERS
- [x] Every finding of the whole-branch review fixed, Minor ones included
- [x] The pull request shows the tab before and after, on a desktop and on a phone

**Phase 19 acceptance**

- [x] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four Playwright projects
- [x] PR merged into `development`
- [ ] The user opens VOTES & POWERS on the deployed build after real games, on a desktop and on a phone, and its numbers match the games played

---

## Phase 20: RIVALS and ENDINGS

Breakdown: [`docs/superpowers/plans/2026-11-15-phase-20-rivals-endings.md`](superpowers/plans/2026-11-15-phase-20-rivals-endings.md) · Spec: [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](superpowers/specs/2026-11-15-game-stats-design.md)

Issue #31: the RIVALS tab (teammates, opponents, rivalries, each player's people, and who nominates whom) and the ENDINGS tab (how games are won by player count, the Liberal win rate beside the smoothed rate the Elo handicap uses, game length, final boards, and the most chaos policies, failed elections and vetoes in one game) fill Phase 17A's placeholders. Built after Phases 16 and 17A, beside 17B, 18, 19 and 21A, touching no shared source file.

- [x] `frontend/src/stats/rivals.ts`: pairs on the same and opposite sides, the best duo and best Fascist duo, the closest and most lopsided rivalries
- [x] `rivals.ts`: each player's most played with, best teammate, nemesis, favourite opponent and record against each opponent, and who nominated whom
- [x] `frontend/src/stats/endings.ts`: games by player count and outcome, the Liberal win rate with its smoothed rate, game length, the fastest win and the longest game
- [x] `endings.ts`: the closest and most lopsided final boards, and the most chaos policies, failed elections and vetoes in one game
- [x] `frontend/src/stats/tabs/PlayerMatrix.tsx`: player-by-player tables that scroll inside their card, the names held in view
- [x] `frontend/src/stats/tabs/RivalsTab.tsx`: the RIVALS tab
- [x] `frontend/src/stats/tabs/EndingsTab.tsx`: the ENDINGS tab
- [x] `frontend/e2e/stats-rivals.spec.ts`: both tabs fit every stats size against the large stubbed data, the matrices scroll inside their cards, 44px targets on phones
- [x] `CLAUDE.md` (and `README.md`, `DEVELOPMENT.md` where they list the tabs) describe RIVALS and ENDINGS
- [x] Every review finding fixed on the branch
- [x] The pull request shows both tabs before and after, on desktop and on a phone

**Phase 20 acceptance**

- [x] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four Playwright projects
- [x] PR merged into `development`
- [ ] The user opens RIVALS and ENDINGS on the deployed build, on a desktop and on a phone, and finds the games they played in them

---

## Phase 21A: ACTIVITY

Breakdown: [`docs/superpowers/plans/2026-11-15-phase-21a-activity.md`](superpowers/plans/2026-11-15-phase-21a-activity.md) · Spec: [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](superpowers/specs/2026-11-15-game-stats-design.md)

Issue #31, after Phases 16 and 17A, beside 17B, 18, 19 and 20: the ACTIVITY tab shows when the group plays (games over time, attendance, a calendar heatmap, the day and hour games start, sessions and gaps) and how long each decision takes, counted in the viewer's time zone. Adds the bar chart and the calendar heatmap, and the fastest-voter rule Speed Demon shares.

- [x] `frontend/src/stats/activity.ts`: the viewer's local calendar, games over time, attendance, participation, day of the week and hour of the day
- [x] `activity.ts`: the calendar heatmap, sessions, the busiest day, week and month, the longest gap and days since the last game
- [x] `frontend/src/stats/timing.ts`: decision times, the fastest voter (one rule with Speed Demon), the slowest president, the countdown's share, pauses and dropped connections, and `formatAverageTime`
- [x] `frontend/src/stats/charts/BarChart.tsx`: bars sized from their card, with a tooltip, arrow keys and a description
- [x] `frontend/src/stats/charts/CalendarHeatmap.tsx`: a cell per day in four shades, with a tooltip, arrow keys and a description
- [x] `frontend/src/stats/tabs/ActivityTab.tsx`: the ACTIVITY tab
- [x] `frontend/e2e/stats-activity.spec.ts`: ACTIVITY fits every stats size, its charts show values on hover or tap, and the browser's time zone is used
- [x] `CLAUDE.md` and `README.md` (and `DEVELOPMENT.md` if needed) describe the tab
- [x] Every finding of the whole-branch review is fixed
- [x] The pull request shows the tab before and after, on desktop and on a phone

**Phase 21A acceptance**

- [x] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four Playwright projects
- [x] PR merged into `development`
- [ ] The user opens ACTIVITY on the deployed build after a game night, on a desktop and on a phone, and finds the night's games in the charts and the calendar

---

## Phase 21B: RECORDS

Breakdown: [`docs/superpowers/plans/2026-11-15-phase-21b-records.md`](superpowers/plans/2026-11-15-phase-21b-records.md) · Spec: [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](superpowers/specs/2026-11-15-game-stats-design.md)

Issue #31, after Phases 21A and 17B: the RECORDS tab shows streaks, the best weeks and months, player of the month and its history, the longest game nights, the highest peak rating and the biggest upset, counted in the viewer's time zone and built on OVERVIEW's streaks and player of the month, so the two tabs agree.

- [x] `frontend/src/stats/records.ts`: streaks (on OVERVIEW's `winStreaks`), the most wins in a week and in a month, player of the month (OVERVIEW's `playerOfTheMonth`) and its history, the most games in one session
- [x] `records.ts`: rating records (the highest peak, and the biggest upset with its winners' gain and losers' loss)
- [x] `frontend/src/stats/tabs/RecordsTab.tsx`: the RECORDS tab
- [x] `frontend/e2e/stats-records.spec.ts`: RECORDS fits every stats size, its game link opens the game, and the player of the month follows the browser's time zone
- [x] `CLAUDE.md` and `README.md` (and `DEVELOPMENT.md` if needed) describe the tab
- [x] Every finding of the whole-branch review is fixed
- [x] The pull request shows the tab before and after, on desktop and on a phone

**Phase 21B acceptance**

- [x] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four Playwright projects
- [x] PR merged into `development`
- [ ] The user opens RECORDS on the deployed build after a game night, on a desktop and on a phone, and finds the night's session and the player of the month

---

## Phase 22A: Trophies and name links

Breakdown: [`docs/superpowers/plans/2026-11-15-phase-22a-trophies-links.md`](superpowers/plans/2026-11-15-phase-22a-trophies-links.md) · Spec: [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](superpowers/specs/2026-11-15-game-stats-design.md)

Issue #31: the fifteen trophies and RECORDS' trophy holders, one player's numbers as a pure module for Phase 22B, the game page's Elo change, and every player's name in the stats a link to their page (which stays Phase 15A's placeholder until 22B). It reads Phases 18 to 21B's stat modules through their `byPlayer` maps and changes no stat they compute. Starts once 17B, 18, 19, 20 and 21B have merged.

- [x] `frontend/src/stats/trophies.ts`: the fifteen trophies, each rule held at its threshold and not below it, with the 8-game minimum wherever the spec does not lift it
- [x] `trophies.ts` and `allStats.ts`: each player's trophies worked out from the counted games through the earlier stat modules, the Speed Demon from ACTIVITY's fastest voter
- [x] `frontend/src/stats/player.ts`: one player's numbers from every stat module, with the CPU toggle and without the player filter, and the PLAYERS rows
- [x] `frontend/src/stats/PlayerName.tsx`: a player's name in the stats links to their page (plain inside a sentence or headline); CPU seats stay plain text; no link sits inside another link or control
- [x] `frontend/src/stats/tabs/RecordsTab.tsx`: the trophy holders card, with `players/TrophyBadge.tsx`
- [x] `frontend/src/stats/game/gameElo.ts`, `GameHeader.tsx` and `GamePage.tsx`: the game's Elo change when it counted under the default filter
- [x] `frontend/e2e/stats-names.spec.ts`: name links in tables are 44px targets that never overlap on phones, a name in GAMES opens its player page, and a game page shows its Elo change
- [x] `CLAUDE.md` and `DEVELOPMENT.md` describe trophies, name links and the Elo change; the pull request shows RECORDS and a game page before and after, on desktop and on a phone

**Phase 22A acceptance**

- [x] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four Playwright projects
- [x] PR merged into `development`

---

## Phase 22B: Player pages

Breakdown: [`docs/superpowers/plans/2026-11-15-phase-22b-player-pages.md`](superpowers/plans/2026-11-15-phase-22b-player-pages.md) · Spec: [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](superpowers/specs/2026-11-15-game-stats-design.md)

Issue #31, its last phase: PLAYERS lists every player with counted games by Elo, and each player gets a page of their numbers and trophies, drawn from Phase 22A's `player.ts`. Starts once 22A has merged.

- [x] `frontend/src/stats/players/PlayersPage.tsx`: PLAYERS (name, games, win rate, Elo, last played), by Elo, under the CPU switch alone (at the user's request, no player filter: a `players` list in the address is ignored)
- [x] `frontend/src/stats/players/PlayerPage.tsx`: the player page in the spec's order, with the CPU toggle on its own, trophies, "+N with CPU players, not counted" and "All N games" into GAMES; an unknown player is not found
- [x] `frontend/e2e/stats-players.spec.ts`: PLAYERS and a player page fit every tested size, a name in GAMES opens its player page, "All N games" opens GAMES filtered to them, and the CPU switch counts CPU games
- [x] `CLAUDE.md`, `README.md` (the stats section as a whole, with screenshots) and `DEVELOPMENT.md` describe the stats; the pull request shows PLAYERS and a player page before and after, on desktop and on a phone

**Phase 22B acceptance**

- [x] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four Playwright projects
- [x] PR merged into `development`
- [ ] The user browses the stats on the deployed build, on a desktop and on a phone: PLAYERS, their own page and its trophies, a name followed from GAMES, and a game page's Elo change
- [x] The user closes issue #31 once every phase (13 to 22B) is merged

---

## Phase 23: One header for the site

Breakdown: [`docs/superpowers/plans/2026-11-16-phase-23-site-header.md`](superpowers/plans/2026-11-16-phase-23-site-header.md) · Spec: [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](superpowers/specs/2026-11-15-game-stats-design.md), "The header" and "The links in"

Added after Phases 13 to 22B were planned. The stats pages' top bar (SECRET-HITLER and STATS · GAMES · PLAYERS · PLAY) becomes the login page's header too, with PLAY moved first (PLAY · STATS · GAMES · PLAYERS, the user's choice after the review), so the stats are reached from the top of the home page instead of a footer link. The lobby keeps its own header. Planned to start once Phase 22B had merged, when the stats header is final; it runs beside 22B instead, since 22B does not touch the header.

- [x] One shared header component, taken from 15A's `StatsHeader`, used by the stats pages and the login page; the lobby and the game page keep their own headers
- [x] Login page: the shared header, with PLAY marked as the current page (`aria-current="page"`, the tab row's current look); the footer's "Stats" link removed; the header's sound control removed (sounds stay in the lobby and the game)
- [x] Lobby: its own header unchanged (sound control and spectator count); only the footer's "Stats" link removed; the victory screen's "See this game" stays
- [x] The login page and the lobby still fit one screen at every tested size and keep 44px targets on phones (the cards' spacing re-fitted, checked with Linux fonts in the Playwright image)
- [x] Browser and unit tests updated: the header on each page, PLAY current on the login page, no speaker on the login page, no footer "Stats" link
- [x] `CLAUDE.md`, `README.md` (screenshots in `docs/images/` if the login page or lobby look different) and `DEVELOPMENT.md` updated; the pull request shows the login page and the lobby before and after, on desktop and on a phone
- [x] GAMES and PLAYERS out of `/stats` (added after the review, at the user's request): `/games` and `/games/<id>`, `/players` and `/players/<n>`, the tabs still under `/stats` and the API still `/api/stats/games`; old `/stats/games…` and `/stats/players…` addresses moved to the new ones with their query; the page and the server's fallback match whole segments, and the dev proxy only `/game`, so the players' socket is never taken for `/games`
- [x] Every user-facing "CPU" says "Bots" (added after the review, at the user's request): the tabs' folded filter line ("· Bots off"), GAMES' first Bots choice ("With or without Bots"), the "Bots" tag on GAMES rows and a player's latest games, the player page's "+N with Bots, not counted", and VOTES & POWERS' investigations ("Bots ×1", never a seat's name such as "Bot 1"); code, data and addresses (`cpu=`, `hasCpu`) stay

**Phase 23 acceptance**

- [x] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four Playwright projects
- [x] PR merged into `development`
- [ ] The user opens the deployed build on a desktop and a phone and moves between the login page and the stats with the header

---

## Phases 24 to 26B: Bot skill

Spec: [`docs/superpowers/specs/2026-11-17-bot-skill-design.md`](superpowers/specs/2026-11-17-bot-skill-design.md), whose "Names the phases share" pins the names and file owners the phases share

Issue #72: fix the bots, measure them with a self-play run, give them three levels (Easy, Normal and Hard) and let the host choose the level in the lobby, and keep each game's level in its record. Seven phases (25A and the Hard bots each split in two after the plans' audit found them too big for one session), each its own branch and pull request, each built by one subagent from its breakdown; a manager session runs them. **24**, then **25A**; once 25A has merged, **25B, 25C and 25D** run one after the other (each changes `CpuPlayer`) while **26A and 26B** are built beside them. Merges go in the order 24, 25A, 25B, 25C, 25D, 26A, 26B, so Hard reaches players, and records start saying "Hard bots", only once it has passed the ladder and balance checks. A builder's work ends at green CI; the manager resumes it for each rebase and merges.

---

## Phase 24: Bot fixes and self-play

Breakdown: [`docs/superpowers/plans/2026-11-17-phase-24-bot-fixes.md`](superpowers/plans/2026-11-17-phase-24-bot-fixes.md) · Spec: [`docs/superpowers/specs/2026-11-17-bot-skill-design.md`](superpowers/specs/2026-11-17-bot-skill-design.md), "The bug fixes every level gets", "One bot step" and "The self-play run"

Issue #72, parts 1 and 2. Backend only; changes nothing on screen.

- [x] `CpuPlayer` pins its `serialVersionUID` at the value Java computed before any change (`2392054316009854878L`), and older backups still load
- [x] The weighted pick draws in proportion to the weights (#72's cases within a tolerance); a weight of 0 is never picked unless all are, then the pick is uniform
- [x] A fascist bot or Hitler never executes a known teammate; investigation and execution pick only among allowed players, with no re-pick loop
- [x] `game.CpuTurn.step` is the one bot step, used by `Lobby`, `CpuGames` and the self-play run
- [x] `./gradlew botMatches` prints win rates with 95% intervals and each ending's share, per table size 5 to 10 and pooled, and fails a game past 2,000 moves; `BotMatchesTest` keeps `./gradlew test` fast
- [x] `CLAUDE.md` and `DEVELOPMENT.md` updated; the pull request quotes `botMatches` before and after the fixes

**Phase 24 acceptance**

- [x] Backend tests pass
- [x] PR merged into `development`

---

## Phase 25A: Bot skill levels

Breakdown: [`docs/superpowers/plans/2026-11-17-phase-25a-bot-levels.md`](superpowers/plans/2026-11-17-phase-25a-bot-levels.md) · Spec: [`docs/superpowers/specs/2026-11-17-bot-skill-design.md`](superpowers/specs/2026-11-17-bot-skill-design.md), "Levels", "The self-play run" and "The no-peeking test"

Issue #72, part 3's start. Backend only; changes nothing on screen. Starts once 24 has merged.

- [x] `game.BotSkill` (Easy, Normal, Hard); `CpuPlayer(String name, BotSkill skill)` and `skill()`; a bot from an older backup plays Normal
- [x] Easy makes a random legal move at `EASY_MISTAKE_CHANCE` of its decisions, never one that throws the game for its own side
- [x] `EASY_MISTAKE_CHANCE` is set from the self-play run, one notch above the lowest that keeps Easy clearly below Normal
- [x] The no-peeking test: a bot decides the same in two games its seat cannot tell apart, for each level and each decision kind, with seeds mixed, open votes hidden until the election closes, and every pair of other seats swapped
- [x] `botMatches` takes `-Pliberals`, `-Pfascists` and `-Pladder` (the ladder and balance pairings side by side, with their verdicts), and `BotMatchesTest` plays every pairing
- [x] `CLAUDE.md` and `DEVELOPMENT.md` updated; the pull request quotes `botMatches` before, and `botMatches` and `botMatches -Pladder` after

**Phase 25A acceptance**

- [x] Backend tests pass
- [x] PR merged into `development`

---

## Phase 25B: Hard's first rules

Breakdown: [`docs/superpowers/plans/2026-11-17-phase-25b-hard-reads.md`](superpowers/plans/2026-11-17-phase-25b-hard-reads.md) · Spec: [`docs/superpowers/specs/2026-11-17-bot-skill-design.md`](superpowers/specs/2026-11-17-bot-skill-design.md), "Hard's rules" 1, 2 and 4

Issue #72, part 3. Backend only; changes nothing on screen. Starts once 25A has merged.

- [x] Hard's rule 1 (cleared players), with its own tests and in the no-peeking test
- [x] Hard's rule 2 (the chancellor's hand), with its own tests and in the no-peeking test
- [x] Hard's rule 4 (the peek), with its own tests and in the no-peeking test
- [x] A Hard bot's memory survives a backup, and `-Pladder` shows Hard not below Normal
- [x] `CLAUDE.md` updated; the pull request quotes `botMatches -Pladder` before and after

**Phase 25B acceptance**

- [x] Backend tests pass
- [x] PR merged into `development`

---

## Phase 25C: Hard's other rules

Breakdown: [`docs/superpowers/plans/2026-11-17-phase-25c-hard-bots.md`](superpowers/plans/2026-11-17-phase-25c-hard-bots.md) · Spec: [`docs/superpowers/specs/2026-11-17-bot-skill-design.md`](superpowers/specs/2026-11-17-bot-skill-design.md), "Hard's rules" 3, 5, 6 and 7

Issue #72, part 3. Backend only; changes nothing on screen. Starts once 25B has merged.

- [x] Hard's rules 3 (votes), 5 (deck odds, which also scales rule 2), 6 (the election tracker) and 7 (fascists bluff), each with its own tests and in the no-peeking test; deck odds hold through a reshuffle
- [x] `CLAUDE.md` updated; the pull request quotes `botMatches -Pladder` before and after, with the checks' verdicts

**Phase 25C acceptance**

- [ ] Backend tests pass
- [ ] PR merged into `development`

---

## Phase 25D: Ladder and balance

Breakdown: [`docs/superpowers/plans/2026-11-17-phase-25d-ladder-balance.md`](superpowers/plans/2026-11-17-phase-25d-ladder-balance.md) · Spec: [`docs/superpowers/specs/2026-11-17-bot-skill-design.md`](superpowers/specs/2026-11-17-bot-skill-design.md), "The self-play run"

Issue #72, part 3's end. Backend only; changes nothing on screen. Starts once 25C has merged; 26A and 26B merge after it.

- [ ] The ladder check passes: each side's pooled win rate rises Easy, Normal, Hard against Normal opponents, the two 95% intervals not overlapping at each step, and no size lower with the intervals not overlapping
- [ ] The balance check passes: the pooled liberal win rate of all-Hard games is within 10 points of all-Normal's
- [ ] Both checks hold on two confirming runs pooled, within the plan's tuning budget
- [ ] Any extra fascist-side rule the checks needed keeps the no-peeking rule, has its own tests and is listed in the pull request
- [ ] `CLAUDE.md` updated; the pull request quotes the full `botMatches -Pladder` table before and after

**Phase 25D acceptance**

- [ ] Backend tests pass
- [ ] PR merged into `development`

---

## Phase 26A: Bot skill in the lobby

Breakdown: [`docs/superpowers/plans/2026-11-17-phase-26a-lobby-bot-skill.md`](superpowers/plans/2026-11-17-phase-26a-lobby-bot-skill.md) · Spec: [`docs/superpowers/specs/2026-11-17-bot-skill-design.md`](superpowers/specs/2026-11-17-bot-skill-design.md), "The lobby (Phase 26A)"

Issue #72, part 4. Starts once 25A has merged; merges after 25D.

- [ ] `Lobby` keeps the host's level (Normal in a new lobby, kept after a game, Normal after a restore) and seats bots at it; `set-bot-skill` (host only, known levels, dropped during a game); every lobby packet carries `botSkill`
- [ ] The host's BOT SKILL row under START GAME's row (EASY, NORMAL, HARD), on even with no bots to seat; guests and spectators see the level on a line in the same place
- [ ] The lobby still fits one screen for every viewer at every tested size, with 44px targets on phones, checked with Linux fonts too
- [ ] `CLAUDE.md` (the lobby and the protocol line) and `README.md` updated; the pull request shows the lobby before and after, on desktop and on a phone

**Phase 26A acceptance**

- [ ] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four Playwright projects
- [ ] PR merged into `development`
- [ ] The user plays a game against Hard bots on the deployed build, with a guest who sees the level

---

## Phase 26B: Bot skill in the records

Breakdown: [`docs/superpowers/plans/2026-11-17-phase-26b-record-bot-skill.md`](superpowers/plans/2026-11-17-phase-26b-record-bot-skill.md) · Spec: [`docs/superpowers/specs/2026-11-17-bot-skill-design.md`](superpowers/specs/2026-11-17-bot-skill-design.md), "The records (Phase 26B)"

Issue #72's records, decided in the design. Starts once 25A has merged; merges after 25D and 26A.

- [ ] Records are format 2 with `botSkill` after `hasCpu` (a level's name, or null without bots); format 1 records stay as stored and are still served and read
- [ ] The contract fixture is made again with levels in turn, and `RecordFormat` and the replay checks know both formats
- [ ] GAMES rows and a player's latest games say "Easy bots", "Normal bots" or "Hard bots" ("Bots" for format 1), and a game's page names the level
- [ ] The game stats design's record table and `CLAUDE.md` updated; the pull request shows a GAMES row and a game page before and after, on desktop and on a phone

**Phase 26B acceptance**

- [ ] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four Playwright projects
- [ ] PR merged into `development`
- [ ] The user closes issue #72 once every phase (24 to 26B) is merged

---

## Done when

- [x] All ten phases merged and the Progress table reads "done" for each
- [x] The deployed instance has hosted one full game with real players, at least one spectator and at least one phone
