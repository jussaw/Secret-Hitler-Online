package game;

import game.datastructures.Policy;
import java.util.List;

/**
 * Hard's rule 2 (issue #72, the bot skill design's "The chancellor's hand"): what the two cards a
 * president hands a CPU chancellor say of that president. Two fascist cards lower them (a liberal
 * president dealt three fascists has no choice, which rule 5 later weighs into the drop), two
 * liberal cards raise them, and one of each says nothing. It reads only the chancellor's own hand.
 */
final class ChancellorHand {
    /** How far two fascist cards lower the president, before rule 5 scales it. */
    static final int FF_DROP = 2;

    /** How far two liberal cards raise the president. */
    static final int LL_RISE = 2;

    private ChancellorHand() {
    }

    /**
     * The change to the president's score for handing over {@code hand}: {@code -drop} for two
     * fascist cards, {@link #LL_RISE} for two liberal cards, 0 for one of each.
     *
     * @param hand the chancellor's two cards.
     * @param drop how far two fascist cards lower the president.
     */
    static int presidentChange(List<Policy> hand, int drop) {
        int fascist = 0;
        for (Policy card : hand) {
            if (card.getType() == Policy.Type.FASCIST) {
                fascist++;
            }
        }
        if (fascist == hand.size()) {
            return -drop;
        }
        if (fascist == 0) {
            return LL_RISE;
        }
        return 0;
    }
}
