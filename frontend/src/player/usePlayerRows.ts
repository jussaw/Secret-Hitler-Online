import { useRef, useState } from "react";
import {
  PLAYER_IDENTITY,
  PARAM_CHANCELLOR,
  PARAM_STATE,
  STATE_CHANCELLOR_NOMINATION,
  STATE_LEGISLATIVE_PRESIDENT,
  STATE_LEGISLATIVE_PRESIDENT_VETO,
  STATE_PP_PEEK,
  STATE_PP_ELECTION,
  STATE_PP_EXECUTION,
  STATE_PP_INVESTIGATE,
  STATE_POST_LEGISLATIVE,
  STATE_LEGISLATIVE_CHANCELLOR,
  STATE_CHANCELLOR_VOTING,
} from "../constants";
import { GameState, Role } from "../types";
import { doesHitlerKnowFascists, isVictoryState } from "../utils";

// <editor-fold desc="Player Filters">

export const DISABLE_NONE = () => {
  return "";
};

/**
 * Filter to disable only executed players.
 * @param name the name of the player
 * @param gameState the current game state.
 * @return {string} "EXECUTED" if the player is not alive,
 *                  "" otherwise.
 */
export const DISABLE_EXECUTED_PLAYERS = (
  name: string,
  gameState: GameState
) => {
  if (!gameState.players[name].alive) {
    return "EXECUTED";
  }
  return "";
};

/**
 * Filter to disable executed and investigated players.
 * @param name the name of the player
 * @param gameState the current game state.
 * @return {string} "EXECUTED" if the player is not alive,
 *                  "INVESTIGATED" if the player has been investigated,
 *                  "" otherwise.
 */
export const DISABLE_INVESTIGATED_PLAYERS = (
  name: string,
  gameState: GameState
) => {
  if (!gameState.players[name].alive) {
    return "EXECUTED";
  } else if (gameState.players[name].investigated) {
    return "SEARCHED";
  }
  return "";
};

/**
 * Filter to disable executed and investigated players.
 * @param name the name of the player
 * @param gameState the current game state.
 * @return {string} "EXECUTED" if the player is not alive,
 *                  "TERM LIMITED" if the player is-term limited
 *                  (the last elected chancellor and, if >5 players, the last elected president.)
 *                  "" otherwise.
 */
export const DISABLE_TERM_LIMITED_PLAYERS = (
  name: string,
  gameState: GameState
) => {
  // Count number of living players
  let livingPlayers = 0;
  for (let playerIndex in gameState.playerOrder) {
    let playerName = gameState.playerOrder[playerIndex];
    if (gameState.players[playerName].alive) {
      livingPlayers++;
    }
  }

  if (!gameState.players[name].alive) {
    return "EXECUTED";
  } else if (gameState.lastChancellor === name) {
    return "TERM LIMITED";
  } else if (gameState.lastPresident === name && livingPlayers > 5) {
    return "TERM LIMITED";
  } else {
    return "";
  }
};

// </editor-fold>

export type PlayerDisplayProps = {
  user: string;
  gameState: GameState;
  players?: string[];
  playerDisabledFilter?: (playerName: string, gameState: GameState) => string;
  onSelection?: (playerName: string) => void;
  selection?: string;
  useAsButtons?: boolean;
  showVotes?: boolean;
  showLabels?: boolean;
  showRoles?: boolean;
  showBusy?: boolean;
  includeUser?: boolean;
};

const defaultProps: Partial<PlayerDisplayProps> = {
  playerDisabledFilter: DISABLE_EXECUTED_PLAYERS,
  useAsButtons: false,
  includeUser: true,
  showVotes: false,
  showRoles: false,
  showLabels: true,
  showBusy: false,
};

export type PlayerRow = {
  name: string;
  icon: string; // portrait key, gameState.icon[name]
  office: "PRESIDENT" | "CHANCELLOR" | "";
  isUser: boolean; // name === props.user
  busy: boolean; // in the busy set && !props.showVotes && props.showBusy
  showVote: boolean; // staged reveal reached this player && alive
  vote: boolean | undefined; // gameState.userVotes[name]
  role: Role | undefined; // only when shouldShowRole is true; otherwise undefined
  disabledText: string; // props.playerDisabledFilter(name, gameState), "" when enabled
};

/** Merges the caller's props over the defaults. */
export function withDefaultProps(inputProps: PlayerDisplayProps): Required<PlayerDisplayProps> {
  return { ...defaultProps, ...inputProps } as Required<PlayerDisplayProps>;
}

/**
 * One row of data per displayed player, in display order: office, busy status, staged vote reveal,
 * visible role and disabled text. Shared by the prompts' tiles and the game screen's roster.
 */
export function usePlayerRows(inputProps: PlayerDisplayProps): PlayerRow[] {
  const props = withDefaultProps(inputProps);

  const [isPlayingVoteAnimation, setIsPlayingVoteAnimation] = useState(false);
  // How many players' votes are visible so far, in player order. This allows the sequence to be animated.
  const [playerVotesVisible, setPlayerVotesVisible] = useState<number>(0);
  /** Timeouts for each player animation. Will be destroyed on reset. */
  const playerVoteAnimations = useRef<ReturnType<typeof setTimeout>[]>([]);

  /**
   * Returns an array representing the player order.
   * Removes the player if props.includeUser is false.
   */
  const getPlayerOrder = (): string[] => {
    let basePlayers;
    if (props.players === undefined) {
      basePlayers = props.gameState.playerOrder;
    } else {
      basePlayers = props.players;
    }

    if (!props.includeUser) {
      // Remove the user from the players.
      return basePlayers.filter((player) => player !== props.user);
    }
    return basePlayers;
  };

  /**
   * Returns a set of players that should be considered 'busy', which is shown
   * on the UI with a (...) ellipses bubble. A player is considered
   * busy if the game is waiting for some input from them.
   */
  const getBusyPlayerSet = (): Set<string> => {
    const game = props.gameState;
    const busyPlayers = new Set<string>([]);
    switch (game[PARAM_STATE]) {
      case STATE_CHANCELLOR_NOMINATION:
      case STATE_LEGISLATIVE_PRESIDENT:
      case STATE_LEGISLATIVE_PRESIDENT_VETO:
      case STATE_PP_PEEK:
      case STATE_PP_ELECTION:
      case STATE_PP_EXECUTION:
      case STATE_PP_INVESTIGATE:
      case STATE_POST_LEGISLATIVE:
        busyPlayers.add(game.president);
        break;
      case STATE_LEGISLATIVE_CHANCELLOR:
        busyPlayers.add(game[PARAM_CHANCELLOR]);
        break;
      case STATE_CHANCELLOR_VOTING:
        for (const name of getPlayerOrder()) {
          if (!game.userVotes.hasOwnProperty(name)) {
            // player has not voted (is not in the map of votes)
            busyPlayers.add(name);
          }
        }
        break;
      default: // This includes the victory states and setup.
        break;
    }
    // A player who is not alive is never busy.
    for (const name of [...busyPlayers]) {
      if (game.players[name]?.alive !== true) {
        busyPlayers.delete(name);
      }
    }
    return busyPlayers;
  };

  /**
   * @param gameState Current game state
   * @param playerName Name of player to view role for
   * @returns true if the role should be shown; false otherwise.
   */
  const shouldShowRole = (
    gameState: GameState,
    playerName: string
  ): boolean => {
    // A spectator is not among the players, and knows no role until the game is over.
    const myRole = gameState.players[props.user]?.id;
    const otherRole = gameState.players[playerName].id;

    if (otherRole === undefined) {
      return false;
    }
    if (isVictoryState(gameState.state)) {
      return true;
    }
    if (myRole === undefined) {
      return false; // a spectator sees roles only when the game is over
    }
    if (
      myRole === Role.FASCIST ||
      (myRole === Role.HITLER && doesHitlerKnowFascists(gameState))
    ) {
      // Hide liberal roles, because they can be redundant otherwise.
      return otherRole !== Role.LIBERAL;
    } else {
      return otherRole !== undefined;
    }
  };

  /**
   * Creates the voting animation sequence.
   */
  const setupVoteAnimation = () => {
    const durationMs = 1000;
    const playerOrder = getPlayerOrder();
    const numVotes = playerOrder.length;
    const timePerPlayerMs = durationMs / numVotes;

    setPlayerVotesVisible(0);
    playerVoteAnimations.current = playerOrder.map((_playerName, index) => {
      return setTimeout(() => {
        setPlayerVotesVisible(index + 1);
      }, (index + 1) * timePerPlayerMs);
    });
  };

  const resetVoteAnimation = () => {
    playerVoteAnimations.current.forEach((timeout) => {
      clearTimeout(timeout);
    });
    playerVoteAnimations.current = [];
    setPlayerVotesVisible(0);
  };

  if (props.showVotes && !isPlayingVoteAnimation) {
    setIsPlayingVoteAnimation(true);
    setupVoteAnimation();
  } else if (!props.showVotes && isPlayingVoteAnimation) {
    setIsPlayingVoteAnimation(false);
    resetVoteAnimation();
  }

  const players = props.gameState.players;
  const playerOrder = getPlayerOrder();
  const busyPlayers = getBusyPlayerSet();

  return playerOrder.map((name: string, index: number): PlayerRow => {
    let office: PlayerRow["office"] = "";
    if (name === props.gameState[PARAM_CHANCELLOR]) {
      office = "CHANCELLOR";
    } else if (name === props.gameState.president) {
      office = "PRESIDENT";
    }
    return {
      name,
      icon: props.gameState.icon[name],
      office,
      isUser: name === props.user,
      // Do not show while voting.
      busy: busyPlayers.has(name) && !props.showVotes && props.showBusy === true,
      // Skip votes for players that are not alive.
      showVote: index < playerVotesVisible && players[name].alive,
      vote: props.gameState.userVotes[name],
      role: shouldShowRole(props.gameState, name) ? players[name][PLAYER_IDENTITY] : undefined,
      disabledText: props.playerDisabledFilter(name, props.gameState),
    };
  });
}
