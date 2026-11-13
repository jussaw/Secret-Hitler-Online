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
  written by earlier releases still load (`DatabaseBackupTest`). A player whose connection closes
  keeps their place in `activeUsernames` and their portrait for a 3 s grace window
  (`PLAYER_TIMEOUT_IN_SEC`), counted from that disconnect (in a game the seat itself is kept for
  the whole game). The removal a disconnect schedules is the name's only pending one
  (`pendingRemovals`), a new connection under the name calls it off, and it runs under the lobby's
  lock and does nothing unless it is still the pending one. So a removal never undoes a rejoin
  under way, and one left from an earlier drop never cuts a later window short, even if it fell
  due during a rejoin (`LobbyRejoinTest`, `LobbyGraceWindowTest`). `Lobby.startNewGame` seats only
  players with a live connection: a name still inside the 3 s grace window after a disconnect is
  dropped from `activeUsernames` and `usernameToIcon` (its preferred portrait is kept), so no seat
  is made for someone who cannot take it, and a start that fails leaves the lobby untouched
  (`LobbyStartTest`). A player who rejoins a running game after that window, or after a restore
  from a backup (`activeUsernames` is transient, so a restored lobby has no one in it), goes back
  at the end of `activeUsernames`: the lobby counts them at once, and lists and seats them when
  the game ends. So a host back after the window is host no longer, and after a restore the first
  player back is the host. One back inside the window keeps their place (`LobbyRejoinTest`).
  While a game waits in `POST_LEGISLATIVE` for a human president, `Lobby` runs
  the END TERM countdown (`TermTimer`, `END_TERM_TIMER_IN_SEC`, 10 s): it starts with the first
  game packet that shows END TERM, and at zero it ends the term as END TERM would (one daemon
  thread keeps time for every lobby and hands each end to a pooled thread, so a lobby busy sending
  delays no other). The president's `pause-term-timer` and `resume-term-timer` pause it and
  run it on from the time left; every game packet carries `termTimer` (`remainingMs` and `paused`)
  while there is one. CPU presidents get none, since they end their own terms. It is transient, so
  a lobby restored from a backup starts a fresh countdown with its first packet. An END TERM, pause
  or resume from the president whose term the countdown has just ended is dropped instead of
  refused (`Lobby.isLateForTerm`), so that race never closes their socket (`LobbyTermTimerTest`,
  `TermTimerServerTest`). `SecretHitlerGame` and `CpuPlayer` do not pin a `serialVersionUID`, so a
  new field or non-private method on either would stop older backups loading: game-side state that
  is not part of the rules belongs in `Lobby`. A player's `/game` query may carry `rejoinKey`, a
  random key the page keeps for its lifetime (sent to no client and not backed up). A connection
  that brings the key its name's live connection was opened with takes that connection's place,
  keeping the seat and portrait, and the old one is closed with 4001 (`CLOSE_REPLACED`). So a page
  whose network dropped gets back in at once, although the server sees a dead socket close only at
  its 30 s idle timeout. Without the key (an older client), a live name is refused as before
  (`RejoinServerTest`). `Lobby.joinRefusal` is the one rule for who may join under a name, and
  `Lobby.addUser` enforces it too. `onWebsocketConnect` asks it and adds the connection in one
  step under the lobby's lock, so of two connections arriving at once for one name or for the
  last seat, the second is refused with 1002 and the reason it would get had it arrived later,
  not failed with 1011 by the add (`RejoinServerTest`).
- `frontend/`: React 18 and TypeScript 5, built with Vite and tested with Vitest. The entry is
  `src/main.tsx`, with `index.html` at the `frontend/` root. `src/App.tsx` owns the WebSocket, all
  state, the overlays and the login page; prompts live in `src/custom-alert/`. The game
  page is `src/game/`: `GameScreen` (markup and the three layouts), `PlayerRoster` (a row per player
  in `playerOrder`: portrait, name, office or role, and the vote or busy bubble), `RoundTracker`
  (the four steps of a round, the current one lit, over the status line `#status-bar-text`; its line
  always keeps two lines' height, and `--round-tracker-ems` is the whole card's height in its own
  ems, which the layouts reserve) and `roundStep` (a pure function from the game state and
  `lastState` to the step; `App` queues the step with each status line). `TermTimer` is the END
  TERM countdown: an icon and the seconds left, counted down on the page from each packet's
  `remainingMs`. The page takes the time passed since the packet from `remainingMs`, not the page
  time from a deadline, whose fractions could show a second too many: the first frame shows the
  server's seconds exactly. It is the president's pause and resume button, and shows everyone
  else (spectators too) whether it is paused; the seconds left are its accessible description, so
  its name stays put. `GameScreen` puts it in `.end-term-slot` with END TERM, which flashes
  (an outline, held steady with reduced motion) while the countdown runs. It stands just above END
  TERM on desktop and in tall windows, in the room the table keeps there beside the tracker, and
  at its right on phones, so it moves nothing.
  `RosterRow` (`src/game/`) draws one row and is shared by `PlayerRoster` and `LobbyRoster`.
  `usePlayerRows` (`src/player/`) is the per-player state the roster rows and the prompts' card
  tiles share. Desktops get the roster as a column at the left, the tracker over the boards, and
  END TERM, the counts box, the draw pile and the discard pile in a column beside them, on one
  screen (`.game-table` is a size container, and the boards' width comes from its container units). Phones, windows narrower
  than 5:4 and windows under 500px tall get one column from the phone-only query in
  `GameScreen.css` and `PlayerRoster.css`, which is the stacked query
  `(max-width: 768px), (aspect-ratio < 5/4), (max-height: 500px)` less tall windows (written out in
  those files): compact rows about 26px tall in two columns (`PRES` or `CHAN` after the name), the
  tracker, a decks row with END TERM over the counts box, and the boards at full width. With ten
  players and the longest status it fits 360x740 and 412x915 without scrolling; a phone held
  sideways scrolls. The phone layout holds down to 320px wide, where the page may scroll: the login
  page, the lobby, every prompt and the game are tested at 320x568 (narrower phones are out of
  scope); with Linux-drawn fonts the longest status still takes a third line at a few untested
  widths (see `docs/PLAN.md`, Phase 9). `SoundControl.css` (44px header targets) and
  `RoundTracker.css` (the smaller step line) keep the stacked query itself, so tall windows get
  those too, on purpose. Among the stacked windows, those at least 700px wide and narrower than 5:4
  (half-screen desktop windows, upright monitors, tablets held upright) fit one screen instead, with
  the roster across the top in two columns (three in near-square windows) and the counts box
  between the draw and discard piles (`order` moves it there), from a later block,
  `(min-width: 700px) and (aspect-ratio < 5/4)`, in `GameScreen.css` alone (`PlayerRoster.css` has
  no tall block). That block holds only what differs from desktop, and no longer undoes the phone
  block, which never reaches those windows. On desktop and in tall windows a twelve-character name
  fits whole, and only a name too wide for its row ends in an ellipsis, with the full name in the
  row's title on hover; the phones' compact rows end any name that does not fit in an ellipsis.
  The lobby is `src/lobby/`, built like the game page and on the same three layouts: `LobbyScreen`
  (markup and `LobbyScreen.css`: the header, the roster column, then a code card with the invite
  link and COPY, a status card kept two lines tall, the buttons by viewer, and a footer with the
  About and Report a bug links), `LobbyRoster` (a `RosterRow` per player, `Picking a look…` for a
  player on the default portrait, HOST on the host's row), `lobbyStatus` (a pure function from the
  usernames, portraits and viewer to the status line; it names who START GAME waits for and says
  when bots fill the table), `joinError` (`joinErrorMessage`, `CONTACT_ERROR`, `CONNECT_ERROR`: the
  `/check-login` messages JOIN and PLAY INSTEAD share), `normalizeName` (runs of whitespace made one
  space, then trimmed: JOIN, CREATE LOBBY and PLAY INSTEAD send every name through it, and each
  field takes at most `MAX_NAME_LENGTH` characters) and `copyText` (the Clipboard API, with a
  select-and-copy fallback).
  `GameScreen.css` lists the lobby's selectors beside the game's for the page, header and roster
  column, so the roster cannot drift between the lobby and the game; `LobbyScreen.css` holds only
  what the lobby has, with its own phone-only and tall-window blocks written out as in the game's
  files. With ten players and the longest status it fits one screen at the same sizes the game
  does. The buttons: the host gets START GAME (off until every player has picked a look), a player
  gets CHANGE LOOK and WATCH INSTEAD, a spectator gets PLAY INSTEAD (off, with a note, when the
  lobby is full), and everyone gets LEAVE LOBBY. The switch between playing and watching is offered
  in the lobby only, and works by reconnecting: WATCH INSTEAD reopens the socket as a spectator and
  sets the `spectator` cookie (the `name` cookie stays); PLAY INSTEAD opens `PlayInsteadPrompt`
  (`src/custom-alert/`) for a name, checks it with `/check-login`, reopens the socket as a player
  and saves the cookies as JOIN does, and the portrait picker opens unless the server restores the
  name's remembered portrait. If the server closes that player socket before its first message
  (the seat went between the check and the join), `seatPending` sends the person back to watching
  with a snackbar. In `App`, `openSeat`, `openWatch` and `closeSocket` do this, and
  `tryOpenWebSocket` builds the new socket before it closes the old one, keeping the lobby's players
  on screen when it reopens to the same lobby. `alertShowCount`, `pickerShownAt` and
  `playInsteadSession` keep a late reply from touching the wrong prompt: the picker updates only
  while it is the alert on screen. `animationStep` names the running queue step, and every queue
  timer (`finishStepAfter`, for the event bar, the board, the vote tally and a held status line,
  and the fade in `hideAlertAndFinish`) finishes only the step it belongs to, so a timer left from
  a cleared queue never cuts short the next one's step. A prompt's server-OK listener
  (`addServerOKListener`) is tied to its step the same way: an OK goes to the first listener whose
  step is still the current one, and `clearAnimationQueue` drops them all. A lost socket is reopened
  at once, then after each wait in `RECONNECT_DELAYS` (1, 2, 4, 8 and 15 s). The page gives up with
  "Disconnected from the lobby." when the last attempt fails, or at once when the server refuses a
  socket outright (1002 before its first message: the lobby is gone, full, or playing without this
  name). The server must answer a new socket or a ping within `REPLY_TIMEOUT` (10 s), or
  `onNoReply` drops the socket as dead, and a page coming back into view pings at once. While
  `reconnecting`, a press in a game waits in `pendingCommands` until the server takes a new socket
  (its first message), and a press in the lobby with no socket shows the retrying snackbar instead.
  Every close is logged with the time, its code and reason and the page's visibility, without the
  URL's key.
  Prompts are a fixed overlay whose box scrolls (`CustomAlert.css`), except the portrait picker
  (`IconSelection`): its box is a column with CONFIRM pinned at the foot, and only the grid of
  portraits scrolls (`IconSelection.css`, keyed on `ButtonPrompt`'s `className`). `CustomAlert`
  fades the overlay in and out with CSS classes, and once a closed prompt's fade-out has had its
  `ALERT_FADE_OUT_MS` (1 s, which `hideAlertAndFinish` also waits) it sets `hidden` on `#alert`
  (`display: none`). So a closed prompt is never drawn and never takes a press, however the browser
  left its animations (Firefox could leave the empty box up until a reload, issue #27), and an
  overlay that was never shown starts hidden, with no fade-out when a page opens. While it fades
  out, `#alert` and everything in it take no pointer events, so a press goes through to the page
  (issue #29). Every button but the header's speaker shares `App.css`'s look: `::before` draws the
  face and, below it, the shadow (`--button-depth`, 5px), both inside the button's box, so a press
  anywhere on what is drawn reaches the button. A press moves the face and the label down onto the
  shadow by moving the box's transparent border (`--button-border`, 2px) from its foot to its top,
  in one step: browsers round each border width down to whole pixels, so widths on their way would
  shrink the box, while the two widths swapped keep it as it is. The box never moves, so a held
  press stays on the button, and buttons are top-aligned, so a press moves no button beside it.
  Variants set `--button-face` and `--button-shadow` (the lobby's grey buttons, the countdown chip,
  whose depth is whole pixels where the browser has `round()`). A bottom margin `--button-depth`
  smaller keeps the shadow out of the layout, as when it was drawn outside the box; END TERM, with
  no margin, gives its shadow the 5px it kept below itself. A 44px minimum is the face's:
  `calc(44px + var(--button-depth))`. END TERM stands above the piles' cards, and its countdown
  flash is drawn round the face. Only the label's colour eases (the face's eases in `::before`); a
  button's size and place follow the layout at once. That goes for the header's speaker too, which
  undoes the look but keeps `App.css`'s `transition`. Firefox styles a page that has just appeared
  with its container units measured against the window, then against their containers, and an
  ease from there slid END TERM, the countdown chip and the speaker into place, out from under a
  press (issue #59).
  Sounds are in `src/sound/`:
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
  longest status; wide twelve-character names fit there and at `SQUARE_DESKTOPS`; at all three
  the decks column keeps its order, the counts box above the draw pile on desktops and between
  the piles in the narrow windows, clear of every pile's cards; every media query
  parses and the phone-only query exists, found by what it matches), `firefox` (the same no-scroll
  tests, since Firefox rounds the layout differently, the header-fit tests of `sounds.spec.ts` and
  `spectator.spec.ts`, `prompt-close.spec.ts` and `button-press.spec.ts`), and
  `phone-360`/`phone-412` (Galaxy S8 and Pixel 7 emulation, `phone.spec.ts`: the game fits without
  scrolling, in order, with 44px targets, for players and a spectator; at 320x568 it keeps the
  phone layout and only scrolls down, for both, and `phone-360` also checks the login page and the
  lobby there; the lobby tests (the host's, a guest's and a spectator's lobby fit without
  scrolling, with 44px targets and 16px field text,
  the roster first, the busy bubble at 320px, and the PLAY INSTEAD prompt with 44px targets, 16px
  field text and twelve characters at most); and a phone held sideways gets the phone layout).
  `no-scroll.spec.ts` also has a lobby test, for the host, a guest and a spectator at
  `DESKTOP_SIZES`, `SQUARE_DESKTOPS` and the `NARROW_WINDOWS`. `lobby-switch.spec.ts` (`desktop`
  and `phone-360`) plays the seat switch in a real lobby: watching instead and playing instead, a
  full lobby, a taken name, the host passing on, reloads, the grace window, and a game started
  right after someone watches instead (both grace-window tests fail when their timing missed the
  window). `tracker.spec.ts` (`desktop`) checks the lit step against the status line.
  `term-timer.spec.ts` (`desktop` and both phone projects) plays the END TERM countdown from a
  scripted socket for the president (pause and resume), another player and a spectator, checks it
  stands beside END TERM at every tested size and on a phone held sideways, clear of the rest of
  the table (with 8 discards, the most a game holds at END TERM without vetoes) and moving
  nothing, checks on phones that it stays on top of the 11 discards vetoes can leave, and
  (`desktop`) lets the server end a real game's term after 10 s.
  The scripted sockets record what the page sends (`received`).
  `prompts.spec.ts` runs in `desktop` and both phone projects (`phone-360` also at 320x568); it
  opens every prompt from a scripted game socket (`e2e/fakeGame.ts`), and checks that the portrait
  picker's label and CONFIRM are in view without scrolling, on a phone held sideways too, while its
  grid scrolls to the last portrait. `prompt-close.spec.ts` runs in every project: after the role
  alert's OKAY, a vote closed by the server's OK, the policy alert (then END TERM, which must take
  the press) and the portrait picker in the lobby, the overlay stops being drawn within the
  fade-out (a screenshot with it against one without), stays gone, and lets presses through to the
  page; END TERM also takes a press (a tap on phones) 300 ms after the policy alert's OKAY, while
  the alert fades out. `button-press.spec.ts` (`desktop` and `firefox`; a phone's touch adjustment
  never missed) holds mouse presses for 150 ms on END TERM and on the veto prompt's REJECT, 1px
  and 3px below the top edge and 2px into the shadow and at its foot (the shadow found by its
  colour in a screenshot), and checks that each click reaches the button and that, in no frame of
  a held press, REJECT's box or ACCEPT's beside it moves. It measures a button once the page's
  images have loaded, and checks that no button eases its size or place (a transition on anything
  but a colour) as the game page appears (END TERM, the president's countdown chip and the
  header's speaker did in Firefox). `sounds.spec.ts` runs in every
  project: no sound and no `AudioContext` before the first trusted gesture, each sound in step with
  its animation, and the header control's fit, touch targets, keyboard use and saved settings.
  `spectator.spec.ts` plays a scripted game to a spectator (no prompt before the victory screen, the
  status lines, the sounds), plays a real game whose spectator frames it scans for secrets
  (`e2e/driveGame.ts` seats raw-socket players; `e2e/secrets.ts` mirrors the backend's list), and
  checks the count fits every header. `startGame` (`e2e/lobby.ts`) joins one raw spectator by
  default, and the no-scroll and phone tests also measure a spectator's view. `settle`
  (`e2e/lobby.ts`) fails when the web fonts do not load; they come from Google Fonts through
  `src/fonts.css`, so the browser tests need network access. The server closes a
  `/game` socket after 30 s with no traffic either way, so the client pings every 20 s
  (`PING_INTERVAL`); `connection.spec.ts` (`desktop`) holds a quiet lobby's socket open for 35 s.
  `reconnect.spec.ts` (`desktop`) cuts a player's connection mid-game through Playwright's
  `routeWebSocket`: with the browser noticing and the server's end left open, with no network for
  2.5 s, and with neither end noticing. Each time, the server replaces the dead socket. The scripted
  sockets of `e2e/fakeGame.ts` answer pings (`answerPings`), and `FakeWatch.down` refuses new
  sockets as `LOBBY_GONE`, so the page gives up at once. Shared helpers are `e2e/lobby.ts`
  (`waitForPlayers`, `joinGuests`, with `pickLooks` false for guests who stay on the default
  portrait, `joinLobby`, `pickPortrait`, `longestLineLobby`, `lobbyStatusCard`, `waitForPrompt`),
  `e2e/layout.ts` (`wrappedLabels`, `smallFieldText`, `MIN_FIELD_TEXT`, and `addPngDecoder` for
  page functions that read screenshots) and `e2e/soundLog.ts`. `App.css` hides
  `overflow-x` on `html` and `body`, so horizontal overflow shows only in `body.scrollWidth`, and
  `body` scrolls vertically by itself (`pageHeight` measures both). The client talks to its own
  origin (`src/constants/serverUrls.ts`; `wss:` on `https:` pages) unless `VITE_SERVER_ADDRESS` is
  set, and the dev server proxies the backend paths to `BACKEND_URL` (default
  `http://localhost:4040`). `VITE_*` variables live in `.env.development` (dev server only:
  `VITE_DEBUG`) and `.env.dev` (`--mode dev`), typed in `src/vite-env.d.ts`.
- `docs/`: `PLAN.md` (phased plan and progress), `superpowers/specs/` (design),
  `superpowers/plans/` (per-phase step-by-step breakdowns), `images/` (the README's screenshots,
  taken from a scripted seven-player game at 1600x900 and at 412x915 on a phone), `pr/` (each pull
  request's before-and-after screenshots, in a folder named for its branch).
- `.claude/skills/`: project skills. `implement-issue` (`/implement-issue N`) takes one GitHub issue
  through the Workflow below to a pull request with green CI, which it merges for an issue labelled
  `bug`, then checks the published image. An issue that needs design gets a pushed spec and plan and
  a prompt for a new session instead.

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
| Frontend production build (type-checks the app and the browser tests, then writes `frontend/dist/`) | `cd frontend && npm run build` |
| Whole app on one port (after the frontend build) | `cd backend && ./gradlew jar && java -jar build/libs/secret-hitler-online.jar` |
| Image (repo root) | `docker build -t secret-hitler-online .` |

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
- A single issue outside a phase gets its own branch and pull request through the `implement-issue`
  skill. Once CI is green it merges the pull request itself for an issue labelled `bug`, and leaves
  any other for the user to merge.
- Name every worktree for the work it holds (`pin-picker-confirm`, not a generated name such as
  `game-state-sync-b7a6ea`), and give its branch the same name. Rename a generated or prefixed
  branch (`claude/…`, `worktree-…`) before the first commit.
- Every pull request shows before-and-after screenshots of what it changes on screen, in a table
  near the top of its description: at least one desktop size and one phone size, the same
  scripted state in both, "before" from `development` and "after" from the branch. Commit the
  images under `docs/pr/<branch>/` on the branch and link them by raw URL pinned to that commit,
  so they still show after the branch is deleted. A pull request that changes nothing on screen
  says so in place of the table.
- At the end of every phase, before its PR is merged, bring the docs up to date with what the
  phase changed. That means `README.md` (what the fork adds, hosting, and the screenshots in
  `docs/images/` when the game screen looks different), `DEVELOPMENT.md`, this file, and anything
  else under `docs/` the phase left stale. Commit them on the phase's branch, so the PR merges
  with its docs.
- Every finding a review raises during a phase (per-task reviews, the whole-branch review, PR
  review), Minor ones included, is fixed on the phase's branch before its PR merges. Nothing is
  deferred to a later phase or left as a note. A finding that needs no change gets a stated reason
  in the review record instead.
- The phase's own PR ticks its "PR merged into `development`" box in `docs/PLAN.md`, in its last
  commit before the merge, so no follow-up PR is opened just for that tick. Boxes the user owns,
  such as a real game on the deployed build, stay unticked for the user.
- In a fork `gh` defaults to `upstream`, so pass `--repo jussaw/Secret-Hitler-Online` on every `gh`
  command. Never push to `upstream` or open pull requests against it.

## Commits

Conventional Commits, always with a scope: `type(scope): summary`, lowercase imperative summary,
no trailing period, at most 72 characters. Scopes in use: `frontend`, `backend`, `docker`, `ci`,
`plan` (`docs/PLAN.md` and its breakdowns), `docs` (other files under `docs/`), `skills`
(`.claude/skills/`), and for top-level documents the file's name (`readme`, `development`,
`claude`).

## Pointers

- `docs/PLAN.md` is the source of truth for progress. Tick a box in the same commit as the work it
  describes.
- Design spec: `docs/superpowers/specs/2026-11-11-self-hosted-fork-design.md`.

## Constraints

- No new art (the header's speaker icons and the spectator count's eye come from the Lucide icon
  pack). Sound clips are CC0 only and listed in `docs/SOUND-CREDITS.md`.
- The WebSocket protocol stays backward compatible for players; spectator support only adds
  fields and a query parameter, and the END TERM countdown only adds `termTimer` and two commands.
- Deploys go through the host's deploy tooling, never `docker compose up` from a checkout.
- This repo is public. Never write details of the personal infrastructure it runs on into files,
  commit messages, PR or issue text, or code comments: machine and host names, the hardware, other
  repositories (compose stacks, dotfiles), deploy and update tools, LAN addresses, ports, host
  paths, domains and subdomains, or the proxy, tunnel and monitoring setup. Write "the home server"
  or "the host" instead, and keep plans and acceptance notes generic (`https://<subdomain>/ping`).
