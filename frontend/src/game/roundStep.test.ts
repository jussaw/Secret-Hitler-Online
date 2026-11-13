import { describe, expect, it } from "vitest";
import { LobbyState } from "../types";
import {
  ROUND_STEPS,
  RoundStep,
  stepForPolicyLine,
  stepForState,
} from "./roundStep";

const S = LobbyState;

describe("stepForState", () => {
  it("lists the four steps in order", () => {
    expect(ROUND_STEPS).toEqual([
      RoundStep.NOMINATION,
      RoundStep.ELECTION,
      RoundStep.LEGISLATIVE,
      RoundStep.EXECUTIVE,
    ]);
  });

  it.each([
    [S.CHANCELLOR_NOMINATION, RoundStep.NOMINATION],
    [S.CHANCELLOR_VOTING, RoundStep.ELECTION],
    [S.LEGISLATIVE_PRESIDENT, RoundStep.LEGISLATIVE],
    [S.LEGISLATIVE_CHANCELLOR, RoundStep.LEGISLATIVE],
    [S.LEGISLATIVE_PRESIDENT_VETO, RoundStep.LEGISLATIVE],
    [S.PP_PEEK, RoundStep.EXECUTIVE],
    [S.PP_INVESTIGATE, RoundStep.EXECUTIVE],
    [S.PP_EXECUTION, RoundStep.EXECUTIVE],
    [S.PP_ELECTION, RoundStep.EXECUTIVE],
  ])("maps %s to %s", (state, step) => {
    expect(stepForState({ state, lastState: S.SETUP })).toBe(step);
  });

  it.each([
    [S.PP_PEEK, RoundStep.EXECUTIVE],
    [S.PP_INVESTIGATE, RoundStep.EXECUTIVE],
    [S.PP_EXECUTION, RoundStep.EXECUTIVE],
    [S.PP_ELECTION, RoundStep.EXECUTIVE],
    [S.LEGISLATIVE_CHANCELLOR, RoundStep.LEGISLATIVE],
    [S.LEGISLATIVE_PRESIDENT_VETO, RoundStep.LEGISLATIVE],
    [S.CHANCELLOR_VOTING, RoundStep.ELECTION],
    [S.CHANCELLOR_NOMINATION, RoundStep.ELECTION],
    [S.SETUP, RoundStep.LEGISLATIVE],
  ])("maps POST_LEGISLATIVE after %s to %s", (lastState, step) => {
    expect(stepForState({ state: S.POST_LEGISLATIVE, lastState })).toBe(step);
  });

  it.each([
    S.SETUP,
    S.LIBERAL_VICTORY_POLICY,
    S.LIBERAL_VICTORY_EXECUTION,
    S.FASCIST_VICTORY_POLICY,
    S.FASCIST_VICTORY_ELECTION,
  ])("maps %s to null", (state) => {
    expect(stepForState({ state, lastState: S.CHANCELLOR_VOTING })).toBeNull();
  });

  it("maps a state outside the enum to null", () => {
    expect(
      stepForState({ state: "BOGUS" as LobbyState, lastState: S.SETUP }),
    ).toBeNull();
  });

  it.each(
    [
      S.CHANCELLOR_NOMINATION,
      S.CHANCELLOR_VOTING,
      S.LEGISLATIVE_PRESIDENT,
      S.LEGISLATIVE_CHANCELLOR,
      S.LEGISLATIVE_PRESIDENT_VETO,
      S.PP_PEEK,
      S.PP_INVESTIGATE,
      S.PP_EXECUTION,
      S.PP_ELECTION,
      S.SETUP,
      S.FASCIST_VICTORY_ELECTION,
    ].flatMap((state) =>
      [S.PP_EXECUTION, S.CHANCELLOR_VOTING, S.LEGISLATIVE_CHANCELLOR].map(
        (lastState) => [state, lastState],
      ),
    ),
  )("%s ignores lastState %s outside POST_LEGISLATIVE", (state, lastState) => {
    expect(stepForState({ state, lastState })).toBe(
      stepForState({ state, lastState: S.SETUP }),
    );
  });
});

describe("stepForPolicyLine", () => {
  it("is ELECTION when the election tracker forced the policy", () => {
    expect(stepForPolicyLine({ electionTrackerAdvanced: true })).toBe(
      RoundStep.ELECTION,
    );
  });
  it("is LEGISLATIVE otherwise", () => {
    expect(stepForPolicyLine({ electionTrackerAdvanced: false })).toBe(
      RoundStep.LEGISLATIVE,
    );
  });
});
