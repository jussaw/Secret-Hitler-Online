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
| 0 | before | d4dd765 | VD 0.25 · FF 2.0 · LL 2.0 · PD 2.0 · LP 0.5 · FP 0.5 · CB 0.35 · PB 0.35 · NW 3 | 21.3% | 27.2% | 38.0% | 31.9% | 34.3% | 25.1% | 42.4% | Ladder FAIL: L E<N clears; L N<H clears; L E<H clears; F E<N clears; F N<H inverted (sizes 5, 6, 7, 8, 10); F E<H inverted (sizes 8) | 15.2 (check FAIL, target FAIL) | no (before) | See run 1's row. |

## Exploration runs

Free and deciding nothing (Decision 2): what each tried and what it showed.
