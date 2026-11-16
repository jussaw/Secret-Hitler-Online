package server.stats;

import game.GameState;
import game.SecretHitlerGame;
import game.datastructures.Player;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Plays a recorded timeline from a game's start and checks, event by event, that it is one a real
 * game could have: every move in its place, nothing missing or doubled. What it ends with is
 * compared with the game itself ({@code of}).
 *
 * <p>The events {@code Lobby} adds itself (pauses, resumes, drops, returns and {@code restored})
 * are checked for their keys and times only, and skipped by the rest.
 */
public final class TimelineReplay {
    private TimelineReplay() {
    }

    /** Where a timeline leaves a game; {@code outcome} is null with no {@code end}. */
    public record Replayed(int liberal, int fascist, Set<Integer> dead, int tracker, int drawPile, int discardPile,
            String outcome) {
    }

    private static final Set<String> LOBBY_EVENTS = Set.of("timerPause", "timerResume", "disconnect", "reconnect",
            "restored");

    /** Where the game is now: its board, deaths, tracker, piles and outcome (null while it runs). */
    public static Replayed of(SecretHitlerGame game) {
        GameState state = game.getState();
        List<Player> players = game.getPlayerList();
        Set<Integer> dead = new TreeSet<>();
        for (int i = 0; i < players.size(); i++) {
            if (!players.get(i).isAlive()) {
                dead.add(i);
            }
        }
        return new Replayed(game.getNumLiberalPolicies(), game.getNumFascistPolicies(), dead,
                game.getElectionTracker(), game.getDrawSize(), game.getDiscardSize(), GameSnapshot.outcomeOf(state));
    }

    /** The seats' roles in turn order, as the timeline's seat indexes count them. */
    public static List<String> roles(SecretHitlerGame game) {
        List<String> roles = new ArrayList<>();
        for (Player player : game.getPlayerList()) {
            roles.add(player.getIdentity().name());
        }
        return roles;
    }

    /**
     * Replays {@code events} from the start of a game whose seats have {@code roles}.
     *
     * @throws AssertionError naming the event's index, for the first event that does not follow.
     */
    public static Replayed replay(List<? extends Map<String, Object>> events, List<String> roles) {
        return new Run(events, roles).run();
    }

    private enum Phase {
        NOMINATE, VOTE, PASSED, DISCARD, CHANCELLOR, VETO_ANSWER, REFUSED, TRACKER, CHAOS, AFTER_ENACT,
        AFTER_CHAOS, END_TERM, ENDED
    }

    private static final class Run {
        private final List<? extends Map<String, Object>> events;
        private final List<String> roles;
        private int index;

        private Phase phase = Phase.NOMINATE;
        private int liberal;
        private int fascist;
        private final Set<Integer> dead = new TreeSet<>();
        private int tracker;
        private int draw = 17;
        private int discard;
        private String outcome;

        private int president = -1;
        private int chancellor = -1;
        private final Map<Integer, Boolean> votes = new LinkedHashMap<>();
        private List<Object> hand;
        private List<Object> chancellorHand;
        private boolean vetoAsked;
        private List<Object> peeked;
        // The next game event must be a reshuffle (an enact left the draw pile short).
        private boolean reshuffleDue;
        // The game is over: the next game event must be its end (after any reshuffle due).
        private String endDue;
        // The power the chancellor's last enact unlocked, which comes next (after any reshuffle).
        private String powerDue;

        Run(List<? extends Map<String, Object>> events, List<String> roles) {
            this.events = events;
            this.roles = roles;
        }

        Replayed run() {
            long lastT = 0;
            int lastR = -1;
            boolean afterEndTerm = false;
            for (index = 0; index < events.size(); index++) {
                Map<String, Object> event = events.get(index);
                check(new ArrayList<>(event.keySet()).equals(RecordFormat.expectedKeys(event)),
                        "has the keys " + RecordFormat.expectedKeys(event));
                check(event.get("t") instanceof Long, "has a Long t");
                check(event.get("r") instanceof Integer, "has an Integer r");
                long t = (Long) event.get("t");
                int r = (Integer) event.get("r");
                check(t >= lastT, "does not go back in time (last t " + lastT + ")");
                if (lastR >= 0) {
                    check(r == (afterEndTerm ? lastR + 1 : lastR),
                            "has r " + (afterEndTerm ? lastR + 1 : lastR) + (afterEndTerm ? ", after an endTerm" : ""));
                }
                lastT = t;
                lastR = r;
                String type = (String) event.get("type");
                afterEndTerm = type.equals("endTerm");
                check(phase != Phase.ENDED, "comes after the end");
                if (!LOBBY_EVENTS.contains(type)) {
                    play(type, event);
                }
            }
            return new Replayed(liberal, fascist, dead, tracker, draw, discard, outcome);
        }

        private void play(String type, Map<String, Object> event) {
            if (reshuffleDue) {
                check(type.equals("reshuffle"), "is the reshuffle the enact left due");
                reshuffle(event);
                reshuffleDue = false;
                return;
            }
            if (endDue != null) {
                check(type.equals("end") && endDue.equals(event.get("outcome")), "is the end " + endDue);
            }
            if (type.equals("end")) {
                end(event);
                return;
            }
            switch (phase) {
                case NOMINATE:
                    expect(type, "nominate");
                    president = seat(event, "president");
                    chancellor = seat(event, "chancellor");
                    check(living(president) && living(chancellor) && president != chancellor,
                            "nominates a living chancellor for a living president");
                    votes.clear();
                    vetoAsked = false;
                    phase = Phase.VOTE;
                    break;
                case VOTE:
                    if (type.equals("vote")) {
                        int seat = seat(event, "seat");
                        check(living(seat) && !votes.containsKey(seat), "is a living seat's first vote");
                        votes.put(seat, (Boolean) event.get("ja"));
                    } else {
                        expect(type, "election");
                        election(event);
                    }
                    break;
                case PASSED:
                    if (type.equals("reshuffle")) {
                        reshuffle(event);
                    } else {
                        expect(type, "draw");
                        check(seat(event, "seat") == president, "is the president's draw");
                        @SuppressWarnings("unchecked")
                        List<Object> cards = (List<Object>) event.get("cards");
                        check(cards.size() == 3, "draws three cards");
                        take(3);
                        if (peeked != null) {
                            check(cards.equals(peeked), "draws the peeked cards " + peeked);
                            peeked = null;
                        }
                        hand = new ArrayList<>(cards);
                        phase = Phase.DISCARD;
                    }
                    break;
                case DISCARD:
                    expect(type, "discard");
                    check(seat(event, "seat") == president, "is the president's discard");
                    int discarded = number(event, "index");
                    check(discarded >= 0 && discarded < 3 && hand.get(discarded).equals(event.get("card")),
                            "discards the card at its index of " + hand);
                    chancellorHand = new ArrayList<>(hand);
                    chancellorHand.remove(discarded);
                    discard++;
                    phase = Phase.CHANCELLOR;
                    break;
                case CHANCELLOR:
                case REFUSED:
                    if (type.equals("veto") && phase == Phase.CHANCELLOR) {
                        check(seat(event, "seat") == chancellor && fascist == 5 && !vetoAsked,
                                "is the chancellor's veto, with five Fascist policies");
                        vetoAsked = true;
                        phase = Phase.VETO_ANSWER;
                    } else {
                        expect(type, "enact");
                        check("chancellor".equals(event.get("by")) && seat(event, "seat") == chancellor,
                                "is the chancellor's enact");
                        check(chancellorHand.contains(event.get("policy")), "enacts one of " + chancellorHand);
                        discard++;
                        enact(event);
                        powerDue = endDue == null && event.get("policy").equals("F") ? power(fascist) : null;
                        phase = Phase.AFTER_ENACT;
                    }
                    break;
                case VETO_ANSWER:
                    expect(type, "vetoAnswer");
                    check(seat(event, "seat") == president, "is the president's answer");
                    if ((Boolean) event.get("accepted")) {
                        discard += 2;
                        phase = Phase.TRACKER;
                    } else {
                        phase = Phase.REFUSED;
                    }
                    break;
                case TRACKER:
                    expect(type, "tracker");
                    check(number(event, "value") == tracker + 1, "moves the tracker from " + tracker);
                    tracker++;
                    phase = tracker == 3 ? Phase.CHAOS : Phase.END_TERM;
                    break;
                case CHAOS:
                    if (type.equals("reshuffle")) {
                        reshuffle(event);
                    } else {
                        expect(type, "enact");
                        check("chaos".equals(event.get("by")), "is chaos");
                        take(1);
                        if (peeked != null) {
                            check(peeked.get(0).equals(event.get("policy")), "enacts the peeked " + peeked.get(0));
                            peeked = null;
                        }
                        enact(event);
                        phase = Phase.AFTER_CHAOS;
                    }
                    break;
                case AFTER_ENACT:
                    power(type, event);
                    break;
                case AFTER_CHAOS:
                case END_TERM:
                    expect(type, "endTerm");
                    endTerm(event);
                    break;
                default:
                    fail("has no place");
            }
        }

        private void election(Map<String, Object> event) {
            Set<Integer> living = new HashSet<>();
            for (int seat = 0; seat < roles.size(); seat++) {
                if (living(seat)) {
                    living.add(seat);
                }
            }
            check(votes.keySet().equals(living), "closes an election every living seat voted in");
            int ja = (int) votes.values().stream().filter(v -> v).count();
            int nein = votes.size() - ja;
            check(number(event, "ja") == ja && number(event, "nein") == nein, "counts " + ja + " ja, " + nein + " nein");
            boolean passed = ja > nein;
            check(event.get("passed").equals(passed), "has passed " + passed);
            if (!passed) {
                phase = Phase.TRACKER;
                return;
            }
            phase = Phase.PASSED;
            if (roles.get(chancellor).equals("HITLER") && fascist >= 3) {
                endDue = "HITLER_ELECTED";
            }
        }

        /** The power a chancellor's Fascist policy unlocks with {@code fascist} on the board, or null. */
        private String power(int fascist) {
            int seats = roles.size();
            if (fascist == 4 || fascist == 5) {
                return "execute";
            } else if (seats <= 6) {
                return fascist == 3 ? "peek" : null;
            } else if (fascist == 3) {
                return "specialElection";
            } else if (fascist == 2 || (fascist == 1 && seats >= 9)) {
                return "investigate";
            }
            return null;
        }

        private void power(String type, Map<String, Object> event) {
            String due = powerDue;
            powerDue = null;
            if (type.equals("endTerm")) {
                check(due == null, "comes after the " + due + " the enact unlocked");
                endTerm(event);
                return;
            }
            check(type.equals(due), "is the power the enact unlocked (" + due + ")");
            check(seat(event, "seat") == president, "is the president's power");
            switch (type) {
                case "peek":
                    @SuppressWarnings("unchecked")
                    List<Object> cards = (List<Object>) event.get("cards");
                    check(cards.size() == 3 && draw >= 3, "peeks at three cards");
                    peeked = new ArrayList<>(cards);
                    break;
                case "investigate": {
                    int target = seat(event, "target");
                    check(living(target) && target != president, "investigates another living seat");
                    String side = roles.get(target).equals("LIBERAL") ? "LIBERAL" : "FASCIST";
                    check(side.equals(event.get("result")), "finds " + side);
                    break;
                }
                case "execute": {
                    int target = seat(event, "target");
                    check(living(target) && target != president, "executes another living seat");
                    check(roles.get(target).equals(event.get("role")), "names the role " + roles.get(target));
                    dead.add(target);
                    if (roles.get(target).equals("HITLER")) {
                        endDue = "HITLER_EXECUTED";
                    }
                    break;
                }
                case "specialElection": {
                    int target = seat(event, "target");
                    check(living(target) && target != president, "names another living seat");
                    break;
                }
                default:
                    fail("is not a power or an endTerm");
            }
            phase = Phase.END_TERM;
        }

        private void endTerm(Map<String, Object> event) {
            check(seat(event, "seat") == president, "ends the president's term");
            check(event.get("by").equals("president") || event.get("by").equals("countdown"), "is by president or countdown");
            phase = Phase.NOMINATE;
        }

        private void enact(Map<String, Object> event) {
            Object policy = event.get("policy");
            check(policy.equals("L") || policy.equals("F"), "enacts L or F");
            if (policy.equals("L")) {
                liberal++;
            } else {
                fascist++;
            }
            check(number(event, "liberal") == liberal && number(event, "fascist") == fascist,
                    "shows the board " + liberal + "/" + fascist);
            tracker = 0;
            reshuffleDue = draw < 3 && discard > 0;
            if (liberal == 5) {
                endDue = "LIBERAL_POLICIES";
            } else if (fascist == 6) {
                endDue = "FASCIST_POLICIES";
            }
        }

        private void reshuffle(Map<String, Object> event) {
            check(draw < 3 && discard > 0, "comes when the draw pile is short (" + draw + "/" + discard + ")");
            check(number(event, "drawPile") == draw + discard, "has drawPile " + (draw + discard));
            draw += discard;
            discard = 0;
        }

        private void take(int cards) {
            check(draw >= 3 || discard == 0, "takes from a draw pile that was reshuffled when short");
            check(draw >= cards, "takes from a pile with " + cards + " cards");
            draw -= cards;
        }

        private void end(Map<String, Object> event) {
            outcome = (String) event.get("outcome");
            check(outcome.equals("UNFINISHED") || outcome.equals(endDue), "ends as the game did");
            check(index == events.size() - 1, "is the last event");
            phase = Phase.ENDED;
        }

        private boolean living(int seat) {
            return seat >= 0 && seat < roles.size() && !dead.contains(seat);
        }

        private int seat(Map<String, Object> event, String key) {
            int seat = number(event, key);
            check(seat >= 0 && seat < roles.size(), "has a seat " + key);
            return seat;
        }

        private int number(Map<String, Object> event, String key) {
            Object value = event.get(key);
            check(value instanceof Integer, "has an Integer " + key);
            return (Integer) value;
        }

        private void expect(String type, String expected) {
            check(type.equals(expected), "is a " + expected + " (" + phase + ")");
        }

        private void check(boolean condition, String what) {
            if (!condition) {
                fail(what);
            }
        }

        private void fail(String what) {
            throw new AssertionError("Event " + index + " " + events.get(index) + " " + what + ".");
        }
    }
}
