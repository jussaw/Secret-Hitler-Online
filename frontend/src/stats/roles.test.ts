import { describe, expect, it } from "vitest";
import { countedGames, humanSeats, MIN_GAMES, rate } from "./counting";
import fixture from "./fixtures/recorded-games.json";
import { parseStatsData, type GameEvent, type GameRecord, type Role, type Side } from "./record";
import { computeRoles, LIBERAL_SEATS, TABLE_SIZES } from "./roles";
import { game, ROLES, seatsOf } from "./testGames";

const T0 = Date.UTC(2026, 10, 1, 20, 0);

/** An n-seat table's roles with `first` in seat 0, then the rest in the order Liberals, Fascists, Hitler. */
function table(n: number, first: Role): Role[] {
  const rest = [...ROLES[n]];
  rest.splice(rest.indexOf(first), 1);
  return [first, ...rest];
}

/**
 * Game `g<i>`, ended `i` hours after T0, of `roles` with players 1…n in seats 0…n−1 unless
 * `extra.players` says otherwise; `extra.events` and `extra.complete` replace the record's.
 */
function play(
  i: number,
  roles: Role[],
  winner: Side,
  extra: { players?: (number | null)[]; events?: GameEvent[]; complete?: boolean } = {}
): GameRecord {
  const players = extra.players ?? roles.map((_, s) => s + 1);
  const overrides: Partial<GameRecord> = {};
  if (extra.events !== undefined) overrides.events = extra.events;
  if (extra.complete !== undefined) overrides.complete = extra.complete;
  return game(`g${i}`, T0 + i * 3_600_000, seatsOf(players, roles), winner, overrides);
}

const SIX: Role[] = ["LIBERAL", "LIBERAL", "FASCIST", "HITLER", "LIBERAL", "LIBERAL"];
const six = () => SIX.map((first, i) => play(i + 1, table(5, first), "LIBERAL"));

describe("computeRoles", () => {
  it("splits each player's games by role, Fascist apart from Hitler", () => {
    const ann = computeRoles(six()).byPlayer.get(1)!;
    expect(ann.games).toBe(6);
    expect(ann.split).toEqual({
      LIBERAL: rate(4, 6, MIN_GAMES),
      FASCIST: rate(1, 6, MIN_GAMES),
      HITLER: rate(1, 6, MIN_GAMES),
    });
  });

  it("counts times as Hitler", () => {
    const { byPlayer } = computeRoles(six());
    expect([1, 4, 5].map((p) => byPlayer.get(p)!.split.HITLER.hits)).toEqual([1, 0, 5]);
  });

  it("leaves a share unset below MIN_GAMES", () => {
    expect(computeRoles(six().slice(0, 4)).byPlayer.get(1)!.split.LIBERAL).toEqual({ hits: 2, chances: 4, value: null });
  });

  it("measures role luck against each table size's Liberal seats", () => {
    const firsts: Role[] = ["LIBERAL", "FASCIST", "LIBERAL", "LIBERAL", "HITLER", "LIBERAL"];
    const counted = TABLE_SIZES.map((n, i) => play(i + 1, table(n, firsts[i]), "LIBERAL"));
    const ann = computeRoles(counted).byPlayer.get(1)!;
    expect(ann.expectedLiberalGames).toBeCloseTo(3.61865, 4); // 3/5 + 4/6 + 4/7 + 5/8 + 5/9 + 6/10
    expect(ann.luck).toBeCloseTo(0.06356, 4); // 4/6 − 3.61865/6
    expect(computeRoles(counted.slice(0, 4)).byPlayer.get(1)!.luck).toBeNull();
  });

  it("finds the longest run of one role, the later run on a tie", () => {
    const firsts: Role[] = ["LIBERAL", "LIBERAL", "FASCIST", "FASCIST", "FASCIST", "LIBERAL", "LIBERAL", "LIBERAL"];
    const { byPlayer } = computeRoles(firsts.map((first, i) => play(i + 1, table(5, first), "LIBERAL")));
    expect(byPlayer.get(1)!.longestRun).toEqual({ role: "LIBERAL", length: 3 });
    expect(byPlayer.get(5)!.longestRun).toEqual({ role: "HITLER", length: 8 });
  });

  it("does not break a run on a game the player missed", () => {
    const counted = [
      play(1, table(5, "LIBERAL"), "LIBERAL"),
      play(2, table(5, "LIBERAL"), "LIBERAL"),
      play(3, table(5, "FASCIST"), "LIBERAL", { players: [9, 2, 3, 4, 5] }),
      play(4, table(5, "LIBERAL"), "LIBERAL"),
    ];
    expect(computeRoles(counted).byPlayer.get(1)!.longestRun).toEqual({ role: "LIBERAL", length: 3 });
  });

  it("gives CPU seats no stats and counts their games for the humans", () => {
    const { byPlayer } = computeRoles([play(1, table(5, "LIBERAL"), "LIBERAL", { players: [1, null, null, 2, 3] })]);
    expect(Array.from(byPlayer.keys()).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(byPlayer.get(2)!.games).toBe(1);
  });

  it("agrees with the contract fixture", () => {
    const { games } = parseStatsData(fixture);
    for (const record of games) {
      const liberals = record.seats.filter((seat) => seat.role === "LIBERAL").length;
      expect(liberals, record.id).toBe(LIBERAL_SEATS[record.seats.length]);
    }
    const counted = countedGames(games, { players: null, cpu: true });
    const { byPlayer } = computeRoles(counted);
    const played = Array.from(byPlayer.values()).reduce((sum, p) => sum + p.games, 0);
    expect(played).toBe(counted.reduce((sum, g) => sum + humanSeats(g).length, 0));
    for (const [player, p] of byPlayer) {
      expect(p.split.LIBERAL.hits + p.split.FASCIST.hits + p.split.HITLER.hits, `player ${player}`).toBe(p.games);
    }
  });
});
