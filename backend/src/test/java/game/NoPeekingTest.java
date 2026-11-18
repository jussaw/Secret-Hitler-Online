package game;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import game.BotScenes.Scene;
import game.datastructures.Policy;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.util.function.Supplier;
import org.junit.Test;

/**
 * No level reads what its seat could not see (the bot skill design's anti-goal and "The
 * no-peeking test"): one bot in each of two games its seat cannot tell apart, which differ in
 * something hidden from it (another seat's role, a card it has not seen, a card another president
 * discarded, how others have voted while the election is open), decides the same and remembers
 * the same, at every level and seed.
 *
 * <p>To cover a new rule (as Phases 25B, 25C and 25D did): add a test inside {@link #everyLevelAndSeed} that
 * builds both games with {@link BotScenes}, hides a fact in the second (each pair of
 * {@link #swaps} with {@code swapRoles} for a bot that does not know every role,
 * {@code swapUnseenCards}, or {@link Twins#others(Consumer, Consumer)} for a discard or an open
 * election's ballot, as {@link #votesWithBallotsAlreadyIn} does), and drives {@link Twins} through
 * the moves that bring the rule into play.
 */
public class NoPeekingTest {
    /** Seeds 0 to {@code SEEDS - 1}, mixed, at every level. */
    static final int SEEDS = 200;

    /** Runs {@code scene} at each level for each seed, a failure naming the level and seed. */
    static void everyLevelAndSeed(BiConsumer<BotSkill, Long> scene) {
        for (BotSkill skill : BotSkill.values()) {
            for (long seed = 0; seed < SEEDS; seed++) {
                try {
                    scene.accept(skill, seed);
                } catch (AssertionError e) {
                    throw new AssertionError(skill + " at seed " + seed + ": " + e.getMessage(), e);
                }
            }
        }
    }

    /**
     * Every pair of seats but {@code bot} whose roles in {@code roles} differ, in seat order,
     * leaving out a pair that would make a seat of {@code electedAtThree} Hitler (a seat the scene
     * elects chancellor with 3 or more fascist policies down, which would have ended the game).
     */
    static List<String[]> swaps(String roles, String bot, String... electedAtThree) {
        List<String> elected = Arrays.asList(electedAtThree);
        List<String[]> pairs = new ArrayList<>();
        for (int i = 0; i < roles.length(); i++) {
            for (int j = i + 1; j < roles.length(); j++) {
                String a = "P" + i;
                String b = "P" + j;
                char roleOfA = roles.charAt(i);
                char roleOfB = roles.charAt(j);
                if (a.equals(bot) || b.equals(bot) || roleOfA == roleOfB) {
                    continue;
                }
                if ((roleOfA == 'H' && elected.contains(b)) || (roleOfB == 'H' && elected.contains(a))) {
                    continue;
                }
                pairs.add(new String[] {a, b});
            }
        }
        return pairs;
    }

    /** A fact hidden in the second game, named for a failure. */
    private record Hidden(String name, Consumer<SecretHitlerGame> hide) {
    }

    /** Each pair of {@link #swaps}, swapped. */
    private static List<Hidden> eachSwap(String roles, String bot, String... electedAtThree) {
        List<Hidden> hidden = new ArrayList<>();
        for (String[] pair : swaps(roles, bot, electedAtThree)) {
            hidden.add(new Hidden("the roles of " + pair[0] + " and " + pair[1] + " swapped",
                    g -> BotScenes.swapRoles(g, pair[0], pair[1])));
        }
        return hidden;
    }

    private static final Hidden UNSEEN_CARDS = new Hidden("an unseen liberal and fascist card swapped",
            g -> BotScenes.swapUnseenCards(g, 0));

    private static final Hidden NOTHING = new Hidden("nothing but the scene's own difference", g -> {
    });

    private static List<Hidden> with(List<Hidden> hidden, Hidden... more) {
        List<Hidden> all = new ArrayList<>(hidden);
        all.addAll(List.of(more));
        return all;
    }

    /**
     * For each hidden fact: both games from their builders, the fact hidden in the second, and
     * {@code play} driving the twins (a Hard rule that remembers what it saw plays a longer scene).
     */
    private static void playsAlike(Supplier<Scene> first, Supplier<Scene> second, List<Hidden> hidden,
            Consumer<Twins> play) {
        everyLevelAndSeed((skill, seed) -> {
            for (Hidden fact : hidden) {
                Scene a = first.get();
                Scene b = second.get();
                fact.hide().accept(b.game());
                try {
                    play.accept(Twins.of(a, b, skill, seed));
                } catch (AssertionError e) {
                    throw new AssertionError("with " + fact.name() + ": " + e.getMessage(), e);
                }
            }
        });
    }

    /** {@link #playsAlike} with the bot acting once in each game. */
    private static void actsAlike(Supplier<Scene> first, Supplier<Scene> second, List<Hidden> hidden) {
        playsAlike(first, second, hidden, Twins::botActs);
    }

    private static void actsAlike(Supplier<Scene> scene, List<Hidden> hidden) {
        actsAlike(scene, scene, hidden);
    }

    @Test
    public void nominations() {
        actsAlike(() -> BotScenes.nomination("LLLFH"), eachSwap("LLLFH", "P1"));
    }

    @Test
    public void nominationsByAFascist() {
        actsAlike(() -> BotScenes.nomination("LFLLLFH"), List.of(UNSEEN_CARDS));
    }

    @Test
    public void nominationsByHitlerAtSeven() {
        actsAlike(() -> BotScenes.nomination("LHLLLFF"), eachSwap("LHLLLFF", "P1"));
    }

    @Test
    public void votes() {
        actsAlike(() -> BotScenes.vote("LLLFH"), eachSwap("LLLFH", "P2"));
    }

    @Test
    public void votesByHitlerAtSeven() {
        actsAlike(() -> BotScenes.vote("LLHLLFF"), eachSwap("LLHLLFF", "P2"));
    }

    /**
     * After 3 fascist policies the bot reaches {@code game.getPlayer(chancellor).isHitler()}, which
     * is harmless while Hitler is the bot: it knows it is not the chancellor.
     */
    @Test
    public void votesByHitlerAtSevenAfterThreeFascistPolicies() {
        actsAlike(() -> BotScenes.vote("LLHLLFF", 3), eachSwap("LLHLLFF", "P2"));
    }

    /** Bots vote one by one in one step: a bot must not read the ballots already in. */
    @Test
    public void votesWithBallotsAlreadyIn() {
        for (String roles : List.of("LLLFH", "LLHLLFF")) {
            everyLevelAndSeed((skill, seed) -> {
                Twins twins = Twins.of(BotScenes.vote(roles), BotScenes.vote(roles), skill, seed);
                twins.others(g -> {
                    g.registerVote("P0", true);
                    g.registerVote("P1", true);
                }, g -> {
                    g.registerVote("P0", false);
                    g.registerVote("P1", false);
                });
                twins.botActs();
            });
        }
    }

    @Test
    public void presidentsDiscards() {
        actsAlike(() -> BotScenes.presidentsHand("LLLFH", "FFL"), with(eachSwap("LLLFH", "P0"), UNSEEN_CARDS));
    }

    @Test
    public void presidentsDiscardsByAFascist() {
        actsAlike(() -> BotScenes.presidentsHand("FLLLH", "FLL"), List.of(UNSEEN_CARDS));
    }

    @Test
    public void presidentsDiscardsByHitlerAtSeven() {
        actsAlike(() -> BotScenes.presidentsHand("HLLLLFF", "FFL"), with(eachSwap("HLLLLFF", "P0"), UNSEEN_CARDS));
    }

    /** The card the president discarded (the extra) differs, and the chancellor never saw it. */
    @Test
    public void chancellorsChoices() {
        actsAlike(() -> BotScenes.chancellorsHand("LLLFH", "FL", "L", 0),
                () -> BotScenes.chancellorsHand("LLLFH", "FL", "F", 0), with(eachSwap("LLLFH", "P1"), NOTHING));
    }

    @Test
    public void chancellorsChoicesByAFascist() {
        actsAlike(() -> BotScenes.chancellorsHand("LFLLH", "FL", "L", 0),
                () -> BotScenes.chancellorsHand("LFLLH", "FL", "F", 0), List.of(NOTHING));
    }

    @Test
    public void chancellorsChoicesByHitlerAtSeven() {
        actsAlike(() -> BotScenes.chancellorsHand("LHLLLFF", "FL", "L", 0),
                () -> BotScenes.chancellorsHand("LHLLLFF", "FL", "F", 0), with(eachSwap("LHLLLFF", "P1"), NOTHING));
    }

    @Test
    public void vetoRequests() {
        actsAlike(() -> BotScenes.chancellorsHand("LLLFH", "FF", "L", 5),
                () -> BotScenes.chancellorsHand("LLLFH", "FF", "F", 5), with(eachSwap("LLLFH", "P1"), NOTHING));
    }

    @Test
    public void vetoAnswers() {
        actsAlike(() -> BotScenes.vetoAnswer("LLLFH"), with(eachSwap("LLLFH", "P0", "P1"), UNSEEN_CARDS));
    }

    @Test
    public void investigations() {
        actsAlike(() -> BotScenes.power("LLLLLFFFH", 1, ""), eachSwap("LLLLLFFFH", "P0"));
    }

    @Test
    public void specialElections() {
        actsAlike(() -> BotScenes.power("LLLLFFH", 3, ""), eachSwap("LLLLFFH", "P0"));
    }

    @Test
    public void executions() {
        actsAlike(() -> BotScenes.power("LLLFH", 4, ""), eachSwap("LLLFH", "P0", "P1"));
    }

    @Test
    public void executionsByAFascist() {
        actsAlike(() -> BotScenes.power("FLLLLFH", 4, ""), List.of(UNSEEN_CARDS));
    }

    // Hard's rules (Phase 25B). Each runs at every level, so Easy and Normal are checked on the
    // same scenes.

    /**
     * The president nominates {@code chancellor}; the bot votes; the others vote ja; the president
     * discards the first card, the chancellor enacts the first and the president ends the term.
     */
    private static void electedWhileTheBotVotes(Twins twins, String chancellor) {
        twins.others(g -> g.nominateChancellor(chancellor));
        twins.botActs();
        twins.others(g -> BotScenes.voteAll(g, true));
        twins.others(g -> g.presidentDiscardPolicy(0));
        twins.others(g -> g.chancellorEnactPolicy(0));
        twins.others(SecretHitlerGame::endPresidentialTerm);
    }

    /**
     * Rule 1: the bot of P2 votes while P3 and then P4 are elected at 3 fascist policies, then
     * nominates and votes on its own nominee (Phase 25D's ja), with every pair of other seats'
     * roles that keeps P3 and P4 from Hitler swapped (a rule that cleared a chancellor by their
     * role would tell them apart).
     */
    @Test
    public void hardRule1ClearedPlayers() {
        Supplier<Scene> scene = () -> new Scene(BotScenes.clearedStart(), "P2");
        playsAlike(scene, scene, eachSwap("FLLFLLH", "P2", "P3", "P4"), twins -> {
            electedWhileTheBotVotes(twins, "P3");
            electedWhileTheBotVotes(twins, "P4");
            twins.botActs();
            twins.botActs();
        });
    }

    /**
     * Rule 2: the bot of P1 is handed two fascist cards; the card the president discarded (the
     * extra) differs, and every pair of other seats' roles is swapped.
     */
    @Test
    public void hardRule2TwoFascistCards() {
        actsAlike(() -> BotScenes.chancellorsHand("LLLFH", "FF", "L", 0),
                () -> BotScenes.chancellorsHand("LLLFH", "FF", "F", 0), with(eachSwap("LLLFH", "P1"), NOTHING));
    }

    @Test
    public void hardRule2TwoLiberalCards() {
        actsAlike(() -> BotScenes.chancellorsHand("LLLFH", "LL", "F", 0),
                () -> BotScenes.chancellorsHand("LLLFH", "LL", "L", 0), with(eachSwap("LLLFH", "P1"), NOTHING));
    }

    @Test
    public void hardRule2HitlerAtSeven() {
        actsAlike(() -> BotScenes.chancellorsHand("LHLLLFF", "FF", "L", 0),
                () -> BotScenes.chancellorsHand("LHLLLFF", "FF", "F", 0), with(eachSwap("LHLLLFF", "P1"), NOTHING));
    }

    /**
     * Rule 4: the bot of P0 elects P1, peeks at LFF and ends its term; P1 elects P2 while the bot
     * votes, and the two games' governments enact a fascist policy differently (P1 discards the
     * liberal card in the first and a fascist one in the second); P1 executes P2, and the bot votes
     * on P3's nomination of P1. Every pair of other seats' roles that keeps P2 from Hitler is
     * swapped, and with it the cards under the six the bot saw.
     */
    @Test
    public void hardRule4Peek() {
        List<Hidden> hidden = new ArrayList<>();
        for (Hidden swap : eachSwap("LLLFH", "P0", "P2")) {
            hidden.add(new Hidden(swap.name() + " and the cards under the peek swapped", g -> {
                swap.hide().accept(g);
                BotScenes.swapUnseenCards(g, 6);
            }));
        }
        Supplier<Scene> scene = () -> new Scene(BotScenes.peekStart("LLLFH", "LFF"), "P0");
        playsAlike(scene, scene, hidden, twins -> {
            twins.others(g -> g.nominateChancellor("P1"));
            twins.others(g -> BotScenes.voteAll(g, true));
            twins.botActs();
            twins.others(g -> g.chancellorEnactPolicy(0));
            twins.botActs();
            twins.botActs();
            twins.others(g -> g.nominateChancellor("P2"));
            twins.botActs();
            twins.others(g -> BotScenes.voteAll(g, true));
            twins.others(g -> g.presidentDiscardPolicy(0), g -> g.presidentDiscardPolicy(1));
            twins.others(g -> g.chancellorEnactPolicy(0), g -> g.chancellorEnactPolicy(1));
            twins.others(g -> g.executePlayer("P2"));
            twins.others(SecretHitlerGame::endPresidentialTerm);
            twins.others(g -> g.nominateChancellor("P1"));
            twins.botActs();
        });
    }

    // Hard's other rules (Phase 25C).

    /**
     * {@link BotScenes#secondRound}'s round 1 on twins, the bot voting itself: {@code LLL} on top,
     * P0 elects P1, P0 discards the first card, P1 enacts the first and P0 ends the term.
     */
    private static void roundOne(Twins twins) {
        twins.others(g -> BotScenes.drawTop(g, "LLL"));
        twins.others(g -> g.nominateChancellor("P1"));
        twins.botActs();
        twins.others(g -> BotScenes.voteAll(g, true));
        twins.others(g -> g.presidentDiscardPolicy(0));
        twins.others(g -> g.chancellorEnactPolicy(0));
        twins.others(SecretHitlerGame::endPresidentialTerm);
    }

    /** The chancellor enacts the first fascist card it holds. */
    private static void enactsAFascist(SecretHitlerGame game) {
        BotScenes.chancellorEnacts(game, Policy.Type.FASCIST);
    }

    /**
     * Rule 5: the bot of P2, an onlooker, judges round 2's government by the deck's odds. P1
     * discards the liberal card in the first game and a fascist one in the second, P3 enacting a
     * fascist policy either way, and the cards under round 2's hand are swapped in the second; the
     * bot then nominates, a decision that reads both members' scores.
     */
    @Test
    public void hardRule5DeckOdds() {
        everyLevelAndSeed((skill, seed) -> {
            Twins twins = Twins.of(new Scene(BotScenes.game("LLLFH"), "P2"), new Scene(BotScenes.game("LLLFH"), "P2"),
                    skill, seed);
            roundOne(twins);
            twins.others(g -> BotScenes.drawTop(g, "FFL"), g -> {
                BotScenes.drawTop(g, "FFL");
                BotScenes.swapUnseenCards(g, 3);
            });
            twins.others(g -> g.nominateChancellor("P3"));
            twins.botActs();
            twins.others(g -> BotScenes.voteAll(g, true));
            twins.others(g -> g.presidentDiscardPolicy(2), g -> g.presidentDiscardPolicy(0));
            twins.others(NoPeekingTest::enactsAFascist);
            twins.others(SecretHitlerGame::endPresidentialTerm);
            twins.botActs();
        });
    }

    /**
     * Rule 5's own cards: round 2 fails, then the bot of P2 presides over FFL, nominates, votes,
     * discards, and its chancellor enacts a fascist policy, so the bot deduces the card its
     * chancellor discarded; it then ends its term and votes in round 4. The cards under round 3's
     * hand, which it never sees, are swapped in the second game.
     */
    @Test
    public void hardRule5PresidentsOwnCards() {
        everyLevelAndSeed((skill, seed) -> {
            Twins twins = Twins.of(new Scene(BotScenes.game("LLLFH"), "P2"), new Scene(BotScenes.game("LLLFH"), "P2"),
                    skill, seed);
            roundOne(twins);
            twins.others(g -> g.nominateChancellor("P3"));
            twins.botActs();
            twins.others(g -> BotScenes.voteAll(g, false));
            twins.others(SecretHitlerGame::endPresidentialTerm);
            twins.others(g -> BotScenes.drawTop(g, "FFL"), g -> {
                BotScenes.drawTop(g, "FFL");
                BotScenes.swapUnseenCards(g, 3);
            });
            twins.botActs();
            twins.botActs();
            twins.others(g -> BotScenes.voteAll(g, true));
            twins.botActs();
            twins.others(NoPeekingTest::enactsAFascist);
            twins.botActs();
            twins.others(g -> g.nominateChancellor("P0".equals(g.getLastChancellor()) ? "P1" : "P0"));
            twins.botActs();
        });
    }

    /**
     * Rule 3: the bot of P2 remembers round 2's votes, where P3 and P5 (a liberal and a fascist,
     * their roles swapped in the second game) back a government that enacts a fascist policy; it
     * then presides, votes, and votes on P3's nomination, a decision that reads P3's score.
     */
    @Test
    public void hardRule3Votes() {
        Supplier<Scene> scene = () -> new Scene(BotScenes.game("LLLLFFH"), "P2");
        Hidden swap = new Hidden("the roles of P3 and P5 swapped", g -> BotScenes.swapRoles(g, "P3", "P5"));
        playsAlike(scene, scene, List.of(swap), twins -> {
            roundOne(twins);
            twins.others(g -> BotScenes.drawTop(g, "FFL"));
            twins.others(g -> g.nominateChancellor("P4"));
            twins.others(g -> {
                g.registerVote("P3", true);
                g.registerVote("P5", true);
                g.registerVote("P6", false);
            });
            twins.botActs();
            twins.others(g -> BotScenes.voteAll(g, true));
            twins.others(g -> g.presidentDiscardPolicy(2));
            twins.others(NoPeekingTest::enactsAFascist);
            twins.others(SecretHitlerGame::endPresidentialTerm);
            twins.botActs();
            twins.botActs();
            twins.others(g -> BotScenes.voteAll(g, false));
            twins.botActs();
            twins.others(g -> g.nominateChancellor("P0"));
            twins.botActs();
        });
    }

    /** Rule 3 never reads an open election's ballots: P3 votes ja in the first game and nein in the second. */
    @Test
    public void hardRule3OpenBallots() {
        everyLevelAndSeed((skill, seed) -> {
            Twins twins = Twins.of(BotScenes.vote("LLLFH"), BotScenes.vote("LLLFH"), skill, seed);
            twins.others(g -> g.registerVote("P3", true), g -> g.registerVote("P3", false));
            twins.botActs();
        });
    }

    /**
     * Rule 6: two failed elections (P0 nominates P1, then P1 nominates P2, every seat's nein), then
     * P2 nominates P0 and the bot of P3 votes, with {@code hidden} hidden in the second game.
     */
    private static void votesAtTrackerTwo(String roles, Hidden hidden) {
        playsAlike(() -> new Scene(BotScenes.game(roles), "P3"), () -> new Scene(BotScenes.game(roles), "P3"),
                List.of(hidden), twins -> {
                    for (String chancellor : List.of("P1", "P2")) {
                        twins.others(g -> g.nominateChancellor(chancellor));
                        twins.others(g -> BotScenes.voteAll(g, false));
                        twins.others(SecretHitlerGame::endPresidentialTerm);
                    }
                    twins.others(g -> g.nominateChancellor("P0"));
                    twins.botActs();
                });
    }

    /** Rule 6 for a liberal: the nominee P0, a liberal, swapped with Hitler. */
    @Test
    public void hardRule6TrackerLiberal() {
        votesAtTrackerTwo("LLFLH",
                new Hidden("the roles of P0 and P4 swapped", g -> BotScenes.swapRoles(g, "P0", "P4")));
    }

    /** Rule 6 for Hitler at seven, who knows no other role: the nominee P0, a liberal, swapped with a fascist. */
    @Test
    public void hardRule6TrackerHitlerAtSeven() {
        votesAtTrackerTwo("LLLHLFF",
                new Hidden("the roles of P0 and P5 swapped", g -> BotScenes.swapRoles(g, "P0", "P5")));
    }

    /** Rule 6 for a fascist, who knows every role: an unseen card. */
    @Test
    public void hardRule6TrackerFascist() {
        votesAtTrackerTwo("LLLFH", UNSEEN_CARDS);
    }

    /** Rule 7: a fascist chancellor holding one of each under a liberal president, unseen cards swapped. */
    @Test
    public void hardRule7ChancellorBluffs() {
        actsAlike(() -> BotScenes.chancellorsHand("LFLLH", "FL", "F", 0), List.of(UNSEEN_CARDS));
    }

    /** Rule 7: a fascist president dealt FFL with a liberal chancellor, the cards it has not seen swapped. */
    @Test
    public void hardRule7PresidentBluffs() {
        actsAlike(() -> BotScenes.presidentsHand("FLLLH", "FFL"), List.of(UNSEEN_CARDS));
    }

    // Phase 25D's extra fascist-side rules. A fascist knows every role, so its twin hides a card.

    /** Rule 8: a fascist votes on a government of two liberals; unseen cards swapped. */
    @Test
    public void hardRule8VotesDownLiberalGovernments() {
        actsAlike(() -> BotScenes.vote("LLFLH"), List.of(UNSEEN_CARDS));
    }

    /**
     * Rule 8 for Hitler at 5, who knows every role: a government of two liberals, unseen cards
     * swapped. Hitler at 7 knows no role, which {@link #votesByHitlerAtSeven}'s swaps cover.
     */
    @Test
    public void hardRule8HitlerAtFive() {
        actsAlike(() -> BotScenes.vote("LLHLF"), List.of(UNSEEN_CARDS));
    }

    /** Rule 9: a fascist holds the special election at 7 seats, its teammate alive; unseen cards swapped. */
    @Test
    public void hardRule9SideElections() {
        actsAlike(() -> BotScenes.power("FLLLLFH", 3, ""), List.of(UNSEEN_CARDS));
    }

    // The test's own checks: that its seeds differ, and that the twins catch what they should.

    /** Normal always passes FL from FFL as a liberal; Easy passes FF for some of the seeds. */
    @Test
    public void easyMakesMistakesAcrossTheSeeds() {
        for (long seed = 0; seed < SEEDS; seed++) {
            Scene scene = BotScenes.presidentsHand("LLLFH", "FFL");
            CpuPlayer bot = BotScenes.bot(scene, BotSkill.EASY, seed);
            GameState before = scene.game().getState();
            if (Decision.of(before, bot.act(scene.game()), scene.game(), scene.bot()).equals("pass FF")) {
                return;
            }
        }
        fail("No Easy bot passed FF from FFL at seeds 0 to " + (SEEDS - 1) + ": the seeds are not mixed.");
    }

    @Test
    public void theTwinsTellADecisionApart() {
        for (long seed = 0; seed < SEEDS; seed++) {
            Twins twins = Twins.of(BotScenes.presidentsHand("LLLFH", "LLF"),
                    BotScenes.presidentsHand("LLLFH", "LLF"), BotSkill.NORMAL, seed, seed + 1);
            AssertionError error = thrown(twins::botActs);
            if (error != null) {
                assertTrue(error.getMessage(), error.getMessage().contains("decided differently"));
                return;
            }
        }
        fail("Two bots seeded apart never decided differently.");
    }

    @Test
    public void theTwinsTellAHandTheBotSees() {
        Twins twins = Twins.of(BotScenes.presidentsHand("LLLFH", "LLF"), BotScenes.presidentsHand("LLLFH", "LLL"),
                BotSkill.NORMAL, 0);
        AssertionError error = thrown(twins::botActs);
        assertNotNull("a hand the bot holds told the games apart", error);
        assertTrue(error.getMessage(), error.getMessage().contains("the scene let the bot tell the games apart"));
    }

    @Test
    public void theTwinsTellADifferentMemory() {
        Twins twins = Twins.of(BotScenes.vote("LLLFH"), BotScenes.vote("LLLFH"), BotSkill.NORMAL, 0);
        twins.botB().playerReputation.put("P3", -5);
        AssertionError error = thrown(() -> twins.others(g -> {
        }));
        assertNotNull("a different score told the bots apart", error);
        assertTrue(error.getMessage(), error.getMessage().contains("P3=-5"));
    }

    @Test
    public void theTwinsTellADifferentNumberOfDraws() {
        Twins twins = Twins.of(BotScenes.vote("LLLFH"), BotScenes.vote("LLLFH"), BotSkill.NORMAL, 0);
        twins.botB().chooseRandomPlayerWeighted(BotScenes.vote("LLLFH").game().getPlayerList(), 1, 1, 1, 0);
        assertNotNull("an extra draw told the bots apart", thrown(() -> twins.others(g -> {
        })));
    }

    @Test
    public void swapsListsEveryHiddenPair() {
        assertEquals(List.of("P0-P3", "P0-P4", "P2-P3", "P2-P4", "P3-P4"), names(swaps("LLLFH", "P1")));
        assertEquals(List.of("P1-P3", "P2-P3", "P2-P4", "P3-P4"), names(swaps("LLLFH", "P0", "P1")));
    }

    private static List<String> names(List<String[]> pairs) {
        List<String> names = new ArrayList<>();
        for (String[] pair : pairs) {
            names.add(pair[0] + "-" + pair[1]);
        }
        return names;
    }

    private static AssertionError thrown(Runnable call) {
        try {
            call.run();
            return null;
        } catch (AssertionError e) {
            return e;
        }
    }
}
