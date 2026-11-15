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
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.eclipse.jetty.websocket.api.StatusCode;
import org.json.JSONObject;
import org.junit.After;
import org.junit.AfterClass;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;
import server.util.Lobby;

/**
 * A lobby that times out while a connection joins it, sends it a message or checks a login (#64).
 * The sweep ({@code SecretHitlerServer.removeInactiveLobbies}) runs on a timer without any
 * handler's lock, so it can land between a handler's lookup of the lobby and its work there. Each
 * test runs the real sweep at one such point, on the handler's own thread: just before or just
 * after the handler looks the lobby up in {@code codeToLobby}, or just before a message's handler.
 * One more runs it on its own thread while a join holds the lobby's lock. No handler may throw, no
 * connection may be left in a lobby the sweep has removed, and the close handlers forget every
 * connection the sweep closes. Over real sockets.
 */
public class LobbyTimeoutServerTest {
    private static Javalin app;
    private static int port;
    // Every exception a /game handler let out, which Javalin would log and answer with 1011.
    private static final List<Exception> thrown = new CopyOnWriteArrayList<>();
    // The messages whose handlers have finished, in order.
    private static final BlockingQueue<String> handled = new LinkedBlockingQueue<>();
    private static final AtomicBoolean sweepBeforeNextMessage = new AtomicBoolean();

    private final List<TestSocket> sockets = new ArrayList<>();
    private ConcurrentHashMap<String, Lobby> savedLobbies;
    private long savedTimeout;
    private SweepingMap lobbies;
    private char nextCode = 'A';

    @BeforeClass
    public static void startServer() {
        app = Javalin.create()
                .get("/check-login", SecretHitlerServer::checkLogin)
                .wsBefore(ws -> ws.onMessage(ctx -> {
                    if (sweepBeforeNextMessage.getAndSet(false)) {
                        SecretHitlerServer.removeInactiveLobbies();
                    }
                }))
                .ws("/game", ws -> {
                    ws.onConnect(SecretHitlerServer::onWebsocketConnect);
                    ws.onMessage(SecretHitlerServer::onWebSocketMessage);
                    ws.onClose(SecretHitlerServer::onWebSocketClose);
                })
                .wsAfter(ws -> ws.onMessage(ctx -> handled.add(ctx.message())))
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

    /** Every lobby times out as soon as it is made, and stays timed out, so a sweep removes it. */
    @Before
    public void timeOutEveryLobby() {
        savedTimeout = Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN;
        Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN = 0;
        savedLobbies = SecretHitlerServer.codeToLobby;
        lobbies = new SweepingMap();
        SecretHitlerServer.codeToLobby = lobbies;
        thrown.clear();
        handled.clear();
        sweepBeforeNextMessage.set(false);
    }

    @After
    public void cleanUp() {
        sockets.forEach(TestSocket::close);
        SecretHitlerServer.codeToLobby = savedLobbies;
        Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN = savedTimeout;
    }

    /** Where the sweep lands, against the handler's lookup of the lobby in {@code codeToLobby}. */
    private enum Timing {
        JUST_BEFORE_THE_LOOKUP, JUST_AFTER_THE_LOOKUP
    }

    /**
     * {@code codeToLobby}, which runs the sweep on the next lookup of one code, just before or just
     * after it. {@code containsKey} is not a lookup here: the handlers once called it before their
     * {@code get}, and a sweep between the two made them throw.
     */
    private static final class SweepingMap extends ConcurrentHashMap<String, Lobby> {
        private final AtomicReference<String> armedCode = new AtomicReference<>();
        private volatile Timing timing;
        private volatile boolean swept;

        void sweepAtNextLookup(String code, Timing timing) {
            this.timing = timing;
            swept = false;
            armedCode.set(code);
        }

        boolean swept() {
            return swept;
        }

        @Override
        public Lobby get(Object key) {
            String code = armedCode.get();
            boolean sweep = key.equals(code) && armedCode.compareAndSet(code, null);
            if (sweep && timing == Timing.JUST_BEFORE_THE_LOOKUP) {
                sweep();
            }
            Lobby lobby = super.get(key);
            if (sweep && timing == Timing.JUST_AFTER_THE_LOOKUP) {
                sweep();
            }
            return lobby;
        }

        @Override // ConcurrentHashMap's own containsKey calls get
        public boolean containsKey(Object key) {
            return super.get(key) != null;
        }

        private void sweep() {
            SecretHitlerServer.removeInactiveLobbies();
            swept = true;
        }
    }

    /**
     * A lobby whose next add, once armed, starts the sweep on a thread of its own and waits until
     * the sweep waits for this lobby's lock, which the join's handler holds around the add.
     */
    private static final class HoldingLobby extends Lobby {
        private volatile boolean armed;
        private volatile boolean sweepWaited;
        private volatile Thread sweep;

        void sweepDuringNextAdd() {
            armed = true;
        }

        boolean sweepWaited() {
            return sweepWaited;
        }

        Thread sweep() {
            return sweep;
        }

        @Override // not synchronized: the join's handler holds this lobby's lock around the add
        public WsContext addUser(WsContext context, String name, String rejoinKey) {
            if (armed) {
                armed = false;
                sweep = new Thread(SecretHitlerServer::removeInactiveLobbies, "sweep");
                sweep.start();
                sweepWaited = awaitBlockedOnThisLobby(sweep);
            }
            return super.addUser(context, name, rejoinKey);
        }

        private boolean awaitBlockedOnThisLobby(Thread thread) {
            long deadline = System.currentTimeMillis() + 5000;
            while (System.currentTimeMillis() < deadline) {
                ThreadInfo info = ManagementFactory.getThreadMXBean().getThreadInfo(thread.getId());
                if (info != null && info.getThreadState() == Thread.State.BLOCKED && info.getLockInfo() != null
                        && info.getLockInfo().getIdentityHashCode() == System.identityHashCode(this)) {
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
    }

    /** A new lobby code for this test: the prefix and the next letter. */
    private String code(String prefix) {
        return prefix + nextCode++;
    }

    private <L extends Lobby> L register(String code, L lobby) {
        lobbies.put(code, lobby);
        return lobby;
    }

    private Lobby lobby(String code) {
        return register(code, new Lobby());
    }

    private TestSocket connect(String query) throws Exception {
        TestSocket socket = TestSocket.connect(port, query);
        sockets.add(socket);
        return socket;
    }

    /** Connects a player with the portrait p1, and waits until the server has taken it. */
    private TestSocket player(String code, String name) throws Exception {
        TestSocket player = connect("lobby=" + code + "&name=" + name + "&rejoinKey=key-of-" + name);
        player.send(command(code, name, "select-icon").put("icon", "p1"));
        player.next("ok");
        return player;
    }

    private TestSocket spectator(String code) throws Exception {
        TestSocket spectator = connect("lobby=" + code + "&spectator=true");
        spectator.next("lobby");
        return spectator;
    }

    /** A command as the page sends it: a spectator's name is "". */
    private static JSONObject command(String code, String name, String command) {
        return new JSONObject().put("lobby", code).put("name", name).put("command", command);
    }

    private static HttpResponse<String> checkLogin(String query) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/check-login?" + query))
                .build();
        return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
    }

    /** Waits for the server to close the socket, and fails with {@code failureIfOpen} if it never does. */
    private static TestSocket.CloseInfo awaitClose(TestSocket socket, String failureIfOpen) throws Exception {
        try {
            return socket.awaitClose();
        } catch (TimeoutException e) {
            fail(failureIfOpen);
            return null;
        }
    }

    /** The socket was closed by the sweep, as every connection of a lobby that times out is. */
    private static void assertTimedOut(String what, TestSocket socket) throws Exception {
        TestSocket.CloseInfo closed = awaitClose(socket, what + ": the sweep left a connection open");
        assertEquals(what, 1000, closed.code);
        assertEquals(what, "The lobby has timed out.", closed.reason);
    }

    /** Waits up to 5 s until the close handlers have forgotten every connection of the lobby. */
    private static void awaitNoConnectionsOf(String what, Lobby lobby) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5000;
        while (SecretHitlerServer.userToLobby.containsValue(lobby)) {
            if (System.currentTimeMillis() > deadline) {
                fail(what + ": userToLobby still held a connection of the removed lobby after 5 s");
            }
            Thread.sleep(10);
        }
    }

    /** Waits until the handler of the next message has finished. */
    private static void awaitHandled() throws InterruptedException {
        if (handled.poll(5, TimeUnit.SECONDS) == null) {
            fail("no message was handled within 5 s");
        }
    }

    private static void assertNoHandlerThrew(String what) {
        assertEquals(what + ": a handler threw " + thrown, List.of(), thrown);
    }

    @Test
    public void aPlayerJoiningAsTheLobbyTimesOutIsRefused() throws Exception {
        for (Timing timing : Timing.values()) {
            String what = "a sweep " + timing;
            String code = code("TOP");
            Lobby lobby = lobby(code);
            TestSocket bob = player(code, "Bob");

            lobbies.sweepAtNextLookup(code, timing);
            TestSocket ann = connect("lobby=" + code + "&name=Ann&rejoinKey=key-of-Ann");
            TestSocket.CloseInfo refused = awaitClose(ann,
                    what + ": Ann was left connected to a lobby the sweep had removed");

            assertTrue(what + ": the sweep never ran", lobbies.swept());
            assertNoHandlerThrew(what);
            assertEquals(what, 1002, refused.code);
            assertEquals(what, "The lobby '" + code + "' does not exist.", refused.reason);
            assertTimedOut(what, bob);
            assertFalse(what, lobbies.containsKey(code));
            awaitNoConnectionsOf(what, lobby);
        }
    }

    @Test
    public void aSpectatorJoiningAsTheLobbyTimesOutIsRefused() throws Exception {
        for (Timing timing : Timing.values()) {
            String what = "a sweep " + timing;
            String code = code("TOS");
            Lobby lobby = lobby(code);
            TestSocket bob = player(code, "Bob");

            lobbies.sweepAtNextLookup(code, timing);
            TestSocket spectator = connect("lobby=" + code + "&spectator=true");
            TestSocket.CloseInfo refused = awaitClose(spectator,
                    what + ": the spectator was left watching a lobby the sweep had removed");

            assertTrue(what + ": the sweep never ran", lobbies.swept());
            assertNoHandlerThrew(what);
            assertEquals(what, 1002, refused.code);
            assertEquals(what, "The lobby '" + code + "' does not exist.", refused.reason);
            assertTimedOut(what, bob);
            awaitNoConnectionsOf(what, lobby);
        }
    }

    /** The sweep comes while the join holds the lobby's lock: the join is closed with the lobby. */
    @Test
    public void aJoinHoldingTheLockAsTheSweepComesIsClosedWithTheLobby() throws Exception {
        String code = code("TOH");
        HoldingLobby lobby = register(code, new HoldingLobby());
        TestSocket bob = player(code, "Bob");

        lobby.sweepDuringNextAdd();
        TestSocket ann = connect("lobby=" + code + "&name=Ann&rejoinKey=key-of-Ann");
        assertTimedOut("Ann, who joined before the sweep closed the lobby", ann);
        lobby.sweep().join(5000);

        assertTrue("the sweep did not wait for the lock the join held", lobby.sweepWaited());
        assertNoHandlerThrew("a sweep waiting for a join");
        assertTimedOut("Bob", bob);
        assertFalse(lobbies.containsKey(code));
        awaitNoConnectionsOf("a sweep waiting for a join", lobby);
    }

    @Test
    public void aPlayersMessageAsTheLobbyTimesOutIsRefused() throws Exception {
        for (Timing timing : Timing.values()) {
            String what = "a sweep " + timing;
            String code = code("TOM");
            Lobby lobby = lobby(code);
            TestSocket bob = player(code, "Bob");
            awaitHandled(); // Bob's select-icon

            lobbies.sweepAtNextLookup(code, timing);
            bob.send(command(code, "Bob", "start-game")); // Bob alone, with a portrait: a game with bots
            awaitHandled();

            assertTrue(what + ": the sweep never ran", lobbies.swept());
            assertNoHandlerThrew(what);
            assertFalse(what + ": a lobby the sweep had removed took a command", lobby.isInGame());
            assertTimedOut(what, bob);
            awaitNoConnectionsOf(what, lobby);
        }
    }

    /** A spectator's message that the sweep beats to its handler: the sweep has closed its socket. */
    @Test
    public void aSpectatorsMessageAfterItsLobbyTimesOutIsRefused() throws Exception {
        String code = code("TOW");
        Lobby lobby = lobby(code);
        TestSocket spectator = spectator(code);

        sweepBeforeNextMessage.set(true);
        spectator.send(command(code, "", "ping"));
        awaitHandled();

        assertFalse("the message was not swept", sweepBeforeNextMessage.get());
        assertNoHandlerThrew("a spectator's message");
        assertTimedOut("a spectator's message", spectator);
        for (JSONObject packet : spectator.received()) {
            assertFalse("a lobby the sweep had removed answered " + packet, "pong".equals(packet.optString("type")));
        }
        awaitNoConnectionsOf("a spectator's message", lobby);
    }

    @Test
    public void aLoginCheckAsTheLobbyTimesOutFindsNoLobby() throws Exception {
        for (Timing timing : Timing.values()) {
            for (String who : List.of("name=Ann", "spectator=true")) {
                String what = who + ", a sweep " + timing;
                String code = code("TOL");
                lobby(code);

                lobbies.sweepAtNextLookup(code, timing);
                HttpResponse<String> login = checkLogin("lobby=" + code + "&" + who);

                assertEquals(what + ": " + login.body(), 404, login.statusCode());
                assertEquals(what, "No such lobby found.", login.body());
                assertTrue(what + ": the sweep never ran", lobbies.swept());
            }
        }
    }
}
