package game;

import java.util.Collection;

/**
 * The one CPU tick: what {@code Lobby.updateAllUsers} runs on each tick and what the tests' all-bot
 * games ({@code CpuGames}, and through it the self-play run) play, so the three cannot drift apart.
 * The lobby's timer, its locking and its record keeping stay in the lobby.
 */
public final class CpuTurn {

    private CpuTurn() {
    }

    /**
     * Updates every CPU player, then lets each act in turn until one moves the game on. While an
     * election is open, a vote that leaves it open goes on to the next bot, so every bot votes in
     * the same step.
     *
     * @param game      the game the CPU players are seated in.
     * @param cpus      the game's CPU players, in name order (this does not sort them).
     * @param afterMove run after each move a CPU player makes, each vote included, before the next
     *                  bot acts.
     * @return true if the bots moved the game on; false if none acted, or every act was a vote and
     *         the election still waits for people.
     */
    public static boolean step(SecretHitlerGame game, Collection<CpuPlayer> cpus, Runnable afterMove) {
        for (CpuPlayer cpu : cpus) {
            cpu.update(game);
        }
        for (CpuPlayer cpu : cpus) {
            boolean voting = game.getState() == GameState.CHANCELLOR_VOTING;
            if (!cpu.act(game)) {
                continue;
            }
            afterMove.run();
            if (!voting || game.getState() != GameState.CHANCELLOR_VOTING) {
                return true;
            }
        }
        return false;
    }
}
