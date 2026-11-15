package server.accounts;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Base64;
import java.util.function.LongSupplier;
import org.sqlite.SQLiteErrorCode;
import org.sqlite.SQLiteException;

/**
 * Accounts and sessions, in the SQLite file lobbies are backed up to (or in memory when there
 * is no file). One connection serves the store for its life, which an in-memory database needs,
 * and every public method is synchronized. A session token is never stored: the database keeps
 * only its SHA-256, so a copy of the file signs no one in.
 */
public final class AccountStore implements AutoCloseable {
    public static final long SESSION_MS = 30L * 24 * 60 * 60 * 1000;
    public static final long RENEW_BELOW_MS = 29L * 24 * 60 * 60 * 1000;

    private static final int TOKEN_BYTES = 32;
    private static final SecureRandom RANDOM = new SecureRandom();

    public enum NameResult { SAVED, TAKEN }

    /**
     * A session's account; whether the lookup extended the session; when the session ends now
     * ({@code expiresAt}, ms since the epoch, after any extension); and how long that is from the
     * time of the lookup ({@code remainingMs}, by the store's clock), which the cookie's max age
     * follows.
     */
    public record SessionLookup(Account account, boolean renewed, long expiresAt, long remainingMs) {
    }

    private final Connection connection;
    private final LongSupplier clock;

    private AccountStore(Connection connection, LongSupplier clock) {
        this.connection = connection;
        this.clock = clock;
    }

    public static AccountStore open(String databasePath) {
        return open(databasePath, System::currentTimeMillis);
    }

    public static AccountStore open(String databasePath, LongSupplier clock) {
        String url = databasePath == null || databasePath.isBlank()
                ? "jdbc:sqlite::memory:"
                : "jdbc:sqlite:" + databasePath;
        try {
            Connection connection = DriverManager.getConnection(url);
            try {
                createTables(connection);
            } catch (SQLException | RuntimeException e) {
                try {
                    connection.close();
                } catch (SQLException closeFailure) {
                    e.addSuppressed(closeFailure);
                }
                throw e;
            }
            return new AccountStore(connection, clock);
        } catch (SQLException e) {
            throw new IllegalStateException("Could not open the account database.", e);
        }
    }

    private static void createTables(Connection connection) throws SQLException {
        try (Statement s = connection.createStatement()) {
            s.execute("PRAGMA busy_timeout = 5000");
            s.execute("CREATE TABLE IF NOT EXISTS accounts ("
                    + "id TEXT PRIMARY KEY, "
                    + "discord_username TEXT, "
                    + "discord_avatar TEXT, "
                    + "username TEXT, "
                    + "username_key TEXT, "
                    + "created_at INTEGER NOT NULL, "
                    + "updated_at INTEGER NOT NULL)");
            s.execute("CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_key "
                    + "ON accounts (username_key)");
            s.execute("CREATE TABLE IF NOT EXISTS sessions ("
                    + "token_hash TEXT PRIMARY KEY, "
                    + "account_id TEXT NOT NULL, "
                    + "expires_at INTEGER NOT NULL, "
                    + "created_at INTEGER NOT NULL)");
        }
    }

    /** Closes the connection; an in-memory database is gone with it. */
    @Override
    public synchronized void close() {
        try {
            connection.close();
        } catch (SQLException e) {
            throw new IllegalStateException("Could not close the account database.", e);
        }
    }

    public synchronized Account upsertDiscordAccount(String discordId, String discordUsername,
            String avatar) {
        long now = clock.getAsLong();
        try (PreparedStatement ps = connection.prepareStatement(
                "INSERT INTO accounts (id, discord_username, discord_avatar, created_at, updated_at) "
                        + "VALUES (?, ?, ?, ?, ?) "
                        + "ON CONFLICT(id) DO UPDATE SET discord_username = excluded.discord_username, "
                        + "discord_avatar = excluded.discord_avatar, updated_at = excluded.updated_at")) {
            ps.setString(1, discordId);
            ps.setString(2, discordUsername);
            ps.setString(3, avatar);
            ps.setLong(4, now);
            ps.setLong(5, now);
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new IllegalStateException("Could not save the account.", e);
        }
        return find(discordId);
    }

    public synchronized Account upsertTestAccount(String id) {
        String accountId = "test-" + id;
        return upsertDiscordAccount(accountId, accountId, null);
    }

    public synchronized Account find(String accountId) {
        try (PreparedStatement ps = connection.prepareStatement(
                "SELECT id, discord_username, discord_avatar, username FROM accounts WHERE id = ?")) {
            ps.setString(1, accountId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? readAccount(rs) : null;
            }
        } catch (SQLException e) {
            throw new IllegalStateException("Could not read the account.", e);
        }
    }

    /**
     * Saves the name for the account. The caller has run {@link Usernames#normalize} and checked
     * {@link Usernames#problem}. The unique index on {@code username_key} decides a clash, so two
     * saves at once cannot both win.
     */
    public synchronized NameResult setUsername(String accountId, String normalizedName) {
        try (PreparedStatement ps = connection.prepareStatement(
                "UPDATE accounts SET username = ?, username_key = ?, updated_at = ? WHERE id = ?")) {
            ps.setString(1, normalizedName);
            ps.setString(2, Usernames.key(normalizedName));
            ps.setLong(3, clock.getAsLong());
            ps.setString(4, accountId);
            if (ps.executeUpdate() == 0) {
                throw new IllegalStateException("No account " + accountId + " to name.");
            }
            return NameResult.SAVED;
        } catch (SQLException e) {
            if (e instanceof SQLiteException
                    && ((SQLiteException) e).getResultCode() == SQLiteErrorCode.SQLITE_CONSTRAINT_UNIQUE) {
                return NameResult.TAKEN;
            }
            throw new IllegalStateException("Could not save the name.", e);
        }
    }

    /** Starts a session and returns its raw token, which only the cookie keeps. */
    public synchronized String createSession(String accountId) {
        byte[] bytes = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        long now = clock.getAsLong();
        try (PreparedStatement ps = connection.prepareStatement(
                "INSERT INTO sessions (token_hash, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)")) {
            ps.setString(1, hash(token));
            ps.setString(2, accountId);
            ps.setLong(3, now + SESSION_MS);
            ps.setLong(4, now);
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new IllegalStateException("Could not start the session.", e);
        }
        return token;
    }

    /**
     * The account a live session belongs to, or null for a missing, unknown or expired token. A
     * session with under {@link #RENEW_BELOW_MS} left is extended to {@link #SESSION_MS} from now
     * (so a session is written at most once a day); any other lookup writes nothing. Either way the
     * answer says when the session ends.
     */
    public synchronized SessionLookup lookup(String token) {
        if (token == null || token.isBlank()) {
            return null;
        }
        String hash = hash(token);
        long now = clock.getAsLong();
        try {
            String accountId;
            long expiresAt;
            try (PreparedStatement ps = connection.prepareStatement(
                    "SELECT account_id, expires_at FROM sessions WHERE token_hash = ?")) {
                ps.setString(1, hash);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) {
                        return null;
                    }
                    accountId = rs.getString(1);
                    expiresAt = rs.getLong(2);
                }
            }
            if (expiresAt <= now) {
                return null;
            }
            Account account = find(accountId);
            if (account == null) {
                return null;
            }
            boolean renewed = expiresAt - now < RENEW_BELOW_MS;
            if (renewed) {
                expiresAt = now + SESSION_MS;
                try (PreparedStatement ps = connection.prepareStatement(
                        "UPDATE sessions SET expires_at = ? WHERE token_hash = ?")) {
                    ps.setLong(1, expiresAt);
                    ps.setString(2, hash);
                    ps.executeUpdate();
                }
            }
            return new SessionLookup(account, renewed, expiresAt, expiresAt - now);
        } catch (SQLException e) {
            throw new IllegalStateException("Could not read the session.", e);
        }
    }

    public synchronized void deleteSession(String token) {
        if (token == null || token.isBlank()) {
            return;
        }
        try (PreparedStatement ps = connection.prepareStatement(
                "DELETE FROM sessions WHERE token_hash = ?")) {
            ps.setString(1, hash(token));
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new IllegalStateException("Could not end the session.", e);
        }
    }

    /** Deletes every expired session and returns how many there were. */
    public synchronized int sweepExpiredSessions() {
        try (PreparedStatement ps = connection.prepareStatement(
                "DELETE FROM sessions WHERE expires_at <= ?")) {
            ps.setLong(1, clock.getAsLong());
            return ps.executeUpdate();
        } catch (SQLException e) {
            throw new IllegalStateException("Could not sweep the sessions.", e);
        }
    }

    private static Account readAccount(ResultSet rs) throws SQLException {
        return new Account(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4));
    }

    private static String hash(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
