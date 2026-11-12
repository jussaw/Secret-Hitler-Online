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

Every phase ends with a **Start Phase N** block. A phase is not finished until that block is done, so work flows straight from one phase into the next. Its boxes are ticked in the first commit on the new phase's branch, because the previous phase's PR is already merged by then. Phase 7 ends with **Done when** instead.

## Progress

| Phase | Branch | Status |
|---|---|---|
| 1. Housekeeping | `phase-1-housekeeping` | done |
| 2. Frontend modernization | `phase-2-vite` | done |
| 3. Persistence, packaging, first deploy | `phase-3-deploy` | in progress |
| 4. Round-table game screen | `phase-4-round-table` | not started |
| 5. Phone layout | `phase-5-phone` | not started |
| 6. Sounds | `phase-6-sounds` | not started |
| 7. Spectators | `phase-7-spectators` | not started |

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
- [ ] Pushing to `development` produces a new image that the host picks up (checked after this PR merges; the host checks for new images daily)
- [ ] PR merged into `development`

**Start Phase 4: Round-table game screen**

- [ ] Progress table: Phase 3 set to "done", Phase 4 set to "in progress"
- [ ] `git checkout development && git pull`, then `git checkout -b phase-4-round-table`
- [ ] Re-read Phase 4 below against the code as it now stands; fix any file paths or line numbers that moved
- [ ] Write the Phase 4 step-by-step breakdown to `docs/superpowers/plans/` (writing-plans skill) and link it from the Phase 4 heading
- [ ] Begin Task 4.1

---

## Phase 4: Round-table game screen

Outcome: all players and both boards visible with no scrolling on desktop.

### Task 4.1: Extract `GameScreen`

Files: new `frontend/src/game/GameScreen.tsx`, `frontend/src/game/GameScreen.css`; modify `frontend/src/App.tsx` (`renderGamePage`, lines 1701-1791)

- [ ] Move the game markup into `GameScreen`, a presentational component: props are `gameState`, `user`, `showVotes`, `showBusy`, `statusBarText`, deck sizes, policy counts, `electionTracker`, `onEndTerm`
- [ ] `App.tsx` renders `<GameScreen …/>` plus the existing `CustomAlert`, `EventBar` and snackbar; no inline layout styles remain in `renderGamePage`
- [ ] No visual change in this task (compare screenshots before and after)

### Task 4.2: Seat geometry

Files: new `frontend/src/game/seatPositions.ts`, `frontend/src/game/seatPositions.test.ts`

- [ ] Tests first: for counts 5 to 10, returns `count` positions; the local player's seat is bottom centre (`x` 50, largest `y`); seating order follows `playerOrder` clockwise; all coordinates within 0 to 100; no two seats closer than a minimum distance
- [ ] Implement `seatPositions(count: number, selfIndex: number): { x: number; y: number }[]` as points on an ellipse in percent units
- [ ] A spectator (no `selfIndex`) gets `selfIndex = 0`

### Task 4.3: Table layout

Files: new `frontend/src/game/TableSeats.tsx`; modify `GameScreen.tsx/.css`, `frontend/src/player/PlayerDisplay.tsx`, `frontend/src/player/Player.css`, `frontend/src/board/Board.css`, `frontend/src/App.css` (header height)

- [ ] `GameScreen` is a grid filling `100dvh` minus a slimmer header; `overflow: hidden` is not used to fake the result
- [ ] `TableSeats` absolutely positions each existing `Player` at its seat; president/chancellor markers, vote icons, busy icons and the executed state render as before
- [ ] Centre column: board(s), then draw deck / policy status / discard deck, then status text and END TERM
- [ ] Sizes use `clamp()` with `vh`/`vw` so the table scales between the smallest and largest acceptance sizes
- [ ] Selecting a player in prompts (`SelectPlayerPrompt`) still works; prompts stay in the overlay

### Task 4.4: No-scroll browser test

Files: new `frontend/e2e/no-scroll.spec.ts`, `frontend/playwright.config.ts`; `package.json` script `e2e`; CI job

- [ ] Test starts a lobby against a local backend, adds CPU players to reach 5, 7 and 10, starts the game
- [ ] At each desktop acceptance size asserts `document.documentElement.scrollHeight <= window.innerHeight` and `scrollWidth <= innerWidth`, and that every seat's bounding box is inside the viewport
- [ ] Add the e2e run to `ci.yml`
- [ ] `CLAUDE.md` updated: `frontend/src/game/` layout and the `npm run e2e` command

**Phase 4 acceptance**

- [ ] `npm run e2e` passes at all five desktop sizes for 5, 7 and 10 players
- [ ] Vote reveal, policy enactment, investigation, special election, execution and victory animations all display correctly over the table
- [ ] PR merged into `development`; deployed image checked on a real 1080p monitor

**Start Phase 5: Phone layout**

- [ ] Progress table: Phase 4 set to "done", Phase 5 set to "in progress"
- [ ] `git checkout development && git pull`, then `git checkout -b phase-5-phone`
- [ ] Re-read Phase 5 below against the code as it now stands; fix any file paths or line numbers that moved
- [ ] Write the Phase 5 step-by-step breakdown to `docs/superpowers/plans/` (writing-plans skill) and link it from the Phase 5 heading
- [ ] Begin Task 5.1

---

## Phase 5: Phone layout

Outcome: playable on a phone in portrait, with vertical scrolling allowed.

### Task 5.1: Stacked game layout

Files: `frontend/src/game/GameScreen.css`, `frontend/src/game/TableSeats.tsx`, `frontend/src/player/Player.css`

- [ ] At `max-width: 768px`, seats render as a wrapping grid instead of ellipse positions; then status, boards at full width, decks
- [ ] Touch targets (player selection, vote buttons, policy cards) are at least 44px

### Task 5.2: Other pages and prompts

Files: `frontend/src/LoginPageContent.css`, `frontend/src/Lobby.css`, `frontend/src/custom-alert/CustomAlert.css` (currently `max-width: 40vw`), prompt CSS files, `frontend/index.html` viewport meta

- [ ] Login and lobby fit 360px width
- [ ] Alerts use near-full width on phones; policy and vote prompts fit without horizontal scroll

### Task 5.3: Phone browser test

Files: new `frontend/e2e/phone.spec.ts`

- [ ] At 360x740 and 412x915, assert `scrollWidth <= innerWidth` on login, lobby, game, and with a vote prompt open

**Phase 5 acceptance**

- [ ] Phone e2e passes; Phase 4 e2e still passes
- [ ] One full game played on a real phone against the deployed instance
- [ ] PR merged into `development`

**Start Phase 6: Sounds**

- [ ] Progress table: Phase 5 set to "done", Phase 6 set to "in progress"
- [ ] `git checkout development && git pull`, then `git checkout -b phase-6-sounds`
- [ ] Re-read Phase 6 below against the code as it now stands; fix any file paths or line numbers that moved
- [ ] Write the Phase 6 step-by-step breakdown to `docs/superpowers/plans/` (writing-plans skill) and link it from the Phase 6 heading
- [ ] Begin Task 6.1

---

## Phase 6: Sounds

Outcome: game events are audible, with volume and mute controls.

### Task 6.1: Source clips

Files: new `frontend/src/assets/sounds/*`, `docs/SOUND-CREDITS.md`

- [ ] One CC0 clip per sound name: `yourTurn`, `playerJoined`, `gameStart`, `nominate`, `voteCast`, `votePassed`, `voteFailed`, `trackerAdvance`, `cardDraw`, `cardDiscard`, `policyLiberal`, `policyFascist`, `power`, `investigate`, `execution`, `veto`, `victory`, `defeat`
- [ ] Each trimmed, loudness-normalized, exported as OGG and MP3, under 100 KB where possible
- [ ] `docs/SOUND-CREDITS.md` lists file, source URL, author and licence for every clip

### Task 6.2: `SoundManager`

Files: new `frontend/src/sound/SoundManager.ts`, `frontend/src/sound/SoundManager.test.ts`

- [ ] Tests first: volume and mute persist to and restore from `localStorage`; `play` before unlock does nothing; `play` when muted does nothing; a clip that fails to load does not throw
- [ ] Implement `play(name: SoundName)`, `setVolume(0..1)`, `setMuted(boolean)`, `unlock()`; `unlock` is called on the first pointer or key event
- [ ] `SoundName` is a string-literal union of the names in Task 6.1

### Task 6.3: `soundEvents`

Files: new `frontend/src/sound/soundEvents.ts`, `frontend/src/sound/soundEvents.test.ts`

- [ ] Tests first, one per event, using pairs of `GameState` fixtures (types in `frontend/src/types/game.ts`): for example state changes to the vote-result state with a passing vote returns `["votePassed"]`; `electionTrackerAdvanced` true returns `["trackerAdvance"]`; the local player becomes the one who must act returns `["yourTurn"]`
- [ ] Implement `soundEvents(prev: GameState | undefined, next: GameState, user: string): SoundName[]` as a pure function
- [ ] Victory versus defeat is decided from the local player's party; spectators get `victory`

### Task 6.4: Wire up

Files: `frontend/src/App.tsx` (`onGameStateChanged`, line 1025, and the lobby update path)

- [ ] Call `soundEvents` in `onGameStateChanged` and queue each sound through the existing animation queue so audio lines up with the visuals, not with packet arrival
- [ ] Lobby user-list growth plays `playerJoined`

### Task 6.5: Controls

Files: new `frontend/src/sound/SoundControl.tsx` and `.css`; `frontend/src/App.tsx` header on all three pages

- [ ] Speaker button toggles mute; hovering or tapping shows a volume slider
- [ ] Control fits in the slim header from Phase 4 and does not break the no-scroll tests
- [ ] `CLAUDE.md` updated: `frontend/src/sound/` modules and the CC0 credits rule

**Phase 6 acceptance**

- [ ] Unit tests pass; Phase 4 and 5 e2e still pass
- [ ] In a full game every listed event is heard once, in sync with its animation
- [ ] Mute and volume survive a page refresh
- [ ] No sound plays before the first click, and no autoplay error appears in the console
- [ ] PR merged into `development`

**Start Phase 7: Spectators**

- [ ] Progress table: Phase 6 set to "done", Phase 7 set to "in progress"
- [ ] `git checkout development && git pull`, then `git checkout -b phase-7-spectators`
- [ ] Re-read Phase 7 below against the code as it now stands; fix any file paths or line numbers that moved
- [ ] Write the Phase 7 step-by-step breakdown to `docs/superpowers/plans/` (writing-plans skill) and link it from the Phase 7 heading
- [ ] Begin Task 7.1

---

## Phase 7: Spectators

Outcome: anyone with the lobby code can watch without a seat and without seeing secrets.

### Task 7.1: Spectator state filtering

Files: `backend/src/main/java/server/util/GameToJSONConverter.java`, new `backend/src/test/java/server/SpectatorStateTest.java`

- [ ] Tests first: the spectator conversion of an in-progress game contains no player `id` (role), no `presidentChoices`, `chancellorChoices` or `peek`, and no investigation result; after the game ends roles are present, matching what players receive
- [ ] Implement a spectator conversion path (the converter already tailors output per user; the spectator is a viewer who is no player)
- [ ] Add `spectatorCount` to every state packet

### Task 7.2: Lobby spectators

Files: `backend/src/main/java/server/util/Lobby.java`, new tests in `backend/src/test/java/server/`

- [ ] Tests first: adding a spectator does not change `getUserCount()` or `isFull()`; spectators receive updates from `updateAllUsers()`; removing the last player leaves a spectator-only lobby that `hasTimedOut()` treats as inactive
- [ ] Add a transient spectator connection set with `addSpectator`, `removeSpectator`, `isSpectator`; include spectators in `updateAllUsers()` using the spectator conversion

### Task 7.3: Server handshake and command rejection

Files: `backend/src/main/java/server/SecretHitlerServer.java` (`onWebsocketConnect` line 505, `onWebSocketMessage`, `onWebSocketClose`, `checkLogin`)

- [ ] `/game?lobby=CODE&spectator=true` connects without a `name`; unknown lobby closes with the same error as a player join
- [ ] `/check-login` accepts a spectator check so the client can validate the code first
- [ ] Any command other than `ping` and `get-state` from a spectator connection is rejected and logged
- [ ] Test: a spectator sending `register-vote` does not change the game's votes

### Task 7.4: Client

Files: `frontend/src/App.tsx` (login form, `tryOpenWebSocket`, cookies), `frontend/src/types/`, `frontend/src/game/GameScreen.tsx`

- [ ] "Watch" button beside Join on the login form; needs only a lobby code
- [ ] Spectator flag stored in a cookie so refresh and reconnect keep spectating
- [ ] Spectators see the lobby page read-only before the game starts, then `GameScreen`; no prompts are queued for them; status text describes what the table is doing
- [ ] Spectator count shown in the lobby and on the game screen when above zero
- [ ] Sounds play for spectators
- [ ] `CLAUDE.md` updated: spectator handshake parameter and the server-side filtering rule

**Phase 7 acceptance**

- [ ] Backend tests pass
- [ ] e2e: a spectator joins a running game, the WebSocket frames it receives contain no role or hand fields before game end, and layout tests still pass with a spectator viewport
- [ ] A spectator joining mid-game and refreshing stays a spectator
- [ ] PR merged into `development` and deployed

---

## Done when

- [ ] All seven phases merged and the Progress table reads "done" for each
- [ ] The deployed instance has hosted one full game with real players, at least one spectator and at least one phone
