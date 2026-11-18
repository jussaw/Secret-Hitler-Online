package game;

import game.datastructures.Identity;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.SortedMap;
import java.util.TreeMap;
import java.util.function.BiFunction;
import server.stats.CpuGames;

/**
 * The bots' self-play run ({@code ./gradlew botMatches}): plays games with a bot in every seat at
 * each table size from 5 to 10, through {@link CpuGames}, and prints how often each side wins and
 * how the games ended. The deck cannot be seeded, so every run differs: the 95% intervals say how
 * far a difference can be trusted.
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

    /** The bots as they are built, whatever their seat's role. */
    public static final BiFunction<String, Identity, CpuPlayer> BOTS_AS_BUILT = (name, role) -> new CpuPlayer(name);
    public static final String BOTS_AS_BUILT_LABEL = "Bots as built";

    private static final double Z = 1.96; // a 95% interval

    private static final String GAMES_OPTION = "--games=";

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

    /** The run's options, from {@code build.gradle}'s {@code -P} properties. */
    public record Options(int games) {

        /**
         * Reads the arguments {@code build.gradle} passes: none gives {@link #DEFAULT_GAMES} games a
         * size, and {@code --games=N} gives N, a whole number of at least 1.
         *
         * @throws IllegalArgumentException for any other argument, saying what was wrong.
         */
        public static Options parse(String... args) {
            int games = DEFAULT_GAMES;
            for (String arg : args) {
                if (!arg.startsWith(GAMES_OPTION)) {
                    throw new IllegalArgumentException("Unknown option \"" + arg + "\". botMatches takes -Pgames=N.");
                }
                games = wholeNumber(arg.substring(GAMES_OPTION.length()));
            }
            return new Options(games);
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

    /** Plays the run and prints its table; a refused option prints why and exits with status 2. */
    public static void main(String[] args) {
        Options options;
        try {
            options = Options.parse(args);
        } catch (IllegalArgumentException e) {
            System.err.println(e.getMessage());
            System.exit(2);
            return;
        }
        System.out.print(play(options.games(), BOTS_AS_BUILT_LABEL, BOTS_AS_BUILT).table());
    }
}
