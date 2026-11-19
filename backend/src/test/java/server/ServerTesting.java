package server;

import io.javalin.Javalin;
import java.util.HashSet;
import java.util.Set;
import java.util.Map;
import server.stats.GameStore;
import server.util.Lobby;

/** The server's package-private parts that tests in other packages (server.accounts) need. */
public final class ServerTesting {
    private ServerTesting() {
    }

    /** The server's app, with every route, not yet started. */
    public static Javalin createApp() {
        return SecretHitlerServer.createApp();
    }

    /**
     * The address every test server listens on (#106). The server itself listens on every address,
     * but a test's must not: macOS lets a bind to every address take a port that another program's
     * socket holds on 127.0.0.1, which then answers the tests' {@code localhost}. It refuses a bind
     * to 127.0.0.1 on such a port, so a test server started here is never handed one. The tests
     * still reach it at {@code localhost}, which Java resolves to 127.0.0.1 first.
     */
    public static final String LOOPBACK = "127.0.0.1";

    /** Starts a test server: the app on {@link #LOOPBACK}, on any free port. */
    public static Javalin startOnLoopback(Javalin app) {
        return startOnLoopback(app, 0);
    }

    /** Starts the app on {@link #LOOPBACK}, on this port. */
    static Javalin startOnLoopback(Javalin app, int port) {
        return app.start(LOOPBACK, port);
    }

    /** The codes of the lobbies the server has now. */
    public static Set<String> lobbyCodes() {
        return new HashSet<>(SecretHitlerServer.codeToLobby.keySet());
    }

    public static void putLobby(String code, Lobby lobby) {
        SecretHitlerServer.codeToLobby.put(code, lobby);
    }

    public static void removeLobby(String code) {
        SecretHitlerServer.codeToLobby.remove(code);
    }

    /** Whether a lobby has been marked changed since the last backup (or {@code clearLobbiesChanged}). */
    public static boolean lobbiesChanged() {
        return SecretHitlerServer.hasLobbyChanged;
    }

    public static void clearLobbiesChanged() {
        SecretHitlerServer.hasLobbyChanged = false;
    }

    /** Drops each of the lobbies' games that has a record in the store, as start-up does. */
    public static void dropRecordedGames(Map<String, Lobby> lobbies, GameStore store) {
        SecretHitlerServer.dropRecordedGames(lobbies, store);
    }

    /** The server's start-up before it listens: recording, the backup, the drop, the sweep. */
    public static void startUp(GameStore store) {
        SecretHitlerServer.startUp(store);
    }

    /** The 60 s timer's work. */
    public static void everyMinute() {
        SecretHitlerServer.everyMinute();
    }

    /** The shutdown hook's work. */
    public static void onShutdown() {
        SecretHitlerServer.onShutdown();
    }

    /** Starts a game in the lobby as the start-game command does. */
    public static void startGame(Lobby lobby) {
        SecretHitlerServer.startGame(lobby);
    }
}
