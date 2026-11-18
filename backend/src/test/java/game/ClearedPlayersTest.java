package game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import game.BotScenes.Played;
import game.datastructures.Identity;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import org.junit.Test;

/**
 * Hard's rule 1 (the bot skill design's "Cleared players"): a chancellor elected with 3 or more
 * fascist policies down is not Hitler; a Hard liberal keeps them, prefers them when it nominates,
 * votes ja for them, and with 3 or more fascist policies votes nein on a chancellor not cleared
 * unless they are trusted, but votes as Normal does where its own investigation found the
 * president or the chancellor fascist. As president it votes ja for the chancellor it nominated
 * (Phase 25D). Every amount is read from {@link ClearedPlayers}.
 */
public class ClearedPlayersTest {
    private static final int SEEDS = 1_000;
    private static final int NOMINATIONS = 10_000;

    /** {@code LLLFH} with {@code fascist} fascist policies down: P0 nominates P1, every seat votes {@code ja}. */
    private static SecretHitlerGame election(int fascist, boolean ja) {
        SecretHitlerGame game = BotScenes.game("LLLFH");
        BotScenes.board(game, fascist, 0);
        game.nominateChancellor("P1");
        BotScenes.voteAll(game, ja);
        return game;
    }

    /** A list that has seen P1 elected with 3 fascist policies down. */
    private static ClearedPlayers p1Cleared() {
        ClearedPlayers cleared = new ClearedPlayers();
        cleared.observe(election(3, true));
        assertTrue(cleared.contains("P1"));
        return cleared;
    }

    /** P0 nominates P1 with {@code fascist} fascist policies down, the vote still open. */
    private static SecretHitlerGame p1Nominated(int fascist) {
        return BotScenes.vote("LLLFH", fascist).game();
    }

    @Test
    public void aChancellorElectedWithThreeFascistPoliciesDownIsCleared() {
        SecretHitlerGame game = election(3, true);
        assertEquals(GameState.LEGISLATIVE_PRESIDENT, game.getState());
        ClearedPlayers cleared = new ClearedPlayers();
        cleared.observe(game);
        cleared.observe(game);
        assertTrue(cleared.contains("P1"));
        assertFalse(cleared.contains("P0"));
        assertEquals(List.of("P1"), List.copyOf(cleared.names()));
    }

    @Test
    public void itIsStillSeenOnceThePresidentHasDiscarded() {
        SecretHitlerGame game = election(3, true);
        game.presidentDiscardPolicy(0);
        assertEquals(GameState.LEGISLATIVE_CHANCELLOR, game.getState());
        ClearedPlayers cleared = new ClearedPlayers();
        cleared.observe(game);
        assertEquals(List.of("P1"), List.copyOf(cleared.names()));
    }

    @Test
    public void itIsStillSeenWhileAVetoWaits() {
        SecretHitlerGame game = BotScenes.vetoAnswer("LLLFH").game();
        assertEquals(GameState.LEGISLATIVE_PRESIDENT_VETO, game.getState());
        ClearedPlayers cleared = new ClearedPlayers();
        cleared.observe(game);
        assertEquals(List.of("P1"), List.copyOf(cleared.names()));
    }

    @Test
    public void playersAreListedInTheOrderCleared() {
        Played played = BotScenes.cleared("P5", BotSkill.HARD, 0);
        assertEquals(List.of("P3", "P4"), List.copyOf(played.bot().clearedPlayers().names()));
    }

    @Test
    public void twoFascistPoliciesClearNoOne() {
        SecretHitlerGame game = election(2, true);
        ClearedPlayers cleared = new ClearedPlayers();
        cleared.observe(game);
        game.presidentDiscardPolicy(0);
        cleared.observe(game);
        assertTrue(cleared.names().isEmpty());
    }

    @Test
    public void aFailedElectionClearsNoOne() {
        SecretHitlerGame game = election(3, false);
        assertEquals(GameState.POST_LEGISLATIVE, game.getState());
        ClearedPlayers cleared = new ClearedPlayers();
        cleared.observe(game);
        assertTrue(cleared.names().isEmpty());
    }

    @Test
    public void aClearedChancellorGetsJa() {
        ClearedPlayers cleared = p1Cleared();
        assertEquals(Optional.of(true), cleared.vote(p1Nominated(3), "P2", -5, Map.of("P2", Identity.LIBERAL)));
        assertEquals(Optional.of(true), cleared.vote(p1Nominated(3), "P2", 0, Map.of()));
    }

    @Test
    public void aKnownFascistGetsNoJaForBeingCleared() {
        ClearedPlayers cleared = p1Cleared();
        assertEquals(Optional.empty(), cleared.vote(p1Nominated(3), "P2", 0, Map.of("P1", Identity.FASCIST)));
        assertEquals(Optional.empty(), cleared.vote(p1Nominated(3), "P2", 0, Map.of("P0", Identity.FASCIST)));
    }

    @Test
    public void aKnownFascistGetsNoNeinFromTheRuleEither() {
        ClearedPlayers cleared = new ClearedPlayers();
        assertEquals(Optional.empty(), cleared.vote(p1Nominated(3), "P2", -5, Map.of("P1", Identity.FASCIST)));
        assertEquals(Optional.empty(), cleared.vote(p1Nominated(3), "P2", -5, Map.of("P0", Identity.FASCIST)));
    }

    @Test
    public void anUnclearedChancellorUnderTheTrustedScoreGetsNein() {
        ClearedPlayers cleared = new ClearedPlayers();
        assertEquals(Optional.of(false),
                cleared.vote(p1Nominated(3), "P2", ClearedPlayers.TRUSTED_SCORE - 1, Map.of("P1", Identity.LIBERAL)));
        assertEquals(Optional.of(false), cleared.vote(p1Nominated(3), "P2", -5, Map.of()));
        assertEquals(Optional.of(false), cleared.vote(p1Nominated(5), "P2", -5, Map.of()));
    }

    @Test
    public void fromTheTrustedScoreTheVoteIsNormals() {
        ClearedPlayers cleared = new ClearedPlayers();
        assertEquals(Optional.empty(), cleared.vote(p1Nominated(3), "P2", ClearedPlayers.TRUSTED_SCORE, Map.of()));
        assertEquals(Optional.empty(), cleared.vote(p1Nominated(3), "P2", 5, Map.of()));
    }

    @Test
    public void beforeThreeFascistPoliciesTheVoteIsNormals() {
        ClearedPlayers cleared = new ClearedPlayers();
        assertEquals(Optional.empty(), cleared.vote(p1Nominated(2), "P2", -5, Map.of()));
        assertEquals(Optional.empty(), cleared.vote(p1Nominated(0), "P2", -5, Map.of()));
    }

    /** P0 nominated P1: as the president, the CPU of P0 votes ja for its own nominee, cleared or not. */
    @Test
    public void aPresidentGivesItsOwnNomineeJa() {
        ClearedPlayers cleared = new ClearedPlayers();
        assertEquals(Optional.of(true), cleared.vote(p1Nominated(3), "P0", -5, Map.of()));
        assertEquals(Optional.of(true), cleared.vote(p1Nominated(5), "P0", ClearedPlayers.TRUSTED_SCORE - 1, Map.of()));
        assertEquals(Optional.of(true), cleared.vote(p1Nominated(0), "P0", -5, Map.of("P1", Identity.LIBERAL)));
        assertEquals("another voter still says nein", Optional.of(false),
                cleared.vote(p1Nominated(3), "P2", -5, Map.of()));
    }

    /** Rule 1's exception holds for the president too: it votes as Normal does on a nominee it found fascist. */
    @Test
    public void aPresidentVotesAsNormalOnANomineeItFoundFascist() {
        assertEquals(Optional.empty(), new ClearedPlayers().vote(p1Nominated(3), "P0", -5, Map.of("P1", Identity.FASCIST)));
    }

    @Test
    public void onlyClearedPlayersWeighMore() {
        ClearedPlayers cleared = p1Cleared();
        assertEquals(ClearedPlayers.NOMINATION_WEIGHT, cleared.nominationFactor("P1"), 0);
        assertEquals(1, cleared.nominationFactor("P2"), 0);
        assertEquals(1, new ClearedPlayers().nominationFactor("P1"), 0);
    }

    // Through CpuPlayer.

    /** Whom the bot of P2 nominates in {@code cleared}, over the seeds, the eligible seats' scores set to 0 first. */
    private static Map<String, Integer> nominations(BotSkill skill) {
        Map<String, Integer> counts = new TreeMap<>();
        for (int seed = 0; seed < NOMINATIONS; seed++) {
            Played played = BotScenes.cleared("P2", skill, seed);
            for (String seat : List.of("P0", "P3", "P5", "P6")) {
                played.bot().playerReputation.put(seat, 0);
            }
            assertTrue(played.bot().act(played.game()));
            counts.merge(played.game().getCurrentChancellor(), 1, Integer::sum);
        }
        return counts;
    }

    @Test
    public void aHardLiberalPrefersClearedPlayersWhenItNominates() {
        Map<String, Integer> hard = nominations(BotSkill.HARD);
        double weight = ClearedPlayers.NOMINATION_WEIGHT;
        assertEquals("P3's share at Hard: " + hard, weight / (weight + 3), hard.get("P3") / (double) NOMINATIONS,
                0.02);
        assertFalse("the last president was nominated: " + hard, hard.containsKey("P1"));
        assertFalse("the last chancellor was nominated: " + hard, hard.containsKey("P4"));

        Map<String, Integer> normal = nominations(BotSkill.NORMAL);
        assertEquals("P3's share at Normal: " + normal, 0.25, normal.get("P3") / (double) NOMINATIONS, 0.02);
        assertFalse(normal.containsKey("P1"));
        assertFalse(normal.containsKey("P4"));
    }

    /** The vote of the bot of P5 at {@code skill} once P2 nominates {@code chancellor} in {@code cleared}. */
    private static boolean voteOn(String chancellor, BotSkill skill, long seed, int chancellorScore) {
        Played played = BotScenes.cleared("P5", skill, seed);
        played.bot().playerReputation.put(chancellor, chancellorScore);
        played.then(g -> g.nominateChancellor(chancellor));
        assertTrue(played.bot().act(played.game()));
        return played.game().getVotes().get("P5");
    }

    @Test
    public void aHardLiberalVotesForAClearedChancellor() {
        for (long seed = 0; seed < SEEDS; seed++) {
            assertTrue("seed " + seed, voteOn("P3", BotSkill.HARD, seed, 0));
        }
    }

    @Test
    public void aHardLiberalVotesNoOnAChancellorNotCleared() {
        for (long seed = 0; seed < SEEDS; seed++) {
            assertFalse("seed " + seed, voteOn("P6", BotSkill.HARD, seed, 0));
        }
    }

    @Test
    public void aTrustedChancellorGetsNormalsVote() {
        int ja = 0;
        for (long seed = 0; seed < SEEDS; seed++) {
            boolean hard = voteOn("P6", BotSkill.HARD, seed, ClearedPlayers.TRUSTED_SCORE);
            boolean normal = voteOn("P6", BotSkill.NORMAL, seed, ClearedPlayers.TRUSTED_SCORE);
            assertEquals("seed " + seed, normal, hard);
            ja += hard ? 1 : 0;
        }
        assertTrue("Normal's vote is a draw, not always ja: " + ja, 0 < ja && ja < SEEDS);
    }

    /**
     * The bot of P2 presides over round 3 of {@code cleared} and P2 nominates P5, who is not cleared,
     * at a score of {@code score}: the bot's vote on its own nominee.
     */
    private static boolean ownNomineeVote(BotSkill skill, long seed, int score) {
        Played played = BotScenes.cleared("P2", skill, seed);
        played.bot().playerReputation.put("P5", score);
        played.then(g -> g.nominateChancellor("P5"));
        assertTrue(played.bot().act(played.game()));
        return played.game().getVotes().get("P2");
    }

    @Test
    public void aHardLiberalPresidentVotesJaOnItsOwnNominee() {
        int normalJa = 0;
        for (long seed = 0; seed < SEEDS; seed++) {
            assertTrue("seed " + seed, ownNomineeVote(BotSkill.HARD, seed, 0));
            assertTrue("seed " + seed, ownNomineeVote(BotSkill.HARD, seed, -5));
            normalJa += ownNomineeVote(BotSkill.NORMAL, seed, -5) ? 1 : 0;
        }
        assertTrue("Normal's vote on a distrusted nominee is a draw, mostly nein: " + normalJa, normalJa < SEEDS / 2);
    }

    @Test
    public void onlyAHardLiberalKeepsTheList() {
        assertTrue(BotScenes.cleared("P2", BotSkill.NORMAL, 0).bot().clearedPlayers().names().isEmpty());
        assertTrue(BotScenes.cleared("P2", BotSkill.EASY, 0).bot().clearedPlayers().names().isEmpty());
        assertTrue(BotScenes.cleared("P3", BotSkill.HARD, 0).bot().clearedPlayers().names().isEmpty());
        assertTrue(BotScenes.cleared("P6", BotSkill.HARD, 0).bot().clearedPlayers().names().isEmpty());
    }
}
