package server.stats;

import game.GameState;
import game.SecretHitlerGame;
import game.datastructures.Player;
import game.datastructures.Policy;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * One look at a game: everything {@code TimelineDiff} compares to tell what a move did. Seats are
 * the players' names in turn order; roles are {@code LIBERAL}, {@code FASCIST} or {@code HITLER};
 * cards are {@code L} or {@code F}. A hand or peek is empty outside the state that shows it, and
 * {@code chancellor} and {@code target} are null when the game has none.
 *
 * @param votes the votes the game holds (it keeps them until the next nomination), dead seats'
 *              included.
 */
public record GameSnapshot(GameState state, int round, List<String> seats, List<String> roles, List<Boolean> alive,
        String president, String chancellor, Map<String, Boolean> votes, int tracker, int liberal, int fascist,
        int drawSize, int discardSize, List<String> presidentHand, List<String> chancellorHand, List<String> peek,
        String target) {

    public GameSnapshot {
        seats = List.copyOf(seats);
        roles = List.copyOf(roles);
        alive = List.copyOf(alive);
        votes = Map.copyOf(votes);
        presidentHand = List.copyOf(presidentHand);
        chancellorHand = List.copyOf(chancellorHand);
        peek = List.copyOf(peek);
    }

    /**
     * Looks at {@code game}. Reads the state first, through {@code getState()}, which notices a
     * policy victory (as every packet does), and each hand or peek only in the state that has it.
     */
    public static GameSnapshot of(SecretHitlerGame game) {
        GameState state = game.getState();
        List<String> seats = new ArrayList<>();
        List<String> roles = new ArrayList<>();
        List<Boolean> alive = new ArrayList<>();
        for (Player player : game.getPlayerList()) {
            seats.add(player.getUsername());
            roles.add(player.getIdentity().name());
            alive.add(player.isAlive());
        }
        List<String> presidentHand = state == GameState.LEGISLATIVE_PRESIDENT
                ? cards(game.getPresidentLegislativeChoices())
                : List.of();
        List<String> chancellorHand = state == GameState.LEGISLATIVE_CHANCELLOR
                || state == GameState.LEGISLATIVE_PRESIDENT_VETO
                        ? cards(game.getChancellorLegislativeChoices())
                        : List.of();
        List<String> peek = state == GameState.PRESIDENTIAL_POWER_PEEK ? cards(game.getPeek()) : List.of();
        return new GameSnapshot(state, game.getRound(), seats, roles, alive, game.getCurrentPresident(),
                game.getCurrentChancellor(), game.getVotes(), game.getElectionTracker(),
                game.getNumLiberalPolicies(), game.getNumFascistPolicies(), game.getDrawSize(),
                game.getDiscardSize(), presidentHand, chancellorHand, peek, game.getTarget());
    }

    /** {@code L} or {@code F} for each policy, in order. */
    static List<String> cards(List<Policy> policies) {
        List<String> cards = new ArrayList<>();
        for (Policy policy : policies) {
            cards.add(policy.getType() == Policy.Type.LIBERAL ? "L" : "F");
        }
        return cards;
    }

    /** The seat's index in turn order, or -1 for a name (or null) with no seat. */
    public int seatIndex(String name) {
        return name == null ? -1 : seats.indexOf(name);
    }

    /**
     * The record's outcome for a victory state: {@code LIBERAL_POLICIES}, {@code HITLER_EXECUTED},
     * {@code FASCIST_POLICIES} or {@code HITLER_ELECTED}; null for any other state.
     */
    public static String outcomeOf(GameState state) {
        if (state == null) {
            return null;
        }
        switch (state) {
            case LIBERAL_VICTORY_POLICY:
                return "LIBERAL_POLICIES";
            case LIBERAL_VICTORY_EXECUTION:
                return "HITLER_EXECUTED";
            case FASCIST_VICTORY_POLICY:
                return "FASCIST_POLICIES";
            case FASCIST_VICTORY_ELECTION:
                return "HITLER_ELECTED";
            default:
                return null;
        }
    }

    /** This look's outcome ({@code outcomeOf}), or null while the game runs. */
    public String outcome() {
        return outcomeOf(state);
    }

    /** Whether the game has ended in this look. */
    public boolean finished() {
        return outcome() != null;
    }
}
