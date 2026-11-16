package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import io.javalin.Javalin;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import org.junit.After;
import org.junit.Test;

/**
 * Every path under {@code /stats} answers with the page, so a reload or a deep link of a stats
 * address works: Javalin's single-page fallback, served from the test classpath's
 * {@code /spa-test} in place of the built frontend's {@code /public}.
 */
public class StatsFallbackTest {
    private Javalin app;

    @After
    public void stopServer() {
        if (app != null) {
            app.stop();
        }
    }

    /** GETs {@code path} as a browser loading a page does, asking for HTML. */
    private HttpResponse<String> get(String path) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + app.port() + path))
                .header("Accept", "text/html").build();
        return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    public void everyStatsPathAnswersThePage() throws Exception {
        app = SecretHitlerServer.createApp("/spa-test").start(0);
        for (String path : List.of("/stats", "/stats/", "/stats/games",
                "/stats/games/7d0c6a3e-2f1b-4c55-9a7e-3b1d2c4e5f60", "/stats/players/3", "/stats/roles")) {
            HttpResponse<String> response = get(path);
            assertEquals(path + "'s status", 200, response.statusCode());
            String type = response.headers().firstValue("Content-Type").orElse("");
            assertTrue(path + "'s Content-Type: " + type, type.startsWith("text/html"));
            assertTrue(path + "'s body: " + response.body(), response.body().contains("spa-test"));
        }
    }

    @Test
    public void routesAnswerFirst() throws Exception {
        app = SecretHitlerServer.createApp("/spa-test").start(0);
        HttpResponse<String> ping = get("/ping");
        assertEquals(200, ping.statusCode());
        assertEquals("OK", ping.body());
    }

    @Test
    public void otherPathsStay404() throws Exception {
        app = SecretHitlerServer.createApp("/spa-test").start(0);
        assertEquals(404, get("/nope").statusCode());
        assertEquals(404, get("/game-over").statusCode());
    }

    @Test
    public void noFrontendNoFallback() throws Exception {
        app = SecretHitlerServer.createApp("/no-such-dir").start(0);
        assertEquals(404, get("/stats").statusCode());
    }
}
