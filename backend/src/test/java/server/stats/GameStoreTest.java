package server.stats;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

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
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.CountDownLatch;
import org.junit.After;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import server.accounts.AccountStore;

/**
 * The game tables: player numbers in the order players are first recorded, one write per game ID,
 * a save that fails writing nothing, and the tables in the file beside the accounts. The tests that
 * read the tables themselves use a file, which a second connection reads; the rest use memory.
 */
public class GameStoreTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private final List<AutoCloseable> open = new ArrayList<>();

    @After
    public void closeEverything() throws Exception {
        for (AutoCloseable closeable : open) {
            closeable.close();
        }
    }

    private GameStore memory() {
        GameStore store = GameStore.open(null);
        open.add(store);
        return store;
    }

    private String path() {
        return new File(tmp.getRoot(), "backup.db").getAbsolutePath();
    }

    private GameStore file() {
        GameStore store = GameStore.open(path());
        open.add(store);
        return store;
    }

    /** Every row of the query on the file, each row's columns joined by "|". */
    private List<String> rows(String query) throws Exception {
        List<String> rows = new ArrayList<>();
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + path());
                Statement s = c.createStatement();
                ResultSet rs = s.executeQuery(query)) {
            int columns = rs.getMetaData().getColumnCount();
            while (rs.next()) {
                List<String> values = new ArrayList<>();
                for (int i = 1; i <= columns; i++) {
                    values.add(String.valueOf(rs.getObject(i)));
                }
                rows.add(String.join("|", values));
            }
        }
        return rows;
    }

    private static GameRecord.Seat human(String account, String name) {
        return TestRecords.human(account, name, "LIBERAL");
    }

    private static List<Integer> seatPlayers(String json) throws Exception {
        List<Integer> players = new ArrayList<>();
        for (JsonNode seat : JSON.readTree(json).get("seats")) {
            players.add(seat.get("player").isNull() ? null : seat.get("player").asInt());
        }
        return players;
    }

    @Test
    public void playersAreNumberedInTheOrderTheyAreFirstRecorded() throws Exception {
        GameStore store = memory();
        assertTrue(store.save(TestRecords.record("g1", 2_000_000L, GameRecord.LIBERAL_POLICIES,
                List.of(human("acct-Ann", "Ann"), human("acct-Bob", "Bob")))));
        assertTrue(store.save(TestRecords.record("g2", 3_000_000L, GameRecord.FASCIST_POLICIES,
                List.of(human("acct-Cy", "Cy"), human("acct-Ann", "Ann")))));

        assertEquals(List.of(new GameStore.PlayerRow(1, "acct-Ann"), new GameStore.PlayerRow(2, "acct-Bob"),
                new GameStore.PlayerRow(3, "acct-Cy")), store.players());
        List<String> records = store.recordsJson();
        assertEquals(List.of(1, 2), seatPlayers(records.get(0)));
        assertEquals(List.of(3, 1), seatPlayers(records.get(1)));
    }

    /** A player seen again takes no number: the numbers run 1, 2, 3… with no gaps. */
    @Test
    public void numbersHaveNoGaps() throws Exception {
        GameStore store = memory();
        store.save(TestRecords.record("g1", 2_000_000L, GameRecord.LIBERAL_POLICIES,
                List.of(human("acct-Ann", "Ann"), human("acct-Bob", "Bob"))));
        store.save(TestRecords.record("g2", 3_000_000L, GameRecord.LIBERAL_POLICIES,
                List.of(human("acct-Ann", "Ann"), human("acct-Bob", "Bob"), human("acct-Cy", "Cy"))));
        store.save(TestRecords.record("g2", 4_000_000L, GameRecord.LIBERAL_POLICIES,
                List.of(human("acct-Dot", "Dot")))); // a second write of g2: nothing, not even a number
        store.save(TestRecords.record("g3", 5_000_000L, GameRecord.LIBERAL_POLICIES,
                List.of(human("acct-Cy", "Cy"), human("acct-Eve", "Eve"))));

        assertEquals(List.of(new GameStore.PlayerRow(1, "acct-Ann"), new GameStore.PlayerRow(2, "acct-Bob"),
                new GameStore.PlayerRow(3, "acct-Cy"), new GameStore.PlayerRow(4, "acct-Eve")), store.players());
    }

    @Test
    public void aSecondWriteOfAnIdChangesNothing() throws Exception {
        GameStore store = file();
        GameRecord first = TestRecords.record("g1", 2_000_000L, GameRecord.LIBERAL_POLICIES,
                TestRecords.seats("acct-Ann", "acct-Bob"));
        assertTrue(store.save(first));
        List<String> games = rows("SELECT * FROM games");
        List<String> seats = rows("SELECT * FROM game_seats ORDER BY seat");
        List<String> players = rows("SELECT * FROM players ORDER BY number");

        GameRecord again = TestRecords.record("g1", 9_000_000L, GameRecord.HITLER_ELECTED,
                TestRecords.seats("acct-Cy", "acct-Ann", "acct-Dot"));
        assertFalse(store.save(again));

        assertEquals(1, games.size());
        assertEquals(games, rows("SELECT * FROM games"));
        assertEquals(List.of(first.toJson(Map.of("acct-Ann", 1, "acct-Bob", 2))), store.recordsJson());
        assertEquals(seats, rows("SELECT * FROM game_seats ORDER BY seat"));
        assertEquals(players, rows("SELECT * FROM players ORDER BY number"));
    }

    @Test
    public void seatsAreStoredForEachGame() throws Exception {
        GameStore store = file();
        store.save(TestRecords.record("g1", 2_000_000L, GameRecord.HITLER_EXECUTED,
                TestRecords.seats("acct-Ann", "acct-Bob")));
        store.save(TestRecords.record("g2", 3_000_000L, GameRecord.HITLER_EXECUTED,
                TestRecords.seats("acct-Bob")));

        assertEquals(List.of(
                "g1|0|1|P0|LIBERAL", "g1|1|2|P1|FASCIST", "g1|2|null|P2|LIBERAL", "g1|3|null|P3|HITLER",
                "g1|4|null|P4|LIBERAL",
                "g2|0|2|P0|LIBERAL", "g2|1|null|P1|FASCIST", "g2|2|null|P2|LIBERAL", "g2|3|null|P3|HITLER",
                "g2|4|null|P4|LIBERAL"),
                rows("SELECT game_id, seat, player_number, name, role FROM game_seats ORDER BY game_id, seat"));
        assertEquals(List.of("g1|1|2000000|HITLER_EXECUTED|1", "g2|1|3000000|HITLER_EXECUTED|1"),
                rows("SELECT id, format, ended_at, outcome, has_cpu FROM games ORDER BY id"));
    }

    @Test
    public void recordsComeOldestFirst() throws Exception {
        GameStore store = memory();
        store.save(TestRecords.record("c", 3_000_000L, GameRecord.LIBERAL_POLICIES, TestRecords.seats()));
        store.save(TestRecords.record("b", 2_000_000L, GameRecord.LIBERAL_POLICIES, TestRecords.seats()));
        store.save(TestRecords.record("a", 3_000_000L, GameRecord.LIBERAL_POLICIES, TestRecords.seats()));

        List<String> ids = new ArrayList<>();
        for (String json : store.recordsJson()) {
            ids.add(JSON.readTree(json).get("id").asText());
        }
        assertEquals(List.of("b", "a", "c"), ids);
    }

    @Test
    public void recordedIdsFindsOnlySavedGames() {
        GameStore store = memory();
        store.save(TestRecords.record("g1", 2_000_000L, GameRecord.LIBERAL_POLICIES, TestRecords.seats()));
        store.save(TestRecords.record("g2", 3_000_000L, GameRecord.LIBERAL_POLICIES, TestRecords.seats()));

        assertEquals(Set.of("g2"), store.recordedIds(List.of("g2", "g3")));
        assertEquals(new TreeSet<>(List.of("g1", "g2")), new TreeSet<>(store.recordedIds(List.of("g1", "g2", "g9"))));
        assertEquals(Set.of(), store.recordedIds(List.of()));
    }

    @Test
    public void aFailedSaveWritesNothing() throws Exception {
        GameStore store = file();
        store.save(TestRecords.record("g1", 2_000_000L, GameRecord.LIBERAL_POLICIES, TestRecords.seats("acct-Ann")));
        List<GameRecord.Seat> seats = new ArrayList<>(TestRecords.seats("acct-Ann", "acct-Bob"));
        seats.set(4, new GameRecord.Seat(null, null, true, "LIBERAL", true));
        try {
            store.save(TestRecords.record("g2", 3_000_000L, GameRecord.LIBERAL_POLICIES, seats));
            fail("a seat with no name cannot be saved");
        } catch (IllegalStateException expected) {
        }

        assertEquals(List.of("g1"), rows("SELECT id FROM games"));
        assertEquals(List.of("g1"), rows("SELECT DISTINCT game_id FROM game_seats"));
        assertEquals(List.of("1|acct-Ann"), rows("SELECT number, account_id FROM players"));
        assertEquals(1, store.recordsJson().size());
        assertTrue("the store still saves", store.save(TestRecords.record("g3", 4_000_000L,
                GameRecord.LIBERAL_POLICIES, TestRecords.seats("acct-Bob"))));
        assertEquals(List.of("1|acct-Ann", "2|acct-Bob"), rows("SELECT number, account_id FROM players"));
    }

    @Test
    public void theTablesLiveBesideTheAccounts() throws Exception {
        AccountStore accounts = AccountStore.open(path());
        open.add(accounts);
        GameStore games = file();
        accounts.upsertTestAccount("Ann");
        assertTrue(games.save(TestRecords.record("g1", 2_000_000L, GameRecord.LIBERAL_POLICIES,
                TestRecords.seats("test-Ann"))));

        assertEquals(List.of("accounts", "game_seats", "games", "players", "sessions"),
                rows("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"));
        assertEquals("test-Ann", accounts.find("test-Ann").id());
    }

    /**
     * The store waits for a write another connection holds (the account store's, or the lobby
     * backup's), as they wait for its, instead of failing at once with SQLITE_BUSY.
     */
    @Test
    public void aSaveWaitsForAnotherConnectionsWrite() throws Exception {
        GameStore store = file();
        CountDownLatch locked = new CountDownLatch(1);
        Thread holder = new Thread(() -> {
            try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + path());
                    Statement s = c.createStatement()) {
                s.execute("BEGIN IMMEDIATE");
                locked.countDown();
                Thread.sleep(1_000);
                s.execute("COMMIT");
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });
        holder.start();
        locked.await();
        long start = System.currentTimeMillis();
        assertTrue(store.save(TestRecords.record("g1", 2_000_000L, GameRecord.LIBERAL_POLICIES,
                TestRecords.seats("acct-Ann"))));
        assertTrue("the save waited for the lock", System.currentTimeMillis() - start >= 500);
        holder.join(5_000);
        assertEquals(List.of("g1"), rows("SELECT id FROM games"));
    }

    /**
     * A save that gives up on another connection's write (after the 5 s busy timeout) writes
     * nothing and leaves the store as it was: the next saves are whole transactions again, and
     * succeed.
     */
    @Test
    public void aSaveAfterALockThatOutlastedTheTimeoutIsOneTransaction() throws Exception {
        GameStore store = file();
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch gaveUp = new CountDownLatch(1);
        Thread holder = new Thread(() -> {
            try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + path());
                    Statement s = c.createStatement()) {
                s.execute("BEGIN IMMEDIATE");
                locked.countDown();
                gaveUp.await();
                s.execute("ROLLBACK");
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });
        holder.start();
        locked.await();
        try {
            store.save(TestRecords.record("g1", 2_000_000L, GameRecord.LIBERAL_POLICIES, TestRecords.seats("acct-Ann")));
            fail("the write lock was held past the busy timeout");
        } catch (IllegalStateException expected) {
        } finally {
            gaveUp.countDown();
            holder.join(5_000);
        }

        assertTrue(store.save(TestRecords.record("g2", 3_000_000L, GameRecord.LIBERAL_POLICIES,
                TestRecords.seats("acct-Ann"))));
        assertTrue(store.save(TestRecords.record("g3", 4_000_000L, GameRecord.LIBERAL_POLICIES,
                TestRecords.seats("acct-Bob"))));
        assertEquals(List.of("g2", "g3"), rows("SELECT id FROM games ORDER BY id"));
        assertEquals(List.of("g2|5", "g3|5"), rows("SELECT game_id, COUNT(*) FROM game_seats GROUP BY game_id"));
        assertEquals(List.of("1|acct-Ann", "2|acct-Bob"), rows("SELECT number, account_id FROM players"));
    }

    /** After every kind of save, another connection can write at once: the store holds no lock between calls. */
    @Test
    public void aSaveLeavesNoLockBehind() throws Exception {
        GameStore store = file();
        GameRecord record = TestRecords.record("g1", 2_000_000L, GameRecord.LIBERAL_POLICIES,
                TestRecords.seats("acct-Ann"));
        List<GameRecord.Seat> unnamed = new ArrayList<>(TestRecords.seats("acct-Bob"));
        unnamed.set(4, new GameRecord.Seat(null, null, true, "LIBERAL", true));
        List<Runnable> saves = List.of(
                () -> assertTrue(store.save(record)),
                () -> assertFalse(store.save(record)),
                () -> {
                    try {
                        store.save(TestRecords.record("g2", 3_000_000L, GameRecord.LIBERAL_POLICIES, unnamed));
                        fail("a seat with no name cannot be saved");
                    } catch (IllegalStateException expected) {
                    }
                });
        for (Runnable save : saves) {
            save.run();
            try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + path());
                    Statement s = c.createStatement()) {
                s.execute("PRAGMA busy_timeout = 0");
                s.execute("BEGIN IMMEDIATE");
                s.execute("INSERT INTO players (account_id, created_at) VALUES ('acct-' || random(), 0)");
                s.execute("ROLLBACK");
            }
        }
    }

    @Test
    public void aMissingFolderIsRefused() {
        try {
            GameStore.open(new File(tmp.getRoot(), "missing/dir/backup.db").getAbsolutePath());
            fail("no folder, no database");
        } catch (IllegalStateException expected) {
            // as the account store does: the server cannot start without its database
        }
    }
}
