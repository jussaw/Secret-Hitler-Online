package server.stats;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import game.CpuPlayer;
import game.CpuTurn;
import game.SecretHitlerGame;
import game.datastructures.Identity;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.TreeSet;
import java.util.function.BiFunction;
import java.util.function.LongSupplier;

/**
 * Plays games with a CPU player in every seat through {@link CpuTurn#step}, the CPU tick
 * {@code Lobby} runs, and records each one's timeline the way {@code Lobby} does: a look after
 * every move.
 */
public final class CpuGames {
    private static final int MAX_MOVES = 2_000;

    private CpuGames() {
    }

    /** A played game, its seats' roles in turn order, and its timeline. */
    public record Played(SecretHitlerGame game, List<String> roles, List<LinkedHashMap<String, Object>> events) {
    }

    /**
     * Plays a game of {@code seats} CPU players, {@code Bot 1}… in a shuffled order. Each tick is
     * {@link CpuTurn#step} with the CPUs in name order, as {@code Lobby.updateAllUsers} runs it: the
     * first that acts ends the tick, except while voting, when each CPU votes in turn until the
     * voting closes. Every move is diffed from the look before it, at {@code t = clock - startedAt}.
     *
     * @param stopAtRound stop once {@code getRound()} reaches this round; 0 plays to the end.
     * @throws AssertionError with the timeline as JSON, if the game runs past 2,000 moves, no CPU
     *                        can move, or a CPU's move throws.
     */
    public static Played play(int seats, LongSupplier clock, long startedAt, int stopAtRound) {
        return play(seats, clock, startedAt, stopAtRound, (name, role) -> new CpuPlayer(name));
    }

    /**
     * Plays a game as {@code play(seats, clock, startedAt, stopAtRound)} does, with each seat's CPU
     * player made by {@code makeBot}, from the seat's name and the role it was dealt (roles are
     * dealt when the game is made, so each bot is made after the deal), then initialized.
     *
     * @throws AssertionError with the timeline as JSON, if the game runs past 2,000 moves, no CPU
     *                        can move, or a CPU's move throws.
     */
    public static Played play(int seats, LongSupplier clock, long startedAt, int stopAtRound,
            BiFunction<String, Identity, CpuPlayer> makeBot) {
        List<String> names = new ArrayList<>();
        for (int i = 1; i <= seats; i++) {
            names.add("Bot " + i);
        }
        Collections.shuffle(names);
        SecretHitlerGame game = new SecretHitlerGame(names);
        TreeSet<CpuPlayer> cpus = new TreeSet<>();
        for (String name : names) {
            CpuPlayer cpu = makeBot.apply(name, game.getPlayer(name).getIdentity());
            cpu.initialize(game);
            cpus.add(cpu);
        }

        Timeline timeline = new Timeline(game, clock, startedAt);
        while (!timeline.last.finished() && (stopAtRound == 0 || game.getRound() < stopAtRound)) {
            boolean moved;
            try {
                moved = CpuTurn.step(game, cpus, timeline::afterMove);
            } catch (RuntimeException e) {
                throw new AssertionError("A CPU's move failed in " + game.getState() + ": " + e + ": "
                        + json(timeline.events), e);
            }
            if (!moved) {
                throw new AssertionError("No CPU could move in " + game.getState() + ": " + json(timeline.events));
            }
        }
        return new Played(game, TimelineReplay.roles(game), timeline.events);
    }

    /** A game's timeline so far: each CPU move counted and diffed from the look before it. */
    private static final class Timeline {
        private final SecretHitlerGame game;
        private final LongSupplier clock;
        private final long startedAt;
        private final List<LinkedHashMap<String, Object>> events = new ArrayList<>();
        private GameSnapshot last;
        private int moves = 0;

        private Timeline(SecretHitlerGame game, LongSupplier clock, long startedAt) {
            this.game = game;
            this.clock = clock;
            this.startedAt = startedAt;
            this.last = GameSnapshot.of(game);
        }

        private void afterMove() {
            if (++moves > MAX_MOVES) {
                throw new AssertionError("The game ran past " + MAX_MOVES + " moves: " + json(events));
            }
            GameSnapshot now = GameSnapshot.of(game);
            events.addAll(TimelineDiff.between(last, now, clock.getAsLong() - startedAt));
            last = now;
        }
    }

    /** The events as JSON, for a failure message. */
    public static String json(List<? extends java.util.Map<String, Object>> events) {
        try {
            return new ObjectMapper().writeValueAsString(events);
        } catch (JsonProcessingException e) {
            return events.toString();
        }
    }
}
