package server;

import server.accounts.AccountStore;

/** Signs test accounts in through an account store, for the server tests. */
public final class TestAccounts {
    private TestAccounts() {
    }

    /** The ID of the test account {@code id}, as the test sign-in makes it. */
    public static String account(String id) {
        return "test-" + id;
    }

    /**
     * Makes (or updates) the test account {@code test-<id>}, names it {@code name}, and starts a
     * session for it.
     *
     * @param name the account's name, already normalized; null leaves the account as it is (a new
     *             one has no name).
     * @return the session's token: the value of the {@code session} cookie.
     * @throws IllegalStateException if another account has the name.
     */
    public static String signIn(AccountStore store, String id, String name) {
        String accountId = store.upsertTestAccount(id).id();
        if (name != null && store.setUsername(accountId, name) != AccountStore.NameResult.SAVED) {
            throw new IllegalStateException("Another account is named " + name + ".");
        }
        return store.createSession(accountId);
    }
}
