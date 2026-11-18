package game;

import static org.junit.Assert.assertEquals;

import game.BotScenes.Played;
import game.BotScenes.Scene;
import game.datastructures.Policy;
import java.util.List;
import org.junit.Test;

/**
 * Hard's rule 5 through {@link CpuPlayer} (the bot skill design's "Deck odds"): a Hard bot that
 * reads the game scales an onlooker's drop for a fascist policy by how unlikely an all-fascist
 * hand was, from the cards it cannot place, and rule 2's drop by how likely the card beside two
 * fascists was liberal. Every amount is read by name.
 */
public class HardDeckOddsTest {
    private static final double TOLERANCE = 1e-9;
    private static final long SEED = 0;

    /** The drop an onlooker gives each member of a government that enacted a fascist policy from {@code pool}. */
    private static double scaledDrop(int liberals, int fascists) {
        return -(1 - DeckOdds.allFascist(liberals, fascists, 3));
    }

    /** {@code president} elects {@code chancellor} from {@code hand} on top, every seat's ja made by the scene. */
    private static void elected(Played played, String chancellor, String hand) {
        played.then(g -> BotScenes.drawTop(g, hand));
        played.then(g -> g.nominateChancellor(chancellor));
        played.then(g -> BotScenes.voteAll(g, true));
    }

    /** The president discards the first card of {@code type}. */
    private static void presidentDiscards(Played played, Policy.Type type) {
        played.then(g -> g.presidentDiscardPolicy(indexOf(g.getPresidentLegislativeChoices(), type)));
    }

    /** The chancellor enacts the first card of {@code type}. */
    private static void chancellorEnacts(Played played, Policy.Type type) {
        played.then(g -> g.chancellorEnactPolicy(indexOf(g.getChancellorLegislativeChoices(), type)));
    }

    private static int indexOf(List<Policy> cards, Policy.Type type) {
        for (int i = 0; i < cards.size(); i++) {
            if (cards.get(i).getType() == type) {
                return i;
            }
        }
        throw new IllegalStateException("No " + type + " card in " + Decision.letters(cards) + ".");
    }

    /** {@code secondRound(roles, bot, skill)}, then P1 elects P3 from {@code hand}, discards {@code discard} and P3 enacts the other kind. */
    private static Played roundTwo(String roles, String bot, BotSkill skill, String hand, Policy.Type discard,
            Policy.Type enact) {
        Played played = BotScenes.secondRound(roles, bot, skill, SEED);
        elected(played, "P3", hand);
        presidentDiscards(played, discard);
        chancellorEnacts(played, enact);
        assertEquals(GameState.POST_LEGISLATIVE, played.game().getState());
        return played;
    }

    @Test
    public void anOnlookerScalesTheFascistDrop() {
        Played played = roundTwo("LLLFH", "P2", BotSkill.HARD, "FFL", Policy.Type.LIBERAL, Policy.Type.FASCIST);
        for (String member : List.of("P1", "P3")) {
            assertEquals(scaledDrop(5, 11), played.bot().score(member), TOLERANCE);
            assertEquals(Integer.valueOf(-1), played.bot().playerReputation.get(member));
        }
    }

    @Test
    public void anOnlookerKeepsTheWholeRaiseForALiberal() {
        Played played = roundTwo("LLLFH", "P2", BotSkill.HARD, "LLF", Policy.Type.FASCIST, Policy.Type.LIBERAL);
        assertEquals(1.0, played.bot().score("P1"), 0);
        assertEquals(1.0, played.bot().score("P3"), 0);
    }

    /** The fascist card the bot discarded as chancellor is not in the next hand's pool. */
    @Test
    public void aSeenDiscardChangesTheOdds() {
        Played played = BotScenes.secondRound("LLFLH", "P3", BotSkill.HARD, SEED);
        elected(played, "P3", "LFF");
        presidentDiscards(played, Policy.Type.FASCIST);
        played.botActs();
        assertEquals(Policy.Type.LIBERAL, played.game().getLastEnactedPolicy());
        played.then(SecretHitlerGame::endPresidentialTerm);
        elected(played, "P0", "FFL");
        presidentDiscards(played, Policy.Type.LIBERAL);
        chancellorEnacts(played, Policy.Type.FASCIST);
        assertEquals(GameState.POST_LEGISLATIVE, played.game().getState());
        assertEquals(scaledDrop(4, 10), played.bot().score("P2"), TOLERANCE);
    }

    @Test
    public void thePresidentDeducesItsChancellorsDiscard() {
        Played played = BotScenes.secondRound("LLLFH", "P2", BotSkill.HARD, SEED);
        played.then(g -> g.nominateChancellor("P3"));
        played.then(g -> BotScenes.voteAll(g, false));
        played.then(SecretHitlerGame::endPresidentialTerm);
        assertEquals("P2", played.game().getCurrentPresident());
        elected(played, "P0", "FFL");
        played.botActs();
        assertEquals("FL", Decision.letters(played.game().getChancellorLegislativeChoices()));
        chancellorEnacts(played, Policy.Type.FASCIST);
        assertEquals(DeckOdds.allFascist(4, 9, 3), played.bot().deckOdds().allFascistHand(1, 1), TOLERANCE);
    }

    /**
     * The audit's case: the bot passes F and L with 2 cards left in the draw pile, its chancellor
     * enacts the F and the pile reshuffles in the enactment, taking the L back in. The bot must not
     * count that L as discarded, and forgets its own discard too.
     */
    @Test
    public void aReshuffleInTheEnactmentDropsTheDeducedDiscard() {
        SecretHitlerGame game = BotScenes.game("LLLFH");
        Played played = new Played(game, BotScenes.bot(game, "P2", BotSkill.HARD, SEED));
        played.then(g -> BotScenes.board(g, 4, 2));
        for (String chancellor : List.of("P1", "P3")) {
            elected(played, chancellor, "LFF");
            presidentDiscards(played, Policy.Type.FASCIST);
            chancellorEnacts(played, Policy.Type.LIBERAL);
            played.then(SecretHitlerGame::endPresidentialTerm);
        }
        assertEquals("P2", played.game().getCurrentPresident());
        elected(played, "P0", "FFL");
        assertEquals(2, played.game().getDrawSize());
        played.botActs();
        assertEquals("FL", Decision.letters(played.game().getChancellorLegislativeChoices()));
        int discardsBefore = played.game().getDiscardSize();
        chancellorEnacts(played, Policy.Type.FASCIST);
        assertEquals("the discards went back into the draw pile", 0, played.game().getDiscardSize());
        assertEquals(2 + discardsBefore + 1, played.game().getDrawSize());
        assertEquals(DeckOdds.allFascist(2, 6, 3), played.bot().deckOdds().allFascistHand(4, 5), TOLERANCE);
    }

    /** A held peek is the next government's hand: its odds are known, 1 for three fascists and 0 otherwise. */
    @Test
    public void aPeekedHandIsKnownNotGuessed() {
        for (String peek : List.of("FFF", "LFF")) {
            Played played = BotScenes.peeked("LLLFH", peek, BotSkill.HARD, SEED);
            played.then(g -> g.nominateChancellor("P2"));
            played.then(g -> BotScenes.voteAll(g, true));
            played.then(g -> g.presidentDiscardPolicy(0));
            played.then(g -> g.chancellorEnactPolicy(0));
            assertEquals(Policy.Type.FASCIST, played.game().getLastEnactedPolicy());
            played.then(g -> g.executePlayer("P3"));
            assertEquals(GameState.POST_LEGISLATIVE, played.game().getState());
            double expected = peek.equals("FFF") ? 0 : -(1 + PeekMemory.DROP);
            assertEquals(peek, expected, played.bot().score("P1"), TOLERANCE);
            assertEquals(peek, expected, played.bot().score("P2"), TOLERANCE);
        }
    }

    /** P0's score once the bot of P1, holding the hand, has acted. */
    private static double presidentsScore(String hand, String extra, int fascist) {
        Scene scene = BotScenes.chancellorsHand("LLLFH", hand, extra, fascist);
        Played played = new Played(scene.game(), BotScenes.bot(scene, BotSkill.HARD, SEED));
        played.updateAgain();
        played.botActs();
        return played.bot().score("P0");
    }

    @Test
    public void theChancellorsDropIsScaledByTheDiscardedCard() {
        assertEquals(-ChancellorHand.FF_DROP * 6.0 / 15, presidentsScore("FF", "L", 0), TOLERANCE);
        assertEquals(-ChancellorHand.FF_DROP * 6.0 / 10, presidentsScore("FF", "F", 5), TOLERANCE);
    }

    /** Bots that do not read the game drop each member of a fascist government by one whole point, as Normal does. */
    @Test
    public void othersStillDropByOne() {
        for (BotSkill skill : List.of(BotSkill.NORMAL, BotSkill.EASY)) {
            Played played = roundTwo("LLLFH", "P2", skill, "FFL", Policy.Type.LIBERAL, Policy.Type.FASCIST);
            assertEquals(skill.name(), -1.0, played.bot().score("P1"), 0);
        }
        Played fascist = roundTwo("LLFLH", "P2", BotSkill.HARD, "FFL", Policy.Type.LIBERAL, Policy.Type.FASCIST);
        assertEquals(-1.0, fascist.bot().score("P1"), 0);
    }

    @Test
    public void hitlerAtSevenSeatsReadsTheOdds() {
        Played played = roundTwo("LLHLLFF", "P2", BotSkill.HARD, "FFL", Policy.Type.LIBERAL, Policy.Type.FASCIST);
        assertEquals(scaledDrop(5, 11), played.bot().score("P1"), TOLERANCE);
        assertEquals(scaledDrop(5, 11), played.bot().score("P3"), TOLERANCE);
    }
}
