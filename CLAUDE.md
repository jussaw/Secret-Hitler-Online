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
  CORS is enabled only in debug mode. Spectators connect with `/game?lobby=CODE&spectator=true` and
  no `name` (checked first with `/check-login?lobby=CODE&spectator=true`). In `Lobby` they are a set
  of connections with no seat, name or icon: never counted as users, never backed up, and they do
  not keep a lobby from timing out. Secrets are filtered on the server only:
  `GameToJSONConverter.convertForSpectator` sends no role, hand or peek until the game is over.
  Every command from a spectator except `ping` and `get-state` is logged and dropped, and every
  packet, lobby or game, carries `spectatorCount`. `Lobby` pins its `serialVersionUID`, so backups
  written by earlier releases still load (`DatabaseBackupTest`).
- `frontend/`: React 18 and TypeScript 5, built with Vite and tested with Vitest. The entry is
  `src/main.tsx`, with `index.html` at the `frontend/` root. `src/App.tsx` owns the WebSocket, all
  state, the overlays, and the login and lobby pages; prompts live in `src/custom-alert/`. The game
  page is `src/game/`: `GameScreen` (markup and the three layouts), `PlayerRoster` (a row per player
  in `playerOrder`: portrait, name, office or role, and the vote or busy bubble), `RoundTracker`
  (the four steps of a round, the current one lit, over the status line `#status-bar-text`; it
  always keeps two lines' height, `--round-tracker-ems`) and `roundStep` (a pure function from the
  game state and `lastState` to the step; `App` queues the step with each status line).
  `usePlayerRows` (`src/player/`) is the per-player state the roster rows and the prompts' card
  tiles share. Desktops get the roster as a column at the left, the tracker over the boards, and
  END TERM, the decks and the counts box in a column beside them, on one screen (`.game-table` is a
  size container, and the boards' width comes from its container units). Phones, windows narrower
  than 5:4 and windows under 500px tall get one column from
  `@media (max-width: 768px), (aspect-ratio < 5/4), (max-height: 500px)` in `GameScreen.css` and
  `PlayerRoster.css`: compact rows about 26px tall in two columns (`PRES` or `CHAN` after the name),
  the tracker, a decks row with END TERM over the counts box, and the boards at full width. With ten
  players and the longest status it fits 360x740 and 412x915 without scrolling; a phone held
  sideways scrolls. `SoundControl.css` gives the header controls 44px targets under the same query.
  Among those, windows at least 700px wide (half-screen desktop windows, upright monitors, tablets
  held upright) fit one screen instead, with the roster across the top in two columns (three in
  near-square windows), from a later block, `(min-width: 700px) and (aspect-ratio < 5/4)`, in the
  same two files, which undoes the phone block. On desktop and in tall windows a twelve-character
  name fits whole, and only a name too wide for its row ends in an ellipsis, with the full name in
  the row's title on hover; the phones' compact rows end any name that does not fit in an ellipsis.
  Prompts are a fixed overlay whose box scrolls (`CustomAlert.css`). Sounds are in `src/sound/`:
  `SoundManager` (Web Audio; the `AudioContext` is created in the first trusted gesture, so `play()`
  before it is a silent no-op; volume and mute in `localStorage` under `sounds`; every `play()`
  dispatches a `sound-play` event, which tests record), `soundEvents` (a pure function from the
  previous and next game state to sound names, and `SOUND_CUES`, the queued animation each sound
  waits for; `App` puts each sound into its animation queue just before that animation) and
  `SoundControl` (the speaker button and volume slider in all three headers, above the prompt
  overlay, with Lucide icons from `lucide-react`). The clips are in `src/assets/sounds/`, an Ogg
  Opus and an MP3 per sound, each credited in `docs/SOUND-CREDITS.md`. Spectators are in
  `src/spectator/`: `spectatorStatus` (the status lines a spectator gets in place of prompts, naming
  the players) and `SpectatorCount` (Lucide's eye and the number, at the left of the lobby and game
  headers). A spectator's name is `""`, and the `spectator` cookie takes a reload straight back to
  watching. Playwright tests live in `frontend/e2e/`, in four projects: `desktop`
  (`no-scroll.spec.ts`: at `DESKTOP_SIZES` and in the `NARROW_WINDOWS` no scroll, every board at
  least its `BOARD_FLOOR`, the tracker exactly its reserved height and the boards unmoved by the
  longest status; wide twelve-character names fit there and at `SQUARE_DESKTOPS`), `firefox` (the
  same no-scroll tests, since Firefox rounds the layout differently, and the header-fit tests of
  `sounds.spec.ts` and `spectator.spec.ts`), and `phone-360`/`phone-412` (Galaxy S8 and Pixel 7
  emulation, `phone.spec.ts`: the game fits without scrolling, in order, with 44px targets, for
  players and a spectator, and a phone held sideways gets the phone layout). `tracker.spec.ts`
  (`desktop`) checks the lit step against the status line. `prompts.spec.ts` runs in `desktop` and
  both phone projects; it opens every prompt from a scripted game socket (`e2e/fakeGame.ts`).
  `sounds.spec.ts` runs in every project: no sound and no `AudioContext` before the first trusted
  gesture, each sound in step with its animation, and the header control's fit, touch targets,
  keyboard use and saved settings. `spectator.spec.ts` plays a scripted game to a spectator (no
  prompt before the victory screen, the status lines, the sounds), plays a real game whose spectator
  frames it scans for secrets (`e2e/driveGame.ts` seats raw-socket players; `e2e/secrets.ts` mirrors
  the backend's list), and checks the count fits every header. `startGame` (`e2e/lobby.ts`) joins
  one raw spectator by default, and the no-scroll and phone tests also measure a spectator's view.
  The server closes a `/game` socket after 30 s with no traffic either way, so the client pings
  every 20 s (`PING_INTERVAL`); `connection.spec.ts` (`desktop`) holds a quiet lobby's socket open
  for 35 s. Shared helpers are `e2e/lobby.ts`, `e2e/layout.ts` and `e2e/soundLog.ts`. `App.css`
  hides `overflow-x` on `html` and `body`, so horizontal overflow shows only in `body.scrollWidth`,
  and `body` scrolls vertically by itself (`pageHeight` measures both). The client talks to its own
  origin (`src/constants/serverUrls.ts`; `wss:` on `https:` pages) unless `VITE_SERVER_ADDRESS` is
  set, and the dev server proxies the backend paths to `BACKEND_URL` (default
  `http://localhost:4040`). `VITE_*` variables live in `.env.development` (dev server only:
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
| Browser tests (build the frontend and the jar, serve them on `localhost:4545`; Java 17 active) | `cd frontend && npx playwright install chromium firefox && npm run e2e` (one project: `-- --project=phone-360`) |
| Backend build (tests + fat jar at `backend/build/libs/secret-hitler-online.jar`) | `cd backend && ./gradlew build` |
| Frontend production build (type-check, then `frontend/dist/`) | `cd frontend && npm run build` |
| Whole app on one port (after the frontend build) | `cd backend && ./gradlew jar && java -jar build/libs/secret-hitler-online.jar` |
| Image (repo root) | `docker build -t secret-hitler-online .` |

Known baseline failures (do not "fix" them while doing unrelated work):

- The dev-build console shows pre-existing React warnings: #8 (`Player.render` calls `setState`)
  and #5 (prompts set state from uncleared timers; on React 18 only `ElectionTrackerAlert`'s
  constructor timer still warns, after a failed election).
- #13: a request right after the server starts can 404 because routes are registered after `start()`.

`npm run dev:server` points at upstream's hosted dev backend, not anything this fork runs.

## Deploy

CI (`.github/workflows/ci.yml`) runs the backend and frontend tests, the frontend build and the
browser tests on every pull request into `development`, and keeps the Playwright report and traces
of a failed browser run as an artifact. On every push to `development` it also
publishes `ghcr.io/jussaw/secret-hitler-online:latest` and `:sha-<short>` for `linux/arm64` and
`linux/amd64`, once those checks pass.
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

- No new art (the header's speaker icons and the spectator count's eye come from the Lucide icon
  pack). Sound clips are CC0 only and listed in `docs/SOUND-CREDITS.md`.
- The WebSocket protocol stays backward compatible for players; spectator support only adds
  fields and a query parameter.
- Deploys go through the host's deploy tooling, never `docker compose up` from a checkout.
- This repo is public. Never write details of the personal infrastructure it runs on into files,
  commit messages, PR or issue text, or code comments: machine and host names, the hardware, other
  repositories (compose stacks, dotfiles), deploy and update tools, LAN addresses, ports, host
  paths, domains and subdomains, or the proxy, tunnel and monitoring setup. Write "the home server"
  or "the host" instead, and keep plans and acceptance notes generic (`https://<subdomain>/ping`).
