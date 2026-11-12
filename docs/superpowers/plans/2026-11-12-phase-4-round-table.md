# Phase 4: Round-Table Game Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All players and both boards are visible with no scrolling on desktop.

**Architecture:** `App.tsx` keeps the WebSocket, the state and the overlays (`CustomAlert`, `EventBar`, snackbar) and hands everything the game page shows to a presentational `GameScreen`. `GameScreen` is a grid: a slim header, then a table area. Inside it, `TableSeats` places one existing `Player` tile per player on an ellipse (positions from the pure function `seatPositions`), and a centre box holds the boards, the deck row and the status row. The centre box's position comes from the same module as the seat geometry, so the unit test and the CSS share one set of numbers. A Playwright test checks the result in a real browser against the jar serving the built frontend.

**Tech Stack:** React 18, TypeScript 5, Vite 8, Vitest 5, Testing Library · `@playwright/test` 1.64.1 (Chromium) · Java 17 jar from the Gradle 7.4.2 wrapper · GitHub Actions.

Parent plan: [`docs/PLAN.md`](../../PLAN.md), Phase 4. Spec: [`docs/superpowers/specs/2026-11-11-self-hosted-fork-design.md`](../specs/2026-11-11-self-hosted-fork-design.md), section "4. Round-table game screen".

## Global Constraints

- Desktop acceptance sizes: 1920x1080, 1920x937, 1600x900, 1366x768, 1280x720.
- Acceptance: with 5, 7 and 10 players, the document does not scroll (`scrollHeight <= innerHeight`) at every desktop size. Checked by a Playwright test.
- No new art. The WebSocket protocol does not change.
- `overflow: hidden` is not used to fake the result.
- Prompts (`CustomAlert`), `EventBar` and the snackbar keep working on top of the new layout.
- The lobby and prompt uses of `Player` and `PlayerDisplay` keep their current layout.
- Do not fix the baseline issues listed in `CLAUDE.md` (#4, #5, #8, #9, #10, #13). Ask the user first if this phase has to touch their code.
- Versions are pinned to releases at least two weeks old: `@playwright/test` 1.65.0 is from 2026-11-05, so 1.64.1 from 2026-10-14.
- Commits follow Conventional Commits with a scope (`frontend`, `ci`, `plan`, `claude`); tick each `docs/PLAN.md` box in the same commit as its work.
- Ask the user before merging the PR. The user ticks "checked on a real 1080p monitor" after the deploy.

## Findings from the re-read

1. **`renderGamePage` is at `App.tsx:1625-1713`.** It renders the header, `CustomAlert`, `EventBar`, a `PlayerDisplay` strip, `StatusBar`, a deck row (draw deck, END TERM above `PlayerPolicyStatus`, discard deck), `Board`, and the snackbar, with inline styles throughout. The END TERM enabled check is inline: enabled only when `gameState.state` is `POST_LEGISLATIVE` and the user is the president.
2. **`PlayerDisplay` is also used inside prompts:** execution, special election, investigation and victory results (`App.tsx:954`, `1259`, `1291`, `1414`) and `PlayerDisplayPrompt` (which `SelectPlayerPrompt` uses). The lobby renders `Player` directly (`App.tsx:729`), not `PlayerDisplay`. So the table cannot change `Player.css`, `PlayerDisplay`'s row markup or their default sizes.
3. **`PlayerDisplay` owns the per-player logic** (busy set, role visibility, president/chancellor labels, disabled text, the staggered vote reveal). `TableSeats` needs the same tiles in seats instead of rows, so that logic moves into a hook both components call.
4. **The default tile is `min(20vmin, 16vh)` wide**, which is 16vh at every desktop size. Everything inside a tile (name, role, busy and vote icons, EXECUTED text) is sized from the viewport, not from the tile. Scaling the whole seat with `transform: scale()` keeps the tile's proportions exactly, which resizing `#player-image` would not.
5. **`Board`, `Deck`, `StatusBar` and `PlayerPolicyStatus` size themselves in `vmin`/`vw`** (`#board` is 90vmin wide; a deck is 14vmin; the policy status box is about 15vmin tall). Only the game page renders them, but the table overrides their sizes from `GameScreen.css` with selectors scoped to the game screen, so their own CSS files stay as they are.
6. **CPU players only fill a lobby up to five** (`backend/src/main/java/server/util/Lobby.java:497-511`; `SecretHitlerGame.MIN_PLAYERS = 5`). There is no way to ask for more CPU players, so 7 and 10 players need extra connections (Decision D4).
7. **Playwright is not installed.** Vitest's default include also matches `*.spec.ts`, so `vite.config.ts` must limit Vitest to `src/` before an `e2e/*.spec.ts` file exists.
8. **The local default JDK is 25; the Gradle 7.4.2 wrapper needs 17.** `npm run e2e` runs `./gradlew jar`, so it needs Java 17 active, like every other Gradle command (`sdk use java 17.0.21.0+9-tem`, or `JAVA_HOME` pointing at it).
9. **A prompt can be taller than the viewport.** `#alert-box` starts at `top: 10vh` with `min-height: 60vmin`, so the role reveal at game start (and a 10-player victory prompt) can push `scrollHeight` past 720. That is existing prompt sizing, which Phase 5's Task 5.2 owns; the browser test hides the overlay and measures the table under it.
10. **`#13` (routes registered after `start()`):** Playwright's `webServer.url` waits for a 2xx-403 answer, so pointing it at `/ping` rides over the transient 404.

## Decisions

**D1. `GameScreen` props and END TERM.** `App.tsx` passes:

```ts
export type GameScreenProps = {
  gameState: GameState;
  user: string;
  showVotes: boolean;
  showBusy: boolean;
  statusBarText: string;
  drawDeckSize: number;
  discardDeckSize: number;
  liberalPolicies: number;
  fascistPolicies: number;
  electionTracker: number;
  onEndTerm: () => void;
};
```

The policy counts and election tracker stay separate from `gameState` because `App.tsx` animates them. The END TERM enabled check moves into `GameScreen`, derived from `gameState` and `user` (`gameState.state === LobbyState.POST_LEGISLATIVE && gameState.president === user`). `App.tsx` only says what clicking does (`onEndTerm` sends `END_TERM`).

**D2. Seat geometry.** All numbers are percent of the table area (the box below the header). They live in `frontend/src/game/seatPositions.ts`:

| Constant | Value | Meaning |
|---|---|---|
| `TABLE_RADIUS_X` | 42 | horizontal radius of the seat ellipse, centred at (50, 50) |
| `TABLE_RADIUS_Y` | 40 | vertical radius |
| `SEAT_HALF_SIZE` | `{ x: 2.8, y: 8.5 }` | half the size of one seat (label row plus tile) that the geometry allows for |
| `centreBox(count)` | sides 29.5 and 70.5; top and bottom 1 clear of the nearest seat above and below it, at most 2 from the table's edge | the box the boards, decks and status row live in (see the ruling below) |
| `MIN_SEAT_DISTANCE` | 20 | smallest centre-to-centre distance between two seats |

- Seat for player `i` with relative index `r = (i - selfIndex + count) % count` sits at angle `θ = 90° + r × 360° / count`, at `x = 50 + 42 cos θ`, `y = 50 + 40 sin θ`. Screen `y` grows downwards, so a growing `θ` runs clockwise on screen: the local player is at bottom centre (50, 90), and the next player in `playerOrder` sits to their left (bottom-left), as at a real table.
- `selfIndex` outside `0..count-1` (a spectator, `indexOf` returning -1) is treated as 0.
- The unit test asserts, for 5 to 10 players: every seat rectangle (centre ± `SEAT_HALF_SIZE`) lies inside 0-100; no two seat rectangles overlap and no two centres are closer than 20 (the real minimum is 24.7, at 10 players); no seat rectangle overlaps `CENTRE_BOX`. The tightest margins are 1.0 (the bottom seat against the box's bottom, and the upper seats at 7 players against its top) and 1.5 to the table's edge.
- The pixel sizes behind `SEAT_HALF_SIZE`: seats are the default tile scaled by 0.5625 (16vh wide becomes 9vh). Including the reserved label row, that is 103x169 px at 1920x1080 and 70x115 px at 1280x720, which is at most 2.75% of the width and 8.42% of the table height at the five sizes.
- Ruling during Task 4: the box was first one fixed rectangle (top 23.5, bottom 80.5) for every count, which left 5-player boards about 490 px wide at 1080p with empty space above them. `centreBox(count)` keeps the same sides but only clears the seats that exist at that count: top 2 at 5 players, 19.5 at 6, 8 and 10, 21.9 at 9, 23.5 at 7; bottom 80.5. The unit test checks every count against its own box, and that each box is at least 57 tall.
- At 10 players there is a seat at top centre and one at bottom centre, so the centre box is limited in height by those two, in width by the lower and upper diagonal seats (x ≈ 25.3 at 10 players), and at the top corners by the 7-player upper seats (31.8, 14.0). `GameScreen` positions `.game-centre` from `CENTRE_BOX` with inline `left/right/top/bottom` percentages, so the CSS cannot drift from the tested numbers. The browser test then checks the real boxes: no seat overlaps another seat or the centre box, and the centre box's rows stay inside it.

**D3. Backend for the browser test.** `playwright.config.ts` has one `webServer`: `npm run build && cd ../backend && ./gradlew jar && java -jar build/libs/secret-hitler-online.jar`, with `PORT=4545`, `url: http://localhost:4545/ping`, `reuseExistingServer: false` (every run tests the current code) and a 240 s timeout. No `DATABASE_PATH` (persistence off) and no `DEBUG_MODE`. The same command runs locally and in CI; CI adds an `e2e` job with Java 17, Node 24 and `npx playwright install --with-deps chromium`, and `image` waits for it.

**D4. Reaching 5, 7 and 10 players.** 5 players: the host alone, and the server adds four CPU players on START GAME. 7 and 10 players: the test process opens 6 or 9 extra WebSocket connections (`/game?lobby=…&name=…`) and sends each one a `select-icon` command, the same messages the browser client sends. The guests never act, which is fine because the test only measures the table after START GAME. No backend change, no protocol change. The alternative is one more browser context per guest driving the login form, which is slower and depends on more UI.

**D5. Browser.** Chromium only (`devices["Desktop Chrome"]`, viewport changed per size).

**D6. Order.** The breakdown runs PLAN Task 4.4 (the browser test) before PLAN Task 4.3 (the layout), so the browser test is the failing test the layout makes pass. PLAN.md's numbering stays.

## Review Focus

1. Twelve-character names (the login form's maximum) on 9vh seats at 1280x720: names stay on the nameplate. The browser test's guests use 12-character names; the acceptance screenshots show them.
2. A player becoming president or chancellor must not move their seat: the label row above each tile is always reserved. Checked in the acceptance screenshots.
3. Executed seats (darkened, EXECUTED over the tile) stay readable at the smallest size. The acceptance drive includes an execution.
4. The staggered vote reveal shows a JA/NEIN icon on every living seat. The acceptance drive includes a vote reveal at 7 players.
5. Prompts taller than the viewport (Finding 9) are existing behaviour, out of this phase; the browser test hides the overlay to measure the table, and the acceptance screenshots show the prompts as they are.

## File map

| File | Change | Task |
|---|---|---|
| `frontend/src/game/GameScreen.tsx`, `GameScreen.css` | new: game markup, then the table grid | 1, 4 |
| `frontend/src/game/testGameState.ts` | new: `makeGameState` test fixture | 1 |
| `frontend/src/game/GameScreen.test.tsx` | new | 1 |
| `frontend/src/App.tsx` | `renderGamePage` (1625-1713) renders `GameScreen`; unused imports go | 1 |
| `frontend/src/game/seatPositions.ts`, `seatPositions.test.ts` | new | 2 |
| `frontend/vite.config.ts` | Vitest only runs `src/**/*.test.{ts,tsx}` | 3 |
| `frontend/playwright.config.ts`, `frontend/e2e/guests.ts`, `frontend/e2e/no-scroll.spec.ts` | new | 3 |
| `frontend/package.json`, `package-lock.json` | `@playwright/test` 1.64.1, script `e2e` | 3 |
| `frontend/.gitignore` | Playwright output | 3 |
| `.github/workflows/ci.yml` | `e2e` job; `image` needs it | 3 |
| `CLAUDE.md` | `frontend/src/game/`, `npm run e2e` | 3 |
| `frontend/src/player/PlayerDisplay.tsx`, `PlayerDisplay.test.tsx` | tile logic moves into `usePlayerTiles`; rows unchanged | 4 |
| `frontend/src/game/TableSeats.tsx`, `TableSeats.css`, `TableSeats.test.tsx` | new | 4 |
| `docs/PLAN.md` | ticks; Task 4.3 file list and Task 4.4 wording follow this breakdown | 1-5 |

---

### Task 1 (PLAN 4.1): Extract `GameScreen`

**Files:**
- Create: `frontend/src/game/GameScreen.tsx`, `frontend/src/game/GameScreen.css`, `frontend/src/game/testGameState.ts`
- Modify: `frontend/src/App.tsx:1625-1713` (and its imports)
- Test: `frontend/src/game/GameScreen.test.tsx`

**Interfaces:**
- Produces: `export default function GameScreen(props: GameScreenProps): JSX.Element` and `export type GameScreenProps` (D1) in `GameScreen.tsx`.
- Produces: `export function makeGameState(names: string[], overrides?: Partial<GameState>): GameState` in `testGameState.ts`: every name alive, not investigated, no role; icons `p1`, `p2`, … in order; `president` is `names[0]`; state `CHANCELLOR_NOMINATION`; other fields as `App.tsx`'s `DEFAULT_GAME_STATE`.

- [ ] **Step 1: Take the "before" screenshot.** With `./gradlew runLocal` (Java 17) and `npm run dev`, create a lobby, pick a portrait, START GAME (four CPU players join), dismiss the role prompt, and screenshot the game page at 1920x1080 into the scratchpad as `phase4-before-1920x1080.png`.

- [ ] **Step 2: Write the failing test** `frontend/src/game/GameScreen.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { LobbyState } from "../types";
import GameScreen, { GameScreenProps } from "./GameScreen";
import { makeGameState } from "./testGameState";

const NAMES = ["Alice", "Bob", "Carol", "Dave", "Erin"];

function renderScreen(overrides: Partial<GameScreenProps> = {}) {
  const props: GameScreenProps = {
    gameState: makeGameState(NAMES),
    user: "Alice",
    showVotes: false,
    showBusy: true,
    statusBarText: "Waiting for president to nominate a chancellor.",
    drawDeckSize: 17,
    discardDeckSize: 0,
    liberalPolicies: 0,
    fascistPolicies: 0,
    electionTracker: 0,
    onEndTerm: vi.fn(),
    ...overrides,
  };
  render(<GameScreen {...props} />);
  return props;
}

test("shows every player and the status text", () => {
  renderScreen();
  for (const name of NAMES) {
    expect(screen.getByText(name)).toBeInTheDocument();
  }
  expect(screen.getByText("Waiting for president to nominate a chancellor.")).toBeInTheDocument();
});

test("END TERM is disabled outside the post-legislative phase", () => {
  renderScreen();
  expect(screen.getByRole("button", { name: "END TERM" })).toBeDisabled();
});

test("END TERM is disabled for anyone but the president", () => {
  renderScreen({
    gameState: makeGameState(NAMES, { state: LobbyState.POST_LEGISLATIVE }),
    user: "Bob",
  });
  expect(screen.getByRole("button", { name: "END TERM" })).toBeDisabled();
});

test("the president ends the term with END TERM", () => {
  const props = renderScreen({
    gameState: makeGameState(NAMES, { state: LobbyState.POST_LEGISLATIVE }),
  });
  const button = screen.getByRole("button", { name: "END TERM" });
  expect(button).toBeEnabled();
  fireEvent.click(button);
  expect(props.onEndTerm).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd frontend && npm test -- --run src/game/GameScreen.test.tsx`
Expected: FAIL, cannot resolve `./GameScreen` (and `./testGameState`).

- [ ] **Step 4: Implement `makeGameState` and `GameScreen`.** `GameScreen` renders the header (`<header className="App-header">SECRET-HITLER.ONLINE</header>`) and the markup that sat between `EventBar` and the snackbar in `renderGamePage`, in the same order, with each inline style replaced by a class in `GameScreen.css` carrying the same declarations: `.game-screen` (`text-align: center`, from the old `.App` wrapper), `.game-players` (background), `.game-board-area` (`inline-block`), `.game-board-layout` (the column with `margin: 10px auto`), `.game-deck-row`, `.game-end-term` (`margin: auto auto`). The strip keeps `playerDisabledFilter={DISABLE_EXECUTED_PLAYERS}`; END TERM uses D1.

- [ ] **Step 5: Run it to verify it passes**

Run: `cd frontend && npm test -- --run src/game/GameScreen.test.tsx`
Expected: 4 passed.

- [ ] **Step 6: Switch `renderGamePage` to `GameScreen`.** It returns `<div className="App">` with `CustomAlert`, `EventBar`, `<GameScreen …/>` (props from `this.state`; `user={this.state.name}`, `showBusy={this.state.allAnimationsFinished}`, `onEndTerm` sends `{ command: WSCommandType.END_TERM }`), and the snackbar in a plain `<div>`. No `style=` remains in `renderGamePage`. Remove imports `App.tsx` no longer uses (`Board`, `Deck`, `StatusBar`, `PlayerPolicyStatus`, and any constant left unused).

- [ ] **Step 7: Run the whole frontend check**

Run: `cd frontend && npm test -- --run && npm run build`
Expected: every test file passes, including the 4 new tests; `tsc` and `vite build` finish without errors.

- [ ] **Step 8: Take the "after" screenshot** the same way as Step 1, into the scratchpad as `phase4-after-1920x1080.png`, and compare: same layout (roles, president and CPU moves differ between games). Check the console shows only the baseline warnings.

- [ ] **Step 9: Commit** (ticks the three Task 4.1 boxes and "Begin Task 4.1")

```bash
git add frontend/src/game frontend/src/App.tsx docs/PLAN.md
git commit -m "refactor(frontend): move the game page markup into GameScreen"
```

### Task 2 (PLAN 4.2): Seat geometry

**Files:**
- Create: `frontend/src/game/seatPositions.ts`
- Test: `frontend/src/game/seatPositions.test.ts`

**Interfaces:**
- Produces, in `seatPositions.ts`: `export type Seat = { x: number; y: number }`; `export function seatPositions(count: number, selfIndex = 0): Seat[]` (index `i` is the seat of `playerOrder[i]`); `export const TABLE_RADIUS_X = 42`, `TABLE_RADIUS_Y = 40`, `SEAT_HALF_SIZE = { x: 2.8, y: 8.5 }`, `CENTRE_BOX = { left: 29.5, right: 70.5, top: 23.5, bottom: 80.5 }`, `MIN_SEAT_DISTANCE = 20` (D2).

- [ ] **Step 1: Write the failing test** `frontend/src/game/seatPositions.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  CENTRE_BOX,
  MIN_SEAT_DISTANCE,
  SEAT_HALF_SIZE,
  Seat,
  TABLE_RADIUS_X,
  TABLE_RADIUS_Y,
  seatPositions,
} from "./seatPositions";

type Box = { left: number; right: number; top: number; bottom: number };

const seatBox = (s: Seat): Box => ({
  left: s.x - SEAT_HALF_SIZE.x,
  right: s.x + SEAT_HALF_SIZE.x,
  top: s.y - SEAT_HALF_SIZE.y,
  bottom: s.y + SEAT_HALF_SIZE.y,
});

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** Angle around the table in degrees; it grows clockwise on screen, where y points down. */
const screenAngle = (s: Seat) =>
  (Math.atan2((s.y - 50) / TABLE_RADIUS_Y, (s.x - 50) / TABLE_RADIUS_X) * 180) / Math.PI;

describe.each([5, 6, 7, 8, 9, 10])("%i players", (count) => {
  test("returns one seat per player", () => {
    expect(seatPositions(count, 0)).toHaveLength(count);
  });

  test("puts the local player at bottom centre", () => {
    for (let self = 0; self < count; self++) {
      const seats = seatPositions(count, self);
      expect(seats[self].x).toBeCloseTo(50);
      seats.forEach((seat, i) => {
        if (i !== self) expect(seat.y).toBeLessThan(seats[self].y);
      });
    }
  });

  test("seats players clockwise in playerOrder", () => {
    const seats = seatPositions(count, 2);
    for (let i = 0; i < count; i++) {
      const step = (screenAngle(seats[(i + 1) % count]) - screenAngle(seats[i]) + 360) % 360;
      expect(step).toBeCloseTo(360 / count);
    }
    // The next player after you sits to your left.
    expect(seats[3].x).toBeLessThan(50);
  });

  test("keeps every seat inside the table", () => {
    for (const box of seatPositions(count, 0).map(seatBox)) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(100);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.bottom).toBeLessThanOrEqual(100);
    }
  });

  test("keeps seats apart", () => {
    const seats = seatPositions(count, 0);
    seats.forEach((a, i) => {
      seats.slice(i + 1).forEach((b) => {
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(MIN_SEAT_DISTANCE);
        expect(overlaps(seatBox(a), seatBox(b))).toBe(false);
      });
    });
  });

  test("keeps seats clear of the centre box", () => {
    for (const seat of seatPositions(count, 0)) {
      expect(overlaps(seatBox(seat), CENTRE_BOX)).toBe(false);
    }
  });
});

test("seats a spectator, who has no seat of their own, as player 0", () => {
  expect(seatPositions(7)).toEqual(seatPositions(7, 0));
  expect(seatPositions(7, -1)).toEqual(seatPositions(7, 0));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npm test -- --run src/game/seatPositions.test.ts`
Expected: FAIL, cannot resolve `./seatPositions`.

- [ ] **Step 3: Implement `seatPositions`** with the formula in D2. `selfIndex` outside `0..count-1` becomes 0.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd frontend && npm test -- --run src/game/seatPositions.test.ts`
Expected: 37 passed (6 counts × 6 tests, plus the spectator test).

- [ ] **Step 5: Commit** (ticks the three Task 4.2 boxes)

```bash
git add frontend/src/game/seatPositions.ts frontend/src/game/seatPositions.test.ts docs/PLAN.md
git commit -m "feat(frontend): compute round-table seat positions"
```

### Task 3 (PLAN 4.4): No-scroll browser test

**Files:**
- Create: `frontend/playwright.config.ts`, `frontend/e2e/guests.ts`, `frontend/e2e/no-scroll.spec.ts`
- Modify: `frontend/vite.config.ts`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/.gitignore`, `.github/workflows/ci.yml`, `CLAUDE.md`

**Interfaces:**
- Consumes: class names Task 4 renders: `.game-screen` (exists from Task 1), `.table-seat` (one per player), `.game-centre` (its direct children are the boards, deck and status rows).
- Produces: `export async function joinGuests(baseURL: string, lobby: string, count: number): Promise<WebSocket[]>` in `e2e/guests.ts`; `npm run e2e`.

- [ ] **Step 1: Keep Vitest out of `e2e/`.** In `vite.config.ts`, `test.include: ["src/**/*.test.{ts,tsx}"]`. Run `npm test -- --run`; expected: same count as Task 2 ends with.

- [ ] **Step 2: Install Playwright.** `npm install --save-dev --save-exact @playwright/test@1.64.1`, then `npx playwright install chromium`. Script `"e2e": "playwright test"`. Add `/test-results`, `/playwright-report` and `/blob-report` to `frontend/.gitignore`.

- [ ] **Step 3: Write `playwright.config.ts`** as in D3:

```ts
import { defineConfig, devices } from "@playwright/test";

// The jar serves the built frontend and the game server on one port, as in production.
const PORT = 4545;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${PORT}` },
  webServer: {
    // Needs Java 17 for the Gradle wrapper.
    command:
      "npm run build && cd ../backend && ./gradlew jar && java -jar build/libs/secret-hitler-online.jar",
    url: `http://localhost:${PORT}/ping`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
```

- [ ] **Step 4: Write `e2e/guests.ts`** (`joinGuests`, D4). Guest `i` (1-based) is named `Long Guest ${i}` (12 characters, the form's maximum), connects to `ws://<host>/game?lobby=<lobby>&name=<name>`, waits for `open` (rejects on `error`), and sends `{ name, lobby, command: "select-icon", icon: "p" + (i + 1) }`; the host takes `p1`, the first portrait.

- [ ] **Step 5: Write the failing test** `e2e/no-scroll.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import { joinGuests } from "./guests";

const DESKTOP_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1920, height: 937 },
  { width: 1600, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
];

type Box = { left: number; right: number; top: number; bottom: number };

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

async function createLobby(page: Page, host: string): Promise<string> {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Your Name" }).last().fill(host);
  await page.getByRole("button", { name: "CREATE LOBBY" }).click();
  await page.locator("#icon.selectable:not(.disabled)").first().click();
  await page.getByRole("button", { name: "CONFIRM" }).click();
  const link = await page.locator("#linkText").inputValue();
  return new URL(link).searchParams.get("lobby")!;
}

function measureTable(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const centre = document.querySelector(".game-centre")!;
    return {
      seats: Array.from(document.querySelectorAll(".table-seat"), box),
      centre: box(centre),
      centreRows: Array.from(centre.children, box),
    };
  });
}

for (const players of [5, 7, 10]) {
  test(`${players} players fit every desktop size without scrolling`, async ({ page, baseURL }) => {
    const lobby = await createLobby(page, "Host Player");
    // CPU players only fill a lobby up to five, so larger tables need guests.
    const guests = players > 5 ? await joinGuests(baseURL!, lobby, players - 1) : [];
    try {
      await expect(page.getByText(`Players (${guests.length + 1}/10)`)).toBeVisible();
      await page.getByRole("button", { name: "START GAME" }).click();
      await expect(page.locator(".game-screen")).toBeVisible();
      // Prompts are overlays above the table; this test measures the table under them.
      await page.addStyleTag({ content: "#alert { display: none !important; }" });
      await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete));

      for (const size of DESKTOP_SIZES) {
        await page.setViewportSize(size);
        const at = `${size.width}x${size.height}`;
        const scroll = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        }));
        expect(scroll.height, `scrollHeight at ${at}`).toBeLessThanOrEqual(size.height);
        expect(scroll.width, `scrollWidth at ${at}`).toBeLessThanOrEqual(size.width);

        const table = await measureTable(page);
        expect(table.seats, `seats at ${at}`).toHaveLength(players);
        table.seats.forEach((seat, i) => {
          expect(seat.left, `seat ${i} left at ${at}`).toBeGreaterThanOrEqual(0);
          expect(seat.top, `seat ${i} top at ${at}`).toBeGreaterThanOrEqual(0);
          expect(seat.right, `seat ${i} right at ${at}`).toBeLessThanOrEqual(size.width);
          expect(seat.bottom, `seat ${i} bottom at ${at}`).toBeLessThanOrEqual(size.height);
          expect(overlaps(seat, table.centre), `seat ${i} overlaps the centre at ${at}`).toBe(false);
          table.seats.slice(i + 1).forEach((other, j) => {
            expect(overlaps(seat, other), `seats ${i} and ${i + 1 + j} overlap at ${at}`).toBe(false);
          });
        });
        for (const row of table.centreRows) {
          expect(row.left, `centre row left at ${at}`).toBeGreaterThanOrEqual(table.centre.left - 1);
          expect(row.right, `centre row right at ${at}`).toBeLessThanOrEqual(table.centre.right + 1);
          expect(row.top, `centre row top at ${at}`).toBeGreaterThanOrEqual(table.centre.top - 1);
          expect(row.bottom, `centre row bottom at ${at}`).toBeLessThanOrEqual(table.centre.bottom + 1);
        }
      }
    } finally {
      guests.forEach((ws) => ws.close());
    }
  });
}
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd frontend && JAVA_HOME=<Java 17> npm run e2e`
Expected: the server starts, all three lobbies reach START GAME, and all three tests FAIL on `scrollHeight at 1920x1080` (the current stacked layout is taller than the viewport). Any other failure (login, guests, START GAME) is a bug in the test: fix it before moving on.

- [ ] **Step 7: Add the `e2e` job to `ci.yml`** after `test`, and make `image` need both:

```yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-java@v6
        with:
          distribution: temurin
          java-version: "17"
      - uses: gradle/actions/setup-gradle@v6
      - uses: actions/setup-node@v7
        with:
          node-version: "24"
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - name: Install dependencies and Chromium
        working-directory: frontend
        run: npm ci && npx playwright install --with-deps chromium
      - name: Browser tests
        working-directory: frontend
        run: npm run e2e
```

`image:` gets `needs: [test, e2e]`.

- [ ] **Step 8: Update `CLAUDE.md`.** Layout: `frontend/src/game/` holds `GameScreen` (game page markup and the table grid), `TableSeats` and `seatPositions` (seat geometry, unit tested), and `frontend/e2e/` the Playwright tests. Commands table: `Browser tests (builds the frontend and the jar, serves it on 4545)` → `cd frontend && npx playwright install chromium && npm run e2e`, with Java 17 active. CI paragraph: the `e2e` job runs on every pull request, and images wait for it.

- [ ] **Step 9: Commit** (ticks the Task 4.4 boxes: the test, `ci.yml` and `CLAUDE.md`; reword the first box to "reaches 5 players with CPU players and 7 and 10 with WebSocket guests")

```bash
git add frontend/vite.config.ts frontend/package.json frontend/package-lock.json frontend/.gitignore frontend/playwright.config.ts frontend/e2e .github/workflows/ci.yml CLAUDE.md docs/PLAN.md
git commit -m "test(frontend): add the desktop no-scroll browser test"
```

### Task 4 (PLAN 4.3): Table layout

**Files:**
- Create: `frontend/src/game/TableSeats.tsx`, `frontend/src/game/TableSeats.css`, `frontend/src/game/TableSeats.test.tsx`, `frontend/src/player/PlayerDisplay.test.tsx`
- Modify: `frontend/src/player/PlayerDisplay.tsx`, `frontend/src/game/GameScreen.tsx`, `frontend/src/game/GameScreen.css`
- Unchanged on purpose: `Player.jsx`, `Player.css`, `Board.css`, `Deck.css`, `StatusBar.css`, `PlayerPolicyStatus.css`, `App.css` (Finding 2, 5)

**Interfaces:**
- Consumes: `seatPositions`, `CENTRE_BOX` (Task 2); `makeGameState` (Task 1); the class names Task 3's browser test measures.
- Produces: `export function usePlayerTiles(props: PlayerDisplayProps): JSX.Element[]` in `PlayerDisplay.tsx` (one tile per displayed player, in display order, including the label and the vote-reveal state; `PlayerDisplayProps` is exported); `export default function TableSeats(props: { gameState: GameState; user: string; showVotes: boolean; showBusy: boolean }): JSX.Element`.

- [ ] **Step 1: Pin `PlayerDisplay`'s rows before touching it.** `frontend/src/player/PlayerDisplay.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { makeGameState } from "../game/testGameState";
import PlayerDisplay from "./PlayerDisplay";

const SEVEN = ["Ann", "Ben", "Cat", "Dan", "Eve", "Fay", "Gus"];

test("prompts keep the row layout: seven players split into rows of 3 and 4", () => {
  const { container } = render(<PlayerDisplay user="Ann" gameState={makeGameState(SEVEN)} />);
  const rows = Array.from(container.querySelectorAll("#player-display-container"));
  expect(rows.map((row) => row.querySelectorAll("#player-container").length)).toEqual([3, 4, 0]);
});
```

Run: `cd frontend && npm test -- --run src/player/PlayerDisplay.test.tsx`
Expected: PASS (it records today's behaviour; it has to keep passing after Step 3).

- [ ] **Step 2: Write the failing test** `frontend/src/game/TableSeats.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { seatPositions } from "./seatPositions";
import TableSeats from "./TableSeats";
import { makeGameState } from "./testGameState";

const SEVEN = ["Ann", "Ben", "Cat", "Dan", "Eve", "Fay", "Gus"];

test("seats every player in playerOrder, with the user at bottom centre", () => {
  const { container } = render(
    <TableSeats gameState={makeGameState(SEVEN)} user="Dan" showVotes={false} showBusy />
  );
  const seats = Array.from(container.querySelectorAll<HTMLElement>(".table-seat"));
  const expected = seatPositions(7, 3);
  expect(seats).toHaveLength(7);
  seats.forEach((seat, i) => {
    expect(seat).toHaveTextContent(SEVEN[i]);
    expect(parseFloat(seat.style.left)).toBeCloseTo(expected[i].x);
    expect(parseFloat(seat.style.top)).toBeCloseTo(expected[i].y);
  });
  expect(parseFloat(seats[3].style.left)).toBeCloseTo(50);
  expect(parseFloat(seats[3].style.top)).toBeCloseTo(90);
});

test("marks the president and shows executed players as executed", () => {
  const gameState = makeGameState(SEVEN, { president: "Cat" });
  gameState.players["Eve"].alive = false;
  const { container } = render(
    <TableSeats gameState={gameState} user="Dan" showVotes={false} showBusy />
  );
  const seats = Array.from(container.querySelectorAll<HTMLElement>(".table-seat"));
  expect(seats[2]).toHaveTextContent("PRESIDENT");
  expect(seats[4]).toHaveTextContent("EXECUTED");
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd frontend && npm test -- --run src/game/TableSeats.test.tsx`
Expected: FAIL, cannot resolve `./TableSeats`.

- [ ] **Step 4: Move the tile logic into `usePlayerTiles`.** Everything in `PlayerDisplay` above the row split (defaults, vote-reveal state and timers, busy set, role visibility, the tile markup) moves into the hook, which returns all tiles (`start` 0); `PlayerDisplay` calls it and slices the result into the same three `#player-display-container` rows with the same `div1`/`div2` rule.

- [ ] **Step 5: Implement `TableSeats`.** `<div className="table-seats">` with one `<div className="table-seat" key={name} style={{ left: x + "%", top: y + "%" }}>` per tile from `usePlayerTiles({ gameState, user, showVotes, showBusy, playerDisabledFilter: DISABLE_EXECUTED_PLAYERS })`, positions from `seatPositions(playerOrder.length, playerOrder.indexOf(user))`. `TableSeats.css`:

```css
.table-seats { position: absolute; inset: 0; }

/* The default tile (16vh wide at desktop sizes) scaled to 9vh; seatPositions' SEAT_HALF_SIZE assumes this. */
.table-seat {
    --seat-scale: 0.5625;
    position: absolute;
    transform: translate(-50%, -50%) scale(var(--seat-scale));
}

/* Reserve the PRESIDENT / CHANCELLOR row on every seat so a seat never moves when it changes. */
.table-seat #player-display-label { display: block; min-height: 1.2em; line-height: 1.2; }
```

- [ ] **Step 6: Run the unit tests**

Run: `cd frontend && npm test -- --run src/game src/player`
Expected: all pass, including `PlayerDisplay.test.tsx` unchanged.

- [ ] **Step 7: Lay out `GameScreen` as the table.** Markup: header; `.game-table` holding `<TableSeats/>` and `.game-centre` (inline `left`, `right`, `top`, `bottom` from `CENTRE_BOX`, `right = 100 - CENTRE_BOX.right`, `bottom = 100 - CENTRE_BOX.bottom`), whose three children are `.game-boards` (`Board`), `.game-decks` (draw `Deck`, `PlayerPolicyStatus`, discard `Deck`) and `.game-status` (`StatusBar`, END TERM). `GameScreen.css` replaces Task 1's classes; starting values:

```css
.game-screen { display: grid; grid-template-rows: auto minmax(0, 1fr); height: 100dvh; text-align: center; }
.game-screen > header { min-height: 0; padding: 0.4vh 0; font-size: clamp(18px, 3.4vh, 40px); line-height: 1.15; }
.game-table { position: relative; }
.game-centre { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 1vh; }

/* Both boards fit the space the deck and status rows leave: two 1683x650 boards plus 16px of margins. */
.game-boards { flex: 1 1 0; min-height: 0; width: 100%; container-type: size;
               display: flex; align-items: center; justify-content: center; }
.game-boards #board { display: block; min-width: 0; max-width: none;
                      width: min(100cqw - 20px, (100cqh - 16px) * 1.2946); }

.game-decks { --deck-width: clamp(40px, 7vh, 80px); display: flex; align-items: center; gap: 2vh; }
.game-decks #deck-container, .game-decks #deck-base { width: var(--deck-width); }
.game-decks #deck-card-count { font-size: calc(var(--deck-width) * 0.25); }
.game-decks #pps-container { margin: 0; padding: 0.8vh 1.2vh; }
.game-decks #pps-text { font-size: clamp(9px, 1.4vh, 16px); }
.game-decks #pps-icon { width: 3vh; height: 3vh; }
.game-decks #pps-icon-number { font-size: clamp(11px, 2vh, 22px); }

.game-status { display: flex; align-items: center; gap: 1.5vh; width: 100%; }
.game-status #status-bar { flex: 1; min-height: 0; }
.game-status #status-bar-text { padding: 0.8vh 8px; font-size: clamp(12px, 2vh, 22px); }
.game-status button { margin: 0 0 5px; padding: 0.8vh 2.2vh; font-size: clamp(14px, 2.6vh, 30px); }
```

The deck and policy-status overrides keep each part's proportions (`#deck-card-count` is a quarter of the deck's width, as 3.5vmin is of 14vmin). These values may be tuned while the browser test is red; the seat scale and `CENTRE_BOX` may not, unless `seatPositions.ts` and its test change with them.

- [ ] **Step 8: Run the browser test to verify it passes**

Run: `cd frontend && JAVA_HOME=<Java 17> npm run e2e`
Expected: 3 passed (5, 7 and 10 players, five sizes each).

- [ ] **Step 9: Check it by eye.** Against `runLocal` + `npm run dev`, screenshot a 5-player game at 1920x1080 and 1280x720 into the scratchpad: seats around the boards, labels, busy icons and the role prompt over the table. Console: only the baseline warnings.

- [ ] **Step 10: Run the whole frontend check**

Run: `cd frontend && npm test -- --run && npm run build`
Expected: all pass; build clean.

- [ ] **Step 11: Commit** (ticks the five Task 4.3 boxes; its file list in `PLAN.md` becomes this task's)

```bash
git add frontend/src/game frontend/src/player docs/PLAN.md
git commit -m "feat(frontend): seat players around the boards on a round table"
```

### Task 5: Phase 4 acceptance

**Files:**
- Modify: `docs/PLAN.md`

- [ ] **Step 1: Full suite.** `cd frontend && npm test -- --run && npm run build && npm run e2e`, and `cd backend && ./gradlew test` (Java 17). Expected: all green; `npm run e2e` 3 passed.

- [ ] **Step 2: Drive a 7-player game to a victory.** A throwaway Playwright script in the scratchpad (never in the repo) opens seven browser contexts at 1920x1080 against `runLocal` + `npm run dev`, joins them to one lobby, and plays: everyone votes JA, presidents discard a liberal and chancellors enact a fascist policy when they can, and power prompts pick a living player who is not the president. At 7 players the second fascist policy gives an investigation, the third a special election, the fourth and fifth executions, and the game ends in a fascist victory. Screenshot over the table, into the scratchpad: the vote reveal, a policy enactment, the investigation, the special election, an execution and the victory. Collect console warnings and errors from all seven pages.

- [ ] **Step 3: Review.** Show the user the screenshots and the console findings (anything beyond `CLAUDE.md`'s baseline is a finding). Tick "`npm run e2e` passes…" now, and "Vote reveal, … display correctly over the table" once the user agrees.

- [ ] **Step 4: Commit and open the PR**

```bash
git add docs/PLAN.md
git commit -m "docs(plan): record phase 4 acceptance checks"
git push -u origin phase-4-round-table
gh pr create --repo jussaw/Secret-Hitler-Online --base development --title "Phase 4: round-table game screen" --body "…"
```

Ask the user before merging. The user ticks "deployed image checked on a real 1080p monitor" after the deploy.
