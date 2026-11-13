package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import io.javalin.Javalin;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.AfterClass;
import org.junit.BeforeClass;
import org.junit.Test;
import server.util.Lobby;

/** The /game handshake and messages for spectators, over real sockets. */
public class SpectatorServerTest {
    private static Javalin app;
    private static int port;
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

    private TestSocket connect(String query) throws Exception {
        TestSocket socket = TestSocket.connect(port, query);
        sockets.add(socket);
        return socket;
    }

    private static JSONObject command(String code, String name, String command) {
        JSONObject message = new JSONObject().put("lobby", code).put("command", command);
        return name == null ? message : message.put("name", name);
    }

    private static HttpResponse<String> checkLogin(String query) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/check-login?" + query))
                .build();
        return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
    }

    /** Connects players with portraits p1.. and waits until each has its icon. */
    private List<TestSocket> players(String code, String... names) throws Exception {
        List<TestSocket> players = new ArrayList<>();
        for (int i = 0; i < names.length; i++) {
            TestSocket player = connect("lobby=" + code + "&name=" + names[i]);
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
        TestSocket.CloseInfo player = connect("lobby=NONE&name=Ann").awaitClose();
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

        HttpResponse<String> player = checkLogin("lobby=NONE&name=Ann");
        HttpResponse<String> spectator = checkLogin("lobby=NONE&spectator=true");
        assertEquals(404, player.statusCode());
        assertEquals(player.statusCode(), spectator.statusCode());
        assertEquals(player.body(), spectator.body());

        lobby("SPAC");
        players("SPAC", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10");
        assertEquals(489, checkLogin("lobby=SPAC&name=Zed").statusCode());
        assertEquals(200, checkLogin("lobby=SPAC&spectator=true").statusCode());

        lobby("SPAD").startNewGame(); // five CPU players
        assertEquals(488, checkLogin("lobby=SPAD&name=Zed").statusCode());
        assertEquals(200, checkLogin("lobby=SPAD&spectator=true").statusCode());
    }

    @Test
    public void playersSeeTheCount() throws Exception {
        lobby("SPAE");
        TestSocket player = connect("lobby=SPAE&name=Ann");
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
