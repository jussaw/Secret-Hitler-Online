import { describe, expect, it } from "vitest";
import {
  ELO_K,
  ELO_PRIOR,
  ELO_SCALE,
  ELO_START,
  eloChange,
  expectedLiberal,
  handicap,
  PROVISIONAL_GAMES,
  replayElo,
} from "./elo";
import type { GameRecord, Role } from "./record";
import { game, match, seatsOf } from "./testGames";

const H = 3_600_000;
const T0 = Date.UTC(2026, 10, 1, 20, 0);
const L: Role = "LIBERAL";
const F: Role = "FASCIST";
const HI: Role = "HITLER";

/** The rating of `player`, which must be rated. */
const ratingOf = (result: ReturnType<typeof replayElo>, player: number) => result.ratings.get(player)!.rating;

describe("the constants", () => {
  it("are the spec's", () => {
    expect([ELO_START, ELO_K, ELO_SCALE, ELO_PRIOR, PROVISIONAL_GAMES]).toEqual([1500, 32, 400, 5, 5]);
  });
});

describe("the spec's worked case: 7 seats, Liberals 1512, Fascists 1517, 3 of 10 earlier Liberal wins", () => {
  const h = handicap(3, 10); // p = (3 + 5) / (10 + 10) = 0.4
  const e = expectedLiberal(1512, 1517, h);
  it("H is about +70", () => expect(h).toBeCloseTo(70.4365, 3));
  it("E is about 0.39", () => expect(e).toBeCloseTo(0.39311, 5));
  it("a Liberal win moves each side 19", () => expect(Math.round(eloChange(e, true))).toBe(19));
  it("a Fascist win moves each side 13", () => expect(Math.round(eloChange(e, false))).toBe(-13));
});

describe("the handicap", () => {
  it("noEarlierGamesNoHandicap", () => expect(handicap(0, 0)).toBe(0));
  it("liberalsWinningMoreMakesItNegative", () => expect(handicap(8, 10)).toBeCloseTo(-107.538, 3));
});

describe("replayElo", () => {
  const first = game("g1", T0, seatsOf([1, 2, 3, 4, 5]), "LIBERAL");
  const second = game("g2", T0 + H, seatsOf([1, 2, 3, 4, 5]), "FASCIST");

  it("startsAt1500AndMovesASideTogether", () => {
    const result = replayElo([first]);
    expect([1, 2, 3].map((p) => ratingOf(result, p))).toEqual([1516, 1516, 1516]);
    expect([4, 5].map((p) => ratingOf(result, p))).toEqual([1484, 1484]);
    expect(result.games.get("g1")).toEqual({ gameId: "g1", expectedLiberal: 0.5, handicap: 0, liberalChange: 16 });
    expect(result.ratings.get(4)).toEqual({
      player: 4,
      rating: 1484,
      games: 1,
      provisional: true,
      lastChange: -16,
      peak: 1484,
    });
  });

  it("usesTheRatingsFromBeforeEachGame", () => {
    const result = replayElo([first, second]);
    const g2 = result.games.get("g2")!;
    expect(g2.handicap).toBeCloseTo(-31.672, 3);
    expect(g2.expectedLiberal).toBeCloseTo(0.59062, 4);
    expect(g2.liberalChange).toBeCloseTo(-18.9, 3);
    const one = result.ratings.get(1)!;
    expect(one.rating).toBeCloseTo(1497.1, 3);
    expect(one.peak).toBe(1516);
    expect(one.lastChange).toBeCloseTo(-18.9, 3);
    expect(one.games).toBe(2);
    expect(ratingOf(result, 4)).toBeCloseTo(1502.9, 3);
  });

  it("replaysByEndedAtThenId", () => {
    const games = [first, second, game("g3", T0 + 2 * H, seatsOf([1, 2, 3, 5, 4]), "LIBERAL")];
    expect(replayElo([...games].reverse())).toEqual(replayElo(games));
    const b = game("b", T0, seatsOf([1, 2, 3, 4, 5]), "LIBERAL");
    const a = game("a", T0, seatsOf([1, 2, 3, 4, 5]), "FASCIST");
    expect(replayElo([b, a]).history.map((point) => point.gameId)).toEqual(["a", "b"]);
  });

  it("cpuSeatsCount1500AndAreNeverRated", () => {
    const cpu = game("g2", T0 + H, seatsOf([1, 2, null, 4, null]), "LIBERAL");
    const result = replayElo([first, cpu]);
    expect(result.games.get("g2")!.expectedLiberal).toBeCloseTo(0.57194, 4);
    expect(result.games.get("g2")!.handicap).toBeCloseTo(-31.672, 3);
    expect(Array.from(result.ratings.keys()).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5]);
    expect(result.ratings.get(3)!.games, "player 3 sat out").toBe(1);
  });

  it("theHandicapLearnsFromEarlierGamesOfTheSameSize", () => {
    const games: GameRecord[] = [];
    for (let i = 0; i < 10; i++) {
      games.push(game(`s7-${i}`, T0 + i * H, seatsOf([101, 102, 103, 104, 105, 106, 107]), i < 3 ? "LIBERAL" : "FASCIST"));
    }
    games.push(game("s5-0", T0 + 10 * H, seatsOf([301, 302, 303, 304, 305]), "LIBERAL"));
    games.push(game("s5-1", T0 + 11 * H, seatsOf([301, 302, 303, 304, 305]), "LIBERAL"));
    games.push(game("fresh", T0 + 12 * H, seatsOf([201, 202, 203, 204, 205, 206, 207]), "LIBERAL"));
    const result = replayElo(games);
    const fresh = result.games.get("fresh")!;
    expect(fresh.handicap).toBeCloseTo(70.4365, 3);
    expect(fresh.expectedLiberal).toBeCloseTo(0.4, 10);
    expect(fresh.liberalChange).toBeCloseTo(19.2, 9);
    for (const p of [201, 202, 203, 204]) expect(ratingOf(result, p)).toBeCloseTo(1519.2, 9);
    for (const p of [205, 206, 207]) expect(ratingOf(result, p)).toBeCloseTo(1480.8, 9);
  });

  it("equalSidesMoveTheTotalByZero", () => {
    const roles = [L, L, L, F, F, HI];
    const result = replayElo([
      game("e1", T0, seatsOf([1, 2, 3, 4, 5, 6], roles), "LIBERAL"),
      game("e2", T0 + H, seatsOf([4, 1, 6, 2, 3, 5], roles), "FASCIST"),
      game("e3", T0 + 2 * H, seatsOf([6, 5, 1, 3, 2, 4], roles), "LIBERAL"),
    ]);
    const total = Array.from(result.ratings.values()).reduce((sum, r) => sum + (r.rating - ELO_START), 0);
    expect(total).toBeCloseTo(0, 9);
  });

  it("unequalSidesMoveItByTheChange", () => {
    const result = replayElo([game("u1", T0, seatsOf([1, 2, 3, 4, 5, 6, 7]), "LIBERAL")]);
    const total = Array.from(result.ratings.values()).reduce((sum, r) => sum + (r.rating - ELO_START), 0);
    expect(total).toBeCloseTo(16, 9);
  });

  it("provisionalUntilFiveGames", () => {
    const games = Array.from({ length: 5 }, (_, i) => match(`m${i}`, T0 + i * H, [1, 2, 3], [4, 5], i % 2 === 0 ? "LIBERAL" : "FASCIST"));
    expect(replayElo(games.slice(0, 4)).ratings.get(1)!.provisional).toBe(true);
    expect(replayElo(games).ratings.get(1)!.provisional).toBe(false);
    expect(replayElo(games).ratings.get(1)!.games).toBe(5);
  });

  it("historyCarriesMissedGamesFlat", () => {
    const result = replayElo([first, game("g2", T0 + H, seatsOf([1, 2, 3, 4, 6]), "FASCIST")]);
    expect(result.history.map((p) => [p.gameId, p.endedAt])).toEqual([
      ["g1", T0],
      ["g2", T0 + H],
    ]);
    expect(result.history[0].ratings.has(6)).toBe(false);
    expect(result.history[1].ratings.get(5)).toBe(result.history[0].ratings.get(5));
    expect(result.history[1].ratings.get(6)).toBe(result.ratings.get(6)!.rating);
  });

  it("nothingCountedNothingRated", () => {
    expect(replayElo([])).toEqual({ ratings: new Map(), history: [], games: new Map() });
  });

  it("keepsRatingsUnrounded", () => {
    const result = replayElo([first, second]);
    expect(Number.isInteger(ratingOf(result, 1))).toBe(false);
  });
});

describe("match (a test builder)", () => {
  it("seats the winners on their side, then the losers", () => {
    const m = match("m", T0, [7, 8], [9], "FASCIST");
    expect(m.winner).toBe("FASCIST");
    expect(m.seats.map((s) => [s.player, s.role])).toEqual([
      [7, "FASCIST"],
      [8, "FASCIST"],
      [9, "LIBERAL"],
    ]);
  });
});
