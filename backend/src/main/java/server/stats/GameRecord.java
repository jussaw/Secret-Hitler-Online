package server.stats;

import game.SecretHitlerGame;
import game.datastructures.Player;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The record of one game, as a lobby hands it over when the game ends or its lobby is swept: the
 * header, the seats with their accounts and the timeline, all copied, so nothing a lobby does
 * later changes it. Format 1 (the spec's "The record"); the JSON, with player numbers in place of
 * accounts, is Phase 14B's.
 *
 * @param events the timeline, oldest first, each event's keys in the format's order.
 */
public record GameRecord(String id, long startedAt, long endedAt, String outcome, boolean complete,
        int liberalPolicies, int fascistPolicies, int rounds, List<Seat> seats, List<Map<String, Object>> events) {

    public static final int FORMAT = 1;
    public static final String LIBERAL_POLICIES = "LIBERAL_POLICIES";
    public static final String HITLER_EXECUTED = "HITLER_EXECUTED";
    public static final String FASCIST_POLICIES = "FASCIST_POLICIES";
    public static final String HITLER_ELECTED = "HITLER_ELECTED";
    public static final String UNFINISHED = "UNFINISHED";

    /**
     * One seat, in turn order.
     *
     * @param accountId the account that held the seat, or null for a CPU player's.
     * @param name      the seat's name in the game.
     * @param role      {@code LIBERAL}, {@code FASCIST} or {@code HITLER}.
     * @param alive     whether the seat was alive at the end.
     */
    public record Seat(String accountId, String name, boolean cpu, String role, boolean alive) {
    }

    /**
     * Copies the seats and every event, keeping each event's keys in order and copying its card
     * lists. Checks nothing else.
     */
    public GameRecord {
        seats = Collections.unmodifiableList(new ArrayList<>(seats));
        List<Map<String, Object>> copied = new ArrayList<>();
        for (Map<String, Object> event : events) {
            LinkedHashMap<String, Object> copy = new LinkedHashMap<>();
            for (Map.Entry<String, Object> entry : event.entrySet()) {
                Object value = entry.getValue();
                copy.put(entry.getKey(), value instanceof List<?> list ? List.copyOf(list) : value);
            }
            copied.add(Collections.unmodifiableMap(copy));
        }
        events = Collections.unmodifiableList(copied);
    }

    /**
     * The record of {@code game}: its board, last round and seats as they are now.
     *
     * @param seatAccounts each human seat's account, by seat name ({@code Lobby.seatAccounts()});
     *                     a seat with no entry is a CPU player's.
     */
    public static GameRecord of(String id, long startedAt, long endedAt, String outcome, boolean complete,
            SecretHitlerGame game, Map<String, String> seatAccounts, List<? extends Map<String, Object>> events) {
        List<Seat> seats = new ArrayList<>();
        for (Player player : game.getPlayerList()) {
            String accountId = seatAccounts.get(player.getUsername());
            seats.add(new Seat(accountId, player.getUsername(), accountId == null, player.getIdentity().name(),
                    player.isAlive()));
        }
        return new GameRecord(id, startedAt, endedAt, outcome, complete, game.getNumLiberalPolicies(),
                game.getNumFascistPolicies(), game.getRound(), seats, new ArrayList<>(events));
    }

    /** {@code LIBERAL} or {@code FASCIST}, the side that won, or null for an unfinished game. */
    public String winner() {
        if (LIBERAL_POLICIES.equals(outcome) || HITLER_EXECUTED.equals(outcome)) {
            return "LIBERAL";
        } else if (FASCIST_POLICIES.equals(outcome) || HITLER_ELECTED.equals(outcome)) {
            return "FASCIST";
        }
        return null;
    }

    /** Whether any seat was a CPU player's. */
    public boolean hasCpu() {
        return seats.stream().anyMatch(Seat::cpu);
    }

    /** The accounts that held seats, in turn order. */
    public List<String> accountIds() {
        List<String> accounts = new ArrayList<>();
        for (Seat seat : seats) {
            if (seat.accountId() != null) {
                accounts.add(seat.accountId());
            }
        }
        return accounts;
    }
}
