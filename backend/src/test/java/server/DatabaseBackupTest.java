package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import game.datastructures.Player;
import java.io.File;
import java.sql.Connection;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
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
}
