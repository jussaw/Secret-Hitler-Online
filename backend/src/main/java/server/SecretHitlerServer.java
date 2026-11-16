package server;

import game.datastructures.Identity;
import io.javalin.Javalin;
import io.javalin.http.Context;
import io.javalin.http.staticfiles.Location;
import io.javalin.websocket.WsCloseContext;
import io.javalin.websocket.WsConnectContext;
import io.javalin.websocket.WsContext;
import io.javalin.websocket.WsMessageContext;

import org.eclipse.jetty.websocket.api.StatusCode;
import org.json.JSONException;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.sqlite.SQLiteErrorCode;
import org.sqlite.SQLiteException;
import server.accounts.Account;
import server.accounts.AccountStore;
import server.accounts.AuthRoutes;
import server.accounts.DiscordSignIn;
import server.accounts.Usernames;
import server.stats.GameRecordSink;
import server.stats.GameRecorder;
import server.stats.GameStore;
import server.util.Lobby;

import java.io.*;
import java.sql.*;

import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;


public class SecretHitlerServer {

    ////// Static Fields
    // <editor-fold desc="Static Fields">
    // TODO: Replace this with an environment variable or environment flag
    public static final int DEFAULT_PORT_NUMBER = 4040;

    // Passed to server
    public static final String PARAM_LOBBY = "lobby";
    // A player's name, which the page still sends in the /game query and in every message. The server
    // never reads it: a player is the account of their session, with that account's name.
    public static final String PARAM_NAME = "name";
    public static final String PARAM_COMMAND = "command";
    public static final String PARAM_TARGET = "target";
    public static final String PARAM_VOTE = "vote";
    public static final String PARAM_VETO = "veto";
    public static final String PARAM_CHOICE = "choice"; // the index of the chosen policy.
    public static final String PARAM_ICON = "icon";
    public static final String PARAM_SPECTATOR = "spectator"; // "true" in the /game and /check-login query
    // Optional, in a player's /game query: a random key the page keeps for its lifetime. A connection
    // that brings the key its account's live connection was opened with takes that connection's place.
    public static final String PARAM_REJOIN_KEY = "rejoinKey";

    // The close code of a connection whose place another connection took (Lobby.addUser).
    public static final int CLOSE_REPLACED = 4001;

    // Why a player's socket is refused (closed with 1002), or /check-login answers 403.
    /** No account to play as: no live session, or an account with no name yet. */
    static final String SIGN_IN_TO_JOIN = "Sign in and choose a name to play.";
    /** The account has a live connection in the lobby already: /check-login's 403 too. */
    static final String ALREADY_IN_LOBBY = "You're already in this lobby in another tab or window.";
    /** Outside debug mode: a player's socket that another site's page opened ({@code sameOrigin}). */
    static final String ANOTHER_SITE = "Connections from another site are not allowed.";

    // Passed to client
    // The type of the packet tells the client how to parse the contents.
    public static final String PARAM_PACKET_TYPE = "type";
    public static final String PACKET_INVESTIGATION = "investigation";
    public static final String PACKET_GAME_STATE = "game";
    public static final String PACKET_LOBBY = "lobby";
    public static final String PACKET_OK = "ok"; // general response packet sent after any successful command.
    public static final String PACKET_PONG = "pong"; // response to pings.

    public static final String PARAM_INVESTIGATION = "investigation";
    public static final String PARAM_SPECTATOR_COUNT = "spectatorCount"; // in every lobby and game packet
    public static final String PARAM_YOU = "you"; // in every player's packet: their name, or their seat's in a game
    public static final String FASCIST = "FASCIST";
    public static final String LIBERAL = "LIBERAL";

    // These are the commands that can be passed via a websocket connection.
    public static final String COMMAND_PING = "ping";
    public static final String COMMAND_START_GAME = "start-game";
    public static final String COMMAND_GET_STATE = "get-state";
    public static final String COMMAND_SET_LOBBY_SIZE = "set-lobby-size";
    public static final String COMMAND_SELECT_ICON = "select-icon";
    public static final String COMMAND_NOMINATE_CHANCELLOR = "nominate-chancellor";
    public static final String COMMAND_REGISTER_VOTE = "register-vote";
    public static final String COMMAND_REGISTER_PRESIDENT_CHOICE = "register-president-choice";
    public static final String COMMAND_REGISTER_CHANCELLOR_CHOICE = "register-chancellor-choice";
    public static final String COMMAND_REGISTER_CHANCELLOR_VETO = "chancellor-veto";
    public static final String COMMAND_REGISTER_PRESIDENT_VETO = "president-veto";

    public static final String COMMAND_REGISTER_EXECUTION = "register-execution";
    public static final String COMMAND_REGISTER_SPECIAL_ELECTION = "register-special-election";
    public static final String COMMAND_GET_INVESTIGATION = "get-investigation";
    public static final String COMMAND_REGISTER_PEEK = "register-peek";

    public static final String COMMAND_END_TERM = "end-term";
    // The president pauses and resumes the END TERM countdown.
    public static final String COMMAND_PAUSE_TERM_TIMER = "pause-term-timer";
    public static final String COMMAND_RESUME_TERM_TIMER = "resume-term-timer";
    // In game packets while there is an END TERM countdown: {"remainingMs": ms left, "paused": boolean}.
    public static final String PARAM_TERM_TIMER = "termTimer";

    public static final String CODE_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTWXYZ"; // u,v characters can look ambiguous
    public static final int CODE_LENGTH = 4;

    private static final float UPDATE_FREQUENCY_SECONDS = 60;

    /** What {@link #renameAccount} did. */
    public enum RenameResult {
        SAVED, // the account has the name, in the store and in every lobby it is in
        TAKEN, // another account has the name, ignoring case: nothing changed
        SEATED // the account holds a seat in a running game: nothing changed
    }
    // </editor-fold>

    ////// Accounts
    // <editor-fold desc="Accounts">

    // Accounts and their sessions. main opens it from DATABASE_PATH (in memory when unset); tests
    // put their own here.
    public static AccountStore accounts;

    // Taken by every rename (renameAccount), every player's join (onWebsocketConnect) and every
    // game start (startGame), and by nothing else: always before any lobby's lock, and never by a
    // thread that holds a lobby's lock without it. So a game start never falls between a rename's
    // check for seats and its change to the lobbies, and a join never records a name a rename has
    // just replaced. A database call may run under it, but never under a lobby's lock.
    static final Object ACCOUNTS_LOCK = new Object();
    // </editor-fold>

    ////// Game records
    // <editor-fold desc="Game records">

    // The game records' store and the writer that saves into it (#31), which is every lobby's
    // Lobby.recordSink while it runs: main opens the store from DATABASE_PATH (in memory when
    // unset) and startRecording starts the writer; tests put their own here. Each database call
    // runs on the writer's thread, the start-up or timer thread, or an HTTP thread: never under a
    // lobby's lock.
    static volatile GameStore games;
    static volatile GameRecorder recorder;
    // </editor-fold>

    ///// Private Fields
    // <editor-fold desc="Private Fields">

    // Every open connection's lobby, from its add until its close handler runs. Package-private for
    // LobbyTimeoutServerTest, which checks that the close handlers empty it after a sweep.
    static final ConcurrentHashMap<WsContext, Lobby> userToLobby = new ConcurrentHashMap<>();
    // Package-private for the server tests, which register their own lobbies (LobbyTimeoutServerTest
    // puts a map of its own here, to run the sweep at a handler's lookup).
    static ConcurrentHashMap<String, Lobby> codeToLobby = new ConcurrentHashMap<>();

    private static final Logger logger = LoggerFactory.getLogger(SecretHitlerServer.class);

    // Whether a lobby changed since the last backup, which the 60 s timer then stores. Volatile, as
    // lobbies mark it from their own threads (markLobbiesChanged); package-private for the tests.
    static volatile boolean hasLobbyChanged;

    // </editor-fold>

    ////// Private Methods

    /**
     * Prints the current list of lobbies and their players.
     */
    private static void printLobbyStatus() {
        synchronized (codeToLobby) {
            logger.info("Lobbies (" + codeToLobby.mappingCount() + ") : " + codeToLobby.keySet());
            for (Map.Entry<String, Lobby> entry : codeToLobby.entrySet()) {
                logger.debug("Lobby " + entry.getKey() + ": " + entry.getValue().getUserNames());
            }
        }
    }

    private static int getHerokuAssignedPort() {
        String herokuPort = System.getenv("PORT");
        if (herokuPort != null) {
            return Integer.parseInt(herokuPort);
        }
        return DEFAULT_PORT_NUMBER;
    }

    /**
     * Builds the server's app, not yet started: the static frontend, CORS in debug mode, and
     * every route. The routes are registered here, before {@code start}, so the server answers
     * on all of them as soon as it listens (#13). Package-private for ServerStartupTest.
     */
    static Javalin createApp() {
        return Javalin.create(config -> {
            // Serve the built frontend when it was bundled into the jar (see build.gradle).
            // Javalin refuses to start if a classpath static directory is missing.
            if (SecretHitlerServer.class.getResource("/public/index.html") != null) {
                config.staticFiles.add("/public", Location.CLASSPATH);
            }
            // The frontend is served from this same origin, so CORS is only needed when a
            // separately hosted dev frontend calls the server directly (debug mode). Outside
            // debug mode the CORS plugin would reject same-origin module scripts, which
            // browsers fetch with an Origin header.
            if (ApplicationConfig.DEBUG) {
                config.plugins.enableCors(cors -> {
                    cors.add(it -> {
                        it.anyHost();
                    });
                });
            }
        })
                .get("/check-login", SecretHitlerServer::checkLogin) // Checks if a login is valid.
                .get("/new-lobby", SecretHitlerServer::createNewLobby) // Creates and returns the code for a new lobby
                .get("/ping", SecretHitlerServer::ping)
                .get("/me", AuthRoutes::getMe)
                .post("/me/username", AuthRoutes::postUsername)
                .post("/auth/sign-out", AuthRoutes::postSignOut)
                .post("/auth/test-sign-in", AuthRoutes::postTestSignIn) // 404 unless TEST_SIGN_IN
                .get("/auth/discord", DiscordSignIn::start)
                .get("/auth/discord/callback", DiscordSignIn::callback)
                .ws("/game", wsHandler -> {
                    wsHandler.onConnect(SecretHitlerServer::onWebsocketConnect);
                    wsHandler.onMessage(SecretHitlerServer::onWebSocketMessage);
                    wsHandler.onClose(SecretHitlerServer::onWebSocketClose);
                });
    }

    /**
     * The line the server logs once it listens, which devops/restore-db.sh waits for. It is the
     * server's own, not Javalin's, so a dependency update never changes it.
     */
    static String startupLine(int port) {
        return "Secret Hitler Online is listening on port " + port + ".";
    }

    /** Starts the app on {@code port} (0 for any free one), then logs {@link #startupLine}. */
    static Javalin startServer(int port) {
        Javalin app = createApp().start(port);
        logger.info(startupLine(app.port()));
        return app;
    }

    public static void main(String[] args) {
        // On load, check the connected database to see if there's a stored state from
        // the server.
        if (ApplicationConfig.DATABASE_PATH == null || ApplicationConfig.DATABASE_PATH.isBlank()) {
            logger.error("Persistence disabled: no DATABASE_PATH environment variable provided.");
        }
        useWriteAheadLog(ApplicationConfig.DATABASE_PATH, WAL_TIMEOUT_MS);
        // The same file as the lobby backup, or memory without one.
        accounts = AccountStore.open(ApplicationConfig.DATABASE_PATH);
        warnAboutSignIn();
        // Recording, the lobby backup, the drop of restored games that have a record, the sweep.
        startUp(GameStore.open(ApplicationConfig.DATABASE_PATH));

        // Only initialize Javalin communication after the database has been queried.
        startServer(getHerokuAssignedPort());

        // Add hook for termination that saves the waiting records and backs up the lobbies.
        Runtime.getRuntime().addShutdownHook(new Thread(SecretHitlerServer::onShutdown));

        // Add timer for periodic updates.
        int delayMs = 0;
        int periodMs = (int) (UPDATE_FREQUENCY_SECONDS * 1000.0f);
        Timer timer = new Timer();
        timer.schedule(new TimerTask() {
            @Override
            public void run() {
                everyMinute();
            }
        }, delayMs, periodMs);
    }

    /**
     * Starts the server's work before it listens, in this order: recording games
     * ({@code startRecording}), loading the lobby backup, dropping each restored game that already
     * has a record ({@code dropRecordedGames}), then the sweep, so the sweep never makes a second
     * record of a game that ended. Package-private for RecordingServerTest.
     */
    static void startUp(GameStore store) {
        startRecording(store);
        loadDatabaseBackup();
        dropRecordedGames(codeToLobby, store);
        removeInactiveLobbies(); // immediately clean in case of redundant lobbies.
    }

    /**
     * The 60 s timer's work: the sweep of lobbies and of expired sessions, another try for the
     * records whose save failed, and a backup of the lobbies if they changed. Throws nothing, as an
     * uncaught exception would end the timer. Package-private for RecordingServerTest.
     */
    static void everyMinute() {
        removeInactiveLobbies();
        sweepExpiredSessions();
        GameRecorder writer = recorder;
        if (writer != null) {
            writer.retryWaiting();
        }
        if (!codeToLobby.isEmpty()) {
            printLobbyStatus();
        }
        // If there are active lobbies, store a backup of the game.
        if (!codeToLobby.isEmpty() && hasLobbyChanged) {
            storeDatabaseBackup();
            hasLobbyChanged = false;
        }
    }

    /**
     * The shutdown hook's work: the writer's thread stops, every record still queued or waiting
     * is tried once more, and then the lobbies are backed up, so a game whose record is saved
     * comes back without it. Package-private for RecordingServerTest.
     */
    static void onShutdown() {
        GameRecorder writer = recorder;
        if (writer != null) {
            writer.stop();
            writer.flush();
            if (writer.waitingCount() > 0) {
                logger.error("Lost " + writer.waitingCount() + " game records: the database failed until shutdown.");
            }
        }
        logger.info("Attempting to back up lobby data.");
        storeDatabaseBackup();
        printLobbyStatus();
    }

    /** Warns at start when test sign-in is on, and when no one can sign in to play. */
    private static void warnAboutSignIn() {
        if (ApplicationConfig.TEST_SIGN_IN) {
            logger.warn("Test sign-in is on (TEST_SIGN_IN=true): anyone can sign in as a test account. "
                    + "It is meant for local runs and tests only.");
        }
        if (!ApplicationConfig.discordConfigured() && !ApplicationConfig.TEST_SIGN_IN) {
            logger.warn("Nobody can sign in to play: Discord sign-in is not configured (DISCORD_CLIENT_ID, "
                    + "DISCORD_CLIENT_SECRET and DISCORD_REDIRECT_URI) and test sign-in is off.");
        }
    }

    /**
     * Deletes the expired sessions, on the update timer. A failure is logged, and the timer runs
     * on: an uncaught exception would end it. Package-private for SessionSweepTest.
     */
    static void sweepExpiredSessions() {
        try {
            int swept = accounts.sweepExpiredSessions();
            if (swept > 0) {
                logger.info("Removed " + swept + " expired sessions.");
            }
        } catch (RuntimeException e) {
            logger.error("Could not remove the expired sessions.", e);
        }
    }

    /**
     * Checks for and removes any lobbies that have timed out. Runs at start-up, on the update
     * timer, and before a new lobby is made, without any handler's lock.
     *
     * @effects Closes each lobby in {@code codeToLobby} that has timed out, under its lock
     *          ({@code Lobby.closeIfTimedOut}), so that it takes no connection and answers no
     *          message from then on, even from a handler that looked it up just before (#64).
     *          Then removes it from {@code codeToLobby} and closes its connections. Each
     *          connection stays in {@code userToLobby} until its close handler runs, so a
     *          message already on its way finds the lobby closed: a spectator's is still
     *          known as a spectator's.
     */
    static void removeInactiveLobbies() {
        List<String> removedLobbyCodes = new ArrayList<>();
        for (Map.Entry<String, Lobby> entry : codeToLobby.entrySet()) {
            Lobby lobby = entry.getValue();
            if (!lobby.closeIfTimedOut()) {
                continue; // live, or closed already by a sweep running at the same time
            }
            codeToLobby.remove(entry.getKey(), lobby);
            // A closed lobby takes no connection, so these are all it will ever have.
            for (WsContext ctx : lobby.getConnections()) {
                ctx.session.close(StatusCode.NORMAL, "The lobby has timed out.");
            }
            removedLobbyCodes.add(entry.getKey());
        }
        if (!removedLobbyCodes.isEmpty()) {
            logger.info(String.format("Removed %d inactive lobbies: %s", removedLobbyCodes.size(), removedLobbyCodes));
            printLobbyStatus();
            hasLobbyChanged = true;
        }
    }

    /**
     * Marks the lobbies changed, so the next 60 s tick backs them up: a lobby whose game has just
     * ended calls it, so the backup soon holds the lobby without the finished game.
     */
    public static void markLobbiesChanged() {
        hasLobbyChanged = true;
    }

    /////// Recording games
    // <editor-fold desc="Recording games">

    /**
     * Starts recording games into {@code store}: a writer ({@code GameRecorder}) with its thread
     * running, which every lobby hands its records to from now on ({@code Lobby.recordSink}).
     * Package-private for the tests, which call {@code stopRecording} after.
     */
    static void startRecording(GameStore store) {
        GameRecorder writer = new GameRecorder(store, () -> {
        });
        writer.start();
        games = store;
        recorder = writer;
        Lobby.recordSink = writer;
    }

    /**
     * Stops recording: the writer's thread stops, and lobbies drop their records again
     * ({@code GameRecordSink.DROPPING}). The store stays open. Package-private for the tests.
     */
    static void stopRecording() {
        Lobby.recordSink = GameRecordSink.DROPPING;
        GameRecorder writer = recorder;
        if (writer != null) {
            writer.stop();
        }
        recorder = null;
        games = null;
    }

    /**
     * Drops every restored game that already has a record, before the start-up sweep could record
     * it again (spec, "A finished game never comes back"). For up to a minute after a game ends,
     * the database can hold its record and a lobby backup in which it still runs; a crash in that
     * minute, or a restore of a database backup taken in it, would bring the game back, its roles
     * and hands already public. Each such lobby comes back idle, as if its backup had caught up.
     *
     * <p>Reads each game's ID under its lobby's lock, asks the store once under no lock, then
     * drops each game that has a record under its lobby's lock again, if the lobby still runs that
     * game, logging the lobby, and marks the lobbies changed. A read that fails keeps every game,
     * with an error logged.
     */
    static void dropRecordedGames(Map<String, Lobby> lobbies, GameStore store) {
        Map<String, String> gameIds = new HashMap<>();
        for (Map.Entry<String, Lobby> entry : lobbies.entrySet()) {
            Lobby lobby = entry.getValue();
            synchronized (lobby) {
                if (lobby.isInGame() && lobby.gameId() != null) {
                    gameIds.put(entry.getKey(), lobby.gameId());
                }
            }
        }
        if (gameIds.isEmpty()) {
            return;
        }
        Set<String> recorded;
        try {
            recorded = store.recordedIds(new HashSet<>(gameIds.values()));
        } catch (RuntimeException e) {
            logger.error("Could not read which restored games have a record: every restored game is kept.", e);
            return;
        }
        boolean dropped = false;
        for (Map.Entry<String, String> entry : gameIds.entrySet()) {
            if (!recorded.contains(entry.getValue())) {
                continue;
            }
            Lobby lobby = lobbies.get(entry.getKey());
            synchronized (lobby) {
                if (lobby.isInGame() && entry.getValue().equals(lobby.gameId())) {
                    lobby.dropGame();
                    dropped = true;
                    logger.warn("Dropped the game in lobby " + entry.getKey() + ": it has a record already.");
                }
            }
        }
        if (dropped) {
            markLobbiesChanged();
        }
    }

    // </editor-fold>

    /////// Renaming and game starts
    // <editor-fold desc="Renaming and game starts">

    /**
     * Gives an account a new name everywhere: in the account store and in every lobby it is in.
     * Runs under {@code ACCOUNTS_LOCK}, which every game start takes first too ({@link #startGame}),
     * so no game starts between the check for seats and the change to the lobbies: either a game
     * seats the new name, or the rename finds the account seated and is refused. Each lobby is
     * read and changed under its own lock, and the store is written under none.
     *
     * @param accountId      the account to rename.
     * @param normalizedName the new name, as {@code Usernames.normalize} gives it and passing
     *                       {@code Usernames.problem}.
     * @return {@code SEATED} if the account holds a seat in a running game in any lobby, and
     *         {@code TAKEN} if another account has the name ignoring case; either way nothing
     *         changes. Otherwise {@code SAVED}: the store has the name, and every lobby the account
     *         is in (live, or inside the grace window after a disconnect) shows it, with the state
     *         sent to its players and spectators. A lobby the sweep has closed is passed over.
     * @throws IllegalArgumentException if the name is not normalized or breaks a name rule.
     *                                  Nothing changes.
     */
    public static RenameResult renameAccount(String accountId, String normalizedName) {
        if (normalizedName == null || !normalizedName.equals(Usernames.normalize(normalizedName))
                || Usernames.problem(normalizedName) != null) {
            throw new IllegalArgumentException("Not a name an account can have: '" + normalizedName + "'.");
        }
        synchronized (ACCOUNTS_LOCK) {
            for (Lobby lobby : codeToLobby.values()) {
                synchronized (lobby) {
                    if (!lobby.isClosed() && lobby.isSeated(accountId)) {
                        return RenameResult.SEATED;
                    }
                }
            }
            // No seat can appear from here on: a game start waits for ACCOUNTS_LOCK.
            if (accounts.setUsername(accountId, normalizedName) == AccountStore.NameResult.TAKEN) {
                return RenameResult.TAKEN;
            }
            boolean changed = false;
            for (Lobby lobby : codeToLobby.values()) {
                synchronized (lobby) {
                    if (!lobby.isClosed() && lobby.rename(accountId, normalizedName)) {
                        lobby.sendStateToAll();
                        changed = true;
                    }
                }
            }
            if (changed) {
                hasLobbyChanged = true;
                logger.info("Account " + accountId + " is now '" + normalizedName + "' in its lobbies.");
            }
            return RenameResult.SAVED;
        }
    }

    /**
     * Starts a game in the lobby: the only way a game starts. Takes {@code ACCOUNTS_LOCK} and then
     * the lobby's lock, as a rename does ({@link #renameAccount}), so each account is seated under
     * the name it has at the start. The start-game command calls it holding both already.
     *
     * @throws IllegalStateException if the caller holds the lobby's lock but not
     *                               {@code ACCOUNTS_LOCK}: taking it then could deadlock with a
     *                               rename. Nothing changes.
     * @throws RuntimeException      as {@code Lobby.startNewGame} does, changing nothing.
     */
    static void startGame(Lobby lobby) {
        if (Thread.holdsLock(lobby) && !Thread.holdsLock(ACCOUNTS_LOCK)) {
            throw new IllegalStateException("ACCOUNTS_LOCK must be taken before the lobby's lock.");
        }
        synchronized (ACCOUNTS_LOCK) {
            synchronized (lobby) {
                lobby.startNewGame();
            }
        }
    }

    // </editor-fold>

    /////// Database Handling
    // <editor-fold desc="Database Handling">

    /** How long {@code main} waits for a busy database file to take WAL mode. */
    static final long WAL_TIMEOUT_MS = 5000;

    /**
     * Puts the SQLite file at {@code path} in WAL mode, before anything else opens it, so a
     * backup's read (devops/backup-db.sh) never blocks the server's writes and a write never fails
     * because a backup is reading. The mode belongs to the file, so every later connection has it.
     * A busy or locked file is tried again every 100 ms until {@code timeoutMs} pass, and any other
     * failure gives up at once. Giving up is logged as an error, and the file keeps its journal
     * mode: a busy file never keeps the server from starting.
     *
     * @return true if the file is in WAL mode afterwards; false otherwise, and for a null or blank
     *         {@code path}, which creates and logs nothing.
     */
    static boolean useWriteAheadLog(String path, long timeoutMs) {
        if (path == null || path.isBlank()) {
            return false;
        }
        long deadline = System.nanoTime() + timeoutMs * 1_000_000L;
        SQLException cause = null;
        while (true) {
            try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + path);
                    Statement stmt = c.createStatement()) {
                // This loop alone decides how long to wait for a busy file.
                stmt.execute("PRAGMA busy_timeout = 0");
                try (ResultSet rs = stmt.executeQuery("PRAGMA journal_mode = WAL")) {
                    if (rs.next() && "wal".equalsIgnoreCase(rs.getString(1))) {
                        logger.info("Database " + path + " is in WAL mode.");
                        return true;
                    }
                }
            } catch (SQLException e) {
                cause = e;
                if (!isBusyOrLocked(e)) {
                    break;
                }
            }
            long remainingNs = deadline - System.nanoTime();
            if (remainingNs <= 0) {
                break;
            }
            try {
                Thread.sleep(Math.min(100, (remainingNs + 999_999) / 1_000_000));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        logger.error("Could not put database " + path + " in WAL mode; it keeps its journal mode.", cause);
        return false;
    }

    /** Whether {@code e} is SQLite's SQLITE_BUSY or SQLITE_LOCKED, whose extended codes included. */
    private static boolean isBusyOrLocked(SQLException e) {
        if (!(e instanceof SQLiteException)) {
            return false;
        }
        int primary = ((SQLiteException) e).getResultCode().code & 0xFF;
        return primary == SQLiteErrorCode.SQLITE_BUSY.code || primary == SQLiteErrorCode.SQLITE_LOCKED.code;
    }

    /**
     * Opens the SQLite backup database at {@code path}, creating the file and the
     * backup table if needed. The account store keeps a connection of its own to the same
     * file, so this one waits up to 5 s for the store's writes, as the store waits for its,
     * instead of failing at once with SQLITE_BUSY.
     *
     * @return null if {@code path} is null or blank, or the database cannot be
     *         opened; otherwise an open connection.
     */
    static Connection getDatabaseConnection(String path) {
        if (path == null || path.isBlank()) {
            return null;
        }
        try {
            Connection c = DriverManager.getConnection("jdbc:sqlite:" + path);
            try {
                initializeDatabase(c);
            } catch (SQLException | RuntimeException e) {
                try {
                    c.close();
                } catch (SQLException closeFailure) {
                    e.addSuppressed(closeFailure);
                }
                throw e;
            }
            return c;
        } catch (SQLException e) {
            logger.error("Could not open the backup database at " + path + ".", e);
            return null;
        }
    }

    /**
     * Stores {@code lobbies} as the single backup row, replacing any earlier one.
     */
    static void storeLobbies(Connection c, Map<String, Lobby> lobbies) throws SQLException, IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ObjectOutputStream out = new ObjectOutputStream(bytes)) {
            out.writeObject(lobbies);
        }
        String timestamp = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss")
                .format(new Timestamp(System.currentTimeMillis()));
        String query = "INSERT INTO backup (id, timestamp, attempts, lobby_bytes) VALUES (0, ?, 0, ?) "
                + "ON CONFLICT (id) DO UPDATE SET timestamp = excluded.timestamp, "
                + "attempts = excluded.attempts, lobby_bytes = excluded.lobby_bytes;";
        try (PreparedStatement stmt = c.prepareStatement(query)) {
            stmt.setString(1, timestamp);
            stmt.setBytes(2, bytes.toByteArray());
            stmt.executeUpdate();
        }
    }

    /**
     * Loads the backup row and counts the load in its {@code attempts} column.
     *
     * @return the stored lobbies, or null if nothing has been stored.
     */
    @SuppressWarnings("unchecked")
    static ConcurrentHashMap<String, Lobby> loadLobbies(Connection c)
            throws SQLException, IOException, ClassNotFoundException {
        byte[] lobbyBytes;
        try (Statement stmt = c.createStatement();
                ResultSet rs = stmt.executeQuery("SELECT timestamp, lobby_bytes FROM backup WHERE id = 0;")) {
            if (!rs.next()) {
                return null;
            }
            logger.info("Loaded backup from " + rs.getString("timestamp") + ".");
            lobbyBytes = rs.getBytes("lobby_bytes");
        }
        try (Statement stmt = c.createStatement()) {
            stmt.executeUpdate("UPDATE backup SET attempts = attempts + 1 WHERE id = 0;");
        }
        try (ObjectInputStream in = new ObjectInputStream(new ByteArrayInputStream(lobbyBytes))) {
            ConcurrentHashMap<String, Lobby> lobbies = (ConcurrentHashMap<String, Lobby>) in.readObject();
            // A game backed up before accounts has seats that belong to typed names, which no
            // account can take back; an idle lobby from then is kept.
            lobbies.entrySet().removeIf(entry -> {
                Lobby lobby = entry.getValue();
                if (lobby.wasBackedUpBeforeAccounts() && lobby.isInGame()) {
                    logger.warn("Dropped lobby " + entry.getKey() + ": its game was backed up before accounts.");
                    return true;
                }
                return false;
            });
            return lobbies;
        }
    }

    /**
     * Loads lobby data stored in the database (intended to be run on server wake).
     *
     * @effects {@code codeToLobby} is set to the stored lobbies, if there are any.
     */
    private static void loadDatabaseBackup() {
        try (Connection c = getDatabaseConnection(ApplicationConfig.DATABASE_PATH)) {
            if (c != null) {
                ConcurrentHashMap<String, Lobby> stored = loadLobbies(c);
                if (stored != null) {
                    codeToLobby = stored;
                }
            }
        } catch (Exception e) {
            logger.error("Failed to load the lobby backup.", e);
        }
        printLobbyStatus();
    }

    private static void storeDatabaseBackup() {
        try (Connection c = getDatabaseConnection(ApplicationConfig.DATABASE_PATH)) {
            if (c != null) {
                storeLobbies(c, codeToLobby);
                logger.debug("Successfully saved Lobby state to the database.");
            }
        } catch (Exception e) {
            logger.error("Failed to store the Lobby data in the database.", e);
        }
    }

    /**
     * Sets the connection's busy timeout and creates the backup table if it does not exist yet.
     */
    private static void initializeDatabase(Connection c) throws SQLException {
        try (Statement stmt = c.createStatement()) {
            stmt.execute("PRAGMA busy_timeout = 5000");
            stmt.executeUpdate("CREATE TABLE IF NOT EXISTS backup "
                    + "(id INT UNIQUE, timestamp TEXT, attempts INT, lobby_bytes BLOB);");
        }
    }

    // </editor-fold>

    /////// Get Requests
    // <editor-fold desc="Get Requests">

    /**
     * Pings the server (intended to wake the inactive server)
     * 
     * @param ctx the context of the login request
     * @effects Returns the message "OK" with status code 200.
     */
    public static void ping(Context ctx) {
        ctx.status(200);
        ctx.result("OK");
    }

    /**
     * Determines whether the signed-in account may join a lobby as a player: the request's
     * {@code session} cookie ({@code AuthRoutes.signedIn}, which extends a session near its end and
     * sets the cookie again whenever it finds one). A {@code name} parameter is ignored: a player's
     * name is their account's.
     *
     * @param ctx the context of the login request: {@code lobby}, the code of the lobby, and for a
     *            spectator {@code spectator=true} ({@code checkSpectatorLogin}, which needs no
     *            session).
     * @effects Result status is the first of these that applies:
     *          <p>
     *          - 400: the {@code lobby} parameter is missing (or blank).
     *          <p>
     *          - 401 "Sign in to play.": no session (no cookie, or one that matches no live
     *          session), or an account with no name yet.
     *          <p>
     *          - 404: there is no lobby with the given code, or the sweep has closed it
     *          ({@code Lobby.isClosed}).
     *          <p>
     *          - 403: the account already has a live connection in the lobby (another tab or
     *          window), even if the lobby is full or in a game.
     *          <p>
     *          - 200: the account is taking back its own seat ({@code Lobby.canRejoin}): in the
     *          running game, or inside the grace window after a disconnect.
     *          <p>
     *          - 489: the lobby is full.
     *          <p>
     *          - 488: the lobby is in a game the account has no seat in.
     *          <p>
     *          - 200: the account may join.
     */
    public static void checkLogin(Context ctx) {
        String lobbyCode = ctx.queryParam(PARAM_LOBBY);
        if ("true".equals(ctx.queryParam(PARAM_SPECTATOR))) {
            checkSpectatorLogin(ctx, lobbyCode);
            return;
        }
        if (lobbyCode == null || lobbyCode.isBlank()) {
            ctx.status(400);
            ctx.result("Lobby must be specified.");
            return;
        }
        Account account = AuthRoutes.signedIn(ctx); // a database read, under no lock
        if (account == null || account.username() == null) {
            ctx.status(401);
            ctx.result(AuthRoutes.SIGN_IN_TO_PLAY);
            return;
        }

        String accountId = account.id();
        // One lookup: the sweep may remove the lobby at any moment. Once closed, a lobby stays closed.
        Lobby lobby = codeToLobby.get(lobbyCode);
        if (lobby == null || lobby.isClosed()) { // lobby does not exist, or the sweep has taken it
            ctx.status(404);
            ctx.result("No such lobby found.");
        } else if (lobby.hasAccount(accountId)) { // a second tab: before a full lobby or a game (ruling R6)
            ctx.status(403);
            ctx.result(ALREADY_IN_LOBBY);
        } else if (lobby.canRejoin(accountId)) { // takes back their own seat, even in a full lobby
            ctx.status(200);
            ctx.result(lobby.isInGame() ? "Login request valid (re-joining an existing game)."
                    : "Login request valid.");
        } else if (lobby.isFull()) {
            ctx.status(489);
            ctx.result("The lobby is currently full.");
        } else if (lobby.isInGame()) {
            ctx.status(488);
            ctx.result("The lobby is currently in a game.");
        } else {
            ctx.status(200);
            ctx.result("Login request valid.");
        }
    }

    /**
     * Checks a spectator's login ({@code spectator=true}), which needs only a lobby code.
     * 400 without a code, 404 for an unknown lobby or one the sweep has closed (as for a
     * player), otherwise 200: a spectator may watch a full lobby or a game in progress.
     */
    private static void checkSpectatorLogin(Context ctx, String lobbyCode) {
        if (lobbyCode == null || lobbyCode.isBlank()) {
            ctx.status(400);
            ctx.result("Lobby must be specified.");
            return;
        }
        Lobby lobby = codeToLobby.get(lobbyCode);
        if (lobby == null || lobby.isClosed()) {
            ctx.status(404);
            ctx.result("No such lobby found.");
        } else {
            ctx.status(200);
            ctx.result("Spectator login valid.");
        }
    }

    /**
     * Generates a new lobby and returns the access code.
     *
     * @param ctx the HTTP get request context.
     * @effects 401 "Sign in to play." unless the request is signed in as an account with a
     *          name ({@code AuthRoutes.signedIn}), before the sweep runs or a lobby is made.
     *          Otherwise 200 with the new lobby's code.
     */
    public static void createNewLobby(Context ctx) {
        Account account = AuthRoutes.signedIn(ctx);
        if (account == null || account.username() == null) {
            ctx.status(401);
            ctx.result(AuthRoutes.SIGN_IN_TO_PLAY);
            return;
        }
        removeInactiveLobbies();
        hasLobbyChanged = true;

        String newCode = generateCode();
        while (codeToLobby.containsKey(newCode)) {
            newCode = generateCode();
        }

        Lobby lobby = new Lobby();
        codeToLobby.put(newCode, lobby); // add a new lobby with the given code.

        ctx.status(200);
        ctx.result(newCode);
        logger.info("New lobby created: " + newCode);
        logger.info("Available lobbies: " + codeToLobby.keySet());
    }

    /**
     * Generates a random code.
     * 
     * @return a String code, with length specified by {@code this.CODE_LENGTH} and
     *         characters randomly
     *         chosen from {@code CODE_CHARACTERS}.
     */
    private static String generateCode() {
        StringBuilder builder = new StringBuilder();
        while (builder.length() < CODE_LENGTH) {
            int index = (int) (Math.random() * CODE_CHARACTERS.length());
            builder.append(CODE_CHARACTERS.charAt(index));
        }
        return builder.toString();
    }

    // </editor-fold>

    /////// Websocket Handling
    // <editor-fold desc="Websocket Handling">

    /**
     * Called when a websocket connects to the server. A spectator's ({@code spectator=true}) is
     * {@code connectSpectator}'s. A player's socket is the account of its {@code session} cookie,
     * which browsers send on a same-origin handshake; the {@code name} parameter is ignored, and the
     * player's name is their account's.
     *
     * @param ctx the WsConnectContext of the websocket, with the parameters {@code lobby}, the
     *            lobby's code, and optionally {@code rejoinKey}, the key the page keeps for its
     *            lifetime.
     * @effects Closes the websocket session with 1002 ({@code StatusCode.PROTOCOL})
     *          and a reason if, in this order:
     *          <p>
     *          - the cookie matches no live session of an account with a name (no cookie, a junk
     *          or signed-out one, an expired session, or an account with no name yet), before any
     *          lobby is touched;
     *          <p>
     *          - outside debug mode, the {@code Origin} header is missing or not the server's own
     *          ({@code sameOrigin}): another site's page cannot open a player's socket;
     *          <p>
     *          - the {@code lobby} parameter is missing;
     *          <p>
     *          - there is no lobby with the given code;
     *          <p>
     *          - the lobby refuses the connection ({@code Lobby.joinRefusal}): the sweep has
     *          closed it, even if only after this lookup; the account has a live connection in
     *          the lobby already (another tab), and this one does not bring its
     *          {@code rejoinKey}; the lobby is full, and the account is not taking back its own
     *          seat; or the lobby is in a game the account has no seat in.
     *          <p>
     *          Otherwise, connects the account to the lobby under the name it has now. A
     *          connection that takes its account's place closes the old one with
     *          {@code CLOSE_REPLACED}. The name is read, and the connection checked and added, in
     *          one step under {@code ACCOUNTS_LOCK} and then the lobby's lock: connections that
     *          arrive at once are checked and added one at a time, and a rename never makes the
     *          join record a name the account no longer has.
     */
    static void onWebsocketConnect(WsConnectContext ctx) {
        if ("true".equals(ctx.queryParam(PARAM_SPECTATOR))) {
            connectSpectator(ctx);
            return;
        }
        // Who the socket is, read before any lock: a database read never runs under a lobby's lock.
        Account signedIn = signedInPlayer(ctx);
        if (signedIn == null) {
            logger.debug("A player's websocket had no signed-in account with a name and was disconnected.");
            ctx.session.close(StatusCode.PROTOCOL, SIGN_IN_TO_JOIN);
            return;
        }
        if (!ApplicationConfig.DEBUG && !sameOrigin(ctx)) {
            logger.warn("Refused a player's websocket from another origin: " + ctx.header("Origin"));
            ctx.session.close(StatusCode.PROTOCOL, ANOTHER_SITE);
            return;
        }
        String code = ctx.queryParam(PARAM_LOBBY);
        if (code == null) {
            logger.debug("A player's websocket request had no lobby and was disconnected.");
            ctx.session.close(StatusCode.PROTOCOL, "Must have the '" + PARAM_LOBBY + "' parameter.");
            return;
        }

        String accountId = signedIn.id();
        logger.debug("Attempting to connect account " + accountId + " to lobby '" + code + "': ");
        // One lookup: the sweep may remove the lobby at any moment (#64). If it does after this, the
        // lobby is closed by the time this connection holds its lock, and refuses it (CLOSED).
        Lobby lobby = codeToLobby.get(code);
        if (lobby == null) { // the lobby does not exist.
            logger.debug("FAILED (The lobby does not exist)");
            ctx.session.close(StatusCode.PROTOCOL, noSuchLobby(code));
            return;
        }

        String rejoinKey = ctx.queryParam(PARAM_REJOIN_KEY);
        if (rejoinKey != null && rejoinKey.isBlank()) {
            rejoinKey = null; // an empty key is no key
        }
        // ACCOUNTS_LOCK and then the lobby's lock, as a rename takes them (renameAccount). The name
        // is read again under the first, so either a rename comes first and this records its name,
        // or it comes after and finds the account in the lobby. The check and the add are one step
        // under both: of two connections arriving at once for one account or for the last seat, the
        // second is then refused as it would be had it come later, where between the check and the
        // add it would fail the add's own check (#43).
        Lobby.JoinRefusal refusal;
        WsContext replaced = null;
        String name;
        synchronized (ACCOUNTS_LOCK) {
            name = currentName(accountId); // a database read, under no lobby's lock
            synchronized (lobby) {
                // An account with no name has none to show, which addUser refuses. It cannot lose
                // the one the lookup saw, but its name is read again here.
                refusal = name == null ? Lobby.JoinRefusal.NO_ACCOUNT : lobby.joinRefusal(accountId, rejoinKey);
                if (refusal == null) {
                    replaced = lobby.addUser(ctx, accountId, name, rejoinKey);
                    userToLobby.put(ctx, lobby); // keep track of which lobby this connection is in.
                    if (replaced != null) {
                        // Forget the old connection first, so its close (whenever it comes) changes nothing.
                        userToLobby.remove(replaced);
                    }
                }
            }
        }
        if (refusal != null) {
            logger.debug("FAILED (" + refusal + ")");
            ctx.session.close(StatusCode.PROTOCOL, refusalReason(refusal, code));
            return;
        }
        logger.debug("SUCCESS");
        if (replaced != null) {
            replaced.session.close(CLOSE_REPLACED, "Replaced by a newer connection under the same account.");
            logger.info("Account " + accountId + " ('" + name + "') in lobby '" + code
                    + "' reconnected in place of their old connection.");
        }
        lobby.updateAllUsers();
        hasLobbyChanged = true;
    }

    /**
     * The account a player's socket plays as: the one its {@code session} cookie is signed in as,
     * if it has a name. The lookup extends a session near its end, as every read of a session does,
     * but the cookie cannot be set again here: Javalin has sent the upgrade's response before this
     * handler runs, and HTTP before-handlers never run for an upgrade (an access manager, which
     * wraps every HTTP route too, is the only hook before it). The page's next HTTP read of its
     * session ({@code AuthRoutes.signedIn}: {@code /me}, {@code /check-login} and the rest) sets
     * the cookie again, with the time the extended session has left.
     *
     * @return the account, or null for no cookie, one that matches no live session, or an account
     *         with no name yet.
     */
    private static Account signedInPlayer(WsContext ctx) {
        String token = ctx.cookie(AuthRoutes.SESSION_COOKIE);
        if (token == null || token.isBlank()) {
            return null;
        }
        AccountStore.SessionLookup session = accounts.lookup(token);
        if (session == null || session.account().username() == null) {
            return null;
        }
        return session.account();
    }

    /** The account's name in the store now, or null if it has none. The caller holds ACCOUNTS_LOCK. */
    private static String currentName(String accountId) {
        Account account = accounts.find(accountId);
        return account == null ? null : account.username();
    }

    /** Whether a player's socket comes from the server's own pages: {@link #sameOrigin(String, String)}. */
    static boolean sameOrigin(WsContext ctx) {
        return sameOrigin(ctx.header("Origin"), ctx.header("Host"));
    }

    /**
     * Whether an {@code Origin} header names the server's own origin. That is the scheme, host and
     * port of {@code DISCORD_REDIRECT_URI} when it is set (TLS may end at a proxy in front of the
     * server, so only that URI knows them); otherwise the host and port of the request's
     * {@code Host} header. Hosts compare ignoring case, a port left out is its scheme's default
     * (80, or 443 for https), and an IPv6 host keeps its brackets. Each is split by hand, not read
     * with {@code java.net.URI}, which takes a host that is not a DNS name (one with an
     * underscore, say) for none. Package-private for the tests.
     *
     * @param origin the {@code Origin} header: {@code http} or {@code https}, {@code ://}, a host
     *               and an optional port, and nothing after them.
     * @param host   the {@code Host} header: a host and an optional port.
     * @return false when {@code origin} is missing or is no such origin ({@code null}, a sandboxed
     *         page's, is none), or the origin it is compared with cannot be read.
     */
    static boolean sameOrigin(String origin, String host) {
        WebOrigin from = webOrigin(origin, false);
        if (from == null) {
            return false;
        }
        String ownUri = ApplicationConfig.DISCORD_REDIRECT_URI;
        if (ownUri != null && !ownUri.isBlank()) {
            WebOrigin own = webOrigin(ownUri, true);
            return own != null && from.scheme().equals(own.scheme()) && from.sameHostAndPort(own);
        }
        WebOrigin served = authority(from.scheme(), host);
        return served != null && from.sameHostAndPort(served);
    }

    /** An http or https origin: its scheme in lower case, its host, and its port (-1 when left out). */
    private record WebOrigin(String scheme, String host, int port) {
        private int portOrDefault() {
            return port != -1 ? port : scheme.equals("https") ? 443 : 80;
        }

        private boolean sameHostAndPort(WebOrigin other) {
            return host.equalsIgnoreCase(other.host) && portOrDefault() == other.portOrDefault();
        }
    }

    /**
     * Reads the origin of an http or https URL: the scheme, {@code ://}, then the host and port up
     * to the first {@code /}, {@code ?} or {@code #}.
     *
     * @param urlAllowed whether a path, query or fragment may follow (a URL, such as the redirect
     *                   URI) or not (an {@code Origin} header).
     * @return the origin, or null if the text has none.
     */
    private static WebOrigin webOrigin(String text, boolean urlAllowed) {
        if (text == null) {
            return null;
        }
        String url = text.trim();
        int separator = url.indexOf("://");
        if (separator < 0) {
            return null;
        }
        String scheme = url.substring(0, separator).toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) {
            return null;
        }
        String rest = url.substring(separator + 3);
        for (int i = 0; i < rest.length(); i++) {
            if ("/?#".indexOf(rest.charAt(i)) >= 0) {
                if (!urlAllowed) {
                    return null;
                }
                rest = rest.substring(0, i);
                break;
            }
        }
        return authority(scheme, rest);
    }

    /**
     * Reads {@code host[:port]}, an IPv6 host in brackets (which it keeps), as an origin of the
     * scheme.
     *
     * @return the origin, or null for none: no host, a character no host has (whitespace, a
     *         control, {@code @}, a slash, {@code ?}, {@code #}, a bracket outside an IPv6 host, or
     *         anything beyond ASCII), or a port that is not a number from 0 to 65535.
     */
    private static WebOrigin authority(String scheme, String authority) {
        if (authority == null) {
            return null;
        }
        String host;
        String port = null;
        if (authority.startsWith("[")) {
            int close = authority.indexOf(']');
            if (close < 2 || !hostCharacters(authority.substring(1, close))) {
                return null;
            }
            host = authority.substring(0, close + 1);
            String after = authority.substring(close + 1);
            if (!after.isEmpty()) {
                if (after.charAt(0) != ':') {
                    return null;
                }
                port = after.substring(1);
            }
        } else {
            int colon = authority.indexOf(':');
            host = colon < 0 ? authority : authority.substring(0, colon);
            port = colon < 0 ? null : authority.substring(colon + 1);
            if (host.isEmpty() || !hostCharacters(host)) {
                return null;
            }
        }
        int number = -1;
        if (port != null) {
            if (port.isEmpty() || port.length() > 5 || !port.chars().allMatch(c -> c >= '0' && c <= '9')) {
                return null;
            }
            number = Integer.parseInt(port);
            if (number > 65535) {
                return null;
            }
        }
        return new WebOrigin(scheme, host, number);
    }

    /** Whether every character of the host is printable ASCII other than {@code @ / \ ? # [ ]}. */
    private static boolean hostCharacters(String host) {
        return host.chars().allMatch(c -> c > ' ' && c < 127 && "@/\\?#[]".indexOf(c) < 0);
    }

    /** The reason a refused player's socket is closed with, for the lobby {@code code}. */
    private static String refusalReason(Lobby.JoinRefusal refusal, String code) {
        return switch (refusal) {
            case CLOSED -> noSuchLobby(code); // timed out, and on its way out of the server
            case NO_ACCOUNT -> SIGN_IN_TO_JOIN;
            case ALREADY_IN -> ALREADY_IN_LOBBY;
            case FULL -> "The lobby " + code + " is currently full.";
            case IN_GAME -> "The lobby " + code + " is currently in a game..";
        };
    }

    /** The reason a socket is closed with when its lobby does not exist, or the sweep has closed it. */
    private static String noSuchLobby(String code) {
        return "The lobby '" + code + "' does not exist.";
    }

    /**
     * Connects a spectator ({@code spectator=true}): a connection that watches a lobby and its
     * game without a seat, with no name. Closes the session with the same error as a player's
     * join if the lobby does not exist or the sweep has closed it.
     */
    private static void connectSpectator(WsConnectContext ctx) {
        String code = ctx.queryParam(PARAM_LOBBY);
        if (code == null) {
            logger.debug("A spectator's websocket request had no lobby and was disconnected.");
            ctx.session.close(StatusCode.PROTOCOL, "Must have the '" + PARAM_LOBBY + "' parameter.");
            return;
        }
        Lobby lobby = codeToLobby.get(code);
        if (lobby == null) {
            logger.debug("Spectator " + ctx.getSessionId() + " FAILED to watch '" + code + "' (no such lobby)");
            ctx.session.close(StatusCode.PROTOCOL, noSuchLobby(code));
            return;
        }
        synchronized (lobby) {
            if (lobby.isClosed()) { // the sweep took it after the lookup (#64)
                logger.debug("Spectator " + ctx.getSessionId() + " FAILED to watch '" + code + "' (timed out)");
                ctx.session.close(StatusCode.PROTOCOL, noSuchLobby(code));
                return;
            }
            lobby.addSpectator(ctx);
            userToLobby.put(ctx, lobby);
            lobby.sendStateToAll();
            logger.info("Spectator " + ctx.getSessionId() + " is watching lobby '" + code + "' ("
                    + lobby.getSpectatorCount() + " watching).");
        }
    }

    /**
     * Handles a spectator's message. A spectator may only ping and ask for the state; anything
     * else is logged and dropped, with no reply, so the connection stays open and the game and
     * the lobby's timeout are untouched. A lobby the sweep has closed answers nothing: the
     * connection is closed as a player's would be.
     */
    private static void onSpectatorMessage(WsMessageContext ctx, Lobby lobby) {
        String command;
        try {
            command = new JSONObject(ctx.message()).optString(PARAM_COMMAND);
        } catch (JSONException e) {
            command = "(not JSON)";
        }
        synchronized (lobby) {
            if (lobby.isClosed()) { // the sweep has closed this connection too (#64)
                ctx.session.close(StatusCode.PROTOCOL, noSuchLobby(ctx.queryParam(PARAM_LOBBY)));
                return;
            }
            switch (command) {
                case COMMAND_PING:
                    JSONObject pong = new JSONObject();
                    pong.put(PARAM_PACKET_TYPE, PACKET_PONG);
                    ctx.send(pong.toString());
                    break;
                case COMMAND_GET_STATE:
                    lobby.updateSpectator(ctx);
                    break;
                default:
                    logger.warn("Rejected '" + command + "' from spectator " + ctx.getSessionId() + " in lobby '"
                            + ctx.queryParam(PARAM_LOBBY) + "'.");
            }
        }
    }

    /**
     * Parses a websocket message sent from the user. The player is the connection's account, and
     * in a game its seat ({@code Lobby.seatName}): a {@code name} in the message is never read, and
     * a message need not have one.
     *
     * @param ctx the WsMessageContext of the websocket.
     * @requires the message must have the following parameters:
     *           {@code lobby}: a String representing the lobby code.
     *           {@code command}: a String command.
     * @modifies this
     * @effects Closes the websocket with 1002 ({@code StatusCode.PROTOCOL}) if the
     *          specified lobby does not exist or the sweep has closed it, the connection is not a
     *          player's in that lobby, the player is not allowed to make this action (usually
     *          because their seat is not the president's or chancellor's), if a required
     *          parameter is missing, or the command cannot be executed in this state.
     *          <p>
     *          Updates the game state according to the specified command and
     *          updates every other connected user
     *          with the new state.
     */
    static void onWebSocketMessage(WsMessageContext ctx) {
        // A spectator is known by its connection, whatever its message says.
        Lobby watched = userToLobby.get(ctx);
        if (watched != null && watched.isSpectator(ctx)) {
            onSpectatorMessage(ctx, watched);
            return;
        }

        // Parse message to JSON object.
        JSONObject message = new JSONObject(ctx.message());

        if (message.getString(PARAM_LOBBY) == null || message.getString(PARAM_COMMAND) == null) {
            logger.warn("Message request failed: missing a parameter.");
            ctx.session.close(StatusCode.PROTOCOL, "A required parameter is missing.");
            return;
        }

        String lobbyCode = message.getString(PARAM_LOBBY);

        String logMessage = "Received a message in lobby '" + lobbyCode + "' (" + ctx.message() + "): ";

        Lobby lobby = codeToLobby.get(lobbyCode); // one lookup: the sweep may remove the lobby at any moment
        if (lobby == null) {
            logger.debug(logMessage + " FAILED (Lobby requested does not exist)");
            ctx.session.close(StatusCode.PROTOCOL, noSuchLobby(lobbyCode));
            return;
        }

        if (COMMAND_START_GAME.equals(message.getString(PARAM_COMMAND))) {
            // A game start takes ACCOUNTS_LOCK before the lobby's lock, as a rename does
            // (startGame), so the command's checks and the start all run under both.
            synchronized (ACCOUNTS_LOCK) {
                runPlayerCommand(ctx, message, lobby, lobbyCode, logMessage);
            }
        } else {
            runPlayerCommand(ctx, message, lobby, lobbyCode, logMessage);
        }
    }

    /**
     * Runs a player's command in their lobby, under the lobby's lock ({@code onWebSocketMessage}).
     * The start-game command's caller holds {@code ACCOUNTS_LOCK} already.
     */
    private static void runPlayerCommand(WsMessageContext ctx, JSONObject message, Lobby lobby,
            String lobbyCode, String logMessage) {
        synchronized (lobby) {
            if (lobby.isClosed()) { // the sweep took it after the lookup (#64)
                logger.debug(logMessage + " FAILED (Lobby requested has timed out)");
                ctx.session.close(StatusCode.PROTOCOL, noSuchLobby(lobbyCode));
                return;
            }
            // The player is the connection's account, whatever name the message carries.
            String accountId = lobby.accountOf(ctx);
            if (accountId == null) {
                logger.debug(logMessage + " FAILED (Lobby does not have the user)");
                ctx.session.close(StatusCode.PROTOCOL, "The user is not in the lobby " + lobbyCode + ".");
                return;
            }
            logMessage = "Account " + accountId + ": " + logMessage;
            // The name the game knows the player by: their seat's, or null outside a game.
            String name = lobby.seatName(ctx);

            lobby.recordActivity(ctx);

            boolean updateUsers = true; // this flag can be disabled by certain commands.
            boolean sendOKMessage = true;
            try {
                switch (message.getString(PARAM_COMMAND)) {
                    case COMMAND_PING:
                        sendOKMessage = false;
                        updateUsers = false;
                        JSONObject msg = new JSONObject();
                        msg.put(PARAM_PACKET_TYPE, PACKET_PONG);
                        ctx.send(msg.toString());
                        break;

                    case COMMAND_START_GAME: // Starts the game, holding ACCOUNTS_LOCK and then the lobby's lock.
                        startGame(lobby);
                        break;

                    case COMMAND_GET_STATE: // Requests the updated state of the game.
                        lobby.updateUser(ctx);
                        break;

                    case COMMAND_NOMINATE_CHANCELLOR: // params: PARAM_TARGET (String)
                        verifyIsPresident(name, lobby);
                        lobby.game().nominateChancellor(message.getString(PARAM_TARGET));
                        break;

                    case COMMAND_REGISTER_VOTE: // params: PARAM_VOTE (boolean)
                        boolean vote = message.getBoolean(PARAM_VOTE);
                        lobby.game().registerVote(name, vote);
                        break;

                    case COMMAND_REGISTER_PRESIDENT_CHOICE: // params: PARAM_CHOICE (int)
                        verifyIsPresident(name, lobby);
                        int discard = message.getInt(PARAM_CHOICE);
                        lobby.game().presidentDiscardPolicy(discard);
                        break;

                    case COMMAND_REGISTER_CHANCELLOR_CHOICE: // params: PARAM_CHOICE (int)
                        verifyIsChancellor(name, lobby);
                        int enact = message.getInt(PARAM_CHOICE);
                        lobby.game().chancellorEnactPolicy(enact);
                        break;

                    case COMMAND_REGISTER_CHANCELLOR_VETO:
                        verifyIsChancellor(name, lobby);
                        lobby.game().chancellorVeto();
                        break;

                    case COMMAND_REGISTER_PRESIDENT_VETO: // params: PARAM_VETO (boolean)
                        verifyIsPresident(name, lobby);
                        boolean veto = message.getBoolean(PARAM_VETO);
                        lobby.game().presidentialVeto(veto);
                        break;

                    case COMMAND_REGISTER_EXECUTION: // params: PARAM_TARGET (String)
                        verifyIsPresident(name, lobby);
                        lobby.game().executePlayer(message.getString(PARAM_TARGET));
                        break;

                    case COMMAND_REGISTER_SPECIAL_ELECTION: // params: PARAM_TARGET (String)
                        verifyIsPresident(name, lobby);
                        lobby.game().electNextPresident(message.getString(PARAM_TARGET));
                        break;

                    case COMMAND_GET_INVESTIGATION: // params: PARAM_TARGET (String)
                        verifyIsPresident(name, lobby);
                        Identity id = lobby.game().investigatePlayer(message.getString(PARAM_TARGET));
                        // Construct and send a JSONObject.
                        JSONObject obj = new JSONObject();
                        obj.put(PARAM_PACKET_TYPE, PACKET_INVESTIGATION);
                        if (id == Identity.FASCIST) {
                            obj.put(PARAM_INVESTIGATION, FASCIST);
                        } else {
                            obj.put(PARAM_INVESTIGATION, LIBERAL);
                        }
                        obj.put(PARAM_TARGET, message.getString(PARAM_TARGET));
                        ctx.send(obj.toString());
                        break;

                    case COMMAND_REGISTER_PEEK:
                        verifyIsPresident(name, lobby);
                        lobby.game().endPeek();
                        break;

                    case COMMAND_END_TERM:
                    case COMMAND_PAUSE_TERM_TIMER:
                    case COMMAND_RESUME_TERM_TIMER:
                        String command = message.getString(PARAM_COMMAND);
                        if (lobby.isLateForTerm(name)) {
                            // The countdown ended this president's term while the command was on its way.
                            logger.info(logMessage + " DROPPED (the END TERM countdown ended the term first)");
                            sendOKMessage = false;
                            updateUsers = false;
                            break;
                        }
                        verifyIsPresident(name, lobby);
                        if (command.equals(COMMAND_END_TERM)) {
                            lobby.game().endPresidentialTerm();
                        } else if (command.equals(COMMAND_PAUSE_TERM_TIMER)) {
                            lobby.pauseTermTimer();
                        } else {
                            lobby.resumeTermTimer();
                        }
                        break;

                    case COMMAND_SELECT_ICON:
                        String iconId = message.getString(PARAM_ICON);
                        lobby.trySetUserIcon(iconId, ctx);
                        break;

                    default: // This is an invalid command.
                        throw new RuntimeException("unrecognized command " + message.get(PARAM_COMMAND));
                } // End switch

                if (sendOKMessage) {
                    logger.debug(logMessage + " SUCCESS");
                    JSONObject msg = new JSONObject();
                    msg.put(PARAM_PACKET_TYPE, PACKET_OK);
                    ctx.send(msg.toString());
                }

            } catch (NullPointerException e) {
                // Show error messages by default, since they indicate API access
                // issues.
                logger.error(logMessage + " FAILED", e);
                ctx.session.close(StatusCode.PROTOCOL, "NullPointerException:" + e.toString());
            } catch (RuntimeException e) {
                logger.error(logMessage + " FAILED", e);
                ctx.session.close(StatusCode.PROTOCOL, "RuntimeException:" + e.toString());
            }
            if (updateUsers) {
                lobby.updateAllUsers();
            }
        }
        hasLobbyChanged = true;
    }

    // TODO: This is bad. This is bad code practice. Exceptions should not be
    // used for control flow.

    /**
     * Verifies that the user is the president.
     *
     * @param name  the seat name of the user's connection ({@code Lobby.seatName}), or null.
     * @param lobby the Lobby that the game is in.
     * @throws RuntimeException if the user is not the president, or there is no game.
     */
    private static void verifyIsPresident(String name, Lobby lobby) {
        if (!lobby.game().getCurrentPresident().equals(name)) {
            throw new RuntimeException("The player '" + name + "' is not currently president.");
        }
    }

    /**
     * Verifies that the user is the chancellor.
     *
     * @param name  the seat name of the user's connection ({@code Lobby.seatName}), or null.
     * @param lobby the Lobby that the game is in.
     * @throws RuntimeException if the user is not the chancellor, or there is no game.
     */
    private static void verifyIsChancellor(String name, Lobby lobby) {
        if (!lobby.game().getCurrentChancellor().equals(name)) {
            throw new RuntimeException("The player '" + name + "' is not currently chancellor.");
        }
    }

    /**
     * Called when a websocket is closed.
     * 
     * @param ctx the WsContext of the websocket.
     * @modifies this
     * @effects Removes the user from any connected lobbies.
     */
    static void onWebSocketClose(WsCloseContext ctx) {
        // One lookup: a connection replaced on another thread may leave the map at any moment.
        Lobby lobby = userToLobby.get(ctx);
        if (lobby != null) {
            synchronized (lobby) {
                if (lobby.isClosed()) {
                    // The sweep closed this connection with its lobby (#64): there is no one to tell.
                } else if (lobby.isSpectator(ctx)) {
                    lobby.removeSpectator(ctx);
                    lobby.sendStateToAll();
                    logger.info("Spectator " + ctx.getSessionId() + " stopped watching ("
                            + lobby.getSpectatorCount() + " watching).");
                } else if (lobby.hasUser(ctx)) {
                    lobby.removeUser(ctx);
                    lobby.updateAllUsers();
                }
            }
            userToLobby.remove(ctx);
        }
    }

    // </editor-fold>

}
