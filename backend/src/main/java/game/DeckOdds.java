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
    private static final int PRESIDENT_HAND = SecretHitlerGame.PRESIDENT_DRAW_SIZE;

    /** The cards in a chancellor's hand. */
    private static final int CHANCELLOR_HAND = SecretHitlerGame.CHANCELLOR_DRAW_SIZE;

    /** The liberal cards this seat saw go to the discard pile since the last reshuffle. */
    private int seenLiberals;

    /** The fascist cards this seat saw go to the discard pile since the last reshuffle. */
    private int seenFascists;

    /** The draw pile's size at this seat's last look; 0 before any. */
    private int drawSize;

    /** The liberal and fascist cards a hand is drawn from. */
    private record Pool(int liberals, int fascists) {
        int cards() {
            return liberals + fascists;
        }
    }

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
     * The cards this seat cannot place, with {@code liberalsOnBoard} and {@code fascistsOnBoard}
     * policies on the board: the deck less the board and the seen discards. A pool that cannot be
     * (a negative count, under 3 cards or under {@code minFascists} fascists, as after an odd
     * restore) falls back to the cards not on the board, and that, if it cannot be either (no board
     * a game reaches), to no cards at all.
     */
    private Pool pool(int liberalsOnBoard, int fascistsOnBoard, int minFascists) {
        Pool seen = new Pool(SecretHitlerGame.NUM_LIBERAL_POLICIES - liberalsOnBoard - seenLiberals,
                SecretHitlerGame.NUM_FASCIST_POLICIES - fascistsOnBoard - seenFascists);
        if (holds(seen, minFascists)) {
            return seen;
        }
        Pool offTheBoard = new Pool(Math.max(0, SecretHitlerGame.NUM_LIBERAL_POLICIES - liberalsOnBoard),
                Math.max(0, SecretHitlerGame.NUM_FASCIST_POLICIES - fascistsOnBoard));
        return holds(offTheBoard, minFascists) ? offTheBoard : new Pool(0, 0);
    }

    /** Whether {@code pool} can be: no negative count, a president's hand and {@code minFascists} fascists. */
    private static boolean holds(Pool pool, int minFascists) {
        return pool.liberals() >= 0 && pool.fascists() >= minFascists && pool.cards() >= PRESIDENT_HAND;
    }

    /**
     * The chance a president's hand drawn now is all fascist, with {@code liberalsOnBoard} and
     * {@code fascistsOnBoard} policies on the board, from {@link #pool}; 0 from no cards.
     */
    double allFascistHand(int liberalsOnBoard, int fascistsOnBoard) {
        Pool pool = pool(liberalsOnBoard, fascistsOnBoard, 0);
        return pool.cards() == 0 ? 0 : allFascist(pool.liberals(), pool.fascists(), PRESIDENT_HAND);
    }

    /**
     * For a chancellor handed two fascist cards, the chance the president discarded a liberal: the
     * pool's liberals over the pool less the two it holds, from {@link #pool} (which must hold those
     * two); 0 from no cards. A scale, not the exact posterior (which would weigh how likely a liberal
     * or a fascist president is to pass two fascists).
     */
    double liberalThirdCard(int liberalsOnBoard, int fascistsOnBoard) {
        Pool pool = pool(liberalsOnBoard, fascistsOnBoard, CHANCELLOR_HAND);
        return pool.cards() == 0 ? 0 : (double) pool.liberals() / (pool.cards() - CHANCELLOR_HAND);
    }
}
