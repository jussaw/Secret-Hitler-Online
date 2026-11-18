package game;

import static org.junit.Assert.assertEquals;

import game.BotScenes.Scene;
import org.junit.Test;

/**
 * Hard's rule 6 (the bot skill design's "The election tracker"): with two failed elections, a
 * third enacts the top card, so a Hard liberal votes yes more readily and the Hard fascist side
 * less readily. Read through {@link CpuPlayer#chanceOfYes}, the yes probability every voting path
 * works out.
 */
public class HardTrackerTest {
    private static final double TOLERANCE = 1e-6;
    private static final long SEED = 0;

    /** The chance of yes of a Normal bot in {@code scene}. */
    private static float normalChance(Scene scene) {
        return BotScenes.bot(scene, BotSkill.NORMAL, SEED).chanceOfYes(scene.game());
    }

    /** Every voting path's chance is as before the refactor: the curve, the untrusted vote and the fascist side's mix. */
    @Test
    public void normalChancesAreAsBefore() {
        assertEquals(0.75, normalChance(BotScenes.vote("LLLFH")), TOLERANCE);
        Scene untrusted = BotScenes.vote("LLLFH");
        CpuPlayer bot = BotScenes.bot(untrusted, BotSkill.NORMAL, SEED);
        bot.playerReputation.put("P0", -4);
        assertEquals(0.05, bot.chanceOfYes(untrusted.game()), TOLERANCE);
        assertEquals("a fascist on two liberals", 0.6, normalChance(BotScenes.vote("LLFLH")), TOLERANCE);
        assertEquals("a fascist on one of each", 0.7, normalChance(BotScenes.vote("HLFLL")), TOLERANCE);
        assertEquals("a fascist on two of its side", 0.8, normalChance(BotScenes.vote("FHFLLLL")), TOLERANCE);
    }
}
