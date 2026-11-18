package game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import game.BotScenes.Played;
import game.datastructures.Policy;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Consumer;
import org.junit.Test;

/**
 * Hard's rule 4 (the bot skill design's "The peek"): a Hard president keeps the three cards it
 * peeked at, and a Hard CPU that reads the game, as an onlooker, lowers the next government by
 * {@link PeekMemory#DROP} when it drew those cards, they held a liberal, and it enacted a fascist
 * policy. The rule's own change is a Hard bot's scores less a Normal bot's in the same scene.
 */
public class PeekMemoryTest {
    private static final Policy.Type L = Policy.Type.LIBERAL;
    private static final Policy.Type F = Policy.Type.FASCIST;

    /** Round 2 after {@code peeked}: P1 elects P2, P1 discards {@code discard} and P2 enacts {@code enact}. */
    private static Consumer<Played> roundTwo(int discard, int enact) {
        return played -> {
            played.then(g -> g.nominateChancellor("P2"));
            played.then(g -> BotScenes.voteAll(g, true));
            played.then(g -> g.presidentDiscardPolicy(discard));
            played.then(g -> g.chancellorEnactPolicy(enact));
        };
    }

    /** {@code peeked(roles, peek, skill, 0)}, then {@code play}. */
    private static Played play(String roles, String peek, BotSkill skill, Consumer<Played> play) {
        Played played = BotScenes.peeked(roles, peek, skill, 0);
        play.accept(played);
        return played;
    }

    private static final double TOLERANCE = 1e-9;

    /** Each seat's score, with its fraction (Phase 25C's {@code score}). */
    private static Map<String, Double> scores(Played played) {
        Map<String, Double> scores = new TreeMap<>();
        for (String seat : played.bot().playerReputation.keySet()) {
            scores.put(seat, played.bot().score(seat));
        }
        return scores;
    }

    /**
     * What the rule changed: each seat's score at Hard less its score at Normal, after the same
     * moves. The scenes' governments enact their fascist policy from a known hand (the peek), or
     * Normal's judgement of it has not come yet, so rule 5's scaling changes nothing here.
     */
    private static Map<String, Double> ruleChange(String roles, String peek, Consumer<Played> moves) {
        Played hard = play(roles, peek, BotSkill.HARD, moves);
        Played normal = play(roles, peek, BotSkill.NORMAL, moves);
        assertEquals(normal.game().getState(), hard.game().getState());
        Map<String, Double> change = new TreeMap<>();
        Map<String, Double> normalScores = scores(normal);
        for (Map.Entry<String, Double> seat : scores(hard).entrySet()) {
            change.put(seat.getKey(), seat.getValue() - normalScores.get(seat.getKey()));
        }
        return change;
    }

    private static Map<String, Double> blamed(String... seats) {
        Map<String, Double> change = new TreeMap<>(Map.of("P0", 0.0, "P1", 0.0, "P2", 0.0, "P3", 0.0, "P4", 0.0));
        for (String seat : seats) {
            change.put(seat, -PeekMemory.DROP);
        }
        return change;
    }

    /** {@code actual} has {@code expected}'s seats, each within {@link #TOLERANCE}. */
    private static void assertScores(Map<String, Double> expected, Map<String, Double> actual) {
        assertEquals(expected.keySet(), actual.keySet());
        for (Map.Entry<String, Double> seat : expected.entrySet()) {
            assertEquals(seat.getKey() + " in " + actual, seat.getValue(), actual.get(seat.getKey()), TOLERANCE);
        }
    }

    @Test
    public void aGovernmentThatEnactsAFascistFromAPeekWithALiberalIsLowered() {
        Played played = play("LLLFH", "LFF", BotSkill.HARD, roundTwo(0, 0));
        assertEquals(GameState.PRESIDENTIAL_POWER_EXECUTION, played.game().getState());
        assertEquals(-PeekMemory.DROP, played.bot().score("P1"), TOLERANCE);
        assertEquals(-PeekMemory.DROP, played.bot().score("P2"), TOLERANCE);
        assertScores(blamed("P1", "P2"), ruleChange("LLLFH", "LFF", roundTwo(0, 0)));
    }

    @Test
    public void aPeekOfThreeFascistsBlamesNoOne() {
        assertScores(blamed(), ruleChange("LLLFH", "FFF", roundTwo(0, 0)));
        Played played = play("LLLFH", "FFF", BotSkill.HARD, roundTwo(0, 0));
        assertScores(blamed(), scores(played));
    }

    @Test
    public void aLiberalPolicyBlamesNoOne() {
        Played played = play("LLLFH", "LFF", BotSkill.HARD, roundTwo(1, 0));
        assertEquals(Policy.Type.LIBERAL, played.game().getLastEnactedPolicy());
        assertScores(blamed(), ruleChange("LLLFH", "LFF", roundTwo(1, 0)));
        assertTrue(played.bot().peekMemory().cards().isEmpty());
    }

    /** P1, P2 and P3 each nominate and every seat votes nein; the third failure enacts the peek's top card. */
    private static final Consumer<Played> CHAOS_THEN_P4_ELECTS_P1 = played -> {
        for (String[] government : new String[][] {{"P1", "P2"}, {"P2", "P3"}, {"P3", "P4"}}) {
            assertEquals(government[0], played.game().getCurrentPresident());
            played.then(g -> g.nominateChancellor(government[1]));
            played.then(g -> BotScenes.voteAll(g, false));
            played.then(SecretHitlerGame::endPresidentialTerm);
        }
        assertEquals(Policy.Type.LIBERAL, played.game().getLastEnactedPolicy());
        assertEquals(1, played.game().getNumLiberalPolicies());
        played.then(g -> g.nominateChancellor("P1"));
        played.then(g -> BotScenes.voteAll(g, true));
        played.then(g -> g.presidentDiscardPolicy(0));
        played.then(g -> g.chancellorEnactPolicy(0));
    };

    @Test
    public void aChaosPolicyAfterThePeekForgetsTheCards() {
        Played played = play("LLLFH", "LFF", BotSkill.HARD, CHAOS_THEN_P4_ELECTS_P1);
        assertEquals(GameState.PRESIDENTIAL_POWER_EXECUTION, played.game().getState());
        assertEquals(Policy.Type.FASCIST, played.game().getLastEnactedPolicy());
        assertScores(blamed(), scores(played));
        assertTrue(played.bot().peekMemory().cards().isEmpty());
    }

    @Test
    public void theChaosPolicyItselfForgetsTheCards() {
        Played played = BotScenes.peeked("LLLFH", "LFF", BotSkill.HARD, 0);
        for (String chancellor : List.of("P2", "P3")) {
            played.then(g -> g.nominateChancellor(chancellor));
            played.then(g -> BotScenes.voteAll(g, false));
            played.then(SecretHitlerGame::endPresidentialTerm);
            assertEquals(List.of(L, F, F), played.bot().peekMemory().cards());
        }
        played.then(g -> g.nominateChancellor("P4"));
        played.then(g -> BotScenes.voteAll(g, false));
        assertEquals(GameState.POST_LEGISLATIVE, played.game().getState());
        assertEquals(1, played.game().getNumLiberalPolicies());
        assertTrue(played.bot().peekMemory().cards().isEmpty());
    }

    /** Seen only at the next session, the draw pile's size alone shows that a chaos policy came first. */
    @Test
    public void aSessionThatDidNotDrawThePeekForgetsIt() {
        SecretHitlerGame game = BotScenes.peeked("LLLFH", "LFF", BotSkill.NORMAL, 0).game();
        PeekMemory memory = new PeekMemory();
        memory.saw(BotScenes.policies("LFF"), game.getDrawSize());
        for (String chancellor : List.of("P2", "P3", "P4")) {
            game.nominateChancellor(chancellor);
            BotScenes.voteAll(game, false);
            game.endPresidentialTerm();
        }
        game.nominateChancellor("P1");
        BotScenes.voteAll(game, true);
        assertEquals(GameState.LEGISLATIVE_PRESIDENT, game.getState());
        assertEquals(List.of(), memory.observe(game, "P0"));
        assertTrue(memory.cards().isEmpty());
        game.presidentDiscardPolicy(0);
        game.chancellorEnactPolicy(0);
        assertEquals(Policy.Type.FASCIST, game.getLastEnactedPolicy());
        assertEquals(List.of(), memory.observe(game, "P0"));
    }

    /** A veto accepted ends the session with no policy of the government's: no one is blamed. */
    @Test
    public void anAcceptedVetoBlamesNoOne() {
        SecretHitlerGame game = BotScenes.game("LLLFH");
        BotScenes.board(game, 5, 0);
        BotScenes.drawTop(game, "LFF");
        PeekMemory memory = new PeekMemory();
        memory.saw(BotScenes.policies("LFF"), game.getDrawSize());
        game.nominateChancellor("P1");
        BotScenes.voteAll(game, true);
        assertEquals(List.of(), memory.observe(game, "P2"));
        game.presidentDiscardPolicy(0);
        game.chancellorVeto();
        assertEquals(List.of(), memory.observe(game, "P2"));
        game.presidentialVeto(true);
        assertEquals(GameState.POST_LEGISLATIVE, game.getState());
        assertEquals(Policy.Type.FASCIST, game.getLastEnactedPolicy());
        assertEquals(List.of(), memory.observe(game, "P2"));
        assertTrue(memory.cards().isEmpty());
    }

    @Test
    public void itBlamesOnce() {
        Consumer<Played> moves = roundTwo(0, 0).andThen(played -> {
            played.updateAgain();
            played.updateAgain();
            played.then(g -> g.executePlayer("P3"));
            played.then(SecretHitlerGame::endPresidentialTerm);
            assertEquals("P2", played.game().getCurrentPresident());
            played.then(g -> g.nominateChancellor("P1"));
            played.then(g -> BotScenes.voteAll(g, true));
            played.then(g -> g.presidentDiscardPolicy(0));
            played.then(g -> g.chancellorEnactPolicy(0));
        });
        assertScores(blamed("P1", "P2"), ruleChange("LLLFH", "LFF", moves));
    }

    @Test
    public void theBotInThatGovernmentBlamesNoOne() {
        for (String self : List.of("P1", "P2")) {
            Played played = BotScenes.peeked("LLLFH", "LFF", BotSkill.NORMAL, 0);
            SecretHitlerGame game = played.game();
            PeekMemory memory = new PeekMemory();
            memory.saw(BotScenes.policies("LFF"), game.getDrawSize());
            PeekMemory onlooker = new PeekMemory();
            onlooker.saw(BotScenes.policies("LFF"), game.getDrawSize());
            game.nominateChancellor("P2");
            BotScenes.voteAll(game, true);
            assertEquals(List.of(), memory.observe(game, self));
            assertEquals(List.of(), onlooker.observe(game, "P0"));
            game.presidentDiscardPolicy(0);
            game.chancellorEnactPolicy(0);
            assertEquals(self + " sat in the government", List.of(), memory.observe(game, self));
            assertEquals(List.of("P1", "P2"), onlooker.observe(game, "P0"));
            assertTrue(memory.cards().isEmpty());
            assertTrue(onlooker.cards().isEmpty());
        }
    }

    @Test
    public void aHardFascistKeepsThePeekButBlamesNoOne() {
        Played played = BotScenes.peeked("FLLLH", "LFF", BotSkill.HARD, 0);
        assertEquals(List.of(L, F, F), played.bot().peekMemory().cards());
        assertScores(blamed(), ruleChange("FLLLH", "LFF", roundTwo(0, 0)));
    }

    @Test
    public void aHardLiberalKeepsThePeekUntilTheNextSessionEnds() {
        Played played = BotScenes.peeked("LLLFH", "LFF", BotSkill.HARD, 0);
        assertEquals(List.of(L, F, F), played.bot().peekMemory().cards());
        played.then(g -> g.nominateChancellor("P2"));
        played.then(g -> BotScenes.voteAll(g, true));
        played.then(g -> g.presidentDiscardPolicy(0));
        assertEquals(List.of(L, F, F), played.bot().peekMemory().cards());
        played.then(g -> g.chancellorEnactPolicy(0));
        assertTrue(played.bot().peekMemory().cards().isEmpty());
    }

    @Test
    public void normalAndEasyKeepNoPeek() {
        assertTrue(BotScenes.peeked("LLLFH", "LFF", BotSkill.NORMAL, 0).bot().peekMemory().cards().isEmpty());
        assertTrue(BotScenes.peeked("LLLFH", "LFF", BotSkill.EASY, 0).bot().peekMemory().cards().isEmpty());
    }
}
