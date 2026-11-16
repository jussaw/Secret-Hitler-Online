package server;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.util.List;
import org.slf4j.LoggerFactory;

/** What {@code SecretHitlerServer} logs while a test runs something. */
public final class ServerLog {
    private ServerLog() {
    }

    /** Runs {@code run}, and returns every line the server logged meanwhile. */
    public static List<ILoggingEvent> during(Runnable run) {
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        Logger log = (Logger) LoggerFactory.getLogger(SecretHitlerServer.class);
        log.addAppender(appender);
        try {
            run.run();
        } finally {
            log.detachAppender(appender);
        }
        return appender.list;
    }
}
