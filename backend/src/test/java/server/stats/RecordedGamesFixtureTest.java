package server.stats;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.junit.BeforeClass;
import org.junit.Test;

/**
 * The stats pages' contract fixture ({@code frontend/src/stats/fixtures/recorded-games.json}, made
 * by {@code ./gradlew recordedGamesFixture}): the response, each record with its format's keys, as
 * {@code RecordFormat} gives them and {@code GameRecordJsonTest} holds the Java writer to, with
 * timelines that replay to their records' ends, every outcome, sizes 5 to 10, CPU seats, unfinished
 * games, and no account ID.
 */
public class RecordedGamesFixtureTest {
    private static final File FIXTURE = new File("../frontend/src/stats/fixtures/recorded-games.json");

    private static String text;
    private static LinkedHashMap<String, Object> fixture;

    @BeforeClass
    public static void read() throws Exception {
        text = Files.readString(FIXTURE.toPath(), StandardCharsets.UTF_8);
        fixture = new ObjectMapper().readValue(text, new TypeReference<LinkedHashMap<String, Object>>() {
        });
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Object value) {
        return (List<Map<String, Object>>) value;
    }

    private static List<Map<String, Object>> games() {
        return list(fixture.get("games"));
    }

    @Test
    public void everyRecordHasItsFormatsKeys() {
        assertEquals(List.of("players", "games"), new ArrayList<>(fixture.keySet()));
        for (Map<String, Object> player : list(fixture.get("players"))) {
            assertEquals(List.of("number", "name"), new ArrayList<>(player.keySet()));
        }
        assertFalse(games().isEmpty());
        for (Map<String, Object> game : games()) {
            assertEquals(RecordFormat.recordKeys((Integer) game.get("format")), new ArrayList<>(game.keySet()));
            for (Map<String, Object> seat : list(game.get("seats"))) {
                assertEquals(RecordFormat.SEAT_KEYS, new ArrayList<>(seat.keySet()));
            }
            for (Map<String, Object> event : list(game.get("events"))) {
                assertEquals(game.get("id") + ": " + event, RecordFormat.expectedKeys(event),
                        new ArrayList<>(event.keySet()));
            }
        }
    }

    @Test
    public void theFixtureIsInFormatTwo() {
        for (Map<String, Object> game : games()) {
            assertEquals(game.get("id") + "'s format", 2, game.get("format"));
            Object level = game.get("botSkill");
            assertTrue(game.get("id") + "'s level " + level, level == null || RecordFormat.BOT_SKILLS.contains(level));
        }
    }

    @Test
    public void everyFixtureGameReplays() {
        for (Map<String, Object> game : games()) {
            List<String> roles = new ArrayList<>();
            Set<Integer> dead = new TreeSet<>();
            List<Map<String, Object>> seats = list(game.get("seats"));
            for (int i = 0; i < seats.size(); i++) {
                roles.add((String) seats.get(i).get("role"));
                if (!(Boolean) seats.get(i).get("alive")) {
                    dead.add(i);
                }
            }
            // JSON gives a small t back as an Integer; the timeline keeps it as a Long.
            List<Map<String, Object>> events = new ArrayList<>();
            for (Map<String, Object> event : list(game.get("events"))) {
                LinkedHashMap<String, Object> copy = new LinkedHashMap<>(event);
                copy.put("t", ((Number) event.get("t")).longValue());
                events.add(copy);
            }
            TimelineReplay.Replayed replayed;
            try {
                replayed = TimelineReplay.replay(events, roles);
            } catch (AssertionError e) {
                throw new AssertionError("Game " + game.get("id") + ": " + e.getMessage(), e);
            }
            String what = "game " + game.get("id");
            assertEquals(what, game.get("liberalPolicies"), replayed.liberal());
            assertEquals(what, game.get("fascistPolicies"), replayed.fascist());
            assertEquals(what, dead, replayed.dead());
            assertEquals(what, game.get("outcome"), replayed.outcome());
        }
    }

    @Test
    public void theFixtureCoversTheStats() {
        Map<Integer, Integer> finishedBySize = new HashMap<>();
        Set<Object> outcomes = new HashSet<>();
        int unfinished = 0;
        boolean cpu = false;
        Set<Object> numbers = new HashSet<>();
        for (Map<String, Object> player : list(fixture.get("players"))) {
            numbers.add(player.get("number"));
        }
        long lastEnded = Long.MIN_VALUE;
        String lastId = "";
        Set<Object> levels = new HashSet<>();
        for (Map<String, Object> game : games()) {
            List<Map<String, Object>> seats = list(game.get("seats"));
            if (game.get("outcome").equals(GameRecord.UNFINISHED)) {
                unfinished++;
                assertTrue(game.containsKey("winner"));
                assertNull(game.get("winner"));
            } else {
                outcomes.add(game.get("outcome"));
                finishedBySize.merge(seats.size(), 1, Integer::sum);
            }
            for (Map<String, Object> seat : seats) {
                if ((Boolean) seat.get("cpu")) {
                    cpu = true;
                    assertNull(seat.get("player"));
                } else {
                    assertTrue("seat's player " + seat.get("player") + " is listed", numbers.contains(seat.get("player")));
                }
            }
            assertEquals(seats.stream().anyMatch(s -> (Boolean) s.get("cpu")), game.get("hasCpu"));
            assertEquals(game.get("id") + ": a level exactly when bots sat", game.get("hasCpu"),
                    game.get("botSkill") != null);
            if (game.get("botSkill") != null) {
                levels.add(game.get("botSkill"));
            }
            long ended = ((Number) game.get("endedAt")).longValue();
            String id = (String) game.get("id");
            assertTrue("oldest first", ended > lastEnded || (ended == lastEnded && id.compareTo(lastId) > 0));
            lastEnded = ended;
            lastId = id;
        }
        for (int size = 5; size <= 10; size++) {
            assertTrue("ten finished games of " + size, finishedBySize.getOrDefault(size, 0) >= 10);
        }
        assertEquals(Set.of(GameRecord.LIBERAL_POLICIES, GameRecord.HITLER_EXECUTED, GameRecord.FASCIST_POLICIES,
                GameRecord.HITLER_ELECTED), outcomes);
        assertEquals(2, unfinished);
        assertTrue("a game with CPU seats", cpu);
        assertEquals("Easy, Normal and Hard bots", Set.copyOf(RecordFormat.BOT_SKILLS), levels);
        assertTrue("a twelve-character name",
                list(fixture.get("players")).stream().anyMatch(p -> ((String) p.get("name")).length() == 12));
    }

    @Test
    public void theFixtureHoldsNoAccountId() {
        assertFalse(text.contains("test-"));
    }
}
