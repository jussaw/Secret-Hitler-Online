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
import org.json.JSONObject;
import org.junit.Test;
import server.Secrets;

public class LobbySpectatorTest {

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

    /** JUnit 4.12 has no assertThrows. */
    private static void expectIllegalArgument(Runnable call) {
        try {
            call.run();
            fail("expected an IllegalArgumentException");
        } catch (IllegalArgumentException expected) {
            // as expected
        }
    }

    private static List<String> strings(JSONArray array) {
        List<String> out = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) {
            out.add(array.getString(i));
        }
        return out;
    }

    @Test
    public void aSpectatorTakesNoSeat() {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 3);
        lobby.addSpectator(FakeSocket.open().ctx);
        lobby.addSpectator(FakeSocket.open().ctx);
        assertEquals(3, lobby.getUserCount());
        assertEquals(2, lobby.getSpectatorCount());
        assertFalse(lobby.isFull());
        assertEquals(Set.of("P1", "P2", "P3"), new HashSet<>(lobby.getUserNames()));

        Lobby full = new Lobby();
        addPlayers(full, 10);
        full.addSpectator(FakeSocket.open().ctx);
        assertTrue(full.isFull());
        assertEquals(10, full.getUserCount());
    }

    @Test
    public void spectatorsGetEveryUpdate() {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 2);
        FakeSocket spectator = FakeSocket.open();
        lobby.addSpectator(spectator.ctx);

        lobby.updateAllUsers();

        JSONObject packet = spectator.last();
        assertEquals("lobby", packet.getString("type"));
        assertEquals(Set.of("P1", "P2"), new HashSet<>(strings(packet.getJSONArray("usernames"))));
        assertEquals("p1", packet.getJSONObject("icon").getString("P1"));
        assertEquals(1, packet.getInt("spectatorCount"));
        for (FakeSocket player : players) {
            assertEquals(1, player.last().getInt("spectatorCount"));
        }
    }

    @Test
    public void spectatorsGetTheSpectatorPacketDuringAGame() {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 5);
        lobby.startNewGame();
        FakeSocket spectator = FakeSocket.open();
        lobby.addSpectator(spectator.ctx);

        lobby.updateAllUsers();

        JSONObject packet = spectator.last();
        assertEquals("game", packet.getString("type"));
        assertEquals(1, packet.getInt("spectatorCount"));
        assertEquals(List.of(), Secrets.find(packet));
        for (int i = 0; i < players.size(); i++) {
            JSONObject own = players.get(i).last().getJSONObject("players").getJSONObject("P" + (i + 1));
            assertTrue("P" + (i + 1) + " sees their own role", own.has("id"));
        }
    }

    @Test
    public void playersGetTheSameKeysPlusTheCount() {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 5);
        lobby.startNewGame();
        lobby.updateAllUsers();

        Set<String> expected = new HashSet<>(GameToJSONConverter.convert(lobby.game(), "P1").keySet());
        expected.addAll(Set.of("type", "icon", "spectatorCount"));
        assertEquals(expected, players.get(0).last().keySet());
        assertEquals(0, players.get(0).last().getInt("spectatorCount"));
    }

    @Test
    public void aSpectatorOnlyLobbyIsInactive() {
        long minutes = Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN;
        Lobby lobby;
        Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN = 0; // the lobby starts out timed out
        try {
            lobby = new Lobby();
        } finally {
            Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN = minutes;
        }
        FakeSocket player = FakeSocket.open();
        FakeSocket spectator = FakeSocket.open();
        lobby.addUser(player.ctx, "P1");
        lobby.addSpectator(spectator.ctx);
        lobby.removeUser(player.ctx);

        lobby.recordActivity(spectator.ctx);
        assertTrue("a spectator does not keep the lobby alive", lobby.hasTimedOut());

        FakeSocket next = FakeSocket.open();
        lobby.addUser(next.ctx, "P2");
        lobby.recordActivity(next.ctx);
        assertFalse("a player does", lobby.hasTimedOut());
    }

    @Test
    public void connectionsIncludeSpectators() {
        Lobby lobby = new Lobby();
        FakeSocket player = addPlayers(lobby, 1).get(0);
        FakeSocket spectator = FakeSocket.open();
        lobby.addSpectator(spectator.ctx);
        assertTrue(lobby.isSpectator(spectator.ctx));
        assertFalse(lobby.isSpectator(player.ctx));
        assertEquals(Set.of(player.ctx, spectator.ctx), new HashSet<>(lobby.getConnections()));

        lobby.removeSpectator(spectator.ctx);
        assertFalse(lobby.isSpectator(spectator.ctx));
        assertEquals(0, lobby.getSpectatorCount());
        assertEquals(Set.of(player.ctx), new HashSet<>(lobby.getConnections()));
    }

    @Test
    public void addSpectatorRejectsAPlayerOrASecondAdd() {
        Lobby lobby = new Lobby();
        FakeSocket player = addPlayers(lobby, 1).get(0);
        FakeSocket spectator = FakeSocket.open();
        lobby.addSpectator(spectator.ctx);
        expectIllegalArgument(() -> lobby.addSpectator(player.ctx));
        expectIllegalArgument(() -> lobby.addSpectator(spectator.ctx));
        expectIllegalArgument(() -> lobby.removeSpectator(player.ctx));
    }

    @Test
    public void spectatorsAreNotBackedUp() throws Exception {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 1);
        lobby.addSpectator(FakeSocket.open().ctx);

        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ObjectOutputStream out = new ObjectOutputStream(bytes)) {
            out.writeObject(lobby);
        }
        Lobby copy;
        try (ObjectInputStream in = new ObjectInputStream(new ByteArrayInputStream(bytes.toByteArray()))) {
            copy = (Lobby) in.readObject();
        }

        assertEquals(0, copy.getSpectatorCount());
        FakeSocket spectator = FakeSocket.open();
        copy.addSpectator(spectator.ctx);
        assertTrue(copy.isSpectator(spectator.ctx));
    }
}
