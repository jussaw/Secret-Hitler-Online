package server.util;

import game.BotSkill;
import game.CpuPlayer;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
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

    /**
     * Replaces each bot of the lobby's running game with one of the same name at {@code skill},
     * under the lobby's lock, standing in for the host's choice of level. The one test helper that
     * reaches inside {@code Lobby} (its private {@code cpuPlayers}, by reflection).
     *
     * @throws IllegalStateException if the field cannot be read.
     */
    @SuppressWarnings("unchecked")
    public static void seatBotsAt(Lobby lobby, BotSkill skill) {
        synchronized (lobby) {
            Set<CpuPlayer> bots;
            try {
                Field field = Lobby.class.getDeclaredField("cpuPlayers");
                field.setAccessible(true);
                bots = (Set<CpuPlayer>) field.get(lobby);
            } catch (ReflectiveOperationException e) {
                throw new IllegalStateException("Could not read the lobby's bots.", e);
            }
            List<CpuPlayer> replaced = new ArrayList<>();
            for (CpuPlayer bot : bots) {
                CpuPlayer leveled = new CpuPlayer(bot.myName, skill);
                leveled.initialize(lobby.game());
                replaced.add(leveled);
            }
            bots.clear();
            bots.addAll(replaced);
        }
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
