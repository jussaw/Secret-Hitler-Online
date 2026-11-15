package server.accounts;

import io.javalin.http.ContentType;
import io.javalin.http.Context;
import io.javalin.http.Cookie;
import io.javalin.http.NotFoundResponse;
import io.javalin.http.SameSite;
import org.json.JSONException;
import org.json.JSONObject;
import server.ApplicationConfig;
import server.SecretHitlerServer;

/**
 * The account routes: who is signed in ({@code GET /me}), choosing a name
 * ({@code POST /me/username}), signing out ({@code POST /auth/sign-out}) and the test sign-in of
 * local runs ({@code POST /auth/test-sign-in}). A session is the {@code session} cookie, whose
 * token the account store keeps only hashed. A cookie that matches no live session (junk, empty,
 * signed out, expired) is signed out, never an error. No token is ever logged.
 */
public final class AuthRoutes {
    public static final String SESSION_COOKIE = "session";
    /** The answer to a request that needs a signed-in account with a name. */
    public static final String SIGN_IN_TO_PLAY = "Sign in to play.";
    /** The session cookie's life, which is the session's: 30 days. */
    private static final int SESSION_MAX_AGE_SECONDS = (int) (AccountStore.SESSION_MS / 1000);

    private static final String NOT_JSON = "The request must be sent as application/json.";
    private static final String NOT_AN_OBJECT = "The request must be a JSON object.";
    private static final String NO_TEST_ID = "A test sign-in needs an id.";

    private static final String JSON = "application/json";

    private AuthRoutes() {
    }

    /** A request the route refuses with 400 and this message. */
    private static final class BadRequest extends Exception {
        BadRequest(String message) {
            super(message);
        }
    }

    ////// Sessions

    /**
     * The account the request's {@code session} cookie is signed in as. A session with under
     * {@code AccountStore.RENEW_BELOW_MS} left is extended, and the cookie is set again with it.
     *
     * @return the account, or null when the request is signed out: no cookie, or one that matches
     *         no live session.
     */
    public static Account signedIn(Context ctx) {
        String token = ctx.cookie(SESSION_COOKIE);
        if (token == null || token.isBlank()) {
            return null;
        }
        AccountStore.SessionLookup session = SecretHitlerServer.accounts.lookup(token);
        if (session == null) {
            return null;
        }
        if (session.renewed()) {
            setSessionCookie(ctx, token, SESSION_MAX_AGE_SECONDS);
        }
        return session.account();
    }

    /** Starts a session for the account and sets its cookie on the response. */
    public static void startSession(Context ctx, String accountId) {
        setSessionCookie(ctx, SecretHitlerServer.accounts.createSession(accountId), SESSION_MAX_AGE_SECONDS);
    }

    /**
     * Sets the session cookie: HttpOnly, SameSite=Lax, path {@code /}, and Secure when the server
     * is reached over https ({@code ApplicationConfig.secureCookies}). A max age of 0 with an empty
     * value clears it.
     */
    private static void setSessionCookie(Context ctx, String token, int maxAgeSeconds) {
        ctx.cookie(new Cookie(SESSION_COOKIE, token, "/", maxAgeSeconds, ApplicationConfig.secureCookies(), 0,
                true, null, null, SameSite.LAX));
    }

    ////// Routes

    /**
     * The body of {@code GET /me}: {@code signedIn}, and for a signed-in account its {@code id},
     * {@code username} (null until chosen), {@code discordUsername} and {@code test}; then which
     * sign-ins the server offers, {@code discord} and {@code testSignIn}.
     *
     * @param account the signed-in account, or null when signed out.
     */
    public static JSONObject me(Account account) {
        JSONObject me = new JSONObject();
        me.put("signedIn", account != null);
        if (account != null) {
            me.put("id", account.id());
            me.put("username", orNull(account.username()));
            me.put("discordUsername", orNull(account.discordUsername()));
            me.put("test", account.isTest());
        }
        me.put("discord", ApplicationConfig.discordConfigured());
        me.put("testSignIn", ApplicationConfig.TEST_SIGN_IN);
        return me;
    }

    /** {@code GET /me}: 200 with {@link #me}'s body. */
    public static void getMe(Context ctx) {
        json(ctx, 200, me(signedIn(ctx)));
    }

    /**
     * {@code POST /me/username}, JSON {@code {"username"}}: renames the signed-in account
     * everywhere ({@code SecretHitlerServer.renameAccount}). 200 {@code {"username"}} with the
     * normalized name; 400 for a blank, too long or CPU player's name, or a body that is not a JSON
     * object; 401 signed out; 403 seated in a running game; 409 taken; 415 not sent as JSON. An
     * error's body is its message.
     */
    public static void postUsername(Context ctx) {
        if (!isJson(ctx)) {
            refuse(ctx, 415, NOT_JSON);
            return;
        }
        Account account = signedIn(ctx);
        if (account == null) {
            refuse(ctx, 401, SIGN_IN_TO_PLAY);
            return;
        }
        String raw;
        try {
            raw = optionalString(jsonBody(ctx), "username");
        } catch (BadRequest e) {
            refuse(ctx, 400, e.getMessage());
            return;
        }
        String name = Usernames.normalize(raw == null ? "" : raw);
        Usernames.Problem problem = Usernames.problem(name);
        if (problem != null) {
            refuse(ctx, 400, message(problem));
            return;
        }
        switch (SecretHitlerServer.renameAccount(account.id(), name)) {
            case SEATED -> refuse(ctx, 403, Usernames.IN_GAME);
            case TAKEN -> refuse(ctx, 409, Usernames.TAKEN);
            case SAVED -> json(ctx, 200, new JSONObject().put("username", name));
        }
    }

    /**
     * {@code POST /auth/sign-out}: ends the request's session, if it has one, and clears the
     * cookie. 204, also when there was no session; 415 not sent as JSON. Connections already open
     * stay open until they close.
     */
    public static void postSignOut(Context ctx) {
        if (!isJson(ctx)) {
            refuse(ctx, 415, NOT_JSON);
            return;
        }
        SecretHitlerServer.accounts.deleteSession(ctx.cookie(SESSION_COOKIE));
        setSessionCookie(ctx, "", 0);
        ctx.status(204);
    }

    /**
     * {@code POST /auth/test-sign-in}, JSON {@code {"id", "username"}} with the username optional:
     * only while {@code ApplicationConfig.TEST_SIGN_IN} is on (404 otherwise). Makes or updates the
     * account {@code test-<id>}, names it under the usual rules if a username is given, starts a
     * session and sets the cookie. 200 with {@link #me}'s body; 400 for a missing or blank id, a
     * broken name or a body that is not a JSON object; 403 seated in a running game; 409 a taken
     * name. A refused sign-in starts no session.
     */
    public static void postTestSignIn(Context ctx) {
        if (!ApplicationConfig.TEST_SIGN_IN) {
            throw new NotFoundResponse();
        }
        String id;
        String raw;
        try {
            JSONObject body = jsonBody(ctx);
            id = optionalString(body, "id");
            raw = optionalString(body, "username");
        } catch (BadRequest e) {
            refuse(ctx, 400, e.getMessage());
            return;
        }
        if (id == null || id.isBlank()) {
            refuse(ctx, 400, NO_TEST_ID);
            return;
        }
        String name = raw == null ? null : Usernames.normalize(raw);
        Usernames.Problem problem = name == null ? null : Usernames.problem(name);
        if (problem != null) {
            refuse(ctx, 400, message(problem));
            return;
        }
        Account account = SecretHitlerServer.accounts.upsertTestAccount(id);
        if (name != null) {
            switch (SecretHitlerServer.renameAccount(account.id(), name)) {
                case SEATED -> {
                    refuse(ctx, 403, Usernames.IN_GAME);
                    return;
                }
                case TAKEN -> {
                    refuse(ctx, 409, Usernames.TAKEN);
                    return;
                }
                case SAVED -> account = SecretHitlerServer.accounts.find(account.id());
            }
        }
        startSession(ctx, account.id());
        json(ctx, 200, me(account));
    }

    ////// Requests and answers

    /** Whether the request says its body is JSON: {@code application/json}, with any parameters. */
    private static boolean isJson(Context ctx) {
        String type = ctx.header("Content-Type");
        if (type == null) {
            return false;
        }
        int parameters = type.indexOf(';');
        return (parameters < 0 ? type : type.substring(0, parameters)).trim().equalsIgnoreCase(JSON);
    }

    private static JSONObject jsonBody(Context ctx) throws BadRequest {
        try {
            return new JSONObject(ctx.body());
        } catch (JSONException e) {
            throw new BadRequest(NOT_AN_OBJECT);
        }
    }

    /** The field's text, or null when it is missing or null. */
    private static String optionalString(JSONObject body, String key) throws BadRequest {
        if (body.isNull(key)) {
            return null;
        }
        Object value = body.get(key);
        if (!(value instanceof String)) {
            throw new BadRequest("The " + key + " must be text.");
        }
        return (String) value;
    }

    private static String message(Usernames.Problem problem) {
        return switch (problem) {
            case BLANK -> Usernames.BLANK;
            case TOO_LONG -> Usernames.TOO_LONG;
            case CPU_NAME -> Usernames.CPU_NAME;
        };
    }

    private static Object orNull(String value) {
        return value == null ? JSONObject.NULL : value;
    }

    private static void json(Context ctx, int status, JSONObject body) {
        ctx.status(status);
        ctx.contentType(ContentType.APPLICATION_JSON);
        ctx.result(body.toString());
    }

    private static void refuse(Context ctx, int status, String message) {
        ctx.status(status);
        ctx.contentType(ContentType.TEXT_PLAIN);
        ctx.result(message);
    }
}
