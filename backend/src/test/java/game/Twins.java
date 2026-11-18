package game;

import static org.junit.Assert.fail;

import game.BotScenes.Scene;
import game.datastructures.Identity;
import game.datastructures.Player;
import game.datastructures.Policy;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.SortedMap;
import java.util.TreeMap;
import java.util.function.Consumer;
import org.apache.commons.lang3.SerializationUtils;

/**
 * One bot in each of two games its seat cannot tell apart (the no-peeking test's twins). Before
 * each of the bot's acts the two games must look the same from its seat ({@link Visible}); after
 * it, the two bots must have decided the same ({@link Decision}) and remember the same: their
 * whole serialized form, so any field a later rule adds is compared too, and how many numbers
 * each drew. The one difference allowed is the party of a seat the bot has just investigated,
 * when it differs between the games: the bot saw it.
 */
final class Twins {
    private final Scene a;
    private final Scene b;
    private final CpuPlayer botA;
    private final CpuPlayer botB;
    private final CountingRandom randomA;
    private final CountingRandom randomB;

    /** A random source that counts its draws, so two bots that drew differently tell apart. */
    private static final class CountingRandom extends Random {
        private long draws;

        private CountingRandom(long seed) {
            super(seed);
        }

        @Override
        protected int next(int bits) {
            draws++;
            return super.next(bits);
        }
    }

    private Twins(Scene a, Scene b, BotSkill skill, long seedA, long seedB) {
        if (!a.bot().equals(b.bot())) {
            throw new IllegalArgumentException("The twins' bots sit in " + a.bot() + " and " + b.bot() + ".");
        }
        this.a = a;
        this.b = b;
        this.randomA = new CountingRandom(BotScenes.mix(seedA));
        this.randomB = new CountingRandom(BotScenes.mix(seedB));
        this.botA = BotScenes.bot(a.game(), a.bot(), skill, randomA);
        this.botB = BotScenes.bot(b.game(), b.bot(), skill, randomB);
        sameMemory("once made", null);
    }

    /** A bot at {@code skill} in each scene's seat, both seeded from {@code seed}. */
    static Twins of(Scene a, Scene b, BotSkill skill, long seed) {
        return new Twins(a, b, skill, seed, seed);
    }

    /** As {@link #of(Scene, Scene, BotSkill, long)}, each bot seeded on its own (the test's own checks only). */
    static Twins of(Scene a, Scene b, BotSkill skill, long seedA, long seedB) {
        return new Twins(a, b, skill, seedA, seedB);
    }

    CpuPlayer botA() {
        return botA;
    }

    CpuPlayer botB() {
        return botB;
    }

    /**
     * What the bot's seat sees of a game: the state, the round, the offices and the last ones, the
     * tracker, the board, the piles' sizes, the term's flags, who is alive, investigated and a bot,
     * the last power's target, the roles its own role reveals, the cards it holds or saw (its hand
     * as president or chancellor, the two it passed, its peek), and the votes: while an election is
     * open only who has voted, and otherwise the last closed election's ballots.
     */
    record Visible(GameState state, int round, String president, String chancellor, String lastPresident,
            String lastChancellor, int tracker, int fascistPolicies, int liberalPolicies, Policy.Type lastEnacted,
            int drawSize, int discardSize, boolean trackerAdvanced, boolean vetoOccurred, List<String> living,
            List<String> investigated, List<String> bots, String target, SortedMap<String, Identity> knownRoles,
            String cards, List<String> voted, SortedMap<String, Boolean> ballots) {

        static Visible of(SecretHitlerGame game, String bot) {
            GameState state = game.getState();
            String president = game.getCurrentPresident();
            String chancellor = game.getCurrentChancellor();
            List<String> living = new ArrayList<>();
            List<String> investigated = new ArrayList<>();
            List<String> bots = new ArrayList<>();
            List<String> voted = new ArrayList<>();
            for (Player player : game.getPlayerList()) {
                String name = player.getUsername();
                if (player.isAlive()) {
                    living.add(name);
                }
                if (player.hasBeenInvestigated()) {
                    investigated.add(name);
                }
                if (player.isCpu()) {
                    bots.add(name);
                }
                if (game.hasPlayerVoted(name)) {
                    voted.add(name);
                }
            }
            SortedMap<String, Identity> knownRoles = new TreeMap<>();
            Identity own = game.getPlayer(bot).getIdentity();
            boolean knowsAll = own == Identity.FASCIST
                    || (own == Identity.HITLER && game.getPlayerList().size() <= 6);
            for (Player player : game.getPlayerList()) {
                if (knowsAll || player.getUsername().equals(bot)) {
                    knownRoles.put(player.getUsername(), player.getIdentity());
                }
            }
            String cards = "";
            if (state == GameState.LEGISLATIVE_PRESIDENT && bot.equals(president)) {
                cards = Decision.letters(game.getPresidentLegislativeChoices());
            } else if ((state == GameState.LEGISLATIVE_CHANCELLOR || state == GameState.LEGISLATIVE_PRESIDENT_VETO)
                    && (bot.equals(president) || bot.equals(chancellor))) {
                cards = Decision.letters(game.getChancellorLegislativeChoices());
            } else if (state == GameState.PRESIDENTIAL_POWER_PEEK && bot.equals(president)) {
                cards = Decision.letters(game.getPeek());
            }
            SortedMap<String, Boolean> ballots = new TreeMap<>();
            if (state != GameState.CHANCELLOR_VOTING) {
                ballots.putAll(game.getVotes());
            }
            return new Visible(state, game.getRound(), president, chancellor, game.getLastPresident(),
                    game.getLastChancellor(), game.getElectionTracker(), game.getNumFascistPolicies(),
                    game.getNumLiberalPolicies(), game.getLastEnactedPolicy(), game.getDrawSize(),
                    game.getDiscardSize(), game.didElectionTrackerAdvance(), game.didVetoOccurThisTurn(), living,
                    investigated, bots, game.getTarget(), knownRoles, cards, voted, ballots);
        }
    }

    /** A move by another seat, the same in both games: made, then both bots update. */
    void others(Consumer<SecretHitlerGame> move) {
        others(move, move);
    }

    /**
     * A move by another seat that the bot never sees, {@code moveA} in the first game and
     * {@code moveB} in the second (the card another president discards, or another seat's ballot
     * while the election is open): made, then both bots update and must remember the same.
     */
    void others(Consumer<SecretHitlerGame> moveA, Consumer<SecretHitlerGame> moveB) {
        moveA.accept(a.game());
        moveB.accept(b.game());
        botA.update(a.game());
        botB.update(b.game());
        sameMemory("after another seat's move", null);
    }

    /**
     * The bot acts in both games: they must look the same from its seat, both bots update and
     * remember the same, then act, and must decide the same and remember the same.
     */
    void botActs() {
        String seat = a.bot();
        Visible visibleA = Visible.of(a.game(), seat);
        Visible visibleB = Visible.of(b.game(), seat);
        if (!visibleA.equals(visibleB)) {
            fail("the scene let the bot tell the games apart:\n  " + visibleA + "\n  " + visibleB);
        }
        botA.update(a.game());
        botB.update(b.game());
        sameMemory("after its update", null);

        GameState beforeA = a.game().getState();
        GameState beforeB = b.game().getState();
        boolean actedA = botA.act(a.game());
        boolean actedB = botB.act(b.game());
        String decisionA = Decision.of(beforeA, actedA, a.game(), seat);
        String decisionB = Decision.of(beforeB, actedB, b.game(), seat);
        if (actedA != actedB || !decisionA.equals(decisionB)) {
            fail("the bot decided differently: \"" + decisionA + "\" and \"" + decisionB + "\"" + memories());
        }

        String saw = null;
        if (beforeA == GameState.PRESIDENTIAL_POWER_INVESTIGATE && actedA) {
            String target = a.game().getTarget();
            if (a.game().getPlayer(target).isFascist() != b.game().getPlayer(target).isFascist()) {
                saw = target;
            }
        }
        sameMemory("after \"" + decisionA + "\"", saw);
    }

    /**
     * Both bots' serialized forms, and their draws, are the same; with {@code saw}, a seat whose
     * party the bot has just investigated, its entry in the known roles is left out first.
     */
    private void sameMemory(String when, String saw) {
        if (randomA.draws != randomB.draws) {
            fail("the bot drew " + randomA.draws + " and " + randomB.draws + " numbers " + when + memories());
        }
        CpuPlayer memoryA = botA;
        CpuPlayer memoryB = botB;
        if (saw != null) {
            memoryA = SerializationUtils.clone(botA);
            memoryB = SerializationUtils.clone(botB);
            memoryA.knownPlayerRoles.remove(saw);
            memoryB.knownPlayerRoles.remove(saw);
        }
        if (!Arrays.equals(SerializationUtils.serialize(memoryA), SerializationUtils.serialize(memoryB))) {
            fail("the bot remembers differently " + when + memories());
        }
    }

    private String memories() {
        return "\n  first:  scores " + sorted(botA.playerReputation) + ", roles " + sorted(botA.knownPlayerRoles)
                + "\n  second: scores " + sorted(botB.playerReputation) + ", roles " + sorted(botB.knownPlayerRoles);
    }

    private static <V> SortedMap<String, V> sorted(Map<String, V> map) {
        return new TreeMap<>(map);
    }
}
