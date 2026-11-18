package game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.TreeSet;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;
import server.GameDriver;

/** {@link CpuTurn#step}, the one CPU tick the lobby and {@code CpuGames} share. */
public class CpuTurnTest {
    private static final List<String> BOTS = List.of("Bot 1", "Bot 2", "Bot 3", "Bot 4", "Bot 5");
    private static final List<String> PEOPLE_AND_BOTS = List.of("Ann", "Bob", "Bot 1", "Bot 2", "Bot 3");

    private final AtomicInteger moves = new AtomicInteger();

    private Runnable countMoves() {
        return moves::incrementAndGet;
    }

    /** A CPU player for each named seat, initialized, in name order. */
    private static TreeSet<CpuPlayer> botsFor(SecretHitlerGame game, List<String> names) {
        TreeSet<CpuPlayer> cpus = new TreeSet<>();
        for (String name : names) {
            CpuPlayer cpu = new CpuPlayer(name);
            cpu.initialize(game);
            cpus.add(cpu);
        }
        return cpus;
    }

    private static List<String> botNamesOf(List<String> seats) {
        List<String> names = new ArrayList<>();
        for (String seat : seats) {
            if (seat.startsWith("Bot ")) {
                names.add(seat);
            }
        }
        return names;
    }

    @Test
    public void aBotsMoveEndsTheStep() {
        SecretHitlerGame game = new SecretHitlerGame(BOTS);
        TreeSet<CpuPlayer> cpus = botsFor(game, BOTS);

        assertTrue(CpuTurn.step(game, cpus, countMoves()));

        assertEquals(GameState.CHANCELLOR_VOTING, game.getState());
        assertEquals(1, moves.get());
    }

    @Test
    public void everyBotVotesInOneStep() {
        SecretHitlerGame game = new SecretHitlerGame(BOTS);
        TreeSet<CpuPlayer> cpus = botsFor(game, BOTS);
        CpuTurn.step(game, cpus, countMoves());

        assertTrue(CpuTurn.step(game, cpus, countMoves()));

        assertEquals(1 + 5, moves.get());
        assertNotEquals(GameState.CHANCELLOR_VOTING, game.getState());
    }

    @Test
    public void botsWaitingForPeopleDoNotMoveTheGameOn() {
        SecretHitlerGame game = new SecretHitlerGame(PEOPLE_AND_BOTS);
        List<String> botNames = botNamesOf(PEOPLE_AND_BOTS);
        TreeSet<CpuPlayer> cpus = botsFor(game, botNames);
        assertEquals("Ann", game.getCurrentPresident());
        game.nominateChancellor("Bob");

        assertFalse(CpuTurn.step(game, cpus, countMoves()));

        assertEquals(3, moves.get()); // each bot's vote reaches afterMove on its own
        for (String bot : botNames) {
            assertTrue(bot + " voted", game.hasPlayerVoted(bot));
        }
        assertFalse(game.hasPlayerVoted("Ann"));
        assertFalse(game.hasPlayerVoted("Bob"));
        assertEquals(GameState.CHANCELLOR_VOTING, game.getState());

        game.registerVote("Ann", true);
        game.registerVote("Bob", true);
        assertNotEquals(GameState.CHANCELLOR_VOTING, game.getState());
    }

    @Test
    public void noBotToActIsNoMove() {
        SecretHitlerGame game = new SecretHitlerGame(PEOPLE_AND_BOTS);
        TreeSet<CpuPlayer> cpus = botsFor(game, botNamesOf(PEOPLE_AND_BOTS));
        assertEquals(GameState.CHANCELLOR_NOMINATION, game.getState());

        assertFalse(CpuTurn.step(game, cpus, countMoves()));

        assertEquals(0, moves.get());
        assertEquals(GameState.CHANCELLOR_NOMINATION, game.getState());
    }

    @Test
    public void everyBotUpdatesBeforeAnyActs() {
        SecretHitlerGame game = new SecretHitlerGame(BOTS);
        List<String> log = new ArrayList<>();
        TreeSet<CpuPlayer> cpus = new TreeSet<>();
        for (String name : BOTS) {
            CpuPlayer cpu = new CpuPlayer(name) {
                @Override
                public void update(SecretHitlerGame g) {
                    log.add("update " + myName);
                    super.update(g);
                }

                @Override
                public boolean act(SecretHitlerGame g) {
                    log.add("act " + myName);
                    return super.act(g);
                }
            };
            cpu.initialize(game);
            cpus.add(cpu);
        }

        CpuTurn.step(game, cpus, countMoves());

        assertEquals(List.of("update Bot 1", "update Bot 2", "update Bot 3", "update Bot 4", "update Bot 5",
                "act Bot 1"), log.subList(0, 6));
    }

    @Test
    public void aFinishedGameTakesNoStep() {
        SecretHitlerGame game = GameDriver.play(5, g -> {
        });
        List<String> seats = new ArrayList<>();
        game.getPlayerList().forEach(player -> seats.add(player.getUsername()));
        TreeSet<CpuPlayer> cpus = botsFor(game, seats);
        assertTrue(game.hasGameFinished());

        assertFalse(CpuTurn.step(game, cpus, countMoves()));

        assertEquals(0, moves.get());
    }
}
