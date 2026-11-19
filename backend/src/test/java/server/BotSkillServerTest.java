package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import game.BotSkill;
import io.javalin.Javalin;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Predicate;
import org.eclipse.jetty.websocket.api.StatusCode;
import org.json.JSONObject;
import org.junit.After;
import org.junit.AfterClass;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Rule;
import org.junit.Test;
import server.util.Lobby;

/**
 * #72 over real sockets: the host's {@code set-bot-skill} reaches every player and spectator in
 * the lobby packet's {@code botSkill}; anyone else's is refused (a guest's closes their socket, as
 * any command they may not make does, and a spectator's is dropped), as is a level the server does
 * not know; one that arrives once the game has started (a press just after START GAME) is dropped,
 * the socket kept; and when the host leaves, the next host sees the level chosen and sets it.
 */
public class BotSkillServerTest {
    private static Javalin app;
    private static int port;
    // Every exception a /game handler let out, which Javalin would log and answer with 1011.
    private static final List<Exception> thrown = new CopyOnWriteArrayList<>();

    @Rule
    public final SignedInPlayers accounts = new SignedInPlayers();

    private final List<String> codes = new ArrayList<>();
    private final List<TestSocket> sockets = new CopyOnWriteArrayList<>();
    private float savedGrace;
    private String savedRedirectUri;
    private int nextCode;

    @BeforeClass
    public static void startServer() {
        app = ServerTesting.startOnLoopback(Javalin.create()
                .ws("/game", ws -> {
                    ws.onConnect(SecretHitlerServer::onWebsocketConnect);
                    ws.onMessage(SecretHitlerServer::onWebSocketMessage);
                    ws.onClose(SecretHitlerServer::onWebSocketClose);
                })
                .wsException(Exception.class, (exception, ctx) -> {
                    thrown.add(exception);
                    ctx.session.close(StatusCode.SERVER_ERROR, String.valueOf(exception.getMessage()));
                }));
        port = app.port();
    }

    @AfterClass
    public static void stopServer() {
        app.stop();
    }

    @Before
    public void saveSettings() {
        savedGrace = Lobby.PLAYER_TIMEOUT_IN_SEC;
        Lobby.PLAYER_TIMEOUT_IN_SEC = 60; // no seat is let go during a test, unless it asks
        // A player's socket is checked against the Host it connects to, the origin TestSocket sends.
        savedRedirectUri = ApplicationConfig.DISCORD_REDIRECT_URI;
        ApplicationConfig.DISCORD_REDIRECT_URI = null;
        thrown.clear();
    }

    @After
    public void cleanUp() {
        sockets.forEach(TestSocket::close);
        codes.forEach(SecretHitlerServer.codeToLobby::remove);
        Lobby.PLAYER_TIMEOUT_IN_SEC = savedGrace;
        ApplicationConfig.DISCORD_REDIRECT_URI = savedRedirectUri;
    }

    ////// Helpers

    /** A new lobby, registered under a code of this test's. */
    private String newLobby() {
        String code = String.format("BS%02d", nextCode++);
        SecretHitlerServer.codeToLobby.put(code, new Lobby());
        codes.add(code);
        return code;
    }

    private TestSocket track(TestSocket socket) {
        sockets.add(socket);
        return socket;
    }

    private static JSONObject command(String code, String command) {
        return new JSONObject().put("lobby", code).put("command", command);
    }

    /** A set-bot-skill with this skill, or with none when it is null. */
    private static JSONObject setSkill(String code, Object skill) {
        JSONObject message = command(code, "set-bot-skill");
        return skill == null ? message : message.put("skill", skill);
    }

    /** Connects the players with portraits p1.., and waits until each has its icon. */
    private List<TestSocket> players(String code, String... names) throws Exception {
        List<TestSocket> players = new ArrayList<>();
        for (int i = 0; i < names.length; i++) {
            TestSocket player = track(TestSocket.connect(port, "lobby=" + code, accounts.session(names[i])));
            player.send(command(code, "select-icon").put("icon", "p" + (i + 1)));
            player.next("ok");
            players.add(player);
        }
        return players;
    }

    /** Pings and waits for the pong, so every packet the lobby sent before it has arrived. */
    private static void settle(TestSocket socket, String code) throws Exception {
        socket.send(command(code, "ping"));
        socket.next("pong");
    }

    /** The last lobby packet the socket received, or null for none. */
    private static JSONObject lastLobby(TestSocket socket) {
        List<JSONObject> received = socket.received();
        for (int i = received.size() - 1; i >= 0; i--) {
            if ("lobby".equals(received.get(i).optString("type"))) {
                return received.get(i);
            }
        }
        return null;
    }

    /** The bot skill of the last lobby packet the socket received. */
    private static String lastSkill(TestSocket socket) {
        JSONObject packet = lastLobby(socket);
        if (packet == null) {
            throw new AssertionError("no lobby packet");
        }
        return packet.getString("botSkill");
    }

    /** Waits up to 5 s for the socket's last lobby packet to match. */
    private static void awaitLobby(TestSocket socket, Predicate<JSONObject> matches) throws Exception {
        long deadline = System.currentTimeMillis() + 5_000;
        while (true) {
            JSONObject packet = lastLobby(socket);
            if (packet != null && matches.test(packet)) {
                return;
            }
            if (System.currentTimeMillis() > deadline) {
                throw new AssertionError("no matching lobby packet; the last was " + packet);
            }
            Thread.sleep(20);
        }
    }

    ////// Tests

    @Test
    public void theHostsSkillReachesEveryone() throws Exception {
        String code = newLobby();
        List<TestSocket> players = players(code, "Ann", "Bea", "Cy", "Dot");
        TestSocket spectator = track(TestSocket.connect(port, "lobby=" + code + "&spectator=true"));
        assertEquals("NORMAL", spectator.next("lobby").getString("botSkill"));
        players.get(0).send(setSkill(code, "HARD"));
        players.get(0).next("ok");
        for (TestSocket viewer : List.of(players.get(0), players.get(1), spectator)) {
            settle(viewer, code);
            assertEquals("HARD", lastSkill(viewer));
        }
    }

    @Test
    public void aGuestCannotSetTheSkill() throws Exception {
        String code = newLobby();
        List<TestSocket> players = players(code, "Ann", "Bea");
        players.get(1).send(setSkill(code, "HARD"));
        assertEquals(1002, players.get(1).awaitClose().code);
        settle(players.get(0), code);
        assertEquals("NORMAL", lastSkill(players.get(0)));
        assertEquals(List.of(), thrown);
    }

    @Test
    public void aSpectatorsSkillIsDropped() throws Exception {
        String code = newLobby();
        TestSocket host = players(code, "Ann").get(0);
        TestSocket spectator = track(TestSocket.connect(port, "lobby=" + code + "&spectator=true"));
        spectator.next("lobby");
        spectator.send(setSkill(code, "HARD"));
        settle(spectator, code);
        assertTrue("the spectator stays", spectator.isOpen());
        settle(host, code);
        assertEquals("NORMAL", lastSkill(host));
        assertEquals(List.of(), thrown);
    }

    @Test
    public void anUnknownSkillIsRefused() throws Exception {
        for (Object skill : Arrays.asList(null, "hard", "EXPERT", 2, JSONObject.NULL)) {
            String code = newLobby();
            List<TestSocket> players = players(code, "Ann" + nextCode, "Bea" + nextCode);
            players.get(0).send(setSkill(code, skill));
            assertEquals("skill " + skill, 1002, players.get(0).awaitClose().code);
            settle(players.get(1), code);
            assertEquals("skill " + skill, "NORMAL", lastSkill(players.get(1)));
            assertEquals("skill " + skill, BotSkill.NORMAL, SecretHitlerServer.codeToLobby.get(code).botSkill());
        }
        assertEquals(List.of(), thrown);
    }

    @Test
    public void aSkillSentAfterTheStartIsDropped() throws Exception {
        String code = newLobby();
        List<TestSocket> players = players(code, "Ann", "Bea", "Cy", "Dot", "Eve");
        players.get(0).send(command(code, "start-game"));
        players.get(0).send(setSkill(code, "EASY")); // pressed before the game reached the page
        players.get(0).nextState("CHANCELLOR_NOMINATION");
        settle(players.get(0), code);
        assertTrue("the host's socket stays open", players.get(0).isOpen());
        assertEquals(BotSkill.NORMAL, SecretHitlerServer.codeToLobby.get(code).botSkill());
        assertEquals(List.of(), thrown);
    }

    @Test
    public void theNextHostSetsTheSkill() throws Exception {
        String code = newLobby();
        List<TestSocket> players = players(code, "Ann", "Bea");
        TestSocket ann = players.get(0);
        TestSocket bea = players.get(1);
        ann.send(setSkill(code, "HARD"));
        ann.next("ok");
        Lobby.PLAYER_TIMEOUT_IN_SEC = 0.05f;
        ann.close();
        awaitLobby(bea, packet -> packet.getJSONArray("usernames").toList().equals(List.of("Bea")));
        assertEquals("the level the old host chose", "HARD", lastSkill(bea));
        bea.send(setSkill(code, "EASY"));
        bea.next("ok");
        settle(bea, code);
        assertEquals("EASY", lastSkill(bea));
    }
}
