package server.util;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.fail;

import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import server.GameDriver;

/**
 * #42: every disconnect gets a whole grace window ({@code Lobby.PLAYER_TIMEOUT_IN_SEC}). The
 * removal an earlier disconnect scheduled must not end the window of a later one, so a player
 * whose connection drops twice within a few seconds keeps their place, seat and portrait until
 * the second window ends.
 */
public class LobbyGraceWindowTest {

    private float savedTimeout;

    @Before
    public void saveGraceWindow() {
        savedTimeout = Lobby.PLAYER_TIMEOUT_IN_SEC;
    }

    @After
    public void restoreGraceWindow() {
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

    /** Opens a new connection under {@code name}, as a page coming back does. */
    private static FakeSocket rejoin(Lobby lobby, String name) {
        FakeSocket socket = FakeSocket.open();
        lobby.addUser(socket.ctx, name);
        return socket;
    }

    /** Sets the grace window to {@code ms} and returns it. */
    private static long graceWindow(long ms) {
        Lobby.PLAYER_TIMEOUT_IN_SEC = ms / 1000f;
        return ms;
    }

    /**
     * Sends everyone the current state and returns the packet {@code socket} received. Under the
     * lobby's lock, as the removals' timer thread sends.
     */
    private static JSONObject broadcastAndRead(Lobby lobby, FakeSocket socket) {
        synchronized (lobby) {
            lobby.sendStateToAll();
            return socket.last();
        }
    }

    /** The lobby's names, in order, from a lobby packet. The first is the host. */
    private static List<String> names(JSONObject lobbyPacket) {
        JSONArray array = lobbyPacket.getJSONArray("usernames");
        List<String> names = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) {
            names.add(array.getString(i));
        }
        return names;
    }

    /**
     * Checks {@code check} again and again for {@code forMs} from {@code fromMs}, so a removal
     * that fires early is caught whenever it fires. No check starts after that.
     */
    private static void holdsUntil(long fromMs, long forMs, Runnable check) throws InterruptedException {
        while (System.currentTimeMillis() < fromMs + forMs) {
            check.run();
            Thread.sleep(10);
        }
    }

    /** Waits up to 5 s for the lobby to count {@code count} players. */
    private static void waitForUserCount(Lobby lobby, int count) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5000;
        while (lobby.getUserCount() != count) {
            if (System.currentTimeMillis() > deadline) {
                fail("the lobby still counted " + lobby.getUserCount() + " players after 5 s, not " + count);
            }
            Thread.sleep(10);
        }
    }

    /**
     * The issue's case in a lobby: a drop at 0 s, back at once, and a second drop halfway through
     * the first window. The first drop's removal falls due during the second window and must
     * leave the seat and portrait alone; the second window then ends on time.
     */
    @Test
    public void aSecondDropInTheLobbyGetsAWholeWindow() throws Exception {
        long windowMs = graceWindow(1000);
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 3);
        FakeSocket host = players.get(0);

        lobby.removeUser(players.get(1).ctx); // the first drop: its removal is due at windowMs
        FakeSocket back = rejoin(lobby, "P2");
        Thread.sleep(windowMs / 2);
        long secondDrop = System.currentTimeMillis();
        lobby.removeUser(back.ctx);

        // Past the first drop's removal, and still inside the second window.
        holdsUntil(secondDrop, windowMs * 7 / 10, () -> {
            JSONObject packet = broadcastAndRead(lobby, host);
            assertEquals("P2 keeps their place", List.of("P1", "P2", "P3"), names(packet));
            assertEquals("P2 keeps their portrait", "p2", packet.getJSONObject("icon").optString("P2"));
        });

        waitForUserCount(lobby, 2); // the second window ends
        assertEquals(List.of("P1", "P3"), names(broadcastAndRead(lobby, host)));
    }

    /**
     * The same in a game: the player stays in the lobby, so a rejoin inside the second window
     * keeps their place there, and the lobby lists them in it when the game ends.
     */
    @Test
    public void aSecondDropInAGameKeepsThePlayerInTheLobby() throws Exception {
        long windowMs = graceWindow(1000);
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 5);
        lobby.startNewGame();

        lobby.removeUser(players.get(1).ctx);
        FakeSocket back = rejoin(lobby, "P2");
        Thread.sleep(windowMs / 2);
        long secondDrop = System.currentTimeMillis();
        lobby.removeUser(back.ctx);

        holdsUntil(secondDrop, windowMs * 7 / 10, () -> assertEquals("P2 is still counted", 5, lobby.getUserCount()));
        FakeSocket again = rejoin(lobby, "P2"); // inside the second window
        Thread.sleep(windowMs * 2); // every removal has fallen due
        assertEquals(5, lobby.getUserCount());

        synchronized (lobby) {
            GameDriver.playOut(lobby.game(), game -> {
            });
            lobby.updateAllUsers();
        }
        assertFalse(lobby.isInGame());
        assertEquals("P2 is listed in their place", List.of("P1", "P2", "P3", "P4", "P5"),
                names(broadcastAndRead(lobby, again)));
    }

    /**
     * A removal can fall due while a rejoin holds the lobby's lock, too late to be called off.
     * Once the player is back it must do nothing, even if they have dropped again by the time it
     * runs: that drop has a window of its own.
     */
    @Test
    public void aRemovalThatFellDueDuringARejoinLeavesTheNextWindowAlone() throws Exception {
        long windowMs = graceWindow(600);
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 3);
        long released;
        synchronized (lobby) {
            lobby.removeUser(players.get(0).ctx); // the host drops
            Thread.sleep(windowMs + 500); // the removal falls due, and its thread waits for the lock
            FakeSocket back = rejoin(lobby, "P1");
            lobby.removeUser(back.ctx); // and drops again, with a new window
            released = System.currentTimeMillis();
        }

        holdsUntil(released, windowMs / 2, () -> assertEquals("P1 is still the host", List.of("P1", "P2", "P3"),
                names(broadcastAndRead(lobby, players.get(1)))));
        waitForUserCount(lobby, 2);
    }
}
