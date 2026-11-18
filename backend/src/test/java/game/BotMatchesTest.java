package game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import game.datastructures.Identity;
import game.datastructures.Player;
import java.util.ArrayList;
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
        for (BotSkill liberals : BotSkill.values()) {
            for (BotSkill fascists : BotSkill.values()) {
                String label = BotMatches.label(liberals, fascists);
                BotMatches.Results results = BotMatches.play(3, label, BotMatches.makeBots(liberals, fascists));

                assertEquals(label, List.of(5, 6, 7, 8, 9, 10), List.copyOf(results.bySize().keySet()));
                for (BotMatches.Tally tally : results.bySize().values()) {
                    assertEquals(label, 3, tally.games());
                    int endings = 0;
                    for (GameState ending : BotMatches.ENDINGS) {
                        endings += tally.count(ending);
                    }
                    assertEquals(label, 3, endings);
                }
                assertEquals(label, 18, results.pooled().games());
            }
        }
    }

    @Test
    public void eachSideGetsItsLevel() {
        BiFunction<String, Identity, CpuPlayer> makeBot = BotMatches.makeBots(BotSkill.HARD, BotSkill.EASY);

        assertEquals(BotSkill.HARD, makeBot.apply("Bot 1", Identity.LIBERAL).skill());
        assertEquals(BotSkill.EASY, makeBot.apply("Bot 2", Identity.FASCIST).skill());
        assertEquals(BotSkill.EASY, makeBot.apply("Bot 3", Identity.HITLER).skill());
        assertEquals("Bot 1", makeBot.apply("Bot 1", Identity.LIBERAL).myName);
    }

    @Test
    public void theLabelNamesBothLevels() {
        assertEquals("Liberals HARD, fascists NORMAL", BotMatches.label(BotSkill.HARD, BotSkill.NORMAL));
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
    public void aBotThatCannotBeMadeFailsTheRun() {
        BiFunction<String, Identity, CpuPlayer> unmade = (name, role) -> {
            throw new IllegalStateException("no bot for " + role);
        };

        AssertionError error = failure(() -> BotMatches.play(1, "Unmade bots", unmade));

        assertMentions(error.getMessage(), "5 seats", "Unmade bots", "no bot for");
    }

    @Test
    public void aMoveTheRecordCannotReadFailsTheRun() {
        // A move no game method makes: the bot changes another seat's role.
        BiFunction<String, Identity, CpuPlayer> cheating = (name, role) -> new CpuPlayer(name) {
            @Override
            public boolean act(SecretHitlerGame game) {
                for (Player player : game.getPlayerList()) {
                    if (!player.getUsername().equals(myName)) {
                        player.setIdentity(player.getIdentity() == Identity.LIBERAL ? Identity.FASCIST : Identity.LIBERAL);
                        return true;
                    }
                }
                return false;
            }
        };

        AssertionError error = failure(() -> BotMatches.play(1, "Cheating bots", cheating));

        assertMentions(error.getMessage(), "5 seats", "Cheating bots", "could not be recorded", "the seats changed");
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
    }

    @Test
    public void aRefusedOptionSaysWhy() {
        Throwable games = thrown(() -> BotMatches.Options.parse("--games=abc"));
        assertNotNull(games);
        assertEquals("-Pgames must be a whole number of at least 1, not \"abc\".", games.getMessage());
    }

    @Test
    public void optionsReadTheLevels() {
        BotMatches.Options none = BotMatches.Options.parse();
        assertEquals(BotSkill.NORMAL, none.liberals());
        assertEquals(BotSkill.NORMAL, none.fascists());
        assertFalse(none.ladder());

        BotMatches.Options levels = BotMatches.Options.parse("--liberals=hard", "--fascists=Easy");
        assertEquals(BotSkill.HARD, levels.liberals());
        assertEquals(BotSkill.EASY, levels.fascists());
        assertFalse(levels.ladder());
        assertEquals(BotMatches.DEFAULT_GAMES, levels.games());

        BotMatches.Options ladder = BotMatches.Options.parse("--ladder", "--games=50");
        assertTrue(ladder.ladder());
        assertEquals(50, ladder.games());
        assertEquals(BotSkill.NORMAL, ladder.liberals());
        assertEquals(BotSkill.NORMAL, ladder.fascists());
    }

    @Test
    public void anUnknownLevelIsRefused() {
        Throwable expert = thrown(() -> BotMatches.Options.parse("--fascists=expert"));
        assertNotNull(expert);
        assertTrue(expert instanceof IllegalArgumentException);
        assertEquals("Unknown level \"expert\": use EASY, NORMAL or HARD.", expert.getMessage());

        Throwable empty = thrown(() -> BotMatches.Options.parse("--liberals="));
        assertNotNull(empty);
        assertEquals("Unknown level \"\": use EASY, NORMAL or HARD.", empty.getMessage());
    }

    @Test
    public void theLadderTakesNoLevels() {
        String message = "-Pladder plays its own pairings: leave out -Pliberals and -Pfascists.";
        Throwable after = thrown(() -> BotMatches.Options.parse("--ladder", "--liberals=HARD"));
        assertNotNull(after);
        assertTrue(after instanceof IllegalArgumentException);
        assertEquals(message, after.getMessage());

        Throwable before = thrown(() -> BotMatches.Options.parse("--fascists=normal", "--ladder"));
        assertNotNull(before);
        assertEquals(message, before.getMessage());
    }

    @Test
    public void anUnknownOptionNamesEveryOption() {
        Throwable unknown = thrown(() -> BotMatches.Options.parse("--seed=1"));
        assertNotNull(unknown);
        assertTrue(unknown instanceof IllegalArgumentException);
        assertEquals("Unknown option \"--seed=1\". botMatches takes -Pgames=N, -Pliberals=LEVEL, -Pfascists=LEVEL "
                + "and -Pladder.", unknown.getMessage());
    }

    @Test
    public void theLadderReportShowsEveryPairingSideBySide() {
        String report = BotMatches.ladderReport(BotMatches.ladder(2));

        assertTrue("every line ends in a newline", report.endsWith("\n"));
        List<String> lines = List.of(report.split("\n"));
        assertTrue(lines.get(0), lines.get(0).startsWith("Ladder and balance pairings (liberals/fascists; "
                + "E Easy, N Normal, H Hard): 2 games at each table size"));
        List<String> labels = new ArrayList<>();
        for (LadderCheck.Pairing pairing : LadderCheck.PAIRINGS) {
            labels.add(pairing.label());
        }
        List<String> header = new ArrayList<>(labels);
        header.add(0, "Seats");
        assertEquals(1, lines.stream().filter(line -> cells(line).equals(header)).count());
        for (String seats : List.of("5", "6", "7", "8", "9", "10", "All")) {
            assertEquals("the side-by-side row " + seats, 1, lines.stream()
                    .filter(line -> cells(line).size() == 8 && cells(line).get(0).equals(seats)
                            && cells(line).get(1).matches("[0-9.]+% [0-9.]+-[0-9.]+%"))
                    .count());
        }
        assertEquals(1, lines.stream().filter(line -> line.matches("Ladder check: (PASS|FAIL).*")).count());
        assertEquals(1, lines.stream().filter(line -> line.matches("Balance check: (PASS|FAIL).*")).count());
        List<String> tables = lines.stream().filter(line -> line.startsWith("Liberals ")).toList();
        assertEquals(7, tables.size());
        for (int i = 0; i < 7; i++) {
            LadderCheck.Pairing pairing = LadderCheck.PAIRINGS.get(i);
            assertEquals(BotMatches.label(pairing.liberals(), pairing.fascists()) + ": 2 games at each table size",
                    tables.get(i));
        }
    }

    @Test
    public void noGamesIsRefused() {
        assertRefused(() -> BotMatches.play(0, "No bots", BotMatches.makeBots(BotSkill.NORMAL, BotSkill.NORMAL)));
    }
}
