import { expect, test } from "@playwright/test";
import { makeGameState } from "../src/game/testGameState";
import type { GameState, Role } from "../src/types";
import { nominee } from "./driveGame";

/**
 * driveGame's own moves, on hand-built states: no page and no server. They live here because
 * Vitest takes only src/; one project is enough, as nothing here draws.
 */

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "no page: one project is enough");
});

const SEATS = ["A", "B", "C", "D", "E"];
const ROLES: Record<string, Role> = {
  L: "LIBERAL" as Role,
  F: "FASCIST" as Role,
  H: "HITLER" as Role,
};

/** The roles of A to E from their letters: "LLFLH" makes C a fascist and E Hitler. */
const dealt = (letters: string): Record<string, Role> =>
  Object.fromEntries(SEATS.map((name, i) => [name, ROLES[letters[i]]]));

/** Five seats, A to E in turn, with the dead ones out and `overrides` applied. */
function fiveSeats(dead: string[], overrides: Partial<GameState>): GameState {
  const g = makeGameState(SEATS, overrides);
  for (const name of dead) g.players[name].alive = false;
  return g;
}

test("nominates Hitler when nobody else may be chancellor", () => {
  // Five fascist policies down and both executions done, as in the games #94 reports: the
  // president, the last chancellor, who is term-limited, and Hitler are left. Hitler was the last
  // president, who may serve again with five or fewer alive.
  const g = fiveSeats(["B", "D"], { president: "A", lastChancellor: "C", lastPresident: "E", fascistPolicies: 5 });
  expect(nominee(g, dealt("LLFLH"))).toBe("E");
});

test("passes Hitler over after three fascist policies while anyone else may be chancellor", () => {
  const roles = dealt("LHFLL");
  expect(nominee(fiveSeats([], { president: "A", fascistPolicies: 3 }), roles)).toBe("C");
  expect(nominee(fiveSeats([], { president: "A", fascistPolicies: 2 }), roles)).toBe("B");
});

test("throws when nobody may be chancellor, rather than nominate no one", () => {
  // No game gets here (with Hitler dead it is over): this only holds the guard.
  const g = fiveSeats(["B", "D", "E"], { president: "A", lastChancellor: "C", fascistPolicies: 5 });
  expect(() => nominee(g, dealt("LLFLH"))).toThrow("Nobody can be nominated");
});
