package server.accounts;

import io.javalin.http.ContentType;
import io.javalin.http.Context;
import io.javalin.http.Cookie;
import io.javalin.http.SameSite;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import server.ApplicationConfig;
import server.SecretHitlerServer;

/**
 * Signing in with Discord, the OAuth2 authorization-code flow ({@code scope=identify}). {@code
 * GET /auth/discord} sets a one-use {@code oauth-state} cookie and sends the browser to Discord;
 * {@code GET /auth/discord/callback} checks the state, trades the code for an access token, reads
 * the user, makes or updates the account, starts a session and goes home. Any failure goes to
 * {@code /?signin=failed}. The code, the state, the access token and the client secret are never
 * logged, and nothing from the callback's own query string is ever put in a redirect: only a
 * lobby code the start request carried, and that was checked, comes back. The access token is
 * used for one read and neither stored nor revoked.
 */
public final class DiscordSignIn {
    public static final String STATE_COOKIE = "oauth-state";
    public static final String NOT_SET_UP = "Sign-in is not set up on this server.";

    /** Where the browser is sent to approve the sign-in. Not final, so tests can point it at a fake. */
    public static String authorizeUrl = "https://discord.com/oauth2/authorize";
    /** The base of Discord's API. Not final, so tests can point it at a fake. */
    public static String apiBase = "https://discord.com/api";
    /** How long the server waits to connect to Discord and for each answer. */
    public static Duration TIMEOUT = Duration.ofSeconds(10);

    private static final Logger LOG = LoggerFactory.getLogger(DiscordSignIn.class);
    private static final String STATE_PATH = "/auth";
    private static final int STATE_MAX_AGE_SECONDS = 600;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String FAILED = "/?signin=failed";

    private static HttpClient client;

    private DiscordSignIn() {
    }

    /** A failure to sign in, with a reason that is safe to log. */
    private static final class Failure extends Exception {
        Failure(String reason) {
            super(reason);
        }
    }

    /**
     * The code if it is {@code SecretHitlerServer.CODE_LENGTH} characters of the lobby code
     * alphabet, else null.
     */
    public static String validLobbyCode(String raw) {
        if (raw == null || raw.length() != SecretHitlerServer.CODE_LENGTH) {
            return null;
        }
        for (int i = 0; i < raw.length(); i++) {
            if (SecretHitlerServer.CODE_CHARACTERS.indexOf(raw.charAt(i)) < 0) {
                return null;
            }
        }
        return raw;
    }

    ////// Step 1: to Discord

    /** {@code GET /auth/discord[?lobby=CODE]}: 503 when not set up, else 302 to Discord. */
    public static void start(Context ctx) {
        if (!ApplicationConfig.discordConfigured()) {
            ctx.status(503);
            ctx.contentType(ContentType.TEXT_PLAIN);
            ctx.result(NOT_SET_UP);
            return;
        }
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String state = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        String lobby = validLobbyCode(ctx.queryParam("lobby"));
        setStateCookie(ctx, lobby == null ? state : state + "." + lobby, STATE_MAX_AGE_SECONDS);
        ctx.redirect(authorizeUrl + "?response_type=code"
                + "&client_id=" + encode(ApplicationConfig.DISCORD_CLIENT_ID)
                + "&scope=identify"
                + "&redirect_uri=" + encode(ApplicationConfig.DISCORD_REDIRECT_URI)
                + "&state=" + encode(state));
    }

    ////// Steps 2 to 4: back from Discord

    /** {@code GET /auth/discord/callback}: signs in and goes home, or goes to {@code /?signin=failed}. */
    public static void callback(Context ctx) {
        String cookie = ctx.cookie(STATE_COOKIE);
        setStateCookie(ctx, "", 0); // one use, whatever happens
        String lobby = null;
        try {
            if (!ApplicationConfig.discordConfigured()) {
                throw new Failure("sign-in is not set up");
            }
            if (cookie == null) {
                throw new Failure("no state cookie");
            }
            int dot = cookie.indexOf('.');
            String expected = dot < 0 ? cookie : cookie.substring(0, dot);
            if (dot >= 0) {
                lobby = validLobbyCode(cookie.substring(dot + 1));
            }
            if (ctx.queryParam("error") != null) {
                throw new Failure("Discord reported an error or a cancel");
            }
            String code = ctx.queryParam("code");
            String state = ctx.queryParam("state");
            if (code == null || code.isEmpty() || state == null || state.isEmpty()) {
                throw new Failure("the callback had no code or state");
            }
            if (expected.isEmpty() || !MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                    state.getBytes(StandardCharsets.UTF_8))) {
                throw new Failure("the state did not match");
            }
            String token = exchange(code);
            JSONObject user = readUser(token);
            String id = user.optString("id", "");
            if (id.isEmpty()) {
                throw new Failure("Discord's user had no id");
            }
            String username = user.optString("username", "");
            String avatar = user.isNull("avatar") ? null : user.optString("avatar", null);
            Account account = SecretHitlerServer.accounts.upsertDiscordAccount(id,
                    username.isEmpty() ? id : username, avatar);
            AuthRoutes.startSession(ctx, account.id());
            ctx.redirect(lobby == null ? "/" : "/?lobby=" + lobby);
        } catch (Failure e) {
            LOG.info("Discord sign-in failed: {}", e.getMessage());
            ctx.redirect(lobby == null ? FAILED : FAILED + "&lobby=" + lobby);
        }
    }

    /** Trades the authorization code for an access token. */
    private static String exchange(String code) throws Failure {
        String form = "grant_type=authorization_code"
                + "&code=" + encode(code)
                + "&redirect_uri=" + encode(ApplicationConfig.DISCORD_REDIRECT_URI)
                + "&client_id=" + encode(ApplicationConfig.DISCORD_CLIENT_ID)
                + "&client_secret=" + encode(ApplicationConfig.DISCORD_CLIENT_SECRET);
        HttpRequest request = HttpRequest.newBuilder(uri(apiBase + "/oauth2/token"))
                .timeout(TIMEOUT)
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(form))
                .build();
        String token = call(request, "the token exchange").optString("access_token", "");
        if (token.isEmpty()) {
            throw new Failure("the token exchange gave no access token");
        }
        return token;
    }

    private static JSONObject readUser(String token) throws Failure {
        HttpRequest request = HttpRequest.newBuilder(uri(apiBase + "/users/@me"))
                .timeout(TIMEOUT)
                .header("Authorization", "Bearer " + token)
                .header("Accept", "application/json")
                .GET()
                .build();
        return call(request, "reading the user");
    }

    /** Sends the request and parses a 2xx answer as a JSON object. Logs no body. */
    private static JSONObject call(HttpRequest request, String what) throws Failure {
        try {
            HttpResponse<String> response = client().send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                throw new Failure(what + " answered " + response.statusCode());
            }
            return new JSONObject(response.body());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new Failure(what + " was interrupted");
        } catch (Failure e) {
            throw e;
        } catch (Exception e) {
            throw new Failure(what + " failed: " + e.getClass().getSimpleName());
        }
    }

    private static URI uri(String text) throws Failure {
        try {
            return URI.create(text);
        } catch (IllegalArgumentException e) {
            throw new Failure("the Discord address is not valid");
        }
    }

    private static synchronized HttpClient client() {
        if (client == null) {
            client = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
        }
        return client;
    }

    ////// Helpers

    private static void setStateCookie(Context ctx, String value, int maxAgeSeconds) {
        ctx.cookie(new Cookie(STATE_COOKIE, value, STATE_PATH, maxAgeSeconds, ApplicationConfig.secureCookies(), 0,
                true, null, null, SameSite.LAX));
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
