package server.util;

import game.SecretHitlerGame;

import java.util.function.LongSupplier;

/**
 * The END TERM countdown of one presidential term: the time left, and whether the president has
 * paused it. It belongs to one game and round, the term it may end. It only keeps time;
 * {@code Lobby} starts it, schedules its end and ends the term.
 */
final class TermTimer {
    final SecretHitlerGame game;
    final int round;
    final String president;

    private final LongSupplier clock;
    private boolean paused;
    // While running, when the countdown reaches zero; while paused, the time it had left.
    private long deadlineMs;
    private long pausedRemainingMs;

    /**
     * Starts a running countdown.
     *
     * @param durationMs the time it starts with.
     * @param clock      the current time in ms, from a clock that never goes back.
     */
    TermTimer(SecretHitlerGame game, int round, String president, long durationMs, LongSupplier clock) {
        this.game = game;
        this.round = round;
        this.president = president;
        this.clock = clock;
        this.deadlineMs = clock.getAsLong() + durationMs;
    }

    /** Whether this is the countdown of {@code game}'s term in {@code round}. */
    boolean isFor(SecretHitlerGame game, int round) {
        return this.game == game && this.round == round;
    }

    boolean isPaused() {
        return paused;
    }

    /** The time left in ms, never below zero. It does not change while paused. */
    long remainingMs() {
        long left = paused ? pausedRemainingMs : deadlineMs - clock.getAsLong();
        return Math.max(0, left);
    }

    /** Stops the countdown with the time it has left. Pausing it again changes nothing. */
    void pause() {
        if (!paused) {
            pausedRemainingMs = remainingMs();
            paused = true;
        }
    }

    /** Runs the countdown on from the time it had left. Resuming it again changes nothing. */
    void resume() {
        if (paused) {
            deadlineMs = clock.getAsLong() + pausedRemainingMs;
            paused = false;
        }
    }
}
