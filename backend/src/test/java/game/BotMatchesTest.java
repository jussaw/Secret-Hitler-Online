package game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import game.datastructures.Identity;
import game.datastructures.Player;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
    private static final LadderCheck.Pairing EN = new LadderCheck.Pairing(BotSkill.EASY, BotSkill.NORMAL);
    private static final LadderCheck.Pairing HH = new LadderCheck.Pairing(BotSkill.HARD, BotSkill.HARD);

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
        assertEquals("Unknown option \"--seed=1\". botMatches takes -Pgames=N, -Pliberals=LEVEL, -Pfascists=LEVEL, "
                + "-Pladder and -Ppool=<file>,<file>.", unknown.getMessage());
    }

    @Test
    public void optionsReadThePool() {
        BotMatches.Options pool = BotMatches.Options.parse("--pool=a.txt,b.txt");
        assertEquals(List.of("a.txt", "b.txt"), pool.pool());
        assertFalse(pool.ladder());
        assertEquals(List.of(), BotMatches.Options.parse().pool());
        assertEquals(List.of(), BotMatches.Options.parse("--ladder").pool());

        String message = "-Ppool takes two ladder reports: -Ppool=<file>,<file>.";
        for (String[] args : new String[][] {{"--pool=a.txt"}, {"--pool="}, {"--pool=a.txt,"}, {"--pool=,b.txt"},
                {"--pool=a.txt,b.txt,c.txt"}, {"--pool=a.txt,b.txt", "--ladder"}, {"--ladder", "--pool=a.txt,b.txt"},
                {"--pool=a.txt,b.txt", "--games=50"}, {"--liberals=HARD", "--pool=a.txt,b.txt"}}) {
            Throwable refused = thrown(() -> BotMatches.Options.parse(args));
            assertNotNull(Arrays.toString(args), refused);
            assertTrue(refused instanceof IllegalArgumentException);
            assertEquals(Arrays.toString(args), message, refused.getMessage());
        }
    }

    /**
     * A hand-built run: each of {@code pairings} with the same tallies, every size from 5 to 10,
     * {@code endings} holding each size's four ending counts in {@code ENDINGS}' order.
     */
    private static Map<LadderCheck.Pairing, BotMatches.Results> handBuiltRun(int gamesPerSize, int[][] endings,
            LadderCheck.Pairing... pairings) {
        Map<LadderCheck.Pairing, BotMatches.Results> results = new LinkedHashMap<>();
        for (LadderCheck.Pairing pairing : pairings) {
            SortedMap<Integer, BotMatches.Tally> bySize = new TreeMap<>();
            for (int seats = 5; seats <= 10; seats++) {
                int[] counts = endings[seats - 5];
                bySize.put(seats, tallyOf(counts[0], counts[1], counts[2], counts[3]));
            }
            results.put(pairing, new BotMatches.Results(
                    BotMatches.label(pairing.liberals(), pairing.fascists()), gamesPerSize, bySize));
        }
        return results;
    }

    @Test
    public void aReportsTalliesReadBack() {
        Map<LadderCheck.Pairing, BotMatches.Results> played = BotMatches.ladder(2);
        String report = BotMatches.ladderReport(played);
        List<String> lines = List.of(report.split("\n"));
        assertTrue(lines.contains("Tallies: 2 games at each table size"));
        assertTrue(report, lines.contains(talliesLine("E/N", 5, played.get(EN).bySize().get(5))));

        Map<LadderCheck.Pairing, BotMatches.Results> read = BotMatches.readTallies(lines);

        assertEquals(LadderCheck.PAIRINGS, List.copyOf(read.keySet()));
        for (LadderCheck.Pairing pairing : LadderCheck.PAIRINGS) {
            BotMatches.Results was = played.get(pairing);
            BotMatches.Results is = read.get(pairing);
            assertEquals(2, is.gamesPerSize());
            assertEquals(BotMatches.label(pairing.liberals(), pairing.fascists()), is.label());
            assertEquals(List.of(5, 6, 7, 8, 9, 10), List.copyOf(is.bySize().keySet()));
            for (int seats = 5; seats <= 10; seats++) {
                for (GameState ending : BotMatches.ENDINGS) {
                    assertEquals(pairing.label() + " " + seats + " " + ending, was.bySize().get(seats).count(ending),
                            is.bySize().get(seats).count(ending));
                }
            }
        }
    }

    /** A tally block's line: the pairing, the seats and each ending's count, in {@code ENDINGS}' order. */
    private static String talliesLine(String pairing, int seats, BotMatches.Tally tally) {
        StringBuilder line = new StringBuilder(pairing + " " + seats);
        for (GameState ending : BotMatches.ENDINGS) {
            line.append(' ').append(tally.count(ending));
        }
        return line.toString();
    }

    @Test
    public void poolingAddsTheTallies() {
        int[][] first = {{1, 2, 3, 4}, {5, 0, 5, 0}, {0, 0, 0, 10}, {10, 0, 0, 0}, {2, 2, 3, 3}, {4, 1, 4, 1}};
        int[][] second = {{4, 3, 2, 1}, {0, 5, 0, 5}, {10, 0, 0, 0}, {1, 2, 3, 4}, {3, 3, 2, 2}, {1, 4, 1, 4}};
        Map<LadderCheck.Pairing, BotMatches.Results> a = handBuiltRun(10, first, EN, HH);
        Map<LadderCheck.Pairing, BotMatches.Results> b = handBuiltRun(10, second, EN, HH);

        Map<LadderCheck.Pairing, BotMatches.Results> pooled = BotMatches.pool(a, b);

        assertEquals(List.of(EN, HH), List.copyOf(pooled.keySet()));
        for (LadderCheck.Pairing pairing : List.of(EN, HH)) {
            BotMatches.Results results = pooled.get(pairing);
            assertEquals(20, results.gamesPerSize());
            assertEquals(BotMatches.label(pairing.liberals(), pairing.fascists()) + ", pooled", results.label());
            for (int seats = 5; seats <= 10; seats++) {
                BotMatches.Tally tally = results.bySize().get(seats);
                assertEquals(20, tally.games());
                for (int i = 0; i < BotMatches.ENDINGS.size(); i++) {
                    assertEquals(first[seats - 5][i] + second[seats - 5][i], tally.count(BotMatches.ENDINGS.get(i)));
                }
            }
            assertEquals(120, results.pooled().games());
        }
    }

    @Test
    public void poolRefusesRunsThatDoNotMatch() {
        int[][] counts = {{1, 0, 0, 0}, {1, 0, 0, 0}, {1, 0, 0, 0}, {1, 0, 0, 0}, {1, 0, 0, 0}, {1, 0, 0, 0}};
        Map<LadderCheck.Pairing, BotMatches.Results> both = handBuiltRun(1, counts, EN, HH);
        Map<LadderCheck.Pairing, BotMatches.Results> one = handBuiltRun(1, counts, EN);
        Map<LadderCheck.Pairing, BotMatches.Results> shortOfASize = handBuiltRun(1, counts, EN, HH);
        SortedMap<Integer, BotMatches.Tally> fewer = new TreeMap<>(shortOfASize.get(HH).bySize());
        fewer.remove(10);
        shortOfASize.put(HH, new BotMatches.Results("Short", 1, fewer));

        for (Runnable call : List.<Runnable>of(() -> BotMatches.pool(both, one), () -> BotMatches.pool(one, both),
                () -> BotMatches.pool(both, shortOfASize))) {
            Throwable refused = thrown(call);
            assertNotNull(refused);
            assertTrue(refused instanceof IllegalArgumentException);
            assertEquals("The two runs do not match.", refused.getMessage());
        }
    }

    /** One run's report given twice would count its games twice and narrow every interval. */
    @Test
    public void poolRefusesOneRunTwice() {
        int[][] counts = {{1, 2, 3, 4}, {5, 0, 5, 0}, {0, 0, 0, 10}, {10, 0, 0, 0}, {2, 2, 3, 3}, {4, 1, 4, 1}};
        Map<LadderCheck.Pairing, BotMatches.Results> run = handBuiltRun(10, counts, EN, HH);
        List<String> report = List.of(BotMatches.ladderReport(BotMatches.ladder(2)).split("\n"));

        for (Runnable call : List.<Runnable>of(() -> BotMatches.pool(run, handBuiltRun(10, counts, EN, HH)),
                () -> BotMatches.pool(BotMatches.readTallies(report), BotMatches.readTallies(report)))) {
            Throwable refused = thrown(call);
            assertNotNull(refused);
            assertTrue(refused instanceof IllegalArgumentException);
            assertEquals("The two reports hold the same games: pool two separate runs.", refused.getMessage());
        }
    }

    @Test
    public void aReportWithoutTalliesIsRefused() {
        Throwable none = thrown(() -> BotMatches.readTallies(List.of("Ladder check: PASS", "Balance check: PASS")));
        assertNotNull(none);
        assertTrue(none instanceof IllegalArgumentException);
        assertEquals("No tally block in the report.", none.getMessage());

        for (String bad : List.of("E/N 5 1 0 0", "X/Y 5 1 0 0 1", "E/N five 1 0 0 1", "E/N 5 1 0 0 0",
                "Liberals EASY, fascists NORMAL")) {
            Throwable unread = thrown(() -> BotMatches.readTallies(List.of("Tallies: 2 games at each table size", bad)));
            assertNotNull(bad, unread);
            assertTrue(unread instanceof IllegalArgumentException);
            assertMentions(unread.getMessage(), bad);
        }
        Throwable twice = thrown(() -> BotMatches.readTallies(
                List.of("Tallies: 1 games at each table size", "E/N 5 1 0 0 0", "E/N 5 0 1 0 0")));
        assertNotNull(twice);
        assertMentions(twice.getMessage(), "E/N 5 0 1 0 0");
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
