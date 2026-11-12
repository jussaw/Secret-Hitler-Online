import { GameState, LobbyState } from "../types";

/**
 * Status lines for spectators, who get no prompts: what the table is waiting for, naming the
 * players, and in place of each alert a player would see, what happened. With twelve-character
 * names no line is longer than the longest status a player sees, so it fits the status bar's
 * two lines.
 */

const VICTORY_TEXT: Partial<Record<LobbyState, string>> = {
  [LobbyState.FASCIST_VICTORY_POLICY]: "Fascists successfully passed six policies!",
  [LobbyState.FASCIST_VICTORY_ELECTION]: "Fascists successfully elected Hitler as chancellor!",
  [LobbyState.LIBERAL_VICTORY_POLICY]: "Liberals successfully passed five policies!",
  [LobbyState.LIBERAL_VICTORY_EXECUTION]: "Liberals successfully executed Hitler!",
};

/** What the table is waiting for in this state ("" in the lobby). */
export function waitingText(game: GameState): string {
  const { president: p, chancellor: c } = game;
  switch (game.state) {
    case LobbyState.CHANCELLOR_NOMINATION:
      return `Waiting for ${p} to nominate a chancellor.`;
    case LobbyState.CHANCELLOR_VOTING:
      return `${p} nominated ${c}. Waiting for all players to vote.`;
    case LobbyState.LEGISLATIVE_PRESIDENT:
      return `Waiting for ${p} to choose a policy to discard.`;
    case LobbyState.LEGISLATIVE_CHANCELLOR:
      return `Waiting for ${c} to choose a policy to enact.`;
    case LobbyState.LEGISLATIVE_PRESIDENT_VETO:
      return `${c} has motioned to veto. Waiting for ${p} to decide.`;
    case LobbyState.PP_PEEK:
      return `Peek: ${p} is previewing the next 3 policies.`;
    case LobbyState.PP_INVESTIGATE:
      return `Investigation: ${p} is choosing a player to investigate.`;
    case LobbyState.PP_ELECTION:
      return `Special Election: ${p} is choosing the next president.`;
    case LobbyState.PP_EXECUTION:
      return `Execution: ${p} is choosing a player to execute.`;
    case LobbyState.POST_LEGISLATIVE:
      return `Waiting for ${p} to end their term.`;
    default:
      return VICTORY_TEXT[game.state] ?? "";
  }
}

/** In place of PolicyEnactedAlert: the policy just enacted (`lastPolicy`). */
export function policyText(game: GameState): string {
  return `A ${game.lastPolicy === "LIBERAL" ? "liberal" : "fascist"} policy was enacted.`;
}

/** In place of ElectionTrackerAlert: where the tracker moved, or that it reached 3. */
export function trackerText(game: GameState): string {
  if (game.electionTracker === 0 && game.electionTrackerAdvanced) {
    return "The election tracker reached 3. The top policy is enacted.";
  }
  return `The election tracker moves to ${game.electionTracker}.`;
}

/** In place of the result prompts: what the president's power did, or "" if nothing to tell. */
export function resultText(game: GameState): string {
  const { president: p, targetUser: t } = game;
  switch (game.lastState) {
    case LobbyState.PP_INVESTIGATE:
      return `${p} investigated ${t}.`;
    case LobbyState.PP_ELECTION:
      return `${p} chose ${t} to be the next president.`;
    case LobbyState.PP_EXECUTION:
      return `${p} executed ${t}.`;
    default:
      return "";
  }
}
