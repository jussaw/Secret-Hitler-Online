# Lobby redesign: design

Date: 2026-11-13
Status: approved design, pending implementation plan (`docs/PLAN.md`, Phase 11)
Issue: [#23](https://github.com/jussaw/Secret-Hitler-Online/issues/23)

## Why

Phase 8 redesigned the game screen, but the lobby (`renderLobbyPage` in `frontend/src/App.tsx`)
still looks much as it did upstream. The user wants a cleaner lobby that matches the game screen.

On `development` today, with ten players:

- The lobby scrolls. At 1366x768 START GAME and LEAVE LOBBY sit below the fold. On a 360x740 phone
  the page is about 1,030 px tall, and the buttons are under a three-column grid of cards.
- START GAME stays grey until every player has picked a portrait, and nothing says who it is waiting
  for, apart from a small busy bubble on that player's card.
- With fewer than five players the server adds CPU players ("Bot 1", "Bot 2", …) when the game
  starts (`Lobby.startNewGame`), and the lobby never mentions it.
- The cards tag the first player `[Host]`, but the text calls them "the VIP".
- "About this project" and "Report a bug" link to upstream's README and issue tracker.

The user also wants anyone in the lobby to be able to switch between playing and watching, without
going back to the login page.

Issue #9 (every player but the host tagged `[Host]`), which the issue says to fix first, is already
fixed and closed. `App.test.tsx` covers it.

The look was settled with browser mockups that used the real portrait art. Screenshots of the
final mockup are in [`2026-11-13-lobby-redesign/`](2026-11-13-lobby-redesign/):

- `desktop-1366x768-host.jpg`: the host, ten players, one still picking a portrait
- `desktop-1366x768-spectator.jpg`: a spectator, three players, seats free
- `desktop-1366x768-play-instead.jpg`: the spectator after pressing PLAY INSTEAD
- `tall-960x1080-guest.jpg`: a guest in a tall window, everyone ready
- `phone-360x740-host.jpg` and `phone-412x915-guest.jpg`
- `phone-360x740-play-instead.jpg`: the name prompt on a phone

Two parts of the screenshots are not the design. The invite link shows the mockup's dev origin; the
real link uses the page's own origin. Sizes and spacing are close but not exact (see Left to the
builder).

## Goals

1. **One look with the game screen.** The lobby uses the game's header, its roster rows and its card
   style. On desktop the roster sits in the same left column as in the game, so when the game starts
   the roster stays in place. The rows do reorder: the game seats the players in a shuffled order
   (`Collections.shuffle` in `Lobby.startNewGame`), with any bots added.
2. **No scrolling.** With ten players and the longest status line, the lobby does not scroll at any
   size the game's layout tests cover (`DESKTOP_SIZES`, `SQUARE_DESKTOPS`, `NARROW_WINDOWS`, and the
   360x740 and 412x915 phones), for the host, a guest and a spectator. At 320x568 it may scroll
   down, never sideways.
3. **A status line that explains the wait.** It names whoever START GAME is waiting for and says
   when bots will fill the table.
4. **The seat switch.** In the lobby a player can press WATCH INSTEAD to become a spectator, and a
   spectator can press PLAY INSTEAD to take a free seat.
5. **One word for the host.** "Host" everywhere; "VIP" goes.

## Non-goals

- The login page and the portrait picker (`IconSelection`) keep their look. The game screen is
  unchanged.
- No switching during a game. A spectator keeps watching and a player keeps playing until the game
  ends and the lobby returns.
- No WebSocket protocol changes, and no server changes beyond the game-start rule under Design.
- No new lobby features beyond the switch: no kicking or reordering players, no share sheet, no
  ready check, no lobby settings.
- No new art.

## Anti-goals (a failure even if it works)

- A failed switch that strands someone. If PLAY INSTEAD fails (name taken, lobby full, game started),
  the person is still watching. If WATCH INSTEAD cannot open the spectator connection, they land on
  the login page with the lobby code and an error, as a failed watch does now, never on a blank page.
- A switch that leaves the client confused about what it is: a spectator's page offering player
  actions, or a player's page that lost its seat without showing it.
- A player's portrait shown without its cream border (the issue's one "keep").
- Sideways scrolling at any size, or a touch target under 44 px on phones.
- A reload that undoes a switch. After WATCH INSTEAD a reload goes back to watching. After PLAY
  INSTEAD a reload does what any player's reload does today (see The seat switch).

## Constraints

- **From the issue:** keep each player's portrait and its border; fit 360 px wide
  (`e2e/phone.spec.ts`); keep the spectator count and the sound control in the header; keep the
  lobby read-only for spectators (no START GAME, no CHANGE LOOK); before and after screenshots,
  desktop and phone, in the pull request.
- **No new art.** Icons come from Lucide (`lucide-react`, already a dependency): `Eye` for WATCH
  INSTEAD, `UserPlus` for PLAY INSTEAD, `Copy` for COPY.
- **The switch is client-only.** It closes one WebSocket and opens the other kind; the server sees
  an ordinary leave and an ordinary join or watch. The one server change is the game-start rule
  (see Game start seats only connected players), and the protocol is unchanged.
- **Breakpoints.** The lobby uses the game's three layouts and the same media queries (the
  phone-only query and the tall-window block in `GameScreen.css`, as `CLAUDE.md` describes them).
- **Phones:** buttons and text fields at least 44 px tall (`MIN_TARGET`), text fields at 16 px or
  more so iOS Safari does not zoom.
- `CLAUDE.md` describes the lobby's files, layouts and the switch, updated in the same branch.
  `docs/PLAN.md` gets Phase 11.
- The repository is public. Nothing about the hosting setup goes into code, docs or commits.

## Approaches

**Layout**

1. **The game's split (picked).** Desktop: roster column on the left with the game's rows; code,
   link, status and buttons on the right. Tall windows and phones follow the game's own layouts.
   The lobby leads straight into the game screen, and it reuses the roster's styles.
2. **One centred column.** Code and link, players in two columns, then status and buttons. Calmer,
   but less like the game, and the roster moves when the game starts.
3. **Player cards on a table.** Today's full cream cards in a 5x2 grid. Closest to today, but on a
   360 px phone the names shrink to about 7.5 px and the page scrolls.

The user picked 1.

**When the switch is offered**

1. **Lobby only (picked).** Before a game and in the lobby after one.
2. **Also mid-game,** with a CPU player taking over the seat of a player who steps out. That needs
   changes to the game and the CPU players on the server, a much bigger change.

**How the switch works**

1. **Reconnect in the browser (picked).** The client closes its socket and opens the other kind. No
   server or protocol change. A player who switches to watching stays in everyone's list for about
   3 s, the server's seat grace window (`Lobby.PLAYER_TIMEOUT_IN_SEC`), exactly as LEAVE LOBBY does
   today.
2. **A server command** that moves the same connection between a seat and the spectators. Instant
   and with no leftover row, but it adds commands to the protocol, plus backend code and tests.

**How a spectator asks to play**

1. **A PLAY INSTEAD button, then a name prompt (picked).** The button sits where WATCH INSTEAD sits
   for players, so the two switches mirror each other, and the spectator's lobby looks like the
   players'.
2. **A name field on the lobby page.** One tap fewer, but the field is always on screen.

## Design

### Layouts

**Desktop** (5:4 or wider, and wider than 768 px). The page is the header and, below it, two
columns:

- **Roster**, on the left: the game's roster column (`clamp(300px, 25vw, 480px)` wide, on the
  darker band), headed `PLAYERS` and `n / 10` (Germania One, `#b9ab9f`), with one row per player in
  join order. Ten rows share the column's height; fewer rows stop growing at a cap and sit at the
  top, as in the game.
- **Main**, on the right: a stack centred both ways: the code card, the status card, the buttons,
  then the footer links.

**Tall windows** (narrower than 5:4 and at least 700 px wide). The roster runs across the top in two
columns of full rows, as in the game's tall layout. Under it: the code card (the code beside the
link), the status card, the buttons and the footer. Content is aligned to the top.

**Phones** (everything else). One column, from top to bottom: the header; the roster in the game's
compact rows, two columns; the code card (`LOBBY CODE` and the code on one line, then the link and
COPY); the status card; the buttons; the footer. The roster comes first, as on the game's phone
layout, so it stays put when the game starts.

### Header

The game's slim header (`.game-screen > header`): `SECRET-HITLER` in the middle, the spectator count
on the left, the sound control on the right.

### Roster rows

The rows look exactly like the game's (`PlayerRoster.css`): the square portrait crop in its cream
frame, the name in Montserrat bold, the line under it, and the slot on the right.

- **The line under the name** (full rows): `HOST` in Germania One and orange (`#f08a5d`) for the
  first player; `Picking a look…` (Montserrat, `#bbbbbb`) for a player still on the default
  portrait; otherwise empty, with its height kept.
- **Compact rows** (phones): `HOST` follows the name as a tag, as `PRES` and `CHAN` do in the game.
- **Right slot:** the busy bubble (`player-icon-busy.png`) while that player is picking. It must
  stay visible in the compact rows at 320 px (the mockup lost it there).
- **Your own row** has the gold ring and tint. A spectator sees no highlighted row.
- The row's `title` holds the full name, and a name too wide for its row ends in an ellipsis, as in
  the game.

### Code card

A card in the tracker's dark brown (`--backgroundDark`) with the drop shadow:

- `LOBBY CODE` (Germania One, `#b9ab9f`) and the code itself, large (about 96 px at 1366x768, 46 px
  on phones).
- `Share this link to invite players`, then the link in a read-only field (the page's origin plus
  `/?lobby=CODE`, ending in an ellipsis when it is too long) and COPY with Lucide's copy icon.
- COPY writes with `navigator.clipboard.writeText` and falls back to today's select-and-copy where
  the Clipboard API is missing (plain `http:` pages other than localhost). The "Copied!" snackbar
  stays.

### Status card

The round tracker's card: dark brown, white Montserrat bold, player names in orange (`#f08a5d`),
always two lines tall so nothing below it moves. M is the number of bots, `5 − players`, when there
are fewer than five players.

| Viewer | Lobby | Line |
|---|---|---|
| Anyone | One player picking | `Waiting for NAME to pick a look.` |
| Anyone | More picking | `Waiting for NAME and N others to pick a look.` |
| Host | Ready, five or more | `Everyone is ready. Start when you like.` |
| Host | Ready, fewer than five | `N players. M bots will join to make 5.` (`1 player.` for one) |
| Guest | Ready, five or more | `Waiting for HOST to start the game.` |
| Guest | Ready, fewer than five | `Waiting for HOST to start. M bots will join.` |
| Spectator | Any | `You are watching. ` followed by the guest's line for that state |

The lines are short so that the longest, a spectator's with a twelve-character name (`You are
watching. Waiting for Long Guest 1 and 8 others to pick a look.`, 71 characters), fits two lines on
a 360 px phone and anything wider. At 320x568, where the lobby may
scroll, a third line is allowed. This wording is the designer's call; the mockup's spectator line
differs and the table wins.

NAME is the first picking player in join order, or `you` when that is the viewer, and HOST the
first player's name. Singular and plural follow the numbers ("1 other", "1 bot").

### Buttons

| Viewer | Buttons |
|---|---|
| Host | START GAME, then CHANGE LOOK, WATCH INSTEAD, LEAVE LOBBY |
| Guest | CHANGE LOOK, WATCH INSTEAD, LEAVE LOBBY |
| Spectator | PLAY INSTEAD, LEAVE LOBBY |

- START GAME is the large orange button. It is enabled when every player has a portrait, as now.
  Guests no longer see it (today they see it greyed out, with "Only the VIP can start the game").
- The other buttons are a neutral grey variant (`#6e655e` with a `#4b4440` shadow) of the app's
  button.
- CHANGE ICON is renamed CHANGE LOOK, to match the picker's title (`PLAYER LOOK`). It opens the
  picker as now.
- PLAY INSTEAD is greyed out when the lobby is full, with `The lobby is full (10 / 10). You can play
  when a seat frees up.` under the buttons.
- On desktop and in tall windows WATCH INSTEAD carries Lucide's eye and PLAY INSTEAD its user-plus.
  Phones drop the icons so the three buttons fit one row at 320 px.

### Footer

`About this project` links to this fork's README (which credits upstream and the game's creators),
and `Report a bug` to this fork's issues. This is the designer's call: bugs in this deployment
belong here, not upstream.

### The seat switch

Offered on the lobby page only. The game screen has neither button.

**WATCH INSTEAD** (a player):

1. No confirmation.
2. The client opens a spectator connection for the same lobby
   (`/game?lobby=CODE&spectator=true`) in place of its player connection, and sets the `spectator`
   cookie. The `name` cookie stays, to fill in PLAY INSTEAD later.
3. Closing the player connection must not run today's "left the lobby" path in `onWebSocketClose`,
   which sends the user to the login page.
4. The server keeps the seat about 3 s, then drops it. Everyone sees the row go and the spectator
   count rise. If the host switched, the next player in join order becomes host.
5. If the spectator connection cannot open, the person lands on the login page with the lobby code
   filled in and an error.

**PLAY INSTEAD** (a spectator):

1. Opens a prompt in the game's prompt style (`CustomAlert`, `--alertFill`): the label `PLAY
   INSTEAD`, `Choose the name you will play under. You pick a look next.`, a name field (twelve
   characters at most, like the login form, and 16 px or larger on phones) filled in from the
   `name` cookie, and CANCEL and CONTINUE.
2. CONTINUE checks the name with `/check-login`, the same check and the same error messages as the
   login form's JOIN (name taken, lobby full, lobby in a game, lobby not found). An error shows in
   the prompt, and the person is still watching.
3. On success the client opens a player connection with that name in place of the spectator one,
   removes the `spectator` cookie and saves the `name` and `lobby` cookies, as JOIN does. The
   portrait picker then opens, as on any join.
4. Someone who comes back under the same name within the 3 s grace window takes back their old seat,
   including the host's (`Lobby.canRejoin`). The server also remembers their portrait.
5. If the host starts the game while the prompt is open, the prompt closes and the person watches
   the game.

Reloads keep today's behaviour, and the cookies each switch sets make them land on the right side.
A spectator who reloads goes straight back to watching (the `spectator` cookie). A player who
reloads lands on the login page with their name and lobby filled in, and keeps their seat if they
press JOIN within the grace window. Rejoining a player automatically on reload is not part of this
work (designer's call: the user did not ask for it, and it would change every player's reload,
mid-game included).

### Game start seats only connected players

Found while checking the design. `Lobby.startNewGame` takes its seats from `activeUsernames`, which
still holds a player inside the 3 s grace window after their connection closes, but records who may
rejoin the game (`usersInGame`) from the live connections only. So a host who starts the game within
3 s of someone pressing WATCH INSTEAD (or LEAVE LOBBY, or reloading) seats a player who can never
take the seat (`canAddUserDuringGame` refuses them), and the game stalls at that seat's first turn.
The bug is older than this work, but the switch makes the timing likely. The user chose to fix it
here:

- `startNewGame` seats only the players with a live connection. A name still in its grace window is
  dropped from `activeUsernames` and from `usernameToIcon` at once, as `RemoveUserTask` would have
  done; its preferred portrait (`usernameToPreferredIcon`) is kept.
- The portrait check before the start covers only the seated players.
- Bots fill up to five from the seated players, as now.
- Someone whose connection was still in the grace window when the game started finds the lobby in a
  game when they come back, and can watch it, like anyone else who arrives late.
- Backend tests in `backend/src/test/java/server/util/`: a player who disconnected inside the grace
  window is not seated, is gone from the lobby's list, and the game still starts with bots up to
  five; a connected player is seated as before.

### Code changes

- **Backend:** the game-start rule above in `Lobby.startNewGame`, with its tests.
- **New `src/lobby/`:** the lobby page component with its CSS (replacing `Lobby.css`), a pure
  function from the lobby's state and the viewer to the status line, and unit tests for both.
- **Roster rows:** the lobby's rows and the game's share one look. Whether that is a shared row
  component, or a lobby roster reusing `PlayerRoster.css`, is the builder's call.
- **New prompt** in `src/custom-alert/` for PLAY INSTEAD.
- **`App.tsx`:** `renderLobbyPage` and `renderPlayerList` move out; the switch handlers sit beside
  `watch` and `onClickJoin` and reuse `tryLogin`, `tryWatchLogin` and `tryOpenWebSocket`. The lobby
  no longer renders `Player` (prompts still do).
- **Tests and helpers that name today's lobby:** `Players (n/10)` (in `e2e/lobby.ts`,
  `fakeGame.ts`, `sounds.spec.ts`, `spectator.spec.ts`, `tracker.spec.ts`, `phone.spec.ts`),
  `#linkText`, `CHANGE ICON`, `You are watching. The game starts when the VIP starts it.`, and the
  `[Host]` unit test in `App.test.tsx`.
- **Docs:** `CLAUDE.md` (the lobby's files, layouts, the switch, and the game-start rule in the
  backend's description) and `docs/PLAN.md` (Phase 11).

### Tests

- **Unit:** the status line for every row of its table; the lobby page for the host, a guest and a
  spectator (which buttons, the highlighted row, `HOST`, `Picking a look…`, PLAY INSTEAD off when
  full); the PLAY INSTEAD prompt (filled-in name, the length limit, the errors); COPY with and
  without the Clipboard API.
- **Browser, layout:** the lobby with ten players and the longest status line has no scroll at
  every `DESKTOP_SIZES`, `SQUARE_DESKTOPS` and `NARROW_WINDOWS` size (`desktop` and `firefox`
  projects) and on both phones, for the host, a guest and a spectator; 44 px targets on phones; at
  320x568 only vertical scroll; the roster is in the left column on desktop and first on phones.
- **Browser, switch** (`desktop`, and one phone project): a player presses WATCH INSTEAD and is
  watching, and the others see the row go; the spectator presses PLAY INSTEAD, takes a seat and
  gets the picker; a full lobby greys out PLAY INSTEAD; a taken name shows its error and leaves the
  person watching; the host switching passes the host to the next player; a reload after WATCH
  INSTEAD goes back to watching, and a reload after PLAY INSTEAD lands on the login page with the
  name and lobby filled in.
- **Backend:** the game-start rule (see its section).
- **Unchanged:** the game's browser tests, `prompts.spec.ts`, `sounds.spec.ts` and the
  secret-scanning part of `spectator.spec.ts` still pass.

## Acceptance

- Backend and frontend unit tests, the frontend build, and the browser tests in all four Playwright
  projects pass.
- The no-scroll goal holds at every size listed under Goals.
- The pull request shows the lobby before and after, on desktop and on a phone, and closes #23.
- The user plays one real lobby on the deployed build, on a desktop and on a phone: switches each
  way, sees the status line name the player still picking, and starts a game.

## Left to the builder

These are free as long as Acceptance holds and the look matches the mockups:

- Exact sizes, spacing and how text scales with the window (the game's roster rules are a good
  model).
- Three roster columns instead of two in near-square tall windows, if two do not fit.
- Component, function and file names, and whether the roster row is shared as a component or as
  CSS.
- How the client sequences closing one socket and opening the other.
- The longest status line used by the layout tests.
- Whether the link field keeps the `linkText` id that the browser-test helpers read.
