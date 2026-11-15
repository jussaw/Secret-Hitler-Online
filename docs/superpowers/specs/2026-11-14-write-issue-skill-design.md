# write-issue skill: design

Date: 2026-11-14
Status: approved design, pending implementation plan

## Why

Every issue on the fork so far was written in a Claude session, in one house style, and each
session had to be shown that style again. The user wants a shortcut: `/write-issue <what you saw or
want>` turns a few words into an issue written the way the last 27 were. Nothing more is behind it
("just to call it easier").

## Goals

- One call takes one or several things, and each becomes its own issue.
- Each issue reads like the existing ones: the same title form, label, sections and level of
  detail, with `file:line` references to `development` at a stated commit.
- Every bug is reproduced first if it can be, and the issue says whether it was and how.
- You see every draft before it is posted, and nothing is posted without your OK.

## Non-goals

- Fixing anything. That is `implement-issue`'s job.
- Screenshots, annotated shots or mockups (as in #51), unless you ask for them in the call.
- Editing, commenting on or closing existing issues.

## Anti-goals

- A detail of the personal infrastructure in a public issue (`CLAUDE.md`, Constraints).
- Pinging upstream: its issues are written in backticks, `ShrimpCryptid/Secret-Hitler-Online#141`.
- "Reproduced" written without a run that showed it.
- A choice you never made written as decided. `implement-issue` builds an issue with no open
  questions straight away, so an unmade choice goes under **Open questions**, and a small one is
  written as a suggestion (**Possible fix:**, Notes).
- A duplicate of an issue that is already open.

## Constraints

- Every `gh` command takes `--repo jussaw/Secret-Hitler-Online`.
- Only two labels: `bug` or `enhancement`, exactly one per issue. `implement-issue` merges a `bug`
  by itself once CI is green.
- Reproducing needs Java 17 for the backend and `npm ci` for the frontend. Browser runs build and
  serve the app on port 4545, so only one runs at a time.
- In a worktree session, git runs as `git -C <absolute path>`, one command per call, and new
  worktrees nest under the session's own.
- Throwaway repro tests are never committed.

## Approaches

- **A. One `SKILL.md` that reads past issues as models.** Short format rules, and a list of issues
  (#63, #64, #58, #59, #24, #28, #51) to read with `gh issue view` on each run. One file; its
  examples never drift. Not picked.
- **B. `SKILL.md` plus a bundled `formats.md` of skeletons.** The steps in `SKILL.md`, and a
  filled-in skeleton for each kind of issue in `formats.md`. Needs nothing from GitHub to know the
  format, but is a second copy of the style, to be kept up to date as the issues change. **Picked
  by the user.**
- **Ruled out: rework `.github/ISSUE_TEMPLATE/` into the house style.** The page's Report a bug link
  (`ISSUES_URL`) sends players to those templates, and a player cannot give `file:line` references
  or a fix. They stay player-facing.

## Decided

- Name and place: `/write-issue`, in `.claude/skills/write-issue/` (`SKILL.md` and `formats.md`).
  My call.
- Reproduce: always try, for every bug (the user's choice). A backend test, a Vitest test or a
  throwaway Playwright probe, whichever reaches the bug. A bug that does not show after a real
  attempt is written up as not reproduced, with what was tried.
- Posting: show every draft (title, label, body) and post only on your OK, then give the links (the
  user's choice; first "post straight away", then changed to drafts).

## The skill's steps

1. **Split** the request into issues. For each, search the issues, open and closed, for the same
   thing. An open one: stop and point at it. A closed one: link it as related ("this may be #41
   again").
2. **Check out `development`.** A throwaway detached worktree at `origin/development`, so the
   session's own changes never colour a repro or a line number. Note its short commit. My call.
3. **Read the code** until the mechanism is plain: what runs, where (`file:line`), and why it goes
   wrong or what would change.
4. **Reproduce** a bug, always: the smallest test that shows it. Record what happened in plain
   numbers, as #63 does ("Ann's next lobby packet listed `["Ann","  "]`").
5. **Draft** each issue from its skeleton in `formats.md`, then check it against the anti-goals.
6. **Show** every draft. Make the changes you ask for, and post each on your OK with
   `gh issue create --repo … --title … --label … --body-file …`. Give the links.
7. **Clean up**: the throwaway tests and the worktree.

A batch runs one subagent per issue, one after another (port 4545, and one Gradle build at a time),
each bringing back a draft. The drafts are shown together. My call.

## formats.md

Rules for every issue:

- Title `area: plain summary`, lowercase after the colon. The area is `backend`, `frontend`, `e2e`,
  `ci`, `docker` or `docs`, joined with `, ` when several (`frontend, backend`). A bug names the
  symptom ("a second disconnect inside the grace window frees the seat early"); an enhancement says
  what to do ("pin the icon picker's confirm button to the bottom of the prompt").
- Plain, short sentences, as in the existing issues. Code, files and names in backticks.
- Related issues and PRs by number; the constraints in `CLAUDE.md` it touches, by name.

Skeletons, each filled in with an example:

1. **Bug found by reading the code or in review** (#42, #43, #63, #64). No headings. Where it was
   found and whether it was reproduced, at which commit; the mechanism with references; a concrete
   case, step by step; how narrow it is and what stays correct; related issues; **Possible fix:**
   and the test that would show it, naming existing helpers.
2. **Bug seen in play or in CI** (#58, #59). The repo's bug-template headings: Description,
   Expected Behavior, Reproduction, Device Info. Then **Possible fix:**, or **Not diagnosed yet.**
   with the suspects and how to tell them apart, and a `- [ ]` list when the next steps are
   investigation (#26, #27, #29).
3. **Enhancement** (#24, #25, #28). How it works today and why it should change; **Want:**, what a
   player sees; **Notes:**, the files, the constraints, the tests to add (which spec, which
   projects), the docs, and PR screenshots when the change shows on screen.
4. **Large enhancement** (#30, #31, #51). Sections for its parts (Scope, or Remove / Change / Add),
   **Decided**, **Open questions**, and when it will not fit one session, a note to plan it in
   phases first.

## Also in this change

- `.github/ISSUE_TEMPLATE/feature_request.md` applies the label `new feature`, which the repo does
  not have. Change it to `enhancement`.
- `CLAUDE.md`: add `write-issue` to the `.claude/skills/` bullet.
- `implement-issue` offers to open an issue for a bug found on the way (steps 4 and 10): have it
  name `/write-issue`. My call.

## Left to the builder

- The wording of the skeletons and their examples, and the skill's description and trigger phrases.
- How the duplicate search is phrased, and the subagent brief for a batch.
- Testing the skill as `writing-skills` asks, before it is committed.
