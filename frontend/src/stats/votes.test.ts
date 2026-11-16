import { describe, expect, it } from "vitest";
import { computeVotes } from "./votes";
import { ALL, FIVE, gameOf, range, term, type TermOptions } from "./votesTestRounds";

// Players 1 to 5 sit in seats 0 to 4 (FIVE: three Liberals, then the Fascist and Hitler).

describe("computeVotes: elections", () => {
  it("counts nominations and the elections they led to", () => {
    const g = gameOf(FIVE, [
      term(1, 0, 3, [0, 1, 2, 3], [4]), term(2, 1, 3, [3], [0, 1, 2, 4]),
      term(3, 2, 0, ALL, []), term(4, 3, 0, [0, 3], [1, 2, 4]),
    ]);
    const p = computeVotes([g]).byPlayer;
    expect(p.get(4)).toMatchObject({ games: 1, nominatedChancellor: 2, failedAsPresident: 1,
      chancellorPassed: { hits: 1, chances: 2, value: null }, presidentPassed: { hits: 0, chances: 1 } });
    expect(p.get(1)).toMatchObject({ nominatedChancellor: 2, chancellorPassed: { hits: 1, chances: 2 },
      presidentPassed: { hits: 1, chances: 1 }, failedAsPresident: 0 });
    expect(p.get(2)).toMatchObject({ nominatedChancellor: 0, presidentPassed: { hits: 0, chances: 1 }, failedAsPresident: 1 });
    expect(p.get(5)!.presidentPassed).toEqual({ hits: 0, chances: 0, value: null });
  });

  it("gives a rate its value from five chances", () => {
    const terms = range(0, 5).map((i) => term(i + 1, 0, 1, i < 3 ? [0, 1, 2] : [0], i < 3 ? [3, 4] : [1, 2, 3, 4]));
    expect(computeVotes([gameOf(FIVE, terms)]).byPlayer.get(1)!.presidentPassed).toEqual({ hits: 3, chances: 5, value: 0.6 });
  });

  it("splits picking a teammate by the president's side", () => {
    const g = gameOf(FIVE, [term(1, 0, 3, ALL, []), term(2, 1, 2, ALL, []), term(3, 3, 4, ALL, []),
      term(4, 4, 0, ALL, []), term(5, 0, 1, ALL, [])]);
    const p = computeVotes([g]).byPlayer;
    expect(p.get(1)!.teammatePick).toMatchObject({ LIBERAL: { hits: 1, chances: 2 }, FASCIST: { hits: 0, chances: 0 } });
    expect(p.get(2)!.teammatePick.LIBERAL).toMatchObject({ hits: 1, chances: 1 });
    expect(p.get(4)!.teammatePick.FASCIST).toMatchObject({ hits: 1, chances: 1 }); // Hitler is a teammate
    expect(p.get(5)!.teammatePick.FASCIST).toMatchObject({ hits: 0, chances: 1 });
  });

  const fail = (r: number, president: number, options?: TermOptions) => term(r, president, 3, [3], [0, 1, 2, 4], options);

  it("counts chaos for the president whose third failed election enacted the top policy", () => {
    const p = computeVotes([gameOf(FIVE, [fail(1, 0), fail(2, 1), fail(3, 2, { chaos: "F" })])]).byPlayer;
    expect([1, 2, 3].map((n) => [p.get(n)!.failedAsPresident, p.get(n)!.chaos])).toEqual([[1, 0], [1, 0], [1, 1]]);
  });

  it("counts chaos after an accepted veto too, but not as a failed election", () => {
    const p = computeVotes([gameOf(FIVE, [fail(1, 0), fail(2, 1), term(3, 2, 3, ALL, [], { veto: true, chaos: "L" })])]).byPlayer;
    expect([1, 2, 3].map((n) => [p.get(n)!.failedAsPresident, p.get(n)!.chaos])).toEqual([[1, 0], [1, 0], [0, 1]]);
  });

  it("has no entry without counted games, and no value without chances", () => {
    expect(computeVotes([]).byPlayer.size).toBe(0);
    const p = computeVotes([gameOf(FIVE, [term(1, 0, 3, ALL, [])])]).byPlayer;
    expect([...p.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(p.get(5)!.teammatePick.FASCIST).toEqual({ hits: 0, chances: 0, value: null });
  });
});
