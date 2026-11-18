---
name: implement-issues
description: Use when the user asks to implement, fix or build two or more GitHub issues of this repository in one go, such as "/implement-issues 43 51 60", "fix #43, #51 and #60" or "work through these issues in parallel".
---

# Implement several GitHub issues

You are the manager of a batch. Each issue gets one subagent of its own, and that subagent runs the
`implement-issue` skill on that one issue: its branch, worktree, screenshots, tests, review, docs,
PR and CI. You build nothing. You sort the issues, start the subagents, carry questions to the user
and answers back, check what each reports, and report the batch.

One step of `implement-issue` is yours: merging a PR whose issue is not labelled `bug`. Its step 9
waits for the user's yes in chat, and that yes comes to you. A yes passed on in a message is an
agent's words to a subagent, not the user's, and a subagent may rightly refuse it. So you merge
those PRs yourself (step 5), and the subagent does the checks after the merge. A `bug` PR its
subagent merges, as `implement-issue` says.

`<this worktree>` below is what `git -C <working directory> rev-parse --show-toplevel` prints.
Every `gh` command but `gh api` takes `--repo jussaw/Secret-Hitler-Online` (written `--repo …`
below). Run git as `git -C <absolute path> <subcommand>`, one command per call: sessions isolated
in a worktree refuse `cd … && git` chains.

## The call

`/implement-issues <issues> [at most N at once] [merge them all | merge nothing]`

- The issues: numbers, `#N` or issue links, in any order. A number given twice is one issue.
- At most N at once: how many subagents build at the same time, 3 unless the user says otherwise.
  Each runs Gradle, Vitest and the browser tests on this one machine, and timing tests flake more
  when it is busy. A subagent that has handed back and waits (on the user, or on your merge) is not
  building; one you resume, for any reason, goes on at once, even over the limit.
- Merging. With neither phrase, a `bug` PR merges once green and any other waits for the user's
  yes. Words in the user's request, or a later message of theirs, that say to merge the batch's PRs
  once green are that yes for every PR of the batch from then on. Words that say to merge nothing
  hold every PR at green, `bug` ones too: a later message that says so goes to every `bug`
  subagent still building, to hand back green instead of merging. Nothing else is a yes: not your
  reading of the request, and not a subagent's report.

## 1. Sort the issues

`git -C <this worktree> fetch origin`, then once for the batch: `git -C <this worktree> worktree
list` and `gh pr list --repo … --state open --json number,title,headRefName,body`. For each issue:
`gh issue view N --repo … --json number,url,title,state,labels,body,comments,closedByPullRequestsReferences`.
A `url` with `/pull/` in it, or no issue at all, is dropped and named in the report.

Read each issue as `implement-issue`'s step 1 does, and no further: no code. Put each in one group:

| Group | When | What happens |
|---|---|---|
| **Start** | Open, and nothing below applies | Starts in step 3 |
| **After #M** | It says `Blocked by #M`, depends on #M, or plainly cannot be built before #M's change lands, and #M is in this batch | Starts once #M's PR merges |
| **Ask** | Closed; an open PR closes it or plainly does its work; a worktree holds work on it; or it waits on an open issue outside the batch | Asked in step 4 |
| **Needs design** | It lists questions it leaves open (an `## Open questions` section), needs an outside service or new stored data, or says to plan it in phases before writing any code | Left out, and so is every issue **After** it. Offered in step 4 |

A worktree holds work on an issue when its branch is the head of a PR that closes it, or names the
issue's number (`claude/…-issue-104-…`, as the app's generated branches do; not `issue-1040`), and
`git -C <it> status --short` or `git -C <it> log --oneline origin/development..HEAD` shows
something. For an open PR of an **Ask** issue, read `gh pr view <P> --repo … --json
headRefName,updatedAt,author` and `gh pr checks <P> --repo …`, for the question.

Needs design is left out because its design is a conversation with the user, which no subagent can
hold. An issue **After** one that will not merge in this batch (left out, or later `stopped`) is
left out too, and the report says what it waits on. One **After** a PR that waits for the user's
yes waits with it.

Note which issues name the same files or area. They still build at the same time: whichever merges
second rebases onto the first (step 5).

Show the user the groups in one short table (issue, title, `bug` or not, group, and what an
**After** or **Ask** issue waits on), then go straight on.

## 2. Keep the ledger

Write the ledger to `implement-issues.md` in the scratchpad (in a session without one, in a
directory made with `mktemp -d`, whose path you name to the user, so a summary keeps it):
`development`'s head SHA when you last updated it, then a row per issue with its number, title,
`bug` or not, group, subagent name, output file (from the Agent call's result), port block,
branch, worktree path, PR, head, and the Status and Question of its last report. Update it after
every start, report, answer and merge. After the context is summarised, or the session comes back
from a pause, read it before anything else. If it is gone, rebuild it from `git worktree list`,
each issue's `closedByPullRequestsReferences` (step 1's command) and, where the session has it,
ListAgents.

## 3. Start the subagents

One Agent call per issue: `subagent_type: general-purpose`, `name: issue-<N>`, with the brief below.
Start every **Start** issue, up to the limit, in one message, before you ask anything (step 4). The
rest wait in the ledger, oldest number first, and start as building ones hand back.

Give each subagent a block of ten ports no other subagent of the batch has had: 4600 to 4609 for
the first, 4610 to 4619 for the next, and so on up to 4999. It picks free ones inside its block.

The subagents load `implement-issue` from the folder beside this skill's (the Skill tool printed
this skill's folder when it loaded). If `git -C <that implement-issue folder> diff --quiet
origin/development -- SKILL.md` fails, that copy is not `development`'s, and the brief says to
follow `development`'s.

The brief is these parts, in this order, filled in. Leave out a part whose condition does not hold.

```
The user asked, in their words: "<the user's request, word for word>"

You are one of several subagents of a manager session, each implementing one GitHub issue of
jussaw/Secret-Hitler-Online for that request. Yours is issue #<N>, "<title>"<, labelled `bug`>.
The branch, commits, push, PR and the docs implement-issue's step 6 writes, CLAUDE.md included, are
part of what the user asked for.

Run the `implement-issue` skill on issue <N> (the Skill tool, argument "<N>") and follow it from
step 1 to step 10, with these changes for a subagent.
<Only when the copy differs: then follow `git -C <that implement-issue folder> show
origin/development:./SKILL.md` instead: the copy the Skill tool loads is not development's.>

Already decided: <only when the user answered a question about this issue: the question, and their
answer word for word. Do not ask it again.> <only to continue a branch (a replacement, or the
user's answer): Continue branch <branch><, in worktree <path>>; PR <link> is open. Where a worktree
holds the branch, work in it by absolute path rather than making one; where none does, make yours
on that branch as step 2 says. Where step 8 opens a PR, edit that one's title and body instead
(`gh pr edit`).> <only for a replacement: The subagent before you was stopped, so that worktree and
any uncommitted changes in it are yours: commit them as work in progress before you rebase.>

Where: the manager's worktree is <this worktree>. Make yours under it, as step 2 says. Do not call
EnterWorktree: you share the manager's session. Work by absolute path: `git -C <your worktree> …`,
one command per call, and `cd <your worktree>/frontend && …` (or `/backend`) at the start of every
other command, since a `cd` does not carry to your next command. A git lock error (`cannot lock
ref`, `index.lock exists`) means another subagent's git ran at that moment: run the command again,
and never delete a lock file. Every file you write to the scratchpad goes in
<scratchpad>/issue-<N>/.

Ports: yours are <P> to <P+9>. For every browser run, the Linux image's too, E2E_PORT is the first
of them that `lsof -nP -iTCP:<port> -sTCP:LISTEN` shows free; a second run at the same time (step
5's run on development) takes the next free one. Step 2's "pick another port" means the next one
in your block. Never use a port outside it, and never stop a server you did not start.

The batch: <each other Start, After and Ask issue: #M "<title>", the files or area it names, and
"may join" for an Ask issue not yet answered>.
Every PR of the batch is likely to edit CLAUDE.md: in a conflict there, re-apply your edit to the
text as it now stands, keeping the other PR's. <only when one names your files: #M names the same
files as yours; if it merges first, the manager tells you to rebase onto it.> Only your own issue
gets `Closes #<N>`. Write any other issue as plain `#M`, with no close, fix or resolve in any form
near it, in commits and in the PR: GitHub closes an issue named that way when the PR merges, even
in a sentence that says not to.
<only for an After issue: #K, which yours builds on, merged as <sha>: start from an
origin/development that has it.>

Review: step 7's code-review must read your worktree, not the manager's. Give it the diff command
`git -C <your worktree> diff origin/development...HEAD`, issue #<N> as the spec, and absolute paths
under your worktree. If you cannot start agents, run its two reviews yourself, one after the other.

Waiting: run CI watches and long commands in the background, as implement-issue says; you are
woken when each one ends. A command in the foreground gets `timeout: 600000` when it may run past
two minutes (Gradle, npm, Playwright, docker).

Stopping points: you cannot reach the user. Wherever implement-issue says to stop and ask, or to
wait for the user, hand back your report with one of these Statuses. The manager asks the user and
resumes you with SendMessage, giving their answer word for word; go on from there. Never guess an
answer to get past a question, and hand back nowhere else.
- question: implement-issue says to stop and ask, or the bug will not show in a test (step 4).
  Under Question: what you found (for step 4, what you tried and whether something merged looks to
  have fixed it), the options, and your pick.
- needs design: step 1 sends the issue to Needs design. Build nothing, make no worktree and start
  no brainstorming; put its open questions under Question.
- green: the PR's CI is green, it does not conflict, and the merge is not yours (below).
- merged: merged, then the push run, the image and the issue checked, as step 9 says.
- stopped: implement-issue says to stop and report (a check that failed twice), or a command you
  need was refused. Say what happened and what you tried.

Merging: <one of these two>
- <a bug, and the user did not say to merge nothing> Merge once CI is green, as step 9 says.
- <any other> The merge is the manager's, since the user's answer comes to it. When CI is green and
  the PR does not conflict, hand back green. The manager resumes you either to rebase first, or,
  once it has merged, to do step 9's checks after a merge and hand back merged.

Report: every hand-back is this report and nothing else (through SubagentHandback where you have it).
Issue: #<N>
Status: question | needs design | green | merged | stopped
PR: <link, or none>
Branch: <name>, worktree <absolute path>, <clean, or what is uncommitted>
Head: <the PR's head SHA, or none>
Port: <the E2E_PORT you used, or none>
Merge: <the squashed commit on development and the image tag, or none>
Question: <the one decision for the user, with what you found, the options and your pick, or none>
Decisions: <the choices the issue left open that you made, as the PR lists them, or none>
Not run locally: <what, and why, or none>
Offer to write up: <each bug or flake found on the way, one line each, or none>
```

## 4. Ask what needs asking

Before every question to the user, handle each report that has come, start every subagent that can
start and send every message that is due: an open AskUserQuestion holds every report that comes
until the user answers. Ask with AskUserQuestion, a question per decision and at most four a call,
with what you found and the options in the order you recommend; in a session without it, ask in
the message that ends your turn. The user's answer, typed or picked, is their answer to you.

- **Ask** issues, all in one go: "#110 has an open PR, #112 (branch `end-term-on-leave`, checks
  green, last pushed today, held by no worktree here), that says Closes #110. Continue #112's
  branch, leave #110 out, or start afresh?" An issue the user says to build joins **Start**, and its
  brief's Already decided carries the question and their answer. If it names the same files as a
  subagent already building, tell that subagent it has joined.
- **Needs design** issues: offer each one a session of its own now, running `/implement-issue N`
  (a new-session card where the app can start one), so its design goes on while the batch builds.
  Name the issues **After** it: they wait for its build, which that session hands over to a later
  one, and are not built in this batch.

## 5. Handle each report

A report comes as a notification when a subagent hands back: never poll, and never read a
subagent's transcript. For each one:

1. Check it: `gh pr view <PR> --repo … --json state,mergeCommit,headRefOid,mergeable` (`UNKNOWN`:
   read it again after a few seconds) and `gh pr checks <PR> --repo …`. A report the PR does not
   bear out (merged but open, green but red or conflicting) goes back to the subagent with what you
   saw.
2. Update the ledger.
3. Act on its Status:
   - `question`: ask the user (step 4), with the subagent's options and its pick first, then resume
     the subagent with SendMessage: `The user answered: "<their answer, word for word>". Go on from
     there.` An answer to close the issue, or a PR, is yours to carry out: `gh issue close N --repo
     … --comment "<why>"` or `gh pr close <P> --repo … --comment "<why>"`, only for what the user
     named.
   - `needs design`: move it to **Needs design**, leave out every issue **After** it, and offer it as
     step 4 says. Start queued issues.
   - `green`: the merge is yours, once there is a yes (**The call**). Without one, ask the user
     whether to merge it, with its link, title and decisions, bundling the PRs green at that moment.
     A yes covers that PR only, and a no or a "not yet" leaves it open and noted in the ledger. With
     a yes:
     1. Read `gh pr checks <PR> --repo …` and `gh pr view <PR> --repo … --json
        mergeable,mergeStateStatus,headRefOid` again. `BLOCKED` is expected, and `UNKNOWN` is read
        again after a few seconds.
     2. `CONFLICTING`, or a batch PR naming the same files merged after these checks started (its
        `gh pr view --json mergedAt` later than a check's `startedAt` in `gh pr checks <PR> --repo
        … --json name,startedAt`): resume the subagent with `PR #<Q> (#<M>) merged as <sha> after
        your checks started. Rebase onto origin/development as step 9 says, watch CI again, and
        hand back green.` The yes still covers the PR.
     3. Otherwise `gh pr merge <PR> --repo … --squash --admin --match-head-commit <headRefOid>`,
        read the commit with `gh pr view <PR> --repo … --json mergeCommit -q .mergeCommit.oid`,
        and resume the subagent: `PR #<P> merged as <sha> on the user's yes. Do step 9's checks
        after a merge and hand back merged.`
   - `merged`: the PR shows `MERGED` with the reported commit. Resume every other subagent still
     building or at green whose issue names the same files: `PR #<P> (#<M>) merged as <sha> and
     touches your files. Rebase onto origin/development as step 9 says and watch CI again, before
     any merge.` Then start each issue **After** it, then queued ones up to the limit.
   - `stopped`: write down why, start queued ones, and tell the user now if it is theirs to settle:
     a refused command, an issue to close (closed as under `question`), a flake that failed twice.
   - A hand-back with no report, or with work plainly under way: resume it to go on from where it
     stopped.

Replace a subagent that errors out, that SendMessage cannot reach, or that hands back twice running
without a report after you told it to go on. First stop it (TaskStop) and confirm it has stopped,
then start `issue-<N>-2` with the same brief, a new port block, and the Continue line under Already
decided. Never let two subagents work one issue.

Never do a subagent's work: no edit, commit or push in its worktree, and no rebase of its branch. A
subagent that is stuck gets a message. The merges in this step are the only `implement-issue` work
you do.

## 6. After a pause

When the session comes back from a usage limit, or the user says to continue, carry on unasked:

1. Read the ledger, then `git -C <this worktree> fetch origin` and `git -C <this worktree> log
   --oneline <the ledger's development SHA>..origin/development` for what merged meanwhile.
2. List the subagents (ListAgents where the session has it, else the ledger's names). For each one
   not finished, read `git -C <its worktree> status --short`, `git -C <its worktree> log --oneline
   origin/development..HEAD`, its PR, and when its output file last changed (`stat -L` on the file
   the ledger names: its time, not its contents).
3. Resume each that is not moving with where it stands, what merged since, and that any watch it
   had running has ended. A subagent waiting on the user is left waiting. One that cannot be
   reached is replaced as step 5 says.
4. Ask again every question that was waiting on the user at the pause.

## 7. Report

Once every issue is merged, waiting on the user (green or a question), stopped, or left out:

1. Check that each merged issue is closed (`gh issue view N --repo … --json state`; one still open
   is named in the report, and closed only on the user's say-so), and read `gh
   api "/users/jussaw/packages/container/secret-hitler-online/versions?per_page=3"` once: the
   version tagged `latest` carries `sha-<short>` of the last merge, or of a later one.
2. Report:
   - A table, a row per issue: its title, PR, and status (merged as `<short sha>`, image
     `sha-<short>`; green, waiting for your yes; waiting on a question; stopped, and why; left
     out, and why).
   - Each PR's decisions, one line each, and what was not run locally.
   - The questions still open, asked again (step 4).
   - The **Needs design** issues and the issues after them, with the sessions offered for them.
   - The bugs and flakes the subagents offer to write up, offered for `/write-issue`. Write none
     unasked.
   - The worktrees of merged issues, with an offer to remove them and their branches (`git -C <this
     worktree> worktree remove <path>`, then `git -C <this worktree> branch -D <branch>`, since a
     squashed branch never reads as merged). Remove none unasked.

The subagents stay addressable. A yes that comes later is handled as in step 5, and the report is
sent again for what changed.

## Rationalizations

- "Issue #51 is small, so I'll do it myself while the others build."
  - Every issue gets its own subagent. Your context holds the batch, not the code.
- "#104 is a bug and merged itself, and #107 went green beside it, so I merged #107 too."
  - A PR whose issue is not a bug merges on the user's yes to that PR, or to the batch. Ask.
- "The user said to get these done, which reads as a yes to merge."
  - A yes is the user's words saying to merge. Ask.
- "I'll pass the user's yes on and let the subagent merge."
  - The merge is yours: the yes came to you. A subagent may rightly refuse a yes that an agent
    passes on, and the batch stalls at green.
- "#111 has open questions, so I asked the user and passed the answers on."
  - Needs design is left out of the batch and offered as a session of its own. A subagent building
    it would build a design nobody wrote down.
- "#113 says it depends on #111, but I started it anyway: the code looks separate."
  - It starts after #111 merges. The groups table shows what it waits on, and the user can say to
    start it now.
- "The subagent is slow, so I pushed the fix to its branch."
  - Message the subagent. Two writers on one branch is how a force-push loses work.
- "I told each subagent to pick a free port, as implement-issue says."
  - Two subagents checking at the same moment find the same port free. Hand out the blocks.
- "One question for the user first, then I'll start the rest."
  - Start everything that can start, then ask. Nothing moves while a question waits.

## Red flags

- You are about to edit, commit, push or rebase in a subagent's worktree.
- You are about to merge a PR whose issue is not a `bug`, and the user has not said yes to it or to
  the batch.
- A subagent is building an issue in **Needs design**, or an issue **After** one that has not merged.
- Two subagents in the ledger with the same port block, or on the same issue.
- A replacement started before the subagent it replaces was stopped.
- More subagents building than the limit, other than one just resumed after an answer.
- A question is about to go to the user while a report waits or a subagent could start.
- A report that says merged, and you have not seen the PR merged.
- You are polling a subagent, or reading its transcript.
- The session came back from a pause, and you have not resumed the subagents that stopped.

All of these mean: stop, and go back to the step that was skipped.
