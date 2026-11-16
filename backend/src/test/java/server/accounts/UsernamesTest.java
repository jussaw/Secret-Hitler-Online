package server.accounts;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.List;
import java.util.Locale;
import org.junit.Test;

public class UsernamesTest {
    @Test
    public void collapsesAndTrimsJavaScriptWhitespace() {
        assertEquals("Ann Lee", Usernames.normalize("  Ann \t\n Lee  "));
        assertEquals("Ann Lee", Usernames.normalize(" Ann\u3000 Lee\uFEFF"));
    }

    @Test
    public void collapsesAndTrimsNoBreakSpaceAndLineSeparator() {
        // JavaScript's \s includes U+00A0 and U+2028, which Java's \s does not.
        assertEquals("Ann Lee", Usernames.normalize("\u00A0Ann\u00A0\u2028Lee\u2028"));
    }

    @Test
    public void keepsCharactersJavaScriptDoesNotCallWhitespace() {
        // U+180E (Mongolian vowel separator) and U+0085 (NEL) are not in JavaScript's \s.
        assertEquals("Ann\u180E", Usernames.normalize("Ann\u180E"));
        assertEquals("Ann\u0085Lee", Usernames.normalize("Ann\u0085Lee"));
    }

    @Test
    public void keyIgnoresCase() {
        assertEquals(Usernames.key("ALICE"), Usernames.key("alice"));
    }

    @Test
    public void keyLowercasesWithRootLocaleWhateverTheDefault() {
        Locale previous = Locale.getDefault();
        try {
            Locale.setDefault(Locale.forLanguageTag("tr"));
            assertEquals("i", Usernames.key("I"));
        } finally {
            Locale.setDefault(previous);
        }
    }

    @Test
    public void blankAndLength() {
        assertEquals(Usernames.Problem.BLANK, Usernames.problem(""));
        assertNull(Usernames.problem("x".repeat(12)));
        assertEquals(Usernames.Problem.TOO_LONG, Usernames.problem("x".repeat(13)));
        assertEquals(Usernames.Problem.TOO_LONG, Usernames.problem("\uD83D\uDE00".repeat(7))); // 14 code units
    }

    @Test
    public void cpuNamesAreRefused() {
        for (String name : List.of("Bot 1", "bot 7", "BOT 12")) {
            assertEquals(name, Usernames.Problem.CPU_NAME, Usernames.problem(name));
        }
        for (String name : List.of("Bot", "Bot 1a", "Robot 1", "Bot one")) {
            assertNull(name, Usernames.problem(name));
        }
    }
}
