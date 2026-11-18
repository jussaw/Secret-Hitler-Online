package server.stats;

import com.fasterxml.jackson.databind.ObjectMapper;
import game.BotSkill;
import game.SecretHitlerGame;
import game.datastructures.Player;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;
import server.accounts.AccountStore;

/**
 * Makes the stats pages' contract fixture ({@code ./gradlew recordedGamesFixture}): games played
 * by CPU players in every seat, recorded as if twelve accounts held the seats, and the response
 * {@code GET /api/stats/games} would give for them. The games cannot be seeded
 * ({@code SecretHitlerGame} shuffles with its own randomness), so every run makes a new file:
 * regenerate it after a change to the record's format, and commit it with the change.
 *
 * <p>62 games or more: ten finished games at each size from 5 to 10, then two cut off once round
 * 5 begins (5 and 10 seats), recorded {@code UNFINISHED}; then, if an outcome is missing, more
 * games until each of the four has been seen. Game {@code k} seats the accounts in turn from
 * account {@code k mod 12}, but when {@code k mod 6 == 5} its last two seats stay CPU players',
 * recorded at Easy, Normal and Hard in turn ({@code BotSkill.values()[(k / 6) % 3]}). The levels
 * are labels, as the accounts are: {@code CpuGames} plays every seat with Normal bots.
 * It starts at 2026-11-01 19:00 UTC, plus three days for every four games, plus 50 minutes for
 * each game before it that day, and each move takes 2 to 20 s.
 */
public final class RecordedGamesFixture {
    private static final long FIRST_START = 1_793_559_600_000L; // 2026-11-01 19:00 UTC
    private static final long DAY_MS = 24L * 60 * 60 * 1000;
    private static final long GAP_MS = 50L * 60 * 1000;
    private static final List<String> NAMES = List.of("Ada", "Bea", "Cyrus", "Dov", "Esme", "Finnegan", "Gus",
            "Hedda", "Ivo", "Juno", "Kit", "Maximilianus");
    private static final int FINISHED_PER_SIZE = 10;
    private static final int CUT_OFF_ROUND = 5;

    private static final List<String> OUTCOMES = List.of(GameRecord.LIBERAL_POLICIES, GameRecord.HITLER_EXECUTED,
            GameRecord.FASCIST_POLICIES, GameRecord.HITLER_ELECTED);

    private final Random random = new Random();
    private final AccountStore accounts = AccountStore.open(null);
    private final GameStore store = GameStore.open(null);
    private final List<String> accountIds = new ArrayList<>();
    private int nextGame;

    private RecordedGamesFixture() {
        for (int i = 0; i < NAMES.size(); i++) {
            String id = accounts.upsertTestAccount("fixture-" + (i + 1)).id();
            accounts.setUsername(id, NAMES.get(i));
            accountIds.add(id);
        }
    }

    /** Writes the fixture to {@code args[0]}, making its folder. */
    public static void main(String[] args) throws IOException {
        if (args.length != 1) {
            throw new IllegalArgumentException("Usage: RecordedGamesFixture <output file>");
        }
        File out = new File(args[0]);
        RecordedGamesFixture fixture = new RecordedGamesFixture();
        String json = fixture.make();
        File folder = out.getAbsoluteFile().getParentFile();
        if (!folder.isDirectory() && !folder.mkdirs()) {
            throw new IOException("Could not make " + folder + ".");
        }
        Files.writeString(out.toPath(), json, StandardCharsets.UTF_8);
        System.out.println("Wrote " + fixture.nextGame + " games to " + out + ".");
    }

    /** Plays and saves every game, and returns the response, pretty-printed, with a newline. */
    private String make() throws IOException {
        Set<String> outcomes = new HashSet<>();
        for (int size = 5; size <= 10; size++) {
            for (int i = 0; i < FINISHED_PER_SIZE; i++) {
                outcomes.add(save(finished(size)));
            }
        }
        save(cutOff(5));
        save(cutOff(10));
        Set<String> missing = new HashSet<>(OUTCOMES);
        missing.removeAll(outcomes);
        for (int size = 5; !missing.isEmpty(); size = size == 10 ? 5 : size + 1) {
            int k = nextGame;
            GameRecord record = finished(size);
            if (missing.remove(record.outcome())) {
                save(record);
            } else {
                nextGame = k; // played on to look for a missing outcome: not kept
            }
        }
        StatsRoutes routes = new StatsRoutes(store, id -> accounts.find(id).username());
        ObjectMapper json = new ObjectMapper();
        return json.writerWithDefaultPrettyPrinter().writeValueAsString(json.readTree(routes.body())) + "\n";
    }

    private String save(GameRecord record) {
        if (!store.save(record)) {
            throw new IllegalStateException("Game " + record.id() + " was saved twice.");
        }
        return record.outcome();
    }

    /** The clock of game {@code k}: its start, moved on 2 to 20 s every time it is read. */
    private AtomicLong clockOf(int k) {
        return new AtomicLong(FIRST_START + (k / 4) * 3 * DAY_MS + (k % 4) * GAP_MS);
    }

    private long move(AtomicLong clock) {
        return clock.addAndGet(2_000 + random.nextInt(18_001));
    }

    /** The next game, played to its end. */
    private GameRecord finished(int size) {
        int k = nextGame++;
        AtomicLong clock = clockOf(k);
        long startedAt = clock.get();
        CpuGames.Played played = CpuGames.play(size, () -> move(clock), startedAt, 0);
        long endedAt = startedAt + (Long) played.events().get(played.events().size() - 1).get("t");
        return record(k, played.game(), startedAt, endedAt, GameSnapshot.outcomeOf(played.game().getState()),
                played.events());
    }

    /** The next game, cut off once round 5 begins, as if its lobby timed out then. */
    private GameRecord cutOff(int size) {
        while (true) {
            int k = nextGame++;
            AtomicLong clock = clockOf(k);
            long startedAt = clock.get();
            CpuGames.Played played = CpuGames.play(size, () -> move(clock), startedAt, CUT_OFF_ROUND);
            if (GameSnapshot.of(played.game()).finished()) {
                nextGame = k; // it ended before round 5: play it again
                continue;
            }
            List<LinkedHashMap<String, Object>> events = new ArrayList<>(played.events());
            long t = move(clock) - startedAt;
            LinkedHashMap<String, Object> end = TimelineDiff.event("end", t, played.game().getRound());
            end.put("outcome", GameRecord.UNFINISHED);
            events.add(end);
            return record(k, played.game(), startedAt, startedAt + t, GameRecord.UNFINISHED, events);
        }
    }

    /**
     * Game {@code k}'s record, its seats held by accounts in turn from {@code k mod 12}, and its CPU
     * seats, if any, labelled with the level of their turn.
     */
    private GameRecord record(int k, SecretHitlerGame game, long startedAt, long endedAt, String outcome,
            List<? extends Map<String, Object>> events) {
        List<Player> players = game.getPlayerList();
        int cpuSeats = k % 6 == 5 ? 2 : 0;
        List<GameRecord.Seat> seats = new ArrayList<>();
        for (int i = 0; i < players.size(); i++) {
            Player player = players.get(i);
            String role = player.getIdentity().name();
            if (i >= players.size() - cpuSeats) {
                int bot = i - (players.size() - cpuSeats) + 1;
                seats.add(new GameRecord.Seat(null, "Bot " + bot, true, role, player.isAlive()));
            } else {
                int account = (k + i) % accountIds.size();
                seats.add(new GameRecord.Seat(accountIds.get(account), NAMES.get(account), false, role,
                        player.isAlive()));
            }
        }
        BotSkill botSkill = cpuSeats > 0 ? BotSkill.values()[(k / 6) % 3] : null;
        return new GameRecord(UUID.randomUUID().toString(), startedAt, endedAt, outcome, true, botSkill,
                game.getNumLiberalPolicies(), game.getNumFascistPolicies(), game.getRound(), seats,
                new ArrayList<>(events));
    }
}
