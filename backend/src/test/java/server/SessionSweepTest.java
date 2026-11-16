package server;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.slf4j.LoggerFactory;
import server.accounts.AccountStore;

/** The update timer's sweep of expired sessions ({@code SecretHitlerServer.sweepExpiredSessions}). */
public class SessionSweepTest {
    private final AtomicLong now = new AtomicLong(1_800_000_000_000L);
    private AccountStore store;
    private AccountStore savedStore;

    @Before
    public void useAStore() {
        savedStore = SecretHitlerServer.accounts;
        store = AccountStore.open(null, now::get);
        SecretHitlerServer.accounts = store;
    }

    @After
    public void restore() {
        SecretHitlerServer.accounts = savedStore;
        store.close();
    }

    @Test
    public void theSweepDeletesExpiredSessions() {
        String expired = TestAccounts.signIn(store, "1", "Ann");
        now.addAndGet(AccountStore.SESSION_MS);
        String live = TestAccounts.signIn(store, "2", "Bea");

        SecretHitlerServer.sweepExpiredSessions();

        assertNotNull(store.lookup(live));
        now.addAndGet(-AccountStore.SESSION_MS); // back to when the expired session was live: its row is gone
        assertNull(store.lookup(expired));
    }

    @Test
    public void aFailedSweepIsLoggedAndThrowsNothing() {
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        Logger serverLog = (Logger) LoggerFactory.getLogger(SecretHitlerServer.class);
        serverLog.addAppender(appender);
        try {
            store.close(); // every call to the store fails from now on
            SecretHitlerServer.sweepExpiredSessions();
        } finally {
            serverLog.detachAppender(appender);
            store = AccountStore.open(null); // for restore() to close
        }
        assertTrue(appender.list.stream().anyMatch(event -> event.getLevel() == Level.ERROR
                && event.getFormattedMessage().equals("Could not remove the expired sessions.")));
    }
}
