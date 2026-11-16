# Phase 23: One header for the site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The stats pages' header (SECRET-HITLER and STATS · GAMES · PLAYERS · PLAY) becomes the
login page's header too, with PLAY marked current, so the stats are reached from the top of the
home page; the login page and the lobby lose their footer "Stats" links, and the login page its
sound control.

**Architecture:** Phase 15A's `StatsHeader` markup and CSS move out of the stats chunk into one
shared component, `src/header/SiteHeader.tsx`, which takes the place to mark and, optionally, the
component that draws its in-page links. The login page renders it with plain links (each a full
load: the stats are a chunk of their own); `StatsHeader` stays as the stats' thin adapter (route to
place, `StatsLink` for moves in place), so `StatsApp.tsx` is untouched. The paths it links to are
written out in `src/constants`, as `STATS_PATH` already is, so the game's first download holds no
stats code. The login page's spacing is re-fitted for a header that is 44px tall on desktop (up to
11px taller than the old one in short windows) and about 42px taller on phones.

**Tech Stack:** React 18, TypeScript 5 (ES2020), Vite, Vitest with Testing Library, Playwright. No
new dependency.

**Spec:** [`docs/PLAN.md`](../../PLAN.md), "Phase 23: One header for the site" (its six boxes and
acceptance). The header itself: [`docs/superpowers/specs/2026-11-15-game-stats-design.md`](../specs/2026-11-15-game-stats-design.md),
"The header" ("the current one underlined. On phones the links sit in a row under the title, each a
44px target") and "The links in", which this phase changes for the login page and the lobby (the
victory screen's "See this game" stays). Rules every frontend phase keeps:
[`2026-11-15-game-stats-interfaces.md`](2026-11-15-game-stats-interfaces.md), "Rules every frontend
phase keeps". Before this: Phase 15A's [`2026-11-15-phase-15a-stats-shell.md`](2026-11-15-phase-15a-stats-shell.md)
(the header) and 15B's [`2026-11-15-phase-15b-game-history.md`](2026-11-15-phase-15b-game-history.md)
(the links in).

## Decisions

The PLAN section settles what players see. These settle what it leaves to the build; none changes
what players see or use beyond it.

- **"The tab row's current look"** is the header's own row of links, whose current link is
  underlined (the spec's "the current one underlined"), as STATS, GAMES and PLAYERS are on the
  stats pages. `TabRow`'s current look, the orange button face, would vanish against the header:
  `--buttonFill` is `--headerFill`. One component, so one current look.
- **The nav keeps its name, "Stats pages"**, which the stats' tests and Phase 22B's spec find it by.
- **On the login page every header link is a plain `<a>`:** STATS, GAMES and PLAYERS load the stats
  in the same tab (the login page has nothing to keep open, as for the old footer link), and PLAY,
  the current page, loads `/` again. On the stats pages STATS, GAMES and PLAYERS stay `StatsLink`s
  and PLAY a plain `<a>`, as in 15A.
- **Sounds:** only the control goes from the login page. `main.tsx` still listens for the first
  gesture and preloads the clips there, so the lobby's first sound plays; the volume and mute set in
  the lobby or the game are kept as before (`localStorage`).
- **Re-fit, not re-layout:** the cards keep their look and order; only spacing changes (the
  `.login-body`'s top padding and the gaps in short windows on desktop; the cards' padding, the gaps
  and the top padding on phones), so the signed-in page at its fullest has at least 8px to spare at
  every tested size, on macOS and in the Linux image (the thinnest today is about 6px, at 800x700).
- **The lobby** keeps `App-header` (SECRET-HITLER, the spectator count and the speaker) exactly; its
  footer reads "About this project · Report a bug".
- **README screenshots:** `docs/images/` holds only the game page, which this phase does not change,
  so none is re-taken; the README's text about the login page, the links in and the speaker is.

Measured before the plan (macOS Chromium; the Linux image gave the same at these sizes), the room
left under the signed-in login page at its fullest (`longestLogin(page, "signed in")`), before → with
the shared header and no Stats link, before any re-fit: 1280x720 9.6 → −0.5px, 800x700 6.1 → −5.0px,
1366x768 16.6 → 9.4px, 990x793 18.0 → 13.4px, 360x740 8.7 → −14.6px (the footer's links drop to one
line there without "Stats"). Signed out at 360x740: 38.9 → 15.6px. The header: 33-61px tall before,
44px (46px from 1180px tall) after on desktop; 35 → 77px at 360x740.

## Global Constraints

- **Files.** Phase 23 creates `frontend/src/header/SiteHeader.tsx`, `SiteHeader.css` (moved from
  `src/stats/StatsHeader.css`, which goes) and `SiteHeader.test.tsx`; changes
  `src/stats/StatsHeader.tsx` and its test, `src/constants/index.ts` and `statsPaths.test.ts`,
  `src/login/LoginScreen.tsx`, `LoginScreen.css` and its test, `src/lobby/LobbyScreen.tsx` and its
  test, `src/game/GameScreen.css` (the login page leaves the shared header rule), and the browser
  tests `e2e/sounds.spec.ts`, `e2e/stats-games.spec.ts`, `e2e/no-scroll.spec.ts`,
  `e2e/phone.spec.ts` and the header tests of `e2e/stats-shell.spec.ts`; plus the docs (`CLAUDE.md`,
  `README.md`, `DEVELOPMENT.md`, Phase 23's section of `docs/PLAN.md`).
- **Never touch** `frontend/src/stats/players/`, `e2e/stats-players.spec.ts` (Phase 22B's), the
  PLAYERS lines of `e2e/stats-shell.spec.ts` and `src/stats/StatsApp.test.tsx` (`"Coming in a later
  update."`, `/stats/players…`), or `src/stats/StatsApp.tsx`. If 22B merges first and a rebase
  conflicts in those two test files, keep both phases' lines and re-run them; a conflict in any
  other source file: stop and report.
- **Copy, exactly.** Header: `SECRET-HITLER`; links `STATS` (`/stats`), `GAMES` (`/stats/games`),
  `PLAYERS` (`/stats/players`), `PLAY` (`/`); nav `aria-label="Stats pages"`. Login footer's first
  line: `How to play · About this project · Report a bug`. Lobby footer: `About this project · Report
  a bug`. Every other line of both pages is unchanged.
- **Download.** The header's paths come from `src/constants`, never from `src/stats/`; the game's
  first download (`npm run first-download`) may grow only by the header's own markup and CSS (a few
  hundred bytes gzipped), and `stats-shell.spec.ts`'s "the game's first download holds no stats
  code" keeps passing. Before: 112,871 bytes (`index-*.js` 103,915, `index-*.css` 8,956).
- **ES2020** in code and tests; **no `e2e/` file imports `src/constants`** or anything that imports
  it (so not `SiteHeader`); e2e paths come from `routePath`.
- **Look and fit.** No new art. The header's CSS is 15A's, renamed (`site-header`, `site-title`,
  `site-nav`, `site-nav-link`): its links are 44px targets at every size. The login page and the
  lobby fit one screen at every tested size but 320x568 (`DESKTOP_SIZES`, `SQUARE_DESKTOPS`,
  `NARROW_WINDOWS`, 360x740, 412x915), with 44px targets and 16px field text where they are
  checked today; the thinnest fits are measured in the Linux image, which CI's fonts match.
- **Environment.** `JAVA_HOME` on Java 17 (any installed 17; never write its path into the repo);
  Node 22.12 or newer; npm 11 for any dependency change (none expected). Browser tests and any jar
  on `E2E_PORT=4623`; "before" shots on 4723, from a worktree of `origin/development` under the same
  `.claude/worktrees/` folder, deleted afterwards. Firefox does not launch on this Mac: run
  `firefox`, and the phone checks that depend on CI's fonts, in Playwright's Linux image
  (`DEVELOPMENT.md`, "Browser tests on Linux"). Scratch files (the screenshot spec, measuring specs,
  PR body) live in the session scratchpad's `phase-23/` folder only.
- **Known flakes outside these files:** `src/AppSwitch.test.tsx` and `prompt-close.spec.ts` under
  load, a 5px scroll in `stats-games.spec.ts`, the backend's
  `GameRecorderTest.aFailingDatabaseLosesNoRecord`. Check a failure on `development` before calling
  it one.
- **Branch and commits.** Worktree and branch `phase-23-site-header`, off `origin/development`.
  Conventional Commits with a scope (`frontend`, `docs`, `claude`, `readme`, `development`, `plan`);
  each test in the commit with its code. Tasks 2 to 7 each tick one box of Phase 23 in
  `docs/PLAN.md` in their commit (Task N ticks box N − 1).
- **Public repo.** Nothing about the home server in code, docs, commits or the PR.

## Review Focus

1. **The fullest login page in the shortest windows,** signed in with the 32-m Discord username and
   every error line, at 800x700, 1280x720 and 360x740 with Linux fonts: no scroll, at least 8px to
   spare. Task 5 (`the login page fits …` in `no-scroll.spec.ts` and `phone.spec.ts`, run in the
   Linux image, plus the scratch measure).
2. **Exactly one current link on the login page** (PLAY), no Stats link anywhere on it, and the
   stats pages' marks unchanged (a not-found stats page marks none). Task 2
   (`marksThePlaceGiven`, `marksNothingWithoutAPlace`) and Task 3 (`theHeaderMarksPlay`).
3. **A modified click on a header link** (Ctrl, Cmd, Shift or the middle button): the login page's
   links are plain anchors with no click handler, so the browser opens a tab; on the stats pages
   `StatsLink` leaves such clicks alone and PLAY is a plain anchor. Task 2
   (`playIsAlwaysAPlainLink`, `drawsItsLinksWithTheLinkGiven`).
4. **The header at 320px and in every narrow window on the login page:** one row of four 44px
   links, no sideways scroll, the same boxes as on a stats page. Task 6 (`the login page has the
   stats' header at every size`).
5. **A player's sound setting with no control on the login page:** muted and set to 60 in the
   lobby, kept through a reload, shown again in the lobby, and the join sound stays muted. Task 3
   (`mute and volume survive a reload`, moved to the lobby).

---

### Task 1: Breakdown, start check and the "before" screenshots

**Files:**
- Create: `docs/superpowers/plans/2026-11-16-phase-23-site-header.md` (this file)
- Modify: `docs/PLAN.md` (Phase 23's heading links this file; its Progress row reads "in progress")
- Create (never committed): `<scratchpad>/phase-23/pr-shots.spec.ts`
- Create: `docs/pr/phase-23-site-header/before-{login-signed-out,login-signed-in,lobby-signed-out,lobby-signed-in}-{1600x900,412x915}.png`

- [ ] **Step 1: Check the start.** `docs/PLAN.md` reads "done" for Phases 13 to 22A and has the
  "Phase 23: One header for the site" section; `frontend/src/stats/StatsHeader.tsx` is 15A's.
- [ ] **Step 2: Commit the breakdown** as the branch's first commit, `docs(plan): break down phase
  23`, with the heading's `Breakdown:` line and the Progress row "in progress".
- [ ] **Step 3: Write `pr-shots.spec.ts`.** `test.skip(!process.env.PR_SHOTS)`; `PREFIX` from
  `process.env.PR_SHOTS` (`before` or `after`); `OUT` an absolute path to this worktree's
  `docs/pr/phase-23-site-header/`; 1600x900 in `desktop`, 412x915 in `phone-412`; each state then
  `settle(page)` and a window-sized screenshot `${PREFIX}-${state}-${W}x${H}.png`:
  `login-signed-out` (`stubMe(page, signedOutMe({ discord: true }))`, `/`), `login-signed-in`
  (`stubMe(page, signedInMe("Host Player", "rowan.d"))`, `/`), `lobby-signed-in` (`openFakeGame`),
  `lobby-signed-out` (`stubMe` signed out with Discord, `/check-login` answered `Spectator login
  valid.`, a routed `/game` socket that answers pings and sends `WATCHED_LOBBY`; WATCH with
  `FAKE`, then `waitForPlayers(page, 10)`).
- [ ] **Step 4: Take the "before" shots** from a worktree of `origin/development`
  (`.claude/worktrees/phase-23-before`, `npm ci`), with the spec copied into its `e2e/`:
  `PR_SHOTS=before E2E_PORT=4723 npx playwright test e2e/pr-shots.spec.ts --project=desktop
  --project=phone-412`. Expected: 2 passed, eight PNGs, the login page with the old centred header,
  its speaker and the footer's Stats. Remove that worktree.
- [ ] **Step 5: Commit** `docs(docs): add phase 23's before screenshots` (the eight PNGs only).

---

### Task 2: The shared header

**Files:**
- Create: `frontend/src/header/SiteHeader.tsx`, `SiteHeader.test.tsx`
- Move: `frontend/src/stats/StatsHeader.css` → `frontend/src/header/SiteHeader.css` (`git mv`, then
  rename the classes `stats-header` → `site-header`, `stats-title` → `site-title`, `stats-nav` →
  `site-nav`, `stats-nav-link` → `site-nav-link`; the rules otherwise unchanged)
- Modify: `frontend/src/stats/StatsHeader.tsx`, `StatsHeader.test.tsx`, `frontend/src/constants/index.ts`,
  `statsPaths.test.ts`

**Interfaces:**
- Produces in `constants/index.ts`, beside `STATS_PATH` (its comment now "the header's STATS"):
  `STATS_GAME_LIST_PATH = "/stats/games"` (GAMES) and `STATS_PLAYER_LIST_PATH = "/stats/players"`
  (PLAYERS).
- Produces in `header/SiteHeader.tsx`:
  ```ts
  /** The four places the header links to. */
  export type SitePlace = "stats" | "games" | "players" | "play";
  /** What the header hands the component that draws STATS, GAMES and PLAYERS. */
  export type HeaderLinkProps = { href: string; className: string; "aria-current"?: "page"; children: ReactNode };
  export function SiteHeader(props: {
    current: SitePlace | null;                          // the place marked aria-current="page"; null marks none
    link?: (props: HeaderLinkProps) => JSX.Element;     // draws STATS, GAMES and PLAYERS; a plain <a> by default
  }): JSX.Element;                                       // default export too
  ```
  Markup as 15A's: `header.site-header` > `span.site-title` `SECRET-HITLER` and `nav.site-nav`
  `aria-label="Stats pages"` > the four links (`className="site-nav-link"`), PLAY always a plain
  `<a href="/">`. It imports `./SiteHeader.css` and the paths from `../constants`, nothing from
  `../stats/`.
- Produces in `stats/StatsHeader.tsx`: `StatsHeader({ route }: { route: StatsRoute })` as before,
  now `<SiteHeader current={…} link={StatsLink} />`, the place from the route: `tab` → `stats`;
  `games`, `game` → `games`; `players`, `player` → `players`; `notFound` → `null`.

- [ ] **Step 1: Write the failing tests.** `SiteHeader.test.tsx`: `linksToTheFourPlaces` (the
  banner reads `SECRET-HITLER`; the nav "Stats pages"'s links, as `[text, href]`, are
  `[["STATS", "/stats"], ["GAMES", "/stats/games"], ["PLAYERS", "/stats/players"], ["PLAY",
  "/"]]`); `marksThePlaceGiven` (for each `SitePlace`, exactly that link has `aria-current="page"`);
  `marksNothingWithoutAPlace` (`current={null}`: none); `drawsItsLinksWithTheLinkGiven` (a `link`
  that renders `<a data-drawn="yes" …>`: STATS, GAMES and PLAYERS carry it, with their `href`,
  `className` `site-nav-link` and mark); `playIsAlwaysAPlainLink` (with that `link`, PLAY has no
  `data-drawn`; a click on any link of the default header is not prevented, `fireEvent.click`
  returning true). `statsPaths.test.ts`: `STATS_GAME_LIST_PATH` is `routePath({ page: "games" })`
  and `STATS_PLAYER_LIST_PATH` is `routePath({ page: "players" })`. `StatsHeader.test.tsx` keeps
  its two tests and adds `movesInPlace` (a plain click on GAMES calls `history.pushState` and moves
  `location.pathname` to `/stats/games`; on PLAY the click is not prevented).
- [ ] **Step 2: Run** `cd frontend && npx vitest run src/header src/stats/StatsHeader.test.tsx
  src/constants`. Expected: FAIL (no `header/SiteHeader`, no paths).
- [ ] **Step 3: Implement** as in Interfaces; delete `stats/StatsHeader.css` by the move.
- [ ] **Step 4: Run** `npm test -- --run && npm run build`. Expected: PASS (`StatsApp.test.tsx`
  unchanged and green).
- [ ] **Step 5: Commit** `refactor(frontend): share the stats header as the site header`, ticking
  box 1.

---

### Task 3: The login page's header

**Files:**
- Modify: `frontend/src/login/LoginScreen.tsx`, `LoginScreen.test.tsx`, `frontend/src/game/GameScreen.css`,
  `frontend/e2e/sounds.spec.ts`, `frontend/e2e/stats-games.spec.ts`

**Interfaces:**
- Consumes: `SiteHeader` (Task 2).
- `LoginScreen` renders `<SiteHeader current="play" />` in place of `header.App-header` (no
  `SoundControl`), and its footer's first line drops `Stats` and its separator. `GameScreen.css`'s
  `.game-screen > header, .lobby-screen > header, .login-screen > header` rule drops
  `.login-screen > header` (it would override the site header's padding); the page rules keep
  `.login-screen`, and the comments say the login page shares the page, not the header.

- [ ] **Step 1: Write the failing unit tests** in `LoginScreen.test.tsx`: `theHeaderMarksPlay` (the
  banner holds `SECRET-HITLER` and the nav "Stats pages" with STATS, GAMES, PLAYERS and PLAY;
  `document.querySelectorAll('[aria-current="page"]')` is PLAY alone); `noSoundControl` (no button
  `Mute sounds`, no `.sound-control`); the footer test becomes "the footer links to the rules, the
  project and its issues": first line `/^How to play · About this project · Report a bug$/`, no link
  named `Stats` in the footer.
- [ ] **Step 2: Run** `npx vitest run src/login`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Update the browser tests that used the login page's header.**
  `stats-games.spec.ts`: "the login page's Stats link …" becomes "the login page's header opens the
  stats in the same tab" (`/` signed out; the nav "Stats pages" has PLAY current; its STATS has no
  `target`; a click goes to `routePath({ page: "tab", tab: "overview" })` with STATS current).
  `sounds.spec.ts`: "the control fits every header" checks the lobby and the game (no `login`), and
  first asserts `/` has no `.sound-control`; "mute and volume survive a reload", "hover and keyboard
  show the slider on desktop", "a tap shows the slider on phones" and "a tap shows the slider in a
  browser without :has()" open the lobby with `openFakeGame` instead of `/` (the reload test: set
  60 and mute in the lobby, reload, `openFakeGame` again, the button pressed and the slider at 60,
  then the join sound `muted`; the keyboard test focuses the control from the header's start, so
  Tab lands on the speaker; the tap test taps the lobby's `PLAYERS` heading to close the slider).
- [ ] **Step 5: Run** `npm test -- --run`, then `E2E_PORT=4623 npm run e2e --
  e2e/sounds.spec.ts e2e/stats-games.spec.ts --project=desktop --project=phone-360
  --project=phone-412`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(frontend): put the site header on the login page`, ticking box 2.

---

### Task 4: The lobby's footer

**Files:**
- Modify: `frontend/src/lobby/LobbyScreen.tsx`, `LobbyScreen.test.tsx`, `frontend/e2e/stats-games.spec.ts`

- [ ] **Step 1: Write the failing test.** `LobbyScreen.test.tsx`'s "the footer links": no link named
  `Stats`; `.lobby-footer` reads `/^About this project · Report a bug$/`; About and Report a bug in a
  new tab as before. "the header" stays as it is (title, count, speaker).
- [ ] **Step 2: Run** `npx vitest run src/lobby`. Expected: FAIL.
- [ ] **Step 3: Implement:** drop the footer's Stats `OutLink` and its separator, and the
  `STATS_PATH` import.
- [ ] **Step 4: Update** `stats-games.spec.ts`'s "the lobby's Stats link …" to "the lobby links to
  the stats only from the victory screen" (`openFakeGame`: the lobby's footer has no link named
  `Stats`, the header keeps `.sound-control` and SECRET-HITLER); "See this game sits on the victory
  screen" is unchanged. Run `npm test -- --run` and `E2E_PORT=4623 npm run e2e --
  e2e/stats-games.spec.ts --project=desktop`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): drop the lobby's stats link`, ticking box 3.

---

### Task 5: The login page fits again

**Files:**
- Modify: `frontend/src/login/LoginScreen.css`, `frontend/e2e/no-scroll.spec.ts`, `frontend/e2e/phone.spec.ts`
- Create (never committed): `<scratchpad>/phase-23/specs/measure.spec.ts`, which prints the room
  under the fullest page per state and size

- [ ] **Step 1: Extend the fit tests.** `no-scroll.spec.ts`'s login test: the parts in order start
  with the header (`header.site-header` above `login-card login-account`), and the header's four
  links are each at least `MIN_TARGET` wide and tall at every size. `phone.spec.ts`'s login test:
  the same header check (its existing `smallTargets(page, "body")` sees no plain links).
- [ ] **Step 2: Run** `E2E_PORT=4623 npm run e2e -- e2e/no-scroll.spec.ts e2e/phone.spec.ts -g
  "login page"`. Expected: FAIL, scroll at 1280x720 and 800x700 signed in and at 360x740 signed in.
- [ ] **Step 3: Re-fit `LoginScreen.css`.** Desktop and tall windows: `.login-body`'s top padding
  `clamp(8px, 4vh - 20px, 16px)` (8px at 700px tall, 16px from 900px) and `--page-gap`
  `clamp(8px, 5vh - 27px, 18px)` (8px at 700px, 18px from 900px). Phones: `--page-gap` 8px, padding
  `8px 12px 8px`, the cards' padding `0.6em 0.8em 0.75em`. Update the file's comments (the figures:
  what each size has to spare). Nothing else moves.
- [ ] **Step 4: Measure** with the scratch spec against a jar on 4623, on macOS and in the Linux
  image (`desktop`, `phone-360`, `phone-412`). Expected: at least 8px to spare signed in at every
  size but 320x568, and more than before signed out. Adjust only the values of Step 3 if not.
- [ ] **Step 5: Run** `E2E_PORT=4623 npm run e2e -- e2e/no-scroll.spec.ts e2e/phone.spec.ts
  e2e/accounts.spec.ts e2e/lobby-switch.spec.ts`, then the same specs with `--project=firefox`,
  `phone-360` and `phone-412` in the Linux image. Expected: PASS.
- [ ] **Step 6: Commit** `fix(frontend): fit the login page under the site header`, ticking box 4.

---

### Task 6: The header on every page

**Files:**
- Modify: `frontend/e2e/stats-shell.spec.ts` (a new test beside "the header's links are 44px
  targets at every size"; no PLAYERS line)

- [ ] **Step 1: Write the test** `the login page has the stats' header at every size`: open
  `/stats/nowhere` (a short stats page) and `/` signed out (`stubMe`), both settled; at every
  `statsSizesFor` size, measure the header's box and each nav link's width, height, top from the
  header's top and right from the header's right; they match within 0.5px, all four links are
  `MIN_TARGET` wide and tall on `/`, PLAY is current on `/` and nothing on `/stats/nowhere`, `/` has
  no `.sound-control`, and `checkStatsPage`'s sideways check (`statsPageProblems(page).sideways`) is
  empty on `/`.
- [ ] **Step 2: Run** `E2E_PORT=4623 npm run e2e -- e2e/stats-shell.spec.ts` in `desktop`,
  `phone-360` and `phone-412`, and `firefox` in the Linux image. Expected: PASS (the header was
  built in Task 2, so it passes at once; if it does not, fix the CSS).
- [ ] **Step 3: Run** `npm test -- --run && npm run build && npm run first-download`. Expected:
  PASS; the total within a few hundred bytes of 112,871; note the numbers for the PR.
- [ ] **Step 4: Commit** `test(frontend): check the login page has the stats' header`, ticking box 5.

---

### Task 7: Docs and screenshots

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `DEVELOPMENT.md`, `docs/PLAN.md`
- Create: `docs/pr/phase-23-site-header/after-{login-signed-out,login-signed-in,lobby-signed-out,lobby-signed-in}-{1600x900,412x915}.png`

- [ ] **Step 1: Take the "after" shots:** `PR_SHOTS=after`, the spec copied into this worktree's
  `e2e/` (port 4623), then removed. Check the login page shows the site header with PLAY underlined,
  no speaker and no Stats link, and the lobby its own header and no Stats link.
- [ ] **Step 2: Update the docs.** `CLAUDE.md`: Layout's frontend part (the login page's header is
  `src/header/SiteHeader`, shared with the stats through `StatsHeader`; its footer without Stats;
  `SoundControl` in the lobby's and the game's headers only; the lobby's footer; `GameScreen.css`
  shares the page, not the header, with the login page; the login page's fit figures; the browser
  tests that changed: `sounds.spec.ts` on the lobby, `stats-games.spec.ts`'s links in,
  `stats-shell.spec.ts`'s header test). `README.md`: the login page bullet (the header's links to
  the stats; the footer's links), the sound bullet (the speaker in the lobby's and the game's
  headers), the links-in sentence. `DEVELOPMENT.md` where it names the login page's Stats link or
  the header. Nothing names the home server.
- [ ] **Step 3: Commit** `docs(docs): add phase 23's after screenshots`, `docs(claude): describe the
  site header`, `docs(readme): describe the site header`, and `docs(development): …` if touched, the
  last ticking box 6.

---

### Task 8: Review

- [ ] **Step 1: Review.** Run the `code-review` skill against `origin/development`, with Phase 23's
  section of `docs/PLAN.md` and this plan as the spec.
- [ ] **Step 2: Fix every finding,** Minor ones included, each with a test where it changes
  behaviour, in commits of their own scope; a finding that needs no change gets its reason. Keep the
  list (finding, what was done) for the PR's Review section. A fix that needs a file another phase
  is building: ask first.
- [ ] **Step 3: Run everything:** `cd backend && ./gradlew test`; `cd frontend && npm test -- --run
  && npm run build && npm run first-download`; `E2E_PORT=4623 npm run e2e` (`desktop`, `phone-360`,
  `phone-412` on macOS); `firefox` and both phone projects in the Linux image against a jar on 4623.
  Expected: all pass; keep the counts for the PR.
- [ ] **Step 4: Commit** the last fix with the acceptance box "Backend and frontend unit tests pass,
  …" ticked (or `docs(plan): tick phase 23's test box` if there was nothing to fix).

---

### Task 9: Pull request

- [ ] **Step 1: Push and open the PR.** `git push -u origin phase-23-site-header`; `gh pr create
  --repo jussaw/Secret-Hitler-Online --base development --head phase-23-site-header --title
  "feat(frontend): share the stats header with the login page" --body-file
  <scratchpad>/phase-23/pr-body.md`. The body: the before-and-after table (the login page and the
  lobby, signed out and signed in, at 1600x900 and 412x915, raw URLs pinned to the pushed head),
  Changes, Decisions (this plan's), Review, Tests (with counts) and the first download before and
  after. Read it back (`gh pr view --json body`) and check it is this phase's.
- [ ] **Step 2: Bring CI to green,** fixing on the branch and pushing until every job passes. If
  `development` moves while it is open, rebase (keep both sides of the docs), re-run, push with
  `--force-with-lease` and re-pin the links. The phase's work ends here, with the PR open and green.
- [ ] **Step 3: Merge (the manager session, once the user says yes).** Each part is skipped when
  already done, so the step can be resumed: if the "PR merged into `development`" box is not ticked
  on the branch, commit `docs(plan): tick phase 23's merge` (the box and the Progress row "done"),
  push and wait for green; if `gh pr view <n> --repo jussaw/Secret-Hitler-Online --json state` is
  not `MERGED`, run `gh pr merge <n> --squash --admin --repo jussaw/Secret-Hitler-Online
  --match-head-commit <head sha> --subject "feat(frontend): share the stats header with the login
  page (#<n>)"`; then `gh run list --repo jussaw/Secret-Hitler-Online --branch development --limit
  1` shows the push's run publishing `:latest`. The user's deployed-build box stays open.
