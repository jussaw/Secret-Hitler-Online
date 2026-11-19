import { describe, expect, it } from "vitest";
import { countedGames, DEFAULT_FILTER } from "./counting";
import fixture from "./fixtures/recorded-games.json";
import { computePowers } from "./powers";
import { parseStatsData, type GameEvent, type GameRecord } from "./record";
import { timeOnThread } from "./testTiming";
import { computeVotes } from "./votes";
import { ALL, eventsOf, execute, FIVE, gameOf, investigate, range, sum, term } from "./votesTestRounds";

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

describe("computePowers: executions, vetoes and survival", () => {
  const hunted = gameOf(FIVE, [term(1, 0, 1, ALL, [], execute(0, 3, "FASCIST")),
    term(2, 1, 2, [0, 1, 2, 4], [], execute(1, 4, "HITLER"))], { outcome: "HITLER_EXECUTED" });
  const purged = gameOf(FIVE, [term(1, 3, 1, ALL, [], execute(3, 0, "LIBERAL")),
    term(2, 4, 1, [1, 2, 3, 4], [], execute(4, 3, "FASCIST"))], { outcome: "FASCIST_POLICIES" });

  it("counts executions, their targets, Hitler and who went first", () => {
    const p = computePowers([hunted, purged]).byPlayer;
    expect(p.get(1)).toMatchObject({ executions: 1, fascistTargets: { LIBERAL: { hits: 1, chances: 1 } }, timesExecuted: 1, executedFirst: 1 });
    expect(p.get(2)).toMatchObject({ executions: 1, hitlerExecuted: 1, fascistTargets: { LIBERAL: { hits: 1, chances: 1 } }, timesExecuted: 0 });
    expect(p.get(4)).toMatchObject({ executions: 1, fascistTargets: { FASCIST: { hits: 0, chances: 1 } }, timesExecuted: 2, executedFirst: 1 });
    expect(p.get(5)).toMatchObject({ executions: 1, hitlerExecuted: 0, fascistTargets: { FASCIST: { hits: 1, chances: 1 } },
      timesExecuted: 1, executedFirst: 0 });
  });

  it("splits survival by role", () => {
    const p = computePowers([hunted, purged]).byPlayer;
    expect(p.get(1)).toMatchObject({ survival: { hits: 1, chances: 2, value: null }, survivalByRole: { LIBERAL: { hits: 1, chances: 2 } } });
    expect(p.get(2)!.survival).toMatchObject({ hits: 2, chances: 2 });
    expect(p.get(4)!.survivalByRole.FASCIST).toMatchObject({ hits: 0, chances: 2 });
    expect(p.get(5)!.survivalByRole.HITLER).toMatchObject({ hits: 1, chances: 2 });
  });

  it("gives survival its value from five games", () => {
    const games = range(0, 5).map((i) => gameOf(FIVE, [term(1, 3, 1, ALL, [], i === 0 ? execute(3, 0, "LIBERAL") : {})]));
    expect(computePowers(games).byPlayer.get(1)!.survival).toEqual({ hits: 4, chances: 5, value: 0.8 });
  });

  it("splits a president's veto answers by role", () => {
    const g = gameOf(FIVE, [term(1, 0, 1, ALL, [], { veto: true }), term(2, 1, 2, ALL, [], { veto: false }),
      term(3, 3, 0, ALL, [], { veto: true }), term(4, 0, 1, ALL, [], { veto: false })]);
    const none = { accepted: 0, refused: 0 };
    const p = computePowers([g]).byPlayer;
    expect(p.get(1)!.vetoes).toEqual({ LIBERAL: { accepted: 1, refused: 1 }, FASCIST: none, HITLER: none });
    expect(p.get(2)!.vetoes.LIBERAL).toEqual({ accepted: 0, refused: 1 });
    expect(p.get(4)!.vetoes.FASCIST).toEqual({ accepted: 1, refused: 0 });
    expect(p.get(5)!.vetoes).toEqual({ LIBERAL: none, FASCIST: none, HITLER: none });
  });

  it("counts what a CPU seat did to a person, and never the CPU seat", () => {
    const g = gameOf(FIVE, [term(1, 1, 0, ALL, [], investigate(1, 0, "LIBERAL")), term(2, 0, 2, ALL, [], investigate(0, 1, "LIBERAL")),
      term(3, 1, 2, ALL, [], execute(1, 0, "LIBERAL"))], { players: [1, null, 3, 4, 5] });
    const p = computePowers([g]).byPlayer;
    expect([...p.keys()].sort((a, b) => a - b)).toEqual([1, 3, 4, 5]);
    expect(p.get(1)).toMatchObject({ investigations: 1, saw: { LIBERAL: 1 }, timesInvestigated: { LIBERAL: 1 },
      timesExecuted: 1, executedFirst: 1, survival: { hits: 0, chances: 1 } });
    expect(p.get(1)!.investigatedPlayers.size).toBe(0);
  });

  it("counts investigations of CPU seats apart from the players'", () => {
    const g = gameOf(FIVE, [term(1, 0, 1, ALL, [], investigate(0, 4, "FASCIST")), term(2, 0, 1, ALL, [], investigate(0, 1, "LIBERAL")),
      term(3, 0, 2, ALL, [], investigate(0, 4, "FASCIST"))], { players: [1, 2, 3, 4, null] });
    const p = computePowers([g]).byPlayer.get(1)!;
    expect(p).toMatchObject({ investigations: 3, investigatedCpu: 2 });
    expect([...p.investigatedPlayers]).toEqual([[2, 1]]);
  });

  it("credits a death before a late record's start as an execution, and first only when it is the one", () => {
    /** A record that starts late, `dead` ending dead with no recorded execution. */
    const late = (dead: number[], ...terms: GameEvent[][]): GameRecord => {
      const g = gameOf(FIVE, terms);
      return { ...g, complete: false, seats: g.seats.map((seat, i) => (dead.includes(i) ? { ...seat, alive: false } : seat)) };
    };
    const one = computePowers([late([2], term(4, 0, 1, ALL, [], execute(0, 3, "FASCIST")))]).byPlayer;
    expect([3, 4].map((n) => [one.get(n)!.timesExecuted, one.get(n)!.executedFirst])).toEqual([[1, 1], [1, 0]]);
    expect(one.get(1)!.executions).toBe(1);
    const two = computePowers([late([1, 2], term(4, 0, 3, ALL, []))]).byPlayer;
    expect([2, 3].map((n) => [two.get(n)!.timesExecuted, two.get(n)!.executedFirst])).toEqual([[1, 0], [1, 0]]);
    const none = computePowers([late([], term(4, 0, 1, ALL, [], execute(0, 3, "FASCIST")))]).byPlayer;
    expect(none.get(4)).toMatchObject({ timesExecuted: 1, executedFirst: 1 });
  });

  it("agrees with the contract fixture's raw events, and 1,000 games take under a second", () => {
    const counted = countedGames(parseStatsData(fixture).games, DEFAULT_FILTER);
    expect(counted.length).toBeGreaterThan(0);
    const human = (g: GameRecord, seat: number) => g.seats[seat].player !== null;
    const all = [...computePowers(counted).byPlayer.values()];
    expect(sum(all, (v) => v.executions)).toBe(eventsOf(counted, "execute").filter(({ g, e }) => human(g, e.seat)).length);
    expect(sum(all, (v) => v.timesExecuted)).toBe(eventsOf(counted, "execute").filter(({ g, e }) => human(g, e.target)).length);
    expect(sum(all, (v) => v.investigations)).toBe(eventsOf(counted, "investigate").filter(({ g, e }) => human(g, e.seat)).length);
    expect(sum(all, (v) => sum(Object.values(v.timesInvestigated), (n) => n)))
      .toBe(eventsOf(counted, "investigate").filter(({ g, e }) => human(g, e.target)).length);
    expect(sum(all, (v) => v.executedFirst)).toBe(counted.filter((g) => {
      const first = eventsOf([g], "execute")[0];
      return first !== undefined && human(g, first.e.target);
    }).length);
    for (const v of all) {
      expect(v.saw.LIBERAL + v.saw.FASCIST).toBe(v.investigations);
      expect(v.survival.chances).toBe(v.games);
      expect(sum(Object.values(v.survivalByRole), (r) => r.chances)).toBe(v.games);
    }
    const many = range(0, 1000).map((i) => counted[i % counted.length]);
    const { ms } = timeOnThread(() => {
      computeVotes(many);
      computePowers(many);
    });
    expect(ms).toBeLessThan(1000);
  });
});
