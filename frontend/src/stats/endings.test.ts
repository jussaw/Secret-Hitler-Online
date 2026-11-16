import { describe, expect, it } from "vitest";
import { countedGames, DEFAULT_FILTER } from "./counting";
import { replayElo } from "./elo";
import {
  computeEndings,
  FINISHED_OUTCOMES,
  FINISHES_SHOWN,
  gameLength,
  isClosestFinish,
  isLopsidedFinish,
  OUTCOME_COLORS,
  OUTCOME_LABELS,
  outcomeBars,
  smoothedLiberalRate,
} from "./endings";
import fixture from "./fixtures/recorded-games.json";
import { parseStatsData } from "./record";
import { chaosRun, ended, failed, MINUTE, vetoed } from "./testEndings";
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
      label: "5",
      parts: [
        { key: "LIBERAL_POLICIES", value: 2 },
        { key: "HITLER_EXECUTED", value: 0 },
        { key: "FASCIST_POLICIES", value: 0 },
        { key: "HITLER_ELECTED", value: 1 },
      ],
    });
    expect(outcomeBars(e).map((b) => b.label)).toEqual(["5", "7"]);
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

  it("measures a game from its start to its end", () => {
    expect(gameLength(ended(5, "LIBERAL_POLICIES", { minutes: 42 }))).toBe(42 * MINUTE);
  });

  it("has nothing without counted games", () => {
    const e = computeEndings([]);
    expect(e.bySize).toEqual([]);
    expect(e.length).toEqual({ games: 0, averageMs: null, averageRounds: null });
    expect(e.fastestWin).toBeNull();
    expect(e.longestGame).toBeNull();
  });
});

describe("final boards", () => {
  it("lists closest and most lopsided finishes, newest first", () => {
    const a = ended(6, "HITLER_ELECTED", { liberal: 4, fascist: 3 });
    const b = ended(7, "HITLER_EXECUTED", { liberal: 3, fascist: 5 });
    const c = ended(5, "LIBERAL_POLICIES", { liberal: 5, fascist: 4 });
    const d = ended(5, "LIBERAL_POLICIES", { liberal: 5, fascist: 0 });
    const f = ended(8, "FASCIST_POLICIES", { liberal: 0, fascist: 6 });
    const g = ended(9, "FASCIST_POLICIES", { liberal: 4, fascist: 6 });
    const e = computeEndings([a, b, c, d, f, g]);
    expect(e.closestFinishes).toEqual([g, b, a]);
    expect(e.lopsidedFinishes).toEqual([f, d]);
    expect([a, b, c, d, f, g].map(isClosestFinish)).toEqual([true, true, false, false, false, true]);
    expect([a, b, c, d, f, g].map(isLopsidedFinish)).toEqual([false, false, false, true, true, false]);
    expect(FINISHES_SHOWN).toBe(10);
  });
});

describe("the most in one game", () => {
  it("finds the most chaos policies, failed elections and vetoes in one game", () => {
    const a = ended(5, "LIBERAL_POLICIES", {
      events: [...chaosRun(1), ...vetoed(4, true, 1), ...vetoed(5, true, 2), ...vetoed(6, false)],
    });
    const b = ended(5, "FASCIST_POLICIES", { events: [...chaosRun(1), ...failed(4, 1), ...failed(5, 2), ...vetoed(6, true, 3)] });
    const c = ended(5, "HITLER_ELECTED", { events: [...chaosRun(1), ...chaosRun(4), ...failed(7, 1)] });
    const e = computeEndings([c, a, b]);
    expect(e.mostChaos).toEqual({ game: b, count: 2 }); // one by a veto; c ties it later
    expect(e.mostFailedElections).toEqual({ game: c, count: 7 });
    expect(e.mostVetoes).toEqual({ game: a, count: 2 }); // the refused one is not counted
  });

  it("has no record nobody set", () => {
    const e = computeEndings([ended(5, "LIBERAL_POLICIES")]);
    expect(e.closestFinishes).toEqual([]);
    expect(e.lopsidedFinishes).toEqual([]);
    expect(e.mostChaos).toBeNull();
    expect(e.mostFailedElections).toBeNull();
    expect(e.mostVetoes).toBeNull();
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

  it("finds the most in one game as the recorder's events count them", () => {
    const games = counted();
    const e = computeEndings(games);
    const most = (count: (g: (typeof games)[number]) => number) => Math.max(0, ...games.map(count));
    const events = (g: (typeof games)[number], matches: (ev: (typeof g.events)[number]) => boolean) => g.events.filter(matches).length;
    expect(e.mostChaos?.count ?? 0).toBe(most((g) => events(g, (ev) => ev.type === "enact" && ev.by === "chaos")));
    expect(e.mostFailedElections?.count ?? 0).toBe(most((g) => events(g, (ev) => ev.type === "election" && !ev.passed)));
    expect(e.mostVetoes?.count ?? 0).toBe(most((g) => events(g, (ev) => ev.type === "vetoAnswer" && ev.accepted)));
    expect(e.mostFailedElections).not.toBeNull();
  });
});
