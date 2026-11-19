package server.accounts;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import io.javalin.Javalin;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.slf4j.LoggerFactory;
import server.ApplicationConfig;
import server.SecretHitlerServer;
import server.ServerTesting;

/**
 * Signing in with Discord, over real HTTP: the server's own app talks to a fake Discord (a second
 * Javalin app on a free port) that records what it is asked. The redirect URI, client ID and
 * secret are obvious fakes.
 */
public class DiscordSignInTest {
    private static final String REDIRECT = "https://game.example.test/auth/discord/callback";
    private static final String CLIENT_ID = "fake-client-id";
    private static final String CLIENT_SECRET = "fake-client-secret";
    private static final String CODE = "fake-auth-code";
    private static final String TOKEN = "fake-access-token";

    /**
     * How the fake answers. STALL sends the headers and part of the body, then waits (the
     * request's own timeout does not cover that). CRLF_TOKEN answers with an access token that
     * has a line break in it. BAD_ID, OBJECT_ID, NUMBER_ID (a JSON
     * number) and LONG_ID (21 digits) give a user id that is not a snowflake.
     */
    private enum Mode {
        OK, SERVER_ERROR, STALL, NO_TOKEN, BAD_JSON, NO_ID, BAD_ID, OBJECT_ID, NUMBER_ID, LONG_ID, CRLF_TOKEN
    }

    private static final String CRLF_TOKEN = "crlf-token-value\r\nX-Evil: 1";

    // What the fake saw.
    private final List<Map<String, String>> tokenForms = new CopyOnWriteArrayList<>();
    private final List<String> userAuthorizations = new CopyOnWriteArrayList<>();
    private final List<String> userAgents = new CopyOnWriteArrayList<>();
    private final List<String> tokenAgents = new CopyOnWriteArrayList<>();
    private final AtomicInteger discordCalls = new AtomicInteger();
    private volatile Mode mode = Mode.OK; // the token exchange
    private volatile Mode userMode = Mode.OK; // the user read
    private final CountDownLatch release = new CountDownLatch(1); // lets a stalled answer end
    private volatile String avatar = "fakeavatarhash";

    private AccountStore store;
    private Javalin app;
    private Javalin discord;
    private int port;

    private AccountStore savedStore;
    private String savedClientId;
    private String savedClientSecret;
    private String savedRedirectUri;
    private boolean savedTestSignIn;
    private String savedAuthorizeUrl;
    private String savedApiBase;
    private Duration savedTimeout;

    @Before
    public void startServers() {
        savedStore = SecretHitlerServer.accounts;
        savedClientId = ApplicationConfig.DISCORD_CLIENT_ID;
        savedClientSecret = ApplicationConfig.DISCORD_CLIENT_SECRET;
        savedRedirectUri = ApplicationConfig.DISCORD_REDIRECT_URI;
        savedTestSignIn = ApplicationConfig.TEST_SIGN_IN;
        savedAuthorizeUrl = DiscordSignIn.authorizeUrl;
        savedApiBase = DiscordSignIn.apiBase;
        savedTimeout = DiscordSignIn.TIMEOUT;

        discord = ServerTesting.startOnLoopback(Javalin.create().post("/oauth2/token", ctx -> {
            discordCalls.incrementAndGet();
            Map<String, String> form = new HashMap<>();
            ctx.formParamMap().forEach((key, values) -> form.put(key, values.get(0)));
            tokenForms.add(form);
            tokenAgents.add(String.valueOf(ctx.header("User-Agent")));
            switch (mode) {
                case SERVER_ERROR -> ctx.status(500).result("{\"access_token\":\"" + TOKEN + "\"}");
                case STALL -> stall(ctx);
                case CRLF_TOKEN -> ctx.contentType("application/json").result(
                        new JSONObject().put("access_token", CRLF_TOKEN).toString());
                case NO_TOKEN -> ctx.result("{\"token_type\":\"Bearer\"}");
                case BAD_JSON -> ctx.result("<html>not json " + TOKEN + "</html>");
                default -> ctx.contentType("application/json").result(
                        "{\"access_token\":\"" + TOKEN + "\",\"token_type\":\"Bearer\"}");
            }
        }).get("/users/@me", ctx -> {
            discordCalls.incrementAndGet();
            userAuthorizations.add(String.valueOf(ctx.header("Authorization")));
            userAgents.add(String.valueOf(ctx.header("User-Agent")));
            String avatarJson = avatar == null ? "null" : "\"" + avatar + "\"";
            String id = switch (userMode) {
                case NO_ID -> "";
                case BAD_ID -> "\"test-1\"";
                case OBJECT_ID -> "{}";
                case NUMBER_ID -> "4242";
                case LONG_ID -> "\"123456789012345678901\"";
                default -> "\"4242\"";
            };
            String body = "{" + (id.isEmpty() ? "" : "\"id\":" + id + ",") + "\"username\":\"fakeuser\",\"avatar\":"
                    + avatarJson + "}";
            switch (userMode) {
                case SERVER_ERROR -> ctx.status(500).result(body);
                case STALL -> stall(ctx);
                case BAD_JSON -> ctx.result("<html>not json " + TOKEN + "</html>");
                default -> ctx.contentType("application/json").result(body);
            }
        }));
        DiscordSignIn.apiBase = "http://localhost:" + discord.port();
        DiscordSignIn.authorizeUrl = "http://localhost:" + discord.port() + "/oauth2/authorize";
        DiscordSignIn.TIMEOUT = Duration.ofSeconds(1);
        DiscordSignIn.resetClient(); // no pooled connection to an earlier test's fake

        ApplicationConfig.DISCORD_CLIENT_ID = CLIENT_ID;
        ApplicationConfig.DISCORD_CLIENT_SECRET = CLIENT_SECRET;
        ApplicationConfig.DISCORD_REDIRECT_URI = REDIRECT;
        ApplicationConfig.TEST_SIGN_IN = false;
        store = AccountStore.open(null);
        SecretHitlerServer.accounts = store;
        app = ServerTesting.startOnLoopback(ServerTesting.createApp());
        port = app.port();
    }

    /** Sends the headers and part of a longer body, then waits until the test is over. */
    private void stall(io.javalin.http.Context ctx) throws Exception {
        ctx.contentType("application/json");
        ctx.res().setContentLength(200);
        ctx.res().getOutputStream().write("{\"access_token\":\"".getBytes(StandardCharsets.UTF_8));
        ctx.res().getOutputStream().flush();
        ctx.res().flushBuffer();
        release.await(10, TimeUnit.SECONDS);
    }

    @After
    public void stopServers() {
        release.countDown();
        app.stop();
        discord.stop();
        SecretHitlerServer.accounts = savedStore;
        store.close();
        ApplicationConfig.DISCORD_CLIENT_ID = savedClientId;
        ApplicationConfig.DISCORD_CLIENT_SECRET = savedClientSecret;
        ApplicationConfig.DISCORD_REDIRECT_URI = savedRedirectUri;
        ApplicationConfig.TEST_SIGN_IN = savedTestSignIn;
        DiscordSignIn.authorizeUrl = savedAuthorizeUrl;
        DiscordSignIn.apiBase = savedApiBase;
        DiscordSignIn.TIMEOUT = savedTimeout;
        DiscordSignIn.resetClient();
    }

    ////// Helpers

    private HttpResponse<String> get(String path, String cookie) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (cookie != null) {
            request.header("Cookie", cookie);
        }
        // A new client per request (it never follows redirects): a pooled keep-alive connection
        // the server closed at the same moment fails with "header parser received no bytes".
        return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private static String enc(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static String location(HttpResponse<String> response) {
        return response.headers().firstValue("Location").orElse(null);
    }

    /** The named cookie's header, split into its value under "value" and lower-case attributes. */
    private static Map<String, String> cookie(HttpResponse<String> response, String name) {
        Map<String, String> found = null;
        for (String header : response.headers().allValues("Set-Cookie")) {
            String[] parts = header.split(";");
            if (!parts[0].trim().startsWith(name + "=")) {
                continue;
            }
            assertNull("one " + name + " cookie per response", found);
            found = new HashMap<>();
            found.put("value", parts[0].trim().substring(name.length() + 1));
            for (int i = 1; i < parts.length; i++) {
                String part = parts[i].trim();
                int equals = part.indexOf('=');
                found.put((equals < 0 ? part : part.substring(0, equals)).toLowerCase(),
                        equals < 0 ? "" : part.substring(equals + 1));
            }
        }
        return found;
    }

    /** The query parameters of a URL, decoded. */
    private static Map<String, String> query(String url) {
        Map<String, String> params = new HashMap<>();
        String raw = URI.create(url).getRawQuery();
        for (String pair : raw.split("&")) {
            int equals = pair.indexOf('=');
            params.put(URLDecoder.decode(pair.substring(0, equals), StandardCharsets.UTF_8),
                    URLDecoder.decode(pair.substring(equals + 1), StandardCharsets.UTF_8));
        }
        return params;
    }

    /** A started sign-in: the cookie header to send back and the state Discord would echo. */
    private record Started(String cookieHeader, String state) {
    }

    private Started start(String lobbyQuery) throws Exception {
        HttpResponse<String> response = get("/auth/discord" + lobbyQuery, null);
        assertEquals(302, response.statusCode());
        Map<String, String> cookie = cookie(response, DiscordSignIn.STATE_COOKIE);
        assertNotNull(cookie);
        return new Started(DiscordSignIn.STATE_COOKIE + "=" + cookie.get("value"),
                query(location(response)).get("state"));
    }

    private HttpResponse<String> callback(Started started, String queryString) throws Exception {
        return get("/auth/discord/callback?" + queryString, started.cookieHeader());
    }

    private HttpResponse<String> signInWith(Started started) throws Exception {
        return callback(started, "code=" + CODE + "&state=" + enc(started.state()));
    }

    private void assertFailed(HttpResponse<String> response) {
        assertFailed(response, "/?signin=failed");
    }

    private void assertFailed(HttpResponse<String> response, String expectedLocation) {
        assertEquals(302, response.statusCode());
        assertEquals(expectedLocation, location(response));
        assertNull(cookie(response, AuthRoutes.SESSION_COOKIE));
        assertNull(store.find("4242"));
        Map<String, String> cleared = cookie(response, DiscordSignIn.STATE_COOKIE);
        assertNotNull(cleared);
        assertEquals("0", cleared.get("max-age"));
        assertEquals("/auth", cleared.get("path"));
    }

    ////// Step 1

    @Test
    public void startRedirectsToDiscordWithAState() throws Exception {
        HttpResponse<String> response = get("/auth/discord", null);
        assertEquals(302, response.statusCode());
        String location = location(response);
        assertTrue(location, location.startsWith(DiscordSignIn.authorizeUrl + "?"));
        Map<String, String> params = query(location);
        assertEquals("code", params.get("response_type"));
        assertEquals(CLIENT_ID, params.get("client_id"));
        assertEquals("identify", params.get("scope"));
        assertEquals(REDIRECT, params.get("redirect_uri"));
        assertTrue(location, location.contains("redirect_uri=" + enc(REDIRECT)));
        String state = params.get("state");
        assertNotNull(state);
        assertTrue(state, state.matches("[A-Za-z0-9_-]{43}")); // 32 bytes, URL-safe, no padding

        Map<String, String> cookie = cookie(response, DiscordSignIn.STATE_COOKIE);
        assertNotNull(cookie);
        assertEquals(state, cookie.get("value"));
        assertEquals("/auth", cookie.get("path"));
        assertEquals("600", cookie.get("max-age"));
        assertTrue(cookie.toString(), cookie.containsKey("httponly"));
        assertTrue(cookie.toString(), cookie.containsKey("secure")); // the redirect URI is https
        assertEquals("lax", cookie.get("samesite").toLowerCase());

        // Each start has its own state.
        String other = query(location(get("/auth/discord", null))).get("state");
        assertFalse(state.equals(other));
    }

    @Test
    public void startIs503WhenNotConfigured() throws Exception {
        ApplicationConfig.DISCORD_CLIENT_SECRET = null;
        HttpResponse<String> response = get("/auth/discord", null);
        assertEquals(503, response.statusCode());
        assertEquals(DiscordSignIn.NOT_SET_UP, response.body());
        assertNull(cookie(response, DiscordSignIn.STATE_COOKIE));
    }

    @Test
    public void callbackFailsWhenNotConfigured() throws Exception {
        Started started = start("");
        ApplicationConfig.DISCORD_CLIENT_ID = " ";
        assertFailed(signInWith(started));
        assertEquals(0, discordCalls.get());
    }

    ////// Steps 2 to 4

    @Test
    public void callbackSignsInAndComesHome() throws Exception {
        Started started = start("");
        HttpResponse<String> response = signInWith(started);
        assertEquals(302, response.statusCode());
        assertEquals("/", location(response));

        Map<String, String> session = cookie(response, AuthRoutes.SESSION_COOKIE);
        assertNotNull(session);
        assertEquals("/", session.get("path"));
        assertTrue(session.toString(), session.containsKey("httponly"));
        AccountStore.SessionLookup lookup = store.lookup(session.get("value"));
        assertNotNull(lookup);
        Account account = lookup.account();
        assertEquals("4242", account.id());
        assertEquals("fakeuser", account.discordUsername());
        assertEquals("fakeavatarhash", account.discordAvatar());
        assertNull(account.username());

        // The state cookie is cleared.
        Map<String, String> cleared = cookie(response, DiscordSignIn.STATE_COOKIE);
        assertNotNull(cleared);
        assertEquals("0", cleared.get("max-age"));
        assertEquals("/auth", cleared.get("path"));

        // What the server sent Discord.
        assertEquals(1, tokenForms.size());
        Map<String, String> form = tokenForms.get(0);
        assertEquals("authorization_code", form.get("grant_type"));
        assertEquals(CODE, form.get("code"));
        assertEquals(REDIRECT, form.get("redirect_uri"));
        assertEquals(CLIENT_ID, form.get("client_id"));
        assertEquals(CLIENT_SECRET, form.get("client_secret"));
        assertEquals(List.of("Bearer " + TOKEN), userAuthorizations);
    }

    @Test
    public void callbackKeepsAChosenNameAndAcceptsNoAvatar() throws Exception {
        avatar = null;
        HttpResponse<String> first = signInWith(start(""));
        assertNotNull(cookie(first, AuthRoutes.SESSION_COOKIE));
        assertNull(store.find("4242").discordAvatar());
        store.setUsername("4242", "Chosen");
        avatar = "newhash";
        signInWith(start(""));
        Account account = store.find("4242");
        assertEquals("Chosen", account.username());
        assertEquals("newhash", account.discordAvatar());
    }

    @Test
    public void callbackKeepsTheLobbyCode() throws Exception {
        Started started = start("?lobby=KQMX");
        assertTrue(started.cookieHeader(), started.cookieHeader().endsWith("." + "KQMX"));
        HttpResponse<String> response = signInWith(started);
        assertEquals(302, response.statusCode());
        assertEquals("/?lobby=KQMX", location(response));
        assertNotNull(cookie(response, AuthRoutes.SESSION_COOKIE));
    }

    @Test
    public void failureKeepsTheLobbyCode() throws Exception {
        Started started = start("?lobby=KQMX");
        HttpResponse<String> response = callback(started, "error=access_denied");
        assertEquals(302, response.statusCode());
        assertEquals("/?signin=failed&lobby=KQMX", location(response));
    }

    @Test
    public void hostileLobbyCodesNeverRedirect() throws Exception {
        // U and V are not in the alphabet either.
        for (String hostile : List.of("../evil", "https://x", "kqmx", "KQMXZ", "<b>", "KQM", "KUVM", "")) {
            Started started = start("?lobby=" + enc(hostile));
            assertFalse(hostile, started.cookieHeader().contains("."));
            HttpResponse<String> response = signInWith(started);
            assertEquals(hostile, "/", location(response));
        }
        // A lobby parameter on the callback itself is ignored, and so is a forged cookie's.
        Started started = start("");
        assertEquals("/", location(callback(started, "code=" + CODE + "&state=" + enc(started.state())
                + "&lobby=KQMX")));
        Started forged = new Started(started.cookieHeader() + ".../evil", null);
        assertEquals("/", location(callback(forged, "code=" + CODE + "&state=" + enc(started.state()))));
    }

    @Test
    public void aWrongOrMissingStateFails() throws Exception {
        Started started = start("");
        assertFailed(callback(started, "code=" + CODE + "&state=wrong"));
        assertFailed(callback(started, "code=" + CODE));
        assertFailed(callback(started, "state=" + enc(started.state())));
        assertFailed(callback(started, "code=" + CODE + "&state="));
        // No cookie, an empty one, and a malformed one.
        assertFailed(get("/auth/discord/callback?code=" + CODE + "&state=" + enc(started.state()), null));
        assertFailed(get("/auth/discord/callback?code=" + CODE + "&state=" + enc(started.state()),
                DiscordSignIn.STATE_COOKIE + "="));
        assertFailed(get("/auth/discord/callback?code=" + CODE + "&state=", DiscordSignIn.STATE_COOKIE + "="));
        assertFailed(get("/auth/discord/callback?code=" + CODE + "&state=.KQMX",
                DiscordSignIn.STATE_COOKIE + "=.KQMX"), "/?signin=failed&lobby=KQMX");
        assertEquals(0, discordCalls.get());
    }

    @Test
    public void cancelAtDiscordFails() throws Exception {
        Started started = start("");
        HttpResponse<String> response = callback(started, "error=access_denied&error_description=nope&state="
                + enc(started.state()));
        assertFailed(response);
        assertEquals(0, discordCalls.get());
    }

    @Test
    public void discordDownOrSlowFails() throws Exception {
        // The token exchange failing.
        for (Mode failing : List.of(Mode.SERVER_ERROR, Mode.STALL, Mode.NO_TOKEN, Mode.BAD_JSON)) {
            mode = failing;
            tokenForms.clear();
            long begin = System.nanoTime();
            assertFailed(signInWith(start("")));
            assertEquals(failing.toString(), 1, tokenForms.size());
            assertWithinTimeout(failing, begin);
        }
        // The user read failing, after a good exchange.
        mode = Mode.OK;
        for (Mode failing : List.of(Mode.SERVER_ERROR, Mode.STALL, Mode.BAD_JSON, Mode.NO_ID, Mode.BAD_ID,
                Mode.OBJECT_ID, Mode.NUMBER_ID, Mode.LONG_ID)) {
            userMode = failing;
            userAuthorizations.clear();
            long begin = System.nanoTime();
            assertFailed(signInWith(start("")));
            assertEquals(failing.toString(), 1, userAuthorizations.size());
            assertWithinTimeout(failing, begin);
        }
        // Discord not answering at all: a refused connection at the token exchange.
        userMode = Mode.OK;
        discord.stop();
        assertFailed(signInWith(start("")));
    }

    /** The whole call to Discord, headers and body, ends about when TIMEOUT (1 s) does. */
    private static void assertWithinTimeout(Mode mode, long beginNanos) {
        long ms = (System.nanoTime() - beginNanos) / 1_000_000;
        assertTrue(mode + " took " + ms + " ms", ms < 2500);
    }

    @Test
    public void aTokenWithALineBreakFailsWithoutLoggingIt() throws Exception {
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        ch.qos.logback.classic.Logger root = (ch.qos.logback.classic.Logger) LoggerFactory
                .getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        root.addAppender(appender);
        try {
            mode = Mode.CRLF_TOKEN;
            assertFailed(signInWith(start("")));
        } finally {
            root.detachAppender(appender);
        }
        assertEquals(0, userAuthorizations.size()); // never sent
        assertFalse(appender.list.isEmpty());
        for (ILoggingEvent event : appender.list) {
            String text = event.getFormattedMessage();
            if (event.getThrowableProxy() != null) {
                text += " " + event.getThrowableProxy().getMessage();
            }
            assertFalse(text, text.contains("crlf-token-value"));
            assertNull("no uncaught exception: " + text, event.getThrowableProxy());
        }
    }

    @Test
    public void bothRequestsSendAUserAgent() throws Exception {
        // A sign-in that failed reads no user, so it says so here, not as an empty list below.
        assertEquals("/", location(signInWith(start(""))));
        assertEquals(List.of("secret-hitler-online"), userAgents);
        assertEquals(List.of("secret-hitler-online"), tokenAgents);
    }

    @Test
    public void nothingSecretIsLogged() throws Exception {
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        ch.qos.logback.classic.Logger root = (ch.qos.logback.classic.Logger) LoggerFactory
                .getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        root.addAppender(appender);
        List<String> states = new ArrayList<>();
        List<String> secretsSeen = new ArrayList<>(); // the session token
        try {
            Started ok = start("?lobby=KQMX");
            states.add(ok.state());
            HttpResponse<String> signedIn = signInWith(ok);
            secretsSeen.add(cookie(signedIn, AuthRoutes.SESSION_COOKIE).get("value"));
            for (Mode failing : List.of(Mode.SERVER_ERROR, Mode.BAD_JSON, Mode.STALL)) {
                mode = failing;
                Started failed = start("");
                states.add(failed.state());
                signInWith(failed);
            }
            mode = Mode.OK;
            Started wrong = start("");
            states.add(wrong.state());
            callback(wrong, "code=" + CODE + "&state=wrong");
        } finally {
            root.detachAppender(appender);
        }
        assertTrue(appender.list.stream().anyMatch(e -> e.getFormattedMessage().contains("Discord sign-in failed")));
        List<String> secrets = new ArrayList<>(List.of(CODE, TOKEN, CLIENT_SECRET));
        secrets.addAll(states);
        secrets.addAll(secretsSeen);
        for (ILoggingEvent event : appender.list) {
            String text = event.getFormattedMessage();
            if (event.getThrowableProxy() != null) {
                text += " " + event.getThrowableProxy().getMessage();
            }
            for (String secret : secrets) {
                assertFalse(text, text.contains(secret));
            }
        }
    }
}
