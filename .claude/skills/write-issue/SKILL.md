---
name: write-issue
description: Use when the user asks to write, file, open or draft a GitHub issue for this repository, such as "/write-issue …", "file an issue for …" or "open an issue for the bug we just found".
---

# Write a GitHub issue

`/write-issue <what you saw or want>` turns a few words into issues written like the repo's
others. One call can carry several things, and each becomes its own issue. The format is in
`formats.md`, next to this file: `## Rules for every issue`, then one skeleton per kind of issue.

Every `gh` command takes `--repo jussaw/Secret-Hitler-Online` (written `--repo …` below). Run
git as `git -C <absolute path> <subcommand>`, one command per call: sessions isolated in a
worktree refuse `cd … && git` chains.

## The two rules

The issues are public, and `implement-issue` builds an issue as written. Violating the letter of
these rules is violating their spirit.

**No `gh issue create` for a draft the user has not seen and OK'd in this conversation.**
- Not when the user said "just post it" or "post straight away", or is away. Those words came
  before any draft existed. Show the draft and wait.
- Not for a draft you changed after the OK. Show it again and wait again.
- An OK for one draft of a batch posts that draft only.
- No draft for a thing that reached **Nothing to file** until the user answers its question, in
  the request or after it.

**No bug is drafted without a run in the throwaway checkout that tried to show it.**
- Not when the code looks right. Code that looks right is why you run it.
- Not when the user is in a hurry.
- Not when it was seen on the home server. The host runs the image CI builds from `development`,
  so the same code runs here.
- A probe that failed in its own setup never ran its check. Fix it and run it again.
- "Reproduced" is written only after a run that showed the bug, with that run's command and
  result. Anything else is "Not reproduced".

## 1. Split and search

**Ask first.** A request that says nothing to look for (no behaviour seen, nothing expected,
nothing to change: "the lobby feels off on my phone") gets one question about what the user saw,
in one sentence, such as "What did you see?" Nothing else: no list of options, no second question
about the device. Ask it before any search or checkout, then stop until they answer.

Split the request into one issue per thing. For each, search open and closed issues two or three
times, with different words: `gh issue list --repo … --state all --search "<words>" --json
number,title,state,labels`.

- An open issue asks for the same thing or reports the same bug: point at it (number, title, what
  it covers) and stop for that thing. No draft, no checkout. Do not offer to comment on it.
- A closed one: link it as related in the draft ("this may be #41 again").

## 2. Check out `development`

One throwaway checkout for the whole run, so the session's own changes never colour a repro or a
line number. Its parent is the session's own worktree when the session runs inside
`.claude/worktrees/` (the path `git -C <working directory> rev-parse --show-toplevel` prints), else
the main checkout (the first line of `git worktree list`).

1. `git -C <parent> fetch origin`
2. `git -C <parent> worktree add --detach <parent>/.claude/worktrees/issue-draft origin/development`
   If `issue-draft` exists already, it is most likely from a run that ended before its clean-up.
   Check whether anything holds it: a `locked` entry in `git -C <parent> worktree list`, or a
   running process with files open there (`lsof +D <parent>/.claude/worktrees/issue-draft`).
   Nothing does: remove it as in step 6 and add it again. Something does: ask before touching it.
3. `git -C <parent>/.claude/worktrees/issue-draft rev-parse --short HEAD`: the commit every draft
   names. Write down what it prints.

**Two or more issues left after the search?** Steps 3 to 5 run as **A batch** (below): one
subagent per issue, one after another. Steps 3 to 5 here are for one issue.

## 3. Read the code

In the checkout, read until the mechanism is plain: what runs, where (`path:line`), and why it goes
wrong or what would change. An enhancement the code already does: go to **Nothing to file**. A bug
always goes on to step 4.

## 4. Reproduce a bug

The smallest run that reaches the bug, in the checkout. Its tests are throwaway: never committed,
and deleted in step 6.

- Backend: a throwaway test class in `backend/src/test/java/`, run with Java 17 (`ls
  ~/.sdkman/candidates/java`, then `JAVA_HOME=<that 17.x>`): `./gradlew test --tests <Class>` from
  `<checkout>/backend`. The Gradle wrapper fails on newer JDKs.
- Frontend: `npm ci` once in `<checkout>/frontend`, then a throwaway test beside the file, run with
  `npx vitest run <file>`; or a throwaway `e2e/repro.spec.ts`, run with `npx playwright test
  e2e/repro.spec.ts --project=<project>` and Java 17 active. It builds and serves on port 4545, so
  one browser run at a time.

Write down what happened in plain numbers, as #63 does ("Ann's next lobby packet listed
`["Ann","  "]`"), with the command. Then take the first of these that fits:

1. The user saw it only on a device or browser no tool here runs (a real iPhone or iPad, iOS
   Safari, a phone's own browser; Playwright's phone projects emulate Chromium). The home server
   is not one: it runs the image CI builds from `development`. No run here reaches such a bug,
   whatever a mock or another browser shows, so it never goes to **Nothing to file**. Run what
   can be run here (the code path in Vitest, the page in Playwright), then draft it as not
   reproduced. The draft says so, why, and what was tried: "Not reproduced: it needs <device>.
   Tried: <command>, <what it showed>."
2. The run showed the bug: draft it with "Reproduced on `development` (<commit>) with
   `<command>`: <what happened>." as the reproduced fact of its provenance.
3. The run reached the bug's conditions and it did not show: go to **Nothing to file**.

## Nothing to file

An enhancement the code already does, or a bug that did not show in a run that reached it (case 3
of step 4; never a device-only bug). Report what you found, with `path:line` references at the
commit and the run's command and result, and ask whether to file it anyway (a bug as not
reproduced). Draft nothing for it until the user answers. The other issues of a batch carry on.

The user's words may answer it already ("if you can't reproduce it, file it anyway as not
reproduced"). That is their answer: do not ask again. Draft the bug as not reproduced, with "Not
reproduced on `development` (<commit>). Tried: <command>, <what it showed>." as its provenance,
and show it. That answer is about drafting only: posting still waits for an OK on the draft the
user has seen.

An answer that comes after the clean-up (step 6) needs no new checkout: the draft takes its
`path:line` references from the finding and its commit from what step 2 wrote down.

## 5. Draft

Pick the skeleton in `formats.md`: `## 1. Bug found by reading the code`, `## 2. Bug seen in play or
in CI` (the user or CI saw it), `## 3. Enhancement` (one pull request), `## 4. Large enhancement`
(several parts, or more than one session). Fill every REQUIRED slot in order, and add no section it
does not have (no Problem, Acceptance or Done when). Write the body to a file in the session's
scratchpad directory, never in the repo or `/tmp`. A session with no scratchpad makes a fresh
directory with `mktemp -d` and writes it there.

Then check the draft, line by line:

- [ ] `## Rules for every issue` in `formats.md`: the title (its areas in the order the rule
  gives), the one label (`bug` or `enhancement`), backticks, upstream issues in backticks.
- [ ] The commit is what `rev-parse --short HEAD` printed in step 2. A placeholder (`<sha>`,
  `<commit>`, "not recorded") is a failure: go back and run the command.
- [ ] A bug's provenance is its first sentences (the first of `## Description` in skeleton 2):
  where it was found or seen, then the sentence step 4 or **Nothing to file** gives, "Reproduced
  on …" or "Not reproduced …" with its "Tried: <command>, <what it showed>.", then the commit.
- [ ] "Reproduced" only beside a run that showed the bug.
- [ ] Only what the repo, its issues, your runs and the user's own words show. Nothing from memory
  notes or other private context, and never a memory note's name. No guess at the host's setup.
  Nothing about the user that they did not say: "seen twice on the home server", not "reported by
  the repo owner".
- [ ] No infrastructure, even when the user's words carry it: none of the list under Constraints
  in `CLAUDE.md` (machine and host names, hardware, deploy and update tools, LAN addresses, ports,
  host paths, domains, the proxy, tunnel and monitoring setup). Write "the home server" or "the
  host".
- [ ] `## Open questions` holds only product or design choices the user has not made, each a plain
  question, and no line of Want:, Notes: or Scope answers one or leans on an answer. That section
  sends the issue to design: `implement-issue` builds nothing for an issue with open questions.
- [ ] A fact nobody knows yet (how long the count stayed up, which page showed it) is not a
  choice. It goes in the body as "Unknown: …", in `## Description` or under `## Reproduction` (an
  unknown about the device goes in `## Device Info`), never under `## Open questions`.
- [ ] A choice the user settled in chat is written in as decided (under `## Decided` in skeleton
  4, or in Want: or Notes:), and its question is gone.

## 6. Clean up

Before you show anything, since a wait for the user can last hours: delete the throwaway tests,
`git -C <parent> worktree remove --force <parent>/.claude/worktrees/issue-draft`, then `rmdir
<parent>/.claude/worktrees` if it is empty. Check `git -C <parent> worktree list` and `git -C
<parent> status --short`. An edit that needs the code again gets a new checkout at the same commit.

## 7. Show and post

In one message: each draft's title, label and body in full, as it will post, and each Nothing to
file finding with its question. Ask which drafts to post. Then wait.

- An edit: make it, show that draft again, and wait for its OK.
- An answer to one of a draft's open questions is an edit: write the answer in as decided, remove
  that question, show the draft again, and wait for its OK.
- An OK: `gh issue create --repo … --title "<title>" --label <bug|enhancement> --body-file <file>`
  for each OK'd draft, and only those. Give the links.

## A batch

Two or more issues are dispatched, one subagent per issue (the Agent tool), so each draft comes
from its own reading and your context holds only the drafts. This is not optional. Search (step 1)
and check out (step 2) first; then read no code for any of them yourself. Start the next subagent
only when the last has come back, never two at once (one Gradle build and one port 4545 at a
time). Give each one its issue in the user's words, the checkout's path, the commit, the
scratchpad file for its draft, and steps 3 to 5 of this skill with **The two rules** and **Nothing
to file**. It brings back its draft or its Nothing to file finding, with the commands it ran and
their results. It makes no checkout, posts nothing and removes nothing. You clean up, show all of
them together and post.

If you cannot dispatch subagents, take the issues one after another yourself. That is only for a
session with no Agent tool: steps 3 to 5 for the first issue, to its draft or its Nothing to file
finding, then steps 3 to 5 for the next. Say in your message to the user which way the batch ran.

## Out of scope

- Fixing anything. That is `implement-issue`.
- Screenshots, annotated shots or mockups, unless the user asks for them in the call.
- Editing, commenting on or closing an existing issue. Point at it; the user can add to it.

## Rationalizations

The excuses come from this skill's tests and its review: a subject's own words, a draft it
wrote, or a case the review found. The line under each is the answer.

- "The user said "just post it" and is leaving, so I would post the issue straight away."
  - That was said before any draft existed. Show it and wait. A wrong public issue costs more than a
    late one.
- "Posted, so it's in the tracker while you're out."
  - Nothing is posted until the user OKs the draft they saw.
- "I read the code only to look for a lead. I did not find a cause and did not try to reproduce the
  bug."
  - Reading is step 3. Step 4 is the run. No run, no bug draft.
- "The code looks right on a clean close, so the issue lists what is unknown."
  - Then run it. The run decides whether there is anything to file.
- A draft that lists "whether it reproduces on a local build of `development`" as unknown.
  - Finding that out is your job, not the issue's. Run it.
- "That is a scaffolding failure, not evidence of the bug, so I did not chase it."
  - That probe never ran its check. Fix it and run it again.
- "I'd first ask the user two questions", then a full draft for a bug that did not show.
  - A bug that did not show gets no draft. Report, ask whether to file it as not reproduced, and
    wait.
- "Something in front of it keeps the connection open" / "the proxy in front of it".
  - The host's setup is private, and no run showed it. It stays out of the draft. Say it to the user
    in chat if it helps.
- "Only the lobby gets this, not a running game." / "this issue leaves them out" / "The simplest
  answer is yes".
  - Each is a choice the user has not made. Ask it plainly under `## Open questions`, and nothing
    else in the body answers it.
- A draft whose `## Open questions` asks "Does the count stay up for good, or does it drop after
  about 30 s?"
  - That is a fact nobody knows yet, not a choice. Write it as "Unknown: …" in the body. Under
    `## Open questions` it would send a bug to design, and it would never be built.
- The user answered an open question in chat, so the draft just drops the question.
  - The answer is lost that way. Write it in as decided (`## Decided`, or Want: or Notes:), and keep
    as questions only the choices still unmade.
- "Do you want me to … add a comment to it"
  - Out of scope. Point at the open issue and stop.
- "I ran the two things myself, one after another, rather than through subagents (the skill allows
  dispatching them; I did not)."
  - A batch is dispatched, one subagent per issue. Doing them yourself is only for a session with no
    Agent tool.
- "Neither is filed, because the code at `development` already does what each one asks." (for a bug
  seen only on an iPhone, once a mock passed)
  - "Already does it" is for enhancements. A bug seen only on a device is drafted as not reproduced,
    and the passing mock is what was tried.
- "Your note on this says to file it anyway as not reproduced. Do you want me to file it that way?"
  - The user answered before you asked. Draft it as not reproduced and show it. Only the posting
    waits.

## Red flags

- You are about to run `gh issue create` and the user has not OK'd this draft in this
  conversation.
- You wrote "Posted" or "posting now" before an OK.
- A bug draft, and no test command and result in your notes.
- A probe failed before its check, and you moved on.
- "Reproduced" with no run's output beside it.
- `<sha>` or any placeholder in a draft.
- A draft names a host, a proxy, a memory note, or anything only your context told you.
- A line in Want:, Notes: or Scope answers a question under `## Open questions`.
- A question for the reporter, or a fact nobody knows yet, under `## Open questions`.
- The user answered a question in chat, and the draft drops it without writing the answer in.
- A draft for something the code already does, or for a bug that did not show, before the user
  answered.
- A bug seen only on a device, and you are asking "file it anyway?" instead of drafting it as not
  reproduced.
- The user already said to file it anyway, and you are asking again instead of showing the draft.
- Two or more issues, and you are reading or running the code yourself instead of dispatching a
  subagent for each.

All of these mean: stop, and go back to the step that was skipped.
