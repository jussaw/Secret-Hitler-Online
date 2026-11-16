package server.stats;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.fail;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.Test;

/**
 * Games played by CPU players in every seat: each recorded timeline, replayed from the start,
 * ends where the game did, with no event missing or doubled, and between them the games make
 * every event a CPU can make and every outcome.
 */
public class RandomGamesReplayTest {
    private static final int GAMES_PER_SIZE = 50;
    private static final int MAX_COVERAGE_GAMES = 5_000;

    /** A clock that moves on a second every time it is read. */
    private static AtomicLong clock() {
        return new AtomicLong(1_000_000L);
    }

    /** Plays one game and checks its replay, naming the size, the game and its events on failure. */
    private static CpuGames.Played playAndReplay(int seats, int index) {
        AtomicLong clock = clock();
        CpuGames.Played played = CpuGames.play(seats, () -> clock.addAndGet(1_000), clock.get(), 0);
        String what = "game " + index + " of " + seats + " seats: " + CpuGames.json(played.events());
        TimelineReplay.Replayed replayed;
        try {
            replayed = TimelineReplay.replay(played.events(), played.roles());
        } catch (AssertionError e) {
            throw new AssertionError(e.getMessage() + " In " + what, e);
        }
        assertEquals(what, TimelineReplay.of(played.game()), replayed);
        return played;
    }

    @Test
    public void everyRandomGameReplaysToItsEnd() {
        int index = 0;
        for (int seats = 5; seats <= 10; seats++) {
            for (int i = 0; i < GAMES_PER_SIZE; i++) {
                playAndReplay(seats, index++);
            }
        }
    }

    @Test
    public void randomGamesCoverEveryEventType() {
        Set<String> missing = new LinkedHashSet<>();
        for (String type : RecordFormat.EVENT_FIELDS.keySet()) {
            if (!Set.of("timerPause", "timerResume", "disconnect", "reconnect", "restored").contains(type)) {
                missing.add(type);
            }
        }
        missing.addAll(Set.of("enact by chancellor", "enact by chaos", "vetoAnswer accepted", "vetoAnswer refused",
                "LIBERAL_POLICIES", "HITLER_EXECUTED", "FASCIST_POLICIES", "HITLER_ELECTED"));
        for (int game = 0; game < MAX_COVERAGE_GAMES && !missing.isEmpty(); game++) {
            CpuGames.Played played = playAndReplay(5 + game % 6, game);
            for (LinkedHashMap<String, Object> event : played.events()) {
                missing.removeAll(Set.of(seen(event)));
            }
        }
        if (!missing.isEmpty()) {
            fail(MAX_COVERAGE_GAMES + " games never made " + missing);
        }
    }

    /** What an event counts toward: its type, and the kind of enact, answer or end it is. */
    private static String[] seen(Map<String, Object> event) {
        String type = (String) event.get("type");
        switch (type) {
            case "enact":
                return new String[] { type, "enact by " + event.get("by") };
            case "vetoAnswer":
                return new String[] { type, "vetoAnswer " + ((Boolean) event.get("accepted") ? "accepted" : "refused") };
            case "end":
                return new String[] { type, (String) event.get("outcome") };
            default:
                return new String[] { type };
        }
    }
}
