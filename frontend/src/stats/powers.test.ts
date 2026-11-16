import { describe, expect, it } from "vitest";
import { computePowers } from "./powers";
import { ALL, FIVE, gameOf, investigate, term } from "./votesTestRounds";

// Players 1 to 5 sit in seats 0 to 4 (FIVE: three Liberals, then the Fascist and Hitler).

describe("computePowers: investigations, peeks and special elections", () => {
  it("counts investigations, what they saw and whom", () => {
    const g = gameOf(FIVE, [term(1, 0, 1, ALL, [], investigate(0, 3, "FASCIST")), term(2, 1, 2, ALL, [], investigate(1, 0, "LIBERAL")),
      term(3, 3, 0, ALL, [], investigate(3, 4, "FASCIST")), term(4, 4, 0, ALL, [], investigate(4, 2, "LIBERAL")),
      term(5, 0, 1, ALL, [], investigate(0, 4, "FASCIST"))]);
    const p = computePowers([g]).byPlayer;
    expect(p.get(1)).toMatchObject({ investigations: 2, saw: { LIBERAL: 0, FASCIST: 2 }, liberalFinds: { hits: 2, chances: 2 } });
    expect([...p.get(1)!.investigatedPlayers]).toEqual([[4, 1], [5, 1]]);
    expect(p.get(2)).toMatchObject({ investigations: 1, saw: { LIBERAL: 1, FASCIST: 0 }, liberalFinds: { hits: 0, chances: 1 } });
    expect(p.get(4)).toMatchObject({ teammateChecks: { hits: 1, chances: 1 }, liberalFinds: { chances: 0 } });
    expect(p.get(5)!.teammateChecks).toMatchObject({ hits: 0, chances: 1 });
    expect([1, 3, 4, 5].map((n) => p.get(n)!.timesInvestigated)).toEqual([
      { LIBERAL: 1, FASCIST: 0, HITLER: 0 }, { LIBERAL: 1, FASCIST: 0, HITLER: 0 },
      { LIBERAL: 0, FASCIST: 1, HITLER: 0 }, { LIBERAL: 0, FASCIST: 0, HITLER: 2 }]);
  });

  it("counts peeks and special elections, and which picked a teammate", () => {
    const g = gameOf(FIVE, [term(1, 0, 1, ALL, [], { power: { type: "peek", seat: 0, cards: ["L", "F", "F"] } }),
      term(2, 3, 0, ALL, [], { power: { type: "specialElection", seat: 3, target: 4 } }),
      term(3, 1, 0, ALL, [], { power: { type: "specialElection", seat: 1, target: 3 } }),
      term(4, 1, 0, ALL, [], { power: { type: "specialElection", seat: 1, target: 2 } })]);
    const p = computePowers([g]).byPlayer;
    expect(p.get(1)!.peeks).toBe(1);
    expect(p.get(4)).toMatchObject({ specialElections: 1, specialTeammate: { hits: 1, chances: 1 } });
    expect(p.get(2)).toMatchObject({ specialElections: 2, specialTeammate: { hits: 1, chances: 2, value: null } });
  });
});
