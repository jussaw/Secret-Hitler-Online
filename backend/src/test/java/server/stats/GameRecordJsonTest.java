package server.stats;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import game.BotSkill;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/**
 * A record's JSON (format 2): the spec's keys in order, the bots' level after {@code hasCpu}, and
 * player numbers in place of accounts.
 */
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
        assertEquals(2, json.get("format"));
        assertEquals("NORMAL", json.get("botSkill"));
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

    @Test
    public void eachLevelIsWrittenByItsName() throws Exception {
        for (BotSkill skill : BotSkill.values()) {
            GameRecord record = TestRecords.record("g", 2_000_000L, GameRecord.LIBERAL_POLICIES,
                    TestRecords.seats("acct-Ann"), skill);
            LinkedHashMap<String, Object> json = parse(record.toJson(Map.of("acct-Ann", 1)));
            assertEquals(skill.name(), json.get("botSkill"));
            assertEquals(true, json.get("hasCpu"));
        }
    }

    @Test
    public void aGameWithoutBotsWritesNull() throws Exception {
        GameRecord record = TestRecords.record("g", 2_000_000L, GameRecord.LIBERAL_POLICIES,
                TestRecords.seats("acct-1", "acct-2", "acct-3", "acct-4", "acct-5"), null);
        LinkedHashMap<String, Object> json = parse(record.toJson(
                Map.of("acct-1", 1, "acct-2", 2, "acct-3", 3, "acct-4", 4, "acct-5", 5)));
        assertTrue(json.containsKey("botSkill"));
        assertNull(json.get("botSkill"));
        assertEquals(false, json.get("hasCpu"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void botSeatsNeedALevel() {
        TestRecords.record("g", 2_000_000L, GameRecord.LIBERAL_POLICIES, TestRecords.seats("acct-Ann"), null);
    }

    @Test(expected = IllegalArgumentException.class)
    public void aLevelNeedsBotSeats() {
        TestRecords.record("g", 2_000_000L, GameRecord.LIBERAL_POLICIES,
                TestRecords.seats("acct-1", "acct-2", "acct-3", "acct-4", "acct-5"), BotSkill.HARD);
    }

    /** {@code of}, the lobby's way in, never throws for the level: nothing the recorder does stops a game. */
    @Test
    public void ofNeverRefusesALevel() {
        assertEquals(BotSkill.NORMAL, TestRecords.driven("g", ANN_AND_BOB, null).botSkill());
        Map<String, String> everyone = Map.of("P0", "acct-0", "P1", "acct-1", "P2", "acct-2", "P3", "acct-3",
                "P4", "acct-4");
        assertNull(TestRecords.driven("g", everyone, BotSkill.HARD).botSkill());
    }

    @Test
    public void theFormatKnowsBothKeyLists() {
        assertEquals(RecordFormat.FORMAT_1_KEYS, RecordFormat.recordKeys(1));
        assertFalse(RecordFormat.FORMAT_1_KEYS.contains("botSkill"));
        List<String> two = RecordFormat.recordKeys(2);
        assertEquals(RecordFormat.RECORD_KEYS, two);
        assertEquals(two.indexOf("hasCpu") + 1, two.indexOf("botSkill"));
        List<String> withoutLevel = new ArrayList<>(two);
        withoutLevel.remove("botSkill");
        assertEquals(RecordFormat.FORMAT_1_KEYS, withoutLevel);
        try {
            RecordFormat.recordKeys(3);
            fail("format 3 has no keys");
        } catch (IllegalArgumentException expected) {
        }
    }

    @Test
    public void theFormatsLevelsAreBotSkillsNames() {
        assertEquals(Arrays.stream(BotSkill.values()).map(Enum::name).toList(), RecordFormat.BOT_SKILLS);
    }

    @Test(expected = IllegalArgumentException.class)
    public void aHumanSeatWithNoNumberIsRefused() {
        TestRecords.record("g", 2_000_000L, GameRecord.UNFINISHED, TestRecords.seats("acct-Ann", "acct-Bob"))
                .toJson(Map.of("acct-Ann", 1));
    }
}
