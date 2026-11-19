package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import io.javalin.Javalin;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import server.accounts.AccountStore;

/**
 * The app {@code main} serves answers on every route as soon as {@code start} returns (#13).
 * Each test starts a fresh app and sends its first request straight away, with no retry. A
 * signed-in session comes from the account store itself, so it costs no request.
 */
public class ServerStartupTest {
    private Javalin app;
    private int port;
    private AccountStore store;
    private AccountStore savedStore;
    private String savedRedirectUri;

    @Before
    public void startServer() {
        savedStore = SecretHitlerServer.accounts;
        store = AccountStore.open(null);
        SecretHitlerServer.accounts = store;
        // A player's socket is checked against the Host it connects to, the origin TestSocket sends.
        savedRedirectUri = ApplicationConfig.DISCORD_REDIRECT_URI;
        ApplicationConfig.DISCORD_REDIRECT_URI = null;
        app = ServerTesting.startOnLoopback(SecretHitlerServer.createApp());
        port = app.port();
    }

    @After
    public void stopServer() {
        app.stop();
        SecretHitlerServer.accounts = savedStore;
        ApplicationConfig.DISCORD_REDIRECT_URI = savedRedirectUri;
        store.close();
    }

    private HttpResponse<String> get(String path) throws Exception {
        return get(path, null);
    }

    /** GETs {@code path} with the session {@code token}'s cookie, or with no cookie when it is null. */
    private HttpResponse<String> get(String path, String token) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (token != null) {
            request.header("Cookie", "session=" + token);
        }
        return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    public void pingAnswersAsSoonAsStartReturns() throws Exception {
        HttpResponse<String> ping = get("/ping");
        assertEquals(200, ping.statusCode());
        assertEquals("OK", ping.body());
    }

    @Test
    public void checkLoginAnswersAsSoonAsStartReturns() throws Exception {
        // 400 for the missing parameters, where an unregistered route would be 404.
        assertEquals(400, get("/check-login").statusCode());
    }

    @Test
    public void newLobbyAnswersAsSoonAsStartReturns() throws Exception {
        String token = TestAccounts.signIn(store, "starter", "Starter");
        HttpResponse<String> newLobby = get("/new-lobby", token);
        try {
            assertEquals(200, newLobby.statusCode());
            assertTrue(SecretHitlerServer.codeToLobby.containsKey(newLobby.body()));
        } finally {
            SecretHitlerServer.codeToLobby.remove(newLobby.body());
        }
    }

    @Test
    public void theGameSocketAnswersAsSoonAsStartReturns() throws Exception {
        // The connect handler closes a signed-in player's socket with no parameters; an
        // unregistered route would refuse the handshake instead.
        String token = TestAccounts.signIn(store, "starter", "Starter");
        TestSocket.CloseInfo close = TestSocket.connect(port, "", token).awaitClose();
        assertEquals(1002, close.code);
        assertEquals("Must have the 'lobby' parameter.", close.reason);
    }
}
