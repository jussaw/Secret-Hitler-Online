package server.stats;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/** A record's JSON (format 1): the spec's keys in order, and player numbers in place of accounts. */
public class GameRecordJsonTest {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Map<String, String> ANN_AND_BOB = Map.of("P0", "acct-Ann", "P1", "acct-Bob");
    private static final Map<String, Integer> NUMBERS = Map.of("acct-Ann", 3, "acct-Bob", 7);

    /** The JSON as ordered maps, keys in the order they were written. */
    private static LinkedHashMap<String, Object> parse(String json) throws Exception {
        return JSON.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {
        });
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Object value) {
        return (List<Map<String, Object>>) value;
    }

    @Test
    public void theJsonHasTheSpecsFieldsInOrder() throws Exception {
        GameRecord record = TestRecords.driven("game-1", ANN_AND_BOB);
        LinkedHashMap<String, Object> json = parse(record.toJson(NUMBERS));

        assertEquals(RecordFormat.RECORD_KEYS, new ArrayList<>(json.keySet()));
        assertEquals(1, json.get("format"));
        assertEquals("game-1", json.get("id"));
        assertEquals(record.outcome(), json.get("outcome"));
        assertEquals(record.winner(), json.get("winner"));
        assertEquals(true, json.get("hasCpu"));
        assertEquals(record.liberalPolicies(), json.get("liberalPolicies"));
        assertEquals(record.fascistPolicies(), json.get("fascistPolicies"));
        assertEquals(record.rounds(), json.get("rounds"));
        assertEquals(record.startedAt(), ((Number) json.get("startedAt")).longValue());
        assertEquals(record.endedAt(), ((Number) json.get("endedAt")).longValue());
        for (Map<String, Object> seat : list(json.get("seats"))) {
            assertEquals(RecordFormat.SEAT_KEYS, new ArrayList<>(seat.keySet()));
        }
        List<Map<String, Object>> events = list(json.get("events"));
        assertEquals(record.events().size(), events.size());
        assertFalse(events.isEmpty());
        for (Map<String, Object> event : events) {
            assertEquals(RecordFormat.expectedKeys(event), new ArrayList<>(event.keySet()));
        }
        assertEquals(JSON.writeValueAsString(record.events()), JSON.writeValueAsString(events));
    }

    @Test
    public void seatsCarryPlayerNumbersOnly() throws Exception {
        GameRecord record = TestRecords.driven("game-1", ANN_AND_BOB);
        String text = record.toJson(NUMBERS);
        List<Map<String, Object>> seats = list(parse(text).get("seats"));

        List<Object> players = new ArrayList<>();
        for (int i = 0; i < seats.size(); i++) {
            Map<String, Object> seat = seats.get(i);
            GameRecord.Seat recorded = record.seats().get(i);
            players.add(seat.get("player"));
            assertEquals(recorded.name(), seat.get("name"));
            assertEquals(recorded.cpu(), seat.get("cpu"));
            assertEquals(recorded.role(), seat.get("role"));
            assertEquals(recorded.alive(), seat.get("alive"));
            if (recorded.accountId() == null) {
                assertNull(seat.get("player"));
            } else {
                assertEquals(NUMBERS.get(recorded.accountId()), seat.get("player"));
            }
        }
        assertTrue(players.contains(3));
        assertTrue(players.contains(7));
        assertEquals(3, players.stream().filter(p -> p == null).count());
        assertFalse(text.contains("acct-"));
    }

    @Test
    public void winnerFollowsTheOutcome() throws Exception {
        Map<String, String> winners = new LinkedHashMap<>();
        winners.put(GameRecord.LIBERAL_POLICIES, "LIBERAL");
        winners.put(GameRecord.HITLER_EXECUTED, "LIBERAL");
        winners.put(GameRecord.FASCIST_POLICIES, "FASCIST");
        winners.put(GameRecord.HITLER_ELECTED, "FASCIST");
        winners.put(GameRecord.UNFINISHED, null);
        for (Map.Entry<String, String> entry : winners.entrySet()) {
            GameRecord record = TestRecords.record("g", 2_000_000L, entry.getKey(), TestRecords.seats("acct-Ann"));
            LinkedHashMap<String, Object> json = parse(record.toJson(Map.of("acct-Ann", 1)));
            assertTrue(entry.getKey(), json.containsKey("winner"));
            assertEquals(entry.getKey(), entry.getValue(), json.get("winner"));
        }
    }

    @Test(expected = IllegalArgumentException.class)
    public void aHumanSeatWithNoNumberIsRefused() {
        TestRecords.record("g", 2_000_000L, GameRecord.UNFINISHED, TestRecords.seats("acct-Ann", "acct-Bob"))
                .toJson(Map.of("acct-Ann", 1));
    }
}
