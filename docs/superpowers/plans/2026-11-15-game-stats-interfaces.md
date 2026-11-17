# Game records and stats: shared interfaces

**Spec:** [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](../specs/2026-11-15-game-stats-design.md).
Parent plan: [`docs/PLAN.md`](../../PLAN.md), Phases 13 to 22.

Phases 13 to 22 are built by different subagents, several at once, each seeing only its own
breakdown. This file pins the names, types and files that cross from one phase to another. Every
breakdown uses them exactly; a phase may add names of its own, but changes none of these without
changing this file in the same commit. Where this file and the spec differ, the spec wins and this
file is fixed.

**Phase numbers after the split.** Five phases became an A and a B part. Where this file names
an unqualified phase, read it as: Phase 14 = 14A for the timeline and `Lobby`, 14B for the store,
the route and the fixture; Phase 15 = 15A, except GAMES and the links in (15B); Phase 17 = 17A,
except `overview.ts` and OVERVIEW (17B); Phase 21 = 21A for `activity.ts`, `timing.ts` and the bar
chart and heatmap, 21B for `records.ts` and RECORDS; Phase 22 = 22A for trophies, name links,
trophy holders and the game page's Elo change, 22B for PLAYERS and the player page. The ownership
table below is exact.

## Who owns which files

A phase creates and changes only its own files, plus the docs (`CLAUDE.md`, `README.md`,
`DEVELOPMENT.md`, its own section of `docs/PLAN.md`). Phases in the same wave never edit the same
source file. The waves (the spec's Phases section): 13 and 14A; 14B (after 13 merges); 15A; 15B, 16
and 17A; 17B, 18, 19, 20 and 21A; 21B; 22A; 22B.

| Phase | Owns (creates) | Also changes |
|---|---|---|
| 13 | `devops/` (`backup-db.sh`, `restore-db.sh`, `.env.example`, `tests/backup-restore.test.sh`), `DatabaseWalTest`, `StartupLineTest` | `Dockerfile` (sqlite3), `.gitignore` (`devops/.env`), `.github/workflows/ci.yml` (a `devops` job), `SecretHitlerServer` (WAL at start, the startup line, in methods of its own), `README.md`'s container name |
| 14A | `server/stats/GameSnapshot`, `TimelineDiff`, `GameRecord`, `GameRecordSink` and their tests | `Lobby` (timeline fields and hooks, `gameId()`, `writeObject` under its lock, `readObject`; the sweep's unfinished record, in `closeIfTimedOut`), `SecretHitlerServer` (`markLobbiesChanged`, a method of its own, and `hasLobbyChanged` volatile) |
| 14B | the rest of `backend/src/main/java/server/stats/` (`GameStore`, `GameRecorder`, `StatsRoutes`) and their tests, `frontend/src/stats/fixtures/recorded-games.json`, `frontend/e2e/recorder.spec.ts` | `SecretHitlerServer` (tables, route, load-time drop, retries, shutdown flush, in methods of its own), the rename path (it empties the response's cache), `backend/build.gradle` (the fixture task), `frontend/vite.config.ts` (`/api` proxy) |
| 15A | `frontend/src/stats/` shell files below (`record.ts`, `testRecords.ts`, `format.ts`, `PlayerName.tsx`, `routes.ts`, `StatsLink.tsx`, `api.ts`, `StatsApp.tsx`, `StatsHeader.tsx`), the five page placeholders (`TabsPage.tsx`, `games/GamesPage.tsx`, `game/GamePage.tsx`, `players/PlayersPage.tsx`, `players/PlayerPage.tsx`), `frontend/src/statsPath.ts` (outside `stats/`, so the entry chunk holds no stats code), `frontend/e2e/stats.ts`, `frontend/e2e/stats-shell.spec.ts`, `frontend/scripts/first-download.mjs` | `frontend/src/main.tsx`, `frontend/package.json` (the `first-download` script), `SecretHitlerServer` (SPA fallback for `/stats`), `GameToJSONConverter` and `Lobby`'s two calls of it (`gameId`), the spectator packet tests' key lists, `types/lobby_state.ts`, `e2e/fakeGame.ts` (the victory packet's `gameId`), `frontend/playwright.config.ts` (firefox runs `stats-*.spec`) |
| 15B | `games/gamesFilter.ts` and the rest of `games/`, `frontend/e2e/stats-games.spec.ts` | `games/GamesPage.tsx` (fills 15A's placeholder), `constants/` (`STATS_PATH`, `statsGamePath`), `LoginScreen.tsx`, `LobbyScreen.tsx` and their tests, the victory screen in `App.tsx` and `App.css` |
| 16 | `frontend/src/stats/rounds.ts`, the rest of `frontend/src/stats/game/` (its header is `game/GameHeader.tsx`; `game/sampleGames.ts` holds the `ev` test builders), `frontend/e2e/stats-game.spec.ts` | `game/GamePage.tsx` (fills 15A's placeholder) |
| 17A | `counting.ts`, `elo.ts`, `useStats.ts`, `numbers.ts`, `testGames.ts`, `StatCard.tsx`, `RankedTable.tsx`, `SplitTable.tsx`, `ScrollRegion.tsx`, `FilterBar.tsx`, `TabRow.tsx`, `charts/` (`LineChart.tsx`, `StackedBarChart.tsx`, `useChartWidth`, `axis.ts`, `charts.css`, `SERIES_COLORS`), every file in `tabs/` as a placeholder (`tabs/tabs.ts`, `tabs/ComingSoon.tsx` and the seven tabs), `frontend/e2e/stats-engine.spec.ts` | `TabsPage.tsx` and its test (fills 15A's placeholder: the filter, the tab row and the tab) |
| 17B | `overview.ts` (with `winStreaks` and `playerOfTheMonth`), `testOverview.ts` (test-only), `tabs/PowerRanking.tsx`, `frontend/e2e/stats-overview.spec.ts` | `tabs/OverviewTab.tsx` (fills 17A's placeholder) |
| 18 | `roles.ts`, `cards.ts`, `frontend/e2e/stats-roles.spec.ts` | `tabs/RolesTab.tsx` (fills 17A's placeholder) |
| 19 | `votes.ts`, `powers.ts`, `frontend/e2e/stats-votes.spec.ts` | `tabs/VotesTab.tsx` |
| 20 | `rivals.ts`, `endings.ts`, `tabs/PlayerMatrix.tsx`, `frontend/e2e/stats-rivals.spec.ts` | `tabs/RivalsTab.tsx`, `tabs/EndingsTab.tsx` |
| 21A | `activity.ts`, `timing.ts`, `charts/BarChart.tsx`, `charts/CalendarHeatmap.tsx`, `frontend/e2e/stats-activity.spec.ts` | `tabs/ActivityTab.tsx` |
| 21B | `records.ts`, `frontend/e2e/stats-records.spec.ts` | `tabs/RecordsTab.tsx` |
| 22A | `trophies.ts`, `allStats.ts`, `player.ts`, `game/gameElo.ts`, `players/TrophyBadge.tsx`, `players/testStats.ts`, `nameLinks.test.tsx`, `frontend/e2e/stats-names.spec.ts` | `PlayerName.tsx` (non-null players become links), `tabs/RecordsTab.tsx` (trophy holders), `game/GameHeader.tsx` and `game/GamePage.tsx` (the Elo change), earlier phases' tests that assert a plain-text name |
| 22B | the rest of `players/` (with `players/playerText.ts`), `frontend/e2e/stats-players.spec.ts` | `players/PlayersPage.tsx` and `players/PlayerPage.tsx` (fill 15A's placeholders) |

Beyond the table, a phase may add test-only helper files of its own (`votesTestRounds.ts`, say) and
files beside its own modules; it may read (import) any earlier phase's module, but edits only its
own files.

After Phase 15A, no phase edits `StatsApp.tsx`: its route table already points every path at its
page's file.

`PlayerName` accepts `link?: boolean` from Phase 15A (a no-op until Phase 22A makes non-null players
links). The owner of each tab shows names inside a sentence or headline with `link={false}`, so
Phase 22A edits no other phase's tab.

Paths without a directory are in `frontend/src/stats/`. Each `.ts` module has a `.test.ts` beside
it; each component file may have a `.test.tsx` and a `.css` beside it.

## The record (Phase 14 writes it, Phase 15 types it)

As in the spec's "The record": `format` 1, seats by index, cards and policies `L` and `F`, `t` in
milliseconds since `startedAt`, `r` from `SecretHitlerGame.getRound()`. JSON keys are exactly the
field names in the spec's tables (camelCase). For an unfinished game, `endedAt` is the time the
sweep closed the lobby.

## Server (Phase 14)

- `Lobby` gains backed-up fields of JDK types only (so a rollback still loads a backup):
  `String gameId`, `long gameStartedAt`, `boolean gameComplete`,
  `ArrayList<LinkedHashMap<String, Object>> gameEvents` (values: `String`, `Integer`, `Long`,
  `Boolean`, `ArrayList<String>`). In a backup from before the recorder, `gameEvents` comes back
  null (and the two primitives 0 and false); that null is how a restore spots one.
- `synchronized public String gameId()` on `Lobby`: the running game's ID, or the last finished
  game's until the next game starts (the victory packet needs it after `updateAllUsers` drops the
  game), or `null`. Phase 15 reads it for `gameId`.
- Package `server.stats`: `GameSnapshot` (an immutable view of a `SecretHitlerGame`), `TimelineDiff`
  (`static List<LinkedHashMap<String, Object>> between(GameSnapshot before, GameSnapshot after, long t)`),
  `GameRecord` (the immutable copy a finished or swept game hands over), `GameStore` (the tables),
  `GameRecorder` (the writer thread), `StatsRoutes` (`GET /api/stats/games`). Their other members
  are Phase 14's to choose.
- Tables: `players`, `games`, `game_seats`, as in the spec.
- Route: `GET /api/stats/games`, answering `{"players": [{"number", "name"}], "games": [record…]}`.

## Page (Phases 15 to 22)

All in `frontend/src/stats/`.

### `record.ts` (15)

```ts
export type Card = "L" | "F";
export type Role = "LIBERAL" | "FASCIST" | "HITLER";
export type Side = "LIBERAL" | "FASCIST";
export type Outcome = "LIBERAL_POLICIES" | "HITLER_EXECUTED" | "FASCIST_POLICIES" | "HITLER_ELECTED" | "UNFINISHED";

export interface Seat { player: number | null; name: string; cpu: boolean; role: Role; alive: boolean }

interface At { t: number; r: number }
export type GameEvent =
  | (At & { type: "nominate"; president: number; chancellor: number })
  | (At & { type: "vote"; seat: number; ja: boolean })
  | (At & { type: "election"; passed: boolean; ja: number; nein: number })
  | (At & { type: "tracker"; value: number })
  | (At & { type: "draw"; seat: number; cards: Card[] })
  | (At & { type: "discard"; seat: number; index: number; card: Card })
  | (At & { type: "veto"; seat: number })
  | (At & { type: "vetoAnswer"; seat: number; accepted: boolean })
  | (At & { type: "enact"; policy: Card; by: "chancellor" | "chaos"; seat?: number; liberal: number; fascist: number })
  | (At & { type: "reshuffle"; drawPile: number })
  | (At & { type: "peek"; seat: number; cards: Card[] })
  | (At & { type: "investigate"; seat: number; target: number; result: Side })
  | (At & { type: "execute"; seat: number; target: number; role: Role })
  | (At & { type: "specialElection"; seat: number; target: number })
  | (At & { type: "endTerm"; seat: number; by: "president" | "countdown" })
  | (At & { type: "timerPause"; seat: number })
  | (At & { type: "timerResume"; seat: number })
  | (At & { type: "disconnect"; seat: number })
  | (At & { type: "reconnect"; seat: number })
  | (At & { type: "restored" })
  | (At & { type: "end"; outcome: Outcome });

export interface GameRecord {
  id: string; format: 1; startedAt: number; endedAt: number;
  outcome: Outcome; winner: Side | null; complete: boolean; hasCpu: boolean;
  liberalPolicies: number; fascistPolicies: number; rounds: number;
  seats: Seat[]; events: GameEvent[];
}
export interface Player { number: number; name: string }
export interface StatsData { players: Player[]; games: GameRecord[] }   // games oldest first

export function parseStatsData(json: unknown): StatsData;  // throws Error on a format other than 1
export function sideOf(role: Role): Side;                  // HITLER → "FASCIST"
export function playerName(data: StatsData, player: number): string;
```

### Shell (15)

- `api.ts`: `fetchStatsData(): Promise<StatsData>` (GET `/api/stats/games`);
  `useStatsData(): { data: StatsData | null; error: string | null }`.
- `routes.ts`:
  ```ts
  export type TabId = "overview" | "roles" | "votes" | "rivals" | "endings" | "activity" | "records";
  export type StatsRoute =
    | { page: "tab"; tab: TabId }
    | { page: "games" } | { page: "game"; id: string }
    | { page: "players" } | { page: "player"; number: number }
    | { page: "notFound" };
  export function parseRoute(pathname: string): StatsRoute;
  export function routePath(route: StatsRoute): string;      // "/stats", "/stats/roles", "/games/<id>" (since Phase 23), …
  export function navigate(pathAndSearch: string): void;      // History API, no reload
  export function useLocation(): { pathname: string; search: string };
  ```
  Tab paths: overview `/stats`, roles `/stats/roles`, votes `/stats/votes`, rivals `/stats/rivals`,
  endings `/stats/endings`, activity `/stats/activity`, records `/stats/records`.
- `StatsApp.tsx`: default export, lazy-loaded by `main.tsx` for paths starting `/stats`; renders
  `StatsHeader` and the page for the route: `TabsPage` for a tab, `GamesPage`, `game/GamePage`,
  `players/PlayersPage`, `players/PlayerPage`, or a short not-found page. Each page component takes
  `{ data: StatsData; route: StatsRoute }`.
- Placeholders Phase 15 creates for later phases to fill: `TabsPage.tsx` (until Phase 17: a link to
  GAMES and the ten latest games), `game/GamePage.tsx` (until Phase 16: the game's header line from
  `outcomeLabel` and its seats), `players/PlayersPage.tsx` and `players/PlayerPage.tsx` (until Phase
  22: one `StatCard`-like box saying "Coming in a later update.").
- `StatsHeader.tsx`: SECRET-HITLER and STATS · GAMES · PLAYERS · PLAY. (Since Phase 23 it draws
  the site header, `src/header/SiteHeader.tsx`, shared with the login page: PLAY · STATS · GAMES ·
  PLAYERS.)
- `PlayerName.tsx`: `<PlayerName player={number | null} name={string} role?={Role} />`, the one
  way any page shows a seat's or player's name (coloured by role when given; Hitler underlined).
  Plain text until Phase 22 makes a non-null `player` a link to `/players/<number>` (`/stats/players/<number>` until Phase 23).
- `format.ts`: `outcomeLabel(record: GameRecord): string` ("Liberals win · 5 Liberal policies",
  "Liberals win · Hitler executed", "Fascists win · 6 Fascist policies", "Fascists win · Hitler
  elected", "Unfinished after round N · L L, F F"), `formatDuration(ms: number): string`
  ("38 min", "1 h 05 min"), `formatLocalDateTime(ms: number): string`, `localDayKey(ms: number): string`
  (`YYYY-MM-DD` in the viewer's zone).
- `games/`: `GamesPage.tsx`, `gamesFilter.ts` (`GamesFilter`, `parseGamesFilter(search)`,
  `gamesFilterSearch(f)`, `filterGames(games, f)`).
- `testRecords.ts`: builders for tests, `makeRecord(overrides?: Partial<GameRecord>): GameRecord`
  and `makeSeats(roles: Role[], players?: (number | null)[]): Seat[]`; later phases add their own
  builders in their own test files, not here.

### `rounds.ts` (16)

```ts
export interface Vote { seat: number; ja: boolean; ms: number | null }   // ms: decision time
export type Power =
  | { kind: "peek"; seat: number; cards: Card[] }
  | { kind: "investigate"; seat: number; target: number; result: Side }
  | { kind: "execute"; seat: number; target: number; role: Role }
  | { kind: "specialElection"; seat: number; target: number };
export interface Round {
  r: number;
  president: number;                         // seat
  chancellor: number | null;                 // null if no nomination happened (game ended first)
  votes: Vote[];                             // in arrival order
  election: { passed: boolean; ja: number; nein: number } | null;
  trackerAfter: number | null;               // the tracker's value if it moved this round
  hand: Card[] | null;                       // the president's three
  discard: { index: number; card: Card } | null;
  chancellorHand: Card[] | null;             // the two handed on
  veto: { accepted: boolean | null } | null; // asked; null answer if the game ended first
  enacted: { policy: Card; by: "chancellor" | "chaos" } | null;
  power: Power | null;
  endTerm: { by: "president" | "countdown" } | null;
  pauses: number;
  reshuffled: boolean;
  disconnects: number[];                     // seats
  blame: number | null;                      // the seat that chose a Fascist over a Liberal
  ms: {                                      // decision times; null when CPU, missing or across `restored`
    nominate: number | null; discard: number | null; chancellor: number | null;
    chancellorAfterVeto: number | null;      // the choice after a refused veto
    vetoAnswer: number | null; power: number | null;
    endTerm: number | null;                  // set for both kinds of ending; Phase 21 filters on endTerm.by
  };
}
export function rounds(record: GameRecord): Round[];
export function formatDecisionTime(ms: number): string;   // one decision, whole seconds: "8 s"
```

- Rounds are grouped by `r`; an `endTerm`, pause or resume carries the term it belongs to, and a
  chaos `enact` (after its `tracker` of 3) belongs to the round of the failed election or accepted
  veto that caused it, so `trackerAfter` is 3 there.
- `chancellor` is null, and a `veto`'s `accepted` null, only when the lobby closed first (an
  unfinished game); no game ends before a nomination or while a veto waits.
- `president` comes from the round's `nominate`, or else from the rotation `endPresidentialTerm`
  follows (executions and the return after a special election included). Leading rounds of a
  `complete: false` record with no recorded action are left out.
- `disconnects` keeps one entry per `disconnect` event, in order (repeats kept).
- `game/sampleGames.ts` (Phase 16) exports the `ev` event builders later phases' tests use, called
  as `ev.<type>(r, t, …)` (`ev.nominate(1, 0, 0, 2)`, say).

### Counting and Elo (17)

```ts
// counting.ts
export interface StatsFilter { players: Set<number> | null; cpu: boolean }   // null = every player
export function parseFilter(search: string): StatsFilter;     // ?players=1,3,4&cpu=1
export function filterSearch(filter: StatsFilter): string;
export function countedGames(games: GameRecord[], filter: StatsFilter): GameRecord[];  // by endedAt, then id
export const MIN_GAMES = 5;
export const MIN_CHANCES = 5;
export const SESSION_GAP_MS = 3 * 60 * 60 * 1000;
export interface Rate { hits: number; chances: number; value: number | null }  // value null below the minimum
export function rate(hits: number, chances: number, min?: number): Rate;
export interface Row<T> { player: number; rank: number | null; value: T; count: number }
export function rankRows<T>(rows: { player: number; value: T; count: number }[],
  compare: (a: T, b: T) => number, names: Map<number, string>, min?: number): Row<T>[];
export function humanSeats(record: GameRecord): { seat: number; player: number }[];
export function sessions(games: GameRecord[]): GameRecord[][];

// elo.ts
export const ELO_START = 1500, ELO_K = 32, ELO_SCALE = 400, ELO_PRIOR = 5, PROVISIONAL_GAMES = 5;
export interface PlayerRating { player: number; rating: number; games: number; provisional: boolean;
  lastChange: number; peak: number }
export interface RatingPoint { gameId: string; endedAt: number; ratings: Map<number, number> }
export interface GameElo { gameId: string; expectedLiberal: number; handicap: number; liberalChange: number }
export interface EloResult { ratings: Map<number, PlayerRating>; history: RatingPoint[]; games: Map<string, GameElo> }
export function replayElo(counted: GameRecord[]): EloResult;   // CPU seats count as 1500, never rated

// useStats.ts
export interface StatsContext { data: StatsData; filter: StatsFilter; counted: GameRecord[];
  elo: EloResult; names: Map<number, string> }
export function useStats(): StatsContext | null;   // memoized per data and filter
```

- `StatCard.tsx`: `<StatCard title definition empty?>children</StatCard>` (the game's card look).
- `RankedTable.tsx`: `<RankedTable rows={Row<T>[]} format={(v: T) => string} names={…} />`,
  showing "—" and the count for rows with `rank` null.
- `TabRow.tsx`, `FilterBar.tsx`.
- `tabs/`: one component per tab, each `(props: { stats: StatsContext }) => JSX.Element`:
  `OverviewTab`, `RolesTab`, `VotesTab`, `RivalsTab`, `EndingsTab`, `ActivityTab`, `RecordsTab`.
  Phase 17 makes the six it does not fill render one `StatCard` saying "Coming in a later update."
- Charts: `charts/LineChart.tsx` (`series: { key: string; label: string; points: { x: number; y: number; dashed?: boolean }[] }[]`),
  `charts/StackedBarChart.tsx` (`bars: { label: string; parts: { key: string; value: number }[] }[]`,
  `colors: Record<string, string>`); Phase 21 adds `charts/BarChart.tsx` and
  `charts/CalendarHeatmap.tsx`.

### Stat modules (18 to 22)

Each module exports one function from the counted games to its stats, keyed by player number where
it is per player, which its tab and the player page read:

| Module | Function | Phase |
|---|---|---|
| `overview.ts` | `computeOverview(stats: StatsContext, now: number, timeZone?: string): OverviewStats`; also exports `winStreaks` and `playerOfTheMonth`, which `records.ts` imports rather than recomputes | 17B |
| `roles.ts` | `computeRoles(counted: GameRecord[]): RoleStats` | 18 |
| `cards.ts` | `computeCards(counted: GameRecord[]): CardStats` | 18 |
| `votes.ts` | `computeVotes(counted: GameRecord[]): VoteStats` | 19 |
| `powers.ts` | `computePowers(counted: GameRecord[]): PowerStats` | 19 |
| `rivals.ts` | `computeRivals(counted: GameRecord[], names: Map<number, string>): RivalStats` | 20 |
| `endings.ts` | `computeEndings(counted: GameRecord[]): EndingStats` | 20 |
| `activity.ts` | `computeActivity(counted: GameRecord[], now: number, timeZone?: string): ActivityStats` | 21A |
| `timing.ts` | `computeTiming(counted: GameRecord[]): TimingStats`; also `formatAverageTime(ms)` ("4.2 s"), `fastestVoter(timing, names)` | 21A |
| `records.ts` | `computeRecords(counted: GameRecord[], elo: EloResult, now: number, timeZone?: string): RecordStats` | 21B |
| `trophies.ts` | `computeTrophies(stats: StatsContext, now: number): Map<number, Trophy[]>` | 22A |
| `player.ts` | `computePlayer(stats: StatsContext, player: number, now: number): PlayerStats` | 22A |

Every `<Topic>Stats` with per-player numbers has `byPlayer: Map<number, …>`; Phase 22's player page
reads `byPlayer.get(number)` from each. Card and vote stats read `rounds(record)`, never the raw
events again. `now` is passed in (never `Date.now()` inside), so tests pin it.

## Browser tests

- `frontend/e2e/stats.ts` (15): `stubStats(page, data: StatsData)` (routes `/api/stats/games`),
  `bigStatsData(): StatsData` (ten players with twelve-character names, 400 games, every outcome,
  CPU and unfinished games, every event type), and `statsSizes` (the sizes each page is checked at:
  `DESKTOP_SIZES`, the `NARROW_WINDOWS`, 360x740, 412x915 and 320x568).
- Each phase adds its own `frontend/e2e/stats-<topic>.spec.ts`. Files named `stats-*.spec.ts` run in
  `desktop`, `phone-360` and `phone-412` already, and Phase 15 adds `stats-` to the `firefox`
  project's `testMatch`, so no later phase edits `playwright.config.ts`. Each spec checks its pages
  against `bigStatsData()` with `checkStatsPage` at every `statsSizesFor(project, viewport)` size.

## Settled after the plans were written

The ten breakdowns were written in parallel. These names and rules settle where they differed. A
breakdown that disagrees with this section is wrong, and the builder follows this section.

### One owner for each shared helper

| Helper | Owner | Notes |
|---|---|---|
| `StatsLink({ href, className?, children, ...aria })` | 15 (`StatsLink.tsx`) | The one in-app link: a plain click navigates without a reload. Phase 17 does not make its own. |
| `plural(n, noun)`, `formatLocalDate`, `formatLocalTime`, `formatLocalDateTime`, `formatDuration`, `outcomeLabel` | 15 (`format.ts`) | Phase 17's `numbers.ts` does not define `plural`. |
| `viewerTimeZone(): string`, `localDayKey(ms, timeZone = viewerTimeZone()): string` | 15 (`format.ts`) | Through `Intl.DateTimeFormat`, so tests pass a zone instead of setting `process.env.TZ` (which leaks across Vitest's `vmThreads` files). |
| `localDaysBetween(from, to, timeZone?)`, `DEFAULT_FILTER`, `seatWon`, `compareNames` | 17 (`counting.ts`) | `localDaysBetween` uses `localDayKey`; Phase 21 uses it, not a `daysBetween` of its own. |
| `formatPercent`, `formatSigned` (a rating change: `+19`, `−13`, and `0` for none, never `±0`), `formatRating` | 17 (`numbers.ts`) | |
| `buildStats`, the test builders in `testGames.ts` (`game`, `seatsOf(players, roles?)`) | 17 | Test-only. Phase 16's `ev` builders are in `game/sampleGames.ts`. |
| `StatCard` (`empty?: boolean \| string`, `className?`, a `section` region named by its title, `NO_GAMES`) | 17 | A card with games but nothing to show passes its own `empty` line. |
| `RankedTable` (`countLabel`, `showCount`) | 17 | |
| `SplitTable` | 17 | A table split by role or by side (players down, roles across), scrolling inside its card. Phases 18 and 19 use it instead of private copies. |
| `ScrollRegion` | 17 | A region that scrolls sideways inside a card, named "<card title> table" (the card's own region keeps the title). Phase 20's `PlayerMatrix` and `SplitTable` use it. |
| `FilterBar` (`showPlayers?: boolean`, default true) | 17 | The player page shows it with `showPlayers={false}`: the CPU toggle on its own. |
| `useChartWidth`, `charts.css`, `SERIES_COLORS`, `axis.ts`; `StackedBarChart` draws a legend | 17 | Phase 21's charts use them. |
| `winStreaks`, `playerOfTheMonth` | 17B (`overview.ts`) | Phase 21B's `records.ts` imports them (the month of a game's start; ties by games, then name). |
| `rounds`, `formatDecisionTime` (one decision, whole seconds) | 16 | |
| `formatAverageTime` (an average, one decimal: "4.2 s") | 21A (`timing.ts`) | Phase 22B's Timing card uses it. |
| `NO_GAMES_FILTER`, `gamesFilterSearch`, `GamesFilter` (with `page` and `per`) | 15B (`games/gamesFilter.ts`) | "All N games" on a player page is `gamesFilterSearch({ ...NO_GAMES_FILTER, players: [n] })`. |
| `PageProps` | 15 (`routes.ts`) | |

- `SplitTable` and `ScrollRegion` (Phase 17):
  ```ts
  export function ScrollRegion(props: { label: string; children: ReactNode }): JSX.Element;
    // a focusable region (role="region", aria-label=label) that scrolls sideways inside its card
  export interface SplitColumn { key: string; label: string }      // e.g. LIBERAL, FASCIST, HITLER
  export interface SplitCell { text: string; count?: number }       // "60%" with count 5; "—" with count 2
  export function SplitTable(props: {
    title: string;                                                   // the card's title; the region is `${title} table`
    columns: SplitColumn[];
    rows: { player: number; cells: Record<string, SplitCell> }[];    // shown sorted by name (compareNames)
    names: Map<number, string>;
  }): JSX.Element;   // a player column (PlayerName) and one column per SplitColumn; a cell shows its text,
                     // then its count beside it when `count !== undefined` (a 0 is shown); an absent cell shows "—"
  ```
- `rate(hits, chances, min = MIN_CHANCES)`; `MIN_GAMES` and `MIN_CHANCES` are both 5.
- `rankRows`' `compare(a, b)` is negative when `a` ranks above `b`; a row whose `count` is below
  `min` gets `rank` null and shows "—" with its count.
- Tabs are named exports. `TabRow` is a `nav` of links in the button look, the current one with
  `aria-current="page"`.

### Browser-test helpers (Phase 15's `e2e/stats.ts`)

`stubStats`, `bigStatsData`, `PHONE_SIZES`, `statsSizesFor(project, viewport)`, `STATS_ONLY_STRINGS`,
`downloads`, and **`checkStatsPage(page, size)`**: the page never scrolls sideways (content inside a
box that scrolls sideways itself, like a `ScrollRegion` or the phone tab row, is not counted as past
the edge); where the stacked query matches, every control is a 44px target (links inline in
running text excepted) and any text field's text is at least 16px (no field, no check). Phase 17
does not make `e2e/statsLayout.ts`; Phases 16 to 22 import `checkStatsPage` from `./stats` and write
no sideways check of their own. `statsSizes` covers `DESKTOP_SIZES`, `SQUARE_DESKTOPS`, the
`NARROW_WINDOWS` and the phone sizes.

`bigStatsData()` follows the rules Phase 15's breakdown sets (round numbers, votes per election, the
tracker and chaos, powers by seat count, final boards that match outcomes, ids `big-001` to
`big-400`, names `WWWWWWWWWW01` to `WWWWWWWWWW10`), and includes at least one `complete: false` and
one `UNFINISHED` record. Later phases assume nothing else about it.

### What Phase 22 reads from each module's `byPlayer`

Each phase defines its `byPlayer` value type with at least these fields (more are fine):

| Module | Type | Fields Phase 22 reads |
|---|---|---|
| `roles.ts` | `PlayerRoles` | `split`, `expectedLiberalGames` (a sum of games, not a share), `luck`, `winAs`, `bySize` |
| `cards.ts` | `PlayerCards` | `hands`, `liberalAccuracy`, `deepCover`, `oneOfEach` (kept per role), `fascistChoices`, `forced.president`, `forced.chancellor` |
| `votes.ts` | `PlayerVotes` | `ja`, `liberalAccuracy`, `fascistLoyalty` |
| `powers.ts` | `PlayerPowers` | `investigations`, `investigatedPlayers`, `saw.FASCIST`, `executions`, `hitlerExecuted`, `survival` |
| `rivals.ts` | `PlayerRivals` | `opponents: Map<number, { games; wins; losses }>`, and `mostPlayedWith`, `bestTeammate` (best win rate together over 5 or more games together), `nemesis`, `favouriteOpponent`, each `{ player, …counts } \| null` |
| `records.ts` | `PlayerRecords` | `current`, `longestWin`, `longestLoss` (each with `length`) |
| `timing.ts` | `PlayerTiming` | `decisions[kind]: { count; ms }` (`kind` one of `nominate`, `vote`, `discard`, `chancellor`, `power`, `endTerm`) |

### Rules every frontend phase keeps

- **ES2020.** `frontend/tsconfig.json` targets ES2020 (`lib` ES2020), and `npm run build` type-checks
  the tests too: no `Array.prototype.at`, `Object.hasOwn`, `replaceAll`, `findLast` or anything
  newer (`rs[rs.length - 1]`, not `rs.at(-1)`).
- **Browser tests import no browser-only module.** `frontend/src/constants` reads `window` and
  `import.meta.env` when it loads, which throws in Playwright's Node process. So no `e2e/` file
  imports `src/constants` or anything that imports it (`api.ts`, `App`). `STATS_GAMES_PATH`
  (`"/api/stats/games"`) lives in `record.ts`, which `api.ts` re-exports; specs build page paths
  with `routePath` from `routes.ts`, not `statsGamePath`.
- **Names never overflow.** `PlayerName` sets `overflow-wrap: anywhere`, and every grid or flex
  child on the stats pages has `min-width: 0`, so a twelve-character name of wide letters wraps
  inside its column at 320px instead of spilling into the next one.
- **`checkStatsPage`** measures `document.body.scrollWidth` and never exempts `body`,
  `.stats-screen` or `.stats-main` as sideways scrollers (an `overflow-y` container computes
  `overflow-x: auto`); only boxes that are meant to scroll sideways (`ScrollRegion`, the phone tab
  row) are exempt. Name links in table cells are not exempt from 44px targets (Phase 22 makes them
  44px).
- `winStreaks(counted)` returns `Map<number, PlayerStreaks>` with
  `PlayerStreaks { games; current; longestWin: StreakRun | null; longestLoss: StreakRun | null }`
  and `StreakRun { player; length; firstGameId; lastGameId }`; `current` is wins in a row, 0 or more.
- Long browser tests (a page at every size) call `test.slow()`. Timing assertions use the spec's
  limits (1,000 games well under a second: assert under 1,000 ms), not tighter ones.

### Other settled rules

- `GameHeader({ record })` (Phase 16). Phase 22 adds `elo?: GameElo | null`, which `GamePage` works
  out in `game/gameElo.ts` from `replayElo(countedGames(data.games, DEFAULT_FILTER))`.
- GAMES rows: one link stretched over the row (the date and result), the seats line above it, never
  an anchor wrapping the names.
- The fastest voter (ACTIVITY) and Speed Demon are one rule, one holder: of the players with 30 or
  more timed votes and 8 or more counted games, the lowest average vote time; ties go to more timed
  votes, then the name. Phase 21A's `timing.ts` computes it (`fastestVoter`); Phase 22A's trophy reads that result.
- Name links (Phase 22): Phase 22 may update earlier phases' tests that assert a plain-text name.
  On phones, rows of `RankedTable`, `SplitTable` and `PlayerMatrix` are at least 44px tall, so a
  name link is a 44px target without padding that overlaps its neighbours; a name inside a sentence
  or a headline ("Ann 3–2 Cy") is shown with `link={false}`.
- Contract-fixture tests: the fixture has CPU seats in some games, so a test that sums per-player
  numbers against a game's totals runs on `countedGames(games, DEFAULT_FILTER)` or counts only
  rounds whose seat has a player.
- Chaos counts every chaos `enact`, whether a third failed election or an accepted veto caused it.
- Ports (`E2E_PORT` for browser tests / "before" shots), so phases running together never share one:
  13: 4613/4713 · 14A: 4614/4714 · 14B: 4624/4724 · 15A: 4615/4715 · 15B: 4625/4725 ·
  16: 4616/4716 · 17A: 4617/4717 · 17B: 4627/4727 · 18: 4618/4718 · 19: 4619/4719 ·
  20: 4620/4720 · 21A: 4621/4721 · 21B: 4631/4731 · 22A: 4622/4722 · 22B: 4632/4732.
- Phase 14 is two parts: 14A hands each record to `GameRecordSink.submit(GameRecord)` (a default
  sink drops it with a debug line), and 14B's `GameRecorder` is the sink that stores it.
- Java 17 through `JAVA_HOME` (any installed 17; the Gradle wrapper fails on newer JDKs).
- Pull requests are squashed (`gh pr merge --squash --admin`, `CLAUDE.md`), with a Conventional
  subject (`feat(frontend): … (#N)`).
