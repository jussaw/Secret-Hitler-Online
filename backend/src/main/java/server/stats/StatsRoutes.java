package server.stats;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.javalin.http.Context;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Function;
import java.util.zip.GZIPOutputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * {@code GET /api/stats/games} (#31): every player, by number, with their account's name now, and
 * every record, oldest first, as {@code {"players": [{"number", "name"}…], "games": [record…]}}.
 * It needs no sign-in: the records hold player numbers, never an account ID, and only finished or
 * abandoned games reach the store.
 *
 * <p>The serialized response is kept, with its gzip and its {@code ETag} (the body's SHA-256),
 * until {@code invalidate}: after each record is saved and each rename. A request whose
 * {@code If-None-Match} has the {@code ETag} gets 304; one that accepts gzip gets the gzip, with
 * {@code Content-Encoding: gzip}, which Javalin's own compression then leaves alone. While the
 * database fails the answer is 503 with {@link #UNAVAILABLE}, and nothing is kept.
 */
public final class StatsRoutes {
    public static final String UNAVAILABLE = "Stats are unavailable right now.";

    private static final Logger logger = LoggerFactory.getLogger(StatsRoutes.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final GameStore store;
    private final Function<String, String> currentName;
    private final AtomicLong version = new AtomicLong();
    private volatile Response cached;

    /** One serialized response, and the version of the data it was built from. */
    private record Response(long version, String body, byte[] bytes, byte[] gzip, String etag) {
    }

    /**
     * @param store       the records.
     * @param currentName an account's name now, by account ID, or null for an account with none;
     *                    such a player reads {@code Player <number>}.
     */
    public StatsRoutes(GameStore store, Function<String, String> currentName) {
        this.store = store;
        this.currentName = currentName;
    }

    /** Drops the kept response, so the next request builds it again. Never blocks. */
    public void invalidate() {
        version.incrementAndGet();
    }

    /**
     * The response's body, built when the kept one is stale.
     *
     * @throws RuntimeException if the database fails.
     */
    public String body() {
        return current().body();
    }

    /** Answers {@code GET /api/stats/games}. */
    public void getGames(Context ctx) {
        Response response;
        try {
            response = current();
        } catch (RuntimeException e) {
            logger.error("Could not build the stats response.", e);
            ctx.status(503);
            ctx.result(UNAVAILABLE);
            return;
        }
        ctx.header("ETag", response.etag());
        ctx.header("Cache-Control", "no-cache");
        ctx.header("Vary", "Accept-Encoding");
        if (matches(ctx.header("If-None-Match"), response.etag())) {
            ctx.status(304);
            return;
        }
        ctx.contentType("application/json");
        if (acceptsGzip(ctx.header("Accept-Encoding"))) {
            ctx.header("Content-Encoding", "gzip");
            ctx.result(response.gzip());
        } else {
            ctx.result(response.bytes());
        }
    }

    /**
     * The kept response, or a new one if a record was saved or an account renamed since. The
     * version is read before the database, so a change that lands during a build leaves the
     * response stale for the next request.
     */
    private Response current() {
        Response kept = cached;
        if (kept != null && kept.version() == version.get()) {
            return kept;
        }
        synchronized (this) {
            long now = version.get();
            kept = cached;
            if (kept != null && kept.version() == now) {
                return kept;
            }
            Response built = build(now);
            cached = built;
            return built;
        }
    }

    private Response build(long builtVersion) {
        List<Map<String, Object>> players = new ArrayList<>();
        for (GameStore.PlayerRow row : store.players()) {
            String name = currentName.apply(row.accountId());
            Map<String, Object> player = new LinkedHashMap<>();
            player.put("number", row.number());
            player.put("name", name == null ? "Player " + row.number() : name);
            players.add(player);
        }
        List<String> records = store.recordsJson();
        String playersJson;
        try {
            playersJson = JSON.writeValueAsString(players);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not write the players.", e);
        }
        String body = "{\"players\":" + playersJson + ",\"games\":[" + String.join(",", records) + "]}";
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        return new Response(builtVersion, body, bytes, gzip(bytes), "\"" + sha256(bytes) + "\"");
    }

    /** Whether an {@code If-None-Match} names the tag: any entry, weak or strong, or {@code *}. */
    static boolean matches(String ifNoneMatch, String etag) {
        if (ifNoneMatch == null) {
            return false;
        }
        for (String entry : ifNoneMatch.split(",")) {
            String tag = entry.trim();
            if (tag.startsWith("W/")) {
                tag = tag.substring(2);
            }
            if (tag.equals("*") || tag.equals(etag)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Whether an {@code Accept-Encoding} names gzip, read as Javalin's own compressor reads it (a
     * case-blind substring, any {@code q} aside): where it would gzip the plain body, the route
     * sends the gzip it keeps instead.
     */
    static boolean acceptsGzip(String acceptEncoding) {
        return acceptEncoding != null && acceptEncoding.toLowerCase(Locale.ROOT).contains("gzip");
    }

    private static byte[] gzip(byte[] bytes) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (GZIPOutputStream zip = new GZIPOutputStream(out)) {
            zip.write(bytes);
        } catch (IOException e) {
            throw new IllegalStateException("Could not compress the stats response.", e);
        }
        return out.toByteArray();
    }

    private static String sha256(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
