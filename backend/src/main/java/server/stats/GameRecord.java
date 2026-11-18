package server.stats;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import game.BotSkill;
import game.SecretHitlerGame;
import game.datastructures.Player;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The record of one game (#31), as a lobby hands it over when the game ends or its lobby is
 * swept: the header, the seats with their accounts and the timeline, all copied, so nothing a
 * lobby does later changes it. Format 2 (the spec's "The record"; since Phase 26B): format 1 with
 * the bots' level, {@code botSkill}, after {@code hasCpu}. A record holds account IDs, which only
 * the server sees: what is stored and served carries player numbers instead.
 *
 * @param botSkill the level the game's bots share, or null exactly when no seat is a CPU player's.
 * @param events   the timeline, oldest first, each event's keys in the format's order.
 */
public record GameRecord(String id, long startedAt, long endedAt, String outcome, boolean complete,
        BotSkill botSkill, int liberalPolicies, int fascistPolicies, int rounds, List<Seat> seats,
        List<Map<String, Object>> events) {

    /** The format a record is written in now. One saved earlier keeps its own (1). */
    public static final int FORMAT = 2;
    public static final String LIBERAL_POLICIES = "LIBERAL_POLICIES";
    public static final String HITLER_EXECUTED = "HITLER_EXECUTED";
    public static final String FASCIST_POLICIES = "FASCIST_POLICIES";
    public static final String HITLER_ELECTED = "HITLER_ELECTED";
    public static final String UNFINISHED = "UNFINISHED";

    private static final ObjectMapper JSON = new ObjectMapper();

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
     * lists. Checks only the level against the seats.
     *
     * @throws IllegalArgumentException if a seat is a CPU player's and {@code botSkill} is null, or
     *                                  none is and it is not.
     */
    public GameRecord {
        seats = Collections.unmodifiableList(new ArrayList<>(seats));
        events = TimelineDiff.copyEvents(events);
        if ((botSkill != null) != hasCpu(seats)) {
            throw new IllegalArgumentException("Game " + id + " has " + (botSkill == null ? "bots and no level."
                    : "a level, " + botSkill + ", and no bots."));
        }
    }

    /**
     * The record of {@code game}: its board, last round and seats as they are now. It never throws
     * for the level, so nothing the recorder does stops a game: with a CPU seat and no level it
     * records {@code NORMAL}, and with no CPU seat it records none, whatever was passed.
     *
     * @param seatAccounts each human seat's account, by seat name ({@code Lobby.seatAccounts()});
     *                     a seat with no entry is a CPU player's.
     * @param botSkill     the level the game's bots share, or null with none.
     */
    public static GameRecord of(String id, long startedAt, long endedAt, String outcome, boolean complete,
            SecretHitlerGame game, Map<String, String> seatAccounts, BotSkill botSkill,
            List<? extends Map<String, Object>> events) {
        List<Seat> seats = new ArrayList<>();
        for (Player player : game.getPlayerList()) {
            String accountId = seatAccounts.get(player.getUsername());
            seats.add(new Seat(accountId, player.getUsername(), accountId == null, player.getIdentity().name(),
                    player.isAlive()));
        }
        BotSkill level = !hasCpu(seats) ? null : botSkill != null ? botSkill : BotSkill.NORMAL;
        return new GameRecord(id, startedAt, endedAt, outcome, complete, level, game.getNumLiberalPolicies(),
                game.getNumFascistPolicies(), game.getRound(), seats, new ArrayList<>(events));
    }

    private static boolean hasCpu(List<Seat> seats) {
        return seats.stream().anyMatch(Seat::cpu);
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
        return hasCpu(seats);
    }

    /**
     * The record as it is stored and served ({@code FORMAT}, 2): the spec's keys in order, the
     * level's name in {@code botSkill} (null without bots), and each seat's {@code player} its
     * account's number, or null for a CPU player's seat. It holds no account ID.
     *
     * @param playerNumbers each account's player number ({@code GameStore}).
     * @throws IllegalArgumentException if a human seat's account has no number.
     */
    public String toJson(Map<String, Integer> playerNumbers) {
        List<Map<String, Object>> seatJson = new ArrayList<>();
        for (Seat seat : seats) {
            Integer player = null;
            if (seat.accountId() != null) {
                player = playerNumbers.get(seat.accountId());
                if (player == null) {
                    throw new IllegalArgumentException("A seat of game " + id + " has no player number.");
                }
            }
            Map<String, Object> json = new LinkedHashMap<>();
            json.put("player", player);
            json.put("name", seat.name());
            json.put("cpu", seat.cpu());
            json.put("role", seat.role());
            json.put("alive", seat.alive());
            seatJson.add(json);
        }
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("id", id);
        json.put("format", FORMAT);
        json.put("startedAt", startedAt);
        json.put("endedAt", endedAt);
        json.put("outcome", outcome);
        json.put("winner", winner());
        json.put("complete", complete);
        json.put("hasCpu", hasCpu());
        json.put("botSkill", botSkill == null ? null : botSkill.name());
        json.put("liberalPolicies", liberalPolicies);
        json.put("fascistPolicies", fascistPolicies);
        json.put("rounds", rounds);
        json.put("seats", seatJson);
        json.put("events", events);
        try {
            return JSON.writeValueAsString(json);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Could not write the record of game " + id + ".", e);
        }
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
