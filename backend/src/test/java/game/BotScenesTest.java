package game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import game.BotScenes.Played;
import game.BotScenes.Scene;
import game.datastructures.Identity;
import game.datastructures.Player;
import java.util.List;
import java.util.Random;
import org.junit.Test;

/** The scenes the bot tests build: each stops at the decision it names, with the cards it names. */
public class BotScenesTest {

    private static int countOf(String cards, char type) {
        int count = 0;
        for (char c : cards.toCharArray()) {
            if (c == type) {
                count++;
            }
        }
        return count;
    }

    private static void assertRoles(SecretHitlerGame game, String roles) {
        List<Player> players = game.getPlayerList();
        assertEquals(roles.length(), players.size());
        for (int i = 0; i < roles.length(); i++) {
            Player player = players.get(i);
            assertEquals("P" + i, player.getUsername());
            assertEquals(BotScenes.role(roles.charAt(i)), player.getIdentity());
            assertTrue(player.getUsername() + " is a bot", player.isCpu());
        }
    }

    @Test
    public void eachBuilderStopsAtItsDecision() {
        Scene nomination = BotScenes.nomination("LFLLLFH");
        assertRoles(nomination.game(), "LFLLLFH");
        assertEquals("P1", nomination.bot());
        assertEquals(GameState.CHANCELLOR_NOMINATION, nomination.game().getState());
        assertEquals("P1", nomination.game().getCurrentPresident());
        assertEquals("P2", nomination.game().getLastChancellor());
        assertEquals("P0", nomination.game().getLastPresident());
        assertEquals(1, nomination.game().getNumLiberalPolicies());

        Scene vote = BotScenes.vote("LLLFH");
        assertEquals("P2", vote.bot());
        assertEquals(GameState.CHANCELLOR_VOTING, vote.game().getState());
        assertEquals("P0", vote.game().getCurrentPresident());
        assertEquals("P1", vote.game().getCurrentChancellor());
        assertTrue(vote.game().getVotes().isEmpty());

        Scene voteAtThree = BotScenes.vote("LLHLLFF", 3);
        assertEquals(3, voteAtThree.game().getNumFascistPolicies());
        assertEquals(GameState.CHANCELLOR_VOTING, voteAtThree.game().getState());

        Scene hand = BotScenes.presidentsHand("FLLLH", "FLL");
        assertEquals("P0", hand.bot());
        assertEquals(GameState.LEGISLATIVE_PRESIDENT, hand.game().getState());
        assertEquals("P0", hand.game().getCurrentPresident());
        assertEquals("P1", hand.game().getCurrentChancellor());
        assertEquals("FLL", Decision.letters(hand.game().getPresidentLegislativeChoices()));

        Scene choice = BotScenes.chancellorsHand("LHLLLFF", "FL", "F", 0);
        assertEquals("P1", choice.bot());
        assertEquals(GameState.LEGISLATIVE_CHANCELLOR, choice.game().getState());
        assertEquals("P1", choice.game().getCurrentChancellor());
        assertEquals("FL", Decision.letters(choice.game().getChancellorLegislativeChoices()));
        assertEquals(1, choice.game().getDiscardSize());

        Scene veto = BotScenes.chancellorsHand("LLLFH", "FF", "F", 5);
        assertEquals(5, veto.game().getNumFascistPolicies());
        assertEquals(GameState.LEGISLATIVE_CHANCELLOR, veto.game().getState());
        assertEquals("FF", Decision.letters(veto.game().getChancellorLegislativeChoices()));

        Scene answer = BotScenes.vetoAnswer("LLLFH");
        assertEquals("P0", answer.bot());
        assertEquals(GameState.LEGISLATIVE_PRESIDENT_VETO, answer.game().getState());
        assertEquals("P0", answer.game().getCurrentPresident());
        assertEquals("FF", Decision.letters(answer.game().getChancellorLegislativeChoices()));

        Scene investigate = BotScenes.power("LLLLLFFFH", 1, "");
        assertEquals("P0", investigate.bot());
        assertEquals(GameState.PRESIDENTIAL_POWER_INVESTIGATE, investigate.game().getState());
        assertEquals(1, investigate.game().getNumFascistPolicies());

        Scene elect = BotScenes.power("LLLLFFH", 3, "");
        assertEquals(GameState.PRESIDENTIAL_POWER_ELECTION, elect.game().getState());
        assertEquals(3, elect.game().getNumFascistPolicies());

        Scene peek = BotScenes.power("LLLFH", 3, "LLF");
        assertEquals(GameState.PRESIDENTIAL_POWER_PEEK, peek.game().getState());
        assertEquals("LLF", Decision.letters(peek.game().getPeek()));

        Scene execute = BotScenes.power("FLLLLFH", 4, "");
        assertEquals(GameState.PRESIDENTIAL_POWER_EXECUTION, execute.game().getState());
        assertEquals("P0", execute.game().getCurrentPresident());
        assertEquals(4, execute.game().getNumFascistPolicies());
    }

    @Test
    public void theBoardTakesItsCardsFromTheDeck() {
        SecretHitlerGame game = BotScenes.game("LLLFH");
        BotScenes.board(game, 5, 2);

        assertEquals(5, game.getNumFascistPolicies());
        assertEquals(2, game.getNumLiberalPolicies());
        assertEquals(GameState.CHANCELLOR_NOMINATION, game.getState());
        assertEquals(10, game.getDrawSize());
        assertEquals(0, game.getDiscardSize());
        String pile = BotScenes.drawPile(game);
        assertEquals(6, countOf(pile, 'F'));
        assertEquals(4, countOf(pile, 'L'));
    }

    @Test
    public void drawTopKeepsThePilesCards() {
        SecretHitlerGame game = BotScenes.game("LLLFH");
        String before = BotScenes.drawPile(game);

        BotScenes.drawTop(game, "LLFL");

        String after = BotScenes.drawPile(game);
        assertEquals(17, after.length());
        assertEquals(countOf(before, 'F'), countOf(after, 'F'));
        assertEquals(countOf(before, 'L'), countOf(after, 'L'));
        assertTrue(after, after.startsWith("LLFL"));
    }

    @Test
    public void drawTopRefusesACardThePileLacks() {
        SecretHitlerGame game = BotScenes.game("LLLFH");
        Throwable thrown = null;
        try {
            BotScenes.drawTop(game, "LLLLLLL");
        } catch (IllegalArgumentException e) {
            thrown = e;
        }
        assertTrue("seven liberal cards were refused", thrown != null);
    }

    @Test
    public void everyGameStartsFromTheSameDeck() {
        assertEquals(BotScenes.drawPile(BotScenes.game("LLLFH")), BotScenes.drawPile(BotScenes.game("LLLLFFH")));
    }

    @Test
    public void swapUnseenCardsSwapsBelowWhatWasSeen() {
        SecretHitlerGame game = BotScenes.game("LLLFH");
        BotScenes.drawTop(game, "FFFLF");
        String before = BotScenes.drawPile(game);

        BotScenes.swapUnseenCards(game, 3);

        String after = BotScenes.drawPile(game);
        assertEquals("FFFFL", after.substring(0, 5));
        assertEquals(before.substring(5), after.substring(5));
    }

    @Test
    public void swapRolesSwaps() {
        SecretHitlerGame game = BotScenes.game("LLLFH");
        BotScenes.swapRoles(game, "P0", "P4");

        assertEquals(Identity.HITLER, game.getPlayer("P0").getIdentity());
        assertEquals(Identity.LIBERAL, game.getPlayer("P4").getIdentity());
        assertEquals(Identity.LIBERAL, game.getPlayer("P1").getIdentity());
    }

    @Test
    public void electVotesTheChancellorIn() {
        SecretHitlerGame game = BotScenes.game("LLLFH");
        BotScenes.drawTop(game, "LLL");
        BotScenes.elect(game, "P3");

        assertEquals(GameState.LEGISLATIVE_PRESIDENT, game.getState());
        assertEquals("P3", game.getCurrentChancellor());
        assertEquals(5, game.getVotes().size());
        assertFalse(game.getVotes().containsValue(false));
    }

    @Test
    public void mixedSeedsLookRandom() {
        int low = 0;
        for (long seed = 0; seed < 200; seed++) {
            if (new Random(BotScenes.mix(seed)).nextDouble() < 0.25) {
                low++;
            }
        }
        assertTrue(low + " of 200 mixed seeds drew below 0.25", low >= 30 && low <= 70);

        // The reason for mixing: unmixed, consecutive seeds draw almost the same first number.
        int unmixedLow = 0;
        for (long seed = 0; seed < 200; seed++) {
            if (new Random(seed).nextDouble() < 0.25) {
                unmixedLow++;
            }
        }
        assertEquals(0, unmixedLow);
    }

    @Test
    public void aBotIsSeededAndReady() {
        Scene scene = BotScenes.vote("LLLFH");
        CpuPlayer bot = BotScenes.bot(scene, 3);
        assertEquals("P2", bot.myName);
        assertEquals(Integer.valueOf(0), bot.playerReputation.get("P0"));
        assertNull(bot.knownPlayerRoles.get("P0"));
        assertEquals(Identity.LIBERAL, bot.knownPlayerRoles.get("P2"));
    }

    @Test
    public void clearedWaitsForP2sNominationAtThreeFascistPolicies() {
        Played played = BotScenes.cleared("P5", BotSkill.NORMAL, 0);
        SecretHitlerGame game = played.game();
        assertRoles(game, "FLLFLLH");
        assertEquals("P5", played.bot().myName);
        assertEquals(GameState.CHANCELLOR_NOMINATION, game.getState());
        assertEquals(3, game.getRound());
        assertEquals("P2", game.getCurrentPresident());
        assertEquals("P1", game.getLastPresident());
        assertEquals("P4", game.getLastChancellor());
        assertEquals(3, game.getNumFascistPolicies());
        assertEquals(2, game.getNumLiberalPolicies());
    }
}
