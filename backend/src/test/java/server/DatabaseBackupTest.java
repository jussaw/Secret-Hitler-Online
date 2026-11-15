package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import game.datastructures.Player;
import java.io.File;
import java.io.InputStream;
import java.nio.file.Files;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import server.util.FakeSocket;
import server.util.Lobby;

public class DatabaseBackupTest {
    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private String dbPath() {
        return new File(tmp.getRoot(), "backup.db").getAbsolutePath();
    }

    private static List<String> playerNames(Lobby lobby) {
        return lobby.game().getPlayerList().stream().map(Player::getUsername).collect(Collectors.toList());
    }

    private void store(ConcurrentHashMap<String, Lobby> lobbies) throws Exception {
        try (Connection c = SecretHitlerServer.getDatabaseConnection(dbPath())) {
            SecretHitlerServer.storeLobbies(c, lobbies);
        }
    }

    private ConcurrentHashMap<String, Lobby> load() throws Exception {
        try (Connection c = SecretHitlerServer.getDatabaseConnection(dbPath())) {
            return SecretHitlerServer.loadLobbies(c);
        }
    }

    @Test
    public void lobbiesSurviveARoundTripThroughTheSqliteFile() throws Exception {
        ConcurrentHashMap<String, Lobby> lobbies = new ConcurrentHashMap<>();
        Lobby inGame = new Lobby();
        inGame.startNewGame(); // no humans: five CPU players take the seats
        lobbies.put("ABCD", inGame);
        lobbies.put("WXYZ", new Lobby());

        store(lobbies);
        ConcurrentHashMap<String, Lobby> loaded = load();

        assertEquals(lobbies.keySet(), loaded.keySet());
        assertTrue(loaded.get("ABCD").isInGame());
        assertEquals(playerNames(inGame), playerNames(loaded.get("ABCD")));
        assertFalse(loaded.get("WXYZ").isInGame());
    }

    @Test
    public void storingAgainReplacesThePreviousBackup() throws Exception {
        ConcurrentHashMap<String, Lobby> first = new ConcurrentHashMap<>();
        first.put("AAAA", new Lobby());
        ConcurrentHashMap<String, Lobby> second = new ConcurrentHashMap<>();
        second.put("BBBB", new Lobby());

        store(first);
        store(second);

        assertEquals(second.keySet(), load().keySet());
    }

    @Test
    public void anEmptyDatabaseLoadsNothing() throws Exception {
        assertNull(load());
    }

    @Test
    public void unsetOrUnwritablePathDisablesPersistence() {
        assertNull(SecretHitlerServer.getDatabaseConnection(null));
        assertNull(SecretHitlerServer.getDatabaseConnection(" "));
        assertNull(SecretHitlerServer.getDatabaseConnection(
                new File(tmp.getRoot(), "missing/dir/backup.db").getAbsolutePath()));
    }

    /**
     * The account store keeps its own connection to the backup file, so a backup waits for the
     * store's writes, as long as the store waits for its, instead of failing with SQLITE_BUSY.
     */
    @Test
    public void theBackupWaitsForTheAccountStoresWrites() throws Exception {
        try (Connection c = SecretHitlerServer.getDatabaseConnection(dbPath());
                Statement stmt = c.createStatement();
                ResultSet timeout = stmt.executeQuery("PRAGMA busy_timeout")) {
            assertTrue(timeout.next());
            assertEquals(5000, timeout.getInt(1));
        }
    }

    /**
     * backup-before-spectators.db was written by the release before spectators (d35fade): a lobby
     * in a game of five CPU players under "ABCD" and an empty one under "WXYZ". It has no account
     * maps, so the load keeps the idle lobby, which an account can join, and drops the game, whose
     * seats belong to typed names that no account can take back.
     */
    @Test
    public void aBackupFromBeforeAccountsKeepsIdleLobbies() throws Exception {
        try (InputStream fixture = getClass().getResourceAsStream("/backup-before-spectators.db")) {
            Files.copy(fixture, new File(dbPath()).toPath());
        }
        ConcurrentHashMap<String, Lobby> loaded = load();

        assertEquals(Set.of("WXYZ"), loaded.keySet());
        Lobby idle = loaded.get("WXYZ");
        assertFalse(idle.isInGame());
        assertEquals(0, idle.getSpectatorCount());
        assertNull(idle.joinRefusal("acct-Ann", null));
        FakeSocket ann = FakeSocket.open();
        idle.addUser(ann.ctx, "acct-Ann", "Ann");
        idle.sendStateToAll();
        assertTrue(ann.last().toString().contains("Ann"));
        assertEquals(1, idle.getUserCount());
    }

    /** A game seated by accounts and CPU players keeps each seat's account through a backup. */
    @Test
    public void seatsKeepTheirAccountsThroughABackup() throws Exception {
        Lobby lobby = new Lobby();
        FakeSocket ann = FakeSocket.open();
        FakeSocket bob = FakeSocket.open();
        lobby.addUser(ann.ctx, "acct-Ann", "Ann");
        lobby.trySetUserIcon("p1", ann.ctx);
        lobby.addUser(bob.ctx, "acct-Bob", "Bob");
        lobby.trySetUserIcon("p2", bob.ctx);
        lobby.startNewGame();
        Map<String, String> before = lobby.seatAccounts();
        assertEquals(Map.of("Ann", "acct-Ann", "Bob", "acct-Bob"), before);

        store(new ConcurrentHashMap<>(Map.of("ABCD", lobby)));
        Lobby restored = load().get("ABCD");

        assertTrue(restored.isInGame());
        assertFalse(restored.wasBackedUpBeforeAccounts());
        assertEquals(before, restored.seatAccounts());
        assertEquals(lobby.game().getPlayerList().size(), restored.game().getPlayerList().size());
    }
}
