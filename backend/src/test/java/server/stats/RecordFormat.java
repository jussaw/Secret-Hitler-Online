package server.stats;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Format 1 of a game record, as the spec's tables give it ("The record"): the record's keys, a
 * seat's keys and each event's keys, in order. Phase 14B checks the JSON it writes against these.
 */
public final class RecordFormat {
    private RecordFormat() {
    }

    /** A record's keys, in order. */
    public static final List<String> RECORD_KEYS = List.of("id", "format", "startedAt", "endedAt", "outcome",
            "winner", "complete", "hasCpu", "liberalPolicies", "fascistPolicies", "rounds", "seats", "events");

    /** A seat's keys, in order. */
    public static final List<String> SEAT_KEYS = List.of("player", "name", "cpu", "role", "alive");

    /** Each event type's own fields, after {@code type}, {@code t} and {@code r}, in order. */
    public static final Map<String, List<String>> EVENT_FIELDS = Map.ofEntries(
            Map.entry("nominate", List.of("president", "chancellor")),
            Map.entry("vote", List.of("seat", "ja")),
            Map.entry("election", List.of("passed", "ja", "nein")),
            Map.entry("tracker", List.of("value")),
            Map.entry("draw", List.of("seat", "cards")),
            Map.entry("discard", List.of("seat", "index", "card")),
            Map.entry("veto", List.of("seat")),
            Map.entry("vetoAnswer", List.of("seat", "accepted")),
            Map.entry("enact", List.of("policy", "by", "seat", "liberal", "fascist")),
            Map.entry("reshuffle", List.of("drawPile")),
            Map.entry("peek", List.of("seat", "cards")),
            Map.entry("investigate", List.of("seat", "target", "result")),
            Map.entry("execute", List.of("seat", "target", "role")),
            Map.entry("specialElection", List.of("seat", "target")),
            Map.entry("endTerm", List.of("seat", "by")),
            Map.entry("timerPause", List.of("seat")),
            Map.entry("timerResume", List.of("seat")),
            Map.entry("disconnect", List.of("seat")),
            Map.entry("reconnect", List.of("seat")),
            Map.entry("restored", List.of()),
            Map.entry("end", List.of("outcome")));

    /**
     * The keys an event of its {@code type} has, in order: {@code type}, {@code t}, {@code r},
     * then its own fields. A chaos {@code enact} has no {@code seat}.
     *
     * @throws IllegalArgumentException for a type the format does not have.
     */
    public static List<String> expectedKeys(Map<String, Object> event) {
        Object type = event.get("type");
        List<String> fields = EVENT_FIELDS.get(type);
        if (fields == null) {
            throw new IllegalArgumentException("No event type " + type + ".");
        }
        List<String> keys = new ArrayList<>(List.of("type", "t", "r"));
        keys.addAll(fields);
        if (type.equals("enact") && "chaos".equals(event.get("by"))) {
            keys.remove("seat");
        }
        return keys;
    }
}
