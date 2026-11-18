package game;

import game.datastructures.Policy;
import java.io.Serializable;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Hard's rule 4 (issue #72, the bot skill design's "The peek"): the three cards a Hard president
 * peeked at, kept until the next government's session ends. That government drew them if the draw
 * pile is exactly three cards smaller when its session starts; any other size means a chaos policy
 * (or a reshuffle) took cards first, and the cards are forgotten. If it drew them, they held a
 * liberal, and it enacted a fascist policy, both its members are to blame, unless the CPU sat in
 * that government. It reads only the CPU's own peek and what every seat sees: the state, the
 * offices, the draw pile's size, whether the tracker moved and the last policy enacted.
 */
final class PeekMemory implements Serializable {
    private static final long serialVersionUID = 1L;

    /** How far the CPU lowers each member of a government it blames. */
    static final int DROP = 2;

    /** The peek held, top first; empty when there is none. */
    private final List<Policy.Type> cards = new ArrayList<>();

    /** The draw pile's size at the peek. */
    private int drawSize;

    /** Whether the next government has drawn the cards, and its members once it has. */
    private boolean drawn;
    private String president;
    private String chancellor;

    /** Keeps {@code peek}, top first, seen with {@code drawSize} cards in the draw pile. */
    void saw(List<Policy> peek, int drawSize) {
        forget();
        for (Policy card : peek) {
            cards.add(card.getType());
        }
        this.drawSize = drawSize;
    }

    /** The peek held, top first; empty before any, and once forgotten. */
    List<Policy.Type> cards() {
        return Collections.unmodifiableList(new ArrayList<>(cards));
    }

    /**
     * Follows the peek to the end of the next government's session. The first legislative state
     * seen belongs to the government that drew the cards if the draw pile is exactly 3 smaller than
     * at the peek; otherwise, or if the pile changes size before then, the cards are forgotten. At
     * the first state after that session (one that is not legislative), the cards are forgotten and
     * the government is blamed if it enacted a fascist policy (not a chaos policy after a veto) and
     * the cards held a liberal.
     *
     * @param self the CPU's own name: a government it sat in is never blamed.
     * @return the government's president and chancellor, once, when they are to blame; else no one.
     */
    List<String> observe(SecretHitlerGame game, String self) {
        if (cards.isEmpty()) {
            return List.of();
        }
        GameState state = game.getState();
        boolean inSession = state == GameState.LEGISLATIVE_PRESIDENT || state == GameState.LEGISLATIVE_CHANCELLOR
                || state == GameState.LEGISLATIVE_PRESIDENT_VETO;
        if (!drawn) {
            if (inSession && game.getDrawSize() == drawSize - SecretHitlerGame.PRESIDENT_DRAW_SIZE) {
                drawn = true;
                president = game.getCurrentPresident();
                chancellor = game.getCurrentChancellor();
            } else if (inSession || game.getDrawSize() != drawSize) {
                forget();
            }
            return List.of();
        }
        if (inSession) {
            return List.of();
        }
        boolean enactedFascist = !game.didElectionTrackerAdvance() && game.getLastEnactedPolicy() == Policy.Type.FASCIST;
        boolean onlooker = !self.equals(president) && !self.equals(chancellor);
        List<String> blamed = enactedFascist && onlooker && cards.contains(Policy.Type.LIBERAL)
                ? List.of(president, chancellor)
                : List.of();
        forget();
        return blamed;
    }

    private void forget() {
        cards.clear();
        drawSize = 0;
        drawn = false;
        president = null;
        chancellor = null;
    }
}
