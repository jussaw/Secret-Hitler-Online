package game;

import static org.junit.Assert.assertEquals;

import game.BotScenes.Scene;
import java.util.function.Consumer;
import java.util.function.Supplier;
import org.junit.Test;

/**
 * Hard's rule 7 (the bot skill design's "Fascists bluff"): while fewer than 3 fascist policies and
 * fewer than 4 liberal ones are down, a Hard fascist chancellor holding one of each card under a
 * president it knows is liberal sometimes plays the liberal one, and a Hard fascist president
 * dealt two fascists and a liberal, with a chancellor it knows is liberal, sometimes passes one of
 * each. A teammate in the other office gets no bluff, and Hitler keeps its play. Each scene is
 * made fresh for each seed, and the chances are read by name.
 */
public class HardBluffTest {
    private static final double SHARE_TOLERANCE = 0.03;

    /** The share of seeds 0 to {@code seeds - 1} at which the bot of a fresh {@code scene} decides {@code decision}. */
    private static double share(Supplier<Scene> scene, BotSkill skill, String decision, int seeds) {
        int count = 0;
        for (long seed = 0; seed < seeds; seed++) {
            Scene s = scene.get();
            CpuPlayer bot = BotScenes.bot(s, skill, seed);
            GameState before = s.game().getState();
            boolean acted = bot.act(s.game());
            if (Decision.of(before, acted, s.game(), s.bot()).equals(decision)) {
                count++;
            }
        }
        return (double) count / seeds;
    }

    /** {@code scene}, then {@code change} on its game. */
    private static Supplier<Scene> with(Supplier<Scene> scene, Consumer<SecretHitlerGame> change) {
        return () -> {
            Scene s = scene.get();
            change.accept(s.game());
            return s;
        };
    }

    /** The Hard fascist P1, holding F and L, under the liberal P0. */
    private static final Supplier<Scene> FASCIST_CHANCELLOR = () -> BotScenes.chancellorsHand("LFLLH", "FL", "F", 0);

    /** The Hard fascist P0, dealt FFL, with the liberal P1 elected. */
    private static final Supplier<Scene> FASCIST_PRESIDENT = () -> BotScenes.presidentsHand("FLLLH", "FFL");

    @Test
    public void aFascistChancellorSometimesBluffsALiberalPresident() {
        assertEquals(CpuPlayer.CHANCELLOR_BLUFF_CHANCE, share(FASCIST_CHANCELLOR, BotSkill.HARD, "enact L", 4_000),
                SHARE_TOLERANCE);
    }

    @Test
    public void aFascistChancellorNeverBluffsATeammate() {
        assertEquals("under Hitler", 0, share(() -> BotScenes.chancellorsHand("HFLLL", "FL", "F", 0), BotSkill.HARD,
                "enact L", 500), 0);
        assertEquals("under a fascist at seven", 0, share(() -> BotScenes.chancellorsHand("FFLLLLH", "FL", "F", 0),
                BotSkill.HARD, "enact L", 500), 0);
    }

    @Test
    public void noChancellorBluffFromThreeFascistPolicies() {
        assertEquals(0, share(() -> BotScenes.chancellorsHand("LFLLH", "FL", "F", 3), BotSkill.HARD, "enact L", 500),
                0);
    }

    @Test
    public void aFascistPresidentSometimesPassesOneOfEach() {
        assertEquals(CpuPlayer.PRESIDENT_BLUFF_CHANCE, share(FASCIST_PRESIDENT, BotSkill.HARD, "pass FL", 4_000),
                SHARE_TOLERANCE);
    }

    @Test
    public void aFascistPresidentPassesTwoFascistsToATeammate() {
        assertEquals(0, share(() -> BotScenes.presidentsHand("FHLLL", "FFL"), BotSkill.HARD, "pass FL", 500), 0);
    }

    /** A bluff then could hand the liberals their fifth policy. */
    @Test
    public void noBluffOnceTheLiberalsHaveFour() {
        Consumer<SecretHitlerGame> fourLiberal = g -> BotScenes.board(g, 0, 4);
        assertEquals(0, share(with(FASCIST_CHANCELLOR, fourLiberal), BotSkill.HARD, "enact L", 500), 0);
        assertEquals(0, share(with(FASCIST_PRESIDENT, fourLiberal), BotSkill.HARD, "pass FL", 500), 0);
    }

    /** Easy is Normal plus 25A's coin, which {@code EasyMistakesTest} covers. */
    @Test
    public void normalFascistsNeverBluff() {
        assertEquals(0, share(FASCIST_CHANCELLOR, BotSkill.NORMAL, "enact L", 500), 0);
        assertEquals(0, share(FASCIST_PRESIDENT, BotSkill.NORMAL, "pass FL", 500), 0);
    }

    @Test
    public void hitlerPlaysAsBefore() {
        assertEquals(1, share(() -> BotScenes.chancellorsHand("LHLLF", "FL", "F", 0), BotSkill.HARD, "enact L", 500),
                0);
        assertEquals(2.0 / 3, share(() -> BotScenes.presidentsHand("HLLLF", "FFL"), BotSkill.HARD, "pass FL", 3_000),
                SHARE_TOLERANCE);
    }
}
