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
        assertEquals(-ChancellorHand.FF_DROP, ChancellorHand.presidentChange(hand("FF"), ChancellorHand.FF_DROP));
    }

    @Test
    public void twoLiberalCardsRaiseThePresident() {
        assertEquals(ChancellorHand.LL_RISE, ChancellorHand.presidentChange(hand("LL"), ChancellorHand.FF_DROP));
    }

    @Test
    public void oneOfEachSaysNothing() {
        assertEquals(0, ChancellorHand.presidentChange(hand("FL"), ChancellorHand.FF_DROP));
        assertEquals(0, ChancellorHand.presidentChange(hand("LF"), ChancellorHand.FF_DROP));
    }

    @Test
    public void theDropIsTheOneGiven() {
        assertEquals(-(ChancellorHand.FF_DROP + 1),
                ChancellorHand.presidentChange(hand("FF"), ChancellorHand.FF_DROP + 1));
        assertEquals(ChancellorHand.LL_RISE, ChancellorHand.presidentChange(hand("LL"), ChancellorHand.FF_DROP + 1));
    }

    // Through CpuPlayer: P0's score once the bot of P1, holding the hand, has acted.

    private static int presidentsScoreAfterActing(String roles, String hand, String extra, BotSkill skill,
            long seed) {
        Scene scene = BotScenes.chancellorsHand(roles, hand, extra, 0);
        CpuPlayer bot = BotScenes.bot(scene, skill, seed);
        bot.update(scene.game());
        assertTrue(bot.act(scene.game()));
        return bot.playerReputation.get("P0");
    }

    @Test
    public void aHardLiberalChancellorLowersAPresidentWhoPassesTwoFascists() {
        assertEquals(-ChancellorHand.FF_DROP, presidentsScoreAfterActing("LLLFH", "FF", "L", BotSkill.HARD, 0));
    }

    @Test
    public void aHardLiberalChancellorRaisesAPresidentWhoPassesTwoLiberals() {
        assertEquals(ChancellorHand.LL_RISE, presidentsScoreAfterActing("LLLFH", "LL", "F", BotSkill.HARD, 0));
    }

    @Test
    public void oneOfEachChangesNoScore() {
        assertEquals(0, presidentsScoreAfterActing("LLLFH", "FL", "F", BotSkill.HARD, 0));
        assertEquals(0, presidentsScoreAfterActing("LLLFH", "LF", "L", BotSkill.HARD, 0));
    }

    @Test
    public void aHardHitlerAtSevenReadsTheHand() {
        assertEquals(-ChancellorHand.FF_DROP, presidentsScoreAfterActing("LHLLLFF", "FF", "L", BotSkill.HARD, 0));
    }

    @Test
    public void aHardFascistAndHitlerAtFiveDoNot() {
        assertEquals(0, presidentsScoreAfterActing("LFLLH", "FF", "L", BotSkill.HARD, 0));
        assertEquals(0, presidentsScoreAfterActing("LHLLF", "FF", "L", BotSkill.HARD, 0));
        assertEquals(0, presidentsScoreAfterActing("LHLLF", "LL", "F", BotSkill.HARD, 0));
    }

    @Test
    public void aNormalOrEasyChancellorDoesNot() {
        for (long seed = 0; seed < 100; seed++) {
            assertEquals(0, presidentsScoreAfterActing("LLLFH", "FF", "L", BotSkill.NORMAL, seed));
            assertEquals(0, presidentsScoreAfterActing("LLLFH", "FF", "L", BotSkill.EASY, seed));
            assertEquals(0, presidentsScoreAfterActing("LLLFH", "LL", "F", BotSkill.EASY, seed));
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
        assertEquals(-ChancellorHand.FF_DROP, (int) played.bot().playerReputation.get("P0"));
    }
}
