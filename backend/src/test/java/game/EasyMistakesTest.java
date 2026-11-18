package game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import game.BotScenes.Scene;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Consumer;
import java.util.function.Supplier;
import org.junit.Test;

/**
 * Easy's mistakes: at each decision kind an Easy bot makes a uniformly random legal move at about
 * {@link CpuPlayer#EASY_MISTAKE_CHANCE} of its decisions, and otherwise decides as Normal does;
 * it never makes an illegal move, and never one that throws the game for its own side.
 */
public class EasyMistakesTest {
    private static final int TRIALS = 10_000;

    /** What a bot of {@code skill} does in a fresh {@code scene} at each of the trial seeds. */
    private static Map<String, Integer> outcomes(Supplier<Scene> scene, Consumer<CpuPlayer> setUp, BotSkill skill,
            int trials) {
        Map<String, Integer> counts = new TreeMap<>();
        for (int i = 0; i < trials; i++) {
            Scene s = scene.get();
            CpuPlayer bot = BotScenes.bot(s, skill, i);
            setUp.accept(bot);
            GameState before = s.game().getState();
            boolean acted;
            try {
                acted = bot.act(s.game());
            } catch (RuntimeException e) {
                throw new AssertionError("The " + skill + " bot threw at seed " + i + ": " + e, e);
            }
            counts.merge(Decision.of(before, acted, s.game(), s.bot()), 1, Integer::sum);
        }
        return counts;
    }

    private static int countIn(List<String> moves, String move) {
        int count = 0;
        for (String m : moves) {
            if (m.equals(move)) {
                count++;
            }
        }
        return count;
    }

    /**
     * Normal's and Easy's moves are all in {@code legal} (one entry per legal move), and each
     * move's share at Easy is within four standard deviations (and 0.002) of
     * {@code (1 - c)·p + c·k/n}: Normal's share {@code p} when the coin says no, and its
     * {@code k} places among the {@code n} legal moves when it says yes.
     */
    private static void assertMistakes(Supplier<Scene> scene, Consumer<CpuPlayer> setUp, List<String> legal) {
        Map<String, Integer> normal = outcomes(scene, setUp, BotSkill.NORMAL, TRIALS);
        Map<String, Integer> easy = outcomes(scene, setUp, BotSkill.EASY, TRIALS);
        for (String move : normal.keySet()) {
            assertTrue("Normal made the illegal move \"" + move + "\": " + normal, legal.contains(move));
        }
        for (String move : easy.keySet()) {
            assertTrue("Easy made the illegal move \"" + move + "\": " + easy, legal.contains(move));
        }
        double c = CpuPlayer.EASY_MISTAKE_CHANCE;
        int n = legal.size();
        for (String move : distinct(legal)) {
            double p = normal.getOrDefault(move, 0) / (double) TRIALS;
            double e = (1 - c) * p + c * countIn(legal, move) / n;
            double actual = easy.getOrDefault(move, 0) / (double) TRIALS;
            double tolerance = 4 * Math.sqrt(e * (1 - e) / TRIALS + (1 - c) * (1 - c) * p * (1 - p) / TRIALS) + 0.002;
            assertEquals("Easy's share of \"" + move + "\" (Normal " + normal + ", Easy " + easy + ")", e, actual,
                    tolerance);
        }
    }

    private static List<String> distinct(List<String> moves) {
        List<String> distinct = new ArrayList<>();
        for (String move : moves) {
            if (!distinct.contains(move)) {
                distinct.add(move);
            }
        }
        return distinct;
    }

    /** Sets each named seat's score, and every other seat but the bot's to {@code others}. */
    private static Consumer<CpuPlayer> scores(int others, Object... seatsAndScores) {
        return bot -> {
            for (String seat : new ArrayList<>(bot.playerReputation.keySet())) {
                if (!seat.equals(bot.myName)) {
                    bot.playerReputation.put(seat, others);
                }
            }
            for (int i = 0; i < seatsAndScores.length; i += 2) {
                bot.playerReputation.put((String) seatsAndScores[i], (Integer) seatsAndScores[i + 1]);
            }
        };
    }

    private static final Consumer<CpuPlayer> NO_SCORES = bot -> {
    };

    @Test
    public void nominations() {
        assertMistakes(() -> BotScenes.nomination("LLLFH"), scores(0, "P0", 5, "P3", -5, "P4", -5),
                List.of("nominate P0", "nominate P3", "nominate P4"));
    }

    @Test
    public void nominationsAtSeven() {
        assertMistakes(() -> BotScenes.nomination("LFLLLFH"), NO_SCORES,
                List.of("nominate P3", "nominate P4", "nominate P5", "nominate P6"));
    }

    @Test
    public void votes() {
        assertMistakes(() -> BotScenes.vote("LLLFH"), scores(0, "P0", 5, "P1", 5), List.of("vote ja", "vote nein"));
    }

    @Test
    public void presidentsDiscards() {
        assertMistakes(() -> BotScenes.presidentsHand("LLLFH", "FFL"), NO_SCORES,
                List.of("pass FL", "pass FL", "pass FF"));
    }

    @Test
    public void chancellorsChoices() {
        assertMistakes(() -> BotScenes.chancellorsHand("LLLFH", "FL", "F", 0), NO_SCORES,
                List.of("enact L", "enact F"));
    }

    @Test
    public void vetoRequests() {
        assertMistakes(() -> BotScenes.chancellorsHand("LLLFH", "FF", "F", 5), NO_SCORES,
                List.of("veto", "enact F", "enact F"));
    }

    @Test
    public void vetoAnswers() {
        assertMistakes(() -> BotScenes.vetoAnswer("LLLFH"), NO_SCORES, List.of("accept veto", "refuse veto"));
    }

    @Test
    public void investigations() {
        assertMistakes(() -> BotScenes.power("LLLLLFFFH", 1, ""), scores(5, "P5", -5),
                List.of("investigate P5", "investigate P1", "investigate P2", "investigate P3", "investigate P4",
                        "investigate P6", "investigate P7", "investigate P8"));
    }

    @Test
    public void specialElections() {
        assertMistakes(() -> BotScenes.power("LLLLFFH", 3, ""), scores(-5, "P3", 5),
                List.of("elect P3", "elect P1", "elect P2", "elect P4", "elect P5", "elect P6"));
    }

    @Test
    public void executions() {
        assertMistakes(() -> BotScenes.power("LLLFH", 4, ""), scores(5, "P3", -5),
                List.of("execute P3", "execute P1", "execute P2", "execute P4"));
    }

    @Test
    public void easyNeverExecutesAKnownTeammate() {
        Map<String, Integer> byAFascist = outcomes(() -> BotScenes.power("FLLLLFH", 4, ""), NO_SCORES, BotSkill.EASY,
                TRIALS);
        assertEquals(Map.of("execute P1", byAFascist.get("execute P1"), "execute P2", byAFascist.get("execute P2"),
                "execute P3", byAFascist.get("execute P3"), "execute P4", byAFascist.get("execute P4")), byAFascist);
        for (String seat : List.of("P1", "P2", "P3", "P4")) {
            assertTrue(seat + " was executed at least once: " + byAFascist, byAFascist.get("execute " + seat) > 0);
        }

        Map<String, Integer> byHitler = outcomes(() -> BotScenes.power("HLLLF", 4, ""), NO_SCORES, BotSkill.EASY,
                TRIALS);
        assertFalse("Hitler at five executed its fascist: " + byHitler, byHitler.containsKey("execute P4"));
    }

    @Test
    public void easyMakesTheOnlyLegalMove() {
        Supplier<Scene> onlyP4 = () -> {
            Scene scene = BotScenes.nomination("LLLFH");
            scene.game().getPlayer("P0").kill();
            scene.game().getPlayer("P3").kill();
            return scene;
        };
        assertEquals(Map.of("nominate P4", 1_000), outcomes(onlyP4, NO_SCORES, BotSkill.EASY, 1_000));
    }

    @Test
    public void easyEndsItsTermAsEveryBotDoes() {
        for (int i = 0; i < 1_000; i++) {
            Scene scene = BotScenes.power("LLLFH", 3, "");
            CpuPlayer bot = BotScenes.bot(scene, BotSkill.EASY, i);
            GameState before = scene.game().getState();
            assertEquals("peek", Decision.of(before, bot.act(scene.game()), scene.game(), scene.bot()));
            before = scene.game().getState();
            assertEquals("end term", Decision.of(before, bot.act(scene.game()), scene.game(), scene.bot()));
        }
    }
}
