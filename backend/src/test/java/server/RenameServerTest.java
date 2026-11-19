package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import io.javalin.Javalin;
import java.lang.management.ManagementFactory;
import java.lang.management.MonitorInfo;
import java.lang.management.ThreadInfo;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import server.SecretHitlerServer.RenameResult;
import server.accounts.AccountStore;
import server.util.FakeSocket;
import server.util.Lobby;

/**
 * Renaming an account across the server ({@code SecretHitlerServer.renameAccount}): every lobby the
 * account is in shows the new name at once, and it stays the host where it was; a seat in a running
 * game in any lobby refuses the rename for all of them; and a rename never interleaves with a game
 * start, since both take {@code ACCOUNTS_LOCK} before a lobby's lock, so a game never seats a name
 * the account no longer has.
 */
public class RenameServerTest {
    private final List<String> codes = new ArrayList<>();
    private AccountStore store;
    private AccountStore savedStore;
    private float savedGrace;
    private String savedRedirectUri;

    @Before
    public void useAStore() {
        savedStore = SecretHitlerServer.accounts;
        store = AccountStore.open(null);
        SecretHitlerServer.accounts = store;
        savedGrace = Lobby.PLAYER_TIMEOUT_IN_SEC;
        Lobby.PLAYER_TIMEOUT_IN_SEC = 60; // no removal fires during a test
        // A player's socket is checked against the Host it connects to, the origin TestSocket sends.
        savedRedirectUri = ApplicationConfig.DISCORD_REDIRECT_URI;
        ApplicationConfig.DISCORD_REDIRECT_URI = null;
    }

    @After
    public void restore() {
        codes.forEach(SecretHitlerServer.codeToLobby::remove);
        SecretHitlerServer.accounts = savedStore;
        store.close();
        Lobby.PLAYER_TIMEOUT_IN_SEC = savedGrace;
        ApplicationConfig.DISCORD_REDIRECT_URI = savedRedirectUri;
    }

    private Lobby register(String code) {
        Lobby lobby = new Lobby();
        SecretHitlerServer.codeToLobby.put(code, lobby);
        codes.add(code);
        return lobby;
    }

    /** Joins the test account {@code id} to the lobby under its saved name, with the portrait {@code icon}. */
    private FakeSocket join(Lobby lobby, String id, String icon) {
        FakeSocket socket = FakeSocket.open();
        String accountId = TestAccounts.account(id);
        lobby.addUser(socket.ctx, accountId, store.find(accountId).username());
        lobby.trySetUserIcon(icon, socket.ctx);
        return socket;
    }

    private static List<String> names(JSONObject lobbyPacket) {
        JSONArray array = lobbyPacket.getJSONArray("usernames");
        List<String> names = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) {
            names.add(array.getString(i));
        }
        return names;
    }

    /** The seat name of the account in the lobby's running game, or null if it has none. */
    private static String seatOf(Lobby lobby, String accountId) {
        for (Map.Entry<String, String> seat : lobby.seatAccounts().entrySet()) {
            if (seat.getValue().equals(accountId)) {
                return seat.getKey();
            }
        }
        return null;
    }

    @Test
    public void renamesEveryLobbyTheAccountIsIn() {
        TestAccounts.signIn(store, "1", "Ann");
        TestAccounts.signIn(store, "2", "Bea");
        TestAccounts.signIn(store, "3", "Cy");
        TestAccounts.signIn(store, "4", "Dot");
        Lobby hosted = register("RNMA");
        FakeSocket annHosting = join(hosted, "1", "p1");
        FakeSocket bea = join(hosted, "2", "p2");
        Lobby joined = register("RNMB");
        FakeSocket cy = join(joined, "3", "p3");
        FakeSocket annJoined = join(joined, "1", "p4");
        FakeSocket spectator = FakeSocket.open();
        joined.addSpectator(spectator.ctx);
        Lobby other = register("RNMC");
        FakeSocket dot = join(other, "4", "p5");
        other.sendStateToAll();
        int sentToOther = dot.sent.size();

        assertEquals(RenameResult.SAVED, SecretHitlerServer.renameAccount("test-1", "Zed"));

        assertEquals("Zed", store.find("test-1").username());
        // The host keeps its place, first in the lobby it made.
        for (FakeSocket socket : List.of(annHosting, bea)) {
            assertEquals(List.of("Zed", "Bea"), names(socket.last()));
            assertEquals("p1", socket.last().getJSONObject("icon").getString("Zed"));
        }
        for (FakeSocket socket : List.of(cy, annJoined, spectator)) {
            assertEquals(List.of("Cy", "Zed"), names(socket.last()));
            assertEquals("p4", socket.last().getJSONObject("icon").getString("Zed"));
        }
        assertEquals("Zed", annHosting.last().getString("you"));
        assertEquals("Zed", annJoined.last().getString("you"));
        assertEquals("Bea", bea.last().getString("you"));
        assertFalse(spectator.last().has("you"));
        assertEquals(sentToOther, dot.sent.size()); // a lobby without the account is sent nothing
    }

    @Test
    public void aSeatAnywhereRefusesTheRename() {
        // The same two codes both ways round, so the lobby with the seat is reached both before
        // and after the other, whatever order the map keeps them in.
        refusesWhileSeated("RNMD", "RNME", "1");
        refusesWhileSeated("RNME", "RNMD", "2");
    }

    private void refusesWhileSeated(String playingCode, String idleCode, String id) {
        String name = "Ann" + id;
        TestAccounts.signIn(store, id, name);
        Lobby playing = register(playingCode);
        FakeSocket seated = join(playing, id, "p1");
        SecretHitlerServer.startGame(playing);
        Lobby idle = register(idleCode);
        FakeSocket waiting = join(idle, id, "p2");
        idle.sendStateToAll();
        int sentToSeat = seated.sent.size();
        int sentToIdle = waiting.sent.size();

        assertEquals(RenameResult.SEATED, SecretHitlerServer.renameAccount(TestAccounts.account(id), "Zed" + id));

        assertEquals(name, store.find(TestAccounts.account(id)).username());
        assertEquals(sentToSeat, seated.sent.size());
        assertEquals(sentToIdle, waiting.sent.size());
        idle.sendStateToAll();
        assertEquals(List.of(name), names(waiting.last()));
        assertEquals(name, seatOf(playing, TestAccounts.account(id)));
        SecretHitlerServer.codeToLobby.remove(playingCode);
        SecretHitlerServer.codeToLobby.remove(idleCode);
    }

    @Test
    public void renameAgainstGameStart() throws Exception {
        TestAccounts.signIn(store, "1", "Old");
        TestAccounts.signIn(store, "2", "Bea");
        ExecutorService threads = Executors.newFixedThreadPool(2);
        try {
            for (int i = 0; i < 200; i++) {
                String oldName = "Old" + i;
                String newName = "New" + i;
                assertEquals(AccountStore.NameResult.SAVED, store.setUsername("test-1", oldName));
                String code = String.format("R%03d", i);
                Lobby lobby = register(code);
                join(lobby, "1", "p1");
                join(lobby, "2", "p2");

                CountDownLatch go = new CountDownLatch(1);
                Future<RenameResult> rename = threads.submit(() -> {
                    go.await();
                    return SecretHitlerServer.renameAccount("test-1", newName);
                });
                Future<?> start = threads.submit(() -> {
                    go.await();
                    SecretHitlerServer.startGame(lobby);
                    return null;
                });
                go.countDown();
                RenameResult result = rename.get(10, TimeUnit.SECONDS);
                start.get(10, TimeUnit.SECONDS);

                String seat = seatOf(lobby, "test-1");
                String row = store.find("test-1").username();
                if (result == RenameResult.SAVED) {
                    // The rename came first: the game seats the new name.
                    assertEquals("round " + i, newName, seat);
                    assertEquals("round " + i, newName, row);
                } else {
                    // The game came first: the seat refuses the rename, and nothing changes.
                    assertEquals("round " + i, RenameResult.SEATED, result);
                    assertEquals("round " + i, oldName, seat);
                    assertEquals("round " + i, oldName, row);
                }
                // The next round's account must not be seated in this round's game.
                SecretHitlerServer.codeToLobby.remove(code);
            }
        } finally {
            threads.shutdownNow();
        }
    }

    @Test
    public void theStartGameCommandTakesTheAccountsLockFirst() throws Exception {
        Javalin app = ServerTesting.startOnLoopback(Javalin.create()
                .ws("/game", ws -> {
                    ws.onConnect(SecretHitlerServer::onWebsocketConnect);
                    ws.onMessage(SecretHitlerServer::onWebSocketMessage);
                    ws.onClose(SecretHitlerServer::onWebSocketClose);
                }));
        TestSocket socket = null;
        try {
            Lobby lobby = register("RNMS");
            socket = TestSocket.connect(app.port(), "lobby=RNMS", TestAccounts.signIn(store, "1", "Ann"));
            socket.next("lobby");
            socket.send(command("select-icon").put("icon", "p1"));
            socket.next("ok");

            synchronized (SecretHitlerServer.ACCOUNTS_LOCK) {
                socket.send(command("start-game"));
                ThreadInfo waiting = awaitThreadBlockedOn(SecretHitlerServer.ACCOUNTS_LOCK);
                for (MonitorInfo held : waiting.getLockedMonitors()) {
                    assertFalse("the start-game handler took the lobby's lock before ACCOUNTS_LOCK",
                            held.getIdentityHashCode() == System.identityHashCode(lobby));
                }
                assertFalse(lobby.isInGame());
            }
            socket.nextState("CHANCELLOR_NOMINATION");
            assertTrue(lobby.isInGame());
        } finally {
            if (socket != null) {
                socket.close();
            }
            app.stop();
        }
    }

    private static JSONObject command(String command) {
        return new JSONObject().put("lobby", "RNMS").put("name", "Ann").put("command", command);
    }

    /** Waits up to 5 s for a thread to block on {@code lock}, and returns it with the monitors it holds. */
    private static ThreadInfo awaitThreadBlockedOn(Object lock) throws InterruptedException {
        int id = System.identityHashCode(lock);
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            for (ThreadInfo thread : ManagementFactory.getThreadMXBean().dumpAllThreads(true, false)) {
                if (thread.getThreadState() == Thread.State.BLOCKED && thread.getLockInfo() != null
                        && thread.getLockInfo().getIdentityHashCode() == id) {
                    return thread;
                }
            }
            Thread.sleep(5);
        }
        fail("no thread waited for the lock within 5 s");
        return null;
    }

    @Test
    public void renamingToTheSameNameSavesAndSendsNothing() {
        TestAccounts.signIn(store, "1", "Ann");
        Lobby lobby = register("RNMF");
        FakeSocket ann = join(lobby, "1", "p1");
        int sent = ann.sent.size();
        assertEquals(RenameResult.SAVED, SecretHitlerServer.renameAccount("test-1", "Ann"));
        assertEquals(sent, ann.sent.size());
        assertEquals(RenameResult.SAVED, SecretHitlerServer.renameAccount("test-1", "ANN"));
        assertEquals("ANN", store.find("test-1").username());
        assertEquals(List.of("ANN"), names(ann.last()));
    }

    @Test
    public void aTakenNameChangesNoLobby() {
        TestAccounts.signIn(store, "1", "Ann");
        TestAccounts.signIn(store, "2", "Bea");
        Lobby lobby = register("RNMG");
        FakeSocket ann = join(lobby, "1", "p1");
        int sent = ann.sent.size();
        assertEquals(RenameResult.TAKEN, SecretHitlerServer.renameAccount("test-1", "bea"));
        assertEquals("Ann", store.find("test-1").username());
        assertEquals(sent, ann.sent.size());
        lobby.sendStateToAll();
        assertEquals(List.of("Ann"), names(ann.last()));
    }

    @Test
    public void aNameThatBreaksTheRulesIsRefusedBeforeAnythingChanges() {
        TestAccounts.signIn(store, "1", "Ann");
        Lobby lobby = register("RNMH");
        FakeSocket ann = join(lobby, "1", "p1");
        for (String name : new String[] { null, "", " Zed", "Bot 3", "Thirteen char" }) {
            try {
                SecretHitlerServer.renameAccount("test-1", name);
                fail("renamed to '" + name + "'");
            } catch (IllegalArgumentException expected) {
                // refused
            }
        }
        assertEquals("Ann", store.find("test-1").username());
        assertTrue(ann.sent.isEmpty());
        lobby.sendStateToAll();
        assertEquals(List.of("Ann"), names(ann.last()));
    }
}
