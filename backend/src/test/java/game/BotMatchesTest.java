package game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import game.datastructures.Identity;
import java.util.Arrays;
import java.util.List;
import java.util.SortedMap;
import java.util.TreeMap;
import java.util.function.BiFunction;
import org.junit.Test;

/**
 * The self-play run's fast test: a few games at every table size, its guards, its interval and its
 * table. {@code ./gradlew botMatches} plays the full run.
 */
public class BotMatchesTest {
    private static final double CLOSE = 0.0001;

    /** What {@code call} threw, or null if it returned. */
    private static Throwable thrown(Runnable call) {
        try {
            call.run();
            return null;
        } catch (Throwable t) {
            return t;
        }
    }

    private static AssertionError failure(Runnable call) {
        Throwable t = thrown(call);
        assertNotNull("expected the run to fail", t);
        assertTrue("expected an AssertionError, got " + t, t instanceof AssertionError);
        return (AssertionError) t;
    }

    private static void assertRefused(Runnable call) {
        Throwable t = thrown(call);
        assertNotNull("expected an IllegalArgumentException", t);
        assertTrue("expected an IllegalArgumentException, got " + t, t instanceof IllegalArgumentException);
    }

    private static void assertMentions(String message, String... parts) {
        for (String part : parts) {
            assertTrue("expected \"" + part + "\" in: " + message, message.contains(part));
        }
    }

    @Test
    public void everySizeFinishesItsGames() {
        BotMatches.Results results = BotMatches.play(3, "Test bots", BotMatches.BOTS_AS_BUILT);

        assertEquals(List.of(5, 6, 7, 8, 9, 10), List.copyOf(results.bySize().keySet()));
        for (BotMatches.Tally tally : results.bySize().values()) {
            assertEquals(3, tally.games());
            int endings = 0;
            for (GameState ending : BotMatches.ENDINGS) {
                endings += tally.count(ending);
            }
            assertEquals(3, endings);
        }
        assertEquals(18, results.pooled().games());
    }

    @Test
    public void aGamePastTwoThousandMovesFailsTheRun() {
        BiFunction<String, Identity, CpuPlayer> stalling = (name, role) -> new CpuPlayer(name) {
            @Override
            public boolean act(SecretHitlerGame game) {
                return true;
            }
        };

        AssertionError error = failure(() -> BotMatches.play(1, "Stalling bots", stalling));

        assertMentions(error.getMessage(), "5 seats", "Stalling bots", "ran past 2000 moves");
    }

    @Test
    public void aGameNoBotCanMoveFailsTheRun() {
        BiFunction<String, Identity, CpuPlayer> idle = (name, role) -> new CpuPlayer(name) {
            @Override
            public boolean act(SecretHitlerGame game) {
                return false;
            }
        };

        AssertionError error = failure(() -> BotMatches.play(1, "Idle bots", idle));

        assertMentions(error.getMessage(), "5 seats", "Idle bots", "No CPU could move");
    }

    @Test
    public void aBotThatThrowsFailsTheRun() {
        BiFunction<String, Identity, CpuPlayer> broken = (name, role) -> new CpuPlayer(name) {
            @Override
            public boolean act(SecretHitlerGame game) {
                throw new IllegalStateException("boom");
            }
        };

        AssertionError error = failure(() -> BotMatches.play(1, "Broken bots", broken));

        assertMentions(error.getMessage(), "5 seats", "Broken bots", "boom");
    }

    @Test
    public void theIntervalIsWilsons() {
        BotMatches.Interval half = BotMatches.interval(5, 10);
        assertEquals(0.2366, half.low(), CLOSE);
        assertEquals(0.7634, half.high(), CLOSE);

        BotMatches.Interval many = BotMatches.interval(500, 1000);
        assertEquals(0.4691, many.low(), CLOSE);
        assertEquals(0.5309, many.high(), CLOSE);

        BotMatches.Interval none = BotMatches.interval(0, 10);
        assertEquals(0.0, none.low(), CLOSE);
        assertEquals(0.2775, none.high(), CLOSE);
        assertTrue(none.low() >= 0);

        BotMatches.Interval all = BotMatches.interval(10, 10);
        assertEquals(0.7225, all.low(), CLOSE);
        assertEquals(1.0, all.high(), CLOSE);
        assertTrue(all.high() <= 1);

        assertRefused(() -> BotMatches.interval(1, 0));
        assertRefused(() -> BotMatches.interval(11, 10));
    }

    private static BotMatches.Tally tallyOf(int liberalPolicy, int hitlerShot, int fascistPolicy, int hitlerElected) {
        BotMatches.Tally tally = new BotMatches.Tally();
        for (int i = 0; i < liberalPolicy; i++) {
            tally.add(GameState.LIBERAL_VICTORY_POLICY);
        }
        for (int i = 0; i < hitlerShot; i++) {
            tally.add(GameState.LIBERAL_VICTORY_EXECUTION);
        }
        for (int i = 0; i < fascistPolicy; i++) {
            tally.add(GameState.FASCIST_VICTORY_POLICY);
        }
        for (int i = 0; i < hitlerElected; i++) {
            tally.add(GameState.FASCIST_VICTORY_ELECTION);
        }
        return tally;
    }

    private static List<String> cells(String line) {
        return Arrays.asList(line.trim().split("\\s{2,}"));
    }

    @Test
    public void theTableShowsEverySizeAndThePool() {
        SortedMap<Integer, BotMatches.Tally> bySize = new TreeMap<>();
        bySize.put(5, tallyOf(4, 1, 3, 2));
        for (int seats = 6; seats <= 10; seats++) {
            bySize.put(seats, tallyOf(0, 0, 10, 0));
        }

        String table = new BotMatches.Results("Test bots", 10, bySize).table();

        assertTrue("every line ends in a newline", table.endsWith("\n"));
        String[] lines = table.split("\n");
        assertEquals(9, lines.length);
        assertEquals("Test bots: 10 games at each table size", lines[0]);
        assertEquals(List.of("Seats", "Games", "Liberals win", "95% interval", "5 liberal", "Hitler shot",
                "6 fascist", "Hitler elected"), cells(lines[1]));
        assertEquals(List.of("5", "10", "50.0%", "23.7-76.3%", "40.0%", "10.0%", "30.0%", "20.0%"),
                cells(lines[2]));
        assertEquals(List.of("6", "10", "0.0%", "0.0-27.8%", "0.0%", "0.0%", "100.0%", "0.0%"),
                cells(lines[3]));
        assertEquals(List.of("All", "60", "8.3%", "3.6-18.1%", "6.7%", "1.7%", "88.3%", "3.3%"),
                cells(lines[8]));
    }

    @Test
    public void optionsReadTheGames() {
        assertEquals(2000, BotMatches.Options.parse().games());
        assertEquals(50, BotMatches.Options.parse("--games=50").games());

        assertRefused(() -> BotMatches.Options.parse("--games=0"));
        assertRefused(() -> BotMatches.Options.parse("--games=-3"));
        assertRefused(() -> BotMatches.Options.parse("--games=abc"));
        assertRefused(() -> BotMatches.Options.parse("--games="));
        assertRefused(() -> BotMatches.Options.parse("--ladder"));
    }

    @Test
    public void aRefusedOptionSaysWhy() {
        Throwable games = thrown(() -> BotMatches.Options.parse("--games=abc"));
        assertNotNull(games);
        assertEquals("-Pgames must be a whole number of at least 1, not \"abc\".", games.getMessage());

        Throwable unknown = thrown(() -> BotMatches.Options.parse("--ladder"));
        assertNotNull(unknown);
        assertEquals("Unknown option \"--ladder\". botMatches takes -Pgames=N.", unknown.getMessage());
    }

    @Test
    public void noGamesIsRefused() {
        assertRefused(() -> BotMatches.play(0, "No bots", BotMatches.BOTS_AS_BUILT));
    }
}
