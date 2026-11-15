package server.util;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.fail;
import static server.util.LobbyTesting.account;
import static server.util.LobbyTesting.join;

import java.util.Arrays;
import java.util.List;
import org.junit.Test;

/**
 * #63: the lobby itself refuses a connection with no account, null or blank, before any other
 * refusal, so neither the /game handshake nor any other caller of {@code addUser} can seat one.
 */
public class LobbyNoAccountTest {
    private static final List<String> NO_ACCOUNTS = Arrays.asList(null, "", " ", "  ", "\t");

    @Test
    public void noAccountIsRefusedWithOrWithoutAKey() {
        Lobby lobby = new Lobby();
        for (String accountId : NO_ACCOUNTS) {
            assertEquals("'" + accountId + "'", Lobby.JoinRefusal.NO_ACCOUNT, lobby.joinRefusal(accountId, null));
            assertEquals("'" + accountId + "'", Lobby.JoinRefusal.NO_ACCOUNT, lobby.joinRefusal(accountId, "a-key"));
        }
    }

    @Test
    public void noAccountIsRefusedBeforeAFullLobby() {
        Lobby lobby = new Lobby();
        for (int i = 1; i <= 10; i++) {
            join(lobby, FakeSocket.open().ctx, "P" + i);
        }
        assertEquals(Lobby.JoinRefusal.FULL, lobby.joinRefusal(account("Zed"), null));
        assertEquals(Lobby.JoinRefusal.NO_ACCOUNT, lobby.joinRefusal("  ", null));
        assertEquals(Lobby.JoinRefusal.NO_ACCOUNT, lobby.joinRefusal(null, null));
    }

    @Test
    public void addUserNeverSeatsAConnectionWithNoAccount() {
        Lobby lobby = new Lobby();
        join(lobby, FakeSocket.open().ctx, "Ann");
        for (String accountId : NO_ACCOUNTS) {
            FakeSocket socket = FakeSocket.open();
            try {
                lobby.addUser(socket.ctx, accountId, "Zed");
                fail("'" + accountId + "' was added");
            } catch (IllegalArgumentException expected) {
                // as expected
            }
            assertFalse(lobby.hasAccount(accountId));
            assertFalse(lobby.hasUser(socket.ctx));
        }
        // Nor a blank name, which no account has: the roster would show an empty row.
        for (String name : Arrays.asList(null, "", "  ")) {
            FakeSocket socket = FakeSocket.open();
            try {
                lobby.addUser(socket.ctx, account("Zed"), name);
                fail("the name '" + name + "' was added");
            } catch (IllegalArgumentException expected) {
                // as expected
            }
            assertFalse(lobby.hasAccount(account("Zed")));
            assertFalse(lobby.hasUser(socket.ctx));
        }
        assertEquals(1, lobby.getUserCount());
        assertEquals(List.of("Ann"), lobby.getUserNames());
    }
}
