package server.util;

import game.CpuPlayer;
import game.GameState;
import game.SecretHitlerGame;
import io.javalin.websocket.WsContext;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import server.SecretHitlerServer;

import java.io.IOException;
import java.io.Serializable;
import java.util.*;
import java.util.Map.Entry;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ConcurrentSkipListSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * A Lobby holds a collection of websocket connections, each representing a
 * player.
 * It maintains the game that the connections are associated with.
 *
 * A user is defined as an active websocket connection. Each one is a player's account, and the
 * lobby keys everything on the account ID: names are kept only to show them, in packets, which
 * stay keyed by name (in a game, by seat name).
 */
public class Lobby implements Serializable {
    // The value Java computed for this class before spectators, so backups written by earlier
    // releases still load (DatabaseBackupTest.aBackupFromBeforeAccountsKeepsIdleLobbies).
    private static final long serialVersionUID = 7519753883184174211L;

    private SecretHitlerGame game;

    // These are transient because they track the connected players.
    // Each player connection's account.
    transient private ConcurrentHashMap<WsContext, String> userToAccount;
    // The accounts in the lobby, in join order (the first is the host), an account inside the
    // grace window after a disconnect included.
    transient private Queue<String> activeAccounts;
    // The current name of each account in activeAccounts, which the lobby packet shows. A restored
    // lobby has no one in it, so names come back as players do.
    transient private ConcurrentHashMap<String, String> accountToName;
    // Connections watching the lobby without a seat. They have no name, icon or vote, are never
    // counted as users, and are not backed up.
    transient private Set<WsContext> spectators;
    // The rejoin key each account's latest connection was opened with (hasLiveConnectionWithKey).
    // Never sent to any client. Not backed up: after a restart no connection is live to be replaced.
    transient private ConcurrentHashMap<String, String> accountToRejoinKey;
    // The removal each account's last disconnect scheduled, while it is pending. An account has at
    // most one, and a new connection for the account calls it off, so every disconnect gets a whole
    // grace window (PLAYER_TIMEOUT_IN_SEC) of its own. Not backed up: no connection outlives a
    // restart.
    transient private ConcurrentHashMap<String, RemoveUserTask> pendingRemovals;

    // The account maps, which are backed up. They are not final, as readObject makes any that a
    // backup lacks: one written before accounts has none of them, and Java drops the name-keyed
    // maps it has, whose fields Lobby no longer has.
    // The running game's human seats: account ID -> seat name. CPU seats have no account.
    private ConcurrentHashMap<String, String> gameSeats;
    // Each account's portrait.
    private ConcurrentHashMap<String, String> accountToIcon;
    /* Used to reassign accounts to previously chosen images if they disconnect */
    private ConcurrentHashMap<String, String> accountToPreferredIcon;
    // Whether readObject found a backup from before accounts: one with none of the account maps.
    transient private boolean backedUpBeforeAccounts;

    private Set<CpuPlayer> cpuPlayers;

    public static long LOBBY_TIMEOUT_DURATION_IN_MIN = 10;
    public static float PLAYER_TIMEOUT_IN_SEC = 3;
    public static float CPU_ACTION_DELAY_IN_SEC = 4;
    private long timeout;
    // Set by the sweep that takes the lobby once it has timed out (closeIfTimedOut). A closed lobby
    // is on its way out of the server: it takes no connection and answers no message. Not backed
    // up, so a restored lobby is open, and the sweep at start-up closes it if it has timed out.
    transient private boolean closed;

    private static Logger logger = LoggerFactory.getLogger(Lobby.class);

    private static int MAX_TIMER_SCHEDULING_ATTEMPTS = 2;
    transient private Timer userTimeoutTimer = new Timer();
    transient private Timer cpuTickTimer = new Timer();

    // The END TERM countdown. While the game waits in POST_LEGISLATIVE for a human president to end
    // their term, it runs on the server for END_TERM_TIMER_IN_SEC and then ends the term itself; the
    // president may pause and resume it. CPU presidents end their own terms at once, so theirs get
    // none. It is kept out of the backup: a lobby restored mid-term starts a new countdown with the
    // first state it sends.
    public static float END_TERM_TIMER_IN_SEC = 10;
    // One thread keeps the time for every lobby and hands each term's end to a pooled thread, which
    // waits for that lobby's lock alone, so a lobby busy sending never delays another's term. The
    // threads are daemons, so they never keep the server up, and pooled ones end when idle.
    private static final ScheduledExecutorService TERM_TIMERS =
            Executors.newSingleThreadScheduledExecutor(daemonThreads("end-term-timers"));
    private static final ExecutorService TERM_ENDS = Executors.newCachedThreadPool(daemonThreads("end-term"));
    // The countdown of the term waiting for END TERM, running or paused, if there is one.
    transient private TermTimer termTimer;
    // When the running countdown ends its term.
    transient private ScheduledFuture<?> termTimerEnd;
    // The countdown that ended the last term, if one did: a command that arrives just after it
    // about the same term is late (isLateForTerm).
    transient private TermTimer expiredTermTimer;

    static String DEFAULT_ICON = "p_default";

    /**
     * Constructs a new Lobby.
     */
    public Lobby() {
        userToAccount = new ConcurrentHashMap<>();
        activeAccounts = new ConcurrentLinkedQueue<>();
        accountToName = new ConcurrentHashMap<>();
        spectators = ConcurrentHashMap.newKeySet();
        accountToRejoinKey = new ConcurrentHashMap<>();
        pendingRemovals = new ConcurrentHashMap<>();
        gameSeats = new ConcurrentHashMap<>();
        accountToIcon = new ConcurrentHashMap<>();
        accountToPreferredIcon = new ConcurrentHashMap<>();
        cpuPlayers = new ConcurrentSkipListSet<>();
        resetTimeout();
    }

    /**
     * Resets the internal timeout for this lobby.
     * 
     * @effects The lobby will time out in {@code TIMEOUT_DURATION_MS} ms from now.
     */
    synchronized public void resetTimeout() {
        // The timeout duration for the server. (currently 30 minutes)
        long MS_PER_MINUTE = 1000 * 60;
        timeout = System.currentTimeMillis() + MS_PER_MINUTE * LOBBY_TIMEOUT_DURATION_IN_MIN;
    }

    /**
     * Returns whether the lobby has timed out.
     * 
     * @return true if the Lobby has timed out.
     */
    synchronized public boolean hasTimedOut() {
        return timeout <= System.currentTimeMillis();
    }

    /**
     * Closes the lobby if it has timed out, as the sweep does before it removes the lobby from the
     * server ({@code SecretHitlerServer.removeInactiveLobbies}). From then on the lobby takes no
     * connection ({@code joinRefusal} is {@code CLOSED}, and {@code addUser} and
     * {@code addSpectator} throw), and the server's handlers, which check {@code isClosed} under
     * the lobby's lock, answer none of its messages. So a handler that looked the lobby up just
     * before the sweep leaves no connection in it, however the two interleave (#64).
     *
     * @return true iff this call closed the lobby: it had timed out, and was not closed already.
     */
    synchronized public boolean closeIfTimedOut() {
        if (closed || !hasTimedOut()) {
            return false;
        }
        closed = true;
        return true;
    }

    /** Returns whether the lobby has timed out and been closed ({@code closeIfTimedOut}). */
    synchronized public boolean isClosed() {
        return closed;
    }

    /**
     * Records a message from a connection. Only players keep the lobby active, so a lobby
     * watched only by spectators times out like an empty one.
     *
     * @param context the websocket connection that sent a message.
     */
    synchronized public void recordActivity(WsContext context) {
        if (hasUser(context)) {
            resetTimeout();
        }
    }

    /**
     * Returns the websocket connections connected to this Lobby.
     * 
     * @return a new set of WsContexts: every player's and every spectator's connection.
     */
    synchronized public Set<WsContext> getConnections() {
        Set<WsContext> connections = new HashSet<>(userToAccount.keySet());
        connections.addAll(spectators);
        return connections;
    }

    /**
     * Returns the list of usernames currently in the lobby or game: the game's seat names,
     * bots included, while a game is running, and otherwise the names of the accounts with a
     * live connection.
     */
    synchronized public List<String> getUserNames() {
        if (game != null) {
            return game.getPlayerList().stream().map(player -> player.getUsername()).collect(Collectors.toList());
        } else {
            return userToAccount.values().stream().map(accountToName::get).collect(Collectors.toList());
        }
    }

    /////// User Management
    // <editor-fold desc="User Management">

    /**
     * Returns whether the given user (websocket connection) is in this lobby
     * 
     * @param context the Websocket context of a user.
     * @return true iff the {@code context} is in this lobby.
     */
    synchronized public boolean hasUser(WsContext context) {
        return userToAccount.containsKey(context);
    }

    /**
     * Returns the account of a player's connection.
     *
     * @param context the Websocket context of a user.
     * @return the account of the player {@code context} is, or null if it is not a player's
     *         connection in this lobby (a spectator's, say).
     */
    synchronized public String accountOf(WsContext context) {
        return userToAccount.get(context);
    }

    /**
     * Returns whether the account has a live connection in this lobby.
     *
     * @param accountId the account to check the Lobby for, or null.
     * @return true iff a connection of {@code accountId} is in this lobby. An account inside
     *         the grace window after a disconnect has none.
     */
    synchronized public boolean hasAccount(String accountId) {
        return accountId != null && userToAccount.containsValue(accountId);
    }

    /**
     * Returns whether the account holds a seat in the running game.
     *
     * @param accountId the account to check, or null.
     * @return true iff a game is running and {@code accountId} has a seat in it.
     */
    synchronized public boolean isSeated(String accountId) {
        return game != null && accountId != null && gameSeats.containsKey(accountId);
    }

    /**
     * Returns the seat of a player's connection in the running game.
     *
     * @param context the Websocket context of a user.
     * @return the seat name of the connection's account while a game runs, or null if there is
     *         no game or the connection has no seat (a spectator's, say).
     */
    synchronized public String seatName(WsContext context) {
        String accountId = userToAccount.get(context);
        return isSeated(accountId) ? gameSeats.get(accountId) : null;
    }

    /**
     * Returns the running game's human seats.
     *
     * @return a new map from seat name to account ID, with no CPU seat; empty outside a game.
     */
    synchronized public Map<String, String> seatAccounts() {
        Map<String, String> seats = new HashMap<>();
        if (game != null) {
            for (Entry<String, String> entry : gameSeats.entrySet()) {
                seats.put(entry.getValue(), entry.getKey());
            }
        }
        return seats;
    }

    /**
     * Gives an account in this lobby a new name. Sends nothing: the caller sends the state.
     *
     * @param accountId the account to rename.
     * @param name      the new name, already checked against the name rules.
     * @return true iff the account is in the lobby (live, or inside the grace window after a
     *         disconnect) and its name changed; false if it is not here or the name is the same.
     * @throws IllegalArgumentException if {@code name} is null or blank. Nothing changes.
     * @throws IllegalStateException if the account has a seat in the running game. Nothing
     *                               changes.
     */
    synchronized public boolean rename(String accountId, String name) {
        if (name == null || name.trim().isEmpty()) {
            throw new IllegalArgumentException("A name cannot be blank.");
        }
        if (isSeated(accountId)) {
            throw new IllegalStateException("A seated account cannot be renamed during a game.");
        }
        if (accountId == null || !activeAccounts.contains(accountId) || name.equals(accountToName.get(accountId))) {
            return false;
        }
        accountToName.put(accountId, name);
        return true;
    }

    /** The account's live connection, or null if it has none. */
    private WsContext connectionOf(String accountId) {
        for (Entry<WsContext, String> entry : userToAccount.entrySet()) {
            if (entry.getValue().equals(accountId)) {
                return entry.getKey();
            }
        }
        return null;
    }

    /**
     * Returns whether the account's live connection was opened with this rejoin key: the same
     * page is reconnecting, so that connection is dead even if the server has not seen it close
     * (a network that dropped without a word reaches the server only at its idle timeout).
     *
     * @param accountId the account of the user.
     * @param rejoinKey the key the new connection brings, or null for none (never empty).
     * @return true iff {@code rejoinKey} is not null, {@code accountId} has a live connection,
     *         and that connection brought the same key.
     */
    synchronized public boolean hasLiveConnectionWithKey(String accountId, String rejoinKey) {
        return rejoinKey != null && hasAccount(accountId) && rejoinKey.equals(accountToRejoinKey.get(accountId));
    }

    /**
     * Checks if a user can be added back to the lobby while a game is running.
     *
     * @param accountId the account of the user to add.
     * @return true if the user can be added: the account holds a seat in the current game and
     *         has no live connection. That includes a player still inside the grace window after
     *         a disconnect ({@code PLAYER_TIMEOUT_IN_SEC}), who is still in {@code activeAccounts}.
     */
    synchronized public boolean canAddUserDuringGame(String accountId) {
        return accountId != null && gameSeats.containsKey(accountId) && !hasAccount(accountId);
    }

    /**
     * Checks if a user would be taking back their own seat: a player of the running game
     * ({@code canAddUserDuringGame}), or outside a game a player who disconnected less than
     * {@code PLAYER_TIMEOUT_IN_SEC} ago. Either way the account has no live connection. Such a
     * user is not refused because the lobby is full or in a game.
     *
     * @param accountId the account of the user to add.
     * @return true iff the account can take back its own seat.
     */
    synchronized public boolean canRejoin(String accountId) {
        if (isInGame()) {
            return canAddUserDuringGame(accountId);
        }
        return activeAccounts.contains(accountId) && !hasAccount(accountId);
    }

    /** Why the lobby refuses a player's connection for an account ({@code joinRefusal}). */
    public enum JoinRefusal {
        /** The lobby has timed out and been closed ({@code closeIfTimedOut}): it takes no one. */
        CLOSED,
        /** The account ID is null, empty or only whitespace: a connection with no account takes no seat (#63). */
        NO_ACCOUNT,
        /** The account has a live connection here already, and this one does not bring its rejoin key. */
        ALREADY_IN,
        /** Every seat is taken, and the account is not taking back its own. */
        FULL,
        /** A game is running, and the account is not one of its players taking back their seat. */
        IN_GAME
    }

    /**
     * Returns why the lobby refuses a player's connection for {@code accountId} that brings
     * {@code rejoinKey}, or null if {@code addUser} takes it. A connection that brings the key of
     * the account's live connection takes that connection's place ({@code hasLiveConnectionWithKey}),
     * and a player taking back their own seat ({@code canRejoin}) is refused neither for a full
     * lobby nor for a game. A closed lobby takes no one. The answer holds until the lobby changes,
     * so a caller that acts on it holds the lobby's lock until the add (#43).
     *
     * @param accountId the account of the user, or null for none.
     * @param rejoinKey the key the connection brings, or null for none (never empty).
     * @return the first refusal that applies, in the order {@code CLOSED}, {@code NO_ACCOUNT},
     *         {@code ALREADY_IN}, {@code FULL}, {@code IN_GAME}, or null.
     */
    synchronized public JoinRefusal joinRefusal(String accountId, String rejoinKey) {
        if (closed) {
            return JoinRefusal.CLOSED;
        }
        if (accountId == null || accountId.isBlank()) {
            return JoinRefusal.NO_ACCOUNT;
        }
        // The page whose connection holds this account, reconnecting: its old connection is dead,
        // though the server may not see that for up to the idle timeout (a phone that changed
        // networks).
        boolean reclaiming = hasLiveConnectionWithKey(accountId, rejoinKey);
        boolean rejoining = reclaiming || canRejoin(accountId);
        if (hasAccount(accountId) && !reclaiming) {
            return JoinRefusal.ALREADY_IN;
        } else if (isFull() && !rejoining) {
            return JoinRefusal.FULL;
        } else if (isInGame() && !rejoining) {
            return JoinRefusal.IN_GAME;
        }
        return null;
    }

    /**
     * Checks whether the lobby is full.
     * 
     * @return Returns true if the number of players in the lobby is {@literal >= }
     *         {@code SecretHitlerGame.MAX_PLAYERS}.
     */
    synchronized public boolean isFull() {
        return activeAccounts.size() >= SecretHitlerGame.MAX_PLAYERS;
    }

    /**
     * Adds a user that brought no rejoin key, as an older client does, so nothing can later take
     * its connection's place: {@code addUser(context, accountId, name, null)}.
     */
    synchronized public void addUser(WsContext context, String accountId, String name) {
        addUser(context, accountId, name, null);
    }

    /**
     * Adds a user (websocket connection) to the lobby, records the account's current name, and
     * remembers the rejoin key the connection brought. A connection that brings the key its
     * account's live connection was opened with ({@code hasLiveConnectionWithKey}) takes that
     * connection's place instead: the account keeps its seat, portrait and place in the lobby,
     * and only the connection changes.
     *
     * @param context   the websocket connection context.
     * @param accountId the account of the player to be added.
     * @param name      the account's current name, which the lobby shows.
     * @param rejoinKey the key the connection brought, or null for none (never empty).
     * @return the connection whose place was taken, which the caller closes, or null.
     * @throws IllegalArgumentException if a duplicate websocket is added, if the lobby refuses
     *                                  the connection ({@code joinRefusal} is not null), or if
     *                                  {@code name} is null or blank. The lobby is unchanged.
     * @modifies this
     * @effects adds the given user to the lobby.
     *          If the game has already started, the player can only join if their
     *          account holds a seat in it.
     */
    synchronized public WsContext addUser(WsContext context, String accountId, String name, String rejoinKey) {
        if (userToAccount.containsKey(context)) {
            throw new IllegalArgumentException("Duplicate websockets cannot be added to a lobby.");
        }
        JoinRefusal refusal = joinRefusal(accountId, rejoinKey);
        if (refusal != null) {
            throw new IllegalArgumentException("Cannot add the account '" + accountId + "' to the lobby: " + refusal + ".");
        }
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Cannot add the account '" + accountId + "' without a name.");
        }
        if (hasLiveConnectionWithKey(accountId, rejoinKey)) {
            WsContext replaced = connectionOf(accountId);
            userToAccount.remove(replaced);
            userToAccount.put(context, accountId);
            accountToName.put(accountId, name);
            return replaced;
        }
        addNewConnection(context, accountId, name);
        cancelPendingRemoval(accountId); // back inside the window: the account keeps its place
        if (rejoinKey == null) {
            accountToRejoinKey.remove(accountId); // an older client: nothing can take its place
        } else {
            accountToRejoinKey.put(accountId, rejoinKey);
        }
        return null;
    }

    /**
     * Adds a new connection for the account, which has none live: rejoining the running game,
     * taking back a seat inside the grace window, or taking a free seat in the lobby. An account
     * still inside the grace window keeps its place in the lobby; any other takes the last place.
     * That includes a player back in the running game after the window, or after a restore from
     * a backup (which keeps no one in the lobby), so they are counted at once, and listed and
     * seated when the game ends (#41). The caller has checked that the lobby takes the
     * connection ({@code joinRefusal}).
     */
    private void addNewConnection(WsContext context, String accountId, String name) {
        userToAccount.put(context, accountId);
        if (!activeAccounts.contains(accountId)) {
            activeAccounts.add(accountId);
        }
        accountToName.put(accountId, name);
        // Start on the default icon, then try the player's previous choice, if they made one.
        accountToIcon.put(accountId, DEFAULT_ICON);
        if (accountToPreferredIcon.containsKey(accountId)) {
            trySetUserIcon(accountToPreferredIcon.get(accountId), context);
        }
    }

    /**
     * Removes a user from the Lobby.
     *
     * @param context the websocket connection context of the player to remove.
     * @throws IllegalArgumentException if {@code context} is not a user in the
     *                                  Lobby.
     * @modifies this
     * @effects removes the user context (websocket connection) of the player from
     *          the lobby. The account keeps its place for {@code PLAYER_TIMEOUT_IN_SEC},
     *          counted from this disconnect, and loses it then unless a connection
     *          for the account has called the removal off.
     */
    synchronized public void removeUser(WsContext context) {
        if (!hasUser(context)) {
            throw new IllegalArgumentException("Cannot remove a websocket that is not in the Lobby.");
        } else {
            // Delay removing players from the list by adding it to a timer.
            int delay_in_ms = (int) (PLAYER_TIMEOUT_IN_SEC * 1000);
            final String accountId = userToAccount.get(context);
            RemoveUserTask removal = new RemoveUserTask(accountId);
            pendingRemovals.put(accountId, removal);

            int timerSchedulingAttempts = 0;
            while (timerSchedulingAttempts < MAX_TIMER_SCHEDULING_ATTEMPTS) {
                try {
                    userTimeoutTimer.schedule(removal, delay_in_ms);
                    break; // exit loop if successful
                } catch (IllegalStateException e) {
                    // Timer hit an error state and must be reset.
                    userTimeoutTimer.cancel();
                    userTimeoutTimer = new Timer();
                    timerSchedulingAttempts++;
                }
            }
            if (timerSchedulingAttempts == MAX_TIMER_SCHEDULING_ATTEMPTS) {
                pendingRemovals.remove(accountId, removal);
                System.out.println("Failed to schedule removal of the account '" + accountId + "'.");
            }

            userToAccount.remove(context);
        }
    }

    /** Calls off the removal the account's last disconnect scheduled, if it is still pending. */
    private void cancelPendingRemoval(String accountId) {
        RemoveUserTask removal = pendingRemovals.remove(accountId);
        if (removal != null) {
            removal.cancel();
        }
    }

    /**
     * Removes an account from the lobby when the grace window after its disconnect ends, unless
     * the removal has been called off since.
     */
    class RemoveUserTask extends TimerTask {
        private final String accountId;

        RemoveUserTask(String accountId) {
            this.accountId = accountId;
        }

        public void run() {
            // Under the lobby's lock, so a rejoin under way as the window ends either finishes
            // first, and the player is kept, or starts after the removal and adds them back.
            synchronized (Lobby.this) {
                // A removal that fell due as the account rejoined was called off too late to stop
                // it, so it checks that it is still the account's pending one. If not, the account
                // came back since, and any later disconnect has a window of its own (#42).
                if (!pendingRemovals.remove(accountId, this)) {
                    return;
                }
                // If the user is still disconnected when the task runs, mark them as inactive
                // and remove them from the lobby.
                if (!userToAccount.containsValue(accountId) && activeAccounts.contains(accountId)) {
                    activeAccounts.remove(accountId);
                    accountToName.remove(accountId);
                    accountToRejoinKey.remove(accountId);
                    accountToIcon.remove(accountId); // possible for users to disconnect before choosing icon
                    updateAllUsers();
                }
            }
        }
    }

    /**
     * Adds a spectator: a connection that watches the lobby and its game without a seat.
     *
     * @param context the websocket connection of the spectator.
     * @throws IllegalArgumentException if the connection is already a player or a spectator, or
     *                                  the lobby is closed ({@code closeIfTimedOut}), as
     *                                  {@code addUser} throws for a connection it refuses.
     */
    synchronized public void addSpectator(WsContext context) {
        if (closed) {
            throw new IllegalArgumentException("Cannot add a spectator to the lobby: " + JoinRefusal.CLOSED + ".");
        }
        if (hasUser(context) || spectators.contains(context)) {
            throw new IllegalArgumentException("This websocket is already in the Lobby.");
        }
        spectators.add(context);
    }

    /**
     * Removes a spectator.
     *
     * @param context the websocket connection of the spectator.
     * @throws IllegalArgumentException if the connection is not a spectator of this Lobby.
     */
    synchronized public void removeSpectator(WsContext context) {
        if (!spectators.remove(context)) {
            throw new IllegalArgumentException("Cannot remove a websocket that is not a spectator.");
        }
    }

    /** Returns whether the connection is a spectator of this Lobby. */
    synchronized public boolean isSpectator(WsContext context) {
        return spectators.contains(context);
    }

    /** Returns the number of spectators watching the Lobby. */
    synchronized public int getSpectatorCount() {
        return spectators.size();
    }

    /**
     * Returns the number of active users connected to the Lobby.
     * 
     * @return the number of active websocket connections currently in the lobby.
     */
    synchronized public int getUserCount() {
        return activeAccounts.size();
    }

    /**
     * Sends a message to every connected user with the current game state.
     * 
     * @effects a message containing a JSONObject representing the state of the
     *          SecretHitlerGame is sent
     *          to each connected WsContext.
     *          ({@code GameToJSONConverter.convert()}). Also
     *          updates all connected CpuPlayers after a set amount of time.
     */
    synchronized public void updateAllUsers() {
        // Spectators are sent the state here too, so they get a finished game before it is cleared.
        sendStateToAll();

        // Check if the game ended.
        if (game != null && game.hasGameFinished()) {
            game = null;
            gameSeats.clear();
            cpuPlayers.clear();
        }

        // Update all the CpuPlayers so they can act
        boolean didCpuUpdateState = false;
        if (isInGame()) {
            // Update all CPUs before allowing them to start acting
            for (CpuPlayer cpu : cpuPlayers) {
                cpu.update(game);
            }
            for (CpuPlayer cpu : cpuPlayers) {
                if (game.getState() == GameState.CHANCELLOR_VOTING) {
                    // We're in a voting step, so it doesn't matter if the CPU is
                    // acting unless the gamestate changes.
                    boolean stateUpdated = cpu.act(game);
                    // Did acting cause voting to end?
                    if (stateUpdated && game.getState() != GameState.CHANCELLOR_VOTING) {
                        didCpuUpdateState = true;
                        break;
                    }
                } else {
                    if (cpu.act(game)) {
                        didCpuUpdateState = true;
                        break;
                    }
                }
            }
        }

        if (didCpuUpdateState) {
            int delay_in_ms = (int) (CPU_ACTION_DELAY_IN_SEC * 1000);
            int timerSchedulingAttempts = 0;
            // Make multiple attempts to schedule the timer.
            while (timerSchedulingAttempts < MAX_TIMER_SCHEDULING_ATTEMPTS) {
                try {
                    cpuTickTimer.schedule(new updateUsersTask(), delay_in_ms);
                    break;
                } catch (IllegalStateException e) {
                    // Timer hit an error state and must be reset.
                    cpuTickTimer.cancel();
                    cpuTickTimer = new Timer();
                    timerSchedulingAttempts++;
                }
            }
            if (timerSchedulingAttempts == MAX_TIMER_SCHEDULING_ATTEMPTS) {
                logger.error("Failed to schedule timer for CPU ticks.");
            }
        }
    }

    /**
     * Small helper class for removing users from the active users queue.
     */
    class updateUsersTask extends TimerTask {
        public void run() {
            updateAllUsers();
        }
    }

    /**
     * Sends the current state to every player and spectator, without letting CPU players act.
     */
    synchronized public void sendStateToAll() {
        for (Entry<WsContext, String> entry : userToAccount.entrySet()) {
            updatePlayer(entry.getKey(), entry.getValue());
        }
        for (WsContext spectator : spectators) {
            updateSpectator(spectator);
        }
    }

    /**
     * Sends a spectator the current state: the lobby packet, or during a game the state with no
     * secrets ({@code GameToJSONConverter.convertForSpectator()}).
     *
     * @param ctx the spectator's websocket context.
     */
    synchronized public void updateSpectator(WsContext ctx) {
        JSONObject message;
        if (isInGame()) {
            message = GameToJSONConverter.convertForSpectator(game);
            message.put(SecretHitlerServer.PARAM_PACKET_TYPE, SecretHitlerServer.PACKET_GAME_STATE);
            putTermTimer(message);
        } else {
            message = lobbyPacket();
        }
        send(ctx, message);
    }

    /** The packet sent outside a game: the names of the accounts in the lobby, in join order. */
    private JSONObject lobbyPacket() {
        JSONObject message = new JSONObject();
        message.put(SecretHitlerServer.PARAM_PACKET_TYPE, SecretHitlerServer.PACKET_LOBBY);
        message.put("usernames", activeAccounts.stream().map(accountToName::get).toArray());
        return message;
    }

    /**
     * The players' portraits, keyed by the names packets show: in a game by seat name, and
     * otherwise by each account's current name. A CPU seat has no account, and so no portrait.
     */
    private Map<String, String> iconsByName() {
        Map<String, String> names = isInGame() ? gameSeats : accountToName;
        Map<String, String> icons = new HashMap<>();
        for (Entry<String, String> entry : names.entrySet()) {
            String icon = accountToIcon.get(entry.getKey());
            if (icon != null) {
                icons.put(entry.getValue(), icon);
            }
        }
        return icons;
    }

    /** Adds the icons and the spectator count, which every packet has, and sends the packet. */
    private void send(WsContext ctx, JSONObject message) {
        // Add user icons to the update message
        JSONObject icons = new JSONObject(iconsByName());
        message.put("icon", icons);
        message.put(SecretHitlerServer.PARAM_SPECTATOR_COUNT, spectators.size());

        try {
            ctx.send(message.toString());
        } catch (Exception e) {
            // Jetty throws for a connection that closed before its onClose removed it from this
            // lobby. That must not stop the broadcast for everyone else, or the CPU step after it.
            logger.debug("Could not send to a closed connection: " + e);
        }
    }

    /**
     * Sends a message to the specified user with the current game state.
     *
     * @param ctx the WsContext websocket context of a player.
     * @throws IllegalArgumentException if {@code ctx} is not a player's connection in this lobby.
     * @effects a message containing a JSONObject representing the state of the
     *          SecretHitlerGame is sent
     *          to the specified WsContext. ({@code GameToJSONConverter.convert()})
     */
    synchronized public void updateUser(WsContext ctx) {
        String accountId = userToAccount.get(ctx);
        if (accountId == null) {
            throw new IllegalArgumentException("User is not in this lobby.");
        }
        updatePlayer(ctx, accountId);
    }

    /** Sends the player's connection the state: the lobby packet, or in a game the game as their seat sees it. */
    private void updatePlayer(WsContext ctx, String accountId) {
        JSONObject message;
        if (isInGame()) {
            message = GameToJSONConverter.convert(game, gameSeats.get(accountId)); // sends the game state
            message.put(SecretHitlerServer.PARAM_PACKET_TYPE, SecretHitlerServer.PACKET_GAME_STATE);
            putTermTimer(message);
        } else {
            message = lobbyPacket();
        }
        String you = isInGame() ? gameSeats.get(accountId) : accountToName.get(accountId);
        message.put(SecretHitlerServer.PARAM_YOU, you);
        send(ctx, message);
    }

    /**
     * Called when an object is deserialized (see Serializable in Java docs).
     * Initializes the transient fields, which are not saved during serialization of Lobby, and
     * any backed-up map the stream lacks. A backup written before accounts has none of
     * {@code gameSeats}, {@code accountToIcon} and {@code accountToPreferredIcon} (Java drops the
     * name-keyed maps it has, whose fields Lobby no longer has), so they start empty, and
     * {@code backedUpBeforeAccounts} records it.
     *
     * @param in the Object Input Stream that is reading in the object.
     * @throws IOException
     * @throws ClassNotFoundException
     */
    private void readObject(java.io.ObjectInputStream in) throws IOException, ClassNotFoundException {
        in.defaultReadObject();
        backedUpBeforeAccounts = gameSeats == null || accountToIcon == null || accountToPreferredIcon == null;
        if (gameSeats == null) {
            gameSeats = new ConcurrentHashMap<>();
        }
        if (accountToIcon == null) {
            accountToIcon = new ConcurrentHashMap<>();
        }
        if (accountToPreferredIcon == null) {
            accountToPreferredIcon = new ConcurrentHashMap<>();
        }
        userToAccount = new ConcurrentHashMap<>();
        activeAccounts = new ConcurrentLinkedQueue<>();
        accountToName = new ConcurrentHashMap<>();
        spectators = ConcurrentHashMap.newKeySet();
        accountToRejoinKey = new ConcurrentHashMap<>();
        pendingRemovals = new ConcurrentHashMap<>();
        userTimeoutTimer = new Timer();
        cpuTickTimer = new Timer();
    }

    /**
     * Attempts to set the player's icon to the given iconID and returns whether it
     * was set.
     * 
     * @param iconID the ID of the new icon to give the player.
     * @param user   the user to change the icon of.
     * @effects If no other user has the given {@code iconID}, sets the icon of the
     *          {@code user}
     *          to {@code iconID}. (exception is for the default value.)
     * @throws IllegalArgumentException if {@code user} is not in the game.
     */
    synchronized public void trySetUserIcon(String iconID, WsContext user) {
        // Verify that the user exists.
        if (!hasUser(user)) {
            throw new IllegalArgumentException("User is not in this lobby.");
        }

        String accountId = userToAccount.get(user);
        // Verify that no user has the same icon
        if (!iconID.equals(DEFAULT_ICON)) { // all icons other than the default cannot be shared.
            for (String other : userToAccount.values()) {
                if (iconID.equals(accountToIcon.get(other))) {
                    return;
                }
            }
        }

        accountToIcon.put(accountId, iconID);
        accountToPreferredIcon.put(accountId, iconID);
    }

    // </editor-fold>

    ////// Game Management
    // <editor-fold desc="Game Management">

    /**
     * Returns whether the Lobby is currently in a game.
     * 
     * @return true iff the Lobby has a currently active game.
     */
    synchronized public boolean isInGame() {
        return game != null;
    }

    /**
     * @return whether this lobby was restored from a backup written before accounts, which has no
     *         account maps: its game's seats belong to typed names that no account can take back.
     */
    synchronized public boolean wasBackedUpBeforeAccounts() {
        return backedUpBeforeAccounts;
    }

    /**
     * Starts a new SecretHitlerGame with the connected users as players.
     * 
     * @throws RuntimeException if there are an insufficient number of players to
     *                          start a game, if there are too
     *                          many in the lobby, or if the lobby is in a game
     *                          ({@code isInGame() == true}). Also throws exception
     *                          if
     *                          not all players have selected an icon.
     * @modifies this
     * @effects creates and stores a new SecretHitlerGame.
     *          Each connected account is seated under its current name, in a
     *          randomized order, and {@code gameSeats} records the seats. A user inside the
     *          grace window after a disconnect ({@code PLAYER_TIMEOUT_IN_SEC}) is not seated:
     *          the lobby drops them at once, as {@code RemoveUserTask} would have, keeping
     *          their preferred icon. They find the lobby in a game when they return and can
     *          watch it. A start that throws changes nothing.
     */
    synchronized public void startNewGame() {
        if (isInGame()) {
            throw new RuntimeException("Cannot start a new game while a game is in progress.");
        }

        // Seat only players with a live connection, in join order.
        Set<String> connected = new HashSet<>(userToAccount.values());
        List<String> seated = new ArrayList<>();
        for (String accountId : activeAccounts) {
            if (connected.contains(accountId)) {
                seated.add(accountId);
            }
        }

        if (seated.size() > SecretHitlerGame.MAX_PLAYERS) {
            throw new RuntimeException("Too many users to start a game.");
        }

        // Check that all seated players have (non-default) icons set.
        for (String accountId : seated) {
            if (accountToIcon.get(accountId).equals(DEFAULT_ICON)) {
                throw new RuntimeException("Not all players have selected icons.");
            }
        }

        // Every check passed: drop the players left out, as RemoveUserTask would have.
        for (String accountId : new ArrayList<>(activeAccounts)) {
            if (!connected.contains(accountId)) {
                activeAccounts.remove(accountId);
                accountToName.remove(accountId);
                accountToIcon.remove(accountId);
            }
        }

        // Each seat keeps the name its account has now until the game ends.
        gameSeats.clear();
        List<String> playerNames = new ArrayList<>();
        for (String accountId : seated) {
            String seatName = accountToName.get(accountId);
            gameSeats.put(accountId, seatName);
            playerNames.add(seatName);
        }

        // Generate CpuPlayers if the lobby size has not been met
        List<String> cpuNames = new ArrayList<>();
        cpuPlayers.clear();
        if (gameSeats.size() < SecretHitlerGame.MIN_PLAYERS) {
            int numCpuPlayersToGenerate = SecretHitlerGame.MIN_PLAYERS - gameSeats.size();
            int i = 1;
            while (numCpuPlayersToGenerate > 0) {
                String botName = "Bot " + i;
                if (!gameSeats.containsValue(botName)) {
                    cpuNames.add(botName);
                    cpuPlayers.add(new CpuPlayer(botName));
                    numCpuPlayersToGenerate--;
                }
                i++;
            }
        }

        // Initialize the new game
        playerNames.addAll(cpuNames);
        Collections.shuffle(playerNames);

        game = new SecretHitlerGame(playerNames);

        // Initialize all of the CpuPlayers
        for (CpuPlayer cpu : cpuPlayers) {
            cpu.initialize(game);
        }
    }

    /**
     * Returns the current game.
     * 
     * @throws RuntimeException if called when there is no active game
     *                          ({@code !this.isInGame()}).
     * @return the SecretHitlerGame for this lobby.
     */
    synchronized public SecretHitlerGame game() {
        if (game == null) {
            throw new RuntimeException();
        } else {
            return game;
        }
    }

    // </editor-fold>

    ////// END TERM Countdown
    // <editor-fold desc="END TERM Countdown">

    /** The current time in ms, from a clock that never goes back. */
    private static long nowMs() {
        return TimeUnit.NANOSECONDS.toMillis(System.nanoTime());
    }

    /** Makes daemon threads named {@code name}. */
    private static ThreadFactory daemonThreads(String name) {
        return task -> {
            Thread thread = new Thread(task, name);
            thread.setDaemon(true);
            return thread;
        };
    }

    /**
     * Starts the END TERM countdown when the game waits for a human president to end the term,
     * and drops a countdown whose term is over. Every game packet calls this before it reads the
     * countdown, so each one shows the countdown of the game it carries.
     */
    private void syncTermTimer() {
        if (expiredTermTimer != null && expiredTermTimer.game != game) {
            expiredTermTimer = null; // its game is over: no command can be late for it now
        }
        boolean waiting = game != null && game.getState() == GameState.POST_LEGISLATIVE
                && gameSeats.containsValue(game.getCurrentPresident());
        if (termTimer != null && !(waiting && termTimer.isFor(game, game.getRound()))) {
            stopTermTimer();
        }
        if (waiting && termTimer == null) {
            termTimer = new TermTimer(game, game.getRound(), game.getCurrentPresident(),
                    (long) (END_TERM_TIMER_IN_SEC * 1000), Lobby::nowMs);
            scheduleTermEnd();
        }
    }

    /** Ends the running countdown's term when its time is up, in place of any end scheduled before. */
    private void scheduleTermEnd() {
        cancelTermEnd();
        TermTimer timer = termTimer;
        termTimerEnd = TERM_TIMERS.schedule(() -> TERM_ENDS.execute(() -> endTermOnTime(timer)),
                timer.remainingMs(), TimeUnit.MILLISECONDS);
    }

    /** Cancels the end of the term, if it is scheduled. */
    private void cancelTermEnd() {
        if (termTimerEnd != null) {
            termTimerEnd.cancel(false);
            termTimerEnd = null;
        }
    }

    private void stopTermTimer() {
        cancelTermEnd();
        termTimer = null;
    }

    /**
     * Ends {@code timer}'s term, as END TERM would, and sends everyone the new state. Does nothing
     * if the countdown has been paused or dropped since this was scheduled: the term ended
     * another way, or another term or game is under way.
     */
    private synchronized void endTermOnTime(TermTimer timer) {
        if (timer != termTimer || timer.isPaused()) {
            return;
        }
        if (timer.remainingMs() > 0) { // woken a little early
            scheduleTermEnd();
            return;
        }
        termTimerEnd = null;
        termTimer = null;
        try {
            if (game != null && timer.isFor(game, game.getRound()) && game.getState() == GameState.POST_LEGISLATIVE) {
                game.endPresidentialTerm();
                expiredTermTimer = timer;
                logger.info("The END TERM countdown ended " + timer.president + "'s term.");
                updateAllUsers();
            }
        } catch (RuntimeException e) {
            logger.error("Could not end " + timer.president + "'s term when its countdown ran out.", e);
        }
    }

    /**
     * Pauses the END TERM countdown, which then keeps the term open until the president resumes
     * it or ends the term. Pausing it again changes nothing.
     *
     * @throws IllegalStateException if the game is not waiting for a human president to end the
     *                               term, so there is no countdown.
     */
    synchronized public void pauseTermTimer() {
        syncTermTimer();
        if (termTimer == null) {
            throw new IllegalStateException("There is no END TERM countdown to pause.");
        }
        termTimer.pause();
        cancelTermEnd();
    }

    /**
     * Runs a paused END TERM countdown on from the time it had left. Resuming a running countdown
     * changes nothing.
     *
     * @throws IllegalStateException if there is no countdown, as for {@code pauseTermTimer}.
     */
    synchronized public void resumeTermTimer() {
        syncTermTimer();
        if (termTimer == null) {
            throw new IllegalStateException("There is no END TERM countdown to resume.");
        }
        if (termTimer.isPaused()) {
            termTimer.resume();
            scheduleTermEnd();
        }
    }

    /**
     * Whether a command about the term from {@code name} (END TERM, pause or resume) came too
     * late: the countdown ended {@code name}'s term just before it arrived, and the game has not
     * since come back to {@code name} at END TERM (as it can after a special election). The
     * president sent it in good faith, so the server drops it instead of refusing it.
     */
    synchronized public boolean isLateForTerm(String name) {
        TermTimer expired = expiredTermTimer;
        if (expired == null || game != expired.game || game.getRound() != expired.round + 1
                || !expired.president.equals(name)) {
            return false;
        }
        return !(game.getState() == GameState.POST_LEGISLATIVE && name.equals(game.getCurrentPresident()));
    }

    /**
     * Adds the END TERM countdown to a game packet while there is one: {@code remainingMs}, the
     * time it has left, and {@code paused}.
     */
    private void putTermTimer(JSONObject message) {
        syncTermTimer();
        if (termTimer != null) {
            JSONObject countdown = new JSONObject();
            countdown.put("remainingMs", termTimer.remainingMs());
            countdown.put("paused", termTimer.isPaused());
            message.put(SecretHitlerServer.PARAM_TERM_TIMER, countdown);
        }
    }

    // </editor-fold>

}
