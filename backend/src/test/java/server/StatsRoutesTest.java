package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import game.GameState;
import io.javalin.Javalin;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.zip.GZIPInputStream;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import server.stats.GameRecord;
import server.stats.GameStore;
import server.stats.StatsRoutes;
import server.stats.TestRecords;
import server.stats.TestStore;
import server.util.FakeSocket;
import server.util.Lobby;
import server.util.RecordedGames;

/**
 * {@code GET /api/stats/games}: every player with their name now and every record, oldest first,
 * with no account ID and no running game; one serialized response kept until a record is saved or
 * an account renamed, with an {@code ETag} that a restart keeps, a 304 for a matching
 * {@code If-None-Match}, gzip when asked (once), and 503 while the database fails.
 */
public class StatsRoutesTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<String> NAMES = List.of("P1", "P2", "P3", "P4", "P5");

    @Rule
    public final SignedInPlayers players = new SignedInPlayers();

    // CPU ticks and countdowns wait for the test, and the records' clock is the test's.
    @Rule
    public final RecordedGames settings = new RecordedGames();
    private final AtomicLong clock = settings.clock;

    private final List<String> codes = new ArrayList<>();
    private GameStore store;
    private Javalin app;
    private int port;

    @Before
    public void startServer() {
        for (String name : NAMES) {
            players.session(name); // the account test-<name>, named <name>
        }
        useStore(GameStore.open(null));
        app = SecretHitlerServer.createApp().start(0);
        port = app.port();
    }

    @After
    public void stopServer() {
        app.stop();
        SecretHitlerServer.stopRecording();
        store.close();
        codes.forEach(ServerTesting::removeLobby);
    }

    /** Records into {@code games} from now on, closing the store used until now. */
    private void useStore(GameStore games) {
        if (store != null) {
            SecretHitlerServer.stopRecording();
            store.close();
        }
        store = games;
        SecretHitlerServer.startRecording(games);
    }

    /** A lobby, registered as {@code code}, whose game of P1 to P5 has just started. */
    private Lobby startGame(String code) {
        Lobby lobby = new Lobby();
        ServerTesting.putLobby(code, lobby);
        codes.add(code);
        int icon = 1;
        for (String name : NAMES) {
            FakeSocket socket = FakeSocket.open();
            lobby.addUser(socket.ctx, SignedInPlayers.account(name), name);
            lobby.trySetUserIcon("p" + icon++, socket.ctx);
        }
        ServerTesting.startGame(lobby);
        return lobby;
    }

    private void update(Lobby lobby) {
        clock.addAndGet(1_000);
        synchronized (lobby) {
            lobby.updateAllUsers();
        }
    }

    /** Plays a game in a new lobby to its end, and returns its ID. */
    private String playGame(String code) {
        Lobby lobby = startGame(code);
        String id = lobby.gameId();
        GameDriver.playOut(lobby.game(), g -> update(lobby));
        assertFalse(lobby.isInGame());
        return id;
    }

    private HttpResponse<byte[]> get(String... headers) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/stats/games"));
        if (headers.length > 0) {
            request.headers(headers);
        }
        return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofByteArray());
    }

    private static String text(HttpResponse<byte[]> response) {
        return new String(response.body(), StandardCharsets.UTF_8);
    }

    private JsonNode body() throws Exception {
        HttpResponse<byte[]> response = get();
        assertEquals(200, response.statusCode());
        return JSON.readTree(response.body());
    }

    /** Polls the route until it lists {@code n} games (the writer saves on its own thread). */
    private JsonNode awaitGames(int n) throws Exception {
        long deadline = System.currentTimeMillis() + 5_000;
        while (true) {
            JsonNode body = body();
            if (body.get("games").size() == n) {
                return body;
            }
            assertTrue("the route lists " + n + " games: " + body, System.currentTimeMillis() < deadline);
            Thread.sleep(20);
        }
    }

    private static String etag(HttpResponse<?> response) {
        return response.headers().firstValue("ETag").orElse(null);
    }

    @Test
    public void anEmptyDatabaseAnswersEmptyLists() throws Exception {
        HttpResponse<byte[]> response = get();
        assertEquals(200, response.statusCode());
        assertEquals("{\"players\":[],\"games\":[]}", text(response));
    }

    @Test
    public void answersPlayersAndRecordsOldestFirst() throws Exception {
        String first = playGame("STAA");
        String second = playGame("STAB");
        JsonNode body = awaitGames(2);

        HttpResponse<byte[]> response = get(); // no cookie
        assertEquals(200, response.statusCode());
        assertEquals("application/json", response.headers().firstValue("Content-Type").orElse(null));
        JsonNode games = body.get("games");
        assertEquals(first, games.get(0).get("id").asText());
        assertEquals(second, games.get(1).get("id").asText());
        assertTrue(games.get(0).get("endedAt").asLong() < games.get(1).get("endedAt").asLong());
        List<String> stored = store.recordsJson();
        for (int i = 0; i < 2; i++) {
            assertEquals(JSON.readTree(stored.get(i)), games.get(i));
        }
        JsonNode list = body.get("players");
        assertEquals(5, list.size());
        JsonNode seats = games.get(0).get("seats");
        for (int i = 0; i < 5; i++) {
            assertEquals(i + 1, list.get(i).get("number").asInt());
            assertEquals(List.of("number", "name"), fieldNames(list.get(i)));
            assertEquals("numbered in the first game's seat order", i + 1, seats.get(i).get("player").asInt());
            assertEquals(seats.get(i).get("name").asText(), list.get(i).get("name").asText());
        }
    }

    private static List<String> fieldNames(JsonNode node) {
        List<String> names = new ArrayList<>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
    }

    @Test
    public void noAccountIdInTheResponse() throws Exception {
        playGame("STAA");
        awaitGames(1);
        assertFalse(text(get()).contains("test-"));
    }

    @Test
    public void aMatchingETagAnswers304() throws Exception {
        playGame("STAA");
        awaitGames(1);
        HttpResponse<byte[]> response = get();
        String etag = etag(response);
        assertTrue(etag, etag.matches("\"[0-9a-f]{64}\""));
        assertEquals("no-cache", response.headers().firstValue("Cache-Control").orElse(null));
        assertEquals("Accept-Encoding", response.headers().firstValue("Vary").orElse(null));

        for (String tag : List.of(etag, "W/" + etag, "\"other\", " + etag, "*")) {
            HttpResponse<byte[]> notModified = get("If-None-Match", tag);
            assertEquals(tag, 304, notModified.statusCode());
            assertEquals(0, notModified.body().length);
            assertEquals(etag, etag(notModified));
        }
        HttpResponse<byte[]> other = get("If-None-Match", "\"other\"");
        assertEquals(200, other.statusCode());
        assertEquals(text(response), text(other));
    }

    @Test
    public void aNewRecordChangesTheResponse() throws Exception {
        playGame("STAA");
        awaitGames(1);
        String before = etag(get());

        playGame("STAB");
        awaitGames(2);
        HttpResponse<byte[]> after = get("If-None-Match", before);
        assertEquals(200, after.statusCode());
        assertNotEquals(before, etag(after));
        assertEquals(2, JSON.readTree(after.body()).get("games").size());
    }

    @Test
    public void aRenameChangesTheResponse() throws Exception {
        playGame("STAA");
        JsonNode body = awaitGames(1);
        String before = etag(get());
        int number = -1;
        for (JsonNode seat : body.get("games").get(0).get("seats")) {
            if (seat.get("name").asText().equals("P1")) {
                number = seat.get("player").asInt();
            }
        }

        assertEquals(SecretHitlerServer.RenameResult.SAVED, SecretHitlerServer.renameAccount("test-P1", "Annie"));

        HttpResponse<byte[]> after = get("If-None-Match", before);
        assertEquals(200, after.statusCode());
        JsonNode renamed = JSON.readTree(after.body());
        for (JsonNode player : renamed.get("players")) {
            if (player.get("number").asInt() == number) {
                assertEquals("Annie", player.get("name").asText());
            }
        }
        // The record keeps the name the seat had in the game.
        assertTrue(text(after).contains("\"name\":\"P1\""));
    }

    @Test
    public void itIsGzippedOnce() throws Exception {
        playGame("STAA");
        playGame("STAB");
        awaitGames(2);

        HttpResponse<byte[]> plain = get();
        assertNull(plain.headers().firstValue("Content-Encoding").orElse(null));
        HttpResponse<byte[]> gzipped = get("Accept-Encoding", "gzip");
        assertEquals("gzip", gzipped.headers().firstValue("Content-Encoding").orElse(null));
        byte[] unzipped;
        try (GZIPInputStream in = new GZIPInputStream(new ByteArrayInputStream(gzipped.body()))) {
            unzipped = in.readAllBytes();
        }
        assertEquals(text(plain), new String(unzipped, StandardCharsets.UTF_8));
        assertTrue("smaller than the JSON", gzipped.body().length < plain.body().length);
        assertEquals(etag(plain), etag(gzipped));
    }

    @Test
    public void gzipIsSentOnlyWhereItIsAccepted() throws Exception {
        playGame("STAA");
        awaitGames(1);
        for (String accepted : List.of("gzip", "GZIP", "deflate, gzip;q=0.5", "br,gzip")) {
            assertEquals(accepted, "gzip", get("Accept-Encoding", accepted).headers()
                    .firstValue("Content-Encoding").orElse(null));
        }
        // Javalin's own compressor gzips whatever names gzip, q=0 or not, so the route does too.
        for (String refused : List.of("deflate", "identity", "br")) {
            HttpResponse<byte[]> plain = get("Accept-Encoding", refused);
            assertNull(refused, plain.headers().firstValue("Content-Encoding").orElse(null));
            assertEquals(refused, text(get()), text(plain));
        }
    }

    @Test
    public void aRestartKeepsTheETag() throws Exception {
        playGame("STAA");
        awaitGames(1);
        String before = etag(get());

        SecretHitlerServer.stats = new StatsRoutes(store, id -> players.store().find(id).username());
        HttpResponse<byte[]> afterRestart = get("If-None-Match", before);
        assertEquals(304, afterRestart.statusCode());
        assertEquals(before, etag(afterRestart));
    }

    @Test
    public void aFailingDatabaseIs503() throws Exception {
        TestStore failing = new TestStore();
        useStore(failing);
        failing.failing = true;
        HttpResponse<byte[]> down = get();
        assertEquals(503, down.statusCode());
        assertEquals(StatsRoutes.UNAVAILABLE, text(down));

        failing.failing = false;
        assertEquals(200, get().statusCode());
    }

    @Test
    public void noRecorderIs503() throws Exception {
        SecretHitlerServer.stopRecording();
        HttpResponse<byte[]> response = get();
        assertEquals(503, response.statusCode());
        assertEquals(StatsRoutes.UNAVAILABLE, text(response));
    }

    /**
     * A game saved while the response is built, between its read of the players and of the games,
     * never puts a seat's player number in the response without that player.
     */
    @Test
    public void aSaveDuringABuildNeverServesAnUnknownPlayer() throws Exception {
        try (TestStore racing = new TestStore()) {
            AtomicInteger reads = new AtomicInteger();
            racing.onCall = () -> {
                if (reads.incrementAndGet() == 2) { // the build's second read: a save lands first
                    racing.save(TestRecords.record("racer", 2_000_000L, GameRecord.LIBERAL_POLICIES,
                            TestRecords.seats("test-P1")));
                }
            };
            JsonNode body = JSON.readTree(new StatsRoutes(racing, id -> "P1").body());

            Set<Integer> numbers = new HashSet<>();
            body.get("players").forEach(player -> numbers.add(player.get("number").asInt()));
            for (JsonNode game : body.get("games")) {
                for (JsonNode seat : game.get("seats")) {
                    if (!seat.get("player").isNull()) {
                        assertTrue("player " + seat.get("player") + " is listed: " + body,
                                numbers.contains(seat.get("player").asInt()));
                    }
                }
            }
        }
    }

    @Test
    public void aRunningGameIsNeverServed() throws Exception {
        Lobby lobby = startGame("STAA");
        String id = lobby.gameId();
        GameDriver.playUntil(lobby.game(), GameState.LEGISLATIVE_PRESIDENT, g -> update(lobby));
        assertTrue(lobby.timeline().stream().anyMatch(e -> e.get("type").equals("vote")));

        String running = text(get());
        assertFalse(running.contains(id));
        assertEquals(0, JSON.readTree(running).get("games").size());

        GameDriver.playOut(lobby.game(), g -> update(lobby));
        assertEquals(id, awaitGames(1).get("games").get(0).get("id").asText());
    }
}
