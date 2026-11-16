package server.util;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;
import org.junit.rules.ExternalResource;
import server.stats.GameRecord;
import server.stats.GameRecordSink;

/**
 * The records lobbies hand over in a test, as a JUnit rule: each test's records go to
 * {@code records}, on a clock the test sets ({@code clock}, at 1,000,000 ms to start), and no CPU
 * tick, END TERM countdown or grace window ends by itself ({@code CPU_ACTION_DELAY_IN_SEC} and
 * {@code END_TERM_TIMER_IN_SEC} 600, {@code PLAYER_TIMEOUT_IN_SEC} 60), so
 * {@code GameDriver.stepCpus} plays the CPUs. A test may change those and
 * {@code LOBBY_TIMEOUT_DURATION_IN_MIN}; all are put back after it.
 */
public final class RecordedGames extends ExternalResource {
    public final List<GameRecord> records = Collections.synchronizedList(new ArrayList<>());
    public final AtomicLong clock = new AtomicLong(1_000_000L);

    private GameRecordSink savedSink;
    private LongSupplier savedClock;
    private float savedCpuDelay;
    private long savedLobbyTimeout;
    private float savedEndTerm;
    private float savedPlayerTimeout;

    @Override
    protected void before() {
        savedSink = Lobby.recordSink;
        savedClock = Lobby.recordClock;
        savedCpuDelay = Lobby.CPU_ACTION_DELAY_IN_SEC;
        savedLobbyTimeout = Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN;
        savedEndTerm = Lobby.END_TERM_TIMER_IN_SEC;
        savedPlayerTimeout = Lobby.PLAYER_TIMEOUT_IN_SEC;
        Lobby.recordSink = records::add;
        Lobby.recordClock = clock::get;
        Lobby.CPU_ACTION_DELAY_IN_SEC = 600;
        Lobby.END_TERM_TIMER_IN_SEC = 600;
        Lobby.PLAYER_TIMEOUT_IN_SEC = 60;
    }

    @Override
    protected void after() {
        Lobby.recordSink = savedSink;
        Lobby.recordClock = savedClock;
        Lobby.CPU_ACTION_DELAY_IN_SEC = savedCpuDelay;
        Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN = savedLobbyTimeout;
        Lobby.END_TERM_TIMER_IN_SEC = savedEndTerm;
        Lobby.PLAYER_TIMEOUT_IN_SEC = savedPlayerTimeout;
    }
}
