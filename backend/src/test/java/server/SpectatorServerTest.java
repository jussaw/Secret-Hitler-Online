package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import io.javalin.Javalin;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Rule;
import org.junit.Test;
import server.util.Lobby;

/**
 * The /game handshake and messages for spectators, over real sockets. A spectator needs no session
 * and its socket no {@code Origin}; players here are signed in as their accounts.
 */
public class SpectatorServerTest {
    private static Javalin app;
    private static int port;

    @Rule
    public final SignedInPlayers accounts = new SignedInPlayers();

    private final List<String> codes = new ArrayList<>();
    private final List<TestSocket> sockets = new ArrayList<>();

    @BeforeClass
    public static void startServer() {
        app = Javalin.create()
                .get("/check-login", SecretHitlerServer::checkLogin)
                .ws("/game", ws -> {
                    ws.onConnect(SecretHitlerServer::onWebsocketConnect);
                    ws.onMessage(SecretHitlerServer::onWebSocketMessage);
                    ws.onClose(SecretHitlerServer::onWebSocketClose);
                })
                .start(0);
        port = app.port();
    }

    @AfterClass
    public static void stopServer() {
        app.stop();
    }

    @After
    public void cleanUp() {
        sockets.forEach(TestSocket::close);
        codes.forEach(SecretHitlerServer.codeToLobby::remove);
    }

    private Lobby lobby(String code) {
        Lobby lobby = new Lobby();
        SecretHitlerServer.codeToLobby.put(code, lobby);
        codes.add(code);
        return lobby;
    }

    /** Opens a spectator's socket: no session and no {@code Origin}. */
    private TestSocket connect(String query) throws Exception {
        return connect(query, Map.of());
    }

    private TestSocket connect(String query, Map<String, String> headers) throws Exception {
        TestSocket socket = TestSocket.connect(port, query, headers);
        sockets.add(socket);
        return socket;
    }

    /** Opens a socket of the player named {@code name}, signed in as their account. */
    private TestSocket connectAs(String name, String query) throws Exception {
        TestSocket socket = TestSocket.connect(port, query, accounts.session(name));
        sockets.add(socket);
        return socket;
    }

    private static JSONObject command(String code, String name, String command) {
        JSONObject message = new JSONObject().put("lobby", code).put("command", command);
        return name == null ? message : message.put("name", name);
    }

    /** A spectator's /check-login: no session. */
    private static HttpResponse<String> checkLogin(String query) throws Exception {
        return SignedInPlayers.checkLogin(port, query, null);
    }

    /** /check-login for the player named {@code name}, signed in as their account. */
    private HttpResponse<String> checkLoginAs(String name, String query) throws Exception {
        return SignedInPlayers.checkLogin(port, query, accounts.session(name));
    }

    /** Connects players with portraits p1.. and waits until each has its icon. */
    private List<TestSocket> players(String code, String... names) throws Exception {
        List<TestSocket> players = new ArrayList<>();
        for (int i = 0; i < names.length; i++) {
            TestSocket player = connectAs(names[i], "lobby=" + code);
            player.send(command(code, names[i], "select-icon").put("icon", "p" + (i + 1)));
            player.next("ok");
            players.add(player);
        }
        return players;
    }

    @Test
    public void aSpectatorConnectsWithoutAName() throws Exception {
        lobby("SPAA");
        JSONObject packet = connect("lobby=SPAA&spectator=true").next("lobby");
        assertEquals(new JSONArray().toString(), packet.getJSONArray("usernames").toString());
        assertEquals(1, packet.getInt("spectatorCount"));
    }

    @Test
    public void anUnknownLobbyGivesSpectatorsThePlayersError() throws Exception {
        TestSocket.CloseInfo player = connectAs("Ann", "lobby=NONE").awaitClose();
        TestSocket.CloseInfo spectator = connect("lobby=NONE&spectator=true").awaitClose();
        assertEquals(1002, player.code);
        assertEquals("The lobby 'NONE' does not exist.", player.reason);
        assertEquals(player.code, spectator.code);
        assertEquals(player.reason, spectator.reason);

        TestSocket.CloseInfo noLobby = connect("spectator=true").awaitClose();
        assertEquals(1002, noLobby.code);
        assertEquals("Must have the 'lobby' parameter.", noLobby.reason);
    }

    @Test
    public void checkLoginAcceptsSpectators() throws Exception {
        lobby("SPAB");
        assertEquals(200, checkLogin("lobby=SPAB&spectator=true").statusCode());
        assertEquals(400, checkLogin("spectator=true").statusCode());

        HttpResponse<String> player = checkLoginAs("Ann", "lobby=NONE");
        HttpResponse<String> spectator = checkLogin("lobby=NONE&spectator=true");
        assertEquals(404, player.statusCode());
        assertEquals(player.statusCode(), spectator.statusCode());
        assertEquals(player.body(), spectator.body());

        lobby("SPAC");
        players("SPAC", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10");
        assertEquals(489, checkLoginAs("Zed", "lobby=SPAC").statusCode());
        assertEquals(200, checkLogin("lobby=SPAC&spectator=true").statusCode());

        lobby("SPAD").startNewGame(); // five CPU players
        assertEquals(488, checkLoginAs("Zed", "lobby=SPAD").statusCode());
        assertEquals(200, checkLogin("lobby=SPAD&spectator=true").statusCode());
    }

    /**
     * A spectator needs no session: signed out (no cookie, or one that matches no session), its
     * /check-login and its socket are let in, and its socket is never checked for its
     * {@code Origin} (debug mode off here, where a player's is). Its packets carry no {@code you}.
     */
    @Test
    public void spectatorsNeedNoSession() throws Exception {
        boolean debug = ApplicationConfig.DEBUG;
        ApplicationConfig.DEBUG = false; // the Origin check is on, as outside debug mode
        try {
            lobby("SPAH");
            TestSocket ann = connectAs("Ann", "lobby=SPAH");
            ann.next("lobby");
            String signedOut = TestAccounts.signIn(accounts.store(), "gone", "Gone");
            accounts.store().deleteSession(signedOut);

            for (String token : new String[] { null, "junk", "", signedOut }) {
                assertEquals(String.valueOf(token), 200,
                        SignedInPlayers.checkLogin(port, "lobby=SPAH&spectator=true", token).statusCode());
            }
            List<TestSocket> watching = new ArrayList<>();
            watching.add(connect("lobby=SPAH&spectator=true"));
            watching.add(connect("lobby=SPAH&spectator=true", Map.of("Cookie", "session=junk")));
            watching.add(connect("lobby=SPAH&spectator=true",
                    Map.of("Cookie", "session=" + signedOut, "Origin", "http://another.example.test")));
            for (int i = 0; i < watching.size(); i++) {
                JSONObject packet = watching.get(i).next("lobby");
                assertEquals(List.of("Ann"), packet.getJSONArray("usernames").toList());
                assertFalse("a spectator's packet had " + packet, packet.has("you"));
            }
            while (ann.next("lobby").getInt("spectatorCount") < watching.size()) {
                // the count rises with each spectator
            }
            for (TestSocket spectator : watching) {
                spectator.send(command("SPAH", null, "ping"));
                spectator.next("pong");
                assertTrue(spectator.isOpen());
            }
        } finally {
            ApplicationConfig.DEBUG = debug;
        }
    }

    @Test
    public void playersSeeTheCount() throws Exception {
        lobby("SPAE");
        TestSocket player = connectAs("Ann", "lobby=SPAE");
        assertEquals(0, player.next("lobby").getInt("spectatorCount"));
        TestSocket spectator = connect("lobby=SPAE&spectator=true");
        assertEquals(1, player.next("lobby").getInt("spectatorCount"));
        spectator.close();
        assertEquals(0, player.next("lobby").getInt("spectatorCount"));
    }

    @Test
    public void everyCommandButPingAndGetStateIsDropped() throws Exception {
        String code = "SPAF";
        Lobby lobby = lobby(code);
        String[] names = { "Ann", "Bob", "Cat", "Dan", "Eve" };
        List<TestSocket> players = players(code, names);
        players.get(0).send(command(code, "Ann", "start-game"));
        JSONObject game = players.get(0).nextState("CHANCELLOR_NOMINATION");
        TestSocket spectator = connect("lobby=" + code + "&spectator=true");
        spectator.nextState("CHANCELLOR_NOMINATION");

        String president = game.getString("president");
        JSONArray order = game.getJSONArray("playerOrder");
        String nominee = order.getString((order.toList().indexOf(president) + 1) % order.length());
        TestSocket presidentSocket = players.get(List.of(names).indexOf(president));
        presidentSocket.send(command(code, president, "nominate-chancellor").put("target", nominee));
        for (TestSocket player : players) {
            player.nextState("CHANCELLOR_VOTING");
        }
        spectator.nextState("CHANCELLOR_VOTING");

        List<JSONObject> attempts = List.of(
                command(code, nominee, "register-vote").put("vote", true),
                command(code, null, "register-vote").put("vote", true),
                command(code, president, "start-game"),
                command(code, president, "set-lobby-size"),
                command(code, president, "select-icon").put("icon", "p6"),
                command(code, president, "nominate-chancellor").put("target", nominee),
                command(code, president, "register-president-choice").put("choice", 0),
                command(code, nominee, "register-chancellor-choice").put("choice", 0),
                command(code, nominee, "chancellor-veto"),
                command(code, president, "president-veto").put("veto", true),
                command(code, president, "register-execution").put("target", nominee),
                command(code, president, "register-special-election").put("target", nominee),
                command(code, president, "get-investigation").put("target", nominee),
                command(code, president, "register-peek"),
                command(code, president, "end-term"),
                command(code, president, "pause-term-timer"),
                command(code, president, "resume-term-timer"));
        for (JSONObject attempt : attempts) {
            spectator.send(attempt);
            spectator.send(command(code, null, "ping"));
            spectator.next("pong");
        }
        spectator.sendText("not json");
        spectator.send(command(code, null, "ping"));
        spectator.next("pong");

        assertEquals("no vote was registered", 0, lobby.game().getVotes().size());
        assertEquals("CHANCELLOR_VOTING", lobby.game().getState().toString());
        for (JSONObject packet : spectator.received()) {
            assertFalse("the spectator got " + packet, List.of("ok", "investigation").contains(packet.optString("type")));
        }
        assertTrue("the spectator is still connected", spectator.isOpen());

        spectator.send(command(code, null, "get-state"));
        JSONObject state = spectator.nextState("CHANCELLOR_VOTING");
        assertEquals(List.of(), Secrets.find(state));
    }

    @Test
    public void spectatorsDoNotKeepALobbyAlive() throws Exception {
        long minutes = Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN;
        Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN = 0; // the lobby starts out timed out
        Lobby lobby;
        try {
            lobby = lobby("SPAG");
        } finally {
            Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN = minutes;
        }
        TestSocket spectator = connect("lobby=SPAG&spectator=true");
        spectator.next("lobby");
        spectator.send(command("SPAG", null, "ping"));
        spectator.next("pong");
        assertTrue(lobby.hasTimedOut());

        SecretHitlerServer.removeInactiveLobbies();
        TestSocket.CloseInfo closed = spectator.awaitClose();
        assertEquals(1000, closed.code);
        assertEquals("The lobby has timed out.", closed.reason);
        assertFalse(SecretHitlerServer.codeToLobby.containsKey("SPAG"));
    }
}
