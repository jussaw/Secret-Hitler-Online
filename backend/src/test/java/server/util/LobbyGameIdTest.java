package server.util;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static server.util.LobbyTesting.join;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.json.JSONObject;
import org.junit.Rule;
import org.junit.Test;
import server.GameDriver;

/** Every game packet, to players and spectators, carries the running game's record ID ({@code gameId}). */
public class LobbyGameIdTest {
    private static final Set<String> VICTORY_STATES = Set.of("LIBERAL_VICTORY_POLICY", "LIBERAL_VICTORY_EXECUTION",
            "FASCIST_VICTORY_POLICY", "FASCIST_VICTORY_ELECTION");

    @Rule
    public final RecordedGames recorded = new RecordedGames();

    private final Lobby lobby = new Lobby();
    private final List<FakeSocket> sockets = new ArrayList<>();

    /** Five players, each with a portrait, and one spectator, all on fake sockets. */
    private void fillLobby() {
        for (int i = 1; i <= 5; i++) {
            FakeSocket player = FakeSocket.open();
            join(lobby, player.ctx, "P" + i);
            lobby.trySetUserIcon("p" + i, player.ctx);
            sockets.add(player);
        }
        FakeSocket spectator = FakeSocket.open();
        lobby.addSpectator(spectator.ctx);
        sockets.add(spectator);
    }

    /** The last packet of type {@code game} the socket was sent. */
    private static JSONObject lastGamePacket(FakeSocket socket) {
        for (int i = socket.sent.size() - 1; i >= 0; i--) {
            JSONObject packet = new JSONObject(socket.sent.get(i));
            if (packet.getString("type").equals("game")) {
                return packet;
            }
        }
        throw new AssertionError("no game packet was sent");
    }

    private void playOut() {
        GameDriver.playOut(lobby.game(), g -> {
            synchronized (lobby) {
                lobby.updateAllUsers();
            }
        });
    }

    @Test
    public void everyGamePacketCarriesTheGameId() {
        fillLobby();
        lobby.startNewGame();
        lobby.updateAllUsers();

        assertNotNull("the running game has an ID", lobby.gameId());
        for (int i = 0; i < sockets.size(); i++) {
            JSONObject packet = sockets.get(i).last();
            assertEquals("socket " + i + "'s packet type", "game", packet.getString("type"));
            assertEquals("socket " + i + "'s gameId", lobby.gameId(), packet.getString("gameId"));
        }
    }

    @Test
    public void theVictoryPacketCarriesTheGameId() {
        fillLobby();
        lobby.startNewGame();
        String id = lobby.gameId();
        playOut();

        for (int i = 0; i < sockets.size(); i++) {
            JSONObject packet = lastGamePacket(sockets.get(i));
            assertTrue("socket " + i + "'s last game packet is a victory: " + packet.getString("state"),
                    VICTORY_STATES.contains(packet.getString("state")));
            assertEquals("socket " + i + "'s gameId", id, packet.getString("gameId"));
        }
    }

    @Test
    public void eachGameHasItsOwnId() {
        fillLobby();
        lobby.startNewGame();
        String first = lobby.gameId();
        playOut();

        lobby.startNewGame();
        lobby.updateAllUsers();
        for (int i = 0; i < sockets.size(); i++) {
            JSONObject packet = sockets.get(i).last();
            assertEquals("socket " + i + "'s packet type", "game", packet.getString("type"));
            String id = packet.optString("gameId", null);
            assertNotNull("socket " + i + "'s gameId", id);
            assertNotEquals("socket " + i + "'s gameId is the new game's", first, id);
        }
    }
}
