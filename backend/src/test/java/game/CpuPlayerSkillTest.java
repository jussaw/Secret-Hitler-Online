package game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import game.BotScenes.Scene;
import org.apache.commons.lang3.SerializationUtils;
import org.junit.Test;

/** A bot's level: how it is made, what it reports, and that a backup keeps it. */
public class CpuPlayerSkillTest {

    @Test
    public void aBotMadeWithoutALevelIsNormal() {
        assertEquals(BotSkill.NORMAL, new CpuPlayer("Bot 1").skill());
    }

    @Test
    public void aBotKeepsTheLevelItIsMadeWith() {
        for (BotSkill skill : BotSkill.values()) {
            assertEquals(skill, new CpuPlayer("Bot 1", skill).skill());
        }
    }

    @Test
    public void aNullLevelIsRefused() {
        try {
            new CpuPlayer("Bot 1", null);
            fail("a bot with no level was made");
        } catch (NullPointerException expected) {
            assertEquals("skill", expected.getMessage());
        }
    }

    @Test
    public void aBotKeepsItsLevelThroughABackup() {
        for (BotSkill skill : BotSkill.values()) {
            Scene scene = BotScenes.vote("LLLFH");
            CpuPlayer bot = BotScenes.bot(scene, skill, 1);

            Object[] copy = SerializationUtils.clone(new Object[] {scene.game(), bot});
            SecretHitlerGame game = (SecretHitlerGame) copy[0];
            CpuPlayer copied = (CpuPlayer) copy[1];

            assertEquals(skill, copied.skill());
            assertFalse(game.hasPlayerVoted("P2"));
            assertTrue(skill + " bot acted after the copy", copied.act(game));
            assertTrue(skill + " bot voted after the copy", game.hasPlayerVoted("P2"));
        }
    }
}
