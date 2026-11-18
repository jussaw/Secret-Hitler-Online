package game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import game.LadderCheck.Pairing;
import game.LadderCheck.Side;
import game.LadderCheck.Step;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.SortedMap;
import java.util.TreeMap;
import org.junit.Test;

/** How {@code botMatches -Pladder} reads its pairings: the ladder check and the balance check. */
public class LadderCheckTest {
    private static final BotSkill E = BotSkill.EASY;
    private static final BotSkill N = BotSkill.NORMAL;
    private static final BotSkill H = BotSkill.HARD;

    /** A tally of {@code games} with {@code liberalWins} won by liberal policies, the rest by fascist ones. */
    private static BotMatches.Tally tally(int liberalWins, int games) {
        BotMatches.Tally tally = new BotMatches.Tally();
        for (int i = 0; i < games; i++) {
            tally.add(i < liberalWins ? GameState.LIBERAL_VICTORY_POLICY : GameState.FASCIST_VICTORY_POLICY);
        }
        return tally;
    }

    /** 1,000 games at each size, the liberals winning {@code liberalWins} of them at every size. */
    private static BotMatches.Results results(int liberalWins) {
        return results(liberalWins, Map.of());
    }

    /** As {@link #results(int)}, but the liberals win {@code bySizeWins}' count at each size it names. */
    private static BotMatches.Results results(int liberalWins, Map<Integer, Integer> bySizeWins) {
        SortedMap<Integer, BotMatches.Tally> bySize = new TreeMap<>();
        for (int seats = 5; seats <= 10; seats++) {
            bySize.put(seats, tally(bySizeWins.getOrDefault(seats, liberalWins), 1000));
        }
        return new BotMatches.Results("Test", 1000, bySize);
    }

    /** Every pairing at {@code liberalWins} of 1,000 a size. */
    private static Map<Pairing, BotMatches.Results> pairings(int liberalWins) {
        return pairings(liberalWins, Map.of());
    }

    /** As {@link #pairings(int)}, but each pairing {@code others} names has its results. */
    private static Map<Pairing, BotMatches.Results> pairings(int liberalWins, Map<Pairing, BotMatches.Results> others) {
        Map<Pairing, BotMatches.Results> all = new LinkedHashMap<>();
        for (Pairing pairing : LadderCheck.PAIRINGS) {
            all.put(pairing, others.getOrDefault(pairing, results(liberalWins)));
        }
        return all;
    }

    @Test
    public void separateIntervalsClear() {
        assertTrue(LadderCheck.clearlyAbove(BotMatches.interval(400, 1000), BotMatches.interval(300, 1000)));
        assertFalse(LadderCheck.clearlyAbove(BotMatches.interval(300, 1000), BotMatches.interval(400, 1000)));
    }

    @Test
    public void overlappingIntervalsDoNotClear() {
        BotMatches.Interval higher = BotMatches.interval(360, 1000);
        BotMatches.Interval lower = BotMatches.interval(330, 1000);
        // Each rate lies outside the other's interval, which is not the spec's reading: the two
        // intervals must not overlap.
        assertTrue(0.33 < higher.low());
        assertTrue(0.36 > lower.high());

        assertFalse(LadderCheck.clearlyAbove(higher, lower));
    }

    @Test
    public void aSizeWhereTheHigherLevelIsClearlyLowerFailsTheStep() {
        Map<Pairing, BotMatches.Results> results =
                pairings(300, Map.of(new Pairing(H, N), results(450, Map.of(7, 150))));

        Step step = LadderCheck.step(Side.LIBERAL, N, H, results);

        assertTrue(step.pooledClears());
        assertEquals(List.of(7), step.invertedSizes());
        assertFalse(step.passes());
    }

    @Test
    public void theFascistSideCountsFascistWins() {
        Map<Pairing, BotMatches.Results> results = pairings(600, Map.of(new Pairing(N, E), results(700)));

        assertEquals(300, LadderCheck.wins(Side.FASCIST, results.get(new Pairing(N, E)).pooled()) / 6);
        Step step = LadderCheck.step(Side.FASCIST, E, N, results);
        assertTrue(step.pooledClears());
        assertEquals(List.of(), step.invertedSizes());
        assertTrue(step.passes());
        Map<Pairing, BotMatches.Results> easyLiberalsAhead = pairings(600, Map.of(new Pairing(E, N), results(700)));
        assertFalse(LadderCheck.step(Side.LIBERAL, E, N, easyLiberalsAhead).passes());
    }

    @Test
    public void balanceAllowsTenPointsEitherWay() {
        Pairing allHard = new Pairing(H, H);
        assertTrue(LadderCheck.balanced(pairings(350, Map.of(allHard, results(450)))));
        assertTrue(LadderCheck.balanced(pairings(350, Map.of(allHard, results(250)))));
        assertFalse(LadderCheck.balanced(pairings(350, Map.of(allHard, results(451)))));
        assertFalse(LadderCheck.balanced(pairings(350, Map.of(allHard, results(249)))));
    }

    @Test
    public void theVerdictsSayWhatFailed() {
        String verdicts = LadderCheck.verdicts(pairings(500));
        List<String> lines = List.of(verdicts.split("\n"));

        assertTrue(lines.get(0), lines.get(0).startsWith("Ladder check: FAIL ("));
        for (String step : List.of("Liberal side, Easy < Normal", "Liberal side, Normal < Hard",
                "Fascist side, Easy < Normal", "Fascist side, Normal < Hard")) {
            assertTrue(step + " in " + lines.get(0), lines.get(0).contains(step));
        }
        assertEquals("  Liberal side, Easy < Normal: 50.0% 48.7-51.3% vs 50.0% 48.7-51.3% pooled, overlaps; "
                + "sizes inverted: none", lines.get(1));
        assertEquals(6, lines.size());
        assertEquals("Balance check: PASS (all-Hard 50.0%, all-Normal 50.0%, band 10 points)", lines.get(5));
    }

    @Test
    public void aPassingLadderSaysSo() {
        Map<Pairing, BotMatches.Results> results = pairings(400, Map.of(new Pairing(E, N), results(300),
                new Pairing(H, N), results(500), new Pairing(N, E), results(500), new Pairing(N, H), results(300),
                new Pairing(H, H), results(480)));
        String verdicts = LadderCheck.verdicts(results);

        assertTrue(verdicts, verdicts.startsWith("Ladder check: PASS\n"));
        assertTrue(verdicts, verdicts.contains("  Fascist side, Normal < Hard: 60.0% 58.8-61.2% vs 70.0% "
                + "68.8-71.1% pooled, clears; sizes inverted: none\n"));
        assertTrue(verdicts, verdicts.endsWith("Balance check: PASS (all-Hard 48.0%, all-Normal 40.0%, band 10 "
                + "points)\n"));
        assertTrue(LadderCheck.verdicts(pairings(400, Map.of(new Pairing(E, N), results(500))))
                .contains("  Liberal side, Easy < Normal: 50.0% 48.7-51.3% vs 40.0% 38.8-41.2% pooled, inverted;"));
    }

    @Test
    public void pairingsComeInPrintOrder() {
        List<String> labels = new ArrayList<>();
        for (Pairing pairing : LadderCheck.PAIRINGS) {
            labels.add(pairing.label());
        }
        assertEquals(List.of("E/N", "N/N", "H/N", "N/E", "N/H", "E/E", "H/H"), labels);
    }
}
