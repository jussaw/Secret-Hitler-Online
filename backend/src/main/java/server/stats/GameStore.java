package server.stats;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The game records (#31), in the SQLite file lobbies are backed up to, beside the accounts, or in
 * an in-memory database of the store's own when there is no file (gone at restart). Three tables:
 * {@code players} gives each account a number the first time one of its games is saved;
 * {@code games} holds each record's JSON, which carries those numbers and never an account ID; and
 * {@code game_seats} each game's seats. A game ID is written once: a second save of it changes
 * nothing. A record keeps the format it was saved in ({@code games.format}): {@code recordsJson}
 * gives each as stored, so a format 1 record stays format 1 beside the format 2 ones saved since.
 *
 * <p>One connection serves the store for its life, waiting up to 5 s for another connection's
 * write, and every public method is synchronized. Every SQL failure is an
 * {@code IllegalStateException}. Not final, so tests can make a store that fails or waits.
 */
public class GameStore implements AutoCloseable {
    private final Connection connection;

    /**
     * Opens the store.
     *
     * @param databasePath the SQLite file, made if it is missing; null or blank for memory.
     * @throws IllegalStateException if the database cannot be opened or its tables made.
     */
    protected GameStore(String databasePath) {
        String url = databasePath == null || databasePath.isBlank()
                ? "jdbc:sqlite::memory:"
                : "jdbc:sqlite:" + databasePath;
        try {
            Connection c = DriverManager.getConnection(url);
            try {
                createTables(c);
            } catch (SQLException | RuntimeException e) {
                try {
                    c.close();
                } catch (SQLException closeFailure) {
                    e.addSuppressed(closeFailure);
                }
                throw e;
            }
            connection = c;
        } catch (SQLException e) {
            throw new IllegalStateException("Could not open the game database.", e);
        }
    }

    /** Opens the store: in the file at {@code databasePath}, or in memory when it is null or blank. */
    public static GameStore open(String databasePath) {
        return new GameStore(databasePath);
    }

    private static void createTables(Connection c) throws SQLException {
        try (Statement s = c.createStatement()) {
            s.execute("PRAGMA busy_timeout = 5000");
            s.execute("CREATE TABLE IF NOT EXISTS players ("
                    + "number INTEGER PRIMARY KEY AUTOINCREMENT, "
                    + "account_id TEXT NOT NULL UNIQUE, "
                    + "created_at INTEGER NOT NULL)");
            s.execute("CREATE TABLE IF NOT EXISTS games ("
                    + "id TEXT PRIMARY KEY, "
                    + "format INTEGER NOT NULL, "
                    + "started_at INTEGER NOT NULL, "
                    + "ended_at INTEGER NOT NULL, "
                    + "outcome TEXT NOT NULL, "
                    + "has_cpu INTEGER NOT NULL, "
                    + "record TEXT NOT NULL)");
            s.execute("CREATE INDEX IF NOT EXISTS games_ended_at ON games (ended_at)");
            s.execute("CREATE TABLE IF NOT EXISTS game_seats ("
                    + "game_id TEXT NOT NULL, "
                    + "seat INTEGER NOT NULL, "
                    + "player_number INTEGER, "
                    + "name TEXT NOT NULL, "
                    + "role TEXT NOT NULL, "
                    + "PRIMARY KEY (game_id, seat))");
            s.execute("CREATE INDEX IF NOT EXISTS game_seats_player ON game_seats (player_number)");
        }
    }

    /**
     * Saves the record, in one transaction: a number for each of its accounts that has none yet,
     * in seat order, then the game with its JSON ({@code GameRecord.toJson}) and its seats.
     *
     * @return true if the game was written; false, changing nothing, if its ID was already there.
     * @throws IllegalStateException if the save fails, writing nothing.
     */
    public synchronized boolean save(GameRecord record) {
        // The connection stays in autocommit mode, and the save runs its own BEGIN IMMEDIATE,
        // COMMIT and ROLLBACK: the driver's own transactions begin again after each commit, and a
        // begin that timed out would leave its next save outside any transaction. IMMEDIATE takes
        // the write lock at the start, so the save waits for another connection's write
        // (busy_timeout) instead of failing when it first writes.
        try {
            execute("BEGIN IMMEDIATE");
        } catch (SQLException e) {
            throw new IllegalStateException("Could not save the record of game " + record.id() + ".", e);
        }
        boolean open = true;
        try {
            boolean written = write(record);
            execute(written ? "COMMIT" : "ROLLBACK");
            open = false;
            return written;
        } catch (SQLException | RuntimeException e) {
            IllegalStateException failure =
                    new IllegalStateException("Could not save the record of game " + record.id() + ".", e);
            try {
                execute("ROLLBACK");
                open = false;
            } catch (SQLException rollbackFailure) {
                failure.addSuppressed(rollbackFailure);
            }
            throw failure;
        } finally {
            if (open) {
                try {
                    execute("ROLLBACK"); // an Error on the way out: never leave the write lock held
                } catch (SQLException ignored) {
                    // the transaction is gone with the connection's state; nothing more to undo
                }
            }
        }
    }

    private void execute(String sql) throws SQLException {
        try (Statement s = connection.createStatement()) {
            s.execute(sql);
        }
    }

    /** The writes of {@code save}, inside its transaction; false if the game ID is there already. */
    private boolean write(GameRecord record) throws SQLException {
        Map<String, Integer> numbers = new LinkedHashMap<>();
        long now = System.currentTimeMillis();
        // A number is looked up before one is made: an ignored INSERT OR IGNORE would still use up
        // an AUTOINCREMENT number, leaving gaps. The transaction holds the write lock from its
        // start (BEGIN IMMEDIATE), so no other connection makes a number in between.
        try (PreparedStatement select = connection.prepareStatement(
                "SELECT number FROM players WHERE account_id = ?");
                PreparedStatement insert = connection.prepareStatement(
                        "INSERT INTO players (account_id, created_at) VALUES (?, ?)")) {
            for (String accountId : record.accountIds()) {
                select.setString(1, accountId);
                try (ResultSet rs = select.executeQuery()) {
                    if (rs.next()) {
                        numbers.put(accountId, rs.getInt(1));
                        continue;
                    }
                }
                insert.setString(1, accountId);
                insert.setLong(2, now);
                insert.executeUpdate();
                try (ResultSet rs = select.executeQuery()) {
                    if (!rs.next()) {
                        throw new SQLException("No player number for a seat of game " + record.id() + ".");
                    }
                    numbers.put(accountId, rs.getInt(1));
                }
            }
        }
        try (PreparedStatement game = connection.prepareStatement(
                "INSERT OR IGNORE INTO games (id, format, started_at, ended_at, outcome, has_cpu, record) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?)")) {
            game.setString(1, record.id());
            game.setInt(2, GameRecord.FORMAT);
            game.setLong(3, record.startedAt());
            game.setLong(4, record.endedAt());
            game.setString(5, record.outcome());
            game.setInt(6, record.hasCpu() ? 1 : 0);
            game.setString(7, record.toJson(numbers));
            if (game.executeUpdate() == 0) {
                return false;
            }
        }
        try (PreparedStatement seat = connection.prepareStatement(
                "INSERT INTO game_seats (game_id, seat, player_number, name, role) VALUES (?, ?, ?, ?, ?)")) {
            List<GameRecord.Seat> seats = record.seats();
            for (int i = 0; i < seats.size(); i++) {
                GameRecord.Seat s = seats.get(i);
                seat.setString(1, record.id());
                seat.setInt(2, i);
                if (s.accountId() == null) {
                    seat.setNull(3, java.sql.Types.INTEGER);
                } else {
                    seat.setInt(3, numbers.get(s.accountId()));
                }
                seat.setString(4, s.name());
                seat.setString(5, s.role());
                seat.executeUpdate();
            }
        }
        return true;
    }

    /** The IDs among {@code ids} that have a record, in one query. */
    public synchronized Set<String> recordedIds(Collection<String> ids) {
        if (ids.isEmpty()) {
            return Collections.emptySet();
        }
        String marks = String.join(", ", Collections.nCopies(ids.size(), "?"));
        try (PreparedStatement ps = connection.prepareStatement("SELECT id FROM games WHERE id IN (" + marks + ")")) {
            int i = 1;
            for (String id : ids) {
                ps.setString(i++, id);
            }
            Set<String> found = new HashSet<>();
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    found.add(rs.getString(1));
                }
            }
            return found;
        } catch (SQLException e) {
            throw new IllegalStateException("Could not read the recorded games.", e);
        }
    }

    /** A player's number and the account it belongs to. */
    public record PlayerRow(int number, String accountId) {
    }

    /** Every player, by number. */
    public synchronized List<PlayerRow> players() {
        try (Statement s = connection.createStatement();
                ResultSet rs = s.executeQuery("SELECT number, account_id FROM players ORDER BY number")) {
            List<PlayerRow> players = new ArrayList<>();
            while (rs.next()) {
                players.add(new PlayerRow(rs.getInt(1), rs.getString(2)));
            }
            return players;
        } catch (SQLException e) {
            throw new IllegalStateException("Could not read the players.", e);
        }
    }

    /** Every record's JSON, oldest first: by {@code endedAt}, then by ID. */
    public synchronized List<String> recordsJson() {
        try (Statement s = connection.createStatement();
                ResultSet rs = s.executeQuery("SELECT record FROM games ORDER BY ended_at, id")) {
            List<String> records = new ArrayList<>();
            while (rs.next()) {
                records.add(rs.getString(1));
            }
            return records;
        } catch (SQLException e) {
            throw new IllegalStateException("Could not read the records.", e);
        }
    }

    /** Closes the connection; an in-memory database is gone with it. */
    @Override
    public synchronized void close() {
        try {
            connection.close();
        } catch (SQLException e) {
            throw new IllegalStateException("Could not close the game database.", e);
        }
    }
}
