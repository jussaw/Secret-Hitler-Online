package server.accounts;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.List;
import org.junit.Test;

public class UsernamesTest {
    @Test
    public void collapsesAndTrimsJavaScriptWhitespace() {
        assertEquals("Ann Lee", Usernames.normalize("  Ann \t\n Lee  "));
        assertEquals("Ann Lee", Usernames.normalize(" Ann　 Lee﻿"));
    }

    @Test
    public void keyIgnoresCase() {
        assertEquals(Usernames.key("ALICE"), Usernames.key("alice"));
    }

    @Test
    public void blankAndLength() {
        assertEquals(Usernames.Problem.BLANK, Usernames.problem(""));
        assertNull(Usernames.problem("x".repeat(12)));
        assertEquals(Usernames.Problem.TOO_LONG, Usernames.problem("x".repeat(13)));
        assertEquals(Usernames.Problem.TOO_LONG, Usernames.problem("😀".repeat(7))); // 14 code units
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
