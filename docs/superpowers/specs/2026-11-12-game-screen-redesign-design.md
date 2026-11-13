# Game screen redesign: design

Date: 2026-11-12
Status: approved design, pending implementation plan (`docs/PLAN.md`, Phase 8)

## Why

The round table (Phase 4) seats the players on an ellipse and fits the boards inside it, so the
boards stay small: 483 px wide at 1920x1080 and 339 px at 1366x768. Putting every player in one
panel at the side lets the boards take the rest of the window. They come out more than twice as wide
on desktop.

The status bar, a black slab with white text, looks out of place next to the game's art. The user
wants it redesigned. Its replacement, the round tracker, also shows where the current round is.

On phones the game page scrolls today. The user wants a phone to show the whole game without
scrolling where possible.

The banner at the top reads `SECRET-HITLER.ONLINE`; the user wants `SECRET-HITLER`.

The look was settled with browser mockups that used the real board, card and portrait art. This
document records what they showed. Screenshots of the final mockups are in
[`2026-11-12-game-screen-redesign/`](2026-11-12-game-screen-redesign/):

- `desktop-1920x1080.jpg` and `desktop-1366x768.jpg`
- `half-screen-960x1080.jpg` and `tablet-820x1180.jpg`
- `phone-360x740.jpg` and `phone-412x915.jpg`, showing the longest status line

Three parts of the screenshots are not the design:

- The phone shots show END TERM shorter than the 44 px it needs.
- The dashed yellow line on the phone shots is only an annotation. It marks roughly where a real
  browser's bars cut the page off.
- The vote pills and the "busy" bubble appear only where the state calls for them.

The colours used in the mockups are listed under Colours.

## Goals

1. **Desktop:** the players sit in a roster column on the left and the boards fill the rest of
   the window.
2. **Board size:** each board is at least as wide as today at every desktop size and every tall
   window size the layout tests cover (the table under Acceptance).
3. **Status:** the black status bar becomes the round tracker.
4. **END TERM:** it sits above the draw pile on desktop and in tall windows, and above the
   counts box on phones.
5. **Phones:** a compact name list replaces today's tile grid. With ten players and the longest
   status, the page does not scroll in the 360x740 and 412x915 test viewports.
6. **Banner:** the login, lobby and game headers read `SECRET-HITLER`.

## Non-goals

- Prompts and overlays (`src/custom-alert/`, `EventBar`) are unchanged. Prompts keep today's
  card tiles.
- The login and lobby pages change only the banner text. The page title and meta tags in
  `index.html` keep "Secret Hitler Online".
- There is no setting to put the roster on the right. Left is fixed.
- Phones held sideways get no layout of their own. Windows under 500 px tall get the phone
  layout, which may scroll there. The no-scroll goal covers phones held upright.
- No server or WebSocket protocol changes.
- No new art.

## Anti-goals (a failure even if it works)

- A board narrower than today at any tested size.
- A status line cut off or truncated, or a status line and lit tracker step that disagree.
- The table showing less than the seats do now. Each player's office, "busy" bubble, staged vote
  reveal, visible role and executed state must all still be shown.
- A roster row or the tracker changing height when a label or line appears, so that the boards
  move.
- Anything secret reaching a spectator. Filtering stays on the server, as now, and spectators see
  the same roster with no highlighted row.

## Constraints

- No new art. The roster portraits reuse `player-base.png` and the portrait SVGs, and votes, roles
  and the busy bubble reuse the existing icons. Fonts stay Germania One and Montserrat.
- The client only. The protocol stays backward compatible.
- Touch targets on phones are at least 44 px (`MIN_TARGET` in `e2e/layout.ts`), so END TERM is at
  least 44 px tall on phones.
- The page keeps today's breakpoints, plus one for short windows.
  - Phones, windows narrower than 5:4 and windows under 500 px tall use
    `@media (max-width: 768px), (aspect-ratio < 5/4), (max-height: 500px)`. The added
    `max-height` sends phones held sideways to the phone layout. Without it, a sideways
    Pixel 7 (915x412) would get the desktop layout with rows about 37 px tall and unreadable text.
  - Tall windows at least 700 px wide use `(min-width: 700px) and (aspect-ratio < 5/4)`.
  - The tall-window rule may move if near-square windows need it (see Left to the builder).
- `CLAUDE.md` describes the game page's files and layouts, and is updated in the same branch.
- The repository is public. Nothing about the hosting setup goes into code, docs or commits.

## Approaches

1. **Replace the round table in place (picked).**
   - New roster and round-tracker components.
   - The per-player logic in `usePlayerTiles` is pulled out so the roster rows and the prompts'
     card tiles share it.
   - The tracker's step is queued together with each status line.
   - `TableSeats` and `seatPositions` are deleted, the layouts are rewritten in CSS, and the
     layout tests are rewritten.
   - One phase branch and one pull request.
2. **Build the new screen next to the old one behind a switch, then delete the old one after a
   real game.**
   - Safer, because every merge into `development` reaches the home server within a day.
   - Both layouts and both sets of tests would have to be kept alive meanwhile.
3. **Approach 1 split into two pull requests: desktop first, phones second.**
   - Smaller reviews.
   - Phones would show the old stacked layout under the new header and tracker for a while, and
     the phone work depends on the same components anyway.

The user picked 1. The browser tests check every size before a merge, so for a personal fork a
switch costs more than the risk it covers.

## Design

### Layouts

**Desktop** (5:4 or wider, and wider than 768 px). The page is the header and, below it, two columns:

- **Roster**, on the left: `clamp(260px, 20vw, 380px)` wide, on a slightly darker band, one row
  per player.
- **Table area**, on the right: a grid with two columns.
  - The boards' column holds the tracker (row 1), centred horizontally on the boards, and the two
    boards stacked below it (row 2).
  - The decks column sits beside the boards and is vertically centred on them. From top to bottom:
    END TERM, the draw pile, the counts box (`PlayerPolicyStatus`) and the discard pile.
  - Board width is `min(available width minus the decks column and its gap, (available height
    minus the tracker's reserved height and gaps) x 1.2946)`, where 1.2946 is two stacked 1683x650
    boards.

**Tall windows** (narrower than 5:4 and at least 700 px wide: half-screen windows, upright
monitors and tablets). Everything fits on one screen:

- The roster runs across the top in two columns. Turn order reads across each line, then down.
- The tracker sits directly under the roster. Content is aligned to the top, so spare height
  collects at the bottom of the page, never between the roster and the tracker.
- The boards and the decks column sit below the tracker, arranged as on desktop.
- Text and portrait sizes follow the window's width, not its height, so nothing outgrows the
  width.

**Phones** (everything else). One column, from top to bottom:

- The header.
- The compact name list: two columns, five lines for ten players.
- The tracker.
- The decks row: the draw pile, the counts box with END TERM centred above it, and the discard
  pile.
- The two boards at full width.

With ten players and the longest status, the page does not scroll in the 360x740 and 412x915
viewports. A real phone loses roughly 120 px to the browser's address bar and its own status
and navigation bars, so on a 360x740-class phone a short scroll may remain to reach the bottom of
the fascist board. The user chose the always-visible name list knowing this. The alternative was a
portrait strip that needs a tap to show names.

### Roster rows (desktop and tall windows)

From left to right, each row holds:

- **Portrait:** a square crop of the top of the player card. It shows the whole portrait in the
  card's cream frame, the frame equally thick on all four sides. The bottom corners use the
  same curve as the card art's top corners, measured at about `11.4% / 17%` of the crop.
- **Name:** the full name, Montserrat bold. Twelve characters (the login form's limit) must fit
  without truncation. When the user can see this player's role, the role's party icon follows the
  name on the same line.
- **One line under the name:** the first of these that applies.
  1. The office, `PRESIDENT` or `CHANCELLOR`, in Germania One and orange.
  2. `EXECUTED` for an executed player.
  3. A role the user can see, as the role in words in its party colour (as in the mockups, for
     example "Liberal" under the user's own name).

  The line's height is always reserved. With this order, a player who holds office or has been
  executed never hides a visible role: the icon by the name still shows it. This is the designer's
  call.
- **Right slot:** the vote (the `ja` or `nein` icon, revealed in the same staged sequence the seats
  use now) or the busy bubble. They never show together, as now.

The user's own row has a gold ring and a light gold tint. Executed players are darkened as the tiles
are today.

With ten players the rows share the column's height equally. With fewer players a row grows
only up to a cap, and the rows sit at the top.

Rows follow `playerOrder`, the same for everyone, with the user highlighted wherever they fall.
This is the designer's call: everyone sees the same list, so "third from the top" means the same
player to all.

### Compact rows (phones)

Each row is about 26 px tall, in the same order. It holds a small portrait (the same crop), the name
(ellipsis only if it cannot fit), `PRES` or `CHAN`, and at the right the vote or the busy bubble. A
visible role shows as its party icon beside the name. The highlighting and darkening match the
roster rows.

### Round tracker

The tracker is a rounded card in the counts box's dark brown (`--backgroundDark`, `#372e25`) with a
small drop shadow.

- **Top line:** the four steps of a round, in Germania One:
  `NOMINATION › ELECTION › LEGISLATIVE SESSION › EXECUTIVE ACTION`. The current step is filled
  orange with white text, earlier steps are light, and later steps are dim.
- **Under it:** the status line in white Montserrat bold. The words "president" and "chancellor",
  in any case, are orange.
- **Height:** the card always reserves two lines of text, so the boards never move when a line
  wraps or the line is empty. The line fades when it changes, as today.
- **Width:** the card fits its content, up to the boards' width, and is centred on the boards.

The lit step must match the line beside it. The line is queued in `App`'s animation queue and often
trails the live game state. For example, "6 - 4: Vote passed" stays up after the server has moved
to the legislative session. So the step is queued with the line: `queueStatusMessage` and the other
places that set the status take a step along with the text.

**Fixed steps.** Two kinds of line always light the same step:

- **Election:** the vote-reveal lines ("Tallying votes...", "N - M: Vote passed", "N - M: Vote
  failed").
- **The spectator's "policy was enacted" line:** Election when the election tracker forced the
  policy (`electionTrackerAdvanced` is true). Otherwise Legislative session, even when the new
  state is already a presidential power.

**Every other line** lights the step of the game state it was queued for. A small pure function
maps the state, plus `lastState`, to the step:

| State | Step |
|---|---|
| `CHANCELLOR_NOMINATION` | Nomination |
| `CHANCELLOR_VOTING` | Election |
| `LEGISLATIVE_PRESIDENT`, `LEGISLATIVE_CHANCELLOR`, `LEGISLATIVE_PRESIDENT_VETO` | Legislative session |
| `PP_PEEK`, `PP_INVESTIGATE`, `PP_EXECUTION`, `PP_ELECTION` | Executive action |
| `POST_LEGISLATIVE` | Decided by `lastState` (see below) |
| A victory state | The previous step stays lit |

For `POST_LEGISLATIVE`, `lastState` gives the step where the round actually ended:

- **A presidential power:** Executive action.
- **`LEGISLATIVE_*`:** Legislative session. This covers an enacted policy with no power, and an
  approved veto.
- **`CHANCELLOR_VOTING` or `CHANCELLOR_NOMINATION`:** Election. This covers a failed vote. After
  the third failure the server enacts the top policy without updating `lastState`, which stays
  `CHANCELLOR_NOMINATION`.

These transitions were checked in `SecretHitlerGame.java`: `advanceElectionTracker`,
`concludePresidentialActions`, `presidentialVeto` and `onEnactPolicy`.

So the spectator's election-tracker line lights Election after a failed vote and Legislative
session after an approved veto, because it follows the state. An empty line keeps the previous
step lit.

### Colours

The mockup colours, all from the existing palette or derived from it:

| Element | Colour |
|---|---|
| Page background | `--backgroundLight` `#4d4945` |
| Roster band | `rgba(0, 0, 0, 0.2)` over the page |
| Roster row | `rgba(255, 255, 255, 0.05)`, rounded |
| User's row | 3 px inset ring `#f6b53f` (`--selectionHover`), tint `rgba(246, 181, 63, 0.12)` |
| Names | `#eeeeee` |
| Office text | `#f08a5d` (a lighter `--headerFill`, readable on the dark band) |
| Tracker card | `--backgroundDark` `#372e25` |
| Tracker step, current | fill `#e05b2b` (`--headerFill`), text `#ffffff` |
| Tracker step, earlier | `#b9ab9f` |
| Tracker step, later | `#7a6d63` |
| Tracker arrows | `#6a5d53` |
| Tracker line | `#ffffff`. "president" and "chancellor" in `#f08a5d` |

### Decks column and counts box

`Deck` and `PlayerPolicyStatus` keep their look. In the decks column the counts box is as wide as
the column, and its labels never wrap. END TERM keeps its current behaviour: it is enabled for the
president in `POST_LEGISLATIVE`, and it is hidden for spectators but keeps its place. A full draw
pile's cards stand above the deck, as now, so the gap above the draw pile leaves room for them.

### Banner

`SECRET-HITLER` replaces `SECRET-HITLER.ONLINE` in `App.tsx` (the login and lobby headers) and
`GameScreen.tsx`. The spectator count on the left and the sound control on the right are
unchanged. The font load in `e2e/spectator.spec.ts` names the new text.

### Code changes

- **New:** a roster component with its CSS and unit tests, covering both the full and the compact
  rows. Also a round-tracker component with its CSS and unit tests, and the pure state-to-step
  function with unit tests.
- **`usePlayerTiles`:** the per-player data (office, busy, staged vote visibility, role shown,
  disabled text) moves into a hook or function that both the card tiles (prompts) and the roster
  rows use. The card tiles look and behave as now.
- **`App`:** the status state carries a step with the text, and every place that sets the status
  passes one.
- **`GameScreen`:** renders the roster, the tracker, the boards and the decks column. Its CSS is
  rewritten for the three layouts.
- **Deleted:** `TableSeats.tsx`, `TableSeats.css`, `TableSeats.test.tsx`, `seatPositions.ts` and
  `seatPositions.test.ts`. `StatusBar` goes too if nothing else uses it.
- **Docs:** `CLAUDE.md`'s description of the game page, its files and breakpoints is updated.
  `docs/PLAN.md` gets Phase 8.

### Tests

- **Unit:**
  - The state-to-step mapping, including `POST_LEGISLATIVE` after each kind of `lastState`: a
    presidential power, `LEGISLATIVE_CHANCELLOR`, `LEGISLATIVE_PRESIDENT_VETO`,
    `CHANCELLOR_VOTING` and `CHANCELLOR_NOMINATION`. Also the two fixed-step cases.
  - The tracker: the lit step, the orange words, and the reserved height.
  - The roster: office, role, busy, vote, executed, self highlight, the spectator view, and order.
  - `GameScreen`'s existing tests, updated.
- **`no-scroll.spec.ts`** (`desktop` and `firefox` projects), with 5 to 10 players and the longest
  status at every `DESKTOP_SIZES` and `NARROW_WINDOWS` size:
  - No page scroll in either direction.
  - Each board at least as wide as the table under Acceptance.
  - The tracker's centre within 1 px of the boards' centre.
  - END TERM above the draw pile.
  - The roster overlapping neither the boards nor the decks.
  - No roster row moving when a label fills in (replacing the seats' label-shift check).
- **`phone.spec.ts`** (both phone projects), with 5 to 10 players and the longest status:
  - No scroll in either direction.
  - Order from top to bottom: roster, tracker, decks row, boards.
  - END TERM's centre within 1 px of the counts box's centre, and END TERM above it.
  - Boards at full width.
  - 44 px touch targets.
  - A spectator's view fits too.
- **Unchanged:** `prompts.spec.ts`, `sounds.spec.ts` and the secret-scanning part of
  `spectator.spec.ts` still pass. Sounds stay in step with their animations.

## Acceptance

- Backend and frontend unit tests pass, the frontend build passes, and the browser tests pass in
  all four Playwright projects.
- At every size below, with 10 players, each board is at least as wide as today's. These widths
  were measured on `development` at commit `53cb8c4`:

| Window | Today (px) | Window | Today (px) |
|---|---|---|---|
| 1920x1080 | 483 | 1080x1920 | 768 |
| 1920x937 | 418 | 1280x1440 | 1023 |
| 1600x900 | 401 | 1024x1366 | 776 |
| 1366x768 | 339 | 960x1080 | 739 |
| 1280x720 | 314 | 820x1180 | 593 |
| 1279x1024 | 690 | 744x1133 | 522 |
| 903x903 | 598 | 700x900 | 506 |
| 990x793 | 514 | 800x700 | 439 |

- At the five desktop sizes, each board is also at least 90% as wide as in the mockup. The mockup
  reached 1110, 963, 925, 789 and 740 px, so the floors are 999 px (1920x1080), 867 px
  (1920x937), 833 px (1600x900), 710 px (1366x768) and 666 px (1280x720). Without these floors a
  build could pass by being only slightly bigger than today, and the point of the change is much
  bigger boards. This is the designer's call.
- In tall windows the mockup reached 758 px at 960x1080 and 648 px at 820x1180. Those numbers are
  for reference; the floor there is today's width.
- In the phone test viewports (360x740 and 412x915), with 10 players and the longest status, the
  page has no vertical scroll.
- The user plays one real game on the deployed build, on a desktop and on a phone, and sees
  every row state: office, busy, votes, roles, executed and victory.

## Left to the builder

These are free as long as Acceptance holds and the look matches the mockups:

- **Spacing and sizes:** exact sizes, the cap on row height for small games, and how the decks
  column shrinks in short windows. In the mockup the decks column outgrew 1279x1024, 990x793 and
  800x700.
- **Near-square windows:** whether they use the roster at the side or across the top, and whether
  the tall-window breakpoint moves from 5:4 to get there.
  - The mockup's top roster overflowed and lost to today's board width at 1279x1024 (618 px
    against 690), at 990x793 and at 800x700.
  - A side roster gives about 790 px at 1279x1024.
  - At 800x700 the top roster in three columns is the likely way to beat 439 px.
  - At 1280x1440 the mockup's 1011 px trails today's 1023 px by about 1%, so the tall-window
    spacing needs tightening there.
- **Two columns or three:** whether the top roster uses three columns where three names fit.
- **Names:** component, hook and file names.
- **Phone spacing:** how much spare phone height to give back as spacing.
