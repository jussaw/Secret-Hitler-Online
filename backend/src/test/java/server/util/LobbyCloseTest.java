package server.util;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/**
 * A lobby that has timed out is closed once, by the sweep that takes it (#64), and from then on
 * takes no one: no player, not even one taking back their own seat, and no spectator.
 */
public class LobbyCloseTest {
    private long savedTimeout;

    @Before
    public void saveTimeout() {
        savedTimeout = Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN;
    }

    @After
    public void restoreTimeout() {
        Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN = savedTimeout;
    }

    /** A lobby that has already timed out, with Ann connected under the key "key". */
    private static Lobby timedOutLobby(FakeSocket ann) {
        Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN = 0; // the lobby starts out timed out, and stays so
        Lobby lobby = new Lobby();
        lobby.addUser(ann.ctx, "Ann", "key");
        return lobby;
    }

    /** Fails with {@code taken} unless the add throws, as Lobby does for a connection it refuses. */
    private static void expectRefused(Runnable add, String taken) {
        try {
            add.run();
            fail(taken);
        } catch (IllegalArgumentException expected) {
            // as expected
        }
    }

    @Test
    public void aLobbyClosesOnceItHasTimedOutAndOnlyOnce() {
        Lobby live = new Lobby();
        assertFalse("a live lobby does not close", live.closeIfTimedOut());
        assertFalse(live.isClosed());

        Lobby lobby = timedOutLobby(FakeSocket.open());
        assertFalse(lobby.isClosed());
        assertTrue(lobby.closeIfTimedOut());
        assertTrue(lobby.isClosed());
        assertFalse("a second sweep finds it closed already", lobby.closeIfTimedOut());
        assertTrue(lobby.isClosed());
    }

    @Test
    public void aClosedLobbyTakesNoPlayer() {
        FakeSocket ann = FakeSocket.open();
        Lobby lobby = timedOutLobby(ann);
        lobby.removeUser(ann.ctx); // inside the grace window: Ann would take back her own seat
        assertNull("before it closes, Ann takes her seat back", lobby.joinRefusal("Ann", null));
        lobby.closeIfTimedOut();

        assertEquals(Lobby.JoinRefusal.CLOSED, lobby.joinRefusal("Ann", null));
        assertEquals(Lobby.JoinRefusal.CLOSED, lobby.joinRefusal("Bob", "another key"));
        expectRefused(() -> lobby.addUser(FakeSocket.open().ctx, "Bob", "another key"),
                "a closed lobby took a player");
        assertFalse(lobby.hasUserWithName("Bob"));
    }

    @Test
    public void aClosedLobbyTakesNoConnectionInPlaceOfALiveOne() {
        FakeSocket ann = FakeSocket.open();
        Lobby lobby = timedOutLobby(ann);
        lobby.closeIfTimedOut();

        assertEquals(Lobby.JoinRefusal.CLOSED, lobby.joinRefusal("Ann", "key"));
        FakeSocket back = FakeSocket.open();
        expectRefused(() -> lobby.addUser(back.ctx, "Ann", "key"), "a closed lobby took a connection in place of Ann's");
        assertTrue("Ann's connection is the one the sweep closes", lobby.hasUser(ann.ctx));
        assertFalse(lobby.hasUser(back.ctx));
    }

    @Test
    public void aClosedLobbyTakesNoSpectator() {
        Lobby lobby = timedOutLobby(FakeSocket.open());
        lobby.closeIfTimedOut();

        FakeSocket spectator = FakeSocket.open();
        expectRefused(() -> lobby.addSpectator(spectator.ctx), "a closed lobby took a spectator");
        assertFalse(lobby.isSpectator(spectator.ctx));
        assertEquals(0, lobby.getSpectatorCount());
    }
}
