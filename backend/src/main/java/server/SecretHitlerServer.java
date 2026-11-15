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
import server.accounts.Account;
import server.accounts.AccountStore;
import server.accounts.AuthRoutes;
import server.accounts.DiscordSignIn;
import server.accounts.Usernames;
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
    public static final String PARAM_NAME = "name";
    public static final String PARAM_COMMAND = "command";
    public static final String PARAM_TARGET = "target";
    public static final String PARAM_VOTE = "vote";
    public static final String PARAM_VETO = "veto";
    public static final String PARAM_CHOICE = "choice"; // the index of the chosen policy.
    public static final String PARAM_ICON = "icon";
    public static final String PARAM_SPECTATOR = "spectator"; // "true" in the /game and /check-login query
    // Optional, in a player's /game query: a random key the page keeps for its lifetime. A connection
    // that brings the key its name's live connection was opened with takes that connection's place.
    public static final String PARAM_REJOIN_KEY = "rejoinKey";

    // The close code of a connection whose place another connection took (Lobby.addUser).
    public static final int CLOSE_REPLACED = 4001;

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

    // Taken by every rename (renameAccount) and every game start (startGame), always before any
    // lobby's lock and never by a thread that holds a lobby's lock without it, so a game start never
    // falls between a rename's check for seats and its change to the lobbies. Other commands never
    // take it. A database call may run under it, but never under a lobby's lock.
    static final Object ACCOUNTS_LOCK = new Object();
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

    transient private static boolean hasLobbyChanged;

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

    public static void main(String[] args) {
        // On load, check the connected database to see if there's a stored state from
        // the server.
        if (ApplicationConfig.DATABASE_PATH == null || ApplicationConfig.DATABASE_PATH.isBlank()) {
            logger.error("Persistence disabled: no DATABASE_PATH environment variable provided.");
        }
        // The same file as the lobby backup, or memory without one.
        accounts = AccountStore.open(ApplicationConfig.DATABASE_PATH);
        warnAboutSignIn();
        loadDatabaseBackup();
        removeInactiveLobbies(); // immediately clean in case of redundant lobbies.

        // Only initialize Javalin communication after the database has been queried.
        createApp().start(getHerokuAssignedPort());

        // Add hook for termination that backs up the lobbies to the database.
        Runtime.getRuntime().addShutdownHook(new Thread() {
            public void run() {
                logger.info("Attempting to back up lobby data.");
                storeDatabaseBackup();
                printLobbyStatus();
            }
        });

        // Add timer for periodic updates.
        int delayMs = 0;
        int periodMs = (int) (UPDATE_FREQUENCY_SECONDS * 1000.0f);
        Timer timer = new Timer();
        timer.schedule(new TimerTask() {
            @Override
            public void run() {
                removeInactiveLobbies();
                sweepExpiredSessions();
                if (!codeToLobby.isEmpty()) {
                    printLobbyStatus();
                }
                // If there are active lobbies, store a backup of the game.
                if (!codeToLobby.isEmpty() && hasLobbyChanged) {
                    storeDatabaseBackup();
                    hasLobbyChanged = false;
                }
            }
        }, delayMs, periodMs);
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
            return (ConcurrentHashMap<String, Lobby>) in.readObject();
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
     * Determines whether a login is valid.
     * 
     * @param ctx the context of the login request.
     * @requires the context must have the following parameters:
     *           {@code lobby}: the code of the lobby.
     *           {@code name}: the username of the user.
     *           {@code command}: the command
     * @effects Result status is one of the following:
     *          <p>
     *          - 400: if the {@code lobby} or {@code name} parameters are
     *          missing (or blank).
     *          <p>
     *          - 404: if there is no lobby with the given code, or the sweep has
     *          closed it ({@code Lobby.isClosed}).
     *          <p>
     *          - 403: the username is invalid (there is already another user
     *          with that name in the lobby.)
     *          <p>
     *          - 488: the lobby is currently in a game, and the user is not one of
     *          its players with no live connection.
     *          <p>
     *          - 489: the lobby is full, and the user is not taking back their
     *          own seat ({@code Lobby.canRejoin}).
     *          <p>
     *          - 200: Success. There is a lobby with the given name and the
     *          user can open a websocket connection with these login
     *          credentials. This includes a player rejoining the running game
     *          or, inside the grace window after a disconnect, the lobby.
     */
    public static void checkLogin(Context ctx) {
        String lobbyCode = ctx.queryParam(PARAM_LOBBY);
        if ("true".equals(ctx.queryParam(PARAM_SPECTATOR))) {
            checkSpectatorLogin(ctx, lobbyCode);
            return;
        }
        String name = ctx.queryParam(PARAM_NAME);
        if (lobbyCode == null || name == null || name.isBlank()) {
            ctx.status(400);
            ctx.result("Lobby and name must be specified.");
            return;
        }

        // Until players join by account, a player's account is the name they bring.
        String accountId = name;
        // One lookup: the sweep may remove the lobby at any moment. Once closed, a lobby stays closed.
        Lobby lobby = codeToLobby.get(lobbyCode);
        if (lobby == null || lobby.isClosed()) { // lobby does not exist, or the sweep has taken it
            ctx.status(404);
            ctx.result("No such lobby found.");
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
        } else if (lobby.hasAccount(accountId)) { // repeat username.
            ctx.status(403);
            ctx.result("There is already a user with the name '" + name + "' in the lobby.");
        } else { // unique username found. Return OK.
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
     * Called when a websocket connects to the server.
     * 
     * @param ctx the WsConnectContext of the websocket.
     * @requires the context must have the following parameters:
     *           {@code lobby}: a String representing the lobby code.
     *           {@code name}: a String username. Cannot already exist in the given
     *           lobby, unless the connection brings the {@code rejoinKey} that
     *           name's live connection was opened with.
     * @effects Closes the websocket session with 1002 ({@code StatusCode.PROTOCOL})
     *          and a reason if:
     *          <p>
     *          - the {@code lobby} or {@code name} parameters are missing.
     *          <p>
     *          - there is no lobby with the given code.
     *          <p>
     *          - the lobby refuses the connection ({@code Lobby.joinRefusal}): the
     *          sweep has closed it, even if only after this lookup; the name is
     *          blank; there is already another user with that name in the lobby,
     *          and this connection does not bring its {@code rejoinKey}; the lobby
     *          is full, and the user is not taking back their own seat; or the lobby
     *          is in a game, and the user is not a rejoining player.
     *          <p>
     *          Otherwise, connects the user to the lobby. A connection that takes
     *          its name's place closes the old one with {@code CLOSE_REPLACED}.
     *          Connections that arrive at once are checked and added one at a time,
     *          under the lobby's lock.
     */
    static void onWebsocketConnect(WsConnectContext ctx) {
        if ("true".equals(ctx.queryParam(PARAM_SPECTATOR))) {
            connectSpectator(ctx);
            return;
        }
        if (ctx.queryParam(PARAM_LOBBY) == null || ctx.queryParam(PARAM_NAME) == null) {
            logger.debug("A websocket request was missing a parameter and was disconnected.");
            ctx.session.close(StatusCode.PROTOCOL,
                    "Must have the '" + PARAM_LOBBY + "' and '" + PARAM_NAME + "' parameters.");
            return;
        }

        String code = ctx.queryParam(PARAM_LOBBY);
        String name = ctx.queryParam(PARAM_NAME);
        // Until players join by account, a player's account is the name they bring.
        String accountId = name;

        logger.debug("Attempting to connect user '" + name + "' to lobby '" + code + "': ");
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
        // The check and the add are one step under the lobby's lock. Of two connections arriving at
        // once for one name or for the last seat, the second is then refused as it would be had it
        // come later, where between the check and the add it would fail the add's own check (#43).
        Lobby.JoinRefusal refusal;
        WsContext replaced = null;
        synchronized (lobby) {
            refusal = lobby.joinRefusal(accountId, rejoinKey);
            if (refusal == null) {
                replaced = lobby.addUser(ctx, accountId, name, rejoinKey);
                userToLobby.put(ctx, lobby); // keep track of which lobby this connection is in.
                if (replaced != null) {
                    // Forget the old connection first, so its close (whenever it comes) changes nothing.
                    userToLobby.remove(replaced);
                }
            }
        }
        if (refusal != null) {
            logger.debug("FAILED (" + refusal + ")");
            ctx.session.close(StatusCode.PROTOCOL, refusalReason(refusal, code, name));
            return;
        }
        logger.debug("SUCCESS");
        if (replaced != null) {
            replaced.session.close(CLOSE_REPLACED, "Replaced by a newer connection under the same name.");
            logger.info("User '" + name + "' in lobby '" + code + "' reconnected in place of their old connection.");
        }
        lobby.updateAllUsers();
        hasLobbyChanged = true;
    }

    /** The reason a refused player's socket is closed with, for the lobby {@code code}. */
    private static String refusalReason(Lobby.JoinRefusal refusal, String code, String name) {
        return switch (refusal) {
            case CLOSED -> noSuchLobby(code); // timed out, and on its way out of the server
            case NO_ACCOUNT -> "Lobby and name must be specified."; // a blank name, which is the account for now
            case ALREADY_IN -> "A user with the name " + name + " is already in the lobby.";
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
     * Parses a websocket message sent from the user.
     * 
     * @param ctx the WsMessageContext of the websocket.
     * @requires the context must have the following parameters:
     *           {@code lobby}: a String representing the lobby code.
     *           {@code name}: a String username. Cannot already exist in the given
     *           lobby.
     *           {@code command}: a String command.
     * @modifies this
     * @effects Closes the websocket with 1002 ({@code StatusCode.PROTOCOL}) if the
     *          specified lobby does not exist or the sweep has closed it, the user is not allowed
     *          to make this action (usually because they are not a
     *          president/chancellor), if a required parameter is
     *          missing, or the command cannot be executed in this state.
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

        if (message.getString(PARAM_LOBBY) == null
                || message.getString(PARAM_NAME) == null
                || message.getString(PARAM_COMMAND) == null) {
            logger.warn("Message request failed: missing a parameter.");
            ctx.session.close(StatusCode.PROTOCOL, "A required parameter is missing.");
            return;
        }

        String name = message.getString(PARAM_NAME);
        String lobbyCode = message.getString(PARAM_LOBBY);

        String logMessage = "Received a message from user '" + name + "' in lobby '" + lobbyCode + "' ("
                + ctx.message() + "): ";

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
                runPlayerCommand(ctx, message, lobby, name, lobbyCode, logMessage);
            }
        } else {
            runPlayerCommand(ctx, message, lobby, name, lobbyCode, logMessage);
        }
    }

    /**
     * Runs a player's command in their lobby, under the lobby's lock ({@code onWebSocketMessage}).
     * The start-game command's caller holds {@code ACCOUNTS_LOCK} already.
     */
    private static void runPlayerCommand(WsMessageContext ctx, JSONObject message, Lobby lobby, String name,
            String lobbyCode, String logMessage) {
        synchronized (lobby) {
            if (lobby.isClosed()) { // the sweep took it after the lookup (#64)
                logger.debug(logMessage + " FAILED (Lobby requested has timed out)");
                ctx.session.close(StatusCode.PROTOCOL, noSuchLobby(lobbyCode));
                return;
            }
            // Until players join by account, a player's account is the name their handshake
            // brought, and each message must name it.
            if (!lobby.hasUser(ctx) || !name.equals(lobby.accountOf(ctx))) {
                logger.debug(logMessage + " FAILED (Lobby does not have the user)");
                ctx.session.close(StatusCode.PROTOCOL, "The user is not in the lobby " + lobbyCode + ".");
                return;
            }

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
     * @param name  String name of the user.
     * @param lobby the Lobby that the game is in.
     * @throws RuntimeException if the user is not the president.
     */
    private static void verifyIsPresident(String name, Lobby lobby) {
        if (!lobby.game().getCurrentPresident().equals(name)) {
            throw new RuntimeException("The player '" + name + "' is not currently president.");
        }
    }

    /**
     * Verifies that the user is the chancellor.
     * 
     * @param name  String name of the user.
     * @param lobby the Lobby that the game is in.
     * @throws RuntimeException if the user is not the chancellor.
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
