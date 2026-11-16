package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.File;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.slf4j.LoggerFactory;
import server.accounts.AccountStore;
import server.stats.GameRecord;
import server.stats.TestRecords;
import server.stats.TestStore;
import server.util.Lobby;
import server.util.RecordedGames;

/**
 * The server records games from start-up to shutdown ({@code SecretHitlerServer.startUp},
 * {@code everyMinute} and {@code onShutdown}): no database call ever runs under a lobby's lock, a
 * stuck database never holds a game up, a restored game that already has a record is dropped
 * before the start-up sweep could record it again, a database down at start-up keeps every
 * restored game and loses no record, and the shutdown tries the waiting records before the last
 * backup.
 */
public class RecordingServerTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    // CPU ticks, countdowns and grace windows wait for the test (GameDriver.stepCpus), and the
    // lobby timeout is put back after each test.
    @Rule
    public final RecordedGames settings = new RecordedGames();

    private ConcurrentHashMap<String, Lobby> savedLobbies;
    private String savedPath;
    private AccountStore savedAccounts;
    private AccountStore accounts;
    private final List<TestStore> stores = new ArrayList<>();

    @Before
    public void saveTheServer() {
        savedLobbies = SecretHitlerServer.codeToLobby;
        SecretHitlerServer.codeToLobby = new ConcurrentHashMap<>();
        savedPath = ApplicationConfig.DATABASE_PATH;
        ApplicationConfig.DATABASE_PATH = null;
        savedAccounts = SecretHitlerServer.accounts;
        accounts = AccountStore.open(null);
        SecretHitlerServer.accounts = accounts;
    }

    @After
    public void restoreTheServer() {
        SecretHitlerServer.stopRecording();
        SecretHitlerServer.codeToLobby = savedLobbies;
        ApplicationConfig.DATABASE_PATH = savedPath;
        SecretHitlerServer.accounts = savedAccounts;
        accounts.close();
        stores.forEach(TestStore::close);
    }

    private TestStore store(String path) {
        TestStore store = path == null ? new TestStore() : new TestStore(path);
        stores.add(store);
        return store;
    }

    private String path() {
        return new File(tmp.getRoot(), "backup.db").getAbsolutePath();
    }

    /** A lobby whose game of five CPU players has just started, timed out now if {@code timedOut}. */
    private static Lobby cpuGame(boolean timedOut) {
        long saved = Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN;
        Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN = timedOut ? 0 : 10;
        try {
            Lobby lobby = new Lobby();
            lobby.startNewGame();
            return lobby;
        } finally {
            Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN = saved;
        }
    }

    /** Plays the lobby's CPU game to its end: the lobby has no game after it. */
    private static void playOut(Lobby lobby) {
        GameDriver.stepCpus(lobby, g -> false);
        assertFalse("the game has ended", lobby.isInGame());
    }

    /** Writes the lobbies as the lobby backup, in the file at {@code DATABASE_PATH}. */
    private static void backUp(Map<String, Lobby> lobbies) throws Exception {
        try (Connection c = SecretHitlerServer.getDatabaseConnection(ApplicationConfig.DATABASE_PATH)) {
            SecretHitlerServer.storeLobbies(c, new ConcurrentHashMap<>(lobbies));
        }
    }

    /** The stored records of {@code id}. */
    private static List<JsonNode> recordsOf(TestStore store, String id) throws Exception {
        List<JsonNode> found = new ArrayList<>();
        for (String json : store.recordsJson()) {
            JsonNode record = JSON.readTree(json);
            if (record.get("id").asText().equals(id)) {
                found.add(record);
            }
        }
        return found;
    }

    /** Collects what the server logs while it runs. */
    private static List<ILoggingEvent> logged(Runnable run) {
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        ch.qos.logback.classic.Logger log = (ch.qos.logback.classic.Logger) LoggerFactory
                .getLogger(SecretHitlerServer.class);
        log.addAppender(appender);
        try {
            run.run();
        } finally {
            log.detachAppender(appender);
        }
        return appender.list;
    }

    @Test
    public void noDatabaseCallUnderALobbyLock() throws Exception {
        List<Lobby> lobbies = new CopyOnWriteArrayList<>();
        List<String> underALock = new CopyOnWriteArrayList<>();
        TestStore store = store(null);
        store.onCall = () -> {
            for (Lobby lobby : lobbies) {
                if (Thread.holdsLock(lobby)) {
                    underALock.add(Thread.currentThread().getName());
                }
            }
        };
        SecretHitlerServer.startRecording(store);

        Lobby played = cpuGame(false);
        lobbies.add(played);
        playOut(played);

        Lobby swept = cpuGame(true);
        lobbies.add(swept);
        SecretHitlerServer.codeToLobby.put("SWEP", swept);
        SecretHitlerServer.removeInactiveLobbies();
        assertFalse(SecretHitlerServer.codeToLobby.containsKey("SWEP"));

        ApplicationConfig.DATABASE_PATH = path();
        backUp(Map.of("REST", cpuGame(false)));
        ConcurrentHashMap<String, Lobby> restored;
        try (Connection c = SecretHitlerServer.getDatabaseConnection(path())) {
            restored = SecretHitlerServer.loadLobbies(c);
        }
        lobbies.addAll(restored.values());
        SecretHitlerServer.dropRecordedGames(restored, store);

        assertTrue("both records saved", TestStore.await(() -> store.written.size() == 2, 5_000));
        assertTrue(store.saves.get() >= 2);
        assertTrue(store.recordedIdsCalls.get() >= 1);
        assertEquals(List.of(), underALock);
    }

    @Test
    public void aStuckDatabaseNeverHoldsUpTheGame() {
        TestStore store = store(null);
        store.block();
        SecretHitlerServer.startRecording(store);
        Lobby lobby = cpuGame(false);
        String first = lobby.gameId();

        playOut(lobby);
        synchronized (lobby) {
            lobby.startNewGame();
        }
        String second = lobby.gameId();
        playOut(lobby);

        assertEquals("neither saved while the database is stuck", List.of(), store.written);
        store.release();
        assertTrue("both saved once it is not", TestStore.await(() -> store.written.size() == 2, 5_000));
        assertEquals(List.of(first, second), store.written);
    }

    @Test
    public void startUpDropsRecordedGamesBeforeTheSweep() throws Exception {
        ApplicationConfig.DATABASE_PATH = path();
        Lobby recorded = cpuGame(true);
        Lobby unrecorded = cpuGame(true);
        String recordedId = recorded.gameId();
        String unrecordedId = unrecorded.gameId();
        backUp(Map.of("ABCD", recorded, "EFGH", unrecorded));
        TestStore store = store(path());
        GameRecord first = TestRecords.record(recordedId, 2_000_000L, GameRecord.LIBERAL_POLICIES,
                TestRecords.seats());
        assertTrue(store.save(first));
        store.saveIds.clear();

        SecretHitlerServer.startUp(store);

        assertFalse(SecretHitlerServer.codeToLobby.containsKey("ABCD"));
        assertFalse(SecretHitlerServer.codeToLobby.containsKey("EFGH"));
        assertTrue("the swept game is recorded", TestStore.await(() -> store.written.contains(unrecordedId), 5_000));
        List<JsonNode> unfinished = recordsOf(store, unrecordedId);
        assertEquals(1, unfinished.size());
        assertEquals(GameRecord.UNFINISHED, unfinished.get(0).get("outcome").asText());
        assertFalse("no second record of the recorded game", store.saveIds.contains(recordedId));
        List<JsonNode> stands = recordsOf(store, recordedId);
        assertEquals(1, stands.size());
        assertEquals(GameRecord.LIBERAL_POLICIES, stands.get(0).get("outcome").asText());
    }

    @Test
    public void aDatabaseDownAtStartUpKeepsTheGames() throws Exception {
        ApplicationConfig.DATABASE_PATH = path();
        Lobby live = cpuGame(false);
        Lobby timedOut = cpuGame(true);
        String liveId = live.gameId();
        String timedOutId = timedOut.gameId();
        backUp(Map.of("ABCD", live, "EFGH", timedOut));
        TestStore store = store(path());
        store.failing = true;

        List<ILoggingEvent> log = logged(() -> SecretHitlerServer.startUp(store));

        Lobby kept = SecretHitlerServer.codeToLobby.get("ABCD");
        assertNotNull(kept);
        assertTrue(kept.isInGame());
        assertEquals(liveId, kept.gameId());
        assertFalse(SecretHitlerServer.codeToLobby.containsKey("EFGH"));
        assertTrue(log.stream().anyMatch(e -> e.getLevel() == Level.ERROR
                && e.getFormattedMessage().equals(
                        "Could not read which restored games have a record: every restored game is kept.")));
        assertTrue("the swept game's record waits",
                TestStore.await(() -> SecretHitlerServer.recorder.waitingCount() == 1, 5_000));

        store.failing = false;
        SecretHitlerServer.everyMinute();
        assertTrue("written once the database is back",
                TestStore.await(() -> store.written.contains(timedOutId), 5_000));
        assertEquals(GameRecord.UNFINISHED, recordsOf(store, timedOutId).get(0).get("outcome").asText());
        assertEquals(0, SecretHitlerServer.recorder.waitingCount());
        assertTrue(SecretHitlerServer.codeToLobby.get("ABCD").isInGame());
    }

    @Test
    public void onShutdownTriesWaitingRecordsBeforeTheLastBackup() throws Exception {
        ApplicationConfig.DATABASE_PATH = path();
        TestStore store = store(path());
        store.failing = true;
        SecretHitlerServer.startRecording(store);
        GameRecord record = TestRecords.record("g1", 2_000_000L, GameRecord.LIBERAL_POLICIES,
                TestRecords.seats("acct-Ann"));
        Lobby.recordSink.submit(record);
        assertTrue(TestStore.await(() -> SecretHitlerServer.recorder.waitingCount() == 1, 5_000));
        SecretHitlerServer.recorder.stop();
        store.failing = false;
        AtomicBoolean backupAtSave = new AtomicBoolean(true);
        store.onCall = () -> backupAtSave.set(hasBackupRow());

        SecretHitlerServer.onShutdown();

        assertEquals(List.of("g1"), store.written);
        assertFalse("saved before the last backup", backupAtSave.get());
        assertTrue("then backed up", hasBackupRow());
    }

    /** Whether the file at {@code DATABASE_PATH} holds a lobby backup. */
    private static boolean hasBackupRow() {
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + ApplicationConfig.DATABASE_PATH);
                Statement s = c.createStatement()) {
            try (ResultSet table = s.executeQuery(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'backup'")) {
                if (!table.next() || table.getInt(1) == 0) {
                    return false;
                }
            }
            try (ResultSet rows = s.executeQuery("SELECT COUNT(*) FROM backup")) {
                return rows.next() && rows.getInt(1) > 0;
            }
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
