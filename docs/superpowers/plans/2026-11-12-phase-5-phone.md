# Phase 5: Phone Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The game is playable on a phone in portrait, with vertical scrolling allowed, and nothing overflows horizontally at 360px width.

**Architecture:** One media query, `(max-width: 768px), (aspect-ratio < 5/4)`, switches the game screen from the round table to a stacked page: a wrapping grid of player tiles, then status and END TERM, the boards at full width, the decks. It is CSS only. Setting the seats and the centre box to `position: static` makes their inline `left`/`top`/`right`/`bottom` inert, so no hook, no `!important` and no change to the tested geometry are needed. Prompts move into a fixed overlay whose box scrolls inside itself, so a prompt always opens on screen and never grows the page. Playwright gains two phone projects (Galaxy S8 and Pixel 7 emulation) and a scripted game socket that opens every prompt from a known game state.

**Tech Stack:** React 18, TypeScript 5, Vite 8, Vitest 5 · `@playwright/test` 1.64.1 (Chromium, `page.routeWebSocket`) · Java 17 jar from the Gradle 7.4.2 wrapper · GitHub Actions.

Parent plan: [`docs/PLAN.md`](../../PLAN.md), Phase 5. Spec: [`docs/superpowers/specs/2026-11-11-self-hosted-fork-design.md`](../specs/2026-11-11-self-hosted-fork-design.md), section "5. Phone layout".

## Global Constraints

- Phone acceptance sizes: 360x740, 412x915. Desktop acceptance sizes: 1920x1080, 1920x937, 1600x900, 1366x768, 1280x720.
- Below 768px width, `GameScreen` switches to a stacked layout: compact player grid, status, boards scaled to width, decks. Scrolling is allowed there.
- Acceptance: no horizontal scroll at 360x740 and 412x915 on login, lobby, game and each prompt. `npm run e2e` still passes at all five desktop sizes for 5, 7 and 10 players.
- The desktop table looks the same as it does now. The WebSocket protocol does not change. No new art.
- Touch targets on phones are at least 44x44 CSS px.
- Do not fix the baseline issues in `CLAUDE.md` (#4, #5, #8, #9, #10, #13) or the 30 s WebSocket idle timeout. Ask the user first if this phase has to touch their code. Anything that drives a game keeps every socket pinging (about every 10 s).
- Java 17 for Gradle and `npm run e2e` (`JAVA_HOME=$HOME/.sdkman/candidates/java/17.0.8-zulu` locally). Lockfile changes use `npx npm@11.21.1`.
- Commits follow Conventional Commits with a scope (`frontend`, `ci`, `plan`, `claude`); tick each `docs/PLAN.md` box in the same commit as its work.
- Ask the user before merging the PR. The user ticks "one full game played on a real phone against the deployed instance".

## Findings from the re-read

Measured against `./gradlew runLocal` and `npm run dev` with Playwright's Chromium; screenshots are in the session scratchpad.

1. **Inline positions.** `TableSeats.tsx` sets each `.table-seat`'s `left`/`top` from `seatPositions()`, and `GameScreen.tsx` sets `.game-centre`'s `left`/`right`/`top`/`bottom` from `centreBox()`. Offsets have no effect on a `position: static` box, so a media query can switch layouts without `!important` and without touching the inline styles.
2. **Seats are the default tile scaled by `transform: scale(0.5625)`** in `TableSeats.css`; board, deck and status sizes are overrides scoped in `GameScreen.css`. `Player.css` was never changed. On a phone the default tile is `min(20vmin, 16vh)` wide: 72px at 360x740 and 82.4px at 412x915. With 4px margins, four tiles fit a row at both sizes, and everything inside a tile keeps its proportions.
3. **Today's phone game screen** is the round table squeezed into 100dvh. At 360x740 the boards are about 128px wide, the status bar is a 25px column, and the decks overlap the lower seats. Nothing crosses the right edge.
4. **Login, lobby and every prompt already fit 360px.** No element crosses the right edge, and `body.scrollWidth` is 360 on the login page, the lobby with 10 players, the icon picker, and all prompts listed in D6. `#alert-box`'s `min-width: 80vmin` makes it 348px wide at 360 and 390px at 412, which is already near-full width.
5. **`scrollWidth <= innerWidth` cannot fail here.** `App.css` sets `overflow-x: hidden` on both `html` and `body`. `body` then clips, so `document.documentElement.scrollWidth` stays at the viewport width even with a 500px-wide element on the page; only `document.body.scrollWidth` reports 500. Phase 4's desktop check has the same hole. Clipped content is still a defect, so the tests measure `body.scrollWidth` and scan for elements past the right edge.
6. **Touch targets under 44px on phones:** the three login text fields (32px tall at 360, 34px at 412), END TERM at 360x740 (35px), and the lobby's read-only invite-link box (37px and 41px; COPY is the control). Prompt buttons are 44.4px tall at 360 (`calc(6px + 4vmin)` text), so they pass only just. Player tiles in prompts (66px or wider), vote cards (108x74), policy cards (72x100) and portraits in the icon picker (65px) pass.
7. **A prompt opens at the top of the document.** `#alert` is `position: absolute` and `#alert-box` sits at `top: 10vh`. Once the phone page scrolls, a prompt that opens while the player is scrolled down to the boards appears above the screen.
8. **Tall prompts grow the desktop page.** With ten players, at 1920x1080 the nomination, investigation, special election, execution and victory prompts end at y 1200-1436 (RETURN TO LOBBY at 1398). At 1280x720 the vote prompt does too, and the 9-tile pickers end near y 1059 when about 638px is available. Making them fit without scrolling would mean redesigning prompt contents (Decision D4).
9. **The round table needs about 5:4.** At 1080px tall the diagonal seats overlap the centre box at aspect 1.15 and below; at 768px tall, at 1.2 and below. From 600 to 1200px tall, 1.25 and wider has no overlaps for 5, 7 or 10 players. Every desktop acceptance size is 16:9 or wider.
10. **The 1px seat move is baseline alignment.** `#player-display-text-container` is `inline-block`. Once its label holds a line of text, its baseline moves and the seat's line box grows by about 4px before scaling, which moves the centred seat by 1.12px. `vertical-align: top` on that container brings the movement to 0.01px at 1920x1080 and 1280x720.
11. **Playwright can script the game socket.** `page.routeWebSocket` (1.48+) stands in for `/game`, `page.route` answers `/new-lobby`, and a spec can import `makeGameState` and `LobbyState` from `src/` (checked with a throwaway spec). Packets are what `Lobby.updateUser` sends: the converter's fields plus `type: "game"` and `icon`.
12. **Prompt triggers** (`App.tsx` `onGameStateChanged` and `onWebSocketMessage`): role reveal on the first CHANCELLOR_NOMINATION with no policies and tracker 0; a policy-enacted alert whenever policy counts change in POST_LEGISLATIVE, a power state or a policy victory; the election-tracker alert only when such a state also moves the tracker (in practice the third failed election). So each fixture sets counts that open only its own prompt.
13. **Device presets.** `devices["Galaxy S8"]` is 360x740 (DPR 3, touch, mobile). `devices["Pixel 7"]` is 412x839, so the 412x915 project overrides the viewport.

## Decisions

**D1. The switch.** `@media (max-width: 768px), (aspect-ratio < 5/4)` in `GameScreen.css` (table and centre) and `TableSeats.css` (seats), with a comment in each naming the other. The width clause is the spec's phone breakpoint. The aspect clause covers desktop windows too narrow for the round table (Finding 9), such as 960x1080, and portrait tablets. Vite's minifier writes the whole list in range syntax (`(width<=768px),(aspect-ratio<5/4)`) whichever form the source uses, so the stacked layout needs range-syntax media queries (Safari 16.4, Chrome 104, Firefox 63), the same generation as the container queries Phase 4 already relies on. No React hook and no `matchMedia`; `seatPositions` and `centreBox` and their tests stay as they are. `no-scroll.spec.ts` asserts that seats are `position: absolute` at its five sizes, and a window-shape test pins the boundary: 960x1080 and 1279x1024 stack, 1280x1024 keeps the round table with no overlaps.

**D2. Stacked order and sizes.** Under the query, `.game-screen` becomes `display: block; height: auto`, so the page scrolls; the desktop grid keeps `height: 100dvh` and the no-scroll test keeps its guarantee. `.game-table` is a column with 8px side padding and 12px gaps:

1. `.table-seats`: a centred, wrapping row of seats. Each seat is the default tile plus 4px margins (`--seat-width: calc(min(20vmin, 16vh) + 8px)`), and the row is `--seat-columns` seats wide. `seatColumns(count)` returns `ceil(count / ceil(count / 4))`: 5→3, 6→3, 7→4, 8→4, 9→3, 10→4, so rows are 3+2, 3+3, 4+3, 4+4, 3+3+3, 4+4+2. The label row stays reserved.
2. `.game-status` (`order: -1` inside `.game-centre`): status text and END TERM, with END TERM at least 44px tall.
3. `.game-boards`: `container-type: inline-size`, `#board` at `100cqw - 20px` (full width minus `#board-group`'s margins), with `.game-centre` capped at 720px so a narrow desktop window does not get 900px boards.
4. `.game-decks`: decks at `clamp(56px, 16vw, 96px)`, policy-status text at 12px.

At 360x740 with ten players, that is about 375px of tiles (three rows) and roughly 900px in all.

**D3. Tiles keep their phone size.** The grid uses the same 72px (360) and 82px (412) tiles as the lobby and the prompts, so twelve-character names stay readable (8px text, the clamp's floor). The more compact alternative, five per row at 0.8 scale (two rows for ten players), would draw names at about 6.4px.

**D4. Prompts.** On every size, `#alert` becomes `position: fixed; inset: 0`. `#alert-box` keeps `top: 10vh`, its width and its padding, and gains `max-height: calc(100% - 10vh - 50px)`, `overflow-y: auto` and `overscroll-behavior: contain`. Short prompts look exactly as before. A prompt opens on screen whatever the scroll position (Finding 7). A prompt taller than the window scrolls inside its box instead of growing the page, so its button is reachable and the desktop page never scrolls. Making the tall desktop prompts fit with no scrolling at all is out of scope (Finding 8); it is a content redesign, and PLAN.md records it as deferred.

**D5. Touch targets.** On phones every visible `button`, `input` and `.selectable` (player tiles in prompts, vote cards, policy cards, portraits) is at least 44x44 CSS px. Excluded: the read-only invite-link `textarea` (COPY is its control), inline text links (the WCAG 2.5.8 inline exception), and table seats, which are not interactive. Fixes: END TERM in the stacked layout (D2), and `@media (max-width: 768px) { button, input { min-height: 44px } }` in `App.css`, with `input` switched to `box-sizing: border-box` there so it does not grow past 44px. The helper `smallTargets(page, scope)` lists every offender as `tag#id "text" WxH`, and the tests expect it to return `[]`.

**D6. Prompts in the browser tests: all of them.** The spec says each prompt. A scripted socket (`e2e/fakeGame.ts`) opens each one deterministically from a `makeGameState` fixture with ten players and twelve-character names, using the longest variant: role reveal (fascist at 10, with teammates), nomination, vote (both warnings), president's and chancellor's legislative prompts (with VETO), veto, peek, the three pickers (investigate, special election, execution), the investigation card, the three results (special election, execution, investigation), "you have been executed", policy enacted, election tracker, and victory. The icon picker opens through the real server in the lobby test. `prompts.spec.ts` runs on all three projects: phones check overflow, position and touch targets; desktop checks all five sizes for page growth and a reachable button.

**D7. Emulation and helpers.** `playwright.config.ts` defines three projects: `desktop` (`Desktop Chrome`, runs `no-scroll` and `prompts`), `phone-360` (`Galaxy S8`) and `phone-412` (`Pixel 7` at 412x915), both of which run `phone` and `prompts`. Emulation is mobile with touch and a real DPR, so Chromium applies the viewport meta tag as a phone does; overflow is measured against the configured width. Shared helpers:
- `e2e/lobby.ts` replaces `e2e/guests.ts`: `createLobby` (moved from `no-scroll.spec.ts`), `joinGuests` (now pinging every 10 s until closed), `startGame`, `settle`.
- `e2e/layout.ts`: `box`, `overflowX`, `smallTargets`, `labelShift`.
- `e2e/fakeGame.ts`: the scripted socket and the prompt fixtures.

**D8. Phase 4's deferred minors all fold in.** `settle()` awaits `document.fonts.ready` (Task 1). A label filling no longer moves its seat (Task 1, Finding 10). `TableSeats` places each tile by its own player name instead of by index (Task 1; refactor, covered by the existing test). CI keeps the HTML report and traces of a failed run (Task 3). Also folded: the desktop `scrollWidth` check measures `body.scrollWidth` (Finding 5).

**D9. Order.** Each task writes its browser test first and watches it fail, so every task ends green. PLAN's numbering stays, but its 5.3 test is built inside Tasks 1 and 2; Task 3 adds CI, docs and acceptance.

**D10. Out of scope.** Landscape phones: 740x360 stacks through the width clause; 915x412 keeps a cramped round table. Fitting tall desktop prompts without scrolling (D4). The baseline issues and the idle timeout.

## Review Focus

1. A prompt that opens while the phone page is scrolled down must appear on screen, with its button reachable. Task 2 test: "a prompt that opens while the page is scrolled is on screen".
2. A desktop prompt taller than the window must not make the page scroll, and its button must still be reachable at every desktop size. Task 2 desktop branch of `prompts.spec.ts`.
3. PRESIDENT/CHANCELLOR filling a label must not move a seat in either layout, and twelve-character names must stay on the nameplate at 4 per row. `labelShift` in Task 1 (desktop and phone), plus the acceptance screenshots.
4. Windows on either side of the breakpoint (960x1080, 1279x1024, 1280x1024) get the right layout with no overlap and no horizontal overflow. Task 1 window-shape test.
5. The vote reveal, busy icons and EXECUTED overlay stay visible on phone tiles. The TableSeats unit test covers EXECUTED; the Task 3 acceptance drive screenshots the vote reveal and an execution at 360x740.

## File map

| File | Change | Task |
|---|---|---|
| `frontend/playwright.config.ts` | three projects; trace and report on failure | 1, 3 |
| `frontend/e2e/guests.ts` → `frontend/e2e/lobby.ts` | shared lobby helpers; guests ping | 1 |
| `frontend/e2e/layout.ts` | new: measurement helpers | 1 |
| `frontend/e2e/no-scroll.spec.ts` | imports, `body.scrollWidth`, round-table check, `settle`, `labelShift`, window-shape test | 1 |
| `frontend/e2e/phone.spec.ts` | new: game (Task 1), login and lobby (Task 2) | 1, 2 |
| `frontend/src/game/seatPositions.ts`, `seatPositions.test.ts` | `seatColumns` | 1 |
| `frontend/src/game/TableSeats.tsx`, `TableSeats.test.tsx` | `--seat-columns`; tiles placed by name | 1 |
| `frontend/src/game/TableSeats.css`, `GameScreen.css` | stacked layout; label fix | 1 |
| `frontend/e2e/fakeGame.ts`, `frontend/e2e/prompts.spec.ts` | new | 2 |
| `frontend/src/custom-alert/CustomAlert.css` | fixed overlay, box scrolls | 2 |
| `frontend/src/App.css` | phone touch-target minimum | 2 |
| `.github/workflows/ci.yml` | upload the report and traces on failure | 3 |
| `CLAUDE.md` | e2e projects, scripted socket, phone breakpoint | 3 |
| `docs/PLAN.md` | ticks; Phase 5 wording follows this breakdown | 1-3 |

---

### Task 1 (PLAN 5.1): Stacked game layout

**Files:**
- Create: `frontend/e2e/lobby.ts` (from `frontend/e2e/guests.ts`, deleted), `frontend/e2e/layout.ts`, `frontend/e2e/phone.spec.ts`
- Modify: `frontend/playwright.config.ts`, `frontend/e2e/no-scroll.spec.ts`, `frontend/src/game/seatPositions.ts`, `seatPositions.test.ts`, `TableSeats.tsx`, `TableSeats.test.tsx`, `TableSeats.css`, `GameScreen.css`
- Unchanged on purpose: `Player.css`, `PlayerDisplay.*`, `GameScreen.tsx` (Findings 1, 2)

**Interfaces:**
- Produces, in `e2e/lobby.ts`: `createLobby(page: Page, host: string): Promise<string>` (as today); `joinGuests(baseURL: string, lobby: string, count: number): Promise<WebSocket[]>` (as today, plus a `ping` command every 10 s, cleared on `close`); `startGame(page: Page, baseURL: string, players: number): Promise<WebSocket[]>` (create the lobby as "Host Player", add `players - 1` guests when `players > 5`, wait for `Players (n/10)`, START GAME, wait for `.game-screen`; returns the guests); `settle(page: Page): Promise<void>` (hides `#alert` and stops transitions and animations, as no-scroll does today, then awaits `document.fonts.ready` and every image's `complete`).
- Produces, in `e2e/layout.ts`: `type Box = { left; right; top; bottom }`; `overflowX(page): Promise<{ scrollWidth: number; offscreen: string[] }>` (`scrollWidth` is the larger of `html`'s and `body`'s; `offscreen` lists visible elements reaching more than 1px past either side of the viewport); `smallTargets(page, scope: string): Promise<string[]>` (D5); `labelShift(page): Promise<number>` (fills every empty `.table-seat #player-display-label` with "CHANCELLOR" and every full one with "", returns the largest seat-box movement in px, and restores the text).
- Produces, in `seatPositions.ts`: `export const MAX_GRID_COLUMNS = 4; export function seatColumns(count: number): number`.
- Consumes: `seatPositions`, `centreBox`, `makeGameState`, and the class names `.game-screen`, `.table-seat`, `.game-centre`, `.game-status`, `.game-boards`, `.game-decks`, `#board-container`.

- [ ] **Step 1: "Before" screenshots.** Already taken during planning, in the scratchpad: `shots/before-mobile-{360x740,412x915}-{login,icons,lobby-5p,lobby-10p,role-5p,role-10p,game-5p,game-10p}.png` (real games), and deterministic desktop tables `shots/desktop-before-{5,7,10}p-<size>.png` from a scripted socket (`desktopshots.cjs`; two runs differ by 0 pixels).

- [ ] **Step 2: Unit test for `seatColumns`**, appended to `seatPositions.test.ts`:

```ts
test.each([
  [5, 3], [6, 3], [7, 4], [8, 4], [9, 3], [10, 4],
])("%i players sit %i to a row on a phone", (count, columns) => {
  expect(seatColumns(count)).toBe(columns);
  expect(seatColumns(count)).toBeLessThanOrEqual(MAX_GRID_COLUMNS);
});
```

And in `TableSeats.test.tsx`, a test that the seats carry the column count: `.table-seats`' `style.getPropertyValue("--seat-columns")` is `"4"` for `SEVEN`.

- [ ] **Step 3: Run them to verify they fail.** `cd frontend && npm test -- --run src/game`. Expected: FAIL, `seatColumns` is not exported, and `--seat-columns` is `""`.

- [ ] **Step 4: Implement `seatColumns`** (D2 formula) and set `style={{ "--seat-columns": seatColumns(count) } as CSSProperties}` on `.table-seats`. In the same edit, place each tile by its own player: `const name = String(tile.key)`, use it as the seat's `key`, and use `seats[gameState.playerOrder.indexOf(name)]` for its position (D8).

- [ ] **Step 5: Run the unit tests.** `cd frontend && npm test -- --run`. Expected: all pass, including the existing TableSeats position test.

- [ ] **Step 6: Projects and helpers.**
  - `playwright.config.ts` gets `projects`: `{ name: "desktop", use: devices["Desktop Chrome"], testIgnore: /phone\.spec/ }`, `{ name: "phone-360", use: devices["Galaxy S8"], testIgnore: /no-scroll\.spec/ }`, `{ name: "phone-412", use: { ...devices["Pixel 7"], viewport: { width: 412, height: 915 } }, testIgnore: /no-scroll\.spec/ }`. The top-level `use` keeps only `baseURL`.
  - Move `guests.ts` to `lobby.ts` with the Interfaces above (`git mv`, then edit).
  - Write `layout.ts`.
  - `no-scroll.spec.ts` imports `createLobby`/`startGame`/`settle` from `./lobby`, and `scroll.width` becomes `overflowX(page).scrollWidth`.

- [ ] **Step 7: Write the failing tests.**

In `no-scroll.spec.ts`, inside the per-size loop, add:

```ts
const positions = await page.$$eval(".table-seat", (seats) =>
  seats.map((s) => getComputedStyle(s).position)
);
expect(new Set(positions), `the round table at ${at}`).toEqual(new Set(["absolute"]));
expect(await labelShift(page), `a filled label moves a seat at ${at}`).toBeLessThanOrEqual(0.5);
```

Also add a window-shape test, with 10 players:

```ts
test("windows narrower than 5:4 stack the table; 5:4 keeps the round table", async ({ page, baseURL }) => {
  const guests = await startGame(page, baseURL!, 10);
  try {
    await settle(page);
    for (const [size, layout] of [
      [{ width: 960, height: 1080 }, "static"],
      [{ width: 1279, height: 1024 }, "static"],
      [{ width: 1280, height: 1024 }, "absolute"],
    ] as const) {
      await page.setViewportSize(size);
      const at = `${size.width}x${size.height}`;
      const table = await measureTable(page);
      const positions = await page.$$eval(".table-seat", (s) => s.map((e) => getComputedStyle(e).position));
      expect(new Set(positions), `layout at ${at}`).toEqual(new Set([layout]));
      expect((await overflowX(page)).offscreen, `overflow at ${at}`).toEqual([]);
      for (const [i, seat] of table.seats.entries()) {
        expect(overlaps(seat, table.boards), `seat ${i} over the boards at ${at}`).toBe(false);
      }
    }
  } finally {
    guests.forEach((ws) => ws.close());
  }
});
```

`phone.spec.ts` (phone projects; the viewport comes from the project):

```ts
for (const players of [5, 10]) {
  test(`${players} players get the stacked game screen`, async ({ page, baseURL }) => {
    const { width } = page.viewportSize()!;
    const guests = await startGame(page, baseURL!, players);
    try {
      await settle(page);
      const positions = await page.$$eval(".table-seat", (s) => s.map((e) => getComputedStyle(e).position));
      expect(new Set(positions)).toEqual(new Set(["static"]));

      const overflow = await overflowX(page);
      expect(overflow.scrollWidth).toBeLessThanOrEqual(width);
      expect(overflow.offscreen).toEqual([]);

      const rows = await page.evaluate(() => {
        const r = (sel: string) => {
          const b = document.querySelector(sel)!.getBoundingClientRect();
          return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
        };
        return {
          seats: Array.from(document.querySelectorAll(".table-seat"), (e) => {
            const b = e.getBoundingClientRect();
            return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
          }),
          status: r(".game-status"),
          boards: r("#board-container"),
          decks: r(".game-decks"),
        };
      });
      // Players, then status and END TERM, then the boards, then the decks.
      expect(Math.max(...rows.seats.map((s) => s.bottom))).toBeLessThanOrEqual(rows.status.top + 1);
      expect(rows.status.bottom).toBeLessThanOrEqual(rows.boards.top + 1);
      expect(rows.boards.bottom).toBeLessThanOrEqual(rows.decks.top + 1);
      expect(rows.boards.right - rows.boards.left).toBeGreaterThanOrEqual(width - 24);
      rows.seats.forEach((a, i) =>
        rows.seats.slice(i + 1).forEach((b, j) =>
          expect(overlaps(a, b), `seats ${i} and ${i + 1 + j}`).toBe(false)
        )
      );

      expect(await smallTargets(page, ".game-screen")).toEqual([]);
      expect(await labelShift(page)).toBeLessThanOrEqual(0.5);
    } finally {
      guests.forEach((ws) => ws.close());
    }
  });
}
```

(`overlaps` moves into `layout.ts` with `Box`.)

- [ ] **Step 8: Run them to verify they fail.** `cd frontend && JAVA_HOME=<Java 17> npm run e2e`. Expected:
  - desktop: the three no-scroll tests FAIL on "a filled label moves a seat" (about 1.1px), and the window-shape test FAILS on "layout at 960x1080";
  - phone-360 and phone-412: both game tests FAIL on the first expectation (`absolute`, not `static`).
  
  Any other failure (lobby, guests, START GAME, fonts) is a bug in the test; fix it first.

- [ ] **Step 9: Implement.**
  - `TableSeats.css`: `.table-seat #player-display-text-container { vertical-align: top; }` at every size (Finding 10).
  - `TableSeats.css`, the seats block under D1's query:

```css
@media (max-width: 768px), (aspect-ratio < 5/4) {
    .table-seats {
        --seat-width: calc(min(20vmin, 16vh) + 8px); /* the default tile and its 4px margins */
        position: static;
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        width: calc(var(--seat-columns) * var(--seat-width));
        max-width: 100%;
        margin: 0 auto;
    }
    /* Static seats ignore the inline left/top that place them on the round table. */
    .table-seat { position: static; transform: none; width: var(--seat-width); }
    .table-seat #player-container { margin: 4px; }
    .table-seat #player-display-label { width: auto; }
}
```

  - `GameScreen.css`, the table block under the same query: `.game-screen { display: block; height: auto }`; `.game-table { display: flex; flex-direction: column; gap: 12px; padding: 8px 8px 24px }`; `.game-centre { position: static; gap: 12px; width: 100%; max-width: 720px; margin: 0 auto }`; `.game-status { order: -1 }`; `.game-boards { flex: none; container-type: inline-size }`; `.game-boards #board { width: calc(100cqw - 20px) }`; `.game-decks { --deck-width: clamp(56px, 16vw, 96px) }`; `.game-decks #pps-text { font-size: 12px }`; `.game-status button { min-height: 44px; padding: 8px 16px; font-size: 20px }`.
  
  Values other than the breakpoint, the seat width and the order may be tuned while the test is red.

- [ ] **Step 10: Run the browser tests to verify they pass.** `cd frontend && JAVA_HOME=<Java 17> npm run e2e`. Expected: desktop 4 passed (5, 7 and 10 players, and the window shapes); phone-360 and phone-412 2 passed each.

- [ ] **Step 11: "After" screenshots and the desktop diff.**
  - Rerun `measure.cjs after mobile` (360x740 and 412x915, 5 and 10 players) and look at them: seats in rows, then status, then boards, then decks; names on their nameplates.
  - Rerun `desktopshots.cjs after` and `compare -metric AE` each image against `desktop-before-*`. Expected: only the label fix's movement (≤ 2px around the seats that have a label), nothing else.
  - Console: only the baseline warnings.

- [ ] **Step 12: Whole frontend check.** `cd frontend && npm test -- --run && npm run build`. Expected: all pass; build clean.

- [ ] **Step 13: Commit.** This ticks "Begin Task 5.1" and the first Task 5.1 box, reworded to D1/D2: "Under `(max-width: 768px), (aspect-ratio < 5/4)`, seats render as a wrapping grid instead of ellipse positions; then status and END TERM, boards at full width, decks". The touch-target box moves to Task 5.2, where its test lands. Task 5.1's file list follows this task.

```bash
git add frontend/playwright.config.ts frontend/e2e frontend/src/game docs/PLAN.md
git commit -m "feat(frontend): stack the game screen on phones and narrow windows"
```

### Task 2 (PLAN 5.2): Login, lobby and prompts on a phone

**Files:**
- Create: `frontend/e2e/fakeGame.ts`, `frontend/e2e/prompts.spec.ts`
- Modify: `frontend/e2e/phone.spec.ts`, `frontend/e2e/layout.ts` (`DESKTOP_SIZES`), `frontend/e2e/no-scroll.spec.ts` (imports it), `frontend/src/custom-alert/CustomAlert.css`, `frontend/src/App.css`

**Interfaces:**
- Consumes: `lobby.ts`, `layout.ts` (Task 1); `makeGameState` (`src/game/testGameState.ts`), `LobbyState` (`src/types`).
- Produces, in `e2e/fakeGame.ts`: `TEN: string[]` (`"Host Player"` then `"Long Guest 1"`…`"Long Guest 9"`); `type FakeGame = { send(packet: object): void }`; `openFakeGame(page: Page): Promise<FakeGame>`, which answers `/new-lobby` with `FAKE`, routes `/game` to a script that ignores the client's messages, fills the form as "Host Player", clicks CREATE LOBBY, and sends `{ type: "lobby", usernames: TEN, icon }` with every portrait chosen; `gamePacket(overrides: Partial<GameState>, roles?: Record<string, Role>): object` (`{ type: "game", ...makeGameState(TEN, overrides) }`, with the user LIBERAL unless `roles` says otherwise); `PROMPTS: { name: string; packets: object[]; button: string }[]` per the table below.

| `name` | packets (`gamePacket` overrides; G1 = `TEN[1]`, G2 = `TEN[2]`, G5 = `TEN[5]`) | `button` |
|---|---|---|
| role | CHANCELLOR_NOMINATION, president G1; roles: user and G2, G3 FASCIST, G1 HITLER, rest LIBERAL | OKAY |
| nomination | CHANCELLOR_NOMINATION, electionTracker 1 | CONFIRM |
| vote | CHANCELLOR_VOTING, president G1, chancellor G2, fascistPolicies 3, electionTracker 2 | CONFIRM |
| president-legislative | LEGISLATIVE_PRESIDENT, chancellor G2, presidentChoices F, L, F | DISCARD |
| chancellor-legislative | LEGISLATIVE_CHANCELLOR, president G1, chancellor user, fascistPolicies 5, chancellorChoices F, L | ENACT |
| veto | LEGISLATIVE_PRESIDENT_VETO, chancellor G2, fascistPolicies 5, electionTracker 2 | ACCEPT |
| peek | PP_PEEK, chancellor G2, peek F, L, F | OKAY |
| investigate | PP_INVESTIGATE, chancellor G2 | CONFIRM |
| investigation-card | PP_INVESTIGATE, president G1; then `{ type: "investigation", investigation: "FASCIST", target: G5 }` | OKAY |
| special-election | PP_ELECTION, chancellor G2 | CONFIRM |
| execution | PP_EXECUTION, chancellor G2 | CONFIRM |
| special-election-result | POST_LEGISLATIVE, lastState PP_ELECTION, president G1, chancellor G2, targetUser G5 | OKAY |
| execution-result | POST_LEGISLATIVE, lastState PP_EXECUTION, president G1, chancellor G2, targetUser G5, G5 dead | OKAY |
| executed | as execution-result with targetUser and the dead player being the user | CONFIRM |
| investigation-result | POST_LEGISLATIVE, lastState PP_INVESTIGATE, president G1, chancellor G2, targetUser G5 | OKAY |
| policy-enacted | POST_LEGISLATIVE, lastState LEGISLATIVE_CHANCELLOR, president G1, liberalPolicies 1, lastPolicy LIBERAL | OKAY |
| election-tracker | CHANCELLOR_NOMINATION, president G1, electionTracker 2; then POST_LEGISLATIVE, president G1, electionTracker 0, electionTrackerAdvanced, fascistPolicies 1, lastPolicy FASCIST | OKAY |
| victory | FASCIST_VICTORY_POLICY, president G1, chancellor G2, roles as in `role` | RETURN TO LOBBY |

Policy counts and the tracker are 0 unless listed (Finding 12). "F, L" are `PolicyType` values.

- [ ] **Step 1: Write the failing tests.**

`phone.spec.ts`, two tests:
  - **login**: `goto("/")`, `settle`, then `overflowX` shows nothing past the edge, `scrollWidth <= width`, and `smallTargets(page, "body")` is `[]`.
  - **lobby**: fill the name, CREATE LOBBY, wait for the icon picker. Check overflow and `smallTargets(page, "#alert-box")`. Pick, CONFIRM, join 9 guests, wait for `Players (10/10)`, `settle`, then check overflow and `smallTargets(page, "body")` again. Close the guests.

`prompts.spec.ts`:

```ts
for (const prompt of PROMPTS) {
  test(`the ${prompt.name} prompt fits`, async ({ page, isMobile }) => {
    const game = await openFakeGame(page);
    prompt.packets.forEach((packet) => game.send(packet));
    const alertBox = page.locator("#alert-box.appear-custom-alert");
    const button = alertBox.getByRole("button", { name: prompt.button, exact: true });
    await button.waitFor({ timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));

    const sizes = isMobile ? [page.viewportSize()!] : DESKTOP_SIZES;
    for (const size of sizes) {
      await page.setViewportSize(size);
      const at = `${size.width}x${size.height}`;
      const scroll = await page.evaluate(() => document.documentElement.scrollHeight);
      if (!isMobile) expect(scroll, `the page grows at ${at}`).toBeLessThanOrEqual(size.height);
      const overflow = await overflowX(page);
      expect(overflow.scrollWidth, `scrollWidth at ${at}`).toBeLessThanOrEqual(size.width);
      expect(overflow.offscreen, `past the edge at ${at}`).toEqual([]);
      const b = (await alertBox.boundingBox())!;
      expect(b.y, `box top at ${at}`).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height, `box bottom at ${at}`).toBeLessThanOrEqual(size.height);
      if (isMobile) {
        expect(b.width, `box width at ${at}`).toBeGreaterThanOrEqual(size.width * 0.9);
        expect(await smallTargets(page, "#alert-box"), `targets at ${at}`).toEqual([]);
      }
      await button.scrollIntoViewIfNeeded();
      const btn = (await button.boundingBox())!;
      expect(btn.y, `button top at ${at}`).toBeGreaterThanOrEqual(0);
      expect(btn.y + btn.height, `button bottom at ${at}`).toBeLessThanOrEqual(size.height);
    }
  });
}

test("a prompt that opens while the page is scrolled is on screen", async ({ page, isMobile }) => {
  test.skip(!isMobile, "only phones scroll the game page");
  const game = await openFakeGame(page);
  game.send(gamePacket({ state: LobbyState.CHANCELLOR_NOMINATION, president: TEN[1], electionTracker: 1 }));
  await page.locator(".game-screen").waitFor();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  game.send(PROMPTS.find((p) => p.name === "vote")!.packets[0]);
  const box = page.locator("#alert-box.appear-custom-alert");
  await box.getByRole("button", { name: "CONFIRM" }).waitFor();
  const b = (await box.boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.y + b.height).toBeLessThanOrEqual(page.viewportSize()!.height);
});
```

`DESKTOP_SIZES` moves from `no-scroll.spec.ts` into `layout.ts`. No project ignores `prompts.spec.ts`, so it runs on all three (Task 1's config).

- [ ] **Step 2: Run them to verify they fail.** `cd frontend && JAVA_HOME=<Java 17> npm run e2e -- e2e/phone.spec.ts e2e/prompts.spec.ts`. Expected:
  - phone login FAILS on targets (the three text fields, 32 or 34px tall);
  - "scrolled" FAILS on box top below 0;
  - desktop prompts FAIL on "the page grows" for the ten-player nomination, pickers and victory at 1920x1080, and more at 1280x720;
  - phone prompts that are taller than the screen FAIL on "box bottom".
  
  Everything else passes (Finding 4). A fixture that never shows its button (timeout) is a fixture bug; fix it against Finding 12 first.

- [ ] **Step 3: Implement.**
  - `CustomAlert.css`: `#alert` `position: fixed; inset: 0` in place of `absolute` and `100%`. `#alert-box` keeps `position: absolute`, `top: 10vh`, its widths and padding, and gains `max-height: calc(100% - 10vh - 50px)` (50px is the 40px of vertical padding plus the old 10px margin), `overflow-y: auto` and `overscroll-behavior: contain` (D4).
  - `App.css`: `@media (max-width: 768px) { button, input { min-height: 44px; } input { box-sizing: border-box; } }` (D5).

- [ ] **Step 4: Run the browser tests to verify they pass.** `cd frontend && JAVA_HOME=<Java 17> npm run e2e`. Expected: every project passes, including Task 1's tests.

- [ ] **Step 5: Check by eye** at 360x740 with `prompts.cjs after` (scratchpad): every prompt looks as before apart from the inner scroll on tall ones. At 1920x1080, the victory prompt fills the window and scrolls to RETURN TO LOBBY. Short desktop prompts (vote at 1080, policy enacted) are pixel-identical to `before-prompt-1920x1080-*` (`compare -metric AE` 0).

- [ ] **Step 6: Whole frontend check.** `cd frontend && npm test -- --run && npm run build`. Expected: all pass.

- [ ] **Step 7: Commit.** This ticks the two Task 5.2 boxes and the touch-target box, reworded to D5: "On phones every button, text field, player tile, vote card and policy card is at least 44x44px".

```bash
git add frontend/e2e frontend/src/custom-alert/CustomAlert.css frontend/src/App.css docs/PLAN.md
git commit -m "feat(frontend): keep prompts on screen and touch targets large on phones"
```

### Task 3 (PLAN 5.3): CI, docs and acceptance

**Files:**
- Modify: `frontend/playwright.config.ts`, `.github/workflows/ci.yml`, `CLAUDE.md`, `docs/PLAN.md`

- [ ] **Step 1: Keep failure evidence.**
  - `playwright.config.ts`: `use.trace: "retain-on-failure"`, and `reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list"`.
  - `ci.yml` `e2e` job, after the test step:

```yaml
      - name: Keep the browser test report
        if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: playwright-report
          path: |
            frontend/playwright-report
            frontend/test-results
          retention-days: 14
```

- [ ] **Step 2: Prove the report is written.** Break one assertion locally (for example, expect 3 seats), run `CI=1 JAVA_HOME=<Java 17> npm run e2e -- --project=desktop e2e/no-scroll.spec.ts`, then revert. Expected: `playwright-report/index.html` and a `trace.zip` under `test-results/` exist. Both stay git-ignored (`git status` clean after the revert).

- [ ] **Step 3: `CLAUDE.md`.**
  - Layout: `frontend/e2e/` has three Playwright projects: `desktop` (no-scroll at the five desktop sizes, prompts), and `phone-360`/`phone-412` (Galaxy S8 and Pixel 7 emulation; phone pages, prompts). Prompts are opened from a scripted game socket (`e2e/fakeGame.ts`). Shared helpers are `e2e/lobby.ts` and `e2e/layout.ts`.
  - The phone and narrow-window layout lives under `@media (max-width: 768px), (aspect-ratio < 5/4)` in `GameScreen.css` and `TableSeats.css`.
  - `App.css`'s `overflow-x: hidden` means horizontal overflow shows only in `body.scrollWidth`.
  - Commands: `npm run e2e` runs all projects; `-- --project=phone-360` runs one.

- [ ] **Step 4: `PLAN.md`.**
  - Task 5.3's box becomes: "Galaxy S8 (360x740) and Pixel 7 (412x915) projects assert no horizontal overflow (`body.scrollWidth` and no element past the edge) on login, lobby, the game at 5 and 10 players, and every prompt opened from a scripted game socket".
  - Under Phase 5 acceptance, note D4's deferral: tall desktop prompts scroll inside their box and do not yet fit without scrolling.

- [ ] **Step 5: Full suite.** `cd frontend && npm test -- --run && npm run build && JAVA_HOME=<Java 17> npm run e2e`, and `cd backend && JAVA_HOME=<Java 17> ./gradlew test`. Expected: all green. In `npm run e2e`: desktop has 4 no-scroll tests and 18 prompt tests; each phone project has 4 phone tests and 19 prompt tests.

- [ ] **Step 6: Drive a 7-player game at 360x740.** Adapt the Phase 4 drive script (`drive7.mjs`) in the scratchpad, never in the repo. Seven Galaxy S8 contexts against `runLocal` + `npm run dev` join one lobby and play: everyone votes JA; presidents discard a liberal and chancellors enact a fascist policy when they can; power prompts pick a living player who is not the president. Every page keeps its socket busy, and the script pings each socket every 10 s.

  Screenshot into the scratchpad, from the player who sees each one: login, lobby, role reveal, nomination, vote, the vote reveal on the stacked table, both legislative prompts, investigation (picker and card), special election, execution (picker, result and the executed tile), and victory. Collect console warnings and errors from all seven pages.

- [ ] **Step 7: Commit**

```bash
git add frontend/playwright.config.ts .github/workflows/ci.yml CLAUDE.md docs/PLAN.md
git commit -m "ci(frontend): keep the playwright report and traces of failed runs"
```

(Split it if the docs change grows: `docs(claude): …` for `CLAUDE.md`, `docs(plan): …` for `PLAN.md`.) Then the final review, the fix pass, push, and `gh pr create --repo jussaw/Secret-Hitler-Online --base development`. Show the user the screenshots and the console findings. Ask before merging.
