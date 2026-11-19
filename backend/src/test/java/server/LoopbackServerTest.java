package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import io.javalin.Javalin;
import io.javalin.util.JavalinBindException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.eclipse.jetty.server.Connector;
import org.eclipse.jetty.server.ServerConnector;
import org.junit.Test;

/**
 * Every test server listens on 127.0.0.1 alone, through {@link ServerTesting#startOnLoopback}, for
 * the reason {@link ServerTesting#LOOPBACK} gives (#106).
 */
public class LoopbackServerTest {
    @Test
    public void aTestServerListensOnLoopbackAndAnswersAtLocalhost() throws Exception {
        Javalin app = ServerTesting.startOnLoopback(SecretHitlerServer.createApp());
        try {
            Connector[] connectors = app.jettyServer().server().getConnectors();
            assertEquals(1, connectors.length);
            assertEquals("127.0.0.1", ((ServerConnector) connectors[0]).getHost());
            URI ping = URI.create("http://localhost:" + app.port() + "/ping");
            HttpResponse<String> response = HttpClient.newHttpClient()
                    .send(HttpRequest.newBuilder(ping).build(), HttpResponse.BodyHandlers.ofString());
            assertEquals(200, response.statusCode());
        } finally {
            app.stop();
        }
    }

    @Test
    public void aTestServerNeverTakesAPortAnotherSocketHoldsOnLoopback() throws Exception {
        try (ServerSocket other = new ServerSocket()) {
            other.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0));
            int port = other.getLocalPort();
            Javalin app = SecretHitlerServer.createApp();
            try {
                ServerTesting.startOnLoopback(app, port);
                fail("a test server started on " + port + ", which another socket holds on 127.0.0.1");
            } catch (JavalinBindException expected) {
                assertTrue(expected.getMessage(), expected.getMessage().contains(String.valueOf(port)));
            } finally {
                app.stop();
            }
        }
    }

    /**
     * No test starts a server with a port and no address, through Javalin's start or the server's
     * startServer, each of which then listens on every address: no line calls either with one
     * argument that is not a string. A start with no argument at all, on Javalin's own port, is
     * not looked for, as it reads as a thread's or a log appender's.
     */
    @Test
    public void noTestServerListensOnEveryAddress() throws Exception {
        Path tests = Path.of("src", "test", "java");
        assertTrue(tests.toAbsolutePath() + " is the test sources", Files.isDirectory(tests));
        Pattern portAlone = Pattern.compile("(\\.start|startServer)\\(\\s*[^\\s\"(),][^\",;]*\\)");
        List<String> found = new ArrayList<>();
        List<Path> sources;
        try (Stream<Path> files = Files.walk(tests)) {
            sources = files.filter(f -> f.toString().endsWith(".java")).sorted()
                    .collect(Collectors.toList());
        }
        for (Path source : sources) {
            List<String> lines = Files.readAllLines(source);
            for (int i = 0; i < lines.size(); i++) {
                if (portAlone.matcher(lines.get(i)).find()) {
                    found.add(tests.relativize(source) + ":" + (i + 1) + ": " + lines.get(i).trim());
                }
            }
        }
        assertEquals("start these with ServerTesting.startOnLoopback", List.of(), found);
    }
}
