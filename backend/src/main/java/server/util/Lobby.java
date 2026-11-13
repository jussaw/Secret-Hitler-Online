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
 * A user is defined as an active websocket connection.
 */
public class Lobby implements Serializable {
    // The value Java computed for this class before spectators, so backups written by earlier
    // releases still load (DatabaseBackupTest.aBackupFromBeforeSpectatorsStillLoads).
    private static final long serialVersionUID = 7519753883184174211L;

    private SecretHitlerGame game;

    // These two marked transient because they track currently active/connected
    // users.
    transient private ConcurrentHashMap<WsContext, String> userToUsername;
    transient private Queue<String> activeUsernames;
    // Connections watching the lobby without a seat. They have no name, icon or vote, are never
    // counted as users, and are not backed up.
    transient private Set<WsContext> spectators;

    final private Set<String> usersInGame;
    final private ConcurrentHashMap<String, String> usernameToIcon;

    private Set<CpuPlayer> cpuPlayers;

    /* Used to reassign users to previously chosen images if they disconnect */
    final private ConcurrentHashMap<String, String> usernameToPreferredIcon;

    public static long LOBBY_TIMEOUT_DURATION_IN_MIN = 10;
    public static float PLAYER_TIMEOUT_IN_SEC = 3;
    public static float CPU_ACTION_DELAY_IN_SEC = 4;
    private long timeout;

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
        userToUsername = new ConcurrentHashMap<WsContext, String>();
        activeUsernames = new ConcurrentLinkedQueue<>();
        spectators = ConcurrentHashMap.newKeySet();
        usersInGame = new ConcurrentSkipListSet<>();
        usernameToIcon = new ConcurrentHashMap<>();
        usernameToPreferredIcon = new ConcurrentHashMap<>();
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
        Set<WsContext> connections = new HashSet<>(userToUsername.keySet());
        connections.addAll(spectators);
        return connections;
    }

    /**
     * Returns the list of usernames currently in the lobby or game. Includes
     * bot names if the game is running and has bots.
     */
    synchronized public List<String> getUserNames() {
        if (game != null) {
            return game.getPlayerList().stream().map(player -> player.getUsername()).collect(Collectors.toList());
        } else {
            return new ArrayList<String>(userToUsername.values());
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
        return userToUsername.containsKey(context);
    }

    /**
     * Returns whether a user with the given name exists in this lobby.
     * 
     * @param context the Websocket context of the user.
     * @param name    the name of the user.
     * @return true iff {@code context} is a user in the lobby with the name
     *         {@code name}.
     */
    synchronized public boolean hasUser(WsContext context, String name) {
        return userToUsername.containsKey(context) && userToUsername.get(context).equals(name);
    }

    /**
     * Returns true if the lobby has a user with a given username.
     * 
     * @param name the username to check the Lobby for.
     * @return true iff the username {@code name} is in this lobby.
     */
    synchronized public boolean hasUserWithName(String name) {
        return userToUsername.values().contains(name);
    }

    /**
     * Checks if a user can be added back to the lobby while a game is running.
     *
     * @param name the name of the user to add.
     * @return true if the user can be added: they were in the current game and have no live
     *         connection. That includes a player still inside the grace window after a
     *         disconnect ({@code PLAYER_TIMEOUT_IN_SEC}), who is still in {@code activeUsernames}.
     */
    synchronized public boolean canAddUserDuringGame(String name) {
        return usersInGame.contains(name) && !hasUserWithName(name);
    }

    /**
     * Checks if a user would be taking back their own seat: a player of the running game
     * ({@code canAddUserDuringGame}), or outside a game a player who disconnected less than
     * {@code PLAYER_TIMEOUT_IN_SEC} ago. Either way the name has no live connection. Such a user
     * is not refused because the lobby is full or in a game.
     *
     * @param name the name of the user to add.
     * @return true iff the user can rejoin under this name.
     */
    synchronized public boolean canRejoin(String name) {
        if (isInGame()) {
            return canAddUserDuringGame(name);
        }
        return activeUsernames.contains(name) && !hasUserWithName(name);
    }

    /**
     * Checks whether the lobby is full.
     * 
     * @return Returns true if the number of players in the lobby is {@literal >= }
     *         {@code SecretHitlerGame.MAX_PLAYERS}.
     */
    synchronized public boolean isFull() {
        return activeUsernames.size() >= SecretHitlerGame.MAX_PLAYERS;
    }

    /**
     * Adds a user (websocket connection) to the lobby.
     * 
     * @param context the websocket connection context.
     * @param name    the name of the player to be added.
     * @throws IllegalArgumentException if a duplicate websocket is added, if there
     *                                  is already a websocket with the
     *                                  given name in the game, if the lobby is
     *                                  full, if the player has a duplicate name,
     *                                  or if a new player is added during a game.
     * @modifies this
     * @effects adds the given user to the lobby.
     *          If the game has already started, the player can only join if a
     *          player with the name {@name} was
     *          previously in the same game but was removed.
     */
    synchronized public void addUser(WsContext context, String name) {
        if (userToUsername.containsKey(context)) {
            throw new IllegalArgumentException("Duplicate websockets cannot be added to a lobby.");
        } else {
            if (isInGame()) {
                if (canAddUserDuringGame(name)) { // This username is in the game but is not currently connected.
                    // allow the user to be connected.
                    userToUsername.put(context, name);

                    usernameToIcon.put(name, DEFAULT_ICON); // load default icon
                    // Try setting the player's icon using their previous choice
                    if (usernameToPreferredIcon.containsKey(name)) {
                        String iconID = usernameToPreferredIcon.get(name);
                        trySetUserIcon(iconID, context);
                    }
                } else {
                    throw new IllegalArgumentException("Cannot add a new player to a lobby currently in a game.");
                }
            } else {
                if (!isFull() || canRejoin(name)) { // a returning player takes back their own seat
                    if (!hasUserWithName(name)) { // This is a new user with a new name, so we add them to the Lobby.
                        userToUsername.put(context, name);
                        if (!activeUsernames.contains(name)) {
                            activeUsernames.add(name);
                        }
                        // Set icon to default
                        usernameToIcon.put(name, DEFAULT_ICON);
                        // Attempt to retrieve previous icon (if it exists)
                        if (usernameToPreferredIcon.containsKey(name)) {
                            String iconID = usernameToPreferredIcon.get(name);
                            trySetUserIcon(iconID, context);
                        }
                    } else {
                        throw new IllegalArgumentException("Cannot add duplicate names.");
                    }
                } else {
                    throw new IllegalArgumentException("Cannot add the player because the lobby is full.");
                }
            }
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
     *          the lobby.
     */
    synchronized public void removeUser(WsContext context) {
        if (!hasUser(context)) {
            throw new IllegalArgumentException("Cannot remove a websocket that is not in the Lobby.");
        } else {
            // Delay removing players from the list by adding it to a timer.
            int delay_in_ms = (int) (PLAYER_TIMEOUT_IN_SEC * 1000);
            final String username = userToUsername.get(context);

            int timerSchedulingAttempts = 0;
            while (timerSchedulingAttempts < MAX_TIMER_SCHEDULING_ATTEMPTS) {
                try {
                    userTimeoutTimer.schedule(new RemoveUserTask(username), delay_in_ms);
                    break; // exit loop if successful
                } catch (IllegalStateException e) {
                    // Timer hit an error state and must be reset.
                    userTimeoutTimer.cancel();
                    userTimeoutTimer = new Timer();
                    timerSchedulingAttempts++;
                }
            }
            if (timerSchedulingAttempts == MAX_TIMER_SCHEDULING_ATTEMPTS) {
                System.out.println("Failed to schedule removal of the user '" + username + "'.");
            }

            userToUsername.remove(context);
        }
    }

    /**
     * Small helper class for removing users from the active users queue.
     */
    class RemoveUserTask extends TimerTask {
        private final String username;

        RemoveUserTask(String username) {
            this.username = username;
        }

        public void run() {
            // If the user is still disconnected when the task runs, mark them as inactive
            // and
            // remove them from the lobby.
            if (!userToUsername.values().contains(username) && activeUsernames.contains(username)) {
                activeUsernames.remove(username);

                if (usernameToIcon.containsKey(username)) {
                    usernameToIcon.remove(username); // possible for users to disconnect before choosing icon
                }
                updateAllUsers();
            }
        }
    }

    /**
     * Adds a spectator: a connection that watches the lobby and its game without a seat.
     *
     * @param context the websocket connection of the spectator.
     * @throws IllegalArgumentException if the connection is already a player or a spectator.
     */
    synchronized public void addSpectator(WsContext context) {
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
        return activeUsernames.size();
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
        for (Entry<WsContext, String> entry : userToUsername.entrySet()) {
            updateUser(entry.getKey(), entry.getValue());
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

    /** The packet sent outside a game: the players' names. */
    private JSONObject lobbyPacket() {
        JSONObject message = new JSONObject();
        message.put(SecretHitlerServer.PARAM_PACKET_TYPE, SecretHitlerServer.PACKET_LOBBY);
        message.put("usernames", activeUsernames.toArray());
        return message;
    }

    /** Adds the icons and the spectator count, which every packet has, and sends the packet. */
    private void send(WsContext ctx, JSONObject message) {
        // Add user icons to the update message
        JSONObject icons = new JSONObject(usernameToIcon);
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
     * @param ctx the WsContext websocket context.
     * @effects a message containing a JSONObject representing the state of the
     *          SecretHitlerGame is sent
     *          to the specified WsContext. ({@code GameToJSONConverter.convert()})
     */
    synchronized public void updateUser(WsContext ctx, String userName) {
        JSONObject message;
        if (isInGame()) {
            message = GameToJSONConverter.convert(game, userName); // sends the game state
            message.put(SecretHitlerServer.PARAM_PACKET_TYPE, SecretHitlerServer.PACKET_GAME_STATE);
            putTermTimer(message);
        } else {
            message = lobbyPacket();
        }
        send(ctx, message);
    }

    /**
     * Called when an object is deserialized (see Serializable in Java docs).
     * Initializes the userToUsername and activeUsernames, as they are transient
     * objects and not saved during
     * serialization of Lobby.
     * 
     * @param in the Object Input Stream that is reading in the object.
     * @throws IOException
     * @throws ClassNotFoundException
     */
    private void readObject(java.io.ObjectInputStream in) throws IOException, ClassNotFoundException {
        in.defaultReadObject();
        userToUsername = new ConcurrentHashMap<>();
        activeUsernames = new ConcurrentLinkedQueue<>();
        spectators = ConcurrentHashMap.newKeySet();
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

        String username = userToUsername.get(user);
        // Verify that no user has the same icon
        if (!iconID.equals(DEFAULT_ICON)) { // all icons other than the default cannot be shared.
            for (String name : userToUsername.values()) {
                if (usernameToIcon.containsKey(name) && usernameToIcon.get(name).equals(iconID)) {
                    return;
                }
            }
        }

        usernameToIcon.put(username, iconID);
        usernameToPreferredIcon.put(username, iconID);
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
     *          The usernames of all connected users are added to the game in a
     *          randomized order. A user inside the grace window after a disconnect
     *          ({@code PLAYER_TIMEOUT_IN_SEC}) is not seated: the lobby drops them
     *          at once, as {@code RemoveUserTask} would have, keeping their preferred
     *          icon. They find the lobby in a game when they return and can watch it.
     *          A start that throws changes nothing.
     */
    synchronized public void startNewGame() {
        if (isInGame()) {
            throw new RuntimeException("Cannot start a new game while a game is in progress.");
        }

        // Seat only players with a live connection, in join order.
        Set<String> connected = new HashSet<>(userToUsername.values());
        List<String> seated = new ArrayList<>();
        for (String username : activeUsernames) {
            if (connected.contains(username)) {
                seated.add(username);
            }
        }

        if (seated.size() > SecretHitlerGame.MAX_PLAYERS) {
            throw new RuntimeException("Too many users to start a game.");
        }

        // Check that all seated players have (non-default) icons set.
        for (String username : seated) {
            if (usernameToIcon.get(username).equals(DEFAULT_ICON)) {
                throw new RuntimeException("Not all players have selected icons.");
            }
        }

        // Every check passed: drop the players left out, as RemoveUserTask would have.
        for (String username : new ArrayList<>(activeUsernames)) {
            if (!connected.contains(username)) {
                activeUsernames.remove(username);
                usernameToIcon.remove(username);
            }
        }

        usersInGame.clear();
        usersInGame.addAll(userToUsername.values());

        // Generate CpuPlayers if the lobby size has not been met
        List<String> cpuNames = new ArrayList<>();
        cpuPlayers.clear();
        if (usersInGame.size() < SecretHitlerGame.MIN_PLAYERS) {
            int numCpuPlayersToGenerate = SecretHitlerGame.MIN_PLAYERS - usersInGame.size();
            int i = 1;
            while (numCpuPlayersToGenerate > 0) {
                String botName = "Bot " + i;
                if (!userToUsername.containsValue(botName)) {
                    cpuNames.add(botName);
                    cpuPlayers.add(new CpuPlayer(botName));
                    numCpuPlayersToGenerate--;
                }
                i++;
            }
        }

        // Initialize the new game
        List<String> playerNames = new ArrayList<>(activeUsernames);
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
                && usersInGame.contains(game.getCurrentPresident());
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
