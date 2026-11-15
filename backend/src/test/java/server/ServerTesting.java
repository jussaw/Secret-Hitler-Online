package server;

import io.javalin.Javalin;
import java.util.HashSet;
import java.util.Set;
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

    /** Starts a game in the lobby as the start-game command does. */
    public static void startGame(Lobby lobby) {
        SecretHitlerServer.startGame(lobby);
    }
}
