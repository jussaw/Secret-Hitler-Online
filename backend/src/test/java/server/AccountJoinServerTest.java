package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static server.SignedInPlayers.account;

import io.javalin.Javalin;
import java.io.File;
import java.net.http.HttpResponse;
import java.sql.Connection;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
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
import org.junit.rules.TemporaryFolder;
import server.SecretHitlerServer.RenameResult;
import server.accounts.AccountStore;
import server.util.Lobby;

/**
 * Players join and act as the account of their {@code session} cookie: a socket with no session,
 * one that matches no live session, or an account with no name yet is refused before any lobby is
 * touched; the {@code name} a query or a message brings is never read; outside debug mode a
 * player's socket from another origin is refused; /check-login reads the session; a second tab of
 * one browser is refused without touching the first; a player whose session ended signs in again
 * and takes their seat back, also in a game restored from a backup; and a join never records a
 * name its account no longer has. Over real sockets.
 *
 * <p>
 * Tests that need the {@code Origin} check set {@code ApplicationConfig.DEBUG} to false (and one
 * sets it to true, to show debug mode lets any origin in); every test gets it back as it was.
 */
public class AccountJoinServerTest {
    private static final String SIGN_IN = "Sign in and choose a name to play.";
    private static final String ALREADY_IN = "You're already in this lobby in another tab or window.";
    private static final String OTHER_SITE = "Connections from another site are not allowed.";

    private static Javalin app;
    private static int port;
    // Every exception a /game handler let out, which Javalin would log and answer with 1011.
    private static final List<Exception> thrown = new CopyOnWriteArrayList<>();
    // Run by the next player's or spectator's connect, on its handler's thread, just before the handler.
    private static final AtomicReference<Runnable> beforeNextConnect = new AtomicReference<>();

    @Rule
    public final SignedInPlayers accounts = new SignedInPlayers();
    @Rule
    public final TemporaryFolder tmp = new TemporaryFolder();

    private final List<String> codes = new ArrayList<>();
    private final List<TestSocket> sockets = new CopyOnWriteArrayList<>();
    private boolean savedDebug;
    private float savedGrace;
    private int nextCode;

    @BeforeClass
    public static void startServer() {
        app = Javalin.create()
                .get("/check-login", SecretHitlerServer::checkLogin)
                .wsBefore(ws -> ws.onConnect(ctx -> {
                    Runnable hook = beforeNextConnect.getAndSet(null);
                    if (hook != null) {
                        hook.run();
                    }
                }))
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
        savedDebug = ApplicationConfig.DEBUG;
        savedGrace = Lobby.PLAYER_TIMEOUT_IN_SEC;
        Lobby.PLAYER_TIMEOUT_IN_SEC = 60; // no seat is let go during a test
        thrown.clear();
        beforeNextConnect.set(null);
    }

    @After
    public void cleanUp() {
        sockets.forEach(TestSocket::close);
        codes.forEach(SecretHitlerServer.codeToLobby::remove);
        ApplicationConfig.DEBUG = savedDebug;
        Lobby.PLAYER_TIMEOUT_IN_SEC = savedGrace;
        beforeNextConnect.set(null);
    }

    ////// Helpers

    private Lobby lobby(String code) {
        return register(code, new Lobby());
    }

    private Lobby register(String code, Lobby lobby) {
        SecretHitlerServer.codeToLobby.put(code, lobby);
        codes.add(code);
        return lobby;
    }

    /** A new lobby code for this test. */
    private String newCode() {
        return String.format("AJ%02d", nextCode++);
    }

    private TestSocket track(TestSocket socket) {
        sockets.add(socket);
        return socket;
    }

    /** Opens a player's socket with {@code query}, signed in with {@code sessionToken} (none for null). */
    private TestSocket connectWith(String sessionToken, String query) throws Exception {
        return track(TestSocket.connect(port, query, sessionToken));
    }

    /** Opens a socket of the player named {@code name}, signed in as their account. */
    private TestSocket connect(String name, String query) throws Exception {
        return connectWith(accounts.session(name), query);
    }

    private static JSONObject command(String code, String name, String command) {
        return new JSONObject().put("lobby", code).put("name", name).put("command", command);
    }

    /** /check-login for {@code lobby=<code>}, with the session's cookie (none for null). */
    private static HttpResponse<String> checkLogin(String code, String sessionToken) throws Exception {
        return SignedInPlayers.checkLogin(port, "lobby=" + code, sessionToken);
    }

    /** Connects the players with portraits p1.., and waits until each has its icon. */
    private List<TestSocket> players(String code, String... names) throws Exception {
        List<TestSocket> players = new ArrayList<>();
        for (int i = 0; i < names.length; i++) {
            TestSocket player = connect(names[i], "lobby=" + code + "&rejoinKey=key-of-" + names[i]);
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

    /** Opens a socket with {@code sessionToken} (none for null) and checks it is refused: 1002 and {@code reason}. */
    private void assertRefused(String sessionToken, String query, String reason) throws Exception {
        TestSocket.CloseInfo refused = connectWith(sessionToken, query).awaitClose();
        assertEquals(query, 1002, refused.code);
        assertEquals(query, reason, refused.reason);
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

    /**
     * Pings from the socket and waits for the pong, which its lobby sends after everything it sent
     * the socket before (each under the lobby's lock), and returns how many packets it has had.
     */
    private static int settle(TestSocket socket, String code) throws Exception {
        socket.send(command(code, null, "ping"));
        socket.next("pong");
        return socket.received().size();
    }

    /**
     * Fails if the socket was sent anything but pongs after its first {@code sentBefore} packets,
     * up to the pong of a ping it sends now: nothing that happened in its lobby since reached it.
     */
    private static void assertSentNothingSince(TestSocket socket, int sentBefore, String code) throws Exception {
        settle(socket, code);
        List<JSONObject> received = socket.received();
        for (JSONObject packet : received.subList(sentBefore, received.size())) {
            assertEquals("the lobby sent " + packet, "pong", packet.getString("type"));
        }
    }

    private static List<String> usernames(JSONObject lobbyPacket) {
        List<String> names = new ArrayList<>();
        JSONArray array = lobbyPacket.getJSONArray("usernames");
        for (int i = 0; i < array.length(); i++) {
            names.add(array.getString(i));
        }
        return names;
    }

    private static void assertNoHandlerThrew() {
        assertEquals("a handler threw " + thrown, List.of(), thrown);
    }

    ////// Sessions

    /** Review Focus 1: a cookie that matches no live session is signed out, never an error. */
    @Test
    public void aPlayerWithoutASessionIsRefused() throws Exception {
        String code = newCode();
        Lobby lobby = lobby(code);
        String expired = TestAccounts.signIn(accounts.store(), "old", "Old");
        String signedOut = TestAccounts.signIn(accounts.store(), "gone", "Gone");
        accounts.store().deleteSession(signedOut);
        TestSocket ann = players(code, "Ann").get(0);
        accounts.passTime(AccountStore.SESSION_MS); // Old's session ends (Ann has joined already)
        int sent = settle(ann, code);

        for (String session : Arrays.asList(null, "junk", "", expired, signedOut)) {
            // Even with Ann's name and her page's key in the query, which the handshake never reads.
            for (String query : List.of("lobby=" + code, "lobby=" + code + "&name=Ann&rejoinKey=key-of-Ann")) {
                assertRefused(session, query, SIGN_IN);
            }
        }

        assertTrue("Ann's connection is untouched", ann.isOpen());
        assertEquals(1, lobby.getUserCount());
        assertEquals(List.of("Ann"), lobby.getUserNames());
        assertSentNothingSince(ann, sent, code);
        assertNoHandlerThrew();
    }

    @Test
    public void anAccountWithNoNameIsRefused() throws Exception {
        String code = newCode();
        Lobby lobby = lobby(code);
        String nameless = TestAccounts.signIn(accounts.store(), "nameless", null);

        HttpResponse<String> login = checkLogin(code, nameless);
        assertEquals(401, login.statusCode());
        assertEquals("Sign in to play.", login.body());
        assertRefused(nameless, "lobby=" + code + "&name=Rowan", SIGN_IN);
        assertEquals(0, lobby.getUserCount());

        // Once it has chosen a name, the same session joins under it.
        assertEquals(RenameResult.SAVED, SecretHitlerServer.renameAccount(account("nameless"), "Rowan"));
        assertEquals(200, checkLogin(code, nameless).statusCode());
        JSONObject packet = connectWith(nameless, "lobby=" + code).next("lobby");
        assertEquals(List.of("Rowan"), usernames(packet));
        assertEquals("Rowan", packet.getString("you"));
        assertNoHandlerThrew();
    }

    @Test
    public void theNameComesFromTheAccount() throws Exception {
        String code = newCode();
        Lobby lobby = lobby(code);
        String rowan = TestAccounts.signIn(accounts.store(), "rowan", "Rowan");

        TestSocket socket = connectWith(rowan, "lobby=" + code + "&name=Mallory");
        JSONObject packet = socket.next("lobby");
        assertEquals(List.of("Rowan"), usernames(packet));
        assertEquals("Rowan", packet.getString("you"));
        assertTrue(lobby.hasAccount(account("rowan")));

        // A message naming Mallory is Rowan's too.
        socket.send(command(code, "Mallory", "select-icon").put("icon", "p3"));
        socket.next("ok");
        JSONObject icons = socket.next("lobby").getJSONObject("icon");
        assertEquals("p3", icons.getString("Rowan"));
        assertFalse(icons.has("Mallory"));

        // Nothing was taken from Mallory, who joins as herself.
        String mallory = TestAccounts.signIn(accounts.store(), "mallory", "Mallory");
        assertEquals(List.of("Rowan", "Mallory"), usernames(connectWith(mallory, "lobby=" + code).next("lobby")));
        assertNoHandlerThrew();
    }

    /** Review Focus 2: signed out elsewhere, or expired, mid-game: refused until signed in again, then back in the seat. */
    @Test
    public void aSessionThatEndsMidGameNeedsASignIn() throws Exception {
        String code = newCode();
        Lobby lobby = lobby(code);
        List<TestSocket> players = startGame(code, "Ann", "Bob", "Cat", "Dan", "Eve");

        // Ann signs out in another tab. Her open socket stays open until it closes.
        String old = accounts.session("Ann");
        accounts.store().deleteSession(old);
        players.get(0).send(command(code, "Ann", "ping"));
        players.get(0).next("pong");
        reload(players.get(0), lobby, "Ann");
        assertEquals(401, checkLogin(code, old).statusCode());
        assertRefused(old, "lobby=" + code + "&rejoinKey=key-of-Ann", SIGN_IN);

        String again = accounts.signInAgain("Ann");
        assertEquals(200, checkLogin(code, again).statusCode());
        JSONObject state = connectWith(again, "lobby=" + code + "&rejoinKey=key-of-Ann").nextState("CHANCELLOR_NOMINATION");
        assertEquals("Ann", state.getString("you"));
        assertTrue(state.getJSONArray("playerOrder").toList().contains("Ann"));
        assertTrue(lobby.hasAccount(account("Ann")));

        // Bob's session runs out while he plays.
        String bob = accounts.session("Bob");
        accounts.passTime(AccountStore.SESSION_MS);
        reload(players.get(1), lobby, "Bob");
        assertEquals(401, checkLogin(code, bob).statusCode());
        assertRefused(bob, "lobby=" + code, SIGN_IN);
        String bobAgain = accounts.signInAgain("Bob");
        assertEquals(200, checkLogin(code, bobAgain).statusCode());
        state = connectWith(bobAgain, "lobby=" + code).nextState("CHANCELLOR_NOMINATION");
        assertEquals("Bob", state.getString("you"));
        assertEquals(5, lobby.getUserCount());
        assertNoHandlerThrew();
    }

    /** A restart mid-game: the restored lobby has no one in it, and each seat's account takes it back. */
    @Test
    public void aRestoredGameIsRetakenByAccount() throws Exception {
        String code = newCode();
        Lobby lobby = lobby(code);
        String[] names = { "Ann", "Bob", "Cat", "Dan", "Eve" };
        List<TestSocket> players = startGame(code, names);

        List<Object> order = new ArrayList<>();
        Lobby restored;
        String db = new File(tmp.getRoot(), "backup.db").getAbsolutePath();
        try (Connection c = SecretHitlerServer.getDatabaseConnection(db)) {
            synchronized (lobby) {
                lobby.game().getPlayerList().forEach(player -> order.add(player.getUsername()));
                SecretHitlerServer.storeLobbies(c, new ConcurrentHashMap<>(Map.of(code, lobby)));
            }
            restored = SecretHitlerServer.loadLobbies(c).get(code);
        }
        for (TestSocket player : players) {
            player.close();
        }
        awaitTrue(() -> !SecretHitlerServer.userToLobby.containsValue(lobby), () -> "the old lobby kept a connection");
        register(code, restored); // the server restarts with the backup
        assertEquals(0, restored.getUserCount());

        assertEquals(488, checkLogin(code, accounts.session("Zed")).statusCode());
        assertRefused(accounts.session("Zed"), "lobby=" + code, "The lobby " + code + " is currently in a game..");
        for (int i = 0; i < names.length; i++) {
            assertEquals(names[i], 200, checkLogin(code, accounts.session(names[i])).statusCode());
            JSONObject state = connect(names[i], "lobby=" + code).nextState("CHANCELLOR_NOMINATION");
            assertEquals(names[i], state.getString("you"));
            assertEquals(order, state.getJSONArray("playerOrder").toList());
            assertTrue(restored.hasAccount(account(names[i])));
        }
        assertEquals(5, restored.getUserCount());
        assertNoHandlerThrew();
    }

    /**
     * A join and a rename of its account at once, 200 times: the join reads the account's name
     * under {@code ACCOUNTS_LOCK}, which the rename holds from its check to its last change, so the
     * roster always ends with the name the store has.
     */
    @Test
    public void aJoinNeverRecordsAStaleName() throws Exception {
        String session = TestAccounts.signIn(accounts.store(), "1", "Old0");
        ExecutorService renames = Executors.newSingleThreadExecutor();
        try {
            for (int i = 0; i < 200; i++) {
                String round = "round " + i;
                assertEquals(AccountStore.NameResult.SAVED, accounts.store().setUsername(account("1"), "Old" + i));
                String code = String.format("JN%03d", i);
                Lobby lobby = lobby(code);

                CountDownLatch go = new CountDownLatch(1);
                AtomicReference<Future<RenameResult>> rename = new AtomicReference<>();
                String newName = "New" + i;
                beforeNextConnect.set(() -> {
                    rename.set(renames.submit(() -> {
                        go.await();
                        return SecretHitlerServer.renameAccount(account("1"), newName);
                    }));
                    go.countDown(); // the rename and the join go on together
                });
                TestSocket socket = connectWith(session, "lobby=" + code);
                socket.next("lobby"); // the join is done
                awaitTrue(() -> rename.get() != null, () -> "the rename never started");
                assertEquals(round, RenameResult.SAVED, rename.get().get(10, TimeUnit.SECONDS));

                String saved = accounts.store().find(account("1")).username();
                assertEquals(round, newName, saved);
                assertEquals(round, List.of(saved), lobby.getUserNames());
                socket.close();
                SecretHitlerServer.codeToLobby.remove(code); // later renames pass over this lobby
            }
        } finally {
            renames.shutdownNow();
        }
        assertNoHandlerThrew();
    }

    ////// The Origin check

    /** Opens a socket of a new account from {@code origin} (none for null) to a new lobby, which takes it. */
    private void assertOriginAccepted(String origin) throws Exception {
        String code = newCode();
        lobby(code);
        Map<String, String> headers = new HashMap<>();
        headers.put("Cookie", "session=" + accounts.session("P" + code));
        if (origin != null) {
            headers.put("Origin", origin);
        }
        JSONObject packet = track(TestSocket.connect(port, "lobby=" + code, headers)).next("lobby");
        assertEquals(String.valueOf(origin), List.of("P" + code), usernames(packet));
    }

    /** Opens a socket of a new account from {@code origin} (none for null) to a new lobby, which refuses it. */
    private void assertOriginRefused(String origin) throws Exception {
        String code = newCode();
        Lobby lobby = lobby(code);
        Map<String, String> headers = new HashMap<>();
        headers.put("Cookie", "session=" + accounts.session("P" + code));
        if (origin != null) {
            headers.put("Origin", origin);
        }
        TestSocket.CloseInfo refused = track(TestSocket.connect(port, "lobby=" + code, headers)).awaitClose();
        assertEquals(String.valueOf(origin), 1002, refused.code);
        assertEquals(String.valueOf(origin), OTHER_SITE, refused.reason);
        assertEquals(String.valueOf(origin), 0, lobby.getUserCount());
    }

    @Test
    public void anotherOriginIsRefused() throws Exception {
        ApplicationConfig.DEBUG = false; // cleanUp puts it back
        // Without DISCORD_REDIRECT_URI, the server's own origin is the request's Host: localhost:<port>.
        assertOriginAccepted("http://localhost:" + port);
        for (String origin : List.of("http://another.example.test", "http://localhost:" + (port + 1),
                "http://127.0.0.1:" + port, "http://localhost", "null", "not a url", "http://localhost:x")) {
            assertOriginRefused(origin);
        }

        // With it, the server's own origin is the redirect URI's (scheme, host and port), whatever the Host.
        ApplicationConfig.DISCORD_REDIRECT_URI = "https://play.example.test/auth/discord/callback";
        assertOriginAccepted("https://play.example.test");
        assertOriginAccepted("https://play.example.test:443");
        for (String origin : List.of("http://localhost:" + port, "http://play.example.test",
                "https://play.example.test:8443", "https://another.example.test", "https://example.test")) {
            assertOriginRefused(origin);
        }
        ApplicationConfig.DISCORD_REDIRECT_URI = "http://localhost:3000/auth/discord/callback";
        assertOriginAccepted("http://localhost:3000");
        assertOriginRefused("http://localhost:" + port);
        assertOriginRefused("https://localhost:3000");
        ApplicationConfig.DISCORD_REDIRECT_URI = null; // the rule puts the saved one back too

        // A separately hosted dev frontend, in debug mode, is let in from any origin.
        ApplicationConfig.DEBUG = true;
        assertOriginAccepted("http://another.example.test");
        assertNoHandlerThrew();
    }

    @Test
    public void aMissingOriginIsRefused() throws Exception {
        ApplicationConfig.DEBUG = false; // cleanUp puts it back
        assertOriginRefused(null);

        ApplicationConfig.DEBUG = true; // debug mode needs none
        assertOriginAccepted(null);
        assertNoHandlerThrew();
    }

    ////// /check-login

    /** The statuses in ruling R6's order: 400, 401, 404, 403, 200 (taking back a seat), 489, 488, 200. */
    @Test
    public void checkLoginStatuses() throws Exception {
        String open = newCode();
        lobby(open);
        String ann = accounts.session("Ann");

        // 400 without a lobby, signed in or not.
        assertEquals(400, SignedInPlayers.checkLogin(port, "", ann).statusCode());
        assertEquals(400, SignedInPlayers.checkLogin(port, "name=Ann", null).statusCode());

        // 401 signed out (no cookie, one that matches no live session) or with no name yet.
        String gone = TestAccounts.signIn(accounts.store(), "gone", "Gone");
        accounts.store().deleteSession(gone);
        String nameless = TestAccounts.signIn(accounts.store(), "nameless", null);
        for (String session : Arrays.asList(null, "junk", "", gone, nameless)) {
            for (String query : List.of("lobby=" + open, "lobby=" + open + "&name=Ann", "lobby=NONE")) {
                HttpResponse<String> login = SignedInPlayers.checkLogin(port, query, session);
                assertEquals(session + " " + query, 401, login.statusCode());
                assertEquals("Sign in to play.", login.body());
            }
        }

        // 404 for no such lobby, or one the sweep has closed.
        HttpResponse<String> none = checkLogin("NONE", ann);
        assertEquals(404, none.statusCode());
        assertEquals("No such lobby found.", none.body());
        long minutes = Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN;
        Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN = 0;
        Lobby closing;
        try {
            closing = new Lobby();
        } finally {
            Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN = minutes;
        }
        String closed = newCode();
        register(closed, closing);
        assertTrue(closing.closeIfTimedOut());
        assertEquals(404, checkLogin(closed, ann).statusCode());

        // 200 to join; the name a query brings changes nothing.
        assertEquals(200, checkLogin(open, ann).statusCode());
        TestSocket annSocket = connectWith(ann, "lobby=" + open);
        annSocket.next("lobby");
        assertEquals(200, SignedInPlayers.checkLogin(port, "lobby=" + open + "&name=Ann",
                accounts.session("Bob")).statusCode());

        // 403 for the account's second tab.
        HttpResponse<String> twice = checkLogin(open, ann);
        assertEquals(403, twice.statusCode());
        assertEquals(ALREADY_IN, twice.body());

        // 489 full, except to take back one's own seat; 488 in a game.
        String full = newCode();
        Lobby fullLobby = lobby(full);
        String[] ten = { "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10" };
        List<TestSocket> seated = players(full, ten);
        HttpResponse<String> crowded = checkLogin(full, accounts.session("Zed"));
        assertEquals(489, crowded.statusCode());
        assertEquals("The lobby is currently full.", crowded.body());
        reload(seated.get(9), fullLobby, "A10");
        assertEquals("inside the grace window", 200, checkLogin(full, accounts.session("A10")).statusCode());

        String playing = newCode();
        lobby(playing).startNewGame(); // five CPU players
        HttpResponse<String> inGame = checkLogin(playing, accounts.session("Zed"));
        assertEquals(488, inGame.statusCode());
        assertEquals("The lobby is currently in a game.", inGame.body());
    }

    /**
     * Review Focus 5: a second tab of the same browser, with the same session and another rejoin
     * key, is told 403 by /check-login, before a full lobby's 489 and a game's 488, and its socket
     * is refused without touching the first tab's.
     */
    @Test
    public void aSecondTabIsRefused() throws Exception {
        String code = newCode();
        Lobby lobby = lobby(code);
        String ann = accounts.session("Ann");
        TestSocket firstTab = connectWith(ann, "lobby=" + code + "&rejoinKey=tab-one");
        firstTab.next("lobby");
        firstTab.send(command(code, "Ann", "select-icon").put("icon", "p1"));
        firstTab.next("ok");

        assertSecondTabRefused(code, lobby, firstTab, ann);

        // A full lobby, then a game: still 403 for the second tab.
        String[] others = { "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10" };
        for (int i = 0; i < others.length; i++) {
            TestSocket other = connect(others[i], "lobby=" + code);
            other.send(command(code, others[i], "select-icon").put("icon", "p" + (i + 2)));
            other.next("ok");
        }
        assertTrue(lobby.isFull());
        assertSecondTabRefused(code, lobby, firstTab, ann);

        firstTab.send(command(code, "Ann", "start-game"));
        firstTab.nextState("CHANCELLOR_NOMINATION");
        assertSecondTabRefused(code, lobby, firstTab, ann);
        assertNoHandlerThrew();
    }

    private void assertSecondTabRefused(String code, Lobby lobby, TestSocket firstTab, String session)
            throws Exception {
        int users = lobby.getUserCount();
        int sent = settle(firstTab, code);
        HttpResponse<String> login = checkLogin(code, session);
        assertEquals(403, login.statusCode());
        assertEquals(ALREADY_IN, login.body());
        for (String key : List.of("&rejoinKey=tab-two", "")) {
            assertRefused(session, "lobby=" + code + key, ALREADY_IN);
        }
        assertTrue("the first tab is untouched", firstTab.isOpen());
        assertTrue(lobby.hasAccount(account("Ann")));
        assertEquals(users, lobby.getUserCount());
        assertSentNothingSince(firstTab, sent, code);
    }

    ////// Messages

    @Test
    public void aMessageNamingSomeoneElseActsAsItsSender() throws Exception {
        String code = newCode();
        Lobby lobby = lobby(code);
        String[] names = { "Ann", "Bob", "Cat", "Dan", "Eve" };
        List<TestSocket> players = startGame(code, names);
        String president;
        synchronized (lobby) {
            president = lobby.game().getCurrentPresident();
        }
        List<String> order = new ArrayList<>(List.of(names));
        order.remove(president);
        String nominee = order.get(0);
        String a = order.get(1); // named by b's message
        String b = order.get(2);
        String c = order.get(3);

        // A player who is not the president, naming the president, may not nominate.
        TestSocket aSocket = players.get(List.of(names).indexOf(a));
        aSocket.send(command(code, president, "nominate-chancellor").put("target", nominee));
        assertEquals(1002, aSocket.awaitClose().code);
        synchronized (lobby) {
            assertEquals("CHANCELLOR_NOMINATION", lobby.game().getState().toString());
        }

        TestSocket presidentSocket = players.get(List.of(names).indexOf(president));
        presidentSocket.send(new JSONObject().put("lobby", code).put("command", "nominate-chancellor")
                .put("target", nominee)); // no name at all
        presidentSocket.next("ok");

        // b votes, naming a: b's vote is counted, a's is not. c sends no name: c's is counted.
        TestSocket bSocket = players.get(List.of(names).indexOf(b));
        bSocket.send(command(code, a, "register-vote").put("vote", true));
        bSocket.next("ok");
        TestSocket cSocket = players.get(List.of(names).indexOf(c));
        cSocket.send(new JSONObject().put("lobby", code).put("command", "register-vote").put("vote", false));
        cSocket.next("ok");
        synchronized (lobby) {
            Map<String, Boolean> votes = lobby.game().getVotes();
            assertEquals(Map.of(b, true, c, false), votes);
        }
        assertTrue(bSocket.isOpen());
        assertTrue(cSocket.isOpen());
        assertNoHandlerThrew();
    }
}
