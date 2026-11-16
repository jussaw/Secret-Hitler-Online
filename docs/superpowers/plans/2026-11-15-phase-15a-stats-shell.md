# Phase 15A: Stats shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The stats pages' shell at `/stats`, loaded as a code chunk of its own, with everything
Phases 15B, 16 and 17A build on: `gameId` in every game packet, the server's fallback for `/stats`,
the record's types, labels, names, routes, links and data, the header, placeholder pages, and the
browser-test helpers every stats spec uses (issue #31).

**Architecture:** `main.tsx` checks the path once and renders either `App`, as today, or
`React.lazy`'s `StatsApp`, a chunk that holds no part of `App`. The server answers every path under
`/stats` with `index.html` (Javalin's single-page fallback). `StatsApp` fetches
`GET /api/stats/games` once per visit, parses it with a format check, reads its route from the
address (the History API, no router library) and draws the header and the route's page, each a
placeholder that a later phase fills. `e2e/stats.ts` gives every stats spec its stub data, sizes and
one page check.

**Tech Stack:** Java 17, Javalin 5.6.1 (`config.spaRoot.addFile`), org.json, JUnit 4 · React 18
(`React.lazy`, `Suspense`, `useSyncExternalStore`), TypeScript 5, Vite 8, Vitest with Testing
Library, `@playwright/test` 1.64.1, `lucide-react` (already a dependency).

**Spec:** [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](../specs/2026-11-15-game-stats-design.md):
"The stats pages: shell and routes (Phase 15)", "The record", the `gameId` line of "The links in",
Constraints, Anti-goals and Tests. Mockups in [`2026-11-15-game-stats/`](../specs/2026-11-15-game-stats/):
`stats-layout.jpg` (the header), `player-and-phone.jpg` (the phone header). Shared names:
[`2026-11-15-game-stats-interfaces.md`](2026-11-15-game-stats-interfaces.md), used exactly; its
sections "Settled after the plans were written" and "Rules every frontend phase keeps" win over this
plan. Parent plan: [`docs/PLAN.md`](../../PLAN.md), Phase 15A. GAMES itself and the links in are
Phase 15B ([`2026-11-15-phase-15b-game-history.md`](2026-11-15-phase-15b-game-history.md)). Read the
spec first; where this plan and the spec differ, the spec wins.

## Global Constraints

- **Needs Phase 14B merged:** `Lobby.gameId()`, `GET /api/stats/games`, the dev server's `/api`
  proxy and `frontend/src/stats/fixtures/recorded-games.json` are on `origin/development`.
- **Branch and worktree:** `phase-15a-stats-shell`, off an up-to-date `origin/development`.
- **What later phases fill:** `games/GamesPage.tsx` and its test (15B), `game/GamePage.tsx` and its
  test (16), `TabsPage.tsx` and its test (17A), `PlayerName.tsx` (22A makes names links),
  `players/PlayersPage.tsx` and
  `players/PlayerPage.tsx` (22B). After this phase no phase edits `StatsApp.tsx`.
- **Copy, exactly.** Header `SECRET-HITLER`, links `STATS`, `GAMES`, `PLAYERS`, `PLAY` (in a `nav`
  labelled `Stats pages`). `Loading the games…`; `Could not load the games. Reload the page to try
  again.`; `This page was not found.` with the link `Go to the stats`; `This game was not found.`
  with the link `All games`; `Coming in a later update.`; card titles `LATEST GAMES`, `GAMES`,
  `PLAYERS`, `PLAYER`; the link `All games ›`; the label `Seats in order:`. Results as `outcomeLabel` gives
  them. Page titles `<Page> · Secret Hitler Online` with `Stats`, `Games`, `Game`, `Players`,
  `Player`, `Not found`.
- **The game's first download:** `main.tsx` and the new `src/statsPath.ts` are the only changes to
  the entry's static imports. Nothing outside `src/stats/` imports from it except `main.tsx`'s
  `import("./stats/StatsApp")`; nothing in `src/stats/` imports `App.tsx`, the game, lobby or login
  pages, or `SoundManager` (leaf modules the entry already has, such as `constants`, are fine). On
  a stats path `main.tsx` neither listens for the sound gesture nor preloads the clips. The files
  `dist/index.html` loads grow by at most 1.5 KB gzipped over this phase's base (`npm run
  first-download`, Task 6).
- **Browser tests import no browser-only module.** `src/constants` reads `window` and
  `import.meta.env` when it loads, which throws in Playwright's Node process, so no `e2e/` file
  imports it or anything that imports it (`api.ts`, `App`). `record.ts`, `format.ts`, `routes.ts`
  and `testRecords.ts` import nothing that does; `STATS_GAMES_PATH` lives in `record.ts` (`api.ts`
  re-exports it), and specs build page paths with `routePath`.
- **ES2020 only:** `tsconfig.json` targets ES2020 and the build type-checks the tests, so no
  `Array.prototype.at`, `Object.hasOwn`, `replaceAll`, `findLast` or anything newer, in tests too.
- **Names never overflow:** `PlayerName` sets `overflow-wrap: anywhere`, and every grid or flex
  child on the stats pages has `min-width: 0`, so `WWWWWWWWWW01` wraps inside its column at 320px.
- **Touch sizes** follow the game's stacked query, `(max-width: 768px), (aspect-ratio < 5/4),
  (max-height: 500px)` (phones, phones held sideways, and narrow and tall windows): where it
  matches, every link, button, select and input of the stats pages is at least 44x44 CSS px
  (`MIN_TARGET`), except links inline in a sentence of a `p` (a name link in a table cell is not
  excepted), and every text field and select has 16px text or more (`MIN_FIELD_TEXT`). **The phone
  layout** (the header's links under the title) follows the game's phone-only query, written out
  where used:
  `((max-width: 768px) or (aspect-ratio < 5/4) or (max-height: 500px)) and (not ((min-width: 700px) and (aspect-ratio < 5/4)))`.
  At every size in `statsSizes` (from 320x568 to the desktops, square ones included) nothing scrolls
  sideways; anything wide scrolls inside its own card.
- **Look:** the game's. `App.css` styles every `header`, `button`, `a` and `p` and centres every
  `div`, so the stats CSS sets what it needs (left-aligned text, white header links). Cards as
  `.login-card` (`--backgroundDark`, radius 0.6em); Liberal `--textColorLiberal`, Fascist and Hitler
  `--textColorFascist` (Hitler underlined); titles in `--headerFont`, text in `--textFont`. No new
  art; icons from `lucide-react`.
- **Protocol:** game packets, to players and spectators, only gain `gameId` (a string, left out when
  null). `SecretHitlerGame` and `CpuPlayer` do not change.
- **Environment:** `npm ci` in `frontend/` and `npx playwright install chromium firefox` once.
  Gradle and `npm run e2e` with `JAVA_HOME` at an installed Java 17 (here
  any installed 17; the wrapper fails on newer JDKs). Every `npm run e2e`
  and `npx playwright` run gets `E2E_PORT=4615`, and the screenshot run `E2E_PORT=4715` (each free
  first: `lsof -iTCP:<port> -sTCP:LISTEN` prints nothing). No new dependency on either side.
- **Long browser tests:** every test that checks a page at every size calls `test.slow()`.
- **Time zones in tests:** pass a zone (`localDayKey(ms, "UTC")`), or build times from local parts
  (`new Date(2026, 10, 14, 21, 42)`); never set `process.env.TZ`, which leaks across Vitest's
  `vmThreads` files.
- **Linux fonts:** CI draws Germania One 11–17% wider than macOS at phone sizes. The header and the
  phone layouts are measured in `mcr.microsoft.com/playwright:v1.64.1-noble` (`DEVELOPMENT.md`,
  "Browser tests on Linux") before pushing, and `firefox` runs there too.
- **Commits:** Conventional Commits with a scope (`backend`, `frontend`, `plan`, `docs`, `claude`,
  `development`), each test in the commit of the code it tests. Task N (1 to 9) ticks the Nth box of
  Phase 15A in `docs/PLAN.md` in its last commit.
- **Public repo:** nothing about the hosting setup in code, docs, commits or the PR.

## Review Focus

1. **Back, forward, reload and deep links at any stats address:** the server answers every `/stats`
   path with the page, a reload of a game's address shows that game, and back after opening a game
   returns to the page before it. Tasks 2, 6 and 7 test it.
2. **Opening an in-page link in a new tab** (ctrl, cmd, shift or middle click): the browser does it;
   only a plain click moves the page in place. Task 5 tests it.
3. **The games response failing or malformed** (503, a network error, HTML from a proxy, `format`
   2): the header and one error line, never a blank page, and the next visit asks again. Tasks 5, 6
   and 7 test it.
4. **An address that names nothing** (`/stats/players/07`, `/stats/games/a/b`, a bad `%` escape, a
   game ID with no record, `/stats/overview`): the header and a short not-found line, never a throw.
   Tasks 5 and 6 test it.
5. **A twelve-character name of wide letters at 320px** (`WWWWWWWWWW01` in a ten-seat game): it wraps
   inside its line instead of pushing the page sideways. Task 7 tests it.

---

### Task 0: Start

No box: this task changes nothing that is committed.

- [ ] **Step 1: Check Phase 14B is in and this phase is planned.** `git fetch origin`, then all four
  must succeed: `git grep -n "String gameId()" origin/development --
  backend/src/main/java/server/util/Lobby.java`, `git grep -n "/api/stats/games" origin/development
  -- backend/src/main/java`, `git cat-file -e
  origin/development:frontend/src/stats/fixtures/recorded-games.json`, and `git grep -n "## Phase
  15A" origin/development -- docs/PLAN.md`. If any fails, stop and report.
- [ ] **Step 2: Make the worktree** `phase-15a-stats-shell` on a branch of the same name from
  `origin/development`, nested under the session's worktree. In `frontend/`: `npm ci` and `npx
  playwright install chromium firefox`. Check that ports 4615 and 4715 are free.
- [ ] **Step 3: Measure the game's first download on the base.** `cd frontend && npm run build`,
  then save the output of this to `<scratchpad>/first-download-before.txt`:

```bash
node -e 'const fs=require("fs"),z=require("zlib");const h=fs.readFileSync("dist/index.html","utf8");let t=0;for(const[,p]of h.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)){const n=z.gzipSync(fs.readFileSync("dist/"+p)).length;t+=n;console.log(p,n)}console.log("total",t)'
```

  No "before" screenshots: `/stats` is a 404 on the base, and nothing else on screen changes.

---

### Task 1: `gameId` in every game packet

**Files:**
- Modify: `backend/src/main/java/server/util/GameToJSONConverter.java`,
  `backend/src/main/java/server/util/Lobby.java` (`updatePlayer`, `updateSpectator`),
  `frontend/src/types/lobby_state.ts`, `frontend/e2e/fakeGame.ts`
- Create: `backend/src/test/java/server/util/LobbyGameIdTest.java`
- Test: `backend/src/test/java/server/SpectatorStateTest.java`,
  `backend/src/test/java/server/util/LobbySpectatorTest.java`

**Interfaces:**
- Consumes: `synchronized public String gameId()` on `Lobby` (Phase 14).
- Produces: `public static JSONObject convert(SecretHitlerGame game, String userName, String gameId)`
  and `public static JSONObject convertForSpectator(SecretHitlerGame game, String gameId)`, replacing
  the two-argument and one-argument forms. `publicState` puts `"gameId"` (org.json leaves out a
  null). `Lobby` passes `gameId()` in both, so every game packet, players' and spectators', the
  victory packet included, carries the running game's ID.
- Produces `gameId?: string` on `GameState` ("the game's record ID, in every game packet from a
  server that records games"), and in `fakeGame.ts` `FAKE_GAME_ID =
  "0f5e2c1a-7b3d-4e8f-9a6b-2c4d6e8f0a1b"`, put in `PROMPTS`' victory packet, so the scripted victory
  screen has the ID that Phase 15B's "See this game" reads.

- [ ] **Step 1: Write the failing tests.** `LobbyGameIdTest`, with five players
  (`LobbyTesting.join`) and a spectator on `FakeSocket`s:
  - `everyGamePacketCarriesTheGameId`: after `startNewGame` and `updateAllUsers`, every socket's
    `last()` has type `game` and `gameId` equal to `lobby.gameId()`, which is not null.
  - `theVictoryPacketCarriesTheGameId`: `String id = lobby.gameId()`, then
    `GameDriver.playOut(lobby.game(), g -> lobby.updateAllUsers())`; on every socket the last packet
    of type `game` is in a victory state and its `gameId` is `id`.
  - `eachGameHasItsOwnId`: after that game, `startNewGame` and `updateAllUsers`: the new packets'
    `gameId` is not null and not the first game's.

  In `SpectatorStateTest`, every `convert` and `convertForSpectator` call passes `GAME_ID =
  "game-1"`, and `ALWAYS` gains `"gameId"`, so `playerPacketsAreUnchanged` pins it in every player
  packet and `spectatorPacketKeepsEveryPublicField` in every spectator's. In `LobbySpectatorTest`,
  `playersGetTheSameKeysPlusTheCount` builds its expected keys from `convert(lobby.game(), "P1",
  lobby.gameId())`.
- [ ] **Step 2: Run** `cd backend && ./gradlew test --tests 'server.util.LobbyGameIdTest' --tests
  'server.SpectatorStateTest'`. Expected: compilation fails on the new signatures.
- [ ] **Step 3: Implement** as in Interfaces, with the converter's Javadoc listing `gameId`.
- [ ] **Step 4: Run** `./gradlew test`, then `cd ../frontend && npm run build` (it type-checks
  `fakeGame.ts`). Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): send the game's id in every game packet`, ticking box 1 and
  setting Phase 15A's Progress row to `in progress`.

---

### Task 2: The server answers every `/stats` path with the page

**Files:**
- Modify: `backend/src/main/java/server/SecretHitlerServer.java` (`createApp`)
- Create: `backend/src/test/resources/spa-test/index.html` (`<!doctype html><title>spa-test</title>`)
- Test: `backend/src/test/java/server/StatsFallbackTest.java`

**Interfaces:**
- Produces: `static Javalin createApp(String frontendDir)`, `frontendDir` a classpath directory
  (`/public`). When `frontendDir + "/index.html"` is on the classpath it serves the directory as
  today and adds `config.spaRoot.addFile("/stats", frontendDir + "/index.html",
  Location.CLASSPATH)`; otherwise neither (`addFile` throws for a missing file). `static Javalin
  createApp()` is `createApp("/public")`, so `main` and the other tests are unchanged.
- Javalin's fallback answers a GET that no route or file matched, whose path starts with `/stats`
  and whose `Accept` has `text/html` or `*/*` or is empty. Routes always answer first.

- [ ] **Step 1: Write the failing tests** (an app from `createApp("/spa-test")` on port 0, each
  request with `Accept: text/html`):
  - `everyStatsPathAnswersThePage`: `/stats`, `/stats/`, `/stats/games`,
    `/stats/games/7d0c6a3e-2f1b-4c55-9a7e-3b1d2c4e5f60`, `/stats/players/3` and `/stats/roles`
    each answer 200, a `Content-Type` starting `text/html`, and a body containing `spa-test`.
  - `routesAnswerFirst`: `/ping` answers 200 `OK`.
  - `otherPathsStay404`: `/nope` and `/game-over` answer 404.
  - `noFrontendNoFallback`: `createApp("/no-such-dir")` starts, and `/stats` answers 404.
- [ ] **Step 2: Run** `./gradlew test --tests 'server.StatsFallbackTest'`. Expected: compilation
  fails (no `createApp(String)`).
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `./gradlew test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(backend): answer every stats path with the page`, ticking box 2.

---

### Task 3: The record in TypeScript

**Files:**
- Create: `frontend/src/stats/record.ts`, `frontend/src/stats/record.test.ts`,
  `frontend/src/stats/testRecords.ts`

**Interfaces:**
- Produces `record.ts` exactly as the interfaces file gives it (importing nothing but types), and:
  - `export const STATS_GAMES_PATH = "/api/stats/games"`, here so browser tests can use it
    (`api.ts` re-exports it).
  - `export const EVENT_FIELDS: { readonly [T in GameEvent["type"]]: readonly string[] }`: each
    event type's keys besides `type`, `t` and `r`, in the spec's table order (`enact` lists `seat`,
    which a chaos policy leaves out).
  - `parseStatsData(json)` throws an `Error` naming the first problem it finds, and otherwise returns
    `json`, typed, in its own order. It checks: `players` is an array of `{ number: integer, name:
    string }`; `games` is an array; each game's `format` is `1` (else `Unsupported game record
    format: <format>`); `id` is a string; `startedAt` and `endedAt` are numbers; `outcome` is one of
    the five; `winner` is `LIBERAL`, `FASCIST` or null; `complete` and `hasCpu` are booleans;
    `liberalPolicies`, `fascistPolicies` and `rounds` are integers; `seats` is an array of `{ player:
    integer | null, name: string, cpu: boolean, role: Role, alive: boolean }`; `events` is an array
    of objects whose `type` is a key of `EVENT_FIELDS` and whose `t` and `r` are numbers.
  - `playerName(data, player)`: the player's current name, or `Player <number>` for a number with
    no player.
- Produces `testRecords.ts` (imported by tests only):
  - `makeRecord(overrides?)`: by default `id: "game-1"`, `format: 1`, `startedAt: new Date(2026,
    10, 14, 21, 42).getTime()` (local), `endedAt` 38 minutes later, `LIBERAL_POLICIES`, winner
    `LIBERAL`, `complete: true`, `hasCpu: false`, 5 Liberal and 2 Fascist policies, `rounds: 9`,
    `seats: makeSeats(["LIBERAL", "LIBERAL", "FASCIST", "LIBERAL", "HITLER"])`, and one event, `{
    type: "end", t: 2_280_000, r: 9, outcome: "LIBERAL_POLICIES" }`.
  - `makeSeats(roles, players?)`: seat `i` has `player` `players[i]` when `players` gives one (null
    included), else `i + 1`; `cpu` is `player === null`; `name` is `P<player>`, or `Bot <k>` for the
    k-th CPU seat; `alive: true`.
  - `makeData(games: GameRecord[], players?: Player[]): StatsData`: `players` defaults to every
    non-null seat player in `games`, named `P<number>`, ascending.

- [ ] **Step 1: Write the failing tests** in `record.test.ts`:
  - `parses the contract fixture`: `parseStatsData(fixture)` (imported from
    `./fixtures/recorded-games.json`) does not throw; it has at least one game; games are in order
    of `endedAt`, then `id`; every non-null seat `player` is a number in `players`; every event's
    keys, less `type`, `t` and `r`, equal `EVENT_FIELDS[type]` (an `enact` with `by: "chaos"`
    without `seat`); every game's last event is `end` with the game's `outcome`.
  - `refuses another format`: the fixture with one game's `format` set to 2 throws
    `/Unsupported game record format: 2/`.
  - `refuses a malformed response`: `null`, `{}`, `{ players: [], games: {} }`, and `makeData([...])`
    with a seat role `KING`, an outcome `DRAW`, an event type `nap`, or `events` missing: each
    throws.
  - `sideOf`: `HITLER` and `FASCIST` give `FASCIST`, `LIBERAL` gives `LIBERAL`.
  - `playerName`: `makeData([makeRecord()])` gives `P3` for 3 and `Player 9` for 9.
  - `the builders make valid data`: `parseStatsData(makeData([makeRecord(), makeRecord({ id:
    "game-2", seats: makeSeats(["LIBERAL", "LIBERAL", "LIBERAL", "FASCIST", "HITLER"], [1, 2, null,
    4, null]), hasCpu: true })]))` does not throw, and the CPU seats are named `Bot 1` and `Bot 2`.
- [ ] **Step 2: Run** `cd frontend && npm test -- --run src/stats/record.test.ts`. Expected: FAIL
  (no `record.ts`).
- [ ] **Step 3: Implement** `record.ts` and `testRecords.ts` as in Interfaces.
- [ ] **Step 4: Run** the same command, then `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): type and parse the game records`, ticking box 3.

---

### Task 4: Labels and player names

**Files:**
- Create: `frontend/src/stats/format.ts`, `format.test.ts`, `PlayerName.tsx`, `PlayerName.css`,
  `PlayerName.test.tsx` (all in `frontend/src/stats/`)

**Interfaces:**
- Consumes: `GameRecord`, `Role` (Task 3).
- Produces `format.ts`, as the interfaces file gives it (importing nothing that imports
  `src/constants`, so browser tests can use `outcomeLabel`), and:
  - `viewerTimeZone(): string`: `new Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - `localDayKey(ms: number, timeZone: string = viewerTimeZone()): string`: `YYYY-MM-DD` in that
    zone, from `Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day:
    "2-digit" }).formatToParts`. Phase 17A's `localDaysBetween` builds on it.
  - `formatLocalDate(ms: number, timeZone: string = viewerTimeZone()): string`, `"Sat 14 Nov
    2026"`, and `formatLocalTime(ms: number, timeZone: string = viewerTimeZone()): string`,
    `"9:42 PM"` (12-hour), both put together from `Intl.DateTimeFormat("en-US", { timeZone, … })
    .formatToParts` (weekday, day, month and year; hour, minute and day period), so the words are
    English whatever the machine's locale and tests pass a zone. `formatLocalDateTime(ms: number,
    timeZone: string = viewerTimeZone()): string` is `` `${formatLocalDate(ms, timeZone)},
    ${formatLocalTime(ms, timeZone)}` ``. Every local-time function in the stats takes the zone this
    way.
  - `formatDuration(ms)`: whole minutes, rounded; under 60 `"<m> min"`, else `"<h> h <mm> min"` with
    two-digit minutes.
  - `plural(n: number, noun: string): string`: `"1 round"`, `"7 rounds"`.
  - `outcomeLabel(record)` reads the counts from `liberalPolicies`, `fascistPolicies` and `rounds`.
- Produces `PlayerName({ player, name, role, link }: { player: number | null; name: string; role?:
  Role; link?: boolean })`: a `span` with class `player-name` plus `stats-liberal`, `stats-fascist`
  or `stats-hitler` for the role (none without one), `data-player` set to the number when there is
  one, and the name as text. `link` (default `true`) does nothing until Phase 22A makes names links;
  a name inside a sentence or a headline passes `link={false}` from now on. `PlayerName.css` gives
  `.player-name` `overflow-wrap: anywhere` and defines the three classes (`stats-hitler` is the
  Fascist colour, underlined), which any stats page may use for a side's word. Never put inside an
  `<a>`.

- [ ] **Step 1: Write the failing tests.** In `format.test.ts`, with `at = (…parts) => new
  Date(...parts).getTime()`:

```ts
const record = (o: Partial<GameRecord>) => makeRecord(o);
expect(outcomeLabel(record({}))).toBe("Liberals win · 5 Liberal policies");
expect(outcomeLabel(record({ outcome: "HITLER_EXECUTED" }))).toBe("Liberals win · Hitler executed");
expect(outcomeLabel(record({ outcome: "FASCIST_POLICIES", winner: "FASCIST", liberalPolicies: 3, fascistPolicies: 6 })))
  .toBe("Fascists win · 6 Fascist policies");
expect(outcomeLabel(record({ outcome: "HITLER_ELECTED", winner: "FASCIST" }))).toBe("Fascists win · Hitler elected");
expect(outcomeLabel(record({ outcome: "UNFINISHED", winner: null, rounds: 6, liberalPolicies: 4, fascistPolicies: 3 })))
  .toBe("Unfinished after round 6 · 4 L, 3 F");
expect([0, 29_999, 30_000, 38 * 60_000, 3_599_999, 65 * 60_000, 125 * 60_000].map(formatDuration))
  .toEqual(["0 min", "0 min", "1 min", "38 min", "1 h 00 min", "1 h 05 min", "2 h 05 min"]);
expect(formatLocalDate(Date.UTC(2026, 10, 14, 21, 42), "UTC")).toBe("Sat 14 Nov 2026");
expect(formatLocalDate(Date.UTC(2026, 8, 7, 12, 0), "UTC")).toBe("Mon 7 Sep 2026");
expect(formatLocalTime(Date.UTC(2026, 10, 14, 21, 42), "UTC")).toBe("9:42 PM");
expect(formatLocalTime(Date.UTC(2026, 10, 15, 0, 5), "UTC")).toBe("12:05 AM");
expect(formatLocalTime(Date.UTC(2026, 10, 15, 12, 0), "UTC")).toBe("12:00 PM");
expect(formatLocalDateTime(Date.UTC(2026, 10, 14, 21, 42), "UTC")).toBe("Sat 14 Nov 2026, 9:42 PM");
expect(formatLocalDateTime(Date.UTC(2026, 10, 15, 2, 42), "America/New_York")).toBe("Sat 14 Nov 2026, 9:42 PM");
expect(formatLocalDateTime(at(2026, 10, 14, 21, 42))).toBe("Sat 14 Nov 2026, 9:42 PM"); // the viewer's zone by default
expect(localDayKey(Date.UTC(2026, 0, 5, 23, 59), "UTC")).toBe("2026-01-05");
expect(localDayKey(Date.UTC(2026, 0, 6, 0, 0), "UTC")).toBe("2026-01-06");
expect(localDayKey(Date.UTC(2026, 0, 6, 3, 30), "America/New_York")).toBe("2026-01-05");
expect(localDayKey(Date.UTC(2026, 0, 5, 23, 30), "Asia/Tokyo")).toBe("2026-01-06");
expect(localDayKey(at(2026, 0, 5, 23, 59))).toBe("2026-01-05"); // the viewer's zone by default
expect(viewerTimeZone()).toBe(new Intl.DateTimeFormat().resolvedOptions().timeZone);
expect([plural(1, "round"), plural(7, "seat"), plural(0, "game")]).toEqual(["1 round", "7 seats", "0 games"]);
```

  In `PlayerName.test.tsx`: `colours a name by role` (each role's class, none without a role, the
  text is the name); `is plain text` (no `a` rendered, with `link` left out, `true` or `false`;
  `data-player="3"` for player 3, no `data-player` for a CPU seat's null).
- [ ] **Step 2: Run** `npm test -- --run src/stats`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the stats' labels and player names`, ticking box 4.

---

### Task 5: Routes, links and the data

**Files:**
- Create: `frontend/src/stats/routes.ts`, `routes.test.ts`, `StatsLink.tsx`, `StatsLink.test.tsx`,
  `api.ts`, `api.test.ts` (all in `frontend/src/stats/`)

**Interfaces:**
- Consumes: `StatsData`, `parseStatsData`, `STATS_GAMES_PATH` (Task 3); `SERVER_ADDRESS_HTTP`.
- Produces `routes.ts` exactly as the interfaces file gives it (importing React and `record.ts`'s
  types only, never `src/constants`, so browser tests can use `routePath`), and:
  - `export const TAB_IDS: TabId[]` (in the interfaces file's order) and `export interface PageProps
    { data: StatsData; route: StatsRoute }`, the props of every page component.
  - `parseRoute`: `/stats` and `/stats/` are the overview tab; `/stats/<tab>` each other tab;
    `/stats/games` (with or without a trailing slash) GAMES; `/stats/games/<id>` one game, the
    segment through `decodeURIComponent`; `/stats/players` PLAYERS; `/stats/players/<n>` one player
    when `<n>` matches `^[1-9][0-9]*$`; anything else, a bad escape included, `notFound`.
  - `routePath`: `/stats`, `/stats/<tab>`, `/stats/games`, `/stats/games/<encodeURIComponent(id)>`,
    `/stats/players`, `/stats/players/<n>`; `notFound` gives `/stats`.
  - `navigate(pathAndSearch)`: does nothing when it equals `location.pathname + location.search`;
    else `history.pushState(null, "", pathAndSearch)` and dispatches `new Event("stats-location")`
    on `window`, then `window.scrollTo(0, 0)` only when the pathname changed (a change of search,
    such as a filter, keeps the scroll position).
  - `useLocation()`: `useSyncExternalStore` on `popstate` and `stats-location`; the snapshot keeps
    its identity until the address changes.
- Produces `StatsLink({ href, className?, children, ...aria })`: an `<a href>` (any `aria-*` props
  passed on). A click with button 0, no ctrl, meta, shift or alt, on a link with no `target`, calls
  `preventDefault()` and `navigate(href)`; any other click is the browser's. It is the stats' one
  in-page link: 15B's rows, 17A's tab row and 22A's player links use it, and no phase makes another.
- Produces `api.ts`, as the interfaces file gives it, and: `STATS_GAMES_PATH` re-exported from
  `record.ts`; `STATS_LOAD_ERROR = "Could not load the games. Reload the page to try again."`;
  `resetStatsDataForTests(): void`, which forgets the module-level request (tests only: Vitest's
  `vmThreads` and React hooks do not mix with `vi.resetModules()`). `fetchStatsData()` GETs
  `SERVER_ADDRESS_HTTP + STATS_GAMES_PATH` and rejects on a non-2xx status (`/api/stats/games
  answered <status>`), a network error, a body that is not JSON, or `parseStatsData`'s error.
  `useStatsData()` shares one module-level request per page load (a failed one is forgotten, so the
  next mount asks again) and gives `{ data: null, error: null }` while it is pending, then `{ data,
  error: null }` or `{ data: null, error: STATS_LOAD_ERROR }`.

- [ ] **Step 1: Write the failing tests.**
  - `routes.test.ts`, `parseRoute reads every stats path` (Review Focus 4):

```ts
const cases: [string, StatsRoute][] = [
  ["/stats", { page: "tab", tab: "overview" }], ["/stats/", { page: "tab", tab: "overview" }],
  ["/stats/roles", { page: "tab", tab: "roles" }], ["/stats/records", { page: "tab", tab: "records" }],
  ["/stats/games", { page: "games" }], ["/stats/games/", { page: "games" }],
  ["/stats/games/abc-123", { page: "game", id: "abc-123" }], ["/stats/games/a%20b", { page: "game", id: "a b" }],
  ["/stats/players", { page: "players" }], ["/stats/players/7", { page: "player", number: 7 }],
  ...["/stats/players/07", "/stats/players/0", "/stats/players/x", "/stats/players/-1", "/stats/overview",
      "/stats/nope", "/stats/games/a/b", "/stats/games/%E0%A4%A"].map((p) => [p, { page: "notFound" }] as [string, StatsRoute]),
];
```

    plus `routePath` for each of those routes and `parseRoute(routePath(route))` equal to `route`;
    `navigate pushes once and tells useLocation` (a `renderHook` sees the new `pathname` and
    `search`, `history.length` grows by one; navigating to the same address again adds no entry);
    `navigate scrolls to the top only for a new page` (`/stats/games` to `/stats/games/g1`:
    `window.scrollTo` called with 0, 0; `/stats/games` to `/stats/games?size=7`: not called);
    `the back button tells useLocation` (`history.back()` then `waitFor` the old address).
  - `StatsLink.test.tsx` (Review Focus 2): `a plain click moves the page in place`
    (`fireEvent.click` returns false for a cancelled event, and `location.pathname` is the link's);
    `modified and middle clicks are the browser's` (ctrl, meta, shift, alt and `button: 1`: not
    cancelled, the address unchanged); `a link with a target is the browser's`.
  - `api.test.ts` (`resetStatsDataForTests()` in `beforeEach`, `fetch` stubbed; Review Focus 3):
    `fetches and parses the games` (the URL ends `/api/stats/games`, the fixture comes back
    parsed); `rejects a failed or malformed answer` (503; a network error; a body of `<html>`; the
    fixture with `format: 2`); `useStatsData gives the data` (pending, then the data); `useStatsData
    gives the error line` (`STATS_LOAD_ERROR` after a 503); `one request per page load` (two hooks
    mounted, then a third after both resolve: `fetch` called once); `a failure is asked again` (a
    503, then a new mount fetches again and gets the data).
- [ ] **Step 2: Run** `npm test -- --run src/stats`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): add the stats routes, links and data`, ticking box 5.

---

### Task 6: The shell and its placeholders

**Files:**
- Create: `frontend/src/statsPath.ts`, `frontend/src/statsPath.test.ts`,
  `frontend/scripts/first-download.mjs`
- Create in `frontend/src/stats/`: `StatsApp.tsx`, `StatsApp.css`, `StatsApp.test.tsx`,
  `StatsHeader.tsx`, `StatsHeader.css`, `StatsHeader.test.tsx`, `TabsPage.tsx`, `TabsPage.test.tsx`,
  `games/GamesPage.tsx`, `games/GamesPage.test.tsx`, `game/GamePage.tsx`, `game/GamePage.test.tsx`,
  `players/PlayersPage.tsx`, `players/PlayerPage.tsx`, `players/players.test.tsx`
- Modify: `frontend/src/main.tsx`, `frontend/package.json` (the script only, no dependency)

**Interfaces:**
- Consumes: Tasks 3 to 5.
- Produces `npm run first-download` (`node scripts/first-download.mjs`), for this phase and every
  later one: after `npm run build`, it prints each JS and CSS file `dist/index.html` loads with its
  gzipped size, then `total <bytes>`, the same computation as Task 0's one-liner, so its numbers
  compare with the base's.
- Produces `isStatsPath(pathname: string): boolean` in `src/statsPath.ts` (outside `src/stats/`, so
  the entry holds only this): `/stats`, or a path starting `/stats/`.
- Produces in `main.tsx`: `const StatsApp = React.lazy(() => import("./stats/StatsApp"))`; on a stats
  path it renders `<React.StrictMode><Suspense fallback={null}><StatsApp /></Suspense></React.StrictMode>`
  and skips `sounds.listenForGesture` and `sounds.preload`; otherwise it does what it does today.
- Produces `StatsApp` (default export, no props): `parseRoute(useLocation().pathname)` and
  `useStatsData()`; a `div.stats-screen` holding `StatsHeader` and `main.stats-main`, which shows
  `Loading the games…` (`role="status"`) while pending, `STATS_LOAD_ERROR` (`role="alert"`) on
  failure, and otherwise the route's page: `TabsPage`, `games/GamesPage`, `game/GamePage`,
  `players/PlayersPage`, `players/PlayerPage`, or `This page was not found.` with a `StatsLink` `Go
  to the stats` to `/stats`. It sets `document.title` from the route (Global Constraints).
- Produces `StatsHeader({ route }: { route: StatsRoute })`: a `header.stats-header` with
  `SECRET-HITLER` and `nav` `Stats pages`: `StatsLink`s `STATS` (`/stats`), `GAMES`
  (`/stats/games`), `PLAYERS` (`/stats/players`) and a plain `<a href="/">PLAY</a>` (a full load of
  the game). `aria-current="page"` marks `STATS` for a tab, `GAMES` for GAMES and a game, `PLAYERS`
  for PLAYERS and a player, and none for `notFound`; the current link is underlined. The title is
  the game header's size (`clamp(18px, 3.4vh, 40px)`); the links are white Montserrat 700, each at
  least 44x44 at every size. Desktop: the title at the left, the links at the right, in one row
  (`stats-layout.jpg`). Phone layout: the title centred, then the four links as a row of equal
  columns (`player-and-phone.jpg`).
- Produces `StatsApp.css`: `.stats-screen` (left-aligned text, its `div`s too), `.stats-main`
  (`box-sizing: border-box; width: min(100%, 1100px); margin: 0 auto`, padding 16px, 8px on
  phones), `.stats-card` and `.stats-card-title` (the card look of Global Constraints, the title in
  `--headerFont`), which 17A's `StatCard` reuses. Every grid and flex child in the shell's CSS has
  `min-width: 0`.
- Produces the placeholders, each its file's default export, `(props: PageProps) => JSX.Element`:
  - `TabsPage` (17A fills it): a `.stats-card` `LATEST GAMES`, a list of the ten newest games (by
    `endedAt`, then `id`), each a `StatsLink` to its game reading `` `${formatLocalDateTime(startedAt)}
    · ${outcomeLabel(record)}` `` (at least 44px tall where the stacked query matches), then a
    `StatsLink` `All games ›` to `/stats/games`; `No games recorded yet.` with none.
  - `games/GamesPage` (15B fills it): a `.stats-card` `GAMES` saying `Coming in a later update.`
  - `game/GamePage` (16 fills it): for the game whose `id` is the route's, an `h1` of `outcomeLabel`
    (its first word in `stats-liberal` or `stats-fascist` by `winner` when there is one), the line
    `` `${formatLocalDateTime(startedAt)} · ${formatDuration(endedAt - startedAt)} · ${plural(rounds,
    "round")}` ``, and `Seats in order:` then the seats as `PlayerName`s with roles, joined by ` · `
    (`.game-seats`). With no such game, `This game was not found.` and a `StatsLink` `All games` to
    `/stats/games`.
  - `players/PlayersPage` and `players/PlayerPage` (22B fills them): a `.stats-card` titled
    `PLAYERS` or `PLAYER` saying `Coming in a later update.`

- [ ] **Step 1: Write the failing tests.**
  - `statsPath.test.ts`: true for `/stats`, `/stats/`, `/stats/games/abc`; false for `/`, `/stat`,
    `/statsx`, `/x/stats`.
  - `StatsHeader.test.tsx`: `links to the four places` (hrefs `/stats`, `/stats/games`,
    `/stats/players`, `/`); `marks where you are` (the `aria-current` link for each route kind, as in
    Interfaces).
  - `StatsApp.test.tsx` (`fetch` stubbed with `makeData` of 25 games from `makeRecord`, ids `g01` to
    `g25` an hour apart, `resetStatsDataForTests()` before each test): `the header and a loading line
    until the games come`; `a game from the latest games, and back` (at `/stats`, click the newest
    game's link: the address is `/stats/games/g25` and the page shows its `outcomeLabel`;
    `history.back()`: `/stats` and `LATEST GAMES` again; Review Focus 1); `the games are fetched
    once` (moving between `/stats`, a game, GAMES and PLAYERS through the header: `fetch` called
    once); `an error line when the games cannot be loaded` (a 503: the header and
    `STATS_LOAD_ERROR`; Review Focus 3); `a short page for an address that names nothing`
    (`/stats/nowhere` and `/stats/players/07`: `This page was not found.`, `Go to the stats`;
    Review Focus 4); `the page title follows the page` (`Stats · Secret Hitler Online`, `Game ·
    Secret Hitler Online`, `Not found · Secret Hitler Online`).
  - `TabsPage.test.tsx`: `the ten latest games and a link to the rest` (25 games: `g25` to `g16`,
    each linking to its game, `All games ›` to `/stats/games`); `no games` (`No games recorded
    yet.`).
  - `games/GamesPage.test.tsx`: `says GAMES is coming` (`GAMES`, `Coming in a later update.`).
  - `game/GamePage.test.tsx`: `the game's line and its seats` (the `h1`, `Sat 14 Nov 2026, 9:42 PM ·
    38 min · 9 rounds`, the seats in order with their role classes); `an unknown game` (`This game
    was not found.`, `All games`; Review Focus 4).
  - `players/players.test.tsx`: both pages say `Coming in a later update.` under their titles.
- [ ] **Step 2: Run** `npm test -- --run src/stats src/statsPath.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS. Then check the build
  output: `dist/assets` has a `StatsApp-*.js` chunk; `grep -l "/api/stats/games" dist/assets/*.js`
  lists no file that `dist/index.html` names; and `npm run first-download`'s `total` is at most
  1536 bytes over `first-download-before.txt`'s.
- [ ] **Step 5: Commit** `feat(frontend): load the stats pages as their own chunk`, ticking box 6.

---

### Task 7: The browser-test helpers and the shell in the browser

**Files:**
- Create: `frontend/e2e/stats.ts`, `frontend/e2e/stats-shell.spec.ts`
- Modify: `frontend/playwright.config.ts` (`firefox`'s `testMatch` becomes
  `/(no-scroll|sounds|spectator|prompt-close|button-press|stats-[a-z-]+)\.spec/`, so no later
  phase edits it)

**Interfaces:**
- Consumes: `parseStatsData`, `EVENT_FIELDS`, `STATS_GAMES_PATH`, `StatsData` (Task 3, from
  `record.ts`); `routePath` (Task 5); `DESKTOP_SIZES`, `SQUARE_DESKTOPS`, `NARROW_WINDOWS`,
  `NARROW_PHONE`, `MIN_TARGET`, `MIN_FIELD_TEXT` (`e2e/layout.ts`); `settle` (`e2e/lobby.ts`).
  Never `api.ts` or `src/constants` (Global Constraints).
- Produces in `e2e/stats.ts`, for every `stats-*.spec.ts` of Phases 15B to 22:
  - `type Size = { width: number; height: number }`; `PHONE_SIZES: Size[]` (360x740, 412x915,
    `NARROW_PHONE`); `statsSizes: Size[]` (`DESKTOP_SIZES`, `SQUARE_DESKTOPS`, `NARROW_WINDOWS`,
    then `PHONE_SIZES`); `statsSizesFor(project: string, viewport: Size): Size[]` (`statsSizes` in
    `desktop` and `firefox`; the project's own viewport, plus `NARROW_PHONE` in `phone-360`).
  - `stubStats(page: Page, data: StatsData): Promise<void>`: routes `**/api/stats/games` to `data`
    as JSON; call it before `goto`.
  - `bigStatsData(): StatsData`, the same on every call (a seeded generator, never `Math.random`).
    Players 1 to 10, named `"W".repeat(10)` and a two-digit number (`WWWWWWWWWW01` to
    `WWWWWWWWWW10`). 400 games, `big-001` to `big-400`, oldest first, four an evening every third or
    fourth evening from `Date.UTC(2025, 9, 6, 19, 0)`, each 15 to 60 minutes long. Sizes cycle
    through 5 to 10; human seats are different players; every seventh game has one or two CPU seats
    (`Bot 1`, `Bot 2`, `player: null`, `cpu: true`, `hasCpu: true`), Hitler among them at least once;
    every 25th game (`big-025`, `big-050`, …) is `UNFINISHED` (`winner: null`), the rest cycle
    through the four endings; `big-200` has `complete: false` and opens with `restored`. Later
    phases assume nothing else about it. Its timelines follow the rules closely enough for Phases 16
    to 22: `r` starts at 1 and goes up by one at each `nominate`; a `vote` per living seat and an
    `election` counting them (`passed` when Ja outnumber Nein) follow each `nominate`; a failed
    election moves `tracker` (1 to 3), and the third enacts a policy `by: "chaos"`; a passed one has
    `draw`, `discard` (`card` is `cards[index]`), then the chancellor's `enact` of one of the two
    left, or `veto` and `vetoAnswer` (accepted moves the tracker); a Fascist policy that unlocks a
    power for the seat count (5–6: peek at 3, execute at 4 and 5; 7–8: investigate at 2, special
    election at 3, execute at 4 and 5; 9–10: investigate at 1 and 2, special election at 3, execute
    at 4 and 5) is followed by its event; each term that does not end the game ends with `endTerm`
    (`by: "countdown"` in every fifth); some terms have `timerPause` then `timerResume`, some games a
    `disconnect` then `reconnect` of a human seat; `reshuffle` comes when fewer than three cards are
    left; `end` is last; the last `enact`'s counts are the record's board; `HITLER_ELECTED` ends on
    Hitler's election with three or more Fascist policies, `HITLER_EXECUTED` on an `execute` of
    Hitler; executed seats end with `alive: false`.
  - `STACKED_QUERY = "(max-width: 768px), (aspect-ratio < 5/4), (max-height: 500px)"`.
  - `statsPageProblems(page: Page): Promise<{ sideways: string[]; smallTargets: string[];
    smallText: string[] }>`, each entry `tag#id "text" WxH` (or `… 14px`), as `e2e/layout.ts`
    writes them, measured at the page's current size:
    - `sideways`: `document.body.scrollWidth` or `document.documentElement.scrollWidth` above the
      viewport's width (as `scrollWidth <W>`; `App.css` hides `overflow-x` on both, so only
      `scrollWidth` shows it), and every visible element in `body` reaching more than 1px past
      either side, except one inside a box that scrolls sideways itself: computed `overflow-x`
      `auto` or `scroll`, and not `body`, `.stats-screen` or `.stats-main` (an `overflow-y`
      container computes `overflow-x: auto` too). That box itself still counts. So a
      `ScrollRegion`'s table or the phone tab row is not past the edge, and nothing else is exempt.
    - `smallTargets`, only while `matchMedia(STACKED_QUERY)` matches: every visible `a`, `button`,
      `select`, `input` (not `hidden`), `summary` and `[role="button"]` in `.stats-screen` narrower
      or shorter than `MIN_TARGET`, except an `a` inline in a sentence (computed `display: inline`,
      inside a `p` with no `td` or `th` between, with non-blank text of the `p` outside it); a name
      link in a table cell is never excepted. A checkbox or radio is measured by its `label`.
    - `smallText`, only while the stacked query matches and only for the text fields there are (none,
      no check): every visible `input` that takes typed text or a date, `select` and `textarea` in
      `.stats-screen` whose text is below `MIN_FIELD_TEXT`.
  - `checkStatsPage(page: Page, size: Size): Promise<void>`: sets the viewport to `size`, then
    expects each of `statsPageProblems`' three lists to be `[]`, named with the size (`sideways at
    360x740`). Later phases import it and write no sideways check of their own. (`smallTargets` and
    `smallFieldText` in `e2e/layout.ts` measure neither plain links, selects nor date inputs, so the
    stats pages do not use them.)
  - `STATS_ONLY_STRINGS = ["/api/stats/games", "Could not load the games", "This page was not
    found"]` (ASCII, so the minifier keeps them as written); `downloads(page: Page, path: string):
    Promise<{ url: string; type: string; body: string }[]>`: every same-origin response while
    `goto(path, { waitUntil: "networkidle" })` loads, with its resource type and, for scripts and
    stylesheets, its text (`""` for the rest).

- [ ] **Step 1: Write the tests** in `stats-shell.spec.ts`:
  - `bigStatsData() is a valid response` (`desktop` only): `parseStatsData` takes it; 400 games; ten
    players with twelve-character names; every outcome, every `EVENT_FIELDS` type, a CPU game, an
    `UNFINISHED` game and a `complete: false` game; each game's last event is `end` with its outcome
    and its last `enact` has its board.
  - `the page check catches what it should` (`desktop` only, on `page.setContent` pages with a
    `.stats-screen` holding a `.stats-main`, and App.css's `overflow-x: hidden` on `html` and
    `body`, at 360x740 and 1600x900): a 2000px-wide `div` is in `sideways`; the same `div` inside an
    `overflow-x: auto` box 300px wide is not; the same `div` straight inside a `.stats-main` with
    `overflow-y: auto` still is; at 360x740 a 30px-tall button is in `smallTargets`, a link inside a
    sentence of a `p` is not, and a 20px-tall link in a `td` beside text is; a 14px text input is
    in `smallText`, and a page with no field gives `smallText` `[]`; at 1600x900 the 30px button and
    the 14px input are not reported.
  - One test per page, `<page> fits every size`, each calling `test.slow()`, then `stubStats(page,
    bigStatsData())`, `goto`, `settle`, and `checkStatsPage` at every `statsSizesFor(project,
    viewport)`: `the stats home` (`/stats`); `GAMES' placeholder` (`/stats/games`); `a game's page`
    (the first ten-seat CPU game, by `routePath`); `an unknown game` (`/stats/games/no-such-game`);
    `PLAYERS`; `a player's page` (`/stats/players/1`); `an unknown address` (`/stats/nowhere`).
    Then two without `stubStats`'s data: `the loading line` (the route never answers) and `the
    error line` (the route answers 503).
  - `a twelve-character name stays inside its line at 320px` (`test.slow()`; every project, at
    `NARROW_PHONE`; Review Focus 5): on a ten-seat game's page, every `.player-name` box lies inside
    `.game-seats` with 1px to spare, and nothing is in `sideways`.
  - `the game's first download holds no stats code` (`desktop` only; each load in a fresh page from
    `browser.newPage()`, so nothing comes from the cache): `downloads(page, "/")` has no body with
    any of `STATS_ONLY_STRINGS` and fetches at least one `.ogg` or `.mp3` clip; with `stubStats`,
    `downloads(page, "/stats")` has a script whose body has `STATS_GAMES_PATH` and fetches no clip.
    This check is permanent; the byte count is `npm run first-download`'s, in each phase's verify.
  - `the header moves between the pages in place` (`desktop` only): mark the window
    (`window.stayed = true`), click `GAMES`, `PLAYERS`, `STATS`, then a latest game: the address
    follows each, the current link has `aria-current="page"`, and `window.stayed` is still true;
    `PLAY` loads `/`.
  - `back, forward, reload and a deep link` (`desktop` only; Review Focus 1): at `/stats` open the
    newest game, `goBack()` (`/stats`, `LATEST GAMES`), `goForward()` (the game), `reload()` (still
    the game, served by the fallback); `goto("/stats/players/1")` shows `PLAYER`.
- [ ] **Step 2: Run** `E2E_PORT=4615 npx playwright test e2e/stats-shell.spec.ts --project=desktop
  --project=phone-360 --project=phone-412`, and `--project=firefox` if Firefox launches here.
  Expected: PASS; fix the layout until it does.
- [ ] **Step 3: Run the Linux image** (`DEVELOPMENT.md`, "Browser tests on Linux"): serve the jar on
  port 4615, then `npx playwright test --config playwright.linux.config.ts e2e/stats-shell.spec.ts
  --project=firefox --project=phone-360 --project=phone-412`. Expected: PASS.
- [ ] **Step 4: Commit** `test(frontend): add the stats test helpers and check the shell`, ticking
  box 7.

---

### Task 8: Docs, the full run and the screenshots

**Files:**
- Modify: `CLAUDE.md`, `DEVELOPMENT.md`, `docs/PLAN.md`
- Create: `docs/pr/phase-15a-stats-shell/*.png`

- [ ] **Step 1: Update the docs.**
  - `CLAUDE.md`, Layout, backend: `createApp(frontendDir)` and the `/stats` fallback (prefix match,
    HTML requests only, routes first, `StatsFallbackTest`); `gameId` in every game packet through
    the converter (`LobbyGameIdTest`). Frontend: `src/statsPath.ts` and `main.tsx`'s lazy
    `StatsApp` (no sound gesture or preload there); `src/stats/`'s files, what each does, and which
    later phase fills each placeholder; `PlayerName`'s `link`. Browser tests: `e2e/stats.ts`
    (`statsSizes` and `statsSizesFor`, `stubStats`, `bigStatsData` and its rules,
    `statsPageProblems` and `checkStatsPage`, which every `stats-*.spec.ts` uses, `downloads`),
    `stats-shell.spec.ts`, `firefox` running `stats-*.spec`, and that no `e2e/` file imports
    `src/constants`. Commands: `npm run first-download`. Constraints: the protocol line adds that
    recording only adds `gameId`.
  - `DEVELOPMENT.md`: a "Stats pages" section: `/stats` on the dev server and on the jar; games are
    recorded as they finish (one signed-in test account and four CPU players make a game); browser
    tests stub `/api/stats/games` with `bigStatsData`, and each `stats-*.spec.ts` runs in every
    project and checks its pages with `checkStatsPage`; `npm run first-download` (after `npm run
    build`) gives the game's first download in gzipped bytes, which a stats phase must leave as it
    was.
  - `README.md` is unchanged: nothing links to `/stats` until Phase 15B, which adds it to "What this
    fork adds".
- [ ] **Step 2: Run everything** and keep the counts: `cd backend && ./gradlew test`; `cd frontend
  && npm test -- --run && npm run build`; `npm run first-download` (at most 1536 bytes over
  `first-download-before.txt`; save it as `<scratchpad>/first-download-after.txt`); `E2E_PORT=4615
  npm run e2e`; the Linux image's `firefox`, `phone-360` and `phone-412` over every spec. Expected:
  all PASS.
- [ ] **Step 3: Take the screenshots.** Write `frontend/e2e/pr-shots.spec.ts`, never committed:
  `test.skip(!process.env.PR_SHOTS)`, 1600x900 in `desktop` and 412x915 in `phone-412`, each saved
  to `docs/pr/phase-15a-stats-shell/after-<state>-<W>x<H>.png`, with `stubStats(page,
  bigStatsData())` and `settle`. States: `stats` (`/stats`) and `game` (a ten-seat game's page). Run
  `PR_SHOTS=1 E2E_PORT=4715 npx playwright test e2e/pr-shots.spec.ts --project=desktop
  --project=phone-412`, then delete the spec.
- [ ] **Step 4: Commit** `docs(claude): describe the stats shell`, `docs(development): describe the
  stats pages and their tests` and `docs(docs): add phase 15a's screenshots`, the last ticking box 8.

---

### Task 9: Review

- [ ] **Step 1: Review.** Run the `code-review` skill against `origin/development`, with the spec's
  Phase 15 sections (the shell, the record, `gameId`), the interfaces file and this plan as the
  spec.
- [ ] **Step 2: Fix every finding**, Minor ones included, each with its test, or write down why it
  needs no change (for the PR's Review section). Re-run the tests the fixes touch, and commit each
  fix with its test; the last commit ticks box 9 (or `docs(plan): tick phase 15a's review` when no
  finding needed a change).

---

### Task 10: Pull request

- [ ] **Step 1: Rebase** if `origin/development` moved: `git rebase origin/development`, keeping both
  sides of the docs; re-run Task 8 Step 2.
- [ ] **Step 2: Push and open the PR:** `git push -u origin phase-15a-stats-shell`, then `gh pr
  create --repo jussaw/Secret-Hitler-Online --base development --head phase-15a-stats-shell --title
  "feat(frontend): add the stats shell" --body-file <scratchpad file>`. The body, in order: **Before
  and after** (`/stats` and a game's page at 1600x900 and 412x915, "before" reading `New page (was a
  404)`, linked by raw URL pinned to the pushed head); **Changes** (server, page, tests);
  **Decisions the spec left open** (the copy of the loading, error and not-found lines, the year
  always shown, touch sizes on the stacked query and the layout on the phone-only one, the
  structural first-download check, the placeholders' content, `PlayerName`'s `link`); **Known
  limits** (`/statsx` also gets the page, which then shows the login page); **Review**; **Tests**
  (each new test, the counts, and the first download before and after, gzipped); **Docs**; `Part of
  #31`.
- [ ] **Step 3: Watch CI** (`gh pr checks <PR> --repo jussaw/Secret-Hitler-Online --watch
  --interval 30`) and fix what fails, as the `implement-issue` skill's step 9 does, until every
  check is green. Report the PR's number and head SHA. This task ends here, with the PR open and
  green.

---

### Task 11: Merge (resumable)

Run by the manager session under the user's standing OK. Each step checks the state first, so the
task can be picked up at any step.

- [ ] **Step 1: Read the PR:** `gh pr view <PR> --repo jussaw/Secret-Hitler-Online --json
  state,mergeable,mergeStateStatus,headRefOid`. `MERGED`: go to Step 5. `mergeable` `UNKNOWN`: read
  it again after a few seconds. `CONFLICTING`: Step 2; otherwise Step 3.
- [ ] **Step 2: Rebase** onto `origin/development`, keeping both sides of the docs; re-run the tests
  the conflicting files touch; `git push --force-with-lease`; point the PR's screenshot links at the
  new head (`gh pr edit <PR> --repo … --body-file …`); wait for green.
- [ ] **Step 3: Tick the boxes**, unless the branch's last commit already did: in Phase 15A's
  acceptance, "Backend and frontend unit tests pass…" and "PR merged into `development`", and its
  Progress row `done`; commit `docs(plan): tick phase 15a`, push, and wait for green.
- [ ] **Step 4: Merge:** `gh pr merge <PR> --repo jussaw/Secret-Hitler-Online --squash --admin
  --subject "feat(frontend): add the stats shell (#<PR>)"`.
- [ ] **Step 5: Watch** `development`'s run publish the image (`gh run list --repo
  jussaw/Secret-Hitler-Online --branch development --limit 1`, then `gh run watch`). The user's own
  box stays unticked.
