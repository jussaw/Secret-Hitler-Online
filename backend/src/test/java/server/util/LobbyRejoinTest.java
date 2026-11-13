package server.util;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import server.GameDriver;

/**
 * #41: a player who comes back to a running game after the grace window
 * ({@code Lobby.PLAYER_TIMEOUT_IN_SEC}), or after the lobby is restored from a backup, is in the
 * lobby again: listed when the game ends, counted toward a full lobby, and seated in the next
 * game. Having lost their place, they take the last one, as outside a game, so after a restore
 * the first player back is the host.
 */
public class LobbyRejoinTest {

    /** A short grace window, so a test can wait it out. Read when a connection closes. */
    private static final float WINDOW_SEC = 0.05f;

    private float savedTimeout;

    @Before
    public void shortGraceWindow() {
        savedTimeout = Lobby.PLAYER_TIMEOUT_IN_SEC;
        Lobby.PLAYER_TIMEOUT_IN_SEC = WINDOW_SEC;
    }

    @After
    public void restoreTimeout() {
        Lobby.PLAYER_TIMEOUT_IN_SEC = savedTimeout;
    }

    /** Adds players "P1".."Pn" with portraits p1..pn. */
    private static List<FakeSocket> addPlayers(Lobby lobby, int count) {
        List<FakeSocket> players = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            FakeSocket player = FakeSocket.open();
            lobby.addUser(player.ctx, "P" + i);
            lobby.trySetUserIcon("p" + i, player.ctx);
            players.add(player);
        }
        return players;
    }

    /** Closes the player's connection and waits until the grace window has passed, releasing their place. */
    private static void leaveForLongerThanTheWindow(Lobby lobby, FakeSocket player) throws InterruptedException {
        int users = lobby.getUserCount();
        lobby.removeUser(player.ctx);
        long deadline = System.currentTimeMillis() + 5000;
        while (lobby.getUserCount() != users - 1) {
            if (System.currentTimeMillis() > deadline) {
                fail("the place was still held 5 s after the connection closed");
            }
            Thread.sleep(10);
        }
    }

    /** Opens a new connection under {@code name}, as a page coming back does. */
    private static FakeSocket rejoin(Lobby lobby, String name) {
        FakeSocket socket = FakeSocket.open();
        lobby.addUser(socket.ctx, name);
        return socket;
    }

    /** Plays the running game to its end, then ends it as the broadcast after the last move does. */
    private static void finishGame(Lobby lobby) {
        synchronized (lobby) {
            GameDriver.playOut(lobby.game(), game -> {
            });
            lobby.updateAllUsers();
        }
        assertFalse(lobby.isInGame());
    }

    /**
     * Sends everyone the current state, and returns the lobby's names, in order, from the packet
     * {@code socket} received. The first is the host.
     */
    private static List<String> lobbyListSentTo(Lobby lobby, FakeSocket socket) {
        lobby.sendStateToAll();
        JSONArray array = socket.last().getJSONArray("usernames");
        List<String> names = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) {
            names.add(array.getString(i));
        }
        return names;
    }

    /** The lobby as the server loads it from a backup: no connections, and no one in the lobby. */
    private static Lobby restore(Lobby lobby) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ObjectOutputStream out = new ObjectOutputStream(bytes)) {
            out.writeObject(lobby);
        }
        try (ObjectInputStream in = new ObjectInputStream(new ByteArrayInputStream(bytes.toByteArray()))) {
            return (Lobby) in.readObject();
        }
    }

    @Test
    public void aPlayerBackAfterTheWindowIsListedWhenTheGameEnds() throws Exception {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 5);
        lobby.startNewGame();
        leaveForLongerThanTheWindow(lobby, players.get(1));
        FakeSocket back = rejoin(lobby, "P2");

        finishGame(lobby);
        assertEquals("P2 is listed, in the last place", List.of("P1", "P3", "P4", "P5", "P2"),
                lobbyListSentTo(lobby, back));
    }

    @Test
    public void aPlayerBackAfterTheWindowIsSeatedInTheNextGame() throws Exception {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 5);
        lobby.startNewGame();
        leaveForLongerThanTheWindow(lobby, players.get(1));
        rejoin(lobby, "P2");

        finishGame(lobby);
        lobby.startNewGame();
        assertEquals(Set.of("P1", "P2", "P3", "P4", "P5"), new HashSet<>(lobby.getUserNames()));
    }

    @Test
    public void aPlayerBackAfterTheWindowCountsTowardAFullLobby() throws Exception {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 10);
        lobby.startNewGame();
        leaveForLongerThanTheWindow(lobby, players.get(9));
        assertFalse("the released place is not counted", lobby.isFull());

        rejoin(lobby, "P10");
        assertEquals(10, lobby.getUserCount());
        assertTrue(lobby.isFull());
    }

    @Test
    public void aPlayerBackInsideTheWindowKeepsTheirPlace() throws Exception {
        Lobby.PLAYER_TIMEOUT_IN_SEC = 60; // no removal fires during the test
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 5);
        lobby.startNewGame();
        lobby.removeUser(players.get(0).ctx); // the host's connection drops
        FakeSocket back = rejoin(lobby, "P1");

        finishGame(lobby);
        assertEquals("P1 is still the host", List.of("P1", "P2", "P3", "P4", "P5"), lobbyListSentTo(lobby, back));
    }

    /**
     * A rejoin can be under way, holding the lobby's lock, just as the window ends. The removal
     * that falls due waits for it and finds the player back, rather than taking them off the
     * list behind the rejoin's back.
     */
    @Test
    public void aPlayerWhoseRejoinIsUnderWayAsTheWindowEndsKeepsTheirPlace() throws Exception {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 5);
        lobby.startNewGame();
        FakeSocket back;
        synchronized (lobby) {
            lobby.removeUser(players.get(0).ctx); // the host's connection drops
            Thread.sleep((long) (WINDOW_SEC * 1000 * 10)); // the removal falls due
            back = rejoin(lobby, "P1");
        }

        finishGame(lobby);
        assertEquals("P1 is still the host", List.of("P1", "P2", "P3", "P4", "P5"), lobbyListSentTo(lobby, back));
    }

    /** After a restart no place is held, so every player comes back as one past the window. */
    @Test
    public void aRestoredGameListsItsPlayersInTheOrderTheyCameBack() throws Exception {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 5);
        lobby.startNewGame();
        Lobby restored = restore(lobby);
        assertEquals(0, restored.getUserCount());

        FakeSocket first = rejoin(restored, "P3");
        rejoin(restored, "P1");
        rejoin(restored, "P2");
        rejoin(restored, "P4"); // P5 never comes back
        assertEquals(4, restored.getUserCount());

        finishGame(restored);
        assertEquals("the first back is the host", List.of("P3", "P1", "P2", "P4"), lobbyListSentTo(restored, first));
        restored.startNewGame();
        assertEquals(Set.of("P1", "P2", "P3", "P4", "Bot 1"), new HashSet<>(restored.getUserNames()));
    }
}
