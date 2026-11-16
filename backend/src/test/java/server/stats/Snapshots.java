package server.stats;

import game.GameState;
import game.SecretHitlerGame;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds a {@code GameSnapshot} by hand for {@code TimelineDiffTest}: {@code table(n)} is a new
 * game of {@code n} seats {@code S0}, {@code S1}, … and each setter changes one thing about it.
 */
final class Snapshots {
    private GameState state = GameState.CHANCELLOR_NOMINATION;
    private int round = 1;
    private final List<String> seats = new ArrayList<>();
    private final List<String> roles = new ArrayList<>();
    private final List<Boolean> alive = new ArrayList<>();
    private String president = "S0";
    private String chancellor;
    private final Map<String, Boolean> votes = new LinkedHashMap<>();
    private int tracker;
    private int liberal;
    private int fascist;
    private int draw = 17;
    private int discard;
    private List<String> presidentHand = List.of();
    private List<String> chancellorHand = List.of();
    private List<String> peek = List.of();
    private String target;

    private Snapshots(int count) {
        int fascists = SecretHitlerGame.NUM_FASCISTS_FOR_PLAYERS[count];
        for (int i = 0; i < count; i++) {
            seats.add("S" + i);
            alive.add(true);
            if (i == count - 1) {
                roles.add("HITLER");
            } else if (i >= count - 1 - fascists) {
                roles.add("FASCIST");
            } else {
                roles.add("LIBERAL");
            }
        }
    }

    /**
     * A table of {@code count} seats, {@code S0}… : Liberals, then Fascists, then Hitler last (five
     * seats: L L L F H), all alive, nominating in round 1 with {@code S0} president, no
     * chancellor, votes, hands, peek or target, the tracker at 0, the board at 0/0 and the piles
     * at 17/0.
     */
    static Snapshots table(int count) {
        return new Snapshots(count);
    }

    Snapshots state(GameState state) {
        this.state = state;
        return this;
    }

    Snapshots round(int round) {
        this.round = round;
        return this;
    }

    Snapshots president(String president) {
        this.president = president;
        return this;
    }

    Snapshots chancellor(String chancellor) {
        this.chancellor = chancellor;
        return this;
    }

    Snapshots vote(String name, boolean ja) {
        votes.put(name, ja);
        return this;
    }

    Snapshots tracker(int tracker) {
        this.tracker = tracker;
        return this;
    }

    Snapshots board(int liberal, int fascist) {
        this.liberal = liberal;
        this.fascist = fascist;
        return this;
    }

    Snapshots piles(int draw, int discard) {
        this.draw = draw;
        this.discard = discard;
        return this;
    }

    Snapshots presidentHand(String... cards) {
        presidentHand = List.of(cards);
        return this;
    }

    Snapshots chancellorHand(String... cards) {
        chancellorHand = List.of(cards);
        return this;
    }

    Snapshots peek(String... cards) {
        peek = List.of(cards);
        return this;
    }

    Snapshots target(String target) {
        this.target = target;
        return this;
    }

    Snapshots dead(String name) {
        alive.set(seats.indexOf(name), false);
        return this;
    }

    GameSnapshot build() {
        return new GameSnapshot(state, round, seats, roles, alive, president, chancellor, votes, tracker, liberal,
                fascist, draw, discard, presidentHand, chancellorHand, peek, target);
    }
}
