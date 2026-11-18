package game;

import game.datastructures.Policy;
import java.io.Serializable;

/**
 * Hard's rule 5 (issue #72, the bot skill design's "Deck odds"): how likely a president's hand of
 * three was all fascist, as one seat can work it out. A hand is three cards drawn at random from
 * the cards the seat cannot place: the deck's 17 (6 liberal, 11 fascist) less the policies on the
 * board and less the cards it saw go to the discard pile since the last reshuffle. It is handed
 * only numbers the seat sees (the board's counts, the draw pile's size, the cards it saw
 * discarded), so it cannot peek. How the cards it cannot place split between the draw pile and the
 * discards does not change a hand's odds, so the discard pile's size is not read; the draw pile's
 * is, as it grows only when the discards are shuffled back in.
 */
final class DeckOdds implements Serializable {
    private static final long serialVersionUID = 1L;

    /** The cards in a president's hand. */
    private static final int HAND = SecretHitlerGame.PRESIDENT_DRAW_SIZE;

    /** The cards in a chancellor's hand. */
    private static final int CHANCELLOR_HAND = SecretHitlerGame.CHANCELLOR_DRAW_SIZE;

    /** The liberal cards this seat saw go to the discard pile since the last reshuffle. */
    private int seenLiberals;

    /** The fascist cards this seat saw go to the discard pile since the last reshuffle. */
    private int seenFascists;

    /** The draw pile's size at this seat's last look; 0 before any. */
    private int drawSize;

    /**
     * The chance that {@code cards} drawn at random, without replacement, from {@code liberals}
     * liberal and {@code fascists} fascist cards are all fascist: {@code C(fascists, cards) /
     * C(liberals + fascists, cards)}.
     *
     * @throws IllegalArgumentException for a negative count, or a pool smaller than {@code cards}.
     */
    static double allFascist(int liberals, int fascists, int cards) {
        if (liberals < 0 || fascists < 0 || cards < 0) {
            throw new IllegalArgumentException(
                    "A count is negative: " + liberals + " liberal, " + fascists + " fascist, " + cards + " drawn.");
        }
        if (liberals + fascists < cards) {
            throw new IllegalArgumentException(
                    "Cannot draw " + cards + " from " + (liberals + fascists) + " cards.");
        }
        return choose(fascists, cards) / choose(liberals + fascists, cards);
    }

    /** {@code C(n, k)}, as a product in {@code double}: 0 when {@code k > n}. */
    private static double choose(int n, int k) {
        if (k > n) {
            return 0;
        }
        double ways = 1;
        for (int i = 0; i < k; i++) {
            ways = ways * (n - i) / (i + 1);
        }
        return ways;
    }

    /** Whether the draw pile, now {@code drawSize}, is larger than at the last look: a reshuffle since. */
    boolean reshuffledSince(int drawSize) {
        return drawSize > this.drawSize;
    }

    /**
     * A look at the draw pile: after a reshuffle since the last look, the seen discards are back in
     * the pile and forgotten. A fresh memory's last size is 0, so its first look forgets what it
     * never had.
     */
    void look(int drawSize) {
        if (reshuffledSince(drawSize)) {
            seenLiberals = 0;
            seenFascists = 0;
        }
        this.drawSize = drawSize;
    }

    /** This seat saw a card of {@code type} go to the discard pile. */
    void discarded(Policy.Type type) {
        if (type == Policy.Type.LIBERAL) {
            seenLiberals++;
        } else {
            seenFascists++;
        }
    }

    /**
     * The chance a president's hand drawn now is all fascist, with {@code liberalsOnBoard} and
     * {@code fascistsOnBoard} policies on the board. A pool that cannot be (under 3 cards, or a
     * negative count, as after an odd restore) falls back to the cards not on the board.
     */
    double allFascistHand(int liberalsOnBoard, int fascistsOnBoard) {
        int liberals = SecretHitlerGame.NUM_LIBERAL_POLICIES - liberalsOnBoard - seenLiberals;
        int fascists = SecretHitlerGame.NUM_FASCIST_POLICIES - fascistsOnBoard - seenFascists;
        if (liberals < 0 || fascists < 0 || liberals + fascists < HAND) {
            liberals = Math.max(0, SecretHitlerGame.NUM_LIBERAL_POLICIES - liberalsOnBoard);
            fascists = Math.max(0, SecretHitlerGame.NUM_FASCIST_POLICIES - fascistsOnBoard);
            if (liberals + fascists < HAND) {
                return 0;
            }
        }
        return allFascist(liberals, fascists, HAND);
    }

    /**
     * For a chancellor handed two fascist cards, the chance the president discarded a liberal: the
     * pool's liberals over the pool less the two it holds. A scale, not the exact posterior (which
     * would weigh how likely a liberal or a fascist president is to pass two fascists). A pool that
     * cannot be (under 3 cards, under 2 fascists, or a negative count) falls back to the cards not
     * on the board.
     */
    double liberalThirdCard(int liberalsOnBoard, int fascistsOnBoard) {
        int liberals = SecretHitlerGame.NUM_LIBERAL_POLICIES - liberalsOnBoard - seenLiberals;
        int fascists = SecretHitlerGame.NUM_FASCIST_POLICIES - fascistsOnBoard - seenFascists;
        if (liberals < 0 || fascists < CHANCELLOR_HAND || liberals + fascists < HAND) {
            liberals = Math.max(0, SecretHitlerGame.NUM_LIBERAL_POLICIES - liberalsOnBoard);
            fascists = Math.max(0, SecretHitlerGame.NUM_FASCIST_POLICIES - fascistsOnBoard);
            if (fascists < CHANCELLOR_HAND || liberals + fascists < HAND) {
                return 0;
            }
        }
        return (double) liberals / (liberals + fascists - CHANCELLOR_HAND);
    }
}
