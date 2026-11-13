# Phase 9: Phase 8 follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every Minor finding deferred from Phase 8: small logic bugs in the roster data and the
round tracker, a status line that carries into the next game, missing tests, CSS blocks that
repeat base values, support for 320 px phones, and two tooling gaps.

**Architecture:** No new modules. Each task fixes one area in place, test first where behaviour
changes. The one structural change is in the CSS: the phone blocks of `GameScreen.css` and
`PlayerRoster.css` move to a phone-only query, so the tall-window blocks no longer undo them.

**Tech Stack:** React 18, TypeScript 5, Vite 8, Vitest 5 with Testing Library,
`@playwright/test` 1.64.1. Client only: no backend changes.

**Spec:** [`docs/superpowers/specs/2026-11-12-game-screen-redesign-design.md`](../specs/2026-11-12-game-screen-redesign-design.md)
is still the binding design for the game page. [Phase 8's breakdown](2026-11-12-phase-8-game-screen.md)
shows how the page was built. Parent plan: [`docs/PLAN.md`](../../PLAN.md), Phase 9, whose
checklist is the source of these tasks.

## Decisions (the user, 2026-11-12)

1. **Tall windows keep the phone's smaller tracker step line.** `RoundTracker.css` keeps the
   stacked query for its step block, and its comment says that tall windows share it on purpose.
2. **Phones down to 320 px wide are supported** and tested at 320x568, where the page may scroll.
   Narrower phones are out of scope, and a comment and `CLAUDE.md` say so.
3. **A phone-only query** replaces the stacked query in the phone blocks of `GameScreen.css` and
   `PlayerRoster.css`. The tall-window blocks then hold only what differs from desktop.
   `SoundControl.css` and `RoundTracker.css` keep the stacked query.
4. **The Fascist/Hitler role word** uses a new `--textColorFascist: #e8604a` in `variables.css`,
   next to `--textColorLiberal`.
5. **"Done when" counts nine phases.**

## Global Constraints

- **Breakpoints** (copy these strings exactly):
  - Stacked (phones and tall windows), kept in `SoundControl.css` and `RoundTracker.css`:
    `@media (max-width: 768px), (aspect-ratio < 5/4), (max-height: 500px)`
  - Phone only, for `GameScreen.css` and `PlayerRoster.css`:
    `@media ((max-width: 768px) or (aspect-ratio < 5/4) or (max-height: 500px)) and (not ((min-width: 700px) and (aspect-ratio < 5/4)))`
  - Tall windows: `@media (min-width: 700px) and (aspect-ratio < 5/4)`. Near-square windows:
    `... and (aspect-ratio >= 1/1)`. Both are unchanged.
- **Board floors:** `BOARD_FLOOR` in `frontend/e2e/layout.ts`, which is the table in Phase 8's
  Global Constraints. Never lower a floor, and never loosen a layout test to make it pass. If a
  floor, or the phone no-scroll goal (10 players and `LONG_STATUS` at 360x740 and 412x915), cannot
  be met after real tuning, stop and ask the user, with the measurements.
- **Touch targets:** at least 44 px (`MIN_TARGET`) on phones and in tall windows.
- **Kept selector:** `#status-bar-text` stays on the tracker's line.
- **Linux fonts:** CI's Linux draws Germania One 11–17% wider than macOS at phone sizes. Before
  pushing any change that fits text more tightly, measure it in
  `mcr.microsoft.com/playwright:v1.64.1-noble` (already pulled), against `frontend/dist` served
  statically and driven by the scripted socket from `e2e/fakeGame.ts`. No backend is needed.
- **Out of scope:** the baseline issues in `CLAUDE.md` (#4, #5, #8, #9, #10, #13). Prompts keep
  their look. Phase 8's real-game box and its last two acceptance boxes belong to the user: never
  tick them.
- **Environment:** run Gradle and `npm run e2e` with
  `JAVA_HOME=$HOME/.sdkman/candidates/java/17.0.8-zulu` (the default JDK 25 can't run the Gradle
  wrapper). Run `npx playwright install chromium firefox` once before the first e2e run. Any
  lockfile change uses `npx npm@11.21.1`; none is expected.
- **Commits:** Conventional Commits with a scope (`frontend`, `plan`, `claude`). Tick each
  `docs/PLAN.md` box in the same commit as its work. When you tick a "decide" item, add the
  decision to its line.
- **Public repo:** nothing about the hosting setup goes into files, commits or PR text.
- **Output:** write long test output to a file and read its tail.

## Review Focus

1. **A browser that can't parse the phone-only query drops the whole block**, so phones get the
   desktop grid. Task 6's guard test covers Chromium and Firefox. WebKit isn't run, so check that
   the query is plain Media Queries Level 4. The range syntax it relies on is already required.
2. **Tall and near-square windows must lay out exactly as before the refactor.** Task 6 compares
   every element's box before and after, at every `NARROW_WINDOWS` size and at the phone sizes.
3. **Step changes during a fade.** The stale-step fix must keep "the old step stays lit during
   the fade" and "a step change with the same text applies at once". Task 4 runs every tracker
   test.
4. **`usePlayerRows` with a `players` subset during the vote** (the prompts pass one) must not
   throw, and only the shown players can be busy. Covered by a Task 2 test.
5. **A 320 px phone with the longest status:** the tracker must keep its reserved height even
   where the page may scroll. Covered by Task 8's test, on macOS and on Linux.

---

### Task 1: Exhaustive round-step switch

**Files:**
- Modify: `frontend/src/game/roundStep.ts`
- Test: `frontend/src/game/roundStep.test.ts`

**Interfaces:** signatures unchanged.

- [ ] **Step 1: Add the test that `lastState` is ignored outside `POST_LEGISLATIVE`**

```ts
it.each(
  [S.CHANCELLOR_NOMINATION, S.CHANCELLOR_VOTING, S.LEGISLATIVE_PRESIDENT, S.LEGISLATIVE_CHANCELLOR,
   S.LEGISLATIVE_PRESIDENT_VETO, S.PP_PEEK, S.PP_INVESTIGATE, S.PP_EXECUTION, S.PP_ELECTION,
   S.SETUP, S.FASCIST_VICTORY_ELECTION].flatMap((state) =>
    [S.PP_EXECUTION, S.CHANCELLOR_VOTING, S.LEGISLATIVE_CHANCELLOR].map((lastState) => [state, lastState]))
)("ignores lastState %s → %s outside POST_LEGISLATIVE", (state, lastState) => {
  expect(stepForState({ state, lastState })).toBe(stepForState({ state, lastState: S.SETUP }));
});
```

(The title reads "state, then lastState". Word it so it reads well.)

- [ ] **Step 2: Run it, then prove it can fail**

Run: `cd frontend && npm test -- --run src/game/roundStep.test.ts`
Expected: PASS. It pins existing behaviour. Then make the `CHANCELLOR_VOTING` case return
`EXECUTIVE` when `lastState` is `PP_EXECUTION`, run again, and expect FAIL. Revert that change.

- [ ] **Step 3: Make the switch exhaustive, and wrap the long line**

- In `stepForState`, replace the outer `default: return null` with explicit cases for `SETUP`,
  `LIBERAL_VICTORY_POLICY`, `LIBERAL_VICTORY_EXECUTION`, `FASCIST_VICTORY_POLICY` and
  `FASCIST_VICTORY_ELECTION`, each returning `null`. Remove the default.
- Keep the nested `lastState` switch's `default` (the `LEGISLATIVE` fallback, which a test pins).
- Wrap `stepForPolicyLine`'s return to 80 columns or fewer, as Prettier would. The file follows
  Prettier's default width.

- [ ] **Step 4: Prove TypeScript now checks it**

Delete the `FASCIST_VICTORY_ELECTION` case, then run `cd frontend && npx tsc --noEmit`.
Expected: error TS2366 on `stepForState` ("Function lacks ending return statement…"). Restore
the case. `npx tsc --noEmit` then passes, and `npm test -- --run src/game/roundStep.test.ts`
PASSES.

- [ ] **Step 5: Commit** (tick the `roundStep.ts` box in `docs/PLAN.md`)

```bash
git add frontend/src/game/roundStep.ts frontend/src/game/roundStep.test.ts docs/PLAN.md
git commit -m "refactor(frontend): list the round tracker's no-step states"
```

### Task 2: Roster data: busy flags

**Files:**
- Modify: `frontend/src/player/usePlayerRows.ts`
- Test: `frontend/src/player/usePlayerRows.test.tsx`

**Interfaces:** `PlayerRow` unchanged. `busy` is now always a real `boolean`.

- [ ] **Step 1: Write the failing tests** (in `describe("busy")`)

```ts
test("busy is false, not undefined, when showBusy is omitted", () => {
  rowsOf({ user: "Ben", gameState: game }).forEach((r) => expect(r.busy).toBe(false));
});
test("in the vote, the user is left out with includeUser off and the rest who have not voted are busy", () => {
  const voting = makeGameState(NAMES, { state: LobbyState.CHANCELLOR_VOTING, userVotes: { Ann: true } });
  const rows = rowsOf({ user: "Ben", gameState: voting, showBusy: true, includeUser: false });
  expect(rows.map((r) => r.name)).toEqual(["Ann", "Cat", "Dan", "Eve"]);
  expect(rows.filter((r) => r.busy).map((r) => r.name)).toEqual(["Cat", "Dan", "Eve"]);
});
test("in the vote, only the shown players can be busy", () => {
  const voting = makeGameState(NAMES, { state: LobbyState.CHANCELLOR_VOTING });
  const rows = rowsOf({ user: "Ann", gameState: voting, showBusy: true, players: ["Cat", "Dan"] });
  expect(rows.filter((r) => r.busy).map((r) => r.name)).toEqual(["Cat", "Dan"]);
});
test("a dead president is not busy", () => {
  const dead = makeGameState(NAMES);
  dead.players.Ann.alive = false;
  expect(rowsOf({ user: "Ben", gameState: dead, showBusy: true }).some((r) => r.busy)).toBe(false);
});
```

Also fix `describe("role")`'s "a liberal sees only their own role". The server sends a liberal
only their own role, so build the state with `makeGameState(NAMES)`, set only
`players.Dan.id = Role.LIBERAL`, and expect the rows with a role to be `["Dan"]`.

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd frontend && npm test -- --run src/player/usePlayerRows.test.tsx`
Expected: FAIL. The first test receives `undefined`. The two vote tests throw a `TypeError`
reading `alive` of `undefined`. The dead-president test finds Ann busy. The liberal test passes,
since it is a test fix.

- [ ] **Step 3: Fix `usePlayerRows.ts`**

- Add `showBusy: false` to `defaultProps`, and compute `busy` as
  `busyPlayers.has(name) && !props.showVotes && props.showBusy === true`.
- In `getBusyPlayerSet`, have the voting case iterate `getPlayerOrder()` directly
  (`for (const name of getPlayerOrder())`).
- A player who isn't alive is never busy. After the switch, drop from the set every name whose
  `game.players[name]?.alive` isn't true.
- Remove the double blank line before `export type PlayerRow`.

- [ ] **Step 4: Run all unit tests**

Run: `cd frontend && npm test -- --run`
Expected: PASS, including the unchanged `PlayerDisplay.test.tsx` and `PlayerRoster.test.tsx`.

- [ ] **Step 5: Commit** (tick the `usePlayerRows.ts` and `usePlayerRows.test.tsx` boxes)

```bash
git add frontend/src/player docs/PLAN.md
git commit -m "fix(frontend): keep roster busy flags boolean and for the living"
```

### Task 3: Fascist role colour and roster rules

**Files:**
- Modify: `frontend/src/variables.css`, `frontend/src/game/PlayerRoster.css:113-116`
- Test: `frontend/src/game/PlayerRoster.test.tsx`

- [ ] **Step 1: Add the tests**

```ts
test("an office outranks EXECUTED on the detail line", () => {
  const game = makeGameState(NAMES, { chancellor: "Cat" });
  game.players.Cat.alive = false;
  const { row } = renderRoster(game, "Ann");
  expect(row("Cat").classList.contains("is-disabled")).toBe(true);
  const detail = row("Cat").querySelector(".roster-detail")!;
  expect(detail.textContent).toBe("CHANCELLOR");
  expect(detail.classList.contains("office")).toBe(true);
});
test("a visible role icon still shows on a darkened row", () => {
  const game = withRoles();
  game.players.Cat.alive = false; // Hitler, seen by the fascist Ben
  const { row } = renderRoster(game, "Ben");
  expect(row("Cat").classList.contains("is-disabled")).toBe(true);
  expect(row("Cat").querySelector('img.roster-role-icon[alt="Hitler"]')).not.toBeNull();
  expect(row("Cat").querySelector(".roster-detail")!.textContent).toBe("EXECUTED");
});
```

- [ ] **Step 2: Run them, then prove each can fail**

Run: `cd frontend && npm test -- --run src/game/PlayerRoster.test.tsx`
Expected: PASS. They pin existing behaviour. To prove each can fail:

- Swap `row.office || row.disabledText` to `row.disabledText || row.office` in `RosterRow`. The
  first test should FAIL.
- Render the role icon only when the row isn't disabled. The second test should FAIL.

Revert both changes.

- [ ] **Step 3: Name the colour**

- In `variables.css`, add `--textColorFascist: #e8604a;` right after `--textColorLiberal`, with a
  comment: the Fascist/Hitler role word, kept apart from the `#f08a5d` office orange.
- `.roster-detail.role-fascist` uses `color: var(--textColorFascist)`.

Run `grep -rn "e8604a" frontend/src`. Expected: only `variables.css`.

- [ ] **Step 4: Run all unit tests and the build**

Run: `cd frontend && npm test -- --run && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit** (tick the `PlayerRoster.css` and `PlayerRoster.test.tsx` boxes)

```bash
git add frontend/src/variables.css frontend/src/game/PlayerRoster.css frontend/src/game/PlayerRoster.test.tsx docs/PLAN.md
git commit -m "refactor(frontend): name the fascist role colour and pin roster rules"
```

### Task 4: Round tracker: stale step, regex, tests

**Files:**
- Modify: `frontend/src/game/RoundTracker.tsx`
- Test: `frontend/src/game/RoundTracker.test.tsx`, `frontend/src/game/GameScreen.test.tsx`

**Interfaces:** `RoundTracker(props: { step: RoundStep | null; text: string })` is unchanged.

- [ ] **Step 1: Write the tests**

In `RoundTracker.test.tsx`:

```ts
test("the first render does not fade", () => {
  const { container } = render(<RoundTracker step={null} text="First" />);
  const line = container.querySelector("#status-bar-text")!;
  expect(line.textContent).toBe("First");
  expect(line.classList.contains("fading")).toBe(false);
});
test("an empty line renders an empty paragraph", () => {
  const { container } = render(<RoundTracker step={null} text="" />);
  expect(container.querySelector("#status-bar-text")!.textContent).toBe("");
  expect(container.querySelector(".round-highlight")).toBeNull();
});
test("highlights an all-caps PRESIDENT", () => {
  const { container } = render(<RoundTracker step={null} text="WAITING FOR THE PRESIDENT." />);
  expect([...container.querySelectorAll(".round-highlight")].map((s) => s.textContent)).toEqual(["PRESIDENT"]);
});
test("after a step-only change, a fade keeps the step that was lit", () => {
  const { container, rerender } = render(<RoundTracker step={RoundStep.ELECTION} text="Same" />);
  const lit = () => container.querySelector(".round-step.current")!.textContent;
  rerender(<RoundTracker step={RoundStep.LEGISLATIVE} text="Same" />);
  rerender(<RoundTracker step={RoundStep.EXECUTIVE} text="New" />);
  expect(lit()).toBe(RoundStep.LEGISLATIVE);
  act(() => { vi.advanceTimersByTime(250); });
  expect(lit()).toBe(RoundStep.EXECUTIVE);
});
```

In `GameScreen.test.tsx`:

- Make the status assertion exact:
  `toHaveTextContent(/^Waiting for president to nominate a chancellor\.$/)`.
- Add `test("statusStep lights its step in the tracker")`. Use
  `renderScreen({ statusStep: RoundStep.LEGISLATIVE })`, then expect exactly one
  `.round-step[aria-current="step"]`, with the text `LEGISLATIVE SESSION`.

- [ ] **Step 2: Run them and confirm only the stale-step test fails**

Run: `cd frontend && npm test -- --run src/game/RoundTracker.test.tsx src/game/GameScreen.test.tsx`
Expected: the stale-step test FAILS, with `ELECTION` lit during the fade where
`LEGISLATIVE SESSION` was expected. The rest pass, since they pin existing behaviour.

- [ ] **Step 3: Fix `RoundTracker.tsx`**

- Build the regex once: `const HIGHLIGHT = /\b(president|chancellor)\b/gi;`, passed straight to
  `text.split`. `split` doesn't read or move a global regex's `lastIndex`.
- While no fade runs, keep `shown.step` equal to `step`. During render, when
  `!fading && shown.step !== step`, call `setShown({ text: shown.text, step })`. This is React's
  pattern for adjusting state when a prop changes. A later fade then holds the step that was
  actually lit. Update the effect's comment to match.

- [ ] **Step 4: Run all unit tests**

Run: `cd frontend && npm test -- --run`
Expected: PASS, including "the old step stays lit during the fade…" and "a step change with the
same text applies at once".

- [ ] **Step 5: Commit** (tick the `RoundTracker.tsx` and `GameScreen.test.tsx` boxes)

```bash
git add frontend/src/game/RoundTracker.tsx frontend/src/game/RoundTracker.test.tsx frontend/src/game/GameScreen.test.tsx docs/PLAN.md
git commit -m "fix(frontend): keep the lit step through a fade after a step change"
```

### Task 5: A fresh tracker for the next game

**Files:**
- Modify: `frontend/src/App.tsx` (the RETURN TO LOBBY `buttonOnClick`, about line 1576; the
  spectator's election-tracker line, about 1183, and policy line, about 1204),
  `frontend/e2e/fakeGame.ts`
- Test: `frontend/e2e/tracker.spec.ts`

**Interfaces:**
- Produces, in `e2e/fakeGame.ts`:
  - `type FakeGame = { send(packet: object): void; urls: string[] }`. `urls` moves here from
    `FakeWatch`. In `openFakeGame`, too, `send` now goes to the newest socket, as in
    `openFakeWatch`.
  - `export function lobbyPacket(names: string[] = TEN): object`. This is the
    `{ type: "lobby", usernames, icon }` packet `openFakeGame` sends, now shared.

- [ ] **Step 1: Write the browser tests** (both `desktop` only, like the others in the file)

1. **"ELECTION stays lit under the victory screen when Hitler is elected"**
   - Open with
     `openFakeWatch(page, spectatorPacket({ state: S.CHANCELLOR_VOTING, lastState: S.CHANCELLOR_NOMINATION, president: TEN[2], chancellor: TEN[1], fascistPolicies: 3 }))`.
   - Expect the lit step to read `ELECTION`.
   - Send
     `{ ...gamePacket({ state: S.FASCIST_VICTORY_ELECTION, lastState: S.CHANCELLOR_VOTING, president: TEN[2], chancellor: TEN[1], fascistPolicies: 3, userVotes: <all ten true> }, EVERY_ROLE), spectatorCount: 1 }`.
   - Wait up to 15 s for the `RETURN TO LOBBY` button.
   - Expect the lit step to read `ELECTION`.
2. **"RETURN TO LOBBY gives the next game a fresh line and no lit step"**
   - `const game = await openFakeGame(page)`.
   - Send `gamePacket({ president: TEN[1] })`. The role prompt opens. Once its `OKAY` is visible,
     record `opening = { text: line.textContent(), lit: current.count() }`.
   - Click OKAY. Expect `NOMINATION` lit.
   - Send `gamePacket({ state: S.LEGISLATIVE_PRESIDENT, president: TEN[1], chancellor: TEN[2] })`.
     Expect `LEGISLATIVE SESSION` lit.
   - Send
     `gamePacket({ state: S.FASCIST_VICTORY_POLICY, president: TEN[1], chancellor: TEN[2] }, EVERY_ROLE)`.
   - Click `RETURN TO LOBBY`. Wait with `expect.poll(() => game.urls.length).toBe(2)`.
   - Send `lobbyPacket()`, then wait for `Players (10/10)`.
   - Send `gamePacket({ president: TEN[1] })` again. While its `OKAY` is visible, expect
     `{ text, lit }` to equal `opening`.

- [ ] **Step 2: Run them and confirm which fails**

Run: `cd frontend && JAVA_HOME=$HOME/.sdkman/candidates/java/17.0.8-zulu npm run e2e -- --project=desktop tracker.spec.ts`
Expected:
- Test 1 PASSES, pinning Phase 8's behaviour.
- Test 2 FAILS. The second game opens behind its role prompt on the first game's legislative
  line, with `LEGISLATIVE SESSION` lit, where `opening` is `---` with nothing lit.

- [ ] **Step 3: Implement**

- In RETURN TO LOBBY's `setState`, also reset `statusBarText: "---"` and `statusStep: null`.
  These are the values in the initial state, so the next game opens as the first did.
- Wrap the spectator's election-tracker and policy `queueStatusMessage` calls, one argument per
  line inside braces, as Prettier would.

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npm test -- --run && npm run build`, then
`npm run e2e -- --project=desktop tracker.spec.ts prompts.spec.ts spectator.spec.ts`
Expected: PASS. `prompts.spec.ts` and `spectator.spec.ts` use the changed `fakeGame.ts`.

- [ ] **Step 5: Commit** (tick the `App.tsx` and `tracker.spec.ts` boxes)

```bash
git add frontend/src/App.tsx frontend/e2e/fakeGame.ts frontend/e2e/tracker.spec.ts docs/PLAN.md
git commit -m "fix(frontend): clear the status line and step on return to lobby"
```

### Task 6: Phone-only query

**Files:**
- Modify: `frontend/src/game/GameScreen.css` (phone block from about line 187, tall block from
  about line 307), `frontend/src/game/PlayerRoster.css` (phone block 146–181; delete the tall
  block, 183–207), `frontend/src/game/RoundTracker.css` (the phone block's comment and arrow,
  62–82), `CLAUDE.md` (the `frontend/` paragraph's breakpoint sentences)
- Test: `frontend/e2e/no-scroll.spec.ts`

This task doesn't change how any layout looks. The arrow is the only exception: it moves 0.03em
to centre it, as the corrected comment says it is.

- [ ] **Step 1: Record every box before the change**

Write a throwaway spec, `frontend/e2e/boxes.tmp.spec.ts`. Never commit it. It should:

- Open a 10-player game with `openFakeGame` and `gamePacket({ president: TEN[1] })`, then click
  the role prompt's OKAY.
- At each size, write every element's `getBoundingClientRect()` under `.game-screen` to a JSON
  file in the scratchpad, keyed by size and DOM path. The sizes are: every `NARROW_WINDOWS`,
  `DESKTOP_SIZES[0]` and `[4]`, 360x740, 412x915, 915x412, 768x1024, 768x600 and 320x568.

Run it with `--project=desktop`, then `--project=phone-360`, and save the output as
`boxes-before-*.json`.

- [ ] **Step 2: Add the guard test** to `no-scroll.spec.ts` (`desktop` and `firefox`)

**"every media query in the page's styles parses, the phone-only query among them"**:
- Open a game (`openFakeGame` and one game packet).
- Collect every `CSSMediaRule`'s `media.mediaText` from `document.styleSheets`, recursing into
  grouping rules.
- Expect none to equal `"not all"`. A browser serializes a query it can't parse that way.
- Find the phone-only query by what it does, not by how the browser spells it. With
  `setViewportSize`, evaluate `matchMedia(text).matches` for every collected query at 360x740,
  915x412 and 960x1080. Expect at least one query to match at 360x740 and at 915x412 but not at
  960x1080. The stacked query matches all three, and App.css's `(max-width: 768px)` misses
  915x412, so only the phone-only query passes.

Run: `npm run e2e -- --project=desktop --project=firefox no-scroll.spec.ts -g "media query"`
Expected: FAIL, because there's no phone-only rule yet.

- [ ] **Step 3: Change the CSS**

- **`PlayerRoster.css`:** the phone block takes the phone-only query. Delete the tall-window
  block, since every declaration in it only undid the phone block. Update both comments.
- **`GameScreen.css`:** the phone block takes the phone-only query. The tall-window block keeps
  only what differs from the desktop rules:
  - `.game-body`: `grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr)`.
  - `.game-body > .roster`: `--roster-font: clamp(12px, 1.5vw, 18px)`, `display: grid`,
    `grid-template-columns: repeat(2, minmax(0, 1fr))`,
    `grid-auto-rows: calc(var(--roster-font) * 3)`, `gap: 4px 6px`, `padding: 6px 8px`.
  - `.game-body .roster-row, .game-body .roster-portrait`: `max-height: none`.
  - `.game-body .roster-status`: `width: 3em`.
  - `.game-table`: `--column-gap: 12px`, its `--tracker-font`, its `--deck-width` `min(...)`,
    `align-content: start`, `padding: 8px`.
  - `.game-decks .end-term`: `min-width: 44px; min-height: 44px`.

  Every other rule in that block restates a desktop value: delete it. Rewrite the phone and tall
  comments: the phone block reaches phones only, and the tall block states only what differs from
  desktop. Name each file's query: `SoundControl.css` and `RoundTracker.css` keep the stacked
  query.
- **`RoundTracker.css`:** the step block keeps the stacked query. Its comment now says that
  phones and tall windows share the smaller step line on purpose, and that the arrow's half-width
  is 0.16–0.18em. Set the arrow to `left: -0.52em`, which is half the 0.7em gap plus half the
  arrow, so it is centred as the comment says. The tracker's height doesn't change:
  `--round-steps-size` stays `0.8` in the block.
- **`CLAUDE.md`:** in the `frontend/` paragraph, say that the phones' one column comes from the
  phone-only query in `GameScreen.css` and `PlayerRoster.css`, which is the stacked query less
  tall windows. Say that the tall-window block holds only what differs from desktop, and no longer
  undoes the phone block. Say that `SoundControl.css` and `RoundTracker.css` (the smaller step
  line) use the stacked query, so tall windows get them too.

- [ ] **Step 4: Compare the boxes and run the tests**

Re-run `boxes.tmp.spec.ts` in both projects and diff against the earlier files. Expected: every
box within 0.01 px, except the step arrows' `::before`, which isn't an element, so it isn't
measured. Delete `boxes.tmp.spec.ts`.

Run: `cd frontend && npm test -- --run && npm run build`, then `npm run e2e` (all four
projects).
Expected: PASS, the guard test included, with every board floor holding.

- [ ] **Step 5: Commit** (tick the tall-window CSS box, both `RoundTracker.css` boxes with the
  decision "tall windows keep the phone's step line", and nothing else)

```bash
git add frontend/src/game/GameScreen.css frontend/src/game/PlayerRoster.css frontend/src/game/RoundTracker.css frontend/e2e/no-scroll.spec.ts CLAUDE.md docs/PLAN.md
git commit -m "refactor(frontend): keep tall windows out of the phone css blocks"
```

### Task 7: Phone tags and short upright prompts

**Files:**
- Modify: `frontend/e2e/layout.ts` (`rowShift`)
- Test: `frontend/e2e/phone.spec.ts`, `frontend/e2e/prompts.spec.ts`

**Interfaces:**
- Produces: `rowShift(page: Page, selector = ".roster-detail", text = "CHANCELLOR"): Promise<number>`.
  It fills every empty `selector` element with `text` and empties the full ones, then returns the
  largest move of any `.roster-row` or of `#board-container`. `no-scroll.spec.ts`'s call is
  unchanged.

- [ ] **Step 1: Write the tests**

- **`phone.spec.ts`:** in `checkGame`, after the roster checks, expect
  `await rowShift(page, ".roster-tag", "CHAN")` to be at most 0.5, labelled "a PRES/CHAN tag
  moves a row".
- **`prompts.spec.ts`:** turn "a prompt that opens while the page is scrolled is on screen" into
  a loop over two shapes, each a test of its own:
  - `sideways`: `(w, h) => ({ width: h, height: w })`.
  - `upright and short`: `(w) => ({ width: w, height: 600 })`.

  The shape goes in the title. The body is unchanged.

- [ ] **Step 2: Run them, then prove the tag check can fail**

Run: `cd frontend && JAVA_HOME=$HOME/.sdkman/candidates/java/17.0.8-zulu npm run e2e -- --project=phone-360 --project=phone-412 phone.spec.ts prompts.spec.ts`
Expected: PASS. Each test pins existing behaviour, and the page scrolls at 360x600 and 412x600.

To prove the tag check can fail, add
`await page.addStyleTag({ content: ".game-body > .roster { grid-auto-rows: auto } .roster-tag { padding-block: 10px }" })`
just before the `rowShift` call. Run `phone-360` and expect FAIL. Remove the line.

- [ ] **Step 3: Commit** (tick the `phone.spec.ts` and `prompts.spec.ts` boxes)

```bash
git add frontend/e2e/layout.ts frontend/e2e/phone.spec.ts frontend/e2e/prompts.spec.ts docs/PLAN.md
git commit -m "test(frontend): check phone office tags and short upright prompts"
```

### Task 8: Phones down to 320 px

**Files:**
- Test: `frontend/e2e/phone.spec.ts`
- Modify only if the test needs it: the phone block of `frontend/src/game/GameScreen.css` (and
  `PlayerRoster.css`)
- Docs: the comments in `RoundTracker.css` and in the `GameScreen.css` phone block, and
  `CLAUDE.md`

- [ ] **Step 1: Write the test**

- `checkGame` takes `{ players, spectator = false, scroll = false }`. With `scroll: true`, it
  skips the two vertical-scroll checks: the page's `scrollHeight`, and the `scrollHeight` with
  the longest status. It keeps every other check. That includes the tracker's reserved height with
  `LONG_STATUS`, and the step line's 0.88 margin.
- Add **"a 320px phone keeps the phone layout, and only scrolls down"**:
  - Skip it outside `phone-360`: one phone project is enough.
  - `startGame` with 10 players, then `settle`.
  - `setViewportSize({ width: 320, height: 568 })`, then `settle`.
  - `checkGame(page, { players: 10, scroll: true })`.

- [ ] **Step 2: Run it and record what it measures**

Run: `cd frontend && JAVA_HOME=$HOME/.sdkman/candidates/java/17.0.8-zulu npm run e2e -- --project=phone-360 phone.spec.ts -g 320`
Expected: either PASS, which pins support, or a FAIL naming the check. Note the step line's
logged natural width against the space available.

- [ ] **Step 3: If it fails, tune the phone block for under 339 px only**

Change only clamp minimums that are reached below 339 px, so 360 and 412 render exactly as
before. For example, if the longest status needs a third line at 320, lower the phone
`--tracker-font` from `clamp(10.5px, 3.1vw, 16px)` to `clamp(9.9px, 3.1vw, 16px)`, so 3.1vw holds
down to 320 px. Do the same for a roster or counts-box minimum that overflows. Re-run Step 2's
command until it passes, then confirm that the 360 and 412 runs log the same step widths as
before.

- [ ] **Step 4: Measure on Linux**

In `mcr.microsoft.com/playwright:v1.64.1-noble`:
- Serve `frontend/dist` statically: `python3 -m http.server -d dist` if the image has Python,
  otherwise a few-line Node static server. The repo's Playwright config builds the jar, so don't
  use it here.
- Mount the repo. The host's `node_modules/@playwright/test` is plain JS, and the image brings
  its own browsers.
- Use a throwaway config and spec (never committed) that open a 10-player game with
  `openFakeGame`.
- At 320x568, 360x740 and 412x915, measure:
  - the step line's natural width against the space available, as `checkGame` computes it;
  - the tracker's height against `--tracker-height`, both as is and with `LONG_STATUS`;
  - `scrollWidth`.

Expected: on Linux, natural ≤ 0.88 × available at each size, and the tracker within 0.5 px of
its reserved height. If 320 misses, tune as in Step 3 and measure again. If no change confined to
under 339 px meets it, stop and ask the user, with the numbers.

- [ ] **Step 5: Document the floor**

- The `GameScreen.css` phone comment and the `RoundTracker.css` step comment: phones down to
  320 px wide are supported (`phone.spec.ts`). Narrower ones are out of scope: below about
  257 px (273 px on Linux), the steps wrap.
- `CLAUDE.md`'s phone sentences: the layout holds down to 320 px wide, tested at 320x568 where
  the page may scroll. Add the test to the `phone.spec.ts` description.

- [ ] **Step 6: Run the phone projects and commit** (tick the "Phones under 360 px" box with the
  decision)

Run: `npm test -- --run && npm run build`, then `npm run e2e -- --project=phone-360 --project=phone-412`
Expected: PASS.

```bash
git add frontend/e2e/phone.spec.ts frontend/src/game CLAUDE.md docs/PLAN.md
git commit -m "test(frontend): support phones down to 320px wide"
```

If CSS changed, use `fix(frontend): fit phones down to 320px wide`.

### Task 9: Type-check the browser tests; one jsdom per worker

**Files:**
- Create: `frontend/tsconfig.e2e.json`
- Modify: `frontend/package.json` (`build`), `frontend/vite.config.ts` (`test.pool`), any e2e
  file with a real type error, `CLAUDE.md` (the build row in Commands)

- [ ] **Step 1: Show the gap**

Add `const typeCheck: number = "e2e";` to the end of `frontend/e2e/layout.ts`, then run
`cd frontend && npm run build`.
Expected: PASS. This is the bug: the e2e files aren't type-checked.

- [ ] **Step 2: Type-check them in the build**

- Create `tsconfig.e2e.json`, which extends `./tsconfig.json` with
  `"compilerOptions": { "types": ["node"] }` and `"include": ["e2e", "playwright.config.ts"]`.
- Set `"build": "tsc --noEmit && tsc --noEmit -p tsconfig.e2e.json && vite build"`.

- [ ] **Step 3: Confirm it bites, then fix what it finds**

Run: `npm run build`
Expected: FAIL with TS2322 at `e2e/layout.ts`. Remove the line and run it again. Fix any other
error at its cause: no `any`, no `@ts-ignore` or `@ts-expect-error`, and no change to what a test
checks. Then the build PASSES.

- [ ] **Step 4: One jsdom per worker**

Run: `npm test -- --run`
Expected: the notice "Environment jsdom was created N times…".

Set `pool: "vmThreads"` in `vite.config.ts`'s `test` block, with a comment saying it builds jsdom
once per worker and keeps per-file isolation. Run `npm test -- --run` twice.
Expected: every test PASSES and the notice is gone. If a test fails only under `vmThreads`, from a
vm-context difference and not a real bug, use `pool: "forks"` instead. Explicitly choosing the
pool also turns the hint off. Give it a comment saying per-file isolation is chosen on purpose,
and record the ruling.

- [ ] **Step 5: Check the image still builds**

The image runs `npm run build` too, so the e2e type-check happens there.
Run: `cd .. && docker build -t secret-hitler-online .`
Expected: success.

- [ ] **Step 6: Commit** (update the build row in `CLAUDE.md`'s Commands table to "type-check the
  app and the browser tests, then `frontend/dist/`"; tick the Tooling box)

```bash
git add frontend/tsconfig.e2e.json frontend/package.json frontend/vite.config.ts frontend/e2e CLAUDE.md docs/PLAN.md
git commit -m "build(frontend): type-check the browser tests and share jsdom"
```

### Task 10: Docs

**Files:** `CLAUDE.md`, `docs/PLAN.md`

- [ ] **Step 1: `CLAUDE.md`'s tracker sentence**

Replace "it always keeps two lines' height, `--round-tracker-ems`" with: its line always keeps
two lines' height, and `--round-tracker-ems` is the whole card's height in its own ems, which the
layouts reserve. Then commit, ticking the `CLAUDE.md` box:

```bash
git add CLAUDE.md docs/PLAN.md
git commit -m "docs(claude): describe --round-tracker-ems as the card's height"
```

- [ ] **Step 2: Count Phase 9 in Done when**

- "Done when" reads "All nine phases merged and the Progress table reads "done" for each". Leave
  its boxes unticked.
- In "How to use this file", the last sentence becomes: "Phase 8 has no Start block, since
  Phase 9 was added after it was planned, and Phase 9 ends with **Done when** instead."

```bash
git add docs/PLAN.md
git commit -m "docs(plan): count phase 9 in done when"
```

### Finish

After the final review's fixes, set Phase 9's status in the Progress table to `done` in its own
`docs(plan)` commit. Then run the full suite: `npm test -- --run`, `npm run build`, `npm run e2e`
(all four projects) and `cd backend && ./gradlew test`. Then push, open the PR against
`development` on `jussaw/Secret-Hitler-Online`, and merge it once CI passes.
