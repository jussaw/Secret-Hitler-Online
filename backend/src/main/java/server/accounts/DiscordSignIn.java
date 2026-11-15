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
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Supplier;
import java.util.regex.Pattern;
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
    private static final String USER_AGENT = "secret-hitler-online";
    private static final Pattern SNOWFLAKE = Pattern.compile("[0-9]{1,20}");
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
            Object id = user.opt("id");
            if (!(id instanceof String) || !SNOWFLAKE.matcher((String) id).matches()) {
                throw new Failure("Discord's user had no valid id");
            }
            String username = user.optString("username", "");
            String avatar = user.isNull("avatar") ? null : user.optString("avatar", null);
            try {
                Account account = SecretHitlerServer.accounts.upsertDiscordAccount((String) id,
                        username.isEmpty() ? (String) id : username, avatar);
                AuthRoutes.startSession(ctx, account.id());
            } catch (RuntimeException e) {
                throw new Failure("saving the account failed: " + e.getClass().getSimpleName());
            }
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
        JSONObject answer = call("the token exchange", () -> HttpRequest
                .newBuilder(URI.create(apiBase + "/oauth2/token"))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form)));
        String token = answer.optString("access_token", "");
        if (token.isEmpty()) {
            throw new Failure("the token exchange gave no access token");
        }
        return token;
    }

    private static JSONObject readUser(String token) throws Failure {
        return call("reading the user", () -> HttpRequest.newBuilder(URI.create(apiBase + "/users/@me"))
                .header("Authorization", "Bearer " + token)
                .GET());
    }

    /**
     * Builds and sends the request and parses a 2xx answer as a JSON object, all within one
     * deadline of {@code TIMEOUT} that covers connecting, the headers and the whole body (the
     * request's own timeout stops once the headers arrive). Any failure, including a
     * RuntimeException from building the request, is a Failure that names only its class and
     * logs no body and no header.
     */
    private static JSONObject call(String what, Supplier<HttpRequest.Builder> builder) throws Failure {
        CompletableFuture<HttpResponse<String>> future = null;
        try {
            HttpRequest request = builder.get()
                    .timeout(TIMEOUT)
                    .header("Accept", "application/json")
                    .header("User-Agent", USER_AGENT)
                    .build();
            future = client().sendAsync(request, HttpResponse.BodyHandlers.ofString());
            HttpResponse<String> response = future.get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
            if (response.statusCode() / 100 != 2) {
                throw new Failure(what + " answered " + response.statusCode());
            }
            return new JSONObject(response.body());
        } catch (InterruptedException e) {
            cancel(future);
            Thread.currentThread().interrupt();
            throw new Failure(what + " was interrupted");
        } catch (TimeoutException e) {
            cancel(future);
            throw new Failure(what + " timed out");
        } catch (Failure e) {
            throw e;
        } catch (ExecutionException e) {
            Throwable cause = e.getCause() == null ? e : e.getCause();
            throw new Failure(what + " failed: " + cause.getClass().getSimpleName());
        } catch (RuntimeException e) {
            cancel(future);
            throw new Failure(what + " failed: " + e.getClass().getSimpleName());
        }
    }

    private static void cancel(CompletableFuture<?> future) {
        if (future != null) {
            future.cancel(true);
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
