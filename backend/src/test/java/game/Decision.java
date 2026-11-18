package game;

import game.datastructures.Policy;
import java.util.List;

/** A bot's move as a line of text, read from the game after it acted, for the bot tests. */
final class Decision {

    private Decision() {
    }

    /** A card's letter: {@code F} or {@code L}. */
    static String letter(Policy.Type type) {
        return type == Policy.Type.FASCIST ? "F" : "L";
    }

    /** Cards as letters, in order: {@code FFL}. */
    static String letters(List<Policy> cards) {
        StringBuilder out = new StringBuilder();
        for (Policy card : cards) {
            out.append(letter(card.getType()));
        }
        return out.toString();
    }

    /**
     * What the bot did, by the state it acted in: {@code none} if it did not act;
     * {@code nominate <seat>}; {@code vote ja|nein}; {@code pass XY} (the chancellor's two cards);
     * {@code veto}, or {@code enact F|L}; {@code refuse veto} or {@code accept veto};
     * {@code investigate|elect|execute <seat>}; {@code peek}; {@code end term}.
     *
     * @param before the state the bot acted in.
     * @param acted  what its {@code act} returned.
     * @param after  the game after it acted.
     * @param bot    the bot's seat.
     */
    static String of(GameState before, boolean acted, SecretHitlerGame after, String bot) {
        if (!acted) {
            return "none";
        }
        switch (before) {
            case CHANCELLOR_NOMINATION:
                return "nominate " + after.getCurrentChancellor();
            case CHANCELLOR_VOTING:
                return "vote " + (after.getVotes().get(bot) ? "ja" : "nein");
            case LEGISLATIVE_PRESIDENT:
                return "pass " + letters(after.getChancellorLegislativeChoices());
            case LEGISLATIVE_CHANCELLOR:
                if (after.getState() == GameState.LEGISLATIVE_PRESIDENT_VETO) {
                    return "veto";
                }
                return "enact " + letter(after.getLastEnactedPolicy());
            case LEGISLATIVE_PRESIDENT_VETO:
                return after.getState() == GameState.LEGISLATIVE_CHANCELLOR ? "refuse veto" : "accept veto";
            case PRESIDENTIAL_POWER_INVESTIGATE:
                return "investigate " + after.getTarget();
            case PRESIDENTIAL_POWER_ELECTION:
                return "elect " + after.getTarget();
            case PRESIDENTIAL_POWER_EXECUTION:
                return "execute " + after.getTarget();
            case PRESIDENTIAL_POWER_PEEK:
                return "peek";
            case POST_LEGISLATIVE:
                return "end term";
            default:
                throw new IllegalArgumentException("A bot makes no decision in " + before + ".");
        }
    }
}
