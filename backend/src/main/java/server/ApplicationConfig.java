package server;

/** The server's settings, from environment variables. Not final, so tests can set them. */
public class ApplicationConfig {
    private static final String ENV_DEBUG = "DEBUG_MODE";
    private static final String ENV_DATABASE_PATH = "DATABASE_PATH";
    private static final String ENV_DISCORD_CLIENT_ID = "DISCORD_CLIENT_ID";
    private static final String ENV_DISCORD_CLIENT_SECRET = "DISCORD_CLIENT_SECRET";
    private static final String ENV_DISCORD_REDIRECT_URI = "DISCORD_REDIRECT_URI";
    private static final String ENV_TEST_SIGN_IN = "TEST_SIGN_IN";

    public static boolean DEBUG = System.getenv(ENV_DEBUG) != null;
    /**
     * Path of the SQLite file for lobby backups, accounts and sessions. Unset or blank backs up
     * nothing and keeps accounts in memory.
     */
    public static String DATABASE_PATH = System.getenv(ENV_DATABASE_PATH);

    /** The Discord application's client ID. */
    public static String DISCORD_CLIENT_ID = System.getenv(ENV_DISCORD_CLIENT_ID);
    /** The Discord application's client secret. Never logged. */
    public static String DISCORD_CLIENT_SECRET = System.getenv(ENV_DISCORD_CLIENT_SECRET);
    /** The callback URL registered with the Discord application: https://<host>/auth/discord/callback. */
    public static String DISCORD_REDIRECT_URI = System.getenv(ENV_DISCORD_REDIRECT_URI);
    /** Whether POST /auth/test-sign-in signs anyone in as a test account: local runs and tests only. */
    public static boolean TEST_SIGN_IN = "true".equals(System.getenv(ENV_TEST_SIGN_IN));

    /** Whether Discord sign-in is on: all three Discord variables are set. */
    public static boolean discordConfigured() {
        return isSet(DISCORD_CLIENT_ID) && isSet(DISCORD_CLIENT_SECRET) && isSet(DISCORD_REDIRECT_URI);
    }

    /**
     * Whether cookies are marked Secure: the redirect URL is https. TLS may end at a proxy in front
     * of the server, so the request itself cannot tell.
     */
    public static boolean secureCookies() {
        return DISCORD_REDIRECT_URI != null && DISCORD_REDIRECT_URI.startsWith("https:");
    }

    private static boolean isSet(String value) {
        return value != null && !value.isBlank();
    }
}
