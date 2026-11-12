# Self-Hosted Fork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a personal copy of this project on a Raspberry Pi 4 with a no-scroll round-table game screen, sound effects, spectators, a phone layout, a modern frontend toolchain and SQLite persistence.

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
- Deploys to the Pi go through jussaw-server, never `docker compose up` from a checkout.

## How to use this file

Each phase lists its tasks, the files they touch, and acceptance checks. Phases 2 to 7 depend on the code shape left by the phase before, so the step-by-step breakdown (exact code and test bodies) for a phase is written to `docs/superpowers/plans/` when that phase starts, and linked from its heading here. This file is the source of truth for what is done.

Every phase ends with a **Start Phase N** block. A phase is not finished until that block is done, so work flows straight from one phase into the next. Its boxes are ticked in the first commit on the new phase's branch, because the previous phase's PR is already merged by then. Phase 7 ends with **Done when** instead.

## Progress

| Phase | Branch | Status |
|---|---|---|
| 1. Housekeeping | `phase-1-housekeeping` | in progress |
| 2. Frontend modernization | `phase-2-vite` | not started |
| 3. Persistence, packaging, first deploy | `phase-3-deploy` | not started |
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

- [ ] What this is: a personal fork of `ShrimpCryptid/Secret-Hitler-Online`, remotes `origin` (fork) and `upstream`, default working branch `development`, licence CC BY-NC-SA 4.0
- [ ] Layout: `backend/` (Java, Gradle, Javalin; rules in `src/main/java/game/`, server in `src/main/java/server/`), `frontend/` (React, TypeScript), `docs/`
- [ ] Commands: run backend, run frontend, run each test suite, build (verified by running each one)
- [ ] Workflow: one branch per phase off `development`, PRs target the fork (`--repo jussaw/Secret-Hitler-Online`, since `gh` defaults to upstream), never push to `upstream`
- [ ] Commit convention: Conventional Commits with a scope; list the scopes in use (`frontend`, `backend`, `docker`, `ci`, `docs`, `plan`)
- [ ] Pointers: `docs/PLAN.md` is the source of truth for progress and boxes are ticked in the same commit as the work; the spec path
- [ ] Constraints: no new art, CC0 sounds only, WebSocket protocol stays backward compatible for players, Pi deploys go through jussaw-server
- [ ] Add a line for this repo to `~/CLAUDE.md` (in `~/dotfiles`) under the `~/repos/` list

**Phase 1 acceptance**

- [ ] `./gradlew test` matches the baseline
- [ ] `npm run build` succeeds in `frontend/`
- [ ] A full CPU game plays locally with no console errors beyond the baseline tracked in #2 to #5
- [ ] PR merged into `development`

**Start Phase 2: Frontend modernization**

- [ ] Progress table: Phase 1 set to "done", Phase 2 set to "in progress"
- [ ] `git checkout development && git pull`, then `git checkout -b phase-2-vite`
- [ ] Re-read Phase 2 below against the code as it now stands; fix any file paths or line numbers that moved
- [ ] Write the Phase 2 step-by-step breakdown to `docs/superpowers/plans/` (writing-plans skill) and link it from the Phase 2 heading
- [ ] Begin Task 2.1

---

## Phase 2: Frontend modernization

Outcome: same app, same behaviour, on Vite + React 18 + TypeScript 5 + Vitest.

### Task 2.1: Dependency audit

- [ ] Remove packages with no imports: `react-router`, `react-router-dom`, `react-router-config`, `react-alice-carousel` (and `src/util/CustomAliceCarousel.css` if unreferenced), `query-string` if unreferenced, `prop-types` if unreferenced
- [ ] `npm run build` still succeeds on CRA before the migration starts

### Task 2.2: CRA to Vite

Files: `frontend/package.json`, new `frontend/vite.config.ts`, `frontend/index.html` (moved from `public/`), `frontend/src/index.js` → `src/main.tsx`, `frontend/.env.local`, `frontend/.env.dev`, new `frontend/src/vite-env.d.ts`

- [ ] Install `vite` and `@vitejs/plugin-react`; remove `react-scripts`, `env-cmd`, `@babel/plugin-proposal-private-property-in-object`, the `eslintConfig` and `browserslist` blocks
- [ ] Move `public/index.html` to `frontend/index.html`, replace `%PUBLIC_URL%` paths, add `<script type="module" src="/src/main.tsx">`
- [ ] Rename env vars `REACT_APP_*` → `VITE_*` in both `.env` files and every `process.env.REACT_APP_*` → `import.meta.env.VITE_*`
- [ ] Scripts: `dev` (`vite --mode local`), `dev:server` (`vite --mode dev`), `build` (`tsc --noEmit && vite build`), `preview`, `test`
- [ ] Rename any `.js` file containing JSX to `.jsx` (Vite does not parse JSX in `.js`)
- [ ] Delete `src/serviceWorker.js` and its registration call
- [ ] Dev server on port 3000 loads the login page against a local backend

### Task 2.3: React 18 and TypeScript 5

- [ ] Upgrade `react`, `react-dom` to 18 and `@types/react`, `@types/react-dom` to match; switch the entry to `createRoot`
- [ ] Upgrade `typescript` to 5; fix resulting type errors without changing behaviour
- [ ] Replace `react-textfit` in `src/player/Player.js` with CSS `clamp()` font sizing; uninstall it
- [ ] Replace `react-helmet` (`src/util/HelmetMetaData.js`, used at `App.tsx:1822`) with static `<meta>` tags in `index.html`; delete the component; uninstall it
- [ ] Check animation timing under React 18 automatic batching: the animation queue in `App.tsx` (`addAnimationToQueue`, `onAnimationFinish`) must still play events in order

### Task 2.4: Vitest

- [ ] Install `vitest`, `jsdom`, `@testing-library/react` (v14+), `@testing-library/jest-dom` (v6+); add `test` config to `vite.config.ts`
- [ ] Port `src/App.test.js` and `src/setupTests.js`; `npm test -- --run` passes

### Task 2.5: Update dev Docker and docs

- [ ] `docker-compose.yml` frontend service: `node:20`, command `npm install && npm run dev -- --host`
- [ ] `DEVELOPMENT.md` reflects the new script names
- [ ] `CLAUDE.md` commands and layout updated for Vite and Vitest

**Phase 2 acceptance**

- [ ] `npm run build` and `npm test -- --run` pass
- [ ] `grep -rn "REACT_APP_\|react-scripts" frontend --include='*' --exclude-dir=node_modules` returns nothing
- [ ] Manual regression: create lobby, join with a second browser, add CPU players, play to both a liberal and a fascist win, refresh mid-game and rejoin
- [ ] PR merged into `development`

**Start Phase 3: Persistence, packaging, first deploy**

- [ ] Progress table: Phase 2 set to "done", Phase 3 set to "in progress"
- [ ] `git checkout development && git pull`, then `git checkout -b phase-3-deploy`
- [ ] Re-read Phase 3 below against the code as it now stands; fix any file paths or line numbers that moved
- [ ] Write the Phase 3 step-by-step breakdown to `docs/superpowers/plans/` (writing-plans skill) and link it from the Phase 3 heading
- [ ] Begin Task 3.1

---

## Phase 3: Persistence, packaging, first deploy

Outcome: the unmodified-looking game runs on the Pi at its public subdomain and survives restarts.

### Task 3.1: SQLite backup

Files: `backend/build.gradle`, `backend/src/main/java/server/ApplicationConfig.java`, `backend/src/main/java/server/SecretHitlerServer.java` (database section, about lines 211-380), new `backend/src/test/java/server/DatabaseBackupTest.java`

- [ ] Write a failing test: store a lobby map to a temp-file database, load it back, assert lobby codes and usernames match
- [ ] Replace `org.postgresql:postgresql` with `org.xerial:sqlite-jdbc`
- [ ] `ApplicationConfig`: replace `DATABASE_URL` with `DATABASE_PATH`; unset means persistence disabled
- [ ] `getDatabaseConnection()`: `jdbc:sqlite:<DATABASE_PATH>`; table column `lobby_bytes BLOB`; make the insert an upsert that SQLite accepts
- [ ] Extract store/load so they take a connection (or path) parameter and are callable from the test
- [ ] Unset or unwritable path logs one error and the server keeps running
- [ ] `./gradlew test` passes

### Task 3.2: Same-origin serving

Files: `backend/src/main/java/server/SecretHitlerServer.java` (Javalin config), `backend/build.gradle`, `frontend/src/App.tsx` (server address constants), `frontend/vite.config.ts`, `frontend/.env.*`

- [ ] Javalin serves static files from the classpath directory `/public` with `index.html` at `/`
- [ ] Frontend builds API and WebSocket URLs from `window.location` (`wss:` when the page is `https:`) unless `VITE_SERVER_ADDRESS` is set
- [ ] Vite dev server proxies `/check-login`, `/new-lobby`, `/ping` and `/game` (with `ws: true`) to `localhost:4040`
- [ ] Gradle task copies `frontend/dist` into the jar's `public/` when present
- [ ] `java -jar` with a built frontend serves the whole app on one port

### Task 3.3: Image

Files: new `Dockerfile` and `.dockerignore` at repo root, delete `backend/Dockerfile` and `backend/config/Dockerfile.dev` if unused

- [ ] Stage 1 `node:20`: `npm ci && npm run build` in `frontend/`
- [ ] Stage 2 `gradle:8-jdk17`: copy `frontend/dist`, run `gradle jar`
- [ ] Stage 3 `eclipse-temurin:17-jre`: copy the jar, `ENV PORT=8080 DATABASE_PATH=/data/backup.db`, `VOLUME /data`, `EXPOSE 8080`, run as a non-root user
- [ ] `docker build` then `docker run -p 8080:8080 -v sh-data:/data` plays a game locally
- [ ] Restart the container mid-game; the lobby is still there after rejoin

### Task 3.4: Dev compose

- [ ] `docker-compose.yml`: remove the `db` service and `DATABASE_URL`; backend gets `DATABASE_PATH` on a named volume
- [ ] `DEVELOPMENT.md` updated
- [ ] `CLAUDE.md` updated: SQLite `DATABASE_PATH`, same-origin serving, image build and deploy path

### Task 3.5: CI

Files: new `.github/workflows/ci.yml`

- [ ] Job `test`: `./gradlew test` and `npm ci && npm test -- --run && npm run build`, on pull requests and pushes to `development`
- [ ] Job `image` (push to `development` only, after `test`): buildx with QEMU, platforms `linux/arm64,linux/amd64`, push `ghcr.io/jussaw/secret-hitler-online:latest` and `:sha-<short>`
- [ ] First run is green and the package is visible on GHCR

### Task 3.6: Pi stack (in `~/repos/portainer-compose`)

- [ ] Add a service to `pi4/sites/docker-compose.yml` following its neighbours: `container_name`, the GHCR image, `sites` network, `TZ`, a free published port mapped to `8080`, `restart: unless-stopped`, and a bind mount to `/data` using that repo's appdata convention
- [ ] `docker compose config` validates in `pi4/sites`
- [ ] Commit there, then deploy via jussaw-server
- [ ] If the GHCR package is private, add pull credentials on the Pi the same way the other `ghcr.io/jussaw/*` images use

### Task 3.7: Proxy

- [ ] Add the subdomain's DNS record
- [ ] Add a proxy host on the Pi's reverse proxy to the published port with WebSocket upgrade enabled and a TLS certificate
- [ ] Add the URL to uptime monitoring using `/ping`

**Phase 3 acceptance**

- [ ] `https://<subdomain>/ping` answers
- [ ] A game with two real browsers plus CPU players completes over `wss`
- [ ] `docker restart` of the container mid-game; players rejoin and continue
- [ ] Pushing to `development` produces a new image that the Pi picks up
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
