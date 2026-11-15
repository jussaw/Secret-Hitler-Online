# Issue formats

The rules every issue follows, then four skeletons. Pick the skeleton by the kind of issue, fill
every slot marked REQUIRED in the order given, and keep the example's shape.

## Rules for every issue

- **Title:** `area: plain summary`. The area is `frontend`, `backend`, `e2e`, `ci`, `docker` or
  `docs`. Several are joined with `, ` in that order, as in #26, #28, #30 and #31
  (`frontend, backend`). The word after the colon is lowercase unless it is a code name. A bug
  names the symptom ("a second disconnect inside the grace window frees the seat early"). An
  enhancement says what to do ("pin the icon picker's confirm button to the bottom of the
  prompt").
- **Label:** exactly one. `bug` for a bug, `enhancement` for anything else. No other label.
- **Label paragraphs** are bold, with the colon inside: **Scope:**, **Want:**, **Notes:**,
  **Possible fix:**. The same everywhere.
- **Sentences:** plain and short, as in the existing issues. State facts and numbers, not
  adjectives.
- **Backticks:** every code, file, function, command, class and project name (`Lobby.removeUser`,
  `e2e/no-scroll.spec.ts`, `firefox`).
- **References:** a code reference is `path:line` (or `path:from-to`) and says the commit it was
  read at, once, in the first paragraph (in a bug, in its provenance). Related issues and PRs go
  by number (#41). An issue from `ShrimpCryptid/Secret-Hitler-Online` goes in backticks too
  (`ShrimpCryptid/Secret-Hitler-Online#179`), so upstream is not pinged. Name the `CLAUDE.md`
  constraints the issue touches ("see Constraints in `CLAUDE.md`").
- **Provenance:** every bug opens with it, in the first sentences of the body (of
  `## Description` in skeleton 2), one fact each: where it was found or seen ("Found in review of
  #43 (PR #62), by reading the code.", "Seen twice on the home server."), then what the run on
  `development` showed. Every bug gets a run, so there is no "not reproduced yet", and
  "Reproduced" stands only beside a run that showed the bug. The run's commit is the one the
  issue's `path:line` references are read at, so no other sentence names a commit. The run's
  sentence takes one of these forms, word for word:
  - "Reproduced on `development` (<short sha>) with `<command>`: <what happened>."
  - "Not reproduced on `development` (<short sha>). Tried: `<command>`, <what it showed>."
  - For a bug seen only on a device or browser no run here reaches: "Not reproduced on
    `development` (<short sha>): it needs <device>. Tried: `<command>`, <what it showed>."
- **Open questions:** an issue with a choice the user has not made has a `## Open questions`
  section, whatever its skeleton: one plain question per bullet, and only product or design
  choices. `implement-issue` builds nothing for an issue with open questions, so the section sends
  it to design. Write only what the notes and the code settle. A choice nobody has made, such as
  where a new page is reached from, is a question, never a bullet under Scope or a line in the
  body, and no line of **Want:**, **Notes:** or **Scope:** answers one or leans on an answer. A
  small call that does not need the user is written as a suggestion (**Possible fix:**, or a
  bullet under **Notes:**). Each skeleton below says where `## Open questions` goes.
- **Unknown facts:** a fact nobody knows yet (how long the count stayed up, which page showed it)
  is not a choice. It goes in the body as "Unknown: …": in skeleton 2 in `## Description` or under
  `## Reproduction` (an unknown about the device in `## Device Info`), in skeleton 1 in the
  paragraph it belongs to. Never under `## Open questions`.
- **Decided:** a choice the user settled in chat is written in as decided (under `## Decided` in
  skeleton 4, or in **Want:** or **Notes:**), and its question is gone.
- **Public repo:** none of the personal infrastructure listed under Constraints in `CLAUDE.md`,
  even when the user's own words carry it. Write "the home server" or "the host". Nothing from
  memory notes or other private context either, and never a memory note's name: only what the
  repo, its issues, the runs and the user's own words show. No guess at the host's setup, and
  nothing about the user they did not say ("seen twice on the home server", not "reported by the
  repo owner").

## 1. Bug found by reading the code

For a bug found in review or while reading code. No `##` headings, except `## Open questions`
when a choice is open: it goes just before **Possible fix:**. REQUIRED, in order:

1. **Provenance**, in the first sentences of the body, as the rule above gives it: where it was
   found, then the run's sentence with its commit.
2. **The mechanism:** what runs, where (`path:line`), why it goes wrong.
3. **A concrete case**, as a numbered list of steps (with times or values when they matter).
4. **How narrow it is,** and what stays correct.
5. **Related issues,** by number, in the sentences that connect them.
6. **A last paragraph starting `**Possible fix:**`.** It states the fix, then the test that would
   show the bug, naming the existing helpers it can use. When no fix is known, it says "No fix
   known yet." and still gives the test. Nothing follows it.

Example, adapted from #63:

````markdown
Found in review of #43 (PR #62), by reading the code. Reproduced on `development` (79b5bb2) with
`./gradlew test --tests server.BlankNameReproTest`: the refused socket joined the lobby.

`onWebsocketConnect` (`backend/src/main/java/server/SecretHitlerServer.java:539-542`) closes a
player's socket whose `name` is empty or blank with 1002 "Lobby and name must be specified.", but
it has no `return`. The handler carries on into `Lobby.joinRefusal` and `Lobby.addUser`. A blank
name is not taken, so the dead connection is added to the lobby.

What happened with a lobby holding Ann:
1. A socket opened with `name=%20%20` was closed with 1002, as intended.
2. Ann's next lobby packet listed `["Ann","  "]`.
3. 10 s later the lobby still counted 2 users, with a live connection under `"  "`.

The close is handled before the add, so `onWebSocketClose` finds nothing to remove, and the grace
window never starts. The phantom player holds a seat until the lobby times out, which never
happens while a real player pings, and START GAME stays off for the host. The page never sends a
blank name (`normalizeName`, and `/check-login` answers 400), so only a hand-made client reaches
this. #64, from the same review, is a race in the same handler.

**Possible fix:** `return` after that close, as every other refusal in the handler does. A backend
test can open a `TestSocket` with a blank name, then check that it is closed with 1002 and that the
lobby still counts only its players (`RejoinServerTest` has the helpers).
````

## 2. Bug seen in play or in CI

For a bug someone saw: in a game, in the browser, in a failing test. The repo's bug-template
headings, these four in this order, and no other heading except `## Open questions` when a choice
is open. REQUIRED:

- `## Description`. Its first sentences are the provenance, as the rule above gives it: where it
  was seen (or which run failed), then the run's sentence with its commit. Then what is known of
  the cause, and the numbers: how often, which project, the exact output in backticks.
- `## Expected Behavior`: one or two sentences.
- `## Reproduction`: a fenced block holding the command or the script that shows it (a
  `npx playwright test ...` line for a browser test). If it did not reproduce, say what was
  tried, under the block.
- `## Device Info`: browser, OS, the project or runner it ran in.

Between `## Reproduction` and `## Device Info`, put one of:
- a paragraph starting `**Possible fix:**` when the cause is known;
- a paragraph `**Not diagnosed yet.**` followed by the suspects as bullets, each saying how to
  tell it apart from the others. When the next steps are investigation, add a `- [ ]` list.

`## Open questions`, when there is one, goes after that paragraph and before `## Device Info`.

Example, adapted from #58:

````markdown
## Description

Found while CI ran #57: its `test` job failed in `frontend/src/game/GameScreen.test.tsx:159`.
Reproduced on `development` (2d86798) with `node repro.js`: it printed 8, not 7. The test expects
a 7 s countdown to read 7, but it read 8. #57 changes no frontend code and the test passes
locally, so it is flaky on `development` too.

The cause is floating-point rounding in `TermTimer`: `clockFor` sets `deadline: now +
timer.remainingMs` (`frontend/src/game/TermTimer.tsx:19`), and the time left is `clock.deadline -
clock.now`, which can come out a hair over 7000. `secondsLeft` rounds it up to 8. In Node, 12,707
of 100,000 random `now` values below 5000 gave 8 instead of 7.

## Expected Behavior

A countdown with `remainingMs` of 7000 shows 7 from its first frame, whatever `performance.now()`
returns.

## Reproduction

```js
// repro.js
const now = 4595.786694409205; // any performance.now() value
console.log(Math.ceil((now + 7000 - now) / 1000)); // 8, not 7
```

**Possible fix:** keep the time left as `remainingMs - (performance.now() - start)`, which is
exactly `remainingMs` until time has passed. Add a test with a fractional `performance.now()`.

## Device Info

Any browser. Seen in Vitest (jsdom) on the CI runner.
````

## 3. Enhancement

For one change that fits one pull request. No `##` headings, except `## Open questions` when a
choice is open: it goes after **Notes:**. REQUIRED, in order:

1. **How it works today,** in the first paragraph, with `path:line` references and the commit
   they come from: what the code does and why it should change. Open with today's behavior, not
   with the request.
2. **A `**Want:**` paragraph or list** of what a player sees afterwards.
3. **A `**Notes:**` bullet list:** the files and constraints it touches, what to leave
   unchanged, the tests to add (which spec, which projects), the docs, and PR screenshots when
   the change shows on screen. It names `e2e/` specs with their projects (`desktop`, `firefox`,
   `phone-360`, `phone-412`) when it asks for a test.

Example, adapted from #25:

````markdown
The portrait picker (`IconSelection`, `frontend/src/custom-alert/IconSelection.tsx`) is a
`ButtonPrompt`: the grid of portraits, then CONFIRM (`#prompt-button`). The whole prompt box
scrolls as one piece (`#alert-box` has `max-height` and `overflow-y: auto`,
`CustomAlert.css:42-43`, from `development` at 41ef7dd). On most screens CONFIRM ends up below
the fold.

**Want:** CONFIRM stays pinned to the bottom of the prompt and is always visible. Only the portrait
grid scrolls above it.

**Notes:**
- Other prompts share `ButtonPrompt`. Either give it a pinned-footer option, or pin the button
  for the picker only.
- `e2e/prompts.spec.ts` (`desktop`, `phone-360`, `phone-412`) opens every prompt. Add a check
  there that CONFIRM is in view without scrolling.
- The change shows on screen: the pull request needs before-and-after screenshots at one desktop
  size and one phone size.
- Related upstream issue: `ShrimpCryptid/Secret-Hitler-Online#179`.
````

## 4. Large enhancement

For work with several parts, or one that will not fit one session. REQUIRED, in order:

1. **An opening paragraph:** what to add, and why. Say what it is **blocked by** (`Blocked by
   #30.`) when another issue must land first.
2. **Sections for its parts:** **Scope:** with a bullet list, or `## Remove`, `## Change`,
   `## Add`, each with its own bullets.
3. **`## Decided`:** each settled question, with its answer in bold, when there are any.
4. **`## Open questions`:** one bullet per undecided point, written as a question. Nothing
   undecided is stated as fact anywhere else in the body.
5. **A closing line,** when it will not fit one session: "Plan this in phases before writing any
   code" (a design and a per-phase plan first, one pull request per phase). Name the
   constraints in `CLAUDE.md` it changes.

Example, adapted from #30:

````markdown
Add user accounts. The only way to sign in is with Discord (OAuth2): no passwords and no other
providers. Accounts are what game stats tracking will build on.

**Scope:**
- A "Sign in with Discord" button on the login page. The server runs Discord's authorization code
  flow (scope `identify`) and keeps a session cookie.
- An accounts table in the existing SQLite database (`DATABASE_PATH`), keyed by Discord user ID.
- Playing needs an account. Someone who isn't signed in can only watch, as a spectator does today.

## Decided

- Can people still play as guests? **No.** Playing needs an account.

## Open questions

- Do sessions survive a server restart (stored in SQLite)?

Joining as a player now needs a signed-in session, which changes the "stays backward compatible
for players" line under Constraints in `CLAUDE.md`. The pull request for this issue updates it.
Plan this in phases before writing any code: a design and a per-phase plan first, then one pull
request per phase.
````
