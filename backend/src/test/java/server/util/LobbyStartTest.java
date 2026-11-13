package server.util;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

public class LobbyStartTest {

    private float savedTimeout;

    @Before
    public void longGraceWindow() {
        savedTimeout = Lobby.PLAYER_TIMEOUT_IN_SEC;
        Lobby.PLAYER_TIMEOUT_IN_SEC = 60; // no removal fires during a test
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

    @Test
    public void aPlayerInsideTheGraceWindowIsNotSeated() {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 3);
        lobby.removeUser(players.get(1).ctx); // P2 closes; the lobby holds the seat for the window
        lobby.startNewGame();
        assertEquals(Set.of("P1", "P3", "Bot 1", "Bot 2", "Bot 3"), new HashSet<>(lobby.getUserNames()));
    }

    @Test
    public void connectedPlayersAreAllSeated() {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 5);
        lobby.startNewGame();
        assertEquals(Set.of("P1", "P2", "P3", "P4", "P5"), new HashSet<>(lobby.getUserNames()));
    }

    @Test
    public void aPlayerWhoLeftBeforePickingDoesNotBlockTheStart() {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 2);
        FakeSocket late = FakeSocket.open();
        lobby.addUser(late.ctx, "P3"); // still on the default portrait
        lobby.removeUser(late.ctx);
        lobby.startNewGame(); // threw "Not all players have selected icons." before the fix
        assertFalse(lobby.getUserNames().contains("P3"));
    }

    @Test
    public void aPlayerLeftOutCannotTakeASeatInTheGame() {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 3);
        lobby.removeUser(players.get(1).ctx);
        lobby.startNewGame();
        assertTrue(lobby.isInGame());
        assertFalse(lobby.canRejoin("P2"));
    }
}
