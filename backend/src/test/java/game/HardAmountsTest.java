package game;

import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Hard's tuned amounts (issue #72, Phase 25D) stay inside their ranges, so tuning never switches a
 * rule off: each range's floor keeps its rule on (a drop or a weight that changes something, a
 * chance that still comes up), and its ceiling keeps the rule from deciding alone. The hard-rule
 * tests read every amount by name, so a tuned amount moves their expectations with it; this test
 * is the one place that holds the amounts' values.
 */
public class HardAmountsTest {

    /** Fails unless {@code low <= value <= high}, naming the amount. */
    private static void within(String name, double value, double low, double high) {
        assertTrue(name + " is " + value + ", outside its range " + low + " to " + high,
                low <= value && value <= high);
    }

    @Test
    public void everyRuleStaysOn() {
        within("CpuPlayer.VOTE_DROP (rule 3)", CpuPlayer.VOTE_DROP, 0.1, 5);
        within("ChancellorHand.FF_DROP (rule 2)", ChancellorHand.FF_DROP, 0.1, 5);
        within("ChancellorHand.LL_RISE (rule 2)", ChancellorHand.LL_RISE, 0.1, 5);
        within("PeekMemory.DROP (rule 4)", PeekMemory.DROP, 0.1, 5);
        within("CpuPlayer.LIBERAL_TRACKER_PUSH (rule 6)", CpuPlayer.LIBERAL_TRACKER_PUSH, 0.1, 0.9);
        within("CpuPlayer.FASCIST_TRACKER_PULL (rule 6)", CpuPlayer.FASCIST_TRACKER_PULL, 0.1, 0.9);
        within("CpuPlayer.CHANCELLOR_BLUFF_CHANCE (rule 7)", CpuPlayer.CHANCELLOR_BLUFF_CHANCE, 0.10, 0.90);
        within("CpuPlayer.PRESIDENT_BLUFF_CHANCE (rule 7)", CpuPlayer.PRESIDENT_BLUFF_CHANCE, 0.10, 0.90);
        within("ClearedPlayers.NOMINATION_WEIGHT (rule 1)", ClearedPlayers.NOMINATION_WEIGHT, 1.5, 5);
        within("CpuPlayer.SIDE_ELECTION_CHANCE (rule 9)", CpuPlayer.SIDE_ELECTION_CHANCE, 0.10, 0.90);
    }
}
