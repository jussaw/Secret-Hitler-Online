package server;

import static org.junit.Assert.assertTrue;

import game.SecretHitlerGame;
import org.junit.Test;

/** The test driver plays every game to its end, the smallest table included. */
public class GameDriverTest {
    @Test
    public void everyFivePlayerGameEnds() {
        // Late in a five-player game the president, the last chancellor and Hitler can be the only
        // players alive, so Hitler is the one player who may be nominated.
        for (int i = 0; i < 200; i++) {
            SecretHitlerGame game = GameDriver.play(5, g -> {
            });
            assertTrue("game " + i + " ended", game.hasGameFinished());
        }
    }
}
