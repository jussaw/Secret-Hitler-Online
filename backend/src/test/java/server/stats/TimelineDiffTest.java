package server.stats;

import static game.GameState.CHANCELLOR_NOMINATION;
import static game.GameState.CHANCELLOR_VOTING;
import static game.GameState.FASCIST_VICTORY_ELECTION;
import static game.GameState.FASCIST_VICTORY_POLICY;
import static game.GameState.LEGISLATIVE_CHANCELLOR;
import static game.GameState.LEGISLATIVE_PRESIDENT;
import static game.GameState.LEGISLATIVE_PRESIDENT_VETO;
import static game.GameState.LIBERAL_VICTORY_EXECUTION;
import static game.GameState.LIBERAL_VICTORY_POLICY;
import static game.GameState.POST_LEGISLATIVE;
import static game.GameState.PRESIDENTIAL_POWER_ELECTION;
import static game.GameState.PRESIDENTIAL_POWER_EXECUTION;
import static game.GameState.PRESIDENTIAL_POWER_INVESTIGATE;
import static game.GameState.PRESIDENTIAL_POWER_PEEK;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static server.stats.Snapshots.table;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import game.SecretHitlerGame;
import game.datastructures.Player;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;
import server.GameDriver;

/** The events between two looks at a game, for every move a game method makes. */
public class TimelineDiffTest {
    private static final long T = 5_000L;
    private static final ObjectMapper JSON = new ObjectMapper();

    /** An expected event at {@code t} T in round 1, with the pairs in order. */
    private static Map<String, Object> ev(String type, Object... pairs) {
        return evAt(1, type, pairs);
    }

    /** An expected event at {@code t} T in round {@code r}, with the pairs in order. */
    private static Map<String, Object> evAt(int r, String type, Object... pairs) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("type", type);
        event.put("t", T);
        event.put("r", r);
        for (int i = 0; i < pairs.length; i += 2) {
            event.put((String) pairs[i], pairs[i + 1]);
        }
        return event;
    }

    /** Compares as JSON text, so the keys' order counts. */
    private static void assertJson(List<? extends Map<String, Object>> expected,
            List<? extends Map<String, Object>> actual) {
        try {
            assertEquals(JSON.writeValueAsString(expected), JSON.writeValueAsString(actual));
        } catch (JsonProcessingException e) {
            throw new AssertionError(e);
        }
    }

    /** Runs {@code move} and returns the IllegalStateException it throws. */
    private static IllegalStateException assertIllegal(Runnable move) {
        try {
            move.run();
        } catch (IllegalStateException e) {
            return e;
        }
        fail("No IllegalStateException.");
        return null;
    }

    private static List<Map<String, Object>> events(GameSnapshot before, GameSnapshot after) {
        return new ArrayList<>(TimelineDiff.between(before, after, T));
    }

    /** A five-seat table voting on S2, with the four votes S0 S1 S2 S3 given. */
    private static Snapshots voting(boolean s0, boolean s1, boolean s2, boolean s3) {
        return table(5).state(CHANCELLOR_VOTING).chancellor("S2").vote("S0", s0).vote("S1", s1).vote("S2", s2)
                .vote("S3", s3);
    }

    @Test
    public void theThirdFailedElectionEnactsTheTopPolicy() {
        GameSnapshot before = table(5).state(CHANCELLOR_VOTING).chancellor("S2").tracker(2).board(1, 2)
                .piles(10, 4).vote("S0", true).vote("S1", true).vote("S2", false).vote("S3", false).build();
        GameSnapshot after = table(5).state(POST_LEGISLATIVE).chancellor("S2").tracker(0).board(1, 3)
                .piles(9, 4).vote("S0", true).vote("S1", true).vote("S2", false).vote("S3", false)
                .vote("S4", false).build();
        assertJson(List.of(ev("vote", "seat", 4, "ja", false),
                ev("election", "passed", false, "ja", 2, "nein", 3),
                ev("tracker", "value", 3),
                ev("enact", "policy", "F", "by", "chaos", "liberal", 1, "fascist", 3)),
                TimelineDiff.between(before, after, T));
    }

    @Test
    public void nothingChangedIsNoEvent() {
        List<GameSnapshot> looks = List.of(table(5).build(), voting(true, false, true, false).build(),
                table(5).state(LEGISLATIVE_PRESIDENT).chancellor("S2").presidentHand("L", "F", "F").piles(14, 0).build(),
                table(7).state(POST_LEGISLATIVE).round(4).president("S3").board(2, 3).tracker(1).dead("S5").build());
        for (GameSnapshot look : looks) {
            assertJson(List.of(), events(look, look));
        }
    }

    @Test
    public void aNominationIsOneEvent() {
        assertJson(List.of(ev("nominate", "president", 0, "chancellor", 2)),
                events(table(5).build(), table(5).state(CHANCELLOR_VOTING).chancellor("S2").build()));
    }

    @Test
    public void eachVoteIsAnEvent() {
        Snapshots none = table(5).state(CHANCELLOR_VOTING).chancellor("S2");
        assertJson(List.of(ev("vote", "seat", 1, "ja", true)),
                events(none.build(), table(5).state(CHANCELLOR_VOTING).chancellor("S2").vote("S1", true).build()));
        assertJson(List.of(ev("vote", "seat", 1, "ja", true), ev("vote", "seat", 3, "ja", false)),
                events(none.build(), table(5).state(CHANCELLOR_VOTING).chancellor("S2").vote("S3", false)
                        .vote("S1", true).build()));
    }

    @Test
    public void aDeadSeatsVoteIsLeftOut() {
        GameSnapshot three = table(5).state(CHANCELLOR_VOTING).chancellor("S2").dead("S3").vote("S0", true)
                .vote("S1", true).vote("S2", false).build();
        GameSnapshot withDead = table(5).state(CHANCELLOR_VOTING).chancellor("S2").dead("S3").vote("S0", true)
                .vote("S1", true).vote("S2", false).vote("S3", true).build();
        assertJson(List.of(), events(three, withDead));
        GameSnapshot closed = table(5).state(POST_LEGISLATIVE).chancellor("S2").dead("S3").tracker(1)
                .vote("S0", true).vote("S1", true).vote("S2", false).vote("S3", true).vote("S4", false).build();
        assertJson(List.of(ev("vote", "seat", 4, "ja", false), ev("election", "passed", false, "ja", 2, "nein", 2),
                ev("tracker", "value", 1)), events(withDead, closed));
    }

    @Test
    public void theLastVoteClosesTheElection() {
        GameSnapshot after = voting(true, true, true, false).state(LEGISLATIVE_PRESIDENT).vote("S4", false)
                .presidentHand("F", "L", "F").piles(14, 0).build();
        assertJson(List.of(ev("vote", "seat", 4, "ja", false), ev("election", "passed", true, "ja", 3, "nein", 2),
                ev("draw", "seat", 0, "cards", List.of("F", "L", "F"))),
                events(voting(true, true, true, false).build(), after));
    }

    @Test
    public void aFailedElectionMovesTheTracker() {
        GameSnapshot after = voting(true, true, false, false).state(POST_LEGISLATIVE).vote("S4", false).tracker(1)
                .build();
        assertJson(List.of(ev("vote", "seat", 4, "ja", false), ev("election", "passed", false, "ja", 2, "nein", 3),
                ev("tracker", "value", 1)), events(voting(true, true, false, false).build(), after));
    }

    @Test
    public void chaosCanReshuffleBeforeItsCard() {
        GameSnapshot before = voting(true, true, false, false).tracker(2).board(1, 2).piles(2, 5).build();
        GameSnapshot after = voting(true, true, false, false).state(POST_LEGISLATIVE).vote("S4", false).board(1, 3)
                .piles(6, 0).build();
        assertJson(List.of(ev("vote", "seat", 4, "ja", false), ev("election", "passed", false, "ja", 2, "nein", 3),
                ev("tracker", "value", 3), ev("reshuffle", "drawPile", 7),
                ev("enact", "policy", "F", "by", "chaos", "liberal", 1, "fascist", 3)), events(before, after));
    }

    @Test
    public void chaosCanReshuffleAfterItsCard() {
        GameSnapshot before = voting(true, true, false, false).tracker(2).board(1, 2).piles(3, 4).build();
        GameSnapshot after = voting(true, true, false, false).state(POST_LEGISLATIVE).vote("S4", false).board(2, 2)
                .piles(6, 0).build();
        assertJson(List.of(ev("vote", "seat", 4, "ja", false), ev("election", "passed", false, "ja", 2, "nein", 3),
                ev("tracker", "value", 3), ev("enact", "policy", "L", "by", "chaos", "liberal", 2, "fascist", 2),
                ev("reshuffle", "drawPile", 6)), events(before, after));
    }

    @Test
    public void chaosCanEndTheGame() {
        GameSnapshot before = voting(true, true, false, false).tracker(2).board(2, 5).piles(10, 4).build();
        GameSnapshot after = voting(true, true, false, false).state(FASCIST_VICTORY_POLICY).vote("S4", false)
                .board(2, 6).piles(9, 4).build();
        assertJson(List.of(ev("vote", "seat", 4, "ja", false), ev("election", "passed", false, "ja", 2, "nein", 3),
                ev("tracker", "value", 3), ev("enact", "policy", "F", "by", "chaos", "liberal", 2, "fascist", 6),
                ev("end", "outcome", "FASCIST_POLICIES")), events(before, after));
    }

    @Test
    public void aPassedElectionCanReshuffleBeforeTheDraw() {
        GameSnapshot before = voting(true, true, true, false).piles(2, 6).build();
        GameSnapshot after = voting(true, true, true, false).state(LEGISLATIVE_PRESIDENT).vote("S4", true)
                .presidentHand("L", "L", "F").piles(5, 0).build();
        assertJson(List.of(ev("vote", "seat", 4, "ja", true), ev("election", "passed", true, "ja", 4, "nein", 1),
                ev("reshuffle", "drawPile", 8), ev("draw", "seat", 0, "cards", List.of("L", "L", "F"))),
                events(before, after));
    }

    @Test
    public void electingHitlerEndsTheGame() {
        GameSnapshot before = table(5).state(CHANCELLOR_VOTING).chancellor("S4").board(0, 3).vote("S0", true)
                .vote("S1", true).vote("S2", true).vote("S3", false).build();
        GameSnapshot after = table(5).state(FASCIST_VICTORY_ELECTION).chancellor("S4").board(0, 3).vote("S0", true)
                .vote("S1", true).vote("S2", true).vote("S3", false).vote("S4", true).build();
        assertJson(List.of(ev("vote", "seat", 4, "ja", true), ev("election", "passed", true, "ja", 4, "nein", 1),
                ev("end", "outcome", "HITLER_ELECTED")), events(before, after));
    }

    @Test
    public void theDiscardIsTheMissingCard() {
        Snapshots legislative = table(5).state(LEGISLATIVE_PRESIDENT).chancellor("S2").piles(14, 0);
        assertJson(List.of(ev("discard", "seat", 0, "index", 1, "card", "F")),
                events(legislative.presidentHand("L", "F", "F").build(), table(5).state(LEGISLATIVE_CHANCELLOR)
                        .chancellor("S2").chancellorHand("L", "F").piles(14, 1).build()));
        assertJson(List.of(ev("discard", "seat", 0, "index", 1, "card", "L")),
                events(legislative.presidentHand("F", "L", "F").build(), table(5).state(LEGISLATIVE_CHANCELLOR)
                        .chancellor("S2").chancellorHand("F", "F").piles(14, 1).build()));
    }

    @Test
    public void anEnactByTheChancellor() {
        GameSnapshot before = table(5).state(LEGISLATIVE_CHANCELLOR).chancellor("S2").chancellorHand("L", "F")
                .piles(14, 1).build();
        GameSnapshot after = table(5).state(POST_LEGISLATIVE).chancellor("S2").board(1, 0).piles(14, 2).build();
        assertJson(List.of(ev("enact", "policy", "L", "by", "chancellor", "seat", 2, "liberal", 1, "fascist", 0)),
                events(before, after));
    }

    @Test
    public void anEnactCanUnlockAPower() {
        GameSnapshot before = table(5).state(LEGISLATIVE_CHANCELLOR).chancellor("S2").chancellorHand("F", "F")
                .board(0, 1).piles(14, 1).build();
        GameSnapshot after = table(5).state(PRESIDENTIAL_POWER_INVESTIGATE).chancellor("S2").board(0, 2)
                .piles(14, 2).build();
        assertJson(List.of(ev("enact", "policy", "F", "by", "chancellor", "seat", 2, "liberal", 0, "fascist", 2)),
                events(before, after));
    }

    @Test
    public void anEnactCanReshuffle() {
        GameSnapshot before = table(5).state(LEGISLATIVE_CHANCELLOR).chancellor("S2").chancellorHand("L", "F")
                .piles(2, 3).build();
        GameSnapshot after = table(5).state(POST_LEGISLATIVE).chancellor("S2").board(1, 0).piles(6, 0).build();
        assertJson(List.of(ev("enact", "policy", "L", "by", "chancellor", "seat", 2, "liberal", 1, "fascist", 0),
                ev("reshuffle", "drawPile", 6)), events(before, after));
    }

    @Test
    public void anEnactCanEndTheGame() {
        GameSnapshot before = table(5).state(LEGISLATIVE_CHANCELLOR).chancellor("S2").chancellorHand("L", "F")
                .board(4, 0).piles(10, 2).build();
        GameSnapshot after = table(5).state(LIBERAL_VICTORY_POLICY).chancellor("S2").board(5, 0).piles(10, 3)
                .build();
        assertJson(List.of(ev("enact", "policy", "L", "by", "chancellor", "seat", 2, "liberal", 5, "fascist", 0),
                ev("end", "outcome", "LIBERAL_POLICIES")), events(before, after));
    }

    @Test
    public void aVetoAndItsRefusal() {
        Snapshots chancellor = table(5).state(LEGISLATIVE_CHANCELLOR).chancellor("S2").chancellorHand("L", "F")
                .board(0, 5).piles(9, 4);
        Snapshots veto = table(5).state(LEGISLATIVE_PRESIDENT_VETO).chancellor("S2").chancellorHand("L", "F")
                .board(0, 5).piles(9, 4);
        assertJson(List.of(ev("veto", "seat", 2)), events(chancellor.build(), veto.build()));
        assertJson(List.of(ev("vetoAnswer", "seat", 0, "accepted", false)), events(veto.build(), chancellor.build()));
    }

    @Test
    public void anAcceptedVetoMovesTheTracker() {
        GameSnapshot before = table(5).state(LEGISLATIVE_PRESIDENT_VETO).chancellor("S2").chancellorHand("L", "F")
                .board(0, 5).piles(8, 4).build();
        GameSnapshot after = table(5).state(POST_LEGISLATIVE).chancellor("S2").board(0, 5).tracker(1).piles(8, 6)
                .build();
        assertJson(List.of(ev("vetoAnswer", "seat", 0, "accepted", true), ev("tracker", "value", 1)),
                events(before, after));
    }

    @Test
    public void anAcceptedVetoCanBringChaos() {
        GameSnapshot before = table(5).state(LEGISLATIVE_PRESIDENT_VETO).chancellor("S2").chancellorHand("L", "F")
                .tracker(2).board(3, 5).piles(8, 4).build();
        GameSnapshot after = table(5).state(POST_LEGISLATIVE).chancellor("S2").tracker(0).board(4, 5).piles(7, 6)
                .build();
        assertJson(List.of(ev("vetoAnswer", "seat", 0, "accepted", true), ev("tracker", "value", 3),
                ev("enact", "policy", "L", "by", "chaos", "liberal", 4, "fascist", 5)), events(before, after));
    }

    @Test
    public void aPeekIsRecordedWhenItCloses() {
        GameSnapshot before = table(5).state(PRESIDENTIAL_POWER_PEEK).chancellor("S2").board(0, 3).peek("L", "F", "F")
                .piles(10, 2).build();
        GameSnapshot after = table(5).state(POST_LEGISLATIVE).chancellor("S2").board(0, 3).piles(10, 2).build();
        assertJson(List.of(ev("peek", "seat", 0, "cards", List.of("L", "F", "F"))), events(before, after));
    }

    @Test
    public void thePowers() {
        Snapshots investigate = table(5).state(PRESIDENTIAL_POWER_INVESTIGATE).chancellor("S2").board(0, 2);
        assertJson(List.of(ev("investigate", "seat", 0, "target", 4, "result", "FASCIST")),
                events(investigate.build(), table(5).state(POST_LEGISLATIVE).chancellor("S2").board(0, 2)
                        .target("S4").build()));

        Snapshots execution = table(5).state(PRESIDENTIAL_POWER_EXECUTION).chancellor("S2").board(0, 4);
        assertJson(List.of(ev("execute", "seat", 0, "target", 3, "role", "FASCIST")),
                events(execution.build(), table(5).state(POST_LEGISLATIVE).chancellor("S2").board(0, 4)
                        .target("S3").dead("S3").build()));
        assertJson(List.of(ev("execute", "seat", 0, "target", 4, "role", "HITLER"),
                ev("end", "outcome", "HITLER_EXECUTED")),
                events(execution.build(), table(5).state(LIBERAL_VICTORY_EXECUTION).chancellor("S2").board(0, 4)
                        .target("S4").dead("S4").build()));

        Snapshots election = table(7).state(PRESIDENTIAL_POWER_ELECTION).chancellor("S2").board(0, 3);
        assertJson(List.of(ev("specialElection", "seat", 0, "target", 2)),
                events(election.build(), table(7).state(POST_LEGISLATIVE).chancellor("S2").board(0, 3)
                        .target("S2").build()));
    }

    @Test
    public void endingATerm() {
        GameSnapshot before = table(5).state(POST_LEGISLATIVE).round(3).president("S1").chancellor("S3").build();
        GameSnapshot after = table(5).state(CHANCELLOR_NOMINATION).round(4).president("S2").build();
        assertJson(List.of(evAt(3, "endTerm", "seat", 1, "by", "president")), events(before, after));
    }

    @Test
    public void anImpossibleChangeThrows() {
        IllegalStateException skipped = assertIllegal(
                () -> TimelineDiff.between(table(5).build(), table(5).state(POST_LEGISLATIVE).build(), T));
        assertTrue(skipped.getMessage(), skipped.getMessage().contains("CHANCELLOR_NOMINATION")
                && skipped.getMessage().contains("POST_LEGISLATIVE"));

        GameSnapshot before = table(5).state(LEGISLATIVE_CHANCELLOR).chancellor("S2").chancellorHand("L", "F")
                .piles(14, 1).build();
        GameSnapshot wrongPiles = table(5).state(POST_LEGISLATIVE).chancellor("S2").board(1, 0).piles(14, 5).build();
        assertIllegal(() -> TimelineDiff.between(before, wrongPiles, T));
    }

    /** A move left unseen comes back to the same state, but the table moved on: that is no single move. */
    @Test
    public void aSkippedMoveInTheSameStateThrows() {
        GameSnapshot term = table(5).state(POST_LEGISLATIVE).round(3).tracker(1).build();
        GameSnapshot nextTerm = table(5).state(POST_LEGISLATIVE).round(4).president("S1").tracker(2).build();
        assertIllegal(() -> TimelineDiff.between(term, nextTerm, T));

        GameSnapshot oldVotes = voting(true, true, true, true).build();
        GameSnapshot newVotes = table(5).state(CHANCELLOR_VOTING).chancellor("S2").vote("S1", false).build();
        assertIllegal(() -> TimelineDiff.between(oldVotes, newVotes, T));
    }

    /**
     * A power the game refuses (an execution of a dead seat, or a president naming themselves)
     * still sets its target, and leaves the state as it was: no event.
     */
    @Test
    public void aRefusedPowerIsNoEvent() {
        GameSnapshot before = table(7).state(PRESIDENTIAL_POWER_ELECTION).board(0, 3).build();
        GameSnapshot after = table(7).state(PRESIDENTIAL_POWER_ELECTION).board(0, 3).target("S0").build();
        assertJson(List.of(), events(before, after));
    }

    @Test
    public void aRealGameReplays() {
        for (int seats = 5; seats <= 10; seats++) {
            List<GameSnapshot> looks = new ArrayList<>();
            SecretHitlerGame game = GameDriver.play(seats, g -> looks.add(GameSnapshot.of(g)));
            List<Map<String, Object>> timeline = new ArrayList<>();
            for (int step = 1; step < looks.size(); step++) {
                timeline.addAll(TimelineDiff.between(looks.get(step - 1), looks.get(step), step));
            }
            assertEquals("a game of " + seats, TimelineReplay.of(game),
                    TimelineReplay.replay(timeline, TimelineReplay.roles(game)));
        }
    }

    /** The replay the random games rely on notices any one event left out or written twice. */
    @Test
    public void theReplayNoticesAMissingOrDoubledEvent() {
        List<GameSnapshot> looks = new ArrayList<>();
        SecretHitlerGame game = GameDriver.play(7, g -> looks.add(GameSnapshot.of(g)));
        List<Map<String, Object>> timeline = new ArrayList<>();
        for (int step = 1; step < looks.size(); step++) {
            timeline.addAll(TimelineDiff.between(looks.get(step - 1), looks.get(step), step));
        }
        TimelineReplay.Replayed end = TimelineReplay.of(game);
        List<String> roles = TimelineReplay.roles(game);
        for (int i = 0; i < timeline.size(); i++) {
            List<Map<String, Object>> missing = new ArrayList<>(timeline);
            missing.remove(i);
            List<Map<String, Object>> doubled = new ArrayList<>(timeline);
            doubled.add(i, timeline.get(i));
            for (List<Map<String, Object>> wrong : List.of(missing, doubled)) {
                try {
                    assertTrue("event " + i + " " + timeline.get(i),
                            !end.equals(TimelineReplay.replay(wrong, roles)));
                } catch (AssertionError expected) {
                    if (expected.getMessage().startsWith("event " + i + " ")) {
                        throw expected;
                    }
                }
            }
        }
    }

    @Test
    public void aSnapshotOfANewGame() {
        List<String> names = List.of("Ann", "Bob", "Cy", "Di", "Ed");
        SecretHitlerGame game = new SecretHitlerGame(names);
        GameSnapshot look = GameSnapshot.of(game);
        List<String> seats = new ArrayList<>();
        for (Player player : game.getPlayerList()) {
            seats.add(player.getUsername());
        }
        assertEquals(CHANCELLOR_NOMINATION, look.state());
        assertEquals(1, look.round());
        assertEquals(seats, look.seats());
        assertEquals(seats.get(0), look.president());
        assertNull(look.chancellor());
        assertEquals(17, look.drawSize());
        assertEquals(0, look.discardSize());
        assertEquals(List.of(), look.presidentHand());
        assertEquals(List.of(), look.chancellorHand());
        assertEquals(List.of(), look.peek());
        assertEquals(0, look.seatIndex(seats.get(0)));
        assertEquals(-1, look.seatIndex("Nobody"));
        assertEquals(-1, look.seatIndex(null));

        game.nominateChancellor(seats.get(1));
        for (String name : seats) {
            game.registerVote(name, true);
        }
        List<String> hand = GameSnapshot.of(game).presidentHand();
        assertEquals(3, hand.size());
        assertTrue(hand.toString(), hand.stream().allMatch(card -> card.equals("L") || card.equals("F")));
    }
}
