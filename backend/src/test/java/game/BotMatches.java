package game;

import game.datastructures.Identity;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
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
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import server.stats.CpuGames;

/**
 * The bots' self-play run ({@code ./gradlew botMatches}): plays games with a bot in every seat at
 * each table size from 5 to 10, through {@link CpuGames}, and prints how often each side wins and
 * how the games ended. The bots dealt liberal play at one level and those dealt fascist or Hitler
 * at another ({@code -Pliberals}, {@code -Pfascists}), and {@code -Pladder} plays the pairings
 * {@link LadderCheck} reads. The deck cannot be seeded, so every run differs: the 95% intervals
 * say how far a difference can be trusted. A ladder report ends with its raw tallies, which
 * {@code -Ppool} reads back from two reports to judge both runs' games together.
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
    private static final String POOL_OPTION = "--pool=";

    private static final String POOL_USAGE = "-Ppool takes two ladder reports: -Ppool=<file>,<file>.";

    /** Why {@link #pool} refuses two runs. */
    private static final String RUNS_DO_NOT_MATCH = "The two runs do not match.";

    /** The tally block's first line: {@code Tallies: 2000 games at each table size}. */
    private static final Pattern TALLIES_HEADER = Pattern.compile("Tallies: ([0-9]{1,9}) games at each table size");

    /** A tally block's line: the pairing's label, the seats, then each ending's count in {@link #ENDINGS}' order. */
    private static final Pattern TALLIES_LINE =
            Pattern.compile("(\\S+) ([0-9]{1,2})" + " ([0-9]{1,9})".repeat(ENDINGS.size()));

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
     * verdicts, each pairing's own table, then the tally block {@link #readTallies} reads back:
     * {@code Tallies: N games at each table size}, then a line per pairing and size, {@code E/N 5}
     * and each ending's count in {@link #ENDINGS}' order. Each line ends in a newline.
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
        out.append('\n').append(String.format(Locale.ROOT, "Tallies: %d games at each table size",
                first.gamesPerSize())).append('\n');
        results.forEach((pairing, run) -> run.bySize().forEach((seats, tally) -> {
            out.append(pairing.label()).append(' ').append(seats);
            for (GameState ending : ENDINGS) {
                out.append(' ').append(tally.count(ending));
            }
            out.append('\n');
        }));
        return out.toString();
    }

    /**
     * A ladder report's tally block read back: each pairing's tallies by size, in
     * {@link LadderCheck#PAIRINGS}' order, each labelled as {@link #label} names it, with the
     * block's games a size. Blank lines are skipped.
     *
     * @throws IllegalArgumentException {@code No tally block in the report.} without one, or naming
     *                                  the first line of the block it cannot read: not a known
     *                                  pairing, a size and four counts, counts that do not add up
     *                                  to the block's games, or a pairing's size a second time.
     */
    static Map<LadderCheck.Pairing, Results> readTallies(List<String> reportLines) {
        int start = -1;
        int gamesPerSize = 0;
        for (int i = 0; i < reportLines.size() && start < 0; i++) {
            Matcher header = TALLIES_HEADER.matcher(reportLines.get(i));
            if (header.matches()) {
                start = i + 1;
                gamesPerSize = Integer.parseInt(header.group(1));
            }
        }
        if (start < 0) {
            throw new IllegalArgumentException("No tally block in the report.");
        }
        Map<String, LadderCheck.Pairing> byLabel = new LinkedHashMap<>();
        Map<LadderCheck.Pairing, SortedMap<Integer, Tally>> read = new LinkedHashMap<>();
        for (LadderCheck.Pairing pairing : LadderCheck.PAIRINGS) {
            byLabel.put(pairing.label(), pairing);
        }
        for (String line : reportLines.subList(start, reportLines.size())) {
            if (line.isBlank()) {
                continue;
            }
            Matcher cells = TALLIES_LINE.matcher(line);
            LadderCheck.Pairing pairing = cells.matches() ? byLabel.get(cells.group(1)) : null;
            if (pairing == null) {
                throw unreadable(line);
            }
            int seats = Integer.parseInt(cells.group(2));
            Tally tally = new Tally();
            for (int i = 0; i < ENDINGS.size(); i++) {
                for (int count = Integer.parseInt(cells.group(3 + i)); count > 0; count--) {
                    tally.add(ENDINGS.get(i));
                }
            }
            SortedMap<Integer, Tally> bySize = read.computeIfAbsent(pairing, p -> new TreeMap<>());
            if (tally.games() != gamesPerSize || bySize.containsKey(seats)) {
                throw unreadable(line);
            }
            bySize.put(seats, tally);
        }
        Map<LadderCheck.Pairing, Results> results = new LinkedHashMap<>();
        for (LadderCheck.Pairing pairing : LadderCheck.PAIRINGS) {
            SortedMap<Integer, Tally> bySize = read.get(pairing);
            if (bySize != null) {
                results.put(pairing, new Results(label(pairing.liberals(), pairing.fascists()), gamesPerSize,
                        Collections.unmodifiableSortedMap(bySize)));
            }
        }
        return results;
    }

    private static IllegalArgumentException unreadable(String line) {
        return new IllegalArgumentException("Cannot read the tally line \"" + line + "\".");
    }

    /**
     * Two runs' games together: each pairing's tallies at each size added ({@link Tally#pooled}),
     * in {@code a}'s order, labelled as {@link #label} names it then {@code , pooled}, with the two
     * runs' games a size summed.
     *
     * @throws IllegalArgumentException {@code The two runs do not match.} unless both have the same
     *                                  pairings and, for each, the same sizes; and when every
     *                                  tally is the same in both (one run's report given twice,
     *                                  which would count its games twice).
     */
    static Map<LadderCheck.Pairing, Results> pool(Map<LadderCheck.Pairing, Results> a,
            Map<LadderCheck.Pairing, Results> b) {
        if (!a.keySet().equals(b.keySet())) {
            throw new IllegalArgumentException(RUNS_DO_NOT_MATCH);
        }
        Map<LadderCheck.Pairing, Results> pooled = new LinkedHashMap<>();
        boolean same = true;
        for (Map.Entry<LadderCheck.Pairing, Results> entry : a.entrySet()) {
            LadderCheck.Pairing pairing = entry.getKey();
            Results first = entry.getValue();
            Results second = b.get(pairing);
            if (!first.bySize().keySet().equals(second.bySize().keySet())) {
                throw new IllegalArgumentException(RUNS_DO_NOT_MATCH);
            }
            SortedMap<Integer, Tally> bySize = new TreeMap<>();
            for (Map.Entry<Integer, Tally> size : first.bySize().entrySet()) {
                Tally other = second.bySize().get(size.getKey());
                same &= size.getValue().counts.equals(other.counts);
                bySize.put(size.getKey(), Tally.pooled(List.of(size.getValue(), other)));
            }
            pooled.put(pairing, new Results(label(pairing.liberals(), pairing.fascists()) + ", pooled",
                    first.gamesPerSize() + second.gamesPerSize(), Collections.unmodifiableSortedMap(bySize)));
        }
        if (same) {
            throw new IllegalArgumentException("The two reports hold the same games: pool two separate runs.");
        }
        return pooled;
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
     * @param pool     two ladder reports whose tallies to pool instead of playing, or none.
     */
    public record Options(int games, BotSkill liberals, BotSkill fascists, boolean ladder, List<String> pool) {

        /**
         * Reads the arguments {@code build.gradle} passes: {@code --games=N} (N a whole number of at
         * least 1, {@link #DEFAULT_GAMES} without it), {@code --liberals=LEVEL} and
         * {@code --fascists=LEVEL} (a level's name in any case, {@code NORMAL} without it) and
         * {@code --ladder}, which plays its own pairings and so takes no level; or
         * {@code --pool=<file>,<file>} alone, two ladder reports to pool, which plays nothing.
         *
         * @throws IllegalArgumentException for any other argument, saying what was wrong.
         */
        public static Options parse(String... args) {
            int games = DEFAULT_GAMES;
            BotSkill liberals = BotSkill.NORMAL;
            BotSkill fascists = BotSkill.NORMAL;
            boolean levelGiven = false;
            boolean ladder = false;
            List<String> pool = List.of();
            for (String arg : args) {
                if (arg.startsWith(POOL_OPTION)) {
                    String[] files = arg.substring(POOL_OPTION.length()).split(",", -1);
                    if (args.length != 1 || files.length != 2 || files[0].isEmpty() || files[1].isEmpty()) {
                        throw new IllegalArgumentException(POOL_USAGE);
                    }
                    pool = List.of(files[0], files[1]);
                } else if (arg.startsWith(GAMES_OPTION)) {
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
                            + "-Pliberals=LEVEL, -Pfascists=LEVEL, -Pladder and -Ppool=<file>,<file>.");
                }
            }
            if (ladder && levelGiven) {
                throw new IllegalArgumentException(
                        "-Pladder plays its own pairings: leave out -Pliberals and -Pfascists.");
            }
            return new Options(games, liberals, fascists, ladder, pool);
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
     * Plays the run and prints its table, or with {@code --ladder} the ladder's report, or with
     * {@code --pool} the ladder's report of two reports' games together; a refused option, or a
     * report it cannot read or pool, prints why and exits with status 2.
     */
    public static void main(String[] args) {
        Options options;
        try {
            options = Options.parse(args);
            if (!options.pool().isEmpty()) {
                System.out.print(ladderReport(pool(readReport(options.pool().get(0)),
                        readReport(options.pool().get(1)))));
                return;
            }
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

    /** The tallies of the ladder report in {@code file}, read back. */
    private static Map<LadderCheck.Pairing, Results> readReport(String file) {
        try {
            return readTallies(Files.readAllLines(Path.of(file)));
        } catch (NoSuchFileException e) {
            throw new IllegalArgumentException("Cannot read the ladder report " + file + ": there is no such file.", e);
        } catch (IOException e) {
            throw new IllegalArgumentException("Cannot read the ladder report " + file + ": " + e.getMessage(), e);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(file + ": " + e.getMessage(), e);
        }
    }
}
