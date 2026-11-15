package server.util;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.fail;

import java.util.List;
import org.junit.Test;

/**
 * #63: the lobby itself refuses a blank name, before any other refusal, so neither the /game
 * handshake nor any other caller of {@code addUser} can seat one.
 */
public class LobbyBlankNameTest {
    private static final List<String> BLANK_NAMES = List.of("", " ", "  ", "\t");

    @Test
    public void aBlankNameIsRefusedWithOrWithoutAKey() {
        Lobby lobby = new Lobby();
        for (String name : BLANK_NAMES) {
            assertEquals("'" + name + "'", Lobby.JoinRefusal.BLANK_NAME, lobby.joinRefusal(name, null));
            assertEquals("'" + name + "'", Lobby.JoinRefusal.BLANK_NAME, lobby.joinRefusal(name, "a-key"));
        }
    }

    @Test
    public void aBlankNameIsRefusedBeforeAFullLobby() {
        Lobby lobby = new Lobby();
        for (int i = 1; i <= 10; i++) {
            lobby.addUser(FakeSocket.open().ctx, "P" + i);
        }
        assertEquals(Lobby.JoinRefusal.FULL, lobby.joinRefusal("Zed", null));
        assertEquals(Lobby.JoinRefusal.BLANK_NAME, lobby.joinRefusal("  ", null));
    }

    @Test
    public void addUserNeverSeatsABlankName() {
        Lobby lobby = new Lobby();
        lobby.addUser(FakeSocket.open().ctx, "Ann");
        for (String name : BLANK_NAMES) {
            try {
                lobby.addUser(FakeSocket.open().ctx, name);
                fail("'" + name + "' was added");
            } catch (IllegalArgumentException expected) {
                // as expected
            }
            assertFalse(lobby.hasUserWithName(name));
        }
        assertEquals(1, lobby.getUserCount());
    }
}
