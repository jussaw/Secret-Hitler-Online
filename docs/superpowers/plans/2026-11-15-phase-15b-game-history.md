# Phase 15B: Game history Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GAMES at `/stats/games`: every recorded game, newest first, with its own filter in the
address, 20, 50 or 100 to a page; and the links in, from the login page, the lobby and the victory
screen (issue #31).

**Architecture:** Phase 15A's shell already routes `/stats/games` to the placeholder
`games/GamesPage.tsx`, fetches the records once per visit and gives the labels, names, links and
browser-test helpers. This phase fills that placeholder: a pure filter module reads and writes the
filter in the address, a row component draws each game with one link stretched over it, and the page
shows the filter, the summary, the rows and the page links. The login and lobby footers gain
`Stats`, and the victory screen links to `/stats/games/<id>` from the `gameId` every game packet now
carries.

**Tech Stack:** React 18, TypeScript 5, Vite 8, Vitest with Testing Library, `@playwright/test`
1.64.1, `lucide-react` (already a dependency). No backend change.

**Spec:** [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](../specs/2026-11-15-game-stats-design.md):
the GAMES part of "GAMES and the game page", "The links in", Constraints, Tests and Known limits.
Mockup: `games.jpg` (left) in [`2026-11-15-game-stats/`](../specs/2026-11-15-game-stats/). Shared
names: [`2026-11-15-game-stats-interfaces.md`](2026-11-15-game-stats-interfaces.md), used exactly;
its sections "Settled after the plans were written" and "Rules every frontend phase keeps" win over
this plan. The shell, its helpers and their names are Phase 15A's
([`2026-11-15-phase-15a-stats-shell.md`](2026-11-15-phase-15a-stats-shell.md)). Parent plan:
[`docs/PLAN.md`](../../PLAN.md), Phase 15B. Read the spec first; where this plan and the spec differ,
the spec wins.

## Global Constraints

- **Needs Phase 15A merged:** `StatsApp`, `routes.ts` (`routePath`, `navigate`, `useLocation`,
  `PageProps`), `StatsLink`, `format.ts`, `PlayerName`, `testRecords.ts`, the placeholder
  `games/GamesPage.tsx`, `GameState.gameId`, `fakeGame.ts`'s `FAKE_GAME_ID`, `e2e/stats.ts` and
  `npm run first-download` are on `origin/development`.
- **Branch and worktree:** `phase-15b-game-history`, off an up-to-date `origin/development`.
- **Beside Phases 16 and 17A:** this phase touches none of their files (`game/`, `rounds.ts`,
  `TabsPage.tsx`, `counting.ts`, `tabs/`, `charts/`, …). Of 15A's files it changes only
  `games/GamesPage.tsx` and `games/GamesPage.test.tsx` (filling the placeholder); it imports
  `e2e/stats.ts` and edits nothing in it. On a rebase after one of them merges, keep both sides of
  the docs.
- **Copy, exactly.** GAMES: the label `Players`, the select `Add a player`, chips labelled `Remove
  <name>`, `From`, `To`, `Any size` and `5 seats` to `10 seats` (select labelled `Seats`), `Any
  ending`, `Liberal policies`, `Hitler executed`, `Fascist policies`, `Hitler elected`, `Unfinished`
  (`Ending`), `With or without CPU`, `Without CPU players`, `With CPU players` (`CPU players`), `20 a
  page`, `50 a page`, `100 a page` (`Games a page`), `Clear filters`, `No games recorded yet.`, `No
  games match these filters.`, `‹ Previous`, `Next ›` (in a `nav` labelled `Pages`), the row tag
  `CPU`, `7 seats`, `11 rounds`. Results as `outcomeLabel` gives them. Footers: `Stats`. Victory
  screen: `See this game`.
- **GAMES' address:** `players` (player numbers, ascending, comma-separated; a game matches if any
  of them sat in it), `from` and `to` (`YYYY-MM-DD`, compared with the local day of `startedAt`, both
  inclusive), `size` (5 to 10), `ending` (`liberal-policies`, `hitler-executed`,
  `fascist-policies`, `hitler-elected`, `unfinished`), `cpu` (`without` or `with`), `per` (`50` or
  `100`), `page` (2 and up). Written in that key order, defaults left out; any other value reads as
  the default. Changing anything but the page goes back to page 1.
- **The game's first download:** the links in are the only change to the entry; the files
  `dist/index.html` loads grow by at most 512 bytes gzipped over this phase's base (`npm run
  first-download`). Nothing outside `src/stats/` imports from it.
- **Browser tests import no browser-only module.** No `e2e/` file imports `src/constants` or
  anything that imports it (`api.ts`, `App`): specs build paths with `routePath`, never
  `statsGamePath`, and take `outcomeLabel` from `format.ts`.
- **ES2020 only:** no `Array.prototype.at`, `Object.hasOwn`, `replaceAll`, `findLast` or anything
  newer, in tests too.
- **Names never overflow:** every grid or flex child in `GamesPage.css` has `min-width: 0`
  (`PlayerName` already wraps anywhere), so `WWWWWWWWWW01` stays in its column at 320px; below 360px
  wide (`@media (max-width: 359px)`) `From` and `To` stack in one column.
- **Touch sizes** follow the game's stacked query, `(max-width: 768px), (aspect-ratio < 5/4),
  (max-height: 500px)`: where it matches, every link, button, select and input on GAMES, the chips,
  row links and page links included, is at least 44x44 CSS px, and every field and select has 16px
  text or more. **The phone layout** (rows in one column, the filter's controls in two) follows the
  game's phone-only query, written out where used:
  `((max-width: 768px) or (aspect-ratio < 5/4) or (max-height: 500px)) and (not ((min-width: 700px) and (aspect-ratio < 5/4)))`.
  At every size in `statsSizes` nothing scrolls sideways.
- **Look:** the game's, through 15A's `.stats-card`; Liberal `--textColorLiberal`, Fascist and
  Hitler `--textColorFascist` (Hitler underlined, `stats-hitler`); chips are the lobby's grey buttons.
  No new art; Lucide's `X` on the chips.
- **Environment:** `npm ci` in `frontend/` and `npx playwright install chromium firefox` once;
  `JAVA_HOME` at an installed Java 17 for Gradle
  and `npm run e2e`. Every `npm run e2e` and `npx playwright` run gets `E2E_PORT=4625`, and the
  screenshot runs `E2E_PORT=4725` (each free first: `lsof -iTCP:<port> -sTCP:LISTEN` prints
  nothing). No new dependency.
- **Long browser tests:** every test that checks a page at every size calls `test.slow()`.
- **Time zones in tests:** pass a zone (`filterGames(games, filter, "UTC")`), or build times from
  local parts; never set `process.env.TZ`.
- **Linux fonts:** CI draws Germania One 11–17% wider than macOS at phone sizes. The login page's
  tightest fits (signed in at 800x700, about 6px to spare; 360x740 on Linux, about 6px) meet the
  longer footer, so the login and lobby layout tests and GAMES' phone layouts run in
  `mcr.microsoft.com/playwright:v1.64.1-noble` (`DEVELOPMENT.md`, "Browser tests on Linux") before
  pushing, and `firefox` runs there too. Room the footer needs comes from spacing, never from
  dropping a link.
- **Commits:** Conventional Commits with a scope (`frontend`, `plan`, `docs`, `claude`, `readme`,
  `development`), each test in the commit of the code it tests. Task N (1 to 6) ticks the Nth box of
  Phase 15B in `docs/PLAN.md` in its last commit.
- **Public repo:** nothing about the hosting setup in code, docs, commits or the PR.

## Review Focus

1. **A hand-edited or stale GAMES address** (`?page=99`, `?per=7`, `?from=2026-02-30`,
   `?players=abc,3,3,-1`, `?size=11`, `?ending=draw`, a player number nobody has): each value falls
   back to its default, the page is clamped to the last, an unknown player gets no chip and filters
   nothing, and the page never goes blank or throws. Tasks 1 and 2 test it.
2. **From and To at the viewer's day boundaries:** a game starting 23:59 local on the To day is in,
   one at 00:00 the day after is out; From alone, To alone, and From after To (nothing matches).
   Task 1 tests it.
3. **Back, forward and reload through filter and page changes:** back undoes the last change, a
   reload keeps the filter, a filter change keeps the scroll position and a new page brings the list
   into view. Tasks 2 and 4 test it.
4. **Twelve-character names of wide letters at 320px**, in rows and in chips: they wrap inside their
   column, never into the counts or past the edge. Task 4 tests it.
5. **A victory packet without `gameId`** (a server from before recording): no "See this game", and
   nothing else on the victory screen changes. Task 3 tests it.

---

### Task 0: Start

No box: this task changes nothing that is committed.

- [ ] **Step 1: Check Phase 15A is in and this phase is planned.** `git fetch origin`, then all
  three must succeed: `git cat-file -e origin/development:frontend/src/stats/StatsApp.tsx`, `git
  cat-file -e origin/development:frontend/e2e/stats.ts`, and `git grep -n "## Phase 15B"
  origin/development -- docs/PLAN.md`. If any fails, stop and report.
- [ ] **Step 2: Make the worktree** `phase-15b-game-history` on a branch of the same name from
  `origin/development`, nested under the session's worktree. In `frontend/`: `npm ci` and `npx
  playwright install chromium firefox`. Check that ports 4625 and 4725 are free.
- [ ] **Step 3: Measure the game's first download on the base:** `cd frontend && npm run build &&
  npm run first-download > <scratchpad>/first-download-before.txt`.
- [ ] **Step 4: Take the "before" screenshots.** Write `frontend/e2e/pr-shots.spec.ts`, never
  committed: `test.skip(!process.env.PR_SHOTS)`, `const PREFIX = "before"`, 1600x900 in `desktop`
  and 412x915 in `phone-412`, each saved to
  `docs/pr/phase-15b-game-history/<PREFIX>-<state>-<W>x<H>.png`. States: `login` (`stubMe(page,
  signedOutMe({ discord: true }))`, `/`, `settle`), `lobby` (`openFakeGame(page)`, `settle`),
  `victory` (`openFakeGame(page)`, then `PROMPTS`' victory packet, waiting for RETURN TO LOBBY and
  the fonts; not `settle`, which hides the prompt) and `games` (`stubStats(page, bigStatsData())`,
  `/stats/games`, `settle`). Run `PR_SHOTS=1 E2E_PORT=4725 npx playwright test e2e/pr-shots.spec.ts
  --project=desktop --project=phone-412`.

---

### Task 1: GAMES' filter and pages

**Files:**
- Create in `frontend/src/stats/games/`: `gamesFilter.ts`, `gamesFilter.test.ts`, `pages.ts`,
  `pages.test.ts`

**Interfaces:**
- Consumes: `GameRecord`, `Outcome`, `makeRecord`, `makeSeats` (15A's `record.ts`, `testRecords.ts`);
  `localDayKey`, `viewerTimeZone`, `plural` (15A's `format.ts`).
- Produces `gamesFilter.ts`:

```ts
export type CpuChoice = "any" | "without" | "with";
export const PER_PAGE = [20, 50, 100] as const;
export type PerPage = (typeof PER_PAGE)[number];
export interface GamesFilter {
  players: number[]; from: string | null; to: string | null; size: number | null;
  ending: Outcome | null; cpu: CpuChoice; per: PerPage; page: number;
}
export const NO_GAMES_FILTER: GamesFilter;      // [], null, null, null, null, "any", 20, 1
export const ENDING_PARAM: Record<Outcome, string>;  // the address spellings in Global Constraints
export function parseGamesFilter(search: string): GamesFilter;
export function gamesFilterSearch(filter: GamesFilter): string;   // "" or "?…", Global Constraints' order
export function isFiltered(filter: GamesFilter): boolean;         // players, dates, size, ending or cpu set
export function filterGames(games: GameRecord[], filter: GamesFilter,
  timeZone: string = viewerTimeZone()): GameRecord[];             // newest first
```

  `parseGamesFilter` keeps positive integers in `players`, deduplicated and ascending; a date only
  when it is a real calendar day in `YYYY-MM-DD`; `page` an integer of 1 or more. `filterGames`
  compares `localDayKey(startedAt, timeZone)` with `from` and `to`, ignores `per` and `page`, and
  orders by `endedAt`, then `id`, both descending. A player page's "All N games" link (Phase 22) is
  `"/stats/games" + gamesFilterSearch({ ...NO_GAMES_FILTER, players: [n] })`.
- Produces `pages.ts`: `pageCount(matching: number, per: number): number` (at least 1);
  `pageLinks(current: number, count: number): (number | null)[]` (the first and last pages and the
  current one's neighbours, ascending; `null` for a gap of two or more pages, the page itself for a
  gap of one); `gamesSummary(total: number, matching: number, first: number, last: number, filtered:
  boolean): string`.

- [ ] **Step 1: Write the failing tests.**
  - `gamesFilter.test.ts`: `reads and writes the address` (`gamesFilterSearch(NO_GAMES_FILTER)` is
    `""`; every field set gives `?players=1,3&from=2026-10-01&to=2026-11-14&size=7&ending=hitler-elected&cpu=with&per=50&page=2`,
    which parses back to the same filter); `junk falls back to the defaults` (Review Focus 1:
    `?players=abc,3,3,-1,0&from=2026-02-30&to=2026-13-01&size=11&ending=draw&cpu=yes&per=7&page=0`
    parses to `{ ...NO_GAMES_FILTER, players: [3] }`, and `page=-2` and `page=x` to page 1);
    `players match any of them`; `From and To are local days, both inclusive` (Review Focus 2, in
    `"UTC"`: games starting at `Date.UTC(2026, 10, 14, 0, 0)`, `Date.UTC(2026, 10, 14, 23, 59)` and
    `Date.UTC(2026, 10, 15, 0, 0)`: `to=2026-11-14` keeps the first two, `from=2026-11-15` keeps the
    last, `from=2026-11-15&to=2026-11-14` keeps none; in `"America/New_York"` the last starts on
    2026-11-14, so `to=2026-11-14` keeps all three); `size, ending and CPU` (each `ENDING_PARAM`
    value, `unfinished` included, and `without` and `with`); `newest first` (`endedAt`, then `id`,
    descending).
  - `pages.test.ts`:

```ts
expect([pageCount(0, 20), pageCount(20, 20), pageCount(45, 20), pageCount(45, 50)]).toEqual([1, 1, 3, 1]);
expect(pageLinks(1, 1)).toEqual([1]);
expect(pageLinks(2, 3)).toEqual([1, 2, 3]);
expect(pageLinks(1, 8)).toEqual([1, 2, null, 8]);
expect(pageLinks(3, 8)).toEqual([1, 2, 3, 4, null, 8]);
expect(pageLinks(5, 8)).toEqual([1, null, 4, 5, 6, 7, 8]);
expect(pageLinks(8, 8)).toEqual([1, null, 7, 8]);
expect(gamesSummary(0, 0, 0, 0, false)).toBe("No games recorded yet.");
expect(gamesSummary(1, 1, 1, 1, false)).toBe("1 game recorded · showing 1–1");
expect(gamesSummary(142, 142, 1, 20, false)).toBe("142 games recorded · showing 1–20");
expect(gamesSummary(142, 37, 21, 37, true)).toBe("142 games recorded · 37 match · showing 21–37");
expect(gamesSummary(142, 0, 0, 0, true)).toBe("142 games recorded · none match");
```

- [ ] **Step 2: Run** `cd frontend && npm test -- --run src/stats/games`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): read and write the games filter in the address`, ticking
  box 1 and setting Phase 15B's Progress row to `in progress`.

---

### Task 2: GAMES

**Files:**
- Create in `frontend/src/stats/games/`: `GameRow.tsx`, `GameRow.test.tsx`, `GamesPage.css`
- Modify (fill 15A's placeholder): `frontend/src/stats/games/GamesPage.tsx`,
  `frontend/src/stats/games/GamesPage.test.tsx`

**Interfaces:**
- Consumes: Task 1; `outcomeLabel`, `formatLocalDate`, `formatLocalTime`, `formatLocalDateTime`,
  `formatDuration`, `plural` (`format.ts`); `PlayerName`; `StatsLink`; `routePath`, `navigate`,
  `useLocation`, `PageProps` (`routes.ts`); `makeRecord`, `makeSeats`, `makeData`.
- Produces `GameRow({ record }: { record: GameRecord })`: an `li.games-row` (`position: relative`)
  with one link, `a.games-row-link` (a `StatsLink` to `routePath({ page: "game", id })`,
  `aria-label` `` `${formatLocalDateTime(startedAt)} · ${outcomeLabel(record)}` ``), holding the
  date (`formatLocalDate`) and the result (`outcomeLabel`, its first word in `stats-liberal` or
  `stats-fascist` by `winner` when there is one, and a `CPU` tag when `hasCpu`). The link is at
  least 44px tall where the stacked query matches, and its `::after` covers the whole row, so a
  press anywhere opens the game. Outside the link: the time and length (`` `${formatLocalTime} ·
  ${formatDuration(endedAt - startedAt)}` ``) under the date; the seats in turn order as
  `PlayerName`s with their roles, joined by ` · ` (`.games-row-seats`, `position: relative;
  z-index: 1`, so Phase 22A's name links sit above the row's link and no anchor wraps a name); and
  `plural(seats.length, "seat")` over `plural(rounds, "round")` (`.games-row-counts`). Desktop: as
  `games.jpg` (the date and time at the left, the result over the seats, the counts at the right);
  phone layout: one column.
- Produces `GamesPage({ data }: PageProps)`, still the file's default export: reads
  `parseGamesFilter(useLocation().search)`, drops player numbers that are not in `data.players`,
  and clamps `page` to `pageCount`. It shows, in order:
  1. A `.stats-card` with the filter: `Players`, a chip per chosen player (a grey button, the name
     and Lucide's `X`, `aria-label` `Remove <name>`) and the `Add a player` select (every player not
     chosen, by name, ignoring case; it goes back to `Add a player` after a pick); `From` and `To`
     date inputs (`max` and `min` set from each other); the `Seats`, `Ending` and `CPU players`
     selects; `Clear filters` (a `StatsLink` to `/stats/games`) while `isFiltered`.
  2. The summary line, `gamesSummary(...)`, and the `Games a page` select.
  3. An `ol.games-list` of `GameRow`s for the page; `No games match these filters.` when a filter
     matches none.
  4. `nav` `Pages` when there is more than one page: `‹ Previous`, the `pageLinks` (each a
     `StatsLink` with that page's address; the current page a `span` with `aria-current="page"`; a
     gap `…`), `Next ›`; Previous on the first page and Next on the last are `span`s with
     `aria-disabled="true"`. It wraps on narrow screens. When the page number changes (not on the
     first render), the summary line is scrolled into view, since `navigate` keeps the scroll
     position for a change of search.

  Every control calls `navigate("/stats/games" + gamesFilterSearch({ ...filter, <the change>, page:
  1 }))`. In the phone-only query the controls are two equal columns (the chips and `Add a player`
  across both).

- [ ] **Step 1: Write the failing tests.**
  - `GameRow.test.tsx`: `shows a finished game` (`makeRecord()` with seven seats and 11 rounds: the
    link's `href` is `/stats/games/game-1` and its name is `Sat 14 Nov 2026, 9:42 PM · Liberals win
    · 5 Liberal policies`; the text has `9:42 PM · 38 min`, `7 seats` and `11 rounds`; `Liberals`
    has `stats-liberal`; the seats are `P1 · … · P7` in order, Hitler's with `stats-hitler`; no
    `CPU`); `tags a CPU game and reads an unfinished one` (`hasCpu: true` shows `CPU`; an
    `UNFINISHED` record shows `Unfinished after round 6 · 4 L, 3 F` with no coloured word); `one
    link, and no name inside it` (the row has exactly one `a`; it holds the date and the result; no
    `PlayerName` is inside it).
  - `GamesPage.test.tsx`, replacing the placeholder's test (45 records from `makeRecord`, ids `g01`
    to `g45`, an hour apart, seats over players 1 to 8, with some `hasCpu`, `UNFINISHED` and 7-seat
    games; the address set with `history.pushState` before each render): `twenty newest first`
    (rows `g45` to `g26`, `45 games recorded · showing 1–20`, no `‹ Previous` link, `Next ›` links
    to `/stats/games?page=2`); `the last page` (`?page=3`: `g05` to `g01`, `showing 41–45`); `a
    page past the last shows the last` (`?page=99` shows page 3; Review Focus 1); `50 a page`
    (choosing it navigates to `?per=50`: 45 rows, no `Pages` nav); `adding and removing a player`
    (picking `P3` navigates to `?players=3` and shows `Remove P3`; pressing it navigates to
    `/stats/games`); `every filter goes back to page 1` (from `?page=2`, picking `7 seats`
    navigates to `?size=7`); `an unknown player in the address is ignored` (`?players=99`: no chip,
    45 games); `nothing matches` (`?size=10`: `No games match these filters.` and `Clear filters` to
    `/stats/games`); `no games at all` (`makeData([])`: `No games recorded yet.` and no list); `a
    new page brings the list into view, a filter keeps the scroll` (Review Focus 3:
    `Element.prototype.scrollIntoView` and `window.scrollTo` stubbed with `vi.fn()`: clicking
    `Next ›` calls `scrollIntoView` once; picking `7 seats` calls neither).
- [ ] **Step 2: Run** `npm test -- --run src/stats/games`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add GAMES, the list of every recorded game`, ticking box 2.

---

### Task 3: The links in

**Files:**
- Modify: `frontend/src/constants/index.ts`, `frontend/src/login/LoginScreen.tsx`,
  `LoginScreen.test.tsx`, `frontend/src/lobby/LobbyScreen.tsx`, `LobbyScreen.test.tsx`,
  `frontend/src/App.tsx` (the victory screen), `frontend/src/App.css` (`.victory-game`),
  `frontend/src/App.test.tsx`
- Create: `frontend/src/constants/statsPaths.test.ts`, `frontend/e2e/stats-games.spec.ts`

**Interfaces:**
- Consumes: `GameState.gameId`, `FAKE_GAME_ID`, `PROMPTS`, `openFakeGame` (15A); `routePath`;
  `OutLink`.
- Produces in `constants`: `STATS_PATH = "/stats"` and `statsGamePath(id: string): string`
  (`"/stats/games/" + encodeURIComponent(id)`), the stats paths for the pages outside the chunk.
- Produces: the login footer's first line reads `How to play · Stats · About this project · Report a
  bug`, `Stats` a plain `<a href={STATS_PATH}>` (same tab); the lobby footer reads `Stats · About
  this project · Report a bug`, `Stats` an `OutLink` (new tab). The victory screen, when the packet
  has a string `gameId`, adds `p.victory-game` under the victory message with `<OutLink
  href={statsGamePath(gameId)}>See this game</OutLink>`; its link is a 44px-tall target at every
  size whose negative margins take back all but its line's height, as Sign out's
  (`LoginScreen.css`). Without a `gameId` there is no link.

- [ ] **Step 1: Write the failing tests.**
  - `statsPaths.test.ts` (Vitest, which may import `constants`): `STATS_PATH` equals
    `routePath({ page: "tab", tab: "overview" })`, and `statsGamePath("a b")` equals
    `routePath({ page: "game", id: "a b" })`.
  - `LoginScreen.test.tsx`: the footer test becomes `the footer links to the rules, the stats, the
    project and its issues`: `Stats` has `href="/stats"` and no `target`; the other three keep
    `target="_blank"` and `rel="noopener noreferrer"`; the first line's text is `How to play · Stats
    · About this project · Report a bug`.
  - `LobbyScreen.test.tsx`, `the footer links`: `Stats` has `href="/stats"`, `target="_blank"`,
    `rel="noopener noreferrer"`; the footer reads `Stats · About this project · Report a bug`.
  - `App.test.tsx`: `the victory screen links to its game in a new tab` (deliver a game packet, then
    a `FASCIST_VICTORY_POLICY` packet with `gameId: "g-1"`, run the queue on to RETURN TO LOBBY:
    `See this game` has `href="/stats/games/g-1"` and `target="_blank"`); `the victory screen has no
    game link without a gameId` (Review Focus 5: the same without `gameId`: no `See this game`, and
    the prompt's text and RETURN TO LOBBY are as before).
  - `stats-games.spec.ts`:
    - `the login page's Stats link opens the stats in the same tab` (`desktop` only): from `/`,
      click `Stats`: the same page is at `/stats` and `STATS` has `aria-current="page"`.
    - `the lobby's Stats link opens the stats in a new tab` (`desktop` only): `openFakeGame(page)`,
      click `Stats`: a popup at `/stats`, and the lobby still shows.
    - `See this game sits on the victory screen` (every project): `openFakeGame`, `PROMPTS`'
      victory packet: the link's `href` is `routePath({ page: "game", id: FAKE_GAME_ID })`, its
      `target` `_blank`; on a phone its box is at least 44x44.
- [ ] **Step 2: Run** `npm test -- --run`. Expected: the new Vitest tests FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`, then `E2E_PORT=4625 npx playwright
  test e2e/stats-games.spec.ts e2e/prompts.spec.ts e2e/prompt-close.spec.ts e2e/no-scroll.spec.ts
  e2e/phone.spec.ts`. Expected: PASS: the login page and the lobby still fit every size with the
  longer footers, and the victory prompt fits. Then the phone projects and `firefox` in the Linux
  image, serving the jar on port 4625, for the same specs. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): link to the stats from the login page, lobby and victory`,
  ticking box 3.

---

### Task 4: GAMES in the browser

**Files:**
- Modify: `frontend/e2e/stats-games.spec.ts`

**Interfaces:**
- Consumes: `stubStats`, `bigStatsData`, `statsSizesFor`, `checkStatsPage`, `statsPageProblems`,
  `NARROW_PHONE` (`e2e/stats.ts`, `e2e/layout.ts`); `routePath`; `outcomeLabel`; `openTable`,
  `play`, `isVictory` (`e2e/driveGame.ts`); `watchLobby` (`e2e/lobby.ts`).

- [ ] **Step 1: Write the tests:**
  - `GAMES, a hundred to a page, fits every size` and `GAMES with every filter set fits every size`
    (each `test.slow()`, `stubStats(page, bigStatsData())`, `settle`, then `checkStatsPage` at every
    `statsSizesFor(project, viewport)`): `/stats/games?per=100`, and
    `/stats/games?players=1,2,3&from=2025-10-01&to=2026-12-31&cpu=with`, which matches some games.
  - `twelve-character names stay inside their columns at 320px` (`test.slow()`; every project, at
    `NARROW_PHONE`; Review Focus 4): on `/stats/games?per=100&players=1,2`, every `.player-name` box
    lies inside its `.games-row-seats` with 1px to spare and clear of its row's `.games-row-counts`,
    every chip's name lies inside its chip, and `statsPageProblems(page).sideways` is `[]`.
  - `filters and pages through the address` (`desktop` only; Review Focus 3; `bigStatsData` has
    about 66 seven-seat games, so four pages): at `/stats/games` choose `7 seats` (address
    `?size=7`), click `Next ›` (`?size=7&page=2`), open the first row (its game's address, by
    `routePath`), `goBack()` (`?size=7&page=2`, the same rows), `goBack()` (`?size=7`), `goBack()`
    (`/stats/games`, `Any size`), `goForward()`, `reload()` (still `?size=7`, the select on `7
    seats`); add `WWWWWWWWWW01` (`?players=1&size=7`, its chip shown); `Clear filters` goes to
    `/stats/games`.
  - `a real game shows up in GAMES, and its victory screen opens its page` (`desktop` only, 180 s,
    `page.clock` as `spectator.spec.ts` uses it): `openTable(baseURL, 5)`, `watchLobby(page,
    table.lobby)`, `play(table)`; `id = table.latest()!.gameId`, not undefined. Run the page's clock
    on to RETURN TO LOBBY, click `See this game`: the popup is at `routePath({ page: "game", id })`
    and, reloading until the record lands (`expect(…).toPass()`), shows the game's `outcomeLabel`.
    Then a fresh page at `/stats/games`, `Add a player` set to `playerOrder[0]` (reloading until it
    is listed): a link to the game is in the list.
- [ ] **Step 2: Run** `E2E_PORT=4625 npx playwright test e2e/stats-games.spec.ts --project=desktop
  --project=phone-360 --project=phone-412`, and `--project=firefox` if Firefox launches here.
  Expected: PASS; fix the layout until it does, keeping every control the spec asks for.
- [ ] **Step 3: Run the Linux image**: serve the jar on port 4625, then `npx playwright test --config
  playwright.linux.config.ts e2e/stats-games.spec.ts --project=firefox --project=phone-360
  --project=phone-412`. Expected: PASS.
- [ ] **Step 4: Commit** `test(frontend): check GAMES in the browser`, ticking box 4.

---

### Task 5: Docs, the full run and the "after" screenshots

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `DEVELOPMENT.md`, `docs/PLAN.md`
- Create: `docs/pr/phase-15b-game-history/*.png`

- [ ] **Step 1: Update the docs.**
  - `CLAUDE.md`, Layout: GAMES (`games/`: `gamesFilter.ts` and its address, `pages.ts`, `GameRow`
    and its stretched link, `GamesPage`); the links in (login and lobby footers, the victory screen's
    `See this game`, `STATS_PATH` and `statsGamePath` in `constants`); `stats-games.spec.ts`.
  - `README.md`, "What this fork adds": game history at `/stats/games` (every recorded game, newest
    first, filtered by player, date, size, ending and CPU players), linked from the login page, the
    lobby and the victory screen; the stats tabs follow in later updates.
  - `DEVELOPMENT.md`, "Stats pages": GAMES' address parameters, for trying filters by hand.
- [ ] **Step 2: Run everything** and keep the counts: `cd backend && ./gradlew test`; `cd frontend
  && npm test -- --run && npm run build`; `npm run first-download` (at most 512 bytes over
  `first-download-before.txt`; save it as `<scratchpad>/first-download-after.txt`); `E2E_PORT=4625
  npm run e2e`; the Linux image's `firefox`, `phone-360` and `phone-412` over every spec. Expected:
  all PASS.
- [ ] **Step 3: Take the "after" screenshots.** In `pr-shots.spec.ts` set `PREFIX = "after"`; run it
  as in Task 0 Step 4; delete the spec.
- [ ] **Step 4: Commit** `docs(claude): describe games and the links in`, `docs(readme): add game
  history to what the fork adds`, `docs(development): list the games filter's parameters` and
  `docs(docs): add phase 15b's screenshots`, the last ticking box 5.

---

### Task 6: Review

- [ ] **Step 1: Review.** Run the `code-review` skill against `origin/development`, with the spec's
  GAMES and links-in sections, the interfaces file and this plan as the spec.
- [ ] **Step 2: Fix every finding**, Minor ones included, each with its test, or write down why it
  needs no change (for the PR's Review section). Re-run the tests the fixes touch, and commit each
  fix with its test; the last commit ticks box 6 (or `docs(plan): tick phase 15b's review` when no
  finding needed a change).

---

### Task 7: Pull request

- [ ] **Step 1: Rebase** if `origin/development` moved (Phases 16 and 17A may merge first):
  `git rebase origin/development`, keeping both sides of the docs; re-run Task 5 Step 2.
- [ ] **Step 2: Push and open the PR:** `git push -u origin phase-15b-game-history`, then `gh pr
  create --repo jussaw/Secret-Hitler-Online --base development --head phase-15b-game-history --title
  "feat(frontend): add game history and the links to it" --body-file <scratchpad file>`. The body,
  in order: **Before and after** (rows for the login footer, the lobby footer, the victory screen and
  GAMES (before: 15A's placeholder), each at 1600x900 and 412x915, before left and after right,
  linked by raw URL pinned to the pushed head); **Changes**; **Decisions the spec left open** (the
  address spellings, page and page size in the address, the row's stretched link, the CPU and size
  labels, the chips and the `Add a player` select); **Known limits** ("See this game" opened before
  its record is saved, or while the database is failing, says "This game was not found." until the
  page is reloaded, as the spec's Known limits say); **Review**; **Tests** (each new test, the
  counts, and the first download before and after, gzipped); **Docs**; `Part of #31`.
- [ ] **Step 3: Watch CI** (`gh pr checks <PR> --repo jussaw/Secret-Hitler-Online --watch
  --interval 30`) and fix what fails, as the `implement-issue` skill's step 9 does, until every
  check is green. Report the PR's number and head SHA. This task ends here, with the PR open and
  green.

---

### Task 8: Merge (resumable)

Run by the manager session under the user's standing OK. Each step checks the state first, so the
task can be picked up at any step.

- [ ] **Step 1: Read the PR:** `gh pr view <PR> --repo jussaw/Secret-Hitler-Online --json
  state,mergeable,mergeStateStatus,headRefOid`. `MERGED`: go to Step 5. `mergeable` `UNKNOWN`: read
  it again after a few seconds. `CONFLICTING`: Step 2; otherwise Step 3.
- [ ] **Step 2: Rebase** onto `origin/development`, keeping both sides of the docs; re-run the tests
  the conflicting files touch; `git push --force-with-lease`; point the PR's screenshot links at the
  new head (`gh pr edit <PR> --repo … --body-file …`); wait for green.
- [ ] **Step 3: Tick the boxes**, unless the branch's last commit already did: in Phase 15B's
  acceptance, "Backend and frontend unit tests pass…" and "PR merged into `development`", and its
  Progress row `done`; commit `docs(plan): tick phase 15b`, push, and wait for green.
- [ ] **Step 4: Merge:** `gh pr merge <PR> --repo jussaw/Secret-Hitler-Online --squash --admin
  --subject "feat(frontend): add game history and the links to it (#<PR>)"`.
- [ ] **Step 5: Watch** `development`'s run publish the image (`gh run list --repo
  jussaw/Secret-Hitler-Online --branch development --limit 1`, then `gh run watch`). The user's own
  box stays unticked.
