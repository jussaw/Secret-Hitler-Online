# Self-hosted fork: design

Date: 2026-11-11
Status: approved design, pending implementation plan (`docs/PLAN.md`)

## Goal

Run a personal, self-hosted copy of this project on a Raspberry Pi 4, with three
additions over upstream:

1. A game screen that shows all players and both boards without scrolling on a
   standard 1080p desktop display.
2. Sound effects for game events.
3. Spectators.

Plus a phone layout, a modernized frontend toolchain, and SQLite persistence in
place of Postgres.

This is a fork of `ShrimpCryptid/Secret-Hitler-Online` (`upstream` remote). It
stays under CC BY-NC-SA 4.0: non-commercial, share-alike, with credit to
upstream and to the board game's creators kept in the README.

## Starting point (verified in the fork, `development` branch)

- Backend: Java, Gradle, Javalin 5.6.1. HTTP endpoints `/check-login`,
  `/new-lobby`, `/ping`; one WebSocket at `/game`. Rules live in
  `backend/src/main/java/game/`, with JUnit tests and CPU players.
- Lobby backup: one Postgres table `backup(id, timestamp, attempts,
  lobby_bytes BYTEA)` holding a single Java-serialized blob of all lobbies. The
  server runs without a database (it logs an error and continues).
- Frontend: React 16, Create React App (`react-scripts` 5), TypeScript 3.9.
  `frontend/src/App.tsx` is a 1,829-line class component that owns the
  WebSocket, all state, and renders login, lobby and game pages.
- Reconnect already exists: name and lobby code are stored in cookies and the
  client retries the WebSocket on close.
- Not present: any audio, any spectator concept, any `@media` rules.
- Game page render order is header, player strip, status bar, decks row, board.
  Stacked vertically, which is what forces scrolling.

## Decisions

| Topic | Decision |
|---|---|
| Base | Fork of upstream, work on `development`, one branch per phase merged by PR |
| Frontend tooling | Migrate CRA to Vite, React 16 to 18, TypeScript to 5, Jest to Vitest, before feature work |
| Desktop layout | Round table: players on an ellipse around the boards |
| Phone layout | Stacked layout below a width breakpoint; scrolling allowed there |
| Sounds | Event sound effects from CC0 files; volume and mute per browser; no music |
| Spectators | Public information only; roles revealed to them at game end like everyone else |
| Persistence | SQLite file on a mounted volume, replacing Postgres |
| Packaging | One image; the Java server serves the built frontend; same origin |
| Hosting | Pi 4, `pi4/sites` stack in `portainer-compose`, GHCR image, public subdomain through the existing reverse proxy |
| Cleanup | Remove Google Analytics, Twitter embed, Firebase and Fly.io workflows, stale fork branches |
| Tracking | `docs/PLAN.md` with a checklist per phase, ticked in the same commits as the work |

## Phase design

Phases run in this order. Each leaves `development` working and deployable.

### 1. Housekeeping

- Remove `react-ga` and its calls, the Twitter embed/icon and
  `react-twitter-embed`, the Firebase and Fly.io workflows, `fly.toml`, and
  `backend/DEPLOYMENT.md`.
- Delete every branch on the fork except `main` and `development`.
- Confirm the app runs locally (`./gradlew runLocal`, frontend dev server) and
  `./gradlew test` passes; record the baseline.
- README: fork notice, licence and attribution, how to run.
- Add a repo `CLAUDE.md` and `docs/PLAN.md`.

### 2. Frontend modernization

No behaviour changes. Done when the app plays a full game identically.

- Replace `react-scripts` with Vite; move `public/index.html` to the Vite
  entry; rename `REACT_APP_*` variables to `VITE_*` and their `.env.*` files.
- React 18 (`createRoot`) and TypeScript 5.
- Remove packages that are installed but never imported: `react-router`,
  `react-router-dom`, `react-router-config`, `react-alice-carousel`,
  `query-string` if unused after the audit.
- `react-textfit` (player name sizing in `Player.js`) is replaced with CSS
  `clamp()` sizing; `react-helmet` (`util/HelmetMetaData.js`) is replaced with
  static tags in `index.html`.
- Jest to Vitest with Testing Library; remove the CRA service worker.

### 3. Persistence, packaging, first deploy

- Backend: swap the Postgres JDBC driver for `sqlite-jdbc`; `lobby_bytes`
  becomes `BLOB`; the database path comes from an env var (`DATABASE_PATH`,
  default unset meaning no persistence). Keep the existing
  serialize-everything backup behaviour.
- Backend serves the frontend build as static files, so the client uses
  same-origin relative URLs and derives `ws`/`wss` from the page protocol. The
  dev setup keeps working through a Vite proxy to `localhost:4040`.
- Multi-stage `Dockerfile` at the repo root: Node stage builds the frontend,
  Gradle stage builds the jar with the frontend bundled, JRE stage runs it.
- GitHub Actions: on push to `development`, run backend and frontend tests,
  then build and push `ghcr.io/jussaw/secret-hitler-online:latest` for
  `linux/arm64` and `linux/amd64`.
- Replace the dev `docker-compose.yml` Postgres service with the SQLite setup.
- `portainer-compose`: add the service to `pi4/sites/docker-compose.yml`
  following its conventions (container name, published port, `sites` network,
  `restart: unless-stopped`) plus a bind mount for the SQLite file. Deploy
  through jussaw-server, not from a checkout.
- Reverse proxy: new subdomain with WebSocket upgrade enabled and TLS.

### 4. Round-table game screen

- Extract from `App.tsx`: `GameScreen` (layout only, props in), with
  `TableSeats`, the existing `Board`, `Deck`, `StatusBar` composed inside.
  `App.tsx` keeps the WebSocket and state; it stops containing game markup.
- Seat geometry is a pure function `seatPositions(count, selfIndex)` returning
  percentage coordinates on an ellipse, with the local player at bottom
  centre. Unit tested for 5 to 10 players.
- The table fills the viewport below the header using CSS grid and
  `vh`/`vw`/`clamp()` sizing; boards and decks sit in the centre, status text
  and the END TERM button below them. The header shrinks.
- Existing overlays (`CustomAlert` prompts, `EventBar`, snackbar) keep working
  on top of the new layout.
- Acceptance: with 5, 7 and 10 players, the document does not scroll
  (`scrollHeight <= innerHeight`) at 1920x1080, 1920x937 (browser chrome),
  1600x900, 1366x768 and 1280x720. Checked by a Playwright test.

### 5. Phone layout

- Below 768px width, `GameScreen` switches to a stacked layout: compact player
  grid, status, boards scaled to width, decks. Scrolling allowed.
- Login, lobby and alert prompts get breakpoints so nothing overflows
  horizontally at 360px width.
- Acceptance: no horizontal scroll at 360x740 and 412x915 on login, lobby,
  game and each prompt.

### 6. Sounds

- `sound/SoundManager`: preloads clips, `play(name)`, master volume, mute.
  Settings persist in `localStorage`. Audio is unlocked on the first user
  gesture; before that, `play` is a silent no-op.
- `sound/soundEvents`: a pure function from (previous game state, next game
  state, local player name) to a list of sound names. This sits beside the
  existing state-change handling that triggers animations, and is unit tested.
- Events: your turn / input needed, player joined lobby, game start and role
  reveal, nomination, vote cast, votes revealed (passed / failed), election
  tracker advance, card draw, card discard, policy enacted (one per party),
  presidential power used, investigation, execution, veto, victory, defeat.
- Clips are CC0 only, stored in `frontend/src/assets/sounds/`, listed with
  source and licence in `docs/SOUND-CREDITS.md`. Short, normalized, OGG with
  MP3 fallback.
- UI: a speaker button with a volume slider in the header on every page.

### 7. Spectators

- Server: `Lobby` gains a spectator connection set separate from players.
  The WebSocket handshake accepts a `spectator` flag with a lobby code and no
  seat. Spectators may join before or during a game and do not count toward
  the player limit.
- Spectators receive the same state packet with all per-player secret fields
  removed (roles, party membership, hands, peek and investigation results)
  until the game is over. This filtering happens server-side in
  `GameToJSONConverter`, with tests asserting no secret field is present.
- Every game command from a spectator connection is rejected.
- State packets include a spectator count.
- Client: a "Watch" option on the join form, a read-only `GameScreen` with no
  prompts, and a spectator count indicator. Spectators hear sounds.
- Lobby inactivity cleanup treats a lobby with only spectators as inactive.

## Error handling

- SQLite unavailable or unwritable: log and continue without persistence, as
  the Postgres path does today.
- Sound file fails to load: that clip is skipped; the game is unaffected.
- Spectator joins an unknown lobby: same error path as a player join.
- WebSocket drop: unchanged existing reconnect; spectators reconnect the same
  way with their flag.

## Testing

- Backend: existing JUnit suite stays green; new tests for SQLite save/load
  round trip, spectator state filtering, and spectator command rejection.
- Frontend unit (Vitest): `seatPositions`, `soundEvents`, `SoundManager`
  settings persistence.
- Browser (Playwright): no-scroll assertions at the desktop sizes above,
  no-horizontal-scroll at phone sizes, and a smoke test that plays a
  5-player game with CPU players to completion.
- Deploy check: image runs on the Pi, `/ping` answers through the proxy, a
  WebSocket game works over `wss`, and a game survives a container restart.

## Out of scope

Accounts, stats, chat, background music, new art, rule variants, localization,
and contributing changes back upstream.
