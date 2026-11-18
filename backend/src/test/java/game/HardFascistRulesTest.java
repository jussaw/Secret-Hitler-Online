package game;

import static org.junit.Assert.assertEquals;

import game.BotScenes.Scene;
import java.util.function.Consumer;
import java.util.function.Supplier;
import org.junit.Test;

/**
 * Phase 25D's extra fascist-side rules (the bot skill design's "Hard's rules", its paragraph on
 * rules for the fascist side beyond the seven), each Hard only, each reading only what a fascist's
 * role shows it. Rule 9, special elections to the side: a Hard fascist president with the special
 * election hands the presidency to a living fascist teammate other than Hitler, with
 * {@link CpuPlayer#SIDE_ELECTION_CHANCE}, when it has one. Each scene is made fresh for each seed,
 * and the amounts are read by name.
 */
public class HardFascistRulesTest {
    private static final double SHARE_TOLERANCE = 0.03;
    private static final int SEEDS = 4_000;

    /** The share of seeds 0 to {@code seeds - 1} at which the bot of a fresh {@code scene} decides {@code decision}. */
    private static double share(Supplier<Scene> scene, BotSkill skill, String decision, int seeds) {
        int count = 0;
        for (long seed = 0; seed < seeds; seed++) {
            if (decision(scene, skill, seed).equals(decision)) {
                count++;
            }
        }
        return (double) count / seeds;
    }

    /** What the bot of a fresh {@code scene} at {@code skill}, seeded {@code seed}, decides. */
    private static String decision(Supplier<Scene> scene, BotSkill skill, long seed) {
        Scene s = scene.get();
        CpuPlayer bot = BotScenes.bot(s, skill, seed);
        GameState before = s.game().getState();
        boolean acted = bot.act(s.game());
        return Decision.of(before, acted, s.game(), s.bot());
    }

    /** {@code scene}, then {@code change} on its game. */
    private static Supplier<Scene> with(Supplier<Scene> scene, Consumer<SecretHitlerGame> change) {
        return () -> {
            Scene s = scene.get();
            change.accept(s.game());
            return s;
        };
    }

    /** Fails unless the bot of {@code scene} decides at Hard exactly as at Normal, seed by seed. */
    private static void decidesAsNormal(Supplier<Scene> scene, int seeds) {
        for (long seed = 0; seed < seeds; seed++) {
            assertEquals("seed " + seed, decision(scene, BotSkill.NORMAL, seed), decision(scene, BotSkill.HARD, seed));
        }
    }

    // Rule 9: special elections to the side.

    /** The fascist P0 holds the special election at 7 seats; P5 is its fascist teammate, P6 Hitler. */
    private static final Supplier<Scene> FASCIST_ELECTS = () -> BotScenes.power("FLLLLFH", 3, "");

    @Test
    public void aFascistUsuallyHandsTheSpecialElectionToATeammate() {
        double normal = share(FASCIST_ELECTS, BotSkill.NORMAL, "elect P5", SEEDS);
        assertEquals("Normal's weights: P5 of 1 + 1 + 4 x 0.5", 0.25, normal, SHARE_TOLERANCE);
        double chance = CpuPlayer.SIDE_ELECTION_CHANCE;
        assertEquals(chance + (1 - chance) * normal, share(FASCIST_ELECTS, BotSkill.HARD, "elect P5", SEEDS),
                SHARE_TOLERANCE);
    }

    /** Hitler as president nominates a liberal, so the rule passes him over. */
    @Test
    public void theRuleNeverPicksHitler() {
        double normal = share(FASCIST_ELECTS, BotSkill.NORMAL, "elect P6", SEEDS);
        assertEquals((1 - CpuPlayer.SIDE_ELECTION_CHANCE) * normal,
                share(FASCIST_ELECTS, BotSkill.HARD, "elect P6", SEEDS), SHARE_TOLERANCE);
    }

    /** With the fascist teammate dead, only Hitler is left on its side: Normal's pick, draw for draw. */
    @Test
    public void withNoTeammateButHitlerTheFascistPicksAsNormal() {
        decidesAsNormal(with(FASCIST_ELECTS, g -> g.getPlayer("P5").kill()), 500);
    }

    /** At 9 seats the fascist has two teammates besides Hitler, each as likely. */
    @Test
    public void theTeammatesAreEquallyLikely() {
        Supplier<Scene> nine = () -> BotScenes.power("FLLLLLFFH", 3, "");
        double p6 = share(nine, BotSkill.HARD, "elect P6", SEEDS);
        double p7 = share(nine, BotSkill.HARD, "elect P7", SEEDS);
        assertEquals(p6, p7, 2 * SHARE_TOLERANCE);
        assertEquals(CpuPlayer.SIDE_ELECTION_CHANCE, p6 + p7, 2 * SHARE_TOLERANCE);
    }

    @Test
    public void liberalsAndHitlerElectAsNormal() {
        decidesAsNormal(() -> BotScenes.power("LLLLFFH", 3, ""), 500);
        decidesAsNormal(() -> BotScenes.power("HLLLLFF", 3, ""), 500);
    }

    @Test
    public void normalAndEasyFascistsElectAsBefore() {
        assertEquals(0.25, share(FASCIST_ELECTS, BotSkill.NORMAL, "elect P5", SEEDS), SHARE_TOLERANCE);
        double easy = share(FASCIST_ELECTS, BotSkill.EASY, "elect P5", SEEDS);
        double mistake = CpuPlayer.EASY_MISTAKE_CHANCE;
        assertEquals("Easy: Normal's pick, or any of the six", (1 - mistake) * 0.25 + mistake / 6, easy,
                SHARE_TOLERANCE);
    }
}
