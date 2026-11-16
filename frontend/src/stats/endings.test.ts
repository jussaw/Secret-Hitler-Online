import { describe, expect, it } from "vitest";
import { countedGames, DEFAULT_FILTER } from "./counting";
import { replayElo } from "./elo";
import {
  computeEndings,
  FINISHED_OUTCOMES,
  OUTCOME_COLORS,
  OUTCOME_LABELS,
  outcomeBars,
  smoothedLiberalRate,
} from "./endings";
import fixture from "./fixtures/recorded-games.json";
import { parseStatsData } from "./record";
import { ended, MINUTE } from "./testEndings";
import { repeat } from "./testRivals";

const counted = () => countedGames(parseStatsData(fixture).games, DEFAULT_FILTER);

describe("the outcomes", () => {
  it("are the four endings, with their words and colours", () => {
    expect(FINISHED_OUTCOMES).toEqual(["LIBERAL_POLICIES", "HITLER_EXECUTED", "FASCIST_POLICIES", "HITLER_ELECTED"]);
    expect(OUTCOME_LABELS).toEqual({
      LIBERAL_POLICIES: "Liberal policies",
      HITLER_EXECUTED: "Hitler executed",
      FASCIST_POLICIES: "Fascist policies",
      HITLER_ELECTED: "Hitler elected",
    });
    expect(OUTCOME_COLORS).toEqual({
      LIBERAL_POLICIES: "#5a9ba6",
      HITLER_EXECUTED: "#386f8b",
      FASCIST_POLICIES: "#e8604a",
      HITLER_ELECTED: "#b4431a",
    });
  });
});

describe("how games end", () => {
  it("counts games by player count and outcome", () => {
    const e = computeEndings([
      ended(5, "LIBERAL_POLICIES"),
      ended(7, "FASCIST_POLICIES"),
      ended(5, "HITLER_ELECTED"),
      ended(5, "LIBERAL_POLICIES"),
      ended(7, "HITLER_EXECUTED"),
    ]);
    expect(e.bySize.map((s) => [s.seats, s.games, s.outcomes, s.liberalWins])).toEqual([
      [5, 3, { LIBERAL_POLICIES: 2, HITLER_EXECUTED: 0, FASCIST_POLICIES: 0, HITLER_ELECTED: 1 }, 2],
      [7, 2, { LIBERAL_POLICIES: 0, HITLER_EXECUTED: 1, FASCIST_POLICIES: 1, HITLER_ELECTED: 0 }, 1],
    ]);
    expect(outcomeBars(e)[0]).toEqual({
      label: "5 players",
      parts: [
        { key: "LIBERAL_POLICIES", value: 2 },
        { key: "HITLER_EXECUTED", value: 0 },
        { key: "FASCIST_POLICIES", value: 0 },
        { key: "HITLER_ELECTED", value: 1 },
      ],
    });
    expect(outcomeBars(e).map((b) => b.label)).toEqual(["5 players", "7 players"]);
  });

  it("rates Liberal wins per player count: raw from 5 games, smoothed at any count", () => {
    const [five, six] = computeEndings([
      ...repeat(4, () => ended(6, "LIBERAL_POLICIES")),
      ...repeat(6, () => ended(6, "FASCIST_POLICIES")),
      ended(5, "LIBERAL_POLICIES"),
      ended(5, "HITLER_EXECUTED"),
      ended(5, "HITLER_ELECTED"),
    ]).bySize;
    expect(five.liberalRate.value).toBeNull();
    expect(five.smoothedLiberalRate).toBe(7 / 13);
    expect(six.liberalRate).toEqual({ hits: 4, chances: 10, value: 0.4 });
    expect(six.smoothedLiberalRate).toBe(0.45);
    expect(smoothedLiberalRate(0, 0)).toBe(0.5);
  });

  it("smooths the rate as the Elo handicap does", () => {
    const earlier = (
      ["LIBERAL_POLICIES", "FASCIST_POLICIES", "FASCIST_POLICIES", "HITLER_EXECUTED", "HITLER_ELECTED", "FASCIST_POLICIES"] as const
    ).map((o) => ended(7, o));
    const next = ended(7, "LIBERAL_POLICIES");
    const p = computeEndings(earlier).bySize[0].smoothedLiberalRate;
    expect(p).toBe(7 / 16);
    expect(replayElo([...earlier, next]).games.get(next.id)!.handicap).toBeCloseTo(400 * Math.log10((1 - p) / p), 9);
  });

  it("gives the same result for the games in any order", () => {
    const games = [ended(5, "LIBERAL_POLICIES"), ended(8, "HITLER_ELECTED", { minutes: 45 }), ended(5, "FASCIST_POLICIES")];
    expect(computeEndings([...games].reverse())).toEqual(computeEndings(games));
  });
});

describe("how long games last", () => {
  it("averages length and rounds, leaving out games not recorded from their start", () => {
    const e = computeEndings([
      ended(5, "LIBERAL_POLICIES", { minutes: 30, rounds: 6 }),
      ended(5, "HITLER_ELECTED", { minutes: 50, rounds: 8 }),
      ended(5, "LIBERAL_POLICIES", { minutes: 5, rounds: 3, complete: false }),
      ended(8, "FASCIST_POLICIES", { minutes: 70, rounds: 10 }),
    ]);
    expect(e.bySize.map((s) => [s.seats, s.games, s.length])).toEqual([
      [5, 3, { games: 2, averageMs: 40 * MINUTE, averageRounds: 7 }],
      [8, 1, { games: 1, averageMs: 70 * MINUTE, averageRounds: 10 }],
    ]);
    expect(e.length).toEqual({ games: 3, averageMs: 50 * MINUTE, averageRounds: 8 });
  });

  it("the fastest win and the longest game: ties by rounds, then the earlier game", () => {
    const a = ended(5, "LIBERAL_POLICIES", { minutes: 30, rounds: 6 });
    const b = ended(5, "FASCIST_POLICIES", { minutes: 30, rounds: 5 });
    const c = ended(6, "HITLER_ELECTED", { minutes: 90, rounds: 9 });
    const d = ended(6, "HITLER_EXECUTED", { minutes: 90, rounds: 9 });
    const restored = ended(5, "LIBERAL_POLICIES", { minutes: 1, rounds: 1, complete: false });
    const e = computeEndings([d, restored, c, b, a]);
    expect(e.fastestWin).toBe(b);
    expect(e.longestGame).toBe(c);
  });

  it("has nothing without counted games", () => {
    const e = computeEndings([]);
    expect(e.bySize).toEqual([]);
    expect(e.length).toEqual({ games: 0, averageMs: null, averageRounds: null });
    expect(e.fastestWin).toBeNull();
    expect(e.longestGame).toBeNull();
  });
});

describe("the contract fixture", () => {
  it("adds up on the contract fixture", () => {
    const games = counted();
    const e = computeEndings(games);
    expect(e.bySize.reduce((sum, s) => sum + s.games, 0)).toBe(games.length);
    for (const size of e.bySize) {
      expect(FINISHED_OUTCOMES.reduce((sum, o) => sum + size.outcomes[o], 0)).toBe(size.games);
    }
    expect(e.length.games).toBe(games.filter((g) => g.complete).length);
  });
});
