package server.util;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static server.util.LobbyTesting.account;
import static server.util.LobbyTesting.join;

import com.fasterxml.jackson.databind.ObjectMapper;
import game.GameState;
import game.SecretHitlerGame;
import game.datastructures.Player;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import server.GameDriver;
import server.ServerTesting;
import server.stats.GameRecord;
import server.stats.GameRecordSink;
import server.stats.GameSnapshot;
import server.stats.TimelineReplay;

/** The timeline a lobby keeps of its game, and the one record it hands over when the game ends or is swept. */
public class LobbyRecordingTest {
    private final List<GameRecord> records = Collections.synchronizedList(new ArrayList<>());
    private final AtomicLong clock = new AtomicLong(1_000_000L);
    private final Map<String, FakeSocket> players = new LinkedHashMap<>();

    private GameRecordSink savedSink;
    private LongSupplier savedClock;
    private float savedCpuDelay;
    private long savedLobbyTimeout;
    private float savedEndTerm;
    private float savedPlayerTimeout;

    @Before
    public void setUp() {
        savedSink = Lobby.recordSink;
        savedClock = Lobby.recordClock;
        savedCpuDelay = Lobby.CPU_ACTION_DELAY_IN_SEC;
        savedLobbyTimeout = Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN;
        savedEndTerm = Lobby.END_TERM_TIMER_IN_SEC;
        savedPlayerTimeout = Lobby.PLAYER_TIMEOUT_IN_SEC;
        Lobby.recordSink = records::add;
        Lobby.recordClock = clock::get;
        Lobby.CPU_ACTION_DELAY_IN_SEC = 600; // no CPU tick comes by itself: stepCpus plays them
        Lobby.END_TERM_TIMER_IN_SEC = 600;
        Lobby.PLAYER_TIMEOUT_IN_SEC = 60;
    }

    @After
    public void tearDown() {
        Lobby.recordSink = savedSink;
        Lobby.recordClock = savedClock;
        Lobby.CPU_ACTION_DELAY_IN_SEC = savedCpuDelay;
        Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN = savedLobbyTimeout;
        Lobby.END_TERM_TIMER_IN_SEC = savedEndTerm;
        Lobby.PLAYER_TIMEOUT_IN_SEC = savedPlayerTimeout;
    }

    /** A lobby whose game has just started, seated by the named players (CPUs fill up to five). */
    private Lobby lobbyInGame(String... names) {
        Lobby lobby = new Lobby();
        int icon = 1;
        for (String name : names) {
            FakeSocket socket = FakeSocket.open();
            join(lobby, socket.ctx, name);
            lobby.trySetUserIcon("p" + icon++, socket.ctx);
            players.put(name, socket);
        }
        lobby.startNewGame();
        return lobby;
    }

    /** Plays the lobby's game to its end, a second a move, sending the state after every move as the server does. */
    private void playOut(Lobby lobby) {
        GameDriver.playOut(lobby.game(), g -> {
            clock.addAndGet(1_000);
            synchronized (lobby) {
                lobby.updateAllUsers();
            }
        });
    }

    /** Plays the lobby's CPUs, a second a move, until the lobby is idle. */
    private void stepCpusToTheEnd(Lobby lobby) {
        GameDriver.stepCpus(lobby, g -> {
            clock.addAndGet(1_000);
            return false;
        });
    }

    private static long countOf(GameRecord record, String type) {
        return record.events().stream().filter(e -> e.get("type").equals(type)).count();
    }

    private static Map<String, Object> last(List<Map<String, Object>> events) {
        return events.get(events.size() - 1);
    }

    private static String json(Object value) throws Exception {
        return new ObjectMapper().writeValueAsString(value);
    }

    private static void assertReplays(GameRecord record, SecretHitlerGame game) {
        assertEquals(TimelineReplay.of(game), TimelineReplay.replay(record.events(), TimelineReplay.roles(game)));
    }

    @Test
    public void aFinishedGameHandsOverOneRecord() {
        Lobby lobby = lobbyInGame("P1", "P2", "P3", "P4", "P5");
        String id = lobby.gameId();
        assertNotNull(id);
        SecretHitlerGame game = lobby.game();

        playOut(lobby);

        assertEquals(1, records.size());
        GameRecord record = records.get(0);
        assertEquals(id, record.id());
        assertEquals(1_000_000L, record.startedAt());
        assertEquals(GameSnapshot.outcomeOf(game.getState()), record.outcome());
        assertTrue(record.complete());
        assertFalse(record.hasCpu());
        List<Player> seats = game.getPlayerList();
        assertEquals(seats.size(), record.seats().size());
        for (int i = 0; i < seats.size(); i++) {
            GameRecord.Seat seat = record.seats().get(i);
            assertEquals(seats.get(i).getUsername(), seat.name());
            assertEquals(account(seats.get(i).getUsername()), seat.accountId());
            assertFalse(seat.cpu());
            assertEquals(seats.get(i).getIdentity().name(), seat.role());
            assertEquals(seats.get(i).isAlive(), seat.alive());
        }
        assertEquals(1, countOf(record, "end"));
        Map<String, Object> end = last(record.events());
        assertEquals("end", end.get("type"));
        assertEquals(record.outcome(), end.get("outcome"));
        assertEquals(record.startedAt() + (Long) end.get("t"), record.endedAt());
        assertEquals(game.getNumLiberalPolicies(), record.liberalPolicies());
        assertEquals(game.getNumFascistPolicies(), record.fascistPolicies());
        assertEquals(game.getRound(), record.rounds());
        assertReplays(record, game);
        assertFalse(lobby.isInGame());
    }

    @Test
    public void cpuVotesAreRecordedOneByOne() {
        Lobby lobby = new Lobby();
        lobby.startNewGame();
        SecretHitlerGame game = lobby.game();

        stepCpusToTheEnd(lobby);

        assertEquals(1, records.size());
        GameRecord record = records.get(0);
        assertTrue(record.hasCpu());
        for (GameRecord.Seat seat : record.seats()) {
            assertTrue(seat.cpu());
            assertNull(seat.accountId());
        }
        assertTrue(record.accountIds().isEmpty());
        assertReplays(record, game);
        // Lobby lets its CPUs act in name order, so each election's votes come Bot 1 first.
        List<String> voters = new ArrayList<>();
        for (Map<String, Object> event : record.events()) {
            if (event.get("type").equals("vote")) {
                voters.add(record.seats().get((Integer) event.get("seat")).name());
            } else if (event.get("type").equals("election")) {
                List<String> sorted = new ArrayList<>(voters);
                Collections.sort(sorted);
                assertEquals(sorted, voters);
                voters.clear();
            }
        }
        assertFalse(lobby.isInGame());
    }

    @Test
    public void aSweptGameHandsOverOneUnfinishedRecord() throws Exception {
        Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN = 0;
        Lobby lobby = new Lobby();
        FakeSocket ann = FakeSocket.open();
        FakeSocket bob = FakeSocket.open();
        lobby.addUser(ann.ctx, "acct-Ann", "Ann");
        lobby.trySetUserIcon("p1", ann.ctx);
        lobby.addUser(bob.ctx, "acct-Bob", "Bob");
        lobby.trySetUserIcon("p2", bob.ctx);
        lobby.startNewGame();
        clock.set(1_600_000L);

        assertTrue(lobby.closeIfTimedOut());

        assertEquals(1, records.size());
        GameRecord record = records.get(0);
        assertEquals(GameRecord.UNFINISHED, record.outcome());
        assertNull(record.winner());
        assertEquals(1_000_000L, record.startedAt());
        assertEquals(1_600_000L, record.endedAt());
        assertEquals("{\"type\":\"end\",\"t\":600000,\"r\":1,\"outcome\":\"UNFINISHED\"}", json(last(record.events())));
        assertEquals(1, countOf(record, "end"));
        int cpus = 0;
        for (GameRecord.Seat seat : record.seats()) {
            if (seat.cpu()) {
                cpus++;
                assertNull(seat.accountId());
            } else {
                assertEquals("acct-" + seat.name(), seat.accountId());
            }
        }
        assertEquals(3, cpus);
        assertEquals(List.of("acct-Ann", "acct-Bob"), record.accountIds().stream().sorted().toList());
        assertFalse(lobby.isInGame());

        assertFalse(lobby.closeIfTimedOut());
        assertEquals(1, records.size());
    }

    @Test
    public void aFinishedGameSweptBeforeItsTickKeepsItsOutcome() {
        Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN = 0;
        Lobby lobby = new Lobby();
        lobby.startNewGame();
        SecretHitlerGame game = lobby.game();
        GameDriver.stepCpus(lobby, g -> GameSnapshot.of(g).finished());
        assertTrue("the game is over but still the lobby's", lobby.isInGame());

        assertTrue(lobby.closeIfTimedOut());

        assertEquals(1, records.size());
        GameRecord record = records.get(0);
        String outcome = GameSnapshot.outcomeOf(game.getState());
        assertNotNull(outcome);
        assertEquals(outcome, record.outcome());
        assertNotNull(record.winner());
        assertEquals(1, countOf(record, "end"));
        assertEquals(outcome, last(record.events()).get("outcome"));
        assertTrue(record.complete());
        assertReplays(record, game);
        assertFalse(lobby.isInGame());
    }

    @Test
    public void anUnreadableMoveIsSkippedAndTheGameGoesOn() {
        Lobby lobby = lobbyInGame("P1", "P2", "P3", "P4", "P5");
        synchronized (lobby) {
            SecretHitlerGame game = lobby.game();
            List<Player> seats = game.getPlayerList();
            game.nominateChancellor(seats.get(1).getUsername());
            for (Player player : seats) {
                game.registerVote(player.getUsername(), true);
            }
        }
        Map<String, Integer> sent = new LinkedHashMap<>();
        players.forEach((name, socket) -> sent.put(name, socket.sent.size()));

        synchronized (lobby) {
            lobby.updateAllUsers();
        }

        players.forEach((name, socket) -> assertEquals(name, sent.get(name) + 1, socket.sent.size()));
        playOut(lobby);
        assertEquals(1, records.size());
        assertFalse(records.get(0).complete());
        assertFalse(lobby.isInGame());
    }

    @Test
    public void aSinkThatThrowsNeverStopsTheGame() {
        Lobby.recordSink = record -> {
            throw new IllegalStateException("The sink is broken.");
        };
        Lobby lobby = lobbyInGame("P1", "P2", "P3", "P4", "P5");

        playOut(lobby);

        assertFalse(lobby.isInGame());
        lobby.startNewGame();
        assertTrue(lobby.isInGame());
    }

    @Test
    public void twoGamesInARowAreTwoRecords() {
        Lobby lobby = lobbyInGame("P1", "P2", "P3", "P4", "P5");
        playOut(lobby);
        assertEquals(1, records.size());
        assertEquals(records.get(0).id(), lobby.gameId());

        lobby.startNewGame();
        assertNotEquals(records.get(0).id(), lobby.gameId());
        SecretHitlerGame second = lobby.game();
        playOut(lobby);

        assertEquals(2, records.size());
        assertNotEquals(records.get(0).id(), records.get(1).id());
        assertEquals(records.get(1).id(), lobby.gameId());
        assertEquals(1, records.get(1).events().get(0).get("r"));
        assertReplays(records.get(1), second);
    }

    @Test
    public void tNeverGoesBack() {
        Lobby lobby = lobbyInGame("P1", "P2", "P3", "P4", "P5");
        synchronized (lobby) {
            clock.set(1_005_000L);
            SecretHitlerGame game = lobby.game();
            List<Player> seats = game.getPlayerList();
            game.nominateChancellor(seats.get(1).getUsername());
            lobby.updateAllUsers();
            clock.set(1_001_000L);
            game.registerVote(seats.get(0).getUsername(), true);
            lobby.updateAllUsers();
        }
        Map<String, Object> vote = last(lobby.timeline());
        assertEquals("vote", vote.get("type"));
        assertEquals(5_000L, vote.get("t"));
    }

    @Test
    public void noRecordWhileTheGameRuns() {
        Lobby lobby = lobbyInGame("P1", "P2", "P3", "P4", "P5");
        synchronized (lobby) {
            SecretHitlerGame game = lobby.game();
            List<Player> seats = game.getPlayerList();
            game.nominateChancellor(seats.get(1).getUsername());
            lobby.updateAllUsers();
            game.registerVote(seats.get(0).getUsername(), true);
            lobby.updateAllUsers();
            game.registerVote(seats.get(1).getUsername(), false);
            lobby.updateAllUsers();
        }
        assertTrue(records.isEmpty());
        assertEquals(List.of("nominate", "vote", "vote"),
                lobby.timeline().stream().map(e -> e.get("type")).toList());
    }

    /** Sends the state as the server does after every move, under the lobby's lock. */
    private static void update(Lobby lobby) {
        synchronized (lobby) {
            lobby.updateAllUsers();
        }
    }

    /** A five-player lobby whose game waits for END TERM, with the state sent after every move. */
    private Lobby lobbyAtEndTerm() {
        Lobby lobby = lobbyInGame("P1", "P2", "P3", "P4", "P5");
        GameDriver.playUntil(lobby.game(), GameState.POST_LEGISLATIVE, g -> update(lobby));
        return lobby;
    }

    private static int seatOf(Lobby lobby, String name) {
        synchronized (lobby) {
            List<Player> seats = lobby.game().getPlayerList();
            for (int i = 0; i < seats.size(); i++) {
                if (seats.get(i).getUsername().equals(name)) {
                    return i;
                }
            }
        }
        throw new IllegalArgumentException(name);
    }

    private static List<String> types(List<Map<String, Object>> events) {
        return events.stream().map(e -> (String) e.get("type")).toList();
    }

    @Test
    public void pausesAndResumesAreRecorded() {
        Lobby lobby = lobbyAtEndTerm();
        int before = lobby.timeline().size();
        String president;
        synchronized (lobby) {
            president = lobby.game().getCurrentPresident();
            lobby.pauseTermTimer();
            lobby.pauseTermTimer(); // already paused: no event
            lobby.resumeTermTimer();
            lobby.resumeTermTimer(); // already running: no event
        }
        List<Map<String, Object>> events = lobby.timeline();
        int seat = seatOf(lobby, president);
        int round = lobby.game().getRound();
        assertEquals(List.of("timerPause", "timerResume"), types(events.subList(before, events.size())));
        for (Map<String, Object> event : events.subList(before, events.size())) {
            assertEquals(seat, event.get("seat"));
            assertEquals(round, event.get("r"));
        }
    }

    @Test
    public void theCountdownEndsTheTermByCountdown() throws Exception {
        Lobby.END_TERM_TIMER_IN_SEC = 0.2f;
        Lobby lobby = lobbyAtEndTerm(); // the last state sent shows END TERM, which starts the countdown
        int round;
        String president;
        synchronized (lobby) {
            round = lobby.game().getRound();
            president = lobby.game().getCurrentPresident();
        }
        long deadline = System.currentTimeMillis() + 5_000;
        while (true) {
            synchronized (lobby) {
                if (lobby.game().getRound() == round + 1) {
                    break;
                }
            }
            assertTrue("the countdown ended the term", System.currentTimeMillis() < deadline);
            Thread.sleep(20);
        }
        List<Map<String, Object>> endTerms = lobby.timeline().stream()
                .filter(e -> e.get("type").equals("endTerm") && e.get("r").equals(round)).toList();
        assertEquals(1, endTerms.size());
        assertEquals("countdown", endTerms.get(0).get("by"));
        assertEquals(seatOf(lobby, president), endTerms.get(0).get("seat"));
        assertTrue(lobby.isLateForTerm(president));
    }

    @Test
    public void aPresidentsEndTermIsByPresident() {
        Lobby lobby = lobbyAtEndTerm();
        synchronized (lobby) {
            lobby.game().endPresidentialTerm();
            lobby.updateAllUsers();
        }
        Map<String, Object> endTerm = last(lobby.timeline());
        assertEquals("endTerm", endTerm.get("type"));
        assertEquals("president", endTerm.get("by"));
    }

    @Test
    public void dropsAndReturnsAreRecorded() {
        Lobby lobby = new Lobby();
        FakeSocket p3 = FakeSocket.open();
        int icon = 1;
        for (String name : List.of("P1", "P2", "P3", "P4", "P5")) {
            FakeSocket socket = name.equals("P3") ? p3 : FakeSocket.open();
            join(lobby, socket.ctx, name, name.equals("P3") ? "k" : null);
            lobby.trySetUserIcon("p" + icon++, socket.ctx);
            players.put(name, socket);
        }
        lobby.startNewGame();
        int p2 = seatOf(lobby, "P2");

        synchronized (lobby) {
            lobby.removeUser(players.get("P2").ctx);
            lobby.updateAllUsers();
        }
        assertEquals(List.of("disconnect"), types(lobby.timeline()));
        assertEquals(p2, last(lobby.timeline()).get("seat"));

        FakeSocket back = FakeSocket.open();
        join(lobby, back.ctx, "P2");
        update(lobby);
        assertEquals(List.of("disconnect", "reconnect"), types(lobby.timeline()));
        assertEquals(p2, last(lobby.timeline()).get("seat"));

        FakeSocket p3Again = FakeSocket.open();
        assertEquals(p3.ctx, join(lobby, p3Again.ctx, "P3", "k")); // the same page, back by its key
        update(lobby);
        FakeSocket spectator = FakeSocket.open();
        lobby.addSpectator(spectator.ctx);
        lobby.removeSpectator(spectator.ctx);
        update(lobby);
        assertEquals(List.of("disconnect", "reconnect"), types(lobby.timeline()));
    }

    /** The move {@code me} owes the game now, if any: what a page would send. */
    private static void humanMove(SecretHitlerGame game, String me) {
        String president = game.getCurrentPresident();
        List<Player> seats = game.getPlayerList();
        List<String> others = new ArrayList<>();
        for (Player player : seats) {
            if (player.isAlive() && !player.getUsername().equals(me)) {
                others.add(player.getUsername());
            }
        }
        boolean presiding = me.equals(president);
        switch (game.getState()) {
            case CHANCELLOR_NOMINATION:
                if (presiding) {
                    for (String name : others) {
                        if (!name.equals(game.getLastChancellor())
                                && !(name.equals(game.getLastPresident()) && game.getLivingPlayerCount() > 5)) {
                            game.nominateChancellor(name);
                            return;
                        }
                    }
                }
                break;
            case CHANCELLOR_VOTING:
                if (game.getPlayer(me).isAlive() && !game.hasPlayerVoted(me)) {
                    game.registerVote(me, true);
                }
                break;
            case LEGISLATIVE_PRESIDENT:
                if (presiding) {
                    game.presidentDiscardPolicy(0);
                }
                break;
            case LEGISLATIVE_CHANCELLOR:
                if (me.equals(game.getCurrentChancellor())) {
                    game.chancellorEnactPolicy(0);
                }
                break;
            case LEGISLATIVE_PRESIDENT_VETO:
                if (presiding) {
                    game.presidentialVeto(false);
                }
                break;
            case PRESIDENTIAL_POWER_PEEK:
                if (presiding) {
                    game.endPeek();
                }
                break;
            case PRESIDENTIAL_POWER_INVESTIGATE:
                if (presiding) {
                    game.investigatePlayer(others.stream().filter(n -> !game.getPlayer(n).hasBeenInvestigated())
                            .findFirst().orElseThrow());
                }
                break;
            case PRESIDENTIAL_POWER_EXECUTION:
                if (presiding) {
                    game.executePlayer(others.get(0));
                }
                break;
            case PRESIDENTIAL_POWER_ELECTION:
                if (presiding) {
                    game.electNextPresident(others.get(0));
                }
                break;
            case POST_LEGISLATIVE:
                if (presiding) {
                    game.endPresidentialTerm();
                }
                break;
            default:
        }
    }

    /**
     * A CPU's winning move is dropped only at the next tick. A seated player who drops in between
     * adds nothing: the timeline ends with the game's end, and so does its record.
     */
    @Test
    public void nothingIsAddedAfterTheEnd() {
        for (int attempt = 0; attempt < 100; attempt++) {
            Lobby lobby = lobbyInGame("P1"); // four CPU players
            SecretHitlerGame game = lobby.game();
            for (int step = 0; step < 2_000 && lobby.isInGame() && !GameSnapshot.of(game).finished(); step++) {
                synchronized (lobby) {
                    humanMove(game, "P1");
                    lobby.updateAllUsers();
                }
            }
            if (!lobby.isInGame()) {
                records.clear(); // P1 made the last move, so the game was dropped at once: try again
                continue;
            }
            assertEquals("end", last(lobby.timeline()).get("type"));
            synchronized (lobby) {
                lobby.removeUser(players.get("P1").ctx);
                lobby.updateAllUsers();
            }
            assertEquals(1, records.size());
            GameRecord record = records.get(0);
            assertEquals("end", last(record.events()).get("type"));
            assertEquals(0, countOf(record, "disconnect"));
            assertReplays(record, game);
            return;
        }
        throw new AssertionError("No CPU made the winning move in 100 games.");
    }

    @Test
    public void aGameThatEndsMarksTheBackupStale() {
        Lobby lobby = new Lobby();
        lobby.startNewGame();
        ServerTesting.clearLobbiesChanged();

        stepCpusToTheEnd(lobby);

        assertFalse(lobby.isInGame());
        assertTrue(ServerTesting.lobbiesChanged());
    }
}
