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

/**
 * The app {@code main} serves answers on every route as soon as {@code start} returns (#13).
 * Each test starts a fresh app and sends its first request straight away, with no retry.
 */
public class ServerStartupTest {
    private Javalin app;
    private int port;

    @Before
    public void startServer() {
        app = SecretHitlerServer.createApp().start(0);
        port = app.port();
    }

    @After
    public void stopServer() {
        app.stop();
    }

    private HttpResponse<String> get(String path) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).build();
        return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
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
        HttpResponse<String> newLobby = get("/new-lobby");
        try {
            assertEquals(200, newLobby.statusCode());
            assertTrue(SecretHitlerServer.codeToLobby.containsKey(newLobby.body()));
        } finally {
            SecretHitlerServer.codeToLobby.remove(newLobby.body());
        }
    }

    @Test
    public void theGameSocketAnswersAsSoonAsStartReturns() throws Exception {
        // The connect handler closes a socket with no parameters; an unregistered route
        // would refuse the handshake instead.
        TestSocket.CloseInfo close = TestSocket.connect(port, "").awaitClose();
        assertEquals(1002, close.code);
        assertEquals("Must have the 'lobby' and 'name' parameters.", close.reason);
    }
}
