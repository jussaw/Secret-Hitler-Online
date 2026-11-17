package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import io.javalin.Javalin;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;
import org.eclipse.jetty.websocket.api.StatusCode;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.AfterClass;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Rule;
import org.junit.Test;
import server.util.Lobby;

/**
 * #70 over real sockets: the host's {@code set-bot-count} reaches every player and spectator in
 * the lobby packet's {@code bots}, kept inside the range; anyone else's is refused (a guest's
 * closes their socket, as any command they may not make does, and a spectator's is dropped); one
 * that arrives once the game has started (a press just after START GAME) is dropped, the socket
 * kept; and START GAME seats the bots chosen.
 */
public class BotCountServerTest {
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
        app = Javalin.create()
                .ws("/game", ws -> {
                    ws.onConnect(SecretHitlerServer::onWebsocketConnect);
                    ws.onMessage(SecretHitlerServer::onWebSocketMessage);
                    ws.onClose(SecretHitlerServer::onWebSocketClose);
                })
                .wsException(Exception.class, (exception, ctx) -> {
                    thrown.add(exception);
                    ctx.session.close(StatusCode.SERVER_ERROR, String.valueOf(exception.getMessage()));
                })
                .start(0);
        port = app.port();
    }

    @AfterClass
    public static void stopServer() {
        app.stop();
    }

    @Before
    public void saveSettings() {
        savedGrace = Lobby.PLAYER_TIMEOUT_IN_SEC;
        Lobby.PLAYER_TIMEOUT_IN_SEC = 60; // no seat is let go during a test
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
        String code = String.format("BC%02d", nextCode++);
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

    private static JSONObject setBots(String code, Object count) {
        return command(code, "set-bot-count").put("count", count);
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

    /** The bots of the last lobby packet the socket received. */
    private static List<String> lastBots(TestSocket socket) {
        List<JSONObject> received = socket.received();
        for (int i = received.size() - 1; i >= 0; i--) {
            if ("lobby".equals(received.get(i).optString("type"))) {
                return received.get(i).getJSONArray("bots").toList().stream().map(String::valueOf)
                        .collect(Collectors.toList());
            }
        }
        throw new AssertionError("no lobby packet");
    }

    ////// Tests

    @Test
    public void theHostsCountReachesEveryone() throws Exception {
        String code = newLobby();
        List<TestSocket> players = players(code, "Ann", "Bea", "Cy", "Dot");
        TestSocket spectator = track(TestSocket.connect(port, "lobby=" + code + "&spectator=true"));
        spectator.next("lobby");
        players.get(0).send(setBots(code, 2));
        players.get(0).next("ok");
        for (TestSocket viewer : List.of(players.get(0), players.get(1), spectator)) {
            settle(viewer, code);
            assertEquals(List.of("Bot 1", "Bot 2"), lastBots(viewer));
        }
    }

    @Test
    public void theServerKeepsTheCountInsideTheRange() throws Exception {
        String code = newLobby();
        TestSocket host = players(code, "Ann", "Bea").get(0);
        host.send(setBots(code, 42));
        settle(host, code);
        assertEquals(8, lastBots(host).size());
        host.send(setBots(code, -1));
        settle(host, code);
        assertEquals(3, lastBots(host).size());
    }

    @Test
    public void aGuestCannotSetTheCount() throws Exception {
        String code = newLobby();
        List<TestSocket> players = players(code, "Ann", "Bea");
        players.get(1).send(setBots(code, 6));
        assertEquals(1002, players.get(1).awaitClose().code);
        settle(players.get(0), code);
        assertEquals("the fewest for two", 3, lastBots(players.get(0)).size());
        assertEquals(List.of(), thrown);
    }

    @Test
    public void aSpectatorsCountIsDropped() throws Exception {
        String code = newLobby();
        TestSocket host = players(code, "Ann").get(0);
        TestSocket spectator = track(TestSocket.connect(port, "lobby=" + code + "&spectator=true"));
        spectator.next("lobby");
        spectator.send(setBots(code, 9));
        settle(spectator, code);
        assertTrue("the spectator stays", spectator.isOpen());
        settle(host, code);
        assertEquals(4, lastBots(host).size());
    }

    @Test
    public void theStartSeatsTheChosenBots() throws Exception {
        String code = newLobby();
        List<TestSocket> players = players(code, "Ann", "Bea", "Cy");
        players.get(0).send(setBots(code, 4));
        players.get(0).next("ok");
        players.get(0).send(command(code, "start-game"));
        JSONObject game = players.get(0).nextState("CHANCELLOR_NOMINATION");
        Set<String> seats = new HashSet<>();
        JSONArray order = game.getJSONArray("playerOrder");
        for (int i = 0; i < order.length(); i++) {
            seats.add(order.getString(i));
        }
        assertEquals(Set.of("Ann", "Bea", "Cy", "Bot 1", "Bot 2", "Bot 3", "Bot 4"), seats);
    }

    @Test
    public void aCountSentAfterTheStartIsDropped() throws Exception {
        String code = newLobby();
        List<TestSocket> players = players(code, "Ann", "Bea", "Cy", "Dot", "Eve");
        players.get(0).send(command(code, "start-game"));
        players.get(0).send(setBots(code, 3)); // pressed before the game reached the page
        players.get(0).nextState("CHANCELLOR_NOMINATION");
        settle(players.get(0), code);
        assertTrue("the host's socket stays open", players.get(0).isOpen());
        assertEquals(5, SecretHitlerServer.codeToLobby.get(code).getUserNames().size());
        assertEquals(List.of(), thrown);
    }
}
