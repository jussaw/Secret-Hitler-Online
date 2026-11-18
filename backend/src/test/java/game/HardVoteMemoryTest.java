package game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import game.BotScenes.Played;
import game.CpuPlayer.Election;
import game.datastructures.Policy;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.junit.Test;

/**
 * Hard's rule 3 (the bot skill design's "Votes"): a Hard bot that reads the game remembers every
 * player's vote in every election once it closes, and lowers, a little, the players who voted yes
 * for a government that then enacted a fascist policy, by {@link CpuPlayer#VOTE_DROP} scaled by the
 * deck's odds as rule 5 scales the onlooker's drop.
 */
public class HardVoteMemoryTest {
    private static final double TOLERANCE = 1e-9;
    private static final long SEED = 0;

    private static Map<String, Boolean> votes(Object... seatsAndVotes) {
        Map<String, Boolean> votes = new TreeMap<>();
        for (int i = 0; i < seatsAndVotes.length; i += 2) {
            votes.put((String) seatsAndVotes[i], (Boolean) seatsAndVotes[i + 1]);
        }
        return votes;
    }

    private static final Election ROUND_ONE = new Election(1, "P0", "P1",
            votes("P0", true, "P1", true, "P2", true, "P3", true, "P4", true));

    /** Each seat votes as {@code ballots} says, in the order given. */
    private static void ballots(Played played, Object... seatsAndVotes) {
        for (int i = 0; i < seatsAndVotes.length; i += 2) {
            String seat = (String) seatsAndVotes[i];
            boolean ja = (Boolean) seatsAndVotes[i + 1];
            played.then(g -> g.registerVote(seat, ja));
        }
    }

    /** The president discards the first card of {@code type}. */
    private static void presidentDiscards(Played played, Policy.Type type) {
        played.then(g -> g.presidentDiscardPolicy(Decision.letters(g.getPresidentLegislativeChoices())
                .indexOf(Decision.letter(type))));
    }

    /** The chancellor enacts the first card of {@code type}. */
    private static void chancellorEnacts(Played played, Policy.Type type) {
        played.then(g -> g.chancellorEnactPolicy(Decision.letters(g.getChancellorLegislativeChoices())
                .indexOf(Decision.letter(type))));
    }

    /** The drop for one fascist policy from {@code liberals} and {@code fascists} unplaced cards. */
    private static double unlikely(int liberals, int fascists) {
        return 1 - DeckOdds.allFascist(liberals, fascists, 3);
    }

    @Test
    public void remembersEveryVoteOnceTheElectionCloses() {
        Played played = BotScenes.secondRound("LLLFH", "P2", BotSkill.HARD, SEED);
        assertEquals(List.of(ROUND_ONE), played.bot().elections());

        played.then(g -> g.nominateChancellor("P3"));
        ballots(played, "P0", true, "P1", true, "P4", true, "P3", false);
        played.botActs();
        boolean v = played.game().getVotes().get("P2");

        Election roundTwo = new Election(2, "P1", "P3", votes("P0", true, "P1", true, "P2", v, "P3", false, "P4", true));
        assertEquals(List.of(ROUND_ONE, roundTwo), played.bot().elections());
        assertTrue(played.bot().elections().get(1).votes() instanceof TreeMap);
    }

    @Test
    public void remembersAFailedElection() {
        Played played = BotScenes.secondRound("LLLFH", "P2", BotSkill.HARD, SEED);
        played.then(g -> g.nominateChancellor("P3"));
        played.then(g -> BotScenes.voteAll(g, false));
        assertEquals(GameState.POST_LEGISLATIVE, played.game().getState());
        List<Election> elections = played.bot().elections();
        assertEquals(2, elections.size());
        assertEquals(ROUND_ONE, elections.get(0));
        assertEquals(new Election(2, "P1", "P3", votes("P0", false, "P1", false, "P2", false, "P3", false, "P4", false)),
                elections.get(1));
    }

    @Test
    public void neverReadsAnElectionStillOpen() {
        Played played = BotScenes.secondRound("LLLFH", "P2", BotSkill.HARD, SEED);
        played.then(g -> g.nominateChancellor("P3"));
        ballots(played, "P0", true, "P4", false);
        played.updateAgain();
        assertEquals(List.of(ROUND_ONE), played.bot().elections());
    }

    /** At round 2's nomination the game still holds round 1's votes: a bot that missed round 1 takes none of them. */
    @Test
    public void aRoundItNeverSawIsNotTakenForTheNext() {
        SecretHitlerGame game = BotScenes.game("LLLFH");
        CpuPlayer bot = BotScenes.bot(game, "P2", BotSkill.HARD, SEED);
        BotScenes.drawTop(game, "LLL");
        BotScenes.elect(game, "P1");
        game.presidentDiscardPolicy(0);
        game.chancellorEnactPolicy(0);
        game.endPresidentialTerm();
        Played played = new Played(game, bot);

        played.updateAgain();
        assertEquals(List.of(), bot.elections());
        played.then(g -> g.nominateChancellor("P3"));
        played.then(g -> BotScenes.voteAll(g, true));
        assertEquals(1, bot.elections().size());
        assertEquals(2, bot.elections().get(0).round());
        assertEquals("P1", bot.elections().get(0).president());
    }

    @Test
    public void remembersEachElectionOnce() {
        Played played = BotScenes.secondRound("LLLFH", "P2", BotSkill.HARD, SEED);
        played.then(g -> g.nominateChancellor("P3"));
        played.then(g -> BotScenes.voteAll(g, true));
        played.updateAgain();
        played.updateAgain();
        played.updateAgain();
        assertEquals(2, played.bot().elections().size());
        assertEquals(2, played.bot().elections().get(1).round());
    }

    @Test
    public void lowersYesVotersOfAGovernmentThatEnactsAFascistPolicy() {
        Played played = BotScenes.secondRound("LLLFH", "P2", BotSkill.HARD, SEED);
        played.then(g -> BotScenes.drawTop(g, "FFL"));
        played.then(g -> g.nominateChancellor("P3"));
        ballots(played, "P4", false, "P0", true, "P1", true, "P2", true, "P3", true);
        presidentDiscards(played, Policy.Type.LIBERAL);
        chancellorEnacts(played, Policy.Type.FASCIST);
        assertEquals(GameState.POST_LEGISLATIVE, played.game().getState());

        double unlikely = unlikely(5, 11);
        assertEquals(-CpuPlayer.VOTE_DROP * unlikely, played.bot().score("P0"), TOLERANCE);
        assertEquals(0, played.bot().score("P4"), 0);
        assertEquals("the onlooker drop alone", -unlikely, played.bot().score("P1"), TOLERANCE);
        assertEquals("the onlooker drop alone", -unlikely, played.bot().score("P3"), TOLERANCE);
    }

    @Test
    public void leavesVotersOfALiberalPolicyAlone() {
        Played played = BotScenes.secondRound("LLLFH", "P2", BotSkill.HARD, SEED);
        played.then(g -> BotScenes.drawTop(g, "LLF"));
        played.then(g -> g.nominateChancellor("P3"));
        played.then(g -> BotScenes.voteAll(g, true));
        presidentDiscards(played, Policy.Type.FASCIST);
        chancellorEnacts(played, Policy.Type.LIBERAL);
        assertEquals(GameState.POST_LEGISLATIVE, played.game().getState());
        assertEquals(0, played.bot().score("P0"), 0);
    }

    /** Three failed elections enact a chaos policy that no vote chose. */
    @Test
    public void aChaosPolicyBlamesNoVoter() {
        Played played = BotScenes.secondRound("LLFHL", "P4", BotSkill.HARD, SEED);
        for (String chancellor : List.of("P2", "P3", "P2")) {
            played.then(g -> g.nominateChancellor(chancellor));
            played.then(g -> g.registerVote("P0", true));
            played.then(g -> BotScenes.voteAll(g, false));
            assertEquals(GameState.POST_LEGISLATIVE, played.game().getState());
            played.then(SecretHitlerGame::endPresidentialTerm);
        }
        assertEquals(2, played.game().getNumLiberalPolicies() + played.game().getNumFascistPolicies());
        assertEquals(0, played.bot().score("P0"), 0);
    }

    @Test
    public void backingAddsUp() {
        Played played = BotScenes.secondRound("LLFHL", "P4", BotSkill.HARD, SEED);
        for (String chancellor : List.of("P2", "P3")) {
            played.then(g -> BotScenes.drawTop(g, "FFL"));
            played.then(g -> g.nominateChancellor(chancellor));
            played.then(g -> BotScenes.voteAll(g, true));
            presidentDiscards(played, Policy.Type.LIBERAL);
            chancellorEnacts(played, Policy.Type.FASCIST);
            assertEquals(GameState.POST_LEGISLATIVE, played.game().getState());
            played.then(SecretHitlerGame::endPresidentialTerm);
        }
        assertEquals(-CpuPlayer.VOTE_DROP * (unlikely(5, 11) + unlikely(5, 10)), played.bot().score("P0"), TOLERANCE);
    }

    @Test
    public void onlyReadersRemember() {
        for (BotSkill skill : List.of(BotSkill.NORMAL, BotSkill.EASY)) {
            assertEquals(skill.name(), List.of(), BotScenes.secondRound("LLLFH", "P2", skill, SEED).bot().elections());
        }
        assertEquals("a Hard fascist", List.of(),
                BotScenes.secondRound("LLFLH", "P2", BotSkill.HARD, SEED).bot().elections());
        assertEquals("a Hard Hitler at five", List.of(),
                BotScenes.secondRound("LLHLF", "P2", BotSkill.HARD, SEED).bot().elections());
        List<Election> hitlerAtSeven = BotScenes.secondRound("LLHLLFF", "P2", BotSkill.HARD, SEED).bot().elections();
        assertEquals(1, hitlerAtSeven.size());
        assertEquals(1, hitlerAtSeven.get(0).round());
    }
}
