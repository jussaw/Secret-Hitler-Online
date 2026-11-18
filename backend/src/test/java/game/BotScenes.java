package game;

import game.datastructures.Deck;
import game.datastructures.Identity;
import game.datastructures.Player;
import game.datastructures.Policy;
import game.datastructures.board.Board;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Random;
import java.util.function.Consumer;

/**
 * Games stopped at one of a bot's decisions, with the roles, board and cards a test names, for
 * the bot tests (the Normal baseline, Easy's mistakes and the no-peeking test, and Phase 25B's
 * Hard rules). Seats are {@code P0}, {@code P1}, … in seat order, {@code P0} the first president,
 * and every seat is marked a bot, so no pick adds the people's bias. Only this class reaches into
 * {@link SecretHitlerGame}, by reflection on its private {@code board} and {@code draw}.
 */
final class BotScenes {
    /** The seed the draw pile is laid out with, so every scene's unseen cards start the same. */
    private static final long DECK_SEED = 17;

    private BotScenes() {
    }

    /** A game stopped at a bot's decision, and the seat of the bot that makes it (not yet made). */
    record Scene(SecretHitlerGame game, String bot) {
    }

    /**
     * A game and its bot, made before the game's first move and updated after every move since,
     * as the lobby updates its bots after every command: what a Hard bot remembers comes from
     * seeing each state.
     */
    record Played(SecretHitlerGame game, CpuPlayer bot) {
        /** {@code move}, then the bot's update. */
        void then(Consumer<SecretHitlerGame> move) {
            move.accept(game);
            bot.update(game);
        }

        /**
         * The bot updates again with no move between, as it does on every lobby tick and command
         * that leaves the game as it was: what it remembers must not count a state twice.
         */
        void updateAgain() {
            bot.update(game);
        }

        /**
         * The bot acts, then updates.
         *
         * @throws IllegalStateException if the bot did not act.
         */
        void botActs() {
            if (!bot.act(game)) {
                throw new IllegalStateException(bot.myName + " had nothing to do in " + game.getState() + ".");
            }
            bot.update(game);
        }
    }

    /** The role a letter names: {@code L}, {@code F} or {@code H}. */
    static Identity role(char letter) {
        switch (letter) {
            case 'L':
                return Identity.LIBERAL;
            case 'F':
                return Identity.FASCIST;
            case 'H':
                return Identity.HITLER;
            default:
                throw new IllegalArgumentException("No role is written \"" + letter + "\".");
        }
    }

    private static Policy.Type type(char letter) {
        switch (letter) {
            case 'L':
                return Policy.Type.LIBERAL;
            case 'F':
                return Policy.Type.FASCIST;
            default:
                throw new IllegalArgumentException("No card is written \"" + letter + "\".");
        }
    }

    /**
     * A new game with a seat per letter of {@code roles}, dealt those roles over the game's own
     * deal, every seat marked a bot, and the draw pile in one fixed order, so two games made alike
     * differ only in what a test then changes.
     *
     * @throws IllegalArgumentException if the roles are not a deal the game makes at that size.
     */
    static SecretHitlerGame game(String roles) {
        List<String> names = new ArrayList<>();
        int fascists = 0;
        int hitlers = 0;
        for (int i = 0; i < roles.length(); i++) {
            names.add("P" + i);
            Identity role = role(roles.charAt(i));
            fascists += role == Identity.FASCIST ? 1 : 0;
            hitlers += role == Identity.HITLER ? 1 : 0;
        }
        if (roles.length() < SecretHitlerGame.MIN_PLAYERS || roles.length() > SecretHitlerGame.MAX_PLAYERS
                || hitlers != 1 || fascists != SecretHitlerGame.NUM_FASCISTS_FOR_PLAYERS[roles.length()]) {
            throw new IllegalArgumentException("\"" + roles + "\" is not a deal the game makes.");
        }
        SecretHitlerGame game = new SecretHitlerGame(names);
        for (int i = 0; i < roles.length(); i++) {
            Player player = game.getPlayer(names.get(i));
            player.setIdentity(role(roles.charAt(i)));
            player.markAsCpu();
        }
        Deck draw = draw(game);
        List<Policy> cards = takeAll(draw);
        cards.sort(Comparator.comparing(Policy::getType));
        Collections.shuffle(cards, new Random(DECK_SEED));
        putAll(draw, cards);
        return game;
    }

    /**
     * Takes {@code fascist} fascist and {@code liberal} liberal cards from the draw pile and puts
     * them straight on the board, so no power fires and the deck keeps its 17 cards.
     */
    static void board(SecretHitlerGame game, int fascist, int liberal) {
        Deck draw = draw(game);
        List<Policy> pile = takeAll(draw);
        Board board = (Board) field(game, "board");
        try {
            for (int i = 0; i < fascist; i++) {
                board.enactPolicy(takeFirst(pile, Policy.Type.FASCIST));
            }
            for (int i = 0; i < liberal; i++) {
                board.enactPolicy(takeFirst(pile, Policy.Type.LIBERAL));
            }
        } finally {
            putAll(draw, pile);
        }
    }

    /**
     * Puts {@code cards} ({@code F} and {@code L}, top first) on top of the draw pile, taken from
     * the pile's own; the rest keep their order.
     *
     * @throws IllegalArgumentException if the pile lacks one of them.
     */
    static void drawTop(SecretHitlerGame game, String cards) {
        Deck draw = draw(game);
        List<Policy> pile = takeAll(draw);
        List<Policy> top = new ArrayList<>();
        try {
            for (char letter : cards.toCharArray()) {
                top.add(takeFirst(pile, type(letter)));
            }
        } finally {
            top.addAll(pile);
            putAll(draw, top);
        }
    }

    /**
     * Swaps the first liberal and the first fascist card below the draw pile's top {@code seen}.
     *
     * @throws IllegalArgumentException if either is missing.
     */
    static void swapUnseenCards(SecretHitlerGame game, int seen) {
        Deck draw = draw(game);
        List<Policy> pile = takeAll(draw);
        int liberal = -1;
        int fascist = -1;
        for (int i = seen; i < pile.size(); i++) {
            if (liberal == -1 && pile.get(i).getType() == Policy.Type.LIBERAL) {
                liberal = i;
            } else if (fascist == -1 && pile.get(i).getType() == Policy.Type.FASCIST) {
                fascist = i;
            }
        }
        if (liberal != -1 && fascist != -1) {
            Collections.swap(pile, liberal, fascist);
        }
        putAll(draw, pile);
        if (liberal == -1 || fascist == -1) {
            throw new IllegalArgumentException("The pile has no liberal and fascist card below its top " + seen + ".");
        }
    }

    /** Swaps two seats' roles. */
    static void swapRoles(SecretHitlerGame game, String a, String b) {
        Identity roleOfA = game.getPlayer(a).getIdentity();
        game.getPlayer(a).setIdentity(game.getPlayer(b).getIdentity());
        game.getPlayer(b).setIdentity(roleOfA);
    }

    /** Every living seat that has not voted votes {@code ja}, in seat order. */
    static void voteAll(SecretHitlerGame game, boolean ja) {
        for (Player player : game.getPlayerList()) {
            if (game.getState() != GameState.CHANCELLOR_VOTING) {
                return;
            }
            if (player.isAlive() && !game.hasPlayerVoted(player.getUsername())) {
                game.registerVote(player.getUsername(), ja);
            }
        }
    }

    /** The president nominates {@code chancellor}, and every seat votes ja. */
    static void elect(SecretHitlerGame game, String chancellor) {
        game.nominateChancellor(chancellor);
        voteAll(game, true);
    }

    /** Cards written as letters ({@code F} and {@code L}), in order. */
    static List<Policy> policies(String cards) {
        List<Policy> policies = new ArrayList<>();
        for (char letter : cards.toCharArray()) {
            policies.add(new Policy(type(letter)));
        }
        return policies;
    }

    /** The draw pile, top first, as letters (for the scenes' own tests). */
    static String drawPile(SecretHitlerGame game) {
        Deck draw = draw(game);
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < draw.getSize(); i++) {
            out.append(Decision.letter(draw.peek(i).getType()));
        }
        return out.toString();
    }

    /**
     * SplitMix64's finalizer. Consecutive seeds give {@code java.util.Random} almost the same first
     * draw, so every test bot's seed goes through this first.
     */
    static long mix(long z) {
        z += 0x9E3779B97F4A7C15L;
        z = (z ^ (z >>> 30)) * 0xBF58476D1CE4E5B9L;
        z = (z ^ (z >>> 27)) * 0x94D049BB133111EBL;
        return z ^ (z >>> 31);
    }

    /**
     * The scene's bot as the lobby makes it ({@code new CpuPlayer(name)}), its random source seeded
     * from {@code mix(seed)}, and initialized. The Normal baseline goes through this one.
     */
    static CpuPlayer bot(Scene scene, long seed) {
        CpuPlayer bot = new CpuPlayer(scene.bot());
        bot.useRandom(new Random(mix(seed)));
        bot.initialize(scene.game());
        return bot;
    }

    /** The scene's bot at {@code skill}, its random source seeded from {@code mix(seed)}, and initialized. */
    static CpuPlayer bot(Scene scene, BotSkill skill, long seed) {
        return bot(scene.game(), scene.bot(), skill, seed);
    }

    /** The bot of seat {@code name} at {@code skill}, seeded from {@code mix(seed)}, and initialized. */
    static CpuPlayer bot(SecretHitlerGame game, String name, BotSkill skill, long seed) {
        return bot(game, name, skill, new Random(mix(seed)));
    }

    /** The bot of seat {@code name} at {@code skill}, drawing from {@code random}, and initialized. */
    static CpuPlayer bot(SecretHitlerGame game, String name, BotSkill skill, Random random) {
        CpuPlayer bot = new CpuPlayer(name, skill);
        bot.useRandom(random);
        bot.initialize(game);
        return bot;
    }

    /**
     * P0 elects P2 (hand LLL, P0 discards the first, P2 enacts) and ends the term: P1's
     * nomination, with P2 the last chancellor and P0 the last president.
     */
    static Scene nomination(String roles) {
        SecretHitlerGame game = game(roles);
        drawTop(game, "LLL");
        elect(game, "P2");
        game.presidentDiscardPolicy(0);
        game.chancellorEnactPolicy(0);
        game.endPresidentialTerm();
        return new Scene(game, "P1");
    }

    /** P0 nominates P1: P2's vote, with no one voted yet. */
    static Scene vote(String roles) {
        return vote(roles, 0);
    }

    /** {@code fascist} fascist policies on the board, then P0 nominates P1: P2's vote. */
    static Scene vote(String roles, int fascist) {
        SecretHitlerGame game = game(roles);
        board(game, fascist, 0);
        game.nominateChancellor("P1");
        return new Scene(game, "P2");
    }

    /** P0 elects P1 and draws {@code hand}: P0's discard. */
    static Scene presidentsHand(String roles, String hand) {
        SecretHitlerGame game = game(roles);
        drawTop(game, hand);
        elect(game, "P1");
        return new Scene(game, "P0");
    }

    /**
     * {@code fascist} fascist policies on the board; P0 elects P1, draws {@code hand + extra} and
     * discards the last: P1's choice, holding {@code hand} (VETO open at 5).
     */
    static Scene chancellorsHand(String roles, String hand, String extra, int fascist) {
        SecretHitlerGame game = game(roles);
        board(game, fascist, 0);
        drawTop(game, hand + extra);
        elect(game, "P1");
        game.presidentDiscardPolicy(2);
        return new Scene(game, "P1");
    }

    /** Five fascist policies; P0 elects P1, passes FF and P1 vetoes: P0's answer. */
    static Scene vetoAnswer(String roles) {
        SecretHitlerGame game = game(roles);
        board(game, 5, 0);
        drawTop(game, "FFF");
        elect(game, "P1");
        game.presidentDiscardPolicy(0);
        game.chancellorVeto();
        return new Scene(game, "P0");
    }

    /**
     * {@code fascist - 1} fascist policies; P0 elects P1 on a hand of FFF with {@code next} under
     * it, and P1 enacts a fascist policy: P0's power at {@code fascist} (investigate, elect, peek
     * or execute, as the table's size gives it).
     */
    static Scene power(String roles, int fascist, String next) {
        SecretHitlerGame game = game(roles);
        board(game, fascist - 1, 0);
        drawTop(game, "FFF" + next);
        elect(game, "P1");
        game.presidentDiscardPolicy(0);
        game.chancellorEnactPolicy(0);
        return new Scene(game, "P0");
    }

    /**
     * Hard's rule 1: {@code FLLFLLH} with 3 fascist policies down and {@code LLLLLL} on top, the bot
     * of {@code botSeat} made first. Round 1 P0 elects P3, round 2 P1 elects P4, each with every
     * seat's ja (the bot's too, made by the scene), the president discarding the first card and the
     * chancellor enacting a liberal policy, then END TERM, the bot updated after every move. It waits
     * at round 3, P2 to nominate: P3 and P4 are cleared, and P1 (the last president) and P4 (the last
     * chancellor) may not be nominated.
     */
    static Played cleared(String botSeat, BotSkill skill, long seed) {
        SecretHitlerGame game = clearedStart();
        Played played = new Played(game, bot(game, botSeat, skill, seed));
        for (String chancellor : List.of("P3", "P4")) {
            played.then(g -> g.nominateChancellor(chancellor));
            played.then(g -> voteAll(g, true));
            played.then(g -> g.presidentDiscardPolicy(0));
            played.then(g -> g.chancellorEnactPolicy(0));
            played.then(SecretHitlerGame::endPresidentialTerm);
        }
        return played;
    }

    /**
     * Hard's rule 4: {@code roles} with 2 fascist policies down and {@code FFF} then {@code peek} on
     * top, the bot P0 made first and updated after every move. P0 elects P1 (the scene nominates and
     * votes for the bot's seat too), the bot discards (it acts, so it remembers what it passed), P1
     * enacts the third fascist policy, and the bot peeks at {@code peek} and ends its term (acting
     * twice). It waits at round 2, P1 to nominate.
     */
    static Played peeked(String roles, String peek, BotSkill skill, long seed) {
        SecretHitlerGame game = peekStart(roles, peek);
        Played played = new Played(game, bot(game, "P0", skill, seed));
        played.then(g -> g.nominateChancellor("P1"));
        played.then(g -> voteAll(g, true));
        played.botActs();
        played.then(g -> g.chancellorEnactPolicy(0));
        played.botActs();
        played.botActs();
        return played;
    }

    /** {@link #cleared}'s game before its first move: {@code FLLFLLH}, 3 fascist policies, {@code LLLLLL} on top. */
    static SecretHitlerGame clearedStart() {
        SecretHitlerGame game = game("FLLFLLH");
        board(game, 3, 0);
        drawTop(game, "LLLLLL");
        return game;
    }

    /** {@link #peeked}'s game before its first move: 2 fascist policies, {@code FFF} then {@code peek} on top. */
    static SecretHitlerGame peekStart(String roles, String peek) {
        SecretHitlerGame game = game(roles);
        board(game, 2, 0);
        drawTop(game, "FFF" + peek);
        return game;
    }

    private static Object field(SecretHitlerGame game, String name) {
        try {
            Field field = SecretHitlerGame.class.getDeclaredField(name);
            field.setAccessible(true);
            return field.get(game);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("SecretHitlerGame has no field " + name + " to set a scene with.", e);
        }
    }

    private static Deck draw(SecretHitlerGame game) {
        return (Deck) field(game, "draw");
    }

    /** Every card of the deck, top first, leaving it empty. */
    private static List<Policy> takeAll(Deck deck) {
        List<Policy> cards = new ArrayList<>();
        while (!deck.isEmpty()) {
            cards.add(deck.remove());
        }
        return cards;
    }

    /** Puts {@code cards} back, top first. */
    private static void putAll(Deck deck, List<Policy> cards) {
        for (int i = cards.size() - 1; i >= 0; i--) {
            deck.add(cards.get(i));
        }
    }

    private static Policy takeFirst(List<Policy> pile, Policy.Type type) {
        for (int i = 0; i < pile.size(); i++) {
            if (pile.get(i).getType() == type) {
                return pile.remove(i);
            }
        }
        throw new IllegalArgumentException("The draw pile has no " + type + " card left.");
    }
}
