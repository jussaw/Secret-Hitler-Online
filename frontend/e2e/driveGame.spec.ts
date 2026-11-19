import { expect, test } from "@playwright/test";
import { makeGameState } from "../src/game/testGameState";
import type { GameState } from "../src/types";
import { nominee } from "./driveGame";

/**
 * driveGame's own moves, on hand-built states: no page and no server. They live here because
 * Vitest takes only src/; one project is enough, as nothing here draws.
 */

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "no page: one project is enough");
});

const SEATS = ["A", "B", "C", "D", "E"];

/** Five seats, A to E in turn, with the dead ones out and `overrides` applied. */
function fiveSeats(dead: string[], overrides: Partial<GameState>): GameState {
  const g = makeGameState(SEATS, overrides);
  for (const name of dead) g.players[name].alive = false;
  return g;
}

test("nominates Hitler when nobody else may be chancellor", () => {
  // Five Fascist policies down and both executions done: the president, the last chancellor, who is
  // term-limited, and Hitler are left, as in the games #94 reports.
  const roles = { A: "LIBERAL", B: "LIBERAL", C: "FASCIST", D: "LIBERAL", E: "HITLER" };
  const g = fiveSeats(["B", "D"], {
    president: "A",
    lastChancellor: "C",
    lastPresident: "E",
    fascistPolicies: 5,
    liberalPolicies: 1,
  });
  expect(nominee(g, roles)).toBe("E");
});

test("passes Hitler over after three Fascist policies while anyone else may be chancellor", () => {
  const roles = { A: "LIBERAL", B: "HITLER", C: "FASCIST", D: "LIBERAL", E: "LIBERAL" };
  expect(nominee(fiveSeats([], { president: "A", fascistPolicies: 3 }), roles)).toBe("C");
  expect(nominee(fiveSeats([], { president: "A", fascistPolicies: 2 }), roles)).toBe("B");
});

test("throws when nobody may be chancellor, rather than nominate no one", () => {
  const roles = { A: "LIBERAL", B: "LIBERAL", C: "FASCIST", D: "LIBERAL", E: "HITLER" };
  const g = fiveSeats(["B", "D", "E"], { president: "A", lastChancellor: "C", fascistPolicies: 5 });
  expect(() => nominee(g, roles)).toThrow("Nobody can be nominated");
});
