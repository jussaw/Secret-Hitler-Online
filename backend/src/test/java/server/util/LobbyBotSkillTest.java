package server.util;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static server.util.LobbyTesting.join;

import game.BotSkill;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/**
 * #72: the host chooses how well the bots play. A new lobby is Normal; the lobby packet says the
 * level to every viewer; START GAME seats every bot at it; it cannot change during a game, stays
 * after one, and a lobby restored from a backup is Normal again, while a restored game's bots keep
 * the level they were seated at.
 */
public class LobbyBotSkillTest {

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

    /** The bot skill the lobby packet says, as {@code socket} receives it now. */
    private static String packetSkill(Lobby lobby, FakeSocket socket) {
        synchronized (lobby) {
            lobby.sendStateToAll();
        }
        return socket.last().getString("botSkill");
    }

    /** The lobby written to a backup and read back. */
    private static Lobby restore(Lobby lobby) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ObjectOutputStream out = new ObjectOutputStream(bytes)) {
            out.writeObject(lobby);
        }
        try (ObjectInputStream in = new ObjectInputStream(new ByteArrayInputStream(bytes.toByteArray()))) {
            return (Lobby) in.readObject();
        }
    }

    ////// A new lobby

    @Test
    public void aNewLobbyIsNormal() {
        Lobby lobby = new Lobby();
        assertEquals(BotSkill.NORMAL, lobby.botSkill());
        FakeSocket host = addPlayer(lobby, 1);
        assertEquals("NORMAL", packetSkill(lobby, host));
    }

    @Test
    public void everyViewerGetsTheSkillInTheLobbyPacket() {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 2);
        FakeSocket spectator = FakeSocket.open();
        lobby.addSpectator(spectator.ctx);
        lobby.setBotSkill(BotSkill.HARD);
        assertEquals("HARD", packetSkill(lobby, players.get(1)));
        JSONObject watched = spectator.last();
        assertEquals("lobby", watched.getString("type"));
        assertEquals("HARD", watched.getString("botSkill"));
    }

    ////// Starting a game

    @Test
    public void theStartSeatsBotsAtTheChosenSkill() {
        for (BotSkill skill : BotSkill.values()) {
            Lobby lobby = new Lobby();
            addPlayers(lobby, 2);
            lobby.setBotSkill(skill);
            lobby.startNewGame();
            assertEquals(skill.name(), Map.of("Bot 1", skill, "Bot 2", skill, "Bot 3", skill),
                    lobby.seatedBotSkills());
        }
    }

    @Test
    public void aStartWithoutAChoiceSeatsNormalBots() {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 4);
        lobby.startNewGame();
        assertEquals(Map.of("Bot 1", BotSkill.NORMAL), lobby.seatedBotSkills());
    }

    @Test
    public void noBotsAreSeatedOutsideAGame() {
        Lobby lobby = new Lobby();
        assertTrue(lobby.seatedBotSkills().isEmpty());
        addPlayers(lobby, 2);
        lobby.startNewGame();
        lobby.dropGame();
        assertTrue(lobby.seatedBotSkills().isEmpty());
    }

    @Test
    public void theSkillCannotChangeDuringAGame() {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 2);
        lobby.setBotSkill(BotSkill.HARD);
        lobby.startNewGame();
        try {
            lobby.setBotSkill(BotSkill.EASY);
            fail("the skill is the lobby's, and cannot change during a game");
        } catch (IllegalStateException expected) {
            // expected
        }
        assertEquals(BotSkill.HARD, lobby.botSkill());
        assertEquals(Map.of("Bot 1", BotSkill.HARD, "Bot 2", BotSkill.HARD, "Bot 3", BotSkill.HARD),
                lobby.seatedBotSkills());
    }

    @Test
    public void aNullSkillIsRefused() {
        Lobby lobby = new Lobby();
        try {
            lobby.setBotSkill(null);
            fail("a null skill is refused");
        } catch (NullPointerException expected) {
            // expected
        }
        assertEquals(BotSkill.NORMAL, lobby.botSkill());
    }

    ////// After a game

    @Test
    public void theSkillStaysAfterAGame() {
        Lobby lobby = new Lobby();
        List<FakeSocket> players = addPlayers(lobby, 2);
        lobby.setBotSkill(BotSkill.HARD);
        lobby.startNewGame();
        lobby.dropGame();
        assertEquals(BotSkill.HARD, lobby.botSkill());
        assertEquals("HARD", packetSkill(lobby, players.get(0)));
        lobby.startNewGame();
        assertEquals(Map.of("Bot 1", BotSkill.HARD, "Bot 2", BotSkill.HARD, "Bot 3", BotSkill.HARD),
                lobby.seatedBotSkills());
    }

    ////// Backups

    @Test
    public void aRestoredLobbyIsNormal() throws Exception {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 2);
        lobby.setBotSkill(BotSkill.HARD);
        Lobby restored = restore(lobby);
        assertEquals(BotSkill.NORMAL, restored.botSkill());
        FakeSocket host = addPlayer(restored, 1);
        assertEquals("NORMAL", packetSkill(restored, host));
    }

    @Test
    public void aRestoredGameKeepsItsBotsSkill() throws Exception {
        Lobby lobby = new Lobby();
        addPlayers(lobby, 2);
        lobby.setBotSkill(BotSkill.HARD);
        lobby.startNewGame();
        Lobby restored = restore(lobby);
        assertEquals("the game's bots are backed up",
                Map.of("Bot 1", BotSkill.HARD, "Bot 2", BotSkill.HARD, "Bot 3", BotSkill.HARD),
                restored.seatedBotSkills());
        assertEquals("the next game's level", BotSkill.NORMAL, restored.botSkill());
    }
}
