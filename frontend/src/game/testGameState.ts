import { GameState, LobbyState } from "../types";

/**
 * Builds a game state for tests: every player alive, uninvestigated and without a known role,
 * with portraits p1, p2, ... in order, and names[0] as president during chancellor nomination.
 */
export function makeGameState(
  names: string[],
  overrides: Partial<GameState> = {}
): GameState {
  return {
    state: LobbyState.CHANCELLOR_NOMINATION,
    lastState: LobbyState.SETUP,
    playerOrder: names,
    players: Object.fromEntries(
      names.map((name) => [name, { alive: true, investigated: false }])
    ),
    president: names[0],
    chancellor: "",
    lastChancellor: "",
    lastPresident: "",
    electionTracker: 0,
    electionTrackerAdvanced: false,
    userVotes: {},
    liberalPolicies: 0,
    fascistPolicies: 0,
    drawSize: 17,
    discardSize: 0,
    presidentChoices: [],
    chancellorChoices: [],
    targetUser: "",
    lastPolicy: "",
    vetoOccurred: false,
    peek: [],
    icon: Object.fromEntries(names.map((name, i) => [name, `p${i + 1}`])),
    ...overrides,
  };
}
