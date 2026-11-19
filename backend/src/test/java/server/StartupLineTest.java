package server;

import static org.junit.Assert.assertEquals;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.javalin.Javalin;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.stream.Collectors;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.slf4j.LoggerFactory;

/**
 * The server logs one line of its own once it listens, which devops/restore-db.sh waits for. The
 * line is the server's, not Javalin's, so a dependency update cannot change it.
 */
public class StartupLineTest {
    private final ListAppender<ILoggingEvent> appender = new ListAppender<>();
    private final ch.qos.logback.classic.Logger root = (ch.qos.logback.classic.Logger) LoggerFactory
            .getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);

    @Before
    public void captureLogs() {
        appender.start();
        root.addAppender(appender);
    }

    @After
    public void releaseLogs() {
        root.detachAppender(appender);
    }

    private static HttpResponse<String> get(int port, String path) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).build();
        return HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
    }

    @Test
    public void theServerSaysOnceItListens() throws Exception {
        Javalin app = SecretHitlerServer.startServer(ServerTesting.LOOPBACK, 0);
        try {
            assertEquals(List.of("Secret Hitler Online is listening on port " + app.port() + "."),
                    appender.list.stream().map(ILoggingEvent::getFormattedMessage)
                            .filter(m -> m.startsWith("Secret Hitler Online")).collect(Collectors.toList()));
            assertEquals(200, get(app.port(), "/ping").statusCode()); // at once, no retry
        } finally {
            app.stop();
        }
        assertEquals("Secret Hitler Online is listening on port 8080.",
                SecretHitlerServer.startupLine(8080));
    }
}
