import { describe, expect, it } from "vitest";
import { countedGames, DEFAULT_FILTER } from "./counting";
import fixture from "./fixtures/recorded-games.json";
import { parseStatsData, type GameRecord, type Role } from "./record";
import { computeVotes } from "./votes";
import { ALL, eventsOf, FIVE, gameOf, range, SEVEN, sum, term, type TermOptions } from "./votesTestRounds";

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

describe("computeVotes: votes", () => {
  const TWO_FASCISTS: Role[] = ["LIBERAL", "LIBERAL", "FASCIST", "FASCIST", "HITLER"];

  it("splits the Ja rate by role", () => {
    const a = gameOf(FIVE, [term(1, 0, 3, [0, 1, 3, 4], [2]), term(2, 1, 2, [0], [1, 2, 3, 4])]);
    const b = gameOf(["HITLER", "LIBERAL", "LIBERAL", "FASCIST", "LIBERAL"], [term(1, 1, 2, ALL, [])]);
    const p = computeVotes([a, b]).byPlayer;
    expect(p.get(1)).toMatchObject({ votes: 3, ja: { hits: 3, chances: 3 },
      jaByRole: { LIBERAL: { hits: 2, chances: 2 }, FASCIST: { hits: 0, chances: 0 }, HITLER: { hits: 1, chances: 1 } } });
    expect(p.get(3)!.jaByRole.LIBERAL).toMatchObject({ hits: 1, chances: 3 });
    expect(p.get(4)!.jaByRole.FASCIST).toMatchObject({ hits: 2, chances: 3 });
    expect(p.get(5)!.jaByRole).toMatchObject({ HITLER: { hits: 1, chances: 2 }, LIBERAL: { hits: 1, chances: 1 } });
  });

  it("judges a Liberal's vote by whether the government holds the Fascist side", () => {
    const g = gameOf(FIVE, [term(1, 0, 1, [0, 1, 3], [2, 4]), term(2, 2, 3, [2, 3, 4], [0, 1]), term(3, 3, 0, [0, 3, 4], [1, 2])]);
    const p = computeVotes([g]).byPlayer;
    expect([1, 2, 3].map((n) => p.get(n)!.liberalAccuracy)).toMatchObject([
      { hits: 2, chances: 3 }, { hits: 3, chances: 3 }, { hits: 1, chances: 3 }]);
    expect(p.get(4)!.liberalAccuracy.chances).toBe(0);
  });

  it("counts Fascist loyalty only on governments with a teammate other than the voter", () => {
    const g = gameOf(TWO_FASCISTS, [term(1, 2, 0, [2, 3], [0, 1, 4]), term(2, 0, 4, [0, 2, 4], [1, 3]),
      term(3, 0, 1, ALL, []), term(4, 2, 3, [2, 3, 4], [0, 1])]);
    const p = computeVotes([g]).byPlayer;
    expect([3, 4, 5].map((n) => p.get(n)!.fascistLoyalty)).toMatchObject([
      { hits: 2, chances: 2 }, { hits: 2, chances: 3 }, { hits: 1, chances: 2 }]);
  });

  it("counts voting Hitler in only on the election that ended the game", () => {
    const won = gameOf(FIVE, [term(1, 0, 4, [1, 3, 4], [0, 2]), term(2, 1, 4, [0, 2, 3, 4], [1], { ends: true })],
      { outcome: "HITLER_ELECTED" });
    const lost = gameOf(FIVE, [term(1, 0, 4, ALL, [])]);
    const p = computeVotes([won, lost]).byPlayer;
    expect([1, 2, 3, 4].map((n) => [p.get(n)!.votedHitlerIn, p.get(n)!.hitlerElectionVotes]))
      .toEqual([[1, 1], [0, 1], [1, 1], [0, 0]]);
  });

  it.each([
    { ja: 4, nein: 3, side: "ja" }, { ja: 5, nein: 2, side: null }, { ja: 4, nein: 2, side: "ja" },
    { ja: 3, nein: 3, side: "nein" }, { ja: 3, nein: 4, side: "nein" }, { ja: 2, nein: 4, side: null },
    { ja: 2, nein: 1, side: "ja" }, { ja: 1, nein: 2, side: "nein" },
  ])("finds the swing votes at $ja–$nein", ({ ja, nein, side }) => {
    const jaSeats = range(0, ja), neinSeats = range(ja, ja + nein);
    const p = computeVotes([gameOf(SEVEN, [term(1, 0, 1, jaSeats, neinSeats)])]).byPlayer;
    const swung = side === "ja" ? jaSeats : side === "nein" ? neinSeats : [];
    expect([...p].filter(([, v]) => v.swing === 1).map(([n]) => n).sort((a, b) => a - b)).toEqual(swung.map((s) => s + 1));
  });

  it.each([
    { ja: 6, nein: 1, lone: "nein" }, { ja: 1, nein: 6, lone: "ja" }, { ja: 2, nein: 1, lone: "nein" },
    { ja: 5, nein: 2, lone: null }, { ja: 7, nein: 0, lone: null },
  ])("finds the lone dissent at $ja–$nein", ({ ja, nein, lone }) => {
    const jaSeats = range(0, ja), neinSeats = range(ja, ja + nein);
    const p = computeVotes([gameOf(SEVEN, [term(1, 0, 1, jaSeats, neinSeats)])]).byPlayer;
    const alone = lone === "ja" ? jaSeats : lone === "nein" ? neinSeats : [];
    expect([...p].filter(([, v]) => v.loneDissent === 1).map(([n]) => n)).toEqual(alone.map((s) => s + 1));
  });

  it("lets CPU seats' votes decide a swing but gives them no entry", () => {
    const g = gameOf(SEVEN, [term(1, 1, 0, [0, 2, 3, 4], [1, 5, 6])], { players: [1, null, 3, 4, 5, null, 7] });
    const p = computeVotes([g]).byPlayer;
    expect([...p.keys()].sort((a, b) => a - b)).toEqual([1, 3, 4, 5, 7]);
    expect([1, 3, 4, 5, 7].map((n) => p.get(n)!.swing)).toEqual([1, 1, 1, 1, 0]); // 4–3, two Neins from CPUs
    expect(p.get(1)).toMatchObject({ nominatedChancellor: 1, liberalAccuracy: { hits: 1, chances: 1 } });
  });

  it("agrees with the contract fixture's raw events", () => {
    const counted = countedGames(parseStatsData(fixture).games, DEFAULT_FILTER);
    const human = (g: GameRecord, seat: number) => g.seats[seat].player !== null;
    const all = [...computeVotes(counted).byPlayer.values()];
    expect(counted.length).toBeGreaterThan(0);
    expect(sum(all, (v) => v.votes)).toBe(eventsOf(counted, "vote").filter(({ g, e }) => human(g, e.seat)).length);
    expect(sum(all, (v) => v.ja.hits)).toBe(eventsOf(counted, "vote").filter(({ g, e }) => e.ja && human(g, e.seat)).length);
    expect(sum(all, (v) => v.nominatedChancellor)).toBe(eventsOf(counted, "nominate").filter(({ g, e }) => human(g, e.chancellor)).length);
    for (const v of all) {
      expect(sum(Object.values(v.jaByRole), (r) => r.chances)).toBe(v.votes);
      for (const r of [v.presidentPassed, v.chancellorPassed, v.liberalAccuracy, v.fascistLoyalty]) expect(r.hits).toBeLessThanOrEqual(r.chances);
      expect(Math.max(v.swing, v.loneDissent, v.votedHitlerIn)).toBeLessThanOrEqual(v.votes);
    }
  });
});
