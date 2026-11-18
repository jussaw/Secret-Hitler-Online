package game;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import game.BotScenes.Played;
import game.BotScenes.Scene;
import game.datastructures.Policy;
import java.lang.reflect.Field;
import java.util.List;
import org.apache.commons.lang3.SerializationUtils;
import org.junit.Test;

/** A bot's level: how it is made, what it reports, and that a backup keeps it and what it remembers. */
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

    /** The game and its bot copied together, as a lobby backup writes and reads them. */
    private static Played backedUp(Played played) {
        Object[] copy = SerializationUtils.clone(new Object[] {played.game(), played.bot()});
        return new Played((SecretHitlerGame) copy[0], (CpuPlayer) copy[1]);
    }

    @Test
    public void aHardBotKeepsWhatItRemembersThroughABackup() {
        Played cleared = BotScenes.cleared("P5", BotSkill.HARD, 0);
        Played clearedCopy = backedUp(cleared);
        assertEquals(List.of("P3", "P4"), List.copyOf(clearedCopy.bot().clearedPlayers().names()));
        assertArrayEquals(SerializationUtils.serialize(cleared.bot()), SerializationUtils.serialize(clearedCopy.bot()));
        clearedCopy.then(g -> g.nominateChancellor("P3"));
        assertTrue("the copy acted", clearedCopy.bot().act(clearedCopy.game()));
        assertTrue("the copy votes for a player it cleared before the backup",
                clearedCopy.game().getVotes().get("P5"));

        Played peeked = BotScenes.peeked("LLLFH", "LFF", BotSkill.HARD, 0);
        Played peekedCopy = backedUp(peeked);
        assertEquals(List.of(Policy.Type.LIBERAL, Policy.Type.FASCIST, Policy.Type.FASCIST),
                peekedCopy.bot().peekMemory().cards());
        assertArrayEquals(SerializationUtils.serialize(peeked.bot()), SerializationUtils.serialize(peekedCopy.bot()));
        peekedCopy.then(g -> g.nominateChancellor("P2"));
        assertTrue("the copy acted", peekedCopy.bot().act(peekedCopy.game()));
        peekedCopy.then(g -> BotScenes.voteAll(g, true));
        peekedCopy.then(g -> g.presidentDiscardPolicy(0));
        peekedCopy.then(g -> g.chancellorEnactPolicy(0));
        assertEquals("the peek held through the backup still blames P1", Integer.valueOf(-PeekMemory.DROP),
                peekedCopy.bot().playerReputation.get("P1"));
        assertEquals(Integer.valueOf(-PeekMemory.DROP), peekedCopy.bot().playerReputation.get("P2"));
    }

    @Test
    public void aHardChancellorReadsItsHandOnceThroughABackup() {
        Scene scene = BotScenes.chancellorsHand("LLLFH", "FF", "F", 5);
        Played played = new Played(scene.game(), BotScenes.bot(scene, BotSkill.HARD, 0));
        played.botActs();
        assertEquals(GameState.LEGISLATIVE_PRESIDENT_VETO, played.game().getState());

        Played copy = backedUp(played);
        assertArrayEquals(SerializationUtils.serialize(played.bot()), SerializationUtils.serialize(copy.bot()));
        copy.then(g -> g.presidentialVeto(false));
        copy.botActs();
        assertEquals(GameState.FASCIST_VICTORY_POLICY, copy.game().getState());
        assertEquals("the hand read before the backup is not read again",
                Integer.valueOf(-ChancellorHand.FF_DROP), copy.bot().playerReputation.get("P0"));
    }

    /**
     * A Hard bot written before rules 1 and 4 had fields: its stream holds no {@code
     * clearedPlayers} or {@code peekMemory}, which Java leaves null (as nulling them here does)
     * and {@code readObject} fills, so the bot reads back with nothing remembered and plays on.
     */
    @Test
    public void aHardBotFromBeforeTheRulesStartsWithNothingRemembered() throws ReflectiveOperationException {
        Played played = BotScenes.cleared("P5", BotSkill.HARD, 0);
        for (String name : List.of("clearedPlayers", "peekMemory")) {
            Field field = CpuPlayer.class.getDeclaredField(name);
            field.setAccessible(true);
            field.set(played.bot(), null);
        }
        Played copy = backedUp(played);
        assertTrue(copy.bot().clearedPlayers().names().isEmpty());
        assertTrue(copy.bot().peekMemory().cards().isEmpty());

        copy.then(g -> g.nominateChancellor("P3"));
        assertTrue("the copy acted", copy.bot().act(copy.game()));
        copy.then(g -> BotScenes.voteAll(g, true));
        assertEquals("the copy clears again from what it sees", List.of("P3"),
                List.copyOf(copy.bot().clearedPlayers().names()));
    }
}
