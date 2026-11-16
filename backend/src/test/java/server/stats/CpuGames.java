package server.stats;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import game.CpuPlayer;
import game.GameState;
import game.SecretHitlerGame;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.TreeSet;
import java.util.function.LongSupplier;

/**
 * Plays games with a CPU player in every seat, as {@code Lobby}'s CPU loop runs them, and records
 * each one's timeline the way {@code Lobby} does: a look after every move.
 */
public final class CpuGames {
    private static final int MAX_MOVES = 2_000;

    private CpuGames() {
    }

    /** A played game, its seats' roles in turn order, and its timeline. */
    public record Played(SecretHitlerGame game, List<String> roles, List<LinkedHashMap<String, Object>> events) {
    }

    /**
     * Plays a game of {@code seats} CPU players, {@code Bot 1}… in a shuffled order. Each tick
     * updates every CPU, then lets them act in name order, as {@code Lobby.updateAllUsers} does:
     * the first that acts ends the tick, except while voting, when each CPU votes in turn until the
     * voting closes. Every move is diffed from the look before it, at {@code t = clock - startedAt}.
     *
     * @param stopAtRound stop once {@code getRound()} reaches this round; 0 plays to the end.
     * @throws AssertionError with the timeline as JSON, if the game runs past 2,000 moves or no
     *                        CPU can move.
     */
    public static Played play(int seats, LongSupplier clock, long startedAt, int stopAtRound) {
        List<String> names = new ArrayList<>();
        for (int i = 1; i <= seats; i++) {
            names.add("Bot " + i);
        }
        Collections.shuffle(names);
        SecretHitlerGame game = new SecretHitlerGame(names);
        TreeSet<CpuPlayer> cpus = new TreeSet<>();
        for (String name : names) {
            CpuPlayer cpu = new CpuPlayer(name);
            cpu.initialize(game);
            cpus.add(cpu);
        }

        List<LinkedHashMap<String, Object>> events = new ArrayList<>();
        GameSnapshot last = GameSnapshot.of(game);
        int moves = 0;
        while (!last.finished() && (stopAtRound == 0 || game.getRound() < stopAtRound)) {
            for (CpuPlayer cpu : cpus) {
                cpu.update(game);
            }
            boolean moved = false;
            for (CpuPlayer cpu : cpus) {
                boolean voting = game.getState() == GameState.CHANCELLOR_VOTING;
                if (!cpu.act(game)) {
                    continue;
                }
                if (++moves > MAX_MOVES) {
                    throw new AssertionError("The game ran past " + MAX_MOVES + " moves: " + json(events));
                }
                GameSnapshot now = GameSnapshot.of(game);
                events.addAll(TimelineDiff.between(last, now, clock.getAsLong() - startedAt));
                last = now;
                moved = true;
                if (!voting || game.getState() != GameState.CHANCELLOR_VOTING) {
                    break;
                }
            }
            if (!moved) {
                throw new AssertionError("No CPU could move in " + game.getState() + ": " + json(events));
            }
        }
        return new Played(game, TimelineReplay.roles(game), events);
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
