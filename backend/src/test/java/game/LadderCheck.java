package game;

import game.BotMatches.Interval;
import game.BotMatches.Results;
import game.BotMatches.Tally;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.StringJoiner;

/**
 * How {@code botMatches -Pladder} reads its pairings (the bot skill design's "The ladder check"
 * and "The balance check"). A side's level clears the one below it when, against Normal
 * opponents, the two pooled win rates' 95% intervals do not overlap, the higher level's above,
 * and at no table size does the higher level's interval lie wholly below the lower's. The balance
 * holds when all-Hard and all-Normal games' pooled liberal rates are at most
 * {@link #BALANCE_BAND} points apart.
 */
final class LadderCheck {
    /** Most percentage points between the all-Hard and all-Normal pooled liberal rates. */
    static final int BALANCE_BAND = 10;

    /**
     * Phase 25D's tuning target for the balance, in percentage points: a full run aims within it,
     * so the acceptance's {@link #BALANCE_BAND} leaves room for chance.
     */
    static final int TUNING_BAND = 8;

    /** The levels of the bots dealt liberal and of those dealt fascist or Hitler. */
    record Pairing(BotSkill liberals, BotSkill fascists) {
        /** {@code E/N}: the liberals' level, then the fascists', by first letter. */
        String label() {
            return liberals.name().charAt(0) + "/" + fascists.name().charAt(0);
        }
    }

    /** The pairings {@code -Pladder} plays, in the order it prints them. */
    static final List<Pairing> PAIRINGS = List.of(
            new Pairing(BotSkill.EASY, BotSkill.NORMAL),
            new Pairing(BotSkill.NORMAL, BotSkill.NORMAL),
            new Pairing(BotSkill.HARD, BotSkill.NORMAL),
            new Pairing(BotSkill.NORMAL, BotSkill.EASY),
            new Pairing(BotSkill.NORMAL, BotSkill.HARD),
            new Pairing(BotSkill.EASY, BotSkill.EASY),
            new Pairing(BotSkill.HARD, BotSkill.HARD));

    /** A side of the table. */
    enum Side {
        LIBERAL("Liberal side"), FASCIST("Fascist side");

        private final String words;

        Side(String words) {
            this.words = words;
        }
    }

    private LadderCheck() {
    }

    /** The games {@code side} won. */
    static int wins(Side side, Tally tally) {
        return side == Side.LIBERAL ? tally.liberalWins() : tally.games() - tally.liberalWins();
    }

    /** {@code side}'s win rate's 95% interval. */
    static Interval interval(Side side, Tally tally) {
        return BotMatches.interval(wins(side, tally), tally.games());
    }

    /** Whether {@code higher} lies wholly above {@code lower}: the two intervals do not overlap. */
    static boolean clearlyAbove(Interval higher, Interval lower) {
        return lower.high() < higher.low();
    }

    /**
     * One step of the ladder: {@code side} at {@code lower} and at {@code higher}, against Normal.
     *
     * @param pooledClears  whether the higher level's pooled interval lies wholly above the lower's.
     * @param invertedSizes the table sizes where the higher level's interval lies wholly below the
     *                      lower's, ascending.
     */
    record Step(Side side, BotSkill lower, BotSkill higher, boolean pooledClears, List<Integer> invertedSizes) {
        /** Whether the step holds: its pooled rates clear and no size is inverted. */
        boolean passes() {
            return pooledClears && invertedSizes.isEmpty();
        }

        /** {@code Liberal side, Easy < Normal}. */
        String name() {
            return side.words + ", " + word(lower) + " < " + word(higher);
        }
    }

    /** The pairing that has {@code side} at {@code level} and the other side Normal. */
    private static Pairing against(Side side, BotSkill level) {
        return side == Side.LIBERAL ? new Pairing(level, BotSkill.NORMAL) : new Pairing(BotSkill.NORMAL, level);
    }

    private static Results resultsOf(Map<Pairing, Results> results, Pairing pairing) {
        Results found = results.get(pairing);
        if (found == null) {
            throw new IllegalArgumentException("The pairings have no " + pairing.label() + ".");
        }
        return found;
    }

    /** {@code side}'s step from {@code lower} to {@code higher}, each against Normal opponents. */
    static Step step(Side side, BotSkill lower, BotSkill higher, Map<Pairing, Results> results) {
        Results low = resultsOf(results, against(side, lower));
        Results high = resultsOf(results, against(side, higher));
        boolean pooledClears = clearlyAbove(interval(side, high.pooled()), interval(side, low.pooled()));
        List<Integer> inverted = new ArrayList<>();
        for (Map.Entry<Integer, Tally> size : low.bySize().entrySet()) {
            Tally higherAtSize = high.bySize().get(size.getKey());
            if (higherAtSize != null && clearlyAbove(interval(side, size.getValue()), interval(side, higherAtSize))) {
                inverted.add(size.getKey());
            }
        }
        return new Step(side, lower, higher, pooledClears, List.copyOf(inverted));
    }

    /**
     * The ladder's six steps: the liberal side's Easy < Normal, Normal < Hard and Easy < Hard, then
     * the fascist side's. Easy < Hard's pooled part follows from the other two; its sizes catch an
     * Easy clearly above Hard where Normal overlaps both, which the spec's per-size rule (any
     * higher level) forbids.
     */
    static List<Step> ladder(Map<Pairing, Results> results) {
        List<Step> steps = new ArrayList<>();
        for (Side side : Side.values()) {
            steps.add(step(side, BotSkill.EASY, BotSkill.NORMAL, results));
            steps.add(step(side, BotSkill.NORMAL, BotSkill.HARD, results));
            steps.add(step(side, BotSkill.EASY, BotSkill.HARD, results));
        }
        return steps;
    }

    /**
     * Whether all-Hard and all-Normal games' pooled liberal rates are at most {@link #BALANCE_BAND}
     * points apart, compared in whole numbers.
     */
    static boolean balanced(Map<Pairing, Results> results) {
        return withinPoints(results, BALANCE_BAND);
    }

    /**
     * Whether all-Hard and all-Normal games' pooled liberal rates are at most {@code points}
     * percentage points apart, compared in whole numbers.
     */
    private static boolean withinPoints(Map<Pairing, Results> results, int points) {
        Tally hard = resultsOf(results, new Pairing(BotSkill.HARD, BotSkill.HARD)).pooled();
        Tally normal = resultsOf(results, new Pairing(BotSkill.NORMAL, BotSkill.NORMAL)).pooled();
        long hardWins = hard.liberalWins();
        long hardGames = hard.games();
        long normalWins = normal.liberalWins();
        long normalGames = normal.games();
        return 100 * Math.abs(hardWins * normalGames - normalWins * hardGames)
                <= points * hardGames * normalGames;
    }

    /**
     * The two verdicts as lines: {@code Ladder check: PASS} or {@code FAIL (…)} naming each failing
     * step and why, a line per step, then {@code Balance check: PASS} or {@code FAIL} with both
     * rates, and {@code Balance target: PASS} or {@code FAIL} with the points between them against
     * {@link #TUNING_BAND}. Each line ends in a newline.
     */
    static String verdicts(Map<Pairing, Results> results) {
        List<Step> steps = ladder(results);
        StringJoiner failures = new StringJoiner("; ");
        StringBuilder lines = new StringBuilder();
        for (Step step : steps) {
            Tally low = resultsOf(results, against(step.side(), step.lower())).pooled();
            Tally high = resultsOf(results, against(step.side(), step.higher())).pooled();
            String pooled;
            if (step.pooledClears()) {
                pooled = "clears";
            } else if (clearlyAbove(interval(step.side(), low), interval(step.side(), high))) {
                pooled = "inverted";
            } else {
                pooled = "overlaps";
            }
            lines.append("  ").append(step.name()).append(": ").append(rate(wins(step.side(), low), low.games()))
                    .append(" vs ").append(rate(wins(step.side(), high), high.games())).append(" pooled, ")
                    .append(pooled).append("; sizes inverted: ").append(sizes(step.invertedSizes())).append('\n');
            if (!step.passes()) {
                List<String> why = new ArrayList<>();
                if (!step.pooledClears()) {
                    why.add("pooled " + pooled);
                }
                if (!step.invertedSizes().isEmpty()) {
                    why.add((step.invertedSizes().size() == 1 ? "size " : "sizes ") + sizes(step.invertedSizes())
                            + " inverted");
                }
                failures.add(step.name() + ": " + String.join(", ", why));
            }
        }
        Tally hard = resultsOf(results, new Pairing(BotSkill.HARD, BotSkill.HARD)).pooled();
        Tally normal = resultsOf(results, new Pairing(BotSkill.NORMAL, BotSkill.NORMAL)).pooled();
        return (failures.length() == 0 ? "Ladder check: PASS" : "Ladder check: FAIL (" + failures + ")") + "\n"
                + lines
                + "Balance check: " + (balanced(results) ? "PASS" : "FAIL") + " (all-Hard "
                + percent(hard.liberalWins(), hard.games()) + ", all-Normal "
                + percent(normal.liberalWins(), normal.games()) + ", band " + BALANCE_BAND + " points)\n"
                + "Balance target: " + (withinPoints(results, TUNING_BAND) ? "PASS" : "FAIL") + " ("
                + tenthsUp(hard, normal) + " points apart, target " + TUNING_BAND + ")\n";
    }

    /**
     * The points between two tallies' liberal rates, rounded up to a tenth in whole numbers, so
     * the printed gap is at most a band exactly when {@link #withinPoints} holds.
     */
    private static String tenthsUp(Tally a, Tally b) {
        long gap = 1000 * Math.abs((long) a.liberalWins() * b.games() - (long) b.liberalWins() * a.games());
        long denominator = (long) a.games() * b.games();
        long tenths = (gap + denominator - 1) / denominator;
        return (tenths / 10) + "." + (tenths % 10);
    }

    /** A rate and its interval, as the run's tables write them: {@code 35.2% 34.3-36.1%}. */
    static String rate(int wins, int games) {
        Interval interval = BotMatches.interval(wins, games);
        return percent(wins, games) + " "
                + String.format(Locale.ROOT, "%.1f-%.1f%%", 100 * interval.low(), 100 * interval.high());
    }

    private static String percent(int count, int games) {
        return String.format(Locale.ROOT, "%.1f%%", 100.0 * count / games);
    }

    private static String sizes(List<Integer> sizes) {
        if (sizes.isEmpty()) {
            return "none";
        }
        StringJoiner out = new StringJoiner(", ");
        for (int size : sizes) {
            out.add(Integer.toString(size));
        }
        return out.toString();
    }

    /** {@code Easy}, {@code Normal} or {@code Hard}. */
    private static String word(BotSkill skill) {
        String name = skill.name();
        return name.charAt(0) + name.substring(1).toLowerCase(Locale.ROOT);
    }
}
