# Self-Hosted Fork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a personal copy of this project on a home server with a no-scroll round-table game screen, sound effects, spectators, a phone layout, a modern frontend toolchain and SQLite persistence.

**Architecture:** The Java/Javalin backend keeps the rules and WebSocket protocol and additionally serves the built frontend, so the app is one image on one port. The React frontend moves to Vite and React 18, then the game screen is extracted from `App.tsx` so layout, sound and spectator work each land in small focused modules.

**Tech Stack:** Java 17, Gradle, Javalin 5, sqlite-jdbc, JUnit 4 · React 18, TypeScript 5, Vite, Vitest, Playwright · Docker (multi-arch), GitHub Actions, GHCR.

**Spec:** [`docs/superpowers/specs/2026-11-11-self-hosted-fork-design.md`](superpowers/specs/2026-11-11-self-hosted-fork-design.md)

## Global Constraints

- Licence stays CC BY-NC-SA 4.0; README keeps credit to upstream and the board game's creators.
- No new art. Sound clips are CC0 only and listed in `docs/SOUND-CREDITS.md`.
- The WebSocket protocol stays backward compatible for players; spectator support only adds fields and a query parameter.
- One branch per phase off `development` (`phase-1-housekeeping`, `phase-2-vite`, …), merged by pull request on the fork when every box in the phase is ticked.
- Commits follow Conventional Commits with a scope: `type(scope): summary`.
- Tick a box in this file in the same commit as the work it describes.
- Desktop acceptance sizes: 1920x1080, 1920x937, 1600x900, 1366x768, 1280x720. Phone acceptance sizes: 360x740, 412x915.
- Deploys go through the host's deploy tooling, never `docker compose up` from a checkout.

## How to use this file

Each phase lists its tasks, the files they touch, and acceptance checks. Phases 2 to 7 depend on the code shape left by the phase before, so the step-by-step breakdown (exact code and test bodies) for a phase is written to `docs/superpowers/plans/` when that phase starts, and linked from its heading here. This file is the source of truth for what is done.

Every phase ends with a **Start Phase N** block. A phase is not finished until that block is done, so work flows straight from one phase into the next. Its boxes are ticked in the first commit on the new phase's branch, because the previous phase's PR is already merged by then. Phase 8 ends with **Done when** instead.

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
| 8. Game screen redesign | `phase-8-game-screen` | in progress |

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
- [ ] Add the URL to an uptime monitor using `/ping` (deferred by the user)

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
- [ ] One full game played on a real phone against the deployed instance
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

- [ ] Tests first: the lit step, no step, the orange words, `#status-bar-text`, the fade
- [ ] Implement the tracker

### Task 8.6: Queue the step with each status line

Files: `frontend/src/App.tsx` (state 179 and 210, `queueStatusMessage` 1817 and its callers, `showVotes` 1693), `frontend/src/game/GameScreen.tsx`, new `frontend/e2e/tracker.spec.ts`

- [ ] Browser tests first: the vote result keeps ELECTION lit; end of term after a failed vote lights ELECTION
- [ ] `App` queues a step with every status line; `GameScreen` shows `RoundTracker` in place of `StatusBar`

### Task 8.7: Desktop and tall-window layout

Files: `frontend/src/game/GameScreen.tsx`, `GameScreen.css`, `GameScreen.test.tsx`, `frontend/e2e/layout.ts`, `frontend/e2e/no-scroll.spec.ts`; deletes `TableSeats.*`, `seatPositions.*` and `frontend/src/status-bar/`

- [ ] Browser tests first: no scroll, the board floors, the roster beside or above, the tracker centred on the boards, END TERM above the draw pile, rows that never jump, the spectator view
- [ ] Rebuild the game page as roster, tracker, boards and decks column; delete the round table

### Task 8.8: Phone layout and docs

Files: `frontend/src/game/GameScreen.css`, `frontend/src/game/PlayerRoster.css`, `frontend/e2e/phone.spec.ts`, `CLAUDE.md`

- [ ] Browser tests first: no scroll at 360x740 and 412x915 with ten players and the longest status, the order, END TERM over the counts box, touch targets, a sideways phone, the spectator view
- [ ] Compact roster and the phone column
- [ ] `CLAUDE.md` updated: the game page's files, layouts, breakpoints and tests

**Phase 8 acceptance**

- [ ] Backend and frontend unit tests pass, the frontend builds, and the browser tests pass in all four Playwright projects
- [ ] Every board floor in the breakdown's Global Constraints holds
- [ ] One real game on the deployed build, on a desktop and on a phone, shows every row state: office, busy, votes, roles, executed, victory
- [ ] PR merged into `development` and deployed

---

## Done when

- [ ] All eight phases merged and the Progress table reads "done" for each
- [ ] The deployed instance has hosted one full game with real players, at least one spectator and at least one phone
