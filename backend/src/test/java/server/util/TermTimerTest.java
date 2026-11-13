package server.util;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import game.SecretHitlerGame;
import java.util.List;
import org.junit.Test;

/** The countdown's own arithmetic, on a clock the test moves by hand. */
public class TermTimerTest {
    private long now = 1_000;

    private TermTimer start(long durationMs) {
        return new TermTimer(null, 3, "P1", durationMs, () -> now);
    }

    @Test
    public void itCountsDownFromItsDurationAndStopsAtZero() {
        TermTimer timer = start(10_000);
        assertEquals(10_000, timer.remainingMs());
        assertFalse(timer.isPaused());
        now += 2_500;
        assertEquals(7_500, timer.remainingMs());
        now += 20_000;
        assertEquals(0, timer.remainingMs());
    }

    @Test
    public void pausedItKeepsItsTimeAndResumedItRunsOnFromThere() {
        TermTimer timer = start(10_000);
        now += 3_000;
        timer.pause();
        assertTrue(timer.isPaused());
        now += 60_000;
        assertEquals(7_000, timer.remainingMs());

        timer.resume();
        assertFalse(timer.isPaused());
        assertEquals(7_000, timer.remainingMs());
        now += 4_000;
        assertEquals(3_000, timer.remainingMs());
    }

    @Test
    public void pausingOrResumingTwiceChangesNothing() {
        TermTimer timer = start(10_000);
        now += 1_000;
        timer.resume(); // already running
        assertEquals(9_000, timer.remainingMs());
        timer.pause();
        now += 1_000;
        timer.pause(); // already paused: keeps 9 s, not 8
        timer.resume();
        assertEquals(9_000, timer.remainingMs());
    }

    @Test
    public void itBelongsToOneGameAndRound() {
        SecretHitlerGame game = new SecretHitlerGame(List.of("P1", "P2", "P3", "P4", "P5"));
        SecretHitlerGame other = new SecretHitlerGame(List.of("P1", "P2", "P3", "P4", "P5"));
        TermTimer timer = new TermTimer(game, 3, "P1", 10_000, () -> now);
        assertTrue(timer.isFor(game, 3));
        assertFalse(timer.isFor(game, 4));
        assertFalse(timer.isFor(other, 3));
    }
}
