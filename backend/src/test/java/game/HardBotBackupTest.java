package game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.io.ObjectInputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;
import org.junit.Test;

/**
 * Bots backed up before Phase 25C ({@code bots-before-25c.ser}, written by Phase 25B's classes: an
 * unfinished seven-seat game and its bots, EASY, NORMAL, HARD, EASY, NORMAL, HARD, EASY by seat,
 * with a Hard liberal that has cleared a player) load under 25C's classes, keep what they had,
 * remember nothing new, and play their game out.
 */
public class HardBotBackupTest {
    private static final String FIXTURE = "/bots-before-25c.ser";

    private static final List<BotSkill> LEVELS = List.of(BotSkill.EASY, BotSkill.NORMAL, BotSkill.HARD,
            BotSkill.EASY, BotSkill.NORMAL, BotSkill.HARD, BotSkill.EASY);

    /** The fixture's game and its bots, in name order. */
    private record Backup(SecretHitlerGame game, List<CpuPlayer> bots) {
    }

    @SuppressWarnings("unchecked")
    private static Backup load() throws IOException, ClassNotFoundException {
        try (InputStream in = HardBotBackupTest.class.getResourceAsStream(FIXTURE)) {
            assertNotNull("no " + FIXTURE, in);
            Object[] read = (Object[]) new ObjectInputStream(in).readObject();
            return new Backup((SecretHitlerGame) read[0], (ArrayList<CpuPlayer>) read[1]);
        }
    }

    @Test
    public void botsFromBefore25CKeepTheirLevels() throws IOException, ClassNotFoundException {
        Backup backup = load();
        List<BotSkill> levels = new ArrayList<>();
        for (CpuPlayer bot : backup.bots()) {
            levels.add(bot.skill());
        }
        assertEquals(LEVELS, levels);
        assertEquals("Bot 6", backup.bots().get(5).myName);
        assertEquals(List.of("Bot 7"), List.copyOf(backup.bots().get(5).clearedPlayers().names()));
        assertFalse(backup.game().hasGameFinished());
    }

    @Test
    public void botsFromBefore25CRememberNothingNew() throws IOException, ClassNotFoundException {
        for (CpuPlayer bot : load().bots()) {
            for (String seat : bot.playerReputation.keySet()) {
                assertEquals(bot.myName + " of " + seat, bot.playerReputation.get(seat), bot.score(seat), 0);
            }
            assertNotNull(bot.myName, bot.deckOdds());
            assertEquals(bot.myName + " has seen no discard", DeckOdds.allFascist(6, 11, 3),
                    bot.deckOdds().allFascistHand(0, 0), 0);
            assertEquals(bot.myName + " remembers no election", List.of(), bot.elections());
        }
    }

    @Test
    public void botsFromBefore25CPlayTheirGameOut() throws IOException, ClassNotFoundException {
        Backup backup = load();
        TreeSet<CpuPlayer> bots = new TreeSet<>(backup.bots());
        for (int step = 0; step < 2_000 && !backup.game().hasGameFinished(); step++) {
            CpuTurn.step(backup.game(), bots, () -> {
            });
        }
        assertTrue("the game ended within 2,000 steps, in " + backup.game().getState(), backup.game().hasGameFinished());
    }
}
