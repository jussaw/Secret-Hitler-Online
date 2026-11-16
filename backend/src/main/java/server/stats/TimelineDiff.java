package server.stats;

import game.GameState;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * The timeline events between two looks at a game, as format 1 of the record spells them
 * (the spec's "The record"). The two looks are taken either side of one game method, which may
 * make several changes at once (a third failed election enacts the top policy, an enact may unlock
 * a power, reshuffle the piles or end the game): {@code between} spells them out in the game's
 * order. Each event is a map of JDK types only ({@code String}, {@code Integer}, {@code Long},
 * {@code Boolean} and {@code ArrayList<String>}), keyed {@code type}, {@code t}, {@code r}, then
 * its own fields in the spec's order, so a lobby backup holds no class of this package.
 */
public final class TimelineDiff {
    private TimelineDiff() {
    }

    /** The game shuffles the discards back in when the draw pile holds fewer than this. */
    private static final int MIN_DRAW = 3;
    /** The third failed election, or accepted veto, enacts the top policy. */
    private static final int CHAOS = 3;

    /** A new event with its {@code type}, {@code t} (a {@code Long}) and {@code r} (an {@code Integer}). */
    public static LinkedHashMap<String, Object> event(String type, long t, int r) {
        LinkedHashMap<String, Object> event = new LinkedHashMap<>();
        event.put("type", type);
        event.put("t", t);
        event.put("r", r);
        return event;
    }

    /**
     * The events one game method made between {@code before} and {@code after}, in the order the
     * game made them, each at {@code t} and in the round the move was made in
     * ({@code before.round()}). Only the living seats' votes are events, and an election counts
     * only theirs.
     *
     * @return a new mutable list, empty when nothing changed.
     * @throws IllegalStateException naming both states, for a change no single game method makes:
     *                               a pair of states no move joins, or a move whose piles, board,
     *                               tracker, deaths or round do not come out at {@code after}'s.
     */
    public static List<LinkedHashMap<String, Object>> between(GameSnapshot before, GameSnapshot after, long t) {
        return new Move(before, after, t).events();
    }

    /** One move being read: the events so far, and the piles, board and tracker as it goes. */
    private static final class Move {
        private final GameSnapshot before;
        private final GameSnapshot after;
        private final long t;
        private final List<LinkedHashMap<String, Object>> events = new ArrayList<>();

        private int draw;
        private int discard;
        private int liberal;
        private int fascist;
        private int tracker;
        private int round;
        private String killed;

        Move(GameSnapshot before, GameSnapshot after, long t) {
            this.before = before;
            this.after = after;
            this.t = t;
            draw = before.drawSize();
            discard = before.discardSize();
            liberal = before.liberal();
            fascist = before.fascist();
            tracker = before.tracker();
            round = before.round();
        }

        List<LinkedHashMap<String, Object>> events() {
            GameState from = before.state();
            GameState to = after.state();
            check(before.seats().equals(after.seats()) && before.roles().equals(after.roles()), "the seats changed");
            if (from == to) {
                sameState();
                return events;
            }
            switch (from) {
                case CHANCELLOR_NOMINATION:
                    expect(to == GameState.CHANCELLOR_VOTING);
                    add("nominate", "president", seat(before.president()), "chancellor", seat(after.chancellor()));
                    break;
                case CHANCELLOR_VOTING:
                    closeElection();
                    break;
                case LEGISLATIVE_PRESIDENT:
                    expect(to == GameState.LEGISLATIVE_CHANCELLOR);
                    presidentDiscard();
                    break;
                case LEGISLATIVE_CHANCELLOR:
                    if (to == GameState.LEGISLATIVE_PRESIDENT_VETO) {
                        add("veto", "seat", seat(before.chancellor()));
                    } else {
                        chancellorEnact();
                    }
                    break;
                case LEGISLATIVE_PRESIDENT_VETO:
                    if (to == GameState.LEGISLATIVE_CHANCELLOR) {
                        add("vetoAnswer", "seat", seat(before.president()), "accepted", false);
                    } else {
                        add("vetoAnswer", "seat", seat(before.president()), "accepted", true);
                        discard += 2; // the chancellor's two
                        moveTracker();
                    }
                    break;
                case PRESIDENTIAL_POWER_PEEK:
                    expect(to == GameState.POST_LEGISLATIVE && before.peek().size() == 3);
                    add("peek", "seat", seat(before.president()), "cards", new ArrayList<>(before.peek()));
                    break;
                case PRESIDENTIAL_POWER_INVESTIGATE: {
                    expect(to == GameState.POST_LEGISLATIVE);
                    int target = seat(after.target());
                    String side = after.roles().get(target).equals("LIBERAL") ? "LIBERAL" : "FASCIST";
                    add("investigate", "seat", seat(before.president()), "target", target, "result", side);
                    break;
                }
                case PRESIDENTIAL_POWER_EXECUTION: {
                    expect(to == GameState.POST_LEGISLATIVE || to == GameState.LIBERAL_VICTORY_EXECUTION);
                    int target = seat(after.target());
                    killed = after.target();
                    add("execute", "seat", seat(before.president()), "target", target, "role",
                            after.roles().get(target));
                    endIfOver();
                    break;
                }
                case PRESIDENTIAL_POWER_ELECTION:
                    expect(to == GameState.POST_LEGISLATIVE);
                    add("specialElection", "seat", seat(before.president()), "target", seat(after.target()));
                    break;
                case POST_LEGISLATIVE:
                    expect(to == GameState.CHANCELLOR_NOMINATION);
                    add("endTerm", "seat", seat(before.president()), "by", "president");
                    round++;
                    break;
                default:
                    expect(false);
            }
            checkTable();
            return events;
        }

        /**
         * Two looks in one state: only votes can have come in (while voting). Anything else that
         * changed means a move went unseen. A power's target is not compared: a power the game
         * refuses (a dead seat, or a president naming themselves) sets it and throws.
         */
        private void sameState() {
            if (before.state() == GameState.CHANCELLOR_VOTING) {
                for (Map.Entry<String, Boolean> vote : before.votes().entrySet()) {
                    check(vote.getValue().equals(after.votes().get(vote.getKey())), "a vote went missing");
                }
                newVotes();
            } else {
                check(before.votes().equals(after.votes()), "the votes changed");
            }
            check(Objects.equals(before.president(), after.president())
                    && Objects.equals(before.chancellor(), after.chancellor())
                    && before.presidentHand().equals(after.presidentHand())
                    && before.chancellorHand().equals(after.chancellorHand())
                    && before.peek().equals(after.peek()), "the offices or the cards changed");
            checkTable();
        }

        /** A {@code vote} for each living seat that has voted since {@code before}, in seat order. */
        private void newVotes() {
            for (int seat = 0; seat < after.seats().size(); seat++) {
                String name = after.seats().get(seat);
                if (after.alive().get(seat) && after.votes().containsKey(name) && !before.votes().containsKey(name)) {
                    add("vote", "seat", seat, "ja", after.votes().get(name));
                }
            }
        }

        /** The last votes, the election, and what it led to. */
        private void closeElection() {
            newVotes();
            int ja = 0;
            int nein = 0;
            for (int seat = 0; seat < after.seats().size(); seat++) {
                if (after.alive().get(seat)) {
                    Boolean vote = after.votes().get(after.seats().get(seat));
                    check(vote != null, "voting closed before every living seat voted");
                    if (vote) {
                        ja++;
                    } else {
                        nein++;
                    }
                }
            }
            boolean passed = ja > nein;
            add("election", "passed", passed, "ja", ja, "nein", nein);
            if (!passed) {
                moveTracker();
            } else if (after.state() == GameState.FASCIST_VICTORY_ELECTION) {
                endIfOver();
            } else {
                expect(after.state() == GameState.LEGISLATIVE_PRESIDENT && after.presidentHand().size() == 3);
                reshuffleIfShort();
                take(3);
                add("draw", "seat", seat(after.president()), "cards", new ArrayList<>(after.presidentHand()));
            }
        }

        /** The president's discard: the lowest index whose removal leaves the chancellor's two in order. */
        private void presidentDiscard() {
            List<String> hand = before.presidentHand();
            expect(hand.size() == 3);
            for (int index = 0; index < hand.size(); index++) {
                List<String> rest = new ArrayList<>(hand);
                rest.remove(index);
                if (rest.equals(after.chancellorHand())) {
                    add("discard", "seat", seat(before.president()), "index", index, "card", hand.get(index));
                    discard++;
                    return;
                }
            }
            expect(false);
        }

        /** The chancellor's enact, which puts the other card on the discards. */
        private void chancellorEnact() {
            GameState to = after.state();
            expect(to == GameState.POST_LEGISLATIVE || to == GameState.PRESIDENTIAL_POWER_PEEK
                    || to == GameState.PRESIDENTIAL_POWER_INVESTIGATE || to == GameState.PRESIDENTIAL_POWER_EXECUTION
                    || to == GameState.PRESIDENTIAL_POWER_ELECTION || to == GameState.LIBERAL_VICTORY_POLICY
                    || to == GameState.FASCIST_VICTORY_POLICY);
            String policy = enactedPolicy();
            expect(before.chancellorHand().contains(policy));
            discard++;
            LinkedHashMap<String, Object> enact = add("enact", "policy", policy, "by", "chancellor", "seat",
                    seat(before.chancellor()));
            board(enact, policy);
            reshuffleIfShort();
            endIfOver();
        }

        /** A failed election or an accepted veto: the tracker moves, and at 3 chaos enacts the top policy. */
        private void moveTracker() {
            tracker++;
            add("tracker", "value", tracker);
            if (tracker < CHAOS) {
                expect(after.state() == GameState.POST_LEGISLATIVE);
                return;
            }
            GameState to = after.state();
            expect(to == GameState.POST_LEGISLATIVE || to == GameState.LIBERAL_VICTORY_POLICY
                    || to == GameState.FASCIST_VICTORY_POLICY);
            reshuffleIfShort();
            take(1);
            String policy = enactedPolicy();
            board(add("enact", "policy", policy, "by", "chaos"), policy);
            reshuffleIfShort();
            endIfOver();
        }

        /** The side whose count rose by one between the looks: the policy this move enacted. */
        private String enactedPolicy() {
            int liberalRose = after.liberal() - before.liberal();
            int fascistRose = after.fascist() - before.fascist();
            if (liberalRose == 1 && fascistRose == 0) {
                return "L";
            }
            expect(liberalRose == 0 && fascistRose == 1);
            return "F";
        }

        /** Adds the enacted policy to the board, writes the board after on the event, and resets the tracker. */
        private void board(LinkedHashMap<String, Object> enact, String policy) {
            if (policy.equals("L")) {
                liberal++;
            } else {
                fascist++;
            }
            enact.put("liberal", liberal);
            enact.put("fascist", fascist);
            tracker = 0;
        }

        /** Where the game shuffles the discards back in: a {@code reshuffle} only if cards come back. */
        private void reshuffleIfShort() {
            if (draw < MIN_DRAW && discard > 0) {
                draw += discard;
                discard = 0;
                add("reshuffle", "drawPile", draw);
            }
        }

        private void take(int cards) {
            expect(draw >= cards);
            draw -= cards;
        }

        /** The {@code end}, if this move ended the game. */
        private void endIfOver() {
            if (after.finished() && !before.finished()) {
                add("end", "outcome", after.outcome());
            } else {
                expect(!after.finished());
            }
        }

        /** The piles, board, tracker, deaths and round come out at {@code after}'s, or no single move made this. */
        private void checkTable() {
            check(draw == after.drawSize() && discard == after.discardSize(),
                    "the piles came out at " + draw + "/" + discard + ", not " + after.drawSize() + "/"
                            + after.discardSize());
            check(liberal == after.liberal() && fascist == after.fascist(), "the board does not add up");
            check(tracker == after.tracker(), "the tracker came out at " + tracker + ", not " + after.tracker());
            check(round == after.round(), "the round came out at " + round + ", not " + after.round());
            for (int seat = 0; seat < before.seats().size(); seat++) {
                boolean alive = before.alive().get(seat) && !before.seats().get(seat).equals(killed);
                check(alive == after.alive().get(seat), "the deaths do not add up");
            }
        }

        private int seat(String name) {
            int seat = before.seatIndex(name);
            check(seat >= 0, "no seat is named " + name);
            return seat;
        }

        /** Adds an event of this move, with the pairs of keys and values in order. */
        private LinkedHashMap<String, Object> add(String type, Object... pairs) {
            LinkedHashMap<String, Object> event = event(type, t, before.round());
            for (int i = 0; i < pairs.length; i += 2) {
                event.put((String) pairs[i], pairs[i + 1]);
            }
            events.add(event);
            return event;
        }

        private void expect(boolean condition) {
            check(condition, "no single move does that");
        }

        private void check(boolean condition, String what) {
            if (!condition) {
                throw new IllegalStateException("Cannot read the move from " + before.state() + " to "
                        + after.state() + ": " + what + ".");
            }
        }
    }
}
