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

    /** Starts recording games into the store, as start-up does; {@code stopRecording} after. */
    public static void startRecording(GameStore store) {
        SecretHitlerServer.startRecording(store);
    }

    public static void stopRecording() {
        SecretHitlerServer.stopRecording();
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
