---
name: implement-issue
description: Use when the user asks to implement, fix, build or close a GitHub issue of this repository by number or link, such as "/implement-issue 43", "fix #43" or "work on issue 51".
---

# Implement a GitHub issue

One issue, one branch, one pull request, taken to green CI. An issue labelled `bug` is merged by you
once CI is green, and the merge and the image check after it are part of the job, not a question to
ask. Any other issue's PR stops at green CI, and the user merges it. `CLAUDE.md` holds the rules (Workflow, Commits, Constraints); this skill is their order. Read
`CLAUDE.md` again from your fresh branch, since a stale checkout carries stale rules.

Every `gh` command takes `--repo jussaw/Secret-Hitler-Online` (written `--repo …` below). Run git as
`git -C <absolute worktree path> <subcommand>`, one command per call: sessions isolated in a worktree
refuse `cd … && git` chains.

## 1. Read the issue

`gh issue view N --repo … --json title,state,labels,body,comments` (plain `--comments` prints
nothing outside a terminal), then state its title and whether it is labelled `bug`. Look for work
already under way: the PRs that close it (`gh issue view N --repo … --json
closedByPullRequestsReferences`, open ones included), the open PRs (`gh pr list --repo … --state
open`), and `git worktree list`.

- The issue is closed, or an open PR closes it or plainly does its work: stop and ask.
- An open PR only touches the same code: go ahead, and expect to rebase in step 9.
- The issue lists questions it leaves open, or needs an outside service or new stored data: go to
  **Needs design** below and build nothing.
- The issue names a branch to continue: use that branch in step 2.

## 2. Set up

The work gets a worktree and a branch with the same name: the branch the issue says to continue, or
two to four words for what changes (`rejoin-name-race`, not `issue-43`).

- `git fetch origin`.
- A worktree already holds that branch: if `git worktree list` shows it `locked`, or it has
  uncommitted changes, another session owns it, so stop and ask. Otherwise call EnterWorktree with
  its `path` and `git rebase origin/development`.
- Otherwise make one. Its parent is the session's own worktree when the session runs inside
  `.claude/worktrees/`, and the main checkout (the first line of `git worktree list`) when it does
  not. Spell the path out in full: `git -C <parent> worktree add <parent>/.claude/worktrees/<name>
  -b <name> origin/development`. For a branch that exists only on `origin`, drop `-b` and pass
  `<name>` in place of `origin/development`. Then call EnterWorktree with that `path`.
- `cd frontend && npm ci` (each worktree has its own `node_modules`). Point `JAVA_HOME` at an
  installed Java 17 (`ls ~/.sdkman/candidates/java`) for every Gradle and `npm run e2e` run; the
  Gradle wrapper fails on newer JDKs.

## 3. Take the "before" screenshots

Skip this when the change touches no markup, CSS or text the page shows; the PR then says so. A
backend fix whose symptom shows on screen but cannot be staged on purpose is skipped the same way.

Otherwise, before changing any code:

- Write a temporary spec, `frontend/e2e/pr-shots.spec.ts`. It reaches the state the issue is about
  (`e2e/fakeGame.ts` scripts a game socket, `e2e/lobby.ts` drives a real lobby), sets each
  viewport itself, and saves to `docs/pr/<branch>/before-<state>-<W>x<H>.png`. It is never
  committed.
- Run it with `npx playwright test e2e/pr-shots.spec.ts --project=desktop` (1600x900) and
  `--project=phone-412` (412x915), plus any size the issue is about. The config builds and serves
  the app on port 4545, so a browser run in another worktree must finish first.

## 4. Build it, test first

Use the `tdd` skill. For a bug, write a test that fails because of the bug before you change any
code (JUnit in `backend/src/test/`, Vitest beside the file, Playwright in `frontend/e2e/`); use
`diagnosing-bugs` when the cause is unclear. If the bug will not show in a test after a real
attempt, stop and report what you tried.

Of the choices the issue leaves open, settle the small ones yourself and list each in the PR. Ask
first about one that is hard to undo: stored data, the players' WebSocket protocol, or removing
something players use. A different bug found on the way is not fixed here; offer to open an issue
for it in the final report.

## 5. Verify

With Java 17 active, run and keep the counts:

- `cd backend && ./gradlew test`
- `cd frontend && npm test -- --run && npm run build`
- Browser tests: `npm run e2e -- --project=desktop` for a backend-only change. For a frontend change,
  every project whose specs cover what changed (`playwright.config.ts` lists what each runs), and
  all four when CSS or layout changes. A project that cannot run on this machine is left to CI and
  named in the PR.

Then rename the shots' prefix to `after-` in `pr-shots.spec.ts`, run it again the same way, and
delete the spec.

## 6. Docs

Update `CLAUDE.md`, `README.md`, `DEVELOPMENT.md` and anything under `docs/` the change makes
stale. Tick a `docs/PLAN.md` box only if one names this issue; most single issues have none.

## 7. Review

Run the `code-review` skill against `origin/development`. Fix every finding, Minor ones included,
or write down why it needs no change. Re-run the tests the fixes touch.

## 8. Commit, push, open the PR

Conventional Commits as `CLAUDE.md` describes: each test with the code it tests, docs in their own
commits. Commit the screenshots, push (`git push -u origin <branch>`, or `--force-with-lease` for a
continued branch you rebased), and link each image by
`https://raw.githubusercontent.com/jussaw/Secret-Hitler-Online/<commit sha>/docs/pr/<branch>/<file>`.

`gh pr create --repo … --base development --head <branch> --title "<type(scope): summary of the
whole change>" --body-file <scratchpad file>`. The body has these sections, in order:

1. **Before and after**: a table, a row per size and state, "before" left and "after" right; or
   the line "This PR changes nothing on screen."
2. **Changes**: what changed, grouped by server and page.
3. **Decisions the issue left open**: each choice you made (only if there were some).
4. **Known limits** (only if there are some).
5. **Review**: each finding and what was done about it.
6. **Tests**: what each new test checks, the local counts, and anything not run locally and why.
7. **Docs**: what was updated.
8. `Closes #N`.

## 9. CI, merge, image

- Watch the checks yourself, in the background: `gh pr checks <PR> --repo … --watch --interval 30`.
- A check fails: read `gh run view <run> --repo … --log-failed` (a failed `e2e` keeps its Playwright
  report as an artifact), fix, push, and watch again.
- `development` moved and conflicts: `git rebase origin/development`, keep both sides' changes,
  re-run the tests, then `git push --force-with-lease`.
- Every check passes (`image` skips on PRs), and the issue is not labelled `bug`: stop here and go
  to step 10. The user merges it, or tells you to, and then you carry on with the next two points.
- Every check passes and the issue is labelled `bug`: `gh pr merge <PR> --repo … --merge`.
  Auto-merge is off on this repo.
- After a merge, watch the push run on `development` the same way: `gh run list --repo … --branch development
  --limit 1`, then `gh run watch <run> --repo … --exit-status`. Confirm the new `:latest` and
  `:sha-<short>` tags with `gh api "/users/jussaw/packages/container/secret-hitler-online/versions?per_page=3"`,
  and that the issue closed.

## 10. Report

The PR link and its green checks; for a merged bug, the merge commit and the image tag; for any
other issue, that the PR is ready for the user to merge. Then what changed, the decisions you made,
anything not run locally, and any issue you offer to open. Boxes that need a person, such as playing
on the deployed build, stay for the user.

## Needs design

Build nothing. Use `brainstorming` to settle the open questions with the user, write the spec under
`docs/superpowers/specs/`, then use `writing-plans` for the plan under `docs/superpowers/plans/` and
a new phase in `docs/PLAN.md`. Commit them on a phase branch (`phase-<n>-<topic>`, in a worktree of
the same name, made as in step 2) and push. End with one paste-ready prompt for a new session: the docs to read, the branch, the execution skill,
the Java 17 setup, when to stop and ask, and what done looks like.
