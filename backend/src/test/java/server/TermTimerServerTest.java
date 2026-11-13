package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import game.GameState;
import io.javalin.Javalin;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;
import org.junit.After;
import org.junit.AfterClass;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;
import server.util.Lobby;

/** The END TERM countdown's commands over real sockets. */
public class TermTimerServerTest {
    private static final String[] NAMES = { "Ann", "Bob", "Cat", "Dan", "Eve" };

    private static Javalin app;
    private static int port;
    private final List<String> codes = new ArrayList<>();
    private final List<TestSocket> sockets = new ArrayList<>();
    private float savedDuration;

    @BeforeClass
    public static void startServer() {
        app = Javalin.create()
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

    @Before
    public void saveDuration() {
        savedDuration = Lobby.END_TERM_TIMER_IN_SEC;
    }

    @After
    public void cleanUp() {
        Lobby.END_TERM_TIMER_IN_SEC = savedDuration;
        sockets.forEach(TestSocket::close);
        codes.forEach(SecretHitlerServer.codeToLobby::remove);
    }

    private TestSocket connect(String query) throws Exception {
        TestSocket socket = TestSocket.connect(port, query);
        sockets.add(socket);
        return socket;
    }

    private static JSONObject command(String code, String name, String command) {
        return new JSONObject().put("lobby", code).put("name", name).put("command", command);
    }

    /** A lobby of NAMES in a game that waits for END TERM, each player's socket by name order. */
    private Lobby gameAtEndTerm(String code, List<TestSocket> players) throws Exception {
        Lobby lobby = new Lobby();
        SecretHitlerServer.codeToLobby.put(code, lobby);
        codes.add(code);
        for (int i = 0; i < NAMES.length; i++) {
            TestSocket player = connect("lobby=" + code + "&name=" + NAMES[i]);
            player.send(command(code, NAMES[i], "select-icon").put("icon", "p" + (i + 1)));
            player.next("ok");
            players.add(player);
        }
        players.get(0).send(command(code, NAMES[0], "start-game"));
        for (TestSocket player : players) {
            player.nextState("CHANCELLOR_NOMINATION");
        }
        synchronized (lobby) {
            GameDriver.playUntil(lobby.game(), GameState.POST_LEGISLATIVE);
            lobby.updateAllUsers();
        }
        return lobby;
    }

    private static String president(Lobby lobby) {
        synchronized (lobby) {
            return lobby.game().getCurrentPresident();
        }
    }

    /** Waits for a packet at END TERM whose countdown is paused (or running); fails after 5 s. */
    private static void awaitCountdown(TestSocket socket, boolean paused) throws InterruptedException {
        while (true) {
            JSONObject timer = socket.nextState("POST_LEGISLATIVE").optJSONObject("termTimer");
            if (timer != null && timer.getBoolean("paused") == paused) {
                return;
            }
        }
    }

    /** The last game packet {@code socket} has received. */
    private static JSONObject lastGamePacket(TestSocket socket) {
        List<JSONObject> received = socket.received();
        for (int i = received.size() - 1; i >= 0; i--) {
            if (received.get(i).getString("type").equals("game")) {
                return received.get(i);
            }
        }
        throw new AssertionError("no game packet");
    }

    @Test
    public void thePresidentPausesAndResumesTheCountdownThatEveryoneSees() throws Exception {
        String code = "TTAA";
        List<TestSocket> players = new ArrayList<>();
        Lobby lobby = gameAtEndTerm(code, players);
        String president = president(lobby);
        TestSocket presidentSocket = players.get(List.of(NAMES).indexOf(president));
        TestSocket other = players.get((List.of(NAMES).indexOf(president) + 1) % NAMES.length);
        awaitCountdown(other, false);

        presidentSocket.send(command(code, president, "pause-term-timer"));
        presidentSocket.next("ok");
        awaitCountdown(other, true);
        TestSocket spectator = connect("lobby=" + code + "&spectator=true");
        awaitCountdown(spectator, true);

        presidentSocket.send(command(code, president, "resume-term-timer"));
        presidentSocket.next("ok");
        awaitCountdown(other, false);
        awaitCountdown(spectator, false);

        presidentSocket.send(command(code, president, "end-term"));
        assertNull(other.nextState("CHANCELLOR_NOMINATION").optJSONObject("termTimer"));
    }

    @Test
    public void onlyThePresidentMayPauseTheCountdown() throws Exception {
        String code = "TTAB";
        List<TestSocket> players = new ArrayList<>();
        Lobby lobby = gameAtEndTerm(code, players);
        int seat = (List.of(NAMES).indexOf(president(lobby)) + 1) % NAMES.length;

        // Refused like any command a player may not send: the server closes the socket.
        players.get(seat).send(command(code, NAMES[seat], "pause-term-timer"));
        assertEquals(1002, players.get(seat).awaitClose().code);

        // The state a pong follows is the latest: its countdown still runs.
        int next = (seat + 1) % NAMES.length;
        players.get(next).send(command(code, NAMES[next], "get-state"));
        players.get(next).send(command(code, NAMES[next], "ping"));
        players.get(next).next("pong");
        JSONObject state = lastGamePacket(players.get(next));
        assertEquals("POST_LEGISLATIVE", state.getString("state"));
        assertFalse(state.getJSONObject("termTimer").getBoolean("paused"));
    }

    /**
     * END TERM, pause or resume from the president, sent as the countdown ran out, arrives after
     * the term has ended: it is dropped, with no reply, and the socket stays open.
     */
    @Test
    public void aCommandTheCountdownBeatIsDropped() throws Exception {
        Lobby.END_TERM_TIMER_IN_SEC = 0.2f;
        String code = "TTAC";
        List<TestSocket> players = new ArrayList<>();
        Lobby lobby = gameAtEndTerm(code, players);
        String president = president(lobby);
        TestSocket presidentSocket = players.get(List.of(NAMES).indexOf(president));
        presidentSocket.nextState("CHANCELLOR_NOMINATION"); // the countdown ended the term
        int round;
        synchronized (lobby) {
            round = lobby.game().getRound();
        }

        int before = presidentSocket.received().size();
        for (String late : List.of("end-term", "pause-term-timer", "resume-term-timer")) {
            presidentSocket.send(command(code, president, late));
        }
        presidentSocket.send(command(code, president, "ping"));
        presidentSocket.next("pong");

        assertTrue("the president is still connected", presidentSocket.isOpen());
        for (JSONObject packet : presidentSocket.received().subList(before, presidentSocket.received().size())) {
            assertEquals("only the pong came back", "pong", packet.getString("type"));
        }
        synchronized (lobby) {
            assertEquals(GameState.CHANCELLOR_NOMINATION, lobby.game().getState());
            assertEquals(round, lobby.game().getRound());
        }
    }
}
