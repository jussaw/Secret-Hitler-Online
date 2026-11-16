package server.util;

import io.javalin.websocket.WsContext;

/**
 * How the lobby tests name their players: the player shown as {@code P1} is the account
 * {@code acct-P1}, so a test that mixes the two up fails.
 */
final class LobbyTesting {
    private LobbyTesting() {
    }

    /** The account of the player shown as {@code name}. */
    static String account(String name) {
        return "acct-" + name;
    }

    /** Adds the connection as the player shown as {@code name}, with no rejoin key. */
    static void join(Lobby lobby, WsContext ctx, String name) {
        lobby.addUser(ctx, account(name), name);
    }

    /** Adds the connection as the player shown as {@code name}, with {@code rejoinKey}. */
    static WsContext join(Lobby lobby, WsContext ctx, String name, String rejoinKey) {
        return lobby.addUser(ctx, account(name), name, rejoinKey);
    }
}
