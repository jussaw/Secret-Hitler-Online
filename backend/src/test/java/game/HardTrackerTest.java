package game;

import static org.junit.Assert.assertEquals;

import game.BotScenes.Played;
import game.BotScenes.Scene;
import java.util.List;
import org.junit.Test;

/**
 * Hard's rule 6 (the bot skill design's "The election tracker"): with two failed elections, a
 * third enacts the top card, so a Hard liberal votes yes more readily and the Hard fascist side
 * less readily. Read through {@link CpuPlayer#chanceOfYes}, the yes probability every voting path
 * works out.
 */
public class HardTrackerTest {
    private static final double TOLERANCE = 1e-6;
    private static final long SEED = 0;

    /** The chance of yes of a Normal bot in {@code scene}. */
    private static float normalChance(Scene scene) {
        return BotScenes.bot(scene, BotSkill.NORMAL, SEED).chanceOfYes(scene.game());
    }

    /** Each voting path's chance is as before the refactor: the curve, the untrusted vote, the fascist side's mix. */
    @Test
    public void normalChancesAreAsBefore() {
        assertEquals(0.75, normalChance(BotScenes.vote("LLLFH")), TOLERANCE);
        Scene untrusted = BotScenes.vote("LLLFH");
        CpuPlayer bot = BotScenes.bot(untrusted, BotSkill.NORMAL, SEED);
        bot.playerReputation.put("P0", -4);
        assertEquals(0.05, bot.chanceOfYes(untrusted.game()), TOLERANCE);
        assertEquals("a fascist on two liberals", 0.6, normalChance(BotScenes.vote("LLFLH")), TOLERANCE);
        assertEquals("a fascist on one of each", 0.7, normalChance(BotScenes.vote("HLFLL")), TOLERANCE);
        assertEquals("a fascist on two of its side", 0.8, normalChance(BotScenes.vote("FHFLLLL")), TOLERANCE);
    }

    /**
     * {@code roles} with {@code fascist} fascist policies down, the bot of {@code bot} made first;
     * {@code failures} failed elections (P0 nominates P1, then P1 nominates P2, every seat's nein,
     * each ending its term), then the next president nominates {@code nominee}: the bot's vote.
     */
    private static Played afterFailures(String roles, int fascist, int failures, String bot, BotSkill skill,
            String nominee) {
        SecretHitlerGame game = BotScenes.game(roles);
        BotScenes.board(game, fascist, 0);
        Played played = new Played(game, BotScenes.bot(game, bot, skill, SEED));
        for (int i = 0; i < failures; i++) {
            String chancellor = "P" + (i + 1);
            played.then(g -> g.nominateChancellor(chancellor));
            played.then(g -> BotScenes.voteAll(g, false));
            played.then(SecretHitlerGame::endPresidentialTerm);
        }
        assertEquals(failures, played.game().getElectionTracker());
        played.then(g -> g.nominateChancellor(nominee));
        return played;
    }

    /** At tracker 2: P2 nominates {@code nominee}, with no policy down. */
    private static Played atTwo(String roles, String bot, BotSkill skill, String nominee) {
        return afterFailures(roles, 0, 2, bot, skill, nominee);
    }

    private static float chance(Played played) {
        return played.bot().chanceOfYes(played.game());
    }

    @Test
    public void aLiberalVotesYesMoreReadilyAtTwoFailedElections() {
        Played played = atTwo("LLFLH", "P3", BotSkill.HARD, "P0");
        assertEquals(0.75 + CpuPlayer.LIBERAL_TRACKER_PUSH * 0.25, chance(played), TOLERANCE);
    }

    @Test
    public void aLiberalStillRejectsAnUntrustedGovernmentAtTwo() {
        Played played = atTwo("LLFLH", "P3", BotSkill.HARD, "P0");
        played.bot().playerReputation.put("P2", -4);
        assertEquals(0.05, chance(played), TOLERANCE);
    }

    /** Rule 1's nein (3 fascist policies, a nominee never in a government and below its trusted score) stands. */
    @Test
    public void rule1sNeinStandsAtTwo() {
        Played played = afterFailures("LLFLH", 3, 2, "P3", BotSkill.HARD, "P0");
        assertEquals(0, chance(played), 0);
    }

    /** Rule 8's pull applies too, as to every government of two players a fascist knows are liberal. */
    @Test
    public void theFascistSidePullsBackFromALiberalGovernmentAtTwo() {
        Played played = atTwo("LLLFH", "P3", BotSkill.HARD, "P0");
        assertEquals(0.6 * (1 - CpuPlayer.FASCIST_TRACKER_PULL) * (1 - CpuPlayer.LIBERAL_GOVERNMENT_PULL),
                chance(played), TOLERANCE);
    }

    @Test
    public void theFascistSideKeepsItsYesForItsOwnGovernment() {
        assertEquals("a fascist on its Hitler", 0.7, chance(atTwo("LLLFH", "P3", BotSkill.HARD, "P4")), TOLERANCE);
        assertEquals("Hitler nominated itself", 2 * 0.75 - 0.75 * 0.75,
                chance(atTwo("LLLHLFF", "P3", BotSkill.HARD, "P3")), TOLERANCE);
    }

    @Test
    public void hitlerAtSevenSeatsPullsBackToo() {
        Played played = atTwo("LLLHLFF", "P3", BotSkill.HARD, "P0");
        assertEquals(0.75 * (1 - CpuPlayer.FASCIST_TRACKER_PULL), chance(played), TOLERANCE);
    }

    /** The fascist's chance keeps rule 8's pull, which every government of two known liberals gets. */
    @Test
    public void oneFailedElectionChangesNothing() {
        assertEquals(0.75, chance(afterFailures("LLFLH", 0, 1, "P3", BotSkill.HARD, "P0")), TOLERANCE);
        assertEquals(0.6 * (1 - CpuPlayer.LIBERAL_GOVERNMENT_PULL),
                chance(afterFailures("LLLFH", 0, 1, "P3", BotSkill.HARD, "P0")), TOLERANCE);
    }

    @Test
    public void normalAndEasyIgnoreTheTracker() {
        for (BotSkill skill : List.of(BotSkill.NORMAL, BotSkill.EASY)) {
            assertEquals(skill.name(), 0.75, chance(atTwo("LLFLH", "P3", skill, "P0")), TOLERANCE);
            assertEquals(skill.name(), 0.6, chance(atTwo("LLLFH", "P3", skill, "P0")), TOLERANCE);
        }
    }
}
