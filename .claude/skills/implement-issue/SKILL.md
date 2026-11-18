---
name: implement-issue
description: Use when the user asks to implement, fix, build or close one GitHub issue of this repository by number or link, such as "/implement-issue 43", "fix #43" or "work on issue 51" (for two or more at once, implement-issues).
---

# Implement a GitHub issue

One issue, one branch, one pull request, taken to green CI. An issue labelled `bug` is merged by you
once CI is green, and the merge and the image check after it are part of the job, not a question to
ask. Any other issue's PR stops at green CI until the user says in chat to merge it, and then you
merge it the same way. `CLAUDE.md` holds the rules (Workflow, Commits, Constraints); this skill is
their order. Read `CLAUDE.md` again from your fresh branch, since a stale checkout carries stale
rules.

Other sessions may be running this skill at the same time. They share `development`, which can move
and conflict while your PR waits (step 9), and this machine: your browser runs get a port of their
own (step 2), and a timing test can fail while another session's run slows the machine (step 5).

Every `gh` command takes `--repo jussaw/Secret-Hitler-Online` (written `--repo …` below). Run git
as `git -C <absolute worktree path> <subcommand>`, one command per call: sessions isolated in a
worktree refuse `cd … && git` chains.

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
- Pick a port for this session's browser runs, one from 4546 to 4999 that `lsof -nP
  -iTCP:<port> -sTCP:LISTEN` shows free, and pass it as `E2E_PORT=<port>` to every `npx
  playwright` and `npm run e2e` command, the Linux image's too (step 5). A run waits for any server
  on its port to answer `/ping` while it builds, so two runs on one port can test each other's code
  without an error. A run that stops at once with `http://localhost:<port>/ping is already used`
  has found another server there: pick another port. Never stop a server you did not start.
- A change to the frontend's dependencies runs npm 11 (`npx npm@11 install …`), since npm 10 drops
  the lockfile's `libc` fields.

## 3. Take the "before" screenshots

Skip this when the change touches no markup, CSS or text the page shows; the PR then says so. A
backend fix whose symptom shows on screen but cannot be staged on purpose is skipped the same way.

Otherwise, before changing any code:

- Write a temporary spec, `frontend/e2e/pr-shots.spec.ts`. It starts with
  `test.skip(!process.env.PR_SHOTS)`, so the browser runs of step 5 leave its shots alone. It
  reaches the state the issue is about (`e2e/fakeGame.ts` scripts a game socket, `e2e/lobby.ts`
  drives a real lobby), sets each viewport itself, and saves to
  `docs/pr/<branch>/before-<state>-<W>x<H>.png`. It is never committed.
- Run it once for both projects, so the app is built once: `PR_SHOTS=1 E2E_PORT=<port> npx
  playwright test e2e/pr-shots.spec.ts --project=desktop --project=phone-412`. The spec shoots
  1600x900 in `desktop` and 412x915 in `phone-412` (`testInfo.project.name`), plus any size the
  issue is about.

## 4. Build it, test first

Use the `tdd` skill. For a bug, write a test that fails because of the bug before you change any
code (JUnit in `backend/src/test/`, Vitest beside the file, Playwright in `frontend/e2e/`); use
`diagnosing-bugs` when the cause is unclear. If the bug will not show in a test after a real
attempt, stop and report what you tried, and whether something already merged looks to have fixed
it, so the user can decide whether to close the issue.

Of the choices the issue leaves open, settle the small ones yourself and list each in the PR. Ask
first about one that is hard to undo: stored data, the players' WebSocket protocol, or removing
something players use. A different bug found on the way is not fixed here; offer to write it
up with `/write-issue` in the final report.

## 5. Verify

With Java 17 active, run and keep the counts:

- `cd backend && ./gradlew test`
- `cd frontend && npm test -- --run && npm run build`
- Browser tests: `npm run e2e -- --project=desktop` for a backend-only change. For a frontend
  change, every project whose specs cover what changed (`playwright.config.ts` lists what each
  runs), and all four when CSS or layout changes.

Two cases need Playwright's Linux image (`DEVELOPMENT.md`, "Browser tests on Linux"), not a note
that CI will run them:

- The `firefox` project, when Firefox will not launch on this machine.
- The phone projects, when text must fit a phone's width. CI's Linux fonts draw Germania One wider
  than macOS does at phone sizes, so a line with little room to spare passes on a Mac and wraps on
  CI.

A failure in a test the change cannot reach may be a flake. Run it again on its own first, since
another session's browser run can slow this one. Then check it on `development` in a throwaway
worktree inside yours, so it stays writable: `git -C <worktree> worktree add --detach
<worktree>/.claude/worktrees/base origin/development`, then `npm ci` in its `frontend/`. Run the
test with `--repeat-each=20` on both trees. A flake on `development` is not fixed here: offer an
issue for it in the report. One the change makes more frequent is the change's to fix. Never commit
the throwaway, and remove it afterwards with `git -C <worktree> worktree remove --force
<worktree>/.claude/worktrees/base`.

Then rename the shots' prefix to `after-` in `pr-shots.spec.ts`, run it again the same way, and
delete the spec.

## 6. Docs

Update `CLAUDE.md`, `README.md`, `DEVELOPMENT.md` and anything under `docs/` the change makes
stale. Tick a `docs/PLAN.md` box only if one names this issue; most single issues have none.

## 7. Review

Run the `code-review` skill against `origin/development`, with issue #N as the spec. Fix every
finding, Minor ones included, or write down why it needs no change. Re-run the tests the fixes
touch.

## 8. Commit, push, open the PR

Conventional Commits as `CLAUDE.md` describes: each test with the code it tests, docs in their own
commits. Commit the screenshots, push (`git push -u origin <branch>`, or `--force-with-lease` for a
continued branch you rebased), and link each image by
`https://raw.githubusercontent.com/jussaw/Secret-Hitler-Online/<sha>/docs/pr/<branch>/<file>`, where
`<sha>` is the head commit you pushed.

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

- Watch the checks yourself, in one background command: `gh pr checks <PR> --repo … --watch
  --interval 30`. If it ends at once with no checks reported, the run has not started yet (start
  the watch again in a minute) or the PR conflicts (next point).
- Whenever the watch ends, and again just before any merge, read `gh pr view <PR> --repo … --json
  mergeable,mergeStateStatus,headRefOid`. GitHub runs no checks on a PR that conflicts with its
  base, so a conflicting PR never turns green or red by itself.
  - `mergeStateStatus` is `BLOCKED` on every PR here, since the review the ruleset asks for never
    comes. That is expected.
  - `mergeable` is `UNKNOWN` for a few seconds after a push: read it again.
  - `CONFLICTING` (state `DIRTY`): rebase, as in the next point.
- To rebase: `git fetch origin`, `git rebase origin/development`, keep both sides' changes, re-run
  the tests the conflicting files touch, then `git push --force-with-lease`. The old commits leave
  the branch, so point the screenshot links at the new head: save `gh pr view <PR> --repo … --json
  body -q .body` to a scratchpad file, swap the old SHA for the new one, and `gh pr edit <PR>
  --repo … --body-file <file>`. Then watch again.
- A check fails: read `gh run view <run> --repo … --log-failed`. For a failed `e2e`,
  `gh run download <run> --repo … -n playwright-report -D <scratchpad>/ci-<run>` fetches its
  report and traces; CI retries a failed browser test once, so a red `e2e` has failed twice.
  - The change caused it: fix it, push, and watch again.
  - A flake the change cannot reach, checked as in step 5: once the whole run has finished
    (GitHub reruns nothing while a run is going), rerun its failed jobs once with
    `gh run rerun <run> --repo … --failed`, and offer an issue for the flake in the report. If it
    fails again, stop and report both runs.
  - Never merge on a red check.
- Every check passes (`image` skips on PRs) and the PR does not conflict: squash it into one
  commit on `development` with
  `gh pr merge <PR> --repo … --squash --admin --match-head-commit <headRefOid>`, the head whose
  checks passed. Never merge with a merge commit or a rebase. `--admin` gets past the review the `development` ruleset asks for, and past its
  required checks too, so the green checks are yours to confirm, and `--match-head-commit` refuses
  the merge if anything newer was pushed. Auto-merge is off on this repo.
  - The issue is labelled `bug`: merge it now.
  - Any other issue: go to step 10, which asks the user whether to merge. On their yes in chat,
    read `gh pr checks <PR> --repo …` and the fields above again, since `development` may have
    moved in the meantime, then merge. A yes covers that PR only.
- After a merge, watch the push run on `development`. Its commit is `gh pr view <PR> --repo …
  --json mergeCommit -q .mergeCommit.oid`. Find the run with `gh run list --repo … --workflow CI
  --commit <full sha>` (it can take a few seconds to appear), then `gh run watch <run> --repo …
  --interval 30 --exit-status`.
  - `image` runs only once `test` and `e2e` pass, so a flake there is rerun as above.
  - A run that ends `cancelled` was replaced: one push run waits at a time, and a newer merge's
    run cancels the one waiting. Watch the newest push run on `development` instead, since it
    holds your merge.
  - Confirm the tags with
    `gh api "/users/jussaw/packages/container/secret-hitler-online/versions?per_page=3"`: the
    version tagged `latest` carries `sha-<short>` of your merge, or of the later merge whose run
    replaced yours. Check that the issue closed.

## 10. Report

The PR link and its green checks. For a merged bug, its squashed commit on `development` and the
image tag. For any other issue, the question whether to merge it; after the user's yes and the
merge, report the squashed commit and the image tag the same way. Then what changed, the decisions you made, anything not run
locally, and any issue you offer to write up with `/write-issue`. Boxes that need a person, such as
playing on the deployed build, stay for the user.

## Needs design

Build nothing. Use `brainstorming` to settle the open questions with the user and write the spec
under `docs/superpowers/specs/`, then use `writing-plans` for the plan under
`docs/superpowers/plans/` and a new phase in `docs/PLAN.md`, each once the user approves it. Commit
them on a phase branch (`phase-<n>-<topic>`, in a worktree of the same name, made as in step 2) and
push, leaving nothing uncommitted there: step 2 makes a session stop at a worktree with changes.
End with one paste-ready prompt for a new session: the docs to read, the branch and the worktree
that holds it (the new session enters that worktree as step 2 does, since a branch is checked out
in one worktree at a time), the execution skill, the Java 17 setup, when to stop and ask, and what
done looks like.
