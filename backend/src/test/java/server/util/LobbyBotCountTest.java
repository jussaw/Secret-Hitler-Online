package server.util;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static server.util.LobbyTesting.account;
import static server.util.LobbyTesting.join;
import static server.util.LobbyTesting.strings;
import static server.util.LobbyTesting.waitForUserCount;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/**
 * #70: the host chooses how many bots join. The count stays between the fewest bots that make a
 * table of five and the most that keep it at ten, as people join and leave, and the host's pick
 * comes back when the people allow it; a pick at the fewest follows the fewest; a new lobby, and
 * one restored from a backup, starts at the fewest; the lobby packet names the bots the game will
 * seat; and START GAME seats them.
 */
public class LobbyBotCountTest {

    private float savedTimeout;

    @Before
    public void saveGraceWindow() {
        savedTimeout = Lobby.PLAYER_TIMEOUT_IN_SEC;
        Lobby.PLAYER_TIMEOUT_IN_SEC = 60; // no removal fires unless a test asks for one
    }

    @After
    public void restoreGraceWindow() {
        Lobby.PLAYER_TIMEOUT_IN_SEC = savedTimeout;
    }

    /** Adds players "P1".."Pn" with portraits p1..pn. */
    private static List<FakeSocket> addPlayers(Lobby lobby, int count) {
        List<FakeSocket> players = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            players.add(addPlayer(lobby, i));
        }
        return players;
    }

    /** Adds the player "Pi" with the portrait pi. */
    private static FakeSocket addPlayer(Lobby lobby, int i) {
        FakeSocket player = FakeSocket.open();
        join(lobby, player.ctx, "P" + i);
        lobby.trySetUserIcon("p" + i, player.ctx);
        return player;
    }

    /** The bots the lobby packet names, as {@code socket} receives it now. */
    private static List<String> packetBots(Lobby lobby, FakeSocket socket) {
        synchronized (lobby) {
            lobby.sendStateToAll();
        }
        return strings(socket.last().getJSONArray("bots"));
    }

    private static List<String> bots(int count) {
        List<String> names = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            names.add("Bot " + i);
        }
        return names;
    }

    ////// A new lobby

    @Test
    public void aNewLobbyHasTheFewestBotsThatMakeFive() {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = new ArrayList<>();
        int[] expected = { 4, 3, 2, 1, 0, 0 };
        for (int i = 1; i <= expected.length; i++) {
            players.add(addPlayer(lobby, i));
            assertEquals(i + " players", expected[i - 1], lobby.botCount());
            assertEquals(i + " players", bots(expected[i - 1]), packetBots(lobby, players.get(0)));
        }
    }

    @Test
    public void everyViewerGetsTheBotsInTheLobbyPacket() {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 2);
        FakeSocket spectator = FakeSocket.open();
        lobby.addSpectator(spectator.ctx);
        lobby.setBotCount(4);
        assertEquals(bots(4), packetBots(lobby, players.get(1)));
        JSONObject watched = spectator.last();
        assertEquals("lobby", watched.getString("type"));
        assertEquals(4, watched.getJSONArray("bots").length());
        assertEquals("Bot 4", watched.getJSONArray("bots").getString(3));
    }

    ////// The host's choice

    @Test
    public void theCountStaysInsideTheRange() {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 4);
        lobby.setBotCount(2);
        assertEquals(2, lobby.botCount());
        lobby.setBotCount(-3);
        assertEquals("the fewest that make five", 1, lobby.botCount());
        lobby.setBotCount(99);
        assertEquals("the most that keep ten", 6, lobby.botCount());
        assertEquals(bots(6), packetBots(lobby, players.get(0)));
        lobby.setBotCount(0);
        assertEquals(1, lobby.botCount());
    }

    @Test
    public void tenPeopleHaveNoBots() {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 10);
        lobby.setBotCount(3);
        assertEquals(0, lobby.botCount());
        assertEquals(List.of(), packetBots(lobby, players.get(0)));
    }

    @Test
    public void aJoinKeepsTheHostsCount() {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 4);
        lobby.setBotCount(2);
        addPlayer(lobby, 5);
        assertEquals("a table of seven", 2, lobby.botCount());
    }

    @Test
    public void aJoinDropsBotsOnlyAsFarAsItMust() {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 4);
        lobby.setBotCount(6);
        assertFalse("bots never fill the lobby", lobby.isFull());
        assertNull(lobby.joinRefusal(account("P5"), null));
        addPlayer(lobby, 5);
        assertEquals("a bot gives up its seat", 5, lobby.botCount());
        addPlayer(lobby, 6);
        assertEquals(4, lobby.botCount());
    }

    @Test
    public void aCountAboveTheFewestIsKeptWhenFewerPeopleNeedNoMore() {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 2);
        lobby.setBotCount(4); // one more than the fewest for two
        addPlayer(lobby, 3);
        assertEquals("the host's count, not the fewest for three", 4, lobby.botCount());
        assertEquals(bots(4), packetBots(lobby, players.get(0)));
    }

    @Test
    public void aCountAtTheFewestFollowsTheFewest() {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 2);
        lobby.setBotCount(4);
        lobby.setBotCount(3); // + then -: back at the fewest for two
        addPlayer(lobby, 3);
        assertEquals("as if the host had never pressed", 2, lobby.botCount());
        addPlayer(lobby, 4);
        assertEquals(1, lobby.botCount());
    }

    @Test
    public void aLeaveGivesBackTheBotsAJoinTook() throws Exception {
        Lobby.PLAYER_TIMEOUT_IN_SEC = 0.05f;
        Lobby lobby = new Lobby();
        addPlayers(lobby, 4);
        lobby.setBotCount(6);
        FakeSocket fifth = addPlayer(lobby, 5);
        assertEquals(5, lobby.botCount());
        lobby.removeUser(fifth.ctx);
        waitForUserCount(lobby, 4);
        assertEquals("the host's six again", 6, lobby.botCount());
    }

    @Test
    public void aLeaveAddsABotBelowFive() throws Exception {
        Lobby.PLAYER_TIMEOUT_IN_SEC = 0.05f;
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 4);
        lobby.setBotCount(1);
        lobby.removeUser(players.get(3).ctx);
        waitForUserCount(lobby, 3);
        assertEquals("still a table of five", 2, lobby.botCount());
        assertEquals(bots(2), packetBots(lobby, players.get(0)));
    }

    @Test
    public void aLeaveAboveFiveKeepsTheCount() throws Exception {
        Lobby.PLAYER_TIMEOUT_IN_SEC = 0.05f;
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 5);
        lobby.setBotCount(3);
        lobby.removeUser(players.get(4).ctx);
        waitForUserCount(lobby, 4);
        assertEquals(3, lobby.botCount());
    }

    @Test
    public void onlyTheFirstPlayerIsTheHost() {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 3);
        assertTrue(lobby.isHost(account("P1")));
        assertFalse(lobby.isHost(account("P2")));
        assertFalse(lobby.isHost(null));
    }

    ////// Starting a game

    @Test
    public void theStartSeatsTheChosenBots() {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 4);
        lobby.setBotCount(3);
        lobby.startNewGame();
        assertEquals(Set.of("P1", "P2", "P3", "P4", "Bot 1", "Bot 2", "Bot 3"),
                new HashSet<>(lobby.getUserNames()));
    }

    @Test
    public void aStartWithoutAChoiceFillsToFive() {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 2);
        lobby.startNewGame();
        assertEquals(Set.of("P1", "P2", "Bot 1", "Bot 2", "Bot 3"), new HashSet<>(lobby.getUserNames()));
    }

    @Test
    public void aStartWorksTheRangeOutAfterDroppingTheGraceWindow() {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 5);
        lobby.setBotCount(0);
        lobby.removeUser(players.get(4).ctx); // P5 is inside the grace window, and is not seated
        lobby.startNewGame();
        assertEquals("one bot makes five", Set.of("P1", "P2", "P3", "P4", "Bot 1"),
                new HashSet<>(lobby.getUserNames()));
    }

    @Test
    public void aStartKeepsAFullTableAfterDroppingTheGraceWindow() {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 5);
        lobby.setBotCount(5);
        lobby.removeUser(players.get(4).ctx);
        lobby.startNewGame();
        assertEquals("four people and the five bots chosen", 9, lobby.getUserNames().size());
    }

    @Test
    public void theCountCannotChangeDuringAGame() {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 4);
        lobby.setBotCount(2);
        lobby.startNewGame();
        try {
            lobby.setBotCount(3);
            fail("the count is the lobby's, and cannot change during a game");
        } catch (IllegalStateException expected) {
            // expected
        }
        assertEquals(6, lobby.getUserNames().size());
    }

    ////// After a game

    @Test
    public void theHostsCountStaysAfterAGame() {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 4);
        lobby.setBotCount(3);
        lobby.startNewGame();
        lobby.dropGame();
        assertEquals(3, lobby.botCount());
    }

    @Test
    public void theCountMovesIntoTheRangeWhenThePeopleChangedDuringAGame() throws Exception {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 4);
        lobby.setBotCount(2);
        lobby.startNewGame();
        Lobby.PLAYER_TIMEOUT_IN_SEC = 0.05f;
        lobby.removeUser(players.get(2).ctx); // P3 and P4 leave the game for good
        lobby.removeUser(players.get(3).ctx);
        waitForUserCount(lobby, 2);
        lobby.dropGame();
        assertEquals("a table of five again", 3, lobby.botCount());
    }

    ////// Backups

    @Test
    public void aRestoredLobbyStartsAtTheFewestBots() throws Exception {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 2);
        lobby.setBotCount(6);
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ObjectOutputStream out = new ObjectOutputStream(bytes)) {
            out.writeObject(lobby);
        }
        Lobby restored;
        try (ObjectInputStream in = new ObjectInputStream(new ByteArrayInputStream(bytes.toByteArray()))) {
            restored = (Lobby) in.readObject();
        }
        FakeSocket host = addPlayer(restored, 1);
        assertEquals(4, restored.botCount());
        assertEquals(bots(4), packetBots(restored, host));
    }
}
