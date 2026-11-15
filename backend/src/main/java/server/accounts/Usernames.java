package server.accounts;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * The rules for account usernames: how a name is written, how long it may be, and which
 * names are taken. Whitespace matches JavaScript's {@code \s}, as the page's name
 * normalisation does, so a name the page accepts is one the server accepts.
 */
public final class Usernames {
    public static final int MAX_LENGTH = 12;

    public static final String TAKEN = "Another player already has that name.";
    public static final String CPU_NAME = "Names like \"Bot 1\" are kept for CPU players.";
    public static final String IN_GAME = "You can't change your name during a game.";
    public static final String BLANK = "Choose a name.";
    public static final String TOO_LONG = "Names are at most 12 characters.";

    /** JavaScript's {@code \s}: ASCII whitespace plus the Unicode spaces and line separators. */
    private static final String WHITESPACE =
            "[\\t\\n\\x0B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+";
    private static final Pattern WHITESPACE_RUN = Pattern.compile(WHITESPACE);
    private static final Pattern CPU_NAME_KEY = Pattern.compile("^bot [0-9]+$");

    /** Why a name is refused. */
    public enum Problem { BLANK, TOO_LONG, CPU_NAME }

    private Usernames() {
    }

    /**
     * Runs of whitespace become one space, then the ends are trimmed.
     */
    public static String normalize(String raw) {
        String collapsed = WHITESPACE_RUN.matcher(raw).replaceAll(" ");
        if (collapsed.startsWith(" ")) {
            collapsed = collapsed.substring(1);
        }
        if (collapsed.endsWith(" ")) {
            collapsed = collapsed.substring(0, collapsed.length() - 1);
        }
        return collapsed;
    }

    /**
     * The form two names are compared in: names that differ only in case are the same name.
     */
    public static String key(String normalized) {
        return normalized.toLowerCase(Locale.ROOT);
    }

    /**
     * The first rule a normalized name breaks, or null when the name is fine.
     */
    public static Problem problem(String normalized) {
        if (normalized.isEmpty()) {
            return Problem.BLANK;
        }
        if (normalized.length() > MAX_LENGTH) {
            return Problem.TOO_LONG;
        }
        if (CPU_NAME_KEY.matcher(key(normalized)).matches()) {
            return Problem.CPU_NAME;
        }
        return null;
    }
}
