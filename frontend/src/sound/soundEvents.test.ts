import { describe, expect, test } from "vitest";
import { makeGameState } from "../game/testGameState";
import { GameState, LobbyState, type PlayerState, type Role } from "../types";
import { SOUND_NAMES, type SoundName } from "./SoundManager";
import { lobbySounds, SOUND_CUES, soundEvents } from "./soundEvents";

const NAMES = ["Ann", "Bob", "Cat", "Dan", "Eve"];
const S = LobbyState;
const LIBERAL = "LIBERAL" as Role;
const FASCIST = "FASCIST" as Role;
const HITLER = "HITLER" as Role;

const state = (overrides: Partial<GameState> = {}) => makeGameState(NAMES, overrides);

/** The first `cast` players have voted; the first `ja` of them voted yes. */
const votes = (ja: number, cast: number) =>
  Object.fromEntries(NAMES.slice(0, cast).map((name, i) => [name, i < ja]));

/** Every player alive and unknown, except for the changes given. */
const players = (changes: Record<string, Partial<PlayerState>>) =>
  Object.fromEntries(
    NAMES.map((name) => [name, { alive: true, investigated: false, ...changes[name] }])
  );

type Row = [string, Partial<GameState>, Partial<GameState>, string, SoundName[]];

const ROWS: Row[] = [
  ["the game starts", { state: S.SETUP }, { president: "Bob" }, "Ann", ["gameStart"]],
  ["the game starts with you as president", { state: S.SETUP }, { president: "Ann" }, "Ann", ["gameStart", "yourTurn"]],
  [
    "a chancellor is nominated",
    { president: "Bob" },
    { state: S.CHANCELLOR_VOTING, president: "Bob", chancellor: "Cat" },
    "Ann",
    ["nominate"],
  ],
  [
    "you nominate a chancellor (voting is nobody's turn)",
    { president: "Ann" },
    { state: S.CHANCELLOR_VOTING, president: "Ann", chancellor: "Cat" },
    "Ann",
    ["nominate"],
  ],
  [
    "a vote is cast",
    { state: S.CHANCELLOR_VOTING, president: "Bob", chancellor: "Cat" },
    { state: S.CHANCELLOR_VOTING, president: "Bob", chancellor: "Cat", userVotes: { Bob: true } },
    "Ann",
    ["voteCast"],
  ],
  [
    "the closing vote passes",
    { state: S.CHANCELLOR_VOTING, president: "Bob", userVotes: votes(3, 4) },
    { state: S.LEGISLATIVE_PRESIDENT, president: "Bob", userVotes: votes(3, 5) },
    "Ann",
    ["voteCast", "votePassed", "cardDraw"],
  ],
  [
    "the closing vote fails",
    { state: S.CHANCELLOR_VOTING, president: "Bob", userVotes: votes(2, 4) },
    {
      state: S.POST_LEGISLATIVE,
      president: "Bob",
      userVotes: votes(2, 5),
      electionTracker: 1,
      electionTrackerAdvanced: true,
    },
    "Ann",
    ["voteCast", "voteFailed", "trackerAdvance"],
  ],
  [
    "the third failed vote enacts the top policy",
    { state: S.CHANCELLOR_VOTING, president: "Bob", userVotes: votes(2, 4), electionTracker: 2 },
    {
      state: S.POST_LEGISLATIVE,
      president: "Bob",
      userVotes: votes(2, 5),
      electionTracker: 0,
      electionTrackerAdvanced: true,
      fascistPolicies: 1,
      lastPolicy: "FASCIST",
    },
    "Ann",
    ["voteCast", "voteFailed", "trackerAdvance", "policyFascist"],
  ],
  [
    "the tracker flag alone plays nothing",
    { state: S.POST_LEGISLATIVE, president: "Bob", electionTracker: 1, electionTrackerAdvanced: true },
    { state: S.CHANCELLOR_NOMINATION, president: "Cat", electionTracker: 1, electionTrackerAdvanced: true },
    "Ann",
    [],
  ],
  [
    "the president discards",
    { state: S.LEGISLATIVE_PRESIDENT, president: "Bob", chancellor: "Cat" },
    { state: S.LEGISLATIVE_CHANCELLOR, president: "Bob", chancellor: "Cat", discardSize: 1 },
    "Ann",
    ["cardDiscard"],
  ],
  [
    "the president discards and hands you the rest",
    { state: S.LEGISLATIVE_PRESIDENT, president: "Bob", chancellor: "Ann" },
    { state: S.LEGISLATIVE_CHANCELLOR, president: "Bob", chancellor: "Ann", discardSize: 1 },
    "Ann",
    ["cardDiscard", "yourTurn"],
  ],
  [
    "you discard as president (the chancellor acts next)",
    { state: S.LEGISLATIVE_PRESIDENT, president: "Ann", chancellor: "Cat" },
    { state: S.LEGISLATIVE_CHANCELLOR, president: "Ann", chancellor: "Cat", discardSize: 1 },
    "Ann",
    ["cardDiscard"],
  ],
  [
    "a liberal policy is enacted",
    { state: S.LEGISLATIVE_CHANCELLOR, president: "Bob", chancellor: "Cat" },
    { state: S.POST_LEGISLATIVE, president: "Bob", liberalPolicies: 1, lastPolicy: "LIBERAL" },
    "Ann",
    ["policyLiberal"],
  ],
  [
    "a fascist policy grants a power",
    { state: S.LEGISLATIVE_CHANCELLOR, president: "Bob", fascistPolicies: 1 },
    { state: S.PP_INVESTIGATE, president: "Bob", fascistPolicies: 2, lastPolicy: "FASCIST" },
    "Ann",
    ["policyFascist", "power"],
  ],
  [
    "a fascist policy grants you a power",
    { state: S.LEGISLATIVE_CHANCELLOR, president: "Ann", fascistPolicies: 1 },
    { state: S.PP_INVESTIGATE, president: "Ann", fascistPolicies: 2, lastPolicy: "FASCIST" },
    "Ann",
    ["policyFascist", "power", "yourTurn"],
  ],
  [
    "a player is investigated",
    { state: S.PP_INVESTIGATE, president: "Bob" },
    { state: S.POST_LEGISLATIVE, lastState: S.PP_INVESTIGATE, president: "Bob", targetUser: "Cat" },
    "Ann",
    ["investigate"],
  ],
  [
    "the president hears the investigation from its own packet, then END TERM",
    { state: S.PP_INVESTIGATE, president: "Bob" },
    { state: S.POST_LEGISLATIVE, lastState: S.PP_INVESTIGATE, president: "Bob", targetUser: "Cat" },
    "Bob",
    ["yourTurn"],
  ],
  [
    "a player is executed",
    { state: S.PP_EXECUTION, president: "Bob" },
    {
      state: S.POST_LEGISLATIVE,
      lastState: S.PP_EXECUTION,
      president: "Bob",
      targetUser: "Cat",
      players: players({ Cat: { alive: false } }),
    },
    "Ann",
    ["execution"],
  ],
  [
    "you are executed",
    { state: S.PP_EXECUTION, president: "Bob" },
    {
      state: S.POST_LEGISLATIVE,
      lastState: S.PP_EXECUTION,
      president: "Bob",
      targetUser: "Cat",
      players: players({ Cat: { alive: false } }),
    },
    "Cat",
    ["execution"],
  ],
  [
    "the peek and the special election play only the power",
    { state: S.LEGISLATIVE_CHANCELLOR, president: "Bob", fascistPolicies: 2 },
    { state: S.PP_PEEK, president: "Bob", fascistPolicies: 3, lastPolicy: "FASCIST" },
    "Ann",
    ["policyFascist", "power"],
  ],
  [
    "the chancellor moves to veto",
    { state: S.LEGISLATIVE_CHANCELLOR, president: "Bob", chancellor: "Cat", fascistPolicies: 5 },
    {
      state: S.LEGISLATIVE_PRESIDENT_VETO,
      president: "Bob",
      chancellor: "Cat",
      fascistPolicies: 5,
      vetoOccurred: true,
    },
    "Ann",
    ["veto"],
  ],
  [
    "the chancellor asks you to veto",
    { state: S.LEGISLATIVE_CHANCELLOR, president: "Ann", chancellor: "Cat", fascistPolicies: 5 },
    {
      state: S.LEGISLATIVE_PRESIDENT_VETO,
      president: "Ann",
      chancellor: "Cat",
      fascistPolicies: 5,
      vetoOccurred: true,
    },
    "Ann",
    ["veto", "yourTurn"],
  ],
  [
    "the president agrees to the veto",
    { state: S.LEGISLATIVE_PRESIDENT_VETO, president: "Bob", fascistPolicies: 5 },
    {
      state: S.POST_LEGISLATIVE,
      president: "Bob",
      fascistPolicies: 5,
      electionTracker: 1,
      electionTrackerAdvanced: true,
    },
    "Ann",
    ["trackerAdvance"],
  ],
  [
    "the president refuses your veto",
    { state: S.LEGISLATIVE_PRESIDENT_VETO, president: "Bob", chancellor: "Ann", vetoOccurred: true },
    { state: S.LEGISLATIVE_CHANCELLOR, president: "Bob", chancellor: "Ann", vetoOccurred: true },
    "Ann",
    ["yourTurn"],
  ],
  [
    "END TERM is your turn",
    { state: S.LEGISLATIVE_CHANCELLOR, president: "Ann", chancellor: "Cat" },
    { state: S.POST_LEGISLATIVE, president: "Ann", liberalPolicies: 1, lastPolicy: "LIBERAL" },
    "Ann",
    ["policyLiberal", "yourTurn"],
  ],
  [
    "fascists win by policy, and you are a fascist",
    { state: S.LEGISLATIVE_CHANCELLOR, president: "Bob", fascistPolicies: 5 },
    { state: S.FASCIST_VICTORY_POLICY, president: "Bob", fascistPolicies: 6, players: players({ Ann: { id: FASCIST } }) },
    "Ann",
    ["policyFascist", "victory"],
  ],
  [
    "fascists win by policy, and you are Hitler",
    { state: S.LEGISLATIVE_CHANCELLOR, president: "Bob", fascistPolicies: 5 },
    { state: S.FASCIST_VICTORY_POLICY, president: "Bob", fascistPolicies: 6, players: players({ Ann: { id: HITLER } }) },
    "Ann",
    ["policyFascist", "victory"],
  ],
  [
    "fascists win by policy, and you are a liberal",
    { state: S.LEGISLATIVE_CHANCELLOR, president: "Bob", fascistPolicies: 5 },
    { state: S.FASCIST_VICTORY_POLICY, president: "Bob", fascistPolicies: 6, players: players({ Ann: { id: LIBERAL } }) },
    "Ann",
    ["policyFascist", "defeat"],
  ],
  [
    "liberals win by policy, and you are a liberal",
    { state: S.LEGISLATIVE_CHANCELLOR, president: "Bob", liberalPolicies: 4 },
    { state: S.LIBERAL_VICTORY_POLICY, president: "Bob", liberalPolicies: 5, players: players({ Ann: { id: LIBERAL } }) },
    "Ann",
    ["policyLiberal", "victory"],
  ],
  [
    "Hitler is executed, and you are a liberal",
    { state: S.PP_EXECUTION, president: "Bob" },
    {
      state: S.LIBERAL_VICTORY_EXECUTION,
      president: "Bob",
      targetUser: "Dan",
      players: players({ Ann: { id: LIBERAL }, Dan: { id: HITLER, alive: false } }),
    },
    "Ann",
    ["execution", "victory"],
  ],
  [
    "Hitler is executed, and you are a fascist",
    { state: S.PP_EXECUTION, president: "Bob" },
    {
      state: S.LIBERAL_VICTORY_EXECUTION,
      president: "Bob",
      targetUser: "Dan",
      players: players({ Ann: { id: FASCIST }, Dan: { id: HITLER, alive: false } }),
    },
    "Ann",
    ["execution", "defeat"],
  ],
  [
    "Hitler is elected chancellor, and you are a liberal",
    { state: S.CHANCELLOR_VOTING, president: "Bob", chancellor: "Dan", userVotes: votes(3, 4) },
    {
      state: S.FASCIST_VICTORY_ELECTION,
      president: "Bob",
      chancellor: "Dan",
      userVotes: votes(3, 5),
      players: players({ Ann: { id: LIBERAL }, Dan: { id: HITLER } }),
    },
    "Ann",
    ["voteCast", "votePassed", "defeat"],
  ],
];

test.each(ROWS)("%s", (_title, prev, next, user, expected) => {
  expect(soundEvents(state(prev), state(next), user)).toEqual(expected);
});

describe("a user who is not in playerOrder", () => {
  test.each<[string, Partial<GameState>, Partial<GameState>, SoundName[]]>([
    ["hears the game start", { state: S.SETUP }, { president: "Bob" }, ["gameStart"]],
    [
      "hears a nomination",
      { president: "Bob" },
      { state: S.CHANCELLOR_VOTING, president: "Bob", chancellor: "Cat" },
      ["nominate"],
    ],
    [
      "hears an investigation",
      { state: S.PP_INVESTIGATE, president: "Bob" },
      { state: S.POST_LEGISLATIVE, lastState: S.PP_INVESTIGATE, president: "Bob", targetUser: "Cat" },
      ["investigate"],
    ],
    [
      "hears victory whoever wins",
      { state: S.LEGISLATIVE_CHANCELLOR, president: "Bob", fascistPolicies: 5 },
      { state: S.FASCIST_VICTORY_POLICY, president: "Bob", fascistPolicies: 6 },
      ["policyFascist", "victory"],
    ],
  ])("%s", (_title, prev, next, expected) => {
    expect(soundEvents(state(prev), state(next), "Zed")).toEqual(expected);
  });

  test("never hears yourTurn, and nothing throws", () => {
    for (const [, prev, next] of ROWS) {
      expect(soundEvents(state(prev), state(next), "Zed")).not.toContain("yourTurn");
    }
  });
});

const EVERY_STATE = Object.values(LobbyState);

test.each(EVERY_STATE)("a first packet plays nothing (%s)", (lobbyState) => {
  const next = state({ state: lobbyState, president: "Ann", chancellor: "Ann", fascistPolicies: 2 });
  expect(soundEvents(undefined, next, "Ann")).toEqual([]);
});

test.each(EVERY_STATE)("a packet in the same state plays nothing (%s)", (lobbyState) => {
  const packet = state({
    state: lobbyState,
    lastState: S.PP_EXECUTION,
    president: "Ann",
    chancellor: "Ann",
    userVotes: votes(2, 3),
    fascistPolicies: 2,
    liberalPolicies: 1,
    electionTracker: 1,
    electionTrackerAdvanced: true,
    targetUser: "Cat",
  });
  expect(soundEvents(packet, packet, "Ann")).toEqual([]);
  expect(soundEvents(packet, structuredClone(packet), "Ann")).toEqual([]);
});

describe("lobbySounds", () => {
  test.each<[string, string[] | undefined, string[], SoundName[]]>([
    ["the first lobby packet plays nothing", undefined, ["Ann", "Bob"], []],
    ["a player joins", ["Ann"], ["Ann", "Bob"], ["playerJoined"]],
    ["two players join in one packet", ["Ann"], ["Ann", "Bob", "Cat"], ["playerJoined"]],
    ["nobody joins", ["Ann", "Bob"], ["Ann", "Bob"], []],
    ["a player leaves", ["Ann", "Bob"], ["Ann"], []],
    ["one leaves as another joins", ["Ann", "Bob"], ["Ann", "Cat"], ["playerJoined"]],
  ])("%s", (_title, prev, next, expected) => {
    expect(lobbySounds(prev, next)).toEqual(expected);
  });
});

test("every sound waits for the animation it belongs to", () => {
  expect(SOUND_CUES).toEqual({
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
  });
  expect(Object.keys(SOUND_CUES).sort()).toEqual([...SOUND_NAMES].sort());
});
