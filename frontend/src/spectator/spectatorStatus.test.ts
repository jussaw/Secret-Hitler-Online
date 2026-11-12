import { expect, test } from "vitest";
import { makeGameState } from "../game/testGameState";
import { GameState, LobbyState as S } from "../types";
import { policyText, resultText, trackerText, waitingText } from "./spectatorStatus";

// Twelve characters, the longest name the login form allows.
const NAMES = Array.from({ length: 9 }, (_, i) => `Long Guest ${i + 1}`);
const [P, C] = NAMES;
const T = NAMES[4];
/** The longest status line a player sees; no spectator line may be longer (no-scroll.spec.ts). */
const LONGEST_PLAYER_STATUS =
  "Chancellor has motioned to veto the agenda. Waiting for the president to decide.".length;

const game = (overrides: Partial<GameState>) =>
  makeGameState(NAMES, { president: P, chancellor: C, targetUser: T, ...overrides });

const WAITING: [S, string][] = [
  [S.SETUP, ""],
  [S.CHANCELLOR_NOMINATION, `Waiting for ${P} to nominate a chancellor.`],
  [S.CHANCELLOR_VOTING, `${P} nominated ${C}. Waiting for all players to vote.`],
  [S.LEGISLATIVE_PRESIDENT, `Waiting for ${P} to choose a policy to discard.`],
  [S.LEGISLATIVE_CHANCELLOR, `Waiting for ${C} to choose a policy to enact.`],
  [S.LEGISLATIVE_PRESIDENT_VETO, `${C} has motioned to veto. Waiting for ${P} to decide.`],
  [S.PP_PEEK, `Peek: ${P} is previewing the next 3 policies.`],
  [S.PP_INVESTIGATE, `Investigation: ${P} is choosing a player to investigate.`],
  [S.PP_ELECTION, `Special Election: ${P} is choosing the next president.`],
  [S.PP_EXECUTION, `Execution: ${P} is choosing a player to execute.`],
  [S.POST_LEGISLATIVE, `Waiting for ${P} to end their term.`],
  [S.FASCIST_VICTORY_POLICY, "Fascists successfully passed six policies!"],
  [S.FASCIST_VICTORY_ELECTION, "Fascists successfully elected Hitler as chancellor!"],
  [S.LIBERAL_VICTORY_POLICY, "Liberals successfully passed five policies!"],
  [S.LIBERAL_VICTORY_EXECUTION, "Liberals successfully executed Hitler!"],
];

test.each(WAITING)("waiting text in %s", (state, expected) => {
  expect(waitingText(game({ state }))).toBe(expected);
});

test("every state has a waiting text", () => {
  expect(WAITING.map(([state]) => state).sort()).toEqual(Object.values(S).sort());
});

test.each([
  ["LIBERAL", "A liberal policy was enacted."],
  ["FASCIST", "A fascist policy was enacted."],
])("policy text for a %s policy", (lastPolicy, expected) => {
  expect(policyText(game({ state: S.POST_LEGISLATIVE, lastPolicy }))).toBe(expected);
});

test.each<[string, Partial<GameState>, string]>([
  ["moves to 1", { electionTracker: 1, electionTrackerAdvanced: true }, "The election tracker moves to 1."],
  ["moves to 2", { electionTracker: 2, electionTrackerAdvanced: true }, "The election tracker moves to 2."],
  [
    "reaches 3",
    { electionTracker: 0, electionTrackerAdvanced: true },
    "The election tracker reached 3. The top policy is enacted.",
  ],
])("tracker text when it %s", (_title, overrides, expected) => {
  expect(trackerText(game({ state: S.POST_LEGISLATIVE, ...overrides }))).toBe(expected);
});

test.each<[string, Partial<GameState>, string]>([
  ["an investigation", { state: S.POST_LEGISLATIVE, lastState: S.PP_INVESTIGATE }, `${P} investigated ${T}.`],
  [
    "a special election",
    { state: S.POST_LEGISLATIVE, lastState: S.PP_ELECTION },
    `${P} chose ${T} to be the next president.`,
  ],
  ["an execution", { state: S.POST_LEGISLATIVE, lastState: S.PP_EXECUTION }, `${P} executed ${T}.`],
  ["executing Hitler", { state: S.LIBERAL_VICTORY_EXECUTION, lastState: S.PP_EXECUTION }, `${P} executed ${T}.`],
  ["a plain policy", { state: S.POST_LEGISLATIVE, lastState: S.LEGISLATIVE_CHANCELLOR }, ""],
  ["a peek", { state: S.POST_LEGISLATIVE, lastState: S.PP_PEEK }, ""],
])("result text after %s", (_title, overrides, expected) => {
  expect(resultText(game(overrides))).toBe(expected);
});

test("no line is longer than the longest status a player sees", () => {
  const lines = [
    ...Object.values(S).map((state) => waitingText(game({ state }))),
    policyText(game({ lastPolicy: "FASCIST" })),
    trackerText(game({ electionTracker: 0, electionTrackerAdvanced: true })),
    ...[S.PP_INVESTIGATE, S.PP_ELECTION, S.PP_EXECUTION].map((lastState) =>
      resultText(game({ state: S.POST_LEGISLATIVE, lastState }))
    ),
  ];
  for (const line of lines) {
    expect(line.length, line).toBeLessThanOrEqual(LONGEST_PLAYER_STATUS);
  }
});
