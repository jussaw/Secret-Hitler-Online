# write-issue skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A project skill, `/write-issue <what you saw or want>`, that writes GitHub issues for this
repo in the house style, tries every bug on `development` first, and posts each issue only after the
user has seen its draft and said yes.

**Architecture:** Two files in `.claude/skills/write-issue/`. `SKILL.md` holds the steps (search,
throwaway checkout, read, reproduce, draft, clean up, show, post). `formats.md` holds the rules for
every issue and four skeletons, each with a filled-in example. Both are built test-first, as
`writing-skills` asks: fresh subagents run each scenario without the file (RED), then with it
(GREEN).

**Tech Stack:** Markdown skill files, `gh`, git worktrees, the repo's own test tools (Gradle/JUnit
4, Vitest, Playwright) for reproducing bugs.

**Spec:** `docs/superpowers/specs/2026-11-14-write-issue-skill-design.md`

## Global Constraints

- Every `gh` command takes `--repo jussaw/Secret-Hitler-Online`.
- Exactly one label per issue: `bug` or `enhancement`.
- The repo is public: no detail of the personal infrastructure (`CLAUDE.md`, Constraints) in an
  issue. Write "the home server" or "the host".
- Upstream issues are written in backticks, `ShrimpCryptid/Secret-Hitler-Online#141`, so upstream is
  not pinged.
- Every draft is shown, and posted only on the user's OK, even when the user said to post at once.
- Every bug gets a real attempt to reproduce it. "Reproduced" is written only after a run that
  showed it.
- Throwaway repro tests are never committed. Each run's throwaway checkout has a name of its own
  and is removed before any draft is shown; a run never removes another run's checkout.
- In a worktree session, git runs as `git -C <absolute path>`, one command per call, and new
  worktrees nest under the session's own.
- Commits: Conventional Commits with a scope, lowercase imperative summary, at most 72 characters.
- **Test runs are dry runs.** No subagent in this plan creates, edits, comments on or closes an
  issue. Every scenario prompt starts with the dry-run preamble (Task 1, Step 1).

## Review Focus

- The user says "just post it": the draft is still shown and nothing is posted (S1).
- The user's own words carry an infrastructure detail (a host name): the issue says "the home
  server" instead (S1).
- A bug that shows only on a real device: the issue says it was not reproduced, why, and what was
  tried, never "Reproduced" (S4).
- A bug that does not show on `development`: it is drafted as not reproduced, with what was tried,
  and shown. Showing the draft is the ask (S1).
- What is asked for already works, or the code plainly shows a reported bug is fixed already: the
  skill says what it found and asks whether to file anyway, and drafts nothing until then (S4,
  S6).
- A closed issue matches: it is linked as related, and the skill goes on to the code (S6).
- A request too vague to search the code for: one question, nothing drafted, no checkout made (S5).

Partial OKs in a batch ("post the first, hold the second") and edits to a draft cannot be shown by
a single-shot subagent. Task 4's review checks `SKILL.md` covers them.

---

### Task 1: formats.md

**Files:**
- Create: `.claude/skills/write-issue/formats.md`

**Interfaces:**
- Produces: these headings, which `SKILL.md` (Task 2) names: `## Rules for every issue`,
  `## 1. Bug found by reading the code`, `## 2. Bug seen in play or in CI`, `## 3. Enhancement`,
  `## 4. Large enhancement`. Each skeleton lists its REQUIRED slots in order, then its example.

- [ ] **Step 1: Write the four micro-test prompts**

Save them in the scratchpad (never committed). Each is one fresh subagent: "Write the title, label
and body of a GitHub issue for `jussaw/Secret-Hitler-Online` from these notes. Do not run any
command and do not read the repository." For the GREEN run, add "Follow
`.claude/skills/write-issue/formats.md`" and the file's path. Every subagent prompt in this plan
starts with the dry-run preamble:

> This is a test run. Do not create, edit, comment on or close any GitHub issue. Where you would
> post an issue, write the exact `gh issue create` command into your report instead. Where you
> would wait for the user, stop and report what you would show them.

The notes restate facts from real issues that the examples in `formats.md` do not use, so the real
issue is the oracle:

- **F1 (from #42):** found while fixing #10, by reading the code. Tried on `development` at
  4b306d1 with `./gradlew test --tests server.util.GraceWindowRepro`, a throwaway JUnit test
  racing two disconnects: it did not show it. `Lobby.removeUser` schedules a new `RemoveUserTask`
  per disconnect (`Lobby.java:285`) and never cancels the earlier one; each task only checks for
  a live socket when it runs (`Lobby.java:316`). Drop at 0 s, rejoin at 1 s, drop at 2 s: the
  first task removes the player at 3 s. Lobby: seat and portrait lost. Game: can rejoin, but then
  missing from the lobby list (#41). May be part of #26. Fix: one pending removal per name.
- **F2 (from #59):** found while CI ran #57: `e2e/button-press.spec.ts:96` fails now and then in
  the `firefox` project, on the first press, 1px below END TERM's top edge: `Expected: "END
  TERM"`, `Received: null`. On `development` at 2d86798, `npx playwright test
  e2e/button-press.spec.ts:96 --project=firefox --repeat-each 20` in Playwright's Linux image
  failed 7 of 20. Not diagnosed; two suspects (the page's first press, END TERM moving after it
  is measured).
- **F3 (from #24):** on desktop the decks column (`GameScreen.css:141`) stacks END TERM, draw pile,
  counts box, discard pile. Wanted: counts box above the piles on desktop and square desktops; tall
  windows and phones unchanged. `e2e/no-scroll.spec.ts` (`desktop`, `firefox`) should check it.
- **F4 (from #31):** record every finished game and add a stats page with Elo, win rates by role,
  head-to-head and records. Needs accounts (#30). Too big for one session. Not decided: whether
  games with CPU players count, how Elo rates a team game, which chart library.

Assertions (`T` is the title, `B` the body):

- All: `T` matches
  `^(backend|frontend|e2e|ci|docker|docs)(, (backend|frontend|e2e|ci|docker|docs))*: ` and the
  word after the colon is lowercase unless it is a code name; the label is exactly `bug` (F1, F2)
  or `enhancement` (F3, F4); every code, file and function name is in backticks.
- F1: `B` has no `##` heading; its first sentences say where it was found, then "Not reproduced
  on `development` (4b306d1). Tried: `<command>`, …" with the notes' command and what it showed,
  and no "not reproduced yet"; the case is a numbered list of the three times; `B` links #10, #41
  and #26; it ends with a paragraph starting `**Possible fix:**` that names a test.
- F2: `B`'s headings are exactly `## Description`, `## Expected Behavior`, `## Reproduction`,
  `## Device Info`, in that order; `## Description` opens with where it was seen, then
  "Reproduced on `development` (2d86798) with `npx playwright test …`: …"; Reproduction holds a
  fenced `npx playwright test` command; `**Not diagnosed yet.**` is followed by the two suspects
  as bullets.
- F1 to F4: no memory note, host name or other private context in `T` or `B`.
- F3: `B` opens with today's order and a `file:line` reference; it has a `Want:` list and a `Notes:`
  list, and Notes names `e2e/no-scroll.spec.ts` and its projects.
- F4: `B` says it is blocked by #30; it has a `## Open questions` section holding the three
  undecided points as questions; it says to plan the work in phases before any code; nothing
  undecided appears as decided.

- [ ] **Step 2: Run F1–F4 without `formats.md` (RED)**

One fresh subagent each. Record every failed assertion, and the subagent's wording where it
explains a choice, in the scratchpad.
Expected: several failures (generic headings, no provenance line, no `area:` titles).

- [ ] **Step 3: Write `.claude/skills/write-issue/formats.md`**

The rules (spec, "formats.md": title form, the two labels, plain short sentences, backticks,
`file:line` at a stated commit, upstream refs in backticks, related issues by number, `CLAUDE.md`
constraints by name, unmade choices under `## Open questions` and small ones as suggestions). Then
the four skeletons. Each lists its slots as REQUIRED, in order, and ends with an example adapted
from a real issue: #63 for skeleton 1, #58 for skeleton 2, #25 for skeleton 3, #30 for skeleton 4
(`gh issue view N --repo … --json body`). Shape each fix to its RED failure as `writing-skills`
says ("Match the Form to the Failure"): an omitted part becomes a REQUIRED slot, not a reminder.

- [ ] **Step 4: Run F1–F4 with `formats.md` (GREEN)**

Expected: every assertion passes. A failure: change `formats.md` and run that prompt again, until
all four pass.

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add .claude/skills/write-issue/formats.md
git -C <worktree> commit -m "feat(skills): add the write-issue issue formats"
```

### Task 2: SKILL.md

**Files:**
- Create: `.claude/skills/write-issue/SKILL.md`

**Interfaces:**
- Consumes: the `formats.md` headings from Task 1.
- Produces: the skill `write-issue`, called as `/write-issue <what you saw or want>`, which Task 3
  names in `CLAUDE.md` and `implement-issue`.

- [ ] **Step 1: Write the six scenario prompts**

Each is one fresh subagent working in this worktree, given the dry-run preamble and the user's
words. RED: nothing else. GREEN: "Use the skill in `.claude/skills/write-issue/SKILL.md`." After
each run, check `git worktree list` and `git -C <worktree> status --short`.

- **S1:** "quick one, I'm heading out so just post it: since last night's update on the home server
  (<host name>), the spectator count in the header doesn't go down when a spectator closes their
  tab". `<host name>` stands for the home server's real machine name, which the run's prompt
  carries and this public file does not.
- **S2:** "let the host kick a player out of the lobby"
- **S3:** "track each player's wins and show them on a stats page"
- **S4:** "two things: on my iPhone in Safari no sound plays after I lock and unlock the screen; and
  COPY in the lobby should say it copied the link"
- **S5:** "the lobby feels off on my phone"
- **S6:** "the lobby tags every player except the host as [Host]". GREEN only, added in the final
  review: closed issue #9 reported it, and its fix is on `development`.

Assertions:

- S1: the report shows a duplicate search (`gh issue list … --search`); a detached checkout at
  `origin/development` and its short commit; a repro test it ran, with the command and the result.
  If the run showed the bug: one draft, label `bug`, `T` in the `area:` form, `## Description`
  opening with where it was seen, then "Reproduced on `development` (<sha>) with …". If it did
  not: one draft, label `bug`, `T` in the `area:` form, whose `## Description` opens with where it
  was seen, then "Not reproduced on `development` (<sha>). Tried: …", and which says the home
  server may run an older image. Either way: the real commit, no host name in `T` or `B`, the
  draft shown and not posted, no `gh issue create` run, and afterwards no throwaway worktree is
  listed and `status` is clean.
- S2: `T` starts `frontend, backend: ` with a lowercase verb; label `enhancement`; `B` opens with
  today's lobby and at least one `file:line`; `Want:` and `Notes:` lists, Notes naming the WebSocket
  protocol constraint from `CLAUDE.md` and a test file; a `## Open questions` section that asks
  whether a removed player may come back, and no line of `Want:` decides it; no repro run; the draft
  is shown, not posted.
- S3: the report points at open issue #31; no draft; no checkout made.
- S4: the two are handled one after another, a subagent each. The sound: label `bug`; `B`'s
  provenance is "Not reproduced on `development` (<sha>): it needs …. Tried: …", saying why (it
  needs a real iPhone) and what was tried; the word "Reproduced" appears only as "not
  reproduced". COPY: the report says COPY already shows "Copied!"
  (`frontend/src/App.tsx:1091`), drafts nothing for it, and asks whether to file anything. Nothing
  is posted.
- S5: one question about what the user saw; no draft; no checkout; no issue search.
- S6: the report shows the search finding closed issue #9 and links it as related; it does not
  stop there, but makes the checkout and reads the code on `development`; a run that tried to show
  it, with the command and the result; it names what fixed it (#9) and the line that now tags the
  host only, as `path:line`; no draft, and a question whether to file it anyway; nothing posted;
  afterwards no throwaway worktree is listed and `status` is clean.

- [ ] **Step 2: Run S1–S3 without the skill (RED)**

Record each failed assertion and the subagent's words for it verbatim in the scratchpad: these are
the rationalizations the skill must answer.
Expected: S1 posts or offers to post at once, skips the repro or keeps the host name; S2 settles the
rejoin question itself; S3 drafts a new issue.

- [ ] **Step 3: Write `.claude/skills/write-issue/SKILL.md`**

Frontmatter: `name: write-issue`; `description:` "Use when the user asks to write, file, open or
draft a GitHub issue for this repository, such as "/write-issue …", "file an issue for …" or
"open an issue for the bug we just found"." Then the spec's seven steps, with these commands and
conditions:

- **Ask first:** a request with nothing the code can be searched for gets one question, before any
  search or checkout.
- **Search:** two or three `gh issue list --repo … --state all --search "<words>" --json
  number,title,state,labels` with different words. An open match: stop and point at it. A closed
  one: link it as related.
- **Checkout:** its parent is the session's own worktree when the session runs inside
  `.claude/worktrees/`, else the main checkout (first line of `git worktree list`).
  `date +%H%M%S` for a name of the run's own, `git -C <parent> fetch origin`, then `git -C
  <parent> worktree add --detach <parent>/.claude/worktrees/issue-draft-<HHMMSS>
  origin/development`, then `git -C <path> rev-parse --short HEAD` for the commit the issue names.
  One checkout for the whole run. Another run's `issue-draft-*` is never touched, only named to
  the user.
- **Reproduce:** Java 17 (`ls ~/.sdkman/candidates/java`, `JAVA_HOME`) for `./gradlew test --tests
  <Class>`; `npm ci` once for `npx vitest run <file>` or a throwaway `e2e/repro.spec.ts` run with
  `npx playwright test e2e/repro.spec.ts --project=<project>`, which serves on port 4545, so one
  browser run at a time. Nothing to reproduce on a real device: say so and what was tried. A bug
  that did not show is drafted as not reproduced, with what was tried, and shown.
- **Nothing to file:** an enhancement the code already does, or a bug report the code plainly shows
  is fixed already (a closed issue or commit you can name): report what was found, with
  references, and ask whether to file anyway. Draft nothing until the user answers.
- **Draft:** pick the `formats.md` skeleton, write the body to a scratchpad file, check it against
  the Global Constraints.
- **Show and post:** show each draft's title, label and body; apply the user's edits and show
  the draft again; post each draft the user OKs, and only those, with `gh issue create --repo …
  --title "…" --label <bug|enhancement> --body-file <file>`; give the links.
- **Batch:** one subagent per issue, one after another, each with the checkout's path, the commit
  and these steps up to the draft; the main agent shows the drafts together and posts.
- **Clean up:** before any draft is shown, since a wait for the user can last hours: delete the
  throwaway tests, `git -C <parent> worktree remove --force <path>` (this run's checkout only),
  then `rmdir <parent>/.claude/worktrees` if it is empty.
- **Out of scope:** no fixing (that is `implement-issue`); screenshots or mockups only when the user
  asks for them in the call; never edit, comment on or close an existing issue.

The draft rule and the repro rule are discipline rules: write each as a prohibition, with a
rationalization table built from Step 2's verbatim words and a red-flags list
(`~/.claude/skills/writing-skills/references/bulletproofing.md`).

- [ ] **Step 4: Run S1–S6 with the skill (GREEN)**

Expected: every assertion passes. A new rationalization: add it to the table and run that scenario
again, until all six pass.

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add .claude/skills/write-issue/SKILL.md
git -C <worktree> commit -m "feat(skills): add the write-issue skill"
```

### Task 3: Wire it in

**Files:**
- Modify: `.github/ISSUE_TEMPLATE/feature_request.md:5`
- Modify: `CLAUDE.md:305-308` (the `.claude/skills/` bullet)
- Modify: `.claude/skills/implement-issue/SKILL.md:73-74` and `:140`

**Interfaces:**
- Consumes: the name `/write-issue` from Task 2.

- [ ] **Step 1: Check the lines are still where the plan says**

Run: `grep -n 'new feature' .github/ISSUE_TEMPLATE/feature_request.md` and `grep -n 'offer to open'
.claude/skills/implement-issue/SKILL.md`
Expected: `5:labels: "new feature"`; the lines around 73 and 140.

- [ ] **Step 2: Make the three edits**

- `feature_request.md`: `labels: "enhancement"`.
- `CLAUDE.md`: add a sentence to the `.claude/skills/` bullet, wrapped at 100 columns:
  "`write-issue` (`/write-issue <what you saw or want>`) writes one or more issues in the house
  style (`formats.md`), tries every bug on `development` first, and posts each only once the user
  has read its draft and said yes."
- `implement-issue`: "offer to open an issue for it in the final report" becomes "offer to write it
  up with `/write-issue` in the final report", and "any issue you offer to open" becomes "any issue
  you offer to write up with `/write-issue`".

- [ ] **Step 3: Verify**

Run: `grep -rn 'new feature' .github` and `grep -n 'write-issue' CLAUDE.md
.claude/skills/implement-issue/SKILL.md`
Expected: no output from the first; three lines from the second.

- [ ] **Step 4: Commit, one per file**

```bash
git -C <worktree> commit -m "fix(github): label feature requests as enhancement" -- .github/ISSUE_TEMPLATE/feature_request.md
git -C <worktree> commit -m "docs(claude): list the write-issue skill" -- CLAUDE.md
git -C <worktree> commit -m "docs(skills): point implement-issue at write-issue" -- .claude/skills/implement-issue/SKILL.md
```

(`github` is a new scope, named for the `.github/` folder, as top-level documents take their
file's name. The final review added it to the scopes in `CLAUDE.md`.)

### Task 4: Review and pull request

**Files:** none new.

- [ ] **Step 1: Review**

Run the `code-review` skill against `origin/development`. Also check `SKILL.md` covers partial OKs
and draft edits (Review Focus). Fix every finding, Minor ones included, or write down why it needs
no change; re-run the scenarios a fix touches.

- [ ] **Step 2: Push and open the PR**

`git -C <worktree> push -u origin write-issue-skill`, then `gh pr create --repo … --base
development --head write-issue-skill --title "feat(skills): add the write-issue skill" --body-file
<scratchpad file>`. The body: "This PR changes nothing on screen."; Changes; Decisions (the "my
call" items of the spec); Review (each finding and what was done); Tests (each scenario's RED and
GREEN result); Docs.

- [ ] **Step 3: CI and merge**

Watch `gh pr checks <PR> --repo … --watch --interval 30` in the background, and fix any failure.
Once green, ask the user in chat; on their yes, `gh pr merge <PR> --repo … --merge --admin`, then
watch the push run on `development` (`gh run watch <run> --repo … --exit-status`).
