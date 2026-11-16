import { describe, expect, it } from "vitest";
import { countedGames, humanSeats, MIN_GAMES, rate } from "./counting";
import fixture from "./fixtures/recorded-games.json";
import { ev } from "./game/sampleGames";
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

/**
 * Round 1's nomination by `president` of the next seat and its election, passed unless `failed`;
 * a failed one is followed by the tracker's move and round 2's passed nomination by the next seat.
 */
function opening(president: number, failed = false): GameEvent[] {
  const next = (president + 1) % 5;
  const events: GameEvent[] = [ev.nominate(1, 1_000, president, next), ev.election(1, 9_000, !failed, failed ? 1 : 4, failed ? 4 : 1)];
  if (failed) {
    events.push(ev.tracker(1, 9_000, 1), ev.nominate(2, 12_000, next, (next + 1) % 5), ev.election(2, 20_000, true, 4, 1));
  }
  return events;
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

  it("knows the Liberal seats of every table size", () => {
    expect(Object.keys(LIBERAL_SEATS).map(Number)).toEqual([...TABLE_SIZES]);
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

  it("win rates by role need MIN_GAMES each", () => {
    const counted = [
      ...[1, 2, 3, 4, 5, 6].map((i) => play(i, table(5, "LIBERAL"), i <= 4 ? "LIBERAL" : "FASCIST")),
      ...[7, 8, 9, 10, 11].map((i) => play(i, table(5, "FASCIST"), i <= 8 ? "FASCIST" : "LIBERAL")),
      ...[12, 13].map((i) => play(i, table(5, "HITLER"), "FASCIST")),
    ];
    const { winAs } = computeRoles(counted).byPlayer.get(1)!;
    expect(winAs).toEqual({
      LIBERAL: rate(4, 6, MIN_GAMES),
      FASCIST: rate(2, 5, MIN_GAMES),
      HITLER: rate(2, 2, MIN_GAMES),
    });
    expect(winAs.FASCIST.value).toBe(0.4);
    expect(winAs.HITLER.value).toBeNull();
  });

  it("win rate by player count, MIN_GAMES per size", () => {
    const counted = [
      ...[1, 2, 3, 4, 5].map((i) => play(i, table(5, "LIBERAL"), i <= 3 ? "LIBERAL" : "FASCIST")),
      ...[6, 7].map((i) => play(i, table(7, "LIBERAL"), i === 6 ? "LIBERAL" : "FASCIST")),
    ];
    const { bySize } = computeRoles(counted).byPlayer.get(1)!;
    expect(bySize.get(5)).toEqual(rate(3, 5, MIN_GAMES));
    expect(bySize.get(5)!.value).toBe(0.6);
    expect(bySize.get(7)).toEqual({ hits: 1, chances: 2, value: null });
    expect(bySize.has(6)).toBe(false);
  });

  it("first president: their seat made the first nomination, failed or not, in complete games only", () => {
    const counted = [
      ...[1, 2, 3, 4, 5].map((i) => play(i, table(5, "LIBERAL"), i <= 3 ? "LIBERAL" : "FASCIST", { events: opening(0) })),
      play(6, table(5, "LIBERAL"), "FASCIST", { events: opening(0, true) }),
      play(7, table(5, "LIBERAL"), "LIBERAL", { events: opening(0), complete: false }),
    ];
    const { byPlayer } = computeRoles(counted);
    expect(byPlayer.get(1)!.firstPresident).toEqual(rate(3, 6, MIN_GAMES));
    expect(byPlayer.get(1)!.firstPresident.value).toBe(0.5);
    expect(byPlayer.get(2)!.firstPresident).toEqual(rate(0, 0, MIN_GAMES));
  });
});
