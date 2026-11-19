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
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.slf4j.LoggerFactory;
import server.ApplicationConfig;
import server.SecretHitlerServer;
import server.ServerTesting;
import server.TestAccounts;
import server.TestSocket;
import server.util.FakeSocket;
import server.util.Lobby;

/**
 * The account routes over real HTTP, on the server's own app with an in-memory account store:
 * who is signed in ({@code /me}), choosing a name ({@code /me/username}), signing out, the test
 * sign-in, and the guard on {@code /new-lobby}. A {@code session} cookie that matches no live
 * session (junk, empty, signed out, expired) is signed out everywhere, never a 500.
 */
public class AuthRoutesTest {
    private static final long HOUR_MS = 60L * 60 * 1000;
    private static final long DAY_MS = 24 * HOUR_MS;
    private static final String JSON = "application/json";

    // The account store's clock, which the tests move on to expire and renew sessions.
    private final AtomicLong now = new AtomicLong(1_800_000_000_000L);
    private final HttpClient http = HttpClient.newHttpClient();
    private final List<String> codes = new ArrayList<>(); // lobbies a test registered or made
    private AccountStore store;
    private Javalin app;
    private int port;

    private AccountStore savedStore;
    private boolean savedTestSignIn;
    private String savedClientId;
    private String savedClientSecret;
    private String savedRedirectUri;

    @Before
    public void startServer() {
        savedStore = SecretHitlerServer.accounts;
        savedTestSignIn = ApplicationConfig.TEST_SIGN_IN;
        savedClientId = ApplicationConfig.DISCORD_CLIENT_ID;
        savedClientSecret = ApplicationConfig.DISCORD_CLIENT_SECRET;
        savedRedirectUri = ApplicationConfig.DISCORD_REDIRECT_URI;
        ApplicationConfig.TEST_SIGN_IN = false;
        ApplicationConfig.DISCORD_CLIENT_ID = null;
        ApplicationConfig.DISCORD_CLIENT_SECRET = null;
        ApplicationConfig.DISCORD_REDIRECT_URI = null;
        store = AccountStore.open(null, now::get);
        SecretHitlerServer.accounts = store;
        app = ServerTesting.startOnLoopback(ServerTesting.createApp());
        port = app.port();
    }

    @After
    public void stopServer() {
        app.stop();
        codes.forEach(ServerTesting::removeLobby);
        SecretHitlerServer.accounts = savedStore;
        store.close();
        ApplicationConfig.TEST_SIGN_IN = savedTestSignIn;
        ApplicationConfig.DISCORD_CLIENT_ID = savedClientId;
        ApplicationConfig.DISCORD_CLIENT_SECRET = savedClientSecret;
        ApplicationConfig.DISCORD_REDIRECT_URI = savedRedirectUri;
    }

    ////// Requests

    private HttpResponse<String> send(HttpRequest.Builder request, String token) throws Exception {
        if (token != null) {
            request.header("Cookie", AuthRoutes.SESSION_COOKIE + "=" + token);
        }
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpRequest.Builder request(String path) {
        return HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
    }

    private HttpResponse<String> get(String path, String token) throws Exception {
        return send(request(path), token);
    }

    /** POSTs {@code body} with the content type {@code contentType} (none when null). */
    private HttpResponse<String> post(String path, String token, String contentType, String body) throws Exception {
        HttpRequest.Builder request = request(path).POST(HttpRequest.BodyPublishers.ofString(body));
        if (contentType != null) {
            request.header("Content-Type", contentType);
        }
        return send(request, token);
    }

    private HttpResponse<String> postJson(String path, String token, String body) throws Exception {
        return post(path, token, JSON, body);
    }

    private HttpResponse<String> rename(String token, String name) throws Exception {
        return postJson("/me/username", token, new JSONObject().put("username", name).toString());
    }

    private HttpResponse<String> testSignIn(JSONObject body) throws Exception {
        return postJson("/auth/test-sign-in", null, body.toString());
    }

    private JSONObject me(String token) throws Exception {
        HttpResponse<String> response = get("/me", token);
        assertEquals(200, response.statusCode());
        assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith(JSON));
        return new JSONObject(response.body());
    }

    /**
     * The {@code session} cookie a response sets, as its value under {@code "value"} and each
     * attribute under its lower-case name (a flag such as HttpOnly maps to ""), or null if it
     * sets none.
     */
    private static Map<String, String> sessionCookie(HttpResponse<String> response) {
        Map<String, String> found = null;
        for (String header : response.headers().allValues("Set-Cookie")) {
            String[] parts = header.split(";");
            if (!parts[0].trim().startsWith(AuthRoutes.SESSION_COOKIE + "=")) {
                continue;
            }
            assertNull("one session cookie per response: " + response.headers().allValues("Set-Cookie"), found);
            found = new HashMap<>();
            found.put("value", parts[0].trim().substring(AuthRoutes.SESSION_COOKIE.length() + 1));
            for (int i = 1; i < parts.length; i++) {
                String part = parts[i].trim();
                int equals = part.indexOf('=');
                found.put((equals < 0 ? part : part.substring(0, equals)).toLowerCase(),
                        equals < 0 ? "" : part.substring(equals + 1));
            }
        }
        return found;
    }

    /** Checks the attributes every session cookie has: path /, HttpOnly, SameSite=Lax. */
    private static void assertSessionCookieAttributes(Map<String, String> cookie) {
        assertNotNull(cookie);
        assertEquals("/", cookie.get("path"));
        assertTrue(cookie.toString(), cookie.containsKey("httponly"));
        assertEquals("lax", cookie.get("samesite").toLowerCase());
    }

    ////// /me

    @Test
    public void meSignedOut() throws Exception {
        JSONObject me = me(null);
        assertEquals(Set.of("signedIn", "discord", "testSignIn"), me.keySet());
        assertFalse(me.getBoolean("signedIn"));
        assertFalse(me.getBoolean("discord"));
        assertFalse(me.getBoolean("testSignIn"));
    }

    @Test
    public void meSaysWhichSignInsAreOn() throws Exception {
        ApplicationConfig.TEST_SIGN_IN = true;
        ApplicationConfig.DISCORD_CLIENT_ID = "client-id";
        ApplicationConfig.DISCORD_CLIENT_SECRET = "client-secret";
        ApplicationConfig.DISCORD_REDIRECT_URI = "http://localhost:3000/auth/discord/callback";
        JSONObject me = me(null);
        assertTrue(me.getBoolean("discord"));
        assertTrue(me.getBoolean("testSignIn"));

        // Discord sign-in needs all three variables.
        ApplicationConfig.DISCORD_CLIENT_SECRET = " ";
        assertFalse(me(null).getBoolean("discord"));
        ApplicationConfig.DISCORD_CLIENT_SECRET = "client-secret";
        ApplicationConfig.DISCORD_CLIENT_ID = null;
        assertFalse(me(null).getBoolean("discord"));
    }

    @Test
    public void meSignedInWithoutAName() throws Exception {
        String token = TestAccounts.signIn(store, "1", null);
        JSONObject me = me(token);
        assertEquals(Set.of("signedIn", "id", "username", "discordUsername", "test", "discord", "testSignIn"),
                me.keySet());
        assertTrue(me.getBoolean("signedIn"));
        assertEquals("test-1", me.getString("id"));
        assertTrue(me.isNull("username"));
        assertEquals("test-1", me.getString("discordUsername"));
        assertTrue(me.getBoolean("test"));
        assertFalse(me.getBoolean("discord"));
        assertFalse(me.getBoolean("testSignIn"));
    }

    @Test
    public void meSignedInWithAName() throws Exception {
        JSONObject me = me(TestAccounts.signIn(store, "1", "Rowan"));
        assertTrue(me.getBoolean("signedIn"));
        assertEquals("Rowan", me.getString("username"));
    }

    @Test
    public void meForADiscordAccount() throws Exception {
        Account account = store.upsertDiscordAccount("80351110224678912", "nelly", "a_1269e74af4df");
        JSONObject me = me(store.createSession(account.id()));
        assertEquals("80351110224678912", me.getString("id"));
        assertEquals("nelly", me.getString("discordUsername"));
        assertTrue(me.isNull("username"));
        assertFalse(me.getBoolean("test"));
    }

    /** Checks the response sets the session cookie again: the same token, with this max age. */
    private static void assertCookieSetAgain(String token, String maxAge, HttpResponse<String> response) {
        Map<String, String> cookie = sessionCookie(response);
        assertSessionCookieAttributes(cookie);
        assertEquals(token, cookie.get("value"));
        assertEquals(maxAge, cookie.get("max-age"));
    }

    @Test
    public void aSessionInItsLastDaysIsExtendedAndSetsTheCookieAgain() throws Exception {
        String token = TestAccounts.signIn(store, "1", "Rowan");
        now.addAndGet(2 * DAY_MS); // 28 days left
        assertCookieSetAgain(token, "2592000", get("/me", token)); // extended to 30 days
        assertEquals(now.get() + AccountStore.SESSION_MS, store.lookup(token).expiresAt());
    }

    /**
     * Every read that finds a session sets the cookie, extended or not, with the time the session
     * has left: on {@code /me}, {@code /check-login}, {@code /new-lobby} and {@code /me/username}.
     */
    @Test
    public void everyReadOfASessionSetsTheCookieWithTheTimeLeft() throws Exception {
        String token = TestAccounts.signIn(store, "1", "Rowan");
        assertCookieSetAgain(token, "2592000", get("/me", token)); // a new session: 30 days

        now.addAndGet(5 * HOUR_MS); // not old enough to extend: 30 days less 5 hours left
        String left = String.valueOf((AccountStore.SESSION_MS - 5 * HOUR_MS) / 1000);
        assertCookieSetAgain(token, left, get("/me", token));
        assertCookieSetAgain(token, left, get("/check-login?lobby=NONE", token)); // 404, signed in
        HttpResponse<String> made = get("/new-lobby", token);
        codes.add(made.body());
        assertEquals(200, made.statusCode());
        assertCookieSetAgain(token, left, made);
        assertCookieSetAgain(token, left, rename(token, "Rowena"));

        // A signed-out read sets none.
        for (String signedOut : Arrays.asList(null, "junk")) {
            assertNull(sessionCookie(get("/me", signedOut)));
            assertNull(sessionCookie(get("/check-login?lobby=NONE", signedOut)));
        }
    }

    /**
     * The /game handshake extends a session but cannot set the cookie (its upgrade's response
     * has gone): the next HTTP read, which extends nothing itself, sets it with the extension.
     */
    @Test
    public void aSessionExtendedByASocketSetsTheCookieOnTheNextRead() throws Exception {
        String token = TestAccounts.signIn(store, "1", "Rowan");
        now.addAndGet(2 * DAY_MS); // 28 days left
        long extendedAt = now.get();
        // A player's socket with no lobby: refused after its session is read, and extended.
        TestSocket.CloseInfo refused = TestSocket.connect(port, "", token).awaitClose();
        assertEquals("Must have the 'lobby' parameter.", refused.reason);
        assertEquals(extendedAt + AccountStore.SESSION_MS, store.lookup(token).expiresAt());

        now.addAndGet(HOUR_MS);
        assertFalse(store.lookup(token).renewed()); // /me's own read extends nothing now
        assertCookieSetAgain(token, String.valueOf((AccountStore.SESSION_MS - HOUR_MS) / 1000), get("/me", token));
    }

    ////// /me/username

    @Test
    public void aNameIsSavedNormalized() throws Exception {
        String token = TestAccounts.signIn(store, "1", null);
        HttpResponse<String> response = rename(token, " \u3000Long \u00A0\t Guest  ");
        assertEquals(200, response.statusCode());
        JSONObject body = new JSONObject(response.body());
        assertEquals(Set.of("username"), body.keySet());
        assertEquals("Long Guest", body.getString("username"));
        assertEquals("Long Guest", store.find("test-1").username());
        assertEquals("Long Guest", me(token).getString("username"));
    }

    @Test
    public void aJsonContentTypeMayHaveParameters() throws Exception {
        String token = TestAccounts.signIn(store, "1", "Rowan");
        HttpResponse<String> response = post("/me/username", token, "Application/JSON; charset=utf-8",
                new JSONObject().put("username", "Rowena").toString());
        assertEquals(200, response.statusCode());
        assertEquals("Rowena", store.find("test-1").username());
    }

    @Test
    public void eachProblemIs400WithItsMessage() throws Exception {
        String token = TestAccounts.signIn(store, "1", "Rowan");
        Map<String, String> cases = new LinkedHashMap<>();
        cases.put("   ", Usernames.BLANK);
        cases.put("\u00A0\u3000", Usernames.BLANK);
        cases.put("Thirteen char", Usernames.TOO_LONG);
        cases.put("bOt  12", Usernames.CPU_NAME);
        for (Map.Entry<String, String> entry : cases.entrySet()) {
            HttpResponse<String> response = rename(token, entry.getKey());
            assertEquals(entry.getKey(), 400, response.statusCode());
            assertEquals(entry.getKey(), entry.getValue(), response.body());
        }
        HttpResponse<String> noName = postJson("/me/username", token, "{}");
        assertEquals(400, noName.statusCode());
        assertEquals(Usernames.BLANK, noName.body());
        assertEquals("Rowan", store.find("test-1").username());
    }

    @Test
    public void aBodyThatIsNotAJsonObjectIs400() throws Exception {
        String token = TestAccounts.signIn(store, "1", "Rowan");
        for (String body : Arrays.asList("", "{oops", "[]", "\"Rowena\"", "{\"username\": 5}")) {
            HttpResponse<String> response = postJson("/me/username", token, body);
            assertEquals(body, 400, response.statusCode());
            assertFalse(body, response.body().isEmpty());
        }
        assertEquals("Rowan", store.find("test-1").username());
    }

    @Test
    public void renamingNeedsASession() throws Exception {
        HttpResponse<String> response = rename(null, "Rowan");
        assertEquals(401, response.statusCode());
        assertEquals("Sign in to play.", response.body());
    }

    @Test
    public void aNameTakenInAnotherCaseIs409() throws Exception {
        TestAccounts.signIn(store, "1", "Alice");
        String token = TestAccounts.signIn(store, "2", "Bea");
        HttpResponse<String> response = rename(token, "aLICE");
        assertEquals(409, response.statusCode());
        assertEquals(Usernames.TAKEN, response.body());
        assertEquals("Bea", store.find("test-2").username());
        assertEquals("Alice", store.find("test-1").username());
    }

    @Test
    public void aSeatInARunningGameIs403() throws Exception {
        String token = TestAccounts.signIn(store, "1", "Rowan");
        Lobby lobby = new Lobby();
        FakeSocket socket = FakeSocket.open();
        lobby.addUser(socket.ctx, "test-1", "Rowan");
        lobby.trySetUserIcon("p1", socket.ctx);
        ServerTesting.putLobby("RNMZ", lobby);
        codes.add("RNMZ");
        ServerTesting.startGame(lobby);

        HttpResponse<String> response = rename(token, "Rowena");
        assertEquals(403, response.statusCode());
        assertEquals(Usernames.IN_GAME, response.body());
        assertEquals("Rowan", store.find("test-1").username());
        assertEquals("test-1", lobby.seatAccounts().get("Rowan"));
    }

    @Test
    public void renamingNeedsAJsonContentType() throws Exception {
        String token = TestAccounts.signIn(store, "1", "Rowan");
        String body = new JSONObject().put("username", "Rowena").toString();
        for (String type : Arrays.asList(null, "text/plain", "application/x-www-form-urlencoded",
                "multipart/form-data; boundary=x", "application/jsonp", "text/plain; application/json")) {
            HttpResponse<String> response = post("/me/username", token, type, body);
            assertEquals(type, 415, response.statusCode());
        }
        assertEquals("Rowan", store.find("test-1").username());
    }

    ////// Cookies that match no session

    @Test
    public void aCookieThatMatchesNoSessionIsSignedOut() throws Exception {
        String signedOut = TestAccounts.signIn(store, "1", "Rowan");
        store.deleteSession(signedOut);
        String expired = TestAccounts.signIn(store, "2", "Bea");
        now.addAndGet(AccountStore.SESSION_MS);
        Set<String> lobbies = ServerTesting.lobbyCodes();

        for (String cookie : Arrays.asList("junk", "", "\"\"", "a b", signedOut, expired, signedOut + "x")) {
            JSONObject me = me(cookie);
            assertFalse(cookie, me.getBoolean("signedIn"));
            assertFalse(cookie, me.has("id"));

            HttpResponse<String> renamed = rename(cookie, "Mallory");
            assertEquals(cookie, 401, renamed.statusCode());
            assertEquals(cookie, "Sign in to play.", renamed.body());

            HttpResponse<String> newLobby = get("/new-lobby", cookie);
            assertEquals(cookie, 401, newLobby.statusCode());
            assertEquals(cookie, "Sign in to play.", newLobby.body());
        }
        assertEquals(lobbies, ServerTesting.lobbyCodes());
        assertEquals("Rowan", store.find("test-1").username());
        assertEquals("Bea", store.find("test-2").username());
    }

    ////// /auth/sign-out

    @Test
    public void signingOutEndsTheSessionAndClearsTheCookie() throws Exception {
        String token = TestAccounts.signIn(store, "1", "Rowan");
        HttpResponse<String> response = postJson("/auth/sign-out", token, "");
        assertEquals(204, response.statusCode());
        Map<String, String> cleared = sessionCookie(response);
        assertSessionCookieAttributes(cleared);
        assertEquals("", cleared.get("value"));
        assertEquals("0", cleared.get("max-age"));

        assertNull(store.lookup(token));
        assertFalse(me(token).getBoolean("signedIn"));
        assertEquals("Rowan", store.find("test-1").username()); // the account stays
    }

    @Test
    public void signingOutWithNoSessionStillClearsTheCookie() throws Exception {
        for (String token : Arrays.asList(null, "junk")) {
            HttpResponse<String> response = postJson("/auth/sign-out", token, "{}");
            assertEquals(204, response.statusCode());
            assertEquals("0", sessionCookie(response).get("max-age"));
        }
    }

    @Test
    public void aFailedSignOutStillClearsTheCookie() throws Exception {
        String token = TestAccounts.signIn(store, "1", "Rowan");
        store.close(); // every call to the store fails from now on
        try {
            HttpResponse<String> response = postJson("/auth/sign-out", token, "");
            assertEquals(500, response.statusCode()); // the row could not be deleted
            Map<String, String> cleared = sessionCookie(response);
            assertSessionCookieAttributes(cleared);
            assertEquals("", cleared.get("value"));
            assertEquals("0", cleared.get("max-age")); // but the browser is signed out
        } finally {
            store = AccountStore.open(null, now::get); // for stopServer() to close
            SecretHitlerServer.accounts = store;
        }
    }

    @Test
    public void signingOutNeedsAJsonContentType() throws Exception {
        String token = TestAccounts.signIn(store, "1", "Rowan");
        for (String type : Arrays.asList(null, "text/plain", "application/x-www-form-urlencoded")) {
            HttpResponse<String> response = post("/auth/sign-out", token, type, "");
            assertEquals(type, 415, response.statusCode());
            assertNull(type, sessionCookie(response));
        }
        assertNotNull(store.lookup(token));
    }

    ////// /auth/test-sign-in

    @Test
    public void testSignInIs404WhileOff() throws Exception {
        HttpResponse<String> response = testSignIn(new JSONObject().put("id", "3").put("username", "Guest 3"));
        assertEquals(404, response.statusCode());
        assertNull(sessionCookie(response));
        assertNull(store.find("test-3"));
    }

    @Test
    public void testSignInMakesTheAccountAndSetsTheCookie() throws Exception {
        ApplicationConfig.TEST_SIGN_IN = true;
        HttpResponse<String> response = testSignIn(new JSONObject().put("id", "3"));
        assertEquals(200, response.statusCode());
        JSONObject me = new JSONObject(response.body());
        assertTrue(me.getBoolean("signedIn"));
        assertEquals("test-3", me.getString("id"));
        assertEquals("test-3", me.getString("discordUsername"));
        assertTrue(me.isNull("username"));
        assertTrue(me.getBoolean("test"));
        assertTrue(me.getBoolean("testSignIn"));

        Map<String, String> cookie = sessionCookie(response);
        assertSessionCookieAttributes(cookie);
        assertEquals("2592000", cookie.get("max-age"));
        assertFalse(cookie.toString(), cookie.containsKey("secure")); // DISCORD_REDIRECT_URI is not https
        assertEquals("test-3", store.lookup(cookie.get("value")).account().id());
        assertEquals("test-3", me(cookie.get("value")).getString("id"));
    }

    @Test
    public void testSignInNamesTheAccount() throws Exception {
        ApplicationConfig.TEST_SIGN_IN = true;
        HttpResponse<String> first = testSignIn(new JSONObject().put("id", "3").put("username", " Long  Guest 3 "));
        assertEquals(200, first.statusCode());
        assertEquals("Long Guest 3", new JSONObject(first.body()).getString("username"));
        assertEquals("Long Guest 3", store.find("test-3").username());

        // Signing in again updates the same account: a new name, or none to keep the old one.
        HttpResponse<String> renamed = testSignIn(new JSONObject().put("id", "3").put("username", "Guest Three"));
        assertEquals(200, renamed.statusCode());
        assertEquals("Guest Three", new JSONObject(renamed.body()).getString("username"));
        HttpResponse<String> unnamed = testSignIn(new JSONObject().put("id", "3"));
        assertEquals(200, unnamed.statusCode());
        assertEquals("Guest Three", new JSONObject(unnamed.body()).getString("username"));
        assertEquals("Guest Three", store.find("test-3").username());
    }

    @Test
    public void testSignInRefusesATakenOrBrokenName() throws Exception {
        ApplicationConfig.TEST_SIGN_IN = true;
        TestAccounts.signIn(store, "1", "Alice");

        HttpResponse<String> taken = testSignIn(new JSONObject().put("id", "3").put("username", "ALICE"));
        assertEquals(409, taken.statusCode());
        assertEquals(Usernames.TAKEN, taken.body());
        assertNull(sessionCookie(taken));

        HttpResponse<String> cpu = testSignIn(new JSONObject().put("id", "3").put("username", "Bot 2"));
        assertEquals(400, cpu.statusCode());
        assertEquals(Usernames.CPU_NAME, cpu.body());
        assertNull(sessionCookie(cpu));

        HttpResponse<String> blank = testSignIn(new JSONObject().put("id", "3").put("username", " "));
        assertEquals(400, blank.statusCode());
        assertEquals(Usernames.BLANK, blank.body());

        Account account = store.find("test-3");
        assertTrue(account == null || account.username() == null);
    }

    @Test
    public void testSignInNeedsAJsonContentType() throws Exception {
        String body = new JSONObject().put("id", "3").put("username", "Guest 3").toString();
        // While off, the route looks absent whatever the request.
        assertEquals(404, post("/auth/test-sign-in", null, "text/plain", body).statusCode());

        ApplicationConfig.TEST_SIGN_IN = true;
        for (String type : Arrays.asList(null, "text/plain", "application/x-www-form-urlencoded",
                "multipart/form-data; boundary=x", "application/jsonp")) {
            HttpResponse<String> response = post("/auth/test-sign-in", null, type, body);
            assertEquals(type, 415, response.statusCode());
            assertNull(type, sessionCookie(response));
        }
        assertNull(store.find("test-3"));

        HttpResponse<String> json = post("/auth/test-sign-in", null, "application/json; charset=utf-8", body);
        assertEquals(200, json.statusCode());
        assertNotNull(sessionCookie(json));
    }

    @Test
    public void testSignInCannotRenameASeatedAccount() throws Exception {
        ApplicationConfig.TEST_SIGN_IN = true;
        TestAccounts.signIn(store, "3", "Guest 3");
        Lobby lobby = new Lobby();
        FakeSocket socket = FakeSocket.open();
        lobby.addUser(socket.ctx, "test-3", "Guest 3");
        lobby.trySetUserIcon("p1", socket.ctx);
        ServerTesting.putLobby("RNMY", lobby);
        codes.add("RNMY");
        ServerTesting.startGame(lobby);

        HttpResponse<String> response = testSignIn(new JSONObject().put("id", "3").put("username", "Guest Three"));
        assertEquals(403, response.statusCode());
        assertEquals(Usernames.IN_GAME, response.body());
        assertNull(sessionCookie(response));
        assertEquals("Guest 3", store.find("test-3").username());
    }

    @Test
    public void testSignInNeedsAnId() throws Exception {
        ApplicationConfig.TEST_SIGN_IN = true;
        for (String body : Arrays.asList("{}", "{\"id\": \"\"}", "{\"id\": \"  \"}", "{\"id\": null}",
                "{\"id\": 3}", "{oops", "[]", "")) {
            HttpResponse<String> response = postJson("/auth/test-sign-in", null, body);
            assertEquals(body, 400, response.statusCode());
            assertNull(body, sessionCookie(response));
        }
    }

    @Test
    public void theCookieIsSecureOnlyBehindHttps() throws Exception {
        ApplicationConfig.TEST_SIGN_IN = true;
        ApplicationConfig.DISCORD_REDIRECT_URI = "https://example.test/auth/discord/callback";
        HttpResponse<String> signedIn = testSignIn(new JSONObject().put("id", "3"));
        assertTrue(sessionCookie(signedIn).containsKey("secure"));
        String token = sessionCookie(signedIn).get("value");
        assertTrue(sessionCookie(postJson("/auth/sign-out", token, "")).containsKey("secure"));

        ApplicationConfig.DISCORD_REDIRECT_URI = "http://localhost:3000/auth/discord/callback";
        assertFalse(sessionCookie(testSignIn(new JSONObject().put("id", "3"))).containsKey("secure"));
    }

    ////// /new-lobby

    @Test
    public void newLobbyNeedsAnAccountWithAName() throws Exception {
        Set<String> lobbies = ServerTesting.lobbyCodes();
        HttpResponse<String> signedOut = get("/new-lobby", null);
        assertEquals(401, signedOut.statusCode());
        assertEquals("Sign in to play.", signedOut.body());
        HttpResponse<String> unnamed = get("/new-lobby", TestAccounts.signIn(store, "1", null));
        assertEquals(401, unnamed.statusCode());
        assertEquals("Sign in to play.", unnamed.body());
        assertEquals(lobbies, ServerTesting.lobbyCodes());

        HttpResponse<String> named = get("/new-lobby", TestAccounts.signIn(store, "2", "Bea"));
        assertEquals(200, named.statusCode());
        codes.add(named.body());
        assertTrue(ServerTesting.lobbyCodes().contains(named.body()));
    }

    @Test
    public void aRefusedNewLobbyRunsNoSweep() throws Exception {
        long savedTimeout = Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN;
        Lobby timedOut;
        try {
            Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN = 0;
            timedOut = new Lobby(); // times out at once
        } finally {
            Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN = savedTimeout;
        }
        ServerTesting.putLobby("SWPZ", timedOut);
        codes.add("SWPZ");

        assertEquals(401, get("/new-lobby", null).statusCode());
        assertTrue(ServerTesting.lobbyCodes().contains("SWPZ"));
        assertFalse(timedOut.isClosed());
    }

    ////// Secrets

    @Test
    public void noTokenIsLogged() throws Exception {
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        ch.qos.logback.classic.Logger root = (ch.qos.logback.classic.Logger) LoggerFactory
                .getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        root.addAppender(appender);
        String token;
        try {
            ApplicationConfig.TEST_SIGN_IN = true;
            HttpResponse<String> signedIn = testSignIn(new JSONObject().put("id", "3").put("username", "Guest 3"));
            token = sessionCookie(signedIn).get("value");
            me(token);
            rename(token, "Guest Three");
            HttpResponse<String> newLobby = get("/new-lobby", token);
            codes.add(newLobby.body());
            now.addAndGet(2 * DAY_MS);
            me(token); // renews
            postJson("/auth/sign-out", token, "");
        } finally {
            root.detachAppender(appender);
        }
        assertFalse(appender.list.isEmpty()); // the appender saw the server's logs
        for (ILoggingEvent event : appender.list) {
            assertFalse(event.getFormattedMessage(), event.getFormattedMessage().contains(token));
            if (event.getThrowableProxy() != null) {
                assertFalse(event.getThrowableProxy().getMessage(),
                        String.valueOf(event.getThrowableProxy().getMessage()).contains(token));
            }
        }
    }
}
