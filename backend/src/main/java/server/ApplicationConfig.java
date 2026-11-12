package server;

public class ApplicationConfig {
    private static final String ENV_DEBUG = "DEBUG_MODE";
    private static final String ENV_DATABASE_PATH = "DATABASE_PATH";

    public static boolean DEBUG = System.getenv(ENV_DEBUG) != null;
    /** Path of the SQLite backup file. Unset or blank disables persistence. */
    public static String DATABASE_PATH = System.getenv(ENV_DATABASE_PATH);
}
