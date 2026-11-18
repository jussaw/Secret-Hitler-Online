package game;

import static org.junit.Assert.assertEquals;

import game.BotScenes.Scene;
import game.datastructures.Identity;
import java.util.function.Consumer;
import java.util.function.Supplier;
import org.junit.Test;

/**
 * Phase 25D's extra fascist-side rules (the bot skill design's "Hard's rules", its paragraph on
 * rules for the fascist side beyond the seven), each Hard only, each reading only the roles its
 * seat knows. Rule 8, fascists vote down liberal governments: a Hard bot on the fascist side (a
 * fascist, or Hitler) keeps only {@code 1 -} {@link CpuPlayer#LIBERAL_GOVERNMENT_PULL} of its yes
 * chance for a government whose president and chancellor it knows are liberal. Rule 9, special
 * elections to the side: a Hard fascist president with the special election hands the presidency
 * to a living fascist teammate other than Hitler, with {@link CpuPlayer#SIDE_ELECTION_CHANCE},
 * when it has one. Each scene is made fresh for each seed, and the amounts are read by name.
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

    // Rule 8: fascists vote down liberal governments.

    private static final double TOLERANCE = 1e-6;

    /** The yes chance of the bot of {@code scene}'s voter at {@code skill}. */
    private static float chance(Scene scene, BotSkill skill) {
        return BotScenes.bot(scene, skill, 0).chanceOfYes(scene.game());
    }

    /** The liberal P0 nominates the liberal P1: the fascist P2 votes. */
    @Test
    public void aFascistVotesDownAGovernmentOfTwoLiberals() {
        assertEquals("Normal's mix of two liberals", 0.6, chance(BotScenes.vote("LLFLH"), BotSkill.NORMAL), TOLERANCE);
        assertEquals(0.6 * (1 - CpuPlayer.LIBERAL_GOVERNMENT_PULL), chance(BotScenes.vote("LLFLH"), BotSkill.HARD),
                TOLERANCE);
        Scene inDanger = BotScenes.vote("LLFLH");
        BotScenes.board(inDanger.game(), 0, 4);
        assertEquals("with the liberals one policy from winning", 0.25 * (1 - CpuPlayer.LIBERAL_GOVERNMENT_PULL),
                chance(inDanger, BotSkill.HARD), TOLERANCE);
    }

    /** A government with a member on its side keeps Normal's mix. */
    @Test
    public void aFascistKeepsItsYesForAGovernmentWithItsSide() {
        for (String roles : new String[] {"HLFLL", "LHFLL", "FLFLLLH", "LFFLLLH"}) {
            assertEquals(roles, chance(BotScenes.vote(roles), BotSkill.NORMAL), chance(BotScenes.vote(roles),
                    BotSkill.HARD), TOLERANCE);
        }
    }

    /** A liberal keeps Normal's chance, even for a government it knows is all liberal. */
    @Test
    public void liberalsVoteAsNormal() {
        assertEquals(chance(BotScenes.vote("LLLFH"), BotSkill.NORMAL), chance(BotScenes.vote("LLLFH"), BotSkill.HARD),
                TOLERANCE);
        assertEquals(knowingLiberals("LLLFH", BotSkill.NORMAL), knowingLiberals("LLLFH", BotSkill.HARD), TOLERANCE);
    }

    /** P0 nominates P1 in {@code roles}: P2's yes chance once it knows both are liberal. */
    private static float knowingLiberals(String roles, BotSkill skill) {
        Scene scene = BotScenes.vote(roles);
        CpuPlayer bot = BotScenes.bot(scene, skill, 0);
        bot.knownPlayerRoles.put("P0", Identity.LIBERAL);
        bot.knownPlayerRoles.put("P1", Identity.LIBERAL);
        return bot.chanceOfYes(scene.game());
    }

    /** Hitler at 6, who knows every role too. */
    @Test
    public void hitlerAtSixVotesDownAGovernmentOfTwoLiberals() {
        assertEquals(chance(BotScenes.vote("LLHLLF"), BotSkill.NORMAL) * (1 - CpuPlayer.LIBERAL_GOVERNMENT_PULL),
                chance(BotScenes.vote("LLHLLF"), BotSkill.HARD), TOLERANCE);
    }

    /**
     * Rules 6 and 8 together: two failed elections (P0 nominates P1, then P1 nominates P2, every
     * seat's nein), then P2 nominates P0, and Hitler, P3 at 5 seats, votes on two liberals.
     */
    @Test
    public void hitlerAtTrackerTwoGetsBothPulls() {
        assertEquals(atTrackerTwo(BotSkill.NORMAL) * (1 - CpuPlayer.FASCIST_TRACKER_PULL)
                * (1 - CpuPlayer.LIBERAL_GOVERNMENT_PULL), atTrackerTwo(BotSkill.HARD), TOLERANCE);
    }

    private static float atTrackerTwo(BotSkill skill) {
        SecretHitlerGame game = BotScenes.game("LLLHF");
        BotScenes.Played played = new BotScenes.Played(game, BotScenes.bot(game, "P3", skill, 0));
        for (String chancellor : new String[] {"P1", "P2"}) {
            played.then(g -> g.nominateChancellor(chancellor));
            played.then(g -> BotScenes.voteAll(g, false));
            played.then(SecretHitlerGame::endPresidentialTerm);
        }
        assertEquals(2, game.getElectionTracker());
        played.then(g -> g.nominateChancellor("P0"));
        return played.bot().chanceOfYes(game);
    }

    /** Hitler at 5 or 6 knows every role: on two liberals it keeps a share of its trusting yes. */
    @Test
    public void hitlerAtFiveVotesDownAGovernmentOfTwoLiberals() {
        assertEquals("Normal Hitler trusts two known liberals", 1, chance(BotScenes.vote("LLHLF"), BotSkill.NORMAL),
                TOLERANCE);
        assertEquals(1 - CpuPlayer.LIBERAL_GOVERNMENT_PULL, chance(BotScenes.vote("LLHLF"), BotSkill.HARD), TOLERANCE);
        Scene inDanger = BotScenes.vote("LLHLF");
        BotScenes.board(inDanger.game(), 0, 4);
        assertEquals("voting as fascists do, one policy from losing", 0.25 * (1 - CpuPlayer.LIBERAL_GOVERNMENT_PULL),
                chance(inDanger, BotSkill.HARD), TOLERANCE);
        assertEquals("on its teammate's government", chance(BotScenes.vote("LFHLL"), BotSkill.NORMAL),
                chance(BotScenes.vote("LFHLL"), BotSkill.HARD), TOLERANCE);
    }

    /** Hitler at 7 knows no other role, so the rule reads only the liberals its investigations found. */
    @Test
    public void hitlerAtSevenPullsOnlyOnLiberalsItKnows() {
        assertEquals(chance(BotScenes.vote("LLHLLFF"), BotSkill.NORMAL), chance(BotScenes.vote("LLHLLFF"),
                BotSkill.HARD), TOLERANCE);
        assertEquals("one known liberal is not enough", hitlerAtSeven(BotSkill.NORMAL, "P0"),
                hitlerAtSeven(BotSkill.HARD, "P0"), TOLERANCE);
        assertEquals(hitlerAtSeven(BotSkill.NORMAL, "P0", "P1") * (1 - CpuPlayer.LIBERAL_GOVERNMENT_PULL),
                hitlerAtSeven(BotSkill.HARD, "P0", "P1"), TOLERANCE);
    }

    /** P0 nominates P1 at 7 seats; the yes chance of Hitler, P2, once it knows {@code liberals} are liberal. */
    private static float hitlerAtSeven(BotSkill skill, String... liberals) {
        Scene scene = BotScenes.vote("LLHLLFF");
        CpuPlayer hitler = BotScenes.bot(scene, skill, 0);
        for (String liberal : liberals) {
            hitler.knownPlayerRoles.put(liberal, Identity.LIBERAL);
        }
        return hitler.chanceOfYes(scene.game());
    }

    /** Easy's coin comes before the chance and is not part of it. */
    @Test
    public void normalAndEasyFascistsVoteAsBefore() {
        assertEquals(0.6, chance(BotScenes.vote("LLFLH"), BotSkill.NORMAL), TOLERANCE);
        assertEquals(0.6, chance(BotScenes.vote("LLFLH"), BotSkill.EASY), TOLERANCE);
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
        double normal = share(nine, BotSkill.NORMAL, "elect P6", SEEDS)
                + share(nine, BotSkill.NORMAL, "elect P7", SEEDS);
        assertEquals("Normal's weights: P6 and P7 of 1 + 1 + 1 + 5 x 0.5", 2 / 5.5, normal, 2 * SHARE_TOLERANCE);
        double chance = CpuPlayer.SIDE_ELECTION_CHANCE;
        assertEquals(chance + (1 - chance) * normal, p6 + p7, 2 * SHARE_TOLERANCE);
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
