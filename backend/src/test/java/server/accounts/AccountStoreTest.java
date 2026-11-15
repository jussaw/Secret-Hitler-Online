package server.accounts;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import server.accounts.AccountStore.NameResult;
import server.accounts.AccountStore.SessionLookup;

public class AccountStoreTest {
    private static final long HOUR = 60L * 60 * 1000;
    private static final long DAY = 24 * HOUR;
    private static final long MINUTE = 60L * 1000;

    @Rule
    public TemporaryFolder folder = new TemporaryFolder();

    private final AtomicLong now = new AtomicLong(1_000_000_000_000L);
    private AccountStore store;

    @Before
    public void setUp() {
        store = AccountStore.open(null, now::get);
    }

    @Test
    public void discordSignInKeepsTheChosenName() {
        Account first = store.upsertDiscordAccount("111", "rowan#1", "hash1");
        assertNull(first.username());
        assertEquals(NameResult.SAVED, store.setUsername("111", "Rowan"));
        now.addAndGet(DAY);
        Account again = store.upsertDiscordAccount("111", "rowan_new", "hash2");
        assertEquals("Rowan", again.username());
        assertEquals("rowan_new", again.discordUsername());
        assertEquals("hash2", again.discordAvatar());
        assertEquals("Rowan", store.find("111").username());
        assertNull(store.find("nobody"));
    }

    @Test
    public void testAccountsAreMarked() {
        Account test = store.upsertTestAccount("abc");
        assertEquals("test-abc", test.id());
        assertEquals("test-abc", test.discordUsername());
        assertTrue(test.isTest());
        assertFalse(store.upsertDiscordAccount("222", "x", null).isTest());
    }

    @Test
    public void namesAreUniqueIgnoringCase() {
        store.upsertDiscordAccount("a", "a", null);
        store.upsertDiscordAccount("b", "b", null);
        assertEquals(NameResult.SAVED, store.setUsername("a", "Alice"));
        assertEquals(NameResult.TAKEN, store.setUsername("b", "ALICE"));
        assertEquals(NameResult.SAVED, store.setUsername("a", "alice"));
        assertEquals("alice", store.find("a").username());
        assertNull(store.find("b").username());
    }

    @Test
    public void twoSavesAtOnceOneWins() throws Exception {
        store.upsertDiscordAccount("a", "a", null);
        store.upsertDiscordAccount("b", "b", null);
        CountDownLatch go = new CountDownLatch(1);
        List<NameResult> results = new ArrayList<>();
        Thread[] threads = new Thread[2];
        String[] ids = {"a", "b"};
        String[] names = {"Sam", "SAM"};
        for (int i = 0; i < 2; i++) {
            final int n = i;
            threads[i] = new Thread(() -> {
                try {
                    go.await();
                } catch (InterruptedException e) {
                    return;
                }
                NameResult r = store.setUsername(ids[n], names[n]);
                synchronized (results) {
                    results.add(r);
                }
            });
            threads[i].start();
        }
        go.countDown();
        for (Thread t : threads) {
            t.join();
        }
        assertEquals(2, results.size());
        assertEquals(1, results.stream().filter(r -> r == NameResult.SAVED).count());
        assertEquals(1, results.stream().filter(r -> r == NameResult.TAKEN).count());
    }

    @Test
    public void sessionsAreStoredHashed() throws Exception {
        String path = folder.newFile("accounts.db").getAbsolutePath();
        AccountStore fileStore = AccountStore.open(path, now::get);
        fileStore.upsertDiscordAccount("a", "a", null);
        String token = fileStore.createSession("a");
        assertNotNull(token);
        assertEquals(43, token.length());
        MessageDigest sha = MessageDigest.getInstance("SHA-256");
        StringBuilder hex = new StringBuilder();
        for (byte b : sha.digest(token.getBytes(StandardCharsets.UTF_8))) {
            hex.append(String.format("%02x", b));
        }
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + path);
                Statement s = c.createStatement();
                ResultSet rs = s.executeQuery("SELECT token_hash FROM sessions")) {
            assertTrue(rs.next());
            assertEquals(hex.toString(), rs.getString(1));
            assertFalse(rs.next());
        }
        assertNotNull(fileStore.lookup(token));
    }

    @Test
    public void aSessionLastsThirtyDays() {
        store.upsertDiscordAccount("a", "a", null);
        String token = store.createSession("a");
        now.addAndGet(30 * DAY - MINUTE);
        assertNotNull(store.lookup(token));

        String other = store.createSession("a");
        now.addAndGet(30 * DAY + MINUTE);
        assertNull(store.lookup(other));
    }

    @Test
    public void useRenewsAtMostDaily() {
        store.upsertDiscordAccount("a", "a", null);
        long start = now.get();
        String token = store.createSession("a");
        String twin = store.createSession("a");
        now.set(start + 12 * HOUR);
        SessionLookup early = store.lookup(token);
        assertNotNull(early);
        assertEquals("a", early.account().id());
        assertFalse(early.renewed());
        now.set(start + DAY + MINUTE);
        SessionLookup later = store.lookup(token);
        assertNotNull(later);
        assertTrue(later.renewed());
        assertTrue(store.lookup(twin).renewed());
        // Renewed at +1d 1m, so each lasts until +31d 1m; the twin is not used again until it ends.
        now.set(start + 31 * DAY);
        assertNotNull(store.lookup(token));
        now.set(start + 31 * DAY + 2 * MINUTE);
        assertNull(store.lookup(twin));
    }

    @Test
    public void sweepDeletesOnlyExpired() {
        store.upsertDiscordAccount("a", "a", null);
        String old = store.createSession("a");
        now.addAndGet(20 * DAY);
        String fresh = store.createSession("a");
        now.addAndGet(11 * DAY);
        assertEquals(1, store.sweepExpiredSessions());
        assertEquals(0, store.sweepExpiredSessions());
        assertNull(store.lookup(old));
        assertNotNull(store.lookup(fresh));
    }

    @Test
    public void signOutEndsTheSession() {
        store.upsertDiscordAccount("a", "a", null);
        String token = store.createSession("a");
        store.deleteSession(token);
        assertNull(store.lookup(token));
        store.deleteSession(null);
        store.deleteSession("never existed");
    }

    @Test
    public void junkTokensFindNothing() {
        store.upsertDiscordAccount("a", "a", null);
        String token = store.createSession("a");
        store.deleteSession(token);
        assertNull(store.lookup(null));
        assertNull(store.lookup(""));
        assertNull(store.lookup("   "));
        assertNull(store.lookup("x"));
        assertNull(store.lookup(token));
    }
}
