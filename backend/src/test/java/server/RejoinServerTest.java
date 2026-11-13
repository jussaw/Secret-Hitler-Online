package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import io.javalin.Javalin;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.AfterClass;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;
import server.util.Lobby;

/**
 * A player who reloads keeps their seat for {@code Lobby.PLAYER_TIMEOUT_IN_SEC}. Inside that
 * window they can take it back through /check-login and the /game handshake, in a running game
 * (#10) and when every seat is taken, while a second live connection with the same name is still
 * refused. A player of the game can also rejoin after the window, as after a server restart. Over
 * real sockets.
 */
public class RejoinServerTest {
    private static Javalin app;
    private static int port;
    private final List<String> codes = new ArrayList<>();
    private final List<TestSocket> sockets = new ArrayList<>();
    private float graceSeconds;

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

    /** A long window, so a slow run cannot let it pass mid-test. The bug is the same at 3 s. */
    @Before
    public void widenTheWindow() {
        graceSeconds = Lobby.PLAYER_TIMEOUT_IN_SEC;
        Lobby.PLAYER_TIMEOUT_IN_SEC = 60;
    }

    @After
    public void cleanUp() {
        sockets.forEach(TestSocket::close);
        codes.forEach(SecretHitlerServer.codeToLobby::remove);
        Lobby.PLAYER_TIMEOUT_IN_SEC = graceSeconds;
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
        return new JSONObject().put("lobby", code).put("name", name).put("command", command);
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

    /** Seats the players and starts a game with no CPU players (five or more names). */
    private List<TestSocket> startGame(String code, String... names) throws Exception {
        List<TestSocket> players = players(code, names);
        players.get(0).send(command(code, names[0], "start-game"));
        for (TestSocket player : players) {
            player.nextState("CHANCELLOR_NOMINATION");
        }
        return players;
    }

    /** Closes the socket, as a reload does, and waits until the server has dropped it. */
    private static void reload(TestSocket socket, Lobby lobby, String name) throws InterruptedException {
        socket.close();
        long deadline = System.currentTimeMillis() + 5000;
        while (lobby.hasUserWithName(name)) {
            if (System.currentTimeMillis() > deadline) {
                fail(name + "'s socket was still in the lobby after 5 s");
            }
            Thread.sleep(10);
        }
    }

    /** Waits until the lobby counts {@code count} users, which it does once a window has passed. */
    private static void awaitUserCount(Lobby lobby, int count) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5000;
        while (lobby.getUserCount() != count) {
            if (System.currentTimeMillis() > deadline) {
                fail("the lobby still counted " + lobby.getUserCount() + " users after 5 s, not " + count);
            }
            Thread.sleep(10);
        }
    }

    private static List<String> usernames(JSONObject lobbyPacket) {
        List<String> names = new ArrayList<>();
        JSONArray array = lobbyPacket.getJSONArray("usernames");
        for (int i = 0; i < array.length(); i++) {
            names.add(array.getString(i));
        }
        Collections.sort(names);
        return names;
    }

    @Test
    public void aPlayerRejoinsAGameInsideTheGraceWindow() throws Exception {
        String code = "RJAA";
        Lobby lobby = lobby(code);
        List<TestSocket> players = startGame(code, "Ann", "Bob", "Cat", "Dan", "Eve");

        reload(players.get(0), lobby, "Ann");
        assertEquals("Ann is still inside the grace window", 5, lobby.getUserCount());

        HttpResponse<String> login = checkLogin("lobby=" + code + "&name=Ann");
        assertEquals(login.body(), 200, login.statusCode());
        assertEquals("a name that is not in the game is still refused", 488,
                checkLogin("lobby=" + code + "&name=Zed").statusCode());

        TestSocket rejoined = connect("lobby=" + code + "&name=Ann");
        JSONObject state = rejoined.nextState("CHANCELLOR_NOMINATION");
        assertTrue(state.getJSONArray("playerOrder").toList().contains("Ann"));
        assertTrue(rejoined.isOpen());
        assertTrue(lobby.hasUserWithName("Ann"));
    }

    @Test
    public void aSecondLiveConnectionWithTheSameNameIsRefused() throws Exception {
        String code = "RJAB";
        Lobby lobby = lobby(code);
        List<TestSocket> players = startGame(code, "Ann", "Bob", "Cat", "Dan", "Eve");

        assertEquals(488, checkLogin("lobby=" + code + "&name=Ann").statusCode());
        TestSocket.CloseInfo refused = connect("lobby=" + code + "&name=Ann").awaitClose();
        assertEquals(1002, refused.code);
        assertEquals("A user with the name Ann is already in the lobby.", refused.reason);
        assertTrue("the first connection is untouched", players.get(0).isOpen());
        assertTrue(lobby.hasUserWithName("Ann"));

        // The same holds for the connection of a player who has rejoined.
        reload(players.get(0), lobby, "Ann");
        TestSocket rejoined = connect("lobby=" + code + "&name=Ann");
        rejoined.nextState("CHANCELLOR_NOMINATION");
        assertEquals(488, checkLogin("lobby=" + code + "&name=Ann").statusCode());
        refused = connect("lobby=" + code + "&name=Ann").awaitClose();
        assertEquals("A user with the name Ann is already in the lobby.", refused.reason);
        assertTrue(rejoined.isOpen());
    }

    @Test
    public void aFullGameTakesItsPlayerBackInsideTheWindow() throws Exception {
        String code = "RJAC";
        Lobby lobby = lobby(code);
        String[] names = { "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10" };
        List<TestSocket> players = startGame(code, names);

        reload(players.get(9), lobby, "A10");
        assertTrue("every seat is still held", lobby.isFull());

        HttpResponse<String> login = checkLogin("lobby=" + code + "&name=A10");
        assertEquals(login.body(), 200, login.statusCode());
        TestSocket rejoined = connect("lobby=" + code + "&name=A10");
        rejoined.nextState("CHANCELLOR_NOMINATION");
        assertTrue(rejoined.isOpen());
        assertEquals("a name that is not in the game is still refused", 489,
                checkLogin("lobby=" + code + "&name=Zed").statusCode());
    }

    /** The path every player takes after a server restart, when no seat is held. */
    @Test
    public void aPlayerRejoinsAGameAfterTheGraceWindow() throws Exception {
        String code = "RJAF";
        Lobby lobby = lobby(code);
        List<TestSocket> players = startGame(code, "Ann", "Bob", "Cat", "Dan", "Eve");

        Lobby.PLAYER_TIMEOUT_IN_SEC = 0.2f; // read when the socket closes; cleanUp restores it
        reload(players.get(0), lobby, "Ann");
        awaitUserCount(lobby, 4); // the window has passed, and Ann's seat is released

        HttpResponse<String> login = checkLogin("lobby=" + code + "&name=Ann");
        assertEquals(login.body(), 200, login.statusCode());
        assertEquals("a name that is not in the game is still refused", 488,
                checkLogin("lobby=" + code + "&name=Zed").statusCode());

        TestSocket rejoined = connect("lobby=" + code + "&name=Ann");
        JSONObject state = rejoined.nextState("CHANCELLOR_NOMINATION");
        assertEquals("Ann's portrait is restored", "p1", state.getJSONObject("icon").getString("Ann"));
        assertTrue(rejoined.isOpen());
        assertTrue(lobby.hasUserWithName("Ann"));
    }

    @Test
    public void aFullGameTakesItsPlayerBackAfterTheWindow() throws Exception {
        String code = "RJAG";
        Lobby lobby = lobby(code);
        String[] names = { "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10" };
        List<TestSocket> players = startGame(code, names);

        Lobby.PLAYER_TIMEOUT_IN_SEC = 0.2f; // read when the socket closes; cleanUp restores it
        reload(players.get(9), lobby, "A10");
        awaitUserCount(lobby, 9);
        assertFalse("the released seat is no longer counted", lobby.isFull());
        assertEquals("an outsider is refused for the game", 488,
                checkLogin("lobby=" + code + "&name=Zed").statusCode());

        HttpResponse<String> login = checkLogin("lobby=" + code + "&name=A10");
        assertEquals(login.body(), 200, login.statusCode());
        TestSocket rejoined = connect("lobby=" + code + "&name=A10");
        rejoined.nextState("CHANCELLOR_NOMINATION");
        assertTrue(rejoined.isOpen());
        // Still 488, not 489: a rejoin during a game does not put the name back in the count that
        // isFull reads (activeUsernames). So this checks only that the outsider is refused.
        assertNotEquals("an outsider is still refused", 200,
                checkLogin("lobby=" + code + "&name=Zed").statusCode());
    }

    @Test
    public void aPlayerWhoRejoinsInsideTheWindowIsInTheLobbyAfterTheGame() throws Exception {
        String code = "RJAD";
        Lobby lobby = lobby(code);
        List<TestSocket> players = startGame(code, "Ann", "Bob", "Cat", "Dan", "Eve");

        reload(players.get(0), lobby, "Ann");
        TestSocket rejoined = connect("lobby=" + code + "&name=Ann");
        rejoined.nextState("CHANCELLOR_NOMINATION");

        synchronized (lobby) {
            GameDriver.playOut(lobby.game(), game -> {
            });
            lobby.updateAllUsers(); // sends the finished game, then ends it
        }
        assertFalse(lobby.isInGame());
        rejoined.send(command(code, "Ann", "get-state"));
        assertEquals(List.of("Ann", "Bob", "Cat", "Dan", "Eve"), usernames(rejoined.next("lobby")));
    }

    @Test
    public void aLobbyHoldsADisconnectedPlayersSeatForTheWindow() throws Exception {
        String code = "RJAE";
        Lobby lobby = lobby(code);
        String[] names = { "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10" };
        List<TestSocket> players = players(code, names);

        reload(players.get(9), lobby, "A10");
        assertEquals(10, lobby.getUserCount());
        assertEquals("the seat is held", 489, checkLogin("lobby=" + code + "&name=Zed").statusCode());

        assertEquals(200, checkLogin("lobby=" + code + "&name=A10").statusCode());
        TestSocket back = connect("lobby=" + code + "&name=A10");
        List<String> expected = new ArrayList<>(List.of(names));
        Collections.sort(expected);
        assertEquals(expected, usernames(back.next("lobby")));
        assertEquals(10, lobby.getUserCount());
    }
}
