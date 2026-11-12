package server;

import game.GameState;
import game.SecretHitlerGame;
import game.datastructures.Player;
import game.datastructures.Policy;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * Plays a whole game of SecretHitlerGame with fixed moves that pass fascist policies, so a game
 * goes through the powers, a failed election and a veto before it ends.
 */
public final class GameDriver {
    private static final int MAX_ACTIONS = 500;

    private final SecretHitlerGame game;
    private boolean firstElection = true;
    private boolean vetoed = false;

    private GameDriver(SecretHitlerGame game) {
        this.game = game;
    }

    /**
     * Plays one game of {@code players} players named "P0", "P1", ...
     *
     * @param onStep called with the game after it is created and after every action, before
     *               anything has asked for its state (see {@code finished}).
     * @return the finished game.
     */
    public static SecretHitlerGame play(int players, Consumer<SecretHitlerGame> onStep) {
        List<String> names = new ArrayList<>();
        for (int i = 0; i < players; i++) {
            names.add("P" + i);
        }
        GameDriver driver = new GameDriver(new SecretHitlerGame(names));
        onStep.accept(driver.game);
        for (int actions = 0; !finished(driver.game); actions++) {
            if (actions == MAX_ACTIONS) {
                throw new IllegalStateException("The game did not end after " + MAX_ACTIONS + " actions.");
            }
            driver.act();
            onStep.accept(driver.game);
        }
        return driver.game;
    }

    /**
     * A policy victory only shows in {@code hasGameFinished()} once {@code getState()} has
     * noticed it, so this asks for the state first. {@code onStep} sees the game before that.
     */
    private static boolean finished(SecretHitlerGame game) {
        game.getState();
        return game.hasGameFinished();
    }

    /** Makes the move the current state asks for (voting: every living player votes). */
    private void act() {
        String president = game.getCurrentPresident();
        switch (game.getState()) {
            case CHANCELLOR_NOMINATION:
                game.nominateChancellor(nominee(president));
                break;
            case CHANCELLOR_VOTING:
                boolean vote = !firstElection;
                firstElection = false;
                for (Player player : game.getPlayerList()) {
                    if (player.isAlive() && game.getState() == GameState.CHANCELLOR_VOTING) {
                        game.registerVote(player.getUsername(), vote);
                    }
                }
                break;
            case LEGISLATIVE_PRESIDENT:
                game.presidentDiscardPolicy(indexOf(game.getPresidentLegislativeChoices(), Policy.Type.LIBERAL));
                break;
            case LEGISLATIVE_CHANCELLOR:
                if (game.getNumFascistPolicies() == 5 && !vetoed && !game.didVetoOccurThisTurn()) {
                    vetoed = true;
                    game.chancellorVeto();
                } else {
                    game.chancellorEnactPolicy(indexOf(game.getChancellorLegislativeChoices(), Policy.Type.FASCIST));
                }
                break;
            case LEGISLATIVE_PRESIDENT_VETO:
                game.presidentialVeto(true);
                break;
            case PRESIDENTIAL_POWER_PEEK:
                game.endPeek();
                break;
            case PRESIDENTIAL_POWER_INVESTIGATE:
                game.investigatePlayer(target(president, false, true));
                break;
            case PRESIDENTIAL_POWER_ELECTION:
                game.electNextPresident(target(president, false, false));
                break;
            case PRESIDENTIAL_POWER_EXECUTION:
                game.executePlayer(target(president, true, false));
                break;
            case POST_LEGISLATIVE:
                game.endPresidentialTerm();
                break;
            default:
                throw new IllegalStateException("No move for state " + game.getState());
        }
    }

    /** The first living player after the president who may be chancellor (not Hitler after 3 fascist policies). */
    private String nominee(String president) {
        List<Player> players = game.getPlayerList();
        int start = indexOfPlayer(president);
        for (int step = 1; step < players.size(); step++) {
            Player candidate = players.get((start + step) % players.size());
            String name = candidate.getUsername();
            boolean termLimited = name.equals(game.getLastChancellor())
                    || (name.equals(game.getLastPresident()) && game.getLivingPlayerCount() > 5);
            boolean hitlerWouldWin = candidate.isHitler() && game.getNumFascistPolicies() >= 3;
            if (candidate.isAlive() && !termLimited && !hitlerWouldWin) {
                return name;
            }
        }
        throw new IllegalStateException("Nobody can be nominated.");
    }

    /** The first living player who is not the president (and not Hitler, and not investigated, if asked). */
    private String target(String president, boolean notHitler, boolean notInvestigated) {
        for (Player player : game.getPlayerList()) {
            if (player.isAlive() && !player.getUsername().equals(president)
                    && !(notHitler && player.isHitler())
                    && !(notInvestigated && player.hasBeenInvestigated())) {
                return player.getUsername();
            }
        }
        throw new IllegalStateException("No player can be targeted.");
    }

    private int indexOfPlayer(String name) {
        List<Player> players = game.getPlayerList();
        for (int i = 0; i < players.size(); i++) {
            if (players.get(i).getUsername().equals(name)) {
                return i;
            }
        }
        throw new IllegalArgumentException(name);
    }

    private static int indexOf(List<Policy> policies, Policy.Type type) {
        for (int i = 0; i < policies.size(); i++) {
            if (policies.get(i).getType() == type) {
                return i;
            }
        }
        return 0;
    }
}
