# Phase 25D tuning log

Issue #72, Phase 25D: Hard's amounts (and, only where the plan allows, extra fascist-side rules)
tuned until `./gradlew -q botMatches -Pladder` passes the ladder and balance checks. The plan is
[`docs/superpowers/plans/2026-11-17-phase-25d-ladder-balance.md`](../../superpowers/plans/2026-11-17-phase-25d-ladder-balance.md);
its Decisions 1 to 9 set every rule below. A new session resumes from the last row.

- **A full run** (`./gradlew -q botMatches -Pladder`, 2,000 games a size, 12,000 a pairing) takes
  `d` = about 12 s on the dev machine (11.8 s for run 0, the build up to date).
- **Budgets:** (a) tuning the amounts, at most 10 failing full runs; (b) extra fascist-side rules,
  at most 3 rules and at most 10 more failing full runs.
- **A pass:** `Ladder check: PASS` (all six steps) and `Balance target: PASS` (within 8 points).
  **The acceptance:** the pass and its confirmation pooled (`-Ppool`), `Ladder check: PASS` and
  `Balance check: PASS` (within 10 points).
- **The run rules (Decision 2):**
  - Only failing full runs count toward the budgets.
  - After a pass, one confirmation run on the same code is always allowed; it counts only if it
    fails.
  - Never two full runs on the same code, but for that confirmation and Decision 3's re-run.
  - A failed confirmation or a failed acceptance (one failing full run) needs a code change, with
    its reason here, before the next full run.
  - Every full run is made on committed code, and its row is here, pushed with the code, before
    the next one starts.
  - Exploration runs (`-Pgames=500`, or one pairing) are free and decide nothing; they are noted
    under the table, not in it.
- **Decision 3:** after run 0, both `Easy < Normal` steps clear by at least 1 point (the gap
  between the two pooled intervals): the liberal side by 4.4 points (20.5-22.0% vs 26.4-28.0%), the
  fascist side by 3.1 (67.2-68.9% vs 72.0-73.6%). Tuning starts.
- **Task 1:** 25B's and 25C's hard-rule tests (`ClearedPlayersTest`, `PeekMemoryTest`,
  `ChancellorHandTest`, `CpuPlayerSkillTest`, and `HardBluffTest`, `HardTrackerTest`,
  `HardVoteMemoryTest`, `HardDeckOddsTest`) already read every amount by name, so Task 1 only adds
  `HardAmountsTest.everyRuleStaysOn` with Decision 4's ranges.

Amounts, in each row's order: `VD` `CpuPlayer.VOTE_DROP` (0.1 to 5), `FF` `ChancellorHand.FF_DROP`
(0.1 to 5), `LL` `ChancellorHand.LL_RISE` (0.1 to 5), `PD` `PeekMemory.DROP` (0.1 to 5), `LP`
`CpuPlayer.LIBERAL_TRACKER_PUSH` (0.1 to 0.9), `FP` `CpuPlayer.FASCIST_TRACKER_PULL` (0.1 to 0.9),
`CB` `CpuPlayer.CHANCELLOR_BLUFF_CHANCE` (0.10 to 0.90), `PB` `CpuPlayer.PRESIDENT_BLUFF_CHANCE`
(0.10 to 0.90), `NW` `ClearedPlayers.NOMINATION_WEIGHT` (1.5 to 5). `ClearedPlayers.TRUSTED_SCORE`
(3) and `EASY_MISTAKE_CHANCE` (0.15) never change. The seven rates are each pairing's pooled
liberal win rate (liberals/fascists: E Easy, N Normal, H Hard). Steps: `L`/`F` the side, `E<N`,
`N<H`, `E<H` the step, then its pooled verdict and any sizes inverted. Balance: the points between
all-Hard and all-Normal.

| Run | Kind | Commit | Amounts | E/N | N/N | H/N | N/E | N/H | E/E | H/H | Steps | Balance | Counted | The change that follows, and why |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | before | d4dd765 | VD 0.25 · FF 2.0 · LL 2.0 · PD 2.0 · LP 0.5 · FP 0.5 · CB 0.35 · PB 0.35 · NW 3 | 21.3% | 27.2% | 38.0% | 31.9% | 34.3% | 25.1% | 42.4% | Ladder FAIL: L E<N clears; L N<H clears; L E<H clears; F E<N clears; F N<H inverted (sizes 5, 6, 7, 8, 10); F E<H inverted (sizes 8) | 15.2 (check FAIL, target FAIL) | no (before) | Both bluff chances to their floor, 0.10 (they cost the fascist side about 7 points, 25C's attribution); rule 1's own-nominee change, a code change the user left to 25D: a Hard liberal president always votes yes on the chancellor it nominated (exploration 4: Hard liberals' gain over Normal, near 0 at 8 and 10 seats, becomes 6 to 23 points at every size). |
| 1 | full | 3254dd7 | VD 0.25 · FF 2.0 · LL 2.0 · PD 2.0 · LP 0.5 · FP 0.5 · CB 0.10 · PB 0.10 · NW 3 · rule 1: a president backs its own nominee | 21.0% | 28.2% | 39.7% | 32.0% | 30.1% | 25.7% | 38.7% | Ladder FAIL: L E<N clears; L N<H clears; L E<H clears; F E<N clears; F N<H inverted; F E<H clears | 10.6 (check FAIL, target FAIL) | yes: (a) 1 of 10 | Fails only where extra fascist-side rules can help (Decision 5 (b)): the fascist side's Normal < Hard, and the balance with all-Hard liberals ahead. No amount in range moves the fascist side up (explorations 2 and 3: bluffs at their floor still leave Hard fascists about 2 points behind Normal; the tracker pull changes nothing), so (b) starts: rule 9, special elections to the side (`SIDE_ELECTION_CHANCE` 0.9), and rule 8, fascists vote down liberal governments (`LIBERAL_GOVERNMENT_PULL` 0.9), both before run 2 (exploration 9: rule 8 alone leaves the fascist step at the edge of overlapping). |

## Exploration runs

Free and deciding nothing (Decision 2): what each tried and what it showed.

Each at 2,000 games a size, one pairing at a time, on run 0's code with scratch edits (the bluff
chances set by hand, the rest behind system properties), never committed. Normal liberals against
Normal fascists (N/N) ran 27.2% to 28.2% in these runs.

1. **Run 0's code:** N/N 27.8%, N/H 34.9%, H/N 37.9%, H/H 43.2%.
2. **Both bluff chances at 0.10:** N/H 29.3% and 30.1% (two runs): still about 2 points worse for
   the fascist side than Normal fascists.
3. **And `FASCIST_TRACKER_PULL` at 0.9:** N/H 29.4% and 29.6%: the pull changes nothing.
4. **Rule 1's own-nominee yes** (bluffs 0.10; the scratch edit turned rule 1's own-nominee no
   into a yes, where the commit makes every own-nominee vote a yes): H/N 39.8% (by size 35.1, 65.8, 31.0, 45.9, 26.4,
   34.9%, against 53.3, 50.2, 38.9, 32.1, 29.2, 24.1% without it), H/H 38.7%. Hard liberals lose
   fewer games to six fascist policies (26% against 53%) and more to Hitler elected (34% against
   9%).
5. **Decision 9's candidates, in its order** (bluffs 0.10, against Normal liberals): groom Hitler
   (a fascist president's weight for Hitler before 3 fascist policies at 1.0 or 2.0 instead of
   0.25, and with it FL passed to Hitler from FFL): N/H 31.0% to 33.1%, worse for the fascist side,
   so it is dropped; special elections to the side (only teammates other than Hitler): N/H 26.3%,
   better at 7 to 10 seats (with Hitler among them, 28.5%); shoot the trusted (the living liberal
   whose governments enacted the most liberal policies): N/H 29.2%, no change, so it is dropped.
6. **Other fascist-side rules:** a fascist president at 3 or more fascist policies nominating
   Hitler whenever he is eligible: N/H 27.2% (at 7 to 10 seats only); fascists voting down
   governments of two liberals, keeping half or none of their yes chance: N/H 27.1% and 24.9%,
   better at every size.
7. **With rule 1's change** (bluffs 0.10), against Normal and Hard liberals: voting down liberal
   governments (keeping none) N/H 25.0%, H/H 24.3%; and nominating Hitler at 3 or more: 23.6% and
   24.4%; or special elections to the side instead: 22.5% and 24.3%; nominating Hitler and special
   elections without voting down: 23.9% and 38.1% (voting down is what brings all-Hard games into
   the band). Voting down while keeping 0.3 of the yes chance: 27.2% and 28.7%.
8. **As chances inside a range** (0.10 to 0.90): voting down keeping 0.1 (a pull of 0.9): N/H
   25.9%, H/H 25.3%; with special elections to the side at 0.9: 23.5% and 26.4%; and nominating
   Hitler at 0.9 too: 21.6% and 25.7%.
9. **The design for run 2,** voting down only governments of two players a fascist knows are
   liberal (pull 0.9) and special elections to the side (0.9), with rule 1's change and bluffs
   0.10: N/N 28.2%, N/H 23.6%, H/N 40.0%, H/H 26.8%; by size, N/H 28.2, 43.6, 17.8, 24.2, 12.0,
   16.2% against N/N 29.5, 45.2, 22.7, 30.6, 18.1, 23.2%. Voting down alone (exploration 8) leaves
   N/H about 1.6 points under N/N, the edge of the pooled intervals' overlap, so both rules go in
   before run 2. Nominating Hitler at 3 or more is not needed and stays out.
10. **Rules 8 and 9 as built** (run 1's code with rule 9 committed and rule 8 in the working
    tree), `-Pladder -Pgames=500`: E/N 20.7%, N/N 27.7%, H/N 39.3%, N/E 33.3%, N/H 23.1%, E/E
    24.8%, H/H 27.4%; every step clears and the balance is 0.3 points apart, as exploration 9's
    scratch edits said. At 500 games a size this decides nothing.
