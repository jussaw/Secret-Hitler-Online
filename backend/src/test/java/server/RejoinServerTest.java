package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import io.javalin.Javalin;
import io.javalin.websocket.WsContext;
import java.lang.management.ManagementFactory;
import java.lang.management.ThreadInfo;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;
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
 * refused. A player of the game can also rejoin after the window, as after a server restart. And
 * a page whose network dropped without the server noticing takes its name back from its own dead
 * connection by bringing the same rejoin key (#26), which no other connection can do. Two
 * connections that arrive at once for one name, or for the last seat, are checked and added one at
 * a time, so the second gets what it would get had it come later (#43). Over real sockets.
 */
public class RejoinServerTest {
    private static Javalin app;
    private static int port;
    private final List<String> codes = new ArrayList<>();
    private final List<TestSocket> sockets = new CopyOnWriteArrayList<>(); // connectAtOnce adds from two threads
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
        return register(code, new Lobby());
    }

    private RacingLobby racingLobby(String code) {
        return register(code, new RacingLobby());
    }

    private <L extends Lobby> L register(String code, L lobby) {
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

    /** The rejoin key a test page sends for {@code name}. */
    private static String keyOf(String name) {
        return "key-of-" + name;
    }

    /**
     * Connects players with portraits p1.., each bringing {@code keyOf(name)} as the browser client
     * does, and waits until each has its icon.
     */
    private List<TestSocket> players(String code, String... names) throws Exception {
        List<TestSocket> players = new ArrayList<>();
        for (int i = 0; i < names.length; i++) {
            TestSocket player = connect("lobby=" + code + "&name=" + names[i] + "&rejoinKey=" + keyOf(names[i]));
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

    /** Waits up to 5 s for the condition to hold, and fails with the message if it never does. */
    private static void awaitTrue(BooleanSupplier condition, Supplier<String> failure) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5000;
        while (!condition.getAsBoolean()) {
            if (System.currentTimeMillis() > deadline) {
                fail(failure.get());
            }
            Thread.sleep(10);
        }
    }

    /** Closes the socket, as a reload does, and waits until the server has dropped it. */
    private static void reload(TestSocket socket, Lobby lobby, String name) throws InterruptedException {
        socket.close();
        awaitTrue(() -> !lobby.hasUserWithName(name), () -> name + "'s socket was still in the lobby after 5 s");
    }

    /** Waits until the lobby counts {@code count} users, which it does once a window has passed. */
    private static void awaitUserCount(Lobby lobby, int count) throws InterruptedException {
        awaitTrue(() -> lobby.getUserCount() == count,
                () -> "the lobby still counted " + lobby.getUserCount() + " users after 5 s, not " + count);
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
        assertTrue("the returning player is counted again (#41)", lobby.isFull());
        assertEquals("an outsider finds the lobby full again", 489,
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

    /** Fails if, within half a second, the name loses its connection or the lobby a user. */
    private static void assertStaysSeated(Lobby lobby, String name, int users, TestSocket socket)
            throws InterruptedException {
        long until = System.currentTimeMillis() + 500;
        while (System.currentTimeMillis() < until) {
            assertTrue(name + " lost their connection", lobby.hasUserWithName(name));
            assertEquals(users, lobby.getUserCount());
            assertTrue(socket.isOpen());
            Thread.sleep(20);
        }
    }

    /** #26: the old connection here is open, as a dead one looks to the server until its idle timeout. */
    @Test
    public void aPageReconnectingWithItsKeyTakesItsNameBackFromItsDeadConnection() throws Exception {
        String code = "RJAH";
        Lobby lobby = lobby(code);
        List<TestSocket> players = startGame(code, "Ann", "Bob", "Cat", "Dan", "Eve");
        TestSocket dead = players.get(0);

        TestSocket back = connect("lobby=" + code + "&name=Ann&rejoinKey=" + keyOf("Ann"));
        JSONObject state = back.nextState("CHANCELLOR_NOMINATION");
        assertEquals("Ann's portrait is kept", "p1", state.getJSONObject("icon").getString("Ann"));

        TestSocket.CloseInfo replaced = dead.awaitClose();
        assertEquals(SecretHitlerServer.CLOSE_REPLACED, replaced.code);
        assertEquals("Replaced by a newer connection under the same name.", replaced.reason);
        // The old connection's close, once the server sees it, takes nothing from the new one.
        assertStaysSeated(lobby, "Ann", 5, back);

        // A pong comes only to a connection the server knows as Ann's (onWebSocketMessage checks).
        back.send(command(code, "Ann", "ping"));
        back.next("pong");
        for (TestSocket player : List.of(back, players.get(1))) {
            for (JSONObject packet : player.received()) {
                assertFalse("a packet carried a rejoin key", packet.toString().contains("key-of-"));
            }
        }
    }

    @Test
    public void onlyTheKeyTheNamesConnectionBroughtTakesItsPlace() throws Exception {
        String code = "RJAI";
        Lobby lobby = lobby(code);
        List<TestSocket> players = startGame(code, "Ann", "Bob", "Cat", "Dan", "Eve");

        for (String key : List.of("&rejoinKey=" + keyOf("Bob"), "&rejoinKey=", "")) {
            TestSocket.CloseInfo refused = connect("lobby=" + code + "&name=Ann" + key).awaitClose();
            assertEquals(key, 1002, refused.code);
            assertEquals(key, "A user with the name Ann is already in the lobby.", refused.reason);
        }
        assertTrue("Ann's connection is untouched", players.get(0).isOpen());
        assertTrue(lobby.hasUserWithName("Ann"));
    }

    /** An older client sends no key, and nothing can take its connection's place. */
    @Test
    public void aConnectionOpenedWithoutAKeyIsNotReplaced() throws Exception {
        String code = "RJAJ";
        lobby(code);
        TestSocket ann = connect("lobby=" + code + "&name=Ann");
        ann.next("lobby");

        TestSocket.CloseInfo refused = connect("lobby=" + code + "&name=Ann&rejoinKey=" + keyOf("Ann"))
                .awaitClose();
        assertEquals("A user with the name Ann is already in the lobby.", refused.reason);
        assertTrue(ann.isOpen());
    }

    @Test
    public void aFullLobbyTakesItsPlayerBackFromTheirDeadConnection() throws Exception {
        String code = "RJAK";
        Lobby lobby = lobby(code);
        String[] names = { "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10" };
        List<TestSocket> players = players(code, names);

        TestSocket back = connect("lobby=" + code + "&name=A10&rejoinKey=" + keyOf("A10"));
        JSONObject packet = back.next("lobby");
        List<String> expected = new ArrayList<>(List.of(names));
        Collections.sort(expected);
        assertEquals(expected, usernames(packet));
        assertEquals("A10's portrait is kept", "p10", packet.getJSONObject("icon").getString("A10"));
        assertEquals(SecretHitlerServer.CLOSE_REPLACED, players.get(9).awaitClose().code);
        assertStaysSeated(lobby, "A10", 10, back);
    }

    @Test
    public void anOutsiderIsRefusedByAFullLobbyAndByAGame() throws Exception {
        String full = "RJAP";
        lobby(full);
        players(full, "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10");
        TestSocket.CloseInfo refused = connect("lobby=" + full + "&name=Zed").awaitClose();
        assertEquals(1002, refused.code);
        assertEquals("The lobby " + full + " is currently full.", refused.reason);

        String playing = "RJAQ";
        lobby(playing);
        startGame(playing, "Ann", "Bob", "Cat", "Dan", "Eve");
        refused = connect("lobby=" + playing + "&name=Zed").awaitClose();
        assertEquals(1002, refused.code);
        assertEquals("The lobby " + playing + " is currently in a game..", refused.reason);
    }

    /** How long the first add of a race waits for the second connection: long enough for a slow run. */
    private static final long RACE_WAIT_MS = 5000;

    /**
     * A lobby whose next two adds, once armed, race (#43). The first waits until the second
     * connection reaches its own add, as it does when the server checks both connections before
     * adding either, or waits for this lobby's lock, as it does when the check and the add are one
     * step under it. {@code raced} says whether either happened, so a test cannot pass because the
     * second connection came too late to race.
     */
    private static final class RacingLobby extends Lobby {
        private volatile CountDownLatch adds;
        private volatile boolean raced;

        void armRace() {
            raced = false;
            adds = new CountDownLatch(2);
        }

        boolean raced() {
            return raced;
        }

        @Override // not synchronized: the wait holds this lobby's lock only if the caller does
        public WsContext addUser(WsContext context, String name, String rejoinKey) {
            CountDownLatch latch = adds;
            if (latch != null) {
                latch.countDown();
                if (awaitSecondConnection(latch)) {
                    raced = true;
                }
            }
            return super.addUser(context, name, rejoinKey);
        }

        private boolean awaitSecondConnection(CountDownLatch latch) {
            long deadline = System.currentTimeMillis() + RACE_WAIT_MS;
            while (System.currentTimeMillis() < deadline) {
                if (latch.getCount() == 0 || isAThreadBlockedOnThisLobby()) {
                    return true;
                }
                try {
                    Thread.sleep(5);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return false;
                }
            }
            return false;
        }

        private boolean isAThreadBlockedOnThisLobby() {
            int lobby = System.identityHashCode(this);
            for (ThreadInfo thread : ManagementFactory.getThreadMXBean().dumpAllThreads(false, false)) {
                if (thread.getThreadState() == Thread.State.BLOCKED && thread.getLockInfo() != null
                        && thread.getLockInfo().getIdentityHashCode() == lobby) {
                    return true;
                }
            }
            return false;
        }
    }

    /** Opens both connections at once and returns them once both handshakes are done. */
    private List<TestSocket> connectAtOnce(String query1, String query2) throws Exception {
        CompletableFuture<TestSocket> first = CompletableFuture.supplyAsync(() -> connectUnchecked(query1));
        CompletableFuture<TestSocket> second = CompletableFuture.supplyAsync(() -> connectUnchecked(query2));
        return List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
    }

    private TestSocket connectUnchecked(String query) {
        try {
            return connect(query);
        } catch (Exception e) {
            throw new CompletionException(e);
        }
    }

    /**
     * Waits until the server closes one of the two connections, and returns them as {kept, closed}.
     * Fails if the second connection did not race the first.
     */
    private static List<TestSocket> keptAndClosed(RacingLobby lobby, List<TestSocket> pair)
            throws InterruptedException {
        awaitTrue(() -> !pair.get(0).isOpen() || !pair.get(1).isOpen(),
                () -> "both connections were still open after 5 s");
        assertTrue("the second connection came too late to race the first", lobby.raced());
        return pair.get(0).isOpen() ? pair : List.of(pair.get(1), pair.get(0));
    }

    @Test
    public void twoJoinsUnderOneNameAtOnceTakeOneAndRefuseTheOther() throws Exception {
        String code = "RJAL";
        RacingLobby lobby = racingLobby(code);
        players(code, "Bob");

        lobby.armRace();
        List<TestSocket> outcome = keptAndClosed(lobby, connectAtOnce(
                "lobby=" + code + "&name=Ann&rejoinKey=page-one",
                "lobby=" + code + "&name=Ann&rejoinKey=page-two"));

        TestSocket.CloseInfo refused = outcome.get(1).awaitClose();
        assertEquals(1002, refused.code);
        assertEquals("A user with the name Ann is already in the lobby.", refused.reason);
        assertEquals(List.of("Ann", "Bob"), usernames(outcome.get(0).next("lobby")));
        assertTrue("the connection taken stays open", outcome.get(0).isOpen());
        assertEquals(2, lobby.getUserCount());
    }

    @Test
    public void twoRejoinsOfOneSeatAtOnceTakeOneAndRefuseTheOther() throws Exception {
        String code = "RJAM";
        RacingLobby lobby = racingLobby(code);
        List<TestSocket> players = startGame(code, "Ann", "Bob", "Cat", "Dan", "Eve");
        reload(players.get(0), lobby, "Ann");

        // Ann's page and an older client under her name, which brings no key.
        lobby.armRace();
        List<TestSocket> outcome = keptAndClosed(lobby, connectAtOnce(
                "lobby=" + code + "&name=Ann&rejoinKey=" + keyOf("Ann"),
                "lobby=" + code + "&name=Ann"));

        TestSocket.CloseInfo refused = outcome.get(1).awaitClose();
        assertEquals(1002, refused.code);
        assertEquals("A user with the name Ann is already in the lobby.", refused.reason);
        JSONObject state = outcome.get(0).nextState("CHANCELLOR_NOMINATION");
        assertTrue(state.getJSONArray("playerOrder").toList().contains("Ann"));
        assertTrue("the connection taken stays open", outcome.get(0).isOpen());
        assertTrue(lobby.hasUserWithName("Ann"));
        assertEquals(5, lobby.getUserCount());
    }

    /** One page's reconnect and its JOIN, which bring the page's one key: the later takes the seat. */
    @Test
    public void twoConnectionsOfOnePageAtOnceLeaveTheLaterInTheSeat() throws Exception {
        String code = "RJAN";
        RacingLobby lobby = racingLobby(code);
        List<TestSocket> players = startGame(code, "Ann", "Bob", "Cat", "Dan", "Eve");
        reload(players.get(0), lobby, "Ann");

        lobby.armRace();
        List<TestSocket> outcome = keptAndClosed(lobby, connectAtOnce(
                "lobby=" + code + "&name=Ann&rejoinKey=" + keyOf("Ann"),
                "lobby=" + code + "&name=Ann&rejoinKey=" + keyOf("Ann")));

        assertEquals(SecretHitlerServer.CLOSE_REPLACED, outcome.get(1).awaitClose().code);
        JSONObject state = outcome.get(0).nextState("CHANCELLOR_NOMINATION");
        assertTrue(state.getJSONArray("playerOrder").toList().contains("Ann"));
        assertStaysSeated(lobby, "Ann", 5, outcome.get(0));
    }

    @Test
    public void twoNamesForTheLastSeatAtOnceTakeOneAndRefuseTheOther() throws Exception {
        String code = "RJAO";
        RacingLobby lobby = racingLobby(code);
        players(code, "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9");

        lobby.armRace();
        List<TestSocket> outcome = keptAndClosed(lobby, connectAtOnce(
                "lobby=" + code + "&name=Yan&rejoinKey=" + keyOf("Yan"),
                "lobby=" + code + "&name=Zed&rejoinKey=" + keyOf("Zed")));

        TestSocket.CloseInfo refused = outcome.get(1).awaitClose();
        assertEquals(1002, refused.code);
        assertEquals("The lobby " + code + " is currently full.", refused.reason);
        assertEquals(10, usernames(outcome.get(0).next("lobby")).size());
        assertTrue("the connection taken stays open", outcome.get(0).isOpen());
        assertEquals(10, lobby.getUserCount());
    }
}
