package server.stats;

import game.SecretHitlerGame;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import server.GameDriver;

/** Records for the store's, the writer's and the route's tests. */
public final class TestRecords {
    private TestRecords() {
    }

    /** A human seat, alive. */
    public static GameRecord.Seat human(String accountId, String name, String role) {
        return new GameRecord.Seat(accountId, name, false, role, true);
    }

    /** A CPU player's seat, alive. */
    public static GameRecord.Seat cpu(String name, String role) {
        return new GameRecord.Seat(null, name, true, role, true);
    }

    /**
     * A short record of a game that started a minute before {@code endedAt}, with only its
     * {@code end} in the timeline.
     */
    public static GameRecord record(String id, long endedAt, String outcome, List<GameRecord.Seat> seats) {
        LinkedHashMap<String, Object> end = TimelineDiff.event("end", 60_000L, 1);
        end.put("outcome", outcome);
        return new GameRecord(id, endedAt - 60_000L, endedAt, outcome, true, 1, 6, 1, seats, List.of(end));
    }

    /**
     * Five seats, {@code P0} to {@code P4}: the given accounts in the first seats of the list, CPU
     * players in the rest. Roles: a Liberal majority, one Fascist, Hitler.
     */
    public static List<GameRecord.Seat> seats(String... accountIds) {
        String[] roles = { "LIBERAL", "FASCIST", "LIBERAL", "HITLER", "LIBERAL" };
        List<GameRecord.Seat> seats = new ArrayList<>();
        for (int i = 0; i < roles.length; i++) {
            String name = "P" + i;
            seats.add(i < accountIds.length ? human(accountIds[i], name, roles[i]) : cpu(name, roles[i]));
        }
        return seats;
    }

    /**
     * A game of five, {@code P0} to {@code P4}, that {@code GameDriver} plays to its end, a second
     * a move, with its timeline taken after every move as {@code Lobby} takes it.
     *
     * @param seatAccounts each human seat's account, by seat name; the other seats are CPU players'.
     */
    public static GameRecord driven(String id, Map<String, String> seatAccounts) {
        long startedAt = 1_800_000_000_000L;
        List<LinkedHashMap<String, Object>> events = new ArrayList<>();
        GameSnapshot[] last = new GameSnapshot[1];
        long[] t = new long[1];
        SecretHitlerGame game = GameDriver.play(5, g -> {
            GameSnapshot now = GameSnapshot.of(g);
            if (last[0] != null) {
                events.addAll(TimelineDiff.between(last[0], now, t[0]));
            }
            last[0] = now;
            t[0] += 1_000;
        });
        String outcome = GameSnapshot.outcomeOf(game.getState());
        return GameRecord.of(id, startedAt, startedAt + t[0], outcome, true, game, seatAccounts, events);
    }
}
