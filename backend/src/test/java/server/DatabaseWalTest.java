package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.io.File;
import java.io.InputStream;
import java.nio.file.Files;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.slf4j.LoggerFactory;
import server.accounts.AccountStore;
import server.util.Lobby;

/**
 * At start the server puts the database file in WAL mode, so a backup's read never blocks the
 * server's writes and a write never fails because a backup is reading. A busy file is retried
 * for a while, and a file that stays busy keeps its journal mode: the game starts either way.
 */
public class DatabaseWalTest {
    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private final ListAppender<ILoggingEvent> appender = new ListAppender<>();
    private final ch.qos.logback.classic.Logger root = (ch.qos.logback.classic.Logger) LoggerFactory
            .getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);

    @Before
    public void captureLogs() {
        appender.start();
        root.addAppender(appender);
    }

    @After
    public void releaseLogs() {
        root.detachAppender(appender);
    }

    private String dbPath() {
        return new File(tmp.getRoot(), "backup.db").getAbsolutePath();
    }

    private List<ILoggingEvent> errors() {
        return appender.list.stream().filter(e -> e.getLevel() == Level.ERROR).collect(Collectors.toList());
    }

    private static String pragma(Connection c, String name) throws Exception {
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery("PRAGMA " + name)) {
            assertTrue(rs.next());
            return rs.getString(1);
        }
    }

    /** The journal mode a plain new connection reads from the file at {@code path}. */
    private static String journalMode(String path) throws Exception {
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + path)) {
            return pragma(c, "journal_mode");
        }
    }

    /** A connection that holds an exclusive lock on the file at {@code path} until it commits. */
    private static Connection exclusiveLock(String path) throws Exception {
        Connection c = DriverManager.getConnection("jdbc:sqlite:" + path);
        try (Statement s = c.createStatement()) {
            s.execute("BEGIN EXCLUSIVE");
        }
        return c;
    }

    private static void commit(Connection c) throws Exception {
        try (Statement s = c.createStatement()) {
            s.execute("COMMIT");
        }
        c.close();
    }

    /** Makes the file at {@code path} as the server's lobby backup does, in its default journal mode. */
    private static void makeRollbackJournalFile(String path) throws Exception {
        try (Connection c = SecretHitlerServer.getDatabaseConnection(path)) {
            assertNotNull(c);
            assertEquals("delete", pragma(c, "journal_mode"));
        }
    }

    @Test
    public void aNewFileIsLeftInWalMode() throws Exception {
        assertTrue(SecretHitlerServer.useWriteAheadLog(dbPath(), 5000));
        assertEquals("wal", journalMode(dbPath()));
        assertEquals(1, appender.list.stream()
                .filter(e -> e.getFormattedMessage().equals("Database " + dbPath() + " is in WAL mode."))
                .count());
        assertEquals(List.of(), errors());
    }

    @Test
    public void anOlderFileTurnsToWalAndStillLoads() throws Exception {
        try (InputStream fixture = getClass().getResourceAsStream("/backup-before-spectators.db")) {
            Files.copy(fixture, new File(dbPath()).toPath());
        }
        assertTrue(SecretHitlerServer.useWriteAheadLog(dbPath(), 5000));
        assertEquals("wal", journalMode(dbPath()));
        ConcurrentHashMap<String, Lobby> loaded;
        try (Connection c = SecretHitlerServer.getDatabaseConnection(dbPath())) {
            loaded = SecretHitlerServer.loadLobbies(c);
        }
        assertEquals(Set.of("WXYZ"), loaded.keySet());
    }

    @Test
    public void theServersConnectionsSeeWal() throws Exception {
        assertTrue(SecretHitlerServer.useWriteAheadLog(dbPath(), 5000));
        try (Connection c = SecretHitlerServer.getDatabaseConnection(dbPath())) {
            assertEquals("wal", pragma(c, "journal_mode"));
            assertEquals("5000", pragma(c, "busy_timeout"));
        }
        AccountStore store = AccountStore.open(dbPath());
        try {
            assertEquals("test-wal", store.upsertTestAccount("wal").id());
        } finally {
            store.close();
        }
    }

    @Test
    public void aReadHeldOpenNeverBlocksTheBackup() throws Exception {
        assertTrue(SecretHitlerServer.useWriteAheadLog(dbPath(), 5000));
        try (Connection reader = SecretHitlerServer.getDatabaseConnection(dbPath())) {
            reader.setAutoCommit(false);
            try (Statement s = reader.createStatement();
                    ResultSet rs = s.executeQuery("SELECT count(*) FROM backup")) {
                assertTrue(rs.next());
                // With a rollback journal, this read's lock keeps the write below from committing
                // until the 5 s busy timeout runs out, and the write fails.
                long start = System.nanoTime();
                try (Connection writer = SecretHitlerServer.getDatabaseConnection(dbPath())) {
                    SecretHitlerServer.storeLobbies(writer, new ConcurrentHashMap<>());
                }
                long elapsedMs = (System.nanoTime() - start) / 1_000_000;
                assertTrue("the backup took " + elapsedMs + " ms", elapsedMs < 1000);
            }
            reader.rollback();
        }
    }

    @Test
    public void aBriefLockIsWaitedFor() throws Exception {
        makeRollbackJournalFile(dbPath());
        Connection lock = exclusiveLock(dbPath());
        Thread release = new Thread(() -> {
            try {
                Thread.sleep(500);
                commit(lock);
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });
        long start = System.nanoTime();
        release.start();
        try {
            assertTrue(SecretHitlerServer.useWriteAheadLog(dbPath(), 5000));
            long elapsedMs = (System.nanoTime() - start) / 1_000_000;
            assertTrue("gave up waiting after " + elapsedMs + " ms", elapsedMs >= 400);
        } finally {
            release.join();
        }
        assertEquals("wal", journalMode(dbPath()));
        assertEquals(List.of(), errors());
    }

    @Test
    public void aLockPastTheLimitGivesUp() throws Exception {
        makeRollbackJournalFile(dbPath());
        Connection lock = exclusiveLock(dbPath());
        boolean wal;
        long elapsedMs;
        try {
            long start = System.nanoTime();
            wal = SecretHitlerServer.useWriteAheadLog(dbPath(), 300);
            elapsedMs = (System.nanoTime() - start) / 1_000_000;
        } finally {
            commit(lock);
        }
        assertFalse(wal);
        assertTrue("gave up after " + elapsedMs + " ms", elapsedMs >= 300 && elapsedMs < 2000);
        List<ILoggingEvent> errors = errors();
        assertEquals(1, errors.size());
        assertEquals("Could not put database " + dbPath() + " in WAL mode; it keeps its journal mode.",
                errors.get(0).getFormattedMessage());
        try (Connection c = SecretHitlerServer.getDatabaseConnection(dbPath())) {
            assertNotNull(c);
            assertEquals("delete", pragma(c, "journal_mode"));
        }
    }

    @Test
    public void noPathChangesNothing() throws Exception {
        assertFalse(SecretHitlerServer.useWriteAheadLog(null, 5000));
        assertFalse(SecretHitlerServer.useWriteAheadLog(" ", 5000));
        assertEquals(0, tmp.getRoot().list().length);
        assertEquals(List.of(), errors());
        assertEquals(0, appender.list.stream().filter(e -> e.getFormattedMessage().contains("WAL")).count());
    }

    @Test
    public void aMissingDirectoryGivesUpAtOnce() throws Exception {
        String path = new File(tmp.getRoot(), "missing/dir/backup.db").getAbsolutePath();
        long start = System.nanoTime();
        assertFalse(SecretHitlerServer.useWriteAheadLog(path, 5000));
        long elapsedMs = (System.nanoTime() - start) / 1_000_000;
        assertTrue("gave up after " + elapsedMs + " ms", elapsedMs < 1000);
        assertEquals(1, errors().size());
        assertFalse(new File(tmp.getRoot(), "missing").exists());
    }
}
