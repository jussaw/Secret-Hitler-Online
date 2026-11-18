package game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import game.BotScenes.Played;
import game.BotScenes.Scene;
import game.datastructures.Policy;
import java.util.List;
import org.junit.Test;

/**
 * Hard's rule 2 (the bot skill design's "The chancellor's hand"): a Hard CPU that reads the game,
 * as chancellor, lowers its president for passing two fascist cards and raises them for two
 * liberal ones, once per legislative session. Every amount is read from {@link ChancellorHand}.
 */
public class ChancellorHandTest {

    private static List<Policy> hand(String cards) {
        return BotScenes.policies(cards);
    }

    @Test
    public void twoFascistCardsLowerThePresident() {
        assertEquals(-ChancellorHand.FF_DROP, ChancellorHand.presidentChange(hand("FF"), ChancellorHand.FF_DROP), 0);
    }

    @Test
    public void twoLiberalCardsRaiseThePresident() {
        assertEquals(ChancellorHand.LL_RISE, ChancellorHand.presidentChange(hand("LL"), ChancellorHand.FF_DROP), 0);
    }

    @Test
    public void oneOfEachSaysNothing() {
        assertEquals(0, ChancellorHand.presidentChange(hand("FL"), ChancellorHand.FF_DROP), 0);
        assertEquals(0, ChancellorHand.presidentChange(hand("LF"), ChancellorHand.FF_DROP), 0);
    }

    /** The drop is the one given, as rule 5 scales it; two liberal cards keep the whole rise. */
    @Test
    public void theDropIsTheOneGiven() {
        assertEquals(-3.0, ChancellorHand.presidentChange(hand("FF"), 3.0), 0);
        assertEquals(-0.8, ChancellorHand.presidentChange(hand("FF"), 0.8), 0);
        assertEquals(ChancellorHand.LL_RISE, ChancellorHand.presidentChange(hand("LL"), 3.0), 0);
    }

    // Through CpuPlayer: P0's score once the bot of P1, holding the hand, has acted. Rule 5 scales
    // the drop by the chance the president discarded a liberal, from the cards the bot cannot place.

    private static final double TOLERANCE = 1e-9;

    /** The drop for two fascist cards with no policy down and no card seen: 6 liberals beside 15 cards. */
    private static final double DROP_AT_THE_START = ChancellorHand.FF_DROP * 6.0 / 15;

    private static double presidentsScoreAfterActing(String roles, String hand, String extra, BotSkill skill,
            long seed) {
        Scene scene = BotScenes.chancellorsHand(roles, hand, extra, 0);
        CpuPlayer bot = BotScenes.bot(scene, skill, seed);
        bot.update(scene.game());
        assertTrue(bot.act(scene.game()));
        return bot.score("P0");
    }

    @Test
    public void aHardLiberalChancellorLowersAPresidentWhoPassesTwoFascists() {
        assertEquals(-DROP_AT_THE_START, presidentsScoreAfterActing("LLLFH", "FF", "L", BotSkill.HARD, 0), TOLERANCE);
    }

    @Test
    public void aHardLiberalChancellorRaisesAPresidentWhoPassesTwoLiberals() {
        assertEquals(ChancellorHand.LL_RISE, presidentsScoreAfterActing("LLLFH", "LL", "F", BotSkill.HARD, 0),
                TOLERANCE);
    }

    @Test
    public void oneOfEachChangesNoScore() {
        assertEquals(0, presidentsScoreAfterActing("LLLFH", "FL", "F", BotSkill.HARD, 0), 0);
        assertEquals(0, presidentsScoreAfterActing("LLLFH", "LF", "L", BotSkill.HARD, 0), 0);
    }

    @Test
    public void aHardHitlerAtSevenReadsTheHand() {
        assertEquals(-DROP_AT_THE_START, presidentsScoreAfterActing("LHLLLFF", "FF", "L", BotSkill.HARD, 0),
                TOLERANCE);
    }

    @Test
    public void aHardFascistAndHitlerAtFiveDoNot() {
        assertEquals(0, presidentsScoreAfterActing("LFLLH", "FF", "L", BotSkill.HARD, 0), 0);
        assertEquals(0, presidentsScoreAfterActing("LHLLF", "FF", "L", BotSkill.HARD, 0), 0);
        assertEquals(0, presidentsScoreAfterActing("LHLLF", "LL", "F", BotSkill.HARD, 0), 0);
    }

    @Test
    public void aNormalOrEasyChancellorDoesNot() {
        for (long seed = 0; seed < 100; seed++) {
            assertEquals(0, presidentsScoreAfterActing("LLLFH", "FF", "L", BotSkill.NORMAL, seed), 0);
            assertEquals(0, presidentsScoreAfterActing("LLLFH", "FF", "L", BotSkill.EASY, seed), 0);
            assertEquals(0, presidentsScoreAfterActing("LLLFH", "LL", "F", BotSkill.EASY, seed), 0);
        }
    }

    @Test
    public void theHandIsReadOncePerSession() {
        Scene scene = BotScenes.chancellorsHand("LLLFH", "FF", "F", 5);
        Played played = new Played(scene.game(), BotScenes.bot(scene, BotSkill.HARD, 0));
        played.updateAgain();
        played.botActs();
        assertEquals("the bot vetoes", GameState.LEGISLATIVE_PRESIDENT_VETO, played.game().getState());
        played.then(g -> g.presidentialVeto(false));
        played.updateAgain();
        played.botActs();
        assertEquals(GameState.FASCIST_VICTORY_POLICY, played.game().getState());
        // Five fascist policies down: 6 liberals beside 10 cards.
        assertEquals(-ChancellorHand.FF_DROP * 6.0 / 10, played.bot().score("P0"), TOLERANCE);
    }
}
