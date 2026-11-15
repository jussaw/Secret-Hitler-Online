package server;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/**
 * {@code SecretHitlerServer.sameOrigin}: a player's {@code Origin} against the server's own origin,
 * which is the {@code Host} header's host and port, or the scheme, host and port of
 * {@code DISCORD_REDIRECT_URI} when that is set. Hosts that {@code java.net.URI} cannot read as a
 * server's (one with an underscore) are compared like any other; a missing or garbage
 * {@code Origin} never matches.
 */
public class SameOriginTest {
    private String savedRedirectUri;

    @Before
    public void noRedirectUri() {
        savedRedirectUri = ApplicationConfig.DISCORD_REDIRECT_URI;
        ApplicationConfig.DISCORD_REDIRECT_URI = null;
    }

    @After
    public void restore() {
        ApplicationConfig.DISCORD_REDIRECT_URI = savedRedirectUri;
    }

    private static void accepted(String origin, String host) {
        assertTrue(origin + " from " + host, SecretHitlerServer.sameOrigin(origin, host));
    }

    private static void refused(String origin, String host) {
        assertFalse(origin + " from " + host, SecretHitlerServer.sameOrigin(origin, host));
    }

    @Test
    public void theHostsOwnOriginIsAccepted() {
        accepted("http://localhost:4040", "localhost:4040");
        accepted("http://my_host:8080", "my_host:8080"); // no host to java.net.URI
        accepted("http://My_Host:8080", "my_host:8080"); // hosts ignore case
        accepted("http://my_host", "my_host"); // both on http's 80
        accepted("http://my_host:80", "my_host");
        accepted("http://my_host", "my_host:80");
        accepted("https://my_host", "my_host:443");
        accepted("https://my_host:443", "my_host");
        // A Host with no port has the default of the scheme the page used, which TLS ending at a
        // proxy hides from the server: the Origin's.
        accepted("https://my_host", "my_host");
        accepted("http://[::1]:4040", "[::1]:4040");
        accepted("http://[::1]", "[::1]:80");
        accepted("http://192.168.0.7:4040", "192.168.0.7:4040");
    }

    @Test
    public void anotherHostOrPortIsRefused() {
        refused("http://my_host:8081", "my_host:8080");
        refused("http://other_host:8080", "my_host:8080");
        refused("http://my_host", "my_host:8080");
        refused("https://my_host", "my_host:80"); // 443 against 80
        refused("http://[::1]:4040", "[::2]:4040");
        refused("http://127.0.0.1:4040", "localhost:4040");
    }

    @Test
    public void aMissingOrGarbageOriginIsRefused() {
        for (String origin : Arrays.asList(null, "", " ", "null", "my_host:8080", "//my_host:8080",
                "ftp://my_host:8080", "ws://my_host:8080", "http://", "http://:8080", "http://my_host:",
                "http://my_host:x", "http://my_host:99999", "http://my_host:-1", "http://my_host:8080/",
                "http://my_host:8080/page", "http://my_host:8080?x", "http://my_host:8080#x",
                "http://user@my_host:8080", "http://my host:8080", "http://my_host:8080:8080",
                "http://::1:4040", "http://[::1", "http://[]:4040", "http://[::1]4040",
                "http://[::1]:x", "http://h" + (char) 0xF6 + "st:8080")) { // a host beyond ASCII
            refused(origin, "my_host:8080");
        }
    }

    @Test
    public void aMissingOrGarbageHostMatchesNothing() {
        for (String host : Arrays.asList(null, "", ":8080", "my_host:", "my_host:x", "my host:8080",
                "user@my_host:8080", "[::1", "my_host:8080:8080")) {
            refused("http://my_host:8080", host);
        }
    }

    @Test
    public void theRedirectUrisOriginIsTheServersWhenSet() {
        ApplicationConfig.DISCORD_REDIRECT_URI = "https://play_box.example.test/auth/discord/callback?x=1";
        accepted("https://play_box.example.test", "localhost:4040"); // the Host is not asked
        accepted("https://PLAY_BOX.example.test:443", "localhost:4040");
        refused("http://play_box.example.test", "play_box.example.test"); // scheme
        refused("https://play_box.example.test:8443", "play_box.example.test:8443");
        refused("http://localhost:4040", "localhost:4040");
        refused(null, "play_box.example.test");
        refused("https://play_box.example.test/", "play_box.example.test");

        ApplicationConfig.DISCORD_REDIRECT_URI = "http://my_host:3000/auth/discord/callback";
        accepted("http://my_host:3000", "localhost:4040");
        refused("http://my_host", "my_host");
        refused("https://my_host:3000", "my_host:3000");

        // A redirect URI with no origin in it lets no one in.
        for (String uri : Arrays.asList("not a url", "https://", "https://user@my_host/cb", "ftp://my_host/cb")) {
            ApplicationConfig.DISCORD_REDIRECT_URI = uri;
            refused("https://my_host", "my_host");
            refused("ftp://my_host", "my_host");
        }

        ApplicationConfig.DISCORD_REDIRECT_URI = " "; // blank is unset: the Host is asked
        accepted("http://my_host:8080", "my_host:8080");
    }
}
