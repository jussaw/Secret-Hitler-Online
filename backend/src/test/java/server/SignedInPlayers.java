package server;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.rules.ExternalResource;
import server.accounts.AccountStore;

/**
 * The accounts of a server test's players, as a JUnit rule: each test gets a fresh account store
 * of its own in {@code SecretHitlerServer.accounts}, on a clock the test can move on, and
 * {@code DISCORD_REDIRECT_URI} unset, so a player's socket is checked against the {@code Host} it
 * connects to (the origin {@code TestSocket} sends). Both are put back after the test.
 */
public final class SignedInPlayers extends ExternalResource {
    private final AtomicLong now = new AtomicLong(System.currentTimeMillis());
    private final Map<String, String> sessions = new ConcurrentHashMap<>();
    private AccountStore store;
    private AccountStore savedStore;
    private String savedRedirectUri;

    @Override
    protected void before() {
        savedStore = SecretHitlerServer.accounts;
        savedRedirectUri = ApplicationConfig.DISCORD_REDIRECT_URI;
        store = AccountStore.open(null, now::get);
        SecretHitlerServer.accounts = store;
        ApplicationConfig.DISCORD_REDIRECT_URI = null;
    }

    @Override
    protected void after() {
        SecretHitlerServer.accounts = savedStore;
        ApplicationConfig.DISCORD_REDIRECT_URI = savedRedirectUri;
        store.close();
    }

    public AccountStore store() {
        return store;
    }

    /** The ID of the account of the player named {@code name}: {@code test-<name>}. */
    public static String account(String name) {
        return TestAccounts.account(name);
    }

    /**
     * The session of the player named {@code name}: the test account {@code test-<name>} with that
     * name, signed in the first time it is asked for. The same session after that.
     */
    public String session(String name) {
        return sessions.computeIfAbsent(name, n -> TestAccounts.signIn(store, n, n));
    }

    /** Signs the player named {@code name} in again: a new session, which {@code session} gives from now on. */
    public String signInAgain(String name) {
        String token = TestAccounts.signIn(store, name, name);
        sessions.put(name, token);
        return token;
    }

    /** Moves the store's clock on, which ages every session. */
    public void passTime(long ms) {
        now.addAndGet(ms);
    }

    /** GETs {@code /check-login?<query>} on the server at {@code port}, with the session's cookie, or none for null. */
    public static HttpResponse<String> checkLogin(int port, String query, String sessionToken) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(
                URI.create("http://localhost:" + port + "/check-login?" + query));
        if (sessionToken != null) {
            request.header("Cookie", "session=" + sessionToken);
        }
        return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
}
