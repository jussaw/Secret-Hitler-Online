package server;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import game.GameState;
import game.SecretHitlerGame;
import game.datastructures.Identity;
import game.datastructures.Player;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONObject;
import org.junit.Test;
import server.util.GameToJSONConverter;

public class SpectatorStateTest {
    /** Keys every game packet has, whatever the state (null fields are left out by org.json). */
    private static final Set<String> ALWAYS = Set.of("players", "playerOrder", "president", "state", "lastState",
            "electionTracker", "electionTrackerAdvanced", "lastPolicy", "drawSize", "discardSize",
            "fascistPolicies", "liberalPolicies", "userVotes", "vetoOccurred");
    /** Public keys that are left out while their value is null. */
    private static final Set<String> SOMETIMES = Set.of("chancellor", "lastPresident", "lastChancellor",
            "targetUser");

    /** The states a game passes through before it ends, apart from SETUP. */
    private static final EnumSet<GameState> PLAY_STATES = EnumSet.of(GameState.CHANCELLOR_NOMINATION,
            GameState.CHANCELLOR_VOTING, GameState.LEGISLATIVE_PRESIDENT, GameState.LEGISLATIVE_CHANCELLOR,
            GameState.LEGISLATIVE_PRESIDENT_VETO, GameState.PRESIDENTIAL_POWER_PEEK,
            GameState.PRESIDENTIAL_POWER_INVESTIGATE, GameState.PRESIDENTIAL_POWER_EXECUTION,
            GameState.PRESIDENTIAL_POWER_ELECTION, GameState.POST_LEGISLATIVE);

    /** The hand a player's packet carries in this state, if any. */
    private static Set<String> handKeys(GameState state) {
        switch (state) {
            case LEGISLATIVE_PRESIDENT:
                return Set.of("presidentChoices");
            case LEGISLATIVE_CHANCELLOR:
                return Set.of("chancellorChoices");
            case PRESIDENTIAL_POWER_PEEK:
                return Set.of("peek");
            default:
                return Set.of();
        }
    }

    @Test
    public void playerPacketsAreUnchanged() {
        GameDriver.play(10, game -> {
            Set<String> hand = handKeys(game.getState());
            for (Player player : game.getPlayerList()) {
                String name = player.getUsername();
                JSONObject packet = GameToJSONConverter.convert(game, name);
                String at = game.getState() + " for " + name;
                assertTrue("own role " + at, packet.getJSONObject("players").getJSONObject(name).has("id"));
                assertTrue("always-present keys " + at, packet.keySet().containsAll(ALWAYS));
                assertTrue("the hand " + at, packet.keySet().containsAll(hand));
                Set<String> extra = new HashSet<>(packet.keySet());
                extra.removeAll(ALWAYS);
                extra.removeAll(SOMETIMES);
                extra.removeAll(hand);
                assertEquals("unexpected keys " + at, Set.of(), extra);
            }
        });
    }

    @Test
    public void spectatorPacketsHoldNoSecretBeforeTheGameEnds() {
        EnumSet<GameState> seen = EnumSet.noneOf(GameState.class);
        EnumSet<GameState> withoutPeek = EnumSet.copyOf(PLAY_STATES);
        withoutPeek.remove(GameState.PRESIDENTIAL_POWER_PEEK);
        // Ten players get investigations, a special election and executions; five get the peek.
        for (int i = 0; i < 20 && !seen.containsAll(withoutPeek); i++) {
            GameDriver.play(10, game -> checkSpectatorPacket(game, seen));
        }
        for (int i = 0; i < 20 && !seen.contains(GameState.PRESIDENTIAL_POWER_PEEK); i++) {
            GameDriver.play(5, game -> checkSpectatorPacket(game, seen));
        }
        assertEquals("states scanned", PLAY_STATES, seen);
    }

    private static void checkSpectatorPacket(SecretHitlerGame game, Set<GameState> seen) {
        // First, as the server's first conversion after a move would be (see GameDriver.finished).
        JSONObject packet = GameToJSONConverter.convertForSpectator(game);
        GameState state = game.getState();
        if (game.hasGameFinished()) {
            return;
        }
        seen.add(state);
        assertEquals("secrets in the spectator packet in " + state, List.of(), Secrets.find(packet));
        // The scan looks for what players really get: the president's role and hand.
        JSONObject president = GameToJSONConverter.convert(game, game.getCurrentPresident());
        assertFalse("the president's packet holds a secret in " + state, Secrets.find(president).isEmpty());
        assertTrue("the president's hand in " + state, president.keySet().containsAll(handKeys(state)));
    }

    /** The packet as a client receives it (org.json keeps arrays as Java arrays until then). */
    private static JSONObject wire(JSONObject packet) {
        return new JSONObject(packet.toString());
    }

    @Test
    public void spectatorsSeeEveryRoleWhenTheGameEnds() {
        // The spectator packet built straight after the winning move, before anything settles the state.
        JSONObject[] last = new JSONObject[1];
        SecretHitlerGame game = GameDriver.play(10, g -> last[0] = GameToJSONConverter.convertForSpectator(g));
        JSONObject spectator = last[0];
        assertEquals("the final state", game.getState().toString(), spectator.getString("state"));
        assertTrue("the same as a player's packet",
                wire(spectator).similar(wire(GameToJSONConverter.convert(game, "P0"))));
        for (Player player : game.getPlayerList()) {
            String name = player.getUsername();
            assertEquals(name + "'s role", player.getIdentity().toString(),
                    spectator.getJSONObject("players").getJSONObject(name).getString("id"));
        }
    }

    @Test
    public void spectatorPacketKeepsEveryPublicField() {
        GameDriver.play(10, game -> {
            game.getState(); // settles a policy victory, so the check below sees it
            if (game.hasGameFinished()) {
                return;
            }
            String liberal = game.getPlayerList().stream()
                    .filter(p -> p.getIdentity() == Identity.LIBERAL).findFirst().get().getUsername();
            JSONObject expected = GameToJSONConverter.convert(game, liberal);
            expected.remove("presidentChoices");
            expected.remove("chancellorChoices");
            expected.remove("peek");
            JSONObject players = expected.getJSONObject("players");
            for (String name : players.keySet()) {
                players.getJSONObject(name).remove("id");
            }
            JSONObject spectator = GameToJSONConverter.convertForSpectator(game);
            assertTrue("public fields in " + game.getState() + ": " + spectator,
                    wire(expected).similar(wire(spectator)));
        });
    }
}
