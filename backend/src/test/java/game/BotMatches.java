package game;

import game.datastructures.Identity;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.SortedMap;
import java.util.TreeMap;
import java.util.function.BiFunction;
import java.util.function.Function;
import server.stats.CpuGames;

/**
 * The bots' self-play run ({@code ./gradlew botMatches}): plays games with a bot in every seat at
 * each table size from 5 to 10, through {@link CpuGames}, and prints how often each side wins and
 * how the games ended. The bots dealt liberal play at one level and those dealt fascist or Hitler
 * at another ({@code -Pliberals}, {@code -Pfascists}), and {@code -Pladder} plays the pairings
 * {@link LadderCheck} reads. The deck cannot be seeded, so every run differs: the 95% intervals
 * say how far a difference can be trusted.
 */
public final class BotMatches {
    /** Games a table size, unless {@code -Pgames} says otherwise. */
    public static final int DEFAULT_GAMES = 2_000;

    /** The ways a game ends, in the table's column order. */
    public static final List<GameState> ENDINGS = List.of(
            GameState.LIBERAL_VICTORY_POLICY,
            GameState.LIBERAL_VICTORY_EXECUTION,
            GameState.FASCIST_VICTORY_POLICY,
            GameState.FASCIST_VICTORY_ELECTION);

    private static final double Z = 1.96; // a 95% interval

    private static final String GAMES_OPTION = "--games=";
    private static final String LIBERALS_OPTION = "--liberals=";
    private static final String FASCISTS_OPTION = "--fascists=";
    private static final String LADDER_OPTION = "--ladder";

    private BotMatches() {
    }

    /** How many games ended each way. */
    public static final class Tally {
        private final Map<GameState, Integer> counts = new EnumMap<>(GameState.class);

        /** Counts one game that ended in {@code ending}, one of {@link #ENDINGS}. */
        public void add(GameState ending) {
            requireEnding(ending);
            counts.merge(ending, 1, Integer::sum);
        }

        public int games() {
            int games = 0;
            for (int count : counts.values()) {
                games += count;
            }
            return games;
        }

        /** The games that ended in {@code ending}, one of {@link #ENDINGS}. */
        public int count(GameState ending) {
            requireEnding(ending);
            return counts.getOrDefault(ending, 0);
        }

        /** The games the liberal side won: by policies or by shooting Hitler. */
        public int liberalWins() {
            return count(GameState.LIBERAL_VICTORY_POLICY) + count(GameState.LIBERAL_VICTORY_EXECUTION);
        }

        /** One tally of every game in {@code tallies}. */
        public static Tally pooled(Collection<Tally> tallies) {
            Tally pooled = new Tally();
            for (Tally tally : tallies) {
                tally.counts.forEach((ending, count) -> pooled.counts.merge(ending, count, Integer::sum));
            }
            return pooled;
        }

        private static void requireEnding(GameState ending) {
            if (!ENDINGS.contains(ending)) {
                throw new IllegalArgumentException(ending + " is not how a game ends.");
            }
        }
    }

    /** A share's 95% interval, each end in [0, 1]. */
    public record Interval(double low, double high) {
    }

    /**
     * Wilson's score interval at 95% (z = 1.96) for {@code wins} of {@code games}, each end clamped
     * to [0, 1]. Unlike the normal approximation, it stays inside the range and keeps its width
     * near 0% and 100%.
     *
     * @throws IllegalArgumentException if {@code games < 1} or {@code wins} is not in [0, games].
     */
    public static Interval interval(int wins, int games) {
        if (games < 1 || wins < 0 || wins > games) {
            throw new IllegalArgumentException("No interval for " + wins + " wins of " + games + " games.");
        }
        double n = games;
        double p = wins / n;
        double z2 = Z * Z;
        double denominator = 1 + z2 / n;
        double center = (p + z2 / (2 * n)) / denominator;
        double half = Z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / denominator;
        return new Interval(Math.max(0, center - half), Math.min(1, center + half));
    }

    /** A run's tallies by table size, and the table it prints. */
    public record Results(String label, int gamesPerSize, SortedMap<Integer, Tally> bySize) {

        /** Every size's games in one tally. */
        public Tally pooled() {
            return Tally.pooled(bySize.values());
        }

        /**
         * The run as plain text: a line naming the bots and the games a size, a header, a row per
         * table size and {@code All} (every size pooled). Each line ends in a newline.
         */
        public String table() {
            List<List<String>> rows = new ArrayList<>();
            rows.add(List.of("Seats", "Games", "Liberals win", "95% interval", "5 liberal", "Hitler shot",
                    "6 fascist", "Hitler elected"));
            bySize.forEach((seats, tally) -> rows.add(row(Integer.toString(seats), tally)));
            rows.add(row("All", pooled()));

            int[] widths = new int[rows.get(0).size()];
            for (List<String> row : rows) {
                for (int i = 0; i < row.size(); i++) {
                    widths[i] = Math.max(widths[i], row.get(i).length());
                }
            }
            StringBuilder out = new StringBuilder();
            out.append(String.format(Locale.ROOT, "%s: %d games at each table size", label, gamesPerSize))
                    .append('\n');
            for (List<String> row : rows) {
                StringBuilder line = new StringBuilder();
                for (int i = 0; i < row.size(); i++) {
                    if (i > 0) {
                        line.append("  ");
                    }
                    line.append(" ".repeat(widths[i] - row.get(i).length())).append(row.get(i));
                }
                out.append(line).append('\n');
            }
            return out.toString();
        }

        private static List<String> row(String seats, Tally tally) {
            int games = tally.games();
            Interval interval = interval(tally.liberalWins(), games);
            List<String> cells = new ArrayList<>();
            cells.add(seats);
            cells.add(Integer.toString(games));
            cells.add(percent(tally.liberalWins(), games));
            cells.add(String.format(Locale.ROOT, "%.1f-%.1f%%", 100 * interval.low(), 100 * interval.high()));
            for (GameState ending : ENDINGS) {
                cells.add(percent(tally.count(ending), games));
            }
            return cells;
        }

        private static String percent(int count, int games) {
            return String.format(Locale.ROOT, "%.1f%%", 100.0 * count / games);
        }
    }

    /**
     * Plays {@code gamesPerSize} games at each table size from 5 to 10, in that order, every seat a
     * bot made by {@code makeBot}, and tallies how each ended.
     *
     * @param label names the bots in the table and in a failure.
     * @throws AssertionError           naming the size and the bots, with the game's timeline, if a
     *                                  game runs past 2,000 moves, no bot can move, or a move throws.
     * @throws IllegalArgumentException if {@code gamesPerSize < 1}.
     */
    public static Results play(int gamesPerSize, String label, BiFunction<String, Identity, CpuPlayer> makeBot) {
        if (gamesPerSize < 1) {
            throw new IllegalArgumentException("A run plays at least 1 game a size, not " + gamesPerSize + ".");
        }
        SortedMap<Integer, Tally> bySize = new TreeMap<>();
        for (int seats = SecretHitlerGame.MIN_PLAYERS; seats <= SecretHitlerGame.MAX_PLAYERS; seats++) {
            Tally tally = new Tally();
            for (int i = 0; i < gamesPerSize; i++) {
                SecretHitlerGame game;
                try {
                    game = CpuGames.play(seats, () -> 0L, 0L, 0, makeBot).game();
                } catch (AssertionError e) {
                    throw new AssertionError("A game of " + seats + " seats with " + label + " failed: "
                            + e.getMessage(), e);
                }
                tally.add(game.getState());
            }
            bySize.put(seats, tally);
        }
        return new Results(label, gamesPerSize, Collections.unmodifiableSortedMap(bySize));
    }

    /**
     * Makes each seat's bot at its side's level: a seat dealt {@code LIBERAL} at {@code liberals},
     * one dealt {@code FASCIST} or {@code HITLER} at {@code fascists}.
     */
    public static BiFunction<String, Identity, CpuPlayer> makeBots(BotSkill liberals, BotSkill fascists) {
        return (name, role) -> new CpuPlayer(name, role == Identity.LIBERAL ? liberals : fascists);
    }

    /** Names both sides' levels, as the table and a failed game do: {@code Liberals HARD, fascists NORMAL}. */
    public static String label(BotSkill liberals, BotSkill fascists) {
        return "Liberals " + liberals + ", fascists " + fascists;
    }

    /** Plays every pairing {@link LadderCheck#PAIRINGS} names, in its order. */
    public static Map<LadderCheck.Pairing, Results> ladder(int gamesPerSize) {
        Map<LadderCheck.Pairing, Results> results = new LinkedHashMap<>();
        for (LadderCheck.Pairing pairing : LadderCheck.PAIRINGS) {
            results.put(pairing, playAt(gamesPerSize, pairing.liberals(), pairing.fascists()));
        }
        return results;
    }

    /** {@link #play} with each side's bots at its level, named by {@link #label}. */
    private static Results playAt(int gamesPerSize, BotSkill liberals, BotSkill fascists) {
        return play(gamesPerSize, label(liberals, fascists), makeBots(liberals, fascists));
    }

    /**
     * The ladder run as plain text: a line naming the run, the liberal side's rate and interval for
     * each pairing side by side (a row per table size and {@code All}), the ladder and balance
     * verdicts, then each pairing's own table. Each line ends in a newline.
     */
    public static String ladderReport(Map<LadderCheck.Pairing, Results> results) {
        List<List<String>> rows = new ArrayList<>();
        List<String> header = new ArrayList<>();
        header.add("Seats");
        for (LadderCheck.Pairing pairing : results.keySet()) {
            header.add(pairing.label());
        }
        rows.add(header);
        Results first = results.values().iterator().next();
        for (int seats : first.bySize().keySet()) {
            rows.add(rateRow(Integer.toString(seats), results, pairing -> pairing.bySize().get(seats)));
        }
        rows.add(rateRow("All", results, Results::pooled));

        StringBuilder out = new StringBuilder();
        out.append(String.format(Locale.ROOT,
                "Ladder and balance pairings (liberals/fascists; E Easy, N Normal, H Hard): "
                        + "%d games at each table size",
                first.gamesPerSize())).append('\n');
        out.append(aligned(rows)).append('\n');
        out.append(LadderCheck.verdicts(results));
        for (Results pairing : results.values()) {
            out.append('\n').append(pairing.table());
        }
        return out.toString();
    }

    /** A row of the side-by-side table: its name, then each pairing's liberal rate in {@code tallyOf} its results. */
    private static List<String> rateRow(String name, Map<LadderCheck.Pairing, Results> results,
            Function<Results, Tally> tallyOf) {
        List<String> row = new ArrayList<>();
        row.add(name);
        for (Results pairing : results.values()) {
            Tally tally = tallyOf.apply(pairing);
            row.add(LadderCheck.rate(tally.liberalWins(), tally.games()));
        }
        return row;
    }

    /** Rows of cells as lines, each column right-aligned to its widest cell, two spaces apart. */
    private static String aligned(List<List<String>> rows) {
        int[] widths = new int[rows.get(0).size()];
        for (List<String> row : rows) {
            for (int i = 0; i < row.size(); i++) {
                widths[i] = Math.max(widths[i], row.get(i).length());
            }
        }
        StringBuilder out = new StringBuilder();
        for (List<String> row : rows) {
            StringBuilder line = new StringBuilder();
            for (int i = 0; i < row.size(); i++) {
                if (i > 0) {
                    line.append("  ");
                }
                line.append(" ".repeat(widths[i] - row.get(i).length())).append(row.get(i));
            }
            out.append(line).append('\n');
        }
        return out.toString();
    }

    /**
     * The run's options, from {@code build.gradle}'s {@code -P} properties.
     *
     * @param games    games at each table size.
     * @param liberals the level of the bots dealt liberal.
     * @param fascists the level of the bots dealt fascist or Hitler.
     * @param ladder   whether to play the ladder's pairings instead of one.
     */
    public record Options(int games, BotSkill liberals, BotSkill fascists, boolean ladder) {

        /**
         * Reads the arguments {@code build.gradle} passes: {@code --games=N} (N a whole number of at
         * least 1, {@link #DEFAULT_GAMES} without it), {@code --liberals=LEVEL} and
         * {@code --fascists=LEVEL} (a level's name in any case, {@code NORMAL} without it) and
         * {@code --ladder}, which plays its own pairings and so takes no level.
         *
         * @throws IllegalArgumentException for any other argument, saying what was wrong.
         */
        public static Options parse(String... args) {
            int games = DEFAULT_GAMES;
            BotSkill liberals = BotSkill.NORMAL;
            BotSkill fascists = BotSkill.NORMAL;
            boolean levelGiven = false;
            boolean ladder = false;
            for (String arg : args) {
                if (arg.startsWith(GAMES_OPTION)) {
                    games = wholeNumber(arg.substring(GAMES_OPTION.length()));
                } else if (arg.startsWith(LIBERALS_OPTION)) {
                    liberals = level(arg.substring(LIBERALS_OPTION.length()));
                    levelGiven = true;
                } else if (arg.startsWith(FASCISTS_OPTION)) {
                    fascists = level(arg.substring(FASCISTS_OPTION.length()));
                    levelGiven = true;
                } else if (arg.equals(LADDER_OPTION)) {
                    ladder = true;
                } else {
                    throw new IllegalArgumentException("Unknown option \"" + arg + "\". botMatches takes -Pgames=N, "
                            + "-Pliberals=LEVEL, -Pfascists=LEVEL and -Pladder.");
                }
            }
            if (ladder && levelGiven) {
                throw new IllegalArgumentException(
                        "-Pladder plays its own pairings: leave out -Pliberals and -Pfascists.");
            }
            return new Options(games, liberals, fascists, ladder);
        }

        private static BotSkill level(String value) {
            for (BotSkill skill : BotSkill.values()) {
                if (skill.name().equalsIgnoreCase(value)) {
                    return skill;
                }
            }
            throw new IllegalArgumentException("Unknown level \"" + value + "\": use EASY, NORMAL or HARD.");
        }

        private static int wholeNumber(String value) {
            int games = 0;
            if (value.matches("[0-9]{1,9}")) {
                games = Integer.parseInt(value);
            }
            if (games < 1) {
                throw new IllegalArgumentException(
                        "-Pgames must be a whole number of at least 1, not \"" + value + "\".");
            }
            return games;
        }
    }

    /**
     * Plays the run and prints its table, or with {@code --ladder} the ladder's report; a refused
     * option prints why and exits with status 2.
     */
    public static void main(String[] args) {
        Options options;
        try {
            options = Options.parse(args);
        } catch (IllegalArgumentException e) {
            System.err.println(e.getMessage());
            System.exit(2);
            return;
        }
        if (options.ladder()) {
            System.out.print(ladderReport(ladder(options.games())));
        } else {
            System.out.print(playAt(options.games(), options.liberals(), options.fascists()).table());
        }
    }
}
