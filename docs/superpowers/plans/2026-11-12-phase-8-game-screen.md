# Phase 8: Game screen redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the round table with a roster of players at the side and much bigger boards,
replace the black status bar with a round tracker, fit a phone without scrolling, and rename the
banner to `SECRET-HITLER`.

**Architecture:**
- The per-player logic in `usePlayerTiles` (office, busy, staged votes, visible role, disabled
  text) moves into a data hook, `usePlayerRows`. The prompts' card tiles and a new `PlayerRoster`
  both read from it.
- A pure `stepForState` maps a game state to a round step. `App` queues that step together with
  each status line, so the new `RoundTracker` always lights the step that matches the line it
  shows.
- `GameScreen` drops `TableSeats`, `seatPositions` and `StatusBar`. It lays out the roster, the
  tracker, the boards and the decks with CSS grid in three layouts: desktop, tall windows and
  phones.

**Tech Stack:** React 18, TypeScript 5, Vite 8, Vitest 5 with Testing Library, `@playwright/test`
1.64.1. Client only: no backend changes.

**Spec:** [`docs/superpowers/specs/2026-11-12-game-screen-redesign-design.md`](../specs/2026-11-12-game-screen-redesign-design.md).
Read it first, with the reference screenshots in
[`../specs/2026-11-12-game-screen-redesign/`](../specs/2026-11-12-game-screen-redesign/) and the
Colours table in the spec. Parent plan: [`docs/PLAN.md`](../../PLAN.md), Phase 8.

## Global Constraints

- **No new art.** The roster reuses `player-base.png`, the portrait SVGs (`src/assets/index.ts`)
  and the role, vote and busy icons. Fonts stay Germania One (`--headerFont`) and Montserrat
  (`--textFont`).
- **Client only.** The WebSocket protocol is unchanged.
- **Breakpoints:**
  - Phones: `@media (max-width: 768px), (aspect-ratio < 5/4), (max-height: 500px)`.
  - Tall windows: `@media (min-width: 700px) and (aspect-ratio < 5/4)`. This block comes after the
    phone block and overrides it.
  - The tall-window rule may move if near-square windows need it (spec, Left to the builder).
- **Touch targets:** END TERM is at least 44 px tall and wide on phones and in tall windows
  (`MIN_TARGET`, `e2e/layout.ts`).
- **Board floors** (px, each board, every player count). These are 90% of the mockup widths at the
  five desktop sizes, and today's widths in the tall windows. Any win over a floor is welcome.

  | Window | Floor | Window | Floor |
  |---|---|---|---|
  | 1920x1080 | 999 | 1279x1024 | 690 |
  | 1920x937 | 867 | 1080x1920 | 768 |
  | 1600x900 | 833 | 1280x1440 | 1023 |
  | 1366x768 | 710 | 1024x1366 | 775 |
  | 1280x720 | 666 | 960x1080 | 739 |
  | 820x1180 | 592 | 744x1133 | 522 |
  | 700x900 | 506 | 800x700 | 439 |
  | 903x903 | 597 | 990x793 | 513 |

- **Phones:** with 10 players and the longest status, the page has no vertical scroll in the
  360x740 and 412x915 viewports.
- **Kept selectors:** keep `#status-bar-text` on the tracker's line element.
  `e2e/sounds.spec.ts`, `e2e/spectator.spec.ts` and `e2e/soundLog.ts` read it.
- **Out of scope:** do not fix the baseline issues listed in `CLAUDE.md` (#4, #5, #8, #9, #10,
  #13). Prompts (`src/custom-alert/`) keep today's card tiles and look.
- **Java:** Java 17 for Gradle and `npm run e2e`, locally
  `JAVA_HOME=$HOME/.sdkman/candidates/java/17.0.8-zulu`.
- **Lockfile:** lockfile changes use `npx npm@11.21.1`. None are expected.
- **Commits:** Conventional Commits with a scope (`frontend`, `plan`, `docs`, `claude`). Tick each
  `docs/PLAN.md` box in the same commit as its work.
- **Public repo:** nothing about the host's infrastructure goes into the repo, commit messages or
  PR text.

## Review Focus

1. **A fascist who sees a teammate holding office.** Both must show: `PRESIDENT` on the detail
   line and the party icon beside the name. Covered by a `PlayerRoster` test in Task 8.4.
2. **A reload mid-game into end of term after a failed vote.** The first packet is
   `POST_LEGISLATIVE` with `lastState: CHANCELLOR_VOTING`, and the tracker must light ELECTION, not
   LEGISLATIVE SESSION. Covered by a `roundStep` test (8.2) and `tracker.spec.ts` (8.6).
3. **A dead player during a vote reveal:** no vote pill, no busy bubble, and `EXECUTED` on the
   detail line. Covered by `usePlayerRows` (8.3) and `PlayerRoster` (8.4) tests.
4. **Twelve-character names at the smallest desktop size.** No roster name is cut off at
   1280x720. Only the phone's compact rows may use an ellipsis. Covered by `no-scroll.spec.ts`
   (8.7).
5. **A game that ends with Hitler elected.** The victory state maps to no step, so ELECTION stays
   lit under the victory screen. Covered by `roundStep` (8.2) and `RoundTracker` (8.5) tests and the
   `App` wiring in 8.6.

---

### Task 8.1: Banner reads SECRET-HITLER

**Files:**
- Modify: `frontend/src/App.tsx:754` (login header) and `:957` (lobby header),
  `frontend/src/game/GameScreen.tsx:47`, `frontend/e2e/spectator.spec.ts:375`
- Test: `frontend/src/App.test.tsx`, `frontend/src/game/GameScreen.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// App.test.tsx
test("the login page's banner reads SECRET-HITLER", () => {
  const { container } = render(<App />);
  expect(container.querySelector("header")).toHaveTextContent(/^SECRET-HITLER$/);
});
// GameScreen.test.tsx
test("the game banner reads SECRET-HITLER", () => {
  renderScreen();
  expect(document.querySelector("header")).toHaveTextContent(/^SECRET-HITLER$/);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd frontend && npm test -- --run src/App.test.tsx src/game/GameScreen.test.tsx`

Expected: the two new tests FAIL, with the received text `SECRET-HITLER.ONLINE`.

- [ ] **Step 3: Change the banner**

Replace `SECRET-HITLER.ONLINE` with `SECRET-HITLER` in the three headers. In the font load in
`spectator.spec.ts:375`, use the new text.

- [ ] **Step 4: Run the unit tests and confirm they pass**

Run: `cd frontend && npm test -- --run`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx frontend/src/game/GameScreen.tsx frontend/src/game/GameScreen.test.tsx frontend/e2e/spectator.spec.ts docs/PLAN.md
git commit -m "feat(frontend): rename the banner to SECRET-HITLER"
```

### Task 8.2: Round step mapping

**Files:**
- Create: `frontend/src/game/roundStep.ts`
- Test: `frontend/src/game/roundStep.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export enum RoundStep {
    NOMINATION = "NOMINATION",
    ELECTION = "ELECTION",
    LEGISLATIVE = "LEGISLATIVE SESSION",
    EXECUTIVE = "EXECUTIVE ACTION",
  }
  export const ROUND_STEPS: readonly RoundStep[]; // in the order above
  /** The step a status line lights for this state; null keeps the previous step (SETUP, victory states). */
  export function stepForState(game: Pick<GameState, "state" | "lastState">): RoundStep | null;
  /** The spectator's "policy was enacted" line: ELECTION when the election tracker forced it. */
  export function stepForPolicyLine(game: Pick<GameState, "electionTrackerAdvanced">): RoundStep;
  ```

- [ ] **Step 1: Write the failing tests** (`describe("stepForState")` and `describe("stepForPolicyLine")`)

- `ROUND_STEPS` equals `[NOMINATION, ELECTION, LEGISLATIVE, EXECUTIVE]`.
- `CHANCELLOR_NOMINATION` maps to `NOMINATION`, and `CHANCELLOR_VOTING` to `ELECTION`.
- `LEGISLATIVE_PRESIDENT`, `LEGISLATIVE_CHANCELLOR` and `LEGISLATIVE_PRESIDENT_VETO` map to
  `LEGISLATIVE`.
- `PP_PEEK`, `PP_INVESTIGATE`, `PP_EXECUTION` and `PP_ELECTION` map to `EXECUTIVE`.
- `POST_LEGISLATIVE` maps by its `lastState`, as an `it.each` table:

  | `lastState` | Step |
  |---|---|
  | each of the four `PP_*` | `EXECUTIVE` |
  | `LEGISLATIVE_CHANCELLOR` | `LEGISLATIVE` |
  | `LEGISLATIVE_PRESIDENT_VETO` | `LEGISLATIVE` |
  | `CHANCELLOR_VOTING` (a failed vote) | `ELECTION` |
  | `CHANCELLOR_NOMINATION` (a third failed vote, where the server leaves `lastState` alone) | `ELECTION` |
  | `SETUP` (fallback) | `LEGISLATIVE` |

- `SETUP` and all four victory states map to `null`.
- `stepForPolicyLine({ electionTrackerAdvanced: true })` is `ELECTION`, and with `false` it is
  `LEGISLATIVE`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd frontend && npm test -- --run src/game/roundStep.test.ts`

Expected: FAIL, with the module not found.

- [ ] **Step 3: Implement `roundStep.ts`**

Use a `switch` on `state`, with a nested one on `lastState` for `POST_LEGISLATIVE`. Import
`LobbyState` and `GameState` from `../types`.

- [ ] **Step 4: Run them and confirm they pass**

Run: `cd frontend && npm test -- --run src/game/roundStep.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/game/roundStep.ts frontend/src/game/roundStep.test.ts docs/PLAN.md
git commit -m "feat(frontend): map game states to round steps"
```

### Task 8.3: Per-player row data

**Files:**
- Create: `frontend/src/player/usePlayerRows.ts`
- Modify: `frontend/src/player/PlayerDisplay.tsx`. `usePlayerTiles` keeps its signature and output
  but reads `usePlayerRows`. Move the props type, `defaultProps`, the `DISABLE_*` filters,
  `getPlayerOrder`, `getBusyPlayerSet`, `shouldShowRole` and the vote animation into
  `usePlayerRows.ts`. `PlayerDisplay.tsx` re-exports `PlayerDisplayProps` and the `DISABLE_*`
  filters, so `App.tsx` and the prompts keep their imports.
- Test: `frontend/src/player/usePlayerRows.test.tsx` (`renderHook` from `@testing-library/react`).
  `PlayerDisplay.test.tsx` must still pass unchanged.

**Interfaces:**
- Produces:
  ```ts
  export type PlayerRow = {
    name: string;
    icon: string;                       // portrait key, gameState.icon[name]
    office: "PRESIDENT" | "CHANCELLOR" | "";
    isUser: boolean;                    // name === props.user
    busy: boolean;                      // in the busy set && !props.showVotes && props.showBusy (today's rule)
    showVote: boolean;                  // staged reveal reached this player && alive
    vote: boolean | undefined;          // gameState.userVotes[name]
    role: Role | undefined;             // only when shouldShowRole is true; otherwise undefined
    disabledText: string;               // props.playerDisabledFilter(name, gameState), "" when enabled
  };
  export function usePlayerRows(props: PlayerDisplayProps): PlayerRow[]; // in getPlayerOrder() order
  ```

- [ ] **Step 1: Write the failing tests**

Use `makeGameState` from `src/game/testGameState.ts`, with five names: Ann, Ben, Cat, Dan, Eve.

- `office`: Ann (president by default) has `"PRESIDENT"`. With `chancellor: "Ben"`, Ben has
  `"CHANCELLOR"`. The others have `""`.
- `busy`:
  - In `CHANCELLOR_NOMINATION` with `showBusy: true`, only Ann is busy.
  - With `showVotes: true`, nobody is busy.
  - With `showBusy: false`, nobody is busy.
- `role`, by viewer:
  - A liberal user sees only their own role.
  - A `FASCIST` user sees the `FASCIST` and `HITLER` players' roles and not the liberals'.
  - A spectator (`user: ""`) sees no role in `POST_LEGISLATIVE` and every role in
    `FASCIST_VICTORY_POLICY`.
- **A dead player** (`players.Cat.alive = false`) has `disabledText` `"EXECUTED"`. With
  `showVotes: true` and the votes in, after `vi.advanceTimersByTime(1000)` every living row has
  `showVote: true` and Cat has `showVote: false` and `busy: false`.
- `isUser` is true for the user's row only, and false everywhere for a spectator.

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd frontend && npm test -- --run src/player/usePlayerRows.test.tsx`

Expected: FAIL, with the module not found.

- [ ] **Step 3: Move the logic into `usePlayerRows`, and make `usePlayerTiles` map each `PlayerRow` to today's `<Player>` tile**

`renderPlayer`'s `isBusy`, `showVote`, `showRole` and `role` come from the row. Selection
(`onPlayerSelected`) stays in `usePlayerTiles`.

- [ ] **Step 4: Run all the unit tests and confirm they pass**

Run: `cd frontend && npm test -- --run`

Expected: PASS, including the unchanged `PlayerDisplay.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/player docs/PLAN.md
git commit -m "refactor(frontend): share per-player state between tiles and rows"
```

### Task 8.4: PlayerRoster

**Files:**
- Create: `frontend/src/game/PlayerRoster.tsx`, `frontend/src/game/PlayerRoster.css`
- Test: `frontend/src/game/PlayerRoster.test.tsx`

**Interfaces:**
- Consumes: `usePlayerRows`, `PlayerRow` (8.3), with `playerDisabledFilter: DISABLE_EXECUTED_PLAYERS`.
- Produces: `export default function PlayerRoster(props: { gameState: GameState; user: string; showVotes: boolean; showBusy: boolean }): JSX.Element`.

The layouts and tests rely on this DOM. Use these class names exactly:

```
ol.roster[aria-label="Players"]
  li.roster-row(.is-user)(.is-disabled)[data-player=<name>]
    span.roster-portrait > img.roster-card (player-base.png, alt "") + img.roster-face (portrait, alt from portraitsAltText)
    span.roster-text
      span.roster-name  <name> + img.roster-role-icon[alt="Liberal"|"Fascist"|"Hitler"] when role is set
      span.roster-detail(.office | .role-liberal | .role-fascist)   always rendered; text = office || disabledText || role word || ""
    span.roster-tag     "PRES" | "CHAN" | ""   (shown only in the phone's compact rows)
    span.roster-status  img.roster-vote[alt="ja"|"nein"] when showVote, else img.roster-busy[alt="busy"] when busy, else empty
```

The role words are "Liberal", "Fascist" and "Hitler", and Hitler takes `.role-fascist`.

`PlayerRoster.css` styles the full rows from the spec's Roster rows section and Colours table.

- **Portrait:** a square box with `overflow: hidden` and `border-radius: 11.4% / 17%`.
  - `.roster-card`: `width: 107.26%; left: -3.63%; top: -3.87%`.
  - `.roster-face`: `width: 87.9%; left: 6.05%; top: 5.79%`.
- **User's row:** a 3 px inset ring `#f6b53f` and a `rgba(246, 181, 63, 0.12)` tint.
- **`.is-disabled`:** images at `brightness(35%)` and the name in `--playerDisabledTextColor`.
- **`.roster-tag`:** `display: none`. The phone block in Task 8.8 shows it.

- [ ] **Step 1: Write the failing tests**

Use five names and `makeGameState`.

- **Order:** the rows' `data-player` values equal `playerOrder`.
- **Highlight:** only the user's row has `.is-user`. A spectator (`user=""`) has none.
- **Offices:** the president's `.roster-detail` reads `PRESIDENT` and its `.roster-tag` reads
  `PRES`. With a chancellor set, that row reads `CHANCELLOR` and `CHAN`.
- **Own role:** the user, a liberal not in office, has a `.roster-detail` reading `Liberal` and
  an `img.roster-role-icon[alt="Liberal"]`.
- **Teammate in office:** the user is `FASCIST`, and the president, Ben, is `FASCIST`. Ben's
  detail reads `PRESIDENT`, and his name holds `img[alt="Fascist"]`.
- **Executed:** with Cat dead, Cat's row has `.is-disabled` and the detail `EXECUTED`. During a
  vote reveal (`showVotes`, fake timers, 1000 ms) it has no `.roster-vote` and no `.roster-busy`.
- **Busy:** in nomination with `showBusy`, the president's row alone has `img.roster-busy`.
- **Votes:** with every vote in and `showVotes`, after 1000 ms each living row shows
  `img.roster-vote` with the alt `ja` or `nein` that matches its vote.
- **Reserved line:** every row has exactly one `.roster-detail`, empty or not.

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd frontend && npm test -- --run src/game/PlayerRoster.test.tsx`

Expected: FAIL, with the module not found.

- [ ] **Step 3: Implement `PlayerRoster.tsx` and `PlayerRoster.css`**

- [ ] **Step 4: Run them and confirm they pass**

Run: `cd frontend && npm test -- --run src/game/PlayerRoster.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/game/PlayerRoster.* docs/PLAN.md
git commit -m "feat(frontend): add the player roster"
```

### Task 8.5: RoundTracker

**Files:**
- Create: `frontend/src/game/RoundTracker.tsx`, `frontend/src/game/RoundTracker.css`
- Test: `frontend/src/game/RoundTracker.test.tsx`

**Interfaces:**
- Consumes: `RoundStep`, `ROUND_STEPS` (8.2).
- Produces: `export default function RoundTracker(props: { step: RoundStep | null; text: string }): JSX.Element`.

The DOM:

```
section.round-tracker[aria-label="Round"]
  ol.round-steps > li.round-step(.done | .current | .later) ×4, text = the RoundStep value;
                    the current one has aria-current="step"; the "›" between steps is CSS (li + li::before)
  p#status-bar-text.round-line(.hide)   the shown text, with each whole word "president"/"chancellor"
                                        (any case) wrapped in span.round-highlight
```

- **Fade:** keep today's fade from `StatusBar.jsx`. When `text` changes, the old text stays and
  gets `.hide` for 250 ms (the `hide` animation), then the new text shows without `.hide`.
- **CSS:** the card is `--backgroundDark` with a `0 0.4vh 0 rgba(0,0,0,.25)` shadow and rounded
  corners. Use the spec's step and highlight colours.
- **Reserved height:** `.round-line` sets `line-height: 1.2; min-height: 2.4em`, so two lines are
  always reserved.

- [ ] **Step 1: Write the failing tests**

- **ELECTION:** with `step: ELECTION`, NOMINATION is `.done` and ELECTION is `.current` with
  `aria-current="step"`. LEGISLATIVE SESSION and EXECUTIVE ACTION are `.later`.
- **No step:** with `step: null`, no step is `.current` and all four are `.later`.
- **Highlights:** for the text
  `"Chancellor has motioned to veto the agenda. Waiting for the president to decide."`, the
  `.round-highlight` spans read `["Chancellor", "president"]`. The line's `textContent` equals the
  text, and the line has `id="status-bar-text"`.
- **No partial words:** `"Presidential"` gets no highlight.
- **Fade:** with fake timers, rerender with a new text. The line still shows the old text and has
  `.hide`. After 250 ms it shows the new text without `.hide`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd frontend && npm test -- --run src/game/RoundTracker.test.tsx`

Expected: FAIL, with the module not found.

- [ ] **Step 3: Implement `RoundTracker.tsx` and `RoundTracker.css`**

- [ ] **Step 4: Run them and confirm they pass**

Run: `cd frontend && npm test -- --run src/game/RoundTracker.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/game/RoundTracker.* docs/PLAN.md
git commit -m "feat(frontend): add the round tracker"
```

### Task 8.6: Queue the step with each status line

**Files:**
- Modify: `frontend/src/App.tsx`, `frontend/src/game/GameScreen.tsx`
- Test: create `frontend/e2e/tracker.spec.ts`. Update `frontend/src/game/GameScreen.test.tsx`.

The `App.tsx` changes:
- **State:** add `statusStep: RoundStep | null`, initially `null`, to the state type (line 179)
  and the initial state (line 210).
- **`queueStatusMessage`** (line 1817) becomes
  `queueStatusMessage(message: string, step: RoundStep | null, holdMs = 0)`. It sets `statusBarText`
  and, when `step !== null`, `statusStep`.
- **Callers:**
  - `queueStatus` (1125), the election-tracker line (1179), the result lines (1418 and 1500) and
    the victory line (1542) pass `stepForState(newState)`.
  - The policy line (1200) passes `stepForPolicyLine(newState)`.
- **`showVotes`** (1693): `"Tallying votes..."` and both result lines also set
  `statusStep: RoundStep.ELECTION`. The `""` resets (1262 and 1727) leave `statusStep` alone.
- **`GameScreen`:** pass `statusStep={this.state.statusStep}`.

The `GameScreen.tsx` changes (the layout stays the round table until 8.7):
- **Props:** add `statusStep: RoundStep | null` to `GameScreenProps`.
- **Tracker:** render `<RoundTracker step={props.statusStep} text={props.statusBarText} />` in
  place of `<StatusBar>`.

- [ ] **Step 1: Write the failing browser tests** in `tracker.spec.ts`

Use `openFakeWatch`, `spectatorPacket` and `TEN` from `e2e/fakeGame.ts`, with these locators:
`const current = page.locator(".round-step[aria-current='step']")` and
`const line = page.locator("#status-bar-text")`.

1. **"the vote result keeps ELECTION lit, then the legislative session lights"**
   - Open with
     `spectatorPacket({ state: CHANCELLOR_VOTING, lastState: CHANCELLOR_NOMINATION, president: TEN[1], chancellor: TEN[2] })`.
   - Expect `current` to read `ELECTION`.
   - Send
     `spectatorPacket({ state: LEGISLATIVE_PRESIDENT, lastState: CHANCELLOR_VOTING, president: TEN[1], chancellor: TEN[2], userVotes: <all ten true> })`.
   - Expect `line` to read `"10 - 0: Vote passed"` while `current` reads `ELECTION`.
   - Then, with a 15 s timeout, expect `line` to read
     `"Waiting for Long Guest 1 to choose a policy to discard."` and `current` to read
     `LEGISLATIVE SESSION`.
2. **"after a failed vote, end of term lights ELECTION"**
   - Open with
     `spectatorPacket({ state: POST_LEGISLATIVE, lastState: CHANCELLOR_VOTING, president: TEN[1] })`.
   - Expect `line` to read `"Waiting for Long Guest 1 to end their term."` and `current` to read
     `ELECTION`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd frontend && JAVA_HOME=$HOME/.sdkman/candidates/java/17.0.8-zulu npm run e2e -- --project=desktop tracker.spec.ts`

Expected: FAIL, because no `.round-step` exists.

- [ ] **Step 3: Implement the `App` and `GameScreen` changes above**

In `GameScreen.test.tsx`, add `statusStep: null` to `renderScreen`'s props and to the spectator
test's props.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd frontend && npm test -- --run`, then
`npm run e2e -- --project=desktop tracker.spec.ts sounds.spec.ts spectator.spec.ts`

Expected: PASS. The sounds and spectator tests still read `#status-bar-text`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/game/GameScreen.tsx frontend/src/game/GameScreen.test.tsx frontend/e2e/tracker.spec.ts docs/PLAN.md
git commit -m "feat(frontend): light the round step with each status line"
```

### Task 8.7: Desktop and tall-window layout

**Files:**
- Modify: `frontend/src/game/GameScreen.tsx`, `frontend/src/game/GameScreen.css` (rewrite),
  `frontend/src/game/GameScreen.test.tsx`, `frontend/e2e/layout.ts`,
  `frontend/e2e/no-scroll.spec.ts` (rewrite)
- Delete: `frontend/src/game/TableSeats.tsx`, `TableSeats.css`, `TableSeats.test.tsx`,
  `seatPositions.ts`, `seatPositions.test.ts`, and `frontend/src/status-bar/`

**Interfaces:**
- Consumes: `PlayerRoster` (8.4), `RoundTracker` (8.5), and `statusStep` (8.6).
- Produces: this `GameScreen` DOM, which 8.8 and the browser tests rely on:
  ```
  div.game-screen > header.App-header
                  > div.game-body > ol.roster (PlayerRoster)
                                  > div.game-table > section.round-tracker
                                                   > div.game-boards > #board-container (Board)
                                                   > div.game-decks > button.end-term
                                                                    > div.game-deck.draw > Deck DRAW
                                                                    > PlayerPolicyStatus (#pps-container)
                                                                    > div.game-deck.discard > Deck DISCARD
  ```

The CSS follows the spec's Layouts section and the reference screenshots.

- **`.game-screen`:** `height: 100dvh`, with a grid of the header row and the body row.
- **Desktop:**
  - The roster is a column `clamp(260px, 20vw, 380px)` wide, on `rgba(0,0,0,.2)`. With 10 players
    its rows share the height equally. With fewer players, cap each row at the height of a
    10-player row × 1.5 and align the rows to the top.
  - `.game-table` is a size container with a grid of two columns, the boards' column and a decks
    column. The tracker sits in row 1, centred on the boards' column. Its height is reserved:
    steps, two lines of text and padding. The boards fill row 2. The decks column sits in row 2,
    centred vertically.
  - Board width is `min(100cqw − decks column − gap, (100cqh − tracker − gaps) × 1.2946)`. Apply it
    to the `#board` images, as today's `.game-boards #board` rule does.
- **Tall windows:**
  - The roster runs across the top in two columns (three where names fit), with no gap above the
    tracker. Content aligns to the top.
  - Size text by the width.
  - The decks column scales with the height available, so it never outgrows the boards.
  - In near-square windows (1279x1024, 990x793 and 800x700), the builder chooses between a side
    roster and a top roster, whichever meets the floor (spec, Left to the builder).
- **END TERM:** `.end-term` keeps today's button styles and sits directly above the draw pile.
  It is at least 44 px in tall windows.
- **Counts box:** `#pps-container` is as wide as the decks column, and its labels never wrap
  (`white-space: nowrap`).
- **Deck cards:** a full draw pile's cards stand up to 0.34 × the deck's width above it, so the
  gap between END TERM and the draw pile leaves room for them.

`e2e/layout.ts` changes:
- **`BOARD_FLOOR`:** add `BOARD_FLOOR: Record<string, number>`, keyed `"WxH"`, holding the
  Global Constraints table.
- **`LONG_STATUS`:** move it here from `no-scroll.spec.ts`, so `phone.spec.ts` can use it in 8.8.
- **`rowShift(page)`:** it replaces `labelShift`. It fills every empty `.roster-detail` with
  `CHANCELLOR`, empties every full one, and returns the largest move, in px, of any `.roster-row`
  or of `#board-container`. It edits React's text node as `labelShift` does.
- **`NARROW_WINDOWS`:** update its doc comment, which still describes the old stacked layout.

`no-scroll.spec.ts` checks, for 5, 7 and 10 players, at every `DESKTOP_SIZES` and `NARROW_WINDOWS`
size (`at = "WxH"`):

- **Page:**
  - `pageHeight ≤ height`, `scrollWidth ≤ width`, and no `offscreen` elements.
- **Boards:**
  - The first `#board` image's width is at least `BOARD_FLOOR[at]`.
- **Roster:**
  - The roster overlaps none of the tracker, the boards or the decks.
  - No two `.roster-row`s overlap.
  - Every `.roster-name` has `scrollWidth ≤ clientWidth + 1`, so no name is cut off.
  - At desktop sizes the roster is at the left: `roster.right ≤ boards.left`.
  - When the roster is above the tracker, `tracker.top − roster.bottom ≤ 24`.
- **Tracker:**
  - Its horizontal centre is within 1 px of the boards' centre.
  - `tracker.bottom ≤ boards.top + 1`.
- **Decks:**
  - The decks overlap neither the boards nor the tracker.
  - END TERM is above the draw pile (`endTerm.bottom ≤ draw.top + 1`), and its horizontal centre
    is within 1 px of the draw pile's.
  - Deck cards in `.game-decks #deck-policy.deck-final-show` do not overlap the boards.
- **Long status:** setting `#status-bar-text`'s text node to `LONG_STATUS`, then to `""`, moves
  `#board-container` by no more than 0.5 px. Edit the text node as `boardsWithStatus` does today.
- **Rows don't jump:** `rowShift(page) ≤ 0.5`.
- **Settled:** 500 ms later, the tracker, the boards and END TERM have not moved.
- **Tall windows only:** `smallTargets(page, ".game-screen")` is empty.

The other tests in `no-scroll.spec.ts`:
- **Breakpoint test:** it replaces "windows narrower than 5:4 stack the table". At 1280x1024
  `roster.right ≤ boards.left`, and at 960x1080 `roster.bottom ≤ tracker.top + 1`.
- **Spectator test:** keep it, rewritten with the same checks. In addition, no `.roster-row` has
  `.is-user`, and END TERM is hidden and no touch target.

- [ ] **Step 1: Rewrite `layout.ts` and `no-scroll.spec.ts` as above, and update `GameScreen.test.tsx`**

In `GameScreen.test.tsx`, `.table-seat` becomes `.roster-row`, and `#player-container.highlight`
becomes `.roster-row.is-user`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd frontend && npm test -- --run src/game/GameScreen.test.tsx`, then
`npm run e2e -- --project=desktop no-scroll.spec.ts`

Expected: FAIL, because there is no `.roster` on the game screen yet.

- [ ] **Step 3: Rebuild `GameScreen.tsx`, rewrite `GameScreen.css` (desktop and tall windows), and delete the files listed**

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd frontend && npm test -- --run && npm run build`, then
`npm run e2e -- --project=desktop --project=firefox`

Expected: PASS.

`phone.spec.ts` is rewritten in 8.8 and is not run here. Tune the CSS until every floor holds in
both browsers. Do not lower a floor.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src/game frontend/src/status-bar frontend/e2e/layout.ts frontend/e2e/no-scroll.spec.ts docs/PLAN.md
git commit -m "feat(frontend): seat players in a roster beside bigger boards"
```

### Task 8.8: Phone layout and docs

**Files:**
- Modify: `frontend/src/game/GameScreen.css` (the phone block),
  `frontend/src/game/PlayerRoster.css` (compact rows), `frontend/e2e/phone.spec.ts`, `CLAUDE.md`

The phone block, at the phone breakpoint above:

- **Order:** one column in the order roster, tracker, decks row, boards. No `100dvh` grid.
- **Compact roster:** two columns of compact rows about 26 px tall, five lines for ten players.
  - `.roster-detail` is hidden and `.roster-tag` is shown.
  - `.roster-name` uses an ellipsis and keeps the role icon.
  - The vote or busy bubble sits at the right.
  - The reference is `phone-360x740.jpg`.
- **Decks row:** a grid with `grid-template-areas: ". end ." "draw pps discard"`. END TERM is at
  least 44 px tall and centred over the counts box.
- **Boards:** full width.

- [ ] **Step 1: Rewrite the game tests in `phone.spec.ts`**

The login, lobby and text-field tests stay as they are. For 5 and 10 players, after `settle`:

- **Page:**
  - `pageHeight ≤ viewport height`, no horizontal overflow, and no `offscreen` elements.
- **Order:**
  - `roster.bottom ≤ tracker.top + 1`
  - `tracker.bottom ≤ decks.top + 1`
  - `decks.bottom ≤ boards.top + 1`
- **Boards:** at least `width − 24` wide.
- **END TERM:** its centre is within 1 px of `#pps-container`'s centre, and
  `endTerm.bottom ≤ pps.top + 1`.
- **Roster:** no two `.roster-row`s overlap.
- **Touch targets:** `smallTargets(page, ".game-screen")` is empty.
- **Long status:** with `#status-bar-text` set to `LONG_STATUS`, the page still has no vertical
  scroll.

Two more tests:
- **"a phone held sideways gets the phone layout":** at `setViewportSize({ width: 915, height: 412 })`,
  `roster.bottom ≤ tracker.top + 1`. Scrolling is allowed.
- **Spectator test:** keep it, with the same no-scroll and touch-target checks.

Import `LONG_STATUS` from `e2e/layout.ts`, where 8.7 moved it.

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd frontend && npm run e2e -- --project=phone-360 phone.spec.ts`

Expected: FAIL, because the phone still gets the desktop grid.

- [ ] **Step 3: Write the phone block and the compact rows**

- [ ] **Step 4: Run the full suite and confirm it passes**

Run: `cd frontend && npm test -- --run && npm run build && npm run e2e`, then
`cd ../backend && ./gradlew test`

Expected: PASS in all four Playwright projects.

- [ ] **Step 5: Update `CLAUDE.md`**

In the `frontend/` paragraph:
- **Files:** replace `TableSeats`/`seatPositions` with `PlayerRoster`, `RoundTracker`,
  `roundStep` and `usePlayerRows`.
- **Breakpoints:** describe the three layouts and the new `max-height: 500px`.
- **Tests:** list `tracker.spec.ts`. `no-scroll.spec.ts` now checks `BOARD_FLOOR`, and the phone
  game now fits without scrolling.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/game/GameScreen.css frontend/src/game/PlayerRoster.css frontend/e2e CLAUDE.md docs/PLAN.md
git commit -m "feat(frontend): fit the game on a phone with a compact roster"
```
