package server.accounts;

/**
 * A signed-in person. {@code username} is null until they choose one; nothing from Discord
 * ever fills it.
 */
public record Account(String id, String discordUsername, String discordAvatar, String username) {
    /** A test sign-in account, never a Discord user. */
    public boolean isTest() {
        return id.startsWith("test-");
    }
}
