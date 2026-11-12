import { GameState, LobbyState } from "../types";
import type { SoundName } from "./SoundManager";

/**
 * Which queued animation a sound waits for, so it plays as that animation starts (App.tsx):
 * - now: on arrival, because the queue can be held by the player's own prompt
 * - start: the role reveal; votes: the tally line in showVotes; tracker: the election tracker
 *   alert; policy: the policy-enacted alert; phase: the new phase's event bar or status line;
 *   prompt: the local player's prompt (or END TERM's status line); result: the investigation or
 *   execution results; end: the victory prompt
 */
export type Cue = "now" | "start" | "votes" | "tracker" | "policy" | "phase" | "prompt" | "result" | "end";

export const SOUND_CUES: Record<SoundName, Cue> = {
  playerJoined: "now",
  voteCast: "now",
  gameStart: "start",
  votePassed: "votes",
  voteFailed: "votes",
  trackerAdvance: "tracker",
  policyLiberal: "policy",
  policyFascist: "policy",
  nominate: "phase",
  cardDraw: "phase",
  cardDiscard: "phase",
  veto: "phase",
  power: "phase",
  yourTurn: "prompt",
  investigate: "result",
  execution: "result",
  victory: "end",
  defeat: "end",
};

/** The states in which App shows enacted policies and tracker moves; keep in step with App.tsx. */
const POLICY_STATES = [
  LobbyState.POST_LEGISLATIVE,
  LobbyState.PP_INVESTIGATE,
  LobbyState.PP_EXECUTION,
  LobbyState.PP_ELECTION,
  LobbyState.PP_PEEK,
  LobbyState.FASCIST_VICTORY_POLICY,
  LobbyState.LIBERAL_VICTORY_POLICY,
];
const POWER_STATES = [
  LobbyState.PP_PEEK,
  LobbyState.PP_INVESTIGATE,
  LobbyState.PP_EXECUTION,
  LobbyState.PP_ELECTION,
];
const FASCIST_VICTORIES = [LobbyState.FASCIST_VICTORY_POLICY, LobbyState.FASCIST_VICTORY_ELECTION];
const VICTORY_STATES = [
  ...FASCIST_VICTORIES,
  LobbyState.LIBERAL_VICTORY_POLICY,
  LobbyState.LIBERAL_VICTORY_EXECUTION,
];
/** States in which the president alone must act (POST_LEGISLATIVE: END TERM). */
const PRESIDENT_ACTS = [
  LobbyState.CHANCELLOR_NOMINATION,
  LobbyState.LEGISLATIVE_PRESIDENT,
  LobbyState.LEGISLATIVE_PRESIDENT_VETO,
  ...POWER_STATES,
  LobbyState.POST_LEGISLATIVE,
];

/** Whether `user` is the one player the game is waiting for. Voting is everyone's, so never. */
function mustAct(game: GameState, user: string): boolean {
  if (!game.players[user]?.alive) return false;
  if (game.state === LobbyState.LEGISLATIVE_CHANCELLOR) return game.chancellor === user;
  return PRESIDENT_ACTS.includes(game.state) && game.president === user;
}

/**
 * The sounds a state change makes for `user`, in the order they play. `prev` is the last state
 * this socket delivered, the lobby (state SETUP), or undefined for the first packet on a new
 * socket, which plays nothing so that a reload or reconnect makes no burst of sounds.
 * A user who is not in playerOrder hears what everyone hears, and victory at the end.
 */
export function soundEvents(prev: GameState | undefined, next: GameState, user: string): SoundName[] {
  if (!prev) return [];
  const sounds: SoundName[] = [];
  const from = prev.state;
  const to = next.state;
  const changed = from !== to;

  if (from === LobbyState.CHANCELLOR_VOTING) {
    if (Object.keys(next.userVotes).length > Object.keys(prev.userVotes).length) {
      sounds.push("voteCast");
    }
    if (to === LobbyState.LEGISLATIVE_PRESIDENT || to === LobbyState.FASCIST_VICTORY_ELECTION) {
      sounds.push("votePassed");
    } else if (changed) {
      sounds.push("voteFailed");
    }
  }

  if (POLICY_STATES.includes(to)) {
    // The same test App uses for the election tracker alert.
    const trackerMoved = next.electionTracker !== prev.electionTracker;
    if (trackerMoved && (next.electionTracker !== 0 || next.electionTrackerAdvanced)) {
      sounds.push("trackerAdvance");
    }
    if (next.liberalPolicies > prev.liberalPolicies) sounds.push("policyLiberal");
    if (next.fascistPolicies > prev.fascistPolicies) sounds.push("policyFascist");
  }

  if (from === LobbyState.SETUP && to !== LobbyState.SETUP) sounds.push("gameStart");
  if (from === LobbyState.CHANCELLOR_NOMINATION && to === LobbyState.CHANCELLOR_VOTING) {
    sounds.push("nominate");
  }
  if (changed && to === LobbyState.LEGISLATIVE_PRESIDENT) sounds.push("cardDraw");
  if (from === LobbyState.LEGISLATIVE_PRESIDENT && to === LobbyState.LEGISLATIVE_CHANCELLOR) {
    sounds.push("cardDiscard");
  }
  if (from === LobbyState.LEGISLATIVE_CHANCELLOR && to === LobbyState.LEGISLATIVE_PRESIDENT_VETO) {
    sounds.push("veto");
  }
  if (changed && POWER_STATES.includes(to)) sounds.push("power");
  // The president's own result arrives in its own packet, and App plays it with that alert.
  if (
    from === LobbyState.PP_INVESTIGATE &&
    to === LobbyState.POST_LEGISLATIVE &&
    user !== next.president
  ) {
    sounds.push("investigate");
  }
  if (
    from === LobbyState.PP_EXECUTION &&
    (to === LobbyState.POST_LEGISLATIVE || to === LobbyState.LIBERAL_VICTORY_EXECUTION)
  ) {
    sounds.push("execution");
  }

  if (changed && mustAct(next, user)) sounds.push("yourTurn");

  if (changed && VICTORY_STATES.includes(to)) {
    const role = next.players[user]?.id;
    const fascistsWon = FASCIST_VICTORIES.includes(to);
    const isFascist = role === "FASCIST" || role === "HITLER";
    sounds.push(role === undefined || isFascist === fascistsWon ? "victory" : "defeat");
  }
  return sounds;
}

/** playerJoined when the lobby gains a name; the first lobby packet on a socket plays nothing. */
export function lobbySounds(prev: string[] | undefined, next: string[]): SoundName[] {
  if (!prev) return [];
  return next.some((name) => !prev.includes(name)) ? ["playerJoined"] : [];
}
