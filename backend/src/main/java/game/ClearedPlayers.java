package game;

import game.datastructures.Identity;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Hard's rule 1 (issue #72, the bot skill design's "Cleared players"): the players a Hard liberal
 * CPU has seen proved not to be Hitler. Electing Hitler chancellor with 3 or more fascist policies
 * down ends the game, so a chancellor seen in a legislative session at 3 or more (where the
 * election has passed and nothing has been enacted since) is not Hitler. It reads only what every
 * seat sees: the state, the board and the chancellor.
 */
final class ClearedPlayers implements Serializable {
    private static final long serialVersionUID = 1L;

    /** How many times its weight a cleared player has when the CPU nominates. */
    static final double NOMINATION_WEIGHT = 3;

    /**
     * The score (with what the CPU knows of their role) from which a chancellor who is not cleared
     * gets Normal's vote, with 3 or more fascist policies down, instead of nein.
     */
    static final int TRUSTED_SCORE = 3;

    /** The fascist policies from which electing Hitler chancellor wins the game. */
    private static final int HITLER_ELECTION_POLICIES = 3;

    /** In the order cleared. A list, so a backup's bytes depend only on the names. */
    private final List<String> names = new ArrayList<>();

    /**
     * Clears the chancellor when the game is in a legislative session ({@code
     * LEGISLATIVE_PRESIDENT}, {@code LEGISLATIVE_CHANCELLOR} or {@code
     * LEGISLATIVE_PRESIDENT_VETO}) with 3 or more fascist policies down. The CPU is updated in each
     * of those states, so one of them is seen for every election that passes.
     */
    void observe(SecretHitlerGame game) {
        if (!CpuPlayer.inLegislativeSession(game.getState())
                || game.getNumFascistPolicies() < HITLER_ELECTION_POLICIES) {
            return;
        }
        String chancellor = game.getCurrentChancellor();
        if (!names.contains(chancellor)) {
            names.add(chancellor);
        }
    }

    /** Whether {@code name} has been cleared. */
    boolean contains(String name) {
        return names.contains(name);
    }

    /** The cleared players, in the order cleared; unmodifiable. */
    Set<String> names() {
        return Collections.unmodifiableSet(new LinkedHashSet<>(names));
    }

    /** What a player's nomination weight is multiplied by: {@link #NOMINATION_WEIGHT} if cleared, else 1. */
    double nominationFactor(String name) {
        return contains(name) ? NOMINATION_WEIGHT : 1;
    }

    /**
     * The rule's vote on the open election, or empty where the CPU votes as Normal does: ja for a
     * cleared chancellor; with 3 or more fascist policies down, nein for a chancellor not cleared
     * whose score is under {@link #TRUSTED_SCORE}; and empty otherwise, and always where
     * {@code known} (what the CPU's role and its investigations told it) has the president or the
     * chancellor on the fascist side, as a ja there would hand the fascists a policy.
     *
     * @param chancellorScore the chancellor's score, with what the CPU knows of their role.
     */
    Optional<Boolean> vote(SecretHitlerGame game, int chancellorScore, Map<String, Identity> known) {
        String chancellor = game.getCurrentChancellor();
        if (CpuPlayer.isFascistSide(known.get(game.getCurrentPresident()))
                || CpuPlayer.isFascistSide(known.get(chancellor))) {
            return Optional.empty();
        }
        if (contains(chancellor)) {
            return Optional.of(true);
        }
        if (game.getNumFascistPolicies() >= HITLER_ELECTION_POLICIES && chancellorScore < TRUSTED_SCORE) {
            return Optional.of(false);
        }
        return Optional.empty();
    }
}
