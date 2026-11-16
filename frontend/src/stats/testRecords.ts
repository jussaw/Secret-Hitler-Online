import type { GameRecord, Player, Role, Seat, StatsData } from "./record";

/**
 * Builders of records for the stats' unit tests (never imported by the page). Later phases add
 * their own builders in their own test files, not here.
 */

/**
 * Seats with the given roles, in turn order. Seat `i` is player `players[i]` when `players` gives
 * one (null for a CPU seat), else player `i + 1`; a player's seat is named `P<number>`, the k-th
 * CPU seat `Bot <k>`; everyone is alive.
 */
export function makeSeats(roles: Role[], players?: (number | null)[]): Seat[] {
  let bots = 0;
  return roles.map((role, i) => {
    const player = players !== undefined && i < players.length ? players[i] : i + 1;
    const cpu = player === null;
    const name = cpu ? `Bot ${++bots}` : `P${player}`;
    return { player, name, cpu, role, alive: true };
  });
}

/**
 * A finished five-seat record, `game-1`: started on Sat 14 Nov 2026 at 9:42 PM local time, 38
 * minutes long, won by the Liberals with 5 Liberal and 2 Fascist policies in 9 rounds, players 1
 * to 5 seated (player 5 Hitler), with a lone `end` event. `overrides` replace fields whole.
 */
export function makeRecord(overrides: Partial<GameRecord> = {}): GameRecord {
  const startedAt = new Date(2026, 10, 14, 21, 42).getTime();
  return {
    id: "game-1",
    format: 1,
    startedAt,
    endedAt: startedAt + 38 * 60_000,
    outcome: "LIBERAL_POLICIES",
    winner: "LIBERAL",
    complete: true,
    hasCpu: false,
    liberalPolicies: 5,
    fascistPolicies: 2,
    rounds: 9,
    seats: makeSeats(["LIBERAL", "LIBERAL", "FASCIST", "LIBERAL", "HITLER"]),
    events: [{ type: "end", t: 2_280_000, r: 9, outcome: "LIBERAL_POLICIES" }],
    ...overrides,
  };
}

/**
 * A response of `games`, with `players` by default every player seated in them, named
 * `P<number>`, in ascending order.
 */
export function makeData(games: GameRecord[], players?: Player[]): StatsData {
  if (players === undefined) {
    const numbers = new Set<number>();
    for (const game of games) {
      for (const seat of game.seats) {
        if (seat.player !== null) numbers.add(seat.player);
      }
    }
    players = Array.from(numbers)
      .sort((a, b) => a - b)
      .map((number) => ({ number, name: `P${number}` }));
  }
  return { players, games };
}
