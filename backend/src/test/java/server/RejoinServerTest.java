package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static server.SignedInPlayers.account;

import io.javalin.Javalin;
import io.javalin.websocket.WsContext;
import java.lang.management.ManagementFactory;
import java.lang.management.ThreadInfo;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;
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
 * A player who reloads keeps their seat for {@code Lobby.PLAYER_TIMEOUT_IN_SEC}. Inside that
 * window they can take it back through /check-login and the /game handshake, in a running game
 * (#10) and when every seat is taken, while a second live connection of the same account is still
 * refused. A player of the game can also rejoin after the window, as after a server restart. And
 * a page whose network dropped without the server noticing takes its account's place back from its
 * own dead connection by bringing the same rejoin key (#26), which no other connection can do. Two
 * connections that arrive at once for one account, or for the last seat, are checked and added one
 * at a time, so the second gets what it would get had it come later (#43). A connection with no
 * account to play as is refused and never joins (#63). Each player is the account of its session
 * cookie. Over real sockets.
 */
public class RejoinServerTest {
    private static final String ALREADY_IN = "You're already in this lobby in another tab or window.";
    private static final String SIGN_IN = "Sign in and choose a name to play.";

    private static Javalin app;
    private static int port;
    // Every exception a /game handler let out, which Javalin would log and answer with 1011.
    private static final List<Exception> thrown = new CopyOnWriteArrayList<>();

    @Rule
    public final SignedInPlayers accounts = new SignedInPlayers();

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

    /** A long window, so a slow run cannot let it pass mid-test. The bug is the same at 3 s. */
    @Before
    public void widenTheWindow() {
        graceSeconds = Lobby.PLAYER_TIMEOUT_IN_SEC;
        Lobby.PLAYER_TIMEOUT_IN_SEC = 60;
        thrown.clear();
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

    /** Opens a player's socket with {@code query}, signed in with {@code sessionToken} (none for null). */
    private TestSocket connectWith(String sessionToken, String query) throws Exception {
        TestSocket socket = TestSocket.connect(port, query, sessionToken);
        sockets.add(socket);
        return socket;
    }

    /** Opens a socket of the player named {@code name}, signed in as their account. */
    private TestSocket connect(String name, String query) throws Exception {
        return connectWith(accounts.session(name), query);
    }

    /**
     * Opens a socket with {@code query}, signed in with {@code sessionToken} (none for null), and
     * checks the server refuses it: 1002 and {@code reason}.
     */
    private void assertRefusedWith(String sessionToken, String query, String reason) throws Exception {
        TestSocket.CloseInfo refused = connectWith(sessionToken, query).awaitClose();
        assertEquals(query, 1002, refused.code);
        assertEquals(query, reason, refused.reason);
    }

    /** Opens a socket of the player named {@code name}, and checks the server refuses it: 1002 and {@code reason}. */
    private void assertRefused(String name, String query, String reason) throws Exception {
        assertRefusedWith(accounts.session(name), query, reason);
    }

    private static JSONObject command(String code, String name, String command) {
        return new JSONObject().put("lobby", code).put("name", name).put("command", command);
    }

    /** /check-login for the player named {@code name}, signed in as their account. */
    private HttpResponse<String> checkLogin(String code, String name) throws Exception {
        return SignedInPlayers.checkLogin(port, "lobby=" + code, accounts.session(name));
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
            TestSocket player = connect(names[i], "lobby=" + code + "&rejoinKey=" + keyOf(names[i]));
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
        awaitTrue(() -> !lobby.hasAccount(account(name)), () -> name + "'s socket was still in the lobby after 5 s");
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

    private static void assertNoHandlerThrew() {
        assertEquals("a handler threw " + thrown, List.of(), thrown);
    }

    @Test
    public void aPlayerRejoinsAGameInsideTheGraceWindow() throws Exception {
        String code = "RJAA";
        Lobby lobby = lobby(code);
        List<TestSocket> players = startGame(code, "Ann", "Bob", "Cat", "Dan", "Eve");

        reload(players.get(0), lobby, "Ann");
        assertEquals("Ann is still inside the grace window", 5, lobby.getUserCount());

        HttpResponse<String> login = checkLogin(code, "Ann");
        assertEquals(login.body(), 200, login.statusCode());
        assertEquals("an account that is not in the game is still refused", 488,
                checkLogin(code, "Zed").statusCode());

        TestSocket rejoined = connect("Ann", "lobby=" + code);
        JSONObject state = rejoined.nextState("CHANCELLOR_NOMINATION");
        assertTrue(state.getJSONArray("playerOrder").toList().contains("Ann"));
        assertTrue(rejoined.isOpen());
        assertTrue(lobby.hasAccount(account("Ann")));
    }

    @Test
    public void aSecondLiveConnectionWithTheSameNameIsRefused() throws Exception {
        String code = "RJAB";
        Lobby lobby = lobby(code);
        List<TestSocket> players = startGame(code, "Ann", "Bob", "Cat", "Dan", "Eve");

        // 403 before 488: the account is here already, in another tab (ruling R6).
        assertEquals(403, checkLogin(code, "Ann").statusCode());
        assertRefused("Ann", "lobby=" + code, ALREADY_IN);
        assertTrue("the first connection is untouched", players.get(0).isOpen());
        assertTrue(lobby.hasAccount(account("Ann")));

        // The same holds for the connection of a player who has rejoined.
        reload(players.get(0), lobby, "Ann");
        TestSocket rejoined = connect("Ann", "lobby=" + code);
        rejoined.nextState("CHANCELLOR_NOMINATION");
        assertEquals(403, checkLogin(code, "Ann").statusCode());
        assertRefused("Ann", "lobby=" + code, ALREADY_IN);
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

        HttpResponse<String> login = checkLogin(code, "A10");
        assertEquals(login.body(), 200, login.statusCode());
        TestSocket rejoined = connect("A10", "lobby=" + code);
        rejoined.nextState("CHANCELLOR_NOMINATION");
        assertTrue(rejoined.isOpen());
        assertEquals("an account that is not in the game is still refused", 489,
                checkLogin(code, "Zed").statusCode());
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

        HttpResponse<String> login = checkLogin(code, "Ann");
        assertEquals(login.body(), 200, login.statusCode());
        assertEquals("an account that is not in the game is still refused", 488,
                checkLogin(code, "Zed").statusCode());

        TestSocket rejoined = connect("Ann", "lobby=" + code);
        JSONObject state = rejoined.nextState("CHANCELLOR_NOMINATION");
        assertEquals("Ann's portrait is restored", "p1", state.getJSONObject("icon").getString("Ann"));
        assertTrue(rejoined.isOpen());
        assertTrue(lobby.hasAccount(account("Ann")));
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
        assertEquals("an outsider is refused for the game", 488, checkLogin(code, "Zed").statusCode());

        HttpResponse<String> login = checkLogin(code, "A10");
        assertEquals(login.body(), 200, login.statusCode());
        TestSocket rejoined = connect("A10", "lobby=" + code);
        rejoined.nextState("CHANCELLOR_NOMINATION");
        assertTrue(rejoined.isOpen());
        assertTrue("the returning player is counted again (#41)", lobby.isFull());
        assertEquals("an outsider finds the lobby full again", 489, checkLogin(code, "Zed").statusCode());
    }

    @Test
    public void aPlayerWhoRejoinsInsideTheWindowIsInTheLobbyAfterTheGame() throws Exception {
        String code = "RJAD";
        Lobby lobby = lobby(code);
        List<TestSocket> players = startGame(code, "Ann", "Bob", "Cat", "Dan", "Eve");

        reload(players.get(0), lobby, "Ann");
        TestSocket rejoined = connect("Ann", "lobby=" + code);
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
        assertEquals("the seat is held", 489, checkLogin(code, "Zed").statusCode());

        assertEquals(200, checkLogin(code, "A10").statusCode());
        TestSocket back = connect("A10", "lobby=" + code);
        List<String> expected = new ArrayList<>(List.of(names));
        Collections.sort(expected);
        assertEquals(expected, usernames(back.next("lobby")));
        assertEquals(10, lobby.getUserCount());
    }

    /** Fails if, within half a second, the player's account loses its connection or the lobby a user. */
    private static void assertStaysSeated(Lobby lobby, String name, int users, TestSocket socket)
            throws InterruptedException {
        long until = System.currentTimeMillis() + 500;
        while (System.currentTimeMillis() < until) {
            assertTrue(name + " lost their connection", lobby.hasAccount(account(name)));
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

        TestSocket back = connect("Ann", "lobby=" + code + "&rejoinKey=" + keyOf("Ann"));
        JSONObject state = back.nextState("CHANCELLOR_NOMINATION");
        assertEquals("Ann's portrait is kept", "p1", state.getJSONObject("icon").getString("Ann"));

        TestSocket.CloseInfo replaced = dead.awaitClose();
        assertEquals(SecretHitlerServer.CLOSE_REPLACED, replaced.code);
        assertEquals("Replaced by a newer connection under the same account.", replaced.reason);
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
            assertRefused("Ann", "lobby=" + code + key, ALREADY_IN);
        }
        assertTrue("Ann's connection is untouched", players.get(0).isOpen());
        assertTrue(lobby.hasAccount(account("Ann")));
    }

    /** An older client sends no key, and nothing can take its connection's place. */
    @Test
    public void aConnectionOpenedWithoutAKeyIsNotReplaced() throws Exception {
        String code = "RJAJ";
        lobby(code);
        TestSocket ann = connect("Ann", "lobby=" + code);
        ann.next("lobby");

        assertRefused("Ann", "lobby=" + code + "&rejoinKey=" + keyOf("Ann"), ALREADY_IN);
        assertTrue(ann.isOpen());
    }

    @Test
    public void aFullLobbyTakesItsPlayerBackFromTheirDeadConnection() throws Exception {
        String code = "RJAK";
        Lobby lobby = lobby(code);
        String[] names = { "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10" };
        List<TestSocket> players = players(code, names);

        TestSocket back = connect("A10", "lobby=" + code + "&rejoinKey=" + keyOf("A10"));
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
        assertRefused("Zed", "lobby=" + full, "The lobby " + full + " is currently full.");

        String playing = "RJAQ";
        lobby(playing);
        startGame(playing, "Ann", "Bob", "Cat", "Dan", "Eve");
        assertRefused("Zed", "lobby=" + playing, "The lobby " + playing + " is currently in a game..");
    }

    /**
     * #63: the refusal of a blank name had no return, so the closed connection was added anyway,
     * and as its close had come first nothing ever took it out: a seat, a roster row and a portrait
     * never picked, for as long as the lobby lived. A player's name is now its account's, so a blank
     * name is a socket with no account to play as: one with no session, or one whose account has no
     * name yet. Each is refused and never joins, with the page's rejoin key and without, whatever
     * name the query brings (the handshake ignores it).
     */
    @Test
    public void aBlankNameIsRefusedAndNeverJoins() throws Exception {
        String code = "RJAR";
        Lobby lobby = lobby(code);
        TestSocket ann = players(code, "Ann").get(0);
        String unnamed = TestAccounts.signIn(accounts.store(), "unnamed", null);

        for (String session : Arrays.asList(null, unnamed)) {
            for (String nameAndKey : List.of("&name=%20%20&rejoinKey=a-key", "", "&name=%20%20", "&name=Ann",
                    "&rejoinKey=" + keyOf("Ann"))) {
                assertRefusedWith(session, "lobby=" + code + nameAndKey, SIGN_IN);
            }
        }

        // Bob joins after every refusal, so the packets of his join show whether any of them got in.
        TestSocket bob = connect("Bob", "lobby=" + code);
        assertEquals(List.of("Ann", "Bob"), usernames(bob.next("lobby")));
        while (!usernames(ann.next("lobby")).contains("Bob")) {
            // skip Ann's packets from before Bob's join
        }
        for (JSONObject packet : ann.received()) {
            if ("lobby".equals(packet.optString("type"))) {
                assertTrue(packet.toString(), usernames(packet).stream().noneMatch(String::isBlank));
            }
        }
        assertEquals(2, lobby.getUserCount());
        assertFalse(lobby.hasAccount(TestAccounts.account("unnamed")));
        assertFalse(lobby.hasAccount(""));
        assertFalse(lobby.hasAccount("  "));
        assertTrue("Ann's connection is untouched", ann.isOpen());
        assertNoHandlerThrew();
    }

    /** How long the first add of a race waits for the second connection: long enough for a slow run. */
    private static final long RACE_WAIT_MS = 5000;

    /**
     * A lobby whose next two adds, once armed, race (#43). The first waits until the second
     * connection reaches its own add, as it does when the server checks both connections before
     * adding either, or waits for this lobby's lock or {@code ACCOUNTS_LOCK}, as it does when the
     * check and the add are one step under them (a join takes {@code ACCOUNTS_LOCK} and then the
     * lobby's). {@code raced} says whether either happened, so a test cannot pass because the second
     * connection came too late to race. {@code checkedDuringAnAdd} says whether another connection
     * was checked ({@code joinRefusal}) while an add was under way, as it can only be when the
     * server checks it outside the step that adds: its answer is then out of date as soon as it is
     * given, even if, waiting for the lobby's lock, it comes after the add.
     */
    private static final class RacingLobby extends Lobby {
        private volatile CountDownLatch adds;
        private volatile boolean raced;
        private volatile Thread adding; // the thread whose add is under way, while the race is armed
        private volatile boolean checkedDuringAnAdd;

        void armRace() {
            raced = false;
            checkedDuringAnAdd = false;
            adds = new CountDownLatch(2);
        }

        boolean raced() {
            return raced;
        }

        boolean checkedDuringAnAdd() {
            return checkedDuringAnAdd;
        }

        @Override // not synchronized: notes the check before it waits for this lobby's lock
        public JoinRefusal joinRefusal(String accountId, String rejoinKey) {
            Thread add = adding;
            if (add != null && add != Thread.currentThread()) {
                checkedDuringAnAdd = true;
            }
            return super.joinRefusal(accountId, rejoinKey);
        }

        @Override // not synchronized: the wait holds this lobby's lock only if the caller does
        public WsContext addUser(WsContext context, String accountId, String name, String rejoinKey) {
            CountDownLatch latch = adds;
            if (latch == null) {
                return super.addUser(context, accountId, name, rejoinKey);
            }
            adding = Thread.currentThread();
            try {
                latch.countDown();
                if (awaitSecondConnection(latch)) {
                    raced = true;
                }
                return super.addUser(context, accountId, name, rejoinKey);
            } finally {
                adding = null;
            }
        }

        private boolean awaitSecondConnection(CountDownLatch latch) {
            long deadline = System.currentTimeMillis() + RACE_WAIT_MS;
            while (System.currentTimeMillis() < deadline) {
                if (latch.getCount() == 0 || isAThreadBlockedOn(this)
                        || isAThreadBlockedOn(SecretHitlerServer.ACCOUNTS_LOCK)) {
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

        private static boolean isAThreadBlockedOn(Object lock) {
            int id = System.identityHashCode(lock);
            for (ThreadInfo thread : ManagementFactory.getThreadMXBean().dumpAllThreads(false, false)) {
                if (thread.getThreadState() == Thread.State.BLOCKED && thread.getLockInfo() != null
                        && thread.getLockInfo().getIdentityHashCode() == id) {
                    return true;
                }
            }
            return false;
        }
    }

    /** Opens both connections, with their sessions, at once and returns them once both handshakes are done. */
    private List<TestSocket> connectAtOnce(String session1, String query1, String session2, String query2)
            throws Exception {
        CompletableFuture<TestSocket> first = CompletableFuture.supplyAsync(() -> connectUnchecked(session1, query1));
        CompletableFuture<TestSocket> second = CompletableFuture.supplyAsync(() -> connectUnchecked(session2, query2));
        return List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
    }

    private TestSocket connectUnchecked(String session, String query) {
        try {
            return connectWith(session, query);
        } catch (Exception e) {
            throw new CompletionException(e);
        }
    }

    /**
     * Waits until the server closes one of the two connections, and returns them as {kept, closed}.
     * Fails if the second connection did not race the first, or was checked while the first was
     * being added.
     */
    private static List<TestSocket> keptAndClosed(RacingLobby lobby, List<TestSocket> pair)
            throws InterruptedException {
        awaitTrue(() -> !pair.get(0).isOpen() || !pair.get(1).isOpen(),
                () -> "both connections were still open after 5 s");
        assertTrue("the second connection came too late to race the first", lobby.raced());
        assertFalse("a connection was checked while another was being added: the check and the add are not one step",
                lobby.checkedDuringAnAdd());
        return pair.get(0).isOpen() ? pair : List.of(pair.get(1), pair.get(0));
    }

    /** Two tabs of one browser: one account, each page with its own key. */
    @Test
    public void twoJoinsUnderOneNameAtOnceTakeOneAndRefuseTheOther() throws Exception {
        String code = "RJAL";
        RacingLobby lobby = racingLobby(code);
        players(code, "Bob");

        lobby.armRace();
        String ann = accounts.session("Ann");
        List<TestSocket> outcome = keptAndClosed(lobby, connectAtOnce(
                ann, "lobby=" + code + "&rejoinKey=page-one",
                ann, "lobby=" + code + "&rejoinKey=page-two"));

        TestSocket.CloseInfo refused = outcome.get(1).awaitClose();
        assertEquals(1002, refused.code);
        assertEquals(ALREADY_IN, refused.reason);
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

        // Ann's page and an older client signed in as her, which brings no key.
        lobby.armRace();
        String ann = accounts.session("Ann");
        List<TestSocket> outcome = keptAndClosed(lobby, connectAtOnce(
                ann, "lobby=" + code + "&rejoinKey=" + keyOf("Ann"),
                ann, "lobby=" + code));

        TestSocket.CloseInfo refused = outcome.get(1).awaitClose();
        assertEquals(1002, refused.code);
        assertEquals(ALREADY_IN, refused.reason);
        JSONObject state = outcome.get(0).nextState("CHANCELLOR_NOMINATION");
        assertTrue(state.getJSONArray("playerOrder").toList().contains("Ann"));
        assertTrue("the connection taken stays open", outcome.get(0).isOpen());
        assertTrue(lobby.hasAccount(account("Ann")));
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
        String ann = accounts.session("Ann");
        List<TestSocket> outcome = keptAndClosed(lobby, connectAtOnce(
                ann, "lobby=" + code + "&rejoinKey=" + keyOf("Ann"),
                ann, "lobby=" + code + "&rejoinKey=" + keyOf("Ann")));

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
                accounts.session("Yan"), "lobby=" + code + "&rejoinKey=" + keyOf("Yan"),
                accounts.session("Zed"), "lobby=" + code + "&rejoinKey=" + keyOf("Zed")));

        TestSocket.CloseInfo refused = outcome.get(1).awaitClose();
        assertEquals(1002, refused.code);
        assertEquals("The lobby " + code + " is currently full.", refused.reason);
        assertEquals(10, usernames(outcome.get(0).next("lobby")).size());
        assertTrue("the connection taken stays open", outcome.get(0).isOpen());
        assertEquals(10, lobby.getUserCount());
    }
}
