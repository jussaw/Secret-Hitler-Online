package game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import game.datastructures.Policy;
import org.junit.Test;

/**
 * Hard's rule 5's arithmetic (the bot skill design's "Deck odds"): how likely a hand of three is
 * all fascist, drawn from the cards a seat cannot place (the 17 less the board and the discards
 * it saw since the last reshuffle), and how likely the card beside two fascists a chancellor was
 * handed was liberal.
 */
public class DeckOddsTest {
    private static final double TOLERANCE = 1e-12;

    @Test
    public void allFascistAtTheStart() {
        assertEquals(165.0 / 680, DeckOdds.allFascist(6, 11, 3), TOLERANCE);
    }

    @Test
    public void allFascistNeedsThreeFascists() {
        assertEquals(0, DeckOdds.allFascist(5, 2, 3), TOLERANCE);
    }

    @Test
    public void allFascistOfOneCard() {
        assertEquals(5.0 / 8, DeckOdds.allFascist(3, 5, 1), TOLERANCE);
    }

    @Test
    public void allFascistOfAnAllFascistPool() {
        assertEquals(1, DeckOdds.allFascist(0, 4, 3), TOLERANCE);
    }

    @Test
    public void refusesAPoolSmallerThanTheDraw() {
        try {
            DeckOdds.allFascist(1, 1, 3);
            fail("a hand of 3 was drawn from 2 cards");
        } catch (IllegalArgumentException expected) {
            // refused
        }
    }

    @Test
    public void refusesANegativeCount() {
        for (int[] counts : new int[][] {{-1, 11, 3}, {6, -1, 3}, {6, 11, -1}}) {
            try {
                DeckOdds.allFascist(counts[0], counts[1], counts[2]);
                fail("a negative count was taken: " + counts[0] + ", " + counts[1] + ", " + counts[2]);
            } catch (IllegalArgumentException expected) {
                // refused
            }
        }
    }

    @Test
    public void aFreshSeatKnowsOnlyTheDeck() {
        assertEquals(DeckOdds.allFascist(6, 11, 3), new DeckOdds().allFascistHand(0, 0), TOLERANCE);
    }

    @Test
    public void theBoardLeavesThePool() {
        assertEquals(DeckOdds.allFascist(4, 8, 3), new DeckOdds().allFascistHand(2, 3), TOLERANCE);
    }

    @Test
    public void seenDiscardsLeaveThePool() {
        DeckOdds deck = new DeckOdds();
        deck.discarded(Policy.Type.LIBERAL);
        deck.discarded(Policy.Type.FASCIST);
        assertEquals(DeckOdds.allFascist(5, 10, 3), deck.allFascistHand(0, 0), TOLERANCE);
    }

    @Test
    public void aReshuffleBringsSeenDiscardsBack() {
        DeckOdds deck = new DeckOdds();
        deck.look(14);
        deck.discarded(Policy.Type.LIBERAL);
        deck.look(11);
        assertEquals(DeckOdds.allFascist(5, 11, 3), deck.allFascistHand(0, 0), TOLERANCE);
        deck.look(15);
        assertEquals(DeckOdds.allFascist(6, 11, 3), deck.allFascistHand(0, 0), TOLERANCE);
    }

    @Test
    public void aLargerPileMeansAReshuffle() {
        DeckOdds deck = new DeckOdds();
        deck.look(11);
        assertFalse(deck.reshuffledSince(11));
        assertFalse(deck.reshuffledSince(8));
        assertTrue(deck.reshuffledSince(12));
    }

    @Test
    public void theCardBesideTwoHandedFascists() {
        DeckOdds deck = new DeckOdds();
        assertEquals(6.0 / 15, deck.liberalThirdCard(0, 0), TOLERANCE);
        deck.discarded(Policy.Type.LIBERAL);
        assertEquals(5.0 / 14, deck.liberalThirdCard(0, 0), TOLERANCE);
    }

    /** More seen than there are cards, as after an odd restore: the odds forget what they saw. */
    @Test
    public void aPoolThatCannotBeFallsBackToTheCardsOffTheBoard() {
        DeckOdds deck = new DeckOdds();
        for (int i = 0; i < SecretHitlerGame.NUM_LIBERAL_POLICIES; i++) {
            deck.discarded(Policy.Type.LIBERAL);
        }
        for (int i = 0; i < SecretHitlerGame.NUM_FASCIST_POLICIES; i++) {
            deck.discarded(Policy.Type.FASCIST);
        }
        assertEquals(DeckOdds.allFascist(6, 11, 3), deck.allFascistHand(0, 0), TOLERANCE);
        assertEquals(6.0 / 15, deck.liberalThirdCard(0, 0), TOLERANCE);
    }
}
