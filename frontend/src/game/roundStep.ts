import { GameState, LobbyState } from "../types";

/** The four steps of a round, as the round tracker labels them. */
export enum RoundStep {
  NOMINATION = "NOMINATION",
  ELECTION = "ELECTION",
  LEGISLATIVE = "LEGISLATIVE SESSION",
  EXECUTIVE = "EXECUTIVE ACTION",
}

/** The steps in the order a round runs them. */
export const ROUND_STEPS: readonly RoundStep[] = [
  RoundStep.NOMINATION,
  RoundStep.ELECTION,
  RoundStep.LEGISLATIVE,
  RoundStep.EXECUTIVE,
];

/** The step a status line lights for this state; null keeps the previous step (SETUP, victory states). */
export function stepForState(
  game: Pick<GameState, "state" | "lastState">,
): RoundStep | null {
  switch (game.state) {
    case LobbyState.CHANCELLOR_NOMINATION:
      return RoundStep.NOMINATION;
    case LobbyState.CHANCELLOR_VOTING:
      return RoundStep.ELECTION;
    case LobbyState.LEGISLATIVE_PRESIDENT:
    case LobbyState.LEGISLATIVE_CHANCELLOR:
    case LobbyState.LEGISLATIVE_PRESIDENT_VETO:
      return RoundStep.LEGISLATIVE;
    case LobbyState.PP_PEEK:
    case LobbyState.PP_INVESTIGATE:
    case LobbyState.PP_EXECUTION:
    case LobbyState.PP_ELECTION:
      return RoundStep.EXECUTIVE;
    case LobbyState.POST_LEGISLATIVE:
      switch (game.lastState) {
        case LobbyState.PP_PEEK:
        case LobbyState.PP_INVESTIGATE:
        case LobbyState.PP_EXECUTION:
        case LobbyState.PP_ELECTION:
          return RoundStep.EXECUTIVE;
        case LobbyState.CHANCELLOR_VOTING:
        case LobbyState.CHANCELLOR_NOMINATION: // a third failed vote leaves lastState alone
          return RoundStep.ELECTION;
        default:
          return RoundStep.LEGISLATIVE;
      }
    default:
      return null;
  }
}

/** The spectator's "policy was enacted" line: ELECTION when the election tracker forced it. */
export function stepForPolicyLine(
  game: Pick<GameState, "electionTrackerAdvanced">,
): RoundStep {
  return game.electionTrackerAdvanced ? RoundStep.ELECTION : RoundStep.LEGISLATIVE;
}
