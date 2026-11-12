package server;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Finds the secrets a spectator must not receive before a game ends: a role, a hand, the peek
 * or an investigation result, at any depth of a packet.
 */
public final class Secrets {
    /** Keys that carry a secret: a role, the president's or chancellor's hand, the peek, a result. */
    public static final Set<String> KEYS = Set.of("id", "presidentChoices", "chancellorChoices", "peek",
            "investigation");

    private Secrets() {
    }

    /**
     * @param json a JSONObject or JSONArray (anything else holds no secret).
     * @return the path of each secret key (for example {@code players.Ann.id}) and of each string
     *         value {@code "HITLER"}, which can only be a role.
     */
    public static List<String> find(Object json) {
        List<String> found = new ArrayList<>();
        walk(json, "", found);
        return found;
    }

    private static void walk(Object value, String path, List<String> found) {
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            for (String key : object.keySet()) {
                String child = path.isEmpty() ? key : path + "." + key;
                if (KEYS.contains(key)) {
                    found.add(child);
                }
                walk(object.get(key), child, found);
            }
        } else if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            for (int i = 0; i < array.length(); i++) {
                walk(array.get(i), path + "[" + i + "]", found);
            }
        } else if ("HITLER".equals(value)) {
            found.add(path);
        }
    }
}
