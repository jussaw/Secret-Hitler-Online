package server.util;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import game.GameState;
import game.SecretHitlerGame;
import game.datastructures.Player;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import server.GameDriver;

/** The END TERM countdown a lobby runs, starts, ends and sends, with real time. */
public class LobbyTermTimerTest {
    private static final long WAIT_MS = 5_000;

    private float savedDuration;
    private final List<FakeSocket> players = new ArrayList<>();

    @Before
    public void saveDuration() {
        savedDuration = Lobby.END_TERM_TIMER_IN_SEC;
    }

    @After
    public void restoreDuration() {
        Lobby.END_TERM_TIMER_IN_SEC = savedDuration;
    }

    /** A lobby whose game has just started, with players "P1".."Pn", all human. */
    private Lobby lobbyInGame(int count) {
        Lobby lobby = new Lobby();
        for (int i = 1; i <= count; i++) {
            FakeSocket player = FakeSocket.open();
            lobby.addUser(player.ctx, "P" + i);
            lobby.trySetUserIcon("p" + i, player.ctx);
            players.add(player);
        }
        lobby.startNewGame();
        return lobby;
    }

    /** A five-player lobby whose game waits for END TERM, with the state sent to everyone. */
    private Lobby lobbyAtEndTerm() {
        Lobby lobby = lobbyInGame(5);
        synchronized (lobby) {
            GameDriver.playUntil(lobby.game(), GameState.POST_LEGISLATIVE);
            lobby.updateAllUsers(); // the countdown starts with the state that shows END TERM
        }
        return lobby;
    }

    /** The countdown in the last packet {@code socket} got, or null. */
    private static JSONObject lastTimer(Lobby lobby, FakeSocket socket) {
        synchronized (lobby) { // the timer's thread sends under the lobby's lock
            return socket.last().optJSONObject("termTimer");
        }
    }

    private static GameState state(Lobby lobby) {
        synchronized (lobby) {
            return lobby.game().getState();
        }
    }

    private static void waitFor(BooleanSupplier condition, String what) throws InterruptedException {
        long deadline = System.currentTimeMillis() + WAIT_MS;
        while (!condition.getAsBoolean()) {
            if (System.currentTimeMillis() > deadline) {
                fail(what + " within " + WAIT_MS + " ms");
            }
            Thread.sleep(20);
        }
    }

    @Test
    public void everyoneGetsTheCountdownOnceTheGameWaitsForEndTerm() {
        Lobby lobby = lobbyAtEndTerm();
        FakeSocket spectator = FakeSocket.open();
        lobby.addSpectator(spectator.ctx);
        lobby.updateSpectator(spectator.ctx);

        List<FakeSocket> everyone = new ArrayList<>(players);
        everyone.add(spectator);
        for (FakeSocket socket : everyone) {
            JSONObject timer = lastTimer(lobby, socket);
            assertNotNull("a countdown in " + socket.last(), timer);
            assertFalse(timer.getBoolean("paused"));
            long left = timer.getLong("remainingMs");
            assertTrue("about 10 s left, not " + left, left > 9_000 && left <= 10_000);
        }
    }

    @Test
    public void thereIsNoCountdownBeforeEndTerm() {
        Lobby lobby = lobbyInGame(5);
        lobby.updateAllUsers();
        assertEquals(GameState.CHANCELLOR_NOMINATION, state(lobby));
        for (FakeSocket player : players) {
            assertNull(lastTimer(lobby, player));
        }
        assertNoCountdown(lobby::pauseTermTimer);
        assertNoCountdown(lobby::resumeTermTimer);
    }

    @Test
    public void theCountdownEndsTheTermAtZero() throws Exception {
        Lobby.END_TERM_TIMER_IN_SEC = 0.2f;
        Lobby lobby = lobbyAtEndTerm();
        String president;
        int round;
        synchronized (lobby) {
            president = lobby.game().getCurrentPresident();
            round = lobby.game().getRound();
        }

        waitFor(() -> state(lobby) == GameState.CHANCELLOR_NOMINATION, "the term ending by itself");
        synchronized (lobby) {
            assertEquals(round + 1, lobby.game().getRound());
            assertNotEquals(president, lobby.game().getCurrentPresident());
            for (FakeSocket player : players) {
                assertEquals("CHANCELLOR_NOMINATION", player.last().getString("state"));
                assertNull(player.last().optJSONObject("termTimer"));
            }
            // A command about that term from its president, on its way meanwhile, is late.
            assertTrue(lobby.isLateForTerm(president));
            assertFalse(lobby.isLateForTerm(lobby.game().getCurrentPresident()));
        }
    }

    @Test
    public void aPausedCountdownKeepsTheTermOpenUntilItIsResumed() throws Exception {
        Lobby.END_TERM_TIMER_IN_SEC = 0.3f;
        Lobby lobby = lobbyAtEndTerm();
        FakeSocket player = players.get(0);
        synchronized (lobby) {
            lobby.pauseTermTimer();
            lobby.pauseTermTimer(); // a second pause changes nothing
            lobby.updateAllUsers();
        }
        JSONObject paused = lastTimer(lobby, player);
        assertTrue(paused.getBoolean("paused"));
        assertTrue(paused.getLong("remainingMs") > 0);

        Thread.sleep(800);
        assertEquals("the term is still open", GameState.POST_LEGISLATIVE, state(lobby));
        lobby.updateAllUsers();
        assertEquals("a paused countdown keeps its time", paused.getLong("remainingMs"),
                lastTimer(lobby, player).getLong("remainingMs"));

        synchronized (lobby) {
            lobby.resumeTermTimer();
            lobby.resumeTermTimer(); // a second resume changes nothing
            lobby.updateAllUsers();
        }
        assertFalse(lastTimer(lobby, player).getBoolean("paused"));
        waitFor(() -> state(lobby) == GameState.CHANCELLOR_NOMINATION, "the resumed countdown ending the term");
    }

    @Test
    public void endTermStopsTheCountdownSoTheTermEndsOnce() throws Exception {
        Lobby.END_TERM_TIMER_IN_SEC = 0.3f;
        Lobby lobby = lobbyAtEndTerm();
        String president;
        int round;
        synchronized (lobby) {
            president = lobby.game().getCurrentPresident();
            round = lobby.game().getRound();
            lobby.game().endPresidentialTerm(); // what END TERM does
            lobby.updateAllUsers();
        }
        Thread.sleep(800); // past the countdown's end
        synchronized (lobby) {
            assertEquals(GameState.CHANCELLOR_NOMINATION, lobby.game().getState());
            assertEquals("the term ended once", round + 1, lobby.game().getRound());
            assertFalse("the president ended the term, not the countdown", lobby.isLateForTerm(president));
        }
    }

    @Test
    public void aCpuPresidentGetsNoCountdown() {
        Lobby lobby = new Lobby();
        lobby.startNewGame(); // five CPU players
        FakeSocket spectator = FakeSocket.open();
        synchronized (lobby) {
            GameDriver.playUntil(lobby.game(), GameState.POST_LEGISLATIVE);
            lobby.addSpectator(spectator.ctx);
            lobby.sendStateToAll(); // the state, without letting the CPU president act
        }
        assertEquals("POST_LEGISLATIVE", spectator.last().getString("state"));
        assertNull(lastTimer(lobby, spectator));
        assertNoCountdown(lobby::pauseTermTimer);
    }

    /**
     * The countdown is not backed up: a lobby restored from a backup taken mid-term (here after
     * a pause) starts a new, running countdown with the first state it sends.
     */
    @Test
    public void aRestoredLobbyStartsANewCountdown() throws Exception {
        Lobby lobby = lobbyAtEndTerm();
        String president;
        synchronized (lobby) {
            president = lobby.game().getCurrentPresident();
            lobby.pauseTermTimer();
        }
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ObjectOutputStream out = new ObjectOutputStream(bytes)) {
            out.writeObject(lobby); // as SecretHitlerServer.storeLobbies does
        }
        Lobby restored;
        try (ObjectInputStream in = new ObjectInputStream(new ByteArrayInputStream(bytes.toByteArray()))) {
            restored = (Lobby) in.readObject();
        }

        FakeSocket rejoined = FakeSocket.open();
        restored.addUser(rejoined.ctx, president);
        restored.updateUser(rejoined.ctx, president);
        JSONObject timer = lastTimer(restored, rejoined);
        assertNotNull(timer);
        assertFalse(timer.getBoolean("paused"));
        assertTrue(timer.getLong("remainingMs") > 9_000);
    }

    /**
     * After a special election that picks the next player in order, that player presides twice
     * in a row. When the countdown ends the first of those terms, their late END TERM is dropped;
     * at END TERM of the second they are president again and not late.
     */
    @Test
    public void aPresidentBackAtEndTermAfterASpecialElectionIsNotLate() throws Exception {
        Lobby.END_TERM_TIMER_IN_SEC = 0.2f;
        Lobby lobby = lobbyInGame(7);
        SecretHitlerGame game = lobby.game();
        String elected;
        synchronized (lobby) {
            GameDriver.playUntil(game, GameState.PRESIDENTIAL_POWER_ELECTION);
            elected = nextInOrder(game, game.getCurrentPresident());
            game.electNextPresident(elected);
            game.endPresidentialTerm();
            GameDriver.playUntil(game, GameState.POST_LEGISLATIVE);
            assertEquals(elected, game.getCurrentPresident());
            lobby.updateAllUsers();
        }

        waitFor(() -> state(lobby) == GameState.CHANCELLOR_NOMINATION, "the special term ending by itself");
        synchronized (lobby) {
            assertEquals("back in the normal order", elected, game.getCurrentPresident());
            assertTrue(lobby.isLateForTerm(elected));
            GameDriver.playUntil(game, GameState.POST_LEGISLATIVE);
            assertFalse(lobby.isLateForTerm(elected));
        }
    }

    /** Asserts that {@code command} fails for want of a countdown. */
    private static void assertNoCountdown(Runnable command) {
        try {
            command.run();
            fail("no IllegalStateException");
        } catch (IllegalStateException expected) {
            // there is no countdown to pause or resume
        }
    }

    private static String nextInOrder(SecretHitlerGame game, String name) {
        List<Player> order = game.getPlayerList();
        for (int i = 0; i < order.size(); i++) {
            if (order.get(i).getUsername().equals(name)) {
                return order.get((i + 1) % order.size()).getUsername();
            }
        }
        throw new IllegalArgumentException(name);
    }
}
