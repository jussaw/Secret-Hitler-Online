package server.util;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static server.util.LobbyTesting.account;
import static server.util.LobbyTesting.join;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

public class LobbyRenameTest {

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
            join(lobby, player.ctx, "P" + i);
            lobby.trySetUserIcon("p" + i, player.ctx);
            players.add(player);
        }
        return players;
    }

    private static List<String> names(JSONObject packet) {
        JSONArray array = packet.getJSONArray("usernames");
        List<String> names = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) {
            names.add(array.getString(i));
        }
        return names;
    }

    @Test
    public void aRenameShowsInTheNextPacket() {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 3);
        FakeSocket spectator = FakeSocket.open();
        lobby.addSpectator(spectator.ctx);
        assertTrue(lobby.rename(account("P2"), "Annie"));
        lobby.sendStateToAll();
        List<FakeSocket> everyone = new ArrayList<>(players);
        everyone.add(spectator);
        for (FakeSocket socket : everyone) {
            JSONObject packet = socket.last();
            assertEquals(List.of("P1", "Annie", "P3"), names(packet));
            JSONObject icons = packet.getJSONObject("icon");
            assertEquals("p2", icons.getString("Annie"));
            assertFalse(icons.has("P2"));
        }
    }

    @Test
    public void theHostStaysTheHost() {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 3);
        assertTrue(lobby.rename(account("P1"), "Zed"));
        FakeSocket watcher = FakeSocket.open();
        lobby.addSpectator(watcher.ctx);
        lobby.sendStateToAll();
        assertEquals(List.of("Zed", "P2", "P3"), names(watcher.last()));
    }

    @Test
    public void sameNameOrAbsentAccountChangesNothing() {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 1);
        assertFalse(lobby.rename(account("P1"), "P1"));
        assertFalse(lobby.rename("acct-nobody", "Nobody"));
    }

    @Test
    public void aRenameInsideTheGraceWindowSticks() {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 3);
        lobby.removeUser(players.get(0).ctx);
        assertTrue(lobby.rename(account("P1"), "Ann"));
        FakeSocket back = FakeSocket.open();
        lobby.addUser(back.ctx, account("P1"), "Ann");
        FakeSocket watcher = FakeSocket.open();
        lobby.addSpectator(watcher.ctx);
        lobby.sendStateToAll();
        assertEquals(List.of("Ann", "P2", "P3"), names(watcher.last()));
        assertEquals("Ann", back.last().getString("you"));
    }

    @Test
    public void aSeatedAccountCannotRename() {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 5);
        lobby.startNewGame();
        List<String> before = lobby.getUserNames();
        Map<String, String> seats = lobby.seatAccounts();
        try {
            lobby.rename(account("P1"), "Annie");
            fail("a seated account renamed");
        } catch (IllegalStateException expected) {
            // refused
        }
        assertEquals(before, lobby.getUserNames());
        assertEquals(seats, lobby.seatAccounts());
    }

    @Test
    public void seatsMapToAccounts() {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 3);
        assertTrue(lobby.seatAccounts().isEmpty());
        assertFalse(lobby.isSeated(account("P1")));
        lobby.startNewGame();
        Map<String, String> seats = lobby.seatAccounts();
        assertEquals(Set.of("P1", "P2", "P3"), seats.keySet());
        for (String name : seats.keySet()) {
            assertEquals(account(name), seats.get(name));
            assertTrue(lobby.isSeated(account(name)));
        }
        assertFalse(lobby.isSeated("acct-nobody"));
        seats.clear(); // a copy
        assertEquals(3, lobby.seatAccounts().size());
    }

    @Test
    public void seatNameIsTheSeatInTheRunningGame() {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 3);
        assertNull(lobby.seatName(players.get(0).ctx));
        lobby.startNewGame();
        assertEquals("P1", lobby.seatName(players.get(0).ctx));
        assertNull(lobby.seatName(FakeSocket.open().ctx));
    }

    @Test
    public void youIsTheViewersName() {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 3);
        FakeSocket spectator = FakeSocket.open();
        lobby.addSpectator(spectator.ctx);
        lobby.rename(account("P2"), "Annie");
        lobby.sendStateToAll();
        assertEquals("P1", players.get(0).last().getString("you"));
        assertEquals("Annie", players.get(1).last().getString("you"));
        assertEquals("P3", players.get(2).last().getString("you"));
        assertFalse(spectator.last().has("you"));
    }

    @Test
    public void youIsTheSeatNameInAGame() {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 5);
        FakeSocket spectator = FakeSocket.open();
        lobby.addSpectator(spectator.ctx);
        lobby.startNewGame();
        lobby.sendStateToAll();
        for (int i = 0; i < 5; i++) {
            assertEquals("P" + (i + 1), players.get(i).last().getString("you"));
        }
        assertFalse(spectator.last().has("you"));
    }
}
