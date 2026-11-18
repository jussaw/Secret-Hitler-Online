package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.ObjectMapper;
import game.BotSkill;
import game.CpuPlayer;
import game.CpuTurn;
import game.GameState;
import game.SecretHitlerGame;
import game.datastructures.Player;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.ObjectOutputStream;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.slf4j.LoggerFactory;
import server.stats.GameRecord;
import server.stats.GameSnapshot;
import server.stats.TestRecords;
import server.stats.TestStore;
import server.stats.TimelineReplay;
import server.util.FakeSocket;
import server.util.Lobby;
import server.util.RecordedGames;

public class DatabaseBackupTest {
    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    @Rule
    public final RecordedGames recorded = new RecordedGames();
    private final List<GameRecord> records = recorded.records;
    private final AtomicLong clock = recorded.clock;

    private String dbPath() {
        return new File(tmp.getRoot(), "backup.db").getAbsolutePath();
    }

    private static List<String> playerNames(Lobby lobby) {
        return lobby.game().getPlayerList().stream().map(Player::getUsername).collect(Collectors.toList());
    }

    private void store(ConcurrentHashMap<String, Lobby> lobbies) throws Exception {
        try (Connection c = SecretHitlerServer.getDatabaseConnection(dbPath())) {
            SecretHitlerServer.storeLobbies(c, lobbies);
        }
    }

    private ConcurrentHashMap<String, Lobby> load() throws Exception {
        try (Connection c = SecretHitlerServer.getDatabaseConnection(dbPath())) {
            return SecretHitlerServer.loadLobbies(c);
        }
    }

    @Test
    public void lobbiesSurviveARoundTripThroughTheSqliteFile() throws Exception {
        ConcurrentHashMap<String, Lobby> lobbies = new ConcurrentHashMap<>();
        Lobby inGame = new Lobby();
        inGame.startNewGame(); // no humans: five CPU players take the seats
        lobbies.put("ABCD", inGame);
        lobbies.put("WXYZ", new Lobby());

        store(lobbies);
        ConcurrentHashMap<String, Lobby> loaded = load();

        assertEquals(lobbies.keySet(), loaded.keySet());
        assertTrue(loaded.get("ABCD").isInGame());
        assertEquals(playerNames(inGame), playerNames(loaded.get("ABCD")));
        assertFalse(loaded.get("WXYZ").isInGame());
    }

    @Test
    public void storingAgainReplacesThePreviousBackup() throws Exception {
        ConcurrentHashMap<String, Lobby> first = new ConcurrentHashMap<>();
        first.put("AAAA", new Lobby());
        ConcurrentHashMap<String, Lobby> second = new ConcurrentHashMap<>();
        second.put("BBBB", new Lobby());

        store(first);
        store(second);

        assertEquals(second.keySet(), load().keySet());
    }

    @Test
    public void anEmptyDatabaseLoadsNothing() throws Exception {
        assertNull(load());
    }

    @Test
    public void unsetOrUnwritablePathDisablesPersistence() {
        assertNull(SecretHitlerServer.getDatabaseConnection(null));
        assertNull(SecretHitlerServer.getDatabaseConnection(" "));
        assertNull(SecretHitlerServer.getDatabaseConnection(
                new File(tmp.getRoot(), "missing/dir/backup.db").getAbsolutePath()));
    }

    /**
     * The account store keeps its own connection to the backup file, so a backup waits for the
     * store's writes, as long as the store waits for its, instead of failing with SQLITE_BUSY.
     */
    @Test
    public void theBackupWaitsForTheAccountStoresWrites() throws Exception {
        try (Connection c = SecretHitlerServer.getDatabaseConnection(dbPath());
                Statement stmt = c.createStatement();
                ResultSet timeout = stmt.executeQuery("PRAGMA busy_timeout")) {
            assertTrue(timeout.next());
            assertEquals(5000, timeout.getInt(1));
        }
    }

    /**
     * backup-before-spectators.db was written by the release before spectators (d35fade): a lobby
     * in a game of five CPU players under "ABCD" and an empty one under "WXYZ". It has no account
     * maps, so the load keeps the idle lobby, which an account can join, and drops the game, whose
     * seats belong to typed names that no account can take back.
     */
    @Test
    public void aBackupFromBeforeAccountsKeepsIdleLobbies() throws Exception {
        try (InputStream fixture = getClass().getResourceAsStream("/backup-before-spectators.db")) {
            Files.copy(fixture, new File(dbPath()).toPath());
        }
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        ch.qos.logback.classic.Logger root = (ch.qos.logback.classic.Logger) LoggerFactory
                .getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        root.addAppender(appender);
        ConcurrentHashMap<String, Lobby> loaded;
        try {
            loaded = load();
        } finally {
            root.detachAppender(appender);
        }

        assertEquals(Set.of("WXYZ"), loaded.keySet());
        assertEquals(1, appender.list.stream().filter(
                e -> e.getFormattedMessage().equals("Dropped lobby ABCD: its game was backed up before accounts."))
                .count());
        Lobby idle = loaded.get("WXYZ");
        assertTrue(idle.wasBackedUpBeforeAccounts());
        assertFalse(idle.isInGame());
        assertEquals(0, idle.getSpectatorCount());
        assertNull(idle.joinRefusal("acct-Ann", null));
        FakeSocket ann = FakeSocket.open();
        idle.addUser(ann.ctx, "acct-Ann", "Ann");
        idle.sendStateToAll();
        assertTrue(ann.last().toString().contains("Ann"));
        assertEquals(1, idle.getUserCount());
    }

    /** A game seated by accounts and CPU players keeps each seat's account through a backup. */
    @Test
    public void seatsKeepTheirAccountsThroughABackup() throws Exception {
        Lobby lobby = new Lobby();
        FakeSocket ann = FakeSocket.open();
        FakeSocket bob = FakeSocket.open();
        lobby.addUser(ann.ctx, "acct-Ann", "Ann");
        lobby.trySetUserIcon("p1", ann.ctx);
        lobby.addUser(bob.ctx, "acct-Bob", "Bob");
        lobby.trySetUserIcon("p2", bob.ctx);
        lobby.startNewGame();
        Map<String, String> before = lobby.seatAccounts();
        assertEquals(Map.of("Ann", "acct-Ann", "Bob", "acct-Bob"), before);

        store(new ConcurrentHashMap<>(Map.of("ABCD", lobby)));
        Lobby restored = load().get("ABCD");

        assertTrue(restored.isInGame());
        assertFalse(restored.wasBackedUpBeforeAccounts());
        assertEquals(before, restored.seatAccounts());
        assertEquals(lobby.game().getPlayerList().size(), restored.game().getPlayerList().size());
    }

    /////// The game's timeline through a backup

    /** A lobby whose game has just started, seated by accounts {@code acct-<name>}. */
    private static Lobby lobbyInGame(Map<String, FakeSocket> sockets, String... names) {
        Lobby lobby = new Lobby();
        int icon = 1;
        for (String name : names) {
            FakeSocket socket = FakeSocket.open();
            lobby.addUser(socket.ctx, "acct-" + name, name);
            lobby.trySetUserIcon("p" + icon++, socket.ctx);
            sockets.put(name, socket);
        }
        lobby.startNewGame();
        return lobby;
    }

    private static void update(Lobby lobby) {
        synchronized (lobby) {
            lobby.updateAllUsers();
        }
    }

    /** The lobby, stored as "ABCD" in the backup file and loaded back. */
    private Lobby roundTrip(Lobby lobby) throws Exception {
        store(new ConcurrentHashMap<>(Map.of("ABCD", lobby)));
        return load().get("ABCD");
    }

    /** Plays the lobby's game to its end, a second a move, sending the state after every move. */
    private void playOut(Lobby lobby) {
        GameDriver.playOut(lobby.game(), g -> {
            clock.addAndGet(1_000);
            update(lobby);
        });
    }

    private static List<String> types(List<Map<String, Object>> events) {
        return events.stream().map(e -> (String) e.get("type")).collect(Collectors.toList());
    }

    private static String json(Object value) throws Exception {
        return new ObjectMapper().writeValueAsString(value);
    }

    private static int indexOfSeat(SecretHitlerGame game, String name) {
        List<Player> seats = game.getPlayerList();
        for (int i = 0; i < seats.size(); i++) {
            if (seats.get(i).getUsername().equals(name)) {
                return i;
            }
        }
        throw new IllegalArgumentException(name);
    }

    /** A legal chancellor for a new game's first nomination: the seat after the president. */
    private static String firstNominee(SecretHitlerGame game) {
        List<Player> seats = game.getPlayerList();
        return seats.get((indexOfSeat(game, game.getCurrentPresident()) + 1) % seats.size()).getUsername();
    }

    @Test
    public void aGameRestoredMidGameKeepsItsTimeline() throws Exception {
        Lobby lobby = lobbyInGame(new ConcurrentHashMap<>(), "P1", "P2", "P3", "P4", "P5");
        String id = lobby.gameId();
        GameDriver.playUntil(lobby.game(), GameState.LEGISLATIVE_CHANCELLOR, g -> {
            clock.addAndGet(1_000);
            update(lobby);
        });
        List<Map<String, Object>> atBackup = lobby.timeline();
        int round = lobby.game().getRound();

        Lobby restored = roundTrip(lobby);
        SecretHitlerGame game = restored.game();
        playOut(restored);

        assertEquals(1, records.size());
        GameRecord record = records.get(0);
        assertEquals(id, record.id());
        assertEquals(1_000_000L, record.startedAt());
        assertTrue(record.complete());
        List<String> types = types(record.events());
        assertEquals(1, Collections.frequency(types, "restored"));
        int at = types.indexOf("restored");
        assertEquals(json(atBackup), json(record.events().subList(0, at)));
        assertEquals(round, record.events().get(at).get("r"));
        assertEquals(TimelineReplay.of(game), TimelineReplay.replay(record.events(), TimelineReplay.roles(game)));
    }

    @Test
    public void theFirstMoveAfterARestoreIsRecorded() throws Exception {
        Lobby restored = roundTrip(lobbyInGame(new ConcurrentHashMap<>(), "P1", "P2", "P3", "P4", "P5"));
        synchronized (restored) {
            SecretHitlerGame game = restored.game();
            game.nominateChancellor(firstNominee(game));
            restored.updateAllUsers();
        }
        assertEquals(List.of("restored", "nominate"), types(restored.timeline()));
    }

    @Test
    public void twoRestartsAddTwoRestoredEvents() throws Exception {
        Lobby lobby = lobbyInGame(new ConcurrentHashMap<>(), "P1", "P2", "P3", "P4", "P5");
        String id = lobby.gameId();
        clock.set(1_030_000L);
        Lobby once = roundTrip(lobby);
        clock.set(1_060_000L);
        Lobby twice = roundTrip(once);
        assertEquals(id, twice.gameId());
        SecretHitlerGame game = twice.game();
        playOut(twice);

        assertEquals(1, records.size());
        GameRecord record = records.get(0);
        assertEquals(id, record.id());
        assertEquals(1_000_000L, record.startedAt());
        assertTrue(record.complete());
        assertEquals(List.of(30_000L, 60_000L), record.events().stream()
                .filter(e -> e.get("type").equals("restored")).map(e -> e.get("t")).collect(Collectors.toList()));
        assertEquals(TimelineReplay.of(game), TimelineReplay.replay(record.events(), TimelineReplay.roles(game)));
    }

    /**
     * backup-before-recorder.db was written by the release before the recorder (9e53f75): a lobby
     * "ABCD" in a game that has just started, seated by acct-Ann (portrait p1), acct-Bob (p2) and
     * three CPU players, which had timed out when it was written. Its lobby has no timeline, so
     * the game gets an ID and a start at the restore, and its record is incomplete.
     */
    @Test
    public void aGameFromBeforeTheRecorderIsIncomplete() throws Exception {
        try (InputStream fixture = getClass().getResourceAsStream("/backup-before-recorder.db")) {
            Files.copy(fixture, new File(dbPath()).toPath());
        }
        Lobby lobby = load().get("ABCD");
        assertTrue(lobby.isInGame());
        String id = lobby.gameId();
        assertNotNull(id);
        assertEquals("[{\"type\":\"restored\",\"t\":0,\"r\":1}]", json(lobby.timeline()));
        assertEquals(Map.of("Ann", "acct-Ann", "Bob", "acct-Bob"), lobby.seatAccounts());

        clock.set(1_060_000L);
        Lobby again = roundTrip(lobby);
        assertEquals(id, again.gameId());
        assertEquals("[{\"type\":\"restored\",\"t\":0,\"r\":1},{\"type\":\"restored\",\"t\":60000,\"r\":1}]",
                json(again.timeline()));

        assertTrue(again.closeIfTimedOut());
        assertEquals(1, records.size());
        assertFalse(records.get(0).complete());
        assertEquals(1_000_000L, records.get(0).startedAt());
        assertEquals(id, records.get(0).id());
    }

    /**
     * A bot backed up before bots had levels (the recorder's old fixture: a game with three bots)
     * comes back Normal and plays on.
     */
    @Test
    @SuppressWarnings("unchecked")
    public void aBotFromBeforeLevelsPlaysNormal() throws Exception {
        try (InputStream fixture = getClass().getResourceAsStream("/backup-before-recorder.db")) {
            Files.copy(fixture, new File(dbPath()).toPath());
        }
        Lobby lobby = load().get("ABCD");
        Field field = Lobby.class.getDeclaredField("cpuPlayers");
        field.setAccessible(true);
        Set<CpuPlayer> bots = (Set<CpuPlayer>) field.get(lobby);

        assertEquals(3, bots.size());
        for (CpuPlayer bot : bots) {
            assertEquals(bot.myName, BotSkill.NORMAL, bot.skill());
        }
        CpuTurn.step(lobby.game(), bots, () -> {
        });
    }

    /**
     * The END TERM countdown changes the game without going through {@code game()}: after a
     * restore that only a spectator has seen, its end of the term is still recorded.
     */
    @Test
    public void theCountdownsEndOfATermAfterARestoreIsRecorded() throws Exception {
        Lobby lobby = lobbyInGame(new ConcurrentHashMap<>(), "P1", "P2", "P3", "P4", "P5");
        GameDriver.playUntil(lobby.game(), GameState.POST_LEGISLATIVE, g -> update(lobby));
        int round = lobby.game().getRound();
        int president = indexOfSeat(lobby.game(), lobby.game().getCurrentPresident());
        Lobby.END_TERM_TIMER_IN_SEC = 0.2f;
        Lobby restored = roundTrip(lobby);

        FakeSocket spectator = FakeSocket.open();
        synchronized (restored) { // as a spectator's join does: its packet starts the countdown
            restored.addSpectator(spectator.ctx);
            restored.sendStateToAll();
        }
        long deadline = System.currentTimeMillis() + 5_000;
        while (true) {
            synchronized (restored) {
                if (spectator.last().getString("state").equals("CHANCELLOR_NOMINATION")) {
                    break;
                }
            }
            assertTrue("the countdown ended the term", System.currentTimeMillis() < deadline);
            Thread.sleep(20);
        }

        List<Map<String, Object>> timeline = restored.timeline();
        assertEquals(List.of("restored", "endTerm"), types(timeline.subList(timeline.size() - 2, timeline.size())));
        Map<String, Object> endTerm = timeline.get(timeline.size() - 1);
        assertEquals("countdown", endTerm.get("by"));
        assertEquals(president, endTerm.get("seat"));
        assertEquals(round, endTerm.get("r"));
    }

    /**
     * A restore changes a game's timeline (a restored event, and for a game from before the
     * recorder its ID and start), so the next 60 s tick stores it even if nobody comes back first.
     */
    @Test
    public void aRestoredGameMarksTheBackupStale() throws Exception {
        store(new ConcurrentHashMap<>(Map.of("WXYZ", new Lobby())));
        ServerTesting.clearLobbiesChanged();
        load();
        assertFalse("an idle lobby comes back as it was", ServerTesting.lobbiesChanged());

        store(new ConcurrentHashMap<>(Map.of("ABCD", lobbyInGame(new ConcurrentHashMap<>(), "P1", "P2", "P3"))));
        ServerTesting.clearLobbiesChanged();
        load();
        assertTrue(ServerTesting.lobbiesChanged());
    }

    @Test
    public void aSeatsFirstReturnAfterARestoreIsNoReconnect() throws Exception {
        Map<String, FakeSocket> sockets = new ConcurrentHashMap<>();
        Lobby lobby = lobbyInGame(sockets, "P1", "P2", "P3", "P4", "P5");
        synchronized (lobby) {
            lobby.removeUser(sockets.get("P2").ctx);
            lobby.updateAllUsers();
        }
        assertEquals(List.of("disconnect"), types(lobby.timeline()));

        Lobby restored = roundTrip(lobby);
        FakeSocket back = FakeSocket.open();
        restored.addUser(back.ctx, "acct-P2", "P2");
        update(restored);

        assertEquals(List.of("disconnect", "restored"), types(restored.timeline()));
    }

    @Test
    public void aFinishedGameRestoredBeforeItsTickKeepsItsOutcome() throws Exception {
        Lobby.LOBBY_TIMEOUT_DURATION_IN_MIN = 0;
        Lobby lobby = new Lobby();
        lobby.startNewGame();
        GameDriver.stepCpus(lobby, g -> GameSnapshot.of(g).finished());
        assertTrue("the game is over but still the lobby's", lobby.isInGame());
        String outcome = GameSnapshot.outcomeOf(lobby.game().getState());

        Lobby restored = roundTrip(lobby);
        List<String> types = types(restored.timeline());
        assertEquals("end", types.get(types.size() - 1));
        assertFalse(types.contains("restored"));

        assertTrue(restored.closeIfTimedOut());
        assertEquals(1, records.size());
        assertEquals(outcome, records.get(0).outcome());
        assertEquals(1, Collections.frequency(types(records.get(0).events()), "end"));
    }

    /** storeLobbies holds no lock, so each lobby takes its own while it is written. */
    @Test
    public void theBackupTakesTheLobbysLock() throws Exception {
        Lobby lobby = new Lobby();
        lobby.startNewGame();
        CountDownLatch held = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        Thread holder = new Thread(() -> {
            synchronized (lobby) {
                held.countDown();
                try {
                    release.await();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        });
        holder.start();
        held.await();
        AtomicReference<Exception> failure = new AtomicReference<>();
        Thread backup = new Thread(() -> {
            try {
                store(new ConcurrentHashMap<>(Map.of("ABCD", lobby)));
            } catch (Exception e) {
                failure.set(e);
            }
        });
        backup.start();
        try {
            long deadline = System.currentTimeMillis() + 5_000;
            while (backup.getState() != Thread.State.BLOCKED) {
                assertTrue("the backup waits for the lobby's lock (" + backup.getState() + ")",
                        System.currentTimeMillis() < deadline);
                Thread.sleep(10);
            }
        } finally {
            release.countDown();
        }
        backup.join(5_000);
        holder.join(5_000);
        assertFalse(backup.isAlive());
        assertNull(failure.get());
        assertTrue(load().get("ABCD").isInGame());
    }

    /////// A finished game never comes back

    /**
     * A game whose record is saved but whose lobby was backed up before the game ended (a crash in
     * the minute after its end, or a database backup taken in it) comes back idle: its record stands.
     */
    @Test
    public void aRestoredGameThatHasARecordIsDropped() throws Exception {
        Lobby recorded = new Lobby();
        recorded.startNewGame();
        Lobby unrecorded = new Lobby();
        unrecorded.startNewGame();
        String recordedId = recorded.gameId();
        store(new ConcurrentHashMap<>(Map.of("ABCD", recorded, "EFGH", unrecorded)));
        ConcurrentHashMap<String, Lobby> loaded = load();
        try (TestStore games = new TestStore()) {
            games.save(TestRecords.record(recordedId, 2_000_000L, GameRecord.FASCIST_POLICIES, TestRecords.seats()));
            ServerTesting.clearLobbiesChanged();

            List<ILoggingEvent> log = ServerLog.during(() -> ServerTesting.dropRecordedGames(loaded, games));

            assertFalse(loaded.get("ABCD").isInGame());
            assertEquals(recordedId, loaded.get("ABCD").gameId());
            assertTrue(loaded.get("EFGH").isInGame());
            assertEquals(1, log.stream().filter(e -> e.getFormattedMessage()
                    .equals("Dropped the game in lobby ABCD: it has a record already.")).count());
            assertEquals(1, games.recordedIdsCalls.get());
            assertTrue("the next backup holds the lobby without its game", ServerTesting.lobbiesChanged());
            assertEquals(List.of(), records); // the dropped game hands over no record
        }
    }

    @Test
    public void theDropKeepsGamesWhenTheDatabaseFails() throws Exception {
        Lobby first = new Lobby();
        first.startNewGame();
        Lobby second = new Lobby();
        second.startNewGame();
        store(new ConcurrentHashMap<>(Map.of("ABCD", first, "EFGH", second)));
        ConcurrentHashMap<String, Lobby> loaded = load();
        try (TestStore games = new TestStore()) {
            games.failing = true;

            List<ILoggingEvent> log = ServerLog.during(() -> ServerTesting.dropRecordedGames(loaded, games));

            assertTrue(loaded.get("ABCD").isInGame());
            assertTrue(loaded.get("EFGH").isInGame());
            assertTrue(log.stream().anyMatch(e -> e.getLevel() == Level.ERROR && e.getFormattedMessage()
                    .equals("Could not read which restored games have a record: every restored game is kept.")));
        }
    }

    @Test
    public void aBackupHoldsNoRecorderClass() throws Exception {
        Lobby lobby = lobbyInGame(new ConcurrentHashMap<>(), "P1", "P2", "P3", "P4", "P5");
        GameDriver.playUntil(lobby.game(), GameState.LEGISLATIVE_CHANCELLOR, g -> update(lobby));
        assertFalse(lobby.timeline().isEmpty());
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ObjectOutputStream out = new ObjectOutputStream(bytes)) {
            out.writeObject(new ConcurrentHashMap<>(Map.of("ABCD", lobby)));
        }
        assertFalse(new String(bytes.toByteArray(), StandardCharsets.ISO_8859_1).contains("server.stats"));
    }
}
