package server.util;

import static org.junit.Assert.fail;

import io.javalin.websocket.WsContext;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;

/**
 * How the lobby tests name their players: the player shown as {@code P1} is the account
 * {@code acct-P1}, so a test that mixes the two up fails. Also the helpers several lobby tests
 * share.
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

    /** A packet's array of names, such as its {@code usernames} or {@code bots}, as a list. */
    static List<String> strings(JSONArray array) {
        List<String> out = new ArrayList<>();
        for (int i = 0; i < array.length(); i++) {
            out.add(array.getString(i));
        }
        return out;
    }

    /** Waits up to 5 s for the lobby to count {@code count} players. */
    static void waitForUserCount(Lobby lobby, int count) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5000;
        while (lobby.getUserCount() != count) {
            if (System.currentTimeMillis() > deadline) {
                fail("the lobby still counted " + lobby.getUserCount() + " players after 5 s, not " + count);
            }
            Thread.sleep(10);
        }
    }
}
